// Core model: the single source of truth for balance, shared by the game and tools/sim.ts.
// Big numbers are stored as natural logs (ln) so play can go on forever.
//
// THE LOOP
// Zombies walk at you endlessly. Two dials control them:
//   • DNA Count (the "tier", endless): every tier gives ×1.15 DNA per zombie AND ×1.15 zombie HP.
//   • Spawn Rate (30 levels): more zombies per second, each with a little more HP.
// You raise them when your squad can keep up (kill capacity ≥ spawn rate). Squad power grows from two halves of
// equal size: Training (endless recruit levels bought with DNA) and Guns (rare drops at the current tier).
// The passive tree, recruit classes and squad size are flat bonuses that make each step easier. Hordes are optional
// challenges at fixed tiers; beating one unlocks a recruit class and a region of the tree.

export type ClassId = 'pistol' | 'bow' | 'shotgun' | 'rifle' | 'sniper' | 'flamer' | 'grenade';
export type StrainId = 'shambler' | 'runner' | 'brute' | 'spitter' | 'bloater';
export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
import type { Fx } from './tree.ts';

export interface ClassDef {
  id: ClassId; name: string; plural: string; gun: string;
  dps: number;        // base damage per second at gun ×1 and training level 0
  range: number;      // fraction of the road it can reach
  rate: number;       // shots per second (visual and per-shot damage)
  targets: number;    // zombies hit per shot (pierce, spread, splash)
  crit: number;       // base crit chance
  horde: number;      // horde that unlocks it (0 = available from the start)
  hire0: number;      // base hiring cost
}
export const CLASSES: ClassDef[] = [
  { id: 'pistol',  name: 'Pistoleer',  plural: 'Pistoleers',  gun: 'Pistol',           dps: 10, range: 0.45, rate: 2.2, targets: 1, crit: 0.10, horde: 0, hire0: 25 },
  { id: 'bow',     name: 'Hunter',     plural: 'Hunters',     gun: 'Compound Bow',     dps: 12, range: 0.85, rate: 0.9, targets: 2, crit: 0.20, horde: 1, hire0: 600 },
  { id: 'shotgun', name: 'Shotgunner', plural: 'Shotgunners', gun: 'Shotgun',          dps: 15, range: 0.35, rate: 1.1, targets: 3, crit: 0.05, horde: 2, hire0: 4000 },
  { id: 'rifle',   name: 'Rifleman',   plural: 'Riflemen',    gun: 'Assault Rifle',    dps: 20, range: 0.70, rate: 5.0, targets: 1, crit: 0.08, horde: 3, hire0: 1.2e4 },
  { id: 'sniper',  name: 'Sniper',     plural: 'Snipers',     gun: 'Sniper Rifle',     dps: 28, range: 1.00, rate: 0.45, targets: 1, crit: 0.30, horde: 4, hire0: 8e4 },
  { id: 'flamer',  name: 'Pyro',       plural: 'Pyros',       gun: 'Flamethrower',     dps: 34, range: 0.30, rate: 8.0, targets: 4, crit: 0.0,  horde: 5, hire0: 5e5 },
  { id: 'grenade', name: 'Grenadier',  plural: 'Grenadiers',  gun: 'Grenade Launcher', dps: 42, range: 0.75, rate: 0.7, targets: 4, crit: 0.05, horde: 6, hire0: 5e6 },
];
export const classById = (id: ClassId) => CLASSES.find((c) => c.id === id)!;

