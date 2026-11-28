// The battlefield, drawn with generated 16-bit pixel art (see art.ts). Everything is laid out on an "art pixel"
// grid: 1 art pixel = `px` device pixels, chosen from the field size, so sprites stay crisp on a laptop, an iPhone,
// or an iPhone Duo folded or unfolded. Resizing (rotate/fold) re-maps every unit mid-fight.
//
// Zombies walk in endlessly at the current DNA Count tier and Spawn Rate. A horde is an optional challenge: the
// stream pauses, 60 zombies of the horde's tier rush in and a boss follows. Kill them all before the timer runs out;
// if the boss reaches the shredder, or 10 horde zombies break through, the horde is lost.
import { showRanges, skipAnims } from '../core/prefs';
import { titleUp } from '../ui/title.ts';
import { overlayUp } from '../ui/unlocks.ts';
import { coachUp } from '../ui/tutorial.ts';
import Phaser from 'phaser';
import * as M from '../core/model.ts';
import type { ClassId, Gun, SpecialId, VarietyId, ZombieId } from '../core/model.ts';
import { game } from '../core/state.ts';
import { fmtLn } from '../core/format.ts';
import * as sfx from '../audio/sfx.ts';
import { drawCity } from './city.ts';
import { fxTextures } from './fxtex.ts';
import { buildArt, type GroundTheme, GUN_H, GUN_W, HERO_GRIP, HERO_H, HERO_W, RARITY_TRIM, RES, ZOMBIE_FRAMES } from './art.ts';

const C = M.CONFIG;
const FONT = '"Lilita One", system-ui, sans-serif';
const ART_SHORT_SIDE = 400;  // art pixels across the field's short side (bigger = more zoomed out)
const MAX_AMBIENT = 110;     // cap on stream zombies alive at once
const MAX_TEXTS = 36;
const NUM_FONT = '"Saira Condensed", "Arial Narrow", sans-serif';
/** A Sniper headshot on a boss (which can't be killed outright) hits for this many times the shot's damage. */
const BOSS_HEADSHOT = 10;
const MAX_PARTS = 700;
/** Safety caps for soft lights and flame puffs (drawn at half resolution, so these are generous). */
const MAX_GLOWS = 90;
const MAX_FIRE = 420;
/** Soft additive effects (lights, fire, flames) are drawn into a buffer at 1/LO_DIV resolution, then added over the scene in one
 * pass: they're blurry glows anyway, so they look the same at a quarter of the drawing cost. */
const LO_DIV = 2;
const isLo = (k: string) => k === 'glow' || k === 'fire' || k === 'flame';
/** The dusk grade per battleground (multiplied over the scene; lights are added on top). */
const GRADE: Record<GroundTheme, number> = { street: 0x8f96b4, chem: 0x8fae9c, swamp: 0x8fa088, badlands: 0xb4a088, hive: 0xa090b8, neon: 0x948cc4, scrapyard: 0xa89888 };
const INTRO_SEC = 1.4;
const STUCK_SEC = 20;          // seconds of a swamped shredder before offering a roll-back

type Phase = 'stream' | 'intro' | 'horde' | 'end';
interface Zombie {
  strain: ZombieId; variety: VarietyId; special: SpecialId | null; announced: boolean; tier: number; lnHp: number; hp: number; p: number; l: number; speed: number; horde: boolean; boss: boolean; atWall: boolean; slow: number; burn: number; vuln?: number; ult?: boolean;
  shredded?: boolean;  // killed by the shredder: no DNA (only the squad's kills pay)
  flash: number; phase: number; alive: boolean; sprite?: Phaser.GameObjects.Sprite;
  back?: number;       // drawing only: art px pushed back up the road so a pile at the shredder forms a visible queue
  bossKind?: M.BossKind; look?: ZombieId; scale?: number; tint?: number;
  armour?: number;     // Iron Juggernaut: armour left (in HP units); it takes half damage until it breaks
  fog?: boolean;       // Fog March: hidden (and can't be shot) until halfway down the road
  air?: number;        // Leaper: >0 while in the air (can't be hit); hop timer and lift
  hopT?: number; spawnT?: number; stepT?: number;
}
interface Shooter { body: Phaser.GameObjects.Sprite; gun: Phaser.GameObjects.Image; flash: Phaser.GameObjects.Image; cls: ClassId; cd: number; recoil: number; flashT: number; aim: number;
  /** A new hire: waits `wait` s, then runs in from the left edge (`run` 0→1) before taking position and firing. */
  wait?: number; run?: number; hop?: number }
interface FloatText { obj: Phaser.GameObjects.Text; t: number; vy: number; style?: string }
interface Crate { img: Phaser.GameObjects.Image; t: number; color: number }
/** A pooled effect particle (positions and speeds in device px). */
interface Part { img?: Phaser.GameObjects.Image; kind: 'fire' | 'flame' | 'smoke' | 'spark' | 'blood' | 'glow' | 'gas' | 'debris'; x: number; y: number; vx: number; vy: number; z: number; vz: number;
  t: number; life: number; s0: number; s1: number; a: number; damp: number; rise: number; v: number; tint: number; landed?: boolean }
interface Tracer { x1: number; y1: number; x2: number; y2: number; t: number; life: number; w: number; col: number }
interface Ring { x: number; y: number; t: number; life: number; r: number }

const hex = (css: string) => Number.parseInt(css.slice(1), 16);
/** Range-line colour per unit type. */
const RANGE_COLOR: Record<ClassId, number> = {
  pistol: 0xf2f2f2, bow: 0x7ddc5a, shotgun: 0xff9a3c, rifle: 0x4aa3ff, sniper: 0x7fe8ff, flamer: 0xff5a5a, grenade: 0xd8c46a,
  mg: 0xc0c8d0, drone: 0x4ad6c8, rail: 0x5a8cff, mortar: 0xb08850, tesla: 0x9a8aff,
};

