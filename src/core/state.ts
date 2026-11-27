// Game state and every action that changes it. The Phaser scene and the DOM UI both talk to the single
// `game` instance exported here; it never touches rendering.
import * as M from './model.ts';
import type { Attachment, Charm, ClassId, DnaMap, Gear, Gun, Recruit, StrainId, Strains, Unit, UnitNodeId, UnitV5, ZombieId } from './model.ts';
import { REGIONS, TREE, treeFx, treeNode, type Fx } from './tree.ts';

const C = M.CONFIG;
const SAVE_KEY = 'zombie-idle-save-v4';   // unchanged so existing saves are always found and upgraded
const STASH_CAP = 60;

export interface SaveData {
  version: 6;
  dna: DnaMap;                       // ln amount of each DNA colour
  strains: Strains;                  // per zombie type: released?, DNA Count tier, Spawn Rate level
  units: Record<ClassId, Unit>;      // per unit type: count, upgrade tree, issued gun, attachment, charm
  guns: Gun[];
  gear: Gear[];                      // attachments and charms
  alloc: string[];                   // allocated passive-tree nodes
  hordes: number;
  autoHordeOn: boolean;
  /** Drops at or below this rarity are sold on pickup (never an upgrade, never a horde reward). null = off. */
  autoSell: AutoSell;
  nextUid: number;
  kills: number;
  bossKills?: number;
  /** The commander's name for the leaderboard (chosen in the cutscene after Horde 1). */
  player?: { id: string; name: string };
  /** Auto-buy (free after Horde 10): each category is switched on or off on its own, from the map. */
  auto?: { on?: boolean; zombies: boolean; units: boolean; globals: boolean };                 // bosses killed (kept through prestige, like kills)
  newItems: number[];
  lastSeen: number;
  /** Total time actually played (seconds, only while the app is open and visible). */
  playSec: number;
  /** Prestige: kept through resets (runs, unspent points, perks). */
  prestige: M.Prestige;
  /** Economy version: 2 = tier cap + evolutions + horde-unlocked colours (older saves are converted on load). */
  econ?: number;
  /** Tutorial steps already shown. */
  tut?: string[];
  globals?: Partial<Record<M.ColourId | 'all', number>>;   // global upgrade levels per DNA colour
}
/** A dropped item; `sold` is set when auto-sell turned it straight into DNA. */
export type Loot = ({ type: 'gun'; gun: Gun } | { type: 'gear'; gear: Gear }) & { sold?: Sale; alsoSold?: number };
export interface Sale { colour: StrainId; ln: number }
/** Auto-sell rule: sell drops of a rarity and lower, or 'best' = keep equipped items plus the best of each kind. */
export type AutoSell = M.RarityId | 'best' | null;
type Listener = (evt: string, data?: unknown) => void;

const emptyDna = (): DnaMap => Object.fromEntries(M.STRAIN_IDS.map((s) => [s, null])) as unknown as DnaMap;
const emptyStrains = (): Strains => Object.fromEntries(M.ZOMBIE_IDS.map((s) => [s, { unlocked: s === 'shambler', tier: 1, maxTier: 1, spawn: 0 }])) as unknown as Strains;
const emptyUnits = (): Record<ClassId, Unit> =>
  Object.fromEntries(M.CLASSES.map((c) => [c.id, { cls: c.id, count: 0, nodes: {}, gun: null, attach: null, charm: null }])) as unknown as Record<ClassId, Unit>;
function freshSave(): SaveData {
  const units = emptyUnits();
  units.pistol = { cls: 'pistol', count: 1, nodes: {}, gun: 2, attach: null, charm: null };
  return {
    version: 6, dna: emptyDna(), strains: emptyStrains(), units,
    guns: [{ uid: 2, cls: 'pistol', rarity: 'common', ilvl: 1 }], gear: [],
    alloc: [], hordes: 0, autoHordeOn: true, autoSell: 'best', nextUid: 3, kills: 0, newItems: [], lastSeen: Date.now(), playSec: 0, prestige: M.emptyPrestige(), econ: 2,
  };
}

// ---------- save upgrades (never lose progress) ----------
interface SaveV4 { version: 4; dna: number | null; tier: number; maxTier: number; spawnLv: number; recruits: Recruit[]; guns: Gun[]; alloc: string[]; hordes: number; autoHordeOn?: boolean; nextUid: number; kills: number; lastSeen: number }
interface SaveV5 extends Omit<SaveV4, 'version' | 'recruits'> { version: 5; units: Record<ClassId, UnitV5> }
function v4to5(d: SaveV4): SaveV5 {
  const units = Object.fromEntries(M.CLASSES.map((c) => [c.id, { cls: c.id, count: 0, level: 0, gun: null }])) as unknown as Record<ClassId, UnitV5>;
  for (const r of d.recruits) {
    const u = units[r.cls];
    u.count = Math.min(C.maxPerType, u.count + 1);
    u.level = Math.max(u.level, r.level);
    const g = d.guns.find((x) => x.uid === r.gun), cur = d.guns.find((x) => x.uid === u.gun);
    if (g && (!cur || M.lnGunPower(g) > M.lnGunPower(cur))) u.gun = g.uid;
  }
  const { recruits: _r, ...rest } = d;
  void _r;
  return { ...rest, version: 5, units };
}
function v5to6(d: SaveV5): SaveData {
  const f = freshSave();
  // one DNA → Green (Shambler) DNA; the single tier/spawn → Shamblers; types that were already in the stream
  // at the old tier are released at that tier
  const strains = emptyStrains();
  for (const def of M.STRAINS) {
    if (def.fromTier <= d.maxTier) strains[def.id] = { unlocked: true, tier: def.id === 'shambler' ? Math.min(d.tier, d.maxTier) : 1, maxTier: d.maxTier, spawn: def.id === 'shambler' ? d.spawnLv : 0 };
  }
  const units = emptyUnits();
  for (const c of M.CLASSES) {
    const old = d.units[c.id];
    if (old) units[c.id] = { cls: c.id, count: old.count, nodes: old.level ? { dmg: old.level } : {}, gun: old.gun, attach: null, charm: null };
  }
  const dna = emptyDna();
  dna.shambler = d.dna;
  return { ...f, dna, strains, units, guns: d.guns, alloc: d.alloc, hordes: d.hordes, autoHordeOn: d.autoHordeOn ?? true, nextUid: d.nextUid, kills: d.kills, lastSeen: d.lastSeen };
}
function migrate(data: { version: number }): SaveData {
  let d = data as unknown;
  if ((d as { version: number }).version === 4) d = v4to5(d as SaveV4);
  if ((d as { version: number }).version === 5) d = v5to6(d as SaveV5);
  const s = d as SaveData;
  if (s.version !== 6) throw new Error(`save version ${s.version}`);
  const f = freshSave();
  const out: SaveData = { ...f, ...s, dna: { ...emptyDna(), ...s.dna }, strains: { ...emptyStrains(), ...s.strains }, units: { ...emptyUnits(), ...s.units }, gear: s.gear ?? [],
    autoSell: 'best' };   // auto-sell always keeps the best of each kind and sells the rest
  if (s.econ !== 2) out.strains = toEcon2(out.strains);
  out.econ = 2;
  // saves from before the tutorial existed: don't teach the basics to someone well into a run
  if (out.bossKills === undefined) out.bossKills = out.hordes;   // every horde won so far killed its boss
  if (!out.tut && out.kills > 300) out.tut = ['welcome', 'shredder', 'range', 'tier', 'squad', 'combo', ...(out.hordes > 0 ? ['horde', 'colour', 'tree'] : [])];
  // colours are horde rewards: make sure every colour you've earned is out
  for (const [id, k] of Object.entries(M.COLOUR_HORDE) as [M.ZombieId, number][]) if (out.hordes >= k) out.strains[id].unlocked = true;
  return out;
}
/** Older saves had no tier cap. Keep each colour's strength: its best tier T becomes forms at 50, 50, … with the rest
 * on the next form (the last form is uncapped). Spawn levels and the colour's leader stay as they were. */
