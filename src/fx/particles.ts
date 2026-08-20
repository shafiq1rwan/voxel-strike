import * as THREE from 'three';
import { VoxelWorld } from '../world/world';

const MAX_PARTICLES = 1024;

interface P {
  alive: boolean;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  /** shrink toward end of life */
  shrink: boolean;
  collide: boolean;
}

/**
 * Object-pooled chunky voxel particles rendered as one InstancedMesh.
 */
export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private pool: P[] = [];
  private cursor = 0;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ fog: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool.push({
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, size: 0.1, gravity: 0, shrink: true, collide: false,
      });
      this.dummy.position.set(0, -999, 0);
      this.dummy.scale.setScalar(0.0001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, this.color.setRGB(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    life: number, size: number, r: number, g: number, b: number,
    gravity: number, collide = false
  ): void {
    const idx = this.cursor;
    const p = this.pool[idx];
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.vx = vx; p.vy = vy; p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.size = size;
    p.gravity = gravity;
    p.shrink = true;
    p.collide = collide;
    this.mesh.setColorAt(idx, this.color.setRGB(r, g, b));
  }

  /** bullet impact sparks + dust */
  impact(x: number, y: number, z: number, nx: number, ny: number, nz: number, r = 1, g = 0.85, b = 0.4): void {
    for (let i = 0; i < 6; i++) {
      const s = 3 + Math.random() * 4;
      this.emit(
        x + nx * 0.05, y + ny * 0.05, z + nz * 0.05,
        (nx + (Math.random() - 0.5) * 1.4) * s,
        (ny + (Math.random() - 0.5) * 1.4) * s,
        (nz + (Math.random() - 0.5) * 1.4) * s,
        0.15 + Math.random() * 0.2, 0.05 + Math.random() * 0.05,
        r, g, b, 14
      );
    }
    for (let i = 0; i < 3; i++) {
      this.emit(
        x + nx * 0.1, y + ny * 0.1, z + nz * 0.1,
        (Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5,
        0.3 + Math.random() * 0.3, 0.08, 0.35, 0.33, 0.38, 3
      );
    }
  }

  /** enemy hit splatter */
  blood(x: number, y: number, z: number, dx: number, dy: number, dz: number, r: number, g: number, b: number, count = 8): void {
    for (let i = 0; i < count; i++) {
      const s = 2 + Math.random() * 4;
      this.emit(
        x, y, z,
        (-dx * 0.4 + (Math.random() - 0.5) * 1.6) * s,
        (0.5 + Math.random()) * s * 0.7,
        (-dz * 0.4 + (Math.random() - 0.5) * 1.6) * s,
        0.35 + Math.random() * 0.35, 0.07 + Math.random() * 0.07,
        r, g, b, 22, true
      );
      void dy;
    }
  }

  /** block break debris tinted like the block */
  debris(x: number, y: number, z: number, r: number, g: number, b: number, count = 14): void {
    for (let i = 0; i < count; i++) {
      this.emit(
        x + (Math.random() - 0.5) * 0.8,
        y + (Math.random() - 0.5) * 0.8,
        z + (Math.random() - 0.5) * 0.8,
        (Math.random() - 0.5) * 6, 2 + Math.random() * 5, (Math.random() - 0.5) * 6,
        0.5 + Math.random() * 0.5, 0.09 + Math.random() * 0.09,
        r * (0.7 + Math.random() * 0.5), g * (0.7 + Math.random() * 0.5), b * (0.7 + Math.random() * 0.5),
        18, true
      );
    }
  }

  explosion(x: number, y: number, z: number): void {
    for (let i = 0; i < 26; i++) {
      const th = Math.random() * Math.PI * 2;
      const ph = Math.random() * Math.PI;
      const s = 4 + Math.random() * 9;
      const hot = Math.random() < 0.6;
      this.emit(
        x, y, z,
        Math.sin(ph) * Math.cos(th) * s, Math.cos(ph) * s * 0.8 + 2, Math.sin(ph) * Math.sin(th) * s,
        0.3 + Math.random() * 0.5, 0.1 + Math.random() * 0.14,
        hot ? 1 : 0.5, hot ? 0.55 + Math.random() * 0.3 : 0.32, hot ? 0.1 : 0.28,
        10, true
      );
    }
    for (let i = 0; i < 10; i++) {
      this.emit(
        x, y, z,
        (Math.random() - 0.5) * 3, 1 + Math.random() * 3, (Math.random() - 0.5) * 3,
        0.7 + Math.random() * 0.6, 0.16, 0.2, 0.18, 0.2, 1.5
      );
    }
  }

  /** enemy death: a body part bursts into chunky voxels of its own color */
  gib(x: number, y: number, z: number, r: number, g: number, b: number, count = 3): void {
    for (let i = 0; i < count; i++) {
      const shade = 0.75 + Math.random() * 0.45;
      this.emit(
        x + (Math.random() - 0.5) * 0.25,
        y + (Math.random() - 0.5) * 0.25,
        z + (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5) * 5.5,
        1.5 + Math.random() * 4,
        (Math.random() - 0.5) * 5.5,
        0.55 + Math.random() * 0.55,
        0.09 + Math.random() * 0.07,
        r * shade, g * shade, b * shade,
        17, true
      );
    }
  }

  /** ejected brass casing */
  casing(x: number, y: number, z: number, rx: number, rz: number): void {
    this.emit(
      x, y, z,
      rx * (1.7 + Math.random()) + (Math.random() - 0.5), 1.6 + Math.random(), rz * (1.7 + Math.random()) + (Math.random() - 0.5),
      0.7 + Math.random() * 0.3, 0.028,
      0.85, 0.68, 0.3, 16, true
    );
  }

  /** slow-rising muzzle smoke puffs */
  smoke(x: number, y: number, z: number, count = 2): void {
    for (let i = 0; i < count; i++) {
      this.emit(
        x + (Math.random() - 0.5) * 0.12, y + (Math.random() - 0.5) * 0.12, z + (Math.random() - 0.5) * 0.12,
        (Math.random() - 0.5) * 0.5, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.5,
        0.4 + Math.random() * 0.25, 0.045,
        0.32, 0.32, 0.35, -0.4
      );
    }
  }

  /** small energy trail puff */
  trail(x: number, y: number, z: number, r: number, g: number, b: number, size = 0.06): void {
    this.emit(
      x + (Math.random() - 0.5) * 0.1, y + (Math.random() - 0.5) * 0.1, z + (Math.random() - 0.5) * 0.1,
      (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6,
      0.25 + Math.random() * 0.2, size, r, g, b, 0
    );
  }

  /** kill every particle immediately (level teardown) */
  clear(): void {
    this.dummy.position.set(0, -999, 0);
    this.dummy.scale.setScalar(0.0001);
    this.dummy.updateMatrix();
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.pool[i].alive = false;
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, world: VoxelWorld): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.pool[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.dummy.position.set(0, -999, 0);
        this.dummy.scale.setScalar(0.0001);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
        continue;
      }
      p.vy -= p.gravity * dt;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      const nz = p.z + p.vz * dt;
      if (p.collide && world.isSolid(Math.floor(nx), Math.floor(ny), Math.floor(nz))) {
        // crude bounce/settle
        p.vx *= 0.4;
        p.vz *= 0.4;
        p.vy = p.vy < 0 ? -p.vy * 0.25 : 0;
      } else {
        p.x = nx; p.y = ny; p.z = nz;
      }
      const k = p.shrink ? Math.max(0.15, p.life / p.maxLife) : 1;
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.life * 5, p.life * 7, 0);
      this.dummy.scale.setScalar(p.size * k);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
