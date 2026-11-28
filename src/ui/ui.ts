// DOM interface: HUD (one counter per DNA colour), four tabs (Zombies, Squad, Tree, Hordes), a full-screen screen
// per unit type (its own upgrade tree, gear and ability), the pan/zoom passive tree, toasts and modals.
// Clicks go through one delegated listener using data-action attributes, so re-rendering never loses a tap on iOS.
import { showTitle } from './title.ts';
import { biohazard, hordeCards, overlayUp, setCardNotice, showCards } from './unlocks.ts';
import { evoUp, playEvolution, setEvoNotice } from './evolve.ts';
import { coachUp } from './tutorial.ts';
import { canRename, commanderScene, getPlayer, leaderboardHtml, leaderboardPageHtml, maybeCommanderScene, maybeSoundtrackScene, sendReport, syncBoard } from './leader.ts';
import { titleUp } from './title.ts';
import { showRanges, setShowRanges, showFps, setShowFps, skipAnims, setSkipAnims } from '../core/prefs';
import * as M from '../core/model.ts';
import type { ClassId, Gear, Gun, StrainId, Unit, UnitNodeId } from '../core/model.ts';
import { Game, game, type AutoSell, type Loot } from '../core/state.ts';
import { MASTERY, REGIONS, TREE, regionComplete, treeNode } from '../core/tree.ts';
import { charmIcon, classIcon, crateIcon, gunIcon, modIcon, nodeIcon, vialIcon, zombieIcon } from '../game/art.ts';
import { fmtInt, fmtLn, fmtMult, fmtNum, gearDesc, gearName, gunName, RARITY_COLOR } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';
import { buildReport, clearLog, lastSessionCrashed, log } from '../core/log.ts';

const C = M.CONFIG;
type Tab = 'zombies' | 'squad' | 'tree' | 'hordes' | 'ranks';
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const vial = (c: StrainId) => `<img class="px vial" src="${vialIcon(c)}" alt="${M.strainById(c).dna} DNA">`;
const cost = (c: StrainId, ln: number) => `<span class="cost">${vial(c)}${fmtLn(ln)}</span>`;
/** Attributes for a buy button whose enabled state tracks a DNA colour. */
const costAttr = (c: StrainId, ln: number) => `data-col="${c}" data-cost="${ln}"`;
const keepWord = (k: number) => (k >= 1.1 ? '<span class="good">keeping up</span>' : k >= 0.9 ? '<span class="warn">barely keeping up</span>' : '<span class="bad">overrun</span>');

/** Player option: show the keep-up meter and hints (off by default, so players read the battlefield instead). */
const KEEP_PREF = 'zombie-idle-show-keepup';
function showKeep(): boolean { try { return localStorage.getItem(KEEP_PREF) === '1'; } catch { return false; } }
function setShowKeep(on: boolean) { try { localStorage.setItem(KEEP_PREF, on ? '1' : '0'); } catch { /* storage blocked */ } }

/** Buy amount for every repeatable purchase: 1, 10 or as many as you can afford. Remembered on the device. */
type BuyAmt = 1 | 10 | 'max';
let buyAmt: BuyAmt = (() => { try { const v = localStorage.getItem('zombie-idle-buy'); return v === '10' ? 10 : v === 'max' ? 'max' : 1; } catch { return 1; } })();
/** The quick rail always buys one level at a time (its prices are drawn, and its taps run, with this on). */
let railSingle = false;
const amtN = () => (railSingle ? 1 : buyAmt === 'max' ? 1000 : buyAmt);
/** How many of a repeated purchase you'd get right now (up to the selected amount) and their total ln cost.
 * `costAt(i)` is the ln cost of the i-th extra one, or null when you can't buy more. */
function preview(colour: StrainId, costAt: (i: number) => number | null): { n: number; ln: number } {
  const have = game.dna(colour);
  let ln = -Infinity, n = 0;
  for (let i = 0; i < amtN(); i++) {
    const c = costAt(i);
    if (c === null) break;
    const t = M.logAdd(ln, c);
    if (t > have + 1e-9) break;
    ln = t; n++;
  }
  if (!n) { const c = costAt(0); return { n: 0, ln: c ?? Infinity }; }
  return { n, ln };
}
/** Price tag for a preview: "×12 · 🧪 3.4M" when buying more than one. */
const amtCost = (col: StrainId, p: { n: number; ln: number }) => `${p.n > 1 ? `<i class="amt">×${p.n}</i>` : ''}${cost(col, p.ln)}`;
const tierPrev = (z: M.ZombieId) => { const x = game.s.strains[z], cap = M.tierCapOf(z); return preview(M.familyOf(z), (i) => (x.tier + i >= cap ? null : x.tier + i < x.maxTier ? -Infinity : M.lnTierCost(z, x.maxTier + (x.tier + i - x.maxTier)))); };
/** At the tier cap with nothing left to raise (the next form is the way up). */
const atCap = (z: M.ZombieId) => { const x = game.s.strains[z]; return x.tier >= M.tierCapOf(z); };
const spawnPrev = (z: M.ZombieId) => { const x = game.s.strains[z]; return preview(M.familyOf(z), (i) => (x.spawn + i < C.spawnMax ? M.lnSpawnCost(z, x.spawn + i, x.maxTier) : null)); };
const hirePrev = (c: ClassId) => { const u = game.unit(c); return preview(game.hireColour(c), (i) => (u.count + i < game.unitCap ? M.lnHireCost(c, u.count + i, game.fx) : null)); };
const nodePrev = (c: ClassId, id: UnitNodeId) => {
  const ns = game.node(c, id);
  return preview(ns.colour, (i) => (ns.locked || M.unitNodeMaxed(ns.def, ns.level + i) ? null : M.lnUnitNodeCost(c, ns.def, ns.level + i, game.fx)));
};
/** A unit's upgrade row: six buttons in tree order. Ability (I→II→III) and Gear slots (Attachment→Charm) are
 * progressive buttons that buy their next stage. Each shows icon, name, level and the price for the buy amount. */
type UpBtn = { key: string; name: string; icon: string; stages: UnitNodeId[] };
const UP_BUTTONS: UpBtn[] = [
  { key: 'crit', name: 'Crit', icon: 'crit', stages: ['crit'] },
  { key: 'critx', name: 'Crit ×', icon: 'critdmg', stages: ['critx'] },
  { key: 'spd', name: 'Speed', icon: 'spd', stages: ['spd'] },
  { key: 'range', name: 'Range', icon: 'range', stages: ['range'] },
  { key: 'slots', name: 'Gear', icon: 'slot-mod', stages: ['attach', 'charm'] },
  { key: 'ab', name: 'Ability', icon: '', stages: ['ab1', 'ab2', 'ab3'] },
];
/** Preview of a progressive button: how many stages you'd buy now (up to the buy amount) and their total price. */
function stagePrev(c: ClassId, stages: UnitNodeId[]) {
  const open = stages.filter((id) => !game.node(c, id).maxed);
  if (!open.length) return { n: 0, ln: Infinity, colour: game.node(c, stages[stages.length - 1]).colour, first: stages[stages.length - 1] };
  const first = open[0], colour = game.node(c, first).colour;
  const p = preview(colour, (i) => { const id = open[i]; if (!id) return null; const ns = game.node(c, id); return ns.colour !== colour || (i === 0 && ns.locked) ? null : ns.lnCost; });
  return { ...p, colour, first };
}
/** Hire and Damage as ordinary buttons, the same size as the upgrades. */
function hireBtn(c: ClassId) {
  const u = game.unit(c), cap = game.unitCap, col = game.hireColour(c);
  if (u.count >= cap) return `<button class="mu maxed" disabled><img class="px ic" src="${classIcon(c)}" alt=""><span>Hire</span><span class="lv">${u.count}/${cap}</span><span class="pc">${cap >= C.maxPerType ? '✓ Full' : 'Barracks'}</span></button>`;
  const p = hirePrev(c);
  return `<button class="mu hirebtn ${p.n > 0 ? 'afford' : ''}" style="--dna:${M.strainById(col).color}" data-action="hire" data-cls="${c}" ${costAttr(col, p.ln)} title="Hire ${p.n > 1 ? p.n + ' soldiers' : 'a soldier'}">
    <img class="px ic" src="${classIcon(c)}" alt=""><span>Hire</span><span class="lv">${u.count}/${cap}</span><span class="pc">${p.n > 1 ? `×${p.n} ` : ''}${vial(col)}${fmtLn(p.ln)}</span></button>`;
}
function damageBtn(c: ClassId) {
  const u = game.unit(c), ns = game.node(c, 'dmg'), p = nodePrev(c, 'dmg');
  return `<button class="mu ${p.n > 0 ? 'afford' : ''}" style="--dna:${M.strainById(ns.colour).color}" data-action="buy-node" data-cls="${c}" data-arg="dmg" ${costAttr(ns.colour, p.ln)} title="${esc(`${nodeEffect(u, 'dmg', ns.level)} → ${nodeEffect(u, 'dmg', ns.level + 1)}`)}">
    <img class="px ic" src="${nodeIcon('dmg')}" alt=""><span>Damage</span><span class="lv">Lv ${ns.level}</span><span class="pc">${p.n > 1 ? `×${p.n} ` : ''}${vial(ns.colour)}${fmtLn(p.ln)}</span></button>`;
}
/** The gear shelf: what the unit carries (always its best items; display only). */
function gearShelf(c: ClassId) {
  const u = game.unit(c);
  const shelf = (kind: 'gun' | 'attach' | 'charm', label: string) => {
    const open = kind === 'gun' || M.nlv(u, kind);
    if (!open) return `<div class="sh locked"><span class="ico">🔒</span><div><b>${label}</b><span>unlock with Gear</span></div></div>`;
    const it = kind === 'gun' ? game.gun(u.gun) : game.gearItem(u[kind]);
    if (!it) return `<div class="sh empty"><span class="ico">–</span><div><b>${label}</b><span>none yet</span></div></div>`;
    const icon = kind === 'gun' ? gunIcon(c, u.evo) : (it as Gear).kind === 'attach' ? modIcon((it as M.Attachment).stat) : charmIcon((it as M.Charm).bane);
    const txt = kind === 'gun' ? `×${fmtLn(M.lnGunPower(it as Gun))} dmg` : gearDesc(it as Gear);
    return `<div class="sh" style="--rar:${RARITY_COLOR[it.rarity]}" title="${esc(kind === 'gun' ? gunName(it as Gun) : gearName(it as Gear))}"><img class="px" src="${icon}" alt=""><div><b>${label}</b><span>${esc(txt)}</span></div></div>`;
  };
  return `<div class="shelf">${shelf('gun', 'Gun')}${shelf('attach', 'Attachment')}${shelf('charm', 'Charm')}</div>`;
}
function upgradeRow(c: ClassId) {
  const u = game.unit(c), cd = M.classById(c);
  return `<div class="ugrid pairs">${hireBtn(c)}${damageBtn(c)}${UP_BUTTONS.map((b) => {
    const multi = b.stages.length > 1;
    const owned = b.stages.filter((id) => game.node(c, id).maxed).length;
    const sp = multi ? stagePrev(c, b.stages) : null;
    const id = multi ? sp!.first : b.stages[0];
    const ns = game.node(c, id);
    const p = multi ? sp! : nodePrev(c, id);
    const done = multi ? owned === b.stages.length : ns.maxed;
    const lv = multi ? `${owned}/${b.stages.length}` : `${ns.level}/${ns.def.max}`;
    const state = done ? 'maxed' : ns.locked ? 'locked' : p.n > 0 ? 'afford' : '';
    const price = done ? '✓ Max' : ns.locked ? '🔒' : `${p.n > 1 ? `×${p.n} ` : ''}${vial(ns.colour)}${fmtLn(p.ln)}`;
    const icon = b.key === 'ab' ? classIcon(c) : nodeIcon(b.icon);
    // the Ability button names what it buys ("Slow 15%", "Frag +2"); once maxed, what you have
    const name = b.key === 'ab' ? cd.ability.tags[done ? 2 : Math.min(2, owned + Math.max(1, p.n) - 1)] : b.name;
    const what = b.key === 'ab' ? `${cd.ability.name}: ${done ? cd.ability.stages[2] : `next: ${cd.ability.stages[owned]}`}`
      : b.key === 'slots' ? (done ? 'Attachment and Charm slots open' : owned ? 'Next: open the Charm slot' : 'Next: open the Attachment slot')
      : `${nodeEffect(u, id, ns.level)}${done ? '' : ` → ${nodeEffect(u, id, ns.level + 1)}`}`;
    const tip = ns.locked && !done ? `${what} · ${ns.locked}` : what;
    return `<button class="mu ${state}" style="--dna:${M.strainById(ns.colour).color}" title="${esc(tip)}" ${done || ns.locked ? 'disabled' : `data-action="${multi ? 'buy-stages' : 'buy-node'}" data-cls="${c}" data-arg="${multi ? b.key : id}" ${costAttr(ns.colour, p.ln)}`}>
      <img class="px ic" src="${icon}" alt=""><span>${name}</span><span class="lv">${lv}</span><span class="pc">${price}</span></button>`;
  }).join('')}</div>`;
}

/** The pinned bar at the top of the Zombies / Squad / unit-tree pages: optional keep-up meter + buy amount. */
function topBar() {
  return `<div class="topbar">${keepCardHtml(game.keepUp())}<div class="buyamt"><span class="sub small">Buy</span><div class="seg2">${
    ([1, 10, 'max'] as BuyAmt[]).map((a) => `<button class="${buyAmt === a ? 'on' : ''}" data-action="buy-amt" data-arg="${a}">${a === 'max' ? 'Max' : `×${a}`}</button>`).join('')}</div></div></div>`;
}

/** The battle's phase ('stream', 'intro', 'horde', 'end'), so the Hordes tab knows when a horde is running. */
let battlePhase = 'stream';
const hordeRunning = () => battlePhase === 'intro' || battlePhase === 'horde';

/** The open menu, or null when the full-screen zombie map is showing. */
let tab: Tab | null = null;
const TITLES: Record<Tab, string> = { zombies: 'Zombies', squad: 'Squad', tree: 'Passive Tree', hordes: 'Hordes', ranks: 'Leaderboard' };
/** The Leaderboard tab's current ranking. */
let rankSort = (() => { try { const v = localStorage.getItem('zombie-idle-rank-sort') ?? 'best_horde'; return v.startsWith('t_h') ? 'speed' : v; } catch { return 'best_horde'; } })();

