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
/** Progression: each colour's leader is unlocked by a horde; every type's DNA Count caps at TIER_CAP, and at the cap the
 * colour's next form (its "evolution") can be released. A form continues the curve: Crawler tier 1 is as tough and as rich
 * as Shambler tier 51 (its stage adds TIER_CAP tiers). The last form of each colour has no cap. */
export const TIER_CAP = 50;
export const COLOUR_HORDE: Partial<Record<ZombieId, number>> = { runner: 1, brute: 2, spitter: 3, bloater: 4 };
const STAGE = new Map<string, number>(), LAST = new Map<string, boolean>();
export const stageOf = (s: ZombieId) => { let v = STAGE.get(s); if (v === undefined) { const m = familyMembers(familyOf(s)); v = m.findIndex((x) => x.id === s); STAGE.set(s, v); LAST.set(s, v === m.length - 1); } return v; };
export const isLastForm = (s: ZombieId) => { stageOf(s); return LAST.get(s)!; };
export const tierCapOf = (s: ZombieId) => (isLastForm(s) ? Infinity : TIER_CAP);
/** The tier that sets HP, DNA and prices: the type's own tier plus TIER_CAP per evolution stage. */
export const effTier = (s: ZombieId, t: number) => t + TIER_CAP * stageOf(s) + colourBase(s);
/** A new colour starts where the street is when it arrives: just below the tier of the horde that brings it, so its
 * zombies aren't a pushover next to the colours you've been raising (yellow ≈ 12, red ≈ 22, teal ≈ 38, purple ≈ 54). */
const BASE = new Map<string, number>();
export const colourBase = (s: ZombieId) => {
  const fam = familyOf(s);
  let b = BASE.get(fam);
  if (b === undefined) { const k = COLOUR_HORDE[fam as ZombieId]; b = k ? Math.max(0, hordeDef(k).tier - 2) : 0; BASE.set(fam, b); }
  return b;
};
/** The dial tier that puts a colour's zombie at a horde's (effective) tier. */
export const hordeDial = (s: ZombieId, tier: number) => Math.max(1, tier - TIER_CAP * stageOf(s) - colourBase(s));
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
/** Live multipliers set from prestige perks (spawn rate of every zombie type, special-zombie chance). */
export const live = { spawnMult: 1, specialMult: 1 };
export function rollSpecial(rng: () => number): SpecialId | null {
  if (rng() >= SPECIAL_CHANCE * live.specialMult) return null;
  let x = rng() * SPECIALS.reduce((a, d) => a + d.weight, 0);
  for (const d of SPECIALS) if ((x -= d.weight) < 0) return d.id;
  return null;
}

