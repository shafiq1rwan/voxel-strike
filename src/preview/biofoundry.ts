import * as THREE from 'three';
import type { Game, LevelPreview, PreviewArt } from '../game';
import type { Enemy } from '../entities/enemies';
import { BIO_AMBIENT, TANK_D, TANK_W, type BioLayout, type LevelData } from '../world/levelgen';
import { Block } from '../world/blocks';
import { VoxelWorld } from '../world/world';
import { RNG } from '../core/rng';
import type { RoomDef, PickupSpec, EnemySpec } from '../types';
import type { TerminalLine } from '../ui/terminal';

/**
 * Sector 4 "Biofoundry" — the campaign's authored final sector (it follows
 * sector 3 behind the facility terminal; `?sector4` on web builds still opens
 * it alone as a preview). Styled after
 * reference/sector4-biofoundry.png: a purple-lit specimen hall with glowing
 * green tanks, ribbed pillars carrying warm light bands, crimson growth with
 * orange nodes, and slime on the tiles. Collision stays ordinary voxels; the
 * atlas has a dedicated Lab* block set (append-only); everything softer is
 * instanced boxes from decorate().
 *
 * Occupied tanks hold a real, dormant Vatborn (reference/sector4-monsters.md):
 * shooting the tank or loud gunfire nearby starts a 1.2s agitation (it
 * thrashes and pounds the glass, the status light blinks, the glass knocks),
 * then the front pane breaches — the front glass voxels become air — liquid
 * gushes out as droplets that fall, splash and skid across the tiles while
 * the tank drains and the puddle spreads, and the Vatborn walks out through
 * the gap onto a verified clear tile. Each tank releases once; at most two
 * tanks breach at a time.
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

/** specimen tanks: 3 (x) × 2 (z) footprint, glass y=2..4 on a metal base; [x, z, broken, occupied] */
const TANKS: Array<[number, number, boolean, boolean]> = [
  [24, 46, true, false], [24, 40, false, true], [24, 34, false, false], [49, 46, false, false], [49, 40, false, false], [49, 34, false, true],
  [59, 35, false, false], [71, 42, false, true],
  [57, 12, false, true],
  [27, 8, false, false], [45, 8, false, false],
];
/** 2×2 structural pillars (x, z of the min corner); a warm light band at y=3 */
const PILLARS: Array<[number, number]> = [[30, 38], [44, 38], [30, 46], [44, 46], [30, 12], [43, 12]];
/** pillars the growth has claimed: [pillar x, pillar z, side dx, side dz] */
const GROWN: Array<[number, number, number, number]> = [[30, 38, 1, 0], [44, 46, -1, 0], [30, 12, 1, 0], [43, 12, -1, 0]];
/** extra slime spills around the authored map: [x, z, radius] */
const SPILLS: Array<[number, number, number]> = [[33, 49, 0.9], [47, 36, 0.7], [62, 44, 0.8], [27, 20, 0.9], [8, 44, 0.6]];

// breach timings from the monster notes
const AGITATE_S = 1.2;
/** the tank drains (and gushes) over this long after the breach */
const DRAIN_S = 1.1;
/** the occupant starts wading out this long after the breach (it walks for 0.8s) */
const EMERGE_AT_S = 0.35;
/** droplets per second at the start of the gush */
const GUSH_RATE = 280;
const MAX_BREACHING = 2;
/** gunfire this close counts as "nearby loud combat" for a dormant tank */
const NOISE_RANGE = 9;

/**
 * The facility terminal shown on the way down from sector 3
 * (Game.descendToBiofoundry). Facts here must match the sector: the tank
 * line is filled in from the generated level with `setTanks()` before the
 * typing reaches it; gunfire near an occupied tank wakes it; the lower
 * transit lift sits behind red access — the same keycard → red door → lift
 * flow as every sector. No teases past this sector (docs/ART.md).
 */
