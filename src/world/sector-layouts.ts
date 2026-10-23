import { Block } from './blocks';
import { VoxelWorld } from './world';
import { RNG } from '../core/rng';
import type { LevelData } from './levelgen';
import { ENVIRONMENTS, type NewTheme } from './environments';
import type { RoomDef, Rect } from '../types';

export interface LandmarkBox {
  x: number; y: number; z: number;
  w: number; h: number; d: number;
  color: number;
  glow?: boolean;
}
export interface SectorArchitecture {
  boxes: LandmarkBox[];
  signs: Array<{ text: string; x: number; y: number; z: number; w: number }>;
  stairs: Rect[];
  beds: number;
  version: 2;
}

/** Authored architecture from the approved mockups; only encounters and supplies vary by seed. */
export function generateSectorLayout(seed: number, difficulty: number, theme: NewTheme): LevelData {
  const world = new VoxelWorld(76, 20, 72), rng = new RNG(seed);
  const architecture: SectorArchitecture = { boxes: [], signs: [], stairs: [], beds: 0, version: 2 };
  const c = ENVIRONMENTS[theme];
  const medical = theme === 'medical', excavation = theme === 'excavation';
  const hall = { x: medical ? 19 : 16, z: 22, w: medical ? 30 : 36, d: 32, h: medical ? 6 : excavation ? 16 : 12 };
  const cx = hall.x + hall.w / 2;
  const rooms: RoomDef[] = [];
  const room = (x: number, z: number, w: number, d: number, h: number, kind: RoomDef['kind'], dist: number): void => {
    rooms.push({ id: rooms.length, x, z, w, d, h, kind, dist, cx: x + Math.floor(w / 2), cz: z + Math.floor(d / 2) });
  };
  room(hall.x, hall.z, hall.w, hall.d, hall.h, 'arena', 1);
  room(cx - 6, 54, 12, 10, hall.h, 'spawn', 0);
  room(4, 27, 10, 12, 5, 'key', 2);
  room(54, 28, 14, 12, 5, 'normal', 2);
  room(cx - 6, 6, 12, 12, 6, 'exit', 3);
  const wall = (y: number): Block => medical && y <= 2 ? Block.MedicalWallLower : excavation ? Block.ExcavationWall : c.wall;
  const carve = (x: number, z: number, w: number, d: number, h: number, service = false): void => {
    for (let xx = x - 1; xx <= x + w; xx++) for (let zz = z - 1; zz <= z + d; zz++) for (let y = 0; y <= h + 1; y++) {
      const inside = xx >= x && xx < x + w && zz >= z && zz < z + d;
      if (inside) world.set(xx, y, zz, y === 0 ? service ? Block.ServiceFloor : c.floor : y === h + 1 ? service ? Block.ServiceCeil : medical ? Block.MedicalCeil : excavation ? Block.ExcavationWall : theme === 'freight' ? Block.FreightWall : Block.Ceil : Block.Air);
      else if (world.get(xx, y, zz) === Block.Rock) world.set(xx, y, zz, service ? Block.ServiceWall : wall(y));
    }
  };
  for (const r of rooms) carve(r.x, r.z, r.w, r.d, r.h, r.kind === 'exit');
  carve(14, 32, hall.x - 14, 3, 3); // left security / key route
  carve(hall.x + hall.w, 32, 54 - hall.x - hall.w, 3, 3);
  carve(cx - 1, 18, 2, 5, 3, true);
  // A wide arrival opening makes the mockup's major silhouettes visible on entry.
  carve(cx - 6, 53, 12, 2, hall.h);

  const fill = (x: number, y: number, z: number, w: number, h: number, d: number, b: Block): void => {
    for (let xx = x; xx < x + w; xx++) for (let yy = y; yy < y + h; yy++) for (let zz = z; zz < z + d; zz++) world.set(xx, yy, zz, b);
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number, glow = false): void => {
    architecture.boxes.push({ x, y, z, w, h, d, color, glow });
  };
  const STEEL = 0x65707a, DARK = 0x29313a, YELLOW = 0xc59b32, RUST = 0x855034;
  const rail = (x: number, y: number, z: number, length: number, axis: 'x' | 'z'): void => {
    const alongX = axis === 'x';
    for (const dy of [0.45, 1.05]) box(x + (alongX ? length / 2 : 0), y + dy, z + (alongX ? 0 : length / 2), alongX ? length : 0.075, 0.075, alongX ? 0.075 : length, YELLOW);
    for (let t = 0; t <= length; t += 2) box(x + (alongX ? t : 0), y + 0.55, z + (alongX ? 0 : t), 0.09, 1.1, 0.09, YELLOW);
    // The rail is a real collision boundary; leave entrances and stairs out of its footprint.
    if (Number.isInteger(y)) for (let t = 0; t < length; t++) world.set(Math.floor(x + (alongX ? t : 0)), y, Math.floor(z + (alongX ? 0 : t)), Block.PowerBarrier);
  };
  const lamp = (x: number, y: number, z: number, face: 'north' | 'west' | 'east' = 'north'): void => {
    world.set(x, y, z, c.lamp);
    const dx = face === 'west' ? 0.56 : face === 'east' ? -0.06 : 0.5;
    const dz = face === 'north' ? 1.025 : 0.5;
    box(x + dx, y + 0.5, z + dz, face === 'north' ? 0.85 : 0.1, 0.48, face === 'north' ? 0.12 : 0.85, DARK);
    box(x + dx + (face === 'west' ? 0.06 : face === 'east' ? -0.06 : 0), y + 0.5, z + dz + (face === 'north' ? 0.07 : 0), face === 'north' ? 0.6 : 0.06, 0.27, face === 'north' ? 0.06 : 0.6, medical ? 0xd3e2cc : 0xffb555, true);
  };

  if (excavation) {
    // Massive stepped rock volumes, low side shelves and uneven high ceiling.
    for (const [x, z, w, d, h] of [[16, 24, 3, 4, 13], [16, 38, 2, 4, 16], [49, 24, 3, 5, 14], [49, 44, 3, 4, 16], [25, 28, 2, 3, 15], [42, 25, 2, 3, 16]]) {
      fill(x, 1, z, w, h, d, Block.ExcavationWall);
      fill(x - 1, h - 2, z - 1, w + 2, 3, d + 2, Block.ExcavationWall);
    }
    for (let z = 24; z < 53; z += 6) {
      fill(16, 13, z, 5, 4, 2, Block.ExcavationWall);
      fill(47, 14, z, 5, 3, 2, Block.ExcavationWall);
      fill(29, 16, z, 4, 1, 3, Block.ExcavationWall);
    }
    // Left maintenance galleries with two broad stair flights.
    fill(18, 3, 24, 5, 1, 18, Block.Metal);
    fill(18, 7, 24, 4, 1, 8, Block.Metal);
    for (let i = 0; i < 3; i++) fill(19, 1, 46 - i * 2, 3, i + 1, 2, Block.ExcavationWall);
    for (let i = 0; i < 4; i++) fill(18, 4, 38 - i * 2, 3, i + 1, 2, Block.ExcavationWall);
    architecture.stairs.push({ x: 19, z: 40, w: 3, d: 9 }, { x: 18, z: 30, w: 3, d: 11 });
    rail(22.8, 4, 24, 16, 'z'); rail(21.8, 8, 24, 7, 'z');
    for (const z of [26, 39]) {
      fill(18, 1, z, 1, 2, 1, Block.ExcavationSupport);
      box(18.5, 2, z + 0.5, 1.04, 2, 1.04, STEEL);
    }
    // After reference/new-sector-mockups/deep-excavation.png: the drilling
    // rig — a yellow machine on dark tracks with a cab, and a big grey cutter
    // head built as a stepped block sphere studded with teeth, facing the aisle.
    const MACHINE = 0xd0a030, MACHINE_D = 0x9a7420, STONE = 0x8c9097, STONE_D = 0x6a6e75, TOOTH = 0xb6bac0, HAZD_X = 0x26282c;
    fill(45, 1, 32, 5, 5, 8, Block.PowerBarrier);
    for (const z of [32.45, 39.55]) box(47.5, 1.45, z, 5.6, 0.9, 0.9, 0x2a2d31);
    box(47.6, 3.1, 36, 4.6, 2.6, 7.0, MACHINE);
    box(47.6, 4.55, 36, 4.4, 0.3, 6.8, MACHINE_D);
    box(48.3, 5.3, 34.2, 2.2, 1.4, 2.4, MACHINE);
    box(47.18, 5.35, 34.2, 0.06, 0.8, 1.8, 0x2a3540, true);
    for (const z of [33.3, 35.1, 36.9, 38.7]) box(45.28, 3.1, z, 0.06, 1.6, 0.5, MACHINE_D);
    for (const [y, z] of [[4.35, 33.0], [4.35, 39.0], [5.9, 35.2]]) box(45.5, y, z, 0.3, 0.3, 0.3, 0xffb050, true);
    // the cutter head: stepped square slabs, largest at the back
    const sizes = [4.6, 4.2, 3.6, 2.8, 1.8];
    sizes.forEach((sz, i) => {
      box(44.6 - i * 0.55, 3.4, 36, 0.6, sz, sz, i % 2 ? STONE_D : STONE);
      box(44.6 - i * 0.55, 3.4, 36, 0.62, sz * 0.62, sz * 1.04, i % 2 ? STONE : STONE_D);
      box(44.6 - i * 0.55, 3.4, 36, 0.62, sz * 1.04, sz * 0.62, i % 2 ? STONE : STONE_D);
    });
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996, r = 0.6 + (i % 5) * 0.42;
      box(42.6 + (i % 3) * 0.25 + r * 0.12, 3.4 + Math.sin(a) * r, 36 + Math.cos(a) * r, 0.34, 0.3, 0.3, i % 4 ? TOOTH : 0xd0a050);
    }
    for (let i = 0; i < 4; i++) fill(44 - i, 2, 34 + Math.floor(i / 2), 1, 5 - i, 5 - i, Block.PowerBarrier);
    // a black lattice tower behind the rig, red girders off it across the cavern
    fill(46, 1, 28, 2, 12, 2, Block.PowerBarrier);
    for (const x of [46.1, 47.9]) for (const z of [28.1, 29.9]) box(x, 7, z, 0.24, 12, 0.24, 0x2c3035);
    for (let y = 1.5; y < 13; y += 2) {
      for (const z of [28.1, 29.9]) box(47, y, z, 1.9, 0.16, 0.16, 0x3a3f45);
      for (const x of [46.1, 47.9]) box(x, y, 29, 0.16, 0.16, 1.9, 0x3a3f45);
      for (let t = 0; t < 1; t += 0.2) for (const z of [28.05, 29.95]) {
        box(46.1 + t * 1.8, y + t * 2, z, 0.16, 0.22, 0.12, 0x353a40);
        box(47.9 - t * 1.8, y + t * 2, z, 0.16, 0.22, 0.12, 0x353a40);
      }
    }
    const girder = (x: number, y: number, z: number, len: number): void => {
      box(x, y, z, len, 0.9, 0.34, 0x8a3a24);
      for (const dy of [-0.48, 0.48]) box(x, y + dy, z, len, 0.16, 0.9, 0xa04a2e);
    };
    girder(38, 12.6, 29, 18); girder(38, 11.2, 43.5, 18);
    for (const x of [30.2, 45.8]) box(x, 12.0, 36.3, 0.34, 0.6, 14.6, 0x8a3a24);
    for (const [x, z] of [[33, 29], [41, 29], [33, 43.5], [41, 43.5]]) {
      box(x, 11.95, z, 0.6, 0.3, 0.6, 0x2e3237);
      box(x, 11.78, z, 0.5, 0.06, 0.5, 0xffc070, true);
    }
    // Recessed trench is fenced on every exposed side; the main aisle is solid and wide.
    fill(38, 0, 41, 10, 1, 9, Block.Air); fill(38, 0, 41, 10, 1, 9, Block.PowerBarrier);
    box(43, 0.15, 45.5, 10, 0.3, 9, DARK);
    for (let z = 41; z < 50; z++) box(37.4, 1.018, z + 0.5, 0.65, 0.025, 0.85, z % 2 ? YELLOW : DARK);
    rail(37.9, 1, 41, 9, 'z'); rail(38, 1, 50, 10, 'x'); rail(38, 1, 41, 10, 'x'); rail(48, 1, 41, 9, 'z');
    for (const [x, z] of [[16, 28], [16, 39], [51, 28], [51, 44]]) lamp(x, 5, z, x === 16 ? 'west' : 'east');
    for (const z of [28, 38]) { box(48, 10, z + 3, 0.55, 0.7, 11, RUST); lamp(51, 9, z, 'east'); }
    for (const [x, y, z] of [[18, 2, 46], [25, 2, 30], [38, 1, 41], [48, 1, 50], [18, 6, 26]]) lamp(x, y, z);
    // small work lamps on the rock and the galleries (the mockup is dotted with them)
    for (const [x, y, z] of [[16, 9, 33], [16, 11, 44], [51, 6, 35], [51, 9, 46], [25, 6, 31], [42, 7, 28]]) lamp(x, y, z, x === 16 ? 'west' : x === 51 ? 'east' : 'north');
    architecture.signs.push({ text: 'DEEP EXCAVATION', x: cx, y: 6.0, z: 22.04, w: 7 });
    // the caged service lift beside the galleries: corner posts, mesh walls,
    // the car parked halfway up with a hazard band, a head frame and a lamp
    fill(23, 1, 33, 3, 9, 3, Block.PowerBarrier);
    const CAGE = 0x3a3f45, MESH = 0x565c63;
    for (const x of [23.05, 25.95]) for (const z of [33.05, 35.95]) box(x, 5.5, z, 0.16, 9, 0.16, CAGE);
    for (let y = 1.5; y <= 9.5; y += 1) {
      for (const z of [33.04, 35.96]) box(24.5, y, z, 2.9, 0.06, 0.06, MESH);
      for (const x of [23.04, 25.96]) box(x, y, 34.5, 0.06, 0.06, 2.9, MESH);
    }
    for (let t = 0.4; t < 3; t += 0.5) {
      for (const z of [33.04, 35.96]) box(23 + t, 5.5, z, 0.05, 9, 0.05, MESH);
      for (const x of [23.04, 25.96]) box(x, 5.5, 33 + t, 0.05, 9, 0.05, MESH);
    }
    box(24.5, 4.0, 34.5, 2.8, 0.2, 2.8, 0x4a5056);
    for (let t = 0; t < 2.8; t += 0.4) box(23.3 + t, 4.18, 35.9, 0.4, 0.16, 0.06, Math.round(t / 0.4) % 2 ? HAZD_X : 0xd8a830);
    box(24.5, 10.2, 34.5, 3.2, 0.5, 3.2, 0x2c3035);
    box(24.5, 10.5, 34.5, 0.9, 0.3, 0.9, 0xffb050, true);
    // lockers (one green, one steel) and crates either side of the door
    fill(27, 1, 22, 3, 2, 1, Block.PowerBarrier);
    for (const [x, c] of [[27.5, 0x3f6a4e], [28.5, 0x6a7078], [29.5, 0x3f6a4e]] as const) {
      box(x, 2.0, 22.5, 0.92, 1.95, 0.9, c);
      for (const y of [1.6, 2.6]) box(x, y, 22.96, 0.6, 0.06, 0.04, 0x23272c);
      box(x + 0.28, 2.0, 22.97, 0.06, 0.3, 0.04, 0xa0a6ac);
    }
    for (const [x, y, z] of [[38, 1, 22], [39, 1, 22], [38, 2, 22], [38, 1, 23], [40, 1, 22]] as const) world.set(x, y, z, Block.Crate);
    // short lamp posts round the drill pit, and rubble down in it
    for (const [x, z] of [[37.25, 40.75], [48.75, 40.75], [37.25, 50.25], [48.75, 50.25], [37.25, 45.5], [43, 50.25]]) {
      box(x, 1.55, z, 0.16, 1.1, 0.16, 0x2c3035);
      box(x, 2.15, z, 0.34, 0.24, 0.34, 0x2c3035);
      box(x, 2.15, z, 0.26, 0.18, 0.36, 0xffc070, true);
    }
    for (let i = 0; i < 26; i++) {
      const x = 38.4 + ((i * 37) % 92) / 10, z = 41.4 + ((i * 53) % 80) / 10, sz = 0.25 + ((i * 13) % 5) * 0.12;
      box(x, 0.3 + sz / 2, z, sz, sz * 0.8, sz * 1.1, [0x5a5e66, 0x464a52, 0x6c7078, 0x7a6448][i % 4]);
    }
  } else if (theme === 'freight') {
    // After reference/new-sector-mockups/freight-depot.png: a tall loading
    // hall — stacked containers either side of a broad aisle with a grated
    // track, catwalks with yellow railings and stairs down both walls, a red
    // girder crane overhead with a hazard-striped cargo frame on its hoist,
    // square warm ceiling lamps, and a big cargo door round the red door.
    const RUSTB = 0x9a4a2c, RUSTF = 0xb0603a, FRAME_B = 0x2c3a4c, FRAME_R = 0x5e2e1e, HAZ = 0xd8a830, HAZD = 0x26282c;
    // the loading track: grating between hazard edges, wall to arrival
    for (let z = hall.z; z < hall.z + hall.d + 2; z++) {
      world.set(cx - 1, 0, z, Block.FreightGrate); world.set(cx, 0, z, Block.FreightGrate);
      world.set(cx - 2, 0, z, Block.FreightHazardFloor); world.set(cx + 1, 0, z, Block.FreightHazardFloor);
    }
    // containers are real voxels (corrugated tiles, baked light) with a darker frame
    const container = (x: number, y0: number, z: number, w: number, h: number, d: number, red: boolean): void => {
      fill(x, y0, z, w, h, d, red ? Block.FreightCargoRed : Block.FreightCargo);
      const fr = red ? FRAME_R : FRAME_B;
      for (const xx of [x, x + w]) for (const zz of [z, z + d]) box(xx, y0 + h / 2, zz, 0.32, h + 0.04, 0.32, fr);
      for (const yy of [y0 + 0.1, y0 + h - 0.1]) {
        for (const zz of [z, z + d]) box(x + w / 2, yy, zz, w + 0.3, 0.2, 0.3, fr);
        for (const xx of [x, x + w]) box(xx, yy, z + d / 2, 0.3, 0.2, d + 0.3, fr);
      }
      // the door end faces the arrival: two locking bars and their handles
      for (const xx of [x + w * 0.38, x + w * 0.62]) {
        box(xx, y0 + h / 2, z + d + 0.05, 0.1, h - 0.5, 0.08, 0xa4a9ae);
        box(xx + 0.12, y0 + h * 0.45, z + d + 0.09, 0.22, 0.08, 0.06, 0xa4a9ae);
      }
    };
    container(20, 1, 39, 6, 3, 7, false); container(20, 4, 39, 6, 3, 7, true);
    container(21, 1, 27, 5, 3, 7, true);
    container(42, 1, 39, 6, 3, 7, true); container(42, 4, 39, 6, 3, 7, false);
    container(42, 1, 27, 5, 3, 7, false);
    // wooden crates frame the arrival without blocking the aisle
    // wooden crates in 2×2×2 stacks (the mockup's crates are big), a few loose ones
    for (const [x0, z0, h] of [[26, 49, 2], [41, 49, 2], [37, 24, 1], [29, 24, 2]] as const) {
      for (let x = x0; x < x0 + 2; x++) for (let z = z0; z < z0 + 2; z++) for (let y = 1; y <= h; y++) world.set(x, y, z, Block.Crate);
    }
    for (const [x, z] of [[28, 51], [40, 51], [31, 25]] as const) world.set(x, 1, z, Block.Crate);
    // catwalks down both walls at y = 5, a railing on the open edge, stairs to the floor
    for (const [x0, railX, stairX] of [[16, 18.92, 16], [49, 49.08, 50]] as const) {
      fill(x0, 5, 23, 3, 1, 19, Block.Metal);
      rail(railX, 6, 23, 19, 'z');
      for (let i = 0; i < 5; i++) fill(stairX, 1, 50 - i * 2, 2, i + 1, 2, Block.Metal);
      architecture.stairs.push({ x: stairX, z: 40, w: 2, d: 13 });
      // concrete posts under the open edge
      const post = x0 === 16 ? 18 : 49;
      for (const z of [24, 32, 40]) fill(post, 1, z, 1, 4, 1, Block.FreightWall);
      // a service door and its lamp on the catwalk wall
      const face = x0 === 16 ? 16.04 : 51.96;
      box(face, 7.2, 31, 0.08, 2.4, 1.5, 0x3b4148);
      box(face, 7.2, 31, 0.1, 2.5, 0.08, 0x23272c);
      box(face, 8.75, 31, 0.1, 0.12, 1.7, 0x6a7078);
    }
    // overhead crane: runway girders down both sides, a double-girder bridge
    // across the hall, the trolley and hoist, chains, the hazard-striped frame
    const girder = (x: number, y: number, z: number, len: number, axis: 'x' | 'z'): void => {
      const lx = axis === 'x' ? len : 0.34, lz = axis === 'x' ? 0.34 : len;
      box(x, y, z, lx, 0.95, lz, RUSTB);
      for (const dy of [-0.5, 0.5]) box(x, y + dy, z, axis === 'x' ? len : 0.95, 0.16, axis === 'x' ? 0.95 : len, RUSTF);
      for (let t = -len / 2 + 1; t < len / 2; t += 2) box(x + (axis === 'x' ? t : 0), y, z + (axis === 'x' ? 0 : t), axis === 'x' ? 0.12 : 0.5, 0.8, axis === 'x' ? 0.5 : 0.12, RUSTF);
    };
    for (const x of [19.5, 48.5]) girder(x, 10.9, hall.z + hall.d / 2, hall.d, 'z');
    for (const z of [33.6, 36.4]) girder(cx, 10.3, z, 29.6, 'x');
    for (const z of [24.5, 50.5]) girder(cx, 11.2, z, 34, 'x');
    box(cx, 10.95, 35, 2.4, 0.9, 3.6, 0x4c5259); box(cx, 11.45, 35, 2.2, 0.14, 3.3, HAZ);
    box(cx, 9.75, 35, 1.1, 1.0, 1.1, 0x3a3f46);
    for (const [dx, dz] of [[-2.6, -0.95], [2.6, -0.95], [-2.6, 0.95], [2.6, 0.95]]) {
      for (let t = 0.1; t < 1; t += 0.2) box(cx + dx * t * 0.95, 9.25 - t * 0.75, 35 + dz * t, 0.12, 0.3, 0.12, 0x6b7076);
    }
    const stripes = (x0: number, z0: number, len: number, axis: 'x' | 'z', y: number): void => {
      for (let t = 0; t < len; t += 0.5) box(x0 + (axis === 'x' ? t + 0.25 : 0), y, z0 + (axis === 'x' ? 0 : t + 0.25), axis === 'x' ? 0.5 : 0.38, 0.42, axis === 'x' ? 0.38 : 0.5, (t * 2) % 2 ? HAZD : HAZ);
    };
    stripes(cx - 3, 33.8, 6, 'x', 8.4); stripes(cx - 3, 36.2, 6, 'x', 8.4);
    stripes(cx - 3, 33.8, 2.4, 'z', 8.4); stripes(cx + 3, 33.8, 2.4, 'z', 8.4);
    // square ceiling lamps in rows, each in a dark housing
    for (const x of [24, 34, 44]) for (const z of [27, 35, 43, 51]) {
      world.set(x, 13, z, Block.FreightLamp);
      box(x + 0.5, 12.92, z + 0.5, 1.3, 0.16, 1.3, 0x2e3237);
      box(x + 0.5, 12.84, z + 0.5, 0.95, 0.04, 0.95, 0xffe6a8, true);
    }
    for (const z of [27, 35]) { lamp(15, 8, z, 'west'); lamp(52, 8, z, 'east'); }
    // the far wall: a big braced cargo door round the real red door, hazard
    // posts either side, a lintel lamp pair and the depot sign above
    const DOOR = 0x4f565e, RIB = 0x6c747c, BRACE = 0x3c4249;
    for (const side of [-1, 1]) {
      const lx = cx + side * 2.75;
      box(lx, 3.0, 22.05, 3.5, 4.0, 0.1, DOOR);
      for (const y of [1.25, 2.45, 3.65, 4.85]) box(lx, y, 22.11, 3.5, 0.14, 0.05, RIB);
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        box(lx - 1.55 + t * 3.1, 1.2 + t * 3.6, 22.12, 0.42, 0.42, 0.05, BRACE);
        box(lx + 1.55 - t * 3.1, 1.2 + t * 3.6, 22.12, 0.42, 0.42, 0.05, BRACE);
      }
    }
    box(cx, 4.5, 22.05, 2.1, 1.0, 0.1, DOOR);
    for (const x of [cx - 4.65, cx + 4.65]) box(x, 2.9, 22.14, 0.36, 4.2, 0.22, 0x7a8188);
    box(cx, 5.2, 22.14, 9.66, 0.4, 0.22, 0x7a8188);
    for (const x of [cx - 6, cx + 5]) for (let y = 1; y <= 4; y++) world.set(x, y, 21, Block.FreightHazardFloor);
    lamp(cx - 2, 5, 21); lamp(cx + 1, 5, 21);
    architecture.signs.push({ text: 'FREIGHT DEPOT', x: cx, y: 6.35, z: 22.04, w: 8 });
    // big concrete pillars floor to ceiling, carrying the crane runways
    for (const x of [19, 47]) for (const z of [24, 35, 47]) fill(x, 1, z, 2, hall.h, 2, Block.FreightWall);
    // the catwalk offices: a second door, lit windows, a lamp over each door
    for (const face of [16.04, 51.96]) {
      box(face, 7.2, 39, 0.08, 2.4, 1.5, 0x3b4148);
      box(face, 7.2, 39, 0.1, 2.5, 0.08, 0x23272c);
      for (const z of [31, 39]) {
        box(face, 9.0, z, 0.14, 0.26, 0.6, 0x2e3237);
        box(face + (face < cx ? 0.06 : -0.06), 9.0, z, 0.06, 0.16, 0.46, 0xffd890, true);
      }
      for (const z of [26.5, 35]) {
        box(face, 7.6, z, 0.1, 1.2, 2.0, 0x6a7078);
        box(face + (face < cx ? 0.05 : -0.05), 7.6, z, 0.06, 0.95, 1.75, 0x6f8a96, true);
        box(face + (face < cx ? 0.08 : -0.08), 7.6, z, 0.04, 0.95, 0.08, 0x3b4148);
      }
    }
  } else {
    // After reference/sector7-medical-wing-v1.png: a bright tiled ward — a
    // central aisle under fluorescent troffers and dark ducts, bed bays behind
    // cream pillars on the left, an operating room through a wide framed
    // opening on the right, triage and a medicine cabinet at the front.
    const WHITE = 0xe2e0d4, TEAL = 0x4ea398, FRAME = 0x9aa0a4, DUCT = 0x3a3e44, SCREEN = 0x1c3a44, ECG = 0x5ef0f0, CROSS = 0x55d8e8;
    // right partition with the operating-room opening (z 29–38, 4 high), framed
    for (let z = hall.z; z < hall.z + hall.d; z++) for (let y = 1; y <= hall.h; y++) {
      if (z >= 29 && z <= 38 && y <= 4) continue;
      world.set(41, y, z, wall(y));
    }
    for (const z of [28.85, 39.15]) box(40.9, 2.5, z, 0.3, 4.1, 0.3, FRAME);
    box(40.9, 4.92, 34, 0.3, 0.26, 10.6, FRAME);
    for (let z = 29; z <= 38; z++) world.set(40, 0, z, Block.FreightHazardFloor);
    // cream pillars with the teal band between the bed bays and the aisle
    for (const z of [24, 32, 40, 48]) for (let y = 1; y <= hall.h; y++) world.set(27, y, z, wall(y));
    // the bed bays: head to the wall, foot to the aisle, a teal screen between
    for (const z0 of [25, 29, 33, 37, 41, 45]) {
      fill(19, 1, z0, 3, 1, 2, Block.PowerBarrier);
      for (const [dx, dz] of [[0.35, 0.2], [2.45, 0.2], [0.35, 1.8], [2.45, 1.8]]) box(19 + dx, 1.12, z0 + dz, 0.22, 0.24, 0.22, 0x2a2d31);
      box(20.4, 1.45, z0 + 1, 2.6, 0.18, 1.5, FRAME);
      box(20.45, 1.72, z0 + 1, 2.5, 0.34, 1.4, WHITE);
      box(20.95, 1.92, z0 + 1, 1.5, 0.06, 1.44, TEAL);
      box(19.55, 1.98, z0 + 1, 0.55, 0.18, 1.0, WHITE);
      box(19.08, 2.0, z0 + 1, 0.12, 1.1, 1.5, FRAME);
      box(21.7, 1.85, z0 + 1, 0.1, 0.6, 1.5, FRAME);
      // a heart monitor on the wall above the head
      box(19.06, 3.3, z0 + 1, 0.1, 0.85, 1.1, 0x2c3034);
      box(19.12, 3.3, z0 + 1, 0.05, 0.62, 0.86, SCREEN, true);
      for (let i = 0; i < 6; i++) box(19.15, 3.3 + [0, 0, 0.18, -0.14, 0, 0][i], z0 + 0.65 + i * 0.14, 0.03, 0.06, 0.14, ECG, true);
      architecture.beds++;
    }
    for (const z of [28, 32, 36, 40, 44]) {
      fill(19, 1, z, 3, 2, 1, Block.PowerBarrier);
      box(20.5, 2.0, z + 0.5, 2.9, 2.2, 0.14, TEAL);
      box(20.5, 3.15, z + 0.5, 3.0, 0.1, 0.18, FRAME);
    }
    // the operating room: table, surgical lamp, wall of cabinets, a monitor cart
    fill(44, 1, 32, 3, 1, 3, Block.PowerBarrier);
    box(45.5, 1.5, 33.5, 0.8, 1.0, 1.0, 0x2a2d31); box(45.5, 2.1, 33.5, 2.8, 0.22, 1.2, WHITE);
    box(45.5, 5.6, 33.5, 0.12, 0.9, 0.12, FRAME); box(45.5, 5.05, 33.5, 2.0, 0.26, 1.6, WHITE);
    for (const dx of [-0.48, 0.48]) for (const dz of [-0.38, 0.38]) box(45.5 + dx, 4.9, 33.5 + dz, 0.8, 0.05, 0.62, 0xf6f8ec, true);
    fill(48, 1, 25, 1, 3, 12, Block.MedicalCabinet);
    fill(42, 1, 25, 2, 1, 1, Block.PowerBarrier);
    box(43, 1.9, 25.5, 1.4, 1.6, 0.8, 0xc8ccc8); box(43, 2.5, 25.92, 0.8, 0.5, 0.05, SCREEN, true);
    // triage at the front right of the aisle, a glass medicine cabinet beside it
    fill(37, 1, 46, 3, 2, 2, Block.PowerBarrier);
    box(38.5, 1.55, 47, 3, 1.1, 2, WHITE); box(38.5, 2.15, 47, 3.2, 0.16, 2.2, FRAME);
    box(38.5, 1.55, 48.03, 1.0, 0.9, 0.06, 0x2a2d31);
    box(38.5, 1.55, 48.08, 0.18, 0.62, 0.04, CROSS, true); box(38.5, 1.55, 48.08, 0.62, 0.18, 0.04, CROSS, true);
    architecture.signs.push({ text: 'TRIAGE', x: 38.5, y: 2.75, z: 48.12, w: 1.8 });
    fill(40, 1, 49, 1, 3, 3, Block.PowerBarrier);
    box(40.5, 2.5, 50.5, 0.95, 3.0, 2.9, FRAME);
    box(40.0, 2.5, 50.5, 0.05, 2.7, 2.6, 0x9ed8d8);
    for (const y of [1.6, 2.5, 3.4]) for (const z of [49.6, 50.5, 51.4]) {
      box(40.2, y, z, 0.35, 0.42, 0.6, WHITE);
      box(39.99, y, z, 0.03, 0.22, 0.08, CROSS, true); box(39.99, y, z, 0.03, 0.08, 0.22, CROSS, true);
    }
    // the ceiling: troffers down the aisle and over the bays, dark ducts, vents
    for (const z of [25, 31, 37, 43, 49]) {
      for (const x of [30, 37]) world.set(x, hall.h + 1, z, Block.MedicalLamp);
      world.set(22, hall.h + 1, z + 1, Block.MedicalLamp);
      if (z < 45) world.set(45, hall.h + 1, z + 1, Block.MedicalLamp);
    }
    for (const x of [28.4, 39.4]) {
      box(x, hall.h + 0.55, hall.z + hall.d / 2, 1.3, 0.7, hall.d, DUCT);
      for (let z = hall.z + 3; z < hall.z + hall.d; z += 7) box(x, hall.h + 0.18, z, 1.0, 0.04, 1.2, 0x23262b);
    }
    for (const z of [30, 40, 50]) { world.set(cx - 1, 0, z, Block.FreightGrate); world.set(cx, 0, z, Block.FreightGrate); }
    architecture.signs.push({ text: 'MEDICAL WING', x: cx, y: 5.45, z: 22.04, w: 4.6 });
    // bedside drawers between each bed and its screen
    for (const z0 of [25, 29, 33, 37, 41, 45]) {
      fill(19, 1, z0 + 2, 1, 1, 1, Block.PowerBarrier);
      box(19.45, 1.5, z0 + 2.5, 0.8, 1.0, 0.8, WHITE);
      for (const y of [1.3, 1.65]) box(19.86, y, z0 + 2.5, 0.04, 0.05, 0.6, 0x9aa0a4);
      box(19.88, 1.48, z0 + 2.5, 0.04, 0.06, 0.2, 0x5a5e62);
    }
    // wheeled carts at the foot of the bays
    for (const [x, z] of [[24, 30], [25, 42]] as const) {
      fill(x, 1, z, 1, 1, 1, Block.PowerBarrier);
      box(x + 0.5, 1.55, z + 0.5, 0.8, 0.55, 0.62, WHITE);
      box(x + 0.5, 1.88, z + 0.5, 0.88, 0.06, 0.7, FRAME);
      box(x + 0.5, 1.28, z + 0.5, 0.82, 0.06, 0.64, FRAME);
      for (const dx of [-0.32, 0.32]) for (const dz of [-0.24, 0.24]) box(x + 0.5 + dx, 1.08, z + 0.5 + dz, 0.12, 0.16, 0.12, 0x2a2d31);
      box(x + 0.94, 2.0, z + 0.5, 0.05, 0.3, 0.5, FRAME);
    }
    // vent grilles high on the walls
    const vent = (x: number, y: number, z: number, alongX: boolean): void => {
      box(x, y, z, alongX ? 1.2 : 0.08, 0.8, alongX ? 0.08 : 1.2, 0x5a5e62);
      for (let t = -0.28; t <= 0.29; t += 0.14) box(x + (alongX ? 0 : (x < cx ? 0.03 : -0.03)), y + t, z + (alongX ? 0.03 : 0), alongX ? 1.0 : 0.04, 0.06, alongX ? 0.04 : 1.0, 0x2a2d31);
    };
    vent(cx - 5.5, 4.6, 22.05, true); vent(cx + 5.5, 4.6, 22.05, true);
    for (const z of [27, 39]) vent(19.05, 5.0, z, false);
    for (const z of [25, 46]) vent(40.95, 5.0, z, false);
    // a brass cable from a junction box up the partition and along the top
    // (dull, unlit: the glowing amber node means the Power Link puzzle)
    const CABLE = 0xb07a28;
    box(40.88, 3.4, 43.5, 0.14, 0.7, 0.7, 0x8a6a30); box(40.82, 3.4, 43.5, 0.04, 0.42, 0.42, 0x4a3a20);
    box(40.9, 4.7, 43.5, 0.12, 1.9, 0.12, CABLE);
    box(40.9, 5.6, 48.0, 0.12, 0.12, 9.0, CABLE);
    box(40.9, 2.4, 43.5, 0.12, 1.3, 0.12, CABLE);
  }

  if (theme !== 'freight') {
    // a wide double door round the real red door: leaves, a heavy frame, a
    // light bar, hazard posts either side and the reader on the right
    const leaf = medical ? 0x8e2e28 : 0x5c636b, frameC = medical ? 0x3c4146 : 0x7c838a;
    for (const side of [-1, 1]) {
      box(cx + side * 1.5, 2.05, 22.05, 1.0, 3.1, 0.1, leaf);
      for (const y of [1.45, 2.75]) box(cx + side * 1.5, y, 22.11, 1.0, 0.1, 0.05, frameC);
      box(cx + side * 2.2, 2.25, 22.14, 0.4, 3.5, 0.22, frameC);
    }
    box(cx, 4.15, 22.14, 4.8, 0.32, 0.22, frameC);
    box(cx, 4.5, 22.1, 1.8, 0.14, 0.08, medical ? 0xff3428 : 0xffb050, true);
    for (const x of [cx - 4, cx + 3]) for (let y = 1; y <= 3; y++) world.set(x, y, 21, Block.FreightHazardFloor);
    if (excavation) { lamp(cx - 2, 5, 21); lamp(cx + 1, 5, 21); }
  }
  world.set(theme === 'freight' ? cx + 5 : cx + 3, 2, 21, Block.LampRed);
  for (const r of rooms.filter((r) => r.kind !== 'arena' && r.kind !== 'spawn')) {
    for (const x of [r.x + 2, r.x + r.w - 3]) world.set(x, r.h + 1, r.z + 3, r.kind === 'key' ? Block.LampRed : r.kind === 'exit' ? Block.ServiceLampWarm : c.lamp);
  }
  // Exit lift and a guarded landing, identical mechanics to the existing campaign.
  const exitRoom = rooms.find((r) => r.kind === 'exit')!;
  fill(exitRoom.x, 1, 6, 12, 3, 6, Block.ServiceWall);
  fill(cx - 1, 3, 10, 2, 1, 2, Block.ExitPad);
  const ledgeCells: Array<[number, number]> = [];
  for (let x = exitRoom.x; x < exitRoom.x + 12; x++) if (x !== cx - 1 && x !== cx) { world.set(x, 4, 11, Block.PowerBarrier); ledgeCells.push([x, 11]); }
  world.set(cx, 7, 8, Block.ServiceLampGreen);

  // Authored secret chamber behind a visibly cracked seal.
  carve(57, 42, 6, 6, 3); carve(59, 39, 2, 3, 3);
  const secretWall: Array<[number, number, number]> = [];
  for (const x of [59, 60]) for (const y of [1, 2, 3]) { world.set(x, y, 41, Block.Cracked); secretWall.push([x, y, 41]); }
  // Standard optional cache, using the existing shoot-node / cable / gate machinery.
  fill(62, 1, 28, 1, 3, 2, Block.Metal); fill(66, 1, 28, 1, 3, 2, Block.Metal); fill(62, 4, 28, 5, 1, 2, Block.Metal);
  fill(63, 1, 29, 3, 3, 1, Block.PowerBarrier); world.set(68, 2, 35, Block.LampWarm);

  const pickups: LevelData['pickups'] = [
    { kind: 'keyRed', x: 8.5, y: 1.4, z: 31.5 },
    { kind: 'weaponShotgun', x: cx - 2, y: 1.4, z: 58 },
    { kind: 'weaponSMG', x: 9.5, y: 1.4, z: 35.5 },
    { kind: 'weaponArc', x: cx, y: 1.4, z: 36 },
    { kind: 'weaponRocket', x: 60.5, y: 1.4, z: 45.5 },
    { kind: 'armorVest', x: 58.5, y: 1.4, z: 46.5 },
    { kind: 'ammoRockets', x: 61.5, y: 1.4, z: 43.5 },
    ...(['healthBig', 'armorVest', 'ammoCells'] as const).map((kind, i) => ({ kind, x: 63.5 + i, y: 1.4, z: 28.5, sealed: true })),
  ];
  for (const [x, z] of [[cx + 2, 57], [28, 43], [36, 29], [56, 37], [7, 37]]) pickups.push({ kind: rng.pick(['ammoBullets', 'ammoShells', 'healthSmall', 'ammoCells'] as const), x: x + 0.5, y: 1.4, z: z + 0.5 });
  // Ground-level enemies always have supported, clear headroom and an unobstructed floor route.
  const anchors = [[cx, 30], [cx - 3, 40], [cx + 2, 45], [cx + 3, 26], [9, 33], [57, 35], [cx, 48], [cx - 2, 34], [cx + 2, 38]];
  const enemies: LevelData['enemies'] = [];
  const pool = ['husk', 'husk', 'sentinel', 'brute'] as const;
  for (const [x, z] of anchors) {
    if (world.get(x, 1, z) !== Block.Air || world.get(x, 2, z) !== Block.Air) continue;
    const roomId = x < 14 ? 2 : x >= 54 ? 3 : 0;
    enemies.push({ kind: enemies.length === 0 ? 'brute' : rng.pick(pool), x: x + 0.5, z: z + 0.5, roomId });
    if (difficulty >= 8 && world.get(x + 1, 1, z + 1) === Block.Air && world.get(x + 1, 2, z + 1) === Block.Air) enemies.push({ kind: 'husk', x: x + 1.5, z: z + 1.5, roomId });
  }
  // Foreground supply boxes frame the entrance without occupying the aisle.
  for (const [x, z] of [[27, 52], [28, 51], [41, 52], [55, 37]]) if (world.get(x, 1, z) === Block.Air) world.set(x, 1, z, Block.Crate);
  if (world.get(27, 1, 52) === Block.Crate) world.set(27, 2, 52, Block.Crate);
  const lightOverrides = new Map<number, { color: [number, number, number]; range: number }>();
  for (let y = 0; y < world.sy; y++) for (let z = 0; z < world.sz; z++) for (let x = 0; x < world.sx; x++) {
    if (world.get(x, y, z) === c.lamp) lightOverrides.set(world.index(x, y, z), { color: medical ? [255, 246, 226] : excavation ? [255, 200, 140] : [255, 230, 190], range: medical ? 14 : excavation ? 12 : 23 });
  }
  world.bakeLighting(excavation ? [56, 60, 72] : medical ? [86, 86, 82] : c.ambient, lightOverrides);
  return {
    world, seed, theme, rooms, architecture, pickups, enemies, totalEnemies: enemies.length,
    spawn: { x: cx, y: 1.9, z: 56 },
    doors: [{ x: cx - 1, z: 21, dir: 'z', locked: 'red' }],
    elevator: { x: cx - 1, z: 12, lowY: 1, highY: 4, walkAxis: 'z' },
    exitPad: { x: cx, y: 4, z: 11 },
    exitSign: { x: cx, y: 4, z: 6, face: 'zmin' },
    ledgeRail: { cells: ledgeCells, y: 4, axis: 'x', inward: 1 },
    secretRect: { x: 57, z: 42, w: 6, d: 6 }, secretWall, totalSecrets: 1,
    powerLink: { node: { x: 68, y: 2, z: 35, nx: -1, nz: 0 }, cage: { ox: 62, oz: 28, ux: 1, uz: 0, nx: 0, nz: 1 }, room: { x0: 54, z0: 28, x1: 68, z1: 40 }, cableY: 4.5 },
  };
}
