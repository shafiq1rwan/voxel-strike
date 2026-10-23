# Claude handoff: distinct sector monsters

The owner requested **mockups plus Markdown before Claude continues coding**. This directory is the resulting design pack. No monster code was changed as part of creating it. Start with [README](README.md), the five PNG sheets and [BEHAVIOURS](BEHAVIOURS.md).

## What the owner is asking for

Each numbered campaign sector should feel different through its monster silhouettes, behaviour and attack pattern. The three new maps also need their own monsters. Preserve the specific models and poses in the artwork. A tint change, HP increase or reused generic humanoid does not satisfy the request.

There are 20 identities in ten roster groups: campaign sectors 1–7, Freight Depot, Deep Excavation and Medical Wing. The subtitles Facility Entry, Security Floor and Reactor Access are proposed encounter identities for the existing Facility sectors, not new map-theme ids.

## Current code snapshot: read before continuing

The working tree is intentionally uncommitted and contains earlier work by the owner/other agent plus Codex changes. Preserve it. Do not use a broad reset or overwrite existing files from a clean checkout.

The map rebuild was interrupted when the owner switched to this design task. Do not interpret earlier completion messages as verification of the latest map architecture:

- `src/world/sector-layouts.ts` now defines substantial authored layouts for all three new maps, replacing the facility-shaped draft: cargo containers/crane, tall cavern/galleries/drill, and medical bed bays/operating area.
- `src/preview/sector-landmarks.ts` draws those landmarks with textured instance batches; `src/preview/environments.ts` dispatches to it when `level.architecture` is present.
- `src/world/levelgen.ts` dispatches the three new themes to `generateSectorLayout`. The authored composition is fixed; encounters/supplies vary by seed. This intentionally supersedes the earlier claim that all three maps preserve the Facility room footprint.
- `src/entities/player.ts` has local stair assistance restricted to authored stair rectangles. Both Excavation flights passed a direct no-jump check. Freight's crane support initially blocked its stair; the support was moved and a direct check then reached gallery height 6.881 at z≈39.45. The full suite has not been rerun after that last fix.
- The latest completed full `scripts/new-maps.mjs` run passed routes, secrets, cache/reset, previews, Survival stages and mobile checks but failed the **pre-fix Freight stair** assertion. Its expected start x is now 16.5 after the fix.
- The latest full `scripts/perf.mjs` run **failed for the rebuilt new maps**, at roughly Freight 466, Excavation 457, Medical 490 world draws, despite stable shaders. This remains unresolved. Do not ship those maps as performance-verified. Earlier generic-layout performance passes do not apply to the rebuilt architecture. Inspect visible enemy counts/rig draws and the complete scene rather than assuming instance count is the problem.
- Existing endgame difficulty can duplicate the authored enemy anchors, making many enemies visible simultaneously in an open hall. Investigate that along with rig batching before adding twelve new enemy types.
- The original campaign, upgrades, Survival and secret-weapon work is present. The five campaign secret prototypes use `WeaponId.special`, `AmmoType.special` and a variant index in `src/weapons/secrets.ts`.

At the time this design pack was written, no more runtime work was performed after the owner asked to hand coding to Claude. Runtime verification must be repeated against the actual current tree.

## Where to implement monster work

| Area | Files / responsibility |
| --- | --- |
| Shared ids | `src/types.ts`: `EnemyKind`, portable specs |
| Rigs and scheduling | `src/entities/enemies.ts`; existing geothermal rig helpers in `src/entities/geothermal-monsters.ts` |
| Campaign placement | `src/world/levelgen.ts`, `src/world/sector-layouts.ts`; current generic mixtures need explicit roster rules |
| Map scenery / tanks | `src/preview/biofoundry.ts`; preserve one occupant per real tank |
| Projectiles | `src/entities/projectiles.ts`; preserve pooling, obstruction and hit authority |
| Combat routing | `src/game.ts`: `applyEnemyHit`, damage/death/score/drop routing, key-response roster, teardown |
| Survival | `src/modes/survival.ts`: `waveRoster`, spawn caps, FlowField and stage setup |
| Networking | `src/net/netplay.ts` and portable messages; host owns AI and support effects |
| Effects | Existing particles, tracers, pooled dynamic lights; warm all material variants before play |

