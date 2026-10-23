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
| Entry | `main.ts` | Poki init (Poki builds), constructs `Game`, registers the service worker (web builds); web builds route `?sector4` (the hand-built Biofoundry preview map; its module is in the main bundle because sectors 4–5 use its scenery) and `?operative` (character viewer, lazy-loaded) |
| Biofoundry + previews | `preview/biofoundry.ts`, `preview/operative-viewer.ts` | The Biofoundry's scenery and live tank breaches for the generated sector 4 (`decorateBiofoundry`, driven by `level.bio`), the facility terminal text, and the hand-built `?sector4` preview map; the Facility Operative viewer (sheet / orbit / compare), standalone, no `Game` |
| Geothermal scenery | `preview/geothermal-gen.ts` | The generated Geothermal Core's (sectors 6–7) steam, spawn-room sign and optional POWER LINK puzzle (`decorateGeothermal`, driven by `level.geo` from levelgen `placePowerLink`): amber cable from a wall node to a sealed supply cage; shooting the node (`voxelHit`) sinks the gate, clears the PowerBarrier grille and unseals the pickups. `preview/geothermal.ts` is Codex's hand-built `?sector6` map |
| Orchestration | `game.ts` | State machine, frame loop, sector lifecycle + checkpoints, explosions queue, score/combo, objective tracker, co-op routing |
| Shared types | `types.ts` | Plain-data types (no Three.js imports) |
| Rendering | `core/renderer.ts` | WebGL renderer at a low internal resolution (Settings → Pixelation: 480 lines default on desktop, 320 on touch), fog, the world pass + the weapon overlay pass |
| Input | `core/input.ts`, `core/touch.ts` | Keyboard + pointer-lock mouse; touch joystick/look/buttons/weapon wheel feeding the same `Input` |
| Physics | `core/physics.ts` | Axis-by-axis AABB vs voxels + dynamic boxes (doors, lift), ray/box tests |
| Audio | `core/audio.ts`, `core/music.ts` | Every sound synthesized with WebAudio; optional crossfading music loops |
| Settings | `core/settings.ts` | Persisted options (sensitivity, volumes, FOV, resolution, shake, aim assist) |
| Survival | `modes/survival.ts` | The secondary mode (the quiet *Survival* button under PLAY; it was PLAY for one Fit Test and playtime fell): `prepareSurvivalLevel` (a generated sector's arena room sealed as the stage), `SurvivalRun` (waves, edge spawns, drops, map every 5 waves), the roster/size/HP curves, the scrap rates and the gun SHOP prices. Game owns `survival` and the wave-clear pick → shop (`showShop`, gun pictures from `gunSnapshot` in ui/armory-preview.ts on the Armory's one shared WebGL context) / death / HUD glue |
| Upgrades | `core/upgrades.ts` | Scrap + permanent upgrades (docs/RETENTION_PLAN.md): the 7 upgrades × 3 tiers as data, scrap per kill / clear / secret / Power Link, and `UpgradeBook` (scrap, levels; localStorage). Kills drop scrap as a `'scrap'` pickup (`dropScrap` → `collectScrap`); Game feeds the bank through `earnScrap` (which also pops the HUD counter), Survival's shop spends it (`UpgradeBook.spend`), and applies the effects (`applyPerkStats`, `applyRunStart`, `enterSector`, `healMult`, `scannerLevel`) |
| Skins | `core/skins.ts` | The 22 weapon skins as data (paint roles + flat marks + unlock goal) and `SkinBook` (lifetime stats, unlocks, equipped; localStorage). `buildWeaponModel(id, skin)` paints them; `WeaponSystem.setSkin` swaps a view model in place |
| RNG | `core/rng.ts` | Seeded mulberry32 — the same seed always builds the same dungeon |
| World | `world/blocks.ts`, `world.ts`, `mesher.ts`, `levelgen.ts` | Block types + procedural texture atlas, the voxel grid + light bake, greedy chunk mesher + shader, the dungeon generator + validator |
| Entities | `entities/*.ts` | Player, enemies (AI + voxel rigs), doors + lift + exit beacon, pickups, pooled projectiles, co-op avatars, touch aim assist targeting, the Facility Operative rig (`operative.ts`) |
| Weapons | `weapons/weapons.ts` | Weapon defs, hold-to-fire, hitscan/rockets/arc, view models + their animation |
| Effects | `fx/particles.ts`, `tracers.ts`, `dynlights.ts` | One `InstancedMesh` of particles, pooled tracers, the 6-slot dynamic light pool |
| UI | `ui/hud.ts`, `automap.ts`, `icons.ts` | DOM HUD + every screen, automap + desktop minimap, inline SVG icons |
| Co-op | `net/netplay.ts`, `net/transport.ts` | Host-authoritative sync; PeerJS or BroadcastChannel transport |
| Platform | `platform/poki.ts` | Poki SDK wrapper, compiled out of the web build ([POKI.md](../POKI.md)) |

