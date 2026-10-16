# Facility Operative — main character concept

Concept sheet: `main-character-facility-operative.png`. Created with the built-in imagegen tool using the campaign screenshot `scripts/shots/2-started.png` as a style reference. No gameplay or avatar code was changed.

A sealed facility-response operative, with a horizontal cyan visor, broad steel chest plate and compact rectangular power pack. Identity comes from silhouette and the visor, readable at the game's 240-line resolution.

## Construction specification

This specification takes precedence over illustrative details in the generated sheet. Use exactly 26 un-beveled BoxGeometry meshes; drawn surface scuffs are optional texture/color marks, not geometry. Do not reproduce the image's occasional stepped boot edges, extra seam geometry or spine sticking above the shoulder. The backpack spine sits flat against the backpack.

Units match the world. Y is up, front is -Z, feet rest at Y=0. Total height is 1.76, matching the current player's collider height. The table uses floor-relative model coordinates; when parenting under a root at the player collider center, subtract 0.88 from every Y position. Left/right pairs use opposite X values.

| Part | Count | Size W × H × D | Center X, Y, Z | Material |
|---|---:|---|---|---|
| Helmet | 1 | .30 × .28 × .30 | 0, 1.62, 0 | light steel |
| Visor | 1 | .25 × .08 × .02 | 0, 1.63, -.155 | cyan |
| Respirator | 1 | .18 × .07 × .05 | 0, 1.535, -.17 | charcoal |
| Torso | 1 | .46 × .46 × .28 | 0, 1.20, 0 | steel |
| Chest plate | 1 | .40 × .24 × .06 | 0, 1.28, -.16 | dark steel |
| Pelvis | 1 | .36 × .18 × .24 | 0, .88, 0 | steel |
| Belt | 1 | .38 × .06 × .26 | 0, .975, 0 | charcoal |
| Backpack | 1 | .30 × .34 × .12 | 0, 1.23, .19 | dark steel |
| Backpack spine | 1 | .08 × .28 × .04 | 0, 1.23, .26 | light steel |
| Shoulders | 2 | .16 × .14 × .30 | ±.31, 1.36, 0 | light steel |
| Upper arms | 2 | .14 × .23 × .16 | ±.31, 1.185, 0 | charcoal |
| Forearms | 2 | .16 × .24 × .18 | ±.31, .95, 0 | steel |
| Hands | 2 | .16 × .14 × .18 | ±.31, .765, 0 | charcoal |
| Thighs | 2 | .16 × .30 × .18 | ±.105, .65, 0 | dark steel |
| Shins | 2 | .16 × .32 × .18 | ±.105, .35, 0 | dark steel |
| Boots | 2 | .19 × .20 × .28 | ±.105, .10, -.04 | charcoal |
| Knee plates | 2 | .15 × .10 × .04 | ±.105, .51, -.10 | light steel |
| Chest status light | 1 | .08 × .025 × .015 | -.105, 1.32, -.195 | cyan |

Palette: steel `#566076`, light steel `#707b8d`, dark steel `#39404f`, charcoal `#252a34`, cyan `#55e0ff`.

## Rig and rendering

Use nested THREE.Group pivots at the neck (0, 1.47, 0), shoulders (±.31, 1.36, 0), elbows (±.31, 1.07, 0), hips (±.105, .80, 0), and knees (±.105, .51, 0). Convert table centers into local offsets when attaching to joint groups. Attach shoulder caps to upper arms, gloves to forearms, knee plates and boots to shins, visor and respirator to helmet, and backpack/chest/belt to torso. Pelvis stays on the root. Walking rotates hips and shoulders in opposition; knees bend and head follows aim. A weapon can use a child socket on the right hand. No skinning or imported meshes are required.

Share box geometry and palette materials where appropriate. Use the existing game color-space convention and per-face shading from weapon parts; visor/status light skip room-light tint. Physical collision remains the existing player collider rather than per-box collision. Armor and animation can protrude outside that collider, as with the current avatar.

