import * as THREE from 'three';
import type { Enemy } from './enemies';
import type { Game, PlayerTarget } from '../game';
import { moveBody, rayBox } from '../core/physics';
import { RigKit, sched, span, angleTo, lerp } from './monster-kit';

/**
 * The Ash Weaver — sector 7 (Deep Core), after reference/sector-monsters-v2
 * sheet 04 and BEHAVIOURS.md §7: a broad, low furnace crawler on four stout
 * legs, three square vent ports across its front and an ash-grey exhaust box
 * with three stacks on its back. Its attack is a temporary LINE OF HEAT on
 * the floor: brace, the ports light left to right over 1.2 s while the whole
 * line is marked on the floor, the line locks for 0.35 s, then three heat
 * spots ignite 3 / 5 / 7 u ahead (radius 0.65, 1.5 s; the strongest active
 * spot stings 6 per 0.5 s — overlapping spots never stack), and a 1.4 s
 * open-port recovery. Counter: step to either side of the line.
 *
 * Each spot needs supported floor at the Weaver's own level and the line
 * stops at the first wall, closed door or drop: no heat over a pit, through
 * a wall or on another floor.
 */
export const WEAVER_SCHEDULE = { ashWeaver: sched(1.55, 1.2, 0, 1.4) };

const SPOT_AT = [3, 5, 7];
const SPOT_RADIUS = 0.65;
const SPOT_LIFE = 1.5;
const SPOT_TICK = 0.5;
const SPOT_DAMAGE = 6;
/** a spot only burns feet near its floor: a jump over it clears it */
const SPOT_HEIGHT = 0.45;
const WEAVER_TURN = 80 * Math.PI / 180;
/** starts a line when the target is within this and in sight */
const WEAVER_RANGE = 7.5;
const WEAVER_REST = 2.6;

// palette read off sheet 04: rust plates, dark iron, ash-grey exhaust box
const RUST = 0xa8432a;
const RUST_D = 0x7a2e1e;
const IRON = 0x3a3634;
const ASH = 0x8d8a86;
const ASH_D = 0x6a6764;
const HEAT = 0xffa229;
const EMBER = 0xff6a10;

/** next sim time each player can take a heat tick: overlapping spots never stack */
const heatReady = new Map<PlayerTarget, number>();

export class AshWeaver {
  private kit = new RigKit();
  /** world-space effects (the line marks, the heat spots): enemies.ts adds it to the scene */
  readonly fx = new THREE.Group();
  private time = 0;
  private cooldown = 1;
  private face = 0;
  private walked = 0;
  private ground = false;
  private strafe = Math.random() < 0.5 ? -1 : 1;
  private strafeT = 0;
  /** the locked line: origin on the floor and direction */
  private lineX = 0;
  private lineZ = 0;
  private dirX = 0;
  private dirZ = -1;
  private lineY = 1;
  /** how many of the three spots the floor allows (the line stops at a wall / door / drop) */
  private reach = 0;
  // rig handles
  private legs: THREE.Group[] = [];
  private torso: THREE.Group | null = null;
  private ports: THREE.Mesh[] = [];
  // effects: one preview mark + one heat spot per position
  private marks: THREE.Group[] = [];
  private spots: { mesh: THREE.Group; x: number; z: number; life: number }[] = [];

  constructor(private e: Enemy, body: THREE.Group) {
    body.name = 'ashWeaver';
    e.mesh.userData.monsterName = 'ASH WEAVER';
    this.build(body);
    let boxes = 0; body.traverse((o) => { if (o instanceof THREE.Mesh) boxes++; });
    this.kit.bake(body);
    body.userData.boxCount = boxes;
    this.buildFx();
    this.fx.name = 'ashWeaver-fx';
  }

