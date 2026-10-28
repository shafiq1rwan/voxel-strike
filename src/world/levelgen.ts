import { VoxelWorld } from './world';
import { generateSectorLayout, type SectorArchitecture } from './sector-layouts';
import { dressEnvironment, isNewTheme, ENVIRONMENTS } from './environments';
import { Block } from './blocks';
import { RNG } from '../core/rng';
import { dressFacilityRooms, type FacilityLook, type RoomPurpose } from './facility-rooms';
import { applyFacilityRoster, facilityBand, FACILITY_RESPONSE, FACILITY_ROSTERS, applyBioRoster, bioBand, BIO_RESPONSE, applyGeoRoster, geoBand, GEO_RESPONSE } from './rosters';
import { ExitSignSpec, LedgeRailSpec,
  DoorSpec, ElevatorSpec, EnemySpec, PickupSpec, Rect, RoomDef,
} from '../types';

/** which look a generated sector wears; the layout rules are the same */
export type LevelTheme = 'facility' | 'biofoundry' | 'geothermal' | 'freight' | 'excavation' | 'medical';

/** specimen tank footprint: 3 (x) × 2 (z) on a metal base, glass y = 2..4, cap y = 5 */
export const TANK_W = 3;
export const TANK_D = 2;
/** the Biofoundry's purple emergency-light wash (the facility keeps the default) */
export const BIO_AMBIENT: [number, number, number] = [36, 26, 52];
/** the Geothermal Core (sectors 6–7): a dark, warm basalt ambient under the heat seams */
export const GEO_AMBIENT: [number, number, number] = [34, 24, 20];

/**
 * Biofoundry sectors only: what the scenery pass (`decorate` in
 * src/preview/biofoundry.ts) dresses. Generated levels and the authored
 * `?sector4` map both fill it.
 */
export interface BioLayout {
  /** front faces into the room along x; occupied tanks hold a dormant Vatborn */
  tanks: Array<{ x: number; z: number; broken: boolean; occupied: boolean }>;
  /** 2×2 ribbed pillars (min corner), warm light band at y = 3 */
  pillars: Array<[number, number]>;
  /** pillars the growth has claimed: [pillar x, pillar z, side dx, side dz] */
  grown: Array<[number, number, number, number]>;
  /** slime puddles: [x, z, radius] */
  spills: Array<[number, number, number]>;
  signs: Array<{ text: string; x: number; y: number; z: number; w: number; big: boolean }>;
  /** the incubator mass on an arena wall: centre x, wall plane z, growth direction (+1 = toward +z) */
  heart: { x: number; z: number; dir: number } | null;
  /** authored map only: the sealed-door frame over the lab's north doorway */
  labDoor?: { x: number; z: number };
}

/**
 * The optional POWER LINK (facility sectors from 2, and the Geothermal Core):
 * shoot the node, the supply cage's gate sinks and its sealed pickups unlock.
 * It never gates the route. `decorateGeothermal` (src/preview/geothermal-gen.ts)
 * draws and runs it.
 */
export interface PowerLinkLayout {
    /** the node: a LampWarm voxel in the room's wall at eye height; (nx, nz) faces the room */
    node: { x: number; y: number; z: number; nx: number; nz: number };
    /**
     * the cage against a wall: point(a, t) = (ox + ux·a + nx·t, oz + uz·a + nz·t),
     * a ∈ 0..5 along the wall (sides at a = 0 and 4), t ∈ 0..2 into the room
     * (back row holds the supplies, the front row is the PowerBarrier grille);
     * Metal sides and roof (y = 4), interior y = 1..3
     */
    cage: { ox: number; oz: number; ux: number; uz: number; nx: number; nz: number };
    /** the room's wall faces (interior bounds), for routing the cable around them */
    room: { x0: number; z0: number; x1: number; z1: number };
    /** the cable's height on the wall (clears doorways and the cage roof) */
    cableY: number;
}

/** Geothermal sectors only: the core's scenery (steam, signs) for `decorateGeothermal` */
export interface GeoLayout {
  /** steam outlets over heat seams: [x, z] cell */
  vents: Array<[number, number]>;
  /** wall signs: ry turns the plane to face the room */
  signs: Array<{ text: string; x: number; y: number; z: number; w: number; ry: number }>;
}

export interface LevelData {
  world: VoxelWorld;
  architecture?: SectorArchitecture;
  theme?: LevelTheme;
  bio?: BioLayout;
  geo?: GeoLayout;
  powerLink?: PowerLinkLayout | null;
  /**
   * Boss sectors (5, then every 5th depth): the Broodkeeper's cradle against
   * an arena wall with no doorway behind it. `yaw` faces the room. The red
   * keycard spec sits in front of it (so the walkability check still sees a
   * reachable key); the game hides it until the boss dies and drops it.
   */
  boss?: { x: number; z: number; yaw: number; roomId: number } | null;
  spawn: { x: number; y: number; z: number };
  rooms: RoomDef[];
  doors: DoorSpec[];
  pickups: PickupSpec[];
  enemies: EnemySpec[];
  /** An authored sector can keep the keycard response within its own roster. */
  responseKinds?: EnemySpec['kind'][];
  responseCount?: number;
  /** sector 1: a free-standing crate by the spawn that always holds a supply (teaches "crates break") */
  starterCrate?: { x: number; y: number; z: number } | null;
  /** Build 2: what each dressed Facility room is (office / storage / server) */
  roomPurposes?: Array<{ roomId: number; purpose: RoomPurpose }>;
  elevator: ElevatorSpec | null;
  /** center of the 2×2 exit pad on the ledge (y = its top surface) */
  exitPad: { x: number; y: number; z: number } | null;
  /** the EXIT sign over the pad and the ledge's railing (generated sectors) */
  exitSign?: ExitSignSpec | null;
  ledgeRail?: LedgeRailSpec | null;
  secretRect: Rect | null;
  /** the cracked voxels that seal the secret room (the game glints them when a player is near) */
  secretWall?: Array<[number, number, number]>;
  seed: number;
  totalEnemies: number;
  totalSecrets: number;
}

const WORLD_X = 112;
const WORLD_Y = 14;
const WORLD_Z = 112;
const CORRIDOR_H = 3;

interface Station {
  x: number;
  z: number;
  dir: 'x' | 'z';
}

interface Edge {
  a: number;
  b: number;
  dist: number;
  stations: Station[];
}

/**
 * Generate a level, retrying with nearby seeds until it validates as beatable.
 * difficulty (1-based sector number) scales room count and enemy pressure.
 * `theme` only changes the look and the set dressing (Biofoundry: lab tiles,
 * violet light, specimen tanks with dormant Vatborn, 2×2 pillars, signs) —
 * the keycard → red door → lift → pad structure is the same. Biofoundry-only
 * draws use the position hash, never the layout RNG, so facility sectors
 * keep their exact layouts for a given seed.
 */
export function generateLevel(seed: number, difficulty = 1, theme: LevelTheme = 'facility', withBoss = false): LevelData {
  if (isNewTheme(theme)) return generateSectorLayout(seed, difficulty, theme);
  for (let attempt = 0; attempt < 10; attempt++) {
    const s = (seed + attempt * 7919) >>> 0;
    const data = generateLevelOnce(s, difficulty, theme, withBoss);
    if (withBoss && !data.boss) continue; // a boss sector needs a cradle spot
    if (validateLevel(data)) {
      if (attempt > 0) console.warn(`[levelgen] used fallback seed ${s} after ${attempt} invalid layouts`);
      return data;
    }
  }
  console.error('[levelgen] no valid layout found, returning last attempt');
  return generateLevelOnce(seed, difficulty, theme, withBoss);
}

/** room signs in the Biofoundry (normal rooms take these in order) */
const BIO_ROOM_NAMES = [
  'SPECIMEN LABORATORY', 'WASTE PROCESSING', 'CONTAINMENT WING', 'CULTURE STORAGE',
  'GROWTH MEDIA', 'SAMPLE ARCHIVE', 'COLD STORAGE', 'GENE SEQUENCING', 'NUTRIENT FEED',
  'ISOLATION WARD', 'AUTOPSY', 'FILTRATION',
];
const BIO_TANKS_MAX = 12;
/** occupied tanks: 4 in the first Biofoundry sector, 6 from sector 5 on */
const bioOccupied = (difficulty: number): number => (difficulty >= 8 ? 8 : difficulty >= 5 ? 6 : 4);
/** endless depths keep adding bodies; this keeps phones inside the draw budget */
const ENEMY_CAP = 90;