let unitNode: UnitNodeId = 'dmg';
/** Which tree the Tree tab shows: the global passive web or one unit type's own tree. */
let treeView: 'global' | ClassId = 'global';
/** Global tree layout: an easy list (default) or the pan/zoom web. Remembered on the device. */
/** The passive-tree region that's open (one at a time); -1 = all closed, null = pick one with something ready. */
let treeOpen: number | null = null;
let lastPointer = 0;
let pointerDown = 0;
let softTimer = 0;

// ---------- init ----------
export function initUI() {
  document.addEventListener('click', onClick);
  // volume sliders: applied live while dragging (no redraw, so the drag isn't interrupted)
  document.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement;
    if (!el.dataset?.vol) return;
    sfx.setVolume(el.dataset.vol as 'music' | 'sfx', Number(el.value));
    const out = el.parentElement?.querySelector('output'); if (out) out.textContent = el.value === '0' ? 'Off' : `${el.value}%`;
    el.style.setProperty('--v', `${el.value}%`);
  });
  document.addEventListener('change', (e) => { const el = e.target as HTMLInputElement; if (el.dataset?.vol === 'sfx') sfx.buy(); });   // a sample at the new level
  document.addEventListener('pointerdown', (e) => { lastPointer = performance.now(); pointerDown++; if (railPick && !(e.target as Element).closest?.('#zrail')) { railPick = null; railRender(); } if (urailPick && !(e.target as Element).closest?.('#zrail')) { urailPick = null; urailRender(); } }, { passive: true, capture: true });
  const release = () => { lastPointer = performance.now(); pointerDown = Math.max(0, pointerDown - 1); };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  game.on((evt, data) => {
    if (evt === 'loot') toastLoot(data as Loot, 'Found:');
    if (evt === 'horde-won') {
      // pause and show a card for each unlock, after the VICTORY banner has had a moment
      const d = data as { k: number; loot: Loot }, l = d.loot;
      const reward = l.type === 'gun' ? { title: gunName(l.gun), sub: `Tier ${fmtInt(l.gun.ilvl)} · for ${M.classById(l.gun.cls).plural}`, icon: crateIcon(l.gun.rarity), color: RARITY_COLOR[l.gun.rarity] }
        : { title: gearName(l.gear), sub: gearDesc(l.gear), icon: crateIcon(l.gear.rarity), color: RARITY_COLOR[l.gear.rarity] };
      showCards(hordeCards(d.k, reward), 1500);
    }
    if (evt === 'stuck') offerRollBack();
    if (evt === 'horde-lost') toast('<b>The horde was too strong</b><span>Upgrade your units and try again.</span>', '#ff6b6b');
    // every evolution gets its full-screen scene (new colours get their card with the horde's; a unit's scene is already up)
    if (evt === 'release' && !M.COLOUR_HORDE[data as M.ZombieId]) { closeModal(); playEvolution({ kind: 'release', id: data as M.ZombieId }); }
    if (evt === 'zombie-ult') { closeModal(); playEvolution({ kind: 'zult', id: data as M.ZombieId }); }
    if (evt === 'phase') battlePhase = data as string;
    if (evt === 'horde-start') battlePhase = 'intro';
    if (['change', 'reset', 'hire', 'allocate', 'release', 'horde-won', 'horde-lost', 'phase', 'horde-start', 'unit-evolve', 'zombie-ult'].includes(evt)) soft();
  });
  render();
  refresh();
  setInterval(refresh, 300);
  setInterval(tickNudge, 500);
  setInterval(tickCombo, 100);
  setInterval(() => { const blocked = !!tab || overlayUp() || coachUp() || titleUp() || hordeRunning() || !$('#modal').hidden || evoUp(); maybeCommanderScene(blocked); maybeSoundtrackScene(blocked || overlayUp()); }, 1000);
  seedBests();
  setInterval(() => void syncBoard(), 60_000);
  // the Ranks page keeps itself fresh while it's open (who's playing now, new scores)
  setInterval(() => { if (tab === 'ranks' && !document.hidden) void syncBoard(false, rankSort).then(() => { if (tab === 'ranks') soft(); }); }, 30_000);
  setInterval(forceEvolutions, 1000);
  offerCrashReport();
  // Skip animations: cards and evolution scenes become notices
  const strip = (h: string) => h.split('<br>')[0].replace(/<[^>]+>/g, '');
  setCardNotice((cards) => toast(`<b>${esc(cards[0].eyebrow)}${cards[0].title === 'Victory!' ? '' : `: ${esc(cards[0].title)}`}</b><span>${[strip(cards[0].body), ...cards.slice(1).map((c) => `${c.eyebrow}: ${c.title}`)].map(esc).join(' · ')}</span>`, cards[0].color, cards[0].icon, 6000));
  setEvoNotice((title, sub, color, icon) => toast(`<b>${esc(title)}</b><span>${esc(sub)}</span>`, color, icon, 5000));
  window.setTimeout(() => void syncBoard(true), 4000);
  setInterval(() => { if (!titleUp() && !overlayUp() && !coachUp() && !document.hidden && game.autoBuyTick()) { soft(); } autoChip(); }, 1000);
  fpsMeter();
}

// ---------- FPS counter (Settings → FPS counter): frames drawn in the last half second, and the slowest one ----------
let fpsRaf = 0;
function fpsMeter() {
  let el = document.getElementById('fps');
  if (!showFps()) { cancelAnimationFrame(fpsRaf); fpsRaf = 0; el?.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'fps'; el.setAttribute('aria-hidden', 'true'); ($('#field') ?? document.body).appendChild(el); }
  if (fpsRaf) return;
  let last = performance.now(), t0 = last, frames = 0, worst = 0;
  const tick = (now: number) => {
    frames++; worst = Math.max(worst, now - last); last = now;
    if (now - t0 >= 500) {
      const f = (frames * 1000) / (now - t0);
      el!.className = f >= 50 ? 'good' : f >= 30 ? 'warn' : 'bad';
      el!.innerHTML = `<b>${Math.round(f)}</b> FPS <span>· ${worst.toFixed(0)} ms max</span>`;
      t0 = now; frames = 0; worst = 0;
    }
    fpsRaf = requestAnimationFrame(tick);
  };
  fpsRaf = requestAnimationFrame(tick);
}

// ---------- prompts: "new recruits ready" and "a horde is ready" (so nobody has to dig through the menus) ----------
let nudgeKey = '';
const nudgeOff = new Map<string, number>();   // dismissed prompt → when it may come back
function tickNudge() {
  const el = document.getElementById('nudge');
  if (!el) return;
  const quiet = !!tab || overlayUp() || coachUp() || titleUp() || hordeRunning() || !($('#modal') as HTMLElement).hidden;
  let key = '', html = '';
  if (!quiet) {
    const off = (k: string) => (nudgeOff.get(k) ?? 0) > performance.now();
    let ult: M.ClassDef | undefined, zu: M.ZombieId | undefined;
    const fresh = M.CLASSES.find((c) => game.classUnlocked(c.id) && game.unit(c.id).count === 0 && game.canHire(c.id) && !off(`hire-${c.id}`));
    if (fresh) {
      key = `hire-${fresh.id}`;
      const col = M.strainById(fresh.primary).color;
      html = `<div class="nd-card" style="--c:${col}"><img class="px nd-ic" src="${classIcon(fresh.id)}" alt="">
        <div class="nd-t"><b>${esc(fresh.plural)}</b><span>Ready to hire</span></div>
        <button class="btn nd-go" data-action="nudge-hire" data-cls="${fresh.id}">Hire ${cost(fresh.primary, game.hireCost(fresh.id))}</button>
        <button class="nd-x" data-action="nudge-x" data-arg="${key}" aria-label="Dismiss">✕</button></div>`;
    } else if ((zu = M.ZOMBIE_IDS.find((z) => game.canZombieUlt(z) && !off(`zult-${z}`)))) {
      const st = M.strainById(zu);
      key = `zult-${zu}`;
      html = `<div class="nd-card ult" style="--c:${st.color}"><img class="px nd-ic" src="${zombieIcon(zu)}" alt="">
        <div class="nd-t"><b>${esc(st.plural)}</b><span>Ultimate form ready</span></div>
        <button class="btn nd-go" data-action="zombie-ult" data-strain="${zu}">Evolve ${cost(st.family, game.zombieUltCost(zu))}</button>
        <button class="nd-x" data-action="nudge-x" data-arg="${key}" aria-label="Dismiss">✕</button></div>`;
    } else if ((ult = M.CLASSES.find((c) => game.canEvolveUnit(c.id) && !off(`ult-${c.id}`)))) {
      key = `ult-${ult.id}`;
      html = `<div class="nd-card ult" style="--c:#c88aff"><img class="px nd-ic" src="${classIcon(ult.id)}" alt="">
        <div class="nd-t"><b>${esc(ult.plural)}</b><span>Ultimate form ready</span></div>
        <button class="btn nd-go" data-action="ult-open" data-cls="${ult.id}">Evolve</button>
        <button class="nd-x" data-action="nudge-x" data-arg="${key}" aria-label="Dismiss">✕</button></div>`;
    } else if (battlePhase === 'stream' && !game.autoHorde && game.hordeOdds() >= C.hordeWinOdds && !off(`horde-${game.nextHorde}`)) {
      const h = M.hordeDef(game.nextHorde), bd = M.BOSSES[h.boss];
      key = `horde-${h.index}`;
      html = `<div class="nd-card horde" style="--c:#ff5a4a"><img class="px nd-ic" src="${zombieIcon(bd.look)}" alt="">
        <div class="nd-t"><b>${h.elite ? 'Elite horde' : `Horde ${h.index}`} ready</b><span>Should win · Boss: ${esc(bd.name)}</span></div>
        <button class="btn nd-go" data-action="nudge-horde" aria-label="Start the horde">Fight!</button>
        <button class="nd-x" data-action="nudge-x" data-arg="${key}" aria-label="Dismiss">✕</button></div>`;
    }
  }
  if (key === nudgeKey) return;
  nudgeKey = key;
  if (!key) { el.classList.remove('in'); window.setTimeout(() => { if (!nudgeKey) el.hidden = true; }, 220); return; }
  el.innerHTML = html; el.hidden = false; void el.offsetWidth; el.classList.add('in');
  sfx.nextCard();
}

/** The combo meter over the battlefield (hidden while a menu covers the map or the combo is small). */
let lastCombo = 0;
function tickCombo() {
  const el = $('#combo');
  const top = game.topCombo, n = top.n, max = C.combo.max;
  el.hidden = !!tab || n < 5;
  if (el.hidden) { lastCombo = n; return; }
  const face = $('#combo-face') as HTMLImageElement;
  if (top.id && face.dataset.id !== top.id) { face.dataset.id = top.id; face.src = zombieIcon(top.id); face.alt = M.strainById(top.id).plural; }
  $('#combo-n').textContent = fmtInt(n);
  $('#combo-x').textContent = `×${game.comboMult.toFixed(2)} DNA`;
  $('#combo-bar').style.width = `${Math.min(100, (n / max) * 100)}%`;
  el.classList.toggle('max', n >= max);
  if (Math.floor(n / 250) > Math.floor(lastCombo / 250)) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  lastCombo = n;
}

/** Re-render soon, but never while a finger is down (iOS drops taps on replaced nodes). */
// a menu that's still gliding after a swipe (iOS momentum) isn't redrawn under the finger
let lastScroll = 0;
document.addEventListener('scroll', (e) => { if ((e.target as Element)?.closest?.('#tab-body') || e.target === document.getElementById('tab-body')) lastScroll = performance.now(); }, true);
function soft() {
  if (softTimer) return;
  softTimer = window.setTimeout(function again() {
    if (pointerDown > 0 || performance.now() - lastPointer < 450 || performance.now() - lastScroll < 600) { softTimer = window.setTimeout(again, 300); return; }
    softTimer = 0;
    render();
  }, 120);
}

