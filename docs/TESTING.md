# Testing

VOXELSTRIKE is tested by headless-browser suites that drive the real game in
Microsoft Edge through `puppeteer-core` (no browser download). They play the
game, assert on state through a debug handle, and save screenshots to
`scripts/shots/`. There's no unit-test framework; `npm run build` adds the
type check. Every suite takes the browser from the `VOXEL_BROWSER` env var
when set (any Chromium executable, e.g. a Chrome for Testing from
`npx @puppeteer/browsers install chrome@stable --path <dir>`), falling back
to the Edge path below — handy where Edge refuses to launch headless.

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
| `e2e.mjs` | The whole 5-sector campaign: aggro, barrel chain, key → vault → lift → exit, the facility terminal after sector 3 (types, a click prints the rest, the next click powers off into sector 4; sector 4 built behind it and saved, the tank count it prints matches the level), the generated Biofoundry played through (lab theme, tanks with a dormant Vatborn in each occupied one), sector 5 reached through an ordinary intermission, still the Biofoundry with more full tanks, three seeds → three different Biofoundry layouts that all keep keycard → red door → lift → pad, sector 5 has more full tanks and more enemies than sector 4 over four seeds, results screen, every sector clear ranks S–C and offers 3 perks (a click skips the tally, a card descends), four perks collected by the end, sector 5 has the Broodkeeper as the objective with the keycard held back until it dies, the last clear is CAMPAIGN COMPLETE with no offer, *Keep descending* builds depth 6 (facility, HUD reads DEPTH 6, saved, best depth 6), and a depth clear ranks it and offers perks again |
| `movement.mjs` | WASD displacement matches the camera basis at 5 yaw angles |
| `husk.mjs` | Husk feet still at rest/when blocked or planted, support sole stays on floor, comparable chase distance at 30/60/120 Hz, single claw hit and dodge after aim lock, forward lunge brace; saves five real-render poses and a seven-second WebM in `scripts/shots/` |
| `firing.mjs` | Spam-click, hold-to-fire and the click buffer |
| `overload.mjs` | Solo terminal offer/decline, two bounded waves, retreat/spawn spacing and kill totals, one reward only, actual focused-shotgun pellet spread/cooldown, capped supplies, upgrade save/retry/reset, phone offer and touch activation; offer/reward first-paint scrollbar/layout regression at desktop and landscape/portrait phone sizes; captures offer/reward/mobile screens |
| `aimassist.mjs` | Touch: magnetism snaps a 3° miss, 9° stays a miss, sticky-aim ratio ~0.55, held fire pulls a 7° miss on, no idle drift; desktop never assisted |
| `features.mjs` | Ticker suicide + corpse chain, key ambush, powerups, score + combo, arena/brute/arc caster, headshots, automap, lift ride (walk-on carry, call-down from below, strafing rider held, ledge rail), door push regression, touch map, touch weapon button + wheel + auto-switch, phone-size settings, no co-op button on the title (`?coop` shows it), the bare first-visit title (goal, three steps, PLAY, settings gear, nothing else), the NEW SECTOR banner for returning players (above the menu, fits a phone, hidden once the Biofoundry is reached), pixelation defaults (480 desktop, 320 touch), still adjustable, old-default migration, run perks do what their cards say (Volatile, Deep Pockets, Vitality, Second Wind, Momentum, Headhunter, Self-Repair), sector 1 is a short opener (≤7 rooms, no brute or tickers, shotgun in the spawn room — the rest of the file builds sector 2), the Broodkeeper (dormant until the chamber is entered, HP bar + objective, the volley → open → release → open cycle, acid and Husk summons, CORE EXPOSED on the bar, 25% damage closed / 2× on the open core, five-glob volleys below 40%, defeat clears acid + hides the bar + drops the key; then with REAL gunfire: every weapon hurts it and held Ripper fire kills it from full health), and one-off rewards filling a perk offer when the pool runs dry |
| `checkpoint.mjs` | Run flow without reloads: retry with sector-entry gear, free revive in place (60 hp, spawn shield, once per attempt), keycard checkpoint (retry in place at the key, world untouched, gear no worse) + Restart sector, save + Continue, quit to menu, new run, graphics-lost overlay, the sector-clear screen (rank + 3 perks, a click skips, the cards arm, a pick descends), the perk is in the save, survives a retry and is gone after a new run, the last sector's results buttons arm after the tally |
| `monkey.mjs` | Randomized stress run with NaN / out-of-world invariants |
| `coop.mjs` | Two tabs over BroadcastChannel: link + seed handshake, avatar/puppet sync, authority routing, shared keys/score, level transition, respawn, mouse recapture |
| `breach.mjs` | Sector 4, the Biofoundry (opened alone with `?sector4`): a real dormant Vatborn floats in each occupied tank; shooting one keeps it sealed through the 1.2 s agitation, opens a real collision gap at the breach, gushes liquid droplets, and the occupant walks out onto the floor and hunts; no damage during the warning, the other tanks stay sealed, and a tank never releases twice |
| `sector4.mjs` | The hand-built `?sector4` preview map (web builds): route, key gate, door, lift, completion, replay, retry, campaign-save isolation, mobile rendering, and that a normal URL still plays the campaign. `--poki` against a Poki-mode server: the flag is ignored. Takes the server URL as its first argument |
| `perf.mjs` | Render-cost guard for 60 fps on phones: each gun is ≤ 12 draws (baked), every-enemy-awake stays < 250 world draws (occlusion cull), an enemy in plain sight is still drawn, and no shader compiles after the level starts (warm-up); then the same draw budget and shader check in the Biofoundry at its heaviest (sector 5) with every enemy awake |
| `poki.mjs` | **Poki mode only:** stubbed SDK — init/loading order, ad breaks mute audio, gameplayStart/Stop dedupe, `measure()` events (level 1 fresh-start, level complete / fail, `endless N` complete / fail capped at 20), rewarded revive (ad icon, equal-size beside retry, muted, pays only on a watched video, once per attempt, hidden without the SDK), hidden co-op, boots with the SDK blocked ([POKI.md](../POKI.md)), a double perk pick plays one ad and takes one perk |

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
