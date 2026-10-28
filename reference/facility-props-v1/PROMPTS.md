# Image generation prompts

Generated 2026-10-28 with the built-in imagegen tool, opaque PNG output. One call per sheet; no CLI or external API runner.

## Source images and roles

1. [sector-monsters-v2/01-facility-entry-security.png](../sector-monsters-v2/01-facility-entry-security.png): page typography, navy presentation, chunky box forms.
2. [poki-sector2.png](../../scripts/shots/poki-sector2.png): actual Facility walls/floor, including gray-olive block panels and sparse dull rust.
3. For sheets 02 and 03 only, [01-entry.png](01-entry.png): page layout and rendering consistency. In the generation call this was the identical original file under the session's generated_images folder.

Each final prompt is **Common spec + its sector spec**. Sheets 02/03 additionally append **Layout continuity**. The following is the exact submitted text. The generated callout refined E5 width to 0.80 and R5 depth to 0.55; [PROPS.md](PROPS.md) adopts those final labels. Box recipes also consolidate illustration trim within the stated geometry budgets.

## Common spec

```text
Use case: stylized-concept
Asset type: VOXELSTRIKE production reference art only, one landscape prop reference sheet.
Input images: image 1 is the SECTOR MONSTERS / 01 style reference (navy page, cream chunky pixel headings, thin blue divider rules, chunky box-built forms); image 2 is the actual in-game Facility wall and floor reference. Match these roles, do not reproduce enemies, weapons, HUD or puzzle items.
Style: chunky cuboid voxel forms, plain boxes only, flat matte colours, hard per-face shading, no outlines on objects, no round meshes, no fine greebles, no gradients on surfaces, no glossy photoreal rendering. Sparse large pixel scuffs only on existing room walls. Room walls must be the game's one-block square gray-olive riveted steel tiles, a few dull rust patches, dark steel tile floor and low dark panel ceiling. Use steel #566076, dark steel #262c38, void #05060a, muted steel #8a94a8, cool off-white #cfd6e4/#f0f2f6; supporting cardboard #a47c4a only where specified.
Composition: landscape 1536x1024 or larger similar ratio. Navy #0d1c2b presentation background, cream pixel type, thin muted-blue rectangular borders. Header at top; a large dressed-room hero image occupies upper 53 percent, seen at human eye level slightly elevated, wide three-quarter perspective to show two walls and floor. Room has a clearly unobstructed open doorway and broad empty combat/walking floor. Below it eight isolated small 3/4 prop callouts arranged in exactly two rows of four bordered cells, each with its ID and short name, and W x D x H dimensions in blocks. Every listed prop appears clearly in the hero AND its own callout, with the same design. Big simple geometry, each prop only 5-20 plain boxes. No additional furniture or unlisted decorative objects. Wall/floor/ceiling are environment, not props.
Hard constraints: 1 block = 1 unit. All props against walls. Maximum ordinary prop depth 1.0, maximum big centerpiece depth 2.0, maximum overall height including mounts/steam 2.8. Never block doorways; keep 2 blocks free on either side of the opening and a broad clear lane through the room. No red, green, yellow or amber light anywhere. No amber wall nodes, glowing cable trails, secret cracks, keycards, exit signs, hazard stripes, wooden crates or red barrels. These props are indestructible dressing: cardboard boxes are small unbraced sealed cartons held on shelves, never wood or X-bracing. All glass is fully OPAQUE solid pale-blue lit slabs, no view through, no reflections/transparency. Lights are very restrained except explicitly specified broad heat apertures; no point-like objective nodes. No people or monsters.
```

## 01-entry.png — sector spec

```text
Primary request: sheet "FACILITY PROPS / 01" with subtitle "SECTOR 1 / FACILITY ENTRY". Recognisable office + storeroom + server room service suite, cool WHITE task lighting with cyan screens, not overall blue room wash. Make it feel inhabited through simple large useful forms, not clutter. Hero left office desk and paper board, middle shelves and file cabinet, right server and grille, doorway far back unobstructed. Eight callouts (exact labels and dimensions):
E1 WORK DESK — 1.80 x 0.90 x 1.55: low steel slab desk on two side supports, one large cyan monitor on thick stand and one dark keyboard slab. 9 boxes, no chair.
E2 NOTICE BOARD — 1.40 x 0.12 x 0.75: dull brown cork rectangle, four steel frame bars, three cream rectangular papers, no glow.
E3 FILE CABINET — 0.80 x 0.78 x 1.80: narrow steel housing, three broad drawer faces and three stout dark handles, square plinth; no glow.
E4 STORES SHELF — 1.80 x 0.90 x 2.40: four thin steel uprights, three thick horizontal shelves, five little plain CARDBOARD cartons with horizontal cream tape. No diagonal braces or X shapes.
E5 SERVER RACK — 0.90 x 0.95 x 2.60: dark tall housing and plinth, four broad inset server trays, cyan horizontal LED bars only, large upper cooling slot. No green/amber/red LEDs.
E6 INTERCOM — 0.35 x 0.18 x 0.65: compact gray wall unit, three dark speaker slots, one large steel push pad, no glowing button or status lamp.
E7 COOLING GRILLE — 1.20 x 0.18 x 0.65: thick frame and four chunky horizontal dark louvres, no fan circle, no glow.
E8 WHITE TASK LIGHT — 1.40 x 0.20 x 0.28: broad horizontal wall-mounted steel lamp, two end caps and an opaque cool white emitting panel, shallow dark hood. Repeated in hero for cool white light.
Footer small exact text "W x D x H / BLOCKS    WALL MOUNTED / CLEAR ROUTES    CYAN + WHITE ONLY".
```

