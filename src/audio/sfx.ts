// Retro sound effects and music, synthesised with the Web Audio API (no audio files, works offline).
// Browsers (iOS especially) only allow audio after a tap, so the context is unlocked on the first touch/click.
// Frequent sounds (gunfire, deaths) are rate-limited so a big horde stays pleasant instead of deafening.
import type { ClassId, RarityId } from '../core/model.ts';
import startUrl from '../assets/audio/start.wav?url';
import battleUrl from '../assets/audio/battle.wav?url';
import hordeUrl from '../assets/audio/horde.wav?url';
import ironUrl from '../assets/audio/iron-mandible.m4a?url';
import bellUrl from '../assets/audio/no-one-rings-the-bell.m4a?url';
import partyUrl from '../assets/audio/party-king-of-the-arcade-floor.m4a?url';

// ---------- soundtracks: the original chiptune, plus tracks collected in the game (each downloaded only once needed) ----------
export type SoundtrackId = 'classic' | 'iron' | 'bell';
export const SOUNDTRACKS: { id: SoundtrackId; name: string; by: string; url?: string }[] = [
  { id: 'classic', name: 'Rooftop Siege', by: 'The original chiptune' },
  { id: 'iron', name: 'Iron Mandible', by: 'Pulled from a dead DJ\'s van · Horde 3', url: ironUrl },
  { id: 'bell', name: 'No One Rings the Bell', by: 'From the church on 5th Street · Horde 5', url: bellUrl },
];
const TRACK_KEY = 'zombie-idle-soundtrack';
let soundtrack: SoundtrackId = (() => { try { const v = localStorage.getItem(TRACK_KEY); return SOUNDTRACKS.some((t) => t.id === v) ? v as SoundtrackId : 'classic'; } catch { return 'classic'; } })();
const extra = new Map<SoundtrackId, AudioBuffer>(), extraLoading = new Set<SoundtrackId>();
export const currentSoundtrack = () => soundtrack;
/** The soundtrack saved in Settings (what a preview goes back to). */
export const savedSoundtrack = (): SoundtrackId => { try { const v = localStorage.getItem(TRACK_KEY); return SOUNDTRACKS.some((t) => t.id === v) ? v as SoundtrackId : 'classic'; } catch { return 'classic'; } };
async function loadExtra(id: SoundtrackId) {
  const url = SOUNDTRACKS.find((t) => t.id === id)?.url;
  if (!url || extra.has(id) || extraLoading.has(id) || !ctx) return;
  extraLoading.add(id);
  try { extra.set(id, await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer())); if (soundtrack === id && tracks) playTrack(wantTrack, true); }
  catch { /* offline: keep the chiptune */ } finally { extraLoading.delete(id); }
}
/** The buffer to play now: the chosen collected track (once loaded) or the chiptune's battle/horde loop. */
const chosen = () => (soundtrack !== 'classic' ? extra.get(soundtrack) : undefined);
/** Pick the background soundtrack (saved on this device). */
export function setSoundtrack(id: SoundtrackId, save = true) {
  soundtrack = id;
  if (save) try { localStorage.setItem(TRACK_KEY, id); } catch { /* storage blocked */ }
  init();
  if (id !== 'classic' && !extra.has(id)) { void loadExtra(id); return; }
  if (tracks && ctx) playTrack(wantTrack, true);
}

const PREFS_KEY = 'zombie-idle-sound';
type Prefs = { sfx: boolean; music: boolean; musicVol: number; sfxVol: number };

let ctx: AudioContext | null = null;
let master: GainNode;
let sfxBus: GainNode;
let musicBus: GainNode;
let noise: AudioBuffer;
let prefs: Prefs = { sfx: true, music: true, musicVol: 80, sfxVol: 80 };
// Levels (at the default 80% sliders): music sits well above the old mix and gunfire a little below it, and the effects
// run through a compressor so a big firefight can't bury the soundtrack. Sliders are 0–100, applied on a curve (v²).
const MUSIC_BASE = 1.0, SFX_BASE = 1.05;
const musicGain = () => (prefs.music ? MUSIC_BASE * (prefs.musicVol / 100) ** 2 : 0);
const sfxGain = () => (prefs.sfx ? SFX_BASE * (prefs.sfxVol / 100) ** 2 : 0);
const last = new Map<string, number>();
let voices = 0;

