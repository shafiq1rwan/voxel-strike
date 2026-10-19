import * as THREE from 'three';
import type { LevelPreview, PreviewArt } from '../game';
import type { LevelData } from '../world/levelgen';
import type { RoomDef } from '../types';
import { VoxelWorld } from '../world/world';
import { Block } from '../world/blocks';
import { GeothermalScenery } from './geothermal-scenery';

// Authored, standalone Sector 6. Heat channels are recessed beside guarded bridges;
// Power Link is optional and never gates the red-key route.
const NODE = { x: 17, y: 2, z: 22 };
const AMBER = 0xffb52e, GREEN = 0x64f58a;

function generate(seed: number): LevelData {
  const world = new VoxelWorld(64, 19, 64);
  const layout: Array<[number, number, number, number, RoomDef['kind'], number]> = [
    [22, 48, 16, 10, 'spawn', 0],
    [12, 22, 36, 26, 'arena', 1],
    [3, 25, 7, 12, 'normal', 2],
    [34, 8, 14, 10, 'key', 2],
    [12, 6, 14, 12, 'exit', 3],
  ];
  const rooms: RoomDef[] = layout.map(([x, z, w, d, kind, dist], id) => ({
    id, x, z, w, d, h: id === 1 ? 15 : 6,
    cx: x + Math.floor(w / 2), cz: z + Math.floor(d / 2), kind, dist,
  }));
  const carve = (x: number, z: number, w: number, d: number, h: number): void => {
    for (let xx = x - 1; xx <= x + w; xx++) for (let zz = z - 1; zz <= z + d; zz++) {
      for (let y = 0; y <= h + 1; y++) {
        const inside = xx >= x && xx < x + w && zz >= z && zz < z + d;
        if (inside) world.set(xx, y, zz, y === 0 ? Block.Floor : y === h + 1 ? Block.Ceil : Block.Air);
        else if (world.get(xx, y, zz) === Block.Rock) world.set(xx, y, zz, h === 15 ? Block.Basalt : Block.WallRust);
      }
    }
  };
  for (const r of rooms) carve(r.x, r.z, r.w, r.d, r.h);
  for (const [x, z, w, d] of [[29, 44, 7, 4], [10, 30, 2, 3], [33, 18, 2, 4], [26, 12, 8, 2]]) carve(x, z, w, d, 4);
  for (const r of rooms) {
    for (let x = r.x + 2; x < r.x + r.w - 1; x += 6) {
      world.set(x, r.h + 1, r.z + 2, Block.LampWarm);
      world.set(x, r.h + 1, r.z + r.d - 3, Block.LampTeal);
    }
  }
  // Collision-only furnace sits to the LEFT of the main bridge, as in the reference.
  for (let x = 21; x <= 26; x++) for (let z = 29; z <= 34; z++) {
    for (let y = 1; y <= 14; y++) world.set(x, y, z, Block.PowerBarrier);
  }
  for (const [x, z] of [[17, 35], [43, 35], [14, 26], [43, 26]]) {
    for (let y = 1; y <= 15; y++) world.set(x, y, z, Block.PowerBarrier);
  }
  // Recessed lava channels, interrupted by two broad cross bridges.
  for (const [lo, hi] of [[26, 28], [39, 41]]) for (let x = lo; x <= hi; x++) for (let z = 23; z <= 47; z++) {
    if ((z >= 26 && z <= 28) || (z >= 38 && z <= 40)) continue;
    if (x <= 26 && z >= 29 && z <= 34) continue;
    world.set(x, 0, z, Block.Air);
    for (const edge of [lo - 1, hi + 1]) world.set(edge, 1, z, Block.PowerBarrier);
  }
  // Walkable upper maintenance galleries and a left stair with half-block visual treads.
  for (let z = 23; z <= 42; z++) for (let x = 12; x <= 16; x++) world.set(x, 5, z, Block.PowerBarrier);
  for (let x = 12; x <= 47; x++) for (let z = 22; z <= 24; z++) world.set(x, 8, z, Block.PowerBarrier);
  for (let z = 22; z <= 42; z++) for (let x = 45; x <= 47; x++) world.set(x, 8, z, Block.PowerBarrier);
  for (let z = 29; z <= 31; z++) for (let x = 17; x <= 20; x++) world.set(x, 5, z, Block.PowerBarrier);
  for (let i = 0; i < 5; i++) for (let x = 19; x <= 20; x++) for (let y = 1; y <= i + 1; y++) {
    world.set(x, y, 40 - i * 2, Block.PowerBarrier);
    world.set(x, y, 39 - i * 2, Block.PowerBarrier);
  }
  // Supply alcove, closed on every side except its animated front grille.
  for (let x = 20; x <= 26; x++) for (let z = 22; z <= 26; z++) {
    for (let y = 1; y <= 4; y++) {
      if (x === 20 || x === 26 || y === 4) world.set(x, y, z, Block.Metal);
      else if (z === 26) world.set(x, y, z, Block.PowerBarrier);
    }
  }
  world.set(NODE.x, NODE.y, NODE.z, Block.LampWarm);
  // Exit ledge and standard lift, behind the red access door.
  for (let x = 12; x < 26; x++) for (let z = 6; z <= 9; z++) {
    for (let y = 1; y <= 3; y++) world.set(x, y, z, Block.Metal);
  }
  for (let x = 12; x < 26; x++) if (x !== 18 && x !== 19) world.set(x, 4, 9, Block.Trim);
  for (let x = 18; x <= 19; x++) for (let z = 8; z <= 9; z++) world.set(x, 3, z, Block.ExitPad);
  for (const [x, z] of [[25, 51], [35, 52], [6, 27], [44, 11], [39, 39]]) world.set(x, 1, z, Block.Crate);
  for (const [x, z] of [[44, 34], [35, 24]]) world.set(x, 1, z, Block.Barrel);
  const enemies: LevelData['enemies'] = [
    { kind: 'kilnDrone', x: 35.5, z: 35.5, roomId: 1 },
    { kind: 'cinderHulk', x: 34.5, z: 27.5, roomId: 1 },
    { kind: 'ventStalker', x: 44.5, z: 31.5, roomId: 1 },
    { kind: 'ventStalker', x: 6.5, z: 30.5, roomId: 2 },
  ];
  // Real static orange/teal illumination underneath the custom scenery.
  for (const x of [25, 42]) for (let z = 24; z < 48; z += 4) world.set(x, 0, z, Block.GeothermalHeat);
  for (const [x, z] of [[13, 28], [46, 28], [13, 39], [46, 39]]) world.set(x, 9, z, Block.LampTeal);
  world.bakeLighting([36, 30, 43]);
  return { world, seed, rooms, enemies, totalEnemies: enemies.length, totalSecrets: 0, secretRect: null,
    responseKinds: ['ventStalker', 'kilnDrone'],
    responseCount: 2,
    theme: 'facility', spawn: { x: 30.2, y: 2.05, z: 46 },
    doors: [{ x: 33, z: 21, dir: 'z', locked: 'red' }],
    elevator: { x: 18, z: 10, lowY: 1, highY: 4, walkAxis: 'z' },
    exitPad: { x: 19, y: 4, z: 9 },
    pickups: [
      { kind: 'keyRed', x: 6.5, y: 1.5, z: 34.5 },
      { kind: 'healthBig', x: 5.5, y: 1.5, z: 28.5 },
      { kind: 'ammoShells', x: 35.5, y: 1.5, z: 41.5 },
      { kind: 'armorVest', x: 23.5, y: 1.5, z: 23.5, sealed: true },
      { kind: 'ammoShells', x: 21.7, y: 1.5, z: 23.5, sealed: true },
      { kind: 'ammoCells', x: 25.2, y: 1.5, z: 23.5, sealed: true },
    ],
  };
}

