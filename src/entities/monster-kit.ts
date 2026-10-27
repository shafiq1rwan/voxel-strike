import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rayBox } from '../core/physics';

/**
 * Shared box-rig helpers for the sector monsters (facility-monsters.ts,
 * bio-monsters.ts): flat-coloured boxes with baked per-face shade, one
 * material per colour per rig (the CPU lighting in enemies.ts tints it), a
 * worn-metal grain, glow parts that skip the lighting, and jointed groups.
 */
export const raw = (color: number): THREE.Color => new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace);
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
export const ease = (v: number): number => { const t = clamp01(v); return t * t * (3 - 2 * t); };
/** 0 → 1 over [a, b] of t, smoothed */
export const span = (t: number, a: number, b: number): number => ease((t - a) / (b - a));
export const angleTo = (from: number, to: number): number => Math.atan2(Math.sin(to - from), Math.cos(to - from));
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

/** prepare → commit → recover timings, the same for both attack slots */
export const sched = (prep: number, lock: number, commit: number, recover: number) => {
  const s = { prep, lock, commit, recover };
  return { attack: s, charge: s };
};

/**
 * Exact ray hits against a rig's original boxes, following their live pivots
 * after `bake()` merged the render meshes (Wire Leech coil, Carapace core and
 * plates). Record BEFORE baking; each box carries a tag from `tag(part)`.
 */
export class HitBoxes<T extends string> {
  /** the recorded boxes (tests aim real shots at them by name) */
  readonly parts: { name: string; tag: T; parent: THREE.Object3D; matrix: THREE.Matrix4; box: THREE.Box3 }[] = [];

  constructor(private mesh: THREE.Object3D, private body: THREE.Object3D, tag: (part: THREE.Mesh) => T) {
    body.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      part.updateMatrix(); part.geometry.computeBoundingBox();
      this.parts.push({ name: part.name, tag: tag(part), parent: part.parent!, matrix: part.matrix.clone(), box: part.geometry.boundingBox!.clone() });
    });
  }

  /** nearest box along the ray within maxT (world units), or null */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): { t: number; tag: T } | null {
    // the occlusion cull may detach the body from the mesh: include the enemy transform explicitly
    this.mesh.updateWorldMatrix(true, false);
    this.body.updateWorldMatrix(false, true);
    let best: { t: number; tag: T } | null = null;
    for (const part of this.parts) {
      _partWorld.copy(part.parent.matrixWorld).multiply(part.matrix);
      if (this.body.parent !== this.mesh) _partWorld.premultiply(this.mesh.matrixWorld);
      _inverse.copy(_partWorld).invert();
      _origin.set(ox, oy, oz).applyMatrix4(_inverse);
      // transform a displacement, not a normalized direction: t stays in world units
      _direction.set(ox + dx, oy + dy, oz + dz).applyMatrix4(_inverse).sub(_origin);
      const b = part.box;
      const t = rayBox(_origin.x, _origin.y, _origin.z, _direction.x, _direction.y, _direction.z, best?.t ?? maxT,
        { minX: b.min.x, minY: b.min.y, minZ: b.min.z, maxX: b.max.x, maxY: b.max.y, maxZ: b.max.z });
      if (t !== null && (!best || t < best.t)) best = { t, tag: part.tag };
    }
    return best;
  }
}
const _partWorld = new THREE.Matrix4(), _inverse = new THREE.Matrix4();
const _origin = new THREE.Vector3(), _direction = new THREE.Vector3();

export class RigKit {
  boxCount = 0;
  private mats = new Map<string, THREE.MeshBasicMaterial>();
  private textures: THREE.Texture[] = [];
  /** full-bright parts (eyes, cores, reservoirs): posed by brightness, not lit */
  readonly glow: THREE.Mesh[] = [];
  private grime: THREE.CanvasTexture;

  constructor() {
    this.grime = this.texture();
  }

