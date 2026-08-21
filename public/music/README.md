# Soundtrack (optional)

The game ships with no music and stays silent. To enable the soundtrack:

1. Drop audio files (`.mp3` or `.ogg` recommended — smaller than WAV) into this
   folder.
2. Point the slots at them in `manifest.json`:

```json
{
  "menu": "menu-theme.mp3",
  "ambient": "dark-drone.mp3",
  "combat": "combat-loop.mp3"
}
```

Slots:

- **menu** — plays on the title screen
- **ambient** — plays while exploring
- **combat** — crossfades in while an alerted enemy is nearby, and lingers a
  few seconds after the fight ends

Any slot may be left `""`. Missing slots fall back: combat → ambient → menu,
so a single ambient track can carry the whole game. Tracks loop seamlessly and
crossfade over ~2 seconds. Volume is the **Music volume** slider in Settings,
scaled by master volume.

Suggested sources (check each license before committing files to a public
repo — this folder is git-ignored by default for that reason):

- Kenney (CC0, no credit needed): https://kenney.itch.io/kenney-game-assets
- LonePeakMusic dark ambient pack (free, commercial ok):
  https://lonepeakmusic.itch.io/no-copyright-dark-ambient-music-pack
- itch.io free dark/ambient music: https://itch.io/game-assets/free/tag-dark/tag-music