const ULT_Z_TINT: Partial<Record<string, number>> = Object.fromEntries(M.COLOURS.map((c) => [c, Phaser.Display.Color.HexStringToColor(M.strainById(c).color).color]));
const ULT_TINT = (u: M.Unit) => (u.evo === undefined ? 0xffffff : Phaser.Display.Color.HexStringToColor(M.ULTS[u.cls][u.evo].color).color);

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
  /** Drone Operators' drones: each soldier has one that hovers over the road, drifts toward its target and fires. */
  private drones = new Map<Shooter, { img: Phaser.GameObjects.Image; x: number; y: number; hx: number; hy: number; tx: number; ty: number; aim: number; seed: number }>();
  private texts: FloatText[] = [];
  /** The boss's health bar, pinned under the horde status line so it's never lost in the crowd. */
  private bossBar!: Phaser.GameObjects.Graphics;
  private bossTrail = 1;
  private dpr = 1;
  private crates: Crate[] = [];
  private pools = new Map<string, Phaser.GameObjects.Image[]>();
  private textCd = 0;
  private critCd = 0;
  /** True from a horde's start until the stream (paused for the horde) gets its first kill again. */
  private awaitStream = false;
  private autoT = 0;
  // the rooftop-siege look: decals that stay on the ground, a dusk grade, live lights, particles, tracers, shadows
  private decals?: Phaser.GameObjects.RenderTexture;
  private stamp!: Phaser.GameObjects.Image;
  private stamps = 0;
  private dusk!: Phaser.GameObjects.Rectangle;
  private shadows!: Phaser.GameObjects.Graphics;
  private glowG!: Phaser.GameObjects.Graphics;
  private parts: Part[] = [];
  private tracers: Tracer[] = [];
  private rings: Ring[] = [];
  /** Decal stamps queued this frame; drawn into the decal layer in one batch (one render-target pass, not one per splat). */
  private stampQ: [string, number, number, number, number, number, number][] = [];

  private phase: Phase = 'stream';
  private phaseT = 0;
  private zombies: Zombie[] = [];
  private spawnTimers = new Map<ZombieId, number>();
  private horde = { k: 0, queue: [] as Zombie[], t: 0, spawnT: 0, breaches: 0, bossThrough: false, kind: 'classic' as M.HordeKind, spawned: 0 };
  private hordeText!: Phaser.GameObjects.Text;
  private ready = false;

  constructor() { super('battle'); }

  create() {
    for (const [key, canvas] of Object.entries(buildArt().canvases)) if (!this.textures.exists(key)) this.textures.addCanvas(key, canvas);
    for (const [key, canvas] of Object.entries(fxTextures())) if (!this.textures.exists(key)) this.textures.addCanvas(key, canvas);
    this.stamp = this.make.image({ key: 'fx-blood0', add: false });
    this.shadows = this.add.graphics().setDepth(1.5);
    this.dusk = this.add.rectangle(0, 0, 8, 8, GRADE.street).setOrigin(0, 0).setDepth(8500).setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.glowG = this.add.graphics().setDepth(8700).setBlendMode(Phaser.BlendModes.ADD);
    this.housing = this.add.tileSprite(0, 0, 16 * RES, 16 * RES, 'shred-housing').setOrigin(0, 0).setDepth(2);
    this.teeth = this.add.tileSprite(0, 0, 10 * RES, 16 * RES, 'shred-teeth').setOrigin(0, 0).setDepth(2);
    this.capTop = this.add.image(0, 0, 'shred-cap').setOrigin(0, 0).setDepth(3);
    this.capBot = this.add.image(0, 0, 'shred-cap').setOrigin(0, 1).setDepth(3);
    for (const o of [this.housing, this.teeth, this.capTop, this.capBot]) o.setVisible(false);
    this.fx = this.add.graphics().setDepth(9000);
    this.gibs = this.add.particles(0, 0, 'pix', {
      emitting: false, lifespan: { min: 300, max: 700 }, speed: { min: 50, max: 220 }, angle: { min: 200, max: 340 },
      gravityY: 800, alpha: { start: 1, end: 0 }, scale: { start: 1, end: 0.4 },
    }).setDepth(8000);
    const tx = { fontFamily: FONT, color: '#ffffff', stroke: '#140c1c' };
    this.banner = this.add.text(0, 0, '', tx).setOrigin(0.5).setDepth(9500).setAlpha(0);
    this.sub = this.add.text(0, 0, '', tx).setOrigin(0.5).setDepth(9500).setAlpha(0);
    this.bossBar = this.add.graphics().setDepth(9550);
    this.hordeText = this.add.text(0, 0, '', { fontFamily: FONT, color: '#ffd34d', stroke: '#140c1c' }).setOrigin(0, 0).setDepth(9500).setVisible(false);
    game.on((evt, data) => {
      if (evt === 'horde-start' && this.phase === 'stream') this.startHorde();
      if (evt === 'reset') { this.clearZombies(); this.setPhase('stream'); this.relayout(); }
      if (evt === 'horde-won') this.newGround = true;
      if (evt === 'unit-evolve') this.evolveFx(data as ClassId);   // the map changes to the next boss's battleground once the dust settles
    });
    this.ready = true;
    this.relayout();
  }

  resizeField(cssW: number, cssH: number, dpr: number) {
    this.dpr = dpr;
    this.W = Math.max(1, Math.round(cssW * dpr));
    this.H = Math.max(1, Math.round(cssH * dpr));
    this.scale.resize(this.W, this.H);
    if (this.ready) this.relayout();
  }

  // ---------- layout ----------
  private newGround = false;
  /** The battleground matches the boss of the next horde. */
  private theme(): GroundTheme { return M.BOSSES[M.hordeDef(game.nextHorde).boss].ground as GroundTheme; }
  private relayout() {
    this.px = Math.max(1, Math.min(8, Math.min(this.W, Math.max(this.H, this.W * 0.55)) / ART_SHORT_SIDE));
    const px = this.px;
    this.AW = Math.ceil(this.W / px);
    this.AH = Math.ceil(this.H / px);
    const bunkerRight = Math.max(44, Math.round(this.AW * 0.16));
    const roadTop = Math.round(this.AH * 0.1), roadBot = Math.round(this.AH * 0.96);
    this.lay = { bunkerRight, shredX: bunkerRight + 1, stopX: bunkerRight + 36, spawnX: this.AW + 16, laneTop: roadTop + 26, laneBot: roadBot - 2, roadTop, roadBot };
    const theme = this.theme();
    const key = `ground-${theme}-${this.AW}x${this.AH}@${px.toFixed(3)}`;
    if (key !== this.groundKey) {
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawCity({ w: this.AW, h: this.AH, roadTop, roadBot, bunkerRight: bunkerRight - 1 }, px, theme));
      const old = this.groundKey;
      if (this.ground) this.ground.setTexture(key); else this.ground = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0);
      this.groundKey = key;
      if (old && old !== key && this.textures.exists(old)) this.textures.remove(old);
      this.newDecals();   // a new battleground starts clean
    }
    this.dusk.setSize(this.W, this.H).setFillStyle(GRADE[theme] ?? GRADE.street);
    if (!this.decals || this.decals.width !== this.W || this.decals.height !== this.H) this.newDecals();
    if (!this.lo || this.lo.width !== Math.ceil(this.W / LO_DIV) || this.lo.height !== Math.ceil(this.H / LO_DIV)) this.newLo();
    this.ground!.setScale(1);
    const sx = this.lay.shredX * px;
    const S = this.S;
    this.housing.setPosition(sx, 0).setSize(16 * RES, this.AH * RES).setScale(S);
    this.teeth.setPosition(sx + 16 * px, 0).setSize(10 * RES, this.AH * RES).setScale(S);
    this.capTop.setPosition(sx - 2 * px, 0).setScale(S, S * 2);
    this.capBot.setPosition(sx - 2 * px, this.H).setScale(S, S * 2);
    for (const s of this.shooters.values()) { s.body.setScale(S); s.gun.setScale(S); s.flash.setScale(S); }
    this.gibs.setParticleScale(S * 1.4);
    this.banner.setFontSize(Math.min(px * 20, this.W / 9)).setStroke('#140c1c', px * 2.6);
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
      speed: (boss ? C.bossSpeed : M.strainById(strain).speed * (sp?.speed ?? 1) * (0.85 + Math.random() * 0.3) * (horde ? 1.3 : 1)) * M.live.speedMult / C.walkSec,   // every boss walks at the same pace
      flash: -1, phase: Math.random() * 4, alive: true,
    };
  }

  private startHorde() {
    const k = game.nextHorde;
    const h = M.hordeDef(k);
    const mix = M.hordeMix(k), kd = M.HORDE_KINDS[h.kind], bd = M.BOSSES[h.boss];
    const queue = Array.from({ length: kd.count }, (_, i) => {
      const medic = h.kind === 'hospital' && i % 10 === 4;   // 6 medics spread through the horde
      const zs = mix[Math.floor(Math.random() * mix.length)];
      const z = this.makeZombie(zs, M.hordeDial(zs, h.tier), 0, true, false, h.kind === 'armoured' ? 'armored' : medic ? 'medic' : null);
      z.lnHp += Math.log(kd.hp) - (z.special ? Math.log(M.specialById(z.special).hp) : 0);   // the kind sets the HP, not the special
      z.speed *= kd.speed;
      if (h.kind === 'fog') z.fog = true;
      z.announced = true;   // no pop-up for every armoured zombie / medic
      return z;
    });
    // the boss comes last: kill it before it reaches the shredder to win
    const boss = this.makeZombie(M.hordeBoss(k), M.hordeDial(M.hordeBoss(k), h.tier), 0, true, true);
    boss.bossKind = h.boss; boss.look = bd.look; boss.scale = bd.scale; boss.tint = bd.tint;
    boss.lnHp += Math.log(bd.hp); boss.speed *= bd.speed;
    if (h.boss === 'juggernaut') boss.armour = 0.6 / bd.hp;      // armour pool on top of HP (in units of the boss's HP)
    if (h.boss === 'leaper') { boss.hopT = 1.2; boss.air = 0; }
    if (h.boss === 'brood') boss.spawnT = 2.5;
    queue.push(boss);
    this.horde = { k, t: 0, spawnT: 0, queue, breaches: 0, bossThrough: false, kind: h.kind, spawned: 0 };
    this.showBanner('WARNING', 'HORDE INCOMING', 'warn', INTRO_SEC * 1000 - 300);
    this.cameras.main.flash(250, 255, 40, 40);
    sfx.hordeStart();
    this.setPhase('intro');
  }

  /** Big arcade-style banner: pops in (scale 1.7 → 1), coloured by mood, then fades. */
  private showBanner(text: string, sub = '', mood: 'info' | 'warn' | 'win' | 'lose' = 'info', hold = 1300) {
    const y = Math.round(this.lay.roadTop * this.px + 26 * this.px);
    const col = mood === 'warn' || mood === 'lose' ? '#ff5a5a' : mood === 'win' ? '#ffd34d' : '#ffffff';
    // big but always fits: ~1/8 of the field wide per line, shrunk for long names
    const room = (this.W - this.lay.shredX * this.px) * 0.9, base = Math.max(this.px * 12, this.W / 8);
    this.banner.setFontSize(base).setText(text);
    if (this.banner.width > room) this.banner.setFontSize(Math.floor(base * room / this.banner.width));
    this.sub.setFontSize(Math.max(this.px * 7, base * 0.3)).setText(sub);
    if (this.sub.width > room) this.sub.setFontSize(Math.floor(Math.max(this.px * 7, base * 0.3) * room / this.sub.width));
    const cx = Math.round((this.lay.shredX * this.px + this.W) / 2);
    this.banner.setText(text).setColor(col).setShadow(0, Math.round(this.px * 1.6), '#2a0a14', 0, true, true).setPosition(cx, y + this.banner.height * 0.2).setAlpha(1).setScale(1.7);
    this.sub.setText(sub).setColor('#ffffff').setPosition(cx, y + this.banner.height * 0.75 + this.sub.height * 0.5).setAlpha(sub ? 1 : 0).setScale(1);
    this.tweens.killTweensOf([this.banner, this.sub]);
    this.tweens.add({ targets: this.banner, scale: 1, duration: 170, ease: 'Back.easeOut' });
    this.tweens.add({ targets: [this.banner, this.sub], alpha: 0, delay: hold, duration: 400 });
  }

  update(_t: number, deltaMs: number) {
    if (titleUp() || overlayUp() || coachUp()) { this.tickShooters(0); this.drawFx(); return; }   // paused behind the start screen, unlock cards or a tutorial step   // paused behind the start screen (soldiers placed, nothing moves)
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
          if (ambient < MAX_AMBIENT) {
            const z = this.makeZombie(sid, x.tier, x.spawn, false, false, M.rollSpecial(Math.random), M.rollVariety(x.tier, Math.random));
            if (x.ult) { z.ult = true; z.lnHp += Math.log(C.zUltHp); z.scale = 1.18 * (1 + 0.12 * z.variety); }   // ultimate form: ×2 HP (and ×2 DNA when killed), bigger
            this.zombies.push(z);
          }
        }
        this.spawnTimers.set(sid, t);
      }
      if (this.phase === 'end' && this.phaseT > 1.5) {
        this.setPhase('stream');
        if (this.newGround) {
          // scene change: push in and fade to black, swap the battleground, then settle back out of the dark
          this.newGround = false;
          const cam = this.cameras.main, bd = M.BOSSES[M.hordeDef(game.nextHorde).boss];
          if (skipAnims()) { this.relayout(); this.showBanner(bd.place.toUpperCase(), `NEXT BOSS: ${bd.name.toUpperCase()}`, 'info', 1600); }   // no fade: swap straight away
          else {
          cam.zoomTo(1.12, 520, 'Quad.easeIn');
          cam.fadeOut(520, 0, 0, 0);
          cam.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
            this.relayout();
            cam.setZoom(1.08); cam.zoomTo(1, 900, 'Quad.easeOut');
            cam.fadeIn(700, 0, 0, 0);
            this.time.delayedCall(250, () => this.showBanner(bd.place.toUpperCase(), `NEW BATTLEGROUND · NEXT BOSS: ${bd.name.toUpperCase()}`, 'info', 2200));
          });
          }
        }
      }
    } else if (this.phase === 'intro') {
      if (this.phaseT >= INTRO_SEC) {
        this.setPhase('horde');
        const h = M.hordeDef(this.horde.k);
        this.showBanner(h.name.toUpperCase(), `${M.HORDE_KINDS[h.kind].name.toUpperCase()} · BOSS: ${M.BOSSES[h.boss].name.toUpperCase()}`);
      }
    } else if (this.phase === 'horde') {
      const h = this.horde;
      h.t += dt;
      h.spawnT -= dt;
      const kd = M.HORDE_KINDS[h.kind];
      while (h.queue.length && h.spawnT <= 0) {
        h.spawnT += 1 / kd.perSec;
        const z = h.queue.shift()!;
        h.spawned++;
        // Waves: a breather after each wave
        if (kd.waves && !z.boss && h.spawned % Math.ceil(kd.count / kd.waves) === 0 && h.spawned < kd.count) { h.spawnT += kd.gap ?? 0; this.showBanner(`WAVE ${Math.round(h.spawned / Math.ceil(kd.count / kd.waves)) + 1} INCOMING`, ''); }
        if (z.boss) { const bd = M.BOSSES[z.bossKind!]; this.showBanner(bd.name.toUpperCase(), bd.desc.toUpperCase(), 'warn', 1800); this.cameras.main.flash(200, 255, 60, 60); sfx.hordeStart(); if (z.bossKind === 'titan') this.cameras.main.shake(400, 0.006); }
        this.zombies.push(z);
      }
      // you lose if the boss reaches the shredder, or if 10 horde zombies get to it
      const lost = h.bossThrough ? 'THE BOSS REACHED THE SHREDDER' : h.breaches >= C.breachLimit ? `${C.breachLimit} ZOMBIES REACHED THE SHREDDER` : '';
      if (!lost && !h.queue.length && !this.zombies.some((z) => z.alive && z.horde)) {
        this.showBanner('VICTORY!', M.hordeDef(h.k).unlocks.toUpperCase(), 'win', 1600);
        this.cameras.main.flash(350, 255, 220, 90); this.cameras.main.shake(250, 0.006);
        sfx.hordeWon();
        game.hordeWon(h.k);
        this.setPhase('end');
      } else if (lost) {
        this.showBanner('HORDE LOST', lost, 'lose', 1600);
        this.cameras.main.shake(300, 0.008);
        sfx.hordeLost();
        this.clearZombies(true);
        h.queue = [];
        game.hordeLost(h.k);
        this.setPhase('end');
      }
    }
    game.comboTick(dt);
    // steady income through the horde and until the restarted stream lands its first kill (no lump, no gap)
    if (this.phase !== 'stream' && !this.awaitStream) { this.awaitStream = true; game.steadyCombo = game.comboMultAvg; }
    if (this.awaitStream) game.earnSteady(dt);
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
    const king = this.zombies.some((z) => z.alive && z.bossKind === 'screamer' && z.p > 0);   // Screamer King: the whole horde runs faster
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
        z.slow = z.bossKind === 'titan' ? 0 : Math.max(0, z.slow - dt * 0.5);   // the Titan ignores slows
        const boost = (screamers.some((s) => s !== z && this.dist(z, s) < 0.16) ? 1.4 : 1) * (king && z.horde && !z.boss ? 1.35 : 1);
        const sp = z.speed * (1 - z.slow) * boost;
        if (z.bossKind === 'leaper') this.leap(z, sp, dt);
        else { z.p = Math.min(1, z.p + sp * dt); z.phase += dt * 6 * sp * C.walkSec; }
        if (z.bossKind === 'titan' && z.p > 0 && (z.stepT = (z.stepT ?? 0.9) - dt) <= 0) { z.stepT = 0.9; this.cameras.main.shake(140, 0.004); const [tx, ty] = this.zScreen(z); this.burst(tx, ty, 0x8a7a60, 5); }
        if (z.bossKind === 'brood' && z.p > 0.02 && (z.spawnT = (z.spawnT ?? 2.5) - dt) <= 0) { z.spawnT = 2.5; this.broodSpawn(z, 2, 0.3, 1.2); }
        if (z.burn > 0) { z.burn -= dt; if (z.burn <= 0) z.vuln = 0; if (Math.random() < dt * 14) { const [bx, by] = this.zombieCenter(z); this.part('fire', bx + (Math.random() - 0.5) * 6 * this.px, by + (Math.random() - 0.3) * 10 * this.px, { vy: -24 * this.px, life: 0.3 + Math.random() * 0.2, s0: (3 * this.px) / 48, s1: (6 * this.px) / 48, rise: -8 * this.px }); } }
        if (z.p > 0.6 && Math.random() < dt * 0.15) sfx.groan();
      }
      else if (z.horde) {
        // a horde zombie reached the shredder: a breach (10 lose the horde; the boss getting there loses it at once)
        if (z.boss) this.horde.bossThrough = true;
        else this.horde.breaches++;
        z.alive = false;
        const [x, y] = this.toScreen(1, z.l);
        this.bloodSpray(x - 6 * this.px, y - 10 * this.px, 10, -1);
        // pulled into the blades (not just vanishing)
        const s = z.sprite; z.sprite = undefined;
        if (s) this.tweens.add({ targets: s, x: this.lay.shredX * this.px + 8 * this.px, scaleX: 0.2, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => s.destroy() });
        game.comboBreak(z.strain);
        sfx.grind();
      }
      else {
        if (!z.atWall) { z.atWall = true; game.comboBreak(z.strain); }
        // in the blades: the shredder's damage is shared by every zombie on it, and always takes at least
        // a small share of their HP, so even an overwhelming pile-up dies eventually
        z.phase += dt * 3;
        z.hp -= C.shredFrac * dt;
        z.shredded = true;
        sfx.grind();
        if (Math.random() < dt * 6) { const [x, y] = this.toScreen(1, z.l); this.bloodSpray(x - 6 * this.px, y - 10 * this.px, 3, -1); }
        if (z.hp <= 0) this.kill(z);
      }
    }
  }

  // ---------- squad: soldiers stand at random spots along the wall, each firing for a share of its unit type ----------
  private static readonly VISIBLE_PER_TYPE = 20;   // every soldier is drawn (up to 20 per unit type)
  /** Soldier sprite scale (shrinks a little when the wall gets crowded). */
  private crowd = 1;
  private spots = new Map<string, number>();   // soldier key → random sort key (where along the wall it stands)

  private squadSynced = false;
  private arrivals = 0;
  private syncShooters() {
    const want = new Set<string>();
    for (const u of game.owned) for (let k = 0; k < Math.min(u.count, BattleScene.VISIBLE_PER_TYPE); k++) want.add(`${u.cls}-${k}`);
    for (const [key, s] of this.shooters) if (!want.has(key)) { s.body.destroy(); s.gun.destroy(); s.flash.destroy(); this.drones.get(s)?.img.destroy(); this.drones.delete(s); this.shooters.delete(key); this.spots.delete(key); }
    if (this.squadSynced && ![...this.shooters.values()].some((s) => s.wait !== undefined)) this.arrivals = 0;
    for (const key of want) {
      if (this.shooters.has(key)) continue;
      const cls = key.split('-')[0] as ClassId;
      this.spots.set(key, Math.random());
      this.shooters.set(key, {
        body: this.add.sprite(0, 0, `hero-${cls}-0`).setOrigin(0.5, 1).setScale(this.S),
        gun: this.add.image(0, 0, `gun-${cls}`).setOrigin(3 / GUN_W, 6 / GUN_H).setScale(this.S),
        flash: this.add.image(0, 0, 'muzzle').setVisible(false).setScale(this.S).setBlendMode(Phaser.BlendModes.ADD),
        cls, cd: Math.random() * 0.5, recoil: 0, flashT: 0, aim: 0,
        // soldiers there when the game loads are already in place; new hires arrive after a beat, staggered if several
        ...(this.squadSynced ? { wait: 0.35 + this.arrivals++ * 0.18, run: 0 } : {}),
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
    this.squadSynced = true;
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
        let [fx, fy] = this.wallFeet(i, n, key);
        let bob = Math.floor(this.time.now / 450 + i) % 2;
        let arriving = false;
        if (s.wait !== undefined) {
          // a new hire: a short beat, then a sprint in from the left edge with dust, a little hop on arrival
          arriving = true;
          if (s.wait > 0) { s.wait -= dt; s.body.setVisible(false); s.gun.setVisible(false); s.flash.setVisible(false); continue; }
          s.body.setVisible(true);
          s.run = Math.min(1, (s.run ?? 0) + dt / 0.85);
          const e = 1 - (1 - s.run) ** 3, startX = -14 * px;
          fx = startX + (fx - startX) * e;
          bob = Math.floor(this.time.now / 90) % 2;
          fy -= s.run < 1 ? Math.abs(Math.sin(s.run * 18)) * 1.6 * px : 0;
          if (Math.random() < dt * 22) this.part('smoke', fx - 3 * px, fy, { vx: -20 * px, vy: -6 * px, life: 0.45, s0: (2 * px) / 56, s1: (6 * px) / 56, a: 0.5, v: 1 });
          if (s.run >= 1) { s.wait = undefined; s.run = undefined; s.hop = 0.24; this.light(fx, fy - 10 * px, 18, 0xfff0c0, 0.4, 0.2); }
        }
        if (s.hop !== undefined) { fy -= Math.sin((1 - s.hop / 0.24) * Math.PI) * 4 * px; s.hop -= dt; if (s.hop <= 0) s.hop = undefined; }
        s.body.setTexture(`hero-${u.cls}-${bob}`).setPosition(fx, fy).setDepth(fy).setScale(sc);
        s.recoil = Math.max(0, s.recoil - dt * 30);
        const gx = fx + ((HERO_GRIP.x - HERO_W / 2) * px - Math.cos(s.aim) * s.recoil * px) * cs;
        const gy = fy - ((HERO_H - HERO_GRIP.y) * px + bob * px) * cs;
        const gk = u.evo === undefined ? `gun-${u.cls}` : `gun-${u.cls}-u${u.evo}`;
        if (s.gun.texture.key !== gk) s.gun.setTexture(gk);
        s.gun.setVisible(!!gun).setPosition(Math.round(gx), Math.round(gy)).setRotation(s.aim).setDepth(fy + 1).setScale(sc);
        if (u.evo !== undefined && !arriving && Math.random() < dt * 1.5) this.light(fx, fy - 6 * px, 14, ULT_TINT(u), 0.3, 0.6);   // an ultimate form glows softly in its track's colour
        s.flash.setScale(sc);
        s.flashT -= dt;
        s.flash.setVisible(s.flashT > 0);
        if (s.flashT > 0) { const [mx, my] = this.muzzle(s); s.flash.setPosition(mx, my).setDepth(fy + 2); }
        if (u.cls === 'drone') this.tickDrone(s, fx, fy, dt, arriving || !gun);
        if (gun && !arriving) this.fire(u, gun, s, visible, dt);
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
    // drawn shots per unit type per second (damage is unaffected): big single shots and flames fewer, so the road stays readable and fast
    const cap = r.cls === 'rail' || r.cls === 'sniper' ? 8 : r.cls === 'flamer' ? 30 : 40;
    const rate = Math.min(8, groupShots / visible, cap / visible);
    // each drawn shot stands for this many real shots: abilities that roll per shot (Headshot) roll for all of them
    const perDrawn = Math.max(1, groupShots / Math.max(1e-6, rate * visible));
    const execChance = ab.execute ? Math.min(0.97, 1 - Math.pow(1 - ab.execute, perDrawn)) : 0;
    s.cd -= dt;
    while (s.cd <= 0) {
      s.cd += 1 / rate;
      // target: the zombie closest to the shredder within range (horde zombies first during a horde)
      let target: Zombie | undefined, best = -Infinity;
      for (const z of this.zombies) {
        if (!z.alive || z.p < Math.max(0.02, 1 - st.range) || !this.hittable(z)) continue;
        const score = z.p + (z.horde ? 1 : 0) + Math.log(M.matchMult(e, z.strain, game.fx)) * 0.3;
        if (score > best) { best = score; target = z; }
      }
      if (!target) { s.cd = Math.max(s.cd, 0.05); return; }
      const crit = Math.random() < st.crit;
      // this soldier's share of the group's DPS, per shot (expected value matches the model; crits carry the multiplier)
      const lnShot = st.lnDps + Math.log(M.unitPower(r.count) / visible) - Math.log(rate) - Math.log(1 + st.crit * (st.critDmg - 1)) + (crit ? Math.log(st.critDmg) : 0)
        - (st.ult?.vuln ? Math.log(1 + st.ult.vuln * 0.5) : 0);   // the model counts fire vulnerability as an average; here it lands on burning zombies
      // extra targets: the nearest other zombies to the main target (pierce, spread, splash)
      const hits = [target, ...this.zombies.filter((z) => z.alive && z !== target && z.p >= 1 - st.range && this.hittable(z))
        .sort((a, b) => this.dist(a, target!) - this.dist(b, target!)).slice(0, Math.max(0, st.targets - 1))
        .filter((z) => this.dist(z, target!) < (st.ult?.hit === 'splash' ? 0.14 : 0.25))];
      this.shoot(s, r.cls, hits, r.evo);
      for (const z of hits) {
        if (!z.alive) continue;
        if (st.ult?.burn) { z.burn = Math.max(z.burn, st.ult.burn); z.vuln = Math.max(z.vuln ?? 0, st.ult.vuln ?? 0); }
        // Headshot's value is counted in the unit's DPS as an average; here it lands as real instant kills instead, so
        // normal zombies take the plain damage plus the kill chance; bosses can't be killed outright, so a headshot on a
        // boss deals 10× that shot's damage instead
        let ln = lnShot + Math.log(M.matchMult(e, z.strain, game.fx)) - (ab.execute ? Math.log(ab.dmg) : 0) + (z.burn > 0 && z.vuln ? Math.log(1 + z.vuln) : 0);
        // abilities: knockback, slow, napalm, headshot execute
        if (ab.knockback && !z.boss) z.p = Math.max(0, z.p - ab.knockback);   // bosses can't be pushed back
        if (ab.slow) z.slow = Math.max(z.slow, ab.slow);
        if (r.cls === 'flamer' && M.abilityStage(r)) z.burn = 1.5;
        if (execChance && !z.boss && z.alive && Math.random() < execChance) {   // any zombie but a boss, horde zombies included
          const [hx, hy] = this.zombieCenter(z);
          this.floatText('HEADSHOT', hx, hy - 30 * this.px, true); game.headshot();
          this.skullPop(hx, hy - 4 * this.px);
          this.damage(z, z.hp + 1, '', false);
          continue;
        }
        if (ab.execute && z.boss) {
          // this drawn shot stands for `perDrawn` real shots: each has the Headshot chance to hit for ×10
          const want = perDrawn * ab.execute, procs = Math.floor(want) + (Math.random() < want - Math.floor(want) ? 1 : 0);
          if (procs > 0) {
            ln += Math.log(1 + (BOSS_HEADSHOT - 1) * Math.min(procs, perDrawn) / perDrawn);
            const [hx, hy] = this.zombieCenter(z);
            this.floatText(`HEADSHOT ×${BOSS_HEADSHOT}`, hx, hy - 34 * this.px, true); game.headshot();
            this.skullPop(hx, hy - 8 * this.px);
            this.damage(z, Math.exp(Math.min(700, ln - z.lnHp)), '', true);
            continue;
          }
        }
        this.damage(z, Math.exp(Math.min(700, ln - z.lnHp)), z === target ? fmtLn(ln) : '', crit);
      }
    }
  }
  /** Leaper: how high it is in its leap (art px). */
  private lift(z: Zombie) { return z.air && z.air > 0 ? Math.sin(Math.PI * (1 - z.air / 0.8)) * 34 : 0; }
  /** Can the squad shoot this zombie right now? (not while a Leaper is in the air, or a Fog March zombie is hidden) */
  private hittable(z: Zombie) { return !(z.air && z.air > 0) && !(z.fog && z.p < 0.5); }
  /** Leaper: crouch (can be shot), then a long leap (can't), averaging its walking speed. */
  private leap(z: Zombie, sp: number, dt: number) {
    const CROUCH = 1.6, AIR = 0.8;
    if (z.air && z.air > 0) {
      z.air -= dt;
      z.p = Math.min(1, z.p + (sp * (CROUCH + AIR) / AIR) * dt);
      if (z.air <= 0) { z.air = 0; z.hopT = CROUCH; const [lx, ly] = this.zScreen(z); this.burst(lx, ly, 0x8a7a60, 12); this.cameras.main.shake(160, 0.006); sfx.boom(); }
    } else {
      z.hopT = (z.hopT ?? CROUCH) - dt;
      if (z.p <= 0) z.p = Math.min(1, z.p + sp * dt);   // walk onto the road first
      else if (z.hopT <= 0) z.air = AIR;
    }
  }
  /** Brood Mother / Giant Exploder: small, fast zombies appear around the boss and join the horde. */
  private broodSpawn(boss: Zombie, n: number, hpFrac: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const c = this.makeZombie('crawler', boss.tier, 0, true);
      c.lnHp = boss.lnHp - Math.log(C.bossHpMult) - Math.log(M.BOSSES[boss.bossKind!].hp) + Math.log(hpFrac);
      c.p = Math.max(0, boss.p - 0.02 + (Math.random() - 0.5) * 0.06); c.l = Math.max(-1, Math.min(1, boss.l + (Math.random() - 0.5) * 1.4));
      c.speed = (M.strainById('crawler').speed * speed) / C.walkSec;
      this.zombies.push(c);
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
    if (z.armour && z.armour > 0) {
      // Iron Juggernaut: the armour soaks hits at half effect until it breaks; the rest goes to HP
      z.armour -= frac * 0.5;
      if (z.armour > 0) frac = 0;
      else {
        frac = -z.armour * 2; z.armour = 0;
        const [ax, ay] = this.zombieCenter(z);
        this.floatText('ARMOUR BROKEN!', ax, ay - 30 * this.px, true); this.burst(ax, ay, 0xa8b4c8, 18); sfx.boom(); this.cameras.main.shake(200, 0.005);
      }
    }
    z.hp -= frac;
    if (z.flash <= -0.12) z.flash = 0.05;
    if (label && (this.textCd <= 0 || (crit && this.critCd <= 0))) {
      if (crit) this.critCd = 0.12; else this.textCd = 0.2;
      const [x, y] = this.zombieCenter(z);
      this.floatText(crit ? `${label}!` : label, x, y - 14 * this.px, crit);
    }
    if (z.hp <= 0 && z.alive) this.kill(z);
  }

  private kill(z: Zombie) {
    z.alive = false;
    if (z.boss && !z.shredded) game.bossKilled();
    const [x, y] = this.zombieCenter(z);
    const [fx0, fy0] = this.zScreen(z);
    this.bloodSpray(x, y, z.boss ? 18 : 8);
    for (let i = 0; i < (z.boss ? 6 : 2); i++) this.stampAt(`fx-blood${Math.floor(Math.random() * 3)}`, fx0 + (Math.random() - 0.5) * 14 * this.px, fy0 - Math.random() * 3 * this.px, (this.px / 2) * (z.boss ? 1.6 : 0.8), 0.85);
    const s = z.sprite;
    if (s) {
      z.sprite = undefined;
      // the body stays on the street (stamped into the decal layer, darkened), while the sprite topples and fades
      if (!z.shredded) this.stampAt(s.texture.key, fx0, fy0 - 4 * this.px * s.scaleY / this.S, s.scaleX, 0.85, Math.random() < 0.5 ? 90 : -90, 0x8a7c74);
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
        this.explode(x, y + 10 * this.px, 0.9);
        sfx.boom();
        for (const n of this.zombies) if (n.alive && n !== z && this.dist(n, z) < 0.13) this.damage(n, 0.6, '', false);
      }
    }
    if (z.boss && z.bossKind !== 'exploder') this.explode(x, y + 12 * this.px, 1.6);   // every boss goes out with a bang
    if (z.bossKind === 'exploder') {
      this.explode(x, y + 14 * this.px, 2.2);
      sfx.boom(); this.cameras.main.shake(350, 0.01);
      this.floatText('IT BURST!', x, y - 30 * this.px, true);
      this.broodSpawn(z, 10, 0.3, 1.7);
    }
    if (!z.horde && this.phase === 'stream' && !z.shredded) this.awaitStream = false;
    const vm = M.VARIETIES[z.variety].dna;
    // horde zombies pay DNA at YOUR tier, not the horde's (a tier-30 horde shouldn't hand a tier-10 player a fortune)
    // only the squad's stream kills pay: horde kills pay nothing (you earn steady income instead, game.earnSteady) and
    // the shredder pays nothing
    const loot = game.zombieKilled(z.strain, z.tier, { shredded: !!z.shredded, mult: z.horde || z.shredded ? 0 : (sp?.dna ?? 1) * vm, lootMult: (sp?.loot ?? 1) * (z.variety ? 1.5 * z.variety : 1) });
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

  private shoot(s: Shooter, cls: ClassId, hits: Zombie[], evo?: 0 | 1) {
    const [tx, ty] = this.zombieCenter(hits[0]);
    s.aim = Phaser.Math.Clamp(Math.atan2(ty - s.gun.y, tx - s.gun.x), -0.5, 0.5);
    s.recoil = cls === 'sniper' || cls === 'shotgun' ? 3 : 1.5;
    const [mx, my] = this.muzzle(s);
    const px = this.px;
    sfx.shot(cls);
    if (cls !== 'bow' && cls !== 'drone' && Math.random() < 0.35) this.light(mx, my, 22, 0xffc080, 0.5, 0.05);
    const fly = (key: string, x2: number, y2: number, ms: number, after?: () => void) => {
      const b = this.take(key).setPosition(mx, my).setRotation(Math.atan2(y2 - my, x2 - mx)).setScale(this.S * (key === 'arrow' ? 1.4 : 1)).setBlendMode(key === 'arrow' ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD).setDepth(8600).setAlpha(1);
      this.tweens.add({ targets: b, x: x2, y: y2, duration: ms, onComplete: () => { this.give(b); after?.(); } });
    };
    if (evo !== undefined) this.ultShot(s, cls, evo, hits, mx, my);
    switch (cls) {
      case 'pistol': s.flashT = 0.04; this.tracer(mx, my, tx, ty, 1, 0xffe2b0, 0.08); this.hitFx(tx, ty); break;
      case 'rifle': s.flashT = 0.04; this.tracer(mx, my, tx, ty, 1.1, 0xffd69a, 0.07); this.hitFx(tx, ty); break;
      case 'bow': { const last = this.zombieCenter(hits[hits.length - 1]); fly('arrow', last[0], last[1], 160, () => this.spark(last[0], last[1])); break; }
      case 'shotgun': s.flashT = 0.07; for (const z of hits) { const [x, y] = this.zombieCenter(z); for (let i = 0; i < 3; i++) this.tracer(mx, my, x + (Math.random() - 0.5) * 8 * px, y + (Math.random() - 0.5) * 8 * px, 0.8, 0xffc890, 0.06); this.hitFx(x, y, true); } break;
      case 'sniper': s.flashT = 0.08; this.tracer(mx, my, tx + 40 * px, ty + (ty - my) * 40 * px / Math.max(1, tx - mx), 2, 0xfff6e0, 0.1); this.hitFx(tx, ty, true); this.light(mx, my, 30, 0xffd0a0, 0.6, 0.06); break;
      case 'flamer': this.flame(mx, my, tx + (Math.random() - 0.5) * 8 * px, ty + (Math.random() - 0.5) * 6 * px, 5); break;
      case 'mg': { s.flashT = 0.05; const ex = tx + (Math.random() - 0.5) * 4 * px, ey = ty + (Math.random() - 0.5) * 4 * px; this.tracer(mx, my, ex, ey, 1.1, 0xffc878, 0.06); this.hitFx(ex, ey); break; }
      case 'drone': {
        const dr = this.drones.get(s);
        if (evo === 0 || !dr) {
          // Kamikaze Swarm: an extra drone dives into the target and blows up
          const d = this.take('drone-bot').setPosition(dr?.x ?? mx, dr?.y ?? my).setScale(this.S * 1.8).setDepth(8650).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
          const sx = d.x, sy = d.y;
          this.tweens.add({ targets: d, x: tx, duration: 420, onUpdate: (tw) => { d.y = sy + (ty - sy) * tw.progress - Math.sin(tw.progress * Math.PI) * 24 * px; },
            onComplete: () => { this.give(d); this.hitFx(tx, ty, true); this.light(tx, ty, 26, 0xff8a6a, 0.6, 0.1); } });
          break;
        }
        // the soldier's hovering drone drifts toward the fight and fires a laser bolt from where it is
        dr.tx = tx - 34 * px; dr.ty = ty - 26 * px;
        const col = evo === 1 ? 0xff5ad8 : 0xff6a6a;
        this.tracer(dr.x, dr.y + 2 * px, tx, ty, evo === 1 ? 1.3 : 1.1, col, 0.08);
        this.spark(tx, ty);
        if (Math.random() < 0.4) this.light(dr.x, dr.y, 14, col, 0.5, 0.06);
        break;
      }
      case 'mortar': {
        const sh = this.take('shell').setPosition(mx, my).setScale(this.S * 1.6).setDepth(8650).setAlpha(1).setBlendMode(Phaser.BlendModes.NORMAL);
        this.tweens.add({ targets: sh, x: tx, duration: 700, onUpdate: (tw) => { sh.y = my + (ty - my) * tw.progress - Math.sin(tw.progress * Math.PI) * 70 * px; sh.setRotation(-0.9 + 1.8 * tw.progress); if (Math.random() < 0.5) this.part('smoke', sh.x, sh.y, { life: 0.6 + Math.random() * 0.4, s0: (2.5 * px) / 56, s1: (7 * px) / 56, rise: -6 * px, v: 1, a: 0.6 }); },
          onComplete: () => {
            this.give(sh);
            this.explode(tx, ty + 10 * px, 1.1);
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
        const g = this.take('grenade').setPosition(mx, my).setScale(this.S * 1.3).setDepth(8600).setAlpha(1);
        this.tweens.add({ targets: g, x: tx, duration: 380, onUpdate: (tw) => { g.y = my + (ty - my) * tw.progress - Math.sin(tw.progress * Math.PI) * 30 * px; if (Math.random() < 0.6) this.part('smoke', g.x, g.y, { life: 0.5 + Math.random() * 0.3, s0: (2 * px) / 56, s1: (6 * px) / 56, rise: -6 * px, v: 1, a: 0.55 }); },
          onComplete: () => {
            this.give(g);
            this.explode(tx, ty + 10 * px, 0.75);
            sfx.boom();
          } });
        break;
      }
    }
  }

  /** Extra effects of an ultimate form's shot, on top of the gun's own (track colour, blasts, fire, pierce lines, frost). */
  private ultShot(s: Shooter, cls: ClassId, evo: 0 | 1, hits: Zombie[], mx: number, my: number) {
    const d = M.ULTS[cls][evo], f = d.fx, col = Phaser.Display.Color.HexStringToColor(d.color).color, px = this.px;
    const pts = hits.map((z) => this.zombieCenter(z));
    const [tx, ty] = pts[0];
    if (f.rate < 1) { s.recoil = 4; this.light(mx, my, 26, col, 0.55, 0.08); }
    if (f.hit === 'pierce') { const far = pts.reduce((a, b) => (b[0] > a[0] ? b : a)); this.tracer(mx, my, far[0] + 24 * px, far[1] + (far[1] - my) * 0.1, 2.2, col, 0.12); }
    else if (f.hit === 'splash') {
      const go = () => { this.explode(tx, ty + 8 * px, cls === 'grenade' || cls === 'mortar' ? 1.25 : 0.6); if (f.burn) for (let i = 0; i < 8; i++) this.part('fire', tx + (Math.random() - 0.5) * 30 * px, ty + (Math.random() - 0.2) * 12 * px, { vy: -30 * px, life: 0.5 + Math.random() * 0.4, s0: (4 * px) / 48, s1: (9 * px) / 48, rise: -10 * px }); };
      if (cls === 'grenade' || cls === 'mortar') this.time.delayedCall(cls === 'mortar' ? 700 : 380, () => this.light(tx, ty, 50, col, 0.7, 0.2));
      else this.time.delayedCall(cls === 'drone' ? 420 : 120, go);
    } else if (f.rate > 1 && cls !== 'flamer') this.tracer(mx, my, tx, ty, 0.9, col, 0.06);
    if (cls === 'flamer' && evo === 1) this.light((mx + tx) / 2, (my + ty) / 2, 60, col, 0.5, 0.08);
    for (const [x, y] of pts) {
      if (f.burn && !f.hit) for (let i = 0; i < 2; i++) this.part('fire', x + (Math.random() - 0.5) * 8 * px, y + (Math.random() - 0.3) * 8 * px, { vy: -26 * px, life: 0.4, s0: (3 * px) / 48, s1: (7 * px) / 48, rise: -8 * px });
      if (f.slow) this.light(x, y, 12, col, 0.6, 0.18);
      if (f.knock) this.light(x, y, 10, 0xffffff, 0.4, 0.06);
    }
  }
  /** A unit type just evolved: every visible soldier of it flares up in its new colour. */
  private evolveFx(cls: ClassId) {
    const u = game.unit(cls);
    if (u.evo === undefined) return;
    const col = ULT_TINT(u), px = this.px;
    for (const [key, s] of this.shooters) {
      if (!key.startsWith(`${cls}-`)) continue;
      const x = s.body.x, y = s.body.y - 8 * px;
      this.light(x, y, 60, col, 0.9, 0.6);
      for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; this.part('spark', x, y, { vx: Math.cos(a) * 70 * px, vy: Math.sin(a) * 50 * px, life: 0.6, s0: 0.5, s1: 0.1, damp: 2 }); }
      s.hop = 0.24;
    }
    this.cameras.main.flash(250, 255, 255, 255, false);
  }

  /** Keep a Drone Operator's drone hovering: it bobs, drifts back toward its station over the road between shots, and
   * eases toward the last target it fired at. */
  private tickDrone(s: Shooter, fx: number, fy: number, dt: number, hidden: boolean) {
    const px = this.px;
    let d = this.drones.get(s);
    const hx = fx + (34 + ((d?.seed ?? Math.random()) * 40)) * px, hy = fy - 30 * px;
    if (!d) { const img = this.add.image(hx, hy, 'drone-bot').setScale(this.S * 1.8).setDepth(8650); d = { img, x: hx, y: hy, hx, hy, tx: hx, ty: hy, aim: 0, seed: Math.random() }; this.drones.set(s, d); }
    d.hx = hx; d.hy = hy;
    if (hidden) { d.img.setVisible(false); d.x = hx; d.y = hy; return; }
    // go part of the way toward the target (they don't leave the squad's side), then ease home
    const gx = d.hx + (d.tx - d.hx) * 0.45, gy = d.hy + (d.ty - d.hy) * 0.45;
    const k = Math.min(1, dt * 3);
    d.x += (gx - d.x) * k; d.y += (gy - d.y) * k;
    d.tx += (d.hx - d.tx) * Math.min(1, dt * 0.8); d.ty += (d.hy - d.ty) * Math.min(1, dt * 0.8);
    const t = this.time.now / 1000 + d.seed * 10;
    d.img.setVisible(true).setPosition(d.x + Math.sin(t * 1.3) * 3 * px, d.y + Math.sin(t * 3.1) * 2.5 * px).setScale(this.S * 1.8 * this.crowd)
      .setRotation(Math.sin(t * 2) * 0.08).setDepth(8650);
  }

  /** A Sniper headshot: a little skull and crossbones rises off the zombie and fades away (pooled, at most a few at once). */
  private skulls = 0;
  private skullPop(x: number, y: number) {
    if (this.skulls >= 10) return;
    this.skulls++;
    const px = this.px, img = this.take('skull').setPosition(x, y).setDepth(9450).setAlpha(0).setScale(this.S * 0.6).setBlendMode(Phaser.BlendModes.NORMAL);
    this.tweens.add({ targets: img, scale: this.S * 1.4, alpha: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: img, y: y - 34 * px, angle: (Math.random() - 0.5) * 24, delay: 120, duration: 1100, ease: 'Sine.easeOut' });
    this.tweens.add({ targets: img, alpha: 0, delay: 750, duration: 500, onComplete: () => { this.give(img); this.skulls--; } });
  }

  // ---------- rooftop-siege effects ----------
  /** The decal layer (blood, bodies, scorch marks) at the field's size. Re-made rather than resized. */
  private newDecals() {
    if (this.decals) { this.tweens.killTweensOf(this.decals); this.decals.destroy(); }   // a running fade must not touch the old layer
    this.decals = this.add.renderTexture(0, 0, this.W, this.H).setOrigin(0, 0).setDepth(1);
    this.stamps = 0; this.stampQ.length = 0;
  }
  private part(kind: Part['kind'], x: number, y: number, o: Partial<Part> = {}) {
    if (kind === 'glow' && this.glows >= MAX_GLOWS) return;
    if ((kind === 'fire' || kind === 'flame') && this.fires >= MAX_FIRE) return;
    // full: background puffs (smoke, gas, debris, lights) are skipped; anything else replaces the oldest particle
    if (this.parts.length >= MAX_PARTS) { if (kind === 'smoke' || kind === 'gas' || kind === 'debris' || kind === 'glow') return; const old = this.parts.shift(); if (old) this.dropPart(old); }
    if (kind === 'glow') this.glows++; else if (kind === 'fire' || kind === 'flame') this.fires++;
    this.parts.push({ kind, x, y, vx: 0, vy: 0, z: 0, vz: 0, t: 0, life: 0.5, s0: 1, s1: 1, a: 1, damp: 0, rise: 0, v: 0, tint: 0xffffff, ...o });
  }
  /** A soft light that brightens everything around it for a moment (drawn over the dusk grade). */
  private light(x: number, y: number, r: number, tint: number, a = 0.8, life = 0.12) { const s = (r * this.px) / 64; this.part('glow', x, y, { s0: s, s1: s * 1.15, a, life, tint }); }
  private stampAt(key: string, x: number, y: number, scale: number, alpha = 1, angle = 0, tint = 0xffffff) {
    if (this.stampQ.length < 120) this.stampQ.push([key, x, y, scale, alpha, angle, tint]);
    if (++this.stamps > 2600) {   // keep the street readable: old gore fades out and the slate is wiped
      this.stamps = 0;
      const d = this.decals;
      if (d) this.tweens.add({ targets: d, alpha: 0, duration: 1400, onComplete: () => { if (d !== this.decals || !d.active) return; d.clear(); d.setAlpha(1); } });   // the layer may have been re-made (screen resized) meanwhile
    }
  }
  private bloodSpray(x: number, y: number, n: number, dir = 1) {
    const px = this.px;
    for (let i = 0; i < n; i++) this.part('blood', x, y, { vx: (Math.random() * 60 + 5) * dir * px, vy: (Math.random() - 0.5) * 40 * px, z: (4 + Math.random() * 6) * px, vz: (20 + Math.random() * 60) * px, life: 0.7, s0: 0.12 + Math.random() * 0.12 });
  }
  /** Fireball, smoke, sparks, debris, a shockwave, a scorch mark, a flash of light and a shake. */
  private explode(x: number, y: number, s = 1) {
    const px = this.px, R = Math.random;
    this.light(x, y, 110 * s, 0xffaa50, 1, 0.5);
    this.part('glow', x, y - 4 * px, { s0: 30 * s * px / 64, s1: 44 * s * px / 64, a: 1, life: 0.12, tint: 0xffffff });
    for (let i = 0; i < 22 * s; i++) { const a = R() * 6.283, v = (25 + R() * 90) * s * px; this.part('fire', x + (R() - 0.5) * 8 * s * px, y - R() * 6 * s * px, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6 - 20 * px, life: 0.45 + R() * 0.5, s0: (9 + R() * 8) * s * px / 48, s1: (15 + R() * 13) * s * px / 48, damp: 3.2, rise: -18 * px }); }
    for (let i = 0; i < 14 * s; i++) { const a = R() * 6.283, v = (15 + R() * 45) * s * px; this.part('smoke', x + (R() - 0.5) * 10 * s * px, y - R() * 8 * s * px, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.5 - 6 * px, t: -0.05 - R() * 0.25, life: 1.4 + R() * 1.6, s0: (12 + R() * 8) * s * px / 56, s1: (30 + R() * 20) * s * px / 56, damp: 1.6, rise: -12 * px, v: Math.floor(R() * 3), a: 0.85 }); }
    for (let i = 0; i < 26 * s; i++) { const a = R() * 6.283, v = (90 + R() * 260) * s * px; this.part('spark', x, y - 4 * px, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55, vz: (30 + R() * 150) * px, life: 0.3 + R() * 0.6 }); }
    for (let i = 0; i < 6 * s; i++) { const a = R() * 6.283, v = (50 + R() * 110) * px; this.part('debris', x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.55, z: 2 * px, vz: (60 + R() * 150) * px, life: 0.6 + R() * 0.5, s0: px * (0.15 + R() * 0.15) }); }
    this.rings.push({ x, y, t: 0, life: 0.42, r: 46 * s * px });
    this.stampAt('fx-scorch', x, y, (0.9 * s * px) / 2, 0.85);
    this.cameras.main.shake(160 + 120 * s, 0.003 * s);
  }
  /** One burst of a flamethrower stream from the muzzle toward a point. */
  private flame(mx: number, my: number, tx: number, ty: number, n = 6) {
    const px = this.px, a = Math.atan2(ty - my, tx - mx), dist = Math.hypot(tx - mx, ty - my), v = Math.max(140, dist * 2.2);
    for (let i = 0; i < n; i++) { const aa = a + (Math.random() - 0.5) * 0.2, vv = v * (0.85 + Math.random() * 0.3); this.part('flame', mx, my, { vx: Math.cos(aa) * vv, vy: Math.sin(aa) * vv, life: 0.42 + Math.random() * 0.16, s0: (2.5 * px) / 48, s1: (17 * px) / 48, damp: 1.4, rise: -24 * px }); }
    this.light((mx + tx) / 2, (my + ty) / 2, 70, 0xff9a40, 0.45, 0.08);
  }
  private tracer(x1: number, y1: number, x2: number, y2: number, w = 1, col = 0xffd69a, life = 0.07) { if (this.tracers.length < 160) this.tracers.push({ x1, y1, x2, y2, t: 0, life, w, col }); }
  /** A bullet hit: a spark, a puff of blood (not every hit, so a machine gun doesn't flood the screen). */
  private hitFx(x: number, y: number, big = false) {
    this.spark(x, y);
    if (big || Math.random() < 0.45) this.bloodSpray(x, y, big ? 6 : 3);
    if (big || Math.random() < 0.15) this.stampAt(`fx-blood${Math.floor(Math.random() * 2)}`, x + (Math.random() - 0.5) * 8 * this.px, y + 12 * this.px, this.px / 2 * 0.7, 0.8);
  }
  private glows = 0;
  private fires = 0;
  private lo?: Phaser.GameObjects.RenderTexture;
  private loPool: Phaser.GameObjects.Image[] = [];
  private loDraw: Phaser.GameObjects.Image[] = [];
  /** Pure additive blending (ONE, ONE) for drawing into the light layer, so overlapping glows build up exactly as on screen. */
  private addBlend = -1;
  private newLo() {
    if (this.addBlend < 0 && this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) { const gl = this.renderer.gl; this.addBlend = this.renderer.addBlendMode([gl.ONE, gl.ONE], gl.FUNC_ADD); }
    this.lo?.destroy();
    this.lo = this.add.renderTexture(0, 0, Math.ceil(this.W / LO_DIV), Math.ceil(this.H / LO_DIV)).setOrigin(0, 0).setDisplaySize(this.W, this.H).setDepth(8560).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
  }
  private dropPart(p: Part) { if (!p.img) return; if (isLo(p.kind)) { p.img.setVisible(false); this.loPool.push(p.img); } else this.give(p.img); p.img = undefined; }
  private tickParts(dt: number) {
    const keep: Part[] = [];
    let glows = 0, fires = 0;
    for (const p of this.parts) if (p.kind === 'glow') glows++; else if (p.kind === 'fire' || p.kind === 'flame') fires++;
    this.glows = glows; this.fires = fires;
    for (const p of this.parts) {
      p.t += dt;
      if (p.t < 0) { keep.push(p); continue; }
      if (p.t >= p.life) { this.dropPart(p); continue; }
      if (p.damp) { const f = Math.exp(-p.damp * dt); p.vx *= f; p.vy *= f; }
      p.x += p.vx * dt; p.y += (p.vy + p.rise) * dt;
      if (p.kind === 'spark' || p.kind === 'blood' || p.kind === 'debris') {
        p.vz -= 520 * this.px * dt; p.z += p.vz * dt;
        if (p.z < 0) {
          p.z = 0;
          if (p.kind === 'blood') { this.stampAt(`fx-blood${Math.floor(Math.random() * 2)}`, p.x, p.y, this.px / 2 * (0.18 + Math.random() * 0.25), 0.7); this.dropPart(p); continue; }
          p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6;
        }
      }
      const f = p.t / p.life;
      if (!p.img) {
        const key = p.kind === 'fire' || p.kind === 'flame' ? 'fx-fire0' : p.kind === 'smoke' ? `fx-smoke${p.v}` : p.kind === 'gas' ? 'fx-gas' : p.kind === 'spark' ? 'fx-spark' : p.kind === 'glow' ? 'fx-glow' : 'pix';
        if (isLo(p.kind)) { const im = this.loPool.pop() ?? this.make.image({ x: 0, y: 0, key }, false); p.img = im.setTexture(key).setVisible(true).setRotation(0); }
        else p.img = this.take(key);
        p.img.setOrigin(0.5);
        const add = p.kind === 'fire' || p.kind === 'flame' || p.kind === 'spark' || p.kind === 'glow';
        p.img.setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
          .setDepth(p.kind === 'smoke' || p.kind === 'gas' ? 8450 : p.kind === 'blood' || p.kind === 'debris' ? 8400 : p.kind === 'glow' ? 8550 : 8600);
        if (p.kind === 'glow') p.img.setTint(p.tint); else if (p.kind === 'blood') p.img.setTint(0x7a0a0a); else if (p.kind === 'debris') p.img.setTint(0x2a2622); else p.img.clearTint();
      }
      const img = p.img;
      const sc = p.s0 + (p.s1 - p.s0) * (p.kind === 'fire' || p.kind === 'flame' ? Math.sqrt(f) : f);
      img.setPosition(p.x, p.y - p.z);
      switch (p.kind) {
        case 'fire': case 'flame': img.setTexture(f < 0.12 ? 'fx-fire0' : f < 0.32 ? 'fx-fire1' : f < 0.6 ? 'fx-fire2' : 'fx-fire3').setScale(sc).setAlpha((p.kind === 'flame' ? 0.8 : 0.95) * (1 - f * f)); break;
        case 'smoke': case 'gas': img.setScale(sc).setAlpha(p.a * Math.min(1, f * 6) * (1 - f)); break;
        case 'spark': img.setScale(((9 * this.px) / 32) * (1 - f * 0.5), this.px / 8).setRotation(Math.atan2(p.vy - p.vz * 0.3, p.vx)).setAlpha(1 - f); break;
        case 'glow': img.setScale(sc).setAlpha(p.a * (1 - f)); break;
        case 'blood': img.setScale(this.px * 0.28 * (1 + p.s0)).setAlpha(1); break;
        case 'debris': img.setScale(p.s0 * 1.6 / 1, p.s0).setRotation(p.t * 9).setAlpha(1 - f); break;
      }
      if (p.kind === 'flame' && f > 0.9 && !p.landed) { p.landed = true; if (Math.random() < 0.25) this.part('smoke', p.x, p.y, { vx: p.vx * 0.2, vy: -8 * this.px, life: 0.9 + Math.random() * 0.6, s0: (6 * this.px) / 56, s1: (16 * this.px) / 56, damp: 1, rise: -12 * this.px, v: 2, a: 0.6 }); if (Math.random() < 0.06) this.stampAt('fx-scorch', p.x, p.y + 6 * this.px, this.px * 0.12, 0.25); }
      if (isLo(p.kind)) { if (this.addBlend >= 0) img.setBlendMode(this.addBlend); img.setPosition(img.x / LO_DIV, img.y / LO_DIV).setScale(img.scaleX / LO_DIV, img.scaleY / LO_DIV); this.loDraw.push(img); }
      keep.push(p);
    }
    this.parts = keep;
    // the half-resolution light/fire layer: black (adds nothing), plus this frame's soft effects, added over the scene
    const lo = this.lo;
    if (lo) {
      lo.setVisible(this.loDraw.length > 0);
      if (this.loDraw.length) { lo.fill(0x000000, 1); lo.beginDraw(); lo.batchDraw(this.loDraw); lo.endDraw(); }
      this.loDraw.length = 0;
    }
    for (const t of this.tracers) t.t += dt;
    this.tracers = this.tracers.filter((t) => t.t < t.life);
    for (const r of this.rings) r.t += dt;
    this.rings = this.rings.filter((r) => r.t < r.life);
    if (this.stampQ.length && this.decals) {
      const tex = this.decals;
      tex.beginDraw();
      for (const [key, x, y, scale, alpha, angle, tint] of this.stampQ) { this.stamp.setTexture(key).setScale(scale).setAlpha(alpha).setAngle(angle).setTint(tint).setPosition(x, y).setOrigin(0.5); tex.batchDraw(this.stamp); }
      tex.endDraw();
      this.stampQ.length = 0;
    }
    // tracers: a short bright dash flying from the muzzle to the target
    const g = this.glowG; g.clear();
    for (const t of this.tracers) {
      const f = t.t / t.life, a = Math.min(1, f * 2.6), b = Math.min(1, f * 2.6 + 0.4);
      g.lineStyle(t.w * this.px * 0.7, t.col, 0.95).lineBetween(t.x1 + (t.x2 - t.x1) * a, t.y1 + (t.y2 - t.y1) * a, t.x1 + (t.x2 - t.x1) * b, t.y1 + (t.y2 - t.y1) * b);
    }
    for (const r of this.rings) { const f = r.t / r.life; g.lineStyle(this.px * (2.4 * (1 - f) + 0.4), 0xffe6be, 0.55 * (1 - f)).strokeEllipse(r.x, r.y, r.r * f * 2, r.r * f * 1.1); }
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
    const want = `${crit ? 1 : 0}@${this.px}`;
    let ft = this.texts.find((t) => t.t <= 0 && t.style === want) ?? this.texts.find((t) => t.t <= 0);
    if (!ft) {
      if (this.texts.length >= MAX_TEXTS) return;
      const obj = this.add.text(0, 0, '', { fontFamily: NUM_FONT, fontStyle: '800', stroke: '#000000' }).setOrigin(0.5).setDepth(9400);
      ft = { obj, t: 0, vy: 0 };
      this.texts.push(ft);
    }
    // damage numbers: condensed white digits with a dark outline; crits are bigger, red, with "!" - each pops in, then rises
    // restyle only when it changes (each style change redraws the text), so a number costs one redraw
    const style = `${crit ? 1 : 0}@${this.px}`;
    if (ft.style !== style) {
      ft.style = style;
      ft.obj.setStyle({ fontFamily: NUM_FONT, fontStyle: '800', color: crit ? '#ff3b30' : '#ffffff', fontSize: `${Math.round(this.px * (crit ? 10 : 7))}px`, stroke: '#000000', strokeThickness: Math.max(2, this.px * (crit ? 1.5 : 1.15)) });
    }
    ft.obj.setText(s)
      .setPosition(Math.round(x + (Math.random() - 0.5) * 12 * this.px), Math.round(y)).setAlpha(1).setVisible(true).setScale(0.55);
    this.tweens.killTweensOf(ft.obj);
    this.tweens.add({ targets: ft.obj, scale: { from: 0.55, to: 1.25 }, duration: 90, ease: 'Quad.easeOut', yoyo: false, onComplete: () => this.tweens.add({ targets: ft.obj, scale: 1, duration: 140 }) });
    ft.t = crit ? 0.95 : 0.75;
    ft.vy = -22 * this.px;
  }

  private tickEffects(dt: number) {
    this.textCd -= dt; this.critCd -= dt;
    this.tickParts(dt);
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
    // soft contact shadows under every zombie and soldier
    const sh = this.shadows; sh.clear(); sh.fillStyle(0x000000, 0.34);
    for (const z of this.zombies) { if (!z.alive || (z.fog && z.p < 0.5)) continue; const [x, y] = this.zScreen(z); const sc = z.scale ?? (z.boss ? 2 : 1 + 0.12 * z.variety); sh.fillEllipse(x + px, y - px * 0.5, 13 * sc * px, 3.6 * sc * px, 10); }
    for (const s of this.shooters.values()) sh.fillEllipse(s.body.x + px, s.body.y - px * 0.5, 12 * px * this.crowd, 3.4 * px * this.crowd, 10);
    // ultimate-form zombies: a toxic glow in their colour at their feet
    for (const z of this.zombies) {
      if (!z.alive || !z.ult || (z.fog && z.p < 0.5)) continue;
      const [x, y] = this.zScreen(z), sc = z.scale ?? 1;
      sh.fillStyle(ULT_Z_TINT[M.familyOf(z.strain)] ?? 0x9cff5a, 0.5).fillEllipse(x + px, y - px * 0.5, 19 * sc * px, 5.4 * sc * px, 10);
    }
    sh.fillStyle(0x000000, 0.34);
    // ultimate forms: a ring in the track's colour under each soldier
    for (const u of game.owned) {
      if (u.evo === undefined) continue;
      sh.fillStyle(ULT_TINT(u), 0.42);
      for (let k = 0; k < Math.min(u.count, BattleScene.VISIBLE_PER_TYPE); k++) { const s = this.shooters.get(`${u.cls}-${k}`); if (s?.body.visible) sh.fillEllipse(s.body.x + px, s.body.y - px * 0.5, 15 * px * this.crowd, 4.6 * px * this.crowd, 10); }
      sh.fillStyle(0x000000, 0.34);
    }
    for (const z of this.zombies) {
      const [x, y0] = this.zScreen(z);
      const y = y0 - this.lift(z) * px;
      const look = z.look ?? z.strain;
      if (!z.sprite) z.sprite = this.add.sprite(x, y, `z-${look}-0`).setOrigin(0.5, 1);
      const crouch = z.bossKind === 'leaper' && !(z.air && z.air > 0);
      const frame = z.p >= 1 || crouch ? (Math.floor(z.phase) % 2) * 2 : Math.floor(z.phase) % ZOMBIE_FRAMES;
      const sc = z.scale ?? (z.boss ? 2 : 1 + 0.12 * z.variety);
      z.sprite.setTexture(`z-${look}-${frame}`).setPosition(x, y).setScale(sc * this.S, sc * this.S * (crouch && (z.hopT ?? 1) < 0.5 ? 0.85 : 1)).setDepth(y0)
        .setAlpha(z.fog && z.p < 0.5 ? 0.22 : 1);
      if (z.flash > 0) z.sprite.setTintFill(0xffffff);
      else if (z.boss) z.sprite.setTint(z.tint ?? 0xff9a9a);
      else if (z.special) z.sprite.setTint(M.specialById(z.special).tint);
      else if (z.variety === 1) z.sprite.setTint(0xffb4a4);
      else if (z.variety === 2) z.sprite.setTint(0xc8b8ff);
      else if (z.horde) z.sprite.setTint(0xffc0c0);
      else z.sprite.clearTint();
    }
  }

  /** One dashed line per hired unit type at the edge of its range, with that type's gun as a marker. */
  private rangeIcons = new Map<ClassId, Phaser.GameObjects.Image>();
  /** Tutorial: show the range lines for a while even if they're switched off in Settings. */
  private rangeFlash = 0;
  flashRanges(sec: number) { this.rangeFlash = this.time.now + sec * 1000; }
  /** Tutorial: the shredder strip and the squad's rooftop as fractions of the field's width. */
  layoutFractions() { return { shred0: this.lay.shredX * this.px / this.W, shred1: (this.lay.shredX + 26) * this.px / this.W, roof1: this.lay.bunkerRight * this.px / this.W }; }
  private drawRanges(g: Phaser.GameObjects.Graphics) {
    if (!showRanges() && this.time.now > this.rangeFlash) { for (const icon of this.rangeIcons.values()) icon.setVisible(false); return; }
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
    if (this.phase === 'intro') {
      // horde warning: a pulsing red wash and scrolling hazard stripes at the top and bottom of the road
      const pulse = 0.5 + 0.5 * Math.sin(this.phaseT * Math.PI * 6);
      g.fillStyle(0xc81020, 0.1 + 0.12 * pulse).fillRect(0, 0, this.W, this.H);
      const band = 7 * px, shift = (this.phaseT * 60 * px) % (14 * px);
      for (const y of [this.lay.roadTop * px, this.lay.roadBot * px - band]) {
        g.fillStyle(0x18160f, 0.9).fillRect(0, y, this.W, band);
        g.fillStyle(0xffd34d, 1);
        for (let x = -14 * px + (y > this.H / 2 ? -shift : shift); x < this.W + 14 * px; x += 14 * px) g.fillTriangle(x, y + band, x + 7 * px, y + band, x + 7 * px + band, y).fillTriangle(x, y + band, x + band, y, x + 7 * px + band, y);
      }
    }
    // Fog March: a bank of fog over the far half of the road
    if ((this.phase === 'horde' || this.phase === 'intro') && this.horde.kind === 'fog') {
      const [fx0] = this.toScreen(0.5, 0), top = this.lay.roadTop * px, h = (this.lay.roadBot - this.lay.roadTop) * px;
      for (let i = 0; i < 8; i++) g.fillStyle(0xc8d0d8, 0.06 + i * 0.012).fillRect(fx0 + i * 6 * px, top, this.W - fx0 - i * 6 * px, h);
    }
    for (const z of this.zombies) {
      if (!z.alive || !z.bossKind) continue;
      const [bx, by] = this.zScreen(z);
      // Leaper: a shadow on the ground while it's in the air
      if (z.air && z.air > 0) g.fillStyle(0x000000, 0.35).fillEllipse(bx, by - px, 26 * px, 7 * px);
      // Screamer King: a pulsing ring (the whole horde runs faster while it lives)
      if (z.bossKind === 'screamer' && z.p > 0) {
        const pu = (this.time.now / 600) % 1;
        g.lineStyle(2 * px, 0xff80e0, 0.6 * (1 - pu)).strokeCircle(bx, by - 30 * px, (20 + pu * 60) * px);
      }
    }
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
      if (z.fog && z.p < 0.5) continue;
      const sc = z.scale ?? (z.boss ? 2 : 1 + 0.12 * z.variety);
      const bw = (z.boss ? 30 : 14) * px, top = y - this.lift(z) * px - 29 * sc * px;
      if (z.armour && z.armour > 0) {   // Iron Juggernaut's armour bar above its HP bar
        g.fillStyle(0x140c1c, 1).fillRect(x - bw / 2 - px, top - 5 * px, bw + 2 * px, 3 * px);
        g.fillStyle(0xa8b4c8, 1).fillRect(x - bw / 2, top - 4 * px, Math.ceil((bw * Math.min(1, z.armour / (0.6 / M.BOSSES.juggernaut.hp))) / px) * px, 2 * px);
      }
      g.fillStyle(0x140c1c, 1).fillRect(x - bw / 2 - px, top - px, bw + 2 * px, 3 * px);
      g.fillStyle(z.horde ? 0xff4a4a : 0xe04848, 1).fillRect(x - bw / 2, top, Math.ceil((bw * Math.max(0, z.hp)) / px) * px, z.boss ? 2 * px : px);
    }
    const h = this.horde;
    const show = this.phase === 'horde' || this.phase === 'intro';
    this.hordeText.setVisible(show);
    if (show) {
      const left = h.queue.length + this.zombies.filter((z) => z.alive && z.horde).length;
      const bzNow = this.zombies.find((z) => z.alive && z.boss), boss = h.queue.length ? 'BOSS COMING' : bzNow ? `${M.BOSSES[bzNow.bossKind!].name.toUpperCase()} ${Math.ceil(Math.max(0, bzNow.hp) * 100)}%` : 'BOSS DOWN';
      const bz = this.zombies.find((z) => z.alive && z.boss);
      this.hordeText.setText(`HORDE ${h.k}  ·  ${left} LEFT  ·  BREACHES ${h.breaches}/${C.breachLimit}\n${boss}${bz ? ` · ${Math.round(Math.max(0, 1 - bz.p) * 100)}% FROM THE SHREDDER` : ''}`)
        .setFontSize(Math.max(12, Math.round(px * 6))).setStroke('#140c1c', Math.max(3, px * 1.4)).setLineSpacing(2)
        .setPosition(Math.round(this.lay.shredX * px + 8 * px), Math.round(this.lay.roadTop * px + 6 * px))
        .setColor((bz && bz.p > 0.65) || h.breaches >= C.breachLimit * 0.7 ? '#ff6b6b' : '#ffd34d');
    }
    // the boss's health bar, pinned at the top of the road (with a pale trail showing recent damage, and armour above)
    const bb = this.bossBar; bb.clear();
    const bossNow = show ? this.zombies.find((z) => z.alive && z.boss) : undefined;
    if (bossNow) {
      const hp = Math.max(0, Math.min(1, bossNow.hp));
      this.bossTrail = Math.max(hp, this.bossTrail - (this.bossTrail - hp) * 0.04 - 0.002);
      const x0 = Math.round(this.lay.shredX * px + 8 * px), w = Math.round(Math.max(60 * this.dpr, Math.min(this.W - x0 - 132 * this.dpr, (this.lay.spawnX - this.lay.shredX) * px * 0.62)));   // stops short of the quick rail
      const y0 = Math.round(this.hordeText.y + this.hordeText.height + 3 * px), h = Math.round(4 * px);
      bb.fillStyle(0x140c1c, 0.92).fillRoundedRect(x0 - px, y0 - px, w + 2 * px, h + 2 * px, 2 * px);
      bb.fillStyle(0x4a1414, 1).fillRect(x0, y0, w, h);
      bb.fillStyle(0xffe0c0, 0.85).fillRect(x0, y0, Math.round(w * this.bossTrail), h);
      bb.fillStyle(bossNow.flash > 0 ? 0xffffff : 0xff3b30, 1).fillRect(x0, y0, Math.round(w * hp), h);
      bb.fillStyle(0xffffff, 0.25).fillRect(x0, y0, Math.round(w * hp), Math.max(1, Math.round(h * 0.35)));
      for (let i = 1; i < 10; i++) bb.fillStyle(0x140c1c, 0.5).fillRect(x0 + Math.round((w * i) / 10), y0, Math.max(1, Math.round(px * 0.4)), h);
      if (bossNow.armour && bossNow.armour > 0) {
        const a = Math.min(1, bossNow.armour / (0.6 / M.BOSSES.juggernaut.hp));
        bb.fillStyle(0x140c1c, 0.92).fillRect(x0 - px, y0 - 4 * px, w + 2 * px, 3 * px);
        bb.fillStyle(0xa8b4c8, 1).fillRect(x0, y0 - 3 * px, Math.round(w * a), px * 1.5);
      }
    } else this.bossTrail = 1;
    // boss distance bar along the bottom: empties as the boss nears the shredder
    const bossZ = this.phase === 'horde' ? this.zombies.find((z) => z.alive && z.boss) : undefined;
    if (bossZ) {
      const f = Math.max(0, Math.min(1, bossZ.p));
      g.fillStyle(0x140c1c, 1).fillRect(0, this.H - 4 * px, this.W, 4 * px);
      g.fillStyle(f > 0.65 ? 0xe04848 : 0xe0a548, 1).fillRect(0, this.H - 4 * px, Math.round((this.W * (1 - f)) / px) * px, 4 * px);
    }
  }
}
