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
preview — a fixed, hand-built Biofoundry map (the campaign's sector 4 is
generated) — with seven authored rooms, specimen tanks, purple emergency lighting,
organic growth, a red-key route, and an exit lift. All weapons and supplies
are provided; enemies use the current roster. Spills and organic scenery are
cosmetic in this first environment preview.

The preview does not change campaign saves or leaderboard scores and has no
co-op. Normal URLs play the five-sector campaign, whose sectors 4–5 are
*generated* Biofoundry levels dressed by the same code (so it ships in the
main bundle). The Poki build ignores `?sector4` entirely.

With a dev or preview server running, `node scripts/sector4.mjs <url>` checks
progression, replay/retry, save isolation, and mobile rendering. Against a
Poki-mode server, `node scripts/sector4.mjs <url> --poki` checks that the
flag is ignored.

## How to play

### Optional Overload room (solo playtest, hidden)

**Hidden from players (2026-10-18).** The terminal only appears with `?overload` on the URL of a web build; normal play and the Poki build never show it, so the one goal (keycard → door → lift) stays the only thing to read while playtime is the problem. The code and its test (`overload.mjs`, which uses the flag) stay in place.

With the flag, each solo campaign sector places a cyan **OVERLOAD / OPTIONAL** terminal in
an existing room where there is safe space. Its cyan outlined map marker
appears after exploration. Approach it and press **E**, or tap the context
button on touch devices, then choose **Start fight** or **Not now**. The
offer explains that you defeat two enemy waves to choose a shotgun upgrade,
repair or ammo; reward cards appear after victory.

Activation starts two bounded waves: two Husks, then a Husk and an Arc
Sentinel. Incoming enemies wait until you are in the room and spawn on clear,
supported tiles away from you. Exits remain open; this never gates the
keycard, elevator or campaign. After clearing both waves, return to the
terminal and choose **one** reward:

- **Focused Shotgun:** 35% tighter spread, 15% lower fire rate, unchanged
  pellet count and damage. Requires the shotgun; cannot stack. Lasts this run.
- **Field Repair:** restore up to 25 health and 15 armor, capped at 100 each.
- **Ammo Cache:** refill the equipped weapon's ammo: 30 bullets, 8 shells,
  2 rockets or 8 cells, respecting ammo caps.

A terminal can only be cleared/claimed once per sector attempt. You can
choose later if supplies are full. Sector retry restores the sector-entry
loadout and resets that attempt's challenge; sidegrades earned in earlier
sectors survive retry and save/Continue. New runs remove the sidegrade.
This first version is solo-only and does not appear in the Sector 4 preview.

For quick testing, run `npm run dev` and open
`http://localhost:5173/?overload&seed=12345`. After **Play** you
start beside the terminal with a shotgun and 24 shells. The shortcut is
web-only; the Poki build ignores the shortcut but includes the normal solo
challenge. Ordinary URLs retain the usual spawn and starting equipment.

**Goal:** the campaign is **5 sectors deep**, every one generated fresh
each run: three facility sectors, then — after a facility terminal tells you
the only way out — two sectors of the **Biofoundry**, a purple-lit specimen
lab where gunfire wakes what sleeps in the tanks (the deeper one has more
full tanks and more enemies). Sector 1 is a short opener: a handful of rooms,
a shotgun in the starting room, no tickers or brutes. In sector 5 the
keycard is guarded by the **Broodkeeper**, a boss on the incubation chamber
wall; kill it and it drops the key. In each sector, find the **RED
keycard**, open the locked vault door, ride the elevator in the exit hall,
and stand on the glowing green **exit pad** to descend. Your weapons, ammo,
health, and armor carry over between sectors — keycards don't. Each sector
is bigger and meaner than the last.

**Dying isn't the end of the attempt.** Once per sector you can **revive**
where you fell (on Poki by watching a short video). Grabbing the red keycard
is a **checkpoint**: retry from it and you're back where you took it, still
holding it, with the rest of the sector as you left it. You can also restart
the whole sector, or start a new run. From sector 2 on, progress is saved so
the title offers **Continue**.

**After sector 5 the run keeps going.** The final clear screen offers
**Keep descending**: endless depths 6, 7, 8 … alternate between the facility
and the Biofoundry every two depths, with tougher enemies and more of them
the deeper you go, and another Broodkeeper on every fifth depth. The HUD
reads DEPTH instead of SECTOR, the title shows your **deepest depth**, and
Continue picks up at the depth you saved. Once the perk pool runs dry, the
clear screen fills the offer with one-off rewards: full health, ammo or
armor.

**Clearing a sector** ranks it **S, A, B or C** from your kills, the secret
and your time against par — a better rank adds more score, and beating your
best rank for that sector flashes **NEW BEST RANK**. Then you **pick one of
three perks** for the rest of the run: wider blasts, extra arc chains,
healing headshots, haste on triple kills, a second revive, deeper ammo
pockets, self-repairing armor, ammo drops or more max health. Perks survive
retries and Continue; a new run starts clean.

