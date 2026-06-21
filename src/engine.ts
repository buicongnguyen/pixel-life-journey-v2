import type {
  Gender,
  HistoryEntry,
  HouseTier,
  LifeOption,
  Occupation,
  OptionCategory,
  Partner,
  PersonKind,
  Stats,
  StatKey,
  UpperSceneKind,
  VehicleTier,
} from "./types";
import {
  START_STATS,
  START_MONEY,
  START_WEIGHT,
  START_MUSCLE,
  START_NUTRITION,
  START_MENTAL,
  STAT_KEYS,
  STAT_META,
  applyEffects,
  clampStat,
  clampIq,
  composeHealth,
  crossEffects,
  ageMaturity,
  dampIqGain,
  activityDiscount,
  lifeExpectancy,
  moneyHappinessBias,
  formatMoney,
  weightColor,
  weightHealthDrain,
  weightStatus,
} from "./stats";
import { STAGES } from "./stages";
import { PARTNERS } from "./partners";
import { OCCUPATIONS, TIER_LABELS } from "./occupations";
import { HOUSE_TIERS } from "./houses";
import { VEHICLES } from "./vehicles";
import { COMMUTES, type CommuteTier } from "./commutes";
import { EVENTS, type RandomEvent } from "./events";
import {
  type Biography,
  type BioChapter,
  listBios,
  saveBio,
  deleteBio,
  getBio,
  bioMomentCount,
  MOMENT_PRESETS,
  makeMoment,
  newBiography,
} from "./biography";
import { avatarLook, drawAvatar, drawEventItem, drawPerson, drawRoom, drawStation, type AvatarFacing } from "./sprites";
import { createUI, type UIRefs } from "./ui";
import { generateStory, type CauseOfEnd, type LifeStory } from "./story";

const W = 640;
const H = 800; // a tall room with only a thin sky strip above the playfield
const FLOOR_Y = 72; // sky-only non-playable band; ground starts right below it
const DOOR_X = W - 74;
const GATE_HALF_H = 86;
const SPEED = 205; // base move speed (scaled up by your IQ — smart = nimble)
const PY_MIN = 142; // feet stay on ground while the sky remains scenic only
const PY_MAX = 782;
const SOCIAL_Y_MIN = PY_MIN + 48;
const FAMILY_Y_MAX = PY_MAX - 24;
const ZONE_GATE_GAP = 48;
const MIN_ZONE_HEIGHT = 118;
// --- moving-items mechanic ---
const GOOD_SPEED = 24; // common good items drift AWAY; touch them to collect
const BAD_SPEED = 34; // bad items drift TOWARD you (auto-applied on contact)
const BAD_EVENT_ALERT_R = 185; // bad-luck hazards wake up only when you get close
const ITEM_R = 26; // contact / collect radius
const BLOCK_R = 30; // an NPC standing in the path blocks a bad item
const SATIATE_TIME = 9; // seconds a bad item stays frozen/faded after you do its good counterpart
const BABY_FAMILY_SIT_R = 92; // newborn family sits only when the baby crawls right up to them
const BAD_SOCIAL_TAGS = ["smoker_friend", "gangster_friend", "playboy_friend"];
const INVENTORY_MAX_SLOTS = 8;
const INVENTORY_MAX_COUNT = 9;
const FOOD_USE_COOLDOWN = 5;
const CAREER_INDEX = STAGES.findIndex((s) => s.id === "career");
const BAD_FIT_TAGS = ["sedentary", "gaming", "screen", "toy_phone", "cigarette"];
const BAD_FOCUS_TAGS = ["wine", "whisky"];
const GOOD_PEER_TAGS = ["study", "sports", "exercise", "friends"];
const FAMILY_MONEY_MIN = 10000;
const FAMILY_MONEY_MAX = 2000000;
const FAMILY_MONEY_SKEW = 3.25; // higher = richer births are rarer
const PARENT_SUPPORT_END_AGE = 18;
const PARENT_SUPPORT_MIN = 800;
const PARENT_SUPPORT_MAX = 160000;
const PARENT_INCOME_SHIFT_MIN = 0.1;
const PARENT_INCOME_SHIFT_MAX = 0.5;

type Mode =
  | "title"
  | "setup"
  | "playing"
  | "partner"
  | "occupation"
  | "house"
  | "vehicle"
  | "commute"
  | "timetravel"
  | "transition"
  | "ending"
  | "biolist"
  | "bioauthor"
  | "profile"
  | "careermove"
  | "settings";

type StationKind = "good" | "bad" | "person" | "neutral" | "event";
type StationZone = "social" | "family";

interface Station {
  x: number;
  y: number;
  opt: LifeOption;
  kind: StationKind;
  zone: StationZone;
  /** For surprise world pickups/hazards spawned from events.ts. */
  event?: RandomEvent;
  /** For bad items: which good category satiates it (diet = food, fit = activity). */
  guard?: string;
  /** Seconds before a bad item can catch you again after a contact. */
  contactCd: number;
  /** For bad items: seconds you're "full" of it — it freezes and fades while >0. */
  satiated: number;
}

interface InventorySlot {
  opt: LifeOption;
  count: number;
}

