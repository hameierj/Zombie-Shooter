// DOM interface: HUD (one counter per DNA colour), four tabs (Zombies, Squad, Tree, Hordes), a full-screen screen
// per unit type (its own upgrade tree, gear and ability), the pan/zoom passive tree, toasts and modals.
// Clicks go through one delegated listener using data-action attributes, so re-rendering never loses a tap on iOS.
import { showRanges, setShowRanges } from '../core/prefs';
import * as M from '../core/model.ts';
import type { ClassId, Gear, Gun, StrainId, Unit, UnitNodeId } from '../core/model.ts';
import { Game, game, type AutoSell, type Loot } from '../core/state.ts';
import { REGIONS, TREE, treeNode } from '../core/tree.ts';
import { charmIcon, classIcon, crateIcon, gunIcon, modIcon, nodeIcon, vialIcon, zombieIcon } from '../game/art.ts';
import { fmtInt, fmtLn, fmtMult, fmtNum, gearDesc, gearName, gunName, RARITY_COLOR } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';

const C = M.CONFIG;
type Tab = 'zombies' | 'squad' | 'tree' | 'hordes';
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
const amtN = () => (buyAmt === 'max' ? 1000 : buyAmt);
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
const tierPrev = (z: M.ZombieId) => { const x = game.s.strains[z]; return preview(M.familyOf(z), (i) => (x.tier + i < x.maxTier ? -Infinity : M.lnTierCost(z, x.maxTier + (x.tier + i - x.maxTier)))); };
const spawnPrev = (z: M.ZombieId) => { const x = game.s.strains[z]; return preview(M.familyOf(z), (i) => (x.spawn + i < C.spawnMax ? M.lnSpawnCost(z, x.spawn + i) : null)); };
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
    const icon = kind === 'gun' ? gunIcon(c) : (it as Gear).kind === 'attach' ? modIcon((it as M.Attachment).stat) : charmIcon((it as M.Charm).bane);
    const txt = kind === 'gun' ? `×${fmtLn(M.lnGunPower(it as Gun))} dmg` : gearDesc(it as Gear);
    return `<div class="sh" style="--rar:${RARITY_COLOR[it.rarity]}" title="${esc(kind === 'gun' ? gunName(it as Gun) : gearName(it as Gear))}"><img class="px" src="${icon}" alt=""><div><b>${label}</b><span>${esc(txt)}</span></div></div>`;
  };
  return `<div class="shelf">${shelf('gun', 'Gun')}${shelf('attach', 'Attachment')}${shelf('charm', 'Charm')}</div>`;
}
/** The upgrade on a unit card that adds the most damage per DNA right now (Damage, Speed, Range, Crit, Crit × or Hire). */
function bestBuy(c: ClassId): string | null {
  const u = game.unit(c);
  if (!u.count) return null;
  const value = (x: Unit) => { const st = M.unitStats({ ...game.entry(u), u: x }, game.fx); return st.lnDps + Math.log(0.55 + 0.45 * st.range) + Math.log(M.unitPower(x.count)); };
  const now = value(u);
  let best: string | null = null, bestScore = -Infinity;
  const consider = (key: string, next: Unit, lnCost: number) => {
    const gain = value(next) - now;
    if (gain <= 1e-9 || !Number.isFinite(lnCost)) return;
    const score = Math.log(Math.expm1(gain)) - lnCost;
    if (score > bestScore) { bestScore = score; best = key; }
  };
  for (const id of ['dmg', 'spd', 'range', 'crit', 'critx'] as UnitNodeId[]) {
    const ns = game.node(c, id);
    if (!ns.maxed && !ns.locked) consider(id, { ...u, nodes: { ...u.nodes, [id]: ns.level + 1 } }, ns.lnCost);
  }
  if (u.count < game.unitCap) consider('hire', { ...u, count: u.count + 1 }, game.hireCost(c));
  return best;
}
function upgradeRow(c: ClassId) {
  const u = game.unit(c), cd = M.classById(c);
  const star = bestBuy(c);
  const starred = (html: string, key: string) => (key === star ? html.replace('class="mu ', 'class="mu best ') : html);
  return `<div class="ugrid pairs">${starred(hireBtn(c), 'hire')}${starred(damageBtn(c), 'dmg')}${UP_BUTTONS.map((b) => {
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
    return `<button class="mu ${state} ${b.key === star ? 'best' : ''}" style="--dna:${M.strainById(ns.colour).color}" title="${esc(tip)}" ${done || ns.locked ? 'disabled' : `data-action="${multi ? 'buy-stages' : 'buy-node'}" data-cls="${c}" data-arg="${multi ? b.key : id}" ${costAttr(ns.colour, p.ln)}`}>
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
const TITLES: Record<Tab, string> = { zombies: 'Zombies', squad: 'Squad', tree: 'Passive Tree', hordes: 'Hordes' };

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
  document.addEventListener('pointerdown', () => { lastPointer = performance.now(); pointerDown++; }, { passive: true });
  const release = () => { lastPointer = performance.now(); pointerDown = Math.max(0, pointerDown - 1); };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  game.on((evt, data) => {
    if (evt === 'loot') toastLoot(data as Loot, 'Found:');
    if (evt === 'horde-won') { const d = data as { k: number; loot: Loot }; toast(`<b>Horde ${d.k} beaten!</b><span>${esc(M.hordeDef(d.k).unlocks)}</span>`, '#ffd34d'); toastLoot(d.loot, 'Reward:'); }
    if (evt === 'stuck') offerRollBack();
    if (evt === 'horde-lost') toast('<b>The horde was too strong</b><span>Upgrade your units and try again.</span>', '#ff6b6b');
    if (evt === 'release') { const st = M.strainById(data as StrainId); toast(`<b>${st.plural} released!</b><span>They drop ${st.dna} DNA.</span>`, st.color, zombieIcon(st.id)); }
    if (evt === 'phase') battlePhase = data as string;
    if (evt === 'horde-start') battlePhase = 'intro';
    if (['change', 'reset', 'hire', 'allocate', 'release', 'horde-won', 'horde-lost', 'phase', 'horde-start'].includes(evt)) soft();
  });
  render();
  refresh();
  setInterval(refresh, 300);
  setInterval(tickCombo, 100);
}