function toEcon2(st: Strains): Strains {
  const out = { ...st };
  for (const c of M.COLOURS) {
    const forms = M.familyMembers(c);
    if (!st[forms[0].id].unlocked) continue;
    const T = Math.max(...forms.filter((f) => st[f.id].unlocked).map((f) => st[f.id].maxTier));
    forms.forEach((f, i) => {
      const left = T - M.TIER_CAP * i, cap = M.tierCapOf(f.id);
      const x = st[f.id];
      if (i === 0 || left >= 1) { const t = Math.max(1, Math.min(cap, left)); out[f.id] = { unlocked: true, tier: t, maxTier: t, spawn: x.spawn }; }
      else out[f.id] = { unlocked: false, tier: 1, maxTier: 1, spawn: 0 };
    });
  }
  return out;
}

export interface NodeState {
  def: M.UnitNodeDef; level: number; maxed: boolean; colour: StrainId; lnCost: number; locked: string; canAfford: boolean;
}

export class Game {
  s: SaveData = freshSave();
  private listeners: Listener[] = [];
  private fxCache: { key: string; fx: Fx } | null = null;

  on(fn: Listener) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  emit(evt: string, data?: unknown) { for (const l of this.listeners) l(evt, data); }

  // ---------- DNA ----------
  get fx(): Fx {
    const key = this.s.alloc.join(',') + '|' + JSON.stringify(this.s.prestige?.perks ?? {}) + '|' + JSON.stringify(this.s.globals ?? {});
    if (this.fxCache?.key !== key) { this.fxCache = { key, fx: M.applyGlobals(M.applyPerks(treeFx(this.s.alloc), this.s.prestige), this.s.globals) }; this.syncLive(); }
    return this.fxCache.fx;
  }
  /** Perk effects that aren't part of the squad's modifiers: spawn rate and special-zombie chance. */
  syncLive() {
    M.live.spawnMult = 1 + 0.1 * M.plv(this.s.prestige, 'spawn');
    M.live.specialMult = 1 + 0.5 * M.plv(this.s.prestige, 'gold');
  }
  dna(c: StrainId) { return this.s.dna[c] ?? -Infinity; }
  private setDna(c: StrainId, v: number) { this.s.dna[c] = v === -Infinity ? null : v; }
  canAfford(c: StrainId, ln: number) { return ln <= this.dna(c) + 1e-9; }
  private pay(c: StrainId, ln: number) { if (!this.canAfford(c, ln)) return false; this.setDna(c, M.logSub(this.dna(c), ln)); return true; }
  /** DNA colours you can earn (released zombie types). */
  get colours(): StrainId[] { const act = new Set(M.activeStrains(this.s.strains).map(M.familyOf)); return M.COLOURS.filter((c) => act.has(c)); }

  // ---------- squad ----------
  gun(uid: number | null | undefined) { return uid == null ? undefined : this.s.guns.find((g) => g.uid === uid); }
  gearItem(uid: number | null | undefined) { return uid == null ? undefined : this.s.gear.find((g) => g.uid === uid); }
  unit(c: ClassId) { return this.s.units[c]; }
  get owned(): Unit[] { return M.CLASSES.map((c) => this.s.units[c.id]).filter((u) => u.count > 0); }
  get totalUnits() { return this.owned.reduce((a, u) => a + u.count, 0); }
  entry(u: Unit): M.SquadEntry {
    const a = this.gearItem(u.attach), ch = this.gearItem(u.charm);
    return { u, gun: this.gun(u.gun), attach: a?.kind === 'attach' && M.nlv(u, 'attach') ? a : undefined, charm: ch?.kind === 'charm' && M.nlv(u, 'charm') ? ch : undefined };
  }
  squad(): M.SquadEntry[] { return this.owned.map((u) => this.entry(u)); }
  get best() { return M.bestTier(this.s.strains); }
  get unitCap() { return Math.min(M.CONFIG.maxPerType, M.unitCap(this.best) + 2 * M.plv(this.s.prestige, 'barracks')); }
  classUnlocked(c: ClassId) { return M.classById(c).horde <= this.s.hordes; }
  stats(u: Unit) { return M.unitStats(this.entry(u), this.fx); }
  /** Total DPS of a unit type, averaged over the zombie types currently in the stream (ln). */
  unitDps(u: Unit) {
    const e = this.entry(u), st = M.unitStats(e, this.fx), cs = this.colours;
    return st.lnDps + Math.log(M.unitPower(u.count)) + Math.log(cs.reduce((a, s) => a + M.matchMult(e, s, this.fx), 0) / cs.length);
  }

