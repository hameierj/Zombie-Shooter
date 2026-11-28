# Zombie Idle: Game Spec (v0.8)

An idle zombie shooter with smooth HD cartoon art (drawn in code as vector shapes). Zombies walk at your shredder forever; your squad shoots them for DNA in five colours. You decide how hard the stream is, grow your squad and passive tree, and take on optional hordes to
unlock new recruit types and tree regions. Balance math: `scaling-model.md`.

## 1. The loop
1. Zombies stream in endlessly. Each **zombie type drops its own colour of DNA**, banked silently.
2. Spend each colour on the things priced in it: that zombie type's dials, the unit types whose trees use it, and
   the passive-tree regions paid in it.
3. Turn each zombie type's dials up while the squad keeps up (more of that colour, tougher zombies of that type).
4. New colours join as horde rewards (Hordes 1–4); each type caps at tier 50 and then **evolves** into its colour's next form.
5. Beat a **horde** when you're strong enough, to unlock the next unit type and tree region.
6. Rare **item drops** (guns, attachments, charms) give big jumps in power.

## 2. Zombie types and their dials (Zombies tab)
There are **25 zombie types in five DNA colour families**. Every type in a family drops that family's colour.
**New colours start strong**: a colour's dial starts at tier 1, but its tier 1 is as tough and as rich as the street
was when it arrived, just below the tier of the horde that brought it (`colourBase`: yellow ≈ 12, red ≈ 24, teal ≈ 46,
purple ≈ 66 effective tiers). Each horde's zombies are the colours whose start is below its tier, so every horde
previews the colour it unlocks (Horde 1 brings Runners, Horde 2 Brutes, …).

**Colours are horde rewards**, never bought: Green from the start, Yellow (Runner) after Horde 1, Red (Brute) after
Horde 2, Teal (Spitter) after Horde 3, Purple (Bloater) after Horde 4.

**Tier cap and evolutions.** A type's DNA Count stops at **tier 50** (`TIER_CAP`). At 50 its colour's next form can be
**evolved** (released) for a fixed price: 4 more tiers' worth of the parent at tier 50, about a minute of that colour's
income (`EVOLVE_TIERS`). Forms are added alongside the old ones, and each continues the curve: form *n*'s tier 1 is as
tough and as rich as tier 50·(n−1)+1 of the first form (its **effective tier**, used for HP, DNA, prices, guns and
barracks). Each form's tier and spawn prices are also ×2 per stage (`formCostMult`), so every form takes longer than the
last (balance sim: first evolution ~25 min, then ~60 and ~135 min). The fifth form of each colour has no cap. Older saves
are converted on load: a colour's best tier T becomes forms at 50, 50, … with the remainder on the next form.

| Colour | Family (release order) |
|---|---|
| Green | Shambler, Crawler, Office Zombie, Farmer, Prisoner |
| Yellow (fast) | Runner, Jogger, Courier, Skater, Athlete |
| Red (tanky) | Brute, Bouncer, Lumberjack, Butcher, Juggernaut |
| Teal | Spitter, Lab Tech, Sewer Worker, Hazmat Diver, Plague Doctor |
| Purple (very tanky) | Bloater, Chef, Sumo, Mutant, Abomination |

Later types in a family have more HP and drop proportionally more DNA. Hordes use the five family leaders.
**Hordes pay no lump of DNA.** Horde kills pay nothing; instead, from the horde's start until the restarted stream lands its first kill, you keep earning your normal stream income (with combo) every second (`earnSteady`). Income is a straight line through every horde: no burst to max out the squad or zombies with, and no gap while the stream walks back in. (Measured in the browser: ~140–280 green per 20 s before, during and after Horde 1, where it used to be 2–3× during it.)

**Varieties:** every zombie type also comes as **Feral** (×2.5 HP and DNA, reddish, a bit bigger) and **Alpha**
(×6 HP and DNA, bigger, dark aura). They join a type's stream as you raise its DNA Count: Ferals from tier 20
(up to 35% of that type), Alphas from tier 60 (up to 15%). The keep-up meter and DNA rates include them.

**Special zombies** (about 3% of the stream, no dials, glowing ring in their colour): Golden (fast, ×15 DNA, big
item chance), Armoured (×5 HP, ×5 DNA), Screamer (speeds up nearby zombies, ×4 DNA), Medic (heals nearby zombies,
×4 DNA), Exploder (blows up nearby zombies when killed, ×3 DNA).