// ---------- clicks ----------
type ActionData = { action: string; arg?: string; n?: string; cls?: string; strain?: string; slot?: string };
function onClick(e: Event) {
  const el = (e.target as Element).closest<HTMLElement | SVGElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  railSingle = !!el.closest('#zrail');
  log('tap', `${el.dataset.action}${el.dataset.arg ? ` ${el.dataset.arg}` : ''}${el.dataset.cls ? ` ${el.dataset.cls}` : ''}${el.dataset.strain ? ` ${el.dataset.strain}` : ''}`);
  try { act({ ...el.dataset } as ActionData); } finally { railSingle = false; }
}
/** Run one UI action. Returns true if it bought something. */
function act(d: ActionData): boolean {
  const a = d.action, arg = d.arg ?? '', n = Number(d.n ?? 0);
  const cls = d.cls as ClassId, sid = d.strain as StrainId;
  const spent = M.STRAIN_IDS.reduce((x, c) => x + Math.exp(Math.min(700, game.dna(c))), 0);
  const tier0 = sid ? game.s.strains[sid]?.tier : 0;
  switch (a) {
    case 'tab':
      // tapping the open tab collapses the menu to the map; tapping another opens it
      tab = tab === arg ? null : (arg as Tab);
      if (tab === 'ranks') void syncBoard(false, rankSort).then(() => { if (tab === 'ranks') soft(); });
      if (tab === 'squad') game.markSeen();
      render();
      break;
    case 'close': tab = null; render(); break;
    case 'rail': railOpen = !railOpen; railPick = urailPick = null; try { localStorage.setItem('zombie-idle-rail', railOpen ? '1' : '0'); } catch { /* ignore */ } railRender(); break;
    case 'rail-pick': railPick = railPick === arg ? null : (arg as M.ZombieId); railRender(); break;
    case 'rail-mode': railMode = arg === 'u' ? 'u' : 'z'; railPick = urailPick = null; try { localStorage.setItem('zombie-idle-rail-mode', railMode); } catch { /* ignore */ } railRender(); break;
    case 'urail-pick': urailPick = urailPick === arg ? null : (arg as ClassId); urailRender(); break;
    case 'buy-amt': buyAmt = arg === 'max' ? 'max' : (Number(arg) as 1 | 10); try { localStorage.setItem('zombie-idle-buy', String(buyAmt)); } catch { /* ignore */ } render(); break;
    case 'tier-up': for (let i = 0, t = -1; i < amtN() && t !== game.s.strains[sid].tier; i++) { t = game.s.strains[sid].tier; game.raiseTier(sid); } break;
    case 'spawn': for (let i = 0, t = -1; i < amtN() && t !== game.s.strains[sid].spawn; i++) { t = game.s.strains[sid].spawn; game.buySpawn(sid); } break;
    case 'release': game.release(sid); break;
    case 'zombie-ult': game.zombieUlt(sid); break;
    case 'global': game.buyGlobal(arg as M.ColourId, 1); break;
    case 'scavenger': game.buyScavenger(); break;
    case 'rank-sort': rankSort = arg; try { localStorage.setItem('zombie-idle-rank-sort', arg); } catch { /* ignore */ } render(); void syncBoard(false, arg).then(() => { if (tab === 'ranks' && rankSort === arg) soft(); }); break;
    case 'rename': if (canRename()) { closeModal(); commanderScene(true); } break;
    case 'auto-pref': { const k = arg as 'zombies' | 'units' | 'globals' | 'tree'; if (!game.autoOpen(k)) break; const cfg = game.autoCfg; cfg[k] = !cfg[k]; game.save(); autoChip(); if (!$('#modal').hidden) openSettings();
      break; }
    case 'region': { const r = Number(arg); treeOpen = treeOpen === r ? -1 : r; render(); break; }
    case 'treeview': treeView = arg as 'global' | ClassId; if (treeView !== 'global') unitNode = 'dmg'; render(); break;
    case 'unode': unitNode = arg as UnitNodeId; render(); break;
    case 'buy-node': game.buyNode(cls, arg as UnitNodeId, n || amtN()); break;
    case 'buy-stages': {
      const b = UP_BUTTONS.find((x) => x.key === arg)!;
      for (let i = 0; i < amtN(); i++) {
        const id = b.stages.find((x) => !game.node(cls, x).maxed);
        if (!id || !game.node(cls, id).canAfford) break;
        game.buyNode(cls, id, 1);
      }
      break;
    }
    case 'unlock-unit': game.hire(cls); break;
    case 'hire': for (let i = 0, t = -1; i < amtN() && t !== game.unit(cls).count; i++) { t = game.unit(cls).count; game.hire(cls); } break;
    case 'allocate': { const had = game.s.alloc.length; game.allocate(arg); if (game.s.alloc.length > had) { const n = treeNode(arg); treeFresh = arg; toast(`<b>${esc(n.size === 'small' ? n.desc : n.name)}</b><span>${esc(n.size === 'small' ? REGIONS[n.region].name : n.desc)}</span>`, REGIONS[n.region].color);
      if (regionComplete(game.s.alloc, n.region)) { const r = REGIONS[n.region], m = MASTERY[n.region]; showCards([{ eyebrow: `${r.name} mastered`, title: m.name, color: '#ffd34d', icon: vialIcon(r.dna), body: `All 10 passives taken. Mastery perk: <b>${esc(m.desc)}</b>.` }]); } } break; }
    case 'horde': game.startHorde(); tab = null; render(); break;
    case 'nudge-hire': game.hire(cls); tickNudge(); break;
    case 'nudge-horde': game.startHorde(); tickNudge(); break;
    case 'nudge-x': nudgeOff.set(arg, arg.startsWith('horde') ? performance.now() + 120000 : Infinity); tickNudge(); break;
    case 'prestige': closeModal(); openPrestige(); break;
    case 'perk': game.buyPerk(arg as M.PerkId); openPrestige(); break;
    case 'prestige-go': if (!game.canPrestige) break; closeModal(); picks = {}; openPicker(); break;
    case 'pick': { const d = M.perkById(arg as M.PerkId), lv = M.plv(game.s.prestige, d.id) + (picks[d.id] ?? 0); if (lv < d.max && pickPoints() >= d.cost) picks[d.id] = (picks[d.id] ?? 0) + 1; openPicker(); break; }
    case 'pick-undo': picks = {}; openPicker(); break;
    case 'pick-minus': { const n = picks[arg as M.PerkId] ?? 0; if (n > 1) picks[arg as M.PerkId] = n - 1; else delete picks[arg as M.PerkId]; openPicker(); break; }
    case 'prestige-yes': { const gain = game.prestigeGain, n = Object.values(picks).reduce((a, b) => a + (b ?? 0), 0); slotWrite('backup', game.exportSave()); closeModal(); game.prestige(picks); picks = {}; tab = null; render();
      toast(`<b>Prestige! Run ${game.s.prestige.runs + 1}</b><span>+${gain} point${gain === 1 ? '' : 's'}${n ? ` · ${n} perk level${n === 1 ? '' : 's'} taken` : ''}${game.s.prestige.points ? ` · ${game.s.prestige.points} saved for later` : ''}</span>`, '#ffd34d'); break; }
    case 'toggle': game.s.autoHordeOn = !game.s.autoHordeOn; render(); break;
    case 'settings': openSettings(); break;
    case 'modal-close': closeModal(); break;
    case 'ult-open': openUlt(cls); break;
    case 'ult-pick': if (game.evolveUnit(cls, arg === '1' ? 1 : 0)) closeModal(); else openUlt(cls); break;
    case 'export': exportSave(); break;
    case 'saves': openSettings(); break;
    case 'slot-play': playSlot(arg); break;
    case 'slot-load': slotAction('load', arg); break;
    case 'slot-clear': slotAction('clear', arg); break;
    case 'slot-load-yes': { const sl = slotRead(arg); if (sl) loadCode(sl.code, slotName(arg)); break; }
    case 'new-game': newGame(arg); break;
    case 'new-game-check': newGameCheck(arg); break;
    case 'new-game-yes': startNewGame(arg); break;
    case 'slot-clear-yes': try { localStorage.removeItem(slotKey(arg)); } catch { /* ignore */ } openSettings(); break;
    case 'import-load': { const c = pendingImport; if (c) loadCode(c, 'the pasted save'); break; }
    case 'import-slot': { const c = pendingImport; if (!c) break;
      const sum = slotSummary(arg);
      if (sum && !confirm(`${slotName(arg)} already has a save. Replace it?`)) break;
      if (slotWrite(arg, c)) toast(`<b>Saved into ${slotName(arg)}</b><span>Load it from Settings whenever you like</span>`, '#5ee38c'); openSettings(); break; }
    case 'import': importSave(); break;
    case 'report': openReport(); break;
    case 'report-crash': openReport(true); break;
    case 'report-send': void doSendReport(); break;
    case 'report-copy': copyReport(); break;
    case 'reset': confirmBox('Erase all progress?', `You'll start over from the beginning. Your current game (${saveLine(Game.summary(game.s))}) is kept in Backup, so you can restore it from Settings.`, 'Erase progress', 'reset-yes', '', true); break;
    case 'reset-yes': slotWrite('backup', game.exportSave()); closeModal(); game.hardReset(); tab = null; render(); showTitle(); break;   // a fresh game starts at the title screen
    case 'sound': { const on = !(sfx.soundPrefs().sfx || sfx.soundPrefs().music); sfx.setSfx(on); sfx.setMusic(on); refresh(); break; }
    case 'sound-sfx': sfx.setSfx(!sfx.soundPrefs().sfx); openSettings(); break;
    case 'sound-music': sfx.setMusic(!sfx.soundPrefs().music); openSettings(); break;
    case 'soundtrack': sfx.setSoundtrack(arg as sfx.SoundtrackId); if (!sfx.soundPrefs().music) sfx.setMusic(true); openSettings(); break;
    case 'ranges-pref': setShowRanges(!showRanges()); openSettings(); break;
    case 'keep-pref': setShowKeep(!showKeep()); openSettings(); render(); break;
    case 'fps-pref': setShowFps(!showFps()); fpsMeter(); openSettings(); break;
    case 'skip-pref': setSkipAnims(!skipAnims()); openSettings(); break;
  }
  // sound feedback: purchases make a "buy" sound if DNA was actually spent
  const after = M.STRAIN_IDS.reduce((x, c) => x + Math.exp(Math.min(700, game.dna(c))), 0);
  const paid = after < spent || (a === 'tier-up' && game.s.strains[sid].tier > tier0);
  if (a === 'tier-up') sfx.tierUp();
  else if (a === 'allocate') { if (paid) sfx.allocate(); }
  else if (a === 'sell' || a === 'sell-matching') sfx.buy();
  else if (['buy-node', 'buy-stages', 'hire', 'spawn', 'release', 'global', 'scavenger'].includes(a)) { if (paid) sfx.buy(); else sfx.denied(); }
  else if (a.startsWith('equip')) sfx.equip();
  else if (a !== 'horde') sfx.click();
  // the tap is finished, so a re-render the action asked for can happen right now (no waiting)
  if (softTimer) { clearTimeout(softTimer); softTimer = 0; render(); }
  refresh();
  return paid;
}


// ---------- HUD (refreshed in place) ----------
function refresh() {
  const cols = game.shownColours;
  const hud = $('#hud-dna');
  if (hud.dataset.cols !== cols.join(',')) {
    hud.dataset.cols = cols.join(',');
    hud.innerHTML = cols.map((c) => `<span class="dna" data-dna="${c}" title="${M.strainById(c).dna} DNA">${vial(c)}<b>0</b></span>`).join('');
  }
  for (const el of hud.querySelectorAll<HTMLElement>('[data-dna]')) el.querySelector('b')!.textContent = fmtLn(game.dna(el.dataset.dna as StrainId));
  const k = game.keepUp();
  const pill = $('#hud-keep');
  pill.hidden = !showKeep();
  pill.className = `keep-pill ${k >= 1.1 ? 'ok' : k >= 0.9 ? 'warn' : 'bad'}`;
  // the multiplier, colour-coded; with room to spare, a mini bar and the word too
  const word = k >= 1.1 ? 'keeping up' : k >= 0.9 ? 'barely' : 'overrun';
  const html = `<i class="kp-bar"><em style="width:${Math.min(100, (k / 2) * 100).toFixed(0)}%"></em></i><span class="kp-word">${word}</span><b class="kp-x">${fmtMult(k)}</b>`;
  if (pill.dataset.h !== html) { pill.dataset.h = html; pill.innerHTML = html; }
  pill.title = `Squad keeps up with ${fmtMult(k)} of the zombies arriving (${word})`;
  for (const b of document.querySelectorAll<HTMLElement>('#tabs [data-action="tab"]')) {
    b.classList.toggle('active', b.dataset.arg === tab);
    const badge = b.dataset.arg === 'tree' ? game.allocatableCount() > 0
      : b.dataset.arg === 'squad' ? game.keyUpgradeAffordable
      : b.dataset.arg === 'zombies' ? game.canReleaseAny
      : b.dataset.arg === 'hordes' ? (showKeep() && game.hordeOdds() >= C.hordeWinOdds) || M.PERKS.some((d) => M.plv(game.s.prestige, d.id) < d.max && game.s.prestige.points >= d.cost) : false;
    b.classList.toggle('badge', badge);
  }
  for (const b of document.querySelectorAll<HTMLElement>('#zrail [data-action="rail-pick"]')) b.classList.toggle('can', railCan(b.dataset.arg as M.ZombieId));
  for (const b of document.querySelectorAll<HTMLElement>('#zrail [data-action="urail-pick"]')) b.classList.toggle('can', urailCan(b.dataset.arg as ClassId));
  // keep buttons live as DNA comes in: enable + highlight the moment one becomes affordable (or stops being), and
  // redraw so ×10 / Max previews catch up
  let flipped = false;
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-cost]')) {
    const ok = game.canAfford(el.dataset.col as StrainId, Number(el.dataset.cost));
    el.disabled = !ok;
    if ((el.classList.contains('mu') || el.classList.contains('evolve') || el.classList.contains('evolve-big') || el.classList.contains('gl-buy')) && el.classList.contains('afford') !== ok) { el.classList.toggle('afford', ok); flipped = true; }
  }
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-action="scavenger"]')) { const ok = game.canBuyScavenger(); el.disabled = !ok; el.classList.toggle('afford', ok); }
  // recruit cards: grow the progress bar, and switch to the Unlock button once it's affordable
  for (const bar of document.querySelectorAll<HTMLElement>('.rc-bar[data-need]')) {
    const col = bar.dataset.col as StrainId, need = Number(bar.dataset.need), have = game.dna(col);
    const pct = Number.isFinite(have) ? Math.min(100, Math.exp(have - need) * 100) : 0;
    bar.querySelector<HTMLElement>('i')!.style.width = `${pct}%`;
    const btn = bar.nextElementSibling as HTMLElement | null;
    if (btn && game.s.strains[col].unlocked) btn.firstChild!.textContent = `${Math.floor(pct)}% of the way`;
    if (game.s.strains[col].unlocked && game.canAfford(col, need)) flipped = true;
  }
  if (flipped) soft();
  const kc = document.querySelector<HTMLElement>('.keep.slim');
  if (kc) kc.outerHTML = keepCardHtml(k);
}

function render() {
  autoChip();
  const panel = $('#panel');
  document.getElementById('app')!.classList.toggle('menu-open', !!tab);
  panel.hidden = !tab;
  railRender();
  if (!tab) { refresh(); return; }
  const body = $('#tab-body');
  const key = `${tab}:${tab === 'tree' ? treeView : ''}`;
  const same = body.dataset.key === key;
  const scroll = same ? body.scrollTop : 0;
  // sideways-scrolling rows (the leaderboard's chips) keep their place too, or every redraw would snap them back
  const HSCROLL = '.lbp-sorts';
  const side = same ? [...body.querySelectorAll<HTMLElement>(HSCROLL)].map((e) => e.scrollLeft) : [];
  body.dataset.key = key;
  $('#panel-title').textContent = TITLES[tab];
  body.className = '';
  body.innerHTML = tab === 'zombies' ? zombiesHtml() : tab === 'squad' ? squadHtml() : tab === 'tree' ? treeTabHtml() : tab === 'ranks' ? leaderboardPageHtml(rankSort) : hordesHtml();
  body.scrollTop = scroll;
  body.querySelectorAll<HTMLElement>(HSCROLL).forEach((e, i) => { if (side[i]) e.scrollLeft = side[i]; });
  refresh();
}