**Pixelation** defaults to 480 lines on desktop and 320 on phones; change it
in Settings (180 / 240 / 320 / 480).

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
setup. Co-op is hidden from the title screen in every build (as on Poki);
open the game with `?coop` to show the button. One player clicks
**CO-OP → HOST** on the title screen and reads out
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

Every attack is telegraphed: a windup you can read, a moment where the aim
locks (dodge after it and the hit misses), then a recovery you can punish.

- **Husk** — a lean, rust-red hunter with a dark visor and a long reach. It
  weaves in, claws from a step away, and lunges from further out after a
  crouching growl. A missed claw leaves it bent over and open.
- **Arc Sentinel** — a hovering teal box with four paddles. Keeps 7–12 units
  away; its paddles spread and its shutters slide open as it charges, then
  it fires one plasma bolt along the line it locked. It folds up while it
  recovers — close in then.
- **Ticker** — a low hazard-yellow crawler. It sprints at you, plants its
  legs, opens its lids and beeps four times, then blows. Killing it at range
  still detonates the corpse — great next to its friends, terrible next to
  you.
- **Brute** — the arena pit boss: bone shoulder plates, tusks, huge fists.
  A backhand up close; from range it rears back, roars and charges in a
  straight line, smashing crates and barrels. Make it hit a wall and it's
  stunned for over a second. It always drops a powerup.
- **Vatborn** *(Biofoundry)* — a pale specimen with one giant club arm,
  asleep in the specimen tanks. Gunfire nearby (or shooting the glass) wakes
  it: it pounds the glass, breaks out and hunts you with a slow, crushing
  overhead swing.
- **Broodkeeper** *(boss, sector 5 and every fifth depth)* — a brick-red
  brood organism in a steel incubation cradle on the chamber wall. It sleeps until you walk in,
  then a boss health bar drops under the objective. It loops: three acid
  globs (five when it's badly hurt), its chest plates swing open on an
  orange core, it releases up to two Husks, then opens again. Closed, its
  armor shrugs off three quarters of your damage; the open core takes double.
  Killing it drops the red keycard.

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
│   ├── renderer.ts         Three.js setup, low internal res (480 lines desktop / 320 touch by default), fog, weapon overlay pass
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
- **Retro rendering** — low internal resolution (480 lines on desktop, 320 on touch by default; 180–480 in Settings), CSS-upscaled
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

Headless-browser suites drive the real game in Edge (`puppeteer-core`, no
browser download needed; set `VOXEL_BROWSER` to any Chromium executable to
use that instead) and save screenshots to `scripts/shots/`. Run
them with a dev **or** preview server up. What each one covers, the
fake pointer lock they share, and the gotchas are in
[docs/TESTING.md](docs/TESTING.md).

```bash
node scripts/smoke.mjs      # boot, move, shoot, explode — fails on any console error
node scripts/e2e.mjs        # plays the whole 5-sector campaign (kills the sector 5 boss), then Keep descending into depth 6
node scripts/movement.mjs   # W/A/S/D must match the camera's vectors at 5 facing angles
node scripts/firing.mjs     # spam-click, hold-to-fire and the click buffer
node scripts/aimassist.mjs  # touch aim assist (magnetism, sticky, rotation); desktop stays raw
node scripts/features.mjs   # tickers, ambush, powerups, combo, arena, headshots, automap, lift, touch weapon wheel, phone settings, title banner, pixelation defaults, sector 1 opener, Broodkeeper fight + boss bar, reward fill-ins
node scripts/checkpoint.mjs # retry, revive, keycard checkpoint, save + Continue, quit to menu, new run — no page reloads
node scripts/monkey.mjs     # randomized stress run with NaN / out-of-world checks
node scripts/coop.mjs       # 2-player co-op over BroadcastChannel
node scripts/perf.mjs       # 60 fps guard: draw calls, occlusion cull, no shader compiles — facility and Biofoundry
node scripts/husk.mjs       # husk gait, chase consistency, claw/dodge, pose captures
node scripts/overload.mjs   # the optional Overload room
node scripts/breach.mjs     # a dormant Vatborn breaks out of its tank
node scripts/sector4.mjs <url>  # the hand-built ?sector4 preview (add --poki on a Poki server)
node scripts/poki.mjs       # Poki build only (npm run dev:poki): SDK lifecycle, ads, rewarded revive, measure() events (level 1 fresh-start, level complete/fail, endless depth complete/fail)
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
internal render resolution follows the Pixelation setting (480 lines on
desktop, 320 on phones by default), never the window size.

## Docs

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Module map, game states, the frame loop, building a sector, rendering, co-op, storage, builds |
| [docs/ART.md](docs/ART.md) | Art direction: palette, world, enemies, weapon view models, HUD style, the owner's decisions |
| [docs/UI_SPEC.md](docs/UI_SPEC.md) | HUD layout (desktop + mobile), touch controls, every screen, UI rules |
| [docs/TESTING.md](docs/TESTING.md) | The browser test suites, how to run and write them, gotchas |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Planned work in priority order and why (driven by the Poki Web Fit Test), plus what's done |
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
