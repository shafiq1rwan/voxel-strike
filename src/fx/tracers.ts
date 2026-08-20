import * as THREE from 'three';

const MAX_TRACERS = 24;

/** Pooled additive streaks drawn from muzzle to hit point for hitscan shots. */
export class Tracers {
  readonly group = new THREE.Group();
  private meshes: THREE.Mesh[] = [];
  private mats: THREE.MeshBasicMaterial[] = [];
  private life: number[] = [];
  private maxLife: number[] = [];
  private cursor = 0;

  constructor() {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < MAX_TRACERS; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd890,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      this.group.add(m);
      this.meshes.push(m);
      this.mats.push(mat);
      this.life.push(0);
      this.maxLife.push(1);
    }
  }

  fire(fx: number, fy: number, fz: number, tx: number, ty: number, tz: number): void {
    const dx = tx - fx, dy = ty - fy, dz = tz - fz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.6) return;
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_TRACERS;
    const m = this.meshes[i];
    m.position.set(fx + dx / 2, fy + dy / 2, fz + dz / 2);
    m.scale.set(0.035, 0.035, len);
    m.lookAt(tx, ty, tz);
    m.visible = true;
    this.life[i] = 0.085;
    this.maxLife[i] = 0.085;
    this.mats[i].opacity = 0.8;
  }

  update(dt: number): void {
    for (let i = 0; i < MAX_TRACERS; i++) {
      if (!this.meshes[i].visible) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.meshes[i].visible = false;
        continue;
      }
      const k = this.life[i] / this.maxLife[i];
      this.mats[i].opacity = 0.8 * k;
      this.meshes[i].scale.x = this.meshes[i].scale.y = 0.01 + 0.03 * k;
    }
  }
}
