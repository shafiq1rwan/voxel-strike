import * as THREE from 'three';
import type { Enemy } from './enemies';
import type { EnemyKind } from '../types';
import type { Game, PlayerTarget } from '../game';
import { moveBody } from '../core/physics';
import { RigKit, sched, span, angleTo, lerp } from './monster-kit';

/**
 * The Facility's new monsters, after reference/sector-monsters-v2 (sheets 01
 * and 02, BEHAVIOURS.md §1–3):
 *  - Sentry Bud (sector 1): a turret bolted to the floor — a low base, a
 *    square head with a cyan eye between two big lids. Bait its one slow bolt.
 *  - Clamp Guard (sector 2): a squat slate biped with two huge C-shaped clamp
 *    jaws and glowing amber pistons. It turns slowly — flank the open jaws.
 *  - Wire Leech (sector 3): a low four-legged parasite with a copper coil on
 *    its back and a violet emitter. Its tether slows and stings; shoot the
 *    coil, break line of sight or kill it to snap the link.
 * Each attack reads prepare → commit → recover on FACILITY_SCHEDULE, like the
 * rest of the roster, so co-op puppets pose from state + time.
 */
export type FacilityKind = 'sentryBud' | 'clampGuard' | 'wireLeech';
export const isFacilityKind = (kind: EnemyKind): kind is FacilityKind =>
  kind === 'sentryBud' || kind === 'clampGuard' || kind === 'wireLeech';

/** BEHAVIOURS.md timings: warning, aim lock (tracking stops), commit, recovery */
export const FACILITY_SCHEDULE = {
  // aim 1.0 with the lids opening, locked for the last 0.25; 1.5 dim-lid recovery
  sentryBud: sched(1.0, 0.75, 0, 1.5),
  // jaws spread 0.9 (turning stops for the last 0.3), one 0.2 close, 1.2 shut + exposed
  clampGuard: sched(0.9, 0.6, 0.2, 1.2),
  // feet anchored + coil open 1.1 (aim locks for the last 0.3), 1.5 folded-coil recovery
  wireLeech: sched(1.1, 0.8, 0, 1.5),
};

const BUD_RANGE = 9;
const BUD_BOLT_SPEED = 7;
const BUD_BOLT_DAMAGE = 6;
/** a shot every 3.5 s at most: prep + recover + this */
const BUD_REST = 1.0;
const GUARD_REACH = 2.1;
const GUARD_DAMAGE = 16;
/** 65 degrees a second while it walks or winds up */
const GUARD_TURN = 65 * Math.PI / 180;
const LEECH_RANGE = 7;
const LEECH_BOLT_SPEED = 11;
/** cooldown counted from the start of a cast */
const LEECH_COOLDOWN = 4.5;
/** link: 25% slow for at most 0.8 s, 4 damage at 0.4 and 0.8 */
const LINK_TIME = 0.8;
const LINK_TICK = 4;
/** this much damage to the coil while linked snaps the link */
const COIL_BREAK = 20;

// palette read off sheets 01 and 02
const STEEL = 0x707680; // sentry bud steel
const STEEL_L = 0x828891;
const STEEL_D = 0x4a4e57;
const DARK = 0x26292f;
const RUST = 0x8c4a2e;
const CYAN = 0x55e0ff;
const SLATE = 0x4f4954; // clamp guard: dark plum-slate
const SLATE_D = 0x3a3541;
const CLAMP = 0x8e8079; // weathered stone-grey jaws
const CLAMP_D = 0x716560;
const AMBER = 0xff9a26;
const CHAR = 0x3b3c42; // wire leech chassis
const CHAR_L = 0x575960;
const FOOT = 0x8e9196;
const COPPER = 0xc8743a;
const COPPER_D = 0x9c5428;
const VIOLET = 0xb45aff;


/** live tethers, one per player (a second leech can't stack a link) */
const links = new Map<PlayerTarget, FacilityMonster>();
/** after a link ends no leech can tether that player for this long (a pack can't chain-slow) */
const RELINK_GRACE = 1.2;
const graceUntil = new Map<PlayerTarget, number>();
const now = (): number => performance.now() / 1000;
const free = (t: PlayerTarget): boolean => !links.has(t) && (graceUntil.get(t) ?? 0) <= now();

