import * as THREE from 'three';
import { decorateSectorLandmarks } from './sector-landmarks';
import type { LevelPreview, PreviewArt } from '../game';
import { generateLevel, type LevelData } from '../world/levelgen';
import { Block } from '../world/blocks';
import { ENVIRONMENTS, type NewTheme } from '../world/environments';
import { decorateGeothermal } from './geothermal-gen';

type Box = { x: number; y: number; z: number; w: number; h: number; d: number; bed?: number };

/** Instanced, box-built landmarks. Floor cover always uses existing solid footprints. */
export function decorateEnvironment(level: LevelData, theme: NewTheme): PreviewArt {
  if (level.architecture) return decorateSectorLandmarks(level);
  const group = new THREE.Group(); group.name = `${theme}-art`;
  const batches = new Map<number, Box[]>();
  const box = (color: number, x: number, y: number, z: number, w: number, h: number, d: number, bed?: number): void => {
    const items = batches.get(color) ?? []; items.push({ x, y, z, w, h, d, bed }); batches.set(color, items);
  };
  const STEEL = 0x626b73, DARK = 0x293139, IVORY = 0xc5c6b6, MINT = 0x648f83;
  const rooms = level.rooms.filter((r) => r.kind !== 'exit');
  const beds: Array<Array<[number, number]>> = [];
  const used = new Set<string>();
  let wardBeds = 0;

  for (const r of rooms) {
    if (r.h >= 5 && (r.kind === 'arena' || r.kind === 'spawn' || r.w * r.d > 120)) {
      if (theme === 'freight') {
        // Two gantry rails, travelling bridge, hoist and a suspended cargo frame.
        const y = r.h - 0.35;
        for (const x of [r.x + 0.5, r.x + r.w - 0.5]) box(STEEL, x, y, r.cz, 0.3, 0.4, r.d - 1);
        box(0x9b683b, r.cx, y - 0.25, r.cz, r.w - 1, 0.55, 0.65);
        box(DARK, r.cx, y - 0.65, r.cz, 1.4, 0.5, 0.9);
        box(STEEL, r.cx, y - 1.1, r.cz, 0.14, 0.6, 0.14);
        const bottom = Math.max(3.7, y - 1.5);
        for (const z of [-0.65, 0.65]) box(0x9b683b, r.cx, bottom, r.cz + z, 2.8, 0.18, 0.18);
        for (const x of [-1.3, 1.3]) box(0x9b683b, r.cx + x, bottom, r.cz, 0.18, 0.18, 1.4);
      } else if (theme === 'excavation') {
        // Heavy rock-cut arch ribs and a square-step mining head above the walking lane.
        for (const x of [r.x + 0.3, r.x + r.w - 0.3]) {
          box(STEEL, x, r.h - 0.6, r.cz, 0.5, 0.75, r.d - 1);
          for (let z = r.z + 1; z < r.z + r.d; z += 4) box(0x515967, x, r.h - 0.15, z, 1.1, 0.55, 1.2);
        }
        if (r.kind === 'arena') {
          const cy = r.h - 1.2;
          box(0x9b8144, r.cx, cy, r.z + 0.4, 3.2, 1.8, 0.75);
          for (let i = 0; i < 4; i++) box(i % 2 ? DARK : STEEL, r.cx, cy, r.z + 0.9 + i * 0.3, 2.3 - i * 0.5, 1.6 - i * 0.34, 0.35);
          for (const x of [-1.25, 1.25]) box(0x9b8144, r.cx + x, cy, r.z + 1.05, 0.28, 0.65, 0.8);
        }
      } else {
        // Suspended four-panel surgical lamp; ceiling geometry never reaches the ground lane.
        const x = r.x + r.w * 0.72, z = r.cz;
        box(STEEL, x, r.h - 0.5, z, 0.12, 1, 0.12);
        box(IVORY, x, r.h - 1.05, z, 1.8, 0.22, 1.4);
        for (const dx of [-0.43, 0.43]) for (const dz of [-0.32, 0.32]) box(0xc2e5df, x + dx, r.h - 1.18, z + dz, 0.65, 0.04, 0.46);
      }
    }
    if (theme !== 'medical') continue;
    // Treatment beds recessed into former wall voxels. The original aisle stays completely clear.
    for (const x of [r.x + 2, r.x + r.w - 4]) {
      const z = r.z - 1;
      if (![0, 1].every((dx) => level.world.get(x + dx, 1, z) === Block.PowerBarrier && level.world.get(x + dx, 2, z) === Block.Air)) continue;
      wardBeds++;
      box(DARK, x + 1, 1.48, z + 0.5, 1.95, 0.95, 0.97);
      box(STEEL, x + 1, 1.9, z + 0.5, 1.96, 0.14, 0.94);
      box(IVORY, x + 1, 2.03, z + 0.5, 1.82, 0.16, 0.85);
      box(MINT, x + 1.25, 2.13, z + 0.5, 1.08, 0.04, 0.86);
      box(IVORY, x + 0.33, 2.2, z + 0.5, 0.4, 0.18, 0.65);
      for (const xx of [x + 0.05, x + 1.95]) box(STEEL, xx, 2.22, z + 0.5, 0.06, 0.52, 0.91);
      box(DARK, x + 1.2, 2.72, z + 0.04, 0.72, 0.46, 0.07);
      box(0x55bfc9, x + 1.2, 2.72, z + 0.085, 0.57, 0.29, 0.025);
      box(0xb4ded4, x + 1.2, 2.72, z + 0.1, 0.48, 0.025, 0.015);
    }
    // Monitors sit directly on intact wall faces, away from doors and cracked walls.
    for (let x = r.x + 2; x < r.x + r.w - 2; x += 5) {
      if (![Block.MedicalWall, Block.MedicalWallLower].includes(level.world.get(x, 2, r.z - 1)) || level.world.get(x, 1, r.z) !== Block.Air) continue;
      box(DARK, x + 0.5, 2.55, r.z + 0.04, 0.9, 0.65, 0.08);
      box(0x55bfc9, x + 0.5, 2.55, r.z + 0.09, 0.68, 0.4, 0.025);
      box(0xb4ded4, x + 0.5, 2.55, r.z + 0.11, 0.55, 0.025, 0.01);
      box(0xb4ded4, x + 0.48, 2.58, r.z + 0.11, 0.025, 0.24, 0.01);
    }
    // A pair of existing crates becomes a treatment trolley; it disappears when its support breaks.
    for (let z = r.z; z < r.z + r.d - 1 && beds.length < 8; z++) for (let x = r.x; x < r.x + r.w; x++) {
      if (used.has(`${x},${z}`) || used.has(`${x},${z + 1}`)) continue;
      if ([z, z + 1].some((zz) => level.world.get(x, 1, zz) !== Block.Crate || level.world.get(x, 2, zz) !== Block.Air)) continue;
      const id = beds.length; beds.push([[x, z], [x, z + 1]]); used.add(`${x},${z}`); used.add(`${x},${z + 1}`);
      box(STEEL, x + 0.5, 2.04, z + 1, 0.94, 0.1, 1.92, id);
      box(IVORY, x + 0.5, 2.16, z + 1, 0.86, 0.15, 1.8, id);
      box(MINT, x + 0.5, 2.25, z + 1.3, 0.87, 0.04, 0.9, id);
      box(IVORY, x + 0.5, 2.31, z + 0.35, 0.65, 0.14, 0.35, id);
      for (const zz of [z + 0.06, z + 1.94]) box(STEEL, x + 0.5, 2.35, zz, 0.93, 0.46, 0.07, id);
    }
  }

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const faceColors = new Float32Array(geo.getAttribute('position').count * 3);
  for (let i = 0; i < faceColors.length / 3; i++) faceColors.fill([0.78, 0.78, 1, 0.58, 0.88, 0.88][Math.floor(i / 4)], i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(faceColors, 3));
  const matrix = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scale = new THREE.Vector3();
  const meshes: Array<{ mesh: THREE.InstancedMesh; items: Box[] }> = [];
  const materials: THREE.Material[] = [];
  for (const [hex, items] of batches) {
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: true }); materials.push(mat);
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    items.forEach((it, i) => {
      mesh.setMatrixAt(i, matrix.compose(pos.set(it.x, it.y, it.z), q, scale.set(it.w, it.h, it.d)));
      const light = level.world.sampleLight01(it.x, Math.min(it.y, 3), it.z, [0, 0, 0]);
      mesh.setColorAt(i, new THREE.Color().setRGB((hex >> 16 & 255) / 255 * Math.max(0.55, light[0]), (hex >> 8 & 255) / 255 * Math.max(0.55, light[1]), (hex & 255) / 255 * Math.max(0.55, light[2])));
    });
    mesh.computeBoundingBox(); mesh.computeBoundingSphere(); group.add(mesh); meshes.push({ mesh, items });
  }

  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#192128'; ctx.fillRect(0, 0, 256, 32); ctx.strokeStyle = '#78858b'; ctx.strokeRect(1, 1, 254, 30);
  ctx.fillStyle = theme === 'medical' ? '#b8dace' : '#dbc8a0'; ctx.font = 'bold 19px monospace'; ctx.textAlign = 'center'; ctx.fillText(ENVIRONMENTS[theme].name, 128, 23);
  const texture = new THREE.CanvasTexture(canvas); texture.magFilter = texture.minFilter = THREE.NearestFilter; texture.colorSpace = THREE.NoColorSpace;
  const signMat = new THREE.MeshBasicMaterial({ map: texture, fog: true }); materials.push(signMat);
  const signGeo = new THREE.PlaneGeometry(3.5, 0.44);
  for (const r of rooms.filter((r) => r.kind === 'spawn' || r.kind === 'arena')) {
    // High enough to clear a doorway without changing its collision.
    const sign = new THREE.Mesh(signGeo, signMat); sign.position.set(r.cx, r.h - 0.45, r.z + 0.025); group.add(sign);
  }
  group.userData.beds = beds.length + wardBeds;
  const puzzle = level.powerLink ? decorateGeothermal(level) : null;
  if (puzzle) group.add(puzzle.group);
  let clock = 0;
  return {
    group,
    voxelHit: puzzle?.voxelHit?.bind(puzzle),
    update(dt, game): void {
      puzzle?.update?.(dt, game); clock += dt;
      if (clock < 0.2 || !beds.length) return; clock = 0;
      const broken = beds.map((cells) => cells.some(([x, z]) => level.world.get(x, 1, z) !== Block.Crate));
      for (const { mesh, items } of meshes) {
        let changed = false;
        items.forEach((it, i) => {
          if (it.bed === undefined || !broken[it.bed]) return;
          mesh.setMatrixAt(i, matrix.makeScale(0, 0, 0)); changed = true;
        });
        if (changed) mesh.instanceMatrix.needsUpdate = true;
      }
    },
    dispose(): void {
      puzzle?.dispose(); meshes.forEach(({ mesh }) => mesh.dispose()); geo.dispose(); signGeo.dispose(); texture.dispose(); materials.forEach((m) => m.dispose()); group.clear();
    },
  };
}