function generateLevelOnce(seed: number, difficulty: number, theme: LevelTheme, withBoss: boolean): LevelData {
  const rng = new RNG(seed);
  const isBio = theme === 'biofoundry';
  const isGeo = theme === 'geothermal';
  // Build 2: a Facility sector's look (1 Entry, 2 Security, 3 Reactor; endless by depth)
  const look: FacilityLook | null = theme === 'facility' ? (['entry', 'security', 'reactor'] as const)[facilityBand(difficulty) - 1] : null;
  const world = new VoxelWorld(WORLD_X, WORLD_Y, WORLD_Z);
  const pickups: PickupSpec[] = [];
  const enemies: EnemySpec[] = [];
  const doors: DoorSpec[] = [];

  // -- place rooms ----------------------------------------------------------
  const rooms: RoomDef[] = [];

  // the arena goes first while the map is empty so a big hall always fits:
  // a pillared fight pit holding the arc caster, guarded by a brute
  {
    let placed = false;
    for (let attempt = 0; attempt < 120 && !placed; attempt++) {
      const w = rng.int(17, 21);
      const d = rng.int(15, 19);
      const x = rng.int(6, WORLD_X - 7 - w);
      const z = rng.int(6, WORLD_Z - 7 - d);
      rooms.push({
        id: 0, x, z, w, d, h: 6,
        cx: x + Math.floor(w / 2), cz: z + Math.floor(d / 2),
        kind: 'arena', dist: 0,
      });
      placed = true;
    }
  }

  // sector 1 is a short opener (a first clear within a few minutes); the
  // rest grow with depth: 11–13 rooms in sector 2, 12–14 from sector 3.
  // Sectors 1–5 generate exactly as in 0.3.4 (owner's call — a gentler
  // sector 2 was tried and reverted); `features.mjs` compares them.
  const targetRooms = difficulty === 1 ? rng.int(6, 7) : rng.int(10, 12) + Math.min(2, difficulty - 1);
  for (let attempt = 0; attempt < 300 && rooms.length < targetRooms; attempt++) {
    const w = rng.int(8, 15);
    const d = rng.int(8, 15);
    const x = rng.int(4, WORLD_X - 5 - w);
    const z = rng.int(4, WORLD_Z - 5 - d);
    let ok = true;
    for (const r of rooms) {
      if (x < r.x + r.w + 3 && x + w + 3 > r.x && z < r.z + r.d + 3 && z + d + 3 > r.z) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    rooms.push({
      // Biofoundry rooms are taller (tanks stand y = 1..5); same single draw
      id: rooms.length, x, z, w, d, h: isBio || isGeo ? rng.int(5, 6) : rng.int(4, 5),
      cx: x + Math.floor(w / 2), cz: z + Math.floor(d / 2),
      kind: 'normal', dist: 0,
    });
  }

  // -- pick spawn + exit (never the arena — it stays a mid-run set piece) ----
  const spawnRoom = rooms.find((r) => r.kind !== 'arena')!;
  spawnRoom.kind = 'spawn';
  let exitRoom = rooms.find((r) => r !== spawnRoom && r.kind !== 'arena')!;
  let best = -1;
  for (const r of rooms) {
    if (r === spawnRoom || r.kind === 'arena') continue;
    const dd = (r.cx - spawnRoom.cx) ** 2 + (r.cz - spawnRoom.cz) ** 2;
    if (dd > best) {
      best = dd;
      exitRoom = r;
    }
  }
  exitRoom.kind = 'exit';
  exitRoom.h = 6;
  // A boarding apron frames the tall lift. The placement pass reserves a
  // three-cell margin, allowing this one-cell growth on either side.
  const growW = Math.max(0, 10 - exitRoom.w), growD = Math.max(0, 10 - exitRoom.d);
  exitRoom.x -= Math.floor(growW / 2); exitRoom.z -= Math.floor(growD / 2);
  exitRoom.w += growW; exitRoom.d += growD;
  exitRoom.cx = exitRoom.x + Math.floor(exitRoom.w / 2);
  exitRoom.cz = exitRoom.z + Math.floor(exitRoom.d / 2);

  // -- connect rooms with MST + a couple of loop edges ----------------------
  const edges: Edge[] = [];
  const inTree = new Set<number>([spawnRoom.id]);
  const adjacency = new Map<number, number[]>();
  rooms.forEach((r) => adjacency.set(r.id, []));

  const addEdge = (a: number, b: number): Edge => {
    const e: Edge = { a, b, dist: 0, stations: [] };
    edges.push(e);
    adjacency.get(a)!.push(b);
    adjacency.get(b)!.push(a);
    return e;
  };

  while (inTree.size < rooms.length) {
    let bestA = -1, bestB = -1, bestD = Infinity;
    for (const a of inTree) {
      for (const r of rooms) {
        if (inTree.has(r.id)) continue;
        const ra = rooms[a];
        const dd = (r.cx - ra.cx) ** 2 + (r.cz - ra.cz) ** 2;
        if (dd < bestD) {
          bestD = dd;
          bestA = a;
          bestB = r.id;
        }
      }
    }
    addEdge(bestA, bestB);
    inTree.add(bestB);
  }
  // loop edges (never touching the exit room, so the locked door stays the only way in)
  const loopCandidates: Array<[number, number, number]> = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      if (rooms[i].kind === 'exit' || rooms[j].kind === 'exit') continue;
      if (adjacency.get(i)!.includes(j)) continue;
      const dd = (rooms[i].cx - rooms[j].cx) ** 2 + (rooms[i].cz - rooms[j].cz) ** 2;
      loopCandidates.push([i, j, dd]);
    }
  }
  loopCandidates.sort((p, q) => p[2] - q[2]);
  for (let k = 0; k < Math.min(2, loopCandidates.length); k++) {
    addEdge(loopCandidates[k][0], loopCandidates[k][1]);
  }

  // -- graph distance from spawn -------------------------------------------
  {
    const q = [spawnRoom.id];
    const seen = new Set<number>([spawnRoom.id]);
    while (q.length) {
      const cur = q.shift()!;
      for (const nb of adjacency.get(cur)!) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        rooms[nb].dist = rooms[cur].dist + 1;
        q.push(nb);
      }
    }
  }

  // key room: farthest non-exit room from spawn
  let keyRoom = rooms.find((r) => r.kind === 'normal')!;
  for (const r of rooms) {
    if (r.kind !== 'normal') continue;
    if (r.dist > keyRoom.dist) keyRoom = r;
  }
  keyRoom.kind = 'key';

  // -- carve rooms ----------------------------------------------------------
  const carveAir = (x: number, y: number, z: number): void => {
    if (world.inBounds(x, y, z)) world.set(x, y, z, Block.Air);
  };
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++) {
      for (let z = r.z; z < r.z + r.d; z++) {
        for (let y = 1; y <= r.h; y++) carveAir(x, y, z);
      }
    }
  }

  // -- carve corridors ------------------------------------------------------
  const exitRect: Rect = { x: exitRoom.x - 1, z: exitRoom.z - 1, w: exitRoom.w + 2, d: exitRoom.d + 2 };
  const crossesRect = (x0: number, z0: number, x1: number, z1: number, rect: Rect): boolean => {
    const minX = Math.min(x0, x1), maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1), maxZ = Math.max(z0, z1);
    return minX < rect.x + rect.w && maxX >= rect.x && minZ < rect.z + rect.d && maxZ >= rect.z;
  };

  const carveSegment = (x0: number, z0: number, x1: number, z1: number, stations: Station[]): void => {
    if (z0 === z1) {
      const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
      for (let x = lo; x <= hi; x++) {
        for (let y = 1; y <= CORRIDOR_H; y++) {
          carveAir(x, y, z0);
          carveAir(x, y, z0 + 1);
        }
        if (x > lo + 1 && x < hi - 1) stations.push({ x, z: z0, dir: 'x' });
      }
    } else {
      const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
      for (let z = lo; z <= hi; z++) {
        for (let y = 1; y <= CORRIDOR_H; y++) {
          carveAir(x0, y, z);
          carveAir(x0 + 1, y, z);
        }
        if (z > lo + 1 && z < hi - 1) stations.push({ x: x0, z, dir: 'z' });
      }
    }
  };

  for (const e of edges) {
    const ra = rooms[e.a];
    const rb = rooms[e.b];
    // choose L order; avoid cutting through the exit room unless this edge connects to it
    const touchesExit = ra.kind === 'exit' || rb.kind === 'exit';
    // order A: horizontal first (via corner at (rb.cx, ra.cz)); order B: vertical first
    let orderA = rng.chance(0.5);
    if (!touchesExit) {
      const aCross =
        crossesRect(ra.cx, ra.cz, rb.cx, ra.cz, exitRect) ||
        crossesRect(rb.cx, ra.cz, rb.cx, rb.cz, exitRect);
      const bCross =
        crossesRect(ra.cx, ra.cz, ra.cx, rb.cz, exitRect) ||
        crossesRect(ra.cx, rb.cz, rb.cx, rb.cz, exitRect);
      if (aCross && !bCross) orderA = false;
      else if (bCross && !aCross) orderA = true;
    }
    if (orderA) {
      carveSegment(ra.cx, ra.cz, rb.cx, ra.cz, e.stations);
      carveSegment(rb.cx, ra.cz, rb.cx, rb.cz, e.stations);
    } else {
      carveSegment(ra.cx, ra.cz, ra.cx, rb.cz, e.stations);
      carveSegment(ra.cx, rb.cz, rb.cx, rb.cz, e.stations);
    }
    // widen the corner
    const cornerX = orderA ? rb.cx : ra.cx;
    const cornerZ = orderA ? ra.cz : rb.cz;
    for (let dx = 0; dx < 2; dx++) {
      for (let dz = 0; dz < 2; dz++) {
        for (let y = 1; y <= CORRIDOR_H; y++) carveAir(cornerX + dx, y, cornerZ + dz);
      }
    }
  }

  // -- secret room ----------------------------------------------------------
  const crackCells: Array<[number, number, number]> = [];
  let secretRect: Rect | null = null;
  let secretDone = false;
  const secretCandidates = rooms.filter((r) => r.kind === 'normal');
  rng.shuffle(secretCandidates);
  for (const r of secretCandidates) {
    if (secretDone) break;
    // try west, east, north, south walls
    const sides: Array<[number, number]> = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    rng.shuffle(sides);
    for (const [sx, sz] of sides) {
      const sw = 5, sd = 5;
      let ox: number, oz: number;
      if (sx !== 0) {
        ox = sx < 0 ? r.x - 1 - sw : r.x + r.w + 1;
        oz = r.cz - 2;
      } else {
        ox = r.cx - 2;
        oz = sz < 0 ? r.z - 1 - sd : r.z + r.d + 1;
      }
      // ensure the secret volume (+1 margin) is untouched rock, inside bounds
      let clear = ox >= 3 && oz >= 3 && ox + sw <= WORLD_X - 3 && oz + sd <= WORLD_Z - 3;
      for (let x = ox - 1; x <= ox + sw && clear; x++) {
        for (let z = oz - 1; z <= oz + sd && clear; z++) {
          for (let y = 1; y <= 4; y++) {
            if (world.get(x, y, z) !== Block.Rock) {
              clear = false;
              break;
            }
          }
        }
      }
      if (!clear) continue;
      // carve it
      for (let x = ox; x < ox + sw; x++) {
        for (let z = oz; z < oz + sd; z++) {
          for (let y = 1; y <= 3; y++) carveAir(x, y, z);
        }
      }
      secretRect = { x: ox, z: oz, w: sw, d: sd };
      // remember the wall cells to crack (set after paint pass)
      const cx2 = ox + 2;
      const cz2 = oz + 2;
      crackCells.length = 0;
      if (sx !== 0) {
        const wx = sx < 0 ? r.x - 1 : r.x + r.w;
        for (let y = 1; y <= 2; y++) {
          crackCells.push([wx, y, cz2], [wx, y, cz2 + (rng.chance(0.5) ? 1 : -1)]);
        }
      } else {
        const wz = sz < 0 ? r.z - 1 : r.z + r.d;
        for (let y = 1; y <= 2; y++) {
          crackCells.push([cx2, y, wz], [cx2 + (rng.chance(0.5) ? 1 : -1), y, wz]);
        }
      }
      secretDone = true;
      break;
    }
  }

  // -- exit ledge + elevator ------------------------------------------------
  // neighbor room of the exit (its single tree connection)
  const exitNeighbor = rooms[adjacency.get(exitRoom.id)![0]];
  const ndx = exitNeighbor.cx - exitRoom.cx;
  const ndz = exitNeighbor.cz - exitRoom.cz;
  // ledge on the wall opposite the neighbor's dominant direction
  let ledgeSide: 'xmin' | 'xmax' | 'zmin' | 'zmax';
  if (Math.abs(ndx) > Math.abs(ndz)) ledgeSide = ndx > 0 ? 'xmin' : 'xmax';
  else ledgeSide = ndz > 0 ? 'zmin' : 'zmax';

  const ledgeCells: Array<[number, number]> = [];
  // guard rail along the ledge's open edge (an invisible barrier on top of the
  // ledge under the yellow tube railing drawn by ExitArt),
  // leaving the two cells where the lift docks open so stepping off the deck
  // walks straight onto the pad. Falling off the ledge meant a whole second
  // lift cycle; a 1-block rail still clears with a jump (1.5u) for anyone who
  // wants back down.
  const railCells: Array<[number, number]> = [];
  let elevator: ElevatorSpec | null = null;
  let exitPad: LevelData['exitPad'] = null;
  let exitSign: ExitSignSpec | null = null;
  let ledgeRail: LedgeRailSpec | null = null;
  {
    const r = exitRoom;
    const depth = 3;
    let padCX: number, padCZ: number, elevX: number, elevZ: number;
    if (ledgeSide === 'zmax' || ledgeSide === 'zmin') {
      const z0 = ledgeSide === 'zmax' ? r.z + r.d - depth : r.z;
      for (let x = r.x; x < r.x + r.w; x++) {
        for (let z = z0; z < z0 + depth; z++) ledgeCells.push([x, z]);
      }
      padCX = r.cx;
      padCZ = ledgeSide === 'zmax' ? r.z + r.d - 1 : r.z + 1; // against the back wall: the door's threshold
      elevX = r.cx - 1;
      elevZ = ledgeSide === 'zmax' ? z0 - 2 : z0 + depth;
      const railZ = ledgeSide === 'zmax' ? z0 : z0 + depth - 1;
      for (let x = r.x; x < r.x + r.w; x++) {
        if (x !== elevX && x !== elevX + 1) railCells.push([x, railZ]);
      }
    } else {
      const x0 = ledgeSide === 'xmax' ? r.x + r.w - depth : r.x;
      for (let z = r.z; z < r.z + r.d; z++) {
        for (let x = x0; x < x0 + depth; x++) ledgeCells.push([x, z]);
      }
      padCX = ledgeSide === 'xmax' ? r.x + r.w - 1 : r.x + 1;
      padCZ = r.cz;
      elevX = ledgeSide === 'xmax' ? x0 - 2 : x0 + depth;
      elevZ = r.cz - 1;
      const railX = ledgeSide === 'xmax' ? x0 : x0 + depth - 1;
      for (let z = r.z; z < r.z + r.d; z++) {
        if (z !== elevZ && z !== elevZ + 1) railCells.push([railX, z]);
      }
    }
    for (const [x, z] of ledgeCells) {
      for (let y = 1; y <= 3; y++) world.set(x, y, z, Block.Metal);
    }
    for (const [x, z] of railCells) {
      if (world.get(x, 4, z) === Block.Air) world.set(x, 4, z, Block.PowerBarrier);
    }
    // exit pad blocks (their top faces glow green + emit light)
    for (let dx = -1; dx <= 0; dx++) {
      for (let dz = -1; dz <= 0; dz++) {
        world.set(padCX + dx, 3, padCZ + dz, Block.ExitPad);
      }
    }
    elevator = {
      x: elevX, z: elevZ, lowY: 1, highY: 4,
      walkAxis: ledgeSide === 'zmax' || ledgeSide === 'zmin' ? 'z' : 'x',
    };
    exitPad = { x: padCX, y: 4, z: padCZ };

    // -- the way out reads as one (reference/exit-lift-red-room-v1.png): a
    // green EXIT sign on the back wall over the pad (ExitArt), yellow tube
    // railing on the ledge, a mechanical lift (Elevator).
    const alongX = ledgeSide === 'zmin' || ledgeSide === 'zmax';
    const out = ledgeSide === 'zmin' || ledgeSide === 'xmin' ? -1 : 1; // out of the room, toward the back wall
    const wallC = ledgeSide === 'zmin' ? r.z - 1 : ledgeSide === 'zmax' ? r.z + r.d : ledgeSide === 'xmin' ? r.x - 1 : r.x + r.w;
    const faceC = out < 0 ? wallC + 1 : wallC;
    const mid = alongX ? padCX : padCZ;
    const at = (a: number, y: number, c: number): [number, number, number] => (alongX ? [a, y, c] : [c, y, a]);
    exitSign = alongX ? { x: mid, y: 4, z: faceC, face: ledgeSide } : { x: faceC, y: 4, z: mid, face: ledgeSide };
    ledgeRail = { cells: railCells, y: 4, axis: alongX ? 'x' : 'z', inward: out };

    // -- dressing: crate stacks in the corners at the ledge's foot
    const frontC = ledgeSide === 'zmin' ? r.z + depth - 1 : ledgeSide === 'zmax' ? r.z + r.d - depth : ledgeSide === 'xmin' ? r.x + depth - 1 : r.x + r.w - depth;
    const baseC = frontC - out; // the floor row in front of the ledge
    const lo = alongX ? r.x : r.z, hi = alongX ? r.x + r.w - 1 : r.z + r.d - 1;
    for (const [corner, inward] of [[lo, 1], [hi, -1]] as const) {
      // never in front of a doorway: the side wall beside the corner stays solid
      const side = corner - inward;
      let clear = true;
      for (let y = 1; y <= 2; y++) for (const c of [baseC, baseC - out]) {
        const [sx, sy, sz] = at(side, y, c);
        if (!world.isSolid(sx, sy, sz)) clear = false;
      }
      if (!clear) continue;
      world.set(...at(corner, 1, baseC), Block.Crate);
      world.set(...at(corner, 2, baseC), Block.Crate);
      world.set(...at(corner + inward, 1, baseC), Block.Crate);
      world.set(...at(corner, 1, baseC - out), Block.Crate);
    }
  }

  // -- paint pass: type walls/floors/ceilings around air --------------------
  for (let y = 0; y < WORLD_Y; y++) {
    for (let z = 0; z < WORLD_Z; z++) {
      for (let x = 0; x < WORLD_X; x++) {
        if (world.get(x, y, z) !== Block.Air) continue;
        if (world.get(x, y - 1, z) === Block.Rock) world.set(x, y - 1, z, Block.Floor);
        if (world.get(x, y + 1, z) === Block.Rock) world.set(x, y + 1, z, Block.Ceil);
        if (world.get(x - 1, y, z) === Block.Rock) world.set(x - 1, y, z, Block.Wall);
        if (world.get(x + 1, y, z) === Block.Rock) world.set(x + 1, y, z, Block.Wall);
        if (world.get(x, y, z - 1) === Block.Rock) world.set(x, y, z - 1, Block.Wall);
        if (world.get(x, y, z + 1) === Block.Rock) world.set(x, y, z + 1, Block.Wall);
      }
    }
  }

  // -- deco pass: rust, vents, pipes, worn plating (cosmetic, same physics) --
  // position-hashed instead of drawing from the layout RNG, so adding or
  // tuning deco never reshuffles rooms/enemies/pickups for a given seed
  const dhash = (x: number, y: number, z: number): number => {
    let h = (x * 374761393 + y * 668265263 + z * 1103515245 + seed * 2246822519) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  for (let z = 0; z < WORLD_Z; z++) {
    for (let x = 0; x < WORLD_X; x++) {
      // occasional full-height conduit column on a wall
      if (world.get(x, 1, z) === Block.Wall && world.get(x, 2, z) === Block.Wall && dhash(x, 99, z) < 0.045) {
        for (let y = 1; y <= 7 && world.get(x, y, z) === Block.Wall; y++) world.set(x, y, z, Block.WallPipes);
        continue;
      }
      for (let y = 1; y <= 7; y++) {
        const b = world.get(x, y, z);
        if (b === Block.Wall) {
          const n = dhash(x, y, z);
          if (n < 0.04 && y >= 2) world.set(x, y, z, Block.WallVent);
          else if (n < 0.11) world.set(x, y, z, Block.WallRust);
          else if (n < 0.2) world.set(x, y, z, Block.WallWorn);
        } else if (b === Block.Ceil && dhash(x, y, z) < 0.035) {
          world.set(x, y, z, Block.CeilVent);
        }
      }
    }
  }
  // conduit runs across room ceilings (straight lanes read as intentional)
  for (const r of rooms) {
    if (dhash(r.id, 77, 5) > 0.7) continue;
    const alongX = dhash(r.id, 88, 6) < 0.5;
    const lanes = dhash(r.id, 91, 7) < 0.35 ? 2 : 1;
    // the tile art is direction-locked: pick the variant whose pipes run WITH the lane
    const pipeBlock = alongX ? Block.CeilPipes : Block.CeilPipesZ;
    for (let l = 0; l < lanes; l++) {
      const off = 2 + Math.floor(dhash(r.id, 93 + l, 8) * ((alongX ? r.d : r.w) - 4));
      const len = alongX ? r.w : r.d;
      for (let i = 0; i < len; i++) {
        const x = alongX ? r.x + i : r.x + off;
        const z = alongX ? r.z + off : r.z + i;
        if (world.get(x, r.h + 1, z) === Block.Ceil) world.set(x, r.h + 1, z, pipeBlock);
      }
    }
  }

  // -- crack the secret wall (after paint AND deco so it isn't overwritten) --
  for (const [x, y, z] of crackCells) {
    if (world.isSolid(x, y, z)) world.set(x, y, z, Block.Cracked);
  }

  // -- doors ----------------------------------------------------------------
  const doorTooClose = (x: number, z: number): boolean =>
    doors.some((d) => Math.abs(d.x - x) + Math.abs(d.z - z) < 4);

  const insideAnyRoom = (x: number, z: number): boolean =>
    rooms.some((r) => x >= r.x - 1 && x < r.x + r.w + 1 && z >= r.z - 1 && z < r.z + r.d + 1) ||
    (secretRect !== null &&
      x >= secretRect.x - 1 && x < secretRect.x + secretRect.w + 1 &&
      z >= secretRect.z - 1 && z < secretRect.z + secretRect.d + 1);

  const stationValid = (s: Station): boolean => {
    if (insideAnyRoom(s.x, s.z)) return false;
    if (doorTooClose(s.x, s.z)) return false;
    const [ax, az, bx, bz] = s.dir === 'x'
      ? [s.x, s.z - 1, s.x, s.z + 2]
      : [s.x - 1, s.z, s.x + 2, s.z];
    for (let y = 1; y <= CORRIDOR_H; y++) {
      if (!world.isSolid(ax, y, az) || !world.isSolid(bx, y, bz)) return false;
      const c1 = s.dir === 'x' ? world.get(s.x, y, s.z) : world.get(s.x, y, s.z);
      const c2 = s.dir === 'x' ? world.get(s.x, y, s.z + 1) : world.get(s.x + 1, y, s.z);
      if (c1 !== Block.Air || c2 !== Block.Air) return false;
    }
    return true;
  };

  /** doorway itself must be open air, and the spot must sit between rooms */
  const stationUsable = (s: Station): boolean => {
    if (insideAnyRoom(s.x, s.z)) return false;
    if (doorTooClose(s.x, s.z)) return false;
    for (let y = 1; y <= CORRIDOR_H; y++) {
      const c1 = world.get(s.x, y, s.z);
      const c2 = s.dir === 'x' ? world.get(s.x, y, s.z + 1) : world.get(s.x + 1, y, s.z);
      if (c1 !== Block.Air || c2 !== Block.Air) return false;
    }
    return true;
  };

  const buildFrame = (s: Station): void => {
    const [ax, az, bx, bz] = s.dir === 'x'
      ? [s.x, s.z - 1, s.x, s.z + 2]
      : [s.x - 1, s.z, s.x + 2, s.z];
    for (let y = 1; y <= CORRIDOR_H; y++) {
      world.set(ax, y, az, Block.Trim);
      world.set(bx, y, bz, Block.Trim);
    }
    if (s.dir === 'x') {
      world.set(s.x, CORRIDOR_H + 1, s.z, Block.Metal);
      world.set(s.x, CORRIDOR_H + 1, s.z + 1, Block.Metal);
    } else {
      world.set(s.x, CORRIDOR_H + 1, s.z, Block.Metal);
      world.set(s.x + 1, CORRIDOR_H + 1, s.z, Block.Metal);
    }
  };

  const placeDoorOnEdge = (e: Edge, locked: DoorSpec['locked'], force: boolean): boolean => {
    if (e.stations.length === 0) return false;
    // try stations from the middle outward
    const mid = Math.floor(e.stations.length / 2);
    const order: number[] = [mid];
    for (let off = 1; off < e.stations.length; off++) {
      if (mid + off < e.stations.length) order.push(mid + off);
      if (mid - off >= 0) order.push(mid - off);
    }
    for (const idx of order) {
      const s = e.stations[idx];
      if (!stationValid(s)) continue;
      doors.push({ x: s.x, z: s.z, dir: s.dir, locked });
      buildFrame(s);
      return true;
    }
    if (!force) return false;
    // forced: accept any open between-rooms station and build the frame into
    // whatever is there (seals stray gaps so the door actually blocks passage)
    for (const idx of order) {
      const s = e.stations[idx];
      if (!stationUsable(s)) continue;
      doors.push({ x: s.x, z: s.z, dir: s.dir, locked });
      buildFrame(s);
      return true;
    }
    return false;
  };

  // locked door on the exit edge — must exist for the key loop to matter
  const exitEdge = edges.find((e) => rooms[e.a].kind === 'exit' || rooms[e.b].kind === 'exit')!;
  placeDoorOnEdge(exitEdge, 'red', true);
  // regular doors on some other edges
  for (const e of edges) {
    if (e === exitEdge) continue;
    if (rng.chance(0.55)) placeDoorOnEdge(e, null, true);
  }

  // -- lamps ----------------------------------------------------------------
  for (const r of rooms) {
    let lamp: Block;
    // the Biofoundry: violet emergency panels; the key room keeps its red,
    // the exit hall its teal (signal colours keep their meaning)
    if (r.kind === 'exit') lamp = Block.LampWarm;
    else if (isBio) lamp = r.kind === 'key' ? Block.LampRed : Block.LampViolet;
    // the Geothermal Core: warm work lights over the glowing seams; the key
    // room keeps its red (signal colours keep their meaning)
    else if (isGeo) lamp = r.kind === 'key' ? Block.LampRed : Block.LampWarm;
    else if (r.kind === 'key') lamp = Block.LampRed;
    else if (r.kind === 'arena') lamp = rng.chance(0.5) ? Block.LampTeal : Block.LampRed;
    else lamp = rng.chance(0.28) ? Block.LampTeal : rng.chance(0.14) ? Block.LampRed : Block.LampWarm;
    // Build 2: each Facility look has its light — Entry cool office white (for
    // the warm lamps), Security blue-white (all but the teal), Reactor orange;
    // the key room's red and the exit's warm keep their meaning. (The layout
    // RNG above is drawn exactly as before.)
    if (look && r.kind !== 'exit' && r.kind !== 'key') {
      if (look === 'entry' && lamp === Block.LampWarm) lamp = Block.LampCool;
      else if (look === 'security' && lamp !== Block.LampTeal) lamp = Block.LampIce;
      else if (look === 'reactor') lamp = Block.LampOrange;
    }
    if (r.kind === 'exit' && elevator && exitPad) {
      const fx = elevator.walkAxis === 'x' ? Math.sign(exitPad.x - elevator.x - 1) : 0;
      const fz = elevator.walkAxis === 'z' ? Math.sign(exitPad.z - elevator.z - 1) : 0;
      for (const side of [-2.5, 2.5]) {
        const x = Math.floor(elevator.x + 1 - fx * .2 + fz * side);
        const z = Math.floor(elevator.z + 1 - fz * .2 - fx * side);
        if (world.isSolid(x, r.h + 1, z)) world.set(x, r.h + 1, z, lamp);
      }
    }
    for (let x = r.x + 2; r.kind !== 'exit' && x < r.x + r.w - 1; x += 4) {
      for (let z = r.z + 2; z < r.z + r.d - 1; z += 4) {
        if (world.isSolid(x, r.h + 1, z)) world.set(x, r.h + 1, z, lamp);
      }
    }
    if (r.kind === 'exit') {
      // green glow over the pad only (the whole ledge lit green washed the
      // room; the mockup keeps green for the destination)
      if (exitPad) world.set(Math.floor(exitPad.x), r.h + 1, Math.floor(exitPad.z), Block.LampGreen);
    }
    // hanging fixtures in tall rooms: a chain stem with a lamp swinging below
    // the ceiling (skip the exit room — a fixture over the ledge walkway
    // would block the path to the pad)
    if (r.h >= 5 && r.kind !== 'exit') {
      const hangs = 2 + (r.w * r.d > 200 ? 2 : 0);
      for (let i = 0; i < hangs; i++) {
        const hx = r.x + 2 + Math.floor(dhash(r.id, i * 3 + 1, 501) * (r.w - 4));
        const hz = r.z + 2 + Math.floor(dhash(r.id, i * 3 + 2, 502) * (r.d - 4));
        const lampY = r.h - 1 - (r.h >= 6 ? 1 : 0); // hang deeper under high ceilings
        const above = world.get(hx, r.h + 1, hz);
        if (above !== Block.Ceil && above !== Block.CeilPipes && above !== Block.CeilPipesZ) continue;
        let clear = true;
        for (let y = lampY; y <= r.h && clear; y++) {
          if (world.get(hx, y, hz) !== Block.Air) clear = false;
        }
        if (!clear) continue;
        for (let y = lampY + 1; y <= r.h; y++) world.set(hx, y, hz, Block.Chain);
        world.set(hx, lampY, hz, lamp);
      }
    }
  }
  // corridor lamps: sparse, warm
  for (const e of edges) {
    for (let i = 3; i < e.stations.length; i += 6) {
      const s = e.stations[i];
      if (world.isSolid(s.x, CORRIDOR_H + 1, s.z) && world.get(s.x, CORRIDOR_H + 1, s.z) === Block.Ceil) {
        world.set(s.x, CORRIDOR_H + 1, s.z, isBio ? Block.LampTeal : Block.LampWarm);
      }
    }
  }
  if (secretRect) {
    world.set(secretRect.x + 2, 4, secretRect.z + 2, Block.LampRed);
  }

  // -- pillars in large rooms ----------------------------------------------
  // the Biofoundry's are 2×2 and ribbed, with a warm band at y = 3
  const bioPillars: Array<[number, number]> = [];
  const pillar2 = (px: number, pz: number, h: number): void => {
    for (let xx = px; xx < px + 2; xx++) for (let zz = pz; zz < pz + 2; zz++) {
      for (let y = 1; y <= h; y++) world.set(xx, y, zz, y === 3 ? Block.LampWarm : Block.Pillar);
    }
    bioPillars.push([px, pz]);
  };
  for (const r of rooms) {
    if (r.kind === 'exit' || r.w < 11 || r.d < 11) continue;
    if (isBio) {
      for (const [px, pz] of [
        [r.x + 3, r.z + 3], [r.x + r.w - 5, r.z + 3],
        [r.x + 3, r.z + r.d - 5], [r.x + r.w - 5, r.z + r.d - 5],
      ]) pillar2(px, pz, r.h);
      // arena ring stays off the axes: the brute's charge lanes
      if (r.kind === 'arena') {
        for (const [px, pz] of [
          [r.cx - 6, r.cz - 6], [r.cx + 5, r.cz - 6],
          [r.cx - 6, r.cz + 5], [r.cx + 5, r.cz + 5],
        ]) pillar2(px, pz, r.h);
      }
      continue;
    }
    for (const [px, pz] of [
      [r.x + 3, r.z + 3], [r.x + r.w - 4, r.z + 3],
      [r.x + 3, r.z + r.d - 4], [r.x + r.w - 4, r.z + r.d - 4],
    ]) {
      for (let y = 1; y <= r.h; y++) world.set(px, y, pz, Block.Pillar);
      world.set(px, 2, pz, Block.LampWarm);
    }
    // arena: an inner diagonal ring around the prize (axes stay clear so the
    // brute has charge lanes)
    if (r.kind === 'arena') {
      for (const [px, pz] of [
        [r.cx - 5, r.cz - 5], [r.cx + 5, r.cz - 5],
        [r.cx - 5, r.cz + 5], [r.cx + 5, r.cz + 5],
      ]) {
        for (let y = 1; y <= r.h; y++) world.set(px, y, pz, Block.Pillar);
        world.set(px, 2, pz, Block.LampWarm);
      }
    }
  }

  // -- crates ---------------------------------------------------------------
  for (const r of rooms) {
    if (r.kind === 'spawn' || r.kind === 'exit') {
      if (r.kind === 'exit') continue;
    }
    const n = rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const x = rng.chance(0.5) ? r.x + rng.int(1, 2) : r.x + r.w - 1 - rng.int(1, 2);
      const z = rng.chance(0.5) ? r.z + rng.int(1, 2) : r.z + r.d - 1 - rng.int(1, 2);
      if (world.get(x, 1, z) !== Block.Air) continue;
      world.set(x, 1, z, Block.Crate);
      if (rng.chance(0.4)) world.set(x, 2, z, Block.Crate);
      if (rng.chance(0.5)) {
        const nx = x + (rng.chance(0.5) ? 1 : -1);
        if (world.get(nx, 1, z) === Block.Air) world.set(nx, 1, z, Block.Crate);
      }
    }
  }

  // -- exploding barrels ------------------------------------------------------
  // (not in the exit room: the elevator footprint is still open air here and a
  // barrel inside it would leave the player standing on the barrel, not the lift)
  for (const r of rooms) {
    if (r.kind === 'spawn' || r.kind === 'exit') continue;
    if (!rng.chance(0.7)) continue;
    const n = rng.int(1, 2);
    for (let i = 0; i < n; i++) {
      const x = rng.int(r.x + 1, r.x + r.w - 2);
      const z = rng.int(r.z + 1, r.z + r.d - 2);
      if (world.get(x, 1, z) !== Block.Air) continue;
      world.set(x, 1, z, Block.Barrel);
      // occasional pair for chain reactions
      if (rng.chance(0.35)) {
        const nx = x + (rng.chance(0.5) ? 1 : -1);
        if (world.get(nx, 1, z) === Block.Air) world.set(nx, 1, z, Block.Barrel);
      }
    }
  }
  // the opener always teaches barrels: a pair in the first room out of spawn
  // (position-hashed, so it doesn't move anything the layout RNG placed)
  if (difficulty === 1) {
    const first = rooms.find((r) => r.dist === 1 && r.kind !== 'exit') ?? rooms.find((r) => r.kind !== 'spawn' && r.kind !== 'exit');
    let hasBarrel = false;
    if (first) for (let x = first.x; x < first.x + first.w && !hasBarrel; x++) for (let z = first.z; z < first.z + first.d; z++) {
      if (world.get(x, 1, z) === Block.Barrel) { hasBarrel = true; break; }
    }
    if (first && !hasBarrel) {
      for (let k = 0; k < 24; k++) {
        const x = first.x + 2 + Math.floor(dhash(first.id, 61 + k, 3) * Math.max(1, first.w - 5));
        const z = first.z + 2 + Math.floor(dhash(first.id, 91 + k, 3) * Math.max(1, first.d - 4));
        if (world.get(x, 1, z) !== Block.Air || world.get(x + 1, 1, z) !== Block.Air) continue;
        world.set(x, 1, z, Block.Barrel);
        world.set(x + 1, 1, z, Block.Barrel);
        break;
      }
    }
  }

  // -- Biofoundry: specimen tanks + dressing data ---------------------------
  // After props and before pickups/enemies, so a tank only goes where its
  // whole volume, the cell in front of the glass and the standing spot the
  // occupant walks out to are open air — and nothing lands there later
  // (pickups and enemies only use air cells).
  let bio: BioLayout | undefined;
  let occupiedTanks = 0;
  if (isBio) {
    bio = dressBiofoundry(world, rooms, bioPillars, dhash, bioOccupied(difficulty));
    occupiedTanks = bio.tanks.filter((t) => t.occupied).length;
  }

  // -- boss cradle -----------------------------------------------------------
  let boss: LevelData['boss'] = null;
  const arenaRoom0 = rooms.find((r) => r.kind === 'arena');
  if (withBoss && arenaRoom0) boss = placeBoss(world, arenaRoom0, bio?.heart ?? null);
  // the fight's adds are the boss's own summons: tanks in its chamber stay empty
  if (boss && bio) {
    for (const t of bio.tanks) {
      if (t.occupied && t.x >= arenaRoom0!.x && t.x < arenaRoom0!.x + arenaRoom0!.w && t.z >= arenaRoom0!.z && t.z < arenaRoom0!.z + arenaRoom0!.d) t.occupied = false;
    }
    occupiedTanks = bio.tanks.filter((t) => t.occupied).length;
  }

  // -- pickups --------------------------------------------------------------
  const freeSpot = (r: RoomDef): [number, number] => {
    for (let tries = 0; tries < 20; tries++) {
      const x = rng.int(r.x + 1, r.x + r.w - 2);
      const z = rng.int(r.z + 1, r.z + r.d - 2);
      if (world.get(x, 1, z) === Block.Air) return [x + 0.5, z + 0.5];
    }
    return [r.cx + 0.5, r.cz + 0.5];
  };

  // key (on a boss sector the Broodkeeper carries it: the spec sits in front
  // of the cradle for the walkability check, the game hides it until it dies)
  {
    const [x, z] = boss
      ? [boss.x - Math.sin(boss.yaw) * 2.8, boss.z - Math.cos(boss.yaw) * 2.8]
      : freeSpot(keyRoom);
    pickups.push({ kind: 'keyRed', x, y: 1.5, z });
    const [hx, hz] = freeSpot(keyRoom);
    pickups.push({ kind: 'healthBig', x: hx, y: 1.4, z: hz });
  }
  // weapons: shotgun in the first room out of spawn, SMG midway
  const byDist = [...rooms].sort((a, b) => a.dist - b.dist);
  // the opener hands it over in the spawn room: power in the first seconds
  const shotgunRoom = difficulty === 1 ? spawnRoom : (byDist.find((r) => r.dist >= 1 && r.kind !== 'exit') ?? spawnRoom);
  {
    const [x, z] = freeSpot(shotgunRoom);
    pickups.push({ kind: 'weaponShotgun', x, y: 1.4, z });
  }
  const midRooms = rooms.filter((r) => r.kind === 'normal' && r.dist >= 2 && r !== shotgunRoom);
  if (midRooms.length) {
    const [x, z] = freeSpot(rng.pick(midRooms));
    pickups.push({ kind: 'weaponSMG', x, y: 1.4, z });
  }
  // the arc caster waits in the middle of the arena, with cells nearby
  const arenaRoom = rooms.find((r) => r.kind === 'arena');
  if (arenaRoom) {
    pickups.push(
      { kind: 'weaponArc', x: arenaRoom.cx + 0.5, y: 1.5, z: arenaRoom.cz + 0.5 },
      { kind: 'ammoCells', x: arenaRoom.cx - 1.5, y: 1.4, z: arenaRoom.cz + 0.5 },
      { kind: 'ammoCells', x: arenaRoom.cx + 2.5, y: 1.4, z: arenaRoom.cz + 0.5 }
    );
  }
  // rocket launcher + goodies in the secret room (or key room fallback)
  if (secretRect) {
    pickups.push(
      { kind: 'weaponRocket', x: secretRect.x + 2.5, y: 1.4, z: secretRect.z + 2.5 },
      ...(difficulty <= 5 ? [{ kind: 'weaponSecret' as const, secretSector: difficulty, x: secretRect.x + 1.5, y: 1.4, z: secretRect.z + 1.5 }] : []),
      { kind: 'armorVest', x: secretRect.x + 1.5, y: 1.4, z: secretRect.z + 3.5 },
      { kind: 'ammoRockets', x: secretRect.x + 3.5, y: 1.4, z: secretRect.z + 1.5 }
    );
  } else {
    const [x, z] = freeSpot(keyRoom);
    pickups.push({ kind: 'weaponRocket', x, y: 1.4, z });
  }
  // scattered supplies
  const supplyTable: Array<[PickupSpec['kind'], number]> = [
    ['ammoBullets', 0.25], ['ammoShells', 0.23], ['healthSmall', 0.2],
    ['armorShard', 0.14], ['ammoCells', 0.06], ['healthBig', 0.06], ['ammoRockets', 0.06],
  ];
  const pickSupply = (): PickupSpec['kind'] => {
    let roll = rng.next();
    for (const [kind, p] of supplyTable) {
      roll -= p;
      if (roll <= 0) return kind;
    }
    return 'ammoBullets';
  };
  for (const r of rooms) {
    if (r.kind === 'exit') continue;
    const n = r.kind === 'spawn' ? 2 : rng.int(1, 3);
    for (let i = 0; i < n; i++) {
      const [x, z] = freeSpot(r);
      pickups.push({ kind: r.kind === 'spawn' ? (i === 0 ? 'ammoBullets' : 'healthSmall') : pickSupply(), x, y: 1.4, z });
    }
  }

  // -- enemies --------------------------------------------------------------
  const addEnemy = (spec: EnemySpec): void => {
    if (enemies.length < ENEMY_CAP) enemies.push(spec);
  };
  for (const r of rooms) {
    if (r.kind === 'spawn') continue;
    // a boss arena is the Broodkeeper's alone (its summons are the adds)
    if (boss && r.id === boss.roomId) continue;
    let count: number;
    if (r.dist <= 1) count = rng.int(1, 2);
    else if (r.dist === 2) count = 2;
    else count = rng.int(2, 3);
    if (r.kind === 'key' || r.kind === 'exit') count += 1;
    // later sectors push harder
    if (difficulty >= 2 && r.dist >= 2) count += 1;
    if (difficulty >= 3 && r.kind !== 'normal') count += 1;
    // the deep Biofoundry (sector 5): the other curves are capped by now, so
    // the far rooms get one more body (sectors 1–4 are untouched)
    if (difficulty >= 5 && r.dist >= 3) count += 1;
    // endless depths: one more in the far rooms at depth 7, two from depth 10
    if (difficulty > 5 && r.dist >= 2) count += Math.min(2, Math.floor((difficulty - 4) / 3));
    for (let i = 0; i < count; i++) {
      // farther rooms and later sectors skew ranged
      // (the core caps it lower: its Kiln Drones hit harder than Sentinels, and
      // a ranged-heavy sector 6 was a wall right after the boss)
      const rangedP = Math.min(isGeo ? 0.5 : 0.75, (r.dist >= 2 ? 0.5 : 0.25) + (difficulty - 1) * 0.08);
      const ranged = rng.chance(rangedP);
      const [x, z] = freeSpot(r);
      // the Geothermal Core breeds its own: Vent Stalkers among the melee,
      // Kiln Drones among the ranged (position-hashed: the layout RNG stream
      // is the same as any other sector's)
      const native = isGeo && dhash(x, 711 + i, z) < 0.55;
      addEnemy({ kind: ranged ? (native ? 'kilnDrone' : 'sentinel') : (native ? 'ventStalker' : 'husk'), x, z, roomId: r.id });
    }
    // ticker nests: packs of suicide crawlers, more common deeper in (none in
    // the sector 1 opener). The core keeps tickers to about half the rooms, in
    // pairs at most: its Vent Stalkers already rush you.
    const tickerP = isGeo ? 0.45 : 0.3 + (difficulty - 1) * 0.15;
    if (difficulty >= 2 && r.dist >= 1 && rng.chance(tickerP)) {
      const pack = rng.int(1, Math.min(isGeo ? 2 : 3, 1 + difficulty));
      for (let i = 0; i < pack; i++) {
        const [x, z] = freeSpot(r);
        addEnemy({ kind: 'ticker', x, z, roomId: r.id });
      }
    }
    // the arena's pit boss guards the arc caster (none in the opener, two by
    // sector 3)
    if (r.kind === 'arena') {
      const brutes = difficulty >= 3 ? 2 : difficulty >= 2 ? 1 : 0;
      for (let i = 0; i < brutes; i++) {
        const [x, z] = freeSpot(r);
        // the core's pit is held by a Cinder Hulk (with a brute beside it later on)
        addEnemy({ kind: isGeo && i === 0 ? 'cinderHulk' : 'brute', x, z, roomId: r.id });
      }
    }
  }

  // -- the sector's own monsters (reference/sector-monsters-v2) -------------
  // Every sector (and endless depth) re-casts the generic placements above as
  // its own pair at about the same pressure: Facility 1–3, Biofoundry 4–5,
  // Geothermal Core 6–7. No RNG: the rest of the layout stream is untouched.
  // (Facility: off — the generic mix, see FACILITY_ROSTERS)
  const band = theme === 'facility' && FACILITY_ROSTERS ? facilityBand(difficulty) : null;
  const bBand = theme === 'biofoundry' ? bioBand(difficulty, withBoss) : null;
  const gBand = isGeo ? geoBand(difficulty) : null;
  if (band || bBand || gBand) {
    const cast = band ? applyFacilityRoster(enemies, band) : bBand ? applyBioRoster(enemies, bBand) : applyGeoRoster(enemies, gBand!);
    enemies.length = 0;
    enemies.push(...cast);
  }
  const response = band ? FACILITY_RESPONSE[band] : bBand ? BIO_RESPONSE[bBand] : gBand ? GEO_RESPONSE[gBand] : null;
  // The Arc Sentinel wall (0.3.7 Player Fit Test: 70 of the 171 players who
  // reached sector 2 died to one; 0.3.8: 148 of ~250 deaths, sectors 1–3).
  // With the generic Facility mix, sector 1's Sentinels become Tickers (its
  // 0.3.7 opener: 7% failed it, 22% with Sentinels), and in sectors 2–3 every
  // other Sentinel in a room becomes a Husk (40 hp for 45: the same pressure);
  // a room keeps its first. No RNG.
  if (theme === 'facility' && !band && difficulty <= 3) {
    const seen = new Map<number, number>();
    for (const e of enemies) {
      if (e.kind !== 'sentinel') continue;
      if (difficulty === 1) { e.kind = 'ticker'; continue; }
      const n = (seen.get(e.roomId) ?? 0) + 1;
      seen.set(e.roomId, n);
      if (n % 2 === 0) e.kind = 'husk';
    }
  }

  // -- powerup: at most one per sector, stashed in a far room ----------------
  if (rng.chance(0.65)) {
    const farRooms = rooms.filter((r) => r.kind === 'normal' && r.dist >= 2);
    if (farRooms.length) {
      const kinds: PickupSpec['kind'][] = ['powerQuad', 'powerShield', 'powerHaste'];
      const [x, z] = freeSpot(rng.pick(farRooms));
      pickups.push({ kind: rng.pick(kinds), x, y: 1.5, z });
    }
  }

  // -- Biofoundry surfaces: lab tiles over the facility paint ---------------
  // (after the deco pass, the cracked secret wall and every lamp, so only the
  // plain surfaces change; vents, pipe columns, trim and metal stay)
  if (isBio) reskinLab(world, dhash);
  // -- the optional Power Link cage (facility from sector 2, the core) -------
  // Something to find off the route in every sector after the opener (the
  // Biofoundry has its tanks). Placed AFTER every pickup and enemy, on cells
  // none of them use, so it never touches the layout RNG: a seed's rooms,
  // pickups and enemies are exactly what they were without it.
  const withLink = isNewTheme(theme) || isGeo || (theme === 'facility' && difficulty >= 2);
  const taken = new Set<number>();
  for (const p of [...pickups, ...enemies]) taken.add(Math.floor(p.x) + Math.floor(p.z) * world.sx);
  const powerLink = withLink ? placePowerLink(world, rooms, dhash, boss?.roomId ?? -1, taken) : null;
  if (powerLink) {
    const { ox, oz, ux, uz, nx, nz } = powerLink.cage;
    const at = (a: number, t: number): [number, number] => [ox + ux * a + nx * t, oz + uz * a + nz * t];
    // the supplies: armor in the middle, health and ammo either side
    const ammo: PickupSpec['kind'][] = ['ammoRockets', 'ammoCells', 'ammoShells'];
    const kinds: PickupSpec['kind'][] = ['healthBig', 'armorVest', ammo[Math.floor(dhash(ox, 9, oz) * ammo.length)]];
    kinds.forEach((kind, i) => {
      const [x, z] = at(1.5 + i, 0.5);
      pickups.push({ kind, x, y: 1.4, z, sealed: true });
    });
  }
  let geo: GeoLayout | undefined;
  if (isGeo) geo = { vents: dressGeothermal(world, rooms, dhash), signs: geoSigns(world, spawnRoom) };
  if (isNewTheme(theme)) {
    dressEnvironment(world, rooms, theme);
    // The optional supply node keeps its amber signal in every environment.
    if (powerLink) world.set(powerLink.node.x, powerLink.node.y, powerLink.node.z, Block.LampWarm);
  }

  // Give the exit hall its reference surfaces, including the vertical ledge
  // face. This is local to the room; corridor and sector palettes stay intact.
  const lightOverrides = new Map<number, { color: [number, number, number]; range: number }>();
  for (let x = exitRoom.x - 1; x <= exitRoom.x + exitRoom.w; x++) {
    for (let z = exitRoom.z - 1; z <= exitRoom.z + exitRoom.d; z++) {
      for (let y = 0; y <= exitRoom.h + 1; y++) {
        const b = world.get(x, y, z);
        if ([Block.Wall, Block.WallRust, Block.WallVent, Block.WallPipes, Block.WallWorn,
          Block.LabWall, Block.LabWallRust, Block.Basalt, Block.Metal].includes(b)) {
          world.set(x, y, z, dhash(x, y, z) < .28 ? Block.ServiceWallRust : Block.ServiceWall);
        } else if (b === Block.Floor || b === Block.LabFloor) world.set(x, y, z, Block.ServiceFloor);
        else if ([Block.Ceil, Block.CeilVent, Block.CeilPipes, Block.CeilPipesZ, Block.LabCeil, Block.LabCeilGrate].includes(b)) world.set(x, y, z, Block.ServiceCeil);
        else if (b === Block.ExitPad || b === Block.LampGreen) {
          // Green identifies the landing, with a short throw instead of a room-wide wash.
          lightOverrides.set(world.index(x, y, z), { color: b === Block.ExitPad ? [60, 200, 90] : [90, 220, 120], range: 3.2 });
          if (b === Block.LampGreen) world.set(x, y, z, Block.ServiceLampGreen);
        }
        else if (b === Block.LampWarm) {
          world.set(x, y, z, Block.ServiceLampWarm);
          lightOverrides.set(world.index(x, y, z), { color: [255, 225, 185], range: 11 });
        }
      }
    }
  }

  // Small amber pools from the two actual boarding lamps on the lift frame.
  if (elevator && exitPad) {
    const fx = elevator.walkAxis === 'x' ? Math.sign(exitPad.x - elevator.x - 1) : 0;
    const fz = elevator.walkAxis === 'z' ? Math.sign(exitPad.z - elevator.z - 1) : 0;
    for (const side of [-1.27, 1.27]) {
      const x = Math.floor(elevator.x + 1 - fx * .1 + fz * side);
      const z = Math.floor(elevator.z + 1 - fz * .1 - fx * side);
      lightOverrides.set(world.index(x, 0, z), { color: [255, 175, 70], range: 3 });
    }
  }
  // -- the starter crate (sector 1 only) --------------------------------------
  // One free-standing crate a couple of steps from the spawn: the first-run
  // tip says crates break, and this one always pays (Game.onVoxelBroken).
  // Picked by fixed offsets — no RNG — on open floor clear of pickups.
  let starterCrate: { x: number; y: number; z: number } | null = null;
  if (theme === 'facility' && difficulty === 1) {
    const sx = spawnRoom.cx, sz = spawnRoom.cz;
    const usedCells = new Set(pickups.map((p) => Math.floor(p.x) + ',' + Math.floor(p.z)));
    const open = (x: number, z: number): boolean => world.get(x, 1, z) === Block.Air && world.get(x, 2, z) === Block.Air && world.isSolid(x, 0, z);
    for (const [ox, oz] of [[2, -2], [-2, -2], [2, 2], [-2, 2], [3, 0], [-3, 0], [0, -3], [0, 3]]) {
      const x = sx + ox, z = sz + oz;
      let free = !usedCells.has(x + ',' + z);
      for (let ax = -1; ax <= 1 && free; ax++) for (let az = -1; az <= 1 && free; az++) if (!open(x + ax, z + az)) free = false;
      if (!free) continue;
      world.set(x, 1, z, Block.Crate);
      starterCrate = { x, y: 1, z };
      break;
    }
  }

  // -- Build 2: rooms with a purpose (Facility sectors 1–3) ------------------
  // Each look's rooms (facility-rooms.ts, after reference/facility-props-v1)
  // dressed against their walls, after everything else and by position hash
  // only: a seed keeps its layout. The Power Link's room keeps its cage alone.
  let architecture: SectorArchitecture | undefined;
  let roomPurposes: Array<{ roomId: number; purpose: RoomPurpose }> | undefined;
  if (look) {
    const avoid = [...pickups, ...enemies, { x: spawnRoom.cx + 0.5, z: spawnRoom.cz + 0.5 },
      ...crackCells.map(([x, , z]) => ({ x, z })), ...(starterCrate ? [starterCrate] : [])];
    const node = powerLink?.node;
    const linkRoom = (r: RoomDef): boolean => !!node && node.x >= r.x - 1 && node.x <= r.x + r.w && node.z >= r.z - 1 && node.z <= r.z + r.d;
    const dressed = dressFacilityRooms(world, rooms, look, dhash, avoid, linkRoom);
    architecture = { boxes: dressed.boxes, signs: [], stairs: [], beds: 0, version: 2 };
    roomPurposes = dressed.purposes;
  }

  // -- bake lights & finish -------------------------------------------------
  world.bakeLighting(isNewTheme(theme) ? ENVIRONMENTS[theme].ambient : isBio ? BIO_AMBIENT : isGeo ? GEO_AMBIENT : undefined, lightOverrides);

  return {
    world,
    spawn: { x: spawnRoom.cx + 0.5, y: 2.05, z: spawnRoom.cz + 0.5 },
    rooms,
    doors,
    pickups,
    enemies,
    elevator,
    exitPad,
    exitSign,
    ledgeRail,
    secretRect,
    secretWall: crackCells.filter(([x, y, z]) => world.get(x, y, z) === Block.Cracked),
    seed,
    // occupied tanks' Vatborn and the boss are preallocated: the game spawns them
    totalEnemies: enemies.length + occupiedTanks + (boss ? 1 : 0),
    totalSecrets: secretRect ? 1 : 0,
    theme,
    bio,
    geo,
    powerLink,
    boss,
    ...(response ? { responseKinds: response.kinds, responseCount: response.count } : {}),
    starterCrate,
    ...(architecture ? { architecture, roomPurposes } : {}),
  };
}

