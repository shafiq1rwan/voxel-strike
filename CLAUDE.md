# VOXELSTRIKE — project guide

Original retro voxel FPS (TypeScript + Three.js + Vite). The core content —
levels, textures, models, sounds — is generated procedurally at runtime and
must keep working with zero assets present. On top of that base there is one
*optional* asset layer (music) loaded from a manifest in `public/`; it degrades
gracefully to silence when absent. Nothing is ever copied from other games;
third-party assets need a license check before being committed (that's why
`public/music/*` is git-ignored apart from the manifest and docs). Enemies are
always the procedural voxel rigs — an optional billboard sprite-skin layer
existed once and was removed (nothing shipped it; per-enemy sheet clones cost
GPU memory on iOS).

## Docs (keep them in sync with the code)

- `docs/ARCHITECTURE.md` — module map, states, frame loop, sector build,
  render passes, co-op, storage keys, builds. Update when structure changes.
- `docs/ART.md` — art direction, palette, view-model rules, HUD style, and
  the **owner's calls** (no black outlines, slim icons, invisible joystick,
  no sequel teases). Read before any visual change; art direction is the
  owner's decision, so show a screenshot before polishing further.
- `docs/UI_SPEC.md` — HUD layout (desktop + mobile), touch controls, every
  screen, UI rules. Update when the HUD, controls or a screen changes.
- `docs/TESTING.md` — every suite, running/writing them, gotchas. Update when
  a suite is added or its coverage changes (and the command list below).
- `POKI.md` — the Poki build, SDK lifecycle, `measure()` events.

## Commands

```bash
npm run dev        # dev server on http://localhost:5173
npm run build      # tsc --noEmit + vite build → dist/  (run this before calling work done)
npm run preview    # serve the production build on :4173
npm run build:poki # Poki build → dist-poki/ (also dev:poki / preview:poki; zip:poki → upload zip) — see POKI.md
```

Headless test suites (need a dev or preview server running; they drive Edge at
`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` via
puppeteer-core and save screenshots to `scripts/shots/`):

```bash
node scripts/smoke.mjs      # boot, move, shoot, explode; fails on any console error; enemy-bounds watchdog
node scripts/e2e.mjs        # plays the whole 3-sector campaign: aggro, barrels, key → vault → lift → exit
node scripts/movement.mjs   # WASD displacement must match camera basis vectors at 5 yaw angles
node scripts/firing.mjs     # spam-click / hold-to-fire / click-buffer semantics
node scripts/aimassist.mjs  # touch profile: magnetism snaps a 3° miss, 9° stays a miss, sticky-aim ratio ~0.55, held fire pulls a 7° miss on, no idle drift; desktop unaffected
node scripts/features.mjs   # ticker suicide/corpse-chain, key ambush, powerups, score + combo, arena/brute/arc-caster, headshots, automap, walk-on elevator ride, touch map + weapon button/wheel, phone settings fit
node scripts/monkey.mjs     # randomized stress run with NaN/out-of-world invariants
node scripts/coop.mjs       # 2-player co-op over the BroadcastChannel transport: link/seed handshake, avatar + puppet sync, authority routing, shared keys/score, level transition, respawn
node scripts/perf.mjs       # 60fps guard: gun draws (baked), occlusion cull with every enemy awake, in-sight enemy drawn, no shader compile after level start
node scripts/checkpoint.mjs # run flow, all in place (no reload): retry restores sector-entry gear, save/Continue from sector 2, quit to menu, new run, GRAPHICS LOST overlay
node scripts/breach.mjs     # sector 4 preview: dormant Vatborn in each occupied tank; shoot one → sealed during agitation, real collision gap, liquid gush, it walks out and hunts, releases once
node scripts/poki.mjs       # POKI MODE ONLY (npm run dev:poki): stubbed SDK — init/loading order, ad breaks mute audio, gameplayStart/Stop dedupe, measure() events (level 1 start, level complete/fail), hidden co-op, boots with SDK blocked
```

`?seed=N` on the URL reproduces a layout deterministically. `window.__voxelstrike`
is the debug handle the tests use (the Game instance).

Tool scripts (not tests):

```bash
node scripts/gen-icons.mjs                        # regenerate PWA icons
node scripts/itch-download.mjs <url> <dir>        # download a free/PWYW itch.io project via the real browser flow
```

## Architecture

