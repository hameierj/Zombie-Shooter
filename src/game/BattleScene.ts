// The battlefield, drawn with generated 16-bit pixel art (see art.ts). Everything is laid out on an "art pixel"
// grid: 1 art pixel = `px` device pixels, chosen from the field size, so sprites stay crisp on a laptop, an iPhone,
// or an iPhone Duo folded or unfolded. Resizing (rotate/fold) re-maps every unit mid-fight.
//
// Zombies walk in endlessly at the current DNA Count tier and Spawn Rate. A horde is an optional challenge: the
// stream pauses, 60 zombies of the horde's tier rush in and a boss follows. Kill them all before the timer runs out;
// if the boss reaches the shredder, or 10 horde zombies break through, the horde is lost.
import Phaser from 'phaser';
import * as M from '../core/model.ts';
import type { ClassId, Gun, StrainId } from '../core/model.ts';
import { game } from '../core/state.ts';
import { fmtLn } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';
import { buildArt, drawGround, GUN_H, GUN_W, HERO_GRIP, HERO_H, HERO_W, RARITY_TRIM, ZOMBIE_FRAMES } from './art.ts';

const C = M.CONFIG;
const FONT = 'Silkscreen, monospace';
const ART_SHORT_SIDE = 360;  // art pixels across the field's short side (bigger = more zoomed out)
const MAX_AMBIENT = 70;      // cap on stream zombies alive at once
const MAX_TEXTS = 24;
const INTRO_SEC = 1.4;

type Phase = 'stream' | 'intro' | 'horde' | 'end';
interface Zombie {
  strain: StrainId; tier: number; lnHp: number; hp: number; p: number; l: number; speed: number; horde: boolean; boss: boolean; atWall: boolean; slow: number; burn: number;
  flash: number; phase: number; alive: boolean; sprite?: Phaser.GameObjects.Sprite;
}
interface Shooter { body: Phaser.GameObjects.Sprite; gun: Phaser.GameObjects.Image; flash: Phaser.GameObjects.Image; cls: ClassId; cd: number; recoil: number; flashT: number; aim: number }
interface FloatText { obj: Phaser.GameObjects.Text; t: number; vy: number }
interface Crate { img: Phaser.GameObjects.Image; t: number; color: number }

const hex = (css: string) => Number.parseInt(css.slice(1), 16);

export class BattleScene extends Phaser.Scene {
  private W = 100; private H = 100; private px = 3;
  private AW = 40; private AH = 30;
  private lay = { bunkerRight: 10, shredX: 11, stopX: 30, spawnX: 60, laneTop: 10, laneBot: 25, roadTop: 5, roadBot: 28 };
  private ground?: Phaser.GameObjects.Image;
  private groundKey = '';
  private housing!: Phaser.GameObjects.TileSprite;
  private teeth!: Phaser.GameObjects.TileSprite;
  private capTop!: Phaser.GameObjects.Image;
  private capBot!: Phaser.GameObjects.Image;
  private fx!: Phaser.GameObjects.Graphics;
  private gibs!: Phaser.GameObjects.Particles.ParticleEmitter;
  private banner!: Phaser.GameObjects.Text;
  private sub!: Phaser.GameObjects.Text;
  private shooters = new Map<string, Shooter>();
  private texts: FloatText[] = [];
  private crates: Crate[] = [];
  private pools = new Map<string, Phaser.GameObjects.Image[]>();
  private textCd = 0;
  private autoT = 0;

  private phase: Phase = 'stream';
  private phaseT = 0;
  private zombies: Zombie[] = [];
  private spawnTimers = new Map<StrainId, number>();
  private horde = { k: 0, queue: [] as Zombie[], t: 0, spawnT: 0, breaches: 0, bossThrough: false };
  private hordeText!: Phaser.GameObjects.Text;
  private ready = false;

  constructor() { super('battle'); }

