// The tutorial: short coach steps that appear when they become useful (the battle, the shredder, ranges, raising a tier,
// the squad, combos, the first horde, a new colour, the tree, evolving). Each one dims the screen around a spotlight on
// the thing it's about, with an animated tapping finger and a speech bubble, and pauses the game until "Got it". Steps
// already seen are kept in the save (`tut`); "Skip tutorial" marks them all as seen.
import * as M from '../core/model.ts';
import { game } from '../core/state.ts';
import { titleUp } from './title.ts';
import { overlayUp } from './unlocks.ts';
import * as sfx from '../audio/sfx.ts';

let up = false;
export const coachUp = () => up;

interface Step { id: string; title: string; text: string; when: () => boolean; target: () => DOMRect | null; enter?: () => void }
const el = (sel: string) => document.querySelector<HTMLElement>(sel);
const rectOf = (sel: string) => { const e = el(sel); if (!e || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return r.width && r.height ? r : null; };
const scene = () => (window as unknown as { zscene?: { flashRanges(s: number): void; layoutFractions(): { shred0: number; shred1: number; roof1: number } } }).zscene;
function fieldPart(from: number, to: number) {
  const f = rectOf('#field'); if (!f) return null;
  return new DOMRect(f.left + f.width * from, f.top, f.width * (to - from), f.height);
}
const anyTierAtLeast = (t: number) => M.activeStrains(game.s.strains).some((s) => game.s.strains[s].maxTier >= t);

const STEPS: Step[] = [
  { id: 'welcome', title: 'Hold the street', text: 'Zombies walk toward your squad on the rooftop. Every kill pays <b>DNA</b> in that zombie’s colour; your DNA is in the top bar.',
    when: () => game.s.playSec > 3, target: () => fieldPart(0, 1) },
  { id: 'shredder', title: 'The shredder', text: 'Zombies that reach this spike barricade get shredded, but they pay <b>no DNA</b> and halve that type’s combo. Keep your squad strong enough to stop them first.',
    when: () => game.s.kills >= 6, target: () => { const L = scene()?.layoutFractions(); return L ? fieldPart(L.shred0, L.shred1) : null; } },
  { id: 'range', title: 'Range', text: 'These dashed lines show how far each unit type can shoot. Zombies are only hit inside them; upgrade <b>Range</b> to reach them sooner.',
    when: () => game.s.kills >= 14, target: () => fieldPart(0, 0.75), enter: () => scene()?.flashRanges(9) },
  { id: 'tier', title: 'Raise a zombie tier', text: 'Tap a zombie on the rail and press <b>DNA +</b>. Each tier makes that type tougher but pays more DNA per kill: the main way your income grows.',
    when: () => game.canAfford('shambler', game.tierCost('shambler')) && game.s.strains.shambler.maxTier < 4,
    target: () => rectOf('#zrail .zr-z[data-arg="shambler"]') ?? rectOf('#zrail .zr-toggle') ?? rectOf('#tabs [data-arg="zombies"]') },
  { id: 'squad', title: 'Grow your squad', text: 'Switch the rail to <b>Units</b> (or open Squad) to hire soldiers and upgrade them. A stronger squad lets you push zombie tiers higher.',
    when: () => game.s.strains.shambler.maxTier >= 3 || game.canHire('pistol'),
    target: () => rectOf('#zrail .zr-seg [data-arg="u"]') ?? rectOf('#tabs [data-arg="squad"]') },
  { id: 'combo', title: 'Combos', text: 'Each zombie type has its own combo: kill the same type quickly and its DNA is multiplied, up to <b>×1.5</b>. It drops if you stop, and halves when one reaches the shredder.',
    when: () => game.combo >= 15, target: () => rectOf('#combo') },
  { id: 'horde', title: 'A horde is ready', text: 'Your squad can take on a <b>horde</b>. Open Hordes and start it. Beat it to unlock new recruits, a new zombie colour and more.',
    when: () => game.s.hordes === 0 && game.hordeOdds() >= M.CONFIG.hordeWinOdds, target: () => rectOf('#tabs [data-arg="hordes"]') },
  { id: 'colour', title: 'A new colour', text: 'Runners drop <b>Yellow DNA</b>. Spend it on Runners’ tiers, Hunters and the Marksman tree: every colour is its own economy.',
    when: () => game.s.hordes >= 1 && game.s.strains.runner.unlocked, target: () => rectOf('#hud-dna [data-dna="runner"]') },
  { id: 'tree', title: 'The passive tree', text: 'Passives in the <b>Tree</b> boost your whole squad. Each region has its own price ladder, paid in its own colour.',
    when: () => game.s.hordes >= 1 && game.allocatableCount() > 0, target: () => rectOf('#tabs [data-arg="tree"]') },
  { id: 'evolve', title: 'Evolution', text: 'At <b>tier 50</b> a zombie type can evolve into a tougher, much richer form that joins the stream. When it’s ready, tap it on the rail and press <b>Evolve</b>.',
    when: () => anyTierAtLeast(40), target: () => rectOf('#zrail .zr-list') ?? rectOf('#tabs [data-arg="zombies"]') },
  { id: 'ultimate', title: 'Ultimate form', text: 'One of your unit types has every upgrade except Damage maxed. It can now take an <b>ultimate form</b>: pick one of two tracks. Both double its DPS but play very differently.',
    when: () => M.CLASSES.some((c) => game.ultReady(c.id)), target: () => rectOf('#zrail .zr-seg [data-arg="u"]') ?? rectOf('#tabs [data-arg="squad"]') },
];

let lastShown = 0;
function blocked() {
  return titleUp() || overlayUp() || up || document.hidden
    || document.getElementById('app')?.classList.contains('menu-open') || !(document.getElementById('modal')?.hidden ?? true);
}
function tick() {
  if (blocked() || performance.now() - lastShown < 7000) return;
  const seen = new Set(game.s.tut ?? []);
  if (seen.has('*')) return;
  const step = STEPS.find((s) => !seen.has(s.id) && s.when());
  if (!step) return;
  const r = step.target();
  if (!r) return;
  show(step, r);
}
function mark(id: string) { game.s.tut = [...new Set([...(game.s.tut ?? []), id])]; game.save(); }

let box: HTMLDivElement | null = null;
function show(step: Step, r: DOMRect) {
  up = true;
  step.enter?.();
  const pad = 6, vw = window.innerWidth, vh = window.innerHeight;
  const sx = Math.max(4, r.left - pad), sy = Math.max(4, r.top - pad), sw = Math.min(vw - 8, r.width + pad * 2), sh = Math.min(vh - 8, r.height + pad * 2);
  const below = sy + sh / 2 < vh * 0.45, bw = Math.min(310, vw - 24);
  const bx = Math.max(12, Math.min(vw - bw - 12, sx + sw / 2 - bw / 2));
  const big = sh > vh * 0.5;   // a big spotlight (the battlefield): put the bubble in the middle of it
  const by = big ? vh * 0.5 - 70 : below ? Math.min(vh - 190, sy + sh + 14) : Math.max(12, sy - 14);
  const arrowX = Math.max(18, Math.min(bw - 18, sx + sw / 2 - bx));
  const n = STEPS.findIndex((s) => s.id === step.id) + 1;
  box = document.createElement('div');
  box.id = 'coach';
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', step.title);
  box.innerHTML = `<div class="co-spot ${big ? 'big' : ''}" style="left:${sx}px;top:${sy}px;width:${sw}px;height:${sh}px"></div>
    ${big ? '' : `<div class="co-hand" style="left:${sx + sw * 0.62}px;top:${sy + sh * 0.55}px" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10m0-1.5a1.5 1.5 0 0 1 3 0V11m0-1a1.5 1.5 0 0 1 3 0v1.5m0-.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-1.6a6 6 0 0 1-4.9-2.5L4.4 15a1.6 1.6 0 0 1 2.4-2.1L9 15"/></svg></div>`}
    <div class="co-bubble ${big ? 'mid' : below ? 'down' : 'up'}" style="left:${bx}px;${big || below ? `top:${by}px` : `bottom:${vh - by}px`};width:${bw}px;--ax:${arrowX}px">
      <span class="co-step">Tip ${n} of ${STEPS.length}</span>
      <b class="co-title">${step.title}</b>
      <p>${step.text}</p>
      <div class="co-foot"><button class="co-skip" type="button">Skip tutorial</button><button class="btn co-ok" type="button">Got it</button></div>
    </div>`;
  document.body.appendChild(box);
  sfx.nextCard();
  const done = (all: boolean) => {
    mark(all ? '*' : step.id);
    lastShown = performance.now();
    box?.classList.add('co-bye');
    const b = box; box = null;
    window.removeEventListener('keydown', key);
    window.setTimeout(() => { b?.remove(); up = false; }, 200);
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); done(false); } };
  box.querySelector('.co-ok')!.addEventListener('click', () => done(false));
  box.querySelector('.co-skip')!.addEventListener('click', () => done(true));
  window.addEventListener('keydown', key);
  (box.querySelector('.co-ok') as HTMLButtonElement).focus({ preventScroll: true });
}

export function initTutorial() { window.setInterval(tick, 600); }
