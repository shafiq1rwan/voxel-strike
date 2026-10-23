# Retention plan

Design doc for keeping players longer, written 2026-10-22 after the second
Web Fit Test. For the owner (decisions) and for Codex (the new map themes,
section 6). Nothing here is built yet; [ROADMAP.md](ROADMAP.md) tracks it as
it ships.

## 1. The goal and the data

Poki's Web Fit Test scores three metrics, equally weighted, each 0–5 against
the category average: **click-through rate** (thumbnail), **average time on
page** and **conversion to play**. Poki's baseline is 65%+ conversion and 5+
minutes; this game's category showed ~6:27.

Web Fit Test, 0.3.4, 19,214 loads:

| Stage | Gameplays | Note |
|---|---|---|
| Loaded | 19,214 | 96% finish loading |
| Pressed Play | ~14,600 | ~76% of loads |
| Sector 1 outcome (cleared or died) | 9,140 | ~5,400 runs left sector 1 with neither |
| Sector 2 outcome | 4,739 | ~6 deaths per clear (sector 1: ~1.2) |
| Sector 3 outcome | 1,402 | the steepest step: 30% of sector 2 |
| Sector 4 / 5 | 634 / 363 | |
| Endless 6 → 15 | 94 → 8 | one session reached depth 18 (~2 h) |

Estimated average: **~5:00** (model from the funnel; Poki's own figure is the
real one). About 60% of all play time is spent in sectors 1–2; endless is ~3%.

**The rule for every feature below:** it has to keep the players who are
*leaving* (sectors 1–2) longer, or it barely moves the average. A 2-hour
session adds 0.4 s to it; keeping a third of the sector 2 death-quitters adds
~40 s.

## 2. Order of work

| Phase | Feature | Hits the leak? | Size | Owner |
|---|---|---|---|---|
| 0 | Measurement: `start`, `death`, `playtime` events | tells us why | done, uncommitted | Claude |
| 1 | **Scrap + permanent upgrades** (section 3) — **built 2026-10-23** | yes, directly | medium | Claude |
| 2 | **Survival mode** (section 4) — built 2026-10-23; was the main mode for one Fit Test (~2:00 vs ~5:00), now the secondary mode | not as the first impression | large | Claude |
| 3 | **Three new map themes** (section 6) | variety | large | Codex |
| 4 | **Secret map weapons**, 3 first (section 5) | indirectly | medium–large | Claude + Codex art |
| 5 | AI companion drone (an upgrade) | no | medium | later |
| — | Online co-op | no | large | not for Poki (section 7) |

Each phase ships as its own upload, checked with a **Player Fit Test** before a
Web Fit Test (Poki's advice: change one thing at a time). The thumbnail
(roadmap item 1) is the separate lever for click-through and can go with any
phase.

## 3. Scrap and permanent upgrades (phase 1)

**Why:** dying in sector 2 is pure loss today, so ~3,200 runs die there and
close the tab. Every death should earn something, and the next attempt should
really be a little easier. That helps the players who struggle and changes
nothing for players who don't die (the owner has played sector 2 as 0.3.4 and
it stays that way).

### Earning

| Source | Scrap |
|---|---|
| Husk, ticker, Vent Stalker kill | 1 |
| Sentinel, Kiln Drone kill | 2 |
| Brute, Vatborn, Cinder Hulk kill | 5 |
| Broodkeeper | 40 |
| Sector clear | 15 + 5 × sector |
| Rank bonus | S +15 · A +10 · B +5 |
| Secret room found | +10 |
| Power Link cache opened | +5 |

Target: a full sector 1 clear plus a death partway through sector 2 earns
~60, so **the first upgrade (50) is affordable at the first sector 2 death.**
That's the moment players currently leave.

