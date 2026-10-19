import * as THREE from 'three';
import { EnemySpec, RoomDef } from '../types';
import { isDestructible } from '../world/blocks';
import { moveBody, rayBox } from '../core/physics';
import { SEEN_HOLD, seenFrom } from '../core/occlusion';
import type { VoxelWorld } from '../world/world';
import type { Game, PlayerTarget } from '../game';

export type EState = 'idle' | 'patrol' | 'chase' | 'attack' | 'charge' | 'pain' | 'dead';

/**
 * Every attack runs prepare → commit → recover. `attack` is a planted strike
 * (husk claw, brute backhand, vatborn club, sentinel bolt, ticker arming);
 * `charge` is a committed move (husk lunge, brute charge, vatborn rush) whose
 * commit phase is `move`. The schedule is the only thing a co-op client needs
 * to pose a puppet: it derives the phase from state + time with SCHED.
 */
export type Phase = 'prep' | 'strike' | 'move' | 'recover';

interface Sched {
  /** warning length; the facing locks at `lock` and tracks the target before it */
  prep: number;
  lock: number;
  /** follow-through (strike) or maximum travel time (move) */
  commit: number;
  /** protected interval: no new attack can start until it ends */
  recover: number;
}

/** reference/enemy-upgrades.md timings */
const SCHED: Record<EnemySpec['kind'], { attack: Sched; charge: Sched }> = {
  husk: {
    attack: { prep: 0.4, lock: 0.2, commit: 0.12, recover: 0.6 },
    charge: { prep: 0.5, lock: 0.3, commit: 0.3, recover: 0.85 },
  },
  brute: {
    attack: { prep: 0.6, lock: 0.35, commit: 0.15, recover: 0.9 },
    charge: { prep: 0.8, lock: 0.55, commit: 1.2, recover: 0.9 },
  },
  vatborn: {
    // 1.10 of recovery after the impact: follow-through + recover
    attack: { prep: 0.65, lock: 0.3, commit: 0.15, recover: 0.95 },
    charge: { prep: 0.3, lock: 0, commit: 0.35, recover: 0.6 },
  },
  ticker: {
    attack: { prep: 0.75, lock: 0, commit: 0, recover: 0 },
    charge: { prep: 0.75, lock: 0, commit: 0, recover: 0 },
  },
  sentinel: {
    attack: { prep: 0.7, lock: 0.45, commit: 0, recover: 0.9 },
    charge: { prep: 0.7, lock: 0.45, commit: 0, recover: 0.9 },
  },
  // the boss runs its own cycle (bossUpdate); never used
  broodkeeper: {
    attack: { prep: 1, lock: 0, commit: 0, recover: 0 },
    charge: { prep: 1, lock: 0, commit: 0, recover: 0 },
  },
};

/**
 * The Broodkeeper (reference/sector4-monsters.md): a stationary boss in a
 * cradle. Cycle: acid volley (1 s warning, globs 0.35 s apart) → core open
 * 2.4 s → release up to 2 Husks (1 s of hatch rattle, ≤ 4 summons alive) →
 * core open 3 s → repeat. Five globs instead of three below 40% health.
 * Closed armor takes 25% of the damage; open, the core zone takes 2×.
 */
const BOSS_VOLLEY_WARN = 1.0;
const BOSS_SHOT_GAP = 0.35;
// the core is open 3.2 s of a 6.65 s cycle (it was 5.4 of 8.85: held SMG
// fire killed the 600 HP boss inside its first opening, ~8 s). With 2200 HP
// a PERFECT held-SMG fight at the core takes ~24 s — real ones run longer
const BOSS_OPEN_1 = 1.4;
const BOSS_RELEASE = 1.4;
const BOSS_OPEN_2 = 1.8;
const BOSS_SUMMON_CAP = 4;
const BOSS_ACID_SPEED = 11;
/** below this much health it enrages: a fanned volley and a ticker in each release */
const BOSS_ENRAGE = 0.5;
/** angle between the globs of an enraged volley's fan (radians) */
const BOSS_FAN = 0.12;
/** core zone: this band of the body (center-relative y), hitscan only */
export const BOSS_CORE_Y: [number, number] = [-0.22, 0.42];

/** ticker arming beeps (seconds into the warning) */
const TICKER_BEEPS = [0, 0.25, 0.45, 0.6];
/** husk lunge / brute charge / vatborn rush speeds and reaches */
const HUSK_LUNGE_SPEED = 9.0;
// Approximately the old chase's effective speed at 60 Hz, without per-frame
// steering/friction changing it on faster or slower devices.
const HUSK_RUN_SPEED = 3.2;
const BRUTE_CHARGE_SPEED = 2.3 * 4.2;
const VAT_RUSH_SPEED = 6.8;
/** sentinel: keep this far away when it can */
const SENTINEL_NEAR = 7;
const SENTINEL_FAR = 12;

interface EnemyTuning {
  hp: number;
  speed: number;
  halfX: number;
  halfY: number;
  painChance: number;
  bloodColor: [number, number, number];
}

const TUNING: Record<EnemySpec['kind'], EnemyTuning> = {
  husk: { hp: 45, speed: 5.0, halfX: 0.38, halfY: 0.82, painChance: 0.4, bloodColor: [0.9, 0.45, 0.1] },
  sentinel: { hp: 60, speed: 2.7, halfX: 0.45, halfY: 0.45, painChance: 0.25, bloodColor: [0.25, 0.85, 1] },
  // fragile suicide crawler: sprints at the player and self-destructs — and
  // its corpse explodes even when shot at range, so prioritize it near barrels
  ticker: { hp: 20, speed: 6.6, halfX: 0.3, halfY: 0.32, painChance: 0.1, bloodColor: [0.75, 0.85, 0.2] },
  // arena pit boss: slow tank that telegraphs a wall-smashing charge; stunned
  // when it slams a wall, always drops a powerup on death
  brute: { hp: 170, speed: 2.3, halfX: 0.62, halfY: 1.05, painChance: 0.12, bloodColor: [0.85, 0.4, 0.1] },
  // sector 4 preview: the escaped specimen (reference/sector4-monsters.md).
  // Shambles, short rush, one heavy swing with a long recovery; green blood
  vatborn: { hp: 55, speed: 3.4, halfX: 0.5, halfY: 0.9, painChance: 0.3, bloodColor: [0.55, 0.8, 0.3] },
  // boss: never moves, never flinches (its armor and core do the work)
  broodkeeper: { hp: 2200, speed: 0, halfX: 1.5, halfY: 1.4, painChance: 0, bloodColor: [0.8, 0.25, 0.2] },
};

const ALERT_SOUND: Record<EnemySpec['kind'], 'huskAlert' | 'sentinelAlert' | 'tickerAlert' | 'bruteRoar'> = {
  husk: 'huskAlert', sentinel: 'sentinelAlert', ticker: 'tickerAlert', brute: 'bruteRoar', vatborn: 'bruteRoar',
  broodkeeper: 'bruteRoar',
};

/** husk-skeleton walkers: the jointed rig + walker gait/attack animation drive them */
function humanoid(kind: EnemySpec['kind']): boolean {
  return kind === 'husk' || kind === 'brute' || kind === 'vatborn';
}

// per-frame scratch (enemies update one at a time)
const _toPlayer = new THREE.Vector3();
const _light: [number, number, number] = [0, 0, 0];
const _dyn: [number, number, number] = [0, 0, 0];

/** Broodkeeper face shades (+x, -x, +y, -y, +z, -z; it faces -z): light from the upper left */
const BOSS_FACE_SHADE = [0.74, 0.9, 1.0, 0.5, 0.62, 0.86];

const makePart = part;
function part(parent: THREE.Object3D, w: number, h: number, d: number, color: number, fullBright = false): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color, fog: !fullBright })
  );
  mesh.userData.baseColor = new THREE.Color(color);
  mesh.userData.fullBright = fullBright;
  parent.add(mesh);
  return mesh;
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}

function smooth01(t: number): number {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
}

/** Lowest Husk foot corner after its hip and knee rotations. */
function huskSole(hip: number, knee: number): number {
  const a = hip + knee;
  return -0.14 - Math.cos(hip) * 0.32 - Math.cos(a) * 0.34 + Math.sin(a) * 0.05 -
    Math.abs(Math.cos(a)) * 0.05 - Math.abs(Math.sin(a)) * 0.14;
}

export class Enemy {
  readonly kind: EnemySpec['kind'];
  readonly tuning: EnemyTuning;
  state: EState = 'idle';
  hp: number;
  /** full health, after any endless scaling (the boss bar and enrage use it) */
  maxHp = 0;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly half = new THREE.Vector3();
  readonly mesh = new THREE.Group();
  awake = false;
  private stateTime = 0;
  private attackCooldown = 0;
  private jinkTime = 0;
  private jinkSign = 1;
  private animPhase = Math.random() * 10;
  private patrolTarget: [number, number] | null = null;
  /** husk lunge / vatborn rush cooldown (counted from the end of the recovery) */
  private lungeCooldown = 0;
  private flashTime = 0;
  private lightTick = Math.random();
  private hoverPhase = Math.random() * 10;
  private room: RoomDef | null;
  // model parts used by animation (walkers: jointed groups pivoting at hip/shoulder/neck)
  private legLG: THREE.Group | null = null;
  private legRG: THREE.Group | null = null;
  private huskKneeLG: THREE.Group | null = null;
  private huskKneeRG: THREE.Group | null = null;
  private huskMotionReady = false;
  private huskLastX = 0;
  private huskLastZ = 0;
  private huskWalk = 0;
  private armLG: THREE.Group | null = null;
  private armRG: THREE.Group | null = null;
  private torsoG: THREE.Group | null = null;
  private headG: THREE.Group | null = null;
  private jaw: THREE.Mesh | null = null;
  /** ticker: six legs + two lid pivots; sentinel: four paddle pivots + two shutters */
  private legs: THREE.Mesh[] = [];
  private lids: THREE.Group[] = [];
  private paddles: THREE.Group[] = [];
  private shutters: THREE.Mesh[] = [];
  private glowParts: THREE.Mesh[] = [];
  private body: THREE.Group;
  /** occlusion cull: seconds left to keep the rig drawn after last sighting */
  private seenHold = 0;
  private gait = Math.random() * 10;
  private lastStride = 0;
  /** ticker arming beeps played so far this attack */
  private beepCount = 0;
  /** brute charge cooldown and the post-slam stun length (pain state) */
  private chargeCooldown = 0;
  private stunTime = 0.32;
  // --- the current attack ---------------------------------------------------
  phase: Phase = 'prep';
  phaseT = 0;
  /** the player this attack was declared against — never swapped mid-attack */
  private atkTgt: PlayerTarget | null = null;
  /** locked facing/strike direction (world xz); tracking stops at SCHED.lock */
  private lockX = 0;
  private lockZ = -1;
  private faceLocked = false;
  /** one strike/charge deals damage once */
  private hitConsumed = false;
  /** committed move: travel time, capped so a lunge/rush stops short of the target */
  private moveMax = 0;
  /** sentinel: aim committed at SCHED.lock, fired at SCHED.prep */
  private aimX = 0;
  private aimY = 0;
  private aimZ = -1;
  private onGround = false;
  /** sentinel: seconds its lateral choice has been blocked by a wall */
  private blockedT = 0;
  private strafeSign = Math.random() < 0.5 ? -1 : 1;
  /** which way the whole model jolts on the current hit flash */
  private flinchSign = 1;
  /** set by hitscan right before damage() when the shot landed in the head zone */
  lastHitHead = false;
  /** boss: set by hitscan right before damage() when the shot landed in the core zone */
  lastHitCore = false;
  /** boss: the chest plates are open — the core takes double, the rest full damage */
  coreOpen = false;
  /** boss state (null for every other kind) */
  private boss: {
    active: boolean;
    phase: 'volley' | 'open1' | 'release' | 'open2';
    t: number;
    shots: number;
    fired: number;
    released: boolean;
    summons: Enemy[];
    /** phase 2 announced (below BOSS_ENRAGE) */
    enraged?: boolean;
    yaw: number;
    headYaw: number;
    plates: number;
    parts: {
      torso: THREE.Group; head: THREE.Group; plateL: THREE.Group; plateR: THREE.Group;
      hatchL: THREE.Group; hatchR: THREE.Group; core: THREE.Mesh; eye: THREE.Mesh; insets: THREE.Mesh[];
    };
  } | null = null;
  /** co-op client: this enemy is a network puppet — no AI, interpolate only */
  puppet = false;
  /**
   * Tank occupant (sector 4 preview): floats in place behind solid glass —
   * no AI, no physics, can't be woken by noise. `agitation` (0..1) is set by
   * the tank and makes it thrash. startEmerge() walks it out.
   */
  dormant = false;
  agitation = 0;
  private emerge: { fx: number; fy: number; fz: number; tx: number; ty: number; tz: number; t: number } | null = null;
  private ntx = 0;
  private nty = 0;
  private ntz = 0;
  private nyaw = 0;
  private netInit = false;
  /** the player this enemy is currently hunting (local or co-op partner) */
  private tgt: PlayerTarget | null = null;
  private growlCd = 2 + Math.random() * 4;

  constructor(spec: EnemySpec, room: RoomDef | null, groundY: number, startPatrolling: boolean) {
    this.kind = spec.kind;
    this.tuning = TUNING[spec.kind];
    this.hp = this.tuning.hp;
    this.maxHp = this.hp;
    this.half.set(this.tuning.halfX, this.tuning.halfY, this.tuning.halfX);
    this.pos.set(spec.x, groundY + this.half.y + (spec.kind === 'sentinel' ? 1.0 : 0.05), spec.z);
    this.room = room;
    this.body = new THREE.Group();
    this.mesh.add(this.body);
    if (spec.kind === 'husk') this.buildHusk();
    else if (spec.kind === 'ticker') this.buildTicker();
    else if (spec.kind === 'brute') this.buildBrute();
    else if (spec.kind === 'vatborn') this.buildVatborn();
    else if (spec.kind === 'broodkeeper') this.buildBroodkeeper();
    else this.buildSentinel();
    this.mesh.position.copy(this.pos);
    if (startPatrolling) this.state = 'patrol';
  }

  // ---------------------------------------------------------------------------
  // Rigs: reference/enemy-upgrades.md construction contract — large boxes only,
  // flat colours, the budgets in its table. Models face local -z.
  // ---------------------------------------------------------------------------

