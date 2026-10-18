# VOXELSTRIKE thumbnail research

Researched 2026-10-18. Scope: the supplied rust-red Husk/FPS thumbnail, the
reported Poki test, current game code, and public Poki examples. Recommendations
below are hypotheses to test, not measured explanations for the current CTR.

## What the results establish

- Category CTR: 1.14%. The supplied report contains no CTR benchmark or raw
  click/impression counts, so it does not establish the required uplift or
  statistical certainty.
- Conversion to play: 71.5%, above the roughly 61.7% reference in the email.
- Average playtime: 4:08, below the roughly 6:27 reference. Artwork can improve
  acquisition; the playtime gap still needs gameplay/onboarding work.

Poki scores results against the tested categories and allows up to four suggested
categories. Compare category-level results before treating the aggregate CTR as
an artwork-only problem. [Poki web fit test](https://developers.poki.com/guide/web-fit-test)

## What the current picture communicates

Strengths: immediately recognizable first-person shooting, visible action,
warm/cool separation, a memorable rust-red enemy, and no text.

Possible weaknesses, based on visual inspection:

1. The huge reaching hand and toothy mouth suggest close-up horror. That may
   attract a narrower audience than the game's arcade combat can serve.
2. The hand, face, gun, central muzzle flash, cyan lamps, and distant enemy
   compete for attention. At small sizes, the flash can obscure the action.
3. The image emphasizes being grabbed more than the satisfaction of landing a
   shot. Test whether showing the player's successful action changes interest.
4. The depicted Husk is bulkier and more detailed than the current lean model.
   `src/entities/enemies.ts` builds a 1.64-unit Husk with small hands and a simple
   visor. Keep that recognizable silhouette in replacement artwork.

These are design hypotheses. The report does not identify which, if any, caused
the observed CTR.

## Research and comparisons

Poki recommends one clear subject, simple backgrounds, motion, small-tile
legibility, text-free artwork, and a close match to gameplay. Deliver a full-bleed
square of at least 628 x 628 pixels. Check contrast against its mint page color,
`#83FFE7`. Small cyan accents do not require removing cyan from the whole image.
[Poki thumbnail guide](https://developers.poki.com/guide/game-thumbnail)

Two public image references inspected:

| Reference | Observed visual hook | Useful lesson |
| --- | --- | --- |
| [Blockpost 2.0](https://poki.com/en/g/blockpost-2-0) | A very large, colorful voxel weapon against a lighter environment; prominent branding | The weapon itself can carry the shooting promise. Its text is not a reason to disregard Poki's text-free recommendation. |
| [Funny Shooter 2](https://poki.com/en/g/funny-shooter-2) | One large, expressive enemy with a clear outline and little background detail | A distinctive enemy can communicate personality with very few competing shapes. |

Public pages do not expose either game's CTR. These are composition references,
not evidence that copying their palettes or characters will improve performance.

## Recommended candidates

Keep the supplied image as the control. Make two meaningfully different options:

**A - Shotgun impact, first priority.** The current lean Husk fills about half the
square, its torso turning backward from a landed shot. Keep its amber eye visible.
The actual shotgun occupies the lower-right corner. A compact muzzle flash and a
few square impact particles connect weapon and enemy. Use one industrial wall
and one lamp as the background. Reduce texture noise, remove the distant enemy,
and avoid the oversized hand reaching into the lens. Promise: satisfying voxel
combat with the player taking control.

**B - Barrel-chain payoff.** A first-person shot triggers an explosive barrel
beside one recognizable Husk. Show a clear orange blast and enemy reaction,
with one intact barrel making the cause understandable. Use the game's square
particles and real combat behavior. Promise: explosive arcade action and clever
environmental kills. Avoid invented ragdolls, loot showers, or destruction beyond
what the current game supports.

Both mechanics already exist: enemy hit reactions/knockback and fused barrel
chains. Neither concept requires adding a new system merely to support the ad.
Use current gameplay captures as the model and lighting reference. Avoid a
third-person operative as the central promise of the gun-only Poki experience.

## Validation plan

1. Preview the control and candidates at 60, 100, and 160 pixels inside a mock
   category grid. These are internal review sizes, not additional Poki specs.
2. Show each briefly to 5-10 people unfamiliar with the game. Ask what they think
   they would do, which image interests them, and why. Treat this as a qualitative
   filter, not a statistically reliable CTR test.
3. For live comparisons, record thumbnail version, build, categories, devices,
   impressions, clicks, conversion, and playtime. Keep the build and category
   suggestions stable where possible. Sequential tests can have different traffic;
   do not attribute every difference to the image.
4. Select for improved clicks while maintaining conversion and engagement.
   Do not invent a universal 2% or 3% passing target; use the supplied category
   benchmarks and sample counts.

Update artwork between tests: Poki disallows thumbnail changes during an active
web fit test. This corrects the earlier suggestion in `poki-thumbnail-prompts.md`
to potentially swap artwork mid-test. The earlier "Face full of Husk" idea now
serves as the baseline, not an assumed winner.
[Poki thumbnail update policy](https://developers.poki.com/guide/game-thumbnail)

Suggested categories to review for fit: First Person Shooter, Shooting, Gun,
and Action. Avoid promising Minecraft-style building or multiplayer solely to
reach a larger pool. Poki chooses the final category placement.
