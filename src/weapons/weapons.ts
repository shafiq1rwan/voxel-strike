import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AmmoType, WeaponId } from '../types';
import { Input } from '../core/input';
import { rayBox } from '../core/physics';
import type { Enemy } from '../entities/enemies';
import { AimCone, findAimTarget } from '../entities/aimassist';
import type { Game } from '../game';
import { buildFirstPersonArm, buildFirstPersonHand } from '../entities/operative';

/** touch bullet magnetism: miss by up to ~0.7u beside the body; 4–7 degrees */
const MAGNET_CONE: AimCone = { margin: 0.7, min: 0.07, max: 0.12, maxDist: 40 };

interface WeaponDef {
  id: WeaponId;
  name: string;
  ammoType: AmmoType;
  ammoPerShot: number;
  damage: number;
  pellets: number;
  spread: number;
  /** shots per second (all weapons repeat while the trigger is held) */
  rate: number;
  projectile: boolean;
  recoil: number;
  kick: number;
  sound: 'pistol' | 'shotgun' | 'smg' | 'rocketLaunch' | 'arcFire';
  flashScale: number;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol', name: 'SIDEARM', ammoType: 'bullets', ammoPerShot: 1,
    damage: 14, pellets: 1, spread: 0.012, rate: 3.4,
    projectile: false, recoil: 0.028, kick: 0.06, sound: 'pistol', flashScale: 0.5,
  },
  shotgun: {
    id: 'shotgun', name: 'SCATTERGUN', ammoType: 'shells', ammoPerShot: 1,
    damage: 7, pellets: 7, spread: 0.062, rate: 1.05,
    projectile: false, recoil: 0.065, kick: 0.14, sound: 'shotgun', flashScale: 0.85,
  },
  smg: {
    id: 'smg', name: 'RIPPER', ammoType: 'bullets', ammoPerShot: 1,
    damage: 9, pellets: 1, spread: 0.034, rate: 9.5,
    projectile: false, recoil: 0.016, kick: 0.05, sound: 'smg', flashScale: 0.45,
  },
  rocket: {
    id: 'rocket', name: 'THUMPER', ammoType: 'rockets', ammoPerShot: 1,
    damage: 0, pellets: 0, spread: 0, rate: 0.85,
    projectile: true, recoil: 0.08, kick: 0.2, sound: 'rocketLaunch', flashScale: 0.9,
  },
  // chain lightning: hits arc to up to 3 more enemies near the first target
  arc: {
    id: 'arc', name: 'ARC CASTER', ammoType: 'cells', ammoPerShot: 1,
    damage: 26, pellets: 1, spread: 0, rate: 2.4,
    projectile: false, recoil: 0.03, kick: 0.09, sound: 'arcFire', flashScale: 0.7,
  },
};

/** slot order (keys 1-5); touch.ts maps wheel picks through it */
export const ORDER: WeaponId[] = ['pistol', 'shotgun', 'smg', 'rocket', 'arc'];

const FOCUSED_SHOTGUN: WeaponDef = {
  ...WEAPONS.shotgun, name: 'FOCUSED SCATTERGUN',
  spread: WEAPONS.shotgun.spread * 0.65, rate: WEAPONS.shotgun.rate * 0.85,
};

/** touch auto-switch preference when the weapon in hand runs dry (rockets last: self-splash) */
const DRY_SWITCH: WeaponId[] = ['shotgun', 'smg', 'arc', 'pistol', 'rocket'];

// view-model palette (theme-locked)
const VOID = 0x05060a;
const HAZARD = 0xffd028;
const KEY_RED = 0xff3428;
const EXIT_GREEN = 0x4cc26a;
const STEEL = 0x566076;
const STEEL_LIGHT = 0x7a859b;
const GUNMETAL = 0x3c4252;
const GRIP = 0x2a2e38;

/**
 * Baked per-face shade, lit from above-left like a key light, in
 * BoxGeometry face order: +x, -x, +y, -y, +z, -z. Reads the boxes as solid
 * forms instead of flat silhouettes.
 */
const FACE_SHADE = [0.6, 0.86, 1.0, 0.42, 0.74, 0.52];
/** 1-pixel edge at the 240p internal resolution, a darker shade of the part's own color */
const OUTLINE = 0.007;
const OUTLINE_SHADE = 0.55;

/** a hex color taken as-is (matches the NoColorSpace textures everywhere else) */
function rawColor(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
}

function shadedBox(w: number, h: number, d: number): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  const n = geo.attributes.position.count; // 4 verts per face, 6 faces
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.fill(FACE_SHADE[Math.floor(i / 4)], i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

interface PartOpts {
  /** full-bright, never tinted by the room light (sights, coils, LEDs) */
  glow?: boolean;
  /** dark rim around the part (default on) */
  outline?: boolean;
  rx?: number;
  ry?: number;
  rz?: number;
}

/** one box of a view model; tinted by local light unless `glow` */
function vmPart(
  parent: THREE.Object3D, w: number, h: number, d: number, color: number,
  x: number, y: number, z: number, opts: PartOpts = {},
): THREE.Mesh {
  const glow = !!opts.glow;
  // raw palette values: the renderer outputs linear, so a plain hex would be
  // sRGB-decoded on the way in and every part would render near-black
  const base = rawColor(color);
  const m = new THREE.MeshBasicMaterial({ color: base, vertexColors: !glow, fog: false });
  const mesh = new THREE.Mesh(glow ? new THREE.BoxGeometry(w, h, d) : shadedBox(w, h, d), m);
  mesh.position.set(x, y, z);
  mesh.rotation.set(opts.rx ?? 0, opts.ry ?? 0, opts.rz ?? 0);
  mesh.userData.baseColor = base;
  mesh.userData.glow = glow;
  if (opts.outline !== false) {
    // inverted hull: a slightly larger back-face box behind the part, in a
    // darker shade of the part itself (a black rim fights the world's look)
    const rimColor = base.clone().multiplyScalar(OUTLINE_SHADE);
    const rimMat = new THREE.MeshBasicMaterial({ color: rimColor, side: THREE.BackSide, fog: false });
    const rim = new THREE.Mesh(mesh.geometry, rimMat);
    rim.scale.set((w + OUTLINE * 2) / w, (h + OUTLINE * 2) / h, (d + OUTLINE * 2) / d);
    rim.userData.baseColor = rimColor;
    rim.userData.glow = glow;
    mesh.add(rim);
  }
  parent.add(mesh);
  return mesh;
}

/** muzzle flash: hot core + uneven star spikes (reads at 240p, unlike a soft blob) */
function makeFlashTexture(cool = false): THREE.CanvasTexture {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const cx = S / 2;
  const [core, mid, edge] = cool
    ? ['rgba(230,252,255,1)', 'rgba(110,215,255,0.9)', 'rgba(30,110,255,0)'] // arc caster
    : ['rgba(255,246,200,1)', 'rgba(255,176,60,0.9)', 'rgba(255,70,0,0)'];
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + (i % 2) * 0.25;
    const len = cx * (i % 2 ? 0.6 : 0.97);
    const wd = S * 0.07;
    const grad = ctx.createLinearGradient(cx, cx, cx + Math.cos(a) * len, cx + Math.sin(a) * len);
    grad.addColorStop(0, mid);
    grad.addColorStop(1, edge);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - Math.sin(a) * wd, cx + Math.cos(a) * wd);
    ctx.lineTo(cx + Math.cos(a) * len, cx + Math.sin(a) * len);
    ctx.lineTo(cx + Math.sin(a) * wd, cx - Math.cos(a) * wd);
    ctx.fill();
  }
  const grad = ctx.createRadialGradient(cx, cx, 1, cx, cx, S * 0.3);
  grad.addColorStop(0, core);
  grad.addColorStop(0.45, mid);
  grad.addColorStop(1, edge);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** set a glow part to its base color × f */
