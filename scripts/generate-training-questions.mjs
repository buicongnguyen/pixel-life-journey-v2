import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUT_FILE = resolve("public/data/training-questions.json");
const LEVEL_COUNTS = {
  starter: 334,
  practice: 333,
  advanced: 333,
};

const levels = Object.keys(LEVEL_COUNTS);
const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const fruits = ["apples", "pears", "peaches", "plums", "mangos", "oranges", "berries", "lemons"];
const tools = ["hammer", "ladder", "broom", "wrench", "spoon", "pencil", "chair", "clock"];
const colors = ["red", "blue", "green", "yellow", "purple", "orange", "black", "white"];
const animals = ["cat", "dog", "horse", "rabbit", "tiger", "panda", "eagle", "shark"];
const names = ["Maya", "Leo", "Nina", "Omar", "Ari", "Lena", "Sofia", "Noah", "Iris", "Kai", "Mina", "Jin"];
const madeWords = ["Mips", "Nops", "Lums", "Zibs", "Ravs", "Tovs", "Peks", "Daws", "Fens", "Gols"];
const contexts = ["school project", "family dinner", "team meeting", "online chat", "sports practice", "study group", "work shift", "birthday party", "club meeting", "group call"];
const people = ["friend", "sibling", "classmate", "teammate", "coworker", "parent", "partner", "neighbor", "cousin", "teacher"];
const feelings = ["hurt", "nervous", "angry", "left out", "embarrassed", "jealous", "overwhelmed", "sad", "proud", "worried"];
const goals = ["saving for a house", "starting a career", "paying school costs", "building a side hustle", "buying a car", "supporting family", "changing jobs", "renting a home"];
const careers = ["designer", "developer", "teacher", "nurse", "manager", "chef", "mechanic", "analyst", "marketer", "engineer"];
const skills = ["communication", "coding", "writing", "sales", "data analysis", "public speaking", "planning", "design", "budgeting", "leadership"];

function pick(list, i) {
  return list[((i % list.length) + list.length) % list.length];
}

function uniqueAnswers(correct, wrongs) {
  const out = [String(correct)];
  for (const wrong of wrongs) {
    const value = String(wrong);
    if (!out.includes(value)) out.push(value);
    if (out.length === 3) break;
  }
  let n = 1;
  while (out.length < 3) {
    const value = `${correct} ${n}`;
    if (!out.includes(value)) out.push(value);
    n += 1;
  }
  return out;
}

function q(text, correct, wrongs, win) {
  return {
    q: text,
    answers: uniqueAnswers(correct, wrongs),
    correct: 0,
    win,
  };
}

function letter(n) {
  return String.fromCharCode(65 + ((n % 26) + 26) % 26);
}

function dayAfter(start, offset) {
  return days[(days.indexOf(start) + offset) % days.length];
}

