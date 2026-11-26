// DOM interface: HUD, four tabs (Zombies, Squad, Tree, Hordes), the pan/zoom passive tree, toasts and modals.
// Clicks go through one delegated listener using data-action attributes, so re-rendering never loses a tap on iOS.
import * as M from '../core/model.ts';
import type { ClassId, Gun, Recruit } from '../core/model.ts';
import { game, type OfflineReport } from '../core/state.ts';
import { REGIONS, TREE, treeNode } from '../core/tree.ts';
import { classIcon, crateIcon, dnaIcon, gunIcon, zombieIcon } from '../game/art.ts';
import { fmtInt, fmtLn, fmtMult, fmtNum, gunName, RARITY_COLOR } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';

const C = M.CONFIG;
type Tab = 'zombies' | 'squad' | 'tree' | 'hordes';
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const dna = (ln: number) => `<span class="cost"><img class="px vial" src="${dnaIcon()}" alt="DNA">${fmtLn(ln)}</span>`;

/** The open menu, or null when the full-screen zombie map is showing. */
let tab: Tab | null = null;
const TITLES: Record<Tab, string> = { zombies: 'Zombies', squad: 'Squad', tree: 'Passive Tree', hordes: 'Hordes' };
let selectedNode = 'start';
let lastPointer = 0;
let pointerDown = 0;
let softTimer = 0;
const view = { x: 0, y: 0, s: 0.6, dragged: false };