try { prefs = { ...prefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') }; } catch { /* storage blocked */ }
const savePrefs = () => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* storage blocked */ } };

function init() {
  if (ctx) return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = 0.55; master.connect(ctx.destination);
  const comp = ctx.createDynamicsCompressor();   // tames stacked gunfire
  comp.threshold.value = -20; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  comp.connect(master);
  sfxBus = ctx.createGain(); sfxBus.gain.value = sfxGain(); sfxBus.connect(comp);
  musicBus = ctx.createGain(); musicBus.gain.value = musicGain(); musicBus.connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

/** Call from the first user gesture: creates/resumes the audio context and starts the music. */
export function unlockAudio() {
  init();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!tracksTried) loadTracks();
}

// ---------- music tracks (the teaser's chiptune): start sting, battle loop, horde loop ----------
type TrackId = 'battle' | 'horde';
let tracks: Record<'start' | TrackId, AudioBuffer> | null = null;
let tracksTried = false;
let playing: { id: TrackId; src: AudioBufferSourceNode; gain: GainNode; buf: AudioBuffer } | null = null;
let wantTrack: TrackId = 'battle';
// The music files start downloading the moment the page loads, not on the first tap.
const trackBytes = Promise.all([startUrl, battleUrl, hordeUrl].map(async (u) => (await fetch(u)).arrayBuffer()));
trackBytes.catch(() => {});
async function loadTracks() {
  tracksTried = true;
  try {
    const [start, battle, horde] = await Promise.all((await trackBytes).map((b) => ctx!.decodeAudioData(b)));
    tracks = { start, battle, horde };
    if (wantSting) playSting(); else playTrack(wantTrack);
  } catch { startMusic(); }   // (the synth only starts once the context is running)   // couldn't load the files: fall back to the built-in synth groove
}
let wantSting = false;
function playSting() {
  if (!tracks || !ctx) return;
  wantSting = false;
  const src = ctx.createBufferSource(); src.buffer = tracks.start; src.connect(sfxBus); src.start();
  // the title music keeps going under the sting (ducked), instead of stopping and restarting
  if (playing) { const g = playing.gain.gain, t = ctx.currentTime; g.setTargetAtTime(0.3, t, 0.05); g.setTargetAtTime(1, t + 2.6, 0.4); }
  window.setTimeout(() => { if (playing?.id !== wantTrack) playTrack(wantTrack); }, 2600);
}
/** The title screen is up: get the music going as early as the browser allows. Desktop browsers often allow it right
 * away; iPhones only once you first touch the screen (unlockAudio), and by then the tracks are already loaded. */
