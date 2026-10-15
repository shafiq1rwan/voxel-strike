# Testing

VOXELSTRIKE is tested by headless-browser suites that drive the real game in
Microsoft Edge through `puppeteer-core` (no browser download). They play the
game, assert on state through a debug handle, and save screenshots to
`scripts/shots/`. There's no unit-test framework; `npm run build` adds the
type check.

## Running

1. Start a server: `npm run dev` (port 5173), or `npm run build && npm run
   preview` (port 4173). For `poki.mjs` use `npm run dev:poki`.
2. Run a suite: `node scripts/<name>.mjs`. Each takes an optional URL, e.g.
   `node scripts/e2e.mjs "http://localhost:4173/?seed=777"`.
3. A suite prints `PASS:` / `FAIL:` lines and exits non-zero on any failure
   or any page error.

If port 5173 is busy, Vite moves to 5174 — pass that URL explicitly.

Before calling work done: `npm run build` plus the suites that touch what you
changed (when in doubt, all of them).

## Suites

| Suite | Covers |
|---|---|
| `smoke.mjs` | Boot, move, shoot, explode; fails on any console error; enemy-bounds watchdog |
| `e2e.mjs` | The whole 3-sector campaign: aggro, barrel chain, key → vault → lift → exit, results screen |
| `movement.mjs` | WASD displacement matches the camera basis at 5 yaw angles |
| `firing.mjs` | Spam-click, hold-to-fire and the click buffer |
| `aimassist.mjs` | Touch: magnetism snaps a 3° miss, 9° stays a miss, sticky-aim ratio ~0.55, held fire pulls a 7° miss on, no idle drift; desktop never assisted |
| `features.mjs` | Ticker suicide + corpse chain, key ambush, powerups, score + combo, arena/brute/arc caster, headshots, automap, lift ride, door push regression, touch map, touch weapon button + wheel + auto-switch, phone-size settings |
| `checkpoint.mjs` | Run flow without reloads: retry with sector-entry gear, save + Continue, quit to menu, new run, graphics-lost overlay |
| `monkey.mjs` | Randomized stress run with NaN / out-of-world invariants |
| `coop.mjs` | Two tabs over BroadcastChannel: link + seed handshake, avatar/puppet sync, authority routing, shared keys/score, level transition, respawn, mouse recapture |
| `poki.mjs` | **Poki mode only:** stubbed SDK — init/loading order, ad breaks mute audio, gameplayStart/Stop dedupe, `measure()` events (level 1 start, level complete / fail), hidden co-op, boots with the SDK blocked ([POKI.md](../POKI.md)) |

Tool scripts (not tests): `gen-icons.mjs` regenerates PWA icons,
`shot-pickups.mjs` renders the pickups for a look check,
`itch-download.mjs` downloads a free itch.io project, `zip-poki.ps1` builds
the Poki upload zip.

## Hooks the tests use

- `window.__voxelstrike` is the `Game` instance: set state, move the player,
  give weapons, freeze enemies, read anything.
- `?seed=N` reproduces a layout exactly.
- `localStorage.setItem('voxelstrike-tutorial-done', '1')` before load skips
  the first-run hints.

## The fake pointer lock

Every suite calls `fakePointerLock(browser)` right after
`puppeteer.launch()` (`scripts/lib/fake-pointer-lock.mjs`). Headless Edge is
a real hidden window, and a real pointer lock captures the **OS** cursor —
it used to yank the developer's mouse to the corner during runs. The fake
emulates the API in-page and keeps the browser's rules: a lock needs a fresh
user gesture (puppeteer input counts, a JS `.click()` doesn't), the tab must
be visible and focused, and Esc releases it. **New suites must call it too.**

## Gotchas

- **Don't edit source while suites run.** Vite reloads the page on save, and
  the run fails with "page reload" or "barely moved" errors that aren't real.
- **Screens arm before they accept clicks** (0.7 s, 1.2 s on the results
  screen). Wait before clicking through them.
- **Locked pointer eats clicks.** While locked, real mouse clicks hit the
  canvas, not DOM buttons: `document.exitPointerLock()` (or JS `.click()`)
  before clicking a menu mid-game.
- **Touch tests** use `setViewport({ hasTouch: true, isMobile: true })` and
  `page.touchscreen` (`tap`, `touchStart` / `touchMove` / `touchEnd`).
- **Background tabs freeze `requestAnimationFrame`.** The game runs a 50 ms
  heartbeat when hidden, and `coop.mjs` launches Edge with the background
  throttling flags off.
- **Alt+Tab clutter (Windows 11):** each run's hidden Edge window can show up
  in Alt+Tab as a stale "VOXELSTRIKE" entry. Turn off Settings → System →
  Multitasking → "Show tabs from apps when snapping or pressing Alt+Tab", or
  restart Windows Explorer to clear them. Edge no longer supports the old
  windowless headless mode, so this can't be fixed in the scripts.

## Writing a suite

Copy the top of an existing suite (`smoke.mjs` is the simplest):

```js
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
});
fakePointerLock(browser); // keep the real OS cursor free
```

Collect `pageerror` and `console.error` into a failure list, use a `check()`
helper that prints `PASS:` / `FAIL:`, close the browser in `finally`, and
exit non-zero on failures. Add the suite to the table above and to
CLAUDE.md's command list.
