# Geothermal preview: reference reconstruction

Playable at `?sector6`. [In-game capture](geothermal-in-game-v2.png).

The architectural reference is [Geothermal Core](sector5-geothermal-core.png).
The reference labels its proposal Sector 5; this standalone implementation
uses Sector 6 as requested.

The entrance composition places a tiered heat exchanger to the left of a
straight bridge, with recessed lava, stairs, upper galleries, steel trusses,
a hanging coolant duct, vented machinery, hazard bands, cyan work lights,
and a framed red access door. Surfaces use procedural world-space pixel
textures and instanced geometry. Lava is cosmetic; channels have collision
guards and cross bridges. The optional Power Link puzzle remains playable.

This is a 3D reconstruction of the concept, not a pixel-identical image.
The screenshot is captured from the actual game with its HUD hidden, the
sidearm equipped, and internal rendering set to 720 lines. Normal play keeps
the player's resolution setting and HUD.

Recreate this capture with `node scripts/sector6-look.mjs <dev-server-url>`.
Verify gameplay with `node scripts/sector6.mjs <dev-server-url>`.
