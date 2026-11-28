// Evolution scenes: a forced, full-screen moment whenever something evolves. Recruits pick one of their two ultimate
// tracks (there's no way out but choosing), then the old weapon charges up, flashes and turns into the new one. Zombies
// evolve on their own (a new form joining the stream, or their ultimate form) and get the same transformation scene.
// The battle, auto-buy and the play timer all wait while a scene is up (see overlayUp in unlocks.ts).
import * as M from '../core/model.ts';
import type { ClassId, ZombieId } from '../core/model.ts';
import { game } from '../core/state.ts';
import { gunIcon, zombieIcon } from '../game/art.ts';
import { fmtLn, fmtMult } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';
import { skipAnims } from '../core/prefs.ts';

/** With animations skipped, evolutions show a short notice instead of their scene (set by the UI). */
let notice: (title: string, sub: string, color: string, icon: string) => void = () => {};
export function setEvoNotice(fn: typeof notice) { notice = fn; }

type Scene = { kind: 'unit'; cls: ClassId } | { kind: 'zult'; id: ZombieId } | { kind: 'release'; id: ZombieId };
const queue: Scene[] = [];
let el: HTMLDivElement | null = null;
let autoT = 0;
export const evoUp = () => !!el || queue.length > 0;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const key = (s: Scene) => (s.kind === 'unit' ? `u:${s.cls}` : `${s.kind}:${s.id}`);

/** Queue a scene (once per thing). */
export function playEvolution(s: Scene) {
  if (queue.some((q) => key(q) === key(s))) return;
  if (skipAnims() && s.kind !== 'unit') {   // zombies: no scene, just a notice (a unit still needs its weapon chosen)
    const st = M.strainById(s.id);
    if (s.kind === 'zult') notice(`Ultimate ${st.name}`, `×${M.CONFIG.zUltDna} ${st.dna} DNA per kill · ×${M.CONFIG.zUltHp} HP`, st.color, zombieIcon(s.id));
    else notice(`${st.plural} evolved`, `Form ${M.stageOf(s.id) + 1} joins the stream`, st.color, zombieIcon(s.id));
    return;
  }
  queue.push(s);
  if (!el) open();
}

function open() {
  const s = queue[0];
  if (!s) return;
  el = document.createElement('div');
  el.id = 'evo';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  document.body.appendChild(el);
  if (s.kind === 'unit') choose(s.cls); else zombie(s);
}
function close() {
  window.clearTimeout(autoT);
  queue.shift();
  const gone = el;
  el = null;
  if (gone) { gone.classList.add('evo-bye'); window.setTimeout(() => gone.remove(), 260); }
  if (queue.length) window.setTimeout(open, 280);
}

const sparks = (n = 22) => Array.from({ length: n }, (_, i) => `<i style="--a:${(i / n) * 360 + Math.random() * 10}deg;--d:${90 + Math.random() * 90}px;--t:${0.6 + Math.random() * 0.4}s"></i>`).join('');

