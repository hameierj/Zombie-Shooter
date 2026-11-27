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

/** Player option: show the keep-up meter and hints (off by default, so players read the battlefield instead). */
const KEEP_PREF = 'zombie-idle-show-keepup';
function showKeep(): boolean { try { return localStorage.getItem(KEEP_PREF) === '1'; } catch { return false; } }
function setShowKeep(on: boolean) { try { localStorage.setItem(KEEP_PREF, on ? '1' : '0'); } catch { /* storage blocked */ } }

/** The open menu, or null when the full-screen zombie map is showing. */
let tab: Tab | null = null;
const TITLES: Record<Tab, string> = { zombies: 'Zombies', squad: 'Squad', tree: 'Upgrade Trees', hordes: 'Hordes' };
let unitView: ClassId | null = null;     // the unit type whose own screen is open inside the Squad tab
let unitNode: UnitNodeId = 'dmg';
/** Which tree the Tree tab shows: the global passive web or one unit type's own tree. */
let treeView: 'global' | ClassId = 'global';
/** Global tree layout: an easy list (default) or the pan/zoom web. Remembered on the device. */
let treeMode: 'list' | 'web' = (() => { try { return localStorage.getItem('zombie-idle-tree-mode') === 'web' ? 'web' : 'list'; } catch { return 'list'; } })();
const openRegions = new Set<number>();
let selectedNode = 'start';
let lastPointer = 0;
let pointerDown = 0;
let softTimer = 0;
const view = { x: 0, y: 0, s: 0.6, dragged: false };

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
      // from a sub-screen (a unit type's tree), the tab button goes back to that tab's overview;
      // from the overview it collapses the menu to the map; from the map it opens the overview
      if (tab === arg && arg === 'squad' && unitView) unitView = null;
      else if (tab === arg && arg === 'tree' && treeView !== 'global') treeView = 'global';
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
    case 'tree-mode': treeMode = arg === 'web' ? 'web' : 'list'; try { localStorage.setItem('zombie-idle-tree-mode', treeMode); } catch { /* ignore */ } render(); break;
    case 'region': { const r = Number(arg); if (openRegions.has(r)) openRegions.delete(r); else openRegions.add(r); render(); break; }
    case 'goto-unit': tab = 'squad'; unitView = cls; render(); break;
    case 'treeview': treeView = arg as 'global' | ClassId; if (treeView !== 'global') unitNode = 'dmg'; render(); break;
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
    case 'keep-pref': setShowKeep(!showKeep()); openSettings(); render(); break;
  }
  // sound feedback: purchases make a "buy" sound if DNA was actually spent
  const after = M.STRAIN_IDS.reduce((x, c) => x + Math.exp(Math.min(700, game.dna(c))), 0);
  const paid = after < spent || (a === 'tier-up' && game.s.strains[sid].tier > tier0);
  if (a === 'tier-up') sfx.tierUp();
  else if (a === 'allocate') { if (paid) sfx.allocate(); }
  else if (a === 'sell' || a === 'sell-matching') sfx.buy();
  else if (['buy-node', 'hire', 'spawn', 'release'].includes(a)) { if (paid) sfx.buy(); else sfx.denied(); }
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
  const snd = sfx.soundPrefs();
  const on = snd.sfx || snd.music;
  const sb = $('#hud-sound');
  if (sb.dataset.on !== String(on)) {
    sb.dataset.on = String(on);
    sb.innerHTML = `<svg viewBox="0 0 24 24"><path class="f" d="M4 9.5h3.4L12 5.5v13l-4.6-4H4z"/>${on ? '<path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.6 7.6 0 0 1 0 11"/>' : '<path d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>'}</svg>`;
  }
  const k = game.keepUp();
  const pill = $('#hud-keep');
  pill.hidden = !showKeep();
  pill.className = `keep-pill ${k >= 1.1 ? 'ok' : k >= 0.9 ? 'warn' : 'bad'}`;
  pill.textContent = k >= 1.1 ? 'keeping up' : k >= 0.9 ? 'barely' : 'overrun';
  for (const b of document.querySelectorAll<HTMLElement>('#tabs [data-action="tab"]')) {
    b.classList.toggle('active', b.dataset.arg === tab);
    const badge = b.dataset.arg === 'tree' ? game.allocatableCount() > 0 || game.owned.some((u) => game.nodesAffordable(u.cls) > 0)
      : b.dataset.arg === 'squad' ? game.s.newItems.length > 0
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
  const key = `${tab}:${tab === 'squad' ? unitView ?? '' : tab === 'tree' ? treeView : ''}`;
  const scroll = body.dataset.key === key ? body.scrollTop : 0;
  body.dataset.key = key;
  $('#panel-title').textContent = tab === 'squad' && unitView ? M.classById(unitView).plural : TITLES[tab];
  body.className = tab === 'tree' && treeView === 'global' && treeMode === 'web' ? 'tree-mode' : '';
  body.innerHTML = tab === 'zombies' ? zombiesHtml() : tab === 'squad' ? (unitView ? unitScreenHtml(unitView) : squadHtml()) : tab === 'tree' ? treeTabHtml() : hordesHtml();
  if (tab === 'tree' && treeView === 'global' && treeMode === 'web') bindTree(); else body.scrollTop = scroll;
  refresh();
}