export function biofoundryTerminal(): { title: string; node: string; lines: TerminalLine[]; setTanks(occupied: number, total: number): void } {
  const lines: TerminalLine[] = [
    { kind: 'cmd', text: '> AUTH  OPERATIVE ................ ACCEPTED' },
    { kind: 'cmd', text: '> SECTOR 3 STATUS ................ CLEARED', pause: 250 },
    { kind: 'cmd', text: '> LOCATE EXIT ROUTE' },
    { kind: 'out', text: '    SURFACE LIFT ................. OFFLINE' },
    { kind: 'out', text: '    SERVICE SHAFT ................ COLLAPSED' },
    { kind: 'out', text: '    BIOFOUNDRY TRANSIT ........... OPEN', pause: 350 },
    { kind: 'cmd', text: '> ONLY ROUTE OUT: LEVEL B4 / BIOFOUNDRY' },
    { kind: 'out', text: '    SPECIMEN PRODUCTION · CONTAINMENT FAILING' },
    { kind: 'out', text: '    SPECIMEN TANKS OCCUPIED ...... SCANNING', pause: 250 },
    { kind: 'warn', text: '!   GUNFIRE NEAR AN OCCUPIED TANK WAKES WHAT IS INSIDE.' },
    { kind: 'warn', text: '!   RED ACCESS REQUIRED FOR THE LOWER TRANSIT LIFT.', pause: 350 },
    { kind: 'final', text: '> TRANSIT LIFT ARMED. DESCENDING.' },
  ];
  const tankLine = lines[8];
  return {
    title: 'VXS-OS 4.12',
    node: 'SERVICE TERMINAL B3-07',
    lines,
    setTanks(occupied: number, total: number): void {
      tankLine.text = `    SPECIMEN TANKS OCCUPIED ...... ${occupied} OF ${total}`;
    },
  };
}

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
  // hazard rail along the ledge's open edge (z = 9), gap where the lift docks
  // — same as levelgen's exit ledges, so a step off the pad can't drop you
  for (let x = 4; x < 18; x++) if (x !== 9 && x !== 10) world.set(x, 4, 9, Block.Trim);

  const pickups: PickupSpec[] = [];
  const item = (kind: PickupSpec['kind'], x: number, z: number): void => { pickups.push({ kind, x: x + 0.5, y: 1.5, z: z + 0.5 }); };
  item('keyRed', 67, 15);
  for (const [x, z] of [[35, 62], [7, 39], [62, 43], [60, 19], [34, 19]]) {
    item('healthBig', x, z); item('ammoShells', x + 1, z); item('ammoCells', x, z + 1);
  }
  item('armorVest', 13, 43); item('ammoRockets', 14, 43); item('powerShield', 37, 15);
  const enemies: EnemySpec[] = [];
  const enemy = (kind: EnemySpec['kind'], x: number, z: number, roomId: number): void => { enemies.push({ kind, x: x + 0.5, z: z + 0.5, roomId }); };
  enemy('husk', 34, 37, 1); enemy('sentinel', 46, 41, 1); enemy('ticker', 41, 46, 1);
  enemy('husk', 11, 36, 2); enemy('ticker', 13, 41, 2);
  enemy('sentinel', 66, 36, 3); enemy('husk', 63, 43, 3);
  enemy('sentinel', 66, 18, 4); enemy('husk', 60, 14, 4);
  enemy('brute', 37, 13, 5); enemy('husk', 33, 19, 5); enemy('sentinel', 46, 17, 5);
  // the Vatborn in the occupied tanks are preallocated: they count toward the
  // roster now and spawn from decorate()'s breach sequence later
  const occupied = TANKS.filter((t) => t[3]).length;

  world.bakeLighting(BIO_AMBIENT);
  // the same scenery data a generated Biofoundry carries
  const bio: BioLayout = {
    tanks: TANKS.map(([x, z, broken, occ]) => ({ x, z, broken, occupied: occ })),
    pillars: PILLARS,
    grown: GROWN,
    spills: SPILLS,
    signs: [
      { text: 'BIOFOUNDRY', x: 38, y: 5.15, z: 32.03, w: 7.4, big: true },
      // the lab (room 1) wears the BIOFOUNDRY sign instead of its name
      ...rooms.filter((r) => r.id !== 1).map((r) => ({ text: ROOMS[r.id][0], x: r.cx, y: 4.5, z: r.z + 0.03, w: 4.4, big: false })),
    ],
    heart: { x: 37.5, z: 6, dir: 1 },
    labDoor: { x: 38, z: 32 },
  };
  return {
    world, rooms, pickups, enemies, seed, theme: 'biofoundry', bio,
    doors: [{ x: 20, z: 15, dir: 'x', locked: 'red' }, { x: 37, z: 55, dir: 'z', locked: null }, { x: 65, z: 27, dir: 'z', locked: null }],
    spawn: { x: 38, y: 2.05, z: 64 },
    elevator: { x: 9, z: 10, lowY: 1, highY: 4, walkAxis: 'z' },
    exitPad: { x: 10, y: 4, z: 9 }, secretRect: null, totalEnemies: enemies.length + occupied, totalSecrets: 0,
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
const STATUS = 0xffa030;

interface Inst { x: number; y: number; z: number; w: number; h: number; d: number; ry: number; rz: number }

/** raw palette value: the renderer outputs linear, so a plain hex would be sRGB-decoded and render near-black */
function raw(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
}

function shadedBox(): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.fill(FACE_SHADE[Math.floor(i / 4)], i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

type TankPhase = 'dormant' | 'agitated' | 'breaching' | 'released' | 'empty';

/** a live occupied tank: its own meshes (so they can change) + the breach state machine */
interface OccupiedTank {
  x: number; z: number;
  /** which side faces the room: +1 = the +x face, -1 = the -x face */
  side: number;
  /** yaw that faces the room */
  facing: number;
  /** reserved standing spot in front of the pane */
  exitX: number; exitZ: number;
  roomId: number;
  phase: TankPhase;
  t: number;
  knocks: number;
  group: THREE.Group;
  /** the occupant: a real Vatborn, dormant until the breach */
  vat: Enemy | null;
  liquid: THREE.Mesh;
  surface: THREE.Mesh;
  front: THREE.Mesh;
  light: THREE.Mesh;
  /** puddle pieces that spread out from the pane after the breach */
  spill: THREE.Mesh[];
  gushAcc: number;
}

function decorate(level: LevelData): PreviewArt {
  const group = new THREE.Group();
  group.name = 'biofoundry-preview-art';
  const world = level.world;
  // everything placed comes from the level's Biofoundry data (generated
  // sectors and the authored map fill it the same way)
  const bio: BioLayout = level.bio ?? { tanks: [], pillars: [], grown: [], spills: [], signs: [], heart: null };
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

  // ---- per-tank meshes (occupied tanks only; the rest are instanced) ------
  const shaded = shadedBox();
  const flat = new THREE.BoxGeometry(1, 1, 1);
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const mesh = (color: number, w: number, h: number, d: number, opts: { flat?: boolean; alpha?: number } = {}): THREE.Mesh => {
    const alpha = opts.alpha ?? 1;
    const mat = new THREE.MeshBasicMaterial({
      color: raw(color), vertexColors: !opts.flat, fog: true,
      transparent: alpha < 1, opacity: alpha, depthWrite: alpha >= 1,
    });
    materials.push(mat);
    const m = new THREE.Mesh(opts.flat ? flat : shaded, mat);
    m.scale.set(w, h, d);
    if (alpha < 1) m.renderOrder = color === GLASS ? 2 : 1;
    return m;
  };

  // ---- specimen tanks -----------------------------------------------------
  // The TankGlass voxels are never meshed, so the tank's interior is open:
  // a translucent liquid fill with one surface line, a glass shell around it,
  // and a voxel dummy floating inside (drawn opaque, so it shows through).
  const dummyParts = (facing: number, lean: number, add: (color: number, x: number, y: number, z: number, w: number, h: number, d: number, ry: number, rz: number) => void): void => {
    const c = (i: number): number => DUMMY[i % DUMMY.length];
    const part = (dx: number, dy: number, dz: number, w: number, h: number, d: number, i: number, rz = 0): void => {
      const rx = dx * Math.cos(facing) - dz * Math.sin(facing);
      const rz2 = dx * Math.sin(facing) + dz * Math.cos(facing);
      add(c(i), rx, dy, rz2, w, h, d, facing, rz + lean);
    };
    part(0, 1.05, 0, 0.4, 0.42, 0.4, 0); // head
    part(0, 0.35, 0, 0.62, 0.9, 0.36, 1); // torso
    part(0, -0.25, 0, 0.5, 0.3, 0.3, 2); // hips
    part(-0.5, 0.35, 0, 0.22, 0.8, 0.22, 2, 0.35); // arms, drifting out
    part(0.5, 0.3, 0, 0.22, 0.8, 0.22, 0, -0.4);
    part(-0.16, -0.85, 0.05, 0.24, 0.85, 0.24, 1); // legs
    part(0.18, -0.85, -0.05, 0.24, 0.85, 0.24, 2, 0.1);
  };
  const tanks: OccupiedTank[] = [];
  for (const { x, z, broken, occupied } of bio.tanks) {
    const cx = x + TANK_W / 2, cz = z + TANK_D / 2;
    // dark base and cap slabs with a lit lip, four corner posts
    cube(FRAME, cx, 1.52, cz, TANK_W + 0.3, 1.05, TANK_D + 0.3);
    cube(FRAME_LIGHT, cx, 2.0, cz, TANK_W + 0.34, 0.1, TANK_D + 0.34);
    cube(FRAME, cx, 5.52, cz, TANK_W + 0.3, 1.05, TANK_D + 0.3);
    cube(FRAME_LIGHT, cx, 5.06, cz, TANK_W + 0.34, 0.1, TANK_D + 0.34);
    for (const px of [x, x + TANK_W]) for (const pz of [z, z + TANK_D]) cube(FRAME, px, 3.5, pz, 0.2, 5.1, 0.2);
    // the tank floor, seen through the liquid
    cube(FRAME_LIGHT, cx, 2.03, cz, TANK_W - 0.1, 0.06, TANK_D - 0.1);
    // which side faces the room
    const side = airAt(x + TANK_W, 3, z) ? 1 : airAt(x - 1, 3, z) ? -1 : 0;
    const facing = side === 1 ? -Math.PI / 2 : side === -1 ? Math.PI / 2 : 0;
    const level0 = broken ? 3.55 : 4.72;

    if (!occupied) {
      cube(LIQUID, cx, (2.05 + level0) / 2, cz, TANK_W - 0.06, level0 - 2.05, TANK_D - 0.06, { flat: true, alpha: 0.36 });
      cube(LIQUID_TOP, cx, level0, cz, TANK_W - 0.06, 0.05, TANK_D - 0.06, { flat: true, alpha: 0.8 });
      const dx = (rng.next() - 0.5) * 0.4, dy = (broken ? 2.95 : 3.5) + rng.next() * 0.2, ry = facing + (rng.next() - 0.5) * 0.5;
      dummyParts(ry, 0.12, (color, px, py, pz, w, h, d, ry2, rz) => cube(color, cx + dx + px, dy + py, cz + pz, w, h, d, { ry: ry2, rz }));
      for (let i = 0; i < 7; i++) {
        const s = 0.06 + rng.next() * 0.08;
        cube(LIQUID_TOP, x + 0.3 + rng.next() * (TANK_W - 0.6), 2.3 + rng.next() * (level0 - 2.5), z + 0.3 + rng.next() * (TANK_D - 0.6), s, s, s, { flat: true, alpha: 0.9 });
      }
      cube(GLASS, cx, 3.5, cz, TANK_W + 0.08, 3.02, TANK_D + 0.08, { flat: true, alpha: 0.16 });
    } else {
      // live tank: separate meshes so the sequence can change them
      const g = new THREE.Group();
      group.add(g);
      const liquid = mesh(LIQUID, TANK_W - 0.06, level0 - 2.05, TANK_D - 0.06, { flat: true, alpha: 0.36 });
      liquid.position.set(cx, (2.05 + level0) / 2, cz);
      const surface = mesh(LIQUID_TOP, TANK_W - 0.06, 0.05, TANK_D - 0.06, { flat: true, alpha: 0.8 });
      surface.position.set(cx, level0, cz);
      // glass as five panes so the front one can go
      const panes: THREE.Mesh[] = [];
      const pane = (w: number, h: number, d: number, px: number, py: number, pz: number): THREE.Mesh => {
        const m = mesh(GLASS, w, h, d, { flat: true, alpha: 0.16 });
        m.position.set(px, py, pz);
        panes.push(m);
        return m;
      };
      const W = TANK_W + 0.08, D = TANK_D + 0.08;
      const xFace = pane(0.03, 3.02, D, x + TANK_W + 0.04, 3.5, cz);
      const xBack = pane(0.03, 3.02, D, x - 0.04, 3.5, cz);
      pane(W, 3.02, 0.03, cx, 3.5, z - 0.04);
      pane(W, 3.02, 0.03, cx, 3.5, z + TANK_D + 0.04);
      pane(W, 0.03, D, cx, 5.01, cz);
      const front = side === -1 ? xBack : xFace;
      // amber status light on the cap, room side: occupied tanks are marked
      const light = mesh(STATUS, 0.14, 0.14, 0.06, { flat: true });
      light.position.set(side === -1 ? x - 0.18 : x + TANK_W + 0.18, 5.45, cz);
      light.rotation.y = Math.PI / 2;
      g.add(liquid, surface, light, ...panes);
      // reserved standing spot: 1.5 tiles out from the pane
      const exitX = side === -1 ? x - 1.5 : x + TANK_W + 1.5;
      const room = level.rooms.find((r) => exitX >= r.x && exitX < r.x + r.w && cz >= r.z && cz < r.z + r.d);
      tanks.push({
        x, z, side, facing, exitX, exitZ: cz, roomId: room?.id ?? 1, phase: 'dormant', t: 0, knocks: 0,
        group: g, vat: null, liquid, surface, front, light, spill: [], gushAcc: 0,
      });
    }
    if (broken) {
      // cracked front pane, slime pouring down it and pooling on the tiles
      // (both sit just outside the glass shell at fx + 0.04)
      const fx = x + TANK_W, fz = cz - 0.3;
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
  for (const [px, pz, r] of bio.spills) puddle(px, pz, r, 5);

  // ---- pillars: foot, cap, rust streaks, growth on the claimed ones ------
  for (const [x, z] of bio.pillars) {
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
  for (const [x, z, dx, dz] of bio.grown) {
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
      // never over a tank, a doorway or a pillar: the whole column must be open wall
      if (!airAt(west ? r.x : r.x + r.w - 1, 1, Math.floor(wz)) || airAt(west ? r.x - 1 : r.x + r.w, 1, Math.floor(wz))) continue;
      growthColumn(wx, wz, west ? 1 : -1, 0, Math.min(r.h - 0.2, 3.2 + rng.next() * 3));
    }
  }
  // incubator heart: a mass of growth clinging to an arena end wall, widest
  // at the floor and thinning toward the ceiling
  if (bio.heart) {
    const { x: hx, z: hz, dir } = bio.heart;
    for (let i = 0; i < 70; i++) {
      const y = 1.2 + rng.next() * rng.next() * 4.6;
      const spread = 6 - (y - 1) * 0.8;
      const x = hx + (rng.next() - 0.5) * spread;
      const s = 0.45 + rng.next() * 0.55;
      cube(pick(GROWTH), x, y, hz + dir * (-0.05 + rng.next() * 0.35), s, s * 1.1, s, { ry: rng.next() });
      if (i % 7 === 0) cube(NODE, x, y + 0.2, hz + dir * (0.35 + rng.next() * 0.2), 0.26, 0.26, 0.26, { flat: true });
    }
  }

  // ---- the authored lab's north doorway: a sealed-door frame -------------
  if (bio.labDoor) {
    const { x: lx, z } = bio.labDoor;
    const y0 = 1, y1 = 4;
    for (const px of [lx - 1.2, lx + 1.2]) cube(FRAME, px, (y0 + y1) / 2, z + 0.1, 0.35, y1 - y0, 0.2);
    cube(FRAME, lx, y1 + 0.12, z + 0.1, 2.9, 0.3, 0.2);
    cube(FRAME_LIGHT, lx, y1 + 0.3, z + 0.1, 2.9, 0.06, 0.22);
  }

  // ---- build the instanced meshes ----------------------------------------
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3();
  for (const b of batches.values()) {
    const material = new THREE.MeshBasicMaterial({
      color: raw(b.color), vertexColors: !b.flat, fog: true,
      transparent: b.alpha < 1, opacity: b.alpha, depthWrite: b.alpha >= 1,
    });
    materials.push(material);
    const inst = new THREE.InstancedMesh(b.flat ? flat : shaded, material, b.items.length);
    // glass after liquid, liquid after everything opaque
    if (b.alpha < 1) inst.renderOrder = b.color === GLASS ? 2 : 1;
    b.items.forEach((it, i) => {
      e.set(0, it.ry, it.rz);
      q.setFromEuler(e);
      p.set(it.x, it.y, it.z);
      s.set(it.w, it.h, it.d);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    });
    group.add(inst);
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
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, w * canvas.height / canvas.width), material);
    plane.position.set(x, y, z);
    group.add(plane);
  };
  for (const sg of bio.signs) sign(sg.text, sg.x, sg.y, sg.z, sg.w, sg.big);

  // ---- the breach sequence ------------------------------------------------
  const breachingCount = (): number => tanks.filter((t) => t.phase === 'agitated' || t.phase === 'breaching').length;
  const trigger = (tank: OccupiedTank, game: Game): void => {
    if (tank.phase !== 'dormant' || breachingCount() >= MAX_BREACHING) return;
    tank.phase = 'agitated';
    tank.t = 0;
    tank.knocks = 0;
    game.audio.play('clank', { x: tank.exitX, y: 3, z: tank.exitZ });
  };
  /** put a real, dormant Vatborn in every occupied tank (first sim frame) */
  let occupantsSpawned = false;
  const spawnOccupants = (game: Game): void => {
    occupantsSpawned = true;
    for (const tank of tanks) {
      const cx = tank.x + TANK_W / 2, cz = tank.z + TANK_D / 2;
      game.enemies.spawnFromSpecs([{ kind: 'vatborn', x: cx, z: cz, roomId: tank.roomId }], level.rooms, game);
      const v = game.enemies.list[game.enemies.list.length - 1];
      v.dormant = true;
      v.awake = false;
      v.state = 'idle';
      v.vel.set(0, 0, 0);
      // floating off the tank floor (y=2), clear of the glass above
      v.pos.set(cx, 2 + v.half.y + 0.3, cz);
      v.mesh.position.copy(v.pos);
      v.mesh.rotation.y = tank.facing;
      tank.vat = v;
    }
  };
  /** the standing spot (or one tile either side) is air and nobody is on it */
  const clearSpot = (tank: OccupiedTank, game: Game): [number, number] | null => {
    for (const dz of [0, 1, -1]) {
      const ex = tank.exitX, ez = tank.exitZ + dz;
      const bx = Math.floor(ex), bz = Math.floor(ez);
      if (!airAt(bx, 1, bz) || !airAt(bx, 2, bz)) continue;
      const near = (px: number, pz: number, r: number): boolean => (px - ex) ** 2 + (pz - ez) ** 2 < r * r;
      if (game.playerTargets().some((t) => !t.dead && near(t.pos.x, t.pos.z, 1.3))) continue;
      if (game.enemies.list.some((en) => en !== tank.vat && en.alive && near(en.pos.x, en.pos.z, 1.1))) continue;
      return [ex, ez];
    }
    return null;
  };
  const breach = (tank: OccupiedTank, game: Game): void => {
    tank.phase = 'breaching';
    tank.t = 0;
    tank.gushAcc = 0;
    // a real collision gap: the front column of glass voxels becomes air
    const fx = tank.side === -1 ? tank.x : tank.x + TANK_W - 1;
    for (let zz = tank.z; zz < tank.z + TANK_D; zz++) for (let y = 2; y <= 4; y++) world.setAndDirty(fx, y, zz, Block.Air);
    tank.front.visible = false;
    tank.light.visible = false;
    const px = tank.side === -1 ? tank.x - 0.1 : tank.x + TANK_W + 0.1;
    game.audio.play('wallBreak', { x: px, y: 3, z: tank.exitZ });
    game.audio.play('gush', { x: px, y: 2, z: tank.exitZ });
    game.particles.debris(px, 3.2, tank.exitZ, 0.6, 0.95, 0.55, 22);
    game.dynLights.flash(px, 3, tank.exitZ, 0.45, 1, 0.5, 1.6, 7, 0.4);
    game.player.shake = Math.min(0.5, game.player.shake + 0.15);
    // the puddle: pieces that start tiny at the pane and spread outward
    for (let i = 0; i < 9; i++) {
      const sm = mesh(i % 3 ? SLIME : SLIME_LIGHT, 0.7 + rng.next() * 1.0, 0.02, 0.5 + rng.next() * 0.8, { flat: true });
      const reach = 0.3 + rng.next() * 2.6;
      sm.position.set(px + tank.side * reach, 1.012 + (i % 3 ? 0 : 0.004), tank.exitZ + (rng.next() - 0.5) * (1.2 + reach * 0.6));
      sm.rotation.y = rng.next() * Math.PI;
      sm.userData.full = sm.scale.clone();
      sm.userData.delay = reach / 3.2; // farther pieces arrive later
      sm.scale.set(0.001, 0.02, 0.001);
      tank.spill.push(sm);
      tank.group.add(sm);
    }
  };
  /** liquid pours out of the open front: droplets with gravity that splash and skid */
  const gush = (tank: OccupiedTank, game: Game, dt: number, surfaceY: number): void => {
    const k = Math.min(1, tank.t / DRAIN_S);
    tank.gushAcc += GUSH_RATE * (1 - k) * (1 - k) * dt;
    const fx = tank.side === -1 ? tank.x - 0.05 : tank.x + TANK_W + 0.05;
    while (tank.gushAcc >= 1) {
      tank.gushAcc -= 1;
      const y = 2.05 + Math.random() * Math.max(0.1, surfaceY - 2.05);
      const head = Math.sqrt(Math.max(0, surfaceY - y)); // more pressure lower down
      const light = Math.random() < 0.3;
      game.particles.droplet(
        fx, y, tank.z + 0.1 + Math.random() * (TANK_D - 0.2),
        tank.side * (1.2 + head * 2.2 + Math.random() * 1.2), Math.random() * 1.2, (Math.random() - 0.5) * 1.4,
        light ? 0.66 : 0.5, light ? 0.94 : 0.83, light ? 0.29 : 0.17,
      );
    }
  };
  const update = (dt: number, game: Game): void => {
    if (!occupantsSpawned) spawnOccupants(game);
    for (const tank of tanks) {
      if (tank.phase === 'dormant' || tank.phase === 'empty') continue;
      tank.t += dt;
      if (tank.phase === 'agitated') {
        // it thrashes and pounds the glass, the light blinks, the glass knocks — no damage yet
        if (tank.vat) tank.vat.agitation = Math.min(1, tank.t / 0.25);
        (tank.light.material as THREE.MeshBasicMaterial).color.copy(raw(STATUS)).multiplyScalar(Math.floor(tank.t / 0.15) % 2 ? 1.6 : 0.25);
        const knocksDue = Math.floor(tank.t / 0.3);
        if (knocksDue > tank.knocks) {
          tank.knocks = knocksDue;
          game.audio.play('clank', { x: tank.exitX, y: 3, z: tank.exitZ });
        }
        if (tank.t >= AGITATE_S) breach(tank, game);
        continue;
      }
      // breaching / released: the liquid drains out of the open front
      const k = Math.min(1, tank.t / DRAIN_S);
      const h = (4.72 - 2.05) * (1 - k * 0.92);
      tank.liquid.scale.y = Math.max(0.05, h);
      tank.liquid.position.y = 2.05 + h / 2;
      tank.surface.position.y = 2.05 + h;
      if (k < 1) gush(tank, game, dt, 2.05 + h);
      for (const sm of tank.spill) {
        const full = sm.userData.full as THREE.Vector3;
        const g = Math.min(1, Math.max(0, (tank.t - (sm.userData.delay as number)) / 0.6));
        const e = 1 - (1 - g) * (1 - g);
        sm.scale.set(Math.max(0.001, full.x * e), full.y, Math.max(0.001, full.z * e));
      }
      if (tank.phase === 'breaching' && tank.t >= EMERGE_AT_S) {
        const v = tank.vat;
        if (!v || !v.alive) {
          tank.phase = 'released'; // nothing left to come out: the tank stays empty
        } else {
          // wait for a clear spot rather than walking into someone
          const spot = clearSpot(tank, game);
          if (spot) {
            tank.phase = 'released';
            v.startEmerge(spot[0], spot[1], 1);
          }
        }
      }
      if (tank.phase === 'released' && k >= 1) tank.phase = 'empty';
    }
  };
  const tankHit = (x: number, y: number, z: number, game: Game): void => {
    if (y < 2 || y > 4) return;
    const tank = tanks.find((t) => x >= t.x && x < t.x + TANK_W && z >= t.z && z < t.z + TANK_D);
    if (tank) trigger(tank, game);
  };
  const noise = (x: number, z: number, radius: number, game: Game): void => {
    const r = Math.min(radius, NOISE_RANGE);
    for (const tank of tanks) {
      if (tank.phase !== 'dormant') continue;
      if ((tank.exitX - x) ** 2 + (tank.exitZ - z) ** 2 < r * r) trigger(tank, game);
    }
  };

  return { group, update, tankHit, noise, dispose() {
    shaded.dispose();
    flat.dispose();
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
      else if (o instanceof THREE.Mesh && o.geometry instanceof THREE.PlaneGeometry) o.geometry.dispose();
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

/** `?sector4`: the authored map alone, with its own preview screens */
export const biofoundry: LevelPreview = { generate, decorate, showScreen };
/** campaign sector 4: scenery + tank breaches for a generated Biofoundry level */
export { decorate as decorateBiofoundry };
