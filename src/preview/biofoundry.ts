import * as THREE from 'three';
import type { LevelPreview } from '../game';
import type { LevelData } from '../world/levelgen';
import { Block } from '../world/blocks';
import { VoxelWorld } from '../world/world';
import { RNG } from '../core/rng';
import type { RoomDef, PickupSpec, EnemySpec } from '../types';

/**
 * Sector 4 "Biofoundry" — a development-only authored level, styled after
 * reference/sector4-biofoundry.png: a purple-lit specimen hall with glowing
 * green tanks, ribbed pillars carrying warm light bands, crimson growth with
 * orange nodes, and slime on the tiles. Collision stays ordinary voxels; the
 * atlas has a dedicated Lab* block set (append-only); everything softer is
 * instanced boxes from decorate().
 */

const ROOMS: Array<[string, number, number, number, number, RoomDef['kind'], number]> = [
  ['ARRIVAL / DECONTAMINATION', 30, 58, 16, 12, 'spawn', 0],
  ['SPECIMEN LABORATORY', 24, 32, 28, 20, 'normal', 1],
  ['WASTE PROCESSING', 4, 32, 14, 16, 'normal', 2],
  ['CONTAINMENT WING', 58, 32, 16, 16, 'normal', 2],
  ['SECURITY / RED ACCESS', 56, 10, 18, 14, 'key', 3],
  ['INCUBATION CHAMBER', 24, 6, 26, 18, 'arena', 2],
  ['LOWER TRANSIT LIFT', 4, 6, 14, 16, 'exit', 3],
];
const CORRIDORS = [[37, 52, 2, 6], [18, 39, 6, 2], [52, 39, 6, 2], [65, 24, 2, 8], [37, 24, 2, 8], [50, 15, 6, 2], [18, 15, 6, 2]];

/** specimen tanks: 3 (x) × 2 (z) footprint, glass y=2..4 on a metal base; [x, z, broken] */
const TANKS: Array<[number, number, boolean]> = [
  [24, 46, true], [24, 40, false], [24, 34, false], [49, 46, false], [49, 40, false], [49, 34, false],
  [59, 35, false], [71, 42, false],
  [57, 12, false],
  [27, 8, false], [45, 8, false],
];
const TANK_W = 3;
const TANK_D = 2;
/** 2×2 structural pillars (x, z of the min corner); a warm light band at y=3 */
const PILLARS = [[30, 38], [44, 38], [30, 46], [44, 46], [30, 12], [43, 12]];
/** pillars the growth has claimed: [pillar x, pillar z, side dx, side dz] */
const GROWN: Array<[number, number, number, number]> = [[30, 38, 1, 0], [44, 46, -1, 0], [30, 12, 1, 0], [43, 12, -1, 0]];
/** purple emergency-light wash instead of the campaign's near-black ambient */
const AMBIENT: [number, number, number] = [36, 26, 52];