/**
 * The Broodkeeper's spot: centred on an arena wall with no doorway within
 * three cells, its 3.4×3.4 footprint free of pillars and tanks (crates and
 * barrels there are cleared). Prefers the incubator wall when there is one.
 */
function placeBoss(world: VoxelWorld, r: RoomDef, heart: BioLayout['heart']): LevelData['boss'] {
  type Wall = { cx: number; cz: number; yaw: number; along: 'x' | 'z'; out: number };
  const north: Wall = { cx: r.cx + 0.5, cz: r.z + 1.8, yaw: Math.PI, along: 'x', out: r.z - 1 };
  const south: Wall = { cx: r.cx + 0.5, cz: r.z + r.d - 1.8, yaw: 0, along: 'x', out: r.z + r.d };
  const west: Wall = { cx: r.x + 1.8, cz: r.cz + 0.5, yaw: -Math.PI / 2, along: 'z', out: r.x - 1 };
  const east: Wall = { cx: r.x + r.w - 1.8, cz: r.cz + 0.5, yaw: Math.PI / 2, along: 'z', out: r.x + r.w };
  const order: Wall[] = heart ? (heart.dir > 0 ? [north, south] : [south, north]) : [north, south];
  order.push(west, east);
  for (const w of order) {
    // no doorway in the wall behind the cradle
    let solid = true;
    for (let k = -3; k <= 3 && solid; k++) {
      const x = w.along === 'x' ? Math.floor(w.cx) + k : w.out;
      const z = w.along === 'x' ? w.out : Math.floor(w.cz) + k;
      for (let y = 1; y <= 2; y++) if (world.get(x, y, z) === Block.Air) solid = false;
    }
    if (!solid) continue;
    // footprint: nothing structural in the way
    const x0 = Math.floor(w.cx - 1.7), x1 = Math.floor(w.cx + 1.7);
    const z0 = Math.floor(w.cz - 1.7), z1 = Math.floor(w.cz + 1.7);
    let clear = true;
    for (let x = x0; x <= x1 && clear; x++) for (let z = z0; z <= z1 && clear; z++) for (let y = 1; y <= 3; y++) {
      const b = world.get(x, y, z);
      if (b !== Block.Air && b !== Block.Crate && b !== Block.Barrel) { clear = false; break; }
    }
    if (!clear) continue;
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) for (let y = 1; y <= 3; y++) {
      if (world.get(x, y, z) !== Block.Air) world.set(x, y, z, Block.Air);
    }
    return { x: w.cx, z: w.cz, yaw: w.yaw, roomId: r.id };
  }
  return null;
}

