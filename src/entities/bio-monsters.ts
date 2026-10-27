import * as THREE from 'three';
import type { Enemy } from './enemies';
import type { EnemyKind } from '../types';
import type { Game, PlayerTarget } from '../game';
import { moveBody, rayBox } from '../core/physics';
import { RigKit, sched, span, angleTo, lerp } from './monster-kit';

/**
 * The Biofoundry's new monsters, after reference/sector-monsters-v2 (sheets 02
 * and 03, BEHAVIOURS.md §4–5):
 *  - Spitter (sector 4): a burgundy quadruped with a square snout and two lime
 *    cheek reservoirs. It marks a landing spot, lobs one arcing acid glob and
 *    leaves a short-lived acid patch there — step off the mark.
 *  - Carapace (sector 5): a squat burgundy walker behind two pale hinged chest
 *    plates over an orange core. The front shrugs off shots; flank it, or dodge
 *    its three-spike fan and shoot the core while the plates hang open.
 * Same prepare → commit → recover schedule as every other monster.
 */
export type BioKind = 'spitter' | 'carapace';
export const isBioKind = (kind: EnemyKind): kind is BioKind => kind === 'spitter' || kind === 'carapace';

export const BIO_SCHEDULE = {
  // reservoirs brighten + snout lifts 1.0 (the landing locks for the last 0.3), 1.4 empty recovery
  spitter: sched(1.0, 0.7, 0, 1.4),
  // feet planted + plates part 0.9 (facing locks for the last 0.25), then 1.4 with the
  // core exposed and 0.35 to close: a 1.75 recovery
  carapace: sched(0.9, 0.65, 0, 1.75),
};

const SPIT_MIN = 4.5;
const SPIT_MAX = 10;
/** the glob's time in the air and its pull (an arc, not a line) */
const GLOB_FLIGHT = 0.8;
const GLOB_GRAVITY = 14;
const GLOB_DAMAGE = 10;
const GLOB_RADIUS = 0.9;
/** at least 4.5 s between lobs: prep + recover + this */
const SPIT_REST = 2.1;
const PATCH_RADIUS = 0.8;
const PATCH_LIFE = 3;
const PATCH_TICK = 0.5;
const PATCH_DAMAGE = 3;
/** live acid patches across the whole level; a new one retires the oldest */
const PATCH_CAP = 3;
const CARA_TURN = 70 * Math.PI / 180;
const CARA_RANGE = 9;
const SPIKE_DAMAGE = 8;
const SPIKE_SPEED = 9;
/** the three spikes' horizontal spread (radians either side) */
const SPIKE_FAN = 0.13;
/** the core hangs open for this much of the recovery, then the plates close */
const CORE_OPEN = 1.4;

// palette read off sheets 02 and 03
const MAROON = 0x8c2429;
const MAROON_D = 0x641a1f;
const DARK = 0x2c1518;
const MOUTH = 0x140709;
const LIME = 0xb6ff3a;
const ORANGE = 0xff9a2c;
const BONE = 0xd8c08c;
const CORE = 0xff8a1a;

/** Spitters with a patch down, oldest first (the level-wide cap) */
const patchOwners: BioMonster[] = [];
/** next sim time each player can take an acid tick: overlapping patches never stack */
const acidReady = new Map<PlayerTarget, number>();

