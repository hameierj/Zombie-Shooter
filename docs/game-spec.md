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
another with the family's own colour. **Releasing** a type needs the type it comes from at **tier 15**, and has a
**fixed price** in the colour you pay with (4,500–50,000, about 3 minutes of a normal run's income when it opens up). The
price never moves while you save up for it (`RELEASE_COST` in model.ts).

| Colour | Family (release order) |
|---|---|
| Green | Shambler, Crawler, Office Zombie, Farmer, Prisoner |
| Yellow (fast) | Runner, Jogger, Courier, Skater, Athlete |
| Red (tanky) | Brute, Bouncer, Lumberjack, Butcher, Juggernaut |
| Teal | Spitter, Lab Tech, Sewer Worker, Hazmat Diver, Plague Doctor |
| Purple (very tanky) | Bloater, Chef, Sumo, Mutant, Abomination |

Later types in a family have more HP and drop proportionally more DNA. Hordes use the five family leaders.
Horde zombies pay DNA at **your** best tier (never the horde's higher tier), so a horde is never a DNA jackpot.

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
  Damage (endless, ×1.06 per level, price ×1.13 per level: one zombie tier of HP costs about one tier of income, so
  every tier takes about the same play time), Attack Speed (20 levels), Range (10), Crit Chance (15) and Crit Damage
  (20) (all four ×1.3 per level), Ability I–III and the Attachment → Charm slots. **Everything on a unit's card is
  paid in one DNA colour** (its first). A **★ best buy** marks the upgrade (or Hire) that adds the most damage per
  DNA right now.
- **Abilities evolve** through three stages (Ability I, II, III nodes).
- **Guns keep up with you:** every gun is refitted to your toughest zombie tier whenever you raise it (guns cover
  half of each tier's HP growth by design, so they must never fall behind). Drops and horde rewards then matter for
  **rarity** (×1 to ×3.2 damage).
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
One **checklist per region**, one region open at a time. Each region shows a progress ring (n/10), how many passives
are ready, the DNA colour it's paid in, and its keystone up front as the **goal**. Inside: steps 1–3, then **Path A and
Path B** side by side (3 steps each), then the keystone, which opens once either path is done. Each passive raises the
price of the next one (×1.9). Locked regions say which horde opens them. Unit upgrades live on the Squad page.

Each region is a straight path from the Command Post: there are no links between regions (older saves keep any
passive they took through the old cross-region links).

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
Optional fights. The stream pauses while you fight. Every horde has a **type** and ends with a **boss** (×10 HP, plus
its own mechanic) that comes last. **You lose if the boss reaches the shredder or 10 horde zombies reach it** (no
timer). The field shows zombies left, breaches, the boss's distance from the shredder, and a distance bar along the
bottom. Losing costs nothing; try again when stronger.

**Horde types** (horde 1–7 in this order; Elite hordes cycle through all but the plain march):
| Type | What changes |
|---|---|
| Horde | 60 zombies at a steady march |
| Stampede | 60 zombies at 1.6× speed (0.8× HP) |
| Armoured Column | 24 armoured zombies: 2.6× HP, slow |
| Swarm | 120 weak zombies (0.45× HP), spawning twice as fast |
| Waves | 3 waves of 20 with a 6 s breather between them |
| Fog March | 50 zombies hidden in fog (and impossible to shoot) until halfway down the road |
| Field Hospital | 60 zombies with 6 medics that heal the horde |

**Bosses** (rotating, one per horde):
| Boss | Mechanic | Battleground |
|---|---|---|
| Giant Exploder | Bursts into 10 fast crawlers when it dies | Chem Works |
| Leaper | Crouches, then leaps far; can't be hit in the air | The Swamp |
| Titan | 1.9× boss HP, very slow, shakes the ground, ignores slows | Badlands Quarry |
| Brood Mother | Spawns 2 small zombies every 2.5 s | The Hive |
| Screamer King | Every horde zombie runs 35% faster while it lives | Neon District |
| Iron Juggernaut | An armour bar that takes half damage until it breaks | The Scrapyard |

**Battlegrounds:** the map always matches the boss of your next horde, and changes (with a "New battleground"
banner) right after you beat a horde.

The odds (shown with **Difficulty meters** on) account for the type and boss: count × HP × a difficulty factor for
speed, fog or healing, plus the extra zombies a boss brings, against the time until the boss arrives and walks in.
Browser play tests: every horde type and boss won at 1.3, and 5 of 6 lost at 0.85. War Drums starts at 1.10.
Hordes 1–7 are at tiers 17, 26, 34, 85, 480, 1000 and 1400, and unlock the unit types and regions above. Elite
hordes follow at 1860, 2075, 2215, 2290, 2340, 2385, then +32 each (some unlock the newer recruits, the rest give an
epic+ item). These are set from the balance sim (`node tools/sim.ts`, which prints the minute of each horde) so the gaps
grow gently: hordes at about 5, 11, 25, 43, 65, 90 and 110 min, then one every 30–40 min. If the next horde is far
above your toughest zombies, its card says so and points you at raising zombie tiers.

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
The game saves within half a second of anything you do (buying, hiring, releasing, a horde won or lost), every 10 s,
and when the app is hidden or loses focus. iOS often skips the save when an app is closed, so relying on that alone
could undo recent purchases and hand their DNA back on reload.

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

**Quick zombie rail.** Down the right edge of the map, every released zombie type has an icon (grouped by colour, with
its tier). Tap one for a pop-over with its two upgrades, **DNA +** (tier) and **Spawn +**, using the same buy amount as the
Zombies tab. A green dot means one of them is affordable. The list scrolls; the ‹ › button collapses it to a small tab
(remembered). It hides while a menu is open.

**Quick unit rail.** The same thing on the left edge for your unit types: each unlocked type shows its icon and how many
you have (dashed "New" if none yet). Tap one for its Squad-card upgrade grid (Hire, Damage, Crit, Crit ×, Speed, Range,
Gear, Ability), or just Hire for a type you haven't hired. A green dot means something there is affordable. Only one
rail pop-over is open at a time.

## 11. Settings and saves
Settings is one screen in three sections. **Sound & display**: on/off switches for sound effects, music, range lines and
difficulty meters. **Saves**: the current game (with when it was last saved), three slots and an automatic **Backup**,
shown inline. *Save* copies the current game into a slot (asks first if the slot has a save); *Load* switches to a slot
(asks first; the current game goes to Backup, so it can always be undone); ✕ deletes a slot (asks first). *Copy save
code* / *Paste save code* move a game between devices; a pasted code is checked as you paste it, then loaded or put into
a slot. **Danger zone**: *Erase progress* (asks first) also keeps the current game in Backup, so it can be restored.
A session timer at the top right of the screen shows how long you've been playing since opening the app (it pauses
while the app is in the background).
`docs/saves/maxed-20h.txt` is a ready-made "20 hours in" save (made by `node tools/make-save.ts`).

## 12. Title screen, music and look
- **Title screen** (every launch): the screen switches on like an old TV, INSERT COIN blinks, the logo slams in, then
  PRESS START with a summary of the save (tier, hordes, time played) or NEW GAME. The battle is paused behind it and
  play time doesn't count. Tapping plays the start sting and the battle music starts.
- **Music** is the teaser's chiptune (120 BPM, A minor), made by `tools/make-music.py`: a 32 s battle loop and a
  16 s double-time horde loop (WAV, so they loop without a gap), crossfading when a horde starts and ends. If the
  files can't load, the old built-in synth groove plays instead.
- **Banners** pop in arcade-style (scale 1.7 → 1), sized to the field: a red WARNING · HORDE INCOMING with hazard
  stripes and a pulsing red wash when a horde starts, then the horde's name; the boss's name in red when it arrives;
  VICTORY! with a gold flash; the new battleground's name after each win.
- **Units** each have their own look: Pistoleer (white tank top, ripped jeans), Hunter (camo, blaze-orange vest and
  cap), Shotgunner (red flannel, trucker cap, beard), Rifleman (army camo, plate carrier, helmet), Sniper (ghillie
  suit), Pyro (firefighter coat, gas mask, fuel tank), Grenadier (beret, grenade bandolier), Machine Gunner
  (sleeveless, bandana, shades, ammo belt), Drone Operator (hoodie, glowing visor), Mortar Team (desert tan, boonie,
  ear defenders), Tesla Trooper (rubber suit, copper coils, brass goggles), Railgunner (white power armour).

## 13. Prestige
On the **Hordes tab**: once you've cleared at least one horde in a run you can **prestige**: the run starts over (zombie
tiers and types, units, gear, DNA, passive tree and hordes reset) for **1 point per horde cleared this run**. Perks,
points and total play time are kept, and the current game is copied to the Backup save slot first.

**Perks are chosen before the reset.** "Prestige now" opens *Choose your perks*: the pool is your unspent points plus this
run's points. Each tap drafts one level (Undo picks clears the draft); nothing changes until **Reset & start run N**,
which applies the picks and then resets. Cancel / ✕ leaves the run untouched. Points you don't spend are kept, and can
still be spent any time from Hordes tab → Perks. Perks are **permanent and stack across every run**:

| Perk | Per level | Max | Cost |
|---|---|---|---|
| DNA Surge | ×1.25 DNA from every kill | 20 | 1 |
| Firepower | ×1.15 damage, whole squad | 30 | 1 |
| Trigger Discipline | +5% attack speed | 10 | 1 |
| Long Range | +2% range | 5 | 1 |
| Deadeye | +2% crit chance | 10 | 1 |
| Heavy Hitter | +20% crit damage | 10 | 1 |
| Spawn Surge | +10% spawn rate of every zombie type | 10 | 1 |
| Head Start | start each run with 500 × 4^level DNA of every colour | 5 | 1 |
| War Chest | Damage upgrades 5% cheaper | 10 | 1 |
| Big Barracks | +2 soldiers per unit type (to the max of 20) | 5 | 2 |
| Lucky Finds | +15% item drop chance | 10 | 1 |
| Gold Rush | special zombies +50% as common | 4 | 2 |
| Combo Master | +0.1 to the combo's top multiplier | 5 | 2 |
| Bounty Hunter | +1 extra point per 5 hordes cleared in a run | 3 | 3 |

Balance sim (`PERKS='{"dmg":3,"dna":3,"warchest":1}' node tools/sim.ts 3`): a first run reaches Horde 7 at ~109 min and
8 hordes in 3 h; after 7 points, Horde 7 at ~68 min and 17 hordes in 3 h; after 30 points, 26 hordes in ~90 min.
"Erase progress" in Settings wipes prestige too, and returns you to the title screen (NEW GAME).
