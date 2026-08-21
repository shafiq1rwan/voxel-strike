# VOXELSTRIKE — project guide

Original retro voxel FPS (TypeScript + Three.js + Vite). The core content —
levels, textures, models, sounds — is generated procedurally at runtime and
must keep working with zero assets present. On top of that base there are two
*optional* asset layers (enemy sprite skins, music) loaded from manifests in
`public/`; both degrade gracefully to the procedural versions when absent.
Nothing is ever copied from other games; third-party assets need a license
check before being committed (that's why `public/sprites/*` and
`public/music/*` are git-ignored apart from manifests/docs/generated files).

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
node scripts/features.mjs   # ticker suicide/corpse-chain, key ambush, quad/shield/haste powerups, score + combo
node scripts/monkey.mjs     # randomized stress run with NaN/out-of-world invariants
```

`?seed=N` on the URL reproduces a layout deterministically. `window.__voxelstrike`
is the debug handle the tests use (the Game instance).

Tool scripts (not tests):

```bash
node scripts/gen-icons.mjs                        # regenerate PWA icons
node scripts/gen-demo-sprite.mjs                  # regenerate the demo enemy sprite sheet
node scripts/itch-download.mjs <url> <dir>        # download a free/PWYW itch.io project via the real browser flow
node scripts/repack-sprites.mjs inspect|pack ...  # map a downloaded sheet into the game's 5-row sprite layout
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
  `blockHP`, and `drawTile` must stay in sync when adding a block.**
- `src/world/levelgen.ts` — rooms + MST corridors, doors (exit door always
  red-locked, forced placement), secret room behind cracked blocks, exit ledge
  + elevator, barrels/crates/lamps/pickups/enemies. Every layout is validated
  by a BFS walkability check (key reachable *without* the key, exit reachable
  *with* it) and regenerated from fallback seeds if broken.
- `src/core/physics.ts` — axis-by-axis AABB vs voxels + dynamic boxes (doors,
  elevator). The voxel resolver only corrects penetration caused by *this
  frame's movement* (`maxPen` guard) — deep pre-existing embeds must never be
  face-snapped or bodies ratchet through the world. Dynamic boxes are exempt
  (rising elevators legitimately push bodies).
- `src/entities/` — player (movement/health/keys, timed `buffs`:
  quad ×4 damage / shield full absorb / haste ×1.35 move+fire), enemies
  (state machines: idle/patrol/chase/attack/pain/dead; husks have jointed
  rigs + serpentine chase; tickers sprint, arm at <1.8u, and ALWAYS detonate
  on death via `queueExplosion` — even sniped at range; deaths burst into
  per-part gibs), doors/elevator, pickups (magnetism, full-bright + glow
  discs; powerups set player buff timers), pooled projectiles (rockets carry
  a `dmgMult` for quad).
- `src/entities/sprites.ts` — optional Doom-style billboard skins for enemies.
  `public/sprites/manifest.json` maps enemy kinds to sheets with a fixed row
  order (idle/walk/attack/pain/death; death plays once, last frame = corpse,
  and corpses fall to the floor). Enemies lazily swap their voxel rig for the
  sprite when the skin loads and fall back to the rig when none exists. The
  shipped troll/eye sheets come from a k-aa itch.io pack (commercial-ok, no
  redistribution → git-ignored, so a fresh clone / the Pages deploy uses the
  voxel rigs unless the files are re-added).
- `src/fx/` — pooled particles (one InstancedMesh), tracers, dynamic light pool.
- `src/weapons/weapons.ts` — defs, hold-to-fire with a 0.25s click buffer,
  hitscan + rockets, viewmodels, muzzle flash.
- `src/core/audio.ts` — every sound is WebAudio synthesis; positional pan/gain;
  self-healing autoplay resume on any gesture.
- `src/core/music.ts` — optional soundtrack: menu/ambient/combat loop slots
  with crossfades, driven per-frame from `Game.frame()` (combat = awake enemy
  within 26 units, 5s linger). Tracks come from `public/music/manifest.json`;
  the manifest ships empty so the no-asset build stays silent with zero 404s.
  Music files are git-ignored (license safety) — only manifest + README are
  tracked.
- `src/core/settings.ts` — persisted options (sensitivity, master + music
  volume, FOV, resolution, shake, aim assist); `Game.applySettings()` pushes
  them into systems.
- `src/ui/hud.ts` — DOM HUD + all screens; the voxel wordmark renderer
  (`startVoxelLogo`) draws 5×7 glyphs as extruded blocks (add glyphs to
  `GLYPHS` before using new letters in a wordmark).

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