function generate(seed: number): LevelData {
  const world = new VoxelWorld(80, 14, 80);
  const rooms: RoomDef[] = ROOMS.map(([, x, z, w, d, kind, dist], id) => ({
    id, x, z, w, d, kind, dist, h: 6, cx: x + Math.floor(w / 2), cz: z + Math.floor(d / 2),
  }));
  const carve = (x: number, z: number, w: number, d: number, h: number): void => {
    for (let xx = x - 1; xx <= x + w; xx++) for (let zz = z - 1; zz <= z + d; zz++) {
      for (let y = 0; y <= h + 1; y++) {
        const inside = xx >= x && xx < x + w && zz >= z && zz < z + d;
        if (inside) world.set(xx, y, zz, y === 0 ? Block.LabFloor : y === h + 1 ? Block.LabCeil : Block.Air);
        else if (world.get(xx, y, zz) === Block.Rock) world.set(xx, y, zz, y === 0 ? Block.LabFloor : Block.LabWall);
      }
    }
  };
  for (const r of rooms) carve(r.x, r.z, r.w, r.d, r.h);
  for (const [x, z, w, d] of CORRIDORS) carve(x, z, w, d, 3);

  // wall variety: rust runs, a few vents, full-height conduit columns
  const rng = new RNG(seed);
  for (let z = 0; z < 80; z++) for (let x = 0; x < 80; x++) {
    const column = (x * 7 + z * 13) % 29 === 0;
    for (let y = 1; y < 8; y++) {
      if (world.get(x, y, z) !== Block.LabWall) continue;
      if (column && y <= 6) { world.set(x, y, z, Block.WallPipes); continue; }
      const n = rng.next();
      if (n < 0.14) world.set(x, y, z, Block.LabWallRust);
      else if (n < 0.17 && y >= 2 && y <= 4) world.set(x, y, z, Block.WallVent);
    }
  }
  // ceiling: magenta panel pairs on a grid, square grates between them
  for (const r of rooms) {
    const cy = r.h + 1;
    for (let x = r.x + 3; x < r.x + r.w - 2; x += 7) {
      for (let z = r.z + 3; z < r.z + r.d - 1; z += 6) {
        world.set(x, cy, z, Block.LampViolet);
        world.set(x + 1, cy, z, Block.LampViolet);
        if (x + 4 < r.x + r.w && z + 3 < r.z + r.d) world.set(x + 4, cy, z + 3, Block.LabCeilGrate);
      }
    }
  }
  // corridors: a cyan pair in the ceiling, plus cyan + magenta over the
  // laboratory's north doorway (the reference's lit door frame)
  for (const [x, z] of [[37, 54], [20, 39], [54, 39], [65, 27], [37, 27], [52, 15], [20, 15]]) {
    world.set(x, 4, z, Block.LampTeal);
    world.set(x + 1, 4, z, Block.LampTeal);
  }
  for (const x of [37, 38]) {
    world.set(x, 4, 31, Block.LampTeal);
    world.set(x, 6, 31, Block.LampViolet);
  }
  // specimen tanks: metal base, three tiers of glowing glass, metal cap
  for (const [x, z] of TANKS) for (let xx = x; xx < x + TANK_W; xx++) for (let zz = z; zz < z + TANK_D; zz++) {
    world.set(xx, 1, zz, Block.Metal);
    for (let y = 2; y <= 4; y++) world.set(xx, y, zz, Block.TankGlass);
    world.set(xx, 5, zz, Block.Metal);
  }
  // 2×2 ribbed pillars with a warm light band at y=3
  for (const [x, z] of PILLARS) for (let xx = x; xx < x + 2; xx++) for (let zz = z; zz < z + 2; zz++) {
    for (let y = 1; y <= 6; y++) world.set(xx, y, zz, y === 3 ? Block.LampWarm : Block.Pillar);
  }
  for (const [x, z] of [[7, 36], [8, 36], [7, 43], [60, 45], [70, 20], [33, 67], [28, 50], [47, 33]]) world.set(x, 1, z, Block.Crate);
  for (const [x, z] of [[9, 42], [15, 35], [63, 38], [47, 19], [27, 49]]) world.set(x, 1, z, Block.Barrel);
  // raised transit ledge: only the standard lift reaches the exit pad
  for (let x = 4; x < 18; x++) for (let z = 6; z < 10; z++) for (let y = 1; y <= 3; y++) world.set(x, y, z, Block.Metal);
  for (let x = 9; x <= 10; x++) for (let z = 8; z <= 9; z++) world.set(x, 3, z, Block.ExitPad);

  const pickups: PickupSpec[] = [];
  const item = (kind: PickupSpec['kind'], x: number, z: number): void => { pickups.push({ kind, x: x + 0.5, y: 1.5, z: z + 0.5 }); };
  item('keyRed', 67, 15);
  for (const [x, z] of [[35, 62], [7, 39], [62, 43], [60, 19], [34, 19]]) {
    item('healthBig', x, z); item('ammoShells', x + 1, z); item('ammoCells', x, z + 1);
  }
  item('armorVest', 13, 43); item('ammoRockets', 14, 43); item('powerShield', 37, 15);
  const enemies: EnemySpec[] = [];
  const enemy = (kind: EnemySpec['kind'], x: number, z: number, roomId: number): void => { enemies.push({ kind, x: x + 0.5, z: z + 0.5, roomId }); };
  // Vatborn stand loose beside the breached tank (the dormant-in-tank breach
  // sequence from reference/sector4-monsters.md is not built yet)
  enemy('vatborn', 29, 48, 1); enemy('vatborn', 31, 44, 1);
  enemy('husk', 34, 37, 1); enemy('sentinel', 46, 41, 1); enemy('ticker', 41, 46, 1);
  enemy('husk', 11, 36, 2); enemy('ticker', 13, 41, 2);
  enemy('sentinel', 66, 36, 3); enemy('husk', 63, 43, 3);
  enemy('sentinel', 66, 18, 4); enemy('husk', 60, 14, 4);
  enemy('brute', 37, 13, 5); enemy('husk', 33, 19, 5); enemy('sentinel', 46, 17, 5);

  world.bakeLighting(AMBIENT);
  return {
    world, rooms, pickups, enemies, seed,
    doors: [{ x: 20, z: 15, dir: 'x', locked: 'red' }, { x: 37, z: 55, dir: 'z', locked: null }, { x: 65, z: 27, dir: 'z', locked: null }],
    spawn: { x: 38, y: 2.05, z: 64 },
    elevator: { x: 9, z: 10, lowY: 1, highY: 4 },
    exitPad: { x: 10, y: 4, z: 9 }, secretRect: null, totalEnemies: enemies.length, totalSecrets: 0,
  };
}

