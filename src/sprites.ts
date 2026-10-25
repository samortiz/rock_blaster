// Procedurally drawn sprites, rendered once into offscreen canvases.
// Each sprite is centered; `w`/`h` are its size in world units.

import type { ShipId } from './save';

const RES = 2.5; // canvas pixels per world unit, so sprites stay crisp on high-DPI screens
const TAU = Math.PI * 2;

export interface Sprite {
  img: HTMLCanvasElement;
  w: number;
  h: number;
}

function surface(w: number, h: number) {
  const img = document.createElement('canvas');
  img.width = Math.ceil(w * RES);
  img.height = Math.ceil(h * RES);
  const ctx = img.getContext('2d')!;
  ctx.scale(RES, RES);
  ctx.translate(w / 2, h / 2);
  return { img, ctx };
}

type Pt = [number, number];

/** Outline and paint scheme of a player ship. Points are in units of the collision radius, nose along +x. */
export interface ShipLook {
  /** Upper half of the hull (y <= 0) from nose to tail; mirrored for the lower half. */
  hull: Pt[];
  /** Trim on the upper wing, mirrored onto the lower one and clipped to the hull. */
  stripe: Pt[];
  /** Cockpit center and half-length along x. */
  cockpit: [number, number];
  hullColors: [string, string, string];
  outline: string;
  trim: string;
  glass: [string, string];
}

export const SHIP_LOOKS: Record<ShipId, ShipLook> = {
  viper: {
    hull: [[1.2, 0], [-0.55, -1.05], [-0.95, -1.0], [-0.6, -0.32], [-0.85, 0]],
    stripe: [[-0.2, -0.78], [-0.55, -1.05], [-0.75, -1.02], [-0.42, -0.7]],
    cockpit: [0.28, 0.4],
    hullColors: ['#8ea3b8', '#f2f7ff', '#5d7088'],
    outline: '#1f2b3a',
    trim: '#e8483c',
    glass: ['#bff6ff', '#1b7fa8'],
  },
  hornet: {
    hull: [[1.4, 0], [0.15, -0.3], [-0.7, -1.12], [-0.98, -1.06], [-0.62, -0.3], [-0.85, 0]],
    stripe: [[-0.3, -0.62], [-0.7, -1.12], [-0.88, -1.08], [-0.5, -0.58]],
    cockpit: [0.38, 0.42],
    hullColors: ['#c9a227', '#fff1a8', '#8a6a10'],
    outline: '#2a2008',
    trim: '#1e1e1e',
    glass: ['#e6fbff', '#2a5f8a'],
  },
  warden: {
    hull: [[1.12, 0], [0.92, -0.36], [0.2, -0.52], [-0.3, -1.12], [-0.95, -1.12], [-0.72, -0.4], [-0.9, 0]],
    stripe: [[0.05, -0.62], [-0.3, -1.12], [-0.55, -1.12], [-0.2, -0.6]],
    cockpit: [0.3, 0.38],
    hullColors: ['#5e8a5a', '#d8f5c8', '#2f4f30'],
    outline: '#142414',
    trim: '#f0a020',
    glass: ['#fff0b8', '#b06a10'],
  },
  phantom: {
    hull: [[0.55, 0], [1.28, -0.3], [1.18, -0.52], [0.2, -0.62], [-0.5, -1.15], [-0.95, -0.95], [-0.65, -0.3], [-0.85, 0]],
    stripe: [[0.9, -0.3], [1.28, -0.3], [1.18, -0.52], [0.8, -0.52]],
    cockpit: [0.1, 0.32],
    hullColors: ['#6a4a9a', '#e4d4ff', '#2e1e4a'],
    outline: '#160a2a',
    trim: '#38d6ff',
    glass: ['#ffd8f8', '#9a2a8a'],
  },
  nova: {
    hull: [[1.45, 0], [0.3, -0.3], [-0.95, -1.18], [-0.75, -0.36], [-0.88, 0]],
    stripe: [[0.3, -0.3], [-0.95, -1.18], [-0.9, -0.95], [0.1, -0.24]],
    cockpit: [0.42, 0.45],
    hullColors: ['#b8501a', '#ffd9a0', '#5a1e08'],
    outline: '#2a0e04',
    trim: '#fff3b0',
    glass: ['#fffbe0', '#c8800f'],
  },
  razor: {
    hull: [[1.25, 0], [0.45, -0.24], [0.2, -0.55], [0.95, -0.62], [0.9, -0.78], [-0.45, -1.0], [-0.95, -0.85], [-0.68, -0.3], [-0.88, 0]],
    stripe: [[0.2, -0.55], [0.95, -0.62], [0.9, -0.78], [0.15, -0.72]],
    cockpit: [0.35, 0.36],
    hullColors: ['#3a8a8a', '#c8fff4', '#174444'],
    outline: '#0a2020',
    trim: '#ff4fa0',
    glass: ['#fff0f8', '#a02a6a'],
  },
  titan: {
    hull: [[1.05, 0], [0.95, -0.42], [0.4, -0.6], [0.1, -1.1], [-0.6, -1.2], [-0.98, -0.8], [-0.75, -0.35], [-0.92, 0]],
    stripe: [[0.25, -0.8], [0.1, -1.1], [-0.12, -1.13], [0.03, -0.8]],
    cockpit: [0.4, 0.34],
    hullColors: ['#9a3030', '#ffc8c0', '#4a1010'],
    outline: '#200606',
    trim: '#d0d8e0',
    glass: ['#e0f4ff', '#3a6a9a'],
  },
  eclipse: {
    hull: [[1.4, 0], [0.6, -0.18], [0.1, -0.4], [-0.3, -1.2], [-0.55, -1.25], [-0.6, -0.7], [-0.95, -0.5], [-0.7, -0.2], [-0.9, 0]],
    stripe: [[-0.05, -0.6], [-0.3, -1.2], [-0.55, -1.25], [-0.32, -0.6]],
    cockpit: [0.45, 0.42],
    hullColors: ['#3a4a7a', '#e0e8ff', '#141a3a'],
    outline: '#06081a',
    trim: '#ffd34d',
    glass: ['#fff6d0', '#c89a10'],
  },
};

