# Facility props v1

Reference art for [Build 2 — sectors 1–3 feel different](../../docs/ROADMAP.md), 2026-10-28. No runtime assets or game-code changes. Style references: [sector-monsters-v2](../sector-monsters-v2/), [ART.md](../../docs/ART.md), and the existing riveted Facility walls in [scripts/shots](../../scripts/shots/).

| Sector | Sheet | Read from one screenshot |
|---|---|---|
| 1 / Facility Entry | [01-entry.png](01-entry.png) | Low office desks, paper boards, cardboard on steel shelves, tall dark servers; cool white light |
| 2 / Security Floor | [02-security.png](02-security.png) | Large pale-blue opaque booth windows, lockers, parked checkpoint arm, paired camera screens; blue-white light |
| 3 / Reactor Access | [03-reactor.png](03-reactor.png) | Square pipe elbows, cross-handle valves, heavy transformer fins, broad orange heat slots, white steam |

Each sheet has a representative dressed room and eight isolated prop callouts. The callouts are the complete inventory; the hero is a composition suggestion, not a measured floor plan. Dimensions below match final callout labels. Use these dimensions and box recipes for a later implementation rather than measuring the perspective drawings.

## Shared construction and placement

- **1 block = 1 unit.** All dimensions are **W × D × H**: width along the wall, depth out into the room, height. Component dimensions use the same order. Quantities are individual solid boxes; no cylinders, tubes, bevel meshes, transparent surfaces, outlines, or extra modeled bolts.
- Component dimensions are rough recipes within a firm overall envelope. Overlap is allowed; flush surface boxes fit inside that envelope. Face shading and flat colour patches do not add geometry. Keep each prop at **5–20 boxes**; do not copy extra seams or tiny trim from the illustration as more boxes.
- All units touch a solid wall, including the two large centrepieces. Ordinary depth is **≤1.0**; S1 booth **1.80** and R3 transformer **1.60** are the only exceptions, both **≤2.0**. Heights, including mounting and visible steam, stay **≤2.8** above the floor.
- Floor-standing props have their base at floor level. Wall props have mounting heights below. Do not stack units above their height limits. Long wall runs are repetitions, each with its own box budget and footprint.
- Keep at least **2 blocks clear around every doorway/opening**, with the entire opening and door motion clear. Preserve a continuous **2-block-wide walking/combat lane** through the room and past each prop. Reject a placement if the room cannot fit it; do not move the prop into circulation. Keep pickups, enemy spawn positions, secret walls and Power Link equipment clear, using the current Entry pass's two-cell exclusion as a minimum.
- Booths are shallow wall-attached shells, never freestanding islands or walk-through checkpoints. S2 stays folded **parallel to the wall**. No new locked routes, interaction prompts, usable switches, destructibles, or combat hazards are implied by these sheets.
- All glass-like surfaces are **solid, opaque pale-blue boxes**. No alpha, see-through interiors, reflection tricks or transparent steam; steam is stepped opaque gray boxes.
- Lighting pools are local. Keep enough dark gray wall visible to preserve the Facility's industrial look. No outlines on props; differentiate adjacent boxes using their own face shades.
- These are **non-breakable props**. The only breakable object silhouettes remain the **X-braced wooden crate** and **red hazard barrel**. Shelf cartons are small sealed cardboard boxes, with straight tape and no diagonal braces. Avoid wood grain, barrel shapes, hazard bands, damage cracks, medical crosses or supply-pickup silhouettes.

## Palette and signal discipline

Reuse the core [ART.md palette](../../docs/ART.md). The cardboard/cork colours come from the Entry first pass. Pale-blue glass and deep-orange heat are narrow supporting additions.

| Token | Hex | Material / use |
|---|---|---|
| Steel | `#566076` | Most metal bodies and frames |
| Dark | `#262c38` | Plinths, bezels, pipe clamps, handles, dark faces |
| Void | `#05060a` | Recesses, grille gaps, dark camera lens |
| Muted | `#8a94a8` | Light metal, switch paddles, pipe faces |
| Pale | `#cfd6e4` | Paper, opaque steam, pale metal highlights |
| White | `#f0f2f6` | Entry task-light emitting face |
| Cyan | `#34d0ff` | Screens and server LED bars only |
| Ice | `#b8dcea` | Opaque booth panels, Security lights, painted ID plates |
| Cork | `#9c7646` | Notice-board backing, no emission |
| Carton A | `#a47c4a` | Cardboard, no emission |
| Carton B | `#8a6a3e` | Alternate cardboard, no emission |
| Tape | `#e6dfcc` | Paper/tape, no emission |
| Orange | `#ff6a24` | Broad recessed Reactor heat slots and worklight face only |
| Orange shade | `#d95a20` | Darker flat side shade for heat faces; no extra lamp or point source |

