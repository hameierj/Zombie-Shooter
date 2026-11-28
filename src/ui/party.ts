// The record party: when you take a leaderboard record (#1 in any ranking, or the fastest time for a horde), the battle
// and play clock pause and a zombie DJ throws a block party in your honour. It plays in three acts, so nothing is missed:
//   1. the record: banner, confetti, what you beat and who you took it from;
//   2. the execution: the lights drop, everything else fades, and a spotlight shows the dethroned leader (or your future
//      self, out of a portal) getting shot, slowly, with a caption to read;
//   3. the party: lights up, the DJ and the crowd take over.
// It can't be skipped: only time with the party on screen counts, everything behind it is inert, and the button only
// appears once all three acts have played out.
import { classIcon, zombieIcon } from '../game/art.ts';
import * as M from '../core/model.ts';
import * as sfx from '../audio/sfx.ts';

let el: HTMLDivElement | null = null;
export const partyUp = () => !!el;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const SHOUTS = ['THIS ONE GOES OUT TO', 'MAKE SOME NOISE FOR', 'EVERYBODY SCREAM FOR', 'BRAAAINS AND BEATS FOR'];
const ROASTS = [(x: string) => `${x} has been demoted to zombie. Respectfully.`, (x: string) => `Nothing personal, ${x}. Strictly leaderboard business.`,
  (x: string) => `${x} will be remembered. Briefly.`, (x: string) => `Sorry ${x}. The top spot only seats one.`, (x: string) => `${x} stood still for one second too long. Classic ${x}.`,
  (x: string) => `${x} has left the leaderboard. And the land of the living.`];
// beating your own record: your future self steps out of a portal to warn you, and doesn't get to finish
const SELF_ROASTS = ['Time paradox resolved. Violently.', 'You can\'t be beaten. Not even by you.', 'History is written by the faster.',
  'Whatever the warning was, it\'s probably fine.', 'The timeline is safe. Your future self is less so.'];

// act lengths (ms of on-screen time)
const INTRO = 4000, DUEL = 8500, DUEL_SELF = 10000, PARTY = 6500;

export function throwParty(records: { title: string; sub: string; from?: string }[], name: string, shooter: M.ClassId = 'pistol', onDone?: () => void) {
  if (el || !records.length) return;
  // the dethroned leader (the one you took the most from) gets a cameo: as a zombie, with a name tag, briefly
  const tally = new Map<string, number>(); for (const r of records) if (r.from) tally.set(r.from, (tally.get(r.from) ?? 0) + 1);
  const victim = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const self = !!victim && victim.startsWith('Past ');
  const duelMs = !victim ? 0 : self ? DUEL_SELF : DUEL;
  const total = INTRO + duelMs + PARTY;

  el = document.createElement('div');
  el.id = 'party';
  el.className = 'act-intro';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'New record celebration');
  const crowd = ['shambler', 'runner', 'brute', 'spitter', 'bloater', 'crawler', 'jogger', 'office', 'farmer']
    .filter((z) => M.ZOMBIE_IDS.includes(z as M.ZombieId)).slice(0, 7)
    .map((z, i) => `<img class="px pz" src="${zombieIcon(z as M.ZombieId)}" alt="" style="--d:${(i * 0.13).toFixed(2)}s">`).join('');
  const confetti = Array.from({ length: 46 }, () => `<i style="--l:${Math.random() * 100}%;--t:${(1.8 + Math.random() * 2.2).toFixed(2)}s;--dl:${(Math.random() * 3).toFixed(2)}s;--h:${Math.floor(Math.random() * 360)};--r:${Math.floor(Math.random() * 720 - 360)}deg"></i>`).join('');
  el.innerHTML = `<div class="pt-lights"><b></b><b></b><b></b></div><div class="pt-confetti">${confetti}</div>
    <div class="pt-stage">
      <p class="pt-eyebrow">🏆 Leaderboard · block party 🏆</p>
      <h2 class="pt-title">NEW RECORD!</h2>
      <ul class="pt-recs">${records.slice(0, 6).map((r) => `<li><b>${esc(r.title)}</b><span>${esc(r.sub)}</span></li>`).join('')}${records.length > 6 ? `<li>+${records.length - 6} more</li>` : ''}</ul>
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
  sfx.partyStart();

  // act 2: the execution, in a spotlight (built when it starts, so its animations run from that moment)
  const duelHtml = () => `<div class="pt-spot ${self ? 'self' : ''}">
      <p class="pt-cap">${self ? 'Wait… who is that?' : 'Meanwhile, the former #1…'}</p>
      <div class="pt-duel ${self ? 'self' : ''}">
        <div class="pt-shooter"><span class="pt-tag me">${esc(name)}</span><img class="px" src="${classIcon(shooter)}" alt=""><i class="pt-flash"></i></div>
        <i class="pt-tracer"></i>
        ${self ? '<i class="pt-portal"></i>' : ''}
        <div class="pt-victim">${self ? '<span class="pt-say"><span>Wait! I\'m you from the futu—</span></span>' : ''}<span class="pt-tag">${esc(self ? `${name}?` : victim!)}</span><img class="px ${self ? 'pt-twin' : ''}" src="${self ? classIcon(shooter) : zombieIcon('shambler')}" alt=""><i class="pt-xx">✕✕</i></div>
        ${self ? '<b class="pt-boom">BOOM!</b>' : ''}
      </div>
      <p class="pt-roast">${esc(self ? SELF_ROASTS[Math.floor(Math.random() * SELF_ROASTS.length)] : ROASTS[Math.floor(Math.random() * ROASTS.length)](victim!))}</p>
    </div>`;
  // a little timeline, driven by on-screen time (so leaving the app pauses it along with the animations)
  const SHOT = self ? 5200 : 3900;
  const cues: [number, () => void][] = [];
  if (victim) {
    cues.push([INTRO, () => { el!.className = 'act-duel'; el!.insertAdjacentHTML('beforeend', duelHtml()); sfx.partyDuck(true); if (self) sfx.portal(); }]);
    if (!self) cues.push([INTRO + 600, () => sfx.groan()]);
    cues.push([INTRO + SHOT, () => { sfx.shot(shooter); if (self) sfx.boom(); }]);
    if (!self) cues.push([INTRO + SHOT + 150, () => sfx.groan()]);
    cues.push([INTRO + duelMs, () => { el!.className = 'act-party'; el!.querySelector('.pt-spot')?.classList.add('gone'); sfx.partyDuck(false); sfx.unlock(2); }]);
  } else cues.push([INTRO, () => { el!.className = 'act-party'; }]);

  const done = el.querySelector<HTMLButtonElement>('.pt-done')!, wait = el.querySelector<HTMLElement>('.pt-wait')!;
  let shown = 0, last = performance.now();
  const clock = window.setInterval(() => {
    const now = performance.now(), dt = now - last; last = now;
    el?.classList.toggle('pt-paused', document.hidden);
    if (document.hidden || !el) return;
    shown += Math.min(dt, 250);
    while (cues.length && shown >= cues[0][0]) cues.shift()![1]();
    if (shown >= total) { window.clearInterval(clock); wait.hidden = true; done.hidden = false; done.focus({ preventScroll: true }); }
  }, 50);
  done.addEventListener('click', () => {
    if (done.hidden || shown < total) return;
    sfx.partyStop();
    for (const b of behind) b.inert = false;
    onDone?.();
    const gone = el; el = null;
    gone?.classList.add('pt-bye'); window.setTimeout(() => gone?.remove(), 300);
  });
}