Every released type has **its own two dials**, paid in its own colour:
| Dial | Range | Effect |
|---|---|---|
| **DNA Count** (tier) | 1 → 50 (last form: ∞) | Each tier: ×1.15 DNA and ×1.15 HP for that type. Tiers only go up |
| **Spawn Rate** | 30 levels | +12% of that type per level; each level also +3% HP for that type. Its own price ladder: the first level costs half the type's tier-1 price, then ×1.6 per spawn level; buying DNA tiers never changes it |

**Zombie ultimate form.** When a type is at tier 50 with Spawn 30/30, it can take its ultimate form for 20× its tier-50
price (in its colour): ×2 DNA per kill and ×2 HP for its stream zombies (horde zombies are unchanged). Ultimate zombies
are bigger with a glow in their colour at their feet; the type gets an ULTIMATE tag and a star on the rail. It shows as a
button on the Zombies tab and the rail pop-over, and a prompt appears when it's affordable.

**Every type paces like the Shambler.** A type's DNA per kill is ×1 ÷ its spawn rate (Runner 0.6 → ×1.67, Brute 0.4 → ×2.5,
Spitter 0.5 → ×2, Bloater 0.3 → ×3.33), so at the same tier and spawn level each type earns the same DNA per second, and
tier prices are the same for every type (80·1.15^(t−1) at its own tier; evolved forms ×2). Types differ only in toughness,
speed and looks.

The **keep-up meter** (Settings → Difficulty meters, which also shows horde odds) is **off by default**: players read the battlefield instead, and the
shredder glows and pulses red while zombies are reaching it. The **shredder** grinds every zombie that reaches it by
1% of its HP per second (no upgrades), so the road always clears and you can't get permanently stuck. There is no limit on how many can be at the shredder: a pile is drawn as a queue backing up the road (5 rows), and walkers stop behind it on screen. Horde zombies that break through are pulled into the blades; a lost horde fades away. Shredded
zombies pay **no DNA** and don't count for the combo: only the squad's kills pay. When the shredder stays swamped for
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
| Sniper | Sniper Rifle | Headshot: 10–30% chance per shot to kill outright; on bosses, ×10 damage instead | Red | Horde 4 |
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
  paid in one DNA colour** (its first).
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


### Ultimate forms

When every upgrade of a unit type except Damage is maxed (Speed, Range, Crit, Crit ×, all three Ability stages and both gear
slots), it can take an **ultimate form**: a choice of two tracks, permanent for the run. Both multiply its DPS by **×2**
(fire rate × damage per shot = 2) and Damage ranks keep scaling it; they differ in play style. The fee is 2× everything
those maxed upgrades cost together, in the unit's colour. An Evolve button appears on the unit card and its rail pop-over
(cards show progress toward it before that), a prompt pops up when it's affordable, and choosing opens a side-by-side pick,
then a reveal card; the soldiers flare up, carry the new gun art and glow in the track's colour.

| Unit | Track 1 | Track 2 |
|---|---|---|
| Pistoleers | **Hand Cannon** (.50 Magnum): fire rate ×0.45. Slow, thunderous shots that punch through a zombie and knock the next one back. | **Akimbo** (Twin Pistols): fire rate ×2.6. A pistol in each hand: a storm of lighter shots that never stops. |
| Hunters | **Blast Bolts** (Explosive Crossbow): fire rate ×0.55. Heavy bolts that explode on impact, catching the zombies around the target. | **Repeater** (Auto Crossbow): fire rate ×2.2. A magazine-fed crossbow that rattles off bolts, each piercing one more zombie. |
| Shotgunners | **Dragon's Breath** (Incendiary Shotgun): fire rate ×1. Every blast sets zombies on fire; burning zombies take +30% damage from every attack. | **Full Auto** (Auto Shotgun): fire rate ×3. A drum-fed shotgun that fires as fast as you can blink, with a lighter push. |
| Riflemen | **Battle Rifle** (Marksman Rifle): fire rate ×0.45. Big rounds that tear through two zombies in a line. | **Cryo Rounds** (Cryo Carbine): fire rate ×1.6. Faster freezing rounds: every hit slows zombies by half. |
| Snipers | **Anti-Materiel** (.50 Cal Rifle): fire rate ×0.4. Enormous single shots that pass through three zombies and hurl them back. | **Designated Marksman** (Semi-Auto Sniper): fire rate ×3. A semi-automatic sniper: three times the shots, each a little lighter. |
| Pyros | **Napalm Cannon** (Napalm Launcher): fire rate ×0.5. Lobs sticky napalm that bursts over a crowd; burning zombies take +25% damage. | **Plasma Torch** (Plasma Torch): fire rate ×1.4. A roaring blue jet that reaches two more zombies at once. |
| Grenadiers | **Thumper** (Heavy Launcher): fire rate ×0.5. Huge shells with a bigger blast that throws zombies back. | **Auto Launcher** (Drum Launcher): fire rate ×2.5. A revolving drum that empties grenade after grenade. |
| Machine Gunners | **Minigun** (Rotary Cannon): fire rate ×2.5. Six spinning barrels: a solid wall of lead. | **Heavy MG** (.50 Heavy MG): fire rate ×0.6. Slower, bigger rounds that pierce a zombie and shove the line back. |
| Drone Operators | **Kamikaze Swarm** (Bomb Drones): fire rate ×0.6. Drones dive in and explode, hurting the zombies around the target. | **Laser Drones** (Laser Drones): fire rate ×2.5. Drones that hover and fire rapid laser bolts. |
| Railgunners | **Gauss Cannon** (Gauss Cannon): fire rate ×0.45. A slow, colossal slug that pierces three more zombies. | **Pulse Rail** (Pulse Rail): fire rate ×2.5. Rapid pulses of charged rail fire. |
| Mortar Team | **Heavy Artillery** (Howitzer): fire rate ×0.5. Massive shells: a wider blast that knocks zombies back. | **Rocket Barrage** (Rocket Pods): fire rate ×3. Volleys of small rockets that never stop falling. |
| Tesla Troopers | **Storm Caller** (Storm Coil): fire rate ×0.6. Huge bolts that arc to three more zombies. | **Arc Lancer** (Arc Lance): fire rate ×2.2. Rapid zaps that leave zombies stunned and crawling (60% slow). |

