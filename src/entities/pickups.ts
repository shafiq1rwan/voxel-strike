import * as THREE from 'three';
import { PickupKind, PickupSpec } from '../types';
import { VoxelWorld } from '../world/world';
import type { Game } from '../game';

/**
 * Pickups are drawn full-bright (never tinted by room light) with a colored
 * glow disc on the floor, so item types read instantly even in dark rooms —
 * the classic retro-shooter approach.
 */

/** glow disc + accent color per pickup family */
const GLOW_COLORS: Record<PickupKind, number> = {
  healthSmall: 0xff4444,
  healthBig: 0xff4444,
  armorShard: 0x44e07a,
  armorVest: 0x44e07a,
  ammoBullets: 0xffc040,
  ammoShells: 0xff8030,
  ammoRockets: 0xffc040,
  keyRed: 0xff3428,
  keyBlue: 0x3878ff,
  keyYellow: 0xffd028,
  weaponShotgun: 0x70d8ff,
  weaponSMG: 0x70d8ff,
  weaponRocket: 0x70d8ff,
};

/** stronger point-glow for the important pickups */
const DYN_GLOW: Partial<Record<PickupKind, [number, number, number]>> = {
  keyRed: [1, 0.2, 0.15],
  keyBlue: [0.2, 0.45, 1],
  keyYellow: [1, 0.8, 0.15],
  weaponShotgun: [0.4, 0.7, 0.9],
  weaponSMG: [0.4, 0.7, 0.9],
  weaponRocket: [0.4, 0.9, 0.5],
  healthBig: [1, 0.3, 0.3],
  armorVest: [0.3, 1, 0.4],
};

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  // full-bright: fog still applies (depth cue) but room light never darkens it
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color, fog: true })
  );
}

function makeCross(size: number, thickness: number, depth: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const a = box(size, thickness, depth, color);
  const b = box(thickness, size, depth, color);
  g.add(a, b);
  return g;
}

function makeKey(color: number): THREE.Object3D {
  const g = new THREE.Group();
  const card = box(0.36, 0.52, 0.07, color);
  const stripe = box(0.38, 0.1, 0.09, 0xffffff);
  stripe.position.y = 0.13;
  const chip = box(0.14, 0.12, 0.09, 0x202028);
  chip.position.y = -0.1;
  g.add(card, stripe, chip);
  return g;
}

