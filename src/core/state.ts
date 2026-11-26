// Game state and every action that changes it. The Phaser scene and the DOM UI both talk to the single
// `game` instance exported here; it never touches rendering.
import * as M from './model.ts';
import type { ClassId, Gun, Recruit, StrainId } from './model.ts';
import { REGIONS, TREE, treeFx, treeNode, type Fx } from './tree.ts';

const C = M.CONFIG;
const SAVE_KEY = 'zombie-idle-save-v4';
const STASH_CAP = 40;
const OFFLINE_CAP_SEC = 12 * 3600;

export interface SaveData {
  version: 4;
  dna: number | null;      // ln amount; null = 0
  tier: number;            // active DNA Count tier (can be dialled down)
  maxTier: number;         // highest tier bought
  spawnLv: number;
  recruits: Recruit[];
  guns: Gun[];
  alloc: string[];         // allocated passive-tree nodes
  hordes: number;          // hordes beaten
  eliteSlots: number;
  autoHordeOn: boolean;
  nextUid: number;
  kills: number;
  newGuns: number[];
  lastSeen: number;
}
export interface OfflineReport { seconds: number; kills: number; lnDna: number; guns: Gun[]; tiers: number }
type Listener = (evt: string, data?: unknown) => void;

function freshSave(): SaveData {
  return {
    version: 4, dna: null, tier: 1, maxTier: 1, spawnLv: 0,
    recruits: [{ id: 1, cls: 'pistol', level: 0, gun: 2 }],
    guns: [{ uid: 2, cls: 'pistol', rarity: 'common', ilvl: 1 }],
    alloc: [], hordes: 0, eliteSlots: 0, autoHordeOn: true, nextUid: 3, kills: 0, newGuns: [], lastSeen: Date.now(),
  };
}

export class Game {
  s: SaveData = freshSave();
  private listeners: Listener[] = [];
  private fxCache: { key: string; fx: Fx } | null = null;