export class BioMonster {
  private kit = new RigKit();
  /** world-space effects (the glob, the landing mark, the patch): enemies.ts adds it to the scene */
  readonly fx = new THREE.Group();
  private time = 0;
  private cooldown = 0.8;
  private face = 0;
  private walked = 0;
  private ground = false;
  private strafe = Math.random() < 0.5 ? -1 : 1;
  private strafeT = 0;
  /** one pain interrupt per charge (BEHAVIOURS.md: no permanent flinch lock) */
  private interrupted = false;
  private aim = new THREE.Vector3(0, 0, -1);
  private landing = new THREE.Vector3();
  // rig handles
  private head: THREE.Group | null = null;
  private legs: THREE.Group[] = [];
  private torso: THREE.Group | null = null;
  private plates: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private reservoirs: THREE.Mesh[] = [];
  private core: THREE.Mesh | null = null;
  private brow: THREE.Mesh | null = null;
  // Spitter effects
  private glob: { mesh: THREE.Mesh; from: THREE.Vector3; to: THREE.Vector3; vy: number; t: number } | null = null;
  private globMesh: THREE.Mesh | null = null;
  private mark: THREE.Group | null = null;
  private patchMesh: THREE.Group | null = null;
  private patch: { x: number; y: number; z: number; life: number } | null = null;

  constructor(private e: Enemy, private body: THREE.Group, readonly kind: BioKind) {
    body.name = kind;
    e.mesh.userData.monsterName = kind === 'spitter' ? 'SPITTER' : 'CARAPACE';
    if (kind === 'spitter') this.buildSpitter();
    else this.buildCarapace();
    this.fx.name = `${kind}-fx`;
  }

  /*
   * SPITTER — feet at y = -0.5, faces -z. A long maroon body with a darker
   * hump and belly, a big square head (the snout pivot) with an orange brow
   * bar over a dark square mouth, two lime cheek reservoirs, four splayed
   * legs. 23 boxes. Its effects: the glob, a square landing mark, the patch.
   */
  private buildSpitter(): void {
    const k = this.kit, b = this.body;
    const torso = k.joint(b, 'torso', 0, 0.05, 0.1); this.torso = torso;
    k.part(torso, 'body', 0, 0, 0, 0.9, 0.42, 1.0, MAROON);
    k.part(torso, 'hump', 0, 0.27, 0.05, 0.7, 0.18, 0.7, MAROON_D);
    k.part(torso, 'belly', 0, -0.25, 0, 0.7, 0.12, 0.8, DARK);
    const head = k.joint(b, 'snout', 0, 0.16, -0.42); this.head = head;
    k.part(head, 'head', 0, 0, -0.2, 0.66, 0.52, 0.5, MAROON);
    this.brow = k.part(head, 'brow', 0, 0.19, -0.46, 0.4, 0.07, 0.04, ORANGE, true);
    k.part(head, 'mouth-frame', 0, -0.05, -0.455, 0.42, 0.3, 0.04, DARK);
    k.part(head, 'mouth', 0, -0.05, -0.475, 0.28, 0.2, 0.03, MOUTH);
    for (const side of [-1, 1]) {
      this.reservoirs.push(k.part(head, 'lime-reservoir', side * 0.41, -0.02, -0.25, 0.16, 0.32, 0.3, LIME, true));
      k.part(head, 'reservoir-cap', side * 0.41, 0.18, -0.25, 0.18, 0.06, 0.32, DARK);
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = k.joint(b, 'leg', sx * 0.38, -0.12, sz * 0.34); this.legs.push(leg);
      const upper = k.part(leg, 'upper', sx * 0.04, -0.06, 0, 0.2, 0.3, 0.22, MAROON);
      upper.rotation.z = sx * 0.25;
      k.part(leg, 'lower', sx * 0.09, -0.24, 0, 0.2, 0.22, 0.22, MAROON_D);
      k.part(leg, 'foot', sx * 0.1, -0.33, -0.02, 0.26, 0.1, 0.3, DARK);
    }
    // effects, all hidden until used
    this.globMesh = k.part(this.fx, 'acid-glob', 0, 0, 0, 0.3, 0.3, 0.3, LIME, true);
    this.globMesh.visible = false;
    const mark = k.joint(this.fx, 'landing-mark', 0, 0, 0); this.mark = mark;
    for (const [x, z, w, d] of [[0, -0.8, 1.6, 0.08], [0, 0.8, 1.6, 0.08], [-0.8, 0, 0.08, 1.6], [0.8, 0, 0.08, 1.6]]) k.part(mark, 'mark-edge', x, 0.03, z, w, 0.03, d, LIME, true);
    k.part(mark, 'mark-dot', 0, 0.03, 0, 0.24, 0.03, 0.24, LIME, true);
    mark.visible = false;
    const patch = k.joint(this.fx, 'acid-patch', 0, 0, 0); this.patchMesh = patch;
    k.part(patch, 'acid-pool', 0, 0.025, 0, PATCH_RADIUS * 2, 0.04, PATCH_RADIUS * 2, 0x6fbf1c, true);
    for (const [x, z] of [[-0.35, 0.2], [0.3, -0.25], [0.1, 0.4]]) k.part(patch, 'acid-bubble', x, 0.09, z, 0.14, 0.12, 0.14, LIME, true);
    patch.visible = false;
  }

