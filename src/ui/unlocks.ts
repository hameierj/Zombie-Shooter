// The reward overlay: after a horde is beaten (or a zombie type evolves) the battle pauses and each unlock gets its own
// card (the horde and its reward, a new recruit, a new zombie colour, a new passive-tree region) with light rays, a
// sparkle burst and a fanfare. Tap Next (or anywhere, once the card has landed) to go on; the game resumes after the last.
import * as M from '../core/model.ts';
import type { ClassId, ZombieId } from '../core/model.ts';
import { REGIONS, treeNode } from '../core/tree.ts';
import { classIcon, crateIcon, gunIcon, vialIcon, zombieIcon } from '../game/art.ts';
import * as sfx from '../audio/sfx.ts';

export interface Card { eyebrow: string; title: string; body: string; icon: string; color: string; extra?: string; bio?: boolean }
/** An animated biohazard symbol (inline SVG, coloured by currentColor). */
export function biohazard(cls = 'bio') {
  const pts = [0, 120, 240].map((a) => [Math.cos(((a - 90) * Math.PI) / 180), Math.sin(((a - 90) * Math.PI) / 180)]);
  const id = `bm${Math.random().toString(36).slice(2, 8)}`;
  return `<svg class="${cls}" viewBox="-16 -16 32 32" aria-hidden="true"><defs><mask id="${id}"><rect x="-16" y="-16" width="32" height="32" fill="#fff"/>${
    pts.map(([x, y]) => `<circle cx="${(x * 7.6).toFixed(2)}" cy="${(y * 7.6).toFixed(2)}" r="4.7" fill="#000"/>`).join('')}<circle r="2.3" fill="#000"/></mask></defs><g mask="url(#${id})">${
    pts.map(([x, y]) => `<circle cx="${(x * 5).toFixed(2)}" cy="${(y * 5).toFixed(2)}" r="7.2" fill="currentColor"/>`).join('')}</g><circle r="4.6" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>`;
}
let up = false;
export const overlayUp = () => up;
const queue: Card[] = [];

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Cards for everything a horde win unlocks. `reward` is a short HTML line for the reward item (or ''). */
export function hordeCards(k: number, reward: { title: string; sub: string; icon: string; color: string } | null): Card[] {
  const h = M.hordeDef(k), cards: Card[] = [];
  cards.push({ eyebrow: h.elite ? 'Elite horde beaten' : `Horde ${k} beaten`, title: 'Victory!', color: '#ffd34d', icon: reward?.icon ?? crateIcon('rare'),
    body: reward ? `Reward: <b style="color:${reward.color}">${esc(reward.title)}</b><br><span class="uk-sub">${esc(reward.sub)}</span>` : 'The street is yours. For now.' });
  if (h.cls) {
    const c = M.classById(h.cls as ClassId);
    const range = c.range >= 0.8 ? 'very long range' : c.range >= 0.55 ? 'long range' : c.range >= 0.3 ? 'medium range' : 'short range';
    cards.push({ eyebrow: 'New recruit', title: c.plural, color: M.strainById(c.primary).color, icon: classIcon(c.id),
      body: `<b>${esc(c.gun)}</b> · ${range}${c.targets > 1 ? ` · hits ${c.targets} at once` : ''}<br><span class="uk-sub">Ability: <b>${esc(c.ability.name)}</b>, ${esc(c.ability.stages[0])}.</span>`,
      extra: `<span class="uk-tip">Hire them in the Squad tab or from the quick rail. Paid in ${M.strainById(c.primary).dna} DNA.</span>` });
  }
  for (const [id, hk] of Object.entries(M.COLOUR_HORDE) as [ZombieId, number][]) {
    if (hk !== k) continue;
    const st = M.strainById(id);
    cards.push({ eyebrow: 'New zombie colour', title: st.plural, color: st.color, icon: zombieIcon(id),
      body: `They join the horde and drop <b style="color:${st.color}">${esc(st.dna)} DNA</b>, a whole new currency.<br><span class="uk-sub">Raise their tier to earn more of it; units and passives priced in ${esc(st.dna.toLowerCase())} use it.</span>`,
      extra: `<img class="uk-vial px" src="${vialIcon(id as M.StrainId)}" alt="">` });
  }
  if (k === 10) cards.push({ eyebrow: 'New feature', title: 'Auto-buy', color: '#5ee38c', icon: crateIcon('epic'),
    body: 'Your squad can now shop for itself: zombie tiers and spawn, recruits and their upgrades, and global upgrades, always the cheapest first in each colour, and never so much that the zombies overrun you.',
    extra: '<span class="uk-tip">Use the AUTO switches in the top-left of the map: Zombies, Troops and Globals, each on or off on its own.</span>' });
  REGIONS.forEach((r, i) => {
    if (r.horde !== k || i === 0) return;
    const key = treeNode(`r${i}.k`);
    cards.push({ eyebrow: 'New passive-tree region', title: r.name, color: r.color, icon: vialIcon(r.dna),
      body: `Paid in <b style="color:${M.strainById(r.dna).color}">${esc(M.strainById(r.dna).dna)} DNA</b>.${key ? `<br><span class="uk-sub">Goal: <b>${esc(key.name)}</b>, ${esc(key.desc)}</span>` : ''}`,
      extra: '<span class="uk-tip">Open the Tree tab to start it.</span>' });
  });
  return cards;
}
export function evolveCard(id: ZombieId): Card {
  const st = M.strainById(id), stage = M.stageOf(id);
  return { eyebrow: 'Evolution', title: `${st.plural}!`, color: st.color, icon: zombieIcon(id), bio: true,
    body: `Form ${stage + 1} of the ${esc(st.dna.toLowerCase())} family. Tier 1 is as tough and as rich as tier ${M.TIER_CAP * stage + 1}.<br><span class="uk-sub">They join the stream alongside the older forms${M.isLastForm(id) ? ', and this final form has no tier cap' : `; at tier ${M.TIER_CAP} the next form opens`}.</span>` };
}