  private buildHusk(): void {
    // reference/enemy-upgrade-husk-v2.png: a lean rust-red hunter, 1.64 tall,
    // low forward head with a dark visor and amber eye slit, long thin arms
    // ending in small dark claw hands, a low shallow back ridge. 23 boxes.
    const RUST = 0xd2622f, RUST_D = 0x9c4426, BROWN = 0x5c2f23, DARK = 0x2a2c33, PALE = 0xe5d6ad;
    const mkLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.17 * side, -0.14, 0);
      const thigh = part(g, 0.2, 0.32, 0.22, RUST);
      thigh.position.y = -0.16;
      // A knee pivot reuses the same shin/foot boxes, adding no meshes.
      const knee = new THREE.Group();
      knee.position.y = -0.32;
      g.add(knee);
      if (side < 0) this.huskKneeLG = knee;
      else this.huskKneeRG = knee;
      const shin = part(knee, 0.17, 0.28, 0.19, RUST_D);
      shin.position.set(0, -0.14, -0.01);
      const foot = part(knee, 0.22, 0.1, 0.28, DARK);
      foot.position.set(0, -0.34, -0.05);
      this.body.add(g);
      return g;
    };
    this.legLG = mkLeg(-1);
    this.legRG = mkLeg(1);

    this.torsoG = new THREE.Group();
    this.torsoG.position.y = -0.1;
    this.body.add(this.torsoG);
    const pelvis = part(this.torsoG, 0.4, 0.24, 0.3, RUST_D);
    pelvis.position.y = 0.04;
    const chest = part(this.torsoG, 0.5, 0.46, 0.34, RUST);
    chest.position.y = 0.38;
    chest.rotation.x = 0.1;
    const ridge = part(this.torsoG, 0.34, 0.2, 0.22, BROWN);
    ridge.position.set(0, 0.58, 0.17);
    const collar = part(this.torsoG, 0.6, 0.12, 0.3, BROWN);
    collar.position.set(0, 0.62, 0);

    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.66, -0.16);
    this.torsoG.add(this.headG);
    const neck = part(this.headG, 0.14, 0.12, 0.14, RUST_D);
    neck.position.set(0, -0.08, 0.06);
    const skull = part(this.headG, 0.36, 0.3, 0.38, RUST);
    skull.position.y = 0.1;
    const visor = part(this.headG, 0.32, 0.14, 0.04, DARK);
    visor.position.set(0, 0.08, -0.21);
    const eye = part(this.headG, 0.2, 0.06, 0.03, 0xffb028, true);
    eye.position.set(0, 0.08, -0.235);
    this.glowParts.push(eye);
    this.jaw = part(this.headG, 0.3, 0.1, 0.3, RUST_D);
    this.jaw.position.set(0, -0.07, -0.06);

    const mkArm = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.31 * side, 0.56, 0);
      const upper = part(g, 0.14, 0.4, 0.14, RUST);
      upper.position.y = -0.2;
      const fore = part(g, 0.12, 0.38, 0.12, RUST_D);
      fore.position.set(0, -0.58, -0.02);
      const hand = part(g, 0.18, 0.16, 0.18, DARK);
      hand.position.set(0, -0.84, -0.04);
      const claw = part(g, 0.08, 0.06, 0.1, PALE);
      claw.position.set(0, -0.9, -0.12);
      this.torsoG!.add(g);
      return g;
    };
    this.armLG = mkArm(-1);
    this.armRG = mkArm(1);
  }

  private buildBrute(): void {
    // reference/enemy-upgrade-brute.png: a broad rust-red heavy — two pale
    // bone shoulder slabs, a chest slab, a brow plate and two square tusks,
    // huge dark fists, two back blocks for the hunch. 25 boxes. Same jointed
    // skeleton as the husk so one walker animation drives both.
    const RED = 0xa8402c, RED_D = 0x7a2f22, BONE = 0xd9c9a0, DARK = 0x2e2b2f;
    const mkLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.3 * side, -0.2, 0);
      const thigh = part(g, 0.3, 0.42, 0.32, RED);
      thigh.position.y = -0.19;
      const shin = part(g, 0.26, 0.36, 0.28, RED_D);
      shin.position.set(0, -0.58, -0.02);
      const foot = part(g, 0.34, 0.12, 0.4, DARK);
      foot.position.set(0, -0.81, -0.06);
      this.body.add(g);
      return g;
    };
    this.legLG = mkLeg(-1);
    this.legRG = mkLeg(1);

    this.torsoG = new THREE.Group();
    this.torsoG.position.y = -0.06;
    this.body.add(this.torsoG);
    const belly = part(this.torsoG, 0.76, 0.4, 0.54, RED_D);
    belly.position.y = 0.1;
    const chest = part(this.torsoG, 0.98, 0.72, 0.64, RED);
    chest.position.y = 0.52;
    chest.rotation.x = 0.14;
    const backA = part(this.torsoG, 0.6, 0.36, 0.3, RED_D);
    backA.position.set(0, 0.8, 0.3);
    const backB = part(this.torsoG, 0.4, 0.26, 0.24, RED_D);
    backB.position.set(0, 0.96, 0.2);
    const plateL = part(this.torsoG, 0.42, 0.26, 0.5, BONE);
    plateL.position.set(-0.5, 0.86, 0);
    plateL.rotation.z = -0.12;
    const plateR = part(this.torsoG, 0.42, 0.26, 0.5, BONE);
    plateR.position.set(0.5, 0.86, 0);
    plateR.rotation.z = 0.12;
    const chestPlate = part(this.torsoG, 0.5, 0.36, 0.1, BONE);
    chestPlate.position.set(0, 0.5, -0.34);

    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.8, -0.3);
    this.torsoG.add(this.headG);
    const skull = part(this.headG, 0.52, 0.36, 0.48, RED);
    skull.position.y = 0.1;
    const brow = part(this.headG, 0.56, 0.12, 0.16, BONE);
    brow.position.set(0, 0.26, -0.2);
    const eye = part(this.headG, 0.36, 0.07, 0.05, 0xff8030, true);
    eye.position.set(0, 0.12, -0.26);
    this.glowParts.push(eye);
    this.jaw = part(this.headG, 0.44, 0.14, 0.4, RED_D);
    this.jaw.position.set(0, -0.1, -0.1);
    const tuskL = part(this.headG, 0.1, 0.2, 0.1, BONE);
    tuskL.position.set(-0.17, -0.02, -0.3);
    const tuskR = part(this.headG, 0.1, 0.2, 0.1, BONE);
    tuskR.position.set(0.17, -0.02, -0.3);

    const mkArm = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.62 * side, 0.74, 0);
      const upper = part(g, 0.3, 0.5, 0.3, RED);
      upper.position.y = -0.24;
      const fore = part(g, 0.28, 0.42, 0.3, RED_D);
      fore.position.set(0, -0.66, -0.06);
      const fist = part(g, 0.4, 0.34, 0.4, DARK);
      fist.position.set(0, -1.02, -0.1);
      this.torsoG!.add(g);
      return g;
    };
    this.armLG = mkArm(-1);
    this.armRG = mkArm(1);
  }

  private buildVatborn(): void {
    // reference/enemy-upgrade-vatborn.png (= sector4-vatborn.png): a hunched
    // pale mutant whose right arm is a club — huge stained shoulder, thick
    // forearm in a dark restraint cuff with a broken bolt, and an enormous
    // dark fist that hangs to the floor. The left arm stays thin. Dark chest
    // band with the green specimen mark, a blunt head pushed forward with a
    // dark visor and an amber eye slot, olive-stained shins, dark boots.
    // 29 boxes. Model faces -z, so its right side is +x (a viewer in front
    // sees the club on their left, as in the concept).
    const PALE = 0xcfc7b0, PALE_DARK = 0xb3ab95, STAIN = 0x7f8c4f, BAND = 0x2c3034, FIST = 0x46433f;
    const mkLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.2 * side, -0.25, 0);
      const thigh = part(g, 0.25, 0.34, 0.27, PALE);
      thigh.position.y = -0.15;
      const shin = part(g, 0.22, 0.3, 0.24, STAIN);
      shin.position.set(0, -0.43, -0.01);
      const boot = part(g, 0.28, 0.16, 0.36, BAND);
      boot.position.set(0, -0.6, -0.06);
      this.body.add(g);
      return g;
    };
    this.legLG = mkLeg(-1);
    this.legRG = mkLeg(1);

    this.torsoG = new THREE.Group();
    this.torsoG.position.y = -0.12;
    this.body.add(this.torsoG);
    const pelvis = part(this.torsoG, 0.5, 0.26, 0.36, PALE_DARK);
    pelvis.position.y = 0.0;
    const chest = part(this.torsoG, 0.78, 0.58, 0.52, PALE);
    chest.position.y = 0.4;
    const band = part(this.torsoG, 0.8, 0.2, 0.54, BAND);
    band.position.y = 0.34;
    const mark = part(this.torsoG, 0.16, 0.14, 0.03, 0x86e64e, true);
    mark.position.set(-0.04, 0.34, -0.285);
    this.glowParts.push(mark);
    // the hump between the shoulders, and the giant right shoulder with its stain
    const hump = part(this.torsoG, 0.46, 0.32, 0.42, PALE);
    hump.position.set(0.06, 0.78, 0.1);
    const shoulderR = part(this.torsoG, 0.5, 0.44, 0.52, PALE);
    shoulderR.position.set(0.5, 0.66, 0);
    const shoulderStain = part(this.torsoG, 0.52, 0.2, 0.54, STAIN);
    shoulderStain.position.set(0.52, 0.84, 0);
    const shoulderL = part(this.torsoG, 0.26, 0.24, 0.3, PALE_DARK);
    shoulderL.position.set(-0.42, 0.6, 0);

    // head: pushed forward and toward the thin-arm side, below the hump line
    this.headG = new THREE.Group();
    this.headG.position.set(-0.14, 0.62, -0.34);
    this.torsoG.add(this.headG);
    const skull = part(this.headG, 0.42, 0.38, 0.42, PALE);
    skull.position.y = 0.1;
    const visor = part(this.headG, 0.38, 0.16, 0.05, BAND);
    visor.position.set(0, 0.08, -0.225);
    const eye = part(this.headG, 0.24, 0.06, 0.03, 0xffa030, true);
    eye.position.set(0, 0.08, -0.255);
    this.glowParts.push(eye);
    this.jaw = part(this.headG, 0.32, 0.08, 0.3, PALE_DARK);
    this.jaw.position.set(0, -0.11, -0.04);

    // right arm: the club
    const armR = new THREE.Group();
    armR.position.set(0.56, 0.6, -0.02);
    this.torsoG.add(armR);
    const upperR = part(armR, 0.36, 0.48, 0.38, PALE);
    upperR.position.y = -0.24;
    const foreR = part(armR, 0.44, 0.44, 0.44, PALE);
    foreR.position.set(0, -0.66, -0.05);
    const cuff = part(armR, 0.5, 0.18, 0.5, BAND);
    cuff.position.set(0, -0.84, -0.05);
    const bolt = part(armR, 0.16, 0.12, 0.16, 0x6a7280);
    bolt.position.set(0.32, -0.84, -0.05);
    const fist = part(armR, 0.64, 0.5, 0.58, FIST);
    fist.position.set(0, -1.14, -0.08);
    const knuckles = part(armR, 0.66, 0.12, 0.2, 0x3a3734);
    knuckles.position.set(0, -1.02, -0.36);
    this.armRG = armR;

    // left arm: thin, stained at the elbow, a small hand
    const armL = new THREE.Group();
    armL.position.set(-0.44, 0.56, -0.02);
    this.torsoG.add(armL);
    const upperL = part(armL, 0.15, 0.38, 0.15, PALE);
    upperL.position.y = -0.19;
    const elbow = part(armL, 0.16, 0.14, 0.16, STAIN);
    elbow.position.y = -0.4;
    const foreL = part(armL, 0.14, 0.34, 0.14, PALE_DARK);
    foreL.position.set(0, -0.58, -0.03);
    const wrist = part(armL, 0.16, 0.07, 0.16, BAND);
    wrist.position.set(0, -0.76, -0.03);
    const handL = part(armL, 0.17, 0.15, 0.18, PALE_DARK);
    handL.position.set(0, -0.86, -0.05);
    this.armLG = armL;
  }

  private buildTicker(): void {
    // reference/enemy-upgrade-ticker.png: a low hazard-yellow crawler. Two
    // side-hinged lids (each carrying a dark band) open when it commits to
    // explode, exposing an amber battery; a dark front bezel frames the core;
    // six single-box angled legs. 16 boxes.
    const YEL = 0xe2b230, DARK = 0x2b2d35, AMBER = 0xffb028;
    const chassis = part(this.body, 0.44, 0.16, 0.5, YEL);
    chassis.position.y = -0.03;
    // the lids enclose the battery while closed, so it only shows once they lift
    const battery = part(this.body, 0.2, 0.1, 0.28, AMBER, true);
    battery.position.y = 0.06;
    const bezel = part(this.body, 0.3, 0.18, 0.05, DARK);
    bezel.position.set(0, -0.02, -0.27);
    const core = part(this.body, 0.2, 0.1, 0.03, AMBER, true);
    core.position.set(0, -0.02, -0.3);
    this.glowParts.push(core, battery);
    for (const side of [-1, 1]) {
      const hinge = part(this.body, 0.06, 0.08, 0.16, DARK);
      hinge.position.set(0.23 * side, 0.05, 0);
      const lid = new THREE.Group();
      lid.position.set(0.22 * side, 0.05, 0);
      const slab = part(lid, 0.22, 0.06, 0.5, YEL);
      slab.position.set(-0.11 * side, 0.03, 0);
      const bandSlab = part(lid, 0.07, 0.02, 0.5, DARK);
      bandSlab.position.set(-0.11 * side, 0.07, 0);
      this.body.add(lid);
      this.lids.push(lid);
    }
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const leg = part(this.body, 0.08, 0.26, 0.08, DARK);
      leg.position.set(0.26 * side, -0.14, -0.16 + Math.floor(i / 2) * 0.16);
      leg.rotation.z = 0.55 * side;
      this.legs.push(leg);
    }
  }

  private buildSentinel(): void {
    // reference/enemy-upgrade-sentinel.png: a steel-teal hovering box with one
    // cyan optic between two pale shutters, a dark cap, a cyan emitter below,
    // and four thick paddles on corner hinges. Charging spreads the paddles and
    // slides the shutters out; recovery folds everything in. 16 boxes.
    const TEAL = 0x4c7f93, DARK = 0x202830, CYAN = 0x55e0ff, PALE = 0xb8c4cc, PADDLE = 0x6f9fb0;
    const body = part(this.body, 0.56, 0.4, 0.5, TEAL);
    body.position.y = 0;
    const cap = part(this.body, 0.36, 0.1, 0.3, DARK);
    cap.position.y = 0.25;
    const bezel = part(this.body, 0.42, 0.3, 0.06, DARK);
    bezel.position.set(0, 0, -0.27);
    const optic = part(this.body, 0.3, 0.2, 0.04, CYAN, true);
    optic.position.set(0, 0, -0.31);
    this.glowParts.push(optic);
    const pupil = part(this.body, 0.06, 0.12, 0.03, DARK);
    pupil.position.set(0, 0, -0.335);
    const emitter = part(this.body, 0.2, 0.14, 0.2, CYAN, true);
    emitter.position.y = -0.27;
    this.glowParts.push(emitter);
    for (const side of [-1, 1]) {
      const shutter = part(this.body, 0.1, 0.26, 0.06, PALE);
      shutter.position.set(0.3 * side, 0, -0.29);
      this.shutters.push(shutter);
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const housing = part(this.body, 0.1, 0.12, 0.1, DARK);
        housing.position.set(0.3 * sx, 0.06, 0.22 * sz);
        const pivot = new THREE.Group();
        pivot.position.set(0.3 * sx, 0.06, 0.22 * sz);
        const paddle = part(pivot, 0.36, 0.12, 0.18, PADDLE);
        paddle.position.set(0.26 * sx, 0, 0);
        this.body.add(pivot);
        this.paddles.push(pivot);
      }
    }
  }

  private buildBroodkeeper(): void {
    // Matches reference/sector4-broodkeeper.png box for box: a brick-red
    // organism in a dark steel incubation cradle. Front to back: a plinth
    // with two framed, bolted abdominal hatches (hinged at the bottom, they
    // fold forward to release); two big bone chest plates meeting on a thin
    // orange seam (the core behind them); a small head with a wide cap, an
    // orange visor slit and a black mouth; lime reservoirs beside the head;
    // chunky forelimbs braced on dark steel feet; two tall steel towers at
    // the back. ~49 boxes, 3.4 wide. Faces local -z; the body origin is the
    // collider centre, the floor is at y = -1.4.
    // the sheet's own colours, taken RAW (no sRGB decode, like the gun view
    // models' rawColor): decoded, the steel crushed to black and the red
    // went blood-saturated. Each face gets a baked shade (lit from the upper
    // left, like the sheet) so the boxes read apart instead of as one blob.
    const RED = 0x962c2a, RED_D = 0x74201f, RED_L = 0xb03a34;
    const STEEL_D = 0x2e3037, STEEL = 0x40434c, STEEL_L = 0x5a5e68, DOOR = 0x50545e;
    const BONE = 0xd6c59c, RES = 0x92b828, LIME = 0xc0ff48, CORE = 0xff8a1c, EYE = 0xffa020, DARK = 0x0c0a0c;
    const part = (parent: THREE.Object3D, w: number, h: number, d: number, hex: number, glow = false): THREE.Mesh => {
      const m = makePart(parent, w, h, d, hex, glow);
      const c = new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
      m.userData.baseColor = c;
      const mat = m.material as THREE.MeshBasicMaterial;
      mat.color.copy(c);
      if (!glow) {
        const geo = m.geometry;
        const n = geo.attributes.position.count; // 4 verts per face: +x -x +y -y +z -z
        const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) col.fill(BOSS_FACE_SHADE[Math.floor(i / 4)], i * 3, i * 3 + 3);
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        mat.vertexColors = true;
      }
      return m;
    };
    const b = this.body;
    const at = (m: THREE.Object3D, x: number, y: number, z: number): THREE.Object3D => { m.position.set(x, y, z); return m; };
    // cradle: base slab, the front plinth with its seam, steel feet
    at(part(b, 2.7, 0.3, 2.3, STEEL_D), 0, -1.25, 0.1);
    at(part(b, 2.0, 0.32, 0.5, STEEL), 0, -0.94, -0.78);
    at(part(b, 1.9, 0.07, 0.02, STEEL_D), 0, -0.98, -1.04);
    for (const sx of [-1, 1]) {
      at(part(b, 0.8, 0.46, 0.9, STEEL_D), sx * 1.3, -1.17, -0.85);
      at(part(b, 0.55, 0.36, 0.75, STEEL_D), sx * 1.45, -1.22, 0.75);
    }
    // back towers: tall steel with a recessed groove, above the head
    for (const sx of [-1, 1]) {
      at(part(b, 0.44, 2.3, 0.44, STEEL), sx * 1.25, 0.25, 0.85);
      at(part(b, 0.16, 1.8, 0.03, STEEL_D), sx * 1.25, 0.35, 0.62);
      at(part(b, 0.3, 0.45, 0.3, STEEL_D), sx * 0.7, 0.85, 0.55);
    }
    // brood abdomen + framed hatches
    // stops below the chest: any higher and its front face covers the core
    at(part(b, 2.0, 0.65, 1.6, RED), 0, -0.525, 0.15);
    const hatch = (sx: number): THREE.Group => {
      at(part(b, 0.64, 0.54, 0.06, RED_L), sx * 0.38, -0.5, -0.68);
      at(part(b, 0.5, 0.4, 0.03, DARK), sx * 0.38, -0.5, -0.715);
      // the door hinges on its bottom edge and folds forward
      const g = new THREE.Group();
      g.position.set(sx * 0.38, -0.7, -0.75);
      at(part(g, 0.48, 0.38, 0.05, DOOR), 0, 0.19, 0);
      for (const by of [0.08, 0.3]) at(part(g, 0.06, 0.06, 0.03, STEEL_L), -sx * 0.17, by, -0.035);
      b.add(g);
      return g;
    };
    const hatchL = hatch(-1);
    const hatchR = hatch(1);
    // forelimbs: shoulder hub → slanted upper arm → braced lower limb on the foot
    for (const sx of [-1, 1]) {
      at(part(b, 0.55, 0.6, 0.75, RED_D), sx * 0.95, 0.2, -0.4);
      const upper = at(part(b, 0.55, 0.75, 0.7, RED), sx * 1.22, -0.08, -0.66);
      upper.rotation.z = sx * 0.35;
      at(part(b, 0.62, 0.8, 0.8, RED), sx * 1.33, -0.6, -0.86);
    }
    // chest: plates over the core, the seam between them glows orange
    const torso = new THREE.Group();
    torso.position.set(0, 0.1, 0);
    b.add(torso);
    at(part(torso, 1.7, 0.85, 1.3, RED_D), 0, 0.05, 0.1);
    at(part(torso, 1.1, 0.74, 0.1, RED), 0, 0, -0.55);
    at(part(torso, 1.3, 0.3, 1.0, RED), 0, 0.55, 0.25);
    const core = part(torso, 0.5, 0.58, 0.04, CORE, true);
    at(core, 0, 0, -0.61);
    const plate = (sx: number): THREE.Group => {
      // pivot on the outer edge so the plate swings open like a door
      const g = new THREE.Group();
      g.position.set(sx * 0.51, 0, -0.67);
      at(part(g, 0.45, 0.58, 0.08, BONE), -sx * 0.225, 0, 0);
      torso.add(g);
      return g;
    };
    const plateL = plate(-1);
    const plateR = plate(1);
    // head: wide cap, visor slit, black mouth
    const head = new THREE.Group();
    head.position.set(0, 0.62, -0.3);
    torso.add(head);
    at(part(head, 0.6, 0.48, 0.55, RED), 0, -0.05, -0.05);
    at(part(head, 0.95, 0.22, 0.72, RED), 0, 0.28, 0.05);
    const eye = part(head, 0.42, 0.075, 0.03, EYE, true);
    at(eye, 0, 0.1, -0.335);
    at(part(head, 0.36, 0.18, 0.03, DARK), 0, -0.12, -0.335);
    // reservoirs beside the head, clamped to the towers
    const insets: THREE.Mesh[] = [];
    for (const sx of [-1, 1]) {
      at(part(b, 0.46, 0.7, 0.5, RES), sx * 1.3, 0.62, -0.2);
      const inset = part(b, 0.2, 0.36, 0.03, LIME, true);
      at(inset, sx * 1.3, 0.62, -0.465);
      insets.push(inset);
      at(part(b, 0.36, 0.2, 0.36, STEEL_D), sx * 1.05, 1.05, 0.1);
    }
    this.glowParts.push(core, eye, ...insets);
    this.boss = {
      active: false, phase: 'volley', t: -0.8, shots: 3, fired: 0, released: false, summons: [],
      yaw: 0, headYaw: 0, plates: 0,
      parts: { torso, head, plateL, plateR, hatchL, hatchR, core, eye, insets },
    };
  }

  /** boss: turn the cradle to face the room (levelgen picks the yaw) */
  setBossFacing(yaw: number): void {
    if (!this.boss) return;
    this.boss.yaw = yaw;
    this.mesh.rotation.y = yaw;
  }

  /** boss: is the fight on (a player came into the chamber, or hit it) */
  get bossActive(): boolean {
    return !!this.boss?.active && this.alive;
  }

  /** boss: health left, 0..1 */
  get bossFrac(): number {
    return Math.max(0, this.hp) / (this.maxHp || this.tuning.hp);
  }

  private activateBoss(game: Game): void {
    const b = this.boss;
    if (!b || b.active || !this.alive) return;
    b.active = true;
    this.awake = true;
    b.phase = 'volley';
    b.t = -0.6; // a beat before the first warning
    b.fired = 0;
    b.shots = 3;
    game.audio.play('bruteRoar', this.pos);
    game.player.shake = Math.min(0.5, game.player.shake + 0.2);
    game.hud.message('The BROODKEEPER wakes — shoot the orange core when its plates open.');
  }

  /** one acid glob from the mouth, aimed at the target's eye as it leaves */
  private bossShoot(t: PlayerTarget, game: Game, fan = 0): void {
    const b = this.boss!;
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const mx = this.pos.x + fx * 1.15, my = this.pos.y + 0.6, mz = this.pos.z + fz * 1.15;
    // a door or pillar right at the mouth catches the shot instead of skipping past it
    if (!game.hasLOS(this.pos.x, my, this.pos.z, mx, my, mz)) return;
    const dx = t.pos.x - mx, dy = t.eyeY() - my, dz = t.pos.z - mz;
    const l = Math.hypot(dx, dy, dz) || 1;
    // a fanned glob turns about the vertical, so a sidestep no longer beats the whole volley
    const c = Math.cos(fan), sn = Math.sin(fan);
    const ux = (dx * c - dz * sn) / l, uz = (dx * sn + dz * c) / l;
    game.projectiles.spawn('acid', mx, my, mz, ux, dy / l, uz, BOSS_ACID_SPEED, false);
    game.audio.play('boltFire', { x: mx, y: my, z: mz });
    game.dynLights.flash(mx, my, mz, 0.5, 1, 0.2, 1.2, 5, 0.15);
  }

  /** release up to two Husks into clear spots in front of the cradle (summons alive ≤ 4) */
  private bossRelease(game: Game): void {
    const b = this.boss!;
    b.summons = b.summons.filter((e) => e.alive);
    let slots = Math.min(2, BOSS_SUMMON_CAP - b.summons.length);
    // enraged: one of the two is a ticker (it sprints in and blows)
    const kinds: Array<'husk' | 'ticker'> = this.bossFrac < BOSS_ENRAGE ? ['ticker', 'husk'] : ['husk', 'husk'];
    if (slots <= 0) return;
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    const rx = Math.cos(b.yaw), rz = -Math.sin(b.yaw);
    const spots: Array<[number, number]> = [[2.8, -1.3], [2.8, 1.3], [3.9, 0], [3.9, -2], [3.9, 2]];
    for (const [f, r] of spots) {
      if (slots <= 0) break;
      const x = this.pos.x + fx * f + rx * r, z = this.pos.z + fz * f + rz * r;
      const cx = Math.floor(x), cz = Math.floor(z);
      if (game.world.isSolid(cx, 1, cz) || game.world.isSolid(cx, 2, cz)) continue;
      const near = (px: number, pz: number, rr: number): boolean => (px - x) ** 2 + (pz - z) ** 2 < rr * rr;
      if (game.playerTargets().some((p) => !p.dead && near(p.pos.x, p.pos.z, 1.3))) continue;
      if (game.enemies.list.some((e) => e !== this && e.alive && near(e.pos.x, e.pos.z, 1.0))) continue;
      game.enemies.spawnFromSpecs([{ kind: kinds[2 - slots] ?? 'husk', x, z, roomId: this.room?.id ?? 0 }], game.level.rooms, game);
      const e = game.enemies.list[game.enemies.list.length - 1];
      e.wake(game);
      b.summons.push(e);
      game.level.totalEnemies += 1; // kill ratios stay honest
      game.particles.smoke(x, 1.2, z, 6);
      game.dynLights.flash(x, 1.5, z, 0.9, 0.3, 0.25, 1.2, 5, 0.25);
      slots--;
    }
    game.audio.play('clank', this.pos);
  }

  /** the boss's whole frame: activation, the attack cycle, the pose */
  private bossUpdate(dt: number, game: Game): void {
    const b = this.boss!;
    const pl = this.tgt ?? game.player;
    if (!b.active) {
      // wakes when a player walks into the chamber (never on the way past)
      const r = this.room;
      if (r && game.playerTargets().some((t) => !t.dead &&
        t.pos.x >= r.x && t.pos.x < r.x + r.w && t.pos.z >= r.z && t.pos.z < r.z + r.d)) {
        this.activateBoss(game);
      }
    }
    if (b.active && !pl.dead) {
      b.t += dt;
      if (!b.enraged && this.bossFrac < BOSS_ENRAGE) {
        b.enraged = true;
        game.audio.play('bruteRoar', this.pos);
        game.player.shake = Math.min(0.6, game.player.shake + 0.3);
        game.hud.message('The BROODKEEPER is enraged — the acid spreads and tickers join the brood.');
      }
      switch (b.phase) {
        case 'volley':
          while (b.fired < b.shots && b.t >= BOSS_VOLLEY_WARN + b.fired * BOSS_SHOT_GAP) {
            // enraged: the five globs fan out (-2..+2 steps) instead of all aiming dead on
            const enraged = b.shots > 3;
            this.bossShoot(pl, game, enraged ? (b.fired - 2) * BOSS_FAN : 0);
            b.fired++;
          }
          if (b.t >= BOSS_VOLLEY_WARN + b.shots * BOSS_SHOT_GAP) {
            b.phase = 'open1';
            b.t = 0;
            this.coreOpen = true;
            game.audio.play('clank', this.pos);
          }
          break;
        case 'open1':
          if (b.t >= BOSS_OPEN_1) {
            b.phase = 'release';
            b.t = 0;
            b.released = false;
            this.coreOpen = false;
          }
          break;
        case 'release':
          if (!b.released && b.t >= 1.0) {
            b.released = true;
            this.bossRelease(game);
          }
          if (b.t >= BOSS_RELEASE) {
            b.phase = 'open2';
            b.t = 0;
            this.coreOpen = true;
            game.audio.play('clank', this.pos);
          }
          break;
        case 'open2':
          if (b.t >= BOSS_OPEN_2) {
            b.phase = 'volley';
            b.t = 0;
            b.fired = 0;
            b.shots = this.bossFrac < BOSS_ENRAGE ? 5 : 3;
            this.coreOpen = false;
            game.audio.play('sentinelAlert', this.pos); // the reservoirs charge
          }
          break;
      }
    }
    this.animateBoss(dt, pl);
    this.mesh.position.copy(this.pos);
    this.mesh.scale.setScalar(1 + this.flashTime * 0.25);
    this.mesh.rotation.z = 0;
    this.updateLighting(game, dt);
  }

  private animateBoss(dt: number, pl: PlayerTarget): void {
    const b = this.boss!;
    const p = b.parts;
    this.animPhase += dt;
    const t = this.animPhase;
    // breathing, a slow heave of the torso
    p.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.025;
    // the head tracks the target within its neck's reach
    const want = Math.atan2(-(pl.pos.x - this.pos.x), -(pl.pos.z - this.pos.z)) - b.yaw;
    const rel = Math.atan2(Math.sin(want), Math.cos(want));
    b.headYaw += (Math.max(-0.7, Math.min(0.7, rel)) - b.headYaw) * Math.min(1, dt * 5);
    p.head.rotation.y = b.headYaw;
    // the volley warning: the head draws back, the reservoirs brighten
    const warn = b.active && b.phase === 'volley' ? Math.max(0, Math.min(1, b.t / BOSS_VOLLEY_WARN)) : 0;
    const firing = b.active && b.phase === 'volley' && b.t >= BOSS_VOLLEY_WARN;
    p.head.rotation.x = firing ? 0.25 * Math.max(0, 1 - ((b.t - BOSS_VOLLEY_WARN) % BOSS_SHOT_GAP) / BOSS_SHOT_GAP) : -0.35 * warn;
    for (const m of p.insets) {
      (m.material as THREE.MeshBasicMaterial).color.copy(m.userData.baseColor as THREE.Color).multiplyScalar(firing ? 2.2 : 0.8 + 1.6 * warn);
    }
    // chest plates swing open on the outer hinges while the core is exposed
    b.plates += ((this.coreOpen ? 1 : 0) - b.plates) * Math.min(1, dt * 10);
    p.plateL.rotation.y = -b.plates * 1.2;
    p.plateR.rotation.y = b.plates * 1.2;
    const coreGlow = this.coreOpen ? 1.7 + 0.5 * Math.sin(t * 12) : 1.1; // closed: the seam between the plates still glows
    (p.core.material as THREE.MeshBasicMaterial).color.copy(p.core.userData.baseColor as THREE.Color).multiplyScalar(coreGlow);
    (p.eye.material as THREE.MeshBasicMaterial).color.copy(p.eye.userData.baseColor as THREE.Color).multiplyScalar(b.active ? 1.6 : 0.8);
    // hatches rattle for a second, then swing open to release
    let hatch = 0;
    if (b.active && b.phase === 'release') hatch = b.t < 1.0 ? Math.sin(b.t * 40) * 0.08 : Math.min(1.1, (b.t - 1.0) * 6);
    // bottom hinge: negative x tips the top forward, the flap folds down
    p.hatchL.rotation.x = -hatch * 1.3;
    p.hatchR.rotation.x = -hatch * 1.3;
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** dormant in a tank or walking out of one: scripted, outside the AI */
  get scripted(): boolean {
    return this.dormant || this.emerge !== null;
  }

  /**
   * Open to a punish (the quick melee does double damage): staggered or
   * stunned, or recovering after a committed attack — the windows every
   * telegraph promises.
   */
  get vulnerable(): boolean {
    if (!this.alive || this.kind === 'broodkeeper') return false;
    return this.state === 'pain' || ((this.state === 'attack' || this.state === 'charge') && this.phase === 'recover');
  }

  /** planted or committed: separation must not shove it (reference/enemy-upgrades.md) */
  get planted(): boolean {
    return this.state === 'attack' || this.state === 'charge' || this.kind === 'broodkeeper';
  }

  /**
   * Leave the tank: walk from where it floats to the floor at (tx, tz) over
   * 0.8s (through the gap the tank already opened), then start hunting.
   */
  startEmerge(tx: number, tz: number, floorY: number): void {
    this.dormant = false;
    this.agitation = 0;
    this.emerge = { fx: this.pos.x, fy: this.pos.y, fz: this.pos.z, tx, ty: floorY + this.half.y + 0.05, tz, t: 0 };
    this.vel.set(0, 0, 0);
  }

  /** last-resort recovery for a body that escaped the world */
  respawnInRoom(): void {
    if (this.room) {
      this.pos.set(this.room.cx + 0.5, 2.6, this.room.cz + 0.5);
    } else {
      this.pos.y = 2.6;
    }
    this.vel.set(0, 0, 0);
  }

  wake(game: Game): void {
    if (this.awake || !this.alive || this.scripted) return;
    if (this.kind === 'broodkeeper') return; // it wakes on its own terms (activateBoss)
    this.awake = true;
    game.audio.play(ALERT_SOUND[this.kind], this.pos);
    if (this.state === 'idle' || this.state === 'patrol') this.setState('chase');
  }

  private setState(s: EState): void {
    this.state = s;
    this.stateTime = 0;
  }

  // ---------------------------------------------------------------------------
  // Damage
  // ---------------------------------------------------------------------------

  /**
   * Ordinary pain may interrupt a warning (the attack is cancelled with a
   * retry delay) but never a committed move, a strike, a recovery, a ticker
   * that has armed, or a brute's wall stun — those are the windows the design
   * promises the player.
   */
  private painAllowed(): boolean {
    if (this.kind === 'ticker' && this.state === 'attack') return false;
    if (this.state === 'pain') return this.stunTime <= 0.32;
    if (this.state === 'attack' || this.state === 'charge') return this.phase === 'prep';
    return true;
  }

  /**
   * Revive / keycard-respawn shockwave: wake, cancel whatever it was doing,
   * shove it away and daze it briefly so a returning player isn't killed on
   * the spot. An armed ticker is left to blow — the spawn shield eats it.
   */
  repel(x: number, z: number, game: Game): void {
    if (!this.alive || this.scripted || this.puppet) return;
    if (this.kind === 'ticker' && this.state === 'attack') return;
    const dx = this.pos.x - x;
    const dz = this.pos.z - z;
    const d = Math.hypot(dx, dz) || 1;
    this.wake(game);
    if (this.state === 'attack' || this.state === 'charge') this.cancelAttack();
    this.stunTime = 0.7;
    this.setState('pain');
    const push = (this.kind === 'brute' ? 2 : 6) * (1 - Math.min(1, d / 7)) + 2;
    this.vel.x += (dx / d) * push;
    this.vel.z += (dz / d) * push;
  }

  /** a warning was interrupted: drop the attack and wait before trying again */
  private cancelAttack(): void {
    if (this.state === 'charge') {
      if (this.kind === 'brute') this.chargeCooldown = Math.max(this.chargeCooldown, 1.0);
      else this.lungeCooldown = Math.max(this.lungeCooldown, 1.0);
    } else if (this.state === 'attack') {
      this.attackCooldown = Math.max(this.attackCooldown, 0.5);
    }
    this.faceLocked = false;
    this.atkTgt = null;
  }

  damage(dmg: number, dx: number, dz: number, game: Game): void {
    if (!this.alive) return;
    let armored = false;
    if (this.kind === 'broodkeeper') {
      // closed plates: 25%; open: the body 60%, the core zone double — the
      // opening rewards aim, not just pointing at it
      if (!this.boss?.active) this.activateBoss(game);
      armored = !this.coreOpen;
      dmg *= this.coreOpen ? (this.lastHitCore ? 2 : 0.6) : 0.25;
      // quad damage counts double here, not 4x: a powerup speeds the fight
      // up without skipping it (every weapon and melee multiplies by 4)
      if (game.player.buffs.quad > 0) dmg *= 0.5;
      this.lastHitCore = false;
    }
    this.hp -= dmg;
    // hit feedback fires the same frame: white-hot flash, a sideways jolt,
    // a meaty thwack, and blood — waiting for the next lighting tick made
    // hits read as nothing happening
    this.flashTime = 0.15;
    this.flinchSign = Math.random() < 0.5 ? -1 : 1;
    this.applyFlash();
    game.audio.play(armored ? 'impact' : 'fleshHit', this.pos);
    game.particles.blood(
      this.pos.x, this.pos.y + 0.2, this.pos.z, dx, 0, dz,
      this.tuning.bloodColor[0], this.tuning.bloodColor[1], this.tuning.bloodColor[2],
      Math.min(16, 5 + Math.floor(dmg / 3))
    );
    this.wake(game);
    game.enemies.alertAt(this.pos.x, this.pos.z, 9, game);
    if (this.hp <= 0) {
      this.die(game);
      return;
    }
    if (this.kind === 'broodkeeper') {
      // anchored in its cradle: no knockback, no flinch
      this.lastHitHead = false;
      return;
    }
    // micro-stagger + knockback: the hit interrupts momentum, then shoves
    // (brutes are too heavy to shove far; a committed move keeps its momentum)
    const mass = this.kind === 'brute' ? 0.25 : 1;
    const committed = this.state === 'charge' && this.phase === 'move';
    if (!committed) {
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
    }
    const kb = Math.min(8, dmg * 0.2) * mass;
    this.vel.x += dx * kb;
    this.vel.z += dz * kb;
    if (Math.random() < this.tuning.painChance && this.painAllowed()) {
      this.cancelAttack();
      this.setState('pain');
      game.audio.play(humanoid(this.kind) ? 'enemyPainA' : 'enemyPainB', this.pos);
    }
    // the headshot flag only describes THIS hit — don't let it linger so a
    // later barrel kill counts as a headshot
    this.lastHitHead = false;
  }

  private die(game: Game): void {
    this.setState('dead');
    this.atkTgt = null;
    this.faceLocked = false;
    game.audio.play(humanoid(this.kind) ? 'enemyDieA' : 'enemyDieB', this.pos);
    // tickers are walking bombs: death always detonates them (short fuse so a
    // sniped ticker still chains into barrels and packmates). Exactly one
    // explosion per ticker — arming ends by calling this same path.
    // Co-op clients skip the gameplay side effects — the host owns those.
    if (this.kind === 'ticker' && !game.isNetClient) {
      game.queueExplosion(this.pos.x, this.pos.y, this.pos.z, 0.08, 55, 2.8);
    }
    // the Broodkeeper: a burst of light and slime, its acid gone, the key dropped
    if (this.kind === 'broodkeeper') {
      this.coreOpen = false;
      game.audio.play('explosion', this.pos);
      game.dynLights.flash(this.pos.x, this.pos.y + 0.6, this.pos.z, 1, 0.55, 0.15, 2.6, 12, 0.6);
      game.particles.debris(this.pos.x, this.pos.y + 0.6, this.pos.z, 0.55, 0.15, 0.2, 30);
      game.player.shake = Math.min(0.7, game.player.shake + 0.4);
      if (!game.isNetClient) game.onBossDefeated(this);
    }
    // the pit boss always drops a powerup — killing it is the arena's reward
    if (this.kind === 'brute' && !game.isNetClient) {
      game.audio.play('bruteSlam', this.pos);
      const drops = ['powerQuad', 'powerShield', 'powerHaste'] as const;
      game.spawnPickup(drops[Math.floor(Math.random() * drops.length)], this.pos.x, this.pos.y + 0.3, this.pos.z);
    }
    // the body bursts apart into its own voxels: every part becomes a handful
    // of gibs in that part's color
    const worldPos = new THREE.Vector3();
    this.attachBody(true); // a culled rig is detached: gibs need its real pose
    this.mesh.updateWorldMatrix(true, true);
    this.body.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.getWorldPosition(worldPos);
      const c = o.userData.baseColor as THREE.Color;
      game.particles.gib(worldPos.x, worldPos.y, worldPos.z, c.r, c.g, c.b, o.userData.fullBright ? 2 : 3);
    });
    game.particles.blood(
      this.pos.x, this.pos.y + 0.2, this.pos.z, 0, 0, 0,
      this.tuning.bloodColor[0], this.tuning.bloodColor[1], this.tuning.bloodColor[2], 12
    );
    if (this.kind === 'sentinel') {
      // the drone pops with an electric flash
      game.dynLights.flash(this.pos.x, this.pos.y, this.pos.z, 0.3, 0.85, 1, 1.4, 8, 0.28);
      game.audio.play('boltHit', this.pos);
    }
    this.mesh.visible = false;
    this.mesh.rotation.z = 0; // corpses don't hold the hit jolt
    this.mesh.scale.setScalar(1);
    game.onEnemyKilled(this);
  }

  // ---------------------------------------------------------------------------
  // Frame
  // ---------------------------------------------------------------------------

  update(dt: number, game: Game): void {
    if (this.puppet) {
      this.puppetUpdate(dt, game);
      return;
    }
    this.stateTime += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.lungeCooldown = Math.max(0, this.lungeCooldown - dt);
    this.chargeCooldown = Math.max(0, this.chargeCooldown - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);
    // hunt whichever player is closest (co-op adds the partner as a target);
    // a declared attack keeps its own target in atkTgt
    const pl = this.pickTarget(game);
    this.tgt = pl;

    // dead: the voxel rig already burst into gibs in die()
    if (this.state === 'dead') return;
    if (this.dormant) {
      this.dormantUpdate(dt, game);
      return;
    }
    if (this.emerge) {
      this.emergeUpdate(dt, game);
      return;
    }
    if (this.boss) {
      this.bossUpdate(dt, game);
      return;
    }

    const toPlayer = _toPlayer.subVectors(pl.pos, this.pos);
    const distSq = toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z;
    const dist = Math.sqrt(distSq);

    // perception
    if (!this.awake && !pl.dead) {
      if (dist < 12 && game.hasLOS(this.pos.x, this.pos.y + 0.3, this.pos.z, pl.pos.x, pl.eyeY(), pl.pos.z)) {
        this.wake(game);
      }
    }

    switch (this.state) {
      case 'idle':
        this.vel.x *= 0.8;
        this.vel.z *= 0.8;
        break;
      case 'patrol':
        this.doPatrol(dt);
        break;
      case 'chase':
        this.doChase(dt, dist, toPlayer, game);
        break;
      case 'attack':
      case 'charge':
        this.doAttack(dt, game);
        break;
      case 'pain':
        this.vel.x *= 0.85;
        this.vel.z *= 0.85;
        if (this.stateTime > this.stunTime) {
          this.stunTime = 0.32;
          this.setState('chase');
        }
        break;
    }

    // physics
    if (this.kind !== 'sentinel') {
      this.vel.y -= 24 * dt;
    } else {
      // hover spring toward target height above the floor
      this.hoverPhase += dt;
      const floorY = this.findFloor(game);
      const targetY = floorY + 1.55 + Math.sin(this.hoverPhase * 2) * 0.15;
      this.vel.y += (targetY - this.pos.y) * 6 * dt - this.vel.y * 3 * dt;
    }
    // a committed move is swept in substeps: at a long frame a charge must
    // not tunnel through a wall, a closed door or a player
    const moving = this.state === 'charge' && this.phase === 'move';
    const sub = moving ? Math.max(1, Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.25)) : 1;
    let onGround = false;
    let hitWall = false;
    for (let i = 0; i < sub; i++) {
      const res = moveBody(game.world, this.pos, this.half, this.vel, dt / sub, game.solidBoxes());
      onGround = res.onGround;
      hitWall = res.hitX || res.hitZ;
      if (moving && this.sweepCommitted(hitWall, game)) break;
    }
    this.onGround = onGround;
    // ground friction for walkers
    const huskSteering = this.kind === 'husk' && (this.state === 'chase' || this.state === 'patrol' ||
      ((this.state === 'attack' || this.state === 'charge') && this.phase === 'recover'));
    if (this.kind !== 'sentinel' && onGround && !huskSteering) {
      const f = Math.exp(-6 * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }
    // wall jink: when blocked while chasing, sidestep for a moment
    if (hitWall && (this.state === 'chase' || this.state === 'patrol')) {
      if (this.jinkTime <= 0) {
        this.jinkTime = 0.45;
        this.jinkSign = Math.random() < 0.5 ? 1 : -1;
      }
    }
    this.jinkTime = Math.max(0, this.jinkTime - dt);
    // sentinel: a lateral choice blocked for 0.5s flips instead of vibrating
    if (this.kind === 'sentinel') {
      this.blockedT = hitWall && this.state === 'chase' ? this.blockedT + dt : 0;
      if (this.blockedT > 0.5) {
        this.strafeSign = -this.strafeSign;
        this.blockedT = 0;
      }
    }

    // face movement / player
    // models are built facing local -z, so front_world = (-sin yaw, -cos yaw):
    // to face a direction (dx, dz), yaw = atan2(-dx, -dz)
    const attacking = this.state === 'attack' || this.state === 'charge';
    if (attacking && this.faceLocked) {
      // locked: the strike direction is committed, a dodge isn't followed
      const targetYaw = Math.atan2(-this.lockX, -this.lockZ);
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, targetYaw, Math.min(1, dt * 14));
    } else if (this.kind === 'husk' && !attacking && Math.hypot(this.vel.x, this.vel.z) > 0.4) {
      // Follow the actual travel direction instead of skating sideways while
      // the whole body stares at the player throughout a weave.
      const targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, targetYaw, 1 - Math.exp(-10 * dt));
    } else if (this.awake && dist > 0.3) {
      const face = attacking && this.atkTgt ? this.atkTgt : pl;
      const targetYaw = Math.atan2(-(face.pos.x - this.pos.x), -(face.pos.z - this.pos.z));
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, targetYaw, Math.min(1, dt * 10));
    } else if (Math.hypot(this.vel.x, this.vel.z) > 0.5) {
      const targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, targetYaw, Math.min(1, dt * 6));
    }

    this.animate(dt, game);
    this.mesh.position.copy(this.pos);
    // hit reaction: quick scale pop + sideways jolt while the flash runs
    this.mesh.scale.setScalar(1 + this.flashTime * 1.6);
    this.mesh.rotation.z = this.flashTime * this.flinchSign * 1.4;
    this.updateLighting(game, dt);
  }

  /** floating in the tank: a slow drift, thrashing and pounding the glass when agitated */
  private dormantUpdate(dt: number, game: Game): void {
    this.animPhase += dt;
    const a = this.agitation;
    const t = this.animPhase;
    const k = t * 20;
    this.body.position.y = Math.sin(t * 1.3) * 0.06 + Math.sin(k) * 0.05 * a;
    this.body.rotation.z = Math.sin(k * 0.8) * 0.14 * a;
    this.torsoG!.rotation.x = 0.45 - a * 0.35 + Math.sin(k * 1.3) * 0.12 * a;
    this.torsoG!.rotation.z = 0;
    this.headG!.rotation.x = 0.35 * (1 - a);
    this.headG!.rotation.y = Math.sin(t * 0.5) * 0.2 * (1 - a);
    this.armRG!.rotation.x = -0.2 + Math.sin(t * 0.9) * 0.08 - a * (1.1 + Math.sin(k) * 0.7);
    this.armLG!.rotation.x = -0.1 + Math.sin(t * 1.1 + 1) * 0.1 - a * Math.abs(Math.sin(k * 1.4)) * 0.8;
    this.armRG!.rotation.z = 0.12;
    this.armLG!.rotation.z = -0.2;
    this.legLG!.rotation.x = Math.sin(t * 0.8) * 0.12;
    this.legRG!.rotation.x = -Math.sin(t * 0.8) * 0.12;
    this.jaw!.rotation.x = 0.1 + a * 0.3;
    this.mesh.position.copy(this.pos);
    this.updateLighting(game, dt);
  }

  /** the 0.8s walk out of the breached tank: no collision, no attacks */
  private emergeUpdate(dt: number, game: Game): void {
    const e = this.emerge!;
    const DUR = 0.8;
    e.t += dt;
    const k = Math.min(1, e.t / DUR);
    const ease = k * k * (3 - 2 * k);
    this.pos.set(
      e.fx + (e.tx - e.fx) * ease,
      e.fy + (e.ty - e.fy) * ease + Math.sin(k * Math.PI) * 0.2, // over the tank lip
      e.fz + (e.tz - e.fz) * ease,
    );
    // the walk speed drives the gait animation
    this.vel.set((e.tx - e.fx) / DUR, 0, (e.tz - e.fz) / DUR);
    this.animateWalker(dt, Math.hypot(this.vel.x, this.vel.z), game);
    this.vel.set(0, 0, 0);
    this.mesh.position.copy(this.pos);
    this.mesh.scale.setScalar(1 + this.flashTime * 1.6);
    this.mesh.rotation.z = this.flashTime * this.flinchSign * 1.4;
    this.updateLighting(game, dt);
    if (k >= 1) {
      this.emerge = null;
      this.wake(game);
    }
  }

  /** nearest non-dead player-like target (falls back to the local player) */
  private pickTarget(game: Game): PlayerTarget {
    const ts = game.playerTargets();
    let best: PlayerTarget = ts[0];
    let bestD = Infinity;
    for (const t of ts) {
      if (t.dead) continue;
      const d = (t.pos.x - this.pos.x) ** 2 + (t.pos.z - this.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------------------
  // Co-op puppets
  // ---------------------------------------------------------------------------

  /** co-op client: interpolate toward the host's snapshot; no AI, no physics */
  private puppetUpdate(dt: number, game: Game): void {
    this.stateTime += dt;
    this.flashTime = Math.max(0, this.flashTime - dt);
    if (this.state === 'dead') return;
    if (!this.netInit) return;
    const k = 1 - Math.exp(-10 * dt);
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    this.pos.x += (this.ntx - this.pos.x) * k;
    this.pos.y += (this.nty - this.pos.y) * k;
    this.pos.z += (this.ntz - this.pos.z) * k;
    // derived velocity drives the walk animation + footstep sounds
    this.vel.x = (this.pos.x - prevX) / Math.max(dt, 0.001);
    this.vel.z = (this.pos.z - prevZ) / Math.max(dt, 0.001);
    this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, this.nyaw, Math.min(1, dt * 10));
    // the pose follows the same schedule the host runs (early exits — a
    // charge that hit a wall — arrive as a state change instead)
    if (this.state === 'attack' || this.state === 'charge') {
      const S = SCHED[this.kind][this.state];
      const t = this.stateTime;
      if (t < S.prep) {
        this.phase = 'prep';
        this.phaseT = t;
      } else if (t < S.prep + S.commit) {
        this.phase = this.state === 'charge' ? 'move' : 'strike';
        this.phaseT = t - S.prep;
      } else {
        this.phase = 'recover';
        this.phaseT = t - S.prep - S.commit;
      }
      this.faceLocked = t >= S.lock;
    }
    // arming beeps are a survival cue — replicate them for the client
    if (this.kind === 'ticker' && this.state === 'attack') this.playBeeps(this.stateTime, game);
    this.animate(dt, game);
    this.mesh.position.copy(this.pos);
    this.mesh.scale.setScalar(1 + this.flashTime * 1.6);
    this.mesh.rotation.z = this.flashTime * this.flinchSign * 1.4;
    this.updateLighting(game, dt);
  }

  /** co-op client: apply the host's latest snapshot row */
  netSet(x: number, y: number, z: number, yaw: number, state: EState, hp: number, game: Game): void {
    this.ntx = x;
    this.nty = y;
    this.ntz = z;
    this.nyaw = yaw;
    if (!this.netInit) {
      this.netInit = true;
      this.pos.set(x, y, z);
      this.mesh.position.copy(this.pos);
    }
    this.hp = hp;
    if (state !== this.state && this.state !== 'dead') {
      if (state === 'dead') {
        this.pos.set(x, y, z);
        this.mesh.position.copy(this.pos);
        this.die(game); // visuals + sound; scoring/explosions are host-side
      } else {
        this.state = state;
        this.stateTime = 0;
        this.phase = 'prep';
        this.phaseT = 0;
        this.faceLocked = false;
        if (state === 'attack' || state === 'charge') {
          this.beepCount = 0;
          this.playAttackCue(game);
        }
      }
    }
    this.awake = state !== 'idle' && state !== 'patrol' && state !== 'dead';
  }

  /** co-op client: local juice for a hit whose damage the host will apply */
  hitFeedback(dmg: number, dx: number, dz: number, game: Game): void {
    if (!this.alive) return;
    this.flashTime = 0.15;
    this.flinchSign = Math.random() < 0.5 ? -1 : 1;
    this.applyFlash();
    game.audio.play('fleshHit', this.pos);
    game.particles.blood(
      this.pos.x, this.pos.y + 0.2, this.pos.z, dx, 0, dz,
      this.tuning.bloodColor[0], this.tuning.bloodColor[1], this.tuning.bloodColor[2],
      Math.min(16, 5 + Math.floor(dmg / 3))
    );
  }

  /** immediate white-hot flash on every landed hit (restored by the light tick) */
  private applyFlash(): void {
    for (const o of this.litParts) (o.material as THREE.MeshBasicMaterial).color.setRGB(2.2, 1.9, 1.7);
  }

  private findFloor(game: Game): number {
    const x = Math.floor(this.pos.x);
    const z = Math.floor(this.pos.z);
    for (let y = Math.floor(this.pos.y); y >= 0; y--) {
      if (game.world.isSolid(x, y, z)) return y + 1;
    }
    return 1;
  }

  // ---------------------------------------------------------------------------
  // Movement
  // ---------------------------------------------------------------------------

  private doPatrol(dt: number): void {
    const r = this.room;
    if (!r) {
      this.setState('idle');
      return;
    }
    if (!this.patrolTarget || this.stateTime > 6) {
      this.patrolTarget = [r.x + 1.5 + Math.random() * (r.w - 3), r.z + 1.5 + Math.random() * (r.d - 3)];
      this.stateTime = 0;
    }
    const [tx, tz] = this.patrolTarget;
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) {
      this.patrolTarget = null;
      return;
    }
    const sp = this.kind === 'husk' ? HUSK_RUN_SPEED * 0.4 : this.tuning.speed * 0.4;
    this.steer(dx / d, dz / d, sp, dt);
  }

  private steer(nx: number, nz: number, speed: number, dt = 1 / 60): void {
    if (this.jinkTime > 0) {
      // rotate desired direction ~70 degrees to slip around walls
      const s = this.jinkSign;
      const rx = nx * 0.34 - nz * 0.94 * s;
      const rz = nx * 0.94 * s + nz * 0.34;
      nx = rx;
      nz = rz;
    }
    const k = this.kind === 'husk' ? 1 - Math.exp(-10 * dt) : 0.15;
    this.vel.x += (nx * speed - this.vel.x) * k;
    this.vel.z += (nz * speed - this.vel.z) * k;
  }

  /** line of sight from the chest to a target's body (melee reach / eligibility) */
  private losTo(t: PlayerTarget, game: Game): boolean {
    return game.hasLOS(this.pos.x, this.pos.y + 0.2, this.pos.z, t.pos.x, t.pos.y, t.pos.z);
  }

  /** same floor, roughly: the bodies overlap vertically */
  private overlapsY(t: PlayerTarget): boolean {
    return Math.abs(t.pos.y - this.pos.y) < this.half.y + t.half.y;
  }

  /** sentinel positioning: hold 7–12 with line of sight, strafing; approach otherwise */
  private sentinelPosition(dist: number, nx: number, nz: number, los: boolean): void {
    const s = this.strafeSign;
    if (los && dist < SENTINEL_NEAR) {
      // keep distance + strafe
      this.steer(-nx * 0.5 + -nz * s * 0.8, -nz * 0.5 + nx * s * 0.8, this.tuning.speed);
    } else if (los && dist <= SENTINEL_FAR) {
      this.steer(-nz * s, nx * s, this.tuning.speed * 0.6);
    } else {
      this.steer(nx, nz, this.tuning.speed);
    }
  }

  private doChase(dt: number, dist: number, toPlayer: THREE.Vector3, game: Game): void {
    const pl = this.tgt ?? game.player;
    if (pl.dead) {
      this.setState('idle');
      this.awake = false;
      return;
    }
    const nx = toPlayer.x / Math.max(0.001, dist);
    const nz = toPlayer.z / Math.max(0.001, dist);

    if (this.kind === 'husk') {
      // hungry noises while it hunts
      this.growlCd -= dt;
      if (this.growlCd <= 0) {
        this.growlCd = 3.5 + Math.random() * 4;
        game.audio.play('huskGrowl', this.pos);
      }
      // claw inside 1.75 with sight; a warned lunge from 2.5–4.0 when grounded
      if (dist < 1.75 && this.attackCooldown === 0 && this.losTo(pl, game)) {
        this.beginAttack('attack', pl, game);
        return;
      }
      if (dist >= 2.5 && dist <= 4.0 && this.lungeCooldown === 0 && this.onGround && this.losTo(pl, game)) {
        this.beginAttack('charge', pl, game);
        return;
      }
      // standoff: it fights from a step away, not from inside the camera
      if (dist < 1.55) {
        this.steer(0, 0, 0, dt);
        return;
      }
      // A restrained weave fades near the target. Ease into the standoff
      // instead of reaching it at full speed and abruptly freezing.
      const speed = HUSK_RUN_SPEED * Math.min(1, Math.max(0, (dist - 1.55) / 1.2));
      if (dist > 3) {
        const weave = Math.sin(this.animPhase * 1.3) * 0.14 * Math.min(1, dist - 3);
        let wx = nx - nz * weave;
        let wz = nz + nx * weave;
        const wl = Math.hypot(wx, wz);
        wx /= wl;
        wz /= wl;
        this.steer(wx, wz, speed, dt);
      } else {
        this.steer(nx, nz, speed, dt);
      }
    } else if (this.kind === 'brute') {
      this.growlCd -= dt;
      if (this.growlCd <= 0) {
        this.growlCd = 4 + Math.random() * 3;
        game.audio.play('huskGrowl', this.pos);
      }
      if (dist < 2.4 && this.attackCooldown === 0 && this.losTo(pl, game)) {
        this.beginAttack('attack', pl, game);
        return;
      }
      // telegraphed charge when it has a clear mid-range line to the player
      if (dist >= 4 && dist <= 12 && this.chargeCooldown === 0 && this.onGround && this.losTo(pl, game)) {
        this.beginAttack('charge', pl, game);
        return;
      }
      this.steer(nx, nz, this.tuning.speed);
    } else if (this.kind === 'vatborn') {
      this.growlCd -= dt;
      if (this.growlCd <= 0) {
        this.growlCd = 3 + Math.random() * 3;
        game.audio.play('huskGrowl', this.pos);
      }
      if (dist < 1.7 && this.attackCooldown === 0 && this.losTo(pl, game)) {
        this.beginAttack('attack', pl, game);
        return;
      }
      // braced short rush: movement only, then it walks off the recovery
      // before the separately warned club can start
      if (dist >= 2.5 && dist <= 5.0 && this.lungeCooldown === 0 && this.onGround && this.losTo(pl, game)) {
        this.beginAttack('charge', pl, game);
        return;
      }
      this.steer(nx, nz, this.tuning.speed);
    } else if (this.kind === 'ticker') {
      // flat-out sprint with a nervous jitter; arm on contact — but never
      // through a wall or from a different floor
      if (dist < 1.8 && this.overlapsY(pl) && this.losTo(pl, game)) {
        this.beginAttack('attack', pl, game);
        return;
      }
      const jitter = Math.sin(this.animPhase * 6) * 0.25;
      let wx = nx - nz * jitter;
      let wz = nz + nx * jitter;
      const wl = Math.hypot(wx, wz);
      this.steer(wx / wl, wz / wl, this.tuning.speed);
      // agitated chittering while it closes in
      this.growlCd -= dt;
      if (this.growlCd <= 0) {
        this.growlCd = 1.6 + Math.random() * 2;
        game.audio.play('tickerAlert', this.pos);
      }
    } else {
      const los = game.hasLOS(this.pos.x, this.pos.y, this.pos.z, pl.pos.x, pl.eyeY(), pl.pos.z);
      if (los && dist < 14 && this.attackCooldown === 0) {
        this.beginAttack('attack', pl, game);
        return;
      }
      if (Math.random() < dt * 0.25) this.strafeSign = -this.strafeSign;
      this.sentinelPosition(dist, nx, nz, los);
    }
  }

  // ---------------------------------------------------------------------------
  // Attacks: prepare → commit → recover (reference/enemy-upgrades.md)
  // ---------------------------------------------------------------------------

  /** declare an attack against one target; its direction is set now and locked at SCHED.lock */
  private beginAttack(state: 'attack' | 'charge', target: PlayerTarget, game: Game): void {
    this.setState(state);
    this.phase = 'prep';
    this.phaseT = 0;
    this.atkTgt = target;
    this.hitConsumed = false;
    this.faceLocked = false;
    this.beepCount = 0;
    if (this.kind === 'husk') {
      this.vel.x = 0;
      this.vel.z = 0;
    }
    this.aimAt(target);
    if (SCHED[this.kind][state].lock <= 0) this.faceLocked = true;
    this.playAttackCue(game);
  }

  /** the warning's sound: paired with the pose so it reads without colour alone */
  private playAttackCue(game: Game): void {
    const charge = this.state === 'charge';
    switch (this.kind) {
      case 'husk':
        game.audio.play(charge ? 'huskGrowl' : 'huskAlert', this.pos);
        break;
      case 'brute':
        game.audio.play(charge ? 'bruteRoar' : 'huskGrowl', this.pos);
        break;
      case 'vatborn':
        game.audio.play('clank', this.pos); // restraint clank / cuff scrape
        break;
      case 'sentinel':
        game.audio.play('sentinelAlert', this.pos); // rising charge cue
        break;
      case 'ticker':
        break; // the beep schedule is the cue
    }
  }

  /** point the strike direction at the target (tracking before the lock) */
  private aimAt(t: PlayerTarget): void {
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.lockX = dx / d;
    this.lockZ = dz / d;
    if (this.kind === 'sentinel') {
      const dy = t.eyeY() - this.pos.y;
      const l = Math.hypot(dx, dy, dz) || 1;
      this.aimX = dx / l;
      this.aimY = dy / l;
      this.aimZ = dz / l;
    }
  }

  private enterPhase(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
  }

  /**
   * One melee check at the strike frame: reach, same floor, inside the
   * facing cone of the LOCKED direction (a dodge after the lock is a miss),
   * line of sight from the chest at impact. Damage once per attack.
   */
  private meleeStrike(range: number, coneDeg: number, dmg: number, kbH: number, kbV: number, game: Game): boolean {
    const t = this.atkTgt;
    if (!t || t.dead || this.hitConsumed) return false;
    const dx = t.pos.x - this.pos.x;
    const dz = t.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > range || !this.overlapsY(t)) return false;
    const dot = (dx * this.lockX + dz * this.lockZ) / Math.max(0.001, d);
    if (dot < Math.cos((coneDeg * Math.PI) / 180)) return false;
    if (!this.losTo(t, game)) return false;
    this.hitConsumed = true;
    t.damage(dmg, game, { x: this.pos.x, z: this.pos.z });
    if (kbH > 0 || kbV > 0) {
      const n = Math.max(0.3, d);
      t.vel.x += (dx / n) * kbH;
      t.vel.y += kbV;
      t.vel.z += (dz / n) * kbH;
    }
    return true;
  }

  private playBeeps(t: number, game: Game): void {
    while (this.beepCount < TICKER_BEEPS.length && t >= TICKER_BEEPS[this.beepCount]) {
      this.beepCount++;
      game.audio.play('tickerBeep', this.pos);
    }
  }

  private doAttack(dt: number, game: Game): void {
    const S = SCHED[this.kind][this.state === 'charge' ? 'charge' : 'attack'];
    this.phaseT += dt;
    const t = this.atkTgt;
    const moving = this.phase === 'move';
    if (!moving) {
      // planted (sentinels keep their hover spring; vatborn walks its rush off)
      const walkOff = this.kind === 'vatborn' && this.state === 'charge' && this.phase === 'recover';
      // a husk's recovery is a bent-over shuffle, not a freeze (it still can't attack)
      const shuffle = this.kind === 'husk' && this.phase === 'recover';
      if (walkOff && t && !t.dead) {
        const dx = t.pos.x - this.pos.x;
        const dz = t.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.steer(dx / d, dz / d, this.tuning.speed);
      } else if (shuffle && t && !t.dead) {
        const dx = t.pos.x - this.pos.x;
        const dz = t.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        const speed = HUSK_RUN_SPEED * 0.3 * Math.min(1, Math.max(0, d - 1.6));
        this.steer(dx / d, dz / d, speed, dt);
      } else if (this.kind === 'sentinel' && this.phase === 'recover' && t) {
        const dx = t.pos.x - this.pos.x;
        const dz = t.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.sentinelPosition(d, dx / d, dz / d, true);
      } else {
        this.vel.x *= 0.8;
        this.vel.z *= 0.8;
      }
    }

    switch (this.phase) {
      case 'prep': {
        // track until the lock, then the direction is committed
        if (!this.faceLocked) {
          if (t && !t.dead) this.aimAt(t);
          if (this.phaseT >= S.lock) this.faceLocked = true;
        }
        if (this.kind === 'ticker') this.playBeeps(this.phaseT, game);
        if (this.phaseT >= S.prep) this.commit(game);
        break;
      }
      case 'strike':
        if (this.phaseT >= S.commit) this.enterPhase('recover');
        break;
      case 'move': {
        // committed movement: a fixed direction, gravity and collision kept
        const speed = this.kind === 'brute' ? BRUTE_CHARGE_SPEED : this.kind === 'husk' ? HUSK_LUNGE_SPEED : VAT_RUSH_SPEED;
        this.vel.x = this.lockX * speed;
        this.vel.z = this.lockZ * speed;
        if (this.kind === 'brute') {
          // dust kicked up behind it; smashes destructibles in its path
          // (barrels explode ON it — its problem)
          if (Math.random() < dt * 18) {
            game.particles.smoke(this.pos.x - this.lockX * 0.6, this.pos.y - 0.7, this.pos.z - this.lockZ * 0.6, 1);
          }
          const fx = Math.floor(this.pos.x + this.lockX * 0.9);
          const fz = Math.floor(this.pos.z + this.lockZ * 0.9);
          const footY = Math.floor(this.pos.y - this.half.y + 0.2);
          for (let dy = 0; dy <= 1; dy++) {
            if (!isDestructible(game.world.get(fx, footY + dy, fz))) continue;
            const broke = game.world.damageVoxel(fx, footY + dy, fz, 200);
            if (broke !== null) game.onVoxelBroken(fx, footY + dy, fz, broke);
          }
        }
        if (this.phaseT >= this.moveMax) this.endMove(false, game);
        break;
      }
      case 'recover':
        if (this.phaseT >= S.recover) this.finishAttack();
        break;
    }
  }

  /** the strike frame (planted attacks) or the launch (committed moves) */
  private commit(game: Game): void {
    if (this.state === 'charge') {
      this.enterPhase('move');
      this.vel.y = 0;
      // a lunge/rush travels only as far as a step short of the target; the
      // brute's charge runs its full course (the trample is the point)
      const S = SCHED[this.kind].charge;
      this.moveMax = S.commit;
      if (this.kind !== 'brute' && this.atkTgt) {
        const speed = this.kind === 'husk' ? HUSK_LUNGE_SPEED : VAT_RUSH_SPEED;
        const d = Math.hypot(this.atkTgt.pos.x - this.pos.x, this.atkTgt.pos.z - this.pos.z);
        this.moveMax = Math.max(0.06, Math.min(S.commit, (d - 1.6) / speed));
      }
      if (this.kind === 'brute') game.audio.play('bruteStep', this.pos);
      return;
    }
    switch (this.kind) {
      case 'husk':
        if (this.meleeStrike(2.1, 45, 12, 0, 0, game)) game.audio.play('huskBite', this.pos);
        this.enterPhase('strike');
        break;
      case 'brute':
        if (this.meleeStrike(2.9, 50, 22, 7, 3, game)) game.audio.play('bruteSlam', this.pos);
        this.enterPhase('strike');
        break;
      case 'vatborn':
        this.attackCooldown = 1.9; // swing cooldown counts from the impact
        if (this.meleeStrike(2.0, 45, 16, 5, 0, game)) game.audio.play('bruteSlam', this.pos);
        this.enterPhase('strike');
        break;
      case 'ticker':
        // exactly one explosion: the ordinary death path queues it (0.08 fuse)
        this.hp = 0;
        this.die(game);
        break;
      case 'sentinel': {
        // one bolt along the direction committed at the lock, no spread. The
        // muzzle must be clear: a door or pillar in the way catches the shot
        // rather than the spawn point being pushed through it.
        const mx = this.pos.x + this.aimX * 0.5;
        const my = this.pos.y + this.aimY * 0.5;
        const mz = this.pos.z + this.aimZ * 0.5;
        if (game.hasLOS(this.pos.x, this.pos.y, this.pos.z, mx, my, mz)) {
          game.projectiles.spawn('bolt', mx, my, mz, this.aimX, this.aimY, this.aimZ, 13, false);
          game.audio.play('boltFire', this.pos);
        }
        this.enterPhase('recover');
        break;
      }
    }
  }

  /**
   * Swept check after each movement substep of a committed move. Obstruction
   * is resolved before any player behind it can be hit. Returns true when
   * the move ended.
   */
  private sweepCommitted(hitWall: boolean, game: Game): boolean {
    if (hitWall) {
      if (this.kind === 'brute') {
        // wall slam: stunned (free hits), heavy cooldown
        game.audio.play('bruteSlam', this.pos);
        game.particles.debris(this.pos.x + this.lockX, this.pos.y + 0.3, this.pos.z + this.lockZ, 0.45, 0.42, 0.4, 12);
        game.player.shake = Math.min(0.6, game.player.shake + 0.25);
        game.enemies.alertAt(this.pos.x, this.pos.z, 14, game);
        this.chargeCooldown = 4.5;
        this.stunTime = 1.3;
        this.vel.x = -this.lockX * 3;
        this.vel.z = -this.lockZ * 3;
        this.atkTgt = null;
        this.faceLocked = false;
        this.setState('pain');
        return true;
      }
      // a lunge/rush stopped by a wall or door: no strike, straight to recovery
      this.endMove(true, game);
      return true;
    }
    if (this.kind !== 'brute') {
      // a lunge/rush that has reached its target pulls up instead of
      // shoving through it (the husk's claw comes at the end of the move)
      const t = this.atkTgt;
      if (t && Math.hypot(t.pos.x - this.pos.x, t.pos.z - this.pos.z) < 1.5) {
        this.endMove(false, game);
        return true;
      }
      return false;
    }
    if (!this.hitConsumed) {
      // trample: the first living player overlapping the charge, once
      for (const p of game.playerTargets()) {
        if (p.dead) continue;
        const pdx = p.pos.x - this.pos.x;
        const pdz = p.pos.z - this.pos.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd >= this.half.x + 1.0 || !this.overlapsY(p)) continue;
        this.hitConsumed = true;
        p.damage(28, game, { x: this.pos.x, z: this.pos.z });
        const d = pd || 1;
        p.vel.x += (pdx / d) * 13;
        p.vel.y += 5.5;
        p.vel.z += (pdz / d) * 13;
        p.shake = Math.min(0.7, p.shake + 0.35);
        game.audio.play('bruteSlam', this.pos);
        game.punchFOV(2);
        this.chargeCooldown = 4.0;
        this.vel.x *= 0.2;
        this.vel.z *= 0.2;
        this.enterPhase('recover');
        return true;
      }
    }
    return false;
  }

  /** a committed move ran its course (or was stopped): strike if it still can, then recover */
  private endMove(obstructed: boolean, game: Game): void {
    switch (this.kind) {
      case 'husk':
        // the lunge itself has no contact damage — one claw at its end
        if (!obstructed && this.meleeStrike(1.6, 45, 12, 0, 0, game)) game.audio.play('huskBite', this.pos);
        break;
      case 'brute':
        if (!this.hitConsumed) this.chargeCooldown = 3.5; // ran out of steam
        break;
      case 'vatborn':
        break; // movement only
      default:
        break;
    }
    this.vel.x *= 0.3;
    this.vel.z *= 0.3;
    this.enterPhase('recover');
  }

  /** the recovery ended: back to the hunt, with the cooldowns the design names */
  private finishAttack(): void {
    if (this.state === 'charge') {
      if (this.kind !== 'brute') this.lungeCooldown = 3.0; // measured from the end of the recovery
    } else if (this.kind === 'sentinel') {
      this.attackCooldown = 0.3;
    }
    this.atkTgt = null;
    this.faceLocked = false;
    this.setState('chase');
  }

  // ---------------------------------------------------------------------------
  // Animation
  // ---------------------------------------------------------------------------

  private animate(dt: number, game: Game): void {
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.animPhase += dt * 2;
    if (this.kind === 'husk') this.animateHusk(dt, game);
    else if (humanoid(this.kind)) this.animateWalker(dt, speed, game);
    else if (this.kind === 'ticker') this.animateTicker(speed, game);
    else this.animateSentinel();
  }

  /** windup progress 0..1, strike progress 0..1, recovery progress 0..1 for the current attack */
  private attackK(): [number, number, number] {
    const S = SCHED[this.kind][this.state === 'charge' ? 'charge' : 'attack'];
    const p = this.phase;
    const t = this.phaseT;
    const prepK = p === 'prep' ? Math.min(1, t / Math.max(0.001, S.prep)) : 1;
    const strikeK = p === 'strike' || p === 'move' ? Math.min(1, t / Math.max(0.001, S.commit)) : p === 'recover' ? 1 : 0;
    const recK = p === 'recover' ? Math.min(1, t / Math.max(0.001, S.recover)) : 0;
    return [prepK, strikeK, recK];
  }

  private animateTicker(speed: number, game: Game): void {
    // legs skitter in alternating tripods; while arming they plant and spread
    const arming = this.state === 'attack';
    const g = this.animPhase * (2 + speed * 1.6);
    for (let i = 0; i < this.legs.length; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const leg = this.legs[i];
      leg.rotation.x = arming ? 0 : Math.sin(g * 3 + i * 1.1) * Math.min(0.7, speed * 0.14);
      leg.rotation.z = (arming ? 0.75 : 0.55) * side;
    }
    // the lids open over the first 0.25s of the warning
    const open = arming ? Math.min(1, this.phaseT / 0.25) : 0;
    for (let i = 0; i < this.lids.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.lids[i].rotation.z = -side * open * 1.3;
    }
    this.body.position.y = arming ? Math.sin(this.animPhase * 60) * 0.015 : Math.abs(Math.sin(g * 1.5)) * 0.03;
    // the core pulses with the beeps and glows hotter as it closes
    const core = this.glowParts[0];
    const battery = this.glowParts[1];
    const blink = arming ? (Math.floor(this.phaseT / 0.12) % 2 === 0 ? 2.4 : 0.7) : this.awake ? 1.4 : 1;
    (core.material as THREE.MeshBasicMaterial).color.copy(core.userData.baseColor as THREE.Color).multiplyScalar(blink);
    (battery.material as THREE.MeshBasicMaterial).color.copy(battery.userData.baseColor as THREE.Color).multiplyScalar(arming ? 1.6 + open : 1);
    if (arming) game.dynLights.submit(this.pos.x, this.pos.y + 0.2, this.pos.z, 1, 0.65, 0.1, 0.5 * blink, 3);
  }

  private animateSentinel(): void {
    // paddles: a loose X at rest, spread wide and lifted while charging,
    // folded in during recovery; shutters slide out with the charge
    let spread = 0.3;
    let glow = this.awake ? 1.15 : 1;
    if (this.state === 'attack') {
      const [prepK, , recK] = this.attackK();
      if (this.phase === 'prep') {
        spread = 0.3 + 0.7 * prepK;
        glow = 1 + 1.4 * prepK;
      } else {
        // folded in, easing back to the resting X
        spread = lerp(-0.15, 0.3, recK);
        glow = lerp(0.6, 1.15, recK);
      }
    }
    for (let i = 0; i < this.paddles.length; i++) {
      const p = this.paddles[i];
      const sx = i < 2 ? -1 : 1;
      const sz = i % 2 === 0 ? -1 : 1;
      // sweep toward front/back and lift
      p.rotation.y = -sx * sz * (0.45 + spread * 0.6);
      p.rotation.z = sx * (spread * 0.55 - 0.1);
      p.position.y = 0.06 + spread * 0.04;
    }
    for (let i = 0; i < this.shutters.length; i++) {
      const side = i === 0 ? -1 : 1;
      this.shutters[i].position.x = side * (0.3 + 0.1 * Math.max(0, spread));
    }
    const optic = this.glowParts[0];
    (optic.material as THREE.MeshBasicMaterial).color.copy(optic.userData.baseColor as THREE.Color).multiplyScalar(glow);
    const emitter = this.glowParts[1];
    (emitter.material as THREE.MeshBasicMaterial).color.copy(emitter.userData.baseColor as THREE.Color).multiplyScalar(0.8 + glow * 0.3);
    this.body.rotation.z = Math.sin(this.hoverPhase * 1.7) * 0.04;
  }

  /** Husk gait follows distance actually travelled, including on co-op puppets.
   * Knees reuse the existing boxes; feet settle at rest and stay on the floor.
   */
  private animateHusk(dt: number, game: Game): void {
    const dx = this.pos.x - this.huskLastX;
    const dz = this.pos.z - this.huskLastZ;
    let distance = this.huskMotionReady ? Math.hypot(dx, dz) : 0;
    this.huskLastX = this.pos.x;
    this.huskLastZ = this.pos.z;
    this.huskMotionReady = true;
    // A spawn/teleport isn't a running stride.
    if (distance > Math.max(1, dt * 20)) distance = 0;
    const attacking = this.state === 'attack' || this.state === 'charge';
    const moving = !attacking || this.phase === 'move' || this.phase === 'recover';
    const grounded = this.puppet || this.onGround;
    const travel = moving && grounded && this.state !== 'pain' ? distance : 0;
    const previousGait = this.gait;
    this.gait += travel * (Math.PI * 2 / 1.3);
    const speed = travel / Math.max(dt, 0.001);
    const k = 1 - Math.exp(-18 * dt);
    this.huskWalk = lerp(this.huskWalk, Math.min(1, speed / HUSK_RUN_SPEED), k);
    if (this.huskWalk < 0.003) this.huskWalk = 0;
    const stride = Math.sin(this.gait);
    const swing = Math.cos(this.gait);
    const walk = this.huskWalk;
    const legAmp = 0.5 * walk;
    this.legLG!.rotation.x = lerp(this.legLG!.rotation.x, stride * legAmp, k);
    this.legRG!.rotation.x = lerp(this.legRG!.rotation.x, -stride * legAmp, k);
    this.huskKneeLG!.rotation.x = lerp(this.huskKneeLG!.rotation.x, -0.65 * Math.max(0, swing) * walk, k);
    this.huskKneeRG!.rotation.x = lerp(this.huskKneeRG!.rotation.x, -0.65 * Math.max(0, -swing) * walk, k);

    let lean = -0.12 - 0.10 * walk;
    let twist = stride * 0.035 * walk;
    let head = 0.10;
    let leftArm = 0.18 - stride * 0.22 * walk;
    let rightArm = 0.18 + stride * 0.22 * walk;
    let jaw = this.awake ? 0.12 : 0.04;
    if (attacking) {
      const [prepK, strikeK, recK] = this.attackK();
      const prep = this.phase === 'prep';
      const recover = this.phase === 'recover';
      const settle = smooth01(recK);
      if (this.state === 'attack') {
        // The rake arrives at the damage frame (end of prep), rather than
        // only starting its forward swing after damage has already landed.
        const draw = smooth01(prepK / 0.75);
        const rake = smooth01((prepK - 0.75) / 0.25);
        if (prep) {
          rightArm = lerp(lerp(0.18, -0.65, draw), 1.0, rake);
          leftArm = lerp(0.18, 0.35, draw);
          lean = lerp(-0.12 - draw * 0.08, -0.32, rake);
          twist = lerp(-0.12 * draw, 0.12, rake);
          jaw = 0.12 + draw * 0.2;
        } else {
          rightArm = recover ? lerp(0.72, 0.18, settle) : lerp(1.0, 0.72, smooth01(strikeK));
          leftArm = lerp(0.35, leftArm, recover ? settle : 0);
          lean = lerp(-0.32, lean, recover ? settle : smooth01(strikeK) * 0.2);
          twist = 0.12 * (1 - (recover ? settle : 0));
          jaw = lerp(0.32, jaw, recover ? settle : strikeK);
        }
      } else {
        // A grounded, short driving step. No frozen airborne legs or deep
        // root crouch: the physics never launches this enemy into the air.
        if (prep) {
          const brace = smooth01(prepK);
          leftArm = rightArm = lerp(0.18, -0.4, brace);
          lean = lerp(-0.12, -0.28, brace);
          jaw = 0.12 + 0.15 * brace;
        } else if (recover) {
          leftArm = lerp(0.75, leftArm, settle);
          rightArm = lerp(0.85, rightArm, settle);
          lean = lerp(-0.32, lean, settle);
          jaw = lerp(0.27, jaw, settle);
        } else {
          const drive = smooth01(this.phaseT / 0.07);
          leftArm = lerp(-0.4, 0.75, drive);
          rightArm = lerp(-0.4, 0.85, drive);
          lean = lerp(-0.28, -0.32, drive);
          jaw = 0.27;
        }
        twist *= 0.4;
      }
      head = -lean * 0.55;
    }
    if (this.state === 'pain') lean = 0.14 * (1 - smooth01(this.stateTime / this.stunTime));
    const poseK = 1 - Math.exp(-(attacking ? 36 : 18) * dt);
    this.armLG!.rotation.set(lerp(this.armLG!.rotation.x, leftArm, poseK), 0, -0.10);
    this.armRG!.rotation.set(lerp(this.armRG!.rotation.x, rightArm, poseK), 0, 0.10);
    this.torsoG!.rotation.x = lerp(this.torsoG!.rotation.x, lean, poseK);
    this.torsoG!.rotation.y = lerp(this.torsoG!.rotation.y, twist, poseK);
    this.torsoG!.rotation.z = stride * 0.02 * walk;
    this.body.rotation.z = 0;
    this.headG!.rotation.x = lerp(this.headG!.rotation.x, head, poseK);
    this.headG!.rotation.y = this.awake ? 0 : Math.sin(this.animPhase * 0.35) * 0.12;
    this.jaw!.rotation.x = lerp(this.jaw!.rotation.x, jaw, poseK);

    // Lowest sole after hip + knee rotations. Anchor the support foot without
    // adding a fake bounce or letting a crouched root sink both feet through
    // the floor. Knee position=-.32, foot center=(-.34,-.05), half size=(.05,.14).
    this.body.position.y = -this.half.y - Math.min(
      huskSole(this.legLG!.rotation.x, this.huskKneeLG!.rotation.x),
      huskSole(this.legRG!.rotation.x, this.huskKneeRG!.rotation.x)
    );
    if (grounded && travel > 0.001 && Math.floor((this.gait - Math.PI / 2) / Math.PI) !==
      Math.floor((previousGait - Math.PI / 2) / Math.PI)) {
      game.audio.play('huskStep', this.pos);
    }
  }

  private animateWalker(dt: number, speed: number, game: Game): void {
    const speedF = Math.min(1, speed / this.tuning.speed);
    this.gait += dt * (2 + speed * (this.kind === 'brute' ? 1.7 : 2.9));
    const g = this.gait;
    const vat = this.kind === 'vatborn';
    const brute = this.kind === 'brute';
    const hunting = this.state === 'chase' || this.state === 'attack' || this.state === 'charge';

    // strides swing from the hips; feet drive a bob and a side-to-side waddle
    const amp = 0.2 + speedF * 0.75;
    if (this.state === 'charge' && this.phase === 'move' && this.kind !== 'brute') {
      // a lunge/rush is one bound, not a 9u/s walk cycle: legs held in a leap
      this.legLG!.rotation.x = -0.7;
      this.legRG!.rotation.x = 0.5;
      this.body.position.y = 0.06;
      this.body.rotation.z = 0;
    } else {
      this.legLG!.rotation.x = Math.sin(g) * amp;
      this.legRG!.rotation.x = Math.sin(g + Math.PI) * amp;
      this.body.position.y = Math.abs(Math.cos(g)) * 0.08 * speedF;
      this.body.rotation.z = Math.sin(g) * 0.08 * speedF;
    }

    // hunched torso leans into its run
    let lean = 0.16 + speedF * 0.24;
    let twist = 0;
    let headX = -0.1;
    const roll = Math.sin(g) * 0.06 * speedF;
    let crouch = 0;

    if (this.state === 'attack' || this.state === 'charge') {
      const [prepK, strikeK, recK] = this.attackK();
      const charge = this.state === 'charge';
      const prep = this.phase === 'prep';
      const rec = this.phase === 'recover';
      if (vat && !charge) {
        // heavy club: only the right arm rises overhead, torso twists away,
        // then slams down and stays near the floor through the recovery
        const up = prep ? lerp(-0.3, -2.6, prepK) : lerp(-2.6, 0.55, strikeK);
        this.armRG!.rotation.x = rec ? lerp(0.55, -0.3, recK * recK) : up;
        this.armRG!.rotation.z = 0.12 - 0.2 * (prep ? prepK : 1 - recK);
        this.armLG!.rotation.x = -0.4;
        this.armLG!.rotation.z = -0.25;
        twist = prep ? -0.35 * prepK : lerp(-0.35, 0.25, strikeK) * (1 - recK);
        lean += prep ? -0.1 * prepK : lerp(-0.1, 0.5, strikeK) * (1 - recK * 0.6);
        this.jaw!.rotation.x = 0.2 + 0.4 * (prep ? prepK : 1 - recK);
      } else if (vat) {
        // braced rush: crouch with the club drawn back, then drive forward
        const k = prep ? prepK : 1 - recK;
        crouch = 0.12 * k;
        lean += 0.3 * k;
        // (arm pivot: negative x swings back/up, positive swings forward)
        this.armRG!.rotation.x = lerp(-0.3, -0.9, k);
        this.armLG!.rotation.x = lerp(0.3, 0.8, k);
        this.armRG!.rotation.z = 0.1;
        this.armLG!.rotation.z = -0.15;
        this.jaw!.rotation.x = 0.3;
      } else if (brute && !charge) {
        // backhand: the arm pulls across the torso, then sweeps out
        const across = prep ? lerp(0.2, 1.3, prepK) : lerp(1.3, -1.4, strikeK) * (1 - recK);
        // the striking arm is held forward at chest height and swept by rotation.y
        this.armRG!.rotation.x = rec ? lerp(1.2, 0.3, recK) : 1.2;
        this.armRG!.rotation.y = across;
        this.armLG!.rotation.x = 0.4 + 0.3 * (prep ? prepK : 1 - recK);
        this.armLG!.rotation.z = 0.2;
        this.armRG!.rotation.z = -0.2;
        twist = prep ? 0.3 * prepK : lerp(0.3, -0.4, strikeK) * (1 - recK);
        lean += prep ? -0.05 * prepK : lerp(0.0, 0.35, strikeK) * (1 - recK);
        headX = 0.15;
        this.jaw!.rotation.x = 0.2 + 0.4 * (prep ? prepK : 1 - recK);
      } else if (brute) {
        // charge: rear back with the head down and roar, bull forward, then
        // the bent-forward recovery with the fists near the floor
        const k = prep ? prepK : 1;
        if (prep) {
          lean -= 0.3 * k;
          headX = 0.45 * k;
          // reared back: arms drawn behind
          this.armRG!.rotation.x = -0.7 * k;
          this.armLG!.rotation.x = -0.7 * k;
        } else if (rec) {
          // bent forward, fists swinging down to the floor
          lean += lerp(0.45, 0.65, recK) - 0.4 * recK * recK;
          headX = 0.3;
          this.armRG!.rotation.x = lerp(0.6, 0.2, recK);
          this.armLG!.rotation.x = lerp(0.6, 0.2, recK);
        } else {
          // bulling forward, arms pumping back
          lean += 0.45;
          headX = 0.2;
          this.armRG!.rotation.x = -0.5;
          this.armLG!.rotation.x = -0.5;
        }
        this.armRG!.rotation.y = 0;
        this.armLG!.rotation.z = 0.25;
        this.armRG!.rotation.z = -0.25;
        this.jaw!.rotation.x = 0.5;
      }
    } else if (hunting && vat) {
      // the club drags low and swings with the gait; the thin arm reaches
      this.armRG!.rotation.x = -0.3 + Math.sin(g) * 0.18;
      this.armLG!.rotation.x = 0.5 + Math.sin(g * 2) * 0.2;
      this.armRG!.rotation.z = 0.1;
      this.armLG!.rotation.z = -0.15;
      this.jaw!.rotation.x = 0.2;
    } else if (hunting) {
      // claws reaching ahead and raking as it closes in, maw hanging open
      // (negative x would trail the arms behind it)
      this.armLG!.rotation.x = 0.55 + Math.sin(g * 2) * 0.3;
      this.armRG!.rotation.x = 0.55 + Math.sin(g * 2 + Math.PI) * 0.3;
      this.armLG!.rotation.z = 0.18;
      this.armRG!.rotation.z = -0.18;
      this.armRG!.rotation.y = 0;
      this.jaw!.rotation.x = 0.3 + Math.sin(g) * 0.08;
    } else {
      // slouched shuffle, arms hanging, jaw shut
      this.armLG!.rotation.x = -0.12 + Math.sin(g) * 0.2;
      this.armRG!.rotation.x = -0.12 - Math.sin(g) * 0.2;
      this.armLG!.rotation.z = 0.08;
      this.armRG!.rotation.z = -0.08;
      this.armRG!.rotation.y = 0;
      this.jaw!.rotation.x = 0.05;
    }

    // pain: recoil backward off the lean; a brute's wall stun is the
    // bent-forward daze instead, arms hanging
    if (this.state === 'pain') {
      if (brute && this.stunTime > 0.32) {
        lean += 0.5 * Math.max(0, 1 - this.stateTime / this.stunTime) + 0.15;
        headX = 0.35;
        this.armRG!.rotation.x = 0.4;
        this.armLG!.rotation.x = 0.4;
        this.armRG!.rotation.y = 0;
      } else {
        lean -= 0.5 * Math.max(0, 1 - this.stateTime / this.stunTime);
      }
    }

    this.torsoG!.rotation.x = lean;
    this.torsoG!.rotation.y = twist;
    this.torsoG!.rotation.z = roll;
    this.body.position.y -= crouch;

    // head: scans the room while unaware, locks forward while hunting
    if (!this.awake) {
      this.headG!.rotation.y = Math.sin(this.animPhase * 0.4) * 0.55;
      this.headG!.rotation.x = Math.sin(this.animPhase * 0.27) * 0.12;
    } else {
      this.headG!.rotation.y *= 0.8;
      this.headG!.rotation.x = headX;
    }

    // footfalls: chitin clicks for husks, ground-shaking thuds for brutes
    const stride = Math.sin(g);
    if (speed > (this.kind === 'husk' ? 1.6 : 0.9) && this.lastStride <= 0 !== stride <= 0) {
      game.audio.play(this.kind === 'husk' ? 'huskStep' : 'bruteStep', this.pos);
    }
    this.lastStride = stride;
  }

  // ---------------------------------------------------------------------------
  // Culling + lighting
  // ---------------------------------------------------------------------------

  /**
   * Occlusion cull (core/occlusion.ts): while no part of the rig is in sight
   * of the eye, the inner body group is DETACHED from the mesh. Hiding alone
   * still left three.js recomputing every part's world matrix each frame;
   * detached, the subtree costs nothing. The outer mesh (and its visibility,
   * which game logic owns) stays put; animation keeps posing the parts.
   */
  cullFrom(world: VoxelWorld, ex: number, ey: number, ez: number, dt: number, maxDist: number): void {
    if (!this.mesh.visible) return;
    // rigs reach past the physics box (arms, the vatborn fist): pad the test
    if (seenFrom(world, ex, ey, ez, this.pos.x, this.pos.y, this.pos.z, this.half.x + 0.35, this.half.y + 0.15, maxDist)) {
      this.seenHold = SEEN_HOLD;
    } else {
      this.seenHold -= dt;
    }
    this.attachBody(this.seenHold > 0);
  }

  /** (re)attach or detach the rig under the mesh */
  attachBody(on: boolean): void {
    const attached = this.body.parent === this.mesh;
    if (on && !attached) this.mesh.add(this.body);
    else if (!on && attached) this.mesh.remove(this.body);
  }

  /** the CPU-lit parts (not fullBright), gathered once: the rig never changes */
  private litCache: THREE.Mesh[] | null = null;
  private get litParts(): THREE.Mesh[] {
    if (!this.litCache) {
      const list: THREE.Mesh[] = [];
      this.mesh.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.userData.fullBright) list.push(o);
      });
      this.litCache = list;
    }
    return this.litCache;
  }

  /** tint body parts by baked + dynamic light; hit flash overrides */
  private updateLighting(game: Game, dt: number): void {
    this.lightTick += dt;
    if (this.lightTick < 0.08) return;
    this.lightTick = 0;
    const l = game.world.sampleLight01(this.pos.x, this.pos.y, this.pos.z, _light);
    const d = game.dynLights.sampleAt(this.pos.x, this.pos.y, this.pos.z, _dyn);
    // generous floor so enemies stay readable in dark/strongly-colored rooms
    const lum = 0.45 + (l[0] + l[1] + l[2]) * 0.35;
    const r = Math.min(1.3, lum + l[0] * 0.9 + d[0]);
    const g = Math.min(1.3, lum + l[1] * 0.9 + d[1]);
    const b = Math.min(1.3, lum + l[2] * 0.9 + d[2]);
    const flash = this.flashTime > 0;
    // inside a tank the light grid has nothing (it's solid glass): use the
    // liquid's own green glow so the occupant reads through it
    const parts = this.litParts;
    if (this.dormant) {
      for (const o of parts) {
        const base = o.userData.baseColor as THREE.Color;
        (o.material as THREE.MeshBasicMaterial).color.setRGB(base.r * 0.55, base.g * 0.9, base.b * 0.5);
      }
      return;
    }
    for (const o of parts) {
      const m = o.material as THREE.MeshBasicMaterial;
      const base = o.userData.baseColor as THREE.Color;
      if (flash) m.color.setRGB(2.2, 1.9, 1.7);
      else m.color.setRGB(base.r * r, base.g * g, base.b * b);
    }
  }
}

