# Weapon-specific skin concepts

Generated with the built-in image_gen tool on 2026-10-18.
Four comparison sheets, four unique concepts per weapon (16 new skin concepts).
These are cosmetic art proposals, not installed skins or exact gameplay renders.
The earlier [Scattergun concepts](scattergun-skins-v1.png) remain a separate set.

## Comparison sheets

| Weapon | Image | Exclusive skin concepts |
| --- | --- | --- |
| Sidearm | [Open sheet](sidearm-skins-v1.png) | CERAMIC MINT, COPPERHEAD, BLUE STEEL, ROSE QUARTZ |
| Ripper SMG | [Open sheet](ripper-skins-v1.png) | CIRCUIT RUNNER, METRO RUSH, TIGER BYTE, CARBON PULSE |
| Thumper launcher | [Open sheet](thumper-skins-v1.png) | DEMOLITION, RUST TITAN, ORBITAL, SIEGE ENGINE |
| Arc Caster | [Open sheet](arc-caster-skins-v1.png) | AURORA, LAB PROTOTYPE, SOLAR ARRAY, VOID SIGNAL |

## Geometry references

Before generation, each existing procedural weapon was rendered in isolation
using `buildWeaponModel()` from `src/weapons/weapons.ts` in the local browser.
These are reference captures, not new game assets:

- [Sidearm model](model-references/pistol.png)
- [Ripper SMG model](model-references/smg.png)
- [Thumper launcher model](model-references/rocket.png)
- [Arc Caster model](model-references/arc.png)

Each generator call received that weapon's actual model capture as its geometry
reference and the earlier Scattergun sheet as presentation guidance only.

Keep functional identity readable when implementing: the pistol's green sights,
the SMG's red-dot sight, the launcher's green ready LED and square end caps,
and the Arc Caster's four cyan coils, twin prongs and cyan energy window.
All proposals retain those existing signal colors.

## Implementation direction

Reuse the current weapon geometry, moving parts and weapon behavior. Broad
palette changes can be applied before the existing model bake. Large stripes,
stepped marks and square wear patterns need explicit face coloring or a small
procedural texture; applying one material tint will not reproduce them.
Keep cosmetic patterns separate from functional indicators and preserve the
project's merged-mesh budget. Review in the actual first-person pose and
low-resolution renderer before final approval.

No skin selection, unlock system, gameplay effects or statistics were added.

## Final prompt set

Each final prompt consisted of the shared text below followed by the matching
weapon-specific text. Image 1 was the weapon's model reference capture; image 2
was `reference/weapon-skins/scattergun-skins-v1.png`.

### Shared prompt

```text
Use case: stylized-concept.
Asset type: a finished cosmetic weapon-skin comparison sheet for VOXELSTRIKE, original retro voxel FPS. One landscape 3:2 image around 1536 x 1024, four large cards in a 2-column by 2-row grid.
Input image 1: an isolated render of the ACTUAL weapon built by the game's procedural code. This is the strict geometry, silhouette, proportions and identifying-parts reference. Keep it recognizable and equally simple, just add different paint finishes.
Input image 2: the earlier Scattergun skin comparison sheet is ONLY the presentation/style reference: dark slate panels, readable block labels, subtle dividers, coarse pixel paint, consistent views. Do not copy its shotgun geometry, paint designs, skin names or six-cell layout.
Across all FOUR cards: the exact SAME weapon model, scale and three-quarter side view, muzzle upper-left and rear lower-right. Show the complete gun without cropping. Same even upper-left light and baked per-face shading across variants, large readable color fields, hard rectilinear edges, limited pixel surface wear. Voxel game art, not realistic product photography. Main forms must remain large cuboids matching input 1; paint patterns can use simple procedural pixel textures.
Change only surface paint and permitted material tint. No new attachments, scopes, straps, hands, arms, characters, added armor, floating particles, muzzle flash, scene background, detachable props or new weapon parts. No mirror metal, complex shaders, smooth cylinders, ornate sculpting, heavy black contour outlines or tiny unreadable engraving. Stock, grips, functional ports and barrel openings stay identifiable.
Presentation: four equally sized dark slate cards with thin steel dividers and ample margins. One small readable top heading naming the weapon, and EXACT skin names centered below each gun, high-contrast uppercase block lettering. No price, rarity, stats, UI buttons, extra labels or watermark. Opaque background. Deliver this ONE four-skin comparison sheet.
```

### Sidearm

```text
Weapon: SIDEARM. Top heading exactly "SIDEARM".
Strict model: reference 1's compact chunky box pistol: long rectangular slide, modest underframe, short angled rectangular grip, tiny trigger/guard, two rear sight posts and one front post with green sight dots, visible top ejection port. No revolver cylinder, optic, long suppressor, added magazine or shoulder stock. Retain compact pistol proportions and all green sight dots. All four slide/grip shapes identical.
Top-left "CERAMIC MINT": porcelain off-white slide with ONE broad seafoam mint rectangular bracket motif at the rear, charcoal underframe, pale mint grip panel framed in dark gray. Fresh clean matte ceramic paint, subtle large square scuffs.
Top-right "COPPERHEAD": warm flat copper-orange slide, dark espresso frame and grip; three broad staggered dark brown rectangular scale-like patches along the slide and a copper heel band. Copper is opaque paint with no shiny metal reflection.
Bottom-left "BLUE STEEL": rich indigo-navy slide and grip inset, cool light steel-gray frame, one crisp thin-but-readable silver stripe lengthwise on the slide, a bold pale-blue grip corner block. Reserved precise premium finish.
Bottom-right "ROSE QUARTZ": dusty rose-pink slide, warm ivory frame, deep plum grip, a sparse stepped pale-pink diamond motif on the slide and ivory rectangular heel inset. Flat pixel pattern with no actual crystal geometry. Energetic distinct colorway.
```

