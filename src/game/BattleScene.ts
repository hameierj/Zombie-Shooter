// The battlefield, drawn with generated 16-bit pixel art (see art.ts). Everything is laid out on an "art pixel"
// grid: 1 art pixel = `px` device pixels, chosen from the field size, so sprites stay crisp on a laptop, an iPhone,
// or an iPhone Duo folded or unfolded. Resizing (rotate/fold) re-maps every unit mid-fight.
//
// Zombies walk in endlessly at the current DNA Count tier and Spawn Rate. A horde is an optional challenge: the
// stream pauses, 60 zombies of the horde's tier rush in and a boss follows. Kill them all before the timer runs out;
// if the boss reaches the shredder, or 10 horde zombies break through, the horde is lost.
import { showRanges } from '../core/prefs';
import Phaser from 'phaser';
import * as M from '../core/model.ts';
import type { ClassId, Gun, SpecialId, VarietyId, ZombieId } from '../core/model.ts';
import { game } from '../core/state.ts';
import { fmtLn } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';
import { buildArt, drawGround, GUN_H, GUN_W, HERO_GRIP, HERO_H, HERO_W, RARITY_TRIM, RES, ZOMBIE_FRAMES } from './art.ts';

const C = M.CONFIG;
const FONT = '"Lilita One", system-ui, sans-serif';
const ART_SHORT_SIDE = 400;  // art pixels across the field's short side (bigger = more zoomed out)
const MAX_AMBIENT = 110;     // cap on stream zombies alive at once
const MAX_TEXTS = 24;
const INTRO_SEC = 1.4;
const STUCK_SEC = 20;          // seconds of a swamped shredder before offering a roll-back

type Phase = 'stream' | 'intro' | 'horde' | 'end';
interface Zombie {
  strain: ZombieId; variety: VarietyId; special: SpecialId | null; announced: boolean; tier: number; lnHp: number; hp: number; p: number; l: number; speed: number; horde: boolean; boss: boolean; atWall: boolean; slow: number; burn: number;
  shredded?: boolean;  // killed by the shredder: no DNA (only the squad's kills pay)
  flash: number; phase: number; alive: boolean; sprite?: Phaser.GameObjects.Sprite;
  back?: number;       // drawing only: art px pushed back up the road so a pile at the shredder forms a visible queue
}
interface Shooter { body: Phaser.GameObjects.Sprite; gun: Phaser.GameObjects.Image; flash: Phaser.GameObjects.Image; cls: ClassId; cd: number; recoil: number; flashT: number; aim: number }
interface FloatText { obj: Phaser.GameObjects.Text; t: number; vy: number }
interface Crate { img: Phaser.GameObjects.Image; t: number; color: number }

const hex = (css: string) => Number.parseInt(css.slice(1), 16);
/** Range-line colour per unit type. */
const RANGE_COLOR: Record<ClassId, number> = {
  pistol: 0xf2f2f2, bow: 0x7ddc5a, shotgun: 0xff9a3c, rifle: 0x4aa3ff, sniper: 0x7fe8ff, flamer: 0xff5a5a, grenade: 0xd8c46a,
  mg: 0xc0c8d0, drone: 0x4ad6c8, rail: 0x5a8cff, mortar: 0xb08850, tesla: 0x9a8aff,
};

export class BattleScene extends Phaser.Scene {
  private W = 100; private H = 100; private px = 3;
  /** Scale for RES× sprites so 1 art unit = px device pixels. */
  private get S() { return this.px / RES; }
  private AW = 40; private AH = 30;
  private lay = { bunkerRight: 10, shredX: 11, stopX: 30, spawnX: 60, laneTop: 10, laneBot: 25, roadTop: 5, roadBot: 28 };
  private ground?: Phaser.GameObjects.Image;
  private groundKey = '';
  private housing!: Phaser.GameObjects.TileSprite;
  private teeth!: Phaser.GameObjects.TileSprite;
  private overrun = 0;
  private stuckT = 0;
  private atWallCount = 0;
  private keepCache = 1;
  private keepT = 0;
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
  private spawnTimers = new Map<ZombieId, number>();
  private horde = { k: 0, queue: [] as Zombie[], t: 0, spawnT: 0, breaches: 0, bossThrough: false };
  private hordeText!: Phaser.GameObjects.Text;
  private ready = false;

  constructor() { super('battle'); }

