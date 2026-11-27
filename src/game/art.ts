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
/** Each unit type has its own outfit, headgear, skin tone and props, so they read apart at a glance. */
interface HeroLook {
  skin: string; top: string; sleeves: string | null;   // null sleeves = bare arms
  pants: string; boots: string;
  camo?: string[]; pantsCamo?: string[]; plaid?: string; ripped?: boolean; stripes?: string;
  hair?: string; hat?: 'helmet' | 'cap' | 'trucker' | 'boonie' | 'beret' | 'bandana' | 'hood' | 'none' | 'armor' | 'ghillie';
  hatCol?: string; hatCol2?: string;
  face?: 'goggles' | 'shades' | 'gasmask' | 'visor' | 'brass' | 'paint' | 'none'; beard?: string;
  over?: 'orange-vest' | 'plate' | 'bandolier' | 'ammo-belt' | 'coils' | 'none';
  back?: 'tank' | 'antenna' | 'radio' | 'none'; ears?: boolean;
}
const HERO_LOOKS: HeroLook[] = [
  // Pistoleer: white tank top, ripped jeans, messy hair
  { skin: '#e3ad84', top: '#f2f2ee', sleeves: null, pants: '#4a6ea8', boots: '#3a2a20', ripped: true, hair: '#5a3a22', hat: 'none', face: 'none' },
  // Hunter: camo jacket, blaze-orange vest and cap
  { skin: '#dba27a', top: '#6b6a3e', sleeves: '#6b6a3e', camo: ['#4f5a2e', '#8a7a4a', '#3a3a26'], pants: '#5d5a38', pantsCamo: ['#454a28', '#7a6c42'], boots: '#4a3424', hat: 'cap', hatCol: '#ff7a1a', face: 'none', over: 'orange-vest' },
  // Shotgunner: red flannel, trucker cap, beard
  { skin: '#e8b48c', top: '#b8302a', sleeves: '#b8302a', plaid: '#2a1a1a', pants: '#2e3a52', boots: '#3a2a20', hat: 'trucker', hatCol: '#f2f2ee', hatCol2: '#c8302a', face: 'none', beard: '#6a4a2a' },
  // Rifleman (M4): army camo, tan plate carrier, helmet
  { skin: '#b07850', top: '#6a7048', sleeves: '#6a7048', camo: ['#535a36', '#8a8456', '#3f4428'], pants: '#5e6440', pantsCamo: ['#4a5030', '#7e7a4e'], boots: '#2e2a22', hat: 'helmet', hatCol: '#6a6c44', face: 'goggles', over: 'plate' },
  // Sniper: ghillie suit, face paint
  { skin: '#c89070', top: '#4a5a2a', sleeves: '#4a5a2a', pants: '#4a5230', boots: '#2e2a22', hat: 'ghillie', hatCol: '#56662e', face: 'paint' },
  // Pyro: firefighter coat with reflective stripes, gas mask, fuel tank
  { skin: '#d8a07a', top: '#3a3a40', sleeves: '#3a3a40', stripes: '#e8e040', pants: '#3a3a40', boots: '#1e1e22', hat: 'helmet', hatCol: '#2a2a2e', face: 'gasmask', back: 'tank' },
  // Grenadier: grenade bandolier, black beret
  { skin: '#8a5a3a', top: '#5a6a3a', sleeves: '#5a6a3a', pants: '#4a5232', boots: '#2a2420', hat: 'beret', hatCol: '#1e1e22', face: 'none', over: 'bandolier', beard: '#2a1e14' },
  // Machine Gunner: sleeveless, big arms, red bandana, ammo belt, shades
  { skin: '#c88a5e', top: '#2a2e34', sleeves: null, pants: '#4a5034', pantsCamo: ['#3a4028', '#6a6a44'], boots: '#2a2420', hat: 'bandana', hatCol: '#d8302a', face: 'shades', over: 'ammo-belt' },
  // Drone Operator: teal hoodie, glowing VR visor, antenna pack
  { skin: '#f0c49c', top: '#2f8a84', sleeves: '#2f8a84', pants: '#2a3036', boots: '#e8e8e8', hat: 'hood', hatCol: '#2a7a74', face: 'visor', back: 'antenna' },
  // Mortar Team: desert tan, boonie hat, ear defenders
  { skin: '#9a6a46', top: '#c8a874', sleeves: '#c8a874', camo: ['#b0905c', '#dcc08a', '#9a7a4e'], pants: '#b89a68', boots: '#6a4a2a', hat: 'boonie', hatCol: '#bfa06c', face: 'none', ears: true, back: 'radio' },
  // Tesla Trooper: rubber suit, glowing copper coils, brass goggles, wild hair
  { skin: '#f0c8a8', top: '#3a2f5a', sleeves: '#3a2f5a', pants: '#2e2648', boots: '#1e1a2a', hair: '#f2f2f2', hat: 'none', face: 'brass', over: 'coils' },
  // Railgunner: white power armour, glowing blue visor
  { skin: '#e0ac82', top: '#e4eaf2', sleeves: '#cdd6e2', pants: '#2c3446', boots: '#1e2430', hat: 'armor', hatCol: '#eef2f8', face: 'visor', stripes: '#5a8cff' },
];
/** Where the gun's grip sits on the soldier canvas (art units). */
export const HERO_GRIP = { x: 13, y: 13 };

