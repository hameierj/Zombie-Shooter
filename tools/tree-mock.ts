// Three passive-tree concepts, drawn from the real tree (src/core/tree.ts) with a sample mid-game state.
import '@fontsource/lilita-one/400.css';
import * as M from '../src/core/model.ts';
import { TREE, REGIONS, type TreeNode } from '../src/core/tree.ts';
import { fmtLn } from '../src/core/format.ts';
import { vialIcon } from '../src/game/art.ts';

// ---- sample state: Basic Training mostly done (War Drums taken), Marksman started, hordes 1-3 beaten ----
const HORDES = 3;
const OWNED = new Set(['r0.s1', 'r0.s2', 'r0.n1', 'r0.a1', 'r0.a2', 'r0.na', 'r1.s1', 'r1.s2']);
const open = (ri: number) => ri < 0 || REGIONS[ri].horde <= HORDES;
const owned = (n: TreeNode) => n.id === 'start' || OWNED.has(n.id);
const avail = (n: TreeNode) => !owned(n) && open(n.region) && n.links.some((l) => l === 'start' || OWNED.has(l));
const lnCost = Math.log(M.CONFIG.treeCost0) + OWNED.size * Math.log(M.CONFIG.treeCostGrowth);
const price = (ri: number) => `<img class="vial" src="${vialIcon(REGIONS[ri].dna)}" alt="">${fmtLn(lnCost)}`;
const nodesOf = (ri: number) => TREE.filter((n) => n.region === ri);
const node = (id: string) => TREE.find((n) => n.id === id)!;
const kindName = (n: TreeNode) => (n.size === 'keystone' ? 'Keystone' : n.size === 'notable' ? 'Notable' : 'Passive');
const label = (n: TreeNode) => (n.size === 'small' ? n.desc.replace(/ for the whole squad\.?/, '').replace(/\.$/, '') : n.name);

// node layout inside a region diagram (unit coords 0..1)
const POS: Record<string, [number, number]> = {
  s1: [0.06, 0.5], s2: [0.2, 0.5], n1: [0.35, 0.5], a1: [0.5, 0.2], a2: [0.64, 0.2], na: [0.79, 0.2], b1: [0.5, 0.8], b2: [0.64, 0.8], nb: [0.79, 0.8], k: [0.94, 0.5],
};
const EDGES = [['s1', 's2'], ['s2', 'n1'], ['n1', 'a1'], ['a1', 'a2'], ['a2', 'na'], ['n1', 'b1'], ['b1', 'b2'], ['b2', 'nb'], ['na', 'k'], ['nb', 'k']];

function shape(n: TreeNode, x: number, y: number, s: number, col: string, sel = false) {
  const st = owned(n) ? 'owned' : avail(n) ? 'avail' : 'locked';
  const fill = st === 'owned' ? col : '#1a1f27';
  const stroke = st === 'owned' ? col : st === 'avail' ? '#5ee38c' : '#4a5462';
  const r = n.size === 'keystone' ? 12 * s : n.size === 'notable' ? 9.5 * s : 6.5 * s;
  const glow = st === 'avail' ? `<circle cx="${x}" cy="${y}" r="${r + 5 * s}" fill="rgba(94,227,140,.18)"/>` : '';
  const ring = sel ? `<circle cx="${x}" cy="${y}" r="${r + 7 * s}" fill="none" stroke="#ffd34d" stroke-width="${2 * s}" stroke-dasharray="${4 * s} ${3 * s}"/>` : '';
  let body: string;
  if (n.size === 'keystone') {
    const pts = Array.from({ length: 6 }, (_, i) => { const a = (Math.PI / 3) * i - Math.PI / 2; return `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`; }).join(' ');
    body = `<polygon points="${pts}" fill="${fill}" stroke="${stroke}" stroke-width="${2.2 * s}"/>`;
  } else if (n.size === 'notable') {
    body = `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" rx="${3.5 * s}" fill="${fill}" stroke="${stroke}" stroke-width="${2.2 * s}"/>`;
  } else body = `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${2 * s}"/>`;
  const tick = st === 'owned' ? `<path d="M${x - r * 0.45} ${y} l${r * 0.3} ${r * 0.32} l${r * 0.6} ${-r * 0.62}" stroke="#10130f" stroke-width="${1.8 * s}" fill="none" stroke-linecap="round"/>` : '';
  return glow + ring + body + tick;
}
function regionSvg(ri: number, w: number, h: number, s: number, opts: { labels?: boolean; sel?: string } = {}) {
  const col = REGIONS[ri].color, p = `r${ri}.`;
  const at = (k: string): [number, number] => [POS[k][0] * w, 12 * s + POS[k][1] * (h - 24 * s - (opts.labels ? 14 : 0))];
  let out = `<line x1="0" y1="${at('s1')[1]}" x2="${at('s1')[0]}" y2="${at('s1')[1]}" stroke="#3a4452" stroke-width="${2 * s}" stroke-dasharray="${3 * s} ${3 * s}"/>`;
  for (const [a, b] of EDGES) {
    const both = owned(node(p + a)) && owned(node(p + b));
    const [x1, y1] = at(a), [x2, y2] = at(b);
    out += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${both ? col : '#3a4452'}" stroke-width="${(both ? 3 : 2) * s}"/>`;
  }
  for (const k of Object.keys(POS)) {
    const n = node(p + k); const [x, y] = at(k);
    out += shape(n, x, y, s, col, opts.sel === n.id);
    if (opts.labels) {
      const short = n.size === 'small' ? n.desc.replace(/^(\+\d+%).*?(damage|range|attack speed|crit chance|DNA).*$/, (_, a, b) => `${a} ${({ damage: 'dmg', range: 'range', 'attack speed': 'speed', 'crit chance': 'crit', DNA: 'DNA' } as Record<string, string>)[b]}`) : n.name;
      out += `<text x="${x}" y="${y + (n.size === 'keystone' ? 26 : n.size === 'notable' ? 23 : 19) * s}" text-anchor="middle" font-size="${9.5}" fill="${owned(n) ? '#eef1e8' : avail(n) ? '#bff5d0' : '#7d8794'}" font-family="Inter" font-weight="600">${short}</text>`;
    }
  }
  return `<svg class="${opts.labels ? 'big' : 'path'}" viewBox="0 0 ${w} ${h}">${out}</svg>`;
}

