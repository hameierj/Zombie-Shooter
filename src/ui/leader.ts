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
export interface Entry { id: string; name: string; s: Record<string, number>; seen?: number }
/** Online now: their game sent stats in the last 3 minutes (a running game sends about once a minute). */
const ONLINE_MS = 3 * 60_000;
const online = (e: Entry, me?: Entry) => (me && e.id === me.id) || (!!e.seen && Date.now() - e.seen < ONLINE_MS);
const dot = (e: Entry, me?: Entry) => (online(e, me) ? '<i class="on-dot" title="Playing now" aria-label="Playing now"></i>' : '');
export interface SortDef { key: string; label: string; fmt: (v: number) => string; icon?: string; colour?: string; asc?: boolean }
const time = (sec: number) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`; };
export const SORTS: SortDef[] = [
  { key: 'best_horde', label: 'Best horde', fmt: (v) => `Horde ${fmtInt(v)}` },
  { key: 'speed', label: 'Fastest hordes', fmt: fmtInt },
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
export const sortDef = (k: string): SortDef => (k === 'speed' || hordeKey(k)) ? { key: 'speed', label: 'Fastest hordes', fmt: dur, asc: true } : SORTS.find((x) => x.key === k) ?? SORTS[0];
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
    let r = await supa(`leaderboard_public?select=id,name,hordes,tier,kills,bosses,runs,updated_at${v2 ? ',stats' : ''}&order=${order}&limit=${n}`);
    if (!r.ok && v2) { v2Off(); if (!legacy) return []; r = await supa(`leaderboard_public?select=id,name,hordes,tier,kills,bosses,runs,updated_at&order=${order}&limit=${n}`); }
    if (!r.ok) throw new Error(`top ${r.status}`);
    type Row = { id: string; name: string; hordes: number; tier: number; kills: number | string; bosses: number; runs: number; updated_at?: string; stats?: Record<string, number> };
    return (await r.json() as Row[]).map((x) => ({ id: x.id, name: x.name, seen: x.updated_at ? Date.parse(x.updated_at) : undefined, s: { ...(x.stats ?? {}), hordes: x.hordes, tier: x.tier, kills: Number(x.kills), bosses: x.bosses, runs: x.runs } }));
  },
} : null;
export const boardV2 = () => v2;
/** Problem reports go to the "reports" table (docs/reports.sql): insert-only for players. Returns 'sent', 'local' (a test
 * or dev copy, which never sends) or 'failed' (offline, or the table isn't set up yet). */
export async function sendReport(text: string): Promise<'sent' | 'local' | 'failed'> {
  if (!LIVE_SITE) return 'local';
  try {
    const r = await supa('reports', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ player: getPlayer()?.name ?? null, report: text.slice(0, 60000) }) });
    return r.ok ? 'sent' : 'failed';
  } catch { return 'failed'; }
}
const cache = new Map<string, Entry[]>();
const loading = new Set<string>();
let lastSubmit = 0;
/** Push your stats (at most once a minute) and refresh the list for a sort. */
export async function syncBoard(force = false, key = 'hordes') {
  const me = myEntry();
  if (!BOARD || !me) return;
  try {
    if (force || (Date.now() - lastSubmit > 60_000 && !document.hidden)) { lastSubmit = Date.now(); await BOARD.submit(me); }   // in the background: no updates, so the green dot fades
    loading.add(key);
    // Fastest hordes needs everyone's horde times: the whole board, furthest first
    cache.set(key, await BOARD.top(key === 'speed' || hordeKey(key) ? 'best_horde' : key, key === 'speed' || hordeKey(key) ? 200 : 50));
  } catch { /* offline: keep the last list */ } finally { loading.delete(key); }
}
/** Fastest hordes: one record per horde, the furthest horde anyone has beaten at the top. Each row: the horde, the
 * commander who beat it fastest (from a run's start) and the time, plus your own time when someone else holds it. */
function recordsHtml(me: Entry, list: Entry[] | undefined) {
  const all = new Map<string, Entry>((list ?? []).map((e) => [e.id, e]));
  all.set(me.id, me);   // your freshest times
  const byHorde = new Map<number, { e: Entry; t: number }[]>();
  for (const e of all.values()) for (const [k, t] of Object.entries(e.s)) {
    if (!hordeKey(k) || !(t > 0)) continue;
    const h = Number(k.slice(3));
    (byHorde.get(h) ?? byHorde.set(h, []).get(h)!).push({ e, t });
  }
  const hs = [...byHorde.keys()].sort((a, b) => b - a);
  const note = BOARD && !list ? (loading.has('speed') ? '<p class="sub small">Loading the board…</p>' : '') : !BOARD ? '<p class="sub small">Showing your own record.</p>' : '';
  if (!hs.length) return `${note}<div class="lbp-empty card"><b>No horde times yet</b><span>Times count from the start of a run (or your last prestige) to beating each horde.</span></div>`;
  const line = (r: { e: Entry; t: number }, i: number) => `<div class="rec-r ${r.e.id === me.id ? 'me' : ''} ${i < 3 ? `top${i + 1}` : ''}"><span class="rk">${i + 1}</span><b>${dot(r.e, me)}${esc(r.e.name)}${r.e.id === me.id ? ' <i>you</i>' : ''}</b><span class="val">${dur(r.t)}</span></div>`;
  return `<div class="lbp-head"><span>Top 5 fastest for each horde</span><span>from a run's start</span></div>${note}<div class="rec-list">${hs.map((h) => {
    const rows = byHorde.get(h)!.sort((a, b) => a.t - b.t), mine = rows.findIndex((r) => r.e.id === me.id);
    return `<section class="rec-h"><h5><span class="rec-n">${h}</span>${esc(M.hordeDef(h).name)}</h5>
      ${rows.slice(0, 5).map(line).join('')}${mine >= 5 ? line(rows[mine], mine) : ''}</section>`;
  }).join('')}</div>`;
}
// ---------- records: #1 in any ranking, or the fastest time for a horde ----------
const REC_KEY = 'zombie-idle-records';
export interface RecordWin { title: string; sub: string; from?: string }
const OWED_KEY = 'zombie-idle-party-owed';
/** Records waiting for their party. Kept on the device until the party has played out, so a reload doesn't skip it. */
let pending: RecordWin[] = (() => { try { const v = JSON.parse(localStorage.getItem(OWED_KEY) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } })();
let owed: RecordWin[] = [...pending];
const saveOwed = () => { try { localStorage.setItem(OWED_KEY, JSON.stringify(owed)); } catch { /* storage blocked */ } };
/** The party for these records played out in full: they're no longer owed. */
export function partyDone(recs: RecordWin[]) { owed = owed.filter((o) => !recs.some((r) => r.title === o.title)); saveOwed(); }
/** Fresh records waiting for their party (taken by the UI once nothing else is on screen). */
export const takeRecords = () => { const r = pending; pending = []; return r; };
export const recordsPending = () => pending.length > 0;
/** Compare your stats with everyone else's on the board (once a minute). The first look is silent: records you already
 * hold don't throw a party, only ones you take from then on. */
export async function syncRecords() {
  const me = myEntry();
  if (!BOARD || !me) return;
  let all: Entry[];
  try { v2Check(); if (!v2) return; all = await BOARD.top('best_horde', 200); } catch { return; }
  cache.set('_all', all);
  const others = all.filter((e) => e.id !== me.id);
  if (!others.length) return;
  const held: string[] = [], label = new Map<string, RecordWin>();
  // who held it before you, and by how much you beat them
  const holder = (k: string, better: (a: number, b: number) => boolean) => { let b: Entry | null = null; for (const e of others) { const v = e.s[k]; if (v !== undefined && v > 0 && (!b || better(v, b.s[k]))) b = e; } return b; };
  for (const d of SORTS) {
    if (d.key === 'speed') continue;
    const v = me.s[d.key];
    if (v === undefined || !(v > 0)) continue;
    const h = holder(d.key, (a, b) => a > b), was = h?.s[d.key];
    if (was !== undefined && v <= was) continue;
    held.push(d.key);
    const dna = d.key.startsWith('dna_');   // DNA totals are logs: the gain is a multiple
    const gain = was === undefined ? '' : dna ? `×${fmtLn(v - was).replace(/^\+/, '')} more` : `+${d.fmt(v - was)} (×${(v / was).toFixed(v / was >= 10 ? 0 : 1)})`;
    label.set(d.key, { from: h?.name, title: `#1 in ${d.label}: ${d.fmt(v)}`, sub: h ? `Stolen from ${h.name} (${d.fmt(was!)}) · ${gain}` : 'First commander on the board to set it!' });
  }
  for (const [k, t] of Object.entries(me.s)) {
    if (!hordeKey(k) || !(t > 0)) continue;
    const h = holder(k, (a, b) => a < b), was = h?.s[k];
    if (was !== undefined && t >= was) continue;
    held.push(k);
    label.set(k, { from: h?.name, title: `Fastest Horde ${k.slice(3)}: ${dur(t)}`, sub: h ? `Stolen from ${h.name} (${dur(was!)}) · ${dur(was! - t)} faster` : `First commander ever to beat Horde ${k.slice(3)}!` });
  }
  let before: string[] | null = null;
  try { before = JSON.parse(localStorage.getItem(REC_KEY) ?? 'null'); } catch { /* ignore */ }
  try { localStorage.setItem(REC_KEY, JSON.stringify(held)); } catch { /* ignore */ }
  if (!before) return;   // first look: just note what you hold
  const fresh = held.filter((k) => !before!.includes(k) && !pending.some((p) => p.title === label.get(k)!.title));
  pending.push(...fresh.map((k) => label.get(k)!));
  owed.push(...fresh.map((k) => label.get(k)!)); saveOwed();
  if (fresh.length) sfx.preloadParty();   // the party track is ready by the time the party starts
}
/** Small leaderboard teaser on the Hordes tab. */
export function leaderboardHtml() { return ''; }
/** The Leaderboard tab: sort chips, then the top 50 for that stat (your own row always shown and highlighted). */
export function leaderboardPageHtml(key: string) {
  const me = myEntry(), d = sortDef(key);
  const isOn = (x: SortDef) => x.key === d.key;
  const arg = (x: SortDef) => x.key;
  const picker = '';
  const chips = `<div class="lbp-sorts" role="tablist" aria-label="Rank by">${SORTS.map((x) => `<button class="lbp-chip ${isOn(x) ? 'on' : ''}" data-action="rank-sort" data-arg="${arg(x)}" role="tab" aria-selected="${isOn(x)}" ${x.colour ? `style="--cc:${x.colour}"` : ''}>${x.icon ? `<img class="px" src="${x.icon}" alt="">` : ''}${esc(x.label)}</button>`).join('')}</div>${picker}`;
  if (!me) return `${chips}<div class="lbp-empty card"><b>Hold the wall for a minute to take command</b><span>HQ will ask your name, and you'll join the board.</span></div>`;
  const list = BOARD ? cache.get(d.key) : undefined;
  if (d.key === 'speed') return chips + recordsHtml(me, list);
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
      <div class="who"><b>${dot(e, me)}${esc(e.name)}${e.s.runs ? ` <i>P${e.s.runs}</i>` : ''}</b><span>${fmtInt(e.s.hordes ?? 0)} hordes · tier ${fmtInt(e.s.tier ?? 0)} · ${fmtInt(e.s.kills ?? 0)} kills</span></div>
      <span class="val" ${d.colour ? `style="color:${d.colour}"` : ''}>${v === undefined ? '–' : esc(d.fmt(v))}</span></div>`; };
  const note = !BOARD ? '<p class="sub small">Showing your own record.</p>'
    : loading.has(d.key) && !list ? '<p class="sub small">Loading the board…</p>'
    : !v2 && !LEGACY.includes(d.key) ? '<p class="sub small">This ranking switches on once the leaderboard database gets its stats upgrade.</p>' : '';
  const live = (list ?? []).filter((e) => e.id !== me.id && online(e)).length + 1;
  return `${chips}<div class="lbp-head"><span>Ranked by <b>${esc(d.label)}</b> · <span class="on-count"><i class="on-dot"></i>${live} playing now</span></span><span>${myRank >= 0 ? `You: <b>#${myRank + 1}</b>` : 'You: outside the top 50'}</span></div>
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
  const type = (text: string, then?: () => void) => {
    full = text; let k = 0; lineEl.textContent = '';
    window.clearInterval(typing);
    next.disabled = true;   // no skipping: the button wakes up once the whole line is on screen
    typing = window.setInterval(() => { k++; lineEl.textContent = text.slice(0, k); if (k >= text.length) { window.clearInterval(typing); next.disabled = false; then?.(); } }, 26);
  };
  const show = () => {
    const last = i === lines.length - 1;
    next.hidden = last; form.hidden = true;
    // the name box only appears once HQ has finished asking
    type(lines[i], last ? () => { form.hidden = false; window.setTimeout(() => input.focus({ preventScroll: true }), 50); } : undefined);
  };
  let done = false;
  next.addEventListener('click', () => {
    if (lineEl.textContent !== full) return;   // still typing
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
/** HQ's radio check-ins: mixtapes (a tape to take) and plain talks (`talk`: just lines, then a closing button). */
const TRACK_SCENES: { id: sfx.SoundtrackId | 'auto' | 'auto_tree' | 'auto_globals' | 'auto_units' | 'auto_ults' | 'drums'; horde: number; tape?: string; forced?: boolean; talk?: string; auto?: 'zombies' | 'tree' | 'globals' | 'units' | 'ults' | 'drums'; lines: (name: string) => string[] }[] = [
  { id: 'iron', horde: 3, tape: 'IRON MANDIBLE', forced: true, lines: (name) => ['*kssht* HQ again. Three hordes down, Commander ' + name + '. Impressive. But I have to ask you something.',
    'What is that... noise? Are you mowing down the undead to ELEVATOR MUSIC?',
    'Blowing zombies apart to lobby jazz, calm as a dentist\'s waiting room. That\'s psychopath behaviour. The squad has filed a formal complaint. Kevin is crying.',
    'Rule one of the apocalypse: every massacre needs a banger. So I pulled this off a dead DJ\'s van. Don\'t ask what was left of the DJ.',
    'It\'s called Iron Mandible. It slaps. Play it loud and never let me catch you killing to elevator music again.',
    'And this one\'s not optional. If you really prefer the elevator music, go change it back in your settings, you psycho. HQ out.'] },
  { id: 'bell', horde: 5, tape: 'NO ONE RINGS THE BELL', lines: (name) => ['*kssht* HQ. Horde five, ' + name + '. FIVE. And I can hear the music from here. Now THAT\'s a rooftop.',
    'Honestly? I\'ve never seen the squad this happy. Kevin stopped crying. Kevin is headbanging. Kevin has lost an ear doing it.',
    'But one song on repeat for the entire apocalypse? Same riff, every horde, forever? THAT\'s how psychopaths are made, Commander. A sane killer needs variety.',
    'So I raided the old church on 5th Street. The bell tower\'s empty. The choir is... busy. Undead busy. But they left this behind.',
    'No One Rings the Bell. Put it on, Commander, and let\'s see who\'s still standing when it ends. HQ out.'] },
  { id: 'auto', horde: 10, auto: 'zombies', talk: 'Let the grind begin ›', lines: (name) => ['*kssht* HQ. Horde TEN, Commander ' + name + '. TEN! I owe Kevin twenty bucks. He had you cracking at six.',
    'Listen. The squad has been watching you tap buttons for hours. They say it\'s like watching a raccoon open a vending machine. Respectfully.',
    'So we rigged up AUTO-BUY. First switch, top-left of the map: ZOMBIES. Flip it on and the squad raises the zombies for you, exactly as fast as you can grind them.',
    'Your thumbs can finally start their retirement. Kevin\'s thumbs did not make it. We don\'t talk about Kevin\'s thumbs.',
    'Because THIS is where the real meat grinder begins. I mean the LEADERBOARD grind. Freudian slip. Honestly, same thing.',
    'Every name on that board is coming for your spot now. Keep climbing and I\'ll send more switches. HQ out.'] },
  { id: 'auto_tree', horde: 13, auto: 'tree', talk: 'Flip it ›', lines: (name) => ['*kssht* HQ. Horde thirteen, ' + name + '. Unlucky number. Not for you. For them.',
    'Kevin has been studying your passive tree. Kevin can\'t read. He\'s been studying the pictures. He has opinions.',
    'You\'ve been tapping those little nodes like a pigeon pecking a button for seeds. We all saw it. We don\'t judge. We judged.',
    'New switch: TREE. The squad picks your passives for you, in order, like a responsible adult would.',
    'More grinding, less pecking. HQ out.'] },
  { id: 'auto_globals', horde: 16, auto: 'globals', talk: 'Spreadsheet time ›', lines: (name) => ['*kssht* HQ. Horde SIXTEEN. Commander ' + name + ', I am genuinely a little scared of you now.',
    'Kevin wants your autograph. On his remaining ear. Please use a marker, the last pen went badly.',
    'New switch: GLOBALS. Firepower, Rate of Fire, all five colour mastery upgrades that make the whole squad nastier, plus Scavenger. Bought for you.',
    'This is the mastery tier, Commander. The upgrades you get when the apocalypse stops being an emergency and becomes a lifestyle.',
    'The leaderboard has a name for people like you: psychos with spreadsheets. Wear it with pride. HQ out.'] },
  { id: 'auto_units', horde: 20, auto: 'units', talk: 'Run the machine ›', lines: (name) => ['*kssht* Horde TWENTY. ' + name + ', the squad held a vote about you. You won. You also lost. It was a confusing vote.',
    'Last switch: TROOPS. Hires and every single upgrade, bought automatically. You still pick the ultimate weapons. We\'re not animals.',
    'That\'s it. All four switches. The whole thing runs itself now.',
    'You are no longer a commander. You are the proud floor manager of a fully automated meat grinder. Leaderboard grinder. I keep doing that.',
    'The top of that board is yours to take. Don\'t make me come down there. HQ out.'] },
  { id: 'auto_ults', horde: 25, auto: 'ults', talk: 'Remember everything ›', lines: (name) => ['*kssht* HQ. Horde TWENTY-FIVE, ' + name + '. I\'m making it official: you are a problem. For the zombies. Also for us.',
    'Kevin timed you on the ultimate weapon screen. Four seconds. Staring at two guns you\'ve picked a hundred times. Every. Single. Run.',
    'Four seconds is a LOT of zombies, Commander. Competitive people don\'t stare. They pre-decide.',
    'So, new switch: ULTIMATES. The squad remembers the weapon you picked for each unit, and the moment they\'re ready again, they just grab it. No menu. No staring.',
    'A unit type you\'ve never evolved still asks you once. After that it\'s muscle memory. Kevin\'s muscle memory is mostly flinching.',
    'I\'ve already flipped it on for you. Now go shave seconds off that leaderboard. HQ out.'] },
  { id: 'drums', horde: 30, auto: 'drums', talk: 'Bang the drums ›', lines: (name) => ['*kssht* HQ. Horde THIRTY. ' + name + ', the zombies have a group chat about you now. It\'s mostly screaming.',
    'Every prestige you march back to the tree and buy War Drums first. Same node. Every run. Like brushing your teeth, but louder.',
    'So the squad chipped in. From now on War Drums comes pre-installed at the start of every run. Free. Already on the tree. Doesn\'t even bump your prices.',
    'Hordes start themselves the second you can win them. Kevin is on drums. Kevin cannot play drums. It\'s fine. It\'s mostly just hitting things.',
    'Thirty hordes, Commander. The leaderboard is starting to look nervous. HQ out.'] },
];
/** Once the matching horde is beaten (and the player has a name), HQ's next mixtape scene plays. */
export function maybeSoundtrackScene(blocked: boolean) {
  if (up || blocked || !getPlayer()) return;
  const reached = Math.max(game.s.hordes, game.s.bestHorde ?? 0);
  const t = TRACK_SCENES.find((x) => x.talk ? !!x.auto && game.autoOpen(x.auto) && !game.s.radio?.includes(x.id) : reached >= x.horde && !game.s.tracks?.includes(x.id));
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
      <div class="cs-tape" hidden><div class="tape"><i></i><i></i><b>${t.tape ?? ''}</b></div>
        <p><b>New soundtrack collected</b><span>Switch soundtracks any time in Settings → Sound &amp; display.</span></p></div>
      <div class="cs-choose" hidden>
        <button class="btn ghost cs-prev" type="button">▶ Preview</button>
        <div class="row"><button class="btn ghost grow cs-keep" type="button"></button><button class="btn grow cs-swap" type="button">Swap to it 🔊</button></div>
      </div>
      <button class="btn ghost cs-next" type="button">Next ›</button>
    </div>`;
  document.body.appendChild(el);
  const lineEl = el.querySelector<HTMLElement>('.cs-line')!, next = el.querySelector<HTMLButtonElement>('.cs-next')!, tape = el.querySelector<HTMLElement>('.cs-tape')!;
  const choose = el.querySelector<HTMLElement>('.cs-choose')!, prev = el.querySelector<HTMLButtonElement>('.cs-prev')!;
  const before = sfx.savedSoundtrack(), musicWas = sfx.soundPrefs().music;
  let previewing = false;
  const finish = (swap: boolean) => {
    if (t.talk) { game.s.radio = [...new Set([...(game.s.radio ?? []), t.id])]; if (t.id === 'auto_ults') game.autoCfg.ults = true; if (t.id === 'drums') game.grantDrums(); game.save(); }
    else if (swap) { if (!sfx.soundPrefs().music) sfx.setMusic(true); sfx.setSoundtrack(t.id as sfx.SoundtrackId); }
    else { sfx.setSoundtrack(before); if (!musicWas && sfx.soundPrefs().music) sfx.setMusic(false); }   // back to what was playing
    el.classList.add('cs-bye'); window.setTimeout(() => { el.remove(); up = false; game.emit('change'); }, 250);
  };
  prev.addEventListener('click', () => {
    previewing = !previewing;
    if (previewing) { if (!sfx.soundPrefs().music) sfx.setMusic(true); sfx.setSoundtrack(t.id as sfx.SoundtrackId, false); prev.textContent = '■ Stop preview'; }
    else { sfx.setSoundtrack(before, false); if (!musicWas) sfx.setMusic(false); prev.textContent = '▶ Preview'; }
  });
  el.querySelector<HTMLButtonElement>('.cs-keep')!.textContent = `Keep ${sfx.SOUNDTRACKS.find((x) => x.id === before)?.name ?? 'current'}`;
  el.querySelector<HTMLButtonElement>('.cs-keep')!.addEventListener('click', () => { sfx.nextCard(); finish(false); });
  el.querySelector<HTMLButtonElement>('.cs-swap')!.addEventListener('click', () => { sfx.nextCard(); finish(true); });
  let i = 0, typing = 0, full = '', stage = 0;
  const type = (text: string) => {
    full = text; let k = 0; lineEl.textContent = '';
    window.clearInterval(typing);
    next.disabled = true;   // no skipping: the button wakes up once the whole line is on screen
    typing = window.setInterval(() => { k++; lineEl.textContent = text.slice(0, k); if (k >= text.length) { window.clearInterval(typing); next.disabled = false; } }, 26);
  };
  next.addEventListener('click', () => {
    if (lineEl.textContent !== full) return;   // still typing
    sfx.nextCard();
    if (stage === 0 && i < lines.length - 1) { i++; type(lines[i]); if (i === lines.length - 1) next.textContent = t.talk ?? 'Take the tape ›'; return; }
    if (t.talk) { finish(false); return; }
    if (stage === 0) {   // the tape: collected
      stage = 1; game.s.tracks = [...new Set([...(game.s.tracks ?? []), t.id])]; game.save();
      tape.hidden = false; sfx.unlock(1);
      if (t.forced) next.textContent = 'Crank it up 🔊';   // the first one isn't optional
      else { next.hidden = true; choose.hidden = false; }   // later ones: preview it, then swap or keep
      return;
    }
    finish(true);
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
