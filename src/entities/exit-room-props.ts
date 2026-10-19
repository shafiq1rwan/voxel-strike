import * as THREE from 'three';
import type { LevelData } from '../world/levelgen';
import type { RoomDef } from '../types';
import type { Box } from '../core/physics';
import type { Elevator } from './door';

const STEEL = 0x62685f, EDGE = 0x85877a, DARK = 0x2c302b, AMBER = 0xffbe45;
const raw = (color: number): THREE.Color => new THREE.Color().setHex(color, THREE.LinearSRGBColorSpace);
type AddBox = (x: number, y: number, z: number, w: number, h: number, d: number, color?: number) => void;
interface Wall {
  x: number; z: number; nx: number; nz: number;
}

/** Small, room-aware service props. Placement never consumes the lift's boarding lane. */
export class ExitRoomProps {
  readonly group = new THREE.Group();
  readonly boxes: Box[] = [];
  private geometry = new THREE.BoxGeometry(1, 1, 1);
  private materials = new Map<number, THREE.MeshBasicMaterial>();
  private textures: THREE.Texture[] = [];
  private extraGeometries: THREE.BufferGeometry[] = [];
  private extraMaterials: THREE.Material[] = [];
  private status: THREE.CanvasTexture | null = null;
  private lastStatus = -1;
  private surface: THREE.CanvasTexture;