const frame = (title: string, body: string, extra = '') => `<div class="phone">
  <div class="top"><h3>${title}</h3><span class="x">✕ Map</span></div>
  <div class="sumbar"><span><b>${OWNED.size}</b> passives · <b>${TREE.filter(avail).length}</b> you can take now</span><span>Next costs <span class="cost">${price(0)}</span></span></div>
  <div class="body">${body}</div>${extra}
  <div class="tabs"><span>Zombies</span><span>Squad</span><span class="on">Tree</span><span>Hordes</span><span>Settings</span></div></div>`;

// ---------- A: region paths (each region a small readable map; tap a node for a sheet) ----------
function mockA() {
  const cards = REGIONS.slice(0, 5).map((r, ri) => {
    const ns = nodesOf(ri), got = ns.filter(owned).length;
    if (!open(ri)) return `<div class="rcard closed" style="--rc:${r.color}"><div class="rhead"><b>${r.name}</b><span>🔒 Beat Horde ${r.horde}</span></div><div class="lockline">Keystone: ${ns.find((n) => n.size === 'keystone')!.name}: ${ns.find((n) => n.size === 'keystone')!.desc}</div></div>`;
    const av = ns.filter(avail);
    return `<div class="rcard" style="--rc:${r.color}"><div class="rhead"><b>${r.name}</b><span>${got}/10${av.length ? ` · <span style="color:#5ee38c">${av.length} ready</span>` : ''}</span></div>
      <div class="rprog"><i style="width:${got * 10}%"></i></div>
      ${regionSvg(ri, 360, 78, 1, { sel: ri === 1 ? 'r1.n1' : undefined })}</div>`;
  }).join('');
  const sel = node('r1.n1');
  const sheet = `<div class="sheet" style="--rc:${REGIONS[1].color}"><div class="grab"></div>
    <div class="t"><div class="ico">◆</div><div><h4>${sel.name}</h4><div class="kind">${kindName(sel)} · Marksman · 3 of 10</div></div></div>
    <p>${sel.desc}</p><div class="bigbtn">Allocate <span class="p">${price(1)}</span></div></div>`;
  return frame('Passive Tree', cards, sheet);
}

// ---------- B: step list (each region a numbered checklist; the fork shown as two side-by-side paths) ----------
function mockB() {
  const step = (n: TreeNode, i: string, ri: number) => {
    const st = owned(n) ? 'owned' : avail(n) ? 'avail' : 'locked';
    const right = st === 'owned' ? '<span class="own">✓</span>' : st === 'avail' ? `<span class="alloc">${price(ri)}</span>` : '';
    return `<div class="st ${st} ${n.size === 'notable' ? 'notable' : n.size === 'keystone' ? 'key' : ''}"><div class="n"><span>${st === 'owned' ? '✓' : i}</span></div><div><b>${label(n)}</b>${n.size !== 'small' ? `<span>${n.desc}</span>` : ''}</div>${right}</div>`;
  };
  const region = (ri: number, expanded: boolean) => {
    const r = REGIONS[ri], p = `r${ri}.`, got = nodesOf(ri).filter(owned).length, key = node(p + 'k');
    const head = `<div class="h"><div class="dot">${got}/10</div><div><b style="color:${r.color}">${r.name}</b><span>${open(ri) ? `${nodesOf(ri).filter(avail).length} ready to take` : `🔒 Beat Horde ${r.horde}`}</span></div><span class="chev">${expanded ? '▾' : '▸'}</span></div>`;
    if (!expanded) return `<div class="racc ${open(ri) ? '' : 'closed'}" style="--rc:${r.color}">${head}</div>`;
    return `<div class="racc" style="--rc:${r.color}">${head}<div class="goal">Goal: <i>${key.name}</i>: ${key.desc}</div>
      <div class="steps">${step(node(p + 's1'), '1', ri)}${step(node(p + 's2'), '2', ri)}${step(node(p + 'n1'), '3', ri)}
        <div class="forkhdr"><span>Path A</span><span>Path B</span></div>
        <div class="fork"><div>${['a1', 'a2', 'na'].map((k, i) => step(node(p + k), `${4 + i}`, ri)).join('')}</div><div>${['b1', 'b2', 'nb'].map((k, i) => step(node(p + k), `${4 + i}`, ri)).join('')}</div></div>
        ${step(key, '7', ri)}</div></div>`;
  };
  return frame('Passive Tree', region(1, true) + region(0, false) + region(2, false) + region(3, false) + region(4, false));
}

