// "You're the leader now": after the first horde is beaten, HQ radios in, a short typewriter cutscene plays, and the player
// picks a commander name. The name (with a random id) is kept on this device and in the save, and it's what the leaderboard
// shows. The leaderboard itself (Hordes tab) lists the player's own stats, plus everyone else's once an online board is
// connected (see BOARD below).
import { game } from '../core/state.ts';
import * as M from '../core/model.ts';
import { classIcon } from '../game/art.ts';
import { fmtInt } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';

export interface Player { id: string; name: string; secret?: string }
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
export function setPlayer(name: string): Player {
  const old = getPlayer();
  const p: Player = { id: old?.id ?? crypto.randomUUID(), name, secret: old?.secret ?? rnd(16) };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ }
  game.s.player = p; game.save();
  return p;
}
/** Names: 2-16 letters, digits, spaces, _ or -. */
export const cleanName = (s: string) => s.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 16);

// ---------- the leaderboard's stats ----------
export interface Entry { id: string; name: string; tier: number; hordes: number; kills: number; bosses: number; runs: number; at: number }
export function myEntry(): Entry | null {
  const p = getPlayer();
  if (!p) return null;
  const s = game.s;
  return { id: p.id, name: p.name, tier: M.bestTier(s.strains), hordes: s.hordes + (s.prestige?.earned ?? 0), kills: s.kills, bosses: s.bossKills ?? 0, runs: s.prestige?.runs ?? 0, at: Date.now() };
}
/** The online board: a Supabase project set up with docs/leaderboard.sql. The anon key is public by design (the database
 * only allows reading the board and submitting your own row through submit_score). Empty = local-only board. */
const SUPA_URL = '';
const SUPA_KEY = '';
const supa = (path: string, init: RequestInit = {}) => fetch(`${SUPA_URL}/rest/v1/${path}`, { ...init, headers: { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
export const BOARD: { submit(e: Entry): Promise<void>; top(n: number): Promise<Entry[]> } | null = SUPA_URL && SUPA_KEY ? {
  async submit(e) {
    const p = getPlayer(); if (!p?.secret) return;
    const r = await supa('rpc/submit_score', { method: 'POST', body: JSON.stringify({ p_id: e.id, p_secret: p.secret, p_name: e.name, p_hordes: e.hordes, p_tier: e.tier, p_kills: e.kills, p_bosses: e.bosses, p_runs: e.runs }) });
    if (!r.ok) throw new Error(`submit ${r.status}`);
  },
  async top(n) {
    const r = await supa(`leaderboard_public?select=id,name,hordes,tier,kills,bosses,runs&order=hordes.desc,tier.desc,kills.desc&limit=${n}`);
    if (!r.ok) throw new Error(`top ${r.status}`);
    return (await r.json() as Omit<Entry, 'at'>[]).map((x) => ({ ...x, kills: Number(x.kills), at: 0 }));
  },
} : null;
let cache: Entry[] = [];
let lastSubmit = 0;
/** Push your stats (at most once a minute) and refresh the cached top list. */
export async function syncBoard(force = false) {
  const me = myEntry();
  if (!BOARD || !me) return;
  try {
    if (force || Date.now() - lastSubmit > 60_000) { lastSubmit = Date.now(); await BOARD.submit(me); }
    cache = await BOARD.top(50);
  } catch { /* offline: keep the last list */ }
}
export function leaderboardHtml() {
  const me = myEntry();
  if (!me) return `<div class="lb card"><div class="lb-h"><b>Leaderboard</b></div><p class="sub small">Beat Horde 1 to take command and get on the board.</p></div>`;
  const rows = BOARD && cache.length ? cache : [me];
  const sorted = [...rows].sort((a, b) => b.hordes - a.hordes || b.tier - a.tier || b.kills - a.kills).slice(0, 20);
  if (!sorted.some((e) => e.id === me.id)) sorted.push(me);
  return `<div class="lb card"><div class="lb-h"><b>Leaderboard</b><button class="lb-name" data-action="rename" title="Change your name">✎ ${esc(me.name)}</button></div>
    <div class="lb-t"><div class="lb-r lb-head"><span>#</span><span>Commander</span><span>Hordes</span><span>Best tier</span><span>Kills</span><span>Bosses</span></div>
    ${sorted.map((e, i) => `<div class="lb-r ${e.id === me.id ? 'me' : ''}"><span>${i + 1}</span><span class="nm">${esc(e.name)}${e.runs ? ` <i>P${e.runs}</i>` : ''}</span><span>${fmtInt(e.hordes)}</span><span>${fmtInt(e.tier)}</span><span>${fmtInt(e.kills)}</span><span>${fmtInt(e.bosses)}</span></div>`).join('')}</div>
    ${BOARD ? '' : '<p class="sub small" style="margin:6px 0 0">The global board is coming online soon; for now it shows your own record.</p>'}</div>`;
}

// ---------- the cutscene ----------
let up = false;
export const cutsceneUp = () => up;
/** Show the "you're the leader" cutscene once: after Horde 1, if no name has been chosen yet. */
export function maybeCommanderScene(blocked: boolean) {
  if (up || blocked || getPlayer() || game.s.hordes < 1) return;
  commanderScene();
}
export function commanderScene(rename = false) {
  up = true;
  const lines = rename
    ? ['HQ here. Changing your call sign, Commander?']
    : ['*kssht* ...this is HQ. Do you read me, rooftop?', 'That horde should have broken the wall. It didn\'t. Good work out there.',
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
  next.addEventListener('click', () => {
    if (lineEl.textContent !== full) { window.clearInterval(typing); lineEl.textContent = full; return; }   // first tap finishes the line
    i++; sfx.nextCard(); show();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = cleanName(input.value);
    if (name.length < 2) { err.hidden = false; input.focus(); return; }
    const p = setPlayer(name);
    form.hidden = true; next.hidden = true;
    type(rename ? `Copy that. Call sign updated: Commander ${p.name}.` : `Commander ${p.name}. The whole world is watching the leaderboard. Make it count. HQ out.`);
    sfx.unlock(0);
    void syncBoard(true);
    window.setTimeout(() => { el.classList.add('cs-bye'); window.setTimeout(() => { el.remove(); up = false; game.emit('change'); }, 250); }, 3200);
  });
  sfx.nextCard();
  show();
}
