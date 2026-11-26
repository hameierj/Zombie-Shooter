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
    t: 0, dna: -Infinity, tier: 1, spawn: 0, hordes: 0, nextUid: 2,
    units: Object.fromEntries(M.CLASSES.map((c) => [c.id, { cls: c.id, count: c.id === 'pistol' ? 1 : 0, level: 0, gun: c.id === 'pistol' ? 1 : null }])),
    guns: [{ uid: 1, cls: 'pistol', rarity: 'common', ilvl: 1 }],
    alloc: [], drops: 0,
  };
  const fx = () => treeFx(s.alloc);
  const owned = () => Object.values(s.units).filter((u) => u.count > 0);
  const squad = () => owned().map((u) => ({ r: u, gun: s.guns.find((g) => g.uid === u.gun), count: u.count }));
  const unlocked = (c) => M.classById(c).horde <= Math.min(s.hordes, 7);
  const cap = (tier = s.tier, spawn = s.spawn) => M.killCapacity(squad(), fx(), tier, spawn);
  const pay = (ln) => { if (s.dna + 1e-9 < ln) return false; s.dna = M.logSub(s.dna, ln); return true; };
  function equip() {
    for (const u of Object.values(s.units)) {
      const best = s.guns.filter((g) => g.cls === u.cls).sort((a, b) => M.lnGunPower(b) - M.lnGunPower(a))[0];
      u.gun = best?.uid ?? null;
    }
  }
  function giveGun(cls, minRarity = 0, ilvlBonus = 0) {
    s.guns.push({ uid: s.nextUid++, cls, rarity: M.rollRarity(rng, minRarity), ilvl: s.tier + ilvlBonus + (rng() < 0.15 ? 1 + Math.floor(rng() * 3) : 0) });
    equip();
  }
  function frontierNodes() {
    return TREE.filter((n) => n.id !== 'start' && !s.alloc.includes(n.id) && REGIONS[n.region].horde <= s.hordes
      && n.links.some((l) => l === 'start' || s.alloc.includes(l)));
  }
  function shop() {
    for (let guard = 0; guard < 300; guard++) {
      const f = fx();
      const opts = [];
      if (cap(s.tier + 1) >= M.spawnRate(s.spawn) * 1.15) opts.push({ ln: M.lnTierCost(s.tier), go: () => { s.tier++; } });
      if (s.spawn < C.spawnMax && cap(s.tier, s.spawn + 1) >= M.spawnRate(s.spawn + 1) * 1.15) opts.push({ ln: M.lnSpawnCost(s.spawn), go: () => { s.spawn++; } });
      for (const u of owned()) opts.push({ ln: M.lnTrainCost(u.cls, u.level, f), go: () => { u.level++; } });
      for (const u of Object.values(s.units)) {
        if (!unlocked(u.cls) || u.count >= M.unitCap(s.tier)) continue;
        opts.push({ ln: M.lnHireCost(u.cls, u.count, f), go: () => { if (!u.count) giveGun(u.cls); u.count++; } });
      }
      if (profile.tree) {
        const fr = frontierNodes();
        if (fr.length) { const pick = fr.find((n) => n.size !== 'small') ?? fr[0]; opts.push({ ln: M.lnTreeCost(s.alloc.length), go: () => { s.alloc.push(pick.id); } }); }
      }
      opts.sort((a, b) => a.ln - b.ln);
      const o = opts[0];
      if (!o || !pay(o.ln)) return;
      o.go();
    }
  }
  const out = [];
  let ci = 0;
  while (s.t < hours * 3600) {
    if (ci < CHECKS.length && s.t >= CHECKS[ci] * 3600) {
      const us = owned();
      const gs = us.map((u) => s.guns.find((g) => g.uid === u.gun)).filter(Boolean);
      const avgGunTier = gs.reduce((a, x) => a + x.ilvl, 0) / Math.max(1, gs.length);
      const avgTrain = us.reduce((a, u) => a + u.level, 0) / us.length;
      const lnTrain = avgTrain * Math.log(C.trainMult), lnGun = (avgGunTier - 1) * C.ITEM_SHARE * M.lnR;
      out.push({ h: CHECKS[ci], tier: s.tier, spawn: s.spawn, hordes: s.hordes, squad: us.map((u) => `${u.cls[0]}${u.count}`).join(' '), nodes: s.alloc.length,
        drops: s.drops, gunGap: s.tier - avgGunTier, train: Math.round(avgTrain), shareTrain: lnTrain / (lnTrain + lnGun || 1), keep: cap() / M.spawnRate(s.spawn) });
      ci++;
    }
    const rate = Math.min(M.spawnRate(s.spawn), cap());
    const kills = rate * DT;
    const mix = M.mixAt(s.tier);
    const lnDna = M.logSumExp(mix.map((m) => M.lnDnaPerKill(s.tier, m.id, fx()))) - Math.log(mix.length);
    s.dna = M.logAdd(s.dna, lnDna + Math.log(kills));
    if (rng() < kills * C.dropChance * (1 + fx().drop)) { s.drops++; const us = owned(); giveGun(us[Math.floor(rng() * us.length)].cls); }
    if (profile.hordes && M.hordeOdds(squad(), fx(), s.hordes + 1) >= 1.1) {
      s.hordes++;
      s.t += 60;
      const h = M.hordeDef(s.hordes);
      giveGun(h.cls ?? owned()[0].cls, h.elite ? 3 : 2, 2);
    }
    shop();
    s.t += DT;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of Object.values(PROFILES)) {
    console.log(`\n=== ${p.label} ===`);
    console.log('  hours | tier | spawn | hordes | passives | drops | gun gap | train lv | train share | keep-up | squad');
    for (const r of simulate(p)) {
      console.log(`${r.h.toFixed(2).padStart(7)} | ${String(r.tier).padStart(4)} | ${String(r.spawn).padStart(5)} | ${String(r.hordes).padStart(6)} | ${String(r.nodes).padStart(8)} | ${String(r.drops).padStart(5)} | ${r.gunGap.toFixed(1).padStart(7)} | ${String(r.train).padStart(8)} | ${(r.shareTrain * 100).toFixed(0).padStart(10)}% | ${r.keep.toFixed(2).padStart(7)} | ${r.squad}`);
    }
  }
}