  /*
   * CARAPACE — feet at y = -0.9, faces -z. Short maroon legs, a broad chest
   * with a back hump, a small capped head with an orange visor slit, pale
   * bone shoulder pads, arms ending in dark fists, and two big pale chest
   * plates on outer hinges over an orange core. 22 boxes.
   */
  private buildCarapace(): void {
    const k = this.kit, b = this.body;
    for (const side of [-1, 1]) {
      const hip = k.joint(b, 'hip', side * 0.26, -0.3, 0); this.legs.push(hip);
      k.part(hip, 'thigh', 0, -0.15, 0, 0.3, 0.34, 0.32, MAROON_D);
      k.part(hip, 'shin', 0, -0.44, 0, 0.28, 0.24, 0.3, MAROON);
      k.part(hip, 'foot', 0, -0.53, -0.05, 0.36, 0.14, 0.44, DARK);
    }
    const torso = k.joint(b, 'torso', 0, 0, 0); this.torso = torso;
    k.part(torso, 'pelvis', 0, -0.2, 0, 0.6, 0.22, 0.4, DARK);
    k.part(torso, 'chest', 0, 0.2, 0, 0.82, 0.62, 0.56, MAROON);
    this.core = k.part(torso, 'orange-core', 0, 0.18, -0.285, 0.3, 0.34, 0.06, CORE, true);
    k.part(torso, 'head', 0, 0.62, -0.02, 0.36, 0.28, 0.32, MAROON_D);
    k.part(torso, 'visor-slit', 0, 0.64, -0.185, 0.22, 0.05, 0.03, ORANGE, true);
    k.part(torso, 'back-hump', 0, 0.42, 0.3, 0.6, 0.3, 0.24, MAROON_D);
    for (const side of [-1, 1]) {
      k.part(torso, 'bone-shoulder', side * 0.55, 0.47, 0, 0.36, 0.34, 0.44, BONE);
      const arm = k.joint(torso, 'shoulder', side * 0.58, 0.3, 0); this.arms.push(arm);
      k.part(arm, 'upper-arm', 0, -0.18, 0, 0.22, 0.32, 0.24, MAROON);
      k.part(arm, 'forearm', 0, -0.46, -0.02, 0.22, 0.26, 0.24, MAROON_D);
      k.part(arm, 'fist', 0, -0.66, -0.04, 0.26, 0.2, 0.28, DARK);
      // the chest plate hangs on its OUTER edge and swings forward to bare the core
      const hinge = k.joint(torso, 'plate-hinge', side * 0.42, 0.18, -0.3); this.plates.push(hinge);
      k.part(hinge, 'bone-plate', -side * 0.2, 0, -0.02, 0.42, 0.68, 0.12, BONE);
    }
  }

  // ---------------------------------------------------------------------------
  // Poses
  // ---------------------------------------------------------------------------

  private attackT(): { phase: 'none' | 'prep' | 'strike' | 'move' | 'recover'; t: number } {
    const e = this.e;
    if (e.state !== 'attack' && e.state !== 'charge') return { phase: 'none', t: 0 };
    return { phase: e.phase, t: e.phaseT };
  }

