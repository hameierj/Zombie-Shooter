// Smooth "HD cartoon" art, generated in code with canvas vector drawing. Every sprite keeps the same logical size
// as before (in "art units": a zombie is 26×30, a soldier 20×26) but is rendered at RES× that resolution with
// gradient shading, rounded shapes, a clean dark outline and a soft ground shadow. Phaser scales sprites by
// px / RES, so layout code keeps working in art units. The same canvases are exported as data URLs for the DOM.
import type { ClassId } from '../core/model.ts';
type DamageType = 'physical' | 'fire' | 'shock' | 'toxic' | 'cryo';
type StrainId = string;
type Ctx = CanvasRenderingContext2D;

/** Texture pixels per art unit. */
export const RES = 6;
const INK = '#16131c';

// ---------- colour helpers ----------
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
function mix(hex: string, f: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => (f >= 0 ? c + (255 - c) * f : c * (1 + f)));
  return `#${ch.map((c) => clamp(c).toString(16).padStart(2, '0')).join('')}`;
}
export const lighten = (c: string, f: number) => mix(c, f);
export const darken = (c: string, f: number) => mix(c, -f);
const rgba = (hex: string, a: number) => { const n = Number.parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };

// ---------- canvas + drawing primitives (all coordinates in art units) ----------
export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  return [c, ctx];
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
function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}
function ell(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0) { ctx.beginPath(); ctx.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2); }
/** Fill the current path with a top-left → bottom-right gradient around `base`. */
function shade(ctx: Ctx, base: string, x: number, y: number, w: number, h: number, light = 0.28, dark = 0.32) {
  const g = ctx.createLinearGradient(x, y, x + w * 0.45, y + h);
  g.addColorStop(0, lighten(base, light));
  g.addColorStop(0.45, base);
  g.addColorStop(1, darken(base, dark));
  ctx.fillStyle = g;
  ctx.fill();
}
/** Inner edge line for parts that overlap other parts (gives the cartoon "drawn" look). */
function edge(ctx: Ctx, w = 0.45, col = INK) { ctx.lineWidth = w; ctx.strokeStyle = rgba(col, 0.9); ctx.lineJoin = 'round'; ctx.stroke(); }
/** A rounded limb from (x1,y1) to (x2,y2) with an inked edge and a highlight. */
function limb(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, col: string) {
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = INK; ctx.lineWidth = w + 0.9; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1 - 0.15 * w, y1 - 0.2 * w); ctx.lineTo(x2 - 0.15 * w, y2 - 0.2 * w);
  ctx.strokeStyle = rgba(lighten(col, 0.5), 0.35); ctx.lineWidth = w * 0.35; ctx.stroke();
}
function glow(ctx: Ctx, x: number, y: number, r: number, col: string, a = 0.9) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba('#ffffff', a));
  g.addColorStop(0.25, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

/**
 * Draw a sprite of `w`×`h` art units at RES×, add a smooth dark outline around its silhouette, and optionally a
 * soft ground shadow (drawn under the outline so it isn't outlined itself).
 */
function sprite(w: number, h: number, paint: (ctx: Ctx) => void, opts: { outline?: number; shadow?: [number, number, number, number] } = {}) {
  const [art, a] = makeCanvas(w * RES, h * RES);
  a.scale(RES, RES); a.lineJoin = 'round'; a.lineCap = 'round';
  paint(a);
  const o = opts.outline ?? 0.75;
  const [out, ctx] = makeCanvas(w * RES, h * RES);
  if (opts.shadow) {
    const [sx, sy, rx, ry] = opts.shadow;
    ctx.save(); ctx.scale(RES, RES); ctx.translate(sx, sy); ctx.scale(1, ry / rx);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  if (o > 0) {
    const [sil, s] = makeCanvas(w * RES, h * RES);
    s.drawImage(art, 0, 0); s.globalCompositeOperation = 'source-in'; s.fillStyle = INK; s.fillRect(0, 0, sil.width, sil.height);
    const d = o * RES;
    for (let i = 0; i < 16; i++) { const t = (i / 16) * Math.PI * 2; ctx.drawImage(sil, Math.cos(t) * d, Math.sin(t) * d); }
  }
  ctx.drawImage(art, 0, 0);
  return out;
}

// ---------- zombies (side view, facing left) ----------
interface ZSpec {
  skin: string; shirt: string | null; pants: string; eye: string;
  headW: number; headH: number; torsoW: number; torsoH: number; legH: number; legW: number;
  lean: number; stride: number; belly: number; wide: number;
  extra?: (ctx: Ctx, a: { hx: number; hy: number; tx: number; ty: number; frame: number }) => void;
  front?: (ctx: Ctx, a: { hx: number; hy: number; tx: number; ty: number; frame: number }) => void;
}
const ZOMBIES: Record<string, ZSpec> = {
  shambler: {
    skin: '#8db86a', shirt: '#4e9a3c', pants: '#3c4a36', eye: '#ff3b3b', wide: 7,
    headW: 6.4, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.5, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    extra: (ctx, a) => {
      // torn shirt: a hole showing skin, a blood stain
      ell(ctx, a.tx + 4.6, a.ty + 3.6, 1.2, 0.9); ctx.fillStyle = '#8db86a'; ctx.fill(); edge(ctx, 0.3);
      ell(ctx, a.tx + 2.2, a.ty + 5.4, 1.3, 0.8); ctx.fillStyle = 'rgba(150,20,30,.75)'; ctx.fill();
    },
  },
  runner: {
    skin: '#9ccc70', shirt: '#f0b52c', pants: '#3e6bb0', eye: '#ffe24a', wide: 6,
    headW: 5.4, headH: 5.4, torsoW: 5.8, torsoH: 6.4, legH: 8.2, legW: 2.2, lean: 2, stride: 3.2, belly: 0,
    front: (ctx, a) => {
      // hoodie hood over the head
      ctx.beginPath();
      ctx.moveTo(a.hx + 1, a.hy + 0.6); ctx.quadraticCurveTo(a.hx + 3.4, a.hy - 2.2, a.hx + 6.4, a.hy + 0.4);
      ctx.lineTo(a.hx + 6.8, a.hy + 5.2); ctx.quadraticCurveTo(a.hx + 5.4, a.hy + 2.2, a.hx + 1.6, a.hy + 1.6); ctx.closePath();
      shade(ctx, '#e0a524', a.hx, a.hy - 2, 7, 7); edge(ctx);
    },
  },
  brute: {
    skin: '#7f9e5e', shirt: '#8e2e2a', pants: '#352a2a', eye: '#ff3b3b', wide: 10,
    headW: 7.2, headH: 6.4, torsoW: 11.4, torsoH: 9.6, legH: 6.4, legW: 3.4, lean: 0, stride: 2, belly: 0,
    extra: (ctx, a) => {
      // riot armour plate with hazard stripe and shoulder pad
      rr(ctx, a.tx + 0.8, a.ty + 1, 9.6, 5.4, 1.4); shade(ctx, '#c0443a', a.tx, a.ty, 10, 6); edge(ctx);
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(a.tx + 1.2, a.ty + 3.2, 8.8, 1);
      rr(ctx, a.tx + 6.4, a.ty - 1.4, 6, 3.4, 1.6); shade(ctx, '#d0564a', a.tx + 6, a.ty - 2, 6, 4); edge(ctx);
    },
    front: (ctx, a) => {
      // steel skull cap
      ctx.beginPath(); ctx.ellipse(a.hx + 3.8, a.hy + 1.2, 3.9, 2.4, 0, Math.PI, Math.PI * 2); ctx.closePath();
      shade(ctx, '#98a1ac', a.hx, a.hy - 1.5, 8, 3); edge(ctx);
    },
  },
  spitter: {
    skin: '#74b884', shirt: '#7fd8cc', pants: '#2e4a48', eye: '#6dffe6', wide: 7,
    headW: 6.2, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.4, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    extra: (ctx, a) => {
      // acid stains on the lab coat
      for (const [x, y, r] of [[2.4, 3.2, 1.1], [5.2, 5.6, 0.8]]) { ell(ctx, a.tx + x, a.ty + y, r, r * 0.8); ctx.fillStyle = 'rgba(74,214,200,.6)'; ctx.fill(); }
    },
    front: (ctx, a) => {
      // swollen glowing acid throat sac + drool
      const y = a.hy + 6.4 + (a.frame % 2) * 0.4;
      ell(ctx, a.hx + 2.2, y, 2.3, 2.1);
      const g = ctx.createRadialGradient(a.hx + 1.6, y - 0.6, 0.2, a.hx + 2.2, y, 2.4);
      g.addColorStop(0, '#e6fff8'); g.addColorStop(0.35, '#6ff5df'); g.addColorStop(1, '#1f9e8c');
      ctx.fillStyle = g; ctx.fill(); edge(ctx);
      ctx.beginPath(); ctx.moveTo(a.hx + 0.4, a.hy + 5.6); ctx.quadraticCurveTo(a.hx - 0.4, a.hy + 8, a.hx + 0.2, a.hy + 9.6 - (a.frame % 2));
      ctx.strokeStyle = '#6ff5df'; ctx.lineWidth = 0.6; ctx.stroke();
    },
  },
  burnt: {
    skin: '#3d2b27', shirt: null, pants: '#2a2224', eye: '#ffa030', wide: 7,
    headW: 6.2, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.4, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    extra: (ctx, a) => { for (const [x, y] of [[1.4, 1.6], [3.4, 2.8], [5, 5], [2.4, 5.4]]) glow(ctx, a.tx + x, a.ty + y, 1.1, a.frame % 2 ? '#ffcc4a' : '#ff8a2a'); },
  },
  bloater: {
    skin: '#9c88b4', shirt: '#5c4180', pants: '#3a2e48', eye: '#e0a8ff', wide: 10,
    headW: 6.2, headH: 5.4, torsoW: 11.4, torsoH: 8.6, legH: 5.4, legW: 3.2, lean: 0, stride: 1.2, belly: 5.4,
  },
  // ----- Green family -----
  crawler: {
    skin: '#82a862', shirt: '#5f8f3c', pants: '#34402a', eye: '#ff3b3b', wide: 8,
    headW: 6.2, headH: 5.6, torsoW: 8.4, torsoH: 5.6, legH: 3.2, legW: 2.2, lean: 3, stride: 1, belly: 0,
    extra: (ctx, a) => { ell(ctx, a.tx + 5.6, a.ty + 3.8, 1.6, 0.8); ctx.fillStyle = 'rgba(150,20,30,.75)'; ctx.fill(); ell(ctx, a.tx + 2.4, a.ty + 1.8, 1, 0.7); ctx.fillStyle = '#82a862'; ctx.fill(); },
  },
  office: {
    skin: '#98bc76', shirt: '#cfeac0', pants: '#2a3a2e', eye: '#ff3b3b', wide: 7,
    headW: 6.4, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.5, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    extra: (ctx, a) => {
      ctx.beginPath(); ctx.moveTo(a.tx + 3.4, a.ty + 0.6); ctx.lineTo(a.tx + 4.4, a.ty + 0.6); ctx.lineTo(a.tx + 4.6, a.ty + 5); ctx.lineTo(a.tx + 3.9, a.ty + 5.8); ctx.lineTo(a.tx + 3.2, a.ty + 5); ctx.closePath();
      shade(ctx, '#3aa84a', a.tx + 3, a.ty, 2, 6); edge(ctx, 0.3);
    },
    front: (ctx, a) => { rr(ctx, a.hx + 0.6, a.hy + 1.6, 2.8, 1.4, 0.5); ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 0.45; ctx.stroke(); ctx.fillStyle = 'rgba(160,220,255,.35)'; ctx.fill(); },
  },
  farmer: {
    skin: '#8fb26a', shirt: '#4c9a3e', pants: '#3a5a9a', eye: '#ff3b3b', wide: 7,
    headW: 6.4, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.5, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    extra: (ctx, a) => {
      rr(ctx, a.tx + 0.8, a.ty + 3, 5.8, 4.4, 0.8); shade(ctx, '#3d5ea0', a.tx, a.ty + 3, 6, 4.4); edge(ctx, 0.3);
      for (const x of [1.2, 5.6]) { ctx.fillStyle = '#3d5ea0'; ctx.fillRect(a.tx + x, a.ty + 0.4, 0.8, 3); }
    },
    front: (ctx, a) => {
      ell(ctx, a.hx + 3.2, a.hy + 0.6, 5.6, 1.2); shade(ctx, '#e0bc50', a.hx - 2.4, a.hy - 0.6, 11, 2.4); edge(ctx, 0.35);
      rr(ctx, a.hx + 0.8, a.hy - 2.2, 4.8, 2.8, 1.2); shade(ctx, '#ecc860', a.hx + 0.8, a.hy - 2.2, 4.8, 2.8); edge(ctx, 0.35);
      ctx.fillStyle = '#3a8a34'; ctx.fillRect(a.hx + 0.9, a.hy - 0.2, 4.6, 0.6);
    },
  },
  prisoner: {
    skin: '#8cae6a', shirt: '#6cc24a', pants: '#6cc24a', eye: '#ff3b3b', wide: 7,
    headW: 6.4, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.5, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    extra: (ctx, a) => { rr(ctx, a.tx + 1.2, a.ty + 1.8, 4.6, 2, 0.4); ctx.fillStyle = '#f4f4f4'; ctx.fill(); ctx.fillStyle = '#222'; for (const x of [1.8, 3, 4.2]) ctx.fillRect(a.tx + x, a.ty + 2.3, 0.7, 1); },
    front: (ctx, a) => { ctx.fillStyle = '#3a2a20'; ctx.fillRect(a.hx + 1, a.hy - 0.2, 4.4, 0.8); },
  },
  // ----- Yellow family -----
  jogger: {
    skin: '#a2c874', shirt: '#f2c230', pants: '#22242a', eye: '#ffe24a', wide: 6,
    headW: 5.4, headH: 5.4, torsoW: 5.8, torsoH: 6.4, legH: 8.2, legW: 2.2, lean: 2, stride: 3.2, belly: 0,
    front: (ctx, a) => { rr(ctx, a.hx - 0.2, a.hy + 0.8, 5.8, 1.1, 0.5); shade(ctx, '#ffe27a', a.hx, a.hy + 0.8, 5.8, 1.1); edge(ctx, 0.3); },
  },
  courier: {
    skin: '#9cc070', shirt: '#e8b82a', pants: '#2a3a5a', eye: '#ffe24a', wide: 6,
    headW: 5.4, headH: 5.4, torsoW: 5.8, torsoH: 6.4, legH: 8.2, legW: 2.2, lean: 2, stride: 3.2, belly: 0,
    extra: (ctx, a) => { rr(ctx, a.tx + 4.4, a.ty - 0.4, 4.4, 5.6, 1); shade(ctx, '#8a5a2a', a.tx + 4.4, a.ty - 0.4, 4.4, 5.6); edge(ctx); },
    front: (ctx, a) => { ctx.beginPath(); ctx.ellipse(a.hx + 2.8, a.hy + 1.4, 3.2, 2.4, 0, Math.PI, Math.PI * 2); ctx.closePath(); shade(ctx, '#ffd23f', a.hx, a.hy - 1, 6, 3); edge(ctx, 0.35); },
  },
  skater: {
    skin: '#9fc272', shirt: '#f0c83a', pants: '#5a5a62', eye: '#ffe24a', wide: 6,
    headW: 5.4, headH: 5.4, torsoW: 6, torsoH: 6.4, legH: 8.2, legW: 2.2, lean: 2, stride: 3.2, belly: 0,
    extra: (ctx, a) => { ctx.fillStyle = '#b88a1a'; ctx.fillRect(a.tx + 0.6, a.ty + 3.2, 4.8, 0.8); },
    front: (ctx, a) => { ctx.beginPath(); ctx.ellipse(a.hx + 3, a.hy + 1.2, 3, 2, 0, Math.PI, Math.PI * 2); ctx.closePath(); shade(ctx, '#2a2a30', a.hx, a.hy - 0.8, 6, 2); edge(ctx, 0.35); rr(ctx, a.hx + 5, a.hy + 0.4, 2.2, 0.9, 0.4); shade(ctx, '#2a2a30', a.hx + 5, a.hy + 0.4, 2.2, 0.9); edge(ctx, 0.3); },
  },
  athlete: {
    skin: '#a6c878', shirt: '#ffd23f', pants: '#1a3a8a', eye: '#ffe24a', wide: 6,
    headW: 5.4, headH: 5.4, torsoW: 6, torsoH: 6.4, legH: 8.2, legW: 2.2, lean: 2, stride: 3.2, belly: 0,
    extra: (ctx, a) => { ctx.fillStyle = '#1a3a8a'; ctx.font = 'bold 3.4px sans-serif'; ctx.fillText('23', a.tx + 1, a.ty + 4.6); },
    front: (ctx, a) => { rr(ctx, a.hx - 0.2, a.hy + 0.8, 5.8, 1, 0.5); ctx.fillStyle = '#ffffff'; ctx.fill(); edge(ctx, 0.25); },
  },
  // ----- Red family -----
  bouncer: {
    skin: '#82a062', shirt: '#b2302c', pants: '#2a2a30', eye: '#ff3b3b', wide: 10,
    headW: 7.2, headH: 6.4, torsoW: 11, torsoH: 9.6, legH: 6.4, legW: 3.4, lean: 0, stride: 2, belly: 0,
    extra: (ctx, a) => { ctx.beginPath(); ctx.moveTo(a.tx + 2.4, a.ty + 0.8); ctx.quadraticCurveTo(a.tx + 5.4, a.ty + 4, a.tx + 8.4, a.ty + 0.8); ctx.strokeStyle = '#f0c840'; ctx.lineWidth = 0.7; ctx.stroke(); },
    front: (ctx, a) => { rr(ctx, a.hx - 0.4, a.hy + 1.6, 4.6, 1.4, 0.6); ctx.fillStyle = '#0a0a0c'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(a.hx + 0.4, a.hy + 1.9, 1, 0.4); },
  },
  lumberjack: {
    skin: '#86a264', shirt: '#b8322a', pants: '#3a5a8a', eye: '#ff3b3b', wide: 10,
    headW: 7.2, headH: 6.4, torsoW: 11, torsoH: 9.6, legH: 6.4, legW: 3.4, lean: 0, stride: 2, belly: 0,
    extra: (ctx, a) => {
      ctx.fillStyle = 'rgba(20,20,20,.55)'; for (let y = 1.6; y < 8.5; y += 2.6) ctx.fillRect(a.tx + 0.6, a.ty + y, 10, 0.7);
      ctx.fillStyle = 'rgba(90,20,20,.5)'; for (let x = 2; x < 10; x += 2.6) ctx.fillRect(a.tx + x, a.ty + 0.6, 0.7, 8.4);
    },
    front: (ctx, a) => {
      ctx.beginPath(); ctx.moveTo(a.hx - 1.4, a.hy + 3); ctx.quadraticCurveTo(a.hx - 1, a.hy + 7.4, a.hx + 2.6, a.hy + 6.6); ctx.lineTo(a.hx + 3.6, a.hy + 3.4); ctx.closePath();
      shade(ctx, '#7a4420', a.hx - 1.4, a.hy + 3, 5, 4.4); edge(ctx, 0.3);
      ctx.beginPath(); ctx.ellipse(a.hx + 3.6, a.hy + 1, 3.8, 2.4, 0, Math.PI, Math.PI * 2); ctx.closePath(); shade(ctx, '#2a4a8a', a.hx, a.hy - 1.4, 7.4, 2.4); edge(ctx, 0.35);
    },
  },
  butcher: {
    skin: '#80a062', shirt: '#c8443a', pants: '#3a3030', eye: '#ff3b3b', wide: 10,
    headW: 7.2, headH: 6.4, torsoW: 11, torsoH: 9.6, legH: 6.4, legW: 3.4, lean: 0, stride: 2, belly: 0,
    extra: (ctx, a) => { for (const [x, y, r] of [[2.4, 3.4, 1], [6, 5.6, 1.3], [8.4, 2.4, 0.8]]) { ell(ctx, a.tx + x, a.ty + y, r, r * 0.7); ctx.fillStyle = 'rgba(90,10,14,.75)'; ctx.fill(); } },
    front: (ctx, a) => {
      rr(ctx, a.tx - 10.4, a.ty - 0.6, 4, 4, 0.5); shade(ctx, '#d0d6de', a.tx - 10.4, a.ty - 0.6, 4, 4, 0.4, 0.3); edge(ctx, 0.35);
      rr(ctx, a.tx - 7, a.ty + 2, 2.6, 1, 0.4); ctx.fillStyle = '#5a4028'; ctx.fill();
    },
  },
  juggernaut: {
    skin: '#72905a', shirt: '#7a2626', pants: '#2a2228', eye: '#ff2a2a', wide: 11,
    headW: 8, headH: 7, torsoW: 12, torsoH: 10.4, legH: 6, legW: 4, lean: 0, stride: 1.2, belly: 0,
    extra: (ctx, a) => { rr(ctx, a.tx + 0.4, a.ty + 0.4, 11.2, 6, 2); shade(ctx, '#a83a32', a.tx, a.ty, 12, 6.4, 0.4, 0.35); edge(ctx); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(a.tx + 1, a.ty + 2.6, 10, 0.7); },
    front: (ctx, a) => {
      rr(ctx, a.hx - 0.2, a.hy - 1, 8.4, 7.4, 3); shade(ctx, '#b4443a', a.hx, a.hy - 1, 8.4, 7.4, 0.45, 0.35); edge(ctx);
      rr(ctx, a.hx + 0.2, a.hy + 2.2, 5, 1.1, 0.5); ctx.fillStyle = '#1a0a0a'; ctx.fill(); glow(ctx, a.hx + 1.6, a.hy + 2.7, 1.6, '#ff2a2a', 1);
    },
  },
  // ----- Teal family -----
  labtech: {
    skin: '#7cb488', shirt: '#3fb5a8', pants: '#2a4a4a', eye: '#6dffe6', wide: 7,
    headW: 6.2, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.4, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    extra: (ctx, a) => { rr(ctx, a.tx + 4.4, a.ty + 1, 1, 2.6, 0.4); ctx.fillStyle = '#e8fffa'; ctx.fill(); },
    front: (ctx, a) => { rr(ctx, a.hx + 0.2, a.hy + 1.2, 4, 2, 0.9); shade(ctx, '#3a9a8a', a.hx, a.hy + 1.2, 4, 2); edge(ctx, 0.3); ell(ctx, a.hx + 1.4, a.hy + 1.8, 0.5, 0.4); ctx.fillStyle = '#dffff8'; ctx.fill(); },
  },
  sewer: {
    skin: '#78a876', shirt: '#2a7070', pants: '#2a7070', eye: '#6dffe6', wide: 7,
    headW: 6.2, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.4, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    extra: (ctx, a) => { ctx.fillStyle = '#4ad6c8'; ctx.fillRect(a.tx + 0.6, a.ty + 4.4, 6.2, 0.8); },
    front: (ctx, a) => { ctx.beginPath(); ctx.ellipse(a.hx + 3.2, a.hy + 1.2, 4, 2.8, 0, Math.PI, Math.PI * 2); ctx.closePath(); shade(ctx, '#4ad6c8', a.hx - 0.8, a.hy - 1.6, 8, 2.8); edge(ctx, 0.35); rr(ctx, a.hx - 1.2, a.hy + 0.9, 8.8, 0.8, 0.4); shade(ctx, '#2fa89a', a.hx - 1.2, a.hy + 0.9, 8.8, 0.8); edge(ctx, 0.25); },
  },
  diver: {
    skin: '#74a474', shirt: '#3fc4b4', pants: '#3fc4b4', eye: '#6dffe6', wide: 7,
    headW: 6.2, headH: 6.2, torsoW: 7.4, torsoH: 7.6, legH: 6.4, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    front: (ctx, a) => {
      rr(ctx, a.hx - 0.8, a.hy - 1, 7.8, 7.6, 3); shade(ctx, '#4ad6c8', a.hx - 0.8, a.hy - 1, 7.8, 7.6); edge(ctx);
      rr(ctx, a.hx + 0.2, a.hy + 0.8, 4.4, 2.6, 1); const g = ctx.createLinearGradient(a.hx, a.hy + 0.8, a.hx + 4, a.hy + 3.4); g.addColorStop(0, '#9ffff0'); g.addColorStop(1, '#1f6a6a'); ctx.fillStyle = g; ctx.fill(); edge(ctx, 0.3);
      glow(ctx, a.hx + 1.6, a.hy + 2, 1.2, '#6dffe6', 0.8);
      ell(ctx, a.hx - 0.6, a.hy + 4.6, 1.4, 1.2); shade(ctx, '#2a2a2a', a.hx - 2, a.hy + 3.4, 2.8, 2.4); edge(ctx, 0.3);
    },
  },
  plague: {
    skin: '#70946a', shirt: '#1f6a64', pants: '#173a38', eye: '#6dffe6', wide: 7,
    headW: 6.2, headH: 6.2, torsoW: 7.4, torsoH: 8.2, legH: 5.6, legW: 2.4, lean: 1, stride: 2.2, belly: 0,
    front: (ctx, a) => {
      ctx.beginPath(); ctx.moveTo(a.hx + 0.6, a.hy + 2.2); ctx.quadraticCurveTo(a.hx - 4, a.hy + 3, a.hx - 4.6, a.hy + 5.2); ctx.quadraticCurveTo(a.hx - 1.4, a.hy + 4.6, a.hx + 1, a.hy + 4.6); ctx.closePath();
      shade(ctx, '#e0d6b4', a.hx - 4.6, a.hy + 2.2, 5.6, 3); edge(ctx, 0.35);
      ell(ctx, a.hx + 3, a.hy - 0.2, 5, 0.9); shade(ctx, '#1e1e22', a.hx - 2, a.hy - 1.1, 10, 1.8); edge(ctx, 0.3);
      rr(ctx, a.hx + 0.6, a.hy - 3, 4.8, 3, 0.8); shade(ctx, '#2a2a30', a.hx + 0.6, a.hy - 3, 4.8, 3); edge(ctx, 0.35);
    },
  },
  // ----- Purple family -----
  chef: {
    skin: '#a08eb4', shirt: '#c8aef0', pants: '#2a2a3a', eye: '#e0a8ff', wide: 10,
    headW: 6.2, headH: 5.4, torsoW: 11.4, torsoH: 8.6, legH: 5.4, legW: 3.2, lean: 0, stride: 1.2, belly: 5.4,
    extra: (ctx, a) => { ctx.fillStyle = 'rgba(200,60,60,.8)'; ctx.fillRect(a.tx - 1.6, a.ty + 3.2, 3, 0.8); },
    front: (ctx, a) => { rr(ctx, a.hx + 0.4, a.hy - 3, 5.4, 3.4, 1); shade(ctx, '#ffffff', a.hx, a.hy - 3, 5.4, 3.4, 0.2, 0.15); edge(ctx, 0.35); for (const x of [0.8, 3, 5.2]) { ell(ctx, a.hx + x, a.hy - 3.4, 1.6, 1.4); shade(ctx, '#ffffff', a.hx + x - 1.6, a.hy - 4.8, 3.2, 2.8, 0.2, 0.15); edge(ctx, 0.3); } },
  },
  sumo: {
    skin: '#ad94c0', shirt: null, pants: '#3a2a5a', eye: '#e0a8ff', wide: 11,
    headW: 6.2, headH: 5.4, torsoW: 12, torsoH: 9.4, legH: 5.4, legW: 3.4, lean: 0, stride: 1.2, belly: 6.4,
    extra: (ctx, a) => { rr(ctx, a.tx - 2.4, a.ty + 7.4, 15, 2.2, 0.8); shade(ctx, '#3e2c62', a.tx - 2.4, a.ty + 7.4, 15, 2.2); edge(ctx, 0.35); },
    front: (ctx, a) => { ell(ctx, a.hx + 4, a.hy - 0.6, 1.3, 1.1); shade(ctx, '#1a1a1a', a.hx + 2.7, a.hy - 1.7, 2.6, 2.2); edge(ctx, 0.3); },
  },
  mutant: {
    skin: '#9478b2', shirt: '#4a3a5a', pants: '#2a2238', eye: '#ff70ff', wide: 10,
    headW: 7.2, headH: 6.4, torsoW: 11.4, torsoH: 8.6, legH: 5.4, legW: 3.2, lean: 0, stride: 1.2, belly: 4,
    extra: (ctx, a) => { ell(ctx, a.tx + 9, a.ty - 0.6, 2.6, 2.4); shade(ctx, '#a888c8', a.tx + 6.4, a.ty - 3, 5.2, 4.8); edge(ctx); glow(ctx, a.tx + 9.4, a.ty - 0.8, 1.1, '#ff70ff', 1); },
    front: (ctx, a) => { for (const [x, y] of [[3.6, 1.4], [4.6, 3.4]]) glow(ctx, a.hx + x, a.hy + y, 1, '#ff70ff', 1); },
  },
  abomination: {
    skin: '#82629a', shirt: null, pants: '#2a1e34', eye: '#ff5050', wide: 11,
    headW: 6.2, headH: 5.4, torsoW: 12, torsoH: 10.4, legH: 5.4, legW: 4, lean: 0, stride: 1, belly: 6.4,
    extra: (ctx, a) => {
      ctx.strokeStyle = '#2a1020'; ctx.lineWidth = 0.45;
      ctx.beginPath(); ctx.moveTo(a.tx + 1, a.ty + 2); ctx.lineTo(a.tx + 8, a.ty + 7.6); ctx.stroke();
      for (let i = 0; i < 6; i++) { const x = a.tx + 1.8 + i * 1.15, y = a.ty + 2.6 + i * 0.95; ctx.beginPath(); ctx.moveTo(x - 0.6, y + 0.5); ctx.lineTo(x + 0.6, y - 0.5); ctx.stroke(); }
      for (const x of [3, 6, 9]) { ctx.beginPath(); ctx.moveTo(a.tx + x - 0.7, a.ty + 0.4); ctx.lineTo(a.tx + x, a.ty - 2); ctx.lineTo(a.tx + x + 0.7, a.ty + 0.4); ctx.closePath(); shade(ctx, '#eee6cc', a.tx + x - 0.7, a.ty - 2, 1.4, 2.4); edge(ctx, 0.25); }
    },
  },
};
export const ZOMBIE_W = 26;
export const ZOMBIE_H = 30;

function drawZombie(id: StrainId, frame: number): HTMLCanvasElement {
  const z = ZOMBIES[id];
  const base = ZOMBIE_H - 1.6;
  const cx = 14;
  const bob = frame % 2 ? -0.7 : 0;
  return sprite(ZOMBIE_W, ZOMBIE_H, (ctx) => {
    const skinD = darken(z.skin, 0.28);
    const legTop = base - z.legH;
    const swing = [-1, 0, 1, 0][frame] * z.stride;
    const tx = cx - z.torsoW / 2 - z.lean;
    const ty = legTop - z.torsoH + 1 + bob;
    const hx = cx - z.headW / 2 - z.lean * 2 - 1;
    const hy = ty - z.headH + 1.4;
    const a = { hx, hy, tx, ty, frame };
    // back arm (darker, behind everything)
    limb(ctx, tx + 2, ty + 2.4, tx - 4.2, ty + 4.6 + (frame % 2) * 0.6, 1.8, skinD);
    // legs: back leg then front leg, each with a shoe pointing forward (left)
    const leg = (off: number, col: string) => {
      const fx = cx - 0.6 + off;
      limb(ctx, cx, legTop, fx, base - 0.9, z.legW, col);
      rr(ctx, fx - 2.2, base - 1.7, 3.4, 1.7, 0.8); shade(ctx, '#3a2a22', fx - 2.2, base - 1.7, 3.4, 1.7); edge(ctx, 0.35);
    };
    leg(-swing, darken(z.pants, 0.3));
    leg(swing, z.pants);
    // torso + waistband
    rr(ctx, tx + z.lean * 0.5, legTop - 2 + bob, z.torsoW - z.lean * 0.5, 3, 1);
    shade(ctx, z.pants, tx, legTop - 2, z.torsoW, 3); edge(ctx);
    rr(ctx, tx, ty, z.torsoW, z.torsoH - 0.6, 2);
    shade(ctx, z.shirt ?? z.skin, tx, ty, z.torsoW, z.torsoH); edge(ctx);
    if (z.shirt) {
      // ragged hem
      ctx.beginPath(); ctx.moveTo(tx + 0.4, ty + z.torsoH - 1.4);
      for (let i = 0; i <= 4; i++) ctx.lineTo(tx + 0.4 + (i * (z.torsoW - 0.8)) / 4, ty + z.torsoH - (i % 2 ? 0.4 : 1.4));
      ctx.strokeStyle = rgba(INK, 0.6); ctx.lineWidth = 0.35; ctx.stroke();
    }
    if (z.belly) {
      ell(ctx, tx + 2.4, ty + z.torsoH / 2 + 1, z.belly, z.belly * 0.92);
      const g = ctx.createRadialGradient(tx + 1, ty + z.torsoH / 2 - 1, 0.5, tx + 2.4, ty + z.torsoH / 2 + 1, z.belly);
      g.addColorStop(0, lighten(z.skin, 0.4)); g.addColorStop(0.5, z.skin); g.addColorStop(1, darken(z.skin, 0.3));
      ctx.fillStyle = g; ctx.fill(); edge(ctx);
      for (const [x, y, r] of [[0.4, 1, 0.9], [3.4, 3.6, 0.7], [1.2, 4.6, 0.6], [4.4, 0.4, 0.6]]) {
        ell(ctx, tx + x, ty + z.torsoH / 2 + y - 1, r, r); ctx.fillStyle = '#e3bfff'; ctx.fill(); edge(ctx, 0.25, '#5a2d82');
        ell(ctx, tx + x - r * 0.3, ty + z.torsoH / 2 + y - 1 - r * 0.3, r * 0.3, r * 0.3); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    z.extra?.(ctx, a);
    // neck + head with a jutting jaw
    limb(ctx, hx + 3.6, hy + z.headH - 0.6, tx + z.torsoW / 2 - 0.5, ty + 0.8, 2, skinD);
    rr(ctx, hx, hy, z.headW, z.headH, z.headW * 0.42);
    shade(ctx, z.skin, hx, hy, z.headW, z.headH); edge(ctx);
    rr(ctx, hx - 1.3, hy + z.headH - 3, 3.4, 2.6, 1.1);
    shade(ctx, z.skin, hx - 1.3, hy + z.headH - 3, 3.4, 2.6); edge(ctx, 0.35);
    // mouth with teeth
    ctx.beginPath(); ctx.moveTo(hx - 1.2, hy + z.headH - 1.7); ctx.quadraticCurveTo(hx + 0.6, hy + z.headH - 0.6, hx + 2.2, hy + z.headH - 1.6);
    ctx.strokeStyle = '#3a0d12'; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = '#f4ecd0';
    for (const x of [-0.6, 0.6]) { ctx.beginPath(); ctx.moveTo(hx + x, hy + z.headH - 2); ctx.lineTo(hx + x + 0.5, hy + z.headH - 1.1); ctx.lineTo(hx + x + 1, hy + z.headH - 2); ctx.fill(); }
    // sunken eye with a glow
    ell(ctx, hx + 1.9, hy + 2.2, 1.35, 1.15); ctx.fillStyle = '#1b0e12'; ctx.fill();
    glow(ctx, hx + 1.7, hy + 2.1, 1.5, z.eye, 1);
    // ear + scar
    ell(ctx, hx + z.headW - 1.3, hy + 2.8, 0.7, 1); ctx.fillStyle = darken(z.skin, 0.2); ctx.fill(); edge(ctx, 0.3);
    ctx.beginPath(); ctx.moveTo(hx + 3, hy + 0.7); ctx.lineTo(hx + 4.4, hy + 1.9); ctx.strokeStyle = 'rgba(120,20,30,.8)'; ctx.lineWidth = 0.4; ctx.stroke();
    z.front?.(ctx, a);
    // front arm reaching forward with a clawed hand
    const ay = ty + 2.6 + (frame % 2 ? 0.8 : 0);
    limb(ctx, tx + 2.4, ty + 2.4, tx - 4.6, ay, 2, z.skin);
    ell(ctx, tx - 5.4, ay + 0.4, 1.4, 1.2); shade(ctx, z.skin, tx - 7, ay - 1, 3, 3); edge(ctx, 0.35);
    ctx.strokeStyle = '#f4ecd0'; ctx.lineWidth = 0.35;
    for (const d of [-0.6, 0.4]) { ctx.beginPath(); ctx.moveTo(tx - 6.4, ay + 0.4 + d); ctx.lineTo(tx - 7.4, ay + 0.9 + d); ctx.stroke(); }
  }, { outline: 0.7, shadow: [cx, base, z.wide, 1.6] });
}

// ---------- soldiers (side view, facing right, kneeling) ----------
export const HERO_W = 20;
export const HERO_H = 26;
export const CLASS_ORDER: ClassId[] = ['pistol', 'bow', 'shotgun', 'rifle', 'sniper', 'flamer', 'grenade', 'mg', 'drone', 'mortar', 'tesla', 'rail'];
const HERO_COLORS = [
  { vest: '#6a7a40', helmet: '#56662f', scarf: '#e04848', pants: '#3e4130' },
  { vest: '#4f7a36', helmet: '#3f6229', scarf: '#d8b04c', pants: '#4a3e2c' },
  { vest: '#8a3e2c', helmet: '#3f434c', scarf: '#f2f2f2', pants: '#36363c' },
  { vest: '#3c6490', helmet: '#2f4e72', scarf: '#ffd23f', pants: '#2c3344' },
  { vest: '#77763e', helmet: '#62612e', scarf: '#2a2a2a', pants: '#3f3e2a' },
  { vest: '#5e6066', helmet: '#3f434c', scarf: '#ff7a2a', pants: '#2e3036' },
  { vest: '#5e7240', helmet: '#3f5030', scarf: '#ffb84a', pants: '#3a3a2c' },
  { vest: '#4a4f58', helmet: '#33373e', scarf: '#c0c8d0', pants: '#2a2c32' },   // machine gunner
  { vest: '#2f6a68', helmet: '#24504e', scarf: '#4ad6c8', pants: '#2a3434' },   // drone operator
  { vest: '#7a6440', helmet: '#5e4e30', scarf: '#e0c070', pants: '#3e3426' },   // mortar team
  { vest: '#3e3a6a', helmet: '#2c2a50', scarf: '#9a8aff', pants: '#26243a' },   // tesla trooper
  { vest: '#2e3e5e', helmet: '#e8eef6', scarf: '#5a8cff', pants: '#232a3a' },   // railgunner
];
/** Where the gun's grip sits on the soldier canvas (art units). */
export const HERO_GRIP = { x: 13, y: 13 };

function drawHero(i: number, frame: number): HTMLCanvasElement {
  const col = HERO_COLORS[i % HERO_COLORS.length];
  const base = HERO_H - 1.5;
  const b = frame ? -0.5 : 0;
  return sprite(HERO_W, HERO_H, (ctx) => {
    // kneeling legs: back knee on the ground, front foot planted
    limb(ctx, 8, 17.5, 5.4, base - 1, 2.6, darken(col.pants, 0.25));
    limb(ctx, 5.4, base - 1, 2.2, base - 0.9, 2.2, darken(col.pants, 0.25));
    limb(ctx, 9.6, 17.5, 13.2, 19.4, 2.8, col.pants);
    limb(ctx, 13.2, 19.4, 13.2, base - 1.2, 2.5, col.pants);
    rr(ctx, 12, base - 1.8, 3.8, 1.8, 0.8); shade(ctx, '#2f241c', 12, base - 1.8, 3.8, 1.8); edge(ctx, 0.3);
    rr(ctx, 0.6, base - 1.8, 2.8, 1.7, 0.7); shade(ctx, '#2f241c', 0.6, base - 1.8, 2.8, 1.7); edge(ctx, 0.3);
    // back arm reaching to the gun's fore-grip
    limb(ctx, 8.4, 11.8 + b, 14.6, 13.4 + b, 2, darken(col.vest, 0.25));
    // torso: vest, belt, pouch, scarf
    rr(ctx, 4.8, 9.2 + b, 8.4, 9, 2.4); shade(ctx, col.vest, 4.8, 9.2 + b, 8.4, 9); edge(ctx);
    rr(ctx, 5.6, 11.4 + b, 2.6, 2.6, 0.6); shade(ctx, darken(col.vest, 0.15), 5.6, 11.4 + b, 2.6, 2.6); edge(ctx, 0.3);
    ctx.fillStyle = '#2b2419'; ctx.fillRect(4.9, 16 + b, 8.2, 1.2);
    rr(ctx, 8.6, 15.9 + b, 1.4, 1.4, 0.3); ctx.fillStyle = '#e2bf5a'; ctx.fill();
    rr(ctx, 5, 8.6 + b, 7.6, 1.9, 0.9); shade(ctx, col.scarf, 5, 8.6 + b, 7.6, 1.9); edge(ctx, 0.3);
    // head: face, helmet, goggles
    ell(ctx, 9.8, 6.4 + b, 3.1, 3.2); shade(ctx, '#e0ac82', 6.7, 3.2 + b, 6.2, 6.4); edge(ctx);
    ell(ctx, 12.2, 7.6 + b, 0.5, 0.35); ctx.fillStyle = 'rgba(160,80,60,.6)'; ctx.fill(); // cheek
    ctx.beginPath(); ctx.ellipse(9.4, 5.2 + b, 4.1, 3.6, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath();
    shade(ctx, col.helmet, 5.3, 1.6 + b, 8.2, 3.6); edge(ctx);
    rr(ctx, 4.8, 4.6 + b, 9.4, 1.1, 0.5); shade(ctx, darken(col.helmet, 0.25), 4.8, 4.6 + b, 9.4, 1.1); edge(ctx, 0.3);
    rr(ctx, 10, 5.8 + b, 3.4, 1.8, 0.8);
    const g = ctx.createLinearGradient(10, 5.8 + b, 13.4, 7.6 + b); g.addColorStop(0, '#9ff2ff'); g.addColorStop(1, '#1f5a7a');
    ctx.fillStyle = g; ctx.fill(); edge(ctx, 0.35);
    ell(ctx, 11, 6.3 + b, 0.45, 0.3); ctx.fillStyle = '#fff'; ctx.fill();
    // front arm + hand at the grip
    limb(ctx, 8, 11.4 + b, HERO_GRIP.x, HERO_GRIP.y + b, 2.1, col.vest);
    ell(ctx, HERO_GRIP.x + 0.2, HERO_GRIP.y + b, 1.05, 1.05); shade(ctx, '#e0ac82', 12, 12, 2.2, 2.2); edge(ctx, 0.3);
  }, { outline: 0.6, shadow: [8, base, 7.5, 1.4] });
}

// ---------- guns (facing right; grip at (3,6)) ----------
export interface GunArt { canvas: HTMLCanvasElement; grip: [number, number]; muzzle: [number, number] }
export const GUN_W = 24;
export const GUN_H = 12;
const METAL = '#3e434d', METAL_D = '#262a31', WOOD = '#8a5530';
function part(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, col: string) { rr(ctx, x, y, w, h, r); shade(ctx, col, x, y, w, h, 0.35, 0.35); edge(ctx, 0.3); }
function drawClassGun(cls: ClassId): HTMLCanvasElement {
  return sprite(GUN_W, GUN_H, (ctx) => {
    switch (cls) {
      case 'pistol':
        part(ctx, 3, 6.4, 2.6, 3.8, 0.8, '#4a3626');               // grip
        part(ctx, 2.6, 3.6, 10, 2.8, 0.8, METAL);                  // slide
        ctx.fillStyle = METAL_D; for (let x = 4; x < 7; x += 0.9) ctx.fillRect(x, 3.9, 0.35, 2);
        ctx.beginPath(); ctx.arc(6.6, 7.2, 1.1, 0, Math.PI); ctx.strokeStyle = METAL_D; ctx.lineWidth = 0.5; ctx.stroke();
        ctx.fillStyle = '#c7ced8'; ctx.fillRect(11.6, 3.2, 0.7, 0.5);
        break;
      case 'bow': {
        // compound bow: curved riser and limbs, cams, taut string, nocked arrow
        ctx.beginPath(); ctx.moveTo(8, 0.6); ctx.quadraticCurveTo(10.6, 6, 8, 11.4);
        ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.stroke(); ctx.strokeStyle = '#4c6a32'; ctx.lineWidth = 1.4; ctx.stroke();
        for (const y of [0.8, 11.2]) { ell(ctx, 8, y, 0.9, 0.9); ctx.fillStyle = '#b8c0ca'; ctx.fill(); edge(ctx, 0.3); }
        ctx.beginPath(); ctx.moveTo(8, 0.8); ctx.lineTo(3.2, 6); ctx.lineTo(8, 11.2); ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 0.35; ctx.stroke();
        part(ctx, 3, 5.6, 16, 0.8, 0.4, '#8a5a2e');
        ctx.beginPath(); ctx.moveTo(19, 4.8); ctx.lineTo(21, 6); ctx.lineTo(19, 7.2); ctx.closePath(); shade(ctx, '#d3d8de', 19, 4.8, 2, 2.4); edge(ctx, 0.3);
        ctx.fillStyle = '#ff5a5a'; ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(5, 4.6); ctx.lineTo(5.4, 6); ctx.fill(); ctx.beginPath(); ctx.moveTo(3, 6); ctx.lineTo(5, 7.4); ctx.lineTo(5.4, 6); ctx.fill();
        break;
      }
      case 'shotgun':
        part(ctx, 0.6, 5, 5.4, 3.2, 1.2, WOOD);
        part(ctx, 5.4, 4, 4.6, 3, 0.8, METAL);
        part(ctx, 9.6, 4, 10.6, 1.4, 0.6, METAL_D);
        part(ctx, 9.6, 5.5, 9.4, 1.2, 0.6, METAL);
        part(ctx, 11, 5.8, 5.2, 2.4, 1, WOOD);                       // pump
        break;
      case 'rifle':
        part(ctx, 0.6, 5, 4.6, 3, 1, '#2c3036');
        part(ctx, 5, 3.8, 9.6, 3.2, 0.8, METAL);
        part(ctx, 8.4, 6.6, 2.2, 3.6, 0.6, METAL_D);                 // magazine
        part(ctx, 14.2, 4.2, 4.8, 2.2, 0.6, '#30343b');              // handguard
        part(ctx, 18.6, 4.8, 3.2, 0.9, 0.4, METAL_D);                // barrel
        part(ctx, 7.6, 2.4, 4, 1.4, 0.6, METAL_D);                   // sight rail
        ell(ctx, 11.4, 3.1, 0.45, 0.45); ctx.fillStyle = '#ff5a5a'; ctx.fill();
        break;
      case 'sniper':
        part(ctx, 0, 5, 5.4, 3, 1.2, '#6a5530');
        part(ctx, 5, 4.6, 8.4, 2.4, 0.7, METAL);
        part(ctx, 13, 5, 10, 1, 0.4, METAL_D);
        part(ctx, 5.6, 1.4, 7.8, 2.2, 1.1, '#1f2227');               // scope
        ell(ctx, 13, 2.5, 0.9, 1); ctx.fillStyle = '#7fe8ff'; ctx.fill(); edge(ctx, 0.3);
        ell(ctx, 12.8, 2.2, 0.3, 0.3); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.strokeStyle = METAL_D; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(16, 6); ctx.lineTo(15, 9); ctx.moveTo(16.4, 6); ctx.lineTo(17.6, 9); ctx.stroke();
        break;
      case 'flamer':
        ell(ctx, 6, 8, 3.2, 2.4); shade(ctx, '#c8352c', 2.8, 5.6, 6.4, 4.8, 0.4, 0.35); edge(ctx);
        ell(ctx, 5, 7.2, 0.9, 0.5); ctx.fillStyle = 'rgba(255,255,255,.6)'; ctx.fill();
        part(ctx, 3, 3.8, 12.4, 2.8, 1, '#5d6370');
        part(ctx, 15, 3, 4.2, 4, 1, '#3a3e46');
        glow(ctx, 20.4, 5, 1.6, '#ff8a2a', 1);
        break;
      case 'mg':
        part(ctx, 0.4, 5, 4.6, 3.2, 1, '#2c3036');
        part(ctx, 4.6, 3.4, 9, 3.6, 0.9, METAL);
        rr(ctx, 6.4, 6.6, 3.6, 3.8, 0.8); shade(ctx, '#6a5a2a', 6.4, 6.6, 3.6, 3.8); edge(ctx, 0.3);           // ammo box
        ctx.strokeStyle = '#d6b44a'; ctx.lineWidth = 0.6; ctx.setLineDash([0.6, 0.4]); ctx.beginPath(); ctx.moveTo(8.2, 6.6); ctx.quadraticCurveTo(9.4, 5.4, 11, 5); ctx.stroke(); ctx.setLineDash([]);
        part(ctx, 13.4, 3.8, 3.6, 2.8, 0.8, '#30343b');                                                     // shroud
        part(ctx, 16.8, 4.6, 6.2, 1.2, 0.5, METAL_D);
        ctx.strokeStyle = METAL_D; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(15, 6.4); ctx.lineTo(14, 9.4); ctx.moveTo(15.4, 6.4); ctx.lineTo(16.6, 9.4); ctx.stroke();
        break;
      case 'drone':
        rr(ctx, 2, 5.4, 6.4, 4, 1.2); shade(ctx, '#2f3540', 2, 5.4, 6.4, 4); edge(ctx, 0.35);                  // controller
        rr(ctx, 3, 6.2, 4.4, 2.2, 0.5); ctx.fillStyle = '#4ad6c8'; ctx.fill(); glow(ctx, 5.2, 7.3, 1.4, '#4ad6c8', 0.6);
        ctx.strokeStyle = METAL_D; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(7.6, 5.6); ctx.lineTo(9, 2.6); ctx.stroke();
        rr(ctx, 12, 2.4, 6, 2, 0.9); shade(ctx, '#5a6474', 12, 2.4, 6, 2); edge(ctx, 0.3);                       // hovering drone
        for (const x of [11.6, 18.4]) { ell(ctx, x, 2, 1.6, 0.4); ctx.fillStyle = 'rgba(200,220,240,.75)'; ctx.fill(); }
        glow(ctx, 15, 3.4, 0.9, '#ff5a5a', 1);
        break;
      case 'mortar':
        rr(ctx, 2, 8.4, 9, 1.6, 0.6); shade(ctx, '#4a4e56', 2, 8.4, 9, 1.6); edge(ctx, 0.3);                     // base plate
        ctx.save(); ctx.translate(6, 8.6); ctx.rotate(-0.7);
        rr(ctx, 0, -1.4, 12, 2.8, 1); shade(ctx, '#5a6a3e', 0, -1.4, 12, 2.8, 0.4, 0.35); edge(ctx, 0.35);
        rr(ctx, 10.8, -1.7, 1.6, 3.4, 0.4); shade(ctx, '#3e4a2a', 10.8, -1.7, 1.6, 3.4); edge(ctx, 0.3);
        ctx.restore();
        ctx.strokeStyle = METAL_D; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(9.4, 4.4); ctx.lineTo(12.4, 9.6); ctx.stroke();
        break;
      case 'rail':
        part(ctx, 0.6, 5, 4.4, 3, 1, '#2a3040');
        part(ctx, 4.6, 3.6, 7.4, 3.8, 1.2, '#3a4660');                                                    // capacitor body
        for (let x = 5.6; x < 11.4; x += 1.6) glow(ctx, x, 5.5, 0.9, '#5a8cff', 0.9);
        part(ctx, 11.6, 3.4, 11, 1, 0.4, '#c8d2e0');                                                       // twin rails
        part(ctx, 11.6, 6.6, 11, 1, 0.4, '#c8d2e0');
        ctx.fillStyle = 'rgba(120,180,255,.55)'; ctx.fillRect(12, 4.6, 10.2, 1.8);
        glow(ctx, 22.4, 5.5, 1.6, '#8ac0ff', 0.9);
        break;
      case 'tesla':
        part(ctx, 1, 5, 4.6, 3, 1, '#2c2a40');
        part(ctx, 5, 3.6, 8, 3.6, 1.2, '#4a4870');
        for (let x = 6.2; x < 12.6; x += 1.4) { ctx.fillStyle = '#c8a050'; ctx.fillRect(x, 3.2, 0.7, 4.4); }       // copper coils
        part(ctx, 12.8, 4.4, 4.4, 2, 0.8, '#5a5880');
        ell(ctx, 18.8, 5.4, 2, 2); const tg = ctx.createRadialGradient(18.4, 4.9, 0.2, 18.8, 5.4, 2); tg.addColorStop(0, '#ffffff'); tg.addColorStop(0.4, '#b8b0ff'); tg.addColorStop(1, '#4a3aa8'); ctx.fillStyle = tg; ctx.fill(); edge(ctx, 0.3);
        glow(ctx, 18.8, 5.4, 3.2, '#9a8aff', 0.55);
        break;
      case 'grenade':
        part(ctx, 0.8, 5, 5, 3, 1.1, '#4e6034');
        ell(ctx, 8.4, 6.4, 3.1, 3.1); shade(ctx, METAL, 5.3, 3.3, 6.2, 6.2, 0.4, 0.35); edge(ctx);
        for (let k = 0; k < 6; k++) { const t = (k / 6) * Math.PI * 2; ell(ctx, 8.4 + Math.cos(t) * 1.8, 6.4 + Math.sin(t) * 1.8, 0.55, 0.55); ctx.fillStyle = METAL_D; ctx.fill(); }
        part(ctx, 10.6, 3.2, 9, 4.6, 1.4, '#566b3a');
        part(ctx, 19, 3.8, 2.2, 3.4, 0.6, METAL_D);
        break;
    }
  }, { outline: 0.45 });
}
function drawGun(type: DamageType): GunArt {
  const map: Record<DamageType, ClassId> = { physical: 'rifle', fire: 'flamer', shock: 'rifle', toxic: 'grenade', cryo: 'sniper' };
  return { canvas: drawClassGun(map[type]), grip: [3, 6], muzzle: [21, 5] };
}

// ---------- shredder ----------
function drawShredHousing(): HTMLCanvasElement {
  return sprite(16, 16, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 16, 0);
    g.addColorStop(0, '#4b5460'); g.addColorStop(0.5, '#6d7886'); g.addColorStop(1, '#3f4650');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 16);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(0, 7.6, 16, 0.7);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(0, 8.3, 16, 0.4);
    for (const [x, y] of [[2, 2], [14, 2], [2, 12.6], [14, 12.6]]) { ell(ctx, x, y, 0.8, 0.8); shade(ctx, '#c0c8d2', x - 1, y - 1, 2, 2); }
    rr(ctx, 5.6, 3, 4.8, 2, 0.8); ctx.fillStyle = '#2c323a'; ctx.fill();
    rr(ctx, 5.6, 10.6, 4.8, 2, 0.8); ctx.fillStyle = '#2c323a'; ctx.fill();
  }, { outline: 0 });
}
function drawShredTeeth(): HTMLCanvasElement {
  return sprite(10, 8, (ctx) => {
    ctx.fillStyle = '#1c2026'; ctx.fillRect(0, 0, 10, 8);
    ctx.fillStyle = '#2c323a'; ctx.fillRect(0, 0, 3, 8);
    ctx.beginPath(); ctx.moveTo(3, 0.8); ctx.lineTo(9.8, 1.6); ctx.lineTo(3, 6.6); ctx.closePath();
    const g = ctx.createLinearGradient(3, 0, 9, 6); g.addColorStop(0, '#f4f7fa'); g.addColorStop(1, '#7f8a96');
    ctx.fillStyle = g; ctx.fill(); edge(ctx, 0.3);
    ell(ctx, 4, 6.2, 0.7, 0.4); ctx.fillStyle = 'rgba(140,20,30,.8)'; ctx.fill();
  }, { outline: 0 });
}
function drawHazard(w: number, h: number): HTMLCanvasElement {
  return sprite(w, h, (ctx) => {
    rr(ctx, 0.3, 0.3, w - 0.6, h - 0.6, 1); ctx.save(); ctx.clip();
    ctx.fillStyle = '#f2c82c'; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d1d1f';
    for (let x = -h; x < w + h; x += 4) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 2, h); ctx.lineTo(x + 2 + h, 0); ctx.lineTo(x + h, 0); ctx.fill(); }
    const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,.35)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }, { outline: 0.35 });
}

