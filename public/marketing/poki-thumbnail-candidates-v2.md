# Poki thumbnail candidates — 2026-11-08

Generated with the built-in image_gen tool using the game's existing character art, gameplay screenshot, and previous thumbnail as references. Original assets preserved.

## Reported test results

- Conversion to play: 73.8%
- Average playtime: 6:37
- CTR from categories: 1.05%

These results alone do not establish that the thumbnail caused the CTR. There are no impression counts, category benchmarks, or controlled comparisons in the supplied report.

## Deliverables

- `poki-thumbnail-brute-closeup-v2.png` — first candidate to test. Tight Brute framing makes its visor, tusks, and pale shoulder armor recognizable at small sizes. Real shotgun combat; one enemy.
- `poki-thumbnail-barrel-payoff-v2.png` — alternative emphasizing the game's explosive-barrel mechanic. Husk, green barrel, orange blast, first-person shotgun.
- `poki-thumbnail-comparison-v2.html` — local comparison with the existing shotgun-impact image at 60, 100, and 160 CSS pixels, on Poki's mint background.

Both are opaque full-bleed square PNGs, with no typography or UI. These are generated marketing illustrations, not gameplay captures. Their visual performance remains a hypothesis until tested.

Poki asks for full-bleed square images of at least 628×628, simple compositions, small-tile readability, gameplay fidelity, and no text. See https://developers.poki.com/guide/game-thumbnail .
The same guide says thumbnails cannot change during an active web fit test; after passing, changes require Poki Developer Support sign-off.

Compare candidates with the existing image while holding build/categories stable where practical; record impressions, clicks, device mix, conversion, and playtime. Sequential tests can have different traffic.

## Final generation prompt A — Brute close-up

Use case: ads-marketing.
Asset type: finished square full-bleed 1024x1024 static Poki game thumbnail for VOXELSTRIKE, a retro voxel first-person shooter. Create ONE image, not a sheet.
Input images: Image 1 is the Brute character identity reference; reproduce the single rust-red heavy with pale shoulder slabs and two short square tusks, ignore all lettering and alternate-pose panels. Image 2 is the real gameplay screenshot: match its box-built geometry, pixel-textured industrial steel environment; omit its entire UI. Image 3 is the previous thumbnail, included ONLY to show shotgun identity and what to improve: the new composition must be substantially closer and more graphic, not a repeat of this full-body enemy composition.
Primary scene: a powerful close-range FPS confrontation with ONE Brute, caught mid-charge as the player's pump shotgun fires at its lower chest. Exhilarating arcade action, readable within one second. Brute's broad upper body fills the upper two-thirds, cropped below waist; its block head is large and frontal, tilted slightly down toward the viewer, amber visor clearly visible. One massive dark squared fist is drawn back to swing, never covering the face. Its head and shoulders make one strong silhouette; chest twists subtly from the shot, no flying ragdoll.
Character: simple approximately 25 large cuboids, rust-red body #a8402c, dark red joints #7a2f22, bone shoulder slabs and chest slab #d9c9a0, two small square ivory tusks, wide black visor with orange horizontal eye, huge charcoal fists. Match the reference, no realistic skin or extra teeth or horns.
Composition: tight dramatic low-angle crop, Brute centered slightly left, face in upper central third occupying about one-quarter of image width, shoulders spanning most of square. Player's simple dark-grey cuboid pump shotgun enters diagonally from lower-right, three small red spare shells, straight steel barrel and dark-brown ribbed pump, filling at most the lower-right quarter. Compact yellow-white square-edged muzzle flash near lower center connects to chest, well below face; only 4-6 square sparks. No hands or player body.
Background: very simple desaturated indigo steel facility wall, a single diagonal doorway edge and tiny warm lamp; large quiet shapes, subdued texture. Bright warm light makes red head and pale armor legible, restrained cool blue edge light separates shoulders from background. Saturated rust-orange versus blue-violet, pale cream armor and a small yellow-white flash. Strong midtone readability, no muddy shadows on the face, no mint or aqua dominant background.
Style: appealing polished voxel game key art, clearly chunky rectilinear low-poly in-game shapes, broad flat faces and sparse coarse pixel textures. Graphic clarity and strong silhouette over tiny details. No smooth sculpting, no realistic materials, no cinematic blur or lens effects.
Text: absolutely none. No words, branding, logo, numbers, UI, HUD, crosshair, watermark, border, padding, rounded corners, extra characters, gore or blood. Opaque square image to the edges.

## Final generation prompt B — Barrel payoff

Use case: ads-marketing.
Asset type: one finished 1024x1024 square full-bleed Poki thumbnail for VOXELSTRIKE, a retro voxel FPS.
Input images: Image 1 is strict character reference: use ONLY the lean rust-orange Husk on the RIGHT, no grey operative or lettering. Image 2 is the real game screenshot, strict reference for coarse pixel steel wall textures and simple cuboid construction; omit UI. Image 3 is the existing thumbnail used ONLY for identifying the default grey pump shotgun; create a substantially different composition with an explosive barrel as the visual hook.
Primary scene: one orange Husk recoils sideways beside a detonating GREEN explosive barrel in a steel facility, seen in first person with a shotgun in the bottom-right corner. Sell a satisfying environmental kill, fast arcade action, clear cause and effect, no horror. One enemy, one barrel, one weapon.
Composition: Husk in upper-left and center, tightly framed from head to thighs; large forward box head with black visor and amber rectangular eye clearly visible near upper-left third. Thin segmented arms swept slightly outward and torso leaning away from the nearby blast; feet stay grounded or cropped, no tumbling ragdoll. Detonating barrel at lower-left/center must be unmistakably green with simple dark top and one pale yellow band, its upper lid breaking into only 2 or 3 large block fragments. A bold angular orange-yellow fireburst erupts behind the barrel toward center-right, rising behind the Husk and giving it a clear dark outlined silhouette. Keep eye and face completely unobscured. Fire is one simple graphic shape, not a cloud of little particles. The blocky shotgun extends from bottom-right toward barrel, steel grey long barrel with magazine tube, dark receiver, brown ribbed pump, three small red spare shells; barrel aimed clearly at exploding drum, not at viewer. Tiny muzzle flash, secondary to barrel explosion. Legible visual hierarchy: orange enemy silhouette, green drum, warm blast, grey gun.
Character: same lean rust-red box humanoid as reference, modest shoulder ridge, small dark hands, no mouth, no teeth, no horns, no extra armor or oversized arms. About twenty simple large cuboids.
Environment: broad very dark indigo-blue steel wall shapes, minimal architectural lines and a single yellow-black floor stripe. Simplify background texture, no other enemies or objects. Bright amber illumination lights the character, saturated green barrel contrasts against orange flame, blue-violet shadows. Keep edge areas darker to stand out against Poki mint background.
Style: polished but faithful chunky voxel game art, large flat-faced rectilinear forms, coarse sparse pixel textures, graphic readable hard edges and no blur. No smooth sculpting, photorealism, realistic fire/smoke, cinematic haze, glossy materials or fine-detail noise.
Text: none whatsoever. No logos, numbers, HUD, crosshair, watermark, border, rounded corners, padding, captions, panels, blood or gore. Single opaque square thumbnail.

