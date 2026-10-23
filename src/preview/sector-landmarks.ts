import * as THREE from 'three';
import type { PreviewArt } from '../game';
import type { LevelData } from '../world/levelgen';
import { decorateGeothermal } from './geothermal-gen';

/** One textured instance batch for solid machinery, one for emissive lamp panels. */
export function decorateSectorLandmarks(level: LevelData): PreviewArt {
  const architecture = level.architecture!;
  const group = new THREE.Group(); group.name = `${level.theme}-art`;
  group.userData.beds = architecture.beds;
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
  const ctx = canvas.getContext('2d')!;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const n = 175 + ((x * 71 + y * 37 + x * y * 13) % 65);
    ctx.fillStyle = `rgb(${n},${n},${n})`; ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = '#818181'; ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 0, 1, 16);
  const texture = new THREE.CanvasTexture(canvas); texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.NoColorSpace;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const colors = new Float32Array(72);
  for (let i = 0; i < 24; i++) colors.fill([0.76, 0.76, 1, 0.5, 0.86, 0.86][Math.floor(i / 4)], i * 3, i * 3 + 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const materials: THREE.Material[] = [];
  const meshes: THREE.InstancedMesh[] = [];
  const matrix = new THREE.Matrix4(), pos = new THREE.Vector3(), scale = new THREE.Vector3(), q = new THREE.Quaternion();
  for (const glow of [false, true]) {
    const items = architecture.boxes.filter((it) => !!it.glow === glow);
    if (!items.length) continue;
    const mat = new THREE.MeshBasicMaterial({ map: glow ? null : texture, vertexColors: true, fog: true }); materials.push(mat);
    const mesh = new THREE.InstancedMesh(geometry, mat, items.length);
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, matrix.compose(pos.set(it.x, it.y, it.z), q, scale.set(it.w, it.h, it.d)));
      const l = level.world.sampleLight01(it.x, it.y, it.z);
      const floor = glow ? 1 : 0.62;
      mesh.setColorAt(i, new THREE.Color().setRGB((it.color >> 16 & 255) / 255 * Math.max(floor, l[0]), (it.color >> 8 & 255) / 255 * Math.max(floor, l[1]), (it.color & 255) / 255 * Math.max(floor, l[2])));
    });
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); meshes.push(mesh); group.add(mesh);
  }
  const signGeometry = new THREE.PlaneGeometry(1, 1), signTextures: THREE.Texture[] = [];
  for (const spec of architecture.signs) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 72;
    const context = c.getContext('2d')!;
    context.fillStyle = '#242a30'; context.fillRect(0, 0, 512, 72);
    context.strokeStyle = '#6b7378'; context.lineWidth = 4; context.strokeRect(2, 2, 508, 68);
    context.fillStyle = '#d4cbb5'; context.font = 'bold 34px monospace'; context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(spec.text, 256, 37, 480);
    const tex = new THREE.CanvasTexture(c); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.NoColorSpace; signTextures.push(tex);
    const mat = new THREE.MeshBasicMaterial({ map: tex, fog: true }); materials.push(mat);
    const sign = new THREE.Mesh(signGeometry, mat); sign.position.set(spec.x, spec.y, spec.z); sign.scale.set(spec.w, spec.w * 72 / 512, 1); group.add(sign);
  }
  const puzzle = level.powerLink ? decorateGeothermal(level) : null;
  if (puzzle) group.add(puzzle.group);
  return {
    group,
    voxelHit: puzzle?.voxelHit?.bind(puzzle),
    update: puzzle?.update?.bind(puzzle),
    dispose(): void {
      puzzle?.dispose(); meshes.forEach((m) => m.dispose()); geometry.dispose(); signGeometry.dispose(); texture.dispose(); signTextures.forEach((t) => t.dispose()); materials.forEach((m) => m.dispose()); group.clear();
    },
  };
}
