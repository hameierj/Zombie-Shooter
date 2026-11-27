// The battleground in the "rooftop siege" look: the squad's rooftop on the left (its wall facing the street), a
// spike-barricade sidewalk (the shredder), then a city street at dusk with buildings, wrecks and props. Each horde's
// boss gives the street its own mood (toxic puddles, mud, sand, goo, neon, rust). Drawn once into a canvas at device
// resolution; the scene adds the dusk grade and live lights on top.
import type { GroundLayout, GroundTheme } from './art.ts';

type Ctx = CanvasRenderingContext2D;
interface Mood { road: [string, string]; verge: string; roof: string; puddle: string | null; puddleGlow: number; accent: string; lamp: string }
const MOODS: Record<GroundTheme, Mood> = {
  street:    { road: ['#44454b', '#2c2d33'], verge: '#57585d', roof: '#6c6a64', puddle: '#1e2330', puddleGlow: 0, accent: '#e8c450', lamp: '255,214,150' },
  chem:      { road: ['#3d4640', '#29302b'], verge: '#4f5a52', roof: '#646a60', puddle: '#5f9a1e', puddleGlow: 0.35, accent: '#d8e04a', lamp: '190,255,140' },
  swamp:     { road: ['#3f4236', '#2a2d24'], verge: '#4a5238', roof: '#62645a', puddle: '#3a4a2a', puddleGlow: 0.1, accent: '#c8b860', lamp: '220,230,160' },
  badlands:  { road: ['#54493e', '#3a3129'], verge: '#7a6648', roof: '#7a6e5e', puddle: null, puddleGlow: 0, accent: '#f0c060', lamp: '255,190,120' },
  hive:      { road: ['#40384a', '#2a2432'], verge: '#4e4258', roof: '#665e6a', puddle: '#6a2a8a', puddleGlow: 0.3, accent: '#d08aff', lamp: '220,160,255' },
  neon:      { road: ['#2e2c3e', '#1c1b28'], verge: '#3a384c', roof: '#56546a', puddle: '#262642', puddleGlow: 0.25, accent: '#ff5ad0', lamp: '120,230,255' },
  scrapyard: { road: ['#48403a', '#302a25'], verge: '#5c5046', roof: '#6e6458', puddle: '#2a241e', puddleGlow: 0, accent: '#e89a4a', lamp: '255,180,110' },
};

