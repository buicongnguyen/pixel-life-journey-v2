import type { StatKey } from "./types";
import { STAT_KEYS, STAT_META } from "./stats";

// ---------------------------------------------------------------------------
// Builds the DOM around the canvas: the top HUD (five meters + age), the bottom
// focus panel, on-screen touch controls, and an overlay layer used for the
// title screen, the marriage partner picker and the ending. The engine reads
// and writes these refs directly.
// ---------------------------------------------------------------------------

export interface UIRefs {
  frame: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  stageLabel: HTMLElement;
  ageLabel: HTMLElement;
  leLabel: HTMLElement;
  moneyLabel: HTMLElement;
  bars: Record<StatKey, { fill: HTMLElement; val: HTMLElement }>;
  weightBar: { fill: HTMLElement; val: HTMLElement };
  subBars: Record<"muscle" | "nutrition" | "mental", { fill: HTMLElement; val: HTMLElement }>;
  warn: HTMLElement;
  focusPanel: HTMLElement;
  hint: HTMLElement;
  timeTravel: HTMLElement;
  profileBtn: HTMLElement;
  settingsBtn: HTMLElement;
  skipBtn: HTMLElement;
  touchWrap: HTMLElement;
  inventoryWrap: HTMLElement;
  inventoryTrack: HTMLElement;
  overlay: HTMLElement;
  touch: Record<"up" | "down" | "left" | "right", HTMLElement>;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export function createUI(mount: HTMLElement): UIRefs {
  mount.innerHTML = "";
  const frame = el("div", "plj-frame");

  // --- top HUD --------------------------------------------------------------
  const hud = el("div", "plj-hud");
  const topRow = el("div", "plj-hud-top");
  const stageLabel = el("span", "plj-stage", "👶 Newborn");
  const rightWrap = el("span", "plj-hud-right");
  const moneyLabel = el("span", "plj-money", "💰 $0");
  const ageWrap = el("span", "plj-age");
  const ageLabel = el("span", "plj-age-num", "0");
  const leLabel = el("span", "plj-le", "");
  ageWrap.append(document.createTextNode("Age "), ageLabel, leLabel);
  rightWrap.append(moneyLabel, ageWrap);
  topRow.append(stageLabel, rightWrap);

  const barsRow = el("div", "plj-bars");
  const bars = {} as Record<StatKey, { fill: HTMLElement; val: HTMLElement }>;
  for (const k of STAT_KEYS) {
    const meta = STAT_META[k];
    const item = el("div", "plj-bar");
    item.title = meta.label;
    const icon = el("span", "plj-bar-icon", meta.icon);
    const track = el("div", "plj-bar-track");
    const fill = el("div", "plj-bar-fill");
    fill.style.background = meta.color;
    const val = el("span", "plj-bar-val", "0");
    track.append(fill);
    item.append(icon, track, val);
    barsRow.append(item);
    bars[k] = { fill, val };
  }
  // 6th meter: body weight (colour shows healthy/over/under, not "more is better")
  const wItem = el("div", "plj-bar");
  wItem.title = "Weight";
  const wIcon = el("span", "plj-bar-icon", "⚖️");
  const wTrack = el("div", "plj-bar-track");
  const wFill = el("div", "plj-bar-fill");
  const wVal = el("span", "plj-bar-val", "50");
  wTrack.append(wFill);
  wItem.append(wIcon, wTrack, wVal);
  barsRow.append(wItem);
  const weightBar = { fill: wFill, val: wVal };

  // the three pillars that COMPOSE Health, shown as a smaller sub-row
  const subRow = el("div", "plj-subbars");
  const subBars = {} as Record<"muscle" | "nutrition" | "mental", { fill: HTMLElement; val: HTMLElement }>;
  const subMeta: [keyof typeof subBars, string, string, string][] = [
    ["muscle", "💪", "Muscle", "#ff8a5d"],
    ["nutrition", "🥗", "Nutrition", "#7ed957"],
    ["mental", "🧘", "Mental", "#b08cff"],
  ];
  for (const [key, icon, label, color] of subMeta) {
    const item = el("div", "plj-subbar");
    item.title = label + " — a pillar of your Health";
    const ic = el("span", "plj-subbar-icon", icon);
    const track = el("div", "plj-subbar-track");
    const fill = el("div", "plj-subbar-fill");
    fill.style.background = color;
    const val = el("span", "plj-subbar-val", "0");
    track.append(fill);
    item.append(ic, track, val);
    subRow.append(item);
    subBars[key] = { fill, val };
  }
  hud.append(topRow, barsRow, subRow);

  // --- canvas ---------------------------------------------------------------
  const stage = el("div", "plj-stage-wrap");
  const canvas = el("canvas", "plj-canvas");
  // Supersample: draw in a 640x700 coordinate space but back it with a 2× pixel
  // buffer, then let the browser downscale it smoothly — crisp, anti-aliased art
  // at a fraction of the fill cost (a 4× buffer made the bigger room lag).
  const SS = 2;
  canvas.width = 640 * SS;
  canvas.height = 800 * SS;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SS, SS);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const warn = el("div", "plj-warn", "⚠️ Your health is failing!");
  const hint = el("div", "plj-hint");
  const timeTravel = el("button", "plj-timetravel", "⏳");
  timeTravel.title = "Time travel (T)";
  const profileBtn = el("button", "plj-profile-btn", "💼");
  profileBtn.title = "Career profile (P)";
  const skipBtn = el("button", "plj-corner-btn plj-skip-btn", "⏭");
  skipBtn.title = "Skip this chapter";
  const settingsBtn = el("button", "plj-corner-btn plj-settings-btn", "⚙️");
  settingsBtn.title = "Settings";
  stage.append(canvas, warn, hint, timeTravel, profileBtn, skipBtn, settingsBtn);

  // --- bottom focus panel ---------------------------------------------------
  const focusPanel = el(
    "div",
    "plj-focus",
    `<span class="plj-focus-title">Move with arrows / WASD</span><span class="plj-focus-desc">Touch green items to add them to the tray. Swipe the tray left/right to select and up near a person to use.</span>`
  );

  // --- touch controls -------------------------------------------------------
  const touchWrap = el("div", "plj-touch");
  const dpad = el("div", "plj-dpad");
  const up = el("button", "plj-tbtn plj-up", "▲");
  const left = el("button", "plj-tbtn plj-left", "◀");
  const right = el("button", "plj-tbtn plj-right", "▶");
  const down = el("button", "plj-tbtn plj-down", "▼");
  dpad.append(up, left, right, down);
  const inventoryWrap = el("div", "plj-inventory");
  inventoryWrap.title = "Swipe left/right to select. Swipe up near a person to use.";
  const inventoryTrack = el("div", "plj-inventory-track");
  inventoryWrap.append(inventoryTrack);
  touchWrap.append(dpad, inventoryWrap);
  // the touch controls live INSIDE the stage so they overlay the canvas (thumbs
  // on the game), keeping everything on one mobile screen with no page scroll
  stage.append(touchWrap);

  // --- overlay --------------------------------------------------------------
  const overlay = el("div", "plj-overlay");

  frame.append(hud, stage, focusPanel, overlay);
  mount.append(frame);

  return {
    frame,
    canvas,
    ctx,
    stageLabel,
    ageLabel,
    leLabel,
    moneyLabel,
    bars,
    weightBar,
    subBars,
    warn,
    focusPanel,
    hint,
    timeTravel,
    profileBtn,
    settingsBtn,
    skipBtn,
    touchWrap,
    inventoryWrap,
    inventoryTrack,
    overlay,
    touch: { up, down, left, right },
  };
}
