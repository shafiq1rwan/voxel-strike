import { Block } from '../world/blocks';
import type { VoxelWorld } from '../world/world';

/**
 * The objective arrow's ROUTE: where to walk next to reach a target, instead
 * of the straight line to it. The keycard sits in the deepest room, so the
 * straight line usually pointed into a wall — and in the 0.3.22 Player Fit
 * Test 35–54% of the players who started a sector left it before the keycard,
 * most of them alive (sector 1: 427 started, 279 reached it, 22 died).
 *
 * A walking-distance field is flooded out from the target over the floor
 * columns (the same ground rule as levelgen's `validateLevel`; crates and
 * barrels count as open, they break; the cracked secret wall does not), then the arrow aims at the furthest
 * cell down that field the player can walk straight to — the next doorway or
 * corner. Plain data, no allocations per frame.
 */

/** cells a locked door blocks: its two floor columns */
export interface RouteDoor {
  x: number;
  z: number;
  dir: 'x' | 'z';
}

export interface RouteStep {
  /** where the arrow should point (world x / z) */
  x: number;
  z: number;
  /** walking distance left to the target, in world units */
  dist: number;
}

const SQRT2 = Math.SQRT2;
/** how far down the field the arrow may look for its aim point (cells) */
const LOOK_AHEAD = 18;
/** half the body's width + a little: the straight walk must clear this either side */
const CLEARANCE = 0.32;

export class RouteGuide {
  private sx = 0;
  private sz = 0;
  /** walking distance to the target per column; Infinity = can't walk there */
  private dist = new Float32Array(0);
  private ground = new Int8Array(0);
  private heap: number[] = [];
  private ready = false;
  private readonly step: RouteStep = { x: 0, z: 0, dist: 0 };

  /** forget the field (new level / new target) */
  clear(): void {
    this.ready = false;
  }

  get hasField(): boolean {
    return this.ready;
  }