/** The combo meter over the battlefield (hidden while a menu covers the map or the combo is small). */
let lastCombo = 0;
function tickCombo() {
  const el = $('#combo');
  const n = game.combo, max = C.combo.max;
  el.hidden = !!tab || n < 5;
  if (el.hidden) { lastCombo = n; return; }
  $('#combo-n').textContent = fmtInt(n);
  $('#combo-x').textContent = `×${game.comboMult.toFixed(2)} DNA`;
  $('#combo-bar').style.width = `${Math.min(100, (n / max) * 100)}%`;
  el.classList.toggle('max', n >= max);
  if (Math.floor(n / 50) > Math.floor(lastCombo / 50)) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  lastCombo = n;
}

/** Re-render soon, but never while a finger is down (iOS drops taps on replaced nodes). */
function soft() {
  if (softTimer) return;
  softTimer = window.setTimeout(function again() {
    if (pointerDown > 0 || performance.now() - lastPointer < 450) { softTimer = window.setTimeout(again, 300); return; }
    softTimer = 0;
    render();
  }, 120);
}

// ---------- clicks ----------
type ActionData = { action: string; arg?: string; n?: string; cls?: string; strain?: string; slot?: string };
function onClick(e: Event) {
  const el = (e.target as Element).closest<HTMLElement | SVGElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  act({ ...el.dataset } as ActionData);
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
      if (tab === 'squad') game.markSeen();
      render();
      break;
    case 'close': tab = null; render(); break;
    case 'buy-amt': buyAmt = arg === 'max' ? 'max' : (Number(arg) as 1 | 10); try { localStorage.setItem('zombie-idle-buy', String(buyAmt)); } catch { /* ignore */ } render(); break;
    case 'tier-up': for (let i = 0, t = -1; i < amtN() && t !== game.s.strains[sid].tier; i++) { t = game.s.strains[sid].tier; game.raiseTier(sid); } break;
    case 'spawn': for (let i = 0, t = -1; i < amtN() && t !== game.s.strains[sid].spawn; i++) { t = game.s.strains[sid].spawn; game.buySpawn(sid); } break;
    case 'release': game.release(sid); break;
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
    case 'allocate': { const had = game.s.alloc.length; game.allocate(arg); if (game.s.alloc.length > had) { const n = treeNode(arg); treeFresh = arg; toast(`<b>${esc(n.size === 'small' ? n.desc : n.name)}</b><span>${esc(n.size === 'small' ? REGIONS[n.region].name : n.desc)}</span>`, REGIONS[n.region].color); } break; }
    case 'horde': game.startHorde(); tab = null; render(); break;
    case 'toggle': game.s.autoHordeOn = !game.s.autoHordeOn; render(); break;
    case 'settings': openSettings(); break;
    case 'modal-close': closeModal(); break;
    case 'export': exportSave(); break;
    case 'saves': openSettings(); break;
    case 'slot-save': slotAction('save', arg); break;
    case 'slot-load': slotAction('load', arg); break;
    case 'slot-clear': slotAction('clear', arg); break;
    case 'slot-save-yes': if (slotWrite(arg, game.exportSave())) toast(`<b>Saved to ${slotName(arg)}</b><span>${saveLine(Game.summary(game.s))}</span>`, '#5ee38c'); openSettings(); break;
    case 'slot-load-yes': { const sl = slotRead(arg); if (sl) loadCode(sl.code, slotName(arg)); break; }
    case 'slot-clear-yes': try { localStorage.removeItem(slotKey(arg)); } catch { /* ignore */ } openSettings(); break;
    case 'import-load': { const c = pendingImport; if (c) loadCode(c, 'the pasted save'); break; }
    case 'import-slot': { const c = pendingImport; if (!c) break;
      const sum = slotSummary(arg);
      if (sum && !confirm(`${slotName(arg)} already has a save. Replace it?`)) break;
      if (slotWrite(arg, c)) toast(`<b>Saved into ${slotName(arg)}</b><span>Load it from Settings whenever you like</span>`, '#5ee38c'); openSettings(); break; }
    case 'import': importSave(); break;
    case 'reset': confirmBox('Erase all progress?', `You'll start over from the beginning. Your current game (${saveLine(Game.summary(game.s))}) is kept in Backup, so you can restore it from Settings.`, 'Erase progress', 'reset-yes', '', true); break;
    case 'reset-yes': slotWrite('backup', game.exportSave()); closeModal(); game.hardReset(); toast('<b>Progress erased</b><span>Your old game is in Backup if you change your mind</span>', '#ff9a5a'); break;
    case 'sound': { const on = !(sfx.soundPrefs().sfx || sfx.soundPrefs().music); sfx.setSfx(on); sfx.setMusic(on); refresh(); break; }
    case 'sound-sfx': sfx.setSfx(!sfx.soundPrefs().sfx); openSettings(); break;
    case 'sound-music': sfx.setMusic(!sfx.soundPrefs().music); openSettings(); break;
    case 'ranges-pref': setShowRanges(!showRanges()); openSettings(); break;
    case 'keep-pref': setShowKeep(!showKeep()); openSettings(); render(); break;
  }
  // sound feedback: purchases make a "buy" sound if DNA was actually spent
  const after = M.STRAIN_IDS.reduce((x, c) => x + Math.exp(Math.min(700, game.dna(c))), 0);
  const paid = after < spent || (a === 'tier-up' && game.s.strains[sid].tier > tier0);
  if (a === 'tier-up') sfx.tierUp();
  else if (a === 'allocate') { if (paid) sfx.allocate(); }
  else if (a === 'sell' || a === 'sell-matching') sfx.buy();
  else if (['buy-node', 'buy-stages', 'hire', 'spawn', 'release'].includes(a)) { if (paid) sfx.buy(); else sfx.denied(); }
  else if (a.startsWith('equip')) sfx.equip();
  else if (a !== 'horde') sfx.click();
  // the tap is finished, so a re-render the action asked for can happen right now (no waiting)
  if (softTimer) { clearTimeout(softTimer); softTimer = 0; render(); }
  refresh();
  return paid;
}


