import * as THREE from 'three';
import { Box } from '../core/physics';
import { DoorSpec, ElevatorSpec, ExitSignSpec, KeyColor, LedgeRailSpec } from '../types';
import { VoxelWorld } from '../world/world';
import { AudioMan } from '../core/audio';

const DOOR_H = 3;
const OPEN_SPEED = 3.2;

function makeDoorTexture(locked: KeyColor | null): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#4a5262';
  ctx.fillRect(0, 0, 32, 48);
  ctx.fillStyle = '#353c4a';
  for (let y = 0; y < 48; y += 8) ctx.fillRect(0, y, 32, 2);
  ctx.fillStyle = '#657084';
  ctx.fillRect(14, 0, 4, 48);
  // center emblem shows lock color
  const col = locked === 'red' ? '#ff3428' : locked === 'blue' ? '#3878ff' : locked === 'yellow' ? '#ffd028' : '#88f0a0';
  ctx.fillStyle = col;
  ctx.fillRect(10, 20, 12, 8);
  ctx.fillStyle = '#10131a';
  ctx.fillRect(12, 22, 8, 4);
  ctx.fillStyle = col;
  ctx.fillRect(14, 23, 4, 2);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

export class Door {
  readonly spec: DoorSpec;
  locked: KeyColor | null;
  openT = 0;
  private target = 0;
  private lingerTimer = 0;
  private lockedMsgCooldown = 0;
  readonly mesh: THREE.Mesh;
  private material: THREE.MeshBasicMaterial;
  private baseY = 1 + DOOR_H / 2;

  constructor(spec: DoorSpec, world: VoxelWorld) {
    this.spec = spec;
    this.locked = spec.locked;
    const alongX = spec.dir === 'x';
    const geo = new THREE.BoxGeometry(alongX ? 0.5 : 2, DOOR_H, alongX ? 2 : 0.5);
    this.material = new THREE.MeshBasicMaterial({ map: makeDoorTexture(spec.locked), fog: true });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.set(spec.x + (alongX ? 0.5 : 1), this.baseY, spec.z + (alongX ? 1 : 0.5));
    // tint by baked light at the doorway
    const l = world.sampleLight01(spec.x, 2, spec.z);
    const b = Math.min(1, 0.25 + (l[0] + l[1] + l[2]));
    this.material.color.setRGB(b, b, b);
  }

  get isOpen(): boolean {
    return this.openT > 0.95;
  }

  /** co-op client: doors are driven by host snapshots, not local logic */
  netSet(openT: number, locked: boolean): void {
    this.openT = openT;
    if (!locked) this.locked = null;
    this.mesh.position.y = this.baseY + this.openT * (DOOR_H - 0.2);
  }

  centerX(): number {
    return this.mesh.position.x;
  }

  centerZ(): number {
    return this.mesh.position.z;
  }

  /** reused every call: callers read it immediately, never keep it */
  private readonly boxCache: Box = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  box(): Box {
    const alongX = this.spec.dir === 'x';
    const hx = alongX ? 0.25 : 1;
    const hz = alongX ? 1 : 0.25;
    const y = this.baseY + this.openT * (DOOR_H - 0.2);
    const b = this.boxCache;
    b.minX = this.mesh.position.x - hx;
    b.maxX = this.mesh.position.x + hx;
    b.minY = y - DOOR_H / 2;
    b.maxY = y + DOOR_H / 2;
    b.minZ = this.mesh.position.z - hz;
    b.maxZ = this.mesh.position.z + hz;
    return b;
  }

