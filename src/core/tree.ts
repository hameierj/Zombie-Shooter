// The passive tree: one web of nodes radiating from a central Command Post, in the style of a POE2 passive tree.
// Eight regions sit around the centre. Basic Training is open from the start; each other region opens when its
// horde is beaten. A node can be allocated when it touches an allocated node and its region is open. Every
// allocation costs more than the last (see CONFIG.treeCost0 / treeCostGrowth in model.ts).
import type { ClassId, StrainId } from './model.ts';

export type NodeSize = 'small' | 'notable' | 'keystone' | 'start';
export interface Fx {
  dmg: number; spd: number; crit: number; critDmg: number; range: number; dna: number; drop: number; hireDiscount: number;
  trainDiscount: number;
  classDmg: Partial<Record<ClassId, number>>;     // additive % for one class
  classMore: Partial<Record<ClassId, number>>;    // multiplicative for one class
  classSpd: Partial<Record<ClassId, number>>;
  targets: Partial<Record<ClassId, number>>;      // extra targets per shot
  vs: Partial<Record<StrainId, number>>;          // multiplicative vs a strain, whole squad
  more: number;                                   // multiplicative damage, whole squad
  // Automations never spend DNA: they only do things that are free (equipping gear, starting hordes).
  autoEquip: boolean; autoHorde: boolean;
}
export interface TreeNode {
  id: string; region: number; size: NodeSize; name: string; desc: string; x: number; y: number; links: string[];
  apply: (fx: Fx) => void;
}
/** `dna` is the DNA colour that pays for this region's passives. */
export interface Region { name: string; horde: number; color: string; dna: StrainId; cls?: ClassId }

export const REGIONS: Region[] = [
  { name: 'Basic Training', horde: 0, color: '#c8b070', dna: 'shambler' },
  { name: 'Marksman', horde: 1, color: '#7ddc5a', dna: 'runner', cls: 'bow' },
  { name: 'Breacher', horde: 2, color: '#ff9a3c', dna: 'brute', cls: 'shotgun' },
  { name: 'Suppression', horde: 3, color: '#6cb6ff', dna: 'runner', cls: 'rifle' },
  { name: 'Deadeye', horde: 4, color: '#e8e8e8', dna: 'brute', cls: 'sniper' },
  { name: 'Inferno', horde: 5, color: '#ff5a3a', dna: 'spitter', cls: 'flamer' },
  { name: 'Demolition', horde: 6, color: '#ffd23f', dna: 'bloater', cls: 'grenade' },
  { name: 'Command', horde: 7, color: '#b77bff', dna: 'bloater' },
];

export function emptyFx(): Fx {
  return { dmg: 0, spd: 0, crit: 0, critDmg: 0, range: 0, dna: 0, drop: 0, hireDiscount: 0, trainDiscount: 0,
    classDmg: {}, classMore: {}, classSpd: {}, targets: {}, vs: {}, more: 1, autoEquip: false, autoHorde: false };
}
const add = <K extends string>(m: Partial<Record<K, number>>, k: K, v: number) => { m[k] = (m[k] ?? 0) + v; };
const mul = <K extends string>(m: Partial<Record<K, number>>, k: K, v: number) => { m[k] = (m[k] ?? 1) * v; };

type Spec = { name: string; desc: string; apply: (fx: Fx) => void };
const S = (name: string, desc: string, apply: (fx: Fx) => void): Spec => ({ name, desc, apply });
const dmg = (p: number) => S('Firepower', `+${p}% damage`, (f) => { f.dmg += p / 100; });
const spd = (p: number) => S('Quick Hands', `+${p}% attack speed`, (f) => { f.spd += p / 100; });
const crit = (p: number) => S('Precision', `+${p}% crit chance`, (f) => { f.crit += p / 100; });
const rng = (p: number) => S('Long Sight', `+${p}% range`, (f) => { f.range += p / 100; });
const dna = (p: number) => S('Extraction', `+${p}% DNA`, (f) => { f.dna += p / 100; });
const cdmg = (c: ClassId, label: string, p: number) => S(`${label} Drills`, `+${p}% ${label} damage`, (f) => add(f.classDmg, c, p / 100));