// ---------- HUD (refreshed in place) ----------
function refresh() {
  const cols = game.colours;
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
  pill.textContent = k >= 1.1 ? 'keeping up' : k >= 0.9 ? 'barely' : 'overrun';
  for (const b of document.querySelectorAll<HTMLElement>('#tabs [data-action="tab"]')) {
    b.classList.toggle('active', b.dataset.arg === tab);
    const badge = b.dataset.arg === 'tree' ? game.allocatableCount() > 0
      : b.dataset.arg === 'squad' ? game.keyUpgradeAffordable
      : b.dataset.arg === 'zombies' ? game.canReleaseAny
      : b.dataset.arg === 'hordes' ? showKeep() && game.hordeOdds() >= C.hordeWinOdds : false;
    b.classList.toggle('badge', badge);
  }
  // keep buttons live as DNA comes in: enable + highlight the moment one becomes affordable (or stops being), and
  // redraw so ×10 / Max previews catch up
  let flipped = false;
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-cost]')) {
    const ok = game.canAfford(el.dataset.col as StrainId, Number(el.dataset.cost));
    el.disabled = !ok;
    if (el.classList.contains('mu') && el.classList.contains('afford') !== ok) { el.classList.toggle('afford', ok); flipped = true; }
  }
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
  const panel = $('#panel');
  document.getElementById('app')!.classList.toggle('menu-open', !!tab);
  panel.hidden = !tab;
  if (!tab) { refresh(); return; }
  const body = $('#tab-body');
  const key = `${tab}:${tab === 'tree' ? treeView : ''}`;
  const scroll = body.dataset.key === key ? body.scrollTop : 0;
  body.dataset.key = key;
  $('#panel-title').textContent = TITLES[tab];
  body.className = '';
  body.innerHTML = tab === 'zombies' ? zombiesHtml() : tab === 'squad' ? squadHtml() : tab === 'tree' ? treeTabHtml() : hordesHtml();
  body.scrollTop = scroll;
  refresh();
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
  const traits = (st: M.StrainDef) => `${st.hp}× HP · ${st.dnaMult}× DNA${st.speed > 1.2 ? ' · fast' : st.speed < 0.8 ? ' · slow' : ''}`;
  const row = (st: M.StrainDef) => {
    const x = game.s.strains[st.id], col = st.family;
    if (!x.unlocked) {
      const u = st.unlock!;
      const fromOpen = game.releaseReady(st.id), pc = M.familyOf(u.from), ln = game.releaseCost(st.id);
      const from = M.strainById(u.from), fx = game.s.strains[u.from];
      return `<div class="srow locked" style="--dna:${st.color}">
        <img class="px face" src="${zombieIcon(st.id)}" alt="">
        <div class="s-info"><b>${st.plural}</b><span class="sub">${traits(st)}</span></div>
        <div class="s-btns">${fromOpen ? `<button class="btn sbtn" data-action="release" data-strain="${st.id}" ${costAttr(pc, ln)}><span>Release</span>${cost(pc, ln)}</button>`
          : `<span class="sub small lockmsg">🔒 ${fx.unlocked ? `${from.plural} to tier ${C.releaseTier} (now ${fx.maxTier})` : `Release ${from.plural} first`}</span>`}</div>
      </div>`;
    }
    const kT = game.keepUpIf(st.id, 'tier'), kS = game.keepUpIf(st.id, 'spawn');
    const free = x.tier < x.maxTier;
    const tp = tierPrev(st.id), sp = spawnPrev(st.id);
    const lnRate = Math.log(M.spawnRate(st.id, x.spawn) * f) + M.lnDnaPerKill(st.id, x.tier, game.fx);
    return `<div class="srow" style="--dna:${st.color}">
      <img class="px face" src="${zombieIcon(st.id)}" alt="">
      <div class="s-info"><b>${st.plural}</b>
        <span class="sub">${vial(col)} +${fmtLn(lnRate)}/s · ${fmtLn(M.lnZombieHp(st.id, x.tier, x.spawn))} HP</span>
        <span class="sub small">Tier ${fmtInt(x.tier)}${free ? `/${fmtInt(x.maxTier)}` : ''} · Spawn ${x.spawn}/${C.spawnMax} (${fmtNum(M.spawnRate(st.id, x.spawn))}/s)${varietyText(x.tier)}</span></div>
      <div class="s-btns">
        <button class="btn sbtn" data-action="tier-up" data-strain="${st.id}" ${free ? '' : costAttr(col, tp.ln)} title="Next tier: ×${C.R} DNA and ×${C.R} HP"><span>DNA +</span>${free ? '<span class="cost">free</span>' : amtCost(col, tp)}${word(kT)}</button>
        ${x.spawn < C.spawnMax ? `<button class="btn sbtn" data-action="spawn" data-strain="${st.id}" ${costAttr(col, sp.ln)} title="+12% ${st.plural}, each level +3% HP"><span>Spawn +</span>${amtCost(col, sp)}${word(kS)}</button>`
          : '<button class="btn sbtn ghost" disabled><span>Spawn</span><span class="cost">max</span></button>'}
      </div>
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
  <p class="sub">Zombies come in five DNA colours, five types each. Raise a type's <b>DNA</b> or <b>Spawn</b> to earn more of its colour; it also makes those zombies tougher. Release new types with DNA of their colour.</p>
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
      <div class="u-main"><b>${c.plural}</b><span class="count">×${u.count}<small>/${game.unitCap}</small></span>
        <span class="sub">${u.count ? `Lv ${M.nlv(u, 'dmg')} · ${fmtLn(game.unitDps(u))} DPS` : `${c.gun} · not hired yet`}</span></div>
      ${u.count ? `${upgradeRow(c.id)}${gearShelf(c.id)}` : recruitPanel(c)}
    </div>`;
  }).join('');
  return `${topBar()}<p class="sub">Hire and upgrade each unit right on its card; Ability and Gear slots unlock stage by stage. Up to <b>${game.unitCap}</b> of each type for now (${C.maxPerType} max; barracks grow every ${C.tiersPerUnit} tiers).</p>
  <div class="grid2">${cards}</div>
  <p class="sub small">Every unit always carries its best gear, and extra drops are sold for DNA automatically.</p>`;
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
  const col = game.treeColour(id), ln = game.treeCost();
  const kind = n.size === 'notable' ? 'notable' : n.size === 'keystone' ? 'key' : '';
  const state = has ? 'owned' : can ? 'avail' : 'locked';
  const act = has ? '<span class="tc-own">✓ Owned</span>'
    : can ? `<button class="tc-buy" data-action="allocate" data-arg="${id}" ${costAttr(col, ln)}>${vial(col)}${fmtLn(ln)}</button>`
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
    const sub = got === 10 ? 'Complete' : rd ? `<span class="tc-ready">${rd} ready to take</span> · paid in ${colour.dna}` : av ? `${av} next · paid in ${colour.dna}` : `Paid in ${colour.dna}`;
    return `<div class="tc-region ${open ? 'open' : ''}" style="--rc:${reg.color}">
      <button class="tc-head" data-action="region" data-arg="${ri}" aria-expanded="${open}">${treeRing(got, reg.color)}<div><b>${reg.name}</b><span class="tc-sub">${sub}</span></div><span class="tc-chev">▶</span></button>
      ${open ? `<div class="tc-goal"><i></i><div>Goal: <em>${esc(key.name)}</em>. ${esc(key.desc)}</div></div>
      <div class="tc-body">${treeStep(ri, 's1', 1, true)}${treeStep(ri, 's2', 2)}${treeStep(ri, 'n1', 3)}
        <div class="tc-forkhead"><span>Path A</span><span>Path B</span></div>
        <div class="tc-fork"><div class="tc-col">${['a1', 'a2', 'na'].map((k, i) => treeStep(ri, k, 4 + i, i === 0)).join('')}</div><div class="tc-col">${['b1', 'b2', 'nb'].map((k, i) => treeStep(ri, k, 4 + i, i === 0)).join('')}</div></div>
        ${treeStep(ri, 'k', 7)}</div>` : ''}
    </div>`;
  }).join('');
  treeFresh = '';
  return `<div class="tc-summary"><span><b>${game.s.alloc.length}</b> passives${totalReady ? ` · <span class="tc-ready">${totalReady} ready</span>` : ''}</span><span>Each one raises the next price ×${C.treeCostGrowth} · next <b>${fmtLn(game.treeCost())}</b></span></div>
  <div class="tc-list">${regions}</div>`;
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
function hordesHtml() {
  const next = game.nextHorde;
  const all = Array.from({ length: Math.max(8, next + 2) }, (_, i) => i + 1).filter((k) => k <= 7 || k <= next + 1);
  const list = [...all.filter((k) => k >= next), ...all.filter((k) => k < next).reverse()];
  return `<p class="sub">Hordes are optional fights: each has its own style, and ends with a <b>boss</b>. The stream pauses while you fight. You lose if <b>the boss reaches the shredder</b> or <b>${C.breachLimit} horde zombies</b> get to it. Losing costs nothing; winning unlocks a new unit type and tree region.</p>
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
        ${hordeRunning() ? `<p class="good">⚔ Horde ${k} in progress… watch the map</p><button class="btn wide call" disabled>In progress</button>` : `<button class="btn wide call" data-action="horde">Start Horde ${k}</button>`}` : '<p class="sub small">🔒 Beat the previous horde first.</p>'}
    </div>`;
  }).join('')}</div>`;
}

