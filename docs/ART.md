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
- **Low-res on purpose.** The game renders a few hundred lines tall and
  upscales with nearest-neighbour: 480 lines by default on desktop, 320 on
  touch devices (owner's call, 2026-10-18; 180 everywhere was tried in
  0.3.10 and cost sector 1 clears — distant enemies became a blur), with
  180 / 240 / 320 / 480 in Settings. Design details for the chunkiest
  common setting, 240: a 1-pixel feature there is about 0.006 units at
  arm's length. Anything
  finer disappears or shimmers.

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

Facility monster revisions follow `reference/sector-monsters-v2` sheets 01–02:
the Sentry Bud has a deep vented base and thick paired lids; the Clamp Guard
has splayed feet, large amber shoulder pistons and closing C jaws; the Wire
Leech has four arched supports, heavy feet and an open copper square coil
which stands up to warn and folds down in recovery. Keep these large shapes
readable at 320 and 240 lines. Static boxes bake per moving pivot without
flattening the hinges or turning the coil opening into a hit surface.

Optional solo Overload rooms use a compact procedural steel console with a
cyan screen and a nearest-filtered canvas sign reading **OVERLOAD / OPTIONAL**.
The screen turns amber during its dangerous two-wave cycle and dim steel
after a reward is claimed. Its hazard stripe marks that encounter; it has no
green exit cue. Geometry stays box-built, with a matching collision box and
explicit disposal on sector teardown. Terminal shaders/textures warm up with
the level. No generated artwork is loaded at runtime.

- **The exit room** follows `reference/exit-lift-red-room-v1.png` (owner's
  call; an exit blast door was tried first): a small mechanical service lift
  — two stout guide masts, a crossbrace with an EXIT LIFT plate and amber
  lamps, a drive box with an amber UP light, a dark grated deck with a thin
  hazard rim and one pale chevron, carriage blocks and amber-striped side
  rails that ride with it, status lamps amber below and green when docked —
  yellow tube railing along the ledge, a green EXIT sign on the wall over
  the pad, warm work lamps with green only over the destination, and crate
  stacks at the ledge's foot. No holographic beams.
  The room has at least a 10-by-10 footprint, a dark panelled ceiling,
  riveted gray wall panels with sparse rust runs, matching panelled ledge
  faces and steel floor plates. Two small warm work lamps and amber boarding
  lamps light it; green has a short throw around the fixed, segmented exit
  threshold. Lift steel has pixel wear, bolt plates and per-face shading.
  Service props (`entities/exit-room-props.ts`) add a vented motor cabinet,
  wall status display, floor conduit, corner toolbox, entrance intercom,
  emergency light and high fan grille. Placement follows the boarding axis
  and keeps the lift lane clear. Web shortcut: `?exitroom&seed=12345`.
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

Voxel rigs built from boxes, with jointed limbs, a restrained weaving
Husk chase and per-part gibs on death. The rigs follow the sheets in
`reference/enemy-upgrade-*.png` and the budgets in
`reference/enemy-upgrades.md` (large boxes only, six or seven flat colours
each, no greebles). Each has one readable silhouette, one glowing tell, and
a windup pose that reads before the hit lands:

| Enemy | Read |
|---|---|
| Husk | Lean rust-red hunter, 1.64 tall: low forward head with a dark visor and amber eye slit, long thin arms, small dark claw hands, a low back ridge. Walk/run: actual distance drives opposing strides, knee lift and arm swing; stationary feet settle. Compact windup, forward rake at impact, grounded driving lunge and eased recovery |
| Arc Sentinel | Steel-teal hovering box, one cyan optic between two pale shutters, four thick paddles on corner hinges. Charging spreads and lifts the paddles and slides the shutters out; recovery folds them in |
| Ticker | Low hazard-yellow crawler, six angled legs, dark front bezel with the amber core. Arming plants the legs and opens the two side lids over an amber battery while it beeps |
| Brute | Broad rust-red heavy with two pale bone shoulder slabs, a chest slab, brow plate, two tusks, huge dark fists and a hunched back. Windup: arm across the torso (backhand) or reared back, head down (charge). Wall stun: bent forward, fists near the floor |
| Vatborn *(sector 4, Biofoundry only)* | Pale gray-beige hunched specimen. Its right arm is a club: a huge olive-stained shoulder, a thick forearm in a dark restraint cuff with a broken bolt, and an enormous dark fist that hangs to the floor (the silhouette's defining feature — keep it oversized). Thin left arm, dark chest band with a green mark, blunt head pushed forward with an amber eye slot, olive shins, dark boots. Seen from the front, the club is on the viewer's left. Reference: `reference/sector4-vatborn.png` |

The Husk has its own gait (`animateHusk`): hip/knee pivots reuse the same 23
boxes, the lowest support sole stays at the floor, and the torso tilts
toward local -Z. Avoid a fixed airborne pose for its grounded lunge. Its
3.2u/s chase uses time-based steering and faces the travel direction; the
small weave fades near its 1.55u standoff. Claw timing, damage, collider and
the other enemies' animation remain independent of these gait changes.

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
- **The operative's hands, on every build** (OFF in 0.3.14, `OPERATIVE_ARMS`
  in game.ts, to test whether they cost playtime; owner's call, 2026-10-28,
  after seeing them in the `?play=operative` preview): his charcoal gloves
  and light-steel forearm guards on every gun, the left hand riding the
  shotgun's pump. Before that the gun floated alone, Doom-style: earlier
  hands (gloved and bare, one- and two-handed, an olive sleeve that read as
  a "green stick", a Doom-style angled-in pose) were all dropped. The body
  under you and the helmet visor stay preview-only.

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