### Ripper SMG

```text
Weapon: RIPPER SMG. Top heading exactly "RIPPER SMG".
Strict model: reference 1's long compact rectangular receiver, short square muzzle extending from a ventilated box shroud, three rectangular shroud vents, simple top rail and SINGLE tiny box red-dot sight, slanted long stick magazine, short foregrip, rear pistol grip and short rectangular stock stub. No shotgun pump, drums, sniper scope or long rifle stock. Preserve the red aiming dot and all geometry across the four.
Top-left "CIRCUIT RUNNER": charcoal receiver with TWO wide acid-lime right-angle circuit-track paint lines, dark gray shroud and grip, lime magazine base and short lime stock cap. Paint only, no glowing wires or electronics added.
Top-right "METRO RUSH": saturated cobalt-blue receiver, bright cyan shroud panels, broad offset magenta rectangular speed bands on receiver and magazine, charcoal grips and stock. Graphic urban transit and arcade racing energy, not logos.
Bottom-left "TIGER BYTE": vivid orange receiver and shroud, coarse charcoal stepped diagonal tiger bands, muted cream magazine panel, dark grip and stock. Only broad pixel stripes, no animal head or model alterations.
Bottom-right "CARBON PULSE": very dark violet and gunmetal receiver, matte dark purple magazine and stock, ONE broad coral-red stepped pulse-wave paint mark spanning the receiver side, coral magazine heel. Large simplified pattern rather than dense carbon-fiber noise.
```

### Thumper launcher

```text
Weapon: THUMPER LAUNCHER. Top heading exactly "THUMPER".
Strict model: reference 1's LONG hollow rectangular launcher body, large square front muzzle collar, square rear exhaust cap with black opening, two short underside grips, one tiny top box sight and small GREEN ready LED on the rear cap. Four simple painted bands near the muzzle. All box shapes identical; this is NOT a cylindrical bazooka, assault rifle, shotgun or missile with fins. Keep the green sight/LED, square muzzle and rear exhaust readable. No stock or external rocket projectile.
Top-left "DEMOLITION": chalk-white upper launcher casing, bold safety-orange lower side panel, black grips and muzzle collar, two broad black angular broken-chevron paint marks across the middle. Worksite machinery identity, no yellow hazard scheme copied from shotgun.
Top-right "RUST TITAN": heavily weathered burnt-sienna and dark brown flat casing paint, muted olive structural cap colors, a few large square gray worn-metal paint chips, one muted cream rectangular side panel. Stylized big pixel wear, not photorealistic corrosion or actual damage.
Bottom-left "ORBITAL": clean warm-white launcher casing, midnight navy front/rear collars and lower grips, cobalt rectangular panel blocks and ONE orange alignment stripe along the upper side. Space-program cargo equipment mood without emblems, numbers, rockets or scenery.
Bottom-right "SIEGE ENGINE": dark gunmetal casing, oxblood-red end collars and central panel, flat bronze three-rung ladder-like side paint marks, charcoal underside grips. Heavy fortified industrial finish with only large opaque paint blocks, no rivets or new armor geometry.
```

### Arc Caster

```text
Weapon: ARC CASTER. Top heading exactly "ARC CASTER".
Strict model: reference 1's compact rectangular rear receiver, modest top fin, FOUR large square cyan collar coils spaced along a slim central core toward the front, two slim parallel square muzzle prongs, box energy-cell window on the receiver's left side, short angled pistol grip, flat rear cap. No shoulder stock, scope, drum, pipes, cables or added machinery. Preserve EXACTLY four coils, two front prongs, all geometry, and the existing cyan-white color of all coils/core/tips and cyan side energy window across every skin. Only the casing, coil separator faces, prong housings, grip and non-energy paint panels change.
Top-left "AURORA": midnight-blue receiver and grip, large stepped teal and muted purple bands sweeping across side and rear casing, cool gray separator faces, existing bright cyan coils remain unchanged. Aurora-inspired flat pixel pattern, no sky effects.
Top-right "LAB PROTOTYPE": off-white/light-gray receiver and cell housing, cobalt-blue broad calibration rectangles on side casing, dark graphite grip and rear cap, tiny warm-orange paint block on top fin. Clean experimental equipment, no numbers or extra components.
Bottom-left "SOLAR ARRAY": warm cream receiver, matte copper-brown frame and prong housings, dark chocolate grip, ochre side casing rectangle with a coarse 2-by-3 dark square grid printed flat on it. Existing cyan coils contrast with the warm paint. No actual solar panel attachment or reflective gold.
Bottom-right "VOID SIGNAL": deep violet and charcoal receiver, bold hot-pink rectangular broken-signal bars on side and rear casing, pale lavender top fin edge, charcoal grip, unchanged cyan-white coils and cyan energy window. Graphic alien-frequency mood without alien anatomy, holograms or particles.
```