export function titleMusic() {
  init();
  if (!ctx) return;
  wantTrack = 'battle';
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (!tracksTried) loadTracks(); else if (tracks && !playing) playTrack('battle');
}
/** Switch the background music (crossfades). Before the tracks load, remembers what to play. */
export function music(id: TrackId) {
  wantTrack = id;
  const c = chosen(); if (c && playing?.buf === c) return;   // a collected soundtrack plays straight through hordes
  if (tracks && ctx && playing?.id !== id) playTrack(id);
}
function playTrack(id: TrackId, force = false) {
  if (!ctx || !tracks) return;
  if (soundtrack !== 'classic' && !extra.has(soundtrack)) void loadExtra(soundtrack);
  const buf = chosen() ?? tracks[id];
  if (!force && playing?.buf === buf) return;
  const t = ctx.currentTime;
  if (playing) { const old = playing; old.gain.gain.setTargetAtTime(0, t, 0.25); old.src.stop(t + 1.5); }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const gain = ctx.createGain(); gain.gain.value = 0; gain.gain.setTargetAtTime(1, t, 0.3);
  src.connect(gain).connect(musicBus); src.start(t + 0.05);
  playing = { id, src, gain, buf };
}
/** The start-screen sting (coin, sweep, title hit), then the battle loop. */
export function startSting() {
  init();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  wantSting = true;
  if (tracks) playSting(); else if (!tracksTried) loadTracks();
}
export const soundPrefs = () => ({ ...prefs });
export function setSfx(on: boolean) { prefs.sfx = on; if (on && !prefs.sfxVol) prefs.sfxVol = 80; savePrefs(); if (ctx) sfxBus.gain.setTargetAtTime(sfxGain(), ctx.currentTime, 0.02); }
export function setMusic(on: boolean) { prefs.music = on; if (on && !prefs.musicVol) prefs.musicVol = 80; savePrefs(); if (ctx) musicBus.gain.setTargetAtTime(musicGain(), ctx.currentTime, 0.05); }
/** Volume sliders (0–100). Dragging to 0 is the same as switching that sound off; raising it from 0 switches it back on. */
export function setVolume(which: 'music' | 'sfx', v: number) {
  v = Math.max(0, Math.min(100, Math.round(v)));
  if (which === 'music') { prefs.musicVol = v; prefs.music = v > 0; } else { prefs.sfxVol = v; prefs.sfx = v > 0; }
  savePrefs();
  if (ctx) { musicBus.gain.setTargetAtTime(musicGain(), ctx.currentTime, 0.03); sfxBus.gain.setTargetAtTime(sfxGain(), ctx.currentTime, 0.03); }
}
export function pauseAudio(paused: boolean) { if (ctx) (paused ? ctx.suspend() : ctx.resume()).catch(() => {}); }

/** Rate limit: returns false if this sound played less than `gap` seconds ago or too many voices are busy. */
function gate(key: string, gap: number) {
  if (!ctx || !prefs.sfx || ctx.state !== 'running' || voices > 28) return false;
  const now = ctx.currentTime;
  if (now - (last.get(key) ?? -1) < gap) return false;
  last.set(key, now);
  return true;
}
function track(node: AudioScheduledSourceNode, end: number) {
  voices++;
  node.onended = () => { voices--; };
  node.stop(end);
}