  create() {
    for (const [key, canvas] of Object.entries(buildArt().canvases)) if (!this.textures.exists(key)) this.textures.addCanvas(key, canvas);
    this.housing = this.add.tileSprite(0, 0, 16, 16, 'shred-housing').setOrigin(0, 0).setDepth(2);
    this.teeth = this.add.tileSprite(0, 0, 10, 16, 'shred-teeth').setOrigin(0, 0).setDepth(2);
    this.capTop = this.add.image(0, 0, 'shred-cap').setOrigin(0, 0).setDepth(3);
    this.capBot = this.add.image(0, 0, 'shred-cap').setOrigin(0, 1).setDepth(3);
    this.fx = this.add.graphics().setDepth(9000);
    this.gibs = this.add.particles(0, 0, 'pix', {
      emitting: false, lifespan: { min: 300, max: 700 }, speed: { min: 50, max: 220 }, angle: { min: 200, max: 340 },
      gravityY: 800, alpha: { start: 1, end: 0.6 },
    }).setDepth(8000);
    const tx = { fontFamily: FONT, color: '#ffffff', stroke: '#140c1c' };
    this.banner = this.add.text(0, 0, '', tx).setOrigin(0.5).setDepth(9500).setAlpha(0);
    this.sub = this.add.text(0, 0, '', tx).setOrigin(0.5).setDepth(9500).setAlpha(0);
    this.hordeText = this.add.text(0, 0, '', { fontFamily: FONT, color: '#ffd34d', stroke: '#140c1c' }).setOrigin(0, 0).setDepth(9500).setVisible(false);
    game.on((evt) => {
      if (evt === 'horde-start' && this.phase === 'stream') this.startHorde();
      if (evt === 'reset') { this.clearZombies(); this.setPhase('stream'); }
    });
    this.ready = true;
    this.relayout();
  }

  resizeField(cssW: number, cssH: number, dpr: number) {
    this.W = Math.max(1, Math.round(cssW * dpr));
    this.H = Math.max(1, Math.round(cssH * dpr));
    this.scale.resize(this.W, this.H);
    if (this.ready) this.relayout();
  }