/** Fill the current path's area with blotches (camo) or a check (plaid); clip to (x,y,w,h) rounded box. */
function pattern(ctx: Ctx, x: number, y: number, w: number, h: number, r: number, paint: (ctx: Ctx) => void) {
  ctx.save(); rr(ctx, x, y, w, h, r); ctx.clip(); paint(ctx); ctx.restore();
}
function blotches(ctx: Ctx, x: number, y: number, w: number, h: number, cols: string[], seed: number) {
  const rnd = rng(seed);
  for (let i = 0; i < 9; i++) { ell(ctx, x + rnd() * w, y + rnd() * h, 0.9 + rnd() * 1.4, 0.6 + rnd() * 0.9); ctx.fillStyle = rgba(cols[i % cols.length], 0.85); ctx.fill(); }
}

function drawHero(i: number, frame: number): HTMLCanvasElement {
  const L = HERO_LOOKS[i % HERO_LOOKS.length];
  const base = HERO_H - 1.5;
  const b = frame ? -0.5 : 0;
  const arm = L.sleeves ?? L.skin;
  const big = L.over === 'ammo-belt' ? 0.5 : 0;   // the machine gunner is bulkier
  return sprite(HERO_W, HERO_H, (ctx) => {
    // back-mounted kit first (behind the body)
    if (L.back === 'tank') { rr(ctx, 2.6, 8.6 + b, 3.4, 8.4, 1.6); shade(ctx, '#c8302a', 2.6, 8.6 + b, 3.4, 8.4); edge(ctx); ctx.fillStyle = '#e8e8e8'; ctx.fillRect(2.9, 11 + b, 2.8, 0.6); }
    if (L.back === 'antenna') { rr(ctx, 3, 10 + b, 3, 5.4, 0.8); shade(ctx, '#2a2e36', 3, 10 + b, 3, 5.4); edge(ctx, 0.35); ctx.strokeStyle = INK; ctx.lineWidth = 0.4; ctx.beginPath(); ctx.moveTo(3.8, 10 + b); ctx.lineTo(2.6, 3 + b); ctx.stroke(); glow(ctx, 2.6, 3 + b, 0.7, '#5ef0ff', 0.9); }
    if (L.back === 'radio') { rr(ctx, 2.8, 10.4 + b, 3.2, 5, 0.6); shade(ctx, '#6a6040', 2.8, 10.4 + b, 3.2, 5); edge(ctx, 0.35); ctx.strokeStyle = INK; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(3.4, 10.4 + b); ctx.lineTo(3, 5.6 + b); ctx.stroke(); }
    // kneeling legs: back knee on the ground, front foot planted
    const pantsD = darken(L.pants, 0.25);
    limb(ctx, 8, 17.5, 5.4, base - 1, 2.6, pantsD);
    limb(ctx, 5.4, base - 1, 2.2, base - 0.9, 2.2, pantsD);
    limb(ctx, 9.6, 17.5, 13.2, 19.4, 2.8, L.pants);
    limb(ctx, 13.2, 19.4, 13.2, base - 1.2, 2.5, L.pants);
    if (L.pantsCamo) { for (const [x, y] of [[11, 18.6], [13.1, 21], [6.6, 20.6]]) { ell(ctx, x, y, 0.8, 0.5); ctx.fillStyle = L.pantsCamo[Math.round(x) % 2]; ctx.fill(); } }
    if (L.ripped) { for (const [x, y] of [[13.2, 20.2], [6.4, 21.4]]) { ell(ctx, x, y, 0.9, 0.55); ctx.fillStyle = L.skin; ctx.fill(); ctx.strokeStyle = '#e8eef6'; ctx.lineWidth = 0.25; ctx.stroke(); } }
    rr(ctx, 12, base - 1.8, 3.8, 1.8, 0.8); shade(ctx, L.boots, 12, base - 1.8, 3.8, 1.8); edge(ctx, 0.3);
    rr(ctx, 0.6, base - 1.8, 2.8, 1.7, 0.7); shade(ctx, L.boots, 0.6, base - 1.8, 2.8, 1.7); edge(ctx, 0.3);
    // back arm reaching to the gun's fore-grip
    limb(ctx, 8.4, 11.8 + b, 14.6, 13.4 + b, 2 + big, darken(arm, 0.2));
    // torso
    const tx = 4.8 - big / 2, tw = 8.4 + big;
    rr(ctx, tx, 9.2 + b, tw, 9, 2.4); shade(ctx, L.top, tx, 9.2 + b, tw, 9); edge(ctx);
    if (L.camo) pattern(ctx, tx, 9.2 + b, tw, 9, 2.4, (c) => blotches(c, tx, 9.2 + b, tw, 9, L.camo!, 7 + i));
    if (L.plaid) pattern(ctx, tx, 9.2 + b, tw, 9, 2.4, (c) => { c.fillStyle = rgba(L.plaid!, 0.45); for (let y = 10; y < 18; y += 2.2) c.fillRect(tx, y + b, tw, 0.7); for (let x = tx + 1; x < tx + tw; x += 2.2) c.fillRect(x, 9.2 + b, 0.7, 9); });
    if (L.stripes) { ctx.fillStyle = L.stripes; ctx.fillRect(tx + 0.3, 14.2 + b, tw - 0.6, 0.8); ctx.fillRect(tx + 0.3, 16.4 + b, tw - 0.6, 0.6); }
    if (L.hat === 'ghillie') pattern(ctx, tx - 1, 8 + b, tw + 2, 11, 2.4, (c) => { const rnd = rng(31); for (let k = 0; k < 26; k++) { c.strokeStyle = ['#3f5a24', '#6a7a36', '#2e4020', '#8a8a4a'][k % 4]; c.lineWidth = 0.55; const x = tx + rnd() * tw, y = 9 + b + rnd() * 9; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (rnd() - 0.5) * 1.6, y + 1.6 + rnd()); c.stroke(); } });
    if (!L.sleeves && L.over !== 'ammo-belt') { // tank top straps
      ctx.fillStyle = L.skin; ctx.fillRect(tx + 1.2, 9.2 + b, 1.6, 1.2); ctx.fillRect(tx + tw - 2.6, 9.2 + b, 1.6, 1.2);
    }
    // gear over the torso
    if (L.over === 'orange-vest') { rr(ctx, tx + 0.6, 9.6 + b, tw - 1.2, 6.6, 1.6); shade(ctx, '#ff7a1a', tx + 0.6, 9.6 + b, tw - 1.2, 6.6); edge(ctx, 0.35); ctx.fillStyle = '#ffd0a0'; ctx.fillRect(tx + 0.6, 13.2 + b, tw - 1.2, 0.5); }
    if (L.over === 'plate') { rr(ctx, tx + 0.8, 10 + b, tw - 1.6, 6.4, 1); shade(ctx, '#b89a68', tx + 0.8, 10 + b, tw - 1.6, 6.4); edge(ctx, 0.35); for (const x of [tx + 1.4, tx + 3.6, tx + 5.8]) { rr(ctx, x, 13.6 + b, 1.8, 2.2, 0.4); shade(ctx, '#9a7e50', x, 13.6 + b, 1.8, 2.2); edge(ctx, 0.25); } }
    if (L.over === 'bandolier') { ctx.strokeStyle = '#4a3a22'; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(tx + 1, 9.6 + b); ctx.lineTo(tx + tw - 1, 17 + b); ctx.stroke(); for (let k = 0; k < 4; k++) { const x = tx + 2 + k * 1.6, y = 10.8 + b + k * 1.5; ell(ctx, x, y, 0.75, 0.85); shade(ctx, '#4f6a2a', x - 0.8, y - 0.9, 1.6, 1.8); edge(ctx, 0.25); } }
    if (L.over === 'ammo-belt') { ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(tx + 0.8, 9.6 + b); ctx.lineTo(tx + tw - 0.6, 17.4 + b); ctx.stroke(); for (let k = 0; k < 6; k++) { ctx.fillStyle = '#e8c048'; ctx.fillRect(tx + 1.3 + k * 1.25, 10.1 + b + k * 1.25, 0.5, 1.1); } }
    if (L.over === 'coils') { for (const x of [tx + 1.4, tx + tw - 2.4]) { for (let k = 0; k < 3; k++) { ell(ctx, x + 0.5, 10 + b + k * 0.9, 1.1, 0.4); ctx.strokeStyle = '#d0843a'; ctx.lineWidth = 0.5; ctx.stroke(); } glow(ctx, x + 0.5, 9.6 + b, 0.9, '#b49aff', 0.8); } }
    ctx.fillStyle = '#2b2419'; ctx.fillRect(tx + 0.1, 16 + b, tw - 0.2, 1.2);   // belt
    rr(ctx, 8.6, 15.9 + b, 1.4, 1.4, 0.3); ctx.fillStyle = '#e2bf5a'; ctx.fill();
    // head
    const fx = 9.8, fy = 6.4 + b;
    ell(ctx, fx, fy, 3.1, 3.2); shade(ctx, L.skin, 6.7, 3.2 + b, 6.2, 6.4); edge(ctx);
    if (L.beard) { ctx.beginPath(); ctx.ellipse(fx + 0.6, fy + 1.6, 2.6, 1.8, 0, 0, Math.PI); ctx.closePath(); shade(ctx, L.beard, fx - 2, fy + 1, 5.2, 2.6); edge(ctx, 0.3); }
    if (L.face === 'paint') { ctx.fillStyle = 'rgba(40,60,20,.75)'; ctx.fillRect(fx - 1, fy - 0.4, 4, 0.9); ctx.fillStyle = 'rgba(20,20,10,.7)'; ctx.fillRect(fx - 0.6, fy + 1.2, 3.4, 0.6); }
    ell(ctx, 12.2, 7.6 + b, 0.5, 0.35); ctx.fillStyle = 'rgba(160,80,60,.5)'; ctx.fill();
    // hair / headgear
    if (L.hair && (L.hat === 'none' || !L.hat)) {
      ctx.beginPath(); ctx.ellipse(fx - 0.4, fy - 1.6, 3.5, 2.4, 0, Math.PI * 0.95, Math.PI * 2.05); ctx.closePath(); shade(ctx, L.hair, fx - 4, fy - 4.2, 7.2, 3.4); edge(ctx);
      for (const [x, y] of L.hair === '#f2f2f2' ? [[6.6, 3], [8.4, 2], [10.6, 2.2], [12.4, 3.2]] : [[7.4, 3.2], [9.6, 2.8], [11.6, 3.4]]) { ctx.beginPath(); ctx.moveTo(x, y + 1.6 + b); ctx.lineTo(x - 0.6, y + b - (L.hair === '#f2f2f2' ? 1.4 : 0.4)); ctx.lineTo(x + 0.8, y + 1.4 + b); ctx.closePath(); ctx.fillStyle = L.hair; ctx.fill(); }
    }
    const H = L.hatCol ?? '#555';
    if (L.hat === 'helmet') { ctx.beginPath(); ctx.ellipse(9.4, 5.2 + b, 4.1, 3.6, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); shade(ctx, H, 5.3, 1.6 + b, 8.2, 3.6); edge(ctx); rr(ctx, 4.8, 4.6 + b, 9.4, 1.1, 0.5); shade(ctx, darken(H, 0.25), 4.8, 4.6 + b, 9.4, 1.1); edge(ctx, 0.3); }
    if (L.hat === 'cap' || L.hat === 'trucker') {
      ctx.beginPath(); ctx.ellipse(9.6, 4.8 + b, 3.5, 2.6, 0, Math.PI, Math.PI * 2); ctx.closePath(); shade(ctx, H, 6, 2.2 + b, 7.2, 2.8); edge(ctx);
      if (L.hat === 'trucker') { ctx.save(); ctx.beginPath(); ctx.ellipse(9.6, 4.8 + b, 3.5, 2.6, 0, Math.PI, Math.PI * 2); ctx.clip(); ctx.fillStyle = L.hatCol2 ?? '#c8302a'; ctx.fillRect(6, 2 + b, 3, 3); ctx.restore(); }
      rr(ctx, 11.6, 4.2 + b, 3.6, 0.9, 0.4); shade(ctx, darken(H, 0.15), 11.6, 4.2 + b, 3.6, 0.9); edge(ctx, 0.3);
    }
    if (L.hat === 'boonie') { ell(ctx, 9.6, 4.6 + b, 5.2, 1.1); shade(ctx, darken(H, 0.1), 4.4, 3.5 + b, 10.4, 2.2); edge(ctx, 0.35); ctx.beginPath(); ctx.ellipse(9.6, 4.4 + b, 3.2, 2.4, 0, Math.PI, Math.PI * 2); ctx.closePath(); shade(ctx, H, 6.4, 2 + b, 6.4, 2.4); edge(ctx, 0.35); }
    if (L.hat === 'beret') { ctx.beginPath(); ctx.ellipse(8.8, 3.9 + b, 4, 1.9, -0.2, 0, Math.PI * 2); shade(ctx, H, 4.8, 2 + b, 8, 3.8); edge(ctx); ell(ctx, 11.4, 3.6 + b, 0.6, 0.6); ctx.fillStyle = '#e2bf5a'; ctx.fill(); }
    if (L.hat === 'bandana') { rr(ctx, 6.6, 3.6 + b, 6.6, 1.6, 0.6); shade(ctx, H, 6.6, 3.6 + b, 6.6, 1.6); edge(ctx, 0.3); ctx.fillStyle = H; ctx.beginPath(); ctx.moveTo(6.8, 4 + b); ctx.lineTo(4.8, 5.6 + b); ctx.lineTo(6, 3.6 + b); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.ellipse(9.6, 3.6 + b, 3, 1.4, 0, Math.PI, Math.PI * 2); ctx.closePath(); shade(ctx, '#2a1e14', 6.6, 2.2 + b, 6, 1.4); }
    if (L.hat === 'hood') { ctx.beginPath(); ctx.moveTo(6, 9 + b); ctx.quadraticCurveTo(5.4, 2.2 + b, 9.8, 2.4 + b); ctx.quadraticCurveTo(13.4, 2.6 + b, 13.2, 6 + b); ctx.lineTo(11.6, 5 + b); ctx.quadraticCurveTo(9, 3.8 + b, 7.6, 6 + b); ctx.lineTo(7.4, 9 + b); ctx.closePath(); shade(ctx, H, 5.4, 2.2 + b, 8, 7); edge(ctx); }
    if (L.hat === 'armor') { ell(ctx, 9.8, 5.8 + b, 3.9, 3.9); shade(ctx, H, 5.9, 1.9 + b, 7.8, 7.8); edge(ctx); }
    if (L.hat === 'ghillie') { const rnd = rng(77); for (let k = 0; k < 16; k++) { ctx.strokeStyle = ['#3f5a24', '#6a7a36', '#2e4020', '#8a8a4a'][k % 4]; ctx.lineWidth = 0.6; const x = 6 + rnd() * 8, y = 1.8 + b + rnd() * 3; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 2, y + 1.5 + rnd() * 1.6); ctx.stroke(); } }
    if (L.ears) { ell(ctx, 8.6, 6.6 + b, 1.2, 1.4); shade(ctx, '#3a3a3a', 7.4, 5.2 + b, 2.4, 2.8); edge(ctx, 0.3); }
    // eyes / eyewear
    if (L.face === 'goggles') { rr(ctx, 10, 5.8 + b, 3.4, 1.8, 0.8); const g = ctx.createLinearGradient(10, 5.8 + b, 13.4, 7.6 + b); g.addColorStop(0, '#9ff2ff'); g.addColorStop(1, '#1f5a7a'); ctx.fillStyle = g; ctx.fill(); edge(ctx, 0.35); ell(ctx, 11, 6.3 + b, 0.45, 0.3); ctx.fillStyle = '#fff'; ctx.fill(); }
    else if (L.face === 'shades') { rr(ctx, 10.2, 5.9 + b, 3.2, 1.2, 0.5); ctx.fillStyle = '#111'; ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(10.8, 6.1 + b, 0.9, 0.3); }
    else if (L.face === 'gasmask') { ell(ctx, 11.4, 7.4 + b, 2.2, 2); shade(ctx, '#2a2a2e', 9.2, 5.4 + b, 4.4, 4); edge(ctx); for (const [x, y] of [[11, 5.8], [12.8, 6.6]]) { ell(ctx, x, y + b, 0.85, 0.85); ctx.fillStyle = '#ffb84a'; ctx.fill(); edge(ctx, 0.25); } ell(ctx, 13.4, 8.6 + b, 1, 1); shade(ctx, '#5a5a62', 12.4, 7.6 + b, 2, 2); edge(ctx, 0.3); }
    else if (L.face === 'visor') { rr(ctx, 9.6, 5.4 + b, 4.2, 2, 0.9); ctx.fillStyle = '#5ef0ff'; ctx.fill(); edge(ctx, 0.35); glow(ctx, 12, 6.4 + b, 1.6, '#5ef0ff', 0.6); }
    else if (L.face === 'brass') { for (const x of [10.6, 12.6]) { ell(ctx, x, 6.3 + b, 0.95, 0.95); ctx.fillStyle = '#d0a040'; ctx.fill(); edge(ctx, 0.3); ell(ctx, x, 6.3 + b, 0.55, 0.55); ctx.fillStyle = '#b49aff'; ctx.fill(); } }
    else { ell(ctx, 11.7, 6.3 + b, 0.45, 0.55); ctx.fillStyle = '#1e1a18'; ctx.fill(); ctx.strokeStyle = 'rgba(60,40,30,.8)'; ctx.lineWidth = 0.35; ctx.beginPath(); ctx.moveTo(11, 5.2 + b); ctx.lineTo(12.6, 5.3 + b); ctx.stroke(); }
    // front arm + hand at the grip
    limb(ctx, 8, 11.4 + b, HERO_GRIP.x, HERO_GRIP.y + b, 2.1 + big, arm);
    if (L.sleeves && L.sleeves !== L.skin) { ell(ctx, HERO_GRIP.x - 1.2, HERO_GRIP.y + b - 0.3, 0.9, 0.9); ctx.fillStyle = L.skin; ctx.fill(); }
    ell(ctx, HERO_GRIP.x + 0.2, HERO_GRIP.y + b, 1.05, 1.05); shade(ctx, L.hat === 'armor' || L.face === 'gasmask' ? '#3a3a40' : L.skin, 12, 12, 2.2, 2.2); edge(ctx, 0.3);
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

/** A battleground: the map changes after each horde to match the next horde's boss. */
export type GroundTheme = 'street' | 'chem' | 'swamp' | 'badlands' | 'hive' | 'neon' | 'scrapyard';
interface ThemeSpec {
  verge: [string, string, string]; blobs: [string, string]; blades: [string, string] | null;
  road: [string, string, string]; dash: string | null; decos: (() => HTMLCanvasElement)[]; roadDecos: (() => HTMLCanvasElement)[];
  extras?: (ctx: Ctx, L: GroundLayout, r: () => number) => void;
}
/** A pool on the ground; `glow` = 'r,g,b' (and alpha) for a soft halo around it. */
const puddle = (ctx: Ctx, x: number, y: number, w: number, h: number, inner: string, rim: string, glow?: [string, number]) => {
  if (glow) { const gg = ctx.createRadialGradient(x, y, 0, x, y, w * 1.6); gg.addColorStop(0, `rgba(${glow[0]},${glow[1]})`); gg.addColorStop(1, `rgba(${glow[0]},0)`); ctx.fillStyle = gg; ctx.fillRect(x - w * 1.6, y - w * 1.6, w * 3.2, w * 3.2); }
  ell(ctx, x, y, w, h); ctx.fillStyle = rim; ctx.fill(); ell(ctx, x - w * 0.08, y - h * 0.1, w * 0.82, h * 0.72); ctx.fillStyle = inner; ctx.fill();
  ell(ctx, x - w * 0.3, y - h * 0.35, w * 0.25, h * 0.14); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fill();
};
const verges = (L: GroundLayout, r: () => number, n: number, f: (x: number, y: number) => void, onRoad = false) => {
  for (let i = 0; i < n; i++) {
    const x = L.bunkerRight + 8 + r() * (L.w - L.bunkerRight - 12);
    const top = r() < 0.5;
    const y = onRoad ? L.roadTop + 6 + r() * (L.roadBot - L.roadTop - 12) : top ? 3 + r() * Math.max(1, L.roadTop - 8) : L.roadBot + 5 + r() * Math.max(1, L.h - L.roadBot - 8);
    f(x, y);
  }
};
let THEMES_: Record<GroundTheme, ThemeSpec> | null = null;
const themes = (): Record<GroundTheme, ThemeSpec> => (THEMES_ ??= {
  street: { verge: ['#3f6a2c', '#4a7a34', '#3a6228'], blobs: ['96,150,60', '40,80,30'], blades: ['rgba(120,180,70,.7)', 'rgba(60,110,40,.7)'], road: ['#3a3d45', '#454852', '#383b42'], dash: 'rgba(240,215,110,.8)',
    decos: [drawTire, drawBarrel, drawCone, drawBones, drawSkull], roadDecos: [drawBones, drawSkull, drawTire] },
  // Giant Exploder: a leaking chemical works, toxic puddles glowing on the ground
  chem: { verge: ['#4e4f2a', '#5c5a2e', '#47472a'], blobs: ['150,150,60', '60,60,30'], blades: ['rgba(170,170,80,.55)', 'rgba(90,90,40,.6)'], road: ['#3c3b36', '#47463f', '#393833'], dash: 'rgba(255,170,60,.75)',
    decos: [() => drawBarrel('#d8b020'), () => drawBarrel('#d8b020'), drawBarrel, drawCone, drawSkull], roadDecos: [() => drawBarrel('#d8b020'), drawBones],
    extras: (ctx, L, r) => {
      verges(L, r, Math.ceil(L.w / 22), (x, y) => puddle(ctx, x, y, 4 + r() * 6, 2 + r() * 2.5, 'rgba(160,240,60,.85)', 'rgba(90,160,30,1)', ['160,240,60', 0.25]));
      verges(L, r, Math.ceil(L.w / 18), (x, y) => puddle(ctx, x, y, 3 + r() * 7, 1.5 + r() * 2.5, 'rgba(150,230,60,.7)', 'rgba(80,140,30,.9)', ['150,230,60', 0.2]), true);
      verges(L, r, Math.ceil(L.w / 10), (x, y) => { ell(ctx, x, y, 3 + r() * 6, 1 + r() * 2); ctx.fillStyle = 'rgba(200,170,40,.12)'; ctx.fill(); }, true);
    } },
  // Leaper: a swamp. Murky pools with lily pads, reeds, a muddy track
  swamp: { verge: ['#23402f', '#2c4a36', '#20392a'], blobs: ['60,110,80', '20,50,35'], blades: ['rgba(110,150,70,.8)', 'rgba(60,100,50,.8)'], road: ['#3e382c', '#4a4334', '#3a3429'], dash: null,
    decos: [drawReeds, drawReeds, drawLily, drawSkull], roadDecos: [drawLily, drawBones],
    extras: (ctx, L, r) => {
      verges(L, r, Math.ceil(L.w / 14), (x, y) => puddle(ctx, x, y, 7 + r() * 9, 3 + r() * 3, 'rgba(30,70,70,.9)', 'rgba(20,45,40,1)'));
      verges(L, r, Math.ceil(L.w / 12), (x, y) => puddle(ctx, x, y, 5 + r() * 10, 2 + r() * 3, 'rgba(40,62,52,.8)', 'rgba(32,40,30,1)'), true);
      verges(L, r, Math.ceil(L.w / 6), (x, y) => { ell(ctx, x, y, 2 + r() * 5, 1 + r() * 1.5); ctx.fillStyle = 'rgba(30,24,14,.25)'; ctx.fill(); }, true);
      verges(L, r, Math.ceil(L.w / 40), (x, y) => { ell(ctx, x, y, 2.6, 1.4); ctx.fillStyle = '#4f9a44'; ctx.fill(); }, true);
    } },
  // Titan: badlands quarry. Dust, boulders, deep cracks
  badlands: { verge: ['#7c6646', '#8a7350', '#735e40'], blobs: ['170,140,100', '90,70,45'], blades: null, road: ['#5e5040', '#6a5a48', '#594b3c'], dash: null,
    decos: [drawRock, drawRock, drawRock, drawBones, drawSkull], roadDecos: [drawRock, drawBones],
    extras: (ctx, L, r) => { ctx.strokeStyle = 'rgba(40,28,18,.55)'; ctx.lineWidth = 0.8; for (let i = 0; i < L.w / 10; i++) { let x = L.bunkerRight + r() * L.w, y = r() * L.h; ctx.beginPath(); ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += 2 + r() * 4; y += (r() - 0.5) * 4; ctx.lineTo(x, y); } ctx.stroke(); } } },
  // Brood Mother: an infested hive. Purple goo, egg sacs
  hive: { verge: ['#30243a', '#3a2c46', '#2a2034'], blobs: ['150,90,180', '50,30,60'], blades: null, road: ['#2f2b35', '#38333f', '#2b2731'], dash: 'rgba(200,140,255,.45)',
    decos: [drawEggs, drawEggs, drawSkull, drawBones], roadDecos: [drawEggs, drawBones],
    extras: (ctx, L, r) => {
      verges(L, r, Math.ceil(L.w / 12), (x, y) => puddle(ctx, x, y, 5 + r() * 9, 2.5 + r() * 3, 'rgba(160,90,200,.7)', 'rgba(90,50,120,1)', ['170,100,220', 0.18]));
      verges(L, r, Math.ceil(L.w / 14), (x, y) => puddle(ctx, x, y, 4 + r() * 8, 1.5 + r() * 2.5, 'rgba(140,80,180,.55)', 'rgba(80,40,100,.9)', ['170,100,220', 0.12]), true);
      ctx.strokeStyle = 'rgba(150,90,190,.35)'; ctx.lineWidth = 0.7;
      verges(L, r, Math.ceil(L.w / 8), (x, y) => { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 6, y + (r() - 0.5) * 8, x + 12 + r() * 10, y + (r() - 0.5) * 6); ctx.stroke(); }, true);
    } },
  // Screamer King: a city at night, wet asphalt with neon reflections
  neon: { verge: ['#1b1f2c', '#222739', '#191c28'], blobs: ['60,70,120', '10,12,24'], blades: null, road: ['#1f2028', '#272832', '#1c1d24'], dash: 'rgba(255,90,210,.85)',
    decos: [drawCone, drawTire, drawSkull, drawBarrel], roadDecos: [drawTire],
    extras: (ctx, L, r) => {
      const cols = ['255,80,210', '60,220,255', '255,200,60'];
      verges(L, r, Math.ceil(L.w / 12), (x, y) => { const c = cols[Math.floor(r() * cols.length)]; puddle(ctx, x, y, 5 + r() * 9, 1.4 + r() * 2, `rgba(${c},.35)`, `rgba(30,32,44,.9)`, [c, 0.22]); }, true);
      verges(L, r, Math.ceil(L.w / 26), (x, y) => { const c = cols[Math.floor(r() * cols.length)]; ctx.fillStyle = `rgba(${c},.85)`; ctx.fillRect(x, y, 10 + r() * 10, 1.6); });
      for (let i = 0; i < L.w / 5; i++) { ctx.fillStyle = `rgba(${cols[i % 3]},.07)`; ctx.fillRect(L.bunkerRight + r() * L.w, L.roadTop + r() * (L.roadBot - L.roadTop), 0.6, 6 + r() * 10); }
    } },
  // Iron Juggernaut: a scrapyard. Gravel, oil stains, steel plates on the road
  scrapyard: { verge: ['#4e4d48', '#5a5952', '#47463f'], blobs: ['120,120,110', '40,40,36'], blades: null, road: ['#3d4046', '#4a4d54', '#393c42'], dash: 'rgba(240,200,80,.7)',
    decos: [drawTire, drawTire, drawScrap, drawScrap, drawBarrel], roadDecos: [drawScrap, drawTire],
    extras: (ctx, L, r) => {
      verges(L, r, Math.ceil(L.w / 24), (x, y) => puddle(ctx, x, y, 4 + r() * 7, 2 + r() * 2, 'rgba(10,10,14,.8)', 'rgba(30,30,36,1)'), true);
      for (let i = 0; i < L.w / 40; i++) { const x = L.bunkerRight + 20 + r() * (L.w - L.bunkerRight - 40), y = L.roadTop + 6 + r() * (L.roadBot - L.roadTop - 20); rr(ctx, x, y, 14, 9, 1); ctx.fillStyle = 'rgba(120,126,136,.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(20,20,24,.6)'; ctx.lineWidth = 0.4; ctx.stroke(); for (const [dx, dy] of [[1.5, 1.5], [12.5, 1.5], [1.5, 7.5], [12.5, 7.5]]) { ell(ctx, x + dx, y + dy, 0.5, 0.5); ctx.fillStyle = 'rgba(30,30,34,.8)'; ctx.fill(); } }
    } },
});

