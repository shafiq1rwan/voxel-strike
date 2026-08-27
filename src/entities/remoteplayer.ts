import * as THREE from 'three';
import type { Game } from '../game';

/**
 * The co-op partner's avatar: a voxel operative rig driven by network state.
 * Also implements the same "target" surface the enemy AI uses on the player
 * (pos / eyeY / dead / damage / half), so host-side AI can hunt both players.
 */

/** crisp little name tag billboard (always faces the camera) */
function makeTag(text: string, color: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 40;
  const ctx = c.getContext('2d')!;
  ctx.font = 'bold 26px "Courier New", Courier, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 7;
  ctx.strokeStyle = '#05060a';
  ctx.strokeText(text, 48, 21);
  ctx.fillStyle = color;
  ctx.fillText(text, 48, 20);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(0.78, 0.32, 1);
  s.position.y = 1.18; // floats above the helmet
  return s;
}

function part(parent: THREE.Object3D, w: number, h: number, d: number, color: number, fullBright = false): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color, fog: !fullBright })
  );
  mesh.userData.baseColor = new THREE.Color(color);
  mesh.userData.fullBright = fullBright;
  parent.add(mesh);
  return mesh;
}

export class RemotePlayer {
  readonly mesh = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly half = new THREE.Vector3(0.34, 0.88, 0.34);
  /** inert stubs so the avatar satisfies the PlayerTarget shape — knockback
   *  and shake are applied on the partner's own machine via the damage relay */
  readonly vel = new THREE.Vector3();
  shake = 0;
  dead = false;
  /** network interpolation targets */
  private tx = 0; private ty = 0; private tz = 0;
  private tyaw = 0; private tpitch = 0;
  private yaw = 0;
  private gait = 0;
  private lightTick = Math.random();
  private legL: THREE.Group;
  private legR: THREE.Group;
  private headG: THREE.Group;
  private armR: THREE.Group;
  private hasTarget = false;
  /** wired by Netplay: applying damage means telling the peer they got hit */
  onDamage: ((amount: number, sx: number, sz: number) => void) | null = null;

