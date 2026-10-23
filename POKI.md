# VOXELSTRIKE on Poki

The Poki version is the same game built in a separate Vite mode. All
Poki-specific code is in [`src/platform/poki.ts`](src/platform/poki.ts) and is
gated on a compile-time constant (`POKI = import.meta.env.MODE === 'poki'`).
The regular build (`npm run build`, GitHub Pages, PWA) contains no Poki code
and never loads the SDK.

## Build and upload

```bash
npm run build:poki     # type-check + build → dist-poki/
npm run preview:poki   # serve dist-poki/ on http://localhost:4173 to try it
npm run dev:poki       # dev server in Poki mode (HMR)
```

To ship, build and zip in one step, then upload `voxelstrike-poki-<version>.zip`
to the Poki Inspector:

```bash
npm run zip:poki       # bump version + build:poki + scripts/zip-poki.ps1 → voxelstrike-poki-<version>.zip (git-ignored)
```

Every `zip:poki` bumps the patch number in `package.json` (0.3.0 → 0.3.1 →
…) before building, so each upload has its own version. The title screen's
footer shows it (`VOXELSTRIKE 0.3.1`), and the zip is named after it, so a
build seen on Poki can be matched to its zip. Commit the bumped
`package.json` / `package-lock.json` with the release. A failed build still
uses up its number; that's harmless. `build:poki`, `dev:poki` and the web
build never bump it.

The zip has `index.html` at its root and forward-slash entry paths. Don't
use `Compress-Archive` instead. On Windows PowerShell 5.1 it writes
`assets\index.js`-style backslash paths. A Linux server unpacks those as flat
filenames, and every asset fails to load.

The bundle is about 0.75 MB. Asset paths are relative (`base: './'`), so the
bundle works from Poki's CDN path as-is.

## How the Poki build differs