  // ---------- zombie dials ----------
  keepUp(st: Strains = this.s.strains) { return M.keepUp(this.squad(), this.fx, st); }
  /** Keep-up ratio if one zombie type's tier or spawn level changed by +1. */
  keepUpIf(s: ZombieId, what: 'tier' | 'spawn') {
    const x = this.s.strains[s];
    return this.keepUp({ ...this.s.strains, [s]: { ...x, [what]: x[what] + 1 } });
  }
  lnDnaPerSec() { return M.lnDnaPerSec(this.squad(), this.fx, this.s.strains); }
  get totalSpawnRate() { return M.totalSpawnRate(this.s.strains); }
  tierCost(s: ZombieId) { return M.lnTierCost(s, this.s.strains[s].maxTier); }
  raiseTier(s: ZombieId) {
    const x = this.s.strains[s];
    if (x.tier < x.maxTier) x.tier++;
    else if (x.maxTier >= M.tierCapOf(s)) return;   // at the cap: evolve to the next form instead
    else if (this.pay(M.familyOf(s), this.tierCost(s))) { x.maxTier++; x.tier++; this.refitGuns(); }
    else return;
    this.emit('change');
  }
  /** Guns keep up with your toughest zombie tier (drops then only matter for rarity). */
  refitGuns() {
    const floor = M.gunFloor(this.s.strains);
    for (const g of this.s.guns) if (g.ilvl < floor) g.ilvl = floor;
  }
  lowerTier(s: ZombieId) { const x = this.s.strains[s]; if (x.tier > 1) { x.tier--; this.emit('change'); } }
  spawnCost(s: ZombieId) { const x = this.s.strains[s]; return M.lnSpawnCost(s, x.spawn, x.maxTier); }
  buySpawn(s: ZombieId) {
    const x = this.s.strains[s];
    if (x.spawn < C.spawnMax && this.pay(M.familyOf(s), this.spawnCost(s))) { x.spawn++; this.emit('change'); }
  }
  /** ln price to release a zombie type: ~10 minutes of current income in the colour you pay with. */
  releaseCost(s: ZombieId) { return M.lnReleaseCost(s); }
  canRelease(s: ZombieId) {
    const u = M.strainById(s).unlock;
    return !!u && !M.COLOUR_HORDE[s] && !this.s.strains[s].unlocked && this.releaseReady(s) && this.canAfford(M.familyOf(u.from), this.releaseCost(s));
  }
  /** Is the type this one comes from released and at tier 15+? */
  releaseReady(s: ZombieId) {
    const u = M.strainById(s).unlock;
    return !!u && !M.COLOUR_HORDE[s] && this.s.strains[u.from].unlocked && this.s.strains[u.from].maxTier >= M.TIER_CAP;
  }
  release(s: ZombieId) {
    const u = M.strainById(s).unlock;
    if (!u || !this.canRelease(s)) return;
    this.pay(M.familyOf(u.from), this.releaseCost(s));
    this.s.strains[s].unlocked = true;
    this.emit('release', s);
    this.emit('change');
  }

  // ---------- global upgrades (one per DNA colour) ----------
  globalLevel(c: M.ColourId) { return this.s.globals?.[c] ?? 0; }
  globalCost(c: M.ColourId) { return M.lnGlobalCost(c, this.globalLevel(c)); }
  globalMaxed(c: M.ColourId) { const m = M.GLOBALS[c].max; return m !== undefined && this.globalLevel(c) >= m; }
  canBuyGlobal(c: M.ColourId) { return M.globalOpen(this.s.strains, c) && !this.globalMaxed(c) && this.canAfford(c, this.globalCost(c)); }
  buyGlobal(c: M.ColourId, n = 1) {
    let k = 0;
    while (k < n && this.canBuyGlobal(c) && this.pay(c, this.globalCost(c))) { this.s.globals = { ...(this.s.globals ?? {}), [c]: this.globalLevel(c) + 1 }; k++; }
    if (k) this.emit('change');
    return k;
  }

