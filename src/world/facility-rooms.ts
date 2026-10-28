import { Block } from './blocks';
import type { VoxelWorld } from './world';
import type { RoomDef } from '../types';
import type { LandmarkBox } from './sector-layouts';

/**
 * Build 2 (docs/ROADMAP.md): Facility sectors 1–3 each get their own look and
 * their rooms a purpose, after Codex's reference reference/facility-props-v1
 * (three sheets + PROPS.md: every prop's envelope, box recipe, colours and
 * glow). Sector 1 Facility Entry = offices / stores / server rooms under cool
 * white light; 2 Security Floor = checkpoints (a guard booth), locker rooms,
 * inspection under blue-white light; 3 Reactor Access = generator rooms (a
 * transformer), control bays, service runs under orange light.
 *
 * Props are instanced boxes in `LevelData.architecture` (two draws for the
 * whole sector, sector-landmarks.ts) over invisible `PowerBarrier` collision.
 * Choices use the position hash (`dhash`), never the layout RNG, and run after
 * every pickup, enemy, the Power Link and the starter crate: a seed keeps its
 * rooms, encounters and supplies. Placement follows PROPS.md: everything
 * against solid wall, ≤ 1 cell deep (the booth and the transformer 2), two
 * cells clear of every doorway, pickup, enemy, the spawn and the cracked
 * secret wall, the cell in front of every prop left walkable; the Power
 * Link's room is left alone (its cage is the room's feature).
 */
export type FacilityLook = 'entry' | 'security' | 'reactor';
export type RoomPurpose = 'office' | 'storage' | 'server' | 'checkpoint' | 'lockers' | 'inspection' | 'generator' | 'control' | 'service';

type Hash = (x: number, y: number, z: number) => number;
/** a run of floor cells along one wall: first cell, direction along it, normal into the room */
interface WallRun { x: number; z: number; ux: number; uz: number; nx: number; nz: number; len: number }

// PROPS.md palette
const STEEL = 0x566076;
const DARK = 0x262c38;
const VOID = 0x05060a;
const MUTED = 0x8a94a8;
const PALE = 0xcfd6e4;
const WHITE = 0xf0f2f6;
const CYAN = 0x34d0ff;
const ICE = 0xb8dcea;
const CORK = 0x9c7646;
const CARTON_A = 0xa47c4a;
const CARTON_B = 0x8a6a3e;
const TAPE = 0xe6dfcc;
const ORANGE = 0xff6a24;

/**
 * One box of a prop, in prop space: `x` along the wall from the prop's centre,
 * `y` its bottom above the floor, `z` its back face's distance from the wall;
 * w (along) × h × d (depth).
 */
type Part = [x: number, y: number, z: number, w: number, h: number, d: number, color: number, glow?: boolean];

interface PropDef {
  /** floor cells along the wall, and into the room (2 = a centrepiece) */
  cells: number;
  depth: 1 | 2;
  /** collision: none (high / thin wall fixtures), 1 or 2 cells tall */
  block: 0 | 1 | 2;
  /** wall-mounted: its lowest point above the floor (needs no floor, only wall) */
  mount?: number;
  /** its highest point above the floor (what a wall fixture above must clear) */
  top: number;
  parts: (h: (salt: number) => number) => Part[];
}

const light = (face: number, tall: number): PropDef => ({
  cells: 2, depth: 1, block: 0, mount: 2.45, top: 2.45 + tall,
  parts: () => [
    [0, 2.45, 0, 1.4, tall, 0.13, STEEL], [-0.64, 2.45, 0, 0.12, tall, 0.2, DARK], [0.64, 2.45, 0, 0.12, tall, 0.2, DARK],
    [0, 2.5, 0.13, 1.12, tall - 0.12, 0.03, face, true], [0, 2.45 + tall - 0.05, 0, 1.16, 0.05, 0.22, DARK],
  ],
});

