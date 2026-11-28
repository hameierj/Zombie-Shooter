// "You're the leader now": after the first horde is beaten, HQ radios in, a short typewriter cutscene plays, and the player
// picks a commander name. The name (with a random id) is kept on this device and in the save, and it's what the leaderboard
// shows. The leaderboard itself (Hordes tab) lists the player's own stats, plus everyone else's once an online board is
// connected (see BOARD below).
import { game } from '../core/state.ts';
import * as M from '../core/model.ts';
import { classIcon } from '../game/art.ts';
import { fmtInt } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';

export interface Player { id: string; name: string; secret?: string; renamed?: boolean }
const KEY = 'zombie-idle-player';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const rnd = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => b.toString(16).padStart(2, '0')).join('');
export function getPlayer(): Player | null {
  let p: Player | null = null;
  try { const q = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (q?.name) p = q; } catch { /* storage blocked */ }
  if (!p && game.s.player?.name) p = game.s.player;
  if (p && !p.secret) { p.secret = rnd(16); try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ } game.s.player = p; }
  return p;
}
export function setPlayer(name: string, rename = false): Player {
  const old = getPlayer();
  const p: Player = { id: old?.id ?? crypto.randomUUID(), name, secret: old?.secret ?? rnd(16), renamed: rename || old?.renamed };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ }
  game.s.player = p; game.save();
  return p;
}
/** One name change per lifetime (from Settings). */
export const canRename = () => { const p = getPlayer(); return !!p && !p.renamed; };
/** Names: 2-16 letters, digits, spaces, _ or -. */
export const cleanName = (s: string) => s.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);