function openModal(html: string) { const m = $('#modal'); m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; }
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
      ${sw('sound-sfx', 'Sound effects', 'Shots, hits and alerts', snd.sfx)}
      ${sw('sound-music', 'Music', 'Background soundtrack', snd.music)}
      ${sw('ranges-pref', 'Range lines', 'How far each unit type can shoot', showRanges())}
      ${sw('keep-pref', 'Difficulty meters', 'Keep-up meter, upgrade hints and horde odds', showKeep())}
    </section>
    <section class="set-sec"><h4>Saves</h4>
      <div class="save-cur"><div><b>Current game</b><span>${saveLine(m)}</span></div><span class="ok">✓ Saved ${ago(game.s.lastSeen)}</span></div>
      <p class="sub small">Your game saves automatically. Slots keep extra copies you can switch between.</p>
      <div class="slots">${[...SLOTS, 'backup'].map(slotHtml).join('')}</div>
      <h5>Move to another device</h5>
      <div class="row"><button class="btn ghost grow" data-action="export">Copy save code</button><button class="btn ghost grow" data-action="import">Paste save code</button></div>
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
function slotSummary(id: string): { line: string; when: string } | null | 'bad' {
  const sl = slotRead(id);
  if (!sl) return null;
  try { return { line: saveLine(Game.summary(Game.decode(sl.code))), when: ago(sl.savedAt) }; } catch { return 'bad'; }
}
function slotHtml(id: string) {
  const sum = slotSummary(id), backup = id === 'backup';
  const info = sum === null ? `<span>${backup ? 'Made automatically before you load a save or erase' : 'Empty'}</span>`
    : sum === 'bad' ? '<span class="bad">Damaged save</span>' : `<span>${sum.line}</span><span class="when">${backup ? 'Kept' : 'Saved'} ${sum.when}</span>`;
  const btns = backup ? (sum && sum !== 'bad' ? `<button class="btn sm" data-action="slot-load" data-arg="${id}">Restore</button>` : '')
    : `<button class="btn ${sum ? 'ghost' : ''} sm" data-action="slot-save" data-arg="${id}">Save</button>${sum && sum !== 'bad' ? `<button class="btn sm" data-action="slot-load" data-arg="${id}">Load</button>` : ''}${sum ? `<button class="xbtn sm" data-action="slot-clear" data-arg="${id}" aria-label="Delete ${slotName(id)}">✕</button>` : ''}`;
  return `<div class="slotrow ${sum ? '' : 'empty'} ${backup ? 'backup' : ''}"><div class="sl-ic">${backup ? '↺' : id}</div><div class="sl-main"><b>${slotName(id)}</b>${info}</div><div class="sl-act">${btns}</div></div>`;
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
  if (kind === 'save') {
    if (!sum) { if (slotWrite(id, game.exportSave())) toast(`<b>Saved to ${slotName(id)}</b><span>${cur}</span>`, '#5ee38c'); openSettings(); return; }
    confirmBox(`Overwrite ${slotName(id)}?`, `${slotName(id)} has <b>${sum === 'bad' ? 'a damaged save' : sum.line}</b>. It will be replaced with your current game (${cur}).`, 'Overwrite', 'slot-save-yes', id);
  } else if (kind === 'load' && sum && sum !== 'bad') {
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
        <div class="row">${SLOTS.map((id) => `<button class="btn ghost grow sm" data-action="import-slot" data-arg="${id}">Into ${slotName(id)}</button>`).join('')}</div>
        <div class="row"><button class="btn ghost grow" data-action="settings">Back</button></div>`;
    } catch { pendingImport = null; box.innerHTML = '<p class="sub small bad">That doesn\'t look like a save code. Copy the whole code and try again.</p><div class="row"><button class="btn ghost grow" data-action="settings">Back</button></div>'; }
  };
  ta.addEventListener('input', check);
  ta.focus();
}
function toast(html: string, color: string, icon?: string) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.setProperty('--rar', color);
  el.innerHTML = `${icon ? `<img class="px" src="${icon}" alt="">` : ''}<div>${html}</div>`;
  box.appendChild(el);
  while (box.children.length > 3) box.firstElementChild!.remove();
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}
function toastLoot(l: Loot, title: string) {
  if (l.alsoSold && !l.sold) toast(`<b>Upgrade kept</b><span>Sold ${l.alsoSold} older item${l.alsoSold > 1 ? 's' : ''} it replaced</span>`, '#6fdc7a');
  if (l.sold) { toast(`<b>Auto-sold ${esc(l.type === 'gun' ? gunName(l.gun) : gearName(l.gear))}</b><span>+${fmtLn(l.sold.ln)} ${M.strainById(l.sold.colour).dna} DNA</span>`, M.strainById(l.sold.colour).color); return; }
  if (l.type === 'gun') toast(`<b>${title} ${esc(gunName(l.gun))}</b><span>Tier ${fmtInt(l.gun.ilvl)} · for ${M.classById(l.gun.cls).plural}</span>`, RARITY_COLOR[l.gun.rarity], crateIcon(l.gun.rarity));
  else toast(`<b>${title} ${esc(gearName(l.gear))}</b><span>${esc(gearDesc(l.gear))}</span>`, RARITY_COLOR[l.gear.rarity], crateIcon(l.gear.rarity));
}