**Glow is opt-in:** only the parts explicitly named in each prop's Glow line emit/full-bright. Everything else is matte and non-emissive, even pale-blue ID plates. Do not infer emission from a bright face in the illustration.

**Reserved:** no red or green glow, and no amber/yellow/gold prop glow. Red still means keycard/locked door; green means exit; amber gleam on a cracked wall means secret; an amber wall node means Power Link. Do not use `#ff3428`, `#4cc26a`, hazard `#ffd028`, or the existing Entry rack's green/amber LEDs on these props. Reactor Orange must remain visibly deep orange, with **no yellow-white core, small luminous node, lit valve hub, glowing cable trail or amber beacon**. It is a wide horizontal machine aperture framed in dark steel. Do not add decorative hazard stripes.

## Sector 1 / Facility Entry

Improve the existing office / storage / server mix rather than replacing it. Give each room one dominant purpose: desk + board + files for offices, shelf repeats for stores, and rack + grille repeats for servers. A transition room may combine them as in the hero. Keep white task lighting common across the sector.

**Missing from the first pass:** communication at office/service bays (E6), obvious server cooling (E7), and coherent wall task lights (E8). Make existing screens/LEDs large enough to read at 240 lines; replace green/amber rack LEDs with cyan. Use broad drawer faces and a few large cartons instead of many tiny details. Skip chairs and floor clutter because they consume circulation depth.

### E1 — Work desk

**Envelope:** 1.80 × 0.90 × 1.55. **12 boxes.** Floor-standing, back against wall; monitor contained above the 0.90-high worktop.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Desktop, 1.80 × 0.90 × 0.12 | Steel |
| 2 | Side pedestals, 0.38 × 0.75 × 0.78 | Steel |
| 1 | Back modesty slab, 0.95 × 0.08 × 0.42 | Dark |
| 1 | Drawer face on one pedestal, 0.32 × 0.04 × 0.28 | Muted |
| 1 | Drawer handle, 0.15 × 0.05 × 0.07 | Dark |
| 1 | Monitor stand foot, 0.38 × 0.22 × 0.06 | Dark |
| 1 | Stand neck, 0.12 × 0.10 × 0.14 | Steel |
| 1 | Monitor case, 0.70 × 0.13 × 0.46 | Dark |
| 1 | Screen face, 0.59 × 0.02 × 0.35 | Cyan |
| 1 | Keyboard base, 0.48 × 0.22 × 0.05 | Dark |
| 1 | Broad key slab, 0.38 × 0.17 × 0.02 | Steel |

**Glow:** screen face only. No individual key LEDs. No loose chair.

### E2 — Notice board

**Envelope:** 1.40 × 0.12 × 0.75. **8 boxes.** Wall-mounted, bottom at 1.85; top at 2.60. Can sit above E1 without overlapping the monitor.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Cork backing, 1.32 × 0.05 × 0.67 | Cork |
| 2 | Horizontal frame bars, 1.40 × 0.10 × 0.06 | Steel |
| 2 | Vertical frame bars, 0.06 × 0.10 × 0.63 | Steel |
| 3 | Unequal paper rectangles, about 0.25 × 0.02 × 0.33 | Tape / Pale |

**Glow:** none. Papers are large flat rectangles, not legible quest text; no extra modeled corner bolts.

### E3 — File cabinet

**Envelope:** 0.80 × 0.78 × 1.80. **8 boxes.** Floor-standing; thin front faces included in the depth.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Housing, 0.80 × 0.70 × 1.70 | Steel |
| 1 | Low plinth, 0.80 × 0.76 × 0.10 | Dark |
| 3 | Drawer faces, 0.69 × 0.04 × 0.51 | Muted |
| 3 | Chunky drawer handles, 0.19 × 0.04 × 0.09 | Dark |

**Glow:** none. Steel drawers distinguish it from a supply crate.

### E4 — Stores shelf

**Envelope:** 1.80 × 0.90 × 2.40. **17 boxes.** Floor-standing; leave upper shelf partly empty. Cartons are contents of this prop, not separate floor props.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 4 | Corner uprights, 0.08 × 0.08 × 2.40 | Steel |
| 3 | Shelves, 1.72 × 0.82 × 0.09 | Muted |
| 5 | Cartons in two sizes, 0.35–0.55 × 0.45–0.60 × 0.30–0.50 | Carton A / B |
| 5 | One straight tape strip on each carton, 0.08 × 0.02 × 0.28 | Tape |

