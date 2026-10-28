# UI and HUD spec

The in-game HUD, touch controls and menu screens: what's where, what each
element does, and the rules for changing them. Visual style (type, colour,
icons) is in [ART.md](ART.md). Code: `src/ui/hud.ts` (HUD + screens),
`src/ui/automap.ts` (automap + minimap), `src/core/touch.ts` (touch
controls), `src/ui/icons.ts` (icons).

## HUD — desktop

The optional solo Overload terminal (hidden from players: web builds with `?overload` only) adds `#overload-action` near the bottom
center when in reach: **E · Inspect Overload** (touch: **TAP**). While active
it shows the wave and remaining enemy count without replacing the campaign
objective. An explored terminal is a cyan outlined square on both maps.
Inspecting pauses solo gameplay and shows **OPTIONAL FIGHT / OVERLOAD** with
**Defeat 2 waves of enemies. Pick one reward: shotgun upgrade, repair or ammo.**
The actions are **Start fight / Not now**. Reward cards appear after victory under **CHOOSE ONE**:
an icon, name and one short benefit; the shotgun also shows **Slower firing**.
No rules paragraphs or reward cards appear before activation. The frame uses
border-box sizing with decorative corners inset; its inner content scrolls
only if needed on a small viewport. The Overload class is applied before
the screen is mounted to avoid a transient default-screen layout. Caps and run
duration remain in button tooltips. The same terminal offers **Later**;
Enter/Space or Escape returns without claiming. Claimed terminals close.
Unavailable rewards are disabled; repair/ammo respect caps and Focus cannot
stack. Desktop pointer lock is released for these menus and requested again
on return, with no ad break. Cards wrap/scroll on short phone screens.
The weapon label becomes **FOCUSED SCATTERGUN** when that sidegrade is active.

Follows the owner's mockup.

```
┌──────────────────────────────────────────────────────────────────────┐
│ [♥ 100 HP] [⛨ 0 ARMOR]   [▭ Find red keycard]          SECTOR 1 / 5 │
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
| Objective | `#objective` | A panel with a 4px accent bar in the stage colour, the stage icon (20px, glowing in that colour), the step in caps (*FIND THE RED KEYCARD*) and three step pips (keycard / door / lift + pad: done grey, current lit). Below it the navigator: a notched yellow arrow (a navigation dart, never a plain triangle: that read the same from every side once rotated) in a small round dial, turned toward the target, plus the distance (`HERE` when close, and the dial lights up). Flashes when the stage changes |
| Sector | `#obj-head` | `SECTOR n / 5` (co-op: `/ 3`); `DEPTH n` with no total past sector 5 |
| Boss bar | `#bossbar` | Inside `#objective`, under the objective line, only while a boss is awake. Skull + `BROODKEEPER`, a burgundy fill with a pale chip that drains behind it, and *CORE EXPOSED* in orange (bar border turns orange too) while the chest is open. Hidden on defeat. Narrower on touch |
| MAP / pause | `#hud-map`, `#hud-pause` | Clickable whenever the mouse isn't captured; same as Tab/M and Esc |
| Score / kills | `#score`, `#kills` | Score with `×N` combo multiplier; kills turn green when the sector is cleared out. Not in the mockup — kept small under the buttons |
| Buffs | `#buffs` | QUAD / SHIELD / HASTE chips with seconds left |
| Crosshair | `#crosshair` | Fixed white four-bar cross with an open center and dark backing for contrast. Separate diagonal hit marker: white on hit, gold on headshot, larger red on kill (gold for a headshot kill). Feedback never moves or scales the aiming bars. **Amber corner brackets** (44px) show while it rests on something breakable or usable within 14u — a crate, barrel, cracked wall or the Power Link node — and no enemy is in front |
| Weapon slots | `#slots` | 1–5; owned slots bright, active slot yellow with an underline bar |
| Keycards | `#keys` | Red key slot always shown (dim until held); blue/yellow only when held |
| Weapon + ammo | `#ammo-block` | Weapon name, ammo-type icon, count, `AMMO` label |
| Hint strip | `#hint` | First-run control hints (4 steps, sector 1 of the first solo run): controls; follow the yellow arrow; bash (V, desktop) or FIRE on both sides (touch) + switching + map; *Crates and barrels break — shoot them. Amber brackets on the crosshair = breakable* |
| Next skin | `#unlock` | Bottom-left (above the FPS counter on desktop; in the corner on touch — under the score it sat beneath the touch weapon button): *NEXT SKIN* + swatch + name, a cyan progress bar and *goal n / N*. Pops in when the count moves (and for 5 s at each sector start), fades after ~3 s |
| Skin unlocked | `.skin-unlocked` | Cyan *SKIN UNLOCKED* stamp below the crosshair (streaks sit above it), the skin's swatch + name + gun, *EQUIPPED*; ~2.8 s. Earned on a menu (e.g. a sector clear), it waits until play resumes; several queue 3 s apart |
| Room clear | `.room-clear` | A room's last enemy is down: a small steel-bordered *ROOM CLEAR* stamp just under the objective (bottom centre on touch, clear of the streak popup), ~1.5 s, a two-note chime, and the objective box pulses — move on. Once per room per sector; never exit green |
| Secret found | `.secret-found` | Big gold *SECRET FOUND* stamp with *+500* under it (and *THE THUMPER IS IN HERE* if not owned yet), a warm edge glow `#secret-glow`, ~2.6 s. Near the cracked wall beforehand, a one-per-sector line: *That cracked wall looks weak. Shoot it or bash it (V).* |
| FPS | `#fps` | Bottom-left, small and dim |