// ---------- small sprites ----------
function drawVial(color: string): HTMLCanvasElement {
  return sprite(8, 11, (ctx) => {
    rr(ctx, 2.4, 0.6, 3.2, 2.2, 0.6); shade(ctx, '#9a6a42', 2.4, 0.6, 3.2, 2.2); edge(ctx, 0.3);
    ctx.beginPath(); ctx.moveTo(2.7, 2.6); ctx.lineTo(5.3, 2.6); ctx.lineTo(5.3, 4); ctx.quadraticCurveTo(7.2, 5, 7.2, 7.2);
    ctx.quadraticCurveTo(7.2, 10.4, 4, 10.4); ctx.quadraticCurveTo(0.8, 10.4, 0.8, 7.2); ctx.quadraticCurveTo(0.8, 5, 2.7, 4); ctx.closePath();
    ctx.fillStyle = 'rgba(220,240,248,.55)'; ctx.fill(); edge(ctx, 0.35);
    ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(0, 5.4, 0, 10.4); g.addColorStop(0, lighten(color, 0.3)); g.addColorStop(1, darken(color, 0.25));
    ctx.fillStyle = g; ctx.fillRect(0, 5.6, 8, 5);
    ctx.restore();
    ell(ctx, 2.6, 6.6, 0.5, 1.2, -0.3); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
  }, { outline: 0.4 });
}
function drawCharm(gem: string): HTMLCanvasElement {
  return sprite(10, 12, (ctx) => {
    ell(ctx, 5, 1.6, 1.2, 1); ctx.strokeStyle = '#d6b452'; ctx.lineWidth = 0.5; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, 2.4); ctx.lineTo(8.6, 5.4); ctx.lineTo(5, 11.4); ctx.lineTo(1.4, 5.4); ctx.closePath();
    shade(ctx, '#d6b452', 1.4, 2.4, 7.2, 9); edge(ctx, 0.35);
    ctx.beginPath(); ctx.moveTo(5, 3.6); ctx.lineTo(7.4, 5.6); ctx.lineTo(5, 9.8); ctx.lineTo(2.6, 5.6); ctx.closePath();
    const g = ctx.createLinearGradient(2.6, 3.6, 7.4, 9.8); g.addColorStop(0, lighten(gem, 0.55)); g.addColorStop(0.5, gem); g.addColorStop(1, darken(gem, 0.35));
    ctx.fillStyle = g; ctx.fill();
    ctx.beginPath(); ctx.moveTo(5, 3.8); ctx.lineTo(3.4, 5.6); ctx.lineTo(4.6, 5.6); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
  }, { outline: 0.4 });
}
export const RARITY_TRIM: Record<string, string> = {
  common: '#c4c4c4', uncommon: '#5fd068', rare: '#4aa3ff', epic: '#b66bff', legendary: '#ffb84a',
};
function drawCrate(trim: string): HTMLCanvasElement {
  return sprite(12, 11, (ctx) => {
    rr(ctx, 1, 2.4, 10, 7.8, 1.2); shade(ctx, '#9a6634', 1, 2.4, 10, 7.8); edge(ctx);
    ctx.strokeStyle = rgba('#4a2c12', 0.6); ctx.lineWidth = 0.35;
    for (const y of [5, 7.6]) { ctx.beginPath(); ctx.moveTo(1.4, y); ctx.lineTo(10.6, y); ctx.stroke(); }
    rr(ctx, 0.8, 1.6, 10.4, 2.4, 0.9); shade(ctx, trim, 0.8, 1.6, 10.4, 2.4, 0.45, 0.3); edge(ctx, 0.35);
    rr(ctx, 1, 2.4, 1.4, 7.8, 0.5); shade(ctx, trim, 1, 2.4, 1.4, 7.8, 0.4, 0.3);
    rr(ctx, 9.6, 2.4, 1.4, 7.8, 0.5); shade(ctx, trim, 9.6, 2.4, 1.4, 7.8, 0.4, 0.3);
    rr(ctx, 5, 3.4, 2, 2.2, 0.5); shade(ctx, '#f0d878', 5, 3.4, 2, 2.2); edge(ctx, 0.3);
  }, { outline: 0.45 });
}
function drawMod(led: string): HTMLCanvasElement {
  return sprite(12, 9, (ctx) => {
    rr(ctx, 3, 0.8, 1.6, 1.6, 0.3); shade(ctx, '#3e4650', 3, 0.8, 1.6, 1.6);
    rr(ctx, 7, 0.8, 1.6, 1.6, 0.3); shade(ctx, '#3e4650', 7, 0.8, 1.6, 1.6);
    rr(ctx, 1, 2, 10, 5.6, 1.3); shade(ctx, '#6c7684', 1, 2, 10, 5.6); edge(ctx);
    rr(ctx, 2.2, 4.4, 3.6, 1, 0.4); ctx.fillStyle = '#2b3038'; ctx.fill();
    glow(ctx, 8.2, 4.8, 1.8, led, 1);
  }, { outline: 0.4 });
}

