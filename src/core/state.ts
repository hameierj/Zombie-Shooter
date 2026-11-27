// Game state and every action that changes it. The Phaser scene and the DOM UI both talk to the single
// `game` instance exported here; it never touches rendering.
import * as M from './model.ts';
import type { Attachment, Charm, ClassId, DnaMap, Gear, Gun, Recruit, StrainId, Strains, Unit, UnitNodeId, UnitV5, ZombieId } from './model.ts';
import { REGIONS, TREE, treeFx, treeNode, type Fx } from './tree.ts';

const C = M.CONFIG;
const SAVE_KEY = 'zombie-idle-save-v4';   // unchanged so existing saves are always found and upgraded
const STASH_CAP = 60;
const OFFLINE_CAP_SEC = 12 * 3600;

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
  newItems: number[];
  lastSeen: number;
}
/** A dropped item; `sold` is set when auto-sell turned it straight into DNA. */
export type Loot = ({ type: 'gun'; gun: Gun } | { type: 'gear'; gear: Gear }) & { sold?: Sale; alsoSold?: number };
export interface Sale { colour: StrainId; ln: number }
/** Auto-sell rule: sell drops of a rarity and lower, or 'best' = keep equipped items plus the best of each kind. */
export type AutoSell = M.RarityId | 'best' | null;
export interface OfflineReport { seconds: number; kills: number; sold: number; /** ln of DNA gained per colour */ dna: Record<StrainId, number>; items: number; }
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
    alloc: [], hordes: 0, autoHordeOn: true, autoSell: null, nextUid: 3, kills: 0, newItems: [], lastSeen: Date.now(),
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
  return { ...f, ...s, dna: { ...emptyDna(), ...s.dna }, strains: { ...emptyStrains(), ...s.strains }, units: { ...emptyUnits(), ...s.units }, gear: s.gear ?? [] };
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
    const key = this.s.alloc.join(',');
    if (this.fxCache?.key !== key) this.fxCache = { key, fx: treeFx(this.s.alloc) };
    return this.fxCache.fx;
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
  get unitCap() { return M.unitCap(this.best); }
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
    else if (this.pay(M.familyOf(s), this.tierCost(s))) { x.maxTier++; x.tier++; }
    else return;
    this.emit('change');
  }
  lowerTier(s: ZombieId) { const x = this.s.strains[s]; if (x.tier > 1) { x.tier--; this.emit('change'); } }
  spawnCost(s: ZombieId) { return M.lnSpawnCost(s, this.s.strains[s].spawn); }
  buySpawn(s: ZombieId) {
    const x = this.s.strains[s];
    if (x.spawn < C.spawnMax && this.pay(M.familyOf(s), this.spawnCost(s))) { x.spawn++; this.emit('change'); }
  }
  canRelease(s: ZombieId) {
    const u = M.strainById(s).unlock;
    return !!u && !this.s.strains[s].unlocked && this.s.strains[u.from].unlocked && this.canAfford(M.familyOf(u.from), Math.log(u.cost));
  }
  release(s: ZombieId) {
    const u = M.strainById(s).unlock;
    if (!u || !this.canRelease(s)) return;
    this.pay(M.familyOf(u.from), Math.log(u.cost));
    this.s.strains[s].unlocked = true;
    this.emit('release', s);
    this.emit('change');
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
    if (n) this.emit('change');
    return n;
  }
  nodesAffordable(c: ClassId) { return M.UNIT_NODES.filter((n) => this.node(c, n.id).canAfford).length; }

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
    this.emit('hire', u);
    this.emit('change');
  }
  dismiss(c: ClassId) {
    const u = this.s.units[c];
    if (u.count <= 0 || this.totalUnits <= 1) return;
    u.count--;
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
  isEquipped(uid: number) { return Object.values(this.s.units).some((u) => u.gun === uid || u.attach === uid || u.charm === uid); }
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
    const all = [...this.s.guns, ...this.s.gear].filter((x) => !this.isEquipped(x.uid)).sort((a, b) => score(a) - score(b));
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
    if (this.fx.autoEquip) this.autoEquip();
    return g;
  }
  private addGear(minRarity = 0): Gear {
    const g = M.rollGear(Math.random, this.s.nextUid++, minRarity);
    this.s.gear.push(g);
    this.s.newItems.push(g.uid);
    this.trimStash();
    if (this.fx.autoEquip) this.autoEquip();
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
  combo = 0;
  comboBest = 0;
  private comboIdle = 0;
  get comboMult() { return M.comboMult(this.combo); }
  /** Called every frame by the battle: the combo drops to 0 after a few seconds without a kill. */
  comboTick(dt: number) { if (this.combo && (this.comboIdle += dt) >= M.CONFIG.combo.timeoutSec) this.combo = 0; }
  /** A zombie reached the shredder: the combo halves. */
  comboBreak() { this.combo = Math.floor(this.combo / 2); }

  /** A zombie was shredded. `mult` scales its DNA (special zombies), `lootMult` its item chance. */
  zombieKilled(strain: ZombieId, tier: number, opts: { silent?: boolean; mult?: number; lootMult?: number } = {}): Loot | null {
    if (!opts.silent) { this.combo++; this.comboIdle = 0; this.comboBest = Math.max(this.comboBest, this.combo); }
    const col = M.familyOf(strain);
    this.setDna(col, M.logAdd(this.dna(col), M.lnDnaPerKill(strain, tier, this.fx) + Math.log((opts.silent ? 1 : this.comboMult) * (opts.mult ?? 1))));
    this.s.kills++;
    if (Math.random() >= Math.min(0.5, M.dropChance(this.s.strains, this.fx) * (opts.lootMult ?? 1))) return null;
    const loot = this.rollLoot();
    if (!opts.silent) this.emit('loot', loot);
    return loot;
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
  treeCost() { return M.lnTreeCost(this.s.alloc.length); }
  treeColour(id: string): StrainId { const n = treeNode(id); return n && n.region >= 0 ? REGIONS[n.region].dna : 'shambler'; }
  regionOpen(region: number) { return region < 0 || REGIONS[region].horde <= this.s.hordes; }
  canAllocate(id: string) {
    const n = treeNode(id);
    if (!n || n.id === 'start' || this.s.alloc.includes(id) || !this.regionOpen(n.region)) return false;
    return n.links.some((l) => l === 'start' || this.s.alloc.includes(l));
  }
  canAffordNode(id: string) { return this.canAllocate(id) && this.canAfford(this.treeColour(id), this.treeCost()); }
  allocate(id: string) {
    if (!this.canAllocate(id) || !this.pay(this.treeColour(id), this.treeCost())) return;
    this.s.alloc.push(id);
    this.emit('allocate', id);
    this.emit('change');
  }
  allocatableCount() { return TREE.filter((n) => this.canAffordNode(n.id)).length; }

  // ---------- offline ----------
  simulateOffline(seconds: number): OfflineReport | null {
    seconds = Math.min(seconds, OFFLINE_CAP_SEC);
    if (seconds < 60) return null;
    const before = Object.fromEntries(M.STRAIN_IDS.map((s) => [s, this.dna(s)])) as Record<StrainId, number>;
    const kills0 = this.s.kills, items0 = this.s.guns.length + this.s.gear.length, sold0 = this.soldCount;
    const DT = 10;
    for (let t = 0; t < seconds; t += DT) {
      const rates = this.lnDnaPerSec();
      const k = Math.min(1, this.keepUp());
      let kills = 0;
      for (const c of this.colours) this.setDna(c, M.logAdd(this.dna(c), rates[c] + Math.log(DT)));
      for (const z of M.activeStrains(this.s.strains)) kills += M.spawnRate(z, this.s.strains[z].spawn) * k * DT;
      this.s.kills += Math.round(kills);
      if (Math.random() < kills * M.dropChance(this.s.strains, this.fx)) this.rollLoot();
    }
    this.emit('change');
    const dna = Object.fromEntries(M.STRAIN_IDS.map((s) => [s, M.logSub(this.dna(s), before[s])])) as Record<StrainId, number>;
    return { seconds, kills: this.s.kills - kills0, dna, items: Math.max(0, this.s.guns.length + this.s.gear.length - items0), sold: this.soldCount - sold0 };
  }

  // ---------- persistence ----------
  save() {
    this.s.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* storage blocked */ }
  }
  /**
   * Loads the save. Game updates must never lose progress: older formats are converted, and if a save can't be read
   * it is copied to a backup key before anything is written. A copy of the last good save is kept every launch.
   */
  load(): OfflineReport | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const old = (JSON.parse(raw) as { version: number }).version;
      this.s = migrate(JSON.parse(raw));
      if (old < 6) this.settleTiers();
      try { localStorage.setItem(`${SAVE_KEY}-last-good`, raw); } catch { /* storage full */ }
      return this.simulateOffline((Date.now() - this.s.lastSeen) / 1000);
    } catch {
      if (raw) try { localStorage.setItem(`${SAVE_KEY}-backup-${Date.now()}`, raw); } catch { /* storage full */ }
      return null;
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
  resumeAfter(seconds: number) { return this.simulateOffline(seconds); }
  hardReset() { this.s = freshSave(); this.save(); this.emit('reset'); this.emit('change'); }
  exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.s)))); }
  importSave(code: string) {
    this.s = migrate(JSON.parse(decodeURIComponent(escape(atob(code.trim())))));
    this.save();
    this.emit('reset');
    this.emit('change');
  }
}

export type { Attachment, Charm };
export const game = new Game();