/** A rewindable snapshot of the whole life, captured at each stage's start. */
interface Snapshot {
  stageIndex: number;
  age: number;
  gender: Gender;
  stats: Stats;
  money: number;
  weight: number;
  muscle: number;
  nutrition: number;
  mental: number;
  partnerId: string | null;
  occupationId: string | null;
  commute: string | null;
  lifetimeEarned: number;
  connections: number;
  familyFund: number;
  parentAnnualSupport: number;
  homeQuality: number;
  homeIds: string[];
  hadChild: boolean;
  familyBond: number;
  spouseDeceased: boolean;
  habitCount: number;
  investments: number;
  moneyWise: boolean;
  iqCeiling: number;
  geneBonus: number;
  owned: string[];
  jobsTaken: string[];
  usedEvents: string[];
  inventory: InventorySlot[];
  selectedInventory: number;
  bigFired: boolean;
  jackpotFired: boolean;
  petAdopted: boolean;
  eventsLog: string[];
  healthSum: number;
  happinessSum: number;
  smartsSum: number;
  healthCount: number;
  historyLen: number;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export class Game {
  private ui: UIRefs;
  private mode: Mode = "title";
  private stageIndex = 0;
  private stats: Stats = { ...START_STATS };
  private age = 0;
  private gender: Gender = "male";
  private weight = START_WEIGHT;
  private money = START_MONEY; // real dollars (bank balance), can grow large
  // the three pillars of Health (each 0..100) — health is composed from them
  private muscle = START_MUSCLE; // fitness/strength: gym, sports, exercise
  private nutrition = START_NUTRITION; // diet quality: good food up, junk down
  private mental = START_MENTAL; // mental wellbeing: family/friends + happiness
  private occupation: Occupation | null = null;
  private commute: string | null = null; // chosen commute (career selection stage)
  private playerName = ""; // optional name for the LinkedIn-style career profile
  private lifetimeEarned = 0; // total dollars earned from work over the whole life
  private connections = 0; // professional network — grown by coworkers & networking
  private familyFund = START_MONEY; // family resources rolled at birth
  private parentAnnualSupport = 0; // yearly support from Mommy & Daddy until adulthood
  private homeQuality = 0;
  private homes: HouseTier[] = []; // every property bought; you live in the best one
  private houseUpkeep = 0; // per-action dollar drain from your home (mortgage/upkeep)
  private rentalIncome = 0; // per-stage dollars from spare homes rented out
  private investments = 0; // dollars in the market — compounds over the stages
  private moneyWise = false; // learned money management → better, steadier returns
  private iqCeiling = 100; // lifelong IQ potential, rolled at birth
  private geneBonus = 0; // longevity genetics (-5..+5 yrs), rolled at birth
  private familyBond = 0; // time invested in family — unlocks grandkids later
  private owned = new Set<string>(); // one-off, owned-for-life purchases (vehicles, skills)
  private jobsTaken = new Set<string>(); // occupations whose one-off perks were already granted this life
  private bigFired = false; // a "big" windfall already happened (1/life)
  private jackpotFired = false; // a jackpot already happened (1/life total)
  private petAdopted = false; // adopted a pet (1/life)
  private spouseDeceased = false;
  private habitCount = 0;
  private eventCooldown = 2;
  private usedEvents = new Set<string>();
  private eventsLog: string[] = [];
  private timeline: Snapshot[] = [];
  private history: HistoryEntry[] = [];
  private partner: Partner | null = null;
  private hadChild = false;
  private biography: Biography | null = null; // set when replaying an authored life
  private editBio: Biography | null = null; // the draft being edited in the author
  // the how-to-play guide shows once (then it's tucked away during the game)
  private guideSeen = localStorage.getItem("plj-guide-seen-v1") === "1";

  private healthSum = 0;
  private happinessSum = 0;
  private smartsSum = 0;
  private healthCount = 0;

  private usedOnce = new Set<string>();
  private stations: Station[] = [];
  private people: Station[] = []; // cached person stations (block bad items)
  private floats: FloatText[] = [];
  private focusIndex = -1;

  private px = 46;
  private py = 450;
  private walkPhase = 0;
  private moving = false;
  private facing: AvatarFacing = "front";
  private verticalBias = 0;
  private cooldown = 0;
  private foodCooldown = 0;
  private hintTimer = 0;

  private transitionTimer = 0;
  private transitionNext = 0;

  private story: LifeStory | null = null;
  private inventory: InventorySlot[] = [];
  private selectedInventory = 0;

  private input = { left: false, right: false, up: false, down: false };
  private actQueued = false;
  private lastTime = 0;
  private renderTime = 0;
  private frameErrors = 0;

  constructor(mount: HTMLElement) {
    this.ui = createUI(mount);
    this.bindInput();
    this.showTitle();
    this.renderInventory();
    requestAnimationFrame(this.frame);
    // Debug handle for headless verification (mirrors other games' debug APIs).
    (window as unknown as { __pixelLife: Game }).__pixelLife = this;
  }

  /** Test/debug snapshot of the live game state. */
  debugState() {
    return {
      mode: this.mode,
      stage: STAGES[this.stageIndex]?.id,
      upperScene: this.upperScene(),
      age: Math.round(this.age * 10) / 10,
      familyZoneShare: this.familyZoneShare(),
      zoneSplitY: this.zoneSplitY(),
      lifeExp: this.lifeExp(),
      stats: { ...this.stats },
      px: Math.round(this.px),
      py: Math.round(this.py),
      focus: this.focusIndex >= 0 ? this.stations[this.focusIndex]?.opt.id : null,
      partner: this.partner?.id ?? null,
      gender: this.gender,
      facing: this.facing,
      weight: Math.round(this.weight),
      health: Math.round(this.stats.health),
      muscle: Math.round(this.muscle),
      nutrition: Math.round(this.nutrition),
      mental: Math.round(this.mental),
      occupation: this.occupation?.id ?? null,
      commute: this.commute,
      lifetimeEarned: Math.round(this.lifetimeEarned),
      connections: this.connections,
      money: Math.round(this.money),
      netWorth: Math.round(this.netWorth()),
      familyFund: Math.round(this.familyFund),
      parentAnnualSupport: Math.round(this.parentAnnualSupport),
      iq: Math.round(this.stats.smarts),
      iqCeiling: this.iqCeiling,
      geneBonus: this.geneBonus,
      familyBond: this.familyBond,
      homeQuality: this.homeQuality,
      homes: this.homes.map((h) => h.id),
      houseUpkeep: Math.round(this.houseUpkeep),
      rentalIncome: this.rentalIncome,
      investments: Math.round(this.investments),
      moneyWise: this.moneyWise,
      owned: [...this.owned],
      habitCount: this.habitCount,
      caps: { bigFired: this.bigFired, jackpotFired: this.jackpotFired, petAdopted: this.petAdopted },
      events: [...this.eventsLog],
      eventItems: this.stations
        .filter((s) => s.kind === "event" && s.event)
        .map((s) => ({
          id: s.event!.id,
          title: s.event!.title,
          good: s.event!.good !== false,
          x: Math.round(s.x),
          y: Math.round(s.y),
        })),
      inventory: this.inventory.map((slot, i) => ({
        id: slot.opt.id,
        label: slot.opt.label,
        icon: slot.opt.icon,
        count: slot.count,
        selected: i === this.selectedInventory,
      })),
      foodCooldown: Math.round(this.foodCooldown * 10) / 10,
      timelineLen: this.timeline.filter(Boolean).length,
      historyLen: this.history.length,
    };
  }

  /** Test/debug: force a random event item (by id, or a default eligible one). */
  debugFireEvent(id?: string): string | null {
    const e = id ? EVENTS.find((x) => x.id === id) : EVENTS[0];
    if (!e || this.mode !== "playing") return null;
    this.spawnEventItem(e);
    return e.id;
  }

  /** Test/debug: collect a visible event item immediately. */
  debugCollectEvent(id?: string): string | null {
    const st = this.stations.find((s) => s.kind === "event" && s.event && (!id || s.event.id === id));
    if (!st || this.mode !== "playing") return null;
    const eventId = st.event!.id;
    this.collectEventItem(st);
    return eventId;
  }

  /** Test/debug: choose an option by id in the current stage (ignores position). */
  debugChoose(optId: string): void {
    const idx = this.stations.findIndex((s) => s.opt.id === optId);
    if (idx < 0) return;
    this.focusIndex = idx;
    this.cooldown = 0;
    this.doAction();
  }

  /** Test/debug: pick a partner / occupation / house / vehicle / commute / rewind by id. */
  debugPick(kind: "partner" | "occupation" | "house" | "vehicle" | "commute" | "rewind", id: string): void {
    if (kind === "partner") {
      const p = PARTNERS.find((x) => x.id === id);
      if (p) this.pickPartner(p);
    } else if (kind === "occupation") {
      const o = OCCUPATIONS.find((x) => x.id === id);
      if (o) this.pickOccupation(o);
    } else if (kind === "house") {
      const h = HOUSE_TIERS.find((x) => x.id === id);
      if (h) this.buyHouse(h);
    } else if (kind === "vehicle") {
      const v = VEHICLES.find((x) => x.id === id);
      if (v) this.buyVehicle(v);
    } else if (kind === "commute") {
      const c = COMMUTES.find((x) => x.id === id);
      if (c) this.pickCommute(c);
    } else if (kind === "rewind") {
      this.rewind(Number(id));
    }
  }

  // --- lifecycle ------------------------------------------------------------

  private newGame(keepBiography = false): void {
    if (!keepBiography) this.biography = null; // normal play is never a replay
    this.stats = { ...START_STATS };
    this.age = 0;
    this.weight = START_WEIGHT;
    this.familyFund = this.rollFamilyMoney();
    this.parentAnnualSupport = this.rollParentSupport(this.familyFund);
    this.money = this.familyFund;
    this.muscle = START_MUSCLE;
    this.nutrition = START_NUTRITION;
    this.mental = START_MENTAL;
    this.recomputeHealth();
    this.occupation = null;
    this.commute = null;
    this.homeQuality = 0;
    this.homes = [];
    this.houseUpkeep = 0;
    this.rentalIncome = 0;
    this.investments = 0;
    this.moneyWise = false;
    // roll a lifelong IQ potential (mean 100, sd 15, clamped) + a rare gifted bump
    this.iqCeiling = Math.max(70, Math.min(145, Math.round(gaussian(100, 15))));
    if (Math.random() < 0.02) this.iqCeiling = 150 + Math.floor(Math.random() * 11); // ~2% gifted (150-160)
    this.geneBonus = Math.round((Math.random() * 10 - 5) * 10) / 10; // longevity genes -5..+5
    this.familyBond = 0;
    this.lifetimeEarned = 0;
    this.connections = 0;
    this.owned = new Set();
    this.jobsTaken = new Set();
    this.bigFired = false;
    this.jackpotFired = false;
    this.petAdopted = false;
    this.spouseDeceased = false;
    this.habitCount = 0;
    this.eventCooldown = 2;
    this.foodCooldown = 0;
    this.usedEvents = new Set();
    this.inventory = [];
    this.selectedInventory = 0;
    this.eventsLog = [];
    this.timeline = [];
    this.history = [];
    this.partner = null;
    this.hadChild = false;
    this.healthSum = 0;
    this.happinessSum = 0;
    this.smartsSum = 0;
    this.healthCount = 0;
    this.floats = [];
    this.story = null;
    this.renderInventory();
    this.sampleHealth();
    this.loadStage(0);
    this.hint(`👪 Family start: ${formatMoney(this.familyFund)}. Mommy & Daddy support: ~${formatMoney(this.parentAnnualSupport)}/yr.`);
  }

  private loadStage(i: number, restoring = false): void {
    this.stageIndex = i;
    const s = STAGES[i];
    this.usedOnce.clear();
    this.age = Math.max(this.age, s.ageStart);
    this.px = 70;
    this.py = 500;
    this.focusIndex = -1;
    this.buildStations();
    this.renderFocusPanel(); // reset the panel to the default prompt on stage entry
    this.renderInventory();
    // On a rewind the running averages + entry snapshot were just restored from
    // timeline[i] (which already counts this entry's sample) — re-sampling and
    // re-snapshotting here would double-count it and drift life expectancy.
    if (!restoring) {
      this.sampleHealth();
      this.timeline[i] = this.snapshot(); // capture entry state for time travel
    }
    // a biography replays an authored life — no occupation/marriage pickers
    if (!this.biography && s.isMarriage && !this.partner) {
      this.mode = "partner";
      this.showPartner();
    } else if (!this.biography && s.isCareer && !this.occupation) {
      this.mode = "occupation";
      this.showOccupation();
    } else {
      this.mode = "playing";
      this.clearOverlay();
    }
  }

  private snapshot(): Snapshot {
    return {
      stageIndex: this.stageIndex,
      age: this.age,
      gender: this.gender,
      stats: { ...this.stats },
      money: this.money,
      weight: this.weight,
      muscle: this.muscle,
      nutrition: this.nutrition,
      mental: this.mental,
      partnerId: this.partner?.id ?? null,
      occupationId: this.occupation?.id ?? null,
      commute: this.commute,
      lifetimeEarned: this.lifetimeEarned,
      connections: this.connections,
      familyFund: this.familyFund,
      parentAnnualSupport: this.parentAnnualSupport,
      homeQuality: this.homeQuality,
      homeIds: this.homes.map((h) => h.id),
      hadChild: this.hadChild,
      familyBond: this.familyBond,
      spouseDeceased: this.spouseDeceased,
      habitCount: this.habitCount,
      investments: this.investments,
      moneyWise: this.moneyWise,
      iqCeiling: this.iqCeiling,
      geneBonus: this.geneBonus,
      owned: [...this.owned],
      jobsTaken: [...this.jobsTaken],
      inventory: this.inventory.map((slot) => ({ opt: slot.opt, count: slot.count })),
      selectedInventory: this.selectedInventory,
      bigFired: this.bigFired,
      jackpotFired: this.jackpotFired,
      petAdopted: this.petAdopted,
      usedEvents: [...this.usedEvents],
      eventsLog: [...this.eventsLog],
      healthSum: this.healthSum,
      happinessSum: this.happinessSum,
      smartsSum: this.smartsSum,
      healthCount: this.healthCount,
      historyLen: this.history.length,
    };
  }

  /** Some NPC options only make sense in context (spouse alive, kids exist…). */
  private optionAvailable(o: LifeOption): boolean {
    if (o.person === "spouse") return !!this.partner && !this.spouseDeceased;
    if (o.person === "child") return this.hadChild;
    // grandkids only appear in old age if you invested time in family earlier
    if (o.person === "grandkid") return this.hadChild && this.familyBond >= 3;
    // one-off purchases/skills disappear once you own them
    if (o.permanent && this.owned.has(o.id)) return false;
    // the vehicle picker hides once you own every vehicle
    if (o.opensVehiclePicker) return VEHICLES.some((v) => !this.owned.has("veh_" + v.id));
    return true;
  }

  /** The stations for the current chapter — a biography's moments, or the defaults. */
  private currentOptions(): LifeOption[] {
    const s = STAGES[this.stageIndex];
    if (this.biography) {
      const ch = this.biography.chapters[s.id];
      if (ch && ch.moments.length) return ch.moments.map((m) => this.sanitizeMoment(m));
      return []; // an authored life with nothing recorded for this chapter — a quiet time
    }
    return s.options.filter((o) => this.optionAvailable(o));
  }

  /** Reduce a loaded biography moment to known-safe fields (localStorage is untrusted,
   *  so it can never carry a house/vehicle picker, a gamble, a cost or a one-off flag). */
  private sanitizeMoment(m: LifeOption): LifeOption {
    return {
      id: String(m.id ?? "bm"),
      label: String(m.label ?? "A moment"),
      icon: String(m.icon ?? "📌"),
      desc: String(m.desc ?? ""),
      category: m.category ?? "special",
      effects: m.effects && typeof m.effects === "object" ? m.effects : {},
      ...(typeof m.earn === "number" && isFinite(m.earn) ? { earn: m.earn } : {}),
      ...(m.person ? { person: m.person } : {}),
      storyTag: "bio_moment",
    };
  }

  /** Sort each choice into a kind: people are static, junk/screen-time CHASE you
   *  (bad), pickers are static (neutral), and free beneficial items FLEE (good). */
  private classifyOption(opt: LifeOption): { kind: StationKind; guard?: string } {
    if (this.isBadSocialOption(opt)) return { kind: "bad", guard: opt.storyTag === "smoker_friend" ? "fit" : "focus" };
    if (opt.person) return { kind: "person" };
    if (opt.opensHousePicker || opt.opensVehiclePicker || opt.opensCareerDesk || opt.gamble || opt.invest || opt.moneyMgmt || opt.category === "special")
      return { kind: "neutral" };
    const t = opt.storyTag;
    if (t === "junkfood") return { kind: "bad", guard: "diet" }; // avoid by eating well
    if (BAD_FIT_TAGS.includes(t ?? "")) return { kind: "bad", guard: "fit" }; // avoid by staying fit
    if (BAD_FOCUS_TAGS.includes(t ?? "")) return { kind: "bad", guard: "focus" }; // avoid by staying grounded
    return { kind: "good" };
  }

  private buildStations(): void {
    const opts = this.currentOptions();
    const xStart = 100;
    const xEnd = W - 120;
    const totals: Record<StationZone, number> = { social: 0, family: 0 };
    for (const opt of opts) totals[this.stationZone(opt)]++;
    const counts: Record<StationZone, number> = { social: 0, family: 0 };
    // Spread choices across each half of the taller room. Common good/bad
    // items get their velocity in moveStations; people and pickers stay put.
    this.stations = opts.map((opt) => {
      const c = this.classifyOption(opt);
      const zone = this.stationZone(opt);
      const zoneIndex = counts[zone]++;
      const zoneTotal = totals[zone];
      const rows = this.zoneRows(zone);
      return {
        x: zoneTotal === 1 ? (xStart + xEnd) / 2 : xStart + ((xEnd - xStart) * zoneIndex) / (zoneTotal - 1),
        y: rows[zoneIndex % rows.length],
        opt,
        kind: c.kind,
        zone,
        guard: c.guard,
        contactCd: 0,
        satiated: 0,
      } as Station;
    });
    this.people = this.stations.filter((s) => s.kind === "person");
  }

  private stationZone(opt: LifeOption): StationZone {
    if (this.isFamilyOption(opt)) return "family";
    if (opt.person) return "social";
    const tag = opt.storyTag ?? "";
    const socialTags = [
      "friends",
      "love",
      "sports",
      "exercise",
      "play_active",
      "travel",
      "party",
      "music",
      "hobby",
      "network",
      "volunteer",
      "date",
      "gamble",
      "cigarette",
      "beer",
      "wine",
      "whisky",
    ];
    if (opt.category === "social" || socialTags.includes(tag)) return "social";
    return "family";
  }

  private isFamilyOption(opt: LifeOption): boolean {
    const familyPeople: PersonKind[] = ["mother", "father", "grandma", "grandpa", "babySibling", "sibling", "spouse", "baby", "child", "grandkid"];
    if (opt.person && familyPeople.includes(opt.person)) return true;
    const tag = opt.storyTag ?? "";
    return tag === "family" || tag === "family_love" || tag === "grandkids" || tag === "toy_doll" || opt.id === "baby";
  }

  private isBadSocialOption(opt: LifeOption): boolean {
    return !!opt.person && !!opt.storyTag && BAD_SOCIAL_TAGS.includes(opt.storyTag);
  }

  private clearsBadPeerPressure(opt: LifeOption): boolean {
    const stage = STAGES[this.stageIndex]?.id;
    return (stage === "high" || stage === "university") &&
      !this.isBadSocialOption(opt) &&
      !!opt.storyTag &&
      GOOD_PEER_TAGS.includes(opt.storyTag);
  }

  private clearBadPeerPressure(): void {
    const removed = this.stations.filter((st) => st.opt.storyTag && BAD_SOCIAL_TAGS.includes(st.opt.storyTag));
    if (removed.length === 0) return;
    for (const st of removed) {
      this.floats.push({ x: st.x, y: st.y - 42, text: "👋 bad crowd left", color: "#7fd0a0", life: 1.5 });
    }
    this.stations = this.stations.filter((st) => !st.opt.storyTag || !BAD_SOCIAL_TAGS.includes(st.opt.storyTag));
    this.people = this.stations.filter((s) => s.kind === "person");
    this.focusIndex = -1;
    this.hint("Good friends pulled you away from the bad crowd.");
  }

  private shouldSitWithNewborn(st: Station): boolean {
    const babyCenterX = this.px;
    const babyCenterY = this.py - 32;
    const dx = babyCenterX - st.x;
    const dy = babyCenterY - st.y;
    return this.stageIndex === 0 &&
      st.kind === "person" &&
      !!st.opt.person &&
      this.isFamilyOption(st.opt) &&
      Math.hypot(dx, dy) <= BABY_FAMILY_SIT_R;
  }

  private zoneRows(zone: StationZone): number[] {
    const bounds = this.zoneBounds(zone);
    return [bounds.min, (bounds.min + bounds.max) / 2, bounds.max];
  }

  private familyZoneShare(): number {
    const id = STAGES[this.stageIndex]?.id;
    if (id === "newborn" || id === "toddler" || id === "early") return 0.64;
    if (id === "elementary" || id === "middle" || id === "high") return 0.54;
    if (id === "university" || id === "career") return 0.34;
    if (id === "marriage" || id === "midlife") return 0.42;
    if (id === "senior" || id === "retirement") return 0.5;
    return 0.5;
  }

  private zoneSplitY(): number {
    const playable = FAMILY_Y_MAX - SOCIAL_Y_MIN;
    return Math.round(FAMILY_Y_MAX - playable * this.familyZoneShare());
  }

  private upperScene(): UpperSceneKind {
    const scenes = STAGES[this.stageIndex]?.upperScenes ?? ["park"];
    if (scenes.length <= 1) return scenes[0] ?? "park";
    return scenes[Math.floor(this.renderTime / 12) % scenes.length];
  }

  private zoneBounds(zone: StationZone): { min: number; max: number } {
    const splitY = this.zoneSplitY();
    if (zone === "social") {
      return { min: SOCIAL_Y_MIN, max: Math.max(SOCIAL_Y_MIN + MIN_ZONE_HEIGHT, splitY - ZONE_GATE_GAP) };
    }
    return { min: Math.min(FAMILY_Y_MAX - MIN_ZONE_HEIGHT, splitY + ZONE_GATE_GAP), max: FAMILY_Y_MAX };
  }

  // --- per-stage balance helpers -------------------------------------------

  private stageStep(): number {
    const s = STAGES[this.stageIndex];
    // a gentle pace — each chapter now gives ~4× the old number of actions, so
    // there's real time to study, exercise, dodge and live before the gate opens.
    return Math.max(0.03, Math.min(0.9, (s.ageEnd - s.ageStart) / 28));
  }

  /** The chapter gate is open once you're old enough — or always, when replaying
   *  a biography (so quiet/short chapters are never a dead end). */
  private doorOpen(): boolean {
    return !!this.biography || this.age >= STAGES[this.stageIndex].ageEnd;
  }

  private nearGate(): boolean {
    return Math.abs(this.py - this.zoneSplitY()) <= GATE_HALF_H;
  }

  /** Higher IQ → faster on your feet, so you can dodge the bad things more easily. */
  private speedFactor(): number {
    return 0.8 + Math.max(0, this.stats.smarts - 40) * 0.005; // iq 40→0.8 … 160→1.4
  }

  private rollFamilyMoney(): number {
    const skewed = Math.pow(Math.random(), FAMILY_MONEY_SKEW);
    const raw = FAMILY_MONEY_MIN + (FAMILY_MONEY_MAX - FAMILY_MONEY_MIN) * skewed;
    return Math.round(raw / 1000) * 1000;
  }

  private rollParentSupport(familyFund: number): number {
    const rate = 0.025 + Math.pow(Math.random(), 1.7) * 0.06;
    const raw = Math.max(PARENT_SUPPORT_MIN, Math.min(PARENT_SUPPORT_MAX, familyFund * rate));
    return Math.round(raw / 100) * 100;
  }

  private applyParentSupportForChapter(cur: (typeof STAGES)[number], lines: string[]): void {
    const endAge = Math.min(cur.ageEnd, PARENT_SUPPORT_END_AGE);
    const years = Math.max(0, endAge - cur.ageStart);
    if (years <= 0 || this.parentAnnualSupport <= 0) return;

    const shiftMagnitude = PARENT_INCOME_SHIFT_MIN + Math.random() * (PARENT_INCOME_SHIFT_MAX - PARENT_INCOME_SHIFT_MIN);
    const shift = (Math.random() < 0.58 ? 1 : -1) * shiftMagnitude;
    this.parentAnnualSupport = Math.round(
      Math.max(PARENT_SUPPORT_MIN, Math.min(PARENT_SUPPORT_MAX, this.parentAnnualSupport * (1 + shift))) / 100
    ) * 100;

    const support = Math.round(this.parentAnnualSupport * years);
    this.money += support;
    lines.push(
      `👪 Mommy & Daddy support: +${formatMoney(support)} over these years. Parent income flow ${shift >= 0 ? "+" : "−"}${Math.round(Math.abs(shift) * 100)}%/yr (now ~${formatMoney(this.parentAnnualSupport)}/yr).`
    );
    this.floats.push({ x: this.px, y: this.py - 104, text: `👪 +${formatMoney(support)}`, color: "#3ddc84", life: 1.6 });
  }

  private idCounter = 0;
  /** A short unique-ish id for biographies and their moments. */
  private uid(): string {
    return Date.now().toString(36) + (this.idCounter++).toString(36) + Math.floor(Math.random() * 1296).toString(36);
  }

  /** Sample Health, Happiness and IQ each action so longevity rewards STEADY stats. */
  private sampleHealth(): void {
    this.healthSum += this.stats.health;
    this.happinessSum += this.stats.happiness;
    this.smartsSum += this.stats.smarts;
    this.healthCount += 1;
  }

  /** Life expectancy from the running averages of Health, Happiness and IQ (+ genes). */
  private lifeExp(): number {
    const n = this.healthCount || 1;
    const le = lifeExpectancy(this.healthSum / n, this.happinessSum / n, this.smartsSum / n) + this.geneBonus;
    return Math.round(Math.max(45, Math.min(120, le)));
  }

  /** Net worth in dollars: cash + the investment pot + property values. */
  private netWorth(): number {
    let nw = this.money + this.investments;
    for (const h of this.homes) nw += h.cost;
    return nw;
  }

  /** Income multiplier from IQ — smart people earn more (1 + 0.012*(IQ-100)). */
  private incomeMul(): number {
    return Math.max(0.3, 1 + 0.012 * (this.stats.smarts - 100));
  }

  /** Recompute the derived Health score (0..120) from its three pillars + weight. */
  private recomputeHealth(): void {
    this.stats.health = composeHealth(this.muscle, this.nutrition, this.mental, this.weight);
  }

  /**
   * Add a health delta to the right pillar — or, for a "split" (general) effect,
   * nudge ALL three pillars by the full delta so the composed Health score moves
   * by exactly that delta (composeHealth's pillar weights sum to 1).
   */
  private routeHealth(h: number, kind: "muscle" | "nutrition" | "mental" | "split"): void {
    if (kind === "muscle") this.muscle = clampStat(this.muscle + h);
    else if (kind === "nutrition") this.nutrition = clampStat(this.nutrition + h);
    else if (kind === "mental") this.mental = clampStat(this.mental + h);
    else {
      this.muscle = clampStat(this.muscle + h);
      this.nutrition = clampStat(this.nutrition + h);
      this.mental = clampStat(this.mental + h);
    }
  }

  /**
   * Apply effects, routing any `health` delta into the health pillars (which
   * pillar depends on the source — exercise→muscle, food→nutrition, people→
   * mental) and recomposing the overall Health score. All non-health effects
   * (happiness/fun/IQ) go through the normal clamps.
   */
  private applyEff(eff: Partial<Stats>, kind: "muscle" | "nutrition" | "mental" | "split" = "split"): void {
    const h = eff.health;
    if (h === undefined) {
      this.stats = applyEffects(this.stats, eff);
      return;
    }
    const rest = { ...eff };
    delete rest.health;
    this.stats = applyEffects(this.stats, rest);
    this.routeHealth(h, kind);
    this.recomputeHealth();
  }

  /** Which health pillar an option's health effect should feed. */
  private healthKindFor(opt: LifeOption): "muscle" | "nutrition" | "mental" | "split" {
    if (this.isBadSocialOption(opt)) return "split";
    if (opt.category === "health") return "muscle";
    if (opt.person || opt.category === "social") return "mental";
    if (opt.category === "food") return "nutrition";
    const t = opt.storyTag;
    if (BAD_FIT_TAGS.includes(t ?? "")) return "muscle";
    if (t === "sleep" || t === "rest" || t === "sleep_baby") return "mental";
    return "split";
  }

  /** The age your spouse passes away — men tend to leave earlier, so it depends
   *  on the SPOUSE's gender (works for any pairing), checked against your age. */
  private spouseDeathAge(): number {
    return this.partner?.gender === "male" ? 72 : 84;
  }

  private passiveTick(): void {
    const s = this.stats;
    // modern life drifts toward weight gain
    this.weight = clampStat(this.weight + 0.13);
    // the three health pillars drift on their own between deliberate choices:
    //  • muscle atrophies without training (worse with age + out-of-band weight)
    this.muscle = clampStat(this.muscle - (0.5 + this.age * 0.012) - weightHealthDrain(this.weight));
    //  • diet reverts toward a mediocre baseline unless you keep eating well
    this.nutrition = clampStat(this.nutrition + (45 - this.nutrition) * 0.04);
    //  • mental wellbeing tracks your happiness, and loneliness (no fun) erodes it
    this.mental = clampStat(this.mental + (s.happiness - this.mental) * 0.05 - (s.fun < 25 ? 0.6 : 0));
    s.fun = clampStat(s.fun - 0.45);
    s.happiness = clampStat(s.happiness - 0.25);
    // IQ drifts down slowly, faster in old age (crystallised knowledge cushions it)
    const iqDecay = this.age > 80 ? 0.3 : this.age > 70 ? 0.18 : this.age > 55 ? 0.08 : 0.03;
    s.smarts = clampIq(s.smarts - iqDecay);
    // cost of living (you become independent at 18) + home upkeep, eased by high
    // stats — a thriving life is cheaper to sustain. Floored at $0 (no debt).
    if (this.age >= 18 || this.occupation) {
      const living = 6000 * activityDiscount(s) + this.houseUpkeep;
      this.money = Math.max(0, this.money - Math.round(living));
    } else if (this.houseUpkeep) {
      this.money = Math.max(0, this.money - Math.round(this.houseUpkeep));
    }
    // knock-on effects that wire the meters together (poverty stress, loneliness…)
    const fx = crossEffects(s, this.money);
    this.routeHealth(fx.health, "split"); // poverty/comfort touch the body & mind
    s.happiness = clampStat(s.happiness + fx.happiness);
    // being very over/under-weight is also a little dispiriting
    const ws = weightStatus(this.weight);
    if (ws === "obese" || ws === "underweight") s.happiness = clampStat(s.happiness - 0.25);
    // recompose Health from the (now-updated) pillars + weight
    this.recomputeHealth();
  }

  // --- actions --------------------------------------------------------------

  private doAction(): void {
    if (this.mode !== "playing" || this.cooldown > 0) return;

    // near the open gate? walk through to advance (also handy on touch)
    if (this.focusIndex < 0) {
      if (this.doorOpen() && this.px > DOOR_X - 36 && this.nearGate()) this.advanceStage();
      return;
    }

    const st = this.stations[this.focusIndex];
    if (st.kind === "event") {
      this.cooldown = 0.2;
      this.collectEventItem(st);
      return;
    }
    if (st.kind === "bad") return; // bad things aren't pressed — they catch you
    const opt = st.opt;
    if (opt.once && this.usedOnce.has(opt.id)) {
      this.hint("You already did that this chapter.");
      return;
    }
    if (opt.permanent && this.owned.has(opt.id)) {
      this.hint("You already own that.");
      return;
    }

    // buying a house / vehicle opens a picker instead of applying a normal action
    if (opt.opensHousePicker) {
      this.mode = "house";
      this.showHouse();
      return;
    }
    if (opt.opensVehiclePicker) {
      if (!VEHICLES.some((v) => !this.owned.has("veh_" + v.id))) {
        this.hint("You already own every vehicle!");
        return;
      }
      this.mode = "vehicle";
      this.showVehicle();
      return;
    }
    // the career desk opens the change-job / promotion picker
    if (opt.opensCareerDesk) {
      this.mode = "careermove";
      this.showCareerMove();
      return;
    }

    // Affordability gate: a cost / invest / gamble stake can't be paid when broke.
    const gateCost = opt.cost ? Math.round(opt.cost * activityDiscount(this.stats)) : 0;
    const price = gateCost + (opt.invest ?? 0) + (opt.gamble?.stake ?? 0);
    if (price > 0 && this.money < price) {
      this.hint("💸 Not enough money for that.");
      return;
    }
    this.cooldown = 0.28;
    this.markGuideSeen();
    this.applyOption(opt);
  }

  /**
   * Apply a choice's full outcome — effects, money, weight, ageing, habits and
   * events. Used when you press deliberate choices, touch common good items, or
   * when a BAD thing catches you. Gating + pickers are the caller's job.
   */
  private applyOption(opt: LifeOption): void {
    const s = STAGES[this.stageIndex];
    const discount = activityDiscount(this.stats);
    const realCost = opt.cost ? Math.round(opt.cost * discount) : 0;
    const badSocial = this.isBadSocialOption(opt);

    const eff: Partial<Stats> = { ...opt.effects };
    // IQ never jumps. Risky peer pressure gets a stronger visible penalty than
    // ordinary distractions, but it is still capped to avoid one-contact ruin.
    if (eff.smarts !== undefined) {
      eff.smarts = badSocial && eff.smarts < 0 ? Math.max(-4, eff.smarts * 0.55) : dampIqGain(eff.smarts);
    }

    let moneyDelta = 0;
    // earnings (work, chores) — scaled by IQ × your occupation's pay when relevant
    if (opt.earn) {
      let amt = opt.earn;
      if (opt.scalesWithSmarts) amt *= this.incomeMul() * (this.occupation?.salaryMul ?? 1);
      amt = Math.round(amt);
      moneyDelta += amt;
      if (amt > 0) this.lifetimeEarned += amt; // lifetime career earnings (for the profile)
    }
    // your professional network grows when you spend time with people / network
    if (opt.storyTag === "network") this.connections += 20 + Math.floor(Math.random() * 21);
    else if (!badSocial && (opt.person || opt.category === "social")) this.connections += 1 + Math.floor(Math.random() * 3);
    // pay any up-front (already-discounted) cost
    if (realCost) moneyDelta -= realCost;
    // buying stocks moves the stake out of cash and into the market pot
    if (opt.invest) {
      this.investments += opt.invest;
      moneyDelta -= opt.invest;
      this.floats.push({ x: this.px, y: this.py - 104, text: "📈", color: "#5db8ff", life: 1.3 });
    }
    // learning money management switches on smarter, steadier returns for life
    if (opt.moneyMgmt) this.moneyWise = true;

    // doing a GOOD thing makes its BAD counterpart back off — eat well and junk
    // food freezes & fades; play sport OR spend time with family and screen-time
    // / all-night gaming stops chasing you (you're "full" of it for a while).
    if (opt.category === "food" && (opt.effects.health ?? 0) > 0) this.satiateBad("diet");
    if (!badSocial && (opt.category === "health" || opt.person || opt.category === "social")) this.satiateBad("fit");
    if (!badSocial && (opt.category === "smarts" || opt.storyTag === "study" || opt.storyTag === "friends" || opt.storyTag === "sports")) this.satiateBad("focus");
    if (this.clearsBadPeerPressure(opt)) this.clearBadPeerPressure();

    // try-your-luck: roll the gamble and fold the dollar outcome in
    let gambleClause: string | null = null;
    if (opt.gamble) {
      const g = opt.gamble;
      moneyDelta -= g.stake;
      const r = Math.random();
      if (r < g.jackpotChance) {
        moneyDelta += g.jackpot;
        eff.happiness = (eff.happiness ?? 0) + 10;
        gambleClause = g.jackpotStory;
        this.floats.push({ x: this.px, y: this.py - 102, text: "✨ JACKPOT!", color: "#ffd23f", life: 1.7 });
      } else if (r < g.jackpotChance + g.prizeChance) {
        moneyDelta += g.prize;
        eff.happiness = (eff.happiness ?? 0) + 4;
        gambleClause = g.prizeStory;
      } else {
        eff.happiness = (eff.happiness ?? 0) - 3;
        gambleClause = g.bustStory;
      }
    }
    // one-off lifetime purchases/skills are remembered so they don't reappear
    if (opt.permanent) this.owned.add(opt.id);
    // family time invested unlocks grandkids in old age
    if (opt.storyTag === "family" || opt.id === "baby") this.familyBond += 1;

    this.money = Math.max(0, this.money + moneyDelta);
    this.applyEff(eff, this.healthKindFor(opt));
    // spending real time with people is a direct boost to mental wellbeing
    if (opt.person && !badSocial) {
      this.mental = clampStat(this.mental + 3);
      this.recomputeHealth();
    }
    if (gambleClause) this.eventsLog.push(gambleClause);
    if (moneyDelta !== 0)
      this.floats.push({ x: this.px, y: this.py - 88, text: `${moneyDelta > 0 ? "+" : "−"}${formatMoney(Math.abs(moneyDelta))}`, color: moneyDelta > 0 ? "#3ddc84" : "#ff9f6b", life: 1.4 });

    // body weight: explicit delta, else derived from what kind of action it is
    const wDelta = opt.weight ?? this.autoWeightDelta(opt);
    this.weight = clampStat(this.weight + wDelta);

    this.age += opt.ageCost ?? this.stageStep();
    this.passiveTick();
    this.sampleHealth();
    if (opt.once) {
      this.usedOnce.add(opt.id);
      this.renderFocusPanel(); // reflect the "already done" state
    }
    if (opt.id === "baby") this.hadChild = true;

    // "good habits" book: reading it adds up — 5+ reads pays off in lasting health
    let habitBonus = 0;
    if (opt.habit) {
      this.habitCount += 1;
      if (this.habitCount === 5) {
        this.applyEff({ health: 15, happiness: 5 }, "split");
        habitBonus = 15;
        this.hint("📗 Your good habits stuck for life! +15 ❤️");
      } else if (this.habitCount > 5) {
        this.applyEff({ health: 4 }, "split");
        habitBonus = 4;
      }
    }

    this.history.push({
      stageId: s.id,
      stageName: s.name,
      optionId: opt.id,
      storyTag: opt.storyTag,
      ageAt: this.age,
    });
    this.spawnFloats(eff, wDelta);
    if (habitBonus) this.floats.push({ x: this.px, y: this.py - 90, text: `+${habitBonus} ❤️`, color: "#ff5d6c", life: 1.3 });

    if (this.stats.health <= 0) return this.finishLife("health", Math.round(this.age));

    // every so often, life throws a surprise (found wallet, lottery, …)
    if (this.mode === "playing") this.maybeFireEvent();
  }

  // --- random "Easter egg" events -------------------------------------------

  /** Whether an event is eligible right now (age, once, and per-life tier caps). */
  private eventEligible(e: RandomEvent): boolean {
    if (e.once && this.usedEvents.has(e.id)) return false;
    if (this.age < (e.minAge ?? 0) || this.age > (e.maxAge ?? 999)) return false;
    // per-life caps — big/jackpot adults only, pets and jackpots once ever
    if (e.tier === "big" && (this.bigFired || this.age < 18)) return false;
    if (e.tier === "jackpot" && (this.jackpotFired || this.age < 18)) return false;
    if (e.tier === "pet" && this.petAdopted) return false;
    return true;
  }

  private maybeFireEvent(): void {
    if (this.stations.some((st) => st.kind === "event")) return;
    if (this.eventCooldown > 0) {
      this.eventCooldown -= 1;
      return;
    }
    if (Math.random() > 0.16) return; // ~1 in 6 actions once off cooldown
    let pool = EVENTS.filter((e) => this.eventEligible(e));
    // Pity guarantee: by the senior years, if no jackpot has ever fired, give a
    // long, lucky-starved life a real (but still ~once) shot at its one big moment.
    if (!this.jackpotFired && this.stageIndex >= STAGES.length - 3 && Math.random() < 0.25) {
      const jackpots = EVENTS.filter((e) => e.tier === "jackpot" && this.eventEligible(e));
      if (jackpots.length) return this.spawnEventItem(weightedPick(jackpots));
    }
    if (pool.length === 0) return;
    this.spawnEventItem(weightedPick(pool));
  }

  private spawnEventItem(e: RandomEvent): void {
    const zone = this.eventZone(e);
    const pos = this.eventSpawnPosition(zone);
    const category: OptionCategory =
      e.tier === "pet" ? "social" : e.money && e.money > 0 ? "wealth" : "special";
    this.stations.push({
      ...pos,
      opt: {
        id: `event-${e.id}`,
        label: e.title,
        icon: e.emoji,
        desc: e.desc,
        category,
        effects: e.effects,
        storyTag: "easter_event",
      },
      kind: "event",
      zone,
      event: e,
      contactCd: 0,
      satiated: 0,
    });
    this.eventCooldown = 4;
  }

  private eventZone(e: RandomEvent): StationZone {
    if (e.tier === "pet") return "family";
    if (e.good === false) return "social";
    return e.money && e.money > 0 ? "social" : "family";
  }

  private eventSpawnPosition(zone: StationZone): { x: number; y: number } {
    const spawnLeft = this.px > W / 2;
    const bounds = this.zoneBounds(zone);
    const yMid = (bounds.min + bounds.max) / 2;
    for (let tries = 0; tries < 14; tries++) {
      const x = spawnLeft ? 88 + Math.random() * 120 : W - 210 + Math.random() * 120;
      const y = bounds.min + Math.random() * (bounds.max - bounds.min);
      if (Math.hypot(x - this.px, y - this.py) < 150) continue;
      if (this.stations.some((st) => Math.hypot(x - st.x, y - st.y) < 58)) continue;
      return { x, y };
    }
    const fallbackY = Math.max(bounds.min, Math.min(bounds.max, this.py + (this.py < yMid ? 120 : -120)));
    return { x: spawnLeft ? 130 : W - 150, y: fallbackY };
  }

  private collectEventItem(st: Station): void {
    const e = st.event;
    if (!e) return;
    if (e.once) this.usedEvents.add(e.id);
    if (e.tier === "big") this.bigFired = true;
    if (e.tier === "jackpot") this.jackpotFired = true;
    if (e.tier === "pet") this.petAdopted = true;
    const i = this.stations.indexOf(st);
    if (i >= 0) this.stations.splice(i, 1);
    this.focusIndex = -1;
    this.markGuideSeen();
    this.applyEff(e.effects, e.tier === "pet" ? "mental" : "split");
    if (e.money) this.money = Math.max(0, this.money + e.money);
    this.eventsLog.push(e.storyClause);
    this.floats.push({
      x: st.x,
      y: st.y - 62,
      text: e.emoji,
      color: e.good === false ? "#ff8a8a" : e.tier === "pet" ? "#ffd23f" : "#3ddc84",
      life: 1.2,
    });
    if (e.money) {
      this.floats.push({
        x: st.x,
        y: st.y - 82,
        text: `${e.money > 0 ? "+" : "−"}${formatMoney(Math.abs(e.money))}`,
        color: e.money > 0 ? "#3ddc84" : "#ff9f6b",
        life: 1.45,
      });
    }
    this.spawnFloats(e.effects);
    this.renderFocusPanel();
    if (this.stats.health <= 0) this.finishLife("health", Math.round(this.age));
  }

  /** Body-weight change implied by an option when it has no explicit `weight`. */
  private autoWeightDelta(opt: LifeOption): number {
    // tuned so 1 junk + 1 exercise roughly cancels: balance keeps you healthy,
    // junk-heavy tips you overweight, exercise offsets it.
    if (opt.category === "food") return (opt.effects.health ?? 0) < 0 ? 3 : -1;
    if (opt.category === "health") return -3; // exercise & sports burn it off
    const t = opt.storyTag;
    if (BAD_FIT_TAGS.includes(t ?? "")) return 1.5;
    return 0;
  }

  private spawnFloats(eff: Partial<Stats>, wDelta = 0): void {
    let row = 0;
    const push = (text: string, color: string) => {
      this.floats.push({
        x: this.px + (row % 2 === 0 ? -18 : 18),
        y: this.py - 66 - Math.floor(row / 2) * 14,
        text,
        color,
        life: 1.1,
      });
      row++;
    };
    for (const k of STAT_KEYS) {
      const d = eff[k];
      if (!d) continue;
      const r = Math.round(d);
      if (r === 0) continue;
      push(`${r > 0 ? "+" : ""}${r} ${STAT_META[k].icon}`, r > 0 ? STAT_META[k].color : "#ff7a7a");
    }
    if (Math.abs(wDelta) >= 1) {
      // gaining weight is the "bad" direction, so colour it like a penalty
      push(`${wDelta > 0 ? "+" : ""}${Math.round(wDelta)} ⚖️`, wDelta > 0 ? "#ff9f6b" : "#7fd0a0");
    }
  }

  /** A short "look back over the life so far" shown on each stage transition. */
  private lifeRecap(): string[] {
    const trail = STAGES.slice(0, this.stageIndex + 1).map((s) => s.emoji).join(" → ");
    const s = this.stats;
    let vibe: string;
    if (s.health >= 70 && s.happiness >= 70) vibe = "Healthy and happy so far — a good life.";
    else if (s.health < 35) vibe = "Your health has been fragile — take care of it.";
    else if (s.happiness < 35) vibe = "Happiness has been hard to come by lately.";
    else if (s.health >= 70) vibe = "You're keeping in good health.";
    else if (s.happiness >= 70) vibe = "You've found plenty of joy along the way.";
    else vibe = "Life has had its ups and downs.";
    return [`📖 Your journey so far: ${trail}`, vibe];
  }

  /**
   * Ease IQ toward the age-appropriate average (your potential × age-maturity),
   * within a +/-25 band and a small per-chapter cap — so IQ grows with age in
   * childhood, plateaus, and gently declines, and never jumps.
   */
  private driftIq(): void {
    const target = this.iqCeiling * ageMaturity(this.age);
    const cap = this.age < 16 ? 5 : this.age < 55 ? 1.2 : 1.6;
    const drift = Math.max(-cap, Math.min(cap, (target - this.stats.smarts) * 0.3));
    // Only cap the UPPER side (you can't run far above your age peers). The lower
    // side is governed by the smooth drift + the global floor — never snapped up,
    // so a gifted child's IQ still rises gradually rather than jumping to the band.
    const banded = Math.min(target + 25, this.stats.smarts + drift);
    this.stats.smarts = clampIq(banded);
  }

  private advanceStage(): void {
    if (this.mode !== "playing") return; // never advance twice in one frame
    this.markGuideSeen();
    const cur = STAGES[this.stageIndex];
    const lines: string[] = [`You lived through your ${cur.name} years.`, ...this.lifeRecap()];

    // partner modifiers (and their income/cost) shape every chapter after the wedding
    if (this.partner) {
      this.applyEff(this.partner.modifiers, "split");
      if (this.partner.moneyMod) this.money = Math.max(0, this.money + this.partner.moneyMod);
    }

    this.applyParentSupportForChapter(cur, lines);

    // IQ drifts toward the age-appropriate average each chapter (so it tracks the
    // age curve smoothly and stays within a band of your potential — never snaps)
    this.driftIq();

    // education pays off when you start your career — a smart start means savings
    if (this.stageIndex + 1 === CAREER_INDEX) {
      const bonus = Math.round(Math.max(0, this.stats.smarts - 100) * 1500);
      if (bonus > 0) {
        this.money += bonus;
        lines.push(`Your studying paid off — a ${formatMoney(bonus)} head start on your savings.`);
      }
    }

    // your investment pot compounds between chapters — IQ and money sense grow the
    // returns, but markets can dip too. Realised gains are cashed into your account.
    if (this.investments > 0) {
      const dipChance = this.moneyWise ? 0.1 : 0.18;
      if (Math.random() < dipChance) {
        const loss = 0.08 + Math.random() * 0.16;
        this.investments = Math.max(0, this.investments * (1 - loss));
        lines.push(`📉 Markets dipped — your investments slid to ~${formatMoney(this.investments)}. You hold on.`);
      } else {
        const rate = 0.07 + 0.0014 * (this.stats.smarts - 100) + (this.moneyWise ? 0.04 : 0);
        this.investments *= 1 + Math.max(0, rate);
        const realised = Math.round(this.investments * 0.22);
        this.investments = Math.max(0, this.investments - realised);
        if (realised > 0) {
          this.money += realised;
          lines.push(`📈 Investments grew — you cashed out ${formatMoney(realised)} (pot ~${formatMoney(this.investments)}).`);
        }
      }
      this.investments = Math.min(this.investments, 50000000); // keep the pot sane
    }

    // spare properties pay rent every chapter
    if (this.rentalIncome > 0) {
      this.money += this.rentalIncome;
      lines.push(`🏘️ Rental income: ${formatMoney(this.rentalIncome)} from your ${this.homes.length - 1 > 1 ? "properties" : "spare property"}.`);
    }

    // money nudges happiness with diminishing returns (Kahneman/Killingsworth)
    this.stats.happiness = clampStat(this.stats.happiness + moneyHappinessBias(this.money));
    this.sampleHealth();

    const next = this.stageIndex + 1;

    // A spouse with a shorter life passes in old age. Men tend to die younger,
    // so a woman's (older) husband leaves her earlier than a man's wife. Checked
    // against the age you'll be in the next chapter, before any end-of-life test.
    if (this.partner && !this.spouseDeceased && next < STAGES.length) {
      const upcomingAge = Math.max(this.age, STAGES[next].ageStart);
      if (upcomingAge >= this.spouseDeathAge()) {
        this.spouseDeceased = true;
        this.applyEff({ happiness: -16, health: -4 }, "mental");
        const who = this.partner.gender === "male" ? "husband" : "wife";
        lines.push(`💔 Your ${who} ${this.partner.name} passed away. You grieve, but carry on.`);
      }
    }

    const le = this.lifeExp();
    if (this.stats.health <= 0) return this.finishLife("health", Math.round(this.age));
    if (next >= STAGES.length) return this.finishLife("natural", Math.round(this.age));
    if (this.age >= le) return this.finishLife(le < 70 ? "health" : "natural", Math.round(this.age));

    lines.push(`Now entering: ${STAGES[next].emoji} ${STAGES[next].name}`);
    this.transitionNext = next;
    this.transitionTimer = 2.4;
    this.mode = "transition";
    this.showTransition(lines);
  }

  private finishLife(cause: CauseOfEnd, deathAge: number): void {
    if (this.mode === "ending") return; // idempotent — only die once
    this.story = generateStory({
      history: this.history,
      finalStats: this.stats,
      partner: this.partner,
      deathAge,
      cause,
      hadChild: this.hadChild,
      gender: this.gender,
      weight: this.weight,
      occupation: this.occupation,
      homeQuality: this.homeQuality,
      widowed: this.spouseDeceased,
      events: this.eventsLog,
      habitMaster: this.habitCount >= 5,
      vehicles: VEHICLES.filter((v) => this.owned.has("veh_" + v.id)).map((v) => `a ${v.name.toLowerCase()}`),
      moneyWise: this.moneyWise,
      propertiesOwned: this.homes.length,
      money: Math.round(this.money),
      netWorth: Math.round(this.netWorth()),
    });
    this.mode = "ending";
    this.showEnding();
  }

  private pickPartner(p: Partner): void {
    this.partner = p;
    this.applyEff({ happiness: 10, health: 2 }, "mental");
    this.history.push({
      stageId: "marriage",
      stageName: "Marriage & Baby",
      optionId: "wed_" + p.id,
      storyTag: undefined,
      ageAt: this.age,
    });
    this.timeline[this.stageIndex] = this.snapshot(); // re-capture: now married
    this.mode = "playing";
    this.clearOverlay();
    this.hint(`💍 You married ${p.name}, ${p.title}!`);
  }

  private pickOccupation(o: Occupation): void {
    this.occupation = o;
    if (o.perks && !this.jobsTaken.has(o.id)) this.applyEff(o.perks, "split");
    this.jobsTaken.add(o.id);
    this.history.push({
      stageId: "career",
      stageName: "Career",
      optionId: "job_" + o.id,
      storyTag: o.storyTag,
      ageAt: this.age,
    });
    this.timeline[this.stageIndex] = this.snapshot();
    this.hint(`${o.emoji} You became a ${o.name}!`);
    // a second career-start fork: how will you commute to work?
    if (!this.commute) {
      this.mode = "commute";
      this.showCommute();
    } else {
      this.mode = "playing";
      this.clearOverlay();
    }
  }

  private buyHouse(h: HouseTier): void {
    if (this.money < h.cost) {
      this.hint("You can't afford that one yet.");
      return;
    }
    const owningAlready = this.homes.length > 0;
    this.money -= h.cost;
    this.applyEff({ happiness: h.happiness });
    this.homes.push(h);
    this.recomputeHomes();
    this.age += this.stageStep();
    this.passiveTick();
    this.sampleHealth();
    this.history.push({
      stageId: STAGES[this.stageIndex].id,
      stageName: STAGES[this.stageIndex].name,
      optionId: "house_" + h.id,
      storyTag: owningAlready ? "rental" : "home",
      ageAt: this.age,
    });
    this.mode = "playing";
    this.clearOverlay();
    this.hint(
      owningAlready
        ? `${h.emoji} A second property! You'll rent it out for income.`
        : `${h.emoji} You bought a ${h.name.toLowerCase()}!`
    );
  }

  /**
   * You live in the nicest place you own (that sets the home background and its
   * upkeep); every other property is rented out for a per-stage income.
   */
  private recomputeHomes(): void {
    if (this.homes.length === 0) {
      this.homeQuality = 0;
      this.houseUpkeep = 0;
      this.rentalIncome = 0;
      return;
    }
    let best = this.homes[0];
    for (const h of this.homes) if (h.quality > best.quality) best = h;
    this.homeQuality = best.quality;
    this.houseUpkeep = best.upkeep;
    // the home you live in earns nothing; the rest are rentals
    let rent = 0;
    let usedLiveIn = false;
    for (const h of this.homes) {
      if (h === best && !usedLiveIn) { usedLiveIn = true; continue; }
      rent += h.rentYield;
    }
    this.rentalIncome = rent;
  }

  private liveHome(): HouseTier | null {
    if (this.homes.length === 0) return null;
    let best = this.homes[0];
    for (const h of this.homes) if (h.quality > best.quality) best = h;
    return best;
  }

  private buyVehicle(v: VehicleTier): void {
    const key = "veh_" + v.id;
    if (this.owned.has(key)) {
      this.hint("You already own that.");
      return;
    }
    if (this.money < v.cost) {
      this.hint("You can't afford that one yet.");
      return;
    }
    this.owned.add(key);
    this.money -= v.cost;
    this.applyEff(v.effects, "split");
    this.age += this.stageStep();
    this.passiveTick();
    this.sampleHealth();
    this.history.push({
      stageId: STAGES[this.stageIndex].id,
      stageName: STAGES[this.stageIndex].name,
      optionId: "veh_" + v.id,
      storyTag: v.storyTag,
      ageAt: this.age,
    });
    this.spawnFloats(v.effects);
    this.floats.push({ x: this.px, y: this.py - 88, text: `−${formatMoney(v.cost)}`, color: "#ff9f6b", life: 1.4 });
    this.mode = "playing";
    this.clearOverlay();
    this.hint(`${v.emoji} You bought a ${v.name.toLowerCase()}!`);
    if (this.stats.health <= 0) return this.finishLife("health", Math.round(this.age));
  }

  /** A special selection at the start of your career: how do you get to work? */
  private pickCommute(c: CommuteTier): void {
    if (this.netWorth() < c.minNet) {
      this.hint("You can't afford that commute yet.");
      return;
    }
    this.commute = c.id;
    if (c.cost) this.money = Math.max(0, this.money - c.cost);
    this.applyEff(c.effects, "muscle");
    this.history.push({
      stageId: "career",
      stageName: "Career",
      optionId: "commute_" + c.id,
      storyTag: c.storyTag,
      ageAt: this.age,
    });
    this.timeline[this.stageIndex] = this.snapshot();
    this.mode = "playing";
    this.clearOverlay();
    this.hint(`${c.emoji} ${c.name} — that's how you'll get to work.`);
  }

  /** Time travel: jump back to the start of a previously-visited stage. */
  private rewind(stageIndex: number): void {
    const snap = this.timeline[stageIndex];
    if (!snap) return;
    this.gender = snap.gender;
    this.stats = { ...snap.stats };
    this.money = snap.money;
    this.weight = snap.weight;
    this.muscle = snap.muscle;
    this.nutrition = snap.nutrition;
    this.mental = snap.mental;
    this.age = snap.age;
    this.commute = snap.commute;
    this.lifetimeEarned = snap.lifetimeEarned;
    this.connections = snap.connections;
    this.familyFund = snap.familyFund;
    this.parentAnnualSupport = snap.parentAnnualSupport;
    this.homes = snap.homeIds.map((id) => HOUSE_TIERS.find((h) => h.id === id)).filter(Boolean) as HouseTier[];
    this.recomputeHomes();
    this.hadChild = snap.hadChild;
    this.familyBond = snap.familyBond;
    this.spouseDeceased = snap.spouseDeceased;
    this.habitCount = snap.habitCount;
    this.investments = snap.investments;
    this.moneyWise = snap.moneyWise;
    this.iqCeiling = snap.iqCeiling;
    this.geneBonus = snap.geneBonus;
    this.owned = new Set(snap.owned);
    this.jobsTaken = new Set(snap.jobsTaken);
    this.inventory = snap.inventory.map((slot) => ({ opt: slot.opt, count: slot.count }));
    this.selectedInventory = Math.max(0, Math.min(snap.selectedInventory, this.inventory.length - 1));
    this.bigFired = snap.bigFired;
    this.jackpotFired = snap.jackpotFired;
    this.petAdopted = snap.petAdopted;
    this.usedEvents = new Set(snap.usedEvents);
    this.eventsLog = [...snap.eventsLog];
    this.eventCooldown = 2;
    this.healthSum = snap.healthSum;
    this.happinessSum = snap.happinessSum;
    this.smartsSum = snap.smartsSum;
    this.healthCount = snap.healthCount;
    this.partner = snap.partnerId ? PARTNERS.find((p) => p.id === snap.partnerId) ?? null : null;
    this.occupation = snap.occupationId
      ? OCCUPATIONS.find((o) => o.id === snap.occupationId) ?? null
      : null;
    this.history = this.history.slice(0, snap.historyLen);
    this.floats = [];
    this.clearOverlay();
    this.loadStage(stageIndex, true); // restoring: don't re-sample/re-snapshot the entry
    this.hint(`⏳ You travelled back to age ${Math.floor(this.age)}.`);
  }

  // --- main loop ------------------------------------------------------------

  private frame = (t: number): void => {
    const dt = Math.min(0.05, (t - this.lastTime) / 1000 || 0);
    this.lastTime = t;
    this.renderTime = t / 1000;
    // a single bad frame must never freeze the whole game
    try {
      this.update(dt);
      this.render();
    } catch (err) {
      if (this.frameErrors++ < 5) console.error("[pixel-life] frame error", err);
    }
    requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.foodCooldown > 0) this.foodCooldown = Math.max(0, this.foodCooldown - dt);
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.ui.hint.textContent = "";
    }

