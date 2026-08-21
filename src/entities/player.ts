import * as THREE from 'three';
import { moveBody, Box } from '../core/physics';
import { Input } from '../core/input';
import { KeyColor, AmmoType } from '../types';
import type { Game } from '../game';

const EYE_OFFSET = 0.62; // eyes above body center
const MAX_SPEED = 7.8;
const ACCEL_GROUND = 70;
const ACCEL_AIR = 16;
const FRICTION = 9;
const GRAVITY = 24;
const JUMP_VEL = 8.5;

export class Player {
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly half = new THREE.Vector3(0.34, 0.88, 0.34);
  yaw = 0;
  pitch = 0;
  onGround = false;
  health = 100;
  armor = 0;
  readonly maxHealth = 100;
  readonly maxArmor = 100;
  readonly keys = new Set<KeyColor>();
  readonly ammo: Record<AmmoType, number> = { bullets: 48, shells: 0, rockets: 0 };
  readonly ammoMax: Record<AmmoType, number> = { bullets: 240, shells: 60, rockets: 30 };
  dead = false;
  /** recoil pitch offset applied by weapons, recovers over time */
  recoilPitch = 0;
  /** mouse sensitivity multiplier (settings) */
  sensitivity = 1;
  /** 0 disables camera shake (settings) */
  shakeScale = 1;
  private bobPhase = 0;
  private bobAmp = 0;
  private lastStride = 0;
  /** brief camera shake magnitude (explosions) */
  shake = 0;

  spawnAt(x: number, y: number, z: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
  }

  eyeY(): number {
    return this.pos.y + EYE_OFFSET;
  }

  hasKey(c: KeyColor): boolean {
    return this.keys.has(c);
  }

  addAmmo(type: AmmoType, amount: number): boolean {
    if (this.ammo[type] >= this.ammoMax[type]) return false;
    this.ammo[type] = Math.min(this.ammoMax[type], this.ammo[type] + amount);
    return true;
  }

  heal(amount: number): boolean {
    if (this.health >= this.maxHealth) return false;
    this.health = Math.min(this.maxHealth, this.health + amount);
    return true;
  }

  addArmor(amount: number): boolean {
    if (this.armor >= this.maxArmor) return false;
    this.armor = Math.min(this.maxArmor, this.armor + amount);
    return true;
  }