// ---------- node / perk icons (14×14) ----------
const I = (paint: (c: Ctx) => void) => () => sprite(14, 14, paint, { outline: 0.5 });
function star(ctx: Ctx, cx: number, cy: number, r1: number, r2: number, n: number) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, t = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2; ctx.lineTo(cx + Math.cos(t) * r, cy + Math.sin(t) * r); }
  ctx.closePath();
}
const ICONS: Record<string, () => HTMLCanvasElement> = {
  dmg: I((c) => { // bullet
    c.beginPath(); c.moveTo(5, 5); c.quadraticCurveTo(5, 1, 7, 0.8); c.quadraticCurveTo(9, 1, 9, 5); c.closePath(); shade(c, '#d6dbe2', 5, 0.8, 4, 4.2); edge(c, 0.35);
    rr(c, 4.8, 5, 4.4, 7.6, 0.6); shade(c, '#e2ae46', 4.8, 5, 4.4, 7.6); edge(c, 0.35);
  }),
  spd: I((c) => { for (const o of [1.4, 6.4]) { c.beginPath(); c.moveTo(o, 2.4); c.lineTo(o + 5, 7); c.lineTo(o, 11.6); c.lineTo(o + 1.8, 7); c.closePath(); shade(c, '#ffd23f', o, 2.4, 5, 9.2); edge(c, 0.35); } }),
  critdmg: I((c) => { star(c, 7, 7, 6.4, 2.8, 8); shade(c, '#ff6a4a', 0.6, 0.6, 12.8, 12.8); edge(c, 0.35); ell(c, 7, 7, 2.2, 2.2); c.fillStyle = '#ffe14a'; c.fill(); }),
  crit: I((c) => {
    ell(c, 7, 7, 5.4, 5.4); c.strokeStyle = '#ff5a5a'; c.lineWidth = 1.3; c.stroke();
    c.strokeStyle = '#f0f0f0'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(7, 0.6); c.lineTo(7, 4.4); c.moveTo(7, 9.6); c.lineTo(7, 13.4); c.moveTo(0.6, 7); c.lineTo(4.4, 7); c.moveTo(9.6, 7); c.lineTo(13.4, 7); c.stroke();
    ell(c, 7, 7, 1, 1); c.fillStyle = '#ff3030'; c.fill();
  }),
  range: I((c) => { rr(c, 1, 5, 8, 4, 1); shade(c, '#3e434d', 1, 5, 8, 4); edge(c, 0.35); rr(c, 8.6, 3.6, 4.2, 6.8, 1.4); shade(c, '#5e6876', 8.6, 3.6, 4.2, 6.8); edge(c, 0.35); ell(c, 11.4, 7, 1.2, 2.2); c.fillStyle = '#7fe8ff'; c.fill(); ell(c, 11, 6.2, 0.4, 0.6); c.fillStyle = '#fff'; c.fill(); }),
  'slot-mod': I((c) => { star(c, 7, 7, 6.2, 4.8, 8); shade(c, '#a3adb9', 0.8, 0.8, 12.4, 12.4); edge(c, 0.35); ell(c, 7, 7, 2.2, 2.2); c.fillStyle = '#2f343c'; c.fill(); }),
  'slot-charm': () => drawCharm('#b77bff'),
  spawn: I((c) => { rr(c, 2.4, 0.8, 9.2, 2, 0.8); shade(c, '#d6b452', 2.4, 0.8, 9.2, 2); rr(c, 2.4, 11.2, 9.2, 2, 0.8); shade(c, '#d6b452', 2.4, 11.2, 9.2, 2); c.beginPath(); c.moveTo(3.4, 2.8); c.lineTo(10.6, 2.8); c.lineTo(7.4, 7); c.lineTo(10.6, 11.2); c.lineTo(3.4, 11.2); c.lineTo(6.6, 7); c.closePath(); c.fillStyle = 'rgba(230,240,248,.6)'; c.fill(); edge(c, 0.35); ell(c, 7, 9.8, 2.4, 1); c.fillStyle = '#7ddc5a'; c.fill(); }),
  dna: I((c) => { c.lineWidth = 1.1; for (const [col, ph] of [['#ff5a5a', 0], ['#7fe8ff', Math.PI]] as const) { c.beginPath(); for (let y = 0.6; y <= 13.4; y += 0.4) c.lineTo(7 + Math.sin(y / 2 + ph) * 3.4, y); c.strokeStyle = col; c.stroke(); } c.strokeStyle = '#c0c8d2'; c.lineWidth = 0.5; for (let y = 1.5; y < 13; y += 2.2) { c.beginPath(); c.moveTo(7 + Math.sin(y / 2) * 3.4, y); c.lineTo(7 - Math.sin(y / 2) * 3.4, y); c.stroke(); } }),
  auto: I((c) => { ell(c, 7, 8, 5, 4.6); shade(c, '#c84a3a', 2, 3.4, 10, 9.2); edge(c, 0.35); ell(c, 7, 6.4, 4.4, 1.6); shade(c, '#e8c88a', 2.6, 4.8, 8.8, 3.2); edge(c, 0.3); c.strokeStyle = '#8a5a2e'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(2, 1); c.lineTo(6, 5); c.moveTo(12, 1); c.lineTo(8, 5); c.stroke(); }),
  loot: () => drawCrate('#ffb84a'),
  fast: I((c) => { for (const o of [1.2, 6.6]) { c.beginPath(); c.moveTo(o, 2); c.lineTo(o + 5.6, 7); c.lineTo(o, 12); c.closePath(); shade(c, '#7ddc5a', o, 2, 5.6, 10); edge(c, 0.35); } }),
  luck: I((c) => { for (const [x, y] of [[4.4, 4.4], [9.6, 4.4], [4.4, 9.6], [9.6, 9.6]]) { ell(c, x, y, 2.8, 2.8); shade(c, '#5fd068', x - 2.8, y - 2.8, 5.6, 5.6); edge(c, 0.35); } ell(c, 7, 7, 1, 1); c.fillStyle = '#2f7a2f'; c.fill(); }),
  equip: I((c) => { rr(c, 2.4, 3.4, 9.2, 9.4, 1.8); shade(c, '#8a6440', 2.4, 3.4, 9.2, 9.4); edge(c, 0.35); rr(c, 4.6, 1.2, 4.8, 2.6, 1); c.strokeStyle = '#5a4028'; c.lineWidth = 0.8; c.stroke(); rr(c, 3.6, 7.4, 6.8, 2.8, 0.8); shade(c, '#a07a52', 3.6, 7.4, 6.8, 2.8); edge(c, 0.3); }),
};

