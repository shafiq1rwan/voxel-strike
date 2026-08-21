# Enemy sprite skins (optional)

Enemies use procedural voxel rigs by default. Add a sheet here and declare it
in `manifest.json` to replace an enemy's model with a classic Doom-style
billboard sprite. All AI, physics, lighting tint, and hit flashes still apply.

`demo-husk.png` is a generated placeholder that demonstrates the format
(regenerate it with `node scripts/gen-demo-sprite.mjs`). Remove the `husk`
entry from `manifest.json` to go back to the voxel rig.

## Sheet format

One PNG per enemy kind (`husk`, `sentinel`). Fixed row order, one frame per
column, transparent background:

| Row | State  | Notes |
|-----|--------|-------|
| 0   | idle   | loops |
| 1   | walk   | loops, speed-scaled |
| 2   | attack | loops during the attack state |
| 3   | pain   | shown during hit-stagger |
| 4   | death  | plays once, last frame stays as the corpse |

Manifest entry:

```json
{
  "husk": {
    "file": "my-monster.png",
    "frameW": 48, "frameH": 48,
    "worldH": 1.9,
    "fps": 8,
    "counts": { "idle": 2, "walk": 4, "attack": 3, "pain": 1, "death": 5 }
  }
}
```

`worldH` is the billboard's in-world height (husk collision box is ~1.7 tall).
Frames render with nearest-neighbor filtering, so low-res pixel art is ideal.

When using itch.io packs, check the license before committing files to a
public repo — this folder is git-ignored except for the manifest, this file,
and the generated demo sheet.