export interface StrainDef { id: StrainId; name: string; hp: number; dna: number; speed: number; fromTier: number }
export const STRAINS: StrainDef[] = [
  { id: 'shambler', name: 'Shambler', hp: 1.0, dna: 1.0, speed: 1.0,  fromTier: 1 },
  { id: 'runner',   name: 'Runner',   hp: 0.6, dna: 1.0, speed: 1.8,  fromTier: 6 },
  { id: 'brute',    name: 'Brute',    hp: 2.5, dna: 2.5, speed: 0.7,  fromTier: 14 },
  { id: 'spitter',  name: 'Spitter',  hp: 1.2, dna: 1.5, speed: 1.0,  fromTier: 25 },
  { id: 'bloater',  name: 'Bloater',  hp: 4.0, dna: 4.0, speed: 0.55, fromTier: 40 },
];
export const strainById = (id: StrainId) => STRAINS.find((s) => s.id === id)!;
/** Damage multipliers: guns that are good or bad against a strain. */
export const MATCH: Partial<Record<ClassId, Partial<Record<StrainId, number>>>> = {
  pistol:  { brute: 0.6, bloater: 0.7 },
  bow:     { spitter: 1.5, runner: 1.2 },
  shotgun: { runner: 1.5, brute: 1.3, spitter: 0.8 },
  rifle:   { brute: 0.7, runner: 1.3 },
  sniper:  { brute: 2.0, bloater: 1.3, runner: 0.6 },
  flamer:  { bloater: 1.6, spitter: 0.7, shambler: 1.2 },
  grenade: { bloater: 1.4, brute: 1.2, runner: 0.8 },
};

export const CONFIG = {
  R: 1.15,                  // per DNA Count tier: ×1.15 DNA per zombie and ×1.15 zombie HP
  ITEM_SHARE: 0.5,          // guns cover half of each tier's HP growth…
  // …and training the other half: ×1.06 per level. Keeping up needs ~1.2 training levels per tier. Training cost grows
  // ×1.15 per level, a little faster than income (×1.15 per tier), so big flat bonuses (new classes, keystones,
  // slots) give a big jump ahead and then the pace settles back down instead of snowballing.
  trainMult: 1.05,
  trainGrowth: 1.15,
  trainCost0: 8,
  baseHp: 6,
  baseDna: 3,
  tierCost0: 40,            // raising DNA Count from tier t costs 40·1.15^(t−1)
  spawnBase: 1.0,           // zombies per second at Spawn Rate 0
  spawnPerLevel: 0.12,      // +12% per level
  spawnMax: 30,
  spawnHpPerLevel: 0.03,    // each Spawn Rate level also gives zombies +3% HP
  spawnCost0: 20,
  spawnCostGrowth: 1.5,
  hireGrowth: 1.8,          // each unit of a type you already have makes the next one of that type ×1.8 more expensive
  maxPerType: 20,           // up to 20 units of each type (7 types → up to 140 recruits)…
  // …but barracks space grows with your best DNA Count tier: 2 of each type at first, +1 every 10 tiers (20 at tier 180).
  // Tying it to progress (not DNA) stops a feedback loop where more units → faster tiers → cheaper units → more units.
  unitsBase: 2,
  unitExponent: 0.75,
  tiersPerUnit: 10,
  baseCritDmg: 2,
  dropChance: 0.0012,       // gun drop per zombie shredded (rare: minutes apart)
  treeCost0: 15,
  treeCostGrowth: 1.9,      // each allocated passive makes the next ×1.9 more expensive
  walkSec: 10,              // a normal zombie crosses the whole road in 10 s
  // Hordes
  hordeZombies: 60,
  hordeTimerSec: 60,
  hordeSpawnPerSec: 3,
  rarities: [
    { id: 'common',    weight: 62, power: 1.0 },
    { id: 'uncommon',  weight: 25, power: 1.3 },
    { id: 'rare',      weight: 9,  power: 1.7 },
    { id: 'epic',      weight: 3,  power: 2.3 },
    { id: 'legendary', weight: 1,  power: 3.2 },
  ] as { id: RarityId; weight: number; power: number }[],
};
const C = CONFIG;
export const lnR = Math.log(C.R);

export const logAdd = (a: number, b: number): number =>
  a === -Infinity ? b : b === -Infinity ? a : Math.max(a, b) + Math.log1p(Math.exp(-Math.abs(a - b)));
