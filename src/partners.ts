import type { Partner } from "./types";

// ---------------------------------------------------------------------------
// Marriage candidates. The Marriage & Baby stage shows these and asks the
// player to choose one. The chosen partner's modifiers are applied passively at
// every stage transition afterwards — so who you marry shapes the rest of your
// life. Eight archetypes (a mix of women and men).
//
// Partners are GATED by your stats (`requires`): a high-status partner (the
// doctor) wants you to be smart AND well-off; the athlete wants a fit match
// (low weight, good health); a few want you to be doing well financially. The
// free-spirited Artist has no requirements, so you can always find SOMEONE — but
// neglect your studies, money or fitness and your options narrow.
// ---------------------------------------------------------------------------

export const PARTNERS: Partner[] = [
  {
    id: "maya",
    name: "Maya",
    title: "the Doctor",
    gender: "female",
    emoji: "👩‍⚕️",
    blurb: "Caring and brilliant. Keeps the family healthy — but expects an equal.",
    modifiers: { health: 3, happiness: 1 },
    moneyMod: 6000,
    requires: { minIq: 120, minMoney: 200000 },
    storyTag: "mate_doctor",
  },
  {
    id: "leo",
    name: "Leo",
    title: "the Entrepreneur",
    gender: "male",
    emoji: "👨‍💼",
    blurb: "Ambitious and driven. Builds wealth, but works long hours.",
    modifiers: { fun: -1 },
    moneyMod: 9000,
    requires: { minMoney: 120000 },
    storyTag: "mate_entrepreneur",
  },
  {
    id: "ravi",
    name: "Ravi",
    title: "the Engineer",
    gender: "male",
    emoji: "👨‍🔧",
    blurb: "Steady and clever. A dependable, comfortable home.",
    modifiers: { smarts: 2 },
    moneyMod: 5000,
    requires: { minIq: 112 },
    storyTag: "mate_engineer",
  },
  {
    id: "sam",
    name: "Sam",
    title: "the Teacher",
    gender: "male",
    emoji: "👨‍🏫",
    blurb: "Patient and wise. Makes you and the kids a little smarter.",
    modifiers: { smarts: 3, happiness: 1 },
    storyTag: "mate_teacher",
  },
  {
    id: "nina",
    name: "Nina",
    title: "the Athlete",
    gender: "female",
    emoji: "🏃‍♀️",
    blurb: "Energetic and fit. Wants a partner who looks after themselves.",
    modifiers: { health: 3, fun: 2 },
    requires: { maxWeight: 64, minHealth: 70 },
    storyTag: "mate_athlete",
  },
  {
    id: "jude",
    name: "Jude",
    title: "the Chef",
    gender: "male",
    emoji: "👨‍🍳",
    blurb: "Generous and cosy. Every meal is healthy and delicious.",
    modifiers: { health: 2, happiness: 2 },
    moneyMod: 500,
    storyTag: "mate_chef",
  },
  {
    id: "elena",
    name: "Elena",
    title: "the Traveller",
    gender: "female",
    emoji: "🧳",
    blurb: "Adventurous and joyful. You'll see the world together — if you can fund it.",
    modifiers: { fun: 3, happiness: 1 },
    moneyMod: -2000,
    requires: { minMoney: 60000 },
    storyTag: "mate_traveller",
  },
  {
    id: "aria",
    name: "Aria",
    title: "the Artist",
    gender: "female",
    emoji: "👩‍🎨",
    blurb: "Free-spirited and warm. Loves you for you — no conditions at all.",
    modifiers: { fun: 3, happiness: 2 },
    moneyMod: -1500,
    storyTag: "mate_artist",
  },
];