/** A pitched blip with an optional slide. */
function tone(freq: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number; at?: number; bus?: GainNode } = {}) {
  const c = ctx!;
  const t = c.currentTime + (opts.at ?? 0);
  const o = c.createOscillator(), g = c.createGain();
  o.type = opts.type ?? 'square';
  o.frequency.setValueAtTime(freq, t);
  if (opts.to) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t + dur);
  g.gain.setValueAtTime(opts.gain ?? 0.15, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(opts.bus ?? sfxBus);
  o.start(t);
  track(o, t + dur + 0.02);
}
/** A filtered noise burst (gunshots, explosions, squelches). */
function hiss(dur: number, opts: { freq?: number; q?: number; type?: BiquadFilterType; gain?: number; at?: number; sweepTo?: number; bus?: GainNode } = {}) {
  const c = ctx!;
  const t = c.currentTime + (opts.at ?? 0);
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noise;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  f.type = opts.type ?? 'lowpass';
  f.frequency.setValueAtTime(opts.freq ?? 2000, t);
  if (opts.sweepTo) f.frequency.exponentialRampToValueAtTime(opts.sweepTo, t + dur);
  f.Q.value = opts.q ?? 0.7;
  g.gain.setValueAtTime(opts.gain ?? 0.3, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(opts.bus ?? sfxBus);
  s.start(t, Math.random() * 0.5);
  track(s, t + dur + 0.02);
}

// ---------- game sounds ----------
export function shot(cls: ClassId) {
  if (!gate(`shot-${cls}`, cls === 'flamer' ? 0.12 : cls === 'rifle' || cls === 'mg' ? 0.07 : 0.05)) return;
  switch (cls) {
    case 'pistol': hiss(0.06, { freq: 3500, gain: 0.18 }); tone(900, 0.05, { to: 300, gain: 0.05 }); break;
    case 'bow': hiss(0.08, { type: 'highpass', freq: 2500, gain: 0.12 }); tone(520, 0.12, { type: 'triangle', to: 160, gain: 0.1 }); break;
    case 'shotgun': hiss(0.22, { freq: 1400, sweepTo: 200, gain: 0.32 }); tone(140, 0.12, { type: 'sawtooth', to: 50, gain: 0.08 }); break;
    case 'rifle': hiss(0.045, { freq: 4500, gain: 0.14 }); break;
    case 'sniper': hiss(0.35, { freq: 5000, sweepTo: 300, gain: 0.35 }); tone(220, 0.3, { type: 'sawtooth', to: 40, gain: 0.1 }); break;
    case 'flamer': hiss(0.18, { type: 'bandpass', freq: 600, q: 0.8, gain: 0.16 }); break;
    case 'grenade': tone(180, 0.1, { type: 'square', to: 90, gain: 0.12 }); hiss(0.05, { freq: 800, gain: 0.1 }); break;
    case 'mg': hiss(0.04, { freq: 4000, gain: 0.13 }); tone(160, 0.04, { type: 'square', to: 90, gain: 0.04 }); break;
    case 'drone': tone(420, 0.18, { type: 'sawtooth', to: 620, gain: 0.05 }); break;
    case 'mortar': tone(120, 0.18, { type: 'sine', to: 60, gain: 0.25 }); hiss(0.1, { freq: 500, gain: 0.14 }); break;
    case 'rail': tone(300, 0.22, { type: 'sawtooth', to: 2400, gain: 0.06 }); hiss(0.12, { type: 'highpass', freq: 4000, gain: 0.14 }); break;
    case 'tesla': tone(1400, 0.12, { type: 'square', to: 300, gain: 0.06 }); hiss(0.1, { type: 'highpass', freq: 3000, gain: 0.1 }); break;
  }
}
export function boom() {
  if (!gate('boom', 0.08)) return;
  hiss(0.5, { freq: 900, sweepTo: 80, gain: 0.4 });
  tone(90, 0.4, { type: 'sine', to: 35, gain: 0.25 });
}
export function zombieDeath() {
  if (!gate('death', 0.06)) return;
  hiss(0.14, { type: 'bandpass', freq: 500 + Math.random() * 300, q: 2, gain: 0.16 });
  tone(140 + Math.random() * 60, 0.16, { type: 'sawtooth', to: 60, gain: 0.05 });
}
export function groan() {
  if (!gate('groan', 1.8)) return;
  const c = ctx!, t = c.currentTime, f0 = 70 + Math.random() * 40;
  const o = c.createOscillator(), lfo = c.createOscillator(), lg = c.createGain(), g = c.createGain(), lp = c.createBiquadFilter();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 0.9);
  lfo.frequency.value = 7; lg.gain.value = 6; lfo.connect(lg).connect(o.frequency);
  lp.type = 'lowpass'; lp.frequency.value = 500;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
  o.connect(lp).connect(g).connect(sfxBus);
  o.start(t); lfo.start(t); lfo.stop(t + 0.95);
  track(o, t + 0.95);
}
export function grind() {
  if (!gate('grind', 0.25)) return;
  hiss(0.2, { type: 'bandpass', freq: 1800, q: 6, gain: 0.08 });
  tone(60, 0.2, { type: 'square', gain: 0.04 });
}
const RARITY_NOTES: Record<RarityId, number[]> = {
  common: [660, 880], uncommon: [660, 880, 1100], rare: [587, 784, 988, 1175],
  epic: [523, 659, 784, 1047, 1319], legendary: [523, 659, 784, 1047, 1319, 1568],
};
export function loot(rarity: RarityId) {
  if (!gate('loot', 0.15)) return;
  RARITY_NOTES[rarity].forEach((f, i) => tone(f, 0.18, { type: 'square', gain: 0.07, at: i * 0.07 }));
}
export function hordeStart() {
  if (!gate('horde', 1)) return;
  for (let i = 0; i < 3; i++) tone(300, 0.45, { type: 'sawtooth', to: 600, gain: 0.08, at: i * 0.5 });
  hiss(1.4, { freq: 200, gain: 0.1 });
}
export function hordeWon() {
  if (!gate('won', 1)) return;
  [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.5 : 0.14, { type: 'square', gain: 0.09, at: i * 0.12 }));
}
export function hordeLost() {
  if (!gate('lost', 1)) return;
  [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, { type: 'triangle', gain: 0.12, at: i * 0.22 }));
}
// ---------- interface sounds ----------
export function click() { if (gate('click', 0.04)) tone(1200, 0.035, { type: 'square', gain: 0.04 }); }
export function buy() { if (gate('buy', 0.05)) { tone(880, 0.06, { gain: 0.06 }); tone(1320, 0.09, { gain: 0.06, at: 0.05 }); } }
export function denied() { if (gate('denied', 0.1)) tone(160, 0.12, { type: 'sawtooth', gain: 0.06 }); }
export function allocate() { if (gate('alloc', 0.1)) [784, 988, 1175].forEach((f, i) => tone(f, 0.15, { type: 'triangle', gain: 0.08, at: i * 0.05 })); }
export function tierUp() { if (gate('tier', 0.1)) tone(330, 0.25, { type: 'square', to: 990, gain: 0.07 }); }
export function equip() { if (gate('equip', 0.1)) { hiss(0.05, { type: 'highpass', freq: 3000, gain: 0.1 }); tone(500, 0.06, { gain: 0.05, at: 0.05 }); } }

