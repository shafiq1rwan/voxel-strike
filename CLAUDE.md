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
- `docs/ROADMAP.md` — planned work in priority order with the reasoning
  (driven by the Poki Web Fit Test numbers). Add decided features there;
  move them to its Done list when shipped.

## Commands

```bash
npm run dev        # dev server on http://localhost:5173
npm run build      # tsc --noEmit + vite build → dist/  (run this before calling work done)
npm run preview    # serve the production build on :4173
npm run build:poki # Poki build → dist-poki/ (also dev:poki / preview:poki; zip:poki → bumps the patch version, then the upload zip voxelstrike-poki-<version>.zip; the title footer shows the version) — see POKI.md
```

Headless test suites (need a dev or preview server running; they drive Edge at
`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe` via
puppeteer-core — or the Chromium named by the `VOXEL_BROWSER` env var — and
save screenshots to `scripts/shots/`):

```bash
node scripts/smoke.mjs      # boot, move, shoot, explode; fails on any console error; enemy-bounds watchdog
node scripts/e2e.mjs        # plays the whole 5-sector campaign: aggro, barrels, key → vault → lift → exit, the facility terminal into the Biofoundry, sector 5 harder than 4, the sector 5 Broodkeeper holds the key, Keep descending → depth 6
node scripts/movement.mjs   # WASD displacement must match camera basis vectors at 5 yaw angles
node scripts/husk.mjs       # Husk gait, floor contact, 30/60/120 Hz chase consistency, claw/dodge + rendered poses/motion clip
node scripts/firing.mjs     # spam-click / hold-to-fire / click-buffer semantics
node scripts/overload.mjs <url> # optional solo two-wave encounter (HIDDEN from players: only built with ?overload on web builds, never Poki — `OVERLOAD_ENABLED` in game.ts), reward/firing/cap/save checks and touch UI
node scripts/aimassist.mjs  # touch profile: magnetism snaps a 3° miss, 9° stays a miss, sticky-aim ratio ~0.55, held fire pulls a 7° miss on, no idle drift; desktop unaffected
node scripts/features.mjs   # ticker suicide/corpse-chain, key ambush, powerups, score + combo, arena/brute/arc-caster, headshots, automap, walk-on elevator ride, lift call-down + strafing rider held + ledge rail, touch map + weapon button/wheel, phone settings fit, no co-op on the title (?coop shows it), first-visit title = goal + 3 steps + PLAY + gear only, NEW SECTOR banner for returning players, pixelation defaults 480 desktop / 320 touch + adjustable + one-time migration, sector 1 opener, Broodkeeper (wake on entry, cycle, acid + summons, armor/core damage, boss bar, key drop, every weapon hurts it + killed by real Ripper fire), reward fill-ins
node scripts/monkey.mjs     # randomized stress run with NaN/out-of-world invariants
node scripts/coop.mjs       # 2-player co-op over the BroadcastChannel transport: link/seed handshake, avatar + puppet sync, authority routing, shared keys/score, level transition, respawn
node scripts/perf.mjs       # 60fps guard: gun draws (baked), occlusion cull with every enemy awake, in-sight enemy drawn, no shader compile after level start; the same budget in the Biofoundry at its heaviest (sector 5)
node scripts/checkpoint.mjs # run flow, all in place (no reload): retry restores sector-entry gear, free revive in place once per attempt, keycard checkpoint retry (world untouched) + Restart sector, save/Continue from sector 2, quit to menu, new run, GRAPHICS LOST overlay
node scripts/sector4.mjs <url> [--poki]  # the hand-built ?sector4 preview: route, key gate, door, lift, completion, replay, retry, save isolation, mobile; --poki: the flag is ignored
node scripts/breach.mjs     # sector 4 (`?sector4` opens it alone): dormant Vatborn in each occupied tank; shoot one → sealed during agitation, real collision gap, liquid gush, it walks out and hunts, releases once
node scripts/poki.mjs       # POKI MODE ONLY (npm run dev:poki): stubbed SDK — init/loading order, ad breaks mute audio, gameplayStart/Stop dedupe, measure() events (level 1 fresh-start, level complete/fail, endless N complete/fail capped at 20), rewarded revive (ad icon, equal-size beside retry, muted, pays only on a watched video, once per attempt, hidden without the SDK), hidden co-op, boots with SDK blocked
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
  intermission/won), 5-sector campaign flow with in-place level teardown.
  ALL sectors are generated fresh each run with the same keycard → red door
  → lift → pad flow: 1–3 in the facility theme, 4–5 in the Biofoundry theme
  (`generateLevel(seed, n, 'biofoundry')`; sector 5 is slightly harder —
  6 occupied tanks instead of 4 and +1 enemy in rooms 3+ steps from spawn,
  the only levelgen bumps past sector 4 since the other curves are capped;
  4 → 5 is an ordinary intermission, the terminal plays only into sector 4; the scenery + live tank breaches
  come from `decorateBiofoundry(level)` in `src/preview/biofoundry.ts`,
  statically bundled, Poki build too). `authoredLevel()` is only the
  `?sector4` preview's hand-built map. Clearing sector 3 (solo) goes
  intermission → `descendToBiofoundry()`: the facility terminal
  (`HUD.showTerminal`, `src/ui/terminal.ts`; text from
  `biofoundryTerminal()` in biofoundry.ts — its tank line is filled from the
  generated level with `setTanks()` before the typing reaches it; red access
  for the lift; no teases past the last sector) types out while sector 4 is built
  behind it; a click prints the rest, the next click glitches,
  CRT-collapses the screen and fades violet into sector 4, grabbing pointer
  lock inside that fresh click (no READY screen). Co-op campaigns stay 3
  sectors (`totalSectors`): the Biofoundry's tank breach spawns and glass
  changes are host-local and not replicated.
  Solo restarts NEVER reload the page: every sector start captures a
  `Checkpoint` (seed, score, health/armor/ammo, weapon loadout, run totals);
  death (`showDeathScreen`) offers Retry — from the red keycard if it was
  taken this attempt (`keyCheckpoint`, captured in `onKeyPickup`, solo only:
  `retryFromKeycard` is IN PLACE, world untouched, back where the key was
  taken, still holding it, gear never worse than then), else the sector
  (`retrySector` restores the sector checkpoint, health floored at 60) —
  plus Restart sector when a keycard checkpoint exists, New run, and a
  Revive in place once per sector attempt (`reviveUsed`; a retry gives it
  back): free on web, a Poki `rewardedBreak` that pays out ONLY when the
  video played and is hidden when an ad blocker removed the SDK. Revive and
  keycard retry share `bringBack()`: 60 hp floor, 2.5s overshield, nearby
  enemies `repel()`-ed (woken, attack cancelled, shoved, dazed 0.7s; an
  armed ticker is left to blow into the shield). The keycard checkpoint is
  never persisted; from sector 2 on the sector checkpoint is also saved to localStorage
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
  Sector clear (solo, `showSectorClear` → `HUD.showSectorClear`): `rankSector`
  grades S–C from kills (full at 85% of the roster) 50 pts, secrets 20, time
  30 (full at or under par = 45 s + 16 s/room, zero at 2.5× par); S ≥ 88,
  A ≥ 72, B ≥ 50. Rank bonus S 1500 / A 1000 / B 500 on top of the 1000
  clear + speed bonus (co-op: no rank bonus, old screens). Best rank per
  sector number in `voxelstrike-best-rank-<n>`. Then a perk: `rollPerkOffer`
  (src/core/perks.ts) offers 3 unowned perks seeded by run seed + sector;
  `pickPerk` adds it, re-captures the next-sector checkpoint and descends.
  When fewer than 3 perks are left the offer is filled with one-off REWARDS
  (`RewardId`: patchUp / resupply / reinforce, `isReward`, `offerDef`) —
  `pickPerk` applies them on the spot and never stores them.
  ENDLESS: the final clear screen's *Keep descending* (`onDescend`, solo
  only) runs `afterBreak(nextLevel)` from state 'won'; `levelIndex` keeps
  counting past `TOTAL_SECTORS` and `Game.endless` is true from depth 6.
  `themeFor(n)`: 1–3 facility, 4–5 Biofoundry, then two-depth alternation;
  `bossFor(n)` = solo and every 5th depth (forces Biofoundry). Endless enemy
  HP ×`min(1.8, 1 + 0.08·(n−5))`; best depth in `voxelstrike-best-depth`
  (title footer); HUD / pause / death / Continue say DEPTH; Poki sends
  `measure('endless', min(20, n), complete|fail)` instead of `level`.
  BOSS: on a boss depth `buildLevel` holds the red key back (`bossKey`),
  spawns the Broodkeeper (`bossEnemy`) from `LevelData.boss`, and the
  objective's first stage is `'boss'` (skull, orange, arrow on the boss);
  `updateBossBar()` drives `hud.setBoss()` each frame; `onBossDefeated`
  (from `Enemy.die`) clears acid, spawns the key, hides the bar. The key
  ambush is skipped on boss levels and the living boss is in `solidBoxes`.
  Perks (`Game.perks`, `hasPerk`) live in `Checkpoint.perks` — retry / save /
  Continue keep them, a new run clears them; `applyPerkStats` sets the caps
  they change (`Player.maxHealth`, `ammoMax` from `BASE_*`). Hooks: Volatile
  → `blastRadius()` (barrels + rockets only, never enemy blasts),
  Overcharge → arc caster 6 targets / ×0.8 falloff, Headhunter / Momentum /
  Scavenger → `onEnemyKilled`, Second Wind → `revivesAllowed`, Self-Repair →
  `selfRepair` (uses `Player.sinceHurt`).
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
  (LabFloor…LabCeilGrate, LampViolet, TankGlass) are the Biofoundry's
  set: levelgen places them ONLY in the `'biofoundry'` theme (sectors 4–5:
  `reskinLab` + tanks), and the hand-built `?sector4` preview map uses
  them; facility sectors never do. TankGlass is solid and a lamp but the mesher skips it (the
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
  + elevator, barrels/crates/lamps/pickups/enemies. A `LevelTheme` changes
  only the look and dressing, never the structure: `'biofoundry'` (sector 4)
  makes normal rooms 5–6 tall, lights them violet (key room stays red, exit
  teal, corridors teal), builds 2×2 ribbed pillars, places up to 12 specimen
  tanks against west/east walls (`dressBiofoundry`: whole volume + the pane
  cell + the occupant's standing spot must be air, backed by solid wall so
  no doorway is plugged; 4 occupied across different rooms, 2 broken),
  re-skins plain surfaces to the Lab block set (`reskinLab`, last, after the
  cracked secret wall), bakes with `BIO_AMBIENT`, and returns `level.bio`
  for the scenery. Bio-only choices use `dhash` — facility sectors keep
  their exact layouts per seed. Occupied tanks are preallocated in
  `totalEnemies`. One big `arena` room per
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
  Difficulty = sector/depth number. Sector 1 is a short OPENER (6–7 rooms,
  shotgun in the spawn room, no ticker nests, no brute — 1 brute at 2, 2
  from 3 — plus a hashed barrel pair in the first room; e2e needs a barrel).
  `generateLevel(seed, n, theme, withBoss)`: with a boss, `placeBoss` puts
  the Broodkeeper on a doorway-free N/S (then W/E) wall of the arena with a
  clear 3.4×3.4 footprint (crates/barrels cleared), empties the arena's
  tanks, puts the key spec 2.8u in front of it, keeps normal enemies out of
  the arena, and the generator retries until it fits. Endless depths add
  up to 2 enemies per room ≥2 steps from spawn (from depth 7) and up to 8
  occupied tanks; `addEnemy` respects `ENEMY_CAP` (90).
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
  (state machines: idle/patrol/chase/attack/charge/pain/dead. Rigs and
  attack patterns follow `reference/enemy-upgrades.md` + the
  `enemy-upgrade-*.png` sheets — box budgets husk 23 / sentinel 16 /
  ticker 16 / brute 25 / vatborn 29, colliders unchanged. EVERY attack is
  prepare → commit → recover on the `SCHED` table: `attack` = planted
  strike (husk claw, brute backhand, vatborn club, sentinel bolt, ticker
  arming), `charge` = committed move (husk lunge, brute charge, vatborn
  rush). `beginAttack` stores the target (`atkTgt`, never swapped
  mid-attack) and the facing locks at `SCHED.lock` (`lockX/Z`); melee goes
  through `meleeStrike` — reach + same floor + cone against the LOCKED
  direction + LOS at impact, damage once (`hitConsumed`); committed moves
  are swept in ≤0.25u substeps (`sweepCommitted`: obstruction first, then
  one trample). Pain can only interrupt a `prep` (cancel + retry delay) —
  never a move, strike, recovery, armed ticker or brute wall stun
  (`painAllowed`). Co-op clients derive the pose from state + time with the
  same SCHED, so the snapshot format didn't change; `planted` enemies are
  never shoved by separation. Walker arm pivots: NEGATIVE rotation.x
  swings an arm back/up (club overhead), POSITIVE swings it forward — the
  first pass had this mirrored and the husk ran with its claws trailing.
  Husks have a separate distance-driven gait (`animateHusk`): knee pivots
  reuse the same boxes, feet settle at rest and the support sole stays on
  the floor. Chase at 3.2u/s with time-based steering, a restrained weave
  and travel-facing body; hold a 1.55u standoff. Claw at <1.75 and lunge
  from 2.5–4 (grounded, LOS; stop 1.6u short with a driving step, not a
  frozen airborne pose). The torso leans toward local -Z, claw animation
  reaches forward at the impact frame, and recovery eases into a shuffle.
  Tickers sprint, arm at <1.8u (same floor + LOS),
  beep at 0/0.25/0.45/0.6, blow at 0.75 and ALWAYS detonate on death via
  `queueExplosion` — even sniped at range; sentinels hold 7–12u, commit
  their aim at 0.45 and fire one spread-free bolt at 0.70 only if the
  muzzle is clear; brutes share the husk rig/gait at heavier proportions,
  backhand at <2.4, telegraph a 9.66u/s charge (0.8s) that smashes
  destructibles, get stunned 1.3s on a wall slam via `stunTime`, and
  always drop a powerup; deaths burst into per-part gibs;
  `vatborn` is the Biofoundry's (sector 4) escaped specimen — husk skeleton via
  `humanoid()`, 0.65s heavy-swing windup + 1.1s recovery, a 0.3s braced
  rush that can't become a swing, never
  placed by levelgen. Its right arm (+x — the model faces -z) is a giant
  club ending in a huge dark fist; keep that oversized. A real Vatborn sits
  in each occupied tank with `dormant = true` (no AI/physics/wake, green
  tint, thrashes with `agitation`) and leaves via `startEmerge()` — a
  scripted 0.8s walk through the gap — so `scripted` enemies are skipped by
  separation and the out-of-world net. It is released by the Biofoundry's
  breach sequence: `PreviewArt` hooks in game.ts —
  `tankHit` from `applyVoxelDamage` when a TankGlass voxel is shot, `noise`
  from `Game.noise()` (gunfire), `update` per frame — drive dormant →
  agitated 1.2s → breach (front glass voxels become air via `setAndDirty`)
  → 0.8s step-out onto a verified clear tile. One release per tank, at most
  two breaching at once, preallocated in `totalEnemies`;
  `broodkeeper` is the wall-mounted boss — `buildBroodkeeper()` (~49 boxes,
  matched to `reference/sector4-broodkeeper.png`: steel cradle + feet, two
  bolted hatches hinged at the BOTTOM (they fold forward), bone chest plates
  on outer hinges over an orange core whose seam glows even when closed —
  the abdomen must stay below the chest or it covers the core —, capped head
  with visor + mouth, lime reservoirs, two back towers). Unlike other rigs
  its colours are RAW (no sRGB decode) with baked per-face shade
  (`BOSS_FACE_SHADE`): decoded, the steel went black and the red merged into
  one blob. The Biofoundry's crimson incubator-heart growth is skipped on
  boss levels (it hid the silhouette). Speed 0,
  600 HP, dormant until a player enters its chamber (`activateBoss`; `wake`
  does nothing). `bossUpdate` loops volley (1.0s warn, 3 acid globs 0.35s
  apart, 5 below 40% HP) → open 2.4s → release up to 2 Husks (cap 4 alive,
  they bump `totalEnemies`) → open 3.0s. `damage()`: ×0.25 closed, ×2 on
  the open core (`lastHitCore`, set by weapons.ts when a hitscan lands in
  `BOSS_CORE_Y` while `coreOpen`), no knockback/pain. Acid is its own
  projectile kind (`'acid'`, own pool, `ENEMY_SHOT_DAMAGE`, `clearAcid()`),
  doors/elevator (door.ts: the lift is a `group` — hazard-striped deck with
  an UP-arrow top, low side rails on the two sides off the boarding axis
  (`ElevatorSpec.walkAxis`), and an additive chevron beam up the shaft while
  it waits at the bottom; `ExitBeacon` is the same beam in green over the
  exit pad, lit only during the "step on the exit pad" objective. Riders
  fell off the open deck easily and then waited ~6s, so: `holdRider()`
  clamps the local player inside the footprint while the deck moves (a jump
  still clears it) and keeps holding the two OPEN sides for 0.4s after it
  reaches the top (`settle`) so a strafe/thumb drift doesn't walk straight
  off the edge — the boarding axis is released on arrival so stepping onto
  the ledge is never delayed; `isWaitingBelow()` makes a player on the lower floor
  call the deck straight back — mid-climb if the rider fell — and levelgen
  tops the ledge's open edge with a hazard `Trim` rail, gap at the lift.
  The co-op client smooths the lift at `LIFT_SPEED` from door.ts; keep the
  two in sync), pickups (magnetism,
  full-bright + glow discs; powerups set
  player buff timers), pooled projectiles (rockets carry a `dmgMult` for
  quad). Hit feedback fires the SAME frame as the damage — `applyFlash()`
  sets materials white-hot immediately (the 0.08s `updateLighting` tick then
  maintains/restores it), plus a jolt tilt + scale pop on the mesh, a
  'fleshHit' thwack, micro-stagger, and knockback (brutes ×0.25) — routing it
  through the light tick alone makes hits feel like nothing.
- `src/fx/` — pooled particles (one InstancedMesh), tracers, dynamic light pool.
- `src/entities/operative.ts` — the main character, the Facility Operative:
  `buildOperative()` returns a jointed 65-box rig (hands are jointed: three-bone fingers + opposable thumb, buildHandRig; waist/neck/shoulders/
  elbows/hips/knees, right-hand weapon socket, `animate(t, walk)`, `jump(t)`,
  `hold(gun)` — a two-handed chest carry solved onto `OPERATIVE_GRIPS`,
  `setHelmet(on)` — off shows a bare human head from the survivor note). It
  matches `reference/main-character-facility-operative.png` — the owner
  wants the IMAGE, so where the reference notes' 26-box table disagrees
  (visor frame, tall back spine, two-step boots, elbow tabs, knee bands) the
  image wins. Not used in gameplay yet. `?operative` on web builds opens
  `src/preview/operative-viewer.ts` (standalone, no Game: SHEET like the
  concept sheet, ORBIT with WALK/JUMP, GUN cycles the five real gun models,
  HELMET on/off, PLAY FPS → `?play=operative[&helmet=0]`, a web-only
  play-as-operative preview of the campaign: `WeaponSystem.useOperativeArms()`
  puts his jointed gloves (`buildFirstPersonHand`: 'grip', 'side' C-grip
  over the handguard, 'cradle') + forearm guards on every gun (left hand rides the shotgun
  pump; view model raised to `vmY = -0.25` so the arms read), his body
  (belt down, CPU-tinted, `jumpLift: false`) stands a step behind the eye
  for looking down, and a faint visor frame (`#fp-visor`) shows with the
  helmet on. Without the flag the shipped gun-only view model is unchanged —
  the owner removed hands before, so this stays opt-in until approved,
  240P, COMPARE with the reference). The Poki build
  tree-shakes the viewer, and `pokiPlugin.generateBundle` drops reference
  art that Vite would otherwise still emit.
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
  them into systems. Defaults depend on the device (`loadSettings(isTouch)`):
  pixelation 480 lines on desktop, 320 on touch, still cycled in Settings.
  Saved settings carry `v: 2`; an unversioned save holding the old one-size
  default (240) is moved to the device default once.
