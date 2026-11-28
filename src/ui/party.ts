// The record party: when you take a leaderboard record (#1 in any ranking, or the fastest time for a horde), the battle
// and play clock pause and a zombie DJ throws a block party in your honour. It can't be skipped: the button only shows
// once the party has played out. Nothing is lost: the game is paused the whole time (see overlayUp in unlocks.ts).
import { zombieIcon } from '../game/art.ts';
import * as M from '../core/model.ts';
import * as sfx from '../audio/sfx.ts';

let el: HTMLDivElement | null = null;
export const partyUp = () => !!el;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const PARTY_MS = 9000;
const SHOUTS = ['THIS ONE GOES OUT TO', 'MAKE SOME NOISE FOR', 'EVERYBODY SCREAM FOR', 'BRAAAINS AND BEATS FOR'];

/** Throw the party for one or more fresh records (e.g. ["Most kills", "Fastest Horde 7"]). */
export function throwParty(records: string[], name: string) {
  if (el || !records.length) return;
  el = document.createElement('div');
  el.id = 'party';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'New record celebration');
  const crowd = ['shambler', 'runner', 'brute', 'spitter', 'bloater', 'crawler', 'jogger', 'office', 'farmer']
    .filter((z) => M.ZOMBIE_IDS.includes(z as M.ZombieId)).slice(0, 7)
    .map((z, i) => `<img class="px pz" src="${zombieIcon(z as M.ZombieId)}" alt="" style="--d:${(i * 0.13).toFixed(2)}s;--x:${i}">`).join('');
  const confetti = Array.from({ length: 46 }, (_, i) => `<i style="--l:${Math.random() * 100}%;--t:${(1.8 + Math.random() * 2.2).toFixed(2)}s;--dl:${(Math.random() * 3).toFixed(2)}s;--h:${Math.floor(Math.random() * 360)};--r:${Math.floor(Math.random() * 720 - 360)}deg"></i>`).join('');
  el.innerHTML = `<div class="pt-lights"><b></b><b></b><b></b></div><div class="pt-confetti">${confetti}</div>
    <div class="pt-stage">
      <p class="pt-eyebrow">🏆 New leaderboard record 🏆</p>
      <h2 class="pt-title">BLOCK PARTY!</h2>
      <ul class="pt-recs">${records.slice(0, 6).map((r) => `<li>${esc(r)}</li>`).join('')}${records.length > 6 ? `<li>+${records.length - 6} more</li>` : ''}</ul>
      <div class="pt-dj">
        <div class="pt-bubble">${SHOUTS[Math.floor(Math.random() * SHOUTS.length)]}<br><b>COMMANDER ${esc(name.toUpperCase())}!!!</b></div>
        <div class="pt-booth"><span class="pt-deck"></span><img class="px pt-djz" src="${zombieIcon('brute')}" alt=""><i class="pt-phones"></i><span class="pt-deck"></span></div>
      </div>
      <div class="pt-crowd">${crowd}</div>
      <div class="pt-foot"><span class="pt-wait">The party's still going…</span><button class="btn pt-done" type="button" hidden>Back to the fight ›</button></div>
    </div>`;
  document.body.appendChild(el);
  sfx.partyStart();
  const done = el.querySelector<HTMLButtonElement>('.pt-done')!, wait = el.querySelector<HTMLElement>('.pt-wait')!;
  window.setTimeout(() => { if (!el) return; wait.hidden = true; done.hidden = false; done.focus({ preventScroll: true }); }, PARTY_MS);
  done.addEventListener('click', () => {
    sfx.partyStop();
    const gone = el; el = null;
    gone?.classList.add('pt-bye'); window.setTimeout(() => gone?.remove(), 300);
  });
}