// ---------- quick rail (right edge of the map): zombie types OR unit types, swapped with a two-way switch ----------
let railOpen = (() => { try { return localStorage.getItem('zombie-idle-rail') !== '0'; } catch { return true; } })();
let railMode: 'z' | 'u' = (() => { try { return localStorage.getItem('zombie-idle-rail-mode') === 'u' ? 'u' : 'z'; } catch { return 'z'; } })();
let railPick: M.ZombieId | null = null;
let urailPick: ClassId | null = null;
/** Can you afford either of this zombie type's upgrades right now (a free tier counts)? */
function railCan(id: M.ZombieId) {
  const x = game.s.strains[id], col = M.familyOf(id);
  if (x.tier < x.maxTier) return true;
  if (game.canZombieUlt(id)) return true;
  return (x.maxTier < M.tierCapOf(id) && game.canAfford(col, M.lnTierCost(id, x.maxTier))) || (x.spawn < C.spawnMax && game.canAfford(col, M.lnSpawnCost(id, x.spawn, x.maxTier)));
}
/** The next form this type can evolve into right now (at the tier cap, not yet released), if any. */
function nextForm(id: M.ZombieId) { const st = M.strainById(id); const fam = M.familyMembers(st.family); const nx = fam[M.stageOf(id) + 1]; return nx && !game.s.strains[nx.id].unlocked && game.releaseReady(nx.id) ? nx : null; }
const UNIT_NODES_ALL: UnitNodeId[] = ['dmg', 'spd', 'range', 'crit', 'critx', 'ab1', 'ab2', 'ab3', 'attach', 'charm'];
/** Can you hire one more of this unit type, or afford any of its upgrades? */
function urailCan(c: ClassId) {
  if (game.canHire(c)) return true;
  return game.unit(c).count > 0 && UNIT_NODES_ALL.some((id) => { const n = game.node(c, id); return !n.maxed && !n.locked && n.canAfford; });
}
const railZombies = () => M.COLOURS.flatMap((c) => M.familyMembers(c)).filter((st) => game.s.strains[st.id].unlocked);   // grouped by colour
const railUnits = () => M.CLASSES.filter((c) => game.classUnlocked(c.id));
const CHEV = (d: string) => `<svg viewBox="0 0 24 24" class="i"><path d="${d}"/></svg>`;
function urailRender() { railRender(); }
function railRender() {
  const el = document.getElementById('zrail');
  if (!el) return;
  const zs = railZombies(), us = railUnits();
  el.hidden = !!tab || zs.length + us.length === 0;
  if (el.hidden) { railPick = urailPick = null; return; }
  if (railPick && !game.s.strains[railPick]?.unlocked) railPick = null;
  const list = el.querySelector<HTMLElement>('.zr-list'), scroll = list?.dataset.mode === railMode ? list.scrollTop : 0;
  el.className = railOpen ? 'open' : '';
  const zCan = zs.some((st) => railCan(st.id)), uCan = us.some((c) => urailCan(c.id));
  const collapse = `<button class="zr-toggle" data-action="rail" aria-label="${railOpen ? 'Hide' : 'Show'} quick upgrades" aria-expanded="${railOpen}">
    ${railOpen ? CHEV('M9 5l7 7-7 7') : `${CHEV('M15 5l-7 7 7 7')}<img class="px" src="${railMode === 'u' ? classIcon('pistol') : zombieIcon('shambler')}" alt="">${zCan || uCan ? '<i class="zr-dot"></i>' : ''}`}</button>`;
  if (!railOpen) { el.innerHTML = `<div class="zr-top">${collapse}</div>`; return; }
  const seg = `<div class="zr-seg" role="tablist" aria-label="Quick upgrades">
    <button class="${railMode === 'z' ? 'on' : ''}" data-action="rail-mode" data-arg="z" role="tab" aria-selected="${railMode === 'z'}" aria-label="Zombies"><img class="px" src="${zombieIcon('shambler')}" alt="">${zCan && railMode !== 'z' ? '<i class="zr-dot"></i>' : ''}</button>
    <button class="${railMode === 'u' ? 'on' : ''}" data-action="rail-mode" data-arg="u" role="tab" aria-selected="${railMode === 'u'}" aria-label="Units"><img class="px" src="${classIcon('pistol')}" alt="">${uCan && railMode !== 'u' ? '<i class="zr-dot"></i>' : ''}</button></div>`;
  let icons = '', pop = '';
  railSingle = true;   // pop-over buttons show (and buy) a single level
  if (railMode === 'z') {
    icons = zs.map((st) => `<button class="zr-z ${railCan(st.id) ? 'can' : ''} ${railPick === st.id ? 'on' : ''} ${nextForm(st.id) || M.zombieUltReady(game.s.strains[st.id]) ? 'evo' : ''}" data-action="rail-pick" data-arg="${st.id}" style="--dna:${st.color}" aria-label="${esc(st.plural)}, tier ${game.s.strains[st.id].tier}">
      <img class="px" src="${zombieIcon(st.id)}" alt=""><span>${fmtInt(game.s.strains[st.id].tier)}</span>${nextForm(st.id) || M.zombieUltReady(game.s.strains[st.id]) ? biohazard('zr-bio') : ''}${game.s.strains[st.id].ult ? '<i class="zr-crown" aria-label="ultimate form">★</i>' : ''}</button>`).join('');
    if (railPick) {
      const st = M.strainById(railPick), x = game.s.strains[railPick], col = st.family, free = x.tier < x.maxTier;
      const tp = tierPrev(st.id), sp = spawnPrev(st.id);
      pop = `<div class="zr-pop" style="--dna:${st.color}">
        <div class="zr-head"><img class="px" src="${zombieIcon(st.id)}" alt=""><div><b>${esc(st.plural)}</b></div>
          <span class="zr-rate" title="DNA per second from ${esc(st.plural)}">${vial(col)}+${fmtLn(Math.log(M.spawnRate(st.id, x.spawn) * Math.min(1, game.keepUp())) + M.lnStrainDna(st.id, x, game.fx))}<i>/s</i></span></div>
        <div class="s-btns">
          ${atCap(st.id) ? `<button class="btn sbtn ghost" disabled><span>DNA <b class="lvl">${fmtInt(x.tier)}/${M.TIER_CAP}</b></span><span class="cost">max</span></button>` : `<button class="btn sbtn" data-action="tier-up" data-strain="${st.id}" ${free ? '' : costAttr(col, tp.ln)}><span>DNA <b class="lvl">${fmtInt(x.tier)}${M.isLastForm(st.id) ? '' : `/${M.TIER_CAP}`}</b></span>${free ? '<span class="cost">free</span>' : amtCost(col, tp)}</button>`}
          ${x.spawn < C.spawnMax ? `<button class="btn sbtn" data-action="spawn" data-strain="${st.id}" ${costAttr(col, sp.ln)}><span>Spawn <b class="lvl">${x.spawn}/${C.spawnMax}</b></span>${amtCost(col, sp)}</button>`
            : `<button class="btn sbtn ghost" disabled><span>Spawn <b class="lvl">${C.spawnMax}/${C.spawnMax}</b></span><span class="cost">max</span></button>`}
        </div>${(() => { const nx = nextForm(st.id); if (!nx) return ''; const ln = game.releaseCost(nx.id);
          return `<button class="btn evolve-big ${game.canAfford(col, ln) ? 'afford' : ''}" data-action="release" data-strain="${nx.id}" ${costAttr(col, ln)}>${biohazard('bio')}<span class="ev-t"><b>Evolve → ${esc(nx.plural)}</b><small>A new, richer form joins the stream</small></span>${cost(col, ln)}</button>`; })()}${zUltButton(st.id)}</div>`;
    }
  } else {
    icons = us.map((c) => { const u = game.unit(c.id), col = M.strainById(c.primary).color;
      return `<button class="zr-z ${u.count ? '' : 'new'} ${urailCan(c.id) ? 'can' : ''} ${urailPick === c.id ? 'on' : ''}" data-action="urail-pick" data-arg="${c.id}" style="--dna:${col}" aria-label="${esc(c.plural)}: ${u.count}">
        <img class="px" src="${classIcon(c.id)}" alt=""><span>${u.count ? `×${u.count}` : 'New'}</span>${u.evo !== undefined ? '<i class="zr-crown" aria-label="ultimate form">★</i>' : ''}</button>`; }).join('');
    if (urailPick) {
      const c = M.classById(urailPick), u = game.unit(c.id);
      pop = `<div class="zr-pop u-pop ${u.count ? '' : 'narrow'}" style="--dna:${M.strainById(c.primary).color}">
        <div class="zr-head"><img class="px" src="${classIcon(c.id)}" alt=""><div><b>${esc(c.plural)}</b><span>${u.count ? `${u.count} hired · ${esc(c.gun)}` : `Not hired yet · ${esc(c.gun)}`}</span></div>
          ${u.count ? `<span class="zr-rate dps" title="Damage per second from all your ${esc(c.plural)}"><svg viewBox="0 0 24 24" class="i"><path d="M14.5 3.5l6 6-9 9-6-6zM4 20l3.5-3.5M8 13l3 3"/></svg>${fmtLn(game.stats(u).lnDps + Math.log(M.unitPower(u.count)))}<i>/s</i></span>` : ''}</div>
        ${u.count ? upgradeRow(c.id) + ultButton(c.id) : `<div class="ugrid">${hireBtn(c.id)}</div>`}</div>`;
    }
  }
  railSingle = false;
  el.innerHTML = `<div class="zr-top">${collapse}${seg}</div><div class="zr-list" data-mode="${railMode}">${icons || '<span class="zr-empty">None yet</span>'}</div>${pop}`;
  const nl = el.querySelector<HTMLElement>('.zr-list')!;
  nl.scrollTop = scroll;
  nl.dataset.st = String(nl.scrollTop);
  // line the popover up with the tapped icon (kept inside the rail)
  const p = el.querySelector<HTMLElement>('.zr-pop'), on = el.querySelector<HTMLElement>('.zr-z.on');
  if (p && on) {
    const top = on.offsetTop - nl.scrollTop + nl.offsetTop + on.offsetHeight / 2 - p.offsetHeight / 2;
    p.style.top = `${Math.max(nl.offsetTop, Math.min(el.clientHeight - p.offsetHeight, top))}px`;   // never over the header
  }
}
nlScrollHook();
// Scrolling the rail closes an open pop-over, but only a real scroll by the player: re-rendering the rail restores its
// scroll position, which fires a scroll event of its own (that used to close the pop-over the moment it opened).
function nlScrollHook() {
  document.addEventListener('scroll', (e) => {
    const el = e.target as HTMLElement;
    if (!el?.classList?.contains('zr-list')) return;
    if (Math.abs(el.scrollTop - Number(el.dataset.st ?? 0)) < 8) return;
    el.dataset.st = String(el.scrollTop);
    if (railPick) { railPick = null; railRender(); }
    if (urailPick) { urailPick = null; urailRender(); }
  }, true);
}

// ---------- Zombies tab: one card per zombie type ----------
/** The keep-up meter, pinned to the top of the Zombies menu while you scroll (refresh() keeps it live). */
function keepCardHtml(k: number) {
  if (!showKeep()) return '';
  const cls = k >= 1.1 ? 'ok' : k >= 0.9 ? 'warn' : 'bad';
  return `<div class="keep slim ${cls}" title="${fmtNum(game.totalSpawnRate)} zombies/s arriving · the squad can handle ${fmtMult(k)} of that">
    <b>${k >= 1.1 ? 'Keeping up' : k >= 0.9 ? 'Barely' : 'Overrun'}</b>
    <div class="meter"><i style="width:${Math.min(100, (k / 2) * 100)}%"></i><span class="mark"></span></div>
    <span class="keep-x">${fmtMult(k)}</span>
  </div>`;
}
/** "· 12% Feral · 3% Alpha" once tougher varieties show up for a type. */
function varietyText(tier: number) {
  const m = M.varietyMix(tier);
  return `${m.feral > 0 ? ` · <span class="feral">${Math.round(m.feral * 100)}% Feral</span>` : ''}${m.alpha > 0 ? ` · <span class="alpha">${Math.round(m.alpha * 100)}% Alpha</span>` : ''}`;
}
function zombiesHtml() {
  const k = game.keepUp();
  const rates = game.lnDnaPerSec();
  const f = Math.min(1, k);
  const word = (k: number) => !showKeep() ? '' : (k >= 1.1 ? '<i class="good">keeps up</i>' : k >= 0.9 ? '<i class="warn">barely</i>' : '<i class="bad">overrun</i>');
  const traits = (st: M.StrainDef) => `${M.stageOf(st.id) ? `Form ${M.stageOf(st.id) + 1} · tier 1 = tier ${M.TIER_CAP * M.stageOf(st.id) + 1} power` : `${st.hp}× HP · ${M.dnaPerKillMult(st.id).toFixed(1).replace(/\.0$/, '')}× DNA per kill`}${st.speed > 1.2 ? ' · fast' : st.speed < 0.8 ? ' · slow' : ''}`;
  const row = (st: M.StrainDef) => {
    const x = game.s.strains[st.id], col = st.family;
    if (!x.unlocked) {
      const u = st.unlock!;
      const fromOpen = game.releaseReady(st.id), pc = M.familyOf(u.from), ln = game.releaseCost(st.id);
      const from = M.strainById(u.from), fx = game.s.strains[u.from];
      return `<div class="srow locked" style="--dna:${st.color}">
        <img class="px face" src="${zombieIcon(st.id)}" alt="">
        <div class="s-info"><b>${st.plural}</b><span class="sub">${traits(st)}</span></div>
        <div class="s-btns">${M.COLOUR_HORDE[st.id] ? `<span class="sub small lockmsg">🔒 Beat Horde ${M.COLOUR_HORDE[st.id]}</span>`
          : fromOpen ? `<button class="btn sbtn evolve ${game.canAfford(pc, ln) ? 'afford' : ''}" data-action="release" data-strain="${st.id}" ${costAttr(pc, ln)}>${biohazard('bio')}<span>Evolve</span>${cost(pc, ln)}</button>`
          : `<span class="sub small lockmsg">🔒 ${fx.unlocked ? `${from.plural} to tier ${M.TIER_CAP} (now ${fx.maxTier})` : `Evolve ${from.plural} first`}</span>`}</div>
      </div>`;
    }
    const kT = game.keepUpIf(st.id, 'tier'), kS = game.keepUpIf(st.id, 'spawn');
    const free = x.tier < x.maxTier;
    const tp = tierPrev(st.id), sp = spawnPrev(st.id);
    const lnRate = Math.log(M.spawnRate(st.id, x.spawn) * f) + M.lnStrainDna(st.id, x, game.fx);
    return `<div class="srow" style="--dna:${st.color}">
      <img class="px face" src="${zombieIcon(st.id)}" alt="">
      <div class="s-info"><b>${st.plural}${x.ult ? ' <span class="z-ult-tag">Ultimate</span>' : ''}</b>
        <span class="sub">${vial(col)} +${fmtLn(lnRate)}/s · ${fmtLn(M.lnStrainHp(st.id, x))} HP</span>
        <span class="sub small">Tier ${fmtInt(x.tier)}${free ? `/${fmtInt(x.maxTier)}` : ''}${M.isLastForm(st.id) ? '' : ` of ${M.TIER_CAP}`} · Spawn ${x.spawn}/${C.spawnMax} (${fmtNum(M.spawnRate(st.id, x.spawn))}/s)${varietyText(x.tier)}</span></div>
      <div class="s-btns">
        ${atCap(st.id) ? '<button class="btn sbtn ghost" disabled title="Top tier: evolve to the next form"><span>DNA</span><span class="cost">max</span></button>'
          : `<button class="btn sbtn" data-action="tier-up" data-strain="${st.id}" ${free ? '' : costAttr(col, tp.ln)} title="Next tier: ×${C.R} DNA and ×${C.R} HP"><span>DNA +</span>${free ? '<span class="cost">free</span>' : amtCost(col, tp)}${word(kT)}</button>`}
        ${x.spawn < C.spawnMax ? `<button class="btn sbtn" data-action="spawn" data-strain="${st.id}" ${costAttr(col, sp.ln)} title="+12% ${st.plural}, each level +3% HP"><span>Spawn +</span>${amtCost(col, sp)}${word(kS)}</button>`
          : '<button class="btn sbtn ghost" disabled><span>Spawn</span><span class="cost">max</span></button>'}
      </div>${zUltButton(st.id)}
    </div>`;
  };
  const families = M.COLOURS.map((c) => {
    const members = M.familyMembers(c);
    const open = members.filter((m) => game.s.strains[m.id].unlocked);
    const next = members.find((m) => !game.s.strains[m.id].unlocked);
    const hidden = members.length - open.length - (next ? 1 : 0);
    const head = M.strainById(c);
    return `<div class="family" style="--dna:${head.color}">
      <div class="fam-head">${vial(c)}<b>${head.dna} DNA</b><span class="sub small">${open.length}/${members.length} types${open.length ? ` · +${fmtLn(rates[c])}/s` : ''}</span></div>
      <div class="srows">${open.map(row).join('')}${next ? row(next) : ''}</div>
      ${hidden > 0 ? `<p class="sub small more">+${hidden} more ${head.dna.toLowerCase()} zombie type${hidden > 1 ? 's' : ''} to discover</p>` : ''}
    </div>`;
  }).join('');
  return `
  ${topBar()}
  <p class="sub">Zombies come in five DNA colours, five types each. Raise a type's <b>DNA</b> or <b>Spawn</b> to earn more of its colour; it also makes those zombies tougher. At tier ${M.TIER_CAP} a type can <b>evolve</b> into its colour's next form. New colours join after Hordes 1–4.</p>
  ${families}
  <h3>Feral and Alpha zombies</h3>
  <p class="sub small">As you raise a type's DNA Count, tougher versions join its stream: <span class="feral">Feral</span> (from tier 20, ×${M.VARIETIES[1].hp} HP and DNA, up to ${Math.round(0.35 * 100)}%) and <span class="alpha">Alpha</span> (from tier 60, ×${M.VARIETIES[2].hp} HP and DNA, up to 15%).</p>
  <h3>Special zombies</h3>
  <p class="sub small">About ${Math.round(M.SPECIAL_CHANCE * 100)}% of zombies in the stream are special. They glow in their colour.</p>
  <div class="specials">${M.SPECIALS.map((sp) => `<div class="sp"><i style="--c:#${sp.tint.toString(16).padStart(6, '0')}"></i><b>${sp.name}</b><span class="sub small">${sp.desc}</span></div>`).join('')}</div>
  <p class="sub small">DNA + raises that type's tier: ×${C.R} DNA and ×${C.R} HP. Spawn + brings 12% more of them, each level +3% HP. ${showKeep() ? 'The word under each price is how your squad would cope after buying.' : 'Watch the shredder: when it flashes red, zombies are getting through (shredded zombies pay much less DNA).'}</p>`;
}

