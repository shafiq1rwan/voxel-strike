import * as THREE from 'three';
import type { Game } from '../game';
import type { RoomDef, EnemySpec } from '../types';
import type { Enemy } from './enemies';
import type { Box } from '../core/physics';
import { WEAPONS } from '../weapons/weapons';

export type OverloadReward = 'focus' | 'repair' | 'ammo';
export type OverloadStatus = 'idle' | 'active' | 'ready' | 'claimed';

/** Optional solo encounter. No door locks, mandatory route changes or timers. */
export class Overload {
  readonly group = new THREE.Group();
  status: OverloadStatus = 'idle';
  wave = 0;
  private pending = 0;
  private timer = 0;
  private enemies: Enemy[] = [];
  private announced = false;
  private readonly display: THREE.MeshBasicMaterial;
  readonly box: Box;

  private constructor(readonly room: RoomDef, readonly x: number, readonly z: number) {
    this.group.name = 'overload-terminal';
    const add = (w: number, h: number, d: number, color: number, y: number, zz = 0): THREE.Mesh => {
      const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace) });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z + zz);
      this.group.add(mesh);
      return mesh;
    };
    add(0.84, 0.16, 0.7, 0x39404f, 1.08);
    add(0.64, 0.86, 0.46, 0x566076, 1.59);
    add(0.82, 0.52, 0.18, 0x252a34, 2.1, 0.13);
    this.display = add(0.68, 0.34, 0.03, 0x34d0ff, 2.1, 0.24).material as THREE.MeshBasicMaterial;
    add(0.6, 0.05, 0.08, 0xffd028, 1.44, 0.24);
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 48;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#09131b'; ctx.fillRect(0, 0, 128, 48);
    ctx.textAlign = 'center'; ctx.fillStyle = '#65e5ff';
    ctx.font = 'bold 18px monospace'; ctx.fillText('OVERLOAD', 64, 22);
    ctx.font = 'bold 11px monospace'; ctx.fillText('OPTIONAL', 64, 39);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = texture.magFilter = THREE.NearestFilter;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.56), new THREE.MeshBasicMaterial({ map: texture }));
    sign.position.set(x, 2.9, z);
    this.group.add(sign);
    this.box = { minX: x - 0.43, maxX: x + 0.43, minY: 1, maxY: 2.37, minZ: z - 0.36, maxZ: z + 0.36 };
  }

  static create(game: Game): Overload | null {
    const rooms = game.level.rooms.filter((r) => r.kind === 'normal' && r.dist >= 1)
      .sort((a, b) => a.dist - b.dist || a.id - b.id);
    for (const room of rooms) {
      for (let x = room.x + 1.5; x <= room.x + room.w - 2.5; x++) {
        const z = room.z + 1.5;
        let clear = true;
        for (let dx = -1; dx <= 1; dx++) for (let dz = 0; dz <= 2; dz++) {
          const xx = Math.floor(x + dx), zz = Math.floor(z + dz);
          if (!game.world.isSolid(xx, 0, zz) || game.world.isSolid(xx, 1, zz) || game.world.isSolid(xx, 2, zz)) clear = false;
        }
        if (clear && game.level.pickups.every((p) => Math.hypot(p.x - x, p.z - z) > 1.5) &&
          game.level.enemies.every((e) => Math.hypot(e.x - x, e.z - z) > 1.5)) return new Overload(room, x, z);
      }
    }
    return null;
  }

  near(game: Game): boolean {
    const p = game.player;
    return !p.dead && Math.abs(p.pos.y - 1.88) < 1 && Math.hypot(p.pos.x - this.x, p.pos.z - this.z) < 2.7 &&
      game.hasLOS(p.pos.x, p.eyeY(), p.pos.z, this.x, 2.1, this.z);
  }

  start(): boolean {
    if (this.status !== 'idle') return false;
    this.status = 'active'; this.wave = 1; this.pending = 2; this.timer = 1.5;
    return true;
  }

  update(dt: number, game: Game): void {
    const near = this.near(game);
    if (near && !this.announced) {
      this.announced = true;
      game.hud.message('Overload: 2 waves, 1 reward.');
    }
    this.display.color.setHex(this.status === 'active' ? 0xffa030 : this.status === 'claimed' ? 0x566076 : 0x34d0ff, THREE.LinearSRGBColorSpace);
    if (this.status === 'active') {
      this.timer = Math.max(0, this.timer - dt);
      if (this.pending > 0 && this.timer === 0 && this.inside(game)) {
        this.spawn(game);
        this.timer = 0.45;
      }
      if (this.pending === 0 && this.enemies.every((e) => !e.alive)) {
        if (this.wave === 1) {
          this.wave = 2; this.pending = 2; this.timer = 1.5; this.enemies = [];
          game.hud.message('Wave 1 clear. Wave 2 incoming.');
        } else {
          this.status = 'ready';
          game.audio.play('secret');
          game.hud.message('Overload clear! Claim your reward at the terminal.');
        }
      }
    }
    const active = this.status === 'active';
    const text = active ? `OVERLOAD ${this.wave}/2 · ${this.enemies.filter((e) => e.alive).length + this.pending} remaining${this.inside(game) ? '' : ' · return to room'}` :
      near && this.status !== 'claimed' ? `${game.isTouch ? 'TAP' : 'E'} · ${this.status === 'ready' ? 'Choose Overload reward' : 'Inspect Overload'}` : '';
    game.hud.setOverloadAction(text, !active && this.status !== 'claimed' && near);
  }

  private inside(game: Game): boolean {
    const p = game.player.pos, r = this.room;
    return p.x > r.x && p.x < r.x + r.w && p.z > r.z && p.z < r.z + r.d && Math.abs(p.y - 1.88) < 1;
  }

  private spawn(game: Game): void {
    const r = this.room;
    for (let z = r.z + 1; z < r.z + r.d - 1; z++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
      const px = x + 0.5, pz = z + 0.5;
      if (!game.world.isSolid(x, 0, z) || game.world.isSolid(x, 1, z) || game.world.isSolid(x, 2, z)) continue;
      if (Math.hypot(game.player.pos.x - px, game.player.pos.z - pz) < 4 || Math.hypot(this.x - px, this.z - pz) < 1.5) continue;
      if (game.enemies.list.some((e) => e.alive && Math.hypot(e.pos.x - px, e.pos.z - pz) < 1.5)) continue;
      // Check the real doorway boxes as well as voxels before placing a body.
      if (game.solidBoxes().some((b) => px + 0.46 > b.minX && px - 0.46 < b.maxX && pz + 0.46 > b.minZ && pz - 0.46 < b.maxZ && b.minY < 3 && b.maxY > 1)) continue;
      const kind: EnemySpec['kind'] = this.wave === 2 && this.pending === 1 ? 'sentinel' : 'husk';
      // Sentinels hover higher, so reserve their entire spawn volume.
      if (kind === 'sentinel' && (game.world.isSolid(x, 3, z) || game.world.isSolid(x, 4, z))) continue;
      const index = game.enemies.list.length;
      game.enemies.spawnFromSpecs([{ kind, x: px, z: pz, roomId: r.id }], game.level.rooms, game);
      const enemy = game.enemies.list[index];
      enemy.wake(game);
      this.enemies.push(enemy);
      game.level.totalEnemies++;
      game.spawnFX(px, enemy.pos.y, pz);
      this.pending--;
      return;
    }
  }

  canClaim(reward: OverloadReward, game: Game): boolean {
    if (this.status !== 'ready') return false;
    if (reward === 'focus') return game.weapons.has('shotgun') && !game.weapons.focusedShotgun;
    if (reward === 'repair') return game.player.health < game.player.maxHealth || game.player.armor < 100;
    const type = WEAPONS[game.weapons.current].ammoType;
    return game.player.ammo[type] < game.player.ammoMax[type];
  }

  claim(reward: OverloadReward, game: Game): boolean {
    if (!this.canClaim(reward, game)) return false;
    if (reward === 'focus') game.weapons.focusedShotgun = true;
    else if (reward === 'repair') {
      game.player.heal(25);
      game.player.armor = Math.min(100, game.player.armor + 15);
    } else {
      const type = WEAPONS[game.weapons.current].ammoType;
      game.player.addAmmo(type, { bullets: 30, shells: 8, rockets: 2, cells: 8, special: 4 }[type]);
    }
    this.status = 'claimed';
    game.hud.updateStats(game.player);
    game.hud.updateWeapon(game.weapons);
    game.audio.play('secret');
    game.hud.message(reward === 'focus' ? 'Focused Shotgun equipped.' : reward === 'repair' ? 'Field Repair applied.' : 'Ammo refilled.');
    return true;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const m = o.material as THREE.MeshBasicMaterial;
        m.map?.dispose(); m.dispose();
      }
    });
  }
}
