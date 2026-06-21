import type { Gender, PersonKind, RoomTheme, SceneKind } from "./types";

// ---------------------------------------------------------------------------
// All drawing. The canvas is supersampled (see ui.ts) and rendered smoothly, so
// characters are drawn with curves + gradients to look like real people, with
// age-correct proportions (a newborn is a big-headed little baby; proportions
// mature gradually into an adult and then an elder). Rooms/props use simple
// rects (px) which the supersampling anti-aliases.
// ---------------------------------------------------------------------------

function px(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, Math.max(0.5, w), Math.max(0.5, h));
}

function shade(hex: string, amt = 24): string {
  const c = hex.replace("#", "");
  const r = Math.max(0, parseInt(c.slice(0, 2), 16) - amt);
  const g = Math.max(0, parseInt(c.slice(2, 4), 16) - amt);
  const b = Math.max(0, parseInt(c.slice(4, 6), 16) - amt);
  return `rgb(${r},${g},${b})`;
}
function tint(hex: string, amt = 24): string {
  const c = hex.replace("#", "");
  const r = Math.min(255, parseInt(c.slice(0, 2), 16) + amt);
  const g = Math.min(255, parseInt(c.slice(2, 4), 16) + amt);
  const b = Math.min(255, parseInt(c.slice(4, 6), 16) + amt);
  return `rgb(${r},${g},${b})`;
}

function ellipse(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function hgrad(ctx: CanvasRenderingContext2D, x: number, w: number, color: string, light = 18, dark = 20): CanvasGradient {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, tint(color, light));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, dark));
  return g;
}

// Strong pixel-game line work: darker outlines make tiny characters read clearly.
const OUTLINE = "rgba(32,22,28,0.92)";
const OUTLINE_W = 1.75;

