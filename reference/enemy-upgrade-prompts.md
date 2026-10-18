# Current enemy upgrade mockup prompts

## Husk scale revision

Selected final: [enemy-upgrade-husk-v2.png](enemy-upgrade-husk-v2.png). Generated and refined with the built-in imagegen tool on 2026-10-18. The original Husk sheet remains archived. The first pass used the original Husk sheet as the edit target and the Facility Operative sheet as a character reference; the second pass edited that comparison to reduce the hands and wrist cuffs. Exact runtime dimensions are construction targets in [enemy-upgrades.md](enemy-upgrades.md), not measurements taken from the generated art.

### Comparison prompt

```text
Use case: precise-object-edit.
Asset type: corrected voxel enemy concept and explicit player scale comparison for VOXELSTRIKE.
Input image 1 is the EDIT TARGET: previous Husk design. Its huge fists, thick limb blocks, wide torso and giant raised back made an ordinary enemy look like a boss. Revise that enemy into a lean, slightly shorter ordinary melee hunter while preserving rust-red coloring, dark face inset, one amber eye slit, low forward head and simple cuboid construction.
Input image 2 is a CHARACTER IDENTITY REFERENCE: the game's Facility Operative. Preserve his steel armor, cyan visor, rectangular helmet, charcoal suit, compact backpack and proportions.
Create ONE new landscape sheet on a plain dark blue-gray backdrop, only TWO full body figures side by side. Operative on LEFT, revised Husk on RIGHT. SAME orthographic camera, same depth and exactly SAME floor baseline, neutral standing/resting pose, identical lighting and pixel density. No enlarged hero render, no inset, no attack poses. Keep ample separation so silhouettes do not overlap. Figure scale is the point of this sheet.
Scale constraint: operative from soles to helmet top represents 1.76 world units. Husk from soles to its highest back/head point represents 1.64 units, exactly 93 percent of operative height. Neither is nearer the camera. Draw thin unobtrusive horizontal ruler ticks at their respective top heights and a shared baseline; height must actually match, not just the labels. Operative should look more substantial through armor; Husk is visibly leaner with less torso and arm bulk.
Husk revision: chest width about 0.50 world units, narrow waist, slim upper arms and forearms, dark SMALL claw mitts only around 0.18 wide each, one short rectangular claw tooth per hand. Hands no larger than operative gloves. Reduce shoulder blocks, shorten feet and remove the towering back block, replacing it with a shallow low back ridge. Maintain two ordinary slim legs and squared feet, two long thin arms, forward lean and low head. Not a giant, armored brute, tank, golem or bodybuilder. No heavy wrist cuffs, bolts, oversized fists, bone plating or bulky shoulder caps. Head is smaller than operative helmet. Torso and head remain inside a 0.76 wide by 1.64 tall gameplay body box; resting arms stay close. About 23 large cuboid meshes, maximum 24 including face and glow. All modeling achievable with primitive THREE.BoxGeometry, flat colors and basic shoulder/hip pivots. No detailed fingers, smooth anatomy, tiny voxel mosaics or microgeometry.
Text verbatim: heading "HUSK - SCALE REVISION"; label below operative "OPERATIVE 1.76"; label below Husk "HUSK 1.64". No other text.
Preserve coarse voxel rendering, sharp broad flat box faces, simple per-face shading and matte colors. Avoid dramatic perspective, low camera angles, cinematic bloom, photorealism, weapons, environments, additional figures, stat panels, watermarks and differing character magnifications.
```

### Hand refinement prompt

```text
Use case: precise-object-edit. Edit this scale-comparison sheet with ONE targeted correction: make both of the rust-red Husk's dark hands and wrist cuffs much smaller and lighter. Each hand must be only HALF its current width and HALF its current depth, and 65 percent of its current height. Each revised Husk hand must be no wider than a single charcoal glove on the Operative on the left. Keep just one tiny bone-colored claw tooth on each small hand. Reduce both dark wrist cuff blocks into narrow thin wrist bands matching the slim forearms; no large gauntlets. Hands stay attached at the same wrist positions and hang naturally. This is a lean ordinary enemy, its hands must not read as heavy fists. Keep absolutely everything else unchanged: the Operative, both figure heights, feet and baseline, camera, backdrop, labels, rulers, Husk head/torso/arms/legs colors and proportions. Do not change text. Preserve the existing voxel box rendering.
```

