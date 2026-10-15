# UI and HUD spec

The in-game HUD, touch controls and menu screens: what's where, what each
element does, and the rules for changing them. Visual style (type, colour,
icons) is in [ART.md](ART.md). Code: `src/ui/hud.ts` (HUD + screens),
`src/ui/automap.ts` (automap + minimap), `src/core/touch.ts` (touch
controls), `src/ui/icons.ts` (icons).

## HUD — desktop

Follows the owner's mockup.

```
┌──────────────────────────────────────────────────────────────────────┐
│ [♥ 100 HP] [⛨ 0 ARMOR]   [▭ Find red keycard]          SECTOR 1 / 3 │
│ ┌────────┐                  ▲ 79m                       [MAP] [❚❚]  │
│ │minimap │                                              SCORE 000000 │
│ └────────┘                                              KILLS  0 / 35│
│ messages                                                     buffs  │
│                                  +                                  │
│                                                                     │
│                      tutorial hint strip                            │
│ 100 FPS            [1][2][3][4][5][▭]                  SCATTERGUN   │
│                         ‾‾‾                              ▮▮ 12 AMMO │
└──────────────────────────────────────────────────────────────────────┘
```

| Element | Id | Behaviour |
|---|---|---|
| HP pill | `#hp` | Red heart icon + value; pulses red at ≤30 HP (with a red vignette and heartbeat) |
| Armor pill | `#armor` | Blue shield icon + value |
| Minimap | `#minimap` | Desktop only. North-up, 31×31 cells around the player, green arrow; shows only explored cells, doors in lock colour, exit pad green, the untaken keycard blinking |
| Messages | `#messages` | Pickup and event lines under the minimap, fade after ~3.5 s, max 4 |
| Objective | `#objective` | Stage icon + text in the stage colour, then a rotating yellow arrow to the target and the distance (`HERE` when close). Flashes when the stage changes |
| Sector | `#obj-head` | `SECTOR n / 3` |
| MAP / pause | `#hud-map`, `#hud-pause` | Clickable whenever the mouse isn't captured; same as Tab/M and Esc |
| Score / kills | `#score`, `#kills` | Score with `×N` combo multiplier; kills turn green when the sector is cleared out. Not in the mockup — kept small under the buttons |
| Buffs | `#buffs` | QUAD / SHIELD / HASTE chips with seconds left |
| Crosshair | `#crosshair` | Green `+`; red on hit, gold on headshot, `✕` on kill |
| Weapon slots | `#slots` | 1–5; owned slots bright, active slot yellow with an underline bar |
| Keycards | `#keys` | Red key slot always shown (dim until held); blue/yellow only when held |
| Weapon + ammo | `#ammo-block` | Weapon name, ammo-type icon, count, `AMMO` label |
| Hint strip | `#hint` | First-run control hints (3 steps, sector 1 of the first solo run) |
| FPS | `#fps` | Bottom-left, small and dim |

Objective stages, in order: **Find red keycard** (keycard icon, red) →
**Open the red door** (door, red) → **Ride the lift up** (lift, yellow) →
**Step on the exit pad** (flag, green). Driven by `Game.objectiveStage()`.

Also: a red wedge around the crosshair points at whatever hurt you, a big
yellow streak popup on multi-kills, and full-screen flashes for damage,
pickups and shield hits.

## HUD — mobile (touch mode)

`body.touch-mode` is set when a coarse pointer is detected. The bottom
corners belong to the thumbs.

```
┌──────────────────────────────────────────────────────────────────┐
│ [♥ 100 HP] [⛨ 0 ARMOR]   [1][2][3][▭]               SECTOR 1 / 3 │
│ messages                [▭ Find red keycard]          [MAP] [❚❚] │
│                              ▲ 79m                   SCORE  KILLS│
│                                +                                 │
│                                               [⇄ 3 RIPPER]  ▮ 100│
│   (joystick appears                                              │
│    under the thumb)                          (JUMP)     ( FIRE ) │
└──────────────────────────────────────────────────────────────────┘
```