// ---------------------------------------------------------------------------
// decoration: instanced boxes. "Shaded" boxes carry a baked per-face shade
// (lit from the upper left, like the gun view models) so clusters read as
// solid forms; "flat" boxes are full-bright for anything that glows.
// ---------------------------------------------------------------------------

const FACE_SHADE = [0.64, 0.86, 1.0, 0.46, 0.76, 0.58]; // +x -x +y -y +z -z
const GROWTH = [0x7a1f2e, 0x9c2a3a, 0x5c1824, 0xb0343f, 0x86262f];
const NODE = 0xffa030;
const NODE_CORE = 0xffd890;
const SLIME = 0x7fd42a;
const SLIME_LIGHT = 0xa8f04a;
const FRAME = 0x2c3540;
const FRAME_LIGHT = 0x4b5663;

const GLASS = 0x9af07a;
const LIQUID = 0x62cc3c;
const LIQUID_TOP = 0xc8ff9a;
// near-black with a hint of green: it must read as a silhouette through
// two tinted layers of liquid and glass
const DUMMY = [0x0a1610, 0x0e1c14, 0x07110c];

interface Inst { x: number; y: number; z: number; w: number; h: number; d: number; ry: number; rz: number }

function shadedBox(): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.fill(FACE_SHADE[Math.floor(i / 4)], i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function decorate(level: LevelData): ReturnType<LevelPreview['decorate']> {
  const group = new THREE.Group();
  group.name = 'biofoundry-preview-art';
  const world = level.world;
  const batches = new Map<string, { color: number; flat: boolean; alpha: number; items: Inst[] }>();
  const cube = (
    color: number, x: number, y: number, z: number, w: number, h: number, d: number,
    opts: { flat?: boolean; ry?: number; rz?: number; alpha?: number } = {},
  ): void => {
    const alpha = opts.alpha ?? 1;
    const key = `${color}:${opts.flat ? 1 : 0}:${alpha}`;
    if (!batches.has(key)) batches.set(key, { color, flat: !!opts.flat, alpha, items: [] });
    batches.get(key)!.items.push({ x, y, z, w, h, d, ry: opts.ry ?? 0, rz: opts.rz ?? 0 });
  };
  const rng = new RNG(level.seed ^ 0xb10f);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng.next() * arr.length)];
  const airAt = (x: number, y: number, z: number): boolean => world.inBounds(x, y, z) && world.get(x, y, z) === Block.Air;

  // ---- slime: a flat puddle of overlapping blobs + droplets --------------
  const puddle = (cx: number, cz: number, r: number, blobs: number): void => {
    for (let i = 0; i < blobs; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = rng.next() * r * 0.7;
      const s = r * (0.5 + rng.next() * 0.7);
      cube(i % 3 ? SLIME : SLIME_LIGHT, cx + Math.cos(a) * d, 1.012 + (i % 3 ? 0 : 0.004), cz + Math.sin(a) * d,
        s, 0.02, s * (0.6 + rng.next() * 0.6), { flat: true, ry: rng.next() * Math.PI });
    }
    for (let i = 0; i < blobs; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = r * (0.7 + rng.next() * 0.6);
      const s = 0.08 + rng.next() * 0.1;
      cube(SLIME_LIGHT, cx + Math.cos(a) * d, 1.01 + s / 2, cz + Math.sin(a) * d, s, s, s, { flat: true });
    }
  };

  // ---- specimen tanks -----------------------------------------------------
  // The TankGlass voxels are never meshed, so the tank's interior is open:
  // a translucent liquid fill with one surface line, a glass shell around it,
  // and a voxel dummy floating inside (drawn opaque, so it shows through).
  const dummy = (cx: number, cy: number, cz: number, ry: number, lean: number): void => {
    const c = (i: number): number => DUMMY[i % DUMMY.length];
    const part = (dx: number, dy: number, dz: number, w: number, h: number, d: number, i: number, rz = 0): void => {
      // rotate the part's offset around the dummy's own axis so the whole
      // figure turns as one, then lean it back a little
      const rx = dx * Math.cos(ry) - dz * Math.sin(ry);
      const rz2 = dx * Math.sin(ry) + dz * Math.cos(ry);
      cube(c(i), cx + rx, cy + dy, cz + rz2, w, h, d, { ry, rz: rz + lean });
    };
    part(0, 1.05, 0, 0.4, 0.42, 0.4, 0); // head
    part(0, 0.35, 0, 0.62, 0.9, 0.36, 1); // torso
    part(0, -0.25, 0, 0.5, 0.3, 0.3, 2); // hips
    part(-0.5, 0.35, 0, 0.22, 0.8, 0.22, 2, 0.35); // arms, drifting out
    part(0.5, 0.3, 0, 0.22, 0.8, 0.22, 0, -0.4);
    part(-0.16, -0.85, 0.05, 0.24, 0.85, 0.24, 1); // legs
    part(0.18, -0.85, -0.05, 0.24, 0.85, 0.24, 2, 0.1);
  };
  for (const [x, z, broken] of TANKS) {
    const cx = x + TANK_W / 2, cz = z + TANK_D / 2;
    // dark base and cap slabs with a lit lip, four corner posts
    cube(FRAME, cx, 1.52, cz, TANK_W + 0.3, 1.05, TANK_D + 0.3);
    cube(FRAME_LIGHT, cx, 2.0, cz, TANK_W + 0.34, 0.1, TANK_D + 0.34);
    cube(FRAME, cx, 5.52, cz, TANK_W + 0.3, 1.05, TANK_D + 0.3);
    cube(FRAME_LIGHT, cx, 5.06, cz, TANK_W + 0.34, 0.1, TANK_D + 0.34);
    for (const px of [x, x + TANK_W]) for (const pz of [z, z + TANK_D]) cube(FRAME, px, 3.5, pz, 0.2, 5.1, 0.2);
    // the tank floor, seen through the liquid
    cube(FRAME_LIGHT, cx, 2.03, cz, TANK_W - 0.1, 0.06, TANK_D - 0.1);
    // liquid: full to just under the cap, half-drained in the broken tank
    const level = broken ? 3.55 : 4.72;
    cube(LIQUID, cx, (2.05 + level) / 2, cz, TANK_W - 0.06, level - 2.05, TANK_D - 0.06, { flat: true, alpha: 0.36 });
    cube(LIQUID_TOP, cx, level, cz, TANK_W - 0.06, 0.05, TANK_D - 0.06, { flat: true, alpha: 0.8 });
    // the specimen, floating a little off-centre, turned to face the room
    const facing = airAt(x - 1, 3, z) ? Math.PI / 2 : airAt(x + TANK_W, 3, z) ? -Math.PI / 2 : 0;
    dummy(cx + (rng.next() - 0.5) * 0.4, (broken ? 2.95 : 3.5) + rng.next() * 0.2, cz, facing + (rng.next() - 0.5) * 0.5, 0.12);
    // bubbles
    for (let i = 0; i < 7; i++) {
      const s = 0.06 + rng.next() * 0.08;
      cube(LIQUID_TOP, x + 0.3 + rng.next() * (TANK_W - 0.6), 2.3 + rng.next() * (level - 2.5), z + 0.3 + rng.next() * (TANK_D - 0.6), s, s, s, { flat: true, alpha: 0.9 });
    }
    // smooth glass shell, drawn last-ish (transparent), slightly outside the voxels
    cube(GLASS, cx, 3.5, cz, TANK_W + 0.08, 3.02, TANK_D + 0.08, { flat: true, alpha: 0.16 });
    if (broken) {
      // cracked front pane, slime pouring down it and pooling on the tiles
      const fx = x + TANK_W, fz = cz - 0.3;
      // (both sit just outside the glass shell at fx + 0.04)
      let cz2 = fz;
      for (let y = 4.7; y > 2.2; y -= 0.22) {
        cz2 += (rng.next() - 0.5) * 0.3;
        cube(0x1a2e22, fx + 0.07, y, cz2, 0.03, 0.26, 0.07, { flat: true, ry: 0.4 });
      }
      for (let y = 3.6; y > 1.2; y -= 0.3) {
        cube(y > 3.3 ? SLIME_LIGHT : SLIME, fx + 0.1, y, fz + 0.1, 0.07, 0.34, 0.22 + (3.6 - y) * 0.1, { flat: true });
      }
      puddle(fx + 1.3, fz + 0.2, 1.5, 9);
    }
  }
  // extra spills around the facility
  for (const [px, pz, r] of [[33, 49, 0.9], [47, 36, 0.7], [62, 44, 0.8], [27, 20, 0.9], [8, 44, 0.6]]) puddle(px, pz, r, 5);

  // ---- pillars: foot, cap, rust streaks, growth on the claimed ones ------
  for (const [x, z] of PILLARS) {
    const cx = x + 1, cz = z + 1;
    cube(FRAME, cx, 1.18, cz, 2.5, 0.36, 2.5);
    cube(FRAME, cx, 6.82, cz, 2.5, 0.36, 2.5);
    for (let i = 0; i < 4; i++) {
      const side = i % 2 ? 1 : -1, alongX = i < 2;
      const len = 1.2 + rng.next() * 2.2, y = 4.9 - rng.next() * 1.6;
      const u = (rng.next() - 0.5) * 1.5;
      cube(0x6d4122, alongX ? cx + u : cx + side * 1.015, y, alongX ? cz + side * 1.015 : cz + u,
        alongX ? 0.09 : 0.02, len, alongX ? 0.02 : 0.09, { flat: true });
    }
  }
  const growthColumn = (bx: number, bz: number, dx: number, dz: number, top: number): void => {
    // crimson clusters crawling up a surface at (bx, bz), bulging out along (dx, dz)
    const steps = Math.round((top - 1) / 0.24);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const y = 1.1 + t * (top - 1.1);
      // hugs the surface: half of each clump sits inside it
      const wobble = Math.sin(t * 9 + bx) * 0.55;
      const bulge = 0.05 + rng.next() * 0.2 - t * 0.05;
      const s = 0.36 + rng.next() * 0.42;
      cube(pick(GROWTH), bx + dx * bulge + (dz ? wobble : 0), y, bz + dz * bulge + (dx ? wobble : 0),
        s, s * (0.8 + rng.next() * 0.5), s, { ry: rng.next() * 0.6 });
      if (i % 3 === 0) {
        const s2 = 0.2 + rng.next() * 0.3;
        cube(pick(GROWTH), bx + dx * (bulge + 0.18) + (dz ? wobble * 1.3 : 0), y + 0.1, bz + dz * (bulge + 0.18) + (dx ? wobble * 1.3 : 0), s2, s2, s2, { ry: rng.next() });
      }
      if (i % 5 === 2) {
        const nx = bx + dx * (bulge + 0.3) + (dz ? wobble : 0), nz = bz + dz * (bulge + 0.3) + (dx ? wobble : 0);
        cube(NODE, nx, y + 0.05, nz, 0.24, 0.26, 0.24, { flat: true });
        cube(NODE_CORE, nx + dx * 0.08, y + 0.08, nz + dz * 0.08, 0.1, 0.1, 0.1, { flat: true });
      }
    }
    // spread across the floor at the base
    for (let i = 0; i < 9; i++) {
      const a = rng.next() * Math.PI * 2, d = 0.4 + rng.next() * 1.3, s = 0.25 + rng.next() * 0.4;
      cube(pick(GROWTH), bx + dx * 0.4 + Math.cos(a) * d, 1 + s * 0.3, bz + dz * 0.4 + Math.sin(a) * d, s, s * 0.6, s, { ry: rng.next() });
    }
  };
  for (const [x, z, dx, dz] of GROWN) {
    const cx = x + 1, cz = z + 1;
    growthColumn(cx + dx * 1.0, cz + dz * 1.0, dx, dz, 6.6);
  }
  // growth patches on room walls (never on the spawn/exit rooms)
  for (const r of level.rooms.filter((q) => q.kind !== 'spawn' && q.kind !== 'exit')) {
    for (let n = 0; n < 2; n++) {
      const west = rng.next() < 0.5;
      const wx = west ? r.x : r.x + r.w;
      const wz = r.z + 2 + rng.next() * (r.d - 4);
      if (!airAt(west ? r.x : r.x + r.w - 1, 2, Math.floor(wz))) continue;
      growthColumn(wx, wz, west ? 1 : -1, 0, 3.2 + rng.next() * 3);
    }
  }
  // incubator heart: a mass of growth clinging to the arena's far wall
  // (face at z=6), widest at the floor and thinning toward the ceiling
  for (let i = 0; i < 70; i++) {
    const y = 1.2 + rng.next() * rng.next() * 4.6;
    const spread = 6 - (y - 1) * 0.8;
    const x = 37.5 + (rng.next() - 0.5) * spread;
    const s = 0.45 + rng.next() * 0.55;
    cube(pick(GROWTH), x, y, 5.95 + rng.next() * 0.35, s, s * 1.1, s, { ry: rng.next() });
    if (i % 7 === 0) cube(NODE, x, y + 0.2, 6.35 + rng.next() * 0.2, 0.26, 0.26, 0.26, { flat: true });
  }

  // ---- the laboratory's north doorway: a sealed-door frame ---------------
  {
    const z = 32.0, y0 = 1, y1 = 4;
    for (const px of [36.8, 39.2]) cube(FRAME, px, (y0 + y1) / 2, z + 0.1, 0.35, y1 - y0, 0.2);
    cube(FRAME, 38, y1 + 0.12, z + 0.1, 2.9, 0.3, 0.2);
    cube(FRAME_LIGHT, 38, y1 + 0.3, z + 0.1, 2.9, 0.06, 0.22);
  }

  // ---- build the instanced meshes ----------------------------------------
  const shaded = shadedBox();
  const flat = new THREE.BoxGeometry(1, 1, 1);
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const b of batches.values()) {
    // raw palette values: the renderer outputs linear, so a plain hex would be
    // sRGB-decoded on the way in and every box would render near-black
    const color = new THREE.Color().setHex(b.color, THREE.LinearSRGBColorSpace);
    const material = new THREE.MeshBasicMaterial({
      color, vertexColors: !b.flat, fog: true,
      transparent: b.alpha < 1, opacity: b.alpha, depthWrite: b.alpha >= 1,
    });
    materials.push(material);
    const mesh = new THREE.InstancedMesh(b.flat ? flat : shaded, material, b.items.length);
    // glass after liquid, liquid after everything opaque
    if (b.alpha < 1) mesh.renderOrder = b.color === GLASS ? 2 : 1;
    b.items.forEach((it, i) => {
      e.set(0, it.ry, it.rz);
      q.setFromEuler(e);
      p.set(it.x, it.y, it.z);
      s.set(it.w, it.h, it.d);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    group.add(mesh);
  }

  // ---- signs: BIOFOUNDRY over the lab door, room names elsewhere ---------
  const sign = (text: string, x: number, y: number, z: number, w: number, big: boolean): void => {
    // low-res on purpose: at the 240-line render a big canvas minifies into
    // speckle, while ~1 texel per screen pixel stays legible pixel text
    const canvas = document.createElement('canvas');
    canvas.width = big ? 112 : 160; canvas.height = big ? 22 : 24;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0b1612'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = big ? '#39c7b4' : '#2f5f54'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.fillStyle = big ? '#8dffd0' : '#8fd3b4';
    ctx.font = `bold ${big ? 16 : 11}px 'Courier New', monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture, fog: true });
    materials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * canvas.height / canvas.width), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
  };
  sign('BIOFOUNDRY', 38, 5.15, 32.03, 7.4, true);
  for (const [id, r] of level.rooms.entries()) {
    if (id === 1) continue; // the lab wears the BIOFOUNDRY sign instead
    sign(ROOMS[id][0], r.cx, 4.5, r.z + 0.03, 4.4, false);
  }

  return { group, dispose() {
    shaded.dispose();
    flat.dispose();
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const mat of materials) mat.dispose();
    for (const t of textures) t.dispose();
    group.clear();
  } };
}

function showScreen(onStart: () => void, onLeave: () => void, cleared = false): () => void {
  const el = document.createElement('div');
  el.className = 'screen';
  el.style.cursor = 'default';
  el.innerHTML = `<div class="panel">
    <h1 class="win" style="font-size:28px;letter-spacing:3px">BIOFOUNDRY ${cleared ? 'CLEARED' : 'PREVIEW'}</h1>
    <p>Sector 4 development preview · Not part of the campaign</p>
    <p>${cleared ? 'Containment route secured.' : 'Explore the specimen labs. Find the red keycard and reach the lift.'}</p>
    <p>Current enemies · All weapons supplied · Campaign saves untouched</p>
    <div class="screen-btns">
      <button id="preview-start" class="tbtn tbtn-primary">${cleared ? 'Explore again' : 'Enter the Biofoundry'}</button>
      <button id="preview-leave" class="tbtn tbtn-quiet">Back to the main game</button>
    </div></div>`;
  const readyAt = performance.now() + 700;
  const start = (): void => { if (performance.now() >= readyAt) { stop(); onStart(); } };
  const key = (ev: KeyboardEvent): void => {
    if (!ev.repeat && ['Enter', 'NumpadEnter', 'Space'].includes(ev.code)) { ev.preventDefault(); start(); }
  };
  const stop = (): void => { el.remove(); window.removeEventListener('keydown', key); };
  el.querySelector('#preview-start')!.addEventListener('click', start);
  el.querySelector('#preview-leave')!.addEventListener('click', () => { stop(); onLeave(); });
  window.addEventListener('keydown', key);
  document.body.appendChild(el);
  return stop;
}

export const biofoundry: LevelPreview = { generate, decorate, showScreen };