  pose(dt: number): void {
    this.time += dt;
    this.walked += Math.hypot(this.e.vel.x, this.e.vel.z) * dt;
    if (this.kind === 'spitter') this.poseSpitter();
    else this.poseCarapace();
  }

  private poseSpitter(): void {
    const s = BIO_SCHEDULE.spitter.attack;
    const { phase, t } = this.attackT();
    const moving = Math.min(1, Math.hypot(this.e.vel.x, this.e.vel.z) / 1.4);
    // the snout lifts and the sacs swell as it loads; slumps, sacs dim, after the lob
    let lift = 0, swell = 1, glow = this.e.awake ? 1 : 0.8, rear = 0;
    if (phase === 'prep') {
      const k = span(t, 0, s.prep);
      lift = 0.45 * k; swell = 1 + 0.35 * k; glow = 1 + 0.9 * k; rear = 0.12 * k;
    } else if (phase === 'recover' || phase === 'strike') {
      const back = span(t, s.recover - 0.5, s.recover);
      lift = lerp(-0.15, 0, back); swell = lerp(0.7, 1, back); glow = lerp(0.35, 1, back);
    }
    if (this.head) this.head.rotation.x = lift;
    if (this.torso) this.torso.rotation.x = -rear;
    this.reservoirs.forEach((r) => { r.scale.set(swell, swell, 1); this.kit.glowK(r, glow); });
    this.kit.glowK(this.brow, phase === 'prep' ? 1.3 : 1);
    this.legs.forEach((leg, i) => {
      const g = (i === 0 || i === 3) ? 0 : Math.PI;
      leg.rotation.x = Math.sin(this.walked * 6 + g) * 0.45 * moving;
      leg.position.y = -0.12 + Math.max(0, Math.sin(this.walked * 6 + g)) * 0.06 * moving;
    });
  }

  private poseCarapace(): void {
    const s = BIO_SCHEDULE.carapace.attack;
    const { phase, t } = this.attackT();
    const moving = Math.min(1, Math.hypot(this.e.vel.x, this.e.vel.z) / 1.0);
    const stride = Math.sin(this.walked * 3.4);
    // plates: shut while it walks, parted a crack as it loads the spikes,
    // swung wide open for the exposed core, then closing over 0.35 s
    let open = 0, arms = 0.1 + stride * 0.15 * moving, crouch = 0, coreK = 0.75;
    if (phase === 'prep') {
      open = 0.18 * span(t, 0.2, s.prep); crouch = 0.07 * span(t, 0, 0.4); arms = 0.35 * span(t, 0, 0.5);
      coreK = 0.75 + 0.3 * span(t, 0.3, s.prep); // (orange saturates to yellow past ~1.3)
    } else if (phase === 'recover' || phase === 'strike') {
      open = t < CORE_OPEN ? span(t, 0, 0.18) : 1 - span(t, CORE_OPEN, s.recover);
      crouch = 0.07 * (1 - span(t, CORE_OPEN, s.recover));
      arms = -0.25 * open;
      coreK = 0.8 + 0.45 * open;
    }
    this.plates.forEach((p, i) => { p.rotation.y = (i === 0 ? 1 : -1) * open * 1.25; });
    this.arms.forEach((a, i) => { a.rotation.x = arms; a.rotation.z = (i === 0 ? -1 : 1) * (0.12 + open * 0.35); });
    if (this.torso) this.torso.position.y = -crouch;
    this.legs.forEach((leg, i) => {
      leg.rotation.x = phase === 'none' ? (i === 0 ? 1 : -1) * stride * 0.35 * moving : 0;
    });
    this.kit.glowK(this.core, coreK);
    this.e.coreOpen = phase === 'recover' && t < CORE_OPEN;
  }

  // ---------------------------------------------------------------------------
  // Behaviour
  // ---------------------------------------------------------------------------

