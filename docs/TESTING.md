# Testing

VOXELSTRIKE is tested by headless-browser suites that drive the real game in
Microsoft Edge through `puppeteer-core` (no browser download). They play the
game, assert on state through a debug handle, and save screenshots to
`scripts/shots/`. There's no unit-test framework; `npm run build` adds the
type check. Every suite takes the browser from the `VOXEL_BROWSER` env var
when set (any Chromium executable, e.g. a Chrome for Testing from
`npx @puppeteer/browsers install chrome@stable --path <dir>`), falling back
to the Edge path below — handy where Edge refuses to launch headless (it
did, 2026-10-23). Use a FULL Chrome for Testing build
(`npx @puppeteer/browsers install chrome@stable --path <dir>`), not
`chrome-headless-shell`: the shell froze in native WebGL mid-run (protocol
timeouts even `Debugger.pause` couldn't interrupt) and threw a spurious
`reading 'trim'` error — failures that look exactly like game hangs.

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
| `e2e.mjs` | The whole 7-sector campaign: aggro, barrel chain, key → vault → lift → exit, the facility terminal after sector 3 (types, a click prints the rest, the next click powers off into sector 4; sector 4 built behind it and saved, the tank count it prints matches the level), the generated Biofoundry played through (lab theme, tanks with a dormant Vatborn in each occupied one), sector 5 reached through an ordinary intermission, still the Biofoundry with more full tanks, three seeds → three different Biofoundry layouts that all keep keycard → red door → lift → pad, sector 5 has more full tanks and more enemies than sector 4 over four seeds, results screen, every sector clear ranks S–C and offers 3 perks (a click skips the tally, a card descends), four perks collected by the end, sector 5 has the Broodkeeper as the objective with the keycard held back until it dies, the last clear is CAMPAIGN COMPLETE with no offer, sectors 6–7 are the generated Geothermal Core (heat seams, Vent Stalkers + Kiln Drones + a Cinder Hulk, saved, entering ends the NEW SECTOR banner), *Keep descending* builds depth 8 (facility, HUD reads DEPTH 8, saved, best depth 8), and a depth clear ranks it and offers perks again |
| `movement.mjs` | WASD displacement matches the camera basis at 5 yaw angles |
| `husk.mjs` | Husk feet still at rest/when blocked or planted, support sole stays on floor, comparable chase distance at 30/60/120 Hz, single claw hit and dodge after aim lock, forward lunge brace; saves five real-render poses and a seven-second WebM in `scripts/shots/` |
| `firing.mjs` | Spam-click, hold-to-fire and the click buffer |
| `overload.mjs` | Solo terminal offer/decline, two bounded waves, retreat/spawn spacing and kill totals, one reward only, actual focused-shotgun pellet spread/cooldown, capped supplies, upgrade save/retry/reset, phone offer and touch activation; offer/reward first-paint scrollbar/layout regression at desktop and landscape/portrait phone sizes; captures offer/reward/mobile screens |
| `aimassist.mjs` | Touch: magnetism snaps a 3° miss, 9° stays a miss, sticky-aim ratio ~0.55, held fire pulls a 7° miss on, no idle drift; desktop never assisted |
| `features.mjs` | Ticker suicide + corpse chain, key ambush, powerups, score + combo, arena/brute/arc caster, headshots, automap, lift ride (walk-on carry, call-down from below, strafing rider held, ledge rail), door push regression, touch map, touch weapon button + wheel + auto-switch, phone-size settings, no co-op button on the title (`?coop` shows it), the bare first-visit title (goal, three steps, PLAY, settings gear, nothing else), the NEW SECTOR banner for returning players (above the menu, fits a phone, hidden once the Biofoundry is reached), pixelation defaults (480 desktop, 320 touch), still adjustable, old-default migration, run perks do what their cards say (Volatile, Deep Pockets, Vitality, Second Wind, Momentum, Headhunter, Self-Repair), sector 1 is a short opener (≤7 rooms, no brute or tickers, shotgun in the spawn room — the rest of the file builds sector 2), sector 2 plays as in 0.3.4 (11–13 rooms, every room past spawn holds enemies, 30+ enemies), the Broodkeeper (dormant until the chamber is entered, HP bar + objective, the volley → open → release → open cycle, acid and Husk summons, CORE EXPOSED on the bar, 25% damage closed / 60% on the open body / 2× on the open core, quad counts 2× not 4×, below half health it enrages with five-glob volleys, defeat clears acid + hides the bar + drops the key; then with REAL gunfire: every weapon hurts it and held Ripper fire kills it from full health in 20–50 s of game time — a fight, not one opening), and one-off rewards filling a perk offer when the pool runs dry, quick melee (35 + shove, cooldown, ×2 on a staggered enemy, out of reach at 3 u, a bashed ticker still detonates), the secret wall (hint line near it, a bash breaks it, SECRET FOUND on entry), touch BASH placement + swing, weapon skins (title names the first goal, 10 real kills unlock + stamp + repaint + save, HUD shows the next goal, Armory: a tab per gun opening on the one in hand, the turntable shows the equipped paint, a locked skin previews with its goal and no Equip, Equip repaints; the top-left title Armory button with its count opens it and Back returns; phone corner button clear of the logo; phone Armory fits), the POWER LINK (a cage with three sealed supplies and a lamp node in a normal room of every core layout and every facility layout from sector 2 — 60 layouts — never in the sector 1 opener or the Biofoundry, steam + signs only in the core; the grille stops a player walking at it and nothing inside is collected; a shot into the wall above the node does nothing, a real pistol shot at the node solves it; the gate sinks, the grille clears, the supplies unseal and walking in collects all three), thrown guns (a dry Scattergun with the sidearm loaded is thrown, hits a husk for 45, the sidearm comes up, it lands by the husk as a pickup that gives it back empty without a switch; the sidearm hops to a loaded gun instead of being thrown; nothing loaded = dry click; a throw into a wall lands on open floor), scrap + upgrades (a husk kill drops a 1-scrap pickup and a brute a 5, nothing banked until walked over, then +6, saved, the HUD counter matches; the death screen shows the attempt's scrap and an Upgrades button; 7 rows, buys cost and fill pips; Reinforced Suit → 110 max health, Quick Hands reaches the weapons, levels saved; a buy without scrap is refused; Back → death screen, the retry has Starter Plates armor; Field Medic heals 12 not 10; Head Start gives the SMG and full health; a sector clear pays out and shows it; all of it survives a reload; the Armory's Upgrades button + Back; phone fit), safe area (real insets via CDP `Emulation.setSafeAreaInsetsOverride`: with none FIRE keeps its 18 px; a notched phone at 667×375 and 844×390 keeps the title corners, PLAY, touch buttons, MAP/pause and HUD clear of the notch and home bar, FIRE moves in by exactly the insets, the crosshair stays centred; held upright, the rotated HUD clears them too) |
| `checkpoint.mjs` | Run flow without reloads: retry with sector-entry gear, free revive in place (60 hp, spawn shield, once per attempt), keycard checkpoint (retry in place at the key, world untouched, gear no worse) + Restart sector, save + Continue, quit to menu, new run, graphics-lost overlay, the sector-clear screen (rank + 3 perks, a click skips, the cards arm, a pick descends), the perk is in the save, survives a retry and is gone after a new run, the last sector's results buttons arm after the tally |
| `survival.mjs` | Survival, the secondary mode: the title (PLAY primary = the campaign with "Escape the facility" + three steps, a quiet *Survival* under it), *Survival* → the Facility arena sealed (no gaps in its ring), big (≥ 31 × 29), with cover (≥ 20 cells) and breakables (≥ 12 crates/barrels), empty of campaign enemies/pickups, the flow field reaching its corners; a red warning glow lights before any enemy, which then rises out of the floor; wave 1 within ~4 s, every spawn ≥ 5 u away AND in the player's line of sight, the HUD reads WAVE 1 · N LEFT; clearing it → WAVE 1 CLEARED with three picks (and nothing else — no shop on that screen) and the arena paused, kills dropped supplies and scrap pickups that all sit on the floor, loose scrap swept home at the clear, ≥ 20 scrap paid; the pick opens the SHOP: Scattergun / Ripper / Thumper / Arc caster / Ammo cards, every gun card with a rendered picture, + CONTINUE; the Scattergun costs 20 scrap (card → OWNED, shop bank + HUD counter updated) and takes slot 2; CONTINUE resumes with a break and the HUD scrap counter showing; a scrap pickup 3 u away flies in and banks its amount; a third gun takes slot 3 and key 3 selects it (tags PST SG RKT); wave 5 announces EVAC ▸ THE BIOFOUNDRY and the pick builds the Biofoundry arena with the gear kept, wave 6 starts there; death: reached/best wave, Try again / Upgrades / Main menu, best saved; Try again starts over on map 1 with the sidearm; Main menu shows BEST WAVE on the title and *Campaign* still starts the campaign; a phone's pick of three and the shop (5 cards + CONTINUE) fit 667×375 |
| `monkey.mjs` | Randomized stress run with NaN / out-of-world invariants |
| `coop.mjs` | Two tabs over BroadcastChannel: link + seed handshake, avatar/puppet sync, authority routing, shared keys/score, level transition, respawn, mouse recapture |
| `breach.mjs` | Sector 4, the Biofoundry (opened alone with `?sector4`): a real dormant Vatborn floats in each occupied tank; shooting one keeps it sealed through the 1.2 s agitation, opens a real collision gap at the breach, gushes liquid droplets, and the occupant walks out onto the floor and hunts; no damage during the warning, the other tanks stay sealed, and a tank never releases twice |
| `sector4.mjs` | The hand-built `?sector4` preview map (web builds): route, key gate, door, lift, completion, replay, retry, campaign-save isolation, mobile rendering, and that a normal URL still plays the campaign. `--poki` against a Poki-mode server: the flag is ignored. Takes the server URL as its first argument |
| `perf.mjs` | Render-cost guard for 60 fps on phones: each gun is ≤ 12 draws (baked), every-enemy-awake stays < 250 world draws (occlusion cull), an enemy in plain sight is still drawn, and no shader compiles after the level starts (warm-up); then the same draw budget and shader check in the Biofoundry at its heaviest (sector 5) and the Geothermal Core at its heaviest (sector 7) with every enemy awake; then Survival at its alive cap (≥ 10 enemies in the big dressed arena) under the same budget, with no shader compiling during the waves (a failure names the new program) |
| `poki.mjs` | **Poki mode only:** stubbed SDK — init/loading order, ad breaks mute audio, gameplayStart/Stop dedupe, `measure()` events (level 1 fresh-start, a `start` on every attempt incl. retries, level complete / fail, `endless N` start / complete / fail capped at 20, a bought upgrade sends `upgrade scanner tier1`, a real killing hit sends `death 2 ticker`, `playtime N reached` once per minute mark and paused time doesn't count), Armory skin unlock by rewarded video (Watch ad + icon, not primary, no video = nothing, muted during, watched = unlocked + equipped, absent without the SDK), rewarded revive (ad icon, equal-size beside retry, muted, pays only on a watched video, once per attempt, hidden without the SDK), hidden co-op, boots with the SDK blocked ([POKI.md](../POKI.md)), a double perk pick plays one ad and takes one perk |

`node scripts/exit-room-props.mjs [url]` checks all seven exit-room props,
clear routes and boarding clearance across 24 facility/Biofoundry seeds and
all four lift directions, repeated teardown/rebuild, live status changes,
the real lift ride and exit progression, and the `?exitroom` shortcut. It
saves ready/docked screenshots from one viewpoint in `scripts/shots/`.

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


### Secret prototypes

`node scripts/secret-weapons.mjs <url>` checks secret placement for sectors 1?5 across three seeds, each firing behavior, special ammo cost, knockback, piercing/chaining, delayed spore damage, wall blocking, checkpoint restoration, six HUD slots, key 6 with a partial inventory, dry prototype retention, effect cleanup, and 2?4 model draws (budget 12). Screenshots go to `scripts/shots/secret-weapon-{1..5}.png`. Existing `firing.mjs`, `checkpoint.mjs` and `perf.mjs` cover baseline regressions.


### Additional maps

Run `node scripts/new-maps.mjs <url>` for eight seeds/difficulties per theme
(24 layouts): validation, deterministic generation, original rooms/doors/
enemies/loot, walking-cell preservation, secrets, optional caches, actual
key/door/lift/exit completion, replay/retry, save isolation, real Survival
stages, endless rotation and mobile viewport fit. Screenshots are written to
`scripts/shots/map-*.png`. Run with `--poki` against a Poki server to verify
all three web-only preview shortcuts are ignored.

`e2e.mjs` also completes depths 8, 11 and 12. `features.mjs` checks each
new environment's Power Link and secret wall. `perf.mjs` measures all three
with every enemy awake, requiring fewer than 250 world draws and no shader
program growth after warm-up.