  /*
   * Feet at y = -0.5, faces -z. A wide rust hull over a dark iron belly, a
   * bevelled front plate holding three square ports (each its own pivot and
   * material: they light one at a time), the ash exhaust box on the back with
   * three stacks whose tops glow, and four short, splayed two-part legs.
   */
  private build(b: THREE.Group): void {
    const k = this.kit;
    // a raised, long hull: the legs splay out from under it and stay in view
    const torso = k.joint(b, 'torso', 0, 0.2, 0); this.torso = torso;
    k.part(torso, 'hull', 0, 0, 0.05, 1.0, 0.36, 1.3, RUST);
    k.part(torso, 'belly', 0, -0.23, 0.05, 0.8, 0.1, 1.1, IRON);
    k.part(torso, 'side-plate', 0, -0.05, 0.05, 1.08, 0.16, 1.1, RUST_D);
    k.part(torso, 'face-plate', 0, -0.01, -0.64, 1.06, 0.3, 0.1, RUST_D);
    k.part(torso, 'rear-plate', 0, -0.02, 0.73, 0.9, 0.26, 0.08, IRON);
    // the ash-grey exhaust box over most of the back, a dark seam round its lid
    k.part(torso, 'ash-box', 0, 0.35, 0.12, 0.86, 0.34, 0.98, ASH);
    k.part(torso, 'ash-seam', 0, 0.2, 0.12, 0.9, 0.05, 1.02, IRON);
    k.part(torso, 'ash-lid', 0, 0.54, 0.2, 0.7, 0.05, 0.7, ASH_D);
    // three tall stacks toward the front, their mouths glowing
    for (const sx of [-0.27, 0, 0.27]) k.part(torso, 'stack', sx, 0.7, -0.22, 0.17, 0.36, 0.17, ASH_D);
    for (const sx of [-0.27, 0, 0.27]) k.part(torso, 'stack-top', sx, 0.9, -0.22, 0.13, 0.06, 0.13, HEAT, true);
    // three ports, left to right as the player sees it (the model faces -z, so +x is its left: screen right)
    [0.32, 0, -0.32].forEach((x, i) => {
      const port = k.joint(torso, 'port', x, -0.01, -0.7);
      k.part(port, 'port-frame', 0, 0, 0, 0.27, 0.24, 0.04, IRON);
      // a hair apart in colour: each port gets its own material, so each lights on its own
      this.ports.push(k.part(port, 'port-glow', 0, 0, -0.02, 0.17, 0.15, 0.03, HEAT + i, true));
    });
    // four stout legs: a big rust thigh angled out from the hull, a dark shin, a broad foot
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = k.joint(b, 'leg', sx * 0.5, 0.12, sz * 0.46); this.legs.push(leg);
      const upper = k.part(leg, 'upper', sx * 0.16, -0.08, 0, 0.32, 0.32, 0.34, RUST);
      upper.rotation.z = sx * 0.55;
      k.part(leg, 'lower', sx * 0.34, -0.36, 0, 0.26, 0.4, 0.28, IRON);
      k.part(leg, 'foot', sx * 0.36, -0.55, -0.03, 0.34, 0.14, 0.4, IRON);
    }
  }

  private buildFx(): void {
    const k = this.kit;
    for (let i = 0; i < SPOT_AT.length; i++) {
      // the warning: a thin orange square outline on the floor
      const mark = k.joint(this.fx, 'heat-mark', 0, 0, 0);
      const s = SPOT_RADIUS * 2, t = 0.07;
      for (const [x, z, w, d] of [[0, -s / 2, s, t], [0, s / 2, s, t], [-s / 2, 0, t, s], [s / 2, 0, t, s]]) {
        k.part(mark, 'mark-edge', x, 0.03, z, w, 0.025, d, EMBER, true);
      }
      mark.visible = false;
      this.marks.push(mark);
      // the heat: a glowing pool with flame cubes licking up
      const spot = k.joint(this.fx, 'heat-spot', 0, 0, 0);
      k.part(spot, 'heat-pool', 0, 0.025, 0, s, 0.04, s, EMBER, true);
      for (const [x, z] of [[-0.25, 0.15], [0.2, -0.2], [0.05, 0.28], [-0.1, -0.3]]) k.part(spot, 'flame', x, 0.15, z, 0.13, 0.2, 0.13, HEAT, true);
      spot.visible = false;
      this.spots.push({ mesh: spot, x: 0, z: 0, life: 0 });
    }
  }

  // ---------------------------------------------------------------------------
  // Pose
  // ---------------------------------------------------------------------------

  pose(dt: number): void {
    this.time += dt;
    this.walked += Math.hypot(this.e.vel.x, this.e.vel.z) * dt;
    const s = WEAVER_SCHEDULE.ashWeaver.attack, e = this.e;
    const attacking = e.state === 'attack' || e.state === 'charge';
    const phase = attacking ? e.phase : 'none', t = e.phaseT;
    const moving = Math.min(1, Math.hypot(e.vel.x, e.vel.z) / 1.2);
    // brace: the hull sinks and tips forward; ports light one after another;
    // the recovery keeps them open (dim embers) and lifts back up
    let sink = 0, tip = 0;
    const lit = [0.45, 0.45, 0.45];
    if (phase === 'prep') {
      sink = 0.1 * span(t, 0, 0.4); tip = 0.08 * span(t, 0, 0.4);
      for (let i = 0; i < 3; i++) lit[i] = 0.45 + 1.0 * span(t, i * 0.4, i * 0.4 + 0.3);
      if (t >= s.lock) for (let i = 0; i < 3; i++) lit[i] = 1.45 + 0.25 * Math.sin(this.time * 30 + i);
    } else if (phase === 'recover' || phase === 'strike') {
      const back = span(t, s.recover - 0.5, s.recover);
      sink = lerp(0.1, 0, back); tip = lerp(-0.05, 0, back);
      for (let i = 0; i < 3; i++) lit[i] = lerp(0.85, 0.45, back);
    }
    if (this.torso) { this.torso.position.y = 0.2 - sink; this.torso.rotation.x = -tip; }
    this.ports.forEach((p, i) => this.kit.glowK(p, lit[i]));
    this.legs.forEach((leg, i) => {
      const g = (i === 0 || i === 3) ? 0 : Math.PI;
      leg.rotation.x = phase === 'none' ? Math.sin(this.walked * 5 + g) * 0.4 * moving : 0;
      leg.position.y = 0.12 + (phase === 'none' ? Math.max(0, Math.sin(this.walked * 5 + g)) * 0.05 * moving : 0);
    });
  }

  // ---------------------------------------------------------------------------
  // Behaviour
  // ---------------------------------------------------------------------------

  update(dt: number, game: Game, target: PlayerTarget): void {
    const e = this.e, S = WEAVER_SCHEDULE.ashWeaver.attack;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.effects(dt, game);
    const dx = target.pos.x - e.pos.x, dz = target.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || 0.001;
    const los = game.hasLOS(e.pos.x, e.pos.y + 0.3, e.pos.z, target.pos.x, target.eyeY() - 0.3, target.pos.z);
    const sameFloor = Math.abs((target.pos.y - target.half.y) - (e.pos.y - e.half.y)) < 0.6;
    const attacking = e.state === 'attack' || e.state === 'charge';
    const wantYaw = Math.atan2(-dx, -dz);

    if (!e.awake || target.dead || e.state === 'pain') {
      e.vel.x *= Math.exp(-9 * dt); e.vel.z *= Math.exp(-9 * dt);
      if (e.state === 'pain') { this.hideMarks(); this.cooldown = Math.max(this.cooldown, 0.8); }
    } else if (attacking) {
      e.phaseT += dt;
      e.vel.x *= Math.exp(-12 * dt); e.vel.z *= Math.exp(-12 * dt);
      if (e.phase === 'prep') {
        // the line follows the turn until the lock, then holds for 0.35 s
        if (e.phaseT < S.lock) { this.turnToward(wantYaw, dt); this.planLine(game); }
        if (e.phaseT >= S.prep) {
          e.phaseT = 0; e.phase = 'recover';
          this.ignite(game);
        }
      } else if (e.phase === 'recover' && e.phaseT >= S.recover) {
        e.state = 'chase'; e.phaseT = 0;
        this.cooldown = WEAVER_REST;
      }
    } else {
      // crawl to a lane 3–7 u out; sidle while it cools down
      const ahead = Math.abs(angleTo(this.face, wantYaw));
      if (los && sameFloor && this.ground && dist < WEAVER_RANGE && dist > 2 && ahead < 0.5 && this.cooldown === 0) {
        e.state = 'attack'; e.phase = 'prep'; e.phaseT = 0;
        this.planLine(game);
        game.audio.play('bruteRoar', e.pos);
      } else {
        let nx = dx / dist, nz = dz / dist, speed = e.tuning.speed;
        if (los && dist < 3) { nx = -nx; nz = -nz; speed *= 0.7; }
        else if (los && dist < WEAVER_RANGE && this.cooldown > 0) {
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.6 + Math.random(); }
          const ox = nx; nx = -nz * this.strafe; nz = ox * this.strafe; speed *= 0.5;
        }
        this.turnToward(wantYaw, dt);
        const blend = 1 - Math.exp(-8 * dt);
        e.vel.x += (nx * speed - e.vel.x) * blend; e.vel.z += (nz * speed - e.vel.z) * blend;
      }
    }

    e.vel.y -= 24 * dt;
    const sub = Math.max(1, Math.ceil(Math.hypot(e.vel.x, e.vel.z) * dt / 0.22));
    for (let i = 0; i < sub; i++) {
      const r = moveBody(game.world, e.pos, e.half, e.vel, dt / sub, game.solidBoxes());
      this.ground = r.onGround;
      if (r.hitX || r.hitZ) this.strafe = -this.strafe;
    }
    if (this.ground) { e.vel.x *= Math.exp(-3 * dt); e.vel.z *= Math.exp(-3 * dt); }
    e.mesh.rotation.y = this.face;
    this.pose(dt);
  }

  /** the dead leave their heat burning until it runs out; the warning goes at once */
  deadUpdate(dt: number, game: Game): void {
    this.hideMarks();
    this.effects(dt, game);
  }

  private turnToward(goal: number, dt: number): void {
    const d = angleTo(this.face, goal);
    this.face += Math.sign(d) * Math.min(Math.abs(d), WEAVER_TURN * dt);
  }

  /**
   * Where the three spots go along the facing: walk the line on the Weaver's
   * own floor level and stop at the first wall, closed door or drop. The
   * preview marks show every spot the floor allows.
   */
  private planLine(game: Game): void {
    const e = this.e, w = game.world;
    this.dirX = -Math.sin(this.face); this.dirZ = -Math.cos(this.face);
    this.lineX = e.pos.x; this.lineZ = e.pos.z;
    const fy = Math.floor(e.pos.y - e.half.y + 0.05); // the first air cell above the floor
    this.lineY = fy;
    let reach = 0;
    const last = SPOT_AT[SPOT_AT.length - 1] + SPOT_RADIUS;
    for (let d = 0.5; d <= last; d += 0.25) {
      const x = this.lineX + this.dirX * d, z = this.lineZ + this.dirZ * d;
      const cx = Math.floor(x), cz = Math.floor(z);
      if (w.isSolid(cx, fy, cz) || !w.isSolid(cx, fy - 1, cz) || this.doorAt(game, x, fy + 0.5, z)) break;
      while (reach < SPOT_AT.length && d >= SPOT_AT[reach] + SPOT_RADIUS * 0.5) reach++;
    }
    this.reach = reach;
    this.marks.forEach((m, i) => {
      m.visible = i < reach;
      m.position.set(this.lineX + this.dirX * SPOT_AT[i], fy, this.lineZ + this.dirZ * SPOT_AT[i]);
      m.rotation.y = this.face;
    });
  }

  private doorAt(game: Game, x: number, y: number, z: number): boolean {
    for (const d of game.doors) {
      if (d.isOpen) continue;
      if (rayBox(x, y, z, 0, 1, 0, 0.01, d.box()) !== null) return true;
    }
    return false;
  }

  private ignite(game: Game): void {
    this.hideMarks();
    for (let i = 0; i < this.reach; i++) {
      const s = this.spots[i];
      s.x = this.lineX + this.dirX * SPOT_AT[i]; s.z = this.lineZ + this.dirZ * SPOT_AT[i];
      s.life = SPOT_LIFE;
      s.mesh.position.set(s.x, this.lineY, s.z);
      s.mesh.rotation.y = this.face;
      s.mesh.scale.set(1, 1, 1);
      s.mesh.visible = true;
      game.particles.debris(s.x, this.lineY + 0.1, s.z, 1, 0.45, 0.08, 8);
      game.dynLights.flash(s.x, this.lineY + 0.4, s.z, 1, 0.5, 0.1, 1.2, 4, 0.3);
    }
    if (this.reach > 0) game.audio.play('rocketLaunch', this.e.pos);
  }

  /** the burning spots: fade, flicker, and sting a player standing in one */
  private effects(dt: number, game: Game): void {
    let any = false;
    for (const s of this.spots) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { s.mesh.visible = false; continue; }
      any = true;
      const fade = Math.min(1, s.life / 0.4);
      s.mesh.scale.set(fade, 1, fade);
      s.mesh.children.forEach((c, i) => { if (i > 0) c.position.y = 0.12 + Math.abs(Math.sin(this.time * 9 + i * 1.9)) * 0.12; });
    }
    if (!any) return;
    const now = game.simTime;
    for (const pl of game.playerTargets()) {
      if (pl.dead || (heatReady.get(pl) ?? 0) > now) continue;
      const feet = pl.pos.y - pl.half.y;
      if (feet - this.lineY > SPOT_HEIGHT || feet < this.lineY - 0.3) continue;
      const inside = this.spots.some((s) => s.life > 0 && Math.hypot(pl.pos.x - s.x, pl.pos.z - s.z) < SPOT_RADIUS + pl.half.x * 0.5);
      if (!inside) continue;
      heatReady.set(pl, now + SPOT_TICK);
      pl.damage(SPOT_DAMAGE, game, { x: this.e.pos.x, z: this.e.pos.z, by: 'ashWeaver' });
    }
  }

  private hideMarks(): void {
    for (const m of this.marks) m.visible = false;
  }

  /** a line is marked on the floor (tests) */
  get marked(): number { return this.marks.filter((m) => m.visible).length; }
  /** spots burning now (tests) */
  get burning(): number { return this.spots.filter((s) => s.life > 0).length; }

  onDeath(): void {
    this.hideMarks();
  }

  dispose(): void {
    for (const s of this.spots) { s.life = 0; s.mesh.visible = false; }
    this.fx.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.kit.dispose();
  }
}