  update(dt: number, game: Game, target: PlayerTarget): void {
    const e = this.e, S = BIO_SCHEDULE[this.kind].attack;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.effects(dt, game);
    const dx = target.pos.x - e.pos.x, dz = target.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || 0.001;
    const eyeY = e.pos.y + (this.kind === 'spitter' ? 0.15 : 0.6);
    const los = game.hasLOS(e.pos.x, eyeY, e.pos.z, target.pos.x, target.eyeY() - 0.3, target.pos.z);
    const attacking = e.state === 'attack' || e.state === 'charge';
    const wantYaw = Math.atan2(-dx, -dz);

    if (e.state === 'pain') {
      this.interrupted = true;
      if (this.mark) this.mark.visible = false;
    }
    if (!e.awake || target.dead || e.state === 'pain') {
      e.vel.x *= Math.exp(-9 * dt); e.vel.z *= Math.exp(-9 * dt);
      if (e.state === 'pain') this.cooldown = Math.max(this.cooldown, 0.6);
    } else if (attacking) {
      e.phaseT += dt;
      e.vel.x *= Math.exp(-12 * dt); e.vel.z *= Math.exp(-12 * dt);
      if (e.phase === 'prep') {
        if (e.phaseT < S.lock) this.track(game, target, wantYaw, dt);
        if (this.mark) this.mark.visible = this.kind === 'spitter';
        if (e.phaseT >= S.prep) {
          e.phaseT = 0; e.phase = 'recover';
          if (this.kind === 'spitter') this.lob(game); else this.spikes(game);
          this.interrupted = false;
        }
      } else if (e.phase === 'recover' && e.phaseT >= S.recover) {
        e.state = 'chase'; e.phaseT = 0;
        this.cooldown = this.kind === 'spitter' ? SPIT_REST : 1.2;
      }
    } else if (this.kind === 'spitter') {
      this.track(game, target, wantYaw, dt);
      if (los && dist >= SPIT_MIN - 0.5 && dist <= SPIT_MAX + 1 && this.cooldown === 0) this.begin(game, target, wantYaw);
      else {
        // find a 5–10 u lane: close in, back off, or sidle while it reloads
        let nx = dx / dist, nz = dz / dist, speed = e.tuning.speed;
        if (los && dist < SPIT_MIN) { nx = -nx; nz = -nz; speed *= 0.8; }
        else if (los && dist <= SPIT_MAX) {
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.4 + Math.random(); }
          const ox = nx; nx = -nz * this.strafe; nz = ox * this.strafe; speed *= 0.5;
        }
        this.drive(nx, nz, speed, dt);
      }
    } else {
      // Carapace: a guarded, slow-turning advance to fan range
      const ahead = Math.abs(angleTo(this.face, wantYaw));
      if (los && dist < CARA_RANGE && ahead < 0.6 && this.cooldown === 0) this.begin(game, target, wantYaw);
      else {
        const goal = wantYaw;
        this.turnToward(goal, dt);
        const go = (dist > 4 || !los) && Math.abs(angleTo(this.face, goal)) < 1.1 ? e.tuning.speed : 0;
        this.drive(-Math.sin(this.face), -Math.cos(this.face), go, dt);
        this.aim.set(dx / dist, 0, dz / dist);
      }
    }