Generated with the built-in imagegen tool on 2026-10-18. Each sheet uses `sector4-vatborn.png` as a style reference for broad cuboids and flat faces. These are design mockups, not runtime models or textures. The exact generation prompts follow; implementation budgets and any simplifications are specified in [enemy-upgrades.md](enemy-upgrades.md).

## HUSK

Image: [enemy-upgrade-husk.png](enemy-upgrade-husk.png)

```text
Use case: stylized-concept.
Asset type: implementation-oriented enemy modeling and attack-pose mockup for VOXELSTRIKE, a procedural TypeScript/Three.js voxel FPS.
Input image is a STYLE REFERENCE: match the reference Vatborn's extremely simple large cuboids, broad flat colored faces, dark blue-gray studio background and clear modeling-sheet presentation. It does not supply anatomy for the other enemy types.
Create ONE landscape concept sheet for ONE enemy. Large full-body front three-quarter resting view on the left; same model, same scale, smaller front three-quarter WINDUP pose upper right; smaller RECOVERY pose lower right. All figures completely visible. Minimal bitmap labels only: enemy name, "WINDUP", "RECOVERY". No paragraphs, statistics, HUD, guns, additional characters, watermark or decorative background. Subtle hard floor shadows. Models must be directly reproducible with THREE.BoxGeometry meshes parented to simple THREE.Group pivots. Broad square faces and coarse pixel edges, limited 6-7 flat colors, readable at 240-line resolution. No smooth sculpture, tiny voxel mosaics, gradients, rounded anatomy, spheres, cylinders, microgeometry, intricate fingers, particles hiding the model, glossy materials, glowing fog or cinematic bloom. Glow is one flat bright face with dark rim, no aura. Rest, windup and recovery must use EXACTLY the same part inventory and body proportions. Strong silhouettes and joint movement matter more than added surface detail.

Enemy title (verbatim): "HUSK".
Design and attack poses: Improve the existing fast rust-red melee Husk without turning it into an armored soldier or Brute. Tall narrow hunched biped, two legs with squared dark feet, two long thin segmented arms ending in broad dark rectangular claw mitts with just one short flat block tooth per hand, narrow waist, rust-orange chest leaning forward, small low forward head with a charcoal rectangular face mask and single narrow amber eye slit. One broad dark rust collar and one simple raised back slab sharpen the hunch. Keep the shoulders narrow and the hands a little bigger than the old model. No horns, guns, external machinery, giant armor or tiny teeth. At most 24 LARGE cuboids including all eye/face details. Muted rust orange, dark rust brown, charcoal, bone tooth, amber. WINDUP: planted feet, torso crouches, head pulls back, both long arms draw backward and eye brightens before a short straight lunge. RECOVERY: same creature leaning forward after a missed claw strike, arms low and torso clearly extended, feet still planted. No jumping extra limbs.
```

## ARC SENTINEL

Image: [enemy-upgrade-sentinel.png](enemy-upgrade-sentinel.png)

```text
Use case: stylized-concept.
Asset type: implementation-oriented enemy modeling and attack-pose mockup for VOXELSTRIKE, a procedural TypeScript/Three.js voxel FPS.
Input image is a STYLE REFERENCE: match the reference Vatborn's extremely simple large cuboids, broad flat colored faces, dark blue-gray studio background and clear modeling-sheet presentation. It does not supply anatomy for the other enemy types.
Create ONE landscape concept sheet for ONE enemy. Large full-body front three-quarter resting view on the left; same model, same scale, smaller front three-quarter WINDUP pose upper right; smaller RECOVERY pose lower right. All figures completely visible. Minimal bitmap labels only: enemy name, "WINDUP", "RECOVERY". No paragraphs, statistics, HUD, guns, additional characters, watermark or decorative background. Subtle hard floor shadows. Models must be directly reproducible with THREE.BoxGeometry meshes parented to simple THREE.Group pivots. Broad square faces and coarse pixel edges, limited 6-7 flat colors, readable at 240-line resolution. No smooth sculpture, tiny voxel mosaics, gradients, rounded anatomy, spheres, cylinders, microgeometry, intricate fingers, particles hiding the model, glossy materials, glowing fog or cinematic bloom. Glow is one flat bright face with dark rim, no aura. Rest, windup and recovery must use EXACTLY the same part inventory and body proportions. Strong silhouettes and joint movement matter more than added surface detail.

Enemy title (verbatim): "ARC SENTINEL".
Design and attack poses: Improve the existing small hovering teal drone. A compact rectangular blue-gray body, charcoal front bezel with ONE broad rectangular cyan optic and ONE vertical dark rectangular pupil. Exactly FOUR thick rectangular paddle fins, one mounted on each side around the same body, plus a simple dark top cap and ONE square bright cyan emitter block on the underside. Add exactly two sliding rectangular side shutter blocks around the front optic. A total maximum of 16 LARGE cuboids. No legs, humanoid arms, guns on appendages, antenna forests, round rotors, thin blades or energy rings. Hover a little above the studio floor. Muted steel teal, charcoal, pale steel, cyan highlights. WINDUP: same FOUR fins extend outwards and turn edge-up, two face shutters slide outward and the single optic becomes a brighter cyan rectangle; body held level, emitter aimed forward. RECOVERY: same FOUR fins retract close and face shutters partly close, optic dims. Maintain fin count and single optic in all three views. No extra projectiles needed.
```