## Sector 4 "Biofoundry"

Reference: `reference/sector4-biofoundry.png`. Campaign sector 4 is
generated by levelgen in the `'biofoundry'` theme and dressed by
`src/preview/biofoundry.ts`; `?sector4` on web builds still opens the
hand-built preview map, dressed by the same code.
How it gets its look:

- **Its own block set** (`LabFloor`, `LabCeil`, `LabCeilGrate`, `LabWall`,
  `LabWallRust`, `LampViolet`, `TankGlass` — appended to the atlas, used
  only by Biofoundry sectors): one big tile per block, one concrete panel per
  block, magenta emergency panels, and `TankGlass`, which is solid and a
  green lamp but is **never meshed** — a voxel tank showed its block grid,
  so the visible tank is decoration: a smooth translucent glass shell, a
  liquid fill with one surface line, bubbles, and a near-black voxel dummy
  floating inside (drawn opaque so it reads through the tint). Occupied
  tanks (an amber status light on the cap) are built from separate meshes
  so the breach can play. The occupant is the real Vatborn, dormant and
  tinted green by the liquid: it thrashes and pounds the glass while the
  light blinks for 1.2 s, then the room-facing pane bursts, liquid gushes
  out as droplets that fall, splash and skid across the tiles while the
  tank drains and the puddle spreads, and the Vatborn wades out through
  the gap.
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

## Main character: the Facility Operative

Reference: `reference/main-character-facility-operative.png`. Built in
`src/entities/operative.ts` (`buildOperative()`), viewed with `?operative`
on any web build (lazy-loaded; never in the Poki build, whose bundle also
drops the reference art). The viewer has a SHEET mode laid out like the
concept sheet (front / side / back orthographic, 3/4 perspective; the side
view is turned ~14° towards the front, as drawn), an ORBIT mode (drag,
zoom, snap views, walk cycle), 240P for the in-game read and COMPARE, which
puts the reference sheet above the live model.

- **The image wins over the notes' 26-box table** (owner's call): sizes were
  measured off the sheet. That adds a dark visor frame proud of the face, a
  back spine that rises to helmet height, two-step boots (ankle + foot),
  elbow tabs on the forearm guards and a knee band seen front and back.
  The owner then asked for fingers that fold like a real hand.
- **Hands are jointed** (`buildHandRig`, shared by the rig and the first-
  person arms): a palm (the metacarpals) with a dark steel knuckle plate on
  its back; four fingers of three phalanges each (proximal : middle : distal
  ≈ 1 : 0.7 : 0.55, the middle finger longest, the little finger shortest)
  hinged at the knuckle, middle and tip joints; a thumb rooted low on the
  palm side with its own metacarpal and two phalanges that swings across
  the palm as it folds. One curl value folds every joint at natural ratios
  (the middle joint most, the tip least); `pose()` sets explicit angles for
  holds the ratios can't make. Rigid stiff blocks read as wrong — the joints
  are the point. The viewer's FINGERS button cycles relaxed / fist / open;
  holding a gun closes them round the grip. 65 boxes with the helmet on.
- **First-person hands** (`buildFirstPersonHand`) pose that rig in each
  gun's own space: 'grip' round a vertical grip (knuckle ~90°, the rest
  round the far corner; the trigger finger nearly straight along the frame),
  'side' (a C-grip on the near side of a handguard, pump or tube, fingers
  over the top — the support hold the camera can see; under the gun, the
  gun hid it) and 'cradle' (from below). The forearm starts at the wrist and
  angles down and out, not at the camera, or it covers its own hand. At 240
  lines the charcoal fingers are small dark shapes against the dark guns.
