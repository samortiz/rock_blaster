import { Input, Insets, JOY_RADIUS } from './input';
import { Sfx } from './audio';
import * as Sprites from './sprites';
import type { Sprite } from './sprites';
import * as Save from './save';
import type { Boost, Channel, ShipId, Upgrade } from './save';

const TAU = Math.PI * 2;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const pick = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const angleDiff = (a: number, b: number) => ((((a - b) % TAU) + TAU * 1.5) % TAU) - Math.PI;

// --- Tuning (world units; the screen's short side is 720 units) ---
const SHIP_R = 16;
const ROTATE_SPEED = 4.8; // rad/s
const AIM_ROTATE_SPEED = 14; // rad/s; twin-stick aiming turns almost instantly
const SHIP_SPEED = 320; // no momentum: the ship moves only while thrusting
const BULLET_SPEED = 720;
const BULLET_LIFE = 0.85;
const FIRE_DELAY = 0.2;
const RAPID_FIRE_DELAY = 0.08;
const RESPAWN_TIME = 2;
const INVULN_TIME = 2.5;
const POWER_TIME = 10;
const START_LIVES = 3;
const EXTRA_LIFE_EVERY = 10000;
const POINTS_PER_COIN = 20;
const MAX_BOOST_STOCK = 9;
const DURATION_PER_LEVEL = 2; // extra power-up seconds per Power Boost level
const LUCK_PER_LEVEL = 0.25; // extra drop chance (fraction) per Lucky Drops level
const BOSS_EVERY = 5; // every fifth wave is a mothership fight instead of rocks
const BOSS_R = 70; // half-width of the mothership's hull
const BOSS_ENTER_TIME = 3; // seconds to glide in from above the screen
const BOSS_POINTS = 2500; // times the boss tier
const BOSS_ATTACKS = ['ring', 'aimed', 'spiral', 'ring', 'aimed', 'rocks'] as const;
const BOSS_SPIRAL_GAP = 0.05; // seconds between spiral volleys
const BOSS_SPIRAL_TIER = 3; // first boss tier with the spiral attack (wave 15)

type RockSize = 1 | 2 | 3;
const ROCK_R: Record<RockSize, number> = { 3: 58, 2: 32, 1: 17 };
const ROCK_SPEED: Record<RockSize, [number, number]> = { 3: [35, 75], 2: [65, 120], 1: [100, 170] };
const ROCK_SCORE: Record<RockSize, number> = { 3: 20, 2: 50, 1: 100 };
const ROCK_DROP_CHANCE: Record<RockSize, number> = { 3: 0.1, 2: 0.07, 1: 0.04 };

type PowerType = 'shield' | 'rapid' | 'triple' | 'life';
const POWER_INFO: Record<PowerType, { color: string; glyph: string; label: string }> = {
  shield: { color: '#38d6ff', glyph: 'S', label: 'SHIELD' },
  rapid: { color: '#ffc531', glyph: 'R', label: 'RAPID FIRE' },
  triple: { color: '#e45cff', glyph: 'T', label: 'TRIPLE SHOT' },
  life: { color: '#4fe36a', glyph: '+', label: 'EXTRA LIFE' },
};

// Picked-up power-ups (other than extra lives) are held, across games, until the
// player uses them with keys 1-3 or the touch buttons, in this order.
const HELD_POWERS = ['shield', 'rapid', 'triple'] as const;
type HeldPower = (typeof HELD_POWERS)[number];

type ShopItem = { name: string; desc: string; prices: number[] } & (
  | { kind: 'boost'; id: Boost }
  | { kind: 'upgrade'; id: Upgrade }
);

// Bought shields, rapid fire and triple shots go into the held inventory, which
// carries over between games; an extra life is spent at the start of the next
// game; upgrades are permanent.
const SHOP_ITEMS: ShopItem[] = [
  { kind: 'boost', id: 'shield', name: 'SHIELD', desc: 'Add a shield to your inventory', prices: [150] },
  { kind: 'boost', id: 'rapid', name: 'RAPID FIRE', desc: 'Add rapid fire to your inventory', prices: [150] },
  { kind: 'boost', id: 'triple', name: 'TRIPLE SHOT', desc: 'Add triple shot to your inventory', prices: [200] },
  { kind: 'boost', id: 'life', name: 'EXTRA LIFE', desc: 'Start your next game with +1 life', prices: [300] },
  { kind: 'upgrade', id: 'duration', name: 'POWER BOOST', desc: `Power-ups last ${DURATION_PER_LEVEL}s longer`, prices: [400, 800, 1600, 3200] },
  { kind: 'upgrade', id: 'luck', name: 'LUCKY DROPS', desc: `Power-ups drop ${LUCK_PER_LEVEL * 100}% more often`, prices: [500, 1000, 2000] },
];

const UPGRADE_INFO: Record<Upgrade, { color: string; glyph: string }> = {
  duration: { color: '#ff8a2a', glyph: 'P' },
  luck: { color: '#3ee0b0', glyph: 'L' },
};

// Ships unlock when the best score reaches `unlock`. Stats multiply the base
// tuning above; `guns` are sideways offsets of the cannons in SHIP_R units, each
// firing its own shot (or triple-shot spread).
interface ShipType {
  name: string;
  desc: string;
  unlock: number;
  speed: number;
  fireDelay: number;
  range: number;
  guns: number[];
  lives: number;
  bullet: [core: string, glow: string];
}

const SHIPS: Record<ShipId, ShipType> = {
  viper: { name: 'VIPER', desc: 'Balanced all-rounder', unlock: 0, speed: 1, fireDelay: 1, range: 1, guns: [0], lives: 0, bullet: ['#bdfcff', '#36d8ff'] },
  hornet: { name: 'HORNET', desc: 'Fast and nimble, quick trigger', unlock: 5000, speed: 1.3, fireDelay: 0.85, range: 0.9, guns: [0], lives: 0, bullet: ['#fff6b0', '#ffd34d'] },
  warden: { name: 'WARDEN', desc: 'Slow and tough: +1 life every game', unlock: 15000, speed: 0.85, fireDelay: 1, range: 1.1, guns: [0], lives: 1, bullet: ['#d8ffc0', '#6ee04a'] },
  phantom: { name: 'PHANTOM', desc: 'Twin cannons fire paired shots', unlock: 30000, speed: 1.05, fireDelay: 1.05, range: 1, guns: [-0.4, 0.4], lives: 0, bullet: ['#f0d8ff', '#b05cff'] },
  nova: { name: 'NOVA', desc: 'Rapid fire with long range', unlock: 50000, speed: 1.1, fireDelay: 0.55, range: 1.35, guns: [0], lives: 0, bullet: ['#fff3c0', '#ff8a2a'] },
  razor: { name: 'RAZOR', desc: 'Three cannons, slow reload', unlock: 75000, speed: 1, fireDelay: 1.3, range: 0.95, guns: [-0.6, 0, 0.6], lives: 0, bullet: ['#ffd8ec', '#ff4fa0'] },
  titan: { name: 'TITAN', desc: 'Heavy armor: +2 lives', unlock: 100000, speed: 0.75, fireDelay: 0.9, range: 1.15, guns: [-0.35, 0.35], lives: 2, bullet: ['#ffd0c8', '#ff4a3a'] },
  eclipse: { name: 'ECLIPSE', desc: 'Twin rapid fire, +1 life', unlock: 150000, speed: 1.2, fireDelay: 0.6, range: 1.25, guns: [-0.35, 0.35], lives: 1, bullet: ['#ffffff', '#7a9cff'] },
};

const MENU_UP = new Set(['ArrowUp', 'KeyW']);
const MENU_DOWN = new Set(['ArrowDown', 'KeyS']);
const MENU_LEFT = new Set(['ArrowLeft', 'KeyA']);
const MENU_RIGHT = new Set(['ArrowRight', 'KeyD']);
const MENU_SELECT = new Set(['Space', 'Enter']);
const MENU_BACK = new Set(['Escape', 'Backspace']);

const VOLUME_ROWS: { id: Channel; label: string }[] = [
  { id: 'master', label: 'VOLUME' },
  { id: 'sfx', label: 'SOUND EFFECTS' },
  { id: 'music', label: 'MUSIC' },
];

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inside = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dead?: boolean;
}

interface Ship extends Body {
  angle: number;
  alive: boolean;
  respawn: number;
  invuln: number;
  cooldown: number;
  thrusting: boolean;
  thrustDir: number;
  shield: number;
  rapid: number;
  triple: number;
}

interface Rock extends Body {
  size: RockSize;
  angle: number;
  spin: number;
  sprite: Sprite;
}

interface Bullet extends Body {
  life: number;
  enemy: boolean;
}

interface Ufo extends Body {
  small: boolean;
  fireT: number;
  turnT: number;
}

interface Boss {
  x: number;
  y: number;
  tier: number; // 1 on wave 5, 2 on wave 10, ...
  hp: number;
  maxHp: number;
  t: number; // seconds since it appeared
  orbit: number; // angle around the screen center
  attackT: number;
  attack: number; // count of attacks so far, indexing BOSS_ATTACKS
  spiral: number; // spiral volleys left to fire
  spiralT: number;
  spiralAngle: number;
  hitT: number; // white flash after taking a hit
}

interface PowerUp extends Body {
  type: PowerType;
  life: number;
  t: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  glow: boolean;
}

interface FloatText {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

export interface View {
  dpr: number;
  scale: number; // CSS pixels per world unit
  cssW: number;
  cssH: number;
  stars: HTMLCanvasElement;
}

export class Game {
  w = 1280;
  h = 720;
  private scale = 1; // CSS pixels per world unit
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  private state: 'home' | 'shop' | 'hangar' | 'playing' | 'over' = 'home';
  private save = Save.load();
  private menuIndex = 0;
  private keyNav = false; // highlight the selected menu item only once the keyboard is used
  private shopFlash = { index: -1, t: 0, ok: true };
  private settingsOpen = false; // over the home screen or the pause screen
  private resetArmT = 0; // RESET PROGRESS waits this long for the confirming second press
  private resetDoneT = 0; // shows that progress was cleared
  private coinsEarned = 0;
  private newBest = false;
  private newShips: ShipId[] = []; // unlocked by the run that just ended
  // Test mode (the ?test URL parameter, or five quick taps on the home title):
  // every ship is flyable, games start at a chosen wave, the pause menu and the
  // N / B keys skip ahead, and runs don't touch coins, best score or inventory.
  private testMode = new URLSearchParams(location.search).has('test');
  private testStartWave = 1;
  private testBoosts: Record<Boost, number> | null = null; // inventory before a test run, restored after it
  private titleTaps: number[] = [];
  private paused = false;
  private time = 0;
  private score = 0;
  private lives = START_LIVES;
  private nextLife = EXTRA_LIFE_EVERY;
  private wave = 0;
  private waveTimer = 0;
  private bannerT = 0;
  private overT = 0;
  private ufoTimer = 0;
  private shake = 0;

