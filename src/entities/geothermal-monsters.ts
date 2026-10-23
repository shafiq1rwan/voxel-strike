import * as THREE from 'three';
import type { Enemy } from './enemies';
import type { EnemyKind } from '../types';
import type { Game, PlayerTarget } from '../game';
import { moveBody } from '../core/physics';

export type GeothermalKind = 'cinderHulk' | 'ventStalker' | 'kilnDrone';
export const isGeothermalKind = (kind: EnemyKind): kind is GeothermalKind =>
  kind === 'cinderHulk' || kind === 'ventStalker' || kind === 'kilnDrone';

/**
 * Attack timing (seconds). Every attack reads as prepare → commit → recover:
 *  - Cinder Hulk: prep 1.05 = a dip (0–0.2), fists swung overhead (0.2–0.85)
 *    and a hang at the top (0.85–1.05); `commit` 0.16 is the downswing and the
 *    slam lands at its END (it used to land on the last prep frame, so the
 *    fists never visibly came down); recover 1.3 keeps the fists planted and
 *    the core open, then pushes back up. Aim locks at 0.65.
 *  - Vent Stalker: prep 0.65 crouch + coil, a leap of at most 0.55, recover 0.95.
 *  - Kiln Drone: prep 0.95 opens the shutters and stokes the furnace; the shot
 *    leaves at the end with a recoil; recover 1.1 closes up.
 */
export const GEO_SCHEDULE = {
  cinderHulk: { attack: { prep: 1.05, lock: .65, commit: .16, recover: 1.3 }, charge: { prep: 1.05, lock: .65, commit: .16, recover: 1.3 } },
  ventStalker: { attack: { prep: .65, lock: .38, commit: .55, recover: .95 }, charge: { prep: .65, lock: .38, commit: .55, recover: .95 } },
  kilnDrone: { attack: { prep: .95, lock: .65, commit: .08, recover: 1.1 }, charge: { prep: .95, lock: .65, commit: .08, recover: 1.1 } },
};

// palette read off geothermal-monsters-v1.png
const ROCK = 0x5f5753; // basalt: torso, shoulders, upper limbs
const STONE = 0x8a7f77; // the pale weathered stone of the Hulk's forearms and fists
const HOOD = 0x6f6660; // the Hulk's hood
const DARK = 0x34312f; // chest plates, pelvis, feet, iron frames
const RUST = 0xa24a2b; // the stalker's carapace and legs, the drone's body
const RUSTD = 0x7d3a24; // rust patches
const HEAT = 0xffa229;
const TEAL = 0x3f7a76;
const raw = (color: number): THREE.Color => new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace);
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const ease = (v: number): number => { const t = clamp01(v); return t * t * (3 - 2 * t); };
/** 0→1 over [a, b] of t, smoothed */
const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a));
/**
 * The Kiln Drone is a Sentinel-sized flier: its rig is modelled at the
 * concept's proportions and drawn at this scale (it was ~2.2u tall to the
 * stack tops; the Sentinel is ~0.9u). Collider and core band match (enemies.ts
 * TUNING, weapons.ts DRONE_CORE_Y).
 */
export const DRONE_SCALE = .46;
/** hover height of the drone's centre above the floor (the Sentinel's is ~1.45) */
const DRONE_HOVER = 1.5;

/**
 * Box rigs and attack controllers for the Geothermal Core enemies, modelled on
 * reference/geothermal-monsters-v1.png (silhouette, part layout and the attack
 * tells in its small views). Each rig is jointed so its attack can be posed
 * with a readable wind-up, a fast commit and a recovery.
 */
export class GeothermalMonster {
  // tests and captures read these
  private arms: THREE.Group[] = []; // hulk shoulders (rotation.x raises)
  private legs: THREE.Group[] = []; // hulk hips / stalker 'crawler-leg' groups
  private plates: THREE.Group[] = []; // hulk chest plates / drone shutters
  private elbows: THREE.Group[] = [];
  private knees: THREE.Group[] = [];
  private head: THREE.Group | null = null;
  private torso: THREE.Group | null = null;
  private stacks: THREE.Mesh[] = [];
  private furnace: THREE.Mesh[] = [];
  private glow: THREE.Mesh[] = [];
  private textures: THREE.Texture[] = [];
  private mats = new Map<string, THREE.MeshBasicMaterial>();
  private time = 0;
  private cooldown = .6;
  private hit = false;
  private locked = new THREE.Vector3(0, 0, -1);
  private aim = new THREE.Vector3(0, 0, -1);
  private jink = 0;
  private jinkSign = 1;
  private ground = false;
  private stride = 0;
  /** distance walked, drives the gaits */
  private walked = 0;
  /** seconds since the stalker touched down (landing squash) */
  private landed = 9;
  private wasGround = true;
  private ring: THREE.Mesh | null = null;
  /** walkers that end up in a trench: the floor cell they climb out onto */
  private exit: { x: number; z: number } | null = null;
  private exitAge = 0;
  /** seconds left of a climb-out hop (horizontal drive held through it) */
  private climb = 0;
  private climbX = 0;
  private climbZ = 0;
  private stone: THREE.CanvasTexture;
  private heat: THREE.CanvasTexture;

