// Player field guide: one printable page per part of the game, built from the game's own data (model.ts, tree.ts)
// and art (art.ts) so it stays accurate. Print with `node tools/make-guide.cjs` (see that file).
import '@fontsource/lilita-one/400.css';
import * as M from '../src/core/model.ts';
import { TREE, REGIONS, MASTERY } from '../src/core/tree.ts';
import { fmtLn, RARITY_COLOR } from '../src/core/format.ts';
import { buildArt, classIcon, gunIcon, vialIcon, modIcon, charmIcon, crateIcon, nodeIcon, zombieIcon, iconUrl } from '../src/game/art.ts';

const C = M.CONFIG;
const SHOT = (n: string) => `../docs/guide/${n}.jpg`;
const vial = (s: M.StrainId) => `<img class="vial px" src="${vialIcon(s)}" alt="">`;
const big = (n: number) => fmtLn(Math.log(n));
const colourName = (s: M.StrainId) => M.strainById(s).dna;

/** A full zombie sprite, optionally tinted like the battlefield does for Feral / Alpha / special zombies. */
function zombieSprite(id: M.ZombieId, tint?: number): string {
  const src = buildArt().canvases[`z-${id}-0`];
  if (tint === undefined) return trimmed(src);
  const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
  const g = c.getContext('2d')!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'multiply'; g.fillStyle = `#${tint.toString(16).padStart(6, '0')}`; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in'; g.drawImage(src, 0, 0);
  return trimmed(c);
}

