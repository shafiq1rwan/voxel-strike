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
- `docs/RETENTION_PLAN.md` — the retention design (scrap + upgrades, the
  removed Survival mode, secret map weapons) and the brief for new map themes (Codex).
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
save screenshots to `scripts/shots/`). Use a FULL Chrome for Testing build
for `VOXEL_BROWSER` (`npx @puppeteer/browsers install chrome@stable`), never
`chrome-headless-shell`: it froze the renderer in native WebGL (protocol
timeouts that looked like game hangs):

```bash
node scripts/smoke.mjs      # boot, move, shoot, explode; fails on any console error; enemy-bounds watchdog
node scripts/e2e.mjs        # plays the whole 7-sector campaign: aggro, barrels, key → vault → lift → exit, the facility terminal into the Biofoundry, sector 5 harder than 4, the sector 5 Broodkeeper holds the key, sectors 6–7 the generated Geothermal Core with its monsters, Keep descending → depth 8
node scripts/movement.mjs   # WASD displacement must match camera basis vectors at 5 yaw angles
node scripts/husk.mjs       # Husk gait, floor contact, 30/60/120 Hz chase consistency, claw/dodge + rendered poses/motion clip
node scripts/firing.mjs     # spam-click / hold-to-fire / click-buffer semantics
node scripts/overload.mjs <url> # optional solo two-wave encounter (HIDDEN from players: only built with ?overload on web builds, never Poki — `OVERLOAD_ENABLED` in game.ts), reward/firing/cap/save checks and touch UI
node scripts/aimassist.mjs  # touch profile: magnetism snaps a 3° miss, 9° stays a miss, sticky-aim ratio ~0.55, held fire pulls a 7° miss on, no idle drift; desktop unaffected
node scripts/features.mjs   # ticker suicide/corpse-chain, key ambush, powerups, score + combo, arena/brute/arc-caster, headshots, automap, walk-on elevator ride, lift call-down + strafing rider held + ledge rail, touch map + weapon button/wheel, phone settings fit, no co-op on the title (?coop shows it), first-visit title = goal + 3 steps + PLAY + gear only, NEW SECTOR banner for returning players, pixelation default 180 on every device + adjustable + one-time migration, sector 1 opener + sector 2 as in 0.3.4 (11–13 rooms, no empty rooms), Broodkeeper (wake on entry, cycle, acid + summons, armor/body/core damage, quad ×2 cap, enrage below half, boss bar, key drop, every weapon hurts it + killed by real Ripper fire in 20–50s of game time), reward fill-ins, quick melee (damage/shove/cooldown/stagger ×2/reach/ticker) + secret-wall hint + SECRET FOUND + touch: no BASH, a second FIRE above the move stick (either holds the trigger), weapon skins (goal on title, unlock by kills, stamp + repaint + save, Armory equip, phone fit), safe area (notch + home bar clear in landscape, 844×390 and held upright; crosshair centred), thrown guns (an empty gun is thrown, hits for 45, lands as a pickup that gives it back empty, sidearm never thrown, dry click with nothing loaded), scrap + upgrades (kills DROP scrap pickups that bank when walked over + HUD counter, clears earn scrap, death screen shows it + Upgrades, buys cost and save, Suit/Plates/Medic/Hands/Head Start work, survives a reload, Armory entry, phone fit), the POWER LINK (cage in every core and facility sector-2+ layout, none in sector 1 or the Biofoundry, grille holds, a pistol shot at the node opens it, supplies collected)
node scripts/facility-monsters.mjs # Facility sector rosters (1 Husk+Ticker, 2 Clamp Guard+Arc Sentinel, 3 Brute+Wire Leech, no Tickers past sector 1, rooms populated, keycard alarm) + Sentry Bud bolt/lids/cadence/dodge, Clamp Guard pinch/side-step/turn rate/recovery, Wire Leech tether link/slow/stings/coil break/range/rebuild, rig budgets
node scripts/facility-rigs.mjs # Facility rig draws (5/12/7), source boxes, floor contact, 4,374 rays against rendered Leech triangles (including detached rigs), real coil shots/door blocking, six visible awake rigs in a complete scene and stable shaders
node scripts/bio-monsters.mjs # Biofoundry rosters (4 Vatborn+Spitter, 5 Carapace), Spitter mark/glob 10/acid patch 3 per 0.5s/expiry/dodge/patch cap, Carapace front ×0.25 back ×1 core ×2 + real-hitscan core / beside-core / closed plate + seam / leg, 9 draws each / 3-spike fan 8 each / no mid-attack flinch, Vatborn 95 hp, Broodkeeper adds = Carapaces ≤2 alive ≤4 per attempt, rig budgets
node scripts/geothermal-monsters.mjs <url> # the ?sector6 preview: Cinder Hulk warning mark / downswing / ground ring 22 once / dodge out of 4 u / jump it, Vent Stalker crouch / leap 18 once / dodge after the lock, Kiln Drone slug 14 / doors block aim and slag, Ash Weaver line marks / three spots 6 per 0.5 s / sidestep / jump / stops at a closed door / ≤ 12 draws, core shot ×2, armour, death, reset
node scripts/monkey.mjs     # randomized stress run with NaN/out-of-world invariants
node scripts/exit-room-props.mjs [url] # seven props, 24 layouts/four lift directions, boarding route, ride/status/exit, ?exitroom shortcut, ready/docked screenshots
node scripts/coop.mjs       # 2-player co-op over the BroadcastChannel transport: link/seed handshake, avatar + puppet sync, authority routing, shared keys/score, level transition, respawn
node scripts/perf.mjs       # 60fps guard: gun draws (baked), occlusion cull with every enemy awake, in-sight enemy drawn, no shader compile after level start; the same budget in the Biofoundry at its heaviest (sector 5)
node scripts/checkpoint.mjs # run flow, all in place (no reload): retry restores sector-entry gear, free revive in place once per attempt, keycard checkpoint retry (world untouched) + Restart sector, save/Continue from sector 2, quit to menu, new run, GRAPHICS LOST overlay
node scripts/sector4.mjs <url> [--poki]  # the hand-built ?sector4 preview: route, key gate, door, lift, completion, replay, retry, save isolation, mobile; --poki: the flag is ignored
node scripts/breach.mjs     # sector 4 (`?sector4` opens it alone): dormant Vatborn in each occupied tank; shoot one → sealed during agitation, real collision gap, liquid gush, it walks out and hunts, releases once
node scripts/poki.mjs       # POKI MODE ONLY (npm run dev:poki): stubbed SDK — init/loading order, ad breaks mute audio, gameplayStart/Stop dedupe, measure() events (level 1 fresh-start, level N start/complete/fail — start fills Poki's Started/Completed/Failed/Left columns — endless N start/complete/fail capped at 20, death N <killer> with every fail, playtime N reached at minute marks, upgrade <id> tier<N> on a buy), rewarded revive (ad icon, equal-size beside retry, muted, pays only on a watched video, once per attempt, hidden without the SDK), hidden co-op, boots with SDK blocked
```