Kept on death: everything earned so far (the run's progress is never lost).
No "Double scrap · Watch ad" (owner's call, section 8): scrap is never sold.

### Spending: 7 upgrades × 3 tiers (cost 50 / 120 / 250)

| Upgrade | Tier 1 / 2 / 3 | Aimed at |
|---|---|---|
| Reinforced Suit | +10 / +20 / +30 max health | dying |
| Starter Plates | start every sector with 10 / 20 / 30 armor | dying |
| Field Medic | health pickups heal +15% / +30% / +50% | dying |
| Ammo Belt | +10% / +20% / +30% ammo capacity | running dry |
| Quick Hands | faster weapon switch and melee cooldown (−15 / −30 / −45%) | feel |
| Head Start | new runs start with the SMG / +20 shells / a random perk | early game |
| Scanner | the keycard shows on the map from the start / the secret wall pings on the minimap / the Power Link node is marked | **sector 1 quitters who get lost** |

All 21 tiers cost ~2,500 scrap: about 5–6 full campaigns. That's a long goal for
returning players.

Guardrails:
- **No free-revive upgrade.** The death-screen revive is a Poki rewarded video, so a free one would cut ad revenue.
- **Names stay distinct from the run perks.** Vitality, Deep Pockets, Second Wind etc. are per-run perks; upgrades are permanent.
- **Upgrades stack with perks but are capped:** max health 130 + perks, ammo capacity up to +30% before Deep Pockets.
- **Enemy rules don't change.** Sectors 2–5 keep the 0.3.4 rules.

### Where it shows

- **Death screen:** "+N scrap" counts up, and an **Upgrade** button sits beside Retry.
- **Sector-clear tally:** scrap gets its own line.
- **Upgrades tab in the Armory.** The Armory is already top-left on the title, so the title stays bare. No new menu item.
- **Saving:** kept in localStorage (`voxelstrike-upgrades`: scrap, lifetime earned, levels). Never reset by a new run.

### Measuring it

- `upgrade` → `<id>` → `buy` with each purchase.
- Success means sector 2 deaths per clear fall from ~6 toward ~3, the sector 2 clear rate rises from 26% toward 40%, and average playtime rises.

## 4. Survival mode (phase 2)

**Result (Player Fit Test, 0.3.5, 2026-10-23): with Survival as PLAY,
average playtime fell from ~5:00 to ~2:00 — 132 players, the same audience
as the 5:00 test.** The owner moved PLAY back to the campaign (0.3.6) and
kept Survival as a quiet second button; scrap drops, the HUD counter and the
upgrades stay in both modes. Likely reasons: the campaign gives a stranger
something to explore and a visible goal (keycard → door → lift → a new
sector), while an arena of waves only holds players who already like wave
shooters, and every wave break put two screens in front of players who
weren't hooked yet. The original decision follows, for the record.

**Decision (owner, 2026-10-23): Survival becomes PLAY.** The campaign stays,
behind a quiet *Campaign* button on the title. Research on what keeps web
players 10+ minutes (Vampire Survivors, Brotato, CoD Zombies, Poki's own
guidance) points at the same few things: fun within seconds, a reward every
20–60 s, short early waves, a choice between waves, relief-valve drops, an
"I almost beat my best" pull, and failed runs that still progress. The
sector structure is slow to reward a newcomer: walk, find the keycard, one
perk per 4–8 minute sector. That is where sector 1 (~37% quit with no
outcome) and sector 2 (~6 deaths per clear) leak.

**The loop**

1. PLAY drops you into wave 1 within seconds: no navigation.
2. A wave is a set number of enemies spawned in at the arena's edges (spawn
   flash, out of the player's close range); it ends when they are all dead.
   Early waves are small (≈20–30 s), later ones longer.
3. Kills drop supplies: ammo for a gun you own, health, armor, and rarely a
   powerup (quad / shield / haste) as a relief valve. Brutes still always
   drop a powerup.
4. Between waves: a short pause and a **pick 1 of 3** (the run perks and
   one-off rewards), then a 3-2-1 and the next wave.
5. Guns are BOUGHT (owner's feedback, 2026-10-23) with SCRAP, the one
   currency (a separate run money was merged into it): every kill drops a
   scrap pickup you see and collect (it flies in), a HUD counter shows the
   bank, and cleared waves pay more. The break is two simple screens: the
   pick of three, then a shop with a picture of each gun — Scattergun 20,
   Ripper 45, Thumper 75, Arc caster 110, ammo 15 — and a big Continue
   (skipped when nothing is affordable). A gun takes the next free slot.
   Spending scrap on a gun is a real choice against the permanent upgrades.
   Arrivals are telegraphed (a red glow, then the enemy rises out of the
   floor) and always in the player's sight; the arena is big (~32 × 30) with
   cover and destructible props, and enemies path around the cover.
6. Every 5 waves the map changes: Facility → Biofoundry → Geothermal Core →
   (the three Codex maps, section 6) → repeat, enemy HP +8% per map. Each
   map's own enemies join its waves.
7. Death ends the run: *WAVE 9 · BEST 11*, scrap earned, **Try again**
   (straight back to wave 1), **Upgrades**, one revive per run (rewarded
   video on Poki). Scrap and upgrades carry between runs (section 3).

**Pacing targets.** Most first-time players should reach waves 8–12, about
6–10 minutes. Tune from the Poki events below, not by feel.

**Built from what exists:** the generated arena room of each theme (sealed
off as the stage), the whole enemy roster, the five guns + thrown guns +
melee, pickups and powerups, perks, scrap + upgrades, the death screen and
rewarded revive, HUD, touch controls and Poki integration.

**Poki events:** `wave` → `N` (capped at 30) → `start / complete / fail`,
plus `death` and `playtime` as usual. Saved best: `voxelstrike-survival-best`.

**Check before a Web Fit Test:** a Player Fit Test (500 players) with the
play-time markers; compare against 0.3.4 (≈5:00, the full sector funnel).

**Not in the first version:** the Broodkeeper as a boss wave (it is
wall-mounted and needs its cradle placed), co-op survival, leaderboards.

## 5. Secret map weapons (phase 4)

One weapon per environment, from Codex's concepts in
`reference/sector-weapon-mockups/`. First three:

| Map | Weapon | Behaviour |
|---|---|---|
| Facility | Rivet Riot | heavy rivets, knockback |
| Biofoundry | Spore Popper | sticky pods that grow and burst |
| Geothermal Core | Cinder Belch | charged molten slug, ember burst |

- **Where to find them:** in a map's secret room (campaign) or the wave-5 drop (survival). Finding one unlocks it permanently, shown in the Armory as "Weapons found 1 / 6".
- **One special slot (6).** One map weapon is carried at a time, with limited special ammo, so the HUD and the touch weapon wheel stay simple.
- **Adding a weapon** follows the existing checklist in CLAUDE.md:
  - both `ORDER` arrays, `DRY_SWITCH` and the Digit list;
  - `GUN_PICKUP` + `THROWN_GUN`;
  - `buildWeaponModel` (≤ 12 draws, baked);
  - skins roles;
  - tests.
- The other six weapons (Trauma Driver, Frost Hammer, Rebound, Cargo Kicker, Faultline, Skybreaker) come with their maps.

## 6. Brief for Codex: three new map themes (phase 3)

Proposed: **Freight Depot** (open yard, container stacks as cover, gantry crane:
naturally arena-shaped), **Deep Excavation** (stepped basalt quarry, the
"underground" map), **Medical Wing** (`reference/sector7-medical-wing-v1.png`
already exists). Alternates: Coolant Works, Security Nexus, Extraction Hangar.
Owner confirms the three.

Each theme is a `LevelTheme` like `'biofoundry'` and `'geothermal'`, so it works
in **survival, the campaign's endless rotation and future sectors** with the
same code.

**A theme must provide:**
1. **Theme id and rotation:**
   - a `LevelTheme` id in levelgen;
   - an entry in `themeFor`'s endless rotation (game.ts);
   - an entry in survival's map list.
2. **Blocks:**
   - new ids **appended only** in `src/world/blocks.ts`, with `Block`/`Tile` enums, `tileFor`, `LAMP_COLORS`, `isDestructible`, `blockHP` and `drawTile` kept in sync;
   - surfaces re-skinned the way `reskinLab` does it.
3. **A dressing pass** (`dressFreight(world, rooms, dhash)` etc.):
   - **only the position hash `dhash`, never the layout RNG**, so seeds keep their rooms, pickups and enemies;
   - changes the look, never the structure: no blocked doorways, no trenches (the `?sector6` preview's lava channels stranded walkers);
   - the BFS walkability check must still pass.
4. **Lighting:** an ambient (like `GEO_AMBIENT`) and lamp colours; the key room stays red and the exit stays green.
5. **Optional scenery** through a `PreviewArt` decorate function (signs, moving props). Instanced, a few draws.
6. **Optional:** its own enemy (a rig in `src/entities/`, prepare → commit → recover attacks on the `SCHED` table) and its secret weapon's model.

**Rules:**
- **Draw budget:** 60 fps on phones. `perf.mjs` must pass: < 250 world draws with every enemy awake, and no shader compiling after level start. Add the theme to it.
- **Palette:** hazard yellow, keycard red and exit green keep their meanings.
- **Art direction is the owner's call:** show screenshots before polishing (docs/ART.md).
- **Docs:** update CLAUDE.md, ARCHITECTURE.md, TESTING.md and ROADMAP.md with the theme.
- **Tests:** e2e plays the theme at least once, `perf.mjs` covers its heaviest case, `features.mjs` checks the Power Link and the secret room work in it.

## 7. Not now: online co-op

Poki players arrive alone: there's no friends list or matchmaking, so co-op
depends on a player sharing a room code. Few will, so the effect on the average
is tiny. It's also the riskiest code to extend: PeerJS, host authority, and ad
breaks for two players. The co-op code stays (web, `?coop`). The **AI companion
drone** (phase 5) gives every player a co-op feel instead.

## 8. Owner's decisions (2026-10-23)

1. Survival entry: **both** — a *Try Survival* button on the death screen and
   a Survival entry on the title for returning players only.
2. New maps: **Freight Depot, Deep Excavation, Medical Wing** — no swaps for now.
3. "Double scrap · Watch ad": **no**. (Section 3's optional rewarded button is
   dropped.)
4. Upgrade length (~5–6 full campaigns to max everything): **not sure** —
   ship the costs as written and tune from the `upgrade` buy events.


Secret-weapon implementation update (2026-10-23): the owner selected five campaign sectors for this build. Sectors 1?5 now contain Rivet Riot, Breacher, Lance, Spore Popper and Brood Breaker respectively, sharing slot 6 with independent ammo and checkpoint support. This is the implemented scope; the three-environment table above remains a future-content proposal. Permanent Armory discovery unlocks and Survival wave drops remain pending.


Map implementation update (2026-10-23): the three approved themes in section
6 are now built. Freight Depot, Deep Excavation and Medical Wing join Survival
maps 4-6 and the endless campaign rotation from depth 8, keeping the original
seven campaign sectors. They include procedural landmarks, dedicated
materials/lighting, Power Link caches and secret rooms. Standalone web
playtests use `?map=freight`, `?map=excavation`, `?map=medical`. The alternate
Coolant Works, Security Nexus and Extraction Hangar concepts remain pending.