  create() {
    for (const [key, canvas] of Object.entries(buildArt().canvases)) if (!this.textures.exists(key)) this.textures.addCanvas(key, canvas);
    this.housing = this.add.tileSprite(0, 0, 16 * RES, 16 * RES, 'shred-housing').setOrigin(0, 0).setDepth(2);
    this.teeth = this.add.tileSprite(0, 0, 10 * RES, 16 * RES, 'shred-teeth').setOrigin(0, 0).setDepth(2);
    this.capTop = this.add.image(0, 0, 'shred-cap').setOrigin(0, 0).setDepth(3);
    this.capBot = this.add.image(0, 0, 'shred-cap').setOrigin(0, 1).setDepth(3);
    this.fx = this.add.graphics().setDepth(9000);
    this.gibs = this.add.particles(0, 0, 'pix', {
      emitting: false, lifespan: { min: 300, max: 700 }, speed: { min: 50, max: 220 }, angle: { min: 200, max: 340 },
      gravityY: 800, alpha: { start: 1, end: 0 }, scale: { start: 1, end: 0.4 },
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
    this.px = Math.max(1, Math.min(8, Math.min(this.W, Math.max(this.H, this.W * 0.55)) / ART_SHORT_SIDE));
    const px = this.px;
    this.AW = Math.ceil(this.W / px);
    this.AH = Math.ceil(this.H / px);
    const bunkerRight = Math.max(44, Math.round(this.AW * 0.16));
    const roadTop = Math.round(this.AH * 0.1), roadBot = Math.round(this.AH * 0.96);
    this.lay = { bunkerRight, shredX: bunkerRight + 1, stopX: bunkerRight + 36, spawnX: this.AW + 16, laneTop: roadTop + 26, laneBot: roadBot - 2, roadTop, roadBot };
    const key = `ground-${this.AW}x${this.AH}@${px.toFixed(3)}`;
    if (key !== this.groundKey) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawGround({ w: this.AW, h: this.AH, roadTop, roadBot, bunkerRight: bunkerRight - 1 }, px));
      const old = this.groundKey;
      if (this.ground) this.ground.setTexture(key); else this.ground = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
      this.groundKey = key;
      if (old && old !== key && this.textures.exists(old)) this.textures.remove(old);
    }
    this.ground!.setScale(1);
    const sx = this.lay.shredX * px;
    const S = this.S;
    this.housing.setPosition(sx, 0).setSize(16 * RES, this.AH * RES).setScale(S);
    this.teeth.setPosition(sx + 16 * px, 0).setSize(10 * RES, this.AH * RES).setScale(S);
    this.capTop.setPosition(sx - 2 * px, 0).setScale(S, S * 2);
    this.capBot.setPosition(sx - 2 * px, this.H).setScale(S, S * 2);
    for (const s of this.shooters.values()) { s.body.setScale(S); s.gun.setScale(S); s.flash.setScale(S); }
    this.gibs.setParticleScale(S * 1.4);
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
    for (const z of this.zombies) if (!onlyHorde || z.horde) {
      const s = z.sprite; z.sprite = undefined; z.alive = false;
      // a lost horde fades away instead of blinking out
      if (s && onlyHorde) this.tweens.add({ targets: s, alpha: 0, duration: 700, onComplete: () => s.destroy() }); else s?.destroy();
    }
    this.zombies = onlyHorde ? this.zombies.filter((z) => !z.horde) : [];
  }
  private makeZombie(strain: ZombieId, tier: number, spawnLv: number, horde: boolean, boss = false, special: SpecialId | null = null, variety: VarietyId = 0): Zombie {
    const sp = special ? M.specialById(special) : null;
    return {
      strain, variety, special, announced: false, tier, horde, boss, atWall: false, lnHp: M.lnZombieHp(strain, tier, spawnLv) + (boss ? Math.log(C.bossHpMult) : 0) + (sp ? Math.log(sp.hp) : 0) + Math.log(M.VARIETIES[variety].hp), hp: 1, slow: 0, burn: 0,
      p: -0.02 - Math.random() * 0.05, l: boss ? 0 : Math.random() * 2 - 1,
      speed: (boss ? C.bossSpeed : M.strainById(strain).speed * (sp?.speed ?? 1) * (0.85 + Math.random() * 0.3) * (horde ? 1.3 : 1)) / C.walkSec,   // every boss walks at the same pace
      flash: -1, phase: Math.random() * 4, alive: true,
    };
  }

