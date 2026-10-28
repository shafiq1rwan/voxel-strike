# Facility prop implementation review

2026-10-28, after comparing the generated game with the sheets.

The implementation followed many of the box recipes, but the surrounding
rendering and composition changed their visual meaning. Dimensions alone did
not carry the reference's look into the game.

| Mismatch | Correction |
|---|---|
| Five-block walls dwarfed the 1.5–2.7-high furniture | Dressed service rooms now have three blocks of headroom; the arena, key, exit and Power Link rooms retain their original heights |
| Generic random noise covered every metal face | Facility prop batches now use flat palette colours with stronger asymmetric face shading; other themes retain their material treatment |
| Large hanging cubes dominated the scene | Dressed rooms use the actual E8/S8/R8 wall fixtures, with small local baked light pools; their old ceiling/hanging lamps are removed |
| A luminous face did not actually light its surroundings | Visible worklights and machine heat slots now contribute static light to the voxel lighting bake |
| Random fill could leave a checkpoint with just an inspection table | Attempt identifying furniture before random fill; retain clearance and use shallow furniture such as lockers when a deep centrepiece cannot fit |
| Floor exclusion zones prevented high wall lamps/cameras from appearing | High fixtures may clear floor-item zones, while doorways, secrets, tall props and other fixtures still exclude them |
| Transformer top terminals disappeared behind the fins | Raise the body/terminal support so terminals reach the specified 2.45 envelope without adding boxes |

## Actual captures

- [Before / revised spawn rooms, seed 12345](../../scripts/shots/facility-props-review/before-after.png)
- [Revised guard booth, seed 1](../../scripts/shots/facility-props-review/seed1/2-landmark-checkpoint.png)
- [Revised transformer, seed 1](../../scripts/shots/facility-props-review/seed1/3-landmark-generator.png)

These are actual game-renderer captures with HUD/enemies hidden, retaining
the room geometry, lighting and pickups. Test images live in the git-ignored
`scripts/shots` folder; regenerate them with
`node scripts/review-facility-props.mjs <url-with-seed> <output-directory>`.
The source PNG sheets remain unchanged.

## Verification and remaining difference

Build, smoke, the full campaign/endless e2e suite and the dedicated 36-layout
Facility constraint checks pass.
A separate comparison against the saved pre-correction generator also matched
36 layouts' room footprints, enemies, pickups, doors, lift, starter crate and
Power Link placements. Props still use two instance batches and no additional
dynamic lights.

The reference heroes are staged illustrations with soft contact shadows,
tightly selected furniture and a different camera composition. The game
retains its low-resolution renderer and procedural room arrangements. This
correction brings scale, materials and lighting closer; it is not a claim
that every generated room reproduces a reference hero pixel for pixel.