**Glow:** none. No X bracing, diagonal tape, wooden slats or large floor-level wooden box. Top of the highest carton remains below 2.40.

### E5 — Server rack

**Envelope:** 0.80 × 0.95 × 2.60. **12 boxes.** Floor-standing. Repeat as separate modules; retain dark gaps between them.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Tall case, 0.80 × 0.88 × 2.48 | Dark |
| 1 | Plinth, 0.80 × 0.93 × 0.12 | Steel |
| 4 | Broad server tray faces, 0.66 × 0.04 × 0.40 | Steel |
| 4 | Horizontal LED bars, 0.35 × 0.02 × 0.08 | Cyan |
| 1 | Upper vent inset, 0.64 × 0.02 × 0.22 | Void |
| 1 | Vent divider, 0.64 × 0.02 × 0.05 | Dark |

**Glow:** four cyan LED bars only. No green, amber or red states. Final sheet width is **0.80**, a small refinement of the initial 0.90 prompt.

### E6 — Intercom

**Envelope:** 0.35 × 0.18 × 0.65. **6 boxes.** Wall-mounted, bottom 1.20; top 1.85.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Case, 0.35 × 0.12 × 0.65 | Steel |
| 3 | Horizontal speaker-slot faces, 0.23 × 0.02 × 0.05 | Void |
| 1 | Push pad, 0.18 × 0.04 × 0.20 | Muted |
| 1 | Pad base, 0.22 × 0.02 × 0.24 | Dark |

**Glow:** none. A communication fixture, not an interactable node or keycard reader.

### E7 — Cooling grille

**Envelope:** 1.20 × 0.18 × 0.65. **9 boxes.** Wall-mounted, bottom 1.85; top 2.50, or lower beside racks. Louvres are axis-aligned slabs, not angled blades.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Recess back, 1.08 × 0.04 × 0.53 | Void |
| 2 | Horizontal frame bars, 1.20 × 0.12 × 0.07 | Steel |
| 2 | Vertical frame bars, 0.07 × 0.12 × 0.51 | Muted |
| 4 | Broad louvres, 1.04 × 0.10 × 0.07 | Dark |

**Glow:** none. Keep large dark gaps; no circular fan or breakable grille language.

### E8 — White task light

**Envelope:** 1.40 × 0.20 × 0.28. **5 boxes.** Wall-mounted, bottom 2.45; top 2.73. Do not mount at the illustrated room's ceiling if that exceeds this height.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Rear housing, 1.40 × 0.12 × 0.28 | Steel |
| 2 | End caps, 0.12 × 0.20 × 0.28 | Dark |
| 1 | Broad emitting face, 1.12 × 0.03 × 0.16 | White |
| 1 | Shallow upper hood, 1.16 × 0.20 × 0.05 | Dark |

**Glow:** white face only. Cool white local pool, no coloured status ends.

## Sector 2 / Security Floor

Checkpoint rooms use S1 + S2 + S4 as the main silhouette group; locker rooms repeat S3 and use S7 for gear storage. S6 provides a low inspection station. Give major rooms a booth or a locker bank in view from entry, supported by camera screens, so the screenshot reads Security before text is legible. Keep all gear and the parked barrier against walls.

### S1 — Guard booth

**Envelope:** 2.60 × 1.80 × 2.70. **13 boxes.** Large centrepiece exception; floor-standing with back directly against wall. Opaque shell, no modeled interior or walk-through route.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Plinth, 2.60 × 1.80 × 0.12 | Dark |
| 1 | Lower booth block, 2.48 × 1.68 × 0.95 | Dark |
| 4 | Square uprights, 0.14 × 0.14 × 2.40 | Steel |
| 1 | Roof cap, 2.60 × 1.80 × 0.18 | Steel |
| 1 | Front window, 2.20 × 0.08 × 1.12 | Ice |
| 2 | Side windows, 0.08 × 1.36 × 1.12 | Ice |
| 1 | Front sill, 2.46 × 0.16 × 0.12 | Muted |
| 2 | Side sills, 0.16 × 1.54 × 0.12 | Muted |

**Glow:** three Ice window slabs, evenly pale and opaque. Restrained full-bright surfaces; S8 provides the room light. No visible guard/interior, reflections, alarm beacons or glowing roof signs.

