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

const app = document.getElementById('app')!;
const field = document.getElementById('field')!;
const AUTOSAVE_MS = 10_000;
const MAX_DPR = 3;

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

// The canvas is rendered at device-pixel resolution so it's crisp on Retina screens, then shown at CSS size.
function fitCanvas() {
  const r = field.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return;
  const dpr = Math.min(MAX_DPR, window.devicePixelRatio || 1);
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
  if (!document.hidden && !titleUp()) game.s.playSec = (game.s.playSec ?? 0) + Math.min(now - lastTick, 2000) / 1000;   // a long gap = the app was asleep
  lastTick = now;
  timeEl.textContent = fmtTime(game.s.playSec ?? 0);
}, 250);

// ---------- persistence & app lifecycle ----------
// iOS can kill a backgrounded web app without warning, so save on every hide, not just on unload.
setInterval(() => game.save(), AUTOSAVE_MS);
// Save right after anything you do (buying, hiring, releasing, a horde won or lost), not just every 10 s:
// iOS often skips the save on close, and an older save would undo recent purchases and hand their DNA back.
let saveSoon = 0;
game.on((evt) => {
  if (evt === 'horde-won' || evt === 'horde-lost') { game.save(); return; }
  if (evt === 'change' && !saveSoon) saveSoon = window.setTimeout(() => { saveSoon = 0; game.save(); }, 400);
});
// When the app is hidden the game simply pauses (no offline earnings); save so nothing is lost.
document.addEventListener('visibilitychange', () => { if (document.hidden) game.save(); });
window.addEventListener('blur', () => game.save());
window.addEventListener('pagehide', () => game.save());

// Block pinch/double-tap zoom on iOS (Safari ignores user-scalable=no).
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

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
