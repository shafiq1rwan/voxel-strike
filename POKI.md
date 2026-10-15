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

To ship, build and zip in one step, then upload `voxelstrike-poki.zip` to the
Poki Inspector:

```bash
npm run zip:poki       # build:poki + scripts/zip-poki.ps1 → voxelstrike-poki.zip (git-ignored)
```

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
| Co-op | title button + `?role=…&room=…` auto-join | button removed, URL auto-join ignored |
| PWA | web manifest + service worker | both stripped (`sw.js` and `manifest.webmanifest` are deleted from the output) |
| Touch fullscreen / orientation lock | requested on start | skipped (Poki's page owns fullscreen around the iframe) |
| Arrow keys / space / wheel | normal | `preventDefault` so they can't scroll the Poki page |
| Leaving co-op (partner disconnect, co-op campaign end) | navigates to the bare path (drops `?role`/`?room`) | `location.reload()` (keeps Poki's iframe query params; co-op is hidden on Poki anyway) |
| `public/marketing/` (if present) | copied (unused) | deleted from the output (store art goes to the Poki dashboard, not the game bundle; the folder isn't in the repo today) |
| `THIRD-PARTY-NOTICES.txt` | shipped | shipped (Font Awesome CC BY 4.0 credit for the HUD icons — keep it) |

The vite plugin `pokiPlugin` in [`vite.config.ts`](vite.config.ts) handles the
SDK tag and the stripped files.

## SDK lifecycle

| SDK call | When |
|---|---|
| `PokiSDK.init()` | First thing in `main.ts`, before the game is constructed. The game continues whether init resolves or rejects. |
| `PokiSDK.gameLoadingFinished()` | Right after `new Game()`: the level is generated, meshed, and the title screen is up. |
| `PokiSDK.gameplayStart()` / `gameplayStop()` | Driven from `Game.frame()` with `poki.setPlaying(state === 'playing')`. Only transitions reach the SDK, so pause menu, pointer-lock loss, WebGL context loss, death, and intermission all stop gameplay, and every route back into play starts it. |
| `PokiSDK.commercialBreak()` | At every natural break, via `Game.afterBreak()`: starting or continuing a run from the title, each new sector (intermission click), retrying a sector or starting a new run after death, *Play a new layout* after the campaign, and resuming from the pause menu. Audio is muted and held keys are released while an ad plays. Extra clicks during the ad are ignored. If an ad actually played, desktop shows **READY — click to continue**, because the ad used up the click that pointer lock needs. |

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

Deliberately small: the game sends **7 events**, enough to answer "how many
started playing", "who passed each level" and "how many times players died". Everything else (loads, plays,
ads, playtime) Poki already tracks on its own. None of the values may contain
`/` or `^`.

| category | what | action | Fired when |
|---|---|---|---|
| `level` | `1` | `start` | A new run begins: title *Enter the facility*, *New run* (title or death screen), or *Play a new layout*. Not sent on *Retry sector* or *Continue* |
| `level` | `1` / `2` / `3` | `complete` | That sector's exit pad is reached |
| `level` | `1` / `2` / `3` | `fail` | The player dies in that sector (solo) |

In the Game Events tab they group as `level` → `1` / `2` / `3` →
`start` / `complete` / `fail`, which reads as a funnel:

**level 1 start** (played) → **level 1 complete** → **level 2 complete** →
**level 3 complete** (finished the game)

- **Played** = `level 1 start` — players who pressed *Enter the facility*
  (or started another run). Poki's own load count includes people who left
  on the title screen.
- **Passed level N** = `level N complete`.
- **Total deaths** = `level 1 fail` + `level 2 fail` + `level 3 fail`. Each
  death sends exactly one `fail`, and the split shows which sector kills
  players most.
- Counts are events, not unique players: someone who clears sector 1 in two
  separate runs counts twice.

Earlier versions of the code also sent `level start`, `campaign`,
`keycard` and `secret` events; they were cut to keep the dashboard simple.

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
plays a fake 400 ms ad. The test checks:

- `init` → `gameLoadingFinished` order, and no gameplay on the title screen
- the co-op button is gone and settings is still there
- arrow keys and the wheel are `preventDefault`ed
- the ad break waits for the ad with audio muted, then restores audio, and
  desktop asks for one click (READY) before play resumes
- `gameplayStart`/`Stop` across start, pause, resume, intermission, and death,
  with no duplicate sends per frame
- exactly one `level 1 start` when a run begins, `level N complete` /
  `level N fail` after that, and nothing else (no event on keycard pickup,
  sector entry or retry); no `/` or `^` in any value
- one ad per break even on a double click, advancing exactly one sector
- retry after death: an ad break, a second `level 2 start`, and no page reload
  (no second `init`)
- with the SDK **blocked**, the game still boots and plays

The run flow itself (checkpoints, retry, save/continue, quit to menu, graphics
lost) is covered by `scripts/checkpoint.mjs` against the regular dev server.

Before submitting, also open `npm run preview:poki` with the real SDK. On
localhost it runs in debug mode and logs every call as `POKI: PokiSDK.…` in
the console. Then upload to the Poki Inspector and play one full run there.

## Known limitations

- No rewarded ads yet. A natural fit would be "watch an ad to respawn at the
  sector start" on the death screen, using `PokiSDK.rewardedBreak()` with
  `measure('rewarded', 'respawn', 'visible' | 'interact')`.