// ---------- the leaderboard's stats ----------
import { fmtLn } from '../core/format.ts';
import { MASTERY, regionComplete } from '../core/tree.ts';
import { vialIcon } from '../game/art.ts';
/** A row on the board: the commander and a bag of stats (DNA totals are natural logs, like everything in the economy). */
export interface Entry { id: string; name: string; s: Record<string, number> }
export interface SortDef { key: string; label: string; fmt: (v: number) => string; icon?: string; colour?: string; asc?: boolean }
const time = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
export const SORTS: SortDef[] = [
  { key: 'best_horde', label: 'Best horde', fmt: (v) => `Horde ${fmtInt(v)}` },
  { key: 't_h', label: 'Fastest hordes', fmt: fmtInt },
  { key: 'hordes', label: 'Total hordes', fmt: fmtInt },
  { key: 'kills', label: 'Kills', fmt: fmtInt },
  { key: 'headshots', label: 'Headshots', fmt: fmtInt },
  { key: 'tier', label: 'Highest tier', fmt: (v) => `Tier ${fmtInt(v)}` },
  { key: 'unit_lv', label: 'Troop level', fmt: (v) => `Lv ${fmtInt(v)}` },
  { key: 'play', label: 'Play time', fmt: time },
  { key: 'combo', label: 'Best combo', fmt: fmtInt },
  { key: 'ults', label: 'Ultimates', fmt: fmtInt },
  { key: 'mastery', label: 'Masteries', fmt: (v) => `${v}/8` },
  { key: 'soldiers', label: 'Soldiers', fmt: fmtInt },
  { key: 'runs', label: 'Prestiges', fmt: fmtInt },
  ...M.COLOURS.map((c) => ({ key: `dna_${c}`, label: `${M.strainById(c).dna} DNA`, fmt: (v: number) => fmtLn(v), icon: vialIcon(c), colour: M.strainById(c).color })),
];
/** Horde times: play time from the start of a run to beating that horde (seconds), shown to the second. */
const dur = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.round(sec % 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : m ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`; };
const hordeKey = (k: string) => /^t_h\d+$/.test(k);
export const sortDef = (k: string): SortDef => hordeKey(k) ? { key: k, label: `Horde ${k.slice(3)} time`, fmt: dur, asc: true } : SORTS.find((x) => x.key === k && x.key !== 't_h') ?? SORTS[0];
const BEST_KEY = 'zombie-idle-board-best';
export function myEntry(): Entry | null {
  const p = getPlayer();
  if (!p) return null;
  const s = game.s, owned = Object.values(s.units).filter((u) => u.count > 0);
  const st: Record<string, number> = {
    hordes: s.hordes + (s.prestige?.earned ?? 0), kills: s.kills, bosses: s.bossKills ?? 0, headshots: s.headshots ?? 0, tier: (s.bestTier = Math.max(s.bestTier ?? 0, M.bestTier(s.strains))), best_horde: (s.bestHorde = Math.max(s.bestHorde ?? 0, s.hordes)),
    unit_lv: Math.max(0, ...owned.map((u) => M.nlv(u, 'dmg'))), play: Math.floor(s.playSec ?? 0), combo: s.bestCombo ?? 0,
    ults: owned.filter((u) => u.evo !== undefined).length + Object.values(s.strains).filter((z) => z.ult).length,
    mastery: MASTERY.filter((_, i) => regionComplete(s.alloc, i)).length, soldiers: owned.reduce((a, u) => a + u.count, 0), runs: s.prestige?.runs ?? 0,
  };
  for (const [k, t] of Object.entries(s.hordeTimes ?? {})) if (Number.isFinite(t) && t > 0) st[`t_h${k}`] = t;
  for (const c of M.COLOURS) { const v = s.earnedDna?.[c]; if (v !== undefined && Number.isFinite(v)) st[`dna_${c}`] = Math.round(v * 1000) / 1000; }
  // The board shows your best per stat across every game on this device, so starting a new game never lowers your row.
  let best: Record<string, number> = {};
  try { best = JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') ?? {}; } catch { /* storage blocked */ }
  for (const [k, v] of Object.entries(best)) if (typeof v === 'number' && Number.isFinite(v) && (hordeKey(k) ? !(st[k] <= v) : !(st[k] >= v))) st[k] = v;   // times: lowest wins
  try { localStorage.setItem(BEST_KEY, JSON.stringify(st)); } catch { /* storage blocked */ }
  return { id: p.id, name: p.name, s: st };
}
/** The online board: a Supabase project set up with docs/leaderboard.sql (+ docs/leaderboard-v2.sql for the stats). The key
 * is the project's public key by design: the database only allows reading the board and submitting your own row. */
const SUPA_URL = 'https://yeigxhkozedgymktunkj.supabase.co';
const SUPA_KEY = 'sb_publishable_LYuhi1OSn4qsiUNAQ_4znw_L1zKTwdp';
const supa = (path: string, init: RequestInit = {}) => fetch(`${SUPA_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SUPA_KEY, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
/** Only the published game submits scores (never a local test or dev server). */
const LIVE_SITE = typeof location !== 'undefined' && location.hostname.endsWith('github.io');
const LEGACY = ['hordes', 'tier', 'kills', 'bosses', 'runs'];
let v2 = true;   // false if the database hasn't had the stats upgrade yet (then only the original columns exist)
let v2Retry = 0;   // …and it's tried again every few minutes, so a game left open across the upgrade picks it up
const v2Off = () => { v2 = false; v2Retry = Date.now() + 3 * 60_000; };
const v2Check = () => { if (!v2 && Date.now() > v2Retry) v2 = true; };
export const BOARD = SUPA_URL && SUPA_KEY ? {
  async submit(e: Entry) {
    if (!LIVE_SITE) return;   // test and development copies of the game never write to the real board
    const p = getPlayer(); if (!p?.secret) return;
    v2Check();
    if (v2) {
      const r = await supa('rpc/submit_stats', { method: 'POST', body: JSON.stringify({ p_id: e.id, p_secret: p.secret, p_name: e.name, p_stats: e.s }) });
      if (r.ok) return;
      if (r.status !== 404) throw new Error(`submit ${r.status}`);
      v2Off();
    }
    const r = await supa('rpc/submit_score', { method: 'POST', body: JSON.stringify({ p_id: e.id, p_secret: p.secret, p_name: e.name, p_hordes: e.s.hordes, p_tier: e.s.tier, p_kills: e.s.kills, p_bosses: e.s.bosses, p_runs: e.s.runs }) });
    if (!r.ok) throw new Error(`submit ${r.status}`);
  },
  async top(key: string, n: number): Promise<Entry[]> {
    v2Check();
    const legacy = LEGACY.includes(key);
    if (!v2 && !legacy) return [];
    const order = legacy ? `${key}.desc,hordes.desc,tier.desc` : `stats->${key}.${hordeKey(key) ? 'asc' : 'desc'}.nullslast,hordes.desc`;
    let r = await supa(`leaderboard_public?select=id,name,hordes,tier,kills,bosses,runs${v2 ? ',stats' : ''}&order=${order}&limit=${n}`);
    if (!r.ok && v2) { v2Off(); if (!legacy) return []; r = await supa(`leaderboard_public?select=id,name,hordes,tier,kills,bosses,runs&order=${order}&limit=${n}`); }
    if (!r.ok) throw new Error(`top ${r.status}`);
    type Row = { id: string; name: string; hordes: number; tier: number; kills: number | string; bosses: number; runs: number; stats?: Record<string, number> };
    return (await r.json() as Row[]).map((x) => ({ id: x.id, name: x.name, s: { ...(x.stats ?? {}), hordes: x.hordes, tier: x.tier, kills: Number(x.kills), bosses: x.bosses, runs: x.runs } }));
  },
} : null;
export const boardV2 = () => v2;
const cache = new Map<string, Entry[]>();
const loading = new Set<string>();
let lastSubmit = 0;
/** Push your stats (at most once a minute) and refresh the list for a sort. */
export async function syncBoard(force = false, key = 'hordes') {
  const me = myEntry();
  if (!BOARD || !me) return;
  try {
    if (force || Date.now() - lastSubmit > 60_000) { lastSubmit = Date.now(); await BOARD.submit(me); }
    loading.add(key);
    cache.set(key, await BOARD.top(key, 50));
    if (hordeKey(key) && !cache.has('best_horde')) cache.set('best_horde', await BOARD.top('best_horde', 50));   // how far the horde picker goes
  } catch { /* offline: keep the last list */ } finally { loading.delete(key); }
}
/** Small leaderboard teaser on the Hordes tab. */
export function leaderboardHtml() { return ''; }
/** The Leaderboard tab: sort chips, then the top 50 for that stat (your own row always shown and highlighted). */
export function leaderboardPageHtml(key: string) {
  const me = myEntry(), d = sortDef(key);
  const isOn = (x: SortDef) => x.key === d.key || (x.key === 't_h' && hordeKey(d.key));
  const arg = (x: SortDef) => (x.key === 't_h' ? (hordeKey(d.key) ? d.key : 't_h1') : x.key);
  // Fastest hordes: a second row picks the horde (up to the furthest anyone on the board has reached)
  const far = Math.min(60, Math.max(10, game.s.bestHorde ?? 0, ...(cache.get('best_horde') ?? []).map((e) => e.s.best_horde ?? 0)));
  const picker = hordeKey(d.key) ? `<div class="lbp-sorts lbp-hordes" aria-label="Horde">${Array.from({ length: far }, (_, i) => `<button class="lbp-chip ${d.key === `t_h${i + 1}` ? 'on' : ''}" data-action="rank-sort" data-arg="t_h${i + 1}">${i + 1}</button>`).join('')}</div>` : '';
  const chips = `<div class="lbp-sorts" role="tablist" aria-label="Rank by">${SORTS.map((x) => `<button class="lbp-chip ${isOn(x) ? 'on' : ''}" data-action="rank-sort" data-arg="${arg(x)}" role="tab" aria-selected="${isOn(x)}" ${x.colour ? `style="--cc:${x.colour}"` : ''}>${x.icon ? `<img class="px" src="${x.icon}" alt="">` : ''}${esc(x.label)}</button>`).join('')}</div>${picker}`;
  if (!me) return `${chips}<div class="lbp-empty card"><b>Hold the wall for a minute to take command</b><span>HQ will ask your name, and you'll join the board.</span></div>`;
  const list = BOARD ? cache.get(d.key) : undefined;
  let rows = list ? list.filter((e) => e.s[d.key] !== undefined) : [];
  if (!BOARD || !list) rows = [me];
  const mine = rows.findIndex((e) => e.id === me.id);
  if (mine >= 0) rows[mine] = me;   // your freshest numbers
  else if (list && list.length < 50 && me.s[d.key] !== undefined) rows.push(me);   // the whole board is here: rank yourself in it
  const sorted = d.asc ? [...rows].filter((e) => e.s[d.key] !== undefined).sort((a, b) => a.s[d.key] - b.s[d.key])
    : [...rows].sort((a, b) => (b.s[d.key] ?? -1) - (a.s[d.key] ?? -1) || (b.s.hordes ?? 0) - (a.s.hordes ?? 0));
  const myRank = sorted.findIndex((e) => e.id === me.id);
  const row = (e: Entry, i: number | null) => { const v = e.s[d.key];
    return `<div class="lbp-r ${e.id === me.id ? 'me' : ''} ${i !== null && i < 3 ? `top${i + 1}` : ''}"><span class="rk">${i === null ? '—' : i + 1}</span>
      <div class="who"><b>${esc(e.name)}${e.s.runs ? ` <i>P${e.s.runs}</i>` : ''}</b><span>${fmtInt(e.s.hordes ?? 0)} hordes · tier ${fmtInt(e.s.tier ?? 0)} · ${fmtInt(e.s.kills ?? 0)} kills</span></div>
      <span class="val" ${d.colour ? `style="color:${d.colour}"` : ''}>${v === undefined ? '–' : esc(d.fmt(v))}</span></div>`; };
  const note = !BOARD ? '<p class="sub small">Showing your own record.</p>'
    : loading.has(d.key) && !list ? '<p class="sub small">Loading the board…</p>'
    : !v2 && !LEGACY.includes(d.key) ? '<p class="sub small">This ranking switches on once the leaderboard database gets its stats upgrade.</p>' : '';
  return `${chips}<div class="lbp-head"><span>Ranked by <b>${esc(d.label)}</b></span><span>${myRank >= 0 ? `You: <b>#${myRank + 1}</b>` : 'You: outside the top 50'}</span></div>
    ${note}<div class="lbp-list">${sorted.slice(0, 50).map((e, i) => row(e, i)).join('')}${myRank < 0 ? row(me, null) : ''}</div>`;
}

// ---------- the cutscene ----------
let up = false;
export const cutsceneUp = () => up;
/** Show the "you're the leader" cutscene once: after a minute of play, if no name has been chosen yet. */
export function maybeCommanderScene(blocked: boolean) {
  if (up || blocked || getPlayer() || (game.s.playSec ?? 0) < 60) return;
  commanderScene();
}
export function commanderScene(rename = false) {
  if (rename && !canRename()) return;
  up = true;
  const lines = rename
    ? ['HQ here. Changing your call sign, Commander? You only get to do this once, so choose well.']
    : ['*kssht* ...this is HQ. Do you read me, rooftop?', 'A whole minute and the wall is still standing. Good work out there.',
      'The squad\'s been asking who\'s calling the shots. Guess that makes you the leader.', 'So, Commander. What do they call you?'];
  const el = document.createElement('div');
  el.id = 'cutscene';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'A message from HQ');
  el.innerHTML = `<div class="cs-card">
      <div class="cs-who"><div class="cs-face"><img class="px" src="${classIcon('rifle')}" alt=""><i class="cs-wave"></i></div><div><b>HQ · Radio</b><span>Channel 1 · encrypted</span></div></div>
      <p class="cs-line" aria-live="polite"></p>
      <form class="cs-form" hidden autocomplete="off"><label for="cs-name">Commander name</label>
        <input id="cs-name" maxlength="16" placeholder="Your name" value="${esc(getPlayer()?.name ?? '')}" required>
        <p class="cs-err" hidden>2 to 16 letters or numbers.</p>
        <button class="btn cs-go" type="submit">Take command</button></form>
      <button class="btn ghost cs-next" type="button">Next ›</button>
    </div>`;
  document.body.appendChild(el);
  const lineEl = el.querySelector<HTMLElement>('.cs-line')!, next = el.querySelector<HTMLButtonElement>('.cs-next')!, form = el.querySelector<HTMLFormElement>('.cs-form')!;
  const input = el.querySelector<HTMLInputElement>('#cs-name')!, err = el.querySelector<HTMLElement>('.cs-err')!;
  let i = 0, typing = 0, full = '';
  const type = (text: string) => {
    full = text; let k = 0; lineEl.textContent = '';
    window.clearInterval(typing);
    typing = window.setInterval(() => { k++; lineEl.textContent = text.slice(0, k); if (k >= text.length) window.clearInterval(typing); }, 26);
  };
  const show = () => {
    type(lines[i]);
    const last = i === lines.length - 1;
    next.hidden = last; form.hidden = !last;
    if (last) window.setTimeout(() => input.focus({ preventScroll: true }), 300);
  };
  let done = false;
  next.addEventListener('click', () => {
    if (lineEl.textContent !== full) { window.clearInterval(typing); lineEl.textContent = full; return; }   // first tap finishes the line
    if (done) { sfx.nextCard(); el.classList.add('cs-bye'); window.setTimeout(() => { el.remove(); up = false; game.emit('change'); if (!rename) window.setTimeout(eerie, 900); }, 250); return; }
    i++; sfx.nextCard(); show();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanName(input.value);
    if (name.length < 2) { err.hidden = false; input.focus(); return; }
    const p = setPlayer(name, rename);
    form.hidden = true; next.hidden = true;
    type(rename ? `Copy that. Call sign updated: Commander ${p.name}.` : `Commander ${p.name}. The whole world is watching the leaderboard. Make it count. HQ out.`);
    sfx.unlock(0);
    void syncBoard(true);
    // the player closes it themselves, once they've read HQ's sign-off
    next.textContent = rename ? 'Done' : 'Back to the fight ›'; next.hidden = false; done = true;
    window.setTimeout(() => next.focus({ preventScroll: true }), 50);
  });
  sfx.nextCard();
  show();
}

/** Soundtracks HQ hands over (once each, mandatory) as the hordes fall. */
const TRACK_SCENES: { id: sfx.SoundtrackId; horde: number; tape: string; lines: (name: string) => string[] }[] = [
  { id: 'iron', horde: 3, tape: 'IRON MANDIBLE', lines: (name) => ['*kssht* HQ again. Three hordes down, Commander ' + name + '. Impressive. But I have to ask you something.',
    'Have you been doing all of this... in SILENCE? Mowing down the undead with no soundtrack?',
    'That\'s not soldiering. That\'s psychopath behaviour. The squad has filed a formal complaint. Kevin is crying.',
    'Rule one of the apocalypse: every massacre needs a banger. So I pulled this off a dead DJ\'s van. Don\'t ask what was left of the DJ.',
    'It\'s called Iron Mandible. It slaps. Play it loud and never let me catch you killing in silence again. HQ out.'] },
  { id: 'bell', horde: 5, tape: 'NO ONE RINGS THE BELL', lines: (name) => ['*kssht* HQ. Horde five, ' + name + '. FIVE. And I can hear the music from here. Now THAT\'s a rooftop.',
    'Honestly? I\'ve never seen the squad this happy. Kevin stopped crying. Kevin is headbanging. Kevin has lost an ear doing it.',
    'But a true psychopath needs range. You can\'t rock out to one song forever. That\'s how they get you.',
    'So I raided the old church on 5th Street. The bell tower\'s empty. The choir is... busy. Undead busy. But they left this behind.',
    'No One Rings the Bell. Put it on, Commander, and let\'s see who\'s still standing when it ends. HQ out.'] },
];
/** Once the matching horde is beaten (and the player has a name), HQ's next mixtape scene plays. */
export function maybeSoundtrackScene(blocked: boolean) {
  if (up || blocked || !getPlayer()) return;
  const reached = Math.max(game.s.hordes, game.s.bestHorde ?? 0);
  const t = TRACK_SCENES.find((x) => reached >= x.horde && !game.s.tracks?.includes(x.id));
  if (t) soundtrackScene(t);
}
function soundtrackScene(t: typeof TRACK_SCENES[number]) {
  up = true;
  const lines = t.lines(getPlayer()?.name ?? 'Commander');
  const el = document.createElement('div');
  el.id = 'cutscene';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'A message from HQ');
  el.innerHTML = `<div class="cs-card">
      <div class="cs-who"><div class="cs-face"><img class="px" src="${classIcon('rifle')}" alt=""><i class="cs-wave"></i></div><div><b>HQ · Radio</b><span>Channel 1 · encrypted</span></div></div>
      <p class="cs-line" aria-live="polite"></p>
      <div class="cs-tape" hidden><div class="tape"><i></i><i></i><b>${t.tape}</b></div>
        <p><b>New soundtrack collected</b><span>Switch soundtracks any time in Settings → Sound &amp; display.</span></p></div>
      <button class="btn ghost cs-next" type="button">Next ›</button>
    </div>`;
  document.body.appendChild(el);
  const lineEl = el.querySelector<HTMLElement>('.cs-line')!, next = el.querySelector<HTMLButtonElement>('.cs-next')!, tape = el.querySelector<HTMLElement>('.cs-tape')!;
  let i = 0, typing = 0, full = '', stage = 0;
  const type = (text: string) => {
    full = text; let k = 0; lineEl.textContent = '';
    window.clearInterval(typing);
    typing = window.setInterval(() => { k++; lineEl.textContent = text.slice(0, k); if (k >= text.length) window.clearInterval(typing); }, 26);
  };
  next.addEventListener('click', () => {
    if (lineEl.textContent !== full) { window.clearInterval(typing); lineEl.textContent = full; return; }   // first tap finishes the line
    sfx.nextCard();
    if (stage === 0 && i < lines.length - 1) { i++; type(lines[i]); if (i === lines.length - 1) next.textContent = 'Take the tape ›'; return; }
    if (stage === 0) {   // the tape: collected
      stage = 1; game.s.tracks = [...new Set([...(game.s.tracks ?? []), t.id])]; game.save();
      tape.hidden = false; next.textContent = 'Crank it up 🔊'; sfx.unlock(1); return;
    }
    if (!sfx.soundPrefs().music) sfx.setMusic(true);
    sfx.setSoundtrack(t.id);
    el.classList.add('cs-bye'); window.setTimeout(() => { el.remove(); up = false; game.emit('change'); }, 250);
  });
  sfx.nextCard();
  type(lines[0]);
}

/** After the first naming: a faint, unsettling line drifts over the battlefield, then fades away. */
function eerie() {
  const el = document.createElement('div');
  el.id = 'eerie';
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = '<p>You feel an eerie, unknown presence watching you…</p><p class="e2">watching…</p><p class="e3">always watching…</p>';
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), 8200);
}