`?seed=N` on the URL reproduces a layout deterministically. `window.__voxelstrike`
is the debug handle the tests use (the Game instance).

Tool scripts (not tests):

```bash
node scripts/gen-icons.mjs                        # regenerate PWA icons
node scripts/itch-download.mjs <url> <dir>        # download a free/PWYW itch.io project via the real browser flow
node scripts/skin-sheets.mjs [outDir]             # render every weapon skin on the view model → one contact sheet per gun (dev server)
```

## Architecture

- SURVIVAL was REMOVED (owner, 2026-10-27): the wave mode cost upkeep with
  every new monster and map, and players never saw it (it was PLAY for one
  Fit Test, 0.3.5, and playtime fell from ~5:00 to ~2:00; then hidden). Its
  code (`src/modes/survival.ts`, the wave-clear / shop / wave-HUD screens,
  `dressSurvivalArena`, the flow field, `Enemy.rise` / `navAround`,
  `survival.mjs`) is in git history up to commit 68832ba if it's ever
  wanted back. The title is the campaign only.
- `src/game.ts` — orchestrator: state machine (title/playing/paused/dead/
  intermission/won), 7-sector campaign flow with in-place level teardown.
  ALL sectors are generated fresh each run with the same keycard → red door
  → lift → pad flow: 1–3 in the facility theme, 4–5 in the Biofoundry theme,
  6–7 in the Geothermal Core theme (`generateLevel(seed, n, 'geothermal')`,
  levelgen `dressGeothermal`; 5 → 6 is an ordinary intermission; the
  standalone `?sector6` map is only Codex's hand-built preview; its
  scenery — steam over the heat seams, a GEOTHERMAL CORE sign in the spawn
  room and the optional POWER LINK puzzle — comes from `decorateGeothermal`
  in `src/preview/geothermal-gen.ts`, driven by `LevelData.geo`)
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
  counting past `TOTAL_SECTORS` (7) and `Game.endless` is true from depth 8.
  `themeFor(n)`: 1–3 facility, 4–5 Biofoundry, 6–7 Geothermal Core, then the
  three rotate every two depths (8–9 facility, 10–11 Biofoundry, 12–13 core…);
  `bossFor(n)` = solo, sector 5 (`BOSS_SECTOR`) and every 5th depth after
  (forces Biofoundry) — deliberately NOT tied to the campaign length. Endless enemy
  HP ×`min(1.8, 1 + 0.08·(n−7))`; best depth in `voxelstrike-best-depth`
  (title footer); HUD / pause / death / Continue say DEPTH; Poki sends
  `measure('endless', min(20, n), complete|fail)` instead of `level`.
  BOSS: on a boss depth `buildLevel` holds the red key back (`bossKey`),
  spawns the Broodkeeper (`bossEnemy`) from `LevelData.boss`, and the
  objective's first stage is `'boss'` (skull, orange, arrow on the boss);
  `updateBossBar()` drives `hud.setBoss()` each frame; `onBossDefeated`
  (from `Enemy.die`) clears acid, spawns the key, hides the bar. The key
  ambush is skipped on boss levels and the living boss is in `solidBoxes`.
  SCRAP + PERMANENT UPGRADES (`src/core/upgrades.ts`, docs/RETENTION_PLAN.md
  phase 1): `UpgradeBook` (`Game.upgrades`, localStorage
  `voxelstrike-upgrades`: scrap, lifetime earned, levels) — never reset by a
  new run. `Game.earnScrap` (solo only — `scrapEnabled`: never co-op or
  previews; it also pops the HUD counter) is fed by kills — which DROP it
  as a `'scrap'` pickup (`dropScrap`, `PickupSpec.amount`, a step off the
  body; a drop within 1.4u of loose scrap joins it, one pickup; it flies in
  from ~4.5u and banks via `collectScrap`; `sweepScrap` banks what's left
  at a sector clear; uncollected scrap is lost on death) —, sector clears (`scrapForClear`: 15 + 5/sector
  capped at 10 + rank bonus), the secret room and an opened Power Link;
  `attemptScrap` (reset on every attempt) is what the death screen and the
  clear tally show. 7 upgrades × 3 tiers (50 / 120 / 250): Reinforced Suit
  and Ammo Belt go through `applyPerkStats` (with the perks; it also runs at
  startup and in `applyRunStart`), Quick Hands → `WeaponSystem.quickHands`
  (switch + bash cooldown), Starter Plates → armor floor in `enterSector`,
  Field Medic → `healMult()` in pickups, Head Start → `applyRunStart` (new
  runs: SMG / +shells / a random perk, full health), Scanner →
  `scannerLevel` in automap `drawRegion` (keycard / cracked secret wall /
  Power Link node shown unexplored). Bought on the Upgrades screen
  (`openUpgrades` → `HUD.showUpgrades`), reached from the death screen's
  *Upgrades* button and the Armory header — the title stays bare. No
  free-revive upgrade (the revive is a Poki rewarded video) and no paid
  scrap (owner's call). Poki: `upgrade <id> tier<N>`. `features.mjs` #24.
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
  `level.totalEnemies` so intermission ratios stay honest). The secret
  room's cracked wall (`LevelData.secretWall`) glints: `secretGlint()` spits
  amber sparks + a 'secretHint' shimmer every ~2s while a player within 9u
  can see it, with one "looks weak" line per sector; entering the room calls
  `hud.secretFound()` (gold SECRET FOUND stamp). The HUD
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
  + elevator, barrels/crates/lamps/pickups/enemies. The exit room follows
  `reference/exit-lift-red-room-v1.png` (owner's call over an exit door that
  was tried first): the pad sits against the ledge's back wall under a green
  EXIT sign (`LevelData.exitSign`), the ledge rail is an invisible
  `PowerBarrier` row under yellow tube railing (`LevelData.ledgeRail`, both
  drawn by `ExitArt` in door.ts), the room is lit by warm work lamps with
  green only right over the pad, and crate stacks stand in the ledge-foot
  corners (never beside a doorway). A green square in an empty room didn't
  read as a way out. A `LevelTheme` changes
  only the look and dressing, never the structure: `'biofoundry'` (sector 4)
  makes normal rooms 5–6 tall, lights them violet (key room stays red, exit
  teal, corridors teal), builds 2×2 ribbed pillars, places up to 12 specimen
  tanks against west/east walls (`dressBiofoundry`: whole volume + the pane
  cell + the occupant's standing spot must be air, backed by solid wall so
  no doorway is plugged; 4 occupied across different rooms, 2 broken),
  re-skins plain surfaces to the Lab block set (`reskinLab`, last, after the
  cracked secret wall), bakes with `BIO_AMBIENT`, and returns `level.bio`
  for the scenery. `'geothermal'` (sectors 6–7): rooms 5–6 tall, warm work
  lamps (key room red), basalt walls with rusted plate (`dressGeothermal`),
  short molten `GeothermalHeat` seams set FLUSH in room floors (lamp blocks
  that light from below — never trenches: the `?sector6` preview's recessed
  channels stranded walkers), `GEO_AMBIENT`; the ranged share of its
  generic placements is capped at 50% and tickers at ~45% of rooms in
  pairs, then `applyGeoRoster` re-casts them as the sector's own pair
  (see "Geothermal Core sector monsters" below).
  Every core sector — and every FACILITY sector from 2 (something to find
  off the route; the Biofoundry has its tanks) — gets a POWER LINK
  (`placePowerLink` → `level.powerLink`; the core's steam `vents` and
  `signs` are `level.geo`): a 5×2 supply cage
  (Metal sides + roof at y = 4, steel plate floor) against a doorway-free
  wall of a normal room (never spawn/key/exit/arena/boss), its front row an
  invisible `PowerBarrier` grille, three `sealed` pickups inside (health,
  armor, one ammo), and a node — a `LampWarm` voxel at eye height in the
  same room's wall, ≥ 6 cells of wall away and preferably round a corner.
  The cage's back row is PowerBarrier too while pickups/enemies are placed
  (so nothing spawns inside) and opens before the bake. `decorateGeothermal`
  routes an amber cable around the wall faces (`wallPerimeter`) from node to
  cage; a hitscan/arc/melee hit on the node (`voxelHit`) turns it green, the
  gate bars sink into the floor, the grille cells become air and the
  pickups unseal. Optional: it never gates the route. Co-op (dev-only):
  a client's shot solves it on the host, but the opened grille and unsealed
  pickups are host-local, so only the host can collect. Bio-only choices use `dhash` — facility sectors keep
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
  Sectors 2–5 use the 0.3.4 rules (OWNER'S CALL, 2026-10-20): 11–13 rooms
  in sector 2, 12–14 from 3, +1 enemy in rooms ≥2 steps out from sector 2,
  tickers in 30% + 15%/sector of rooms in packs up to 3. A gentler sector 2
  (8–9 rooms, then quiet rooms + lone tickers) was tried after the Player
  Fit Test lost ~74% of players there, and reverted: it felt too short and
  too empty. Enemies per sector average ~12.6 → ~46 → ~57 → ~67 → ~70 over
  40 seeds, the same as 0.3.4. Anything added since (the Power Link cage)
  is placed AFTER pickups and enemies so it never consumes the layout RNG;
  keep it that way — seeds then differ from 0.3.4 only where the exit room
  was rebuilt. `features.mjs` checks sector 2. THE SENTINEL WALL: with the
  generic Facility mix (`FACILITY_ROSTERS` off), sector 1's Sentinels become
  Tickers, and in sectors 2–3 every other Sentinel in a room becomes a Husk
  (a room keeps its first; no RNG) — ~12 instead of ~18 per sector, the same
  total health. Its bolt does 7 (was 10). The 0.3.7 Player Fit Test had 70
  of the 171 players who reached sector 2 die to an Arc Sentinel; in 0.3.8
  (Sentinels back in sector 1) it was 148 of ~250 deaths across sectors 1–3.
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
  `humanoid()`, 95 HP, 2.3 u/s, 1.0s club windup, 0.2s smash for 18 at 2.2u,
  1.5s recovery (BEHAVIOURS.md §4), a 0.3s braced rush that can't become a
  swing; sector 4's roster places it in rooms too (`applyBioRoster`), beside
  the tank occupants. Its right arm (+x — the model faces -z) is a giant
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
  2200 HP (it was 600 and died to held SMG fire inside its first opening,
  ~8s; a PERFECT held-SMG fight is now ~25s, `features.mjs` 18b keeps it in
  20–50s of game time), dormant until a player enters its chamber
  (`activateBoss`; `wake` does nothing). `bossUpdate` loops volley (1.0s
  warn, 3 acid globs 0.35s apart) → open 1.4s → release ONE Carapace (sector
  5's own monster, from the side-incubator spots beside the cradle;
  `BOSS_ALIVE_ADDS` 2 alive, `BOSS_TOTAL_ADDS` 4 per attempt via
  `boss.releasedTotal`; they bump `totalEnemies`) → open 1.8s. Below half health
  (`BOSS_ENRAGE`, against `maxHp`, which follows endless HP scaling) it
  ENRAGES once: a roar + message, volleys of 5 globs fanned `BOSS_FAN`
  apart so one sidestep can't beat them (the adds stay Carapaces).
  `damage()`: ×0.25 closed, ×0.6 on the open body, ×2 on the open core
  (`lastHitCore`, set by weapons.ts when a hitscan lands in `BOSS_CORE_Y`
  while `coreOpen`), and quad counts ×2 not ×4 (`dmg *= 0.5` while the
  player's quad is up), no knockback/pain. Acid is its own
  projectile kind (`'acid'`, own pool, `ENEMY_SHOT_DAMAGE`, `clearAcid()`),
  doors/elevator (door.ts: the lift is a mechanical service lift after
  `reference/exit-lift-red-room-v1.png` — fixed: two guide masts with chain
  channels and bolt plates, a crossbrace with an EXIT LIFT plate and amber
  lamps, a drive box with an amber UP indicator, amber floor lamps; moving
  in `deck` at y = topY: a grated deck with a thin hazard rim and one
  chevron, dark side rails with amber strips on the two sides off the
  boarding axis (`ElevatorSpec.walkAxis`), carriage blocks on the masts and
  status lamps amber below / green docked. `new Elevator(spec, toLedge)`
  orients it toward the pad. The old chevron-beam columns (lift + pad) are
  gone — the mockup's brief rejects holographic beams. Physics unchanged:
  `box()` is still a solid column to topY. Riders
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
  helmet on. THE HANDS ARE ON EVERY BUILD, web and Poki (owner's call
  2026-10-28): `Game` calls `useOperativeArms()` at startup, which builds
  them AFTER loading, one gun per idle slot (`queueArms`; a gun raised first
  gets them in `showModel`) — all five at boot made 0.3.8 load ~0.6 s slower
  than 0.3.7 —, with a hidden `firstPersonPrimer` compiling their shader in
  the level warm-up; each gun's
  hands + forearms are BAKED by `bakeFirstPerson` (operative.ts) into one
  mesh (`fp-arms`, scuff shader kept; two on the shotgun, whose left hand
  rides the pump), so a gun in hand stays ≤ 12 draws, and `setSkin`
  re-mounts them on every rebuilt model (skins, the secret prototype — both
  were skipped while the hands were preview-only). The body under you and
  the visor frame stay behind `?play=operative`, 240P, COMPARE with the
  reference). Tracers and rockets leave from the world point where the
  muzzle flash is DRAWN (`fire`: the flash's view-model position rescaled
  from the overlay's fixed 75° to the world camera's FOV) — a fixed offset
  tuned for the gun-only height left them ~50 px under the flash once the
  gun was raised for the hands. The Poki build
  tree-shakes the viewer, and `pokiPlugin.generateBundle` drops reference
  art that Vite would otherwise still emit.
- `src/weapons/weapons.ts` — defs, hold-to-fire with a 0.25s click buffer,
  hitscan + rockets, viewmodels, muzzle flash. Slot 5 is the ARC CASTER
  (cells ammo): `fireArc` raycasts the first target then chains to up to 3
  more within 7u (LOS-checked, ×0.7 damage per hop), drawn as jagged teal
  tracer segments (`Tracers.fire` takes color + life; pool sized for it).
  WEAPON SKINS (`src/core/skins.ts`): 22 skins as data — `colors` per
  paint role (main/second/dark/accent/trim/metal/stock/mag; which boxes a
  role covers is per gun in `buildWeaponModel(id, skin)`, defaults = the
  standard paint) + `marks` (flat paint panels, side AND top faces — first
  person mostly sees the top; `on: 'slide'|'pump'` rides the mover). Marks
  bake with the gun, so skins cost no draw calls. Never recolour signal
  parts (sights, red dot, coils, LED, shells, bead). `SkinBook` keeps
  lifetime stats + unlocks + equipped in `voxelstrike-skins`; unlock order =
  `SKINS` order (first at 10 kills). Game feeds it via `skinStat()` (kills,
  headshots, bash kills via `WeaponSystem.bashing`, secrets, cleared,
  reached, bosses, S ranks); a new skin auto-equips (`setSkin` rebuilds the
  view model in place) and its stamp queues until state is 'playing'.
  Floor pickups stay standard.
  THROWN GUNS (owner's call, `src/weapons/thrown.ts`, Game owns
  `thrown`): the trigger on an empty gun while another owned gun is
  loaded (`DRY_SWITCH` order) flings it — `throwCurrent` drops it from
  `owned`, hides its model and raises the next one straight away. It flies
  end over end (22 u/s, slight arc, its floor-pickup model), is swept per
  frame against enemy boxes (+0.2), voxels and `solidBoxes()`, hits like
  a melee blow (45, ×2 vulnerable, quad ×4, shove, routed through
  `applyEnemyHit`) and lands on the floor as a `thrown` weapon pickup:
  picking it up gives the gun back with NO ammo and no switch
  (`WeaponSystem.reclaim`; it isn't collected while you own that gun). The
  sidearm is never thrown — it hops to a loaded gun on every device; with
  nothing loaded it's the old dry click; co-op keeps the old behaviour. A
  gun left on the floor when the sector ends is gone (the next checkpoint
  has the loadout without it). `lastThrown` / `thrown.lastResult` are for
  tests (`features.mjs` #22).
  Quick melee is NOT a slot: `MELEE` + `meleeStrike()` in weapons.ts (V,
  right mouse; the touch BASH button was removed — outside playtesters found
  it clutter — `Input.consumeMelee`). 0.15s windup, 0.6s
  cooldown, centre reach 1.8 (+ big bodies' extra half-width), same floor,
  50° cone, LOS, one target, 35 dmg + shove, ×2 when `Enemy.vulnerable`
  (pain/stun or the recover phase); with no enemy in reach it damages the
  destructible voxel at arm's length (crate / barrel / cracked wall). The
  view model jabs via `meleeT` in `animate()`. `lastMelee` is for tests.
  WEAPON SLOTS fill in PICKUP ORDER (owner's call): `WeaponSystem.slots()`
  (`slotOrder`, kept by give / reclaim / throw / `restoreLoadout`, saved as
  `loadout().owned`) — keys 1–5, the HUD bar (number + a tiny gun tag) and
  the touch wheel all read it, so slot 2 is the second gun found.
  Adding a weapon means updating BOTH `ORDER` arrays (weapons.ts + hud.ts —
  now only the canonical list, not the slot mapping), `DRY_SWITCH` in
  weapons.ts, `SLOT_TAG` in hud.ts, and the Digit list in input.ts. Hitscan headshots: husk/brute hits above
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
  them into systems. Pixelation defaults to 180 lines on every device
  (owner's call, 2026-10-28; it was 480 desktop / 320 touch), still cycled
  in Settings; a saved choice is kept.
  Saved settings carry `v: 2`; an unversioned save holding the old one-size
  default (240) is moved to the device default once.
- Title screen: identical on web and Poki — no Co-op button anywhere.
  Kept bare on purpose (playtime fell to under 2 minutes): wordmark,
  ESCAPE THE FACILITY, three step tiles (keycard → door → lift, the HUD's
  objective icons/colours), one PLAY (`#start-btn` = the campaign; with a
  save Continue and New run share ONE row), one controls line (first visit on desktop
  only), the NEXT SKIN goal line, a Settings gear
  (`#title-settings-btn`) top-right and an Armory button
  (`#title-armory-btn`) top-left (owner's call) — don't add menu items
  back. RETURNING players (`voxelstrike-tutorial-done` set, the
  `returning` option of `showTitle`) skip the goal line, the step tiles and
  the controls line — they know the goal, and the full stack overflowed a
  phone (`features.mjs` #14 checks it fits 667×375 with nothing to scroll).
  The Armory (`HUD.showArmory`) is tabbed per gun with a turntable
  preview (`ui/armory-preview.ts`: ONE extra WebGL context for the whole
  session — the canvas is created once and moved into each Armory screen;
  `hideScreen` → `logoStop` only stops its loop. Never `forceContextLoss()`
  it per visit: that fired a webglcontextlost error report on every close,
  and leaking a context per visit lets the browser kill the game's own).
  A NEW SECTOR banner (THE
  GEOTHERMAL CORE · SECTORS 6–7 · MIND THE HEAT) shows above the menu for
  RETURNING players only (`voxelstrike-tutorial-done` set) until they first
  enter a Geothermal Core sector (`buildLevel` sets
  `voxelstrike-geothermal-seen`; previews don't count). It always advertises
  the newest sectors (it was the Biofoundry's). Web
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
  spent) — `enterSector`/`resumeGame` handle that. Rewarded videos (the
  death-screen revive, and the Armory's "Unlock now · Watch ad" on a locked
  skin via `Game.adUnlockSkin`) go
  through `poki.rewardedBreak()` (resolves true ONLY when the video played —
  never reward otherwise) behind a button that says "Watch ad" with the
  clapperboard icon, is never the green/primary one, and sits beside an
  equal-size normal button; hide the offer when `poki.adsAvailable()` is
  false. New analytics go through
  `poki.measure()` (no `/` or `^` in any value — Poki reserves them) plus a
  row in POKI.md and an assert in `poki.mjs`. Poki builds hide co-op and
  skip the SW/manifest/fullscreen.
- SCRAP counter: `#scrap` (a brass cog + the bank) under KILLS top-right,
  solo only (`hud.setScrap(n | null, gain)`: set in `enterSector`, popped
  with a floating "+N" by `earnScrap`, updated on every spend).
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
  check new menu content at 667×375 (`features.mjs` #14). SAFE AREA:
  index.html sets `viewport-fit=cover` (edge to edge under the notch and
  home bar), so anything pinned to an edge adds the body's `--sat` /
  `--sar` / `--sab` / `--sal` (`env(safe-area-inset-*)`, 0 on desktop,
  notch-less phones and in Poki's iframe): `calc(18px + var(--sar))`.
  `body.force-landscape` remaps them (the game's top = the device's right,
  right = bottom, bottom = left, left = top). Centred things (crosshair,
  automap, panels) never take them. `features.mjs` #23 checks real insets
  (CDP `Emulation.setSafeAreaInsetsOverride`) at 667×375, 844×390 and held
  upright — new edge-pinned UI must use the variables or it fails there.
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

## Facility sector monsters (2026-10-27)

**The per-sector pairs are OFF** (owner's call, 2026-10-27: "I prefer the
previous monsters for sectors 1–3, v2 feels weird"): `FACILITY_ROSTERS =
false` in rosters.ts, so sectors 1–3 and endless Facility depths keep the
generator's 0.3.4 mix (sector 1 Husk + Ticker — its Sentinels become
Tickers since 0.3.9 —, no brute; 2–3 Husk / Arc Sentinel / Ticker / Brute,
half the Sentinels Husks) and the keycard alarm its generic
mix. Everything below stays in the code, spawnable and tested by
`facility-monsters.mjs` / `facility-rigs.mjs`; flip the flag to bring the
pairs back. The retunes of the Husk / Brute / Arc Sentinel (BEHAVIOURS.md,
sheet 01 look, the 40 HP Sentinel) are separate and still apply.

Each Facility sector has its own two monsters (reference/sector-monsters-v2,
BEHAVIOURS.md §1–3): 1 Facility Entry = Husk + **Ticker**, 2 Security
Floor = **Clamp Guard** + Arc Sentinel, 3 Reactor Access = Brute + **Wire
Leech**. Sector 1 was Husk + Sentry Bud until the owner found the turret
boring next to the Ticker (2026-10-27): the Bud is out of the campaign but
its code stays (spawnable, tested). The three new kinds live in `src/entities/facility-monsters.ts`
(`FacilityMonster`, hooked like `GeothermalMonster`: `Enemy.facility`;
rig + poses + AI + strike; `FACILITY_SCHEDULE` feeds `SCHED`):
- Sentry Bud: bolted turret (speed 0, never flinches), 28 HP; aims 1.0 s with
  its lids swung open (locks 0.25 s before), one bolt 6 dmg at speed 7
  (`ShotOpts` on the pooled `'bolt'`), 1.5 s dim-lid recovery, ≥ 3.5 s
  between shots. The base never turns; the head carries the aim.
- Clamp Guard: 85 HP, 1.8 u/s, turns ≤ 65°/s and walks the way it faces;
  jaws spread 0.9 s (turning stops for the last 0.3), one 0.2 s pinch for 16
  across a fixed ±55° arc at ≤ 2.1 u, 1.2 s shut recovery (`vulnerable`).
- Wire Leech: 45 HP, holds ~4–6.5 u; anchors + opens its coil 1.1 s (locks
  0.3 s before), one violet `'tether'` projectile; a hit links the player:
  `Player.slow` (25%), 4 dmg at 0.4 and 0.8 s, then it lets go. One link per
  player, a 1.2 s re-link grace, detach on LOS / range > 8 / death / rebuild;
  20 dmg to the coil (`coreOpen` + weapons.ts band above pos.y + 0.08, →
  `coilHit`) snaps it. Cooldown 4.5 s from the cast.
Existing three tuned to BEHAVIOURS.md: Husk claw prep 0.65 / lock 0.45 /
commit 0.15 / recover 0.9, 10 dmg; Brute 180 HP, backhand 0.8 / 0.15 / 1.1
for 18, charge prep 1.0 (lock 0.7), 8 u/s for ≤ 0.75 s (6 u) for 20, wall
stun 2.0 s; Arc Sentinel restyled to sheet 01 (grey steel, rust, pale
shutters, four tall paddles), prep 0.8 / lock 0.55 / recover 1.0, bolt
speed 9 — and after outside playtesters found it hard to kill: 40 HP,
2.2 u/s, a lazy drift (×0.35) in its firing band, collider 0.52 × 0.48.
ROSTERS (`src/world/rosters.ts`, owner's call "same pressure"): levelgen
still places the 0.3.4 generic slots, then `applyFacilityRoster` re-casts a
Facility sector's room by room — 1: husks stay, each sentinel slot → a
Ticker (sector 1 places no ticker nests itself);
2: sentinels stay, husk / ticker / brute slots → a Clamp Guard per two
husks' worth; 3: a Brute per three husks' worth, Wire Leeches for the rest
and ~60% of the sentinels. Every occupied room keeps ≥ 1, no Tickers in
sectors 2–3, no RNG used. `facilityBand(n)` picks the roster for endless
Facility depths; `FACILITY_RESPONSE` → `LevelData.responseKinds/Count`
(the keycard alarm). `facility-monsters.mjs`
tests all of it; features.mjs adds generic husks / tickers / a brute to
sector 2 for its mechanic sections.

## Biofoundry sector monsters (2026-10-27)

Sector 4 = Vatborn + **Spitter**, sector 5 = **Carapace** + the Broodkeeper
(reference/sector-monsters-v2 §4–5). `src/entities/bio-monsters.ts`
(`BioMonster`, `Enemy.bio`; `BIO_SCHEDULE`), rigs built with the shared
`src/entities/monster-kit.ts` (`RigKit`: part / joint / glow / grain; the
Facility module uses it too):
- Spitter: 70 HP, keeps 4.5–10 u; aims 1.0 s with its lime cheek sacs
  swelling and a square LANDING MARK on the floor under the target (locks
  0.3 s before), lobs one glob on a ballistic arc (0.8 s flight) that
  impacts at the first voxel / closed door on its path, 10 dmg within 0.9 u
  (LOS), 1.4 s recovery, ≥ 4.5 s between lobs. A floor impact leaves an
  ACID PATCH: radius 0.8, 3 s, 3 dmg per 0.5 s (`acidReady` per player =
  overlaps never stack; the first sting waits 0.5 s after the glob), one
  per Spitter (a new one replaces its old), `PATCH_CAP` 3 in the level
  (oldest retired), never on a doorway / one-wide cell. Its glob, mark and
  patch live in `BioMonster.fx`, which `EnemyManager` adds to the scene
  beside the rig (`Enemy.worldFx`) and disposes at reset; a dead Spitter's
  glob and patch run out their timers (`deadUpdate`). One flinch per charge.
- Carapace: 120 HP, 1.5 u/s, turns ≤ 70°/s; plants and parts its plates
  0.9 s (locks 0.25 s before), three bone `'spike'` projectiles (pooled, 8
  dmg, speed 9) in a ±0.13 rad fan, then the plates swing open: the core is
  bared 1.4 s (`coreOpen`) and closes over 0.35 s. Armour by HIT LOCATION
  (`scaleDamage`): hitscan rays meet its real boxes (`HitBoxes` in
  monster-kit.ts, recorded before the bake, following the live pivots —
  `EnemyManager.raycast` → `Enemy.lastHitPart`): a closed plate — or the
  2 cm seam between them — ×0.25 (armored clank), the rest of the body ×1,
  the bared core ×2 only where it shows. Hits with no location (splash,
  melee, thrown guns, a co-op client's shot) go by direction: into the
  closed front ×0.25. Never flinches mid-attack.
Both rigs are BAKED (`RigKit.bake`: one draw per pivot + its glows, 9
  each; the Spitter's reservoirs sit on their own `sac` pivots so they still
  swell). The Wire Leech uses the same `HitBoxes` for its coil.
Rosters (`applyBioRoster`, `bioBand`): sector 4 — a Vatborn per two
husks' worth of close-range slots, Spitters for ~60% of the sentinels;
sector 5 — a Carapace per three husks' worth of everything (~21 per
sector; 2.2 / ~28 for one test build, when all 12 players who failed sector
5 in the 0.3.7 Player Fit Test died to a Carapace). Its step up from sector
4 is the Broodkeeper and the extra tanks: e2e keeps its other enemies at
80–115% of sector 4's raw health (raw hp undercounts the armoured fronts). Endless
Biofoundry depths alternate, boss depths are sector 5; `BIO_RESPONSE` is the
keycard alarm. `bio-monsters.mjs` tests it.

## Geothermal Core sector monsters (2026-10-27)

Sector 6 Heat Exchangers = Vent Stalker + Kiln Drone, sector 7 Deep Core =
Cinder Hulk + **Ash Weaver** (reference/sector-monsters-v2 §6–7, sheets 03
and 04). Retuned to BEHAVIOURS.md (`GEO_SCHEDULE` + TUNING):
- Vent Stalker: 55 HP; crouch 0.8 s (the target locks for the last 0.25 s),
  ONE committed 0.45 s leap at the locked spot (speed from the locked
  distance, never homing), 18 dmg once, starts within 6 u; recover 1.2 s.
- Kiln Drone: 75 HP; holds 6–10 u; shutters open 1.1 s (aim locks 0.3 s
  before), one slow slug (14, speed 8), core open through a 1.2 s recovery.
- Cinder Hulk: 180 HP; fists up 1.2 s while its ground mark grows to the
  full 4 u (`slam-warning-ring`, centred on it); the slam starts a thin
  GROUND RING (`slam-ground-ring`, `ringStep`) running out at 7 u/s to 4 u:
  22 dmg once per cast to feet within 0.35 u of its floor — a jump clears
  it, a gallery above / floor below is out of it, cover along the ground
  blocks it; 1.6 s planted recovery with the core open.
- Ash Weaver (`src/entities/ash-weaver.ts`, `Enemy.weaver`; RigKit, baked
  to 12 draws): a broad, raised rust crawler on four splayed legs, three
  square front ports (each its own pivot + material: they light left to
  right), an ash-grey exhaust box with three tall glowing stacks. 70 HP,
  1.5 u/s, turns ≤ 80°/s, starts a line at 2–7.5 u with LOS on its own
  floor: brace, the ports light over 1.2 s while the WHOLE line is marked
  on the floor (three orange squares at 3 / 5 / 7 u, following its turn),
  locks for 0.35 s, ignites three heat spots (radius 0.65, 1.5 s; the
  strongest burning spot stings 6 per 0.5 s — `heatReady` per player, so
  overlaps never stack; only feet within 0.45 u of the floor), 1.4 s
  open-port recovery, 2.6 s between lines. `planLine` walks the line on
  its own floor level and stops at the first wall, closed door or drop.
  Its marks and spots live in `AshWeaver.fx` (`Enemy.worldFx`); a dead
  Weaver's spots burn out, its marks go at once.
ROSTERS (`applyGeoRoster`, `geoBand` — even depths 6, odd 7): 6 — a Vent
Stalker per 1.1 husk units (husk / stalker 1, ticker 0.5, brute / Hulk 3),
Kiln Drones for ~75% of the ranged slots (~30 + 18); 7 — a Cinder Hulk per
four units, Ash Weavers for the rest at one per 1.2 units plus ~75% of the
ranged slots (~5 + 39). Total enemy health stays within ~3% of the generic
mix's. `GEO_RESPONSE` is the keycard alarm. `geothermal-monsters.mjs`
(Codex's suite, extended) tests it; e2e checks each core sector fields
only its own pair.

## Build 1 from outside playtesters (2026-10-27)

- Touch: no BASH button; a second FIRE (`#tfire2`) above the move stick
  (left, bottom 56%), layered over the stick's zone — either FIRE holds the
  trigger (a held count), releasing one keeps firing while the other's down.
- Touch look is ~30% slower (`LOOK_SENS` 1.8, was 2.6); the slider reads
  "Look sensitivity" on touch.
- The player's own rockets and barrels hurt them at 27.5% of the blast
  (enemy blasts and tickers stay 55%).
- Sector clear: a quiet *Upgrades · N scrap* button under the perk cards
  (Back re-shows the screen `instant`, no second tally).
- Breakables: amber corner brackets on the crosshair (`hud.setAimHint`,
  `Game.updateAimHint` every 0.08 s, 14 u ray) while it rests on a crate,
  barrel, cracked wall or the Power Link node with no enemy in front;
  sector 1 places a free-standing STARTER CRATE two steps from the spawn
  (`LevelData.starterCrate`, no RNG) that always drops shells + a medkit,
  and the first-run tips add "Crates and barrels break — shoot them".

## Build 2: Facility sector looks (2026-10-28)

Each Facility sector has its own look, its rooms a purpose, built to Codex's
reference `reference/facility-props-v1/` (three sheets + PROPS.md: 24 props,
each with an envelope, box recipe, colours and glow; placement and signal
rules — no red / green / amber glow, cyan only on screens / LEDs, glass as
opaque ice-blue, nothing that looks like the breakable crate or barrel):
1 Facility Entry — office (desk + notice board, file cabinet, intercom),
storage (stores shelves), server (racks with cyan LED bars, cooling grilles),
white task lights, cool ceiling light (`Block.LampCool` 57); 2 Security
Floor — checkpoint (a GUARD BOOTH centrepiece, camera console, stowed
barrier, inspection counter), lockers (locker banks, equipment cabinets),
inspection, wall cameras, blue-white lights (`Block.LampIce` 58);
3 Reactor Access — generator (a TRANSFORMER centrepiece with orange heat
slots, pipe runs, steam vents), control (control panel, heat exchanger,
valve), service, cable trunks, orange worklights (`Block.LampOrange` 59, a
muted orange so grey wall still shows). `src/world/facility-rooms.ts`
`dressFacilityRooms`: `PROPS` (the recipes as data: cells along the wall,
depth, collision height, wall `mount`, parts in prop space) and `ROOMS`
(each purpose's centrepiece / floor props / wall fixtures / light); a room
gets one purpose by position hash (the spawn the look's first), a
centrepiece on its longest wall that fits (rooms ≥ 8 wide; ~2.6 booths per
sector 2, ~1.3 transformers per sector 3), floor props along every wall,
then wall fixtures above what stands there. Rules (PROPS.md): solid wall
behind, ≤ 1 cell deep (the centrepieces 2), two cells clear of doorways /
pickups / enemies / the spawn / the cracked secret wall, two walkable cells
in front; the Power Link's room is skipped (its cage is the feature).
Instanced boxes in `LevelData.architecture` (two draws per sector, drawn by
sector-landmarks.ts, which also carries the Power Link) over invisible
`PowerBarrier` collision; `LevelData.roomPurposes` records each room's.
Runs after every pickup / enemy / the Power Link and the starter crate, hash
only — layouts are identical with and without it (checked over 90 layouts,
sectors 1–3). Each look's ceiling lamps are re-tinted after the layout RNG
draws them (key-room red and the exit's warm keep their meaning).

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
  tries fullscreen + orientation lock (`goImmersive`, web builds only) on
  EVERY way into play — `enterSector` (PLAY, Continue, retry, next sector)
  and the touch Resume — since it only works inside a tap: asking only on
  a new run left returning players (who tap Continue) and anyone who swiped
  out mid-run without it. When held in portrait, the
  whole body gets `.force-landscape` (CSS rotate 90°, sized `100dvh × 100dvw` —
  the VISIBLE viewport; plain `100vh` is the height with the browser bars
  hidden, and on real phones the rotated title ran on under the toolbar and
  cut off New run); Renderer.resize reads
  BODY client dims (not window) and TouchControls.mapXY converts raw touch
  coords into the rotated game space — keep those three in sync. Rotated,
  vw / vh and media queries still describe the PHYSICAL screen, so hud.ts
  sizes everything with `--vw` / `--vh` (game-space 1%, swapped under
  `.force-landscape`) — never raw vw / vh — and each phone-size media
  query has a rotated twin (`(orientation: portrait) and (pointer: coarse)`
  + the game-space bound on the device's other axis); without them the
  compact menus never applied upright and Settings ran ~300 px off-screen.
  Rotated menus are `touch-action: none` and TouchControls scrolls them by
  the swipe's game-space travel: touch-action works in screen directions
  (pan-y never scrolled them; pan-x let an unscrollable swipe navigate the
  page back). `features.mjs` 23b. The
  joystick is invisible until touched (appears under the thumb, hides on
  release) — a resting on-screen ring was tried and rejected. FIRE, JUMP
  and the weapon button stack against the RIGHT EDGE: buttons placed further
  in sat under the aiming thumb and got hit by look swipes. Weapon
  switching on touch is the `#tweapon` button above JUMP: tap = next owned,
  swipe = prev/next, hold 280ms = a wheel of owned weapons (slide + release
  picks, release on the button cancels); wheel positions use offsetLeft/Top
  (layout space) so they match `mapXY`. The top slot bar shows owned weapons
  only, and an empty weapon auto-switches to a loaded one (`DRY_SWITCH`
  order, rockets last). `features.mjs` #13 covers all of it. On EVERY
  device an empty non-sidearm gun is THROWN instead (below).
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


## Secret prototype implementation

Sectors 1?5 each have a distinct secret-room prototype, configured in `src/weapons/secrets.ts`. All use `WeaponId.special` in physical slot 6, `AmmoType.special`, and `WeaponSystem.secret` for the selected model/behavior. Regular guns stay in pickup order. Empty prototypes are retained rather than thrown. Checkpoints store `secretWeapon`; old saves default to the first model. `node scripts/secret-weapons.mjs <url>` verifies this feature. This five-sector scope follows the owner?s request and supersedes the earlier three-environment proposal for this implementation. Permanent unlocks remain pending.


## Additional maps (2026-10-23)

Freight Depot, Deep Excavation and Medical Wing are implemented as `freight`,
`excavation` and `medical`. Each is ONE hand-authored hall
(`generateSectorLayout` in `src/world/sector-layouts.ts`; only encounters
and supplies vary by seed) built to match its mockup — the owner judges them
against the IMAGE: `reference/new-sector-mockups/freight-depot.png`,
`.../deep-excavation.png` and `reference/sector7-medical-wing-v1.png`.
Solid set pieces are voxels where they should take baked light (Freight's
containers are `FreightCargo` / `FreightCargoRed` blocks), the rest are
instanced boxes in `LevelData.architecture` drawn by
`src/preview/sector-landmarks.ts` (two draws). What makes each read:
Freight — grey riveted plate walls, a panelled ceiling (`FreightWall`'s
underside is `Tile.FreightCeil`) with square warm lamps, stacked corrugated
containers, catwalks + yellow railings + stairs both sides, a red girder
crane with a hazard-striped cargo frame, a braced cargo door round the red
door between hazard posts, a grated loading track (`FreightGrate`) edged by
a narrow hazard line (`FreightHazardFloor`: `Tile.FreightHazard` on top,
hazard `Trim` on its sides — also used for door hazard posts). Excavation —
dark blocky basalt (4 px cells, one dull ore fleck), steel floor plates, a
yellow drill with a stepped stone cutter head, a black lattice tower, red
girders, many small orange work lamps, a cool ambient. Medical — cream tiles
(one per block) over a teal band of small tiles, beige floor, a T-bar
ceiling with white troffers and dark ducts, bed bays + teal screens + ECG
monitors behind cream pillars, an operating room through a framed opening
in a partition, triage + a medicine cabinet, a red double door. Excavation
and Medical share the framed double door (leaves round the real door, light
bar, hazard posts, reader). Props added after the first pass (owner: "all the missing
props"): Freight — 2×2 concrete pillars carrying the crane runways, 2×2×2
crate stacks, catwalk office doors / lit windows / door lamps; Excavation —
a caged service lift by the galleries, green + steel lockers and crates by
the door, lamp posts round the drill pit, rubble in it; Medical — bedside
drawers, wheeled carts, wall vents, a DULL brass cable + junction box on the
partition (unlit on purpose: a glowing amber box reads as the Power Link
node). Medical props get a brighter light floor in sector-landmarks.ts
(white beds went grey). `src/world/environments.ts` keeps the palette;
its `dressEnvironment` is no longer reached (new themes return early from
`generateLevel`). Existing block and tile ids are unchanged; appended block
ids 40–56 and tiles 41–58 (59 of the 8×8 atlas's 64).

Endless depths start with Freight at
8-9, Excavation at 10-11 and Medical at 12-13; every fifth depth still uses the
Biofoundry boss, so depth 10 is Biofoundry. The first seven sectors stay as
before. Web-only isolated previews: `?map=freight`, `?map=excavation`,
`?map=medical`. `node scripts/new-maps.mjs <url>` checks these maps; add
`--poki` against a Poki server for preview-flag isolation. The e2e, features
and perf suites include the new themes.