export const logSub = (a: number, b: number): number =>
  b >= a ? -Infinity : b === -Infinity ? a : a + Math.log1p(-Math.exp(b - a));
export const logSumExp = (xs: number[]) => xs.reduce(logAdd, -Infinity);

// ---------- Hordes ----------
export interface HordeDef { index: number; name: string; tier: number; unlocks: string; cls?: ClassId; region: number; elite: boolean }
const HORDE_NAMES = ['The Shamblers', 'Fast Movers', 'Heavy Hitters', 'The Swarm', 'Brute Squad', 'Acid Rain', 'The Bloat'];
const HORDE_TIERS = [6,20,40,70,110,160,220];
/** Horde k (1-based). 1–7 unlock classes/regions; beyond that, endless Elite hordes every 15 tiers. */
export function hordeDef(k: number): HordeDef {
  if (k <= 7) {
    const cls = CLASSES.find((c) => c.horde === k)?.id;
    const unlocks = cls ? `${classById(cls).plural} + the ${['', 'Marksman', 'Breacher', 'Suppression', 'Deadeye', 'Inferno', 'Demolition'][k]} tree region` : 'The Command tree region';
    return { index: k, name: HORDE_NAMES[k - 1], tier: HORDE_TIERS[k - 1], unlocks, cls, region: k, elite: false };
  }
  const n = k - 7;
  return { index: k, name: `Elite Horde ${n}`, tier: HORDE_TIERS[6] + 30 * n, unlocks: 'An epic gun', region: -1, elite: true };
}
export const hordeMix = (k: number) => mixAt(hordeDef(k).tier);

// ---------- Zombies ----------
export const spawnRate = (spawnLv: number) => C.spawnBase * (1 + C.spawnPerLevel * spawnLv);
export const mixAt = (tier: number) => STRAINS.filter((s) => s.fromTier <= tier);
export const lnZombieHp = (tier: number, strain: StrainId, spawnLv: number) =>
  Math.log(C.baseHp * strainById(strain).hp * (1 + C.spawnHpPerLevel * spawnLv)) + (tier - 1) * lnR;
export const lnDnaPerKill = (tier: number, strain: StrainId, fx: Fx) =>
  Math.log(C.baseDna * strainById(strain).dna * (1 + fx.dna)) + (tier - 1) * lnR;
export const lnTierCost = (tier: number) => Math.log(C.tierCost0) + (tier - 1) * lnR;
export const lnSpawnCost = (lv: number) => Math.log(C.spawnCost0) + lv * Math.log(C.spawnCostGrowth);

// ---------- Guns & recruits ----------
export interface Gun { uid: number; cls: ClassId; rarity: RarityId; ilvl: number }
/** One unit type in the squad: how many you have, their shared training level and their issued gun. */
export interface Unit { cls: ClassId; count: number; level: number; gun: number | null }
/** Pre-v5 saves stored individual recruits; kept only to migrate old saves. */
export interface Recruit { id: number; cls: ClassId; level: number; gun: number | null }
/** What the maths needs to know about a unit type. */
export interface SquadEntry { r: { cls: ClassId; level: number }; gun?: Gun; count: number }
export const rarityPower = (r: RarityId) => C.rarities.find((x) => x.id === r)!.power;
export const lnGunPower = (g: Gun | undefined) => (g ? Math.log(rarityPower(g.rarity)) + C.ITEM_SHARE * lnR * (g.ilvl - 1) : -Infinity);
export const lnTrainCost = (cls: ClassId, level: number, fx: Fx) =>
  Math.log(C.trainCost0 * Math.max(1, classById(cls).hire0 / 25) ** 0.5 * (1 - fx.trainDiscount)) + level * Math.log(C.trainGrowth);
/** Firepower of `count` units of one type, relative to one unit. Each extra unit adds a little less (crowding the
 *  bunker), so 20 units hit about 9× as hard as one. This keeps a full army strong without snowballing. */
