// Core model: the single source of truth for balance, shared by the game and tools/sim.ts.
// Big numbers are stored as natural logs (ln) so play can go on forever.
//
// THE LOOP (v0.8)
// Five zombie types walk at you endlessly, each dropping its own colour of DNA. Every type has two dials, paid for in
// its own DNA: DNA Count (endless tiers: ×1.15 DNA and ×1.15 HP each) and Spawn Rate (30 levels). Your squad is seven
// unit types (up to 20 of each). Every unit type has its own upgrade tree paid in two DNA colours: endless Damage ranks,
// capped Attack Speed / Range / Crit Chance / Crit Damage, equipment slots, and a three-stage signature ability.
// Squad power grows from two halves of similar size: Damage ranks (DNA) and Guns (rare drops at your current tier).
// The big passive tree gives squad-wide perks; hordes are optional challenges that unlock unit types and tree regions.

export type ClassId = 'pistol' | 'bow' | 'shotgun' | 'rifle' | 'sniper' | 'flamer' | 'grenade' | 'mg' | 'drone' | 'rail' | 'mortar' | 'tesla';
/** A DNA colour. Each colour is named after the first zombie type of its family. */
export type StrainId = 'shambler' | 'runner' | 'brute' | 'spitter' | 'bloater';
export type ColourId = StrainId;
/** A zombie type (25 of them, five per DNA colour family). */
export type ZombieId = StrainId
  | 'crawler' | 'office' | 'farmer' | 'prisoner'
  | 'jogger' | 'courier' | 'skater' | 'athlete'
  | 'bouncer' | 'lumberjack' | 'butcher' | 'juggernaut'
  | 'labtech' | 'sewer' | 'diver' | 'plague'
  | 'chef' | 'sumo' | 'mutant' | 'abomination';
export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type AttachStat = 'dmg' | 'spd' | 'crit' | 'range';
import type { Fx } from './tree.ts';

