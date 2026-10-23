# Roadmap

What is planned, in priority order, and why. Dates are when the decision was
made. Done items move to the bottom so the reasoning stays on record.

## Driver: Poki Web Fit Test (2026-10-18)

| Metric | Result | Poki bar |
|---|---|---|
| Conversion to play | 71.5% | ~61.7% |
| Average playtime | 4:08 | ~6:27 |
| CTR from categories | 1.14% | low |

Conversion is fine. Playtime and the category click-through are the two gaps,
so everything below is ordered by how much it lengthens a run or sells the
tile. Re-submit when the playtime items are in.

### Player Fit Tests since

| Date | Average playtime | Notes |
|---|---|---|
| (earlier) | 3:33 | before the 2026-10-18 content wave |
| 2026-10-19 | 5:00 | after the five-sector campaign, endless, perks, skins |
| 2026-10-19 | 4:42 | after the simpler title + Broodkeeper retune |
| 2026-10-23 | ~2:00 | 0.3.5: SURVIVAL as PLAY (132 players, same audience) — reverted in 0.3.6: PLAY = the campaign again, Survival a quiet button |

Level events in the 4:42 test (all actions added together, so not player
counts): level 1 → 1,185, level 2 → 548, level 3 → 142, level 4 → 59,
level 5 → 28, endless 6 → 13. Every step loses about half except sector 2
→ 3, which lost ~74%: sector 2 was a wall (11–13 rooms vs 6–7, ~4× sector
1's enemies, ticker packs, the first brute). Fixed below (gentler ramp).

## Planned

### 0. Retention plan (2026-10-22)
Scrap + permanent upgrades, Survival mode, three new map themes (Codex),
secret map weapons — in that order. Full design, data and the Codex theme
brief: [RETENTION_PLAN.md](RETENTION_PLAN.md).

### 1. Store thumbnails
Static 628×628+ tile, no text, one subject in motion, dark palette against
Poki's aqua page. Brief and prompts: `reference/poki-thumbnail-prompts.md`.
Animated 1080×1080 MP4 (4–6s, muted) from real gameplay at soft release.

### 2. Cross-run progression
Runs played, best depth, a weapon or skin unlock after a milestone, shown on
the title screen so a returning player sees their own numbers.

### 3. Geothermal biome
A third theme for the endless rotation (the concept from earlier notes), so
depths past 10 stop alternating between only two looks. The Spitter and
Carapace proposals in `reference/sector4-monsters.md` are still open.

## Later / unscheduled

- Spitter and Carapace (concepts in `reference/sector4-monsters.md`).
- Biofoundry in co-op (tank breaches and the boss are host-local today, so
  co-op campaigns end at sector 3).
- Play-as-operative view model (opt-in `?play=operative` until approved).
- Difficulty choice and per-sector star ratings.

## Done

- 2026-10-23 — 0.3.6: PLAY is the campaign again (Survival as PLAY scored
  ~2:00 against the campaign's ~5:00 with the same audience); Survival is a
  quiet button under it. The campaign keeps everything built for Survival
  that isn't Survival itself: scrap drops + the HUD counter, upgrades,
  pickup-order slots, floor drops.

- 2026-10-23 — Survival, owner's second round: scrap DROPS from every kill
  as a pickup that flies to you, with a scrap counter on the HUD (credits
  merged into scrap — one currency); the wave break is split into the pick
  of three, then a shop of gun cards with a picture of each gun and a big
  Continue (skipped when nothing is affordable).

- 2026-10-23 — Survival, owner's first playtest fixes: ammo drops more often
  (more when you're low) and always land on the floor; arrivals glow red for
  1.1 s and the enemy rises out of the floor, only where you can see it;
  guns are bought between waves with credits (shop on the wave-clear
  screen) instead of handed out; weapon slots fill in pickup order
  everywhere; the arena is ~32 × 30 with cover (walls, half walls, a
  container, pillars) and crates / barrels to blow up, and enemies follow a
  flow field around the cover.

- 2026-10-23 — SURVIVAL is the main mode (owner, after research on what keeps
  web players 10+ minutes — docs/RETENTION_PLAN.md §4). PLAY drops you into a
  sealed arena; waves spawn at its edges, kills drop supplies, a pick of
  three after every wave, guns arrive at waves 2/4/6/8, every 5 waves the map
  changes (Facility → Biofoundry → Geothermal Core), death shows the wave
  reached vs your best with Try again / Upgrades. The campaign stays behind a
  quiet *Campaign* button. Poki: `wave N start/complete/fail`. Next: a
  Player Fit Test against 0.3.4 (≈5:00), then tune the wave pacing.

- 2026-10-23 — Retention plan phase 1: scrap + permanent upgrades. Every
  kill, sector clear, secret and Power Link cache earns scrap that is never
  lost; the death screen shows this attempt's scrap with an *Upgrades*
  button, so a death in sector 2 still moves the player forward. 7 upgrades
  × 3 tiers (Reinforced Suit, Starter Plates, Field Medic, Ammo Belt, Quick
  Hands, Head Start, Scanner) at 50 / 120 / 250; also reachable from the
  Armory. Enemy rules unchanged (0.3.4). Measure: sector 2 deaths per clear
  (~6 now) and clear rate (26%), plus the `upgrade` buy events.

- 2026-10-22 — Poki diagnostics for the next upload (2026-10 Web Fit Test
  data, 4 days: 14,333 loads, 10,875 runs; sector 1 cleared by 40%, but 37%
  of runs left it with no death or clear; sector 2 cleared by 26% of those
  who reached it at ~6 deaths per clear vs ~1 in sector 1 — yet a first-time
  11-year-old cleared it easily, so the cause is open). Added: `level N
  start` (fills Poki's Started / Completed / Failed / Left columns, which
  read 0% before), `death N <killer>` with every fail, and `playtime N
  reached` at minute marks. Gameplay unchanged (0.3.4 rules). Decide the
  sector 1 / sector 2 changes from the next test's Left column, killers and
  playtime marks.

- 2026-10-20 — Sectors 2–5 play as in 0.3.4 again (owner: "revert to 0.3.4";
  the gentler sector 2 — first 8–9 rooms, then full length with quiet rooms
  and lone tickers — felt too short and too empty). Same rules, same enemy
  counts (~46 in sector 2). The optional POWER LINK supply cache is now in
  every facility sector from 2 too, placed after spawns so it never shifts a
  layout. The sector 2 drop-off from the Player Fit Test is open again:
  watch the level 2 `fail` vs `complete` split in the next playtest.

- 2026-10-20 — Safe area on notched phones (owner asked): the page was
  already edge to edge (`viewport-fit=cover`) with nothing keeping the HUD
  out from under the notch and home bar. Touch buttons, MAP/pause, the HUD
  corners, the title's corner buttons and the menus now add
  `env(safe-area-inset-*)` (remapped for the rotated portrait mode). No
  change on desktop or notch-less phones; Poki's iframe reports 0.

- 2026-10-20 — Thrown guns (owner): pull the trigger on an empty gun with
  another one loaded and you throw it — end over end at what you aim at,
  a melee-weight hit with a shove — and the next loaded gun comes up on
  every device. It lands as a pickup that gives the gun back empty. The
  sidearm is never thrown (it just switches); nothing loaded is still a
  dry click.

- 2026-10-20 — The Geothermal Core's Power Link puzzle in the generated
  sectors 6–7 (owner: "i want that puzzles", from Codex's `?sector6`
  preview): every core sector has a sealed SUPPLY CACHE (health, armor,
  ammo) in a normal room and a POWER LINK node in that room's wall, joined
  by an amber cable around the walls; shoot the node, the cable turns green
  and the gate sinks. Optional, never on the route. Also steam over the heat
  seams and a GEOTHERMAL CORE sign in the spawn room.

- 2026-10-20 — Geothermal Core as sectors 6–7 (owner): the campaign is 7
  sectors; endless starts at depth 8 and rotates facility / Biofoundry /
  core every two depths; the Broodkeeper stays at sector 5 and every 5th
  depth. A generated `'geothermal'` theme: basalt walls, flush molten heat
  seams, warm lamps, Vent Stalkers / Kiln Drones / a Cinder Hulk mixed into
  the roster, tuned so sector 6 is no harder than 5. The NEW SECTOR banner
  now advertises it to returning players. Poki: levels 6–7 are `level`
  events, `endless` starts at 8.

- 2026-10-19 — Exit-room reference pass: riveted gray/rusted panels on walls
  and ledge, steel floor and dark ceiling, two warm work lights, local green
  exit glow, worn/bolted lift steel and framed green threshold. Added motor
  cabinet, live status display, conduit, toolbox, intercom, emergency light
  and fan grille with procedural placement and boarding clearance.
  Web review shortcut: `?exitroom&seed=12345`.

- 2026-10-19 — Exit room rebuilt to `reference/exit-lift-red-room-v1.png`
  (owner: stepping on a green square in an empty room felt weird): a
  mechanical exit lift (masts, crossbrace, drive box, carriages, status
  lamps), yellow ledge railing, a green EXIT sign over the pad, warm lighting
  and crates. Replaced the chevron beams and an exit door tried first.
- 2026-10-19 — (REVERTED 2026-10-20, see above) Gentler sector 1 → 3 ramp
  (Player Fit Test: sector 2 lost ~74%). Sector 2: 8–9 rooms (was 11–13), lone tickers in ~25% of rooms plus
  one guaranteed to introduce them, no extra far-room enemy. Sector 3:
  10–11 rooms (was 12–14), ticker pairs at most. Sector 4 on unchanged.
  Average enemies per sector over 30 seeds: 12 → 20 → 39 → 61 (was 12 → 46
  → 57 → 61). Next test: the level 2 → 3 step should look like the others.

- 2026-10-19 — Broodkeeper retune (owner: "too easy to kill"). Held SMG
  fire at the core killed it in ~8 s, inside its first opening: 600 HP,
  the core open 61% of the cycle, full damage to the body while open, quad
  ×4. Now 2200 HP, openings 1.4 s + 1.8 s, body ×0.6 while open (core ×2),
  quad counts ×2 on it, and below half health it enrages (fanned five-glob
  volleys, a ticker in each release). A perfect held-SMG fight is ~25 s;
  `features.mjs` keeps it in 20–50 s. Watch the sector 5 `fail` count in
  the next playtest — if it spikes, ease the HP first.

- 2026-10-18 — Weapon skins (owner's call, as a reason to keep playing):
  all 22 concepts from `reference/weapon-skins/` as paint data (roles +
  flat marks on the side AND top, which is what first person sees), baked
  with the gun so they cost no draw calls; signal colours untouched. Each is
  a lifetime goal, first at 10 kills (~1–2 min); the title shows the next
  one with progress, the HUD flashes progress, SKIN UNLOCKED stamps it and
  auto-equips; Armory from pause / the title strip. Floor pickups stay
  standard. Palettes are first-pass reads of the sheets — review with
  `node scripts/skin-sheets.mjs`.

- 2026-10-18 — Quick melee: V / right click / touch BASH (up and in from
  FIRE). 0.15 s windup, 0.6 s cooldown, 1.8 u centre reach (+ big bodies'
  extra half-width), same floor, 50° cone, LOS, one target: 35 damage + a
  shove, ×2 on a staggered or recovering enemy (`Enemy.vulnerable`), quad
  ×4. With no enemy in reach it breaks a crate, barrel or cracked wall at
  arm's length. View model: pull back, jab forward with a dip. Tips teach it.
- 2026-10-18 — The secret wall gives itself away: within 9 u with line of
  sight, amber sparks + a faint shimmer every ~2 s from the cracked voxels
  (`LevelData.secretWall`), a one-per-sector "looks weak" line; stepping in
  shows a gold SECRET FOUND stamp. Playtests suggested players never found
  the Thumper's room.

- 2026-10-18 — Endless descent after sector 5 (*Keep descending* on the final
  screen; DEPTH 6+ alternates facility and Biofoundry every two depths,
  enemy HP up to ×1.8 and up to two extra per far room, a persistent deepest
  depth on the title, `endless N` Poki events capped at 20). Sector 1 became
  a short opener (6–7 rooms, shotgun in the spawn room, no tickers or
  brutes; one brute in sector 2). The Broodkeeper boss guards the keycard in
  sector 5 and every fifth depth, with a boss HP bar under the objective.
  Perk offers fill with one-off rewards once the pool runs dry.

- 2026-10-18 — Sector-clear moment: S–C rank from kills, secrets and
  time vs par with a score bonus, the tally counting up, a NEW BEST RANK
  flash per sector, then a pick of 1 of 3 run perks (9 in the pool) that
  carry through retry, save and Continue. Playtest feedback: "fun, but short
  and not rewarding enough".

- 2026-10-18 — Sector 4 in the campaign: a Biofoundry-themed sector
  generated fresh every run (solo, web and Poki) with the same keycard →
  red door → lift → pad flow, specimen tanks with dormant Vatborn, entered
  through a facility terminal that types the route-out message and powers
  off into the sector. The hand-built map stays as the `?sector4` preview.
- 2026-10-18 — Sector 5: a second Biofoundry sector after an ordinary
  intermission, slightly harder (6 occupied tanks instead of 4, one more
  enemy in the far rooms; ~10% more enemies on average).

- 2026-10-18 — Soften death: the red keycard is a checkpoint (retry from it
  in place, world untouched, Restart sector still available) and a revive
  in place once per sector attempt — a Poki rewarded video (clapperboard
  icon, never green, equal-size beside the retry, hidden without the SDK),
  free on web. Measure the effect with the level 1 complete / fresh-start
  ratio in a Poki playtest.

- 2026-10-18 — Overload hidden from players (web `?overload` only, never on
  Poki): a second terminal and offer screen in every sector competed with
  the one goal while playtime dropped. Code and test kept.

- 2026-10-18 — Solo Overload playtest: optional cyan terminal, two bounded
  waves (three Husks and one Sentinel), then one non-stacking reward:
  Focused Shotgun trades tighter spread for slower firing, or take capped
  repair/ammo. Exits stay open; a short offer explains the two-wave fight
  and available rewards, with Start fight/Not now. Compact reward choices
  appear after victory.
  Web shortcut `?overload&seed=12345` starts beside it with a shotgun.
  Added to test whether an optional challenge/reward encourages continued
  play; its effect on average playtime has not been measured yet.
- 2026-10-18 — Enemies rebuilt to `reference/enemy-upgrades.md`: new rigs,
  prepare → commit → recover attacks with target/facing lock, one-hit melee,
  swept charges, pain gating. Husk gait and standoff tuned.
- 2026-10-18 — Lift keeps its riders: hold while moving, call-down from
  below, faster cycle, deck rails, ledge rail.
- 2026-10-08 — Poki phases 1–2: SDK bridge, in-place restarts, objective
  tracker, retry-sector checkpoints, saved Continue, first-run tips.


### Built: five campaign secret prototypes (2026-10-23)

Sector 1 Rivet Riot, 2 Breacher, 3 Lance, 4 Spore Popper, 5 Brood Breaker. Hidden cracked-wall pickups, one carried prototype in slot 6, independent ammo and checkpoint/Continue support. This owner-requested five-sector implementation differs from the earlier three-environment proposal; permanent unlocks, Survival drops and future-environment weapons remain pending.


### Built: remaining three approved map themes (2026-10-23)

Freight Depot, Deep Excavation and Medical Wing are generated playable themes
in Survival and endless campaign rotation. Dedicated materials, lighting,
procedural landmarks, optional Power Link caches and secret rooms are built;
the Medical Wing includes recessed treatment beds and monitoring equipment.
Web playtest routes: `?map=freight`, `?map=excavation`, `?map=medical`.
The original seven-sector campaign order is retained. Theme-specific new
enemies, future-map weapons and the alternate Coolant/Security/Hangar maps
remain separate future work.