  scavengerLevel() { return this.s.globals?.all ?? 0; }
  canBuyScavenger() { const l = this.scavengerLevel(); return M.scavengerOpen(this.s.strains) && M.COLOURS.every((c) => this.canAfford(c, M.lnScavengerCost(c, l))); }
  buyScavenger() {
    if (!this.canBuyScavenger()) return false;
    const l = this.scavengerLevel();
    for (const c of M.COLOURS) this.pay(c, M.lnScavengerCost(c, l));
    this.s.globals = { ...(this.s.globals ?? {}), all: l + 1 };
    this.emit('change');
    return true;
  }
  // ---------- auto-buy (unlocked by beating Horde 10) ----------
  static readonly AUTO_HORDE = 10;
  /** Keep-up the auto-buyer keeps when raising zombies, so it never overruns the squad. */
  static readonly AUTO_KEEP = 1.3;
  get autoUnlocked() { return this.s.hordes >= Game.AUTO_HORDE; }
  get autoCfg() {
    const a = (this.s.auto ??= { zombies: false, units: false, globals: false });
    if (a.on !== undefined) { if (!a.on) { a.zombies = a.units = a.globals = false; } delete a.on; }   // older saves had one master switch
    return a;
  }
  get autoAny() { const a = this.autoCfg; return a.zombies || a.units || a.globals; }
  /** One pass: in every colour, buy the cheapest allowed thing it can afford, repeatedly, up to a few dozen buys. Raising a
   * zombie tier or spawn level only happens if the squad would still keep up ×1.3. Ultimate forms for units are left to
   * the player (a choice of tracks); zombie ultimates, evolutions, hires, unit upgrades and global upgrades are bought. */
  /** True while the auto-buyer is shopping, so the UI shows a small notice instead of pausing on a reveal card. */
  autoBuying = false;
  autoBuyTick() {
    const a = this.autoCfg;
    if (!this.autoUnlocked || !(a.zombies || a.units || a.globals)) return 0;
    this.autoBuying = true;
    try { return this.autoBuyPass(a); } finally { this.autoBuying = false; }
  }
  private autoBuyPass(a: { zombies: boolean; units: boolean; globals: boolean }) {
    let bought = 0;
    for (let guard = 0; guard < 25; guard++) {
      const opts: { col: M.ColourId; ln: number; go: () => void }[] = [];
      if (a.zombies) {
        for (const z of M.activeStrains(this.s.strains)) {
          const x = this.s.strains[z], col = M.familyOf(z);
          if (x.tier === x.maxTier && x.maxTier < M.tierCapOf(z) && this.canAfford(col, this.tierCost(z)) && this.keepUpIf(z, 'tier') >= Game.AUTO_KEEP) opts.push({ col, ln: this.tierCost(z), go: () => this.raiseTier(z) });
          if (x.spawn < C.spawnMax && this.canAfford(col, this.spawnCost(z)) && this.keepUpIf(z, 'spawn') >= Game.AUTO_KEEP) opts.push({ col, ln: this.spawnCost(z), go: () => this.buySpawn(z) });
          if (M.zombieUltReady(x)) opts.push({ col, ln: this.zombieUltCost(z), go: () => this.zombieUlt(z) });
        }
        for (const z of M.ZOMBIE_IDS) { const u = M.strainById(z).unlock; if (u && this.canRelease(z)) opts.push({ col: M.familyOf(u.from), ln: this.releaseCost(z), go: () => this.release(z) }); }
      }
      if (a.units) {
        for (const c of M.CLASSES) {
          const id = c.id, u = this.s.units[id];
          if (this.classUnlocked(id) && u.count < this.unitCap) opts.push({ col: c.primary, ln: this.hireCost(id), go: () => this.hire(id) });
          if (!u.count) continue;
          for (const n of M.UNIT_NODES) { const ns = this.node(id, n.id); if (!ns.maxed && !ns.locked) opts.push({ col: ns.colour, ln: ns.lnCost, go: () => this.buyNode(id, n.id, 1) }); }
        }
      }
      if (a.globals) {
        for (const c of M.COLOURS) if (M.globalOpen(this.s.strains, c) && !this.globalMaxed(c)) opts.push({ col: c, ln: this.globalCost(c), go: () => this.buyGlobal(c, 1) });
        if (this.canBuyScavenger()) { const l = this.scavengerLevel(); opts.push({ col: 'shambler', ln: M.lnScavengerCost('shambler', l), go: () => this.buyScavenger() }); }
      }
      let any = false;
      for (const col of M.COLOURS) {
        const o = opts.filter((x) => x.col === col).sort((p, q) => p.ln - q.ln)[0];
        if (o && this.canAfford(col, o.ln)) { const before = this.dna(col); o.go(); if (this.dna(col) < before || o.ln === -Infinity) { any = true; bought++; } }
      }
      if (!any) break;
    }
    return bought;
  }
  bossKilled() { this.s.bossKills = (this.s.bossKills ?? 0) + 1; }

  // ---------- zombie ultimate forms ----------
  zombieUltCost(s: ZombieId) { return M.lnZombieUltCost(s, this.s.strains[s]); }
  canZombieUlt(s: ZombieId) { return M.zombieUltReady(this.s.strains[s]) && this.canAfford(M.familyOf(s), this.zombieUltCost(s)); }
  zombieUlt(s: ZombieId) {
    if (!this.canZombieUlt(s) || !this.pay(M.familyOf(s), this.zombieUltCost(s))) return false;
    this.s.strains[s].ult = true;
    this.emit('zombie-ult', s);
    this.emit('change');
    return true;
  }

  // ---------- unit trees ----------
  node(c: ClassId, id: UnitNodeId): NodeState {
    const u = this.s.units[c], def = M.unitNodeById(id), level = M.nlv(u, id);
    const colour = M.nodeColour(c, def);
    const lnCost = M.lnUnitNodeCost(c, def, level, this.fx);
    const maxed = M.unitNodeMaxed(def, level);
    let locked = '';
    if (!u.count) locked = `Hire a ${M.classById(c).name} first`;
    else if (def.requires && !M.nlv(u, def.requires)) locked = `Needs ${M.unitNodeById(def.requires).name}`;
    else if (!this.s.strains[colour].unlocked) locked = `Needs ${M.strainById(colour).dna} DNA: release ${M.strainById(colour).plural}`;
    return { def, level, maxed, colour, lnCost, locked, canAfford: !maxed && !locked && this.canAfford(colour, lnCost) };
  }
  buyNode(c: ClassId, id: UnitNodeId, max = 1) {
    let n = 0;
    while (n < max) {
      const st = this.node(c, id);
      if (!st.canAfford || !this.pay(st.colour, st.lnCost)) break;
      this.s.units[c].nodes[id] = st.level + 1;
      n++;
    }
    if (n && (id === 'attach' || id === 'charm')) this.autoEquip();   // a new gear slot gets the best spare item
    if (n) this.emit('change');
    return n;
  }
  /** Ultimate form: price, readiness and evolving down track 0 or 1. */
  ultCost(c: ClassId) { return M.lnUltCost(c, this.fx); }
  ultReady(c: ClassId) { return M.ultReady(this.s.units[c]); }
  canEvolveUnit(c: ClassId) { return this.ultReady(c) && this.canAfford(M.classById(c).primary, this.ultCost(c)); }
  evolveUnit(c: ClassId, track: 0 | 1) {
    if (!this.canEvolveUnit(c) || !this.pay(M.classById(c).primary, this.ultCost(c))) return false;
    this.s.units[c].evo = track;
    this.emit('unit-evolve', c);
    this.emit('change');
    return true;
  }
  get unitEvolveReady() { return this.owned.some((u) => this.canEvolveUnit(u.cls)); }
  nodesAffordable(c: ClassId) { return M.UNIT_NODES.filter((n) => this.node(c, n.id).canAfford).length; }
  /** Affordable tree items for a unit type, not counting the endless Damage ranks (used for the menu dots). */
  treeItemsAffordable(c: ClassId) { return M.UNIT_NODES.filter((n) => n.id !== 'dmg' && this.node(c, n.id).canAfford).length; }
  /** An Ability stage or Gear slot (attachment/charm) a hired unit can afford: the only things that light the Squad dot. */
  get keyUpgradeAffordable() {
    return this.owned.some((u) => (['ab1', 'ab2', 'ab3', 'attach', 'charm'] as UnitNodeId[]).some((id) => this.node(u.cls, id).canAfford));
  }
  /** Any zombie type you can release right now. */
  get canReleaseAny() { return M.ZOMBIE_IDS.some((z) => this.canRelease(z)); }
  /** Any soldier you can hire right now (including the first of a newly unlocked unit type). */
  get canHireAny() { return M.CLASSES.some((c) => this.canHire(c.id)); }