/** the 24 props of PROPS.md (E = Entry, S = Security, R = Reactor) */
const PROPS = {
  // E1 work desk: steel desk, pedestals, monitor (screen glows), keyboard
  desk: {
    cells: 2, depth: 1, block: 1, top: 1.55, parts: (h) => {
      const m = h(1) < 0.5 ? -0.32 : 0.32, k = -m * 1.2;
      return [
        [0, 0.78, 0, 1.8, 0.12, 0.9, STEEL], [-0.66, 0, 0.08, 0.38, 0.78, 0.75, STEEL], [0.66, 0, 0.08, 0.38, 0.78, 0.75, STEEL],
        [0, 0.36, 0.02, 0.95, 0.42, 0.08, DARK], [0.66, 0.42, 0.83, 0.32, 0.28, 0.04, MUTED], [0.66, 0.52, 0.87, 0.15, 0.07, 0.05, DARK],
        [m, 0.9, 0.1, 0.38, 0.06, 0.22, DARK], [m, 0.96, 0.15, 0.12, 0.14, 0.1, STEEL], [m, 1.06, 0.1, 0.7, 0.46, 0.13, DARK],
        [m, 1.115, 0.23, 0.59, 0.35, 0.02, CYAN, true], [k, 0.9, 0.5, 0.48, 0.05, 0.22, DARK], [k, 0.95, 0.52, 0.38, 0.02, 0.17, STEEL],
      ];
    },
  },
  // E2 notice board (above a desk): cork, steel frame, three papers
  board: {
    cells: 2, depth: 1, block: 0, mount: 1.85, top: 2.6, parts: (h) => [
      [0, 1.89, 0.02, 1.32, 0.67, 0.05, CORK], [0, 1.85, 0, 1.4, 0.06, 0.1, STEEL], [0, 2.54, 0, 1.4, 0.06, 0.1, STEEL],
      [-0.67, 1.91, 0, 0.06, 0.63, 0.1, STEEL], [0.67, 1.91, 0, 0.06, 0.63, 0.1, STEEL],
      [-0.38, 2.0 + h(2) * 0.1, 0.07, 0.25, 0.33, 0.02, TAPE], [0.03, 2.08, 0.07, 0.28, 0.3, 0.02, PALE], [0.4, 1.98 + h(3) * 0.12, 0.07, 0.22, 0.36, 0.02, TAPE],
    ],
  },
  // E3 file cabinet: three broad drawers
  cabinet: {
    cells: 1, depth: 1, block: 2, top: 1.8, parts: () => [
      [0, 0, 0, 0.8, 0.1, 0.76, DARK], [0, 0.1, 0, 0.8, 1.7, 0.7, STEEL],
      ...[0, 1, 2].flatMap((i): Part[] => [[0, 0.18 + i * 0.55, 0.7, 0.69, 0.51, 0.04, MUTED], [0, 0.55 + i * 0.55, 0.74, 0.19, 0.09, 0.04, DARK]]),
    ],
  },
  // E4 stores shelf: four uprights, three shelves, five taped cartons
  shelf: {
    cells: 2, depth: 1, block: 2, top: 2.4, parts: (h) => {
      const out: Part[] = [];
      for (const x of [-0.86, 0.86]) for (const z of [0, 0.82]) out.push([x, 0, z, 0.08, 2.4, 0.08, STEEL]);
      const shelves = [0.15, 0.95, 1.75];
      for (const y of shelves) out.push([0, y, 0.04, 1.72, 0.09, 0.82, MUTED]);
      // two cartons on each of the lower shelves, one on the top
      [[0, -0.42], [0, 0.4], [1, -0.38], [1, 0.42], [2, -0.3]].forEach(([s, x], i) => {
        const k = h(10 + i), w = 0.35 + k * 0.2, ht = 0.3 + h(20 + i) * 0.2, d = 0.45 + k * 0.15, y = shelves[s] + 0.09;
        out.push([x, y, 0.12, w, ht, d, k < 0.5 ? CARTON_A : CARTON_B]);
        out.push([x, y + (ht - Math.min(0.28, ht - 0.04)) / 2, 0.12 + d, 0.08, Math.min(0.28, ht - 0.04), 0.02, TAPE]);
      });
      return out;
    },
  },
  // E5 server rack: tall dark case, four trays with cyan LED bars, top vent
  rack: {
    cells: 1, depth: 1, block: 2, top: 2.6, parts: () => [
      [0, 0, 0, 0.8, 0.12, 0.93, STEEL], [0, 0.12, 0, 0.8, 2.48, 0.88, DARK],
      ...[0, 1, 2, 3].flatMap((i): Part[] => [[0, 0.32 + i * 0.47, 0.88, 0.66, 0.4, 0.04, STEEL], [-0.1, 0.48 + i * 0.47, 0.92, 0.35, 0.08, 0.02, CYAN, true]]),
      [0, 2.24, 0.88, 0.64, 0.22, 0.02, VOID], [0, 2.32, 0.89, 0.64, 0.05, 0.02, DARK],
    ],
  },
  // E6 intercom (wall)
  intercom: {
    cells: 1, depth: 1, block: 0, mount: 1.2, top: 1.85, parts: () => [
      [0, 1.2, 0, 0.35, 0.65, 0.12, STEEL], ...[0, 1, 2].map((i): Part => [0, 1.62 + i * 0.08, 0.12, 0.23, 0.05, 0.02, VOID]),
      [0, 1.28, 0.12, 0.22, 0.24, 0.02, DARK], [0, 1.3, 0.13, 0.18, 0.2, 0.04, MUTED],
    ],
  },
  // E7 cooling grille (wall)
  grille: {
    cells: 2, depth: 1, block: 0, mount: 1.85, top: 2.5, parts: () => [
      [0, 1.91, 0, 1.08, 0.53, 0.04, VOID], [0, 1.85, 0, 1.2, 0.07, 0.12, STEEL], [0, 2.43, 0, 1.2, 0.07, 0.12, STEEL],
      [-0.565, 1.92, 0, 0.07, 0.51, 0.12, MUTED], [0.565, 1.92, 0, 0.07, 0.51, 0.12, MUTED],
      ...[0, 1, 2, 3].map((i): Part => [0, 1.96 + i * 0.12, 0.04, 1.04, 0.07, 0.1, DARK]),
    ],
  },
  // E8 white task light (wall)
  taskLight: light(WHITE, 0.28),

  // S1 guard booth (centrepiece): dark lower block, steel frame, opaque ice windows
  booth: {
    cells: 3, depth: 2, block: 2, top: 2.7, parts: () => [
      [0, 0, 0, 2.6, 0.12, 1.8, DARK], [0, 0.12, 0.06, 2.48, 0.95, 1.68, DARK],
      ...[-1.23, 1.23].flatMap((x): Part[] => [[x, 0.12, 0.02, 0.14, 2.4, 0.14, STEEL], [x, 0.12, 1.64, 0.14, 2.4, 0.14, STEEL]]),
      [0, 2.52, 0, 2.6, 0.18, 1.8, STEEL],
      [0, 1.22, 1.7, 2.2, 1.12, 0.08, ICE, true], [-1.25, 1.22, 0.24, 0.08, 1.12, 1.36, ICE, true], [1.25, 1.22, 0.24, 0.08, 1.12, 1.36, ICE, true],
      [0, 1.07, 1.64, 2.46, 0.12, 0.16, MUTED], [-1.22, 1.07, 0.12, 0.16, 0.12, 1.54, MUTED], [1.22, 1.07, 0.12, 0.16, 0.12, 1.54, MUTED],
    ],
  },
  // S2 stowed barrier: arm parked parallel to the wall
  barrier: {
    cells: 2, depth: 1, block: 2, top: 1.35, parts: () => [
      [-0.64, 0, 0.02, 0.32, 0.12, 0.5, DARK], [-0.64, 0.12, 0.1, 0.24, 1.23, 0.34, STEEL], [-0.64, 0.88, 0.06, 0.32, 0.36, 0.42, MUTED],
      [0.16, 0.92, 0.18, 1.28, 0.28, 0.18, DARK], [0.76, 0.9, 0.16, 0.09, 0.32, 0.22, STEEL],
      [0.62, 0.08, 0.16, 0.12, 0.72, 0.22, STEEL], [0.62, 0, 0.11, 0.24, 0.08, 0.32, DARK],
    ],
  },
  // S3 locker bank: three doors, handles, vent marks
  lockers: {
    cells: 2, depth: 1, block: 2, top: 2.35, parts: () => [
      [0, 0, 0, 1.8, 0.12, 0.63, DARK], [0, 0.12, 0, 1.8, 2.23, 0.58, DARK],
      ...[-0.58, 0, 0.58].flatMap((x): Part[] => [
        [x, 0.17, 0.58, 0.55, 2.13, 0.04, STEEL], [x + 0.17, 1.0, 0.62, 0.09, 0.3, 0.03, DARK],
        [x, 1.95, 0.62, 0.34, 0.07, 0.02, VOID], [x, 2.07, 0.62, 0.34, 0.07, 0.02, VOID],
      ]),
    ],
  },
  // S4 camera console: two cyan screens, inputs, an ice status strip
  console: {
    cells: 2, depth: 1, block: 1, top: 1.85, parts: () => [
      [0, 0.83, 0, 2.0, 0.12, 0.9, STEEL], [-0.72, 0, 0.08, 0.38, 0.83, 0.76, STEEL], [0.72, 0, 0.08, 0.38, 0.83, 0.76, STEEL],
      [0, 0.95, 0.02, 1.5, 0.4, 0.08, DARK],
      ...[-0.45, 0.45].flatMap((x): Part[] => [
        [x, 1.05, 0.1, 0.82, 0.78, 0.16, DARK], [x, 1.13, 0.26, 0.68, 0.62, 0.02, CYAN, true],
        [x - 0.14, 1.45, 0.28, 0.2, 0.18, 0.01, STEEL], [x + 0.12, 1.22, 0.28, 0.2, 0.18, 0.01, STEEL],
        [x, 0.95, 0.5, 0.48, 0.07, 0.25, MUTED],
      ]),
      [0, 0.84, 0.9, 0.7, 0.06, 0.02, ICE, true],
    ],
  },
  // S5 wall camera: square dark lens, no recording light
  camera: {
    cells: 1, depth: 1, block: 0, mount: 2.3, top: 2.7, parts: () => [
      [0, 2.32, 0, 0.22, 0.36, 0.06, DARK], [0, 2.44, 0.06, 0.16, 0.08, 0.25, STEEL], [0, 2.38, 0.24, 0.12, 0.18, 0.12, STEEL],
      [0, 2.4, 0.22, 0.42, 0.24, 0.38, MUTED], [0, 2.43, 0.6, 0.26, 0.17, 0.02, VOID], [0, 2.64, 0.2, 0.5, 0.05, 0.43, DARK],
    ],
  },
  // S6 inspection counter
  counter: {
    cells: 2, depth: 1, block: 1, top: 1.05, parts: () => [
      [-0.66, 0, 0.07, 0.4, 0.78, 0.66, STEEL], [0.66, 0, 0.07, 0.4, 0.78, 0.66, STEEL], [0, 0.78, 0, 1.8, 0.12, 0.8, MUTED],
      [0, 0.9, 0.02, 1.7, 0.15, 0.08, STEEL], [-0.3, 0.9, 0.3, 0.55, 0.03, 0.35, DARK], [0.4, 0.9, 0.35, 0.32, 0.05, 0.26, TAPE],
      [0, 0.3, 0.02, 0.9, 0.4, 0.06, DARK],
    ],
  },
  // S7 equipment cabinet: painted (unlit) ice ID plates
  equipment: {
    cells: 2, depth: 1, block: 2, top: 1.75, parts: () => [
      [0, 0, 0, 1.2, 0.1, 0.68, DARK], [0, 0.1, 0, 1.2, 1.65, 0.62, STEEL],
      ...[-0.29, 0.29].flatMap((x): Part[] => [
        [x, 0.15, 0.62, 0.52, 1.52, 0.04, MUTED], [x * 0.28, 0.85, 0.66, 0.08, 0.28, 0.04, DARK], [x, 1.42, 0.66, 0.3, 0.13, 0.02, ICE],
      ]),
    ],
  },
  // S8 blue-white light (wall)
  iceLight: light(ICE, 0.3),

  // R1 pipe run: square risers, runs, elbow blocks, clamps
  pipes: {
    cells: 3, depth: 1, block: 2, top: 2.6, parts: () => [
      [-1.07, 0, 0.12, 0.26, 2.6, 0.3, MUTED], [1.07, 0, 0.12, 0.26, 2.6, 0.3, MUTED],
      [0, 0.55, 0.12, 1.9, 0.24, 0.3, STEEL], [0, 2.0, 0.12, 1.9, 0.24, 0.3, STEEL],
      [-1.07, 1.94, 0.07, 0.36, 0.36, 0.4, STEEL], [1.07, 0.49, 0.07, 0.36, 0.36, 0.4, STEEL],
      ...[-1.07, 1.07].flatMap((x): Part[] => [[x, 0.25, 0, 0.42, 0.14, 0.55, DARK], [x, 1.4, 0, 0.42, 0.14, 0.55, DARK]]),
    ],
  },
  // R2 valve module: square cross-handle, nothing lit
  valve: {
    cells: 1, depth: 1, block: 2, top: 1.95, parts: () => [
      [0, 0.55, 0.05, 0.2, 1.4, 0.24, STEEL], [0, 0.72, 0, 0.42, 0.12, 0.32, DARK], [0, 1.7, 0, 0.42, 0.12, 0.32, DARK],
      [0, 1.0, 0.1, 0.42, 0.4, 0.38, DARK], [0, 1.1, 0.48, 0.2, 0.2, 0.18, STEEL],
      [-0.27, 1.14, 0.52, 0.34, 0.12, 0.1, MUTED], [0.27, 1.14, 0.52, 0.34, 0.12, 0.1, MUTED],
      [0, 1.3, 0.52, 0.12, 0.28, 0.1, MUTED], [0, 0.82, 0.52, 0.12, 0.28, 0.1, MUTED],
    ],
  },
  // R3 transformer (centrepiece): five fins, terminals, broad orange heat slots
  transformer: {
    cells: 3, depth: 2, block: 2, top: 2.45, parts: () => [
      [0, 0, 0, 2.6, 0.18, 1.6, DARK], [0, 0.18, 0.05, 2.24, 1.75, 1.3, STEEL],
      ...[-0.9, -0.45, 0, 0.45, 0.9].map((x): Part => [x, 0.78, 0.04, 0.24, 1.45, 1.42, MUTED]),
      ...[-0.6, 0, 0.6].map((x): Part => [x, 1.93, 0.35, 0.3, 0.38, 0.42, STEEL]),
      [0, 0.2, 1.35, 2.1, 0.55, 0.04, VOID],
      ...[-0.5, 0.5].flatMap((x): Part[] => [[x, 0.28, 1.39, 0.78, 0.12, 0.03, ORANGE, true], [x, 0.53, 1.39, 0.78, 0.12, 0.03, ORANGE, true]]),
    ],
  },
  // R4 control panel: cyan display, pale paddles, cooling slots
  panel: {
    cells: 2, depth: 1, block: 2, top: 1.9, parts: () => [
      [0, 0, 0, 1.4, 1.9, 0.55, STEEL], [0, 0.07, 0.55, 1.28, 1.76, 0.04, MUTED], [0, 1.12, 0.59, 0.98, 0.64, 0.04, DARK],
      [0, 1.21, 0.63, 0.8, 0.46, 0.02, CYAN, true],
      ...[0, 1, 2, 3].map((i): Part => [-0.33 + i * 0.22, 0.62, 0.59, 0.18, 0.36, 0.04, PALE]),
      ...[0, 1, 2].map((i): Part => [0, 0.2 + i * 0.12, 0.59, 0.92, 0.08, 0.02, VOID]),
    ],
  },
  // R5 steam vent: housing, grille, outlet, three opaque stepped puffs
  vent: {
    cells: 2, depth: 1, block: 2, top: 2.7, parts: (h) => [
      [0, 0, 0, 1.2, 1.2, 0.55, STEEL], [0, 0.2, 0.55, 0.86, 0.8, 0.02, VOID],
      [0, 0.45, 0.55, 0.86, 0.12, 0.08, DARK], [0, 0.75, 0.55, 0.86, 0.12, 0.08, DARK], [0, 1.2, 0.07, 0.42, 0.42, 0.4, MUTED],
      [0.05, 1.66, 0.06, 0.48, 0.4, 0.44, PALE], [-0.08 + h(5) * 0.06, 2.0, 0.08, 0.4, 0.36, 0.38, PALE], [0.1, 2.32, 0.12, 0.32, 0.38, 0.32, MUTED],
    ],
  },
  // R6 cable trunk (wall): fully covered conduit
  trunk: {
    cells: 3, depth: 1, block: 0, mount: 1.05, top: 1.6, parts: () => [
      [0, 1.15, 0, 2.32, 0.34, 0.2, STEEL], [1.08, 1.11, 0, 0.24, 0.42, 0.25, STEEL],
      ...[-0.95, -0.4, 0.3, 0.8].map((x): Part => [x, 1.09, 0, 0.1, 0.46, 0.3, DARK]),
      [-0.05, 1.05, 0, 0.44, 0.55, 0.28, MUTED],
    ],
  },
  // R7 heat exchanger: side headers, dark slats, two orange heat bars
  exchanger: {
    cells: 2, depth: 1, block: 2, top: 2.2, parts: () => [
      [0, 0, 0, 1.6, 0.12, 0.9, DARK], [0, 0.12, 0.02, 1.4, 2.08, 0.66, STEEL],
      [-0.7, 0.12, 0.04, 0.2, 2.0, 0.82, MUTED], [0.7, 0.12, 0.04, 0.2, 2.0, 0.82, MUTED],
      ...[0.98, 1.28, 1.58, 1.88].map((y): Part => [0, y, 0.68, 1.12, 0.14, 0.12, DARK]),
      [0, 0.42, 0.68, 0.9, 0.14, 0.03, ORANGE, true], [0, 0.68, 0.68, 0.9, 0.14, 0.03, ORANGE, true],
      [-0.55, 0, 0, 0.3, 0.2, 0.9, STEEL], [0.55, 0, 0, 0.3, 0.2, 0.9, STEEL],
    ],
  },
  // R8 orange worklight (wall)
  workLight: light(ORANGE, 0.32),
} satisfies Record<string, PropDef>;
type PropId = keyof typeof PROPS;

