# Facility Survivor — unarmored human protagonist

Unarmored alternative to the Facility Operative. An adult facility worker with medium tan skin, short dark hair, slate-blue short-sleeved shirt, charcoal trousers, a brown belt and dark shoes. Visible human face, bare forearms and bare hands. No armor or equipment.

Image generation was attempted with the built-in imagegen tool but returned HTTP 403 Forbidden; no concept image was produced. The specification below is a code-modelable design, not a verified image match.

## Construction: 30 boxes

Use plain THREE.BoxGeometry and rigid THREE.Group joints. No bevels, skinning, external meshes or detailed anatomy. Mouth and any clothing wear are optional painted pixels. Model faces -Z; Y is up. Units match the game. Centers are relative to feet at Y=0; subtract .88 from Y to attach at the existing player's collider center. Total height 1.76 units. Paired parts mirror X.

| Part | Count | W × H × D | Center X, Y, Z | Color |
|---|---:|---|---|---|
| Head | 1 | .28 × .26 × .26 | 0, 1.60, 0 | skin |
| Neck | 1 | .12 × .10 × .12 | 0, 1.44, 0 | skin |
| Hair cap | 1 | .29 × .03 × .28 | 0, 1.745, 0 | hair |
| Hair back | 1 | .29 × .18 × .025 | 0, 1.64, .13 | hair |
| Hair sides | 2 | .025 × .10 × .24 | ±.14, 1.68, .005 | hair |
| Eyes | 2 | .035 × .025 × .008 | ±.065, 1.62, -.132 | hair |
| Eyebrows | 2 | .045 × .012 × .008 | ±.065, 1.66, -.132 | hair |
| Nose | 1 | .04 × .055 × .035 | 0, 1.585, -.14 | skin |
| Torso/shirt | 1 | .40 × .44 × .24 | 0, 1.17, 0 | shirt |
| Sleeve caps | 2 | .14 × .14 × .24 | ±.24, 1.32, 0 | shirt |
| Upper arms | 2 | .12 × .20 × .14 | ±.25, 1.16, 0 | skin |
| Forearms | 2 | .12 × .22 × .14 | ±.25, .96, 0 | skin |
| Hands | 2 | .13 × .14 × .15 | ±.25, .79, 0 | skin |
| Pelvis | 1 | .34 × .16 × .22 | 0, .87, 0 | trousers |
| Thighs | 2 | .15 × .32 × .18 | ±.095, .64, 0 | trousers |
| Shins | 2 | .14 × .30 × .17 | ±.095, .33, 0 | trousers |
| Shoes | 2 | .17 × .18 × .26 | ±.095, .09, -.035 | shoes |
| Belt | 1 | .35 × .045 × .23 | 0, .955, 0 | belt |
| Buckle | 1 | .055 × .035 × .015 | 0, .955, -.12 | steel |
| Flat shirt pocket | 1 | .09 × .09 × .008 | -.095, 1.28, -.123 | pocket |

Skin #b9825f; hair/eyes #352b29; shirt #566076; trousers #39404f; shoes #252a34; belt #5b4033; buckle #707b8d; pocket #4a5366. These skin and hair choices are a proposed appearance and can be changed independently of geometry.

## Animation and rendering

Use pivots at neck (0, 1.44, 0), shoulders (±.25, 1.36, 0), elbows (±.25, 1.06, 0), hips (±.095, .80, 0), knees (±.095, .48, 0). Convert table centers to local offsets beneath pivots. Face/hair follow head; sleeves follow upper arms; hands follow forearms; shoes follow shins. Chest pocket follows torso; belt/buckle follow pelvis.

Walk by rotating opposite arms and legs, bend knees for steps, and rotate head with aim. Add a weapon socket to the right hand. Keep the existing player collider. Share geometry and palette materials where practical. Apply the game's per-face shading and raw-color convention; no luminous body parts. For first person use the matching bare forearms/hands with existing weapons.

## Final image generation prompt

Use case: stylized-concept
Asset type: main character design sheet for VOXELSTRIKE, a procedural retro voxel FPS.
Primary request: Design an unarmored HUMAN protagonist with a visible face, natural skin, short hair, a short-sleeved work shirt, plain work trousers and shoes. A capable adult facility worker and survivor. Human and approachable, practical rather than a superhero. No armored suit, helmet, mask, respirator, gloves, backpack or glowing body parts.
Input image: previous facility operative sheet is a reference for presentation and simple cuboid modeling only. Replace the armored character completely with this human design.
Composition: wide landscape sheet on a neutral dark background, full-body orthographic FRONT, SIDE and BACK views aligned at the feet, plus a larger three-quarter view of the same person. Same consistent face, haircut, clothes, proportions in every view. Relaxed neutral stance, arms slightly away from torso, empty hands.
Style: chunky 3D box-modeled human with a slightly oversized cuboid head, simple readable facial features, hard pixel clusters and flat face shading suited to a 240-line retro game. Not a realistic human and not a detailed voxel sculpture. Every physical component is a single plain cuboid, with no bevels or curves.
Appearance: warm medium tan skin #b9825f, short dark brown hair #352b29, slate blue short-sleeved shirt #566076 with one flat chest pocket, charcoal trousers #39404f, dark plain shoes #252a34 and a brown belt. Bare forearms and simple mitten-shaped cuboid bare hands. Two small dark square eyes, two flat eyebrows, a small cuboid nose; a tiny mouth can be a painted pixel line. Hair is a flat cap, a back panel and two simple side panels, no sculpted strands. No ears required. Shirt tucked into trousers; shirt should read as everyday fabric through color blocking, not armor. No buttons or seam geometry.
Construction: EXACTLY 30 simple rectangular cuboids: head 1, neck 1, hair cap 1, hair back 1, hair sides 2, eyes 2, eyebrows 2, nose 1, torso/shirt 1, sleeve caps 2, upper arms 2, forearms 2, bare hands 2, pelvis/trousers 1, thighs 2, shins 2, shoes 2, belt 1, belt buckle 1, flat shirt pocket 1. No other mesh parts. Small details may be painted pixels instead. Arms and legs are rigid segments with pivot joints, no skinned mesh. Plain solid cuboids for shoes and hands, no soles, fingers, toes or laces as geometry.
Proportions: total height 1.76 units; head .28 wide x .26 tall x .26 deep; torso .40 wide x .44 tall x .24 deep. Shoulders .60 units across, normal adult compact build, no exaggerated muscle anatomy. Keep limb thickness sufficient to read at low resolution.
Lighting: neutral studio lighting, crisp flat faces, broad subtle pixel wear on clothes only. No shiny plastic, bloom or glow.
Text: "FACILITY SURVIVOR" at top; view labels "FRONT", "SIDE", "BACK", "3/4"; footer "30 BOXES / RIGID JOINTS".
Avoid: armor, protective suit, bodysuit, weapons, military gear, futuristic equipment, photorealistic faces, rounded anatomical meshes, realistic cloth folds, complex hair, beveled geometry, additional accessory meshes, logos or watermarks.