## TICKER

Image: [enemy-upgrade-ticker.png](enemy-upgrade-ticker.png)

```text
Use case: stylized-concept.
Asset type: implementation-oriented enemy modeling and attack-pose mockup for VOXELSTRIKE, a procedural TypeScript/Three.js voxel FPS.
Input image is a STYLE REFERENCE: match the reference Vatborn's extremely simple large cuboids, broad flat colored faces, dark blue-gray studio background and clear modeling-sheet presentation. It does not supply anatomy for the other enemy types.
Create ONE landscape concept sheet for ONE enemy. Large full-body front three-quarter resting view on the left; same model, same scale, smaller front three-quarter WINDUP pose upper right; smaller RECOVERY pose lower right. All figures completely visible. Minimal bitmap labels only: enemy name, "WINDUP", "RECOVERY". No paragraphs, statistics, HUD, guns, additional characters, watermark or decorative background. Subtle hard floor shadows. Models must be directly reproducible with THREE.BoxGeometry meshes parented to simple THREE.Group pivots. Broad square faces and coarse pixel edges, limited 6-7 flat colors, readable at 240-line resolution. No smooth sculpture, tiny voxel mosaics, gradients, rounded anatomy, spheres, cylinders, microgeometry, intricate fingers, particles hiding the model, glossy materials, glowing fog or cinematic bloom. Glow is one flat bright face with dark rim, no aura. Rest, windup and recovery must use EXACTLY the same part inventory and body proportions. Strong silhouettes and joint movement matter more than added surface detail.

Enemy title (verbatim): "TICKER".
Design and attack poses: Improve the existing small six-legged explosive crawler. A squat broad mustard-yellow rectangular shell with TWO thick charcoal hazard bands on top, one charcoal rectangular front bezel and one obvious flat amber core panel. Exactly SIX dark simple block legs, three each side, made from one stout angled box per leg. Two large rectangular hinged lid flaps form the top shell, opening from a central seam. Compact cuboid amber battery underneath lids, body very low to floor. Maximum 18 LARGE cuboids, six legs count toward the budget. No spider hair, mandibles, antennae, smooth beetle shell, tiny rivets, wheels or guns. Yellow marks actual explosive hazard; palette mustard yellow, charcoal, dark steel, amber. WINDUP: same SIX legs spread and brace, both shell lids hinge up to expose bright amber battery; no extra limbs, fixed location before self-detonation. For this enemy replace the lower-right label RECOVERY with DETONATION and show only a small separated cloud of 8-10 large amber and charcoal cube debris pieces where the crawler stood, no intact second enemy in that vignette. Small core brighter and lids visibly open are the warning. Keep intact models absolutely simple.
```

## BRUTE

Image: [enemy-upgrade-brute.png](enemy-upgrade-brute.png)

