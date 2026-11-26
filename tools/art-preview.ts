// Dev-only sprite sheet: npm run dev, then open /art-preview.html
import { buildArt, drawGround, makeCanvas } from '../src/game/art.ts';
const art = buildArt();
const out = document.getElementById('out')!;
const row = (label: string, keys: string[], scale: number) => {
  const r = document.createElement('div'); r.className = 'row';
  r.append(Object.assign(document.createElement('span'), { textContent: label, style: 'width:70px' }));
  for (const k of keys) {
    const src = art.canvases[k];
    const [c, ctx] = makeCanvas(src.width * scale, src.height * scale);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    r.append(c);
  }
  out.append(r);
};
for (const s of ['brute', 'runner', 'spitter', 'burnt', 'bloater']) row(s, [0, 1, 2, 3].map((f) => `z-${s}-${f}`), 5);
row('heroes', ['hero-0-0', 'hero-0-1', 'hero-1-0', 'hero-2-0'], 5);
row('guns', ['gun-physical', 'gun-fire', 'gun-shock', 'gun-toxic', 'gun-cryo'], 5);
row('misc', ['vial-brute', 'vial-runner', 'vial-spitter', 'vial-burnt', 'vial-bloater', 'shred-housing', 'shred-teeth', 'shred-cap', 'bullet', 'flame-0', 'glob', 'shard', 'muzzle', 'spark'], 5);
const g = drawGround({ w: 240, h: 130, roadTop: 18, roadBot: 120, bunkerRight: 60 });
const [c, ctx] = makeCanvas(g.width * 4, g.height * 4);
ctx.drawImage(g, 0, 0, c.width, c.height);
out.append(c);
