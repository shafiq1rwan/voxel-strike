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

## Commands

```bash
npm run dev        # dev server on http://localhost:5173
npm run build      # tsc --noEmit + vite build → dist/  (run this before calling work done)
npm run preview    # serve the production build on :4173
```

Headless test suites (need a dev or preview server running; they drive Edge at
`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` via
puppeteer-core and save screenshots to `scripts/shots/`):

```bash
node scripts/smoke.mjs      # boot, move, shoot, explode; fails on any console error; enemy-bounds watchdog
node scripts/e2e.mjs        # plays the whole 3-sector campaign: aggro, barrels, key → vault → lift → exit
node scripts/movement.mjs   # WASD displacement must match camera basis vectors at 5 yaw angles
node scripts/firing.mjs     # spam-click / hold-to-fire / click-buffer semantics
node scripts/aimassist.mjs  # touch profile: magnetism snaps a 3° miss, 9° stays a miss, sticky-aim ratio ~0.55; desktop unaffected
node scripts/features.mjs   # ticker suicide/corpse-chain, key ambush, powerups, score + combo, arena/brute/arc-caster, headshots, automap, walk-on elevator ride
node scripts/monkey.mjs     # randomized stress run with NaN/out-of-world invariants
node scripts/coop.mjs       # 2-player co-op over the BroadcastChannel transport: link/seed handshake, avatar + puppet sync, authority routing, shared keys/score, level transition, respawn
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
  intermission/won), 3-sector campaign flow with in-place level teardown,
  explosions via `queueExplosion` fuses (barrel chains AND ticker corpses —
  each entry carries its own damage/radius), FOV punch, screen wiring.
  Also owns score + combo (kills within 2.5s chain a ×5-capped multiplier,
  streak popups at 2/3/4 kills), per-seed best score in localStorage
  (`voxelstrike-best-<seedHex>`), and `onKeyPickup()` — grabbing the red
  keycard spawns an awake ambush in the key room (and bumps
  `level.totalEnemies` so intermission ratios stay honest).
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
  CeilVent/Chain) are cosmetic-only: same physics as Wall/Ceil. Ceiling UVs
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
  walk-on ride regression for this.
- `src/entities/` — player (movement/health/keys, timed `buffs`:
  quad ×4 damage / shield full absorb / haste ×1.35 move+fire), enemies
  (state machines: idle/patrol/chase/attack/charge/pain/dead; husks have
  jointed rigs + serpentine chase; tickers sprint, arm at <1.8u, and ALWAYS
  detonate on death via `queueExplosion` — even sniped at range; brutes share
  the husk rig/gait at heavier proportions, telegraph a 4.2× charge that
  smashes destructibles in its path, get stunned 1.3s on a wall slam via
  `stunTime`, and always drop a powerup; deaths burst into per-part gibs),
  doors/elevator, pickups (magnetism, full-bright + glow discs; powerups set
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
  Adding a weapon means updating BOTH `ORDER` arrays (weapons.ts + hud.ts)
  and the Digit list in input.ts. Hitscan headshots: husk/brute hits above
  `pos.y + half.y * 0.45` deal ×2 (gold marker, +50 kill bonus via
  `Enemy.lastHitHead`, which damage() clears after each hit so splash kills
  don't inherit it).
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
- `src/ui/hud.ts` — DOM HUD + all screens; the voxel wordmark renderer
  (`startVoxelLogo`) draws 5×7 glyphs as extruded blocks (add glyphs to
  `GLYPHS` before using new letters in a wordmark).
- `src/ui/automap.ts` — Tab/M (MAP button on touch) overlay canvas; reveal is
  LOS-checked per cell (rooms behind walls stay dark), doors draw in their
  lock color, exit pads green, the un-taken red key blinks. Its canvas rule
  must out-rank index.html's `#app canvas { width:100% }` — that's why the
  CSS selector is `#hud #automap-wrap #automap-canvas`.

## Conventions & gotchas

- Game state (grids, positions, AI) is plain data; Three.js objects only mirror
  it. Entities are CPU-lit: they sample the baked light grid + `DynLights`.
- Everything visual is theme-locked to the palette: hazard `#ffd028`, keycard
  red `#ff3428`, exit green `#4cc26a`, steel `#566076`, void `#05060a`.
- Object pools everywhere (particles, projectiles, tracers) — no per-shot
  allocations in the hot path. Level transitions go through
  `Game.teardownLevel()`; dispose geometries/materials there when adding scene
  objects.
- Above-world voxels read as Air, all other out-of-bounds as Rock — this is
  load-bearing for physics (see the sky-ejection bug history in README/tests).
- Splash damage and husk bites are LOS-checked; don't add damage paths that
  ignore occlusion.
- Aim assist (`WeaponSystem.applyAimAssist` magnetism + `Player.aimNearEnemy`
  sticky aim) is hard-gated on `game.isTouch` — desktop mouse aim must stay
  raw. Both cones clamp the target height into the enemy's body span before
  measuring the angle; if you compare against the enemy CENTER instead, the
  vertical error alone exceeds the cone at close range and the assist silently
  never fires (that bug already happened once).
- Pointer lock **does** engage in headless Chrome: while locked, real mouse
  clicks hit the canvas, not DOM buttons. Tests must `document.exitPointerLock()`
  (or use JS `.click()`) before clicking menu buttons mid-game.
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
  coords into the rotated game space — keep those three in sync.
- PWA: `public/manifest.webmanifest` (fullscreen, landscape) + `public/sw.js`
  (network-first, cache fallback — bump its CACHE name when changing SW
  behavior) + icons from `node scripts/gen-icons.mjs`. The SW registers in
  production builds only (`import.meta.env.PROD` in main.ts), so dev/HMR and
  the test suites never hit it.
- `vite.config.ts` uses `base: './'` so builds work on GitHub Pages project
  sites — don't remove it.