// ---------- Zombie types & DNA colours ----------
export interface StrainDef {
  id: ZombieId; name: string; plural: string;
  family: ColourId; dna: string; color: string;   // the DNA colour it drops
  hp: number; dnaMult: number; speed: number; baseRate: number;
  fromTier: number;              // only used to pick the zombie mix of hordes (family leaders only)
  unlock?: { from: ZombieId; cost: number };       // paid in the colour of `from`
}
const FAMILY: Record<ColourId, { dna: string; color: string }> = {
  shambler: { dna: 'Green', color: '#7ddc5a' }, runner: { dna: 'Yellow', color: '#ffd23f' }, brute: { dna: 'Red', color: '#ff5a5a' },
  spitter: { dna: 'Teal', color: '#4ad6c8' }, bloater: { dna: 'Purple', color: '#b77bff' },
};
type Row = [ZombieId, string, string, ColourId, number, number, number, number, number, ZombieId | null, number];
// id, name, plural, family, hp, dnaMult, speed, baseRate, fromTier, unlocked from, cost
const ROWS: Row[] = [
  ['shambler', 'Shambler', 'Shamblers', 'shambler', 1.0, 1.0, 1.0, 1.0, 1, null, 0],
  ['runner', 'Runner', 'Runners', 'runner', 0.6, 1.0, 1.8, 0.6, 6, 'shambler', 150],
  ['brute', 'Brute', 'Brutes', 'brute', 2.5, 2.5, 0.7, 0.4, 14, 'runner', 4000],
  ['spitter', 'Spitter', 'Spitters', 'spitter', 1.2, 1.5, 1.0, 0.5, 25, 'brute', 1.2e5],
  ['bloater', 'Bloater', 'Bloaters', 'bloater', 4.0, 4.0, 0.55, 0.3, 40, 'spitter', 5e6],
  // Green family
  ['crawler', 'Crawler', 'Crawlers', 'shambler', 0.8, 0.9, 0.6, 0.7, 999, 'shambler', 1.3e05],
  ['office', 'Office Zombie', 'Office Zombies', 'shambler', 1.2, 1.25, 1.0, 0.6, 999, 'crawler', 1.4e08],
  ['farmer', 'Farmer', 'Farmers', 'shambler', 1.5, 1.6, 0.9, 0.5, 999, 'office', 2.5e12],
  ['prisoner', 'Prisoner', 'Prisoners', 'shambler', 2.0, 2.1, 1.1, 0.4, 999, 'farmer', 3e18],
  // Yellow family
  ['jogger', 'Jogger', 'Joggers', 'runner', 0.7, 1.15, 2.0, 0.5, 999, 'runner', 2.2e06],
  ['courier', 'Courier', 'Couriers', 'runner', 0.9, 1.45, 1.9, 0.42, 999, 'jogger', 9.5e09],
  ['skater', 'Skater', 'Skaters', 'runner', 1.1, 1.8, 2.2, 0.36, 999, 'courier', 6.8e14],
  ['athlete', 'Athlete', 'Athletes', 'runner', 1.4, 2.3, 2.4, 0.3, 999, 'skater', 8e20],
  // Red family
  ['bouncer', 'Bouncer', 'Bouncers', 'brute', 3.0, 3.0, 0.8, 0.35, 999, 'brute', 3.5e07],
  ['lumberjack', 'Lumberjack', 'Lumberjacks', 'brute', 3.6, 3.7, 0.75, 0.3, 999, 'bouncer', 6.3e11],
  ['butcher', 'Butcher', 'Butchers', 'brute', 4.4, 4.5, 0.7, 0.27, 999, 'lumberjack', 4.5e16],
  ['juggernaut', 'Juggernaut', 'Juggernauts', 'brute', 6.0, 6.2, 0.5, 0.22, 999, 'butcher', 5.3e22],
  // Teal family
  ['labtech', 'Lab Tech', 'Lab Techs', 'spitter', 1.4, 1.8, 1.0, 0.45, 999, 'spitter', 5.8e08],
  ['sewer', 'Sewer Worker', 'Sewer Workers', 'spitter', 1.7, 2.2, 0.95, 0.4, 999, 'labtech', 4.2e13],
  ['diver', 'Hazmat Diver', 'Hazmat Divers', 'spitter', 2.1, 2.7, 0.9, 0.35, 999, 'sewer', 1.2e19],
  ['plague', 'Plague Doctor', 'Plague Doctors', 'spitter', 2.6, 3.4, 0.9, 0.3, 999, 'diver', 1.4e25],
  // Purple family
  ['chef', 'Chef', 'Chefs', 'bloater', 4.6, 4.7, 0.6, 0.28, 999, 'bloater', 9.5e09],
  ['sumo', 'Sumo', 'Sumos', 'bloater', 5.4, 5.6, 0.5, 0.25, 999, 'chef', 2.8e15],
  ['mutant', 'Mutant', 'Mutants', 'bloater', 6.5, 6.8, 0.6, 0.22, 999, 'sumo', 3.2e21],
  ['abomination', 'Abomination', 'Abominations', 'bloater', 8.0, 8.5, 0.4, 0.2, 999, 'mutant', 3.8e27],
];
export const STRAINS: StrainDef[] = ROWS.map(([id, name, plural, family, hp, dnaMult, speed, baseRate, fromTier, from, cost]) => ({
  id, name, plural, family, dna: FAMILY[family].dna, color: FAMILY[family].color, hp, dnaMult, speed, baseRate, fromTier,
  ...(from ? { unlock: { from, cost } } : {}),
}));
/** All zombie types. */
export const ZOMBIE_IDS = STRAINS.map((s) => s.id);
/** The five DNA colours. */
export const STRAIN_IDS: ColourId[] = ['shambler', 'runner', 'brute', 'spitter', 'bloater'];
export const COLOURS = STRAIN_IDS;
export const strainById = (id: ZombieId) => STRAINS.find((s) => s.id === id)!;
/** The DNA colour a zombie type drops. */
export const familyOf = (id: ZombieId): ColourId => strainById(id).family;
/** Zombie types of one colour family, in release order. */
export const familyMembers = (c: ColourId) => STRAINS.filter((s) => s.family === c);
export type DnaMap = Record<ColourId, number | null>; // ln amounts per colour; null = 0
/** Per-type zombie dials. */
export interface StrainState { unlocked: boolean; tier: number; maxTier: number; spawn: number }
export type Strains = Record<ZombieId, StrainState>;

// ---------- Varieties: every zombie type comes in Normal, Feral and Alpha ----------
export type VarietyId = 0 | 1 | 2;
export const VARIETIES = [
  { name: '', hp: 1, dna: 1 },
  { name: 'Feral', hp: 2.5, dna: 2.5 },
  { name: 'Alpha', hp: 6, dna: 6 },
] as const;
/** Share of Feral and Alpha zombies of a type at a given tier: they creep in as you raise its DNA Count. */
export function varietyMix(tier: number) {
  const feral = Math.max(0, Math.min(0.35, (tier - 20) / 200));
  const alpha = Math.max(0, Math.min(0.15, (tier - 60) / 400));
  return { feral, alpha };
}
/** Average HP and DNA multiplier from the variety mix (both scale together). */
export function varietyAvg(tier: number) {
  const m = varietyMix(tier);
  return 1 + m.feral * (VARIETIES[1].hp - 1) + m.alpha * (VARIETIES[2].hp - 1);
}
export function rollVariety(tier: number, rng: () => number): VarietyId {
  const m = varietyMix(tier), r = rng();
  return r < m.alpha ? 2 : r < m.alpha + m.feral ? 1 : 0;
}