  on(fn: Listener) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((l) => l !== fn); }; }
  emit(evt: string, data?: unknown) { for (const l of this.listeners) l(evt, data); }

  // ---------- derived ----------
  get fx(): Fx {
    const key = this.s.alloc.join(',');
    if (this.fxCache?.key !== key) this.fxCache = { key, fx: treeFx(this.s.alloc) };
    return this.fxCache.fx;
  }
  get dna() { return this.s.dna ?? -Infinity; }
  private setDna(v: number) { this.s.dna = v === -Infinity ? null : v; }
  canAfford(ln: number) { return ln <= this.dna + 1e-9; }
  private pay(ln: number) { if (!this.canAfford(ln)) return false; this.setDna(M.logSub(this.dna, ln)); return true; }

  gun(uid: number | null | undefined) { return uid == null ? undefined : this.s.guns.find((g) => g.uid === uid); }
  recruit(id: number) { return this.s.recruits.find((r) => r.id === id); }
  squad() { return this.s.recruits.map((r) => ({ r, gun: this.gun(r.gun) })); }
  get slots() { return M.slots(this.fx, this.s.eliteSlots); }
  classUnlocked(c: ClassId) { return M.classById(c).horde <= Math.min(this.s.hordes, 7); }
  get spawnRate() { return M.spawnRate(this.s.spawnLv); }
  capacity(tier = this.s.tier, spawnLv = this.s.spawnLv) { return M.killCapacity(this.squad(), this.fx, tier, spawnLv); }
  /** Kill capacity ÷ spawn rate. ≥ 1 means the squad keeps up with the stream. */
  keepUp(tier = this.s.tier, spawnLv = this.s.spawnLv) { return this.capacity(tier, spawnLv) / M.spawnRate(spawnLv); }
  lnDnaPerKill(strain: StrainId, tier = this.s.tier) { return M.lnDnaPerKill(tier, strain, this.fx); }
  /** DNA per second at the current settings (what the stream actually pays). */
  lnDnaPerSec() {
    const mix = M.mixAt(this.s.tier);
    const kills = Math.min(this.spawnRate, this.capacity());
    return M.logSumExp(mix.map((m) => this.lnDnaPerKill(m.id))) - Math.log(mix.length) + Math.log(Math.max(1e-9, kills));
  }
  stats(r: Recruit) { return M.recruitStats(r, this.gun(r.gun), this.fx); }
  recruitDps(r: Recruit) {
    const mix = M.mixAt(this.s.tier);
    const st = this.stats(r);
    return st.lnDps + Math.log(mix.reduce((a, m) => a + M.matchMult(r.cls, m.id, this.fx), 0) / mix.length);
  }

  // ---------- zombie dials ----------
  tierCost() { return M.lnTierCost(this.s.maxTier); }
  raiseTier() {
    if (this.s.tier < this.s.maxTier) this.s.tier++;
    else if (this.pay(this.tierCost())) { this.s.maxTier++; this.s.tier++; }
    else return;
    this.emit('change');
  }
  lowerTier() { if (this.s.tier > 1) { this.s.tier--; this.emit('change'); } }
  spawnCost() { return M.lnSpawnCost(this.s.spawnLv); }
  buySpawn() { if (this.s.spawnLv < C.spawnMax && this.pay(this.spawnCost())) { this.s.spawnLv++; this.emit('change'); } }

  // ---------- squad ----------
  trainCost(r: Recruit) { return M.lnTrainCost(r.cls, r.level, this.fx); }
  train(id: number, max = 1) {
    const r = this.recruit(id);
    if (!r) return 0;
    let n = 0;
    while (n < max && this.pay(this.trainCost(r))) { r.level++; n++; }
    if (n) this.emit('change');
    return n;
  }
  hireCost(c: ClassId) { return M.lnHireCost(c, this.s.recruits.filter((r) => r.cls === c).length); }
  canHire(c: ClassId) { return this.classUnlocked(c) && this.s.recruits.length < this.slots && this.canAfford(this.hireCost(c)); }
  hire(c: ClassId) {
    if (!this.canHire(c)) return;
    this.pay(this.hireCost(c));
    const r: Recruit = { id: this.s.nextUid++, cls: c, level: 0, gun: null };
    this.s.recruits.push(r);
    const g = this.addGun(c, 0, 0, false); // every recruit arrives with a standard-issue gun at your current tier
    r.gun = g.uid;
    this.emit('hire', r);
    this.emit('change');
  }
  dismiss(id: number) {
    if (this.s.recruits.length <= 1) return;
    this.s.recruits = this.s.recruits.filter((r) => r.id !== id);
    this.emit('change');
  }
  equip(id: number, uid: number) {
    const r = this.recruit(id), g = this.gun(uid);
    if (!r || !g || g.cls !== r.cls) return;
    const other = this.s.recruits.find((x) => x.gun === uid);
    if (other) other.gun = r.gun;
    r.gun = uid;
    this.emit('change');
  }
  autoEquip() {
    const used = new Set<number>();
    for (const r of [...this.s.recruits].sort((a, b) => M.classById(b.cls).dps - M.classById(a.cls).dps)) {
      const best = this.s.guns.filter((g) => g.cls === r.cls && !used.has(g.uid)).sort((a, b) => M.lnGunPower(b) - M.lnGunPower(a))[0];
      r.gun = best?.uid ?? null;
      if (best) used.add(best.uid);
    }
  }
  scrap(uid: number) {
    if (this.s.recruits.some((r) => r.gun === uid)) return;
    this.s.guns = this.s.guns.filter((g) => g.uid !== uid);
    this.emit('change');
  }
  markSeen() { if (this.s.newGuns.length) { this.s.newGuns = []; this.emit('change'); } }

  private addGun(cls: ClassId, minRarity: number, ilvlBonus: number, isDrop: boolean, rng = Math.random): Gun {
    const g: Gun = {
      uid: this.s.nextUid++, cls, rarity: isDrop || minRarity ? M.rollRarity(rng, minRarity) : 'common',
      ilvl: this.s.tier + ilvlBonus + (isDrop && rng() < 0.15 ? 1 + Math.floor(rng() * 3) : 0),
    };
    this.s.guns.push(g);
    if (isDrop || minRarity) this.s.newGuns.push(g.uid);
    if (this.s.guns.length > STASH_CAP) {
      const removable = this.s.guns.filter((x) => !this.s.recruits.some((r) => r.gun === x.uid)).sort((a, b) => M.lnGunPower(a) - M.lnGunPower(b));
      const drop = new Set(removable.slice(0, this.s.guns.length - STASH_CAP).map((x) => x.uid));
      this.s.guns = this.s.guns.filter((x) => !drop.has(x.uid));
    }
    if (this.fx.autoEquip) this.autoEquip();
    return g;
  }

  // ---------- the stream ----------
  /** A zombie was shredded: bank its DNA (silently) and maybe drop a gun for one of your recruits' classes. */
  zombieKilled(strain: StrainId, tier: number, opts: { silent?: boolean } = {}): Gun | null {
    this.setDna(M.logAdd(this.dna, this.lnDnaPerKill(strain, tier)));
    this.s.kills++;
    if (Math.random() >= C.dropChance * (1 + this.fx.drop)) return null;
    const cls = this.s.recruits[Math.floor(Math.random() * this.s.recruits.length)].cls;
    const g = this.addGun(cls, 0, 0, true);
    if (!opts.silent) this.emit('loot', g);
    return g;
  }

  /** Free automations only (they never spend DNA): Auto-Equip keeps the best guns on; Auto-Horde is run by the scene. */
  get autoHorde() { return this.fx.autoHorde && this.s.autoHordeOn; }

  // ---------- hordes ----------
  get nextHorde() { return this.s.hordes + 1; }
  hordeOdds(k = this.nextHorde) { return M.hordeOdds(this.squad(), this.fx, k); }
  startHorde() { this.emit('horde-start', this.nextHorde); }
  hordeWon(k: number) {
    if (k !== this.nextHorde) return;
    const h = M.hordeDef(k);
    this.s.hordes = k;
    if (h.elite && this.s.eliteSlots < C.maxSlots - 6) this.s.eliteSlots++;
    // reward gun: rare+ for the newly unlocked class, or epic+ for elite hordes
    const cls = h.cls ?? this.s.recruits[0].cls;
    const g = this.addGun(cls, h.elite ? 3 : 2, 2, true);
    this.emit('horde-won', { k, gun: g });
    this.emit('change');
  }
  hordeLost(k: number) { this.emit('horde-lost', k); }

  // ---------- passive tree ----------
  treeCost() { return M.lnTreeCost(this.s.alloc.length); }
  regionOpen(region: number) { return region < 0 || REGIONS[region].horde <= this.s.hordes; }
  canAllocate(id: string) {
    const n = treeNode(id);
    if (!n || n.id === 'start' || this.s.alloc.includes(id) || !this.regionOpen(n.region)) return false;
    return n.links.some((l) => l === 'start' || this.s.alloc.includes(l));
  }
  allocate(id: string) {
    if (!this.canAllocate(id) || !this.pay(this.treeCost())) return;
    this.s.alloc.push(id);
    this.emit('allocate', id);
    this.emit('change');
  }
  allocatableCount() { return TREE.filter((n) => this.canAllocate(n.id)).length; }

  // ---------- offline ----------
  simulateOffline(seconds: number): OfflineReport | null {
    seconds = Math.min(seconds, OFFLINE_CAP_SEC);
    if (seconds < 60) return null;
    const before = this.dna, tier0 = this.s.maxTier, kills0 = this.s.kills;
    const gunsBefore = new Set(this.s.guns.map((g) => g.uid));
    const DT = 10;
    for (let t = 0; t < seconds; t += DT) {
      const kills = Math.min(this.spawnRate, this.capacity()) * DT;
      const mix = M.mixAt(this.s.tier);
      const ln = M.logSumExp(mix.map((m) => this.lnDnaPerKill(m.id))) - Math.log(mix.length);
      this.setDna(M.logAdd(this.dna, ln + Math.log(Math.max(1e-9, kills))));
      this.s.kills += Math.round(kills);
      if (Math.random() < kills * C.dropChance * (1 + this.fx.drop)) this.addGun(this.s.recruits[Math.floor(Math.random() * this.s.recruits.length)].cls, 0, 0, true);
    }
    this.emit('change');
    return { seconds, kills: this.s.kills - kills0, lnDna: M.logSub(this.dna, before), guns: this.s.guns.filter((g) => !gunsBefore.has(g.uid)), tiers: this.s.maxTier - tier0 };
  }

  // ---------- persistence ----------
  save() {
    this.s.lastSeen = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); } catch { /* storage blocked */ }
  }
  /**
   * Loads the save. Game updates must never lose progress: new fields are filled in from defaults, and if a save
   * can't be read (or comes from a format this version doesn't understand) it is copied to a backup key before
   * anything else is written, so it can always be recovered. A copy of the last good save is also kept each launch.
   */
  load(): OfflineReport | null {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw) as SaveData;
      if (data.version !== 4) throw new Error(`save version ${data.version}`);
      this.s = { ...freshSave(), ...data };
      try { localStorage.setItem(`${SAVE_KEY}-last-good`, raw); } catch { /* storage full */ }
      return this.simulateOffline((Date.now() - this.s.lastSeen) / 1000);
    } catch {
      if (raw) try { localStorage.setItem(`${SAVE_KEY}-backup-${Date.now()}`, raw); } catch { /* storage full */ }
      return null;
    }
  }
  resumeAfter(seconds: number) { return this.simulateOffline(seconds); }
  hardReset() { this.s = freshSave(); this.save(); this.emit('reset'); this.emit('change'); }
  exportSave() { return btoa(unescape(encodeURIComponent(JSON.stringify(this.s)))); }
  importSave(code: string) {
    const data = JSON.parse(decodeURIComponent(escape(atob(code.trim())))) as SaveData;
    if (data.version !== 4) throw new Error('Unknown save version');
    this.s = { ...freshSave(), ...data };
    this.save();
    this.emit('reset');
    this.emit('change');
  }
}

export const game = new Game();