export class FacilityMonster {
  private kit = new RigKit();
  private time = 0;
  private cooldown = 0.8;
  private hit = false;
  /** aim (world, normalized) — tracks until the lock, then holds */
  private aim = new THREE.Vector3(0, 0, -1);
  private face = 0;
  private walked = 0;
  private ground = false;
  private strafe = Math.random() < 0.5 ? -1 : 1;
  private strafeT = 0;
  // rig handles
  private head: THREE.Group | null = null;
  private lids: THREE.Group[] = [];
  private arms: THREE.Group[] = [];
  private jaws: THREE.Group[] = []; // [upperL, lowerL, upperR, lowerR]
  private legs: THREE.Group[] = [];
  private torso: THREE.Group | null = null;
  private coil: THREE.Group | null = null;
  private emitter: THREE.Mesh | null = null;
  private eye: THREE.Mesh | null = null;
  /** Wire Leech: the live link and how far it has run */
  private link: { target: PlayerTarget; t: number; ticks: number; coil: number } | null = null;

  constructor(private e: Enemy, private body: THREE.Group, readonly kind: FacilityKind) {
    body.name = kind;
    e.mesh.userData.monsterName = kind === 'sentryBud' ? 'SENTRY BUD' : kind === 'clampGuard' ? 'CLAMP GUARD' : 'WIRE LEECH';
    if (kind === 'sentryBud') this.buildBud();
    else if (kind === 'clampGuard') this.buildGuard();
    else this.buildLeech();
    // the leech's coil is always a target (weapons.ts reads coreOpen + the band)
    if (kind === 'wireLeech') e.coreOpen = true;
  }

  private part(parent: THREE.Object3D, name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: number, bright = false): THREE.Mesh {
    return this.kit.part(parent, name, x, y, z, w, h, d, color, bright);
  }

  private joint(parent: THREE.Object3D, name: string, x: number, y: number, z: number): THREE.Group {
    return this.kit.joint(parent, name, x, y, z);
  }


  /*
   * SENTRY BUD — feet at y = -0.5, faces -z. A wide two-tier base on four
   * corner blocks, a short neck, and a square head (the aim pivot) with a
   * cyan eye in a dark bezel between two tall lids hinged at the head's
   * back corners. 16 boxes.
   */
  private buildBud(): void {
    const p = this.part.bind(this), b = this.body;
    p(b, 'base-slab', 0, -.4, 0, 1.0, .18, .9, DARK);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p(b, 'base-foot', sx * .38, -.37, sz * .32, .28, .26, .28, sx === sz ? RUST : STEEL);
    p(b, 'base-tier', 0, -.22, .02, .72, .2, .62, STEEL_D);
    p(b, 'base-vent', 0, -.4, -.46, .46, .1, .03, DARK);
    p(b, 'neck', 0, -.06, .04, .24, .16, .24, DARK);
    const head = this.joint(b, 'aim-head', 0, .02, .02); this.head = head;
    p(head, 'head-cube', 0, .24, 0, .48, .44, .44, STEEL_L);
    p(head, 'head-rust', .245, .32, .06, .02, .14, .2, RUST);
    p(head, 'eye-bezel', 0, .24, -.23, .34, .32, .04, DARK);
    this.eye = p(head, 'cyan-eye', 0, .24, -.255, .2, .2, .03, CYAN, true);
    for (const side of [-1, 1]) {
      // hinged at the head's back corner; the panel runs forward along the side
      const lid = this.joint(head, 'lid', side * .27, .24, .2); this.lids.push(lid);
      p(lid, 'lid-panel', side * .05, 0, -.25, .08, .6, .54, STEEL);
      p(lid, 'lid-rust', side * .095, -.14, -.12, .02, .2, .18, RUST);
    }
  }

