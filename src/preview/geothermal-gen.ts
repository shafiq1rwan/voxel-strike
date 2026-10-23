import * as THREE from 'three';
import type { Game, PreviewArt } from '../game';
import { wallPerimeter, type GeoLayout, type LevelData } from '../world/levelgen';
import { Block } from '../world/blocks';
import { SCRAP_POWER_LINK } from '../core/upgrades';

/**
 * The optional Power Link puzzle (`LevelData.powerLink`: facility sectors from
 * 2 and the Geothermal Core) + the GENERATED core's scenery (`LevelData.geo`:
 * steam, signs) for sectors 6–7 and its endless depths. Codex's hand-built `?sector6` preview (geothermal.ts) is
 * where the puzzle was designed: an amber cable runs along the walls from a
 * sealed supply cage to a node in the wall; shooting the node turns the cable
 * green, the gate sinks into the floor and the supplies unlock. Optional —
 * it never gates the keycard → door → lift route.
 */

const FACE_SHADE = [0.64, 0.86, 1.0, 0.46, 0.76, 0.58]; // +x -x +y -y +z -z
const AMBER = 0xffb52e;
const GREEN = 0x64f58a;
const CONDUIT = 0x2a2f38;
const GATE = 0x78848a;
const STEAM = 0xc8cfd0;
const PUFFS_PER_VENT = 3;
const GATE_DROP = 3.2;

/** raw palette value: the renderer outputs linear, so a plain hex would be sRGB-decoded and render near-black */
function raw(hex: number): THREE.Color {
  return new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
}