// ---------- music: a quiet, looping minor-key groove ----------
let musicTimer = 0;
let nextNote = 0;
let step = 0;
const BPM = 112;
const BASS = [55, 0, 55, 65.4, 0, 55, 49, 0, 55, 0, 55, 73.4, 0, 65.4, 61.7, 0];  // A minor-ish riff (Hz, 0 = rest)
const LEAD = [0, 0, 440, 0, 0, 0, 523, 0, 0, 0, 494, 0, 0, 0, 392, 0];
function startMusic() {
  if (!ctx || musicTimer) return;
  nextNote = ctx.currentTime + 0.1;
  musicTimer = window.setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    const sixteenth = 60 / BPM / 4;
    while (nextNote < ctx.currentTime + 0.2) {
      const i = step % 16, bar = Math.floor(step / 16) % 4;
      const at = nextNote - ctx.currentTime;
      if (BASS[i]) tone(BASS[i] * (bar === 3 ? 0.89 : 1), sixteenth * 1.8, { type: 'triangle', gain: 0.22, at, bus: musicBus });
      if (i % 4 === 0) hiss(0.12, { freq: 150, gain: 0.35, at, bus: musicBus });                 // kick
      if (i % 8 === 4) hiss(0.1, { type: 'bandpass', freq: 1800, gain: 0.18, at, bus: musicBus }); // snare
      if (i % 2 === 1) hiss(0.03, { type: 'highpass', freq: 7000, gain: 0.06, at, bus: musicBus }); // hat
      if (LEAD[i] && bar % 2 === 1) tone(LEAD[i], sixteenth * 3, { type: 'square', gain: 0.035, at, bus: musicBus });
      nextNote += sixteenth;
      step++;
    }
  }, 50);
}

/** Unlock fanfare for the reward overlay: a rising arpeggio plus a sparkle, pitched per card so a run of cards climbs. */
export function unlock(step = 0) {
  if (!gate('unlock', 0.2)) return;
  const k = Math.pow(2, Math.min(step, 4) / 12 * 2);   // each card a whole tone higher
  [523, 659, 784, 1047].forEach((f, i) => tone(f * k, i === 3 ? 0.45 : 0.12, { type: 'square', gain: 0.07, at: i * 0.07 }));
  [1568, 2093, 2637].forEach((f, i) => tone(f * k, 0.18, { type: 'triangle', gain: 0.035, at: 0.3 + i * 0.05 }));
  hiss(0.35, { type: 'highpass', freq: 6000, gain: 0.05, at: 0.28 });
}
/** Soft click for turning to the next card. */
export function nextCard() { if (gate('ncard', 0.08)) { tone(880, 0.05, { type: 'triangle', gain: 0.06 }); tone(1320, 0.07, { type: 'triangle', gain: 0.05, at: 0.04 }); } }
/** Evolution scene: a rising charge-up hum (1.5 s) ... */
export function evolveCharge() {
  if (!gate('evoc', 0.5)) return;
  tone(110, 1.5, { type: 'sawtooth', to: 880, gain: 0.05 });
  tone(220, 1.5, { type: 'square', to: 1760, gain: 0.025 });
  hiss(1.5, { type: 'bandpass', freq: 400, sweepTo: 5000, q: 2, gain: 0.08 });
}
/** ... then the blast as the new form appears. */
export function evolveBlast() {
  if (!gate('evob', 0.5)) return;
  hiss(0.9, { freq: 1800, sweepTo: 120, gain: 0.35 });
  tone(70, 0.7, { type: 'sine', to: 35, gain: 0.25 });
  [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.35, { type: 'triangle', gain: 0.05, at: 0.08 + i * 0.06 }));
}

