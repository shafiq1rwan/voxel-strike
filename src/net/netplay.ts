import { Block } from '../world/blocks';
import { EnemySpec, PickupKind } from '../types';
import { RemotePlayer } from '../entities/remoteplayer';
import { LIFT_SPEED } from '../entities/door';
import { ProjectilePool } from '../entities/projectiles';
import { LocalTransport, PeerTransport, Transport, NetMsg } from './transport';
import type { SoundName } from '../core/audio';
import type { EState } from '../entities/enemies';
import type { Game } from '../game';

/**
 * Host-authoritative 2-player co-op.
 *
 * The HOST runs the entire simulation exactly like single-player (AI, doors,
 * elevator, explosions, pickups, score) and streams state snapshots. The
 * CLIENT simulates only its own movement and weapons feel; enemies, doors and
 * the elevator are interpolated puppets, and every gameplay consequence of
 * the client's actions (damage, broken voxels, claimed pickups, explosions)
 * is requested from the host and echoed back as events.
 */

const STATES: EState[] = ['idle', 'patrol', 'chase', 'attack', 'charge', 'pain', 'dead'];
const SNAP_HZ = 12;
const POSE_HZ = 20;

export class Netplay {
  readonly isHost: boolean;
  readonly remote: RemotePlayer;
  connected = false;
  /** client: latest elevator target from the host */
  private elTarget: number | null = null;
  private snapTimer = 0;
  private poseTimer = 0;
  private transport: Transport;
  private helloResolve: ((seed: number) => void) | null = null;
  private helloSeed: number | null = null;
  /** keepalive + dead-link watchdog (runs even when the game loop doesn't,
   *  e.g. during intermissions) */
  private lastRecv = performance.now();
  private watchdog: number;
  /** pool that renders the HOST's projectiles on the client */
  private remoteProjectiles: ProjectilePool | null = null;
  private pendingClaims = new Map<number, number>();

  constructor(private game: Game, role: 'host' | 'join', room: string, local: boolean) {
    this.isHost = role === 'host';
    // the avatar I render is my PARTNER: hosts see P2, clients see P1
    this.remote = new RemotePlayer(this.isHost ? 'P2' : 'P1');
    this.transport = local
      ? new LocalTransport(room, this.isHost)
      : new PeerTransport(room, this.isHost);
    this.transport.onMessage = (m) => this.handle(m);
    this.transport.onClose = () => this.onDisconnect();
    this.remote.onDamage = (amount, sx, sz) => {
      this.send({ t: 'dmg', a: amount, sx, sz });
    };
    this.game.rendererSys.scene.add(this.remote.mesh);
    if (!this.isHost) {
      this.remoteProjectiles = new ProjectilePool();
      this.game.rendererSys.scene.add(this.remoteProjectiles.group);
    }
    // a crashed tab or dropped network often never fires a clean close event —
    // ping every second and declare the link dead after 6s of silence
    this.watchdog = window.setInterval(() => {
      this.send({ t: 'ping' });
      if (this.connected && performance.now() - this.lastRecv > 6000) {
        this.onDisconnect();
      }
    }, 1000);
  }

  get ready(): Promise<void> {
    return this.transport.ready;
  }

  /** host: greet the client with the world seed once the link is up */
  sendHello(seed: number): void {
    this.send({ t: 'hello', seed });
  }

  /** client: wait for the host's seed (which may already have arrived) */
  waitHello(): Promise<number> {
    if (this.helloSeed !== null) return Promise.resolve(this.helloSeed);
    return new Promise((resolve) => {
      this.helloResolve = resolve;
    });
  }

  private send(msg: NetMsg): void {
    if (!this.transport) return;
    try {
      this.transport.send(msg);
    } catch { /* link died; onClose handles it */ }
  }

  /** called from Game.update every frame while playing */
  update(dt: number): void {
    const g = this.game;
    this.remote.update(dt, g);

    // stream my pose
    this.poseTimer -= dt;
    if (this.poseTimer <= 0) {
      this.poseTimer = 1 / POSE_HZ;
      const p = g.player;
      this.send({
        t: 'pose',
        x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
        yaw: +p.yaw.toFixed(2), pitch: +p.pitch.toFixed(2), dead: p.dead,
      });
    }

    if (this.isHost) {
      this.snapTimer -= dt;
      if (this.snapTimer <= 0) {
        this.snapTimer = 1 / SNAP_HZ;
        this.sendSnapshot();
      }
    } else if (this.elTarget !== null && g.elevator) {
      // smooth the elevator between snapshots at its real travel speed
      const el = g.elevator;
      const d = this.elTarget - el.topY;
      const step = Math.sign(d) * Math.min(Math.abs(d), LIFT_SPEED * 1.2 * dt);
      if (step !== 0) el.netSet(el.topY + step);
    }
  }