// ---------- init ----------
export function initUI() {
  $('#hud-vial').innerHTML = `<img class="px vial" src="${dnaIcon()}" alt="DNA">`;
  document.addEventListener('click', onClick);
  document.addEventListener('pointerdown', () => { lastPointer = performance.now(); pointerDown++; }, { passive: true });
  const release = () => { lastPointer = performance.now(); pointerDown = Math.max(0, pointerDown - 1); };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  game.on((evt, data) => {
    if (evt === 'loot') toastGun(data as Gun, 'Gun found!');
    if (evt === 'horde-won') { const d = data as { k: number; gun: Gun }; toast(`<b>Horde ${d.k} beaten!</b><span>${esc(M.hordeDef(d.k).unlocks)}</span>`, '#ffd34d'); toastGun(d.gun, 'Reward'); }
    if (evt === 'horde-lost') toast('<b>The horde was too strong</b><span>Train your squad and try again.</span>', '#ff6b6b');
    if (evt === 'change' || evt === 'reset' || evt === 'hire' || evt === 'allocate') soft();
    if (evt === 'horde-won' || evt === 'horde-lost' || evt === 'phase') soft();
  });
  render();
  refresh();
  setInterval(refresh, 300);
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
function onClick(e: Event) {
  const el = (e.target as Element).closest<HTMLElement | SVGElement>('[data-action]');
  if (!el || (el as HTMLButtonElement).disabled) return;
  const a = el.dataset.action!, arg = el.dataset.arg ?? '', n = Number(el.dataset.n ?? 0);
  const dnaBefore = game.dna, tierBefore = game.s.tier;
  switch (a) {
    case 'tab': tab = tab === arg ? null : (arg as Tab); if (tab === 'squad') game.markSeen(); render(); break;
    case 'close': tab = null; render(); break;
    case 'tier-up': game.raiseTier(); break;
    case 'tier-down': game.lowerTier(); break;
    case 'spawn': game.buySpawn(); break;
    case 'train': game.train(n, Number(arg) || 1); break;
    case 'hire': game.hire(arg as ClassId); break;
    case 'dismiss': confirmDismiss(n); break;
    case 'dismiss-yes': closeModal(); game.dismiss(n); break;
    case 'gun': openGun(Number(arg)); break;
    case 'pick-gun': openPicker(n); break;
    case 'equip': closeModal(); game.equip(n, Number(arg)); break;
    case 'scrap': closeModal(); game.scrap(Number(arg)); break;
    case 'node': if (!view.dragged) { selectedNode = arg; render(); } break;
    case 'allocate': game.allocate(arg); break;
    case 'zoom': view.s = Math.max(0.35, Math.min(2.5, view.s * (arg === 'in' ? 1.25 : 0.8))); applyView(); break;
    case 'center': view.x = 0; view.y = 0; view.s = 0.6; applyView(); break;
    case 'horde': game.startHorde(); tab = null; render(); break; // close the menu so you can watch the fight
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
  // sound feedback
  if (a === 'tier-up' || a === 'tier-down') { if (game.s.tier !== tierBefore) sfx.tierUp(); }
  else if (a === 'allocate') { if (game.dna < dnaBefore) sfx.allocate(); }
  else if (['train', 'hire', 'spawn'].includes(a)) { if (game.dna < dnaBefore) sfx.buy(); else sfx.denied(); }
  else if (a === 'equip') sfx.equip();
  else if (a !== 'horde') sfx.click();
  refresh();
}

// ---------- HUD (refreshed in place) ----------
function refresh() {
  $('#hud-dna').textContent = fmtLn(game.dna);
  const snd = sfx.soundPrefs();
  $('#hud-sound').textContent = snd.sfx || snd.music ? '🔊' : '🔇';
  $('#hud-rate').textContent = `+${fmtLn(game.lnDnaPerSec())}/s`;
  $('#hud-tier').textContent = fmtInt(game.s.tier);
  const k = game.keepUp();
  const pill = $('#hud-keep');
  pill.className = `keep-pill ${k >= 1.1 ? 'ok' : k >= 0.9 ? 'warn' : 'bad'}`;
  pill.textContent = k >= 1.1 ? 'keeping up' : k >= 0.9 ? 'barely keeping up' : 'overrun';
  for (const b of document.querySelectorAll<HTMLElement>('#tabs [data-action="tab"]')) {
    b.classList.toggle('active', b.dataset.arg === tab);
    const badge = b.dataset.arg === 'tree' ? game.allocatableCount() > 0 && game.canAfford(game.treeCost())
      : b.dataset.arg === 'squad' ? game.s.newGuns.length > 0
      : b.dataset.arg === 'hordes' ? game.hordeOdds() >= 1 : false;
    b.classList.toggle('badge', badge);
  }
  // live affordability
  for (const el of document.querySelectorAll<HTMLButtonElement>('[data-cost]')) el.disabled = !game.canAfford(Number(el.dataset.cost));
  if (tab === 'zombies') { const m = document.querySelector<HTMLElement>('.meter i'); if (m) m.style.width = `${Math.min(100, (k / 2) * 100)}%`; }
}

function render() {
  const panel = $('#panel');
  const app = document.getElementById('app')!;
  app.classList.toggle('menu-open', !!tab);
  panel.hidden = !tab;
  if (!tab) { refresh(); return; }
  const body = $('#tab-body');
  const sameTab = body.dataset.tab === tab;
  const scroll = sameTab ? body.scrollTop : 0;
  body.dataset.tab = tab;
  $('#panel-title').textContent = TITLES[tab];
  body.className = tab === 'tree' ? 'tree-mode' : '';
  body.innerHTML = { zombies: zombiesHtml, squad: squadHtml, tree: treeHtml, hordes: hordesHtml }[tab]();
  if (tab === 'tree') bindTree(); else body.scrollTop = scroll;
  refresh();
}

// ---------- Zombies tab ----------
function zombiesHtml() {
  const s = game.s;
  const k = game.keepUp();
  const kNext = game.keepUp(s.tier + 1);
  const kSpawn = s.spawnLv < C.spawnMax ? game.keepUp(s.tier, s.spawnLv + 1) : 0;
  const tierUpFree = s.tier < s.maxTier;
  const mix = M.mixAt(s.tier);
  const next = M.STRAINS.find((x) => x.fromTier > s.tier);
  return `
  <div class="card keep ${k >= 1.1 ? 'ok' : k >= 0.9 ? 'warn' : 'bad'}">
    <div class="keep-head"><b>${k >= 1.1 ? 'Your squad is keeping up' : k >= 0.9 ? 'Barely keeping up' : 'Zombies are piling up'}</b><span>${fmtNum(game.capacity())} kills/s vs ${fmtNum(game.spawnRate)} arriving/s</span></div>
    <div class="meter"><i style="width:${Math.min(100, (k / 2) * 100)}%"></i><span class="mark"></span></div>
    <p class="sub">${k >= 1.1 ? 'Raise <b>DNA Count</b> or <b>Spawn Rate</b> to earn more.' : 'Train your squad, hire recruits or equip better guns, or lower DNA Count.'}</p>
  </div>

  <div class="grid2">
  <div class="card dial">
    <div class="dial-head"><div><h3>DNA Count</h3><span class="sub">Tier ${fmtInt(s.tier)}${tierUpFree ? ` (best ${fmtInt(s.maxTier)})` : ''}</span></div><span class="big">${fmtLn(game.lnDnaPerKill(mix[0].id))} <small>DNA / zombie</small></span></div>
    <p class="sub">Each tier: zombies give <b>×${C.R} DNA</b> and have <b>×${C.R} health</b>.</p>
    <div class="row">
      <button class="btn ghost sq" data-action="tier-down" ${s.tier > 1 ? '' : 'disabled'} aria-label="Lower tier">−</button>
      <button class="btn grow" data-action="tier-up" ${tierUpFree ? '' : `data-cost="${game.tierCost()}"`}>${tierUpFree ? `Back to tier ${s.tier + 1}` : `Raise to tier ${s.tier + 1} · ${dna(game.tierCost())}`}</button>
    </div>
    <p class="sub small">At tier ${s.tier + 1} your squad would be ${kNext >= 1.1 ? '<span class="good">keeping up</span>' : kNext >= 0.9 ? '<span class="warn">barely keeping up</span>' : '<span class="bad">overrun</span>'} (${fmtMult(kNext)}).</p>
  </div>

  <div class="card dial">
    <div class="dial-head"><div><h3>Spawn Rate</h3><span class="sub">Level ${s.spawnLv}/${C.spawnMax}</span></div><span class="big">${fmtNum(game.spawnRate)} <small>zombies / s</small></span></div>
    <p class="sub">Each level: <b>+12% zombies</b>, each with <b>+3% health</b>.</p>
    ${s.spawnLv < C.spawnMax ? `<button class="btn wide" data-action="spawn" data-cost="${game.spawnCost()}">Upgrade to ${fmtNum(M.spawnRate(s.spawnLv + 1))}/s · ${dna(game.spawnCost())}</button>
      <p class="sub small">After the upgrade your squad would be ${kSpawn >= 1.1 ? '<span class="good">keeping up</span>' : kSpawn >= 0.9 ? '<span class="warn">barely keeping up</span>' : '<span class="bad">overrun</span>'}.</p>` : '<p class="good">Maxed</p>'}
  </div>
  </div>

  <div class="card">
    <h3>Zombie types</h3>
    <div class="strains">${M.STRAINS.map((st) => `<div class="strain ${st.fromTier <= s.tier ? '' : 'dim'}"><img class="px" src="${zombieIcon(st.id)}" alt=""><b>${st.name}</b><span class="sub">${st.fromTier <= s.tier ? `${st.hp}× HP · ${st.dna}× DNA` : `from tier ${st.fromTier}`}</span></div>`).join('')}</div>
    ${next ? `<p class="sub small">${next.name}s join the stream at tier ${next.fromTier}.</p>` : ''}
  </div>`;
}

// ---------- Squad tab ----------
function statChips(cls: ClassId) {
  const c = M.classById(cls);
  const bar = (v: number) => `<i style="width:${Math.round(v * 100)}%"></i>`;
  return `<div class="chips">
    <span title="Range">RNG<b>${bar(c.range)}</b></span>
    <span title="Damage per shot">DMG<b>${bar(Math.min(1, c.dps / c.rate / 40))}</b></span>
    <span title="Fire rate">SPD<b>${bar(Math.min(1, c.rate / 8))}</b></span>
    <span title="Zombies hit per shot">HITS<b>${bar(c.targets / 4)}</b></span>
  </div>`;
}
function recruitCard(r: Recruit) {
  const c = M.classById(r.cls);
  const gun = game.gun(r.gun);
  const cost = game.trainCost(r);
  return `<div class="recruit">
    <img class="px portrait" src="${classIcon(r.cls)}" alt="">
    <div class="r-main">
      <div class="r-title"><b>${c.name}</b><span class="lv">Lv ${fmtInt(r.level)}</span></div>
      <span class="sub">${fmtLn(game.recruitDps(r))} DPS · range ${Math.round(game.stats(r).range * 100)}% · hits ${game.stats(r).targets}</span>
    </div>
    <button class="gun-tile" style="--rar:${gun ? RARITY_COLOR[gun.rarity] : '#555'}" data-action="pick-gun" data-n="${r.id}" aria-label="Change gun">
      ${gun ? `<img class="px" src="${gunIcon(r.cls)}" alt=""><span>T${fmtInt(gun.ilvl)}</span>` : '<span>no gun</span>'}
    </button>
    <div class="r-actions">
      <button class="btn grow" data-action="train" data-n="${r.id}" data-arg="1" data-cost="${cost}">Train ×${C.trainMult} · ${dna(cost)}</button>
      <button class="btn ghost" data-action="train" data-n="${r.id}" data-arg="1000" data-cost="${cost}">Max</button>
      ${game.s.recruits.length > 1 ? `<button class="btn ghost sq" data-action="dismiss" data-n="${r.id}" aria-label="Dismiss">✕</button>` : ''}
    </div>
  </div>`;
}
function squadHtml() {
  const s = game.s;
  const full = s.recruits.length >= game.slots;
  const hire = M.CLASSES.map((c) => {
    const open = game.classUnlocked(c.id);
    const cost = game.hireCost(c.id);
    return `<div class="hire ${open ? '' : 'locked'}">
      <img class="px portrait" src="${classIcon(c.id)}" alt="">
      <div class="h-main"><b>${c.name}</b><span class="sub">${c.gun}</span>${statChips(c.id)}</div>
      ${open ? `<button class="btn" data-action="hire" data-arg="${c.id}" ${full ? 'disabled' : `data-cost="${cost}"`}>${full ? 'Squad full' : `Hire · ${dna(cost)}`}</button>`
        : `<span class="lock">🔒 Beat Horde ${c.horde}</span>`}
    </div>`;
  }).join('');
  const guns = [...s.guns].sort((a, b) => M.lnGunPower(b) - M.lnGunPower(a));
  return `
  <div class="section-head"><h3>Squad <small>${s.recruits.length}/${game.slots} slots</small></h3>
    ${game.fx.autoEquip ? '<span class="sub small">Quartermaster equips the best guns automatically</span>' : ''}</div>
  <div class="grid2">${s.recruits.map(recruitCard).join('')}</div>
  <h3>Hire recruits</h3>
  <p class="sub small">Each recruit arrives with a standard gun at your current tier. Pistoleers are available now; beat hordes to unlock the others.</p>
  <div class="grid2">${hire}</div>
  <h3>Guns <small>${s.guns.length}/40 · rare drops from zombies and horde rewards</small></h3>
  <div class="tiles">${guns.map((g) => {
    const on = s.recruits.find((r) => r.gun === g.uid);
    return `<button class="tile" style="--rar:${RARITY_COLOR[g.rarity]}" data-action="gun" data-arg="${g.uid}">
      <img class="px" src="${gunIcon(g.cls)}" alt=""><span class="ilvl">T${fmtInt(g.ilvl)}</span>${on ? '<span class="tag">IN USE</span>' : s.newGuns.includes(g.uid) ? '<span class="tag new">NEW</span>' : ''}</button>`;
  }).join('')}</div>`;
}

function gunPower(g: Gun) { return Math.exp(M.lnGunPower(g)); }
function openPicker(recruitId: number) {
  const r = game.recruit(recruitId);
  if (!r) return;
  const cur = game.gun(r.gun);
  const options = game.s.guns.filter((g) => g.cls === r.cls && g.uid !== r.gun).sort((a, b) => M.lnGunPower(b) - M.lnGunPower(a));
  openModal(`<h3>${M.classById(r.cls).name}'s gun</h3>
    ${cur ? `<p class="sub">Now: <b style="color:${RARITY_COLOR[cur.rarity]}">${gunName(cur)}</b> · tier ${fmtInt(cur.ilvl)}</p>` : ''}
    <div class="picks">${options.map((g) => {
      const ratio = cur ? gunPower(g) / gunPower(cur) : 2;
      return `<div class="pick" style="--rar:${RARITY_COLOR[g.rarity]}"><img class="px" src="${gunIcon(g.cls)}" alt="">
        <div><b style="color:${RARITY_COLOR[g.rarity]}">${gunName(g)}</b><span class="sub">tier ${fmtInt(g.ilvl)} · <span class="${ratio > 1.005 ? 'good' : 'bad'}">${ratio >= 1 ? '+' : ''}${Math.round((ratio - 1) * 100)}% damage</span></span></div>
        <button class="btn sm" data-action="equip" data-n="${r.id}" data-arg="${g.uid}">Equip</button></div>`;
    }).join('') || `<p class="sub">No other ${M.classById(r.cls).gun}s yet. Guns are rare drops; beating hordes always gives one.</p>`}</div>
    <div class="row"><button class="btn ghost" data-action="modal-close">Close</button></div>`);
}
function openGun(uid: number) {
  const g = game.gun(uid);
  if (!g) return;
  const users = game.s.recruits.filter((r) => r.cls === g.cls);
  const on = game.s.recruits.find((r) => r.gun === uid);
  openModal(`<div class="item-head"><img class="px big" src="${gunIcon(g.cls)}" alt=""><div><h3 style="color:${RARITY_COLOR[g.rarity]}">${gunName(g)}</h3>
      <p class="sub">Tier ${fmtInt(g.ilvl)} · ${fmtMult(gunPower(g))} damage · for ${M.classById(g.cls).plural}</p></div></div>
    <div class="give">${users.map((r) => `<button class="btn ${r.gun === uid ? 'ghost' : ''}" data-action="equip" data-n="${r.id}" data-arg="${uid}" ${r.gun === uid ? 'disabled' : ''}>${r.gun === uid ? 'Equipped' : `Give to ${M.classById(r.cls).name} Lv ${r.level}`}</button>`).join('') || `<p class="sub">Hire a ${M.classById(g.cls).name} to use this gun.</p>`}</div>
    <div class="row"><button class="btn ghost" data-action="scrap" data-arg="${uid}" ${on ? 'disabled' : ''}>Scrap</button><button class="btn ghost" data-action="modal-close">Close</button></div>`);
}
function confirmDismiss(id: number) {
  const r = game.recruit(id);
  if (!r) return;
  openModal(`<h3>Dismiss this ${M.classById(r.cls).name}?</h3><p class="sub">They leave the squad with their training (Lv ${r.level}). Their gun stays in your stash.</p>
    <div class="row"><button class="btn ghost" data-action="modal-close">Cancel</button><button class="btn danger" data-action="dismiss-yes" data-n="${id}">Dismiss</button></div>`);
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
    const open = game.regionOpen(n.region);
    const state = has(n.id) ? 'on' : game.canAllocate(n.id) ? 'can' : open ? 'off' : 'locked';
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
  const selOpen = game.regionOpen(sel.region);
  const selState = sel.id === 'start' || alloc.has(sel.id) ? 'Allocated' : !selOpen ? `Locked: beat Horde ${REGIONS[sel.region].horde} (${M.hordeDef(REGIONS[sel.region].horde).name}) to open ${REGIONS[sel.region].name}.` : game.canAllocate(sel.id) ? '' : 'Allocate a connected passive first.';
  return `
  <div class="tree-top"><span><b>${game.s.alloc.length}</b> passives · next costs ${dna(game.treeCost())}</span>
    <span class="tree-ctl"><button class="icon-btn" data-action="zoom" data-arg="out" aria-label="Zoom out">−</button><button class="icon-btn" data-action="zoom" data-arg="in" aria-label="Zoom in">+</button><button class="icon-btn" data-action="center" aria-label="Recenter">◎</button></span></div>
  <div class="tree-view" id="tree-view"><svg id="tree-svg" width="100%" height="100%"><g id="tree-g">${edges.join('')}${nodes}${labels}</g></svg></div>
  <div class="tree-sheet" style="--c:${sel.region < 0 ? '#c8b070' : REGIONS[sel.region].color}">
    <div><b>${esc(sel.name)}</b> <small class="sub">${sel.size === 'start' ? '' : `${sel.size} · ${REGIONS[sel.region].name}`}</small></div>
    <p class="sub">${esc(sel.desc)}</p>
    ${selState ? `<p class="${selState === 'Allocated' ? 'good' : 'sub'}">${selState}</p>` : `<button class="btn wide" data-action="allocate" data-arg="${sel.id}" data-cost="${game.treeCost()}">Allocate · ${dna(game.treeCost())}</button>`}
  </div>`;
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
    v.setPointerCapture?.(e.pointerId);
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
      if (Math.hypot(dx, dy) > 6) view.dragged = true;
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

// ---------- Hordes tab ----------
function hordesHtml() {
  const next = game.nextHorde;
  const all = Array.from({ length: Math.max(8, next + 2) }, (_, i) => i + 1).filter((k) => k <= 7 || k <= next + 1);
  const list = [...all.filter((k) => k >= next), ...all.filter((k) => k < next).reverse()]; // next horde first, beaten ones last
  return `<p class="sub">Hordes are optional challenges: ${C.hordeZombies} zombies in ${C.hordeTimerSec} seconds. The stream pauses while you fight. Beat one to unlock new recruits and tree regions.</p>
  ${game.fx.autoHorde ? `<label class="switch"><input type="checkbox" data-action="toggle" ${game.s.autoHordeOn ? 'checked' : ''}> War Drums: start the next horde automatically when your squad should win</label>` : ''}
  <div class="grid2">${list.map((k) => {
    const h = M.hordeDef(k);
    const beaten = k < next, isNext = k === next;
    const odds = isNext ? game.hordeOdds(k) : 0;
    const mix = M.hordeMix(k);
    return `<div class="horde ${beaten ? 'beaten' : isNext ? 'next' : 'locked'}">
      <div class="h-head"><b>${k}. ${esc(h.name)}</b><span class="tier">Tier ${h.tier}</span></div>
      <div class="h-faces">${mix.map((m) => `<img class="px" src="${zombieIcon(m.id)}" alt="${m.name}">`).join('')}</div>
      <p class="sub">Reward: <b>${esc(h.unlocks)}</b>${h.cls ? ` · a rare+ ${M.classById(h.cls).gun}` : ''}</p>
      ${beaten ? '<p class="good">✓ Beaten</p>' : isNext ? `
        <div class="meter small"><i style="width:${Math.min(100, (odds / 2) * 100)}%"></i><span class="mark"></span></div>
        <p class="sub small">${odds >= 1.1 ? '<span class="good">Your squad should win.</span>' : odds >= 0.9 ? '<span class="warn">It will be close.</span>' : `<span class="bad">Too strong: you need ${fmtMult(1 / Math.max(odds, 1e-9))} more firepower.</span>`}</p>
        <button class="btn wide call" data-action="horde">Start Horde ${k}</button>` : '<p class="sub small">🔒 Beat the previous horde first.</p>'}
    </div>`;
  }).join('')}</div>`;
}

// ---------- modals + toasts ----------
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
  openModal(`<h3>While you were away</h3><p class="sub">${h ? `${h}h ` : ''}${m}m of shredding</p>
    <div class="offline">
      <div><span>Zombies</span><b>${fmtInt(r.kills)}</b></div>
      <div><span>DNA</span><b>+${fmtLn(r.lnDna)}</b></div>
      <div><span>Guns found</span><b>${r.guns.length}</b></div>
      <div><span>Tiers raised</span><b>${r.tiers || '-'}</b></div>
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
function toastGun(g: Gun, title: string) {
  toast(`<b>${title} ${esc(gunName(g))}</b><span>Tier ${fmtInt(g.ilvl)} · for ${M.classById(g.cls).plural}</span>`, RARITY_COLOR[g.rarity], crateIcon(g.rarity));
}
