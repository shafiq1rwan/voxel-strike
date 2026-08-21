import * as THREE from 'three';
import type { Game } from '../game';
import { rayBox } from '../core/physics';

type ProjKind = 'rocket' | 'bolt';

class Projectile {
  alive = false;
  kind: ProjKind = 'rocket';
  x = 0; y = 0; z = 0;
  dx = 0; dy = 0; dz = 0;
  speed = 0;
  life = 0;
  fromPlayer = true;
  /** damage multiplier (quad-damage rockets) */
  dmgMult = 1;
  readonly mesh: THREE.Group;

  constructor(kind: ProjKind) {
    this.kind = kind;
    this.mesh = new THREE.Group();
    if (kind === 'rocket') {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.5),
        new THREE.MeshBasicMaterial({ color: 0x9aa2b4, fog: true })
      );
      const nose = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.16),
        new THREE.MeshBasicMaterial({ color: 0xd8443c, fog: true })
      );
      nose.position.z = -0.3;
      const flame = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.12, 0.3),
        new THREE.MeshBasicMaterial({ color: 0xffb340, fog: false })
      );
      flame.position.z = 0.35;
      this.mesh.add(body, nose, flame);
    } else {
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshBasicMaterial({ color: 0x66e0ff, fog: false })
      );
      const halo = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.34, 0.34),
        new THREE.MeshBasicMaterial({ color: 0x2288cc, transparent: true, opacity: 0.4, fog: false })
      );
      this.mesh.add(core, halo);
    }
    this.mesh.visible = false;
  }
}

/** Object-pooled projectiles: player rockets and enemy plasma bolts. */
export class ProjectilePool {
  readonly group = new THREE.Group();
  private rockets: Projectile[] = [];
  private bolts: Projectile[] = [];

  constructor() {
    for (let i = 0; i < 12; i++) {
      const p = new Projectile('rocket');
      this.rockets.push(p);
      this.group.add(p.mesh);
    }
    for (let i = 0; i < 32; i++) {
      const p = new Projectile('bolt');
      this.bolts.push(p);
      this.group.add(p.mesh);
    }
  }

  spawn(kind: ProjKind, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, fromPlayer: boolean, dmgMult = 1): void {
    const pool = kind === 'rocket' ? this.rockets : this.bolts;
    const p = pool.find((q) => !q.alive) ?? pool[0];
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.dx = dx; p.dy = dy; p.dz = dz;
    p.speed = speed;
    p.life = 6;
    p.fromPlayer = fromPlayer;
    p.dmgMult = dmgMult;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.lookAt(x - dx, y - dy, z - dz); // rocket model faces -z (nose at -z)
  }

  private kill(p: Projectile): void {
    p.alive = false;
    p.mesh.visible = false;
  }

  /** deactivate everything (level teardown) — the pool itself is reused */
  reset(): void {
    for (const pool of [this.rockets, this.bolts]) {
      for (const p of pool) this.kill(p);
    }
  }

  update(dt: number, game: Game): void {
    for (const pool of [this.rockets, this.bolts]) {
      for (const p of pool) {
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) {
          this.kill(p);
          continue;
        }
        const step = p.speed * dt;
        const nx = p.x + p.dx * step;
        const ny = p.y + p.dy * step;
        const nz = p.z + p.dz * step;

        // voxel collision along the travel segment
        const hit = game.world.raycast(p.x, p.y, p.z, p.dx, p.dy, p.dz, step);
        // closed doors
        let doorT: number | null = null;
        for (const d of game.doors) {
          if (d.isOpen) continue;
          const t = rayBox(p.x, p.y, p.z, p.dx, p.dy, p.dz, step, d.box());
          if (t !== null && (doorT === null || t < doorT)) doorT = t;
        }

        let hitT = hit ? hit.t : Infinity;
        if (doorT !== null && doorT < hitT) hitT = doorT;

        // entity collision
        if (p.fromPlayer) {
          const eh = game.enemies.raycast(p.x, p.y, p.z, p.dx, p.dy, p.dz, Math.min(step, hitT));
          if (eh) {
            if (p.kind === 'rocket') {
              game.explode(p.x + p.dx * eh.t, p.y + p.dy * eh.t, p.z + p.dz * eh.t, 90 * p.dmgMult, 3.5);
            } else {
              eh.enemy.damage(10, p.dx, p.dz, game);
            }
            this.kill(p);
            continue;
          }
        } else {
          const pl = game.player;
          const t = rayBox(p.x, p.y, p.z, p.dx, p.dy, p.dz, Math.min(step, hitT), {
            minX: pl.pos.x - pl.half.x, maxX: pl.pos.x + pl.half.x,
            minY: pl.pos.y - pl.half.y, maxY: pl.pos.y + pl.half.y,
            minZ: pl.pos.z - pl.half.z, maxZ: pl.pos.z + pl.half.z,
          });
          if (t !== null) {
            pl.damage(10, game, { x: p.x - p.dx * 2, z: p.z - p.dz * 2 });
            game.particles.impact(p.x, p.y, p.z, -p.dx, -p.dy, -p.dz, 0.4, 0.8, 1);
            game.audio.play('boltHit', { x: p.x, y: p.y, z: p.z });
            this.kill(p);
            continue;
          }
        }

        if (hitT <= step) {
          const hx = p.x + p.dx * hitT;
          const hy = p.y + p.dy * hitT;
          const hz = p.z + p.dz * hitT;
          if (p.kind === 'rocket') {
            game.explode(hx - p.dx * 0.1, hy - p.dy * 0.1, hz - p.dz * 0.1, 90 * p.dmgMult, 3.5);
          } else {
            game.particles.impact(hx, hy, hz, -p.dx, -p.dy, -p.dz, 0.4, 0.8, 1);
            game.audio.play('boltHit', { x: hx, y: hy, z: hz });
          }
          this.kill(p);
          continue;
        }

        p.x = nx; p.y = ny; p.z = nz;
        p.mesh.position.set(nx, ny, nz);
        if (p.kind === 'rocket') {
          game.particles.trail(nx - p.dx * 0.4, ny - p.dy * 0.4, nz - p.dz * 0.4, 0.6, 0.6, 0.6, 0.05);
          game.dynLights.submit(nx, ny, nz, 1, 0.7, 0.3, 0.9, 6);
        } else {
          game.particles.trail(nx, ny, nz, 0.3, 0.8, 1, 0.04);
          game.dynLights.submit(nx, ny, nz, 0.3, 0.8, 1, 0.6, 4);
          p.mesh.rotation.x += dt * 9;
          p.mesh.rotation.y += dt * 7;
        }
      }
    }
  }
}