`entities/exit-room-props.ts` owns the generated exit hall's instanced service
equipment, cabinet/toolbox collision boxes and three-state lift status atlas.
`Game` creates and disposes it with the level, and includes its boxes in the
shared collision list. Exit-only surface tiles live in `world/blocks.ts`;
`levelgen.ts` supplies local light-source colour/range overrides to the bake.
Invisible collision rails transmit baked light. Web `?exitroom` places the
player on the boarding apron for visual review; ordinary spawns are unchanged.

## Game states

```
            ┌──────────── New run / Continue ────────────┐
            ▼                                            │
 title ──► playing ◄──► paused (Esc, pause button, pointer lock lost, graphics lost)
            │  │
            │  └──► dead ──► Revive here ─────────► playing   (in place, once per attempt)
            │               ├► Retry from keycard ─► playing   (in place, if the key was taken)
            │               ├► Retry / Restart sector ► playing (sector rebuilt)
            │               └► New run ────────────► playing   (solo only; co-op respawns instead)
            │
            ├──► intermission = sector clear: tally + rank, pick 1 of 3 perks (solo) ──► playing (next sector)
            ├──► intermission (sector 3 cleared) ──► facility terminal ──► playing (sector 4, Biofoundry)
            ├──► intermission (sector 4 cleared) ──► playing (sector 5, deep Biofoundry)
            │
            └──► won (sector 5 cleared; co-op: sector 3) ──► results ──► Keep descending (solo) / Play a new layout / Main menu
                                                                   │
                                                                   └──► ad break ──► playing (depth 6, 7, … endless)
```

**Endless depths.** `Game.levelIndex` keeps counting past `TOTAL_SECTORS`
(5); `Game.endless` is true from depth 6. `themeFor(n)` keeps 1–3 facility
and 4–5 Biofoundry, then alternates facility and Biofoundry every two
depths. `bossFor(n)` is true on every fifth depth (solo only), which forces
the Biofoundry. Endless levels use `generateLevel(seed, n, …)` with the depth
as difficulty (Biofoundry tanks up to 8 occupied, up to two extra enemies per
far room, a 90-enemy cap) and multiply enemy HP by up to 1.8. A depth clear
is the normal sector-clear screen with a perk offer; once the perk pool is
empty, `rollPerkOffer` fills it with one-off rewards (full health, ammo,
armor). The HUD, pause, death and title screens say DEPTH instead of SECTOR.

**Boss gate.** On a boss depth, `levelgen` places the Broodkeeper against a
door-free wall of the arena room (`LevelData.boss`) and puts the red key spec
in front of it. `buildLevel` holds that key back (`Game.bossKey`) and spawns
the boss; the objective's first stage is `boss`. `Enemy.die()` calls
`Game.onBossDefeated`, which clears its acid, spawns the held-back key and
hides the boss bar. The keycard ambush is skipped on boss levels.

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
   dynamic lights ranked, dirty chunks re-meshed (within a ~3 ms budget,
   at least one per frame), occlusion cull, then render.

## Building a sector

Every sector entry goes through `Game.enterSector()`:

1. **Teardown** (`teardownLevel`) disposes the previous sector's meshes,
   materials and entities. Pools (particles, tracers, projectiles) survive.
