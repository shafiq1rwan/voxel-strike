import { Block } from '../world/blocks';
import type { VoxelWorld } from '../world/world';

/**
 * Voxel occlusion test for small dynamic objects (enemy rigs, pickups).
 *
 * Every enemy part and pickup piece is its own draw call, and three.js only
 * frustum-culls: a rig behind two walls still costs ~16 draws. On a phone
 * that submission work, not the AI, is what breaks 60 fps, so objects with no
 * line of sight from the eye are hidden before the render.
 *
 * A few rays per object (centre, top, bottom, both sides) walk the voxel grid
 * from the eye; the first clear ray means "visible". Rays stop at the first
 * opaque voxel, so a hidden object costs only a handful of steps per ray.
 * Callers keep the object shown for a short hold after the last clear ray, so
 * nothing flickers at a doorway edge.
 */

/** see-through blocks: everything else is drawn as an opaque cube */
function opaque(b: Block): boolean {
  return b !== Block.Air && b !== Block.TankGlass && b !== Block.PowerBarrier;
}

/**
 * True if no opaque voxel lies strictly between the two points (the voxels
 * holding the eye and the target are not tested).
 */
export function clearSight(
  world: VoxelWorld,
  ox: number, oy: number, oz: number,
  tx: number, ty: number, tz: number,
): boolean {
  let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
  const ex = Math.floor(tx), ey = Math.floor(ty), ez = Math.floor(tz);
  // grid steps from the eye's voxel to the target's: the walk ends there
  let steps = Math.abs(ex - x) + Math.abs(ey - y) + Math.abs(ez - z);
  if (steps <= 1) return true;
  const dx = tx - ox, dy = ty - oy, dz = tz - oz;
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tdX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
  const tdY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
  const tdZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
  let tmX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tdX : Infinity;
  let tmY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tdY : Infinity;
  let tmZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tdZ : Infinity;
  while (--steps > 0) {
    if (tmX < tmY && tmX < tmZ) { x += stepX; tmX += tdX; }
    else if (tmY < tmZ) { y += stepY; tmY += tdY; }
    else { z += stepZ; tmZ += tdZ; }
    if (opaque(world.get(x, y, z))) return false;
  }
  return true;
}

/** shown this long after the last clear ray (seconds) */
export const SEEN_HOLD = 0.3;

/**
 * Can the eye see any part of a box centred at (x, y, z) with horizontal
 * half-width hx and half-height hy? Beyond `maxDist` (where fog is total) the
 * answer is no; very close, always yes.
 */
export function seenFrom(
  world: VoxelWorld,
  eyeX: number, eyeY: number, eyeZ: number,
  x: number, y: number, z: number,
  hx: number, hy: number,
  maxDist: number,
): boolean {
  const dx = x - eyeX, dy = y - eyeY, dz = z - eyeZ;
  const d2 = dx * dx + dy * dy + dz * dz;
  const reach = maxDist + hx + hy;
  if (d2 > reach * reach) return false;
  if (d2 < 9) return true;
  if (clearSight(world, eyeX, eyeY, eyeZ, x, y, z)) return true;
  if (clearSight(world, eyeX, eyeY, eyeZ, x, y + hy * 0.85, z)) return true;
  if (clearSight(world, eyeX, eyeY, eyeZ, x, y - hy * 0.7, z)) return true;
  // the box's left and right edges as seen from the eye
  const h = Math.sqrt(dx * dx + dz * dz) || 1;
  const px = (-dz / h) * hx * 0.9, pz = (dx / h) * hx * 0.9;
  if (clearSight(world, eyeX, eyeY, eyeZ, x + px, y, z + pz)) return true;
  return clearSight(world, eyeX, eyeY, eyeZ, x - px, y, z - pz);
}