  /**
   * actors: world positions of things that can trigger the door (player + enemies).
   * The player entry additionally carries key inventory via the callbacks.
   */
  update(
    dt: number,
    actors: Array<{ x: number; z: number; isPlayer: boolean }>,
    hasKey: (c: KeyColor) => boolean,
    onUnlock: (c: KeyColor) => void,
    onLockedTry: (c: KeyColor) => void,
    audio: AudioMan
  ): void {
    this.lockedMsgCooldown = Math.max(0, this.lockedMsgCooldown - dt);
    let near = false;
    for (const a of actors) {
      const dx = a.x - this.centerX();
      const dz = a.z - this.centerZ();
      if (dx * dx + dz * dz < 2.4 * 2.4) {
        if (this.locked) {
          if (!a.isPlayer) continue;
          if (hasKey(this.locked)) {
            onUnlock(this.locked);
            this.locked = null;
            near = true;
          } else if (this.lockedMsgCooldown === 0) {
            this.lockedMsgCooldown = 1.2;
            onLockedTry(this.locked);
          }
        } else {
          near = true;
        }
      }
    }
    if (near) {
      if (this.target !== 1 && this.openT < 0.05) {
        audio.play('doorOpen', { x: this.centerX(), y: 2, z: this.centerZ() });
      }
      this.target = 1;
      this.lingerTimer = 1.6;
    } else if (this.target === 1) {
      this.lingerTimer -= dt;
      if (this.lingerTimer <= 0) {
        this.target = 0;
        if (this.openT > 0.9) {
          audio.play('doorClose', { x: this.centerX(), y: 2, z: this.centerZ() });
        }
      }
    }
    const dir = Math.sign(this.target - this.openT);
    if (dir !== 0) {
      this.openT = Math.max(0, Math.min(1, this.openT + dir * OPEN_SPEED * dt * 0.45));
      const y = this.baseY + this.openT * (DOOR_H - 0.2);
      this.mesh.position.y = y;
    }
  }
}

// ---------------------------------------------------------------------------
// Exit lift + exit ledge art, after reference/exit-lift-red-room-v1.png: a
// small mechanical service lift (two guide masts, a crossbrace with an EXIT
// LIFT plate and amber lamps, a drive box with an amber UP indicator, a
// grated deck with a thin hazard rim and one chevron, carriage blocks and
// side guardrails that ride with it, deck lamps amber below / green docked),
// yellow railings along the ledge and a green EXIT sign on the wall over the
// pad. It replaced a translucent chevron beam over the deck and another over
// the pad, which read as holograms rather than a way out.

function pixelTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/** diagonal hazard stripes (palette hazard yellow on near-black) */
function hazardStripes(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = '#14161e';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#ffd028';
  for (let o = -h; o < w + h; o += 8) {
    ctx.beginPath();
    ctx.moveTo(x + o, y + h);
    ctx.lineTo(x + o + 4, y + h);
    ctx.lineTo(x + o + 4 + h, y);
    ctx.lineTo(x + o + h, y);
    ctx.fill();
  }
  ctx.restore();
}

/** 3×5 pixel glyphs for plates and signs */
const GLYPH: Record<string, string[]> = {
  E: ['111', '100', '110', '100', '111'],
  X: ['101', '101', '010', '101', '101'],
  I: ['111', '010', '010', '010', '111'],
  T: ['111', '010', '010', '010', '010'],
  L: ['100', '100', '100', '100', '111'],
  F: ['111', '100', '110', '100', '100'],
};

function stencil(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.fillStyle = color;
  [...text].forEach((ch, i) => {
    GLYPH[ch]?.forEach((row, ry) => [...row].forEach((bit, rx) => {
      if (bit === '1') ctx.fillRect(x + i * 4 + rx, y + ry, 1, 1);
    }));
  });
}

/** deck top: dark ribbed grating, a thin hazard rim, one pale chevron */
function makeDeckTopTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#1c2028';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#3b414e';
  for (let y = 3; y < 29; y += 3) ctx.fillRect(3, y, 26, 2);
  ctx.fillStyle = '#2b303b';
  for (let x = 8; x < 29; x += 8) ctx.fillRect(x, 3, 1, 26);
  hazardStripes(ctx, 0, 0, 32, 3);
  hazardStripes(ctx, 0, 29, 32, 3);
  ctx.fillStyle = '#5a5f6a';
  ctx.fillRect(0, 3, 3, 26);
  ctx.fillRect(29, 3, 3, 26);
  // the chevron, pointing toward the ledge (canvas top = local -Z)
  ctx.fillStyle = '#e8d27a';
  ctx.beginPath();
  ctx.moveTo(10, 19); ctx.lineTo(16, 13); ctx.lineTo(22, 19);
  ctx.lineTo(19, 19); ctx.lineTo(16, 16); ctx.lineTo(13, 19);
  ctx.closePath();
  ctx.fill();
  return pixelTexture(c);
}

/** deck edge: a hazard band (front and back) */
function makeDeckEdgeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 6;
  const ctx = c.getContext('2d')!;
  hazardStripes(ctx, 0, 0, 32, 6);
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.fillRect(0, 5, 32, 1);
  return pixelTexture(c);
}