```text
Use case: stylized-concept.
Asset type: implementation-oriented enemy modeling and attack-pose mockup for VOXELSTRIKE, a procedural TypeScript/Three.js voxel FPS.
Input image is a STYLE REFERENCE: match the reference Vatborn's extremely simple large cuboids, broad flat colored faces, dark blue-gray studio background and clear modeling-sheet presentation. It does not supply anatomy for the other enemy types.
Create ONE landscape concept sheet for ONE enemy. Large full-body front three-quarter resting view on the left; same model, same scale, smaller front three-quarter WINDUP pose upper right; smaller RECOVERY pose lower right. All figures completely visible. Minimal bitmap labels only: enemy name, "WINDUP", "RECOVERY". No paragraphs, statistics, HUD, guns, additional characters, watermark or decorative background. Subtle hard floor shadows. Models must be directly reproducible with THREE.BoxGeometry meshes parented to simple THREE.Group pivots. Broad square faces and coarse pixel edges, limited 6-7 flat colors, readable at 240-line resolution. No smooth sculpture, tiny voxel mosaics, gradients, rounded anatomy, spheres, cylinders, microgeometry, intricate fingers, particles hiding the model, glossy materials, glowing fog or cinematic bloom. Glow is one flat bright face with dark rim, no aura. Rest, windup and recovery must use EXACTLY the same part inventory and body proportions. Strong silhouettes and joint movement matter more than added surface detail.

Enemy title (verbatim): "BRUTE".
Design and attack poses: Improve the existing arena Brute without replacing its identity. Massive broad rust-brown humanoid biped, 1.3 times Husk height and substantially broader, thick box legs with dark squared feet, huge low-hanging thick forearms and rectangular fists, two pale rectangular bone shoulder slabs, ONE broad pale chest slab, short blunt low-set head with rectangular heavy brow and a single narrow orange eye slot. Exactly TWO short square vertical tusks at jaw. Two broad back ridge blocks make a simple hunched silhouette; no spike forest or segmented detailed plating. Maximum 32 LARGE cuboids. Colors rust red, deep rust brown, charcoal, bone ochre, orange eye. Bone panels are visual identity, not invulnerable shield armor, no glowing chest weak point. WINDUP: feet wide, shoulders braced, torso rears back slightly and head lowers between the pale shoulder slabs, fists drawn back for a straight shoulder charge. RECOVERY: same brute bent forward with head down and one hand against the ground after a wall collision, posture dazed; do not add a wall that hides its anatomy. Exactly two arms and two legs in all views.
```

## VATBORN

Image: [enemy-upgrade-vatborn.png](enemy-upgrade-vatborn.png)

```text
Use case: stylized-concept.
Asset type: implementation-oriented enemy modeling and attack-pose mockup for VOXELSTRIKE, a procedural TypeScript/Three.js voxel FPS.
Input image is a STYLE REFERENCE: match the reference Vatborn's extremely simple large cuboids, broad flat colored faces, dark blue-gray studio background and clear modeling-sheet presentation. It does not supply anatomy for the other enemy types.
Create ONE landscape concept sheet for ONE enemy. Large full-body front three-quarter resting view on the left; same model, same scale, smaller front three-quarter WINDUP pose upper right; smaller RECOVERY pose lower right. All figures completely visible. Minimal bitmap labels only: enemy name, "WINDUP", "RECOVERY". No paragraphs, statistics, HUD, guns, additional characters, watermark or decorative background. Subtle hard floor shadows. Models must be directly reproducible with THREE.BoxGeometry meshes parented to simple THREE.Group pivots. Broad square faces and coarse pixel edges, limited 6-7 flat colors, readable at 240-line resolution. No smooth sculpture, tiny voxel mosaics, gradients, rounded anatomy, spheres, cylinders, microgeometry, intricate fingers, particles hiding the model, glossy materials, glowing fog or cinematic bloom. Glow is one flat bright face with dark rim, no aura. Rest, windup and recovery must use EXACTLY the same part inventory and body proportions. Strong silhouettes and joint movement matter more than added surface detail.

Enemy title (verbatim): "VATBORN".
Design and attack poses: Refine the actual reference Vatborn while preserving its defining exact identity: pale gray-beige hunched adult specimen with olive stains, narrow torso with one dark horizontal chest restraint and one small dull lime rectangular specimen mark, blunt low forward head with charcoal face inset and narrow amber eye. ONE enormous RIGHT shoulder, forearm and very large charcoal block fist hanging almost to the ground, a dark wrist restraint cuff and ONE short broken square bolt. The monster's RIGHT is VIEWER LEFT in the front resting view. Its LEFT arm stays thin and ends in a tiny simple block hand. Two ordinary legs with olive shin blocks and dark rectangular boots, simple square back hump. Improve silhouette with a more deliberate uneven hunch and an obviously thick club wrist; do not add extra armor, power cores, organic tendrils, claws, a second oversized arm or complex fingers. At most 34 LARGE cuboids, 7 flat colors. WINDUP: same creature plants feet, twists torso and raises only its enormous RIGHT club arm for one heavy downward swing; thin LEFT arm stays tucked. RECOVERY: same RIGHT fist down near floor, upper body extended and slow to recover. Consistent laterality and part count in every view.
```
