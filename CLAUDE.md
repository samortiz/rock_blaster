# Rock Blaster

Asteroids-style arcade game. TypeScript + HTML5 Canvas, bundled with Vite, wrapped for Android/iOS with Capacitor 8. No game engine, no image or audio assets: all sprites are drawn procedurally and all sounds are synthesized with Web Audio.

## Commands

```
npm run dev       # Vite dev server (--host, so phones on the LAN can connect)
npm run build     # tsc type-check + vite build -> dist/
npm run sync      # build + cap sync (copy dist/ into android/ and ios/)
npm run android   # build, sync, open Android Studio
npm run ios       # build, sync, open Xcode (macOS only)
```

There are no tests. Verify changes by building and playing in a browser; use a phone-sized viewport with touch emulation to check the touch controls.

## Layout

- `src/main.ts`: canvas setup, resize and DPR handling, safe-area insets, main loop (dt capped at 1/30 s), auto-pause on blur.
- `src/game.ts`: all game state, update, collisions and rendering. Tuning constants are at the top of the file.
- `src/input.ts`: keyboard (WASD/arrows, Space, 1-3 use held power-up, P/Esc pause, M mute) plus touch twin sticks (left half: floating stick that moves the ship; right half: floating stick that aims and fires; power-up buttons above the aim stick; pause button top-right).
- `src/sprites.ts`: procedural sprites rendered once into offscreen canvases, plus the starfield background.
- `src/audio.ts`: `Sfx` class for Web Audio sound effects.
- `android/`, `ios/`: generated Capacitor native projects. Treat them as source: they contain hand edits (see below).

## Conventions and gotchas

- **World units, not pixels.** The world is sized so the screen's short side is 720 units (580 when the short side is under 500 CSS px). Gameplay sizes and speeds are in world units. HUD and overlays draw in world units; touch controls draw in CSS pixels (`drawTouchControls`). Insets reach `Game` already converted to world units, while `Input` gets CSS pixels.
- **Screen wrap.** Use `move()` for positions and `hits()` for collisions, which measures across the wrap; UFO checks pass `wrap = false` because UFOs enter from off-screen. Enemy bullets don't wrap either: they move straight and are removed once they leave the screen heading outward, so their checks also pass `wrap = false`. Draw anything that can straddle an edge with `wrapDraw()`.
- **Entity removal.** Set `dead = true` during collisions; arrays are filtered at the end of `collide()`.
- **Audio** only starts after a user gesture: `Input` calls `sfx.unlock()` on the first keydown or pointerdown. Continuous sounds (thrust, UFO siren) are state toggles, so call `sfx.quiet()` when pausing or ending the game. Sound effects go through `sfxBus` and music through `musicBus`, both into `master`; the Settings screen's three volume levels (saved in `save.ts`) set those gains.
- **Ships** unlock from the best score, so only the chosen ship is saved. A new ship needs an id in `SHIP_IDS` (`save.ts`), stats and unlock score in `SHIPS` (`game.ts`), and an outline and colors in `SHIP_LOOKS` (`sprites.ts`).
- **Input edges** (start, pause, use power-up) are latched and read once per frame with `consumeStart()` / `consumePause()` / `consumePower()`.
- **Capacitor config is `capacitor.config.json`, not `.ts`.** TypeScript 7 no longer exposes the compiler API Capacitor uses to load a TS config.
- `vite.config.ts` sets `base: './'` so the bundle loads inside Capacitor's webview. Keep it.
- **Native tweaks** that `cap sync` won't overwrite but a fresh `cap add` would:
  - `android/app/src/main/res/values/styles.xml`: fullscreen.
  - `values-v28/styles.xml`: draw under display cutouts.
  - `android/app/src/main/AndroidManifest.xml`: `screenOrientation="sensorLandscape"`.
  - App icons (the ship from `Sprites.ship` on a starfield): `android/app/src/main/res/mipmap-*/ic_launcher*.png`, with the adaptive icon XML in `mipmap-anydpi-v26/` pointing at `@mipmap/ic_launcher_background`; `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`.
  - `ios/App/App/Info.plist`: status bar hidden; landscape-only orientations (iPhone and iPad) plus `UIRequiresFullScreen`.