2. **Generate** (`levelgen.ts`): the arena room first, then rooms by
   rejection sampling, MST corridors + loops, doors (the exit door is always
   red-locked), the secret room, exit ledge + lift (+ a hazard `Trim` rail
   along the ledge's open edge, gap where the lift docks), then props, lamps,
   pickups and enemies. A BFS walkability check (key reachable *without* the
   key, exit reachable *with* it) rejects broken layouts and retries with a
   fallback seed. Decoration uses a position hash, not the layout RNG, so
   tuning deco never reshuffles a seed's layout. Sector 1 (difficulty 1) is
   a short opener: 6–7 rooms, a shotgun in the spawn room, no ticker nests,
   no brute, and a hashed barrel pair in the first room. On a boss depth the
   generator retries until the Broodkeeper fits its wall.
3. **Light bake** (`world.ts`): a BFS flood from every lamp block into a
   per-voxel RGB grid.
4. **Mesh** (`mesher.ts`): one greedy-meshed chunk per 16×16 column; faces
   merge only when tile and quantized light match.
5. **Entities**: player at the spawn, enemies, doors, lift, pickups. Then
   `Renderer.warmUp()` compiles and finalises every shader and uploads every
   texture, so nothing compiles on first use mid-fight.
6. **Checkpoint**: score, health, armor, ammo and loadout at sector entry,
   so *Retry sector* can restore it; from sector 2 on it's also saved to
   localStorage for *Continue*. A second, in-memory checkpoint is taken when
   the red keycard is grabbed (solo): *Retry from keycard* and *Revive* don't
   rebuild anything — `bringBack()` stands the player up in the live world
   with a 60 hp floor, a 2.5 s overshield and nearby enemies repelled.

## Rendering

- **World pass:** the chunk `ShaderMaterial` tiles the texture atlas across
  merged quads with `fract()` in block space, applies the baked light as
  vertex color, and adds up to 6 dynamic lights per fragment. Fog is dark
  and linear. The canvas is the Pixelation setting's height in lines (480
  desktop / 320 touch by default), CSS-upscaled with
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

### Frame budget (Poki: 60 fps)

On phones the bottleneck is CPU-side draw submission, not pixels (240p) or
AI. Every rig part and gun part is its own mesh, so the counts are guarded
by `scripts/perf.mjs`:

- **Occlusion cull** (`core/occlusion.ts`, `Game.cullHidden`): each frame a
  few voxel rays from the eye test every enemy and pickup. With no clear ray
  (after a 0.3 s hold), an enemy's inner `body` group is *detached* from its
  mesh and a pickup from its group, so three.js neither draws it nor updates
  its matrices. Only air and `TankGlass` are see-through. Sector 1 with
  every enemy awake went from ~730 draws a frame to ~60–110.
- **Far plane = fog far + 2:** past total fog everything is background
  coloured anyway, so frustum culling drops it.
- **Baked guns** (`bakeModel` in `weapons.ts`): after a gun is built, its
  static parts merge into at most four meshes (lit / lit rims / glow / glow
  rims) with part colours in vertex colours. Only the parts with a
  `WeaponModel` handle stay separate: slide, pump and bolt move; LED, coils,
  core, tips and cell window animate their colour. A new animated part MUST
  get a handle or it is baked away. A gun went from ~30 draws to 4–11.
- **Shader warm-up** (`Renderer.warmUp`, end of the level build): shows
  hidden objects (pooled projectiles, the guns not in hand), compiles every
  program, finalises it (three.js otherwise blocks on the driver's link
  result at first use, a ~100 ms freeze on the first rocket) and uploads
  every texture.
- **No hot-path allocation:** dynamic lights pool submissions and select
  the top 6 without sorting; door/lift `box()` reuse one object; door
  triggers are pooled; enemy lighting and firing use module scratch vectors.
- **Voice limiting** (`AudioMan.play`): at most two starts of the same
  sound per 40 ms, so a multi-kill doesn't build dozens of audio nodes in
  one frame.