/** A rounded, tapered body segment from (topW @ topY) to (botW @ botY). */
function taper(ctx: CanvasRenderingContext2D, cx: number, topY: number, topW: number, botY: number, botW: number, fill: string | CanvasGradient): void {
  const rt = Math.min(topW * 0.3, 6);
  const rb = Math.min(botW * 0.32, 7);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(cx - topW / 2 + rt, topY);
  ctx.lineTo(cx + topW / 2 - rt, topY);
  ctx.quadraticCurveTo(cx + topW / 2, topY, cx + topW / 2, topY + rt);
  ctx.lineTo(cx + botW / 2, botY - rb);
  ctx.quadraticCurveTo(cx + botW / 2, botY, cx + botW / 2 - rb, botY);
  ctx.lineTo(cx - botW / 2 + rb, botY);
  ctx.quadraticCurveTo(cx - botW / 2, botY, cx - botW / 2, botY - rb);
  ctx.lineTo(cx - topW / 2, topY + rt);
  ctx.quadraticCurveTo(cx - topW / 2, topY, cx - topW / 2 + rt, topY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
}

/** A rounded limb (capsule): outline, fill, then cell shadow + highlight. */
function limb(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = w + OUTLINE_W * 2;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.strokeStyle = shade(color, 16);
  ctx.lineWidth = w * 0.34;
  ctx.beginPath();
  ctx.moveTo(x1 + w * 0.22, y1);
  ctx.lineTo(x2 + w * 0.22, y2);
  ctx.stroke();
  ctx.strokeStyle = tint(color, 18);
  ctx.lineWidth = w * 0.28;
  ctx.beginPath();
  ctx.moveTo(x1 - w * 0.24, y1);
  ctx.lineTo(x2 - w * 0.24, y2);
  ctx.stroke();
}

// ===========================================================================
// Look + age profile
// ===========================================================================

export interface AvatarLook {
  heightPx: number;
  headRatio: number;
  chub: number;
  baby: boolean;
  child: boolean;
  elder: boolean;
  skin: string;
  hair: string;
  hairStyle: "short" | "long" | "bun";
  shirt: string;
  pants: string;
  shoes: string;
  gender: Gender;
  skirt: boolean;
}

export type AvatarFacing = "front" | "left" | "right";

export interface AvatarMotion {
  moving: boolean;
  facing: AvatarFacing;
  verticalBias: number;
}

const IDLE_MOTION: AvatarMotion = { moving: false, facing: "front", verticalBias: 0 };

function motionFrom(motion: AvatarMotion | boolean): AvatarMotion {
  return typeof motion === "boolean" ? { ...IDLE_MOTION, moving: motion } : motion;
}

interface BodyProfile {
  heightPx: number;
  headRatio: number;
  chub: number;
  baby: boolean;
  child: boolean;
  elder: boolean;
}

// "Life is a Game"-style realistic proportions: ~5.5-head adults with normal
// bodies and small clean faces; kids are stockier with bigger heads; the
// newborn is a special tiny baby. Proportions mature gradually with age.
const STAGE_PROFILES: BodyProfile[] = [
  { heightPx: 78, headRatio: 0.46, chub: 1.0, baby: true, child: true, elder: false }, // newborn
  { heightPx: 96, headRatio: 0.37, chub: 0.5, baby: false, child: true, elder: false }, // toddler
  { heightPx: 112, headRatio: 0.34, chub: 0.42, baby: false, child: true, elder: false }, // early
  { heightPx: 128, headRatio: 0.31, chub: 0.32, baby: false, child: true, elder: false }, // elementary
  { heightPx: 142, headRatio: 0.285, chub: 0.24, baby: false, child: false, elder: false }, // middle
  { heightPx: 154, headRatio: 0.265, chub: 0.18, baby: false, child: false, elder: false }, // high
  { heightPx: 164, headRatio: 0.252, chub: 0.15, baby: false, child: false, elder: false }, // university
  { heightPx: 170, headRatio: 0.246, chub: 0.15, baby: false, child: false, elder: false }, // career
  { heightPx: 170, headRatio: 0.246, chub: 0.18, baby: false, child: false, elder: false }, // marriage
  { heightPx: 166, headRatio: 0.25, chub: 0.24, baby: false, child: false, elder: false }, // midlife
  { heightPx: 158, headRatio: 0.262, chub: 0.3, baby: false, child: false, elder: true }, // senior
  { heightPx: 150, headRatio: 0.27, chub: 0.32, baby: false, child: false, elder: true }, // retirement
];

const SKIN = "#ffd0a8";
const SHIRTS_M = ["#4aa3ff", "#45c46a", "#ffb934", "#6d7dff", "#1fc7b6", "#ff7f50", "#2d95ff", "#42c98f"];
const SHIRTS_F = ["#ff6eb5", "#ff8cd3", "#ad7cff", "#ff6f91", "#79a6ff", "#ff70c7", "#e56bd6", "#ff7aa8"];

export function avatarLook(stageIndex: number, gender: Gender = "male"): AvatarLook {
  const i = Math.max(0, Math.min(STAGE_PROFILES.length - 1, stageIndex));
  const p = STAGE_PROFILES[i];
  const female = gender === "female";
  const hair = p.elder ? "#e4e4ec" : i >= 9 ? "#c2c2cc" : p.child ? "#824d22" : female ? "#5e3a1e" : "#3a2a1e";
  const shirts = female ? SHIRTS_F : SHIRTS_M;
  return {
    ...p,
    skin: SKIN,
    hair,
    hairStyle: female ? (p.elder ? "bun" : "long") : "short",
    shirt: shirts[i % shirts.length],
    pants: female ? "#8d5bd4" : i >= 7 ? "#243d68" : "#2d4f9c",
    shoes: female ? "#f04d8e" : "#3a2a35",
    gender,
    skirt: female && i >= 3 && !p.baby,
  };
}

const PERSON_PROFILE: Record<"child" | "teen" | "adult" | "elder", number> = {
  child: 2,
  teen: 5,
  adult: 7,
  elder: 11,
};

export function personLook(kind: PersonKind, playerGender: Gender): AvatarLook {
  const opp: Gender = playerGender === "female" ? "male" : "female";
  type Spec = { g: Gender; age: keyof typeof PERSON_PROFILE; hair: string; shirt: string };
  const map: Record<PersonKind, Spec> = {
    mother: { g: "female", age: "adult", hair: "#6a4327", shirt: "#ff9ec0" },
    father: { g: "male", age: "adult", hair: "#3a2a1e", shirt: "#5f93cf" },
    grandma: { g: "female", age: "elder", hair: "#e4e4ec", shirt: "#c9a6d6" },
    grandpa: { g: "male", age: "elder", hair: "#cdced6", shirt: "#8fa0ab" },
    sibling: { g: "male", age: "child", hair: "#824d22", shirt: "#69c06a" },
    playmate: { g: "female", age: "child", hair: "#8a5a2e", shirt: "#ffd23f" },
    studyFriend: { g: "male", age: "teen", hair: "#3a2a1e", shirt: "#5aa3df" },
    bestFriend: { g: "female", age: "teen", hair: "#6a4327", shirt: "#8fdf6b" },
    crush: { g: opp, age: "teen", hair: opp === "female" ? "#6a4327" : "#3a2a1e", shirt: opp === "female" ? "#ff8fd0" : "#7f9cff" },
    roommate: { g: "male", age: "teen", hair: "#2a2a1e", shirt: "#dd865a" },
    coworker: { g: "female", age: "adult", hair: "#3a2a1e", shirt: "#54b3a6" },
    boss: { g: "male", age: "adult", hair: "#2a2a2a", shirt: "#4a5562" },
    gymBuddy: { g: "male", age: "adult", hair: "#2a2018", shirt: "#ff6b6b" },
    spouse: { g: opp, age: "adult", hair: opp === "female" ? "#6a4327" : "#3a2a1e", shirt: opp === "female" ? "#ff9ec0" : "#5f93cf" },
    child: { g: "male", age: "child", hair: "#824d22", shirt: "#ffd23f" },
    grandkid: { g: "female", age: "child", hair: "#8a5a2e", shirt: "#8fdf6b" },
    oldFriend: { g: "male", age: "elder", hair: "#cdced6", shirt: "#9c8cff" },
  };
  const s = map[kind];
  const female = s.g === "female";
  const p = STAGE_PROFILES[PERSON_PROFILE[s.age]];
  return {
    ...p,
    skin: SKIN,
    hair: s.hair,
    hairStyle: female ? (s.age === "elder" ? "bun" : "long") : "short",
    shirt: s.shirt,
    pants: female ? "#9a6ac4" : "#33405a",
    shoes: female ? "#c25b8e" : "#33293f",
    gender: s.g,
    skirt: female && !p.child && !p.baby,
  };
}

// ===========================================================================
// Character rendering
// ===========================================================================

export function drawCharacter(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motionInput: AvatarMotion | boolean): void {
  const motion = motionFrom(motionInput);
  if (look.baby) drawBaby(ctx, cx, footY, look, walkPhase, motion);
  else drawStanding(ctx, cx, footY, look, walkPhase, motion);
}

function groundShadow(_ctx: CanvasRenderingContext2D, _cx: number, _footY: number, _rx: number): void {
  // Ground shadow removed per request (it read as a black ellipse in front of people).
}

function drawStanding(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  const H = look.heightPx;
  if (motion.facing !== "front") {
    drawSideStanding(ctx, cx, footY, look, walkPhase, motion);
    return;
  }
  const female = look.gender === "female";
  const swing = motion.moving ? Math.sin(walkPhase) : 0;
  const bob = motion.moving ? Math.abs(Math.sin(walkPhase)) * H * 0.012 : Math.sin(walkPhase * 0.5) * H * 0.006;
  const stoop = look.elder ? H * 0.045 : 0;
  const baseY = footY - bob;

  // realistic build: oval head, real neck, normal torso, long legs (~half height)
  const headH = H * look.headRatio;
  const headW = headH * 0.84 * (1 + look.chub * 0.06);
  const neckH = headH * (look.child ? 0.24 : 0.32);
  const torsoH = (H - headH - neckH) * (look.child ? 0.46 : 0.42);
  const legH = Math.max(H * 0.22, H - headH - neckH - torsoH);
  const shoulderW = headW * (female ? 1.45 : 1.66) + look.chub * headW * 0.18;
  const waistW = shoulderW * (female ? 0.66 : 0.72);
  const hipW = shoulderW * (female ? 1.08 : 0.9);
  const legW = H * (0.064 + look.chub * 0.022);
  const armW = H * (0.048 + look.chub * 0.014);

  const hipY = baseY - legH;
  const torsoTopY = hipY - torsoH + stoop;
  const neckTopY = torsoTopY - neckH + stoop * 0.5;
  const headCx = cx + stoop * 0.5;
  const headCy = neckTopY - headH / 2;

  const skin = look.skin;
  const skinD = shade(skin, 20);

  groundShadow(ctx, cx, footY, shoulderW * 0.62);

  // long hair is the very BACK layer — drawn before the whole body so it sits
  // behind the torso, neck and head (a girl's hair falls behind her, never over
  // the face nor in front of the chest)
  drawBackHair(ctx, headCx, headCy, headW, headH, look);

  // --- legs ----------------------------------------------------------------
  const stride = swing * H * 0.065;
  const lift = Math.abs(swing) * H * 0.026;
  const drawLegPair = (): void => {
    const shoeH = H * 0.03;
    const ly = baseY - shoeH;
    // left
    limb(ctx, cx - hipW * 0.2, hipY, cx - hipW * 0.23 - stride, ly - (swing > 0 ? lift : 0), legW, look.pants);
    ellipse(ctx, cx - hipW * 0.23 - stride - legW * 0.15, ly - (swing > 0 ? lift : 0) + shoeH * 0.45, legW * 1.25, shoeH * 1.2, hgrad(ctx, cx - hipW * 0.4, legW * 2.0, look.shoes));
    // right
    limb(ctx, cx + hipW * 0.2, hipY, cx + hipW * 0.23 + stride, ly - (swing < 0 ? lift : 0), legW, look.pants);
    ellipse(ctx, cx + hipW * 0.23 + stride - legW * 0.15, ly - (swing < 0 ? lift : 0) + shoeH * 0.45, legW * 1.25, shoeH * 1.2, hgrad(ctx, cx + hipW * 0.05, legW * 2.0, look.shoes));
  };
  drawLegPair();

  // --- arms (behind torso so hands rest at the sides) ----------------------
  const aSwing = -swing * H * 0.05;
  const shoulderY = torsoTopY + headH * 0.14;
  const handY = torsoTopY + torsoH * 0.96;
  limb(ctx, cx - shoulderW * 0.43, shoulderY, cx - shoulderW * 0.39 + aSwing, handY, armW, look.shirt);
  limb(ctx, cx + shoulderW * 0.43, shoulderY, cx + shoulderW * 0.39 - aSwing, handY, armW, look.shirt);
  ellipse(ctx, cx - shoulderW * 0.39 + aSwing, handY, armW * 0.62, armW * 0.58, skin); // hand
  ellipse(ctx, cx + shoulderW * 0.39 - aSwing, handY, armW * 0.62, armW * 0.58, skin);

  // --- skirt or lower body -------------------------------------------------
  if (look.skirt) {
    taper(ctx, cx, torsoTopY + torsoH * 0.64, waistW * 0.95, hipY + H * 0.07, hipW * 1.22, hgrad(ctx, cx - hipW * 0.62, hipW * 1.24, look.pants));
  } else {
    taper(ctx, cx, torsoTopY + torsoH * 0.66, waistW, hipY + H * 0.01, hipW, hgrad(ctx, cx - hipW / 2, hipW, look.pants));
  }

  // --- torso ---------------------------------------------------------------
  taper(ctx, cx, torsoTopY, shoulderW, torsoTopY + torsoH * 0.66, waistW, hgrad(ctx, cx - shoulderW / 2, shoulderW, look.shirt, 22, 22));
  drawOutfitDetails(ctx, cx, torsoTopY, torsoH, shoulderW, waistW, hipW, headH, look);
  // collar
  ellipse(ctx, cx, torsoTopY + headH * 0.08, headW * 0.3, headH * 0.12, skinD);

  // --- neck ----------------------------------------------------------------
  ctx.fillStyle = skinD;
  ctx.fillRect(cx - neckH * 0.42, torsoTopY - neckH + 1, neckH * 0.84, neckH + headH * 0.12);
  ellipse(ctx, cx, neckTopY + neckH * 0.3, neckH * 0.5, neckH * 0.4, skin);

  // --- head (anime oval face tapering to a soft chin) ----------------------
  const hg = ctx.createRadialGradient(headCx - headW * 0.18, headCy - headH * 0.22, headW * 0.15, headCx, headCy, headW * 0.72);
  hg.addColorStop(0, tint(skin, 8));
  hg.addColorStop(0.7, skin);
  hg.addColorStop(1, shade(skin, 6));
  ctx.fillStyle = hg;
  ctx.beginPath();
  ctx.moveTo(headCx - headW / 2, headCy - headH * 0.08);
  ctx.quadraticCurveTo(headCx - headW / 2, headCy - headH / 2, headCx, headCy - headH / 2);
  ctx.quadraticCurveTo(headCx + headW / 2, headCy - headH / 2, headCx + headW / 2, headCy - headH * 0.08);
  ctx.quadraticCurveTo(headCx + headW * 0.44, headCy + headH * 0.4, headCx, headCy + headH / 2);
  ctx.quadraticCurveTo(headCx - headW * 0.44, headCy + headH * 0.4, headCx - headW / 2, headCy - headH * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  // ears
  ellipse(ctx, headCx - headW / 2, headCy + headH * 0.04, headW * 0.1, headH * 0.12, skin);
  ellipse(ctx, headCx + headW / 2, headCy + headH * 0.04, headW * 0.1, headH * 0.12, skinD);

  drawHair(ctx, headCx, headCy, headW, headH, look);
  drawFace(ctx, headCx, headCy, headW, headH, look);

  if (look.elder) {
    // cane
    limb(ctx, cx + shoulderW * 0.39 - aSwing, handY, cx + shoulderW * 0.64, footY, legW * 0.5, "#7a5a36");
  }
}

function drawOutfitDetails(
  ctx: CanvasRenderingContext2D,
  cx: number,
  torsoTopY: number,
  torsoH: number,
  shoulderW: number,
  waistW: number,
  hipW: number,
  headH: number,
  look: AvatarLook
): void {
  const chestY = torsoTopY + torsoH * 0.2;
  const hemY = torsoTopY + torsoH * 0.66;
  const detail = "rgba(34,22,28,0.35)";
  const shirtL = tint(look.shirt, 30);
  const shirtD = shade(look.shirt, 28);

  // Pixel-game collar and placket details make the tiny torso read as clothing.
  if (!look.child) {
    ctx.fillStyle = look.elder ? "#f4f0e6" : "#fff7e0";
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW * 0.22, torsoTopY + headH * 0.05);
    ctx.lineTo(cx - shoulderW * 0.02, chestY + headH * 0.02);
    ctx.lineTo(cx - shoulderW * 0.02, torsoTopY + headH * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx + shoulderW * 0.22, torsoTopY + headH * 0.05);
    ctx.lineTo(cx + shoulderW * 0.02, chestY + headH * 0.02);
    ctx.lineTo(cx + shoulderW * 0.02, torsoTopY + headH * 0.22);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = detail;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.strokeStyle = shirtD;
    ctx.lineWidth = Math.max(1.2, shoulderW * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx, torsoTopY + headH * 0.18);
    ctx.lineTo(cx, hemY - 2);
    ctx.stroke();
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, cx + shoulderW * 0.06, chestY + i * torsoH * 0.13, Math.max(1.2, shoulderW * 0.025), Math.max(1.2, shoulderW * 0.025), "#ffe9a8");
    }
  } else {
    ctx.strokeStyle = shirtL;
    ctx.lineWidth = Math.max(1.4, shoulderW * 0.045);
    ctx.beginPath();
    ctx.moveTo(cx - shoulderW * 0.22, chestY);
    ctx.lineTo(cx + shoulderW * 0.22, chestY + torsoH * 0.04);
    ctx.stroke();
    ellipse(ctx, cx, chestY + torsoH * 0.18, shoulderW * 0.09, shoulderW * 0.09, "#ffe867");
  }

  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = Math.max(1, shoulderW * 0.025);
  ctx.beginPath();
  ctx.moveTo(cx - shoulderW * 0.34, torsoTopY + torsoH * 0.12);
  ctx.lineTo(cx - waistW * 0.32, hemY - 2);
  ctx.stroke();

  ctx.strokeStyle = look.skirt ? shade(look.pants, 30) : shade(look.pants, 18);
  ctx.lineWidth = Math.max(1.5, hipW * 0.04);
  ctx.beginPath();
  ctx.moveTo(cx - hipW * 0.42, hemY + 1);
  ctx.lineTo(cx + hipW * 0.42, hemY + 1);
  ctx.stroke();
}