export class EnemyManager {
  readonly group = new THREE.Group();
  readonly list: Enemy[] = [];

  /** remove all enemies (level teardown), freeing their geometry/materials */
  reset(): void {
    for (const e of this.list) {
      this.group.remove(e.mesh);
      e.attachBody(true); // culled rigs are detached: dispose them too
      e.mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
    }
    this.list.length = 0;
  }

  spawnFromSpecs(specs: EnemySpec[], rooms: RoomDef[], game: Game): void {
    for (const s of specs) {
      const room = rooms.find((r) => r.id === s.roomId) ?? null;
      // ground = lowest walkable air at the spawn cell (air with solid below,
      // and headroom above) — NOT the rock above the room's ceiling
      const sx = Math.floor(s.x);
      const sz = Math.floor(s.z);
      let ground = 1;
      for (let y = 1; y <= 10; y++) {
        if (
          !game.world.isSolid(sx, y, sz) &&
          !game.world.isSolid(sx, y + 1, sz) &&
          game.world.isSolid(sx, y - 1, sz)
        ) {
          ground = y;
          break;
        }
      }
      const e = new Enemy(s, room, ground, Math.random() < 0.45);
      this.list.push(e);
      this.group.add(e.mesh);
    }
  }

  update(dt: number, game: Game): void {
    for (const e of this.list) e.update(dt, game);
    // pairwise separation between alive enemies — applied as velocity so it
    // goes through wall collision (direct position pushes could embed an
    // enemy in a wall, which breaks collision resolution entirely). A planted
    // or committed enemy is never shoved; the other one moves instead.
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.alive || a.scripted) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (!b.alive || b.scripted) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = a.half.x + b.half.x + 0.25;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const accel = ((min - d) / min) * 30 * dt;
          const nx = dx / d;
          const nz = dz / d;
          const share = a.planted === b.planted ? 1 : 2;
          if (!a.planted) {
            a.vel.x -= nx * accel * share;
            a.vel.z -= nz * accel * share;
          }
          if (!b.planted) {
            b.vel.x += nx * accel * share;
            b.vel.z += nz * accel * share;
          }
        }
      }
    }
    // safety net: anything that somehow leaves the world snaps back to its room
    for (const e of this.list) {
      if (!e.alive || e.scripted) continue;
      if (e.pos.y < -8 || e.pos.y > game.world.sy + 6 ||
          e.pos.x < -4 || e.pos.x > game.world.sx + 4 ||
          e.pos.z < -4 || e.pos.z > game.world.sz + 4) {
        e.respawnInRoom();
      }
    }
  }

  /** nearest alive enemy hit by a ray, or null */
  raycast(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxT: number
  ): { enemy: Enemy; t: number } | null {
    let best: { enemy: Enemy; t: number } | null = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, maxT, {
        minX: e.pos.x - e.half.x, maxX: e.pos.x + e.half.x,
        minY: e.pos.y - e.half.y, maxY: e.pos.y + e.half.y,
        minZ: e.pos.z - e.half.z, maxZ: e.pos.z + e.half.z,
      });
      if (t !== null && (best === null || t < best.t)) best = { enemy: e, t };
    }
    return best;
  }

  /** wake alive enemies within radius of a noise (gunshots etc.) */
  alertAt(x: number, z: number, radius: number, game: Game): void {
    for (const e of this.list) {
      if (!e.alive || e.awake) continue;
      const dx = e.pos.x - x;
      const dz = e.pos.z - z;
      if (dx * dx + dz * dz < radius * radius) e.wake(game);
    }
  }

  aliveCount(): number {
    return this.list.filter((e) => e.alive).length;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
