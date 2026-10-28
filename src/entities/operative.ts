import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { WeaponId } from '../types';

/**
 * The Facility Operative — the main character, built box by box to match the
 * concept sheet `reference/main-character-facility-operative.png`.
 *
 * Measurements come from the sheet itself (417.6 px per world unit), not the
 * notes' simplified 26-box table, which the owner asked to override where
 * the two disagree: the visor sits in a dark frame, the back spine rises to
 * helmet height like an antenna, the boots are a two-step ankle + foot, the
 * forearm guards carry an elbow tab, and the knees are a light band seen
 * from front and back.
 *
 * Units match the world: Y up, feet at Y = 0, total height 1.76, front is -Z,
 * the character's right is +X (weapon hand). Joint pivots are nested groups:
 * torso (waist) → neck, shoulders → elbows; hips → knees.
 *
 * Colours follow the game's convention (`raw`: hex taken as-is, the renderer
 * outputs linear). Boxes have slightly rounded edges, as on the sheet. Two
 * shading modes: 'lit' (Lambert, for scenes with lights — the character
 * viewer's studio rig) and 'baked' (the default, for the light-less game
 * scene: a per-direction shade baked into vertex colours, like the guns).
 * Either way a shader hash paints sparse pixel scuffs in box-local space,
 * like the sheet's worn plates. Visor and status light are full-bright.
 */

/** palette sampled from the sheet (front-face colour ÷ the front shade) */
export const OPERATIVE_COLORS = {
  lightSteel: 0x6c758c, // helmet, shoulder caps, forearm guards, knees, spine
  steel: 0x4e566b, // torso core, abdomen, pelvis
  darkSteel: 0x3f4659, // chest plate, backpack, thighs, shins
  charcoal: 0x292c36, // respirator, neck, upper arms, gloves, belt, ankles
  sole: 0x22252c, // boot feet
  visorFrame: 0x353c4f,
  cyan: 0x4ae6fe, // visor + chest status light (full-bright)
} as const;

/** the bare head (helmet off): the Facility Survivor note's skin and hair */
export const SURVIVOR_COLORS = {
  skin: 0xb9825f,
  hair: 0x352b29, // also eyes and brows
  mouth: 0x7a4a3a,
} as const;

/** baked shade by normal direction: sides, top, bottom, front/back */
const SHADE_SIDE = 0.8;
const SHADE_TOP = 1.0;
const SHADE_BOTTOM = 0.5;
const SHADE_FRONT = 0.86;
/** edge rounding: the sheet's soft corners, clamped for the tiny parts */
const EDGE_RADIUS = 0.009;

const raw = (hex: number): THREE.Color => new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);

