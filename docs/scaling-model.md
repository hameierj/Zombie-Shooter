# Scaling Model (v0.5)

Code: `src/core/model.ts` (numbers and formulas) and `src/core/tree.ts` (passives), shared with the game and the
simulator. Run `npm run sim -- [hours]` after any balance change.

## The economy
- **Income:** kills per second × DNA per kill. Kills per second = min(spawn rate, kill capacity). DNA per kill =
  3 · 1.15^(tier−1) · strain bonus · (1 + DNA passives).
- **Requirement:** zombie HP = 6 · 1.15^(tier−1) · strain HP · (1 + 3% per Spawn Rate level). To keep up, squad DPS must
  grow ×1.15 per tier.

## Where power comes from (the 50/50 split)
| Half | Growth | Per tier |
|---|---|---|
| **Training** | ×1.06 damage per level, cost ×1.15 per level | ~1.2 levels per tier ≈ half of each tier's ×1.15 |
| **Guns** | damage = rarity × 1.15^(0.5·(gun tier − 1)) | exactly half of each tier, as long as gun drops keep up |

Training cost grows slightly faster than income, so big flat bonuses (a new recruit class, a keystone, more slots)
give a quick jump of many tiers and then the pace settles, instead of snowballing. (An earlier version had training
cost growing slower than income; the simulator showed it running away from tier 86 to 668 in a few hours.)

## Flat bonuses
Recruit classes (Pistoleer 10 DPS → Grenadier 42 DPS, plus range and hits per shot), squad slots (3 → 8), passives
(+% damage, attack speed, crit, range; class keystones ×2–2.5), strain matchups, and gun rarity. Hordes gate most of
these, so they drive the big steps in progress.

## Simulation (active player, v0.5)
| Time | Tier | Spawn lvl | Hordes | Passives | Guns dropped |
|---|---|---|---|---|---|
| 5 min | 6 | 4 | 1 | 4 | 0 |
| 30 min | 32 | 17 | 4 | 18 | 5 |
| 1 h | 53 | 26 | 6 | 26 | 12 |
| 2 h | 119 | 30 | 10 | 46 | 26 |
| 5 h | 394 | 30 | 28 | 80 | 117 |
| 10 h | 465 | 30 | 33 | 80 | 278 |

A player who never fights hordes (Pistoleers only, Basic Training only) reaches ~tier 140 by 30 h. One who never buys
passives reaches ~150. Training's share of power stays at 45–55%.

**Known limitation:** once every region and class is unlocked (~5 h for an efficient player), progress slows to a crawl
(tier ~465 → ~510 from 10 h to 20 h). A prestige layer or more content (classes, strains, regions) is the next lever.
