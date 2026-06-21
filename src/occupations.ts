import type { Occupation } from "./types";

// ---------------------------------------------------------------------------
// Careers chosen at the start of the Career stage — and changed later from the
// 💼 Career desk. Your salary = base pay ($28k/action) × the job's multiplier ×
// how high your IQ is, so the better jobs both PAY more and REQUIRE a higher IQ
// (built by studying in school and upskilling at work). A `field` groups the
// ladder and a `tier` (1 Intern … 9 C-Suite) shows your seniority on the profile.
// Jobs your IQ isn't high enough for yet are shown locked.
// ---------------------------------------------------------------------------

export const OCCUPATIONS: Occupation[] = [
  { id: "artist", name: "Artist", emoji: "🎨", field: "Creative", tier: 2, salaryMul: 0.8, minIq: 0, perks: { fun: 6, happiness: 4 }, blurb: "Follow your passion. Money's thin, life is rich.", storyTag: "job_artist" },
  { id: "barista", name: "Barista", emoji: "☕", field: "Service", tier: 1, salaryMul: 0.78, minIq: 0, perks: { fun: 3 }, blurb: "Pull shots, learn people. Anyone can start here.", storyTag: "job_service" },
  { id: "trades", name: "Tradesperson", emoji: "🔧", field: "Trades", tier: 3, salaryMul: 1.15, minIq: 86, perks: { health: 5 }, blurb: "Work with your hands. Honest, active, reliable.", storyTag: "job_trades" },
  { id: "chef", name: "Chef", emoji: "👨‍🍳", field: "Service", tier: 3, salaryMul: 1.05, minIq: 94, perks: { happiness: 5 }, blurb: "Feed people joy. Long shifts, warm heart.", storyTag: "job_chef" },
  { id: "teacher", name: "Teacher", emoji: "👩‍🏫", field: "Education", tier: 3, salaryMul: 1.05, minIq: 102, perks: { happiness: 6, smarts: 2 }, blurb: "Shape young minds. Modest pay, deep meaning.", storyTag: "job_teacher" },
  { id: "nurse", name: "Nurse", emoji: "🩹", field: "Medicine", tier: 3, salaryMul: 1.3, minIq: 108, perks: { health: 3, happiness: 2 }, blurb: "Care for the sick. Hard, vital, well respected.", storyTag: "job_nurse" },
  { id: "entrepreneur", name: "Entrepreneur", emoji: "🚀", field: "Business", tier: 4, salaryMul: 1.5, minIq: 110, perks: { fun: 2, happiness: 2 }, blurb: "Start your own thing. Big upside, big hustle.", storyTag: "job_entrepreneur" },
  { id: "jrdev", name: "Junior Developer", emoji: "🖥️", field: "Tech", tier: 2, salaryMul: 1.2, minIq: 110, perks: { smarts: 2 }, blurb: "Write code, ship features. The first rung in tech.", storyTag: "job_tech" },
  { id: "accountant", name: "Accountant", emoji: "🧮", field: "Finance", tier: 3, salaryMul: 1.18, minIq: 112, perks: { smarts: 2 }, blurb: "Balance the books. Steady, detail-driven money.", storyTag: "job_finance" },
  { id: "analyst", name: "Financial Analyst", emoji: "📊", field: "Finance", tier: 4, salaryMul: 1.3, minIq: 116, perks: { smarts: 3 }, blurb: "Model markets and risk. Sharp suits, sharper spreadsheets.", storyTag: "job_finance" },
  { id: "engineer", name: "Software Engineer", emoji: "💻", field: "Tech", tier: 4, salaryMul: 1.55, minIq: 118, perks: { smarts: 2 }, blurb: "Build and architect. Strong, steady, modern money.", storyTag: "job_engineer" },
  { id: "manager", name: "Manager", emoji: "📈", field: "Business", tier: 6, salaryMul: 1.65, minIq: 120, perks: { happiness: 2, smarts: 2 }, blurb: "Lead a team. People skills turn into bigger pay.", storyTag: "job_business" },
  { id: "lawyer", name: "Lawyer", emoji: "⚖️", field: "Law", tier: 5, salaryMul: 1.7, minIq: 126, perks: { happiness: 1 }, blurb: "Argue for a living. Prestigious and very well paid.", storyTag: "job_lawyer" },
  { id: "staffeng", name: "Staff Engineer", emoji: "🛠️", field: "Tech", tier: 6, salaryMul: 1.85, minIq: 128, perks: { smarts: 4 }, blurb: "The technical top of the tree — deep expertise, top pay.", storyTag: "job_tech" },
  { id: "doctor", name: "Doctor", emoji: "🩺", field: "Medicine", tier: 5, salaryMul: 1.8, minIq: 132, perks: { happiness: 3 }, blurb: "Save lives. Top pay — but you need a top-tier IQ.", storyTag: "job_doctor" },
  { id: "ceo", name: "CEO", emoji: "👔", field: "Business", tier: 9, salaryMul: 3.6, minIq: 150, perks: { happiness: 4 }, blurb: "Run the whole company. The summit — and rarely reached.", storyTag: "job_business" },
];

/** Seniority tier → label, for the career profile. */
export const TIER_LABELS: Record<number, string> = {
  1: "Intern", 2: "Junior", 3: "Mid", 4: "Senior", 5: "Lead", 6: "Manager", 7: "Director", 8: "VP", 9: "C-Suite",
};