/** each purpose: an optional centrepiece, the floor props it repeats, its wall fixtures, its light */
// (each room's dominant furniture, with one or two of a neighbour's mixed in as
// in the sheets' hero rooms; wall fixtures are tried in order, one per wall)
const ROOMS: Record<RoomPurpose, { centre?: PropId; floor: PropId[]; wall: PropId[]; light: PropId }> = {
  office: { floor: ['desk', 'desk', 'cabinet', 'desk', 'shelf'], wall: ['intercom', 'grille'], light: 'taskLight' },
  storage: { floor: ['shelf', 'shelf', 'cabinet', 'shelf'], wall: ['intercom', 'grille'], light: 'taskLight' },
  server: { floor: ['rack', 'rack', 'rack', 'cabinet', 'rack'], wall: ['grille', 'grille', 'intercom'], light: 'taskLight' },
  checkpoint: { centre: 'booth', floor: ['console', 'barrier', 'counter', 'equipment', 'lockers'], wall: ['camera', 'camera'], light: 'iceLight' },
  lockers: { floor: ['lockers', 'lockers', 'equipment', 'counter'], wall: ['camera', 'camera'], light: 'iceLight' },
  inspection: { floor: ['counter', 'equipment', 'console', 'lockers'], wall: ['camera', 'camera'], light: 'iceLight' },
  generator: { centre: 'transformer', floor: ['pipes', 'vent', 'panel', 'exchanger'], wall: ['trunk', 'trunk'], light: 'workLight' },
  control: { floor: ['panel', 'exchanger', 'valve', 'pipes', 'panel'], wall: ['trunk', 'trunk'], light: 'workLight' },
  service: { floor: ['pipes', 'vent', 'valve', 'exchanger'], wall: ['trunk', 'trunk'], light: 'workLight' },
};