  private ship: Ship = this.newShip();
  private rocks: Rock[] = [];
  private bullets: Bullet[] = [];
  private ufo: Ufo | null = null;
  private boss: Boss | null = null;
  private powerUps: PowerUp[] = [];
  private particles: Particle[] = [];
  private texts: FloatText[] = [];

  private sprites = {
    ships: Object.fromEntries(Save.SHIP_IDS.map((id) => [id, Sprites.ship(SHIP_R, Sprites.SHIP_LOOKS[id])])) as Record<ShipId, Sprite>,
    shipBullets: Object.fromEntries(
      Save.SHIP_IDS.map((id) => [id, Sprites.bullet(2.6, ...SHIPS[id].bullet)]),
    ) as Record<ShipId, Sprite>,
    rocks: {
      3: Array.from({ length: 6 }, () => Sprites.rock(ROCK_R[3])),
      2: Array.from({ length: 6 }, () => Sprites.rock(ROCK_R[2])),
      1: Array.from({ length: 6 }, () => Sprites.rock(ROCK_R[1])),
    } as Record<RockSize, Sprite[]>,
    ufoBig: Sprites.ufo(28, false),
    ufoSmall: Sprites.ufo(17, true),
    boss: Sprites.mothership(BOSS_R),
    enemyBullet: Sprites.bullet(3, '#ffb0a0', '#ff4030'),
    power: Object.fromEntries(
      Object.entries(POWER_INFO).map(([k, v]) => [k, Sprites.powerUp(14, v.color, v.glyph)]),
    ) as Record<PowerType, Sprite>,
    upgrade: Object.fromEntries(
      Object.entries(UPGRADE_INFO).map(([k, v]) => [k, Sprites.powerUp(14, v.color, v.glyph)]),
    ) as Record<Upgrade, Sprite>,
    coin: Sprites.coin(11),
  };

  constructor(
    private input: Input,
    private sfx: Sfx,
  ) {
    this.spawnRocks(5); // drifting rocks behind the title screen
    for (const { id } of VOLUME_ROWS) this.sfx.setVolume(id, this.save.volumes[id]);
    this.keepShipUnlocked();
  }

  /** World size and safe-area insets, both in world units. */
  resize(w: number, h: number, insets: Insets, scale: number) {
    this.w = w;
    this.h = h;
    this.insets = insets;
    this.scale = scale;
  }

  pause() {
    if (this.state === 'playing') {
      this.paused = true;
      this.sfx.quiet();
    }
  }

  // ------------------------------------------------------------------ update

  update(dt: number) {
    this.time += dt;
    const startPressed = this.input.consumeStart();
    const pausePressed = this.input.consumePause();
    const powerPressed = this.input.consumePower();
    const tapCss = this.input.consumeTap();
    const tap = tapCss && { x: tapCss.x / this.scale, y: tapCss.y / this.scale };
    const keys = this.input.consumeMenuKeys();
    this.sfx.music(!(this.state === 'playing' && this.paused && !this.settingsOpen));

    if (this.state !== 'playing') {
      this.overT += dt;
      this.shopFlash.t -= dt;
      this.resetArmT -= dt;
      this.resetDoneT -= dt;
      this.updateRocks(dt);
      this.updateParticles(dt);
      if (this.state === 'home') this.settingsOpen ? this.updateSettings(tap, keys) : this.updateHome(tap, keys);
      else if (this.state === 'shop') this.updateShop(tap, keys);
      else if (this.state === 'hangar') this.updateHangar(tap, keys);
      else if (startPressed && this.overT > 1) this.goHome(0);
      return;
    }

    if (pausePressed && !this.settingsOpen) {
      this.paused = !this.paused;
      if (this.paused) {
        this.sfx.quiet();
        this.menuIndex = 0;
      }
    }
    if (this.paused) {
      if (this.settingsOpen) this.updateSettings(tap, keys);
      else this.updatePauseMenu(tap, keys);
      return;
    }

    this.shake = Math.max(0, this.shake - dt * 30);
    this.bannerT -= dt;

    if (powerPressed !== null) this.useHeld(HELD_POWERS[powerPressed]);
    if (this.testMode) {
      if (keys.includes('KeyN')) this.jumpToWave(this.wave + 1);
      if (keys.includes('KeyB')) this.jumpToWave((Math.floor(this.wave / BOSS_EVERY) + 1) * BOSS_EVERY);
    }
    this.updateShip(dt);
    this.updateRocks(dt);
    this.updateBullets(dt);
    this.updateUfo(dt);
    this.updateBoss(dt);
    this.updatePowerUps(dt);
    this.updateParticles(dt);
    this.collide();

    if (this.rocks.length === 0 && !this.boss) {
      if (this.waveTimer <= 0) this.waveTimer = 2;
      this.waveTimer -= dt;
      if (this.waveTimer <= 0) this.nextWave();
    }

    if (!this.ship.alive && this.lives <= 0 && this.ship.respawn <= 0) this.gameOver();
  }

  private gameOver() {
    this.state = 'over';
    this.boss = null;
    this.overT = 0;
    this.bankRun();
  }

  /** Award coins and record the best score for the run that just ended. */
  private bankRun() {
    this.sfx.quiet();
    if (this.testMode) {
      if (this.testBoosts) this.save.boosts = this.testBoosts;
      this.testBoosts = null;
      this.coinsEarned = 0;
      this.newBest = false;
      this.newShips = [];
      Save.store(this.save);
      return;
    }
    this.coinsEarned = Math.floor(this.score / POINTS_PER_COIN);
    this.newBest = this.score > this.save.best;
    this.newShips = Save.SHIP_IDS.filter((id) => SHIPS[id].unlock > this.save.best && SHIPS[id].unlock <= this.score);
    this.save.coins += this.coinsEarned;
    this.save.best = Math.max(this.save.best, this.score);
    Save.store(this.save);
  }

  /** RESUME, SETTINGS and HOME buttons on the pause screen. */
  private pauseButtons() {
    const bw = 260;
    const bh = 52;
    const x = this.w / 2 - bw / 2;
    const cy = this.h / 2;
    return [
      { id: 'resume' as const, label: 'RESUME', x, y: cy, w: bw, h: bh },
      { id: 'settings' as const, label: 'SETTINGS', x, y: cy + 64, w: bw, h: bh },
      { id: 'home' as const, label: 'HOME', x, y: cy + 128, w: bw, h: bh },
      ...(this.testMode
        ? [
            { id: 'nextWave' as const, label: 'NEXT WAVE', x: this.w / 2 - 206, y: cy + 192, w: 200, h: bh },
            { id: 'nextBoss' as const, label: 'NEXT BOSS', x: this.w / 2 + 6, y: cy + 192, w: 200, h: bh },
          ]
        : []),
    ];
  }

  private updatePauseMenu(tap: { x: number; y: number } | null, keys: string[]) {
    const buttons = this.pauseButtons();
    let chosen: (typeof buttons)[number]['id'] | null = null;
    for (const k of keys) {
      if (MENU_UP.has(k)) {
        this.menuIndex = (this.menuIndex + buttons.length - 1) % buttons.length;
        this.keyNav = true;
      } else if (MENU_DOWN.has(k)) {
        this.menuIndex = (this.menuIndex + 1) % buttons.length;
        this.keyNav = true;
      } else if (MENU_SELECT.has(k)) {
        chosen = buttons[this.menuIndex].id;
      }
    }
    if (tap) {
      this.keyNav = false;
      chosen = buttons.find((b) => inside(tap, b))?.id ?? chosen;
    }
    if (chosen === 'resume') {
      this.paused = false;
      this.input.reset(); // don't turn the tap on RESUME into held fire
    } else if (chosen === 'settings') {
      this.openSettings();
    } else if (chosen === 'home') {
      this.quitToHome();
    } else if (chosen === 'nextWave' || chosen === 'nextBoss') {
      this.paused = false;
      this.input.reset();
      this.jumpToWave(chosen === 'nextWave' ? this.wave + 1 : (Math.floor(this.wave / BOSS_EVERY) + 1) * BOSS_EVERY);
    }
  }

  /** Abandon the current game: keep the coins earned so far and return to the title screen. */
  private quitToHome() {
    this.bankRun();
    this.paused = false;
    this.ufo = null;
    this.boss = null;
    this.bullets = [];
    this.powerUps = [];
    this.texts = [];
    this.input.reset();
    this.goHome(0);
  }

  // ------------------------------------------------------------- home & shop

  private goHome(index: number) {
    this.state = 'home';
    this.menuIndex = index;
  }

  private homeButtons() {
    const bw = 260;
    const bh = 48;
    const x = this.w / 2 - bw / 2;
    const cy = this.h / 2;
    return [
      { id: 'play' as const, label: 'PLAY', x, y: cy - 48, w: bw, h: bh },
      { id: 'hangar' as const, label: 'HANGAR', x, y: cy + 10, w: bw, h: bh },
      { id: 'shop' as const, label: 'SHOP', x, y: cy + 68, w: bw, h: bh },
      { id: 'settings' as const, label: 'SETTINGS', x, y: cy + 126, w: bw, h: bh },
    ];
  }