  constructor(level: LevelData) {
    this.group.name = 'exit-room-props';
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16;
    const ctx = canvas.getContext('2d')!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const shade = 223 + Math.floor(Math.abs(Math.sin(x * 7 + y * 23)) * 25);
      ctx.fillStyle = `rgb(${shade},${shade},${shade})`; ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = '#b0a69c'; ctx.fillRect(2, 11, 3, 2); ctx.fillRect(12, 3, 2, 2);
    this.surface = new THREE.CanvasTexture(canvas); this.surface.magFilter = this.surface.minFilter = THREE.NearestFilter;
    this.surface.colorSpace = THREE.NoColorSpace; this.textures.push(this.surface);
    const el = level.elevator;
    if (!el) return;
    const cx = el.x + 1, cz = el.z + 1;
    const room = level.rooms.find(r => cx >= r.x && cx < r.x + r.w && cz >= r.z && cz < r.z + r.d);
    if (!room) return;
    const colors = new Float32Array(this.geometry.attributes.position.count * 3);
    const shades = [.7, .9, 1, .5, .85, .72];
    for (let i = 0; i < this.geometry.attributes.position.count; i++) colors.fill(shades[Math.floor(i / 4)], i * 3, i * 3 + 3);
    this.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const pad = level.exitPad;
    const alongX = el.walkAxis === 'x' || (!el.walkAxis && pad && Math.abs(pad.x - cx) > Math.abs(pad.z - cz));
    const fx = alongX ? Math.sign((pad?.x ?? cx + 1) - cx) || 1 : 0;
    const fz = alongX ? 0 : Math.sign((pad?.z ?? cz + 1) - cz) || 1;
    const yaw = Math.atan2(-fx, -fz);
    const local = (x: number, z: number): Wall => ({ x: cx - fz * x - fx * z, z: cz + fx * x - fz * z, nx: -fx, nz: -fz });

    // Mount the cabinet on the ledge face beside a mast, clear of crates and doors.
    let cabinetSide: number | null = null;
    const mounts = [el.lowY, el.lowY + 2.05].flatMap(base => [-2.35, 2.35, -3.35, 3.35].map(side => ({ side, base })));
    for (const { side, base } of mounts) {
      const p = local(side, -.73);
      if (!this.inside(room, p.x, p.z, .7)) continue;
      let clear = true;
      for (const dx of [-.56, 0, .56]) {
        const q = local(side + dx, -.67), back = local(side + dx, -1.08);
        for (const y of [base + .05, base + .85, base + 1.35]) if (level.world.isSolid(Math.floor(q.x), Math.floor(y), Math.floor(q.z))) clear = false;
        if (!level.world.isSolid(Math.floor(back.x), Math.floor(base), Math.floor(back.z))) clear = false;
      }
      if (!clear) continue;
      cabinetSide = side;
      this.prop('lift-motor-cabinet', p.x, base, p.z, yaw, add => {
        add(0, .7, 0, 1.18, 1.38, .4, STEEL);
        add(0, .7, .23, 1.02, 1.2, .08, EDGE);
        add(-.26, .72, .28, .43, .65, .04, DARK);
        for (let i = 0; i < 5; i++) add(-.26, .48 + i * .11, .31, .37, .04, .035, STEEL);
        add(.29, .72, .3, .06, .33, .06, DARK);
        add(.28, 1.08, .3, .08, .08, .04, AMBER);
        add(.28, .94, .3, .08, .045, .04, DARK);
        add(0, .11, .25, 1.03, .09, .08, DARK);
      });
      this.addCollision(p, yaw, 1.18, .42, base, base + 1.4);
      const panel = local(side, -.57);
      this.statusPanel(panel, base + 2.18, yaw);
      if (base > el.lowY + .1) this.prop('lift-cabinet-feed', p.x, el.lowY, p.z, yaw, add => {
        add(0, (base - el.lowY) / 2, -.12, .12, base - el.lowY + .12, .12, DARK);
      });
      const end = Math.sign(side) * 1.59;
      const conduit = local((side + end) / 2, -.57);
      this.prop('lift-floor-conduit', conduit.x, el.lowY, conduit.z, yaw, add => {
        add(0, .06, 0, Math.abs(side - end) + .14, .12, .17, DARK);
        add(0, .13, 0, Math.abs(side - end), .045, .11, STEEL);
        for (const x of [-.25, .25]) add(x, .15, 0, .07, .04, .22, EDGE);
      });
      const riser = local(end, -.43);
      this.prop('lift-conduit-riser', riser.x, el.lowY, riser.z, yaw, add => {
        add(0, .72, 0, .11, 1.35, .13, DARK);
        add(-Math.sign(side) * .13, 1.34, 0, .37, .11, .13, STEEL);
      });
      break;
    }

    // One squat toolbox against a solid side wall, with actual collision.
    const corners = [[room.x + .65, room.z + .65], [room.x + room.w - .65, room.z + .65],
      [room.x + .65, room.z + room.d - .65], [room.x + room.w - .65, room.z + room.d - .65]];
    const candidates = corners.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
    for (const [x, z] of candidates) {
      if (Math.hypot(x - cx, z - cz) < 2.8 || !this.clearFloor(level, x, z)) continue;
      // No corner equipment in front of a perimeter doorway.
      if (this.nearOpening(level, room, x, z)) continue;
      this.prop('maintenance-toolbox', x, el.lowY, z, yaw, add => {
        add(0, .19, 0, .8, .34, .46, 0x805444);
        add(0, .39, 0, .84, .1, .49, STEEL);
        for (const xx of [-.25, .25]) add(xx, .26, .25, .08, .2, .04, EDGE);
        for (const xx of [-.14, .14]) add(xx, .51, 0, .06, .15, .08, DARK);
        add(0, .58, 0, .34, .06, .08, DARK);
      });
      this.addCollision({ x, z, nx: 0, nz: 0 }, yaw, .84, .49, el.lowY, el.lowY + .45);
      break;
    }

    const entrances = this.openings(level, room);
    const red = level.doors.find(d => d.locked === 'red');
    if (red) entrances.sort((a, b) => Math.hypot(a.x - red.x, a.z - red.z) - Math.hypot(b.x - red.x, b.z - red.z));
    const entry = entrances[0];
    if (entry) {
      const angle = Math.atan2(entry.nx, entry.nz);
      this.prop('exit-emergency-light', entry.x, Math.min(room.h - .4, 4.35), entry.z, angle, add => {
        add(0, 0, .09, .85, .24, .18, DARK);
        add(0, 0, .2, .63, .13, .06, 0xc45435);
        for (const x of [-.36, .36]) add(x, 0, .22, .06, .27, .04, STEEL);
      });
      // A speaker on whichever adjacent wall panel is solid.
      const offsets = Array.from({ length: Math.max(room.w, room.d) * 2 }, (_, i) => (1.7 + Math.floor(i / 2)) * (i % 2 ? 1 : -1));
      for (const side of offsets) {
        const p = { x: entry.x + entry.nz * side, z: entry.z - entry.nx * side, nx: entry.nx, nz: entry.nz };
        if (!this.solidWall(level, room, p, 2)) continue;
        this.prop('exit-intercom', p.x, 2.35, p.z, angle, add => {
          add(0, 0, .08, .38, .58, .16, STEEL);
          add(0, .08, .18, .28, .29, .05, DARK);
          for (let i = 0; i < 4; i++) add(0, .01 + i * .06, .22, .23, .02, .03, EDGE);
          add(.07, -.19, .18, .09, .08, .04, 0x637b89);
        });
        break;
      }
    }

    // A high side-wall fan housing, deliberately away from the EXIT sign.
    const walls: Wall[] = [
      { x: room.x + .025, z: room.cz + .5, nx: 1, nz: 0 },
      { x: room.x + room.w - .025, z: room.cz + .5, nx: -1, nz: 0 },
      { x: room.cx + .5, z: room.z + .025, nx: 0, nz: 1 },
      { x: room.cx + .5, z: room.z + room.d - .025, nx: 0, nz: -1 },
    ];
    for (const wall of walls) {
      if (Math.abs(wall.nx * fx + wall.nz * fz) > .5 || !this.solidWall(level, room, wall, 4)) continue;
      this.prop('exit-vent', wall.x, Math.min(room.h - .5, 4.9), wall.z, Math.atan2(wall.nx, wall.nz), add => {
        add(0, 0, .1, 1.2, .97, .2, STEEL);
        add(0, 0, .22, 1.02, .8, .05, DARK);
        for (const s of [-1, 1]) {
          add(s * .22, 0, .25, .3, .12, .03, EDGE);
          add(0, s * .21, .25, .12, .29, .03, EDGE);
        }
        add(0, 0, .28, .19, .19, .04, DARK);
        for (let x = -.43; x < .5; x += .21) add(x, 0, .31, .035, .78, .04, STEEL);
      });
      break;
    }
    this.group.userData.cabinetSide = cabinetSide;
  }