/** Region layouts: small, small, notable, then two branches (2 small + notable each) meeting at a keystone. */
const LAYOUT: Record<number, { smalls: [Spec, Spec]; n1: Spec; na: Spec; nb: Spec; k: Spec }> = {
  0: {
    smalls: [dmg(8), spd(6)],
    n1: S('Drill Sergeant', '+15% damage for the whole squad.', (f) => { f.dmg += 0.15; }),
    na: S('War Drums', 'Auto-Horde: the next horde starts by itself when your squad should win. Costs nothing.', (f) => { f.autoHorde = true; }),
    nb: S('Quartermaster', '+15% item drop chance.', (f) => { f.drop += 0.15; }),
    k: S('Barracks', '+20% damage for the whole squad.', (f) => { f.dmg += 0.2; }),
  },
  1: {
    smalls: [cdmg('bow', 'Hunter', 12), rng(4)],
    n1: S('Broadheads', 'Hunter arrows pierce 1 more zombie.', (f) => add(f.targets, 'bow', 1)),
    na: S('Eagle Eye', '+10% crit chance.', (f) => { f.crit += 0.1; }),
    nb: S('Steady Draw', '+25% Hunter attack speed.', (f) => add(f.classSpd, 'bow', 0.25)),
    k: S('Apex Predator', 'Hunters deal ×2 damage.', (f) => mul(f.classMore, 'bow', 2)),
  },
  2: {
    smalls: [cdmg('shotgun', 'Shotgunner', 12), dmg(5)],
    n1: S('Buckshot', 'Shotgun blasts hit 1 more zombie.', (f) => add(f.targets, 'shotgun', 1)),
    na: S('Point Blank', '+40% Shotgunner damage.', (f) => add(f.classDmg, 'shotgun', 0.4)),
    nb: S('Slug Rounds', 'Whole squad deals ×1.4 damage to Brutes.', (f) => mul(f.vs, 'brute', 1.4)),
    k: S('Breaching Charge', 'Shotgunners deal ×2 damage.', (f) => mul(f.classMore, 'shotgun', 2)),
  },
  3: {
    smalls: [cdmg('rifle', 'Rifleman', 12), spd(6)],
    n1: S('Extended Mags', '+30% Rifleman attack speed.', (f) => add(f.classSpd, 'rifle', 0.3)),
    na: S('Hollow Points', '+30% crit damage.', (f) => { f.critDmg += 0.3; }),
    nb: S('Covering Fire', '+15% damage for the whole squad.', (f) => { f.dmg += 0.15; }),
    k: S('Lead Storm', 'Riflemen deal ×2 damage.', (f) => mul(f.classMore, 'rifle', 2)),
  },
  4: {
    smalls: [cdmg('sniper', 'Sniper', 12), crit(4)],
    n1: S('Scope Zero', '+6% range.', (f) => { f.range += 0.06; }),
    na: S('Headhunter', '+50% crit damage.', (f) => { f.critDmg += 0.5; }),
    nb: S('Armor Piercing', 'Whole squad deals ×1.4 damage to Brutes.', (f) => mul(f.vs, 'brute', 1.4)),
    k: S('One Shot', 'Snipers deal ×2.5 damage.', (f) => mul(f.classMore, 'sniper', 2.5)),
  },
  5: {
    smalls: [cdmg('flamer', 'Pyro', 12), dna(6)],
    n1: S('Napalm', 'Flames hit 1 more zombie.', (f) => add(f.targets, 'flamer', 1)),
    na: S('Fuel Tanks', '+30% Pyro attack speed.', (f) => add(f.classSpd, 'flamer', 0.3)),
    nb: S('Burn Ward', 'Whole squad deals ×1.5 damage to Bloaters.', (f) => mul(f.vs, 'bloater', 1.5)),
    k: S('Firestorm', 'Pyros deal ×2 damage.', (f) => mul(f.classMore, 'flamer', 2)),
  },
  6: {
    smalls: [cdmg('grenade', 'Grenadier', 12), S('Scrounger', '+10% item drop chance', (f) => { f.drop += 0.1; })],
    n1: S('Cluster Bombs', 'Grenades hit 1 more zombie.', (f) => add(f.targets, 'grenade', 1)),
    na: S('Scavenger', '+50% item drop chance.', (f) => { f.drop += 0.5; }),
    nb: S('Shrapnel', '+10% damage for the whole squad.', (f) => { f.dmg += 0.1; }),
    k: S('Carpet Bombing', 'Grenadiers deal ×2 damage.', (f) => mul(f.classMore, 'grenade', 2)),
  },
  7: {
    smalls: [dmg(8), dna(8)],
    n1: S('Recruitment Drive', 'Hiring costs 25% less.', (f) => { f.hireDiscount += 0.25; }),
    na: S('Veteran Trainers', 'Training costs 20% less.', (f) => { f.trainDiscount += 0.2; }),
    nb: S('Logistics', '+10% attack speed for the whole squad.', (f) => { f.spd += 0.1; }),
    k: S('Total War', 'Whole squad deals ×1.5 damage.', (f) => { f.more *= 1.5; }),
  },
};