Differences from desktop:

- **No minimap.** The MAP button opens the full automap; any tap closes it.
- **Weapon slots move to the top** and show **owned weapons only**, as
  bigger tap targets.
- **Ammo** sits above FIRE (`#tammo`); the weapon name block is hidden.
- `#tmap` / `#tpause` sit exactly where the desktop buttons are (the desktop
  ones are hidden but keep their space).

### Touch controls

| Control | Behaviour |
|---|---|
| Joystick (left side) | **Invisible until touched.** A yellow ring appears under the thumb anywhere in the left zone and disappears on release |
| Look (right side) | Drag to aim. With aim assist on: magnetism, sticky aim and rotation assist |
| FIRE | Hold to fire |
| JUMP | Jump |
| **Weapon button** `#tweapon` | Above JUMP. Shows ⇄, the slot number and the weapon name. **Tap** = next owned weapon. **Swipe left/right** = previous/next. **Hold 280 ms** = weapon wheel |
| Weapon wheel `#twheel` | Owned weapons fan out in an arc above the button; the current one is outlined yellow. Slide onto one and release to pick it; release on the button to cancel |
| Auto-switch | Firing an empty weapon switches to a loaded one (shotgun → SMG → arc → pistol → rockets last). Touch only |
| MAP / pause | Top right |

The game is always landscape: held in portrait, the whole page rotates 90°
(`body.force-landscape`). `TouchControls.mapXY` converts touch coordinates
into the rotated space, and the weapon wheel uses layout offsets so it
matches.

## Screens

| Screen | Notes |
|---|---|
| Title | Voxel wordmark, *Enter the facility* (or *Continue · Sector N* + *New run* when a save exists), Co-op (hidden on Poki), How to play, Settings |
| How to play | Desktop and touch control lists |
| Settings | Sensitivity, master + music volume, FOV, pixelation, screen shake, aim assist, *New layout*. Saved on the device |
| Co-op lobby | Host shows a 4-character code; join types it |
| Pause | Resume, Settings, and a quit button (*Main menu*, or *Save & quit to menu* from sector 2 on) |
| Intermission | Sector stats; click to descend. Arms after 0.7 s |
| Death | *Retry sector* (sector-entry gear, health floored at 60) or *New run* |
| Results | CAMPAIGN COMPLETE, totals, *Play a new layout* / *Main menu*. Arms after 1.2 s |
| READY | After an ad break on desktop: one click to recapture the mouse |
| Graphics lost | Pauses on WebGL context loss; *Reload game* appears after 4 s |

Click-through screens **arm** after a short delay so a held trigger can't
skip them.

## Rules for changing the UI

- **Fit a phone.** Full-screen menus must work at 667×375 and 740×360
  landscape. `.tscreen` menus scroll if they must (centred by auto margins
  so they never clip at the top), and settings switch to a compact
  two-column grid under `max-height: 560px`. `features.mjs` #14 checks it.
- **Thumb targets:** touch buttons and slots at least ~30 px, and not at the
  top of the screen if they're used mid-fight.
- **Desktop clicks:** while the pointer is locked, clicks go to the canvas,
  not DOM buttons. HUD buttons stop `mousedown` so it isn't treated as a
  recapture click.
- **The automap canvas rule** must out-rank `#app canvas { width: 100% }`
  in `index.html` — hence the `#hud #…` selectors.
- **Tutorial text:** update the hints in `Game.updateTips()` (separate
  desktop and touch text) whenever controls change.
- **Icons:** add new ones in `ui/icons.ts`, and list any new Font Awesome icon
  in `public/THIRD-PARTY-NOTICES.txt`.

## Open questions

- Score, kills and buffs aren't in the mockup. They're kept small in the top
  right; the owner may prefer to hide them.