  // ---------- layout ----------
  private relayout() {
    this.px = Math.max(1, Math.min(8, Math.round(Math.min(this.W, Math.max(this.H, this.W * 0.55)) / ART_SHORT_SIDE)));
    const px = this.px;
    this.AW = Math.ceil(this.W / px);
    this.AH = Math.ceil(this.H / px);
    const bunkerRight = Math.max(44, Math.round(this.AW * 0.16));
    const roadTop = Math.round(this.AH * 0.1), roadBot = Math.round(this.AH * 0.96);
    this.lay = { bunkerRight, shredX: bunkerRight + 1, stopX: bunkerRight + 36, spawnX: this.AW + 16, laneTop: roadTop + 26, laneBot: roadBot - 2, roadTop, roadBot };
    const key = `ground-${this.AW}x${this.AH}`;
    if (key !== this.groundKey) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawGround({ w: this.AW, h: this.AH, roadTop, roadBot, bunkerRight: bunkerRight - 1 }));
      const old = this.groundKey;
      if (this.ground) this.ground.setTexture(key); else this.ground = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
      this.groundKey = key;
      if (old && old !== key && this.textures.exists(old)) this.textures.remove(old);
    }
    this.ground!.setScale(px);
    const sx = this.lay.shredX * px;
    this.housing.setPosition(sx, 0).setSize(16, this.AH).setScale(px);
    this.teeth.setPosition(sx + 16 * px, 0).setSize(10, this.AH).setScale(px);
    this.capTop.setPosition(sx - 2 * px, 0).setScale(px, px * 2);
    this.capBot.setPosition(sx - 2 * px, this.H).setScale(px, px * 2);
    for (const s of this.shooters.values()) { s.body.setScale(px); s.gun.setScale(px); s.flash.setScale(px); }
    this.gibs.setParticleScale(px);
    this.banner.setFontSize(px * 12).setStroke('#140c1c', px * 2);
    this.sub.setFontSize(px * 7).setStroke('#140c1c', px * 1.5);
  }

  private toScreen(p: number, l: number): [number, number] {
    const { spawnX, stopX, laneTop, laneBot } = this.lay;
    return [Math.round(spawnX + (stopX - spawnX) * p) * this.px, Math.round(laneTop + (laneBot - laneTop) * ((l + 1) / 2)) * this.px];
  }
  // ---------- flow ----------
  private setPhase(p: Phase) { this.phase = p; this.phaseT = 0; game.emit('phase', p); }
  private clearZombies(onlyHorde = false) {
    for (const z of this.zombies) if (!onlyHorde || z.horde) z.sprite?.destroy();
    this.zombies = onlyHorde ? this.zombies.filter((z) => !z.horde) : [];
  }
  private makeZombie(strain: StrainId, tier: number, spawnLv: number, horde: boolean, boss = false): Zombie {
    return {
      strain, tier, horde, boss, atWall: false, lnHp: M.lnZombieHp(strain, tier, spawnLv) + (boss ? Math.log(C.bossHpMult) : 0), hp: 1, slow: 0, burn: 0,
      p: -0.02 - Math.random() * 0.05, l: boss ? 0 : Math.random() * 2 - 1,
      speed: (M.strainById(strain).speed * (boss ? C.bossSpeed : (0.85 + Math.random() * 0.3) * (horde ? 1.3 : 1))) / C.walkSec,
      flash: -1, phase: Math.random() * 4, alive: true,
    };
  }

  private startHorde() {
    const k = game.nextHorde;
    const h = M.hordeDef(k);
    const mix = M.hordeMix(k);
    const queue = Array.from({ length: C.hordeZombies }, () => this.makeZombie(mix[Math.floor(Math.random() * mix.length)], h.tier, 0, true));
    // the boss joins two-thirds of the way in, so its slow walk doesn't decide the fight on its own
    queue.splice(Math.round(queue.length * 2 / 3), 0, this.makeZombie(M.hordeBoss(k), h.tier, 0, true, true));
    this.horde = { k, t: 0, spawnT: 0, queue, breaches: 0, bossThrough: false };
    this.showBanner(h.name.toUpperCase(), `HORDE ${k} · TIER ${h.tier}`);
    sfx.hordeStart();
    this.setPhase('intro');
  }

  private showBanner(text: string, sub = '') {
    const y = Math.round(this.lay.roadTop * this.px + 26 * this.px);
    this.banner.setText(text).setPosition(Math.round(this.W * 0.6), y).setAlpha(1);
    this.sub.setText(sub).setPosition(Math.round(this.W * 0.6), y + 13 * this.px).setAlpha(sub ? 1 : 0);
    this.tweens.killTweensOf([this.banner, this.sub]);
    this.tweens.add({ targets: [this.banner, this.sub], alpha: 0, delay: 1300, duration: 400 });
  }

  update(_t: number, deltaMs: number) {
    const dt = Math.min(0.1, deltaMs / 1000);
    this.phaseT += dt;
    this.teeth.tilePositionY -= dt * 30;
    this.autoT += dt;
    // War Drums: start the next horde automatically when the squad should win (never spends DNA)
    if (this.autoT >= 3) { this.autoT = 0; if (this.phase === 'stream' && game.autoHorde && game.hordeOdds() >= 1.15) game.startHorde(); }

    if (this.phase === 'stream' || this.phase === 'end') {
      // the endless stream: every released zombie type spawns at its own rate, tier and spawn level
      const ambient = this.zombies.filter((z) => z.alive && !z.horde).length;
      for (const sid of game.colours) {
        const x = game.s.strains[sid];
        let t = (this.spawnTimers.get(sid) ?? Math.random()) - dt;
        while (t <= 0) {
          t += 1 / M.spawnRate(sid, x.spawn);
          if (ambient < MAX_AMBIENT) this.zombies.push(this.makeZombie(sid, x.tier, x.spawn, false));
        }
        this.spawnTimers.set(sid, t);
      }
      if (this.phase === 'end' && this.phaseT > 1.5) this.setPhase('stream');
    } else if (this.phase === 'intro') {
      if (this.phaseT >= INTRO_SEC) this.setPhase('horde');
    } else if (this.phase === 'horde') {
      const h = this.horde;
      h.t += dt;
      h.spawnT -= dt;
      while (h.queue.length && h.spawnT <= 0) {
        h.spawnT += 1 / C.hordeSpawnPerSec;
        const z = h.queue.shift()!;
        if (z.boss) { this.showBanner('BOSS INCOMING', M.strainById(z.strain).name.toUpperCase()); sfx.hordeStart(); }
        this.zombies.push(z);
      }
      const lost = h.t >= C.hordeTimerSec ? 'TIME RAN OUT' : h.bossThrough ? 'THE BOSS BROKE THROUGH' : h.breaches >= C.breachLimit ? 'THE WALL WAS OVERRUN' : '';
      if (!lost && !h.queue.length && !this.zombies.some((z) => z.alive && z.horde)) {
        this.showBanner('HORDE BEATEN!', M.hordeDef(h.k).unlocks.toUpperCase());
        sfx.hordeWon();
        game.hordeWon(h.k);
        this.setPhase('end');
      } else if (lost) {
        this.showBanner('HORDE LOST', lost);
        sfx.hordeLost();
        this.clearZombies(true);
        h.queue = [];
        game.hordeLost(h.k);
        this.setPhase('end');
      }
    }
    game.comboTick(dt);
    this.tickZombies(dt);
    this.tickShooters(dt);
    this.tickEffects(dt);
    this.drawZombies();
    this.drawFx();
  }

  private tickZombies(dt: number) {
    for (const z of this.zombies) {
      if (!z.alive) continue;
      z.flash -= dt;
      if (z.p < 1) {
        z.slow = Math.max(0, z.slow - dt * 0.5);
        const sp = z.speed * (1 - z.slow);
        z.p = Math.min(1, z.p + sp * dt); z.phase += dt * 6 * sp * C.walkSec;
        if (z.burn > 0) { z.burn -= dt; if (Math.random() < dt * 8) { const [bx, by] = this.zombieCenter(z); this.burst(bx, by + 8 * this.px, 0xff7a2a, 1); } }
        if (z.p > 0.6 && Math.random() < dt * 0.15) sfx.groan();
      }
      else if (z.horde) {
        // a horde zombie broke through: the wall takes a breach (the boss breaking through loses the horde)
        if (z.boss) this.horde.bossThrough = true;
        else this.horde.breaches++;
        z.alive = false;
        const [x, y] = this.toScreen(1, z.l);
        this.burst(x - 6 * this.px, y - 10 * this.px, 0xff4a4a, 10);
        z.sprite?.destroy(); z.sprite = undefined;
        game.comboBreak();
        sfx.grind();
      }
      else {
        if (!z.atWall) { z.atWall = true; game.comboBreak(); }
        // in the blades: the shredder grinds it slowly while it claws at the machine
        z.phase += dt * 3;
        z.hp -= 0.08 * dt;
        sfx.grind();
        if (Math.random() < dt * 6) { const [x, y] = this.toScreen(1, z.l); this.burst(x - 6 * this.px, y - 10 * this.px, 0x8a1c1c, 2); }
        if (z.hp <= 0) this.kill(z);
      }
    }
  }

  // ---------- squad: soldiers stand at random spots along the wall, each firing for a share of its unit type ----------
  private static readonly VISIBLE_PER_TYPE = 6;
  private spots = new Map<string, number>();   // soldier key → random sort key (where along the wall it stands)

  private syncShooters() {
    const want = new Set<string>();
    for (const u of game.owned) for (let k = 0; k < Math.min(u.count, BattleScene.VISIBLE_PER_TYPE); k++) want.add(`${u.cls}-${k}`);
    for (const [key, s] of this.shooters) if (!want.has(key)) { s.body.destroy(); s.gun.destroy(); s.flash.destroy(); this.shooters.delete(key); this.spots.delete(key); }
    for (const key of want) {
      if (this.shooters.has(key)) continue;
      const cls = key.split('-')[0] as ClassId;
      this.spots.set(key, Math.random());
      this.shooters.set(key, {
        body: this.add.sprite(0, 0, `hero-${cls}-0`).setOrigin(0.5, 1).setScale(this.px),
        gun: this.add.image(0, 0, `gun-${cls}`).setOrigin(3 / GUN_W, 6 / GUN_H).setScale(this.px),
        flash: this.add.image(0, 0, 'muzzle').setVisible(false).setScale(this.px),
        cls, cd: Math.random() * 0.5, recoil: 0, flashT: 0, aim: 0,
      });
    }
  }

  /** Feet of the i-th of n soldiers (in random order): spread evenly down the wall, staggered in two ranks. */
  private wallFeet(i: number, n: number, key: string): [number, number] {
    const r = this.spots.get(key) ?? 0.5;
    const ay = this.lay.laneTop + (this.lay.laneBot - this.lay.laneTop) * ((i + 0.5) / Math.max(1, n));
    const ax = Math.round(this.lay.bunkerRight * (0.3 + 0.48 * ((r * 7919) % 1)));
    return [ax * this.px, Math.round(ay) * this.px];
  }
  private shooterFeet(_i: number, _n: number): [number, number] {
    const [first] = this.shooters.values();
    return first ? [first.body.x, first.body.y] : [this.lay.bunkerRight * this.px * 0.5, ((this.lay.laneTop + this.lay.laneBot) / 2) * this.px];
  }

  private tickShooters(dt: number) {
    this.syncShooters();
    const px = this.px;
    const order = [...this.spots.entries()].sort((a, b) => a[1] - b[1]).map(([key]) => key);
    const n = order.length;
    for (const u of game.owned) {
      const gun = game.gun(u.gun);
      const visible = Math.min(u.count, BattleScene.VISIBLE_PER_TYPE);
      for (let k = 0; k < visible; k++) {
        const key = `${u.cls}-${k}`;
        const s = this.shooters.get(key)!;
        const i = order.indexOf(key);
        const [fx, fy] = this.wallFeet(i, n, key);
        const bob = Math.floor(this.time.now / 450 + i) % 2;
        s.body.setTexture(`hero-${u.cls}-${bob}`).setPosition(fx, fy).setDepth(fy);
        s.recoil = Math.max(0, s.recoil - dt * 30);
        const gx = fx + (HERO_GRIP.x - HERO_W / 2) * px - Math.cos(s.aim) * s.recoil * px;
        const gy = fy - (HERO_H - HERO_GRIP.y) * px - bob * px;
        s.gun.setVisible(!!gun).setPosition(Math.round(gx), Math.round(gy)).setRotation(s.aim).setDepth(fy + 1);
        s.flashT -= dt;
        s.flash.setVisible(s.flashT > 0);
        if (s.flashT > 0) { const [mx, my] = this.muzzle(s); s.flash.setPosition(mx, my).setDepth(fy + 2); }
        if (gun && this.phase !== 'intro') this.fire(u, gun, s, visible, dt);
      }
    }
  }

  private muzzle(s: Shooter): [number, number] {
    const len = (GUN_W - 5) * this.px;
    return [s.gun.x + Math.cos(s.aim) * len, s.gun.y + Math.sin(s.aim) * len];
  }

  /** One visible soldier firing on behalf of `visible`-th of the whole unit group. */
  private fire(r: M.Unit, gun: Gun, s: Shooter, visible: number, dt: number) {
    const e = game.entry(r);
    const st = M.unitStats(e, game.fx);
    const ab = st.ability;
    const groupShots = st.shotsPerSec * M.unitPower(r.count);
    const rate = Math.min(8, groupShots / visible);
    s.cd -= dt;
    while (s.cd <= 0) {
      s.cd += 1 / rate;
      // target: the zombie closest to the shredder within range (horde zombies first during a horde)
      let target: Zombie | undefined, best = -Infinity;
      for (const z of this.zombies) {
        if (!z.alive || z.p < Math.max(0.02, 1 - st.range)) continue;
        const score = z.p + (z.horde ? 1 : 0) + Math.log(M.matchMult(e, z.strain, game.fx)) * 0.3;
        if (score > best) { best = score; target = z; }
      }
      if (!target) { s.cd = Math.max(s.cd, 0.05); return; }
      const crit = Math.random() < st.crit;
      // this soldier's share of the group's DPS, per shot (expected value matches the model; crits carry the multiplier)
      const lnShot = st.lnDps + Math.log(M.unitPower(r.count) / visible) - Math.log(rate) - Math.log(1 + st.crit * (st.critDmg - 1)) + (crit ? Math.log(st.critDmg) : 0);
      // extra targets: the nearest other zombies to the main target (pierce, spread, splash)
      const hits = [target, ...this.zombies.filter((z) => z.alive && z !== target && z.p >= 1 - st.range)
        .sort((a, b) => this.dist(a, target!) - this.dist(b, target!)).slice(0, Math.max(0, st.targets - 1))
        .filter((z) => this.dist(z, target!) < 0.25)];
      this.shoot(s, r.cls, hits);
      for (const z of hits) {
        if (!z.alive) continue;
        const ln = lnShot + Math.log(M.matchMult(e, z.strain, game.fx)) - (ab.execute ? Math.log(ab.dmg) : 0);
        // abilities: knockback, slow, napalm, headshot execute
        if (ab.knockback) z.p = Math.max(0, z.p - ab.knockback);
        if (ab.slow) z.slow = Math.max(z.slow, ab.slow);
        if (r.cls === 'flamer' && M.abilityStage(r)) z.burn = 1.5;
        if (ab.execute && !z.horde && Math.random() < ab.execute && z.alive) {
          const [hx, hy] = this.zombieCenter(z);
          this.floatText('HEADSHOT', hx, hy - 16 * this.px, true);
          this.damage(z, z.hp + 1, '', false);
          continue;
        }
        this.damage(z, Math.exp(Math.min(700, ln - z.lnHp)), z === target ? fmtLn(ln) : '', crit);
      }
    }
  }
  private dist(a: Zombie, b: Zombie) { return Math.hypot(a.p - b.p, (a.l - b.l) * 0.5); }

  private zombieCenter(z: Zombie): [number, number] {
    const [x, y] = this.toScreen(z.p, z.l);
    return [x - 2 * this.px, y - 13 * this.px];
  }

  private damage(z: Zombie, frac: number, label: string, crit: boolean) {
    z.hp -= frac;
    if (z.flash <= -0.12) z.flash = 0.05;
    if (label && (this.textCd <= 0 || crit)) {
      this.textCd = 0.2;
      const [x, y] = this.zombieCenter(z);
      this.floatText(crit ? `${label}!` : label, x, y - 14 * this.px, crit);
    }
    if (z.hp <= 0 && z.alive) this.kill(z);
  }

  private kill(z: Zombie) {
    z.alive = false;
    const [x, y] = this.zombieCenter(z);
    this.burst(x, y, 0x9e1b1b, 8);
    const s = z.sprite;
    if (s) {
      z.sprite = undefined;
      s.clearTint();
      this.tweens.add({ targets: s, angle: 90, alpha: 0, duration: 380, ease: 'Quad.easeIn', onComplete: () => s.destroy() });
    }
    sfx.zombieDeath();
    const loot = game.zombieKilled(z.strain, z.tier);
    if (loot) this.dropCrate(loot.type === 'gun' ? loot.gun.rarity : loot.gear.rarity, x, y);
  }

  private dropCrate(rarity: M.RarityId, x: number, y: number) {
    const img = this.take(`crate-${rarity}`).setPosition(x, y).setScale(this.px * 2).setDepth(8800).setAlpha(1);
    const crate: Crate = { img, t: 0, color: hex(RARITY_TRIM[rarity]) };
    this.crates.push(crate);
    this.tweens.add({
      targets: img, y: y + 6 * this.px, duration: 500, ease: 'Bounce.easeOut',
      onComplete: () => {
        const [hx, hy] = this.shooterFeet(0, 1);
        this.tweens.add({ targets: img, x: hx, y: hy - 10 * this.px, scale: this.px, duration: 600, delay: 900, ease: 'Quad.easeIn',
          onComplete: () => { this.give(img); this.crates = this.crates.filter((c) => c !== crate); } });
      },
    });
    this.burst(x, y, crate.color, 10);
    sfx.loot(rarity);
  }

  private shoot(s: Shooter, cls: ClassId, hits: Zombie[]) {
    const [tx, ty] = this.zombieCenter(hits[0]);
    s.aim = Phaser.Math.Clamp(Math.atan2(ty - s.gun.y, tx - s.gun.x), -0.5, 0.5);
    s.recoil = cls === 'sniper' || cls === 'shotgun' ? 3 : 1.5;
    const [mx, my] = this.muzzle(s);
    const px = this.px;
    sfx.shot(cls);
    const fly = (key: string, x2: number, y2: number, ms: number, after?: () => void) => {
      const b = this.take(key).setPosition(mx, my).setRotation(Math.atan2(y2 - my, x2 - mx)).setScale(px).setDepth(8600).setAlpha(1);
      this.tweens.add({ targets: b, x: x2, y: y2, duration: ms, onComplete: () => { this.give(b); after?.(); } });
    };
    switch (cls) {
      case 'pistol': s.flashT = 0.04; fly('bullet', tx, ty, 80, () => this.spark(tx, ty)); break;
      case 'rifle': s.flashT = 0.04; fly('bullet', tx, ty, 60); break;
      case 'bow': { const last = this.zombieCenter(hits[hits.length - 1]); fly('arrow', last[0], last[1], 160, () => this.spark(last[0], last[1])); break; }
      case 'shotgun': s.flashT = 0.07; for (const z of hits) { const [x, y] = this.zombieCenter(z); for (let i = 0; i < 2; i++) fly('pellet', x + (Math.random() - 0.5) * 6 * px, y + (Math.random() - 0.5) * 6 * px, 90); } break;
      case 'sniper': s.flashT = 0.08; fly('tracer', tx, ty, 50, () => { this.spark(tx, ty); this.burst(tx, ty, 0xffffff, 6); }); break;
      case 'flamer':
        for (let n = 0; n < 2; n++) {
          const f = this.take(`flame-${n}`).setPosition(mx, my).setScale(px).setDepth(8600).setAlpha(1);
          this.tweens.add({ targets: f, x: tx + (Math.random() - 0.5) * 10 * px, y: ty + (Math.random() - 0.5) * 8 * px, scale: px * 2.5, alpha: 0.15, duration: 200, onComplete: () => this.give(f) });
        }
        break;
      case 'grenade': {
        const g = this.take('grenade').setPosition(mx, my).setScale(px).setDepth(8600).setAlpha(1);
        this.tweens.add({ targets: g, x: tx, duration: 380, onUpdate: (tw) => { g.y = my + (ty - my) * tw.progress - Math.sin(tw.progress * Math.PI) * 30 * px; },
          onComplete: () => {
            this.give(g);
            const b = this.take('boom').setPosition(tx, ty).setScale(px).setDepth(8700).setAlpha(1);
            this.tweens.add({ targets: b, scale: px * 2.2, alpha: 0, duration: 300, onComplete: () => this.give(b) });
            this.burst(tx, ty, 0xff7a2a, 10);
            sfx.boom();
          } });
        break;
      }
    }
  }

  private spark(x: number, y: number) {
    const s = this.take('spark').setPosition(x, y).setScale(this.px).setDepth(8700).setAlpha(1);
    this.tweens.add({ targets: s, alpha: 0, duration: 90, onComplete: () => this.give(s) });
  }
  private burst(x: number, y: number, color: number, n: number) { this.gibs.setParticleTint(color); this.gibs.explode(n, x, y); }
  private take(key: string) {
    const pool = this.pools.get(key) ?? [];
    this.pools.set(key, pool);
    const img = pool.pop() ?? this.add.image(0, 0, key);
    this.tweens.killTweensOf(img);
    return img.setVisible(true).setRotation(0);
  }
  private give(img: Phaser.GameObjects.Image) { img.setVisible(false); this.pools.get(img.texture.key)?.push(img); }

  // ---------- effects ----------
  private floatText(s: string, x: number, y: number, crit: boolean) {
    let ft = this.texts.find((t) => t.t <= 0);
    if (!ft) {
      if (this.texts.length >= MAX_TEXTS) return;
      const obj = this.add.text(0, 0, '', { fontFamily: FONT, stroke: '#140c1c' }).setOrigin(0.5).setDepth(9400);
      ft = { obj, t: 0, vy: 0 };
      this.texts.push(ft);
    }
    ft.obj.setText(s).setColor(crit ? '#ffe14a' : '#ffffff').setFontSize(Math.round(this.px * (crit ? 9 : 6.5))).setStroke('#140c1c', Math.max(2, this.px * 1.3))
      .setPosition(Math.round(x + (Math.random() - 0.5) * 10 * this.px), Math.round(y)).setAlpha(1).setVisible(true);
    ft.t = crit ? 0.9 : 0.7;
    ft.vy = -16 * this.px;
  }

  private tickEffects(dt: number) {
    this.textCd -= dt;
    for (const ft of this.texts) {
      if (ft.t <= 0) continue;
      ft.t -= dt;
      ft.obj.y += ft.vy * dt;
      ft.obj.setAlpha(Math.max(0, Math.min(1, ft.t / 0.25)));
      if (ft.t <= 0) ft.obj.setVisible(false);
    }
    for (const c of this.crates) c.t += dt;
    this.zombies = this.zombies.filter((z) => z.alive);
  }

  private drawZombies() {
    const px = this.px;
    for (const z of this.zombies) {
      const [x, y] = this.toScreen(z.p, z.l);
      if (!z.sprite) z.sprite = this.add.sprite(x, y, `z-${z.strain}-0`).setOrigin(0.5, 1);
      const frame = z.p >= 1 ? (Math.floor(z.phase) % 2) * 2 : Math.floor(z.phase) % ZOMBIE_FRAMES;
      z.sprite.setTexture(`z-${z.strain}-${frame}`).setPosition(x, y).setScale(z.boss ? px * 2 : px).setDepth(y);
      if (z.flash > 0) z.sprite.setTintFill(0xffffff);
      else if (z.boss) z.sprite.setTint(0xff9a9a);
      else if (z.horde) z.sprite.setTint(0xffc0c0);
      else z.sprite.clearTint();
    }
  }

  private drawFx() {
    const g = this.fx, px = this.px;
    g.clear();
    const range = Math.max(0, ...game.owned.map((u) => game.stats(u).range));
    if (range > 0 && range < 0.999) {
      const [rx] = this.toScreen(1 - range, 0);
      g.fillStyle(0xffffff, 0.14);
      for (let y = this.lay.roadTop * px; y < this.lay.roadBot * px; y += 6 * px) g.fillRect(rx, y, px, 3 * px);
    }
    for (const c of this.crates) g.fillStyle(c.color, 0.35 + 0.25 * Math.sin(c.t * 10)).fillRect(c.img.x - 2 * px, c.img.y - 44 * px, 4 * px, 40 * px);
    for (const z of this.zombies) {
      if (!z.alive || z.hp >= 1 || !z.sprite) continue;
      const [x, y] = this.toScreen(z.p, z.l);
      const bw = (z.boss ? 30 : 14) * px, top = y - (z.boss ? 58 : 30) * px;
      g.fillStyle(0x140c1c, 1).fillRect(x - bw / 2 - px, top - px, bw + 2 * px, 3 * px);
      g.fillStyle(z.horde ? 0xff4a4a : 0xe04848, 1).fillRect(x - bw / 2, top, Math.ceil((bw * Math.max(0, z.hp)) / px) * px, z.boss ? 2 * px : px);
    }
    const h = this.horde;
    const show = this.phase === 'horde' || this.phase === 'intro';
    this.hordeText.setVisible(show);
    if (show) {
      const left = h.queue.length + this.zombies.filter((z) => z.alive && z.horde).length;
      const boss = h.queue.length ? 'BOSS COMING' : this.zombies.some((z) => z.alive && z.boss) ? 'BOSS ON THE FIELD' : 'BOSS DOWN';
      this.hordeText.setText(`HORDE ${h.k}  ${Math.max(0, Math.ceil(C.hordeTimerSec - h.t))}S\n${left} LEFT · ${boss}\nBREACHES ${h.breaches}/${C.breachLimit}`)
        .setFontSize(Math.max(12, Math.round(px * 6))).setStroke('#140c1c', Math.max(3, px * 1.4)).setLineSpacing(2)
        .setPosition(Math.round(this.lay.shredX * px + 8 * px), Math.round(this.lay.roadTop * px + 6 * px))
        .setColor(h.breaches >= C.breachLimit * 0.7 ? '#ff6b6b' : '#ffd34d');
    }
    if (this.phase === 'horde') {
      const f = Math.min(1, this.horde.t / C.hordeTimerSec);
      g.fillStyle(0x140c1c, 1).fillRect(0, this.H - 3 * px, this.W, 3 * px);
      g.fillStyle(f > 0.75 ? 0xe04848 : 0xe0a548, 1).fillRect(0, this.H - 3 * px, Math.round((this.W * (1 - f)) / px) * px, 3 * px);
    }
  }
}