    // floats animate in every mode
    this.floats = this.floats.filter((f) => (f.life -= dt) > 0);
    for (const f of this.floats) f.y -= dt * 26;

    if (this.mode === "transition") {
      this.actQueued = false;
      this.transitionTimer -= dt;
      if (this.transitionTimer <= 0) this.loadStage(this.transitionNext);
      return;
    }

    if (this.mode !== "playing") {
      this.moving = false;
      this.verticalBias = 0;
      this.actQueued = false; // drop inputs queued while an overlay was open
      return;
    }

    // movement
    let dx = 0;
    let dy = 0;
    if (this.input.left) dx -= 1;
    if (this.input.right) dx += 1;
    if (this.input.up) dy -= 1;
    if (this.input.down) dy += 1;
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len;
      const ny = dy / len;
      this.verticalBias = ny;
      if (Math.abs(nx) > 0.15) this.facing = nx < 0 ? "left" : "right";
      else this.facing = ny < -0.15 ? "back" : "front";
      const sp = SPEED * this.speedFactor(); // study & smarts make you nimbler
      this.px += nx * sp * dt;
      this.py += ny * sp * dt;
      this.px = Math.max(48, Math.min(W - 36, this.px));
      this.py = Math.max(PY_MIN, Math.min(PY_MAX, this.py));
      this.walkPhase += dt * 10;
    } else {
      this.verticalBias = 0;
      this.walkPhase += dt * 3;
    }

    // Common good items flee until you touch them, bad items chase, people block,
    // and any un-satiated bad thing that catches you applies automatically.
    this.moveStations(dt);
    this.checkCommonItemContacts();
    this.checkBadContacts();
    this.checkEventContacts();
    if (this.mode !== "playing") return;

    if (this.actQueued) {
      this.actQueued = false;
      this.doAction();
    }
    // doAction may have advanced or ended the life — stop the frame if so
    if (this.mode !== "playing") return;

    this.updateFocus();

    // center gate
    const s = STAGES[this.stageIndex];
    if (this.px > DOOR_X) {
      if (!this.nearGate()) {
        this.px = DOOR_X;
        this.hint("Use the right-side gate to grow up.");
      } else if (this.doorOpen()) this.advanceStage();
      else this.hint(`Grow a little more first (age ${Math.floor(this.age)} → ${s.ageEnd}).`);
    }
    // walking through the gate transitioned us — don't also run mortality
    if (this.mode !== "playing") return;

    // continuous mortality
    const le = this.lifeExp();
    if (this.stats.health <= 0) this.finishLife("health", Math.round(this.age));
    else if (this.age >= le) this.finishLife(le < 70 ? "health" : "natural", Math.round(this.age));
  }

  private updateFocus(): void {
    // Only deliberate choices can be focused and pressed. Common green items
    // collect on contact, and bad things apply on contact.
    let best = -1;
    let bestD = 999;
    this.stations.forEach((st, i) => {
      if (st.kind === "bad") return;
      if (this.isCommonCollectible(st)) return;
      if (st.kind === "event" && st.event?.good === false) return;
      const dx = Math.abs(this.px - st.x);
      const dy = Math.abs(this.py - st.y);
      if (dx < 38 && dy < 42 && dx + dy < bestD) {
        best = i;
        bestD = dx + dy;
      }
    });
    if (best !== this.focusIndex) {
      this.focusIndex = best;
      this.renderFocusPanel();
      this.renderInventory();
    }
  }

  /** Doing a good thing makes its bad counterpart freeze + fade for a while. */
  private satiateBad(guard: string): void {
    for (const st of this.stations) {
      if (st.kind === "bad" && st.guard === guard) {
        const text = guard === "diet" ? "🛡️ full!" : guard === "focus" ? "🛡️ focused!" : "🛡️ not now!";
        if (st.satiated <= 0) this.floats.push({ x: st.x, y: st.y - 30, text, color: "#7fd0a0", life: 1.3 });
        st.satiated = SATIATE_TIME;
      }
    }
  }

  /** Move good items away from the player and bad items toward them; people block bad. */
  private moveStations(dt: number): void {
    const people = this.people; // cached people positions (perf)
    for (const st of this.stations) {
      if (st.contactCd > 0) st.contactCd -= dt;
      if (st.kind === "bad" && st.satiated > 0) { st.satiated -= dt; continue; } // satiated → frozen
      const badEvent = st.kind === "event" && st.event?.good === false;
      if (st.kind !== "good" && st.kind !== "bad" && !badEvent) continue;
      const dx = this.px - st.x;
      const dy = this.py - st.y;
      const d = Math.hypot(dx, dy) || 1;
      if (badEvent && d > BAD_EVENT_ALERT_R) continue;
      const dir = st.kind === "bad" || badEvent ? 1 : -1; // bad → toward you, good → away
      const sp = badEvent ? BAD_SPEED * 0.7 : st.kind === "bad" ? BAD_SPEED : GOOD_SPEED;
      let nx = st.x + (dir * dx / d) * sp * dt;
      let ny = st.y + (dir * dy / d) * sp * dt;
      if (st.kind === "bad" || badEvent) {
        for (const p of people) {
          if (Math.hypot(nx - p.x, ny - p.y) < BLOCK_R) {
            nx = st.x; // an NPC stands in the way — the bad thing can't get past
            ny = st.y;
            break;
          }
        }
      }
      st.x = Math.max(80, Math.min(W - 90, nx));
      const bounds = this.zoneBounds(st.zone);
      st.y = Math.max(bounds.min, Math.min(bounds.max, ny));
    }
  }

  /** Common green items are free repeatable choices collected on contact. */
  private isCommonCollectible(st: Station): boolean {
    const opt = st.opt;
    return st.kind === "good" &&
      !opt.person &&
      !opt.once &&
      !opt.permanent &&
      !opt.cost &&
      !opt.opensHousePicker &&
      !opt.opensVehiclePicker &&
      !opt.opensCareerDesk &&
      !opt.gamble &&
      !opt.invest &&
      !opt.moneyMgmt &&
      opt.category !== "special";
  }

  private addInventoryItem(opt: LifeOption): void {
    const existing = this.inventory.find((slot) => slot.opt.id === opt.id);
    if (existing) {
      existing.count = Math.min(INVENTORY_MAX_COUNT, existing.count + 1);
      this.selectedInventory = this.inventory.indexOf(existing);
    } else {
      if (this.inventory.length >= INVENTORY_MAX_SLOTS) {
        this.inventory.shift();
        this.selectedInventory = Math.max(0, this.selectedInventory - 1);
      }
      this.inventory.push({ opt, count: 1 });
      this.selectedInventory = this.inventory.length - 1;
    }
    this.renderInventory();
  }

  private setInventorySelection(index: number, announce = true): void {
    if (this.inventory.length === 0) {
      this.selectedInventory = 0;
      this.renderInventory();
      if (announce) this.hint("Collect green items first.");
      return;
    }
    const len = this.inventory.length;
    this.selectedInventory = ((index % len) + len) % len;
    this.renderInventory();
    if (announce) {
      const slot = this.inventory[this.selectedInventory];
      const useText = slot.opt.category === "food" ? "Swipe up to eat it, or near a person to give it." : "Swipe up near a person to use it.";
      this.hint(`${slot.opt.icon} ${slot.opt.label} selected. ${useText}`);
    }
  }

  private stepInventorySelection(delta: number): void {
    this.setInventorySelection(this.selectedInventory + delta);
  }

  private consumeSelectedInventoryItem(): void {
    const slot = this.inventory[this.selectedInventory];
    if (!slot) return;
    slot.count -= 1;
    if (slot.count <= 0) {
      this.inventory.splice(this.selectedInventory, 1);
      this.selectedInventory = Math.max(0, Math.min(this.selectedInventory, this.inventory.length - 1));
    }
  }

  private eatSelectedFoodItem(slot: InventorySlot): void {
    if (slot.opt.category !== "food") {
      this.hint(`Move close to a person, then swipe up to use ${slot.opt.icon}.`);
      return;
    }
    if (this.foodCooldown > 0) {
      this.hint(`Still full. Eat again in ${Math.ceil(this.foodCooldown)}s.`);
      return;
    }

    const opt = slot.opt;
    this.cooldown = 0.22;
    this.foodCooldown = FOOD_USE_COOLDOWN;
    this.markGuideSeen();
    this.consumeSelectedInventoryItem();
    this.applyOption(opt);
    this.floats.push({ x: this.px, y: this.py - 86, text: `${opt.icon} eaten`, color: "#9fe870", life: 1.25 });
    if (this.mode !== "playing") return;
    this.hint(`${opt.label} eaten. Wait ${FOOD_USE_COOLDOWN}s before eating again.`);
    this.renderFocusPanel();
    this.renderInventory();
  }

  private personUseTarget(): Station | null {
    const focused = this.stations[this.focusIndex];
    if (focused?.kind === "person") return focused;
    let best: Station | null = null;
    let bestD = 999;
    for (const st of this.people) {
      const d = Math.hypot(this.px - st.x, this.py - st.y);
      if (d < 56 && d < bestD) {
        best = st;
        bestD = d;
      }
    }
    return best;
  }

  private inventoryReactionEffects(item: LifeOption, person: LifeOption): Partial<Stats> {
    const effects: Partial<Stats> = { happiness: this.isFamilyOption(person) ? 4 : 3 };
    if (item.category === "fun") effects.fun = 3;
    else if (item.category === "food") effects.health = 1;
    else if (item.category === "health") effects.health = 2;
    else if (item.category === "rest") effects.health = 1;
    else if (item.category === "smarts") effects.smarts = 1;
    else if (item.category === "social") effects.happiness = (effects.happiness ?? 0) + 2;
    return effects;
  }

  private useSelectedInventoryItem(): void {
    if (this.mode !== "playing" || this.cooldown > 0) return;
    const slot = this.inventory[this.selectedInventory];
    if (!slot) {
      this.hint("Collect green items first.");
      return;
    }
    const person = this.personUseTarget();
    if (!person) {
      this.eatSelectedFoodItem(slot);
      return;
    }

    this.cooldown = 0.22;
    this.markGuideSeen();
    const effects = this.inventoryReactionEffects(slot.opt, person.opt);
    this.applyEff(effects, "mental");
    this.connections += this.isFamilyOption(person.opt) ? 1 : 3;
    if (this.isFamilyOption(person.opt)) this.familyBond += 1;
    this.consumeSelectedInventoryItem();
    this.floats.push({ x: person.x, y: person.y - 92, text: `${slot.opt.icon} + ${person.opt.icon}`, color: "#ffd23f", life: 1.35 });
    this.spawnFloats(effects);
    this.hint(`${person.opt.label} liked ${slot.opt.label}.`);
    this.renderFocusPanel();
    this.renderInventory();
  }

  /** Common green items collect by touch, then reappear elsewhere in their zone. */
  private checkCommonItemContacts(): void {
    if (this.cooldown > 0) return;
    for (const st of this.stations) {
      if (!this.isCommonCollectible(st) || st.contactCd > 0) continue;
      if (Math.hypot(this.px - st.x, this.py - st.y) > ITEM_R + 6) continue;
      st.contactCd = 0.45;
      this.cooldown = 0.1;
      this.markGuideSeen();
      this.addInventoryItem(st.opt);
      if (st.opt.category === "food") {
        this.floats.push({ x: st.x, y: st.y - 52, text: `${st.opt.icon} stored`, color: "#9fe870", life: 1.1 });
        this.hint(`${st.opt.label} stored. Swipe up to eat it, or give it to someone.`);
      } else {
        this.applyOption(st.opt);
        if (this.mode !== "playing") return;
      }
      this.respawnCommonItem(st);
      this.focusIndex = -1;
      this.renderFocusPanel();
      return;
    }
  }

  /** Move a collected common item to a new far-enough place in its own zone. */
  private respawnCommonItem(st: Station): void {
    const bounds = this.zoneBounds(st.zone);
    const spawnLeft = this.px > W / 2;
    for (let tries = 0; tries < 12; tries++) {
      const x = spawnLeft ? 88 + Math.random() * 140 : W - 230 + Math.random() * 140;
      const y = bounds.min + Math.random() * (bounds.max - bounds.min);
      if (Math.hypot(x - this.px, y - this.py) < 120) continue;
      if (this.stations.some((other) => other !== st && Math.hypot(x - other.x, y - other.y) < 54)) continue;
      st.x = x;
      st.y = y;
      return;
    }
    st.x = spawnLeft ? 120 : W - 170;
    st.y = Math.max(bounds.min, Math.min(bounds.max, this.py + (this.py < (bounds.min + bounds.max) / 2 ? 120 : -120)));
  }

  /** A bad item touching the player applies automatically — unless it's satiated. */
  private checkBadContacts(): void {
    for (const st of this.stations) {
      if (st.kind !== "bad" || st.contactCd > 0 || st.satiated > 0) continue;
      if (Math.hypot(this.px - st.x, this.py - st.y) > ITEM_R) continue;
      st.contactCd = 2.6;
      this.applyOption(st.opt); // you "just get" the bad thing
      this.respawnBadItem(st); // it circles back for another go
      if (this.mode !== "playing") return; // applyOption may have ended the life
    }
  }

  /** Bad-luck event objects are hazards; touching one applies it in-world. */
  private checkEventContacts(): void {
    for (const st of [...this.stations]) {
      if (st.kind !== "event" || !st.event || st.event.good !== false) continue;
      if (Math.hypot(this.px - st.x, this.py - st.y) > ITEM_R + 4) continue;
      this.collectEventItem(st);
      if (this.mode !== "playing") return;
    }
  }

  /** Send a bad item back to a far edge (clear of people) to chase you down again. */
  private respawnBadItem(st: Station): void {
    const bounds = this.zoneBounds(st.zone);
    for (let tries = 0; tries < 6; tries++) {
      st.x = this.px > W / 2 ? 90 + Math.random() * 70 : W - 170 - Math.random() * 70;
      st.y = bounds.min + Math.random() * (bounds.max - bounds.min);
      if (!this.people.some((p) => Math.hypot(st.x - p.x, st.y - p.y) < BLOCK_R)) break;
    }
  }

  // --- rendering ------------------------------------------------------------

  private render(): void {
    const ctx = this.ui.ctx;
    ctx.fillStyle = "#140d24";
    ctx.fillRect(0, 0, W, H);

    const inRoom =
      this.mode === "playing" ||
      this.mode === "transition" ||
      this.mode === "partner" ||
      this.mode === "occupation" ||
      this.mode === "house" ||
      this.mode === "vehicle" ||
      this.mode === "commute" ||
      this.mode === "timetravel" ||
      this.mode === "profile" ||
      this.mode === "careermove" ||
      this.mode === "settings";
    if (inRoom && this.stageIndex < STAGES.length) {
      const s = STAGES[this.stageIndex];
      const t = this.walkPhase;
      const doorActive = this.doorOpen();
      drawRoom(ctx, s.theme, W, H, FLOOR_Y, doorActive, t, {
        scene: s.scene,
        upperScene: this.upperScene(),
        atHome: !!s.atHome,
        homeQuality: this.homeQuality,
        splitY: this.zoneSplitY(),
        ownedVehicles: VEHICLES.filter((v) => this.owned.has("veh_" + v.id)),
        ownedHome: this.liveHome(),
      });

      // draw stations, people and the avatar together, sorted by depth (y)
      type Drawable = { y: number; station?: Station };
      const drawables: Drawable[] = this.stations.map((st) => ({ y: st.y, station: st }));
      drawables.push({ y: this.py }); // the avatar
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) {
        if (!d.station) {
          drawAvatar(ctx, this.px, this.py, avatarLook(this.stageIndex, this.gender), this.walkPhase, {
            moving: this.moving,
            facing: this.facing,
            verticalBias: this.verticalBias,
          });
          continue;
        }
        const st = d.station;
        const focused = this.stations[this.focusIndex] === st && this.mode === "playing";
        const used = !!st.opt.once && this.usedOnce.has(st.opt.id);
        // A satiated bad item has backed off. Keep bad-friend people full color so
        // they still read as humans instead of shadow silhouettes.
        const satiated = st.kind === "bad" && st.satiated > 0;
        const fadedSatiated = satiated && !st.opt.person;
        // a ground-ring marks moving items: red = a BAD thing chasing you,
        // green = a common GOOD thing you collect by touch.
        if (!satiated && (st.kind === "bad" || st.kind === "good" || st.kind === "event")) {
          const bad = st.kind === "bad" || st.event?.good === false;
          const eventMoney = st.kind === "event" && !!st.event?.money && st.event.money > 0;
          const pulse = 0.5 + 0.3 * Math.sin(t * (bad ? 6 : 3));
          ctx.save();
          ctx.globalAlpha = pulse;
          ctx.fillStyle = bad ? "#ff5d6c" : eventMoney ? "#ffd23f" : "#3ddc84";
          ellipseRing(ctx, st.x, st.y + 16, 22, 7);
          ctx.restore();
        }
        if (fadedSatiated) ctx.globalAlpha = 0.18;
        if (st.kind === "event" && st.event) {
          drawEventItem(ctx, st.x, st.y, st.event.id, st.event.emoji, st.event.title, st.event.good !== false, focused, t);
        } else if (st.opt.person) {
          drawPerson(ctx, st.x, st.y, st.opt.person, this.gender, st.opt.label, focused, used, t, this.stageIndex, {
            seated: this.shouldSitWithNewborn(st),
          });
        } else {
          drawStation(ctx, st.x, st.y, st.opt.icon, st.opt.label, st.opt.category, focused, used, t);
        }
        if (fadedSatiated) ctx.globalAlpha = 1;
      }
    }

    // floats
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "bold 9px 'Trebuchet MS', system-ui, sans-serif";
    for (const f of this.floats) {
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life));
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;

    this.renderHud();
  }

  private renderHud(): void {
    for (const k of STAT_KEYS) {
      const v = Math.round(this.stats[k]);
      const bar = this.ui.bars[k];
      // IQ runs 40..160 and Health 0..120 (can exceed 100), so scale those bars
      bar.fill.style.width =
        k === "smarts" ? `${((this.stats[k] - 40) / 120) * 100}%`
        : k === "health" ? `${Math.min(100, (this.stats[k] / 120) * 100)}%`
        : `${this.stats[k]}%`;
      bar.val.textContent = String(v);
      bar.fill.style.opacity = (k === "smarts" ? v < 70 : v < 20) ? "0.6" : "1";
    }
    // the three pillars that compose Health
    const pillars: [keyof typeof this.ui.subBars, number][] = [
      ["muscle", this.muscle], ["nutrition", this.nutrition], ["mental", this.mental],
    ];
    for (const [key, val] of pillars) {
      const sb = this.ui.subBars[key];
      sb.fill.style.width = `${val}%`;
      sb.val.textContent = String(Math.round(val));
    }
    // weight meter: colour reflects healthy / over / under, not "more is better"
    const wb = this.ui.weightBar;
    wb.fill.style.width = `${this.weight}%`;
    wb.fill.style.background = weightColor(this.weight);
    wb.val.textContent = String(Math.round(this.weight));

    // money is a real dollar figure, not a bar
    this.ui.moneyLabel.textContent = `💰 ${formatMoney(this.money)}`;

    const s = STAGES[Math.min(this.stageIndex, STAGES.length - 1)];
    if (this.biography) {
      // a biography shows the (custom) chapter title and whose life it is
      const ch = this.biography.chapters[s.id];
      const title = ch?.title?.trim() || s.name;
      this.ui.stageLabel.textContent = `${s.emoji} ${title} · 📖 ${this.biography.name || "A life"}`;
    } else {
      const occ = this.occupation ? ` · ${this.occupation.emoji} ${this.occupation.name}` : "";
      this.ui.stageLabel.textContent = `${s.emoji} ${s.name}${occ}`;
    }
    this.ui.ageLabel.textContent = String(Math.floor(this.age));
    this.ui.leLabel.textContent =
      this.mode === "title" || this.mode === "setup" ? "" : ` · ~${this.lifeExp()}y`;
    this.ui.warn.style.display =
      this.mode === "playing" && (this.stats.health < 25 || weightStatus(this.weight) === "obese")
        ? "block"
        : "none";
    // time-travel pill appears once you have a past worth revisiting
    const canRewind = this.mode === "playing" && !this.biography && this.timeline.filter(Boolean).length > 1;
    this.ui.timeTravel.style.display = canRewind ? "flex" : "none";
    // career profile pill appears once you've started working
    const canProfile = this.mode === "playing" && this.stageIndex >= CAREER_INDEX;
    this.ui.profileBtn.style.display = canProfile ? "flex" : "none";
    // settings + skip are available whenever you're playing; hide all the
    // floating controls (incl. the touch pad) while a menu/overlay is open
    const playing = this.mode === "playing";
    this.ui.settingsBtn.style.display = playing ? "flex" : "none";
    this.ui.skipBtn.style.display = playing ? "flex" : "none";
    this.ui.touchWrap.style.visibility = playing ? "" : "hidden";
  }

  private renderFocusPanel(): void {
    const panel = this.ui.focusPanel;
    if (this.focusIndex < 0) {
      if (!this.guideSeen) {
        panel.innerHTML = `<span class="plj-focus-title">How to play</span><span class="plj-focus-desc">🟢 Touch green items to collect them into the tray. Swipe left/right to select; swipe up to eat food or give items near people. 🔴 Bad things chase YOU. Reach the right-side gate ➜ to grow up.</span>`;
      } else {
        // tucked away during the game — just a tiny reminder
        panel.innerHTML = `<span class="plj-focus-title">🟢 collect tray items&nbsp;&nbsp;·&nbsp;&nbsp;swipe ↑ eat/give&nbsp;&nbsp;·&nbsp;&nbsp;🔴 dodge</span>`;
      }
      return;
    }
    const st = this.stations[this.focusIndex];
    const mk = (text: string, color: string) => `<span class="plj-chip" style="color:${color}">${text}</span>`;
    if (st.kind === "event" && st.event) {
      const e = st.event;
      const good = e.good !== false;
      const money = e.money
        ? mk(`${e.money > 0 ? "+" : "−"}${formatMoney(Math.abs(e.money))}`, e.money > 0 ? "#3ddc84" : "#ff8a8a")
        : "";
      panel.innerHTML =
        `<span class="plj-focus-title">${esc(e.emoji)} ${esc(e.title)}</span>` +
        `<span class="plj-focus-desc">${esc(e.desc)}</span>` +
        `<span class="plj-chips">${effectChips(e.effects)}${money}<b class="plj-press">${good ? "SPACE" : "TOUCH"}</b></span>`;
      return;
    }
    const opt = st.opt;
    const extra: string[] = [];
    if (opt.earn) {
      const est = opt.earn * (opt.scalesWithSmarts ? this.incomeMul() * (this.occupation?.salaryMul ?? 1) : 1);
      extra.push(mk(`+${formatMoney(est)}`, "#3ddc84"));
    }
    const realCost = opt.cost ? Math.round(opt.cost * activityDiscount(this.stats)) : 0;
    if (realCost) extra.push(mk(`−${formatMoney(realCost)}`, "#ff8a8a"));
    if (opt.invest) extra.push(mk(`invest ${formatMoney(opt.invest)} 📈`, "#5db8ff"));
    if (opt.gamble) {
      extra.push(mk(`stake ${formatMoney(opt.gamble.stake)}`, "#ff8a8a"));
      extra.push(mk(`win up to ${formatMoney(opt.gamble.jackpot)}`, "#3ddc84"));
    }
    const price = realCost + (opt.invest ?? 0) + (opt.gamble?.stake ?? 0);
    const broke = price > 0 && this.money < price;
    const press = broke
      ? `<b class="plj-press" style="background:#5a2a33;color:#ffc4c4">💸 can't afford</b>`
      : `<b class="plj-press">${opt.person ? "SPACE / ITEM↑" : "SPACE"}</b>`;
    panel.innerHTML =
      `<span class="plj-focus-title">${esc(opt.icon)} ${esc(opt.label)}</span>` +
      `<span class="plj-focus-desc">${esc(opt.desc)}</span>` +
      `<span class="plj-chips">${effectChips(opt.effects)}${extra.join("")}${press}</span>`;
  }

  private renderInventory(): void {
    const wrap = this.ui.inventoryWrap;
    const track = this.ui.inventoryTrack;
    const selected = this.inventory[this.selectedInventory];
    const usable = this.mode === "playing" && this.inventory.length > 0 && (!!this.personUseTarget() || selected?.opt.category === "food");
    wrap.classList.toggle("is-empty", this.inventory.length === 0);
    wrap.classList.toggle("can-use", usable);
    if (this.inventory.length === 0) {
      track.innerHTML = `<span class="plj-inventory-empty">collect green items<br>swipe up to eat/give</span>`;
      return;
    }
    track.innerHTML = this.inventory.map((slot, i) => {
      const selected = i === this.selectedInventory ? " is-selected" : "";
      const count = slot.count > 1 ? `<span class="plj-inv-count">${slot.count}</span>` : "";
      return `<button class="plj-inv-item${selected}" data-inv-index="${i}" title="${esc(slot.opt.label)}"><span class="plj-inv-emoji">${esc(slot.opt.icon)}</span>${count}</button>`;
    }).join("");
  }

  private hint(text: string): void {
    this.ui.hint.textContent = text;
    this.hintTimer = 1.6;
  }

  /** The intro guide shows once, then stays tucked away (remembered across lives). */
  private markGuideSeen(): void {
    if (this.guideSeen) return;
    this.guideSeen = true;
    try {
      localStorage.setItem("plj-guide-seen-v1", "1");
    } catch {
      /* ignore */
    }
  }

  /** Skip the rest of the current chapter and grow up to the next one. */
  private skipStage(): void {
    if (this.mode !== "playing") return;
    this.hint("⏭ Skipping to the next chapter…");
    this.advanceStage();
  }

  private showSettings(): void {
    if (this.mode !== "playing") return;
    this.mode = "settings";
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title plj-settings-card">
        <h2>⚙️ Settings</h2>
        <div class="plj-set-list">
          <button class="plj-btn" id="plj-set-resume">▶ Resume</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-skip">⏭ Skip this chapter</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-guide">📖 Show how-to-play</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-restart">🔄 Start a new life</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-menu">🏠 Main menu</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    const ov = this.ui.overlay;
    ov.querySelector<HTMLButtonElement>("#plj-set-resume")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); };
    ov.querySelector<HTMLButtonElement>("#plj-set-skip")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); this.skipStage(); };
    ov.querySelector<HTMLButtonElement>("#plj-set-guide")!.onclick = () => {
      this.guideSeen = false;
      try { localStorage.removeItem("plj-guide-seen-v1"); } catch { /* ignore */ }
      this.mode = "playing";
      this.clearOverlay();
      this.focusIndex = -1;
      this.renderFocusPanel();
      this.hint("📖 The how-to-play guide is back on.");
    };
    ov.querySelector<HTMLButtonElement>("#plj-set-restart")!.onclick = () => this.showSetup();
    ov.querySelector<HTMLButtonElement>("#plj-set-menu")!.onclick = () => this.showTitle();
  }

  // --- overlays -------------------------------------------------------------

  private clearOverlay(): void {
    this.ui.overlay.classList.remove("show");
    this.ui.overlay.innerHTML = "";
  }

  private showTitle(): void {
    this.mode = "title";
    this.biography = null;
    const meters = STAT_KEYS.map(
      (k) => `<span class="plj-meter-key"><b style="color:${STAT_META[k].color}">${STAT_META[k].icon}</b> ${STAT_META[k].label}</span>`
    ).join("");
    const bioCount = listBios().length;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title">
        <h1>Pixel Life <span>Journey</span></h1>
        <p class="plj-sub">Live a whole life — from your first bottle of milk to your last sunset.</p>
        <div class="plj-meters">${meters}</div>
        <p class="plj-rules">Walk through 12 rooms, one for each stage of life. Every choice shifts your meters and ages you — or tell a <b>real</b> life story in <b>Biography</b> mode.</p>
        <button class="plj-btn" id="plj-start">Begin your life →</button>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-bio-write">✍️ Write a biography</button>
          <button class="plj-btn plj-btn-ghost" id="plj-bio-list">📖 Biographies${bioCount ? ` (${bioCount})` : ""}</button>
        </div>
        <p class="plj-foot">Arrows / WASD to move · touch green items · swipe tray ↑ to eat/give</p>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-start")!.onclick = () => this.showSetup();
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-bio-write")!.onclick = () => {
      this.editBio = newBiography(this.uid(), "male");
      this.showBioAuthor();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-bio-list")!.onclick = () => this.showBioList();
  }

  private showSetup(): void {
    this.mode = "setup";
    this.biography = null;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title">
        <h2>A new life begins…</h2>
        <p class="plj-sub">Name your character (optional) — it shows on your career profile.</p>
        <div class="plj-bio-head"><input id="plj-setup-name" placeholder="Name (optional)" maxlength="40"></div>
        <p class="plj-sub">Is it a boy or a girl?</p>
        <div class="plj-genders">
          <button class="plj-gender" data-g="male"><span class="plj-gender-face">👦</span><span>Boy</span></button>
          <button class="plj-gender" data-g="female"><span class="plj-gender-face">👧</span><span>Girl</span></button>
        </div>
        <p class="plj-foot">You'll grow from a newborn all the way to old age.</p>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-gender").forEach((btn) => {
      btn.onclick = () => {
        this.playerName = (this.ui.overlay.querySelector<HTMLInputElement>("#plj-setup-name")?.value ?? "").slice(0, 40);
        this.gender = btn.dataset.g === "female" ? "female" : "male";
        this.newGame();
      };
    });
  }

  // --- biography mode -------------------------------------------------------

  /** Start replaying an authored (or recorded) life. */
  private startBiographyPlay(bio: Biography): void {
    this.biography = bio;
    this.gender = bio.gender;
    this.newGame(true); // keep the biography; loadStage(0) builds its moments
    this.playerName = bio.name; // the profile shows whose life this is
  }

  private showBioList(): void {
    this.mode = "biolist";
    const bios = listBios();
    const items = bios.length
      ? bios.map((b) => `
        <div class="plj-bio-item">
          <div class="plj-bio-item-main">
            <span class="plj-bio-item-name">${b.gender === "female" ? "👧" : "👦"} ${esc(b.name || "Untitled life")}</span>
            <span class="plj-bio-item-sub">${esc(b.subtitle || "")}${b.subtitle ? " · " : ""}${bioMomentCount(b)} moments</span>
          </div>
          <div class="plj-bio-item-btns">
            <button class="plj-btn plj-bio-play2" data-id="${b.id}">▶ Play</button>
            <button class="plj-btn plj-btn-ghost plj-bio-edit" data-id="${b.id}" title="Edit">✎</button>
            <button class="plj-btn plj-btn-ghost plj-bio-del2" data-id="${b.id}" title="Delete">🗑</button>
          </div>
        </div>`).join("")
      : `<p class="plj-sub">No biographies yet. Write one — or live a life and save it at the end.</p>`;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-bio-list">
        <h2>📖 Biographies</h2>
        <div class="plj-bio-items">${items}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-bio-back2">← Menu</button>
          <button class="plj-btn" id="plj-bio-new">✍️ Write new</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    const ov = this.ui.overlay;
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-play2").forEach((b) => {
      b.onclick = () => { const bio = getBio(b.dataset.id!); if (bio) this.startBiographyPlay(bio); };
    });
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-edit").forEach((b) => {
      b.onclick = () => { const bio = getBio(b.dataset.id!); if (bio) { this.editBio = bio; this.showBioAuthor(); } };
    });
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-del2").forEach((b) => {
      b.onclick = () => { deleteBio(b.dataset.id!); this.showBioList(); };
    });
    ov.querySelector<HTMLButtonElement>("#plj-bio-back2")!.onclick = () => this.showTitle();
    ov.querySelector<HTMLButtonElement>("#plj-bio-new")!.onclick = () => { this.editBio = newBiography(this.uid(), "male"); this.showBioAuthor(); };
  }

  /** Read the author's text fields back into the draft before any re-render. */
  private syncBioFields(): void {
    const b = this.editBio;
    if (!b) return;
    const ov = this.ui.overlay;
    const name = ov.querySelector<HTMLInputElement>("#plj-bio-name");
    if (name) b.name = name.value;
    const sub = ov.querySelector<HTMLInputElement>("#plj-bio-sub");
    if (sub) b.subtitle = sub.value;
    ov.querySelectorAll<HTMLInputElement>(".plj-bio-title").forEach((inp) => {
      const sid = inp.dataset.stage!;
      const v = inp.value.trim();
      if (v) {
        if (!b.chapters[sid]) b.chapters[sid] = { moments: [] };
        b.chapters[sid].title = v;
      } else if (b.chapters[sid]) {
        b.chapters[sid].title = undefined;
      }
    });
  }

  private showBioAuthor(): void {
    this.mode = "bioauthor";
    const b = this.editBio!;
    const presetOpts = MOMENT_PRESETS.map((p) => `<option value="${p.key}">${p.emoji} ${p.label}</option>`).join("");
    const chapters = STAGES.map((s) => {
      const ch = b.chapters[s.id] ?? { moments: [] };
      const moments = ch.moments.length
        ? ch.moments.map((m, i) => `
          <div class="plj-bio-moment">
            <span>${esc(m.icon)} ${esc(m.desc)}</span>
            <button class="plj-bio-del" data-stage="${s.id}" data-i="${i}">✕</button>
          </div>`).join("")
        : `<div class="plj-bio-empty">— a quiet chapter —</div>`;
      return `
        <details class="plj-bio-chapter">
          <summary><span class="plj-bio-ch-emoji">${s.emoji}</span><input class="plj-bio-title" data-stage="${s.id}" value="${esc(ch.title ?? "")}" placeholder="${esc(s.name)}"><span class="plj-bio-age">${s.ageStart}+</span></summary>
          <div class="plj-bio-moments">${moments}</div>
          <div class="plj-bio-add">
            <input class="plj-bio-text" data-stage="${s.id}" placeholder="What happened? e.g. 'Born in Hanoi'" maxlength="80">
            <select class="plj-bio-preset" data-stage="${s.id}">${presetOpts}</select>
            <button class="plj-btn plj-bio-addbtn" data-stage="${s.id}">+ Add</button>
          </div>
        </details>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-bio-author">
        <h2>✍️ ${b.createdAt ? "Edit biography" : "Write a biography"}</h2>
        <div class="plj-bio-head">
          <input id="plj-bio-name" placeholder="Whose life? (a name)" value="${esc(b.name)}" maxlength="40">
          <input id="plj-bio-sub" placeholder="Subtitle — e.g. 'My grandfather · 1938–2016'" value="${esc(b.subtitle)}" maxlength="60">
          <div class="plj-genders plj-genders-sm">
            <button class="plj-gender${b.gender === "male" ? " sel" : ""}" data-g="male">👦 Boy</button>
            <button class="plj-gender${b.gender === "female" ? " sel" : ""}" data-g="female">👧 Girl</button>
          </div>
        </div>
        <p class="plj-sub">Add the moments that happened in each chapter — pick a feeling, write what happened. Then play it to walk through their life.</p>
        <div class="plj-bio-chapters">${chapters}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-bio-back">← Save & back</button>
          <button class="plj-btn" id="plj-bio-play">▶ Save & play</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    const ov = this.ui.overlay;
    ov.querySelectorAll<HTMLButtonElement>(".plj-gender").forEach((btn) => {
      btn.onclick = () => { this.syncBioFields(); b.gender = btn.dataset.g === "female" ? "female" : "male"; this.showBioAuthor(); };
    });
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-addbtn").forEach((btn) => {
      btn.onclick = () => {
        this.syncBioFields();
        const sid = btn.dataset.stage!;
        const text = ov.querySelector<HTMLInputElement>(`.plj-bio-text[data-stage="${sid}"]`)?.value.trim() ?? "";
        const key = ov.querySelector<HTMLSelectElement>(`.plj-bio-preset[data-stage="${sid}"]`)?.value ?? "memory";
        if (!text) { this.flashBioHint(); return; }
        if (!b.chapters[sid]) b.chapters[sid] = { moments: [] };
        b.chapters[sid].moments.push(makeMoment(this.uid(), text, key));
        this.showBioAuthor();
      };
    });
    ov.querySelectorAll<HTMLButtonElement>(".plj-bio-del").forEach((btn) => {
      btn.onclick = () => {
        this.syncBioFields();
        const sid = btn.dataset.stage!;
        const i = Number(btn.dataset.i);
        b.chapters[sid]?.moments.splice(i, 1);
        this.showBioAuthor();
      };
    });
    ov.querySelector<HTMLButtonElement>("#plj-bio-back")!.onclick = () => { this.persistDraft(); this.showBioList(); };
    ov.querySelector<HTMLButtonElement>("#plj-bio-play")!.onclick = () => {
      this.persistDraft();
      this.startBiographyPlay(this.editBio!);
    };
  }

  private flashBioHint(): void {
    const el = this.ui.overlay.querySelector<HTMLElement>(".plj-bio-author > .plj-sub");
    if (el) { el.textContent = "✏️ Write what happened first, then press + Add."; el.style.color = "#ffd27a"; }
  }

  /** Stamp + save the draft being edited. */
  private persistDraft(): void {
    this.syncBioFields();
    const b = this.editBio;
    if (!b) return;
    if (!b.name.trim()) b.name = "Someone";
    if (!b.createdAt) b.createdAt = Date.now();
    saveBio(b);
  }

  // --- recording a played life into a biography -----------------------------

  private cleanMoment(label: string, icon: string, desc: string, category: OptionCategory, effects: Partial<Stats>, earn?: number, person?: PersonKind): LifeOption {
    return {
      id: "bm_" + this.uid(),
      label,
      icon,
      desc,
      category,
      effects: { ...effects },
      ...(earn ? { earn } : {}),
      ...(person ? { person } : {}),
      storyTag: "bio_moment",
    };
  }

  /** Turn one recorded choice into a clean, replayable moment. */
  private historyEntryToMoment(h: HistoryEntry): LifeOption | null {
    const stage = STAGES.find((s) => s.id === h.stageId);
    const opt = stage?.options.find((o) => o.id === h.optionId);
    if (opt) return this.cleanMoment(opt.label, opt.icon, opt.desc, opt.category, opt.effects, opt.earn, opt.person);
    if (h.optionId.startsWith("job_")) {
      const o = OCCUPATIONS.find((x) => "job_" + x.id === h.optionId);
      if (o) return this.cleanMoment(`Became a ${o.name}`, o.emoji, `Worked as a ${o.name.toLowerCase()}.`, "wealth", { happiness: 3 });
    }
    if (h.optionId.startsWith("wed_")) {
      const p = PARTNERS.find((x) => "wed_" + x.id === h.optionId);
      if (p) return this.cleanMoment(`Married ${p.name}`, "💍", `Married ${p.name}, ${p.title}.`, "social", { happiness: 10, health: 2 });
    }
    if (h.optionId.startsWith("house_")) {
      const ht = HOUSE_TIERS.find((x) => "house_" + x.id === h.optionId);
      if (ht) return this.cleanMoment(`Bought a ${ht.name.toLowerCase()}`, ht.emoji, `Settled into a ${ht.name.toLowerCase()}.`, "special", { happiness: ht.happiness });
    }
    if (h.optionId.startsWith("veh_")) {
      const v = VEHICLES.find((x) => "veh_" + x.id === h.optionId);
      if (v) return this.cleanMoment(`Got a ${v.name.toLowerCase()}`, v.emoji, `Bought a ${v.name.toLowerCase()}.`, "fun", v.effects);
    }
    if (h.optionId.startsWith("commute_")) {
      const c = COMMUTES.find((x) => "commute_" + x.id === h.optionId);
      if (c) return this.cleanMoment(c.name, c.emoji, c.blurb, "special", c.effects);
    }
    return null;
  }

  /** Build a replayable biography from the life that was just lived. */
  private buildBioFromPlaythrough(name: string, subtitle: string): Biography {
    const chapters: Record<string, BioChapter> = {};
    for (const h of this.history) {
      const m = this.historyEntryToMoment(h);
      if (!m) continue;
      if (!chapters[h.stageId]) chapters[h.stageId] = { moments: [] };
      chapters[h.stageId].moments.push(m);
    }
    return { id: "bio_" + this.uid(), name: name.trim() || "My life", gender: this.gender, subtitle: subtitle.trim(), chapters, createdAt: Date.now() };
  }

  private showTransition(lines: string[]): void {
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-grow">
        <div class="plj-grow-emoji">✨</div>
        ${lines.map((l) => `<p>${l}</p>`).join("")}
      </div>`;
    this.ui.overlay.classList.add("show");
  }

  /** Why a partner is out of your league right now (or null if you qualify). */
  private partnerLockReason(p: Partner): string | null {
    const r = p.requires;
    if (!r) return null;
    if (r.minIq && this.stats.smarts < r.minIq) return `needs 🧠 ${r.minIq}`;
    if (r.minMoney && this.netWorth() < r.minMoney) return `needs 💰 ${formatMoney(r.minMoney)}`;
    if (r.minHealth && this.stats.health < r.minHealth) return `wants you fit (❤️ ${r.minHealth})`;
    if (r.maxWeight && this.weight > r.maxWeight) return `wants you fit (⚖️ ≤ ${r.maxWeight})`;
    return null;
  }

  private showPartner(): void {
    const mk = (text: string, color: string) => `<span class="plj-chip" style="color:${color}">${text}</span>`;
    const cards = PARTNERS.map((p) => {
      const reason = this.partnerLockReason(p);
      const locked = !!reason;
      const money = p.moneyMod
        ? mk(`${p.moneyMod > 0 ? "+" : "−"}${formatMoney(Math.abs(p.moneyMod))}/yr`, p.moneyMod > 0 ? "#3ddc84" : "#ff8a8a")
        : "";
      const chips = locked ? mk(`🔒 ${reason}`, "#ff8a8a") : effectChips(p.modifiers) + money;
      return `
      <button class="plj-partner${locked ? " locked" : ""}" data-id="${p.id}" ${locked ? "disabled" : ""}>
        <span class="plj-partner-face">${p.emoji}</span>
        <span class="plj-partner-name">${p.name}</span>
        <span class="plj-partner-title">${p.title}</span>
        <span class="plj-partner-blurb">${p.blurb}</span>
        <span class="plj-chips">${chips}</span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>💍 Time to settle down</h2>
        <p class="plj-sub">Choose who to share your life with — but the best matches expect you to have made something of yourself (smarts, money, fitness). They shape every chapter to come.</p>
        <div class="plj-partners">${cards}</div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const p = PARTNERS.find((x) => x.id === btn.dataset.id);
        if (p) this.pickPartner(p);
      };
    });
  }

  private showCommute(): void {
    const cards = COMMUTES.map((c) => {
      const afford = this.netWorth() >= c.minNet;
      return `
      <button class="plj-partner${afford ? "" : " locked"}" data-id="${c.id}" ${afford ? "" : "disabled"}>
        <span class="plj-partner-face">${c.emoji}</span>
        <span class="plj-partner-name">${c.name}</span>
        <span class="plj-partner-title">${c.cost ? "−" + formatMoney(c.cost) : "free"}</span>
        <span class="plj-partner-blurb">${c.blurb}</span>
        <span class="plj-chips">${afford ? effectChips(c.effects) : `<span class="plj-chip" style="color:#ff8a8a">🔒 needs 💰 ${formatMoney(c.minNet)}</span>`}</span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>🚦 Getting to work</h2>
        <p class="plj-sub">How will you commute? You can always walk, but the comfier options open up as your net worth grows.</p>
        <div class="plj-partners">${cards}</div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const c = COMMUTES.find((x) => x.id === btn.dataset.id);
        if (c) this.pickCommute(c);
      };
    });
  }

  private showOccupation(): void {
    const cards = OCCUPATIONS.map((o) => {
      const locked = this.stats.smarts < o.minIq;
      const pay = o.salaryMul >= 1.4 ? "💰💰💰" : o.salaryMul >= 1.0 ? "💰💰" : "💰";
      return `
      <button class="plj-partner${locked ? " locked" : ""}" data-id="${o.id}" ${locked ? "disabled" : ""}>
        <span class="plj-partner-face">${o.emoji}</span>
        <span class="plj-partner-name">${o.name}</span>
        <span class="plj-partner-title">Pay ${pay}</span>
        <span class="plj-partner-blurb">${o.blurb}</span>
        <span class="plj-chips">${locked ? `<span class="plj-chip" style="color:#ff8a8a">🔒 needs 🧠 ${o.minIq}</span>` : effectChips(o.perks ?? {})}</span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>💼 Choose your career</h2>
        <p class="plj-sub">Your salary = the job × your IQ. A higher IQ unlocks (and is paid more by) the best jobs.</p>
        <div class="plj-partners">${cards}</div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const o = OCCUPATIONS.find((x) => x.id === btn.dataset.id);
        if (o) this.pickOccupation(o);
      };
    });
  }

  /** The 💼 Career desk: change jobs or climb the ladder (IQ-gated). */
  private showCareerMove(): void {
    const cur = this.occupation;
    const cards = OCCUPATIONS.map((o) => {
      const locked = this.stats.smarts < o.minIq;
      const isCur = cur?.id === o.id;
      const better = cur ? o.salaryMul > cur.salaryMul : false;
      const pay = formatMoney(Math.round(28000 * this.incomeMul() * o.salaryMul));
      const tag = isCur ? "✓ current" : locked ? `🔒 needs 🧠 ${o.minIq}` : better ? "Promote ↑" : "Switch";
      const tagColor = isCur ? "#9fe0b8" : locked ? "#ff8a8a" : better ? "#ffd23f" : "#7fc9ff";
      return `
      <button class="plj-partner${isCur || locked ? " locked" : ""}" data-id="${o.id}" ${isCur || locked ? "disabled" : ""}>
        <span class="plj-partner-face">${o.emoji}</span>
        <span class="plj-partner-name">${o.name}</span>
        <span class="plj-partner-title">${TIER_LABELS[o.tier]} · ${o.field}</span>
        <span class="plj-partner-blurb">${o.blurb}</span>
        <span class="plj-chips"><span class="plj-chip" style="color:#3ddc84">${pay}/yr</span><span class="plj-chip" style="color:${tagColor}">${tag}</span></span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>💼 Make a career move</h2>
        <p class="plj-sub">Change jobs or climb the ladder. Salary = the job × your IQ, so better roles need a higher IQ.${cur ? ` You're a ${esc(cur.name)} now.` : ""}</p>
        <div class="plj-partners">${cards}</div>
        <button class="plj-btn plj-btn-ghost" id="plj-cm-cancel">Stay put</button>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const o = OCCUPATIONS.find((x) => x.id === btn.dataset.id);
        if (o) this.changeJob(o);
      };
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-cm-cancel")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  private changeJob(o: Occupation): void {
    const prev = this.occupation;
    this.occupation = o;
    // One-off perks + the "fresh start" happiness only the FIRST time you hold a
    // job this life — otherwise toggling A→B→A→B farms free stats every switch.
    if (!this.jobsTaken.has(o.id)) {
      if (o.perks) this.applyEff(o.perks, "split");
      this.applyEff({ happiness: 4 }, "mental");
      this.jobsTaken.add(o.id);
    }
    this.history.push({
      stageId: STAGES[this.stageIndex].id,
      stageName: STAGES[this.stageIndex].name,
      optionId: "job_" + o.id,
      storyTag: o.storyTag,
      ageAt: this.age,
    });
    this.timeline[this.stageIndex] = this.snapshot(); // re-capture so rewind keeps the move
    this.mode = "playing";
    this.clearOverlay();
    this.hint(prev && o.salaryMul > prev.salaryMul ? `📈 You were promoted to ${o.name}!` : `${o.emoji} You're now a ${o.name}.`);
  }

  /** A LinkedIn-style career profile: headline, salary, lifetime earnings, history. */
  private showProfile(): void {
    if (this.mode !== "playing" || this.stageIndex < CAREER_INDEX) return;
    this.mode = "profile";
    const o = this.occupation;
    const name = this.playerName.trim() || (this.gender === "female" ? "Alex" : "Sam");
    const iq = Math.round(this.stats.smarts);
    const salary = o ? formatMoney(Math.round(28000 * this.incomeMul() * o.salaryMul)) : "—";
    const headline = o ? `${o.name} · ${o.field}` : "Finding my path";
    const badges: string[] = [];
    if (o) badges.push(`📊 ${TIER_LABELS[o.tier]}`);
    if (this.netWorth() > 1000000) badges.push("⭐ Premium");
    if (iq >= 130) badges.push("✔️ verified");
    if (o && o.tier >= 6) badges.push("💼 Hiring");
    // experience timeline from every job ever held
    const jobs = this.history
      .filter((h) => h.optionId.startsWith("job_"))
      .map((h) => OCCUPATIONS.find((x) => "job_" + x.id === h.optionId) && { occ: OCCUPATIONS.find((x) => "job_" + x.id === h.optionId)!, from: Math.floor(h.ageAt) })
      .filter(Boolean) as { occ: Occupation; from: number }[];
    const tl = jobs
      .map((j, i) => ({ ...j, to: i < jobs.length - 1 ? jobs[i + 1].from : Math.floor(this.age) }))
      .reverse();
    const timeline = tl.length
      ? tl.map((j) => `<div class="plj-prof-job"><span>${j.occ.emoji} <b>${esc(j.occ.name)}</b> · ${j.occ.field}</span><span class="plj-prof-yrs">age ${j.from}–${j.to}</span></div>`).join("")
      : `<p class="plj-sub">No jobs held yet.</p>`;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-profile">
        <div class="plj-prof-head">
          <div class="plj-prof-avatar">${o ? o.emoji : "🧑"}</div>
          <div class="plj-prof-id">
            <h2>${esc(name)}</h2>
            <p class="plj-prof-headline">${esc(headline)} · 🧠 ${iq}</p>
            ${badges.length ? `<p class="plj-prof-badges">${badges.join(" · ")}</p>` : ""}
          </div>
        </div>
        <div class="plj-prof-stats">
          <span><b>${salary}</b><small>per year</small></span>
          <span><b>${formatMoney(this.lifetimeEarned)}</b><small>earned</small></span>
          <span><b>${this.connections >= 500 ? "500+" : this.connections}</b><small>connections</small></span>
          <span><b>${formatMoney(this.netWorth())}</b><small>net worth</small></span>
        </div>
        <h3 class="plj-prof-h3">💼 Experience</h3>
        <div class="plj-prof-timeline">${timeline}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-prof-close">← Back</button>
          ${o ? `<button class="plj-btn" id="plj-prof-move">📈 Make a move</button>` : ""}
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-prof-close")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
    const mv = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-prof-move");
    if (mv) mv.onclick = () => this.showCareerMove();
  }

  private showHouse(): void {
    const stars = (q: number) => "★".repeat(q) + "☆".repeat(5 - q);
    const cards = HOUSE_TIERS.map((h) => {
      const afford = this.money >= h.cost;
      const upkeep = h.upkeep > 0 ? `<span class="plj-chip" style="color:#ffb4b4">−${formatMoney(h.upkeep)}/yr</span>` : "";
      return `
      <button class="plj-partner${afford ? "" : " locked"}" data-id="${h.id}" ${afford ? "" : "disabled"}>
        <span class="plj-partner-face">${h.emoji}</span>
        <span class="plj-partner-name">${h.name}</span>
        <span class="plj-partner-title">${stars(h.quality)} · ${formatMoney(h.cost)}</span>
        <span class="plj-partner-blurb">${h.blurb}</span>
        <span class="plj-chips"><span class="plj-chip" style="color:#ffd23f">+${h.happiness} 😊</span>${upkeep}<span class="plj-chip" style="color:#3ddc84">rent ${formatMoney(h.rentYield)}</span></span>
      </button>`;
    }).join("");
    const owned = this.homes.length;
    const portfolio = owned
      ? `<p class="plj-sub" style="color:#9fe0b8">You own ${owned} ${owned === 1 ? "property" : "properties"} · live-in quality ${"★".repeat(this.homeQuality)}${this.rentalIncome > 0 ? ` · rent ${formatMoney(this.rentalIncome)}/yr` : ""}. Buy another to rent it out.</p>`
      : "";
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>🏠 Buy property</h2>
        <p class="plj-sub">You live in the grandest place you own — that sets your home's look. Pricier homes cost upkeep every year, but a spare place earns rent. Buy only what you can afford.</p>
        ${portfolio}
        <div class="plj-partners">${cards}</div>
        <button class="plj-btn plj-btn-ghost" id="plj-house-cancel">Not now</button>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const h = HOUSE_TIERS.find((x) => x.id === btn.dataset.id);
        if (h) this.buyHouse(h);
      };
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-house-cancel")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  private showVehicle(): void {
    const cards = VEHICLES.map((v) => {
      const owned = this.owned.has("veh_" + v.id);
      const afford = this.money >= v.cost;
      const usable = !owned && afford;
      return `
      <button class="plj-partner${usable ? "" : " locked"}" data-id="${v.id}" ${usable ? "" : "disabled"}>
        <span class="plj-partner-face">${v.emoji}</span>
        <span class="plj-partner-name">${v.name}</span>
        <span class="plj-partner-title">${owned ? "✓ owned" : formatMoney(v.cost)}</span>
        <span class="plj-partner-blurb">${v.blurb}</span>
        <span class="plj-chips"><span class="plj-chip" style="color:#ff8a8a">−${formatMoney(v.cost)}</span>${effectChips(v.effects)}</span>
      </button>`;
    }).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>🛵 Buy a vehicle</h2>
        <p class="plj-sub">Your own set of wheels — yours for life. A bicycle keeps you fit; a motorbike thrills; a car is comfort; a sports car is pure status. Pricier rides leave less for everything else.</p>
        <div class="plj-partners">${cards}</div>
        <button class="plj-btn plj-btn-ghost" id="plj-veh-cancel">Not now</button>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner:not(.locked)").forEach((btn) => {
      btn.onclick = () => {
        const v = VEHICLES.find((x) => x.id === btn.dataset.id);
        if (v) this.buyVehicle(v);
      };
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-veh-cancel")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  private showTimeTravel(): void {
    if (this.mode !== "playing" || this.biography) return;
    const past: { snap: Snapshot; i: number }[] = [];
    this.timeline.forEach((snap, i) => {
      if (snap && i <= this.stageIndex) past.push({ snap, i });
    });
    if (past.length < 2) return;
    this.mode = "timetravel";
    const cards = past
      .map(({ snap, i }) => {
        const st = STAGES[i];
        return `
      <button class="plj-partner" data-i="${i}">
        <span class="plj-partner-face">${st.emoji}</span>
        <span class="plj-partner-name">${st.name}</span>
        <span class="plj-partner-title">Age ${Math.floor(snap.age)}</span>
      </button>`;
      })
      .join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-partners-card">
        <h2>⏳ Time-Travel Pill</h2>
        <p class="plj-sub">Jump back to any age and re-live from there — a chance to change everything that came after.</p>
        <div class="plj-partners">${cards}</div>
        <button class="plj-btn plj-btn-ghost" id="plj-tt-cancel">Stay in the present</button>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-partner").forEach((btn) => {
      btn.onclick = () => this.rewind(Number(btn.dataset.i));
    });
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-tt-cancel")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  private showEnding(): void {
    const story = this.story!;
    const summary = STAT_KEYS.map(
      (k) => `<span class="plj-end-stat"><b style="color:${STAT_META[k].color}">${STAT_META[k].icon}</b> ${Math.round(this.stats[k])}</span>`
    ).join("") + `<span class="plj-end-stat"><b style="color:#3ddc84">💰</b> ${formatMoney(this.netWorth())}</span>`;
    // a freshly LIVED life (not a replay) can be saved as a replayable biography
    const recordBtn = this.biography ? "" : `<button class="plj-btn plj-btn-ghost" id="plj-record">💾 Save as a biography</button>`;
    const bioHead = this.biography
      ? `<p class="plj-sub" style="margin-top:-6px">📖 ${esc(this.biography.name || "A life")}${this.biography.subtitle ? " · " + esc(this.biography.subtitle) : ""}</p>`
      : "";
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-end">
        <h2>${story.title}</h2>
        ${bioHead}
        <p class="plj-epitaph">“${story.epitaph}”</p>
        <div class="plj-story">${story.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>
        <div class="plj-end-stats">${summary}</div>
        <div class="plj-title-row">
          <button class="plj-btn" id="plj-restart">Live another life ↺</button>
          ${recordBtn}
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-restart")!.onclick = () => this.showTitle();
    const rec = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-record");
    if (rec) rec.onclick = () => this.showRecordForm();
  }

  /** A little form to name + save the life you just lived as a biography. */
  private showRecordForm(): void {
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title">
        <h2>💾 Save this life</h2>
        <p class="plj-sub">Give it a name and it becomes a biography you can replay and share.</p>
        <div class="plj-bio-head">
          <input id="plj-rec-name" placeholder="Whose life was this? (a name)" maxlength="40">
          <input id="plj-rec-sub" placeholder="Subtitle (optional)" maxlength="60">
        </div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-rec-cancel">← Back</button>
          <button class="plj-btn" id="plj-rec-save">💾 Save biography</button>
        </div>
      </div>`;
    const ov = this.ui.overlay;
    ov.querySelector<HTMLButtonElement>("#plj-rec-cancel")!.onclick = () => this.showEnding();
    ov.querySelector<HTMLButtonElement>("#plj-rec-save")!.onclick = () => {
      const name = ov.querySelector<HTMLInputElement>("#plj-rec-name")?.value ?? "";
      const sub = ov.querySelector<HTMLInputElement>("#plj-rec-sub")?.value ?? "";
      const bio = this.buildBioFromPlaythrough(name, sub);
      saveBio(bio);
      this.editBio = bio;
      this.showBioList();
    };
  }

  // --- input ----------------------------------------------------------------

  private bindInput(): void {
    const setDir = (e: KeyboardEvent, down: boolean): void => {
      switch (e.key) {
        case "ArrowLeft": case "a": case "A": this.input.left = down; break;
        case "ArrowRight": case "d": case "D": this.input.right = down; break;
        case "ArrowUp": case "w": case "W": this.input.up = down; break;
        case "ArrowDown": case "s": case "S": this.input.down = down; break;
        case " ": case "Enter": case "e": case "E":
          if (down) this.actQueued = true;
          break;
        case "t": case "T":
          if (down) this.showTimeTravel();
          break;
        case "p": case "P":
          if (down) this.showProfile();
          break;
        default: return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", (e) => setDir(e, true));
    window.addEventListener("keyup", (e) => setDir(e, false));

    const bindHold = (node: HTMLElement, key: "left" | "right" | "up" | "down"): void => {
      const on = (e: Event) => { e.preventDefault(); this.input[key] = true; };
      const off = (e: Event) => { e.preventDefault(); this.input[key] = false; };
      node.addEventListener("pointerdown", on);
      node.addEventListener("pointerup", off);
      node.addEventListener("pointerleave", off);
      node.addEventListener("pointercancel", off);
    };
    bindHold(this.ui.touch.left, "left");
    bindHold(this.ui.touch.right, "right");
    bindHold(this.ui.touch.up, "up");
    bindHold(this.ui.touch.down, "down");

    let inventoryDrag: { x: number; y: number; index: number | null; pointerId: number } | null = null;
    const inventoryIndexFrom = (target: EventTarget | null): number | null => {
      const item = target instanceof HTMLElement ? target.closest<HTMLElement>("[data-inv-index]") : null;
      if (!item?.dataset.invIndex) return null;
      const index = Number(item.dataset.invIndex);
      return Number.isFinite(index) ? index : null;
    };
    this.ui.inventoryWrap.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      inventoryDrag = { x: e.clientX, y: e.clientY, index: inventoryIndexFrom(e.target), pointerId: e.pointerId };
      this.ui.inventoryWrap.setPointerCapture?.(e.pointerId);
    });
    this.ui.inventoryWrap.addEventListener("pointerup", (e) => {
      e.preventDefault();
      if (!inventoryDrag || inventoryDrag.pointerId !== e.pointerId) return;
      const dx = e.clientX - inventoryDrag.x;
      const dy = e.clientY - inventoryDrag.y;
      const index = inventoryIndexFrom(e.target) ?? inventoryDrag.index;
      inventoryDrag = null;
      if (dy < -28 && Math.abs(dy) > Math.abs(dx) * 0.7) {
        this.useSelectedInventoryItem();
      } else if (dx < -24) {
        this.stepInventorySelection(1);
      } else if (dx > 24) {
        this.stepInventorySelection(-1);
      } else if (index !== null) {
        this.setInventorySelection(index);
      }
    });
    this.ui.inventoryWrap.addEventListener("pointercancel", () => {
      inventoryDrag = null;
    });
    this.ui.inventoryWrap.addEventListener("wheel", (e) => {
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (Math.abs(delta) < 10) return;
      e.preventDefault();
      this.stepInventorySelection(delta > 0 ? 1 : -1);
    });
    this.ui.timeTravel.addEventListener("click", () => this.showTimeTravel());
    this.ui.profileBtn.addEventListener("click", () => this.showProfile());
    this.ui.settingsBtn.addEventListener("click", () => this.showSettings());
    this.ui.skipBtn.addEventListener("click", () => this.skipStage());
  }
}

function effectChips(effects: Partial<Stats>): string {
  return (Object.entries(effects) as [StatKey, number][])
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<span class="plj-chip" style="color:${v > 0 ? STAT_META[k].color : "#ff8a8a"}">${
          v > 0 ? "+" : ""
        }${Math.round(v)} ${STAT_META[k].icon}</span>`
    )
    .join("");
}

/** Draw a glowing ground-ring under a moving item (green = touch, red = chase). */
function ellipseRing(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.strokeStyle = ctx.fillStyle as string;
  ctx.lineWidth = 3;
  ctx.stroke();
}

/** Escape user text for safe insertion into HTML (attributes + content). */
function esc(s: string): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** A normally-distributed sample (Box–Muller), used to roll IQ potential at birth. */
function gaussian(mean: number, sd: number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Pick one event from a pool by its `weight`. */
function weightedPick(pool: RandomEvent[]): RandomEvent {
  const total = pool.reduce((sum, e) => sum + e.weight, 0);
  let r = Math.random() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return pool[pool.length - 1];
}
