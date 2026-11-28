import { log } from './core/log.ts';   // first, so it catches errors from everything below
import Phaser from 'phaser';
import '@fontsource/lilita-one/400.css';
import '@fontsource/saira-condensed/800.css';
// canvas text doesn't trigger web-font loading, so ask for the damage-number font up front
document.fonts?.load?.('800 20px "Saira Condensed"').catch(() => {});
import './styles.css';
import { BattleScene } from './game/BattleScene.ts';
import { game } from './core/state.ts';
import { TREE } from './core/tree.ts';
import { initUI } from './ui/ui.ts';
import { music, pauseAudio, unlockAudio } from './audio/sfx.ts';
import { showTitle, titleUp } from './ui/title.ts';
import { overlayUp } from './ui/unlocks.ts';
import { coachUp, initTutorial } from './ui/tutorial.ts';

const app = document.getElementById('app')!;
const field = document.getElementById('field')!;
const AUTOSAVE_MS = 10_000;
/** Battlefield render resolution: at most 2 device pixels per CSS pixel (a 3× iPhone draws 2.25× fewer pixels, and the
 * art is soft-shaded so it looks the same), lowered automatically to 1.75 and then 1.5 if frames stay slow. */
const DPR_STEPS = [2, 1.75, 1.5];
let dprStep = 0;

// ---------- layout: wide vs tall, re-evaluated on every resize, rotation or fold ----------
function viewport() {
  const vv = window.visualViewport;
  return { w: vv?.width ?? window.innerWidth, h: vv?.height ?? window.innerHeight };
}
function applyLayout() {
  const { w, h } = viewport();
  const wide = w >= h * 1.15 && w >= 560;
  app.classList.toggle('wide', wide);
  app.classList.toggle('tall', !wide);
}
applyLayout();

// ---------- save ----------
game.load();   // no offline earnings: only active play counts

// ---------- Phaser ----------
// The display font must be loaded before Phaser renders any text with it.
await Promise.race([document.fonts.load('16px "Lilita One"'), new Promise((r) => setTimeout(r, 1500))]);
const scene = new BattleScene();
const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: field,
  backgroundColor: '#1b1d1a',
  scale: { mode: Phaser.Scale.NONE, width: 100, height: 100 },
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  render: { powerPreference: 'low-power' },
  audio: { noAudio: true },
  banner: false,
  scene,
});
// the phone throwing away the battlefield's graphics (a common cause of a frozen or blank field) goes in the problem log
phaser.events.once(Phaser.Core.Events.READY, () => {
  const c = phaser.canvas;
  c?.addEventListener('webglcontextlost', () => log('error', 'WebGL context lost (graphics reset by the phone)'));
  c?.addEventListener('webglcontextrestored', () => log('warn', 'WebGL context restored'));
});

// The canvas is rendered at device-pixel resolution so it's crisp on Retina screens, then shown at CSS size.
function fitCanvas() {
  const r = field.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  const dpr = Math.min(DPR_STEPS[dprStep], window.devicePixelRatio || 1);
  if (scene.sys?.isActive()) scene.resizeField(r.width, r.height, dpr);
  else phaser.events.once(Phaser.Core.Events.READY, () => setTimeout(fitCanvas, 0));
}
new ResizeObserver(() => fitCanvas()).observe(field);
const onViewportChange = () => { applyLayout(); fitCanvas(); };
window.addEventListener('resize', onViewportChange);
window.visualViewport?.addEventListener('resize', onViewportChange);
screen.orientation?.addEventListener?.('change', onViewportChange);
phaser.events.once(Phaser.Core.Events.READY, () => setTimeout(fitCanvas, 0));

// ---------- UI ----------
initUI();
showTitle();
initTutorial();
// music follows the battle: the horde track from the WARNING until the horde ends
game.on((evt, data) => { if (evt === 'phase') music(data === 'intro' || data === 'horde' ? 'horde' : 'battle'); });