type Hash = (x: number, y: number, z: number) => number;

/**
 * Specimen tanks along room walls, which of them hold a Vatborn or are broken
 * open, claimed pillars, puddles, room signs and the incubator mass. Uses
 * only the position hash (never the layout RNG).
 */
function dressBiofoundry(
  world: VoxelWorld, rooms: RoomDef[], pillars: Array<[number, number]>, dhash: Hash, occupiedWant: number,
): BioLayout {
  const air = (x: number, y: number, z: number): boolean => world.get(x, y, z) === Block.Air;
  const tanks: BioLayout['tanks'] = [];
  const tankFits = (x: number, z: number, front: number): boolean => {
    for (let xx = x; xx < x + TANK_W; xx++) for (let zz = z; zz < z + TANK_D; zz++) {
      for (let y = 1; y <= 5; y++) if (!air(xx, y, zz)) return false;
    }
    // backs onto solid wall, so it never plugs a doorway…
    const back = front > 0 ? x - 1 : x + TANK_W;
    for (let zz = z - 1; zz <= z + TANK_D; zz++) for (let y = 1; y <= 3; y++) if (air(back, y, zz)) return false;
    // …and opens onto air: the pane's cell and the occupant's standing spot
    for (const fx of front > 0 ? [x + TANK_W, x + TANK_W + 1] : [x - 1, x - 2]) {
      for (let zz = z; zz < z + TANK_D; zz++) for (let y = 1; y <= 2; y++) if (!air(fx, y, zz)) return false;
    }
    return true;
  };
  for (const r of rooms) {
    if (r.kind === 'spawn' || r.kind === 'exit' || r.h < 5) continue;
    for (const front of [1, -1]) {
      const x = front > 0 ? r.x : r.x + r.w - TANK_W;
      for (let z = r.z + 1; z + TANK_D <= r.z + r.d - 1 && tanks.length < BIO_TANKS_MAX; z += TANK_D + 1) {
        if (dhash(x, 41, z) > 0.55 || !tankFits(x, z, front)) continue;
        for (let xx = x; xx < x + TANK_W; xx++) for (let zz = z; zz < z + TANK_D; zz++) {
          world.set(xx, 1, zz, Block.Metal);
          for (let y = 2; y <= 4; y++) world.set(xx, y, zz, Block.TankGlass);
          world.set(xx, 5, zz, Block.Metal);
        }
        tanks.push({ x, z, broken: false, occupied: false });
      }
    }
  }
  // occupants spread over different rooms first (always leaving one empty
  // tank); a couple of +x-facing empties are broken open (the cracked-pane
  // art faces +x)
  const roomOf = (x: number, z: number): number =>
    rooms.find((r) => x >= r.x && x < r.x + r.w && z >= r.z && z < r.z + r.d)?.id ?? -1;
  const order = [...tanks].sort((a, b) => dhash(a.x, 43, a.z) - dhash(b.x, 43, b.z));
  const want = Math.min(occupiedWant, tanks.length - 1);
  const usedRooms = new Set<number>();
  let occupied = 0;
  for (const pass of [0, 1]) {
    for (const t of order) {
      if (occupied >= want) break;
      if (t.occupied) continue;
      const rid = roomOf(t.x, t.z);
      if (pass === 0 && usedRooms.has(rid)) continue;
      t.occupied = true;
      usedRooms.add(rid);
      occupied++;
    }
  }
  let broken = 0;
  for (const t of order) {
    if (broken >= 2) break;
    if (!t.occupied && air(t.x + TANK_W, 3, t.z)) {
      t.broken = true;
      broken++;
    }
  }
  // claimed pillars grow on the face toward the room centre
  const grown: BioLayout['grown'] = [];
  for (const [px, pz] of pillars) {
    if (dhash(px, 47, pz) > 0.5) continue;
    const r = rooms[roomOf(px, pz)];
    if (r) grown.push([px, pz, px + 1 < r.cx ? 1 : -1, 0]);
  }
  // puddles in the rooms between spawn and exit
  const spills: BioLayout['spills'] = [];
  for (const r of rooms) {
    if (r.kind === 'exit' || r.kind === 'spawn') continue;
    for (let i = 0; i < 2; i++) {
      const x = r.x + 2 + Math.floor(dhash(r.id, 51 + i, 9) * (r.w - 4));
      const z = r.z + 2 + Math.floor(dhash(r.id, 53 + i, 9) * (r.d - 4));
      if (air(x, 1, z)) spills.push([x + 0.5, z + 0.5, 0.6 + dhash(x, 55, z) * 0.4]);
    }
  }
  // a sign on each room's north wall; the spawn room wears BIOFOUNDRY
  const signs: BioLayout['signs'] = [];
  let named = 0;
  for (const r of rooms) {
    const y = Math.min(4.6, r.h - 0.5);
    if (r.kind === 'spawn') {
      signs.push({ text: 'BIOFOUNDRY', x: r.cx + 0.5, y, z: r.z + 0.03, w: 6, big: true });
      continue;
    }
    const text = r.kind === 'key' ? 'SECURITY / RED ACCESS'
      : r.kind === 'arena' ? 'INCUBATION CHAMBER'
      : r.kind === 'exit' ? 'LOWER TRANSIT LIFT'
      : BIO_ROOM_NAMES[named++ % BIO_ROOM_NAMES.length];
    signs.push({ text, x: r.cx + 0.5, y, z: r.z + 0.03, w: 4.4, big: false });
  }
  // the incubator mass: on whichever arena end wall has no doorway behind it
  let heart: BioLayout['heart'] = null;
  const arena = rooms.find((r) => r.kind === 'arena');
  if (arena) {
    const walls: Array<[number, number, number]> = [[arena.z, arena.z - 1, 1], [arena.z + arena.d, arena.z + arena.d, -1]];
    for (const [wallZ, outZ, dir] of walls) {
      let solid = true;
      for (let x = arena.cx - 4; x <= arena.cx + 4 && solid; x++) if (air(x, 1, outZ)) solid = false;
      if (solid) {
        heart = { x: arena.cx + 0.5, z: wallZ, dir };
        break;
      }
    }
  }
  return { tanks, pillars, grown, spills, signs, heart };
}