  /** worn-metal grain shared by every lit part: keeps the boxes from reading as flat plastic */
  private texture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const n = Math.abs(Math.sin(Math.floor(x / 2) * 12.9 + Math.floor(y / 2) * 78.2));
      const g = 214 + Math.floor(n * 32);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(x, y, 1, 1);
    }
    const tex = new THREE.CanvasTexture(canvas); tex.magFilter = tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.NoColorSpace; this.textures.push(tex); return tex;
  }

  part(parent: THREE.Object3D, name: string, x: number, y: number, z: number, w: number, h: number, d: number, color: number, bright = false): THREE.Mesh {
    this.boxCount++;
    const key = `${color}:${bright}`;
    if (!this.mats.has(key)) this.mats.set(key, new THREE.MeshBasicMaterial({ color: raw(color), map: bright ? null : this.grime, vertexColors: true, fog: true }));
    const geo = new THREE.BoxGeometry(w, h, d), colors = new Float32Array(geo.attributes.position.count * 3);
    const shade = bright ? [1, 1, 1, 1, 1, 1] : [.76, .9, 1, .5, .68, .95];
    for (let i = 0; i < geo.attributes.position.count; i++) colors.fill(shade[Math.floor(i / 4)], i * 3, i * 3 + 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geo, this.mats.get(key)!); mesh.name = name; mesh.position.set(x, y, z);
    mesh.userData.baseColor = raw(color); mesh.userData.fullBright = bright; parent.add(mesh);
    if (bright) this.glow.push(mesh);
    return mesh;
  }

  /** Opt-in: bake static boxes at each animation pivot, retaining vertex palette/shading.
   * Lit colors share one draw per pivot; independently pulsing emitters stay separate.
   * Does not flatten joints or change rigs which have not opted into baking.
   */
  bake(root: THREE.Group): void {
    root.userData.boxCount = this.boxCount;
    const lit = new THREE.MeshBasicMaterial({ color: raw(0xffffff), map: this.grime, vertexColors: true, fog: true });
    this.mats.set('baked-lit', lit);
    const visit = (pivot: THREE.Object3D): void => {
      const buckets = new Map<THREE.Material, THREE.Mesh[]>();
      for (const child of [...pivot.children]) {
        if (!(child instanceof THREE.Mesh)) { visit(child); continue; }
        const material = child.userData.fullBright ? child.material as THREE.Material : lit;
        const list = buckets.get(material) ?? []; list.push(child); buckets.set(material, list);
      }
      for (const [material, parts] of buckets) {
        // A single glow keeps its handle (the Bud eye and Leech emitter).
        if (parts.length === 1 && parts[0].userData.fullBright) continue;
        const bright = !!parts[0].userData.fullBright;
        const geometries = parts.map(part => {
          part.updateMatrix();
          const geometry = part.geometry.clone().applyMatrix4(part.matrix);
          if (!bright) {
            const color = geometry.getAttribute('color');
            const base = part.userData.baseColor as THREE.Color;
            for (let i = 0; i < color.count; i++) color.setXYZ(i, color.getX(i) * base.r, color.getY(i) * base.g, color.getZ(i) * base.b);
          }
          return geometry;
        });
        const geometry = mergeGeometries(geometries)!;
        geometries.forEach(g => g.dispose());
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = `${pivot.name || 'body'}-${bright ? 'glow' : 'lit'}`;
        mesh.userData.baseColor = bright ? parts[0].userData.baseColor : raw(0xffffff);
        mesh.userData.fullBright = bright;
        mesh.userData.boxCount = parts.length;
        for (const part of parts) {
          const i = this.glow.indexOf(part); if (i >= 0) this.glow.splice(i, 1);
          pivot.remove(part); part.geometry.dispose();
        }
        if (bright) this.glow.push(mesh);
        pivot.add(mesh);
      }
    };
    visit(root);
  }

  joint(parent: THREE.Object3D, name: string, x: number, y: number, z: number): THREE.Group {
    const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); parent.add(g); return g;
  }

  /** a glow part's brightness (1 = its base colour) */
  glowK(mesh: THREE.Mesh | null, k: number): void {
    if (!mesh) return;
    (mesh.material as THREE.MeshBasicMaterial).color.copy(mesh.userData.baseColor as THREE.Color).multiplyScalar(k);
  }

  dispose(): void {
    this.textures.forEach((t) => t.dispose());
    this.mats.forEach((m) => m.dispose());
  }
}
