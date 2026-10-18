# Poki thumbnail brief + image prompts

Store art for the Poki game page. Concept prompts in the same format as
`facility-sector-concept-prompt.md` and `sector4-monster-prompts.md`, meant
for an image generator with reference images attached. The results are
marketing art only; nothing here ships in the game bundle (`public/marketing/`
is stripped from `dist-poki/`).

Context: the first Web Fit Test (2026-10-18) measured 1.14% click-through
from category pages. The thumbnail is the only thing a browsing player sees
before clicking, so it is the whole fix for that number.

## Poki's rules (from the developer guide, checked 2026-10-18)

Static thumbnail — required before a fit test:

- Square, 1:1, at least 628×628 px. Full-bleed: no borders, padding,
  letterboxing or rounded corners (Poki masks the corners itself).
- **No text.** No title, no wordmark, no captions. Poki's own tests found
  text-free thumbnails perform better.
- One clear foreground subject on a simple, clean background. No collage of
  everything in the game.
- Suggest movement: mid-stride, weapon raised, something happening.
- Show what the game actually looks like. A thumbnail that promises a
  different game hurts both click-through and playtime.
- Strong contrast with the Poki page background `#83FFE7` (mint/aqua). Our
  dark steel + warm amber palette is good here. Do NOT let the arc caster's
  teal (`#34d0ff` / `#55e0ff`) or green exit light dominate — those sit
  close to `#83FFE7` and the tile will sink into the page.
- Must still read at small sizes (tiles can be ~100 px wide). Check every
  candidate scaled to 100×100 before choosing.
- After the fit test passes, thumbnail changes need Developer Support
  approval, so settle the art before resubmitting.

Animated thumbnail — required at soft release (after the fit test), plays on
hover over the static one:

- 1080×1080 (or larger) MP4, 1:1, 50 fps or higher, 4–6 s, muted, ≤100 MB.
- 2–3 scenes of 1–2 s each. Begin from the static artwork so the hover
  transition feels continuous. Hide non-essential UI, center the action
  (the square crop trims the sides), no mouse cursor.
- Best made from real gameplay capture, not generated: record at the
  game's native look, crop square. Scenes that fit the 1–2 s rule:
  husk lunge + shotgun blast, a barrel chain, the red door sliding open.

## Reference images to attach to every prompt

1. `scripts/shots/2-started.png` — a real gameplay frame (run
   `node scripts/smoke.mjs` against a dev server to regenerate it). This is
   the strict style reference: 240-line nearest-neighbour upscale, chunky
   voxels, box-built enemies, baked lamp light.
2. `facility-sector-concept.png` — the environment concept; use for
   architecture, lamp colour and the red keycard door.
3. A close-up gameplay frame of a Husk (and a Brute) — take one in-game with
   `?seed=12345`, or let the generator work from the enemy lineup shot used
   for the Biofoundry prompts. Enemies must be the procedural box rigs:
   rust-red Husk, the heavier Brute, the small sprinting Ticker.
4. `main-character-facility-operative.png` — only for concept B.

Palette to quote in prompts: hazard `#ffd028`, keycard red `#ff3428`,
steel `#566076`, void `#05060a`, warm lamp `rgb(255,214,150)`.

## Concepts, ranked

**A. Face full of Husk (recommended).** First-person, exactly as the game
plays: shotgun view model bottom-right, a Husk lunging at the camera one
step away, mouth open, lit from the side by an amber lamp, red keycard door
and hazard stripes behind. Movement comes from the lunge and the muzzle
flash. This is the honest version of the game and the composition Poki's
FPS tiles use.

**B. Operative vs Brute.** Third-person hero shot: the Facility Operative
(cyan visor, default grey armour) mid-stride, shotgun up, a Brute charging
out of the dark behind him. Gives the tile a character and reads well at
100 px. Risk: the shipped game never shows the operative (gun-only view
model), which collides with Poki's "match the game" rule. Use this only if
the play-as-operative arms ship in the Poki build, or as the animated
thumbnail's opening frame with gameplay following.

**C. Barrel chain.** The explosion moment: a row of green barrels going up,
a Husk thrown by the blast, hazard stripes, orange light on everything.
Highest energy, least identity. Good as a second candidate to test against
A if Poki lets you swap during the fit test.

Generate each at 1024×1024 or larger (never a 16:9 crop), 3–4 variants,
then downscale to 100×100 and pick the one whose subject still reads.

## Prompt A — Face full of Husk