  constructor(readonly label: string) {
    const body = new THREE.Group();
    this.mesh.add(body);
    // P1 = the host (gold), P2 = the partner (teal)
    this.mesh.add(makeTag(label, label === 'P1' ? '#ffd028' : '#55e0ff'));
    const mkLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.13 * side, -0.28, 0);
      const thigh = part(g, 0.16, 0.3, 0.18, 0x3a404e);
      thigh.position.y = -0.14;
      const boot = part(g, 0.17, 0.28, 0.2, 0x252a34);
      boot.position.set(0, -0.42, -0.01);
      body.add(g);
      return g;
    };
    this.legL = mkLeg(-1);
    this.legR = mkLeg(1);
    const torso = part(body, 0.48, 0.52, 0.28, 0x566076);
    torso.position.y = 0.06;
    const chest = part(body, 0.4, 0.22, 0.32, 0x39404f);
    chest.position.set(0, 0.14, -0.02);
    const padL = part(body, 0.14, 0.14, 0.3, 0x39404f);
    padL.position.set(-0.3, 0.28, 0);
    const padR = part(body, 0.14, 0.14, 0.3, 0x39404f);
    padR.position.set(0.3, 0.28, 0);

    this.headG = new THREE.Group();
    this.headG.position.y = 0.5;
    body.add(this.headG);
    const helmet = part(this.headG, 0.3, 0.26, 0.3, 0x4a5262);
    helmet.position.y = 0.12;
    const visor = part(this.headG, 0.24, 0.09, 0.06, 0x55e0ff, true);
    visor.position.set(0, 0.12, -0.15);

    // right arm holds the gun forward
    this.armR = new THREE.Group();
    this.armR.position.set(0.3, 0.2, 0);
    body.add(this.armR);
    const arm = part(this.armR, 0.12, 0.12, 0.4, 0x4a5262);
    arm.position.set(0, 0, -0.2);
    const gun = part(this.armR, 0.09, 0.14, 0.36, 0x2a2e38);
    gun.position.set(0, -0.02, -0.5);
    const armL = part(body, 0.12, 0.34, 0.14, 0x4a5262);
    armL.position.set(-0.3, 0.04, 0);

    this.mesh.visible = false;
  }

  eyeY(): number {
    return this.pos.y + 0.62;
  }

  /** enemy AI / explosions land a hit on the partner → relay it to their game */
  damage(amount: number, _game: Game, source?: { x: number; z: number }): void {
    this.onDamage?.(amount, source?.x ?? this.pos.x, source?.z ?? this.pos.z);
  }

  /** feed the latest network state; returns true when the partner just
   *  MATERIALIZED (first appearance, respawn, new level) — cue the spawn FX */
  netUpdate(x: number, y: number, z: number, yaw: number, pitch: number, dead: boolean): boolean {
    this.tx = x; this.ty = y; this.tz = z;
    this.tyaw = yaw; this.tpitch = pitch;
    let appeared = false;
    if (!this.hasTarget) {
      this.hasTarget = true;
      this.pos.set(x, y, z);
      this.yaw = yaw;
      this.mesh.visible = true;
      appeared = true;
    }
    if (this.dead && !dead) {
      // respawned — snap to the new spot instead of lerping across the map
      this.pos.set(x, y, z);
      appeared = true;
    }
    this.dead = dead;
    return appeared && !dead;
  }

  /** forget the last position (level change) so the next pose re-materializes */
  resetSpawn(): void {
    this.hasTarget = false;
    this.mesh.visible = false;
  }

  update(dt: number, game: Game): void {
    if (!this.hasTarget) return;
    // exponential chase toward the latest network state
    const k = 1 - Math.exp(-12 * dt);
    const pvx = (this.tx - this.pos.x) / Math.max(dt, 0.001);
    const pvz = (this.tz - this.pos.z) / Math.max(dt, 0.001);
    this.pos.x += (this.tx - this.pos.x) * k;
    this.pos.y += (this.ty - this.pos.y) * k;
    this.pos.z += (this.tz - this.pos.z) * k;
    let dy2 = this.tyaw - this.yaw;
    while (dy2 > Math.PI) dy2 -= Math.PI * 2;
    while (dy2 < -Math.PI) dy2 += Math.PI * 2;
    this.yaw += dy2 * k;

    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.yaw + Math.PI; // rig faces +z, players look -z
    this.mesh.visible = !this.dead;

    // walk cycle from implied speed; aim pitch on head + gun arm
    const speed = Math.min(8, Math.hypot(pvx, pvz) * k / Math.max(dt, 0.001) * dt);
    this.gait += dt * (2 + speed * 2.2);
    const amp = Math.min(0.65, speed * 0.09);
    this.legL.rotation.x = Math.sin(this.gait) * amp;
    this.legR.rotation.x = Math.sin(this.gait + Math.PI) * amp;
    this.headG.rotation.x = -this.tpitch * 0.6;
    this.armR.rotation.x = -this.tpitch;

    // CPU lighting, same treatment as enemies
    this.lightTick += dt;
    if (this.lightTick >= 0.1) {
      this.lightTick = 0;
      const l = game.world.sampleLight01(this.pos.x, this.pos.y, this.pos.z);
      const d = game.dynLights.sampleAt(this.pos.x, this.pos.y, this.pos.z);
      const lum = 0.45 + (l[0] + l[1] + l[2]) * 0.35;
      const r = Math.min(1.3, lum + l[0] * 0.9 + d[0]);
      const g = Math.min(1.3, lum + l[1] * 0.9 + d[1]);
      const b = Math.min(1.3, lum + l[2] * 0.9 + d[2]);
      this.mesh.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || o.userData.fullBright) return;
        const m = o.material as THREE.MeshBasicMaterial;
        const base = o.userData.baseColor as THREE.Color;
        m.color.setRGB(base.r * r, base.g * g, base.b * b);
      });
    }
  }

  dispose(): void {
    this.mesh.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      } else if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }
}