/** each look's rooms, as cumulative weights; the spawn room takes the first */
const MIX: Record<FacilityLook, Array<[RoomPurpose, number]>> = {
  entry: [['office', 0.5], ['storage', 0.75], ['server', 1]],
  security: [['checkpoint', 0.45], ['lockers', 0.8], ['inspection', 1]],
  reactor: [['control', 0.4], ['generator', 0.75], ['service', 1]],
};

export interface FacilityDressing {
  boxes: LandmarkBox[];
  /** each dressed room's purpose (tests, the automap later) */
  purposes: Array<{ roomId: number; purpose: RoomPurpose }>;
}

export function dressFacilityRooms(
  world: VoxelWorld, rooms: RoomDef[], look: FacilityLook, hash: Hash,
  avoid: Array<{ x: number; z: number }>, skipRoom: (r: RoomDef) => boolean = () => false,
): FacilityDressing {
  const boxes: LandmarkBox[] = [];
  const purposes: FacilityDressing['purposes'] = [];
  const key = (x: number, z: number): number => x + z * world.sx;
  /** cells nothing may stand on (doorways, pickups, enemies, the spawn, the secret wall) */
  const blocked = new Set<number>();
  /** floor props' height per cell: wall fixtures must clear it */
  const heightAt = new Map<number, number>();
  /** wall fixtures per cell: their [bottom, top] spans */
  const fixtures = new Map<number, Array<[number, number]>>();
  const block = (x: number, z: number, r: number): void => {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) blocked.add(key(x + dx, z + dz));
  };
  for (const a of avoid) block(Math.floor(a.x), Math.floor(a.z), 2);

  for (const room of rooms) {
    if ((room.kind !== 'normal' && room.kind !== 'spawn') || skipRoom(room)) continue;
    const mix = MIX[look];
    const purpose = room.kind === 'spawn' ? mix[0][0] : mix.find(([, w]) => hash(room.cx, 401, room.cz) < w)![0];
    const spec = ROOMS[purpose];
    // keep clear of every opening in the room's wall ring (doorways, corridors)
    for (let x = room.x - 1; x <= room.x + room.w; x++) for (let z = room.z - 1; z <= room.z + room.d; z++) {
      const ring = x === room.x - 1 || x === room.x + room.w || z === room.z - 1 || z === room.z + room.d;
      if (ring && !world.isSolid(x, 1, z)) block(x, z, 2);
    }
    const walls: WallRun[] = [
      { x: room.x, z: room.z, ux: 1, uz: 0, nx: 0, nz: 1, len: room.w }, // north wall (z = room.z - 1)
      { x: room.x + room.w - 1, z: room.z + room.d - 1, ux: -1, uz: 0, nx: 0, nz: -1, len: room.w }, // south
      { x: room.x, z: room.z + room.d - 1, ux: 0, uz: -1, nx: 1, nz: 0, len: room.d }, // west
      { x: room.x + room.w - 1, z: room.z, ux: 0, uz: 1, nx: -1, nz: 0, len: room.d }, // east
    ].sort((a, b) => b.len - a.len);
    let placed = 0;
    // 1. the centrepiece (booth / transformer): one, on the longest wall it fits, near the middle
    if (spec.centre && Math.min(room.w, room.d) >= 8) {
      const def = PROPS[spec.centre];
      outer: for (const wall of walls) {
        const mid = Math.floor((wall.len - def.cells) / 2);
        for (let off = 0; off <= mid; off++) for (const u of off ? [mid - off, mid + off] : [mid]) {
          if (fitsFloor(wall, u, def)) { place(spec.centre, wall, u); placed++; break outer; }
        }
      }
    }
    // 2. floor props along every wall, a gap between them
    for (const wall of walls) {
      for (let u = 0; u < wall.len;) {
        const id = spec.floor[Math.floor(hash(wall.x + u * wall.ux, 403, wall.z + u * wall.uz) * spec.floor.length)];
        const def = PROPS[id];
        if (hash(wall.x + u * wall.ux, 402, wall.z + u * wall.uz) < 0.9 && fitsFloor(wall, u, def)) {
          place(id, wall, u);
          placed++;
          // a desk gets its notice board above it
          if (id === 'desk' && fitsWall(wall, u, PROPS.board)) place('board', wall, u);
          // mostly side by side, sometimes a one-cell gap (the sheets' rooms are full)
          u += def.cells + (hash(wall.x + u * wall.ux, 405, wall.z + u * wall.uz) < 0.3 ? 1 : 0);
        } else u += 1;
      }
    }
    // 3. wall fixtures: the room's light on each long wall, then its own fittings
    for (const wall of walls) {
      if (wall.len < 5) continue;
      const def = PROPS[spec.light];
      const spots = wall.len >= 11 ? [Math.floor(wall.len / 4) - 1, Math.floor(wall.len * 3 / 4) - 1] : [Math.floor((wall.len - def.cells) / 2)];
      for (const at of spots) for (const u of [at, at - 1, at + 1, at - 2, at + 2]) if (fitsWall(wall, u, def)) { place(spec.light, wall, u); break; }
    }
    spec.wall.forEach((id, i) => {
      const def = PROPS[id];
      for (const wall of [...walls.slice(i % walls.length), ...walls.slice(0, i % walls.length)]) {
        const start = 1 + Math.floor(hash(wall.x, 404 + i, wall.z) * Math.max(1, wall.len - def.cells - 2));
        for (let k = 0; k < wall.len; k++) {
          const u = 1 + (start - 1 + k) % Math.max(1, wall.len - 2);
          if (fitsWall(wall, u, def)) { place(id, wall, u); return; }
        }
      }
    });
    if (placed) purposes.push({ roomId: room.id, purpose });
  }
  return { boxes, purposes };

  /** the floor cells a prop would stand on (u .. u+cells-1 along the wall, `depth` deep) */
  function cellsOf(w: WallRun, u: number, cells: number, depth: number): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (let i = 0; i < cells; i++) for (let t = 0; t < depth; t++) {
      out.push([w.x + w.ux * (u + i) + w.nx * t, w.z + w.uz * (u + i) + w.nz * t]);
    }
    return out;
  }

  /** open floor, solid wall behind, nothing to block, the row in front still walkable */
  function fitsFloor(w: WallRun, u: number, def: PropDef): boolean {
    if (u < 0 || u + def.cells > w.len) return false;
    const tall = def.top > 2 ? 3 : 2;
    for (const [x, z] of cellsOf(w, u, def.cells, def.depth)) {
      if (blocked.has(key(x, z)) || heightAt.has(key(x, z))) return false;
      if (!world.isSolid(x, 0, z)) return false;
      for (let y = 1; y <= tall; y++) if (world.get(x, y, z) !== Block.Air) return false;
    }
    for (let i = 0; i < def.cells; i++) {
      const x = w.x + w.ux * (u + i), z = w.z + w.uz * (u + i);
      for (let y = 1; y <= tall; y++) if (!world.isSolid(x - w.nx, y, z - w.nz)) return false;
      // the cells in front stay walkable floor (a two-wide lane past it)
      for (const t of [def.depth, def.depth + 1]) {
        const fx = x + w.nx * t, fz = z + w.nz * t;
        if (world.get(fx, 1, fz) !== Block.Air || world.get(fx, 2, fz) !== Block.Air || heightAt.has(key(fx, fz))) return false;
      }
    }
    return true;
  }

  /** wall fixture: solid wall behind its span, clear of doorways, above what stands below, not over another fixture */
  function fitsWall(w: WallRun, u: number, def: PropDef): boolean {
    if (u < 1 || u + def.cells > w.len - 1) return false;
    const lo = def.mount ?? 0, hi = def.top;
    for (let i = 0; i < def.cells; i++) {
      const x = w.x + w.ux * (u + i), z = w.z + w.uz * (u + i);
      if (blocked.has(key(x, z))) return false;
      for (let y = 1 + Math.floor(lo); y <= 1 + Math.floor(hi); y++) if (!world.isSolid(x - w.nx, y, z - w.nz)) return false;
      if (world.get(x, 1 + Math.floor(hi), z) !== Block.Air) return false;
      if ((heightAt.get(key(x, z)) ?? 0) > lo - 0.05 && !(def === PROPS.board && heightAt.get(key(x, z)) === PROPS.desk.top)) return false;
      if ((fixtures.get(key(x, z)) ?? []).some(([a, b]) => a < hi && lo < b)) return false;
    }
    return true;
  }

  function place(id: PropId, w: WallRun, u: number): void {
    const def: PropDef = PROPS[id];
    const wallMounted = def.mount !== undefined;
    for (const [x, z] of cellsOf(w, u, def.cells, wallMounted ? 1 : def.depth)) {
      if (wallMounted) {
        const list = fixtures.get(key(x, z)) ?? [];
        list.push([def.mount!, def.top]);
        fixtures.set(key(x, z), list);
        continue;
      }
      heightAt.set(key(x, z), def.top);
      for (let y = 1; y <= def.block; y++) world.set(x, y, z, Block.PowerBarrier);
    }
    // the wall face at the run's first cell, then the prop's centre along it
    const ox = w.x + (w.ux < 0 ? 1 : 0) + (w.nx < 0 ? 1 : 0), oz = w.z + (w.uz < 0 ? 1 : 0) + (w.nz < 0 ? 1 : 0);
    const centre = u + def.cells / 2;
    const hx = w.x + w.ux * u, hz = w.z + w.uz * u;
    for (const [px, py, pz, pw, ph, pd, color, glow] of def.parts((salt) => hash(hx, 500 + salt, hz))) {
      const along = centre + px, depth = pz + pd / 2;
      boxes.push({
        x: ox + w.ux * along + w.nx * depth, y: 1 + py + ph / 2, z: oz + w.uz * along + w.nz * depth,
        w: Math.abs(w.ux) * pw + Math.abs(w.nx) * pd, h: ph, d: Math.abs(w.uz) * pw + Math.abs(w.nz) * pd,
        color, glow: !!glow,
      });
    }
  }
}