const BUILDERS: Record<PickupKind, () => THREE.Object3D> = {
  // health: white medkit with a fat red cross
  healthSmall: () => {
    const g = new THREE.Group();
    const body = box(0.34, 0.26, 0.34, 0xe8ecf0);
    const cross1 = makeCross(0.3, 0.11, 0.36, 0xe83028);
    cross1.position.y = 0.0;
    const crossTop = makeCross(0.3, 0.11, 0.05, 0xe83028);
    crossTop.rotation.x = -Math.PI / 2;
    crossTop.position.y = 0.14;
    g.add(body, cross1, crossTop);
    return g;
  },
  healthBig: () => {
    const g = new THREE.Group();
    const body = box(0.5, 0.38, 0.5, 0xe8ecf0);
    const cross1 = makeCross(0.44, 0.15, 0.52, 0xe83028);
    const crossTop = makeCross(0.44, 0.15, 0.05, 0xe83028);
    crossTop.rotation.x = -Math.PI / 2;
    crossTop.position.y = 0.2;
    g.add(body, cross1, crossTop);
    return g;
  },
  // armor: green — a shard or a vest
  armorShard: () => {
    const g = new THREE.Group();
    const shard = box(0.22, 0.34, 0.12, 0x35d868);
    shard.rotation.z = Math.PI / 4;
    const core = box(0.1, 0.16, 0.14, 0xb0ffd0);
    core.rotation.z = Math.PI / 4;
    g.add(shard, core);
    return g;
  },
  armorVest: () => {
    const g = new THREE.Group();
    const body = box(0.46, 0.4, 0.22, 0x2aa955);
    const shoulderL = box(0.14, 0.12, 0.24, 0x35d868);
    shoulderL.position.set(-0.2, 0.24, 0);
    const shoulderR = box(0.14, 0.12, 0.24, 0x35d868);
    shoulderR.position.set(0.2, 0.24, 0);
    const plate = box(0.24, 0.2, 0.26, 0x35d868);
    plate.position.y = 0.02;
    g.add(body, shoulderL, shoulderR, plate);
    return g;
  },
  // bullets: brass clip with three visible bullet tips
  ammoBullets: () => {
    const g = new THREE.Group();
    const base = box(0.34, 0.16, 0.2, 0x6a5a2a);
    for (let i = 0; i < 3; i++) {
      const shell = box(0.07, 0.18, 0.07, 0xe0b850);
      shell.position.set(-0.1 + i * 0.1, 0.14, 0);
      const tip = box(0.05, 0.08, 0.05, 0xb87333);
      tip.position.set(-0.1 + i * 0.1, 0.27, 0);
      g.add(shell, tip);
    }
    g.add(base);
    return g;
  },
  // shells: bright red ammo box with gold band and shell tips
  ammoShells: () => {
    const g = new THREE.Group();
    const boxm = box(0.38, 0.22, 0.28, 0xd83028);
    const stripe = box(0.4, 0.08, 0.3, 0xffd040);
    for (let i = 0; i < 2; i++) {
      const shell = box(0.09, 0.12, 0.09, 0xe05038);
      shell.position.set(-0.08 + i * 0.16, 0.16, 0);
      const cap = box(0.09, 0.04, 0.09, 0xe0b850);
      cap.position.set(-0.08 + i * 0.16, 0.24, 0);
      g.add(shell, cap);
    }
    g.add(boxm, stripe);
    return g;
  },
  ammoRockets: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const r = box(0.13, 0.13, 0.46, 0xb8c0d0);
      const n = box(0.1, 0.1, 0.14, 0xe84438);
      const fin = box(0.2, 0.04, 0.1, 0x707888);
      r.position.set(i * 0.18 - 0.09, 0, 0);
      n.position.set(i * 0.18 - 0.09, 0, -0.28);
      fin.position.set(i * 0.18 - 0.09, 0, 0.2);
      g.add(r, n, fin);
    }
    return g;
  },
  keyRed: () => makeKey(0xff3428),
  keyBlue: () => makeKey(0x3878ff),
  keyYellow: () => makeKey(0xffd028),
  weaponShotgun: () => {
    const g = new THREE.Group();
    const barrel = box(0.14, 0.14, 0.9, 0x6a7488);
    const pump = box(0.18, 0.14, 0.3, 0x8a5c34);
    pump.position.set(0, -0.12, 0.1);
    const stock = box(0.12, 0.2, 0.3, 0x8a5c34);
    stock.position.set(0, -0.06, 0.55);
    g.add(barrel, pump, stock);
    return g;
  },
  weaponSMG: () => {
    const g = new THREE.Group();
    const body = box(0.16, 0.22, 0.62, 0x5a6274);
    const mag = box(0.1, 0.3, 0.14, 0x454c5c);
    mag.position.set(0, -0.24, 0.05);
    const barrel = box(0.08, 0.08, 0.3, 0x6a7488);
    barrel.position.z = -0.42;
    g.add(body, mag, barrel);
    return g;
  },
  weaponRocket: () => {
    const g = new THREE.Group();
    const tube = box(0.26, 0.26, 1.0, 0x4c7a4c);
    const muzzle = box(0.32, 0.32, 0.16, 0x35502f);
    muzzle.position.z = -0.5;
    const grip = box(0.1, 0.2, 0.12, 0x2a3038);
    grip.position.set(0, -0.22, 0.1);
    g.add(tube, muzzle, grip);
    return g;
  },
};

let glowTexture: THREE.CanvasTexture | null = null;

function getGlowTexture(): THREE.CanvasTexture {
  if (glowTexture) return glowTexture;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowTexture = new THREE.CanvasTexture(c);
  glowTexture.colorSpace = THREE.NoColorSpace;
  return glowTexture;
}

class Pickup {
  taken = false;
  readonly obj: THREE.Object3D;
  readonly glow: THREE.Mesh;
  private phase = Math.random() * Math.PI * 2;

  constructor(readonly spec: PickupSpec, world: VoxelWorld) {
    this.obj = BUILDERS[spec.kind]();
    this.obj.position.set(spec.x, spec.y, spec.z);

    // colored glow disc on the floor under the item
    const floorY = findFloorY(world, spec.x, spec.y, spec.z);
    const mat = new THREE.MeshBasicMaterial({
      map: getGlowTexture(),
      color: GLOW_COLORS[spec.kind],
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), mat);
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.set(spec.x, floorY + 0.03, spec.z);
  }

  update(dt: number, time: number): void {
    this.phase += dt;
    this.obj.rotation.y = time * 1.6 + this.phase;
    this.obj.position.y = this.spec.y + Math.sin(time * 2.2 + this.phase) * 0.12;
    // gentle glow pulse
    const s = 1 + Math.sin(time * 3 + this.phase) * 0.12;
    this.glow.scale.setScalar(s);
  }
}

function findFloorY(world: VoxelWorld, x: number, y: number, z: number): number {
  const bx = Math.floor(x);
  const bz = Math.floor(z);
  for (let by = Math.floor(y); by >= 0; by--) {
    if (world.isSolid(bx, by, bz)) return by + 1;
  }
  return 1;
}

export class PickupManager {
  readonly group = new THREE.Group();
  private items: Pickup[] = [];

  constructor(specs: PickupSpec[], world: VoxelWorld) {
    for (const s of specs) this.add(s, world);
  }