// ---------- the record party: an air horn, then a four-on-the-floor beat until it's over ----------
let partyT = 0;
function airhorn(at = 0) {
  [466, 587, 698].forEach((f) => { tone(f, 0.18, { type: 'sawtooth', gain: 0.07, at }); tone(f, 0.18, { type: 'sawtooth', gain: 0.07, at: at + 0.22 }); tone(f, 0.6, { type: 'sawtooth', gain: 0.07, at: at + 0.44 }); });
}
// The party track (King of the Arcade Floor, from where its beat drops): fetched when a record is on its way.
let partyBuf: AudioBuffer | null = null, partyLoading: Promise<void> | null = null, partySrc: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
export function preloadParty() {
  init();
  if (partyBuf || partyLoading || !ctx) return;
  partyLoading = (async () => { try { partyBuf = await ctx!.decodeAudioData(await (await fetch(partyUrl)).arrayBuffer()); } catch { /* offline: the synth beat */ } finally { partyLoading = null; } })();
}
function synthBeat() {
  const bpm = 124, beat = 60 / bpm, bass = [55, 55, 65.4, 49];
  let n = 0;
  window.clearInterval(partyT);
  partyT = window.setInterval(() => {
    if (!ctx) return;
    for (let i = 0; i < 4; i++, n++) {   // one bar at a time
      const at = i * beat;
      tone(140, 0.22, { type: 'sine', to: 40, gain: 0.32, at });                                 // kick
      hiss(0.05, { type: 'highpass', freq: 8000, gain: 0.06, at: at + beat / 2 });                // off-beat hat
      if (i % 2 === 1) hiss(0.14, { type: 'bandpass', freq: 1800, q: 0.8, gain: 0.12, at });       // clap
      tone(bass[Math.floor(n / 4) % 4] * 2, beat * 0.45, { type: 'square', gain: 0.05, at: at + beat / 2 });   // bass stab
    }
    if (n % 16 === 0) airhorn(0.05);
  }, beat * 4 * 1000);
}
export function partyStart() {
  init();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  if (prefs.sfx) airhorn();
  const go = () => {
    if (!ctx) return;
    if (partyBuf && prefs.music) {   // the real track, on the music bus; the soundtrack steps aside
      if (playing) playing.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      const src = ctx.createBufferSource(); src.buffer = partyBuf; src.loop = true;
      const gain = ctx.createGain(); gain.gain.value = 1.15;
      src.connect(gain).connect(musicBus); src.start(ctx.currentTime + 0.25);
      partySrc = { src, gain };
    } else if (prefs.sfx) { if (musicBus) musicBus.gain.setTargetAtTime(musicGain() * 0.35, ctx.currentTime, 0.2); synthBeat(); }
  };
  if (!partyBuf && partyLoading) partyLoading.then(go); else if (!partyBuf) { preloadParty(); (partyLoading ?? Promise.resolve()).then(go); } else go();
}
export function partyStop() {
  window.clearInterval(partyT); partyT = 0;
  if (!ctx) return;
  const t = ctx.currentTime;
  if (partySrc) { const p = partySrc; partySrc = null; p.gain.gain.setTargetAtTime(0, t, 0.25); p.src.stop(t + 1.5); }
  if (playing) playing.gain.gain.setTargetAtTime(1, t + 0.3, 0.4);
  if (musicBus) musicBus.gain.setTargetAtTime(musicGain(), t, 0.4);
}