/** lab tiles over the facility's plain surfaces (vents, pipes, trim, metal stay) */
/**
 * The Geothermal Core's look (after reference/geothermal-in-game-v2.png and the
 * ?sector6 preview): basalt walls with rusted plate between, and molten heat
 * seams set FLUSH in the room floors — short glowing runs along each room's
 * long axis. They light the rooms orange from below and read as lava cracks,
 * but they're solid floor: no trench anything can fall into (the preview's
 * recessed channels stranded walkers). Spawn and exit rooms stay plain.
 */
function dressGeothermal(world: VoxelWorld, rooms: RoomDef[], dhash: Hash): Array<[number, number]> {
  const vents: Array<[number, number]> = [];
  for (let y = 0; y < world.sy; y++) for (let z = 0; z < world.sz; z++) for (let x = 0; x < world.sx; x++) {
    const b = world.get(x, y, z);
    if (b === Block.Wall || b === Block.WallWorn) world.set(x, y, z, dhash(x, y + 40, z) < 0.7 ? Block.Basalt : Block.WallRust);
  }
  for (const r of rooms) {
    if (r.kind === 'spawn' || r.kind === 'exit') continue;
    const alongX = r.w >= r.d;
    const len = alongX ? r.w : r.d;
    // one seam down the middle; big rooms get a second, offset one
    const lines = alongX ? [r.cz] : [r.cx];
    if ((alongX ? r.d : r.w) >= 11) lines.push((alongX ? r.cz : r.cx) + 3);
    lines.forEach((c, li) => {
      // 3-cell runs with gaps, starting at a hashed offset
      const start = 2 + Math.floor(dhash(r.id, li, 812) * 3);
      for (let a = start; a < len - 2; a++) {
        if ((a - start) % 5 >= 3) continue;
        const x = alongX ? r.x + a : c, z = alongX ? c : r.z + a;
        // only open floor (never under a pillar, crate or barrel)
        if (world.get(x, 0, z) !== Block.Floor || world.get(x, 1, z) !== Block.Air) continue;
        world.set(x, 0, z, Block.GeothermalHeat);
        // some runs vent steam from their first cell
        if ((a - start) % 5 === 0 && vents.length < 14 && dhash(x, 3, z) < 0.5) vents.push([x, z]);
      }
    });
  }
  return vents;
}