// ---------- Squad tab: overview of unit types, plus the item stash ----------
function abilityPips(u: Unit) { const k = M.abilityStage(u); return `<span class="pips">${[1, 2, 3].map((i) => `<i class="${i <= k ? 'on' : ''}"></i>`).join('')}</span>`; }
/** A unit type you haven't hired yet: what it brings, and one big Unlock button (or how close you are). */
function recruitPanel(c: M.ClassDef) {
  const col = game.hireColour(c.id), ln = game.hireCost(c.id);
  const released = game.s.strains[col].unlocked;
  const ready = released && game.canAfford(col, ln);
  const have = game.dna(col);
  const pct = Number.isFinite(have) ? Math.max(0, Math.min(100, Math.exp(have - ln) * 100)) : 0;
  const vs = Object.entries(M.MATCH[c.id] ?? {}).filter(([, m]) => (m as number) > 1).map(([z]) => M.strainById(z as M.StrainId).dna);
  return `<div class="rc-panel ${ready ? 'rc-ready' : ''}">
    <div class="rc-facts"><span class="rc-tag">${c.ability.tags[0]} → ${c.ability.tags[2].replace(/^[A-Za-z]+ /, '')}</span>${vs.length ? `<span class="rc-vs">Strong vs ${vs.join(', ')}</span>` : ''}</div>
    ${ready ? '' : `<div class="rc-bar" data-col="${col}" data-need="${ln}"><i style="width:${pct}%"></i></div>`}
    <button class="btn rc-btn ${ready ? '' : 'wait'}" ${ready ? `data-action="unlock-unit" data-cls="${c.id}" ${costAttr(col, ln)}` : 'disabled'}>
      ${ready ? `UNLOCK ${c.plural.toUpperCase()}` : released ? `${Math.floor(pct)}% of the way` : `Needs ${M.strainById(col).dna} DNA`}<span class="rc-price">${vial(col)}${fmtLn(ln)}</span></button>
  </div>`;
}
function squadHtml() {
  const s = game.s;
  const cards = M.CLASSES.map((c) => {
    const u = game.unit(c.id);
    const open = game.classUnlocked(c.id);
    if (!open) return `<div class="ucard locked"><img class="px portrait" src="${classIcon(c.id)}" alt=""><div class="u-main"><b>${c.plural}</b><span class="sub">${c.gun} · 🔒 Beat Horde ${c.horde} to unlock</span></div></div>`;
    const ab = M.abilityStage(u);
    return `<div class="ucard" style="--c1:${M.strainById(c.primary).color};--c2:${M.strainById(c.secondary).color}" title="${c.ability.name}: ${esc(ab ? c.ability.stages[ab - 1] : 'not unlocked yet')}">
      <img class="px portrait" src="${classIcon(c.id)}" alt="">
      <div class="u-main"><b>${c.plural}${u.evo !== undefined ? ' <span class="z-ult-tag">Ultimate</span>' : ''}</b><span class="count">×${u.count}<small>/${game.unitCap}</small></span>
        <span class="sub">${u.count ? `Lv ${M.nlv(u, 'dmg')} · ${fmtLn(game.unitDps(u))} DPS` : `${c.gun} · not hired yet`}</span></div>
      ${u.count ? `${upgradeRow(c.id)}${ultButton(c.id, true)}${gearShelf(c.id)}` : recruitPanel(c)}
    </div>`;
  }).join('');
  return `${topBar()}<p class="sub">Hire and upgrade each unit right on its card; Ability and Gear slots unlock stage by stage. Up to <b>${game.unitCap}</b> of each type for now (${C.maxPerType} max; barracks grow every ${C.tiersPerUnit} tiers).</p>
  <div class="grid2">${cards}</div>
  <p class="sub small">Every unit always carries its best gear, and extra drops are sold for DNA automatically.</p>`;
}


// ---------- ultimate forms ----------
/** A zombie type's ultimate-form button (tier 50, spawn maxed, not yet taken). */
function zUltButton(id: M.ZombieId) {
  const x = game.s.strains[id];
  if (!M.zombieUltReady(x)) return '';
  const col = M.familyOf(id), ln = game.zombieUltCost(id);
  return `<button class="btn evolve-big ult zult ${game.canAfford(col, ln) ? 'afford' : ''}" data-action="zombie-ult" data-strain="${id}" ${costAttr(col, ln)}>${biohazard('bio')}<span class="ev-t"><b>Ultimate form</b><small>×${C.zUltDna} DNA per kill · ×${C.zUltHp} HP</small></span>${cost(col, ln)}</button>`;
}
/** The unit card's ultimate-form slot: progress toward it, the Evolve button, or the form it took. */
function ultButton(c: ClassId, progress = false) {
  const u = game.unit(c);
  if (u.evo !== undefined) {
    const d = M.ULTS[c][u.evo];
    return `<div class="ult-badge" style="--uc:${d.color}"><img class="px" src="${gunIcon(c, u.evo)}" alt=""><span><b>${esc(d.name)}</b><small>${esc(d.gun)} · ultimate form · ×${C.ultDps} DPS</small></span></div>`;
  }
  if (!M.ultReady(u)) {
    if (!progress) return '';
    const done = M.ULT_NODES.filter((id) => game.node(c, id).maxed).length;
    return `<div class="ult-prog" title="Max every upgrade except Damage to unlock a choice of two ultimate forms"><i style="width:${(done / M.ULT_NODES.length) * 100}%"></i><span>Ultimate form: ${done}/${M.ULT_NODES.length} upgrades maxed</span></div>`;
  }
  const ln = game.ultCost(c), col = M.classById(c).primary;
  return `<button class="btn evolve-big ult ${game.canAfford(col, ln) ? 'afford' : ''}" data-action="ult-open" data-cls="${c}" ${costAttr(col, ln)}>${biohazard('bio')}<span class="ev-t"><b>Ultimate form</b><small>Choose 1 of 2 · ×${C.ultDps} DPS</small></span>${cost(col, ln)}</button>`;
}
function ultTraits(f: M.UltFx) {
  const t: string[] = [];
  if (f.targets) t.push(`+${f.targets} ${f.hit === 'pierce' ? 'pierced' : f.hit === 'splash' ? 'in the blast' : f.hit === 'chain' ? 'chained' : 'hit at once'}`);
  if (f.knock) t.push('Knockback');
  if (f.knockMult !== undefined) t.push('Lighter push');
  if (f.burn) t.push(`Sets on fire${f.vuln ? ` · +${Math.round(f.vuln * 100)}% damage taken` : ''}`);
  if (f.slow) t.push(`${Math.round(f.slow * 100)}% slow`);
  return t;
}
/** Evolutions are mandatory: once one is ready and affordable it happens (zombies) or its scene opens (recruits, who must
 * pick a track). Waits for the title screen, tutorial tips, other pop-ups, open dialogs and a running horde. */
function forceEvolutions() {
  if (titleUp() || overlayUp() || coachUp() || hordeRunning() || !$('#modal').hidden || document.hidden || evoUp()) return;
  for (const c of M.CLASSES) if (game.canEvolveUnit(c.id)) { closeModal(); playEvolution({ kind: 'unit', cls: c.id }); return; }
  for (const z of M.ZOMBIE_IDS) {
    if (game.canZombieUlt(z)) { game.zombieUlt(z); return; }
    if (game.canRelease(z)) { game.release(z); return; }
  }
}
function openUlt(c: ClassId) {
  const cd = M.classById(c), u = game.unit(c);
  if (u.evo !== undefined || !M.ultReady(u)) return;
  if (game.canEvolveUnit(c)) { closeModal(); playEvolution({ kind: 'unit', cls: c }); return; }   // affordable: straight to the scene
  const ln = game.ultCost(c), col = cd.primary, ok = game.canAfford(col, ln);
  const cards = M.ULTS[c].map((d, i) => `<div class="ult-card" style="--uc:${d.color}">
      <div class="ult-art"><img class="px" src="${gunIcon(c, i as 0 | 1)}" alt=""></div>
      <span class="ult-tag">${esc(d.tag)}</span><b class="ult-name">${esc(d.name)}</b><small class="ult-gun">${esc(d.gun)}</small>
      <p>${esc(d.desc)}</p>
      <ul class="ult-stats"><li><span>DPS</span><b>×${C.ultDps}</b></li><li><span>Fire rate</span><b>${fmtMult(d.fx.rate)}</b></li><li><span>Per shot</span><b>${fmtMult(C.ultDps / d.fx.rate)}</b></li>
        ${ultTraits(d.fx).map((x) => `<li class="tr">${esc(x)}</li>`).join('')}</ul>
      <button class="btn ult-go ${ok ? 'afford' : ''}" data-action="ult-pick" data-cls="${c}" data-arg="${i}" ${ok ? '' : 'disabled'}>Evolve ${cost(col, ln)}</button></div>`).join('');
  openModal(`<div class="set-head"><h3>${esc(cd.plural)}: ultimate form</h3><button class="xbtn" data-action="modal-close" aria-label="Close">✕</button></div>
    <p class="sub">Every upgrade except Damage is maxed. Choose one track; the choice is permanent. Both double DPS but play very differently.${ok ? '' : ` <b class="bad">Needs ${fmtLn(ln)} ${esc(M.strainById(col).dna)} DNA.</b>`}</p>
    <div class="ult-pick">${cards}</div>`);
}

// ---------- a unit type's own screen ----------
const UNODE_ICON: Record<UnitNodeId, string> = { dmg: 'dmg', spd: 'spd', range: 'range', crit: 'crit', critx: 'critdmg', attach: 'slot-mod', charm: 'slot-charm', ab1: '', ab2: '', ab3: '' };
function nodeEffect(u: Unit, id: UnitNodeId, lv: number): string {
  const c = M.classById(u.cls);
  switch (id) {
    case 'dmg': return `${fmtMult(Math.pow(C.dmgPerLevel, lv))} damage`;
    case 'spd': return `+${lv * 4}% attack speed`;
    case 'range': return `+${lv * 2}% range`;
    case 'crit': return `+${lv * 2}% crit chance`;
    case 'critx': return `+${lv * 10}% crit damage`;
    case 'attach': return lv ? 'Attachment slot open' : 'Opens an attachment slot';
    case 'charm': return lv ? 'Charm slot open' : 'Opens a charm slot';
    default: { const i = Number(id.slice(2)) - 1; return c.ability.stages[i]; }
  }
}

// ---------- Tree tab: sub-tabs for the global passive web and every unit type's own tree ----------
function treeTabHtml() {
  treeView = 'global';
  return treeChecklistHtml();
}