/** guide mast: worn steel with a recessed dark guide channel and a chain strip */
function makeMastTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#55574f';
  ctx.fillRect(0, 0, 8, 32);
  ctx.fillStyle = '#393d37';
  ctx.fillRect(0, 0, 1, 32);
  ctx.fillRect(7, 0, 1, 32);
  ctx.fillStyle = '#181b17';
  ctx.fillRect(3, 0, 2, 32); // the channel
  ctx.fillStyle = '#35372f';
  for (let y = 0; y < 32; y += 3) ctx.fillRect(3, y, 2, 1); // chain links
  ctx.fillStyle = '#6b4a34';
  ctx.fillRect(1, 9, 1, 3);
  ctx.fillRect(6, 22, 1, 2);
  return pixelTexture(c);
}

/** Broad pixel wear and recessed bolt heads, legible at the game's resolution. */
function makeSteelTexture(bolts = false): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 16;
  const ctx = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = 181 + Math.floor(Math.abs(Math.sin(x * 13 + y * 37)) * 54);
    ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, y, 1, 1);
  }
  ctx.fillStyle = '#99988c'; ctx.fillRect(0, 15, 16, 1); ctx.fillRect(15, 0, 1, 16);
  ctx.fillStyle = '#e9e5d2'; ctx.fillRect(0, 0, 16, 1); ctx.fillRect(0, 0, 1, 16);
  ctx.fillStyle = '#92775b'; ctx.fillRect(2, 10, 1, 3); ctx.fillRect(11, 5, 2, 1);
  if (bolts) for (const x of [3, 11]) for (const y of [3, 11]) {
    ctx.fillStyle = '#343733'; ctx.fillRect(x, y, 2, 3);
    ctx.fillStyle = '#ddd8be'; ctx.fillRect(x, y, 2, 1);
  }
  return pixelTexture(c);
}

/** crossbrace header plate: "EXIT LIFT" in pale stencil on dark steel */
function makeLiftPlateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 39;
  c.height = 9;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#2a2d33';
  ctx.fillRect(0, 0, 39, 9);
  ctx.fillStyle = '#4c515b';
  ctx.fillRect(0, 0, 39, 1);
  ctx.fillRect(0, 8, 39, 1);
  stencil(ctx, 'EXIT', 2, 2, '#d8d2bf');
  stencil(ctx, 'LIFT', 21, 2, '#d8d2bf');
  return pixelTexture(c);
}

/** drive box indicator: an amber up triangle on black */
function makeUpIndicatorTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 8;
  c.height = 8;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#121418';
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = '#ffb028';
  ctx.beginPath();
  ctx.moveTo(4, 1); ctx.lineTo(7, 6); ctx.lineTo(1, 6);
  ctx.closePath();
  ctx.fill();
  return pixelTexture(c);
}

/** the wall sign: EXIT in bright green on black */
function makeExitSignTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 20;
  c.height = 9;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#0c1a10';
  ctx.fillRect(0, 0, 20, 9);
  ctx.fillStyle = '#2b6a3a';
  ctx.fillRect(0, 0, 20, 1);
  ctx.fillRect(0, 8, 20, 1);
  ctx.fillRect(0, 0, 1, 9);
  ctx.fillRect(19, 0, 1, 9);
  stencil(ctx, 'EXIT', 2, 2, '#9dffb4');
  return pixelTexture(c);
}

const AMBER = new THREE.Color().setHex(0xffb028, THREE.LinearSRGBColorSpace);
const GREEN = new THREE.Color().setHex(0x4cff7a, THREE.LinearSRGBColorSpace);
const DIM = new THREE.Color().setHex(0x3a2a14, THREE.LinearSRGBColorSpace);

/**
 * The exit ledge's fixed art: yellow railings over the invisible rail
 * barrier (LevelData.ledgeRail) and the green EXIT sign on the wall over the
 * pad (LevelData.exitSign). Static; one draw per part type.
 */