  // ---------- hiring ----------
  hireColour(c: ClassId) { return M.classById(c).primary; }
  hireCost(c: ClassId) { return M.lnHireCost(c, this.s.units[c].count, this.fx); }
  canHire(c: ClassId) {
    const col = this.hireColour(c);
    return this.classUnlocked(c) && this.s.strains[col].unlocked && this.s.units[c].count < this.unitCap && this.canAfford(col, this.hireCost(c));
  }
  hire(c: ClassId) {
    if (!this.canHire(c)) return;
    this.pay(this.hireColour(c), this.hireCost(c));
    const u = this.s.units[c];
    if (u.count === 0 && !this.gun(u.gun)) {
      const g = this.addGun(c, 0, 0, false); // the first unit of a type arrives with a standard gun at your best tier
      u.gun = g.uid;
    }
    u.count++;
    if (u.count === 1) this.autoEquip();
    this.emit('hire', u);
    this.emit('change');
  }


  // ---------- gear ----------
  equipGun(c: ClassId, uid: number) {
    const g = this.gun(uid);
    if (!g || g.cls !== c) return;
    this.s.units[c].gun = uid;
    this.emit('change');
  }
  /** Put an attachment or charm on a unit type (moving it off any other type), or clear the slot with null. */
  equipGear(c: ClassId, slot: 'attach' | 'charm', uid: number | null) {
    const u = this.s.units[c];
    if (!M.nlv(u, slot)) return;
    if (uid != null) {
      const g = this.gearItem(uid);
      if (!g || g.kind !== slot) return;
      for (const o of Object.values(this.s.units)) if (o[slot] === uid) o[slot] = null;
    }
    u[slot] = uid;
    this.emit('change');
  }
  /** Quartermaster: best gun for every type; attachments and charms go where they add the most keep-up. */
  autoEquip() {
    for (const u of Object.values(this.s.units)) {
      const best = this.s.guns.filter((g) => g.cls === u.cls).sort((a, b) => M.lnGunPower(b) - M.lnGunPower(a))[0];
      if (best) u.gun = best.uid;
    }
    for (const slot of ['attach', 'charm'] as const) {
      const slots = this.owned.filter((u) => M.nlv(u, slot));
      for (const u of slots) u[slot] = null;
      const pool = this.s.gear.filter((g) => g.kind === slot).sort((a, b) => b.value - a.value);
      for (const u of slots.sort((a, b) => M.classById(b.cls).dps - M.classById(a.cls).dps)) {
        let bestUid: number | null = null, bestK = this.keepUp();
        for (const g of pool.slice(0, 12)) {
          if (Object.values(this.s.units).some((o) => o[slot] === g.uid)) continue;
          u[slot] = g.uid;
          const k = this.keepUp();
          if (k > bestK) { bestK = k; bestUid = g.uid; }
        }
        u[slot] = bestUid;
      }
    }
  }
  /** In use = carried by a unit type you actually have soldiers of (guns are pre-issued to unhired types too). */
  isEquipped(uid: number) { return Object.values(this.s.units).some((u) => u.count > 0 && (u.gun === uid || u.attach === uid || u.charm === uid)); }
  // ---------- selling ----------
  private item(uid: number): Gun | Gear | undefined { return this.gun(uid) ?? this.gearItem(uid); }
  /** What an item sells for: ~20 s of that colour's income, doubling per rarity step. Guns pay in their unit type's
   * colour, charms in their zombie type's colour, attachments in whichever released colour you have least of. */
  sellValue(uid: number): Sale | null {
    const it = this.item(uid);
    if (!it) return null;
    const open = this.colours;
    const has = (c: StrainId) => open.includes(c);
    let colour: StrainId;
    if ('cls' in it) colour = has(M.classById(it.cls).primary) ? M.classById(it.cls).primary : 'shambler';
    else if (it.kind === 'charm' && it.bane && has(it.bane)) colour = it.bane;
    else colour = [...open].sort((a, b) => this.dna(a) - this.dna(b))[0] ?? 'shambler';
    const rate = this.lnDnaPerSec()[colour];
    const idx = M.CONFIG.rarities.findIndex((r) => r.id === it.rarity);
    return { colour, ln: (Number.isFinite(rate) ? rate : 0) + Math.log(20 * Math.pow(2, idx)) };
  }
  sell(uid: number, quiet = false): Sale | null {
    if (this.isEquipped(uid)) return null;
    const v = this.sellValue(uid);
    if (!v) return null;
    this.setDna(v.colour, M.logAdd(this.dna(v.colour), v.ln));
    this.s.guns = this.s.guns.filter((g) => g.uid !== uid);
    this.s.gear = this.s.gear.filter((g) => g.uid !== uid);
    this.s.newItems = this.s.newItems.filter((x) => x !== uid);
    for (const u of Object.values(this.s.units)) { if (u.gun === uid) u.gun = null; if (u.attach === uid) u.attach = null; if (u.charm === uid) u.charm = null; }
    if (!quiet) this.emit('change');
    return v;
  }
  /** Would this item make any unit type stronger than what it has now? Those are never auto-sold. */
  isUpgrade(uid: number) {
    const it = this.item(uid);
    if (!it) return false;
    if ('cls' in it) { const u = this.s.units[it.cls]; return u.count > 0 && M.lnGunPower(it) > M.lnGunPower(this.gun(u.gun)); }
    return this.owned.some((u) => M.nlv(u, it.kind) && (this.gearItem(u[it.kind])?.value ?? -1) < it.value);
  }
  /** The best item of each kind: one per unit type's gun, attachment stat and charm target. */
  private bestOfKind() {
    const best = new Map<string, { uid: number; score: number }>();
    const consider = (key: string, uid: number, score: number) => { const b = best.get(key); if (!b || score > b.score) best.set(key, { uid, score }); };
    for (const g of this.s.guns) consider(`gun:${g.cls}`, g.uid, M.lnGunPower(g));
    for (const g of this.s.gear) consider(g.kind === 'attach' ? `attach:${g.stat}` : `charm:${g.bane ?? 'all'}`, g.uid, g.value);
    return new Set([...best.values()].map((b) => b.uid));
  }
  private matchesAutoSell(uid: number, keep?: Set<number>) {
    const it = this.item(uid);
    if (!it || !this.s.autoSell || this.isEquipped(uid)) return false;
    if (this.s.autoSell === 'best') return !(keep ?? this.bestOfKind()).has(uid);
    if (this.isUpgrade(uid)) return false;
    const idx = (r: M.RarityId) => M.CONFIG.rarities.findIndex((x) => x.id === r);
    return idx(it.rarity) <= idx(this.s.autoSell);
  }
  setAutoSell(r: AutoSell) { this.s.autoSell = r; this.emit('change'); }
  /** Items in the stash that the current auto-sell rule would sell. */
  autoSellMatches() { const keep = this.bestOfKind(); return [...this.s.guns, ...this.s.gear].map((x) => x.uid).filter((uid) => this.matchesAutoSell(uid, keep)); }
  sellMatching() { let n = 0; for (const uid of this.autoSellMatches()) if (this.sell(uid, true)) n++; this.emit('change'); return n; }
  markSeen() { if (this.s.newItems.length) { this.s.newItems = []; this.emit('change'); } }
  private randomOwnedClass(): ClassId { const o = this.owned; return (o[Math.floor(Math.random() * o.length)] ?? this.s.units.pistol).cls; }
  private trimStash() {
    const total = this.s.guns.length + this.s.gear.length;
    if (total <= STASH_CAP) return;
    const score = (x: Gun | Gear) => ('cls' in x ? M.lnGunPower(x) : Math.log(1 + x.value) * 20);
    // never trim anything a unit type holds, hired or not (e.g. the gun waiting for a type you'll hire later)
    const held = (uid: number) => Object.values(this.s.units).some((u) => u.gun === uid || u.attach === uid || u.charm === uid);
    const all = [...this.s.guns, ...this.s.gear].filter((x) => !held(x.uid)).sort((a, b) => score(a) - score(b));
    const drop = new Set(all.slice(0, total - STASH_CAP).map((x) => x.uid));
    this.s.guns = this.s.guns.filter((x) => !drop.has(x.uid));
    this.s.gear = this.s.gear.filter((x) => !drop.has(x.uid));
  }
  private addGun(cls: ClassId, minRarity: number, ilvlBonus: number, isDrop: boolean): Gun {
    const g: Gun = {
      uid: this.s.nextUid++, cls, rarity: isDrop || minRarity ? M.rollRarity(Math.random, minRarity) : 'common',
      ilvl: this.best + ilvlBonus + (isDrop && Math.random() < 0.15 ? 1 + Math.floor(Math.random() * 3) : 0),
    };
    this.s.guns.push(g);
    if (isDrop || minRarity) this.s.newItems.push(g.uid);
    this.trimStash();
    this.autoEquip();   // always: units carry their best gear
    return g;
  }
  private addGear(minRarity = 0): Gear {
    const g = M.rollGear(Math.random, this.s.nextUid++, minRarity);
    this.s.gear.push(g);
    this.s.newItems.push(g.uid);
    this.trimStash();
    this.autoEquip();   // always: units carry their best gear
    return g;
  }
  /** A random drop: 60% a gun for one of your unit types, 40% an attachment or charm. */
  private rollLoot(minRarity = 0, cls?: ClassId, ilvlBonus = 0, canAutoSell = true): Loot {
    const loot: Loot = !cls && Math.random() < 0.4 ? { type: 'gear', gear: this.addGear(minRarity) } : { type: 'gun', gun: this.addGun(cls ?? this.randomOwnedClass(), minRarity, ilvlBonus, true) };
    const uid = loot.type === 'gun' ? loot.gun.uid : loot.gear.uid;
    if (canAutoSell && this.s.autoSell === 'best') {
      // keep-best: the new item may replace an older one, so sweep the whole stash
      for (const x of this.autoSellMatches()) { const v = this.sell(x, true); if (!v) continue; this.soldCount++; if (x === uid) loot.sold = v; else loot.alsoSold = (loot.alsoSold ?? 0) + 1; }
    } else if (canAutoSell && this.matchesAutoSell(uid)) { const v = this.sell(uid, true); if (v) { loot.sold = v; this.soldCount++; } }
    return loot;
  }
  private soldCount = 0;