| | Regular build | Poki build |
|---|---|---|
| Poki SDK | not loaded | `<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js">` in `<head>` |
| Co-op | hidden from the title like Poki (`?coop` shows the button for development) + `?role=…&room=…` auto-join | button removed, URL auto-join ignored |
| PWA | web manifest + service worker | both stripped (`sw.js` and `manifest.webmanifest` are deleted from the output) |
| Touch fullscreen / orientation lock | requested on start | skipped (Poki's page owns fullscreen around the iframe) |
| Arrow keys / space / wheel | normal | `preventDefault` so they can't scroll the Poki page |
| Leaving co-op (partner disconnect, co-op campaign end) | navigates to the bare path (drops `?role`/`?room`) | `location.reload()` (keeps Poki's iframe query params; co-op is hidden on Poki anyway) |
| `public/marketing/` | copied (unused) | deleted from the output (store art goes to the Poki dashboard, not the game bundle; holds the thumbnail candidates and their prompt notes) |
| `THIRD-PARTY-NOTICES.txt` | shipped | shipped (Font Awesome CC BY 4.0 credit for the HUD icons — keep it) |

The vite plugin `pokiPlugin` in [`vite.config.ts`](vite.config.ts) handles the
SDK tag and the stripped files.

## SDK lifecycle

| SDK call | When |
|---|---|
| `PokiSDK.init()` | First thing in `main.ts`, before the game is constructed. The game continues whether init resolves or rejects. |
| `PokiSDK.gameLoadingFinished()` | Right after `new Game()`: the level is generated, meshed, and the title screen is up. |
| `PokiSDK.gameplayStart()` / `gameplayStop()` | Driven from `Game.frame()` with `poki.setPlaying(state === 'playing')`. Only transitions reach the SDK, so pause menu, pointer-lock loss, WebGL context loss, death, and intermission all stop gameplay, and every route back into play starts it. |
| `PokiSDK.rewardedBreak()` | Only when the player presses **Revive · Watch ad** on the death screen (`Game.requestRevive()`). Gameplay is already stopped (state `dead`); audio is muted while the video plays and always restored after. The player revives in place **only if it resolves `true`** — otherwise the button turns into a disabled "No video available" and nothing is granted. Once per sector attempt (a retry gives it back). The offer is hidden when `poki.adsAvailable()` is false (ad blocker), so it never shows a button that can't pay out. The button carries the clapperboard icon, says "Watch ad" before the call, is steel-grey (never the green/primary style) and sits beside the equal-size yellow retry. After a watched video desktop shows READY — click to continue. It is not also a `commercialBreak`. Also: **Unlock now · Watch ad** in the Armory on a locked weapon skin (`Game.adUnlockSkin`) — on a menu, so gameplay is already stopped; same mute, same rule (the skin is granted and equipped **only on `true`**, else "No video available"), same clapperboard + steel style, hidden without the SDK. One video = one skin. |
| `PokiSDK.commercialBreak()` | At every natural break, via `Game.afterBreak()`: starting or continuing a run from the title, each new sector (the perk pick on the sector-clear screen; a double pick still makes one ad), retrying a sector or starting a new run after death, *Play a new layout* after the campaign, and resuming from the pause menu. Audio is muted and held keys are released while an ad plays. Extra clicks during the ad are ignored. If an ad actually played, desktop shows **READY — click to continue**, because the ad used up the click that pointer lock needs. |

Restarts (retry, new run, quit to menu, continue) all happen **in place**. The
page never reloads, so each session sends `init` / `gameLoadingFinished`
exactly once and Poki's load count is unique sessions. The only reload left
is the "Reload game" button on the *graphics lost* overlay, which appears
4 s after a WebGL context loss in case the browser never gives the context
back.

Two SDK behaviours you'll see in the debug console:

- The SDK skips the very first `commercialBreak` ("not possible before
  gameplayStart"). Ads therefore start from the first sector break. The call
  still resolves immediately, so nothing waits.
- The SDK sends its own `measure(game, loading, start|complete)` events
  around init and loading.

If an ad blocker drops the SDK script, `window.PokiSDK` is undefined. Every
wrapper call is then a no-op and the game plays normally without ads.

## Game events (`PokiSDK.measure`)

The optional solo Overload challenge is NOT in the Poki build: it is hidden
from players (2026-10-18) and only appears with `?overload` on web builds,
which the Poki build ignores. If it comes back: its offer/reward screens use
the `overload` state, so the per-frame SDK bridge stops gameplay while a
choice is open, and they request no ad breaks or measure events.

Deliberately small: progress events per sector, plus two diagnostics (`death` and `playtime`, added
after the 2026-10 Web Fit Test), enough to answer "how many started playing", "who passed each level",
"how many times players died", "who quit mid-sector", "what kills them" and "when do sessions end". Everything else (loads, plays,
ads, playtime) Poki already tracks on its own. None of the values may contain
`/` or `^`.

| category | what | action | Fired when |
|---|---|---|---|
| `level` | `1` | `fresh-start` | A new run begins: title *Play*, *New run* (title or death screen), or *Play a new layout*. Not sent on *Retry sector* or *Continue* |
| `level` | `1` – `7` | `start` | An attempt at that sector begins: a new run, the next sector, *Continue*, *Retry sector*, a keycard retry. A revive continues the same attempt and sends nothing |
| `level` | `1` – `7` | `complete` | That sector's exit pad is reached |
| `level` | `1` – `7` | `fail` | The player dies in that sector (solo) |
| `endless` | `8` – `20` | `start` | An attempt at that endless depth begins (same cap) |
| `endless` | `8` – `20` | `complete` | An endless depth past sector 7 is cleared (depth 20 and deeper all report as `20`) |
| `endless` | `8` – `20` | `fail` | The player dies at that endless depth (same cap) |
| `death` | `1` – `20` (sector / depth, capped) | what landed the killing hit: `husk`, `sentinel`, `ticker`, `brute`, `vatborn`, `broodkeeper`, `cinderHulk`, `ventStalker`, `kilnDrone`, `barrel`, `rocket` (their own), `explosion`, `unknown` | Sent with every `fail` (solo). In the dashboard: death → 2 → ticker / brute / … — a difficulty spike shows up as one killer |
| `wave` | `1` – `30` (capped) | `start` / `complete` / `fail` | SURVIVAL (the quiet button under PLAY): a wave begins, is cleared, or the run dies in it. Survival sends no `level` events; its deaths send `death` → `wN` → killer |
| `upgrade` | `suit` `plates` `medic` `belt` `hands` `headstart` `scanner` | `tier1` – `tier3` | A scrap upgrade is bought (docs/RETENTION_PLAN.md). Shows which upgrades players want and how far they save up; tune the costs from it |
| `playtime` | `1` `2` `3` `4` `5` `6` `7` `8` `10` `12` `15` `20` `30` | `reached` | That many minutes of real play this page load (state `playing` only: menus, ads, death and clear screens don't count). Once per mark per load. Shows when sessions end — e.g. whether sector 1 quitters leave in the first minute or after three |

Since sectors 6–7 (the Geothermal Core) joined the campaign, builds before
it reported depths 6–7 as `endless 6` / `endless 7`; newer ones report them
as `level 6` / `level 7`. Compare playtests across that change with care.

**`start` is what fills Poki's Started / Completed / Failed / Left columns**
(Completed and Failed are shares of `start`; Left = started, then neither
completed nor failed — the player quit mid-sector). Builds up to 0.3.4 sent
no `start`, so those columns read 0% for every level; only the Gameplays
counts are usable for them.

In the Game Events tab they group as `level` → `1` … `7` →
`fresh-start` / `start` / `complete` / `fail`, which reads as a funnel:

**level 1 fresh-start** (played) → **level 1 complete** → **level 2 complete** →
**level 3 complete** (reached the Biofoundry) → **level 4 complete** →
**level 5 complete** (beat the Broodkeeper) → **level 6 complete** (reached
the Geothermal Core) → **level 7 complete** (finished the campaign). Past
that, *Keep descending* starts the endless run: `endless 8 complete` … show how deep players go, and
`endless N fail` where the run ended. The value is capped at 20 so the
dashboard keeps a bounded set of rows. Sectors 4–5 are the generated Biofoundry and ships in the Poki build;
only the standalone `?sector4` hand-built preview stays web-only.

- **Played** = `level 1 fresh-start` — players who pressed *Play*
  (or started another run). Poki's own load count includes people who left
  on the title screen.
- **Passed level N** = `level N complete`.
- **Quit mid-sector N** = the Left column on `level N` (a `start` with no
  `complete` or `fail` after it). Left vs Failed tells "too hard" from "lost
  interest".
- **Total deaths** = every `level N fail` plus every `endless N fail`. Each
  death sends exactly one `fail`, and the split shows which sector kills
  players most.
- Counts are events, not unique players: someone who clears sector 1 in two
  separate runs counts twice.

Earlier versions of the code also sent `campaign`, `keycard` and
`secret` events; they were cut to keep the dashboard simple. `level start`
was cut with them and came back (2026-10-20): without it Poki's
Started / Completed / Failed / Left columns stay at 0%.

### Adding an event

Call `poki.measure(category, what, action)` from
[`src/platform/poki.ts`](src/platform/poki.ts) at the moment the event happens.
Never call `window.PokiSDK` directly. The wrapper is a no-op outside Poki builds
and survives a missing SDK. Then add a row to the table above and update the
event assertions in `scripts/poki.mjs` (it checks that *only* the listed events
are sent). Keep the set small — every event is another row to read.

## Testing

```bash
npm run dev:poki                                         # or: npm run build:poki && npm run preview:poki
node scripts/poki.mjs "http://localhost:5173/?seed=12345"
```

If a regular dev server already holds port 5173, `dev:poki` moves to 5174
and the test must be pointed there — against the regular server
`window.__poki` doesn't exist and the run fails at the first check. More on
the suites in [docs/TESTING.md](docs/TESTING.md).

`scripts/poki.mjs` intercepts the CDN script and serves a recording stub, so
the run is deterministic and needs no network. The stub's `commercialBreak`
plays a fake 400 ms ad, and its `rewardedBreak` plays one that resolves
`true` unless the test sets `window.__rewardOk = false`. The test checks:

- `init` → `gameLoadingFinished` order, and no gameplay on the title screen
- the co-op button is gone and settings is still there
- arrow keys and the wheel are `preventDefault`ed
- the ad break waits for the ad with audio muted, then restores audio, and
  desktop asks for one click (READY) before play resumes
- `gameplayStart`/`Stop` across start, pause, resume, intermission, and death,
  with no duplicate sends per frame
- exactly one `level 1 fresh-start` when a run begins, `level N complete` /
  `level N fail` after that, and nothing else (no event on keycard pickup,
  sector entry or retry); no `/` or `^` in any value
- one ad per break even on a double click, advancing exactly one sector
- retry after death: an ad break, a second `level 2 start`, and no page reload
  (no second `init`)
- rewarded revive: offered with the ad icon, equal in size and in line with
  the retry; audio muted during the video; revives in place only after a
  watched video (not also a `commercialBreak`); once per sector attempt;
  an unwatched video grants nothing and disables the button; no extra
  `measure()` events
- with the SDK **blocked**, the game still boots and plays, and the death
  screen offers no rewarded revive

The run flow itself (checkpoints, retry, save/continue, quit to menu, graphics
lost) is covered by `scripts/checkpoint.mjs` against the regular dev server.

Before submitting, also open `npm run preview:poki` with the real SDK. On
localhost it runs in debug mode and logs every call as `POKI: PokiSDK.…` in
the console. Then upload to the Poki Inspector and play one full run there.

## Known limitations

- Rewarded revive sends no `measure()` event of its own; Poki's dashboard
  already counts rewarded impressions. If uptake per death matters later,
  add `measure('rewarded', 'revive', 'interact')` with a row above and an
  assert in `poki.mjs`.