// ---------- Unit types ----------
/** `tags`: the 1-2 word label shown on the Ability button for each stage. */
export interface AbilityDef { name: string; stages: string[]; tags: string[] }
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
    ability: { name: 'Double Tap', tags: ['Rate +15%', 'Rate +30%', 'Rate +50%'], stages: ['+15% attack speed: quick follow-up shots', '+30% attack speed', '+50% attack speed'] } },
  { id: 'bow',     name: 'Hunter',     plural: 'Hunters',     gun: 'Compound Bow',     dps: 12, range: 0.75, rate: 0.9, targets: 2, crit: 0.20, horde: 1, hire0: 600, primary: 'runner', secondary: 'spitter',
    ability: { name: 'Piercing Arrows', tags: ['Pierce +1', 'Pierce +2', 'Pierce +3'], stages: ['Arrows pierce 1 more zombie', 'Arrows pierce 2 more zombies', 'Arrows pierce 3 more zombies'] } },
  { id: 'shotgun', name: 'Shotgunner', plural: 'Shotgunners', gun: 'Shotgun',          dps: 17, range: 0.15, rate: 1.1, targets: 3, crit: 0.05, horde: 2, hire0: 4000, primary: 'shambler', secondary: 'brute',
    ability: { name: 'Knockback', tags: ['Push +10%', 'Push +20%', 'Push +30%'], stages: ['Blasts shove zombies back (+10% time in range)', '+20% time in range', '+30% time in range'] } },
  { id: 'rifle',   name: 'Rifleman',   plural: 'Riflemen',    gun: 'Assault Rifle',    dps: 20, range: 0.60, rate: 5.0, targets: 1, crit: 0.08, horde: 3, hire0: 1.2e4, primary: 'runner', secondary: 'brute',
    ability: { name: 'Suppressive Fire', tags: ['Slow 15%', 'Slow 25%', 'Slow 35%'], stages: ['Hits slow zombies by 15%', 'Hits slow zombies by 25%', 'Hits slow zombies by 35%'] } },
  { id: 'sniper',  name: 'Sniper',     plural: 'Snipers',     gun: 'Sniper Rifle',     dps: 28, range: 1.00, rate: 0.45, targets: 1, crit: 0.30, horde: 4, hire0: 8e4, primary: 'brute', secondary: 'bloater',
    ability: { name: 'Headshot', tags: ['Kill 10%', 'Kill 20%', 'Kill 30%'], stages: ['10% chance to instantly kill (not bosses)', '20% chance to instantly kill', '30% chance to instantly kill'] } },
  { id: 'flamer',  name: 'Pyro',       plural: 'Pyros',       gun: 'Flamethrower',     dps: 38, range: 0.20, rate: 8.0, targets: 4, crit: 0.0,  horde: 5, hire0: 5e5, primary: 'spitter', secondary: 'bloater',
    ability: { name: 'Napalm', tags: ['Burn +1', 'Burn +2', 'Burn +3'], stages: ['Burning ground: +1 zombie hit, +10% damage', '+2 zombies hit, +20% damage', '+3 zombies hit, +30% damage'] } },
  { id: 'grenade', name: 'Grenadier',  plural: 'Grenadiers',  gun: 'Grenade Launcher', dps: 42, range: 0.65, rate: 0.7, targets: 4, crit: 0.05, horde: 6, hire0: 5e6, primary: 'bloater', secondary: 'shambler',
    ability: { name: 'Cluster Bombs', tags: ['Frag +1', 'Frag +2', 'Frag +3'], stages: ['Blasts hit 1 more zombie', 'Blasts hit 2 more zombies', 'Blasts hit 3 more zombies'] } },
  // Elite-horde recruits
  { id: 'mg',      name: 'Machine Gunner', plural: 'Machine Gunners', gun: 'Machine Gun', dps: 55, range: 0.50, rate: 12, targets: 1, crit: 0.05, horde: 8, hire0: 3e7, primary: 'runner', secondary: 'brute',
    ability: { name: 'Overheat', tags: ['Rate +20%', 'Rate +40%', 'Rate +70%'], stages: ['Longer bursts: +20% attack speed', '+40% attack speed', '+70% attack speed'] } },
  { id: 'drone',   name: 'Drone Operator', plural: 'Drone Operators', gun: 'Attack Drones', dps: 68, range: 0.90, rate: 1.6, targets: 1, crit: 0.15, horde: 9, hire0: 2e8, primary: 'spitter', secondary: 'runner',
    ability: { name: 'Swarm', tags: ['Drone +1', 'Drone +2', 'Drone +3'], stages: ['+1 drone: hits 1 more zombie', '+2 drones', '+3 drones'] } },
  { id: 'rail',    name: 'Railgunner', plural: 'Railgunners', gun: 'Railgun', dps: 76, range: 0.80, rate: 0.5, targets: 4, crit: 0.25, horde: 10, hire0: 6e8, primary: 'bloater', secondary: 'brute',
    ability: { name: 'Overcharge', tags: ['Pierce +1', 'Pierce +2', 'Pierce +3'], stages: ['Pierces 1 more zombie, +10% damage', 'Pierces 2 more, +20% damage', 'Pierces 3 more, +30% damage'] } },
  { id: 'mortar',  name: 'Mortar Gunner', plural: 'Mortar Team', gun: 'Mortar', dps: 85, range: 0.85, rate: 0.35, targets: 5, crit: 0.05, horde: 11, hire0: 1.5e9, primary: 'brute', secondary: 'bloater',
    ability: { name: 'Barrage', tags: ['Shell +1', 'Shell +2', 'Shell +3'], stages: ['Shells hit 1 more zombie, +10% damage', '+2 zombies, +20% damage', '+3 zombies, +30% damage'] } },
  { id: 'tesla',   name: 'Tesla Trooper', plural: 'Tesla Troopers', gun: 'Arc Gun', dps: 112, range: 0.30, rate: 1.6, targets: 3, crit: 0.10, horde: 13, hire0: 1e10, primary: 'bloater', secondary: 'spitter',
    ability: { name: 'Chain Lightning', tags: ['Chain +1', 'Chain +2', 'Chain +3'], stages: ['Arcs to 1 more zombie', 'Arcs to 2 more zombies', 'Arcs to 3 more zombies'] } },
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
  { id: 'dmg',    name: 'Damage',         kind: 'ranked',             colour: 'primary',   cost0: 8,    growth: 1.13, x: 1, y: 0 },
  { id: 'spd',    name: 'Attack Speed',   kind: 'capped', max: 20,    colour: 'primary',   cost0: 30,   growth: 1.3, x: 0, y: 1 },
  { id: 'range',  name: 'Range',          kind: 'capped', max: 10,    colour: 'primary',   cost0: 40,   growth: 1.3, x: 2, y: 1 },
  { id: 'ab1',    name: 'Ability I',      kind: 'unlock',             colour: 'primary',   cost0: 300,  growth: 1, x: 1, y: 1 },
  { id: 'crit',   name: 'Crit Chance',    kind: 'capped', max: 15,    colour: 'secondary', cost0: 40,   growth: 1.3, x: 0, y: 2 },
  { id: 'critx',  name: 'Crit Damage',    kind: 'capped', max: 20,    colour: 'secondary', cost0: 50,   growth: 1.3, x: 2, y: 2 },
  { id: 'ab2',    name: 'Ability II',     kind: 'unlock',             colour: 'secondary', cost0: 5e3,  growth: 1,    requires: 'ab1', x: 1, y: 2 },
  { id: 'attach', name: 'Attachment Slot', kind: 'unlock',            colour: 'secondary', cost0: 600,  growth: 1, x: 0, y: 3 },
  { id: 'charm',  name: 'Charm Slot',     kind: 'unlock',             colour: 'secondary', cost0: 1500, growth: 1,    requires: 'attach', x: 2, y: 3 },   // gear slots open in order
  { id: 'ab3',    name: 'Ability III',    kind: 'unlock',             colour: 'secondary', cost0: 1.5e5, growth: 1,   requires: 'ab2', x: 1, y: 3 },
];
export const unitNodeById = (id: UnitNodeId) => UNIT_NODES.find((n) => n.id === id)!;