  // ---------- the stream ----------
  /** A zombie was shredded: bank its DNA (silently) and maybe drop an item. */
  // ---------- combo (live play only; not saved) ----------
  // One combo for the whole squad: every kill builds it, up to ×2 DNA at CONFIG.combo.max kills (a long streak). It drops
  // to 0 after a few seconds without a kill, and halves whenever a zombie reaches the shredder.
  private comboState = { n: 0, idle: 0, last: null as ZombieId | null };
  comboBest = 0;
  private comboBonus() { return 0.1 * M.plv(this.s.prestige, 'combo'); }
  comboOf(_s?: ZombieId) { return this.comboState.n; }
  comboMultOf(_s?: ZombieId) { return M.comboMult(this.comboState.n, this.comboBonus()); }
  /** The running combo for the badge (and the type of the last kill, for its face). */
  get topCombo(): { id: ZombieId | null; n: number } { return { id: this.comboState.last, n: this.comboState.n }; }
  get combo() { return this.comboState.n; }
  get comboMult() { return M.comboMult(this.comboState.n, this.comboBonus()); }
  /** Used for the steady income during a horde. */
  get comboMultAvg() { return this.comboMult; }
  /** Called every frame by the battle: the combo drops to 0 after a few seconds without any kill. */
  comboTick(dt: number) { const c = this.comboState; if (c.n && (c.idle += dt) >= M.CONFIG.combo.timeoutSec) { c.n = 0; c.idle = 0; } }
  /** A zombie reached the shredder: the combo halves. */
  comboBreak(_s?: ZombieId) { this.comboState.n = Math.floor(this.comboState.n / 2); }

