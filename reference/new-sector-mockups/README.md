# New sector environment mockups

Generated with the built-in image_gen tool on 2026-10-18. These are visual
design proposals, not implemented sectors or screenshots of working mechanics.
Facility, Biofoundry and the existing Geothermal Core concept are excluded.
No sector numbers are assigned: these themes can replace repeated early
environments or extend the campaign.

Each image is a separate 16:9 environment mockup built around large voxel
forms, readable combat lanes, and the current floating sidearm.

| Mockup | Visual/gameplay focus |
| --- | --- |
| [Coolant Works](coolant-works.png) | Cooling towers, shallow blue channels and timed coolant vents. |
| [Freight Depot](freight-depot.png) | Container lanes, overhead crane and a broad cargo elevator. |
| [Security Nexus](security-nexus.png) | Fortified checkpoint, visible shield generators and linked control cables. |
| [Deep Excavation](deep-excavation.png) | Stepped basalt cavern, block-built mining drill and two-level combat routes. |
| [Extraction Hangar](extraction-hangar.png) | Escape lift, two power relays and broad final-encounter cover. |

## Implementation boundaries

- Coolant Works: static flat coolant surfaces; jets can use a timed damage
  volume, warning lamp and a small particle emitter.
- Freight Depot: repeatable container boxes, existing-style cover and a cargo
  lift; the crane can remain static decoration.
- Security Nexus: two destructible generator entities linked to a shield
  state; the visible shield can be a single translucent plane.
- Deep Excavation: block terrain, stepped platforms and an existing-style
  service lift; the drill can remain static geometry.
- Extraction Hangar: two relay interactions, a finite encounter and an escape
  platform. The daylight strip needs no exterior simulation.

These are implementation suggestions, not a guarantee that the current level
generator or AI supports the depicted layouts without changes. Preserve
navigable enemy routes and the project's lighting/draw-call budgets when built.

## Final prompt set

For each image, concatenate the shared prompt below with that image's sector
prompt. Both input images were local style references, not edit targets:
`reference/facility-sector-concept.png` and `scripts/shots/2-started.png`.

### Shared prompt

```text
Use case: stylized-concept.
Asset type: first-person environment mockup for VOXELSTRIKE, an original browser voxel FPS. Create ONE coherent wide 16:9 landscape image, not a collage or reference sheet.
Input images: Image 1 (facility-sector-concept.png) is a construction and art-style reference ONLY, not a layout to copy. Image 2 (2-started.png) is the real game's pixel density, geometry and rendering reference; omit its interface.
Style invariants: chunky rectilinear voxel architecture, large simple cuboids, coarse nearest-neighbor pixel textures, worn 16px-style tiled materials, flat per-face shading and readable baked-style pools of colored light. Human-scale doorways and generous combat lanes. Every prop should be practical to build from boxes, flat planes and a small number of particles in Three.js. Sparse structural detail instead of tiny mechanical greebles. Polished readable retro game mockup, not photorealistic high-poly concept art.
Framing: view from the player's eye level just inside the entrance, strong depth, visible floor and ceiling, broad clear traversable route, substantial cover, no impossible thin walkways or mandatory precision platforming. Small simple dark gray cuboid sidearm with a tiny green sight at the lower-right, floats without hands or arms, same identity as reference.
Colors: steel #566076 and void #05060a anchor the palette. Yellow #ffd028 marks real hazards/edges, red #ff3428 only on a locked-door reader, green #4cc26a only for the weapon sight or an actual exit. Other theme lighting specified below.
Constraints: environment design proposal, not implemented gameplay. No HUD, crosshair, menus, map, title overlay, labels outside the world, watermark or borders. No characters or enemies. No realistic fluid simulation, screen-space mirror reflections, volumetric fog, cinematic depth of field, smooth cylinders or organic sculpting. Do not reuse the reference room layout. Make theme silhouettes and major shapes clear at a glance.
```

### Coolant Works

Image: [coolant-works.png](coolant-works.png)

```text
Scene: COOLANT WORKS, a cold industrial water-treatment and cooling hall. Two massive square ribbed cooling towers occupy opposite sides of the middle distance, with thick rectangular pale-blue coolant ducts running up them and across the ceiling. Shallow recessed blue coolant channels border a broad dry central steel walkway, connected to dry flanking maintenance paths around the towers. Flat opaque blue water surfaces with simple pixel highlights, no reflections. Two box-built vent nozzles on a side route: one releases a short sparse spray of square pale-blue droplets, the other shows an amber warning lamp. Hazard stripes mark those vent zones and channel edges. The main route is completely safe and readable. Far wall has a heavy steel service door and one small red keycard reader. One low square console and broad pillars supply cover.
Lighting: cool blue and icy white work lamps, restrained teal screen accents, dark slate steel, one small warm maintenance light. No purple biological laboratory lighting, tanks with creatures, orange molten channels or lava.
World text: one small integrated wall sign reading exactly "COOLANT WORKS". No other words.
```