function decorate(level: LevelData): PreviewArt {
  const group = new THREE.Group();
  group.name = 'geothermal-preview-art';
  const scenery = new GeothermalScenery(); scenery.build(); group.add(scenery.group);
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const materials = new Map<number, THREE.MeshBasicMaterial>();
  const batches = new Map<number, THREE.Matrix4[]>();
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, color: number): void => {
    if (!batches.has(color)) batches.set(color, []);
    batches.get(color)!.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rotation, new THREE.Vector3(w, h, d)));
  };
  const material = (color: number): THREE.MeshBasicMaterial => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshBasicMaterial({ color }));
    return materials.get(color)!;
  };
  const signTextures: THREE.CanvasTexture[] = [];
  const sign = (text: string, x: number, y: number, z: number, w: number, color = '#e4d8b9'): void => {
    const multiline = text.includes('\n');
    const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = multiline ? 160 : 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#10151b'; ctx.fillRect(0, 0, 512, canvas.height);
    ctx.fillStyle = color; ctx.font = 'bold 30px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (multiline) {
      ctx.font = 'bold 42px monospace'; ctx.fillText(text.split('\n')[0], 256, 48, 490);
      ctx.fillStyle = '#ffac35'; ctx.font = 'bold 36px monospace'; ctx.fillText(text.split('\n')[1], 256, 113, 490);
    } else ctx.fillText(text, 256, 33, 490);
    const tex = new THREE.CanvasTexture(canvas); tex.magFilter = tex.minFilter = THREE.NearestFilter;
    signTextures.push(tex);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, w * canvas.height / canvas.width), new THREE.MeshBasicMaterial({ map: tex }));
    mesh.position.set(x, y, z); group.add(mesh);
  };
  sign('SECTOR 6\nGEOTHERMAL CORE', 34, 7, 22.85, 8);
  sign('POWER LINK / SHOOT NODE', 17.5, 4.4, 22.04, 6, '#ffbd45');
  sign('OPTIONAL SUPPLIES', 23.5, 4.7, 26.55, 5);
  sign('RED ACCESS / TRANSIT', 19, 5.4, 6.04, 8);
  sign('COOLANT CONTROL', 6.5, 4.4, 25.04, 6, '#70dfff');
  sign('SECURITY / RED KEY', 41, 4.8, 8.04, 8);
  // Signal strip follows a continuous wall-mounted conduit to the cage.
  box(22, 5.2, 22.22, 9.1, 0.32, 0.34, 0x242c36);
  box(26.55, 5.2, 24.4, 0.32, 0.32, 4.4, 0x242c36);
  box(17.5, 2.5, 22.5, 1.5, 1.5, 1.1, 0x303943);
  const signalMaterial = new THREE.MeshBasicMaterial({ color: AMBER });
  const signal = (x: number, y: number, z: number, w: number, h: number, d: number): void => {
    const mesh = new THREE.Mesh(geometry, signalMaterial); mesh.position.set(x, y, z); mesh.scale.set(w, h, d); group.add(mesh);
  };
  signal(17.5, 2.5, 23.065, 0.85, 0.85, 0.06);
  box(17.5, 2.5, 23.11, 0.4, 0.4, 0.05, 0x202731);
  signal(17.5, 3.8, 23.01, 0.14, 2.8, 0.1);
  signal(17.5, 5.2, 22.7, 0.14, 0.14, 0.7);
  signal(22, 5.2, 22.42, 9.1, 0.13, 0.1);
  signal(26.55, 5.2, 24.4, 0.14, 0.14, 4.3);
  signal(26.55, 3.9, 26.56, 0.14, 2.6, 0.12);
  signal(26.55, 2.6, 26.56, 0.45, 0.45, 0.12);
  box(26.55, 2.6, 26.45, 0.7, 0.7, 0.15, 0x303943);
  const gate = new THREE.Group(); gate.name = 'power-link-gate'; group.add(gate);
  const gateMaterial = material(0x78848a);
  for (let x = 21.15; x < 26; x += 0.5) {
    const bar = new THREE.Mesh(geometry, gateMaterial); bar.position.set(x, 2.5, 26.5); bar.scale.set(0.12, 3, 0.16); gate.add(bar);
  }
  for (const y of [1.1, 3.9]) {
    const bar = new THREE.Mesh(geometry, gateMaterial); bar.position.set(23.5, y, 26.5); bar.scale.set(5, 0.2, 0.22); gate.add(bar);
  }
  for (const [color, transforms] of batches) {
    const mesh = new THREE.InstancedMesh(geometry, material(color), transforms.length);
    transforms.forEach((transform, i) => mesh.setMatrixAt(i, transform)); group.add(mesh);
  }
  // A small reusable set of steam puffs, contained above the exchanger.
  const steam = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial({ color: 0xbbc5c5, transparent: true, opacity: 0.24, depthWrite: false }), 10);
  group.add(steam);
  let solved = false, opened = false, opening = 0, time = 0, hinted = false;
  group.userData.powerLink = { solved: false, opened: false, node: NODE };
  return {
    group,
    voxelHit(x, y, z, game): boolean {
      if (x !== NODE.x || y !== NODE.y || z !== NODE.z) return false;
      if (!solved) {
        solved = true; group.userData.powerLink.solved = true;
        signalMaterial.color.setHex(GREEN);
        game.audio.play('pickupWeapon');
        game.hud.message('POWER LINK RESTORED — supply cage opening.');
        game.dynLights.flash(17.5, 2.5, 23.5, 0.3, 1, 0.5, 2, 8, 0.7);
      }
      return true;
    },
    update(dt, game): void {
      time += dt; scenery.update(time);
      for (let i = 0; i < 10; i++) {
        const phase = (time * 0.32 + i / 10) % 1;
        const outlet = i < 5 ? 26 : 43;
        matrix.compose(new THREE.Vector3(outlet + Math.sin(i * 7) * .3, 2 + phase * 3, 37.7), rotation, new THREE.Vector3().setScalar(0.22 + phase * .8));
        steam.setMatrixAt(i, matrix);
      }
      steam.instanceMatrix.needsUpdate = true;
      if (!hinted && !solved && game.player.pos.distanceTo(new THREE.Vector3(21, 2, 30)) < 7) {
        hinted = true; game.hud.message('Optional supplies: follow the amber cable and shoot the square node.');
      }
      if (solved && !opened) {
        opening = Math.min(1, opening + dt * 1.1);
        gate.position.y = opening * 3.2;
        if (opening === 1) {
          opened = true; group.userData.powerLink.opened = true;
          for (let x = 21; x <= 25; x++) for (let y = 1; y <= 3; y++) level.world.setAndDirty(x, y, 26, Block.Air);
          for (const pickup of level.pickups) if (pickup.sealed) pickup.sealed = false;
          game.audio.play('pickupWeapon'); game.hud.message('CACHE OPEN — collect your supplies.');
        }
      }
    },
    dispose(): void {
      group.remove(scenery.group); scenery.dispose();
      const geometries = new Set<THREE.BufferGeometry>();
      const mats = new Set<THREE.Material>();
      group.traverse(o => { if (o instanceof THREE.Mesh) { geometries.add(o.geometry); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => mats.add(m)); if (o instanceof THREE.InstancedMesh) o.dispose(); } });
      geometries.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); signTextures.forEach(t => t.dispose());
    },
  };
}