In first person only the forearms, gloves and equipped weapon need rendering. The complete rig serves co-op, menus and character previews.

## Final image generation prompt

Use case: stylized-concept
Asset type: main playable character design sheet for VOXELSTRIKE, intended to be recreated procedurally in TypeScript and Three.js.
Primary request: Design a distinctive sealed facility-response operative for this dark industrial retro voxel FPS. This is a practical construction reference, every visible physical feature must be achievable with the exact 26 rectangular boxes below. The character should feel like a tough industrial rescue/security operative in a dangerous underground facility, original and understated.
Input image: the actual game screenshot is a style reference only. Match the chunky geometry, steel palette, hard pixel surfaces and box-model language; do not include its environment or HUD.
Composition: landscape character reference sheet on a plain dark gray background. Show three equally sized complete orthographic views FRONT, SIDE, BACK in the same relaxed neutral standing pose, feet aligned, arms slightly away from torso. At right add a larger three-quarter view of the exact same model, no weapon, no extra equipment. All four views must show identical geometry, color and proportions. Clean readable silhouette, flat per-face lighting, no perspective in the orthographic views.
Character: full enclosed cuboid helmet with a broad single inset cyan horizontal visor and a dark rectangular lower-face respirator block; compact broad chest plate; rectangular shoulder caps; dark flexible-looking rectangular limbs; chunky rectangular gloves, knees and boots; compact rectangular backpack with one narrow vertical spine. No exposed face or skin, no gender-specific anatomy. Cyan visor and one small rectangular cyan chest status light are the only luminous details.
Construction limit EXACTLY 26 visible boxes, no additional geometry: helmet 1, visor 1, respirator 1, torso 1, chest plate 1, pelvis 1, belt 1, backpack 1, backpack spine 1, shoulders 2, upper arms 2, forearms 2, hands 2, thighs 2, shins 2, boots 2, knee plates 2, chest status light 1. These are solid rectangular cuboids with flat faces, no bevels, curves, cylinders, hoses, straps, fingers, antennae, individual bolts, pouches or floating components. Armor plates overlap the base boxes slightly.
Proportions: total height 1.76 units, helmet .30 wide x .28 tall x .30 deep; torso .46 x .46 x .28; chest plate .40 x .24 x .06; shoulders .16 x .14 x .30 each; upper arms .14 x .23 x .16 each; forearms .16 x .24 x .18 each; hands .16 x .14 x .18 each; pelvis .36 x .18 x .24; belt .38 x .06 x .26; thighs .16 x .30 x .18 each; shins .16 x .32 x .18 each; boots .19 x .20 x .28 each; knees .15 x .10 x .04 each; backpack .30 x .34 x .12; backpack spine .08 x .28 x .04; visor .25 x .08 x .02; respirator .18 x .07 x .05; chest light .08 x .025 x .015.
Palette: main armor steel #566076, helmet/shoulders lighter steel #707b8d, chest/backpack dark steel #39404f, undersuit/gloves/boots charcoal #252a34, cyan visor/status #55e0ff. Use a few broad pixel scuffs as surface colors only. No tiny painted details. No decorative hazard yellow, key red or exit green.
Rendering: crisp box-modeled 3D voxel aesthetic, hard edges, modest low-resolution pixel clusters, matte faces with baked-style face shading. Simple neutral studio lighting to show every part clearly, no bloom.
Text: small heading "FACILITY OPERATIVE", view labels "FRONT", "SIDE", "BACK", "3/4", and short footer "26 BOXES / RIGID JOINTS". No technical dimension annotations.
Avoid: realistic humans, rounded armor, beveled edges, smooth anatomy, soft cloth, fabric folds, cables, intricate surface greebles, photorealism, weapons, dramatic action poses, environmental scenery, logos, watermarks, any physical components beyond the exact box list.

