import { Block, LAMP_COLORS, blockHP, isDestructible } from './blocks';

export const CHUNK = 16;

export interface RaycastHit {
  /** voxel coords of the block that was hit */
  x: number;
  y: number;
  z: number;
  /** distance along the ray */
  t: number;
  /** face normal of the hit */
  nx: number;
  ny: number;
  nz: number;
  block: Block;
}

/**
 * Voxel world storage. Pure data + queries — rendering lives in mesher.ts,
 * so game state stays independent of Three.js here.
 */
export class VoxelWorld {
  readonly sx: number;
  readonly sy: number;
  readonly sz: number;
  readonly blocks: Uint8Array;
  /** baked static light, RGB 0-255 per voxel */
  readonly light: Uint8Array;
  /** chunk keys (cx + cz * chunksX) needing remesh */
  readonly dirtyChunks = new Set<number>();
  readonly chunksX: number;
  readonly chunksZ: number;
  /** remaining hp for damaged destructible voxels */
  private voxelHP = new Map<number, number>();

  constructor(sx: number, sy: number, sz: number) {
    this.sx = sx;
    this.sy = sy;
    this.sz = sz;
    this.blocks = new Uint8Array(sx * sy * sz);
    this.blocks.fill(Block.Rock);
    this.light = new Uint8Array(sx * sy * sz * 3);
    this.chunksX = Math.ceil(sx / CHUNK);
    this.chunksZ = Math.ceil(sz / CHUNK);
  }

  index(x: number, y: number, z: number): number {
    return (y * this.sz + z) * this.sx + x;
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz;
  }

  get(x: number, y: number, z: number): Block {
    if (!this.inBounds(x, y, z)) {
      // above the world is open air; everywhere else out of bounds is solid.
      // (If the ceiling were solid all the way up, a body ever embedded in it
      // would be ratcheted upward by collision resolution forever.)
      return y >= this.sy ? Block.Air : Block.Rock;
    }
    return this.blocks[this.index(x, y, z)] as Block;
  }

  set(x: number, y: number, z: number, b: Block): void {
    if (!this.inBounds(x, y, z)) return;
    this.blocks[this.index(x, y, z)] = b;
  }

  isSolid(x: number, y: number, z: number): boolean {
    return this.get(x, y, z) !== Block.Air;
  }

  /** set + mark affected chunk meshes dirty (used at runtime, e.g. destruction) */
  setAndDirty(x: number, y: number, z: number, b: Block): void {
    if (!this.inBounds(x, y, z)) return;
    this.set(x, y, z, b);
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    this.markDirty(cx, cz);
    if (x % CHUNK === 0) this.markDirty(cx - 1, cz);
    if (x % CHUNK === CHUNK - 1) this.markDirty(cx + 1, cz);
    if (z % CHUNK === 0) this.markDirty(cx, cz - 1);
    if (z % CHUNK === CHUNK - 1) this.markDirty(cx, cz + 1);
  }

  private markDirty(cx: number, cz: number): void {
    if (cx < 0 || cz < 0 || cx >= this.chunksX || cz >= this.chunksZ) return;
    this.dirtyChunks.add(cx + cz * this.chunksX);
  }

  /**
   * Apply damage to a destructible voxel. Returns the block type if it broke,
   * or null if nothing broke.
   */
  damageVoxel(x: number, y: number, z: number, dmg: number): Block | null {
    const b = this.get(x, y, z);
    if (!isDestructible(b)) return null;
    const idx = this.index(x, y, z);
    const hp = (this.voxelHP.get(idx) ?? blockHP(b)) - dmg;
    if (hp <= 0) {
      this.voxelHP.delete(idx);
      this.setAndDirty(x, y, z, Block.Air);
      return b;
    }
    this.voxelHP.set(idx, hp);
    return null;
  }

  getLight(x: number, y: number, z: number, out: [number, number, number]): void {
    if (!this.inBounds(x, y, z)) {
      out[0] = out[1] = out[2] = 0;
      return;
    }
    const i = this.index(x, y, z) * 3;
    out[0] = this.light[i];
    out[1] = this.light[i + 1];
    out[2] = this.light[i + 2];
  }