function makeIqQuestion(level, i) {
  const t = i % 8;
  if (level === "starter") {
    if (t === 0) {
      const start = 2 + (i % 9);
      const seq = [start, start * 2, start * 4, start * 8];
      return q(`Which number comes next: ${seq.join(", ")}, ?`, start * 16, [start * 12, start * 10], "Doubling pattern solved. +2 IQ.");
    }
    if (t === 1) {
      const start = 1 + (i % 12);
      const step = 2 + (i % 6);
      const seq = [start, start + step, start + step * 2, start + step * 3];
      return q(`Which number comes next: ${seq.join(", ")}, ?`, start + step * 4, [start + step * 5, start + step * 3 + 1], "Addition pattern spotted. +2 IQ.");
    }
    if (t === 2) {
      const a = 3 + (i % 8);
      const b = 2 + (i % 6);
      const c = 2 + ((i * 3) % 5);
      return q(`What is ${a} + ${b} x ${c}?`, a + b * c, [(a + b) * c, a * b + c], "Order of operations stayed clear. +2 IQ.");
    }
    if (t === 3) {
      const start = pick(days, i);
      const offset = 3 + ((i * 5) % 18);
      return q(`If today is ${start}, what day is ${offset} days from now?`, dayAfter(start, offset), [dayAfter(start, offset + 1), dayAfter(start, offset + 2)], "Calendar reasoning improved. +2 IQ.");
    }
    if (t === 4) {
      const count = 4 + (i % 10);
      const take = 1 + (i % (count - 1));
      return q(`A basket has ${count} ${pick(fruits, i)}. You take ${take}. How many do you have?`, take, [count - take, count], "Wording trap handled. +2 IQ.");
    }
    if (t === 5) {
      const bad = pick(tools, i);
      const opts = [pick(colors, i), pick(colors, i + 2), bad, pick(colors, i + 4)];
      return q(`Which word does not belong: ${opts.join(", ")}?`, bad, [opts[0], opts[1]], "Category sorting sharpened. +2 IQ.");
    }
    if (t === 6) {
      const pairs = [
        ["hand", "glove", "foot", "shoe"],
        ["bird", "wing", "fish", "fin"],
        ["key", "lock", "pen", "paper"],
        ["seed", "plant", "egg", "bird"],
      ];
      const p = pick(pairs, i);
      return q(`${p[0]} is to ${p[1]} as ${p[2]} is to what?`, p[3], [pick(tools, i + 1), pick(animals, i + 2)], "Analogy solved. +2 IQ.");
    }
    const a = 2 + (i % 7);
    const b = 3 + ((i * 2) % 8);
    return q(`If you have ${a} groups of ${b}, how many items are there?`, a * b, [a + b, a * b + a], "Multiplication stayed steady. +2 IQ.");
  }

  if (level === "practice") {
    if (t === 0) {
      const start = 1 + (i % 7);
      const gap = 2 + (i % 4);
      const grow = 1 + (i % 3);
      const seq = [start];
      for (let k = 1; k < 5; k++) seq.push(seq[k - 1] + gap + grow * (k - 1));
      return q(`Which number comes next: ${seq.slice(0, 5).join(", ")}, ?`, seq[4] + gap + grow * 4, [seq[4] + gap + grow * 3, seq[4] + gap + grow * 5], "Growing gaps solved. +2 IQ.");
    }
    if (t === 1) {
      const a = 1 + (i % 4);
      const b = 2 + (i % 5);
      const seq = [a, b];
      while (seq.length < 6) seq.push(seq[seq.length - 1] + seq[seq.length - 2]);
      return q(`What comes next: ${seq.join(", ")}, ?`, seq[5] + seq[4], [seq[5] + 1, seq[5] + seq[3]], "Fibonacci-style pattern found. +2 IQ.");
    }
    if (t === 2) {
      const workers = 2 + (i % 8);
      const hours = 2 + ((i * 3) % 5);
      const scale = 2 + (i % 4);
      return q(`If ${workers} workers make ${workers} toys in ${hours} hours, how long do ${workers * scale} workers need for ${workers * scale} toys?`, `${hours} hours`, [`${hours * scale} hours`, `${hours + scale} hours`], "Rate scaling stayed clean. +2 IQ.");
    }
    if (t === 3) {
      const a = pick(madeWords, i);
      const b = pick(madeWords, i + 1);
      const c = pick(madeWords, i + 2);
      return q(`All ${a} are ${b}. All ${b} are ${c}. Are all ${a} definitely ${c}?`, "yes", ["no", "only some"], "Chain logic clicked. +2 IQ.");
    }
    if (t === 4) {
      const n = 2 + (i % 5);
      const first = `${n}${letter(25 - (i % 3))}`;
      const second = `${n * 2}${letter(24 - (i % 3))}`;
      const third = `${n * 4}${letter(23 - (i % 3))}`;
      const ans = `${n * 8}${letter(22 - (i % 3))}`;
      return q(`Which pair continues: ${first}, ${second}, ${third}, ?`, ans, [`${n * 8}${letter(21 - (i % 3))}`, `${n * 6}${letter(22 - (i % 3))}`], "Number and letter pattern solved. +2 IQ.");
    }
    if (t === 5) {
      const a = pick(names, i);
      const b = pick(names, i + 1);
      const c = pick(names, i + 2);
      return q(`${a} is older than ${b}. ${b} is older than ${c}. Who is youngest?`, c, [a, b], "Ordering logic stayed clean. +2 IQ.");
    }
    if (t === 6) {
      const side = 3 + (i % 12);
      return q(`A square has side length ${side}. What is its perimeter?`, side * 4, [side * side, side * 2], "Geometry basics are strong. +2 IQ.");
    }
    const value = 2 + (i % 5);
    return q(`A code shifts each letter forward by ${value}. What does CAT become?`, `${letter(2 + value)}${letter(value)}${letter(19 + value)}`, [`${letter(2 + value)}${letter(1 + value)}${letter(19 + value)}`, `${letter(2)}${letter(0 + value)}${letter(19 + value)}`], "Letter-code pattern cracked. +2 IQ.");
  }

  if (t === 0) {
    const colorsCount = 3 + (i % 5);
    return q(`A drawer has ${colorsCount} sock colors. How many socks guarantee a matching pair?`, colorsCount + 1, [colorsCount, colorsCount + 2], "Worst-case reasoning unlocked. +2 IQ.");
  }
  if (t === 1) {
    const drift = 3 + (i % 9);
    const hours = 2 + ((i * 2) % 8);
    return q(`A clock gains ${drift} minutes every hour. After ${hours} real hours, how many minutes fast is it?`, drift * hours, [drift + hours, drift * (hours - 1)], "Accumulated drift calculated. +2 IQ.");
  }
  if (t === 2) {
    const a = pick(madeWords, i);
    const b = pick(madeWords, i + 1);
    const c = pick(madeWords, i + 2);
    return q(`No ${a} are ${b}. Some ${c} are ${a}. What must be true?`, `some ${c} are not ${b}`, [`all ${c} are ${b}`, `no ${c} exist`], "Set logic overlap solved. +2 IQ.");
  }
  if (t === 3) {
    const start = 2 + (i % 5);
    const seq = [start ** 2, (start + 1) ** 2, (start + 2) ** 2, (start + 3) ** 2];
    return q(`What comes next: ${seq.join(", ")}, ?`, (start + 4) ** 2, [(start + 4) * 2, (start + 5) ** 2], "Square sequence held steady. +2 IQ.");
  }
  if (t === 4) {
    const a = 2 + (i % 7);
    const b = 3 + ((i * 3) % 8);
    return q(`If a rule says score = 2 x A + 3 x B, what is the score when A=${a} and B=${b}?`, 2 * a + 3 * b, [3 * a + 2 * b, 2 * (a + b)], "Formula substitution solved. +2 IQ.");
  }
  if (t === 5) {
    const boxes = 4 + (i % 9);
    const items = boxes * 2 - 1;
    return q(`${items} books are placed into ${boxes} boxes. Must one box contain at least 2 books?`, "yes", ["no", "only if labeled"], "Pigeonhole logic clicked. +2 IQ.");
  }
  if (t === 6) {
    const value = 4 + (i % 7);
    return q(`A number doubled plus 6 equals ${value * 2 + 6}. What is the number?`, value, [value + 3, value * 2], "Reverse equation solved. +2 IQ.");
  }
  const n = 3 + (i % 8);
  return q(`Which is larger: ${n} squared or ${n + 1} times ${n - 1}?`, `${n} squared`, [`${n + 1} times ${n - 1}`, "they are equal"], "Difference of squares spotted. +2 IQ.");
}