  private updateHome(tap: { x: number; y: number } | null, keys: string[]) {
    const buttons = this.homeButtons();
    const ids = buttons.map((b) => b.id);
    let chosen: (typeof ids)[number] | null = null;
    for (const k of keys) {
      if (MENU_UP.has(k)) {
        this.menuIndex = (this.menuIndex + ids.length - 1) % ids.length;
        this.keyNav = true;
      } else if (MENU_DOWN.has(k)) {
        this.menuIndex = (this.menuIndex + 1) % ids.length;
        this.keyNav = true;
      } else if (MENU_SELECT.has(k)) {
        chosen = ids[this.menuIndex];
      }
    }
    if (tap) {
      this.keyNav = false;
      chosen = buttons.find((b) => inside(tap, b))?.id ?? chosen;
      if (inside(tap, this.homeTitleRect())) this.tapTitle();
    }
    if (this.testMode) {
      const { minus, plus } = this.testWaveRow();
      let step = 0;
      for (const k of keys) step += MENU_LEFT.has(k) ? -1 : MENU_RIGHT.has(k) ? 1 : 0;
      if (tap && inside(tap, minus)) step--;
      if (tap && inside(tap, plus)) step++;
      if (step) {
        this.testStartWave = clamp(this.testStartWave + step, 1, 99);
        this.sfx.buy();
      }
    }
    if (chosen === 'play') {
      this.startGame();
    } else if (chosen === 'hangar') {
      this.state = 'hangar';
      this.menuIndex = Save.SHIP_IDS.indexOf(this.save.ship);
      this.shopFlash.t = 0;
    } else if (chosen === 'shop') {
      this.state = 'shop';
      this.menuIndex = 0;
      this.shopFlash.t = 0;
    } else if (chosen === 'settings') {
      this.openSettings();
    }
  }

  private homeTitleRect(): Rect {
    const fit = Math.min(1, this.w / 760);
    return { x: this.w / 2 - 330 * fit, y: this.h / 2 - 140 - 55 * fit, w: 660 * fit, h: 110 * fit };
  }

  /** Five taps on the title within two seconds toggle test mode. */
  private tapTitle() {
    this.titleTaps = [...this.titleTaps.filter((t) => this.time - t < 2), this.time];
    if (this.titleTaps.length < 5) return;
    this.titleTaps = [];
    this.testMode = !this.testMode;
    this.keepShipUnlocked();
    this.sfx.powerUp();
  }

  /** START AT WAVE n, with - and + hit areas, in place of the best score on the home screen. */
  private testWaveRow() {
    const y = this.h / 2 - 76;
    return {
      y,
      minus: { x: this.w / 2 - 170, y: y - 22, w: 50, h: 44 },
      plus: { x: this.w / 2 + 120, y: y - 22, w: 50, h: 44 },
    };
  }

  private openSettings() {
    this.settingsOpen = true;
    this.menuIndex = 0;
  }

  /** Back to whichever menu opened the settings, with its SETTINGS button selected. */
  private closeSettings() {
    this.settingsOpen = false;
    this.resetArmT = 0;
    this.resetDoneT = 0;
    this.menuIndex = this.state === 'home' ? 3 : 1;
  }

  /**
   * One row per volume channel (label, -, level bar, +), then RESET PROGRESS
   * (only from the home screen, not mid-game), then BACK. Hit areas span the row's height.
   */
  private settingsLayout() {
    const rowW = Math.min(620, this.w - 40);
    const rowH = 64;
    const gap = 14;
    const headerH = 80;
    const backH = 52;
    const canReset = this.state === 'home';
    const total = headerH + VOLUME_ROWS.length * (rowH + gap) + 14 + backH + (canReset ? backH + 14 : 0);
    const top = Math.max(this.insets.top + 8, (this.h - total) / 2);
    const x = this.w / 2 - rowW / 2;
    const btn = 48;
    const labelW = Math.min(220, rowW * 0.36);
    const rows = VOLUME_ROWS.map((_, i) => {
      const y = top + headerH + i * (rowH + gap);
      const minus: Rect = { x: x + labelW, y, w: btn, h: rowH };
      const plus: Rect = { x: x + rowW - 72 - btn, y, w: btn, h: rowH };
      const bar: Rect = { x: minus.x + btn + 12, y, w: plus.x - 12 - (minus.x + btn + 12), h: rowH };
      return { box: { x, y, w: rowW, h: rowH }, minus, bar, plus };
    });
    let y = top + headerH + VOLUME_ROWS.length * (rowH + gap) + 14;
    const reset: Rect | null = canReset ? { x: this.w / 2 - 160, y, w: 320, h: backH } : null;
    if (reset) y += backH + 14;
    const back: Rect = { x: this.w / 2 - 100, y, w: 200, h: backH };
    return { rows, reset, back, titleY: top + 30 };
  }

  private updateSettings(tap: { x: number; y: number } | null, keys: string[]) {
    const n = VOLUME_ROWS.length;
    const { rows, reset, back } = this.settingsLayout();
    const last = reset ? n + 1 : n; // BACK's index; RESET PROGRESS is n when shown
    for (const k of keys) {
      const i = this.menuIndex;
      if (MENU_BACK.has(k) || (MENU_SELECT.has(k) && i === last)) return this.closeSettings();
      if (MENU_SELECT.has(k) && reset && i === n) this.pressReset();
      else if (MENU_UP.has(k)) this.menuIndex = (i + last) % (last + 1);
      else if (MENU_DOWN.has(k)) this.menuIndex = (i + 1) % (last + 1);
      else if (MENU_LEFT.has(k) && i < n) this.setVolume(i, this.save.volumes[VOLUME_ROWS[i].id] - 1);
      else if (MENU_RIGHT.has(k) && i < n) this.setVolume(i, this.save.volumes[VOLUME_ROWS[i].id] + 1);
      else continue;
      this.keyNav = true;
    }
    if (tap) {
      this.keyNav = false;
      if (inside(tap, back)) return this.closeSettings();
      if (reset && inside(tap, reset)) {
        this.menuIndex = n;
        this.pressReset();
      }
      rows.forEach((row, i) => {
        const level = this.save.volumes[VOLUME_ROWS[i].id];
        if (inside(tap, row.minus)) this.setVolume(i, level - 1);
        else if (inside(tap, row.plus)) this.setVolume(i, level + 1);
        else if (inside(tap, row.bar)) this.setVolume(i, Math.ceil(((tap.x - row.bar.x) / row.bar.w) * Save.VOLUME_STEPS));
        else return;
        this.menuIndex = i;
      });
    }
  }

  /** First press arms the reset; a second press within a few seconds clears all progress but keeps the volume settings. */
  private pressReset() {
    if (this.resetArmT <= 0) {
      this.resetArmT = 3;
      this.resetDoneT = 0;
      this.sfx.denied();
      return;
    }
    this.save = { ...Save.fresh(), volumes: this.save.volumes };
    Save.store(this.save);
    this.resetArmT = 0;
    this.resetDoneT = 2;
    this.sfx.explode(3);
  }

  private setVolume(row: number, level: number) {
    const id = VOLUME_ROWS[row].id;
    level = clamp(level, 0, Save.VOLUME_STEPS);
    if (level === this.save.volumes[id]) return;
    this.save.volumes[id] = level;
    this.sfx.setVolume(id, level);
    Save.store(this.save);
    if (id !== 'music') this.sfx.shoot(); // a sample at the new level; the music is already playing
  }

  /** Card grid for the shop and hangar: two columns on wide screens, one on narrow ones. The last index is BACK. */
  private gridLayout(n: number) {
    const gap = 12;
    const rowH = 72;
    // Two columns on wide screens, or when one column would run off the bottom.
    const tall = n * (rowH + gap) + 152 > this.h - this.insets.top;
    const cols = this.w >= 1000 || (tall && this.w >= 700) ? 2 : 1;
    const rowW = cols === 2 ? Math.min(500, (this.w - 60) / 2) : Math.min(this.w - 40, 560);
    const rows = Math.ceil(n / cols);
    const gridH = rows * rowH + (rows - 1) * gap;
    const headerH = 76;
    const backH = 52;
    const total = headerH + gridH + 24 + backH;
    const top = Math.max(this.insets.top + 8, (this.h - total) / 2);
    const left = this.w / 2 - (cols * rowW + (cols - 1) * gap) / 2;
    const items: Rect[] = Array.from({ length: n }, (_, i) => ({
      x: left + (i % cols) * (rowW + gap),
      y: top + headerH + Math.floor(i / cols) * (rowH + gap),
      w: rowW,
      h: rowH,
    }));
    const back: Rect = { x: this.w / 2 - 100, y: top + headerH + gridH + 24, w: 200, h: backH };
    return { cols, items, back, titleY: top + 30 };
  }

  /**
   * Keyboard and tap handling for a card grid with BACK at index n. Calls
   * `choose` with the picked card's index, and returns true when BACK was picked.
   */
  private updateGrid(n: number, tap: { x: number; y: number } | null, keys: string[], choose: (i: number) => void) {
    const { cols, items, back } = this.gridLayout(n);
    for (const k of keys) {
      const i = this.menuIndex;
      if (MENU_BACK.has(k)) return true;
      if (MENU_SELECT.has(k)) {
        if (i === n) return true;
        choose(i);
        continue;
      }
      if (MENU_UP.has(k)) this.menuIndex = i === n ? n - 1 : i - cols >= 0 ? i - cols : i;
      else if (MENU_DOWN.has(k)) this.menuIndex = i + cols < n ? i + cols : n;
      else if (MENU_LEFT.has(k) && i < n && i % cols > 0) this.menuIndex = i - 1;
      else if (MENU_RIGHT.has(k) && i < n - 1 && i % cols < cols - 1) this.menuIndex = i + 1;
      else continue;
      this.keyNav = true;
    }
    if (tap) {
      this.keyNav = false;
      if (inside(tap, back)) return true;
      const i = items.findIndex((r) => inside(tap, r));
      if (i >= 0) {
        this.menuIndex = i;
        choose(i);
      }
    }
    return false;
  }

  private updateShop(tap: { x: number; y: number } | null, keys: string[]) {
    if (this.updateGrid(SHOP_ITEMS.length, tap, keys, (i) => this.buy(i))) this.goHome(2);
  }

  private updateHangar(tap: { x: number; y: number } | null, keys: string[]) {
    if (this.updateGrid(Save.SHIP_IDS.length, tap, keys, (i) => this.selectShip(i))) this.goHome(1);
  }

  private shipUnlocked(id: ShipId) {
    return this.testMode || this.save.best >= SHIPS[id].unlock;
  }