## 4. Passive tree (Tree tab)
One **checklist per region**, one region open at a time. Each region shows a progress ring (n/10), how many passives
are ready, the DNA colour it's paid in, and its keystone up front as the **goal**. Inside: steps 1–3, then **Path A and
Path B** side by side (3 steps each), then the keystone, which opens once either path is done. Each passive raises the
price of that region's next one (×3.5). Locked regions say which horde opens them. Unit upgrades live on the Squad page.

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

Allocate a node next to one you own. Each region is paid in its own DNA colour (Basic Training Green, Marksman and Suppression Yellow, Breacher and Deadeye Red, Inferno Teal, Demolition and Command Purple); **each region has its own price ladder**: its first passive costs 15 of its colour, scaled up by the tiers that colour has gained between the horde that brought it and the horde that opens the region (so a late region isn't an instant buy), and each passive taken in that region makes its next one ×3.5. Sim: Basic Training lasts ~48 min, Marksman starts at ~7 min (when yellow arrives) and runs to ~70 min. Tap a node to see what it does.

### Region mastery and global upgrades

**Mastery.** Taking all 10 passives in a region grants that region's mastery perk (a card announces it; the region shows
a gold star): Basic Training *Veteran Squad* ×1.3 damage · Marksman *Eagle Eye* +8% crit chance · Breacher *Brutal Force*
+60% crit damage · Suppression *Rapid Fire* +15% attack speed · Deadeye *Killshot* +5% crit chance and +50% crit damage ·
Inferno *Scorched Earth* +25% DNA · Demolition *Shockwave* ×1.3 damage · Command *Supreme Command* ×1.5 damage and +10%
attack speed.

**Global upgrades** (top of the Tree tab): one endless squad-wide upgrade per DNA colour, opened once that colour's
first zombie type reaches tier 50. Green *Firepower* ×1.04 damage per level · Yellow *Rate of Fire* +2% attack speed ·
Red *Lethality* +5% crit damage · Teal *Precision* +0.5% crit chance (100 levels) · Purple *Harvest* ×1.03 DNA from
kills. The first level costs the colour's tier-100 price (so it can't be farmed early), and each level ×1.25 more.
**Scavenger** (the sixth global) is paid in all five colours at once (each at half that colour's global price, ×1.3 per
level) and adds +15% item drop chance per level; it opens once all five colours have reached tier 50.
All of these reset with a prestige, like the rest of the run.

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
Hordes 1–7 are at effective tiers 15, 30, 58, 84, 106, 122 and 136, and unlock the unit types and regions above
(Hordes 1–4 also bring the yellow, red, teal and purple colours). Elite hordes follow at 148, 160, 172, 183, 194, 204,
then +10 each (some unlock the newer recruits, the rest give an epic+ item). Horde zombies are always each colour's first
form. These are set from the balance sim (`node tools/sim.ts`, which prints the minute of each horde): hordes at about 6,
15, 25, 44, 60, 67 and 78 min, then one about every 10–20 min (tier price 80·1.15^(t−1); the sim counts
combo and specials as ×1.4 income). If the next horde is far
above your toughest zombies, its card says so and points you at raising zombie tiers.

