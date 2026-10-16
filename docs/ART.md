# Art direction

What VOXELSTRIKE should look like, and the rules that keep new work
consistent with it. Almost everything is drawn by code at runtime, so "art"
here means palette values, procedural textures and box models in source —
not image files.

## The look in one line

A dark 1990s sci-fi industrial dungeon rendered as chunky voxels: low
resolution, hard pixels, coloured lamp light pooling on grimy steel and
stone, with a few saturated signal colours (hazard yellow, keycard red,
exit green) that always mean something.

## Ground rules

- **Procedural first.** Levels, the texture atlas, enemy rigs, weapon view
  models, pickups, particles and every sound are generated in code. The game
  must look complete with zero asset files.
- **Nothing copied.** Inspired by 90s shooters, but no assets, levels,
  characters or sounds from Doom or any other game. Any third-party asset
  needs a licence check and a credit in `public/THIRD-PARTY-NOTICES.txt`
  (today: Font Awesome icons only). Music is optional and git-ignored for
  the same reason.
- **Signal colours carry meaning.** Don't use hazard yellow, keycard red or
  exit green decoratively in a way that could be misread as an objective,
  a key or the way out.
- **Low-res on purpose.** The game renders 240 lines tall and upscales with
  nearest-neighbour. Design details at that size: a 1-pixel feature is
  about 0.006 units at arm's length. Anything finer disappears or shimmers.

## Palette

The theme-locked colours (from CLAUDE.md) — reuse these before inventing new
ones:

| Role | Hex | Used for |
|---|---|---|
| Hazard | `#ffd028` | Warnings, active UI, objective arrow, primary buttons, hazard stripes |
| Keycard red | `#ff3428` | The red key, locked doors, the "find the key" objective |
| Exit green | `#4cc26a` | Exit pad, exit beacon, minimap player arrow, sights |
| Steel | `#566076` | Metal surfaces, muted UI borders, secondary text |
| Void | `#05060a` | Background, deepest shadow, holes |

Supporting colours already in use:

| Role | Hex |
|---|---|
| Arc / electric teal | `#34d0ff`, `#55e0ff` |
| Health red (HUD) | `#e8524a` |
| Armor blue (HUD) | `#3a9cff` |
| Bright text | `#f0f2f6` |
| Body text | `#cfd6e4` |
| Muted text | `#8a94a8` |
| HUD panel | `rgba(8,10,16,.74)` with a `#262c38` border |

Lamp light colours (`LAMP_COLORS` in `world/blocks.ts`): warm
`rgb(255,214,150)`, red `rgb(255,64,40)`, teal `rgb(70,205,255)`, green
`rgb(90,255,120)`.

**Colour space gotcha:** the renderer outputs linear colour and the texture
atlas uses raw values (`NoColorSpace`). A plain hex on a Three.js material is
sRGB-decoded and comes out much darker — that is why the old guns rendered
as black silhouettes. For view-model parts, go through `rawColor()` in
`weapons.ts`.

## World

- **Texture atlas:** 16-pixel procedural tiles (`drawTile` in
  `world/blocks.ts`). Surfaces are grimy and noisy, never clean gradients.
- **Decoration variants** (rusty, vented, piped and worn walls; piped and
  vented ceilings; chains) are cosmetic only. Ceiling art is direction-locked,
  so pipes have an X and a Z version.
- **Secret walls:** the `Cracked` tile has a deep black fracture with an amber
  gleam. Cosmetic worn cracks must stay visibly *softer* than it, or players
  lose the "this wall breaks" language.
- **Lighting:** baked from lamp blocks plus up to 6 dynamic lights (muzzle
  flashes, rockets, explosions). Rooms should read through pools of light and
  shadow, not uniform brightness.

## Enemies

Voxel rigs built from boxes, with jointed husk/brute limbs, a serpentine
husk chase and per-part gibs on death. Each has one readable silhouette and
one glowing tell:

| Enemy | Read |
|---|---|
| Husk | Hunched, rust-red, glowing eye slit |
| Arc Sentinel | Hovering teal drone with rotating fins; glows brighter as it charges |
| Ticker | Squat, hazard-striped, amber core that beeps faster before it blows |
| Brute | Bone-plated wall of meat with tusks; the arena boss |

Hits must read on the same frame: white-hot flash, a jolt and scale pop,
a thwack sound, knockback.

## First-person weapons

Built from `vmPart` boxes by `buildWeaponModel()` in `weapons/weapons.ts`.
The **floor pickup uses the same model** (scaled up 1.15×, with fog), so what
players see on the floor is exactly what they'll hold. Change a gun's look
there and both update.

- **Shading:** each box has baked per-face shade (lit from the upper left):
  top brightest, left side next, the facing and right sides darker, the
  bottom darkest. That's what makes the forms read.
- **Edges:** a 1-pixel edge drawn as a slightly larger back-face box, in a
  **darker shade of the part's own colour** (×0.55). **Not black.** A black
  outline was tried and rejected: it fought the world's look.