/** Closed path through `half` and its mirror image below the x axis. */
function mirroredPath(ctx: CanvasRenderingContext2D, half: Pt[], r: number) {
  const pts = [...half, ...half.map(([x, y]): Pt => [x, -y]).reverse()];
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * r, y * r) : ctx.moveTo(x * r, y * r)));
  ctx.closePath();
}

/** Player ship pointing along +x. `r` is the collision radius. */
export function ship(r: number, look: ShipLook): Sprite {
  const s = r * 3;
  const { img, ctx } = surface(s, s);

  // Hull
  mirroredPath(ctx, look.hull, r);
  const hull = ctx.createLinearGradient(0, -r, 0, r);
  hull.addColorStop(0, look.hullColors[0]);
  hull.addColorStop(0.45, look.hullColors[1]);
  hull.addColorStop(1, look.hullColors[2]);
  ctx.fillStyle = hull;
  ctx.fill();

  // Wing stripes
  ctx.save();
  ctx.clip();
  ctx.fillStyle = look.trim;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    look.stripe.forEach(([x, y], i) => (i ? ctx.lineTo(x * r, side * y * r) : ctx.moveTo(x * r, side * y * r)));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  mirroredPath(ctx, look.hull, r);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = look.outline;
  ctx.stroke();

  // Engine nozzle
  ctx.fillStyle = '#39475a';
  ctx.fillRect(-r * 0.9, -r * 0.22, r * 0.3, r * 0.44);

  // Cockpit
  const [cx, cw] = look.cockpit;
  ctx.beginPath();
  ctx.ellipse(cx * r, 0, cw * r, r * 0.2, 0, 0, TAU);
  const glass = ctx.createLinearGradient(0, -r * 0.2, 0, r * 0.2);
  glass.addColorStop(0, look.glass[0]);
  glass.addColorStop(1, look.glass[1]);
  ctx.fillStyle = glass;
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = look.outline;
  ctx.stroke();

  return { img, w: s, h: s };
}

