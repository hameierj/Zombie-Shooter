# Zombie Idle: Game Spec (v0.8)

An idle zombie shooter with smooth HD cartoon art (drawn in code as vector shapes). Zombies walk at your shredder forever; your squad shoots them for DNA in five colours. You decide how hard the stream is, grow your squad and passive tree, and take on optional hordes to
unlock new recruit types and tree regions. Balance math: `scaling-model.md`.

## 1. The loop
1. Zombies stream in endlessly. Each **zombie type drops its own colour of DNA**, banked silently.
2. Spend each colour on the things priced in it: that zombie type's dials, the unit types whose trees use it, and
   the passive-tree regions paid in it.
3. Turn each zombie type's dials up while the squad keeps up (more of that colour, tougher zombies of that type).
4. Release new zombie types with the previous colour to open new colours.
5. Beat a **horde** when you're strong enough, to unlock the next unit type and tree region.
6. Rare **item drops** (guns, attachments, charms) give big jumps in power.

## 2. Zombie types and their dials (Zombies tab)
There are **25 zombie types in five DNA colour families**. Every type in a family drops that family's colour.
The first type of each family is released with the previous family's colour; the other four are released one after
another with the family's own colour (costs are tied to tiers ~30 to ~400, so new types keep appearing for hours).

| Colour | Family (release order) |
|---|---|
| Green | Shambler, Crawler, Office Zombie, Farmer, Prisoner |
| Yellow (fast) | Runner, Jogger, Courier, Skater, Athlete |
| Red (tanky) | Brute, Bouncer, Lumberjack, Butcher, Juggernaut |
| Teal | Spitter, Lab Tech, Sewer Worker, Hazmat Diver, Plague Doctor |
| Purple (very tanky) | Bloater, Chef, Sumo, Mutant, Abomination |

Later types in a family have more HP and drop proportionally more DNA. Hordes use the five family leaders.

**Varieties:** every zombie type also comes as **Feral** (×2.5 HP and DNA, reddish, a bit bigger) and **Alpha**
(×6 HP and DNA, bigger, dark aura). They join a type's stream as you raise its DNA Count: Ferals from tier 20
(up to 35% of that type), Alphas from tier 60 (up to 15%). The keep-up meter and DNA rates include them.

**Special zombies** (about 3% of the stream, no dials, glowing ring in their colour): Golden (fast, ×15 DNA, big
item chance), Armoured (×5 HP, ×5 DNA), Screamer (speeds up nearby zombies, ×4 DNA), Medic (heals nearby zombies,
×4 DNA), Exploder (blows up nearby zombies when killed, ×3 DNA).

Every released type has **its own two dials**, paid in its own colour:
| Dial | Range | Effect |
|---|---|---|
| **DNA Count** (tier) | 1 → ∞ | Each tier: ×1.15 DNA and ×1.15 HP for that type. Tiers only go up |
| **Spawn Rate** | 30 levels | +12% of that type per level; each level also +3% HP for that type |