### S2 — Stowed barrier

**Envelope:** 1.60 × 0.55 × 1.35. **7 boxes.** Floor-standing, arm parallel to wall, facing along the wall run. It marks a retired inspection bay, not the traversable doorway.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Hinge-post foot, 0.32 × 0.50 × 0.12 | Dark |
| 1 | Hinge post, 0.24 × 0.34 × 1.23 | Steel |
| 1 | Square hinge housing, 0.32 × 0.42 × 0.36 | Muted |
| 1 | Parked arm, 1.28 × 0.18 × 0.28 | Dark |
| 1 | Arm end cap, 0.09 × 0.22 × 0.32 | Steel |
| 1 | Short stop support, 0.12 × 0.22 × 0.72 | Steel |
| 1 | Stop foot, 0.24 × 0.32 × 0.08 | Dark |

**Glow:** none. No hazard stripes or red/green reader. Never show a closed arm across circulation; a future functional barrier would need a separate gameplay design.

### S3 — Locker bank

**Envelope:** 1.80 × 0.65 × 2.35. **14 boxes.** Floor-standing, three doors; draw broad upper vent marks as the listed slabs rather than extra slats.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Housing, 1.80 × 0.58 × 2.23 | Dark |
| 1 | Plinth, 1.80 × 0.63 × 0.12 | Dark |
| 3 | Locker doors, 0.55 × 0.04 × 2.13 | Steel |
| 3 | Vertical handles, 0.09 × 0.03 × 0.30 | Dark |
| 6 | Broad upper vent marks, two per door, 0.34 × 0.02 × 0.07 | Void |

**Glow:** none. No wooden bracing, locked-door red plates, or separate loot handles.

### S4 — Camera console

**Envelope:** 2.00 × 0.90 × 1.85. **15 boxes.** Floor-standing, console top at 0.95. Screens face the open room.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Worktop, 2.00 × 0.90 × 0.12 | Steel |
| 2 | Pedestals, 0.38 × 0.76 × 0.83 | Steel |
| 2 | Monitor cases, 0.82 × 0.16 × 0.78 | Dark |
| 2 | Screen faces, 0.68 × 0.02 × 0.62 | Cyan |
| 4 | Large screen graphic rectangles, about 0.20 × 0.01 × 0.18 | Steel |
| 2 | Input slabs, 0.48 × 0.25 × 0.07 | Muted |
| 1 | Broad status strip, 0.70 × 0.02 × 0.06 | Ice |
| 1 | Back support slab, 1.50 × 0.08 × 0.40 | Dark |

**Glow:** two cyan screen faces and Ice strip only. Graphics are non-glowing flat blocks; no miniature live video is required. Broad dual-screen silhouette matters more than screen detail.

### S5 — Wall camera

**Envelope:** 0.50 × 0.65 × 0.40. **6 boxes.** Wall-mounted, bottom 2.30; top 2.70. All brackets included in the envelope; no thin angled struts.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Wall plate, 0.22 × 0.06 × 0.36 | Dark |
| 1 | Horizontal bracket, 0.16 × 0.25 × 0.08 | Steel |
| 1 | Vertical elbow block, 0.12 × 0.12 × 0.18 | Steel |
| 1 | Camera body, 0.42 × 0.38 × 0.24 | Muted |
| 1 | Lens face, 0.26 × 0.02 × 0.17 | Void |
| 1 | Hood, 0.50 × 0.43 × 0.05 | Dark |

**Glow:** none. Square dark lens, no red recording light. Decorative only; the future roadmap alarm-camera interaction is not specified here.

### S6 — Inspection counter

**Envelope:** 1.80 × 0.80 × 1.05. **7 boxes.** Floor-standing, wall attached. Keep the work surface under the low rear lip.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Countertop, 1.80 × 0.80 × 0.12 | Muted |
| 2 | Pedestals, 0.40 × 0.66 × 0.78 | Steel |
| 1 | Rear lip, 1.70 × 0.08 × 0.15 | Steel |
| 1 | Inspection mat, 0.55 × 0.35 × 0.03 | Dark |
| 1 | Document block, 0.32 × 0.26 × 0.05 | Tape |
| 1 | Rear modesty panel, 0.90 × 0.06 × 0.40 | Dark |

**Glow:** none. No scanner beam, glowing evidence, item pickup or loose floor tray.

### S7 — Equipment cabinet