Measured on the Poki build (phone viewport + touch, Chrome CPU throttling
as a phone stand-in), sector 1 averages ~5–7 ms a frame at 4× slowdown and
~9–12 ms at 6×, against the 16.7 ms budget.

## Combat

Optional solo challenges live in `entities/overload.ts`. They are hidden from
players: `buildLevel` creates one only when `OVERLOAD_ENABLED` (web build +
`?overload` on the URL), never on Poki. After ordinary level
generation, `Overload.create` chooses a clear supported position in a normal
room without moving campaign rooms, pickups or enemies. Its console and
collision box are owned by the sector; one controller advances idle → active
→ ready → claimed, with two bounded waves and one reward. Spawn totals enter
`level.totalEnemies` only when each enemy is actually created. Room departure
delays pending spawns; no doors lock. Co-op and Biofoundry omit the controller.
The `overload` game state pauses the simulation for offer/reward menus.
Focused Shotgun uses a per-WeaponSystem flag and an immutable alternate
definition (spread ×0.65, rate ×0.85), leaving global weapon definitions intact.
The optional `focusedShotgun` checkpoint field defaults false for older saves;
sector retry rolls back to sector-entry inventory and resets its encounter.
The web-only `?overload` shortcut starts sector 1 by the terminal with a
shotgun; it is ignored in Poki and co-op.

- **Hitscan** (pistol, shotgun pellets, SMG) raycasts voxels, closed doors
  and enemy boxes; husk/brute hits in the top slice are headshots (×2).
- **Projectiles** (rockets, sentinel bolts) are pooled; rockets carry a
  damage multiplier for Quad.