export function ultCard(c: ClassId, evo: 0 | 1): Card {
  const cd = M.classById(c), d = M.ULTS[c][evo];
  return { eyebrow: `${cd.plural} · ultimate form`, title: d.name, color: d.color, icon: gunIcon(c, evo), bio: true,
    body: `Your ${esc(cd.plural.toLowerCase())} now carry the <b style="color:${d.color}">${esc(d.gun)}</b>. ${esc(d.desc)}<br><span class="uk-sub">×${M.CONFIG.ultDps} DPS · fire rate ${d.fx.rate < 1 ? 'slower' : 'faster'} (×${d.fx.rate}) · Damage upgrades keep scaling it.</span>` };
}

export function zombieUltCard(id: ZombieId): Card {
  const st = M.strainById(id);
  return { eyebrow: `${st.plural} · ultimate form`, title: `Ultimate ${st.name}`, color: st.color, icon: zombieIcon(id), bio: true,
    body: `Your ${esc(st.plural.toLowerCase())} mutate into their ultimate form: <b style="color:${st.color}">×${M.CONFIG.zUltDna} ${esc(st.dna)} DNA</b> per kill and <b>×${M.CONFIG.zUltHp} HP</b>.<br><span class="uk-sub">They're bigger and glow at their feet. Horde zombies are unchanged.</span>` };
}

export function showCards(cards: Card[], delay = 0) {
  if (!cards.length) return;
  queue.push(...cards);
  if (up) { renderDots(); return; }
  up = true;
  window.setTimeout(open, delay);
}

let el: HTMLDivElement | null = null, idx = 0, landed = 0, total = 0;
function open() {
  el = document.createElement('div');
  el.id = 'unlock';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  idx = 0; total = queue.length;
  el.addEventListener('click', (e) => { if ((e.target as Element).closest('.uk-next') || performance.now() > landed) next(); });
  window.addEventListener('keydown', onKey);
  show();
}
function onKey(e: KeyboardEvent) { if (el && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); next(); } }
function show() {
  const c = queue[0];
  if (!el || !c) return;
  idx++;
  const sparks = Array.from({ length: 16 }, (_, i) => `<i style="--a:${(i / 16) * 360 + Math.random() * 12}deg;--d:${70 + Math.random() * 70}px;--t:${0.5 + Math.random() * 0.35}s"></i>`).join('');
  const last = queue.length === 1;
  el.innerHTML = `<div class="uk-card" style="--c:${c.color}">
      <div class="uk-stage"><div class="uk-rays"></div>${c.bio ? biohazard('uk-bio') : ''}<div class="uk-sparks">${sparks}</div><img class="uk-icon px" src="${c.icon}" alt=""></div>
      <p class="uk-eyebrow">${esc(c.eyebrow)}</p>
      <h2 class="uk-title">${esc(c.title)}</h2>
      <p class="uk-body">${c.body}</p>
      ${c.extra ? `<div class="uk-extra">${c.extra}</div>` : ''}
      <div class="uk-foot"><span class="uk-dots"></span><button class="btn uk-next" type="button">${last ? 'Back to the fight' : 'Next ›'}</button></div>
    </div>`;
  renderDots();
  landed = performance.now() + 650;   // ignore stray taps until the card has landed
  sfx.unlock(idx - 1);
  (el.querySelector('.uk-next') as HTMLButtonElement | null)?.focus({ preventScroll: true });
}
function renderDots() {
  const d = el?.querySelector('.uk-dots');
  if (d) d.innerHTML = Array.from({ length: Math.max(total, idx + queue.length - 1) }, (_, i) => `<b class="${i < idx ? 'on' : ''}"></b>`).join('');
}
function next() {
  if (!el) return;
  queue.shift();
  if (queue.length) { sfx.nextCard(); el.querySelector('.uk-card')?.classList.add('uk-out'); window.setTimeout(show, 160); return; }
  el.classList.add('uk-bye');
  window.removeEventListener('keydown', onKey);
  const gone = el; el = null;
  window.setTimeout(() => { gone.remove(); up = false; }, 220);
}