// ---------- recruits: choose a track (mandatory), then the transformation ----------
function choose(cls: ClassId) {
  if (!el) return;
  const cd = M.classById(cls), col = cd.primary;
  const cards = M.ULTS[cls].map((d, i) => `<button class="evo-pick" type="button" data-evo="${i}" style="--uc:${d.color}">
      <img class="px" src="${gunIcon(cls, i as 0 | 1)}" alt="">
      <span class="evo-tag">${esc(d.tag)}</span><b>${esc(d.name)}</b><small>${esc(d.gun)}</small>
      <p>${esc(d.desc)}</p>
      <span class="evo-stats">×${M.CONFIG.ultDps} DPS · fire rate ${fmtMult(d.fx.rate)}</span>
    </button>`).join('');
  el.innerHTML = `<div class="evo-wrap evo-choose" style="--c:${M.strainById(col).color}">
      <p class="evo-eyebrow">Ultimate form unlocked</p>
      <h2 class="evo-title">${esc(cd.plural)} are ready to evolve</h2>
      <div class="evo-cur"><img class="px" src="${gunIcon(cls)}" alt=""><span>${esc(cd.gun)}</span></div>
      <p class="evo-sub">Pick their new weapon. The choice is permanent; both double their damage.</p>
      <div class="evo-picks">${cards}</div>
      <button class="btn evo-go" type="button" disabled>Choose a weapon</button>
      <p class="evo-cost">Costs ${fmtLn(game.ultCost(cls))} ${esc(M.strainById(col).dna)} DNA</p>
    </div>`;
  sfx.unlock(2);
  let pick: 0 | 1 | null = null;
  const go = el.querySelector<HTMLButtonElement>('.evo-go')!;
  el.querySelectorAll<HTMLButtonElement>('.evo-pick').forEach((b) => b.addEventListener('click', () => {
    pick = Number(b.dataset.evo) as 0 | 1;
    el?.querySelectorAll('.evo-pick').forEach((x) => x.classList.toggle('on', x === b));
    go.disabled = false; go.textContent = `Evolve into ${M.ULTS[cls][pick].name}`;
    sfx.click();
  }));
  go.addEventListener('click', () => {
    if (pick === null) return;
    if (!game.evolveUnit(cls, pick)) { go.textContent = 'Not enough DNA'; sfx.denied(); window.setTimeout(close, 900); return; }
    const d = M.ULTS[cls][pick];
    if (skipAnims()) { notice(`${cd.plural}: ${d.name}`, `They now carry the ${d.gun} · ×${M.CONFIG.ultDps} DPS`, d.color, gunIcon(cls, pick)); close(); return; }
    transform(gunIcon(cls), gunIcon(cls, pick), d.color, `${cd.plural} · ultimate form`, d.name,
      `Your ${esc(cd.plural.toLowerCase())} now carry the <b style="color:${d.color}">${esc(d.gun)}</b>. ${esc(d.desc)}`, 'weapon');
  });
}

// ---------- zombies: evolve automatically, then the transformation ----------
function zombie(s: Extract<Scene, { kind: 'zult' | 'release' }>) {
  const st = M.strainById(s.id);
  if (s.kind === 'zult') {
    transform(zombieIcon(s.id), zombieIcon(s.id), st.color, `${st.plural} · ultimate form`, `Ultimate ${st.name}`,
      `They mutate into their ultimate form: <b style="color:${st.color}">×${M.CONFIG.zUltDna} ${esc(st.dna)} DNA</b> per kill and <b>×${M.CONFIG.zUltHp} HP</b>.`, 'ult');
  } else {
    const from = st.unlock ? M.strainById(st.unlock.from) : st, stage = M.stageOf(s.id);
    transform(zombieIcon(from.id), zombieIcon(s.id), st.color, `${from.plural} evolved`, `${st.plural}!`,
      `Form ${stage + 1} of the ${esc(st.dna.toLowerCase())} family joins the stream. Tier 1 is as tough and as rich as tier ${M.TIER_CAP * stage + 1}.`, 'form');
  }
}

/** The shared transformation: the old icon charges and shakes, a white flash, the new one bursts in with rays. */
function transform(fromIcon: string, toIcon: string, color: string, eyebrow: string, title: string, body: string, kind: 'weapon' | 'ult' | 'form') {
  if (!el) return;
  el.innerHTML = `<div class="evo-wrap evo-anim evo-${kind}" style="--c:${color}">
      <div class="evo-stage">
        <div class="evo-rays"></div><div class="evo-ring"></div><div class="evo-sparks">${sparks()}</div>
        <img class="evo-from px" src="${fromIcon}" alt="">
        <img class="evo-to px" src="${toIcon}" alt="">
        <div class="evo-flash"></div>
      </div>
      <p class="evo-eyebrow">${esc(eyebrow)}</p>
      <h2 class="evo-title">${esc(title)}</h2>
      <p class="evo-body">${body}</p>
      <button class="btn evo-done" type="button">Back to the fight</button>
    </div>`;
  sfx.evolveCharge();
  window.setTimeout(() => { sfx.evolveBlast(); sfx.unlock(3); }, 1500);
  const done = el.querySelector<HTMLButtonElement>('.evo-done')!;
  done.disabled = true; window.setTimeout(() => { done.disabled = false; }, 2400);   // no skipping before the reveal
  done.addEventListener('click', close);
  window.clearTimeout(autoT);
  autoT = window.setTimeout(() => { if (el) close(); }, 9000);
}