  private sendSnapshot(): void {
    const g = this.game;
    const enemies: Array<Array<number>> = [];
    for (let i = 0; i < g.enemies.list.length; i++) {
      const e = g.enemies.list[i];
      enemies.push([
        i, +e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2),
        +e.mesh.rotation.y.toFixed(2), STATES.indexOf(e.state), Math.round(e.hp),
      ]);
    }
    const projectiles = g.projectiles.liveList();
    const doors = g.doors.map((d) => [+d.openT.toFixed(2), d.locked ? 1 : 0]);
    const stats = g.netStats();
    this.send({
      t: 'snap',
      p: this.posePayload(),
      e: enemies,
      pr: projectiles,
      d: doors,
      el: g.elevator ? +g.elevator.topY.toFixed(2) : null,
      sc: stats.score, mult: stats.mult, kills: stats.kills, total: stats.total,
    });
  }

  private posePayload(): number[] {
    const p = this.game.player;
    return [+p.pos.x.toFixed(2), +p.pos.y.toFixed(2), +p.pos.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2), p.dead ? 1 : 0];
  }

  // ---- outgoing gameplay requests / events ---------------------------------

  /** either side: gunshot feel for the partner (sound + light) */
  sendShot(snd: SoundName, x: number, y: number, z: number): void {
    this.send({ t: 'shot', snd, x: +x.toFixed(1), y: +y.toFixed(1), z: +z.toFixed(1) });
  }

  /** client: I hit enemy `i` for `dmg` */
  sendHit(i: number, dmg: number, dx: number, dz: number, head: boolean): void {
    this.send({ t: 'hit', i, dmg, dx: +dx.toFixed(2), dz: +dz.toFixed(2), head });
  }

  /** client: my shot damaged a voxel */
  sendVoxelDamage(x: number, y: number, z: number, dmg: number): void {
    this.send({ t: 'vdmg', x, y, z, dmg });
  }

  /** client: my rocket detonated — host, run the real explosion */
  sendBoomReq(x: number, y: number, z: number, dmg: number, r: number): void {
    this.send({ t: 'boomreq', x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), dmg, r });
  }

  /** host: explosion FX for the client (gameplay already applied host-side) */
  sendBoomFx(x: number, y: number, z: number, r: number): void {
    if (!this.isHost) return;
    this.send({ t: 'boom', x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2), r });
  }

  /** host: a voxel broke */
  sendVoxelBroken(x: number, y: number, z: number, b: Block): void {
    if (!this.isHost) return;
    this.send({ t: 'vox', x, y, z, b });
  }

  /** host: a pickup appeared at runtime (crate drop, brute reward) */
  sendPickupSpawn(i: number, kind: PickupKind, x: number, y: number, z: number): void {
    if (!this.isHost) return;
    this.send({ t: 'pspawn', i, k: kind, x, y, z });
  }

  /** host: ambush reinforcements spawned */
  sendEnemySpawn(specs: EnemySpec[]): void {
    if (!this.isHost) return;
    this.send({ t: 'espawn', list: specs.map((s) => [s.kind, s.x, s.z, s.roomId]) });
  }

  /** client: I want pickup `i` */
  claimPickup(i: number): void {
    const now = performance.now();
    const last = this.pendingClaims.get(i) ?? 0;
    if (now - last < 600) return;
    this.pendingClaims.set(i, now);
    this.send({ t: 'claim', i });
  }

  /** host: pickup `i` is gone; `byClient` says who got the contents */
  sendPickupTaken(i: number, byClient: boolean, kind: PickupKind): void {
    if (!this.isHost) return;
    this.send({ t: 'taken', i, c: byClient, k: kind });
  }

  /** host: sector cleared — show the between-levels screen on the client */
  sendWin(final: boolean, heading: string, stats: string): void {
    if (!this.isHost) return;
    this.send({ t: 'win', final, heading, stats });
  }

  /** host: descending to the next sector now */
  sendNextLevel(): void {
    if (!this.isHost) return;
    this.send({ t: 'next' });
  }

  /** re-flag puppets after a level rebuild */
  onLevelBuilt(): void {
    // the partner re-materializes at the new sector's spawn — don't lerp
    // their avatar across the map, and give them their teleport-in
    this.remote.resetSpawn();
    if (this.isHost) return;
    for (const e of this.game.enemies.list) e.puppet = true;
    this.elTarget = null;
    this.pendingClaims.clear();
  }

  // ---- incoming ------------------------------------------------------------

  private handle(m: NetMsg): void {
    const g = this.game;
    this.lastRecv = performance.now();
    switch (m.t) {
      case 'ping':
        break;
      case 'hello':
        this.connected = true;
        this.helloSeed = m.seed as number;
        this.helloResolve?.(m.seed as number);
        break;
      case 'pose':
        this.connected = true;
        if (this.remote.netUpdate(m.x as number, m.y as number, m.z as number, m.yaw as number, m.pitch as number, m.dead as boolean)) {
          g.spawnFX(this.remote.pos.x, this.remote.pos.y, this.remote.pos.z);
        }
        break;
      case 'snap': {
        if (this.isHost) break;
        const p = m.p as number[];
        if (this.remote.netUpdate(p[0], p[1], p[2], p[3], p[4], p[5] === 1)) {
          g.spawnFX(this.remote.pos.x, this.remote.pos.y, this.remote.pos.z);
        }
        for (const row of m.e as number[][]) {
          const e = g.enemies.list[row[0]];
          if (e) e.netSet(row[1], row[2], row[3], row[4], STATES[row[5]] ?? 'idle', row[6], g);
        }
        this.remoteProjectiles?.syncRemote(m.pr as Array<[number, number, number, number]>);
        const doors = m.d as number[][];
        for (let i = 0; i < g.doors.length && i < doors.length; i++) {
          g.doors[i].netSet(doors[i][0], doors[i][1] === 1);
        }
        if (m.el !== null && g.elevator) this.elTarget = m.el as number;
        g.score = m.sc as number;
        g.kills = m.kills as number;
        g.level.totalEnemies = m.total as number;
        g.hud.updateScore(m.sc as number, m.mult as number);
        break;
      }
      case 'shot': {
        g.audio.play(m.snd as SoundName, { x: m.x as number, y: m.y as number, z: m.z as number });
        g.dynLights.flash(m.x as number, m.y as number, m.z as number, 1, 0.75, 0.35, 1.2, 8, 0.07);
        if (this.isHost) g.enemies.alertAt(m.x as number, m.z as number, 17, g);
        break;
      }
      case 'hit': {
        if (!this.isHost) break;
        const e = g.enemies.list[m.i as number];
        if (e && e.alive) {
          e.lastHitHead = m.head as boolean;
          e.damage(m.dmg as number, m.dx as number, m.dz as number, g);
        }
        break;
      }
      case 'vdmg': {
        if (!this.isHost) break;
        const broke = g.world.damageVoxel(m.x as number, m.y as number, m.z as number, m.dmg as number);
        if (broke !== null) g.onVoxelBroken(m.x as number, m.y as number, m.z as number, broke);
        break;
      }
      case 'boomreq':
        if (!this.isHost) break;
        // run the real thing, but don't echo FX back at the one who asked
        g.explode(m.x as number, m.y as number, m.z as number, m.dmg as number, m.r as number, false);
        break;
      case 'boom':
        g.explodeFX(m.x as number, m.y as number, m.z as number, m.r as number);
        break;
      case 'vox': {
        if (this.isHost) break;
        const x = m.x as number, y = m.y as number, z = m.z as number;
        g.world.set(x, y, z, Block.Air);
        g.onVoxelBroken(x, y, z, m.b as Block);
        break;
      }
      case 'pspawn':
        if (this.isHost) break;
        g.pickups.add({ kind: m.k as PickupKind, x: m.x as number, y: m.y as number, z: m.z as number }, g.world);
        break;
      case 'espawn': {
        if (this.isHost) break;
        const specs: EnemySpec[] = (m.list as Array<[EnemySpec['kind'], number, number, number]>).map(
          ([kind, x, z, roomId]) => ({ kind, x, z, roomId })
        );
        const before = g.enemies.list.length;
        g.enemies.spawnFromSpecs(specs, g.level.rooms, g);
        for (let i = before; i < g.enemies.list.length; i++) g.enemies.list[i].puppet = true;
        g.audio.play('alarm');
        g.hud.message('WARNING — security response inbound!');
        break;
      }
      case 'claim': {
        if (!this.isHost) break;
        const idx = m.i as number;
        const res = g.pickups.claimForRemote(idx, g);
        if (res) this.sendPickupTaken(idx, true, res);
        break;
      }
      case 'taken': {
        if (this.isHost) break;
        g.pickups.applyTaken(m.i as number, m.c as boolean, m.k as PickupKind, g);
        break;
      }
      case 'dmg': {
        const a = m.a as number;
        if (!g.player.dead) {
          const sx = m.sx as number, sz = m.sz as number;
          g.player.damage(a, g, { x: sx, z: sz });
          // heavy hits (brute slams, explosions) shove the receiver too
          if (a >= 18) {
            const dx = g.player.pos.x - sx, dz = g.player.pos.z - sz;
            const d = Math.hypot(dx, dz) || 1;
            const push = Math.min(11, a * 0.35);
            g.player.vel.x += (dx / d) * push;
            g.player.vel.y += push * 0.45;
            g.player.vel.z += (dz / d) * push;
          }
        }
        break;
      }
      case 'win':
        if (this.isHost) break;
        g.netShowWin(m.final as boolean, m.heading as string, m.stats as string);
        break;
      case 'next':
        if (this.isHost) break;
        g.netNextLevel();
        break;
    }
  }

  private onDisconnect(): void {
    if (!this.connected) return;
    this.connected = false;
    this.game.netConnectionLost(this.isHost);
  }

  dispose(): void {
    window.clearInterval(this.watchdog);
    this.transport.onClose = null;
    this.transport.close();
    this.game.rendererSys.scene.remove(this.remote.mesh);
    this.remote.dispose();
    if (this.remoteProjectiles) {
      this.game.rendererSys.scene.remove(this.remoteProjectiles.group);
    }
  }
}