## 02-security.png — sector spec

```text
Primary request: sheet "FACILITY PROPS / 02" with subtitle "SECTOR 2 / SECURITY FLOOR". Recognisable staffed checkpoint + guard booth + lockers, BLUE-WHITE light. Hero booth against back wall, lockers on left, monitor console on right; open circulation floor and visibly separate unobstructed doorway. No barrier across route. Eight callouts:
S1 GUARD BOOTH — 2.60 x 1.80 x 2.70: big wall-attached centrepiece, low dark steel plinth and waist panels, four square uprights and roof cap, solid opaque pale blue #b8dcea illuminated FRONT and two SIDE window slabs, dark sill. Cannot see interior through panels. No chair or guard. 13 boxes.
S2 STOWED BARRIER — 1.60 x 0.55 x 1.35: recognizable checkpoint swing barrier in PARKED position, a steel hinge column and a broad horizontal dark steel arm folded PARALLEL AND CLOSE TO THE WALL above its short stop support. Entire unit wall hugging, never projecting across doorway or walkway. No striped boom, red/green light or use prompt.
S3 LOCKER BANK — 1.80 x 0.65 x 2.35: three steel locker doors on one dark housing/plinth, three large handle blocks, three horizontal upper vent slots, no glow.
S4 CAMERA CONSOLE — 2.00 x 0.90 x 1.85: low wall console on two supports with two side-by-side large square cyan camera screens in dark bezels, two chunky dark screen graphics each, two steel input slabs, blue-white status strip. Simple boxes.
S5 WALL CAMERA — 0.50 x 0.65 x 0.40: short thick box camera on wall plate and square elbow mount, large dark square lens and hood. Lens is dark NON-GLOWING, no alarm LED.
S6 INSPECTION COUNTER — 1.80 x 0.80 x 1.05: steel slab counter, two chunky pedestals, rear lip, dark rectangular inspection mat and cream document slab, no glow or scanner beam.
S7 EQUIPMENT CABINET — 1.20 x 0.70 x 1.75: solid steel wall cabinet with two inset doors, two dark handles and two broad NON-GLOWING pale-blue rectangular identification plates. No cross symbol or weapon.
S8 BLUE-WHITE LIGHT — 1.40 x 0.22 x 0.30: wall-mounted rectangular steel fixture, caps, hood and broad opaque icy pale blue #b8dcea emitter.
Footer small exact text "W x D x H / BLOCKS    OPAQUE GLASS    BARRIER PARKED / CLEAR ROUTES".
```

## 03-reactor.png — sector spec

```text
Primary request: sheet "FACILITY PROPS / 03" with subtitle "SECTOR 3 / REACTOR ACCESS". Recognisable mechanical service bay, square elbows and valve cross handles, transformer fins and heat exchanger, dense machinery along walls with a wide clear central floor. ORANGE glow. Crucial: emission must be deep saturated orange #ff6a24, darker hot orange #d95a20; NEVER amber, yellow, golden, red, or a yellow-white center. Orange glow appears only as wide recessed horizontal heat slots or broad worklight, never a small glowing node or cable trail. Keep room steel gray; orange local pools only.
Eight callouts:
R1 PIPE RUN — 2.40 x 0.55 x 2.60: two parallel rectangular thick gray pipes with right-angle boxed elbows and four block clamps, no cylinders and no glow. 10 boxes.
R2 VALVE MODULE — 0.90 x 0.70 x 1.40: vertical thick square-section pipe on wall clamps, dark block valve body with four chunky steel cross-handle bars around a square hub. Non-glowing, no circular wheel, no amber center.
R3 TRANSFORMER — 2.60 x 1.60 x 2.45: big wall-attached industrial centerpiece, low dark rectangular plinth, heavy steel rectangular body, five broad upright steel cooling fins, three short thick rectangular top terminal blocks (no glowing insulators), two broad recessed orange HEAT SLATS at bottom front. Dark frame around wide orange horizontal slots. 15 boxes.
R4 CONTROL PANEL — 1.40 x 0.65 x 1.90: steel electrical cabinet, one large cool-white/cyan display in dark bezel and four broad steel rectangular switch paddles, three horizontal dark cooling slots. Controls non-glowing; only cyan screen glows, no colored buttons.
R5 STEAM VENT — 1.20 x 0.65 x 2.70: short wall vent housing and square stack with two broad dark grille slats; above outlet three stepped opaque pale gray BOX puffs, all inside the 2.70 height limit. Steam is white-gray, non-glowing, no photoreal soft cloud, no floor hazard or jet across route. 8 boxes including puffs.
R6 CABLE TRUNK — 2.40 x 0.30 x 0.55: covered rectangular steel wall trunk with a stepped end, four large retaining straps and one solid splice block, no bare wires, no glow.
R7 HEAT EXCHANGER — 1.60 x 0.90 x 2.20: steel wall unit on plinth, four broad horizontal dark cooling slats, two rectangular side headers, two broad recessed orange horizontal heat bars behind dark framing. Not a glowing circular reactor or node.
R8 ORANGE WORKLIGHT — 1.40 x 0.25 x 0.32: wide rectangular dark steel wall lamp with two end caps, heavy dark visor and a broad recessed solid orange #ff6a24 emitter, no yellow-hot center.
Footer small exact text "W x D x H / BLOCKS    ORANGE HEAT / NO AMBER    WALL HUGGING / CLEAR ROUTES".
```

## Layout continuity — sheets 02 and 03

```text
Additional input image 3: approved Facility Entry sheet, use its exact page layout, heading style, hero/callout proportions and rendering simplicity to make a consistent set. Change props, title and sector lighting as specified.
```