/** Standalone web playtest. Uses the existing isolated-preview save/retry lifecycle. */
export function environmentPreview(theme: NewTheme): LevelPreview {
  return {
    sector: 8, name: ENVIRONMENTS[theme].name,
    generate: (seed) => generateLevel(seed, 3, theme),
    decorate: (level) => decorateEnvironment(level, theme),
    showScreen(onStart, onLeave, cleared = false): () => void {
      const el = document.createElement('div'); el.className = 'screen';
      el.innerHTML = `<div class="panel"><h1>${ENVIRONMENTS[theme].name}</h1><p>${cleared ? 'Route secured. Explore another layout.' : 'Find the red keycard, open the locked door, and ride the lift out.'}</p><p>All weapons supplied · Campaign saves untouched</p><div class="screen-btns"><button id="preview-start" class="tbtn tbtn-primary">${cleared ? 'Explore again' : 'Enter map'}</button><button id="preview-leave" class="tbtn tbtn-quiet">Back to the main game</button></div></div>`;
      el.querySelector('#preview-start')!.addEventListener('click', () => { el.remove(); onStart(); });
      el.querySelector('#preview-leave')!.addEventListener('click', () => { el.remove(); onLeave(); });
      document.body.appendChild(el); return () => el.remove();
    },
  };
}
