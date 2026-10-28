import * as THREE from 'three';
import { Block } from '../world/blocks';
import type { VoxelWorld } from '../world/world';

const MAX_MARKS = 96; // a few shotgun blasts' worth
const LIFE = 9; // seconds a mark stays
const SHRINK = 1.5; // ...the last of which it shrinks away
const SIZE = 0.15;

/**
 * Bullet marks: a small dark pockmark where a hitscan shot meets a wall, so a
 * miss leaves something behind. ONE InstancedMesh (one draw for all of them),
 * pooled round-robin; each mark sits a hair off the face it hit, turned to a
 * random angle, and shrinks away after LIFE seconds. A mark on a block that
 * breaks (a crate, a cracked wall) goes with it.
 */
export class Decals {
  readonly mesh: THREE.InstancedMesh;
  private readonly life = new Float32Array(MAX_MARKS);
  private readonly size = new Float32Array(MAX_MARKS);
  private readonly cell = new Int32Array(MAX_MARKS * 3);
  private readonly pos = new Float32Array(MAX_MARKS * 3);
  private readonly rot: THREE.Quaternion[] = [];
  private cursor = 0;
  private checkT = 0;
  /** marks placed since the level began (tests) */
  placed = 0;

  constructor() {
    // opaque, cut out by alphaTest, and it WRITES depth: the marks can be
    // drawn before the wall chunks, and a mark that didn't write depth was
    // simply painted over by its wall. The polygon offset keeps it in front.
    const mat = new THREE.MeshBasicMaterial({
      map: pockmarkTexture(), alphaTest: 0.5,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, MAX_MARKS);
    this.mesh.name = 'bullet-marks';
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_MARKS; i++) {
      this.rot.push(new THREE.Quaternion());
      this.mesh.setMatrixAt(i, ZERO);
    }
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  /**
   * A mark at a hit point on the face with normal n of voxel (vx, vy, vz).
   * Blocks the mesher never draws (prop / railing collision, tank glass) get
   * none — the mark would hang in the air.
   */
  add(x: number, y: number, z: number, nx: number, ny: number, nz: number, vx: number, vy: number, vz: number, block: Block): void {
    if (block === Block.PowerBarrier || block === Block.TankGlass) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_MARKS;
    this.life[i] = LIFE;
    this.size[i] = SIZE * (0.8 + Math.random() * 0.45);
    this.pos[i * 3] = x + nx * 0.012;
    this.pos[i * 3 + 1] = y + ny * 0.012;
    this.pos[i * 3 + 2] = z + nz * 0.012;
    this.cell[i * 3] = vx; this.cell[i * 3 + 1] = vy; this.cell[i * 3 + 2] = vz;
    _n.set(nx, ny, nz);
    this.rot[i].setFromUnitVectors(_z, _n).multiply(_roll.setFromAxisAngle(_z, Math.random() * Math.PI * 2));
    this.write(i, this.size[i]);
    this.placed++;
  }

  update(dt: number, world: VoxelWorld | null): void {
    let dirty = false;
    this.checkT -= dt;
    const check = this.checkT <= 0 && world !== null;
    if (check) this.checkT = 0.2;
    for (let i = 0; i < MAX_MARKS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const gone = this.life[i] <= 0 ||
        (check && world!.get(this.cell[i * 3], this.cell[i * 3 + 1], this.cell[i * 3 + 2]) === Block.Air);
      if (gone) {
        this.life[i] = 0;
        this.mesh.setMatrixAt(i, ZERO);
        dirty = true;
      } else if (this.life[i] < SHRINK) {
        this.write(i, this.size[i] * (this.life[i] / SHRINK), false);
        dirty = true;
      }
    }
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** marks still on a wall (tests) */
  live(): number {
    let n = 0;
    for (let i = 0; i < MAX_MARKS; i++) if (this.life[i] > 0) n++;
    return n;
  }

  /** a new level: no marks carried over */
  clear(): void {
    this.life.fill(0);
    for (let i = 0; i < MAX_MARKS; i++) this.mesh.setMatrixAt(i, ZERO);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.placed = 0;
  }

  private write(i: number, s: number, flag = true): void {
    _p.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    _s.set(s, s, s);
    this.mesh.setMatrixAt(i, _m.compose(_p, this.rot[i], _s));
    if (flag) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _z = new THREE.Vector3(0, 0, 1);
const _roll = new THREE.Quaternion();

/** an 8×8 pixel pockmark: a near-black hole in a dark grey ragged rim */
function pockmarkTexture(): THREE.DataTexture {
  const rows = [
    '..+..+..',
    '.+##+...',
    '+####+..',
    '.#####+.',
    '.+####+.',
    '..+##+.+',
    '.+..+...',
    '........',
  ];
  const data = new Uint8Array(8 * 8 * 4);
  rows.forEach((row, y) => {
    for (let x = 0; x < 8; x++) {
      const c = row[x], o = ((7 - y) * 8 + x) * 4;
      const v = c === '#' ? [8, 9, 12, 255] : c === '+' ? [44, 46, 54, 255] : [0, 0, 0, 0];
      data.set(v, o);
    }
  });
  const tex = new THREE.DataTexture(data, 8, 8, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