const PLAIN_WALLS: number[] = [Block.Wall, Block.WallRust, Block.WallWorn, Block.WallVent, Block.WallPipes, Block.FreightWall, Block.ExcavationWall, Block.MedicalWall, Block.MedicalWallLower, Block.FreightCargo];

/** a room's four walls: origin at the a = 0 corner of the face, u along it, n into the room */
function roomWalls(r: RoomDef): Array<{ ox: number; oz: number; ux: number; uz: number; nx: number; nz: number; len: number; deep: number }> {
  return [
    { ox: r.x, oz: r.z, ux: 1, uz: 0, nx: 0, nz: 1, len: r.w, deep: r.d },
    { ox: r.x, oz: r.z + r.d, ux: 1, uz: 0, nx: 0, nz: -1, len: r.w, deep: r.d },
    { ox: r.x, oz: r.z, ux: 0, uz: 1, nx: 1, nz: 0, len: r.d, deep: r.w },
    { ox: r.x + r.w, oz: r.z, ux: 0, uz: 1, nx: -1, nz: 0, len: r.d, deep: r.w },
  ];
}

/**
 * Distance around a room's wall faces (clockwise from the x0/z0 corner) of a
 * point on a face with inward normal (nx, nz). The Power Link cable follows it.
 */
export function wallPerimeter(room: { x0: number; z0: number; x1: number; z1: number }, fx: number, fz: number, nx: number, nz: number): number {
  const W = room.x1 - room.x0, D = room.z1 - room.z0;
  if (nz > 0) return fx - room.x0;
  if (nx < 0) return W + fz - room.z0;
  if (nz < 0) return W + D + room.x1 - fx;
  return 2 * W + D + room.z1 - fz;
}

