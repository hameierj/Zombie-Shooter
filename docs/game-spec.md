# Zombie Idle: Game Spec (v0.7)

An idle zombie shooter with 16-bit pixel art. Zombies walk at your shredder forever; your squad of recruits shoots
them for DNA. You decide how hard the stream is, grow your squad and passive tree, and take on optional hordes to
unlock new recruit types and tree regions. Balance math: `scaling-model.md`.

## 1. The loop
1. Zombies stream in endlessly. Every kill gives **DNA**, which is banked silently.
2. Spend DNA on **training** recruits, **hiring** more, **passives** in the tree, and the two **zombie dials**.
3. Turn the dials up while the squad keeps up (more DNA, tougher zombies).
4. Beat a **horde** when you're strong enough, to unlock the next recruit type and tree region.
5. Rare **gun drops** give big jumps in power.

## 2. Zombie dials (Zombies tab)
| Dial | Range | Effect |
|---|---|---|
| **DNA Count** (tier) | 1 → ∞ | Each tier: ×1.15 DNA per zombie and ×1.15 zombie HP. Cost 40·1.15^(tier−1). You can dial back down for free and back up to your best |
| **Spawn Rate** | 30 levels | 1.0 → 4.6 zombies/s (+12% per level); each level also +3% zombie HP |

A **keep-up meter** compares the squad's kill capacity with the arrival rate and tells you, before you buy, whether
the squad will keep up at the next tier or spawn level. If the squad falls behind, zombies pile up at the shredder,
which grinds them slowly. You never lose.

New strains join the stream as the tier rises: Shambler (1), Runner (6, fast, fragile), Brute (14, ×2.5 HP),
Spitter (25), Bloater (40, ×4 HP). Each gun class is better or worse against certain strains.

## 3. Recruits and guns (Squad tab)
| Class | Gun | Range | Fire rate | Hits per shot | Unlock |
|---|---|---|---|---|---|
| Pistoleer | Pistol | short-mid | fast | 1 | start |
| Hunter | Compound Bow | long | slow | 2 (pierce) | Horde 1 |
| Shotgunner | Shotgun | short | medium | 3 (spread) | Horde 2 |
| Rifleman | Assault Rifle | mid-long | very fast | 1 | Horde 3 |
| Sniper | Sniper Rifle | whole road | very slow, big crits | 1 | Horde 4 |
| Pyro | Flamethrower | very short | constant | 4 | Horde 5 |
| Grenadier | Grenade Launcher | long | slow | 4 (splash) | Horde 6 |

- **Unit types, not individual recruits:** you hire **up to 20 of each type** (140 soldiers in total). Barracks space
  grows with your best tier: 2 of each type at first, +1 every 10 tiers, so a full 20 arrives at tier 180. Each extra
  unit of a type costs ×1.8 more DNA and adds a little less firepower than the last (20 units ≈ 9× one unit).
- **Shared training:** one Train upgrades every soldier of that type (×1.05 damage per level, cost ×1.15 per level).
- **Shared gun:** each type carries one issued gun model; issuing a better one upgrades the whole group.
- **Guns:** each gun belongs to one class. Damage grows with the gun's tier (the DNA Count tier it dropped at) and its
  rarity (×1 common → ×3.2 legendary). Every new recruit arrives with a standard gun at your current tier.
- **Drops are rare:** 0.12% per zombie (about one every few minutes once the stream is fast). Each one arrives as a
  crate with a beam in its rarity colour. Every horde win guarantees a rare-or-better gun.

## 4. Passive tree (Tree tab)
A POE2-style web you pan (drag) and zoom (pinch, scroll wheel, or the + / − buttons). It has eight regions around the
Command Post; each has small nodes, two notables and a keystone, and neighbouring regions are linked.

| Region | Opens with | Highlights |
|---|---|---|
| Basic Training | start | +damage, +attack speed; War Drums (auto-start hordes), Quartermaster (auto-equip); Barracks (+20% damage) |
| Marksman | Horde 1 | Hunter pierce, crit, range; Hunters ×2 |
| Breacher | Horde 2 | Shotgun spread, ×1.4 vs Brutes; Shotgunners ×2 |
| Suppression | Horde 3 | attack speed, crit damage; Riflemen ×2 |
| Deadeye | Horde 4 | range, crit damage, ×1.4 vs Brutes; Snipers ×2.5 |
| Inferno | Horde 5 | flame targets, ×1.5 vs Bloaters; Pyros ×2 |
| Demolition | Horde 6 | drop chance, splash; Grenadiers ×2 |
| Command | Horde 7 | hiring −25%, +10% attack speed, cheaper training; whole squad ×1.5 |

Allocate a node next to one you own. Each allocation costs ×1.5 more than the last. Tap a node to see what it does.

## 5. Hordes (Hordes tab)
Optional challenges: **60 zombies in 60 seconds** at a fixed tier. The stream pauses while you fight. Each card shows
your odds before you start. Hordes 1–7 are at tiers 6, 20, 40, 70, 110, 160 and 220, and unlock the unit types and
regions above. After that come endless **Elite hordes** every 30 tiers, each rewarding an epic+ gun. Losing costs nothing.

## 6. Idle and offline
**Automations never spend DNA**, so they can't take DNA away from the choices you want to make. The only ones are
free actions: **Quartermaster** (auto-equips the best guns) and **War Drums** (starts the next horde when your squad
should win; can be switched off on the Hordes tab). Every DNA purchase is yours to make. Time away (up to 12 h) is simulated
with the same economy and summarised: zombies, DNA, guns found, tiers raised.

## 7. Screens and sound
The zombie map fills the screen between the HUD (DNA + per second, tier, keep-up status, sound, settings) and four big
tabs at the bottom: **Zombies, Squad, Tree, Hordes**. Tapping a tab opens that menu **full-screen** (two-column layout
on wide screens); **✕ Back to map** or tapping the tab again collapses it. Starting a horde closes the menu so you can
watch the fight.

**Sound** is synthesised in code (works offline): a distinct shot for every gun, explosions, zombie deaths and groans,
the shredder grinding, loot jingles by rarity, horde siren / victory / defeat, interface taps and purchases, and a
quiet looping soundtrack. Sound effects and music each switch on or off in Settings; the 🔊 button mutes everything.
(On iPhone the ring/silent switch also mutes web audio.) The battlefield is zoomed out (~360 art pixels across its short side) and shows up to 60 zombies at once.
Laptop: battlefield left, panel right. Phones: stacked, tabs at the bottom. iPhone Duo: switches layout live when
folded or unfolded.

## 8. Later
Audio, more recruit classes and strains, gun perks, a prestige layer for the very late game, cloud save, and Steam
and App Store builds.