- Title screen: identical on web and Poki — no Co-op button anywhere.
  Kept bare on purpose (playtime fell to under 2 minutes): wordmark,
  ESCAPE THE FACILITY, three step tiles (keycard → door → lift, the HUD's
  objective icons/colours), one PLAY (`#start-btn`; Continue + New run
  with a save), one controls line, a Settings gear (`#title-settings-btn`)
  in the corner — don't add menu items back. A NEW SECTOR banner (THE
  BIOFOUNDRY · SECTORS 4–5) shows above the menu for RETURNING players
  only (`voxelstrike-tutorial-done` set) until they first enter a
  Biofoundry sector (`buildLevel` sets
  `voxelstrike-biofoundry-seen`; the `?sector4` preview doesn't count). Web
  builds show it with `?coop` (development; `coop.mjs` uses it), and the
  `?role=…&room=…` auto-join still works.
- `src/platform/poki.ts` — Poki web-portal layer (details in POKI.md). Every
  call is gated on the compile-time `POKI` constant (`--mode poki`), so the
  regular build tree-shakes it out, and every call survives a missing SDK
  (ad blockers). Gameplay start/stop is NOT called at each transition: `Game.frame()` calls
  `poki.setPlaying(state === 'playing')` every frame and the wrapper only
  forwards changes — keep it that way rather than sprinkling start/stop.
  New ad points go through `Game.afterBreak(then(adShown))` (mutes audio,
  releases held keys, eats double clicks); when an ad really played, desktop
  needs a READY "click to continue" before pointer lock (the gesture is
  spent) — `enterSector`/`resumeGame` handle that. Rewarded videos go
  through `poki.rewardedBreak()` (resolves true ONLY when the video played —
  never reward otherwise) behind a button that says "Watch ad" with the
  clapperboard icon, is never the green/primary one, and sits beside an
  equal-size normal button; hide the offer when `poki.adsAvailable()` is
  false. New analytics go through
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