// ---------- C: whole web as an overview map + a big focused region with labels ----------
function mockC() {
  const W = 360, H = 250, sc = 0.255, cx = W / 2, cy = H / 2 + 2;
  let svg = '';
  const P = (n: TreeNode) => [cx + n.x * sc, cy + n.y * sc] as const;
  for (const n of TREE) for (const l of n.links) if (n.id < l) {
    const o = TREE.find((m) => m.id === l)!; const [x1, y1] = P(n), [x2, y2] = P(o);
    const both = owned(n) && owned(o);
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${both ? (n.region >= 0 ? REGIONS[n.region].color : '#ffd34d') : '#2c343f'}" stroke-width="${both ? 2.2 : 1.2}"/>`;
  }
  for (let ri = 0; ri < REGIONS.length; ri++) {
    const k = node(`r${ri}.k`); const [x, y] = P(k);
    if (ri === 1) svg += `<circle cx="${(x + cx) / 2}" cy="${(y + cy) / 2}" r="44" fill="rgba(255,211,77,.06)" stroke="#ffd34d" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  }
  for (const n of TREE) {
    const [x, y] = P(n);
    if (n.id === 'start') { svg += `<circle cx="${x}" cy="${y}" r="7" fill="#ffd34d"/>`; continue; }
    const col = REGIONS[n.region].color, dim = !open(n.region);
    const r = n.size === 'keystone' ? 5.5 : n.size === 'notable' ? 4.5 : 3;
    const fill = owned(n) ? col : avail(n) ? '#5ee38c' : dim ? '#232a33' : '#3a4452';
    svg += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${avail(n) ? 'stroke="#c8ffd8" stroke-width="1"' : ''}/>`;
  }
  for (let ri = 0; ri < REGIONS.length; ri++) {
    const [x, y] = P(node(`r${ri}.k`)); const r = REGIONS[ri];
    svg += `<text x="${x + (x - cx) * 0.12}" y="${y + (y - cy) * 0.12 + 3}" text-anchor="middle" font-size="9" font-weight="700" font-family="Inter" fill="${open(ri) ? r.color : '#5a6470'}">${open(ri) ? r.name : '🔒 ' + r.name}</text>`;
  }
  const rec = node('r1.n1');
  const body = `<div class="mini"><span class="lbl">Tap a region</span><svg viewBox="0 0 ${W} ${H}">${svg}</svg></div>
    <div class="focus" style="--rc:${REGIONS[1].color}"><div class="fh"><b>Marksman</b><span>2/10 · after Horde 1</span></div>
      ${regionSvg(1, 345, 205, 1.35, { labels: true, sel: 'r1.n1' })}</div>
    <div class="rec" style="--rc:${REGIONS[1].color}"><div class="ico">◆</div><div><b>${rec.name}</b><span>${rec.desc}</span></div><span class="alloc">${price(1)}</span></div>`;
  return frame('Passive Tree', body);
}

const pitch = {
  A: 'Every region is its own small map, stacked in a scroll. Progress bar and "ready" count per region. Tap any node for a sheet with what it does and one Allocate button.',
  B: 'Each region is a numbered checklist you read top to bottom: 3 steps, then two paths side by side, then the keystone goal (shown up front). Open one region at a time.',
  C: 'The whole web stays as a small overview you tap to pick a region; the region below is big and labelled, with the best next pick suggested and one-tap Allocate.',
};
document.getElementById('mocks')!.innerHTML = [['A · Region paths', pitch.A, mockA()], ['B · Step checklist', pitch.B, mockB()], ['C · Map + focus', pitch.C, mockC()]]
  .map(([t, p, html]) => `<section class="mock"><h2>${t}</h2><p class="pitch">${p}</p>${html}</section>`).join('');
await document.fonts.ready;
(window as unknown as { mockReady: boolean }).mockReady = true;