  /*
   * CLAMP GUARD — feet at y = -0.95, faces -z. Short legs with amber knee
   * bands, a dark pelvis, a broad slate chest with an amber seam, a small
   * head with an amber visor slit, piston shoulders glowing amber, and on
   * each arm a huge C clamp: a spine with an upper and a lower jaw that
   * open and snap shut on their own hinges. 27 boxes.
   */
  private buildGuard(): void {
    const p = this.part.bind(this), b = this.body;
    for (const side of [-1, 1]) {
      const hip = this.joint(b, 'hip', side * .24, -.3, 0); this.legs.push(hip);
      p(hip, 'thigh', 0, -.15, 0, .3, .34, .32, SLATE_D);
      p(hip, 'knee-band', 0, -.33, -.005, .31, .05, .33, AMBER, true);
      p(hip, 'shin', 0, -.47, 0, .28, .26, .3, SLATE);
      p(hip, 'foot', 0, -.585, -.05, .36, .13, .46, DARK);
    }
    const torso = this.joint(b, 'torso', 0, 0, 0); this.torso = torso;
    p(torso, 'pelvis', 0, -.22, 0, .56, .22, .38, DARK);
    p(torso, 'chest', 0, .18, 0, .84, .6, .56, SLATE);
    p(torso, 'chest-seam', 0, .16, -.285, .08, .34, .03, AMBER, true);
    p(torso, 'head', 0, .62, -.06, .36, .3, .34, SLATE_D);
    p(torso, 'visor-slit', 0, .64, -.235, .22, .05, .03, AMBER, true);
    for (const side of [-1, 1]) {
      p(torso, 'piston-shoulder', side * .56, .4, 0, .34, .34, .36, SLATE_D);
      p(torso, 'piston-glow', side * .56, .4, -.185, .2, .2, .03, AMBER, true);
      const arm = this.joint(torso, 'shoulder', side * .6, .34, 0); this.arms.push(arm);
      p(arm, 'upper-arm', 0, -.18, 0, .22, .32, .24, DARK);
      const clamp = this.joint(arm, 'clamp', 0, -.5, -.05);
      // a chunky C: a thick back block and two short heavy jaws
      p(clamp, 'clamp-spine', 0, 0, .16, .38, .92, .38, CLAMP);
      p(clamp, 'clamp-rust', side * .195, -.08, .16, .02, .32, .24, RUST);
      const up = this.joint(clamp, 'upper-jaw', 0, .32, .16);
      p(up, 'jaw', 0, 0, -.27, .38, .28, .54, CLAMP);
      const low = this.joint(clamp, 'lower-jaw', 0, -.32, .16);
      p(low, 'jaw', 0, 0, -.27, .38, .28, .54, CLAMP_D);
      this.jaws.push(up, low);
    }
  }