// ---------- ground ----------
export interface GroundLayout { w: number; h: number; roadTop: number; roadBot: number; bunkerRight: number }

/** Paint the whole battlefield background. `scale` = device pixels per art unit (the canvas is drawn at screen res). */
export function drawGround(L: GroundLayout, scale = 1): HTMLCanvasElement {
  const [c, ctx] = makeCanvas(L.w * scale, L.h * scale);
  ctx.scale(scale, scale);
  const r = rng(1337);
  const roadH = L.roadBot - L.roadTop;
  // grass verges with soft tonal variation
  let g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, '#3f6a2c'); g.addColorStop(0.5, '#4a7a34'); g.addColorStop(1, '#3a6228');
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
  for (let i = 0; i < (L.w * L.h) / 260; i++) {
    const x = r() * L.w, y = r() * L.h, rad = 4 + r() * 10;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const col = r() < 0.5 ? '96,150,60' : '40,80,30';
    gg.addColorStop(0, `rgba(${col},.18)`); gg.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = gg; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // grass blades
  ctx.lineCap = 'round';
  for (let i = 0; i < L.w * 1.4; i++) {
    const x = L.bunkerRight + r() * (L.w - L.bunkerRight);
    const top = r() < 0.5;
    const y = top ? r() * (L.roadTop - 2) : L.roadBot + 2 + r() * (L.h - L.roadBot - 2);
    ctx.strokeStyle = r() < 0.5 ? 'rgba(120,180,70,.7)' : 'rgba(60,110,40,.7)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x + 0.4, y + 1, x + (r() - 0.5) * 2, y); ctx.stroke();
  }
  // asphalt road with soft lighting and fine grain
  g = ctx.createLinearGradient(0, L.roadTop, 0, L.roadBot);
  g.addColorStop(0, '#3a3d45'); g.addColorStop(0.5, '#454852'); g.addColorStop(1, '#383b42');
  ctx.fillStyle = g; ctx.fillRect(0, L.roadTop, L.w, roadH);
  for (let i = 0; i < (L.w * roadH) / 3; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.08)';
    ctx.fillRect(r() * L.w, L.roadTop + r() * roadH, 0.6, 0.6);
  }
  // tyre tracks
  for (const f of [0.3, 0.7]) {
    g = ctx.createLinearGradient(0, L.roadTop + roadH * f - 6, 0, L.roadTop + roadH * f + 6);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.5, 'rgba(0,0,0,.12)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, L.roadTop + roadH * f - 6, L.w, 12);
  }
  // curbs
  const curb = (y: number, flip: boolean) => {
    g = ctx.createLinearGradient(0, y, 0, y + 2.4);
    g.addColorStop(0, flip ? '#6e7076' : '#c9cace'); g.addColorStop(1, flip ? '#c9cace' : '#6e7076');
    ctx.fillStyle = g; ctx.fillRect(0, y, L.w, 2.4);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let x = 0; x < L.w; x += 12) ctx.fillRect(x, y, 0.4, 2.4);
  };
  curb(L.roadTop - 2.4, false);
  curb(L.roadBot, true);
  // centre dashes
  const mid = (L.roadTop + L.roadBot) / 2;
  for (let x = L.bunkerRight + 8; x < L.w; x += 16) { rr(ctx, x, mid - 0.6, 8, 1.2, 0.6); ctx.fillStyle = r() < 0.3 ? 'rgba(220,200,110,.45)' : 'rgba(240,215,110,.8)'; ctx.fill(); }
  // cracks
  ctx.strokeStyle = 'rgba(20,20,24,.6)'; ctx.lineWidth = 0.45;
  for (let i = 0; i < L.w / 16; i++) {
    let x = r() * L.w, y = L.roadTop + r() * roadH;
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let s = 0; s < 4 + r() * 4; s++) { x += 1 + r() * 2.5; y += (r() - 0.4) * 2; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  // blood splats
  for (let i = 0; i < L.w / 34; i++) {
    const x = L.bunkerRight + 10 + r() * (L.w - L.bunkerRight - 10), y = L.roadTop + 4 + r() * (roadH - 8);
    for (let k = 0; k < 4; k++) {
      const rx = 0.8 + r() * 2.6, ox = (r() - 0.5) * 4, oy = (r() - 0.5) * 2.2;
      ell(ctx, x + ox, y + oy, rx, rx * 0.6); ctx.fillStyle = `rgba(${110 + r() * 40},18,26,${0.45 + r() * 0.3})`; ctx.fill();
    }
  }
  // bunker floor: concrete slabs
  g = ctx.createLinearGradient(0, 0, L.bunkerRight, 0);
  g.addColorStop(0, '#5f605c'); g.addColorStop(1, '#73746f');
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.bunkerRight, L.h);
  ctx.strokeStyle = 'rgba(40,40,38,.45)'; ctx.lineWidth = 0.4;
  for (let y = 0; y < L.h; y += 10) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L.bunkerRight, y); ctx.stroke(); }
  for (let y = 0; y < L.h; y += 10) for (let x = (y / 10) % 2 ? 6 : 0; x < L.bunkerRight; x += 12) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 10); ctx.stroke(); }
  for (let i = 0; i < (L.bunkerRight * L.h) / 40; i++) { ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; ctx.fillRect(r() * L.bunkerRight, r() * L.h, 0.8, 0.8); }
  // props on the verges and a few on the road
  const decos = [drawTire, drawBarrel, drawCone, drawBones, drawSkull];
  const put = (cv: HTMLCanvasElement, x: number, y: number) => ctx.drawImage(cv, x, y, cv.width / RES, cv.height / RES);
  const place = (y0: number, y1: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const d = decos[Math.floor(r() * decos.length)]();
      const h = d.height / RES;
      put(d, L.bunkerRight + 10 + r() * Math.max(1, L.w - L.bunkerRight - 20), y0 + r() * Math.max(1, y1 - y0 - h));
    }
  };
  place(0, L.roadTop - 2.4, Math.max(2, Math.floor(L.w / 34)));
  place(L.roadBot + 2.4, L.h, Math.max(2, Math.floor(L.w / 34)));
  for (let i = 0; i < L.w / 70; i++) {
    const d = [drawBones, drawSkull, drawTire][Math.floor(r() * 3)]();
    put(d, L.bunkerRight + 20 + r() * (L.w - L.bunkerRight - 30), L.roadTop + 3 + r() * (roadH - 10));
  }
  // sandbag wall along the bunker edge
  const bag = sprite(9, 6, (b) => { ell(b, 4.5, 3, 4, 2.4); shade(b, '#c4a46c', 0.5, 0.6, 8, 4.8); b.strokeStyle = 'rgba(90,70,40,.5)'; b.lineWidth = 0.35; b.beginPath(); b.moveTo(4.5, 1); b.lineTo(4.5, 5); b.stroke(); }, { outline: 0.35 });
  for (let y = -3; y < L.h; y += 4.4) put(bag, L.bunkerRight - 9.4 + (Math.round(y / 4.4) % 2 ? 1.2 : 0), y);
  // soft vignette
  g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, 'rgba(0,0,0,.3)'); g.addColorStop(0.14, 'rgba(0,0,0,0)'); g.addColorStop(0.86, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
  g = ctx.createLinearGradient(L.w * 0.75, 0, L.w, 0);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
  ctx.fillStyle = g; ctx.fillRect(L.w * 0.75, 0, L.w * 0.25, L.h);
  return c;
}
const drawTire = () => sprite(10, 7, (c) => { ell(c, 5, 3.5, 4.4, 2.8); shade(c, '#2a2a30', 0.6, 0.7, 8.8, 5.6); ell(c, 5, 3.5, 1.8, 1); c.fillStyle = '#15151a'; c.fill(); }, { outline: 0.35 });
const drawBarrel = () => sprite(8, 10, (c) => { rr(c, 1, 0.8, 6, 8.6, 1); shade(c, '#a8452a', 1, 0.8, 6, 8.6); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(1, 3.2, 6, 0.6); c.fillRect(1, 6.4, 6, 0.6); ell(c, 4, 1.4, 2.8, 0.7); c.fillStyle = '#c86a4a'; c.fill(); }, { outline: 0.35 });
const drawCone = () => sprite(7, 9, (c) => { c.beginPath(); c.moveTo(3.5, 0.6); c.lineTo(5.6, 7.4); c.lineTo(1.4, 7.4); c.closePath(); shade(c, '#ff7a2a', 1.4, 0.6, 4.2, 6.8); c.fillStyle = '#f4f4f4'; c.fillRect(2.3, 3.6, 2.4, 1.2); rr(c, 0.6, 7.2, 5.8, 1.2, 0.4); shade(c, '#d65a1a', 0.6, 7.2, 5.8, 1.2); }, { outline: 0.35 });
const drawBones = () => sprite(9, 5, (c) => { c.strokeStyle = '#ece6d2'; c.lineWidth = 1; c.beginPath(); c.moveTo(2, 2.5); c.lineTo(7, 2.5); c.stroke(); for (const [x, y] of [[1.6, 1.8], [1.6, 3.2], [7.4, 1.8], [7.4, 3.2]]) { ell(c, x, y, 0.8, 0.8); c.fillStyle = '#ece6d2'; c.fill(); } }, { outline: 0.35 });
const drawSkull = () => sprite(7, 7, (c) => { ell(c, 3.5, 3, 2.7, 2.4); shade(c, '#ece6d2', 0.8, 0.6, 5.4, 4.8); rr(c, 2.2, 4.4, 2.6, 1.6, 0.4); shade(c, '#d8d2bc', 2.2, 4.4, 2.6, 1.6); for (const x of [2.5, 4.5]) { ell(c, x, 3.2, 0.7, 0.8); c.fillStyle = '#2a2420'; c.fill(); } }, { outline: 0.35 });