  damage(amount: number, game: Game, source?: { x: number; z: number }): void {
    if (this.dead) return;
    // armor soaks a third of incoming damage
    const soak = Math.min(this.armor, Math.ceil(amount / 3));
    this.armor -= soak;
    this.health -= amount - soak;
    game.hud.damageFlash();
    // directional hit indicator: angle of the source relative to where we face
    if (source) {
      const dx = source.x - this.pos.x;
      const dz = source.z - this.pos.z;
      const len = Math.hypot(dx, dz);
      if (len > 0.4) {
        const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
        const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
        const f = (dx * fx + dz * fz) / len;
        const r = (dx * rx + dz * rz) / len;
        game.hud.damageIndicator((Math.atan2(r, f) * 180) / Math.PI);
      }
    }
    this.shake = Math.min(0.5, this.shake + amount * 0.008);
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      game.audio.play('playerDie');
      game.onPlayerDeath();
    } else {
      game.audio.play('playerPain');
    }
    game.hud.updateStats(this);
  }

  update(dt: number, input: Input, game: Game, extraBoxes: Box[]): void {
    // mouse look
    const [mdx, mdy] = input.consumeMouse();
    if (!this.dead) {
      let sens = 0.0022 * this.sensitivity;
      // sticky aim (touch only): tracking friction while aiming near a target
      if (game.isTouch && game.settings.aimAssist && (mdx !== 0 || mdy !== 0) && this.aimNearEnemy(game)) {
        sens *= 0.55;
      }
      this.yaw -= mdx * sens;
      this.pitch -= mdy * sens;
      this.pitch = Math.max(-1.55, Math.min(1.55, this.pitch));
    }

    // recoil recovery
    this.recoilPitch *= Math.exp(-10 * dt);
    this.shake *= Math.exp(-6 * dt);

    // movement
    const fwd = this.dead ? 0 : input.forward;
    const str = this.dead ? 0 : input.strafe;
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    // forward is local -z rotated by yaw: (-sin, -cos); right is local +x: (cos, -sin)
    let wx = -sinY * fwd + cosY * str;
    let wz = -cosY * fwd - sinY * str;
    const wl = Math.hypot(wx, wz);
    if (wl > 0.001) {
      wx /= wl;
      wz /= wl;
    }

    const accel = this.onGround ? ACCEL_GROUND : ACCEL_AIR;
    if (wl > 0.001) {
      this.vel.x += wx * accel * dt;
      this.vel.z += wz * accel * dt;
    } else if (this.onGround) {
      const f = Math.exp(-FRICTION * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }
    // clamp horizontal speed
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > MAX_SPEED) {
      this.vel.x *= MAX_SPEED / hs;
      this.vel.z *= MAX_SPEED / hs;
    }

    this.vel.y -= GRAVITY * dt;
    if (this.onGround && input.jump && !this.dead) {
      this.vel.y = JUMP_VEL;
    }

    const res = moveBody(game.world, this.pos, this.half, this.vel, dt, extraBoxes);
    this.onGround = res.onGround;

    // view bob
    const speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && speed > 0.5) {
      this.bobPhase += dt * speed * 1.55;
      this.bobAmp = Math.min(1, this.bobAmp + dt * 6);
    } else {
      this.bobAmp = Math.max(0, this.bobAmp - dt * 6);
    }
    // soft footsteps on each stride
    if (this.onGround && speed > 2.5 && !this.dead) {
      const stride = Math.sin(this.bobPhase * 2);
      if (stride <= 0 !== this.lastStride <= 0) game.audio.play('step');
      this.lastStride = stride;
    }
  }

  /** is a live, visible enemy within a small cone of the aim direction? */
  private aimNearEnemy(game: Game): boolean {
    const CONE = 0.1; // ~6 degrees
    const cosPitch = Math.cos(this.pitch);
    const fx = -Math.sin(this.yaw) * cosPitch;
    const fy = Math.sin(this.pitch);
    const fz = -Math.cos(this.yaw) * cosPitch;
    const hFwd = Math.hypot(fx, fz);
    if (hFwd < 0.05) return false;
    const ox = this.pos.x;
    const oy = this.eyeY();
    const oz = this.pos.z;
    for (const e of game.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - ox;
      const dz = e.pos.z - oz;
      const hDist = Math.hypot(dx, dz);
      if (hDist > 30 || hDist < 1) continue;
      // vertical error measured against the enemy's body span, not its center
      const rayY = oy + (fy / hFwd) * hDist;
      const ty = Math.max(e.pos.y - e.half.y + 0.15, Math.min(e.pos.y + e.half.y - 0.1, rayY));
      const dy = ty - oy;
      const dist = Math.sqrt(hDist * hDist + dy * dy);
      const dot = (dx * fx + dy * fy + dz * fz) / dist;
      if (dot < Math.cos(CONE)) continue;
      if (game.hasLOS(ox, oy, oz, e.pos.x, ty, e.pos.z)) return true;
    }
    return false;
  }

  /** apply position/orientation to the camera */
  applyToCamera(camera: THREE.PerspectiveCamera, time: number): void {
    const bobY = Math.sin(this.bobPhase * 2) * 0.045 * this.bobAmp;
    const sh = this.shake * this.shakeScale;
    const shakeX = sh * Math.sin(time * 71) * 0.5;
    const shakeY = sh * Math.sin(time * 89 + 1) * 0.5;
    camera.position.set(this.pos.x, this.eyeY() + bobY + (this.dead ? -0.45 : 0), this.pos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch + this.recoilPitch + shakeY * 0.05;
    camera.rotation.z = (this.dead ? 0.6 : 0) + shakeX * 0.03 + Math.sin(this.bobPhase) * 0.006 * this.bobAmp;
  }
}