function glowAt(m: THREE.Mesh, f: number): void {
  (m.material as THREE.MeshBasicMaterial).color.copy(m.userData.baseColor as THREE.Color).multiplyScalar(f);
}

/** 0→1→0 blowback curve: snaps back over `snap`s, returns over `ret`s */
function blowback(t: number, snap: number, ret: number): number {
  if (t < snap) return t / snap;
  return Math.max(0, 1 - (t - snap) / ret);
}

// per-shot scratch: firing is synchronous, nothing keeps these
const _origin = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _muzzle = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);
const _light: [number, number, number] = [0, 0, 0];
const _dyn: [number, number, number] = [0, 0, 0];

/**
 * Merge every part under `root` (not `root` itself) into at most four meshes:
 * lit faces, lit rims, glow faces, glow rims. Each part's colour moves into
 * vertex colours (face shade × part colour), so one material per bucket draws
 * them all and the light tick still tints a lit bucket through its material
 * colour (base white). Objects in `skip` and their subtrees are left alone;
 * objects in `pin` stay live meshes (their colour animates) but what hangs
 * off them — their rim — still merges, since it never changes. Either kind is
 * re-parented onto `root` (same pose) if its parent gets merged away.
 *
 * Why: every vmPart is two draw calls (box + rim), ~30 for one gun — on a
 * phone that was the costliest thing on screen. Baked, a gun is ~6.
 */
function mergeParts(root: THREE.Object3D, skip: Set<THREE.Object3D>, pin: Set<THREE.Object3D>): void {
  const buckets: THREE.BufferGeometry[][] = [[], [], [], []]; // lit, litRim, glow, glowRim
  const merged: THREE.Mesh[] = [];
  const reattach: THREE.Object3D[] = [];
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const visit = (o: THREE.Object3D, parentMerged: boolean): void => {
    for (const child of o.children) {
      if (skip.has(child) || pin.has(child)) {
        if (parentMerged) reattach.push(child);
        if (pin.has(child)) visit(child, false);
        continue;
      }
      if (!(child instanceof THREE.Mesh)) continue;
      const mat = child.material as THREE.MeshBasicMaterial;
      const rim = mat.side === THREE.BackSide;
      const glow = !!child.userData.glow;
      const color = child.userData.baseColor as THREE.Color;
      const geo = (child.geometry as THREE.BufferGeometry).clone();
      geo.deleteAttribute('normal');
      geo.deleteAttribute('uv');
      // a lit face carries its per-face shade; rims and glow parts are flat
      const shade = !rim && !glow ? (geo.getAttribute('color') as THREE.BufferAttribute | undefined) : undefined;
      const n = geo.attributes.position.count;
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const s = shade ? shade.getX(i) : 1;
        col[i * 3] = color.r * s;
        col[i * 3 + 1] = color.g * s;
        col[i * 3 + 2] = color.b * s;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.applyMatrix4(rel.multiplyMatrices(toRoot, child.matrixWorld));
      buckets[(glow ? 2 : 0) + (rim ? 1 : 0)].push(geo);
      merged.push(child);
      visit(child, true);
    }
  };
  visit(root, false);
  for (const k of reattach) root.attach(k);
  for (const m of merged) {
    m.removeFromParent();
    (m.material as THREE.Material).dispose();
  }
  buckets.forEach((geos, i) => {
    if (!geos.length) return;
    const glow = i >= 2;
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff, vertexColors: true, fog: false,
      side: i % 2 ? THREE.BackSide : THREE.FrontSide,
    });
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    for (const g of geos) g.dispose();
    mesh.userData.baseColor = new THREE.Color(1, 1, 1);
    mesh.userData.glow = glow;
    root.add(mesh);
  });
}

/** bake a finished gun: static parts merge, moving / pulsing parts stay live */
function bakeModel(m: WeaponModel): void {
  const pulsing = [m.led, m.core, m.cellWindow, ...m.coils, ...m.tips].filter((o): o is THREE.Mesh => !!o);
  const movers = [m.slide, m.pump, m.bolt].filter((o): o is THREE.Mesh => !!o);
  m.group.updateMatrixWorld(true);
  const pin = new Set<THREE.Object3D>(pulsing);
  mergeParts(m.group, new Set(movers), pin);
  // a moving part keeps its own box; what rides on it (sights, grooves, its
  // rim) merges into its frame so it still travels with it
  for (const mv of movers) {
    mv.updateMatrixWorld(true);
    mergeParts(mv, new Set(), pin);
  }
  // the arc's muzzle tips always glow alike: one mesh for both
  if (m.tips.length > 1) {
    const first = m.tips[0];
    const geos = m.tips.map((t) => {
      t.updateMatrix();
      return (t.geometry as THREE.BufferGeometry).clone().applyMatrix4(t.matrix);
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), first.material);
    for (const gg of geos) gg.dispose();
    merged.userData.baseColor = first.userData.baseColor;
    merged.userData.glow = true;
    for (const t of m.tips) {
      t.removeFromParent();
      if (t !== first) (t.material as THREE.Material).dispose();
    }
    m.group.add(merged);
    m.tips = [merged];
  }
}

/** a gun's box model plus handles to its moving parts */
export interface WeaponModel {
  group: THREE.Group;
  /** muzzle z (flash placement) */
  tip: number;
  slide?: THREE.Mesh;
  pump?: THREE.Mesh;
  bolt?: THREE.Mesh;
  led?: THREE.Mesh;
  coils: THREE.Mesh[];
  core?: THREE.Mesh;
  tips: THREE.Mesh[];
  cellWindow?: THREE.Mesh;
}

/**
 * Builds one gun from `vmPart` boxes. The single source of truth for what a
 * weapon looks like: the first-person view model AND the floor pickup
 * (pickups.ts) both come from here, so they can never drift apart.
 */
