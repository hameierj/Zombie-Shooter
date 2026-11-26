// DOM interface: HUD (one counter per DNA colour), four tabs (Zombies, Squad, Tree, Hordes), a full-screen screen
// per unit type (its own upgrade tree, gear and ability), the pan/zoom passive tree, toasts and modals.
// Clicks go through one delegated listener using data-action attributes, so re-rendering never loses a tap on iOS.
import * as M from '../core/model.ts';
import type { ClassId, Gear, Gun, StrainId, Unit, UnitNodeId } from '../core/model.ts';
import { game, type AutoSell, type Loot, type OfflineReport } from '../core/state.ts';
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

/** The open menu, or null when the full-screen zombie map is showing. */
let tab: Tab | null = null;
const TITLES: Record<Tab, string> = { zombies: 'Zombies', squad: 'Squad', tree: 'Passive Tree', hordes: 'Hordes' };
let unitView: ClassId | null = null;     // the unit type whose own screen is open inside the Squad tab
let unitNode: UnitNodeId = 'dmg';
let selectedNode = 'start';
let lastPointer = 0;
let pointerDown = 0;
let softTimer = 0;
const view = { x: 0, y: 0, s: 0.6, dragged: false };

// ---------- init ----------
export function initUI() {
  document.addEventListener('click', onClick, true);
  document.addEventListener('pointerdown', startHold, { passive: true });
  document.addEventListener('pointerup', endHold, { passive: true });
  document.addEventListener('pointercancel', endHold, { passive: true });
  document.addEventListener('touchend', endHold, { passive: true, capture: true });
  document.addEventListener('touchcancel', endHold, { passive: true, capture: true });
  document.addEventListener('pointermove', (e) => { if (hold && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > 14) endHold(); }, { passive: true });
  window.addEventListener('blur', endHold);
  document.addEventListener('contextmenu', (e) => { if ((e.target as Element).closest('button[data-action]')) e.preventDefault(); });
  document.addEventListener('pointerdown', () => { lastPointer = performance.now(); pointerDown++; }, { passive: true });
  const release = () => { lastPointer = performance.now(); pointerDown = Math.max(0, pointerDown - 1); };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  game.on((evt, data) => {
    if (evt === 'loot') toastLoot(data as Loot, 'Found:');
    if (evt === 'horde-won') { const d = data as { k: number; loot: Loot }; toast(`<b>Horde ${d.k} beaten!</b><span>${esc(M.hordeDef(d.k).unlocks)}</span>`, '#ffd34d'); toastLoot(d.loot, 'Reward:'); }
    if (evt === 'horde-lost') toast('<b>The horde was too strong</b><span>Upgrade your units and try again.</span>', '#ff6b6b');
    if (evt === 'release') { const st = M.strainById(data as StrainId); toast(`<b>${st.plural} released!</b><span>They drop ${st.dna} DNA.</span>`, st.color, zombieIcon(st.id)); }
    if (['change', 'reset', 'hire', 'allocate', 'release', 'horde-won', 'horde-lost', 'phase'].includes(evt)) soft();
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
  if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); return; }
  const el = (e.target as Element).closest<HTMLElement | SVGElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  act({ ...el.dataset } as ActionData);
}
/** Run one UI action. Returns true if it bought something (used by hold-to-repeat). */
function act(d: ActionData, quiet = false): boolean {
  const a = d.action, arg = d.arg ?? '', n = Number(d.n ?? 0);
  const cls = d.cls as ClassId, sid = d.strain as StrainId;
  const spent = M.STRAIN_IDS.reduce((x, c) => x + Math.exp(Math.min(700, game.dna(c))), 0);
  const tier0 = sid ? game.s.strains[sid]?.tier : 0;
  switch (a) {
    case 'tab':
      // from a sub-screen (a unit type's tree), the tab button goes back to that tab's overview;
      // from the overview it collapses the menu to the map; from the map it opens the overview
      if (tab === arg && arg === 'squad' && unitView) unitView = null;
      else { tab = tab === arg ? null : (arg as Tab); unitView = null; }
      if (tab === 'squad') game.markSeen();
      render();
      break;
    case 'close': tab = null; render(); break;
    case 'tier-up': game.raiseTier(sid); break;
    case 'spawn': game.buySpawn(sid); break;
    case 'release': game.release(sid); break;
    case 'open-unit': unitView = cls; unitNode = 'dmg'; render(); break;
    case 'units': unitView = null; render(); break;
    case 'unode': unitNode = arg as UnitNodeId; render(); break;
    case 'buy-node': game.buyNode(cls, arg as UnitNodeId, n || 1); break;
    case 'hire': game.hire(cls); break;
    case 'dismiss': game.dismiss(cls); break;
    case 'item': openItem(Number(arg)); break;
    case 'pick': openPicker(cls, arg as 'gun' | 'attach' | 'charm'); break;
    case 'equip-gun': closeModal(); game.equipGun(cls, Number(arg)); break;
    case 'equip-gear': closeModal(); game.equipGear(cls, d.slot as 'attach' | 'charm', arg === 'none' ? null : Number(arg)); break;
    case 'sell': closeModal(); { const v = game.sell(Number(arg)); if (v) toast(`<b>Sold</b><span>+${fmtLn(v.ln)} ${M.strainById(v.colour).dna} DNA</span>`, M.strainById(v.colour).color); } break;
    case 'autosell': game.setAutoSell(arg === 'off' ? null : (arg as AutoSell)); break;
    case 'sell-matching': { const n = game.sellMatching(); if (n) toast(`<b>Sold ${n} item${n > 1 ? 's' : ''}</b><span>DNA added</span>`, '#6fdc7a'); } break;
    case 'node': if (!view.dragged) { selectedNode = arg; render(); } break;
    case 'allocate': game.allocate(arg); break;
    case 'zoom': view.s = Math.max(0.35, Math.min(2.5, view.s * (arg === 'in' ? 1.25 : 0.8))); applyView(); break;
    case 'center': view.x = 0; view.y = 0; view.s = 0.6; applyView(); break;
    case 'horde': game.startHorde(); tab = null; render(); break;
    case 'toggle': game.s.autoHordeOn = !game.s.autoHordeOn; render(); break;
    case 'settings': openSettings(); break;
    case 'modal-close': closeModal(); break;
    case 'export': exportSave(); break;
    case 'import': importSave(); break;
    case 'reset': openModal(`<h3>Erase everything?</h3><p>This deletes your save on this device.</p><div class="row"><button class="btn ghost" data-action="modal-close">Cancel</button><button class="btn danger" data-action="reset-yes">Erase</button></div>`); break;
    case 'reset-yes': closeModal(); game.hardReset(); break;
    case 'sound': { const on = !(sfx.soundPrefs().sfx || sfx.soundPrefs().music); sfx.setSfx(on); sfx.setMusic(on); refresh(); break; }
    case 'sound-sfx': sfx.setSfx(!sfx.soundPrefs().sfx); openSettings(); break;
    case 'sound-music': sfx.setMusic(!sfx.soundPrefs().music); openSettings(); break;
  }
  // sound feedback: purchases make a "buy" sound if DNA was actually spent
  const after = M.STRAIN_IDS.reduce((x, c) => x + Math.exp(Math.min(700, game.dna(c))), 0);
  const paid = after < spent || (a === 'tier-up' && game.s.strains[sid].tier > tier0);
  if (quiet) { /* hold-to-repeat plays its own sounds */ }
  else if (a === 'tier-up') sfx.tierUp();
  else if (a === 'allocate') { if (paid) sfx.allocate(); }
  else if (a === 'sell' || a === 'sell-matching') sfx.buy();
  else if (['buy-node', 'hire', 'spawn', 'release'].includes(a)) { if (paid) sfx.buy(); else sfx.denied(); }
  else if (a.startsWith('equip')) sfx.equip();
  else if (a !== 'horde') sfx.click();
  // the tap is finished, so a re-render the action asked for can happen right now (no waiting)
  // (not while holding: the held button must stay in the page so the release is seen)
  if (!quiet && softTimer) { clearTimeout(softTimer); softTimer = 0; render(); }
  refresh();
  return paid;
}