  /**
   * Flood the walking distance out from (tx, tz). `blocked` doors (still
   * locked, no key) are walls — except one the target itself stands in.
   */
  build(world: VoxelWorld, tx: number, tz: number, blocked: readonly RouteDoor[]): boolean {
    const sx = world.sx;
    const sz = world.sz;
    const n = sx * sz;
    if (this.dist.length !== n) {
      this.dist = new Float32Array(n);
      this.ground = new Int8Array(n);
    }
    this.sx = sx;
    this.sz = sz;
    const dist = this.dist;
    const ground = this.ground;
    dist.fill(Infinity);
    for (let z = 0; z < sz; z++) {
      for (let x = 0; x < sx; x++) ground[x + z * sx] = groundY(world, x, z);
    }
    let cx = Math.floor(tx);
    let cz = Math.floor(tz);
    // a target inside something solid (the wall-mounted boss): the nearest floor
    if (!this.inside(cx, cz) || ground[cx + cz * sx] < 0) {
      const near = this.nearestGround(tx, tz, 4);
      if (near < 0) {
        this.ready = false;
        return false;
      }
      cx = near % sx;
      cz = (near - cx) / sx;
    }
    const start = cx + cz * sx;
    for (const d of blocked) {
      const a = d.x + d.z * sx;
      const b = d.dir === 'x' ? d.x + (d.z + 1) * sx : d.x + 1 + d.z * sx;
      if (a !== start && b !== start) {
        if (a >= 0 && a < n) ground[a] = -1;
        if (b >= 0 && b < n) ground[b] = -1;
      } else {
        // the target IS this door: flood from both of its cells
        if (a >= 0 && a < n && ground[a] >= 0) dist[a] = 0;
        if (b >= 0 && b < n && ground[b] >= 0) dist[b] = 0;
      }
    }
    // Dijkstra over 8 neighbours (a diagonal needs both of its sides open)
    const heap = this.heap;
    heap.length = 0;
    dist[start] = 0;
    for (let i = 0; i < n; i++) if (dist[i] === 0) this.push(i);
    while (heap.length) {
      const i = this.pop();
      const di = dist[i];
      const x = i % sx;
      const z = (i - x) / sx;
      const g = ground[i];
      for (let k = 0; k < 8; k++) {
        const dx = NX[k];
        const dz = NZ[k];
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= sx || nz >= sz) continue;
        const j = nx + nz * sx;
        const gj = ground[j];
        if (gj < 0 || Math.abs(gj - g) > 1) continue;
        if (dx !== 0 && dz !== 0) {
          const ga = ground[x + dx + z * sx];
          const gb = ground[x + (z + dz) * sx];
          if (ga < 0 || gb < 0 || Math.abs(ga - g) > 1 || Math.abs(gb - g) > 1) continue;
        }
        const nd = di + (dx !== 0 && dz !== 0 ? SQRT2 : 1);
        if (nd < dist[j]) {
          dist[j] = nd;
          this.push(j);
        }
      }
    }
    this.ready = true;
    return true;
  }

  /**
   * The next aim point from (px, pz) toward the target at (tx, tz), or null
   * when there is no walking route from here (off the floor grid, sealed
   * off): the caller falls back to the straight line. The result is reused.
   */
  next(px: number, pz: number, tx: number, tz: number): RouteStep | null {
    if (!this.ready) return null;
    const sx = this.sx;
    const dist = this.dist;
    let i = this.inside(Math.floor(px), Math.floor(pz)) ? Math.floor(px) + Math.floor(pz) * sx : -1;
    if (i < 0 || dist[i] === Infinity) i = this.nearestReached(px, pz, 2);
    if (i < 0) return null;
    const out = this.step;
    // close enough to walk straight at it
    if (dist[i] <= 1.5 || this.clearWalk(px, pz, tx, tz)) {
      out.x = tx;
      out.z = tz;
      out.dist = Math.hypot(tx - px, tz - pz);
      return out;
    }
    // down the field, keeping the furthest cell that is a straight walk away
    let bestX = (i % sx) + 0.5;
    let bestZ = Math.floor(i / sx) + 0.5;
    let best = i;
    let cur = i;
    for (let s = 0; s < LOOK_AHEAD; s++) {
      const x = cur % sx;
      const z = (cur - x) / sx;
      let low = cur;
      for (let k = 0; k < 8; k++) {
        const nx = x + NX[k];
        const nz = z + NZ[k];
        if (!this.inside(nx, nz)) continue;
        const j = nx + nz * sx;
        if (dist[j] >= dist[low]) continue;
        // never cut a corner the flood itself couldn't
        if (NX[k] !== 0 && NZ[k] !== 0 && (dist[x + NX[k] + z * sx] === Infinity || dist[x + (z + NZ[k]) * sx] === Infinity)) continue;
        low = j;
      }
      if (low === cur) break;
      cur = low;
      const cx = (cur % sx) + 0.5;
      const cz = Math.floor(cur / sx) + 0.5;
      if (this.clearWalk(px, pz, cx, cz)) {
        best = cur;
        bestX = cx;
        bestZ = cz;
      } else if (s > 3) {
        break; // past the corner: the last clear cell is the aim
      }
      if (dist[cur] === 0) break;
    }
    out.x = bestX;
    out.z = bestZ;
    out.dist = Math.hypot(bestX - px, bestZ - pz) + dist[best];
    return out;
  }

  /** walking distance from a point to the target (Infinity when unreachable) */
  distanceFrom(px: number, pz: number): number {
    if (!this.ready) return Infinity;
    const x = Math.floor(px);
    const z = Math.floor(pz);
    return this.inside(x, z) ? this.dist[x + z * this.sx] : Infinity;
  }

  /** a body can walk the straight line a → b: every column under it is on the route's floor */
  private clearWalk(ax: number, az: number, bx: number, bz: number): boolean {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return true;
    const ox = (-dz / len) * CLEARANCE;
    const oz = (dx / len) * CLEARANCE;
    const steps = Math.ceil(len / 0.25);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const x = ax + dx * t;
      const z = az + dz * t;
      if (!this.open(x, z) || !this.open(x + ox, z + oz) || !this.open(x - ox, z - oz)) return false;
    }
    return true;
  }

  private open(x: number, z: number): boolean {
    const cx = Math.floor(x);
    const cz = Math.floor(z);
    return this.inside(cx, cz) && this.dist[cx + cz * this.sx] !== Infinity;
  }

  private inside(x: number, z: number): boolean {
    return x >= 0 && z >= 0 && x < this.sx && z < this.sz;
  }

  private nearestGround(px: number, pz: number, r: number): number {
    return this.nearest(px, pz, r, (i) => this.ground[i] >= 0);
  }

  private nearestReached(px: number, pz: number, r: number): number {
    return this.nearest(px, pz, r, (i) => this.dist[i] !== Infinity);
  }

  private nearest(px: number, pz: number, r: number, ok: (i: number) => boolean): number {
    const cx = Math.floor(px);
    const cz = Math.floor(pz);
    let best = -1;
    let bestD = Infinity;
    for (let z = cz - r; z <= cz + r; z++) {
      for (let x = cx - r; x <= cx + r; x++) {
        if (!this.inside(x, z)) continue;
        const i = x + z * this.sx;
        if (!ok(i)) continue;
        const d = (x + 0.5 - px) ** 2 + (z + 0.5 - pz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  // a small binary heap of column indices, keyed by this.dist
  private push(i: number): void {
    const h = this.heap;
    const d = this.dist;
    let c = h.length;
    h.push(i);
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (d[h[p]] <= d[h[c]]) break;
      const t = h[p];
      h[p] = h[c];
      h[c] = t;
      c = p;
    }
  }

  private pop(): number {
    const h = this.heap;
    const d = this.dist;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1;
        const r = l + 1;
        let m = p;
        if (l < h.length && d[h[l]] < d[h[m]]) m = l;
        if (r < h.length && d[h[r]] < d[h[m]]) m = r;
        if (m === p) break;
        const t = h[p];
        h[p] = h[m];
        h[m] = t;
        p = m;
      }
    }
    return top;
  }
}

const NX = [1, -1, 0, 0, 1, 1, -1, -1];
const NZ = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * Crates and barrels are no obstacle to a route (they break). The cracked
 * secret wall stays a wall: the arrow must never give the secret away.
 */
function openAt(world: VoxelWorld, x: number, y: number, z: number): boolean {
  const b = world.get(x, y, z);
  return b === Block.Air || b === Block.Crate || b === Block.Barrel;
}

/** the lowest floor a body can stand on in this column (levelgen's rule), or -1 */
function groundY(world: VoxelWorld, x: number, z: number): number {
  for (let y = 1; y <= 6; y++) {
    if (openAt(world, x, y, z) && openAt(world, x, y + 1, z) && !openAt(world, x, y - 1, z)) return y;
  }
  return -1;
}
