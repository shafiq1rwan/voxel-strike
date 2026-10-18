# Scattergun skin concepts

Generated with the built-in image_gen tool on 2026-10-18.

**Status (2026-10-18): all 22 concepts are in the game** as paint data in
`src/core/skins.ts`, earned by playing (see README "Weapon skins"). They
are first-pass reads of these sheets in the box model's own colours; render
them with `node scripts/skin-sheets.mjs` to compare.

[Comparison sheet](scattergun-skins-v1.png)

Additional sets: [Sidearm, Ripper, Thumper and Arc Caster skin concepts](other-weapon-skins.md)
with four unique finishes per weapon and the complete generation prompts.

Six cosmetic finishes are shown on one consistent Scattergun shape so their
colors and patterns are easy to compare. These are art proposals, not installed
skins or exact renders of the current weapon mesh.

| Skin | Paint treatment |
| --- | --- |
| Hazard | Industrial yellow and charcoal, broad warning stripes |
| Arctic | Off-white and navy, icy-blue band and gray pixel wear |
| Crimson | Deep red and charcoal, one broad ivory stripe |
| Digital Camo | Large olive, sand and charcoal square patches |
| Geothermal | Basalt gray, burnt-orange pump and stepped orange paint bands |
| Obsidian Gold | Charcoal with brass-gold panels and trim |

Implementation direction: reuse the existing cuboid weapon model and animations.
Plain colors can be applied before the model's vertex-color bake. Stripes, camo
and pixel wear would need a small procedural texture or explicit per-face color
pattern; they are not provided by the current flat palette alone. Keep the
side-saddle shells, shell caps, aiming bead and weapon function recognizable.
Readability should be reviewed in the actual first-person pose and low-resolution
renderer before choosing a final skin. Paint treatments could later be adapted
to other weapons without changing their silhouettes.

## Final prompt

Reference image: `public/marketing/poki-thumbnail-shotgun-impact-v1.png`,
used only as weapon-identity guidance.

```text
Use case: stylized-concept.
Asset type: one polished weapon-skin comparison concept sheet for VOXELSTRIKE, a retro voxel FPS. Wide landscape 3:2 canvas, around 1536 x 1024 or higher.
Primary request: show SIX different cosmetic paint finishes on the SAME simple voxel pump shotgun, arranged in a clean 3-column by 2-row grid. This is one comparison sheet. Every cell uses IDENTICAL gun geometry, scale, three-quarter side view, and lighting. Only the paint changes. Show each complete weapon without cropping or overlapping its neighbors.
Input image: reference is the existing VOXELSTRIKE marketing illustration. Extract ONLY the gray pump shotgun's recognizable box-built design, steel barrel, brown ribbed pump, and three red/brass spare shells as identity guidance. Do not reproduce the enemy, environment, muzzle flash, impact particles or combat scene.
Weapon model invariants: a simple block-built human-scale pump shotgun, roughly 20 large rectangular parts. One long straight rectangular steel barrel above a parallel thinner magazine tube, modest box receiver, 3 red shells with brass heads on its left side, compact block pistol grip, simple angular shoulder stock, chunky ribbed pump fore-end, and one tiny amber bead sight. No optic, scope, silencer, spikes, blade, new attachments, new silhouette, straps, hands or arms. Keep the stock and pump as existing shapes and recolor their surfaces. It must feel practical to reproduce using the existing game's cuboid model, flat vertex colors and coarse procedural pixel patterns.
Presentation: uniform elevated three-quarter LEFT-side view, muzzle toward upper-left and stock toward lower-right within each cell, visibly show left-side shells and pump. Guns are the hero, large enough to inspect. Quiet dark slate background, six subtle dark panels with thin steel dividers, generous consistent spacing. Soft even studio lighting rendered as flat per-face shading; colored darker edges, not heavy black outlines. Coarse pixel scuffs, large readable paint blocks. No photorealism, shiny chrome, reflections or depth-of-field blur.
Six cells in exact reading order:
Top left, label "HAZARD": dominant industrial yellow painted receiver and stock panels, charcoal grip and barrel, two broad black diagonal hazard stripes across the receiver side, yellow pump with charcoal grooves. Tough industrial equipment.
Top middle, label "ARCTIC": dominant off-white painted receiver, stock and pump; deep navy lower frame and grip; restrained icy-blue rectangular accent band and large sparse pale-gray pixel patches. Cold clean contrast, no snow or ice geometry.
Top right, label "CRIMSON": dominant saturated deep red receiver and stock, dark charcoal pump and barrel, one broad ivory diagonal stripe across the receiver, subtle blocky wear. Strong sporty arcade finish.
Bottom left, label "DIGITAL CAMO": dominant olive-green, sand-beige and charcoal LARGE square camouflage patches on the receiver, stock and pump; dark steel barrel and grip. Simple low-resolution repeatable pixel pattern, no detailed realistic camouflage.
Bottom middle, label "GEOTHERMAL": dark basalt-gray receiver and stock, burnt-orange pump, a few broad angular stepped orange and amber paint bands on the side panels, suggesting hot industrial machinery. Entire pattern is flat opaque PAINT, not molten holes or animated glowing cracks. Keep visible surfaces and silhouette intact.
Bottom right, label "OBSIDIAN GOLD": predominantly deep charcoal receiver, stock and pump, flat brass-gold top receiver panel and two broad gold trim bands, sparse ivory pixel scuffs. Prestige appearance achieved by color blocks, NOT reflective metal or ornate engraving.
Across ALL six: identical red spare shells, brass shell caps, amber aiming bead, functional barrel, proportions, pose and number of parts. Cosmetic paint differences only.
Text: only the six exact uppercase skin names underneath their respective guns, readable simple condensed block lettering. No title needed. No stats, prices, rarity badges, inventory UI, numbers, logos, watermarks or additional labels. No characters, no scenery, no ammunition scattered around, no muzzle flash, no effects.
Deliver the single finished SIX-SKIN comparison sheet with opaque background.
```