/** Paint the whole battlefield background. `scale` = device pixels per art unit (the canvas is drawn at screen res). */
export function drawGround(L: GroundLayout, scale = 1, theme: GroundTheme = 'street'): HTMLCanvasElement {
  const T = themes()[theme];
  const [c, ctx] = makeCanvas(L.w * scale, L.h * scale);
  ctx.scale(scale, scale);
  const r = rng(1337);
  const roadH = L.roadBot - L.roadTop;
  // grass verges with soft tonal variation
  let g = ctx.createLinearGradient(0, 0, 0, L.h);
  g.addColorStop(0, T.verge[0]); g.addColorStop(0.5, T.verge[1]); g.addColorStop(1, T.verge[2]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, L.w, L.h);
  for (let i = 0; i < (L.w * L.h) / 260; i++) {
    const x = r() * L.w, y = r() * L.h, rad = 4 + r() * 10;
    const gg = ctx.createRadialGradient(x, y, 0, x, y, rad);
    const col = r() < 0.5 ? T.blobs[0] : T.blobs[1];
    gg.addColorStop(0, `rgba(${col},.18)`); gg.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = gg; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // grass blades
  ctx.lineCap = 'round';
  for (let i = 0; T.blades && i < L.w * 1.4; i++) {
    const x = L.bunkerRight + r() * (L.w - L.bunkerRight);
    const top = r() < 0.5;
    const y = top ? r() * (L.roadTop - 2) : L.roadBot + 2 + r() * (L.h - L.roadBot - 2);
    ctx.strokeStyle = r() < 0.5 ? T.blades[0] : T.blades[1];
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(x, y + 2); ctx.quadraticCurveTo(x + 0.4, y + 1, x + (r() - 0.5) * 2, y); ctx.stroke();
  }
  // asphalt road with soft lighting and fine grain
  g = ctx.createLinearGradient(0, L.roadTop, 0, L.roadBot);
  g.addColorStop(0, T.road[0]); g.addColorStop(0.5, T.road[1]); g.addColorStop(1, T.road[2]);
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
  for (let x = L.bunkerRight + 8; T.dash && x < L.w; x += 16) { rr(ctx, x, mid - 0.6, 8, 1.2, 0.6); ctx.fillStyle = T.dash; ctx.globalAlpha = r() < 0.3 ? 0.55 : 1; ctx.fill(); ctx.globalAlpha = 1; }
  T.extras?.(ctx, L, r);
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
  const decos = T.decos;
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
    const d = T.roadDecos[Math.floor(r() * T.roadDecos.length)]();
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
const drawBarrel = (col = '#a8452a') => sprite(8, 10, (c) => { rr(c, 1, 0.8, 6, 8.6, 1); shade(c, col, 1, 0.8, 6, 8.6); c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(1, 3.2, 6, 0.6); c.fillRect(1, 6.4, 6, 0.6); ell(c, 4, 1.4, 2.8, 0.7); c.fillStyle = col === '#a8452a' ? '#c86a4a' : '#f0d060'; c.fill(); if (col !== '#a8452a') { c.fillStyle = '#1a1a1a'; c.beginPath(); c.moveTo(4, 4.4); c.lineTo(5.4, 6.8); c.lineTo(2.6, 6.8); c.closePath(); c.fill(); } }, { outline: 0.35 });
const drawRock = () => sprite(12, 9, (c) => { c.beginPath(); c.moveTo(1, 8); c.lineTo(2.4, 3); c.lineTo(5.6, 1); c.lineTo(9.4, 2.4); c.lineTo(11, 8); c.closePath(); shade(c, '#9a8a70', 1, 1, 10, 7); }, { outline: 0.4 });
const drawReeds = () => sprite(8, 12, (c) => { c.lineCap = 'round'; for (const [x, h, col] of [[2, 10, '#6f8f3a'], [4, 11.5, '#83a444'], [6, 9, '#5f7f32']] as const) { c.strokeStyle = col; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, 12); c.quadraticCurveTo(x + 0.6, 12 - h / 2, x + 0.2, 12 - h); c.stroke(); } rr(c, 3.4, 0.6, 1.4, 3.4, 0.7); shade(c, '#6a4428', 3.4, 0.6, 1.4, 3.4); }, { outline: 0.3 });
const drawLily = () => sprite(9, 6, (c) => { c.beginPath(); c.moveTo(4.5, 3); c.arc(4.5, 3, 3.6, 0.3, Math.PI * 2 - 0.3); c.closePath(); c.save(); c.scale(1, 0.62); c.restore(); shade(c, '#4f9a44', 1, 0, 7, 6); ell(c, 6.2, 2.2, 0.9, 0.9); c.fillStyle = '#ff9ac8'; c.fill(); }, { outline: 0.3 });
const drawEggs = () => sprite(11, 8, (c) => { for (const [x, y, rx] of [[3, 5, 2.4], [6.4, 4.6, 2.7], [8.6, 5.8, 1.8], [5, 2.6, 2]] as const) { ell(c, x, y, rx, rx * 0.85); const g = c.createRadialGradient(x - rx / 3, y - rx / 3, 0.2, x, y, rx); g.addColorStop(0, '#f4d8ff'); g.addColorStop(0.5, '#c890e8'); g.addColorStop(1, '#7a4a98'); c.fillStyle = g; c.fill(); } }, { outline: 0.35 });
const drawScrap = () => sprite(12, 7, (c) => { c.beginPath(); c.moveTo(0.6, 6); c.lineTo(3, 1.4); c.lineTo(8, 0.8); c.lineTo(11.4, 4); c.lineTo(9, 6.4); c.closePath(); shade(c, '#7e8490', 0.6, 0.8, 11, 5.6); c.strokeStyle = 'rgba(160,80,40,.7)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(3, 3); c.lineTo(8, 4); c.stroke(); }, { outline: 0.35 });
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