// ---------- hold to repeat: press and hold a buy button for 1 s, then it buys again and again ----------
const REPEATABLE = new Set(['tier-up', 'spawn', 'buy-node', 'hire']);
const HOLD_MS = 1000;
let suppressClick = false;
let hold: { d: ActionData; timer: number; x: number; y: number; count: number } | null = null;
function holdRing() {
  let r = document.getElementById('hold-ring');
  if (!r) {
    r = document.createElement('div');
    r.id = 'hold-ring';
    r.innerHTML = '<svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"/><circle class="fg" cx="22" cy="22" r="18"/></svg><b></b>';
    document.body.appendChild(r);
  }
  return r;
}
function startHold(e: PointerEvent) {
  if (e.button > 0) return;
  const el = (e.target as Element).closest<HTMLElement>('button[data-action]');
  if (!el || (el as HTMLButtonElement).disabled || !REPEATABLE.has(el.dataset.action!)) return;
  stopHold();
  const ring = holdRing();
  ring.style.left = `${e.clientX}px`;
  ring.style.top = `${e.clientY}px`;
  ring.className = 'filling';
  ring.querySelector('b')!.textContent = '';
  hold = { d: { ...el.dataset } as ActionData, x: e.clientX, y: e.clientY, count: 0, timer: window.setTimeout(() => repeat(150), HOLD_MS) };
}
function repeat(delay: number) {
  if (!hold) return;
  suppressClick = true; // the release after a hold must not buy one more
  const ring = holdRing();
  ring.className = 'spinning';
  if (!act(hold.d, true)) { sfx.denied(); stopHold(); return; }
  hold.count++;
  ring.querySelector('b')!.textContent = `×${hold.count}`;
  if (hold.count % 2 === 1) sfx.buy();
  hold.timer = window.setTimeout(() => repeat(Math.max(45, delay * 0.88)), delay);
}
function stopHold() {
  if (hold) clearTimeout(hold.timer);
  hold = null;
  const r = document.getElementById('hold-ring');
  if (r) r.className = '';
}
function endHold() {
  const wasRepeating = suppressClick;
  const bought = hold?.count ?? 0;
  stopHold();
  if (bought) { if (softTimer) { clearTimeout(softTimer); softTimer = 0; } render(); }
  // a click normally follows the release; if it doesn't (the button was redrawn), stop suppressing soon after
  if (wasRepeating) setTimeout(() => { suppressClick = false; }, 60);
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
  const snd = sfx.soundPrefs();
  $('#hud-sound').textContent = snd.sfx || snd.music ? '🔊' : '🔇';
  const k = game.keepUp();
  const pill = $('#hud-keep');
  pill.className = `keep-pill ${k >= 1.1 ? 'ok' : k >= 0.9 ? 'warn' : 'bad'}`;
  pill.textContent = k >= 1.1 ? 'keeping up' : k >= 0.9 ? 'barely' : 'overrun';
  for (const b of document.querySelectorAll<HTMLElement>('#tabs [data-action="tab"]')) {
    b.classList.toggle('active', b.dataset.arg === tab);
    const badge = b.dataset.arg === 'tree' ? game.allocatableCount() > 0
      : b.dataset.arg === 'squad' ? game.s.newItems.length > 0 || game.owned.some((u) => game.nodesAffordable(u.cls) > 0)
      : b.dataset.arg === 'hordes' ? game.hordeOdds() >= 1 : false;
    b.classList.toggle('badge', badge);
  }
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-cost]')) el.disabled = !game.canAfford(el.dataset.col as StrainId, Number(el.dataset.cost));
  const kc = document.querySelector<HTMLElement>('.keep.sticky');
  if (kc) kc.outerHTML = keepCardHtml(k);
}