  private startHorde() {
    const k = game.nextHorde;
    const h = M.hordeDef(k);
    const mix = M.hordeMix(k);
    const queue = Array.from({ length: C.hordeZombies }, () => this.makeZombie(mix[Math.floor(Math.random() * mix.length)], h.tier, 0, true));
    // the boss comes last: kill it before it reaches the shredder to win
    queue.push(this.makeZombie(M.hordeBoss(k), h.tier, 0, true, true));
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
    this.teeth.tilePositionY -= dt * 30 * RES;
    // overrun cue: the shredder glows red while zombies are grinding at it
    const atWall = this.zombies.filter((z) => z.alive && z.p >= 1 && !z.horde).length;
    this.atWallCount = atWall;
    if ((this.keepT -= dt) <= 0) { this.keepT = 1; this.keepCache = game.keepUp(); }
    // stuck detection: the shredder swamped for a long time outside a horde → ask the player to roll back
    if (this.phase === 'stream' && atWall >= 3) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 3);
    if (this.stuckT >= STUCK_SEC) { this.stuckT = 0; game.emit('stuck'); }
    this.overrun += ((atWall > 0 ? Math.min(1, 0.35 + atWall * 0.12) : 0) - this.overrun) * Math.min(1, dt * 4);
    if (this.overrun > 0.02) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time.now / 140);
      const r = 255, gb = Math.round(255 - 200 * this.overrun * pulse);
      const tint = (r << 16) | (gb << 8) | gb;
      this.teeth.setTint(tint); this.housing.setTint(tint);
    } else { this.teeth.clearTint(); this.housing.clearTint(); }
    this.autoT += dt;
    // War Drums: start the next horde automatically when the squad should win (never spends DNA)
    if (this.autoT >= 3) { this.autoT = 0; if (this.phase === 'stream' && game.autoHorde && game.hordeOdds() >= game.autoHordeNeeds) game.startHorde(); }

    if (this.phase === 'stream' || this.phase === 'end') {
      // the endless stream: every released zombie type spawns at its own rate, tier and spawn level
      const ambient = this.zombies.filter((z) => z.alive && !z.horde).length;
      for (const sid of M.activeStrains(game.s.strains)) {
        const x = game.s.strains[sid];
        let t = (this.spawnTimers.get(sid) ?? Math.random() * 2) - dt;
        while (t <= 0) {
          t += 1 / M.spawnRate(sid, x.spawn);
          if (ambient < MAX_AMBIENT) this.zombies.push(this.makeZombie(sid, x.tier, x.spawn, false, false, M.rollSpecial(Math.random), M.rollVariety(x.tier, Math.random)));
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
      // you lose if the boss reaches the shredder, or if 10 horde zombies get to it
      const lost = h.bossThrough ? 'THE BOSS REACHED THE SHREDDER' : h.breaches >= C.breachLimit ? `${C.breachLimit} ZOMBIES REACHED THE SHREDDER` : '';
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
    // special zombies' auras: screamers speed up, medics heal the zombies around them
    const screamers = this.zombies.filter((z) => z.alive && z.special === 'screamer');
    const medics = this.zombies.filter((z) => z.alive && z.special === 'medic');
    for (const m of medics) for (const z of this.zombies) if (z.alive && z !== m && this.dist(z, m) < 0.14) z.hp = Math.min(1, z.hp + 0.06 * dt);
    for (const z of this.zombies) {
      if (!z.alive) continue;
      z.flash -= dt;
      if (z.special && !z.announced && z.p > 0.04) {
        z.announced = true;
        const [ax, ay] = this.zombieCenter(z);
        this.floatText(`${M.specialById(z.special).name.toUpperCase()}!`, ax, ay - 18 * this.px, z.special === 'golden');
      }
      if (z.p < 1) {
        z.slow = Math.max(0, z.slow - dt * 0.5);
        const boost = screamers.some((s) => s !== z && this.dist(z, s) < 0.16) ? 1.4 : 1;
        const sp = z.speed * (1 - z.slow) * boost;
        z.p = Math.min(1, z.p + sp * dt); z.phase += dt * 6 * sp * C.walkSec;
        if (z.burn > 0) { z.burn -= dt; if (Math.random() < dt * 8) { const [bx, by] = this.zombieCenter(z); this.burst(bx, by + 8 * this.px, 0xff7a2a, 1); } }
        if (z.p > 0.6 && Math.random() < dt * 0.15) sfx.groan();
      }
      else if (z.horde) {
        // a horde zombie reached the shredder: a breach (10 lose the horde; the boss getting there loses it at once)
        if (z.boss) this.horde.bossThrough = true;
        else this.horde.breaches++;
        z.alive = false;
        const [x, y] = this.toScreen(1, z.l);
        this.burst(x - 6 * this.px, y - 10 * this.px, 0xff4a4a, 10);
        // pulled into the blades (not just vanishing)
        const s = z.sprite; z.sprite = undefined;
        if (s) this.tweens.add({ targets: s, x: this.lay.shredX * this.px + 8 * this.px, scaleX: 0.2, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => s.destroy() });
        game.comboBreak();
        sfx.grind();
      }
      else {
        if (!z.atWall) { z.atWall = true; game.comboBreak(); }
        // in the blades: the shredder's damage is shared by every zombie on it, and always takes at least
        // a small share of their HP, so even an overwhelming pile-up dies eventually
        z.phase += dt * 3;
        z.hp -= C.shredFrac * dt;
        z.shredded = true;
        sfx.grind();
        if (Math.random() < dt * 6) { const [x, y] = this.toScreen(1, z.l); this.burst(x - 6 * this.px, y - 10 * this.px, 0x8a1c1c, 2); }
        if (z.hp <= 0) this.kill(z);
      }
    }
  }

  // ---------- squad: soldiers stand at random spots along the wall, each firing for a share of its unit type ----------
  private static readonly VISIBLE_PER_TYPE = 20;   // every soldier is drawn (up to 20 per unit type)
  /** Soldier sprite scale (shrinks a little when the wall gets crowded). */
  private crowd = 1;
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
        body: this.add.sprite(0, 0, `hero-${cls}-0`).setOrigin(0.5, 1).setScale(this.S),
        gun: this.add.image(0, 0, `gun-${cls}`).setOrigin(3 / GUN_W, 6 / GUN_H).setScale(this.S),
        flash: this.add.image(0, 0, 'muzzle').setVisible(false).setScale(this.S).setBlendMode(Phaser.BlendModes.ADD),
        cls, cd: Math.random() * 0.5, recoil: 0, flashT: 0, aim: 0,
      });
    }
  }

  /** Feet of the i-th of n soldiers (in random order): spread evenly down the wall, staggered in two ranks. */
  private wallFeet(i: number, n: number, key: string): [number, number] {
    const r = this.spots.get(key) ?? 0.5;
    const ay = this.lay.laneTop + (this.lay.laneBot - this.lay.laneTop) * ((i + 0.5) / Math.max(1, n));
    const ax = Math.round(this.lay.bunkerRight * (0.16 + 0.64 * ((r * 7919) % 1)));
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
    // crowded wall: shrink soldiers so the whole army fits (each needs roughly 13×15 art units)
    const room = this.lay.bunkerRight * 0.72 * (this.lay.laneBot - this.lay.laneTop);
    this.crowd = Math.max(0.55, Math.min(1, Math.sqrt(room / Math.max(1, n * 13 * 15))));
    const cs = this.crowd, sc = this.S * cs;
    for (const u of game.owned) {
      const gun = game.gun(u.gun);
      const visible = Math.min(u.count, BattleScene.VISIBLE_PER_TYPE);
      for (let k = 0; k < visible; k++) {
        const key = `${u.cls}-${k}`;
        const s = this.shooters.get(key)!;
        const i = order.indexOf(key);
        const [fx, fy] = this.wallFeet(i, n, key);
        const bob = Math.floor(this.time.now / 450 + i) % 2;
        s.body.setTexture(`hero-${u.cls}-${bob}`).setPosition(fx, fy).setDepth(fy).setScale(sc);
        s.recoil = Math.max(0, s.recoil - dt * 30);
        const gx = fx + ((HERO_GRIP.x - HERO_W / 2) * px - Math.cos(s.aim) * s.recoil * px) * cs;
        const gy = fy - ((HERO_H - HERO_GRIP.y) * px + bob * px) * cs;
        s.gun.setVisible(!!gun).setPosition(Math.round(gx), Math.round(gy)).setRotation(s.aim).setDepth(fy + 1).setScale(sc);
        s.flash.setScale(sc);
        s.flashT -= dt;
        s.flash.setVisible(s.flashT > 0);
        if (s.flashT > 0) { const [mx, my] = this.muzzle(s); s.flash.setPosition(mx, my).setDepth(fy + 2); }
        if (gun && this.phase !== 'intro') this.fire(u, gun, s, visible, dt);
      }
    }
  }

  private muzzle(s: Shooter): [number, number] {
    const len = (GUN_W - 5) * this.px * this.crowd;
    return [s.gun.x + Math.cos(s.aim) * len, s.gun.y + Math.sin(s.aim) * len];
  }

  /** One visible soldier firing on behalf of `visible`-th of the whole unit group. */
  private fire(r: M.Unit, gun: Gun, s: Shooter, visible: number, dt: number) {
    const e = game.entry(r);
    const st = M.unitStats(e, game.fx);
    const ab = st.ability;
    const groupShots = st.shotsPerSec * M.unitPower(r.count);
    // shots drawn per soldier: the group's real rate, but at most ~40 visible shots/s per unit type (damage is unaffected)
    const cap = r.cls === 'rail' || r.cls === 'sniper' ? 8 : 40;   // big single shots: fewer, so beams don't clutter the road
    const rate = Math.min(8, groupShots / visible, cap / visible);
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
        if (ab.knockback && !z.boss) z.p = Math.max(0, z.p - ab.knockback);   // bosses can't be pushed back
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

  /** Where a zombie is drawn: its road position plus its place in the queue at the shredder. */
  private zScreen(z: Zombie): [number, number] {
    const [x, y] = this.toScreen(z.p, z.l);
    return [x + (z.back ?? 0) * this.px, y];
  }
  private zombieCenter(z: Zombie): [number, number] {
    const [x, y] = this.zScreen(z);
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
    const sp = z.special ? M.specialById(z.special) : null;
    if (sp) {
      this.burst(x, y, sp.tint, 14);
      this.floatText(`×${sp.dna} DNA`, x, y - 16 * this.px, true);
      if (z.special === 'exploder') {
        // the blast hurts every zombie close by
        const b = this.take('boom').setPosition(x, y).setScale(this.S * 1.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(8700).setAlpha(1);
        this.tweens.add({ targets: b, scale: this.S * 4, alpha: 0, duration: 350, onComplete: () => this.give(b) });
        sfx.boom();
        for (const n of this.zombies) if (n.alive && n !== z && this.dist(n, z) < 0.13) this.damage(n, 0.6, '', false);
      }
    }
    const vm = M.VARIETIES[z.variety].dna;
    const loot = game.zombieKilled(z.strain, z.tier, { shredded: !!z.shredded, mult: (sp?.dna ?? 1) * vm * (z.shredded ? C.shredDna * Math.min(1, this.keepCache) ** 2 : 1), lootMult: (sp?.loot ?? 1) * (z.variety ? 1.5 * z.variety : 1) });
    if (loot) this.dropCrate(loot.type === 'gun' ? loot.gun.rarity : loot.gear.rarity, x, y);
  }

  private dropCrate(rarity: M.RarityId, x: number, y: number) {
    const img = this.take(`crate-${rarity}`).setPosition(x, y).setScale(this.S * 2).setDepth(8800).setAlpha(1);
    const crate: Crate = { img, t: 0, color: hex(RARITY_TRIM[rarity]) };
    this.crates.push(crate);
    this.tweens.add({
      targets: img, y: y + 6 * this.px, duration: 500, ease: 'Bounce.easeOut',
      onComplete: () => {
        const [hx, hy] = this.shooterFeet(0, 1);
        this.tweens.add({ targets: img, x: hx, y: hy - 10 * this.px, scale: this.S, duration: 600, delay: 900, ease: 'Quad.easeIn',
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
      const b = this.take(key).setPosition(mx, my).setRotation(Math.atan2(y2 - my, x2 - mx)).setScale(this.S).setBlendMode(key === 'arrow' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD).setDepth(8600).setAlpha(1);
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
          const f = this.take(`flame-${n}`).setPosition(mx, my).setScale(this.S).setBlendMode(Phaser.BlendModes.ADD).setDepth(8600).setAlpha(1);
          this.tweens.add({ targets: f, x: tx + (Math.random() - 0.5) * 10 * px, y: ty + (Math.random() - 0.5) * 8 * px, scale: this.S * 2.5, alpha: 0, duration: 220, onComplete: () => this.give(f) });
        }
        break;
      case 'mg': s.flashT = 0.05; fly('bullet', tx + (Math.random() - 0.5) * 4 * px, ty + (Math.random() - 0.5) * 4 * px, 45); break;
      case 'drone': {
        const d = this.take('drone-bot').setPosition(mx, my).setScale(this.S).setDepth(8650).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
        this.tweens.add({ targets: d, x: tx, duration: 420, onUpdate: (tw) => { d.y = my + (ty - my) * tw.progress - Math.sin(tw.progress * Math.PI) * 24 * px; },
          onComplete: () => { this.give(d); this.spark(tx, ty); this.burst(tx, ty, 0xff5a5a, 5); } });
        break;
      }
      case 'mortar': {
        const sh = this.take('shell').setPosition(mx, my).setScale(this.S).setDepth(8650).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
        this.tweens.add({ targets: sh, x: tx, duration: 700, onUpdate: (tw) => { sh.y = my + (ty - my) * tw.progress - Math.sin(tw.progress * Math.PI) * 70 * px; sh.setRotation(-0.9 + 1.8 * tw.progress); },
          onComplete: () => {
            this.give(sh);
            const b = this.take('boom').setPosition(tx, ty).setScale(this.S * 1.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(8700).setAlpha(1);
            this.tweens.add({ targets: b, scale: this.S * 3.6, alpha: 0, duration: 380, onComplete: () => this.give(b) });
            this.burst(tx, ty, 0xff9a3c, 14);
            this.cameras.main.shake(140, 0.004);
            sfx.boom();
          } });
        break;
      }
      case 'rail': {
        // an instant straight beam through the line of zombies it pierces
        s.flashT = 0.08;
        const far = hits.map((z) => this.zombieCenter(z)).reduce((a, b) => (b[0] > a[0] ? b : a));
        const beam = this.add.graphics().setDepth(8700).setBlendMode(Phaser.BlendModes.ADD);
        for (const [w, col, a] of [[3.5, 0x3a6aff, 0.4], [1.4, 0xd8ecff, 0.9]] as const) beam.lineStyle(w * px, col, a).lineBetween(mx, my, far[0] + 30 * px, far[1]);
        this.tweens.add({ targets: beam, alpha: 0, duration: 130, onComplete: () => beam.destroy() });
        for (const z of hits) { const [x, y] = this.zombieCenter(z); this.spark(x, y); }
        break;
      }
      case 'tesla': {
        // a jagged arc from the gun through every zombie it chains to
        const pts: [number, number][] = [[mx, my], ...hits.map((z) => this.zombieCenter(z))];
        const bolt = this.add.graphics().setDepth(8700).setBlendMode(Phaser.BlendModes.ADD);
        for (const [w, col, a] of [[3, 0x6a5aff, 0.5], [1.2, 0xe8e4ff, 1]] as const) {
          bolt.lineStyle(w * px, col, a).beginPath().moveTo(pts[0][0], pts[0][1]);
          for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
            for (let k = 1; k <= 4; k++) bolt.lineTo(x0 + ((x1 - x0) * k) / 4 + (k < 4 ? (Math.random() - 0.5) * 8 * px : 0), y0 + ((y1 - y0) * k) / 4 + (k < 4 ? (Math.random() - 0.5) * 8 * px : 0));
          }
          bolt.strokePath();
        }
        this.tweens.add({ targets: bolt, alpha: 0, duration: 140, onComplete: () => bolt.destroy() });
        for (const [x, y] of pts.slice(1)) this.spark(x, y);
        break;
      }
      case 'grenade': {
        const g = this.take('grenade').setPosition(mx, my).setScale(this.S).setDepth(8600).setAlpha(1);
        this.tweens.add({ targets: g, x: tx, duration: 380, onUpdate: (tw) => { g.y = my + (ty - my) * tw.progress - Math.sin(tw.progress * Math.PI) * 30 * px; },
          onComplete: () => {
            this.give(g);
            const b = this.take('boom').setPosition(tx, ty).setScale(this.S).setBlendMode(Phaser.BlendModes.ADD).setDepth(8700).setAlpha(1);
            this.tweens.add({ targets: b, scale: this.S * 2.6, alpha: 0, duration: 320, onComplete: () => this.give(b) });
            this.burst(tx, ty, 0xff7a2a, 10);
            this.cameras.main.shake(110, 0.003);
            sfx.boom();
          } });
        break;
      }
    }
  }

  private spark(x: number, y: number) {
    const s = this.take('spark').setPosition(x, y).setScale(this.S).setBlendMode(Phaser.BlendModes.ADD).setDepth(8700).setAlpha(1);
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

  /** Zombies at the shredder queue up in a few rows instead of all standing on the same spot, and walkers stop
   *  behind the queue on screen. Drawing only: the maths still treats them all as at the shredder. */
  private static readonly QUEUE_ROWS = 5;
  private static readonly QUEUE_GAP = 9;   // art px between queued zombies
  private layoutQueue() {
    const rows = BattleScene.QUEUE_ROWS, gap = BattleScene.QUEUE_GAP;
    const row = (z: Zombie) => Math.min(rows - 1, Math.floor(((z.l + 1) / 2) * rows));
    const tail = new Array(rows).fill(0);
    for (const z of this.zombies) {
      if (!z.alive || z.p < 1 || z.horde) continue;
      const r = row(z);
      z.back = tail[r] * gap; tail[r]++;
    }
    const { spawnX, stopX } = this.lay;
    for (const z of this.zombies) {
      if (!z.alive || z.p >= 1) continue;
      const wx = spawnX + (stopX - spawnX) * z.p, end = stopX + tail[row(z)] * gap;
      z.back = Math.max(0, end - wx);
    }
  }

  private drawZombies() {
    const px = this.px;
    this.layoutQueue();
    for (const z of this.zombies) {
      const [x, y] = this.zScreen(z);
      if (!z.sprite) z.sprite = this.add.sprite(x, y, `z-${z.strain}-0`).setOrigin(0.5, 1);
      const frame = z.p >= 1 ? (Math.floor(z.phase) % 2) * 2 : Math.floor(z.phase) % ZOMBIE_FRAMES;
      z.sprite.setTexture(`z-${z.strain}-${frame}`).setPosition(x, y).setScale((z.boss ? 2 : 1 + 0.12 * z.variety) * this.S).setDepth(y);
      if (z.flash > 0) z.sprite.setTintFill(0xffffff);
      else if (z.boss) z.sprite.setTint(0xff9a9a);
      else if (z.special) z.sprite.setTint(M.specialById(z.special).tint);
      else if (z.variety === 1) z.sprite.setTint(0xffb4a4);
      else if (z.variety === 2) z.sprite.setTint(0xc8b8ff);
      else if (z.horde) z.sprite.setTint(0xffc0c0);
      else z.sprite.clearTint();
    }
  }

  /** One dashed line per hired unit type at the edge of its range, with that type's gun as a marker. */
  private rangeIcons = new Map<ClassId, Phaser.GameObjects.Image>();
  private drawRanges(g: Phaser.GameObjects.Graphics) {
    if (!showRanges()) { for (const icon of this.rangeIcons.values()) icon.setVisible(false); return; }
    const px = this.px;
    const top = this.lay.roadTop * px, bot = this.lay.roadBot * px;
    const owned = game.owned.filter((u) => u.count > 0);
    const seen = new Set<ClassId>();
    const placed: number[] = [];
    owned.forEach((u, i) => {
      const range = Math.min(1, game.stats(u).range);
      let [rx] = this.toScreen(1 - range, 0);
      rx = Math.min(rx, this.W - 3 * px);
      const col = RANGE_COLOR[u.cls];
      g.fillStyle(col, 0.38);
      const off = (i * 2) % 6;
      for (let y = top + off * px; y < bot; y += 6 * px) g.fillRect(Math.round(rx), y, px, 3 * px);
      // marker: alternate top/bottom; nudge if another marker on the same end is too close
      const atTop = i % 2 === 0;
      // keep badges on screen; when they crowd, step back toward the wall
      let ix = Math.min(rx, this.W - 14 * px);
      for (let guard = 0; guard < 20 && placed.some((p) => Math.abs(p - (atTop ? ix : -ix)) < 26 * px); guard++) ix -= 26 * px;
      placed.push(atTop ? ix : -ix);
      let icon = this.rangeIcons.get(u.cls);
      if (!icon) { icon = this.add.image(0, 0, `gun-${u.cls}`).setDepth(9001); this.rangeIcons.set(u.cls, icon); }
      icon.setScale(this.S * 0.9).setPosition(Math.round(ix), Math.round(atTop ? top + 7 * px : bot - 7 * px)).setVisible(true).setAlpha(0.9);
      g.fillStyle(0x0d1117, 0.55).fillRoundedRect(ix - 12 * px, (atTop ? top + 7 * px : bot - 7 * px) - 6 * px, 24 * px, 12 * px, 3 * px);
      g.lineStyle(px * 0.6, col, 0.8).strokeRoundedRect(ix - 12 * px, (atTop ? top + 7 * px : bot - 7 * px) - 6 * px, 24 * px, 12 * px, 3 * px);
      seen.add(u.cls);
    });
    for (const [cls, icon] of this.rangeIcons) if (!seen.has(cls)) icon.setVisible(false);
  }

  private drawFx() {
    const g = this.fx, px = this.px;
    g.clear();
    this.drawRanges(g);
    if (this.overrun > 0.02) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time.now / 140);
      const x0 = (this.lay.shredX + 26) * px;
      for (let i = 0; i < 6; i++) g.fillStyle(0xff2a2a, 0.18 * this.overrun * pulse * (1 - i / 6)).fillRect(x0 + i * 4 * px, this.lay.roadTop * px, 4 * px, (this.lay.roadBot - this.lay.roadTop) * px);
    }
    for (const c of this.crates) g.fillStyle(c.color, 0.35 + 0.25 * Math.sin(c.t * 10)).fillRect(c.img.x - 2 * px, c.img.y - 44 * px, 4 * px, 40 * px);
    // special zombies: a pulsing ring at their feet in their colour
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now / 160);
    for (const z of this.zombies) {
      if (!z.alive || z.variety !== 2 || z.special) continue;
      const [x, y] = this.zScreen(z);
      g.fillStyle(0x6a2aff, 0.22).fillEllipse(x, y - px, 18 * px, 6 * px);
    }
    for (const z of this.zombies) {
      if (!z.alive || !z.special) continue;
      const [x, y] = this.zScreen(z);
      const col = M.specialById(z.special).tint;
      g.lineStyle(px, col, 0.5 + 0.4 * pulse).strokeEllipse(x, y - px, (14 + 2 * pulse) * px, 5 * px);
      if (z.special === 'screamer' || z.special === 'medic') g.lineStyle(px * 0.6, col, 0.18).strokeCircle(x, y - 12 * px, 0.15 * (this.lay.spawnX - this.lay.stopX) * px);
    }
    for (const z of this.zombies) {
      if (!z.alive || z.hp >= 1 || !z.sprite) continue;
      const [x, y] = this.zScreen(z);
      const sc = z.boss ? 2 : 1 + 0.12 * z.variety;
      const bw = (z.boss ? 30 : 14) * px, top = y - 29 * sc * px;
      g.fillStyle(0x140c1c, 1).fillRect(x - bw / 2 - px, top - px, bw + 2 * px, 3 * px);
      g.fillStyle(z.horde ? 0xff4a4a : 0xe04848, 1).fillRect(x - bw / 2, top, Math.ceil((bw * Math.max(0, z.hp)) / px) * px, z.boss ? 2 * px : px);
    }
    const h = this.horde;
    const show = this.phase === 'horde' || this.phase === 'intro';
    this.hordeText.setVisible(show);
    if (show) {
      const left = h.queue.length + this.zombies.filter((z) => z.alive && z.horde).length;
      const boss = h.queue.length ? 'BOSS COMING' : this.zombies.some((z) => z.alive && z.boss) ? 'BOSS ON THE FIELD' : 'BOSS DOWN';
      const bz = this.zombies.find((z) => z.alive && z.boss);
      this.hordeText.setText(`HORDE ${h.k}  ·  ${left} LEFT  ·  BREACHES ${h.breaches}/${C.breachLimit}\n${boss}${bz ? ` · ${Math.round(Math.max(0, 1 - bz.p) * 100)}% FROM THE SHREDDER` : ''}`)
        .setFontSize(Math.max(12, Math.round(px * 6))).setStroke('#140c1c', Math.max(3, px * 1.4)).setLineSpacing(2)
        .setPosition(Math.round(this.lay.shredX * px + 8 * px), Math.round(this.lay.roadTop * px + 6 * px))
        .setColor((bz && bz.p > 0.65) || h.breaches >= C.breachLimit * 0.7 ? '#ff6b6b' : '#ffd34d');
    }
    // boss distance bar along the bottom: empties as the boss nears the shredder
    const bossZ = this.phase === 'horde' ? this.zombies.find((z) => z.alive && z.boss) : undefined;
    if (bossZ) {
      const f = Math.max(0, Math.min(1, bossZ.p));
      g.fillStyle(0x140c1c, 1).fillRect(0, this.H - 4 * px, this.W, 4 * px);
      g.fillStyle(f > 0.65 ? 0xe04848 : 0xe0a548, 1).fillRect(0, this.H - 4 * px, Math.round((this.W * (1 - f)) / px) * px, 4 * px);
    }
  }
}