// ---------- Special zombies (random in the stream; no dials) ----------
export type SpecialId = 'golden' | 'armored' | 'screamer' | 'medic' | 'exploder';
export interface SpecialDef { id: SpecialId; name: string; desc: string; weight: number; hp: number; dna: number; speed: number; loot: number; tint: number }
export const SPECIALS: SpecialDef[] = [
  { id: 'golden',   name: 'Golden',   desc: 'Fast and rich: ×15 DNA and a big item chance', weight: 1, hp: 1, dna: 15, speed: 1.7, loot: 25, tint: 0xffd23f },
  { id: 'armored',  name: 'Armoured', desc: '×5 HP, ×5 DNA',                                weight: 3, hp: 5, dna: 5, speed: 0.8, loot: 3, tint: 0x9aa8bc },
  { id: 'screamer', name: 'Screamer', desc: 'Speeds up nearby zombies; ×4 DNA',             weight: 2, hp: 2, dna: 4, speed: 1, loot: 2, tint: 0xff7ae0 },
  { id: 'medic',    name: 'Medic',    desc: 'Heals nearby zombies; ×4 DNA',                 weight: 2, hp: 2, dna: 4, speed: 0.9, loot: 2, tint: 0x7affc0 },
  { id: 'exploder', name: 'Exploder', desc: 'Blows up nearby zombies when killed; ×3 DNA',  weight: 2, hp: 1.5, dna: 3, speed: 1.1, loot: 2, tint: 0xff8a2a },
];
export const specialById = (id: SpecialId) => SPECIALS.find((x) => x.id === id)!;
/** Chance that a zombie in the endless stream is special. */
export const SPECIAL_CHANCE = 0.03;
export function rollSpecial(rng: () => number): SpecialId | null {
  if (rng() >= SPECIAL_CHANCE) return null;
  let x = rng() * SPECIALS.reduce((a, d) => a + d.weight, 0);
  for (const d of SPECIALS) if ((x -= d.weight) < 0) return d.id;
  return null;
}