export function buildWeaponModel(id: WeaponId): WeaponModel {
  const g = new THREE.Group();
  const m: WeaponModel = { group: g, tip: -0.5, coils: [], tips: [] };
  switch (id) {
    // SIDEARM — compact pistol: blowback slide, glowing three-dot sights
    case 'pistol': {
      const slide = vmPart(g, 0.09, 0.085, 0.34, STEEL, 0, 0.025, -0.1);
      for (let i = 0; i < 2; i++) {
        vmPart(slide, 0.096, 0.05, 0.016, GUNMETAL, 0, -0.005, 0.1 + i * 0.035, { outline: false });
      }
      vmPart(slide, 0.03, 0.008, 0.08, VOID, 0.018, 0.043, -0.03, { outline: false }); // ejection port
      const front = vmPart(slide, 0.022, 0.028, 0.02, GRIP, 0, 0.055, -0.15);
      vmPart(front, 0.012, 0.012, 0.006, EXIT_GREEN, 0, 0.004, 0.012, { glow: true, outline: false });
      for (const sx of [-0.026, 0.026]) {
        const post = vmPart(slide, 0.02, 0.026, 0.02, GRIP, sx, 0.054, 0.15);
        vmPart(post, 0.01, 0.01, 0.006, EXIT_GREEN, 0, 0.004, 0.012, { glow: true, outline: false });
      }
      vmPart(g, 0.08, 0.06, 0.26, GUNMETAL, 0, -0.045, -0.06); // frame
      vmPart(g, 0.022, 0.018, 0.09, GRIP, 0, -0.1, -0.05); // trigger guard
      vmPart(g, 0.014, 0.04, 0.014, STEEL, 0, -0.08, -0.025, { outline: false }); // trigger
      const grip = vmPart(g, 0.076, 0.17, 0.1, GRIP, 0, -0.14, 0.06, { rx: 0.25 });
      vmPart(grip, 0.082, 0.026, 0.08, HAZARD, 0, -0.035, 0, { outline: false });
      vmPart(g, 0.032, 0.03, 0.022, GRIP, 0, 0.05, 0.085); // hammer
      m.tip = -0.32;
      m.slide = slide;
      break;
    }
    // SCATTERGUN — pump shotgun: racks the forend after every shot
    case 'shotgun': {
      vmPart(g, 0.11, 0.12, 0.22, GUNMETAL, 0, 0, 0.03); // receiver
      for (let i = 0; i < 3; i++) {
        // side saddle: spare shells, red hulls + brass heads
        const shell = vmPart(g, 0.02, 0.028, 0.05, KEY_RED, -0.064, -0.034 + i * 0.034, 0.03);
        vmPart(shell, 0.022, 0.03, 0.014, 0xc8a030, 0, 0, 0.026, { outline: false });
      }
      vmPart(g, 0.075, 0.075, 0.58, STEEL, 0, 0.035, -0.36); // barrel
      vmPart(g, 0.022, 0.014, 0.52, STEEL_LIGHT, 0, 0.079, -0.36); // vent rib
      vmPart(g, 0.016, 0.016, 0.016, HAZARD, 0, 0.093, -0.61, { glow: true }); // bead sight
      vmPart(g, 0.09, 0.09, 0.035, GRIP, 0, 0.035, -0.645); // muzzle ring
      vmPart(g, 0.065, 0.065, 0.46, GUNMETAL, 0, -0.045, -0.32); // magazine tube
      vmPart(g, 0.075, 0.075, 0.03, GRIP, 0, -0.045, -0.56); // tube cap
      const pump = vmPart(g, 0.125, 0.095, 0.2, 0x8a5a32, 0, -0.05, -0.3);
      for (const gz of [-0.06, 0, 0.06]) vmPart(pump, 0.129, 0.099, 0.014, 0x5a3a1e, 0, 0, gz, { outline: false });
      vmPart(g, 0.022, 0.02, 0.08, GRIP, 0, -0.072, 0.05); // trigger guard
      const stock = vmPart(g, 0.09, 0.12, 0.28, 0x6e4626, 0, -0.075, 0.27);
      vmPart(stock, 0.095, 0.128, 0.025, GRIP, 0, 0, 0.145, { outline: false }); // butt pad
      m.tip = -0.67;
      m.pump = pump;
      break;
    }
    // RIPPER — boxy SMG: red-dot optic, reciprocating charging handle
    case 'smg': {
      vmPart(g, 0.11, 0.13, 0.4, 0x4a5162, 0, -0.01, -0.06); // body
      const rail = vmPart(g, 0.05, 0.016, 0.34, GRIP, 0, 0.063, -0.08);
      for (let i = 0; i < 5; i++) vmPart(rail, 0.056, 0.008, 0.016, GUNMETAL, 0, 0.008, -0.13 + i * 0.065, { outline: false });
      const optic = vmPart(g, 0.06, 0.055, 0.08, GRIP, 0, 0.1, -0.02);
      vmPart(optic, 0.046, 0.04, 0.004, 0x1a2a2a, 0, 0.002, 0.041, { outline: false }); // lens
      vmPart(optic, 0.012, 0.012, 0.004, KEY_RED, 0, 0.003, 0.044, { glow: true, outline: false }); // dot
      const shroud = vmPart(g, 0.1, 0.1, 0.2, 0x353a47, 0, 0, -0.36);
      for (let i = 0; i < 3; i++) vmPart(shroud, 0.006, 0.032, 0.03, VOID, -0.05, 0, -0.06 + i * 0.06, { outline: false });
      vmPart(g, 0.045, 0.045, 0.1, STEEL_LIGHT, 0, 0, -0.5); // barrel
      const mag = vmPart(g, 0.065, 0.22, 0.09, GRIP, 0, -0.19, -0.02, { rx: -0.15 });
      vmPart(mag, 0.072, 0.026, 0.096, HAZARD, 0, -0.105, 0, { outline: false }); // base plate
      vmPart(g, 0.05, 0.12, 0.06, GRIP, 0, -0.13, -0.27); // front grip
      vmPart(g, 0.07, 0.14, 0.08, GRIP, 0, -0.12, 0.1, { rx: 0.25 }); // pistol grip
      vmPart(g, 0.07, 0.07, 0.16, GUNMETAL, 0, -0.02, 0.2); // stock stub
      m.bolt = vmPart(g, 0.03, 0.022, 0.035, STEEL_LIGHT, -0.066, 0.02, -0.02);
      m.tip = -0.56;
      break;
    }
    // THUMPER — rocket launcher: hazard bands, ready LED on the back cap
    case 'rocket': {
      vmPart(g, 0.17, 0.17, 0.7, 0x56784e, 0, 0.02, -0.15); // tube
      for (let i = 0; i < 4; i++) {
        vmPart(g, 0.178, 0.178, 0.03, i % 2 ? GRIP : HAZARD, 0, 0.02, -0.43 + i * 0.03, { outline: false });
      }
      vmPart(g, 0.21, 0.21, 0.12, 0x2e3e2e, 0, 0.02, -0.52); // muzzle
      const cap = vmPart(g, 0.2, 0.2, 0.09, 0x2e3e2e, 0, 0.02, 0.22);
      vmPart(cap, 0.12, 0.12, 0.006, VOID, 0, 0, 0.046, { outline: false }); // exhaust
      m.led = vmPart(cap, 0.035, 0.035, 0.008, EXIT_GREEN, 0.065, 0.065, 0.048, { glow: true, outline: false });
      const optic = vmPart(g, 0.055, 0.065, 0.14, GRIP, -0.05, 0.14, -0.02);
      vmPart(optic, 0.03, 0.03, 0.006, EXIT_GREEN, 0, 0.005, 0.071, { glow: true, outline: false });
      vmPart(g, 0.06, 0.15, 0.08, GRIP, 0, -0.13, 0, { rx: 0.2 }); // grip
      vmPart(g, 0.05, 0.12, 0.06, GRIP, 0, -0.12, -0.3); // front grip
      // the tube is big at arm's length: the view model shrinks + nudges it
      g.scale.setScalar(0.72);
      g.position.set(0.04, -0.03, 0);
      m.tip = -0.5;
      break;
    }
    // ARC CASTER — coil gun: coils pulse, charge with the cooldown, flare on fire
    case 'arc': {
      vmPart(g, 0.12, 0.13, 0.36, 0x3e4858, 0, -0.02, 0); // body
      vmPart(g, 0.03, 0.04, 0.22, STEEL, 0, 0.065, 0); // top fin
      for (let i = 0; i < 4; i++) {
        m.coils.push(vmPart(g, 0.15, 0.15, 0.045, 0x34d0ff, 0, 0, -0.2 - i * 0.075, { glow: true }));
        if (i < 3) vmPart(g, 0.12, 0.12, 0.03, 0x2a3240, 0, 0, -0.2375 - i * 0.075, { outline: false });
      }
      m.core = vmPart(g, 0.045, 0.045, 0.42, 0xd8f8ff, 0, 0, -0.3, { glow: true, outline: false });
      for (const sx of [-0.055, 0.055]) {
        vmPart(g, 0.025, 0.04, 0.15, 0x8a94a8, sx, 0, -0.52); // prong
        m.tips.push(vmPart(g, 0.03, 0.045, 0.03, 0x9aeaff, sx, 0, -0.6, { glow: true }));
      }
      const cell = vmPart(g, 0.05, 0.09, 0.12, GRIP, -0.085, -0.02, 0.02);
      m.cellWindow = vmPart(cell, 0.006, 0.05, 0.08, 0x34d0ff, -0.026, 0, 0, { glow: true, outline: false });
      vmPart(g, 0.07, 0.15, 0.09, GRIP, 0, -0.14, 0.1, { rx: 0.25 }); // grip
      const rear = vmPart(g, 0.11, 0.12, 0.03, GRIP, 0, -0.02, 0.195);
      vmPart(rear, 0.114, 0.024, 0.034, HAZARD, 0, 0.03, 0, { outline: false });
      m.tip = -0.55;
      break;
    }
  }
  bakeModel(m);
  return m;
}