// ---------- texture registry ----------
export const STRAIN_DNA_COLOR: Record<string, string> = {
  shambler: '#7ddc5a', runner: '#ffd23f', brute: '#ff5a5a', spitter: '#4ad6c8', bloater: '#b77bff', burnt: '#ff9a3c', dna: '#7ddc5a',
};
export const ZOMBIE_FRAMES = 4;
const STRAINS: StrainId[] = ['shambler', 'runner', 'brute', 'spitter', 'bloater', 'burnt'];
/** Extra zombie types (they drop one of the five DNA colours, so they only need body sprites). */
const MORE_ZOMBIES: StrainId[] = ['crawler', 'office', 'farmer', 'prisoner', 'jogger', 'courier', 'skater', 'athlete',
  'bouncer', 'lumberjack', 'butcher', 'juggernaut', 'labtech', 'sewer', 'diver', 'plague', 'chef', 'sumo', 'mutant', 'abomination'];
const TYPES: DamageType[] = ['physical', 'fire', 'shock', 'toxic', 'cryo'];

export interface ArtSet { canvases: Record<string, HTMLCanvasElement>; guns: Record<DamageType, GunArt> }
let cache: ArtSet | null = null;
const fx = (w: number, h: number, paint: (c: Ctx) => void) => sprite(w, h, paint, { outline: 0 });

