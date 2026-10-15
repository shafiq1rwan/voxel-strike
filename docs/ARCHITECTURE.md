# Architecture

How VOXELSTRIKE is put together: what each module owns, how a frame runs,
how a sector is built and torn down, and how co-op and the Poki build hang
off the core. The per-file rules and known gotchas live in
[CLAUDE.md](../CLAUDE.md); this page is the map.

## The shape of it

- **One page, no assets.** TypeScript + Three.js + Vite. Levels, textures,
  models and sounds are all generated at runtime. The only optional assets
  are music tracks (`public/music/`) and a few inlined Font Awesome icons.
- **One orchestrator.** `Game` (`src/game.ts`) owns the state machine, every
  system, the sector lifecycle, score and the objective tracker.
- **Plain data first.** The voxel grid, physics bodies, level data and enemy
  state machines are plain data and math. Three.js objects only mirror that
  state each frame, so the simulation can be reasoned about (and networked)
  without the renderer.
- **No reloads.** Restarts, retries, new runs and quitting to the menu all
  rebuild the sector in place. The only page reloads are leaving co-op and
  the "Reload game" button on the graphics-lost overlay.

## Module map

| Area | Files | Owns |
|---|---|---|
| Entry | `main.ts` | Poki init (Poki builds), constructs `Game`, registers the service worker (web builds) |
| Orchestration | `game.ts` | State machine, frame loop, sector lifecycle + checkpoints, explosions queue, score/combo, objective tracker, co-op routing |
| Shared types | `types.ts` | Plain-data types (no Three.js imports) |
| Rendering | `core/renderer.ts` | WebGL renderer at a fixed 240-line internal resolution, fog, the world pass + the weapon overlay pass |
| Input | `core/input.ts`, `core/touch.ts` | Keyboard + pointer-lock mouse; touch joystick/look/buttons/weapon wheel feeding the same `Input` |
| Physics | `core/physics.ts` | Axis-by-axis AABB vs voxels + dynamic boxes (doors, lift), ray/box tests |
| Audio | `core/audio.ts`, `core/music.ts` | Every sound synthesized with WebAudio; optional crossfading music loops |
| Settings | `core/settings.ts` | Persisted options (sensitivity, volumes, FOV, resolution, shake, aim assist) |
| RNG | `core/rng.ts` | Seeded mulberry32 — the same seed always builds the same dungeon |
| World | `world/blocks.ts`, `world.ts`, `mesher.ts`, `levelgen.ts` | Block types + procedural texture atlas, the voxel grid + light bake, greedy chunk mesher + shader, the dungeon generator + validator |
| Entities | `entities/*.ts` | Player, enemies (AI + voxel rigs), doors + lift + exit beacon, pickups, pooled projectiles, co-op avatars, touch aim assist targeting |
| Weapons | `weapons/weapons.ts` | Weapon defs, hold-to-fire, hitscan/rockets/arc, view models + their animation |
| Effects | `fx/particles.ts`, `tracers.ts`, `dynlights.ts` | One `InstancedMesh` of particles, pooled tracers, the 6-slot dynamic light pool |
| UI | `ui/hud.ts`, `automap.ts`, `icons.ts` | DOM HUD + every screen, automap + desktop minimap, inline SVG icons |
| Co-op | `net/netplay.ts`, `net/transport.ts` | Host-authoritative sync; PeerJS or BroadcastChannel transport |
| Platform | `platform/poki.ts` | Poki SDK wrapper, compiled out of the web build ([POKI.md](../POKI.md)) |

## Game states

```
            ┌──────────── New run / Continue ────────────┐
            ▼                                            │
 title ──► playing ◄──► paused (Esc, pause button, pointer lock lost, graphics lost)
            │  │
            │  └──► dead ──► Retry sector ──► playing   (solo; co-op respawns instead)
            │               └► New run ─────► playing
            │
            ├──► intermission (sector 1, 2 cleared) ──► playing (next sector)
            │
            └──► won (sector 3 cleared) ──► results ──► Play a new layout / Main menu
```

`Game.frame()` calls `poki.setPlaying(state === 'playing')` every frame;
the Poki wrapper forwards only the transitions.

## A frame

`requestAnimationFrame` → `Game.frame()` (a 50 ms `document.hidden`
heartbeat keeps co-op hosts ticking in background tabs):

1. `dt` is clamped to 50 ms. Automap is force-closed outside play; tutorial
   hints and the FPS meter tick; music picks menu / ambient / combat.
2. **Simulation** (while playing, dead, or a co-op pause): co-op network
   update → explosion fuses → doors + lift (authority only) → player →
   world-escape guard → weapons → enemies → projectiles → particles →
   tracers → pickups → lift + exit-beacon animation → objective tracker →
   HUD stats → automap/minimap → combo timer, low-health state, ambience.
3. **Present:** camera from the player, audio listener, FOV punch decay,
   dynamic lights ranked, dirty chunks re-meshed, then render.

## Building a sector

Every sector entry goes through `Game.enterSector()`:

1. **Teardown** (`teardownLevel`) disposes the previous sector's meshes,
   materials and entities. Pools (particles, tracers, projectiles) survive.