Objective stages, in order: **Find the red keycard** (keycard icon, red) →
**Open the red door** (door, red) → **Ride the lift up** (lift, yellow) →
**Step on the exit pad** (flag, green). Driven by `Game.objectiveStage()`.
On a boss level, **Kill the Broodkeeper** (skull, orange) comes first and the
arrow points at the boss.

Also: a red wedge around the crosshair points at whatever hurt you, a big
yellow streak popup on multi-kills, and full-screen flashes for damage,
pickups and shield hits.

## HUD — mobile (touch mode)

`body.touch-mode` is set when a coarse pointer is detected. The bottom
corners belong to the thumbs.

```
┌──────────────────────────────────────────────────────────────────┐
│ [♥ 100 HP] [⛨ 0 ARMOR]   [1][2][3][▭]               SECTOR 1 / 5 │
│ messages                [▭ Find red keycard]          [MAP] [❚❚] │
│                              ▲ 79m                   SCORE  KILLS│
│                                +                                 │
│                                                      [⇄ 3 RIPPER]│
│   (joystick appears                                      (JUMP)  │
│    under the thumb)                            ▮ 100    ( FIRE ) │
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
| Second FIRE `#tfire2` | (outside playtesters, 2026-10-27) A 76px FIRE on the LEFT above the move stick (left 26px, bottom 56%), so the left thumb shoots while the right aims. Layered over the stick's zone: a tap on it never starts the stick. Either FIRE holds the trigger; letting go of one keeps firing while the other is held. There is no touch BASH button any more (it was clutter); desktop keeps V / right mouse |
| **Weapon button** `#tweapon` | Above JUMP, in a column against the right edge with FIRE (anything further in gets hit by look swipes). Shows ⇄, the slot number and the weapon name. **Tap** = next owned weapon. **Swipe left/right** = previous/next. **Hold 280 ms** = weapon wheel |
| Weapon wheel `#twheel` | Owned weapons fan out in an arc above the button; the current one is outlined yellow. Slide onto one and release to pick it; release on the button to cancel |
| Auto-switch | Firing an empty weapon switches to a loaded one (shotgun → SMG → arc → pistol → rockets last), on every device. Any gun but the sidearm is THROWN at the target as it goes (a melee-weight hit) and lands as a pickup that gives it back empty; with nothing loaded it's a dry click |
| MAP / pause | Top right |

The game is always landscape: held in portrait, the whole page rotates 90°
(`body.force-landscape`). `TouchControls.mapXY` converts touch coordinates
into the rotated space, and the weapon wheel uses layout offsets so it
matches. Rotated, every screen gets the same phone layout as a landscape
phone of that size (CSS sizes use the game-space `--vw` / `--vh`, and
each phone media query has a rotated twin), and a menu that's still too
long scrolls with a swipe along the game's vertical (TouchControls does it
by hand: the browser pans in screen directions).

## Screens