function drawSideStanding(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  const H = look.heightPx;
  const dir = motion.facing === "left" ? -1 : 1;
  const lean = motion.moving ? dir * H * 0.018 : 0;

  // A three-quarter side walk keeps the richer face/body details visible at the
  // game's small scale while still showing clear left/right direction.
  ctx.save();
  ctx.translate(cx, 0);
  ctx.transform(0.82, 0, dir * -0.07, 1, 0, 0);
  ctx.translate(-cx + dir * H * 0.025 + lean, 0);
  drawStanding(ctx, cx, footY, look, walkPhase, { ...motion, facing: "front" });
  ctx.restore();

  const step = motion.moving ? Math.sin(walkPhase) : 0;
  const footSweep = dir * step * H * 0.055;
  const shoeY = footY - H * 0.012;
  ellipse(ctx, cx + footSweep, shoeY, H * 0.055, H * 0.018, hgrad(ctx, cx - H * 0.05, H * 0.1, look.shoes));
}

function drawSideBackHair(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook, dir: number): void {
  if (look.hairStyle !== "long") return;
  const top = hcy - hh / 2;
  ctx.fillStyle = shade(look.hair, 24);
  ctx.beginPath();
  ctx.moveTo(hcx - dir * hw * 0.28, top + hh * 0.08);
  ctx.quadraticCurveTo(hcx - dir * hw * 0.7, hcy + hh * 0.26, hcx - dir * hw * 0.58, hcy + hh * 0.82);
  ctx.quadraticCurveTo(hcx - dir * hw * 0.5, hcy + hh * 1.1, hcx - dir * hw * 0.2, hcy + hh * 1.16);
  ctx.quadraticCurveTo(hcx + dir * hw * 0.16, hcy + hh * 1.04, hcx + dir * hw * 0.28, hcy + hh * 0.5);
  ctx.quadraticCurveTo(hcx + dir * hw * 0.34, top + hh * 0.22, hcx - dir * hw * 0.28, top + hh * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
}

function drawSideHead(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook, dir: number): void {
  const skin = look.skin;
  const skinD = shade(skin, 20);
  const top = hcy - hh / 2;
  const hair = look.hair;
  const hairL = tint(hair, 28);
  const headRx = hw * 0.54;
  const headRy = hh * 0.5;
  const hg = ctx.createRadialGradient(hcx - dir * hw * 0.12, hcy - hh * 0.2, hw * 0.12, hcx, hcy, hw * 0.68);
  hg.addColorStop(0, tint(skin, 10));
  hg.addColorStop(0.7, skin);
  hg.addColorStop(1, shade(skin, 8));

  ellipse(ctx, hcx, hcy, headRx, headRy, hg);
  ctx.beginPath();
  ctx.ellipse(hcx, hcy, headRx, headRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();

  ellipse(ctx, hcx - dir * hw * 0.45, hcy + hh * 0.04, hw * 0.09, hh * 0.12, skinD);

  // Compact cap and bangs: enough to show direction without hiding the body.
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(hcx - dir * headRx * 0.95, hcy - headRy * 0.12);
  ctx.quadraticCurveTo(hcx - dir * headRx * 0.78, top - hh * 0.08, hcx + dir * headRx * 0.06, top - hh * 0.08);
  ctx.quadraticCurveTo(hcx + dir * headRx * 0.9, top - hh * 0.03, hcx + dir * headRx * 0.82, hcy - headRy * 0.02);
  ctx.quadraticCurveTo(hcx + dir * headRx * 0.2, hcy - headRy * 0.35, hcx - dir * headRx * 0.95, hcy - headRy * 0.12);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();

  const locks = look.elder ? 2 : look.hairStyle === "long" ? 3 : 2;
  ctx.fillStyle = hair;
  for (let i = 0; i < locks; i++) {
    const x = hcx - dir * hw * (0.18 - i * 0.18);
    const len = top + hh * (look.hairStyle === "long" ? 0.3 : 0.22) + (i % 2) * hh * 0.035;
    ctx.beginPath();
    ctx.moveTo(x - dir * hw * 0.12, top + hh * 0.04);
    ctx.quadraticCurveTo(x + dir * hw * 0.02, len, x + dir * hw * 0.1, len);
    ctx.quadraticCurveTo(x + dir * hw * 0.14, len - hh * 0.1, x + dir * hw * 0.14, top + hh * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_W;
    ctx.stroke();
  }

  if (!look.elder) {
    ctx.save();
    ctx.globalAlpha = 0.45;
    ellipse(ctx, hcx - dir * hw * 0.03, top + hh * 0.01, hw * 0.22, hh * 0.055, hairL);
    ctx.restore();
  }
  if (look.hairStyle === "bun") {
    ellipse(ctx, hcx - dir * hw * 0.38, top - hh * 0.06, hw * 0.22, hh * 0.18, hair);
    ctx.beginPath();
    ctx.ellipse(hcx - dir * hw * 0.38, top - hh * 0.06, hw * 0.22, hh * 0.18, 0, 0, Math.PI * 2);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_W;
    ctx.stroke();
  }

  const eyeR = hw * (look.child ? 0.12 : 0.095);
  const eyeX = hcx + dir * hw * 0.21;
  const eyeY = hcy + hh * (look.child ? 0.05 : 0.02);
  ellipse(ctx, eyeX, eyeY, eyeR * 0.95, eyeR * 1.2, "#ffffff");
  ellipse(ctx, eyeX + dir * eyeR * 0.08, eyeY + eyeR * 0.16, eyeR * 0.62, eyeR * 0.85, "#4a3526");
  ellipse(ctx, eyeX + dir * eyeR * 0.12, eyeY + eyeR * 0.2, eyeR * 0.34, eyeR * 0.48, "#1b1622");
  ellipse(ctx, eyeX - dir * eyeR * 0.24, eyeY - eyeR * 0.28, eyeR * 0.22, eyeR * 0.22, "#ffffff");
  ctx.strokeStyle = shade(hair, 10);
  ctx.lineWidth = hw * 0.04;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(eyeX - dir * eyeR * 1.0, eyeY - eyeR * 1.55);
  ctx.quadraticCurveTo(eyeX + dir * eyeR * 0.15, eyeY - eyeR * 1.95, eyeX + dir * eyeR * 1.15, eyeY - eyeR * 1.48);
  ctx.stroke();

  ctx.strokeStyle = skinD;
  ctx.lineWidth = hw * 0.034;
  ctx.beginPath();
  ctx.moveTo(hcx + dir * hw * 0.42, eyeY + eyeR * 0.55);
  ctx.lineTo(hcx + dir * hw * 0.52, eyeY + hh * 0.15);
  ctx.stroke();

  ctx.strokeStyle = look.gender === "female" ? "#d9707f" : "#bb6a62";
  ctx.lineWidth = hw * (look.child ? 0.06 : 0.048);
  ctx.beginPath();
  ctx.moveTo(hcx + dir * hw * 0.18, eyeY + hh * 0.24);
  ctx.quadraticCurveTo(hcx + dir * hw * 0.31, eyeY + hh * 0.3, hcx + dir * hw * 0.45, eyeY + hh * 0.23);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,140,160,0.28)";
  ctx.beginPath();
  ctx.ellipse(hcx + dir * hw * 0.28, eyeY + hh * 0.13, hw * 0.11, hh * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  if (look.elder) {
    ctx.strokeStyle = "rgba(70,70,80,0.9)";
    ctx.lineWidth = hw * 0.04;
    ctx.beginPath();
    ctx.ellipse(eyeX, eyeY, eyeR * 1.45, eyeR * 1.45, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(eyeX - dir * eyeR * 1.4, eyeY);
    ctx.lineTo(hcx - dir * hw * 0.34, eyeY + hh * 0.02);
    ctx.stroke();
  }
}

/** The long-hair layer that flows behind the head — drawn BEFORE the head. */
function drawBackHair(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook): void {
  if (look.hairStyle !== "long") return;
  const top = hcy - hh / 2;
  ctx.fillStyle = shade(look.hair, 22);
  ctx.beginPath();
  ctx.moveTo(hcx - hw * 0.48, top + hh * 0.16);
  // left: poof out past the cheek (only the narrow neck is in front here, so this
  // is the clearly-visible part) then fall as a long curtain down behind the body
  ctx.quadraticCurveTo(hcx - hw * 0.86, hcy + hh * 0.5, hcx - hw * 0.82, hcy + hh * 1.05);
  ctx.quadraticCurveTo(hcx - hw * 0.78, hcy + hh * 1.55, hcx - hw * 0.52, hcy + hh * 1.7);
  // inner hem scoops up under the chin (this stretch sits behind the torso)
  ctx.quadraticCurveTo(hcx, hcy + hh * 1.4, hcx + hw * 0.52, hcy + hh * 1.7);
  // right curtain back up to the crown
  ctx.quadraticCurveTo(hcx + hw * 0.78, hcy + hh * 1.55, hcx + hw * 0.82, hcy + hh * 1.05);
  ctx.quadraticCurveTo(hcx + hw * 0.86, hcy + hh * 0.5, hcx + hw * 0.48, top + hh * 0.16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
}

function drawHair(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook): void {
  const hair = look.hair;
  const hairD = shade(hair, 22);
  const hairL = tint(hair, 30);
  const top = hcy - hh / 2;
  const longHair = look.hairStyle === "long";
  const stroke = (): void => { ctx.strokeStyle = OUTLINE; ctx.lineWidth = OUTLINE_W; ctx.stroke(); };
  // NOTE: the long-hair back layer is drawn earlier, BEHIND the head (drawBackHair),
  // so it never paints over the face.

  // main hair cap with volume above the crown
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.moveTo(hcx - hw * 0.56, top + hh * 0.46);
  ctx.quadraticCurveTo(hcx - hw * 0.64, top - hh * 0.24, hcx, top - hh * 0.26);
  ctx.quadraticCurveTo(hcx + hw * 0.64, top - hh * 0.24, hcx + hw * 0.56, top + hh * 0.46);
  ctx.quadraticCurveTo(hcx + hw * 0.3, top + hh * 0.12, hcx, top + hh * 0.18);
  ctx.quadraticCurveTo(hcx - hw * 0.3, top + hh * 0.12, hcx - hw * 0.56, top + hh * 0.46);
  ctx.closePath();
  ctx.fill();
  stroke();

  // fringe over the forehead — short & neat for men, longer bangs for women
  const locks = look.elder ? 2 : longHair ? 4 : 3;
  const fringeLen = longHair ? 0.36 : 0.21; // men get a higher hairline (more forehead)
  ctx.fillStyle = hair;
  for (let i = 0; i < locks; i++) {
    const t0 = (i + 0.5) / locks;
    const lx = hcx - hw * 0.4 + hw * 0.8 * t0;
    const len = top + hh * (fringeLen + (i % 2 ? 0.06 : 0.0));
    ctx.beginPath();
    ctx.moveTo(lx - hw * 0.2, top + hh * 0.08);
    ctx.quadraticCurveTo(lx - hw * 0.04, len + hh * 0.03, lx + hw * 0.04, len);
    ctx.quadraticCurveTo(lx + hw * 0.14, len, lx + hw * 0.22, top + hh * 0.08);
    ctx.closePath();
    ctx.fill();
    stroke();
  }

  // Keep short hair above the ears only. Long cheek-side blocks read as a beard
  // on the small male sprites, so boys/men stay clean-shaven.
  if (!longHair) {
    ctx.fillStyle = hair;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hcx + s * hw * 0.43, top + hh * 0.28);
      ctx.quadraticCurveTo(hcx + s * hw * 0.57, top + hh * 0.35, hcx + s * hw * 0.5, top + hh * 0.5);
      ctx.lineTo(hcx + s * hw * 0.4, top + hh * 0.49);
      ctx.quadraticCurveTo(hcx + s * hw * 0.45, top + hh * 0.36, hcx + s * hw * 0.36, top + hh * 0.3);
      ctx.closePath();
      ctx.fill();
      stroke();
    }
  }

  // glossy highlight band across the crown
  if (!look.elder) {
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = hairL;
    ctx.beginPath();
    ctx.ellipse(hcx - hw * 0.05, top + hh * 0.02, hw * 0.33, hh * 0.08, -0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (look.hairStyle === "bun") {
    ellipse(ctx, hcx, top - hh * 0.16, hw * 0.27, hh * 0.23, hair);
    ctx.beginPath();
    ctx.ellipse(hcx, top - hh * 0.16, hw * 0.27, hh * 0.23, 0, 0, Math.PI * 2);
    stroke();
  }
}

function drawFace(ctx: CanvasRenderingContext2D, hcx: number, hcy: number, hw: number, hh: number, look: AvatarLook): void {
  const big = look.child;
  const iris = look.elder ? "#6b6b74" : "#3c7ec8";
  const lip = look.gender === "female" ? "#d9707f" : "#8c5c52";
  const skinD = shade(look.skin, 26);
  const eyeR = hw * (big ? 0.155 : 0.12);
  const eyeY = hcy + hh * (big ? 0.055 : 0.025);
  const eyeDX = hw * (big ? 0.25 : 0.225);
  const hairD = shade(look.hair, 10);

  for (const s of [-1, 1]) {
    const ex = hcx + s * eyeDX;
    ellipse(ctx, ex, eyeY, eyeR * 1.05, eyeR * 1.3, "#ffffff");
    ctx.beginPath();
    ctx.ellipse(ex, eyeY, eyeR * 1.05, eyeR * 1.3, 0, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(44,28,30,0.65)";
    ctx.lineWidth = Math.max(1, eyeR * 0.23);
    ctx.stroke();
    ellipse(ctx, ex, eyeY + eyeR * 0.18, eyeR * 0.72, eyeR * 0.92, iris);
    ellipse(ctx, ex + s * eyeR * 0.16, eyeY + eyeR * 0.18, eyeR * 0.35, eyeR * 0.68, shade(iris, 38));
    ellipse(ctx, ex, eyeY + eyeR * 0.24, eyeR * 0.4, eyeR * 0.5, "#1b1622");
    ellipse(ctx, ex - eyeR * 0.32, eyeY - eyeR * 0.33, eyeR * 0.28, eyeR * 0.28, "#ffffff");
    ellipse(ctx, ex + eyeR * 0.2, eyeY + eyeR * 0.42, eyeR * 0.13, eyeR * 0.13, "#d9f2ff");
    // brow
    ctx.strokeStyle = hairD;
    ctx.lineWidth = hw * 0.045;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(ex - eyeR * 1.2, eyeY - eyeR * 1.55);
    ctx.quadraticCurveTo(ex, eyeY - eyeR * (look.elder ? 1.5 : 2), ex + eyeR * 1.2, eyeY - eyeR * 1.6);
    ctx.stroke();
    if (look.gender === "female" && !look.elder) {
      ctx.strokeStyle = "rgba(44,28,30,0.7)";
      ctx.lineWidth = Math.max(1, eyeR * 0.16);
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        ctx.moveTo(ex + s * eyeR * (0.85 + i * 0.18), eyeY - eyeR * (0.55 - i * 0.16));
        ctx.lineTo(ex + s * eyeR * (1.25 + i * 0.16), eyeY - eyeR * (0.88 - i * 0.12));
        ctx.stroke();
      }
    }
  }
  // nose
  ctx.strokeStyle = skinD;
  ctx.lineWidth = hw * 0.04;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(hcx + hw * 0.01, eyeY + eyeR * 0.55);
  ctx.lineTo(hcx + hw * 0.035, eyeY + hh * 0.16);
  ctx.lineTo(hcx - hw * 0.015, eyeY + hh * 0.19);
  ctx.stroke();
  // mouth (gentle smile)
  ctx.strokeStyle = lip;
  ctx.lineWidth = hw * (big ? 0.075 : 0.058);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(hcx, eyeY + hh * (big ? 0.22 : 0.25), hw * 0.2, 0.18 * Math.PI, 0.82 * Math.PI);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.65)";
  ctx.lineWidth = Math.max(1, hw * 0.018);
  ctx.beginPath();
  ctx.moveTo(hcx - hw * 0.08, eyeY + hh * (big ? 0.255 : 0.285));
  ctx.lineTo(hcx + hw * 0.08, eyeY + hh * (big ? 0.255 : 0.285));
  ctx.stroke();
  // blush
  if (look.gender === "female" || look.child) {
    ctx.fillStyle = `rgba(255,115,145,${look.gender === "female" ? 0.34 : 0.16})`;
    ctx.beginPath();
    ctx.ellipse(hcx - hw * 0.3, eyeY + hh * 0.12, hw * 0.11, hh * 0.07, 0, 0, Math.PI * 2);
    ctx.ellipse(hcx + hw * 0.3, eyeY + hh * 0.12, hw * 0.11, hh * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // elder details
  if (look.elder) {
    ctx.strokeStyle = "rgba(120,95,80,0.4)";
    ctx.lineWidth = hw * 0.03;
    ctx.beginPath();
    ctx.moveTo(hcx - hw * 0.32, hcy - hh * 0.18);
    ctx.lineTo(hcx + hw * 0.32, hcy - hh * 0.2);
    ctx.stroke();
    // glasses
    ctx.strokeStyle = "rgba(70,70,80,0.9)";
    ctx.lineWidth = hw * 0.04;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(hcx + s * eyeDX, eyeY, eyeR * 1.5, eyeR * 1.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(hcx - eyeDX + eyeR * 1.4, eyeY);
    ctx.lineTo(hcx + eyeDX - eyeR * 1.4, eyeY);
    ctx.stroke();
  }
}

function drawBaby(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  drawCrawlingBaby(ctx, cx, footY, look, walkPhase, motion);
  return;

  // a chubby seated newborn: huge round head, tiny round body, stubby limbs
  const H = look.heightPx;
  const sway = Math.sin(walkPhase * 0.5) * H * 0.01;
  const headR = H * 0.34;
  const bodyR = H * 0.26;
  const bodyCy = footY - bodyR * 0.9;
  const headCy = bodyCy - bodyR * 0.7 - headR * 0.85 + sway;
  const headCx = cx + sway;
  const skin = look.skin;
  const onesie = look.gender === "female" ? "#ffc1dd" : "#bfe0ff";

  groundShadow(ctx, cx, footY, bodyR * 1.5);

  // legs (stubby, splayed) + booties
  for (const s of [-1, 1]) {
    limb(ctx, cx + s * bodyR * 0.35, bodyCy + bodyR * 0.4, cx + s * bodyR * 0.95, footY - H * 0.02, H * 0.075, onesie);
    ellipse(ctx, cx + s * bodyR * 0.95, footY - H * 0.02, H * 0.05, H * 0.035, skin);
  }
  // arms (stubby)
  for (const s of [-1, 1]) {
    limb(ctx, cx + s * bodyR * 0.55, bodyCy - bodyR * 0.1, cx + s * bodyR * 1.15, bodyCy + bodyR * 0.5, H * 0.07, onesie);
    ellipse(ctx, cx + s * bodyR * 1.15, bodyCy + bodyR * 0.5, H * 0.045, H * 0.045, skin);
  }
  // body (onesie)
  const bg = ctx.createRadialGradient(cx - bodyR * 0.3, bodyCy - bodyR * 0.3, bodyR * 0.2, cx, bodyCy, bodyR * 1.1);
  bg.addColorStop(0, tint(onesie, 18));
  bg.addColorStop(1, shade(onesie, 16));
  ellipse(ctx, cx, bodyCy, bodyR, bodyR * 1.05, bg);
  ctx.beginPath();
  ctx.ellipse(cx, bodyCy, bodyR, bodyR * 1.05, 0, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();

  // head
  const hg = ctx.createRadialGradient(headCx - headR * 0.3, headCy - headR * 0.35, headR * 0.2, headCx, headCy, headR * 1.05);
  hg.addColorStop(0, tint(skin, 16));
  hg.addColorStop(0.65, skin);
  hg.addColorStop(1, shade(skin, 14));
  ellipse(ctx, headCx, headCy, headR, headR, hg);
  ctx.beginPath();
  ctx.ellipse(headCx, headCy, headR, headR, 0, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  // ears
  ellipse(ctx, headCx - headR, headCy + headR * 0.1, headR * 0.16, headR * 0.2, skin);
  ellipse(ctx, headCx + headR, headCy + headR * 0.1, headR * 0.16, headR * 0.2, shade(skin, 12));
  // a little curl of hair
  ellipse(ctx, headCx, headCy - headR * 0.82, headR * 0.18, headR * 0.16, look.hair);
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.ellipse(headCx, headCy - headR * 0.7, headR * 0.5, headR * 0.22, 0, Math.PI, 0);
  ctx.fill();
  if (look.gender === "female") ellipse(ctx, headCx + headR * 0.55, headCy - headR * 0.55, headR * 0.16, headR * 0.12, "#ff7ab0"); // bow

  // big baby eyes + tiny features
  const eyeR = headR * 0.2;
  const eyeY = headCy + headR * 0.1;
  for (const s of [-1, 1]) {
    const ex = headCx + s * headR * 0.36;
    ellipse(ctx, ex, eyeY, eyeR, eyeR * 1.15, "#ffffff");
    ellipse(ctx, ex, eyeY + eyeR * 0.18, eyeR * 0.66, eyeR * 0.8, "#3a2a22");
    ellipse(ctx, ex - eyeR * 0.28, eyeY - eyeR * 0.28, eyeR * 0.3, eyeR * 0.3, "#ffffff");
  }
  ctx.fillStyle = "rgba(255,140,160,0.4)";
  ctx.beginPath();
  ctx.ellipse(headCx - headR * 0.5, eyeY + headR * 0.28, headR * 0.16, headR * 0.11, 0, 0, Math.PI * 2);
  ctx.ellipse(headCx + headR * 0.5, eyeY + headR * 0.28, headR * 0.16, headR * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#cc7a72";
  ctx.lineWidth = headR * 0.07;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(headCx, eyeY + headR * 0.5, headR * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function drawCrawlingBaby(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  const H = look.heightPx;
  const dir = motion.facing === "left" ? -1 : motion.facing === "right" ? 1 : motion.verticalBias < -0.15 ? -1 : 1;
  const step = Math.sin(walkPhase);
  const counter = Math.cos(walkPhase);
  const bob = Math.abs(counter) * H * 0.018;
  const skin = look.skin;
  const skinD = shade(skin, 16);
  const onesie = look.gender === "female" ? "#ffc1dd" : "#bfe0ff";
  const bodyCx = cx - dir * H * 0.08;
  const bodyCy = footY - H * 0.22 - bob;
  const bodyRx = H * 0.34;
  const bodyRy = H * 0.19;
  const headR = H * 0.25;
  const headCx = cx + dir * H * 0.25;
  const headCy = footY - H * 0.45 - bob * 0.45;
  const limbW = H * 0.065;

  groundShadow(ctx, cx, footY, bodyRx * 1.15);

  // Alternating far/near crawl limbs. Hands and knees touch the floor in turn.
  const handReach = H * 0.16;
  const kneeReach = H * 0.13;
  const farArmX = bodyCx - dir * bodyRx * 0.15 - dir * step * handReach * 0.55;
  const nearArmX = bodyCx + dir * bodyRx * 0.28 + dir * step * handReach;
  const farKneeX = bodyCx - dir * bodyRx * 0.42 + dir * step * kneeReach;
  const nearKneeX = bodyCx + dir * bodyRx * 0.08 - dir * step * kneeReach * 0.8;
  const handY = footY - H * 0.055;
  const kneeY = footY - H * 0.04;
  limb(ctx, bodyCx - dir * bodyRx * 0.35, bodyCy - bodyRy * 0.05, farArmX, handY, limbW * 0.92, shade(onesie, 10));
  ellipse(ctx, farArmX, handY + H * 0.006, H * 0.04, H * 0.026, skinD);
  limb(ctx, bodyCx + dir * bodyRx * 0.2, bodyCy + bodyRy * 0.45, farKneeX, kneeY, limbW, shade(onesie, 12));
  ellipse(ctx, farKneeX, kneeY + H * 0.006, H * 0.046, H * 0.028, skinD);

  limb(ctx, bodyCx + dir * bodyRx * 0.18, bodyCy - bodyRy * 0.12, nearArmX, handY - Math.max(0, counter) * H * 0.018, limbW, onesie);
  ellipse(ctx, nearArmX, handY + H * 0.006 - Math.max(0, counter) * H * 0.018, H * 0.043, H * 0.028, skin);
  limb(ctx, bodyCx - dir * bodyRx * 0.12, bodyCy + bodyRy * 0.46, nearKneeX, kneeY - Math.max(0, -counter) * H * 0.018, limbW, onesie);
  ellipse(ctx, nearKneeX, kneeY + H * 0.006 - Math.max(0, -counter) * H * 0.018, H * 0.047, H * 0.029, skin);

  const bg = ctx.createRadialGradient(bodyCx - bodyRx * 0.35, bodyCy - bodyRy * 0.55, bodyRx * 0.16, bodyCx, bodyCy, bodyRx * 1.1);
  bg.addColorStop(0, tint(onesie, 18));
  bg.addColorStop(1, shade(onesie, 16));
  ellipse(ctx, bodyCx, bodyCy, bodyRx, bodyRy, bg);
  ctx.beginPath();
  ctx.ellipse(bodyCx, bodyCy, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();

  const hg = ctx.createRadialGradient(headCx - dir * headR * 0.25, headCy - headR * 0.3, headR * 0.18, headCx, headCy, headR * 1.05);
  hg.addColorStop(0, tint(skin, 16));
  hg.addColorStop(0.65, skin);
  hg.addColorStop(1, shade(skin, 14));
  ellipse(ctx, headCx, headCy, headR, headR * 0.96, hg);
  ctx.beginPath();
  ctx.ellipse(headCx, headCy, headR, headR * 0.96, 0, 0, Math.PI * 2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = OUTLINE_W;
  ctx.stroke();
  ellipse(ctx, headCx - dir * headR * 0.92, headCy + headR * 0.08, headR * 0.14, headR * 0.18, skinD);

  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.ellipse(headCx - dir * headR * 0.04, headCy - headR * 0.72, headR * 0.48, headR * 0.2, 0, Math.PI, 0);
  ctx.fill();
  ellipse(ctx, headCx + dir * headR * 0.05, headCy - headR * 0.86, headR * 0.16, headR * 0.13, look.hair);
  if (look.gender === "female") ellipse(ctx, headCx + dir * headR * 0.54, headCy - headR * 0.5, headR * 0.14, headR * 0.1, "#ff7ab0");

  const eyeR = headR * 0.18;
  const eyeX = headCx + dir * headR * 0.28;
  const eyeY = headCy + headR * 0.06;
  ellipse(ctx, eyeX, eyeY, eyeR, eyeR * 1.12, "#ffffff");
  ellipse(ctx, eyeX + dir * eyeR * 0.08, eyeY + eyeR * 0.18, eyeR * 0.62, eyeR * 0.78, "#3a2a22");
  ellipse(ctx, eyeX - dir * eyeR * 0.24, eyeY - eyeR * 0.28, eyeR * 0.26, eyeR * 0.26, "#ffffff");
  ctx.fillStyle = "rgba(255,140,160,0.38)";
  ctx.beginPath();
  ctx.ellipse(headCx + dir * headR * 0.48, eyeY + headR * 0.22, headR * 0.14, headR * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#cc7a72";
  ctx.lineWidth = headR * 0.055;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(headCx + dir * headR * 0.18, eyeY + headR * 0.42);
  ctx.quadraticCurveTo(headCx + dir * headR * 0.31, eyeY + headR * 0.52, headCx + dir * headR * 0.45, eyeY + headR * 0.42);
  ctx.stroke();
}

export function drawAvatar(ctx: CanvasRenderingContext2D, cx: number, footY: number, look: AvatarLook, walkPhase: number, motion: AvatarMotion): void {
  drawCharacter(ctx, cx, footY, look, walkPhase, motion);
}

const PERSON_LABEL: Record<PersonKind, string> = {
  mother: "Mum", father: "Dad", grandma: "Grandma", grandpa: "Grandpa",
  sibling: "Sibling", playmate: "Playmate", studyFriend: "Study pal", bestFriend: "Best friend",
  crush: "Crush", roommate: "Roommate", coworker: "Coworker", boss: "Boss",
  gymBuddy: "Gym buddy", spouse: "Spouse", child: "Your child", grandkid: "Grandkid", oldFriend: "Old friend",
};

export function drawPerson(ctx: CanvasRenderingContext2D, cx: number, footY: number, kind: PersonKind, playerGender: Gender, label: string, focused: boolean, used: boolean, t: number): void {
  const look = personLook(kind, playerGender);
  ctx.save();
  if (used) ctx.globalAlpha = 0.5;
  drawCharacter(ctx, cx, footY - (focused ? 1 : 0), look, t * 1.4, focused);
  ctx.restore();
  const name = label || PERSON_LABEL[kind];
  if (focused) {
    ctx.fillStyle = `rgba(255,235,170,${0.2 + 0.12 * Math.sin(t * 6)})`;
    ctx.beginPath();
    ctx.ellipse(cx, footY + 1, look.heightPx * 0.32, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const labelY = Math.max(14, footY - look.heightPx - 10);
  drawNamePlate(ctx, cx, labelY, name, focused ? "#ffe9a8" : "rgba(255,255,255,0.9)");
  if (used) {
    ctx.fillStyle = "#3ddc84";
    ctx.font = "bold 13px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("♥", cx, Math.max(22, labelY + 8));
  }
}

function drawNamePlate(ctx: CanvasRenderingContext2D, cx: number, y: number, text: string, color: string): void {
  ctx.font = "10px 'Trebuchet MS', system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(text).width + 10;
  ctx.fillStyle = "rgba(18,12,30,0.82)";
  if (ctx.roundRect) {
    ctx.beginPath();
    ctx.roundRect(cx - w / 2, y - 7, w, 14, 4);
    ctx.fill();
  } else ctx.fillRect(cx - w / 2, y - 7, w, 14);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, y);
}

// ===========================================================================
// Scenery (rooms) + door — simple rects, anti-aliased by the supersampling
// ===========================================================================

export interface RoomDecor {
  scene: SceneKind;
  atHome: boolean;
  homeQuality: number;
}

export function drawRoom(ctx: CanvasRenderingContext2D, theme: RoomTheme, W: number, H: number, floorY: number, doorActive: boolean, t: number, decor: RoomDecor): void {
  const wallG = ctx.createLinearGradient(0, 0, 0, floorY);
  wallG.addColorStop(0, tint(theme.wall, 14));
  wallG.addColorStop(1, theme.wall);
  ctx.fillStyle = wallG;
  ctx.fillRect(0, 0, W, floorY);
  drawPixelTrim(ctx, 0, 18, W, 8, tint(theme.wall, 30), shade(theme.wall, 10));
  drawPixelTrim(ctx, 0, floorY - 22, W, 8, tint(theme.wall, 18), shade(theme.wall, 14));
  px(ctx, 0, floorY - 12, W, 12, theme.wallShade);
  const floorG = ctx.createLinearGradient(0, floorY, 0, H);
  floorG.addColorStop(0, tint(theme.floor, 8));
  floorG.addColorStop(1, shade(theme.floor, 10));
  ctx.fillStyle = floorG;
  ctx.fillRect(0, floorY, W, H - floorY);
  ctx.fillStyle = theme.floorShade;
  for (let x = 0; x < W; x += 40) ctx.fillRect(x, floorY, 2, H - floorY);
  px(ctx, 0, floorY, W, 3, theme.floorShade);

  drawScene(ctx, decor.scene, theme, W, floorY, t);
  if (decor.atHome && decor.homeQuality > 0) drawHomeQuality(ctx, theme, W, floorY, decor.homeQuality);
  drawDoor(ctx, theme, W, floorY, doorActive, t);
}

function drawPixelTrim(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, a: string, b: string): void {
  const cell = 4;
  for (let yy = 0; yy < h; yy += cell) {
    for (let xx = 0; xx < w; xx += cell) {
      px(ctx, x + xx, y + yy, cell, cell, ((xx / cell + yy / cell) % 2 === 0) ? a : b);
    }
  }
}

function window2(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sky: string): void {
  px(ctx, x - 3, y - 3, w + 6, h + 6, "#6a5a3a");
  px(ctx, x, y, w, h, sky);
  px(ctx, x + w / 2 - 1, y, 2, h, "#6a5a3a");
  px(ctx, x, y + h / 2 - 1, w, 2, "#6a5a3a");
}

function drawScene(ctx: CanvasRenderingContext2D, scene: SceneKind, theme: RoomTheme, W: number, floorY: number, t: number): void {
  switch (scene) {
    case "nursery": {
      window2(ctx, 70, 36, 78, 56, "#bfe6ff");
      const mx = W * 0.62;
      px(ctx, mx - 26, 12, 52, 3, "#caa6e0");
      const sway = Math.sin(t * 1.5) * 2;
      for (const [dx, col] of [[-22, "#ff9ec0"], [0, "#9ad0ff"], [22, "#b6e3a0"]] as const) {
        px(ctx, mx + dx + sway, 15, 3, 9, "#caa6e0");
        ellipse(ctx, mx + dx + sway + 1.5, 28, 6, 5, col);
      }
      for (let i = 0; i < 3; i++) px(ctx, W - 150 + i * 18, floorY - 16, 15, 15, ["#ff9ec0", "#9ad0ff", "#b6e3a0"][i]);
      break;
    }
    case "playroom": {
      window2(ctx, 60, 34, 74, 52, "#bfe6ff");
      px(ctx, W - 168, 40, 120, 60, shade(theme.wall, 18));
      for (let r = 0; r < 2; r++) for (let c = 0; c < 4; c++) px(ctx, W - 160 + c * 28, 48 + r * 28, 18, 18, ["#ffd23f", "#ff8fd0", "#7fd0ff", "#9be36b"][(r + c) % 4]);
      ellipse(ctx, 150, floorY - 8, 9, 9, "#ff6b6b");
      break;
    }
    case "school": {
      px(ctx, 64, 26, 220, 86, "#26402f");
      px(ctx, 60, 22, 228, 6, "#6a5a3a");
      ctx.fillStyle = "rgba(235,235,220,0.9)";
      ctx.font = "13px 'Trebuchet MS', monospace";
      ctx.textAlign = "left";
      ctx.fillText("A B C  1 2 3", 78, 56);
      ctx.fillText("2 + 2 = 4", 78, 80);
      px(ctx, 250, 104, 26, 4, "#caa37a");
      px(ctx, W - 150, 30, 26, 26, "#e8e8ee");
      px(ctx, W - 138, 34, 2, 11, "#333");
      px(ctx, W - 138, 42, 8, 2, "#333");
      for (let i = 0; i < 4; i++) px(ctx, W - 110 + i * 26, 70, 22, 50, i % 2 ? "#5a7a9e" : "#4a6a8e");
      for (let i = 0; i < 3; i++) px(ctx, 80 + i * 80, floorY - 18, 46, 16, "#9a7a4a");
      break;
    }
    case "campus": {
      window2(ctx, 60, 30, 120, 70, "#a9d4ff");
      px(ctx, W - 180, 28, 110, 26, "#7a3f9e");
      ctx.fillStyle = "#ffe9a8";
      ctx.font = "12px 'Trebuchet MS', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("UNIVERSITY", W - 125, 45);
      px(ctx, W - 150, 64, 96, 56, shade(theme.wall, 16));
      for (let i = 0; i < 8; i++) px(ctx, W - 146 + i * 11, 70 + (i % 2) * 26, 8, 24, ["#ff6b6b", "#6bd0ff", "#9be36b", "#ffd23f"][i % 4]);
      break;
    }
    case "office": {
      window2(ctx, 56, 26, 150, 78, "#8fb8e6");
      for (let i = 0; i < 6; i++) px(ctx, 64 + i * 24, 90 - (i % 3) * 18, 18, 16 + (i % 3) * 18, "#41506a");
      px(ctx, W - 150, 30, 24, 24, "#e8e8ee");
      px(ctx, W - 120, 66, 22, 54, "#9fd6e8");
      px(ctx, W - 96, 78, 6, 42, "#cfe6ee");
      px(ctx, 96, floorY - 26, 60, 18, "#6a7886");
      px(ctx, 110, floorY - 44, 30, 20, "#222");
      px(ctx, 113, floorY - 41, 24, 14, "#5fd0ff");
      break;
    }
    case "home": {
      window2(ctx, 58, 30, 90, 60, "#bfe0ff");
      px(ctx, W - 200, floorY - 34, 120, 26, "#9a5a6a");
      px(ctx, W - 200, floorY - 46, 120, 14, "#b06a7a");
      px(ctx, W - 204, floorY - 44, 12, 36, "#b06a7a");
      px(ctx, W - 92, floorY - 44, 12, 36, "#b06a7a");
      px(ctx, 92, 60, 70, 44, "#1c1c24");
      px(ctx, 96, 64, 62, 36, "#3a4a6a");
      px(ctx, 120, 104, 14, 8, "#1c1c24");
      break;
    }
    case "sunset": {
      px(ctx, 54, 24, 150, 92, "#6a4a5e");
      const grd = ctx.createLinearGradient(0, 24, 0, 116);
      grd.addColorStop(0, "#ffd6a8");
      grd.addColorStop(0.6, "#ff9e7a");
      grd.addColorStop(1, "#c46a8e");
      ctx.fillStyle = grd;
      ctx.fillRect(58, 28, 142, 84);
      ellipse(ctx, 130, 78, 12, 12, "#ffe9b0");
      px(ctx, 58, 96, 142, 16, "#9e6a8a");
      break;
    }
  }
}

function drawHomeQuality(ctx: CanvasRenderingContext2D, theme: RoomTheme, W: number, floorY: number, q: number): void {
  if (q === 1) {
    for (const [x, y] of [[210, 40], [W - 230, 60], [320, 90]] as const) {
      const c = "rgba(0,0,0,0.30)";
      px(ctx, x, y, 2, 10, c); px(ctx, x + 2, y + 8, 2, 8, c); px(ctx, x - 2, y + 14, 2, 9, c); px(ctx, x + 3, y + 20, 2, 8, c);
    }
    return;
  }
  const paintings = Math.min(q, 4);
  for (let i = 0; i < paintings; i++) {
    const fx = 220 + i * 48;
    px(ctx, fx, 30, 34, 28, "#5a4632");
    px(ctx, fx + 4, 34, 26, 20, theme.accent);
    px(ctx, fx + 4, 45, 26, 9, shade(theme.accent, 26));
  }
  if (q >= 3) drawPlant(ctx, 24, floorY);
  if (q >= 4) {
    px(ctx, 0, 0, W, 5, "#ffd76b");
    drawPlant(ctx, W - 40, floorY);
  }
  if (q >= 5) {
    // luxury villa: a second gold band and a little hanging chandelier
    px(ctx, 0, 6, W, 2, "#ffe9a8");
    const cx = W * 0.5;
    px(ctx, cx - 1, 8, 2, 12, "#caa44a");
    ellipse(ctx, cx, 22, 12, 6, "#ffe27a");
    ellipse(ctx, cx, 22, 7, 4, "#fff4c2");
  }
}

function drawPlant(ctx: CanvasRenderingContext2D, x: number, floorY: number): void {
  px(ctx, x, floorY - 10, 16, 10, "#9e6b3f");
  ellipse(ctx, x + 8, floorY - 24, 9, 12, "#3f9e5a");
  ellipse(ctx, x + 8, floorY - 30, 5, 6, "#4fb56b");
}

function drawDoor(ctx: CanvasRenderingContext2D, theme: RoomTheme, W: number, floorY: number, doorActive: boolean, t: number): void {
  const dw = 58;
  const dh = 124;
  const dx = W - dw - 10;
  const dy = floorY - dh;
  px(ctx, dx - 5, dy - 5, dw + 10, dh + 5, theme.wallShade);
  px(ctx, dx, dy, dw, dh, doorActive ? theme.accent : "#2c2438");
  if (doorActive) {
    const a = 0.35 + 0.25 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(dx, dy, dw, dh);
    px(ctx, dx + dw / 2 - 3, dy + dh / 2 - 14, 6, 28, "#27202e");
    drawArrow(ctx, dx + dw / 2 + 11, dy + dh / 2, "#27202e");
  } else {
    ellipse(ctx, dx + dw - 11, dy + dh / 2, 3.5, 4, theme.accent);
  }
}

function drawArrow(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
  px(ctx, x - 10, y - 3, 10, 5, color);
  px(ctx, x - 3, y - 8, 4, 4, color);
  px(ctx, x - 3, y + 4, 4, 4, color);
  px(ctx, x + 1, y - 4, 4, 4, color);
  px(ctx, x + 1, y, 4, 4, color);
}

// ===========================================================================
// Option stations (non-person choices) — higher-res, rounded, shaded
// ===========================================================================

const CAT_TINT: Record<string, string> = {
  health: "#ff5d6c", food: "#ffa14d", fun: "#ff8fd0", smarts: "#5db8ff",
  wealth: "#3ddc84", social: "#ffd23f", rest: "#9c8cff", special: "#ffffff",
};

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

export function drawStation(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string, label: string, category: string, focused: boolean, used: boolean, t: number): void {
  const tintC = CAT_TINT[category] ?? "#ffffff";
  const bob = focused ? Math.sin(t * 6) * 3 : 0;
  const plate = focused ? 46 : 42;
  const top = y - plate - 18 + bob;

  // soft shadow
  ctx.fillStyle = "rgba(0,0,0,0.22)";
  ctx.beginPath();
  ctx.ellipse(x, y - 4, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  if (focused) {
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.ellipse(x, y - 6, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  if (used) ctx.globalAlpha = 0.45;
  // rounded plate: light tint of the category colour so the type reads at a glance
  const g = ctx.createLinearGradient(0, top, 0, top + plate);
  if (focused) {
    g.addColorStop(0, tint(tintC, 34));
    g.addColorStop(1, shade(tintC, 14));
  } else {
    g.addColorStop(0, "#3b3458");
    g.addColorStop(1, "#241e3a");
  }
  ctx.fillStyle = g;
  rrect(ctx, x - plate / 2, top, plate, plate, 11);
  ctx.fill();
  // category-coloured border (always) — colour-codes the kind of choice
  ctx.strokeStyle = focused ? "#ffffff" : tintC;
  ctx.lineWidth = focused ? 3 : 2.5;
  rrect(ctx, x - plate / 2, top, plate, plate, 11);
  ctx.stroke();

  ctx.font = `${focused ? 31 : 28}px system-ui, 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(icon, x, top + plate / 2 + 1);
  if (used) {
    ctx.fillStyle = "#3ddc84";
    ctx.font = "17px system-ui, sans-serif";
    ctx.fillText("✓", x + plate / 2 - 4, top + 5);
  }
  ctx.restore();

  // always-on label (above the plate, clear of characters) so every choice reads
  ctx.font = `${focused ? "bold " : ""}10px 'Trebuchet MS', system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(label).width + 12;
  const ly = top - 9;
  ctx.save();
  if (used) ctx.globalAlpha = 0.6;
  ctx.fillStyle = focused ? "rgba(42,22,64,0.95)" : "rgba(18,12,30,0.8)";
  rrect(ctx, x - w / 2, ly - 8, w, 15, 5);
  ctx.fill();
  if (focused) {
    ctx.strokeStyle = tintC;
    ctx.lineWidth = 1.5;
    rrect(ctx, x - w / 2, ly - 8, w, 15, 5);
    ctx.stroke();
  }
  ctx.fillStyle = focused ? "#ffffff" : "rgba(244,239,255,0.92)";
  ctx.fillText(label, x, ly);
  ctx.restore();
}
