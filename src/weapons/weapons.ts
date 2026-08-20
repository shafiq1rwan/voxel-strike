import * as THREE from 'three';
import { AmmoType, WeaponId } from '../types';
import { Input } from '../core/input';
import { rayBox } from '../core/physics';
import type { Game } from '../game';

interface WeaponDef {
  id: WeaponId;
  name: string;
  ammoType: AmmoType;
  ammoPerShot: number;
  damage: number;
  pellets: number;
  spread: number;
  /** shots per second (all weapons repeat while the trigger is held) */
  rate: number;
  projectile: boolean;
  recoil: number;
  kick: number;
  sound: 'pistol' | 'shotgun' | 'smg' | 'rocketLaunch';
  flashScale: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'SIDEARM', ammoType: 'bullets', ammoPerShot: 1,
    damage: 14, pellets: 1, spread: 0.012, rate: 3.4,
    projectile: false, recoil: 0.028, kick: 0.06, sound: 'pistol', flashScale: 0.5,
  },
  shotgun: {
    id: 'shotgun', name: 'SCATTERGUN', ammoType: 'shells', ammoPerShot: 1,
    damage: 7, pellets: 7, spread: 0.062, rate: 1.05,
    projectile: false, recoil: 0.065, kick: 0.14, sound: 'shotgun', flashScale: 0.85,
  },
  smg: {
    id: 'smg', name: 'RIPPER', ammoType: 'bullets', ammoPerShot: 1,
    damage: 9, pellets: 1, spread: 0.034, rate: 9.5,
    projectile: false, recoil: 0.016, kick: 0.05, sound: 'smg', flashScale: 0.45,
  },
  rocket: {
    id: 'rocket', name: 'THUMPER', ammoType: 'rockets', ammoPerShot: 1,
    damage: 0, pellets: 0, spread: 0, rate: 0.85,
    projectile: true, recoil: 0.08, kick: 0.2, sound: 'rocketLaunch', flashScale: 0.9,
  },
};

const ORDER: WeaponId[] = ['pistol', 'shotgun', 'smg', 'rocket'];

function vmPart(parent: THREE.Object3D, w: number, h: number, d: number, color: number): THREE.Mesh {
  const m = new THREE.MeshBasicMaterial({ color, depthTest: false, fog: false });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.renderOrder = 1000;
  mesh.userData.baseColor = new THREE.Color(color);
  parent.add(mesh);
  return mesh;
}

function makeFlashTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,240,180,1)');
  grad.addColorStop(0.35, 'rgba(255,180,60,0.9)');
  grad.addColorStop(0.7, 'rgba(255,90,20,0.35)');
  grad.addColorStop(1, 'rgba(255,60,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** Weapon inventory + firing + first-person view model. */
export class WeaponSystem {
  readonly viewModel = new THREE.Group();
  private owned = new Set<WeaponId>(['pistol']);
  current: WeaponId = 'pistol';
  private pending: WeaponId | null = null;
  private raiseT = 1; // 0 lowered, 1 raised
  private cooldown = 0;
  private kickZ = 0;
  private flashTime = 0;
  private models = new Map<WeaponId, THREE.Group>();
  private flash: THREE.Mesh;
  private muzzleTips = new Map<WeaponId, number>(); // z of muzzle for flash placement
  /** seconds left in the buffered-click window */
  private queuedShot = 0;
  private dryFired = false;
  private lightTick = 0;

  constructor() {
    this.viewModel.position.set(0.3, -0.34, -0.62);
    this.buildModels();
    const flashMat = new THREE.MeshBasicMaterial({
      map: makeFlashTexture(), transparent: true, blending: THREE.AdditiveBlending,
      depthTest: false, depthWrite: false, fog: false,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);
    this.flash.renderOrder = 1001;
    this.flash.visible = false;
    this.viewModel.add(this.flash);
    this.showModel(this.current);
  }

  private buildModels(): void {
    // SIDEARM — compact pistol
    {
      const g = new THREE.Group();
      const slide = vmPart(g, 0.09, 0.09, 0.34, 0x565e70);
      slide.position.set(0, 0.02, -0.1);
      const frame = vmPart(g, 0.08, 0.07, 0.26, 0x3a404e);
      frame.position.set(0, -0.05, -0.05);
      const grip = vmPart(g, 0.075, 0.16, 0.09, 0x2a2e38);
      grip.position.set(0, -0.14, 0.06);
      grip.rotation.x = 0.25;
      const sight = vmPart(g, 0.02, 0.03, 0.03, 0x222630);
      sight.position.set(0, 0.08, -0.24);
      this.models.set('pistol', g);
      this.muzzleTips.set('pistol', -0.32);
    }
    // SCATTERGUN — pump shotgun
    {
      const g = new THREE.Group();
      const barrel = vmPart(g, 0.1, 0.1, 0.62, 0x4c5364);
      barrel.position.set(0, 0.03, -0.25);
      const tube = vmPart(g, 0.07, 0.07, 0.5, 0x393f4c);
      tube.position.set(0, -0.06, -0.2);
      const pump = vmPart(g, 0.13, 0.09, 0.18, 0x6d4a2a);
      pump.position.set(0, -0.07, -0.3);
      const stock = vmPart(g, 0.09, 0.13, 0.3, 0x5c3e22);
      stock.position.set(0, -0.06, 0.18);
      const rib = vmPart(g, 0.02, 0.02, 0.5, 0x666e80);
      rib.position.set(0, 0.09, -0.25);
      this.models.set('shotgun', g);
      this.muzzleTips.set('shotgun', -0.6);
    }
    // RIPPER — boxy SMG
    {
      const g = new THREE.Group();
      const body = vmPart(g, 0.11, 0.14, 0.42, 0x424858);
      body.position.set(0, -0.02, -0.08);
      const barrel = vmPart(g, 0.06, 0.06, 0.24, 0x565e70);
      barrel.position.set(0, 0.01, -0.38);
      const shroud = vmPart(g, 0.09, 0.09, 0.14, 0x333845);
      shroud.position.set(0, 0.01, -0.3);
      const mag = vmPart(g, 0.07, 0.22, 0.1, 0x2a2e38);
      mag.position.set(0, -0.2, -0.02);
      mag.rotation.x = -0.15;
      const sight = vmPart(g, 0.03, 0.04, 0.06, 0x222630);
      sight.position.set(0, 0.09, -0.15);
      this.models.set('smg', g);
      this.muzzleTips.set('smg', -0.5);
    }
    // THUMPER — rocket launcher
    {
      const g = new THREE.Group();
      const tube = vmPart(g, 0.17, 0.17, 0.7, 0x3f5a3f);
      tube.position.set(0, 0.02, -0.15);
      const muzzle = vmPart(g, 0.21, 0.21, 0.12, 0x2a3a2a);
      muzzle.position.set(0, 0.02, -0.52);
      const back = vmPart(g, 0.19, 0.19, 0.08, 0x2a3a2a);
      back.position.set(0, 0.02, 0.22);
      const grip = vmPart(g, 0.06, 0.14, 0.08, 0x222630);
      grip.position.set(0, -0.12, -0.05);
      const stripe = vmPart(g, 0.18, 0.03, 0.2, 0xc8a030);
      stripe.position.set(0, 0.02, -0.4);
      g.scale.setScalar(0.72);
      g.position.set(0.04, -0.03, 0);
      this.models.set('rocket', g);
      this.muzzleTips.set('rocket', -0.5);
    }
    for (const [, g] of this.models) {
      g.visible = false;
      this.viewModel.add(g);
    }
  }

  private showModel(id: WeaponId): void {
    for (const [k, g] of this.models) g.visible = k === id;
  }

  give(id: WeaponId): void {
    this.owned.add(id);
    this.switchTo(id);
  }

  has(id: WeaponId): boolean {
    return this.owned.has(id);
  }

  switchTo(id: WeaponId): void {
    if (!this.owned.has(id) || id === this.current || this.pending === id) return;
    this.pending = id;
  }

  update(dt: number, input: Input, game: Game): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.kickZ *= Math.exp(-9 * dt);
    this.flash.visible = this.flashTime > 0;

    // switch requests
    const req = input.consumeSwitch();
    if (req !== null && !game.player.dead) {
      if (req >= 0) {
        this.switchTo(ORDER[req]);
      } else {
        // wheel: -1 prev, -2 next among owned
        const ownedList = ORDER.filter((w) => this.owned.has(w));
        const idx = ownedList.indexOf(this.current);
        const step = req === -2 ? 1 : -1;
        const next = ownedList[(idx + step + ownedList.length) % ownedList.length];
        this.switchTo(next);
      }
    }

    // raise/lower animation
    if (this.pending) {
      this.raiseT -= dt * 6;
      if (this.raiseT <= 0) {
        this.current = this.pending;
        this.pending = null;
        this.showModel(this.current);
        game.hud.updateWeapon(this);
      }
    } else if (this.raiseT < 1) {
      this.raiseT = Math.min(1, this.raiseT + dt * 6);
    }

    // firing: hold-to-fire at the weapon's rate; a click during cooldown is
    // buffered briefly so spam-clicking never eats shots
    const def = WEAPONS[this.current];
    if (input.consumeFirePress() && !game.player.dead) {
      this.queuedShot = 0.25;
      this.dryFired = false;
    }
    this.queuedShot = Math.max(0, this.queuedShot - dt);
    const canAct = !game.player.dead && this.pending === null && this.raiseT > 0.9;
    const wantFire = canAct && (input.fire || this.queuedShot > 0);
    if (wantFire && this.cooldown === 0) {
      if (game.player.ammo[def.ammoType] >= def.ammoPerShot) {
        this.fire(def, game);
      } else if (!this.dryFired) {
        this.dryFired = true;
        game.audio.play('dryfire');
        // auto-switch away from an empty weapon feels bad; just click.
      }
      this.cooldown = 1 / def.rate;
      this.queuedShot = 0;
    }

    this.animate(dt, game);
  }

  private fire(def: WeaponDef, game: Game): void {
    const pl = game.player;
    pl.ammo[def.ammoType] -= def.ammoPerShot;
    game.hud.updateStats(pl);
    game.audio.play(def.sound);
    pl.recoilPitch += def.recoil;
    this.kickZ += def.kick;
    this.flashTime = 0.055;
    const tipZ = this.muzzleTips.get(def.id)!;
    this.flash.position.set(0, 0.02, tipZ - 0.06);
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar(def.flashScale * (0.85 + Math.random() * 0.4));

    // dynamic light burst at the player
    game.dynLights.flash(pl.pos.x, pl.eyeY(), pl.pos.z, 1, 0.75, 0.35, 1.4, 9, 0.07);
    // gunfire wakes nearby enemies
    game.enemies.alertAt(pl.pos.x, pl.pos.z, 17, game);

    const cam = game.camera;
    const origin = new THREE.Vector3(pl.pos.x, pl.eyeY(), pl.pos.z);
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    // approximate world-space muzzle (matches the viewmodel's barrel)
    const muzzle = origin.clone()
      .addScaledVector(fwd, 0.55)
      .addScaledVector(right, 0.16)
      .addScaledVector(up, -0.14);

    // heavier weapons punch the view
    if (def.id === 'shotgun') {
      game.punchFOV(1.3);
      pl.shake = Math.min(0.5, pl.shake + 0.05);
    } else if (def.id === 'rocket') {
      game.punchFOV(1.0);
    }

    if (def.projectile) {
      const start = origin.clone().addScaledVector(fwd, 0.7);
      game.projectiles.spawn('rocket', start.x, start.y, start.z, fwd.x, fwd.y, fwd.z, 17, true);
      game.particles.smoke(muzzle.x, muzzle.y, muzzle.z, 4);
      return;
    }

    // brass + smoke off the muzzle (pushed forward so they don't fill the lens)
    game.particles.casing(muzzle.x + fwd.x * 0.2, muzzle.y - 0.06, muzzle.z + fwd.z * 0.2, right.x, right.z);
    game.particles.smoke(muzzle.x + fwd.x * 0.25, muzzle.y + 0.03, muzzle.z + fwd.z * 0.25, def.id === 'shotgun' ? 3 : 1);

    for (let i = 0; i < def.pellets; i++) {
      const dir = fwd.clone()
        .addScaledVector(right, (Math.random() * 2 - 1) * def.spread)
        .addScaledVector(up, (Math.random() * 2 - 1) * def.spread)
        .normalize();
      this.hitscan(origin, dir, def.damage, game, muzzle);
    }
  }

  private hitscan(origin: THREE.Vector3, dir: THREE.Vector3, damage: number, game: Game, muzzle: THREE.Vector3): void {
    const MAX = 60;
    const wHit = game.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, MAX);
    let wallT = wHit ? wHit.t : MAX;
    // closed doors block shots
    for (const d of game.doors) {
      if (d.isOpen) continue;
      const t = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, wallT, d.box());
      if (t !== null && t < wallT) wallT = t;
    }
    const eHit = game.enemies.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, wallT);
    if (eHit) {
      const t = eHit.t;
      game.tracers.fire(muzzle.x, muzzle.y, muzzle.z, origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t);
      eHit.enemy.damage(damage, dir.x, dir.z, game);
      game.hud.hitMarker();
      return;
    }
    if (wHit && wHit.t <= wallT) {
      const hx = origin.x + dir.x * wHit.t;
      const hy = origin.y + dir.y * wHit.t;
      const hz = origin.z + dir.z * wHit.t;
      game.tracers.fire(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz);
      game.particles.impact(hx, hy, hz, wHit.nx, wHit.ny, wHit.nz);
      game.dynLights.flash(hx + wHit.nx * 0.2, hy + wHit.ny * 0.2, hz + wHit.nz * 0.2, 1, 0.7, 0.35, 0.5, 3, 0.07);
      if (Math.random() < 0.4) game.audio.play('impact', { x: hx, y: hy, z: hz });
      // destructible voxels
      const broke = game.world.damageVoxel(wHit.x, wHit.y, wHit.z, damage);
      if (broke !== null) game.onVoxelBroken(wHit.x, wHit.y, wHit.z, broke);
    } else if (wallT < MAX) {
      // hit a door
      const hx = origin.x + dir.x * wallT;
      const hy = origin.y + dir.y * wallT;
      const hz = origin.z + dir.z * wallT;
      game.tracers.fire(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz);
      game.particles.impact(hx, hy, hz, -dir.x, -dir.y, -dir.z, 0.7, 0.7, 0.8);
    } else {
      // shot into the void — still show the streak
      game.tracers.fire(
        muzzle.x, muzzle.y, muzzle.z,
        origin.x + dir.x * MAX, origin.y + dir.y * MAX, origin.z + dir.z * MAX
      );
    }
  }

  private animate(dt: number, game: Game): void {
    const pl = game.player;
    // bob with movement
    const speed = Math.hypot(pl.vel.x, pl.vel.z);
    const bob = Math.min(1, speed / 6);
    const t = performance.now() * 0.001;
    const bobX = Math.sin(t * 7.5) * 0.012 * bob;
    const bobY = -Math.abs(Math.sin(t * 7.5)) * 0.014 * bob;
    const lower = (1 - this.raiseT) * 0.35;
    this.viewModel.position.set(0.3 + bobX, -0.34 + bobY - lower, -0.62 + this.kickZ);
    this.viewModel.rotation.x = this.kickZ * 0.9;
    this.viewModel.rotation.z = -this.kickZ * 0.35;

    // tint the gun by local light
    this.lightTick += dt;
    if (this.lightTick > 0.12) {
      this.lightTick = 0;
      const l = game.world.sampleLight01(pl.pos.x, pl.pos.y, pl.pos.z);
      const d = game.dynLights.sampleAt(pl.pos.x, pl.pos.y, pl.pos.z);
      const r = Math.min(1.25, 0.4 + l[0] * 1.4 + d[0]);
      const g = Math.min(1.25, 0.4 + l[1] * 1.4 + d[1]);
      const b = Math.min(1.25, 0.4 + l[2] * 1.4 + d[2]);
      const model = this.models.get(this.current);
      model?.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = o.material as THREE.MeshBasicMaterial;
          const base = o.userData.baseColor as THREE.Color;
          m.color.setRGB(base.r * r, base.g * g, base.b * b);
        }
      });
    }
  }
}