function render() {
  const panel = $('#panel');
  document.getElementById('app')!.classList.toggle('menu-open', !!tab);
  panel.hidden = !tab;
  if (!tab) { refresh(); return; }
  const body = $('#tab-body');
  const key = `${tab}:${tab === 'squad' ? unitView ?? '' : ''}`;
  const scroll = body.dataset.key === key ? body.scrollTop : 0;
  body.dataset.key = key;
  $('#panel-title').textContent = tab === 'squad' && unitView ? M.classById(unitView).plural : TITLES[tab];
  body.className = tab === 'tree' ? 'tree-mode' : '';
  body.innerHTML = tab === 'zombies' ? zombiesHtml() : tab === 'squad' ? (unitView ? unitScreenHtml(unitView) : squadHtml()) : tab === 'tree' ? treeHtml() : hordesHtml();
  if (tab === 'tree') bindTree(); else body.scrollTop = scroll;
  refresh();
}

// ---------- Zombies tab: one card per zombie type ----------
/** The keep-up meter, pinned to the top of the Zombies menu while you scroll (refresh() keeps it live). */
function keepCardHtml(k: number) {
  const cls = k >= 1.1 ? 'ok' : k >= 0.9 ? 'warn' : 'bad';
  return `<div class="card keep sticky ${cls}">
    <div class="keep-row"><b>${k >= 1.1 ? 'Keeping up' : k >= 0.9 ? 'Barely keeping up' : 'Zombies piling up'}</b><span class="keep-x">${fmtMult(k)}</span></div>
    <div class="meter"><i style="width:${Math.min(100, (k / 2) * 100)}%"></i><span class="mark"></span></div>
    <span class="sub small">${fmtNum(game.totalSpawnRate)} zombies/s arriving · the squad can handle ${fmtMult(k)} of that</span>
  </div>`;
}
function zombiesHtml() {
  const k = game.keepUp();
  const rates = game.lnDnaPerSec();
  const word = (k: number) => (k >= 1.1 ? '<i class="good">keeps up</i>' : k >= 0.9 ? '<i class="warn">barely</i>' : '<i class="bad">overrun</i>');
  const cards = M.STRAINS.map((st) => {
    const x = game.s.strains[st.id];
    if (!x.unlocked) {
      const u = st.unlock!;
      const fromOpen = game.s.strains[u.from].unlocked;
      return `<div class="srow locked" style="--dna:${st.color}">
        <img class="px face" src="${zombieIcon(st.id)}" alt="">
        <div class="s-info"><b>${st.plural}</b><span class="sub">${st.dna} DNA · ${st.hp}× HP · ${st.dnaMult}× DNA${st.speed > 1.2 ? ' · fast' : st.speed < 0.8 ? ' · slow' : ''}</span></div>
        <div class="s-btns">${fromOpen ? `<button class="btn sbtn" data-action="release" data-strain="${st.id}" ${costAttr(u.from, Math.log(u.cost))}><span>Release</span>${cost(u.from, Math.log(u.cost))}</button>`
          : `<span class="sub small lockmsg">🔒 Release ${M.strainById(u.from).plural} first</span>`}</div>
      </div>`;
    }
    const kT = game.keepUpIf(st.id, 'tier'), kS = game.keepUpIf(st.id, 'spawn');
    const free = x.tier < x.maxTier;
    return `<div class="srow" style="--dna:${st.color}">
      <img class="px face" src="${zombieIcon(st.id)}" alt="">
      <div class="s-info"><b>${st.plural}</b>
        <span class="sub">${vial(st.id)} +${fmtLn(rates[st.id])}/s · ${fmtLn(M.lnZombieHp(st.id, x.tier, x.spawn))} HP</span>
        <span class="sub small">Tier ${fmtInt(x.tier)}${free ? `/${fmtInt(x.maxTier)}` : ''} · Spawn ${x.spawn}/${C.spawnMax} (${fmtNum(M.spawnRate(st.id, x.spawn))}/s)</span></div>
      <div class="s-btns">
        <button class="btn sbtn" data-action="tier-up" data-strain="${st.id}" ${free ? '' : costAttr(st.id, game.tierCost(st.id))} title="Next tier: ×${C.R} DNA and ×${C.R} HP"><span>DNA +</span>${free ? '<span class="cost">free</span>' : cost(st.id, game.tierCost(st.id))}${word(kT)}</button>
        ${x.spawn < C.spawnMax ? `<button class="btn sbtn" data-action="spawn" data-strain="${st.id}" ${costAttr(st.id, game.spawnCost(st.id))} title="+12% ${st.plural}, each level +3% HP"><span>Spawn +</span>${cost(st.id, game.spawnCost(st.id))}${word(kS)}</button>`
          : '<button class="btn sbtn ghost" disabled><span>Spawn</span><span class="cost">max</span></button>'}
      </div>
    </div>`;
  }).join('');
  return `
  ${keepCardHtml(k)}
  <p class="sub">Each zombie type drops its own colour of DNA. Raise a type's <b>DNA</b> or <b>Spawn</b> to earn more of that colour; it also makes those zombies tougher.</p>
  <div class="srows">${cards}</div>
  <p class="sub small">DNA + raises that type's tier: ×${C.R} DNA and ×${C.R} HP. Spawn + brings 12% more of them, each level +3% HP. The word under each price is how your squad would cope after buying.</p>`;
}

