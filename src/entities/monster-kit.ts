import * as THREE from 'three';

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

export class RigKit {
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