/**
 * The Power Link: a 5×2 supply cage against a doorway-free wall of a normal
 * room (never spawn, key, exit, arena or the boss chamber), its grille facing
 * clear floor, and a node in the same room's wall at least 6 cells of wall
 * away — the amber cable between them is the clue. Position-hashed only.
 */
function placePowerLink(world: VoxelWorld, rooms: RoomDef[], dhash: Hash, bossRoom: number, taken: Set<number>): PowerLinkLayout | null {
  const cands = rooms
    .filter((r) => r.kind === 'normal' && r.dist >= 1 && r.id !== bossRoom)
    .sort((a, b) => (b.dist >= 2 ? 1 : 0) - (a.dist >= 2 ? 1 : 0) || dhash(a.id, 5, 77) - dhash(b.id, 5, 77));
  const air = (x: number, y: number, z: number): boolean => world.get(x, y, z) === Block.Air;
  for (const r of cands) {
    const walls = roomWalls(r);
    const room = { x0: r.x, z0: r.z, x1: r.x + r.w, z1: r.z + r.d };
    const P = 2 * (r.w + r.d);
    const w0 = Math.floor(dhash(r.id, 6, 78) * 4);
    for (let k = 0; k < 4; k++) {
      const w = walls[(w0 + k) % 4];
      if (w.len < 9 || w.deep < 6) continue;
      const span = w.len - 6;
      const o0 = Math.floor(dhash(r.id, 7 + k, 79) * span);
      for (let j = 0; j < span; j++) {
        const a0 = 1 + ((o0 + j) % span);
        const cage = { ox: w.ox + w.ux * a0, oz: w.oz + w.uz * a0, ux: w.ux, uz: w.uz, nx: w.nx, nz: w.nz };
        const cell = (a: number, t: number): [number, number] => [
          Math.floor(cage.ox + w.ux * (a + 0.5) + w.nx * (t + 0.5)),
          Math.floor(cage.oz + w.uz * (a + 0.5) + w.nz * (t + 0.5)),
        ];
        let ok = true;
        // the footprint is open air, the wall behind has no doorway, the grille faces clear floor
        for (let a = -1; a <= 5 && ok; a++) for (let t = -1; t <= 2 && ok; t++) {
          const [x, z] = cell(a, t);
          // (never over the secret room's cracked wall: the cage would hide it)
          if (t === -1) { for (let y = 1; y <= 3; y++) if (air(x, y, z) || world.get(x, y, z) === Block.Cracked) ok = false; }
          else if (t <= 1 && a >= 0 && a <= 4) {
            for (let y = 1; y <= 4; y++) if (!air(x, y, z)) ok = false;
            if (taken.has(x + z * world.sx)) ok = false; // a pickup or enemy stands there
          }
          else if (t === 2 && a >= 1 && a <= 3) { for (let y = 1; y <= 2; y++) if (!air(x, y, z)) ok = false; }
        }
        // and it reads from across the room: no hanging lamp, pipe column or
        // crate in the three rows in front of it
        for (let a = 0; a <= 4 && ok; a++) for (let t = 2; t <= 4 && ok; t++) {
          const [x, z] = cell(a, t);
          for (let y = 1; y <= 3; y++) if (!air(x, y, z)) ok = false;
        }
        if (!ok) continue;
        // the node: a plain wall voxel at eye height, open air in front of it
        const sCage = wallPerimeter(room, cage.ox + w.ux * 2.5, cage.oz + w.uz * 2.5, w.nx, w.nz);
        let node: { x: number; y: number; z: number; nx: number; nz: number } | null = null;
        let best = -1;
        for (const v of walls) {
          for (let a = 1; a < v.len - 1; a++) {
            const x = Math.floor(v.ox + v.ux * (a + 0.5) - v.nx * 0.5), z = Math.floor(v.oz + v.uz * (a + 0.5) - v.nz * 0.5);
            if (!PLAIN_WALLS.includes(world.get(x, 2, z)) || air(x, 1, z) || air(x, 3, z)) continue;
            if (!air(x + v.nx, 1, z + v.nz) || !air(x + v.nx, 2, z + v.nz)) continue;
            const s = wallPerimeter(room, x + 0.5 + v.nx * 0.5, z + 0.5 + v.nz * 0.5, v.nx, v.nz);
            const gap = Math.min(Math.abs(s - sCage), P - Math.abs(s - sCage));
            if (gap < 6) continue;
            // prefer another wall: the cable has to turn a corner to be followed
            const score = dhash(x, 2, z) + (v === w ? 0 : 1);
            if (score > best) { best = score; node = { x, y: 2, z, nx: v.nx, nz: v.nz }; }
          }
        }
        if (!node) continue;
        // build: steel plate floor, Metal sides + roof, the back row open for
        // the supplies, the front row an invisible PowerBarrier grille
        for (let a = 0; a <= 4; a++) for (let t = 0; t <= 1; t++) {
          const [x, z] = cell(a, t);
          world.set(x, 0, z, Block.Metal);
          for (let y = 1; y <= 3; y++) {
            if (a === 0 || a === 4) world.set(x, y, z, Block.Metal);
            else if (t === 1) world.set(x, y, z, Block.PowerBarrier);
          }
          world.set(x, 4, z, Block.Metal);
        }
        world.set(node.x, node.y, node.z, Block.LampWarm);
        // under the ceiling: facility rooms can be 4 tall (the cable then meets the cage roof's side)
        return { node, cage, room, cableY: Math.min(5.45, r.h + 0.45) };
      }
    }
  }
  return null;
}

