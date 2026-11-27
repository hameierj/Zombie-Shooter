// Plays the v0.8 model with bot players: five DNA colours, per-zombie-type dials, unit trees, gear, the passive tree
// and optional hordes. Run: npm run sim -- [hours] [seed]   (CHECKS=0.5,1,2 to choose the report times)
import * as M from '../src/core/model.ts';
import { TREE, treeFx, REGIONS } from '../src/core/tree.ts';

const C = M.CONFIG;
const HOURS = Number(process.argv[2] ?? 30);
const SEED = Number(process.argv[3] ?? 1);
const CHECKS = (process.env.CHECKS ?? '0.1667,0.5,1,2,5,10,20,30').split(',').map(Number).filter((h) => h <= HOURS);
const DT = 2;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export const PROFILES = {
  active: { hordes: true, tree: true, label: 'Active: hordes, passives, unit trees, gear' },
  noHordes: { hordes: false, tree: true, label: 'Never fights hordes' },
  noTree: { hordes: true, tree: false, label: 'Never buys passives' },
};

export function simulate(profile, hours = HOURS, seed = SEED) {
  const rng = mulberry32(seed);
  const strains = Object.fromEntries(M.ZOMBIE_IDS.map((s) => [s, { unlocked: s === 'shambler', tier: 1, maxTier: 1, spawn: 0 }]));
  const units = Object.fromEntries(M.CLASSES.map((c) => [c.id, { cls: c.id, count: c.id === 'pistol' ? 1 : 0, nodes: {}, gun: c.id === 'pistol' ? 1 : null, attach: null, charm: null }]));
  const s = { t: 0, dna: Object.fromEntries(M.STRAIN_IDS.map((x) => [x, -Infinity])), hordes: 0, nextUid: 2, guns: [{ uid: 1, cls: 'pistol', rarity: 'common', ilvl: 1 }], gear: [], alloc: [], drops: 0 };
  // PERKS='{"dmg":3,"dna":3,"warchest":1}' simulates a run after prestiging with those perks
  const prestige = { runs: 1, points: 0, earned: 0, perks: JSON.parse(process.env.PERKS ?? '{}') };
  M.live.spawnMult = 1 + 0.1 * M.plv(prestige, 'spawn');
  const fx = () => M.applyPerks(treeFx(s.alloc), prestige);
  const owned = () => Object.values(units).filter((u) => u.count > 0);
  const squad = () => owned().map((u) => ({ u, gun: s.guns.find((g) => g.uid === u.gun), attach: s.gear.find((g) => g.uid === u.attach), charm: s.gear.find((g) => g.uid === u.charm) }));
  const keep = (st = strains) => M.keepUp(squad(), fx(), st);
  const unlocked = (c) => M.classById(c).horde <= s.hordes;
  const spent = {}, earned = {}, waits = {};   // STATS=1: per colour, DNA spent by category, earned, and seconds of income to afford the cheapest thing
  let cat = '';
  const pay = (col, ln) => { if (s.dna[col] + 1e-9 < ln) return false; s.dna[col] = M.logSub(s.dna[col], ln); if (cat) { spent[col] ??= {}; spent[col][cat] = M.logAdd(spent[col][cat] ?? -Infinity, ln); } return true; };
  const best = () => M.bestTier(strains);
  function equip() {
    const fl = M.gunFloor(strains);
    for (const g of s.guns) if (g.ilvl < fl) g.ilvl = fl;   // guns keep up with the toughest zombie tier
    for (const u of Object.values(units)) {
      const g = s.guns.filter((x) => x.cls === u.cls).sort((a, b) => M.lnGunPower(b) - M.lnGunPower(a))[0];
      if (g) u.gun = g.uid;
    }
    const byPow = owned().sort((a, b) => M.classById(b.cls).dps - M.classById(a.cls).dps);
    const atts = s.gear.filter((g) => g.kind === 'attach' && g.stat === 'dmg').sort((a, b) => b.value - a.value);
    const chs = s.gear.filter((g) => g.kind === 'charm' && g.bane === null).sort((a, b) => b.value - a.value);
    for (const u of byPow) { u.attach = M.nlv(u, 'attach') ? atts.shift()?.uid ?? null : null; u.charm = M.nlv(u, 'charm') ? chs.shift()?.uid ?? null : null; }
  }
  function drop(minR = 0, cls = null, bonus = 0) {
    s.drops++;
    if (!cls && rng() < 0.4) { s.gear.push(M.rollGear(rng, s.nextUid++, minR)); equip(); return; }
    const os = owned();
    const c = cls ?? os[Math.floor(rng() * os.length)].cls;
    s.guns.push({ uid: s.nextUid++, cls: c, rarity: M.rollRarity(rng, minR), ilvl: best() + bonus + (rng() < 0.15 ? 1 + Math.floor(rng() * 3) : 0) });
    equip();
  }
  function shop() {
    for (let guard = 0; guard < 400; guard++) {
      const f = fx();
      let bought0 = false;
      const saving = new Set();   // colours the player is saving up for a release
      const opts = [];
      for (const x of M.STRAINS) {
        const st = strains[x.id];
        if (!st.unlocked) { if (x.unlock && !M.COLOUR_HORDE[x.id] && strains[x.unlock.from].unlocked && strains[x.unlock.from].maxTier >= M.TIER_CAP) { const col = M.familyOf(x.unlock.from), ln = M.lnReleaseCost(x.id); if (pay(col, ln)) { st.unlocked = true; bought0 = true; } else saving.add(col); } continue; }   // players evolve as soon as they can; colours come from hordes
        const up = { ...strains, [x.id]: { ...st, tier: st.tier + 1 } };
        if (st.tier < M.tierCapOf(x.id) && keep(up) >= 1.15) opts.push({ cat: 'tier', col: x.family, ln: M.lnTierCost(x.id, st.tier), go: () => { st.tier++; st.maxTier = Math.max(st.maxTier, st.tier); equip(); } });
        const sp = { ...strains, [x.id]: { ...st, spawn: st.spawn + 1 } };
        if (st.spawn < C.spawnMax && keep(sp) >= 1.15) opts.push({ cat: 'spawn', col: x.family, ln: M.lnSpawnCost(x.id, st.spawn, st.maxTier), go: () => { st.spawn++; } });
      }
      for (const u of Object.values(units)) {
        const c = M.classById(u.cls);
        if (unlocked(u.cls) && u.count < M.unitCap(best())) opts.push({ cat: 'hire:' + u.cls, col: c.primary, ln: M.lnHireCost(u.cls, u.count, f), go: () => { if (!u.count && !u.gun) drop(0, u.cls); u.count++; } });
        if (!u.count) continue;
        for (const n of M.UNIT_NODES) {
          const lv = M.nlv(u, n.id);
          if (M.unitNodeMaxed(n, lv) || (n.requires && !M.nlv(u, n.requires))) continue;
          opts.push({ cat: 'unit:' + u.cls, col: M.nodeColour(u.cls, n), ln: M.lnUnitNodeCost(u.cls, n, lv, f), go: () => { u.nodes[n.id] = lv + 1; equip(); } });
        }
      }
      if (profile.tree) {
        const fr = TREE.filter((n) => n.id !== 'start' && !s.alloc.includes(n.id) && REGIONS[n.region].horde <= s.hordes && n.links.some((l) => l === 'start' || s.alloc.includes(l)));
        for (const n of fr) opts.push({ cat: 'tree', col: REGIONS[n.region].dna, ln: M.lnTreeCost(s.alloc.filter((a) => TREE.find((t) => t.id === a)?.region === n.region).length, REGIONS[n.region]), go: () => { s.alloc.push(n.id); treeAt.push(`${n.region}@${Math.round(s.t / 60)}`); } });
      }
      let bought = false;
      // cheapest option per colour
      for (const col of M.STRAIN_IDS) {
        if (saving.has(col)) continue;
        const o = opts.filter((x) => x.col === col).sort((a, b) => a.ln - b.ln)[0];
        if (o) { cat = o.cat; const ok = pay(col, o.ln); cat = ''; if (ok) { o.go(); bought = true; } }
        if (process.env.STATS && o && guard === 0 && Math.floor(s.t) % 30 === 0) { const r = lastRate[col]; if (Number.isFinite(r)) { waits[col] ??= []; waits[col].push([s.t / 60, Math.exp(Math.min(50, o.ln - r))]); } }
      }
      if (!bought && !bought0) return;
    }
  }
  const out = [];
  const lastRate = {};
  const uwait = {}; let lastUW = -1;
  const hordeAt = [];
  const hordeBest = [];
  const tierAt = [];
  const treeAt = [];
  const capAt = [];
  let ci = 0;
  while (s.t < hours * 3600) {
    if (process.env.STATS && Math.floor(s.t) % 600 === 0 && Math.floor(s.t) !== lastUW) {
      lastUW = Math.floor(s.t);
      for (const u of owned()) { const c = M.classById(u.cls), r = lastRate[c.primary]; if (!Number.isFinite(r)) continue; const ln = M.lnUnitNodeCost(u.cls, M.unitNodeById('dmg'), M.nlv(u, 'dmg'), fx()); (uwait[u.cls] ??= []).push(`${Math.round(s.t / 60)}:${Math.exp(Math.min(50, ln - r)).toFixed(0)}`); }
    }
    if (ci < CHECKS.length && s.t >= CHECKS[ci] * 3600) {
      out.push({ h: CHECKS[ci], tiers: M.STRAIN_IDS.map((x) => strains[x].unlocked ? strains[x].tier : '-').join('/') + ` (${M.activeStrains(strains).length} types)`, hordes: s.hordes, nodes: s.alloc.length, drops: s.drops,
        squad: owned().map((u) => `${u.cls[0]}${u.count}:${M.nlv(u, 'dmg')}${M.abilityStage(u) ? '*' + M.abilityStage(u) : ''}`).join(' '), keep: keep() });
      ci++;
    }
    const sq = squad(), f = fx();
    const k = Math.min(1, M.keepUp(sq, f, strains));
    const rate = M.lnDnaPerSec(sq, f, strains);
    for (const c of M.COLOURS) { lastRate[c] = rate[c] + Math.log(Number(process.env.LIVE ?? 1.4)); earned[c] = M.logAdd(earned[c] ?? -Infinity, rate[c] + Math.log(DT * Number(process.env.LIVE ?? 1.4))); }
    let kills = 0;
    // real play also earns combo (per type, ~×1.3 on average) and special zombies (~+10%)
    for (const c of M.COLOURS) s.dna[c] = M.logAdd(s.dna[c], rate[c] + Math.log(DT * Number(process.env.LIVE ?? 1.4)));
    for (const x of M.activeStrains(strains)) kills += M.spawnRate(x, strains[x].spawn) * k * DT;
    if (rng() < kills * M.dropChance(strains, f)) drop();
    if (profile.hordes && M.hordeOdds(sq, f, s.hordes + 1) >= 1.1) {
      s.hordes++; s.t += 60; hordeAt.push(s.t / 60); hordeBest.push(best());
      for (const [id, k] of Object.entries(M.COLOUR_HORDE)) if (k === s.hordes) strains[id].unlocked = true;
      const h = M.hordeDef(s.hordes);
      if (h.cls) drop(2, h.cls, 2); else drop(3);
    }
    shop();
    if (Math.floor(s.t / 60) !== Math.floor((s.t + DT) / 60)) {
      tierAt.push(best());
      if (process.env.CAP && Math.floor(s.t / 60) % 5 === 0) { let lo = 1, hi = 4000; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (M.hordeOdds(sq, f, s.hordes + 1, m) >= 1.1) lo = m; else hi = m; } capAt.push(`${Math.floor(s.t / 60)}:${lo}`); }
    }
    s.t += DT;
  }
  out.uwait = uwait; out.spent = spent; out.earned = earned; out.waits = waits;
  out.hordeAt = hordeAt; out.hordeBest = hordeBest; out.tierAt = tierAt; out.treeAt = treeAt; out.capAt = capAt;
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of Object.values(PROFILES)) {
    console.log(`\n=== ${p.label} ===`);
    const res = simulate(p);
    if (process.env.TIERS) { console.log('best tier by minute: ' + res.tierAt.map((t, i) => i % 5 === 0 ? `${i}:${t}` : '').filter(Boolean).join(' ')); console.log('best tier at each win: ' + res.hordeBest.map((t, i) => `${i + 1}:${t}/${M.hordeDef(i + 1).tier}`).join(' ')); }
    if (process.env.TREE) console.log('passives (region@min): ' + res.treeAt.join(' '));
    if (process.env.CAP) console.log('beatable horde tier: ' + res.capAt.join(' '));
    if (res.hordeAt.length) console.log('hordes at (min): ' + res.hordeAt.map((m, i) => `${i + 1}:${m.toFixed(0)}`).join(' ') + '\n  gaps (min): ' + res.hordeAt.map((m, i) => (m - (res.hordeAt[i - 1] ?? 0)).toFixed(0)).join(' '));
    if (process.env.STATS) {
      for (const col of M.COLOURS) {
        const e = res.earned[col]; if (!Number.isFinite(e ?? -Infinity)) continue;
        const sp = res.spent[col] ?? {};
        const parts = Object.entries(sp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(Math.exp(v - e) * 100).toFixed(0)}%`).join(', ');
        const w = res.waits[col] ?? [];
        const bins = [10, 20, 30, 45, 60, 90, 120].map((m) => { const xs = w.filter(([t]) => t > m - 10 && t <= m).map(([, x]) => x).sort((a, b) => a - b); return xs.length ? `${m}m:${xs[Math.floor(xs.length / 2)].toFixed(0)}s` : ''; }).filter(Boolean).join(' ');
        console.log(`${col.padEnd(9)} spent: ${parts}\n          median wait for its cheapest buy: ${bins}`);
      }
    }
    if (process.env.STATS) for (const [c, w] of Object.entries(res.uwait)) console.log(`  ${c.padEnd(8)} (${M.classById(c).primary}) secs of income per Damage level @min: ${w.join(' ')}`);
    for (const r of res) console.log(`${String(r.h).padStart(6)}h  tiers ${r.tiers.padEnd(34)} hordes ${String(r.hordes).padStart(2)}  passives ${String(r.nodes).padStart(2)}  drops ${String(r.drops).padStart(3)}  keep ${r.keep.toFixed(2)}  ${r.squad}`);
  }
}