// ---------- Squad tab: overview of unit types, plus the item stash ----------
function abilityPips(u: Unit) { const k = M.abilityStage(u); return `<span class="pips">${[1, 2, 3].map((i) => `<i class="${i <= k ? 'on' : ''}"></i>`).join('')}</span>`; }
function squadHtml() {
  const s = game.s;
  const cards = M.CLASSES.map((c) => {
    const u = game.unit(c.id);
    const open = game.classUnlocked(c.id);
    if (!open) return `<div class="ucard locked"><img class="px portrait" src="${classIcon(c.id)}" alt=""><div class="u-main"><b>${c.plural}</b><span class="sub">${c.gun}</span></div><span class="lock">🔒 Horde ${c.horde}</span></div>`;
    const full = u.count >= game.unitCap;
    const hc = game.hireCost(c.id), hcol = game.hireColour(c.id);
    const dn = game.node(c.id, 'dmg');
    return `<div class="ucard" style="--c1:${M.strainById(c.primary).color};--c2:${M.strainById(c.secondary).color}" title="Upgrades with ${M.strainById(c.primary).dna} and ${M.strainById(c.secondary).dna} DNA" data-action="open-unit" data-cls="${c.id}" role="button" tabindex="0">
      <img class="px portrait" src="${classIcon(c.id)}" alt="">
      <div class="u-main"><b>${c.plural}</b><span class="count">×${u.count}<small>/${game.unitCap}</small></span>
        <span class="sub">${u.count ? `${fmtLn(game.unitDps(u))} DPS · Dmg Lv ${M.nlv(u, 'dmg')}` : 'Not hired yet'}<span class="wide-only"> · ${c.ability.name}</span> ${abilityPips(u)}</span>
        </div>
      <div class="quick">
        ${full ? `<button class="btn sbtn ghost" disabled><span>Hire</span><span class="cost">${game.unitCap >= C.maxPerType ? 'full' : 'barracks full'}</span></button>` : `<button class="btn sbtn" data-action="hire" data-cls="${c.id}" ${costAttr(hcol, hc)}><span>Hire +1</span>${cost(hcol, hc)}</button>`}
        <button class="btn sbtn" data-action="buy-node" data-cls="${c.id}" data-arg="dmg" ${costAttr(dn.colour, dn.lnCost)}><span>Damage +</span>${cost(dn.colour, dn.lnCost)}</button>
      </div>
    </div>`;
  }).join('');
  const items = [...s.guns.map((g) => ({ uid: g.uid, icon: gunIcon(g.cls), rarity: g.rarity, label: `T${fmtInt(g.ilvl)}`, power: M.lnGunPower(g) })),
    ...s.gear.map((g) => ({ uid: g.uid, icon: g.kind === 'attach' ? modIcon(g.stat) : charmIcon(g.bane), rarity: g.rarity, label: g.kind === 'attach' ? g.stat.toUpperCase() : 'CHARM', power: g.value * 10 }))]
    .sort((a, b) => M.CONFIG.rarities.findIndex((r) => r.id === b.rarity) - M.CONFIG.rarities.findIndex((r) => r.id === a.rarity) || b.power - a.power);
  return `<p class="sub">Tap a unit type to open its own upgrade tree, gear and ability. Up to <b>${game.unitCap}</b> of each type for now (${C.maxPerType} max; barracks grow every ${C.tiersPerUnit} tiers).</p>
  <div class="grid2">${cards}</div>
  <h3>Items <small>${items.length}/60 · guns, attachments and charms (rare drops and horde rewards)</small></h3>
  ${autoSellHtml()}
  <div class="tiles">${items.map((it) => `<button class="tile" style="--rar:${RARITY_COLOR[it.rarity]}" data-action="item" data-arg="${it.uid}">
    <img class="px" src="${it.icon}" alt=""><span class="ilvl">${it.label}</span>${game.isEquipped(it.uid) ? '<span class="tag">IN USE</span>' : s.newItems.includes(it.uid) ? '<span class="tag new">NEW</span>' : ''}</button>`).join('')}</div>`;
}

function autoSellHtml() {
  const cur = game.s.autoSell;
  const opts: [string, string][] = [['off', 'Off'], ['common', 'Common'], ['uncommon', 'Uncommon'], ['rare', 'Rare'], ['epic', 'Epic'], ['best', 'Keep best']];
  const n = cur ? game.autoSellMatches().length : 0;
  return `<div class="card autosell"><div class="as-head"><b>Auto-sell drops</b><span class="sub small">${cur === 'best' ? 'Keeps what your units have equipped plus the best gun for each unit type, the best attachment of each stat and the best charm for each zombie type. Everything else is sold' : cur ? `Selling ${cur} and lower drops; upgrades are always kept` : 'Sell drops of a rarity and lower, or keep only the best of each kind'}. Horde rewards are never auto-sold.</span></div>
    <div class="seg">${opts.map(([id, label]) => `<button class="${(cur ?? 'off') === id ? 'on' : ''}" style="${id === 'off' ? '' : `--rar:${id === 'best' ? '#ffd34d' : RARITY_COLOR[id as M.RarityId]}`}" data-action="autosell" data-arg="${id}">${label}</button>`).join('')}</div>
    ${n ? `<button class="btn wide sm" data-action="sell-matching">Sell ${n} matching item${n > 1 ? 's' : ''} in the stash now</button>` : ''}</div>`;
}

