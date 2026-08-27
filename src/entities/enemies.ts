import * as THREE from 'three';
import { EnemySpec, RoomDef } from '../types';
import { isDestructible } from '../world/blocks';
import { moveBody, rayBox } from '../core/physics';
import { SpriteDef, SpriteRowName, SPRITE_ROWS } from './sprites';
import type { Game, PlayerTarget } from '../game';

export type EState = 'idle' | 'patrol' | 'chase' | 'attack' | 'charge' | 'pain' | 'dead';

interface EnemyTuning {
  hp: number;
  speed: number;
  halfX: number;
  halfY: number;
  painChance: number;
  bloodColor: [number, number, number];
}

const TUNING: Record<EnemySpec['kind'], EnemyTuning> = {
  husk: { hp: 45, speed: 5.0, halfX: 0.38, halfY: 0.82, painChance: 0.4, bloodColor: [0.9, 0.45, 0.1] },
  sentinel: { hp: 60, speed: 2.7, halfX: 0.45, halfY: 0.45, painChance: 0.25, bloodColor: [0.25, 0.85, 1] },
  // fragile suicide crawler: sprints at the player and self-destructs — and
  // its corpse explodes even when shot at range, so prioritize it near barrels
  ticker: { hp: 20, speed: 6.6, halfX: 0.3, halfY: 0.32, painChance: 0.1, bloodColor: [0.75, 0.85, 0.2] },
  // arena pit boss: slow tank that telegraphs a wall-smashing charge; stunned
  // when it slams a wall, always drops a powerup on death
  brute: { hp: 170, speed: 2.3, halfX: 0.62, halfY: 1.05, painChance: 0.12, bloodColor: [0.85, 0.4, 0.1] },
};

const ALERT_SOUND: Record<EnemySpec['kind'], 'huskAlert' | 'sentinelAlert' | 'tickerAlert' | 'bruteRoar'> = {
  husk: 'huskAlert', sentinel: 'sentinelAlert', ticker: 'tickerAlert', brute: 'bruteRoar',
};

function part(parent: THREE.Object3D, w: number, h: number, d: number, color: number, fullBright = false): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshBasicMaterial({ color, fog: !fullBright })
  );
  mesh.userData.baseColor = new THREE.Color(color);
  mesh.userData.fullBright = fullBright;
  parent.add(mesh);
  return mesh;
}

export class Enemy {
  readonly kind: EnemySpec['kind'];
  readonly tuning: EnemyTuning;
  state: EState = 'idle';
  hp: number;
  readonly pos = new THREE.Vector3();
  readonly vel = new THREE.Vector3();
  readonly half = new THREE.Vector3();
  readonly mesh = new THREE.Group();
  awake = false;
  private stateTime = 0;
  private attackCooldown = 0;
  private jinkTime = 0;
  private jinkSign = 1;
  private animPhase = Math.random() * 10;
  private patrolTarget: [number, number] | null = null;
  private lungeCooldown = 0;
  private flashTime = 0;
  private lightTick = Math.random();
  private hoverPhase = Math.random() * 10;
  private room: RoomDef | null;
  // model parts used by animation (husk: jointed groups pivoting at hip/shoulder/neck)
  private legLG: THREE.Group | null = null;
  private legRG: THREE.Group | null = null;
  private armLG: THREE.Group | null = null;
  private armRG: THREE.Group | null = null;
  private torsoG: THREE.Group | null = null;
  private headG: THREE.Group | null = null;
  private jaw: THREE.Mesh | null = null;
  private fins: THREE.Mesh[] = [];
  private glowParts: THREE.Mesh[] = [];
  private body: THREE.Group;
  private gait = Math.random() * 10;
  private lastStride = 0;
  /** ticker arming beeps played so far this attack */
  private beepCount = 0;
  /** brute charge: locked direction, cooldown, and post-slam stun length */
  private cdx = 0;
  private cdz = 0;
  private chargeCooldown = 0;
  private stunTime = 0.32;
  /** which way the whole model jolts on the current hit flash */
  private flinchSign = 1;
  /** set by hitscan right before damage() when the shot landed in the head zone */
  lastHitHead = false;
  /** co-op client: this enemy is a network puppet — no AI, interpolate only */
  puppet = false;
  private ntx = 0;
  private nty = 0;
  private ntz = 0;
  private nyaw = 0;
  private netInit = false;
  /** the player this enemy is currently hunting (local or co-op partner) */
  private tgt: PlayerTarget | null = null;
  private growlCd = 2 + Math.random() * 4;
  // billboard sprite skin (optional, from SpriteLibrary)
  private spriteMesh: THREE.Mesh | null = null;
  private spriteTex: THREE.Texture | null = null;
  private spriteDef: SpriteDef | null = null;
  private spriteTime = 0;
  private spriteRow = -1;
  private spriteFrame = -1;
  private corpseGrounded = false;

  constructor(spec: EnemySpec, room: RoomDef | null, groundY: number, startPatrolling: boolean) {
    this.kind = spec.kind;
    this.tuning = TUNING[spec.kind];
    this.hp = this.tuning.hp;
    this.half.set(this.tuning.halfX, this.tuning.halfY, this.tuning.halfX);
    this.pos.set(spec.x, groundY + this.half.y + (spec.kind === 'sentinel' ? 1.0 : 0.05), spec.z);
    this.room = room;
    this.body = new THREE.Group();
    this.mesh.add(this.body);
    if (spec.kind === 'husk') this.buildHusk();
    else if (spec.kind === 'ticker') this.buildTicker();
    else if (spec.kind === 'brute') this.buildBrute();
    else this.buildSentinel();
    this.mesh.position.copy(this.pos);
    if (startPatrolling) this.state = 'patrol';
  }

