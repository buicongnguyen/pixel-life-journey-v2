import { avatarLook, drawCharacter, personLook } from "./sprites";
import type { AvatarFacing } from "./sprites";
import type { Gender, PersonKind } from "./types";

const maybeCanvas = document.getElementById("preview");
if (!(maybeCanvas instanceof HTMLCanvasElement)) {
  throw new Error("Avatar preview canvas is missing.");
}

const canvas = maybeCanvas;
const maybeCtx = canvas.getContext("2d");
if (!maybeCtx) {
  throw new Error("Avatar preview canvas context is missing.");
}

const ctx = maybeCtx;
const width = 1600;
const height = 1080;
const dpr = window.devicePixelRatio || 1;

canvas.width = width * dpr;
canvas.height = height * dpr;
canvas.style.width = `${width}px`;
canvas.style.height = `${height}px`;
ctx.scale(dpr, dpr);
ctx.imageSmoothingEnabled = true;

const stages = [
  "newborn",
  "toddler",
  "early",
  "elementary",
  "middle",
  "high",
  "university",
  "career",
  "marriage",
  "midlife",
  "senior",
  "retirement",
];

function label(text: string, x: number, y: number, align: CanvasTextAlign = "center"): void {
  ctx.save();
  ctx.font = "18px Arial";
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 4;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function lane(y: number, title: string): void {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(34, y - 152, width - 68, 184);
  label(title, 50, y - 126, "left");
}

function drawHeader(): void {
  ctx.fillStyle = "#7fd8ff";
  ctx.fillRect(0, 0, width, 72);
  ctx.fillStyle = "#172738";
  ctx.font = "bold 28px Arial";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Avatar Preview: life-stage body shapes, faces, and movement", 36, 42);
}

function drawPlayerRow(rowY: number, gender: Gender): void {
  stages.forEach((name, i) => {
    const x = 98 + i * 122;
    if (rowY < 340) label(name, x, 102);
    drawCharacter(ctx, x, rowY, avatarLook(i, gender), i * 0.68, {
      moving: i > 0,
      facing: "right",
      verticalBias: 0,
    });
  });
}

function drawNpcRow(rowY: number): void {
  const people: PersonKind[] = [
    "mother",
    "father",
    "grandma",
    "grandpa",
    "sibling",
    "playmate",
    "studyFriend",
    "bestFriend",
    "crush",
    "coworker",
    "boss",
    "oldFriend",
  ];

  people.forEach((kind, i) => {
    const x = 98 + i * 122;
    const stageIndex = kind === "grandma" || kind === "grandpa" || kind === "oldFriend" ? 10 : 7;
    drawCharacter(ctx, x, rowY, personLook(kind, "male", stageIndex), i * 0.7, {
      moving: i % 2 === 0,
      facing: "front",
      verticalBias: 0,
    });
    label(kind, x, rowY + 48);
  });
}

function drawMovementRow(rowY: number): void {
  stages.slice(1).forEach((name, i) => {
    const x = 98 + i * 122;
    const facing: AvatarFacing = i % 2 === 0 ? "left" : "right";
    const gender: Gender = i % 3 === 0 ? "female" : "male";
    drawCharacter(ctx, x, rowY, avatarLook(i + 1, gender), 1.9 + i * 0.6, {
      moving: true,
      facing,
      verticalBias: 0,
    });
    label(`${name} ${facing}`, x, rowY + 48);
  });
}

function render(): void {
  ctx.fillStyle = "#26384a";
  ctx.fillRect(0, 0, width, height);
  drawHeader();

  lane(290, "Boy / male player");
  drawPlayerRow(290, "male");

  lane(520, "Girl / female player");
  drawPlayerRow(520, "female");

  lane(750, "NPC people");
  drawNpcRow(750);

  lane(980, "Walking left/right");
  drawMovementRow(980);
}

render();