  add(spec: PickupSpec, world: VoxelWorld): void {
    const p = new Pickup(spec, world);
    this.items.push(p);
    this.group.add(p.obj);
    this.group.add(p.glow);
  }

  /** would collecting this item do anything right now? (drives magnetism) */
  private wouldCollect(kind: PickupKind, game: Game): boolean {
    const pl = game.player;
    switch (kind) {
      case 'healthSmall':
      case 'healthBig':
        return pl.health < pl.maxHealth;
      case 'armorShard':
      case 'armorVest':
        return pl.armor < pl.maxArmor;
      case 'ammoBullets':
        return pl.ammo.bullets < pl.ammoMax.bullets;
      case 'ammoShells':
        return pl.ammo.shells < pl.ammoMax.shells;
      case 'ammoRockets':
        return pl.ammo.rockets < pl.ammoMax.rockets;
      default:
        return true;
    }
  }

  update(dt: number, time: number, game: Game): void {
    const pl = game.player;
    for (const p of this.items) {
      if (p.taken) continue;
      p.update(dt, time);
      const dx = pl.pos.x - p.obj.position.x;
      const dy = pl.pos.y - p.obj.position.y;
      const dz = pl.pos.z - p.obj.position.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      // magnetism: useful items drift toward the player
      if (d2 < 6.25 && d2 > 0.5 && this.wouldCollect(p.spec.kind, game)) {
        const d = Math.sqrt(d2);
        const pull = (7.5 * dt) / d;
        p.obj.position.x += dx * pull;
        p.obj.position.z += dz * pull;
        p.spec.x = p.obj.position.x;
        p.spec.z = p.obj.position.z;
        p.glow.position.x = p.obj.position.x;
        p.glow.position.z = p.obj.position.z;
      }
      if (d2 < 1.1) {
        if (this.tryCollect(p.spec.kind, game)) {
          p.taken = true;
          this.group.remove(p.obj);
          this.group.remove(p.glow);
        }
      }
    }
    // stronger dynamic glow for keys/weapons/big items
    for (const p of this.items) {
      if (p.taken) continue;
      const glow = DYN_GLOW[p.spec.kind];
      if (glow) {
        game.dynLights.submit(p.obj.position.x, p.obj.position.y + 0.3, p.obj.position.z, glow[0], glow[1], glow[2], 0.35, 3);
      }
    }
  }

  /** returns false if the pickup should stay (e.g. already at max) */
  private tryCollect(kind: PickupKind, game: Game): boolean {
    const pl = game.player;
    const hud = game.hud;
    const sfx = (name: 'pickup' | 'pickupKey' | 'pickupWeapon', msg: string): void => {
      game.audio.play(name);
      hud.message(msg);
      hud.pickupFlash();
      hud.updateStats(pl);
    };
    switch (kind) {
      case 'healthSmall':
        if (!pl.heal(10)) return false;
        sfx('pickup', 'Picked up a medkit. +10');
        return true;
      case 'healthBig':
        if (!pl.heal(25)) return false;
        sfx('pickup', 'Picked up a supply cache. +25');
        return true;
      case 'armorShard':
        if (!pl.addArmor(5)) return false;
        sfx('pickup', 'Picked up an armor shard. +5');
        return true;
      case 'armorVest':
        if (!pl.addArmor(50)) return false;
        sfx('pickup', 'Picked up a combat vest. +50 armor');
        return true;
      case 'ammoBullets':
        if (!pl.addAmmo('bullets', 24)) return false;
        sfx('pickup', 'Picked up bullets.');
        return true;
      case 'ammoShells':
        if (!pl.addAmmo('shells', 8)) return false;
        sfx('pickup', 'Picked up shells.');
        return true;
      case 'ammoRockets':
        if (!pl.addAmmo('rockets', 4)) return false;
        sfx('pickup', 'Picked up rockets.');
        return true;
      case 'keyRed':
        pl.keys.add('red');
        sfx('pickupKey', 'Picked up the RED keycard!');
        return true;
      case 'keyBlue':
        pl.keys.add('blue');
        sfx('pickupKey', 'Picked up the BLUE keycard!');
        return true;
      case 'keyYellow':
        pl.keys.add('yellow');
        sfx('pickupKey', 'Picked up the YELLOW keycard!');
        return true;
      case 'weaponShotgun':
        game.weapons.give('shotgun');
        pl.addAmmo('shells', 8);
        sfx('pickupWeapon', 'You got the SCATTERGUN!');
        return true;
      case 'weaponSMG':
        game.weapons.give('smg');
        pl.addAmmo('bullets', 40);
        sfx('pickupWeapon', 'You got the RIPPER SMG!');
        return true;
      case 'weaponRocket':
        game.weapons.give('rocket');
        pl.addAmmo('rockets', 4);
        sfx('pickupWeapon', 'You got the THUMPER launcher!');
        return true;
    }
  }
}
