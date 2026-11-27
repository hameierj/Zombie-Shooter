// Builds a "20 hours in" save (like the active bot in tools/sim.ts after 20 h) and prints it as a save code.
// Run: node tools/make-save.ts > docs/saves/maxed-20h.txt
import * as M from '../src/core/model.ts';
import { TREE, treeFx } from '../src/core/tree.ts';

let uid = 1;
const classes = M.CLASSES.map((c) => c.id);
const guns = classes.map((cls) => ({ uid: uid++, cls, rarity: 'legendary', ilvl: 380 }));
const attach = classes.map(() => ({ uid: uid++, kind: 'attach', rarity: 'legendary', stat: 'dmg', value: 0.65 }));
const charms = classes.map(() => ({ uid: uid++, kind: 'charm', rarity: 'legendary', bane: null, value: 0.533 }));
const spare = [
  { uid: uid++, kind: 'attach', rarity: 'epic', stat: 'spd', value: 0.45 },
  { uid: uid++, kind: 'attach', rarity: 'epic', stat: 'crit', value: 0.113 },
  { uid: uid++, kind: 'charm', rarity: 'legendary', bane: 'bloater', value: 1.6 },
  { uid: uid++, kind: 'charm', rarity: 'legendary', bane: 'brute', value: 1.6 },
];
const units = Object.fromEntries(M.CLASSES.map((c, i) => [c.id, {
  cls: c.id, count: 20,
  nodes: { dmg: 460 - 6 * i, spd: 20, range: 10, crit: 15, critx: 20, ab1: 1, ab2: 1, ab3: 1, attach: 1, charm: 1 },
  gun: guns[i].uid, attach: attach[i].uid, charm: charms[i].uid,
}]));
const alloc = TREE.filter((n) => n.id !== 'start').map((n) => n.id);
const fx = treeFx(alloc);
const squad = Object.values(units).map((u) => ({
  u: u as unknown as M.Unit, gun: guns.find((g) => g.uid === u.gun) as M.Gun,
  attach: attach.find((g) => g.uid === u.attach) as unknown as M.Attachment, charm: charms.find((g) => g.uid === u.charm) as unknown as M.Charm,
}));

// every zombie type released at the highest common tier the squad still keeps up with (×1.2)
const strainsAt = (tier: number) => Object.fromEntries(M.ZOMBIE_IDS.map((z) => [z, { unlocked: true, tier, maxTier: tier, spawn: 15 }])) as unknown as M.Strains;
let lo = 1, hi = 2000;
while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (M.keepUp(squad, fx, strainsAt(mid)) >= 1.2) lo = mid; else hi = mid; }
const strains = strainsAt(lo);
const rates = M.lnDnaPerSec(squad, fx, strains);
const dna = Object.fromEntries(M.COLOURS.map((c) => [c, rates[c] + Math.log(900)]));   // ~15 minutes of income banked

const save = {
  version: 6, dna, strains, units, guns, gear: [...attach, ...charms, ...spare], alloc,
  hordes: 13, autoHordeOn: true, autoSell: 'best', nextUid: uid, kills: 2_450_000, newItems: [], lastSeen: Date.now(),
};
const code = Buffer.from(JSON.stringify(save), 'utf8').toString('base64');
console.error(`tier ${lo} · keep-up ${M.keepUp(squad, fx, strains).toFixed(2)} · ${alloc.length} passives · ${code.length} chars`);
console.log(code);