  private buildHusk(): void {
    // legs: pivot groups at the hips so strides swing from the joint
    const mkLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.18 * side, -0.24, 0);
      const thigh = part(g, 0.17, 0.34, 0.19, 0x50241a);
      thigh.position.y = -0.15;
      const shin = part(g, 0.13, 0.28, 0.15, 0x3c1a12);
      shin.position.set(0, -0.42, -0.03);
      const foot = part(g, 0.16, 0.08, 0.25, 0x2e2018);
      foot.position.set(0, -0.57, -0.06);
      this.body.add(g);
      return g;
    };
    this.legLG = mkLeg(-1);
    this.legRG = mkLeg(1);

    // torso group carries the hunch lean and waddle roll
    this.torsoG = new THREE.Group();
    this.torsoG.position.y = -0.12;
    this.body.add(this.torsoG);
    const torso = part(this.torsoG, 0.6, 0.6, 0.4, 0x8a3c22);
    torso.position.y = 0.32;
    torso.rotation.x = 0.14;
    const belly = part(this.torsoG, 0.5, 0.3, 0.36, 0x74301a);
    belly.position.y = 0.04;
    // asymmetric bone spurs along the back
    const spurA = part(this.torsoG, 0.1, 0.26, 0.1, 0x3a1c10);
    spurA.position.set(-0.08, 0.64, 0.16);
    spurA.rotation.x = 0.45;
    const spurB = part(this.torsoG, 0.08, 0.2, 0.08, 0x3a1c10);
    spurB.position.set(0.14, 0.54, 0.2);
    spurB.rotation.x = 0.6;
    spurB.rotation.z = -0.3;

    // head: pivot at the neck, with a working jaw
    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.62, -0.18);
    this.torsoG.add(this.headG);
    const skull = part(this.headG, 0.38, 0.26, 0.36, 0x6e2c16);
    skull.position.y = 0.08;
    const eye = part(this.headG, 0.3, 0.06, 0.05, 0xffcc33, true);
    eye.position.set(0, 0.1, -0.19);
    this.glowParts.push(eye);
    this.jaw = part(this.headG, 0.3, 0.1, 0.3, 0x50241a);
    this.jaw.position.set(0, -0.06, -0.08);
    const teeth = part(this.headG, 0.26, 0.05, 0.06, 0xd8cfa0, true);
    teeth.position.set(0, -0.01, -0.22);

    // arms: pivot groups at the shoulders, long enough to claw ahead of it
    const mkArm = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.36 * side, 0.5, -0.02);
      const upper = part(g, 0.14, 0.38, 0.14, 0x74301a);
      upper.position.y = -0.17;
      const fore = part(g, 0.12, 0.32, 0.12, 0x63281a);
      fore.position.set(0, -0.44, -0.07);
      fore.rotation.x = -0.25;
      const claw = part(g, 0.18, 0.12, 0.24, 0x2e2018);
      claw.position.set(0, -0.6, -0.16);
      this.torsoG!.add(g);
      return g;
    };
    this.armLG = mkArm(-1);
    this.armRG = mkArm(1);
  }

  private buildBrute(): void {
    // a husk scaled into a wall of meat: same jointed-group skeleton so the
    // husk gait animation drives it, but heavier proportions + bone plating
    const mkLeg = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.28 * side, -0.3, 0);
      const thigh = part(g, 0.26, 0.46, 0.28, 0x4a2418);
      thigh.position.y = -0.19;
      const shin = part(g, 0.2, 0.38, 0.22, 0x381a10);
      shin.position.set(0, -0.54, -0.03);
      const foot = part(g, 0.26, 0.1, 0.36, 0x2a1c12);
      foot.position.set(0, -0.72, -0.07);
      this.body.add(g);
      return g;
    };
    this.legLG = mkLeg(-1);
    this.legRG = mkLeg(1);

    this.torsoG = new THREE.Group();
    this.torsoG.position.y = -0.1;
    this.body.add(this.torsoG);
    const torso = part(this.torsoG, 0.95, 0.82, 0.6, 0x7a3018);
    torso.position.y = 0.44;
    torso.rotation.x = 0.16;
    const belly = part(this.torsoG, 0.8, 0.42, 0.55, 0x64280f);
    belly.position.y = 0.02;
    // bone plating across the shoulders and back
    const plateL = part(this.torsoG, 0.3, 0.16, 0.4, 0xc8bfa0);
    plateL.position.set(-0.34, 0.78, 0.05);
    const plateR = part(this.torsoG, 0.3, 0.16, 0.4, 0xc8bfa0);
    plateR.position.set(0.34, 0.78, 0.05);
    const spine = part(this.torsoG, 0.14, 0.4, 0.14, 0x3a1c10);
    spine.position.set(0, 0.9, 0.2);
    spine.rotation.x = 0.5;

    this.headG = new THREE.Group();
    this.headG.position.set(0, 0.86, -0.26);
    this.torsoG.add(this.headG);
    const skull = part(this.headG, 0.5, 0.34, 0.46, 0x60250f);
    skull.position.y = 0.1;
    const eye = part(this.headG, 0.4, 0.07, 0.06, 0xff8030, true);
    eye.position.set(0, 0.13, -0.25);
    this.glowParts.push(eye);
    this.jaw = part(this.headG, 0.42, 0.14, 0.4, 0x4a2418);
    this.jaw.position.set(0, -0.09, -0.1);
    const tuskL = part(this.headG, 0.07, 0.16, 0.07, 0xd8cfa0, true);
    tuskL.position.set(-0.16, -0.02, -0.3);
    const tuskR = part(this.headG, 0.07, 0.16, 0.07, 0xd8cfa0, true);
    tuskR.position.set(0.16, -0.02, -0.3);

    const mkArm = (side: number): THREE.Group => {
      const g = new THREE.Group();
      g.position.set(0.56 * side, 0.62, -0.02);
      const upper = part(g, 0.24, 0.5, 0.24, 0x64280f);
      upper.position.y = -0.22;
      const fore = part(g, 0.2, 0.44, 0.2, 0x55220d);
      fore.position.set(0, -0.6, -0.08);
      fore.rotation.x = -0.25;
      const slab = part(g, 0.3, 0.18, 0.36, 0x2a1c12);
      slab.position.set(0, -0.86, -0.18);
      this.torsoG!.add(g);
      return g;
    };
    this.armLG = mkArm(-1);
    this.armRG = mkArm(1);
  }

  private buildTicker(): void {
    // squat hazard-striped shell over a glowing amber core, six skittering legs
    const shell = part(this.body, 0.44, 0.24, 0.5, 0x3a3626);
    shell.position.y = 0.02;
    const stripeA = part(this.body, 0.46, 0.06, 0.12, 0xffd028);
    stripeA.position.set(0, 0.1, -0.12);
    const stripeB = part(this.body, 0.46, 0.06, 0.12, 0xffd028);
    stripeB.position.set(0, 0.1, 0.12);
    const core = part(this.body, 0.2, 0.14, 0.2, 0xffb028, true);
    core.position.set(0, -0.02, -0.18);
    this.glowParts.push(core);
    for (let i = 0; i < 6; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const leg = part(this.body, 0.07, 0.22, 0.07, 0x2a2618);
      leg.position.set(0.26 * side, -0.16, -0.16 + Math.floor(i / 2) * 0.16);
      leg.rotation.z = 0.5 * side;
      this.fins.push(leg); // reuse the fin slots as leg joints
    }
  }

  private buildSentinel(): void {
    const core = part(this.body, 0.55, 0.5, 0.55, 0x2c4452);
    core.position.y = 0;
    const panelF = part(this.body, 0.34, 0.2, 0.06, 0x55e0ff, true);
    panelF.position.set(0, 0.02, -0.3);
    this.glowParts.push(panelF);
    const top = part(this.body, 0.3, 0.16, 0.3, 0x1e303c);
    top.position.y = 0.32;
    const emitter = part(this.body, 0.18, 0.16, 0.18, 0x88f0ff, true);
    emitter.position.y = -0.32;
    this.glowParts.push(emitter);
    for (let i = 0; i < 4; i++) {
      const fin = part(this.body, 0.46, 0.1, 0.16, 0x24343e);
      const a = (i / 4) * Math.PI * 2;
      fin.position.set(Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.42);
      fin.rotation.y = -a;
      this.fins.push(fin);
    }
  }

  get alive(): boolean {
    return this.state !== 'dead';
  }

  /** last-resort recovery for a body that escaped the world */
  respawnInRoom(): void {
    if (this.room) {
      this.pos.set(this.room.cx + 0.5, 2.6, this.room.cz + 0.5);
    } else {
      this.pos.y = 2.6;
    }
    this.vel.set(0, 0, 0);
  }

  wake(game: Game): void {
    if (this.awake || !this.alive) return;
    this.awake = true;
    game.audio.play(ALERT_SOUND[this.kind], this.pos);
    if (this.state === 'idle' || this.state === 'patrol') this.setState('chase');
  }

  private setState(s: EState): void {
    this.state = s;
    this.stateTime = 0;
  }

  damage(dmg: number, dx: number, dz: number, game: Game): void {
    if (!this.alive) return;
    this.hp -= dmg;
    // hit feedback fires the same frame: white-hot flash, a sideways jolt,
    // a meaty thwack, and blood — waiting for the next lighting tick made
    // hits read as nothing happening
    this.flashTime = 0.15;
    this.flinchSign = Math.random() < 0.5 ? -1 : 1;
    this.applyFlash();
    game.audio.play('fleshHit', this.pos);
    game.particles.blood(
      this.pos.x, this.pos.y + 0.2, this.pos.z, dx, 0, dz,
      this.tuning.bloodColor[0], this.tuning.bloodColor[1], this.tuning.bloodColor[2],
      Math.min(16, 5 + Math.floor(dmg / 3))
    );
    this.wake(game);
    game.enemies.alertAt(this.pos.x, this.pos.z, 9, game);
    if (this.hp <= 0) {
      this.die(game);
      return;
    }
    // micro-stagger + knockback: the hit interrupts momentum, then shoves
    // (brutes are too heavy to shove far)
    const mass = this.kind === 'brute' ? 0.25 : 1;
    if (this.state !== 'charge') {
      this.vel.x *= 0.6;
      this.vel.z *= 0.6;
    }
    const kb = Math.min(8, dmg * 0.2) * mass;
    this.vel.x += dx * kb;
    this.vel.z += dz * kb;
    if (Math.random() < this.tuning.painChance) {
      this.setState('pain');
      game.audio.play(this.kind === 'husk' || this.kind === 'brute' ? 'enemyPainA' : 'enemyPainB', this.pos);
    }
    // the headshot flag only describes THIS hit — don't let it linger so a
    // later barrel kill counts as a headshot
    this.lastHitHead = false;
  }

  private die(game: Game): void {
    this.setState('dead');
    game.audio.play(this.kind === 'husk' || this.kind === 'brute' ? 'enemyDieA' : 'enemyDieB', this.pos);
    // tickers are walking bombs: death always detonates them (short fuse so a
    // sniped ticker still chains into barrels and packmates).
    // Co-op clients skip the gameplay side effects — the host owns those.
    if (this.kind === 'ticker' && !game.isNetClient) {
      game.queueExplosion(this.pos.x, this.pos.y, this.pos.z, 0.08, 55, 2.8);
    }
    // the pit boss always drops a powerup — killing it is the arena's reward
    if (this.kind === 'brute' && !game.isNetClient) {
      game.audio.play('bruteSlam', this.pos);
      const drops = ['powerQuad', 'powerShield', 'powerHaste'] as const;
      game.spawnPickup(drops[Math.floor(Math.random() * drops.length)], this.pos.x, this.pos.y + 0.3, this.pos.z);
    }
    // the body bursts apart into its own voxels: every part becomes a handful
    // of gibs in that part's color
    const worldPos = new THREE.Vector3();
    this.mesh.updateWorldMatrix(true, true);
    this.body.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.getWorldPosition(worldPos);
      const c = o.userData.baseColor as THREE.Color;
      game.particles.gib(worldPos.x, worldPos.y, worldPos.z, c.r, c.g, c.b, o.userData.fullBright ? 2 : 3);
    });
    game.particles.blood(
      this.pos.x, this.pos.y + 0.2, this.pos.z, 0, 0, 0,
      this.tuning.bloodColor[0], this.tuning.bloodColor[1], this.tuning.bloodColor[2], 12
    );
    if (this.kind === 'sentinel') {
      // the drone pops with an electric flash
      game.dynLights.flash(this.pos.x, this.pos.y, this.pos.z, 0.3, 0.85, 1, 1.4, 8, 0.28);
      game.audio.play('boltHit', this.pos);
    }
    // sprite skins keep the corpse and play their death frames instead
    if (!this.spriteMesh) this.mesh.visible = false;
    this.mesh.rotation.z = 0; // corpses don't hold the hit jolt
    this.mesh.scale.setScalar(1);
    game.onEnemyKilled(this);
  }

  /** swap the voxel rig for a billboard sprite once its skin is loaded */
  private maybeAdoptSprite(game: Game): void {
    if (this.spriteMesh) return;
    const def = game.sprites.get(this.kind);
    if (!def) return;
    this.spriteDef = def;
    this.spriteTex = def.texture.clone();
    this.spriteTex.needsUpdate = true;
    this.spriteTex.repeat.set(def.frameW / def.sheetW, def.frameH / def.sheetH);
    const h = def.worldH;
    const w = h * (def.frameW / def.frameH);
    const mat = new THREE.MeshBasicMaterial({
      map: this.spriteTex,
      transparent: true,
      alphaTest: 0.5,
      fog: true,
    });
    this.spriteMesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this.spriteMesh.userData.baseColor = new THREE.Color(0xffffff);
    // feet of the sprite sit at the bottom of the collision box
    this.spriteMesh.position.y = h / 2 - this.half.y;
    this.mesh.add(this.spriteMesh);
    this.body.visible = false;
  }

  /** frame selection + yaw-only billboard for the sprite skin */
  private spriteAnimate(dt: number, game: Game): void {
    const def = this.spriteDef!;
    const speed = Math.hypot(this.vel.x, this.vel.z);
    let row: SpriteRowName;
    if (this.state === 'dead') row = 'death';
    else if (this.state === 'attack') row = 'attack';
    else if (this.state === 'pain') row = 'pain';
    else row = speed > 0.6 ? 'walk' : 'idle';
    const rowIndex = SPRITE_ROWS.indexOf(row);
    if (rowIndex !== this.spriteRow) {
      this.spriteRow = rowIndex;
      this.spriteTime = 0;
      this.spriteFrame = -1;
    }
    this.spriteTime += dt * (row === 'walk' ? 0.5 + speed / this.tuning.speed : 1);
    const count = def.counts[row];
    let frame = Math.floor(this.spriteTime * def.fps);
    frame = row === 'death' ? Math.min(frame, count - 1) : frame % count;
    if (frame !== this.spriteFrame) {
      this.spriteFrame = frame;
      this.spriteTex!.offset.set(
        (frame * def.frameW) / def.sheetW,
        1 - ((rowIndex + 1) * def.frameH) / def.sheetH
      );
      // footfalls on the stepping frames
      if (this.kind === 'husk' && row === 'walk' && frame % 2 === 0 && speed > 1.6) {
        game.audio.play('huskStep', this.pos);
      }
    }
    // yaw-only billboard, counteracting the AI facing rotation on this.mesh
    const dx = game.camera.position.x - this.pos.x;
    const dz = game.camera.position.z - this.pos.z;
    this.spriteMesh!.rotation.y = Math.atan2(dx, dz) - this.mesh.rotation.y;
  }

  update(dt: number, game: Game): void {
    if (this.puppet) {
      this.puppetUpdate(dt, game);
      return;
    }
    this.stateTime += dt;
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.lungeCooldown = Math.max(0, this.lungeCooldown - dt);
    this.chargeCooldown = Math.max(0, this.chargeCooldown - dt);
    this.flashTime = Math.max(0, this.flashTime - dt);
    // hunt whichever player is closest (co-op adds the partner as a target)
    const pl = this.pickTarget(game);
    this.tgt = pl;

    if (this.alive) this.maybeAdoptSprite(game);

    // dead: voxel rigs burst into gibs in die(); sprite skins play their
    // death animation and remain as a corpse
    if (this.state === 'dead') {
      this.deadUpdate(dt, game);
      return;
    }

    const toPlayer = new THREE.Vector3().subVectors(pl.pos, this.pos);
    const distSq = toPlayer.x * toPlayer.x + toPlayer.z * toPlayer.z;
    const dist = Math.sqrt(distSq);

    // perception
    if (!this.awake && !pl.dead) {
      if (dist < 12 && game.hasLOS(this.pos.x, this.pos.y + 0.3, this.pos.z, pl.pos.x, pl.eyeY(), pl.pos.z)) {
        this.wake(game);
      }
    }

    switch (this.state) {
      case 'idle':
        this.vel.x *= 0.8;
        this.vel.z *= 0.8;
        break;
      case 'patrol':
        this.doPatrol(dt);
        break;
      case 'chase':
        this.doChase(dt, dist, toPlayer, game);
        break;
      case 'attack':
        this.doAttack(dt, dist, toPlayer, game);
        break;
      case 'charge':
        this.doCharge(dt, game);
        break;
      case 'pain':
        this.vel.x *= 0.85;
        this.vel.z *= 0.85;
        if (this.stateTime > this.stunTime) {
          this.stunTime = 0.32;
          this.setState('chase');
        }
        break;
    }

    // physics
    if (this.kind !== 'sentinel') {
      this.vel.y -= 24 * dt;
    } else {
      // hover spring toward target height above the floor
      this.hoverPhase += dt;
      const floorY = this.findFloor(game);
      const targetY = floorY + 1.55 + Math.sin(this.hoverPhase * 2) * 0.15;
      this.vel.y += (targetY - this.pos.y) * 6 * dt - this.vel.y * 3 * dt;
    }
    const res = moveBody(game.world, this.pos, this.half, this.vel, dt, game.solidBoxes());
    // ground friction for walkers
    if (this.kind !== 'sentinel' && res.onGround) {
      const f = Math.exp(-6 * dt);
      this.vel.x *= f;
      this.vel.z *= f;
    }
    // brute wall slam: a charge that hits a wall stuns it (punish window)
    if (this.kind === 'brute' && this.state === 'charge' && this.stateTime > 0.6 && (res.hitX || res.hitZ)) {
      game.audio.play('bruteSlam', this.pos);
      game.particles.debris(this.pos.x + this.cdx, this.pos.y + 0.3, this.pos.z + this.cdz, 0.45, 0.42, 0.4, 12);
      game.player.shake = Math.min(0.6, game.player.shake + 0.25);
      game.enemies.alertAt(this.pos.x, this.pos.z, 14, game);
      this.chargeCooldown = 4.5;
      this.stunTime = 1.3; // dazed — free hits
      this.setState('pain');
      this.vel.x = -this.cdx * 3;
      this.vel.z = -this.cdz * 3;
    }
    // wall jink: when blocked while chasing, sidestep for a moment
    if ((res.hitX || res.hitZ) && (this.state === 'chase' || this.state === 'patrol')) {
      if (this.jinkTime <= 0) {
        this.jinkTime = 0.45;
        this.jinkSign = Math.random() < 0.5 ? 1 : -1;
      }
    }
    this.jinkTime = Math.max(0, this.jinkTime - dt);

    // face movement / player
    // models are built facing local -z, so front_world = (-sin yaw, -cos yaw):
    // to face a direction (dx, dz), yaw = atan2(-dx, -dz)
    if (this.awake && dist > 0.3) {
      const targetYaw = Math.atan2(-toPlayer.x, -toPlayer.z);
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, targetYaw, Math.min(1, dt * 10));
    } else if (Math.hypot(this.vel.x, this.vel.z) > 0.5) {
      const targetYaw = Math.atan2(-this.vel.x, -this.vel.z);
      this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, targetYaw, Math.min(1, dt * 6));
    }

    this.animate(dt, game);
    this.mesh.position.copy(this.pos);
    // hit reaction: quick scale pop + sideways jolt while the flash runs
    this.mesh.scale.setScalar(1 + this.flashTime * 1.6);
    this.mesh.rotation.z = this.flashTime * this.flinchSign * 1.4;
    this.updateLighting(game, dt);
  }

  /** nearest non-dead player-like target (falls back to the local player) */
  private pickTarget(game: Game): PlayerTarget {
    const ts = game.playerTargets();
    let best: PlayerTarget = ts[0];
    let bestD = Infinity;
    for (const t of ts) {
      if (t.dead) continue;
      const d = (t.pos.x - this.pos.x) ** 2 + (t.pos.z - this.pos.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  /** shared corpse handling for sprite skins (voxel rigs vanish into gibs) */
  private deadUpdate(dt: number, game: Game): void {
    if (!this.spriteMesh) return;
    // the corpse drops to the floor (hovering enemies die mid-air)
    if (!this.corpseGrounded) {
      this.vel.x *= 0.9;
      this.vel.z *= 0.9;
      this.vel.y -= 20 * dt;
      const res = moveBody(game.world, this.pos, this.half, this.vel, dt, game.solidBoxes());
      this.mesh.position.copy(this.pos);
      if (res.onGround) this.corpseGrounded = true;
    }
    this.spriteAnimate(dt, game);
    this.updateLighting(game, dt);
  }

  /** co-op client: interpolate toward the host's snapshot; no AI, no physics */
  private puppetUpdate(dt: number, game: Game): void {
    this.stateTime += dt;
    this.flashTime = Math.max(0, this.flashTime - dt);
    if (this.alive) this.maybeAdoptSprite(game);
    if (this.state === 'dead') {
      this.deadUpdate(dt, game);
      return;
    }
    if (!this.netInit) return;
    const k = 1 - Math.exp(-10 * dt);
    const prevX = this.pos.x;
    const prevZ = this.pos.z;
    this.pos.x += (this.ntx - this.pos.x) * k;
    this.pos.y += (this.nty - this.pos.y) * k;
    this.pos.z += (this.ntz - this.pos.z) * k;
    // derived velocity drives the walk animation + footstep sounds
    this.vel.x = (this.pos.x - prevX) / Math.max(dt, 0.001);
    this.vel.z = (this.pos.z - prevZ) / Math.max(dt, 0.001);
    this.mesh.rotation.y = lerpAngle(this.mesh.rotation.y, this.nyaw, Math.min(1, dt * 10));
    // arming beeps are a survival cue — replicate them for the client
    if (this.kind === 'ticker' && this.state === 'attack') {
      const beepsDue = Math.floor(this.stateTime / 0.16);
      if (beepsDue > this.beepCount) {
        this.beepCount = beepsDue;
        game.audio.play('tickerBeep', this.pos);
      }
    }
    this.animate(dt, game);
    this.mesh.position.copy(this.pos);
    this.mesh.scale.setScalar(1 + this.flashTime * 1.6);
    this.mesh.rotation.z = this.flashTime * this.flinchSign * 1.4;
    this.updateLighting(game, dt);
  }

  /** co-op client: apply the host's latest snapshot row */
  netSet(x: number, y: number, z: number, yaw: number, state: EState, hp: number, game: Game): void {
    this.ntx = x;
    this.nty = y;
    this.ntz = z;
    this.nyaw = yaw;
    if (!this.netInit) {
      this.netInit = true;
      this.pos.set(x, y, z);
      this.mesh.position.copy(this.pos);
    }
    this.hp = hp;
    if (state !== this.state && this.state !== 'dead') {
      if (state === 'dead') {
        this.pos.set(x, y, z);
        this.mesh.position.copy(this.pos);
        this.die(game); // visuals + sound; scoring/explosions are host-side
      } else {
        this.state = state;
        this.stateTime = 0;
        if (state === 'attack') this.beepCount = 0;
      }
    }
    this.awake = state !== 'idle' && state !== 'patrol' && state !== 'dead';
  }

  /** co-op client: local juice for a hit whose damage the host will apply */
  hitFeedback(dmg: number, dx: number, dz: number, game: Game): void {
    if (!this.alive) return;
    this.flashTime = 0.15;
    this.flinchSign = Math.random() < 0.5 ? -1 : 1;
    this.applyFlash();
    game.audio.play('fleshHit', this.pos);
    game.particles.blood(
      this.pos.x, this.pos.y + 0.2, this.pos.z, dx, 0, dz,
      this.tuning.bloodColor[0], this.tuning.bloodColor[1], this.tuning.bloodColor[2],
      Math.min(16, 5 + Math.floor(dmg / 3))
    );
  }

  /** immediate white-hot flash on every landed hit (restored by the light tick) */
  private applyFlash(): void {
    this.mesh.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.userData.fullBright) return;
      (o.material as THREE.MeshBasicMaterial).color.setRGB(2.2, 1.9, 1.7);
    });
  }

  private findFloor(game: Game): number {
    const x = Math.floor(this.pos.x);
    const z = Math.floor(this.pos.z);
    for (let y = Math.floor(this.pos.y); y >= 0; y--) {
      if (game.world.isSolid(x, y, z)) return y + 1;
    }
    return 1;
  }

  private doPatrol(dt: number): void {
    void dt;
    const r = this.room;
    if (!r) {
      this.setState('idle');
      return;
    }
    if (!this.patrolTarget || this.stateTime > 6) {
      this.patrolTarget = [r.x + 1.5 + Math.random() * (r.w - 3), r.z + 1.5 + Math.random() * (r.d - 3)];
      this.stateTime = 0;
    }
    const [tx, tz] = this.patrolTarget;
    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) {
      this.patrolTarget = null;
      return;
    }
    const sp = this.tuning.speed * 0.4;
    this.steer(dx / d, dz / d, sp);
  }

  private steer(nx: number, nz: number, speed: number): void {
    if (this.jinkTime > 0) {
      // rotate desired direction ~70 degrees to slip around walls
      const s = this.jinkSign;
      const rx = nx * 0.34 - nz * 0.94 * s;
      const rz = nx * 0.94 * s + nz * 0.34;
      nx = rx;
      nz = rz;
    }
    this.vel.x += (nx * speed - this.vel.x) * 0.15;
    this.vel.z += (nz * speed - this.vel.z) * 0.15;
  }

  private doChase(dt: number, dist: number, toPlayer: THREE.Vector3, game: Game): void {
    const pl = this.tgt ?? game.player;
    if (pl.dead) {
      this.setState('idle');
      this.awake = false;
      return;
    }
    const nx = toPlayer.x / Math.max(0.001, dist);
    const nz = toPlayer.z / Math.max(0.001, dist);

    if (this.kind === 'husk') {
      // hungry noises while it hunts
      this.growlCd -= dt;
      if (this.growlCd <= 0) {
        this.growlCd = 3.5 + Math.random() * 4;
        game.audio.play('huskGrowl', this.pos);
      }
      if (dist < 1.75 && this.attackCooldown === 0) {
        this.setState('attack');
        return;
      }
      // occasional lunge
      if (dist > 2.2 && dist < 5 && this.lungeCooldown === 0 && Math.random() < dt * 0.8) {
        this.vel.x = nx * this.tuning.speed * 2.1;
        this.vel.z = nz * this.tuning.speed * 2.1;
        this.vel.y = 3.5;
        this.lungeCooldown = 2.2;
        game.audio.play('huskAlert', this.pos);
        return;
      }
      // serpentine approach: weave across the line to the player
      if (dist > 3) {
        const weave = Math.sin(this.animPhase * 2.2) * 0.5;
        let wx = nx - nz * weave;
        let wz = nz + nx * weave;
        const wl = Math.hypot(wx, wz);
        wx /= wl;
        wz /= wl;
        this.steer(wx, wz, this.tuning.speed);
      } else {
        this.steer(nx, nz, this.tuning.speed);
      }
    } else if (this.kind === 'brute') {
      this.growlCd -= dt;
      if (this.growlCd <= 0) {
        this.growlCd = 4 + Math.random() * 3;
        game.audio.play('huskGrowl', this.pos);
      }
      if (dist < 2.4 && this.attackCooldown === 0) {
        this.setState('attack');
        return;
      }
      // telegraphed charge when it has a clear mid-range line to the player
      if (
        dist > 4 && dist < 15 && this.chargeCooldown === 0 &&
        game.hasLOS(this.pos.x, this.pos.y + 0.3, this.pos.z, pl.pos.x, pl.pos.y, pl.pos.z)
      ) {
        this.setState('charge');
        this.cdx = nx;
        this.cdz = nz;
        game.audio.play('bruteRoar', this.pos);
        return;
      }
      this.steer(nx, nz, this.tuning.speed);
    } else if (this.kind === 'ticker') {
      // flat-out sprint with a nervous jitter; arm the charge on contact
      if (dist < 1.8) {
        this.setState('attack');
        this.beepCount = 0;
        return;
      }
      const jitter = Math.sin(this.animPhase * 6) * 0.25;
      let wx = nx - nz * jitter;
      let wz = nz + nx * jitter;
      const wl = Math.hypot(wx, wz);
      this.steer(wx / wl, wz / wl, this.tuning.speed);
      // agitated chittering while it closes in
      this.growlCd -= dt;
      if (this.growlCd <= 0) {
        this.growlCd = 1.6 + Math.random() * 2;
        game.audio.play('tickerAlert', this.pos);
      }
    } else {
      const los = game.hasLOS(this.pos.x, this.pos.y, this.pos.z, pl.pos.x, pl.eyeY(), pl.pos.z);
      if (los && dist < 14 && this.attackCooldown === 0) {
        this.setState('attack');
        return;
      }
      if (los && dist < 7) {
        // keep distance + strafe
        const strafe = Math.sin(this.hoverPhase * 0.9) > 0 ? 1 : -1;
        this.steer(-nx * 0.5 + -nz * strafe * 0.8, -nz * 0.5 + nx * strafe * 0.8, this.tuning.speed);
      } else {
        this.steer(nx, nz, this.tuning.speed);
      }
    }
  }

  /** brute charge: rear back, then barrel forward smashing crates/barrels */
  private doCharge(dt: number, game: Game): void {
    const pl = this.tgt ?? game.player;
    const TELEGRAPH = 0.55;
    if (this.stateTime < TELEGRAPH) {
      // dig in and track the player until launch
      this.vel.x *= 0.7;
      this.vel.z *= 0.7;
      const dx = pl.pos.x - this.pos.x;
      const dz = pl.pos.z - this.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      this.cdx = dx / d;
      this.cdz = dz / d;
      return;
    }
    const speed = this.tuning.speed * 4.2; // outruns the player in a straight line
    this.vel.x = this.cdx * speed;
    this.vel.z = this.cdz * speed;
    // dust kicked up behind it
    if (Math.random() < dt * 18) {
      game.particles.smoke(this.pos.x - this.cdx * 0.6, this.pos.y - 0.7, this.pos.z - this.cdz * 0.6, 1);
    }
    // smashes destructibles in its path (barrels explode ON it — its problem)
    const fx = Math.floor(this.pos.x + this.cdx * 0.9);
    const fz = Math.floor(this.pos.z + this.cdz * 0.9);
    const footY = Math.floor(this.pos.y - this.half.y + 0.2);
    for (let dy = 0; dy <= 1; dy++) {
      if (!isDestructible(game.world.get(fx, footY + dy, fz))) continue;
      const broke = game.world.damageVoxel(fx, footY + dy, fz, 200);
      if (broke !== null) game.onVoxelBroken(fx, footY + dy, fz, broke);
    }
    // trampled the player: heavy hit + launch
    const pdx = pl.pos.x - this.pos.x;
    const pdz = pl.pos.z - this.pos.z;
    const pd = Math.hypot(pdx, pdz);
    if (!pl.dead && pd < this.half.x + 1.0) {
      pl.damage(24 + Math.floor(Math.random() * 8), game, { x: this.pos.x, z: this.pos.z });
      const d = pd || 1;
      pl.vel.x += (pdx / d) * 13;
      pl.vel.y += 5.5;
      pl.vel.z += (pdz / d) * 13;
      pl.shake = Math.min(0.7, pl.shake + 0.35);
      game.audio.play('bruteSlam', this.pos);
      game.punchFOV(2);
      this.chargeCooldown = 4;
      this.attackCooldown = 0.8;
      this.vel.x *= 0.2;
      this.vel.z *= 0.2;
      this.setState('chase');
      return;
    }
    // ran out of steam
    if (this.stateTime > TELEGRAPH + 1.6) {
      this.chargeCooldown = 3.5;
      this.setState('chase');
    }
  }

  private doAttack(dt: number, dist: number, toPlayer: THREE.Vector3, game: Game): void {
    void dt;
    const pl = this.tgt ?? game.player;
    this.vel.x *= 0.8;
    this.vel.z *= 0.8;
    if (this.kind === 'husk' || this.kind === 'brute') {
      // windup then strike — must not reach through doors or walls
      const brute = this.kind === 'brute';
      if (this.stateTime > (brute ? 0.45 : 0.32) && this.attackCooldown === 0) {
        this.attackCooldown = brute ? 1.6 : 1.1;
        if (
          dist < (brute ? 2.9 : 2.1) && !pl.dead &&
          game.hasLOS(this.pos.x, this.pos.y + 0.2, this.pos.z, pl.pos.x, pl.pos.y, pl.pos.z)
        ) {
          pl.damage(
            brute ? 18 + Math.floor(Math.random() * 10) : 8 + Math.floor(Math.random() * 8),
            game, { x: this.pos.x, z: this.pos.z }
          );
          if (brute) {
            // backhand shove
            const d = Math.max(0.3, dist);
            pl.vel.x += (toPlayer.x / d) * 7;
            pl.vel.y += 3;
            pl.vel.z += (toPlayer.z / d) * 7;
            game.audio.play('bruteSlam', this.pos);
          } else {
            game.audio.play('huskBite', this.pos);
          }
        }
      }
      if (this.stateTime > (brute ? 0.95 : 0.75)) this.setState('chase');
    } else if (this.kind === 'ticker') {
      // armed: it stops, beeps faster and faster, then self-destructs — no
      // backing out once the charge is lit, so kite away from it
      const t = this.stateTime;
      const beepsDue = Math.floor(t / 0.16);
      if (beepsDue > this.beepCount) {
        this.beepCount = beepsDue;
        game.audio.play('tickerBeep', this.pos);
      }
      if (t > 0.55) {
        this.hp = 0;
        this.die(game); // die() queues the explosion
      }
    } else {
      // telegraph glow then fire a bolt
      const t = this.stateTime;
      for (const g of this.glowParts) {
        const m = g.material as THREE.MeshBasicMaterial;
        m.color.copy(g.userData.baseColor as THREE.Color).multiplyScalar(1 + Math.min(1.4, t * 3));
      }
      if (t > 0.5 && this.attackCooldown === 0) {
        this.attackCooldown = 1.5;
        const dir = new THREE.Vector3(toPlayer.x, pl.eyeY() - this.pos.y, toPlayer.z).normalize();
        // slight spread
        dir.x += (Math.random() - 0.5) * 0.04;
        dir.y += (Math.random() - 0.5) * 0.04;
        dir.z += (Math.random() - 0.5) * 0.04;
        dir.normalize();
        game.projectiles.spawn('bolt', this.pos.x + dir.x * 0.5, this.pos.y + dir.y * 0.5, this.pos.z + dir.z * 0.5, dir.x, dir.y, dir.z, 13, false);
        game.audio.play('boltFire', this.pos);
      }
      if (t > 0.85) this.setState('chase');
    }
  }

  private animate(dt: number, game: Game): void {
    if (this.spriteMesh) {
      this.spriteAnimate(dt, game);
      return;
    }
    const speed = Math.hypot(this.vel.x, this.vel.z);
    this.animPhase += dt * 2;
    if (this.kind === 'husk' || this.kind === 'brute') {
      this.animateHusk(dt, speed, game);
    } else if (this.kind === 'ticker') {
      this.animateTicker(speed, game);
    } else {
      for (let i = 0; i < this.fins.length; i++) {
        const fin = this.fins[i];
        const a = (i / 4) * Math.PI * 2 + this.animPhase * 1.5;
        fin.position.set(Math.cos(a) * 0.42, 0.05, Math.sin(a) * 0.42);
        fin.rotation.y = -a;
      }
    }
  }

  private animateTicker(speed: number, game: Game): void {
    // legs skitter in alternating tripods; the body vibrates when armed
    const g = this.animPhase * (2 + speed * 1.6);
    for (let i = 0; i < this.fins.length; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const leg = this.fins[i];
      leg.rotation.x = Math.sin(g * 3 + i * 1.1) * Math.min(0.7, speed * 0.14);
      leg.rotation.z = 0.5 * side;
    }
    const arming = this.state === 'attack';
    this.body.position.y = arming ? Math.sin(this.animPhase * 60) * 0.02 : Math.abs(Math.sin(g * 1.5)) * 0.03;
    // the core blinks with the arming beeps and glows hotter as it closes
    const core = this.glowParts[0];
    if (core) {
      const m = core.material as THREE.MeshBasicMaterial;
      const base = core.userData.baseColor as THREE.Color;
      const blink = arming ? (Math.floor(this.stateTime / 0.16) % 2 === 0 ? 2.2 : 0.6) : this.awake ? 1.4 : 1;
      m.color.copy(base).multiplyScalar(blink);
      if (arming) {
        game.dynLights.submit(this.pos.x, this.pos.y + 0.2, this.pos.z, 1, 0.65, 0.1, 0.5 * blink, 3);
      }
    }
  }

  private animateHusk(dt: number, speed: number, game: Game): void {
    const speedF = Math.min(1, speed / this.tuning.speed);
    this.gait += dt * (2 + speed * (this.kind === 'brute' ? 1.7 : 2.9));
    const g = this.gait;
    const hunting = this.state === 'chase' || this.state === 'attack' || this.state === 'charge';

    // strides swing from the hips; feet drive a bob and a side-to-side waddle
    const amp = 0.2 + speedF * 0.75;
    this.legLG!.rotation.x = Math.sin(g) * amp;
    this.legRG!.rotation.x = Math.sin(g + Math.PI) * amp;
    this.body.position.y = Math.abs(Math.cos(g)) * 0.08 * speedF;
    this.body.rotation.z = Math.sin(g) * 0.08 * speedF;

    // hunched torso leans into its run
    let lean = 0.16 + speedF * 0.24;
    const roll = Math.sin(g) * 0.06 * speedF;

    if (this.state === 'attack') {
      // telegraph: both claws rise, then the slash lands with the damage frame
      const t = this.stateTime;
      const windup = Math.min(1, t / 0.3);
      const slash = t > 0.32 ? Math.min(1, (t - 0.32) / 0.12) : 0;
      const armX = -0.5 - windup * 1.5 + slash * 2.1;
      this.armLG!.rotation.x = armX;
      this.armRG!.rotation.x = armX + 0.18;
      this.armLG!.rotation.z = 0.25 - slash * 0.35;
      this.armRG!.rotation.z = -0.25 + slash * 0.35;
      lean += slash * 0.35 - windup * 0.15;
      this.jaw!.rotation.x = 0.15 + windup * 0.6 - slash * 0.35;
    } else if (hunting) {
      // claws up and raking as it closes in, maw hanging open
      this.armLG!.rotation.x = -1.05 + Math.sin(g * 2) * 0.25;
      this.armRG!.rotation.x = -1.05 + Math.sin(g * 2 + Math.PI) * 0.25;
      this.armLG!.rotation.z = 0.18;
      this.armRG!.rotation.z = -0.18;
      this.jaw!.rotation.x = 0.3 + Math.sin(g) * 0.08;
    } else {
      // slouched shuffle, arms hanging, jaw shut
      this.armLG!.rotation.x = -0.12 + Math.sin(g) * 0.2;
      this.armRG!.rotation.x = -0.12 - Math.sin(g) * 0.2;
      this.armLG!.rotation.z = 0.08;
      this.armRG!.rotation.z = -0.08;
      this.jaw!.rotation.x = 0.05;
    }

    // charge: rear back during the telegraph, then bull forward
    if (this.state === 'charge') lean += this.stateTime < 0.55 ? -0.3 : 0.45;

    // pain: recoil backward off the lean
    if (this.state === 'pain') lean -= 0.5 * Math.max(0, 1 - this.stateTime / this.stunTime);

    this.torsoG!.rotation.x = lean;
    this.torsoG!.rotation.z = roll;

    // head: scans the room while unaware, locks forward while hunting
    if (!this.awake) {
      this.headG!.rotation.y = Math.sin(this.animPhase * 0.4) * 0.55;
      this.headG!.rotation.x = Math.sin(this.animPhase * 0.27) * 0.12;
    } else {
      this.headG!.rotation.y *= 0.8;
      this.headG!.rotation.x = -0.1;
    }

    // footfalls: chitin clicks for husks, ground-shaking thuds for brutes
    const stride = Math.sin(g);
    if (speed > (this.kind === 'brute' ? 0.9 : 1.6) && this.lastStride <= 0 !== stride <= 0) {
      game.audio.play(this.kind === 'brute' ? 'bruteStep' : 'huskStep', this.pos);
    }
    this.lastStride = stride;
  }

  /** tint body parts by baked + dynamic light; hit flash overrides */
  private updateLighting(game: Game, dt: number): void {
    this.lightTick += dt;
    if (this.lightTick < 0.08) return;
    this.lightTick = 0;
    const l = game.world.sampleLight01(this.pos.x, this.pos.y, this.pos.z);
    const d = game.dynLights.sampleAt(this.pos.x, this.pos.y, this.pos.z);
    // generous floor so enemies stay readable in dark/strongly-colored rooms
    const lum = 0.45 + (l[0] + l[1] + l[2]) * 0.35;
    const r = Math.min(1.3, lum + l[0] * 0.9 + d[0]);
    const g = Math.min(1.3, lum + l[1] * 0.9 + d[1]);
    const b = Math.min(1.3, lum + l[2] * 0.9 + d[2]);
    const flash = this.flashTime > 0;
    this.mesh.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      if (o.userData.fullBright) return;
      const m = o.material as THREE.MeshBasicMaterial;
      const base = o.userData.baseColor as THREE.Color;
      if (flash) m.color.setRGB(2.2, 1.9, 1.7);
      else m.color.setRGB(base.r * r, base.g * g, base.b * b);
    });
  }
}