  /** The colour a kill pays in: its family's, or (for horde zombies of a family you haven't released yet) the nearest
   * released colour it descends from, so you never get DNA you can't see or use. */
  payColour(strain: ZombieId): StrainId {
    let id: ZombieId | undefined = M.familyOf(strain);
    for (let guard = 0; id && guard < 8; guard++) {
      if (this.s.strains[id]?.unlocked) return M.familyOf(id);
      id = M.strainById(id).unlock?.from;
    }
    return 'shambler';
  }
  /** Colours to show in the top bar: every released colour, plus any colour you hold DNA in. */
  get shownColours(): StrainId[] { const c = new Set(this.colours); return M.COLOURS.filter((x) => c.has(x) || Number.isFinite(this.dna(x))); }
  /** A zombie was shredded. `mult` scales its DNA (special zombies), `lootMult` its item chance. */
  zombieKilled(strain: ZombieId, tier: number, opts: { silent?: boolean; mult?: number; lootMult?: number; shredded?: boolean } = {}): Loot | null {
    const paid = (opts.mult ?? 1) > 0;
    // shredded zombies don't count for the combo
    if (!opts.silent && !opts.shredded) { const c = this.comboState; c.n++; c.idle = 0; c.last = strain; this.comboBest = Math.max(this.comboBest, c.n); }
    const col = this.payColour(strain);
    if (paid) this.setDna(col, M.logAdd(this.dna(col), M.lnDnaPerKill(strain, tier, this.fx) + (this.s.strains[strain]?.ult ? Math.log(M.CONFIG.zUltDna) : 0) + Math.log((opts.silent ? 1 : this.comboMultOf(strain)) * (opts.mult ?? 1))));
    this.s.kills++;
    if (Math.random() >= Math.min(0.5, M.dropChance(this.s.strains, this.fx) * (opts.lootMult ?? 1))) return null;
    const loot = this.rollLoot();
    if (!opts.silent) this.emit('loot', loot);
    return loot;
  }
  /** During a horde the stream pauses, and horde kills pay no DNA. Instead you keep earning your normal stream income
   * (with your combo) every second, so income stays a straight line through hordes instead of a lump at the end. */
  /** Combo multiplier used for the steady income: your average combo when the horde started. */
  steadyCombo = 1;
  earnSteady(dt: number) {
    const rate = this.lnDnaPerSec(), lm = Math.log(dt * this.steadyCombo);
    for (const c of M.STRAIN_IDS) if (Number.isFinite(rate[c])) this.setDna(c, M.logAdd(this.dna(c), rate[c] + lm));
  }
  get autoHorde() { return this.fx.autoHorde && this.s.autoHordeOn; }

  // ---------- hordes ----------
  get nextHorde() { return this.s.hordes + 1; }
  hordeOdds(k = this.nextHorde) { return M.hordeOdds(this.squad(), this.fx, k); }
  startHorde() { this.emit('horde-start', this.nextHorde); }
  hordeWon(k: number) {
    if (k !== this.nextHorde) return;
    const h = M.hordeDef(k);
    this.s.hordes = k;
    this.hordeFailOdds = 0;
    // a new colour joins the stream
    for (const [id, hk] of Object.entries(M.COLOUR_HORDE) as [M.ZombieId, number][]) if (hk === k && !this.s.strains[id].unlocked) { this.s.strains[id].unlocked = true; this.emit('release', id); }
    this.refitGuns();   // your guns are refitted to at least this horde's tier
    // reward: a rare+ gun for the newly unlocked type, or an epic+ item for elite hordes
    const loot = h.cls ? this.rollLoot(2, h.cls, 2, false) : this.rollLoot(3, undefined, 0, false);
    this.emit('horde-won', { k, loot });
    this.emit('change');
  }
  hordeLost(k: number) { this.hordeFailOdds = this.hordeOdds(k); this.emit('horde-lost', k); }
  /** Odds when the last attempt at the next horde was lost (0 if none). War Drums waits for clearly better odds. */
  hordeFailOdds = 0;
  /** Odds War Drums waits for before starting the next horde. */
  get autoHordeNeeds() { return Math.max(M.CONFIG.hordeWinOdds, this.hordeFailOdds * 1.15); }

  // ---------- passive tree ----------
  /** Passives already taken in a region (each region prices its own passives). */
  regionAlloc(region: number) { return this.s.alloc.filter((a) => treeNode(a)?.region === region).length; }
  treeCost(id: string) { const n = treeNode(id); return n && n.region >= 0 ? M.lnTreeCost(this.regionAlloc(n.region), REGIONS[n.region]) : M.lnTreeCost(0); }
  treeColour(id: string): StrainId { const n = treeNode(id); return n && n.region >= 0 ? REGIONS[n.region].dna : 'shambler'; }
  regionOpen(region: number) { return region < 0 || REGIONS[region].horde <= this.s.hordes; }
  canAllocate(id: string) {
    const n = treeNode(id);
    if (!n || n.id === 'start' || this.s.alloc.includes(id) || !this.regionOpen(n.region)) return false;
    if (!this.s.strains[this.treeColour(id)].unlocked) return false;   // paid in a colour you haven't released yet
    return n.links.some((l) => l === 'start' || this.s.alloc.includes(l));
  }
  canAffordNode(id: string) { return this.canAllocate(id) && this.canAfford(this.treeColour(id), this.treeCost(id)); }
  allocate(id: string) {
    if (!this.canAllocate(id) || !this.pay(this.treeColour(id), this.treeCost(id))) return;
    this.s.alloc.push(id);
    this.emit('allocate', id);
    this.emit('change');
  }
  allocatableCount() { return TREE.filter((n) => this.canAffordNode(n.id)).length; }