/** sparse pixel scuffs: darker 2×2-ish patches and a few light flecks, in box space */
function addScuffs(m: THREE.Material): void {
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScuff;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvScuff = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vScuff;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec3 fine = floor(vScuff * 46.0 + 0.37);
          vec3 coarse = floor(vScuff * 23.0 + 0.61);
          float hf = fract(sin(dot(fine, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float hc = fract(sin(dot(coarse, vec3(39.346, 11.135, 83.155))) * 24634.6345);
          float k = 1.0;
          if (hc < 0.07 && hf < 0.55) k = 0.86;
          else if (hf < 0.012) k = 1.1;
          diffuseColor.rgb *= k;
        }`,
      );
  };
  m.customProgramCacheKey = () => 'operative-scuff';
}

function roundedBox(w: number, h: number, d: number): THREE.BufferGeometry {
  const r = Math.min(EDGE_RADIUS, Math.min(w, h, d) * 0.3);
  return new RoundedBoxGeometry(w, h, d, 2, r);
}

/** baked mode: shade each vertex by its normal (rounded edges blend the faces) */
function bakeShade(geo: THREE.BufferGeometry): void {
  const nrm = geo.attributes.normal;
  const col = new Float32Array(nrm.count * 3);
  for (let i = 0; i < nrm.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = nrm.getY(i), nz = Math.abs(nrm.getZ(i));
    const sum = nx + Math.abs(ny) + nz || 1;
    const s = (nx * SHADE_SIDE + nz * SHADE_FRONT + (ny > 0 ? ny * SHADE_TOP : -ny * SHADE_BOTTOM)) / sum;
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = s;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export interface OperativeOptions {
  /** 'baked' (default): no lights needed; 'lit': Lambert for a lit scene */
  shading?: 'baked' | 'lit';
  /**
   * The jump lifts the body itself (default). Off when game physics moves
   * the body (first-person play): the jump then only poses the legs.
   */
  jumpLift?: boolean;
}

/** a baked-shaded view-model box (no lights in that pass; the gun's light tick tints it) */
function fpPart(
  g: THREE.Object3D, w: number, h: number, d: number, hex: number,
  x: number, y: number, z: number, scuff = true,
): void {
  const geo = roundedBox(w, h, d);
  bakeShade(geo);
  const m = new THREE.MeshBasicMaterial({ color: raw(hex), vertexColors: true, fog: false });
  if (scuff) addScuffs(m);
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.userData.baseColor = raw(hex);
  mesh.userData.glow = false;
  g.add(mesh);
}

/**
 * Bake first-person hands / forearms: every part under `groups` merges into
 * ONE mesh under `parent` (same pose, parent space), colour moved into vertex
 * colours (part colour × face shade), one white scuffed material — so the view
 * model's light tick still tints it through `material.color`. A jointed glove
 * is dozens of parts; unbaked, two hands cost more draws than the gun.
 */
export function bakeFirstPerson(parent: THREE.Object3D, groups: THREE.Object3D[]): THREE.Mesh | null {
  parent.updateMatrixWorld(true);
  const toParent = new THREE.Matrix4().copy(parent.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const geos: THREE.BufferGeometry[] = [];
  const parts: THREE.Mesh[] = [];
  for (const g of groups) {
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !o.visible) return;
      parts.push(o);
      const src = o.geometry as THREE.BufferGeometry;
      const geo = src.index ? src.toNonIndexed() : src.clone();
      geo.deleteAttribute('normal');
      geo.deleteAttribute('uv');
      const base = (o.userData.baseColor as THREE.Color | undefined) ?? new THREE.Color(1, 1, 1);
      const shade = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
      const n = geo.attributes.position.count, col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = shade ? shade.getX(i) : 1;
        col[i * 3] = base.r * s; col[i * 3 + 1] = base.g * s; col[i * 3 + 2] = base.b * s;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.applyMatrix4(rel.multiplyMatrices(toParent, o.matrixWorld));
      geos.push(geo);
    });
  }
  for (const g of groups) g.removeFromParent();
  for (const p of parts) { p.geometry.dispose(); (p.material as THREE.Material).dispose(); }
  if (!geos.length) return null;
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false });
  addScuffs(mat);
  const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
  for (const g of geos) g.dispose();
  mesh.name = 'fp-arms';
  mesh.userData.baseColor = new THREE.Color(1, 1, 1);
  mesh.userData.glow = false;
  parent.add(mesh);
  return mesh;
}

/**
 * One first-person forearm: wrist cuff, forearm guard, elbow tab and the
 * start of the sleeve. Its origin sits on the hand (see
 * buildFirstPersonHand) and the forearm runs up local +Y; local -Z is the
 * guard's face (the side the elbow tab sits behind). `side` +1 = right arm.
 */
export function buildFirstPersonArm(side: 1 | -1): THREE.Group {
  const C = OPERATIVE_COLORS;
  const g = new THREE.Group();
  g.name = side > 0 ? 'fp-arm-right' : 'fp-arm-left';
  fpPart(g, 0.12, 0.07, 0.14, C.charcoal, 0, 0.07, 0.005); // wrist cuff
  fpPart(g, 0.19, 0.23, 0.21, C.lightSteel, 0, 0.2, 0.02); // forearm guard
  fpPart(g, 0.03, 0.07, 0.07, C.lightSteel, side * 0.04, 0.324, 0.065); // elbow tab
  // the upper arm runs on well past the screen edge: a short stub ended in
  // mid-air on wide phone screens and the arm looked cut off from the body
  fpPart(g, 0.14, 0.95, 0.16, C.charcoal, 0, 0.31 + 0.475, 0.01);
  return g;
}

/** makes one box in `parent`'s space (callers own materials and counting) */
type BoxMaker = (
  parent: THREE.Object3D, w: number, h: number, d: number, hex: number,
  x: number, y: number, z: number, scuff: boolean,
) => void;

/** a jointed glove: four three-bone fingers and an opposable thumb */
export interface HandRig {
  group: THREE.Group;
  /**
   * Fold the hand: 0 = flat open, 1 = full fist. `index` overrides the index
   * finger (a trigger finger laid straight along the frame is ~0.12);
   * `thumb` folds the thumb across the palm.
   */
  setCurl(fingers: number, thumb?: number, index?: number): void;
  /**
   * Explicit joint angles (radians, + = toward the palm) for a hold the
   * curl ratios can't make — e.g. round a grip wider than the fingers are
   * long: knuckle at 90°, the rest gently round the far corner.
   */
  pose(fingers: [number, number, number], index: [number, number, number], thumb: number): void;
}

/*
 * Glove anatomy, in hand space (the RIGHT hand hanging at the side):
 * the wrist is the origin, the hand hangs down -Y, the palm faces -X (the
 * body) and the back of the hand +X; the fingers sit side by side along Z,
 * index at the front (-Z) and little finger at the back. Mirrored for the
 * left hand (`side` -1). Sizes are glove-chunky but in real proportion: each
 * finger is three phalanges (proximal : middle : distal ≈ 1 : 0.7 : 0.55),
 * the middle finger longest, the little finger shortest, hinged at the
 * knuckle (MCP), the middle joint (PIP) and the tip joint (DIP). The thumb
 * roots low on the palm side (CMC), has its own metacarpal and two
 * phalanges, and swings across the palm as it folds.
 */
const PALM_LEN = 0.095;
const PALM_THICK = 0.055;
const PALM_WIDE = 0.15;
const FINGERS: Array<{ z: number; bones: [number, number, number] }> = [
  { z: -0.0555, bones: [0.042, 0.029, 0.023] }, // index
  { z: -0.0185, bones: [0.046, 0.032, 0.025] }, // middle
  { z: 0.0185, bones: [0.043, 0.03, 0.023] }, // ring
  { z: 0.0555, bones: [0.035, 0.024, 0.019] }, // little
];
/** per-joint fold at curl 1, radians: MCP, PIP, DIP (PIP folds most, DIP least) */
const FOLD = [1.45, 1.6, 0.85];

function buildHandRig(side: 1 | -1, make: BoxMaker): HandRig {
  const C = OPERATIVE_COLORS;
  const group = new THREE.Group();
  // palm (the metacarpals) and the dark steel knuckle plate on its back
  make(group, PALM_THICK, PALM_LEN, PALM_WIDE, C.charcoal, 0, -PALM_LEN / 2, 0, true);
  make(group, 0.008, 0.06, 0.12, C.darkSteel, side * (PALM_THICK / 2 + 0.003), -0.055, 0, false);
  // folding toward the palm (-side X) is a rotation of -side about Z
  const fold = -side;
  const joints: THREE.Group[][] = [];
  for (const f of FINGERS) {
    const chain: THREE.Group[] = [];
    let parent: THREE.Object3D = group;
    let y = -PALM_LEN;
    f.bones.forEach((len, i) => {
      const j = new THREE.Group();
      j.position.set(0, y, i === 0 ? f.z : 0);
      parent.add(j);
      // each bone a touch slimmer than the one before it
      make(j, 0.042 - i * 0.003, len, 0.031 - i * 0.002, C.charcoal, 0, -len / 2, 0, false);
      chain.push(j);
      parent = j;
      y = -len;
    });
    joints.push(chain);
  }
  // thumb: CMC root low on the palm side at the front, angled forward and in
  const cmc = new THREE.Group();
  cmc.position.set(-side * 0.014, -0.022, -0.068);
  group.add(cmc);
  make(cmc, 0.042, 0.042, 0.038, C.charcoal, 0, -0.021, 0, false); // thumb metacarpal
  const t1 = new THREE.Group();
  t1.position.set(0, -0.042, 0);
  cmc.add(t1);
  make(t1, 0.038, 0.034, 0.034, C.charcoal, 0, -0.017, 0, false); // proximal phalanx
  const t2 = new THREE.Group();
  t2.position.set(0, -0.034, 0);
  t1.add(t2);
  make(t2, 0.034, 0.027, 0.031, C.charcoal, 0, -0.0135, 0, false); // distal phalanx

  const setCurl = (fingers: number, thumb = fingers * 0.8, index = fingers): void => {
    joints.forEach((chain, fi) => {
      const c = Math.max(0, Math.min(1, fi === 0 ? index : fingers));
      chain.forEach((j, k) => j.rotation.set(0, 0, fold * FOLD[k] * c));
    });
    const tc = Math.max(0, Math.min(1, thumb));
    // the thumb tips forward off the palm, then opposes across it as it folds
    cmc.rotation.set(0.55 - 0.25 * tc, 0, fold * (0.3 + 0.55 * tc));
    t1.rotation.set(0, 0, fold * 0.5 * tc);
    t2.rotation.set(0, 0, fold * 0.7 * tc);
  };
  const pose = (f: [number, number, number], idx: [number, number, number], thumb: number): void => {
    joints.forEach((chain, fi) => chain.forEach((j, k) => j.rotation.set(0, 0, fold * (fi === 0 ? idx : f)[k])));
    const tc = Math.max(0, Math.min(1, thumb));
    cmc.rotation.set(0.55 - 0.25 * tc, 0, fold * (0.3 + 0.55 * tc));
    t1.rotation.set(0, 0, fold * 0.5 * tc);
    t2.rotation.set(0, 0, fold * 0.7 * tc);
  };
  setCurl(0.25);
  return { group, setCurl, pose };
}

/**
 * A first-person gloved hand: the same jointed hand rig (three-bone
 * fingers, opposable thumb) posed in the GUN's own space (x right, y up,
 * z back) around the part it holds:
 *  - 'grip': a vertical grip of half-width `hw` (x) and half-depth `hd` (z)
 *    centred on the origin. The palm lies along the outer side, the
 *    knuckles at the grip's front corner, and the fingers fold round the
 *    front to the far side; `index: 'straight'` keeps the trigger finger
 *    nearly straight along the frame, 'wrap' folds it with the others. The
 *    thumb wraps over the top of the far side.
 *  - 'cradle': under a horizontal part of half-width `hw` whose underside is
 *    at the origin: the palm up beneath it, the fingers folding up the far
 *    side, the thumb up the near side.
 *  - 'side': a C-grip on the near side of a handguard / pump / tube of
 *    half-width `hw` and half-height `hd`, centred on the origin: the palm
 *    flat on its side, the fingers over the top, the thumb under. This is
 *    the support hold the camera can actually see — under the gun, the gun
 *    body hides the hand.
 * The returned group's `userData.wrist` is the wrist point (where the
 * forearm meets the hand) in the group's parent units. `side` +1 = right.
 */
export function buildFirstPersonHand(
  side: 1 | -1,
  pose: 'grip' | 'cradle' | 'side',
  hw: number,
  hd = 0.04,
  index: 'straight' | 'wrap' = 'wrap',
): THREE.Group {
  const g = new THREE.Group();
  g.name = side > 0 ? 'fp-hand-right' : 'fp-hand-left';
  const hand = buildHandRig(side, (parent, w, h, d, hex, x, y, z, scuff) => fpPart(parent, w, h, d, hex, x, y, z, scuff));
  g.add(hand.group);
  if (pose === 'grip') {
    // hand space → gun space: fingers (-Y) point forward (-Z), the index
    // (-Z) goes to the top (+Y): a quarter turn about X
    hand.group.rotation.x = Math.PI / 2;
    // palm against the outer side (a little into it: gloves compress),
    // knuckles just ahead of the grip's front face
    hand.group.position.set(side * (hw + PALM_THICK / 2 - 0.01), 0, PALM_LEN - hd - 0.024);
    // the grip is wider than a glove finger is long: knuckle at ~90° so the
    // first bone runs across the front, then the middle and tip joints round
    // the far corner. The trigger finger stays nearly straight on the frame.
    const wrap: [number, number, number] = [1.5, 0.75, 0.65];
    hand.pose(wrap, index === 'straight' ? [0.12, 0.08, 0.05] : wrap, 0.8);
  } else if (pose === 'side') {
    // hand space → gun space: a half turn about X stands the fingers up
    // (-Y → +Y) and keeps the palm facing the part (-side X → the part)
    hand.group.rotation.x = Math.PI;
    // palm flat on the near side, knuckles just over the top edge
    hand.group.position.set(side * (hw + PALM_THICK / 2 - 0.006), hd - PALM_LEN + 0.012, 0);
    hand.pose([1.35, 0.7, 0.45], [1.25, 0.6, 0.4], 0.6);
  } else {
    // hand space → gun space: the palm (-side X) faces up, the fingers (-Y)
    // reach across under the part to the far side: a quarter turn about Z
    hand.group.rotation.z = side * -Math.PI / 2;
    // palm just under the part, knuckles at its far edge
    hand.group.position.set(-side * (hw + 0.006 - PALM_LEN), -PALM_THICK / 2, 0);
    hand.setCurl(0.8, 0.55);
  }
  g.userData.wrist = hand.group.position.clone();
  return g;
}

/**
 * Where the hands go on each gun, in the gun model's own space (the
 * `buildWeaponModel` box model, before scaling): `grip` for the right glove,
 * `support` for the left. The arms are short (the concept's chunky
 * proportions), so the support hand sits on the body or magazine just ahead
 * of the grip rather than out on a fore-end it couldn't reach.
 */
export const OPERATIVE_GRIPS: Record<WeaponId, Omit<HeldWeapon, 'object'>> = {
  special: { stance: 'shoulder', grip: new THREE.Vector3(0, -0.13, 0.1), support: new THREE.Vector3(0, -0.1, -0.2), butt: new THREE.Vector3(0, 0, 0.2) },
  // pistol: square-ish stance, both arms out, the support hand under the grip
  pistol: { stance: 'pistol', grip: new THREE.Vector3(0, -0.13, 0.06), support: new THREE.Vector3(-0.045, -0.15, 0.05), butt: new THREE.Vector3(0, -0.13, 0.06) },
  // long guns: the stock's butt in the shoulder, the support hand out on
  // the fore-end (the pump, the fore-grip, under the coil body)
  shotgun: { stance: 'shoulder', grip: new THREE.Vector3(0, -0.085, 0.14), support: new THREE.Vector3(0, -0.1, -0.3), butt: new THREE.Vector3(0, -0.075, 0.41) },
  smg: { stance: 'shoulder', grip: new THREE.Vector3(0, -0.12, 0.1), support: new THREE.Vector3(0, -0.17, -0.27), butt: new THREE.Vector3(0, -0.02, 0.28) },
  arc: { stance: 'shoulder', grip: new THREE.Vector3(0, -0.14, 0.1), support: new THREE.Vector3(0, -0.1, -0.13), butt: new THREE.Vector3(0, -0.02, 0.21) },
  // the launcher rides ON the shoulder, both hands on its grips below
  rocket: { stance: 'launcher', grip: new THREE.Vector3(0, -0.13, 0), support: new THREE.Vector3(0, -0.12, -0.3), butt: new THREE.Vector3(0, -0.065, 0.05) },
};

/** a gun in the operative's hands */
export interface HeldWeapon {
  object: THREE.Object3D;
  /**
   * How it's carried. 'shoulder': the butt in the shoulder pocket, body
   * bladed ~30° so the support shoulder comes forward (that is what lets a
   * hand reach the fore-end), head turned back to face front and tilted onto
   * the stock. 'pistol': squarer, both arms out. 'launcher': on top of the
   * shoulder.
   */
  stance: 'shoulder' | 'pistol' | 'launcher';
  /** gun-local hand points (see OPERATIVE_GRIPS) */
  grip: THREE.Vector3;
  support: THREE.Vector3;
  /** gun-local point that sits on the anchor: the butt (shoulder pocket /
   * shoulder top), or the grip for a pistol */
  butt: THREE.Vector3;
}

export interface OperativeRig {
  /** feet on Y = 0, facing -Z */
  root: THREE.Group;
  torso: THREE.Group;
  neck: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  /** right glove: parent a weapon here */
  handSocketR: THREE.Group;
  /** number of boxes showing (depends on the helmet) */
  readonly boxes: number;
  /** helmet on (visor, respirator) or off (bare human head) */
  setHelmet(on: boolean): void;
  readonly helmet: boolean;
  /**
   * Pose for time t (seconds): stand (walk = 0) or walk cycle (walk = 1),
   * blended, plus a jump in progress and the held gun's two-hand grip.
   */
  animate(t: number, walk: number, strideT?: number): void;
  /** baked mode: multiply every non-glow colour by a room-light tint */
  tint(r: number, g: number, b: number): void;
  /**
   * How the empty hands rest: relaxed (a natural slight curl), fist or open.
   * The fingers ease to it in animate(); holding a gun closes them round it.
   */
  handPose: 'relaxed' | 'fist' | 'open';
  /** put a gun in the hands (null = unarmed); it's carried at the chest */
  hold(w: HeldWeapon | null): void;
  /** start a jump at time t (crouch, take-off, tuck, landing) */
  jump(t: number): void;
  /** a jump is playing at time t */
  jumping(t: number): boolean;
  dispose(): void;
}

/** a joint: a group whose pivot sits at `at` (floor coordinates) */
interface Joint {
  g: THREE.Group;
  at: THREE.Vector3;
}

export function buildOperative(opts: OperativeOptions = {}): OperativeRig {
  const lit = opts.shading === 'lit';
  const jumpLift = opts.jumpLift !== false;
  const mats = new Map<string, THREE.Material>();
  const baseOf = new Map<THREE.Material, THREE.Color>();
  const material = (hex: number, glow: boolean, scuff: boolean): THREE.Material => {
    const key = `${hex}:${glow}:${scuff}`;
    let m = mats.get(key);
    if (!m) {
      if (glow) m = new THREE.MeshBasicMaterial({ color: raw(hex), fog: true });
      else if (lit) m = new THREE.MeshLambertMaterial({ color: raw(hex), fog: true });
      else m = new THREE.MeshBasicMaterial({ color: raw(hex), vertexColors: true, fog: true });
      if (!glow && scuff) addScuffs(m);
      baseOf.set(m, raw(hex));
      mats.set(key, m);
    }
    return m;
  };
  const geos: THREE.BufferGeometry[] = [];
  let boxes = 0;

  const joint = (parent: Joint | null, x: number, y: number, z: number): Joint => {
    const g = new THREE.Group();
    const at = new THREE.Vector3(x, y, z);
    if (parent) {
      g.position.copy(at).sub(parent.at);
      parent.g.add(g);
    } else {
      g.position.copy(at);
    }
    return { g, at };
  };
  /** a box centred at floor coordinates (x, y, z), parented to joint j */
  const box = (
    j: Joint, w: number, h: number, d: number, hex: number,
    x: number, y: number, z: number, glow = false, scuff = true,
  ): THREE.Mesh => {
    const geo = roundedBox(w, h, d);
    if (!glow && !lit) bakeShade(geo);
    geos.push(geo);
    const mesh = new THREE.Mesh(geo, material(hex, glow, scuff));
    mesh.position.set(x - j.at.x, y - j.at.y, z - j.at.z);
    mesh.userData.glow = glow;
    mesh.userData.baseColor = raw(hex);
    j.g.add(mesh);
    boxes++;
    return mesh;
  };

  const C = OPERATIVE_COLORS;
  // outer root is the caller's to place; the inner base carries the stride bob
  const outer = new THREE.Group();
  outer.name = 'operative';
  const root: Joint = { g: new THREE.Group(), at: new THREE.Vector3() };
  outer.add(root.g);

  // ---- pelvis stays on the root
  box(root, 0.3, 0.11, 0.25, C.steel, 0, 0.835, 0);

  // ---- torso (waist pivot): core, armour, belt, backpack
  const torso = joint(root, 0, 0.95, 0);
  box(torso, 0.35, 0.44, 0.28, C.darkSteel, 0, 1.19, 0); // core (collar shows above the plate)
  box(torso, 0.393, 0.256, 0.06, C.darkSteel, 0, 1.219, -0.155); // chest plate
  box(torso, 0.065, 0.036, 0.03, C.cyan, -0.093, 1.276, -0.195, true); // status light, wearer's left
  box(torso, 0.3, 0.12, 0.33, C.steel, 0, 1.03, 0); // abdomen band, proud of the core
  box(torso, 0.395, 0.079, 0.32, C.charcoal, 0, 0.93, 0); // belt
  box(torso, 0.37, 0.38, 0.18, C.darkSteel, 0, 1.22, 0.257); // backpack
  box(torso, 0.065, 0.485, 0.06, C.lightSteel, 0, 1.40, 0.335); // spine, up past the shoulders

  // ---- head (neck pivot)
  const neck = joint(torso, 0, 1.44, 0);
  box(neck, 0.2, 0.06, 0.2, C.charcoal, 0, 1.43, 0.0); // suit collar (stays on bareheaded)

  // the helmet set and the bare head share the neck pivot; setHelmet() picks one
  const helmetJ: Joint = { g: new THREE.Group(), at: neck.at };
  const faceJ: Joint = { g: new THREE.Group(), at: neck.at };
  neck.g.add(helmetJ.g, faceJ.g);
  box(helmetJ, 0.355, 0.316, 0.37, C.lightSteel, 0, 1.602, -0.005); // helmet
  box(helmetJ, 0.307, 0.108, 0.06, C.visorFrame, 0, 1.588, -0.21); // visor frame, proud of the face
  box(helmetJ, 0.256, 0.072, 0.06, C.cyan, 0, 1.588, -0.215, true); // visor
  box(helmetJ, 0.168, 0.108, 0.12, C.charcoal, 0, 1.468, -0.14); // respirator

  // bare head, after the Facility Survivor note (reference/main-character-
  // human-survivor.md): a chunky cuboid head, short dark hair, small dark
  // eyes, flat brows, a cuboid nose and a mouth line. Skin and hair take no
  // scuffs (they read as blemishes). A touch larger than the note's .28 so it
  // holds its own on the armoured body. Front of the head is z = -0.14.
  const H = SURVIVOR_COLORS;
  box(faceJ, 0.12, 0.1, 0.12, H.skin, 0, 1.45, 0, false, false); // neck
  box(faceJ, 0.3, 0.28, 0.28, H.skin, 0, 1.6, 0, false, false); // head
  box(faceJ, 0.31, 0.035, 0.3, H.hair, 0, 1.745, 0, false, false); // hair cap
  box(faceJ, 0.31, 0.19, 0.03, H.hair, 0, 1.645, 0.14, false, false); // hair back
  for (const s of [1, -1]) {
    box(faceJ, 0.03, 0.11, 0.26, H.hair, s * 0.155, 1.68, 0.005, false, false); // hair side
    box(faceJ, 0.042, 0.037, 0.008, H.hair, s * 0.066, 1.618, -0.143, false, false); // eye
    box(faceJ, 0.054, 0.015, 0.008, H.hair, s * 0.066, 1.665, -0.143, false, false); // eyebrow
  }
  box(faceJ, 0.043, 0.054, 0.032, H.skin, 0, 1.585, -0.152, false, false); // nose
  box(faceJ, 0.075, 0.013, 0.008, H.mouth, 0, 1.528, -0.143, false, false); // mouth
  faceJ.g.visible = false;
  const countBoxes = (g: THREE.Object3D): number => {
    let n = 0;
    g.traverse((o) => { if ((o as THREE.Mesh).isMesh) n++; });
    return n;
  };
  const helmetBoxes = countBoxes(helmetJ.g);
  let helmetOn = true;
  const faceBoxes = countBoxes(faceJ.g);

  // ---- limbs, mirrored: s = +1 is the wearer's right (+X)
  const arm = (s: number): { shoulder: Joint; elbow: Joint; socket: Joint } => {
    const shoulder = joint(torso, s * 0.285, 1.36, 0.04);
    // the cap rides the torso like a pauldron: on the arm it tipped up and
    // stuck out whenever the arm came forward to hold a gun
    box(torso, 0.175, 0.168, 0.215, C.lightSteel, s * 0.285, 1.324, 0.06); // shoulder cap
    box(shoulder, 0.13, 0.19, 0.15, C.charcoal, s * 0.29, 1.15, 0.045); // upper arm
    const elbow = joint(shoulder, s * 0.3, 1.06, 0.04);
    box(elbow, 0.19, 0.23, 0.21, C.lightSteel, s * 0.33, 0.952, 0.05); // forearm guard
    box(elbow, 0.03, 0.07, 0.07, C.lightSteel, s * 0.37, 1.075, 0.095); // elbow tab
    // the jointed glove (three-bone fingers, opposable thumb), hanging from
    // the wrist at the bottom of the forearm guard; animate() folds it
    const hand = buildHandRig(s as 1 | -1, (parent, w, h, d, hex, x, y, z, scuff) => {
      const geo = roundedBox(w, h, d);
      if (!lit) bakeShade(geo);
      geos.push(geo);
      const mesh = new THREE.Mesh(geo, material(hex, false, scuff));
      mesh.position.set(x, y, z);
      mesh.userData.glow = false;
      mesh.userData.baseColor = raw(hex);
      parent.add(mesh);
      boxes++;
    });
    hand.group.position.set(s * 0.345 - elbow.at.x, 0.85 - elbow.at.y, 0.02 - elbow.at.z);
    elbow.g.add(hand.group);
    hands.push(hand);
    const socket = joint(elbow, s * 0.345, 0.766, 0.02); // glove centre
    return { shoulder, elbow, socket };
  };
  const leg = (s: number): { hip: Joint; knee: Joint } => {
    const hip = joint(root, s * 0.12, 0.79, 0);
    box(hip, 0.187, 0.2, 0.227, C.darkSteel, s * 0.12, 0.676, 0.017); // thigh
    const knee = joint(hip, s * 0.135, 0.51, 0);
    box(knee, 0.15, 0.12, 0.2, C.lightSteel, s * 0.135, 0.51, -0.01); // knee band
    box(knee, 0.2, 0.27, 0.228, C.darkSteel, s * 0.14, 0.315, 0.03); // shin
    box(knee, 0.19, 0.072, 0.228, C.charcoal, s * 0.16, 0.144, 0.054); // ankle
    box(knee, 0.245, 0.108, 0.384, C.sole, s * 0.16, 0.054, -0.012); // foot, toe forward
    return { hip, knee };
  };
  const hands: HandRig[] = []; // [right, left]
  const R = arm(1);
  const L = arm(-1);
  const RL = leg(1);
  const LL = leg(-1);

  // ---- arm solving: point an arm's two bones at a torso-space target
  const UPPER = 0.3; // shoulder pivot → elbow pivot
  const LOWER = 0.298; // elbow pivot → glove centre
  const tmp = new THREE.Vector3();
  const reach = (shoulder: THREE.Group, elbow: THREE.Group, target: THREE.Vector3): void => {
    tmp.copy(target).sub(shoulder.position); // both in torso space
    const dist = tmp.length() || 1;
    const d = Math.min(UPPER + LOWER - 0.002, Math.max(0.08, dist));
    tmp.divideScalar(dist);
    // swing in towards the target (Z), then pitch forward (X): Euler XYZ
    // applies Rz first, so (0,-1,0) → (sin a, -cos a cos b, -cos a sin b)
    const a = Math.asin(Math.max(-1, Math.min(1, tmp.x)));
    const b = Math.atan2(-tmp.z, -tmp.y);
    // two bones: the upper arm drops by alpha, the elbow folds the rest
    const alpha = Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + d * d - LOWER * LOWER) / (2 * UPPER * d))));
    const inner = Math.acos(Math.max(-1, Math.min(1, (UPPER * UPPER + LOWER * LOWER - d * d) / (2 * UPPER * LOWER))));
    shoulder.rotation.set(b - alpha, 0, a);
    elbow.rotation.set(Math.PI - inner, 0, 0);
  };

  // where each stance seats the gun (torso space, floor heights minus the
  // waist pivot): the pocket inside the right shoulder at the chest plate,
  // the top of the right shoulder cap, or arm's length for a pistol grip
  const TY = torso.at.y;
  const ANCHOR = {
    shoulder: new THREE.Vector3(0.15, 1.31 - TY, -0.15),
    launcher: new THREE.Vector3(0.22, 1.47 - TY, 0.02),
    pistol: new THREE.Vector3(0.04, 1.31 - TY, -0.46),
  };
  /** body turn for each stance (radians, + = left shoulder forward) */
  const BLADE = { shoulder: 0.55, launcher: 0.45, pistol: 0.15 };
  const gunQ = new THREE.Quaternion();
  const gunE = new THREE.Euler();
  let held: HeldWeapon | null = null;
  const gripTarget = new THREE.Vector3();
  const supportTarget = new THREE.Vector3();
  let jumpT0 = -100;
  let curlNow = 0.3;
  let lastT = 0;
  const JUMP_CROUCH = 0.14;
  const JUMP_AIR = 0.62;
  const JUMP_LAND = 0.2;
  const JUMP_HEIGHT = 0.62;
  const JUMP_LEN = JUMP_CROUCH + JUMP_AIR + JUMP_LAND;
  /** hip height: folding hips by a and knees by -2a keeps the feet under the body */
  const HIP_H = 0.79;

  const rig: OperativeRig = {
    root: outer,
    torso: torso.g,
    neck: neck.g,
    shoulderL: L.shoulder.g,
    shoulderR: R.shoulder.g,
    elbowL: L.elbow.g,
    elbowR: R.elbow.g,
    hipL: LL.hip.g,
    hipR: RL.hip.g,
    kneeL: LL.knee.g,
    kneeR: RL.knee.g,
    handSocketR: R.socket.g,
    get boxes(): number {
      return boxes - (helmetOn ? faceBoxes : helmetBoxes);
    },
    get helmet(): boolean {
      return helmetOn;
    },
    setHelmet(on: boolean): void {
      helmetOn = on;
      helmetJ.g.visible = on;
      faceJ.g.visible = !on;
    },
    handPose: 'relaxed',
    animate(t: number, walk: number, strideT = t): void {
      // ---- hands: ease the fingers toward the pose (a gun closes them)
      const hdt = Math.max(0, Math.min(0.1, t - lastT));
      lastT = t;
      const target = held ? 0.92 : rig.handPose === 'fist' ? 1 : rig.handPose === 'open' ? 0 : 0.3;
      curlNow = hdt > 0 ? curlNow + (target - curlNow) * Math.min(1, hdt * 9) : target;
      for (const h of hands) h.setCurl(curlNow, curlNow * (rig.handPose === 'open' && !held ? 0.2 : 0.85));

      // ---- jump: legs fold by `crouch` (hip angle), the body rises by `lift`
      const j = t - jumpT0;
      const inJump = j >= 0 && j < JUMP_LEN;
      let crouch = 0;
      let lift = 0;
      let armsUp = 0; // unarmed arm swing: < 0 back (wind-up), > 0 up (in the air)
      if (inJump) {
        if (j < JUMP_CROUCH) {
          const k = Math.sin((j / JUMP_CROUCH) * Math.PI * 0.5);
          crouch = 0.55 * k;
          armsUp = -0.6 * k;
        } else if (j < JUMP_CROUCH + JUMP_AIR) {
          const s = (j - JUMP_CROUCH) / JUMP_AIR;
          lift = jumpLift ? 4 * JUMP_HEIGHT * s * (1 - s) : 0;
          crouch = 0.2 + 0.4 * Math.sin(s * Math.PI); // legs tuck at the top
          armsUp = 0.9 * Math.sin(Math.min(1, s * 1.6) * Math.PI * 0.5) * (1 - s * 0.6);
        } else {
          const l = (j - JUMP_CROUCH - JUMP_AIR) / JUMP_LAND;
          crouch = 0.5 * Math.sin((0.25 + l * 0.75) * Math.PI); // absorb, then stand
          armsUp = 0.35 * (1 - l);
        }
      }
      // no strides while airborne
      const w = Math.max(0, Math.min(1, walk)) * (inJump ? 0 : 1);
      const ph = strideT * 7.5; // ~1.2 strides a second (strideT may run backwards)
      const sw = Math.sin(ph);

      // ---- legs: swing forward = +x rotation (foot towards -Z). A leg swings
      // forward while d/dt sin > 0 (cos > 0): that's when its knee folds to
      // lift the foot through; the planted leg stays straight (bending on
      // the other half reads as walking backwards)
      rig.hipR.rotation.x = sw * 0.55 * w + crouch;
      rig.hipL.rotation.x = -sw * 0.55 * w + crouch;
      rig.kneeR.rotation.x = -Math.max(0, Math.cos(ph)) * 0.9 * w - 2 * crouch;
      rig.kneeL.rotation.x = -Math.max(0, -Math.cos(ph)) * 0.9 * w - 2 * crouch;

      // ---- body: stride bob + counter-twist; idle breathing when standing.
      // On the ground a crouch lowers the hips so the feet stay planted.
      const breathe = inJump ? 0 : Math.sin(t * 1.6) * 0.006 * (1 - w);
      const drop = lift > 0 ? 0 : HIP_H * (1 - Math.cos(crouch));
      root.g.position.y = Math.abs(Math.cos(ph)) * 0.04 * w + breathe + lift - drop;
      rig.torso.rotation.y = sw * 0.08 * w * (held ? 0.4 : 1);
      rig.torso.rotation.x = 0.06 * w + crouch * 0.35;
      rig.neck.rotation.y = -sw * 0.06 * w;
      rig.neck.rotation.x = -crouch * 0.3; // eyes stay level as the body folds

      // ---- arms
      if (held) {
        // the gun stays level against the torso lean and bobs a touch with
        // the stride; both hands follow it
        // bladed stance: the body turns (part at the hips, part at the
        // waist) to bring the support shoulder forward; the gun and the head
        // turn back the same amount so both face front
        const blade = BLADE[held.stance];
        root.g.rotation.y = -blade * 0.45;
        rig.torso.rotation.y += -blade * 0.55;
        const bodyYaw = root.g.rotation.y + rig.torso.rotation.y;
        rig.neck.rotation.y = -bodyYaw - sw * 0.03 * w;
        if (held.stance !== 'pistol') {
          // cheek on the stock: head tipped a touch right and down
          rig.neck.rotation.z = -0.13;
          rig.neck.rotation.x += 0.07;
        }
        const o = held.object;
        // level and pointing straight ahead in the world
        o.rotation.copy(gunE.set(-rig.torso.rotation.x, -bodyYaw, 0, 'YXZ'));
        gunQ.setFromEuler(o.rotation);
        // seat the butt (or the pistol grip) on the stance anchor
        o.position.copy(ANCHOR[held.stance]).sub(tmp.copy(held.butt).multiply(o.scale).applyQuaternion(gunQ));
        o.position.y += Math.abs(Math.cos(ph)) * 0.01 * w;
        o.updateMatrix();
        gripTarget.copy(held.grip).applyMatrix4(o.matrix);
        supportTarget.copy(held.support).applyMatrix4(o.matrix);
        reach(rig.shoulderR, rig.elbowR, gripTarget);
        reach(rig.shoulderL, rig.elbowL, supportTarget);
      } else {
        // arms in opposition; an arm bends more as it swings forward
        rig.shoulderR.rotation.set(-sw * 0.45 * w + armsUp, 0, 0);
        rig.shoulderL.rotation.set(sw * 0.45 * w + armsUp, 0, 0);
        rig.elbowR.rotation.set((0.25 + Math.max(0, -sw) * 0.3) * w + Math.max(0, armsUp) * 0.5, 0, 0);
        rig.elbowL.rotation.set((0.25 + Math.max(0, sw) * 0.3) * w + Math.max(0, armsUp) * 0.5, 0, 0);
        root.g.rotation.y = 0;
        rig.neck.rotation.z = 0;
      }
    },
    hold(wpn: HeldWeapon | null): void {
      if (held) held.object.removeFromParent();
      held = wpn;
      if (!wpn) return;
      // placed every frame by animate() (stance, aim, bob)
      rig.torso.add(wpn.object);
    },
    jump(t: number): void {
      if (!rig.jumping(t)) jumpT0 = t;
    },
    jumping(t: number): boolean {
      const j = t - jumpT0;
      return j >= 0 && j < JUMP_LEN;
    },
    tint(r: number, g: number, b: number): void {
      for (const [key, m] of mats) {
        if (key.includes(':true:')) continue; // glow: full-bright
        const base = baseOf.get(m);
        if (base) (m as THREE.MeshBasicMaterial).color.setRGB(base.r * r, base.g * g, base.b * b);
      }
    },
    dispose(): void {
      for (const g of geos) g.dispose();
      for (const m of mats.values()) m.dispose();
    },
  };
  return rig;
}