// ---------- play timer (top right): TOTAL time played on this save; counts only while the app is open and visible ----------
const timeEl = document.getElementById('hud-time')!;
let lastTick = performance.now();
const fmtTime = (sec: number) => {
  const t = Math.floor(sec), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
};
setInterval(() => {
  const now = performance.now();
  if (!document.hidden && !titleUp() && !overlayUp() && !coachUp()) game.s.playSec = (game.s.playSec ?? 0) + Math.min(now - lastTick, 2000) / 1000;   // a long gap = the app was asleep
  lastTick = now;
  timeEl.textContent = fmtTime(game.s.playSec ?? 0);
}, 250);

// ---------- persistence & app lifecycle ----------
// iOS can kill a backgrounded web app without warning, so save on every hide, not just on unload.
setInterval(() => game.save(), AUTOSAVE_MS);
// Save right after anything you do (buying, hiring, releasing, a horde won or lost), not just every 10 s:
// iOS often skips the save on close, and an older save would undo recent purchases and hand their DNA back.
let saveSoon = 0;
const LOGGED = new Set(['horde-start', 'horde-won', 'horde-lost', 'prestige', 'unit-evolve', 'zombie-ult', 'release', 'reset', 'phase']);
game.on((evt, data) => {
  if (LOGGED.has(evt)) log('event', `${evt}${data !== undefined ? ` ${typeof data === 'object' ? JSON.stringify(data).slice(0, 80) : data}` : ''}`);
  if (evt === 'horde-won' || evt === 'horde-lost') { game.save(); return; }
  if (evt === 'change' && !saveSoon) saveSoon = window.setTimeout(() => { saveSoon = 0; game.save(); }, 400);
});
// Adaptive quality: watch the frame rate while the battlefield is showing; if it stays under 45 FPS for 4 s, draw it at a
// lower resolution (one step at a time, at most every 8 s). If it then runs at 55+ FPS for 15 s, try one step back up.
{
  let last = performance.now(), acc = 0, frames = 0, slowFor = 0, fastFor = 0, changed = 0, lowLogged = 0;
  const loop = (now: number) => {
    const dt = now - last; last = now;
    if (dt < 250 && !document.hidden) { acc += dt; frames++; }
    if (acc >= 1000) {
      const fps = (frames * 1000) / acc; acc = 0; frames = 0;
      const live = field.getBoundingClientRect().width > 2 && !document.querySelector('#app.menu-open');
      if (live) {
        slowFor = fps < 45 ? slowFor + 1 : 0;
        fastFor = fps >= 55 ? fastFor + 1 : 0;
        if (slowFor >= 4 && dprStep < DPR_STEPS.length - 1 && now - changed > 8000) { dprStep++; changed = now; slowFor = 0; fitCanvas(); log('perf', `slow (${fps.toFixed(0)} fps): resolution down to ${DPR_STEPS[dprStep]}×`); }
        else if (fastFor >= 15 && dprStep > 0 && now - changed > 15000) { dprStep--; changed = now; fastFor = 0; fitCanvas(); log('perf', `resolution back up to ${DPR_STEPS[dprStep]}×`); }
        if (fps < 25 && now - lowLogged > 20000) { lowLogged = now; log('perf', `low frame rate: ${fps.toFixed(0)} fps`); }
      }
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

// When the app is hidden the game simply pauses (no offline earnings); save so nothing is lost.
document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('blur', () => game.save());
window.addEventListener('pagehide', () => game.save());

// Block pinch/double-tap zoom on iOS (Safari ignores user-scalable=no).
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());
// …and a second tap within 300 ms on the cards/tips/title is swallowed (belt and braces for older iOS versions)
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && (e.target as Element)?.closest?.('#unlock, #coach, #title')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

// Debug handle for testing in the console.
(window as unknown as { zgame: typeof game }).zgame = game;
(window as unknown as { zscene: BattleScene }).zscene = scene;
(window as unknown as { __TREE: string[] }).__TREE = TREE.map((n) => n.id);


// Offline support for the installed (Add to Home Screen) app. Fails quietly where service workers aren't allowed.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* not available here */ });
}

// Audio can only start after a tap or key press (required by iOS and other browsers).
document.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('keydown', unlockAudio);
document.addEventListener('visibilitychange', () => pauseAudio(document.hidden));
