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

  /** co-op client: doors are driven by host snapshots, not local logic */
  netSet(openT: number, locked: boolean): void {
    this.openT = openT;
    if (!locked) this.locked = null;
    this.mesh.position.y = this.baseY + this.openT * (DOOR_H - 0.2);
  }

  centerX(): number {
    return this.mesh.position.x;
  }

  centerZ(): number {
    return this.mesh.position.z;
  }

  /** reused every call: callers read it immediately, never keep it */
  private readonly boxCache: Box = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  box(): Box {
    const alongX = this.spec.dir === 'x';
    const hx = alongX ? 0.25 : 1;
    const hz = alongX ? 1 : 0.25;
    const y = this.baseY + this.openT * (DOOR_H - 0.2);
    const b = this.boxCache;
    b.minX = this.mesh.position.x - hx;
    b.maxX = this.mesh.position.x + hx;
    b.minY = y - DOOR_H / 2;
    b.maxY = y + DOOR_H / 2;
    b.minZ = this.mesh.position.z - hz;
    b.maxZ = this.mesh.position.z + hz;
    return b;
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

// ---------------------------------------------------------------------------
// Lift art: hazard-striped deck with a yellow UP arrow, plus a scrolling beam
// of chevrons up the shaft while it waits at the bottom — a plain grey box
// didn't read as "stand here to ride up".

function pixelTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** diagonal hazard stripes (palette hazard yellow on near-black) */
function hazardStripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#14161e';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffd028';
  for (let o = -h; o < w + h; o += 8) {
    ctx.beginPath();
    ctx.moveTo(x + o, y + h);
    ctx.lineTo(x + o + 4, y + h);
    ctx.lineTo(x + o + 4 + h, y);
    ctx.lineTo(x + o + h, y);
    ctx.fill();
  }
  ctx.restore();
}

/** deck sides: full hazard band with a shadow line at the bottom */
function makeLiftSideTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 16;
  const ctx = c.getContext('2d')!;
  hazardStripes(ctx, 0, 0, 32, 16);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(0, 13, 32, 3);
  return pixelTexture(c);
}

/** deck top: steel grating, hazard border, big yellow up-arrow */
function makeLiftTopTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#3a4152';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#566076';
  for (let y = 6; y < 26; y += 4) ctx.fillRect(6, y, 20, 1);
  hazardStripes(ctx, 0, 0, 32, 4);
  hazardStripes(ctx, 0, 28, 32, 4);
  hazardStripes(ctx, 0, 0, 4, 32);
  hazardStripes(ctx, 28, 0, 4, 32);
  ctx.fillStyle = '#ffd028';
  ctx.beginPath();
  ctx.moveTo(16, 7);
  ctx.lineTo(25, 17);
  ctx.lineTo(19, 17);
  ctx.lineTo(19, 25);
  ctx.lineTo(13, 25);
  ctx.lineTo(13, 17);
  ctx.lineTo(7, 17);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#14161e';
  ctx.lineWidth = 1;
  ctx.stroke();
  return pixelTexture(c);
}

