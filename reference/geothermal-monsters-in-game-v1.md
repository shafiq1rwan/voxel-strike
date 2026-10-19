# Implemented geothermal monsters

Playable in the standalone `?sector6` preview. Models follow the silhouettes,
palette, moving parts, and attack poses of [the concept sheet](geothermal-monsters-v1.png).

[Actual model comparison](geothermal-monsters-in-game-v1.png)

| Monster | Health | Behavior |
| --- | --- | --- |
| Cinder Hulk | 190 | Hunched knuckle-walker: pale stone fists hang near the floor, a hooded head sunk between huge shoulder blocks, chest plates hinged over a hot core. Slam (1.05 s wind-up): a dip, both fists swung overhead in a wide squat as the plates open and the floor ring pulses, a trembling hang at the top; aim locks at 0.65 s. A visible 0.16 s downswing, and the slam lands at impact: 24 damage once, a floor jolt felt out to 6 u. The fists stay planted with the core open, then it pushes back up (1.3 s). |
| Vent Stalker | 50 | Four chunky rust legs arched high above the basalt back slabs, two amber eyes low on a wide head plate. Walks on diagonal pairs. Crouches and coils for 0.65 s (sinks, draws back, back seam flares, trembles), locks at 0.38, then leaps nose-up with the front legs thrown forward for at most 0.55 s. Contact deals 14 damage once; a landing squash, then recovery (0.95 s). |
| Kiln Drone | 85 | Rust furnace boxed in dark iron: visor over a sensor slit, a framed furnace window, tall teal side shutters hinged at the front, three stepped exhaust stacks. Hovers with a bob and leans into its travel. Charges for 0.95 s (shutters swing open, furnace and stacks stoke to white, a shake), locks aim at 0.65, fires one molten projectile for 14 damage with a recoil and a muzzle flare; cools and closes over 1.1 s. |

The Kiln Drone is Sentinel-sized: its rig keeps the concept's proportions and is drawn at ×0.46 (about 0.56 u wide and 1.0 u tall to the stack tops, collider half 0.3 / 0.46, hovering 1.5 u up). The walkers (Hulk, Stalker) never step off a ledge (they turn along it, or hold at the edge), a leap stops at a ledge instead of carrying over it, and one that still ends up in a lava channel (knockback, a blast) walks to the nearest bridge cell and hops out; they can no longer be stranded there.

Redesigned 2026-10-19 to match the concept sheet more closely (proportions,
part layout, palette) and to give every attack a readable anticipation:
the first Hulk slammed on the last frame of its wind-up, with no downswing.

The Hulk and Drone take 75% damage with closed armor. During their exposed
window, hitscan shots in the core height band deal double damage. Ground
slams can be sidestepped or jumped; leaps and shots follow their locked aim.
Doors and solid scenery block attacks. The preview starts with one Hulk,
one Drone and two Stalkers; red-key reinforcements add two Stalkers/Drones.
The main campaign does not place these enemies.

Actual game captures:

- [Cinder Hulk](geothermal-cinderHulk-in-game-v1.png)
- [Vent Stalker](geothermal-ventStalker-in-game-v1.png)
- [Kiln Drone](geothermal-kilnDrone-in-game-v1.png)

The comparison sheet renders the actual game rigs in neutral lighting, with
idle poses above and windups below. Context captures use the actual sector
with the HUD hidden. Recreate both with `node scripts/geothermal-monster-look.mjs <url>`.
Check behavior with `node scripts/geothermal-monsters.mjs <url>` and sector
progression with `node scripts/sector6.mjs <url>`.