function makeEqQuestion(level, i) {
  const t = i % 8;
  const person = pick(people, i);
  const feeling = pick(feelings, i * 2);
  const context = pick(contexts, i * 3);
  if (level === "starter") {
    if (t === 0) return q(`A ${person} seems ${feeling} during a ${context}. What is the best first move?`, "ask gently and listen", ["tell them to stop feeling that", "make a joke about them"], "Empathy noticed the signal. +EQ.");
    if (t === 1) return q(`You feel ${feeling} before a ${context}. What helps most?`, "name the feeling and breathe", ["pretend it is not happening", "blame someone nearby"], "Self-awareness got stronger. +EQ.");
    if (t === 2) return q(`You hurt a ${person} by accident. What apology works best?`, "say what you did and repair it", ["say sorry you feel that way", "avoid them forever"], "Repair became clearer. +EQ.");
    if (t === 3) return q(`A ${person} wins something you wanted. What shows strong EQ?`, "congratulate and learn", ["call it luck", "stop talking to them"], "Jealousy turned into growth. +EQ.");
    if (t === 4) return q(`You are too tired to help with a ${context}. What is honest and kind?`, "I care, but I need rest first", ["say yes and resent it", "vanish without words"], "Kind boundaries protected trust. +EQ.");
    if (t === 5) return q(`A new person is alone during a ${context}. What is a gentle move?`, "invite them with no pressure", ["stare at them", "make them perform"], "Social awareness found an opening. +EQ.");
    if (t === 6) return q(`Someone thanks you after a ${context}. What strengthens the bond?`, "receive it warmly", ["reject the thanks", "make it awkward"], "Warm receiving improved connection. +EQ.");
    return q(`A ${person} shares a private worry. What should you do?`, "keep it private unless safety is at risk", ["share it for gossip", "laugh it off"], "Trust stayed protected. +EQ.");
  }

  if (level === "practice") {
    if (t === 0) return q(`A ${person} cancels a ${context} twice. What is emotionally smart?`, "check in before judging", ["accuse them immediately", "ghost them"], "You checked the story before judging. +EQ.");
    if (t === 1) return q(`Someone says, 'You never listen' during a ${context}. What should you try first?`, "repeat their main point", ["explain why they are wrong", "change the subject"], "Reflection showed you heard them. +EQ.");
    if (t === 2) return q(`A ${person} pressures you into a risky choice. What is strongest?`, "set a boundary and leave", ["prove you are brave", "say yes to fit in"], "Boundaries protected your future. +EQ.");
    if (t === 3) return q(`Two relatives fight during a ${context}. What helps the conversation?`, "separate facts and needs", ["pick a side instantly", "raise old grudges"], "You separated facts from heat. +EQ.");
    if (t === 4) return q(`You said yes too quickly and regret it. What is best?`, "renegotiate early and clearly", ["miss the promise silently", "blame the calendar"], "Repair came before failure. +EQ.");
    if (t === 5) return q(`A joke hurts a ${person}, even if you meant well. What matters now?`, "repair the impact", ["argue about intent only", "repeat the joke"], "Impact got care. +EQ.");
    if (t === 6) return q(`One quiet person is affected most by a group choice. What should you do?`, "invite their view", ["decide without them", "speak over them"], "Inclusive decisions are stronger. +EQ.");
    return q(`An online comment insults you after a ${context}. What protects your mental health?`, "pause before responding", ["fight all night", "post private info"], "Impulse control saved energy. +EQ.");
  }

  if (t === 0) return q(`You are leading a ${context} while stressed. What builds trust?`, "name the pressure and clarify next steps", ["hide everything", "snap at people"], "Honest leadership steadied the group. +EQ.");
  if (t === 1) return q(`A ${person} asks for money you cannot afford. What is healthiest?`, "empathize and set a clear no", ["lend rent money", "shame them"], "Kind boundaries are still kind. +EQ.");
  if (t === 2) return q(`You need to describe hurt without attacking. Which opener is best?`, "I felt hurt when...", ["You always ruin things", "Everyone agrees with me"], "An I-statement kept the door open. +EQ.");
  if (t === 3) return q(`Someone says 'I'm fine' but looks tense after a ${context}. What is a good response?`, "ask gently once, then respect space", ["demand a confession", "ignore all signals"], "Care balanced with respect. +EQ.");
  if (t === 4) return q(`Your feedback hurt a ${person} more than expected. What comes first?`, "listen and repair impact", ["defend your intent only", "say they are too sensitive"], "Impact got attention. +EQ.");
  if (t === 5) return q(`Two people want opposite outcomes. What improves the chance of agreement?`, "ask the need behind each position", ["vote before listening", "repeat your demand"], "Needs revealed room for compromise. +EQ.");
  if (t === 6) return q(`A ${person} keeps venting but never changes. What boundary is kind?`, "I can listen for a short time, then need rest", ["solve their life for them", "punish them forever"], "Compassion gained a boundary. +EQ.");
  return q(`A group excludes one person by habit during a ${context}. What is leadership?`, "create a real chance to join", ["join the exclusion", "pretend it is invisible"], "Inclusive leadership rose. +EQ.");
}

