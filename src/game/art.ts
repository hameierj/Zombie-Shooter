// Original 16-bit-style pixel art, generated in code. Every sprite is drawn pixel by pixel onto a small
// canvas, shaded (light from the top-left), and given a dark 1px outline. Phaser displays them with
// nearest-neighbour scaling, so they stay crisp at any size. The same canvases are exported as data URLs
// for the DOM UI (weapon, DNA and zombie icons).
import type { ClassId } from '../core/model.ts';
type DamageType = 'physical' | 'fire' | 'shock' | 'toxic' | 'cryo';
type StrainId = string;

type Ctx = CanvasRenderingContext2D;
const OUTLINE = '#140c1c';

// ---------- primitives ----------
export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
function mix(hex: string, f: number): string {
  // f > 0 lightens toward white, f < 0 darkens toward black
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => (f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return `#${ch.map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}
export const lighten = (c: string, f: number) => mix(c, f);
export const darken = (c: string, f: number) => mix(c, -f);
function R(ctx: Ctx, x: number, y: number, w: number, h: number, col: string) {
  if (w <= 0 || h <= 0) return;
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}
const P = (ctx: Ctx, x: number, y: number, col: string) => R(ctx, x, y, 1, 1, col);
/** A rectangle with 16-bit style bevel shading: light top/left, dark bottom/right. */
function shaded(ctx: Ctx, x: number, y: number, w: number, h: number, base: string) {
  R(ctx, x, y, w, h, base);
  if (h > 2) R(ctx, x, y, w, 1, lighten(base, 0.22));
  if (w > 2) R(ctx, x, y, 1, h, lighten(base, 0.1));
  if (h > 2) R(ctx, x, y + h - 1, w, 1, darken(base, 0.28));
  if (w > 2) R(ctx, x + w - 1, y, 1, h, darken(base, 0.2));
}
function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, col: string) {
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    if ((x * x) / (rx * rx + 0.3) + (y * y) / (ry * ry + 0.3) <= 1) P(ctx, cx + x, cy + y, col);
  }
}
/** Paint a 1px dark outline around every opaque pixel (the canvas needs 1px of transparent padding). */
function outline(c: HTMLCanvasElement, col = OUTLINE) {
  const ctx = c.getContext('2d')!;
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data, w = c.width, h = c.height;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] > 0;
  const mark: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) mark.push(x, y);
  }
  ctx.fillStyle = col;
  for (let i = 0; i < mark.length; i += 2) ctx.fillRect(mark[i], mark[i + 1], 1, 1);
}
function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- zombies (side view, facing left) ----------
interface ZSpec {
  skin: string; shirt: string | null; pants: string; eye: string;
  headW: number; headH: number; torsoW: number; torsoH: number; legH: number; legW: number;
  lean: number; stride: number; belly: number;
  extra?: (ctx: Ctx, a: { hx: number; hy: number; tx: number; ty: number; frame: number }) => void;
}

const ZOMBIES: Record<string, ZSpec> = {
  shambler: {
    skin: '#7f9a68', shirt: '#6a5a8a', pants: '#3a3a48', eye: '#ff4040',
    headW: 6, headH: 6, torsoW: 7, torsoH: 7, legH: 6, legW: 2, lean: 1, stride: 2, belly: 0,
    extra: (ctx, a) => { P(ctx, a.tx + 3, a.ty + 2, '#4a3a6a'); P(ctx, a.tx + 5, a.ty + 4, '#8a1c1c'); R(ctx, a.hx + 2, a.hy - 1, 3, 1, '#3a2a20'); },
  },
  brute: {
    skin: '#7f9461', shirt: '#5d636e', pants: '#35303c', eye: '#ff4040',
    headW: 7, headH: 6, torsoW: 11, torsoH: 9, legH: 6, legW: 3, lean: 0, stride: 2, belly: 0,
    extra: (ctx, a) => {
      // riot armour plates + red hazard stripes, steel skull cap
      shaded(ctx, a.tx + 1, a.ty + 1, 9, 5, '#6b717d');
      R(ctx, a.tx + 2, a.ty + 3, 7, 1, '#c83c3c');
      shaded(ctx, a.tx + 6, a.ty - 1, 6, 3, '#80868f');
      R(ctx, a.hx + 1, a.hy - 1, 6, 2, '#8a9099');
      R(ctx, a.hx + 1, a.hy - 1, 6, 1, '#a9b0b8');
    },
  },
  runner: {
    skin: '#8aa06a', shirt: '#d9b23a', pants: '#3d5a8a', eye: '#ffe04a',
    headW: 5, headH: 5, torsoW: 5, torsoH: 6, legH: 8, legW: 2, lean: 2, stride: 3, belly: 0,
    extra: (ctx, a) => {
      // hood over the head
      R(ctx, a.hx + 1, a.hy - 1, 5, 2, '#c49e2e');
      R(ctx, a.hx + 4, a.hy, 2, 4, '#c49e2e');
      P(ctx, a.hx + 1, a.hy + 1, '#b08a24');
    },
  },
  spitter: {
    skin: '#6f9a5e', shirt: '#c9c7b5', pants: '#4a4636', eye: '#8dff4a',
    headW: 6, headH: 6, torsoW: 7, torsoH: 7, legH: 6, legW: 2, lean: 1, stride: 2, belly: 0,
    extra: (ctx, a) => {
      // swollen acid throat sac and drool; green stains on the lab coat
      ellipse(ctx, a.hx + 2, a.hy + a.frame % 2 + 6, 2, 2, '#7fe03a');
      P(ctx, a.hx + 1, a.hy + 5, '#c8ff8a');
      P(ctx, a.hx, a.hy + 8 + (a.frame % 2), '#9cff4a');
      P(ctx, a.hx, a.hy + 10 - (a.frame % 2), '#9cff4a');
      R(ctx, a.tx + 2, a.ty + 3, 2, 2, '#8fbf5a');
      P(ctx, a.tx + 5, a.ty + 5, '#8fbf5a');
    },
  },
  burnt: {
    skin: '#3b2a26', shirt: null, pants: '#2a2224', eye: '#ffa030',
    headW: 6, headH: 6, torsoW: 7, torsoH: 7, legH: 6, legW: 2, lean: 1, stride: 2, belly: 0,
    extra: (ctx, a) => {
      // glowing ember cracks that flicker between frames
      const e = a.frame % 2 ? '#ffcc4a' : '#ff8a2a';
      for (const [x, y] of [[1, 1], [2, 2], [3, 2], [4, 4], [2, 5], [5, 1]]) P(ctx, a.tx + x, a.ty + y, e);
      for (const [x, y] of [[2, 1], [4, 2], [3, 4]]) P(ctx, a.hx + x, a.hy + y, e);
      P(ctx, a.hx + 3, a.hy - 1, a.frame % 2 ? '#ff6a1a' : '#ffb03a');
    },
  },
  bloater: {
    skin: '#8a7a9a', shirt: '#5a3f7a', pants: '#3a2e48', eye: '#d090ff',
    headW: 6, headH: 5, torsoW: 11, torsoH: 8, legH: 5, legW: 3, lean: 0, stride: 1, belly: 5,
    extra: (ctx, a) => {
      // pustules on the belly
      for (const [x, y] of [[1, 3], [4, 6], [2, 8], [6, 4]]) { P(ctx, a.tx + x - 3, a.ty + y, '#d6aaff'); P(ctx, a.tx + x - 3, a.ty + y + 1, '#7a4aa8'); }
    },
  },
};

export const ZOMBIE_W = 26;
export const ZOMBIE_H = 30;

function drawZombie(id: StrainId, frame: number): HTMLCanvasElement {
  const z = ZOMBIES[id];
  const [c, ctx] = makeCanvas(ZOMBIE_W, ZOMBIE_H);
  const base = ZOMBIE_H - 2;            // feet rest on this row
  const cx = 14;                         // body centre
  const bob = frame % 2 ? -1 : 0;
  const skinD = darken(z.skin, 0.3);
  const legTop = base - z.legH;

  // legs: back leg (darker) first, then front leg
  const swing = [-z.stride, 0, z.stride, 0][frame];
  const leg = (off: number, col: string) => {
    for (let r = 0; r < z.legH; r++) {
      const x = Math.round(cx - 1 + (off * r) / z.legH);
      R(ctx, x, legTop + r, z.legW, 1, col);
    }
    R(ctx, Math.round(cx - 2 + off), base - 1, z.legW + 1, 1, '#2a1e16'); // foot points forward (left)
  };
  leg(-swing, darken(z.pants, 0.35));
  leg(swing, z.pants);

  const tx = cx - Math.floor(z.torsoW / 2) - z.lean;
  const ty = legTop - z.torsoH + bob;
  // pants band
  shaded(ctx, tx + z.lean, legTop - 2 + bob, z.torsoW - z.lean, 3, z.pants);
  // back arm (behind torso), darker
  const armY = ty + 2;
  R(ctx, tx - 3, armY + 2 + (frame % 2), 5, 2, skinD);
  // torso
  if (z.shirt) {
    shaded(ctx, tx, ty, z.torsoW, z.torsoH - 1, z.shirt);
    for (let i = 0; i < z.torsoW; i += 2) P(ctx, tx + i, ty + z.torsoH - 2, z.skin); // ragged hem
  } else {
    shaded(ctx, tx, ty, z.torsoW, z.torsoH - 1, z.skin);
  }
  if (z.belly) {
    ellipse(ctx, tx + 2, ty + z.torsoH / 2 + 1, z.belly - 1, z.belly - 1, z.skin);
    ellipse(ctx, tx + 1, ty + z.torsoH / 2, 1, 1, lighten(z.skin, 0.25));
    R(ctx, tx - 1, ty + z.torsoH / 2 + 3, 3, 1, darken(z.skin, 0.2));
  }
  // head (jaw juts forward/left), neck
  const hx = cx - Math.floor(z.headW / 2) - z.lean * 2 - 1;
  const hy = ty - z.headH + 1;
  R(ctx, hx + 2, hy + z.headH - 1, 2, 2, skinD);
  shaded(ctx, hx, hy, z.headW, z.headH, z.skin);
  P(ctx, hx + z.headW - 1, hy, 'rgba(0,0,0,0)');
  ctx.clearRect(hx + z.headW - 1, hy, 1, 1);
  R(ctx, hx - 1, hy + z.headH - 3, 2, 2, z.skin);               // jaw
  R(ctx, hx - 1, hy + z.headH - 2, 3, 1, '#3a1010');            // mouth
  P(ctx, hx, hy + z.headH - 2, '#e8e0c0');                      // tooth
  R(ctx, hx + 1, hy + 1, 2, 2, '#1a1010');                      // eye socket
  P(ctx, hx + 1, hy + 1, z.eye);                                // glowing eye
  P(ctx, hx + z.headW - 2, hy + 2, darken(z.skin, 0.4));        // ear
  P(ctx, hx + 3, hy, darken(z.skin, 0.35));                     // scalp wound
  // front arm reaching forward, bobbing opposite to the body
  const ay = armY + (frame % 2 ? 1 : 0);
  R(ctx, tx - 5, ay, 7, 2, z.skin);
  R(ctx, tx - 5, ay, 7, 1, lighten(z.skin, 0.15));
  R(ctx, tx - 7, ay, 2, 3, z.skin);                             // hand
  P(ctx, tx - 8, ay + 2, '#e8e0c0');                            // claw
  z.extra?.(ctx, { hx, hy, tx, ty, frame });
  outline(c);
  return c;
}

// ---------- heroes (side view, facing right) ----------
export const HERO_W = 20;
export const HERO_H = 26;
/** Outfits per recruit class, in CLASSES order: pistol, bow, shotgun, rifle, sniper, flamer, grenade. */
export const CLASS_ORDER: ClassId[] = ['pistol', 'bow', 'shotgun', 'rifle', 'sniper', 'flamer', 'grenade'];
const HERO_COLORS = [
  { vest: '#5c6b3a', helmet: '#4b5830', scarf: '#c83c3c' },
  { vest: '#4a6a32', helmet: '#3a5a28', scarf: '#c8a84a' },
  { vest: '#7a3a2a', helmet: '#3a3d44', scarf: '#e8e8e8' },
  { vest: '#3a5a7a', helmet: '#2f4a66', scarf: '#ffd23f' },
  { vest: '#6a6a3a', helmet: '#5a5a2a', scarf: '#2a2a2a' },
  { vest: '#5a5a5a', helmet: '#3a3d44', scarf: '#ff7a2a' },
  { vest: '#5a6a3a', helmet: '#3a4a2a', scarf: '#ffb84a' },
];
/** Where the gun's grip sits on the hero canvas. */
export const HERO_GRIP = { x: 13, y: 13 };

function drawHero(i: number, frame: number): HTMLCanvasElement {
  const col = HERO_COLORS[i % HERO_COLORS.length];
  const [c, ctx] = makeCanvas(HERO_W, HERO_H);
  const base = HERO_H - 2;
  const bob = frame ? -1 : 0;
  // boots + legs (kneeling stance: back knee down)
  R(ctx, 5, base - 1, 4, 1, '#2a1e16'); R(ctx, 10, base - 1, 4, 1, '#2a1e16');
  shaded(ctx, 6, base - 5, 3, 4, '#3b3a2c');
  shaded(ctx, 10, base - 5, 3, 4, darken('#3b3a2c', 0.2));
  // body
  shaded(ctx, 5, base - 13 + bob, 8, 8, col.vest);
  R(ctx, 5, base - 7 + bob, 8, 1, '#2a2418');                   // belt
  P(ctx, 9, base - 7 + bob, '#c8a84a');                          // buckle
  R(ctx, 6, base - 11 + bob, 2, 2, darken(col.vest, 0.25));      // pouch
  R(ctx, 5, base - 13 + bob, 8, 1, col.scarf);                   // scarf
  // head + helmet + goggles
  shaded(ctx, 6, base - 19 + bob, 6, 6, '#d6a27a');
  shaded(ctx, 5, base - 21 + bob, 8, 4, col.helmet);
  R(ctx, 5, base - 18 + bob, 9, 1, darken(col.helmet, 0.3));     // helmet rim
  R(ctx, 9, base - 17 + bob, 3, 2, '#1a2a3a');                   // goggles
  P(ctx, 10, base - 17 + bob, '#7fe8ff');
  // arms forward to hold the gun
  R(ctx, 9, base - 11 + bob, 5, 2, darken(col.vest, 0.15));
  R(ctx, 13, base - 11 + bob, 2, 2, '#d6a27a');
  outline(c);
  return c;
}

// ---------- guns (facing right; grip at (2, gripY)) ----------
export interface GunArt { canvas: HTMLCanvasElement; grip: [number, number]; muzzle: [number, number] }
export const GUN_W = 24;
export const GUN_H = 12;

function drawGun(type: DamageType): GunArt {
  const [c, ctx] = makeCanvas(GUN_W, GUN_H);
  let muzzle: [number, number] = [20, 5];
  switch (type) {
    case 'physical': // assault rifle with wooden stock
      shaded(ctx, 1, 5, 5, 3, '#7a4a26');
      shaded(ctx, 6, 4, 9, 3, '#3a3d44');
      R(ctx, 15, 5, 6, 1, '#2a2c30');
      R(ctx, 9, 7, 2, 3, '#2a2c30');                 // magazine
      P(ctx, 12, 3, '#2a2c30');                      // sight
      muzzle = [21, 5];
      break;
    case 'fire': // flamethrower: red tank + nozzle with pilot flame
      ellipse(ctx, 6, 8, 3, 2, '#b8322a');
      P(ctx, 5, 7, '#e86a5a');
      shaded(ctx, 3, 4, 12, 3, '#555a62');
      shaded(ctx, 15, 3, 4, 4, '#3a3d44');
      P(ctx, 20, 4, '#ffcc4a'); P(ctx, 20, 5, '#ff7a2a');
      muzzle = [20, 5];
      break;
    case 'shock': // arc caster: blue coils and twin prongs
      shaded(ctx, 2, 4, 10, 4, '#3a4a6a');
      for (let x = 4; x < 11; x += 2) R(ctx, x, 3, 1, 6, '#6cb6ff');
      R(ctx, 12, 3, 6, 1, '#9aa4b0'); R(ctx, 12, 7, 6, 1, '#9aa4b0');
      P(ctx, 18, 4, '#e8f6ff'); P(ctx, 18, 6, '#e8f6ff');
      muzzle = [19, 5];
      break;
    case 'toxic': // bile sprayer: glass tank of green bile, brass nozzle
      shaded(ctx, 2, 5, 6, 3, '#5a4a3a');
      R(ctx, 7, 2, 5, 5, '#cfe8c0');
      R(ctx, 8, 4, 3, 3, '#7fe03a');
      P(ctx, 8, 3, '#ffffff');
      shaded(ctx, 12, 4, 6, 2, '#c8a84a');
      P(ctx, 19, 4, '#9cff4a');
      muzzle = [19, 5];
      break;
    case 'cryo': // frost cannon: chunky white barrel, cyan core
      shaded(ctx, 2, 4, 6, 4, '#8a96a6');
      shaded(ctx, 8, 3, 10, 5, '#dfe8f0');
      R(ctx, 9, 5, 8, 1, '#8ff0f0');
      R(ctx, 18, 4, 2, 3, '#5aa8c8');
      muzzle = [20, 5];
      break;
  }
  outline(c);
  return { canvas: c, grip: [3, 6], muzzle };
}

/** One gun per recruit class (facing right, grip at (3,6) like the others). */
function drawClassGun(cls: ClassId): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(GUN_W, GUN_H);
  switch (cls) {
    case 'pistol':
      shaded(ctx, 3, 4, 9, 3, '#3a3d44'); R(ctx, 3, 7, 3, 3, '#5a4028'); P(ctx, 11, 4, '#9aa4b0'); P(ctx, 7, 7, '#2a2c30');
      break;
    case 'bow': // compound bow: limbs, cams and string, arrow nocked
      R(ctx, 6, 0, 2, 12, '#3a4a2a'); P(ctx, 5, 0, '#9aa4b0'); P(ctx, 5, 11, '#9aa4b0');
      R(ctx, 8, 1, 1, 2, '#3a4a2a'); R(ctx, 8, 9, 1, 2, '#3a4a2a');
      for (let y = 1; y < 11; y++) P(ctx, 3 + Math.round(Math.abs(y - 6) * 0.3), y, '#e8e8e8');
      R(ctx, 3, 6, 15, 1, '#8a5a2e'); R(ctx, 18, 5, 2, 3, '#c8ccd2'); P(ctx, 4, 5, '#ff5a5a'); P(ctx, 4, 7, '#ff5a5a');
      break;
    case 'shotgun':
      shaded(ctx, 1, 5, 5, 3, '#7a4a26'); shaded(ctx, 6, 4, 13, 2, '#3a3d44'); R(ctx, 6, 6, 12, 1, '#2a2c30'); shaded(ctx, 10, 7, 5, 2, '#7a4a26');
      break;
    case 'rifle':
      shaded(ctx, 1, 5, 5, 3, '#2a2c30'); shaded(ctx, 6, 4, 9, 3, '#3a3d44'); R(ctx, 15, 5, 6, 1, '#2a2c30'); R(ctx, 9, 7, 2, 3, '#2a2c30'); R(ctx, 8, 3, 4, 1, '#2a2c30');
      break;
    case 'sniper':
      shaded(ctx, 0, 5, 5, 3, '#5a4a2a'); shaded(ctx, 5, 5, 8, 2, '#3a3d44'); R(ctx, 13, 5, 10, 1, '#2a2c30');
      shaded(ctx, 6, 2, 7, 2, '#1e2024'); P(ctx, 12, 2, '#7fe8ff'); P(ctx, 9, 7, '#2a2c30'); P(ctx, 16, 6, '#2a2c30'); P(ctx, 17, 7, '#2a2c30');
      break;
    case 'flamer':
      ellipse(ctx, 6, 8, 3, 2, '#b8322a'); P(ctx, 5, 7, '#e86a5a'); shaded(ctx, 3, 4, 12, 3, '#555a62'); shaded(ctx, 15, 3, 4, 4, '#3a3d44'); P(ctx, 20, 4, '#ffcc4a'); P(ctx, 20, 5, '#ff7a2a');
      break;
    case 'grenade':
      shaded(ctx, 1, 5, 5, 3, '#4a5a32'); ellipse(ctx, 8, 6, 3, 3, '#3a3d44'); P(ctx, 7, 5, '#6a7078'); shaded(ctx, 10, 3, 9, 5, '#4a5a32'); R(ctx, 18, 4, 2, 3, '#2a2c30');
      break;
  }
  outline(c);
  return c;
}

// ---------- shredder ----------
function drawShredHousing(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(16, 16);
  shaded(ctx, 0, 0, 16, 16, '#5a6470');
  R(ctx, 0, 7, 16, 1, '#3e4650');                     // panel seam
  for (const [x, y] of [[2, 2], [13, 2], [2, 11], [13, 11]]) { P(ctx, x, y, '#a9b3bf'); P(ctx, x + 1, y + 1, '#2e343c'); }
  R(ctx, 6, 3, 4, 2, '#3e4650');                      // vent
  R(ctx, 6, 10, 4, 2, '#3e4650');
  return c;
}
function drawShredTeeth(): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(10, 8);
  R(ctx, 0, 0, 10, 8, '#23272d');
  R(ctx, 0, 0, 3, 8, '#30353c');
  // a blade every 8px, pointing right toward the zombies
  for (let i = 0; i < 6; i++) R(ctx, 3, 1 + i, 7 - i, 1, i < 2 ? '#e0e6ec' : '#a9b3bf');
  P(ctx, 3, 7, '#5a1a1a');
  return c;
}
function drawHazard(w: number, h: number): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) P(ctx, x, y, ((x + y) >> 2) % 2 ? '#1a1a1a' : '#e8c22a');
  R(ctx, 0, 0, w, 1, '#fff0a0');
  R(ctx, 0, h - 1, w, 1, '#6a5a10');
  outline(c);
  return c;
}

// ---------- small sprites ----------
function drawVial(color: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(8, 11);
  R(ctx, 2, 1, 4, 2, '#8a5a3a');                      // cork
  R(ctx, 2, 3, 4, 1, '#cfe0e8');                       // neck
  R(ctx, 1, 4, 6, 6, '#cfe0e8');                       // glass
  R(ctx, 2, 5, 4, 4, color);                           // DNA liquid
  R(ctx, 2, 5, 4, 1, lighten(color, 0.35));
  P(ctx, 2, 6, '#ffffff');
  outline(c);
  return c;
}
function drawCharm(gem: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(10, 12);
  R(ctx, 4, 1, 2, 1, '#c8a84a'); P(ctx, 3, 2, '#c8a84a'); P(ctx, 6, 2, '#c8a84a');   // chain loop
  shaded(ctx, 2, 3, 6, 7, '#c8a84a');                                                  // gold setting
  R(ctx, 3, 4, 4, 5, gem);
  P(ctx, 3, 4, lighten(gem, 0.5));
  R(ctx, 3, 8, 4, 1, darken(gem, 0.3));
  outline(c);
  return c;
}
export const RARITY_TRIM: Record<string, string> = {
  common: '#b8b8b8', uncommon: '#5fd068', rare: '#4aa3ff', epic: '#b66bff', legendary: '#ffb84a',
};
function drawCrate(trim: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(12, 11);
  shaded(ctx, 1, 2, 10, 8, '#8a5a2e');
  R(ctx, 1, 2, 10, 2, trim); R(ctx, 1, 2, 10, 1, lighten(trim, 0.4));
  R(ctx, 1, 2, 1, 8, trim); R(ctx, 10, 2, 1, 8, trim);
  R(ctx, 5, 4, 2, 2, '#e8d070');
  R(ctx, 2, 6, 8, 1, '#6a4422');
  outline(c);
  return c;
}
function drawMod(led: string): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(12, 9);
  shaded(ctx, 1, 2, 9, 5, '#5a6470');
  R(ctx, 3, 1, 2, 1, '#3e4650'); R(ctx, 7, 1, 2, 1, '#3e4650');
  R(ctx, 7, 3, 2, 3, led); P(ctx, 7, 3, lighten(led, 0.6));
  R(ctx, 2, 4, 3, 1, '#2e343c');
  outline(c);
  return c;
}
const I = (paint: (c: Ctx) => void) => () => drawSimple(14, 14, paint, true);
const ICONS: Record<string, () => HTMLCanvasElement> = {
  dmg: I((c) => { R(c, 5, 2, 4, 3, '#c8ccd2'); R(c, 6, 1, 2, 1, '#e0e4ea'); shaded(c, 5, 5, 4, 7, '#d9a441'); R(c, 5, 11, 4, 1, '#8a6020'); }),
  spd: I((c) => { for (const o of [2, 7]) for (let i = 0; i < 4; i++) { P(c, o + i, 3 + i, '#ffd23f'); P(c, o + i, 10 - i, '#ffd23f'); P(c, o + i + 1, 3 + i, '#c49e2e'); P(c, o + i + 1, 10 - i, '#c49e2e'); } }),
  critdmg: I((c) => { ellipse(c, 7, 7, 4, 4, '#ff5a5a'); ellipse(c, 7, 7, 2, 2, '#ffd23f'); for (const [x, y] of [[7, 1], [7, 12], [1, 7], [12, 7], [3, 3], [11, 3], [3, 11], [11, 11]]) P(c, x, y, '#ff8a5a'); }),
  crit: I((c) => { for (let a = 0; a < 24; a++) { const t = (a / 24) * Math.PI * 2; P(c, Math.round(7 + Math.cos(t) * 5), Math.round(7 + Math.sin(t) * 5), '#ff5a5a'); } R(c, 7, 1, 1, 4, '#e8e8e8'); R(c, 7, 9, 1, 4, '#e8e8e8'); R(c, 1, 7, 4, 1, '#e8e8e8'); R(c, 9, 7, 4, 1, '#e8e8e8'); P(c, 7, 7, '#ff3030'); }),
  range: I((c) => { shaded(c, 1, 5, 8, 4, '#3a3d44'); R(c, 9, 4, 3, 6, '#5a6470'); R(c, 10, 5, 2, 4, '#7fe8ff'); P(c, 10, 5, '#ffffff'); R(c, 3, 9, 2, 3, '#3a3d44'); }),
  'slot-mod': I((c) => { ellipse(c, 7, 7, 5, 5, '#9aa4b0'); ellipse(c, 7, 7, 2, 2, '#3a3d44'); for (const [x, y] of [[7, 0], [7, 13], [0, 7], [13, 7], [2, 2], [12, 2], [2, 12], [12, 12]]) R(c, x - 1 < 0 ? 0 : x - 1, y - 1 < 0 ? 0 : y - 1, 2, 2, '#9aa4b0'); }),
  'slot-charm': I((c) => { R(c, 6, 1, 2, 1, '#c8a84a'); shaded(c, 4, 3, 6, 8, '#c8a84a'); R(c, 5, 4, 4, 6, '#b77bff'); P(c, 5, 4, '#e8d0ff'); }),
  spawn: I((c) => { R(c, 3, 1, 8, 2, '#c8a84a'); R(c, 3, 11, 8, 2, '#c8a84a'); for (let i = 0; i < 4; i++) { R(c, 4 + i, 3 + i, 6 - i * 2, 1, '#e8d8a8'); R(c, 4 + i, 10 - i, 6 - i * 2, 1, '#e8d8a8'); } R(c, 6, 8, 2, 2, '#7ddc5a'); P(c, 7, 6, '#7ddc5a'); }),
  dna: I((c) => { for (let y = 0; y < 13; y++) { const s = Math.sin(y / 2); P(c, Math.round(7 + s * 3), y, '#ff5a5a'); P(c, Math.round(7 - s * 3), y, '#7fe8ff'); if (y % 3 === 0) R(c, Math.min(7 + s * 3, 7 - s * 3) + 1, y, Math.abs(s * 6) - 1, 1, '#9aa4b0'); } }),
  auto: I((c) => { ellipse(c, 7, 7, 4, 4, '#ff3a3a'); R(c, 3, 7, 9, 5, '#ff3a3a'); P(c, 5, 5, '#ffb0b0'); R(c, 2, 11, 11, 2, '#5a6470'); P(c, 1, 3, '#ffd23f'); P(c, 12, 3, '#ffd23f'); P(c, 7, 0, '#ffd23f'); }),
  loot: () => drawCrate('#ffb84a'),
  fast: I((c) => { for (const o of [1, 7]) for (let i = 0; i < 6; i++) R(c, o + i, 2 + i, 1, 11 - i * 2, '#7ddc5a'); }),
  luck: I((c) => { for (const [x, y] of [[4, 4], [9, 4], [4, 9], [9, 9]]) ellipse(c, x, y, 2, 2, '#5fd068'); P(c, 6, 6, '#3a8a3a'); R(c, 7, 9, 1, 4, '#3a8a3a'); P(c, 3, 3, '#a8f0a0'); }),
  equip: I((c) => { shaded(c, 3, 3, 8, 9, '#7a5a3a'); R(c, 5, 1, 4, 2, '#5a4028'); shaded(c, 4, 7, 6, 3, '#8a6a46'); R(c, 6, 8, 2, 1, '#e8d070'); }),
};
function drawSimple(w: number, h: number, paint: (ctx: Ctx) => void, withOutline = false) {
  const [c, ctx] = makeCanvas(w, h);
  paint(ctx);
  if (withOutline) outline(c);
  return c;
}

// ---------- ground ----------
export interface GroundLayout { w: number; h: number; roadTop: number; roadBot: number; bunkerRight: number }

/** Paint the whole battlefield background at art resolution (1 canvas pixel = 1 art pixel). */
export function drawGround(L: GroundLayout): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(L.w, L.h);
  const r = rng(1337);
  const noise = (x: number, y: number, w: number, h: number, cols: string[], density: number) => {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (r() < density) P(ctx, xx, yy, cols[Math.floor(r() * cols.length)]);
  };
  // grass verges
  R(ctx, 0, 0, L.w, L.h, '#3d5a2a');
  noise(0, 0, L.w, L.h, ['#4a6a32', '#34502a', '#56783a'], 0.25);
  // road
  R(ctx, 0, L.roadTop, L.w, L.roadBot - L.roadTop, '#45464e');
  noise(0, L.roadTop, L.w, L.roadBot - L.roadTop, ['#4e5058', '#3c3d44', '#52545c'], 0.35);
  // curbs
  R(ctx, 0, L.roadTop - 2, L.w, 2, '#8a8a8e'); R(ctx, 0, L.roadTop - 2, L.w, 1, '#a6a6aa');
  R(ctx, 0, L.roadBot, L.w, 2, '#8a8a8e'); R(ctx, 0, L.roadBot + 1, L.w, 1, '#6a6a6e');
  // faded centre line
  const mid = Math.round((L.roadTop + L.roadBot) / 2);
  for (let x = L.bunkerRight + 6; x < L.w; x += 14) R(ctx, x, mid, 7, 1, r() < 0.3 ? '#8a8058' : '#b8a860');
  // cracks
  for (let i = 0; i < L.w / 18; i++) {
    let x = Math.floor(r() * L.w), y = L.roadTop + Math.floor(r() * (L.roadBot - L.roadTop));
    for (let s = 0; s < 6 + r() * 8; s++) { P(ctx, x, y, '#2e2f35'); x += Math.round(r() * 2 - 1); y += r() < 0.5 ? 1 : 0; x += 1; }
  }
  // blood stains on the road
  for (let i = 0; i < L.w / 40; i++) {
    const x = L.bunkerRight + 8 + Math.floor(r() * (L.w - L.bunkerRight - 8));
    const y = L.roadTop + 4 + Math.floor(r() * (L.roadBot - L.roadTop - 8));
    ellipse(ctx, x, y, 2 + Math.floor(r() * 3), 1 + Math.floor(r() * 2), '#4a1a1e');
    P(ctx, x + 3, y + 1, '#5a1e22');
  }
  // bunker floor behind the shredder: concrete slabs
  R(ctx, 0, 0, L.bunkerRight, L.h, '#6a6a66');
  noise(0, 0, L.bunkerRight, L.h, ['#72726e', '#62625e'], 0.3);
  for (let y = 0; y < L.h; y += 10) R(ctx, 0, y, L.bunkerRight, 1, '#55554f');
  for (let y = 0; y < L.h; y += 10) for (let x = (y / 10) % 2 ? 5 : 0; x < L.bunkerRight; x += 12) R(ctx, x, y, 1, 10, '#55554f');
  // decorations on the verges
  const decos = [drawTire, drawBarrel, drawCone, drawBones, drawSkull, drawTuft, drawTuft, drawTuft];
  const place = (y0: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const d = decos[Math.floor(r() * decos.length)]();
      const x = L.bunkerRight + 10 + Math.floor(r() * Math.max(1, L.w - L.bunkerRight - 20));
      const y = y0 + Math.floor(r() * Math.max(1, y1 - y0 - d.height));
      ctx.drawImage(d, x, y);
    }
  };
  place(0, L.roadTop - 2, Math.max(2, Math.floor(L.w / 30)));
  place(L.roadBot + 2, L.h, Math.max(2, Math.floor(L.w / 30)));
  // a few bits of debris on the road itself
  for (let i = 0; i < L.w / 60; i++) {
    const d = [drawBones, drawSkull, drawTire][Math.floor(r() * 3)]();
    ctx.drawImage(d, L.bunkerRight + 20 + Math.floor(r() * (L.w - L.bunkerRight - 30)), L.roadTop + 3 + Math.floor(r() * (L.roadBot - L.roadTop - 10)));
  }
  // sandbag wall along the bunker edge
  for (let y = -2; y < L.h; y += 5) {
    const bag = drawSimple(8, 6, (cx) => { shaded(cx, 1, 1, 6, 4, '#b89a62'); P(cx, 3, 2, '#9a7e4a'); }, true);
    ctx.drawImage(bag, L.bunkerRight - 9 + ((y / 5) % 2 ? 1 : 0), y);
  }
  // vignette
  const g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.15, 'rgba(0,0,0,0)');
  g.addColorStop(0.85, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
  return c;
}
const drawTire = () => drawSimple(10, 7, (c) => {
  ellipse(c, 5, 3, 4, 2, '#1e1e22'); P(c, 3, 1, '#3a3a40'); P(c, 7, 5, '#3a3a40');
  for (const [x, y] of [[4, 3], [5, 3], [6, 3]]) c.clearRect(x, y, 1, 1); // see-through hole
}, true);
const drawBarrel = () => drawSimple(8, 10, (c) => { shaded(c, 1, 1, 6, 8, '#8a3a22'); R(c, 1, 3, 6, 1, '#5a2414'); R(c, 1, 6, 6, 1, '#5a2414'); P(c, 3, 1, '#c86a3a'); }, true);
const drawCone = () => drawSimple(7, 9, (c) => { R(c, 3, 1, 1, 2, '#ff7a2a'); R(c, 2, 3, 3, 2, '#f0f0f0'); R(c, 2, 5, 3, 2, '#ff7a2a'); R(c, 1, 7, 5, 1, '#c85a1a'); }, true);
const drawBones = () => drawSimple(9, 5, (c) => { R(c, 2, 2, 5, 1, '#e0dccb'); P(c, 1, 1, '#e0dccb'); P(c, 1, 3, '#e0dccb'); P(c, 7, 1, '#e0dccb'); P(c, 7, 3, '#e0dccb'); }, true);
const drawSkull = () => drawSimple(7, 7, (c) => { shaded(c, 1, 1, 5, 4, '#e0dccb'); R(c, 2, 5, 3, 1, '#cfcab8'); P(c, 2, 3, '#2a2420'); P(c, 4, 3, '#2a2420'); }, true);
const drawTuft = () => drawSimple(6, 5, (c) => { for (const x of [1, 2, 3, 4]) R(c, x, 4 - (x % 2) - (x === 2 ? 1 : 0), 1, 1 + (x % 2) + (x === 2 ? 1 : 0), x % 2 ? '#6a9a3a' : '#7fb04a'); });

// ---------- texture registry ----------
export const STRAIN_DNA_COLOR: Record<string, string> = {
  shambler: '#7ddc5a', dna: '#7ddc5a',
  brute: '#ff5a5a', runner: '#ffd23f', spitter: '#7ddc5a', burnt: '#ff9a3c', bloater: '#b77bff',
};
export const ZOMBIE_FRAMES = 4;
const STRAINS: StrainId[] = ['shambler', 'runner', 'brute', 'spitter', 'bloater', 'burnt'];
const TYPES: DamageType[] = ['physical', 'fire', 'shock', 'toxic', 'cryo'];

export interface ArtSet {
  canvases: Record<string, HTMLCanvasElement>;
  guns: Record<DamageType, GunArt>;
}

let cache: ArtSet | null = null;

/** Build every sprite once. Keys are used as Phaser texture keys. */
export function buildArt(): ArtSet {
  if (cache) return cache;
  const canvases: Record<string, HTMLCanvasElement> = {};
  for (const s of STRAINS) for (let f = 0; f < ZOMBIE_FRAMES; f++) canvases[`z-${s}-${f}`] = drawZombie(s, f);
  for (let i = 0; i < 4; i++) for (let f = 0; f < 2; f++) canvases[`hero-${i}-${f}`] = drawHero(i, f);
  CLASS_ORDER.forEach((cls, i) => {
    for (let f = 0; f < 2; f++) canvases[`hero-${cls}-${f}`] = drawHero(i, f);
    canvases[`gun-${cls}`] = drawClassGun(cls);
  });
  canvases['vial-dna'] = drawVial('#7ddc5a');
  canvases['arrow'] = drawSimple(9, 3, (c) => { R(c, 0, 1, 7, 1, '#8a5a2e'); R(c, 7, 0, 2, 3, '#c8ccd2'); P(c, 0, 0, '#ff5a5a'); P(c, 0, 2, '#ff5a5a'); });
  canvases['pellet'] = drawSimple(2, 2, (c) => R(c, 0, 0, 2, 2, '#ffe9a0'));
  canvases['grenade'] = drawSimple(6, 6, (c) => { ellipse(c, 3, 3, 2, 2, '#4a5a32'); P(c, 2, 2, '#8a9a6a'); }, true);
  canvases['boom'] = drawSimple(15, 15, (c) => { ellipse(c, 7, 7, 7, 7, '#ff7a2a'); ellipse(c, 7, 7, 5, 5, '#ffd23f'); ellipse(c, 7, 7, 2, 2, '#ffffff'); });
  canvases['tracer'] = drawSimple(12, 1, (c) => { R(c, 0, 0, 8, 1, '#bff8ff'); R(c, 8, 0, 4, 1, '#ffffff'); });
  const guns = {} as Record<DamageType, GunArt>;
  for (const t of TYPES) { guns[t] = drawGun(t); canvases[`gun-${t}`] = guns[t].canvas; }
  for (const s of STRAINS) canvases[`vial-${s}`] = drawVial(STRAIN_DNA_COLOR[s]);
  canvases['shred-housing'] = drawShredHousing();
  canvases['shred-teeth'] = drawShredTeeth();
  canvases['shred-cap'] = drawHazard(22, 6);
  for (const s of [...STRAINS, 'generic'] as const) canvases[`charm-${s}`] = drawCharm(s === 'generic' ? '#e8e8e8' : STRAIN_DNA_COLOR[s]);
  for (const [r, col] of Object.entries(RARITY_TRIM)) canvases[`crate-${r}`] = drawCrate(col);
  for (const [stat, col] of [['dmg', '#ff5a5a'], ['spd', '#ffd23f'], ['crit', '#7ddc5a']] as const) canvases[`mod-${stat}`] = drawMod(col);
  for (const [k, fn] of Object.entries(ICONS)) canvases[`icon-${k}`] = fn();
  canvases['pix'] = drawSimple(1, 1, (c) => P(c, 0, 0, '#ffffff'));
  canvases['bullet'] = drawSimple(5, 1, (c) => { R(c, 0, 0, 3, 1, '#ffe9a0'); R(c, 3, 0, 2, 1, '#ffffff'); });
  canvases['flame-0'] = drawSimple(6, 6, (c) => { ellipse(c, 3, 3, 2, 2, '#ff6a1a'); ellipse(c, 3, 3, 1, 1, '#ffd23f'); });
  canvases['flame-1'] = drawSimple(6, 6, (c) => { ellipse(c, 3, 3, 2, 2, '#ff8a2a'); P(c, 3, 3, '#fff0a0'); P(c, 2, 1, '#ff4a1a'); });
  canvases['glob'] = drawSimple(6, 6, (c) => { ellipse(c, 3, 3, 2, 2, '#7fe03a'); P(c, 2, 2, '#d0ff9a'); }, true);
  canvases['shard'] = drawSimple(7, 5, (c) => { R(c, 1, 2, 5, 1, '#bff8ff'); R(c, 2, 1, 3, 3, '#8ff0f0'); P(c, 5, 2, '#ffffff'); }, true);
  canvases['muzzle'] = drawSimple(7, 7, (c) => { R(c, 3, 0, 1, 7, '#ffe9a0'); R(c, 0, 3, 7, 1, '#ffe9a0'); R(c, 2, 2, 3, 3, '#ffffff'); });
  canvases['spark'] = drawSimple(5, 5, (c) => { P(c, 2, 0, '#fff'); P(c, 2, 4, '#fff'); P(c, 0, 2, '#fff'); P(c, 4, 2, '#fff'); R(c, 1, 1, 3, 3, '#ffe060'); });
  cache = { canvases, guns };
  return cache;
}

// ---------- DOM icons ----------
const iconCache = new Map<string, string>();
/** A pixel-art canvas scaled up for the DOM, as a data URL (render with image-rendering: pixelated). */
export function iconUrl(key: string, scale = 3, crop?: [number, number, number, number]): string {
  const ck = `${key}@${scale}@${crop?.join(',') ?? ''}`;
  const hit = iconCache.get(ck);
  if (hit) return hit;
  const src = buildArt().canvases[key];
  const [sx, sy, sw, sh] = crop ?? [0, 0, src.width, src.height];
  const [c, ctx] = makeCanvas(sw * scale, sh * scale);
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw * scale, sh * scale);
  const url = c.toDataURL();
  iconCache.set(ck, url);
  return url;
}
export const weaponIcon = (t: DamageType) => iconUrl(`gun-${t}`, 2, [0, 1, 22, 10]);
export const vialIcon = (s: StrainId) => iconUrl(`vial-${s}`, 2);
export const charmIcon = (bane: StrainId | null) => iconUrl(`charm-${bane ?? 'generic'}`, 3);
export const modIcon = (stat: string) => iconUrl(`mod-${stat}`, 3);
export const crateIcon = (rarity: string) => iconUrl(`crate-${rarity}`, 3);
export const heroIcon = (i: number) => iconUrl(`hero-${i}-0`, 2, [3, 2, 14, 13]);
export const classIcon = (cls: ClassId) => iconUrl(`hero-${cls}-0`, 3, [3, 2, 14, 13]);
export const gunIcon = (cls: ClassId) => iconUrl(`gun-${cls}`, 3);
export const dnaIcon = () => iconUrl('vial-dna', 2);
/** Icon for a tree node: 'z:<strain>', 'hero:<n>' or a named icon. */
export function nodeIcon(icon: string): string {
  if (icon.startsWith('z:')) return zombieIcon(icon.slice(2) as StrainId);
  if (icon.startsWith('hero:')) return heroIcon(Number(icon.slice(5)));
  return iconUrl(`icon-${icon}`, 3);
}
/** Zombie head-and-shoulders crop for chips and horde cards. */
export const zombieIcon = (s: StrainId) => iconUrl(`z-${s}-0`, 2, [2, 2, 22, 18]);