- `src/game.ts` — orchestrator: state machine (title/playing/paused/dead/
  intermission/won), 3-sector campaign flow with in-place level teardown.
  Solo restarts NEVER reload the page: every sector start captures a
  `Checkpoint` (seed, score, health/armor/ammo, weapon loadout, run totals);
  death offers Retry sector (`retrySector` restores it, health floored at 60)
  or New run; from sector 2 on the checkpoint is also saved to localStorage
  (`voxelstrike-run`, same key as the old Poki build) so the title offers
  "Continue · Sector N" and the pause menu "Save & quit to menu"
  (`goToTitle` rebuilds a fresh sector 1 behind the title). All sector
  entries funnel through `enterSector(msg, adShown)`. Click-through screens
  "arm" after 0.7s (1.2s on the win screen) so a held trigger can't skip
  them — tests must wait before clicking. WebGL context loss pauses behind
  a GRAPHICS LOST overlay (reload button after 4s), and nothing resumes
  until the context returns. `checkpoint.mjs` covers all of this. Also:
  explosions via `queueExplosion` fuses (barrel chains AND ticker corpses —
  each entry carries its own damage/radius), FOV punch, screen wiring.
  Also owns score + combo (kills within 2.5s chain a ×5-capped multiplier,
  streak popups at 2/3/4 kills), per-seed best score in localStorage
  (`voxelstrike-best-<seedHex>`), and `onKeyPickup()` — grabbing the red
  keycard spawns an awake ambush in the key room (and bumps
  `level.totalEnemies` so intermission ratios stay honest). The HUD
  objective tracker is driven by `updateObjective()` each frame:
  `objectiveStage()` derives key → door → lift → pad from game state (pad =
  feet above the lift's highY − 0.4) and the arrow points at
  `objectiveTarget()` (pad position comes from `LevelData.exitPad`).
- `src/world/world.ts` — flat `Uint8Array` voxel grid, DDA raycasts, baked RGB
  light grid (BFS from lamp blocks), per-voxel HP for destructibles.
- `src/world/mesher.ts` — greedy mesher, one mesh per 16×16 chunk column; faces
  merge only when tile + quantized light match; custom shader tiles the atlas
  across merged quads (`fract` in block space) + up to 6 dynamic lights.
  Runtime block changes mark chunks dirty; `ChunkManager.update()` remeshes.
- `src/world/blocks.ts` — Block enum + procedural 16px texture atlas.
  **The `Block`/`Tile` enums, `tileFor`, `LAMP_COLORS`, `isDestructible`,
  `blockHP`, and `drawTile` must stay in sync when adding a block — and new
  blocks are APPEND-ONLY (tests hardcode ids like Barrel=15, ExitPad=13).**
  Deco variants (WallRust/WallVent/WallPipes/WallWorn/CeilPipes/CeilPipesZ/
  CeilVent/Chain) are cosmetic-only: same physics as Wall/Ceil. Ids 24–30
  (LabFloor…LabCeilGrate, LampViolet, TankGlass) are the sector 4 preview's
  set (`src/preview/biofoundry.ts`, opened by `?sector4` on web builds,
  lazy-loaded, ignored on Poki); levelgen never
  places them. TankGlass is solid and a lamp but the mesher skips it (the
  tank's smooth glass is decoration geometry). LampViolet is a lamp — a lamp
  block's own faces are lit by its flood, so its emission colour sets how
  bright the block itself looks. `VoxelWorld.bakeLighting(ambient?)` takes
  an optional ambient; the campaign must keep the default. Ceiling UVs
  map tile-x to world X, so direction-locked art needs a rotated twin —
  CeilPipes runs along X, CeilPipesZ along Z; levelgen picks per lane. The cosmetic WallWorn
  cracks must stay visually SOFTER than the secret-marking `Cracked` tile
  (which has a deep black fracture + amber gleam) or players lose the
  secret-room language.
- `src/world/levelgen.ts` — rooms + MST corridors, doors (exit door always
  red-locked, forced placement), secret room behind cracked blocks, exit ledge
  + elevator, barrels/crates/lamps/pickups/enemies. One big `arena` room per
  sector is placed FIRST (while the map is empty, so it always fits) and is
  never spawn/exit/key — it holds the arc caster + cells, brute guard(s), and
  a diagonal pillar ring (axes left clear as charge lanes). Every layout is
  validated by a BFS walkability check (key reachable *without* the key, exit
  reachable *with* it) and regenerated from fallback seeds if broken.
  The deco pass (rust/vents/pipe columns/ceiling runs) and hanging chain-lamps
  use `dhash` (position-hashed) instead of the layout RNG, so tuning deco
  never reshuffles rooms/enemies/pickups for a given seed. Hanging fixtures
  only spawn in rooms h>=5 and never in the exit room (a lamp block over the
  ledge walkway would block the path to the pad).
- `src/core/physics.ts` — axis-by-axis AABB vs voxels + dynamic boxes (doors,
  elevator). The voxel resolver only corrects penetration caused by *this
  frame's movement* (`maxPen` guard) — deep pre-existing embeds must never be
  face-snapped or bodies ratchet through the world. Dynamic boxes are exempt
  from `maxPen` (rising elevators legitimately push bodies) but resolve ONLY
  along the axis of least penetration: an axis-blind snap used to eject a
  walking rider sideways off the rising lift (0.03u vertical overlap "fixed"
  by a 1u horizontal shove), soft-locking the campaign. `features.mjs` has a
  walk-on ride regression for this. Two more dynamic-box rules: Y may only
  resolve when the body's center is ABOVE the box center (riding the lift),
  and the push side comes from the body's position vs the box center — never
  from the velocity sign. Using the velocity sign launched players running
  into a half-open door (bottom edge just under head height → Y least
  penetrated, gravity → negative Y delta → snapped onto the door's TOP, inside
  the wall, then carried out of the map). `features.mjs` #11 sweeps that window.
  Backstop: `Game.guardPlayerInWorld()` returns a player who stays inside
  solid / above the world for >0.12s to their last on-ground position.
- `src/entities/` — player (movement/health/keys, timed `buffs`:
  quad ×4 damage / shield full absorb / haste ×1.35 move+fire), enemies
  (state machines: idle/patrol/chase/attack/charge/pain/dead; husks have
  jointed rigs + serpentine chase; tickers sprint, arm at <1.8u, and ALWAYS
  detonate on death via `queueExplosion` — even sniped at range; brutes share
  the husk rig/gait at heavier proportions, telegraph a 4.2× charge that
  smashes destructibles in its path, get stunned 1.3s on a wall slam via
  `stunTime`, and always drop a powerup; deaths burst into per-part gibs;
  `vatborn` is the sector 4 preview's escaped specimen — husk skeleton via
  `humanoid()`, 0.65s heavy-swing windup + 1.1s recovery, short rush, never
  placed by levelgen. Its right arm (+x — the model faces -z) is a giant
  club ending in a huge dark fist; keep that oversized. A real Vatborn sits
  in each occupied tank with `dormant = true` (no AI/physics/wake, green
  tint, thrashes with `agitation`) and leaves via `startEmerge()` — a
  scripted 0.8s walk through the gap — so `scripted` enemies are skipped by
  separation and the out-of-world net. It is released by the preview's
  breach sequence: `PreviewArt` hooks in game.ts —
  `tankHit` from `applyVoxelDamage` when a TankGlass voxel is shot, `noise`
  from `Game.noise()` (gunfire), `update` per frame — drive dormant →
  agitated 1.2s → breach (front glass voxels become air via `setAndDirty`)
  → 0.8s step-out onto a verified clear tile. One release per tank, at most
  two breaching at once, preallocated in `totalEnemies`),
  doors/elevator (door.ts: the lift is a `group` — hazard-striped deck with
  an UP-arrow top + an additive chevron beam up the shaft while it waits at
  the bottom; `ExitBeacon` is the same beam in green over the exit pad, lit
  only during the "step on the exit pad" objective), pickups (magnetism,
  full-bright + glow discs; powerups set
  player buff timers), pooled projectiles (rockets carry a `dmgMult` for
  quad). Hit feedback fires the SAME frame as the damage — `applyFlash()`
  sets materials white-hot immediately (the 0.08s `updateLighting` tick then
  maintains/restores it), plus a jolt tilt + scale pop on the mesh, a
  'fleshHit' thwack, micro-stagger, and knockback (brutes ×0.25) — routing it
  through the light tick alone makes hits feel like nothing.
- `src/fx/` — pooled particles (one InstancedMesh), tracers, dynamic light pool.
- `src/weapons/weapons.ts` — defs, hold-to-fire with a 0.25s click buffer,
  hitscan + rockets, viewmodels, muzzle flash. Slot 5 is the ARC CASTER
  (cells ammo): `fireArc` raycasts the first target then chains to up to 3
  more within 7u (LOS-checked, ×0.7 damage per hop), drawn as jagged teal
  tracer segments (`Tracers.fire` takes color + life; pool sized for it).
  Adding a weapon means updating BOTH `ORDER` arrays (weapons.ts — exported,
  also used by touch.ts's weapon wheel — + hud.ts), `DRY_SWITCH` in weapons.ts,
  and the Digit list in input.ts. Hitscan headshots: husk/brute hits above
  `pos.y + half.y * 0.45` deal ×2 (gold marker, +50 kill bonus via
  `Enemy.lastHitHead`, which damage() clears after each hit so splash kills
  don't inherit it). Every gun's look comes from `buildWeaponModel(id)` —
  the view model AND the floor pickup (`weaponPickup` in pickups.ts) — so
  never give pickups their own gun models again (they drifted once). View
  models are built from `vmPart` boxes: baked
  per-face shade (vertex colors), an inverted-hull 1px edge in a darker
  shade of the part's own color (×0.55, light-tinted with it — a black
  rim clashed with the world's look), and
  `glow` parts (sights, LEDs, coils) that skip the room-light tint. Their
  colors go through `rawColor()` — a plain hex is sRGB-decoded by three.js
  and renders near-black because the renderer outputs linear (this is why
  the old guns looked like silhouettes). The gun lives in
  `Renderer.overlay`, a second pass over a cleared depth buffer with its own
  fixed-75° camera: it can't clip into walls, parts occlude each other
  properly, and the FOV setting doesn't stretch it. `animate()` adds look
  sway, step-synced bob, landing dip, swing-in on switch, and per-gun
  actions keyed off `shotT` (pistol slide, shotgun pump + delayed hull eject,
  SMG bolt, rocket ready LED, arc coil charge/flare).
- `src/core/audio.ts` — every sound is WebAudio synthesis; positional pan/gain;
  self-healing autoplay resume on any gesture.
- `src/core/music.ts` — optional soundtrack: menu/ambient/combat loop slots
  with crossfades, driven per-frame from `Game.frame()` (combat = awake enemy
  within 26 units, 5s linger). Tracks come from `public/music/manifest.json`;
  the manifest ships empty so the no-asset build stays silent with zero 404s.
  Music files are git-ignored (license safety) — only manifest + README are
  tracked.
- `src/net/` — 2-player co-op, HOST-AUTHORITATIVE: the host runs the whole
  sim (AI, doors, elevator, explosions, pickups, score) and streams 12Hz
  snapshots; the client simulates only its own movement/weapon feel — enemies
  are `puppet` interpolators (`Enemy.netSet`) and every gameplay consequence
  of client actions routes through the host (`Game.applyEnemyHit`,
  `applyVoxelDamage`, `detonate`, pickup claims) and echoes back as events.
  `transport.ts` = PeerJS (room codes, lazy-loaded chunk) or BroadcastChannel
  (`?mp=local`, same-browser tabs — what coop.mjs uses). Keys are shared,
  score pooled, co-op death = respawn (no death screen), pause doesn't stop
  the world. Enemy AI targets `Game.playerTargets()` (nearest non-dead) —
  never `game.player` directly. A hidden tab freezes rAF, so Game runs a
  50ms `document.hidden` heartbeat (the coop test also disables Chromium
  background throttling). URL auto-join: `?role=host|join&room=CODE[&mp=local]`.
- `src/core/settings.ts` — persisted options (sensitivity, master + music
  volume, FOV, resolution, shake, aim assist); `Game.applySettings()` pushes
  them into systems.
- `src/platform/poki.ts` — Poki web-portal layer (details in POKI.md). Every
  call is gated on the compile-time `POKI` constant (`--mode poki`), so the
  regular build tree-shakes it out, and every call survives a missing SDK
  (ad blockers). Gameplay start/stop is NOT called at each transition: `Game.frame()` calls
  `poki.setPlaying(state === 'playing')` every frame and the wrapper only
  forwards changes — keep it that way rather than sprinkling start/stop.
  New ad points go through `Game.afterBreak(then(adShown))` (mutes audio,
  releases held keys, eats double clicks); when an ad really played, desktop
  needs a READY "click to continue" before pointer lock (the gesture is
  spent) — `enterSector`/`resumeGame` handle that. New analytics go through
  `poki.measure()` (no `/` or `^` in any value — Poki reserves them) plus a
  row in POKI.md and an assert in `poki.mjs`. Poki builds hide co-op and
  skip the SW/manifest/fullscreen.
- HUD layout (desktop): HP/armor pills + minimap top-left, objective
  (stage icon + text + arrow/distance) top-center, SECTOR + MAP/pause
  buttons + score/kills/buffs top-right, weapon slots + keycards
  bottom-center, weapon name + ammo bottom-right. Touch mode moves the slots
  to the top, hides the minimap and the bottom-right block (ammo mirrors
  over FIRE as `#tammo`), and puts `#tmap`/`#tpause` exactly over the hidden
  desktop `#sysbtns`. Icons come from `src/ui/icons.ts`: Font Awesome Free
  solid icons imported from npm and inlined as SVG (no CDN/font — Poki and
  offline safe) plus hand-drawn bullet/shell rounds. FA is CC BY 4.0 and
  minification strips its license comment, so the credit lives in
  `public/THIRD-PARTY-NOTICES.txt` (ships in web + Poki builds) — list any
  newly used icon there. Full-screen menus (`.tscreen`) must fit a ~360px
  tall landscape phone: they scroll (`overflow-y: auto`, inner block centred
  by auto margins so it never clips at the top, footer in the flow), and
  settings switch to a compact two-column grid under `max-height: 560px` —
  check new menu content at 667×375 (`features.mjs` #14).
- `src/ui/hud.ts` — DOM HUD + all screens; the voxel wordmark renderer
  (`startVoxelLogo`) draws 5×7 glyphs as extruded blocks (add glyphs to
  `GLYPHS` before using new letters in a wordmark). `hud.hint()` is the
  first-run tutorial strip: `Game.updateTips()` shows 3 control hints
  (separate touch/desktop text) in sector 1 of the first solo run, advancing
  only while playing, then sets `voxelstrike-tutorial-done` in localStorage
  (same key as the earlier Poki build — don't rename it). Update its text
  when controls change.
- `src/ui/automap.ts` — also draws the desktop minimap (`#minimap`, a
  north-up 31×31-cell window around the player, green arrow) from the same
  explored data via `drawRegion`; it skips drawing in touch mode and while
  the full map is open.
- `src/ui/automap.ts` — Tab/M (MAP button on touch) overlay canvas; reveal is
  LOS-checked per cell (rooms behind walls stay dark), doors draw in their
  lock color, exit pads green, the un-taken red key blinks. Its canvas rule
  must out-rank index.html's `#app canvas { width:100% }` — that's why the
  CSS selector is `#hud #automap-wrap #automap-canvas`. On touch the overlay
  sits ABOVE the touch controls, so it takes `pointer-events` itself: any tap
  closes it (touchstart is preventDefault-ed so the tap never becomes a
  look-drag), plus a CLOSE MAP button. On desktop it stays pointer-transparent
  (clicks fire the gun; Tab/M close it). `Game.frame()` force-closes it
  whenever state isn't 'playing'. `features.mjs` #12 covers the touch flow.

## Conventions & gotchas

- Game state (grids, positions, AI) is plain data; Three.js objects only mirror
  it. Entities are CPU-lit: they sample the baked light grid + `DynLights`.
- Everything visual is theme-locked to the palette: hazard `#ffd028`, keycard
  red `#ff3428`, exit green `#4cc26a`, steel `#566076`, void `#05060a`.
- Object pools everywhere (particles, projectiles, tracers) — no per-shot
  allocations in the hot path.
- **60 fps on phones is a Poki requirement**, and the limit there is draw
  calls (every rig/gun part is a mesh). Three mechanisms keep it (details in
  docs/ARCHITECTURE.md "Frame budget", guarded by `perf.mjs`): (1) the
  occlusion cull DETACHES a hidden enemy's inner `body` group (and hidden
  pickups), so game logic must keep using the OUTER `mesh.visible`, and
  anything reading part world positions must call `attachBody(true)` first
  (the death gib burst does); (2) `bakeModel` merges each gun's static
  parts, so a new animated or colour-pulsing gun part needs a `WeaponModel`
  handle or it gets baked in; (3) `Renderer.warmUp()` at level build
  compiles every shader, which covers new pooled/hidden objects as long as
  they're in the scene or overlay by then. Level transitions go through
  `Game.teardownLevel()`; dispose geometries/materials there when adding scene
  objects.
- Above-world voxels read as Air, all other out-of-bounds as Rock — this is
  load-bearing for physics (see the sky-ejection bug history in README/tests).
- Splash damage and husk bites are LOS-checked; don't add damage paths that
  ignore occlusion.
- Aim assist (`WeaponSystem.applyAimAssist` magnetism, sticky aim, and
  `Player.rotationAssist`) is hard-gated on `game.isTouch` — desktop mouse aim
  must stay raw. All three pick targets via `findAimTarget`
  (`src/entities/aimassist.ts`) with size-aware cones (body half-width +
  margin, clamped). Rotation assist eases the view toward the target only
  while the player is steering (look drag / move / fire held) — never idle
  drift, never fighting a drag away. Cones clamp the target height into the
  enemy's body span before measuring the angle; if you compare against the
  enemy CENTER instead, the vertical error alone exceeds the cone at close
  range and the assist silently never fires (that bug already happened once).
- Real pointer lock in headless Edge captures the developer's OS cursor
  (hidden window, cursor clipped/warped to the top-left). Every browser test
  calls `fakePointerLock(browser)` (`scripts/lib/fake-pointer-lock.mjs`) right
  after launch — an in-page emulation that keeps the real rules (fresh gesture,
  visible + focused tab, ESC releases). New test scripts must call it too.
  Tests should still `document.exitPointerLock()` (or use JS `.click()`)
  before clicking menu buttons mid-game, as with a real lock.
- Don't run the test suites while source files are being edited: Vite reloads
  the page on save and the tests fail with "page reload" / "barely moved".
- Pointer lock needs a FRESH user gesture: a co-op host's game starts whenever
  the partner joins (long after the HOST click), so the automatic lock is
  refused. `Input.onUnlockedClick` → `requestLock()` recaptures on any
  mid-game click (that click must not fire the gun — firing is gated on
  `locked`), and startGame shows a "click to capture" hint if lock is absent.
- Touch devices (`src/core/touch.ts`, detected via pointer:coarse) get a
  virtual joystick + look-drag + FIRE/JUMP/pause buttons feeding the same
  `Input` abstraction; pointer lock is skipped entirely and pause runs through
  `Game.requestPause()`/`resumeGame()` instead of lock-change events. Touch
  mode adds `body.touch-mode` (mobile HUD = top strip; CSS in hud.ts) and
  tries fullscreen + orientation lock on start. When held in portrait, the
  whole body gets `.force-landscape` (CSS rotate 90°); Renderer.resize reads
  BODY client dims (not window) and TouchControls.mapXY converts raw touch
  coords into the rotated game space — keep those three in sync. The
  joystick is invisible until touched (appears under the thumb, hides on
  release) — a resting on-screen ring was tried and rejected. FIRE, JUMP
  and the weapon button stack against the RIGHT EDGE: buttons placed further
  in sat under the aiming thumb and got hit by look swipes. Weapon
  switching on touch is the `#tweapon` button above JUMP: tap = next owned,
  swipe = prev/next, hold 280ms = a wheel of owned weapons (slide + release
  picks, release on the button cancels); wheel positions use offsetLeft/Top
  (layout space) so they match `mapXY`. The top slot bar shows owned weapons
  only, and an empty weapon auto-switches to a loaded one (touch only,
  `DRY_SWITCH` order, rockets last). `features.mjs` #13 covers all of it.
- PWA: `public/manifest.webmanifest` (fullscreen, landscape) + `public/sw.js`
  (network-first, cache fallback — bump its CACHE name when changing SW
  behavior) + icons from `node scripts/gen-icons.mjs`. The SW registers in
  production builds only (`import.meta.env.PROD` in main.ts), so dev/HMR and
  the test suites never hit it.
- `vite.config.ts` uses `base: './'` so builds work on GitHub Pages project
  sites and Poki's CDN — don't remove it. In `--mode poki` its `pokiPlugin`
  injects the SDK `<script>` (Poki requires it in `<head>`; no SRI — the v2
  URL is updated in place by Poki) and deletes `sw.js`, the web manifest and
  `public/marketing/` from `dist-poki/`.
- The only page reloads left are co-op teardown (`reloadToTitle()` in
  game.ts — it drops the `?role`/`?room` params; Poki builds use
  `location.reload()` to keep their iframe params) and the graphics-lost
  overlay's "Reload game" button. Don't add reload-based restarts: each
  reload is another Poki load and loses in-memory state.