export class ExitArt {
  readonly group = new THREE.Group();
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];

  constructor(sign: ExitSignSpec | null | undefined, rail: LedgeRailSpec | null | undefined) {
    if (sign) {
      // facing into the room; local +Z = into the room
      const g = new THREE.Group();
      g.position.set(sign.x, sign.y, sign.z);
      g.rotation.y = sign.face === 'zmin' ? 0 : sign.face === 'zmax' ? Math.PI : sign.face === 'xmin' ? Math.PI / 2 : -Math.PI / 2;
      const face = new THREE.MeshBasicMaterial({ map: makeExitSignTexture(), fog: true });
      const back = new THREE.MeshBasicMaterial({ color: 0x0c1a10, fog: true });
      const geo = new THREE.BoxGeometry(0.95, 0.43, 0.08);
      const plate = new THREE.Mesh(geo, [back, back, back, back, face, back]);
      plate.position.set(0, 1.3, 0.04);
      g.add(plate);
      // the green light bar under the ceiling above it
      const barMat = new THREE.MeshBasicMaterial({ color: GREEN, fog: true });
      const barGeo = new THREE.BoxGeometry(0.62, 0.07, 0.22);
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.set(0, 2.6, 0.18);
      g.add(bar);
      this.group.add(g);
      this.mats.push(face, back, barMat);
      this.geos.push(geo, barGeo);
      // A framed, segmented green threshold, rather than a tiled arrow carpet.
      const frameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHex(0x30392e, THREE.LinearSRGBColorSpace), fog: true });
      const padMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHex(0x56d575, THREE.LinearSRGBColorSpace), fog: true });
      const frameGeo = new THREE.BoxGeometry(1.96, .035, 1.96), panelGeo = new THREE.BoxGeometry(.86, .018, .86);
      const frame = new THREE.Mesh(frameGeo, frameMat); frame.position.set(0, .025, 1); g.add(frame);
      for (const x of [-.46, .46]) for (const z of [.54, 1.46]) {
        const panel = new THREE.Mesh(panelGeo, padMat); panel.position.set(x, .052, z); g.add(panel);
      }
      this.mats.push(frameMat, padMat); this.geos.push(frameGeo, panelGeo);
    }
    if (rail && rail.cells.length) {
      // yellow tube railing: two bars + a post per cell, along the barrier's
      // ledge-side face (where a player actually stops)
      const yellow = new THREE.MeshBasicMaterial({ color: new THREE.Color().setHex(0xd8a417, THREE.LinearSRGBColorSpace), fog: true });
      const postGeo = new THREE.BoxGeometry(0.08, 1.0, 0.08);
      const barX = new THREE.BoxGeometry(1.0, 0.07, 0.07);
      const barZ = new THREE.BoxGeometry(0.07, 0.07, 1.0);
      const along = rail.axis === 'x' ? barX : barZ;
      const posts = new THREE.InstancedMesh(postGeo, yellow, rail.cells.length);
      const bars = new THREE.InstancedMesh(along, yellow, rail.cells.length * 2);
      const transform = new THREE.Matrix4();
      for (const [index, [cx, cz]] of rail.cells.entries()) {
        const x = cx + 0.5 + (rail.axis === 'z' ? rail.inward * 0.46 : 0);
        const z = cz + 0.5 + (rail.axis === 'x' ? rail.inward * 0.46 : 0);
        posts.setMatrixAt(index, transform.makeTranslation(x, rail.y + .5, z));
        for (const [barIndex, h] of [0.55, 0.98].entries()) {
          bars.setMatrixAt(index * 2 + barIndex, transform.makeTranslation(x, rail.y + h, z));
        }
      }
      this.group.add(posts, bars);
      this.mats.push(yellow);
      this.geos.push(postGeo, barX, barZ);
    }
  }

  dispose(): void {
    this.group.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    for (const m of this.mats) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
    for (const g of this.geos) g.dispose();
  }
}

/** deck travel speed (u/s): the 3-unit climb takes about a second */
export const LIFT_SPEED = 3.0;
/** dwell after a rider steps on before the deck leaves the bottom */
const LIFT_START_DELAY = 0.25;
/** how long the deck waits at the top with nobody calling it */
const LIFT_TOP_DWELL = 3.5;
/** a rider off the deck for longer than this mid-ride has fallen, not hopped */
const LIFT_LOST_GRACE = 0.3;

export class Elevator {
  readonly spec: ElevatorSpec;
  /** current top surface height */
  topY: number;
  private state: 'bottom' | 'up' | 'top' | 'down' = 'bottom';
  private timer = 0;
  /** the whole lift (fixed frame + moving deck); add this to the scene */
  readonly group = new THREE.Group();
  /** the deck slab */
  readonly mesh: THREE.Mesh;
  /** everything that rides with the deck (slab, rails, carriages, lamps) */
  private deck = new THREE.Group();
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  /** deck corner lamps: amber below / moving, green docked */
  private deckLamps: THREE.MeshBasicMaterial;
  /** floor-level boarding lamps and the drive box's UP indicator */
  private floorLamps: THREE.MeshBasicMaterial;
  private upLamp: THREE.MeshBasicMaterial;
  private braceLamps: THREE.MeshBasicMaterial;
  /** seconds after arriving at the top during which the side hold still applies */
  private settle = 0;
  /** vertical movement this frame, for carrying the player */
  dy = 0;