// ---------- a unit type's own screen ----------
const UNODE_ICON: Record<UnitNodeId, string> = { dmg: 'dmg', spd: 'spd', range: 'range', crit: 'crit', critx: 'critdmg', attach: 'slot-mod', charm: 'slot-charm', ab1: '', ab2: '', ab3: '' };
function nodeEffect(u: Unit, id: UnitNodeId, lv: number): string {
  const c = M.classById(u.cls);
  switch (id) {
    case 'dmg': return `${fmtMult(Math.pow(C.dmgPerLevel, lv))} damage`;
    case 'spd': return `+${lv * 4}% attack speed`;
    case 'range': return `+${lv * 5}% range`;
    case 'crit': return `+${lv * 2}% crit chance`;
    case 'critx': return `+${lv * 10}% crit damage`;
    case 'attach': return lv ? 'Attachment slot open' : 'Opens an attachment slot';
    case 'charm': return lv ? 'Charm slot open' : 'Opens a charm slot';
    default: { const i = Number(id.slice(2)) - 1; return c.ability.stages[i]; }
  }
}
function unitScreenHtml(cls: ClassId) {
  const c = M.classById(cls), u = game.unit(cls);
  const cap = game.unitCap, full = u.count >= cap;
  const hc = game.hireCost(cls), hcol = game.hireColour(cls);
  const st = u.count ? game.stats(u) : null;
  const gun = game.gun(u.gun), att = game.gearItem(u.attach), ch = game.gearItem(u.charm);
  const slot = (kind: 'gun' | 'attach' | 'charm', label: string) => {
    const open = kind === 'gun' || M.nlv(u, kind);
    const it = kind === 'gun' ? gun : kind === 'attach' ? att : ch;
    if (!open) return `<div class="slot locked"><span class="lock">🔒</span><span>${label}</span><small>unlock in the tree</small></div>`;
    const icon = !it ? '' : kind === 'gun' ? gunIcon(cls) : (it as Gear).kind === 'attach' ? modIcon((it as M.Attachment).stat) : charmIcon((it as M.Charm).bane);
    const name = !it ? `No ${label.toLowerCase()}` : kind === 'gun' ? `${gunName(it as Gun)} · T${fmtInt((it as Gun).ilvl)}` : `${gearName(it as Gear)} · ${gearDesc(it as Gear)}`;
    return `<button class="slot" style="--rar:${it ? RARITY_COLOR[it.rarity] : '#555'}" data-action="pick" data-cls="${cls}" data-arg="${kind}">
      ${icon ? `<img class="px" src="${icon}" alt="">` : '<span class="plus">+</span>'}<span>${label}</span><small>${esc(name)}</small></button>`;
  };
  // the unit's tree: 3 columns × 4 rows with lines to prerequisites
  const ROW = 96;
  const pos = (n: M.UnitNodeDef) => ({ x: ((n.x + 0.5) / 3) * 100, y: n.y * ROW + 40 });
  const lines = M.UNIT_NODES.filter((n) => n.requires).map((n) => {
    const p = pos(M.unitNodeById(n.requires!)), q = pos(n);
    return `<line x1="${p.x}%" y1="${p.y}" x2="${q.x}%" y2="${q.y}" class="${M.nlv(u, n.requires!) ? 'on' : ''}"/>`;
  }).join('');
  const nodes = M.UNIT_NODES.map((n) => {
    const ns = game.node(cls, n.id), p = pos(n);
    const col = M.strainById(ns.colour).color;
    const label = n.kind === 'unlock' ? (ns.level ? '✓' : '') : n.kind === 'capped' ? `${ns.level}/${n.max}` : `Lv ${ns.level}`;
    const icon = n.id.startsWith('ab') ? classIcon(cls) : nodeIcon(UNODE_ICON[n.id]);
    return `<button class="un ${ns.maxed ? 'maxed' : ''} ${ns.locked ? 'locked' : ''} ${ns.canAfford ? 'afford' : ''} ${n.id === unitNode ? 'sel' : ''}" style="left:${p.x}%;top:${p.y}px;--dna:${col}" data-action="unode" data-arg="${n.id}">
      <span class="un-icon"><img class="px" src="${icon}" alt=""></span><span class="un-name">${n.id.startsWith('ab') ? `${c.ability.name} ${n.id.slice(2) === '1' ? 'I' : n.id.slice(2) === '2' ? 'II' : 'III'}` : n.name}</span><span class="un-lv">${label}</span></button>`;
  }).join('');
  const ns = game.node(cls, unitNode), def = ns.def;
  const now = nodeEffect(u, unitNode, ns.level), next = ns.maxed ? '' : nodeEffect(u, unitNode, ns.level + 1);
  const sheet = `<div class="tree-sheet" style="--c:${M.strainById(ns.colour).color}">
    <div><b>${def.id.startsWith('ab') ? `${c.ability.name} · stage ${def.id.slice(2)}` : def.name}</b> <small class="sub">${def.kind === 'ranked' ? 'endless' : def.kind === 'capped' ? `up to ${def.max}` : 'one-time'} · paid in ${vial(ns.colour)} ${M.strainById(ns.colour).dna} DNA</small></div>
    ${def.kind === 'unlock' ? `<p class="sub">${esc(next || now)}</p>` : `<p class="sub">Now: <b>${now}</b>${next ? ` → Next: <b class="good">${next}</b>` : ' · <span class="good">Maxed</span>'}</p>`}
    ${ns.maxed ? '<p class="good">✓ Done</p>' : ns.locked ? `<p class="sub">🔒 ${esc(ns.locked)}</p>` : `<div class="row">
      <button class="btn grow" data-action="buy-node" data-cls="${cls}" data-arg="${unitNode}" ${costAttr(ns.colour, ns.lnCost)}>${def.kind === 'unlock' ? 'Unlock' : 'Upgrade'} · ${cost(ns.colour, ns.lnCost)}</button>
      ${def.kind === 'unlock' ? '' : `<button class="btn ghost" data-action="buy-node" data-cls="${cls}" data-arg="${unitNode}" data-n="1000" ${costAttr(ns.colour, ns.lnCost)}>Max</button>`}</div>`}
  </div>`;
  return `<button class="btn ghost back" data-action="units">‹ All unit types</button>
  <div class="unit-head">
    <img class="px portrait big" src="${classIcon(cls)}" alt="">
    <div class="u-main"><b>${c.plural}</b><span class="count">×${u.count}<small>/${cap}</small></span>
      <span class="sub">${u.count ? `${fmtLn(game.unitDps(u))} DPS total · range ${Math.round(st!.range * 100)}% · ${fmtNum(st!.shotsPerSec)} shots/s · crit ${Math.round(st!.crit * 100)}% ×${st!.critDmg.toFixed(1)} · hits ${st!.targets}` : `${c.gun} · not hired yet`}</span></div>
    <div class="hire-btns">
      ${full ? `<button class="btn ghost" disabled>${cap >= C.maxPerType ? 'Full 20/20' : 'Barracks full'}</button>` : `<button class="btn" data-action="hire" data-cls="${cls}" ${costAttr(hcol, hc)}>Hire +1 · ${cost(hcol, hc)}</button>`}
      ${u.count > 1 ? `<button class="btn ghost sq" data-action="dismiss" data-cls="${cls}" aria-label="Dismiss one">−1</button>` : ''}
    </div>
  </div>
  <div class="unit-body">
    <div class="unit-side">
      <div class="slots3">${slot('gun', 'Gun')}${slot('attach', 'Attachment')}${slot('charm', 'Charm')}</div>
      <div class="card ability"><b>${c.ability.name}</b> ${abilityPips(u)}<ol>${c.ability.stages.map((t, i) => `<li class="${i < M.abilityStage(u) ? 'on' : ''}">${esc(t)}</li>`).join('')}</ol></div>
    </div>
    <div class="unit-tree">
      <h3>${c.name} upgrades <small>tap a node</small></h3>
      ${sheet}
      <div class="utree" style="height:${4 * ROW}px"><svg class="utree-lines" width="100%" height="${4 * ROW}">${lines}</svg>${nodes}</div>
    </div>
  </div>`;
}