/**
 * View-model rest height. Hands were tried (gloved, bare, one- and
 * two-handed, with and without forearms) at -0.21 and removed at the
 * owner's request; this is the approved gun-only height.
 */
const VM_Y = -0.34;

/** Weapon inventory + firing + first-person view model. */
export class WeaponSystem {
  readonly viewModel = new THREE.Group();
  private owned = new Set<WeaponId>(['pistol']);
  current: WeaponId = 'pistol';
  /** One non-stacking Overload sidegrade, retained only for the current run. */
  focusedShotgun = false;

  definition(id = this.current): WeaponDef {
    return id === 'shotgun' && this.focusedShotgun ? FOCUSED_SHOTGUN : WEAPONS[id];
  }
  private pending: WeaponId | null = null;
  private raiseT = 1; // 0 lowered, 1 raised
  private cooldown = 0;
  private kickZ = 0;
  private flashTime = 0;
  private models = new Map<WeaponId, THREE.Group>();
  private flash: THREE.Mesh;
  private warmFlashTex: THREE.CanvasTexture;
  private coolFlashTex: THREE.CanvasTexture;
  private muzzleTips = new Map<WeaponId, number>(); // z of muzzle for flash placement
  /** seconds left in the buffered-click window */
  private queuedShot = 0;
  private dryFired = false;
  private lightTick = 0;
  /** view-model rest height (raised when the operative's arms are on) */
  private vmY = VM_Y;

  // view-model motion state
  /** seconds since the current weapon last fired (drives slide/pump/bolt/coils) */
  private shotT = 10;
  private kickRoll = 0;
  private swayX = 0;
  private swayY = 0;
  private lastYaw = 0;
  private lastPitch = 0;
  private airVy = 0;
  private landDip = 0;
  private pumpStage = 2; // 0 waiting, 1 racked back, 2 done
  /** last LED state shown on the launcher (null = repaint without a chirp) */
  private rocketReady: boolean | null = null;
  /** moving parts, by weapon */
  private parts: {
    slide?: THREE.Mesh; pump?: THREE.Mesh; bolt?: THREE.Mesh; led?: THREE.Mesh;
    coils: THREE.Mesh[]; core?: THREE.Mesh; tips: THREE.Mesh[]; cellWindow?: THREE.Mesh;
  } = { coils: [], tips: [] };
  private readonly basePos = new Map<THREE.Object3D, number>(); // rest z of moving parts

