// The start screen, in the style of the teaser: the screen switches on like an old TV, INSERT COIN blinks, the logo
// slams in, then PRESS START (with a summary of your save). Tapping starts the music (the start sting) and the game.
// The battle is paused while it's up, so the title never counts as play time.
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import { game } from '../core/state.ts';
import * as M from '../core/model.ts';
import { startSting, titleMusic } from '../audio/sfx.ts';

let up = false;
export const titleUp = () => up;

const fmtTime = (sec: number) => { const t = Math.floor(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };

export function showTitle() {
  up = true;
  const s = game.s, fresh = !s.kills && !s.hordes;
  const best = M.bestTier(s.strains);
  const el = document.createElement('div');
  el.id = 'title';
  el.setAttribute('role', 'button');
  el.setAttribute('aria-label', 'Press start');
  el.tabIndex = 0;
  el.innerHTML = `
    <div class="t-crt"></div>
    <div class="t-boot"><b>INSERT COIN</b><span>1 PLAYER</span></div>
    <div class="t-main">
      <h1><span class="t-z">ZOMBIE</span><span class="t-i">IDLE</span></h1>
      <p class="t-tag">HOLD THE WALL</p>
      <p class="t-start">PRESS START</p>
      <p class="t-save">${s.prestige?.runs ? `PRESTIGE ${s.prestige.runs} · ` : ''}${fresh ? 'NEW GAME' : `CONTINUE · TIER ${best} · ${s.hordes} HORDE${s.hordes === 1 ? '' : 'S'}${(s.playSec ?? 0) >= 60 ? ` · ${fmtTime(s.playSec)} PLAYED` : ''}`}</p>
    </div>
    <div class="t-scan"></div>`;
  document.body.appendChild(el);
  titleMusic();
  // boot → logo (the logo can be skipped to by tapping early)
  let ready = false;
  const showLogo = () => { if (el.classList.contains('t-logo')) return; el.classList.add('t-logo'); window.setTimeout(() => { ready = true; el.classList.add('t-ready'); }, 700); };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(showLogo, reduce ? 0 : 1500);
  const start = (e: Event) => {
    e.preventDefault();
    if (!ready) { showLogo(); return; }
    el.removeEventListener('pointerdown', start); window.removeEventListener('keydown', key);
    startSting();
    el.classList.add('t-go');
    window.setTimeout(() => { up = false; el.remove(); }, 450);
  };
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') start(e); };
  el.addEventListener('pointerdown', start);
  window.addEventListener('keydown', key);
  el.focus();
}