  /*
   * WIRE LEECH — built with feet at y = -0.42 and drawn 0.18 lower (its
   * collider is 0.6 tall so the coil on its back is inside it), faces -z. A broad dark chassis with a
   * lighter deck and a front block carrying the violet emitter, a square
   * copper coil hinged at the back of the deck, and four splayed legs
   * (thigh rising outward, knee block, shin down to a pale foot). 26 boxes.
   */
  private buildLeech(): void {
    const p = this.part.bind(this), b = this.body;
    p(b, 'chassis', 0, 0, 0, 1.0, .34, .86, CHAR);
    p(b, 'deck', 0, .2, .02, .8, .08, .66, CHAR_L);
    p(b, 'front-block', 0, -.04, -.47, .6, .26, .12, CHAR_L);
    this.emitter = p(b, 'violet-emitter', 0, -.06, -.54, .2, .18, .04, VIOLET, true);
    const coil = this.joint(b, 'coil-hinge', 0, .24, .2); this.coil = coil;
    p(coil, 'coil-top', 0, .66, 0, .76, .16, .18, COPPER);
    p(coil, 'coil-bottom', 0, .06, 0, .76, .16, .18, COPPER);
    for (const side of [-1, 1]) p(coil, 'coil-post', side * .3, .36, 0, .16, .44, .18, COPPER);
    for (const y of [.24, .48]) p(coil, 'coil-winding', 0, y, 0, .48, .06, .07, COPPER_D);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = this.joint(b, 'leg', sx * .4, -.02, sz * .3); this.legs.push(leg);
      const thigh = p(leg, 'thigh', sx * .22, .1, 0, .5, .18, .2, CHAR);
      thigh.rotation.z = sx * .5;
      p(leg, 'knee', sx * .46, .22, 0, .24, .24, .24, CHAR_L);
      const shin = p(leg, 'shin', sx * .53, -.06, 0, .2, .46, .2, CHAR);
      shin.rotation.z = -sx * .12;
      p(leg, 'foot', sx * .57, -.31, 0, .28, .18, .3, FOOT);
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

  private glowK(mesh: THREE.Mesh | null, k: number): void {
    this.kit.glowK(mesh, k);
  }

  /** pose for the current state (host and co-op puppet alike) */
  pose(dt: number): void {
    this.time += dt;
    const moved = Math.hypot(this.e.vel.x, this.e.vel.z) * dt;
    this.walked += moved;
    if (this.kind === 'sentryBud') this.poseBud();
    else if (this.kind === 'clampGuard') this.poseGuard();
    else this.poseLeech();
  }

  private poseBud(): void {
    const s = FACILITY_SCHEDULE.sentryBud.attack;
    const { phase, t } = this.attackT();
    // lids: resting ajar, swung wide while it aims, folded over the eye after the shot
    let open = 0.15, glow = this.e.awake ? 1.1 : 0.85, recoil = 0;
    if (phase === 'prep') { open = 0.15 + 0.85 * span(t, 0, 0.6); glow = 1.1 + 1.3 * span(t, 0.2, s.prep); }
    else if (phase === 'recover' || phase === 'strike') {
      open = -0.55 + 0.7 * span(t, s.recover - 0.5, s.recover);
      glow = 0.45 + 0.65 * span(t, s.recover - 0.5, s.recover);
      recoil = Math.max(0, 1 - t / 0.25);
    }
    this.lids.forEach((lid, i) => { lid.rotation.y = (i === 0 ? 1 : -1) * open * 0.65; });
    this.glowK(this.eye, glow);
    if (this.head) {
      // the head carries the aim; the base stays put
      const meshYaw = this.e.mesh.rotation.y;
      this.head.rotation.y = angleTo(meshYaw, this.face);
      this.head.rotation.x = Math.asin(Math.max(-0.6, Math.min(0.6, this.aim.y))) * 0.8 + recoil * 0.25;
      this.head.position.z = 0.02 + recoil * 0.06;
    }
  }

  private poseGuard(): void {
    const s = FACILITY_SCHEDULE.clampGuard.attack;
    const { phase, t } = this.attackT();
    const stride = Math.sin(this.walked * 3.2);
    const moving = Math.min(1, Math.hypot(this.e.vel.x, this.e.vel.z) / 1.2);
    // rest: clamps hanging, jaws slightly open; walk: heavy stomp + clamp swing
    let abduct = 0.18, fwd = 0.15 + stride * 0.2 * moving, inward = 0, jaw = 0.18, lean = 0.05, crouch = 0;
    if (phase === 'prep') {
      const k = span(t, 0, 0.55);
      abduct = 0.18 + 0.6 * k; fwd = 0.15 + 0.55 * k; jaw = 0.18 + 0.5 * k; crouch = 0.08 * k;
      lean = 0.05 - 0.12 * k; // rears back
      fwd += Math.sin(this.time * 30) * 0.02 * span(t, 0.6, s.prep); // strain before the snap
    } else if (phase === 'strike') {
      const k = span(t, 0, s.commit);
      abduct = lerp(0.78, -0.2, k); fwd = lerp(0.7, 1.1, k); inward = 0.5 * k; jaw = lerp(0.68, 0, k);
      lean = lerp(-0.07, 0.22, k); crouch = 0.08;
    } else if (phase === 'recover') {
      const back = span(t, s.recover - 0.45, s.recover);
      abduct = lerp(-0.2, 0.18, back); fwd = lerp(1.1, 0.15, back); inward = 0.5 * (1 - back); jaw = 0.18 * back;
      lean = lerp(0.22, 0.05, back); crouch = 0.08 * (1 - back);
    }
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      arm.rotation.set(fwd, side * inward, side * abduct, 'YXZ');
    });
    this.jaws.forEach((j, i) => { j.rotation.x = (i % 2 === 0 ? 1 : -1) * jaw; });
    if (this.torso) { this.torso.rotation.x = lean; this.torso.position.y = -crouch; }
    this.legs.forEach((leg, i) => {
      leg.rotation.x = phase === 'none' ? (i === 0 ? 1 : -1) * stride * 0.4 * moving : 0;
      leg.position.y = -0.3 + (phase === 'none' ? Math.max(0, (i === 0 ? 1 : -1) * stride) * 0.06 * moving : 0);
    });
    // the pistons and seam flare as the jaws load, dim while they're shut
    // (amber saturates to yellow past ~1.35: keep the flare below it)
    const heat = phase === 'prep' ? 0.95 + 0.4 * span(t, 0, s.prep) : phase === 'recover' ? 0.55 + 0.4 * span(t, s.recover - 0.4, s.recover) : 0.95;
    for (const m of this.kit.glow) this.glowK(m, heat);
  }

  private poseLeech(): void {
    const s = FACILITY_SCHEDULE.wireLeech.attack;
    const { phase, t } = this.attackT();
    const moving = Math.min(1, Math.hypot(this.e.vel.x, this.e.vel.z) / 1.5);
    // coil: tipped back at rest, stood up and humming while it charges, folded flat after
    let coil = 0.7, splay = 0, low = 0, glow = 1, shake = 0;
    if (phase === 'prep') {
      const k = span(t, 0, 0.6);
      coil = lerp(0.7, -0.05, k); splay = 0.25 * k; low = 0.08 * k;
      glow = 1 + 1.6 * span(t, 0.3, s.prep); shake = span(t, 0.5, s.prep) * 0.03;
    } else if (phase === 'recover' || phase === 'strike') {
      const back = span(t, s.recover - 0.5, s.recover);
      coil = lerp(1.25, 0.7, back); splay = 0.25 * (1 - back); low = 0.08 * (1 - back); glow = lerp(0.5, 1, back);
    }
    if (this.link) glow = Math.max(glow, 1.8);
    if (this.coil) {
      this.coil.rotation.x = coil;
      this.coil.position.x = (Math.random() - 0.5) * shake;
    }
    this.body.position.y = -0.18 - low;
    this.legs.forEach((leg, i) => {
      const sx = i < 2 ? -1 : 1;
      const gaitPhase = (i === 0 || i === 3) ? 0 : Math.PI;
      const lift = Math.max(0, Math.sin(this.walked * 5 + gaitPhase)) * 0.1 * moving;
      leg.position.y = -0.02 + lift + low;
      leg.rotation.z = -sx * splay;
      leg.rotation.y = Math.sin(this.walked * 5 + gaitPhase) * 0.25 * moving;
    });
    this.glowK(this.emitter, glow);
  }

  // ---------------------------------------------------------------------------
  // Behaviour
  // ---------------------------------------------------------------------------

  update(dt: number, game: Game, target: PlayerTarget): void {
    const e = this.e, S = FACILITY_SCHEDULE[this.kind].attack;
    this.cooldown = Math.max(0, this.cooldown - dt);
    const dx = target.pos.x - e.pos.x, dz = target.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || 0.001;
    const eyeY = e.pos.y + (this.kind === 'sentryBud' ? 0.26 : this.kind === 'clampGuard' ? 0.6 : -0.1);
    const los = game.hasLOS(e.pos.x, eyeY, e.pos.z, target.pos.x, target.eyeY() - 0.3, target.pos.z);
    const attacking = e.state === 'attack' || e.state === 'charge';
    const wantYaw = Math.atan2(-dx, -dz);
    if (this.kind === 'wireLeech') this.updateLink(dt, game);

    if (!e.awake || target.dead || e.state === 'pain') {
      e.vel.x *= Math.exp(-9 * dt); e.vel.z *= Math.exp(-9 * dt);
      if (e.state === 'pain') this.cooldown = Math.max(this.cooldown, 0.6);
    } else if (attacking) {
      e.phaseT += dt;
      e.vel.x *= Math.exp(-12 * dt); e.vel.z *= Math.exp(-12 * dt);
      if (e.phase === 'prep') {
        if (e.phaseT < S.lock) this.track(target, wantYaw, dt);
        if (e.phaseT >= S.prep) {
          e.phaseT = 0; this.hit = false;
          if (this.kind === 'clampGuard') { e.phase = 'strike'; game.audio.play('meleeSwing', e.pos); }
          else { e.phase = 'recover'; this.fire(game); }
        }
      } else if (e.phase === 'strike') {
        if (e.phaseT >= S.commit) { e.phase = 'recover'; e.phaseT = 0; this.pinch(game); }
      } else if (e.phase === 'recover' && e.phaseT >= S.recover) {
        e.state = 'chase'; e.phaseT = 0;
        this.cooldown = this.kind === 'sentryBud' ? BUD_REST : this.kind === 'clampGuard' ? 0.6 : Math.max(this.cooldown, 0);
      }
    } else if (this.kind === 'sentryBud') {
      // bolted down: it only turns its head and shoots
      e.vel.x = 0; e.vel.z = 0;
      this.track(target, wantYaw, dt * 0.6);
      if (los && dist < BUD_RANGE && this.cooldown === 0) this.begin(game, target, wantYaw);
    } else if (this.kind === 'clampGuard') {
      const ahead = Math.abs(angleTo(this.face, wantYaw));
      const sameFloor = Math.abs(target.pos.y - e.pos.y) < 1.2;
      if (los && sameFloor && dist < GUARD_REACH + target.half.x + 0.25 && ahead < 0.7 && this.cooldown === 0) {
        this.begin(game, target, wantYaw);
      } else {
        // a slow turret on legs: it turns at 65°/s and walks the way it faces
        let goal = wantYaw;
        const via = e.navAround(dt, target, game);
        if (via) goal = Math.atan2(-via[0], -via[1]);
        this.turnToward(goal, dt);
        const go = dist > 1.6 && Math.abs(angleTo(this.face, goal)) < 1.2 ? e.tuning.speed : 0;
        this.drive(-Math.sin(this.face), -Math.cos(this.face), go, dt);
        this.aim.set(dx / dist, 0, dz / dist);
      }
    } else {
      // Wire Leech: holds 4–6.5 u, sidles across, casts when it can see you
      this.track(target, wantYaw, dt);
      if (los && dist < LEECH_RANGE && this.cooldown === 0 && free(target)) {
        this.begin(game, target, wantYaw);
        this.cooldown = LEECH_COOLDOWN;
      } else {
        let nx = dx / dist, nz = dz / dist, speed = e.tuning.speed;
        const via = e.navAround(dt, target, game);
        if (via) { nx = via[0]; nz = via[1]; }
        else if (los && dist < 4) { nx = -nx; nz = -nz; speed *= 0.8; }
        else if (los && dist < 6.5) {
          this.strafeT -= dt;
          if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = 1.5 + Math.random(); }
          const ox = nx; nx = -nz * this.strafe; nz = ox * this.strafe; speed *= 0.55;
        }
        this.drive(nx, nz, speed, dt);
      }
    }

    // physics: walkers fall, the bud sits on its base
    e.vel.y -= 24 * dt;
    const sub = Math.max(1, Math.ceil(Math.hypot(e.vel.x, e.vel.z) * dt / 0.22));
    for (let i = 0; i < sub; i++) {
      const r = moveBody(game.world, e.pos, e.half, e.vel, dt / sub, game.solidBoxes());
      this.ground = r.onGround;
      if ((r.hitX || r.hitZ) && this.kind === 'wireLeech') this.strafe = -this.strafe;
    }
    if (this.ground) { e.vel.x *= Math.exp(-3 * dt); e.vel.z *= Math.exp(-3 * dt); }
    // the body faces where it is headed (the bud's base never turns)
    if (this.kind !== 'sentryBud') e.mesh.rotation.y = this.face;
    if (this.kind === 'clampGuard' && this.ground && !attacking) {
      const step = Math.floor(this.walked / 1.1);
      if (step !== this.lastStep) { this.lastStep = step; game.audio.play('bruteStep', e.pos); }
    }
    this.pose(dt);
  }
  private lastStep = 0;

  /** face + aim follow the target (the guard's turn is rate-limited) */
  private track(target: PlayerTarget, wantYaw: number, dt: number): void {
    if (this.kind === 'clampGuard') this.turnToward(wantYaw, dt);
    else this.face += angleTo(this.face, wantYaw) * (1 - Math.exp(-10 * dt));
    const from = this.muzzle(_m);
    this.aim.set(target.pos.x - from.x, target.eyeY() - 0.35 - from.y, target.pos.z - from.z).normalize();
  }

  private turnToward(goal: number, dt: number): void {
    const d = angleTo(this.face, goal);
    this.face += Math.sign(d) * Math.min(Math.abs(d), GUARD_TURN * dt);
  }

  private drive(nx: number, nz: number, speed: number, dt: number): void {
    const e = this.e, blend = 1 - Math.exp(-8 * dt);
    e.vel.x += (nx * speed - e.vel.x) * blend; e.vel.z += (nz * speed - e.vel.z) * blend;
  }

  private begin(game: Game, target: PlayerTarget, wantYaw: number): void {
    const e = this.e;
    e.state = 'attack'; e.phase = 'prep'; e.phaseT = 0; this.hit = false;
    if (this.kind !== 'clampGuard') this.face = wantYaw;
    this.track(target, wantYaw, 1);
    game.audio.play(this.kind === 'clampGuard' ? 'bruteRoar' : 'sentinelAlert', e.pos);
  }

  /** where a shot leaves: the bud's eye, the leech's emitter */
  private muzzle(out: THREE.Vector3): THREE.Vector3 {
    const e = this.e;
    const fx = -Math.sin(this.face), fz = -Math.cos(this.face);
    if (this.kind === 'sentryBud') return out.set(e.pos.x + fx * 0.32, e.pos.y + 0.26, e.pos.z + fz * 0.32);
    return out.set(e.pos.x + fx * 0.6, e.pos.y - 0.24, e.pos.z + fz * 0.6);
  }

  private fire(game: Game): void {
    const e = this.e, m = this.muzzle(_m);
    // a closed door or pillar in the way catches the shot at the muzzle
    if (!game.hasLOS(e.pos.x, m.y, e.pos.z, m.x, m.y, m.z)) return;
    if (this.kind === 'sentryBud') {
      game.projectiles.spawn('bolt', m.x, m.y, m.z, this.aim.x, this.aim.y, this.aim.z, BUD_BOLT_SPEED, false, 1,
        { damage: BUD_BOLT_DAMAGE, by: 'sentryBud' });
      game.audio.play('boltFire', e.pos);
      game.dynLights.flash(m.x, m.y, m.z, 0.3, 0.85, 1, 1.2, 4, 0.15);
    } else {
      game.projectiles.spawn('tether', m.x, m.y, m.z, this.aim.x, this.aim.y, this.aim.z, LEECH_BOLT_SPEED, false, 1,
        { damage: 0, by: 'wireLeech', owner: this });
      game.audio.play('arcFire', e.pos);
      game.dynLights.flash(m.x, m.y, m.z, 0.7, 0.35, 1, 1.2, 4, 0.18);
    }
  }

  /** the jaws close once across a fixed arc in front: reach, same floor, cone, line of sight */
  private pinch(game: Game): void {
    const e = this.e;
    const fx = -Math.sin(this.face), fz = -Math.cos(this.face);
    game.audio.play('bruteSlam', e.pos);
    for (const pl of game.playerTargets()) {
      if (pl.dead || this.hit) continue;
      const px = pl.pos.x - e.pos.x, pz = pl.pos.z - e.pos.z, d = Math.hypot(px, pz) || 0.001;
      if (d > GUARD_REACH + pl.half.x) continue;
      if (Math.abs(pl.pos.y - e.pos.y) > e.half.y + pl.half.y - 0.2) continue;
      if ((px * fx + pz * fz) / d < Math.cos(55 * Math.PI / 180)) continue;
      if (!game.hasLOS(e.pos.x, e.pos.y + 0.4, e.pos.z, pl.pos.x, pl.pos.y, pl.pos.z)) continue;
      this.hit = true;
      pl.damage(GUARD_DAMAGE, game, { x: e.pos.x, z: e.pos.z, by: 'clampGuard' });
      pl.vel.x += fx * 4; pl.vel.z += fz * 4;
      pl.shake = Math.min(0.6, pl.shake + 0.25);
    }
  }

  // ---------------------------------------------------------------------------
  // Wire Leech link
  // ---------------------------------------------------------------------------

  /** the tether bolt reached a player (projectiles.ts): attach if they're free */
  onTetherHit(target: PlayerTarget, game: Game): void {
    if (!this.e.alive || !free(target)) return;
    this.link = { target, t: 0, ticks: 0, coil: 0 };
    links.set(target, this);
    game.audio.play('boltHit', target.pos);
  }

  /** coil hits while linked add up; enough snaps the link */
  coilHit(dmg: number, game: Game): void {
    if (!this.link) return;
    this.link.coil += dmg;
    if (this.link.coil >= COIL_BREAK) {
      game.particles.impact(this.e.pos.x, this.e.pos.y + 0.5, this.e.pos.z, 0, 1, 0, 0.75, 0.4, 1);
      game.audio.play('boltHit', this.e.pos);
      this.detach();
    }
  }

  private updateLink(dt: number, game: Game): void {
    const L = this.link;
    if (!L) return;
    const e = this.e, tg = L.target, m = this.muzzle(_m);
    const ty = tg.pos.y + 0.2;
    const far = Math.hypot(tg.pos.x - e.pos.x, tg.pos.z - e.pos.z) > LEECH_RANGE + 1;
    if (tg.dead || far || !game.hasLOS(m.x, m.y, m.z, tg.pos.x, ty, tg.pos.z)) { this.detach(); return; }
    L.t += dt;
    if (tg === game.player) game.player.slow = Math.max(game.player.slow, 0.06);
    if (L.ticks < 2 && L.t >= (L.ticks + 1) * (LINK_TIME / 2)) {
      L.ticks++;
      tg.damage(LINK_TICK, game, { x: e.pos.x, z: e.pos.z, by: 'wireLeech' });
    }
    // the link: a jagged violet line, redrawn every frame
    const segs = 4;
    let px = m.x, py = m.y, pz = m.z;
    for (let i = 1; i <= segs; i++) {
      const k = i / segs, j = i === segs ? 0 : 0.18;
      const nx = m.x + (tg.pos.x - m.x) * k + (Math.random() - 0.5) * j;
      const ny = m.y + (ty - m.y) * k + (Math.random() - 0.5) * j;
      const nz = m.z + (tg.pos.z - m.z) * k + (Math.random() - 0.5) * j;
      game.tracers.fire(px, py, pz, nx, ny, nz, VIOLET, 0.05);
      px = nx; py = ny; pz = nz;
    }
    game.dynLights.submit(tg.pos.x, ty, tg.pos.z, 0.6, 0.3, 1, 0.5, 3);
    if (L.t >= LINK_TIME) this.detach();
  }

  private detach(): void {
    if (this.link && links.get(this.link.target) === this) {
      links.delete(this.link.target);
      graceUntil.set(this.link.target, now() + RELINK_GRACE);
    }
    this.link = null;
  }

  /** is a link live (tests, HUD) */
  get linked(): boolean { return !!this.link; }

  /** death / teardown: no link, no timers left behind */
  onDeath(): void { this.detach(); }

  dispose(): void {
    this.detach();
    this.kit.dispose();
  }
}

const _m = new THREE.Vector3();


/** every live link ends (level teardown, retry) */
export function clearTethers(): void {
  for (const owner of [...links.values()]) owner.onDeath();
  links.clear();
  graceUntil.clear();
}