/** A lumpy rock with craters. `r` is its nominal radius. */
export function rock(r: number): Sprite {
  const s = r * 2.3;
  const { img, ctx } = surface(s, s);

  const n = 9 + Math.floor(Math.random() * 5);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (Math.random() - 0.5) * 0.4;
    const d = r * (0.8 + Math.random() * 0.28);
    if (i === 0) ctx.moveTo(Math.cos(a) * d, Math.sin(a) * d);
    else ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();

  const hue = 20 + Math.random() * 20;
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r * 1.1);
  body.addColorStop(0, `hsl(${hue} 22% 62%)`);
  body.addColorStop(0.55, `hsl(${hue} 20% 40%)`);
  body.addColorStop(1, `hsl(${hue} 22% 20%)`);
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = Math.max(1.2, r * 0.05);
  ctx.strokeStyle = `hsl(${hue} 25% 14%)`;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  const craters = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < craters; i++) {
    const a = Math.random() * TAU;
    const d = Math.random() * r * 0.6;
    const cx = Math.cos(a) * d;
    const cy = Math.sin(a) * d;
    const cr = r * (0.1 + Math.random() * 0.17);
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0, TAU);
    ctx.fillStyle = `hsla(${hue} 25% 12% / 0.45)`;
    ctx.fill();
    // Lit lower-right rim (light comes from the upper left)
    ctx.beginPath();
    ctx.arc(cx, cy, cr, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.lineWidth = Math.max(0.8, cr * 0.25);
    ctx.strokeStyle = 'rgba(255, 238, 215, 0.28)';
    ctx.stroke();
  }
  for (let i = 0; i < r * 0.8; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,240,220,0.12)';
    ctx.fillRect((Math.random() - 0.5) * r * 2, (Math.random() - 0.5) * r * 2, 1.2, 1.2);
  }
  ctx.restore();

  return { img, w: s, h: s };
}

/** Flying saucer. `small` saucers are red and more dangerous. */
export function ufo(r: number, small: boolean): Sprite {
  const s = r * 2.4;
  const { img, ctx } = surface(s, s);

  // Dome
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.18, r * 0.45, r * 0.45, 0, Math.PI, TAU);
  const dome = ctx.createLinearGradient(0, -r * 0.65, 0, -r * 0.1);
  dome.addColorStop(0, small ? '#ffd2d2' : '#d8fbff');
  dome.addColorStop(1, small ? '#a3263a' : '#2a8bb0');
  ctx.fillStyle = dome;
  ctx.fill();

  // Saucer body
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.34, 0, 0, TAU);
  const body = ctx.createLinearGradient(0, -r * 0.34, 0, r * 0.34);
  body.addColorStop(0, small ? '#f0a0a0' : '#e6ecf3');
  body.addColorStop(0.5, small ? '#b8323f' : '#8d9cad');
  body.addColorStop(1, small ? '#4a0f18' : '#36414e');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#151a22';
  ctx.stroke();

  // Underside
  ctx.beginPath();
  ctx.ellipse(0, r * 0.22, r * 0.55, r * 0.18, 0, 0, Math.PI);
  ctx.fillStyle = '#20262f';
  ctx.fill();

  // Lights
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.arc(i * r * 0.36, r * 0.04, r * 0.07, 0, TAU);
    ctx.fillStyle = i % 2 === 0 ? '#ffe36b' : '#7dff9b';
    ctx.fill();
  }

  return { img, w: s, h: s };
}

/** Boss mothership: a wide armored saucer `r` across from center to rim, `r * 0.5` tall. */
export function mothership(r: number): Sprite {
  const s = r * 2.3;
  const { img, ctx } = surface(s, s);

  // Glowing core under the dome
  const glow = ctx.createRadialGradient(0, -r * 0.2, 0, 0, -r * 0.2, r * 0.5);
  glow.addColorStop(0, 'rgba(255, 90, 60, 0.9)');
  glow.addColorStop(1, 'rgba(255, 40, 40, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-r * 0.6, -r * 0.75, r * 1.2, r * 1.1);

  // Dome
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.18, r * 0.36, r * 0.34, 0, Math.PI, TAU);
  const dome = ctx.createLinearGradient(0, -r * 0.55, 0, -r * 0.15);
  dome.addColorStop(0, '#ffd0c0');
  dome.addColorStop(1, '#8a1020');
  ctx.fillStyle = dome;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#2a0810';
  ctx.stroke();

  // Side cannons
  for (const side of [-1, 1]) {
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(side * r * 0.95 - r * 0.08, r * 0.08, r * 0.16, r * 0.34);
    ctx.fillStyle = '#ff5a3a';
    ctx.fillRect(side * r * 0.95 - r * 0.05, r * 0.38, r * 0.1, r * 0.06);
  }

  // Hull
  ctx.beginPath();
  ctx.ellipse(0, 0, r, r * 0.3, 0, 0, TAU);
  const hull = ctx.createLinearGradient(0, -r * 0.3, 0, r * 0.3);
  hull.addColorStop(0, '#c9ced8');
  hull.addColorStop(0.45, '#6b5566');
  hull.addColorStop(1, '#221a24');
  ctx.fillStyle = hull;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#120c14';
  ctx.stroke();

  // Armor seams
  ctx.strokeStyle = 'rgba(20, 10, 20, 0.6)';
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(i * r * 0.26, -r * 0.27 * Math.sqrt(1 - (i * 0.26) ** 2));
    ctx.lineTo(i * r * 0.3, r * 0.29 * Math.sqrt(1 - (i * 0.3) ** 2));
    ctx.stroke();
  }

  // Underside with a glowing hatch
  ctx.beginPath();
  ctx.ellipse(0, r * 0.2, r * 0.6, r * 0.2, 0, 0, Math.PI);
  ctx.fillStyle = '#1a1420';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, r * 0.26, r * 0.22, r * 0.08, 0, 0, TAU);
  ctx.fillStyle = '#ff6a3a';
  ctx.fill();

  // Rim lights
  for (let i = -4; i <= 4; i++) {
    ctx.beginPath();
    ctx.arc(i * r * 0.21, r * 0.04, r * 0.045, 0, TAU);
    ctx.fillStyle = i % 2 === 0 ? '#ff4a4a' : '#ffe36b';
    ctx.fill();
  }

  return { img, w: s, h: s };
}

