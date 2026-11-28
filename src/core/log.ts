// Crash & problem reports. A small ring buffer of what happened (errors, warnings, big game events, taps, FPS dips, the
// graphics context being lost), kept in localStorage so it survives the page being killed. A heartbeat notices when the
// last session ended without closing cleanly (iOS kills a tab that runs out of memory and reloads it), so the next
// launch can offer to send a report. Nothing personal goes in: no save code, no player secret.
const KEY = 'zombie-idle-log';
const ALIVE = 'zombie-idle-alive';
const MAX = 300;
type Line = [number, string, string];   // [epoch ms, level, message]

let lines: Line[] = (() => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } })();
let dirty = false;
const flush = () => { if (!dirty) return; dirty = false; try { localStorage.setItem(KEY, JSON.stringify(lines.slice(-MAX))); } catch { /* storage full */ } };
setInterval(flush, 2000);

export function log(level: 'info' | 'warn' | 'error' | 'event' | 'tap' | 'perf', msg: string) {
  lines.push([Date.now(), level, String(msg).slice(0, 400)]);
  if (lines.length > MAX + 50) lines = lines.slice(-MAX);
  dirty = true;
  if (level === 'error') flush();   // errors are written straight away, in case the page dies next
}
export const logLines = () => lines.slice(-MAX);
export function clearLog() { lines = []; dirty = true; flush(); }

// ---------- errors ----------
window.addEventListener('error', (e) => {
  const src = e.filename ? ` @ ${e.filename.split('/').pop()}:${e.lineno}:${e.colno}` : '';
  log('error', `${e.message}${src}${e.error?.stack ? `\n${String(e.error.stack).split('\n').slice(0, 6).join('\n')}` : ''}`);
});
window.addEventListener('unhandledrejection', (e) => {
  const r = e.reason as { message?: string; stack?: string } | undefined;
  log('error', `Unhandled promise: ${r?.message ?? String(e.reason)}${r?.stack ? `\n${r.stack.split('\n').slice(0, 6).join('\n')}` : ''}`);
});
for (const lv of ['error', 'warn'] as const) {
  const orig = console[lv].bind(console);
  console[lv] = (...a: unknown[]) => { try { log(lv, a.map((x) => (x instanceof Error ? `${x.message}\n${x.stack ?? ''}` : typeof x === 'string' ? x : JSON.stringify(x))).join(' ')); } catch { /* ignore */ } orig(...a); };
}

// ---------- did the last session end without closing? ----------
interface Alive { t: number; start: number; clean: boolean; hidden?: boolean }
let prev: Alive | null = null;
try { prev = JSON.parse(localStorage.getItem(ALIVE) ?? 'null'); } catch { /* ignore */ }
/** The previous session stopped while the game was on screen and never closed cleanly: most likely a crash or a reload. */
export const lastSessionCrashed = !!prev && !prev.clean && !prev.hidden && Date.now() - prev.t < 7 * 24 * 3600e3;
if (lastSessionCrashed && prev) log('error', `Previous session ended unexpectedly (last heartbeat ${new Date(prev.t).toISOString()}, ran ${Math.round((prev.t - prev.start) / 1000)} s). Likely a crash or the phone reloading the page.`);
const start = Date.now();
const beat = (extra: Partial<Alive> = {}) => { try { localStorage.setItem(ALIVE, JSON.stringify({ t: Date.now(), start, clean: false, hidden: document.hidden, ...extra })); } catch { /* ignore */ } };
beat(); setInterval(() => beat(), 3000);
window.addEventListener('pagehide', () => { flush(); beat({ clean: true }); });
document.addEventListener('visibilitychange', () => { log('event', document.hidden ? 'app hidden' : 'app visible'); beat(); flush(); });
log('info', `session start · ${navigator.userAgent}`);

// ---------- memory (Chrome only) ----------
setInterval(() => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  if (m && m.usedJSHeapSize > m.jsHeapSizeLimit * 0.7) log('perf', `JS heap high: ${Math.round(m.usedJSHeapSize / 1e6)} / ${Math.round(m.jsHeapSizeLimit / 1e6)} MB`);
}, 30_000);

/** The full report text: device, build, settings, a short game summary, and the log. */
export function buildReport(what: string, summary: Record<string, unknown>) {
  const build = [...document.scripts].map((s) => s.src.split('/').pop()).find((s) => s?.startsWith('index-')) ?? 'dev';
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  const prefs: Record<string, string | null> = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; if (/sound|skip|fps|ranges|soundtrack|rank-sort|buy/.test(k)) prefs[k] = localStorage.getItem(k); } } catch { /* ignore */ }
  const head = [
    `Zombie Idle problem report · ${new Date().toISOString()}`,
    `What happened: ${what.trim() || '(not described)'}`,
    `Build: ${build}`,
    `Device: ${navigator.userAgent}`,
    `Screen: ${screen.width}×${screen.height} @${devicePixelRatio} · window ${innerWidth}×${innerHeight}${m ? ` · heap ${Math.round(m.usedJSHeapSize / 1e6)} MB` : ''}`,
    `Standalone app: ${matchMedia('(display-mode: standalone)').matches}`,
    `Game: ${JSON.stringify(summary)}`,
    `Settings: ${JSON.stringify(prefs)}`,
    `Last session crashed: ${lastSessionCrashed}`,
    '', `---- log (last ${Math.min(MAX, lines.length)} entries, oldest first) ----`,
  ];
  const body = lines.slice(-MAX).map(([t, lv, msg]) => `${new Date(t).toISOString().slice(11, 23)} ${lv.padEnd(5)} ${msg}`);
  return [...head, ...body].join('\n');
}
