import type { Game } from '../game';

/**
 * Touch-only aim assist target picking, shared by bullet magnetism
 * (weapons.ts), sticky aim and rotation assist (player.ts).
 *
 * Each enemy's cone is the angle its body half-width + `margin` subtends from
 * the shooter, clamped to [min, max] radians — so a close husk forgives a
 * wider miss than a distant one, but never more than `max`.
 */
export interface AimCone {
  margin: number;
  min: number;
  max: number;
  maxDist: number;
}

export interface AimTarget {
  /** aim point: the enemy column at the height the ray passes, clamped into the body */
  x: number;
  y: number;
  z: number;
  /** angle between the aim direction and the aim point */
  angle: number;
  /** angle / cone: 0 = dead center, 1 = cone edge */
  score: number;
}

const result: AimTarget = { x: 0, y: 0, z: 0, angle: 0, score: 0 };

/**
 * Best live, visible enemy inside `cone` of the (unit) direction f, or null.
 * The returned object is reused between calls — copy what you need.
 */
export function findAimTarget(
  game: Game,
  ox: number, oy: number, oz: number,
  fx: number, fy: number, fz: number,
  cone: AimCone,
): AimTarget | null {
  const hFwd = Math.hypot(fx, fz);
  if (hFwd < 0.05) return null; // aiming almost straight up/down
  let bestScore = 1;
  let found = false;
  for (const e of game.enemies.list) {
    if (!e.alive) continue;
    const dx = e.pos.x - ox;
    const dz = e.pos.z - oz;
    const hDist = Math.hypot(dx, dz);
    if (hDist > cone.maxDist || hDist < 1) continue;
    // vertical error is measured against the body span, never the center:
    // aiming level at a torso costs 0 vertical error (center-based cones
    // silently never fire at close range)
    const rayY = oy + (fy / hFwd) * hDist;
    const ty = Math.max(e.pos.y - e.half.y + 0.15, Math.min(e.pos.y + e.half.y - 0.1, rayY));
    const dy = ty - oy;
    const dist = Math.sqrt(hDist * hDist + dy * dy);
    const angle = Math.acos(Math.min(1, (dx * fx + dy * fy + dz * fz) / dist));
    const limit = Math.max(cone.min, Math.min(cone.max, Math.atan((e.half.x + cone.margin) / hDist)));
    const score = angle / limit;
    if (score >= bestScore) continue;
    if (!game.hasLOS(ox, oy, oz, e.pos.x, ty, e.pos.z)) continue;
    bestScore = score;
    found = true;
    result.x = e.pos.x;
    result.y = ty;
    result.z = e.pos.z;
    result.angle = angle;
    result.score = score;
  }
  return found ? result : null;
}