/** Round power-up token with a letter glyph. */
export function powerUp(r: number, color: string, glyph: string): Sprite {
  const s = r * 3;
  const { img, ctx } = surface(s, s);

  const glow = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.5);
  glow.addColorStop(0, color + '88');
  glow.addColorStop(1, color + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(-s / 2, -s / 2, s, s);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  const body = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#ffffff');
  body.addColorStop(0.35, color);
  body.addColorStop(1, '#111');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#ffffffcc';
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.font = `bold ${r * 1.1}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 3;
  ctx.fillText(glyph, 0, r * 0.06);

  return { img, w: s, h: s };
}

/** Gold coin used for the shop currency. */
export function coin(r: number): Sprite {
  const s = r * 2.4;
  const { img, ctx } = surface(s, s);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  const body = ctx.createRadialGradient(-r * 0.35, -r * 0.35, r * 0.1, 0, 0, r);
  body.addColorStop(0, '#fff6c0');
  body.addColorStop(0.45, '#ffc531');
  body.addColorStop(1, '#a8650c');
  ctx.fillStyle = body;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#6b3f06';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, r * 0.68, 0, TAU);
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = '#c8800f';
  ctx.stroke();

  // Four-point star
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU - Math.PI / 2;
    const d = i % 2 === 0 ? r * 0.5 : r * 0.17;
    ctx.lineTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  ctx.closePath();
  ctx.fillStyle = '#fff3b0';
  ctx.fill();

  return { img, w: s, h: s };
}

/** Glowing bullet. */
export function bullet(r: number, core: string, glow: string): Sprite {
  const s = r * 6;
  const { img, ctx } = surface(s, s);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 3);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.25, core);
  g.addColorStop(0.5, glow + '66');
  g.addColorStop(1, glow + '00');
  ctx.fillStyle = g;
  ctx.fillRect(-s / 2, -s / 2, s, s);
  return { img, w: s, h: s };
}

/** Full-screen background of stars and faint nebulae, in device pixels. */
export function starfield(w: number, h: number): HTMLCanvasElement {
  const img = document.createElement('canvas');
  img.width = w;
  img.height = h;
  const ctx = img.getContext('2d')!;
  ctx.fillStyle = '#05060c';
  ctx.fillRect(0, 0, w, h);

  const size = Math.max(w, h);
  for (const color of ['60, 40, 120', '20, 70, 110', '110, 30, 70']) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const r = size * (0.25 + Math.random() * 0.3);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${color}, 0.16)`);
    g.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  const count = Math.floor((w * h) / 2500);
  for (let i = 0; i < count; i++) {
    const big = Math.random() < 0.04;
    ctx.fillStyle = `rgba(${200 + Math.random() * 55}, ${200 + Math.random() * 55}, 255, ${
      0.2 + Math.random() * (big ? 0.8 : 0.5)
    })`;
    const d = big ? 2.2 : 1.2;
    ctx.fillRect(Math.random() * w, Math.random() * h, d, d);
  }
  return img;
}