- **Palette** sampled from the sheet (front colour ÷ the front shade): light
  steel helmet, shoulders, forearm guards, knees and spine; dark steel chest
  plate, backpack and legs; steel abdomen and pelvis; charcoal gloves,
  belt, respirator and ankles; cyan visor + chest light (full-bright).
- **Edges are slightly rounded** (radius 0.009, as on the sheet) so they
  catch the light.
- **Shading:** `buildOperative({ shading: 'lit' })` is Lambert for a lit scene
  (the viewer has an ambient + front key + back fill rig, so the back reads
  as bright as the front, like the sheet). The default `'baked'` bakes a shade
  per normal direction into vertex colours for the light-less game scene.
  Both get sparse pixel scuffs from a shader hash in box-local space.
- **Rig:** waist → neck, shoulders → elbows; hips → knees; a socket on the
  right glove. Faces -Z, wearer's right is +X. Shoulder caps ride the torso
  (on the arm they tipped up whenever it came forward).
- **Guns:** `rig.hold()` carries the real `buildWeaponModel` gun (×0.85)
  the way a shooter does, per `OPERATIVE_GRIPS[id].stance`:
  'shoulder' (shotgun, SMG, arc caster) seats the stock's butt in the right
  shoulder pocket, blades the body ~30° (part hips, part waist) so the left
  shoulder comes forward — that is what lets the short arms reach the
  pump / fore-grip — turns the head back to face front and tips it onto the
  stock; 'launcher' rests the tube on top of the right shoulder; 'pistol'
  is a squarer two-handed stance with both arms out. Both arms two-bone
  solve onto the grip and fore-end points. Held straight out in front at
  chest height with both arms locked (the first try) it read as zombie arms.
- **First-person arms** (the `?play=operative` preview): each forearm runs
  from its hand back towards its own bottom corner of the screen; steeply
  down it hung under the gun like a brick, straight at the eye it hid its
  own hand. They're drawn at ×0.68 — at the eye the full-size bracers
  filled the corner. The gun is carried higher (`vmY -0.2`).
- **Helmet off:** `rig.setHelmet(false)` swaps the helmet, visor, frame and
  respirator for a bare human head after the Facility Survivor note
  (`reference/main-character-human-survivor.md`): skin `#b9825f`, short dark
  hair (cap, back, sides), small dark eyes, flat brows, a cuboid nose and a
  mouth line. The head is a touch larger than the note's (.30 × .28 × .28)
  so it holds its own on the armour; the suit collar stays. Skin and hair
  take no scuffs.
- **Play as the operative** (`?play=operative[&helmet=0]`, PLAY FPS in the
  viewer; opt-in preview, not the shipped look): his gloves and forearm
  guards hold every gun, forearms running down and back off the bottom of
  the screen, the gun carried higher (`vmY -0.25`) so they read. Looking
  down shows the belt, legs and walking boots; the chest, shoulder caps and
  backpack are hidden because the eye sits 9cm above them and they filled
  the screen. Helmet on adds a faint visor frame.
- **Motion:** `animate(t, walk)` blends idle breathing and a walk cycle (the
  knee folds while its leg swings forward; the other way round reads as
  walking backwards); `jump(t)` plays crouch → take-off → tuck → absorbing
  landing, with the gun held level throughout.

## Owner's calls

Art direction is the owner's decision. Decisions made so far:

| Decision | Why |
|---|---|
| Gun edges are a darker tint of each part, not black | A black outline didn't match the world |
| HUD follows the owner's desktop + mobile mockup | Agreed layout (see UI_SPEC.md) |
| Slim Font Awesome icons, not chunky pixel icons | The pixel icons felt too thick |
| The touch joystick is invisible until touched | A permanent resting ring was rejected |
| No teases past the last sector | The campaign is 5 sectors — 3 facility, 2 Biofoundry (both added 2026-10-18 at the owner's request); the ending and the facility terminal never promise content that doesn't exist |
| Sector 3 → 4 goes through a facility terminal | Owner's request: typed message, then a transition. Cyan phosphor on void with scanlines, hazard yellow only for warnings, CRT-off collapse into a violet fade |
| The Facility Operative matches the concept image, not its notes' simplified box table | "It looks exactly like the image" |

When a change affects the look, show a screenshot and let the owner decide
before polishing further.