// ---------- Passive tree: one checklist per region (3 steps, two paths side by side, then the keystone goal) ----------
const STEP_PREV: Record<string, string[]> = { s1: [], s2: ['s1'], n1: ['s2'], a1: ['n1'], a2: ['a1'], na: ['a2'], b1: ['n1'], b2: ['b1'], nb: ['b2'], k: ['na', 'nb'] };
const STEP_IDS = Object.keys(STEP_PREV);
let treeFresh = '';   // the passive just taken (pops in)
function treeStep(ri: number, k: string, num: number, first = false) {
  const id = `r${ri}.${k}`, n = treeNode(id);
  const has = game.s.alloc.includes(id), can = game.canAllocate(id);
  const col = game.treeColour(id), ln = game.treeCost(id);
  const kind = n.size === 'notable' ? 'notable' : n.size === 'keystone' ? 'key' : '';
  const state = has ? 'owned' : can ? 'avail' : 'locked';
  const act = has ? '<span class="tc-own">✓ Owned</span>'
    : can ? `<button class="tc-buy" data-action="allocate" data-arg="${id}" ${costAttr(col, ln)}>${vial(col)}${fmtLn(ln)}</button>`
    : !game.s.strains[col].unlocked && game.regionOpen(n.region) && (k === 's1' || STEP_PREV[k].some((p) => game.s.alloc.includes(`r${ri}.${p}`))) ? `<span class="tc-hint">release ${M.strainById(col).plural} first</span>`
    : `<span class="tc-hint">${k === 'k' ? 'after 6 in either path' : `after step ${num - 1}`}</span>`;
  return `<div class="tc-step ${state} ${kind} ${first ? 'first' : ''} ${treeFresh === id ? 'just' : ''}"><div class="tc-mark">${has ? '✓' : num}</div>
    <div class="tc-txt"><b>${esc(n.size === 'small' ? n.desc : n.name)}</b>${n.size === 'small' ? '' : `<span>${esc(n.desc)}</span>`}</div><div class="tc-act">${act}</div></div>`;
}
function treeRing(got: number, color: string) {
  const r = 17, L = 2 * Math.PI * r;
  return `<span class="tc-ringwrap"><span class="tc-count">${got}/10</span><svg class="tc-ring" viewBox="0 0 42 42"><circle cx="21" cy="21" r="${r}" fill="none" stroke="#2c333d" stroke-width="4"/><circle cx="21" cy="21" r="${r}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${(got / 10) * L} ${L}" transform="rotate(-90 21 21)"/></svg></span>`;
}
function treeChecklistHtml() {
  const ready = (ri: number) => STEP_IDS.filter((k) => game.canAffordNode(`r${ri}.${k}`)).length;
  const avail = (ri: number) => STEP_IDS.filter((k) => game.canAllocate(`r${ri}.${k}`)).length;
  if (treeOpen === null) { const i = REGIONS.findIndex((_, ri) => ready(ri) > 0); treeOpen = i >= 0 ? i : REGIONS.findIndex((_, ri) => avail(ri) > 0); }
  const totalReady = REGIONS.reduce((a, _, ri) => a + ready(ri), 0);
  const regions = REGIONS.map((reg, ri) => {
    const got = STEP_IDS.filter((k) => game.s.alloc.includes(`r${ri}.${k}`)).length, key = treeNode(`r${ri}.k`);
    const colour = M.strainById(reg.dna);
    if (!game.regionOpen(ri)) return `<div class="tc-region locked" style="--rc:${reg.color}"><div class="tc-head">${treeRing(got, reg.color)}<div><b>${reg.name}</b><span class="tc-sub">🔒 Beat Horde ${reg.horde} to open · paid in ${colour.dna}</span></div><span></span></div><p class="tc-lockinfo">Goal: <b>${esc(key.name)}</b>: ${esc(key.desc)}</p></div>`;
    const open = treeOpen === ri, rd = ready(ri), av = avail(ri);
    const released = game.s.strains[reg.dna].unlocked;
    const sub = got === 10 ? 'Complete' : !released ? `Paid in ${colour.dna} · <span class="tc-need">release ${colour.plural} first</span>` : rd ? `<span class="tc-ready">${rd} ready to take</span> · paid in ${colour.dna}` : av ? `${av} next · paid in ${colour.dna}` : `Paid in ${colour.dna}`;
    return `<div class="tc-region ${open ? 'open' : ''}" style="--rc:${reg.color}">
      <button class="tc-head" data-action="region" data-arg="${ri}" aria-expanded="${open}">${treeRing(got, reg.color)}<div><b>${reg.name}${got === 10 ? ' <span class="tm-star" title="Mastered">★</span>' : ''}</b><span class="tc-sub">${got === 10 ? `Mastered: ${esc(MASTERY[ri].name)}` : sub}</span></div><span class="tc-chev">▶</span></button>
      ${open ? `<div class="tc-goal"><i></i><div>Goal: <em>${esc(key.name)}</em>. ${esc(key.desc)}</div></div>
      <div class="tc-mastery ${got === 10 ? 'on' : ''}"><span class="tm-badge">${got === 10 ? '✓ Mastery' : 'Mastery'}</span><div><b>${esc(MASTERY[ri].name)}</b><span>${esc(MASTERY[ri].desc)}${got === 10 ? '' : ' · complete all 10 passives'}</span></div></div>
      <div class="tc-body">${treeStep(ri, 's1', 1, true)}${treeStep(ri, 's2', 2)}${treeStep(ri, 'n1', 3)}
        <div class="tc-forkhead"><span>Path A</span><span>Path B</span></div>
        <div class="tc-fork"><div class="tc-col">${['a1', 'a2', 'na'].map((k, i) => treeStep(ri, k, 4 + i, i === 0)).join('')}</div><div class="tc-col">${['b1', 'b2', 'nb'].map((k, i) => treeStep(ri, k, 4 + i, i === 0)).join('')}</div></div>
        ${treeStep(ri, 'k', 7)}</div>` : ''}
    </div>`;
  }).join('');
  treeFresh = '';
  return `${globalsHtml()}<div class="tc-summary"><span><b>${game.s.alloc.length}</b> passives${totalReady ? ` · <span class="tc-ready">${totalReady} ready</span>` : ''}</span><span>Each region has its own prices: every passive taken there makes its next one ×${C.treeCostGrowth}</span></div>
  <div class="tc-list">${regions}</div>`;
}

// ---------- Global upgrades: one endless squad-wide upgrade per DNA colour ----------
function globalsHtml() {
  const rows = M.COLOURS.map((c) => {
    const d = M.GLOBALS[c], st = M.strainById(c), lv = game.globalLevel(c), open = M.globalOpen(game.s.strains, c);
    const maxed = game.globalMaxed(c), ln = game.globalCost(c);
    const act = !open ? `<span class="gl-lock">🔒 ${game.s.strains[c].unlocked ? `${esc(st.plural)} to tier ${M.TIER_CAP}` : `unlock ${esc(st.plural)}`}</span>`
      : maxed ? '<span class="gl-lock">✓ Max</span>'
      : `<button class="btn gl-buy ${game.canAfford(c, ln) ? 'afford' : ''}" data-action="global" data-arg="${c}" ${costAttr(c, ln)}>${vial(c)}${fmtLn(ln)}</button>`;
    return `<div class="gl-row ${open ? '' : 'locked'}" style="--dna:${st.color}"><img class="px" src="${vialIcon(c)}" alt="">
      <div class="gl-t"><b>${esc(d.name)} <small>Lv ${lv}${d.max ? `/${d.max}` : ''}</small></b><span>${lv ? esc(d.desc(lv)) : 'none yet'}${maxed || !open ? '' : ` → ${esc(d.desc(lv + 1))}`}</span></div>${act}</div>`;
  }).join('');
  const sl = game.scavengerLevel(), sOpen = M.scavengerOpen(game.s.strains), sCan = game.canBuyScavenger();
  const scav = `<div class="gl-row scav ${sOpen ? '' : 'locked'}" style="--dna:#ffd34d"><img class="px" src="${crateIcon('legendary')}" alt="">
      <div class="gl-t"><b>${M.SCAVENGER.name} <small>Lv ${sl}</small></b><span>${sl ? esc(M.SCAVENGER.desc(sl)) : 'none yet'}${sOpen ? ` → ${esc(M.SCAVENGER.desc(sl + 1))}` : ''}</span>
      ${sOpen ? `<span class="scav-cost">${M.COLOURS.map((c) => `<i class="${game.canAfford(c, M.lnScavengerCost(c, sl)) ? '' : 'short'}">${vial(c)}${fmtLn(M.lnScavengerCost(c, sl))}</i>`).join('')}</span>` : ''}</div>
      ${sOpen ? `<button class="btn gl-buy ${sCan ? 'afford' : ''}" data-action="scavenger" ${sCan ? '' : 'disabled'}>Buy</button>` : '<span class="gl-lock">🔒 all five colours to tier 50</span>'}</div>`;
  return `<div class="gl-card"><div class="gl-head"><b>Global upgrades</b><span>Endless, squad-wide, one per DNA colour. Opens when that colour's first zombie type reaches tier ${M.TIER_CAP}; each level costs ×${C.globalCostGrowth} more.</span></div>${rows}${scav}</div>`;
}