// ---------- Unit types ----------
export interface AbilityDef { name: string; stages: string[] }
export interface ClassDef {
  id: ClassId; name: string; plural: string; gun: string;
  dps: number; range: number; rate: number; targets: number; crit: number;
  horde: number;                 // horde that unlocks it (0 = available from the start)
  hire0: number;                 // base hiring cost (in the primary colour)
  primary: StrainId; secondary: StrainId; // DNA colours its tree is paid in
  ability: AbilityDef;
}
export const CLASSES: ClassDef[] = [
  { id: 'pistol',  name: 'Pistoleer',  plural: 'Pistoleers',  gun: 'Pistol',           dps: 10, range: 0.40, rate: 2.2, targets: 1, crit: 0.10, horde: 0, hire0: 25, primary: 'shambler', secondary: 'runner',
    ability: { name: 'Double Tap', stages: ['+15% attack speed: quick follow-up shots', '+30% attack speed', '+50% attack speed'] } },
  { id: 'bow',     name: 'Hunter',     plural: 'Hunters',     gun: 'Compound Bow',     dps: 12, range: 0.75, rate: 0.9, targets: 2, crit: 0.20, horde: 1, hire0: 600, primary: 'runner', secondary: 'spitter',
    ability: { name: 'Piercing Arrows', stages: ['Arrows pierce 1 more zombie', 'Arrows pierce 2 more zombies', 'Arrows pierce 3 more zombies'] } },
  { id: 'shotgun', name: 'Shotgunner', plural: 'Shotgunners', gun: 'Shotgun',          dps: 17, range: 0.15, rate: 1.1, targets: 3, crit: 0.05, horde: 2, hire0: 4000, primary: 'shambler', secondary: 'brute',
    ability: { name: 'Knockback', stages: ['Blasts shove zombies back (+10% time in range)', '+20% time in range', '+30% time in range'] } },
  { id: 'rifle',   name: 'Rifleman',   plural: 'Riflemen',    gun: 'Assault Rifle',    dps: 20, range: 0.60, rate: 5.0, targets: 1, crit: 0.08, horde: 3, hire0: 1.2e4, primary: 'runner', secondary: 'brute',
    ability: { name: 'Suppressive Fire', stages: ['Hits slow zombies by 15%', 'Hits slow zombies by 25%', 'Hits slow zombies by 35%'] } },
  { id: 'sniper',  name: 'Sniper',     plural: 'Snipers',     gun: 'Sniper Rifle',     dps: 28, range: 1.00, rate: 0.45, targets: 1, crit: 0.30, horde: 4, hire0: 8e4, primary: 'brute', secondary: 'bloater',
    ability: { name: 'Headshot', stages: ['10% chance to instantly kill (not bosses)', '20% chance to instantly kill', '30% chance to instantly kill'] } },
  { id: 'flamer',  name: 'Pyro',       plural: 'Pyros',       gun: 'Flamethrower',     dps: 38, range: 0.20, rate: 8.0, targets: 4, crit: 0.0,  horde: 5, hire0: 5e5, primary: 'spitter', secondary: 'bloater',
    ability: { name: 'Napalm', stages: ['Burning ground: +1 zombie hit, +10% damage', '+2 zombies hit, +20% damage', '+3 zombies hit, +30% damage'] } },
  { id: 'grenade', name: 'Grenadier',  plural: 'Grenadiers',  gun: 'Grenade Launcher', dps: 42, range: 0.65, rate: 0.7, targets: 4, crit: 0.05, horde: 6, hire0: 5e6, primary: 'bloater', secondary: 'shambler',
    ability: { name: 'Cluster Bombs', stages: ['Blasts hit 1 more zombie', 'Blasts hit 2 more zombies', 'Blasts hit 3 more zombies'] } },
  // Elite-horde recruits
  { id: 'mg',      name: 'Machine Gunner', plural: 'Machine Gunners', gun: 'Machine Gun', dps: 55, range: 0.50, rate: 12, targets: 1, crit: 0.05, horde: 8, hire0: 3e7, primary: 'runner', secondary: 'brute',
    ability: { name: 'Overheat', stages: ['Longer bursts: +20% attack speed', '+40% attack speed', '+70% attack speed'] } },
  { id: 'drone',   name: 'Drone Operator', plural: 'Drone Operators', gun: 'Attack Drones', dps: 68, range: 0.90, rate: 1.6, targets: 1, crit: 0.15, horde: 9, hire0: 2e8, primary: 'spitter', secondary: 'runner',
    ability: { name: 'Swarm', stages: ['+1 drone: hits 1 more zombie', '+2 drones', '+3 drones'] } },
  { id: 'rail',    name: 'Railgunner', plural: 'Railgunners', gun: 'Railgun', dps: 76, range: 0.80, rate: 0.5, targets: 4, crit: 0.25, horde: 10, hire0: 6e8, primary: 'bloater', secondary: 'brute',
    ability: { name: 'Overcharge', stages: ['Pierces 1 more zombie, +10% damage', 'Pierces 2 more, +20% damage', 'Pierces 3 more, +30% damage'] } },
  { id: 'mortar',  name: 'Mortar Gunner', plural: 'Mortar Team', gun: 'Mortar', dps: 85, range: 0.85, rate: 0.35, targets: 5, crit: 0.05, horde: 11, hire0: 1.5e9, primary: 'brute', secondary: 'bloater',
    ability: { name: 'Barrage', stages: ['Shells hit 1 more zombie, +10% damage', '+2 zombies, +20% damage', '+3 zombies, +30% damage'] } },
  { id: 'tesla',   name: 'Tesla Trooper', plural: 'Tesla Troopers', gun: 'Arc Gun', dps: 112, range: 0.30, rate: 1.6, targets: 3, crit: 0.10, horde: 13, hire0: 1e10, primary: 'bloater', secondary: 'spitter',
    ability: { name: 'Chain Lightning', stages: ['Arcs to 1 more zombie', 'Arcs to 2 more zombies', 'Arcs to 3 more zombies'] } },
];
export const classById = (id: ClassId) => CLASSES.find((c) => c.id === id)!;
/** Damage multipliers: guns that are good or bad against a zombie type. */
export const MATCH: Partial<Record<ClassId, Partial<Record<StrainId, number>>>> = {
  pistol:  { brute: 0.6, bloater: 0.7 },
  bow:     { spitter: 1.5, runner: 1.2 },
  shotgun: { runner: 1.5, brute: 1.3, spitter: 0.8 },
  rifle:   { brute: 0.7, runner: 1.3 },
  sniper:  { brute: 2.0, bloater: 1.3, runner: 0.6 },
  flamer:  { bloater: 1.6, spitter: 0.7, shambler: 1.2 },
  grenade: { bloater: 1.4, brute: 1.2, runner: 0.8 },
  mg:      { runner: 1.4, shambler: 1.2, brute: 0.8 },
  drone:   { spitter: 1.4, bloater: 1.2 },
  rail:    { brute: 1.4, bloater: 1.2, runner: 0.8 },
  mortar:  { bloater: 1.5, brute: 1.3, runner: 0.7 },
  tesla:   { spitter: 1.3, shambler: 1.3, brute: 0.85 },
};