- **Glow parts** (sights, LEDs, coils, the shotgun bead) are full-bright and
  skip the room-light tint; everything else is tinted by the light where the
  player stands, with a high floor so the gun stays readable in dark rooms.
- **Detail budget:** one or two signature details per gun, in palette
  colours — three-dot green sights, red side-saddle shells, a red-dot
  optic, hazard bands, a ready LED, pulsing teal coils.
- **Motion is part of the art:** look sway, footstep-synced bob, landing dip,
  swing-in on switch, and per-gun actions (slide, pump, bolt, LED, coil
  charge). New guns should get an action too.
- **Muzzle flash:** an uneven starburst (warm for bullets, cool blue for the
  arc caster), plus a dynamic light so the walls flash.
- **Hand:** one bare, skin-toned right hand (`SKIN` / `SKIN_DARK`;
  `rightHand` in weapons.ts, attached by `attachHands` to the held model
  only — pickups stay handless) closed on every grip, with a hazard sleeve
  cuff and a bare two-segment forearm that thickens toward the elbow and
  drops nearly straight down toward the camera. Build the hand for the
  camera: it sits behind, left of and above the gun, so the back of the
  hand, the fingers on the near (-x) side and across the front, and the
  thumb along the slide are what read — a palm block behind the grip just
  looks like a cube floating behind it. Owner calls, in order: **no sleeved forearm
  bar** (an olive sleeve lying across the frame read as a "green stick";
  the bare arm angled down toward the camera is fine), **no Doom-style
  angled pose** (sampled, straight-on
  hold preferred; the `POSES` hook stays empty), **no trigger finger** (it
  was hidden behind the gun anyway), **skin instead of gloves**, and **no
  left hand** — every gun, including the scattergun and thumper, is held
  one-handed. The view model rides at
  `VM_Y = -0.21` (was −0.34) so the grips sit inside the frame.

## HUD and menus

Full layout and behaviour are in [UI_SPEC.md](UI_SPEC.md). The visual rules:

- **Type:** `'Courier New', Courier, monospace`, bold for numbers and
  labels, wide letter-spacing on small caps labels. Text gets a hard 1–2 px
  black drop shadow so it reads over any wall.
- **Panels:** dark translucent rectangles with a thin border and square
  corners. No rounded "app" cards (touch buttons are the exception: round
  thumb targets).
- **Icons:** slim, flat, solid glyphs — Font Awesome Free solid icons inlined
  as SVG (`ui/icons.ts`), plus hand-drawn bullet and shell rounds in the same
  style. Chunky pixel-art icons were tried and rejected as too thick. No icon
  font or CDN: the build must stay self-contained for Poki.
- **Wordmarks:** the title, pause and settings logos are extruded voxel
  letters (`startVoxelLogo` in `hud.ts`, 5×7 glyphs). Add a glyph to `GLYPHS`
  before using a new letter.
- **Primary buttons:** hazard-yellow outline with diagonal hazard stripes on
  both ends.

## Sector 4 "Biofoundry" (development preview)

Reference: `reference/sector4-biofoundry.png`. Authored in
`src/preview/biofoundry.ts`, reached with `?sector4` on any web build
(GitHub Pages included); the Poki build ignores it.
How it gets its look:

- **Its own block set** (`LabFloor`, `LabCeil`, `LabCeilGrate`, `LabWall`,
  `LabWallRust`, `LampViolet`, `TankGlass` — appended to the atlas, never
  used by the campaign): one big tile per block, one concrete panel per
  block, magenta emergency panels, and `TankGlass`, which is solid and a
  green lamp but is **never meshed** — a voxel tank showed its block grid,
  so the visible tank is decoration: a smooth translucent glass shell, a
  liquid fill with one surface line, bubbles, and a near-black voxel dummy
  floating inside (drawn opaque so it reads through the tint).
- **Purple ambient:** `bakeLighting([36, 26, 52])` instead of the campaign's
  near-black default — the wash on the tiles comes from that, not from more
  lamps. Magenta ceiling pairs, cyan over doorways, warm bands on the 2×2
  pillars, green from the tanks.
- **Decoration is instanced boxes** with the same baked per-face shade as the
  gun view models (and the same `rawColor` rule). Tank frames and fills,
  crimson growth hugging pillars and walls with
  orange nodes, slime puddles, the sealed-door frame and signs.
- **Signs are deliberately low-res** (~1 texel per screen pixel at 240
  lines); a large canvas minifies into unreadable speckle.

## Owner's calls

Art direction is the owner's decision. Decisions made so far:

| Decision | Why |
|---|---|
| Gun edges are a darker tint of each part, not black | A black outline didn't match the world |
| HUD follows the owner's desktop + mobile mockup | Agreed layout (see UI_SPEC.md) |
| Slim Font Awesome icons, not chunky pixel icons | The pixel icons felt too thick |
| The touch joystick is invisible until touched | A permanent resting ring was rejected |
| No "Sector 4" or sequel teases in the ending | The campaign is 3 sectors; don't promise content that doesn't exist |

When a change affects the look, show a screenshot and let the owner decide
before polishing further.