    e.vel.y -= 24 * dt;
    const sub = Math.max(1, Math.ceil(Math.hypot(e.vel.x, e.vel.z) * dt / 0.22));
    for (let i = 0; i < sub; i++) {
      const r = moveBody(game.world, e.pos, e.half, e.vel, dt / sub, game.solidBoxes());
      this.ground = r.onGround;
      if ((r.hitX || r.hitZ) && this.kind === 'spitter') this.strafe = -this.strafe;
    }
    if (this.ground) { e.vel.x *= Math.exp(-3 * dt); e.vel.z *= Math.exp(-3 * dt); }
    e.mesh.rotation.y = this.face;
    this.pose(dt);
  }

  /** the dead keep their glob in the air and their patch on the floor until those run out */
  deadUpdate(dt: number, game: Game): void {
    if (this.mark) this.mark.visible = false;
    this.effects(dt, game);
  }

  private track(game: Game, target: PlayerTarget, wantYaw: number, dt: number): void {
    if (this.kind === 'carapace') this.turnToward(wantYaw, dt);
    else this.face += angleTo(this.face, wantYaw) * (1 - Math.exp(-10 * dt));
    if (this.kind === 'spitter') {
      // the landing spot: the floor under the target, marked on the ground
      const fy = floorTop(game, target.pos.x, target.pos.y, target.pos.z);
      this.landing.set(target.pos.x, fy, target.pos.z);
      this.mark?.position.copy(this.landing);
    } else {
      const m = this.muzzle(_m);
      this.aim.set(target.pos.x - m.x, target.eyeY() - 0.4 - m.y, target.pos.z - m.z).normalize();
    }
  }

  private turnToward(goal: number, dt: number): void {
    const d = angleTo(this.face, goal);
    this.face += Math.sign(d) * Math.min(Math.abs(d), CARA_TURN * dt);
  }

  private drive(nx: number, nz: number, speed: number, dt: number): void {
    const e = this.e, blend = 1 - Math.exp(-8 * dt);
    e.vel.x += (nx * speed - e.vel.x) * blend; e.vel.z += (nz * speed - e.vel.z) * blend;
  }

  private begin(game: Game, target: PlayerTarget, wantYaw: number): void {
    const e = this.e;
    e.state = 'attack'; e.phase = 'prep'; e.phaseT = 0;
    this.interrupted = false;
    if (this.kind === 'spitter') this.face = wantYaw;
    this.track(game, target, wantYaw, 1);
    game.audio.play(this.kind === 'spitter' ? 'huskGrowl' : 'bruteRoar', e.pos);
  }

  /** where a shot leaves: the spitter's mouth, the carapace's chest */
  private muzzle(out: THREE.Vector3): THREE.Vector3 {
    const e = this.e, fx = -Math.sin(this.face), fz = -Math.cos(this.face);
    if (this.kind === 'spitter') return out.set(e.pos.x + fx * 0.75, e.pos.y + 0.1, e.pos.z + fz * 0.75);
    return out.set(e.pos.x + fx * 0.45, e.pos.y + 0.18, e.pos.z + fz * 0.45);
  }

  /** one lime glob along a ballistic arc to the locked mark */
  private lob(game: Game): void {
    const m = this.muzzle(_m);
    if (!game.hasLOS(this.e.pos.x, m.y, this.e.pos.z, m.x, m.y, m.z) || !this.globMesh) return;
    const vy = (this.landing.y + 0.15 - m.y + 0.5 * GLOB_GRAVITY * GLOB_FLIGHT * GLOB_FLIGHT) / GLOB_FLIGHT;
    this.glob = { mesh: this.globMesh, from: m.clone(), to: this.landing.clone(), vy, t: 0 };
    this.globMesh.visible = true;
    this.globMesh.position.copy(m);
    game.audio.play('gush', this.e.pos);
  }

  /** three slow bone spikes in a narrow horizontal fan along the locked aim */
  private spikes(game: Game): void {
    const m = this.muzzle(_m), e = this.e;
    if (!game.hasLOS(e.pos.x, m.y, e.pos.z, m.x, m.y, m.z)) return;
    for (const off of [-SPIKE_FAN, 0, SPIKE_FAN]) {
      const c = Math.cos(off), s = Math.sin(off);
      const x = this.aim.x * c - this.aim.z * s, z = this.aim.x * s + this.aim.z * c;
      const len = Math.hypot(x, this.aim.y, z) || 1;
      game.projectiles.spawn('spike', m.x, m.y, m.z, x / len, this.aim.y / len, z / len, SPIKE_SPEED, false, 1,
        { damage: SPIKE_DAMAGE, by: 'carapace' });
    }
    game.audio.play('boltFire', e.pos);
  }

  /** glob flight + impact, the patch's ticks and lifetime */
  private effects(dt: number, game: Game): void {
    const g = this.glob;
    if (g) {
      const prev = g.mesh.position.clone();
      g.t += dt;
      const k = Math.min(1, g.t / GLOB_FLIGHT);
      const x = lerp(g.from.x, g.to.x, k), z = lerp(g.from.z, g.to.z, k);
      const y = g.from.y + g.vy * g.t - 0.5 * GLOB_GRAVITY * g.t * g.t;
      // the first real obstruction (voxel or closed door) takes the impact
      const sx = x - prev.x, sy = y - prev.y, sz = z - prev.z, len = Math.hypot(sx, sy, sz);
      let hitT: number | null = null, floorHit = false;
      if (len > 1e-4) {
        const h = game.world.raycast(prev.x, prev.y, prev.z, sx / len, sy / len, sz / len, len);
        if (h) { hitT = h.t; floorHit = h.ny > 0; }
        for (const d of game.doors) {
          if (d.isOpen) continue;
          const t = rayBox(prev.x, prev.y, prev.z, sx / len, sy / len, sz / len, len, d.box());
          if (t !== null && (hitT === null || t < hitT)) { hitT = t; floorHit = false; }
        }
      }
      if (hitT !== null) {
        const f = hitT / len;
        this.impact(game, prev.x + sx * f, prev.y + sy * f, prev.z + sz * f, floorHit);
      } else if (k >= 1) {
        this.impact(game, g.to.x, g.to.y, g.to.z, true);
      } else {
        g.mesh.position.set(x, y, z);
        g.mesh.rotation.x += dt * 7; g.mesh.rotation.z += dt * 5;
        game.particles.trail(x, y, z, 0.55, 1, 0.2, 0.05);
      }
    }
    const p = this.patch;
    if (p && this.patchMesh) {
      p.life -= dt;
      const fade = Math.min(1, p.life / 0.6);
      this.patchMesh.scale.set(fade, 1, fade);
      this.patchMesh.children.forEach((c, i) => { if (i > 0) c.position.y = 0.06 + Math.abs(Math.sin(this.time * 3 + i * 1.7)) * 0.08; });
      if (p.life <= 0) this.retirePatch();
      else {
        const now = game.simTime;
        for (const pl of game.playerTargets()) {
          if (pl.dead) continue;
          const feet = pl.pos.y - pl.half.y;
          if (Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z) > PATCH_RADIUS + pl.half.x * 0.5 || Math.abs(feet - p.y) > 0.6) continue;
          if ((acidReady.get(pl) ?? 0) > now) continue;
          acidReady.set(pl, now + PATCH_TICK);
          pl.damage(PATCH_DAMAGE, game, { x: p.x, z: p.z, by: 'spitter' });
        }
      }
    }
  }

  private impact(game: Game, x: number, y: number, z: number, floor: boolean): void {
    if (this.globMesh) this.globMesh.visible = false;
    this.glob = null;
    if (this.mark) this.mark.visible = false;
    game.particles.impact(x, y + 0.1, z, 0, 1, 0, 0.6, 1, 0.25);
    game.audio.play('boltHit', { x, y, z });
    game.dynLights.flash(x, y + 0.3, z, 0.5, 1, 0.2, 1.2, 4, 0.25);
    for (const pl of game.playerTargets()) {
      if (pl.dead) continue;
      const d = Math.hypot(pl.pos.x - x, pl.pos.y - pl.half.y * 0.5 - y, pl.pos.z - z);
      if (d < GLOB_RADIUS + pl.half.x && game.hasLOS(x, y + 0.3, z, pl.pos.x, pl.pos.y, pl.pos.z)) {
        pl.damage(GLOB_DAMAGE, game, { x, z, by: 'spitter' });
      }
    }
    // a patch only on supported floor, never plugging a doorway or corridor
    if (floor && this.placeable(game, x, y, z)) {
      this.placePatch(x, y, z);
      // the glob's own hit isn't followed by a sting in the same instant
      for (const pl of game.playerTargets()) acidReady.set(pl, Math.max(acidReady.get(pl) ?? 0, game.simTime + PATCH_TICK));
    }
  }

  private placeable(game: Game, x: number, y: number, z: number): boolean {
    const w = game.world, cx = Math.floor(x), cy = Math.floor(y + 0.2), cz = Math.floor(z);
    if (!w.isSolid(cx, cy - 1, cz) || w.isSolid(cx, cy, cz)) return false;
    // walls on both sides along either axis = a doorway / one-wide passage
    const pinchX = w.isSolid(cx - 1, cy, cz) && w.isSolid(cx + 1, cy, cz);
    const pinchZ = w.isSolid(cx, cy, cz - 1) && w.isSolid(cx, cy, cz + 1);
    return !pinchX && !pinchZ;
  }

  private placePatch(x: number, y: number, z: number): void {
    if (!this.patchMesh) return;
    this.retirePatch(); // one patch per Spitter: the new one replaces its old
    while (patchOwners.length >= PATCH_CAP) patchOwners[0].retirePatch();
    this.patch = { x, y: Math.floor(y + 0.2), z, life: PATCH_LIFE };
    this.patchMesh.position.set(x, this.patch.y, z);
    this.patchMesh.scale.set(1, 1, 1);
    this.patchMesh.visible = true;
    patchOwners.push(this);
  }

  private retirePatch(): void {
    this.patch = null;
    if (this.patchMesh) this.patchMesh.visible = false;
    const i = patchOwners.indexOf(this);
    if (i >= 0) patchOwners.splice(i, 1);
  }

  /** is a patch down (tests) */
  get patchLive(): boolean { return !!this.patch; }

  // ---------------------------------------------------------------------------
  // Damage rules
  // ---------------------------------------------------------------------------

  /**
   * The Carapace's armour is positional: shots into its closed front plates do
   * a quarter, its sides and back take full damage, its bared core double.
   * `dx, dz` is the direction the hit travelled.
   */
  scaleDamage(dmg: number, dx: number, dz: number, coreHit: boolean): { dmg: number; armored: boolean } {
    if (this.kind !== 'carapace') return { dmg, armored: false };
    if (this.e.coreOpen) return { dmg: coreHit ? dmg * 2 : dmg, armored: false };
    const n = Math.hypot(dx, dz);
    const fx = -Math.sin(this.face), fz = -Math.cos(this.face);
    const intoFront = n > 0.001 && (dx * fx + dz * fz) / n < -0.35;
    return intoFront ? { dmg: dmg * 0.25, armored: true } : { dmg, armored: false };
  }

  /** a Spitter flinches once per charge at most; a Carapace never mid-attack */
  painAllowed(): boolean {
    const attacking = this.e.state === 'attack' || this.e.state === 'charge';
    if (this.kind === 'carapace') return !attacking;
    return !(attacking && this.interrupted);
  }

  onDeath(): void {
    if (this.mark) this.mark.visible = false;
    this.e.coreOpen = false;
  }

  dispose(): void {
    this.retirePatch();
    this.glob = null;
    this.fx.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.kit.dispose();
  }
}

const _m = new THREE.Vector3();

/** top of the floor under (x, y, z) */
function floorTop(game: Game, x: number, y: number, z: number): number {
  const bx = Math.floor(x), bz = Math.floor(z);
  for (let by = Math.floor(y); by >= 0; by--) if (game.world.isSolid(bx, by, bz)) return by + 1;
  return 1;
}

/** level teardown / retry: no patch survives into the next attempt */
export function clearBioHazards(): void {
  for (const o of [...patchOwners]) o.dispose();
  patchOwners.length = 0;
  acidReady.clear();
}