/** Build every sprite once. Keys are used as Phaser texture keys. */
export function buildArt(): ArtSet {
  if (cache) return cache;
  const canvases: Record<string, HTMLCanvasElement> = {};
  for (const s of [...STRAINS, ...MORE_ZOMBIES]) for (let f = 0; f < ZOMBIE_FRAMES; f++) canvases[`z-${s}-${f}`] = drawZombie(s, f);
  for (let i = 0; i < 4; i++) for (let f = 0; f < 2; f++) canvases[`hero-${i}-${f}`] = drawHero(i, f);
  CLASS_ORDER.forEach((cls, i) => {
    for (let f = 0; f < 2; f++) canvases[`hero-${cls}-${f}`] = drawHero(i, f);
    canvases[`gun-${cls}`] = drawClassGun(cls);
  });
  canvases['vial-dna'] = drawVial('#7ddc5a');
  canvases['arrow'] = sprite(9, 3, (c) => { c.strokeStyle = '#8a5a2e'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(0.5, 1.5); c.lineTo(7, 1.5); c.stroke(); c.beginPath(); c.moveTo(7, 0.4); c.lineTo(8.8, 1.5); c.lineTo(7, 2.6); c.closePath(); c.fillStyle = '#d6dbe2'; c.fill(); c.fillStyle = '#ff5a5a'; c.beginPath(); c.moveTo(0.2, 0.3); c.lineTo(2, 1.5); c.lineTo(0.2, 2.7); c.fill(); }, { outline: 0.25 });
  canvases['pellet'] = fx(2, 2, (c) => glow(c, 1, 1, 1, '#ffd88a', 1));
  canvases['grenade'] = sprite(6, 6, (c) => { ell(c, 3, 3, 2.2, 2.2); shade(c, '#56693a', 0.8, 0.8, 4.4, 4.4, 0.45, 0.35); ell(c, 2.4, 2.3, 0.6, 0.5); c.fillStyle = 'rgba(255,255,255,.6)'; c.fill(); }, { outline: 0.35 });
  canvases['boom'] = fx(15, 15, (c) => {
    const g = c.createRadialGradient(7.5, 7.5, 0, 7.5, 7.5, 7.5);
    g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.25, 'rgba(255,220,90,1)'); g.addColorStop(0.6, 'rgba(255,110,30,.85)'); g.addColorStop(1, 'rgba(160,30,10,0)');
    c.fillStyle = g; c.beginPath(); c.arc(7.5, 7.5, 7.5, 0, Math.PI * 2); c.fill();
  });
  canvases['drone-bot'] = sprite(9, 5, (c) => {
    rr(c, 2.4, 1.8, 4.2, 1.8, 0.8); shade(c, '#5a6474', 2.4, 1.8, 4.2, 1.8); edge(c, 0.3);
    for (const x of [1.6, 7.4]) { ell(c, x, 1.4, 1.5, 0.4); c.fillStyle = 'rgba(210,230,250,.8)'; c.fill(); }
    glow(c, 4.5, 3.2, 0.8, '#ff5a5a', 1);
  }, { outline: 0.3 });
  canvases['shell'] = sprite(6, 4, (c) => { rr(c, 0.6, 1, 4.4, 2, 1); shade(c, '#5a6a3e', 0.6, 1, 4.4, 2, 0.45, 0.3); c.beginPath(); c.moveTo(5, 1.2); c.lineTo(5.8, 2); c.lineTo(5, 2.8); c.closePath(); c.fillStyle = '#c8a050'; c.fill(); }, { outline: 0.3 });
  canvases['tracer'] = fx(12, 1.4, (c) => { const g = c.createLinearGradient(0, 0, 12, 0); g.addColorStop(0, 'rgba(160,240,255,0)'); g.addColorStop(0.7, 'rgba(190,248,255,.9)'); g.addColorStop(1, '#fff'); c.fillStyle = g; rr(c, 0, 0.2, 12, 1, 0.5); c.fill(); });
  const guns = {} as Record<DamageType, GunArt>;
  for (const t of TYPES) { guns[t] = drawGun(t); canvases[`gun-${t}`] = guns[t].canvas; }
  for (const s of STRAINS) canvases[`vial-${s}`] = drawVial(STRAIN_DNA_COLOR[s]);
  canvases['shred-housing'] = drawShredHousing();
  canvases['shred-teeth'] = drawShredTeeth();
  canvases['shred-cap'] = drawHazard(22, 6);
  for (const s of [...STRAINS, 'generic'] as const) canvases[`charm-${s}`] = drawCharm(s === 'generic' ? '#e8e8e8' : STRAIN_DNA_COLOR[s]);
  for (const [rar, col] of Object.entries(RARITY_TRIM)) canvases[`crate-${rar}`] = drawCrate(col);
  for (const [stat, col] of [['dmg', '#ff5a5a'], ['spd', '#ffd23f'], ['crit', '#7ddc5a'], ['critdmg', '#ff9a3c'], ['range', '#7fe8ff']] as const) canvases[`mod-${stat}`] = drawMod(col);
  for (const [k, fn] of Object.entries(ICONS)) canvases[`icon-${k}`] = fn();
  canvases['pix'] = fx(1, 1, (c) => { const g = c.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5); g.addColorStop(0, '#fff'); g.addColorStop(0.6, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 1, 1); });
  canvases['bullet'] = fx(5, 1.2, (c) => { const g = c.createLinearGradient(0, 0, 5, 0); g.addColorStop(0, 'rgba(255,220,140,0)'); g.addColorStop(0.6, 'rgba(255,230,160,1)'); g.addColorStop(1, '#fff'); c.fillStyle = g; rr(c, 0, 0.1, 5, 1, 0.5); c.fill(); });
  canvases['flame-0'] = fx(6, 6, (c) => glow(c, 3, 3, 3, '#ff7a1a', 1));
  canvases['flame-1'] = fx(6, 6, (c) => glow(c, 3, 3, 3, '#ffb02a', 1));
  canvases['glob'] = sprite(6, 6, (c) => { ell(c, 3, 3, 2.2, 2.2); shade(c, '#6ff5df', 0.8, 0.8, 4.4, 4.4, 0.5, 0.3); }, { outline: 0.3 });
  canvases['shard'] = sprite(7, 5, (c) => { c.beginPath(); c.moveTo(0.6, 2.5); c.lineTo(3.4, 0.6); c.lineTo(6.6, 2.5); c.lineTo(3.4, 4.4); c.closePath(); shade(c, '#bff8ff', 0.6, 0.6, 6, 3.8, 0.5, 0.2); }, { outline: 0.3 });
  canvases['muzzle'] = fx(7, 7, (c) => { star(c, 3.5, 3.5, 3.5, 1.2, 4); const g = c.createRadialGradient(3.5, 3.5, 0, 3.5, 3.5, 3.5); g.addColorStop(0, '#fff'); g.addColorStop(0.4, '#ffe9a0'); g.addColorStop(1, 'rgba(255,150,40,0)'); c.fillStyle = g; c.fill(); glow(c, 3.5, 3.5, 2.4, '#ffd060', 0.9); });
  canvases['spark'] = fx(5, 5, (c) => { star(c, 2.5, 2.5, 2.5, 0.8, 4); c.fillStyle = '#fff6c0'; c.fill(); glow(c, 2.5, 2.5, 1.6, '#ffe060', 1); });
  cache = { canvases, guns };
  return cache;
}

