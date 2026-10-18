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

## Planned

### 1. Store thumbnails
Static 628×628+ tile, no text, one subject in motion, dark palette against
Poki's aqua page. Brief and prompts: `reference/poki-thumbnail-prompts.md`.
Animated 1080×1080 MP4 (4–6s, muted) from real gameplay at soft release.

### 2. Quick melee (decided 2026-10-18)
A dedicated bash on V (desktop) / a small button beside FIRE on touch, not a
sixth weapon slot — a slot would touch both weapon `ORDER` arrays, the HUD
slot bar, the digit keys, `DRY_SWITCH` and the touch weapon wheel for no
gain. Why now: the enemy rework gave every melee enemy a warning, a locked
direction and a protected recovery (husk bent over after a missed claw,
brute dazed 1.3s on a wall, sentinel folded for 0.9s). A free, instant hit
that is strong in exactly those windows turns the telegraphs into a skill
loop, removes the empty-gun dead end, and opens crates and barrels without
spending rounds.

Shape:
- One swing: ~0.15s windup, 0.6s cooldown. Reach ~1.8u in a cone, with the
  same reach / same-floor / cone / line-of-sight rules the enemies use
  (`meleeStrike` in `enemies.ts`), damage once per swing.
- ~35 damage (a husk in two hits, or one after a pistol shot) plus knockback
  that shoves a husk out of its claw range.
- ×2 against a staggered or recovering enemy — the reward for reading the
  telegraph.
- Breaks a crate or barrel in one hit at arm's reach. Bashing a ticker
  detonates it; that stays.
- View model: the gun in hand jabs forward with a short dip. No hands (owner's
  call in `ART.md`), no new model.
- Guard rails: reach stays under the husk's 1.55u standoff and the cooldown
  is real, so the guns keep their point. The touch button lives on the right
  edge with FIRE and JUMP, never under the aiming thumb.
- Tests: a `features.mjs` section for the one-hit rule, the stagger bonus and
  the ticker detonation. Update the first-run tips and `UI_SPEC.md`.

About a day including tests.

### 3. Cross-run progression
Runs played, best depth, a weapon or skin unlock after a milestone, shown on
the title screen so a returning player sees their own numbers.

### 4. Geothermal biome
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