  /** Outside test mode, fall back to the best unlocked ship if a test session left a locked one chosen. */
  private keepShipUnlocked() {
    if (this.shipUnlocked(this.save.ship)) return;
    this.save.ship = Save.SHIP_IDS.filter((id) => this.shipUnlocked(id)).pop() ?? 'viper';
    Save.store(this.save);
  }

  private selectShip(i: number) {
    const id = Save.SHIP_IDS[i];
    const ok = this.shipUnlocked(id);
    this.shopFlash = { index: i, t: 0.35, ok };
    if (!ok) {
      this.sfx.denied();
      return;
    }
    if (id === this.save.ship) return;
    this.save.ship = id;
    Save.store(this.save);
    this.sfx.buy();
  }

  private get shipType() {
    return SHIPS[this.save.ship];
  }

  /** Current price, or null when the item is maxed out or fully stocked. */
  private priceOf(item: ShopItem): number | null {
    if (item.kind === 'boost') return this.save.boosts[item.id] >= MAX_BOOST_STOCK ? null : item.prices[0];
    return item.prices[this.save.upgrades[item.id]] ?? null;
  }

  private buy(i: number) {
    const item = SHOP_ITEMS[i];
    const price = this.priceOf(item);
    const ok = price !== null && this.save.coins >= price;
    this.shopFlash = { index: i, t: 0.35, ok };
    if (!ok) {
      this.sfx.denied();
      return;
    }
    this.save.coins -= price;
    if (item.kind === 'boost') this.save.boosts[item.id]++;
    else this.save.upgrades[item.id]++;
    Save.store(this.save);
    this.sfx.buy();
  }

  private powerTime() {
    return POWER_TIME + this.save.upgrades.duration * DURATION_PER_LEVEL;
  }

  private startGame() {
    this.state = 'playing';
    this.paused = false;
    this.score = 0;
    this.lives = START_LIVES + this.shipType.lives;
    this.nextLife = EXTRA_LIFE_EVERY;
    this.wave = this.testMode ? this.testStartWave - 1 : 0;
    this.testBoosts = this.testMode ? { ...this.save.boosts } : null;
    this.rocks = [];
    this.bullets = [];
    this.powerUps = [];
    this.texts = [];
    this.ufo = null;
    this.boss = null;
    this.resetUfoTimer();
    this.spawnShip();
    this.nextWave();
    this.input.reset(); // don't carry the menu tap into the game as a held fire button
    this.applyBoosts();
  }

  /** Spend a bought extra life. */
  private applyBoosts() {
    if (this.save.boosts.life <= 0) return;
    this.save.boosts.life--;
    this.lives++;
    const s = this.ship;
    const info = POWER_INFO.life;
    this.texts.push({ x: s.x, y: s.y + 70, text: info.label, color: info.color, life: 1.6 }); // below the wave banner
    Save.store(this.save);
  }

  /** Test mode: clear the field and start wave `n`. */
  private jumpToWave(n: number) {
    this.rocks = [];
    this.ufo = null;
    this.boss = null;
    this.bullets = this.bullets.filter((b) => !b.enemy);
    this.sfx.quiet();
    this.wave = n - 1;
    this.nextWave();
  }

  private nextWave() {
    this.wave++;
    this.waveTimer = 0;
    this.bannerT = 2;
    if (this.wave % BOSS_EVERY === 0) this.spawnBoss();
    else this.spawnRocks(Math.min(3 + this.wave, 11));
  }

  private spawnRocks(count: number) {
    for (let i = 0; i < count; i++) {
      let x = 0;
      let y = 0;
      // Start along an edge, well away from the ship.
      do {
        if (Math.random() < 0.5) {
          x = rand(0, this.w);
          y = Math.random() < 0.5 ? 0 : this.h;
        } else {
          x = Math.random() < 0.5 ? 0 : this.w;
          y = rand(0, this.h);
        }
      } while (Math.hypot(x - this.ship.x, y - this.ship.y) < 220);
      this.addRock(3, x, y, 0, 0);
    }
  }

  private addRock(size: RockSize, x: number, y: number, baseVx: number, baseVy: number) {
    const [lo, hi] = ROCK_SPEED[size];
    const speed = rand(lo, hi) * (1 + Math.max(0, this.wave - 1) * 0.07);
    const a = rand(0, TAU);
    this.rocks.push({
      x,
      y,
      vx: baseVx + Math.cos(a) * speed,
      vy: baseVy + Math.sin(a) * speed,
      r: ROCK_R[size] * 0.88,
      size,
      angle: rand(0, TAU),
      spin: rand(-1.5, 1.5) / size,
      sprite: pick(this.sprites.rocks[size]),
    });
  }

  private newShip(): Ship {
    return {
      x: this.w / 2,
      y: this.h / 2,
      vx: 0,
      vy: 0,
      r: SHIP_R * 0.85,
      angle: -Math.PI / 2,
      alive: false,
      respawn: 0,
      invuln: 0,
      cooldown: 0,
      thrusting: false,
      thrustDir: -Math.PI / 2,
      shield: 0,
      rapid: 0,
      triple: 0,
    };
  }

  private spawnShip() {
    this.ship = { ...this.newShip(), alive: true, invuln: INVULN_TIME };
  }

  private updateShip(dt: number) {
    const s = this.ship;
    const input = this.input;
    if (!s.alive) {
      s.respawn -= dt;
      if (s.respawn <= 0 && this.lives > 0) this.spawnShip();
      this.sfx.thrust(false);
      return;
    }

    const aim = input.aim;
    if (aim !== null) {
      const step = AIM_ROTATE_SPEED * dt;
      s.angle += clamp(angleDiff(aim, s.angle), -step, step);
    } else {
      s.angle += input.rotate * ROTATE_SPEED * dt;
    }

    const thrust = input.thrust;
    s.thrusting = thrust > 0;
    // Twin-stick thrusts toward the left stick, whichever way the ship faces.
    s.thrustDir = input.moveDir ?? s.angle;
    const cos = Math.cos(s.thrustDir);
    const sin = Math.sin(s.thrustDir);
    const speed = SHIP_SPEED * this.shipType.speed;
    s.vx = cos * speed * thrust;
    s.vy = sin * speed * thrust;
    if (s.thrusting) {
      if (Math.random() < 0.6) {
        const a = s.thrustDir + Math.PI + rand(-0.3, 0.3);
        this.particles.push({
          x: s.x - cos * SHIP_R,
          y: s.y - sin * SHIP_R,
          vx: s.vx + Math.cos(a) * rand(80, 160),
          vy: s.vy + Math.sin(a) * rand(80, 160),
          life: 0.35,
          max: 0.35,
          size: rand(1.5, 3),
          color: pick(['#ffd34d', '#ff8a2a', '#ff5a1f']),
          glow: true,
        });
      }
    }
    this.sfx.thrust(s.thrusting);

    this.move(s, dt);

    s.invuln -= dt;
    s.shield -= dt;
    s.rapid -= dt;
    s.triple -= dt;
    s.cooldown -= dt;
    if (s.cooldown <= 0) this.fire(); // auto-fire: the gun is always shooting
  }

  private fire() {
    const s = this.ship;
    const type = this.shipType;
    // Faster-firing, longer-range ships keep more shots in the air.
    const base = s.triple > 0 ? 18 : s.rapid > 0 ? 14 : 6;
    const max = Math.ceil((base * type.guns.length * type.range) / type.fireDelay);
    if (this.bullets.filter((b) => !b.enemy).length >= max) return;
    s.cooldown = (s.rapid > 0 ? RAPID_FIRE_DELAY : FIRE_DELAY) * type.fireDelay;
    // Shoot toward the mouse pointer or the twin-stick aim when there is one,
    // otherwise straight ahead.
    const m = this.input.mouse;
    const aim = m ? Math.atan2(m.y / this.scale - s.y, m.x / this.scale - s.x) : this.input.shootDir ?? s.angle;
    const spreads = s.triple > 0 ? [-0.17, 0, 0.17] : [0];
    for (const gun of type.guns) {
      // Offset sideways from the aim line, so twin cannons fire parallel shots.
      const gx = s.x + Math.cos(aim) * SHIP_R * 1.2 - Math.sin(aim) * gun * SHIP_R;
      const gy = s.y + Math.sin(aim) * SHIP_R * 1.2 + Math.cos(aim) * gun * SHIP_R;
      for (const off of spreads) {
        const a = aim + off;
        this.bullets.push({
          x: gx,
          y: gy,
          vx: s.vx + Math.cos(a) * BULLET_SPEED,
          vy: s.vy + Math.sin(a) * BULLET_SPEED,
          r: 3,
          life: BULLET_LIFE * type.range,
          enemy: false,
        });
      }
    }
    this.sfx.shoot();
  }

  private updateRocks(dt: number) {
    for (const r of this.rocks) {
      this.move(r, dt);
      r.angle += r.spin * dt;
    }
  }

  private updateBullets(dt: number) {
    for (const b of this.bullets) {
      b.life -= dt;
      if (b.life <= 0) b.dead = true;
      if (!b.enemy) {
        this.move(b, dt);
        continue;
      }
      // Enemy shots don't wrap: they fly off the edge and are gone. Only drop
      // them once they head away from the screen, since UFOs fire from off-screen.
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      if ((b.x < -10 && b.vx <= 0) || (b.x > this.w + 10 && b.vx >= 0) || (b.y < -10 && b.vy <= 0) || (b.y > this.h + 10 && b.vy >= 0)) {
        b.dead = true;
      }
    }
  }

  private resetUfoTimer() {
    this.ufoTimer = rand(12, 22) * Math.max(0.45, 1 - this.wave * 0.06);
  }

  private updateUfo(dt: number) {
    if (!this.ufo) {
      this.ufoTimer -= dt;
      if (this.ufoTimer <= 0 && this.ship.alive && !this.boss) this.spawnUfo();
      return;
    }
    const u = this.ufo;
    u.x += u.vx * dt;
    u.y = (((u.y + u.vy * dt) % this.h) + this.h) % this.h;

    u.turnT -= dt;
    if (u.turnT <= 0) {
      u.turnT = rand(0.8, 2);
      u.vy = pick([-1, 0, 1]) * Math.abs(u.vx) * 0.7;
    }

    u.fireT -= dt;
    if (u.fireT <= 0) {
      u.fireT = u.small ? 0.9 : 1.4;
      let a = rand(0, TAU);
      if (u.small && this.ship.alive) {
        const accuracy = Math.max(0.04, 0.45 - this.score / 60000);
        a = Math.atan2(this.ship.y - u.y, this.ship.x - u.x) + rand(-accuracy, accuracy);
      }
      this.enemyShot(u.x, u.y, a, 380, 1.6);
      this.sfx.ufoShoot();
    }

    if (u.x < -u.r * 3 || u.x > this.w + u.r * 3) this.removeUfo();
  }