function makeStrategyQuestion(level, i) {
  const t = i % 8;
  const goal = pick(goals, i);
  const career = pick(careers, i * 2);
  const skill = pick(skills, i * 3);
  if (level === "starter") {
    if (t === 0) return q(`Before ${goal}, what should you check first?`, "needs, budget, and trade-offs", ["what friends bought", "only the color"], "Purchase planning improved. +Strategy.");
    if (t === 1) return q(`What does income mean for a ${career}?`, "money coming in", ["money already spent", "money owed"], "Money vocabulary sharpened. +Strategy.");
    if (t === 2) return q(`What does expense mean while ${goal}?`, "money going out", ["free income", "a secret bonus"], "Expense tracking clicked. +Strategy.");
    if (t === 3) return q(`Why learn ${skill}?`, "raise future options", ["avoid all work", "guarantee luck"], "Skill investment made sense. +Strategy.");
    if (t === 4) return q(`What should usually come before risky investing?`, "emergency savings", ["a luxury upgrade", "a rumor"], "Risk order improved. +Strategy.");
    if (t === 5) return q(`Which debt is usually best to attack first?`, "highest interest debt", ["prettiest logo", "smallest font"], "Interest-cost strategy improved. +Strategy.");
    if (t === 6) return q(`What is networking in a healthy career?`, "building helpful relationships", ["begging strangers", "collecting cards only"], "Career relationships got clearer. +Strategy.");
    return q(`Before an interview for a ${career} role, what should you prepare?`, "role research and examples", ["only your outfit", "nothing"], "Preparation raised your odds. +Strategy.");
  }

  if (level === "practice") {
    if (t === 0) return q(`You get a raise while ${goal}. What protects your future?`, "increase saving before lifestyle grows", ["spend it all instantly", "hide it"], "Lifestyle creep avoided. +Strategy.");
    if (t === 1) return q(`A job offer for a ${career} is lower than expected. What helps negotiation?`, "market data and value proof", ["anger only", "accept silently always"], "Negotiation got grounded. +Strategy.");
    if (t === 2) return q(`Why can one single stock be risky?`, "one company can fail", ["markets close forever", "shares weigh too much"], "Concentration risk spotted. +Strategy.");
    if (t === 3) return q(`A strong resume for ${skill} usually shows what?`, "measured results", ["only duties", "favorite snacks"], "Career evidence improved. +Strategy.");
    if (t === 4) return q(`Before changing into a ${career} path, what should you test?`, "skills, market, and fit", ["only the logo", "random luck"], "Career pivot got safer. +Strategy.");
    if (t === 5) return q(`What is insurance mainly for while ${goal}?`, "protecting against big losses", ["guaranteed profit", "avoiding budgets"], "Risk protection clicked. +Strategy.");
    if (t === 6) return q(`What is the value of an informational interview?`, "learn real work from insiders", ["ask for money first", "skip research"], "Career research network grew. +Strategy.");
    return q(`A side hustle earns money. What grows it best long-term?`, "reinvest in what works", ["spend all instantly", "never track results"], "Growth loop identified. +Strategy.");
  }

  if (t === 0) return q(`A high salary requires 80-hour weeks. What should you calculate?`, "hourly value and health cost", ["title sparkle only", "desk size"], "Total career cost became visible. +Strategy.");
  if (t === 1) return q(`What is the danger of investing with borrowed money?`, "losses can be amplified", ["profits become illegal", "risk becomes zero"], "Leverage risk spotted. +Strategy.");
  if (t === 2) return q(`A rental house has income and repairs. What matters most?`, "net cash flow after costs", ["paint color only", "rent before expenses"], "Rental math improved. +Strategy.");
  if (t === 3) return q(`What is a BATNA in negotiation?`, "best alternative if no deal", ["a bank code", "a tax penalty"], "Negotiation fallback identified. +Strategy.");
  if (t === 4) return q(`A plan works only in perfect conditions. What should you add?`, "margin of safety", ["more optimism only", "a louder slogan"], "Resilient planning unlocked. +Strategy.");
  if (t === 5) return q(`When comparing two ${career} job offers, what else matters besides salary?`, "benefits, growth, risk, and fit", ["desk color only", "logo size"], "Offer comparison leveled up. +Strategy.");
  if (t === 6) return q(`A business is profitable on paper but cannot pay bills. What failed?`, "cash-flow planning", ["font choice", "office decoration"], "Cash flow became visible. +Strategy.");
  return q(`A market trend is popular. What should you check before investing?`, "evidence, valuation, and risk", ["how loud people are", "only the logo"], "Hype filter upgraded. +Strategy.");
}

function makeBank(factory) {
  const bank = {};
  for (const level of levels) {
    bank[level] = Array.from({ length: LEVEL_COUNTS[level] }, (_, i) => {
      const row = factory(level, i);
      const caseId = `${level.slice(0, 1).toUpperCase()}${String(i + 1).padStart(3, "0")}`;
      return {
        ...row,
        q: `${row.q} (Case ${caseId})`,
      };
    });
  }
  return bank;
}

const categories = {
  iq: makeBank(makeIqQuestion),
  eq: makeBank(makeEqQuestion),
  strategy: makeBank(makeStrategyQuestion),
};

const counts = Object.fromEntries(Object.entries(categories).map(([category, bank]) => [
  category,
  Object.values(bank).reduce((sum, questions) => sum + questions.length, 0),
]));

const db = {
  version: 1,
  generatedAt: "2026-06-22",
  counts,
  categories,
};

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(db));
console.log(`Wrote ${OUT_FILE}`);
console.log(counts);