function shadedBox(): THREE.BoxGeometry {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const n = geo.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.fill(FACE_SHADE[Math.floor(i / 4)], i * 3, i * 3 + 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

interface Inst { x: number; y: number; z: number; sx: number; sy: number; sz: number }

export function decorateGeothermal(level: LevelData): PreviewArt {
  const group = new THREE.Group();
  group.name = 'geothermal-art';
  const geo: GeoLayout = level.geo ?? { vents: [], signs: [] };
  const shaded = shadedBox();
  const flat = new THREE.BoxGeometry(1, 1, 1);
  const materials: THREE.Material[] = [];
  const textures: THREE.Texture[] = [];
  const planes: THREE.PlaneGeometry[] = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();

  const instanced = (geom: THREE.BufferGeometry, mat: THREE.Material, items: Inst[]): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geom, mat, Math.max(1, items.length));
    mesh.count = items.length;
    items.forEach((it, i) => mesh.setMatrixAt(i, m4.compose(p.set(it.x, it.y, it.z), q, s.set(it.sx, it.sy, it.sz))));
    mesh.frustumCulled = false; // the unit box's bounds don't cover the instances
    return mesh;
  };

  // ---- signs: low-res pixel text, like the Biofoundry's -------------------
  const sign = (text: string, x: number, y: number, z: number, w: number, ry: number, color = '#ffbd45'): void => {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 24;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#12100f'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#6a4a22'; ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    ctx.fillStyle = color;
    ctx.font = "bold 12px 'Courier New', monospace";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1, canvas.width - 8);
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter; texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.NoColorSpace;
    textures.push(texture);
    const material = new THREE.MeshBasicMaterial({ map: texture });
    materials.push(material);
    const plane = new THREE.PlaneGeometry(w, w * canvas.height / canvas.width);
    planes.push(plane);
    const mesh = new THREE.Mesh(plane, material);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    group.add(mesh);
  };
  for (const sg of geo.signs) sign(sg.text, sg.x, sg.y, sg.z, sg.w, sg.ry, '#e4d8b9');

  // ---- the Power Link ------------------------------------------------------
  const link = level.powerLink ?? null;
  const signalMat = new THREE.MeshBasicMaterial({ color: raw(AMBER) });
  materials.push(signalMat);
  const gate = new THREE.Group();
  gate.name = 'power-link-gate';
  const grille: Array<[number, number, number]> = [];
  let nodeAt = new THREE.Vector3();
  let cageFront = new THREE.Vector3();
  if (link) {
    const { node, cage, room, cableY } = link;
    const dark: Inst[] = [];
    const signal: Inst[] = [];
    const bars: Inst[] = [];
    // a box on a wall: `along` runs with the wall, `depth` out of it
    const wallBox = (list: Inst[], x: number, y: number, z: number, along: number, h: number, depth: number, ux: number): void => {
      list.push(ux !== 0 ? { x, y, z, sx: along, sy: h, sz: depth } : { x, y, z, sx: depth, sy: h, sz: along });
    };
    const cpt = (a: number, t: number): [number, number] => [cage.ox + cage.ux * a + cage.nx * t, cage.oz + cage.uz * a + cage.nz * t];

    // the node: a housing on the wall around the lamp voxel, an amber square face
    const nux = Math.abs(node.nz), fx = node.x + 0.5 + node.nx * 0.5, fz = node.z + 0.5 + node.nz * 0.5;
    nodeAt = new THREE.Vector3(fx + node.nx * 0.3, 2.5, fz + node.nz * 0.3);
    wallBox(dark, fx + node.nx * 0.08, 2.5, fz + node.nz * 0.08, 1.0, 1.0, 0.16, nux);
    wallBox(signal, fx + node.nx * 0.18, 2.5, fz + node.nz * 0.18, 0.66, 0.66, 0.06, nux);
    wallBox(dark, fx + node.nx * 0.215, 2.5, fz + node.nz * 0.215, 0.26, 0.26, 0.02, nux);

    // the cable: around the room's wall faces from the node to the cage, the short way
    const W = room.x1 - room.x0, D = room.z1 - room.z0, P = 2 * (W + D);
    const corners = [0, W, W + D, 2 * W + D];
    const pointAt = (sv: number, e: number): [number, number] => {
      const v = ((sv % P) + P) % P;
      let x: number, z: number;
      if (v < W) { x = room.x0 + v; z = room.z0; }
      else if (v < W + D) { x = room.x1; z = room.z0 + v - W; }
      else if (v < 2 * W + D) { x = room.x1 - (v - W - D); z = room.z1; }
      else { x = room.x0; z = room.z1 - (v - 2 * W - D); }
      return [Math.min(room.x1 - e, Math.max(room.x0 + e, x)), Math.min(room.z1 - e, Math.max(room.z0 + e, z))];
    };
    const [ccx, ccz] = cpt(2.5, 0);
    const s1 = wallPerimeter(room, fx, fz, node.nx, node.nz);
    const s2 = wallPerimeter(room, ccx, ccz, cage.nx, cage.nz);
    const fwd = (((s2 - s1) % P) + P) % P;
    const dir = fwd <= P / 2 ? 1 : -1;
    const len = dir > 0 ? fwd : P - fwd;
    const stops = [0];
    for (const c of corners) {
      const off = ((((c - s1) * dir) % P) + P) % P;
      if (off > 0 && off < len) stops.push(off);
    }
    stops.sort((a, b) => a - b).push(len);
    const run = (list: Inst[], e: number, t: number, y: number, hTh: number): void => {
      for (let i = 0; i + 1 < stops.length; i++) {
        const [ax, az] = pointAt(s1 + dir * stops[i], e);
        const [bx, bz] = pointAt(s1 + dir * stops[i + 1], e);
        list.push({ x: (ax + bx) / 2, y, z: (az + bz) / 2, sx: Math.abs(bx - ax) + t, sy: hTh, sz: Math.abs(bz - az) + t });
      }
    };
    run(dark, 0.13, 0.26, cableY, 0.26);
    run(signal, 0.28, 0.07, cableY, 0.1);
    // drops: down the wall to the node, and a junction box over the cage roof
    wallBox(dark, fx + node.nx * 0.13, (3 + cableY) / 2, fz + node.nz * 0.13, 0.26, cableY - 3, 0.26, nux);
    wallBox(signal, fx + node.nx * 0.28, (3 + cableY) / 2, fz + node.nz * 0.28, 0.1, cableY - 3, 0.07, nux);
    const [jx, jz] = cpt(2.5, 0.2);
    const jy = Math.min(5.2, cableY);
    wallBox(dark, jx, jy, jz, 0.7, 0.45, 0.4, cage.ux);
    const [kx, kz] = cpt(2.5, 0.41);
    wallBox(signal, kx, jy, kz, 0.3, 0.2, 0.04, cage.ux);
    // status lamps either end of the roof's front face
    for (const a of [0.5, 4.5]) {
      const [lx, lz] = cpt(a, 2.03);
      wallBox(signal, lx, 4.5, lz, 0.3, 0.3, 0.06, cage.ux);
    }
    const ry = Math.atan2(cage.nx, cage.nz);
    const [sx, sz] = cpt(2.5, 2.03);
    sign('SUPPLY CACHE', sx, 4.5, sz, 2.7, ry);
    sign('POWER LINK · SHOOT', fx + node.nx * 0.03, 1.62, fz + node.nz * 0.03, 1.9, Math.atan2(node.nx, node.nz));

    // the gate: vertical bars + two rails across the grille row; sinks into the floor
    for (let a = 1.25; a < 4; a += 0.5) {
      const [bx, bz] = cpt(a, 1.5);
      wallBox(bars, bx, 2.5, bz, 0.12, 3, 0.16, cage.ux);
    }
    for (const y of [1.15, 3.85]) {
      const [bx, bz] = cpt(2.5, 1.5);
      wallBox(bars, bx, y, bz, 3, 0.18, 0.22, cage.ux);
    }
    for (let a = 1; a <= 3; a++) {
      const [gx, gz] = cpt(a + 0.5, 1.5);
      for (let y = 1; y <= 3; y++) grille.push([Math.floor(gx), y, Math.floor(gz)]);
    }
    const [fcx, fcz] = cpt(2.5, 3);
    cageFront = new THREE.Vector3(fcx, 2, fcz);

    const darkMat = new THREE.MeshBasicMaterial({ color: raw(CONDUIT), vertexColors: true });
    const gateMat = new THREE.MeshBasicMaterial({ color: raw(GATE), vertexColors: true });
    materials.push(darkMat, gateMat);
    group.add(instanced(shaded, darkMat, dark), instanced(flat, signalMat, signal));
    gate.add(instanced(shaded, gateMat, bars));
    group.add(gate);
  }

  // ---- steam over the heat seams: one instanced draw -----------------------
  const steamMat = new THREE.MeshBasicMaterial({ color: raw(STEAM), transparent: true, opacity: 0.2, depthWrite: false });
  materials.push(steamMat);
  const puffs = geo.vents.length * PUFFS_PER_VENT;
  const steam = new THREE.InstancedMesh(flat, steamMat, Math.max(1, puffs));
  steam.count = puffs;
  steam.frustumCulled = false;
  group.add(steam);

  let solved = false, opened = false, opening = 0, time = 0, hinted = false;
  const state = { solved: false, opened: false, node: link?.node ?? null, grille };
  group.userData.powerLink = link ? state : null;

  const update = (dt: number, game: Game): void => {
    time += dt;
    for (let v = 0; v < geo.vents.length; v++) {
      const [vx, vz] = geo.vents[v];
      for (let k = 0; k < PUFFS_PER_VENT; k++) {
        const ph = (time * 0.3 + k / PUFFS_PER_VENT + v * 0.37) % 1;
        const size = 0.25 + ph * 0.75;
        p.set(vx + 0.5 + Math.sin(v * 3 + k * 7 + ph * 2) * 0.25, 1.05 + ph * 2.6, vz + 0.5 + Math.cos(v * 5 + k) * 0.25);
        steam.setMatrixAt(v * PUFFS_PER_VENT + k, m4.compose(p, q, s.set(size, size, size)));
      }
    }
    steam.instanceMatrix.needsUpdate = true;
    if (!link) return;
    if (!hinted && !solved && game.player.pos.distanceTo(cageFront) < 4.5) {
      hinted = true;
      game.hud.message('Sealed supplies. Follow the amber cable and shoot its node.');
    }
    if (solved && !opened) {
      opening = Math.min(1, opening + dt * 1.1);
      gate.position.y = -opening * GATE_DROP;
      if (opening === 1) {
        opened = true;
        state.opened = true;
        for (const [x, y, z] of grille) level.world.setAndDirty(x, y, z, Block.Air);
        for (const pk of level.pickups) if (pk.sealed) pk.sealed = false;
        game.audio.play('pickupWeapon');
        game.hud.message('CACHE OPEN — collect your supplies.');
        game.earnScrap(SCRAP_POWER_LINK);
      }
    }
  };

  const voxelHit = (x: number, y: number, z: number, game: Game): boolean => {
    if (!link || x !== link.node.x || y !== link.node.y || z !== link.node.z) return false;
    if (!solved) {
      solved = true;
      state.solved = true;
      signalMat.color.copy(raw(GREEN));
      game.audio.play('pickupWeapon');
      game.hud.message('POWER LINK RESTORED — supply cage opening.');
      game.dynLights.flash(nodeAt.x, nodeAt.y, nodeAt.z, 0.3, 1, 0.5, 2, 8, 0.7);
    }
    return true;
  };

  return {
    group,
    update,
    voxelHit,
    dispose() {
      group.traverse((o) => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
      shaded.dispose();
      flat.dispose();
      for (const g of planes) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      group.clear();
    },
  };
}