  /**
   * `toLedge`: unit direction from the deck toward the exit ledge (the
   * boarding axis) — orients the masts, brace and plate. Omitted: +Z.
   */
  constructor(spec: ElevatorSpec, toLedge?: { x: number; z: number }) {
    this.spec = spec;
    this.topY = spec.lowY;
    const f = toLedge ?? { x: 0, z: 1 };
    // a frame whose local -Z points at the ledge, local X across the deck
    const rig = new THREE.Group();
    rig.position.set(spec.x + 1, 0, spec.z + 1);
    rig.rotation.y = Math.atan2(-f.x, -f.z);
    this.group.add(rig);

    const mat = (o: THREE.MeshBasicMaterialParameters): THREE.MeshBasicMaterial => {
      const m = new THREE.MeshBasicMaterial({ fog: true, ...o });
      this.mats.push(m);
      return m;
    };
    const box = (w: number, h: number, d: number): THREE.BoxGeometry => {
      const g = new THREE.BoxGeometry(w, h, d);
      const shade = [.72, .85, 1, .48, .88, .65];
      const colors = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < g.attributes.position.count; i++) colors.fill(shade[Math.floor(i / 4)], i * 3, i * 3 + 3);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      this.geos.push(g);
      return g;
    };
    const steel = mat({ color: new THREE.Color().setHex(0x77766a, THREE.LinearSRGBColorSpace), map: makeSteelTexture(), vertexColors: true });
    const dark = mat({ color: new THREE.Color().setHex(0x30332e, THREE.LinearSRGBColorSpace), map: makeSteelTexture(), vertexColors: true });
    const plateSteel = mat({ color: new THREE.Color().setHex(0x8a887c, THREE.LinearSRGBColorSpace), map: makeSteelTexture(true), vertexColors: true });
    const mastMat = mat({ map: makeMastTexture(), vertexColors: true });
    this.floorLamps = mat({ color: AMBER.clone() });
    this.upLamp = mat({ map: makeUpIndicatorTexture() });
    this.braceLamps = mat({ color: AMBER.clone() });
    this.deckLamps = mat({ color: AMBER.clone() });

    // ---- the fixed frame
    const MAST_F = -0.35; // masts stand a little toward the ledge
    const top = spec.highY + 2.55; // just under the exit room's ceiling
    const mastH = top - spec.lowY;
    const M = 1.27; // mast centre, just outside the deck edge
    const mastGeo = box(0.34, mastH, 0.4);
    for (const s of [-1, 1]) {
      const mast = new THREE.Mesh(mastGeo, mastMat);
      mast.position.set(s * M, spec.lowY + mastH / 2, MAST_F);
      rig.add(mast);
      // broad bolt plates at the foot, mid and top
      for (const y of [spec.lowY + 0.35, spec.highY + 0.6, top - 0.45]) {
        const plate = new THREE.Mesh(box(0.46, 0.42, 0.5), plateSteel);
        plate.position.set(s * M, y, MAST_F);
        rig.add(plate);
      }
      // amber boarding lamp at the mast's foot, on the boarding side
      const lamp = new THREE.Mesh(box(0.2, 0.08, 0.12), this.floorLamps);
      lamp.position.set(s * M, spec.lowY + 0.04, MAST_F + 0.42);
      rig.add(lamp);
    }
    // the crossbrace with its EXIT LIFT plate and two amber lamps
    const brace = new THREE.Mesh(box(2.88, 0.38, 0.4), steel);
    brace.position.set(0, top - 0.3, MAST_F);
    rig.add(brace);
    const plateFace = mat({ map: makeLiftPlateTexture() });
    const plate = new THREE.Mesh(box(1.25, 0.26, 0.04), [dark, dark, dark, dark, plateFace, dark]);
    plate.position.set(0, top - 0.3, MAST_F + 0.22);
    rig.add(plate);
    for (const s of [-1, 1]) {
      const lamp = new THREE.Mesh(box(0.24, 0.12, 0.05), this.braceLamps);
      lamp.position.set(s * 0.98, top - 0.3, MAST_F + 0.22);
      rig.add(lamp);
    }
    // the drive box on the left mast with its amber UP indicator
    const drive = new THREE.Mesh(box(0.34, 0.5, 0.26), [steel, steel, steel, dark, this.upLamp, steel]);
    drive.position.set(-M, spec.lowY + 1.55, MAST_F + 0.37);
    rig.add(drive);