/** beam: faint fill with one chevron (rgb triplets), tiled + scrolled upward */
function makeBeamTexture(fill: string, chevron: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = `rgba(${fill},0.18)`;
  ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = `rgba(${chevron},0.9)`;
  ctx.beginPath();
  ctx.moveTo(2, 11);
  ctx.lineTo(8, 5);
  ctx.lineTo(14, 11);
  ctx.lineTo(11, 11);
  ctx.lineTo(8, 8);
  ctx.lineTo(5, 11);
  ctx.closePath();
  ctx.fill();
  const tex = pixelTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Additive open square tube of scrolling chevrons, `h` tall, fading toward the
 * top via vertex colors. Positioned by the caller (its origin is its center).
 */
function makeBeam(h: number, fill: string, chevron: string): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } {
  const geo = new THREE.CylinderGeometry(1.36, 1.36, h, 4, 1, true);
  geo.rotateY(Math.PI / 4);
  const pos = geo.getAttribute('position');
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const fade = 1 - (pos.getY(i) + h / 2) / h; // 1 at the bottom, 0 at the top
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = 0.15 + 0.85 * fade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const tex = makeBeamTexture(fill, chevron);
  tex.repeat.set(4, h * 1.2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
    opacity: 0.8,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5;
  return { mesh, mat };
}

/** fade a beam toward lit/unlit and scroll its chevrons upward */
function animateBeam(beam: THREE.Mesh, mat: THREE.MeshBasicMaterial, lit: boolean, dt: number): void {
  mat.opacity += ((lit ? 0.8 : 0) - mat.opacity) * Math.min(1, dt * 6);
  beam.visible = mat.opacity > 0.02;
  if (mat.map) mat.map.offset.y -= dt * 1.1;
}

/**
 * Green chevron beam over the exit pad. It lights once the player is up on the
 * ledge (the "step on the exit pad" objective), so the last step is obvious
 * from anywhere in the room.
 */
export class ExitBeacon {
  readonly mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;

  constructor(pad: { x: number; y: number; z: number }) {
    const h = 2.6;
    const beam = makeBeam(h, '76,194,106', '150,255,170');
    this.mesh = beam.mesh;
    this.mat = beam.mat;
    this.mat.opacity = 0;
    this.mesh.visible = false;
    this.mesh.scale.set(0.75, 1, 0.75); // the pad is 2×2, a hair narrower than the lift
    this.mesh.position.set(pad.x, pad.y + h / 2, pad.z);
  }

  animate(dt: number, lit: boolean): void {
    animateBeam(this.mesh, this.mat, lit, dt);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.map?.dispose();
    this.mat.dispose();
  }
}

export class Elevator {
  readonly spec: ElevatorSpec;
  /** current top surface height */
  topY: number;
  private state: 'bottom' | 'up' | 'top' | 'down' = 'bottom';
  private timer = 0;
  /** deck + beam; add this to the scene (not just the mesh) */
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private beam: THREE.Mesh;
  private beamMat: THREE.MeshBasicMaterial;
  private deckMats: THREE.MeshBasicMaterial[];
  /** vertical movement this frame, for carrying the player */
  dy = 0;

  constructor(spec: ElevatorSpec) {
    this.spec = spec;
    this.topY = spec.lowY;
    // deck: hazard sides, arrow top, dark underside (BoxGeometry face order is
    // +x, -x, +y, -y, +z, -z). Full-bright on purpose: it's a beacon.
    const side = new THREE.MeshBasicMaterial({ map: makeLiftSideTexture(), fog: true });
    const top = new THREE.MeshBasicMaterial({ map: makeLiftTopTexture(), fog: true });
    const under = new THREE.MeshBasicMaterial({ color: 0x1a1d26, fog: true });
    this.deckMats = [side, top];
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 2), [side, side, top, under, side, side]);
    this.group.add(this.mesh);

    // beam: from the deck up past the upper floor
    const h = spec.highY - spec.lowY + 1.6;
    const beam = makeBeam(h, '255,208,40', '255,224,110');
    this.beam = beam.mesh;
    this.beamMat = beam.mat;
    this.beam.position.set(spec.x + 1, spec.lowY + h / 2, spec.z + 1);
    this.group.add(this.beam);
    this.updateMesh();
  }

  /**
   * Per-frame look: while waiting at the bottom the beam is lit, its chevrons
   * scroll upward and the deck pulses; once the lift moves the beam fades.
   */
  animate(dt: number, time: number): void {
    const waiting = this.topY < this.spec.lowY + 0.05;
    animateBeam(this.beam, this.beamMat, waiting, dt);
    const pulse = 0.82 + 0.18 * Math.sin(time * 4);
    for (const m of this.deckMats) m.color.setScalar(waiting ? pulse : 1);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.beam.geometry.dispose();
    const mats = new Set([...(this.mesh.material as THREE.MeshBasicMaterial[]), this.beamMat]);
    for (const m of mats) {
      m.map?.dispose();
      m.dispose();
    }
  }

  private updateMesh(): void {
    this.mesh.position.set(this.spec.x + 1, this.topY - 0.45, this.spec.z + 1);
  }

  /** reused every call: callers read it immediately, never keep it */
  private readonly boxCache: Box = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  box(): Box {
    const b = this.boxCache;
    b.minX = this.spec.x;
    b.maxX = this.spec.x + 2;
    b.minY = 0;
    b.maxY = this.topY;
    b.minZ = this.spec.z;
    b.maxZ = this.spec.z + 2;
    return b;
  }

  /** co-op client: platform height comes from host snapshots */
  netSet(topY: number): void {
    this.dy = topY - this.topY;
    this.topY = topY;
    this.updateMesh();
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