function rng(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
const shade = (c: string, t: number) => {
  const x = [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
  return `rgb(${x.map((v) => Math.round(t < 0 ? v * (1 + t) : v + (255 - v) * t)).join(',')})`;
};

let NOISE: HTMLCanvasElement | null = null;
function noise() {
  if (NOISE) return NOISE;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!, id = g.createImageData(128, 128), r = rng(7);
  for (let i = 0; i < id.data.length; i += 4) { const v = r() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; }
  g.putImageData(id, 0, 0);
  return (NOISE = c);
}

export function drawCity(L: GroundLayout, px: number, theme: GroundTheme): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.ceil(L.w * px); c.height = Math.ceil(L.h * px);
  const g = c.getContext('2d')!;
  g.scale(px, px);
  const m = MOODS[theme] ?? MOODS.street, R = rng(1000 + L.w * 7 + L.h);
  const rr = (a: number, b: number) => a + R() * (b - a);
  const W = L.w, H = L.h, bR = L.bunkerRight, roadX = bR + 27, top = L.roadTop, bot = L.roadBot;
  const grain = (x: number, y: number, w: number, h: number, a: number) => {
    g.save(); g.globalAlpha = a; g.globalCompositeOperation = 'overlay';
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = g.createPattern(noise(), 'repeat')!; g.fillRect(x * px, y * px, w * px, h * px);
    g.restore();
  };

  // ---- street ----
  const sg = g.createLinearGradient(W, top, roadX, bot); sg.addColorStop(0, m.road[0]); sg.addColorStop(1, m.road[1]);
  g.fillStyle = sg; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 90; i++) {
    const x = rr(roadX, W), y = rr(top, bot), r = rr(8, 40);
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, R() < 0.55 ? 'rgba(10,10,14,.32)' : 'rgba(140,140,150,.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  grain(roadX, top, W - roadX, bot - top, 0.22);
  for (let i = 0; i < W * H * 0.012; i++) { g.fillStyle = R() < 0.5 ? 'rgba(220,220,230,.07)' : 'rgba(0,0,0,.22)'; g.fillRect(rr(roadX, W), rr(top, bot), rr(0.3, 1.1), rr(0.3, 1.1)); }
  // cracks, patches, oil stains, skid marks
  g.lineCap = 'round';
  for (let i = 0; i < 30; i++) { let x = rr(roadX + 10, W), y = rr(top, bot); g.strokeStyle = 'rgba(8,8,10,.55)'; g.lineWidth = rr(0.4, 0.9); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 7; k++) { x += rr(-9, 9); y += rr(-7, 7); g.lineTo(x, y); } g.stroke(); }
  for (let i = 0; i < 7; i++) { g.fillStyle = 'rgba(14,14,18,.4)'; g.fillRect(rr(roadX + 30, W - 40), rr(top + 20, bot - 30), rr(16, 44), rr(10, 26)); }
  for (let i = 0; i < 10; i++) { const x = rr(roadX + 20, W), y = rr(top + 10, bot - 10); g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(x, y, rr(5, 12), rr(3, 6), rr(0, 3), 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(10,10,12,.3)'; g.lineWidth = 3;
  for (let i = 0; i < 3; i++) { const y = rr(top + 40, bot - 40), x0 = rr(roadX + 40, W * 0.6); g.beginPath(); g.moveTo(x0, y); g.bezierCurveTo(x0 + 40, y + rr(-20, 20), x0 + 80, y + rr(-20, 20), x0 + 130, y + rr(-10, 10)); g.stroke(); }
  // lane paint: worn double centre line + dashed lanes
  const mid = (top + bot) / 2;
  for (let x = roadX + 4; x < W; x += 30) { g.fillStyle = shade(m.accent, -0.1); g.globalAlpha = rr(0.45, 0.85); g.fillRect(x, mid - 2.6, 20, 1.6); g.fillRect(x, mid + 1, 20, 1.6); }
  g.globalAlpha = 1;
  for (const y of [top + (mid - top) / 2, mid + (bot - mid) / 2]) for (let x = roadX + 16; x < W; x += 38) { g.fillStyle = `rgba(230,230,230,${rr(0.18, 0.4)})`; g.fillRect(x, y, 14, 1.4); }
  // crosswalk
  const cwX = Math.round(roadX + (W - roadX) * 0.42);
  for (let y = top + 6; y < bot - 6; y += 9) { g.fillStyle = `rgba(235,235,235,${rr(0.18, 0.38)})`; g.fillRect(cwX, y, 18, 5); }
  // puddles (theme coloured; some glow)
  if (m.puddle) for (let i = 0; i < 7; i++) {
    const x = rr(roadX + 30, W - 10), y = rr(top + 20, bot - 20), w = rr(14, 34);
    if (m.puddleGlow) { const gr = g.createRadialGradient(x, y, 0, x, y, w * 1.2); gr.addColorStop(0, `rgba(${m.lamp},${m.puddleGlow})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - w * 1.2, y - w * 1.2, w * 2.4, w * 2.4); }
    g.fillStyle = m.puddle; g.beginPath(); g.ellipse(x, y, w / 2, w / 5, 0, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.ellipse(x - w / 8, y - w / 20, w / 5, w / 26, 0, 0, 7); g.fill();
  }
  if (theme === 'badlands') for (let i = 0; i < 16; i++) { const x = rr(roadX, W), y = rr(top, bot); const gr = g.createRadialGradient(x, y, 0, x, y, 30); gr.addColorStop(0, 'rgba(190,150,100,.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 30, y - 30, 60, 60); }
  // manholes
  for (let i = 0; i < 2; i++) { const x = rr(roadX + 40, W - 30), y = rr(top + 30, bot - 30); g.fillStyle = '#1b1c20'; g.beginPath(); g.ellipse(x, y, 7, 5, 0, 0, 7); g.fill(); g.strokeStyle = 'rgba(120,120,130,.45)'; g.lineWidth = 0.8; g.stroke(); g.beginPath(); g.moveTo(x - 5, y); g.lineTo(x + 5, y); g.stroke(); }

  // ---- verges: sidewalks, a building on the top edge, parked wrecks on the bottom ----
  for (const [y0, y1] of [[0, top], [bot, H]]) {
    g.fillStyle = m.verge; g.fillRect(roadX, y0, W - roadX, y1 - y0);
    for (let x = roadX; x < W; x += 12) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x, y0, 0.6, y1 - y0); }
    grain(roadX, y0, W - roadX, y1 - y0, 0.25);
  }
  for (const y of [top, bot]) { g.fillStyle = shade(m.verge, 0.22); g.fillRect(roadX, y - 1.5, W - roadX, 2.2); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(roadX, y + (y === top ? 0.7 : -2.6), W - roadX, 1.6); }
  building(g, Math.max(roadX + 30, W * 0.42), -30, W, top - 6, m, R);
  if (top > 40) building(g, roadX + 4, -30, Math.max(roadX + 24, W * 0.42) - 10, top - 14, m, R);
  car(g, W * 0.78, top + 16, theme === 'scrapyard' ? '#6a3a1e' : '#5a3226', 0.08);
  car(g, W * 0.5, bot - 14, theme === 'neon' ? '#2a3a6a' : '#2e3e52', -0.06);
  if (theme === 'scrapyard') { car(g, W * 0.3, top + 20, '#4a3a2a', 0.2); car(g, W * 0.9, bot - 22, '#5a4a30', -0.2); }
  for (const [x, y] of [[0.62, top + 8], [0.36, bot - 8], [0.95, bot - 30]]) barrel(g, W * x, y, theme === 'chem' ? '#8a8a2a' : '#9a6a1a');
  crate(g, W * 0.7, bot - 6); crate(g, W * 0.72, bot - 2);
  // street lamps (baked light pools)
  for (const [x, y] of [[W * 0.55, top + 2], [W * 0.88, bot - 2]]) {
    const gr = g.createRadialGradient(x, y + (y < mid ? 18 : -18), 0, x, y + (y < mid ? 18 : -18), 46); gr.addColorStop(0, `rgba(${m.lamp},.22)`); gr.addColorStop(1, `rgba(${m.lamp},0)`);
    g.fillStyle = gr; g.fillRect(x - 46, y - 30, 92, 96);
    g.fillStyle = '#26282c'; g.fillRect(x - 1, y - 6, 2, 7); g.fillStyle = `rgba(${m.lamp},.9)`; g.fillRect(x - 2.5, y - 7, 5, 2);
  }
  if (theme === 'neon') { neon(g, W * 0.6, top - 26, 'MOTEL', '#ff4ac8'); neon(g, W * 0.86, top - 16, '24/7', '#4ae8ff'); }

  // ---- the shredder line: a sidewalk of spike barricades in front of the rooftop ----
  for (let y = 0; y < H; y += 9) { g.fillStyle = (y / 9) % 2 ? '#5e5f63' : '#58595d'; g.fillRect(bR, y, 27, 8.6); }
  grain(bR, 0, 27, H, 0.25);
  g.fillStyle = '#7c7d80'; g.fillRect(roadX - 2, 0, 2, H); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(roadX, 0, 2.5, H);
  for (let y = 4, i = 0; y < H; y += 10, i++) hedgehog(g, bR + 12 + (i % 2) * 5, y);
  for (let i = 0; i < H / 12; i++) { g.fillStyle = `rgba(${100 + R() * 40 | 0},8,8,${rr(0.2, 0.5)})`; g.beginPath(); g.ellipse(bR + rr(6, 26), rr(0, H), rr(1.5, 4), rr(0.8, 2), rr(0, 3), 0, 7); g.fill(); }

  // ---- the squad's rooftop ----
  const wallW = 9, roofR = bR - wallW;
  const rg = g.createLinearGradient(0, 0, roofR, H); rg.addColorStop(0, shade(m.roof, 0.06)); rg.addColorStop(1, shade(m.roof, -0.2));
  g.fillStyle = rg; g.fillRect(0, 0, roofR, H);
  grain(0, 0, roofR, H, 0.35);
  for (let y = 0; y < H; y += 30) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(0, y, roofR, 0.8); }
  for (let i = 0; i < H / 14; i++) { g.fillStyle = 'rgba(25,22,20,.22)'; g.beginPath(); g.ellipse(rr(0, roofR), rr(0, H), rr(3, 10), rr(2, 5), 0, 0, 7); g.fill(); }
  for (let y = 60; y < H - 20; y += 190) { acUnit(g, 4, y); }
  // east wall facing the street (seen from above at an angle)
  const ew = g.createLinearGradient(roofR, 0, bR, 0); ew.addColorStop(0, '#3a3a40'); ew.addColorStop(1, '#1e1e23');
  g.fillStyle = ew; g.fillRect(roofR, 0, wallW, H);
  for (let y = 0; y < H; y += 6) { g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(roofR, y, wallW, 0.5); }
  for (let y = 22; y < H; y += 70) { g.fillStyle = `rgba(${m.lamp},.12)`; g.fillRect(roofR + 3, y, 3, 4); }
  // parapet + sandbags along the edge
  g.fillStyle = shade(m.roof, 0.25); g.fillRect(roofR - 2, 0, 2, H);
  for (let y = 0, i = 0; y < H; y += 5.4, i++) {
    const sx = roofR - 8 + (i % 2) * 1.3, sgd = g.createLinearGradient(0, y, 0, y + 5);
    sgd.addColorStop(0, '#cdb688'); sgd.addColorStop(1, '#7a6642');
    g.fillStyle = sgd; g.beginPath(); g.roundRect(sx, y, 6, 5, 2.4); g.fill();
  }
  return c;
}

function building(g: Ctx, x0: number, y0: number, x1: number, y1: number, m: Mood, R: () => number) {
  if (x1 - x0 < 20 || y1 - y0 < 10) return;
  const h = 12;
  // south face (visible), then the roof
  g.fillStyle = '#26262b'; g.fillRect(x0, y1 - h, x1 - x0, h);
  for (let x = x0 + 6; x < x1 - 8; x += 16) { g.fillStyle = R() < 0.35 ? `rgba(${m.lamp},.55)` : 'rgba(14,16,22,.9)'; g.fillRect(x, y1 - h + 3, 7, 6); }
  const rg = g.createLinearGradient(x0, y0, x1, y1); rg.addColorStop(0, shade(m.roof, -0.02)); rg.addColorStop(1, shade(m.roof, -0.28));
  g.fillStyle = rg; g.fillRect(x0, y0, x1 - x0, y1 - h - y0);
  g.fillStyle = shade(m.roof, 0.2); g.fillRect(x0, y1 - h - 1.5, x1 - x0, 1.5); g.fillRect(x0, y0, 1.5, y1 - h - y0);
  const ry1 = y1 - h;
  if (ry1 - y0 > 24) {
    acUnit(g, x0 + 14, ry1 - 22); if (x1 - x0 > 90) acUnit(g, x0 + 60, ry1 - 18);
    if (x1 - x0 > 130) { const tx = x1 - 30, ty = ry1 - 16; g.fillStyle = '#3a5a7a'; g.beginPath(); g.ellipse(tx, ty + 3, 11, 7, 0, 0, 7); g.fill(); g.fillStyle = '#50728f'; g.beginPath(); g.ellipse(tx, ty, 11, 7, 0, 0, 7); g.fill(); }
  }
}
function acUnit(g: Ctx, x: number, y: number) {
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x + 2, y + 2, 20, 13);
  g.fillStyle = '#5e6064'; g.fillRect(x, y + 9, 18, 4); g.fillStyle = '#868a90'; g.fillRect(x, y, 18, 10);
  g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 0.6; for (let i = 3; i < 18; i += 3) { g.beginPath(); g.moveTo(x + i, y + 2); g.lineTo(x + i, y + 8); g.stroke(); }
  g.fillStyle = '#4a4d52'; g.beginPath(); g.arc(x + 13, y + 5, 2.6, 0, 7); g.fill();
}
function car(g: Ctx, x: number, y: number, col: string, rot: number) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.roundRect(-26, -9, 56, 24, 6); g.fill();
  const b = g.createLinearGradient(0, -12, 0, 12); b.addColorStop(0, shade(col, 0.22)); b.addColorStop(1, shade(col, -0.45));
  g.fillStyle = b; g.beginPath(); g.roundRect(-28, -12, 56, 23, 6); g.fill();
  g.fillStyle = 'rgba(18,22,28,.92)'; g.beginPath(); g.roundRect(-10, -10, 22, 19, 4); g.fill();
  g.fillStyle = 'rgba(160,190,220,.16)'; g.fillRect(-8, -8, 7, 15);
  g.fillStyle = shade(col, -0.15); g.beginPath(); g.roundRect(-7, -7, 16, 13, 3); g.fill();
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(14, -11, 1, 21);
  g.fillStyle = '#ffd08a'; g.fillRect(26, -10, 1.5, 3.5); g.fillRect(26, 6, 1.5, 3.5);
  g.restore();
}
function barrel(g: Ctx, x: number, y: number, c: string) {
  g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.ellipse(x - 2, y + 4, 6, 2.6, 0, 0, 7); g.fill();
  const gr = g.createLinearGradient(x - 4.5, 0, x + 4.5, 0); gr.addColorStop(0, shade(c, -0.5)); gr.addColorStop(0.6, shade(c, 0.15)); gr.addColorStop(1, shade(c, -0.2));
  g.fillStyle = gr; g.fillRect(x - 4.5, y - 9, 9, 13);
  g.fillStyle = shade(c, 0.3); g.beginPath(); g.ellipse(x, y - 9, 4.5, 2, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x - 4.5, y - 5, 9, 1); g.fillRect(x - 4.5, y - 1, 9, 1);
}
function crate(g: Ctx, x: number, y: number) {
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x - 6, y + 3, 14, 4);
  g.fillStyle = '#8a6a3e'; g.fillRect(x - 6, y - 6, 12, 10); g.fillStyle = '#a8844e'; g.fillRect(x - 6, y - 9, 12, 4);
  g.strokeStyle = 'rgba(40,24,10,.7)'; g.lineWidth = 0.7; g.strokeRect(x - 6, y - 6, 12, 10); g.beginPath(); g.moveTo(x - 6, y - 6); g.lineTo(x + 6, y + 4); g.stroke();
}
function hedgehog(g: Ctx, x: number, y: number) {
  const bars: [number, number, number, number][] = [[-4.5, -2.5, 4.5, 2.5], [-4.5, 2.5, 4.5, -2.5], [0, -5, 0, 3.5]];
  g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x - 1, y + 3, 5, 1.6, 0, 0, 7); g.fill();
  g.lineCap = 'round';
  for (const [col, w] of [['#151517', 2.4], ['#70737a', 1.1]] as const) { g.strokeStyle = col; g.lineWidth = w; for (const [a, b, c, d] of bars) { g.beginPath(); g.moveTo(x + a, y + b); g.lineTo(x + c, y + d); g.stroke(); } }
}
function neon(g: Ctx, x: number, y: number, t: string, col: string) {
  g.save(); g.font = '700 11px sans-serif'; g.textAlign = 'center'; g.shadowColor = col; g.shadowBlur = 8; g.fillStyle = col; g.fillText(t, x, y); g.restore();
}
