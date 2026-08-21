# VOXELSTRIKE — project guide

Original retro voxel FPS (TypeScript + Three.js + Vite). All content — levels,
textures, models, sounds — is generated procedurally at runtime; there are no
binary assets and nothing copied from other games. Keep it that way.

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
node scripts/monkey.mjs     # randomized stress run with NaN/out-of-world invariants
```

`?seed=N` on the URL reproduces a layout deterministically. `window.__voxelstrike`
is the debug handle the tests use (the Game instance).

## Architecture

- `src/game.ts` — orchestrator: state machine (title/playing/paused/dead/
  intermission/won), 3-sector campaign flow with in-place level teardown,
  explosions + barrel chain fuses, FOV punch, screen wiring.
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
- `src/entities/` — player (movement/health/keys), enemies (state machines:
  idle/patrol/chase/attack/pain/dead; husks have jointed rigs + serpentine
  chase; deaths burst into per-part gibs), doors/elevator, pickups (magnetism,
  full-bright + glow discs), pooled projectiles.
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
- `src/core/settings.ts` — persisted options (sensitivity, volume, FOV,
  resolution, shake); `Game.applySettings()` pushes them into systems.
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