// ---------- Hordes tab ----------
function warDrumsHtml() {
  if (!game.fx.autoHorde) return `<p class="sub small">Tip: the <b>War Drums</b> passive (Basic Training, Passive Tree) starts hordes for you when your squad should win.</p>`;
  const odds = game.hordeOdds(), need = game.autoHordeNeeds;
  const status = hordeRunning() ? `<span class="good">Fighting Horde ${game.nextHorde} now…</span>` : !game.s.autoHordeOn ? 'Off.'
    : odds >= need ? `<span class="good">Starting Horde ${game.nextHorde} within a few seconds…</span>`
    : showKeep() ? `Waiting: Horde ${game.nextHorde} starts by itself at ${fmtMult(need)} odds (now ${fmtMult(odds)})${game.hordeFailOdds ? ', a bit higher than when it was last lost' : ''}.`
    : `Waiting: Horde ${game.nextHorde} starts by itself once your squad should win${game.hordeFailOdds ? ' (a bit stronger than when it was last lost)' : ''}.`;
  return `<div class="card drums"><label class="switch"><input type="checkbox" data-action="toggle" ${game.s.autoHordeOn ? 'checked' : ''}> <b>War Drums</b>: start the next horde automatically when your squad should win</label><p class="sub small">${status}</p></div>`;
}
// ---------- prestige ----------
function prestigeCard() {
  const p = game.s.prestige, gain = game.prestigeGain;
  return `<div class="card pcard"><div class="pc-head"><b>Prestige</b><span class="pc-pts">◆ ${p.points} point${p.points === 1 ? '' : 's'}</span></div>
    <p class="sub small">${p.runs ? `Run ${p.runs + 1} · ${p.earned} points earned in total. ` : ''}Reset your run for <b>1 point per horde cleared</b>, then spend points on permanent perks that stack every time.</p>
    <div class="row"><button class="btn grow" data-action="prestige">Perks</button><button class="btn ghost grow" data-action="prestige-go" ${game.canPrestige ? '' : 'disabled'}>${game.canPrestige ? `Prestige now · +${gain}` : `Beat Horde ${Game.PRESTIGE_HORDES} first (${game.s.hordes}/${Game.PRESTIGE_HORDES})`}</button></div></div>`;
}
// The prestige screen: pick perks with your unspent points plus this run's points, THEN reset.
let picks: Partial<Record<M.PerkId, number>> = {};
const pickPoints = () => game.s.prestige.points + game.prestigeGain - Object.entries(picks).reduce((a, [id, n]) => a + (n ?? 0) * M.perkById(id as M.PerkId).cost, 0);
function openPicker() {
  const p = game.s.prestige, gain = game.prestigeGain, left = pickPoints(), taken = Object.values(picks).reduce((a, b) => a + (b ?? 0), 0);
  const rows = M.PERKS.map((d) => {
    const base = M.plv(p, d.id), add = picks[d.id] ?? 0, lv = base + add, maxed = lv >= d.max, can = !maxed && left >= d.cost;
    return `<div class="perk ${maxed ? 'maxed' : ''} ${add ? 'picked' : ''}"><img class="px" src="${nodeIcon(d.icon)}" alt=""><div class="pk-main"><b>${d.name} <small>${lv}/${d.max}${add ? ` <i>+${add}</i>` : ''}</small></b>
      <span>${lv ? d.desc(lv) : 'Not taken yet'}${maxed ? '' : `<em> → ${d.desc(lv + 1)}</em>`}</span></div>
      <div class="pk-step"><button class="btn sm ghost pk-minus" data-action="pick-minus" data-arg="${d.id}" ${add ? '' : 'disabled'} aria-label="Remove a point from ${d.name}">−</button>
        ${maxed ? '<span class="pk-max">Max</span>' : `<button class="btn sm ${can ? '' : 'ghost'} pk-plus" data-action="pick" data-arg="${d.id}" ${can ? '' : 'disabled'} aria-label="Add a point to ${d.name}">+ <small>◆${d.cost}</small></button>`}</div></div>`;
  }).join('');
  openModalKeepScroll(`<div class="set-head"><h3>Prestige: choose your perks</h3><button class="xbtn" data-action="modal-close" aria-label="Cancel">✕</button></div>
    <div class="pk-top"><span class="pc-pts big">◆ ${left}</span><span class="sub small">to spend: ${p.points ? `${p.points} saved + ` : ''}${gain} from this run (${game.s.hordes} horde${game.s.hordes === 1 ? '' : 's'})</span></div>
    <p class="sub small">Pick perks first, then reset. Perks are permanent and stack across every run; points you don't spend are kept.</p>
    <div class="perks">${rows}</div>
    <div class="set-sec danger-zone"><h4>Reset</h4>
      <p class="sub small">Zombie tiers and types, units, gear, DNA, the passive tree and hordes reset. You keep your perks, points and play time; this run is copied to the Backup save slot first.</p>
      <div class="row"><button class="btn ghost grow" data-action="modal-close">Cancel</button>${taken ? '<button class="btn ghost" data-action="pick-undo">Undo picks</button>' : ''}<button class="btn danger grow" data-action="prestige-yes">Reset &amp; start run ${p.runs + 2}${taken ? ` · ${taken} perk${taken === 1 ? '' : 's'}` : ''}</button></div></div>`);
}
function openPrestige() {
  const p = game.s.prestige, gain = game.prestigeGain;
  const rows = M.PERKS.map((d) => {
    const lv = M.plv(p, d.id), maxed = lv >= d.max, can = !maxed && p.points >= d.cost;
    return `<div class="perk ${maxed ? 'maxed' : ''}"><img class="px" src="${nodeIcon(d.icon)}" alt=""><div class="pk-main"><b>${d.name} <small>${lv}/${d.max}</small></b>
      <span>${lv ? d.desc(lv) : 'Not taken yet'}${maxed ? '' : `<em> → ${d.desc(lv + 1)}</em>`}</span></div>
      ${maxed ? '<span class="pk-max">Max</span>' : `<button class="btn sm ${can ? '' : 'ghost'}" data-action="perk" data-arg="${d.id}" ${can ? '' : 'disabled'}>◆ ${d.cost}</button>`}</div>`;
  }).join('');
  openModalKeepScroll(`<div class="set-head"><h3>Prestige</h3><button class="xbtn" data-action="modal-close" aria-label="Close">✕</button></div>
    <div class="pk-top"><span class="pc-pts big">◆ ${p.points}</span><span class="sub small">points to spend · ${p.earned} earned over ${p.runs} prestige${p.runs === 1 ? '' : 's'}</span></div>
    <p class="sub small">Perks are permanent and stack across every run.</p>
    <div class="perks">${rows}</div>
    <div class="set-sec danger-zone"><h4>Prestige now</h4>
      <div class="trow static"><div><b>Reset this run for +${gain} point${gain === 1 ? '' : 's'}</b><span>${game.canPrestige ? `${game.s.hordes} horde${game.s.hordes === 1 ? '' : 's'} cleared this run` : `Opens once this run beats Horde ${Game.PRESTIGE_HORDES} (${game.s.hordes}/${Game.PRESTIGE_HORDES} so far)`}</span></div>
      <button class="btn danger sm" data-action="prestige-go" ${game.canPrestige ? '' : 'disabled'}>Prestige</button></div></div>`);
}
/** Lifetime kill counters (kept through prestige). */
/** The auto-buy switches on the map (shown once Horde 10 is beaten): Zombies, Troops, Globals and Tree, each on its own. */
const AUTO_ORDER = ['zombies', 'tree', 'globals', 'units'] as const;
function autoChip() {
  const el = document.getElementById('autobuy');
  if (!el) return;
  const show = game.autoUnlocked && !tab;
  el.hidden = !show;
  if (!show) return;
  const a = game.autoCfg;
  // switches appear one by one as they unlock (Zombies 10, Tree 13, Globals 16, Troops 20)
  const open = AUTO_ORDER.filter((k) => game.autoOpen(k)), sig = open.join(',');
  if (el.dataset.sig !== sig) { el.innerHTML = ''; el.dataset.sig = sig; }
  if (!el.firstElementChild) el.innerHTML = `<span class="ab-l">AUTO</span>${open.map((k) => `<button data-action="auto-pref" data-arg="${k}" aria-pressed="false"><i></i>${{ zombies: 'Zombies', units: 'Troops', globals: 'Globals', tree: 'Tree' }[k]}</button>`).join('')}`;
  for (const b of el.querySelectorAll<HTMLElement>('button')) { const on = !!a[b.dataset.arg as 'zombies' | 'units' | 'globals' | 'tree']; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  el.classList.toggle('any', game.autoAny);
}
function killsHtml() {
  return `<div class="kills"><div><b>${fmtInt(game.s.kills)}</b><span>zombies killed</span></div><div><b>${fmtInt(game.s.headshots ?? 0)}</b><span>headshots</span></div><div><b>${fmtInt(game.s.hordes)}</b><span>hordes beaten</span></div><div><b>${fmtInt(game.s.bestCombo ?? 0)}</b><span>best combo</span></div></div>`;
}
function hordesHtml() {
  const next = game.nextHorde;
  const all = Array.from({ length: Math.max(8, next + 2) }, (_, i) => i + 1).filter((k) => k <= 7 || k <= next + 1);
  const list = [...all.filter((k) => k >= next), ...all.filter((k) => k < next).reverse()];
  return `${killsHtml()}${leaderboardHtml()}${prestigeCard()}<p class="sub">Hordes are optional fights: each has its own style, and ends with a <b>boss</b>. The stream pauses while you fight. You lose if <b>the boss reaches the shredder</b> or <b>${C.breachLimit} horde zombies</b> get to it. Losing costs nothing; winning unlocks a new unit type and tree region.</p>
  ${warDrumsHtml()}
  <div class="grid2">${list.map((k) => {
    const h = M.hordeDef(k);
    const beaten = k < next, isNext = k === next;
    const odds = isNext ? game.hordeOdds() : 0;
    const mix = M.hordeMix(k);
    return `<div class="horde ${beaten ? 'beaten' : isNext ? 'next' : 'locked'}">
      <div class="h-head"><b>${k}. ${esc(h.name)}</b><span class="tier">Tier ${h.tier}</span></div>
      <div class="h-faces">${mix.map((id) => `<img class="px" src="${zombieIcon(id)}" alt="${M.strainById(id).name}">`).join('')}</div>
      <div class="h-kind"><b>${esc(M.HORDE_KINDS[h.kind].name)}</b><span>${esc(M.HORDE_KINDS[h.kind].desc)}</span></div>
      <div class="h-boss"><img class="px" src="${zombieIcon(M.BOSSES[h.boss].look)}" alt="" style="filter: drop-shadow(0 0 4px #${M.BOSSES[h.boss].tint.toString(16).padStart(6, '0')})"><div><b>Boss: ${esc(M.BOSSES[h.boss].name)}</b><span>${esc(M.BOSSES[h.boss].desc)}</span><span class="h-place">Battleground: ${esc(M.BOSSES[h.boss].place)}</span></div></div>
      <p class="sub">Reward: <b>${esc(h.unlocks)}</b>${h.cls ? ` · a rare+ ${M.classById(h.cls).gun}` : ''}</p>
      ${beaten ? '<p class="good">✓ Beaten</p>' : isNext ? `
        ${showKeep() ? `<div class="meter small"><i style="width:${Math.min(100, (odds / 2) * 100)}%"></i><span class="mark"></span></div>
        <p class="sub small">${odds >= C.hordeWinOdds ? '<span class="good">Your squad should win.</span>' : odds >= 0.9 ? '<span class="warn">It will be close.</span>' : `<span class="bad">Too strong: you need ${fmtMult(1 / Math.max(odds, 1e-9))} more firepower.</span>`}</p>` : ''}
        ${odds < 0.5 && h.tier > M.bestTier(game.s.strains) + 10 ? `<p class="h-tip">Your toughest zombies are tier <b>${M.bestTier(game.s.strains)}</b>; this horde is tier <b>${h.tier}</b>. Squad upgrades alone won't close that gap: raise your zombie tiers (Zombies tab, <b>DNA +</b>) to earn much more DNA, then upgrade the squad.</p>` : ''}
        ${hordeRunning() ? `<p class="good">⚔ Horde ${k} in progress… watch the map</p><button class="btn wide call" disabled>In progress</button>` : `<button class="btn wide call" data-action="horde">Start Horde ${k}</button>`}` : '<p class="sub small">🔒 Beat the previous horde first.</p>'}
    </div>`;
  }).join('')}</div>`;
}

function openModal(html: string) { const m = $('#modal'); m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; }
/** Re-open a dialog that's already up (after a tap inside it) without jumping back to its top. */
function openModalKeepScroll(html: string) {
  const m = $('#modal'), was = !m.hidden ? m.querySelector<HTMLElement>('.modal-card')?.scrollTop ?? 0 : 0;
  openModal(html);
  const card = m.querySelector<HTMLElement>('.modal-card'); if (card && was) card.scrollTop = was;
}
let overrunHintAt = 0;
/** The squad has been swamped for a while: point the player at the Shredder (no pop-up, nothing is taken away). */
function offerRollBack() {
  if (performance.now() < overrunHintAt) return;
  overrunHintAt = performance.now() + 120000;
  toast('<b>Overrun!</b><span>Zombies are piling up at the shredder, which pays only a little DNA. Upgrade your squad.</span>', '#ff6767');
}
function openSettings() {
  const snd = sfx.soundPrefs();
  const sw = (action: string, name: string, desc: string, on: boolean) =>
    `<button class="trow" data-action="${action}" role="switch" aria-checked="${on}"><div><b>${name}</b><span>${desc}</span></div><i class="sw ${on ? 'on' : ''}"></i></button>`;
  const m = Game.summary(game.s);
  openModal(`<div class="set-head"><h3>Settings</h3><button class="xbtn" data-action="modal-close" aria-label="Close">✕</button></div>
    <section class="set-sec"><h4>Sound &amp; display</h4>
      ${vol('music', 'Music', snd.music ? snd.musicVol : 0)}
      ${vol('sfx', 'Sound effects', snd.sfx ? snd.sfxVol : 0)}
      ${(() => { const have = sfx.SOUNDTRACKS.filter((t) => t.id === 'classic' || game.s.tracks?.includes(t.id)); const cur = sfx.currentSoundtrack();
        return have.length > 1 ? `<h5>Soundtrack</h5><div class="st-pick">${have.map((t) => `<button class="trow ${t.id === cur ? 'on' : ''}" data-action="soundtrack" data-arg="${t.id}"><div><b>${esc(t.name)}</b><span>${esc(t.by)}</span></div><i class="st-dot"></i></button>`).join('')}</div>`
          : '<p class="sub small">🔒 More soundtracks are out there. Keep beating hordes.</p>'; })()}
      ${sw('ranges-pref', 'Range lines', 'How far each unit type can shoot', showRanges())}
      ${sw('keep-pref', 'Difficulty meters', 'Keep-up meter, upgrade hints and horde odds', showKeep())}
      ${sw('fps-pref', 'FPS counter', 'Frames per second and the slowest frame, over the battlefield', showFps())}
      ${sw('skip-pref', 'Skip animations', 'No evolution cutscenes, horde reward cards or battleground fades: a short notice instead. You still choose each ultimate weapon', skipAnims())}
    </section>
    ${(() => { const pl = getPlayer(); return pl ? `<section class="set-sec"><h4>Commander</h4>
      <div class="trow static"><div><b>${esc(pl.name)}</b><span>Your name on the leaderboard.${pl.renamed ? ' Your one name change has been used.' : ' You can change it once.'}</span></div>
      ${pl.renamed ? '' : '<button class="btn small" data-action="rename">Change name</button>'}</div></section>` : ''; })()}
    <section class="set-sec"><h4>Auto-buy</h4>${game.autoUnlocked ? `
      <p class="sub small">Also on the map: the AUTO switches in the top-left corner.</p>
      ${AUTO_ORDER.map((k) => !game.autoOpen(k) ? `<div class="trow static locked"><div><b>${{ zombies: 'Zombies', units: 'Troops', globals: 'Global upgrades', tree: 'Passive tree' }[k]}</b><span>🔒 Unlocks when you beat Horde ${Game.AUTO_AT[k]}</span></div></div>` : sw('auto-pref', { zombies: 'Zombies', units: 'Troops', globals: 'Global upgrades', tree: 'Passive tree' }[k], { tree: 'Passives in every open region, in the tree’s own order, cheapest colour first', zombies: 'DNA tiers, spawn levels, evolutions and ultimate forms. Holds your squad’s keep-up at ×1: whenever it’s easier than that, zombies come first. On its own (every other switch off) it has no limit', units: 'Hires and every upgrade (you still choose ultimate forms yourself)', globals: 'The five colour upgrades and Scavenger' }[k], !!game.autoCfg[k]).replace('data-action="auto-pref"', `data-action="auto-pref" data-arg="${k}"`)).join('')}`
      : `<p class="sub small">🔒 Beat Horde ${Game.AUTO_HORDE} to unlock auto-buy for free.</p>`}
    </section>
    <section class="set-sec"><h4>Saves</h4>
      <div class="save-cur"><div><b>Current game${activeSlot() ? ` · ${slotName(activeSlot()!)}` : ''}</b><span>${saveLine(m)}</span></div><span class="ok">✓ Saved ${ago(game.s.lastSeen)}</span></div>
      <button class="btn grow newgame" data-action="new-game">＋ Start a new game</button>
      <p class="sub small">Your game saves automatically. Each slot holds its own game: switch any time, and the one you leave is kept where it was.</p>
      <div class="slots">${[...SLOTS, 'backup'].map(slotHtml).join('')}</div>
      <h5>Move to another device</h5>
      <div class="row"><button class="btn ghost grow" data-action="export">Copy save code</button><button class="btn ghost grow" data-action="import">Paste save code</button></div>
    </section>
    <section class="set-sec"><h4>Help</h4>
      <div class="trow static"><div><b>Report a problem</b><span>Crashes, freezes, anything odd. Sends a log of what the game was doing so it can be fixed.</span></div><button class="btn small" data-action="report">Report</button></div>
    </section>
    <section class="set-sec danger-zone"><h4>Danger zone</h4>
      <div class="trow static"><div><b>Erase progress</b><span>Start over from scratch. Your current game is kept in Backup, so you can undo this.</span></div><button class="btn danger sm" data-action="reset">Erase</button></div>
    </section>
    <p class="sub small set-foot">${fmtInt(game.s.kills)} zombies killed · ${game.s.hordes} hordes beaten · ${fmtInt(m.soldiers)} soldiers</p>`);
}
// ---------- save slots ----------
const SLOTS = ['1', '2', '3'];
const slotKey = (id: string) => `zombie-idle-slot-${id}`;
const slotName = (id: string) => (id === 'backup' ? 'Backup' : `Slot ${id}`);
interface Slot { code: string; savedAt: number }
function slotRead(id: string): Slot | null { try { const r = localStorage.getItem(slotKey(id)); return r ? JSON.parse(r) as Slot : null; } catch { return null; } }
function slotWrite(id: string, code: string) { try { localStorage.setItem(slotKey(id), JSON.stringify({ code, savedAt: Date.now() })); return true; } catch { toast('<b>Could not save</b><span>Storage is full or blocked</span>', '#ff6767'); return false; } }
const playTime = (sec: number) => { const m = Math.floor(sec / 60); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const saveLine = (m: ReturnType<typeof Game.summary>) => `Tier ${fmtInt(m.best)} · ${m.hordes} horde${m.hordes === 1 ? '' : 's'} · ${m.soldiers} soldier${m.soldiers === 1 ? '' : 's'}${m.playSec >= 60 ? ` · ${playTime(m.playSec)} played` : ''}`;
function ago(t: number) {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d < 14 ? `${d} day${d === 1 ? '' : 's'} ago` : new Date(t).toLocaleDateString();
}
function slotSummary(id: string): { line: string; when: string; kills?: number } | null | 'bad' {
  if (id === activeSlot()) { const m = Game.summary(game.s); return { line: saveLine(m), when: 'now', kills: m.kills }; }
  const sl = slotRead(id);
  if (!sl) return null;
  try { const m = Game.summary(Game.decode(sl.code)); return { line: saveLine(m), when: ago(sl.savedAt), kills: m.kills }; } catch { return 'bad'; }
}
function slotHtml(id: string) {
  const sum = slotSummary(id), backup = id === 'backup', playing = id === activeSlot();
  const info = sum === null ? `<span>${backup ? 'Made automatically before you load a save or erase' : 'Empty'}</span>`
    : sum === 'bad' ? '<span class="bad">Damaged save</span>' : `<span>${sum.line}</span><span class="when">${playing ? 'Playing now' : `${backup ? 'Kept' : 'Saved'} ${sum.when}`}</span>`;
  const btns = backup ? (sum && sum !== 'bad' ? `<button class="btn sm" data-action="slot-load" data-arg="${id}">Restore</button>` : '')
    : playing ? '<span class="sl-playing">▶ Playing</span>'
    : `${sum && sum !== 'bad' ? `<button class="btn sm" data-action="slot-play" data-arg="${id}">Play</button>` : ''}<button class="btn ghost sm" data-action="new-game" data-arg="${id}">New</button>${sum ? `<button class="xbtn sm" data-action="slot-clear" data-arg="${id}" aria-label="Delete ${slotName(id)}">✕</button>` : ''}`;
  return `<div class="slotrow ${sum ? '' : 'empty'} ${backup ? 'backup' : ''} ${playing ? 'playing' : ''}"><div class="sl-ic">${backup ? '↺' : id}</div><div class="sl-main"><b>${slotName(id)}</b>${info}</div><div class="sl-act">${btns}</div></div>`;
}
/** The slot the current game lives in. Older devices that already had copies in every slot start "unslotted": the current
 * game then goes to Backup when you leave it, like before. */
const ACTIVE_KEY = 'zombie-idle-active-slot';
let active: string | null | undefined;
function activeSlot(): string | null {
  if (active !== undefined) return active;
  try {
    const v = localStorage.getItem(ACTIVE_KEY);
    if (v === null) { active = SLOTS.find((id) => !slotRead(id)) ?? null; localStorage.setItem(ACTIVE_KEY, active ?? 'none'); }
    else active = SLOTS.includes(v) ? v : null;
  } catch { active = null; }
  return active;
}
function setActive(id: string) { active = id; try { localStorage.setItem(ACTIVE_KEY, id); } catch { /* storage blocked */ } }
/** Put the current game away in its slot (or Backup if it has none) before switching. */
function parkCurrent() { const a = activeSlot(); return slotWrite(a ?? 'backup', game.exportSave()); }
function playSlot(id: string) {
  const sl = slotRead(id); if (!sl) return;
  try { Game.decode(sl.code); } catch { toast('<b>That save could not be loaded</b><span>It is damaged</span>', '#ff6767'); return; }
  const from = activeSlot();
  if (!parkCurrent()) return;
  game.importSave(sl.code); setActive(id); closeModal(); tab = null; render();
  toast(`<b>Playing ${slotName(id)}</b><span>${from ? `Your other game is kept in ${slotName(from)}` : 'Your other game is kept in Backup'}</span>`, '#5ee38c');
}
/** "New game": straight into an empty slot; a slot with a game in it asks twice first. */
function newGame(id?: string) {
  const a = activeSlot();
  if (!id) id = SLOTS.find((x) => x !== a && !slotRead(x));
  if (!id) {   // every slot is in use: pick one to replace
    openModal(`<h3>Start a new game</h3><p class="sub">All your slots have a game in them. Pick one to replace; your current game stays in ${a ? slotName(a) : 'Backup'}.</p>
      <div class="slots">${SLOTS.filter((x) => x !== a).map((x) => { const sum = slotSummary(x); return `<div class="slotrow"><div class="sl-ic">${x}</div><div class="sl-main"><b>${slotName(x)}</b><span>${sum && sum !== 'bad' ? sum.line : 'Damaged save'}</span></div><div class="sl-act"><button class="btn ghost sm" data-action="new-game" data-arg="${x}">Replace</button></div></div>`; }).join('')}</div>
      <div class="row"><button class="btn ghost grow" data-action="settings">Cancel</button></div>`);
    return;
  }
  if (id === a) { act({ action: 'reset' }); return; }
  const sum = slotSummary(id);
  if (!sum) { startNewGame(id); return; }
  openModal(`<h3>${slotName(id)} already has a game</h3>
    <div class="save-cur found"><div><b>${slotName(id)}</b><span>${sum === 'bad' ? 'Damaged save' : `${sum.line}${sum.kills ? ` · ${fmtInt(sum.kills)} kills` : ''}`}</span>${sum !== 'bad' ? `<span>Saved ${sum.when}</span>` : ''}</div></div>
    <p class="sub">Starting a new game here replaces it.</p>
    <div class="row"><button class="btn ghost grow" data-action="settings">Keep it</button><button class="btn danger grow" data-action="new-game-check" data-arg="${id}">Replace it</button></div>`);
}
function newGameCheck(id: string) {
  const sum = slotSummary(id);
  openModal(`<h3>Are you sure?</h3><p class="sub"><b>${sum && sum !== 'bad' ? sum.line : 'The save'}</b> in ${slotName(id)} will be erased and a brand-new game starts there.${activeSlot() ? ' It goes to Backup as a last safety copy, until the next time you load or erase a game.' : ''}</p>
    <div class="row"><button class="btn ghost grow" data-action="settings">Cancel</button><button class="btn danger grow" data-action="new-game-yes" data-arg="${id}">Yes, start over in ${slotName(id)}</button></div>`);
}
function startNewGame(id: string) {
  const a = activeSlot(), old = slotRead(id);
  if (a && old) slotWrite('backup', old.code);   // the replaced game is the safety copy (an unslotted current game takes Backup instead)
  if (!parkCurrent()) return;
  closeModal(); game.hardReset(); setActive(id); slotWrite(id, game.exportSave()); tab = null; render(); showTitle();
  toast(`<b>New game in ${slotName(id)}</b><span>${a ? `Your other game is kept in ${slotName(a)}` : 'Your other game is kept in Backup'}</span>`, '#5ee38c');
}
/** Best horde / highest tier records came after prestige did: fill them in once from every saved copy on this device
 * (slots and Backup, which holds the game from just before your last prestige). */
function seedBests() {
  try { if (localStorage.getItem('zombie-idle-bests-seeded')) return; } catch { return; }
  for (const id of [...SLOTS, 'backup']) {
    const sl = slotRead(id); if (!sl) continue;
    try { const d = Game.decode(sl.code); game.s.bestHorde = Math.max(game.s.bestHorde ?? 0, d.bestHorde ?? 0, d.hordes); game.s.bestTier = Math.max(game.s.bestTier ?? 0, d.bestTier ?? 0, M.bestTier(d.strains)); } catch { /* damaged copy */ }
  }
  game.save();
  try { localStorage.setItem('zombie-idle-bests-seeded', '1'); } catch { /* storage blocked */ }
}
// ---------- problem reports ----------
function reportText() {
  const what = (document.getElementById('report-what') as HTMLTextAreaElement | null)?.value ?? '';
  const m = Game.summary(game.s);
  return buildReport(what, { ...m, tier: m.best, prestiges: game.s.prestige.runs, bestHorde: game.s.bestHorde, auto: game.autoLive, tab, units: Object.values(game.s.units).filter((u) => u.count).map((u) => `${u.cls}:${u.count}${u.evo !== undefined ? '*' : ''}`).join(' ') });
}
function openReport(crashed = false) {
  openModal(`<div class="set-head"><h3>Report a problem</h3><button class="xbtn" data-action="settings" aria-label="Close">✕</button></div>
    ${crashed ? '<p class="sub"><b>The game closed unexpectedly last time.</b> Sending this report helps track it down.</p>' : ''}
    <label class="sub small" for="report-what">What happened? (optional)</label>
    <textarea class="code" id="report-what" placeholder="e.g. it froze right after a horde, then reloaded"></textarea>
    <p class="sub small">The report includes your device type, game settings, a short summary of your game and a log of the last few hundred things the game did (errors, frame-rate drops, hordes, taps). No save code or personal info.</p>
    <div class="row"><button class="btn ghost grow" data-action="report-copy">Copy report</button><button class="btn grow" data-action="report-send">Send report</button></div>`);
}
async function doSendReport() {
  const btn = document.querySelector<HTMLButtonElement>('[data-action="report-send"]'); if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
  const res = await sendReport(reportText());
  if (res === 'sent') { clearLog(); log('info', 'report sent; log cleared'); closeModal(); toast('<b>Report sent</b><span>Thanks! It helps a lot.</span>', '#5ee38c'); return; }
  if (btn) { btn.disabled = false; btn.textContent = 'Send report'; }
  toast(res === 'local' ? '<b>Test copy: not sent</b><span>Use Copy report instead.</span>' : '<b>Couldn\'t send it</b><span>Use Copy report and paste it instead.</span>', '#ff6767');
}
function copyReport() {
  const text = reportText(), done = () => toast('<b>Report copied</b><span>Paste it wherever you like.</span>', '#5ee38c');
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch { /* ignore */ } ta.remove(); };
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(fallback); else fallback();
}
/** After a crash: offer the report once the game is up and nothing else is on screen. */
function offerCrashReport() {
  if (!lastSessionCrashed) return;
  const t = window.setInterval(() => {
    if (titleUp() || overlayUp() || coachUp() || !$('#modal').hidden || tab) return;
    window.clearInterval(t);
    openModal(`<h3>Did the game crash?</h3><p class="sub">It closed unexpectedly last time. Want to send a report so it can be fixed? It only takes a tap.</p>
      <div class="row"><button class="btn ghost grow" data-action="modal-close">Not now</button><button class="btn grow" data-action="report-crash">Report it</button></div>`);
  }, 1500);
}
/** A volume slider row for Settings (0 = off). */
function vol(which: 'music' | 'sfx', label: string, v: number) {
  return `<label class="vol"><span>${label}</span><input type="range" min="0" max="100" step="5" value="${v}" data-vol="${which}" style="--v:${v}%" aria-label="${label} volume"><output>${v ? `${v}%` : 'Off'}</output></label>`;
}
/** A yes/no dialog; Cancel goes back to Settings. */
function confirmBox(title: string, body: string, yes: string, action: string, arg = '', danger = false) {
  openModal(`<h3>${title}</h3><p class="sub">${body}</p>
    <div class="row"><button class="btn ghost grow" data-action="settings">Cancel</button><button class="btn ${danger ? 'danger' : ''} grow" data-action="${action}" data-arg="${arg}">${yes}</button></div>`);
}
let pendingImport: string | null = null;
/** Replace the current game with a save code; the current progress goes to the Backup slot first. */
function loadCode(code: string, from: string) {
  try {
    Game.decode(code);
    slotWrite('backup', game.exportSave());
    game.importSave(code);
    closeModal();
    toast(`<b>Loaded ${esc(from)}</b><span>Your previous game is in Backup</span>`, '#5ee38c');
  } catch { toast('<b>That save could not be loaded</b><span>The code is invalid</span>', '#ff6767'); }
}
function slotAction(kind: string, id: string) {
  const sum = slotSummary(id), cur = saveLine(Game.summary(game.s));
  if (kind === 'load' && sum && sum !== 'bad') {
    confirmBox(id === 'backup' ? 'Restore Backup?' : `Load ${slotName(id)}?`, `You'll switch to <b>${sum.line}</b>. Your current game (${cur}) is kept in Backup.`, id === 'backup' ? 'Restore' : 'Load', 'slot-load-yes', id);
  } else if (kind === 'clear') {
    confirmBox(`Delete ${slotName(id)}?`, `${sum && sum !== 'bad' ? `<b>${sum.line}</b> will be deleted.` : 'This save will be deleted.'} Your current game is not affected.`, 'Delete', 'slot-clear-yes', id, true);
  }
}
function exportSave() {
  const code = game.exportSave();
  openModal(`<h3>Your save code</h3><p class="sub small">Copy this, then use <b>Paste save code</b> on your other device. Anyone with the code can load your game.</p>
    <textarea readonly class="code">${code}</textarea>
    <div class="row"><button class="btn ghost grow" data-action="settings">Back</button><button class="btn grow" id="copy-save">Copy</button></div>`);
  const ta = $<HTMLTextAreaElement>('textarea.code');
  $('#copy-save').onclick = () => {
    const done = () => { $('#copy-save').textContent = 'Copied ✓'; };
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done).catch(() => { ta.select(); document.execCommand('copy'); done(); });
    else { ta.select(); document.execCommand('copy'); done(); }
  };
}
function importSave() {
  pendingImport = null;
  openModal(`<h3>Paste a save code</h3><p class="sub small">Paste the code you copied on another device.</p>
    <textarea class="code" id="import-code" placeholder="Paste here"></textarea>
    <div id="import-opts"><div class="row"><button class="btn ghost grow" data-action="settings">Back</button></div></div>`);
  const ta = $<HTMLTextAreaElement>('#import-code');
  const check = () => {
    const code = ta.value.trim();
    const box = $('#import-opts');
    if (!code) { pendingImport = null; box.innerHTML = '<div class="row"><button class="btn ghost grow" data-action="settings">Back</button></div>'; return; }
    try {
      const m = Game.summary(Game.decode(code));
      pendingImport = code;
      box.innerHTML = `<div class="save-cur found"><div><b>Save found</b><span>${saveLine(m)} · ${fmtInt(m.kills)} kills</span></div></div>
        <div class="row"><button class="btn grow" data-action="import-load">Load it now</button></div>
        <p class="sub small">Your current game is kept in Backup. Or keep it for later:</p>
        <div class="row">${SLOTS.filter((id) => id !== activeSlot()).map((id) => `<button class="btn ghost grow sm" data-action="import-slot" data-arg="${id}">Into ${slotName(id)}</button>`).join('')}</div>
        <div class="row"><button class="btn ghost grow" data-action="settings">Back</button></div>`;
    } catch { pendingImport = null; box.innerHTML = '<p class="sub small bad">That doesn\'t look like a save code. Copy the whole code and try again.</p><div class="row"><button class="btn ghost grow" data-action="settings">Back</button></div>'; }
  };
  ta.addEventListener('input', check);
  ta.focus();
}
function toast(html: string, color: string, icon?: string, ms = 3200) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--rar', color);
  el.innerHTML = `${icon ? `<img class="px" src="${icon}" alt="">` : ''}<div>${html}</div>`;
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => el.remove(), ms + 500);
}
function toastLoot(l: Loot, title: string) {
  if (l.alsoSold && !l.sold) toast(`<b>Upgrade kept</b><span>Sold ${l.alsoSold} older item${l.alsoSold > 1 ? 's' : ''} it replaced</span>`, '#6fdc7a');
  if (l.sold) { toast(`<b>Auto-sold ${esc(l.type === 'gun' ? gunName(l.gun) : gearName(l.gear))}</b><span>+${fmtLn(l.sold.ln)} ${M.strainById(l.sold.colour).dna} DNA</span>`, M.strainById(l.sold.colour).color); return; }
  if (l.type === 'gun') toast(`<b>${title} ${esc(gunName(l.gun))}</b><span>Tier ${fmtInt(l.gun.ilvl)} · for ${M.classById(l.gun.cls).plural}</span>`, RARITY_COLOR[l.gun.rarity], crateIcon(l.gun.rarity));
  else toast(`<b>${title} ${esc(gearName(l.gear))}</b><span>${esc(gearDesc(l.gear))}</span>`, RARITY_COLOR[l.gear.rarity], crateIcon(l.gear.rarity));
}
