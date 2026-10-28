import * as THREE from 'three';
import type { Game, PlayerTarget } from '../game';
import { rayBox } from '../core/physics';

type ProjKind = 'rocket' | 'bolt' | 'acid' | 'slag' | 'tether' | 'spike';

/** a Wire Leech: its tether bolt attaches a link on a hit (facility-monsters.ts) */
interface TetherOwner { onTetherHit(target: PlayerTarget, game: Game): void }
/** per-shot overrides: impact damage, the killer's name, the tether's owner */
export interface ShotOpts { damage?: number; by?: string; owner?: TetherOwner }

/** what an enemy shot does to a player it hits */
// bolt = the Arc Sentinel's (10 until 0.3.9: it was 59% of the 0.3.8 Player
// Fit Test's deaths; the Sentry Bud passes its own)
const ENEMY_SHOT_DAMAGE: Record<'bolt' | 'acid' | 'slag', number> = { bolt: 7, acid: 14, slag: 14 };

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
  /** enemy shots: impact damage (-1 = the kind's default) and who fired it */
  damage = -1;
  by = '';
  owner: TetherOwner | null = null;
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
    } else if (kind === 'spike') {
      // the Carapace's bone spike: a pale square shaft, point forward
      const shaft = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.1, 0.42),
        new THREE.MeshBasicMaterial({ color: 0xead9a8, fog: true })
      );
      const tip = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.06, 0.12),
        new THREE.MeshBasicMaterial({ color: 0xfff2d0, fog: true })
      );
      tip.position.z = -0.26;
      this.mesh.add(shaft, tip);
    } else {
      // bolt: sentinel plasma (cyan); acid: the Broodkeeper's globs (lime,
      // bigger); slag: the Kiln Drone's; tether: the Wire Leech's violet spark
      const acid = kind === 'acid';
      const slag = kind === 'slag';
      const tether = kind === 'tether';
      const s = acid || slag ? 1.35 : tether ? 0.85 : 1;
      const core = new THREE.Mesh(
        new THREE.BoxGeometry(0.22 * s, 0.22 * s, 0.22 * s),
        new THREE.MeshBasicMaterial({ color: acid ? 0xb8ff4a : slag ? 0xffe278 : tether ? 0xe4b8ff : 0x66e0ff, fog: false })
      );
      const halo = new THREE.Mesh(
        new THREE.BoxGeometry(0.34 * s, 0.34 * s, 0.34 * s),
        new THREE.MeshBasicMaterial({ color: acid ? 0x5aa020 : slag ? 0xff6b1a : tether ? 0x8a3ad8 : 0x2288cc, transparent: true, opacity: 0.4, fog: false })
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
  private tethers: Projectile[] = [];
  private spikes: Projectile[] = [];

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
    for (let i = 0; i < 8; i++) {
      const p = new Projectile('tether');
      this.tethers.push(p);
      this.group.add(p.mesh);
    }
    for (let i = 0; i < 18; i++) {
      const p = new Projectile('spike');
      this.spikes.push(p);
      this.group.add(p.mesh);
    }
  }

  private get pools(): Projectile[][] {
    return [this.rockets, this.bolts, this.acids, this.slag, this.tethers, this.spikes];
  }

  private poolOf(kind: ProjKind): Projectile[] {
    return kind === 'rocket' ? this.rockets : kind === 'acid' ? this.acids : kind === 'slag' ? this.slag : kind === 'tether' ? this.tethers : kind === 'spike' ? this.spikes : this.bolts;
  }

  /** the Broodkeeper died: its acid in flight goes with it */
  clearAcid(): void {
    for (const p of this.acids) this.kill(p);
  }

  spawn(kind: ProjKind, x: number, y: number, z: number, dx: number, dy: number, dz: number, speed: number, fromPlayer: boolean, dmgMult = 1, opts?: ShotOpts): void {
    const pool = this.poolOf(kind);
    const p = pool.find((q) => !q.alive) ?? pool[0];
    p.alive = true;
    p.x = x; p.y = y; p.z = z;
    p.dx = dx; p.dy = dy; p.dz = dz;
    p.speed = speed;
    p.life = 6;
    p.fromPlayer = fromPlayer;
    p.dmgMult = dmgMult;
    p.damage = opts?.damage ?? -1;
    p.by = opts?.by ?? '';
    p.owner = opts?.owner ?? null;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.lookAt(x - dx, y - dy, z - dz); // rocket model faces -z (nose at -z)
  }

  private kill(p: Projectile): void {
    p.alive = false;
    p.mesh.visible = false;
    p.owner = null;
  }

  /** deactivate everything (level teardown) — the pool itself is reused */
  reset(): void {
    for (const pool of this.pools) {
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
    for (const p of this.tethers) if (p.alive) out.push([4, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
    for (const p of this.spikes) if (p.alive) out.push([5, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)]);
    return out;
  }

  /** co-op client: display the host's projectiles as position-driven puppets */
  syncRemote(list: Array<[number, number, number, number]>): void {
    for (const pool of this.pools) {
      for (const p of pool) p.mesh.visible = false;
    }
    let ri = 0;
    let bi = 0;
    let ai = 0;
    let si = 0;
    let ti = 0;
    let ki = 0;
    for (const [kind, x, y, z] of list) {
      const pool = kind === 0 ? this.rockets : kind === 2 ? this.acids : kind === 3 ? this.slag : kind === 4 ? this.tethers : kind === 5 ? this.spikes : this.bolts;
      const idx = kind === 0 ? ri++ : kind === 2 ? ai++ : kind === 3 ? si++ : kind === 4 ? ti++ : kind === 5 ? ki++ : bi++;
      if (idx >= pool.length) continue;
      const p = pool[idx];
      p.mesh.visible = true;
      p.mesh.position.set(x, y, z);
    }
  }

  update(dt: number, game: Game): void {
    for (const pool of this.pools) {
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
              const dmg = p.damage >= 0 ? p.damage : ENEMY_SHOT_DAMAGE[p.kind === 'acid' ? 'acid' : p.kind === 'slag' ? 'slag' : 'bolt'];
              if (dmg > 0) {
                pl.damage(dmg, game,
                  { x: p.x - p.dx * 2, z: p.z - p.dz * 2, by: p.by || (p.kind === 'acid' ? 'broodkeeper' : p.kind === 'slag' ? 'kilnDrone' : 'sentinel') });
              }
              if (p.kind === 'tether') {
                p.owner?.onTetherHit(pl, game);
                game.particles.impact(p.x, p.y, p.z, -p.dx, -p.dy, -p.dz, 0.75, 0.4, 1);
              } else if (p.kind === 'acid') game.particles.impact(p.x, p.y, p.z, -p.dx, -p.dy, -p.dz, 0.6, 1, 0.25);
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
          } else if (p.kind === 'tether') {
            game.particles.impact(hx, hy, hz, -p.dx, -p.dy, -p.dz, 0.75, 0.4, 1);
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
        } else if (p.kind === 'spike') {
          // a spike flies straight and doesn't spin: it's a thrown shaft
          game.particles.trail(nx, ny, nz, 0.9, 0.85, 0.7, 0.03);
        } else if (p.kind === 'tether') {
          game.particles.trail(nx, ny, nz, 0.7, 0.35, 1, 0.04);
          game.dynLights.submit(nx, ny, nz, 0.6, 0.3, 1, 0.6, 4);
          p.mesh.rotation.x += dt * 12;
          p.mesh.rotation.z += dt * 9;
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