  // ---------- persistence ----------
  save() {
    this.s.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* storage blocked */ }
  }
  /**
   * Loads the save. Game updates must never lose progress: older formats are converted, and if a save can't be read
   * it is copied to a backup key before anything is written. A copy of the last good save is kept every launch.
   */
  load(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const old = (JSON.parse(raw) as { version: number }).version;
      this.s = migrate(JSON.parse(raw));
      if (old < 6) this.settleTiers();
      this.refitGuns();   // guns keep up with your toughest zombie tier
      this.autoEquip();   // units always carry their best gear
      this.fxCache = null; this.syncLive();
      try { localStorage.setItem(`${SAVE_KEY}-last-good`, raw); } catch { /* storage full */ }
      this.s.lastSeen = Date.now();
    } catch {
      if (raw) try { localStorage.setItem(`${SAVE_KEY}-backup-${Date.now()}`, raw); } catch { /* storage full */ }
      return;
    }
  }
  /** After an upgrade from an older save: lower tiers until the squad keeps up, so nobody starts out overrun.
   * Raising them back up to the old best tier stays free. */
  private settleTiers() {
    for (let guard = 0; guard < 2000 && this.keepUp() < 1.2; guard++) {
      const top = M.ZOMBIE_IDS.filter((c) => this.s.strains[c].unlocked && this.s.strains[c].tier > 1)
        .sort((a, b) => this.s.strains[b].tier - this.s.strains[a].tier)[0];
      if (!top) break;
      this.s.strains[top].tier--;
    }
  }
  /**
   * The player is stuck (overrun for a long time): roll zombie types back until the squad keeps up comfortably.
   * Tiers and Spawn levels are really lost (best tier too), so the DNA spent on them is gone.
   * Lowers whichever type adds the most work for the squad first. Returns what changed.
   */
  rollBack(target = 1.25): { id: ZombieId; tiers: number; spawn: number }[] {
    const lost = new Map<ZombieId, { tiers: number; spawn: number }>();
    const squad = this.squad(), fx = this.fx;
    for (let guard = 0; guard < 5000 && this.keepUp() < target; guard++) {
      let worst: ZombieId | null = null, worstLoad = -1;
      for (const z of M.activeStrains(this.s.strains)) {
        const x = this.s.strains[z];
        if (x.tier <= 1 && x.spawn <= 0) continue;
        const load = M.spawnRate(z, x.spawn) * M.varietyAvg(x.tier) * Math.exp(Math.min(60, M.lnStrainHp(z, x) - M.lnSquadDps(squad, fx, z)));
        if (load > worstLoad) { worstLoad = load; worst = z; }
      }
      if (!worst) break;
      const x = this.s.strains[worst], l = lost.get(worst) ?? { tiers: 0, spawn: 0 };
      if (x.tier > 1) { x.tier--; x.maxTier = x.tier; l.tiers++; } else { x.spawn--; l.spawn++; }
      lost.set(worst, l);
    }
    if (lost.size) { this.save(); this.emit('change'); }
    return [...lost.entries()].map(([id, v]) => ({ id, ...v }));
  }
  // ---------- prestige ----------
  get prestigeGain() { return M.prestigeGain(this.s.hordes, this.s.prestige); }
  /** Reset the run for points. Keeps perks, points, play time. Head Start gives DNA of every colour. */
  /** Prestige with the perks picked on the way out (levels to add per perk); unspent points are kept. */
  prestige(picks: Partial<Record<M.PerkId, number>> = {}) {
    const gain = this.prestigeGain;
    if (gain < 1) return;
    const p: M.Prestige = { ...this.s.prestige, perks: { ...this.s.prestige.perks } };
    p.runs++; p.points += gain; p.earned += gain;
    for (const [id, n] of Object.entries(picks) as [M.PerkId, number][]) {
      const d = M.perkById(id);
      for (let i = 0; i < n; i++) { const lv = M.plv(p, id); if (lv >= d.max || p.points < d.cost) break; p.points -= d.cost; p.perks[id] = lv + 1; }
    }
    const playSec = this.s.playSec, tut = this.s.tut, kills = this.s.kills, bossKills = this.s.bossKills, player = this.s.player;
    this.s = freshSave();
    this.s.prestige = p; this.s.playSec = playSec; this.s.tut = tut; this.s.kills = kills; this.s.bossKills = bossKills; this.s.player = player;
    this.applyHeadStart();
    this.fxCache = null; this.syncLive();
    this.save();
    this.emit('reset'); this.emit('prestige', gain); this.emit('change');
  }
  private applyHeadStart() {
    const hs = M.plv(this.s.prestige, 'headstart');
    if (hs) for (const c of M.STRAIN_IDS) this.setDna(c, M.logAdd(this.dna(c), Math.log(500 * 4 ** hs)));
  }
  buyPerk(id: M.PerkId) {
    const d = M.perkById(id), p = this.s.prestige, lv = M.plv(p, id);
    if (lv >= d.max || p.points < d.cost) return;
    p.points -= d.cost; p.perks[id] = lv + 1;
    if (id === 'headstart') this.setDna('shambler', M.logAdd(this.dna('shambler'), Math.log(500 * 4 ** (lv + 1))));   // a taste right away
    this.fxCache = null; this.syncLive();
    this.emit('change');
  }
  hardReset() { this.s = freshSave(); this.save(); this.emit('reset'); this.emit('change'); }
  exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.s)))); }
  /** Read a save code without loading it (throws on an invalid code). */
  static decode(code: string): SaveData { return migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim()))))); }
  /** A short summary of a save, for the save-slot list. */
  static summary(d: SaveData) {
    return { best: M.bestTier(d.strains), hordes: d.hordes, kills: d.kills, types: M.activeStrains(d.strains).length,
      soldiers: Object.values(d.units).reduce((a, u) => a + u.count, 0), playSec: d.playSec ?? 0 };
  }
  importSave(code: string) {
    this.s = Game.decode(code);
    this.s.lastSeen = Date.now();   // a loaded save starts fresh: no offline time from when it was made
    this.refitGuns(); this.autoEquip(); this.fxCache = null; this.syncLive();
    this.save();
    this.emit('reset');
    this.emit('change');
  }
}

export type { Attachment, Charm };
export const game = new Game();
