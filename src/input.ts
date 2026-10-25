// Unified input: WASD/arrows + Space on keyboards, floating joysticks on touch
// screens. Number keys 1-3 (or the small buttons above the aim stick) use a held power-up.
// Touch controls show once the screen is touched and hide again when a
// key is pressed. Twin sticks: the left stick moves in its direction, the
// right stick aims and fires.

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Stick {
  id: number;
  ox: number;
  oy: number;
  x: number;
  y: number;
}

export const JOY_RADIUS = 64;
const DEAD_ZONE = 0.2; // fraction of radius before the stick does anything

const POWER_KEYS = ['Digit1', 'Digit2', 'Digit3'];
const POWER_NUMPAD_KEYS = ['Numpad1', 'Numpad2', 'Numpad3'];

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
]);

export class Input {
  touchMode = false;
  stick: Stick | null = null;
  /** Right-hand aim stick. */
  aimStick: Stick | null = null;
  /** Mouse pointer position in CSS pixels, or null when not using a mouse. */
  mouse: { x: number; y: number } | null = null;
  private keys = new Set<string>();
  private startPressed = false;
  private pausePressed = false;
  private powerPressed: number | null = null;
  private tap: { x: number; y: number } | null = null;
  private menuKeys: string[] = [];
  private screenW = 0;
  private screenH = 0;
  insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor(
    el: HTMLElement,
    private onGesture: () => void,
    private onMute: () => void,
  ) {
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.reset());
    el.addEventListener('pointerdown', (e) => this.pointerDown(e));
    el.addEventListener('pointermove', (e) => this.pointerMove(e));
    el.addEventListener('pointerup', (e) => this.pointerUp(e));
    el.addEventListener('pointercancel', (e) => this.pointerUp(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setScreen(w: number, h: number, insets: Insets) {
    this.screenW = w;
    this.screenH = h;
    this.insets = insets;
  }

  reset() {
    this.keys.clear();
    this.stick = null;
    this.aimStick = null;
  }

  // --- Layout of on-screen controls (CSS pixels) ---

  stickHome() {
    return { x: this.insets.left + 110, y: this.screenH - this.insets.bottom - 110 };
  }

  aimStickHome() {
    return { x: this.screenW - this.insets.right - 110, y: this.screenH - this.insets.bottom - 110 };
  }

  /** Use-power-up buttons in a row above the aim stick, in held-power order. */
  powerButtons() {
    const x = this.screenW - this.insets.right - 96;
    const y = this.screenH - this.insets.bottom - 196;
    return [-1, 0, 1].map((i) => ({ x: x + i * 60, y, r: 24 }));
  }

  pauseButton() {
    return { x: this.screenW - this.insets.right - 38, y: this.insets.top + 38, r: 26 };
  }

  // --- Queries used by the game each frame ---

  /** -1 (left) .. 1 (right) from the keyboard. */
  get rotate() {
    let r = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) r -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) r += 1;
    return r;
  }

  /** 0..1 */
  get thrust() {
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) return 1;
    const m = this.stickMagnitude(this.stick);
    return m < DEAD_ZONE ? 0 : (m - DEAD_ZONE) / (1 - DEAD_ZONE);
  }

  get fire() {
    return this.keys.has('Space') || this.shootDir !== null;
  }

  /** Target heading from the touch joysticks, or null when they're idle. */
  get aim(): number | null {
    return this.shootDir ?? this.moveDir;
  }

  /** Direction to thrust in, from the left stick. */
  get moveDir(): number | null {
    return this.stickAngle(this.stick);
  }

  /** Direction to shoot in, from the right stick. */
  get shootDir(): number | null {
    return this.stickAngle(this.aimStick);
  }

  consumeStart() {
    const v = this.startPressed;
    this.startPressed = false;
    return v;
  }

  consumePause() {
    const v = this.pausePressed;
    this.pausePressed = false;
    return v;
  }

  /** Index (0-2) of the held power-up the player asked to use, or null. */
  consumePower() {
    const v = this.powerPressed;
    this.powerPressed = null;
    return v;
  }

  /** Last click or touch position (CSS pixels) since the previous call, for menus. */
  consumeTap() {
    const v = this.tap;
    this.tap = null;
    return v;
  }

  /** Key codes pressed since the previous call, for menu navigation. */
  consumeMenuKeys() {
    const v = this.menuKeys;
    this.menuKeys = [];
    return v;
  }

  private stickMagnitude(s: Stick | null) {
    if (!s) return 0;
    return Math.min(1, Math.hypot(s.x - s.ox, s.y - s.oy) / JOY_RADIUS);
  }

  private stickAngle(s: Stick | null) {
    if (!s || this.stickMagnitude(s) < DEAD_ZONE) return null;
    return Math.atan2(s.y - s.oy, s.x - s.ox);
  }

  // --- Event handlers ---

  private keyDown(e: KeyboardEvent) {
    this.onGesture();
    this.touchMode = false;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      if (e.code === 'Space' || e.code === 'Enter') this.startPressed = true;
      if (e.code === 'KeyP' || e.code === 'Escape') this.pausePressed = true;
      if (e.code === 'KeyM') this.onMute();
      const power = Math.max(POWER_KEYS.indexOf(e.code), POWER_NUMPAD_KEYS.indexOf(e.code));
      if (power >= 0) this.powerPressed = power;
      this.menuKeys.push(e.code);
    }
    this.keys.add(e.code);
  }

  private pointerDown(e: PointerEvent) {
    this.onGesture();
    e.preventDefault();
    this.tap = { x: e.clientX, y: e.clientY };
    if (e.pointerType === 'mouse') {
      this.startPressed = true;
      return;
    }
    this.touchMode = true;
    this.mouse = null;
    const x = e.clientX;
    const y = e.clientY;

    const p = this.pauseButton();
    if (Math.hypot(x - p.x, y - p.y) < p.r + 12) {
      this.pausePressed = true;
      return;
    }
    this.startPressed = true;

    const power = this.powerButtons().findIndex((b) => Math.hypot(x - b.x, y - b.y) < b.r + 8);
    if (power >= 0) {
      this.powerPressed = power;
      return;
    }

    if (x < this.screenW / 2) {
      if (!this.stick) this.stick = { id: e.pointerId, ox: x, oy: y, x, y };
    } else if (!this.aimStick) {
      this.aimStick = { id: e.pointerId, ox: x, oy: y, x, y };
    }
  }

  private pointerMove(e: PointerEvent) {
    if (e.pointerType === 'mouse') this.mouse = { x: e.clientX, y: e.clientY };
    const s = [this.stick, this.aimStick].find((s) => s?.id === e.pointerId);
    if (!s) return;
    s.x = e.clientX;
    s.y = e.clientY;
    // Floating stick: drag the origin along so the thumb never leaves the rim.
    const dx = s.x - s.ox;
    const dy = s.y - s.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOY_RADIUS) {
      s.ox = s.x - (dx / d) * JOY_RADIUS;
      s.oy = s.y - (dy / d) * JOY_RADIUS;
    }
  }

  private pointerUp(e: PointerEvent) {
    if (this.stick?.id === e.pointerId) this.stick = null;
    if (this.aimStick?.id === e.pointerId) this.aimStick = null;
  }
}