### Freight Depot

Image: [freight-depot.png](freight-depot.png)

```text
Scene: FREIGHT DEPOT, a tall enclosed industrial cargo warehouse with a heavy ceiling. Stacked steel shipping containers in desaturated cobalt and rust-brown create two clear wide flanking combat lanes and a broad central loading aisle. Containers are human-scale cuboid modules with sparse ribbed panel textures, stacked at most two high. Foreground waist-high cargo boxes supply cover without blocking the route. At the far end a broad square cargo elevator sits flush in a loading recess, with thick visible lift guide rails, side guardrails and yellow-black hazard edging. A simple box-built overhead gantry crane and suspended rectangular lifting frame establish the warehouse silhouette high above, never dangling over the entrance. A modest upper maintenance gallery is reachable by broad block steps. Nothing floats or blocks the floor lanes.
Lighting: warm amber high-bay lights, cool muted blue steel shadows, dusty brown concrete and worn metal floor. No bright cyan laboratory glow, coolant channels, specimen tanks or lava.
World text: one physical wall sign above the lift reading exactly "FREIGHT DEPOT". No other words.
```

### Security Nexus

Image: [security-nexus.png](security-nexus.png)

```text
Scene: SECURITY NEXUS, a compact fortified checkpoint control hall, not a warehouse. A reinforced segmented steel blast door dominates the far wall, flanked by angular steel guard booths with small amber observation windows. Two squat square shield-generator pedestals stand visibly in left and right midground alcoves, each with a large exposed cyan rectangular power core. Thick simple rectangular conduits run along the floor edges and connect both pedestals to a substantial square checkpoint frame. Within that frame, a faint transparent cyan rectangular shield plane partially blocks the direct central lane, rendered as one simple translucent plane with a subtle pixel grid, not a swirling force field. Wide side passages around concrete barricades lead toward both generators, so the room has visible alternative routes. Steel waist-high cover, large charcoal wall panels, few amber surveillance monitor rectangles. One small red keycard reader beside the far door. Shield and generators must be visibly connected, readable and box-built.
Lighting: subdued graphite architecture, cold white strips, amber checkpoint windows and cyan generator cores. Keep all travel surfaces readable. No full room of neon, no decorative red lighting, no laboratory tanks or lava.
World text: one integrated industrial sign reading exactly "SECURITY NEXUS". No other text.
```

### Deep Excavation

Image: [deep-excavation.png](deep-excavation.png)

```text
Scene: DEEP EXCAVATION, an enclosed subterranean quarry carved from giant stepped charcoal basalt voxel blocks, clearly different from a steel corridor. A huge stationary industrial mining drill with a simple stepped square pyramidal drill head and a thick rectangular support chassis sits in a side bay, silhouetted against rock. No cylindrical machine parts. Broad lower stone and steel paths wind around two large square rock pillars, giving readable cover. One sturdy upper maintenance platform runs along the left rock wall, reached by broad block stairs and a square service lift; the lower route remains wide and connected. Rock-cut tunnels, a handful of square ore crates and rectangular support beams. A recessed non-traversable extraction trench has protective rails and actual hazard markings. A heavy steel service door is inset into the rock at the far end. No lava, geothermal tower or molten rock.
Lighting: sparse orange industrial floodlights and warm white work lamps against dark basalt with desaturated slate-blue ambient fill; keep paths bright enough to navigate. Tiny pale mineral flecks in rock textures, not glowing fantasy crystals. No biological growth, purple lab light or coolant channels.
World text: one riveted sign reading exactly "DEEP EXCAVATION". No other words.
```

### Extraction Hangar

Image: [extraction-hangar.png](extraction-hangar.png)

```text
Scene: EXTRACTION HANGAR, the final escape staging hall, a broad high-ceiling enclosed hangar dominated by a heavy segmented overhead shutter on the far wall. A narrow believable band of pale daylight comes from the top of the shutter, suggesting the surface is near. In front of it, a broad square escape elevator platform is raised just one shallow step from the floor, protected by chunky corner posts and hazard edge stripes. A single modest GREEN exit beacon is mounted on that actual escape platform; no other decorative green. Two large box-built power-relay consoles in opposite side alcoves have simple amber status panels, with thick rectangular floor conduits visibly linking them to the lift. Symmetrical broad flanking combat routes, two substantial steel pillars and scattered waist-high cargo barricades make a readable final encounter space. All exits, lanes and relay positions visible from the entrance. Clear open central floor for fighting, not a spaceship showroom.
Lighting: pale daylight at the far end, cool steel-blue interior and warm amber relay lights. A more hopeful escape mood while retaining the worn industrial voxel look. No spacecraft, aircraft, vehicles, crowds, lava, biological tanks, holographic spectacle or intricate machinery.
World text: one built-in wall sign above the shutter reading exactly "EXTRACTION". No other text.
```