  constructor(private e: Enemy, private body: THREE.Group, readonly kind: GeothermalKind) {
    this.stone = this.texture(false); this.heat = this.texture(true);
    body.name = kind;
    e.mesh.userData.monsterName = kind === 'cinderHulk' ? 'CINDER HULK' : kind === 'ventStalker' ? 'VENT STALKER' : 'KILN DRONE';
    if (kind === 'cinderHulk') this.buildHulk();
    else if (kind === 'ventStalker') this.buildStalker();
    else this.buildDrone();
  }

  private texture(heat: boolean): THREE.CanvasTexture {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const noise = Math.abs(Math.sin(Math.floor(x / 2) * 17 + Math.floor(y / 2) * 71));
      const wear = (x >= 3 && x < 6 && y >= 4 && y < 7) || (x >= 11 && x < 14 && y >= 10 && y < 13);
      const gray = 224 + Math.floor(noise * 15);
      ctx.fillStyle = heat ? (noise > .72 ? '#fff6b0' : noise > .35 ? '#ffc95d' : '#e96b20') : wear ? '#b6a59a' : `rgb(${gray},${gray},${gray})`;
      ctx.fillRect(x, y, 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas); tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.NoColorSpace; this.textures.push(tex); return tex;
  }

  private part(parent: THREE.Object3D, name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: number, bright = false): THREE.Mesh {
    const flat = bright && /eye|slit|seam|band/.test(name);
    const key = `${color}:${bright}:${flat}`;
    if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshBasicMaterial({ color: raw(color), map: flat ? null : bright ? this.heat : this.stone, vertexColors: true, fog: true }));
    const geo = new THREE.BoxGeometry(w, h, d), colors = new Float32Array(geo.attributes.position.count * 3);
    const shade = bright ? [1, 1, 1, 1, 1, 1] : [.75, .9, 1, .48, .66, .94];
    for (let i = 0; i < geo.attributes.position.count; i++) colors.fill(shade[Math.floor(i / 4)], i * 3, i * 3 + 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, this.mats.get(key)!); mesh.name = name; mesh.position.set(x, y, z);
    mesh.userData.baseColor = raw(color); mesh.userData.fullBright = bright; parent.add(mesh);
    if (bright) this.glow.push(mesh); return mesh;
  }

  private joint(parent: THREE.Object3D, name: string, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g;
  }

  /*
   * CINDER HULK — hunched basalt gorilla (feet at y = -1.35, front -Z): huge
   * shoulder blocks on the torso with glowing seams under them, a small
   * hooded head sunk between them, long arms ending in pale stone fists that
   * nearly touch the floor, chest plates over a hot core (a strip glows even
   * when closed), short bent legs in a wide stance with glowing knees.
   */
  private buildHulk(): void {
    const p = this.part.bind(this), b = this.body;
    const torso = this.joint(b, 'hulk-torso', 0, -.2, .02); this.torso = torso; // waist pivot
    const T = (y: number): number => y + .2; // torso-space y from body y
    p(b, 'pelvis', 0, -.14, .05, .78, .3, .58, DARK);
    p(torso, 'belly', 0, T(.12), .02, .86, .32, .62, ROCK);
    p(torso, 'basalt-torso', 0, T(.44), 0, .94, .64, .68, ROCK);
    p(torso, 'hot-chest-core', 0, T(.44), -.33, .52, .56, .06, HEAT, true);
    p(torso, 'upper-back', 0, T(.8), .14, 1.0, .32, .5, ROCK);
    for (const side of [-1, 1]) {
      // chest plates hinge on their outer edge: closed they leave a hot strip
      // between them, open they swing out and bare the whole core
      const plate = this.joint(torso, 'chest-plate', side * .48, T(.44), -.36); this.plates.push(plate);
      p(plate, 'chest-stone-slab', -side * .18, 0, -.03, .36, .62, .14, DARK);
      // the shoulder block rides the torso; the arm swings inside it
      p(torso, 'stepped-shoulder-armor', side * .72, T(.86), .02, .66, .6, .7, ROCK);
      p(torso, 'shoulder-rust', side * .72, T(1.0), -.355, .4, .2, .02, RUSTD);
      p(torso, 'shoulder-heat-seam', side * .72, T(.52), .02, .52, .08, .58, HEAT, true);
      const arm = this.joint(torso, 'hammer-shoulder', side * .74, T(.62), .02); this.arms.push(arm);
      p(arm, 'upper-arm', 0, -.25, 0, .4, .5, .44, ROCK);
      const elbow = this.joint(arm, 'elbow', 0, -.5, 0); this.elbows.push(elbow);
      p(elbow, 'elbow-heat-seam', 0, -.02, 0, .38, .08, .42, HEAT, true);
      p(elbow, 'hammer-forearm', 0, -.32, -.02, .6, .56, .6, STONE);
      p(elbow, 'forearm-rust', side * .301, -.36, -.06, .02, .26, .3, RUSTD);
      p(elbow, 'massive-hammer-fist', 0, -.88, -.05, .74, .62, .72, STONE);
      p(elbow, 'fist-rust-band', 0, -.78, -.415, .5, .18, .02, RUSTD);
      // legs: short and heavy, knees glowing
      const hip = this.joint(b, 'heavy-leg', side * .3, -.2, .06); this.legs.push(hip);
      p(hip, 'thigh', 0, -.22, 0, .46, .46, .5, ROCK);
      const knee = this.joint(hip, 'knee', 0, -.46, 0); this.knees.push(knee);
      p(knee, 'knee-heat-seam', 0, 0, -.01, .42, .09, .46, HEAT, true);
      p(knee, 'shin', 0, -.3, .02, .44, .5, .48, ROCK);
      p(knee, 'square-foot', 0, -.56, -.1, .54, .27, .66, DARK);
    }
    // the small hooded head, sunk low between the shoulders
    const head = this.joint(torso, 'hulk-head', 0, T(.84), -.14); this.head = head;
    p(head, 'hood', 0, .2, 0, .56, .48, .56, HOOD);
    p(head, 'brow', 0, .33, -.27, .6, .1, .1, ROCK);
    p(head, 'face-recess', 0, .15, -.27, .42, .2, .04, DARK);
    p(head, 'single-eye-slit', 0, .16, -.295, .26, .06, .03, HEAT, true);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.95, 2.05, 24), new THREE.MeshBasicMaterial({ color: raw(0xffbd48), transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide }));
    ring.name = 'slam-warning-ring'; ring.rotation.x = -Math.PI / 2; ring.position.set(0, -this.e.half.y + .025, -1.5); ring.visible = false;
    ring.userData.fullBright = true; ring.userData.baseColor = raw(0xffbd48);
    this.e.mesh.add(ring); this.ring = ring;
  }

  /*
   * VENT STALKER — low four-legged ambusher (feet at y = -0.43): a flat rust
   * carapace under raised basalt back slabs split by a glowing seam, a wide
   * stone head plate with two amber eyes low on its face, and four thick rust
   * legs that arch HIGH above the back (knees above the slabs) and come down
   * to dark block feet, front pair reaching forward, rear pair back.
   */
  private buildStalker(): void {
    const p = this.part.bind(this), b = this.body; this.e.half.z = .78;
    p(b, 'low-rust-body', 0, .02, .1, .8, .3, .95, RUST);
    p(b, 'dark-underbody', 0, -.15, .1, .6, .12, .8, DARK);
    p(b, 'back-heat-channel', 0, .22, .1, .09, .14, .9, HEAT, true);
    p(b, 'basalt-back-slab', -.22, .27, .08, .34, .2, .9, ROCK);
    p(b, 'basalt-back-slab', .22, .27, .14, .34, .2, .8, ROCK);
    p(b, 'basalt-back-slab', 0, .3, .48, .74, .16, .26, ROCK);
    p(b, 'flat-predator-head', 0, -.01, -.55, .8, .26, .42, ROCK);
    p(b, 'dark-face', 0, -.05, -.765, .64, .14, .03, DARK);
    for (const side of [-1, 1]) p(b, 'amber-eye', side * .17, -.05, -.78, .13, .07, .03, HEAT, true);
    // legs: hip (a 'crawler-leg' group, tilted up and out) → upper bone →
    // knee (high) → lower bone down to the floor → block foot
    for (const [z, front] of [[-.3, true], [.48, false]] as const) for (const side of [-1, 1]) {
      const leg = this.joint(b, 'crawler-leg', side * .4, .06, z); this.legs.push(leg);
      leg.userData.side = side; leg.userData.front = front;
      p(leg, 'angular-upper-leg', 0, .26, 0, .3, .56, .32, RUST);
      const knee = this.joint(leg, 'stalker-knee', 0, .54, 0); this.knees.push(knee);
      p(knee, 'knee-block', 0, 0, 0, .26, .24, .26, DARK);
      p(knee, 'lower-leg', 0, -.42, 0, .26, .78, .28, RUST);
      p(knee, 'square-hook-foot', 0, -.86, -.03, .32, .18, .38, DARK);
    }
  }

  /*
   * KILN DRONE — a floating furnace (halfY 0.87): a squarish rust body boxed
   * in dark iron, a visor overhanging a sensor slit, a framed furnace window
   * filling its lower front, tall teal shutters along both sides (hinged at
   * the front edge, swung open to fire), dark brackets at the front corners,
   * three exhaust stacks on top stepping down in height, and a hot hover vent.
   */
  private buildDrone(): void {
    const p = this.part.bind(this), b = this.body;
    b.scale.setScalar(DRONE_SCALE);
    p(b, 'vertical-furnace-body', 0, 0, 0, .86, 1.34, .7, RUST);
    p(b, 'body-rust', .2, .45, -.355, .3, .2, .02, RUSTD);
    p(b, 'top-steel-crossbar', 0, .72, 0, .98, .14, .8, DARK);
    p(b, 'visor-overhang', 0, .44, -.39, .7, .1, .14, DARK);
    p(b, 'sensor-recess', 0, .31, -.37, .62, .14, .06, DARK);
    p(b, 'single-sensor-slit', 0, .31, -.405, .34, .06, .03, HEAT, true);
    p(b, 'front-dark-frame', 0, .2, -.38, .74, .1, .1, DARK); // lintel
    for (const side of [-1, 1]) p(b, 'frame-post', side * .31, -.2, -.38, .12, .8, .1, DARK);
    p(b, 'frame-sill', 0, -.6, -.39, .74, .12, .12, DARK);
    this.furnace.push(p(b, 'molten-furnace-aperture', 0, -.2, -.4, .5, .68, .04, HEAT, true));
    p(b, 'lower-steel-crossbar', 0, -.74, 0, .78, .14, .66, DARK);
    p(b, 'hover-nub', 0, -.86, 0, .4, .1, .36, DARK);
    this.furnace.push(p(b, 'hover-heat', 0, -.93, 0, .3, .04, .26, HEAT, true));
    // exhaust stacks, stepping down: they're direct children (tests count them)
    const heights = [.44, .36, .28];
    heights.forEach((h, i) => {
      const x = .28 - i * .28;
      this.stacks.push(p(b, 'square-exhaust-stack', x, .79 + h / 2, .08, .2, h, .22, DARK));
      p(b, 'hot-exhaust-band', x, .79 + h - .08, .08, .21, .06, .23, HEAT, true);
      p(b, 'stack-cap', x, .79 + h + .02, .08, .22, .05, .24, DARK);
    });
    for (const side of [-1, 1]) {
      // shutter along the side, hinged at its front edge: opening swings the
      // back end out (both open = the firing stance in the concept)
      const shutter = this.joint(b, 'hinged-teal-shutter', side * .45, 0, -.32); this.plates.push(shutter);
      p(shutter, 'teal-shutter-panel', side * .07, 0, .32, .14, 1.22, .66, TEAL);
      p(shutter, 'shutter-rust-patch', side * .145, -.3, .45, .02, .3, .22, RUSTD);
      p(shutter, 'shutter-rust-patch', side * .145, .32, .18, .02, .18, .14, RUSTD);
      for (const y of [-.42, .42]) p(b, 'square-hinge', side * .47, y, -.36, .16, .18, .16, DARK);
    }
  }

  /** Pose for the current state; shared with the render capture and network puppet path. */
  pose(dt: number): void {
    this.time += dt;
    if (this.kind === 'cinderHulk') this.poseHulk(dt);
    else if (this.kind === 'ventStalker') this.poseStalker(dt);
    else this.poseDrone();
  }

  private attackT(): { phase: 'none' | 'prep' | 'strike' | 'move' | 'recover'; t: number } {
    const e = this.e;
    const attacking = e.state === 'attack' || e.state === 'charge';
    if (!attacking) return { phase: 'none', t: 0 };
    return { phase: e.phase, t: e.phaseT };
  }

  private glowAll(k: number): void {
    for (const mesh of this.glow) {
      const color = mesh.userData.baseColor as THREE.Color;
      (mesh.material as THREE.MeshBasicMaterial).color.copy(color).multiplyScalar(k);
    }
  }

  /*
   * Hulk poses. Rest: hunched, fists hanging forward near the floor.
   * Walk: a heavy knuckle-walker's sway — legs step, arms swing opposite.
   * Slam: dip → fists swung overhead in a wide squat (plates open) → hang →
   * a fast downswing to the floor in front → fists planted → push back up.
   */
  private poseHulk(dt: number): void {
    const e = this.e, s = GEO_SCHEDULE.cinderHulk.attack;
    const { phase, t } = this.attackT();
    const speed = Math.hypot(e.vel.x, e.vel.z);
    this.walked += speed * dt;
    const g = this.walked * 3.2; // ~one stride per 2u
    const w = phase === 'none' ? Math.min(1, speed / 1.2) : 0;
    const sw = Math.sin(g) * w;

    // channels
    let raise = 0; // 0 = fists down, 1 = fists overhead
    let slamDown = 0; // 0..1 the downswing to the floor in front
    let lean = .22; // torso pitch, + = forward
    let squat = 0; // knees bent / hips lowered
    let open = 0; // chest plates
    let heat = 1; // glow multiplier
    let shake = 0;
    if (phase === 'prep') {
      const dip = span(t, 0, .2) * (1 - span(t, .2, .45)); // a quick anticipation dip
      raise = span(t, .2, .85);
      lean = .22 + dip * .18 - raise * .52; // lean in, then rear back
      squat = dip * .6 + raise * .7;
      open = span(t, .25, .7);
      heat = 1 + raise * 1.2;
      shake = span(t, .85, s.prep) * .03; // the hang trembles
    } else if (phase === 'strike') {
      const k = clamp01(t / s.commit);
      const a = k * k; // accelerating downswing
      raise = 1 - a;
      slamDown = a;
      lean = -.3 + a * 1.02; // from reared back to pitched right over the fists
      squat = .7 + a * .3;
      open = 1;
      heat = 2.2;
    } else if (phase === 'recover') {
      const up = span(t, .55, s.recover); // fists stay planted, then rise
      slamDown = 1 - up;
      lean = .72 - up * .5;
      squat = 1 - up;
      open = 1 - span(t, s.recover - .35, s.recover);
      heat = 2 - up;
      shake = (1 - span(t, 0, .25)) * .04; // the impact shudder
    }

    // arms: hanging wide and forward (the knuckle-walker's rest), overhead
    // with the elbows bent so the fists sit just above the head (the concept's
    // tell), and slammed: nearly straight down from a torso pitched right over,
    // so the fists land on the floor ~1.5u in front
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      const walk = (i === 0 ? -1 : 1) * sw * .35;
      const rest = .32 + walk;
      const up = rest + (2.5 - rest) * raise;
      arm.rotation.x = up + (.08 - up) * slamDown;
      arm.rotation.z = side * (.3 + raise * .1 - slamDown * .14);
      this.elbows[i].rotation.x = (-.12 - raise * .58) * (1 - slamDown);
    });
    // legs: wide, knees flexed by `squat`; walk steps
    this.legs.forEach((hip, i) => {
      const side = i === 0 ? -1 : 1;
      const step = (i === 0 ? 1 : -1) * sw * .4;
      hip.rotation.x = .15 + squat * .45 + step;
      hip.rotation.z = side * (.1 + squat * .14);
      this.knees[i].rotation.x = -.25 - squat * .8 - Math.max(0, -step) * .6;
    });
    // body: drop with the squat so the feet stay planted; walking bob
    this.body.position.y = -squat * .22 + Math.abs(Math.cos(g)) * .05 * w;
    this.body.position.x = (Math.random() - .5) * shake;
    this.torso!.rotation.x = lean;
    this.torso!.rotation.y = sw * .1;
    this.head!.rotation.x = -lean * .6; // eyes stay on the target
    this.plates.forEach((plate, i) => { plate.rotation.y = (i === 0 ? -1 : 1) * open * 1.05; });
    e.coreOpen = phase !== 'none' && open > .35;
    if (this.ring) {
      this.ring.visible = phase === 'prep' || phase === 'strike';
      const m = this.ring.material as THREE.MeshBasicMaterial;
      m.opacity = phase === 'prep' ? .45 + .4 * Math.abs(Math.sin(t * 9)) : .9;
    }
    this.glowAll(heat);
  }

  /*
   * Stalker poses. Rest: legs arched, body level. Walk: diagonal pairs lift
   * and swing. Leap: crouch + coil (body sinks and draws back, the back seam
   * flares, a tremble) → launch with the front legs thrown forward and the rear
   * legs kicked back → a landing squash → recovery.
   */
  private poseStalker(dt: number): void {
    const e = this.e, s = GEO_SCHEDULE.ventStalker.attack;
    const { phase, t } = this.attackT();
    if (this.ground && !this.wasGround) this.landed = 0;
    this.wasGround = this.ground;
    this.landed += dt;
    const speed = Math.hypot(e.vel.x, e.vel.z);
    this.walked += speed * dt;
    const g = this.walked * 5;
    const w = phase === 'none' ? Math.min(1, speed / 2) : 0;

    let crouch = 0, reach = 0, pitch = 0, heat = 1, tremble = 0;
    if (phase === 'prep') {
      crouch = span(t, 0, .45);
      heat = 1 + crouch * 1.5;
      tremble = span(t, .4, s.prep) * .025;
      pitch = -crouch * .14; // nose down, haunches up
    } else if (phase === 'move') {
      reach = 1;
      pitch = .38 - clamp01(t / s.commit) * .45; // nose up off the launch, levelling out
      heat = 2;
    } else if (phase === 'recover') {
      reach = 1 - span(t, 0, .2);
      const squash = Math.max(0, 1 - this.landed / .2);
      crouch = squash * .7 + (1 - span(t, .2, s.recover)) * .25;
      heat = 1.5 - span(t, 0, s.recover) * .5;
    }
    const breathe = Math.sin(this.time * 2.2) * .015 * (phase === 'none' ? 1 : 0);
    this.body.position.y = -crouch * .24 + breathe + Math.abs(Math.sin(g)) * .03 * w;
    this.body.position.z = crouch * .14;
    this.body.position.x = (Math.random() - .5) * tremble;
    this.body.rotation.x = pitch;
    this.legs.forEach((leg, i) => {
      const side = leg.userData.side as number, front = leg.userData.front as boolean;
      // diagonal pairs: front-left with rear-right
      const pair = (side < 0) === front ? 0 : Math.PI;
      const lift = Math.max(0, Math.sin(g + pair)) * w;
      const swing = Math.cos(g + pair) * w;
      // rest: tilted up and out (knee high), front legs forward, rear back
      const fz = front ? -1 : 1;
      // crouch: knees climb and splay as the body sinks; leap: the front legs
      // are thrown forward and the rear legs kick back, the lower bones swing
      // out straight
      leg.rotation.z = -side * (.72 + crouch * .5 + lift * .18 - reach * .2);
      leg.rotation.x = fz * (.4 + reach * .75) + swing * .25 * fz;
      const knee = this.knees[i];
      // the lower bone hangs back down to the floor whatever the hip does
      knee.rotation.z = side * (1.08 + crouch * .8 + lift * .3 - reach * .5);
      knee.rotation.x = -leg.rotation.x * (1 - reach * .7) + fz * reach * .45;
    });
    this.glowAll(heat);
    e.coreOpen = false;
  }

  /*
   * Drone poses. Hover bob and a lean into its travel. Shot: the shutters swing
   * open, the furnace and stacks stoke up, a shake before it fires → recoil
   * (kicked back and nose-up) → the glow cools and the shutters close.
   */
  private poseDrone(): void {
    const e = this.e, s = GEO_SCHEDULE.kilnDrone.attack;
    const { phase, t } = this.attackT();
    let open = 0, stoke = 0, kick = 0, shake = 0;
    if (phase === 'prep') {
      open = span(t, 0, .45);
      stoke = span(t, .2, s.prep);
      shake = span(t, .7, s.prep) * .03;
    } else if (phase === 'recover' || phase === 'strike') {
      const r = phase === 'recover' ? t : 0;
      open = 1 - span(r, s.recover - .45, s.recover);
      stoke = 1 - span(r, 0, .6);
      kick = Math.max(0, 1 - r / .35);
    }
    // lean into travel (local space: the mesh faces its target)
    const yaw = e.mesh.rotation.y;
    const lx = e.vel.x * Math.cos(yaw) - e.vel.z * Math.sin(yaw);
    const lz = e.vel.x * Math.sin(yaw) + e.vel.z * Math.cos(yaw);
    this.body.rotation.x = lz * .05 - kick * .22;
    this.body.rotation.z = -lx * .05;
    this.body.position.z = kick * .25 * DRONE_SCALE;
    this.body.position.x = (Math.random() - .5) * shake * DRONE_SCALE;
    this.body.position.y = Math.sin(this.time * 2.4) * .04 * DRONE_SCALE;
    this.plates.forEach((plate, i) => { plate.rotation.y = (i === 0 ? -1 : 1) * open * 1.15; });
    // furnace + stack glow: a flicker at rest, white-hot as it stokes
    const flicker = .9 + Math.sin(this.time * 13) * .06 + Math.sin(this.time * 7.3) * .04;
    for (const m of this.glow) {
      const color = m.userData.baseColor as THREE.Color;
      const k = this.furnace.includes(m) ? flicker * (1 + stoke * 1.4) : 1 + stoke * .5;
      (m.material as THREE.MeshBasicMaterial).color.copy(color).multiplyScalar(k);
    }
    this.stacks.forEach((st, i) => { st.scale.y = 1 + Math.max(0, Math.sin(this.time * 9 + i * 2)) * .03 * (1 + stoke); });
    e.coreOpen = phase !== 'none' && (phase !== 'prep' || t / s.prep > .32);
  }

  update(dt: number, game: Game, target: PlayerTarget): void {
    const e = this.e, schedule = GEO_SCHEDULE[this.kind].attack;
    this.cooldown = Math.max(0, this.cooldown - dt); this.jink = Math.max(0, this.jink - dt);
    const dx = target.pos.x - e.pos.x, dz = target.pos.z - e.pos.z, dist = Math.hypot(dx, dz) || .001;
    const los = game.hasLOS(e.pos.x, e.pos.y + .1, e.pos.z, target.pos.x, target.pos.y, target.pos.z);
    let attacking = e.state === 'attack' || e.state === 'charge';
    // a walker whose feet are below the floor line is in a trench (sector 6's
    // lava channels): knocked or leapt in, it has no jump of its own
    const inPit = this.kind !== 'kilnDrone' && this.ground && e.pos.y - e.half.y < .95 &&
      !(e.state === 'charge' && e.phase === 'move');
    if (inPit && attacking) { e.state = 'chase'; e.phaseT = 0; e.coreOpen = false; attacking = false; }
    if (!e.awake || target.dead || e.state === 'pain') {
      e.vel.x *= Math.exp(-9 * dt); e.vel.z *= Math.exp(-9 * dt);
      if (e.state === 'pain') { e.coreOpen = false; this.cooldown = Math.max(this.cooldown, .8); }
    } else if (attacking) {
      e.phaseT += dt;
      e.vel.x *= Math.exp(-12 * dt); e.vel.z *= Math.exp(-12 * dt);
      if (e.phase === 'prep') {
        if (e.phaseT < schedule.lock) {
          this.locked.set(dx / dist, 0, dz / dist);
          this.aim.set(dx, target.pos.y - e.pos.y, dz).normalize();
        }
        if (e.phaseT >= schedule.prep) {
          this.hit = false; e.phaseT = 0;
          if (this.kind === 'ventStalker') { e.phase = 'move'; e.vel.y = 5.5; game.audio.play('huskBite', e.pos); }
          else if (this.kind === 'cinderHulk') { e.phase = 'strike'; game.audio.play('meleeSwing', e.pos); } // the downswing
          else { e.phase = 'recover'; this.strike(game); }
        }
      } else if (e.phase === 'strike') {
        // the Hulk's fists come down; the slam lands at the impact frame
        if (e.phaseT >= schedule.commit) { e.phase = 'recover'; e.phaseT = 0; this.strike(game); }
      } else if (e.phase === 'move') {
        e.vel.x = this.locked.x * 9.5; e.vel.z = this.locked.z * 9.5;
        // a leap stops at a ledge rather than carrying over it into a trench
        if (this.dropAhead(game, this.locked.x, this.locked.z, .2)) { e.vel.x = e.vel.z = 0; e.phase = 'recover'; e.phaseT = 0; }
        if (e.phaseT >= schedule.commit) { e.phase = 'recover'; e.phaseT = 0; }
      } else if (e.phase === 'recover' && e.phaseT >= schedule.recover) {
        e.state = 'chase'; e.phaseT = 0; e.coreOpen = false; this.cooldown = this.kind === 'kilnDrone' ? .8 : 1.15;
      }
    } else {
      const range = this.kind === 'cinderHulk' ? 3.5 : this.kind === 'ventStalker' ? 6.5 : 15;
      if (!inPit && los && dist < range && dist > (this.kind === 'kilnDrone' ? 3 : 0) && this.cooldown === 0 && (this.kind !== 'ventStalker' || this.ground)) {
        e.state = this.kind === 'ventStalker' ? 'charge' : 'attack'; e.phase = 'prep'; e.phaseT = 0; this.hit = false;
        this.locked.set(dx / dist, 0, dz / dist); this.aim.set(dx, target.pos.y - e.pos.y, dz).normalize();
        game.audio.play(this.kind === 'cinderHulk' ? 'bruteRoar' : this.kind === 'ventStalker' ? 'huskGrowl' : 'sentinelAlert', e.pos);
      } else if (inPit) {
        // in a trench: walk to the nearest way out and hop up onto it
        this.exitAge -= dt;
        if (!this.exit || this.exitAge <= 0) { this.exit = this.findExit(game); this.exitAge = 1; }
        if (this.exit) {
          const ex = this.exit.x - e.pos.x, ez = this.exit.z - e.pos.z, ed = Math.hypot(ex, ez) || .001;
          if (ed < e.half.x + .9 && this.ground) {
            this.climb = .55; this.climbX = ex / ed; this.climbZ = ez / ed;
            e.vel.y = 7.8; // ~1.27u: clears the one-block step with room to spare
          } else {
            const blend = 1 - Math.exp(-8 * dt);
            e.vel.x += (ex / ed * e.tuning.speed - e.vel.x) * blend; e.vel.z += (ez / ed * e.tuning.speed - e.vel.z) * blend;
          }
        }
      } else {
        let nx = dx / dist, nz = dz / dist, speed = e.tuning.speed;
        // Survival: around the arena's cover by the flow field
        const via = e.navAround(dt, target, game);
        if (via) { nx = via[0]; nz = via[1]; }
        if (this.kind === 'kilnDrone' && los && dist < 8) { nx = -nx; nz = -nz; speed *= .6; }
        if (this.jink > 0) { const old = nx; nx = -nz * this.jinkSign; nz = old * this.jinkSign; }
        // walkers never step off a ledge: turn along it, or hold at the edge
        if (this.kind !== 'kilnDrone' && this.ground && this.dropAhead(game, nx, nz, .35)) {
          const lx = -nz * this.jinkSign, lz = nx * this.jinkSign;
          if (!this.dropAhead(game, lx, lz, .35)) { nx = lx; nz = lz; }
          else if (!this.dropAhead(game, -lx, -lz, .35)) { nx = -lx; nz = -lz; this.jinkSign *= -1; }
          else speed = 0;
        }
        const blend = 1 - Math.exp(-8 * dt);
        e.vel.x += (nx * speed - e.vel.x) * blend; e.vel.z += (nz * speed - e.vel.z) * blend;
      }
    }
    if (this.climb > 0) {
      // the hop keeps driving onto the ledge (a wall contact zeroes velocity)
      this.climb -= dt;
      e.vel.x = this.climbX * 3.2; e.vel.z = this.climbZ * 3.2;
      if (this.climb <= 0) this.exit = null;
    }
    // A grounded stalker must have room to launch, never start another leap in midair.
    if (this.kind === 'kilnDrone') {
      let floor = 1;
      for (let y = Math.floor(e.pos.y - e.half.y); y >= 0; y--) if (game.world.isSolid(Math.floor(e.pos.x), y, Math.floor(e.pos.z))) { floor = y + 1; break; }
      e.vel.y += (floor + DRONE_HOVER + Math.sin(this.time * 2) * .1 - e.pos.y) * 8 * dt - e.vel.y * 4 * dt;
    } else e.vel.y -= 24 * dt;
    const moving = e.state === 'charge' && e.phase === 'move';
    const sub = Math.max(1, Math.ceil(Math.hypot(e.vel.x, e.vel.z) * dt / .22));
    for (let i = 0; i < sub; i++) {
      const result = moveBody(game.world, e.pos, e.half, e.vel, dt / sub, game.solidBoxes()); this.ground = result.onGround;
      if (moving) {
        if (result.hitX || result.hitZ) { e.phase = 'recover'; e.phaseT = 0; break; }
        if (!this.hit) for (const player of game.playerTargets()) {
          if (player.dead || Math.abs(player.pos.y - e.pos.y) > player.half.y + e.half.y) continue;
          if (Math.hypot(player.pos.x - e.pos.x, player.pos.z - e.pos.z) < e.half.x + player.half.x + .3 && game.hasLOS(e.pos.x, e.pos.y, e.pos.z, player.pos.x, player.pos.y, player.pos.z)) {
            player.damage(14, game, { x: e.pos.x, z: e.pos.z, by: e.kind }); this.hit = true; e.phase = 'recover'; e.phaseT = 0; break;
          }
        }
      } else if (result.hitX || result.hitZ) {
        if (this.jink === 0) this.jinkSign *= -1; this.jink = .55;
      }
    }
    if (this.ground && this.kind !== 'kilnDrone') { e.vel.x *= Math.exp(-2 * dt); e.vel.z *= Math.exp(-2 * dt); }
    if (this.kind === 'cinderHulk' && this.ground && !attacking) {
      this.stride += Math.hypot(e.vel.x, e.vel.z) * dt;
      if (this.stride > 1.2) { this.stride = 0; game.audio.play('bruteStep', e.pos); }
    }
    const fx = attacking ? this.locked.x : dx / dist, fz = attacking ? this.locked.z : dz / dist;
    if (e.awake) {
      const yaw = Math.atan2(-fx, -fz), delta = Math.atan2(Math.sin(yaw - e.mesh.rotation.y), Math.cos(yaw - e.mesh.rotation.y));
      e.mesh.rotation.y += delta * (1 - Math.exp(-12 * dt));
    }
    this.pose(dt);
  }

  /**
   * Is there a drop just ahead (direction nx, nz, `reach` past the body's
   * edge)? A drop = no solid voxel under the feet's level there.
   */
  private dropAhead(game: Game, nx: number, nz: number, reach: number): boolean {
    const e = this.e;
    const feet = e.pos.y - e.half.y;
    if (feet < .95) return false; // already down: not a ledge question
    const d = e.half.x + reach;
    const x = Math.floor(e.pos.x + nx * d), z = Math.floor(e.pos.z + nz * d);
    const under = Math.floor(feet - .5);
    return !game.world.isSolid(x, under, z) && !game.world.isSolid(x, under - 1, z);
  }

  /** the nearest floor cell beside the trench with headroom: the way out */
  private findExit(game: Game): { x: number; z: number } | null {
    const e = this.e, w = game.world;
    const cx = Math.floor(e.pos.x), cz = Math.floor(e.pos.z);
    const lvl = Math.floor(e.pos.y - e.half.y + .05); // the trench floor cell's y + 1
    let best: { x: number; z: number } | null = null, bestD = Infinity;
    for (let dz = -12; dz <= 12; dz++) for (let dx = -12; dx <= 12; dx++) {
      const x = cx + dx, z = cz + dz;
      // a floor one step up: solid at the trench's floor level, air above
      if (!w.isSolid(x, lvl, z) || w.isSolid(x, lvl + 1, z) || w.isSolid(x, lvl + 2, z)) continue;
      // ...right beside an open trench cell (no curb over it)
      let beside = false;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!w.isSolid(x + ax, lvl, z + az) && !w.isSolid(x + ax, lvl + 1, z + az) && w.isSolid(x + ax, lvl - 1, z + az)) beside = true;
      }
      if (!beside) continue;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = { x: x + .5, z: z + .5 }; }
    }
    return best;
  }

  private strike(game: Game): void {
    const e = this.e;
    if (this.kind === 'kilnDrone') {
      const x = e.pos.x + this.aim.x * .5, y = e.pos.y + this.aim.y * .5, z = e.pos.z + this.aim.z * .5;
      if (game.hasLOS(e.pos.x, e.pos.y, e.pos.z, x, y, z)) game.projectiles.spawn('slag', x, y, z, this.aim.x, this.aim.y, this.aim.z, 9.5, false);
      game.audio.play('rocketLaunch', e.pos);
      game.dynLights.flash(x, y, z, 1, .55, .1, 1.4, 5, .18); // the muzzle flare
    } else {
      const x = e.pos.x + this.locked.x * 1.5, z = e.pos.z + this.locked.z * 1.5, floor = e.pos.y - e.half.y;
      game.audio.play('bruteSlam', e.pos); game.particles.debris(x, floor + .12, z, .55, .3, .1, 18);
      game.dynLights.flash(x, floor + .3, z, 1, .4, .05, 1.6, 6, .3);
      for (const player of game.playerTargets()) {
        const near = Math.hypot(player.pos.x - x, player.pos.z - z);
        if (!player.dead && near < 2 && player.pos.y - player.half.y < floor + .5 && Math.abs(player.pos.y - e.pos.y) < 2 &&
          game.hasLOS(e.pos.x, e.pos.y, e.pos.z, player.pos.x, player.pos.y, player.pos.z)) player.damage(24, game, { x: e.pos.x, z: e.pos.z, by: e.kind });
        // the floor jolt carries further than the damage
        if (!player.dead && near < 6) player.shake = Math.min(.7, player.shake + .35 * (1 - near / 6));
      }
    }
  }

  dispose(): void { this.textures.forEach((t) => t.dispose()); }
}
