import { VoxelWorld } from '../world/world';

export interface Box {
  minX: number; minY: number; minZ: number;
  maxX: number; maxY: number; maxZ: number;
}

export interface Vec3Like { x: number; y: number; z: number }

export interface MoveResult {
  onGround: boolean;
  hitX: boolean;
  hitY: boolean;
  hitZ: boolean;
}

const EPS = 0.001;

function overlapsBox(
  px: number, py: number, pz: number,
  hx: number, hy: number, hz: number,
  b: Box
): boolean {
  return (
    px + hx > b.minX && px - hx < b.maxX &&
    py + hy > b.minY && py - hy < b.maxY &&
    pz + hz > b.minZ && pz - hz < b.maxZ
  );
}

/**
 * Move an AABB body (center pos, half extents) through the voxel world,
 * resolving collisions axis by axis. extraBoxes are dynamic solids (doors,
 * elevator platforms).
 */
export function moveBody(
  world: VoxelWorld,
  pos: Vec3Like,
  half: Vec3Like,
  vel: Vec3Like,
  dt: number,
  extraBoxes: Box[]
): MoveResult {
  const res: MoveResult = { onGround: false, hitX: false, hitY: false, hitZ: false };
  moveAxis(world, pos, half, vel, dt, extraBoxes, 'x', res);
  moveAxis(world, pos, half, vel, dt, extraBoxes, 'z', res);
  moveAxis(world, pos, half, vel, dt, extraBoxes, 'y', res);
  return res;
}

function moveAxis(
  world: VoxelWorld,
  pos: Vec3Like,
  half: Vec3Like,
  vel: Vec3Like,
  dt: number,
  extraBoxes: Box[],
  axis: 'x' | 'y' | 'z',
  res: MoveResult
): void {
  const delta = vel[axis] * dt;
  if (delta === 0) return;
  pos[axis] += delta;

  const resolve = (boxMin: number, boxMax: number): void => {
    if (delta > 0) pos[axis] = boxMin - half[axis] - EPS;
    else pos[axis] = boxMax + half[axis] + EPS;
    if (axis === 'y' && delta < 0) res.onGround = true;
    if (axis === 'x') res.hitX = true;
    else if (axis === 'y') res.hitY = true;
    else res.hitZ = true;
    vel[axis] = 0;
  };

  // voxel collisions — iterate a few times since clamping can slide the box range.
  // Only resolve penetration that THIS move caused: a body already embedded in
  // solid (e.g. shoved there by an external force) must not get teleported a
  // whole block per frame by face-snapping against pre-existing overlaps.
  const maxPen = Math.abs(delta) + 0.002;
  for (let iter = 0; iter < 3; iter++) {
    const minX = Math.floor(pos.x - half.x);
    const maxX = Math.floor(pos.x + half.x);
    const minY = Math.floor(pos.y - half.y);
    const maxY = Math.floor(pos.y + half.y);
    const minZ = Math.floor(pos.z - half.z);
    const maxZ = Math.floor(pos.z + half.z);
    let collided = false;
    for (let y = minY; y <= maxY && !collided; y++) {
      for (let z = minZ; z <= maxZ && !collided; z++) {
        for (let x = minX; x <= maxX && !collided; x++) {
          if (!world.isSolid(x, y, z)) continue;
          const boxMin = axis === 'x' ? x : axis === 'y' ? y : z;
          const pen = delta > 0
            ? pos[axis] + half[axis] - boxMin
            : boxMin + 1 - (pos[axis] - half[axis]);
          if (pen > maxPen) continue; // pre-existing embed, not this move's doing
          resolve(boxMin, boxMin + 1);
          collided = true;
        }
      }
    }
    if (!collided) break;
  }

  // dynamic boxes
  for (const b of extraBoxes) {
    if (overlapsBox(pos.x, pos.y, pos.z, half.x, half.y, half.z, b)) {
      const boxMin = axis === 'x' ? b.minX : axis === 'y' ? b.minY : b.minZ;
      const boxMax = axis === 'x' ? b.maxX : axis === 'y' ? b.maxY : b.maxZ;
      resolve(boxMin, boxMax);
    }
  }
}

/** Ray vs AABB (slab method). Returns entry distance t, or null if no hit within maxT. */
export function rayBox(
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  maxT: number,
  b: Box
): number | null {
  let tmin = 0;
  let tmax = maxT;
  const axes: Array<[number, number, number, number]> = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, mn, mx] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin <= maxT ? tmin : null;
}

export function aabbOverlap(
  ax: number, ay: number, az: number, ahx: number, ahy: number, ahz: number,
  bx: number, by: number, bz: number, bhx: number, bhy: number, bhz: number
): boolean {
  return (
    Math.abs(ax - bx) < ahx + bhx &&
    Math.abs(ay - by) < ahy + bhy &&
    Math.abs(az - bz) < ahz + bhz
  );
}