function showScreen(onStart: () => void, onLeave: () => void, cleared = false): () => void {
  const el = document.createElement('div'); el.className = 'screen'; el.style.cursor = 'default';
  el.innerHTML = `<div class="panel"><h1 class="win" style="font-size:28px;letter-spacing:3px">GEOTHERMAL ${cleared ? 'CLEARED' : 'CORE'}</h1>
    <p>Sector 6 development preview</p>
    <p>${cleared ? 'Transit secured. Return to explore the core again.' : 'Explore the heat exchanger. Find the red keycard and reach the transit lift.'}</p>
    <p>Optional Power Link: follow the amber cable and shoot its node to open the supply cage.</p>
    <p>Cinder Hulk · Vent Stalker · Kiln Drone</p>
    <p>All weapons supplied · Campaign saves untouched</p>
    <div class="screen-btns"><button id="preview-start" class="tbtn tbtn-primary">${cleared ? 'Explore again' : 'Enter the core'}</button>
    <button id="preview-leave" class="tbtn tbtn-quiet">Back to the main game</button></div></div>`;
  const readyAt = performance.now() + 700;
  const stop = (): void => { el.remove(); window.removeEventListener('keydown', key); };
  const start = (): void => { if (performance.now() >= readyAt) { stop(); onStart(); } };
  const key = (e: KeyboardEvent): void => { if (!e.repeat && ['Enter', 'NumpadEnter', 'Space'].includes(e.code)) { e.preventDefault(); start(); } };
  el.querySelector('#preview-start')!.addEventListener('click', start);
  el.querySelector('#preview-leave')!.addEventListener('click', () => { stop(); onLeave(); });
  window.addEventListener('keydown', key); document.body.appendChild(el); return stop;
}

export const geothermal: LevelPreview = { sector: 6, name: 'GEOTHERMAL CORE', generate, decorate, showScreen };