| Screen | Notes |
|---|---|
| Title | Kept deliberately bare so the goal and the button are all a first visitor reads: voxel wordmark, *ESCAPE THE FACILITY*, three numbered step tiles with the in-game objective icons and colours (1 *Find the red keycard*, 2 *Open the red door*, 3 *Ride the lift out*), one big *PLAY* (or *Continue · Sector N* / *Continue · Depth N* with a quiet *New run* beside it on the same row when a save exists), one line of controls on a desktop first visit (*WASD move · MOUSE aim · CLICK shoot*; never on touch — the first run's tips teach the thumbs in play), a *NEXT SKIN* strip at the bottom centre, in the footer between best score and version (swatch, skin + gun, goal, a cyan bar, n/N; a plain line; on short screens it takes its own centred row above score / version), a Settings gear in the top-right corner and an **Armory** button in the top-left (`#title-armory-btn`: cyan-edged, gun icon + *ARMORY* + owned count *n/22*; on short screens icon + count only so it clears the wordmark). Footer: best score / deepest depth when there is one, and the version. No tagline, no How to play panel (the first run's hint strip teaches controls). The *NEW SECTOR* banner (hazard-yellow tag on a violet strip: *THE BIOFOUNDRY · SECTORS 4–5 · DON'T WAKE THE TANKS*) shows only to RETURNING players (`voxelstrike-tutorial-done` set) until they reach the Biofoundry (`voxelstrike-biofoundry-seen`). Returning players see a shorter title: no *ESCAPE THE FACILITY*, step tiles or controls line — wordmark, banner (while it applies), *Continue* + *New run* (or *PLAY*), the *NEXT SKIN* strip and the footer; the full stack scrolled on phones. Same on web and Poki; fits 667×375 without scrolling. Co-op is hidden everywhere; web builds show it with `?coop` (development) |
| Settings | Sensitivity, master + music volume, FOV, pixelation (180 / 240 / 320 / 480 lines; default 180 on every device), screen shake, aim assist, *New layout*. Saved on the device |
| Co-op lobby | Host shows a 4-character code; join types it |
| Pause | Resume, Settings, *Armory*, and a quit button (*Main menu*, or *Save & quit to menu* from sector 2 on) |
| Armory | `#armory-screen`. A near-solid dark backdrop (the scene doesn't show through). Header: a bright *◀ Back* (white on dark, cyan on hover), *ARMORY*, *SKINS n / 22*, and a yellow-outlined *Upgrades · N scrap* that opens the Upgrades screen (Back returns to the Armory). Tabs, names and goals use larger, brighter type (tab 14px, skin row 14px, preview name 18px; phones 11 / 11.5 / 13px). A **tab per gun** (name + owned/total; the open tab is solid cyan) — opens on the gun in hand from pause, on the next skin's gun from the title. Left: a **turntable** (`#arm-canvas`, `ui/armory-preview.ts`): the real gun model in the picked paint on its own small WebGL canvas at half resolution (pixelated), swinging slowly, drag to turn; under it the paint's swatch + name + gun and its state: *✓ EQUIPPED*, a compact cyan-outline *Equip* button (not the big striped primary — it crowded the phone layout), or *LOCKED* + goal + progress bar and, on Poki with ads available, a compact steel *Unlock now · Watch ad* button with the clapperboard (a watched video unlocks + equips it; otherwise it turns into a disabled *No video available*). The turntable frames every gun by its side profile's area (capped at 70% width / 55% height) so the stubby Sidearm and the long guns read the same size, and the box sits above the menus' scanline overlay. Right: that gun's paints (STANDARD + skins) as rows — a click previews it (locked ones too, dimmed in their real colours with goal n/N). ←/→ or Q/E tabs, ↑/↓ pick, Enter equips, Esc back. Fits 667×375 (the list scrolls) |
| Scrap counter | Top-right under KILLS in every solo mode: a brass cog + the scrap bank (20px; 15px on touch), a pop and a floating gold *+N* on every gain (gains within 0.9 s add up). Hidden in co-op and the previews. Scrap pickups (a brass nut on a steel offcut, gold glow) drop off every kill and fly in from ~4.5 u |
| Upgrades | `#upgrades-screen` (from the death screen and the Armory header's yellow *Upgrades · N scrap*). The Armory's dark backdrop and header: bright *◀ Back*, *UPGRADES*, *SCRAP n* in yellow, one line saying scrap is never lost. Seven rows: name, what the owned tier does (yellow) · *next:* the next tier, three tier pips (filled yellow), and a *Buy · cost* button (yellow outline; greyed when short of scrap; green *MAX* at tier 3). A bought row flashes. Esc / Back returns to where it was opened. Phones: tighter rows, the list scrolls, Back stays reachable |
| Sector clear (solo) | `#sector-clear`. Heading centred on the panel with the rank stamp pinned right on its midline. Tally rows land one by one (kills with their points, secrets, time vs par, sector clear, rank bonus), a yellow *+N SCRAP · T to spend* line under them with the next-upgrade line below it (as on the death screen), the score counts up, then the S/A/B/C stamp lands (gold / cyan / light / grey) with *NEW BEST RANK!* flashing when it beats that sector number's best (else *SECTOR n BEST: X*). Then *CHOOSE A PERK*: three button-like cards — the perk's icon (Font Awesome, in the perk's accent colour, glowing ring), its name, a few words (`PerkDef.short`), and a *PICK* bar showing the key (1–3) on desktop. The full rule is the hover tooltip. Under the cards a quiet yellow *Upgrades · N scrap* button (solo) opens the Upgrades screen; its Back returns here straight to the cards (no second tally). Cards are dimmed until they arm 0.5 s after appearing, pulse once when they do, lift with a solid-yellow PICK bar on hover; picking one descends. Landscape phones: horizontal rows (icon · name + words · PICK). Any click / Enter / Space during the tally skips to the end. Landscape phones: tally left, perk cards stacked right. Co-op keeps the old click-to-descend intermission |
| Facility terminal | After the sector 3 intermission (solo): full-screen void with a steel header bar (*VXS-OS 4.12* / *SERVICE TERMINAL B3-07*) and a scanlined cyan terminal typing the route-out message (hazard-yellow `!` warnings, a bright last line). The box is full height from the first character so it never re-centres. Click / tap / Enter / Space prints the rest; the foot then pulses *CLICK* (*TAP*) *TO DESCEND*; that press glitches, collapses the screen like a CRT switching off and fades violet into sector 4. Fits 667×375 without clipping |
| Death | Top row, equal size: *Revive* (in place, once per sector attempt; on Poki *Revive · Watch ad* with the clapperboard icon, steel not green, hidden without the SDK, "No video available" if none played) beside the yellow *Retry from keycard* (once the red key was taken: in place, back at the key) or *Retry sector N* / *Retry depth N* (sector-entry gear, health floored at 60). Under the stats a yellow line: *+N SCRAP · T to spend* (this attempt's scrap), and under it the next upgrade to save for: *NEXT UPGRADE · Reinforced Suit I* with a yellow bar and *34 / 50*; once the bank covers it, *UPGRADE READY* and the *Upgrades* button turns yellow with a slow glow (also the sector clear's *Upgrades · N scrap*). Second row, quiet: *Restart sector N* (only with a keycard checkpoint), *Upgrades* (opens the Upgrades screen; Back returns here) and *New run*. Enter / Space = retry, never the ad. Fits 667×375 on one line per button |
| Results | The last sector's clear screen headed CAMPAIGN COMPLETE: the same tally + rank stamp, then campaign totals, the layout record line, a primary *Keep descending · Depth 6* (solo; Enter picks it) and quiet *Play a new layout* / *Main menu* (all disabled until the tally ends, then armed after 0.5 s). Endless depth clears use the normal sector-clear screen with a perk offer; when fewer than three perks are left, the offer is filled with one-off rewards (*Patch Up* full health, *Resupply* +50% ammo, *Reinforce* +75 armor). Co-op keeps the old results screen |
| READY | After an ad break on desktop: one click to recapture the mouse |
| Graphics lost | Pauses on WebGL context loss; *Reload game* appears after 4 s |

Click-through screens **arm** after a short delay so a held trigger can't
skip them.

## Rules for changing the UI

- **Fit a phone.** Full-screen menus must work at 667×375 and 740×360
  landscape. `.tscreen` menus scroll if they must (centred by auto margins
  so they never clip at the top), and settings switch to a compact
  two-column grid under `max-height: 560px`. `features.mjs` #14 checks it.
- **Safe area.** The page draws edge to edge (`viewport-fit=cover`), so
  anything pinned to a screen edge adds the safe-area variables on `body`
  (`--sat` / `--sar` / `--sab` / `--sal`, from `env(safe-area-inset-*)`,
  remapped while a portrait phone is rotated into landscape):
  `right: calc(18px + var(--sar))`. Centred elements (crosshair, automap,
  panels) don't. `features.mjs` #23 checks a notched phone in landscape
  and held upright.
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


### Secret prototype slot

The sixth HUD slot and key 6 select the carried secret prototype. Regular guns retain their pickup order in slots 1?5. Touch tap/swipe cycling and the held weapon wheel include the prototype, labelled 6; the main weapon name displays the current prototype name. Special ammo uses a purple battery icon. Collecting another prototype replaces the previous one and supplies its ammo.