export class EnemyManager {
  readonly group = new THREE.Group();
  readonly list: Enemy[] = [];

  /** remove all enemies (level teardown), freeing their geometry/materials */
  reset(): void {
    for (const e of this.list) {
      this.group.remove(e.mesh);
      e.mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const m = o.material as THREE.MeshBasicMaterial;
          m.map?.dispose(); // per-enemy sprite texture clones
          m.dispose();
        }
      });
    }
    this.list.length = 0;
  }

  spawnFromSpecs(specs: EnemySpec[], rooms: RoomDef[], game: Game): void {
    for (const s of specs) {
      const room = rooms.find((r) => r.id === s.roomId) ?? null;
      // ground = lowest walkable air at the spawn cell (air with solid below,
      // and headroom above) — NOT the rock above the room's ceiling
      const sx = Math.floor(s.x);
      const sz = Math.floor(s.z);
      let ground = 1;
      for (let y = 1; y <= 10; y++) {
        if (
          !game.world.isSolid(sx, y, sz) &&
          !game.world.isSolid(sx, y + 1, sz) &&
          game.world.isSolid(sx, y - 1, sz)
        ) {
          ground = y;
          break;
        }
      }
      const e = new Enemy(s, room, ground, Math.random() < 0.45);
      this.list.push(e);
      this.group.add(e.mesh);
    }
  }

  update(dt: number, game: Game): void {
    for (const e of this.list) e.update(dt, game);
    // pairwise separation between alive enemies — applied as velocity so it
    // goes through wall collision (direct position pushes could embed an
    // enemy in a wall, which breaks collision resolution entirely)
    for (let i = 0; i < this.list.length; i++) {
      const a = this.list[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.list.length; j++) {
        const b = this.list[j];
        if (!b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        const min = a.half.x + b.half.x + 0.25;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const accel = ((min - d) / min) * 30 * dt;
          const nx = dx / d;
          const nz = dz / d;
          a.vel.x -= nx * accel;
          a.vel.z -= nz * accel;
          b.vel.x += nx * accel;
          b.vel.z += nz * accel;
        }
      }
    }
    // safety net: anything that somehow leaves the world snaps back to its room
    for (const e of this.list) {
      if (!e.alive) continue;
      if (e.pos.y < -8 || e.pos.y > game.world.sy + 6 ||
          e.pos.x < -4 || e.pos.x > game.world.sx + 4 ||
          e.pos.z < -4 || e.pos.z > game.world.sz + 4) {
        e.respawnInRoom();
      }
    }
  }

  /** nearest alive enemy hit by a ray, or null */
  raycast(
    ox: number, oy: number, oz: number,
    dx: number, dy: number, dz: number,
    maxT: number
  ): { enemy: Enemy; t: number } | null {
    let best: { enemy: Enemy; t: number } | null = null;
    for (const e of this.list) {
      if (!e.alive) continue;
      const t = rayBox(ox, oy, oz, dx, dy, dz, maxT, {
        minX: e.pos.x - e.half.x, maxX: e.pos.x + e.half.x,
        minY: e.pos.y - e.half.y, maxY: e.pos.y + e.half.y,
        minZ: e.pos.z - e.half.z, maxZ: e.pos.z + e.half.z,
      });
      if (t !== null && (best === null || t < best.t)) best = { enemy: e, t };
    }
    return best;
  }

  /** wake alive enemies within radius of a noise (gunshots etc.) */
  alertAt(x: number, z: number, radius: number, game: Game): void {
    for (const e of this.list) {
      if (!e.alive || e.awake) continue;
      const dx = e.pos.x - x;
      const dz = e.pos.z - z;
      if (dx * dx + dz * dz < radius * radius) e.wake(game);
    }
  }

  aliveCount(): number {
    return this.list.filter((e) => e.alive).length;
  }
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
