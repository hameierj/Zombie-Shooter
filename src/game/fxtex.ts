// Soft textures for the battle effects: a glow, billowy fire puffs (hot → cool), smoke puffs, toxic gas, a spark
// streak, blood splats and a scorch mark. Generated once at 2× so they stay smooth when scaled up.
const S = 2;
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = Math.ceil(w * S); c.height = Math.ceil(h * S);
  const g = c.getContext('2d')!; g.scale(S, S); return [c, g];
}
let seed = 99;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function glow(r: number) {
  const [c, g] = canvas(r * 2, r * 2), gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
}
function puff(r: number, col: string, a: number, lumps: number) {
  const [c, g] = canvas(r * 2, r * 2);
  for (let i = 0; i < lumps; i++) {
    const ang = rnd() * 6.283, d = rnd() * r * 0.38, rr = r * (0.42 + rnd() * 0.3), x = r + Math.cos(ang) * d, y = r + Math.sin(ang) * d;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(0.6, `rgba(${col},${a * 0.55})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
  }
  return c;
}
function spark() {
  const [c, g] = canvas(16, 4), gr = g.createLinearGradient(0, 0, 16, 0);
  gr.addColorStop(0, 'rgba(255,200,120,0)'); gr.addColorStop(1, 'rgba(255,250,220,1)');
  g.fillStyle = gr; g.beginPath(); g.roundRect(0, 0.8, 16, 2.4, 1.2); g.fill(); return c;
}
function blood(r: number) {
  const [c, g] = canvas(r * 2, r * 2);
  for (let i = 0; i < 9; i++) {
    const ang = rnd() * 6.283, d = rnd() * r * 0.55, x = r + Math.cos(ang) * d, y = r + Math.sin(ang) * d * 0.55;
    g.fillStyle = `rgba(${105 + rnd() * 40 | 0},${rnd() * 10 | 0},${rnd() * 8 | 0},${0.55 + rnd() * 0.35})`;
    g.beginPath(); g.ellipse(x, y, r * (0.15 + rnd() * 0.3), r * (0.08 + rnd() * 0.16), rnd() * 3, 0, 7); g.fill();
  }
  return c;
}
function scorch(r: number) {
  const [c, g] = canvas(r * 2, r * 2), gr = g.createRadialGradient(r, r, 0, r, r, r);
  gr.addColorStop(0, 'rgba(8,6,4,.8)'); gr.addColorStop(0.55, 'rgba(14,10,8,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, r * 2, r * 2); return c;
}
export function fxTextures(): Record<string, HTMLCanvasElement> {
  return {
    'fx-glow': glow(32),
    'fx-fire0': puff(24, '255,246,214', 0.95, 7), 'fx-fire1': puff(24, '255,196,90', 0.9, 7), 'fx-fire2': puff(24, '255,120,36', 0.85, 7), 'fx-fire3': puff(24, '196,52,18', 0.8, 7),
    'fx-smoke0': puff(28, '58,54,52', 0.75, 9), 'fx-smoke1': puff(28, '86,82,78', 0.65, 9), 'fx-smoke2': puff(28, '40,38,40', 0.8, 9),
    'fx-gas': puff(28, '120,255,90', 0.5, 8),
    'fx-spark': spark(),
    'fx-blood0': blood(10), 'fx-blood1': blood(10), 'fx-blood2': blood(14),
    'fx-scorch': scorch(32),
  };
}