**Envelope:** 1.20 × 0.70 × 1.75. **8 boxes.** Floor-standing. Pale labels are painted, not illuminated glass.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Housing, 1.20 × 0.62 × 1.65 | Steel |
| 1 | Plinth, 1.20 × 0.68 × 0.10 | Dark |
| 2 | Inset doors, 0.52 × 0.04 × 1.52 | Steel |
| 2 | Vertical handles, 0.08 × 0.04 × 0.28 | Dark |
| 2 | Flat ID plates, 0.30 × 0.02 × 0.13 | Ice |

**Glow:** none, including both ID plates. No health cross, ammo icon, hazard band or locked-door cue.

### S8 — Blue-white light

**Envelope:** 1.40 × 0.22 × 0.30. **5 boxes.** Wall-mounted, bottom 2.45; top 2.75.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Housing, 1.40 × 0.14 × 0.30 | Steel |
| 2 | End caps, 0.12 × 0.22 × 0.30 | Dark |
| 1 | Broad emitting face, 1.12 × 0.03 × 0.18 | Ice |
| 1 | Upper hood, 1.16 × 0.22 × 0.05 | Dark |

**Glow:** Ice face only, with a blue-white local pool. More subdued than a cyan camera display; no saturated blue alarm beacon.

## Sector 3 / Reactor Access

Generator rooms use R3 as the heavy landmark, control bays use R4 + R7, and service passages repeat R1/R6. Put square pipe elbows and at least one broad orange machine aperture in the arrival view. Keep cyan to a small control display so Reactor remains orange-led. Steam rises vertically in the wall margin and never crosses a route. These are service machines, not an open molten Geothermal Core.

### R1 — Pipe run

**Envelope:** 2.40 × 0.55 × 2.60. **10 boxes.** Floor-to-wall service module; all pipes have rectangular cross-sections. An empty centre is negative space, not transparent material.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 2 | Vertical risers, 0.26 × 0.30 × 2.60 | Muted |
| 2 | Horizontal connecting runs, 1.90 × 0.30 × 0.24 | Steel |
| 2 | Enlarged elbow/junction blocks, 0.36 × 0.40 × 0.36 | Steel |
| 4 | Square clamps, 0.42 × 0.55 × 0.14 | Dark |

**Glow:** none. Straight box overlaps form the elbows; do not add round fittings. Width includes clamps and junctions.

### R2 — Valve module

**Envelope:** 0.90 × 0.70 × 1.40. **9 boxes.** Wall-mounted, bottom 0.55; top 1.95. A passive square cross-handle, not an amber interaction target.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Vertical pipe, 0.20 × 0.24 × 1.40 | Steel |
| 2 | Wall clamps, 0.42 × 0.32 × 0.12 | Dark |
| 1 | Valve body, 0.42 × 0.38 × 0.40 | Dark |
| 1 | Square hub, 0.20 × 0.18 × 0.20 | Steel |
| 2 | Horizontal handle ends, 0.34 × 0.10 × 0.12 | Muted |
| 2 | Vertical handle ends, 0.12 × 0.10 × 0.28 | Muted |

**Glow:** none, especially the hub. No circular handwheel or puzzle marking. Steam-shutoff gameplay is future work.

### R3 — Transformer

**Envelope:** 2.60 × 1.60 × 2.45. **15 boxes.** Large centrepiece exception; floor-standing with rear against solid wall. No passage behind or through it.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Plinth, 2.60 × 1.60 × 0.18 | Dark |
| 1 | Main body, 2.24 × 1.30 × 1.75 | Steel |
| 5 | Vertical cooling fins, 0.24 × 1.42 × 1.45 | Muted |
| 3 | Top rectangular terminals, 0.30 × 0.42 × 0.38 | Steel |
| 1 | Lower dark heat-slot backing, 2.10 × 0.04 × 0.55 | Void |
| 4 | Broad heat-slot halves, two rows split at centre, 0.78 × 0.03 × 0.12 | Orange |

**Glow:** four Orange slot halves only. Their backs remain dark; no amber terminal, lit coil, top beacon or node. Keep the five-fin silhouette readable at 240 lines. Any illustrated edge trim is face shading, not more geometry.

### R4 — Control panel

**Envelope:** 1.40 × 0.65 × 1.90. **11 boxes.** Floor-standing wall cabinet; no outward-open door or projecting console shelf.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Cabinet body, 1.40 × 0.55 × 1.90 | Steel |
| 1 | Front slab, 1.28 × 0.04 × 1.76 | Muted |
| 1 | Display bezel, 0.98 × 0.04 × 0.64 | Dark |
| 1 | Display face, 0.80 × 0.02 × 0.46 | Cyan |
| 4 | Large switch paddles, 0.18 × 0.04 × 0.36 | Pale |
| 3 | Broad lower cooling-slot faces, 0.92 × 0.02 × 0.08 | Void |

