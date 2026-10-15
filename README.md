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
npm run build:poki # Poki web-portal build in dist-poki/ — see POKI.md
```

Every page load generates a new level. Append `?seed=12345` to the URL to
replay a specific layout — the same seed always produces the same dungeon.

## Biofoundry development preview

Add `?sector4` to the game's URL — on the deployed site or a dev server
(`http://localhost:5173/?sector4`; add `&seed=12345` for repeatable
decoration). This opens a standalone Sector 4
preview with seven authored rooms, specimen tanks, purple emergency lighting,
organic growth, a red-key route, and an exit lift. All weapons and supplies
are provided; enemies use the current roster. Spills and organic scenery are
cosmetic in this first environment preview.

The preview does not change campaign saves or leaderboard scores and has no
co-op. Normal URLs still play the three-sector campaign, and the preview
module is lazy-loaded, so ordinary visits never download it. The Poki build
ignores `?sector4` entirely.

With a dev or preview server running, `node scripts/sector4.mjs <url>` checks
progression, replay/retry, save isolation, and mobile rendering. Against a
Poki-mode server, `node scripts/sector4.mjs <url> --poki` checks that the
flag is ignored.

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
| 1–5 or mouse wheel | Switch weapon |
| Tab or M | Automap (fills in as you explore) |
| Esc | Release the mouse (pauses) |

On desktop a **minimap** in the top-left corner shows the explored area
around you.

**On phones/tablets** the game switches to touch controls automatically:
touch anywhere on the left half to get a joystick under your thumb, drag the
right side to aim, and use the FIRE and JUMP buttons (ammo count above
FIRE). The **weapon button** above JUMP switches guns: tap for the next one,
swipe left/right to step through them, or hold to open a weapon wheel and
slide onto the one you want. An empty gun switches to a loaded one by
itself. MAP and pause are top-right, and the weapon slots move to the top so
the bottom corners stay clear for your thumbs. The game is **always
landscape**: held in portrait, it rotates itself 90° (no need to enable the
OS auto-rotate), and the installed PWA locks landscape natively.
Touch play also gets **aim assist**: near-miss shots bend onto the target,
aiming slows slightly over an enemy, and while you move, drag or fire the
view gently follows the enemy you're already aiming near (toggle in
Settings; never active with a mouse).

## Co-op

