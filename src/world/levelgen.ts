import { VoxelWorld } from './world';
import { Block } from './blocks';
import { RNG } from '../core/rng';
import {
  DoorSpec, ElevatorSpec, EnemySpec, PickupSpec, Rect, RoomDef,
} from '../types';

export interface LevelData {
  world: VoxelWorld;
  spawn: { x: number; y: number; z: number };
  rooms: RoomDef[];
  doors: DoorSpec[];
  pickups: PickupSpec[];
  enemies: EnemySpec[];
  elevator: ElevatorSpec | null;
  secretRect: Rect | null;
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
 */
export function generateLevel(seed: number, difficulty = 1): LevelData {
  for (let attempt = 0; attempt < 10; attempt++) {
    const s = (seed + attempt * 7919) >>> 0;
    const data = generateLevelOnce(s, difficulty);
    if (validateLevel(data)) {
      if (attempt > 0) console.warn(`[levelgen] used fallback seed ${s} after ${attempt} invalid layouts`);
      return data;
    }
  }
  console.error('[levelgen] no valid layout found, returning last attempt');
  return generateLevelOnce(seed, difficulty);
}

function generateLevelOnce(seed: number, difficulty: number): LevelData {
  const rng = new RNG(seed);
  const world = new VoxelWorld(WORLD_X, WORLD_Y, WORLD_Z);
  const pickups: PickupSpec[] = [];
  const enemies: EnemySpec[] = [];
  const doors: DoorSpec[] = [];

  // -- place rooms ----------------------------------------------------------
  const rooms: RoomDef[] = [];
  const targetRooms = rng.int(10, 12) + Math.min(2, difficulty - 1);
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
      id: rooms.length, x, z, w, d, h: rng.int(4, 5),
      cx: x + Math.floor(w / 2), cz: z + Math.floor(d / 2),
      kind: 'normal', dist: 0,
    });
  }

  // -- pick spawn + exit ----------------------------------------------------
  const spawnRoom = rooms[0];
  spawnRoom.kind = 'spawn';
  let exitRoom = rooms[1];
  let best = -1;
  for (const r of rooms) {
    if (r === spawnRoom) continue;
    const dd = (r.cx - spawnRoom.cx) ** 2 + (r.cz - spawnRoom.cz) ** 2;
    if (dd > best) {
      best = dd;
      exitRoom = r;
    }
  }
  exitRoom.kind = 'exit';
  exitRoom.h = 6;

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
  let elevator: ElevatorSpec | null = null;
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
      padCZ = ledgeSide === 'zmax' ? r.z + r.d - 2 : r.z + 1;
      elevX = r.cx - 1;
      elevZ = ledgeSide === 'zmax' ? z0 - 2 : z0 + depth;
    } else {
      const x0 = ledgeSide === 'xmax' ? r.x + r.w - depth : r.x;
      for (let z = r.z; z < r.z + r.d; z++) {
        for (let x = x0; x < x0 + depth; x++) ledgeCells.push([x, z]);
      }
      padCX = ledgeSide === 'xmax' ? r.x + r.w - 2 : r.x + 1;
      padCZ = r.cz;
      elevX = ledgeSide === 'xmax' ? x0 - 2 : x0 + depth;
      elevZ = r.cz - 1;
    }
    for (const [x, z] of ledgeCells) {
      for (let y = 1; y <= 3; y++) world.set(x, y, z, Block.Metal);
    }
    // exit pad blocks (their top faces glow green + emit light)
    for (let dx = -1; dx <= 0; dx++) {
      for (let dz = -1; dz <= 0; dz++) {
        world.set(padCX + dx, 3, padCZ + dz, Block.ExitPad);
      }
    }
    elevator = { x: elevX, z: elevZ, lowY: 1, highY: 4 };
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

  // -- crack the secret wall (after paint so it isn't overwritten) ----------
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
    if (r.kind === 'key') lamp = Block.LampRed;
    else if (r.kind === 'exit') lamp = Block.LampTeal;
    else lamp = rng.chance(0.28) ? Block.LampTeal : rng.chance(0.14) ? Block.LampRed : Block.LampWarm;
    for (let x = r.x + 2; x < r.x + r.w - 1; x += 4) {
      for (let z = r.z + 2; z < r.z + r.d - 1; z += 4) {
        if (world.isSolid(x, r.h + 1, z)) world.set(x, r.h + 1, z, lamp);
      }
    }
    if (r.kind === 'exit') {
      // green glow over the ledge
      for (const [x, z] of ledgeCells) {
        if ((x + z) % 3 === 0 && world.isSolid(x, r.h + 1, z)) world.set(x, r.h + 1, z, Block.LampGreen);
      }
    }
  }
  // corridor lamps: sparse, warm
  for (const e of edges) {
    for (let i = 3; i < e.stations.length; i += 6) {
      const s = e.stations[i];
      if (world.isSolid(s.x, CORRIDOR_H + 1, s.z) && world.get(s.x, CORRIDOR_H + 1, s.z) === Block.Ceil) {
        world.set(s.x, CORRIDOR_H + 1, s.z, Block.LampWarm);
      }
    }
  }
  if (secretRect) {
    world.set(secretRect.x + 2, 4, secretRect.z + 2, Block.LampRed);
  }

  // -- pillars in large rooms ----------------------------------------------
  for (const r of rooms) {
    if (r.kind === 'exit' || r.w < 11 || r.d < 11) continue;
    for (const [px, pz] of [
      [r.x + 3, r.z + 3], [r.x + r.w - 4, r.z + 3],
      [r.x + 3, r.z + r.d - 4], [r.x + r.w - 4, r.z + r.d - 4],
    ]) {
      for (let y = 1; y <= r.h; y++) world.set(px, y, pz, Block.Pillar);
      world.set(px, 2, pz, Block.LampWarm);
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

  // -- pickups --------------------------------------------------------------
  const freeSpot = (r: RoomDef): [number, number] => {
    for (let tries = 0; tries < 20; tries++) {
      const x = rng.int(r.x + 1, r.x + r.w - 2);
      const z = rng.int(r.z + 1, r.z + r.d - 2);
      if (world.get(x, 1, z) === Block.Air) return [x + 0.5, z + 0.5];
    }
    return [r.cx + 0.5, r.cz + 0.5];
  };

  // key
  {
    const [x, z] = freeSpot(keyRoom);
    pickups.push({ kind: 'keyRed', x, y: 1.5, z });
    const [hx, hz] = freeSpot(keyRoom);
    pickups.push({ kind: 'healthBig', x: hx, y: 1.4, z: hz });
  }
  // weapons: shotgun in the first room out of spawn, SMG midway
  const byDist = [...rooms].sort((a, b) => a.dist - b.dist);
  const shotgunRoom = byDist.find((r) => r.dist >= 1 && r.kind !== 'exit') ?? spawnRoom;
  {
    const [x, z] = freeSpot(shotgunRoom);
    pickups.push({ kind: 'weaponShotgun', x, y: 1.4, z });
  }
  const midRooms = rooms.filter((r) => r.kind === 'normal' && r.dist >= 2 && r !== shotgunRoom);
  if (midRooms.length) {
    const [x, z] = freeSpot(rng.pick(midRooms));
    pickups.push({ kind: 'weaponSMG', x, y: 1.4, z });
  }
  // rocket launcher + goodies in the secret room (or key room fallback)
  if (secretRect) {
    pickups.push(
      { kind: 'weaponRocket', x: secretRect.x + 2.5, y: 1.4, z: secretRect.z + 2.5 },
      { kind: 'armorVest', x: secretRect.x + 1.5, y: 1.4, z: secretRect.z + 3.5 },
      { kind: 'ammoRockets', x: secretRect.x + 3.5, y: 1.4, z: secretRect.z + 1.5 }
    );
  } else {
    const [x, z] = freeSpot(keyRoom);
    pickups.push({ kind: 'weaponRocket', x, y: 1.4, z });
  }
  // scattered supplies
  const supplyTable: Array<[PickupSpec['kind'], number]> = [
    ['ammoBullets', 0.28], ['ammoShells', 0.26], ['healthSmall', 0.2],
    ['armorShard', 0.14], ['healthBig', 0.06], ['ammoRockets', 0.06],
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
  for (const r of rooms) {
    if (r.kind === 'spawn') continue;
    let count: number;
    if (r.dist <= 1) count = rng.int(1, 2);
    else if (r.dist === 2) count = 2;
    else count = rng.int(2, 3);
    if (r.kind === 'key' || r.kind === 'exit') count += 1;
    // later sectors push harder
    if (difficulty >= 2 && r.dist >= 2) count += 1;
    if (difficulty >= 3 && r.kind !== 'normal') count += 1;
    for (let i = 0; i < count; i++) {
      // farther rooms and later sectors skew ranged
      const rangedP = Math.min(0.75, (r.dist >= 2 ? 0.5 : 0.25) + (difficulty - 1) * 0.08);
      const ranged = rng.chance(rangedP);
      const [x, z] = freeSpot(r);
      enemies.push({ kind: ranged ? 'sentinel' : 'husk', x, z, roomId: r.id });
    }
  }

  // -- bake lights & finish -------------------------------------------------
  world.bakeLighting();

  return {
    world,
    spawn: { x: spawnRoom.cx + 0.5, y: 2.05, z: spawnRoom.cz + 0.5 },
    rooms,
    doors,
    pickups,
    enemies,
    elevator,
    secretRect,
    seed,
    totalEnemies: enemies.length,
    totalSecrets: secretRect ? 1 : 0,
  };
}

/**
 * Walkability check: the red key must be reachable without passing the locked
 * door, and the exit elevator must be reachable at all. BFS over floor columns
 * (doors are entities, so their cells read as air).
 */
function validateLevel(data: LevelData): boolean {
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