2. **Generate** (`levelgen.ts`): the arena room first, then rooms by
   rejection sampling, MST corridors + loops, doors (the exit door is always
   red-locked), the secret room, exit ledge + lift, then props, lamps,
   pickups and enemies. A BFS walkability check (key reachable *without* the
   key, exit reachable *with* it) rejects broken layouts and retries with a
   fallback seed. Decoration uses a position hash, not the layout RNG, so
   tuning deco never reshuffles a seed's layout.
3. **Light bake** (`world.ts`): a BFS flood from every lamp block into a
   per-voxel RGB grid.
4. **Mesh** (`mesher.ts`): one greedy-meshed chunk per 16×16 column; faces
   merge only when tile and quantized light match.
5. **Entities**: player at the spawn, enemies, doors, lift, pickups.
6. **Checkpoint**: score, health, armor, ammo and loadout at sector entry,
   so *Retry sector* can restore it; from sector 2 on it's also saved to
   localStorage for *Continue*.

## Rendering

- **World pass:** the chunk `ShaderMaterial` tiles the texture atlas across
  merged quads with `fract()` in block space, applies the baked light as
  vertex color, and adds up to 6 dynamic lights per fragment. Fog is dark
  and linear. The canvas is a fixed 240 lines tall, CSS-upscaled with
  `image-rendering: pixelated`.
- **Entities are CPU-lit:** enemies, pickups and props sample the baked
  light grid plus `DynLights` and tint their materials (on a ~0.08 s tick;
  hit flashes apply immediately).
- **Weapon pass:** the first-person gun lives in `Renderer.overlay`, drawn
  after the world over a cleared depth buffer with its own fixed 75° camera.
  It can't clip into walls, its parts occlude each other properly, and the
  FOV setting doesn't stretch it. See [ART.md](ART.md) for how it's shaded.
- **HUD** is plain DOM over the canvas (`ui/hud.ts`); the automap and
  minimap are 2D canvases.

## Combat

- **Hitscan** (pistol, shotgun pellets, SMG) raycasts voxels, closed doors
  and enemy boxes; husk/brute hits in the top slice are headshots (×2).
- **Projectiles** (rockets, sentinel bolts) are pooled; rockets carry a
  damage multiplier for Quad.
- **Arc caster** chains from the first hit to up to 3 more enemies (LOS
  checked, ×0.7 per hop).
- **Explosions** go through `queueExplosion` fuses (barrels, ticker corpses),
  and splash damage is LOS-checked. Never add a damage path that ignores
  occlusion.
- **Touch aim assist** (bullet magnetism, sticky aim, rotation assist)
  shares `findAimTarget()` in `entities/aimassist.ts` and is hard-gated on
  touch; desktop mouse aim stays raw.

## Co-op (host-authoritative)

The host runs the whole simulation (AI, doors, lift, explosions, pickups,
score) and streams snapshots at 12 Hz; each player's own pose goes out at
20 Hz. The client simulates only its own movement and weapon feel — its
enemies are `puppet` interpolators — and every gameplay consequence of a
client action (hits, voxel damage, detonations, pickup claims) is routed
through the host and echoed back as an event. Transports: PeerJS with room
codes (lazy-loaded), or BroadcastChannel for same-browser tabs
(`?mp=local`, what `coop.mjs` uses). Enemy AI targets
`Game.playerTargets()` (the nearest living player), never `game.player`.

## Persistence (localStorage)

| Key | Holds |
|---|---|
| `voxelstrike-settings` | Settings |
| `voxelstrike-run` | Saved checkpoint for *Continue* (sector 2+) |
| `voxelstrike-best-<seedHex>` | Best score for that layout seed |
| `voxelstrike-tutorial-done` | First-run control hints shown |

The run and tutorial keys match the earlier Poki build — don't rename them.

## Builds and deploy

| Build | Command | Output | Goes to |
|---|---|---|---|
| Web | `npm run build` | `dist/` | GitHub Pages: `.github/workflows/deploy.yml` builds and deploys on every push to `main` |
| Poki | `npm run zip:poki` | `dist-poki/` + `voxelstrike-poki.zip` | Uploaded by hand to the Poki Inspector ([POKI.md](../POKI.md)) |

`vite.config.ts` uses `base: './'` so both work from a sub-path. The web
build is also a PWA (`public/manifest.webmanifest` + network-first
`public/sw.js`, registered in production only).

## Where to change what

| To change… | Look at |
|---|---|
| A weapon's stats or feel | `WEAPONS` + `animate()` in `weapons/weapons.ts` |
| Add a weapon | Both `ORDER` arrays (weapons.ts, hud.ts), `DRY_SWITCH`, the Digit list in `input.ts` |
| Add a block | `world/blocks.ts` — the enums and tables must stay in sync, and ids are append-only |
| Level layout rules | `world/levelgen.ts` (keep the BFS validation passing) |
| Enemy behaviour | `entities/enemies.ts` |
| HUD / screens | `ui/hud.ts` ([UI_SPEC.md](UI_SPEC.md)) |
| Touch controls | `core/touch.ts` + the touch CSS in `ui/hud.ts` |
| A Poki event | `poki.measure()` + a row in POKI.md + an assert in `scripts/poki.mjs` |