The campaign is playable **2-player online co-op** — no accounts, no server
setup. One player clicks **CO-OP → HOST** on the title screen and reads out
the 4-character room code; the other clicks **JOIN** and types it in
(the connection is peer-to-peer WebRTC via PeerJS's free broker). Then:

- You both fight through the **same dungeon** — the host's seed is shared, so
  the worlds are identical.
- Enemies hunt **whichever player is closer**; all AI runs on the host and
  streams to the partner.
- **Keycards are shared** (either of you can grab the red key), score and
  kills are pooled, and either player standing on the exit pad clears the
  sector for both.
- Ammo, health, armor, weapons, and powerups are **personal** — call dibs on
  the arena.
- Death isn't the end: in co-op you **respawn at the sector entrance** after a
  few seconds while your partner holds the line. No friendly fire.
- The host owns the world: if the host leaves, the run ends for the partner.
  (Tip for testing without a friend: open two tabs of the same browser with
  `?mp=local&role=host&room=AAAA` and `?mp=local&role=join&room=AAAA`.)

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
- Every sector has one huge pillared **arena** — the ARC CASTER floats in the
  middle, and the Brute guarding it always drops a powerup. The lightning
  chains between enemies, so save your cells for crowds.
- Grabbing the keycard trips the alarm — a **security response** teleports in
  around you. Have an exit route (or a barrel) ready before you take it.
- Glowing **powerups** are rare and timed: QUAD DAMAGE (yellow, ×4 damage),
  OVERSHIELD (teal, absorbs everything), ADRENALINE (orange, faster movement
  and fire rate). Save them for the key room if you can.
- Kills build a **combo multiplier** (up to ×5) that decays after 2.5 seconds
  — chain kills, secrets, and fast sector clears all feed your score, and the
  best score per layout seed is remembered on your device. Share a `?seed=`
  link to race a friend on the same dungeon.
- When you take a hit, a **red wedge** around the crosshair points at
  whatever hurt you.
- Gunfire is loud: enemies within earshot will come looking.
- **Headshots**: hits in the top slice of a husk or brute deal **double
  damage** (gold crosshair flash + a distinct crack) and kill bonuses. Aim
  high.
- Lost? The **automap** (Tab/M, MAP button on touch) fills in only what
  you've actually seen — locked doors show their key color, the exit glows
  green, and the keycard blinks red once you've spotted it.
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
| 5 | **ARC CASTER** | Chain lightning | Arena prize; the bolt arcs to up to 3 more enemies near the first hit |

All weapons have recoil, a muzzle flash (starburst sprite + dynamic light on
the walls), per-type ammo pools, and shaded box-modeled view models with
moving parts: the pistol slide blows back, the scattergun racks its pump and
ejects the hull, the ripper's bolt cycles, the thumper's ready light flips
red/green, and the arc caster's coils charge and flare. Guns sway as you
turn and bob in step with your footsteps.

## Bestiary

- **Husk** — a hunched, rust-red melee creature with a glowing eye slit.
  Fast; closes distance with sudden lunges and bites.
- **Arc Sentinel** — a hovering teal drone with rotating fins. Keeps its
  distance, glows brighter as it charges, then fires a slow plasma bolt you
  can dodge. Strafes when you get close.
- **Ticker** — a squat hazard-striped crawler with a glowing amber core. It
  sprints straight at you, stops, beeps faster and faster, and self-destructs.
  Killing it at range still detonates the corpse — which makes tickers
  wonderful when they die next to their friends, and terrible when they die
  next to you.
- **Brute** — the arena pit boss: a bone-plated wall of meat with tusks. It
  rears back with a roar, then charges in a straight line faster than you can
  run, smashing crates and barrels on the way. Sidestep it: a brute that hits
  the wall is stunned and wide open. It always drops a powerup when it dies.

All of them run a full state machine — **idle / patrol / chase / attack / pain /
death** — wake on line-of-sight or nearby gunfire, alert each other, and
steer around walls with a Doom-style sidestep when blocked.

## Engine overview

The full map — states, the frame loop, sector building, rendering passes,
co-op — is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```
src/
├── main.ts                 entry point (Poki init, service worker)
├── game.ts                 orchestrator: state machine, frame loop, sectors, explosions, score
├── types.ts                shared plain-data types (no Three.js imports)
├── core/
│   ├── renderer.ts         Three.js setup, 240-line internal res, fog, weapon overlay pass
│   ├── input.ts            keyboard + pointer-lock mouse
│   ├── touch.ts            touch joystick, look, buttons, weapon button + wheel
│   ├── physics.ts          AABB-vs-voxel movement, ray/box intersection
│   ├── audio.ts            procedural WebAudio synth, positional pan/gain
│   ├── music.ts            optional soundtrack: menu/ambient/combat crossfading loops
│   ├── settings.ts         persisted options (sensitivity, volume, FOV, resolution, …)
│   └── rng.ts              seeded RNG (mulberry32)
├── world/
│   ├── blocks.ts           block types + procedural 16px texture atlas
│   ├── world.ts            voxel grid, DDA raycasts, light bake, voxel HP
│   ├── mesher.ts           greedy mesher + chunk manager + chunk shader
│   └── levelgen.ts         procedural dungeon generator + validator
├── entities/
│   ├── player.ts           movement, health/armor/keys/ammo, camera, touch aim assist
│   ├── aimassist.ts        touch aim-assist target picking
│   ├── enemies.ts          enemy AI, models, manager
│   ├── door.ts             sliding doors (lockable), elevator, exit beacon
│   ├── pickups.ts          items, keycards, weapon pickups, powerups
│   ├── projectiles.ts      pooled rockets + enemy plasma bolts
│   └── remoteplayer.ts     co-op partner avatar
├── weapons/
│   └── weapons.ts          weapon defs, firing, view models + animation
├── fx/
│   ├── particles.ts        1024-instance pooled voxel particles
│   ├── tracers.ts          pooled hitscan tracer streaks
│   └── dynlights.ts        dynamic light pool fed to the chunk shader
├── net/
│   ├── netplay.ts          host-authoritative co-op sync
│   └── transport.ts        PeerJS / BroadcastChannel transports
├── platform/
│   └── poki.ts             Poki SDK wrapper (Poki builds only)
└── ui/
    ├── hud.ts              DOM HUD + every screen
    ├── automap.ts          automap overlay + desktop minimap
    └── icons.ts            inline SVG HUD icons
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

Ten headless-browser suites drive the real game in Edge (`puppeteer-core`,
no browser download needed) and save screenshots to `scripts/shots/`. Run
them with a dev **or** preview server up. What each one covers, the
fake pointer lock they share, and the gotchas are in
[docs/TESTING.md](docs/TESTING.md).

```bash
node scripts/smoke.mjs      # boot, move, shoot, explode — fails on any console error
node scripts/e2e.mjs        # plays the whole 3-sector campaign
node scripts/movement.mjs   # W/A/S/D must match the camera's vectors at 5 facing angles
node scripts/firing.mjs     # spam-click, hold-to-fire and the click buffer
node scripts/aimassist.mjs  # touch aim assist (magnetism, sticky, rotation); desktop stays raw
node scripts/features.mjs   # tickers, ambush, powerups, combo, arena, headshots, automap, lift, touch weapon wheel, phone settings
node scripts/checkpoint.mjs # retry, save + Continue, quit to menu, new run — no page reloads
node scripts/monkey.mjs     # randomized stress run with NaN / out-of-world checks
node scripts/coop.mjs       # 2-player co-op over BroadcastChannel
node scripts/poki.mjs       # Poki build only (npm run dev:poki): SDK lifecycle, ads, measure() events (level 1 start, level complete/fail)
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

## Docs

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module map, game states, the frame loop, building a sector, rendering, co-op, storage, builds |
| [docs/ART.md](docs/ART.md) | Art direction: palette, world, enemies, weapon view models, HUD style, the owner's decisions |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | HUD layout (desktop + mobile), touch controls, every screen, UI rules |
| [docs/TESTING.md](docs/TESTING.md) | The browser test suites, how to run and write them, gotchas |
| [POKI.md](POKI.md) | The Poki build: SDK lifecycle, ad breaks, analytics events, upload |
| [public/music/README.md](public/music/README.md) | Adding an optional soundtrack |
| [CLAUDE.md](CLAUDE.md) | Rules and gotchas for AI agents (and humans) changing the code |

## License / originality note

All code, level layouts, textures, models, and sounds are generated by this
project at runtime. The game is *inspired by* the feel of 1990s shooters but
contains no assets, levels, characters, or sounds from Doom or any other
game.

The one third-party asset is a handful of HUD icons from
[Font Awesome Free](https://fontawesome.com) (CC BY 4.0), inlined as SVG at
build time — see `public/THIRD-PARTY-NOTICES.txt`, which ships in every
build (web and Poki) because minification strips the license comment.
