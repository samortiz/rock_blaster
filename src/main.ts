import './style.css';
import { Sfx } from './audio';
import { Input, Insets } from './input';
import { Game, View } from './game';
import { starfield } from './sprites';

// The world is sized so the screen's short side is always this many units,
// which keeps gameplay consistent from phones to desktops. Phones get a
// slightly smaller world so the ship and rocks aren't tiny.
const worldShortSide = (cssShortSide: number) => (cssShortSide < 500 ? 580 : 720);

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const safeArea = document.getElementById('safe-area')!;

const sfx = new Sfx();
const input = new Input(canvas, () => sfx.unlock(), () => sfx.toggleMute());
const game = new Game(input, sfx);

let view: View;

function readInsets(): Insets {
  const cs = getComputedStyle(safeArea);
  return {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const cssW = window.innerWidth;
  const cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const short = Math.min(cssW, cssH);
  const scale = short / worldShortSide(short);
  const insets = readInsets();
  input.setScreen(cssW, cssH, insets);
  game.resize(cssW / scale, cssH / scale, {
    top: insets.top / scale,
    right: insets.right / scale,
    bottom: insets.bottom / scale,
    left: insets.left / scale,
  }, scale);
  view = { dpr, scale, cssW, cssH, stars: starfield(canvas.width, canvas.height) };
}

window.addEventListener('resize', resize);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.pause();
    sfx.sleep();
  } else {
    sfx.wake();
  }
});
window.addEventListener('blur', () => game.pause());
resize();

let last = performance.now();
function frame(now: number) {
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  game.update(dt);
  game.render(ctx, view);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