function openPicker(cls: ClassId, kind: 'gun' | 'attach' | 'charm') {
  const u = game.unit(cls), c = M.classById(cls);
  if (kind === 'gun') {
    const cur = game.gun(u.gun);
    const opts = game.s.guns.filter((g) => g.cls === cls && g.uid !== u.gun).sort((a, b) => M.lnGunPower(b) - M.lnGunPower(a));
    openModal(`<h3>${c.plural}' gun</h3><p class="sub">Every ${c.name} carries the same issued gun.</p>
      <div class="picks">${opts.map((g) => { const r = cur ? Math.exp(M.lnGunPower(g) - M.lnGunPower(cur)) : 2;
        return `<div class="pick" style="--rar:${RARITY_COLOR[g.rarity]}"><img class="px" src="${gunIcon(cls)}" alt=""><div><b style="color:${RARITY_COLOR[g.rarity]}">${gunName(g)}</b><span class="sub">tier ${fmtInt(g.ilvl)} · <span class="${r > 1.005 ? 'good' : 'bad'}">${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)}% damage</span></span></div>
        <button class="btn sm" data-action="equip-gun" data-cls="${cls}" data-arg="${g.uid}">Issue</button></div>`; }).join('') || `<p class="sub">No other ${c.gun}s yet. They drop rarely from zombies; hordes always give one.</p>`}</div>
      <div class="row"><button class="btn ghost" data-action="modal-close">Close</button></div>`);
    return;
  }
  const cur = u[kind];
  const opts = game.s.gear.filter((g) => g.kind === kind).sort((a, b) => b.value - a.value);
  openModal(`<h3>${c.plural}' ${kind === 'attach' ? 'attachment' : 'charm'}</h3>
    <div class="picks">${opts.map((g) => { const on = Object.values(game.s.units).find((o) => o[kind] === g.uid);
      return `<div class="pick" style="--rar:${RARITY_COLOR[g.rarity]}"><img class="px" src="${g.kind === 'attach' ? modIcon(g.stat) : charmIcon(g.bane)}" alt=""><div><b style="color:${RARITY_COLOR[g.rarity]}">${gearName(g)}</b><span class="sub">${gearDesc(g)}${on && on.cls !== cls ? ` · on ${M.classById(on.cls).plural}` : ''}</span></div>
      <button class="btn sm" data-action="equip-gear" data-cls="${cls}" data-slot="${kind}" data-arg="${g.uid}" ${g.uid === cur ? 'disabled' : ''}>${g.uid === cur ? 'Equipped' : 'Equip'}</button></div>`; }).join('') || '<p class="sub">None yet. Attachments and charms are rare drops.</p>'}</div>
    <div class="row">${cur != null ? `<button class="btn ghost" data-action="equip-gear" data-cls="${cls}" data-slot="${kind}" data-arg="none">Remove</button>` : ''}<button class="btn ghost" data-action="modal-close">Close</button></div>`);
}
function sellBtn(uid: number) {
  const v = game.sellValue(uid);
  if (!v || game.isEquipped(uid)) return '<button class="btn ghost" disabled>In use</button>';
  return `<button class="btn ghost" data-action="sell" data-arg="${uid}">Sell · ${cost(v.colour, v.ln)}</button>`;
}
function openItem(uid: number) {
  const g = game.gun(uid), gear = game.gearItem(uid);
  if (g) {
    const c = M.classById(g.cls), u = game.unit(g.cls), cur = game.gun(u.gun), issued = u.gun === uid;
    const r = cur && !issued ? Math.exp(M.lnGunPower(g) - M.lnGunPower(cur)) : 1;
    openModal(`<div class="item-head"><img class="px big" src="${gunIcon(g.cls)}" alt=""><div><h3 style="color:${RARITY_COLOR[g.rarity]}">${gunName(g)}</h3><p class="sub">Tier ${fmtInt(g.ilvl)} · for ${c.plural}</p></div></div>
      <div class="give">${u.count ? `<button class="btn" data-action="equip-gun" data-cls="${g.cls}" data-arg="${uid}" ${issued ? 'disabled' : ''}>${issued ? `Issued to your ${c.plural}` : `Issue to all ${c.plural} (${r >= 1 ? '+' : ''}${Math.round((r - 1) * 100)}% damage)`}</button>` : `<p class="sub">Hire a ${c.name} to use this gun.</p>`}</div>
      <div class="row">${sellBtn(uid)}<button class="btn ghost" data-action="modal-close">Close</button></div>`);
    return;
  }
  if (!gear) return;
  const slot = gear.kind;
  const users = game.owned.filter((u) => M.nlv(u, slot));
  openModal(`<div class="item-head"><img class="px big" src="${gear.kind === 'attach' ? modIcon(gear.stat) : charmIcon(gear.bane)}" alt=""><div><h3 style="color:${RARITY_COLOR[gear.rarity]}">${gearName(gear)}</h3><p class="sub">${gearDesc(gear)} · fits any unit type with ${slot === 'attach' ? 'an attachment' : 'a charm'} slot</p></div></div>
    <div class="give">${users.map((u) => `<button class="btn ${u[slot] === uid ? 'ghost' : ''}" data-action="equip-gear" data-cls="${u.cls}" data-slot="${slot}" data-arg="${uid}" ${u[slot] === uid ? 'disabled' : ''}>${u[slot] === uid ? `On ${M.classById(u.cls).plural}` : `Give to ${M.classById(u.cls).plural}`}</button>`).join('') || `<p class="sub">Unlock ${slot === 'attach' ? 'an Attachment' : 'a Charm'} Slot in a unit type's tree first.</p>`}</div>
    <div class="row">${sellBtn(uid)}<button class="btn ghost" data-action="modal-close">Close</button></div>`);
}

// ---------- Tree tab (POE-style web with pan / pinch zoom) ----------
function treeHtml() {
  const alloc = new Set(game.s.alloc);
  const has = (id: string) => id === 'start' || alloc.has(id);
  const edges: string[] = [];
  const seen = new Set<string>();
  for (const n of TREE) for (const l of n.links) {
    const key = [n.id, l].sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const o = treeNode(l);
    const on = has(n.id) && has(l);
    const col = on ? REGIONS[Math.max(n.region, o.region)]?.color ?? '#c8b070' : '#3a3d36';
    edges.push(`<line x1="${n.x}" y1="${n.y}" x2="${o.x}" y2="${o.y}" stroke="${col}" stroke-width="${on ? 6 : 4}"/>`);
  }
  const R = { start: 26, keystone: 22, notable: 15, small: 9 };
  const nodes = TREE.map((n) => {
    const col = n.region < 0 ? '#c8b070' : REGIONS[n.region].color;
    const state = has(n.id) ? 'on' : game.canAllocate(n.id) ? 'can' : game.regionOpen(n.region) ? 'off' : 'locked';
    const r = R[n.size];
    const shape = n.size === 'keystone'
      ? `<polygon points="${[0, 1, 2, 3, 4, 5].map((i) => `${n.x + r * Math.cos((Math.PI / 3) * i)},${n.y + r * Math.sin((Math.PI / 3) * i)}`).join(' ')}"/>`
      : `<circle cx="${n.x}" cy="${n.y}" r="${r}"/>`;
    return `<g class="tn ${state} ${n.size} ${n.id === selectedNode ? 'sel' : ''}" style="--c:${col}" data-action="node" data-arg="${n.id}">${shape}<circle class="hit" cx="${n.x}" cy="${n.y}" r="${Math.max(r, 20)}"/></g>`;
  }).join('');
  const labels = REGIONS.map((reg, i) => {
    const k = treeNode(`r${i}.k`);
    const open = game.regionOpen(i);
    return `<text x="${k.x * 1.17}" y="${k.y * 1.17 + 5}" class="rlabel ${open ? '' : 'locked'}" fill="${reg.color}">${open ? reg.name : `🔒 ${reg.name} · Horde ${reg.horde}`}</text>`;
  }).join('');
  const sel = treeNode(selectedNode);
  const col = game.treeColour(sel.id);
  const selState = sel.id === 'start' || alloc.has(sel.id) ? 'Allocated' : !game.regionOpen(sel.region) ? `Locked: beat Horde ${REGIONS[sel.region].horde} (${M.hordeDef(REGIONS[sel.region].horde).name}) to open ${REGIONS[sel.region].name}.` : !game.s.strains[col].unlocked ? `Paid in ${M.strainById(col).dna} DNA: release ${M.strainById(col).plural} first.` : game.canAllocate(sel.id) ? '' : 'Allocate a connected passive first.';
  return `
  <div class="tree-top"><span><b>${game.s.alloc.length}</b> passives · each region is paid in its own DNA colour</span>
    <span class="tree-ctl"><button class="icon-btn" data-action="zoom" data-arg="out" aria-label="Zoom out">−</button><button class="icon-btn" data-action="zoom" data-arg="in" aria-label="Zoom in">+</button><button class="icon-btn" data-action="center" aria-label="Recenter">◎</button></span></div>
  <div class="tree-view" id="tree-view"><svg id="tree-svg" width="100%" height="100%"><g id="tree-g">${edges.join('')}${nodes}${labels}</g></svg></div>
  <div class="tree-sheet" style="--c:${sel.region < 0 ? '#c8b070' : REGIONS[sel.region].color}">
    <div><b>${esc(sel.name)}</b> <small class="sub">${sel.size === 'start' ? '' : `${sel.size} · ${REGIONS[sel.region].name}`}</small></div>
    <p class="sub">${esc(sel.desc)}</p>
    ${selState ? `<p class="${selState === 'Allocated' ? 'good' : 'sub'}">${selState}</p>` : `<button class="btn wide" data-action="allocate" data-arg="${sel.id}" ${costAttr(col, game.treeCost())}>Allocate · ${cost(col, game.treeCost())}</button>`}
  </div>`;
}

// ---------- Hordes tab ----------
function hordesHtml() {
  const next = game.nextHorde;
  const all = Array.from({ length: Math.max(8, next + 2) }, (_, i) => i + 1).filter((k) => k <= 7 || k <= next + 1);
  const list = [...all.filter((k) => k >= next), ...all.filter((k) => k < next).reverse()];
  return `<p class="sub">Hordes are optional fights: ${C.hordeZombies} zombies and a <b>boss</b> in ${C.hordeTimerSec} seconds. The stream pauses while you fight. You lose if time runs out, the boss reaches the shredder, or ${C.breachLimit} horde zombies break through. Losing costs nothing; winning unlocks a new unit type and tree region.</p>
  ${game.fx.autoHorde ? `<label class="switch"><input type="checkbox" data-action="toggle" ${game.s.autoHordeOn ? 'checked' : ''}> War Drums: start the next horde automatically when your squad should win</label>` : ''}
  <div class="grid2">${list.map((k) => {
    const h = M.hordeDef(k);
    const beaten = k < next, isNext = k === next;
    const odds = isNext ? game.hordeOdds() : 0;
    const mix = M.hordeMix(k);
    return `<div class="horde ${beaten ? 'beaten' : isNext ? 'next' : 'locked'}">
      <div class="h-head"><b>${k}. ${esc(h.name)}</b><span class="tier">Tier ${h.tier}</span></div>
      <div class="h-faces">${mix.map((id) => `<img class="px" src="${zombieIcon(id)}" alt="${M.strainById(id).name}">`).join('')}</div>
      <p class="sub small">Boss: a giant ${M.strainById(M.hordeBoss(k)).name} with ×${C.bossHpMult} HP</p>
      <p class="sub">Reward: <b>${esc(h.unlocks)}</b>${h.cls ? ` · a rare+ ${M.classById(h.cls).gun}` : ''}</p>
      ${beaten ? '<p class="good">✓ Beaten</p>' : isNext ? `
        <div class="meter small"><i style="width:${Math.min(100, (odds / 2) * 100)}%"></i><span class="mark"></span></div>
        <p class="sub small">${odds >= 1.1 ? '<span class="good">Your squad should win.</span>' : odds >= 0.9 ? '<span class="warn">It will be close.</span>' : `<span class="bad">Too strong: you need ${fmtMult(1 / Math.max(odds, 1e-9))} more firepower.</span>`}</p>
        <button class="btn wide call" data-action="horde">Start Horde ${k}</button>` : '<p class="sub small">🔒 Beat the previous horde first.</p>'}
    </div>`;
  }).join('')}</div>`;
}

function applyView() {
  const g = document.getElementById('tree-g');
  const v = document.getElementById('tree-view');
  if (!g || !v) return;
  const { width, height } = v.getBoundingClientRect();
  g.setAttribute('transform', `translate(${width / 2 + view.x},${height / 2 + view.y}) scale(${view.s})`);
}
function bindTree() {
  const v = document.getElementById('tree-view')!;
  applyView();
  const pts = new Map<number, { x: number; y: number }>();
  let start = { x: 0, y: 0, d: 0, s: 1, vx: 0, vy: 0 };
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  v.addEventListener('pointerdown', (e) => {
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // Don't capture the pointer yet: capturing on press would retarget the click away from the node you pressed
    // (that broke tapping nodes with a mouse). Capture only once the press turns into a drag.
    view.dragged = false;
    start = { x: e.clientX, y: e.clientY, d: pts.size === 2 ? dist() : 0, s: view.s, vx: view.x, vy: view.y };
  });
  v.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2 && start.d) {
      view.s = Math.max(0.35, Math.min(2.5, start.s * (dist() / start.d)));
      view.dragged = true;
    } else if (pts.size === 1) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!view.dragged && Math.hypot(dx, dy) > 6) { view.dragged = true; try { v.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
      view.x = start.vx + dx; view.y = start.vy + dy;
    }
    applyView();
  });
  const up = (e: PointerEvent) => {
    pts.delete(e.pointerId);
    if (pts.size === 1) { const [p] = [...pts.values()]; start = { x: p.x, y: p.y, d: 0, s: view.s, vx: view.x, vy: view.y }; }
    setTimeout(() => { if (!pts.size) view.dragged = false; }, 50);
  };
  v.addEventListener('pointerup', up);
  v.addEventListener('pointercancel', up);
  v.addEventListener('wheel', (e) => { e.preventDefault(); view.s = Math.max(0.35, Math.min(2.5, view.s * (e.deltaY < 0 ? 1.1 : 0.9))); applyView(); }, { passive: false });
}


function openModal(html: string) { const m = $('#modal'); m.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true">${html}</div>`; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; }
function openSettings() {
  const snd = sfx.soundPrefs();
  openModal(`<h3>Settings</h3>
    <div class="row"><button class="btn ${snd.sfx ? '' : 'ghost'} grow" data-action="sound-sfx">Sound effects: ${snd.sfx ? 'On' : 'Off'}</button>
      <button class="btn ${snd.music ? '' : 'ghost'} grow" data-action="sound-music">Music: ${snd.music ? 'On' : 'Off'}</button></div>
    <p class="sub">The game saves on this device automatically. Export a code to move your save between devices.</p>
    <div class="row"><button class="btn" data-action="export">Export save</button><button class="btn" data-action="import">Import save</button></div>
    <div class="row"><button class="btn danger" data-action="reset">Erase progress</button><button class="btn ghost" data-action="modal-close">Close</button></div>
    <p class="sub small">${fmtInt(game.s.kills)} zombies shredded · ${game.s.hordes} hordes beaten</p>`);
}
function exportSave() {
  const code = game.exportSave();
  openModal(`<h3>Your save code</h3><textarea readonly class="code">${code}</textarea><div class="row"><button class="btn" id="copy-save">Copy</button><button class="btn ghost" data-action="modal-close">Close</button></div>`);
  $('#copy-save').onclick = () => { navigator.clipboard?.writeText(code).then(() => { $('#copy-save').textContent = 'Copied'; }).catch(() => $<HTMLTextAreaElement>('textarea.code').select()); };
}
function importSave() {
  openModal(`<h3>Import save</h3><textarea class="code" id="import-code" placeholder="Paste your save code"></textarea><div class="row"><button class="btn ghost" data-action="modal-close">Cancel</button><button class="btn" id="do-import">Import</button></div>`);
  $('#do-import').onclick = () => { try { game.importSave($<HTMLTextAreaElement>('#import-code').value); closeModal(); } catch { $('#do-import').textContent = 'Invalid code'; } };
}
export function showOfflineReport(r: OfflineReport) {
  const h = Math.floor(r.seconds / 3600), m = Math.floor((r.seconds % 3600) / 60);
  const dna = M.STRAIN_IDS.filter((c) => r.dna[c] > -Infinity && Number.isFinite(r.dna[c])).map((c) => `<div><span>${vial(c)} ${M.strainById(c).dna}</span><b>+${fmtLn(r.dna[c])}</b></div>`).join('');
  openModal(`<h3>While you were away</h3><p class="sub">${h ? `${h}h ` : ''}${m}m of shredding</p>
    <div class="offline">
      <div><span>Zombies</span><b>${fmtInt(r.kills)}</b></div>
      <div><span>Items kept</span><b>${r.items}</b></div>
      ${r.sold ? `<div><span>Items auto-sold</span><b>${r.sold}</b></div>` : ''}
      ${dna}
    </div>
    <button class="btn wide" data-action="modal-close">Collect</button>`);
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