- **Enemy attacks** all run prepare → commit → recover (`SCHED` in
  `enemies.ts`, timings from `reference/enemy-upgrades.md`). The target and
  the facing are locked part-way through the warning; a melee strike checks
  reach, same floor, the cone of the locked direction and LOS at impact and
  deals damage once; committed moves (husk lunge, brute charge, vatborn
  rush) are swept in substeps so they stop at walls and doors and trample
  at most one player. Pain only interrupts a warning. Co-op clients derive
  the pose from state + time with the same table.
  Husk locomotion has a dedicated `animateHusk` path: actual host/puppet
  displacement drives hip/knee strides, support-foot height and footfalls;
  time-based steering holds a 3.2u/s chase without frame-rate-dependent
  friction. Brute and Vatborn retain the shared walker animation.
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
| `voxelstrike-best-depth` | Deepest endless depth reached (title footer) |
| `voxelstrike-survival-best` | Best Survival wave reached (title footer *BEST WAVE n*, death screen) |
| `voxelstrike-upgrades` | Scrap + permanent upgrades: `{ v, scrap, earned, levels }`. Never reset by a new run |
| `voxelstrike-skins` | Weapon skins: lifetime goal stats (kills, headshots, bash kills, secrets, cleared, reached, bosses, S ranks), unlocked ids, equipped skin per gun |
| `voxelstrike-biofoundry-seen` | The Biofoundry was reached once (hides the title's NEW SECTOR banner, which returning players see) |

The run and tutorial keys match the earlier Poki build — don't rename them.

## Builds and deploy

| Build | Command | Output | Goes to |
|---|---|---|---|
| Web | `npm run build` | `dist/` | GitHub Pages: `.github/workflows/deploy.yml` builds and deploys on every push to `main` |
| Poki | `npm run zip:poki` | `dist-poki/` + `voxelstrike-poki-<version>.zip` (bumps the patch version first) | Uploaded by hand to the Poki Inspector ([POKI.md](../POKI.md)) |

`vite.config.ts` uses `base: './'` so both work from a sub-path. The web
build is also a PWA (`public/manifest.webmanifest` + network-first
`public/sw.js`, registered in production only).

## Where to change what

| To change… | Look at |
|---|---|
| A weapon's stats or feel | `WEAPONS` + `animate()` in `weapons/weapons.ts` |
| A weapon's look | `buildWeaponModel()` in `weapons/weapons.ts` — the held gun and the floor pickup both come from it |
| Add a weapon | Both `ORDER` arrays (weapons.ts, hud.ts), `DRY_SWITCH`, the Digit list in `input.ts`, and its floor pickup in `GUN_PICKUP` (thrown.ts) + `THROWN_GUN` (pickups.ts) so it can be thrown |
| Add a block | `world/blocks.ts` — the enums and tables must stay in sync, and ids are append-only |
| Level layout rules | `world/levelgen.ts` (keep the BFS validation passing) |
| Enemy behaviour | `entities/enemies.ts` |
| Preview-only live scenery (sector 4) | `PreviewArt` hooks returned by `decorate()` in `src/preview/biofoundry.ts`: `update(dt)`, `tankHit(x,y,z)` (a TankGlass voxel was shot), `noise(x,z,r)` (gunfire via `Game.noise`). The tank-breach state machine lives there |
| Generated-core live scenery (sectors 6–7) | `PreviewArt` from `decorateGeothermal` in `src/preview/geothermal-gen.ts`: `update(dt)` (steam, gate, cage hint), `voxelHit(x,y,z)` (the Power Link node; consumes the hit) |
| Add an enemy kind | `EnemyKind` in `types.ts`; `TUNING`, `ALERT_SOUND`, a `buildX()` rig and `doChase`/`doAttack` branches in `enemies.ts` (reuse the husk skeleton + `humanoid()` to get the gait/attack animation for free); the headshot check in `weapons.ts`; kill points in `game.ts`. Keep preview-only kinds out of `levelgen.ts` |
| HUD / screens | `ui/hud.ts` ([UI_SPEC.md](UI_SPEC.md)) |
| Touch controls | `core/touch.ts` + the touch CSS in `ui/hud.ts` |
| A Poki event | `poki.measure()` + a row in POKI.md + an assert in `scripts/poki.mjs` |


### Campaign secret prototypes

`weapons/secrets.ts` defines five sector prototypes. `WeaponId.special` is one inventory slot (key 6); `WeaponSystem.secret` selects its definition and baked model. `AmmoType.special` is independent ammunition. Levelgen adds a `weaponSecret` with `secretSector` metadata to secret rooms in sectors 1?5, without consuming layout RNG. Pickups require line of sight before drifting or collection. Checkpoints store `secretWeapon` plus special ammo; older saves default safely. Spore timers bind to the current world and clear on revive/retry. Prototypes stay owned when empty.


### Additional environment themes (2026-10-23)

`world/environments.ts` defines Freight Depot (`freight`), Deep Excavation
(`excavation`) and Medical Wing (`medical`), with theme materials and ambient
light. Block ids 40-56 and atlas tiles 41-58 are appended (5 atlas slots
left); all existing ids and the 8x8 atlas remain stable. Each theme is one
hand-authored hall, `generateSectorLayout` in `world/sector-layouts.ts`,
rebuilt 2026-10-23 to match its mockup (see CLAUDE.md "Additional maps"):
voxels for solid set pieces that should take baked light (Freight's
containers), instanced boxes (`LevelData.architecture`, two draws via
`preview/sector-landmarks.ts`) for the rest, canvas-texture signs.
`dressEnvironment` is no longer reached. The service-lift room, key red, exit
green and amber Power Link node retain their meanings.

`preview/environments.ts` instances cranes, mining equipment, monitors,
surgical lamps and treatment beds, and composes the existing Power Link
scenery callbacks into one `PreviewArt`. Its disposal frees instances,
geometry, materials and sign textures. Decorations use bounded static boxes;
medical trolleys over destructible crate pairs disappear when supports break.
All materials are present before the standard level warm-up.

Survival rotates Facility, Biofoundry, Geothermal, Freight, Excavation and
Medical every five waves. Endless campaign depths rotate Freight,
Excavation, Medical, Facility, Biofoundry and Geothermal every two depths
starting at depth 8; every fifth depth still overrides to the Biofoundry boss.
The original seven campaign sectors stay unchanged. Web `?map=<id>` routes
use the existing isolated-preview lifecycle; Poki ignores the query flag.