    // ---- the moving deck (everything here rides at y = topY)
    rig.add(this.deck);
    const deckTop = mat({ map: makeDeckTopTexture() });
    const deckEdge = mat({ map: makeDeckEdgeTexture() });
    // a third of a block thick; its top sits a hair above the floor so the
    // two never z-fight at the bottom
    this.mesh = new THREE.Mesh(box(2, 0.32, 2), [dark, dark, deckTop, dark, deckEdge, deckEdge]);
    this.mesh.position.set(0, -0.16 + 0.015, 0);
    this.deck.add(this.mesh);
    const lip = new THREE.Mesh(box(2, .1, .06), [dark, dark, dark, dark, deckEdge, dark]);
    lip.position.set(0, .035, 1.005);
    this.deck.add(lip);
    // side guardrails: dark posts and rails with an amber top strip
    const amberStrip = mat({ color: new THREE.Color().setHex(0xc98a1c, THREE.LinearSRGBColorSpace) });
    for (const s of [-1, 1]) {
      for (const fz of [-0.85, 0, 0.85]) {
        const post = new THREE.Mesh(box(0.08, 0.6, 0.08), dark);
        post.position.set(s * 0.92, 0.3, fz);
        this.deck.add(post);
      }
      const mid = new THREE.Mesh(box(0.06, 0.06, 1.78), dark);
      mid.position.set(s * 0.92, 0.32, 0);
      this.deck.add(mid);
      const strip = new THREE.Mesh(box(0.1, 0.06, 1.82), amberStrip);
      strip.position.set(s * 0.92, 0.62, 0);
      this.deck.add(strip);
      // the carriage block gripping the mast, with an arm to the deck
      const carriage = new THREE.Mesh(box(0.48, 0.45, 0.52), plateSteel);
      carriage.position.set(s * M, -0.12, MAST_F);
      this.deck.add(carriage);
      // the deck's status lamp on the carriage face (boarding side)
      const lamp = new THREE.Mesh(box(0.2, 0.2, 0.04), this.deckLamps);
      lamp.position.set(s * M, -0.08, MAST_F + 0.28);
      this.deck.add(lamp);
    }
    this.updateMesh();
  }

  /**
   * Per-frame look: amber boarding lamps pulse while the deck waits at the
   * bottom, the UP indicator blinks, the deck lamps turn green when docked.
   */
  animate(dt: number, time: number): void {
    void dt;
    const waiting = this.topY < this.spec.lowY + 0.05;
    const docked = this.topY > this.spec.highY - 0.05;
    const pulse = 0.65 + 0.35 * Math.sin(time * 4);
    this.floorLamps.color.copy(AMBER).multiplyScalar(waiting ? 0.7 + 0.5 * pulse : 0.55);
    this.upLamp.color.setScalar(waiting ? (Math.sin(time * 5) > -0.2 ? 1.25 : 0.45) : 0.7);
    this.braceLamps.color.copy(AMBER).multiplyScalar(0.95);
    if (docked) this.deckLamps.color.copy(GREEN).multiplyScalar(1.1);
    else if (waiting) this.deckLamps.color.copy(AMBER).multiplyScalar(0.6 + 0.4 * pulse);
    else this.deckLamps.color.copy(DIM).lerp(AMBER, 0.6 + 0.4 * Math.sin(time * 14));
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) {
      (m as THREE.MeshBasicMaterial).map?.dispose();
      m.dispose();
    }
  }

  private updateMesh(): void {
    this.deck.position.y = this.topY;
  }

  /** reused every call: callers read it immediately, never keep it */
  private readonly boxCache: Box = { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };

  box(): Box {
    const b = this.boxCache;
    b.minX = this.spec.x;
    b.maxX = this.spec.x + 2;
    b.minY = 0;
    b.maxY = this.topY;
    b.minZ = this.spec.z;
    b.maxZ = this.spec.z + 2;
    return b;
  }

  /** co-op client: platform height comes from host snapshots */
  netSet(topY: number): void {
    this.dy = topY - this.topY;
    this.topY = topY;
    this.updateMesh();
  }

  /** true if the given AABB body is standing on the platform */
  isOnTop(px: number, py: number, pz: number, halfY: number): boolean {
    const feet = py - halfY;
    return (
      px > this.spec.x - 0.3 && px < this.spec.x + 2.3 &&
      pz > this.spec.z - 0.3 && pz < this.spec.z + 2.3 &&
      feet > this.topY - 0.4 && feet < this.topY + 0.6
    );
  }

  /** true while the deck travels (clients see it through netSet's dy) */
  moving(): boolean {
    return this.state === 'up' || this.state === 'down' || Math.abs(this.dy) > 1e-5;
  }

  /**
   * true if this body stands on the lower floor near the lift, i.e. someone
   * is waiting for it: the deck comes back for them instead of dwelling.
   */
  isWaitingBelow(px: number, py: number, pz: number, halfY: number): boolean {
    return (
      py - halfY < this.topY - 0.5 &&
      Math.abs(px - (this.spec.x + 1)) < 4 && Math.abs(pz - (this.spec.z + 1)) < 4
    );
  }

  /**
   * Keep a rider inside the 2×2 footprint while the deck moves. The open deck
   * used to lose riders to a strafe or joystick drift mid-ride, then they
   * waited for the lift to finish the climb empty and come back. A deliberate
   * jump still clears the deck: once the feet leave isOnTop's window the
   * hold lets go.
   */
  holdRider(pos: { x: number; y: number; z: number }, half: { x: number; y: number; z: number }): void {
    const moving = this.moving();
    if ((!moving && this.settle <= 0) || !this.isOnTop(pos.x, pos.y, pos.z, half.y)) return;
    const mx = half.x + 0.02;
    const mz = half.z + 0.02;
    // the open sides are always held; the boarding axis only while the deck
    // moves, so stepping off toward the ledge on arrival is never delayed
    // (a strafe still carried riders straight off the side at the top)
    const holdX = moving || this.spec.walkAxis !== 'x';
    const holdZ = moving || this.spec.walkAxis !== 'z';
    if (holdX) pos.x = Math.min(this.spec.x + 2 - mx, Math.max(this.spec.x + mx, pos.x));
    if (holdZ) pos.z = Math.min(this.spec.z + 2 - mz, Math.max(this.spec.z + mz, pos.z));
  }

  /**
   * callDown: a player is waiting on the lower floor (isWaitingBelow). The
   * deck then returns at once instead of dwelling at the top, and a climb that
   * lost its rider turns back rather than finishing empty.
   */
  update(dt: number, playerOn: boolean, audio: AudioMan, callDown = false): void {
    const prev = this.topY;
    const here = { x: this.spec.x + 1, y: this.topY, z: this.spec.z + 1 };
    this.settle = Math.max(0, this.settle - dt);
    switch (this.state) {
      case 'bottom':
        if (playerOn) {
          this.timer += dt;
          if (this.timer > LIFT_START_DELAY) {
            this.state = 'up';
            this.timer = 0;
            audio.play('elevator', here);
          }
        } else {
          this.timer = 0;
        }
        break;
      case 'up':
        this.topY += LIFT_SPEED * dt;
        if (!playerOn && callDown) {
          // the rider fell off: go back for them (after a grace, so a hop
          // mid-ride doesn't bounce the lift)
          this.timer += dt;
          if (this.timer > LIFT_LOST_GRACE) {
            this.state = 'down';
            this.timer = 0;
            audio.play('elevator', here);
            break;
          }
        } else {
          this.timer = 0;
        }
        if (this.topY >= this.spec.highY) {
          this.topY = this.spec.highY;
          this.state = 'top';
          this.timer = 0;
          this.settle = 0.4;
        }
        break;
      case 'top':
        this.timer += dt;
        if (!playerOn && (this.timer > LIFT_TOP_DWELL || (callDown && this.timer > LIFT_LOST_GRACE))) {
          this.state = 'down';
          audio.play('elevator', here);
        }
        break;
      case 'down':
        this.topY -= LIFT_SPEED * dt;
        if (this.topY <= this.spec.lowY) {
          this.topY = this.spec.lowY;
          this.state = 'bottom';
          this.timer = 0;
        }
        if (playerOn) {
          // player rode it down — go back up afterwards from bottom state
        }
        break;
    }
    this.dy = this.topY - prev;
    this.updateMesh();
  }
}