export const CONFIG = {
  R: 1.15, 
  hpR: 1.2,                 // zombie HP ×this per tier, a bit more than the DNA (R): higher tiers get relatively tougher, so the
                            // squad's one-off boosts (speed, crit, hires, passives) get used up and units need real investment
                 // per DNA Count tier of a zombie type: ×1.15 DNA per zombie and ×1.15 HP
  ITEM_SHARE: 0.5,          // guns cover half of each tier's HP growth; Damage ranks cover the other half
  dmgPerLevel: 1.06,        // Damage node: ×1.06 per level, price ×1.13 per level: one tier of zombie HP (×1.15, half of it
                            // covered by guns) costs about one tier of DNA, so each tier takes about the same play time
  baseHp: 6,
  baseDna: 3,
  tierCost0: 80,            // raising a type's DNA Count from tier t costs 80·1.15^(t−1) of its own DNA (t = effective tier)
  formCostMult: 2,          // each evolution stage makes that form's tiers and spawn levels 2× pricier, so every form takes longer
  spawnPerLevel: 0.12,      // +12% spawn rate per level…
  spawnMax: 30,
  spawnHpPerLevel: 0.03,    // …and +3% HP
  releaseSec: 180,          // (RELEASE_COST was tuned to ~3 min of a normal run's income)…
  releaseTier: 50,          // a colour's next form opens when the current one reaches the tier cap (TIER_CAP)
  spawnCost0: 0.5,          // a spawn level costs half the type's next tier…
  spawnCostGrowth: 1.2,     // …×1.2 per level
  hireGrowth: 2.1,
  unitCostMult: 2,         // unit prices ×this; cheap to start, but each level/hire costs more than the last,
  dmgCostGrowth: 1.165,      // Damage: price ×this per level (faster than a zombie tier's ×1.15, so the squad can't run away)
  cappedCostGrowth: 1.5,    // Speed / Range / Crit / Crit ×: price ×this per level
  maxPerType: 20,
  unitsBase: 2,             // barracks: 2 of each type at first, +1 every 10 tiers of your best zombie type (20 at 180)
  unitExponent: 0.75,       // 20 units ≈ 9× one unit
  tiersPerUnit: 10,
  baseCritDmg: 2,
  dropChance: 0.002,        // item drop chance per zombie at 1 zombie/s; it shrinks as the stream gets busier, so drops
  dropRateExp: 0.75,         // stay minutes apart: ~1 per 8 min early, ~1 per 3 min with every type at full spawn rate
  treeCost0: 15,            // each passive-tree REGION has its own price ladder, in its own colour: the first passive
  treeCostGrowth: 3.5,      // costs 15 and each one taken in that region makes the next ×3.5
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
  shredDna: 0,               // (unused: the shredder pays no DNA, only the squad’s kills do)
  /** Odds at which a horde card says "should win" and War Drums starts it by itself. */
  hordeWinOdds: 1.1,
  /** Combo: every live kill adds 1; DNA earned is multiplied by up to ×1.5 at 300. It drops to 0 after 3 s
   * without a kill, and halves whenever a zombie reaches the shredder. Offline time earns no combo. */
  combo: { max: 150, bonus: 0.5, timeoutSec: 3 },   // per zombie type (see GameState.comboOf)
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
export type HordeKind = 'classic' | 'swarm' | 'stampede' | 'armoured' | 'waves' | 'fog' | 'hospital';
export type BossKind = 'titan' | 'exploder' | 'leaper' | 'brood' | 'juggernaut' | 'screamer';
/** How a horde plays. count × hp is the horde's total toughness; diff covers what HP alone misses (speed, healing, fog). */
export interface HordeKindDef { id: HordeKind; name: string; desc: string; count: number; hp: number; speed: number; perSec: number; waves?: number; gap?: number; diff: number }
export const HORDE_KINDS: Record<HordeKind, HordeKindDef> = {
  classic:  { id: 'classic',  name: 'Horde',           desc: 'A steady march of 60 zombies.',                              count: 60,  hp: 1,    speed: 1,    perSec: 3,   diff: 1 },
  swarm:    { id: 'swarm',    name: 'Swarm',           desc: '120 weak zombies pouring in fast.',                          count: 120, hp: 0.45, speed: 1.15, perSec: 6,   diff: 1.3 },
  stampede: { id: 'stampede', name: 'Stampede',        desc: 'Everything charges in at 1.6× speed.',                       count: 60,  hp: 0.8,  speed: 1.6,  perSec: 4,   diff: 1.1 },
  armoured: { id: 'armoured', name: 'Armoured Column', desc: '24 armoured zombies: slow, very tough.',                      count: 24,  hp: 2.6,  speed: 0.8,  perSec: 1.5, diff: 1 },
  waves:    { id: 'waves',    name: 'Waves',           desc: 'Three waves of 20, with a breather between them.',           count: 60,  hp: 1,    speed: 1,    perSec: 5,   waves: 3, gap: 6, diff: 1 },
  fog:      { id: 'fog',      name: 'Fog March',       desc: 'Zombies stay hidden in fog until they are halfway down the road.', count: 50, hp: 1, speed: 1, perSec: 3,   diff: 1.25 },
  hospital: { id: 'hospital', name: 'Field Hospital',  desc: 'Medics march with the horde and heal it.',                   count: 60,  hp: 0.9,  speed: 1,    perSec: 3,   diff: 1.15 },
};
/** Every horde ends with one of these. hp is on top of the ×bossHpMult every boss has; work adds what HP alone misses. */
export interface BossDef { id: BossKind; name: string; desc: string; hp: number; speed: number; scale: number; look: ZombieId; tint: number; work: number;
  /** The battleground while this boss's horde is next (see drawGround's themes) and its name. */ ground: string; place: string }
export const BOSSES: Record<BossKind, BossDef> = {
  exploder:   { id: 'exploder',   name: 'Giant Exploder', desc: 'Bursts into 10 fast crawlers when it dies.',                 hp: 0.7, speed: 1,    scale: 2.6, look: 'bloater',     tint: 0xffa060, work: 3, ground: 'chem', place: 'Chem Works' },
  leaper:     { id: 'leaper',     name: 'Leaper',         desc: "Doesn't walk: crouches, then leaps far. Can't be hit in the air.", hp: 0.8, speed: 1.3, scale: 2.2, look: 'athlete', tint: 0xa8ff9a, work: 2, ground: 'swamp', place: 'The Swamp' },
  titan:      { id: 'titan',      name: 'Titan',          desc: 'Massive and very slow. Shakes the ground; ignores slows.',  hp: 1.9, speed: 0.75, scale: 3.4, look: 'brute',       tint: 0xd8ccb8, work: 0, ground: 'badlands', place: 'Badlands Quarry' },
  brood:      { id: 'brood',      name: 'Brood Mother',   desc: 'Keeps spawning small zombies as she walks.',               hp: 0.9, speed: 0.9,  scale: 2.6, look: 'abomination', tint: 0xd8a8ff, work: 7, ground: 'hive', place: 'The Hive' },
  screamer:   { id: 'screamer',   name: 'Screamer King',  desc: 'While alive, every horde zombie runs 35% faster.',         hp: 0.8, speed: 1,    scale: 2.3, look: 'spitter',     tint: 0xff80e0, work: 2, ground: 'neon', place: 'Neon District' },
  juggernaut: { id: 'juggernaut', name: 'Iron Juggernaut', desc: 'Armour plating takes half damage until it breaks.',        hp: 0.6, speed: 0.9,  scale: 2.6, look: 'juggernaut',  tint: 0xa8b4c8, work: 1.2, ground: 'scrapyard', place: 'The Scrapyard' },
};
const BOSS_ORDER: BossKind[] = ['exploder', 'leaper', 'titan', 'brood', 'screamer', 'juggernaut'];
const KIND_ORDER: HordeKind[] = ['classic', 'stampede', 'armoured', 'swarm', 'waves', 'fog', 'hospital'];   // matches the first seven horde names
export interface HordeDef { index: number; name: string; tier: number; unlocks: string; cls?: ClassId; region: number; elite: boolean; kind: HordeKind; boss: BossKind }
const HORDE_NAMES = ['The Shamblers', 'Fast Movers', 'Heavy Hitters', 'The Swarm', 'Brute Squad', 'Acid Rain', 'The Bloat'];
// Horde tiers (effective tiers), set from the balance sim (which also counts combo and specials): hordes 1-7 at about
// 6, 15, 28, 43, 66, 77 and 86 min (Hordes 1-4 also bring the yellow, red, teal and purple colours, each starting at
// about the horde's tier, see colourBase), then an Elite horde about every 10-30 min. Keep-up in the sim ~×1.2-2 for
// the first hour. ELITE_TIERS continue the list; past its end, +10 each.
const HORDE_TIERS = [14, 26, 48, 68, 86, 100, 114];
const ELITE_TIERS = [126, 137, 148, 158, 168, 178];
const ELITE_STEP = 10;
export function hordeDef(k: number): HordeDef {
  const cls = CLASSES.find((c) => c.horde === k)?.id;
  if (k <= 7) {
    const unlocks = cls ? `${classById(cls).plural} + the ${['', 'Marksman', 'Breacher', 'Suppression', 'Deadeye', 'Inferno', 'Demolition'][k]} tree region` : 'The Command tree region';
    return { index: k, name: HORDE_NAMES[k - 1], tier: HORDE_TIERS[k - 1], unlocks, cls, region: k, elite: false, kind: KIND_ORDER[k - 1], boss: BOSS_ORDER[(k - 1) % BOSS_ORDER.length] };
  }
  const n = k - 7;
  const kind = KIND_ORDER[1 + ((n - 1) % (KIND_ORDER.length - 1))];   // elites never use the plain march
  const tier = ELITE_TIERS[n - 1] ?? ELITE_TIERS[ELITE_TIERS.length - 1] + ELITE_STEP * (n - ELITE_TIERS.length);
  return { index: k, name: `Elite ${HORDE_KINDS[kind].name} ${n}`, tier, unlocks: cls ? `${classById(cls).plural} (new recruits)` : 'An epic item', cls, region: -1, elite: true, kind, boss: BOSS_ORDER[(k - 1) % BOSS_ORDER.length] };
}
/** Hordes bring a fixed mix of zombie types for their tier (it doesn't depend on which types you've released). */
/** Guns keep up with you: every gun is refitted to your toughest zombie tier. Guns cover half of each tier's HP
 * growth by design, so they must never fall behind; drops then only matter for rarity. */
export const gunFloor = (strains: Strains) => bestTier(strains);
/** A horde's zombies: each colour's first form whose starting tier is below the horde's (so every horde previews the
 * colour it unlocks: Horde 1 brings Runners, Horde 2 Brutes, …). A horde's tier is an effective tier. */
export const hordeMix = (k: number) => STRAINS.filter((s) => stageOf(s.id) === 0 && colourBase(s.id) < hordeDef(k).tier).map((s) => s.id);

// ---------- Zombies ----------
export const spawnRate = (s: ZombieId, spawn: number) => strainById(s).baseRate * (1 + C.spawnPerLevel * spawn) * live.spawnMult;
export const lnZombieHp = (s: ZombieId, tier: number, spawn: number) =>
  Math.log(C.baseHp * strainById(s).hp * (1 + C.spawnHpPerLevel * spawn)) + (effTier(s, tier) - 1) * Math.log(C.hpR);
export const lnDnaPerKill = (s: ZombieId, tier: number, fx: Fx) =>
  Math.log(C.baseDna * strainById(s).dnaMult * (1 + fx.dna) * (fx.dnaMore ?? 1)) + (effTier(s, tier) - 1) * lnR;
/** Evolving (releasing a colour's next form) costs EVOLVE_TIERS more tiers' worth of the parent at the cap: about a
 * minute of that colour's income, a fixed price that never moves while you save. */
export const EVOLVE_TIERS = 4;
export const lnReleaseCost = (s: ZombieId, _lnRate?: number) => { const from = strainById(s).unlock?.from ?? s; return lnTierCost(from, TIER_CAP) + Math.log(EVOLVE_TIERS); };
export const lnTierCost = (s: ZombieId, tier: number) => Math.log(C.tierCost0 * strainById(s).dnaMult) + (effTier(s, tier) - 1) * lnR + stageOf(s) * Math.log(C.formCostMult);
/** A spawn level is priced against the type's current tier (spawnCost0 × its next tier's price, ×spawnCostGrowth per
 * level), so it stays a real choice instead of becoming free once tiers climb. */
export const lnSpawnCost = (s: ZombieId, lv: number, tier = 1) => lnTierCost(s, tier) + Math.log(C.spawnCost0) + lv * Math.log(C.spawnCostGrowth);
export const activeStrains = (st: Strains) => ZOMBIE_IDS.filter((s) => st[s]?.unlocked);
export const totalSpawnRate = (st: Strains) => activeStrains(st).reduce((a, s) => a + spawnRate(s, st[s].spawn), 0);
/** Chance that one shredded zombie drops an item. */
export const dropChance = (st: Strains, fx: Fx) => (C.dropChance / Math.pow(Math.max(1, totalSpawnRate(st)), C.dropRateExp)) * (1 + fx.drop);
export const bestTier = (st: Strains) => Math.max(1, ...activeStrains(st).map((s) => effTier(s, st[s].maxTier)));

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
/** Every upgrade of a unit type is paid in its one DNA colour (its primary). */
export const nodeColour = (cls: ClassId, _n?: UnitNodeDef): StrainId => classById(cls).primary;
export const lnUnitNodeCost = (cls: ClassId, n: UnitNodeDef, level: number, fx: Fx) =>
  Math.log(n.cost0 * C.unitCostMult * classScale(cls) * (n.id === 'dmg' ? 1 - fx.trainDiscount : 1)) + level * Math.log(n.id === 'dmg' ? C.dmgCostGrowth : n.kind === 'capped' ? C.cappedCostGrowth : n.growth);
export const unitNodeMaxed = (n: UnitNodeDef, level: number) => (n.kind === 'unlock' ? level >= 1 : n.kind === 'capped' ? level >= (n.max ?? 1) : false);
export const lnHireCost = (cls: ClassId, owned: number, fx?: Fx) =>
  Math.log(classById(cls).hire0 * C.unitCostMult * (1 - (fx?.hireDiscount ?? 0))) + owned * Math.log(C.hireGrowth);
/** Price of the next passive in a region. Each region starts at 15 of its colour, scaled up by how far that colour has
 * come by the time the region opens (the tiers between the horde that brought the colour and the horde that opens the
 * region), so a late region isn't an instant buy; then every passive taken there makes the next ×treeCostGrowth. */
export const lnTreeCost = (allocated: number, region?: { horde: number; dna: ColourId }) => {
  let lead = 0;
  if (region && region.horde > 0) {
    const ch = COLOUR_HORDE[region.dna as ZombieId] ?? 0;
    lead = Math.max(0, hordeDef(region.horde).tier - (ch ? hordeDef(ch).tier : 1));
  }
  return Math.log(C.treeCost0) + lead * lnR + allocated * Math.log(C.treeCostGrowth);
};
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
export const comboMult = (n: number, extraBonus = 0) => 1 + (C.combo.bonus + extraBonus) * Math.min(n, C.combo.max) / C.combo.max;

// ---------- Prestige: reset a run for points (1 per horde cleared), spend them on permanent perks that stack ----------
export type PerkId = 'dna' | 'dmg' | 'spd' | 'range' | 'crit' | 'critx' | 'spawn' | 'headstart' | 'warchest' | 'barracks' | 'lucky' | 'gold' | 'combo' | 'bounty';
export interface PerkDef { id: PerkId; name: string; icon: string; max: number; cost: number; desc: (lv: number) => string; apply?: (fx: Fx, lv: number) => void }
const pct = (x: number) => `${Math.round(x * 100)}%`;
const mult = (x: number) => (x >= 100 ? `×${Math.round(x)}` : `×${x.toFixed(x < 10 ? 2 : 1)}`);
export const PERKS: PerkDef[] = [
  { id: 'dna', name: 'DNA Surge', icon: 'dna', max: 20, cost: 1, desc: (l) => `${mult(1.25 ** l)} DNA from every kill`, apply: (f, l) => { f.dnaMore = (f.dnaMore ?? 1) * 1.25 ** l; } },
  { id: 'dmg', name: 'Firepower', icon: 'dmg', max: 30, cost: 1, desc: (l) => `${mult(1.15 ** l)} damage for the whole squad`, apply: (f, l) => { f.more *= 1.15 ** l; } },
  { id: 'spd', name: 'Trigger Discipline', icon: 'spd', max: 10, cost: 1, desc: (l) => `+${pct(0.05 * l)} attack speed`, apply: (f, l) => { f.spd += 0.05 * l; } },
  { id: 'range', name: 'Long Range', icon: 'range', max: 5, cost: 1, desc: (l) => `+${pct(0.02 * l)} range`, apply: (f, l) => { f.range += 0.02 * l; } },
  { id: 'crit', name: 'Deadeye', icon: 'crit', max: 10, cost: 1, desc: (l) => `+${pct(0.02 * l)} crit chance`, apply: (f, l) => { f.crit += 0.02 * l; } },
  { id: 'critx', name: 'Heavy Hitter', icon: 'critdmg', max: 10, cost: 1, desc: (l) => `+${pct(0.2 * l)} crit damage`, apply: (f, l) => { f.critDmg += 0.2 * l; } },
  { id: 'spawn', name: 'Spawn Surge', icon: 'spawn', max: 10, cost: 1, desc: (l) => `+${pct(0.1 * l)} spawn rate on every zombie type` },
  { id: 'headstart', name: 'Head Start', icon: 'dna', max: 5, cost: 1, desc: (l) => (l ? `start each run with ${Math.round(500 * 4 ** l).toLocaleString('en-US')} DNA of every colour` : 'start each run with DNA of every colour') },
  { id: 'warchest', name: 'War Chest', icon: 'dmg', max: 10, cost: 1, desc: (l) => `Damage upgrades ${pct(0.05 * l)} cheaper`, apply: (f, l) => { f.trainDiscount = Math.min(0.6, f.trainDiscount + 0.05 * l); } },
  { id: 'barracks', name: 'Big Barracks', icon: 'equip', max: 5, cost: 2, desc: (l) => `+${2 * l} soldiers per unit type (up to ${C.maxPerType})` },
  { id: 'lucky', name: 'Lucky Finds', icon: 'luck', max: 10, cost: 1, desc: (l) => `+${pct(0.15 * l)} item drop chance`, apply: (f, l) => { f.drop += 0.15 * l; } },
  { id: 'gold', name: 'Gold Rush', icon: 'loot', max: 4, cost: 2, desc: (l) => `special zombies ${mult(1 + 0.5 * l)} as common` },
  { id: 'combo', name: 'Combo Master', icon: 'fast', max: 5, cost: 2, desc: (l) => `combo bonus up to ×${(1 + C.combo.bonus + 0.1 * l).toFixed(1)} (from ×${1 + C.combo.bonus})` },
  { id: 'bounty', name: 'Bounty Hunter', icon: 'auto', max: 3, cost: 3, desc: (l) => `+${l} extra point${l === 1 ? '' : 's'} for every 5 hordes cleared in a run` },
];
export const perkById = (id: PerkId) => PERKS.find((p) => p.id === id)!;
export interface Prestige { runs: number; points: number; earned: number; perks: Partial<Record<PerkId, number>> }
export const emptyPrestige = (): Prestige => ({ runs: 0, points: 0, earned: 0, perks: {} });
export const plv = (p: Prestige | undefined, id: PerkId) => p?.perks[id] ?? 0;
/** Points for prestiging now: 1 per horde cleared this run (+ Bounty Hunter). */
export const prestigeGain = (hordes: number, p: Prestige | undefined) => hordes + Math.floor(hordes / 5) * plv(p, 'bounty');
export function applyPerks(fx: Fx, p: Prestige | undefined) { for (const d of PERKS) { const l = plv(p, d.id); if (l && d.apply) d.apply(fx, l); } return fx; }
/** Can the squad beat horde k? It must kill the horde (an even mix of its zombie types, shaped by the horde's kind)
 * plus the boss before the boss reaches the shredder. */
export function hordeOdds(squad: SquadEntry[], fx: Fx, k: number, tierOverride?: number) {
  const h = tierOverride ? { ...hordeDef(k), tier: tierOverride } : hordeDef(k), mix = hordeMix(k), boss = hordeBoss(k), kd = HORDE_KINDS[h.kind], bd = BOSSES[h.boss];
  let secPerZombie = 0;
  for (const s of mix) secPerZombie += Math.exp(Math.min(60, lnZombieHp(s, hordeDial(s, h.tier), 0) - lnSquadDps(squad, fx, s))) / mix.length;
  const bossSec = C.bossHpMult * bd.hp * Math.exp(Math.min(60, lnZombieHp(boss, hordeDial(boss, h.tier), 0) - lnSquadDps(squad, fx, boss)));
  // the boss comes last: you have the time it takes to arrive (after the rest of the horde, and any breathers between
  // waves) plus its walk, and in that time the squad must get through the horde, the boss and anything the boss adds
  const spawnSec = kd.count / kd.perSec + (kd.waves ? (kd.waves - 1) * (kd.gap ?? 0) : 0);
  const time = spawnSec + C.walkSec / (C.bossSpeed * bd.speed);
  const work = kd.count * kd.hp * kd.diff * secPerZombie + bossSec + bd.work * secPerZombie;
  // ×1.28: a few zombies may slip past (up to 10 breaches); calibrated in browser play tests so ~1.0 is a coin flip
  return (1.28 * (time - C.walkSec)) / work;
}
