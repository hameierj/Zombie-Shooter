// The record party: when you take a leaderboard record (#1 in any ranking, or the fastest time for a horde), the battle
// and play clock pause and a zombie DJ throws a block party in your honour. It can't be skipped: the button only shows
// once the party has played out. Nothing is lost: the game is paused the whole time (see overlayUp in unlocks.ts).
import { classIcon, zombieIcon } from '../game/art.ts';
import * as M from '../core/model.ts';
import * as sfx from '../audio/sfx.ts';

let el: HTMLDivElement | null = null;
export const partyUp = () => !!el;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PARTY_MS = 9000;
const SHOUTS = ['THIS ONE GOES OUT TO', 'MAKE SOME NOISE FOR', 'EVERYBODY SCREAM FOR', 'BRAAAINS AND BEATS FOR'];

/** Throw the party for one or more fresh records (title, plus who it was stolen from and by how much). */
const ROASTS = [(x: string) => `${x} has been demoted to zombie. Respectfully.`, (x: string) => `Nothing personal, ${x}. Strictly leaderboard business.`,
  (x: string) => `${x} will be remembered. Briefly.`, (x: string) => `Sorry ${x}. The top spot only seats one.`, (x: string) => `${x} stood still for one second too long. Classic ${x}.`,
  (x: string) => `${x} has left the leaderboard. And the land of the living.`];

export function throwParty(records: { title: string; sub: string; from?: string }[], name: string, shooter: M.ClassId = 'pistol', onDone?: () => void) {
  if (el || !records.length) return;
  el = document.createElement('div');
  el.id = 'party';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'New record celebration');
  // the dethroned leader (the one you took the most from) gets a cameo: as a zombie, with a name tag, briefly
  const tally = new Map<string, number>(); for (const r of records) if (r.from) tally.set(r.from, (tally.get(r.from) ?? 0) + 1);
  const victim = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const crowd = ['shambler', 'runner', 'brute', 'spitter', 'bloater', 'crawler', 'jogger', 'office', 'farmer']
    .filter((z) => M.ZOMBIE_IDS.includes(z as M.ZombieId)).slice(0, 7)
    .map((z, i) => `<img class="px pz" src="${zombieIcon(z as M.ZombieId)}" alt="" style="--d:${(i * 0.13).toFixed(2)}s;--x:${i}">`).join('');
  const confetti = Array.from({ length: 46 }, (_, i) => `<i style="--l:${Math.random() * 100}%;--t:${(1.8 + Math.random() * 2.2).toFixed(2)}s;--dl:${(Math.random() * 3).toFixed(2)}s;--h:${Math.floor(Math.random() * 360)};--r:${Math.floor(Math.random() * 720 - 360)}deg"></i>`).join('');
  el.innerHTML = `<div class="pt-lights"><b></b><b></b><b></b></div><div class="pt-confetti">${confetti}</div>
    <div class="pt-stage">
      <p class="pt-eyebrow">🏆 New leaderboard record 🏆</p>
      <h2 class="pt-title">BLOCK PARTY!</h2>
      <ul class="pt-recs">${records.slice(0, 6).map((r) => `<li><b>${esc(r.title)}</b><span>${esc(r.sub)}</span></li>`).join('')}${records.length > 6 ? `<li>+${records.length - 6} more</li>` : ''}</ul>
      ${victim ? `<div class="pt-duel" style="--sx:0">
        <div class="pt-shooter"><span class="pt-tag me">${esc(name)}</span><img class="px" src="${classIcon(shooter)}" alt=""><i class="pt-flash"></i></div>
        <i class="pt-tracer"></i>
        <div class="pt-victim"><span class="pt-tag">${esc(victim)}</span><img class="px" src="${zombieIcon('shambler')}" alt=""><i class="pt-xx">✕✕</i></div>
      </div>
      <p class="pt-roast">${esc(ROASTS[Math.floor(Math.random() * ROASTS.length)](victim))}</p>` : ''}
      <div class="pt-dj">
        <div class="pt-bubble">${SHOUTS[Math.floor(Math.random() * SHOUTS.length)]}<br><b>COMMANDER ${esc(name.toUpperCase())}!!!</b></div>
        <div class="pt-booth"><span class="pt-deck"></span><img class="px pt-djz" src="${zombieIcon('brute')}" alt=""><i class="pt-phones"></i><span class="pt-deck"></span></div>
      </div>
      <div class="pt-crowd">${crowd}</div>
      <div class="pt-foot"><span class="pt-wait">The party's still going…</span><button class="btn pt-done" type="button" hidden>Back to the fight ›</button></div>
    </div>`;
  document.body.appendChild(el);
  const behind = ['app', 'modal', 'toasts'].map((id) => document.getElementById(id)).filter((x): x is HTMLElement => !!x);
  for (const b of behind) b.inert = true;   // nothing behind the party can be reached, not even by keyboard
  const app = { set inert(v: boolean) { for (const b of behind) b.inert = v; } };
  sfx.partyStart();
  if (victim) { window.setTimeout(() => { if (el) sfx.shot(shooter); }, 2600); window.setTimeout(() => { if (el) sfx.groan(); }, 2750); }
  const done = el.querySelector<HTMLButtonElement>('.pt-done')!, wait = el.querySelector<HTMLElement>('.pt-wait')!;
  // it plays out in full: only time with the party on screen counts (leave the app and it waits, animations frozen)
  let shown = 0, last = performance.now();
  const clock = window.setInterval(() => {
    const now = performance.now(), dt = now - last; last = now;
    el?.classList.toggle('pt-paused', document.hidden);
    if (document.hidden || !el) return;
    shown += Math.min(dt, 250);
    if (shown >= PARTY_MS) { window.clearInterval(clock); wait.hidden = true; done.hidden = false; done.focus({ preventScroll: true }); }
  }, 100);
  done.addEventListener('click', () => {
    if (done.hidden || shown < PARTY_MS) return;
    sfx.partyStop();
    if (app) app.inert = false;
    onDone?.();
    const gone = el; el = null;
    gone?.classList.add('pt-bye'); window.setTimeout(() => gone?.remove(), 300);
  });
}