## 5b. Combo
**One combo for the whole squad.** Every kill adds 1 and the combo multiplies **all** DNA, climbing slowly to **×2 at
1,500 kills in a row** (Combo Master prestige perk: up to +0.5 more). It drops to 0 after 3 s without any kill, and halves
whenever a zombie reaches the shredder. The badge over the battlefield shows the count, the multiplier and a bar to ×2.
The Hordes tab shows lifetime counters: zombies killed, bosses killed, hordes beaten and best combo (kills and bosses are
kept through prestige).

### Auto-buy
Beating **Horde 10** unlocks auto-buy for free (an unlock card explains it). Three **AUTO** switches sit in the top-left of
the map (also in Settings → Auto-buy), each on or off on its own: **Zombies** (tiers, spawn, evolutions, zombie ultimates), **Troops** (hires and every upgrade; unit ultimate forms stay the player's choice)
and **Global upgrades** (the five colour upgrades and Scavenger). Once a second it buys the cheapest allowed thing in each
colour it can afford, repeatedly, holding the squad's keep-up in a band of ×1.05–×1.3: while keep-up is above
×1.3 (too easy), zombie purchases come first in each colour (saving up for one if needed) as long as they leave keep-up
at ×1.05 or more; at ×1.3 or below no zombie purchase is made, and troops and globals build the margin back up. Its evolutions and ultimates show a small notice instead of a pausing card.

### Commander name and leaderboard
After **60 seconds of play** (once nothing else is on screen) HQ radios in: a short typewriter cutscene ("Guess that makes
you the leader. What do they call you?") asks for a **commander name** (2-16 letters, digits, spaces, _ or -). Players who
already played see it on their next visit. The name and a random id are kept on the device and in the save (and
through prestige); the ✎ button on the leaderboard changes it. The **Leaderboard** card on the Hordes tab ranks commanders
by hordes beaten (lifetime), then best tier, then kills, and shows bosses killed and prestige runs. The name can be changed **once per lifetime** from Settings → Commander (the leaderboard only shows it). After the
first naming the player closes HQ's sign-off themselves, then a faint line drifts over the map: "You feel an eerie,
unknown presence watching you… watching… always watching…". The board is online (Supabase: `docs/leaderboard.sql`, then `docs/leaderboard-v2.sql` for the stats). It has its own
**Ranks** tab (Leaderboard page): chips rank the top 50 by best horde (the highest horde beaten in any single run; the default), total hordes (lifetime), kills, headshots, highest tier (the highest zombie tier reached in any single run), troop level
(highest Damage level), play time, best combo, ultimate forms, masteries, soldiers, prestiges, or lifetime DNA earned in
each colour. Your row is highlighted, with your rank (or "outside the top 50"). Stats are sent at most once a minute
through `submit_stats` (own row only, via a per-device secret; sanity-checked; 20 s rate limit). The Hordes tab keeps
the lifetime counters: zombies killed, headshots, hordes beaten, best combo.

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

**Quick rail.** Down the right edge of the map. Its header has a collapse button and a **Zombies / Units** switch (a green
dot on the other side means something there is affordable); both choices are remembered. **Zombies**: every released
type (grouped by colour, with its tier); tap one for **DNA +** and **Spawn +**. **Units**: every unlocked unit type with
how many you have (dashed "New" if none); tap one for its Squad-card grid (Hire, Damage, Crit, Crit ×, Speed, Range,
Gear, Ability), or just Hire for a type you haven't hired. Rail buttons always buy a single level (the ×1/×10/Max setting applies only in the Zombies and Squad tabs); a green dot on an
icon means one of its upgrades is affordable. The list scrolls, and the rail hides while a menu is open.

## 11. Settings and saves
Settings is one screen in three sections. **Sound & display**: on/off switches for sound effects, music, range lines and
difficulty meters. **Saves**: the current game (with when it was last saved), three slots and an automatic **Backup**,
shown inline. Each slot holds its own game and the current game lives in one of them (marked **▶ Playing**). **＋ Start a
new game** starts a fresh game straight away in the first empty slot; the game you leave stays in its slot. *New* on a
slot does the same there; if that slot already has a game, it first shows that game (tier, hordes, soldiers, kills, when
saved) and asks twice before replacing it (the replaced game becomes the Backup). With every slot full, the button asks
which one to replace. *Play* switches to a slot's game (the one you leave is kept in its slot); ✕ deletes a slot that
isn't being played (asks first). Devices that already had copies in every slot when slots got this behaviour start
"unslotted": their current game goes to Backup when they switch. The leaderboard shows the best of each stat across all
games on the device, so a new game never lowers your row. *Copy save
code* / *Paste save code* move a game between devices; a pasted code is checked as you paste it, then loaded or put into
a slot. **Danger zone**: *Erase progress* (asks first) also keeps the current game in Backup, so it can be restored.
A session timer at the top right of the screen shows how long you've been playing since opening the app (it pauses
while the app is in the background).
`docs/saves/maxed-20h.txt` is a ready-made "20 hours in" save (made by `node tools/make-save.ts`).

## 12. Title screen, music and look
- **Tutorial** (`src/ui/tutorial.ts`): ten coach steps that appear when they become useful: the battle and DNA, the
  shredder (spotlighting the barricade), range (range lines shown for 9 s), raising a tier (the rail's Shambler),
  the squad (the rail's Units switch), combos, the first horde (Hordes tab), the new yellow colour (its DNA chip),
  the tree, and evolution (once a type nears tier 50). Each dims the screen around a pulsing spotlight with an animated
  tapping finger and a speech bubble ("Tip n of 10"), pauses the game and the clock until "Got it", and is saved
  (`tut` in the save; "Skip tutorial" marks all). At most one step every 7 s, never over a menu, card or dialog. Saves
  from before the tutorial that are well into a run skip the basics.
- **Evolving from the rail**: a type at tier 50 gets a spinning biohazard badge on its rail icon; its pop-over adds an
  **Evolve → next form** button (hazard stripes, a scanning shine, toxic glow when affordable). The Zombies tab's Evolve
  button has the biohazard too, and the evolution card spins a big biohazard behind the zombie.
- **Battleground transition**: after a horde win (once the unlock cards are closed) the camera pushes in and fades to
  black, the new battleground is swapped in, then it fades back in as the camera settles, with the place's banner.
- **Unlock cards**: after a horde is won (once the VICTORY banner has shown) the battle and the play-time clock pause
  and each unlock gets its own card: the horde and its reward item, a new recruit (gun, range, targets, ability, where to
  hire), a new zombie colour (its DNA), and a new passive-tree region (its colour and goal). Evolving a zombie type gets a
  card too. Each card pops in with spinning light rays, a sparkle burst and a rising fanfare (each card a step higher);
  Next (or a tap anywhere once it has landed, or Enter) moves on, and the last says "Back to the fight". (`src/ui/unlocks.ts`)
- **Battle look ("rooftop siege")**: the squad stands on a rooftop on the left, its wall facing the street; a sidewalk of
  spike barricades in front of it is the shredder; the horde comes down a city street at dusk with buildings, wrecks,
  lamps and props (`src/game/city.ts`). Each boss's battleground gives the street its own mood (toxic puddles, mud,
  sand, purple goo, neon, rust) and its own dusk grade. A multiply grade darkens the scene; muzzle flashes, fire and
  explosions add light on top. Effects (`src/game/fxtex.ts` textures, pooled particles in BattleScene): tracers for
  guns, a real flame stream for Pyros (zombies it touches burn), fireballs with smoke, sparks, debris, a shockwave
  ring, a scorch mark and screen shake for grenades, mortars, exploders and every boss; blood sprays; kills leave
  blood and a darkened body on the street (a decal layer, drawn in one batch per frame, faded and wiped after ~2,600
  marks or when the battleground changes). Damage numbers are condensed white digits with a dark outline that pop in
  and rise; crits are bigger and red with "!". Every zombie and soldier has a soft contact shadow. The 25 zombie
  designs and 13 unit looks are unchanged.
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

## 12a. Prompts
Two small cards slide up above the tabs (left of the quick rail) so nobody has to dig through menus: **{Unit} · Ready to hire**
when a newly unlocked unit type's first soldier is affordable (Hire button, hires one), and **Horde N ready** when the
squad should win the next horde and War Drums isn't on (Fight! starts it). Each has a ✕ (a horde prompt comes back after
2 min). They never show over a menu, card, tip, dialog or during a horde.

## 12b. Squad vs zombies balance
Zombie HP grows ×1.2 per tier while their DNA grows ×1.15 (`hpR` vs `R`): higher tiers get relatively tougher, so the
squad's one-off boosts get used up over time. Units are cheap to start (prices ×2, `unitCostMult`) but every level
costs more than the last: Damage ×1.165 per level (faster than a tier's ×1.15), capped upgrades ×1.5, each extra hire
×2.1. So the opening is easy to get going and the squad can't run away later. Balance sim (greedy player): keep-up
×3.8 at 3 min, ×5.7 at 6 min, ×3 at 15 min, ×1.6 at 30 min, ×1.2 at 1 h.

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