// ---------- DOM icons ----------
const iconCache = new Map<string, string>();
/** A sprite (or a crop of it, in art units) as a data URL for the DOM, at `scale` CSS px per art unit × 2 for Retina. */
export function iconUrl(key: string, scale = 3, crop?: [number, number, number, number]): string {
  const ck = `${key}@${scale}@${crop?.join(',') ?? ''}`;
  const hit = iconCache.get(ck);
  if (hit) return hit;
  const src = buildArt().canvases[key];
  const [sx, sy, sw, sh] = crop ?? [0, 0, src.width / RES, src.height / RES];
  const out = Math.min(RES, scale * 2);
  const [c, ctx] = makeCanvas(sw * out, sh * out);
  ctx.drawImage(src, sx * RES, sy * RES, sw * RES, sh * RES, 0, 0, sw * out, sh * out);
  const url = c.toDataURL();
  iconCache.set(ck, url);
  return url;
}
export const weaponIcon = (t: DamageType) => iconUrl(`gun-${t}`, 2, [0, 1, 22, 10]);
export const vialIcon = (s: StrainId) => iconUrl(`vial-${s}`, 2);
export const charmIcon = (bane: StrainId | null) => iconUrl(`charm-${bane ?? 'generic'}`, 3);
export const modIcon = (stat: string) => iconUrl(`mod-${stat}`, 3);
export const crateIcon = (rarity: string) => iconUrl(`crate-${rarity}`, 3);
export const heroIcon = (i: number) => iconUrl(`hero-${i}-0`, 2, [2, 0.5, 16, 15]);
export const classIcon = (cls: ClassId) => iconUrl(`hero-${cls}-0`, 3, [2, 0.5, 16, 15]);
export const gunIcon = (cls: ClassId) => iconUrl(`gun-${cls}`, 3);
export const dnaIcon = () => iconUrl('vial-dna', 2);
/** Icon for a tree node: 'z:<strain>', 'hero:<n>' or a named icon. */
export function nodeIcon(icon: string): string {
  if (icon.startsWith('z:')) return zombieIcon(icon.slice(2) as StrainId);
  if (icon.startsWith('hero:')) return heroIcon(Number(icon.slice(5)));
  return iconUrl(`icon-${icon}`, 3);
}
/** Zombie head-and-shoulders crop for chips and horde cards. */
const zCrop = new Map<string, [number, number, number, number]>();
/** Zombie portrait: cropped to the sprite's own outline (types differ a lot in height), top ~19 units. */
export function zombieIcon(s: StrainId): string {
  let crop = zCrop.get(s);
  if (!crop) {
    const src = buildArt().canvases[`z-${s}-0`];
    const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
    for (let y = 0; y < src.height; y += 2) for (let x = 0; x < src.width; x += 2) if (d[(y * src.width + x) * 4 + 3] > 40) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const u = (v: number) => v / RES;
    crop = [u(x0), u(y0), u(x1 - x0 + 2), Math.min(19, u(y1 - y0 + 2))];
    zCrop.set(s, crop);
  }
  return iconUrl(`z-${s}-0`, 2, crop);
}