  /** Sample baked light at a world position (0..1 per channel). */
  sampleLight01(x: number, y: number, z: number): [number, number, number] {
    const out: [number, number, number] = [0, 0, 0];
    this.getLight(Math.floor(x), Math.floor(y), Math.floor(z), out);
    return [out[0] / 255, out[1] / 255, out[2] / 255];
  }

  /**
   * Bake static lighting: dim ambient everywhere, then BFS colored light
   * outward through air from every lamp block.
   */
  bakeLighting(): void {
    const { light, blocks, sx, sy, sz } = this;
    // ambient
    for (let i = 0; i < blocks.length; i++) {
      light[i * 3] = 16;
      light[i * 3 + 1] = 17;
      light[i * 3 + 2] = 22;
    }
    const RANGE = 13;
    const FALLOFF = 235 / RANGE;
    // queue entries: [x, y, z, level]
    for (let y = 0; y < sy; y++) {
      for (let z = 0; z < sz; z++) {
        for (let x = 0; x < sx; x++) {
          const b = blocks[this.index(x, y, z)] as Block;
          const col = LAMP_COLORS[b];
          if (!col) continue;
          this.floodFrom(x, y, z, col, 235, FALLOFF);
        }
      }
    }
  }

  private floodFrom(
    lx: number,
    ly: number,
    lz: number,
    color: [number, number, number],
    start: number,
    falloff: number
  ): void {
    const queue: number[] = [];
    const visited = new Map<number, number>();
    const dirs = [
      [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
    ];
    // seed from air neighbors of the lamp
    for (const [dx, dy, dz] of dirs) {
      const x = lx + dx, y = ly + dy, z = lz + dz;
      if (this.inBounds(x, y, z) && this.get(x, y, z) === Block.Air) {
        const idx = this.index(x, y, z);
        if ((visited.get(idx) ?? -1) < start) {
          visited.set(idx, start);
          queue.push(x, y, z, start);
        }
      }
    }
    let head = 0;
    while (head < queue.length) {
      const x = queue[head], y = queue[head + 1], z = queue[head + 2], lvl = queue[head + 3];
      head += 4;
      const li = this.index(x, y, z) * 3;
      const f = lvl / 255;
      const r = Math.round(color[0] * f);
      const g = Math.round(color[1] * f);
      const b = Math.round(color[2] * f);
      if (r > this.light[li]) this.light[li] = r;
      if (g > this.light[li + 1]) this.light[li + 1] = g;
      if (b > this.light[li + 2]) this.light[li + 2] = b;
      const next = lvl - falloff;
      if (next <= 0) continue;
      for (const [dx, dy, dz] of dirs) {
        const nx2 = x + dx, ny2 = y + dy, nz2 = z + dz;
        if (!this.inBounds(nx2, ny2, nz2)) continue;
        if (this.get(nx2, ny2, nz2) !== Block.Air) continue;
        const nidx = this.index(nx2, ny2, nz2);
        if ((visited.get(nidx) ?? -1) >= next) continue;
        visited.set(nidx, next);
        queue.push(nx2, ny2, nz2, next);
      }
    }
  }

  /**
   * DDA voxel raycast (Amanatides & Woo). Returns the first solid voxel hit
   * within maxDist, or null.
   */
  raycast(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxDist: number
  ): RaycastHit | null {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;

    // if starting inside a solid voxel, report it immediately
    if (this.isSolid(x, y, z) && this.inBounds(x, y, z)) {
      return { x, y, z, t: 0, nx: 0, ny: 0, nz: 0, block: this.get(x, y, z) };
    }

    let t = 0;
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < 512; i++) {
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0;
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = stepZ * -1;
      }
      if (t > maxDist) return null;
      if (this.isSolid(x, y, z)) {
        return { x, y, z, t, nx, ny, nz, block: this.get(x, y, z) };
      }
    }
    return null;
  }

  /** Line-of-sight test between two points (voxels only). */
  hasLOS(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.001) return true;
    const hit = this.raycast(ax, ay, az, dx / dist, dy / dist, dz / dist, dist);
    return hit === null;
  }
}
