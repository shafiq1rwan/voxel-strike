import * as THREE from 'three';
import type { PickupKind, WeaponId } from '../types';
import type { Game } from '../game';
import type { Enemy } from '../entities/enemies';
import { rayBox } from '../core/physics';
import { weaponPickup } from '../entities/pickups';

/**
 * Empty guns get thrown (owner's call): pulling the trigger on a dry weapon
 * while another one is loaded flings it end over end at what you aim at —
 * a melee-weight hit with a shove — and the next loaded gun comes up. The
 * thrown gun lands as a floor pickup you can take back (no ammo with it).
 * The sidearm is never thrown, and co-op keeps the old dry click.
 */
export const THROW = { speed: 22, lift: 1.2, gravity: 12, damage: 45, shove: 6, life: 2.5, spin: 16 };

/** the floor pickup each throwable gun comes back as */
export const GUN_PICKUP: Partial<Record<WeaponId, PickupKind>> = {
  shotgun: 'weaponShotgun', smg: 'weaponSMG', rocket: 'weaponRocket', arc: 'weaponArc',
};

interface Flying {
  id: WeaponId;
  obj: THREE.Object3D;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  t: number;
}

const _dir = new THREE.Vector3();

export class ThrownGuns {
  readonly group = new THREE.Group();
  private flying: Flying[] = [];
  /** what the last throw did (tests read it): '' | 'enemy' | 'wall' | 'spent' */
  lastResult = '';

  launch(id: WeaponId, game: Game): void {
    const pl = game.player;
    const dir = game.camera.getWorldDirection(_dir);
    const rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
    // from the hand: a little right of and below the eye, still inside the player's box
    const pos = new THREE.Vector3(pl.pos.x + rx * 0.2, pl.eyeY() - 0.15, pl.pos.z + rz * 0.2);
    const vel = new THREE.Vector3(dir.x * THROW.speed, dir.y * THROW.speed + THROW.lift, dir.z * THROW.speed);
    const obj = weaponPickup(id);
    obj.rotation.order = 'YXZ';
    obj.rotation.y = pl.yaw;
    obj.position.copy(pos);
    this.group.add(obj);
    this.flying.push({ id, obj, pos, vel, t: 0 });
    this.lastResult = '';
  }

  update(dt: number, game: Game): void {
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i];
      f.t += dt;
      f.vel.y -= THROW.gravity * dt;
      const len = f.vel.length() * dt;
      const dx = f.vel.x / f.vel.length(), dy = f.vel.y / f.vel.length(), dz = f.vel.z / f.vel.length();
      // the nearest of: an enemy body (a little forgiving), a voxel, a door / lift / prop
      let tEnemy = Infinity;
      let target: Enemy | null = null;
      for (const e of game.enemies.list) {
        if (!e.alive || e.scripted) continue;
        const pad = 0.2;
        const t = rayBox(f.pos.x, f.pos.y, f.pos.z, dx, dy, dz, len, {
          minX: e.pos.x - e.half.x - pad, maxX: e.pos.x + e.half.x + pad,
          minY: e.pos.y - e.half.y - pad, maxY: e.pos.y + e.half.y + pad,
          minZ: e.pos.z - e.half.z - pad, maxZ: e.pos.z + e.half.z + pad,
        });
        if (t !== null && t < tEnemy) { tEnemy = t; target = e; }
      }
      let tWall = Infinity;
      const hit = game.world.raycast(f.pos.x, f.pos.y, f.pos.z, dx, dy, dz, len);
      if (hit) tWall = hit.t;
      for (const b of game.solidBoxes()) {
        const t = rayBox(f.pos.x, f.pos.y, f.pos.z, dx, dy, dz, len, b);
        if (t !== null && t < tWall) tWall = t;
      }
      if (target && tEnemy <= tWall + 0.01) {
        this.strike(target, dx, dz, game);
        this.land(i, f.pos.x + dx * Math.max(0, tEnemy - 0.3), f.pos.y, f.pos.z + dz * Math.max(0, tEnemy - 0.3), game);
        this.lastResult = 'enemy';
        continue;
      }
      if (tWall < Infinity) {
        const back = Math.max(0, tWall - 0.3);
        const x = f.pos.x + dx * back, y = f.pos.y + dy * back, z = f.pos.z + dz * back;
        game.particles.impact(x, y, z, -dx, -dy, -dz, 0.8, 0.8, 0.85);
        game.audio.play('clank', { x, y, z });
        this.land(i, x, y, z, game);
        this.lastResult = 'wall';
        continue;
      }
      f.pos.addScaledVector(f.vel, dt);
      f.obj.position.copy(f.pos);
      f.obj.rotation.x -= THROW.spin * dt; // end over end
      if (f.t > THROW.life) {
        this.land(i, f.pos.x, f.pos.y, f.pos.z, game);
        this.lastResult = 'spent';
      }
    }
  }

  /** a melee-weight blow: ×2 on a staggered enemy, quad ×4, a shove */
  private strike(e: Enemy, dx: number, dz: number, game: Game): void {
    const pl = game.player;
    const crit = e.vulnerable;
    const n = Math.hypot(dx, dz) || 1;
    const nx = dx / n, nz = dz / n;
    const dmg = THROW.damage * (crit ? 2 : 1) * (pl.buffs.quad > 0 ? 4 : 1);
    game.applyEnemyHit(e, dmg, nx, nz, false);
    if (!game.isNetClient && e.alive && e.kind !== 'broodkeeper') {
      const mass = e.kind === 'brute' || e.kind === 'cinderHulk' ? 0.25 : 1;
      e.vel.x += nx * THROW.shove * mass;
      e.vel.z += nz * THROW.shove * mass;
    }
    game.audio.play('meleeHit', e.pos);
    game.particles.blood(e.pos.x, e.pos.y + 0.3, e.pos.z, nx, 0.3, nz,
      e.tuning.bloodColor[0], e.tuning.bloodColor[1], e.tuning.bloodColor[2], crit ? 14 : 8);
    if (crit) game.hud.headshotMarker();
    else game.hud.hitMarker();
    game.noise(e.pos.x, e.pos.z, 8);
  }

  /** drop to the floor below (x, y, z) as a pickup you can take back */
  private land(i: number, x: number, y: number, z: number, game: Game): void {
    const f = this.flying[i];
    this.flying.splice(i, 1);
    this.free(f);
    const w = game.world;
    let bx = Math.floor(x), bz = Math.floor(z), by = Math.floor(y);
    // never inside a wall: fall back to where it was this frame (always air)
    if (w.isSolid(bx, by, bz)) {
      bx = Math.floor(f.pos.x); bz = Math.floor(f.pos.z); by = Math.floor(f.pos.y);
      x = f.pos.x; z = f.pos.z;
    }
    let floor = 1;
    for (let yy = by; yy >= 0; yy--) {
      if (w.isSolid(bx, yy, bz)) { floor = yy + 1; break; }
    }
    const kind = GUN_PICKUP[f.id];
    if (kind) game.spawnPickup(kind, x, floor + 0.4, z, true);
  }

  private free(f: Flying): void {
    this.group.remove(f.obj);
    f.obj.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }

  /** level teardown: anything still in the air is gone */
  clear(): void {
    for (const f of this.flying) this.free(f);
    this.flying.length = 0;
  }
}
