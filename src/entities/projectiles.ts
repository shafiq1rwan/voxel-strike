import * as THREE from 'three';
import type { Game } from '../game';
import { rayBox } from '../core/physics';

type ProjKind = 'rocket' | 'bolt' | 'acid' | 'slag';

/** what an enemy shot does to a player it hits */
const ENEMY_SHOT_DAMAGE: Record<'bolt' | 'acid' | 'slag', number> = { bolt: 10, acid: 14, slag: 14 };

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
      // bolt: sentinel plasma (cyan); acid: the Broodkeeper's globs (lime, bigger)
      const acid = kind === 'acid';
      const slag = kind === 'slag';
      const s = acid || slag ? 1.35 : 1;
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 * s, 0.22 * s, 0.22 * s),
        new THREE.MeshBasicMaterial({ color: acid ? 0xb8ff4a : slag ? 0xffe278 : 0x66e0ff, fog: false })
      );
      const halo = new THREE.Mesh(
        new THREE.BoxGeometry(0.34 * s, 0.34 * s, 0.34 * s),
        new THREE.MeshBasicMaterial({ color: acid ? 0x5aa020 : slag ? 0xff6b1a : 0x2288cc, transparent: true, opacity: 0.4, fog: false })
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
  private acids: Projectile[] = [];
  private slag: Projectile[] = [];

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
    for (let i = 0; i < 12; i++) {
      const p = new Projectile('acid');
      this.acids.push(p);
      this.group.add(p.mesh);
    }
    for (let i = 0; i < 12; i++) {
      const p = new Projectile('slag');
      this.slag.push(p);
      this.group.add(p.mesh);
    }
  }

  private poolOf(kind: ProjKind): Projectile[] {
    return kind === 'rocket' ? this.rockets : kind === 'acid' ? this.acids : kind === 'slag' ? this.slag : this.bolts;
  }

  /** the Broodkeeper died: its acid in flight goes with it */
  clearAcid(): void {
    for (const p of this.acids) this.kill(p);
  }

  spawn(kind: ProjKind, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, fromPlayer: boolean, dmgMult = 1): void {
    const pool = this.poolOf(kind);
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
    for (const pool of [this.rockets, this.bolts, this.acids, this.slag]) {
      for (const p of pool) this.kill(p);
    }
  }

  /** co-op host: compact list of live projectiles for the snapshot */
  liveList(): Array<[number, number, number, number]> {
    const out: Array<[number, number, number, number]> = [];
    for (const p of this.rockets) {
      if (p.alive) out.push([0, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
    }
    for (const p of this.bolts) {
      if (p.alive) out.push([1, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
    }
    for (const p of this.acids) {
      if (p.alive) out.push([2, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
    }
    for (const p of this.slag) if (p.alive) out.push([3, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
    return out;
  }

  /** co-op client: display the host's projectiles as position-driven puppets */
  syncRemote(list: Array<[number, number, number, number]>): void {
    for (const pool of [this.rockets, this.bolts, this.acids, this.slag]) {
      for (const p of pool) p.mesh.visible = false;
    }
    let ri = 0;
    let bi = 0;
    let ai = 0;
    let si = 0;
    for (const [kind, x, y, z] of list) {
      const pool = kind === 0 ? this.rockets : kind === 2 ? this.acids : kind === 3 ? this.slag : this.bolts;
      const idx = kind === 0 ? ri++ : kind === 2 ? ai++ : kind === 3 ? si++ : bi++;
      if (idx >= pool.length) continue;
      const p = pool[idx];
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
    }
  }

  update(dt: number, game: Game): void {
    for (const pool of [this.rockets, this.bolts, this.acids, this.slag]) {
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
              game.detonate(p.x + p.dx * eh.t, p.y + p.dy * eh.t, p.z + p.dz * eh.t, 90 * p.dmgMult, game.blastRadius(3.5));
            } else {
              eh.enemy.damage(10, p.dx, p.dz, game);
            }
            this.kill(p);
            continue;
          }
        } else {
          // enemy bolts can hit either player (host + co-op partner)
          let struck = false;
          for (const pl of game.playerTargets()) {
            if (pl.dead) continue;
            const t = rayBox(p.x, p.y, p.z, p.dx, p.dy, p.dz, Math.min(step, hitT), {
              minX: pl.pos.x - pl.half.x, maxX: pl.pos.x + pl.half.x,
              minY: pl.pos.y - pl.half.y, maxY: pl.pos.y + pl.half.y,
              minZ: pl.pos.z - pl.half.z, maxZ: pl.pos.z + pl.half.z,
            });
            if (t !== null) {
              pl.damage(ENEMY_SHOT_DAMAGE[p.kind === 'acid' ? 'acid' : p.kind === 'slag' ? 'slag' : 'bolt'], game, { x: p.x - p.dx * 2, z: p.z - p.dz * 2 });
              if (p.kind === 'acid') game.particles.impact(p.x, p.y, p.z, -p.dx, -p.dy, -p.dz, 0.6, 1, 0.25);
              else game.particles.impact(p.x, p.y, p.z, -p.dx, -p.dy, -p.dz, p.kind === 'slag' ? 1 : .4, p.kind === 'slag' ? .5 : .8, p.kind === 'slag' ? .05 : 1);
              game.audio.play('boltHit', { x: p.x, y: p.y, z: p.z });
              struck = true;
              break;
            }
          }
          if (struck) {
            this.kill(p);
            continue;
          }
        }

        if (hitT <= step) {
          const hx = p.x + p.dx * hitT;
          const hy = p.y + p.dy * hitT;
          const hz = p.z + p.dz * hitT;
          if (p.kind === 'rocket') {
            game.detonate(hx - p.dx * 0.1, hy - p.dy * 0.1, hz - p.dz * 0.1, 90 * p.dmgMult, game.blastRadius(3.5));
          } else if (p.kind === 'acid') {
            game.particles.impact(hx, hy, hz, -p.dx, -p.dy, -p.dz, 0.6, 1, 0.25);
            game.audio.play('boltHit', { x: hx, y: hy, z: hz });
          } else {
            game.particles.impact(hx, hy, hz, -p.dx, -p.dy, -p.dz, p.kind === 'slag' ? 1 : .4, p.kind === 'slag' ? .5 : .8, p.kind === 'slag' ? .05 : 1);
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
        } else if (p.kind === 'acid') {
          game.particles.trail(nx, ny, nz, 0.55, 1, 0.2, 0.05);
          game.dynLights.submit(nx, ny, nz, 0.5, 1, 0.2, 0.7, 4);
          p.mesh.rotation.x += dt * 6;
          p.mesh.rotation.z += dt * 5;
        } else {
          game.particles.trail(nx, ny, nz, p.kind === 'slag' ? 1 : .3, p.kind === 'slag' ? .45 : .8, p.kind === 'slag' ? .05 : 1, .04);
          game.dynLights.submit(nx, ny, nz, p.kind === 'slag' ? 1 : .3, p.kind === 'slag' ? .4 : .8, p.kind === 'slag' ? .05 : 1, .6, 4);
          p.mesh.rotation.x += dt * 9;
          p.mesh.rotation.y += dt * 7;
        }
      }
    }
  }
}