// ---------- Unit upgrade trees (same layout for every type; the ability chain differs) ----------
export type UnitNodeId = 'dmg' | 'spd' | 'range' | 'ab1' | 'crit' | 'critx' | 'ab2' | 'attach' | 'charm' | 'ab3';
export interface UnitNodeDef {
  id: UnitNodeId; name: string; kind: 'ranked' | 'capped' | 'unlock'; max?: number;
  colour: 'primary' | 'secondary'; cost0: number; growth: number; requires?: UnitNodeId; x: number; y: number;
}
export const UNIT_NODES: UnitNodeDef[] = [
  { id: 'dmg',    name: 'Damage',         kind: 'ranked',             colour: 'primary',   cost0: 8,    growth: 1.15, x: 1, y: 0 },
  { id: 'spd',    name: 'Attack Speed',   kind: 'capped', max: 20,    colour: 'primary',   cost0: 30,   growth: 1.45, requires: 'dmg', x: 0, y: 1 },
  { id: 'range',  name: 'Range',          kind: 'capped', max: 10,    colour: 'primary',   cost0: 40,   growth: 1.7,  requires: 'dmg', x: 2, y: 1 },
  { id: 'ab1',    name: 'Ability I',      kind: 'unlock',             colour: 'primary',   cost0: 300,  growth: 1,    requires: 'dmg', x: 1, y: 1 },
  { id: 'crit',   name: 'Crit Chance',    kind: 'capped', max: 15,    colour: 'secondary', cost0: 40,   growth: 1.5,  requires: 'spd', x: 0, y: 2 },
  { id: 'critx',  name: 'Crit Damage',    kind: 'capped', max: 20,    colour: 'secondary', cost0: 50,   growth: 1.45, requires: 'range', x: 2, y: 2 },
  { id: 'ab2',    name: 'Ability II',     kind: 'unlock',             colour: 'secondary', cost0: 5e3,  growth: 1,    requires: 'ab1', x: 1, y: 2 },
  { id: 'attach', name: 'Attachment Slot', kind: 'unlock',            colour: 'secondary', cost0: 600,  growth: 1,    requires: 'crit', x: 0, y: 3 },
  { id: 'charm',  name: 'Charm Slot',     kind: 'unlock',             colour: 'secondary', cost0: 1500, growth: 1,    requires: 'attach', x: 2, y: 3 },   // gear slots open in order
  { id: 'ab3',    name: 'Ability III',    kind: 'unlock',             colour: 'secondary', cost0: 1.5e5, growth: 1,   requires: 'ab2', x: 1, y: 3 },
];
export const unitNodeById = (id: UnitNodeId) => UNIT_NODES.find((n) => n.id === id)!;