The **keep-up meter** (Settings → Difficulty meters, which also shows horde odds) is **off by default**: players read the battlefield instead, and the
shredder glows and pulses red while zombies are reaching it. The **shredder** grinds every zombie that reaches it by
1% of its HP per second (no upgrades), so the road always clears and you can't get permanently stuck. There is no limit on how many can be at the shredder: a pile is drawn as a queue backing up the road (5 rows), and walkers stop behind it on screen. Horde zombies that break through are pulled into the blades; a lost horde fades away. Shredded
zombies pay **25% of their DNA × keep-up²** and don't count for the combo: a little help when slightly behind,
almost nothing when hopelessly overrun on purpose (so pushing tiers sky-high can't be farmed). When the shredder stays swamped for
20 s, a message suggests upgrading the squad. With the option on, a keep-up meter compares the squad's kill capacity with all arrivals combined, and every dial button previews
whether the squad would still keep up. If the squad falls behind, zombies pile up at the shredder, which grinds them
slowly. You never lose.

## 3. Units, their trees and items (Squad tab)
| Unit type | Gun | Ability (3 stages) | Tree paid in | Unlock |
|---|---|---|---|---|
| Pistoleer | Pistol | Double Tap: more attack speed | Green + Yellow | start |
| Hunter | Compound Bow | Piercing Arrows: hits more zombies | Yellow + Teal | Horde 1 |
| Shotgunner | Shotgun | Knockback: pushes zombies back | Green + Red | Horde 2 |
| Rifleman | Assault Rifle | Suppressive Fire: slows zombies | Yellow + Red | Horde 3 |
| Sniper | Sniper Rifle | Headshot: executes weakened zombies | Red + Purple | Horde 4 |
| Pyro | Flamethrower | Napalm: burning damage | Teal + Purple | Horde 5 |
| Grenadier | Grenade Launcher | Cluster Bombs: extra splash | Purple + Green | Horde 6 |
| Machine Gunner | Machine Gun | Overheat: +20/40/70% attack speed | Yellow + Red | Elite Horde 1 (8) |
| Drone Operator | Attack Drones (whole road) | Swarm: +1/2/3 drones (targets) | Teal + Yellow | Elite Horde 2 (9) |
| Railgunner | Railgun (charged beam that pierces a line) | Overcharge: pierces +1/2/3, +10/20/30% damage | Purple + Red | Elite Horde 3 (10) |
| Mortar Team | Mortar (whole road, big splash) | Barrage: more targets, +10/20/30% damage | Red + Purple | Elite Horde 4 (11) |
| Tesla Trooper | Arc Gun (chains) | Chain Lightning: arcs to +1/2/3 zombies | Purple + Teal | Elite Horde 6 (13) |

- **Up to 20 of each type.** Barracks space grows with your best tier (2 each at first, +1 every 10 tiers). Each extra
  unit costs ×1.8 more and adds a little less than the last (20 units ≈ 9× one).
- **Everything for a unit is on its Squad card** (there is no separate unit page): a header (portrait, count, level,
  DPS), a 2 × 4 grid of equal buttons in stacked pairs, left to right (**Hire/Damage, Crit/Crit ×, Speed/Range,
  Gear slots (Attachment → Charm)/Ability (I → II → III)**; the Ability button is labelled with what it buys, e.g. "Slow 15%", "Frag +2", "Pierce +3"; tap = buy with the buy amount), and a **gear shelf** (Gun shown as its damage multiplier, e.g. "×3.7 dmg"; Attachment, Charm; display only: units always carry their best items).
  The Squad menu dot lights only for an affordable Ability stage or Gear slot. The tree behind the buttons:
  Damage (endless, ×1.05 per level) → Attack Speed (20 levels), Range (10), Ability I → Crit Chance (15),
  Crit Damage (20), Ability II → Attachment Slot, Charm Slot, Ability III. The top half is paid in the type's first
  colour, the bottom half in its second, so every unit needs DNA from more than one zombie type.
- **Abilities evolve** through three stages (Ability I, II, III nodes).
- **Equipment:** one gun slot (shared by the whole group), plus an **attachment** slot (a stat boost: damage, speed,
  crit, crit damage or range) and a **charm** slot (bonus damage against one zombie type) once unlocked in the tree.
- **Selling:** any unused item sells for DNA (about 20 s of that colour's income, doubling per rarity step; guns pay
  in their unit type's colour, charms in their zombie type's colour). **Auto-sell** (Squad tab) sells new drops of a
  chosen rarity and lower the moment they drop (items that would be an upgrade are kept), or **Keep best**: keep what
  units have equipped plus the best gun per unit type, best attachment per stat and best charm per zombie type, and sell
  everything else, including older items a new drop replaces. Horde rewards are never auto-sold.
- **Drops are rare** and scale gently with total spawn rate; each arrives as a crate in its rarity colour. Every horde
  win guarantees a rare-or-better item (the new unit type's gun for hordes 1–6).

## 4. Passive tree (Tree tab)
A **List** view by default ("Available now" cards and collapsible regions) or the pan/zoom **Web**. Unit upgrades
live on the Squad page, not here.

### Global passive tree
A POE2-style web you pan (drag) and zoom (pinch, scroll wheel, or the + / − buttons). It has eight regions around the
Command Post; each has small nodes, two notables and a keystone, and neighbouring regions are linked.

| Region | Opens with | Highlights |
|---|---|---|
| Basic Training | start | +damage, +attack speed; War Drums (auto-start hordes), Quartermaster (+15% item drops); Barracks (+20% damage) |
| Marksman | Horde 1 | Hunter pierce, crit, range; Hunters ×2 |
| Breacher | Horde 2 | Shotgun spread, ×1.4 vs Brutes; Shotgunners ×2 |
| Suppression | Horde 3 | attack speed, crit damage; Riflemen ×2 |
| Deadeye | Horde 4 | range, crit damage, ×1.4 vs Brutes; Snipers ×2.5 |
| Inferno | Horde 5 | flame targets, ×1.5 vs Bloaters; Pyros ×2 |
| Demolition | Horde 6 | drop chance, splash; Grenadiers ×2 |
| Command | Horde 7 | hiring −25%, +10% attack speed, cheaper training; whole squad ×1.5 |

Allocate a node next to one you own. Each region is paid in its own DNA colour (Basic Training Green, Marksman and Suppression Yellow, Breacher and Deadeye Red, Inferno Teal, Demolition and Command Purple); each allocation costs ×1.9 more than the last. Tap a node to see what it does.

## 5. Hordes (Hordes tab)
Optional fights: **60 zombies, then a boss**. The stream pauses while you fight. The boss is a giant version of the
toughest zombie type in the horde (×10 HP) and comes last, walking slowly. **You lose if the boss reaches the shredder
or 10 horde zombies reach it** (no timer). The field shows zombies left, breaches, the boss's distance from the
shredder, and a distance bar along the bottom. With **Difficulty meters** on (Settings), each card shows your odds
(calibrated in play tests: 1.15 wins, 0.95 loses; War Drums starts at 1.10); off by default. Hordes 1–7 are at tiers 6, 20, 40, 70, 110,
160 and 220, and unlock the unit types and regions above. After that come endless **Elite hordes** every 30 tiers
(some unlock the newer recruits, the rest give an epic+ item). Losing costs nothing; try again when stronger.

## 5b. Combo
Every kill while you're playing adds 1 to the **combo**, shown over the battlefield. DNA from kills is multiplied by
up to **×1.5** at a 300 combo. The combo resets after 3 seconds without a kill and **halves whenever a zombie reaches
the shredder**, so pushing the dials past what the squad can handle costs you the bonus. Offline time earns no combo.

## 6. Automation and time away
**Automations never spend DNA**, so they can't take DNA away from the choices you want to make. The only ones are
free actions: **gear is always auto-equipped** (every unit type carries its best gun, attachment and charm; it
re-optimises on every drop, hire and new slot), **auto-sell always keeps the best of each kind** (no item stash to manage), and **War Drums** (starts the next horde when your squad
should win; can be switched off on the Hordes tab). **There are no offline earnings:** only active play counts. When
the app is closed or in the background the game simply pauses and saves.

## 7. Screens and sound
**Buy amount:** a ×1 / ×10 / Max selector pinned to the top of the Zombies, Squad and unit-tree pages applies to every
repeatable purchase (DNA +, Spawn +, Hire, Damage + and unit-tree upgrades); buttons show how many you'd get and the
total price. The choice is remembered on the device.

Soldiers stand at random spots along the wall, mixed together (up to 6 shown per unit type; the rest fire through them).
With **Settings → Range lines** on (off by default), each hired unit type has a dashed **range line** on the road in its own colour, marked with its gun. A slim keep-up bar
is pinned to the top of the Zombies and Squad menus.

The zombie map fills the screen between the top bar (a counter for each DNA colour; plus the keep-up pill when
difficulty meters are on) and the bottom menu: **Zombies, Squad, Tree, Hordes, Settings**. Tapping a tab opens that menu **full-screen** (two-column layout
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

## 9. Saves across updates
Saves upgrade automatically (v4 → v5 → v6) under the same storage key, with the old save copied to a backup first.
Upgrading to v0.8: all old DNA becomes Green DNA, the old tier and spawn level go to Shamblers, zombie types that were
already in the stream are released (at tier 1, free to raise back to the old best), unit training levels become
Damage levels in each unit's tree, and tiers are lowered if needed so the squad starts out keeping up.

## 10. Ranges and the road
Range is how far up the road a unit shoots, measured from the shredder. Base ranges: Shotgunners 15%, Pyros 20%,
Tesla Troopers 30%, Pistoleers 40%, Machine Gunners 50%, Riflemen 60%, Grenadiers 65%, Hunters 75%, Mortar Team 85%,
Railgunners 80%, Drone Operators 90%, Snipers 100%. Range bonuses are minor: +2% per Range level (+20% at level 10), small attachments and passives, at most +30%
in total; only Snipers can cover the whole road (others cap
at 95%). Zombies take about 16 s to walk the road, and the view is zoomed out (~400 art units across the short side).
See `unit-ranges.png`.

## 11. Save slots
Settings → **Save slots**: three slots plus an automatic **Backup**. *Save here* copies the current game into a slot;
*Load* swaps a slot in (the current game is copied to Backup first, so a swap can always be undone); *Code* shows a
slot's save code; *Clear* empties it. *Import code* checks a pasted code, then loads it or files it into a slot.
`docs/saves/maxed-20h.txt` is a ready-made "20 hours in" save (made by `node tools/make-save.ts`).