// ---------- Zombies tab: one card per zombie type ----------
/** The keep-up meter, pinned to the top of the Zombies menu while you scroll (refresh() keeps it live). */
function keepCardHtml(k: number) {
  if (!showKeep()) return '';
  const cls = k >= 1.1 ? 'ok' : k >= 0.9 ? 'warn' : 'bad';
  return `<div class="keep sticky slim ${cls}" title="${fmtNum(game.totalSpawnRate)} zombies/s arriving · the squad can handle ${fmtMult(k)} of that">
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
      const fromOpen = game.s.strains[u.from].unlocked, pc = M.familyOf(u.from);
      return `<div class="srow locked" style="--dna:${st.color}">
        <img class="px face" src="${zombieIcon(st.id)}" alt="">
        <div class="s-info"><b>${st.plural}</b><span class="sub">${traits(st)}</span></div>
        <div class="s-btns">${fromOpen ? `<button class="btn sbtn" data-action="release" data-strain="${st.id}" ${costAttr(pc, Math.log(u.cost))}><span>Release</span>${cost(pc, Math.log(u.cost))}</button>`
          : `<span class="sub small lockmsg">🔒 Release ${M.strainById(u.from).plural} first</span>`}</div>
      </div>`;
    }
    const kT = game.keepUpIf(st.id, 'tier'), kS = game.keepUpIf(st.id, 'spawn');
    const free = x.tier < x.maxTier;
    const lnRate = Math.log(M.spawnRate(st.id, x.spawn) * f) + M.lnDnaPerKill(st.id, x.tier, game.fx);
    return `<div class="srow" style="--dna:${st.color}">
      <img class="px face" src="${zombieIcon(st.id)}" alt="">
      <div class="s-info"><b>${st.plural}</b>
        <span class="sub">${vial(col)} +${fmtLn(lnRate)}/s · ${fmtLn(M.lnZombieHp(st.id, x.tier, x.spawn))} HP</span>
        <span class="sub small">Tier ${fmtInt(x.tier)}${free ? `/${fmtInt(x.maxTier)}` : ''} · Spawn ${x.spawn}/${C.spawnMax} (${fmtNum(M.spawnRate(st.id, x.spawn))}/s)${varietyText(x.tier)}</span></div>
      <div class="s-btns">
        <button class="btn sbtn" data-action="tier-up" data-strain="${st.id}" ${free ? '' : costAttr(col, game.tierCost(st.id))} title="Next tier: ×${C.R} DNA and ×${C.R} HP"><span>DNA +</span>${free ? '<span class="cost">free</span>' : cost(col, game.tierCost(st.id))}${word(kT)}</button>
        ${x.spawn < C.spawnMax ? `<button class="btn sbtn" data-action="spawn" data-strain="${st.id}" ${costAttr(col, game.spawnCost(st.id))} title="+12% ${st.plural}, each level +3% HP"><span>Spawn +</span>${cost(col, game.spawnCost(st.id))}${word(kS)}</button>`
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
  ${keepCardHtml(k)}
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
        <span class="sub">${u.count ? `Lv ${M.nlv(u, 'dmg')} · ${fmtLn(game.unitDps(u))} DPS` : 'Not hired yet'}</span>
        </div>
      <div class="quick">
        ${full ? `<button class="btn sbtn ghost" disabled><span>Hire</span><span class="cost">${game.unitCap >= C.maxPerType ? 'full' : 'barracks full'}</span></button>` : `<button class="btn sbtn" data-action="hire" data-cls="${c.id}" ${costAttr(hcol, hc)}><span>Hire +1</span>${cost(hcol, hc)}</button>`}
        ${u.count ? `<button class="btn sbtn" data-action="buy-node" data-cls="${c.id}" data-arg="dmg" ${dn.locked ? 'disabled' : costAttr(dn.colour, dn.lnCost)}><span>Damage +</span>${cost(dn.colour, dn.lnCost)}</button>` : ''}
      </div>
    </div>`;
  }).join('');
  const items = [...s.guns.map((g) => ({ uid: g.uid, icon: gunIcon(g.cls), rarity: g.rarity, label: `T${fmtInt(g.ilvl)}`, power: M.lnGunPower(g) })),
    ...s.gear.map((g) => ({ uid: g.uid, icon: g.kind === 'attach' ? modIcon(g.stat) : charmIcon(g.bane), rarity: g.rarity, label: g.kind === 'attach' ? g.stat.toUpperCase() : 'CHARM', power: g.value * 10 }))]
    .sort((a, b) => M.CONFIG.rarities.findIndex((r) => r.id === b.rarity) - M.CONFIG.rarities.findIndex((r) => r.id === a.rarity) || b.power - a.power);
  return `${keepCardHtml(game.keepUp())}<p class="sub">Tap a unit type for its gear, ability and upgrades. Every unit's upgrade tree is also on the <b>Tree</b> tab. Up to <b>${game.unitCap}</b> of each type for now (${C.maxPerType} max; barracks grow every ${C.tiersPerUnit} tiers).</p>
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
/** A unit type's upgrade tree as tap-friendly rows: icon, level, now → next, and the buy buttons right on the row. */
function unitTreeBlock(cls: ClassId) {
  const c = M.classById(cls), u = game.unit(cls);
  const order = [...M.UNIT_NODES].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = order.map((n) => {
    const ns = game.node(cls, n.id);
    const col = M.strainById(ns.colour).color;
    const icon = n.id.startsWith('ab') ? classIcon(cls) : nodeIcon(UNODE_ICON[n.id]);
    const name = n.id.startsWith('ab') ? `${c.ability.name} ${['I', 'II', 'III'][Number(n.id.slice(2)) - 1]}` : n.name;
    const lv = n.kind === 'unlock' ? '' : n.kind === 'capped' ? `${ns.level}/${n.max}` : `Lv ${ns.level}`;
    const now = nodeEffect(u, n.id, ns.level), next = ns.maxed ? '' : nodeEffect(u, n.id, ns.level + 1);
    const effect = n.kind === 'unlock' ? esc(next || now) : next ? `${now} → <b class="good">${next}</b>` : `${now}`;
    const right = ns.maxed ? '<span class="pstate good">✓ Max</span>'
      : ns.locked ? `<span class="pstate sub small">🔒 ${esc(ns.locked)}</span>`
      : `<div class="ubtns"><button class="btn sbtn" data-action="buy-node" data-cls="${cls}" data-arg="${n.id}" ${costAttr(ns.colour, ns.lnCost)}><span>${n.kind === 'unlock' ? 'Unlock' : 'Upgrade'}</span>${cost(ns.colour, ns.lnCost)}</button>${
        n.kind === 'unlock' ? '' : `<button class="btn ghost sbtn max" data-action="buy-node" data-cls="${cls}" data-arg="${n.id}" data-n="1000" ${costAttr(ns.colour, ns.lnCost)}>Max</button>`}</div>`;
    return `<div class="urow ${ns.maxed ? 'maxed' : ''} ${ns.locked ? 'locked' : ''} ${ns.canAfford ? 'afford' : ''}" style="--dna:${col}">
      <span class="un-icon"><img class="px" src="${icon}" alt=""></span>
      <div class="uinfo"><b>${name}</b> <span class="lv">${lv}</span><span class="sub small">${effect}</span></div>${right}</div>`;
  }).join('');
  return `<div class="unit-tree"><h3>${c.name} upgrades <small>top half ${vial(c.primary)} · bottom half ${vial(c.secondary)}</small></h3><div class="urows">${rows}</div></div>`;
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
    if (!u.count) return `<div class="slot locked"><span class="lock">🔒</span><span>${label}</span><small>hire one first</small></div>`;
    if (!open) return `<div class="slot locked"><span class="lock">🔒</span><span>${label}</span><small>unlock in the tree</small></div>`;
    const icon = !it ? '' : kind === 'gun' ? gunIcon(cls) : (it as Gear).kind === 'attach' ? modIcon((it as M.Attachment).stat) : charmIcon((it as M.Charm).bane);
    const name = !it ? `No ${label.toLowerCase()}` : kind === 'gun' ? `${gunName(it as Gun)} · T${fmtInt((it as Gun).ilvl)}` : `${gearName(it as Gear)} · ${gearDesc(it as Gear)}`;
    return `<button class="slot" style="--rar:${it ? RARITY_COLOR[it.rarity] : '#555'}" data-action="pick" data-cls="${cls}" data-arg="${kind}">
      ${icon ? `<img class="px" src="${icon}" alt="">` : '<span class="plus">+</span>'}<span>${label}</span><small>${esc(name)}</small></button>`;
  };
  return `${keepCardHtml(game.keepUp())}<button class="btn ghost back" data-action="units">‹ All unit types</button>
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
    ${unitTreeBlock(cls)}
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

// ---------- Tree tab: sub-tabs for the global passive web and every unit type's own tree ----------
function treeTabsHtml() {
  const units = M.CLASSES.filter((c) => game.classUnlocked(c.id));
  const chip = (id: string, label: string, icon: string, dot: boolean) =>
    `<button class="tchip ${treeView === id ? 'on' : ''}" data-action="treeview" data-arg="${id}">${icon}<span>${label}</span>${dot ? '<i></i>' : ''}</button>`;
  return `<div class="tree-tabs">${chip('global', 'Global', '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><circle cx="12" cy="13" r="2"/><path d="M12 7.4v3.6M10.4 14.4l-3.6 2.2M13.6 14.4l3.6 2.2"/></svg>', game.allocatableCount() > 0)}${
    units.map((c) => chip(c.id, c.plural, `<img class="px" src="${classIcon(c.id)}" alt="">`, game.nodesAffordable(c.id) > 0)).join('')}</div>`;
}
function treeTabHtml() {
  if (treeView !== 'global' && !game.classUnlocked(treeView)) treeView = 'global';
  if (treeView === 'global') return treeTabsHtml() + (treeMode === 'web' ? treeHtml() : treeListHtml());
  const cls = treeView, c = M.classById(cls), u = game.unit(cls);
  return `${treeTabsHtml()}
  <div class="tree-unit-head"><img class="px portrait" src="${classIcon(cls)}" alt=""><div><b>${c.plural} ×${u.count}</b><span class="sub small">${u.count ? `Lv ${M.nlv(u, 'dmg')} · ${fmtLn(game.unitDps(u))} DPS · ${c.ability.name} ${abilityPips(u)}` : 'Not hired yet: hire one on the Squad tab'}</span></div>
    <button class="btn ghost sm" data-action="goto-unit" data-cls="${cls}">Gear ›</button></div>
  ${unitTreeBlock(cls)}`;
}

const modeToggle = () => `<div class="seg2"><button class="${treeMode === 'list' ? 'on' : ''}" data-action="tree-mode" data-arg="list">List</button><button class="${treeMode === 'web' ? 'on' : ''}" data-action="tree-mode" data-arg="web">Web</button></div>`;
let treeDist: Map<string, number> | null = null;
/** Steps from the Command Post, to list each region's passives in the order you'd reach them. */
function distFromStart() {
  if (treeDist) return treeDist;
  treeDist = new Map([['start', 0]]);
  const q = ['start'];
  while (q.length) { const id = q.shift()!; for (const l of treeNode(id).links) if (!treeDist.has(l)) { treeDist.set(l, treeDist.get(id)! + 1); q.push(l); } }
  return treeDist;
}
function passiveRow(n: (typeof TREE)[number]) {
  const has = game.s.alloc.includes(n.id), can = game.canAllocate(n.id), open = game.regionOpen(n.region);
  const col = game.treeColour(n.id), ln = game.treeCost();
  const state = has ? 'on' : can ? 'can' : open ? 'off' : 'locked';
  const right = has ? '<span class="pstate good">✓</span>'
    : can ? `<button class="btn sbtn" data-action="allocate" data-arg="${n.id}" ${costAttr(col, ln)}><span>Allocate</span>${cost(col, ln)}</button>`
    : `<span class="pstate sub small">${open ? 'Connect first' : '🔒'}</span>`;
  return `<div class="prow ${state} ${n.size}" style="--c:${REGIONS[n.region].color}">
    <span class="pdot"></span><div class="pinfo"><b>${esc(n.name)}</b><span class="sub small">${esc(n.desc)}</span></div>${right}</div>`;
}
function treeListHtml() {
  const dist = distFromStart();
  const avail = TREE.filter((n) => game.canAllocate(n.id));
  const col0 = avail[0] ? game.treeColour(avail[0].id) : 'shambler';
  const regions = REGIONS.map((reg, i) => {
    const nodes = TREE.filter((n) => n.region === i).sort((a, b) => (dist.get(a.id) ?? 99) - (dist.get(b.id) ?? 99));
    const got = nodes.filter((n) => game.s.alloc.includes(n.id)).length;
    const open = game.regionOpen(i), shown = openRegions.has(i);
    return `<div class="preg" style="--c:${reg.color}">
      <button class="preg-head" data-action="region" data-arg="${i}"><span class="pdot"></span><b>${reg.name}</b>
        <span class="sub small">${open ? `${got}/${nodes.length} · paid in ${vial(reg.dna)}` : `🔒 Beat Horde ${reg.horde}`}</span><span class="chev">${shown ? '▾' : '▸'}</span></button>
      ${shown ? `<div class="prows">${nodes.map(passiveRow).join('')}</div>` : ''}
    </div>`;
  }).join('');
  return `<div class="tree-top">${modeToggle()}<span class="sub small"><b>${game.s.alloc.length}</b> passives · next costs ${cost(col0, game.treeCost())}</span></div>
  <h3>Available now <small>${avail.length ? 'connected to what you own' : 'nothing to allocate yet'}</small></h3>
  <div class="prows">${avail.map(passiveRow).join('') || '<p class="sub">Beat the next horde to open a new region.</p>'}</div>
  <h3>Regions <small>tap to expand</small></h3>
  ${regions}`;
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
  <div class="tree-top">${modeToggle()}<span class="sub small"><b>${game.s.alloc.length}</b> passives</span>
    <span class="tree-ctl"><button class="icon-btn" data-action="zoom" data-arg="out" aria-label="Zoom out">−</button><button class="icon-btn" data-action="zoom" data-arg="in" aria-label="Zoom in">+</button><button class="icon-btn" data-action="center" aria-label="Recenter">◎</button></span></div>
  <div class="tree-view" id="tree-view"><svg id="tree-svg" width="100%" height="100%"><g id="tree-g">${edges.join('')}${nodes}${labels}</g></svg></div>
  <div class="tree-sheet" style="--c:${sel.region < 0 ? '#c8b070' : REGIONS[sel.region].color}">
    <div><b>${esc(sel.name)}</b> <small class="sub">${sel.size === 'start' ? '' : `${sel.size} · ${REGIONS[sel.region].name}`}</small></div>
    <p class="sub">${esc(sel.desc)}</p>
    ${selState ? `<p class="${selState === 'Allocated' ? 'good' : 'sub'}">${selState}</p>` : `<button class="btn wide" data-action="allocate" data-arg="${sel.id}" ${costAttr(col, game.treeCost())}>Allocate · ${cost(col, game.treeCost())}</button>`}
  </div>`;
}

// ---------- Hordes tab ----------
function warDrumsHtml() {
  if (!game.fx.autoHorde) return `<p class="sub small">Tip: the <b>War Drums</b> passive (Basic Training, Passive Tree) starts hordes for you when your squad should win.</p>`;
  const odds = game.hordeOdds(), need = game.autoHordeNeeds;
  const status = !game.s.autoHordeOn ? 'Off.'
    : odds >= need ? `<span class="good">Starting Horde ${game.nextHorde} within a few seconds…</span>`
    : `Waiting: Horde ${game.nextHorde} starts by itself at ${fmtMult(need)} odds (now ${fmtMult(odds)})${game.hordeFailOdds ? ', a bit higher than when it was last lost' : ''}.`;
  return `<div class="card drums"><label class="switch"><input type="checkbox" data-action="toggle" ${game.s.autoHordeOn ? 'checked' : ''}> <b>War Drums</b>: start the next horde automatically when your squad should win</label><p class="sub small">${status}</p></div>`;
}
function hordesHtml() {
  const next = game.nextHorde;
  const all = Array.from({ length: Math.max(8, next + 2) }, (_, i) => i + 1).filter((k) => k <= 7 || k <= next + 1);
  const list = [...all.filter((k) => k >= next), ...all.filter((k) => k < next).reverse()];
  return `<p class="sub">Hordes are optional fights: ${C.hordeZombies} zombies and a <b>boss</b> in ${C.hordeTimerSec} seconds. The stream pauses while you fight. You lose if time runs out, the boss reaches the shredder, or ${C.breachLimit} horde zombies break through. Losing costs nothing; winning unlocks a new unit type and tree region.</p>
  ${warDrumsHtml()}
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
        <p class="sub small">${odds >= C.hordeWinOdds ? '<span class="good">Your squad should win.</span>' : odds >= 0.9 ? '<span class="warn">It will be close.</span>' : `<span class="bad">Too strong: you need ${fmtMult(1 / Math.max(odds, 1e-9))} more firepower.</span>`}</p>
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
let overrunHintAt = 0;
/** The squad has been swamped for a while: point the player at the Shredder (no pop-up, nothing is taken away). */
function offerRollBack() {
  if (performance.now() < overrunHintAt) return;
  overrunHintAt = performance.now() + 120000;
  toast('<b>Overrun!</b><span>Zombies are piling up at the shredder, which pays only a little DNA. Upgrade your squad.</span>', '#ff6767');
}
function openSettings() {
  const snd = sfx.soundPrefs();
  openModal(`<h3>Settings</h3>
    <div class="row"><button class="btn ${snd.sfx ? '' : 'ghost'} grow" data-action="sound-sfx">Sound effects: ${snd.sfx ? 'On' : 'Off'}</button>
      <button class="btn ${snd.music ? '' : 'ghost'} grow" data-action="sound-music">Music: ${snd.music ? 'On' : 'Off'}</button></div>
    <div class="row"><button class="btn ${showKeep() ? '' : 'ghost'} grow" data-action="keep-pref">Keep-up meter: ${showKeep() ? 'On' : 'Off'}</button></div>
    <p class="sub small">Shows whether your squad keeps up with the zombies, and a hint under every zombie upgrade. Off by default: watch the shredder instead (it flashes red when zombies reach it).</p>
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
