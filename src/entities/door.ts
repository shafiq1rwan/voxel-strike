import * as THREE from 'three';
import { Box } from '../core/physics';
import { DoorSpec, ElevatorSpec, KeyColor } from '../types';
import { VoxelWorld } from '../world/world';
import { AudioMan } from '../core/audio';

const DOOR_H = 3;
const OPEN_SPEED = 3.2;

function makeDoorTexture(locked: KeyColor | null): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#4a5262';
  ctx.fillRect(0, 0, 32, 48);
  ctx.fillStyle = '#353c4a';
  for (let y = 0; y < 48; y += 8) ctx.fillRect(0, y, 32, 2);
  ctx.fillStyle = '#657084';
  ctx.fillRect(14, 0, 4, 48);
  // center emblem shows lock color
  const col = locked === 'red' ? '#ff3428' : locked === 'blue' ? '#3878ff' : locked === 'yellow' ? '#ffd028' : '#88f0a0';
  ctx.fillStyle = col;
  ctx.fillRect(10, 20, 12, 8);
  ctx.fillStyle = '#10131a';
  ctx.fillRect(12, 22, 8, 4);
  ctx.fillStyle = col;
  ctx.fillRect(14, 23, 4, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export class Door {
  readonly spec: DoorSpec;
  locked: KeyColor | null;
  openT = 0;
  private target = 0;
  private lingerTimer = 0;
  private lockedMsgCooldown = 0;
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private baseY = 1 + DOOR_H / 2;

  constructor(spec: DoorSpec, world: VoxelWorld) {
    this.spec = spec;
    this.locked = spec.locked;
    const alongX = spec.dir === 'x';
    const geo = new THREE.BoxGeometry(alongX ? 0.5 : 2, DOOR_H, alongX ? 2 : 0.5);
    this.material = new THREE.MeshBasicMaterial({ map: makeDoorTexture(spec.locked), fog: true });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(spec.x + (alongX ? 0.5 : 1), this.baseY, spec.z + (alongX ? 1 : 0.5));
    // tint by baked light at the doorway
    const l = world.sampleLight01(spec.x, 2, spec.z);
    const b = Math.min(1, 0.25 + (l[0] + l[1] + l[2]));
    this.material.color.setRGB(b, b, b);
  }

  get isOpen(): boolean {
    return this.openT > 0.95;
  }

  centerX(): number {
    return this.mesh.position.x;
  }

  centerZ(): number {
    return this.mesh.position.z;
  }

  box(): Box {
    const alongX = this.spec.dir === 'x';
    const hx = alongX ? 0.25 : 1;
    const hz = alongX ? 1 : 0.25;
    const y = this.baseY + this.openT * (DOOR_H - 0.2);
    return {
      minX: this.mesh.position.x - hx,
      maxX: this.mesh.position.x + hx,
      minY: y - DOOR_H / 2,
      maxY: y + DOOR_H / 2,
      minZ: this.mesh.position.z - hz,
      maxZ: this.mesh.position.z + hz,
    };
  }

  /**
   * actors: world positions of things that can trigger the door (player + enemies).
   * The player entry additionally carries key inventory via the callbacks.
   */
  update(
    dt: number,
    actors: Array<{ x: number; z: number; isPlayer: boolean }>,
    hasKey: (c: KeyColor) => boolean,
    onUnlock: (c: KeyColor) => void,
    onLockedTry: (c: KeyColor) => void,
    audio: AudioMan
  ): void {
    this.lockedMsgCooldown = Math.max(0, this.lockedMsgCooldown - dt);
    let near = false;
    for (const a of actors) {
      const dx = a.x - this.centerX();
      const dz = a.z - this.centerZ();
      if (dx * dx + dz * dz < 2.4 * 2.4) {
        if (this.locked) {
          if (!a.isPlayer) continue;
          if (hasKey(this.locked)) {
            onUnlock(this.locked);
            this.locked = null;
            near = true;
          } else if (this.lockedMsgCooldown === 0) {
            this.lockedMsgCooldown = 1.2;
            onLockedTry(this.locked);
          }
        } else {
          near = true;
        }
      }
    }
    if (near) {
      if (this.target !== 1 && this.openT < 0.05) {
        audio.play('doorOpen', { x: this.centerX(), y: 2, z: this.centerZ() });
      }
      this.target = 1;
      this.lingerTimer = 1.6;
    } else if (this.target === 1) {
      this.lingerTimer -= dt;
      if (this.lingerTimer <= 0) {
        this.target = 0;
        if (this.openT > 0.9) {
          audio.play('doorClose', { x: this.centerX(), y: 2, z: this.centerZ() });
        }
      }
    }
    const dir = Math.sign(this.target - this.openT);
    if (dir !== 0) {
      this.openT = Math.max(0, Math.min(1, this.openT + dir * OPEN_SPEED * dt * 0.45));
      const y = this.baseY + this.openT * (DOOR_H - 0.2);
      this.mesh.position.y = y;
    }
  }
}

export class Elevator {
  readonly spec: ElevatorSpec;
  /** current top surface height */
  topY: number;
  private state: 'bottom' | 'up' | 'top' | 'down' = 'bottom';
  private timer = 0;
  readonly mesh: THREE.Mesh;
  /** vertical movement this frame, for carrying the player */
  dy = 0;

  constructor(spec: ElevatorSpec, world: VoxelWorld) {
    this.spec = spec;
    this.topY = spec.lowY;
    const geo = new THREE.BoxGeometry(2, 0.9, 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0x777f92, fog: true });
    const l = world.sampleLight01(spec.x + 1, spec.lowY + 1, spec.z + 1);
    const b = Math.min(1, 0.3 + (l[0] + l[1] + l[2]));
    mat.color.multiplyScalar(b);
    this.mesh = new THREE.Mesh(geo, mat);
    this.updateMesh();
  }

  private updateMesh(): void {
    this.mesh.position.set(this.spec.x + 1, this.topY - 0.45, this.spec.z + 1);
  }

  box(): Box {
    return {
      minX: this.spec.x,
      maxX: this.spec.x + 2,
      minY: 0,
      maxY: this.topY,
      minZ: this.spec.z,
      maxZ: this.spec.z + 2,
    };
  }

  /** true if the given AABB body is standing on the platform */
  isOnTop(px: number, py: number, pz: number, halfY: number): boolean {
    const feet = py - halfY;
    return (
      px > this.spec.x - 0.3 && px < this.spec.x + 2.3 &&
      pz > this.spec.z - 0.3 && pz < this.spec.z + 2.3 &&
      feet > this.topY - 0.4 && feet < this.topY + 0.6
    );
  }

  update(dt: number, playerOn: boolean, audio: AudioMan): void {
    const prev = this.topY;
    const speed = 2.2;
    switch (this.state) {
      case 'bottom':
        if (playerOn) {
          this.timer += dt;
          if (this.timer > 0.4) {
            this.state = 'up';
            this.timer = 0;
            audio.play('elevator', { x: this.spec.x + 1, y: this.topY, z: this.spec.z + 1 });
          }
        } else {
          this.timer = 0;
        }
        break;
      case 'up':
        this.topY += speed * dt;
        if (this.topY >= this.spec.highY) {
          this.topY = this.spec.highY;
          this.state = 'top';
          this.timer = 0;
        }
        break;
      case 'top':
        this.timer += dt;
        if (this.timer > 3.5 && !playerOn) {
          this.state = 'down';
          audio.play('elevator', { x: this.spec.x + 1, y: this.topY, z: this.spec.z + 1 });
        }
        break;
      case 'down':
        this.topY -= speed * dt;
        if (this.topY <= this.spec.lowY) {
          this.topY = this.spec.lowY;
          this.state = 'bottom';
          this.timer = 0;
        }
        if (playerOn) {
          // player rode it down — go back up afterwards from bottom state
        }
        break;
    }
    this.dy = this.topY - prev;
    this.updateMesh();
  }
}