/** the core's name over the spawn room's first doorway-free wall */
function geoSigns(world: VoxelWorld, r: RoomDef): GeoLayout['signs'] {
  for (const w of roomWalls(r)) {
    const c = Math.floor(w.len / 2);
    let solid = true;
    for (let a = c - 2; a <= c + 1 && solid; a++) {
      const x = Math.floor(w.ox + w.ux * (a + 0.5) - w.nx * 0.5), z = Math.floor(w.oz + w.uz * (a + 0.5) - w.nz * 0.5);
      for (let y = 1; y <= 4; y++) if (!world.isSolid(x, y, z)) solid = false;
    }
    if (!solid) continue;
    return [{
      text: 'GEOTHERMAL CORE', w: 3.4, y: 3.3,
      x: w.ox + w.ux * c + w.nx * 0.03, z: w.oz + w.uz * c + w.nz * 0.03,
      ry: Math.atan2(w.nx, w.nz),
    }];
  }
  return [];
}

function reskinLab(world: VoxelWorld, dhash: Hash): void {
  for (let y = 0; y < world.sy; y++) for (let z = 0; z < world.sz; z++) for (let x = 0; x < world.sx; x++) {
    switch (world.get(x, y, z)) {
      case Block.Floor: world.set(x, y, z, Block.LabFloor); break;
      case Block.Ceil:
      case Block.CeilPipes:
      case Block.CeilPipesZ: world.set(x, y, z, dhash(x, y + 60, z) < 0.06 ? Block.LabCeilGrate : Block.LabCeil); break;
      case Block.CeilVent: world.set(x, y, z, Block.LabCeilGrate); break;
      case Block.Wall:
      case Block.WallWorn: world.set(x, y, z, Block.LabWall); break;
      case Block.WallRust: world.set(x, y, z, Block.LabWallRust); break;
    }
  }
}

/**
 * Walkability check: the red key must be reachable without passing the locked
 * door, and the exit elevator must be reachable at all. BFS over floor columns
 * (doors are entities, so their cells read as air).
 */
export function validateLevel(data: LevelData): boolean {
  const { world, doors, pickups, elevator, spawn } = data;
  const lockedDoor = doors.find((d) => d.locked !== null);
  if (!lockedDoor) return false;
  if (!elevator) return false;
  const key = pickups.find((p) => p.kind === 'keyRed');
  if (!key) return false;

  const lockedCells = new Set<number>();
  for (const d of doors) {
    if (!d.locked) continue;
    lockedCells.add(d.x + d.z * world.sx);
    if (d.dir === 'x') lockedCells.add(d.x + (d.z + 1) * world.sx);
    else lockedCells.add(d.x + 1 + d.z * world.sx);
  }

  const groundY = (x: number, z: number): number | null => {
    for (let y = 1; y <= 6; y++) {
      if (
        world.get(x, y, z) === Block.Air &&
        world.get(x, y + 1, z) === Block.Air &&
        world.isSolid(x, y - 1, z)
      ) {
        return y;
      }
    }
    return null;
  };

  const bfs = (blockLocked: boolean): Set<number> => {
    const visited = new Set<number>();
    const sx = Math.floor(spawn.x);
    const sz = Math.floor(spawn.z);
    const startG = groundY(sx, sz);
    if (startG === null) return visited;
    const queue: number[] = [sx, sz, startG];
    visited.add(sx + sz * world.sx);
    let head = 0;
    while (head < queue.length) {
      const x = queue[head], z = queue[head + 1], g = queue[head + 2];
      head += 3;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx2 = x + dx, nz2 = z + dz;
        const idx = nx2 + nz2 * world.sx;
        if (visited.has(idx)) continue;
        if (blockLocked && lockedCells.has(idx)) continue;
        const ng = groundY(nx2, nz2);
        if (ng === null || Math.abs(ng - g) > 1) continue;
        visited.add(idx);
        queue.push(nx2, nz2, ng);
      }
    }
    return visited;
  };

  const noLock = bfs(true);
  const keyIdx = Math.floor(key.x) + Math.floor(key.z) * world.sx;
  if (!noLock.has(keyIdx)) return false;

  const withKey = bfs(false);
  const elevIdx = elevator.x + elevator.z * world.sx;
  if (!withKey.has(elevIdx)) return false;

  return true;
}