export const unitPower = (count: number) => (count > 0 ? Math.pow(count, C.unitExponent) : 0);
/** How many units of each type the barracks can hold at your best tier. */
export const unitCap = (bestTier: number) => Math.min(C.maxPerType, C.unitsBase + Math.floor(bestTier / C.tiersPerUnit));
export const lnHireCost = (cls: ClassId, owned: number, fx?: Fx) =>
  Math.log(classById(cls).hire0 * (1 - (fx?.hireDiscount ?? 0))) + owned * Math.log(C.hireGrowth);
export const lnTreeCost = (allocated: number) => Math.log(C.treeCost0) + allocated * Math.log(C.treeCostGrowth);

export function rollRarity(rng: () => number, minIdx = 0) {
  const rs = C.rarities.slice(minIdx);
  let x = rng() * rs.reduce((a, r) => a + r.weight, 0);
  for (const r of rs) if ((x -= r.weight) < 0) return r.id;
  return rs[0].id;
}

/** Per-recruit stats after the tree. */
export function recruitStats(r: { cls: ClassId; level: number }, gun: Gun | undefined, fx: Fx) {
  const c = classById(r.cls);
  const range = Math.min(1, c.range * (1 + fx.range));
  const shotsPerSec = c.rate * (1 + fx.spd + (fx.classSpd[r.cls] ?? 0));
  const crit = Math.min(0.9, c.crit + fx.crit);
  const critDmg = C.baseCritDmg + fx.critDmg;
  const targets = c.targets + (fx.targets[r.cls] ?? 0);
  const lnDmgMult = Math.log(1 + fx.dmg + (fx.classDmg[r.cls] ?? 0)) + Math.log((fx.classMore[r.cls] ?? 1) * fx.more);
  // DPS against a single target (per-zombie damage); extra targets are applied when estimating kill capacity
  const lnDps = Math.log(c.dps) + lnGunPower(gun) + r.level * Math.log(C.trainMult) + lnDmgMult
    + Math.log(1 + fx.spd + (fx.classSpd[r.cls] ?? 0)) + Math.log(1 + crit * (critDmg - 1));
  return { range, shotsPerSec, crit, critDmg, targets, lnDps };
}
/** Damage multiplier of a recruit against a strain. */
export const matchMult = (cls: ClassId, s: StrainId, fx: Fx) => (MATCH[cls]?.[s] ?? 1) * (fx.vs[s] ?? 1);

/**
 * Kill capacity (zombies per second) of a squad against a strain mix at a tier. Extra targets count as +50% each
 * (a shot rarely hits its full number), and short range costs uptime because zombies spend longer out of reach.
 */
export function killCapacity(squad: SquadEntry[], fx: Fx, tier: number, spawnLv: number, mix = mixAt(tier)) {
  let secPerZombie = 0;
  for (const s of mix) {
    let lnDps = -Infinity;
    for (const { r, gun, count } of squad) {
      if (!gun || count <= 0) continue;
      const st = recruitStats(r, gun, fx);
      const eff = 1 + 0.5 * (st.targets - 1);
      const uptime = 0.55 + 0.45 * st.range;
      lnDps = logAdd(lnDps, st.lnDps + Math.log(unitPower(count) * matchMult(r.cls, s.id, fx) * eff * uptime));
    }
    secPerZombie += Math.exp(Math.min(60, lnZombieHp(tier, s.id, spawnLv) - lnDps)) / mix.length;
  }
  return secPerZombie > 0 ? 1 / secPerZombie : 0;
}
/** Can the squad beat horde k? It needs to kill 60 zombies within the timer (with ~10 s of walk-in). */
export function hordeOdds(squad: SquadEntry[], fx: Fx, k: number) {
  const need = C.hordeZombies / (C.hordeTimerSec - C.walkSec);
  return killCapacity(squad, fx, hordeDef(k).tier, 0, hordeMix(k)) / need;
}