Use current `prepare → commit → recover` scheduling rather than a separate timer system per species. Take the timing values as proposed initial tuning, not permission to silently regress established behaviour. Existing core/boss damage rules, drops and `vulnerable` melee interactions need explicit regression checks.

## Roster selection

- Separate **encounter identity** from numeric difficulty. Do not use `difficulty >= 3` as a shortcut to sprinkle the same Brutes/Sentinels into every theme.
- Campaign 1–7: choose the exact two-monster roster in the README. Let enemy count, placement and difficulty change without erasing species identity. First introductions are isolated.
- Keycard response: use that sector's roster; bound the response and place it on supported clear floor away from the player. Sector 5 boss adds use Carapaces from side incubators, not recycled sector-1 Husks.
- New-map previews, ordinary endless map visits and Survival stage encounters use their named Freight/Excavation/Medical roster. Keep all first-play introductions readable.
- Survival Facility stage can progress through Entry → Security → Reactor bands across its five waves; Biofoundry can progress from Vatborn/Spitter to Carapace pressure. Keep Broodkeeper out of Survival until an explicit boss-wave implementation exists. Geothermal can progress from the sector-6 pair to the sector-7 pair.
- Endless Facility visits select a deterministic Entry/Security/Reactor band. Biofoundry boss depths keep the sector-5 identity. Do not silently expand the numbered seven-sector campaign to assign the new maps sector numbers.
- Keep a debug option to play each roster in isolation. Preview flags must remain ignored by Poki; normal Poki progression still contains the approved content.

## Suggested implementation order

1. Resolve the new-map performance regression and validate the authored routes/stairs/rails first. Preserve the new mockup-based architecture; do not restore the old reskin to make tests pass.
2. Add an explicit roster table and migrate placement, key alarms and Survival choices to it. Initially use existing types where available and mark unavailable proposed types clearly in dev tools.
3. Implement one new mechanic at a time: Sentry Bud → Clamp Guard → Spitter/Carapace → Wire Leech → Ash Weaver → named-map pairs. Keep the owner able to inspect an isolated encounter after each addition.
4. Add model silhouettes and all three pose states together with attack logic. A temporary generic model should not be presented as the finished mockup.
5. Implement specialized support/control/beam/segment hit regions with shared geometry queries and pooling. Respect real architecture and vertical separation.
6. Balance ammunition and mixed encounters only after each isolated warning, hit and recovery works at 30/60/120 Hz and on touch.

## Acceptance checks

- At a glance: all ten roster groups are recognizable from silhouettes; all 20 monsters match their selected large-view images and defining poses.
- Behaviour: record warning duration, aim-lock time, one hit per cast, guaranteed recovery and the intended counter in a deterministic test. Include a deliberate successful dodge and a deliberate failed dodge.
- Obstruction: projectiles, hooks, tethers, laser and healing links stop at a closed door, crate, container, rock pillar, drill and medical partition. Verify both directions and different gallery heights.
- Specials: a tether detaches on LOS/range/death/reset; a hook cannot drag someone across a pit or rail; burrowing cannot camp forever or emerge inside a player; Orderly cannot heal infinitely or heal bosses; floor effects respect caps and overlap rules.
- Lifecycle: retry, revive, checkpoint/Continue, map transition, pause/ad and teardown leave no attack timers, links, spawned adds or damage volumes behind.
- Progression: every sector has a reachable key, functioning locked door and rideable exit lift. No summoned creature or underground monster gates an exit.
- Performance: under 250 whole-world draws with the intended visible enemies awake; stable shader count after warm-up; no growing instance/geometry/material counts across repeated retries; mobile warning readability at 320 lines and a 240-line spot check.
- Regression commands: `npm run build`, `npm run build:poki`, `node scripts/new-maps.mjs <web-url>`, `node scripts/new-maps.mjs <poki-url> --poki`, plus relevant `e2e.mjs`, `features.mjs`, `perf.mjs`, `secret-weapons.mjs` and existing monster suites. Add a focused test for each new mechanic; a green build alone is insufficient.

The owner should review screenshots and a short encounter clip for each new roster before visual polishing. This is a design approval checkpoint for the finished result, not a reason to ask permission before routine implementation.
