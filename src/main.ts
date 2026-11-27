import Phaser from 'phaser';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import './styles.css';
import { BattleScene } from './game/BattleScene.ts';
import { game } from './core/state.ts';
import { TREE } from './core/tree.ts';
import { initUI, showOfflineReport } from './ui/ui.ts';
import { pauseAudio, unlockAudio } from './audio/sfx.ts';

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

// ---------- save / offline ----------
const report = game.load();

// ---------- Phaser ----------
// The pixel font must be loaded before Phaser renders any text with it.
await Promise.race([document.fonts.load('16px Silkscreen'), new Promise((r) => setTimeout(r, 1500))]);
const scene = new BattleScene();
const phaser = new Phaser.Game({
  type: Phaser.AUTO,
  parent: field,
  backgroundColor: '#1b1d1a',
  scale: { mode: Phaser.Scale.NONE, width: 100, height: 100 },
  pixelArt: true,
  roundPixels: true,
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
if (report) showOfflineReport(report);

// ---------- persistence & app lifecycle ----------
// iOS can kill a backgrounded web app without warning, so save on every hide, not just on unload.
setInterval(() => game.save(), AUTOSAVE_MS);
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    game.save();
  } else if (hiddenAt) {
    const r = game.resumeAfter((Date.now() - hiddenAt) / 1000);
    hiddenAt = 0;
    if (r) showOfflineReport(r);
  }
});
window.addEventListener('pagehide', () => game.save());

// Block pinch/double-tap zoom on iOS (Safari ignores user-scalable=no).
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

// Debug handle for testing in the console.
(window as unknown as { zgame: typeof game }).zgame = game;
(window as unknown as { __TREE: string[] }).__TREE = TREE.map((n) => n.id);


// Offline support for the installed (Add to Home Screen) app. Fails quietly where service workers aren't allowed.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => { /* not available here */ });
}

// Audio can only start after a tap or key press (required by iOS and other browsers).
document.addEventListener('pointerdown', unlockAudio, { passive: true });
document.addEventListener('keydown', unlockAudio);
document.addEventListener('visibilitychange', () => pauseAudio(document.hidden));
