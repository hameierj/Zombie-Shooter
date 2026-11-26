// Plays the v4 model with bot players: endless stream economy, rare gun drops, training, hiring, passive tree,
// optional hordes. Prints pace and where power comes from. Run: npm run sim -- [hours] [seed]
import * as M from '../src/core/model.ts';
import { TREE, treeFx, REGIONS } from '../src/core/tree.ts';

const C = M.CONFIG;
const HOURS = Number(process.argv[2] ?? 50);
const SEED = Number(process.argv[3] ?? 1);
const CHECKS = (process.env.CHECKS ?? "0.1667,0.5,1,2,5,10,25,50,100").split(",").map(Number).filter((h) => h <= HOURS);
const DT = 2;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const PROFILES = {
  active: { hordes: true, tree: true, label: 'Active: does hordes, buys passives' },
  noHordes: { hordes: false, tree: true, label: 'Never fights hordes (pistols only, Basic Training only)' },
  noTree: { hordes: true, tree: false, label: 'Never buys passives' },
};

export function simulate(profile, hours = HOURS, seed = SEED) {
  const rng = mulberry32(seed);
  const s = {
    t: 0, dna: -Infinity, tier: 1, spawn: 0, hordes: 0, eliteSlots: 0, nextUid: 2,
    recruits: [{ id: 1, cls: 'pistol', level: 0, gun: 1 }],
    guns: [{ uid: 1, cls: 'pistol', rarity: 'common', ilvl: 1 }],
    alloc: [], drops: 0,
  };
  const fx = () => treeFx(s.alloc);
  const gunOf = (r) => s.guns.find((g) => g.uid === r.gun);
  const squad = () => s.recruits.map((r) => ({ r, gun: gunOf(r) }));
  const unlockedClasses = () => M.CLASSES.filter((c) => c.horde <= Math.min(s.hordes, 7));
  const cap = (tier = s.tier, spawn = s.spawn) => M.killCapacity(squad(), fx(), tier, spawn);
  const pay = (ln) => { if (s.dna + 1e-9 < ln) return false; s.dna = M.logSub(s.dna, ln); return true; };

  function equip() {
    const used = new Set();
    for (const r of [...s.recruits].sort((a, b) => M.classById(b.cls).dps - M.classById(a.cls).dps)) {
      const best = s.guns.filter((g) => g.cls === r.cls && !used.has(g.uid)).sort((a, b) => M.lnGunPower(b) - M.lnGunPower(a))[0];
      r.gun = best?.uid ?? null;
      if (best) used.add(best.uid);
    }
  }
  function giveGun(cls, minRarity = 0, ilvlBonus = 0) {
    const g = { uid: s.nextUid++, cls, rarity: M.rollRarity(rng, minRarity), ilvl: s.tier + ilvlBonus + (rng() < 0.15 ? 1 + Math.floor(rng() * 3) : 0) };
    s.guns.push(g);
    equip();
  }
  function frontierNodes() {
    const f = fx(); void f;
    return TREE.filter((n) => n.id !== 'start' && !s.alloc.includes(n.id) && REGIONS[n.region].horde <= s.hordes
      && n.links.some((l) => l === 'start' || s.alloc.includes(l)));
  }

  // One round of purchases: the cheapest useful thing first.
  function shop() {
    for (let guard = 0; guard < 200; guard++) {
      const f = fx();
      const opts = [];
      // raise DNA Count when the squad would still keep up at the next tier
      if (cap(s.tier + 1) >= M.spawnRate(s.spawn) * 1.15) opts.push({ ln: M.lnTierCost(s.tier), go: () => { s.tier++; } });
      if (s.spawn < C.spawnMax && cap(s.tier, s.spawn + 1) >= M.spawnRate(s.spawn + 1) * 1.15) opts.push({ ln: M.lnSpawnCost(s.spawn), go: () => { s.spawn++; } });
      for (const r of s.recruits) opts.push({ ln: M.lnTrainCost(r.cls, r.level, f), go: () => { r.level++; } });
      if (s.recruits.length < M.slots(f, s.eliteSlots)) {
        const cls = unlockedClasses().at(-1).id;
        const owned = s.recruits.filter((r) => r.cls === cls).length;
        opts.push({ ln: M.lnHireCost(cls, owned), go: () => { s.recruits.push({ id: s.nextUid++, cls, level: 0, gun: null }); giveGun(cls); } });
      }
      // swap the weakest recruit for the newest class when slots are full
      if (profile.tree) {
        const fr = frontierNodes();
        if (fr.length) {
          const pick = fr.find((n) => n.size !== 'small') ?? fr[0];
          opts.push({ ln: M.lnTreeCost(s.alloc.length), go: () => { s.alloc.push(pick.id); } });
        }
      }
      opts.sort((a, b) => a.ln - b.ln);
      const o = opts[0];
      if (!o || !pay(o.ln)) return;
      o.go();
    }
  }

  // Retire weak old-class recruits when a stronger class is available and slots are full
  function upgradeSquad() {
    const f = fx();
    const best = unlockedClasses().at(-1).id;
    if (s.recruits.length < M.slots(f, s.eliteSlots)) return;
    const weakest = s.recruits.filter((r) => r.cls !== best).sort((a, b) => M.classById(a.cls).dps - M.classById(b.cls).dps)[0];
    if (!weakest) return;
    const owned = s.recruits.filter((r) => r.cls === best).length;
    const ln = M.lnHireCost(best, owned);
    if (s.dna >= ln + Math.log(3)) { pay(ln); weakest.cls = best; weakest.level = Math.floor(weakest.level * 0.7); giveGun(best); }
  }

  const out = [];
  let ci = 0;
  while (s.t < hours * 3600) {
    if (ci < CHECKS.length && s.t >= CHECKS[ci] * 3600) {
      const g = s.recruits.map((r) => gunOf(r)).filter(Boolean);
      const avgGunTier = g.reduce((a, x) => a + x.ilvl, 0) / Math.max(1, g.length);
      const avgTrain = s.recruits.reduce((a, r) => a + r.level, 0) / s.recruits.length;
      const lnTrain = avgTrain * Math.log(C.trainMult), lnGun = (avgGunTier - 1) * C.ITEM_SHARE * M.lnR;
      out.push({ h: CHECKS[ci], tier: s.tier, spawn: s.spawn, hordes: s.hordes, squad: s.recruits.map((r) => r.cls[0]).join(''), nodes: s.alloc.length,
        drops: s.drops, gunGap: s.tier - avgGunTier, train: Math.round(avgTrain), shareTrain: lnTrain / (lnTrain + lnGun || 1), keep: cap() / M.spawnRate(s.spawn) });
      ci++;
    }
    // economy tick
    const rate = Math.min(M.spawnRate(s.spawn), cap());
    const kills = rate * DT;
    const mix = M.mixAt(s.tier);
    const lnDna = M.logSumExp(mix.map((m) => M.lnDnaPerKill(s.tier, m.id, fx()))) - Math.log(mix.length);
    s.dna = M.logAdd(s.dna, lnDna + Math.log(kills));
    const pDrop = C.dropChance * (1 + fx().drop);
    if (rng() < kills * pDrop) { s.drops++; giveGun(s.recruits[Math.floor(rng() * s.recruits.length)].cls); }
    // optional hordes: attempt when the odds look good (takes about a minute)
    if (profile.hordes && M.hordeOdds(squad(), fx(), s.hordes + 1) >= 1.1) {
      s.hordes++;
      s.t += 60;
      const h = M.hordeDef(s.hordes);
      if (h.elite && s.eliteSlots < C.maxSlots - 6) s.eliteSlots++;
      giveGun(h.cls ?? s.recruits[0].cls, h.elite ? 3 : 2, 2);
    }
    upgradeSquad();
    shop();
    s.t += DT;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of Object.values(PROFILES)) {
    console.log(`\n=== ${p.label} ===`);
    console.log('  hours | tier | spawn | hordes | squad    | passives | drops | gun gap | train lv | train share | keep-up');
    for (const r of simulate(p)) {
      console.log(`${r.h.toFixed(2).padStart(7)} | ${String(r.tier).padStart(4)} | ${String(r.spawn).padStart(5)} | ${String(r.hordes).padStart(6)} | ${r.squad.padEnd(8)} | ${String(r.nodes).padStart(8)} | ${String(r.drops).padStart(5)} | ${r.gunGap.toFixed(1).padStart(7)} | ${String(r.train).padStart(8)} | ${(r.shareTrain * 100).toFixed(0).padStart(10)}% | ${r.keep.toFixed(2)}`);
    }
  }
}