Use case: stylized-concept
Asset type: square store thumbnail for VOXELSTRIKE, a browser retro voxel FPS. Final image is 1:1, full-bleed, no borders, no rounded corners.
Primary request: one first-person combat moment that looks exactly like a frame of the real game, composed for a tiny square tile. One subject only: a Husk enemy lunging at the camera.
Input images: Image 1 is a real gameplay screenshot and the STRICT style reference: match its chunky voxel scale, grimy 16px-style textures, hard nearest-neighbour pixels, flat box-built enemy, baked lamp light. Image 2 is the facility environment concept: use its riveted steel walls, pillars, amber ceiling lamps, hazard stripes and red keycard door. Image 3 shows the Husk rig: a rust-red humanoid built from about 20 large boxes, flat colours, no sculpted anatomy.
Scene: the Husk is one stride from the player, filling the centre of the frame from knees to head, torso twisted mid-lunge, one arm reaching toward the camera, square mouth open. Behind it a short steel corridor ends at a closed red security door with a small red keycard reader, yellow-black hazard stripes on the floor edge. Nothing else in the room.
Style: everything built from large rectilinear voxel boxes, coarse pixel edges, flat per-face shading, noisy tiled textures. Readable silhouettes over detail. No photorealism, no smooth surfaces, no high-poly sculpting, no bloom haze.
Lighting: a warm amber lamp just out of frame top-left pools light on the Husk's face and shoulder and the near wall; the rest falls to near-black `#05060a`. Red light from the door only on the far floor. Keycard red `#ff3428` only on the door, hazard yellow `#ffd028` only on the stripes. No teal, no green, no mint or aqua anywhere.
Composition: square. Husk centred, head in the upper third, eye line at the camera. Bottom-right corner: the game's grey box-built shotgun view model with a small green sight, muzzle flash just starting, pointed at the Husk's chest; it may crop at the frame edge. Bottom-left corner kept simple so the subject reads at 100×100 px.
Text: none. No HUD, no logo, no title, no caption, no watermark.
Constraints: original game art, one enemy only, no gore, no blood spray, no human faces, no cinematic depth of field, no letterboxing. Steel `#566076` and warm rust brown carry the palette.

## Prompt B — Operative vs Brute

Use case: stylized-concept
Asset type: square store thumbnail for VOXELSTRIKE, a browser retro voxel FPS. Final image is 1:1, full-bleed, no borders.
Primary request: a third-person hero moment: the game's main character, the Facility Operative, striding toward the camera with his shotgun raised while a Brute charges out of the dark behind him. One hero, one threat, nothing else.
Input images: Image 1 is a real gameplay screenshot and the STRICT style reference for scale, textures, pixel edges and lighting. Image 2 is the Facility Operative concept sheet: reproduce him exactly: grey-blue box armour, cyan visor slit, small cyan chest LED, no helmet changes, no extra gear. Image 3 is the environment concept for walls, pillars and lamps. Image 4 shows the Brute rig: the Husk skeleton at heavier proportions, rust-red, flat box parts.
Scene: an industrial facility hall. The Operative is three-quarter toward the camera in the lower half of the frame, mid-stride, the game's grey box-built shotgun held across his chest and swinging up, visor glowing. Behind and above him, further down the hall, the Brute is mid-charge, shoulders forward, lit red by the keycard door it just broke past. A green barrel at the hall's edge is optional, unlit.
Style: all figures and architecture from large rectilinear voxel boxes, flat per-face shading, coarse pixel edges, noisy 16px-style tiled textures. Operative and Brute must look like the same construction method as the in-game rigs. No smooth sculpting, no realistic anatomy, no high-poly detail, no glossy materials.
Lighting: one warm amber lamp above the Operative lights his visor side and shoulder; red door light rims the Brute; everything else drops to near-black. Hazard yellow only on floor stripes. No teal or mint light except the small cyan visor and LED, which must stay small.
Composition: square. Operative's helmet in the upper-middle third, feet cropped at the bottom edge, Brute smaller and higher at the far end to show depth. Strong dark background behind both so the two silhouettes read at 100×100 px.
Text: none. No HUD, no logo, no caption, no watermark.
Constraints: original characters only, no human face visible, no gore, no second enemy, no collage panels, no letterboxing, no depth-of-field blur.

## Prompt C — Barrel chain

Use case: stylized-concept
Asset type: square store thumbnail for VOXELSTRIKE, a browser retro voxel FPS. 1:1, full-bleed, no borders.
Primary request: the game's most explosive moment: a row of green explosive barrels detonating in sequence in a steel corridor, throwing a Husk enemy into the air, seen first-person with the pistol in the corner.
Input images: Image 1 is a real gameplay screenshot and the STRICT style reference. Image 2 is the facility environment concept for the corridor, pillars and hazard stripes. Image 3 shows the Husk rig and the game's green hazard barrel (a plain green box-built drum with a lighter band).
Scene: a straight corridor, five green barrels along the right wall; the nearest two are mid-explosion as blocky orange-yellow fireballs built from square particle chunks, the third is cracking, the far two still intact. A Husk is tumbling through the air in front of the blast, arms and legs splayed as rigid box parts. A pillar on the left, hazard stripes on the floor, a steel ceiling with pipes.
Style: voxel boxes everywhere, square pixel-chunk particles and smoke, flat shading, hard pixel edges, no soft volumetric fire, no realistic smoke, no lens flare.
Lighting: the explosion lights the whole corridor orange from the right; shadows fall left and go near-black. Hazard yellow `#ffd028` on the stripes only. No green except the intact barrels, no teal anywhere.
Composition: square. The two fireballs and the thrown Husk fill the centre and upper-right; the pistol view model sits bottom-right with its small green sight. Keep the lower-left quadrant quiet. Must read as "explosion + enemy" at 100×100 px.
Text: none. No HUD, no logo, no caption, no watermark.
Constraints: no gore, no blood, one enemy only, no letterboxing, no photorealism.

## After generating

- Downscale each candidate to 100×100 and 60×60. If you cannot tell what
  the subject is in two seconds, discard it.
- Put the finalist on a `#83FFE7` background to check it does not blend.
- Keep the chosen source PNG at full size in `public/marketing/` (the Poki
  build strips that folder, so committing it is safe) and upload the
  628×628+ export to the Poki dashboard.
- For the animated thumbnail, start the clip on the static frame, then cut
  to two real gameplay scenes captured from the Poki build.