  private spawnUfo() {
    const small = Math.random() < clamp(0.12 + this.score / 40000 + this.wave * 0.04, 0, 0.75);
    const r = small ? 15 : 25;
    const fromLeft = Math.random() < 0.5;
    const speed = small ? 160 : 110;
    this.ufo = {
      x: fromLeft ? -r * 2 : this.w + r * 2,
      y: rand(this.h * 0.15, this.h * 0.85),
      vx: fromLeft ? speed : -speed,
      vy: 0,
      r,
      small,
      fireT: 1,
      turnT: rand(0.8, 2),
    };
    this.sfx.ufo(small ? 'small' : 'big');
  }

  private removeUfo() {
    this.ufo = null;
    this.sfx.ufo('off');
    this.resetUfoTimer();
  }

  private enemyShot(x: number, y: number, angle: number, speed: number, life: number) {
    this.bullets.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 3.5, life, enemy: true });
  }

  // -------------------------------------------------------------------- boss

  private spawnBoss() {
    const tier = this.wave / BOSS_EVERY;
    const hp = 70 + (tier - 1) * 35;
    this.boss = {
      x: this.w / 2,
      y: -BOSS_R,
      tier,
      hp,
      maxHp: hp,
      t: 0,
      orbit: -Math.PI / 2,
      attackT: BOSS_ENTER_TIME + 1,
      attack: 0,
      spiral: 0,
      spiralT: 0,
      spiralAngle: 0,
      hitT: 0,
    };
    this.sfx.bossWarn();
  }

  /**
   * The mothership glides down from the top, then circles an ellipse around the
   * screen center (which keeps it clear of the ship's respawn point) while cycling
   * through its attacks. Below half health it moves and attacks faster, and its
   * rings come in pairs and its spirals gain a third arm.
   */
  private updateBoss(dt: number) {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    b.hitT -= dt;
    const enraged = b.hp <= b.maxHp / 2;
    if (b.t >= BOSS_ENTER_TIME) b.orbit += (0.35 + 0.06 * b.tier) * (enraged ? 1.5 : 1) * dt;
    const ox = this.w / 2 + Math.cos(b.orbit) * this.w * 0.32;
    const oy = this.h / 2 + Math.sin(b.orbit) * this.h * 0.3 + Math.sin(b.t * 1.7) * 12;
    const k = Math.min(1, b.t / BOSS_ENTER_TIME);
    const ease = k * k * (3 - 2 * k);
    b.x = ox;
    b.y = -BOSS_R + (oy + BOSS_R) * ease;

    if (enraged && Math.random() < dt * 25) {
      const life = rand(0.5, 1);
      this.particles.push({
        x: b.x + rand(-0.7, 0.7) * BOSS_R,
        y: b.y + rand(-0.1, 0.2) * BOSS_R,
        vx: rand(-20, 20),
        vy: rand(-60, -20),
        life,
        max: life,
        size: rand(3, 6),
        color: pick(['#5a5060', '#3a3440', '#ff8a3a']),
        glow: false,
      });
    }

    if (!this.ship.alive) return; // hold fire while the player respawns
    const speed = 230 + b.tier * 25;

    if (b.spiral > 0) {
      b.spiralT -= dt;
      while (b.spiral > 0 && b.spiralT <= 0) {
        b.spiralT += BOSS_SPIRAL_GAP;
        const arms = enraged ? 3 : 2;
        for (let i = 0; i < arms; i++) this.enemyShot(b.x, b.y, b.spiralAngle + (i * TAU) / arms, speed * 0.8, 3);
        b.spiralAngle += 0.33;
        if (b.spiral-- % 4 === 0) this.sfx.ufoShoot();
      }
    }

    b.attackT -= dt;
    if (b.attackT > 0) return;
    b.attackT = Math.max(0.8, 2 - b.tier * 0.2) * (enraged ? 0.6 : 1);
    let kind = BOSS_ATTACKS[b.attack++ % BOSS_ATTACKS.length];
    if (kind === 'spiral' && b.tier < BOSS_SPIRAL_TIER) kind = BOSS_ATTACKS[b.attack++ % BOSS_ATTACKS.length];
    if (kind === 'ring') {
      const n = 12 + b.tier * 2;
      const off = rand(0, TAU);
      for (let i = 0; i < n; i++) this.enemyShot(b.x, b.y, off + (i * TAU) / n, speed, 2.6);
      // A slower second ring, offset half a gap, so there is no straight escape line.
      if (enraged) for (let i = 0; i < n; i++) this.enemyShot(b.x, b.y, off + ((i + 0.5) * TAU) / n, speed * 0.65, 3.5);
    } else if (kind === 'aimed') {
      const a = Math.atan2(this.ship.y - b.y, this.ship.x - b.x);
      const half = 2 + Math.min(b.tier - 1, 2);
      for (let i = -half; i <= half; i++) this.enemyShot(b.x, b.y, a + i * 0.13, speed * 1.5, 2);
    } else if (kind === 'spiral') {
      b.spiral = 24 + b.tier * 6;
      b.spiralT = 0;
      b.spiralAngle = rand(0, TAU);
      b.attackT = Math.max(b.attackT, b.spiral * BOSS_SPIRAL_GAP + 0.6);
    } else if (this.rocks.length < 10) {
      for (let i = 0; i < Math.min(2 + b.tier, 4); i++) this.addRock(2, b.x, b.y + BOSS_R * 0.3, 0, 0);
    }
    this.sfx.ufoShoot();
  }

  /** Hit test against the mothership's wide, flat outline. */
  private hitsBoss(o: Body) {
    const b = this.boss;
    if (!b) return false;
    const dx = (o.x - b.x) / (BOSS_R + o.r);
    const dy = (o.y - b.y) / (BOSS_R * 0.45 + o.r);
    return dx * dx + dy * dy < 1;
  }

  private damageBoss(bullet: Bullet) {
    const b = this.boss;
    if (!b) return;
    b.hp--;
    b.hitT = 0.06;
    this.addScore(10);
    this.explosion(bullet.x, bullet.y, 4, ['#ffe36b', '#ff8a5a'], true, 120);
    this.sfx.bossHit();
    if (b.hp <= 0) this.destroyBoss();
  }

  private destroyBoss() {
    const b = this.boss;
    if (!b) return;
    for (let i = 0; i < 6; i++) {
      this.explosion(b.x + rand(-0.8, 0.8) * BOSS_R, b.y + rand(-20, 20), 40, ['#ffffff', '#ffe36b', '#ff6a3a'], true, 300);
    }
    this.explosion(b.x, b.y, 80, ['#c9ced8', '#6b5566', '#3a3f4a', '#ff4a4a'], false, 260);
    this.sfx.explode(4);
    this.shake = 20;
    const points = BOSS_POINTS * b.tier;
    this.addScore(points);
    this.texts.push({ x: b.x, y: b.y - 20, text: 'BOSS DOWN', color: '#ff6a5a', life: 2 });
    this.texts.push({ x: b.x, y: b.y + 14, text: String(points), color: '#ffe36b', life: 2 });
    this.dropPowerUp(b.x - 30, b.y);
    this.dropPowerUp(b.x + 30, b.y);
    for (const bullet of this.bullets) if (bullet.enemy) bullet.dead = true;
    this.boss = null;
  }

  private updatePowerUps(dt: number) {
    for (const p of this.powerUps) {
      this.move(p, dt);
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) p.dead = true;
    }
  }

  private updateParticles(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - dt * 1.5;
      p.vy *= 1 - dt * 1.5;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
    for (const t of this.texts) {
      t.y -= 30 * dt;
      t.life -= dt;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
  }

  private move(b: Body, dt: number) {
    b.x = (((b.x + b.vx * dt) % this.w) + this.w) % this.w;
    b.y = (((b.y + b.vy * dt) % this.h) + this.h) % this.h;
  }

  // -------------------------------------------------------------- collisions

  /** Circle overlap test, measured across the screen wrap when `wrap` is set. */
  private hits(a: Body, b: Body, wrap = true) {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    if (wrap) {
      if (dx > this.w / 2) dx -= this.w;
      else if (dx < -this.w / 2) dx += this.w;
      if (dy > this.h / 2) dy -= this.h;
      else if (dy < -this.h / 2) dy += this.h;
    }
    const r = a.r + b.r;
    return dx * dx + dy * dy < r * r;
  }

  private collide() {
    const s = this.ship;
    const u = this.ufo;

    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const r of this.rocks) {
        if (r.dead || !this.hits(b, r, !b.enemy)) continue;
        b.dead = true;
        this.breakRock(r, !b.enemy);
        break;
      }
      if (b.dead) continue;
      if (!b.enemy && this.hitsBoss(b)) {
        b.dead = true;
        this.damageBoss(b);
      } else if (u && !b.enemy && this.hits(b, u, false)) {
        b.dead = true;
        this.destroyUfo(true);
      } else if (b.enemy && s.alive && this.hits(b, s, false)) {
        b.dead = true;
        this.shipHit();
      }
    }

    if (this.ufo) {
      for (const r of this.rocks) {
        if (!r.dead && this.hits(this.ufo, r, false)) {
          this.breakRock(r, false);
          this.destroyUfo(false);
          break;
        }
      }
    }

    if (s.alive) {
      for (const r of this.rocks) {
        if (r.dead || !this.hits(s, r)) continue;
        if (s.shield > 0) {
          this.breakRock(r, true);
          this.sfx.shieldHit();
        } else if (s.invuln <= 0) {
          this.breakRock(r, true);
          this.shipHit();
        }
        break;
      }
    }

    if (s.alive && this.hitsBoss(s)) this.shipHit();

    if (s.alive && this.ufo && this.hits(s, this.ufo, false) && (s.shield > 0 || s.invuln <= 0)) {
      this.destroyUfo(true);
      this.shipHit();
    }

    if (s.alive) {
      for (const p of this.powerUps) {
        if (!p.dead && this.hits(s, { ...p, r: p.r + 6 })) {
          p.dead = true;
          this.collect(p);
        }
      }
    }

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.rocks = this.rocks.filter((r) => !r.dead);
    this.powerUps = this.powerUps.filter((p) => !p.dead);
  }

  private breakRock(r: Rock, byPlayer: boolean) {
    r.dead = true;
    this.explosion(r.x, r.y, r.size * 10, ['#b49a80', '#7d6654', '#e0c9a8', '#5a4a3e'], false, r.size * 70);
    this.explosion(r.x, r.y, r.size * 4, ['#ffd34d', '#ff9a3a'], true, r.size * 90);
    this.sfx.explode(r.size);
    this.shake = Math.max(this.shake, r.size * 2);
    if (r.size > 1) {
      const next = (r.size - 1) as RockSize;
      this.addRock(next, r.x, r.y, r.vx * 0.4, r.vy * 0.4);
      this.addRock(next, r.x, r.y, r.vx * 0.4, r.vy * 0.4);
    }
    if (byPlayer) {
      this.addScore(ROCK_SCORE[r.size]);
      const luck = 1 + this.save.upgrades.luck * LUCK_PER_LEVEL;
      if (Math.random() < ROCK_DROP_CHANCE[r.size] * luck) this.dropPowerUp(r.x, r.y);
    }
  }

  private destroyUfo(byPlayer: boolean) {
    const u = this.ufo;
    if (!u) return;
    this.explosion(u.x, u.y, 40, ['#ffffff', '#ffe36b', u.small ? '#ff5050' : '#7dd8ff'], true, 220);
    this.sfx.explode(3);
    this.shake = Math.max(this.shake, 8);
    if (byPlayer) {
      const points = u.small ? 1000 : 200;
      this.addScore(points);
      this.texts.push({ x: u.x, y: u.y, text: String(points), color: '#ffe36b', life: 1.2 });
      if (Math.random() < (u.small ? 1 : 0.5)) this.dropPowerUp(u.x, u.y);
    }
    this.removeUfo();
  }

  private shipHit() {
    const s = this.ship;
    if (s.shield > 0) {
      s.shield = 0;
      s.invuln = 1;
      this.sfx.shieldHit();
      this.explosion(s.x, s.y, 24, ['#38d6ff', '#bdfcff'], true, 200);
      return;
    }
    if (s.invuln > 0) return;
    s.alive = false;
    s.respawn = RESPAWN_TIME;
    this.lives--;
    this.explosion(s.x, s.y, 70, ['#ffffff', '#ffd34d', '#ff6a2a', '#9fb4c8'], true, 260);
    this.sfx.explode(4);
    this.sfx.thrust(false);
    this.shake = 14;
  }

  private dropPowerUp(x: number, y: number) {
    const type: PowerType = Math.random() < 0.1 ? 'life' : pick(['shield', 'rapid', 'triple'] as const);
    const a = rand(0, TAU);
    this.powerUps.push({ x, y, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, r: 14, type, life: 9, t: 0 });
  }

  private collect(p: PowerUp) {
    const s = this.ship;
    if (p.type === 'life') {
      this.lives++;
      this.sfx.extraLife();
    } else {
      this.save.boosts[p.type]++;
      Save.store(this.save);
      this.sfx.powerUp();
    }
    const info = POWER_INFO[p.type];
    const text = p.type === 'life' ? info.label : `+${info.label}`;
    this.texts.push({ x: p.x, y: p.y - 20, text, color: info.color, life: 1.4 });
  }

  /** Spend one held power-up; using one that's already running extends it. */
  private useHeld(type: HeldPower) {
    const s = this.ship;
    if (!s.alive || this.save.boosts[type] <= 0) return;
    this.save.boosts[type]--;
    Save.store(this.save);
    s[type] = Math.max(s[type], 0) + this.powerTime();
    this.sfx.powerUp();
    const info = POWER_INFO[type];
    this.texts.push({ x: s.x, y: s.y - 34, text: info.label, color: info.color, life: 1.2 });
  }

  private addScore(n: number) {
    this.score += n;
    if (this.score >= this.nextLife) {
      this.nextLife += EXTRA_LIFE_EVERY;
      this.lives++;
      this.sfx.extraLife();
      this.texts.push({ x: this.ship.x, y: this.ship.y - 30, text: '1UP', color: '#4fe36a', life: 1.4 });
    }
  }

  private explosion(x: number, y: number, n: number, colors: string[], glow: boolean, speed: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const v = rand(0.2, 1) * speed;
      const life = rand(0.4, 1.1);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life,
        max: life,
        size: glow ? rand(1.5, 3.5) : rand(2, 5),
        color: pick(colors),
        glow,
      });
    }
  }

  // ------------------------------------------------------------------ render

  render(ctx: CanvasRenderingContext2D, view: View) {
    const { dpr, scale } = view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(view.stars, 0, 0);

    const k = dpr * scale;
    const sx = this.shake ? rand(-this.shake, this.shake) : 0;
    const sy = this.shake ? rand(-this.shake, this.shake) : 0;
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    this.drawParticles(ctx);
    for (const r of this.rocks) {
      this.wrapDraw(r.x, r.y, ROCK_R[r.size], (x, y) => this.drawSprite(ctx, r.sprite, x, y, r.angle));
    }
    for (const p of this.powerUps) {
      if (p.life < 2.5 && Math.floor(p.life * 8) % 2 === 0) continue;
      const bob = 1 + Math.sin(p.t * 5) * 0.08;
      this.wrapDraw(p.x, p.y, p.r * 1.5, (x, y) => this.drawSprite(ctx, this.sprites.power[p.type], x, y, 0, bob));
    }
    if (this.boss) this.drawBoss(ctx);
    ctx.globalCompositeOperation = 'lighter';
    for (const b of this.bullets) {
      this.drawSprite(ctx, b.enemy ? this.sprites.enemyBullet : this.sprites.shipBullets[this.save.ship], b.x, b.y, 0);
    }
    ctx.globalCompositeOperation = 'source-over';
    if (this.ufo) {
      const u = this.ufo;
      this.drawSprite(ctx, u.small ? this.sprites.ufoSmall : this.sprites.ufoBig, u.x, u.y, 0);
    }
    if (this.state === 'playing') this.drawShip(ctx);
    this.drawTexts(ctx);

    ctx.setTransform(k, 0, 0, k, 0, 0);
    if (this.state === 'playing') this.drawHud(ctx);
    this.drawOverlay(ctx);
    if (this.testMode) this.drawTestBadge(ctx);

    if (this.input.touchMode) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.drawTouchControls(ctx);
    }
  }

  private drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, angle: number, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.drawImage(s.img, (-s.w / 2) * scale, (-s.h / 2) * scale, s.w * scale, s.h * scale);
    ctx.restore();
  }

  /** Draw something again on the opposite edge when it straddles the screen border. */
  private wrapDraw(x: number, y: number, r: number, draw: (x: number, y: number) => void) {
    draw(x, y);
    const ox = x < r ? this.w : x > this.w - r ? -this.w : 0;
    const oy = y < r ? this.h : y > this.h - r ? -this.h : 0;
    if (ox) draw(x + ox, y);
    if (oy) draw(x, y + oy);
    if (ox && oy) draw(x + ox, y + oy);
  }

  private drawBoss(ctx: CanvasRenderingContext2D) {
    const b = this.boss!;
    const tilt = Math.sin(b.t * 1.3) * 0.04;
    this.drawSprite(ctx, this.sprites.boss, b.x, b.y, tilt);
    if (b.hitT > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      this.drawSprite(ctx, this.sprites.boss, b.x, b.y, tilt);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawShip(ctx: CanvasRenderingContext2D) {
    const s = this.ship;
    if (!s.alive) return;
    if (s.invuln > 0 && s.shield <= 0 && Math.floor(this.time * 10) % 2 === 0) return;

    this.wrapDraw(s.x, s.y, SHIP_R * 1.8, (x, y) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(s.angle);
      // The exhaust only makes sense when thrusting roughly backward from the nose.
      if (s.thrusting && Math.abs(angleDiff(s.thrustDir, s.angle)) < 0.6) {
        this.drawExhaust(ctx, SHIP_R * rand(0.9, 1.6));
      }
      const spr = this.sprites.ships[this.save.ship];
      ctx.drawImage(spr.img, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      ctx.restore();

      if (s.shield > 0 && (s.shield > 2 || Math.floor(this.time * 8) % 2 === 0)) {
        const r = SHIP_R * 1.75 + Math.sin(this.time * 6) * 1.5;
        const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r);
        g.addColorStop(0, 'rgba(56, 214, 255, 0)');
        g.addColorStop(1, 'rgba(56, 214, 255, 0.35)');
        ctx.fillStyle = g;
        ctx.strokeStyle = 'rgba(160, 240, 255, 0.8)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        ctx.stroke();
      }
    });
  }

  /** Engine flame of length `len` behind a ship drawn at the origin facing +x. */
  private drawExhaust(ctx: CanvasRenderingContext2D, len: number) {
    const g = ctx.createLinearGradient(-SHIP_R * 0.8, 0, -SHIP_R * 0.8 - len, 0);
    g.addColorStop(0, '#fff6c0');
    g.addColorStop(0.3, '#ffb347');
    g.addColorStop(1, 'rgba(255, 70, 20, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-SHIP_R * 0.8, -SHIP_R * 0.28);
    ctx.lineTo(-SHIP_R * 0.8 - len, 0);
    ctx.lineTo(-SHIP_R * 0.8, SHIP_R * 0.28);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawParticles(ctx: CanvasRenderingContext2D) {
    for (const glow of [false, true]) {
      ctx.globalCompositeOperation = glow ? 'lighter' : 'source-over';
      for (const p of this.particles) {
        if (p.glow !== glow) continue;
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  private drawTexts(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px system-ui, sans-serif';
    for (const t of this.texts) {
      ctx.globalAlpha = clamp(t.life, 0, 1);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  private drawHud(ctx: CanvasRenderingContext2D) {
    const left = 20 + this.insets.left;
    const top = 16 + this.insets.top;

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.fillText(String(this.score).padStart(5, '0'), left, top);

    for (let i = 0; i < Math.min(this.lives, 8); i++) {
      this.drawSprite(ctx, this.sprites.ships[this.save.ship], left + 12 + i * 26, top + 54, -Math.PI / 2, 0.6);
    }
    if (this.lives > 8) {
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(`×${this.lives}`, left + 8 * 26 + 4, top + 45);
    }

    // Active power-up timers
    const s = this.ship;
    let y = top + 78;
    for (const type of ['shield', 'rapid', 'triple'] as const) {
      const t = s[type];
      if (t <= 0 || !s.alive) continue;
      const info = POWER_INFO[type];
      ctx.fillStyle = info.color;
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(info.label, left, y);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(left, y + 18, 120, 5);
      ctx.fillStyle = info.color;
      const max = this.powerTime();
      ctx.fillRect(left, y + 18, (120 * Math.min(t, max)) / max, 5);
      y += 32;
    }

    // Held power-ups, with the key that uses each one (touch has its own buttons).
    if (!this.input.touchMode) {
      let x = left;
      HELD_POWERS.forEach((type, i) => {
        const n = this.save.boosts[type];
        if (n <= 0) return;
        this.drawSprite(ctx, this.sprites.power[type], x + 14, y + 14, 0, 0.9);
        ctx.fillStyle = POWER_INFO[type].color;
        ctx.font = 'bold 14px system-ui, sans-serif';
        ctx.fillText(`×${n}`, x + 30, y + 7);
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.fillText(`[${i + 1}]`, x + 4, y + 32);
        x += 64;
      });
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.fillText(`WAVE ${this.wave}`, this.w / 2, top + 6);

    if (this.boss) {
      const b = this.boss;
      const bw = Math.min(360, this.w * 0.4);
      const x = this.w / 2 - bw / 2;
      const y = top + 34;
      ctx.fillStyle = '#ff6a5a';
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.fillText(b.tier > 1 ? `MOTHERSHIP MK ${b.tier}` : 'MOTHERSHIP', this.w / 2, y);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(x, y + 18, bw, 8);
      ctx.fillStyle = '#ff4a3a';
      ctx.fillRect(x, y + 18, (bw * b.hp) / b.maxHp, 8);
    }
  }

  private drawOverlay(ctx: CanvasRenderingContext2D) {
    const cx = this.w / 2;
    const cy = this.h / 2;
    const touch = this.input.touchMode;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const blink = Math.floor(this.time * 2) % 2 === 0;

    const title = (text: string, size: number, y: number, color = '#ffffff') => {
      ctx.font = `900 ${size}px system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(255, 140, 40, 0.8)';
      ctx.shadowBlur = 24;
      ctx.fillText(text, cx, y);
      ctx.shadowBlur = 0;
    };
    const line = (text: string, size: number, y: number, color = 'rgba(255,255,255,0.75)') => {
      ctx.font = `600 ${size}px system-ui, sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(text, cx, y);
    };
    const fit = Math.min(1, this.w / 760);

    if (this.settingsOpen) {
      this.drawSettings(ctx, fit);
    } else if (this.state === 'home') {
      this.drawHomeTitle(ctx, 84 * fit, cx, cy - 140);
      if (this.testMode) {
        const { y, minus, plus } = this.testWaveRow();
        line(`START AT WAVE ${this.testStartWave}`, 20, y, '#ff8af0');
        ctx.font = '900 22px system-ui, sans-serif';
        ctx.fillText('◀', minus.x + minus.w / 2, minus.y + minus.h / 2);
        ctx.fillText('▶', plus.x + plus.w / 2, plus.y + plus.h / 2);
      } else if (this.save.best > 0) line(`BEST ${this.save.best}`, 20, cy - 76, 'rgba(255,255,255,0.55)');
      this.homeButtons().forEach((b, i) => {
        this.drawButton(ctx, b, b.label, this.keyNav && i === this.menuIndex, i === 0);
      });
      const owned = (['shield', 'rapid', 'triple', 'life'] as const).filter((t) => this.save.boosts[t] > 0);
      if (owned.length) {
        const list = owned.map((t) => `${POWER_INFO[t].label} ×${this.save.boosts[t]}`).join('  ·  ');
        line(`INVENTORY:  ${list}`, 16 * fit, cy + 198, '#ffd34d');
      }
      if (touch) {
        line('Left thumb: move', 18 * fit, cy + 228);
        line('Right thumb: aim', 18 * fit, cy + 252);
      } else {
        line('W thrust   A / D rotate', 18 * fit, cy + 228);
        line('Auto-fire   1 2 3 power-ups   P pause   M mute', 18 * fit, cy + 252);
      }
      this.drawCoins(ctx);
    } else if (this.state === 'shop') {
      this.drawShop(ctx, fit);
    } else if (this.state === 'hangar') {
      this.drawHangar(ctx, fit);
    } else if (this.state === 'over') {
      title('GAME OVER', 72 * fit, cy - 80);
      line(`SCORE ${this.score}   ·   WAVE ${this.wave}`, 26 * fit, cy);
      if (this.newBest) line('NEW BEST!', 22 * fit, cy + 36, '#4fe36a');
      if (this.testMode) line('TEST RUN: NOTHING SAVED', 22 * fit, cy + 76, '#ff8af0');
      else this.drawCoinAmount(ctx, `+${this.coinsEarned}`, cx, cy + 76, 26, 'center');
      if (this.newShips.length) {
        const names = this.newShips.map((id) => SHIPS[id].name).join(', ');
        line(`NEW SHIP UNLOCKED: ${names}`, 20 * fit, cy + 108, '#38d6ff');
      }
      if (this.overT > 1 && blink) line(touch ? 'TAP TO CONTINUE' : 'PRESS SPACE TO CONTINUE', 24 * fit, cy + 136, '#ffd34d');
    } else if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, this.w, this.h);
      title('PAUSED', 64 * fit, cy - 84);
      const coins = Math.floor(this.score / POINTS_PER_COIN);
      if (coins > 0) this.drawCoinAmount(ctx, `+${coins}`, cx, cy - 34, 22, 'center');
      this.pauseButtons().forEach((b, i) => {
        this.drawButton(ctx, b, b.label, this.keyNav && i === this.menuIndex, i === 0);
      });
    } else if (this.bannerT > 0) {
      ctx.globalAlpha = clamp(this.bannerT, 0, 1);
      if (this.testMode && !touch) line('TEST MODE:  N next wave   B next boss', 18 * fit, cy + 40, '#ff8af0');
      title(`WAVE ${this.wave}`, 56 * fit, cy - 80, '#ffd34d');
      if (this.wave % BOSS_EVERY === 0) line('BOSS INCOMING', 26 * fit, cy - 30, '#ff6a5a');
      ctx.globalAlpha = 1;
    }
  }

  private drawTestBadge(ctx: CanvasRenderingContext2D) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillStyle = '#ff8af0';
    ctx.fillText('TEST MODE', this.w / 2, this.h - 22 - this.insets.bottom);
  }

  /** ROCK BLASTER, with a red UFO bobbing in the O and the player's ship, exhaust flickering, standing in for the A. */
  private drawHomeTitle(ctx: CanvasRenderingContext2D, size: number, x: number, y: number) {
    const before = 'ROCK BL';
    const after = 'STER';
    ctx.font = `900 ${size}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    const w1 = ctx.measureText(before).width;
    const w2 = ctx.measureText(after).width;
    const gap = size * 0.85;
    const left = x - (w1 + gap + w2) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 140, 40, 0.8)';
    ctx.shadowBlur = 24;
    ctx.fillText(before, left, y);
    ctx.fillText(after, left + w1 + gap, y);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';

    const o = ctx.measureText('O');
    const capMid = y + (o.actualBoundingBoxDescent - o.actualBoundingBoxAscent) / 2;
    const ox = left + ctx.measureText('R').width + o.width / 2;
    const ufo = this.sprites.ufoSmall;
    const ufoScale = (size * 0.29) / (ufo.w / 1.2); // saucer about fills the hole in the O
    this.drawSprite(ctx, ufo, ox, capMid + Math.sin(this.time * 2.5) * size * 0.04, Math.sin(this.time * 1.7) * 0.12, ufoScale);

    // Ship nose up, about as tall as the capitals (its hull is about 2.15 SHIP_R long).
    const shipScale = (size * 0.66) / (SHIP_R * 2.15);
    ctx.save();
    ctx.translate(left + w1 + gap / 2, capMid + Math.sin(this.time * 2.5 + 1.5) * size * 0.04); // hovers like the UFO, out of step
    ctx.rotate(-Math.PI / 2);
    ctx.scale(shipScale, shipScale);
    this.drawExhaust(ctx, SHIP_R * rand(0.9, 1.6));
    const spr = this.sprites.ships[this.save.ship];
    ctx.drawImage(spr.img, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    ctx.restore();
  }

  private drawButton(ctx: CanvasRenderingContext2D, r: Rect, label: string, selected: boolean, primary: boolean) {
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = primary ? 'rgba(255, 211, 77, 0.92)' : 'rgba(255,255,255,0.08)';
    ctx.fill();
    ctx.lineWidth = selected ? 3 : 1.5;
    ctx.strokeStyle = selected ? '#ffffff' : primary ? 'rgba(255, 240, 190, 0.9)' : 'rgba(255,255,255,0.35)';
    ctx.stroke();
    ctx.font = '900 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = primary ? '#2a1a04' : '#ffffff';
    ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 1);
  }

  /** A coin icon followed by `text`, anchored at x by its left, center or right edge. */
  private drawCoinAmount(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    size: number,
    align: 'left' | 'center' | 'right',
    color = '#ffd34d',
  ) {
    ctx.font = `bold ${size}px system-ui, sans-serif`;
    const icon = size * 0.95;
    const width = icon + 6 + ctx.measureText(text).width;
    const left = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
    this.drawSprite(ctx, this.sprites.coin, left + icon / 2, y, 0, icon / this.sprites.coin.w * 1.2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, left + icon + 6, y + 1);
  }

  /** Coin balance in the top-right corner. */
  private drawCoins(ctx: CanvasRenderingContext2D) {
    this.drawCoinAmount(ctx, String(this.save.coins), this.w - 20 - this.insets.right, 34 + this.insets.top, 26, 'right');
  }

  /** Dimmed backdrop and title for the shop and hangar. */
  private drawGridHeader(ctx: CanvasRenderingContext2D, fit: number, title: string, titleY: number) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${48 * fit}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 140, 40, 0.8)';
    ctx.shadowBlur = 24;
    ctx.fillText(title, this.w / 2, titleY);
    ctx.shadowBlur = 0;
  }

  /** Card background, flashing green or red after a pick and outlined when selected by keyboard. */
  private drawCard(ctx: CanvasRenderingContext2D, r: Rect, i: number, highlight = false) {
    const flash = this.shopFlash.index === i && this.shopFlash.t > 0 ? this.shopFlash : null;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 12);
    ctx.fillStyle = flash
      ? flash.ok
        ? 'rgba(79, 227, 106, 0.3)'
        : 'rgba(255, 70, 50, 0.3)'
      : 'rgba(255,255,255,0.07)';
    ctx.fill();
    const selected = this.keyNav && this.menuIndex === i;
    ctx.lineWidth = selected || highlight ? 3 : 1;
    ctx.strokeStyle = selected ? '#ffffff' : highlight ? '#4fe36a' : 'rgba(255,255,255,0.2)';
    ctx.stroke();
  }

  private drawShop(ctx: CanvasRenderingContext2D, fit: number) {
    const n = SHOP_ITEMS.length;
    const { items, back, titleY } = this.gridLayout(n);
    this.drawGridHeader(ctx, fit, 'SHOP', titleY);
    this.drawCoins(ctx);

    SHOP_ITEMS.forEach((item, i) => {
      const r = items[i];
      const price = this.priceOf(item);
      const affordable = price !== null && this.save.coins >= price;
      this.drawCard(ctx, r, i);

      const icon = item.kind === 'boost' ? this.sprites.power[item.id] : this.sprites.upgrade[item.id];
      this.drawSprite(ctx, icon, r.x + 38, r.y + r.h / 2, 0, 1.15);

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(item.name, r.x + 72, r.y + 25);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillText(item.desc, r.x + 72, r.y + 49);

      const right = r.x + r.w - 16;
      if (price === null) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#4fe36a';
        ctx.font = 'bold 18px system-ui, sans-serif';
        ctx.fillText(item.kind === 'boost' ? 'FULL' : 'MAX', right, r.y + 25);
      } else {
        this.drawCoinAmount(ctx, String(price), right, r.y + 25, 18, 'right', affordable ? '#ffd34d' : '#a06a5a');
      }
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = 'bold 12px system-ui, sans-serif';
      const status =
        item.kind === 'boost'
          ? `OWNED ${this.save.boosts[item.id]}`
          : `LV ${this.save.upgrades[item.id]}/${item.prices.length}`;
      ctx.fillText(status, right, r.y + 50);
    });

    this.drawButton(ctx, back, 'BACK', this.keyNav && this.menuIndex === n, false);
  }

  private drawHangar(ctx: CanvasRenderingContext2D, fit: number) {
    const n = Save.SHIP_IDS.length;
    const { items, back, titleY } = this.gridLayout(n);
    this.drawGridHeader(ctx, fit, 'HANGAR', titleY);

    Save.SHIP_IDS.forEach((id, i) => {
      const r = items[i];
      const ship = SHIPS[id];
      const unlocked = this.shipUnlocked(id);
      const chosen = id === this.save.ship;
      this.drawCard(ctx, r, i, chosen);

      ctx.globalAlpha = unlocked ? 1 : 0.3;
      this.drawSprite(ctx, this.sprites.ships[id], r.x + 38, r.y + r.h / 2, -Math.PI / 2, 1.2);
      ctx.globalAlpha = 1;

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = unlocked ? '#ffffff' : 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(ship.name, r.x + 72, r.y + 25);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillText(ship.desc, r.x + 72, r.y + 49);

      const right = r.x + r.w - 16;
      ctx.textAlign = 'right';
      ctx.font = 'bold 16px system-ui, sans-serif';
      if (chosen) {
        ctx.fillStyle = '#4fe36a';
        ctx.fillText('FLYING', right, r.y + 25);
      } else if (!unlocked) {
        ctx.fillStyle = '#a06a5a';
        ctx.fillText('LOCKED', right, r.y + 25);
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.font = 'bold 12px system-ui, sans-serif';
        ctx.fillText(`BEST ${ship.unlock} TO UNLOCK`, right, r.y + 50);
      }
    });

    this.drawButton(ctx, back, 'BACK', this.keyNav && this.menuIndex === n, false);
  }

  private drawSettings(ctx: CanvasRenderingContext2D, fit: number) {
    const { rows, reset, back, titleY } = this.settingsLayout();
    const n = VOLUME_ROWS.length;
    const steps = Save.VOLUME_STEPS;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${48 * fit}px system-ui, sans-serif`;
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(255, 140, 40, 0.8)';
    ctx.shadowBlur = 24;
    ctx.fillText('SETTINGS', this.w / 2, titleY);
    ctx.shadowBlur = 0;

    const stepButton = (r: Rect, glyph: string, enabled: boolean) => {
      const s = 40;
      ctx.beginPath();
      ctx.roundRect(r.x + (r.w - s) / 2, r.y + (r.h - s) / 2, s, s, 10);
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = `rgba(255,255,255,${enabled ? 0.5 : 0.15})`;
      ctx.stroke();
      ctx.font = '900 26px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,255,255,${enabled ? 1 : 0.3})`;
      ctx.fillText(glyph, r.x + r.w / 2, r.y + r.h / 2 + 1);
    };

    rows.forEach((row, i) => {
      const level = this.save.volumes[VOLUME_ROWS[i].id];
      const r = row.box;
      ctx.beginPath();
      ctx.roundRect(r.x, r.y, r.w, r.h, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.07)';
      ctx.fill();
      const selected = this.keyNav && this.menuIndex === i;
      ctx.lineWidth = selected ? 3 : 1;
      ctx.strokeStyle = selected ? '#ffffff' : 'rgba(255,255,255,0.2)';
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(VOLUME_ROWS[i].label, r.x + 20, r.y + r.h / 2);

      stepButton(row.minus, '−', level > 0);
      stepButton(row.plus, '+', level < steps);

      const b = row.bar;
      const segGap = 4;
      const segW = (b.w - segGap * (steps - 1)) / steps;
      for (let s = 0; s < steps; s++) {
        ctx.beginPath();
        ctx.roundRect(b.x + s * (segW + segGap), b.y + b.h / 2 - 11, segW, 22, 4);
        ctx.fillStyle = s < level ? '#ffd34d' : 'rgba(255,255,255,0.12)';
        ctx.fill();
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = level > 0 ? '#ffd34d' : 'rgba(255,255,255,0.45)';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(level > 0 ? `${Math.round((level / steps) * 100)}%` : 'OFF', r.x + r.w - 16, r.y + r.h / 2);
    });

    if (reset) {
      const armed = this.resetArmT > 0;
      const done = this.resetDoneT > 0;
      const selected = this.keyNav && this.menuIndex === n;
      ctx.beginPath();
      ctx.roundRect(reset.x, reset.y, reset.w, reset.h, 14);
      ctx.fillStyle = armed ? 'rgba(255, 70, 50, 0.85)' : done ? 'rgba(79, 227, 106, 0.25)' : 'rgba(255, 70, 50, 0.12)';
      ctx.fill();
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.strokeStyle = selected ? '#ffffff' : done ? '#4fe36a' : 'rgba(255, 110, 90, 0.7)';
      ctx.stroke();
      ctx.font = '900 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = armed ? '#ffffff' : done ? '#4fe36a' : '#ff8a70';
      const label = armed ? (this.input.touchMode ? 'TAP AGAIN TO CONFIRM' : 'PRESS AGAIN TO CONFIRM') : done ? 'PROGRESS CLEARED' : 'RESET PROGRESS';
      ctx.fillText(label, reset.x + reset.w / 2, reset.y + reset.h / 2 + 1);
    }

    this.drawButton(ctx, back, 'BACK', this.keyNav && this.menuIndex === (reset ? n + 1 : n), false);

    if (this.sfx.muted) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff8a70';
      ctx.font = '600 16px system-ui, sans-serif';
      ctx.fillText('MUTED — PRESS M TO UNMUTE', this.w / 2, back.y + back.h + 28);
    }
  }

  /** A floating joystick, drawn at its resting spot when no thumb is on it. */
  private drawStick(ctx: CanvasRenderingContext2D, s: Input['stick'], home: { x: number; y: number }, tint: string) {
    const ox = s ? s.ox : home.x;
    const oy = s ? s.oy : home.y;
    ctx.beginPath();
    ctx.arc(ox, oy, JOY_RADIUS, 0, TAU);
    ctx.fillStyle = `rgba(${tint},0.06)`;
    ctx.fill();
    ctx.strokeStyle = `rgba(${tint},${s ? 0.35 : 0.15})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(s ? s.x : ox, s ? s.y : oy, 26, 0, TAU);
    ctx.fillStyle = `rgba(${tint},${s ? 0.4 : 0.15})`;
    ctx.fill();
  }

  private drawTouchControls(ctx: CanvasRenderingContext2D) {
    const input = this.input;
    if (this.state === 'playing') {
      this.drawStick(ctx, input.stick, input.stickHome(), '255,255,255');
      this.drawStick(ctx, input.aimStick, input.aimStickHome(), '255,120,90');
    }

    if (this.state === 'playing') {
      // Use-power-up buttons, dimmed when none of that kind is held.
      input.powerButtons().forEach((b, i) => {
        const type = HELD_POWERS[i];
        const n = this.save.boosts[type];
        const spr = this.sprites.power[type];
        ctx.globalAlpha = n > 0 ? 1 : 0.25;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, TAU);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fill();
        ctx.strokeStyle = POWER_INFO[type].color;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.drawImage(spr.img, b.x - b.r * 1.2, b.y - b.r * 1.2, b.r * 2.4, b.r * 2.4);
        if (n > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 13px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(n), b.x + b.r * 0.8, b.y - b.r * 0.8);
        }
        ctx.globalAlpha = 1;
      });
    }

    if (this.state === 'playing') {
      const p = input.pauseButton();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillRect(p.x - 8, p.y - 9, 5, 18);
      ctx.fillRect(p.x + 3, p.y - 9, 5, 18);
    }
  }
}