  constructor() {
    this.viewModel.position.set(0.3, VM_Y, -0.62);
    this.buildModels();
    this.warmFlashTex = makeFlashTexture(false);
    this.coolFlashTex = makeFlashTexture(true);
    const flashMat = new THREE.MeshBasicMaterial({
      map: this.warmFlashTex, transparent: true, blending: THREE.AdditiveBlending,
      depthTest: false, depthWrite: false, fog: false,
    });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), flashMat);
    this.flash.renderOrder = 10;
    this.flash.visible = false;
    this.viewModel.add(this.flash);
    this.showModel(this.current);
  }

  /** owned weapons + the one in hand, for sector checkpoints */
  loadout(): { owned: WeaponId[]; current: WeaponId } {
    return { owned: ORDER.filter((w) => this.owned.has(w)), current: this.current };
  }

  /** restore a checkpoint's loadout instantly (no lower/raise animation) */
  restoreLoadout(owned: string[], current: string): void {
    const valid = owned.filter((w): w is WeaponId => (ORDER as string[]).includes(w));
    this.owned = new Set<WeaponId>(['pistol', ...valid]);
    this.current = this.owned.has(current as WeaponId) ? (current as WeaponId) : 'pistol';
    this.pending = null;
    this.raiseT = 1;
    this.cooldown = 0;
    this.queuedShot = 0;
    this.flashTime = 0;
    this.showModel(this.current);
  }

  /** forget in-flight shot animations (fresh weapon in hand) */
  private resetAction(): void {
    this.shotT = 10;
    this.pumpStage = 2;
    this.rocketReady = null;
  }

  private buildModels(): void {
    const p = this.parts;
    for (const id of ORDER) {
      const m = buildWeaponModel(id);
      m.group.visible = false;
      this.viewModel.add(m.group);
      this.models.set(id, m.group);
      this.muzzleTips.set(id, m.tip);
      p.slide ??= m.slide;
      p.pump ??= m.pump;
      p.bolt ??= m.bolt;
      p.led ??= m.led;
      p.core ??= m.core;
      p.cellWindow ??= m.cellWindow;
      p.coils.push(...m.coils);
      p.tips.push(...m.tips);
    }
    for (const part of [p.slide, p.pump, p.bolt]) if (part) this.basePos.set(part, part.position.z);
  }

  /**
   * Play-as-operative preview (`?play=operative`): the operative's gloves and
   * forearm guards on every gun. The arms ride the gun group, so they take
   * its kick, sway and bob; the left hand rides the shotgun's pump so it
   * racks with it. The forearms run back and down out of the bottom of the
   * screen, as in any FPS. Off by default — the shipped view model is the
   * owner-approved gun-only one.
   */
  useOperativeArms(): void {
    // gun-local hand points (grip / support) and where each elbow lies
    // each forearm runs from its hand back towards its own bottom corner of
    // the screen, the way arms enter an FPS view: steeply down it hung below
    // the gun like a brick; straight at the eye it hid its own hand
    const R_ELBOW = new THREE.Vector3(0.18, -0.52, 0.83).normalize();
    const L_ELBOW = new THREE.Vector3(-0.5, -0.25, 0.83).normalize();
    // carried higher, as in any FPS with visible arms: at the gun-only
    // height the trigger hand sat under the screen edge
    this.vmY = -0.2;
    // per gun, in its own model space: the trigger hand wraps the grip (half
    // width / depth of that part) with the index finger laid along the frame;
    // the support hand wraps a fore-grip or cradles the body / pump
    type Hand = { at: [number, number, number]; pose: 'grip' | 'cradle' | 'side'; hw: number; hd?: number };
    const HANDS: Record<WeaponId, { r: Hand; l: Hand; lOnPump?: boolean }> = {
      pistol: { r: { at: [0, -0.14, 0.06], pose: 'grip', hw: 0.038, hd: 0.05 }, l: { at: [0, -0.225, 0.07], pose: 'cradle', hw: 0.05 } },
      // support hands on the near (left) side with the fingers over the top:
      // the pump (racks with it), the SMG shroud, the launcher tube, the arc
      // caster body — under the gun the gun itself hid them
      shotgun: { r: { at: [0, -0.085, 0.14], pose: 'grip', hw: 0.045, hd: 0.05 }, l: { at: [0, 0, 0.02], pose: 'side', hw: 0.0625, hd: 0.0475 }, lOnPump: true },
      smg: { r: { at: [0, -0.12, 0.1], pose: 'grip', hw: 0.035, hd: 0.04 }, l: { at: [0, 0, -0.36], pose: 'side', hw: 0.05, hd: 0.05 } },
      rocket: { r: { at: [0, -0.13, 0], pose: 'grip', hw: 0.03, hd: 0.04 }, l: { at: [0, 0.02, -0.26], pose: 'side', hw: 0.085, hd: 0.085 } },
      arc: { r: { at: [0, -0.14, 0.1], pose: 'grip', hw: 0.035, hd: 0.045 }, l: { at: [0, -0.02, -0.07], pose: 'side', hw: 0.06, hd: 0.065 } },
    };
    // the forearms smaller than the third-person ones: right by the eye, the
    // concept's chunky bracers filled the corner and buried the hands
    const SCALE = 0.68;
    const UP = new THREE.Vector3(0, 1, 0);
    const mount = (side: 1 | -1, parent: THREE.Object3D, hand: Hand, elbow: THREE.Vector3, groupScale: number): void => {
      // the hand: built round the part in gun space, at the gun's rendered
      // size (its own scale undoes the launcher group's)
      const h = buildFirstPersonHand(side, hand.pose, hand.hw * groupScale, (hand.hd ?? 0.04) * groupScale,
        side > 0 ? 'straight' : 'wrap');
      h.position.set(...hand.at);
      h.scale.setScalar(1 / groupScale);
      parent.add(h);
      // the forearm starts at the wrist, not at the middle of the grip
      const wrist = (h.userData.wrist as THREE.Vector3).clone().multiplyScalar(1 / groupScale);
      const at: [number, number, number] = [hand.at[0] + wrist.x, hand.at[1] + wrist.y, hand.at[2] + wrist.z];
      const arm = buildFirstPersonArm(side);
      // local +Y (glove → elbow) along the elbow direction, the guard's face
      // (-Z) turned up towards the sky
      const y = elbow.clone();
      const z = UP.clone().addScaledVector(y, -UP.dot(y)).normalize().negate();
      const x = new THREE.Vector3().crossVectors(y, z);
      arm.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
      arm.position.set(...at);
      arm.scale.setScalar(SCALE / groupScale); // the launcher group is scaled down
      parent.add(arm);
    };
    for (const id of ORDER) {
      const g = this.models.get(id);
      if (!g) continue;
      const h = HANDS[id];
      const s = g.scale.x;
      mount(1, g, h.r, R_ELBOW, s);
      const pump = h.lOnPump ? this.parts.pump : undefined;
      mount(-1, pump ?? g, h.l, L_ELBOW, s);
    }
    this.lightTick = 1; // tint the new arms on the next frame
  }

  private showModel(id: WeaponId): void {
    for (const [k, g] of this.models) g.visible = k === id;
    this.resetAction();
    this.lightTick = 1; // tint the new model by the room light on the next frame
  }

  give(id: WeaponId): void {
    this.owned.add(id);
    this.switchTo(id);
  }

  has(id: WeaponId): boolean {
    return this.owned.has(id);
  }

  switchTo(id: WeaponId): void {
    if (!this.owned.has(id) || id === this.current || this.pending === id) return;
    this.pending = id;
  }

  update(dt: number, input: Input, game: Game): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);
    this.kickZ *= Math.exp(-9 * dt);
    this.flash.visible = this.flashTime > 0;

    // switch requests
    const req = input.consumeSwitch();
    if (req !== null && !game.player.dead) {
      if (req >= 0) {
        this.switchTo(ORDER[req]);
      } else {
        // wheel: -1 prev, -2 next among owned
        const ownedList = ORDER.filter((w) => this.owned.has(w));
        const idx = ownedList.indexOf(this.current);
        const step = req === -2 ? 1 : -1;
        const next = ownedList[(idx + step + ownedList.length) % ownedList.length];
        this.switchTo(next);
      }
    }

    // raise/lower animation
    if (this.pending) {
      this.raiseT -= dt * 6;
      if (this.raiseT <= 0) {
        this.current = this.pending;
        this.pending = null;
        this.showModel(this.current);
        game.hud.updateWeapon(this);
        game.audio.play('weaponRaise');
      }
    } else if (this.raiseT < 1) {
      this.raiseT = Math.min(1, this.raiseT + dt * 6);
    }

    // firing: hold-to-fire at the weapon's rate; a click during cooldown is
    // buffered briefly so spam-clicking never eats shots
    const def = this.definition();
    if (input.consumeFirePress() && !game.player.dead) {
      this.queuedShot = 0.25;
      this.dryFired = false;
    }
    this.queuedShot = Math.max(0, this.queuedShot - dt);
    const canAct = !game.player.dead && this.pending === null && this.raiseT > 0.9;
    const wantFire = canAct && (input.fire || this.queuedShot > 0);
    if (wantFire && this.cooldown === 0) {
      if (game.player.ammo[def.ammoType] >= def.ammoPerShot) {
        this.fire(def, game);
      } else if (!this.dryFired) {
        this.dryFired = true;
        game.audio.play('dryfire');
        // desktop: just click (number keys are right there). Touch: switching
        // is a reach mid-fight, so hop to the best weapon that still has ammo.
        if (game.isTouch) {
          const next = DRY_SWITCH.find((id) =>
            id !== this.current && this.owned.has(id) && game.player.ammo[WEAPONS[id].ammoType] >= WEAPONS[id].ammoPerShot);
          if (next) this.switchTo(next);
        }
      }
      // adrenaline powerup: faster trigger
      this.cooldown = 1 / (def.rate * (game.player.buffs.haste > 0 ? 1.35 : 1));
      this.queuedShot = 0;
    }

    this.animate(dt, game);
  }

  private fire(def: WeaponDef, game: Game): void {
    const pl = game.player;
    pl.ammo[def.ammoType] -= def.ammoPerShot;
    game.hud.updateStats(pl);
    game.audio.play(def.sound);
    game.net?.sendShot(def.sound, pl.pos.x, pl.eyeY(), pl.pos.z);
    pl.recoilPitch += def.recoil;
    this.kickZ += def.kick;
    this.kickRoll += (Math.random() - 0.5) * def.kick * 0.8;
    this.shotT = 0;
    this.pumpStage = 0;
    this.lightTick = 1; // the gun catches its own muzzle light this frame
    this.flashTime = 0.055;
    (this.flash.material as THREE.MeshBasicMaterial).map =
      def.id === 'arc' ? this.coolFlashTex : this.warmFlashTex;
    const tipZ = this.muzzleTips.get(def.id)!;
    // the muzzle in view-model space (through the model's own offset, e.g. the thumper's)
    const model = this.models.get(def.id)!;
    this.flash.position.set(0, 0.02, tipZ - 0.06).add(model.position);
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar(def.flashScale * (0.85 + Math.random() * 0.4));

    // dynamic light burst at the player
    game.dynLights.flash(pl.pos.x, pl.eyeY(), pl.pos.z, 1, 0.75, 0.35, 1.4, 9, 0.07);
    // gunfire wakes nearby enemies
    game.noise(pl.pos.x, pl.pos.z, 17);

    const cam = game.camera;
    const origin = _origin.set(pl.pos.x, pl.eyeY(), pl.pos.z);
    const fwd = cam.getWorldDirection(_fwd);
    // bullet magnetism (touch only): near-misses bend onto the target
    if (!def.projectile) this.applyAimAssist(origin, fwd, game);
    const right = _right.crossVectors(fwd, _UP).normalize();
    const up = _up.crossVectors(right, fwd).normalize();
    // approximate world-space muzzle (matches the viewmodel's barrel)
    const muzzle = _muzzle.copy(origin)
      .addScaledVector(fwd, 0.55)
      .addScaledVector(right, 0.16)
      .addScaledVector(up, -0.14);

    // heavier weapons punch the view
    if (def.id === 'shotgun') {
      game.punchFOV(1.3);
      pl.shake = Math.min(0.5, pl.shake + 0.05);
    } else if (def.id === 'rocket') {
      game.punchFOV(1.0);
    } else if (def.id === 'arc') {
      game.punchFOV(0.6);
    }

    // quad damage powerup
    const dmgMult = pl.buffs.quad > 0 ? 4 : 1;

    if (def.id === 'arc') {
      // muzzle light is electric blue
      game.dynLights.flash(pl.pos.x, pl.eyeY(), pl.pos.z, 0.4, 0.85, 1, 1.4, 9, 0.09);
      this.fireArc(origin, fwd, def.damage * dmgMult, game, muzzle);
      return;
    }

    if (def.projectile) {
      game.projectiles.spawn('rocket', origin.x + fwd.x * 0.7, origin.y + fwd.y * 0.7, origin.z + fwd.z * 0.7, fwd.x, fwd.y, fwd.z, 17, true, dmgMult);
      game.particles.smoke(muzzle.x, muzzle.y, muzzle.z, 4);
      return;
    }

    // brass + smoke off the muzzle (pushed forward so they don't fill the lens);
    // the scattergun ejects its hull later, when the pump racks
    if (def.id !== 'shotgun') {
      game.particles.casing(muzzle.x + fwd.x * 0.2, muzzle.y - 0.06, muzzle.z + fwd.z * 0.2, right.x, right.z);
    }
    game.particles.smoke(muzzle.x + fwd.x * 0.25, muzzle.y + 0.03, muzzle.z + fwd.z * 0.25, def.id === 'shotgun' ? 3 : 1);

    for (let i = 0; i < def.pellets; i++) {
      const dir = _dir.copy(fwd)
        .addScaledVector(right, (Math.random() * 2 - 1) * def.spread)
        .addScaledVector(up, (Math.random() * 2 - 1) * def.spread)
        .normalize();
      this.hitscan(origin, dir, def.damage * dmgMult, game, muzzle);
    }
  }

  /**
   * Touch-only bullet magnetism: if a live, visible enemy sits within a small
   * cone of the aim direction, snap the shot onto it. Desktop aim is never touched.
   */
  private applyAimAssist(origin: THREE.Vector3, fwd: THREE.Vector3, game: Game): void {
    if (!game.isTouch || !game.settings.aimAssist) return;
    const t = findAimTarget(game, origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z, MAGNET_CONE);
    if (t) fwd.set(t.x - origin.x, t.y - origin.y, t.z - origin.z).normalize();
  }

  /**
   * ARC CASTER: a lightning bolt to the first enemy hit, then chains to up to
   * 3 more enemies near each previous target (LOS-checked, decaying damage).
   */
  private fireArc(origin: THREE.Vector3, fwd: THREE.Vector3, damage: number, game: Game, muzzle: THREE.Vector3): void {
    const MAX = 40;
    const CHAIN_RANGE = 7;
    const wHit = game.world.raycast(origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z, MAX);
    let wallT = wHit ? wHit.t : MAX;
    for (const d of game.doors) {
      if (d.isOpen) continue;
      const t = rayBox(origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z, wallT, d.box());
      if (t !== null && t < wallT) wallT = t;
    }
    const eHit = game.enemies.raycast(origin.x, origin.y, origin.z, fwd.x, fwd.y, fwd.z, wallT);

    if (!eHit) {
      // ground the bolt on whatever it hit
      const hx = origin.x + fwd.x * wallT;
      const hy = origin.y + fwd.y * wallT;
      const hz = origin.z + fwd.z * wallT;
      this.lightning(game, muzzle.x, muzzle.y, muzzle.z, hx, hy, hz);
      if (wHit && wHit.t <= wallT) {
        game.particles.impact(hx, hy, hz, wHit.nx, wHit.ny, wHit.nz, 0.4, 0.85, 1);
        game.dynLights.flash(hx + wHit.nx * 0.2, hy + wHit.ny * 0.2, hz + wHit.nz * 0.2, 0.35, 0.85, 1, 0.7, 4, 0.09);
        game.applyVoxelDamage(wHit.x, wHit.y, wHit.z, damage);
      }
      return;
    }

    // build the chain: nearest visible enemy to each previous target
    const targets: Enemy[] = [eHit.enemy];
    // Overcharge perk: two more hops, and each hop keeps more of its punch
    const overcharge = game.hasPerk('overcharge');
    const maxTargets = overcharge ? 6 : 4;
    while (targets.length < maxTargets) {
      const last = targets[targets.length - 1];
      let best: Enemy | null = null;
      let bestD = CHAIN_RANGE;
      for (const e of game.enemies.list) {
        if (!e.alive || targets.includes(e)) continue;
        const d = Math.sqrt(
          (e.pos.x - last.pos.x) ** 2 + (e.pos.y - last.pos.y) ** 2 + (e.pos.z - last.pos.z) ** 2
        );
        if (d >= bestD) continue;
        if (!game.hasLOS(last.pos.x, last.pos.y + 0.2, last.pos.z, e.pos.x, e.pos.y + 0.2, e.pos.z)) continue;
        best = e;
        bestD = d;
      }
      if (!best) break;
      targets.push(best);
    }

    let px = muzzle.x, py = muzzle.y, pz = muzzle.z;
    let dmg = damage;
    for (const e of targets) {
      const ty = e.pos.y + 0.2;
      this.lightning(game, px, py, pz, e.pos.x, ty, e.pos.z);
      game.dynLights.flash(e.pos.x, e.pos.y + 0.4, e.pos.z, 0.35, 0.85, 1, 1.4, 6, 0.12);
      game.audio.play('boltHit', e.pos);
      const ddx = e.pos.x - px, ddz = e.pos.z - pz;
      const dl = Math.hypot(ddx, ddz) || 1;
      game.applyEnemyHit(e, dmg, ddx / dl, ddz / dl, false);
      px = e.pos.x; py = ty; pz = e.pos.z;
      dmg = Math.max(6, Math.round(dmg * (overcharge ? 0.8 : 0.7))); // each hop hits softer
    }
    game.hud.hitMarker();
  }

  /** jagged electric bolt drawn as a run of short teal tracer segments */
  private lightning(game: Game, ax: number, ay: number, az: number, bx: number, by: number, bz: number): void {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const segs = Math.max(2, Math.min(6, Math.floor(len / 1.2)));
    const jitter = Math.min(0.5, len * 0.1);
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      let nx = ax + dx * t, ny = ay + dy * t, nz = az + dz * t;
      if (i < segs) {
        nx += (Math.random() - 0.5) * 2 * jitter;
        ny += (Math.random() - 0.5) * 2 * jitter;
        nz += (Math.random() - 0.5) * 2 * jitter;
      }
      game.tracers.fire(px, py, pz, nx, ny, nz, 0x7ee8ff, 0.13);
      px = nx; py = ny; pz = nz;
    }
  }

  private hitscan(origin: THREE.Vector3, dir: THREE.Vector3, damage: number, game: Game, muzzle: THREE.Vector3): void {
    const MAX = 60;
    const wHit = game.world.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, MAX);
    let wallT = wHit ? wHit.t : MAX;
    // closed doors block shots
    for (const d of game.doors) {
      if (d.isOpen) continue;
      const t = rayBox(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, wallT, d.box());
      if (t !== null && t < wallT) wallT = t;
    }
    const eHit = game.enemies.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, wallT);
    if (eHit) {
      const t = eHit.t;
      const e = eHit.enemy;
      const hitY = origin.y + dir.y * t;
      // headshot: creatures with heads take double damage in the top slice
      const headshot = (e.kind === 'husk' || e.kind === 'brute' || e.kind === 'vatborn') && hitY > e.pos.y + e.half.y * 0.45;
      game.tracers.fire(muzzle.x, muzzle.y, muzzle.z, origin.x + dir.x * t, hitY, origin.z + dir.z * t);
      if (headshot) {
        game.audio.play('headshot', e.pos);
        game.hud.headshotMarker();
        // extra spray from the skull
        game.particles.blood(
          e.pos.x, hitY, e.pos.z, dir.x, 0.4, dir.z,
          e.tuning.bloodColor[0], e.tuning.bloodColor[1], e.tuning.bloodColor[2], 8
        );
      } else {
        game.hud.hitMarker();
      }
      game.applyEnemyHit(e, headshot ? damage * 2 : damage, dir.x, dir.z, headshot);
      return;
    }
    if (wHit && wHit.t <= wallT) {
      const hx = origin.x + dir.x * wHit.t;
      const hy = origin.y + dir.y * wHit.t;
      const hz = origin.z + dir.z * wHit.t;
      game.tracers.fire(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz);
      game.particles.impact(hx, hy, hz, wHit.nx, wHit.ny, wHit.nz);
      game.dynLights.flash(hx + wHit.nx * 0.2, hy + wHit.ny * 0.2, hz + wHit.nz * 0.2, 1, 0.7, 0.35, 0.5, 3, 0.07);
      if (Math.random() < 0.4) game.audio.play('impact', { x: hx, y: hy, z: hz });
      // destructible voxels (host-authoritative in co-op)
      game.applyVoxelDamage(wHit.x, wHit.y, wHit.z, damage);
    } else if (wallT < MAX) {
      // hit a door
      const hx = origin.x + dir.x * wallT;
      const hy = origin.y + dir.y * wallT;
      const hz = origin.z + dir.z * wallT;
      game.tracers.fire(muzzle.x, muzzle.y, muzzle.z, hx, hy, hz);
      game.particles.impact(hx, hy, hz, -dir.x, -dir.y, -dir.z, 0.7, 0.7, 0.8);
    } else {
      // shot into the void — still show the streak
      game.tracers.fire(
        muzzle.x, muzzle.y, muzzle.z,
        origin.x + dir.x * MAX, origin.y + dir.y * MAX, origin.z + dir.z * MAX
      );
    }
  }

  private animate(dt: number, game: Game): void {
    const pl = game.player;
    const t = performance.now() * 0.001;
    this.shotT += dt;
    this.kickRoll *= Math.exp(-12 * dt);

    // look sway: the gun lags behind turns (teleports/respawns ignored)
    let dYaw = pl.yaw - this.lastYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    const dPitch = pl.pitch - this.lastPitch;
    this.lastYaw = pl.yaw;
    this.lastPitch = pl.pitch;
    const inv = 1 / Math.max(dt, 1 / 240);
    const sx = Math.abs(dYaw) < 0.5 ? Math.max(-0.045, Math.min(0.045, dYaw * inv * 0.012)) : 0;
    const sy = Math.abs(dPitch) < 0.5 ? Math.max(-0.03, Math.min(0.03, -dPitch * inv * 0.01)) : 0;
    const k = 1 - Math.exp(-10 * dt);
    this.swayX += (sx - this.swayX) * k;
    this.swayY += (sy - this.swayY) * k;

    // walk bob in step with the camera bob + footsteps (figure-8), breathing at rest
    const amp = pl.bobAmp;
    const bobX = Math.sin(pl.bobPhase) * 0.014 * amp;
    const bobY = (Math.cos(pl.bobPhase * 2) - 1) * 0.0065 * amp + Math.sin(t * 1.7) * 0.0025 * (1 - amp);

    // landing dip, scaled by fall speed
    if (!pl.onGround) {
      this.airVy = Math.min(this.airVy, pl.vel.y);
    } else {
      if (this.airVy < -5) this.landDip = Math.min(0.055, -this.airVy * 0.0035);
      this.airVy = 0;
    }
    this.landDip *= Math.exp(-7 * dt);

    // weapon switch swings the gun down and in, not just straight down
    const lower = 1 - this.raiseT;

    // per-weapon moving parts
    const p = this.parts;
    let jx = 0;
    let jy = 0;
    let pumpTilt = 0;
    const s = this.shotT;
    if (this.current === 'pistol' && p.slide) {
      p.slide.position.z = this.basePos.get(p.slide)! + blowback(s, 0.025, 0.09) * 0.07;
    } else if (this.current === 'shotgun' && p.pump) {
      // rack the forend back and forward once the recoil settles
      const ph = Math.max(0, Math.min(1, (s - 0.2) / 0.42));
      const rack = Math.sin(ph * Math.PI);
      p.pump.position.z = this.basePos.get(p.pump)! + rack * 0.12;
      pumpTilt = rack * 0.07;
      if (this.pumpStage === 0 && ph > 0.15) {
        this.pumpStage = 1;
        game.audio.play('pumpBack');
        // spent hull out of the port
        const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
        const rx = Math.cos(pl.yaw), rz = -Math.sin(pl.yaw);
        game.particles.casing(pl.pos.x + fx * 0.6 + rx * 0.18, pl.eyeY() - 0.16, pl.pos.z + fz * 0.6 + rz * 0.18, rx, rz);
      } else if (this.pumpStage === 1 && ph > 0.85) {
        this.pumpStage = 2;
        game.audio.play('pumpFwd');
      }
    } else if (this.current === 'smg' && p.bolt) {
      p.bolt.position.z = this.basePos.get(p.bolt)! + (s < 0.045 ? 0.035 : 0);
      if (s < 0.11) {
        jx = (Math.random() - 0.5) * 0.007;
        jy = (Math.random() - 0.5) * 0.007;
      }
    } else if (this.current === 'rocket' && p.led) {
      const ready = this.cooldown === 0 && pl.ammo.rockets > 0;
      if (ready !== this.rocketReady) {
        if (ready && this.rocketReady === false) game.audio.play('rocketReady');
        this.rocketReady = ready;
        (p.led.material as THREE.MeshBasicMaterial).color.setHex(ready ? EXIT_GREEN : KEY_RED, THREE.LinearSRGBColorSpace);
      }
    } else if (this.current === 'arc') {
      // coils: travelling pulse, dimmer while recharging, white flare on fire
      const charge = 1 - Math.min(1, this.cooldown * WEAPONS.arc.rate);
      const flare = s < 0.12 ? (1 - s / 0.12) * 0.9 : 0;
      p.coils.forEach((c, i) => glowAt(c, (0.62 + 0.18 * Math.sin(t * 7 - i * 1.3)) * (0.5 + 0.5 * charge) + flare));
      glowAt(p.core!, 0.75 + Math.random() * 0.25 * charge + flare);
      for (const tip of p.tips) glowAt(tip, 0.45 + 0.55 * charge + flare);
      const cells = Math.min(1, pl.ammo.cells / 30);
      (p.cellWindow!.material as THREE.MeshBasicMaterial).color.setRGB(0.2 * cells, 0.82 * cells, cells);
    }

    this.viewModel.position.set(
      0.3 + bobX + this.swayX + jx + lower * 0.05,
      this.vmY + bobY + this.swayY + jy - lower * 0.3 - this.landDip,
      -0.62 + this.kickZ,
    );
    this.viewModel.rotation.set(
      this.kickZ * 0.9 - lower * 0.75 + this.swayY * 1.6,
      -this.swayX * 1.4,
      -this.kickZ * 0.35 + this.kickRoll + lower * 0.4 + bobX * 0.8 + pumpTilt,
    );

    // tint the gun (and its edges) by local light; glow parts stay full-bright
    this.lightTick += dt;
    if (this.lightTick > 0.12) {
      this.lightTick = 0;
      const l = game.world.sampleLight01(pl.pos.x, pl.pos.y, pl.pos.z, _light);
      const d = game.dynLights.sampleAt(pl.pos.x, pl.pos.y, pl.pos.z, _dyn);
      // high floor: the gun must read as a shape even in dark corridors
      const r = Math.min(1.3, 0.62 + l[0] * 1.15 + d[0]);
      const g = Math.min(1.3, 0.62 + l[1] * 1.15 + d[1]);
      const b = Math.min(1.3, 0.62 + l[2] * 1.15 + d[2]);
      const model = this.models.get(this.current);
      model?.traverse((o) => {
        if (o instanceof THREE.Mesh && !o.userData.glow) {
          const m = o.material as THREE.MeshBasicMaterial;
          const base = o.userData.baseColor as THREE.Color;
          m.color.setRGB(base.r * r, base.g * g, base.b * b);
        }
      });
    }
  }
}