**Glow:** cyan display only. Switches and cooling slots do not glow. No red/green/amber controls; this screen is decorative, not a substitute Power Link.

### R5 — Steam vent

**Envelope:** 1.20 × 0.55 × 2.70 **including steam**. **8 boxes.** Floor-standing housing, all steam in its wall margin. Keep puff depth inside the same 0.55 envelope.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Vent housing, 1.20 × 0.55 × 1.20 | Steel |
| 1 | Front recess, 0.86 × 0.02 × 0.80 | Void |
| 2 | Broad grille slats, 0.86 × 0.08 × 0.12 | Dark |
| 1 | Square outlet stack, 0.42 × 0.40 × 0.42 | Muted |
| 3 | Stepped puff blocks, about 0.32–0.48 × 0.32–0.44 × 0.32–0.44 | Pale / Muted |

**Glow:** none. Three opaque puffs rise with small offsets; highest top is 2.70. No alpha, volumetrics or floor-directed damaging jet. Final sheet depth is **0.55**, reduced from the initial 0.65 prompt.

### R6 — Cable trunk

**Envelope:** 2.40 × 0.30 × 0.55. **7 boxes.** Wall-mounted, bottom 1.05; top 1.60, or repeated low at bottom 0.15. Never cross an opening or imply an objective cable.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Covered main trunk, 2.32 × 0.20 × 0.34 | Steel |
| 1 | Stepped end block, 0.24 × 0.25 × 0.42 | Steel |
| 4 | Retaining straps, 0.10 × 0.30 × 0.46 | Dark |
| 1 | Solid splice cover, 0.44 × 0.28 × 0.55 | Muted |

**Glow:** none. No bare wire, amber/green cable or luminous junction. Entirely covered rectangular conduit.

### R7 — Heat exchanger

**Envelope:** 1.60 × 0.90 × 2.20. **12 boxes.** Floor-standing. Two broad side headers frame dark horizontal slats.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Plinth, 1.60 × 0.90 × 0.12 | Dark |
| 1 | Rear/body slab, 1.40 × 0.66 × 2.08 | Steel |
| 2 | Side headers, 0.20 × 0.82 × 2.00 | Muted |
| 4 | Horizontal cooling slats, 1.12 × 0.12 × 0.14 | Dark |
| 2 | Recessed heat bars, 0.90 × 0.03 × 0.14 | Orange |
| 2 | Bottom front feet, 0.30 × 0.90 × 0.20 | Steel |

**Glow:** two Orange bars only. They are broad horizontal apertures set behind the dark front frame, not amber nodes. Do not add a round exposed reactor core.

### R8 — Orange worklight

**Envelope:** 1.40 × 0.25 × 0.32. **5 boxes.** Wall-mounted, bottom 2.40; top 2.72.

| Qty | Part, rough size each | Colour |
|---:|---|---|
| 1 | Rear housing, 1.40 × 0.16 × 0.32 | Steel |
| 2 | End caps, 0.12 × 0.25 × 0.32 | Dark |
| 1 | Broad recessed emitting face, 1.12 × 0.03 × 0.18 | Orange |
| 1 | Heavy upper visor, 1.16 × 0.25 × 0.07 | Dark |

**Glow:** Orange face only. Preserve deep orange across the whole face, no amber/yellow/white hotspot. Use a short local throw onto adjacent steel, not a corridor-length light trail.

## Reference review

- Three consistent sheets, each with one room hero and eight labeled prop callouts.
- 24 prop recipes, 5–17 boxes each; only S1/R3 exceed one block of depth.
- All floor-standing envelopes are below 2.8; listed wall mounting and steam tops are also below 2.8.
- Entry additions address communication, cooling and coherent lighting while retaining the first-pass furniture.
- Security uses opaque booth panels and a wall-parallel stowed arm. Reactor uses wide deep-orange apertures, with no decorative amber nodes or glowing cable runs.
- Actual room fit, low-resolution readability and colour separation still need in-game review when these concepts are implemented. The perspective heroes do not prove procedural placement or doorway clearance.

Generation used the built-in imagegen tool. The complete prompt set and source-image roles are recorded in [PROMPTS.md](PROMPTS.md).