export const CONFIG = {
  R: 1.15,                  // per DNA Count tier of a zombie type: ×1.15 DNA per zombie and ×1.15 HP
  ITEM_SHARE: 0.5,          // guns cover half of each tier's HP growth; Damage ranks cover the other half
  dmgPerLevel: 1.05,        // Damage node: ×1.05 per level, cost ×1.15 per level (see the v0.5 notes in the docs)
  baseHp: 6,
  baseDna: 3,
  tierCost0: 40,            // raising a type's DNA Count from tier t costs 40·1.15^(t−1) of its own DNA
  spawnPerLevel: 0.12,      // +12% spawn rate per level…
  spawnMax: 30,
  spawnHpPerLevel: 0.03,    // …and +3% HP
  spawnCost0: 20,
  spawnCostGrowth: 1.5,
  hireGrowth: 1.8,
  maxPerType: 20,
  unitsBase: 2,             // barracks: 2 of each type at first, +1 every 10 tiers of your best zombie type (20 at 180)
  unitExponent: 0.75,       // 20 units ≈ 9× one unit
  tiersPerUnit: 10,
  baseCritDmg: 2,
  dropChance: 0.002,        // item drop chance per zombie at 1 zombie/s; it shrinks as the stream gets busier, so drops
  dropRateExp: 0.75,         // stay minutes apart: ~1 per 8 min early, ~1 per 3 min with every type at full spawn rate
  treeCost0: 15,
  treeCostGrowth: 1.9,
  walkSec: 16,
  hordeZombies: 60,
  hordeTimerSec: 66,
  hordeSpawnPerSec: 3,
  /** Each horde ends with a boss: the toughest zombie type in the horde with this many times the HP, walking slowly.
   * If the boss reaches the shredder, or too many horde zombies break through, the horde is lost. */
  bossHpMult: 10, bossSpeed: 0.35, breachLimit: 10,
  /** The shredder grinds every zombie that reaches it by 1% of its HP per second, so the road always clears.
   * Shredded zombies pay `shredDna` of their DNA, times keep-up² (when the squad is hopelessly overrun on purpose
   * they pay almost nothing, so pushing tiers sky-high and letting the shredder grind can't be farmed). No combo. */
  shredFrac: 0.01,
  shredDna: 0.25,
  /** Odds at which a horde card says "should win" and War Drums starts it by itself. */
  hordeWinOdds: 1.1,
  /** Combo: every live kill adds 1; DNA earned is multiplied by up to ×1.5 at 300. It drops to 0 after 3 s
   * without a kill, and halves whenever a zombie reaches the shredder. Offline time earns no combo. */
  combo: { max: 300, bonus: 0.5, timeoutSec: 3 },
  rarities: [
    { id: 'common',    weight: 62, power: 1.0, attach: 0.10, charm: 0.20 },
    { id: 'uncommon',  weight: 25, power: 1.3, attach: 0.18, charm: 0.35 },
    { id: 'rare',      weight: 9,  power: 1.7, attach: 0.30, charm: 0.60 },
    { id: 'epic',      weight: 3,  power: 2.3, attach: 0.45, charm: 1.00 },
    { id: 'legendary', weight: 1,  power: 3.2, attach: 0.65, charm: 1.60 },
  ] as { id: RarityId; weight: number; power: number; attach: number; charm: number }[],
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
const HORDE_TIERS = [6, 20, 40, 70, 110, 160, 220];
export function hordeDef(k: number): HordeDef {
  const cls = CLASSES.find((c) => c.horde === k)?.id;
  if (k <= 7) {
    const unlocks = cls ? `${classById(cls).plural} + the ${['', 'Marksman', 'Breacher', 'Suppression', 'Deadeye', 'Inferno', 'Demolition'][k]} tree region` : 'The Command tree region';
    return { index: k, name: HORDE_NAMES[k - 1], tier: HORDE_TIERS[k - 1], unlocks, cls, region: k, elite: false };
  }
  const n = k - 7;
  return { index: k, name: `Elite Horde ${n}`, tier: HORDE_TIERS[6] + 30 * n, unlocks: cls ? `${classById(cls).plural} (new recruits)` : 'An epic item', cls, region: -1, elite: true };
}
/** Hordes bring a fixed mix of zombie types for their tier (it doesn't depend on which types you've released). */
export const hordeMix = (k: number) => STRAINS.filter((s) => s.fromTier <= hordeDef(k).tier).map((s) => s.id);  // family leaders only

// ---------- Zombies ----------
export const spawnRate = (s: ZombieId, spawn: number) => strainById(s).baseRate * (1 + C.spawnPerLevel * spawn);
export const lnZombieHp = (s: ZombieId, tier: number, spawn: number) =>
  Math.log(C.baseHp * strainById(s).hp * (1 + C.spawnHpPerLevel * spawn)) + (tier - 1) * lnR;
export const lnDnaPerKill = (s: ZombieId, tier: number, fx: Fx) =>
  Math.log(C.baseDna * strainById(s).dnaMult * (1 + fx.dna)) + (tier - 1) * lnR;
export const lnTierCost = (s: ZombieId, tier: number) => Math.log(C.tierCost0 * strainById(s).dnaMult) + (tier - 1) * lnR;
export const lnSpawnCost = (s: ZombieId, lv: number) => Math.log(C.spawnCost0 * strainById(s).dnaMult) + lv * Math.log(C.spawnCostGrowth);
export const activeStrains = (st: Strains) => ZOMBIE_IDS.filter((s) => st[s]?.unlocked);
export const totalSpawnRate = (st: Strains) => activeStrains(st).reduce((a, s) => a + spawnRate(s, st[s].spawn), 0);
/** Chance that one shredded zombie drops an item. */
export const dropChance = (st: Strains, fx: Fx) => (C.dropChance / Math.pow(Math.max(1, totalSpawnRate(st)), C.dropRateExp)) * (1 + fx.drop);
export const bestTier = (st: Strains) => Math.max(1, ...activeStrains(st).map((s) => st[s].maxTier));

// ---------- Items ----------
export interface Gun { uid: number; cls: ClassId; rarity: RarityId; ilvl: number }
export interface Attachment { uid: number; kind: 'attach'; rarity: RarityId; stat: AttachStat; value: number }
export interface Charm { uid: number; kind: 'charm'; rarity: RarityId; bane: StrainId | null; value: number }
export type Gear = Attachment | Charm;
export const rarityDef = (r: RarityId) => C.rarities.find((x) => x.id === r)!;
export const lnGunPower = (g: Gun | undefined) => (g ? Math.log(rarityDef(g.rarity).power) + C.ITEM_SHARE * lnR * (g.ilvl - 1) : -Infinity);
export function rollRarity(rng: () => number, minIdx = 0) {
  const rs = C.rarities.slice(minIdx);
  let x = rng() * rs.reduce((a, r) => a + r.weight, 0);
  for (const r of rs) if ((x -= r.weight) < 0) return r.id;
  return rs[0].id;
}
export function rollGear(rng: () => number, uid: number, minRarity = 0): Gear {
  const rarity = rollRarity(rng, minRarity);
  const d = rarityDef(rarity);
  if (rng() < 0.6) {
    const stat = (['dmg', 'spd', 'crit', 'range'] as AttachStat[])[Math.floor(rng() * 4)];
    const scale = stat === 'crit' ? 0.25 : stat === 'range' ? 0.2 : 1;
    return { uid, kind: 'attach', rarity, stat, value: Math.round(d.attach * scale * 1000) / 1000 };
  }
  const bane = rng() < 0.75 ? STRAIN_IDS[Math.floor(rng() * STRAIN_IDS.length)] : null;
  return { uid, kind: 'charm', rarity, bane, value: bane ? d.charm : Math.round((d.charm / 3) * 1000) / 1000 };
}

// ---------- Units ----------
/** One unit type: how many you have, its tree, issued gun and equipped gear. */
export interface Unit { cls: ClassId; count: number; nodes: Partial<Record<UnitNodeId, number>>; gun: number | null; attach: number | null; charm: number | null }
/** Pre-v6 shapes, kept only to migrate old saves. */
export interface Recruit { id: number; cls: ClassId; level: number; gun: number | null }
export interface UnitV5 { cls: ClassId; count: number; level: number; gun: number | null }
/** What the maths needs to know about a unit type. */
export interface SquadEntry { u: Unit; gun?: Gun; attach?: Attachment; charm?: Charm }
export const unitPower = (count: number) => (count > 0 ? Math.pow(count, C.unitExponent) : 0);
export const unitCap = (best: number) => Math.min(C.maxPerType, C.unitsBase + Math.floor(best / C.tiersPerUnit));
export const nlv = (u: Unit, id: UnitNodeId) => u.nodes[id] ?? 0;
const classScale = (cls: ClassId) => Math.max(1, classById(cls).hire0 / 25) ** 0.5;
export const nodeColour = (cls: ClassId, n: UnitNodeDef): StrainId => (n.colour === 'primary' ? classById(cls).primary : classById(cls).secondary);
export const lnUnitNodeCost = (cls: ClassId, n: UnitNodeDef, level: number, fx: Fx) =>
  Math.log(n.cost0 * classScale(cls) * (n.id === 'dmg' ? 1 - fx.trainDiscount : 1)) + level * Math.log(n.growth);
export const unitNodeMaxed = (n: UnitNodeDef, level: number) => (n.kind === 'unlock' ? level >= 1 : n.kind === 'capped' ? level >= (n.max ?? 1) : false);
export const lnHireCost = (cls: ClassId, owned: number, fx?: Fx) =>
  Math.log(classById(cls).hire0 * (1 - (fx?.hireDiscount ?? 0))) + owned * Math.log(C.hireGrowth);
export const lnTreeCost = (allocated: number) => Math.log(C.treeCost0) + allocated * Math.log(C.treeCostGrowth);
export const abilityStage = (u: Unit) => (nlv(u, 'ab3') ? 3 : nlv(u, 'ab2') ? 2 : nlv(u, 'ab1') ? 1 : 0);

/** What a unit type's ability does at its current stage (used by the maths and by the battlefield). */
export function abilityFx(u: Unit) {
  const k = abilityStage(u);
  const out = { spd: 0, targets: 0, uptime: 1, dmg: 1, execute: 0, slow: 0, knockback: 0 };
  if (!k) return out;
  switch (u.cls) {
    case 'pistol': out.spd = [0, 0.15, 0.3, 0.5][k]; break;
    case 'bow': out.targets = k; break;
    case 'shotgun': out.uptime = 1 + 0.1 * k; out.knockback = 0.02 * k; break;
    case 'rifle': out.slow = [0, 0.15, 0.25, 0.35][k]; out.uptime = 1 + [0, 0.1, 0.18, 0.27][k]; break;
    case 'sniper': out.execute = 0.1 * k; out.dmg = 1 / (1 - 0.1 * k); break;
    case 'flamer': out.targets = k; out.dmg = 1 + 0.1 * k; break;
    case 'grenade': out.targets = k; break;
    case 'mg': out.spd = [0, 0.2, 0.4, 0.7][k]; break;
    case 'drone': out.targets = k; break;
    case 'rail': out.targets = k; out.dmg = 1 + 0.1 * k; break;
    case 'mortar': out.targets = k; out.dmg = 1 + 0.1 * k; break;
    case 'tesla': out.targets = k; break;
  }
  return out;
}

/** Per-unit stats after its tree, gear, ability and the passive tree. */
export function unitStats(e: SquadEntry, fx: Fx) {
  const { u, gun, attach } = e;
  const c = classById(u.cls);
  const ab = abilityFx(u);
  const a = (stat: AttachStat) => (attach?.stat === stat ? attach.value : 0);
  // only Snipers cover the whole road; everyone else tops out just short of it
  // range bonuses are minor: +2% per Range level, small attachments/passives, at most +30% in total
  const range = Math.min(u.cls === 'sniper' ? 1 : 0.95, c.range * (1 + Math.min(0.3, fx.range + 0.02 * nlv(u, 'range') + a('range'))));
  const spdMult = 1 + fx.spd + (fx.classSpd[u.cls] ?? 0) + 0.04 * nlv(u, 'spd') + a('spd') + ab.spd;
  const shotsPerSec = c.rate * spdMult;
  const crit = Math.min(0.9, c.crit + fx.crit + 0.02 * nlv(u, 'crit') + a('crit'));
  const critDmg = C.baseCritDmg + fx.critDmg + 0.1 * nlv(u, 'critx');
  const targets = c.targets + (fx.targets[u.cls] ?? 0) + ab.targets;
  const lnDmgMult = Math.log(1 + fx.dmg + (fx.classDmg[u.cls] ?? 0) + a('dmg')) + Math.log((fx.classMore[u.cls] ?? 1) * fx.more * ab.dmg);
  const lnDps = Math.log(c.dps) + lnGunPower(gun) + nlv(u, 'dmg') * Math.log(C.dmgPerLevel) + lnDmgMult
    + Math.log(spdMult) + Math.log(1 + crit * (critDmg - 1));
  return { range, shotsPerSec, crit, critDmg, targets, lnDps, ability: ab };
}
/** Damage multiplier of a unit type against a zombie type (gun matchup, passive tree, charm). */
export const matchMult = (e: SquadEntry, z: ZombieId, fx: Fx) => {
  const s = familyOf(z);
  return (MATCH[e.u.cls]?.[s] ?? 1) * (fx.vs[s] ?? 1) * (e.charm ? 1 + (e.charm.bane === null || e.charm.bane === s ? e.charm.value : 0) : 1);
};

/** ln squad DPS against one zombie type (counting extra targets at 50% and range as uptime). */
export function lnSquadDps(squad: SquadEntry[], fx: Fx, s: ZombieId) {
  let ln = -Infinity;
  for (const e of squad) {
    if (!e.gun || e.u.count <= 0) continue;
    const st = unitStats(e, fx);
    const eff = 1 + 0.5 * (st.targets - 1);
    const uptime = (0.55 + 0.45 * st.range) * st.ability.uptime;
    ln = logAdd(ln, st.lnDps + Math.log(unitPower(e.u.count) * matchMult(e, s, fx) * eff * uptime));
  }
  return ln;
}

/**
 * Keep-up ratio: how much of the incoming stream the squad can kill. Each type brings rate·HP of work per second;
 * the squad clears DPS against it. 1 means exactly keeping up; below 1 zombies pile up at the shredder.
 */
export function keepUp(squad: SquadEntry[], fx: Fx, st: Strains) {
  let load = 0;
  for (const s of activeStrains(st)) {
    const x = st[s];
    load += spawnRate(s, x.spawn) * varietyAvg(x.tier) * Math.exp(Math.min(60, lnZombieHp(s, x.tier, x.spawn) - lnSquadDps(squad, fx, s)));
  }
  return load > 0 ? 1 / load : Infinity;
}
/** DNA per second of each colour at the current settings. */
export function lnDnaPerSec(squad: SquadEntry[], fx: Fx, st: Strains): Record<StrainId, number> {
  const f = Math.min(1, keepUp(squad, fx, st));
  const out = Object.fromEntries(COLOURS.map((c) => [c, -Infinity])) as Record<ColourId, number>;
  for (const s of activeStrains(st)) {
    const x = st[s];
    out[familyOf(s)] = logAdd(out[familyOf(s)], Math.log(spawnRate(s, x.spawn) * f * varietyAvg(x.tier)) + lnDnaPerKill(s, x.tier, fx));
  }
  return out;
}
/** The toughest zombie type in horde k: it becomes the boss. */
export const hordeBoss = (k: number) => hordeMix(k).reduce((a, b) => (strainById(b).hp > strainById(a).hp ? b : a));
export const comboMult = (n: number) => 1 + C.combo.bonus * Math.min(n, C.combo.max) / C.combo.max;
/** Can the squad beat horde k? It must kill 60 zombies (an even mix) plus the boss in the timer, after ~10 s of walk-in. */
export function hordeOdds(squad: SquadEntry[], fx: Fx, k: number) {
  const h = hordeDef(k), mix = hordeMix(k), boss = hordeBoss(k);
  let secPerZombie = 0;
  for (const s of mix) secPerZombie += Math.exp(Math.min(60, lnZombieHp(s, h.tier, 0) - lnSquadDps(squad, fx, s))) / mix.length;
  const bossSec = C.bossHpMult * Math.exp(Math.min(60, lnZombieHp(boss, h.tier, 0) - lnSquadDps(squad, fx, boss)));
  // the boss comes last: you have the time it takes to arrive (after the rest of the horde) plus its slow walk,
  // and in that time the squad must get through the horde and the boss
  const time = C.hordeZombies / C.hordeSpawnPerSec + C.walkSec / C.bossSpeed;
  // ×1.28: a few zombies may slip past (up to 10 breaches); calibrated in browser play tests so ~1.0 is a coin flip
  return (1.28 * (time - C.walkSec)) / (C.hordeZombies * secPerZombie + bossSec);
}
