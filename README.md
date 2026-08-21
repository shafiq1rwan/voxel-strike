# VOXELSTRIKE

An original browser FPS in the spirit of 1990s shooters — dark sci-fi
industrial dungeons, chunky voxel geometry, colored lighting, and pixelated
retro rendering. Built with **TypeScript + Three.js + Vite**.

Everything is generated procedurally at runtime: the level layout, the
texture atlas, the enemy and weapon models, and every sound effect (WebAudio
synthesis). There are no external or copied assets.

Optionally, you can add a soundtrack: drop licensed tracks into
`public/music/` and list them in `manifest.json` — the game crossfades
between menu, ambient, and combat loops. See
[public/music/README.md](public/music/README.md).

![status](https://img.shields.io/badge/build-passing-brightgreen)

## Quick start

```bash
npm install
npm run dev        # play at http://localhost:5173
```

Other commands:

```bash
npm run build      # type-check (tsc --noEmit) + production bundle in dist/
npm run preview    # serve the production build at http://localhost:4173
```

Every page load generates a new level. Append `?seed=12345` to the URL to
replay a specific layout — the same seed always produces the same dungeon.

## How to play

**Goal:** the campaign is **3 sectors deep**. In each one, find the **RED
keycard**, open the locked vault door, ride the elevator in the exit hall,
and stand on the glowing green **exit pad** to descend. Your weapons, ammo,
health, and armor carry over between sectors — keycards don't. Each sector
is bigger and meaner than the last.

| Input | Action |
|---|---|
| WASD | Move |
| Mouse | Aim (click to capture the pointer) |
| Left click | Fire |
| Space | Jump |
| 1–4 or mouse wheel | Switch weapon |
| Esc | Release the mouse (pauses) |

**On phones/tablets** the game switches to touch controls automatically:
left-thumb virtual joystick to move, drag the right side to aim, FIRE and
JUMP buttons (with the ammo count above FIRE), tap the weapon slots in the
top bar to switch, and a pause button top-right. The HUD moves to a compact
top strip so the bottom corners stay clear for your thumbs. The game is
**always landscape**: held in portrait, it rotates itself 90° (no need to
enable the OS auto-rotate), and the installed PWA locks landscape natively.
Touch play also gets **aim assist** — near-miss shots bend onto the target
and look sensitivity eases while tracking an enemy (toggle in Settings;
never active with a mouse).

It's also an installable **PWA**: on the deployed site, use your browser's
"Add to Home Screen" / install prompt. The installed app launches fullscreen,
locked to landscape, and works offline after the first visit (network-first
service worker, so new deploys still come through).

Tips:

- Doors open automatically when you approach. The red-emblem door needs the
  red keycard.
- Wooden crates are destructible and sometimes drop supplies.
- Green **toxic barrels** explode when shot — and chain-react. Lure enemies
  near them, but keep your distance.
- One wall in each level has visible **cracks** — break it to find a secret
  stash (the rocket launcher lives there).
- When you take a hit, a **red wedge** around the crosshair points at
  whatever hurt you.
- Gunfire is loud: enemies within earshot will come looking.
- Rockets hurt you too at close range — but the knockback can be used to
  rocket-jump.
- Intermission screens track kills, secrets, and time per sector; the final
  screen totals the campaign.

## Arsenal

| Slot | Weapon | Type | Notes |
|---|---|---|---|
| 1 | **SIDEARM** | Hitscan pistol | Starter weapon, accurate |
| 2 | **SCATTERGUN** | 7-pellet hitscan shotgun | Pickup, room-clearer |
| 3 | **RIPPER** | Automatic hitscan SMG | Pickup, chews bullets |
| 4 | **THUMPER** | Rocket launcher | Secret pickup; splash damage, destroys crates and cracked walls |

All weapons have recoil, muzzle flash (sprite + dynamic light on the walls),
per-type ammo pools, and box-modeled first-person view models.

## Bestiary

- **Husk** — a hunched, rust-red melee creature with a glowing eye slit.
  Fast; closes distance with sudden lunges and bites.
- **Arc Sentinel** — a hovering teal drone with rotating fins. Keeps its
  distance, glows brighter as it charges, then fires a slow plasma bolt you
  can dodge. Strafes when you get close.

Both run a full state machine — **idle / patrol / chase / attack / pain /
death** — wake on line-of-sight or nearby gunfire, alert each other, and
steer around walls with a Doom-style sidestep when blocked.

## Engine overview

```
src/
├── main.ts                 entry point
├── game.ts                 orchestrator: game loop, state machine, explosions, win/lose
├── types.ts                shared plain-data types (no Three.js imports)
├── core/
│   ├── renderer.ts         Three.js setup, 240-line internal res, fog
│   ├── input.ts            keyboard + pointer-lock mouse
│   ├── physics.ts          AABB-vs-voxel movement, ray/box intersection
│   ├── audio.ts            procedural WebAudio synth, positional pan/gain
│   ├── music.ts            optional soundtrack: menu/ambient/combat crossfading loops
│   ├── settings.ts         persisted options (sensitivity, volume, FOV, resolution)
│   └── rng.ts              seeded RNG (mulberry32)
├── world/
│   ├── blocks.ts           block types + procedural 16px texture atlas
│   ├── world.ts            voxel grid, DDA raycasts, light bake, voxel HP
│   ├── mesher.ts           greedy mesher + chunk manager + chunk shader
│   └── levelgen.ts         procedural dungeon generator + validator
├── entities/
│   ├── player.ts           movement, health/armor/keys/ammo, camera
│   ├── enemies.ts          enemy AI, models, manager
│   ├── door.ts             sliding doors (lockable) + elevator platform
│   ├── pickups.ts          items, keycards, weapon pickups
│   └── projectiles.ts      pooled rockets + enemy plasma bolts
├── fx/
│   ├── particles.ts        1024-instance pooled voxel particles
│   ├── tracers.ts          pooled hitscan tracer streaks
│   └── dynlights.ts        dynamic light pool fed to the chunk shader
├── ui/
│   └── hud.ts              DOM overlay: stats, messages, screens
└── (scripts/)              headless browser tests (see below)
```

Key design points:

- **Voxel world** — a flat `Uint8Array` grid (112×14×112). No per-block
  meshes: the world is split into 16×16 chunk columns, each meshed with a
  **greedy mesher** that emits only exposed faces and merges coplanar faces
  that share a texture tile and light value into large quads. Chunks touched
  by destruction are re-meshed in place; Three.js frustum-culls the rest.
- **Texture atlas across merged quads** — a custom `ShaderMaterial` receives
  UVs in *block units* plus a per-vertex tile offset, and tiles the atlas
  with `fract()` per fragment, so a 12-block wall can be a single quad.
- **Lighting** — static light is baked at generation time: a BFS flood-fill
  through air from every colored lamp block (warm / red / teal / green) into
  a per-voxel RGB grid, applied as vertex colors. On top of that, a pool of
  up to 6 **dynamic lights** (muzzle flashes, rocket trails, explosions) is
  ranked per frame and evaluated per-fragment in the chunk shader. Entities
  sample both grids on the CPU to tint their materials.
- **Retro rendering** — fixed 240-line internal resolution, CSS-upscaled
  with `image-rendering: pixelated`, nearest-neighbor textures, dark linear
  fog.
- **Level generation** — rooms placed by rejection sampling, connected with
  an MST plus a couple of loop corridors; sliding doors at corridor
  chokepoints (the exit door is always red-locked, and loop edges never
  touch the exit room, so the key genuinely gates progress); a secret room
  sealed behind destructible cracked blocks; an elevator up to the exit
  ledge; lamps, pillars, crate clusters, supplies, and distance-scaled enemy
  placement. Every layout is then **validated** with a BFS walkability check
  (the key must be reachable *without* the key; the exit must be reachable
  *with* it) and regenerated from a fallback seed if broken.
- **Object pooling** — particles are a single `InstancedMesh`; rockets and
  plasma bolts come from fixed pools. No per-shot allocations in the hot
  path.
- **State/render separation** — the voxel grid, physics, level data, and
  enemy state machines are plain data and math; Three.js objects only mirror
  that state each frame.

## Tests

Three headless-browser test suites drive the real game in Edge
(`puppeteer-core`, no browser download needed) and save screenshots to
`scripts/shots/`. Run them with a dev **or** preview server up:

```bash
node scripts/smoke.mjs      # boot, move, shoot, switch weapons, explode — fails on any console error
node scripts/e2e.mjs        # plays the whole campaign: aggro + damage indicator + barrel chain, then key → locked door → elevator → exit for all 3 sectors
node scripts/movement.mjs   # regression: W/A/S/D displacement must match the camera's forward/right vectors at 5 facing angles
node scripts/firing.mjs     # regression: spam-clicking and holding the trigger both fire at the weapon's full rate; early clicks are buffered
node scripts/aimassist.mjs  # regression: touch profiles get bullet magnetism + sticky aim; the identical shot misses on desktop
```

Each accepts an optional URL argument, e.g.
`node scripts/e2e.mjs "http://localhost:4173/?seed=777"`.

`movement.mjs` exists because of a real bug caught during development: the
strafe basis vector used `(cos yaw, +sin yaw)` instead of the correct
`(cos yaw, −sin yaw)`, which inverted left/right movement whenever the player
faced east or west. The test pins movement to the camera's actual world
vectors so that class of bug can't come back.

## Performance

Targets 60 FPS on desktop and reaches ~100 FPS even under headless
SwiftShader (software rendering) in CI. The main costs are kept flat:
greedy meshing keeps the triangle count low, the whole world is ~64 draw
calls before frustum culling, particles/projectiles are pooled, and the
internal render resolution is fixed regardless of window size.

## License / originality note

All code, level layouts, textures, models, and sounds are generated by this
project at runtime. The game is *inspired by* the feel of 1990s shooters but
contains no assets, levels, characters, or sounds from Doom or any other
game.
