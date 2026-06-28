import type {
  Gender,
  HeritageStyle,
  HistoryEntry,
  HouseTier,
  LifeOption,
  Occupation,
  OptionCategory,
  Partner,
  PersonKind,
  PetKind,
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
import { avatarLook, drawAvatar, drawEventItem, drawPerson, drawPet, drawRoom, drawStation, type AvatarFacing } from "./sprites";
import { createUI, type UIRefs } from "./ui";
import { generateStory, type CauseOfEnd, type LifeStory } from "./story";

const W = 640;
const H = 800; // a tall room with only a thin sky strip above the playfield
const CANVAS_SCALE = 2;
const LANDSCAPE_W = 960;
const LANDSCAPE_H = 540;
const LANDSCAPE_FLOOR_Y = 50;
const LANDSCAPE_PY_MAX = 500;
const FLOOR_Y = 72; // sky-only non-playable band; ground starts right below it
const DOOR_X = W - 74;
const STAGE_GATE_R = 31;
const GATE_HALF_H = STAGE_GATE_R + 7;
const UTILITY_GATE_X = 58;
const FAMILY_TREE_GATE_R = 23;
const ASSETS_GATE_R = 21;
const TRAINING_GATE_R = 21;
const UTILITY_GATE_GAP = 54;
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
const PET_FOLLOW_SPEED = 124;
const PET_HAPPY_R = 34;
const PET_HAPPY_COOLDOWN = 6;
const CAT_PURR_HAPPY = 0.2;
const CAT_PURR_INTERVAL = 5;
const BAD_SOCIAL_TAGS = ["smoker_friend", "gangster_friend", "playboy_friend"];
const INVENTORY_MAX_SLOTS = 8;
const INVENTORY_MAX_COUNT = 9;
const FOOD_USE_COOLDOWN = 5;
const ELEMENTARY_INDEX = STAGES.findIndex((s) => s.id === "elementary");
const MIDDLE_INDEX = STAGES.findIndex((s) => s.id === "middle");
const CAREER_INDEX = STAGES.findIndex((s) => s.id === "career");
const ELEMENTARY_ASSETS_MONEY = 200000;
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
const HOUSE_APPRECIATION_MIN = 0.03;
const HOUSE_APPRECIATION_MAX = 0.05;
const VEHICLE_DEPRECIATION = 0.12;
const LIFE_SPEEDS = [1 / 1024, 1 / 512, 1 / 128, 1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8, 16] as const;
const LIFE_SPEED_DEFAULT_INDEX = LIFE_SPEEDS.indexOf(1);
const LIFE_SPEED_MIN_INDEX = 0;
const LIFE_SPEED_MAX_INDEX = LIFE_SPEEDS.length - 1;
const HERITAGE_OPTIONS: { id: HeritageStyle; label: string; icon: string }[] = [
  { id: "western", label: "Western / current", icon: "🌎" },
  { id: "asian", label: "Asian", icon: "🏮" },
  { id: "middleEastern", label: "Middle Eastern", icon: "🕌" },
  { id: "black", label: "Black / African diaspora", icon: "🌍" },
];
const TRAINING_LINKS = {
  iq: "https://www.youtube.com/results?search_query=how+to+be+smarter+increase+iq",
  money: "https://www.youtube.com/results?search_query=financial+education+how+to+earn+more+money",
  family: "https://www.youtube.com/results?search_query=how+to+treat+family+members+well+mental+health",
} as const;
type TrainingKind = keyof typeof TRAINING_LINKS;
type TrainingCategory = "iq" | "eq" | "strategy";
type TrainingLevel = "starter" | "practice" | "advanced";

interface TrainingQuestion {
  q: string;
  answers: readonly string[];
  correct: number;
  win: string;
}

type TrainingQuestionBank = Record<TrainingLevel, TrainingQuestion[]>;

const TRAINING_DATABASE_URL = "./data/training-questions.json";
const TRAINING_LEVELS: { id: TrainingLevel; label: string }[] = [
  { id: "starter", label: "Lv 1" },
  { id: "practice", label: "Lv 2" },
  { id: "advanced", label: "Lv 3" },
];
const TRAINING_IQ_RANGES: Record<TrainingLevel, readonly [number, number]> = {
  starter: [0, 14],
  practice: [14, 28],
  advanced: [28, 40],
};
const TRAINING_CATEGORY_META: Record<TrainingCategory, { icon: string; title: string; summary: string }> = {
  iq: {
    icon: "🧩",
    title: "Tricky IQ Game",
    summary: "Logic, pattern, and careful-reading traps.",
  },
  eq: {
    icon: "💛",
    title: "EQ Questions",
    summary: "Feelings, empathy, conflict, and family care.",
  },
  strategy: {
    icon: "📈",
    title: "Strategy Questions",
    summary: "Money, career, risk, and long-term planning.",
  },
};
const TRAINING_CATEGORIES: TrainingCategory[] = ["iq", "eq", "strategy"];
const TRAINING_PUZZLES = [
  {
    q: "A clock shows 3:15. What is the angle between the hour and minute hands?",
    answers: ["7.5 degrees", "15 degrees", "22.5 degrees"],
    correct: 0,
    win: "Tiny geometry win. +2 IQ.",
  },
  {
    q: "Which number comes next: 2, 6, 12, 20, 30, ?",
    answers: ["36", "40", "42"],
    correct: 2,
    win: "You spotted the growing gap pattern. +2 IQ.",
  },
  {
    q: "All bloops are razzies. Some razzies are lups. Are all bloops definitely lups?",
    answers: ["Yes", "No", "Only at night"],
    correct: 1,
    win: "Careful logic beats fast guessing. +2 IQ.",
  },
  {
    q: "Which number comes next: 3, 6, 11, 18, 27, ?",
    answers: ["36", "38", "41"],
    correct: 1,
    win: "You followed the odd-number gaps. +2 IQ.",
  },
  {
    q: "A book and a pen cost $1.10 together. The book costs $1.00 more than the pen. How much is the pen?",
    answers: ["$0.05", "$0.10", "$0.15"],
    correct: 0,
    win: "You slowed down and avoided the quick trap. +2 IQ.",
  },
  {
    q: "If 6 robots make 6 toys in 6 minutes, how many minutes do 60 robots need to make 60 toys?",
    answers: ["6 minutes", "10 minutes", "60 minutes"],
    correct: 0,
    win: "Rate reasoning unlocked. +2 IQ.",
  },
  {
    q: "Which pair continues the pattern: 1A, 2B, 4D, 8H, ?",
    answers: ["10J", "12L", "16P"],
    correct: 2,
    win: "You tracked both number and letter doubling. +2 IQ.",
  },
  {
    q: "Maya is older than Leo. Leo is older than Nina. Who is youngest?",
    answers: ["Maya", "Leo", "Nina"],
    correct: 2,
    win: "Clean ordering, clean answer. +2 IQ.",
  },
  {
    q: "If today is Wednesday, what day is 10 days from now?",
    answers: ["Friday", "Saturday", "Sunday"],
    correct: 1,
    win: "Calendar math handled. +2 IQ.",
  },
  {
    q: "Which word does not belong: apple, pear, carrot, peach?",
    answers: ["pear", "carrot", "peach"],
    correct: 1,
    win: "Category spotting sharpened. +2 IQ.",
  },
  {
    q: "Wing is to bird as fin is to what?",
    answers: ["fish", "boat", "cloud"],
    correct: 0,
    win: "Analogy solved. +2 IQ.",
  },
  {
    q: "All red boxes are heavy. This box is heavy. Can we prove it is red?",
    answers: ["Yes", "No", "Only if it is square"],
    correct: 1,
    win: "You avoided reversing the logic. +2 IQ.",
  },
  {
    q: "Which number comes next: 2, 3, 5, 9, 17, ?",
    answers: ["31", "33", "35"],
    correct: 1,
    win: "You spotted the doubling jumps. +2 IQ.",
  },
  {
    q: "In a race, you pass the person in second place. What place are you in now?",
    answers: ["First", "Second", "Third"],
    correct: 1,
    win: "Nice trap dodge. +2 IQ.",
  },
  {
    q: "How many months have at least 28 days?",
    answers: ["1", "11", "12"],
    correct: 2,
    win: "You read the question carefully. +2 IQ.",
  },
  {
    q: "A die has opposite faces that sum to 7. What is opposite 2?",
    answers: ["3", "4", "5"],
    correct: 2,
    win: "Spatial rule remembered. +2 IQ.",
  },
  {
    q: "Which number is missing: 4, 9, 16, 25, ?",
    answers: ["30", "36", "42"],
    correct: 1,
    win: "Square-number pattern solved. +2 IQ.",
  },
  {
    q: "If A is taller than B, and B is taller than C, which must be true?",
    answers: ["A is taller than C", "C is taller than A", "B is shortest"],
    correct: 0,
    win: "Transitive logic clicked. +2 IQ.",
  },
  {
    q: "A code shifts each letter forward by 1. What does CAT become?",
    answers: ["DBU", "CBU", "DBT"],
    correct: 0,
    win: "Code pattern cracked. +2 IQ.",
  },
  {
    q: "Which comes next: 81, 27, 9, ?",
    answers: ["6", "3", "1"],
    correct: 1,
    win: "Division pattern found. +2 IQ.",
  },
  {
    q: "One kilogram of feathers and one kilogram of rice: which is heavier?",
    answers: ["feathers", "rice", "same weight"],
    correct: 2,
    win: "Measurement trap avoided. +2 IQ.",
  },
  {
    q: "A square has four equal sides. If its side is 5, what is its perimeter?",
    answers: ["10", "20", "25"],
    correct: 1,
    win: "Geometry basics are strong. +2 IQ.",
  },
  {
    q: "Which word completes the pattern: hot is to cold as up is to ?",
    answers: ["high", "down", "sky"],
    correct: 1,
    win: "Opposite-pair reasoning solved. +2 IQ.",
  },
  {
    q: "A train leaves at 2:00 and arrives at 3:45. How long was the trip?",
    answers: ["1 hour 15 minutes", "1 hour 45 minutes", "2 hours 15 minutes"],
    correct: 1,
    win: "Time reasoning improved. +2 IQ.",
  },
  {
    q: "Which number is the odd one out: 14, 21, 28, 35, 43?",
    answers: ["21", "35", "43"],
    correct: 2,
    win: "Multiples pattern spotted. +2 IQ.",
  },
  {
    q: "A drawer has red, blue, and green marbles. How many must you grab to guarantee two are the same color?",
    answers: ["3", "4", "5"],
    correct: 1,
    win: "Pigeonhole thinking unlocked. +2 IQ.",
  },
  {
    q: "You enter a dark room with one match, a candle, and a lamp. What should you light first?",
    answers: ["the candle", "the lamp", "the match"],
    correct: 2,
    win: "Careful first-step logic. +2 IQ.",
  },
  {
    q: "What letter comes next: O, T, T, F, F, S, S, ?",
    answers: ["E", "N", "T"],
    correct: 0,
    win: "You saw the number initials. +2 IQ.",
  },
  {
    q: "Two mothers and two daughters share three snacks equally, with one snack each. How is that possible?",
    answers: ["one is a grandmother", "one snack is split", "there are four people"],
    correct: 0,
    win: "Family-relationship trick solved. +2 IQ.",
  },
  {
    q: "You face north. Turn right twice, then left once. Which way are you facing?",
    answers: ["east", "south", "west"],
    correct: 0,
    win: "Mental rotation worked. +2 IQ.",
  },
  {
    q: "A clock is set right at noon but loses 10 minutes every hour. What time will it show at 3:00 real time?",
    answers: ["2:30", "2:40", "3:10"],
    correct: 0,
    win: "Time-drift reasoning solved. +2 IQ.",
  },
  {
    q: "All Zips are Zaps. No Zaps are Zops. Can any Zip be a Zop?",
    answers: ["yes", "no", "only some"],
    correct: 1,
    win: "Set logic is clean. +2 IQ.",
  },
  {
    q: "How many letters are in the phrase 'the alphabet'?",
    answers: ["8", "11", "26"],
    correct: 1,
    win: "You read the words, not the idea. +2 IQ.",
  },
  {
    q: "What pair comes next: AZ, BY, CX, ?",
    answers: ["DW", "DU", "EV"],
    correct: 0,
    win: "Opposite alphabet pattern found. +2 IQ.",
  },
  {
    q: "Two fathers and two sons sit together, but there are only three people. How?",
    answers: ["grandfather, father, son", "one is imaginary", "two are twins"],
    correct: 0,
    win: "Overlapping roles spotted. +2 IQ.",
  },
  {
    q: "A loud clap scares five birds off a fence. Two were closest to the sound. How many birds stay?",
    answers: ["3", "5", "0"],
    correct: 2,
    win: "Real-world consequence noticed. +2 IQ.",
  },
  {
    q: "Which word becomes longer when you add two letters to it?",
    answers: ["long", "short", "wide"],
    correct: 1,
    win: "Wordplay trap solved. +2 IQ.",
  },
  {
    q: "A boat is full of people, but there is not a single person on it. Why?",
    answers: ["everyone is married", "the boat is empty", "it is underwater"],
    correct: 0,
    win: "The wording twist landed. +2 IQ.",
  },
  {
    q: "Which number's English spelling has letters in alphabetical order?",
    answers: ["forty", "sixty", "ninety"],
    correct: 0,
    win: "Letter-order pattern solved. +2 IQ.",
  },
  {
    q: "A word is hidden here: SILENT can be rearranged into what?",
    answers: ["listen", "inlets", "both"],
    correct: 2,
    win: "Anagram flexibility. +2 IQ.",
  },
] as const;
const TRAINING_BANKS: Record<Exclude<TrainingCategory, "iq">, Record<TrainingLevel, TrainingQuestion[]>> = {
  eq: {
    starter: [
      {
        q: "A friend gets quiet after your joke. What is the best first move?",
        answers: ["tease them more", "ask privately if they are okay", "ignore it"],
        correct: 1,
        win: "Empathy noticed the signal. +EQ.",
      },
      {
        q: "You receive an angry message from a sibling. What should you do before replying?",
        answers: ["pause and breathe", "send a bigger message", "block them forever"],
        correct: 0,
        win: "Self-control kept the bridge open. +EQ.",
      },
      {
        q: "A classmate wins an award you wanted. Which response shows strong EQ?",
        answers: ["congratulate and learn", "say it was luck", "stop talking to them"],
        correct: 0,
        win: "You turned jealousy into growth. +EQ.",
      },
      {
        q: "A parent says they are disappointed. What helps most?",
        answers: ["listen and ask how to improve", "walk away mid-sentence", "blame someone else"],
        correct: 0,
        win: "Repair starts with listening. +EQ.",
      },
      {
        q: "You feel nervous before a test. Which choice is healthiest?",
        answers: ["name the feeling and plan", "pretend nothing exists", "panic-scroll"],
        correct: 0,
        win: "Naming emotions makes them easier to guide. +EQ.",
      },
      {
        q: "A friend shares a private worry. What should you do?",
        answers: ["share it for gossip", "keep it private unless safety is at risk", "laugh it off"],
        correct: 1,
        win: "Trust is protected. +EQ.",
      },
      {
        q: "A new student sits alone at lunch. What is a kind move?",
        answers: ["invite them with no pressure", "stare at them", "make a joke about it"],
        correct: 0,
        win: "Social awareness found a gentle opening. +EQ.",
      },
      {
        q: "You made a mistake that hurt someone. What apology works best?",
        answers: ["I am sorry for what I did", "sorry you feel that way", "everyone makes mistakes"],
        correct: 0,
        win: "A clear apology repairs faster. +EQ.",
      },
      {
        q: "An argument is getting louder. What lowers the heat?",
        answers: ["speak slower and quieter", "interrupt faster", "win by volume"],
        correct: 0,
        win: "Calm tone changed the room. +EQ.",
      },
      {
        q: "Someone celebrates a tradition you do not know. What shows respect?",
        answers: ["ask kindly if they want to share", "call it strange", "copy it as a joke"],
        correct: 0,
        win: "Curiosity stayed respectful. +EQ.",
      },
    ],
    practice: [
      {
        q: "A friend cancels plans twice. What is the most emotionally smart response?",
        answers: ["accuse them", "check in and ask what is happening", "ghost them"],
        correct: 1,
        win: "You checked the story before judging. +EQ.",
      },
      {
        q: "Someone says, 'You never listen.' What should you try first?",
        answers: ["repeat their main point", "explain why they are wrong", "change the subject"],
        correct: 0,
        win: "Reflection showed you heard them. +EQ.",
      },
      {
        q: "A bad friend pressures you to do something risky. What is strongest?",
        answers: ["set a boundary and leave", "prove you are brave", "say yes to fit in"],
        correct: 0,
        win: "Boundaries protected your future. +EQ.",
      },
      {
        q: "Two relatives fight about shared money. What helps the conversation?",
        answers: ["write facts and needs first", "pick a side instantly", "raise old grudges"],
        correct: 0,
        win: "You separated facts from heat. +EQ.",
      },
      {
        q: "You feel jealous when a sibling is praised. What is the best inner move?",
        answers: ["notice jealousy and choose a goal", "attack the sibling", "pretend you feel nothing"],
        correct: 0,
        win: "You converted emotion into direction. +EQ.",
      },
      {
        q: "A teammate is late twice. What is a fair first step?",
        answers: ["talk privately about impact", "mock them in public", "do nothing forever"],
        correct: 0,
        win: "Private repair beats public shame. +EQ.",
      },
      {
        q: "A customer or teacher is angry. What response usually de-escalates?",
        answers: ["acknowledge feeling, then solve", "match their anger", "say calm down"],
        correct: 0,
        win: "You handled emotion before solution. +EQ.",
      },
      {
        q: "A family member is grieving. What helps most early on?",
        answers: ["listen and stay present", "force them to cheer up", "rank whose pain is worse"],
        correct: 0,
        win: "Presence can be powerful. +EQ.",
      },
      {
        q: "An online comment insults you. What protects your mental health?",
        answers: ["pause before responding", "fight all night", "post their private info"],
        correct: 0,
        win: "Impulse control saved energy. +EQ.",
      },
      {
        q: "In a group choice, one quiet person is affected most. What should you do?",
        answers: ["invite their view", "decide without them", "speak over them"],
        correct: 0,
        win: "Inclusive decisions are stronger. +EQ.",
      },
    ],
    advanced: [
      {
        q: "You are leading while stressed. What builds trust?",
        answers: ["name the pressure and clarify next steps", "hide everything", "snap at people"],
        correct: 0,
        win: "Honest leadership steadied the group. +EQ.",
      },
      {
        q: "A friend asks for a loan you cannot afford. What is healthiest?",
        answers: ["empathize and set a clear no", "lend rent money", "shame them"],
        correct: 0,
        win: "Kind boundaries are still kind. +EQ.",
      },
      {
        q: "You need to describe hurt without attacking. Which opener is best?",
        answers: ["I felt hurt when...", "You always ruin things", "Everyone agrees with me"],
        correct: 0,
        win: "An I-statement kept the door open. +EQ.",
      },
      {
        q: "Someone says 'I'm fine' but looks tense. What is a good response?",
        answers: ["gently ask once, then respect space", "demand a confession", "ignore all signals"],
        correct: 0,
        win: "You balanced care with respect. +EQ.",
      },
      {
        q: "Your feedback hurt someone more than expected. What should come first?",
        answers: ["listen and repair impact", "defend your intent only", "say they are too sensitive"],
        correct: 0,
        win: "Impact got attention. +EQ.",
      },
      {
        q: "A partner keeps interrupting. What is a mature request?",
        answers: ["Can we take turns finishing?", "You never care", "silent treatment"],
        correct: 0,
        win: "Specific requests beat global blame. +EQ.",
      },
      {
        q: "A child is melting down in public. What helps most?",
        answers: ["stay calm and name the feeling", "shout louder", "mock the crying"],
        correct: 0,
        win: "Co-regulation helped the child settle. +EQ.",
      },
      {
        q: "A coworker takes credit for your work. What is strategic and fair?",
        answers: ["document and discuss calmly", "explode in the meeting", "quit instantly"],
        correct: 0,
        win: "You protected truth without losing control. +EQ.",
      },
      {
        q: "Someone gives criticism that is partly wrong. What is the best response?",
        answers: ["find the useful part first", "reject all of it", "attack their character"],
        correct: 0,
        win: "You extracted value from discomfort. +EQ.",
      },
      {
        q: "Two people want opposite outcomes. What creates a better chance of agreement?",
        answers: ["ask the need behind each position", "vote before listening", "repeat your demand"],
        correct: 0,
        win: "Needs revealed room for compromise. +EQ.",
      },
    ],
  },
  strategy: {
    starter: [
      {
        q: "What is the main job of a budget?",
        answers: ["match income to plans", "hide spending", "make money disappear"],
        correct: 0,
        win: "Budget thinking sharpened. +Strategy.",
      },
      {
        q: "What should usually come before risky investing?",
        answers: ["emergency savings", "a bigger phone", "guessing stocks"],
        correct: 0,
        win: "Risk order improved. +Strategy.",
      },
      {
        q: "Which debt is usually best to attack first?",
        answers: ["highest interest debt", "smallest font debt", "oldest-looking bill"],
        correct: 0,
        win: "Interest-cost strategy improved. +Strategy.",
      },
      {
        q: "Why is starting to save early powerful?",
        answers: ["compound growth has more time", "banks give magic gifts", "prices stop changing"],
        correct: 0,
        win: "Compounding clicked. +Strategy.",
      },
      {
        q: "What grows career value fastest?",
        answers: ["useful skills plus proof", "only wishing", "changing titles daily"],
        correct: 0,
        win: "Skill-building plan improved. +Strategy.",
      },
      {
        q: "What is networking in a healthy career?",
        answers: ["building helpful relationships", "begging strangers", "collecting business cards only"],
        correct: 0,
        win: "Career relationships got clearer. +Strategy.",
      },
      {
        q: "Before an interview, what should you prepare?",
        answers: ["role research and examples", "only your outfit", "nothing"],
        correct: 0,
        win: "Preparation raised your odds. +Strategy.",
      },
      {
        q: "Which is closest to wealth?",
        answers: ["assets minus debts", "monthly salary only", "shopping bags"],
        correct: 0,
        win: "Net-worth thinking unlocked. +Strategy.",
      },
      {
        q: "What is diversification?",
        answers: ["spreading risk across assets", "buying one rumor", "hiding cash randomly"],
        correct: 0,
        win: "Portfolio risk improved. +Strategy.",
      },
      {
        q: "A normal car loses value over time. What is this called?",
        answers: ["depreciation", "appreciation", "promotion"],
        correct: 0,
        win: "Asset behavior learned. +Strategy.",
      },
    ],
    practice: [
      {
        q: "You can work overtime or study a valuable skill. What should you compare?",
        answers: ["opportunity cost", "shoe size", "weather only"],
        correct: 0,
        win: "Trade-off thinking improved. +Strategy.",
      },
      {
        q: "A job offer is lower than expected. What helps negotiation most?",
        answers: ["market data and value proof", "anger only", "accept silently always"],
        correct: 0,
        win: "Negotiation got more grounded. +Strategy.",
      },
      {
        q: "Why can one single stock be risky?",
        answers: ["one company can fail", "markets close forever", "shares weigh too much"],
        correct: 0,
        win: "Concentration risk spotted. +Strategy.",
      },
      {
        q: "Paying bills on time usually helps what?",
        answers: ["credit strength", "height", "shoe quality"],
        correct: 0,
        win: "Credit habits improved. +Strategy.",
      },
      {
        q: "The debt avalanche method pays which debt first?",
        answers: ["highest interest rate", "prettiest logo", "newest envelope"],
        correct: 0,
        win: "Debt payoff strategy improved. +Strategy.",
      },
      {
        q: "Why find a mentor?",
        answers: ["learn from experience faster", "copy their life exactly", "avoid all work"],
        correct: 0,
        win: "Mentor strategy unlocked. +Strategy.",
      },
      {
        q: "A stronger resume usually shows what?",
        answers: ["measured results", "only duties", "favorite snacks"],
        correct: 0,
        win: "Career evidence improved. +Strategy.",
      },
      {
        q: "Before changing careers, what should you test?",
        answers: ["skills, market, and fit", "only the logo", "random luck"],
        correct: 0,
        win: "Career pivot got safer. +Strategy.",
      },
      {
        q: "What is insurance mainly for?",
        answers: ["protecting against big losses", "guaranteed profit", "avoiding budgets"],
        correct: 0,
        win: "Risk protection clicked. +Strategy.",
      },
      {
        q: "A side hustle earns money. What grows it best long-term?",
        answers: ["reinvest in what works", "spend all instantly", "never track results"],
        correct: 0,
        win: "Growth loop identified. +Strategy.",
      },
    ],
    advanced: [
      {
        q: "As you get older, why might your investments become less risky?",
        answers: ["less time to recover losses", "risk disappears", "cash turns into houses"],
        correct: 0,
        win: "Life-stage investing improved. +Strategy.",
      },
      {
        q: "During a recession, what is often wise if your job is uncertain?",
        answers: ["increase cash cushion", "take bigger random risks", "ignore expenses"],
        correct: 0,
        win: "Downside planning improved. +Strategy.",
      },
      {
        q: "When comparing two job offers, salary is not enough. What else matters?",
        answers: ["benefits, growth, risk, fit", "desk color only", "company logo size"],
        correct: 0,
        win: "Offer comparison leveled up. +Strategy.",
      },
      {
        q: "What is a BATNA in negotiation?",
        answers: ["best alternative if no deal", "a bank code", "a tax penalty"],
        correct: 0,
        win: "Negotiation fallback identified. +Strategy.",
      },
      {
        q: "A business is profitable on paper but has no cash to pay bills. What failed?",
        answers: ["cash-flow planning", "font choice", "office decoration"],
        correct: 0,
        win: "Cash flow became visible. +Strategy.",
      },
      {
        q: "A house can rise 4% yearly but has upkeep. What should you compare?",
        answers: ["total return after costs", "wall color only", "door count"],
        correct: 0,
        win: "Real asset return improved. +Strategy.",
      },
      {
        q: "Why can a small early investment beat a larger late one?",
        answers: ["more compounding years", "older money is heavier", "late money is illegal"],
        correct: 0,
        win: "Time horizon strategy clicked. +Strategy.",
      },
      {
        q: "What is risk-adjusted return?",
        answers: ["reward compared with risk taken", "return after lunch", "a guaranteed win"],
        correct: 0,
        win: "Smarter return comparison unlocked. +Strategy.",
      },
      {
        q: "You are offered a promotion with burnout risk. What should you evaluate?",
        answers: ["pay, learning, health cost", "title only", "office chair color"],
        correct: 0,
        win: "Career strategy included health. +Strategy.",
      },
      {
        q: "A market trend is popular. What should you check before investing?",
        answers: ["evidence, valuation, and risk", "how loud people are", "only the logo"],
        correct: 0,
        win: "Hype filter upgraded. +Strategy.",
      },
    ],
  },
};
const TRAINING_IQ_EXTRA_BANKS: Record<TrainingLevel, TrainingQuestion[]> = {
  starter: [
    {
      q: "Which number comes next: 5, 10, 20, 40, ?",
      answers: ["45", "60", "80"],
      correct: 2,
      win: "Doubling pattern solved. +2 IQ.",
    },
    {
      q: "Which word does not belong: blue, green, chair, red?",
      answers: ["blue", "chair", "red"],
      correct: 1,
      win: "Category trap cleared. +2 IQ.",
    },
    {
      q: "If a week has 7 days, how many days are in 3 weeks?",
      answers: ["14", "21", "28"],
      correct: 1,
      win: "Simple multiplication stayed sharp. +2 IQ.",
    },
    {
      q: "What letter comes next: A, C, F, J, O, ?",
      answers: ["S", "U", "V"],
      correct: 1,
      win: "Growing letter gaps found. +2 IQ.",
    },
    {
      q: "A basket has 4 apples. You take 2. How many apples do you have?",
      answers: ["2", "4", "6"],
      correct: 0,
      win: "Wording trap handled. +2 IQ.",
    },
  ],
  practice: [
    {
      q: "If 3 painters paint 3 walls in 3 hours, how long do 9 painters need for 9 walls?",
      answers: ["3 hours", "6 hours", "9 hours"],
      correct: 0,
      win: "Rate scaling stayed clean. +2 IQ.",
    },
    {
      q: "A is east of B. C is east of A. Who is farthest east?",
      answers: ["A", "B", "C"],
      correct: 2,
      win: "Spatial ordering solved. +2 IQ.",
    },
    {
      q: "What comes next: 1, 1, 2, 3, 5, 8, ?",
      answers: ["11", "13", "16"],
      correct: 1,
      win: "Fibonacci flow spotted. +2 IQ.",
    },
    {
      q: "If all Mips are Nops, and all Nops are Lums, are all Mips definitely Lums?",
      answers: ["yes", "no", "only half"],
      correct: 0,
      win: "Chain logic clicked. +2 IQ.",
    },
    {
      q: "Which pair continues: 2Z, 4Y, 8X, ?",
      answers: ["10W", "16W", "16V"],
      correct: 1,
      win: "Number doubling and letter countdown solved. +2 IQ.",
    },
  ],
  advanced: [
    {
      q: "A box has 2 red, 2 blue, and 2 yellow socks. How many socks guarantee a matching pair?",
      answers: ["3", "4", "5"],
      correct: 1,
      win: "Worst-case reasoning unlocked. +2 IQ.",
    },
    {
      q: "If no artists are robots, and some coders are artists, what must be true?",
      answers: ["some coders are not robots", "all coders are robots", "no coders exist"],
      correct: 0,
      win: "Logic overlap solved. +2 IQ.",
    },
    {
      q: "A clock gains 5 minutes every hour. After 6 real hours, how far fast is it?",
      answers: ["20 minutes", "30 minutes", "60 minutes"],
      correct: 1,
      win: "Accumulated drift calculated. +2 IQ.",
    },
    {
      q: "What comes next: 1, 4, 9, 16, 25, ?",
      answers: ["30", "36", "49"],
      correct: 1,
      win: "Square sequence held steady. +2 IQ.",
    },
    {
      q: "If two coins total 30 cents and one is not a nickel, what are they?",
      answers: ["quarter and nickel", "two dimes", "quarter and penny"],
      correct: 0,
      win: "The other coin can be the nickel. +2 IQ.",
    },
  ],
};
const TRAINING_EXTRA_BANKS: Record<Exclude<TrainingCategory, "iq">, Record<TrainingLevel, TrainingQuestion[]>> = {
  eq: {
    starter: [
      {
        q: "You feel your body getting tense during a talk. What is a good first clue?",
        answers: ["you may be triggered", "you are always right", "the other person must leave"],
        correct: 0,
        win: "Body-signal awareness improved. +EQ.",
      },
      {
        q: "A younger sibling keeps asking questions. What response builds connection?",
        answers: ["answer kindly or set a gentle time", "call them annoying", "ignore them all day"],
        correct: 0,
        win: "Patience became a relationship skill. +EQ.",
      },
      {
        q: "A friend looks proud of a drawing. What is a supportive response?",
        answers: ["ask what they like about it", "point out flaws first", "change the topic"],
        correct: 0,
        win: "Encouragement landed well. +EQ.",
      },
      {
        q: "You are too tired to help. What is emotionally honest?",
        answers: ["I care, but I need rest first", "yes, then resent it", "vanish without words"],
        correct: 0,
        win: "Honest limits protected trust. +EQ.",
      },
      {
        q: "Someone says thank you. What small habit strengthens bonds?",
        answers: ["receive it warmly", "reject the thanks", "make it awkward"],
        correct: 0,
        win: "Warm receiving is a skill too. +EQ.",
      },
    ],
    practice: [
      {
        q: "A teammate gives a bad idea in public. What protects dignity?",
        answers: ["ask a clarifying question", "laugh at them", "call it stupid"],
        correct: 0,
        win: "Respect kept collaboration alive. +EQ.",
      },
      {
        q: "A parent repeats advice you know. What can reduce conflict?",
        answers: ["thank them and state your plan", "roll your eyes", "start a new fight"],
        correct: 0,
        win: "You balanced respect and autonomy. +EQ.",
      },
      {
        q: "Your friend is happy about something you dislike. What shows empathy?",
        answers: ["be happy for their happiness", "ruin the moment", "compare it to your taste"],
        correct: 0,
        win: "Empathy separated their joy from your taste. +EQ.",
      },
      {
        q: "You said yes too quickly and regret it. What is best?",
        answers: ["renegotiate early and clearly", "miss the promise silently", "blame the calendar"],
        correct: 0,
        win: "Repair came before failure. +EQ.",
      },
      {
        q: "A joke hurts someone even if you meant well. What matters now?",
        answers: ["repair the impact", "argue about intent only", "repeat the joke"],
        correct: 0,
        win: "Impact got care. +EQ.",
      },
    ],
    advanced: [
      {
        q: "Two family members tell opposite stories. What is the safest role?",
        answers: ["listen for needs before judging", "become the judge instantly", "spread both stories"],
        correct: 0,
        win: "You slowed the triangle down. +EQ.",
      },
      {
        q: "A friend keeps venting but never changes. What boundary is kind?",
        answers: ["I can listen for ten minutes, then need rest", "never talk again", "solve their life for them"],
        correct: 0,
        win: "Compassion gained a boundary. +EQ.",
      },
      {
        q: "A group excludes one person by habit. What is leadership?",
        answers: ["create a real chance for them to join", "join the exclusion", "pretend it is invisible"],
        correct: 0,
        win: "Inclusive leadership rose. +EQ.",
      },
      {
        q: "Someone apologizes badly but seems sincere. What can you do?",
        answers: ["state what repair would help", "punish forever", "pretend it never happened"],
        correct: 0,
        win: "Repair got concrete. +EQ.",
      },
      {
        q: "You must give hard feedback to someone fragile. What helps?",
        answers: ["be specific, kind, and actionable", "hide all truth", "attack personality"],
        correct: 0,
        win: "Care and clarity worked together. +EQ.",
      },
    ],
  },
  strategy: {
    starter: [
      {
        q: "What is the first step before making a big purchase?",
        answers: ["check needs, budget, and trade-offs", "buy fast", "copy a celebrity"],
        correct: 0,
        win: "Purchase planning improved. +Strategy.",
      },
      {
        q: "What does income mean?",
        answers: ["money coming in", "money owed", "money already spent"],
        correct: 0,
        win: "Money vocabulary sharpened. +Strategy.",
      },
      {
        q: "What does expense mean?",
        answers: ["money going out", "free income", "a secret bonus"],
        correct: 0,
        win: "Expense tracking clicked. +Strategy.",
      },
      {
        q: "What is a good reason to learn a new skill?",
        answers: ["raise future options", "avoid all work", "guarantee luck"],
        correct: 0,
        win: "Skill investment made sense. +Strategy.",
      },
      {
        q: "Which is usually a better emergency fund place?",
        answers: ["safe and easy to access", "locked in risky bets", "hidden in a game"],
        correct: 0,
        win: "Emergency planning improved. +Strategy.",
      },
    ],
    practice: [
      {
        q: "What is the best reason to track net worth yearly?",
        answers: ["see long-term direction", "feel rich for one day", "avoid decisions"],
        correct: 0,
        win: "Long-term tracking improved. +Strategy.",
      },
      {
        q: "You get a raise. What protects your future?",
        answers: ["increase saving before lifestyle grows", "spend it all instantly", "hide it"],
        correct: 0,
        win: "Lifestyle creep avoided. +Strategy.",
      },
      {
        q: "What makes a career story stronger in interviews?",
        answers: ["challenge, action, result", "random details only", "long excuses"],
        correct: 0,
        win: "Interview storytelling leveled up. +Strategy.",
      },
      {
        q: "Before choosing a major or job path, what should you compare?",
        answers: ["interest, skill, market demand", "only popularity", "only room color"],
        correct: 0,
        win: "Career fit got sharper. +Strategy.",
      },
      {
        q: "What is the value of an informational interview?",
        answers: ["learn real work from insiders", "ask for money first", "skip research"],
        correct: 0,
        win: "Career research network grew. +Strategy.",
      },
    ],
    advanced: [
      {
        q: "A high salary requires 80-hour weeks. What should you calculate?",
        answers: ["hourly value and health cost", "title sparkle only", "desk size"],
        correct: 0,
        win: "Total career cost became visible. +Strategy.",
      },
      {
        q: "What is the danger of investing with borrowed money?",
        answers: ["losses can be amplified", "profits become illegal", "risk becomes zero"],
        correct: 0,
        win: "Leverage risk spotted. +Strategy.",
      },
      {
        q: "A rental house has income and repairs. What matters most?",
        answers: ["net cash flow after costs", "paint color only", "rent before any expenses"],
        correct: 0,
        win: "Rental math improved. +Strategy.",
      },
      {
        q: "When switching jobs, why keep relationships warm?",
        answers: ["future opportunities travel through trust", "everyone forgets skills", "it replaces work"],
        correct: 0,
        win: "Reputation strategy improved. +Strategy.",
      },
      {
        q: "A plan works only in perfect conditions. What should you add?",
        answers: ["margin of safety", "more optimism only", "a louder slogan"],
        correct: 0,
        win: "Resilient planning unlocked. +Strategy.",
      },
    ],
  },
};

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
  | "familytree"
  | "assets"
  | "training"
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

interface RenderLayout {
  w: number;
  h: number;
  floorY: number;
  landscape: boolean;
}

interface InventorySlot {
  opt: LifeOption;
  count: number;
}

type FamilyRelationKind = "parent" | "child" | "partner" | "sibling";

interface FamilyMember {
  id: string;
  name: string;
  role: string;
  icon: string;
  ageOffset: number;
  generation: number;
  tone: string;
  locked?: boolean;
}

interface FamilyEdge {
  id: string;
  from: string;
  to: string;
  kind: FamilyRelationKind;
  label: string;
}

/** A rewindable snapshot of the whole life, captured at each stage's start. */
interface Snapshot {
  stageIndex: number;
  age: number;
  gender: Gender;
  heritage: HeritageStyle;
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
  homePurchaseAges: number[];
  hadChild: boolean;
  familyBond: number;
  spouseDeceased: boolean;
  habitCount: number;
  investments: number;
  moneyWise: boolean;
  iqCeiling: number;
  geneBonus: number;
  owned: string[];
  vehiclePurchaseAges: [string, number][];
  jobsTaken: string[];
  usedEvents: string[];
  inventory: InventorySlot[];
  selectedInventory: number;
  familyMembers: FamilyMember[];
  familyEdges: FamilyEdge[];
  familyHiddenIds: string[];
  familySelectedId: string;
  familyNextId: number;
  bigFired: boolean;
  jackpotFired: boolean;
  petAdopted: boolean;
  petKind: PetKind | null;
  petX: number;
  petY: number;
  petHappyCd: number;
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

function stableAnswerOrder(seed: string, count: number): number[] {
  const score = (text: string): number => {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };
  return Array.from({ length: count }, (_, i) => i).sort((a, b) => score(`${seed}:${a}`) - score(`${seed}:${b}`));
}

export class Game {
  private ui: UIRefs;
  private mode: Mode = "title";
  private stageIndex = 0;
  private stats: Stats = { ...START_STATS };
  private age = 0;
  private gender: Gender = "male";
  private heritage: HeritageStyle = "western";
  private lifeSpeed = 1;
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
  private setupFamilyFund = FAMILY_MONEY_MIN; // editable setup roll before a new life starts
  private parentAnnualSupport = 0; // yearly support from Mommy & Daddy until adulthood
  private homeQuality = 0;
  private homes: HouseTier[] = []; // every property bought; you live in the best one
  private homePurchaseAges: number[] = []; // parallel to homes; lets property appreciate over time
  private houseUpkeep = 0; // per-action dollar drain from your home (mortgage/upkeep)
  private rentalIncome = 0; // per-stage dollars from spare homes rented out
  private investments = 0; // dollars in the market — compounds over the stages
  private moneyWise = false; // learned money management → better, steadier returns
  private iqCeiling = 100; // lifelong IQ potential, rolled at birth
  private geneBonus = 0; // longevity genetics (-5..+5 yrs), rolled at birth
  private familyBond = 0; // time invested in family — unlocks grandkids later
  private owned = new Set<string>(); // one-off, owned-for-life purchases (vehicles, skills)
  private vehiclePurchaseAges = new Map<string, number>(); // vehicle id -> age bought; cars depreciate with time
  private jobsTaken = new Set<string>(); // occupations whose one-off perks were already granted this life
  private bigFired = false; // a "big" windfall already happened (1/life)
  private jackpotFired = false; // a jackpot already happened (1/life total)
  private petAdopted = false; // adopted a pet (1/life)
  private petKind: PetKind | null = null;
  private petX = 132;
  private petY = 640;
  private petFacing: "left" | "right" = "right";
  private petWalkPhase = 0;
  private petHappyCd = 0;
  private spouseDeceased = false;
  private habitCount = 0;
  private trainingQuestionIndex: Record<TrainingCategory, number> = { iq: 0, eq: 0, strategy: 0 };
  private trainingLevel: Record<TrainingCategory, TrainingLevel> = { iq: "starter", eq: "starter", strategy: "starter" };
  private trainingDatabase: Partial<Record<TrainingCategory, TrainingQuestionBank>> | null = null;
  private eventCooldown = 2;
  private usedEvents = new Set<string>();
  private eventsLog: string[] = [];
  private timeline: Snapshot[] = [];
  private history: HistoryEntry[] = [];
  private partner: Partner | null = null;
  private hadChild = false;
  private familyMembers: FamilyMember[] = [];
  private familyEdges: FamilyEdge[] = [];
  private familyHiddenIds = new Set<string>();
  private familySelectedId = "player";
  private familyNextId = 1;
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
    void this.loadTrainingDatabase();
    this.showTitle();
    this.renderInventory();
    requestAnimationFrame(this.frame);
    // Debug handle for headless verification (mirrors other games' debug APIs).
    (window as unknown as { __pixelLife: Game }).__pixelLife = this;
  }

  private renderLayout(): RenderLayout {
    const rect = this.ui.canvas.getBoundingClientRect();
    const mediaLandscape = window.matchMedia
      ? window.matchMedia("(orientation: landscape) and (max-height: 620px)").matches
      : false;
    const wideCanvas = rect.width > rect.height * 1.28 && rect.height < 620;
    const landscape = mediaLandscape || wideCanvas;
    return landscape
      ? { w: LANDSCAPE_W, h: LANDSCAPE_H, floorY: LANDSCAPE_FLOOR_Y, landscape: true }
      : { w: W, h: H, floorY: FLOOR_Y, landscape: false };
  }

  private ensureCanvasBuffer(layout: RenderLayout): void {
    const pxW = layout.w * CANVAS_SCALE;
    const pxH = layout.h * CANVAS_SCALE;
    if (this.ui.canvas.width !== pxW || this.ui.canvas.height !== pxH) {
      this.ui.canvas.width = pxW;
      this.ui.canvas.height = pxH;
    }
    this.ui.ctx.setTransform(CANVAS_SCALE, 0, 0, CANVAS_SCALE, 0, 0);
    this.ui.ctx.imageSmoothingEnabled = true;
    this.ui.ctx.imageSmoothingQuality = "high";
  }

  private toScreenX(x: number, layout: RenderLayout): number {
    if (!layout.landscape) return x;
    const gateStopX = layout.w - 74;
    if (x <= DOOR_X) return (x / DOOR_X) * gateStopX;
    return gateStopX + ((x - DOOR_X) / (W - DOOR_X)) * (layout.w - gateStopX);
  }

  private fromScreenX(x: number, layout: RenderLayout): number {
    if (!layout.landscape) return x;
    const gateStopX = layout.w - 74;
    if (x <= gateStopX) return (x / gateStopX) * DOOR_X;
    return DOOR_X + ((x - gateStopX) / (layout.w - gateStopX)) * (W - DOOR_X);
  }

  private toScreenY(y: number, layout: RenderLayout): number {
    if (!layout.landscape) return y;
    if (y <= FLOOR_Y) return (y / FLOOR_Y) * layout.floorY;
    return layout.floorY + ((y - FLOOR_Y) / (PY_MAX - FLOOR_Y)) * (LANDSCAPE_PY_MAX - layout.floorY);
  }

  private fromScreenY(y: number, layout: RenderLayout): number {
    if (!layout.landscape) return y;
    if (y <= layout.floorY) return (y / layout.floorY) * FLOOR_Y;
    return FLOOR_Y + ((y - layout.floorY) / (LANDSCAPE_PY_MAX - layout.floorY)) * (PY_MAX - FLOOR_Y);
  }

  private canvasContentRect(layout: RenderLayout): { left: number; top: number; width: number; height: number } {
    const rect = this.ui.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { left: rect.left, top: rect.top, width: 1, height: 1 };
    const artAspect = layout.w / layout.h;
    const boxAspect = rect.width / rect.height;
    if (boxAspect > artAspect) {
      const width = rect.height * artAspect;
      return { left: rect.left + (rect.width - width) / 2, top: rect.top, width, height: rect.height };
    }
    const height = rect.width / artAspect;
    return { left: rect.left, top: rect.top, width: rect.width, height };
  }

  /** Test/debug snapshot of the live game state. */
  debugState() {
    return {
      mode: this.mode,
      stage: STAGES[this.stageIndex]?.id,
      upperScene: this.upperScene(),
      age: Math.round(this.age * 10) / 10,
      lifeSpeed: this.lifeSpeed,
      familyZoneShare: this.familyZoneShare(),
      zoneSplitY: this.zoneSplitY(),
      gates: {
        familyTree: this.canShowFamilyTreeGate(),
        assets: this.canShowAssetsGate(),
        training: this.canShowTrainingGate(),
      },
      lifeExp: this.lifeExp(),
      stats: { ...this.stats },
      px: Math.round(this.px),
      py: Math.round(this.py),
      focus: this.focusIndex >= 0 ? this.stations[this.focusIndex]?.opt.id : null,
      partner: this.partner?.id ?? null,
      gender: this.gender,
      heritage: this.heritage,
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
      caps: { bigFired: this.bigFired, jackpotFired: this.jackpotFired, petAdopted: this.petAdopted, petKind: this.petKind },
      pet: this.petKind ? {
        kind: this.petKind,
        x: Math.round(this.petX),
        y: Math.round(this.petY),
        happyCooldown: Math.round(this.petHappyCd * 10) / 10,
      } : null,
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
      familyGraph: {
        members: this.familyMembers.length,
        edges: this.familyEdges.length,
        hidden: this.familyHiddenIds.size,
        selected: this.familySelectedId,
      },
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

  /** Test/debug: adopt a room pet immediately. */
  debugAdoptPet(kind: PetKind = "dog"): PetKind | null {
    if (this.mode !== "playing") return null;
    this.adoptPet(kind, this.px + 70, this.py + 28);
    return this.petKind;
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

  private newGame(keepBiography = false, startStageIndex = 0, familyFundOverride?: number): void {
    if (!keepBiography) this.biography = null; // normal play is never a replay
    const startIndex = keepBiography ? 0 : this.normalizeStageIndex(startStageIndex);
    this.stats = { ...START_STATS };
    this.age = 0;
    this.weight = START_WEIGHT;
    this.familyFund = keepBiography ? this.rollFamilyMoney() : this.normalizeFamilyMoney(familyFundOverride ?? this.setupFamilyFund);
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
    this.homePurchaseAges = [];
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
    this.vehiclePurchaseAges = new Map();
    this.jobsTaken = new Set();
    this.bigFired = false;
    this.jackpotFired = false;
    this.petAdopted = false;
    this.petKind = null;
    this.petX = 132;
    this.petY = 640;
    this.petFacing = "right";
    this.petWalkPhase = 0;
    this.petHappyCd = 0;
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
    this.resetFamilyGraph();
    this.healthSum = 0;
    this.happinessSum = 0;
    this.smartsSum = 0;
    this.healthCount = 0;
    this.floats = [];
    this.story = null;
    this.renderInventory();
    this.sampleHealth();
    this.loadStage(startIndex);
    const start = STAGES[startIndex];
    const familyText = `Family fund: ${formatMoney(this.familyFund)}. Mommy & Daddy: ~${formatMoney(this.parentAnnualSupport)}/yr.`;
    this.hint(startIndex === 0
      ? `👪 ${familyText} Style: ${this.heritageLabel()}. Speed: ${this.lifeSpeedLabel()}.`
      : `${start.emoji} Started at ${start.name} (age ${start.ageStart}). Style: ${this.heritageLabel()}. Speed: ${this.lifeSpeedLabel()}.`);
  }

  private loadStage(i: number, restoring = false): void {
    this.stageIndex = i;
    const s = STAGES[i];
    this.usedOnce.clear();
    this.age = Math.max(this.age, s.ageStart);
    this.px = 70;
    this.py = 500;
    this.placePetInRoom(this.px + 86, this.py + 48);
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
      heritage: this.heritage,
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
      homePurchaseAges: [...this.homePurchaseAges],
      hadChild: this.hadChild,
      familyBond: this.familyBond,
      spouseDeceased: this.spouseDeceased,
      habitCount: this.habitCount,
      investments: this.investments,
      moneyWise: this.moneyWise,
      iqCeiling: this.iqCeiling,
      geneBonus: this.geneBonus,
      owned: [...this.owned],
      vehiclePurchaseAges: [...this.vehiclePurchaseAges.entries()],
      jobsTaken: [...this.jobsTaken],
      inventory: this.inventory.map((slot) => ({ opt: slot.opt, count: slot.count })),
      selectedInventory: this.selectedInventory,
      familyMembers: this.familyMembers.map((m) => ({ ...m })),
      familyEdges: this.familyEdges.map((e) => ({ ...e })),
      familyHiddenIds: [...this.familyHiddenIds],
      familySelectedId: this.familySelectedId,
      familyNextId: this.familyNextId,
      bigFired: this.bigFired,
      jackpotFired: this.jackpotFired,
      petAdopted: this.petAdopted,
      petKind: this.petKind,
      petX: this.petX,
      petY: this.petY,
      petHappyCd: this.petHappyCd,
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

  private placePetInRoom(x = this.px + 86, y = this.py + 48): void {
    if (!this.petKind) return;
    const bounds = this.zoneBounds("family");
    this.petX = Math.max(78, Math.min(W - 112, x));
    this.petY = Math.max(bounds.min + 24, Math.min(bounds.max - 4, y));
    this.petFacing = this.petX > this.px ? "left" : "right";
  }

  private adoptPet(kind: PetKind, x = this.px + 70, y = this.py + 36): void {
    this.petAdopted = true;
    this.petKind = kind;
    this.petHappyCd = 1.6;
    this.petWalkPhase = 0;
    this.placePetInRoom(x, y);
  }

  private updatePet(dt: number): void {
    if (!this.petKind) return;
    if (this.petHappyCd > 0) this.petHappyCd = Math.max(0, this.petHappyCd - dt);
    const bounds = this.zoneBounds("family");

    if (this.petKind === "cat") {
      this.petWalkPhase += dt * 1.2;
      this.petX = Math.max(78, Math.min(W - 112, this.petX));
      this.petY = Math.max(bounds.min + 24, Math.min(bounds.max - 4, this.petY));
      if (this.petHappyCd <= 0) {
        this.petHappyCd = CAT_PURR_INTERVAL;
        this.applyEff({ happiness: CAT_PURR_HAPPY }, "mental");
        this.floats.push({ x: this.petX, y: this.petY - 58, text: "🐱 purr", color: "#ffd23f", life: 1.1 });
      }
      return;
    }

    const targetX = Math.max(78, Math.min(W - 112, this.px + (this.facing === "left" ? 28 : -28)));
    const targetY = Math.max(bounds.min + 24, Math.min(bounds.max - 4, this.py + 8));
    const dx = targetX - this.petX;
    const dy = targetY - this.petY;
    const d = Math.hypot(dx, dy) || 1;
    if (d > 22) {
      const sp = PET_FOLLOW_SPEED * (d > 140 ? 1.25 : 1);
      this.petX += (dx / d) * sp * dt;
      this.petY += (dy / d) * sp * dt;
      this.petFacing = dx < 0 ? "left" : "right";
      this.petWalkPhase += dt * 10;
    } else {
      this.petWalkPhase += dt * 3;
    }

    this.petX = Math.max(78, Math.min(W - 112, this.petX));
    this.petY = Math.max(bounds.min + 24, Math.min(bounds.max - 4, this.petY));
    if (Math.hypot(this.px - this.petX, this.py - this.petY) <= PET_HAPPY_R && this.petHappyCd <= 0) {
      this.petHappyCd = PET_HAPPY_COOLDOWN;
      this.applyEff({ happiness: 2 }, "mental");
      this.floats.push({ x: this.petX, y: this.petY - 58, text: "🐶 +happy", color: "#ffd23f", life: 1.25 });
      this.hint("Your dog ran up to you. +2 Happy.");
    }
  }

  // --- per-stage balance helpers -------------------------------------------

  private stageStep(): number {
    return this.baseStageStep() * this.lifeSpeed;
  }

  private baseStageStep(): number {
    const s = STAGES[this.stageIndex];
    // a gentle pace — each chapter now gives ~4× the old number of actions, so
    // there's real time to study, exercise, dodge and live before the gate opens.
    return Math.max(0.03, Math.min(0.9, (s.ageEnd - s.ageStart) / 28));
  }

  private optionAgeCost(opt: LifeOption): number {
    return (opt.ageCost ?? this.baseStageStep()) * this.lifeSpeed;
  }

  private nearestLifeSpeedIndex(value: number): number {
    if (!Number.isFinite(value) || value <= 0) return LIFE_SPEED_DEFAULT_INDEX;
    let best = LIFE_SPEED_DEFAULT_INDEX;
    let bestDelta = Number.POSITIVE_INFINITY;
    LIFE_SPEEDS.forEach((speed, i) => {
      const delta = Math.abs(Math.log2(value / speed));
      if (delta < bestDelta) {
        best = i;
        bestDelta = delta;
      }
    });
    return best;
  }

  private lifeSpeedIndex(): number {
    return this.nearestLifeSpeedIndex(this.lifeSpeed);
  }

  private setLifeSpeedIndex(index: number): void {
    const raw = Number.isFinite(index) ? index : LIFE_SPEED_DEFAULT_INDEX;
    const safe = Math.max(LIFE_SPEED_MIN_INDEX, Math.min(LIFE_SPEED_MAX_INDEX, Math.round(raw)));
    this.lifeSpeed = LIFE_SPEEDS[safe];
    this.renderHud();
  }

  private setLifeSpeed(value: number): void {
    this.setLifeSpeedIndex(this.nearestLifeSpeedIndex(value));
  }

  private lifeSpeedInputAttrs(): string {
    return `min="${LIFE_SPEED_MIN_INDEX}" max="${LIFE_SPEED_MAX_INDEX}" step="1" value="${this.lifeSpeedIndex()}"`;
  }

  private lifeSpeedLabel(): string {
    if (this.lifeSpeed < 1) return `1/${Math.round(1 / this.lifeSpeed)}x`;
    return `${this.lifeSpeed}x`;
  }

  private normalizeStageIndex(i: number): number {
    return Math.max(0, Math.min(STAGES.length - 1, Math.round(Number.isFinite(i) ? i : 0)));
  }

  private normalizeHeritage(value: string | null | undefined): HeritageStyle {
    const found = HERITAGE_OPTIONS.find((o) => o.id === value);
    return found?.id ?? "western";
  }

  private heritageLabel(): string {
    return HERITAGE_OPTIONS.find((o) => o.id === this.heritage)?.label ?? "Western / current";
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

  private normalizeFamilyMoney(value: number): number {
    const raw = Number.isFinite(value) ? value : FAMILY_MONEY_MIN;
    const clamped = Math.max(FAMILY_MONEY_MIN, Math.min(FAMILY_MONEY_MAX, raw));
    return Math.round(clamped / 1000) * 1000;
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

  private yearsHeld(purchaseAge: number | undefined): number {
    return Math.max(0, this.age - (purchaseAge ?? Math.max(18, this.age)));
  }

  private houseAppreciationRate(h: HouseTier): number {
    const step = (HOUSE_APPRECIATION_MAX - HOUSE_APPRECIATION_MIN) / 4;
    return HOUSE_APPRECIATION_MIN + (Math.max(1, Math.min(5, h.quality)) - 1) * step;
  }

  private houseAssetValue(h: HouseTier, index: number): number {
    const years = this.yearsHeld(this.homePurchaseAges[index]);
    return Math.round(h.cost * Math.pow(1 + this.houseAppreciationRate(h), years));
  }

  private vehicleAssetValue(v: VehicleTier): number {
    const years = this.yearsHeld(this.vehiclePurchaseAges.get(v.id));
    const valueRatio = Math.max(0.18, Math.pow(1 - VEHICLE_DEPRECIATION, years));
    return Math.round(v.cost * valueRatio);
  }

  private ownedVehicles(): VehicleTier[] {
    return VEHICLES.filter((v) => this.owned.has("veh_" + v.id));
  }

  /** Net worth in dollars: cash + stocks + appreciated property + depreciated vehicles. */
  private netWorth(): number {
    let nw = this.money + this.investments;
    this.homes.forEach((h, i) => { nw += this.houseAssetValue(h, i); });
    for (const v of this.ownedVehicles()) nw += this.vehicleAssetValue(v);
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
      if (this.canShowTrainingGate() && this.nearTrainingGate()) {
        this.showTraining();
        return;
      }
      if (this.canShowAssetsGate() && this.nearAssetsGate()) {
        this.showAssets();
        return;
      }
      if (this.canShowFamilyTreeGate() && this.nearFamilyTreeGate()) {
        this.showFamilyTree();
        return;
      }
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

    this.age += this.optionAgeCost(opt);
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
    if (e.tier === "pet") this.adoptPet(e.id === "kitten" ? "cat" : "dog", st.x, st.y);
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
    if (e.tier === "pet") {
      const petName = this.petKind === "cat" ? "cat" : "dog";
      this.hint(`You adopted a ${petName}. It now lives in the family room.`);
    }
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
    this.homePurchaseAges.push(this.age);
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
    this.vehiclePurchaseAges.set(v.id, this.age);
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
    this.heritage = snap.heritage ?? "western";
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
    this.homePurchaseAges = snap.homePurchaseAges?.length
      ? [...snap.homePurchaseAges]
      : this.homes.map(() => Math.max(18, snap.age));
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
    this.vehiclePurchaseAges = new Map(snap.vehiclePurchaseAges ?? []);
    this.jobsTaken = new Set(snap.jobsTaken);
    this.inventory = snap.inventory.map((slot) => ({ opt: slot.opt, count: slot.count }));
    this.selectedInventory = Math.max(0, Math.min(snap.selectedInventory, this.inventory.length - 1));
    this.familyMembers = snap.familyMembers.map((m) => ({ ...m }));
    this.familyEdges = snap.familyEdges.map((e) => ({ ...e }));
    this.familyHiddenIds = new Set(snap.familyHiddenIds);
    this.familySelectedId = snap.familySelectedId;
    this.familyNextId = snap.familyNextId;
    this.bigFired = snap.bigFired;
    this.jackpotFired = snap.jackpotFired;
    this.petAdopted = snap.petAdopted;
    this.petKind = snap.petKind ?? null;
    this.petX = snap.petX ?? 132;
    this.petY = snap.petY ?? 640;
    this.petHappyCd = snap.petHappyCd ?? 0;
    this.petFacing = this.petX > this.px ? "left" : "right";
    this.petWalkPhase = 0;
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
    this.updatePet(dt);

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

  private familyTreeGateY(): number {
    const social = this.zoneBounds("social");
    return Math.round(Math.max(social.min + TRAINING_GATE_R + UTILITY_GATE_GAP * 2 + 8, social.max - 26));
  }

  private assetsGateY(): number {
    return this.familyTreeGateY() - UTILITY_GATE_GAP;
  }

  private trainingGateY(): number {
    return this.assetsGateY() - UTILITY_GATE_GAP;
  }

  private canShowFamilyTreeGate(): boolean {
    return this.stageIndex >= ELEMENTARY_INDEX;
  }

  private canShowAssetsGate(): boolean {
    return this.stageIndex >= MIDDLE_INDEX ||
      (this.stageIndex >= ELEMENTARY_INDEX && this.money > ELEMENTARY_ASSETS_MONEY);
  }

  private canShowTrainingGate(): boolean {
    return true;
  }

  private hitCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
    return Math.hypot(x - cx, y - cy) <= r;
  }

  private nearFamilyTreeGate(): boolean {
    return this.hitCircle(this.px, this.py - 8, UTILITY_GATE_X, this.familyTreeGateY(), FAMILY_TREE_GATE_R + 22);
  }

  private nearAssetsGate(): boolean {
    return this.hitCircle(this.px, this.py - 8, UTILITY_GATE_X, this.assetsGateY(), ASSETS_GATE_R + 22);
  }

  private nearTrainingGate(): boolean {
    return this.hitCircle(this.px, this.py - 8, UTILITY_GATE_X, this.trainingGateY(), TRAINING_GATE_R + 22);
  }

  private canvasPoint(e: PointerEvent): { x: number; y: number } {
    const layout = this.renderLayout();
    const rect = this.canvasContentRect(layout);
    const sx = Math.max(0, Math.min(layout.w, ((e.clientX - rect.left) / rect.width) * layout.w));
    const sy = Math.max(0, Math.min(layout.h, ((e.clientY - rect.top) / rect.height) * layout.h));
    return {
      x: this.fromScreenX(sx, layout),
      y: this.fromScreenY(sy, layout),
    };
  }

  private drawUtilityGates(ctx: CanvasRenderingContext2D, t: number, layout: RenderLayout): void {
    const canFamilyTree = this.canShowFamilyTreeGate();
    const canAssets = this.canShowAssetsGate();
    const canTraining = this.canShowTrainingGate();
    if (!canFamilyTree && !canAssets && !canTraining) return;
    const gateX = this.toScreenX(UTILITY_GATE_X, layout);
    const familyY = this.toScreenY(this.familyTreeGateY(), layout);
    const assetsY = this.toScreenY(this.assetsGateY(), layout);
    const trainingY = this.toScreenY(this.trainingGateY(), layout);
    if (canTraining) this.drawTrainingSchoolGate(ctx, gateX, trainingY, t);
    if (canAssets) this.drawUtilityGate(ctx, gateX, assetsY, ASSETS_GATE_R, "Assets", "💼", "#7ed957", t);
    if (canFamilyTree) this.drawUtilityGate(ctx, gateX, familyY, FAMILY_TREE_GATE_R, "Family Tree", "🌳", "#ffd23f", t);
  }

  private drawTrainingSchoolGate(ctx: CanvasRenderingContext2D, x: number, y: number, t: number): void {
    const color = "#5db8ff";
    const pulse = 0.5 + 0.16 * Math.sin(t * 3 + y * 0.03);
    const w = 46;
    const h = 34;
    const top = y - 18;
    const left = x - w / 2;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 22, 24, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    roundRect(ctx, left - 4, top - 4, w + 8, h + 8, 7);
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#f6dd8a";
    roundRect(ctx, left, top + 8, w, h - 8, 4);
    ctx.fill();
    ctx.strokeStyle = "#1b142b";
    ctx.lineWidth = 2;
    roundRect(ctx, left, top + 8, w, h - 8, 4);
    ctx.stroke();

    ctx.fillStyle = "#d94d58";
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(left - 3, top + 12);
    ctx.lineTo(x + w / 2 + 3, top + 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#e8f7ff";
    for (const wx of [left + 10, left + w - 16]) {
      roundRect(ctx, wx, top + 16, 10, 9, 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = "#5db8ff";
    roundRect(ctx, x - 5, top + 19, 10, 15, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff8df";
    ctx.font = "bold 8px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillText("IQ", x, top + 13);

    const labelW = 58;
    const labelH = 14;
    const labelY = y + 22;
    ctx.fillStyle = "rgba(18,12,30,0.9)";
    roundRect(ctx, x - labelW / 2, labelY, labelW, labelH, 5);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    roundRect(ctx, x - labelW / 2, labelY, labelW, labelH, 5);
    ctx.stroke();
    ctx.font = "bold 7.5px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillStyle = "#fff8df";
    ctx.fillText("Training", x, labelY + labelH / 2);
    ctx.restore();
  }

  private drawUtilityGate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    label: string,
    icon: string,
    color: string,
    t: number
  ): void {
    const pulse = 0.55 + 0.18 * Math.sin(t * 3 + y * 0.03);
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(0,0,0,0.26)";
    ctx.beginPath();
    ctx.ellipse(x + 2, y + r + 4, r * 0.82, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = pulse;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const grad = ctx.createRadialGradient(x - 6, y - 7, 3.5, x, y, r);
    grad.addColorStop(0, "#ffffff");
    grad.addColorStop(0.18, color);
    grad.addColorStop(1, "#222033");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#1b142b";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    ctx.font = "15px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillStyle = "#1b142b";
    ctx.fillText(icon, x, y - 1);

    const labelW = label === "Family Tree" ? 68 : label === "Training" ? 60 : 52;
    const labelH = 14;
    const labelY = y + r + 5;
    ctx.fillStyle = "rgba(18,12,30,0.9)";
    roundRect(ctx, x - labelW / 2, labelY, labelW, labelH, 5);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.25;
    roundRect(ctx, x - labelW / 2, labelY, labelW, labelH, 5);
    ctx.stroke();
    ctx.font = "bold 7.5px 'Trebuchet MS', system-ui, sans-serif";
    ctx.fillStyle = "#fff8df";
    ctx.fillText(label, x, labelY + labelH / 2);
    ctx.restore();
  }

  // --- rendering ------------------------------------------------------------

  private render(): void {
    const layout = this.renderLayout();
    this.ensureCanvasBuffer(layout);
    const ctx = this.ui.ctx;
    ctx.fillStyle = "#140d24";
    ctx.fillRect(0, 0, layout.w, layout.h);

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
      this.mode === "familytree" ||
      this.mode === "assets" ||
      this.mode === "training" ||
      this.mode === "careermove" ||
      this.mode === "settings";
    if (inRoom && this.stageIndex < STAGES.length) {
      const s = STAGES[this.stageIndex];
      const t = this.walkPhase;
      const doorActive = this.doorOpen();
      drawRoom(ctx, s.theme, layout.w, layout.h, layout.floorY, doorActive, t, {
        scene: s.scene,
        upperScene: this.upperScene(),
        atHome: !!s.atHome,
        homeQuality: this.homeQuality,
        splitY: this.toScreenY(this.zoneSplitY(), layout),
        ownedVehicles: this.ownedVehicles(),
        ownedHome: this.liveHome(),
      });

      this.drawUtilityGates(ctx, t, layout);

      // draw stations, people and the avatar together, sorted by depth (y)
      type Drawable = { y: number; station?: Station; pet?: boolean };
      const drawables: Drawable[] = this.stations.map((st) => ({ y: st.y, station: st }));
      if (this.petKind) drawables.push({ y: this.petY, pet: true });
      drawables.push({ y: this.py }); // the avatar
      drawables.sort((a, b) => a.y - b.y);
      for (const d of drawables) {
        if (d.pet && this.petKind) {
          drawPet(ctx, this.toScreenX(this.petX, layout), this.toScreenY(this.petY, layout), this.petKind, t + this.petWalkPhase * 0.08, {
            facing: this.petFacing,
            sitting: this.petKind === "cat",
          });
          continue;
        }
        if (!d.station) {
          drawAvatar(ctx, this.toScreenX(this.px, layout), this.toScreenY(this.py, layout), avatarLook(this.stageIndex, this.gender, this.heritage), this.walkPhase, {
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
          ellipseRing(ctx, this.toScreenX(st.x, layout), this.toScreenY(st.y + 16, layout), 22, 7);
          ctx.restore();
        }
        if (fadedSatiated) ctx.globalAlpha = 0.18;
        if (st.kind === "event" && st.event) {
          drawEventItem(ctx, this.toScreenX(st.x, layout), this.toScreenY(st.y, layout), st.event.id, st.event.emoji, st.event.title, st.event.good !== false, focused, t);
        } else if (st.opt.person) {
          drawPerson(ctx, this.toScreenX(st.x, layout), this.toScreenY(st.y, layout), st.opt.person, this.gender, st.opt.label, focused, used, t, this.stageIndex, this.heritage, {
            seated: this.shouldSitWithNewborn(st),
          });
        } else {
          drawStation(ctx, this.toScreenX(st.x, layout), this.toScreenY(st.y, layout), st.opt.icon, st.opt.label, st.opt.category, focused, used, t);
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
      ctx.fillText(f.text, this.toScreenX(f.x, layout), this.toScreenY(f.y, layout));
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
      this.mode === "title" || this.mode === "setup" ? "" : ` · ~${this.lifeExp()}y · ${this.lifeSpeedLabel()}`;
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
      panel.classList.add("is-hidden");
      panel.innerHTML = "";
      return;
    }
    panel.classList.remove("is-hidden");
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
        <div class="plj-speed-box">
          <div class="plj-speed-head">
            <span>Life speed</span>
            <strong id="plj-set-speed-readout">${this.lifeSpeedLabel()}</strong>
          </div>
          <input id="plj-set-speed" type="range" ${this.lifeSpeedInputAttrs()}>
        </div>
        <div class="plj-settings-guide">
          <b>How to play</b>
          <span>Move with the left pad or WASD/arrows. Touch green items to collect them into the tray. Swipe the tray left/right to select, then swipe up to eat or give. Dodge red hazards and use the right gate to grow up.</span>
        </div>
        <div class="plj-set-list">
          <button class="plj-btn" id="plj-set-resume">▶ Resume</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-skip">⏭ Skip this chapter</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-restart">🔄 Start a new life</button>
          <button class="plj-btn plj-btn-ghost" id="plj-set-menu">🏠 Main menu</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    const ov = this.ui.overlay;
    const speedInput = ov.querySelector<HTMLInputElement>("#plj-set-speed")!;
    const speedReadout = ov.querySelector<HTMLElement>("#plj-set-speed-readout")!;
    speedInput.oninput = () => {
      this.setLifeSpeedIndex(Number(speedInput.value));
      speedInput.value = String(this.lifeSpeedIndex());
      speedReadout.textContent = this.lifeSpeedLabel();
    };
    ov.querySelector<HTMLButtonElement>("#plj-set-resume")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); };
    ov.querySelector<HTMLButtonElement>("#plj-set-skip")!.onclick = () => { this.mode = "playing"; this.clearOverlay(); this.skipStage(); };
    ov.querySelector<HTMLButtonElement>("#plj-set-restart")!.onclick = () => this.showSetup();
    ov.querySelector<HTMLButtonElement>("#plj-set-menu")!.onclick = () => this.showTitle();
  }

  // --- overlays -------------------------------------------------------------

  private clearOverlay(): void {
    this.ui.overlay.classList.remove("show");
    this.ui.overlay.innerHTML = "";
  }

  private playerDisplayName(): string {
    return this.playerName.trim() || (this.gender === "female" ? "Alex" : "Sam");
  }

  private resetFamilyGraph(): void {
    const playerIcon = this.gender === "female" ? "👧" : "👦";
    this.familyHiddenIds = new Set();
    this.familyMembers = [
      { id: "grandpa", name: "Grandpa", role: "grandparent", icon: "👴", ageOffset: 66, generation: -2, tone: "elder" },
      { id: "grandma", name: "Grandma", role: "grandparent", icon: "👵", ageOffset: 64, generation: -2, tone: "elder" },
      { id: "daddy", name: "Daddy", role: "parent", icon: "👨", ageOffset: 31, generation: -1, tone: "parent" },
      { id: "mommy", name: "Mommy", role: "parent", icon: "👩", ageOffset: 29, generation: -1, tone: "parent" },
      { id: "bigsib", name: "Big sib", role: "sibling", icon: "🧒", ageOffset: 4, generation: 0, tone: "sibling" },
      { id: "player", name: this.playerDisplayName(), role: "you", icon: playerIcon, ageOffset: 0, generation: 0, tone: "you", locked: true },
    ];
    this.familyEdges = [];
    this.ensureFamilyEdge("grandpa", "daddy", "parent", "parent");
    this.ensureFamilyEdge("grandma", "mommy", "parent", "parent");
    this.ensureFamilyEdge("daddy", "bigsib", "parent", "parent");
    this.ensureFamilyEdge("mommy", "bigsib", "parent", "parent");
    this.ensureFamilyEdge("daddy", "player", "parent", "parent");
    this.ensureFamilyEdge("mommy", "player", "parent", "parent");
    this.familySelectedId = "player";
    this.familyNextId = 1;
  }

  private selectedFamilyMember(): FamilyMember {
    let member = this.familyMembers.find((m) => m.id === this.familySelectedId);
    if (!member) {
      this.familySelectedId = "player";
      member = this.familyMembers.find((m) => m.id === "player") ?? this.familyMembers[0];
    }
    return member;
  }

  private upsertFamilyMember(member: FamilyMember, refresh = false): boolean {
    const existing = this.familyMembers.find((m) => m.id === member.id);
    if (existing) {
      if (refresh) Object.assign(existing, member);
      return false;
    }
    this.familyMembers.push(member);
    return true;
  }

  private familyRelationId(from: string, to: string, kind: FamilyRelationKind): string {
    const pair = kind === "partner" || kind === "sibling" ? [from, to].sort() : [from, to];
    return `${pair[0]}-${pair[1]}-${kind}`;
  }

  private ensureFamilyEdge(from: string, to: string, kind: FamilyRelationKind, label: string = kind): void {
    if (from === to) return;
    const id = this.familyRelationId(from, to, kind);
    const existing = this.familyEdges.find((e) => e.id === id);
    if (existing) {
      existing.label = label;
      return;
    }
    this.familyEdges.push({ id, from, to, kind, label });
  }

  private connectFamilyRelation(baseId: string, otherId: string, relation: FamilyRelationKind): void {
    const base = this.familyMembers.find((m) => m.id === baseId);
    const other = this.familyMembers.find((m) => m.id === otherId);
    if (!base || !other || base.id === other.id) return;
    if (relation === "parent") this.ensureFamilyEdge(other.id, base.id, relation, "parent");
    else if (relation === "child") this.ensureFamilyEdge(base.id, other.id, relation, "child");
    else this.ensureFamilyEdge(base.id, other.id, relation, relation);
  }

  private syncFamilyGraph(): void {
    if (!this.familyMembers.length) this.resetFamilyGraph();
    const playerIcon = this.gender === "female" ? "👧" : "👦";
    const player = this.familyMembers.find((m) => m.id === "player");
    if (player) {
      player.name = this.playerDisplayName();
      player.ageOffset = 0;
      player.generation = 0;
      player.tone = "you";
      player.locked = true;
    } else {
      this.upsertFamilyMember({
        id: "player",
        name: this.playerDisplayName(),
        role: "you",
        icon: playerIcon,
        ageOffset: 0,
        generation: 0,
        tone: "you",
        locked: true,
      });
    }

    const hasBabySibling = this.age >= 1 || this.history.some((h) => h.optionId === "babysib");
    if (hasBabySibling && !this.familyHiddenIds.has("babysib")) {
      const added = this.upsertFamilyMember({ id: "babysib", name: "Baby sib", role: "sibling", icon: "👶", ageOffset: -1, generation: 0, tone: "sibling" });
      if (added) {
        this.ensureFamilyEdge("daddy", "babysib", "parent", "parent");
        this.ensureFamilyEdge("mommy", "babysib", "parent", "parent");
      }
    }

    if (this.partner && !this.familyHiddenIds.has("partner")) {
      const added = this.upsertFamilyMember({
        id: "partner",
        name: this.partner.name,
        role: this.partner.title,
        icon: this.partner.emoji,
        ageOffset: -1,
        generation: 0,
        tone: "partner",
      });
      if (added) this.ensureFamilyEdge("player", "partner", "partner", this.spouseDeceased ? "widowed" : "partner");
    }

    if (this.hadChild && !this.familyHiddenIds.has("child")) {
      const added = this.upsertFamilyMember({ id: "child", name: "Baby", role: "your child", icon: this.age - 30 < 3 ? "👶" : "🧒", ageOffset: -30, generation: 1, tone: "child" });
      if (added) {
        this.ensureFamilyEdge("player", "child", "child", "child");
        if (this.partner && !this.familyHiddenIds.has("partner")) this.ensureFamilyEdge("partner", "child", "child", "child");
      }
    }

    if (this.hadChild && this.familyBond >= 3 && this.age >= 60 && !this.familyHiddenIds.has("grandkid")) {
      const added = this.upsertFamilyMember({ id: "grandkid", name: "Little Star", role: "grandkid", icon: "👶", ageOffset: -60, generation: 2, tone: "child" });
      if (added) this.ensureFamilyEdge("child", "grandkid", "child", "child");
    }

    const ids = new Set(this.familyMembers.map((m) => m.id));
    this.familyEdges = this.familyEdges.filter((e) => ids.has(e.from) && ids.has(e.to));
    if (!ids.has(this.familySelectedId)) this.familySelectedId = "player";
  }

  private familyAgeValue(member: FamilyMember): number {
    return Math.max(0, Math.floor(this.age + member.ageOffset));
  }

  private familyAgeLabel(member: FamilyMember): string {
    const age = this.familyAgeValue(member);
    return age <= 0 ? "newborn" : `age ${age}`;
  }

  private familyMemberOptions(exceptId = ""): string {
    return this.familyMembers
      .filter((m) => m.id !== exceptId)
      .map((m) => `<option value="${esc(m.id)}">${esc(m.name)} (${esc(m.role)})</option>`)
      .join("");
  }

  private familyRelationOptions(): string {
    return `
      <option value="parent">parent of selected</option>
      <option value="child">child of selected</option>
      <option value="partner">partner of selected</option>
      <option value="sibling">sibling of selected</option>`;
  }

  private familyGraphMarkup(): string {
    const width = 620;
    const nodeW = 84;
    const nodeH = 94;
    const top = 20;
    const rowGap = 120;
    const gens = [...new Set(this.familyMembers.map((m) => m.generation))].sort((a, b) => a - b);
    const minGen = gens[0] ?? -1;
    const order = ["grandpa", "grandma", "daddy", "mommy", "bigsib", "babysib", "player", "partner", "child", "grandkid"];
    const positions = new Map<string, { x: number; y: number; cx: number; cy: number }>();
    for (const gen of gens) {
      const row = this.familyMembers
        .filter((m) => m.generation === gen)
        .sort((a, b) => (order.indexOf(a.id) === -1 ? 999 : order.indexOf(a.id)) - (order.indexOf(b.id) === -1 ? 999 : order.indexOf(b.id)) || a.name.localeCompare(b.name));
      row.forEach((member, index) => {
        const cx = Math.round((width / (row.length + 1)) * (index + 1));
        const y = top + (gen - minGen) * rowGap;
        positions.set(member.id, { x: cx - nodeW / 2, y, cx, cy: y + nodeH / 2 });
      });
    }
    const height = Math.max(360, top * 2 + Math.max(1, gens.length) * rowGap);
    const lines = this.familyEdges.map((edge) => {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) return "";
      const mx = Math.round((from.cx + to.cx) / 2);
      const my = Math.round((from.cy + to.cy) / 2);
      return `
        <g class="plj-family-edge ${esc(edge.kind)}">
          <line x1="${from.cx}" y1="${from.cy}" x2="${to.cx}" y2="${to.cy}"></line>
          <text x="${mx}" y="${my - 4}">${esc(edge.label)}</text>
        </g>`;
    }).join("");
    const nodes = this.familyMembers.map((member) => {
      const p = positions.get(member.id);
      if (!p) return "";
      const selected = member.id === this.familySelectedId ? " is-selected" : "";
      const locked = member.locked ? " is-locked" : "";
      return `
        <button class="plj-family-node ${esc(member.tone)}${selected}${locked}" data-family-id="${esc(member.id)}" style="left:${p.x}px;top:${p.y}px">
          <span class="plj-family-name">${esc(member.name)}</span>
          <span class="plj-family-face">${member.icon}</span>
          <span class="plj-family-role">${esc(member.role)}</span>
          <small>${this.familyAgeLabel(member)}</small>
        </button>`;
    }).join("");
    return `
      <div class="plj-family-graph" style="--family-graph-w:${width}px;--family-graph-h:${height}px">
        <svg class="plj-family-lines" viewBox="0 0 ${width} ${height}" aria-hidden="true">${lines}</svg>
        ${nodes}
      </div>`;
  }

  private familyEditorMarkup(): string {
    const selected = this.selectedFamilyMember();
    const deleteDisabled = selected.locked ? "disabled" : "";
    const related = this.familyEdges
      .filter((edge) => edge.from === selected.id || edge.to === selected.id)
      .map((edge) => {
        const otherId = edge.from === selected.id ? edge.to : edge.from;
        const other = this.familyMembers.find((m) => m.id === otherId);
        return `
          <div class="plj-family-relation-row">
            <span>${esc(edge.label)}: <b>${esc(other?.name ?? "unknown")}</b></span>
            <button class="plj-mini-pill" data-family-unlink="${esc(edge.id)}">Remove</button>
          </div>`;
      }).join("") || `<div class="plj-family-empty">No relation lines yet.</div>`;
    return `
      <div class="plj-family-editor">
        <div class="plj-family-edit-box">
          <h3>Edit selected</h3>
          <div class="plj-family-form-grid">
            <label>Name <input id="plj-family-name" maxlength="20" value="${esc(selected.name)}"></label>
            <label>Role <input id="plj-family-role" maxlength="24" value="${esc(selected.role)}"></label>
            <label>Age <input id="plj-family-age" type="number" min="0" max="120" value="${this.familyAgeValue(selected)}" inputmode="numeric"></label>
            <label>Icon <input id="plj-family-icon" maxlength="4" value="${esc(selected.icon)}"></label>
          </div>
          <div class="plj-family-toolbar">
            <button class="plj-mini-pill is-primary" id="plj-family-save">Save</button>
            <button class="plj-mini-pill" id="plj-family-delete" ${deleteDisabled}>Delete</button>
          </div>
        </div>
        <div class="plj-family-edit-box">
          <h3>Add person</h3>
          <div class="plj-family-form-grid">
            <label>Name <input id="plj-family-add-name" maxlength="20" value="New relative"></label>
            <label>Role <input id="plj-family-add-role" maxlength="24" value="relative"></label>
            <label>Age <input id="plj-family-add-age" type="number" min="0" max="120" value="${Math.max(0, this.familyAgeValue(selected) - 2)}" inputmode="numeric"></label>
            <label>Icon <input id="plj-family-add-icon" maxlength="4" value="🙂"></label>
            <label class="plj-family-wide">Relation <select id="plj-family-add-relation">${this.familyRelationOptions()}</select></label>
          </div>
          <button class="plj-mini-pill is-primary" id="plj-family-add">Add to graph</button>
        </div>
        <div class="plj-family-edit-box">
          <h3>Relationships</h3>
          <div class="plj-family-link-controls">
            <select id="plj-family-link-target">${this.familyMemberOptions(selected.id)}</select>
            <select id="plj-family-link-relation">${this.familyRelationOptions()}</select>
            <button class="plj-mini-pill is-primary" id="plj-family-link">Link</button>
          </div>
          <div class="plj-family-relations">${related}</div>
        </div>
      </div>`;
  }

  private birthHomeLabel(): string {
    if (this.familyFund >= 1200000) return "wealthy villa";
    if (this.familyFund >= 600000) return "large family house";
    if (this.familyFund >= 250000) return "comfortable home";
    if (this.familyFund >= 80000) return "small apartment";
    return "simple rented room";
  }

  private showFamilyTree(): void {
    if (this.mode !== "playing") return;
    if (!this.canShowFamilyTreeGate()) {
      this.hint("Family Tree opens from elementary school.");
      return;
    }
    this.mode = "familytree";
    this.renderFamilyTreeOverlay();
  }

  private renderFamilyTreeOverlay(): void {
    this.syncFamilyGraph();
    const liveHome = this.liveHome();
    const houseCards = [
      `<div class="plj-house-chip"><b>Parents' home</b><span>${esc(this.birthHomeLabel())}</span><small>Family fund ${formatMoney(this.familyFund)}</small></div>`,
      ...(liveHome ? [`<div class="plj-house-chip is-live"><b>${liveHome.emoji} Your house</b><span>${esc(liveHome.name)}</span><small>value ${formatMoney(this.houseAssetValue(liveHome, this.homes.indexOf(liveHome)))}</small></div>`] : []),
      ...this.homes
        .map((h, i) => ({ h, i }))
        .filter(({ h }) => h !== liveHome)
        .map(({ h, i }) => `<div class="plj-house-chip"><b>${h.emoji} Rental house</b><span>${esc(h.name)}</span><small>rent ${formatMoney(h.rentYield)}/yr</small></div>`),
      `<div class="plj-house-chip"><b>Sibling house</b><span>other branch</span><small>browse the family map</small></div>`,
    ].join("");

    const utilityButtons = `
      <div class="plj-mini-actions">
        <button class="plj-mini-pill" id="plj-tree-training">🏫 Training</button>
        ${this.canShowAssetsGate() ? `<button class="plj-mini-pill" id="plj-tree-assets">💼 Assets</button>` : ""}
      </div>`;
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-family-card">
        <div class="plj-family-head">
          <h2>🌳 Family Tree</h2>
          ${utilityButtons}
        </div>
        <p class="plj-sub">Tap a person to edit details. Use relationships to draw parent, child, partner, and sibling lines.</p>
        <div class="plj-family-map">${this.familyGraphMarkup()}</div>
        ${this.familyEditorMarkup()}
        <h3 class="plj-prof-h3">🏘️ Houses</h3>
        <div class="plj-family-houses">${houseCards}</div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-tree-close">← Back</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.bindFamilyTreeOverlay();
  }

  private bindFamilyTreeOverlay(): void {
    const ov = this.ui.overlay;
    ov.querySelectorAll<HTMLButtonElement>("[data-family-id]").forEach((btn) => {
      btn.onclick = () => {
        this.familySelectedId = btn.dataset.familyId ?? "player";
        this.renderFamilyTreeOverlay();
      };
    });
    ov.querySelector<HTMLButtonElement>("#plj-family-save")!.onclick = () => {
      const selected = this.selectedFamilyMember();
      const name = ov.querySelector<HTMLInputElement>("#plj-family-name")!.value.trim();
      const role = ov.querySelector<HTMLInputElement>("#plj-family-role")!.value.trim();
      const icon = ov.querySelector<HTMLInputElement>("#plj-family-icon")!.value.trim();
      const age = Number(ov.querySelector<HTMLInputElement>("#plj-family-age")!.value);
      selected.name = name || selected.name;
      selected.role = role || selected.role;
      selected.icon = icon || selected.icon;
      if (Number.isFinite(age)) selected.ageOffset = Math.round(Math.max(0, age)) - Math.floor(this.age);
      if (selected.id === "player") this.playerName = selected.name;
      this.captureFamilyEdit("Saved family member.");
      this.renderFamilyTreeOverlay();
    };
    ov.querySelector<HTMLButtonElement>("#plj-family-delete")!.onclick = () => {
      const selected = this.selectedFamilyMember();
      if (selected.locked) {
        this.hint("You stay in your own family tree.");
        return;
      }
      this.familyHiddenIds.add(selected.id);
      this.familyMembers = this.familyMembers.filter((m) => m.id !== selected.id);
      this.familyEdges = this.familyEdges.filter((e) => e.from !== selected.id && e.to !== selected.id);
      this.familySelectedId = "player";
      this.captureFamilyEdit("Removed family member.");
      this.renderFamilyTreeOverlay();
    };
    ov.querySelector<HTMLButtonElement>("#plj-family-add")!.onclick = () => {
      const selected = this.selectedFamilyMember();
      const relation = ov.querySelector<HTMLSelectElement>("#plj-family-add-relation")!.value as FamilyRelationKind;
      const name = ov.querySelector<HTMLInputElement>("#plj-family-add-name")!.value.trim() || "New relative";
      const role = ov.querySelector<HTMLInputElement>("#plj-family-add-role")!.value.trim() || "relative";
      const icon = ov.querySelector<HTMLInputElement>("#plj-family-add-icon")!.value.trim() || "🙂";
      const age = Number(ov.querySelector<HTMLInputElement>("#plj-family-add-age")!.value);
      const generation = relation === "parent" ? selected.generation - 1 : relation === "child" ? selected.generation + 1 : selected.generation;
      const id = `custom-${this.familyNextId++}`;
      this.familyMembers.push({
        id,
        name,
        role,
        icon,
        ageOffset: Number.isFinite(age) ? Math.round(Math.max(0, age)) - Math.floor(this.age) : 0,
        generation,
        tone: "custom",
      });
      this.connectFamilyRelation(selected.id, id, relation);
      this.familySelectedId = id;
      this.captureFamilyEdit("Added family member.");
      this.renderFamilyTreeOverlay();
    };
    ov.querySelector<HTMLButtonElement>("#plj-family-link")!.onclick = () => {
      const selected = this.selectedFamilyMember();
      const otherId = ov.querySelector<HTMLSelectElement>("#plj-family-link-target")!.value;
      const relation = ov.querySelector<HTMLSelectElement>("#plj-family-link-relation")!.value as FamilyRelationKind;
      this.connectFamilyRelation(selected.id, otherId, relation);
      this.captureFamilyEdit("Updated family relationship.");
      this.renderFamilyTreeOverlay();
    };
    ov.querySelectorAll<HTMLButtonElement>("[data-family-unlink]").forEach((btn) => {
      btn.onclick = () => {
        const edgeId = btn.dataset.familyUnlink;
        this.familyEdges = this.familyEdges.filter((edge) => edge.id !== edgeId);
        this.captureFamilyEdit("Removed family relationship.");
        this.renderFamilyTreeOverlay();
      };
    });
    ov.querySelector<HTMLButtonElement>("#plj-tree-close")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
    const assetsLink = ov.querySelector<HTMLButtonElement>("#plj-tree-assets");
    if (assetsLink) assetsLink.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showAssets();
    };
    ov.querySelector<HTMLButtonElement>("#plj-tree-training")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showTraining();
    };
  }

  private captureFamilyEdit(message: string): void {
    this.familyEdges = this.familyEdges.filter((edge) =>
      this.familyMembers.some((m) => m.id === edge.from) &&
      this.familyMembers.some((m) => m.id === edge.to)
    );
    if (this.timeline[this.stageIndex]) this.timeline[this.stageIndex] = this.snapshot();
    this.hint(message);
  }

  private annualPlayerIncome(): number {
    return this.occupation ? Math.round(28000 * this.incomeMul() * this.occupation.salaryMul) : 0;
  }

  private grandparentSupport(): number {
    if (this.age >= PARENT_SUPPORT_END_AGE) return 0;
    return Math.round(Math.min(24000, Math.max(500, this.familyFund * 0.012)) / 100) * 100;
  }

  private annualExpenseBreakdown(): { label: string; value: number; note: string }[] {
    const discount = activityDiscount(this.stats);
    const adult = this.age >= 18 || !!this.occupation;
    const rent = adult && this.homes.length === 0
      ? Math.round((this.age < 24 ? 9000 : this.age < 65 ? 18000 : 12000) * discount)
      : 0;
    const foodPlay = Math.round((this.age < 4 ? 1800 : this.age < 13 ? 3200 : this.age < 18 ? 5200 : this.age < 65 ? 9600 : 7600) * discount);
    const vehicle = this.ownedVehicles().reduce((sum, v) => sum + Math.round(Math.max(80, v.cost * 0.055)), 0);
    const spouse = this.partner && !this.spouseDeceased ? 4500 : 0;
    const child = this.hadChild ? (this.age < 55 ? 7200 : 1800) : 0;
    const pet = this.petKind ? 900 : 0;
    return [
      { label: "You", value: foodPlay + rent, note: rent > 0 ? "food, play, rent" : "food and play" },
      { label: "House", value: this.houseUpkeep, note: this.homes.length ? "upkeep" : "no owned house" },
      { label: "Vehicle", value: vehicle, note: this.ownedVehicles().length ? "running cost" : "no vehicle" },
      { label: "Partner", value: spouse, note: this.partner && !this.spouseDeceased ? this.partner.name : "none" },
      { label: "Child", value: child, note: this.hadChild ? "care and school" : "none" },
      { label: "Pet", value: pet, note: this.petKind ?? "none" },
    ];
  }

  private ledgerRows(rows: { label: string; value: number; note?: string; positive?: boolean }[]): string {
    return rows.map((r) => `
      <div class="plj-ledger-row">
        <span><b>${esc(r.label)}</b>${r.note ? `<small>${esc(r.note)}</small>` : ""}</span>
        <strong class="${r.positive === false ? "is-cost" : ""}">${formatMoney(r.value)}</strong>
      </div>`).join("");
  }

  private spendTrainingMoment(): void {
    this.age += Math.max(0.01, this.stageStep() * 0.16);
    this.passiveTick();
    this.renderHud();
  }

  private parseTrainingQuestion(value: unknown): TrainingQuestion | null {
    const row = value as Partial<TrainingQuestion> | null;
    if (!row || typeof row.q !== "string" || !Array.isArray(row.answers) || typeof row.correct !== "number" || typeof row.win !== "string") return null;
    const answers = row.answers.filter((answer): answer is string => typeof answer === "string" && answer.trim().length > 0).slice(0, 3);
    const correct = Math.round(row.correct);
    if (answers.length !== 3 || correct < 0 || correct >= answers.length) return null;
    return {
      q: row.q.trim(),
      answers,
      correct,
      win: row.win.trim(),
    };
  }

  private parseTrainingBank(value: unknown): Partial<Record<TrainingCategory, TrainingQuestionBank>> | null {
    const root = value as { categories?: unknown } | null;
    const categories = root?.categories as Partial<Record<TrainingCategory, Partial<Record<TrainingLevel, unknown>>>> | undefined;
    if (!categories) return null;
    const parsed: Partial<Record<TrainingCategory, TrainingQuestionBank>> = {};
    for (const category of TRAINING_CATEGORIES) {
      const categoryRows = categories[category];
      if (!categoryRows) continue;
      const bank = {} as TrainingQuestionBank;
      let complete = true;
      for (const { id: level } of TRAINING_LEVELS) {
        const rows = categoryRows[level];
        if (!Array.isArray(rows)) {
          complete = false;
          break;
        }
        bank[level] = rows.map((row) => this.parseTrainingQuestion(row)).filter((row): row is TrainingQuestion => !!row);
        if (!bank[level].length) {
          complete = false;
          break;
        }
      }
      if (complete) parsed[category] = bank;
    }
    return Object.keys(parsed).length ? parsed : null;
  }

  private async loadTrainingDatabase(): Promise<void> {
    try {
      const response = await fetch(TRAINING_DATABASE_URL, { cache: "no-cache" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const parsed = this.parseTrainingBank(await response.json());
      if (!parsed) throw new Error("invalid training database");
      this.trainingDatabase = parsed;
      if (this.mode === "training") this.showTraining();
    } catch (err) {
      console.warn("[pixel-life] using built-in training questions", err);
    }
  }

  private trainingQuestions(category: TrainingCategory): readonly TrainingQuestion[] {
    const level = this.trainingLevel[category];
    const external = this.trainingDatabase?.[category]?.[level];
    if (external?.length) return external;
    if (category === "iq") {
      const [from, to] = TRAINING_IQ_RANGES[level];
      return [...TRAINING_PUZZLES.slice(from, Math.min(to, TRAINING_PUZZLES.length)), ...TRAINING_IQ_EXTRA_BANKS[level]];
    }
    return [...TRAINING_BANKS[category][level], ...TRAINING_EXTRA_BANKS[category][level]];
  }

  private fallbackTrainingCategoryTotal(category: TrainingCategory): number {
    if (category === "iq") {
      return TRAINING_PUZZLES.length + Object.values(TRAINING_IQ_EXTRA_BANKS).reduce((sum, questions) => sum + questions.length, 0);
    }
    return Object.values(TRAINING_BANKS[category]).reduce((sum, questions) => sum + questions.length, 0) +
      Object.values(TRAINING_EXTRA_BANKS[category]).reduce((sum, questions) => sum + questions.length, 0);
  }

  private trainingCategoryTotal(category: TrainingCategory): number {
    const external = this.trainingDatabase?.[category];
    if (external) return TRAINING_LEVELS.reduce((sum, level) => sum + (external[level.id]?.length ?? 0), 0);
    return this.fallbackTrainingCategoryTotal(category);
  }

  private trainingTotalQuestions(): number {
    return TRAINING_CATEGORIES.reduce((sum, category) => sum + this.trainingCategoryTotal(category), 0);
  }

  private setTrainingLevel(category: TrainingCategory, level: TrainingLevel): void {
    this.trainingLevel[category] = level;
    this.trainingQuestionIndex[category] = 0;
    this.showTraining();
  }

  private trainingWin(category: TrainingCategory, win: string): string {
    if (category === "iq") {
      this.applyEff({ smarts: 2, fun: 1 }, "mental");
      this.hint("🧠 IQ question solved. +2 IQ.");
      return win;
    }
    if (category === "eq") {
      this.familyBond += 0.8;
      this.applyEff({ health: 3, happiness: 2 }, "mental");
      this.hint("💛 EQ question solved. +Mental health.");
      return `${win} +Mental health, +Happy, +Family bond.`;
    }
    const bonus = Math.round(this.age < 18 ? 150 + this.stats.smarts * 6 : 500 + this.stats.smarts * 14);
    this.moneyWise = true;
    this.money += bonus;
    this.lifetimeEarned += bonus;
    this.connections += 1;
    this.applyEff({ smarts: 1, happiness: 0.5 }, "mental");
    this.hint(`📈 Strategy solved. +${formatMoney(bonus)}.`);
    return `${win} ${formatMoney(bonus)} earned, +network, moneyWise on.`;
  }

  private solveTrainingPuzzle(category: TrainingCategory, answer: number): void {
    const questions = this.trainingQuestions(category);
    const puzzle = questions[this.trainingQuestionIndex[category] % questions.length];
    if (answer === puzzle.correct) {
      const win = this.trainingWin(category, puzzle.win);
      this.trainingQuestionIndex[category] = (this.trainingQuestionIndex[category] + 1) % questions.length;
      this.spendTrainingMoment();
      this.showTraining(win);
      return;
    }
    let miss = "Not quite. The practice still warmed up your brain. +1 Fun.";
    if (category === "eq") {
      this.applyEff({ happiness: 1 }, "mental");
      miss = "Not quite. Reflection still helps emotional balance. +1 Happy.";
    } else if (category === "strategy") {
      this.applyEff({ smarts: 0.3, fun: 0.5 }, "mental");
      miss = "Not quite. Planning practice still helped a little. +Strategy practice.";
    } else {
      this.applyEff({ fun: 1 }, "mental");
    }
    this.spendTrainingMoment();
    this.hint("Close. Try another angle.");
    this.showTraining(miss);
  }

  private useTrainingVideo(kind: TrainingKind): void {
    window.open(TRAINING_LINKS[kind], "_blank", "noopener,noreferrer");
    if (kind === "iq") {
      this.applyEff({ smarts: 1.5, happiness: 1 }, "mental");
      this.spendTrainingMoment();
      this.hint("🎓 Learning habits watched. +IQ.");
      this.showTraining("You looked up smarter learning habits. +1.5 IQ, +1 Happy.");
      return;
    }
    if (kind === "money") {
      const bonus = Math.round(this.age < 18 ? 200 + this.stats.smarts * 8 : 800 + this.stats.smarts * 18);
      this.moneyWise = true;
      this.money += bonus;
      this.lifetimeEarned += bonus;
      this.applyEff({ smarts: 0.8 }, "mental");
      this.spendTrainingMoment();
      this.hint(`💸 Money lesson. +${formatMoney(bonus)}.`);
      this.showTraining(`Financial education helped you earn ${formatMoney(bonus)} and unlocked wiser money habits.`);
      return;
    }
    this.familyBond += 1;
    this.applyEff({ health: 5, happiness: 3 }, "mental");
    this.spendTrainingMoment();
    this.hint("💛 Family care learning. +Mental health.");
    this.showTraining("You studied how to treat family well. +Mental health, +Happy, +Family bond.");
  }

  private trainingQuizRow(category: TrainingCategory): string {
    const meta = TRAINING_CATEGORY_META[category];
    const level = this.trainingLevel[category];
    const questions = this.trainingQuestions(category);
    const questionNumber = this.trainingQuestionIndex[category] % questions.length;
    const puzzle = questions[questionNumber];
    const levels = TRAINING_LEVELS.map((l) => `
      <button class="plj-training-level${l.id === level ? " is-selected" : ""}" data-training-category="${category}" data-training-level="${l.id}">
        ${esc(l.label)}
      </button>`).join("");
    const answers = stableAnswerOrder(`${category}-${level}-${questionNumber}-${puzzle.q}`, puzzle.answers.length).map((answerIndex) =>
      `<button class="plj-training-answer" data-training-category="${category}" data-answer="${answerIndex}">${esc(puzzle.answers[answerIndex])}</button>`
    ).join("");
    return `
      <section class="plj-training-puzzle is-${category}">
        <div class="plj-training-row-head">
          <h3>${meta.icon} ${esc(meta.title)} <span class="plj-training-count">Question ${questionNumber + 1} / ${questions.length}</span></h3>
          <div class="plj-training-levels" aria-label="${esc(meta.title)} level">${levels}</div>
        </div>
        <p class="plj-training-summary">${esc(meta.summary)}</p>
        <p>${esc(puzzle.q)}</p>
        <div class="plj-training-answers">${answers}</div>
      </section>`;
  }

  private showTraining(message = ""): void {
    if (this.mode !== "playing" && this.mode !== "training") return;
    if (!this.canShowTrainingGate()) {
      this.hint("Training opens from elementary school.");
      return;
    }
    this.mode = "training";
    const quizRows = TRAINING_CATEGORIES.map((category) => this.trainingQuizRow(category)).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-training-card">
        <div class="plj-family-head">
          <h2>🏫 Training</h2>
          <div class="plj-mini-actions">
            ${this.canShowAssetsGate() ? `<button class="plj-mini-pill" id="plj-training-assets">💼 Assets</button>` : ""}
            ${this.canShowFamilyTreeGate() ? `<button class="plj-mini-pill" id="plj-training-tree">🌳 Family Tree</button>` : ""}
          </div>
        </div>
        <p class="plj-sub">Practice thinking, EQ, and career strategy. ${this.trainingTotalQuestions()} built-in questions are split across three levels; each session takes a tiny slice of life time.</p>
        ${message ? `<p class="plj-training-result">${esc(message)}</p>` : ""}
        <div class="plj-training-board">${quizRows}</div>
        <div class="plj-training-grid">
          <button class="plj-training-action" data-train="iq">
            <span>🧠 Smarter habits</span>
            <small>Open YouTube search: how to be smarter. Reward: +IQ.</small>
          </button>
          <button class="plj-training-action" data-train="money">
            <span>💸 Money education</span>
            <small>Open YouTube search: earn more money. Reward: cash + moneyWise.</small>
          </button>
          <button class="plj-training-action" data-train="family">
            <span>💛 Treat family well</span>
            <small>Open YouTube search: family care and mental health. Reward: mental health.</small>
          </button>
        </div>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-training-close">← Back</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelectorAll<HTMLButtonElement>("[data-answer]").forEach((btn) => {
      const category = btn.dataset.trainingCategory as TrainingCategory | undefined;
      btn.onclick = () => {
        if (category === "iq" || category === "eq" || category === "strategy") this.solveTrainingPuzzle(category, Number(btn.dataset.answer));
      };
    });
    this.ui.overlay.querySelectorAll<HTMLButtonElement>("[data-training-level]").forEach((btn) => {
      const category = btn.dataset.trainingCategory as TrainingCategory | undefined;
      const level = btn.dataset.trainingLevel as TrainingLevel | undefined;
      btn.onclick = () => {
        if ((category === "iq" || category === "eq" || category === "strategy") &&
          (level === "starter" || level === "practice" || level === "advanced")) {
          this.setTrainingLevel(category, level);
        }
      };
    });
    this.ui.overlay.querySelectorAll<HTMLButtonElement>("[data-train]").forEach((btn) => {
      btn.onclick = () => {
        const kind = btn.dataset.train;
        if (kind === "iq" || kind === "money" || kind === "family") this.useTrainingVideo(kind);
      };
    });
    const assetsBtn = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-training-assets");
    if (assetsBtn) assetsBtn.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showAssets();
    };
    const treeBtn = this.ui.overlay.querySelector<HTMLButtonElement>("#plj-training-tree");
    if (treeBtn) treeBtn.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showFamilyTree();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-training-close")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
  }

  private showAssets(): void {
    if (this.mode !== "playing") return;
    if (!this.canShowAssetsGate()) {
      this.hint(`Assets open from middle school, or elementary with over ${formatMoney(ELEMENTARY_ASSETS_MONEY)}.`);
      return;
    }
    this.mode = "assets";
    const daddy = Math.round(this.parentAnnualSupport * 0.54);
    const mommy = Math.round(this.parentAnnualSupport * 0.46);
    const grandparent = this.grandparentSupport();
    const playerIncome = this.annualPlayerIncome();
    const expenseRows = this.annualExpenseBreakdown();
    const expenseTotal = expenseRows.reduce((sum, r) => sum + r.value, 0);
    const incomeRows = [
      { label: "Daddy income", value: daddy, note: "support flow / yr" },
      { label: "Mommy income", value: mommy, note: "support flow / yr" },
      { label: "Grandparent help", value: grandparent, note: this.age < 18 ? "family help / yr" : "ended at adulthood" },
      { label: "Player income", value: playerIncome, note: this.occupation?.name ?? "not working yet" },
      { label: "Rental income", value: this.rentalIncome, note: this.rentalIncome ? "spare homes / yr" : "no spare rental" },
    ];
    const houseRows = this.homes.map((h, i) => ({
      label: `${h.emoji} ${h.name}`,
      value: this.houseAssetValue(h, i),
      note: `+${Math.round(this.houseAppreciationRate(h) * 100)}%/yr est.`,
    }));
    const vehicleRows = this.ownedVehicles().map((v) => ({
      label: `${v.emoji} ${v.name}`,
      value: this.vehicleAssetValue(v),
      note: `-${Math.round(VEHICLE_DEPRECIATION * 100)}%/yr est.`,
    }));
    const assetRows = [
      { label: "Cash", value: this.money, note: "current money" },
      { label: "Stocks", value: this.investments, note: "current market pot" },
      ...houseRows,
      ...vehicleRows,
    ];

    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-assets-card">
        <div class="plj-family-head">
          <h2>💼 Assets</h2>
          <div class="plj-mini-actions">
            <button class="plj-mini-pill" id="plj-assets-training">🏫 Training</button>
            <button class="plj-mini-pill" id="plj-assets-tree">🌳 Family Tree</button>
          </div>
        </div>
        <div class="plj-networth">
          <span>Net worth</span>
          <strong>${formatMoney(this.netWorth())}</strong>
        </div>
        <div class="plj-ledger-grid">
          <section>
            <h3>Income / Year</h3>
            ${this.ledgerRows(incomeRows)}
          </section>
          <section>
            <h3>Assets</h3>
            ${this.ledgerRows(assetRows)}
          </section>
          <section>
            <h3>Expenses / Year</h3>
            ${this.ledgerRows(expenseRows.map((r) => ({ ...r, positive: false })))}
            <div class="plj-ledger-total"><span>Total expense</span><strong>${formatMoney(expenseTotal)}</strong></div>
          </section>
        </div>
        <p class="plj-sub">Houses estimate 3-5% yearly growth by quality. Vehicles lose value over time. Rent appears when you own spare homes.</p>
        <div class="plj-title-row">
          <button class="plj-btn plj-btn-ghost" id="plj-assets-close">← Back</button>
        </div>
      </div>`;
    this.ui.overlay.classList.add("show");
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-assets-close")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-assets-tree")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showFamilyTree();
    };
    this.ui.overlay.querySelector<HTMLButtonElement>("#plj-assets-training")!.onclick = () => {
      this.mode = "playing";
      this.clearOverlay();
      this.showTraining();
    };
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
    this.setupFamilyFund = this.normalizeFamilyMoney(this.rollFamilyMoney());
    const stageOptions = STAGES.map((s, i) =>
      `<option value="${i}">${s.emoji} ${esc(s.name)} · age ${s.ageStart}-${s.ageEnd}</option>`
    ).join("");
    const heritageCards = HERITAGE_OPTIONS.map((h) => `
      <button class="plj-heritage${h.id === this.heritage ? " is-selected" : ""}" data-heritage="${h.id}">
        <span class="plj-heritage-icon">${h.icon}</span>
        <span>${esc(h.label)}</span>
      </button>`).join("");
    this.ui.overlay.innerHTML = `
      <div class="plj-card plj-title">
        <h2>A new life begins…</h2>
        <p class="plj-sub">Name your character (optional) — it shows on your career profile.</p>
        <div class="plj-bio-head"><input id="plj-setup-name" placeholder="Name (optional)" maxlength="40"></div>
        <p class="plj-sub">Choose the baby's heritage style.</p>
        <div class="plj-heritage-grid">${heritageCards}</div>
        <div class="plj-setup-grid">
          <label class="plj-setup-field">
            <span>Start stage</span>
            <select id="plj-start-stage">${stageOptions}</select>
          </label>
          <label class="plj-setup-field">
            <span>Life speed <b id="plj-life-speed-readout">${this.lifeSpeedLabel()}</b></span>
            <input id="plj-life-speed" type="range" ${this.lifeSpeedInputAttrs()}>
          </label>
          <label class="plj-setup-field plj-setup-field-wide">
            <span>Initial family money <b id="plj-family-money-readout">${formatMoney(this.setupFamilyFund)}</b></span>
            <input id="plj-family-money" type="range" min="${FAMILY_MONEY_MIN}" max="${FAMILY_MONEY_MAX}" step="1000" value="${this.setupFamilyFund}">
            <div class="plj-money-edit-row">
              <input id="plj-family-money-number" type="number" min="${FAMILY_MONEY_MIN}" max="${FAMILY_MONEY_MAX}" step="1000" value="${this.setupFamilyFund}" inputmode="numeric">
              <small>${formatMoney(FAMILY_MONEY_MIN)} – ${formatMoney(FAMILY_MONEY_MAX)}</small>
            </div>
          </label>
        </div>
        <p class="plj-sub">Is it a boy or a girl?</p>
        <div class="plj-genders">
          ${this.setupGenderButton("male", this.heritage)}
          ${this.setupGenderButton("female", this.heritage)}
        </div>
        <p class="plj-foot">Default speed keeps the current pace.</p>
      </div>`;
    this.ui.overlay.classList.add("show");
    const speedInput = this.ui.overlay.querySelector<HTMLInputElement>("#plj-life-speed")!;
    const speedReadout = this.ui.overlay.querySelector<HTMLElement>("#plj-life-speed-readout")!;
    const moneyInput = this.ui.overlay.querySelector<HTMLInputElement>("#plj-family-money")!;
    const moneyNumber = this.ui.overlay.querySelector<HTMLInputElement>("#plj-family-money-number")!;
    const moneyReadout = this.ui.overlay.querySelector<HTMLElement>("#plj-family-money-readout")!;
    speedInput.oninput = () => {
      this.setLifeSpeedIndex(Number(speedInput.value));
      speedInput.value = String(this.lifeSpeedIndex());
      speedReadout.textContent = this.lifeSpeedLabel();
    };
    const syncFamilyMoney = (value: number): void => {
      this.setupFamilyFund = this.normalizeFamilyMoney(value);
      moneyInput.value = String(this.setupFamilyFund);
      moneyNumber.value = String(this.setupFamilyFund);
      moneyReadout.textContent = formatMoney(this.setupFamilyFund);
    };
    moneyInput.oninput = () => syncFamilyMoney(Number(moneyInput.value));
    moneyNumber.onchange = () => syncFamilyMoney(Number(moneyNumber.value));
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-heritage").forEach((btn) => {
      btn.onclick = () => {
        this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-heritage").forEach((b) => b.classList.remove("is-selected"));
        btn.classList.add("is-selected");
        this.heritage = this.normalizeHeritage(btn.dataset.heritage);
        this.refreshSetupGenderPreviews(this.heritage);
      };
    });
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-gender").forEach((btn) => {
      btn.onclick = () => {
        this.playerName = (this.ui.overlay.querySelector<HTMLInputElement>("#plj-setup-name")?.value ?? "").slice(0, 40);
        this.gender = btn.dataset.g === "female" ? "female" : "male";
        this.heritage = this.normalizeHeritage(this.ui.overlay.querySelector<HTMLButtonElement>(".plj-heritage.is-selected")?.dataset.heritage);
        const startIndex = this.normalizeStageIndex(Number(this.ui.overlay.querySelector<HTMLSelectElement>("#plj-start-stage")?.value ?? 0));
        this.setLifeSpeedIndex(Number(speedInput.value));
        syncFamilyMoney(Number(moneyNumber.value));
        this.newGame(false, startIndex, this.setupFamilyFund);
      };
    });
  }

  private setupGenderButton(gender: Gender, heritage: HeritageStyle): string {
    return `<button class="plj-gender" data-g="${gender}">${this.setupGenderAvatar(gender, heritage)}<span>${gender === "female" ? "Girl" : "Boy"}</span></button>`;
  }

  private setupGenderAvatar(gender: Gender, heritage: HeritageStyle): string {
    const look = avatarLook(0, gender, heritage);
    const kind = gender === "female" ? "female" : "male";
    return `
      <span class="plj-gender-face plj-setup-avatar is-${kind} is-${look.hairTexture}" aria-hidden="true" style="--plj-setup-skin:${look.skin};--plj-setup-hair:${look.hair};--plj-setup-shirt:${look.shirt}">
        <span class="plj-setup-body"></span>
        <span class="plj-setup-hair"></span>
        <span class="plj-setup-head">
          <span class="plj-setup-eye is-left"></span>
          <span class="plj-setup-eye is-right"></span>
          <span class="plj-setup-mouth"></span>
        </span>
        <span class="plj-setup-fringe"></span>
      </span>`;
  }

  private refreshSetupGenderPreviews(heritage: HeritageStyle): void {
    this.ui.overlay.querySelectorAll<HTMLButtonElement>(".plj-gender").forEach((btn) => {
      const gender: Gender = btn.dataset.g === "female" ? "female" : "male";
      const avatar = btn.querySelector<HTMLElement>(".plj-setup-avatar");
      if (avatar) avatar.outerHTML = this.setupGenderAvatar(gender, heritage);
    });
  }

  // --- biography mode -------------------------------------------------------

  /** Start replaying an authored (or recorded) life. */
  private startBiographyPlay(bio: Biography): void {
    this.biography = bio;
    this.gender = bio.gender;
    this.heritage = "western";
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
    this.ui.canvas.addEventListener("pointerdown", (e) => {
      if (this.mode !== "playing") return;
      const p = this.canvasPoint(e);
      if (this.canShowTrainingGate() && this.hitCircle(p.x, p.y, UTILITY_GATE_X, this.trainingGateY(), TRAINING_GATE_R + 8)) {
        e.preventDefault();
        this.showTraining();
        return;
      }
      if (this.canShowAssetsGate() && this.hitCircle(p.x, p.y, UTILITY_GATE_X, this.assetsGateY(), ASSETS_GATE_R + 8)) {
        e.preventDefault();
        this.showAssets();
        return;
      }
      if (this.canShowFamilyTreeGate() && this.hitCircle(p.x, p.y, UTILITY_GATE_X, this.familyTreeGateY(), FAMILY_TREE_GATE_R + 8)) {
        e.preventDefault();
        this.showFamilyTree();
      }
    });

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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
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