/** Crop a canvas to its visible pixels. */
function trimmed(src: HTMLCanvasElement): string {
  const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
  let x0 = src.width, y0 = src.height, x1 = 0, y1 = 0;
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) if (d[(y * src.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const c = document.createElement('canvas'); c.width = x1 - x0 + 1; c.height = y1 - y0 + 1;
  c.getContext('2d')!.drawImage(src, -x0, -y0);
  return c.toDataURL();
}

let pageNo = 0;
function page(title: string, body: string, opts: { cls?: string; bare?: boolean } = {}): string {
  pageNo++;
  if (opts.bare) return `<section class="page ${opts.cls ?? ''}">${body}</section>`;
  return `<section class="page ${opts.cls ?? ''}">
    <div class="hazard top"></div>
    <div class="hdr"><span class="brand"><img src="../public/icons/icon-192.png" alt="">Zombie Idle · Field Guide</span><span>${title}</span></div>
    ${body}
    <div class="ftr"><span>Zombie Idle: hold the wall, farm the horde.</span><span>${pageNo}</span></div>
  </section>`;
}

// ---------- 1. cover ----------
function cover() {
  const sections: [string, string][] = [
    ['How to play', 'The loop in 60 seconds'], ['Zombies', '25 types, 5 DNA colours'], ['Units', '12 recruits & abilities'], ['Upgrades & gear', 'The squad card, items'],
    ['Hordes', 'Bosses & rewards'], ['Passive tree', 'Perks & masteries'], ['Late game', 'Ultimates, globals, auto-buy'], ['Prestige', 'Permanent perks'], ['Tips', 'Play smarter'],
  ];
  return page('', `
    <div class="art" style="background-image:url(${SHOT('cover')})"></div><div class="shade"></div>
    <div class="hazard top"></div>
    <div class="inner">
      <div class="logo"><img src="../public/icons/icon-512.png" alt=""><div class="tag" style="margin:0">Official field guide</div></div>
      <h1 style="margin-top:14px">ZOMBIE <span>IDLE</span></h1>
      <p>Zombies walk down the road. Your squad shoots them from the rooftop behind the wall. Every kill pays DNA, and DNA buys
      tougher, richer zombies (for more DNA) and a stronger squad (to kill them). Push too hard and they pile up at the shredder.
      This guide covers everything you need to stay ahead, from the first Pistoleer to ultimate forms and auto-buy.</p>
      <div class="toc">${sections.filter(([a]) => a).map(([a, b], i) => `<div><b><i>${i + 2}</i>${a}</b><span>${b}</span></div>`).join('')}</div>
    </div>
    <div class="hazard bot"></div>`, { cls: 'cover', bare: true });
}

// ---------- 2. how to play ----------
function basics() {
  return page('How to play', `
    <h1 class="title"><small>Chapter 1</small>How to play</h1>
    <p class="lede">Zombie Idle is an active idle game: the battle runs by itself, and every few seconds you spend DNA to make it
    bigger. There are no offline earnings, so only time spent playing counts.</p>
    <div class="shotcol">
      <div><img class="phone" src="${SHOT('battle')}" alt=""><p class="small sub" style="margin-top:6px">The battlefield: your squad behind the wall (left),
      the shredder in front of it, zombies walking in from the right.</p></div>
      <div>
        <h3>The core loop</h3>
        <div class="steps">
          <div class="step"><div><b>Kill zombies, earn DNA.</b> Each zombie drops DNA in its family's colour: ${vial('shambler')} Green,
            ${vial('runner')} Yellow, ${vial('brute')} Red, ${vial('spitter')} Teal and ${vial('bloater')} Purple. Your totals sit at the top of the screen.</div></div>
          <div class="step"><div><b>Feed the stream.</b> On the <b>Zombies</b> tab (or the quick rail on the right of the map), raise a type's <b>DNA</b> tier
            (each tier: ×${C.R} DNA and ×${C.hpR} HP per zombie) or its <b>Spawn</b> rate (+${C.spawnPerLevel * 100}% more of them). At tier ${M.TIER_CAP} a type
            <b>evolves</b> into its colour's next, richer form.</div></div>
          <div class="step"><div><b>Grow the squad.</b> On the <b>Squad</b> tab, hire soldiers and buy upgrades so they can keep up with the tougher stream.</div></div>
          <div class="step"><div><b>Beat hordes.</b> When the squad is strong, a horde and its boss unlock a new unit type, a new part of the passive tree and,
            for Hordes 1–4, a whole new zombie colour. A pop-up tells you when you should win.</div></div>
          <div class="step"><div><b>Spend tree points.</b> The <b>Tree</b> tab has squad-wide perks. Repeat, and watch the numbers climb.</div></div>
        </div>
        <div class="callouts">
          <div class="card hl"><h4>The shredder</h4><span class="small">Zombies that reach the spike barricade get shredded, so you can never get stuck,
            but they pay <b>no DNA</b> and halve your combo. When it glows red, upgrade your squad or lower a zombie tier.</span></div>
          <div class="card hl"><h4>Combo</h4><span class="small">Every kill adds 1 and multiplies <b>all</b> DNA, climbing slowly to <b>×${1 + C.combo.bonus} at ${C.combo.max.toLocaleString('en-US')} kills</b> in a row.
            It resets after ${C.combo.timeoutSec} s without a kill and halves when a zombie reaches the shredder.</span></div>
          <div class="card"><h4>Quick rail</h4><span class="small">The strip on the right of the map: tap a zombie or a recruit for one-tap upgrades (one level per tap)
            without leaving the battle. Switch between Zombies and Units at its top.</span></div>
          <div class="card"><h4>Saving</h4><span class="small">Automatic: right after every purchase and every 10 s. Settings → Save slots keeps copies or moves a save to another device.</span></div>
        </div>
      </div>
    </div>
    <h3 style="margin-top:14px">The menu</h3>
    <div class="tabsrow">
      <div><b>Zombies</b>Raise DNA tiers &amp; spawn, release new types.</div>
      <div><b>Squad</b>Hire, upgrade and gear your units.</div>
      <div><b>Tree</b>Passive perks for the whole squad.</div>
      <div><b>Hordes</b>Boss fights, prestige, kill counters.</div>
      <div><b>Settings</b>Sound, range lines, meters, saves.</div>
    </div>
    <p class="small sub" style="margin-top:8px">A <span style="color:var(--accent)">yellow dot</span> on a tab means something worth buying. Pop-ups tell you when a
    new recruit can be hired, a horde can be won or an ultimate form is ready.</p>`);
}

// ---------- 3. zombies ----------
function zombies() {
  const fam = (c: M.ColourId) => {
    const st = M.strainById(c);
    const members = M.familyMembers(c);
    return `<div class="fam" style="--c:${st.color}">
      <div class="lab"><b>${vial(c)} ${st.dna}</b><span>${members.length} types</span></div>
      ${members.map((z, i) => `<div class="zc ${i ? '' : 'leader'}" style="--c:${st.color}"><img class="px spr" src="${zombieSprite(z.id)}" alt=""><b>${z.name}</b>
        <div class="st"><i>${z.hp}×</i> HP · <i>${+M.dnaPerKillMult(z.id).toFixed(2)}×</i> DNA${z.speed > 1.2 ? ' · fast' : z.speed < 0.8 ? ' · slow' : ''}<br>${M.COLOUR_HORDE[z.id] ? `Horde ${M.COLOUR_HORDE[z.id]}` : z.unlock ? `Evolve · ${vial(M.familyOf(z.unlock.from))} ${fmtLn(M.lnReleaseCost(z.id))}` : 'Start'}</div></div>`).join('')}
    </div>`;
  };
  const varTint = [undefined, 0xffb4a4, 0xc8b8ff];
  return page('Zombies', `
    <h1 class="title"><small>Chapter 2</small>Zombies</h1>
    <p class="lede tight">Twenty-five zombie types in five DNA colours, five forms per colour. The first form of each colour arrives with a horde;
    the others <b>evolve</b> from the form before them once it reaches tier ${M.TIER_CAP} (price shown under each). Every type paces the same:
    rarer zombies pay more per kill (the DNA figure), so each earns the same DNA per second at the same tier.</p>
    ${M.COLOURS.map(fam).join('')}
    <div class="grid2" style="margin-top:8px">
      <div class="card"><h4>The two dials (Zombies tab)</h4>
        <ul class="tight small">
          <li><b>DNA +</b> raises the type's tier (up to ${M.TIER_CAP}): every zombie of that type pays <b>×${C.R}</b> DNA and has <b>×${C.hpR}</b> HP.</li>
          <li><b>Spawn +</b> brings <b>${C.spawnPerLevel * 100}%</b> more of them (+${C.spawnHpPerLevel * 100}% HP), up to level ${C.spawnMax}.</li>
          <li>Your best tier also grows the barracks: <b>+1 soldier per type every ${C.tiersPerUnit} tiers</b> (up to ${C.maxPerType}).</li>
        </ul></div>
      <div class="card"><h4>Varieties</h4>
        <div class="vars">${M.VARIETIES.map((v, i) => `<div style="display:flex;flex-direction:column;align-items:center;text-align:center"><img class="px" style="height:${36 + i * 4}px" src="${zombieSprite('shambler', varTint[i])}" alt="">
          <b style="font:400 9pt var(--display)">${v.name || 'Normal'}</b><span class="small sub">${i ? `×${v.hp} HP &amp; DNA` : 'standard'}</span></div>`).join('')}</div>
        <p class="small sub" style="margin:4px 0 0">Feral zombies appear from tier 20, Alphas from tier 60.</p></div>
    </div>
    <h3 style="margin-top:10px">Special zombies <span class="small sub" style="font-family:var(--body)">${M.SPECIAL_CHANCE * 100}% of the stream, marked by a glowing ring</span></h3>
    <div class="spec">${M.SPECIALS.map((s) => `<div class="card"><img class="px" src="${zombieSprite('shambler', s.tint)}" alt=""><b style="color:#${s.tint.toString(16).padStart(6, '0')}">${s.name}</b><span>${s.desc}</span></div>`).join('')}</div>`);
}

// ---------- 4. units ----------
function units() {
  const max = { range: 1, rate: 12, targets: 5 };
  const card = (c: M.ClassDef) => {
    const vs = Object.entries(M.MATCH[c.id] ?? {}) as [M.StrainId, number][];
    const good = vs.filter(([, m]) => m > 1).map(([s, m]) => `${colourName(s)} ×${m}`);
    const bad = vs.filter(([, m]) => m < 1).map(([s, m]) => `${colourName(s)} ×${m}`);
    return `<div class="uc">
      <div class="por"><div class="face"><img class="px" src="${classIcon(c.id)}" alt=""></div><img class="gun px" src="${gunIcon(c.id)}" alt=""></div>
      <div>
        <div class="top"><b>${c.plural}</b><span class="h">${c.horde ? `Horde ${c.horde}` : 'Start'}</span></div>
        <div class="meta">${c.gun} · paid in ${vial(c.primary)}</div>
        <div class="bars">
          <span>Range</span><div class="bar"><i style="width:${(c.range / max.range) * 100}%"></i></div>
          <span>Fire rate</span><div class="bar"><i style="width:${Math.min(100, (Math.log1p(c.rate) / Math.log1p(max.rate)) * 100)}%"></i></div>
          <span>Targets</span><div class="bar"><i style="width:${(c.targets / max.targets) * 100}%"></i></div>
        </div>
      </div>
      <div class="ab"><span class="tag">${c.ability.tags[0]} → ${c.ability.tags[2].replace(/^[A-Za-z]+ /, '')}</span>${c.ability.name}: ${c.ability.stages[0].replace(/:.*$/, '')}</div>
      <div class="vs" style="grid-column:2">${good.length ? `<span class="g">Strong vs ${good.join(', ')}</span>` : ''}${good.length && bad.length ? ' · ' : ''}${bad.length ? `<span class="r">weak vs ${bad.join(', ')}</span>` : ''}</div>
    </div>`;
  };
  return page('Units', `
    <h1 class="title"><small>Chapter 3</small>Units</h1>
    <p class="lede tight">Twelve recruit types. You start with Pistoleers; each horde you beat unlocks the next. Everything for a unit is paid in the one
    DNA colour shown, and every unit has a three-stage ability. Max everything but Damage to unlock its ultimate form (Chapter 7).</p>
    <div class="units">${[...M.CLASSES].sort((a, b) => a.horde - b.horde).map(card).join('')}</div>
    <p class="small sub" style="margin-top:8px">Range is how far down the road a unit can shoot (Snipers cover the whole road). "Strong vs" multiplies damage against that colour's zombies.</p>`);
}

// ---------- 5. upgrades & gear ----------
function upgrades() {
  const ic = (k: string) => nodeIcon(k);
  const btns: [string, string, string][] = [
    [classIcon('pistol'), 'Hire', `Add a soldier. Price rises ×${C.hireGrowth} each.`],
    [ic('dmg'), 'Damage', `×${C.dmgPerLevel} damage per level, no cap. Your main upgrade.`],
    [ic('crit'), 'Crit', '+2% crit chance per level (15 levels).'],
    [ic('critdmg'), 'Crit ×', '+10% crit damage per level (20 levels).'],
    [ic('spd'), 'Speed', '+4% attack speed per level (20 levels).'],
    [ic('range'), 'Range', '+2% range per level (10 levels, +30% max).'],
    [iconUrl('mod-dmg', 3), 'Gear', 'Opens the Attachment slot, then the Charm slot.'],
    [classIcon('rifle'), 'Ability', 'Three stages, labelled with what they give (e.g. Slow 15%).'],
  ];
  return page('Upgrades & gear', `
    <h1 class="title"><small>Chapter 4</small>Upgrades &amp; gear</h1>
    <div class="shotcol" style="grid-template-columns: 2.35in 1fr">
      <div><img class="phone" src="${SHOT('squad')}" alt=""></div>
      <div>
        <h3>The squad card</h3>
        <p class="small" style="margin:0 0 8px">Every hired unit type gets a card with eight buttons in stacked pairs. Everything is available as soon as you hire one;
        only the Ability stages and the Gear slots go in order. A bar under the buttons tracks progress toward the unit's <b>ultimate form</b>.</p>
        <div class="btns">${btns.map(([src, n, d]) => `<div class="btn"><img class="px" src="${src}" alt=""><b>${n}</b><span>${d}</span></div>`).join('')}</div>
        <div class="legend"><span><i class="sw" style="background:linear-gradient(180deg,#4fcf73,#2f9a4f)"></i>can buy now</span>
          <span><i class="sw" style="background:#20241f;opacity:.6"></i>not enough DNA, locked or maxed</span></div>
        <h3 style="margin-top:12px">Gear shelf</h3>
        <p class="small" style="margin:0">Under the buttons: the gun, attachment and charm the unit carries. Units <b>always carry their best items</b> and spares are sold for DNA
        automatically, so there is nothing to manage. Items drop from zombies (Golden zombies drop the most) and as horde rewards.</p>
      </div>
    </div>
    <div class="items" style="margin-top:12px">
      <div class="card"><img class="px" src="${gunIcon('pistol')}" alt=""><div><h4>Guns</h4><span class="small sub">One per unit type. Shown as a damage multiplier ("×26 dmg"): higher rarity and higher tier = more damage.</span></div></div>
      <div class="card"><img class="px" src="${modIcon('dmg')}" alt=""><div><h4>Attachments</h4><span class="small sub">+% damage, attack speed, crit chance or range. Needs the Gear slot.</span></div></div>
      <div class="card"><img class="px" src="${charmIcon('brute')}" alt=""><div><h4>Charms</h4><span class="small sub">+% damage against one DNA colour (or everything). Needs the second Gear stage.</span></div></div>
    </div>
    <h3 style="margin-top:12px">Rarity</h3>
    <div class="rar">${C.rarities.map((r) => `<div class="card" style="--rc:${RARITY_COLOR[r.id]}"><img class="px" src="${crateIcon(r.id)}" alt=""><b>${r.id[0].toUpperCase() + r.id.slice(1)}</b>
      <span>${r.weight}% of drops<br>gun ×${r.power} · attach +${Math.round(r.attach * 100)}%</span></div>`).join('')}</div>`);
}

// ---------- 6. hordes ----------
function hordes() {
  const ks = Array.from({ length: 13 }, (_, i) => i + 1);
  return page('Hordes', `
    <h1 class="title"><small>Chapter 5</small>Hordes</h1>
    <div class="shotcol narrow">
      <div><img class="phone" src="${SHOT('hordes')}" alt=""></div>
      <div>
        <p class="lede" style="margin-top:0">Hordes are optional boss fights and the way to unlock new units. The normal stream pauses and a horde
        charges in. Every horde has a <b>type</b> (Stampede, Swarm, Fog March…) and ends with a <b>boss</b> with its own trick. The map changes to match the next boss.</p>
        <div class="rules">
          <div class="card"><div class="big">Win</div><span class="small">Kill every horde zombie and the boss.</span></div>
          <div class="card"><div class="big" style="color:var(--bad)">Lose</div><span class="small">The boss reaches the shredder, or <b>${C.breachLimit}</b> horde zombies get to it.</span></div>
          <div class="card"><div class="big" style="color:var(--good)">Free</div><span class="small">Losing costs nothing. Upgrade and try again.</span></div>
        </div>
        <div class="card" style="margin-top:8px"><h4>War Drums</h4><span class="small sub">A passive near the start of the tree. Once you own it, the next horde starts by itself as soon
          as your squad should win. Toggle it on the Hordes tab.</span></div>
        <div class="card" style="margin-top:8px"><h4>Rewards</h4><span class="small sub">Each of the first seven hordes unlocks a unit type and its tree region, plus a rare-or-better gun for it.
          Elite hordes (8+) unlock the late recruits or an epic-or-better item.</span></div>
      </div>
    </div>
    <h3 style="margin-top:12px">The hordes</h3>
    <div class="hl-list">${ks.map((k) => { const h = M.hordeDef(k); const bd = M.BOSSES[h.boss];
      return `<div class="hz ${h.elite ? 'elite' : ''}"><div class="k">${k}</div><div><b>${h.name}</b><span>${M.HORDE_KINDS[h.kind].name} · boss: ${bd.name}</span><span>Tier ${h.tier} · unlocks ${h.unlocks.replace(/^An /, 'an ').replace(/^The /, 'the ')}</span></div><img class="boss px" src="${zombieIcon(bd.look)}" title="Boss: ${bd.name}" alt=""></div>`; }).join('')}</div>`);
}

// ---------- 7. tree ----------
function tree() {
  const region = (ri: number) => {
    const r = REGIONS[ri];
    const nodes = TREE.filter((n) => n.region === ri);
    const ks = nodes.find((n) => n.size === 'keystone');
    const notables = nodes.filter((n) => n.size === 'notable');
    return `<div class="rg" style="--rc:${r.color}"><div class="t"><b>${r.name}</b><span>${r.horde ? `after Horde ${r.horde}` : 'from the start'} · ${vial(r.dna)}</span></div>
      <div class="k">${notables.map((n) => `<span class="nm">${n.name}</span>: ${n.desc}`).join('<br>')}</div>
      ${ks ? `<div class="k"><i>Keystone · ${ks.name}</i>: ${ks.desc}</div>` : ''}
      <div class="k"><i style="color:#b8860b">Mastery · ${MASTERY[ri].name}</i>: ${MASTERY[ri].desc}</div></div>`;
  };
  return page('Passive tree', `
    <h1 class="title"><small>Chapter 6</small>Passive tree</h1>
    <div class="shotcol narrow">
      <div><img class="phone" src="${SHOT('tree')}" alt=""></div>
      <div>
        <p class="lede" style="margin-top:0">Squad-wide perks bought with DNA. Each region is a checklist paid in its own colour: three steps, two paths side by side,
        then the keystone goal. Every passive taken in a region makes its next one ×${C.treeCostGrowth}. Take all ten to <b>master</b> the region and earn its mastery perk.
        The top of the Tree tab holds the global upgrades (Chapter 7).</p>
        <div class="card"><h4>Node types</h4><ul class="tight small">
          <li><b>Small</b>: steady boosts (+% damage, speed, range...).</li>
          <li><b>Notable</b>: a stronger effect, often unique to a unit type.</li>
          <li><b>Keystone</b>: the big prize at the end of each region.</li></ul></div>
        <div class="card hl" style="margin-top:8px"><h4>Worth grabbing early</h4><span class="small sub"><b>War Drums</b> (hordes start themselves), <b>Quartermaster</b> (+15% item drops) and
          <b>Drill Sergeant</b> (+15% squad damage) are all in Basic Training.</span></div>
      </div>
    </div>
    <h3 style="margin-top:12px">Regions</h3>
    <div class="regions">${REGIONS.map((_, i) => region(i)).join('')}</div>`);
}

// ---------- 8. tips ----------
// ---------- 8. prestige ----------
function prestige() {
  const perks = M.PERKS.map((d) => `<div class="pk"><img class="px" src="${nodeIcon(d.icon)}" alt=""><div><div class="pk-t"><b>${d.name}</b><span class="pk-c">◆ ${d.cost}${d.cost > 1 ? ' per level' : ''}</span></div>
    <span class="pk-d">Level 1: ${d.desc(1)}</span><span class="pk-d">Max (${d.max}): ${d.desc(d.max)}</span></div></div>`).join('');
  return page('Prestige', `
    <h1 class="title"><small>Chapter 8</small>Prestige</h1>
    <div class="shotcol narrow" style="grid-template-columns: 1.7in 1fr">
      <div><img class="phone" src="${SHOT('prestige')}" alt=""></div>
      <div>
        <p class="lede tight" style="margin-top:0">When a run starts to slow down, start over stronger. Prestige trades your run for points, and points buy
        <b>permanent perks that stack every time</b>.</p>
        <div class="steps">
          <div class="step"><div><b>Earn points.</b> Every horde you clear in a run is worth <b>1 point</b> (Bounty Hunter adds more).</div></div>
          <div class="step"><div><b>Choose your perks.</b> Hordes tab → <b>Prestige now</b> opens the perk picker. You can spend your saved points
            <b>plus this run's points</b>. Tap a perk to add a level; <b>Undo picks</b> starts over and <b>Cancel</b> changes nothing.</div></div>
          <div class="step"><div><b>Reset.</b> <b>Reset &amp; start run N</b> applies your picks, then zombie tiers and types, units, gear, DNA, the passive tree
            and hordes reset. Perks, leftover points and play time are kept; your old run is copied to the <b>Backup</b> save slot first.</div></div>
          <div class="step"><div><b>Go again.</b> Spend leftover points any time from Hordes → <b>Perks</b>. Every run is faster, so you clear more hordes and earn more points.</div></div>
        </div>
        <div class="card hl" style="margin-top:10px"><h4>What a prestige keeps</h4><span class="small sub">Perks, leftover points, play time, your commander name and your
          lifetime kill counters. Everything else, including ultimate forms, masteries, global upgrades and auto-buy (re-earned at Horde ${10}), starts over.</span></div>
      </div>
    </div>
    <h3 style="margin-top:8px">The perks</h3>
    <div class="pk-grid">${perks}</div>
    <div class="card hl" style="margin-top:6px;padding:7px 12px"><h4>What to take first</h4><span class="small sub"><b>Firepower</b> and <b>DNA Surge</b> speed up everything, so they're the best first picks.
      <b>Head Start</b> makes the first minutes of each run fly by, and <b>Big Barracks</b> gives you more soldiers long before your tiers would.</span></div>`);
}

// ---------- 7. late game ----------
function lateGame() {
  const rows = [...M.CLASSES].sort((a, b) => a.horde - b.horde).map((c) => {
    const [a, b] = M.ULTS[c.id];
    const t = (d: M.UltDef) => `<b style="color:${d.color}">${d.name}</b> <span class="sub">${d.gun} · rate ×${d.fx.rate}</span>`;
    return `<tr><td><img class="px" src="${classIcon(c.id)}" alt=""> ${c.plural}</td><td>${t(a)}</td><td>${t(b)}</td><td>${vial(c.primary)} ${fmtLn(M.lnUltCost(c.id, { trainDiscount: 0 } as never))}</td></tr>`;
  }).join('');
  const glob = M.COLOURS.map((c) => `<div><b>${vial(c)} ${M.GLOBALS[c].name}</b><span>${M.GLOBALS[c].desc(1)} per level${M.GLOBALS[c].max ? ` (${M.GLOBALS[c].max} levels)` : ''}</span></div>`).join('');
  return page('Late game', `
    <h1 class="title"><small>Chapter 7</small>Late game</h1>
    <div class="shotcol narrow" style="grid-template-columns: 1.7in 1fr">
      <div><img class="phone" src="${SHOT('ultimate')}" alt=""></div>
      <div>
        <h3 style="margin-top:0">Unit ultimate forms</h3>
        <p class="small" style="margin:0 0 6px">Max every upgrade of a unit except Damage and it can evolve, for 2× everything those upgrades cost. Choose one of
          two tracks, for good: both give <b>×${C.ultDps} DPS</b> (fire rate × damage per shot = ${C.ultDps}) but play differently: pierce, blasts, fire,
          knockback, frost, or simply a lot more bullets. Damage upgrades keep scaling it. A gold ★ marks it on the rail.</p>
        <h3>Zombie ultimate forms</h3>
        <p class="small" style="margin:0">A zombie type at tier ${M.TIER_CAP} with Spawn ${C.spawnMax}/${C.spawnMax} can mutate for ${C.zUltCost}× its tier-${M.TIER_CAP} price:
          <b>×${C.zUltDna} DNA per kill and ×${C.zUltHp} HP</b> (horde zombies unchanged). Best on each colour's newest form.</p>
        <h3>Global upgrades (Tree tab)</h3>
        <div class="glob">${glob}<div><b>${vial('shambler')}${vial('runner')}${vial('brute')}${vial('spitter')}${vial('bloater')} ${M.SCAVENGER.name}</b><span>${M.SCAVENGER.desc(1)} per level, paid in all five colours</span></div></div>
        <p class="small sub" style="margin:4px 0 0">Endless and squad-wide. Each opens when its colour's first zombie type reaches tier ${M.TIER_CAP}, starts at that colour's
          tier-100 price and costs ×${C.globalCostGrowth} more per level, so they can't be farmed early.</p>
      </div>
    </div>
    <h3 style="margin-top:8px">The 24 ultimate forms</h3>
    <table class="ult-t"><thead><tr><th>Unit</th><th>Track 1</th><th>Track 2</th><th>Price</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="grid2" style="margin-top:8px">
      <div class="card hl"><h4>Auto-buy (free after Horde 10)</h4><span class="small sub">Three <b>AUTO</b> switches in the top-left of the map, each on its own:
        <b>Zombies</b> (tiers and spawn while your squad keeps up ×1.3, evolutions, zombie ultimates), <b>Troops</b> (hires and upgrades; unit ultimate forms
        stay your choice) and <b>Globals</b>. Once a second each buys the cheapest thing it can in every colour.</span></div>
      <div class="card"><h4>Commander &amp; leaderboard</h4><span class="small sub">After Horde 1, HQ radios in and names you leader: pick a commander name
        (you can change it once, in Settings). The Hordes tab ranks commanders by hordes beaten, then best tier, and counts zombies killed, bosses
        killed and your best combo. Masteries for fully taken tree regions are in Chapter 6.</span></div>
    </div>`);
}

function tips() {
  const t: [string, string][] = [
    ['Watch the shredder', 'A red, pulsing shredder means zombies are getting through. Stop raising tiers and put DNA into the squad until it calms down.'],
    ['Damage first, then the rest', 'Damage has no cap and scales best. Fill Speed, Crit and Range in between, when they are cheap.'],
    ['Balance your colours', 'Each unit is paid in one colour. If one is short, raise the newest zombie form in that colour: it earns most of that colour.'],
    ['Evolve at tier 50', 'A new form joins the stream and pays far more per kill. A colour\'s newest form is where its income comes from.'],
    ['Build a long combo', 'The combo only reaches ×2 after 1,500 kills in a row, so a squad that never lets zombies through earns up to twice as much.'],
    ['Plan ultimate forms', 'Max a unit\'s Speed, Range, Crits, Ability and Gear for ×2 DPS. For zombies, max tier 50 and spawn 30 on a colour\'s newest form first.'],
    ['Let auto-buy idle', 'After Horde 10, switch on AUTO Zombies, Troops or Globals on the map. Each buys the cheapest thing in every colour, and Zombies never overruns your squad.'],
    ['Match units to zombies', 'Snipers and Mortars shred Red and Purple zombies; Shotgunners and Machine Gunners love Yellow runners.'],
    ['Try hordes early', 'Losing is free. Each attempt shows how close you are, and a win unlocks a whole new unit type.'],
    ['Golden zombies', 'Fast and rare, worth ×15 DNA and a big item chance. Long range units catch them first.'],
  ];
  return page('Tips', `
    <h1 class="title"><small>Chapter 9</small>Tips &amp; tricks</h1>
    <p class="lede">A few habits that keep the squad ahead of the stream.</p>
    <div class="tips">${t.map(([h, d], i) => `<div class="tip"><div class="n">${i + 1}</div><div><h4>${h}</h4><span class="small sub">${d}</span></div></div>`).join('')}</div>
    <h3 style="margin-top:16px">Quick answers</h3>
    <div class="faq">
      <div class="card"><h4>Do I earn while the app is closed?</h4><span class="small sub">No. Only active play counts. The game saves right after every purchase.</span></div>
      <div class="card"><h4>Can I lose progress?</h4><span class="small sub">No. Hordes cost nothing to lose and the shredder always clears the road. Use Save slots to keep backups.</span></div>
      <div class="card"><h4>Why can't I buy an upgrade?</h4><span class="small sub">It is grey: you need more of the DNA colour on its price vial, or that colour isn't released yet (🔒).</span></div>
      <div class="card"><h4>How do I move my save?</h4><span class="small sub">Settings → Copy save code, then Paste save code on the other device.</span></div>
      <div class="card"><h4>Do Sniper headshots work on hordes?</h4><span class="small sub">Yes: every zombie but a boss can be headshot, and each kill pops a skull. Bosses take the full average damage instead.</span></div>
      <div class="card"><h4>How many soldiers can I have?</h4><span class="small sub">${C.unitsBase} per type at first, +1 every ${C.tiersPerUnit} tiers of your best zombie type, up to ${C.maxPerType}.</span></div>
    </div>`);
}

document.getElementById('guide')!.innerHTML = [cover(), basics(), zombies(), units(), upgrades(), hordes(), tree(), lateGame(), prestige(), tips()].join('');
await document.fonts.ready;
await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
(window as unknown as { guideReady: boolean }).guideReady = true;