  private prop(name: string, x: number, y: number, z: number, yaw: number, build: (add: AddBox) => void): THREE.Group {
    const group = new THREE.Group(); group.name = name; group.position.set(x, y, z); group.rotation.y = yaw;
    const batches = new Map<number, THREE.Matrix4[]>();
    build((px, py, pz, w, h, d, color = STEEL) => {
      if (!batches.has(color)) batches.set(color, []);
      batches.get(color)!.push(new THREE.Matrix4().compose(new THREE.Vector3(px, py, pz), new THREE.Quaternion(), new THREE.Vector3(w, h, d)));
    });
    for (const [color, transforms] of batches) {
      if (!this.materials.has(color)) this.materials.set(color, new THREE.MeshBasicMaterial({ color: raw(color), map: color === AMBER || color === 0xc45435 ? null : this.surface, vertexColors: true, fog: true }));
      const mesh = new THREE.InstancedMesh(this.geometry, this.materials.get(color)!, transforms.length);
      transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); group.add(mesh);
    }
    this.group.add(group); return group;
  }

  private statusPanel(p: Wall, y: number, yaw: number): void {
    const group = this.prop('lift-status-panel', p.x, y, p.z, yaw, add => {
      add(0, 0, .08, 1.52, .58, .16, STEEL);
      add(0, 0, .18, 1.35, .43, .05, DARK);
    });
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 144;
    const ctx = canvas.getContext('2d')!;
    ['LIFT READY', 'IN TRANSIT', 'EXIT ACCESS'].forEach((label, i) => {
      ctx.fillStyle = '#10151d'; ctx.fillRect(0, i * 48, 256, 48);
      ctx.fillStyle = i === 2 ? '#4cc26a' : '#ffbe45'; ctx.font = 'bold 25px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 128, i * 48 + 25, 240);
    });
    const texture = new THREE.CanvasTexture(canvas); texture.magFilter = texture.minFilter = THREE.NearestFilter;
    texture.colorSpace = THREE.NoColorSpace; texture.repeat.set(1, 1 / 3); texture.offset.y = 2 / 3;
    this.textures.push(texture); this.status = texture;
    const geometry = new THREE.PlaneGeometry(1.3, .38), material = new THREE.MeshBasicMaterial({ map: texture, fog: true });
    this.extraGeometries.push(geometry); this.extraMaterials.push(material);
    const screen = new THREE.Mesh(geometry, material); screen.position.z = .215; group.add(screen);
  }

  update(elevator: Elevator): void {
    if (!this.status) return;
    const state = elevator.moving() ? 1 : elevator.topY >= elevator.spec.highY - .05 ? 2 : 0;
    if (state !== this.lastStatus) { this.status.offset.y = 1 - (state + 1) / 3; this.lastStatus = state; }
    this.group.userData.status = ['LIFT READY', 'IN TRANSIT', 'EXIT ACCESS'][state];
  }

  private inside(room: RoomDef, x: number, z: number, margin: number): boolean {
    return x >= room.x + margin && x < room.x + room.w - margin && z >= room.z + margin && z < room.z + room.d - margin;
  }

  private clearFloor(level: LevelData, x: number, z: number): boolean {
    for (const dx of [-.4, .4]) for (const dz of [-.25, .25]) {
      if (!level.world.isSolid(Math.floor(x + dx), 0, Math.floor(z + dz))) return false;
      for (const y of [1, 2]) if (level.world.isSolid(Math.floor(x + dx), y, Math.floor(z + dz))) return false;
    }
    return true;
  }

  private openings(level: LevelData, room: RoomDef): Wall[] {
    const result: Wall[] = [];
    for (const [axis, normal] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]] as const) {
      const start = axis === 'x' ? room.z : room.x, length = axis === 'x' ? room.d : room.w;
      const plane = axis === 'x' ? normal > 0 ? room.x : room.x + room.w : normal > 0 ? room.z : room.z + room.d;
      let run = -1;
      for (let i = 0; i <= length; i++) {
        const outside = plane - normal * .5, t = start + i + .5;
        const x = axis === 'x' ? outside : t, z = axis === 'z' ? outside : t;
        const open = i < length && !level.world.isSolid(Math.floor(x), 1, Math.floor(z)) && !level.world.isSolid(Math.floor(x), 2, Math.floor(z));
        if (open && run < 0) run = i;
        if (!open && run >= 0) {
          if (i - run >= 2) {
            const mid = start + (run + i) / 2;
            result.push({ x: axis === 'x' ? plane + normal * .025 : mid, z: axis === 'z' ? plane + normal * .025 : mid, nx: axis === 'x' ? normal : 0, nz: axis === 'z' ? normal : 0 });
          }
          run = -1;
        }
      }
    }
    return result;
  }

  private nearOpening(level: LevelData, room: RoomDef, x: number, z: number): boolean {
    return this.openings(level, room).some(w => Math.hypot(x - w.x, z - w.z) < 2.2);
  }

  private solidWall(level: LevelData, room: RoomDef, p: Wall, y: number): boolean {
    if (!this.inside(room, p.x, p.z, 0)) return false;
    return level.world.isSolid(Math.floor(p.x - p.nx * .3), y, Math.floor(p.z - p.nz * .3));
  }

  private addCollision(p: Wall, yaw: number, w: number, d: number, bottom: number, top: number): void {
    const halfX = (Math.abs(Math.cos(yaw)) * w + Math.abs(Math.sin(yaw)) * d) / 2;
    const halfZ = (Math.abs(Math.sin(yaw)) * w + Math.abs(Math.cos(yaw)) * d) / 2;
    this.boxes.push({ minX: p.x - halfX, maxX: p.x + halfX, minY: bottom, maxY: top, minZ: p.z - halfZ, maxZ: p.z + halfZ });
  }

  dispose(): void {
    this.group.traverse(o => { if (o instanceof THREE.InstancedMesh) o.dispose(); });
    this.geometry.dispose(); this.extraGeometries.forEach(g => g.dispose());
    this.materials.forEach(m => m.dispose()); this.extraMaterials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose());
  }
}