function build(): TreeNode[] {
  const nodes: TreeNode[] = [{ id: 'start', region: -1, size: 'start', name: 'Command Post', desc: 'Your base. Every path starts here.', x: 0, y: 0, links: [], apply: () => {} }];
  const STEP = 70;
  const at = (r: number, deg: number) => ({ x: Math.round(Math.cos((deg * Math.PI) / 180) * r * STEP), y: Math.round(Math.sin((deg * Math.PI) / 180) * r * STEP) });
  REGIONS.forEach((_, ri) => {
    const L = LAYOUT[ri];
    const base = 90 + ri * 45; // Basic Training points down, the rest go round
    const p = `r${ri}`;
    const mk = (id: string, size: NodeSize, spec: Spec, r: number, off: number, links: string[]) =>
      nodes.push({ id: `${p}.${id}`, region: ri, size, name: spec.name, desc: spec.desc, ...at(r, base + off), links, apply: spec.apply });
    mk('s1', 'small', L.smalls[0], 1, 0, ['start']);
    mk('s2', 'small', L.smalls[1], 2, 0, [`${p}.s1`]);
    mk('n1', 'notable', L.n1, 3, 0, [`${p}.s2`]);
    mk('a1', 'small', L.smalls[0], 3.7, -9, [`${p}.n1`]);
    mk('a2', 'small', L.smalls[1], 4.4, -13, [`${p}.a1`]);
    mk('na', 'notable', L.na, 5.2, -11, [`${p}.a2`]);
    mk('b1', 'small', L.smalls[1], 3.7, 9, [`${p}.n1`]);
    mk('b2', 'small', L.smalls[0], 4.4, 13, [`${p}.b1`]);
    mk('nb', 'notable', L.nb, 5.2, 11, [`${p}.b2`]);
    mk('k', 'keystone', L.k, 6.2, 0, [`${p}.na`, `${p}.nb`]);
  });
  // Ring links between neighbouring regions make it a web rather than separate spokes.
  for (let ri = 0; ri < REGIONS.length; ri++) {
    const next = (ri + 1) % REGIONS.length;
    nodes.find((n) => n.id === `r${ri}.b2`)!.links.push(`r${next}.a2`);
  }
  // make links symmetric
  for (const n of nodes) for (const l of n.links) { const o = nodes.find((m) => m.id === l)!; if (!o.links.includes(n.id)) o.links.push(n.id); }
  return nodes;
}
export const TREE = build();
export const treeNode = (id: string) => TREE.find((n) => n.id === id)!;

export function treeFx(allocated: string[]): Fx {
  const fx = emptyFx();
  for (const id of allocated) treeNode(id)?.apply(fx);
  return fx;
}
