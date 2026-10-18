import * as THREE from 'three';
import { Renderer } from './core/renderer';
import { Input } from './core/input';
import { AudioMan } from './core/audio';
import { Music } from './core/music';
import { TouchControls, isTouchDevice } from './core/touch';
import { Box, rayBox } from './core/physics';
import { VoxelWorld } from './world/world';
import { ChunkManager } from './world/mesher';
import { generateLevel, LevelData, type LevelTheme } from './world/levelgen';
import { Block, isDestructible } from './world/blocks';
import { Player } from './entities/player';
import { Door, Elevator, ExitBeacon } from './entities/door';
import { Enemy, EnemyManager } from './entities/enemies';
import { PickupManager } from './entities/pickups';
import { ProjectilePool } from './entities/projectiles';
import { Overload, type OverloadReward } from './entities/overload';
import { Particles } from './fx/particles';
import { Tracers } from './fx/tracers';
import { DynLights } from './fx/dynlights';
import { WeaponSystem } from './weapons/weapons';
import { buildOperative, type OperativeRig } from './entities/operative';
import { HUD } from './ui/hud';
import { Automap } from './ui/automap';
import { Netplay } from './net/netplay';
import { GameSettings, loadSettings, saveSettings } from './core/settings';
import { EnemySpec, KeyColor, PickupKind, PickupSpec } from './types';
import { POKI, poki } from './platform/poki';
import { isPerkId, isReward, offerDef, rollPerkOffer, type OfferId, type PerkId } from './core/perks';
import { BASE_AMMO_MAX, BASE_MAX_HEALTH } from './entities/player';
import { biofoundryTerminal, decorateBiofoundry } from './preview/biofoundry';

type GameState = 'title' | 'playing' | 'paused' | 'overload' | 'dead' | 'intermission' | 'won';

/** Injected by main.ts for `?sector4` (web builds only; lazy-loaded, never on Poki). */
/** what a preview's decorate() hands back: scenery plus optional live hooks */
export interface PreviewArt {
  group: THREE.Group;
  dispose(): void;
  /** per frame while the sim runs (authority only) */
  update?(dt: number, game: Game): void;
  /** a shot or blast hit a TankGlass voxel */
  tankHit?(x: number, y: number, z: number, game: Game): void;
  /** loud combat at (x, z) — gunfire */
  noise?(x: number, z: number, radius: number, game: Game): void;
}

export interface LevelPreview {
  generate(seed: number): LevelData;
  decorate(level: LevelData): PreviewArt;
  showScreen(onStart: () => void, onLeave: () => void, cleared?: boolean): () => void;
}

/** facility-themed sectors; co-op campaigns end after these */
const FACILITY_SECTORS = 3;
/**
 * then the Biofoundry theme (solo, behind the facility terminal): generated
 * fresh every run like the facility, same keycard → red door → lift → pad
 */
const BIOFOUNDRY_SECTOR = 4;
/** sector 5 is the deep Biofoundry: same theme, slightly harder (levelgen) */
const TOTAL_SECTORS = 5;

/** what enemy AI / explosions / bolts need from "a player" — the local
 *  Player and the co-op partner's RemotePlayer both satisfy this shape */
export interface PlayerTarget {
  pos: THREE.Vector3;
  half: THREE.Vector3;
  vel: THREE.Vector3;
  shake: number;
  dead: boolean;
  eyeY(): number;
  damage(amount: number, game: Game, source?: { x: number; z: number }): void;
}

/** the sector's critical path, as shown by the HUD objective tracker */
type ObjectiveStage = 'boss' | 'key' | 'door' | 'lift' | 'pad';
const OBJECTIVES: Record<ObjectiveStage, { text: string; color: string; icon: 'keycard' | 'door' | 'lift' | 'pad' | 'boss' }> = {
  boss: { text: 'Kill the Broodkeeper', color: '#ff8a2a', icon: 'boss' },
  key: { text: 'Find the red keycard', color: '#ff3428', icon: 'keycard' },
  door: { text: 'Open the red door', color: '#ff3428', icon: 'door' },
  lift: { text: 'Ride the lift up', color: '#ffd028', icon: 'lift' },
  pad: { text: 'Step on the exit pad', color: '#4cc26a', icon: 'pad' },
};

/** the optional Overload room: hidden from players; web builds show it with ?overload */
const OVERLOAD_ENABLED = !POKI && typeof location !== 'undefined' && new URLSearchParams(location.search).has('overload');

/** localStorage flag: the first-run control hints have been shown */
const TUTORIAL_KEY = 'voxelstrike-tutorial-done';

/**
 * Run state at a sector's start. Retrying a sector restores it; from sector 2
 * on it's also saved to localStorage so "Continue" survives a closed tab.
 */
interface Checkpoint {
  v: 1;
  seed: number;
  sector: number;
  score: number;
  health: number;
  armor: number;
  ammo: Record<string, number>;
  owned: string[];
  current: string;
  totalKills: number;
  totalEnemies: number;
  totalSecretsFound: number;
  totalSecrets: number;
  totalTime: number;
  focusedShotgun?: boolean;
  /** run perks picked so far (src/core/perks.ts) */
  perks?: string[];
}

/** localStorage key of the saved run (same key as the earlier Poki build) */
const RUN_KEY = 'voxelstrike-run';
/** sector ranks, best first, and the score each adds (solo) */
type Rank = 'S' | 'A' | 'B' | 'C';
const RANK_ORDER: Rank[] = ['S', 'A', 'B', 'C'];
const RANK_BONUS: Record<Rank, number> = { S: 1500, A: 1000, B: 500, C: 0 };

/** deepest endless depth reached on this device (title footer) */
const BEST_DEPTH_KEY = 'voxelstrike-best-depth';

/** set the first time the player enters the Biofoundry: hides the title's NEW SECTOR banner */
const BIOFOUNDRY_SEEN_KEY = 'voxelstrike-biofoundry-seen';

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage may be unavailable
  }
}

function storageSet(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage may be unavailable */ }
}

/**
 * Co-op only: reload to a fresh title screen. Solo runs restart in place
 * (goToTitle / retrySector / newRunNow); co-op tears down a network session,
 * and the URL's role/room params must go too. Normal builds drop the URL
 * params; Poki's iframe URL carries the platform's own, so there it's a plain
 * reload.
 */
function reloadToTitle(): void {
  if (POKI) location.reload();
  else location.href = location.pathname;
}

export class Game {
  readonly rendererSys: Renderer;
  readonly camera: THREE.PerspectiveCamera;
  readonly input: Input;
  readonly audio = new AudioMan();
  readonly music = new Music(this.audio);
  readonly hud: HUD;
  readonly dynLights = new DynLights();
  readonly particles = new Particles();
  readonly tracers = new Tracers();
  readonly projectiles = new ProjectilePool();
  readonly enemies = new EnemyManager();
  readonly player = new Player();
  readonly weapons = new WeaponSystem();
  overload: Overload | null = null;
  readonly isTouch = isTouchDevice();
  /** defaults depend on the device (pixelation: 480 lines desktop, 320 touch) */
  readonly settings: GameSettings = loadSettings(this.isTouch);
  private automap!: Automap;
  /** co-op session (null in single-player) */
  net: Netplay | null = null;

  world!: VoxelWorld;
  level!: LevelData;
  doors: Door[] = [];
  elevator: Elevator | null = null;
  private chunks: ChunkManager | null = null;
  pickups!: PickupManager;

  private state: GameState = 'title';
  private clock = new THREE.Clock();
  private time = 0;
  private baseSeed: number;
  levelIndex = 1;
  kills = 0;
  private totalKills = 0;
  private totalEnemiesSoFar = 0;
  private secretsFound = 0;
  private totalSecretsFound = 0;
  private totalSecretsSoFar = 0;
  private secretAnnounced = false;
  private deathTimer = 0;
  private levelStartTime = 0;
  private totalPlayTime = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private solidBoxCache: Box[] = [];
  private solidBoxFrame = -1;
  private frameCounter = 0;
  /** delayed explosions (barrel chains, ticker corpses): fuse seconds + yield */
  private pendingExplosions: Array<{ x: number; y: number; z: number; t: number; dmg: number; radius: number }> = [];
  /** score + kill-combo chain (window resets on each kill) */
  score = 0;
  private comboChain = 0;
  private comboTimer = 0;
  private fovKick = 0;
  private lowHealth = false;
  private ambientTimer = 8;
  /** stays in combat music for a few seconds after the last contact */
  private combatLinger = 0;

  private previewArt: PreviewArt | null = null;
  private previewMenuStop: (() => void) | null = null;

  /**
   * Play-as-operative preview (`?play=operative[&helmet=0]`, web builds only):
   * the operative's arms on the guns, his body under you when you look
   * down, and with the helmet on a faint visor frame. Off by default.
   */
  private fpBody: OperativeRig | null = null;
  private fpStride = 0;
  private fpLightTick = 0;
  private fpWasGround = true;

  constructor(parent: HTMLElement, private readonly preview?: LevelPreview) {
    if (preview) this.levelIndex = 4;
    this.rendererSys = new Renderer(parent);
    this.camera = this.rendererSys.camera;
    this.input = new Input(this.rendererSys.renderer.domElement);
    this.hud = new HUD(parent);

    const seedParam = new URLSearchParams(location.search).get('seed');
    this.baseSeed = seedParam ? Number(seedParam) : Math.floor(Math.random() * 0xffffffff);

    // persistent scene objects (pools survive level transitions)
    const scene = this.rendererSys.scene;
    scene.add(this.particles.mesh);
    scene.add(this.tracers.group);
    scene.add(this.projectiles.group);
    // the gun renders in its own depth-cleared pass (see Renderer.overlay)
    this.rendererSys.overlay.add(this.weapons.viewModel);
    scene.add(this.camera);
    // menu shows the bare facility; the gun raises when the run starts
    this.weapons.viewModel.visible = false;

    const params = new URLSearchParams(location.search);
    if (!POKI && params.get('play') === 'operative') this.setupOperativePlay(params.get('helmet') !== '0');

    this.automap = new Automap(this.hud.container);
    this.input.onToggleMap = () => this.toggleMap();
    this.input.onInteract = () => this.openOverload();
    this.hud.onOverloadAction = () => this.openOverload();
    this.hud.onMapClick = () => this.toggleMap();
    this.hud.onPauseClick = () => this.requestPause();

    if (this.isTouch) {
      new TouchControls(this.hud.container, this.input, () => this.requestPause(), () => this.toggleMap(),
        () => this.weapons.loadout());
    }

    this.buildLevel();
    this.applySettings();

    this.showTitleScreen();
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.input.onFirstInteract = () => this.audio.init();
    // pointer lock fails when the game starts long after the last click
    // (a co-op host waiting for a partner) — any in-game click recaptures it
    this.input.onUnlockedClick = () => {
      if (this.state === 'playing' && !this.isTouch) this.input.requestLock();
    };

    // WebGL context loss (iOS Safari under GPU memory pressure, or after the
    // app is backgrounded): three.js preventDefaults it and re-uploads every
    // resource on restore — we pause behind a "graphics lost" overlay so
    // nobody dies behind a frozen frame, with a reload fallback
    const canvas = this.rendererSys.renderer.domElement;
    canvas.addEventListener('webglcontextlost', () => this.onContextLost());
    canvas.addEventListener('webglcontextrestored', () => this.onContextRestored());

    // debug hook for automated smoke tests
    (window as unknown as Record<string, unknown>).__voxelstrike = this;

    // co-op auto-start from URL (used by tests and shareable join links):
    // ?role=host|join&room=CODE[&mp=local]
    const q = new URLSearchParams(location.search);
    const role = q.get('role');
    const room = q.get('room');
    if (!POKI && !this.preview && (role === 'host' || role === 'join') && room) {
      void this.startCoop(role, room, q.get('mp') === 'local');
    }

    this.clock.start();
    const loop = (): void => {
      requestAnimationFrame(loop);
      this.frame();
    };
    requestAnimationFrame(loop);
    // background heartbeat: rAF freezes in hidden tabs, which would freeze the
    // whole co-op world whenever the host alt-tabs. Keep simulating on a timer
    // while hidden (browsers may throttle it, but the world stays alive).
    window.setInterval(() => {
      if (document.hidden) this.frame();
    }, 50);
  }

  /** seed for the current sector, derived from the base seed */
  private levelSeed(): number {
    return (this.baseSeed + (this.levelIndex - 1) * 104729) >>> 0;
  }

  get isNetClient(): boolean {
    return this.net !== null && !this.net.isHost;
  }

  get isNetHost(): boolean {
    return this.net !== null && this.net.isHost;
  }

  baseSeedValue(): number {
    return this.baseSeed;
  }

  /** everyone the enemies can hunt: the local player + the co-op partner */
  /** door triggers this frame (player, partner, awake enemies), pooled */
  private readonly doorActors: Array<{ x: number; z: number; isPlayer: boolean }> = [];
  private readonly doorActorPool: Array<{ x: number; z: number; isPlayer: boolean }> = [];

  private setDoorActor(i: number, x: number, z: number, isPlayer: boolean): number {
    let a = this.doorActorPool[i];
    if (!a) {
      a = { x: 0, z: 0, isPlayer: false };
      this.doorActorPool.push(a);
    }
    a.x = x;
    a.z = z;
    a.isPlayer = isPlayer;
    this.doorActors[i] = a;
    return i + 1;
  }

  private setupOperativePlay(helmet: boolean): void {
    this.weapons.useOperativeArms();
    // the body: game physics moves it, so the jump only poses the legs. The
    // camera sits inside the head, and the first-person arms replace the
    // rig's own, so both are hidden.
    const rig = buildOperative({ jumpLift: false });
    rig.setHelmet(helmet);
    rig.neck.visible = false;
    rig.shoulderL.visible = false;
    rig.shoulderR.visible = false;
    // the eye is 9cm above the chest: the plates, shoulder caps and backpack
    // filled the screen as a grey slab when looking down. Keep the belt and
    // below (belt, pelvis, legs, boots), as FPS bodies do.
    for (const c of rig.torso.children) {
      if ((c as THREE.Mesh).isMesh && c.position.y + rig.torso.position.y > 1.0) c.visible = false;
    }
    rig.root.visible = false;
    this.rendererSys.scene.add(rig.root);
    this.fpBody = rig;
    if (helmet) {
      // the inside of the visor: darkened corners and a faint cyan rim,
      // under every HUD element
      const visor = document.createElement('div');
      visor.id = 'fp-visor';
      visor.style.cssText = [
        'position:absolute', 'inset:0', 'pointer-events:none', 'z-index:0',
        'background:radial-gradient(ellipse 78% 74% at 50% 50%, transparent 68%, rgba(4,12,20,0.5) 92%, rgba(2,6,12,0.78) 100%)',
        'box-shadow:inset 0 0 0 2px rgba(85,224,255,0.10), inset 0 0 70px rgba(40,150,190,0.16)',
      ].join(';');
      this.hud.container.prepend(visor);
    }
  }

  /** keep the operative's body under the player: placed, posed, CPU-lit */
  private updateOperativeBody(dt: number): void {
    const rig = this.fpBody;
    if (!rig) return;
    const p = this.player;
    const show = this.state !== 'title' && !p.dead && !!this.world;
    rig.root.visible = show;
    if (!show) return;
    // a step behind the eye, so looking down shows the boots ahead of you
    const BACK = 0.1;
    rig.root.position.set(p.pos.x + Math.sin(p.yaw) * BACK, p.pos.y - p.half.y, p.pos.z + Math.cos(p.yaw) * BACK);
    rig.root.rotation.y = p.yaw;
    // stride with the ground speed; backpedalling runs the cycle backwards
    const v = Math.hypot(p.vel.x, p.vel.z);
    const fwd = -(p.vel.x * Math.sin(p.yaw) + p.vel.z * Math.cos(p.yaw));
    this.fpStride += dt * Math.min(1.4, v / 5.5) * (fwd < -0.3 ? -1 : 1);
    if (this.fpWasGround && !p.onGround && p.vel.y > 1) rig.jump(this.time);
    this.fpWasGround = p.onGround;
    rig.animate(this.time, p.onGround ? Math.min(1, v / 2.5) : 0, this.fpStride);
    // CPU-lit like the enemies: baked light + dynamic lights at the body
    this.fpLightTick += dt;
    if (this.fpLightTick >= 0.08) {
      this.fpLightTick = 0;
      const l = this.world.sampleLight01(p.pos.x, p.pos.y, p.pos.z, this.fpLight);
      const d = this.dynLights.sampleAt(p.pos.x, p.pos.y, p.pos.z, this.fpDyn);
      // softer than the enemies' tint: seen this close under a lamp, the top
      // faces washed out to pale blue
      const lum = 0.38 + (l[0] + l[1] + l[2]) * 0.25;
      rig.tint(
        Math.min(1.05, lum + l[0] * 0.6 + d[0] * 0.6),
        Math.min(1.05, lum + l[1] * 0.6 + d[1] * 0.6),
        Math.min(1.05, lum + l[2] * 0.6 + d[2] * 0.6),
      );
    }
  }

  private readonly fpLight: [number, number, number] = [0, 0, 0];
  private readonly fpDyn: [number, number, number] = [0, 0, 0];

  /** reused arrays: every enemy asks every frame */
  private readonly soloTargets: PlayerTarget[] = [];
  private readonly duoTargets: PlayerTarget[] = [];

  playerTargets(): PlayerTarget[] {
    if (this.net && this.net.connected) {
      this.duoTargets[0] = this.player;
      this.duoTargets[1] = this.net.remote;
      return this.duoTargets;
    }
    this.soloTargets[0] = this.player;
    return this.soloTargets;
  }

  /** authoritative numbers for the co-op snapshot */
  netStats(): { score: number; mult: number; kills: number; total: number } {
    return {
      score: this.score,
      mult: Math.min(5, this.comboChain) || 1,
      kills: this.kills,
      total: this.level.totalEnemies,
    };
  }

  detachNet(): void {
    this.net?.dispose();
    this.net = null;
  }

  /** co-op teleport-in: rising energy column + teal flash + shimmer */
  spawnFX(x: number, y: number, z: number): void {
    this.particles.teleport(x, y, z);
    this.dynLights.flash(x, y + 0.6, z, 0.35, 0.9, 1, 2.2, 9, 0.5);
    this.audio.play('teleport', { x, y, z });
  }

  /** the co-op link died (clean close OR 6s of silence) */
  netConnectionLost(iAmHost: boolean): void {
    this.detachNet();
    if (iAmHost) {
      // the host owns the sim — carry on solo, just say so
      this.hud.message('P2 DISCONNECTED — continuing solo.');
      return;
    }
    // the client's world is dead without the host: say why, then kick to menu
    this.audio.setHeartbeat(false);
    this.hud.setLowHealth(false);
    this.state = 'won'; // terminal: stops the sim, hides the automap
    this.input.releaseLock();
    this.hud.showDisconnected(() => {
      reloadToTitle();
    });
    window.setTimeout(() => {
      reloadToTitle();
    }, 4000);
  }

  private teardownLevel(): void {
    const scene = this.rendererSys.scene;
    if (this.overload) {
      scene.remove(this.overload.group);
      this.overload.dispose();
      this.overload = null;
    }
    this.hud.setOverloadAction('');
    if (this.previewArt) {
      scene.remove(this.previewArt.group);
      this.previewArt.dispose();
      this.previewArt = null;
    }
    if (this.chunks) {
      scene.remove(this.chunks.group);
      this.chunks.dispose();
      this.chunks = null;
    }
    for (const d of this.doors) {
      scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      const dm = d.mesh.material as THREE.MeshBasicMaterial;
      dm.map?.dispose(); // per-door canvas texture
      dm.dispose();
    }
    this.doors = [];
    if (this.elevator) {
      scene.remove(this.elevator.group);
      this.elevator.dispose();
      this.elevator = null;
    }
    if (this.exitBeacon) {
      scene.remove(this.exitBeacon.mesh);
      this.exitBeacon.dispose();
      this.exitBeacon = null;
    }
    if (this.pickups) {
      scene.remove(this.pickups.group);
      this.pickups.dispose();
    }
    scene.remove(this.enemies.group);
    this.enemies.reset();
    this.projectiles.reset();
    this.particles.clear();
    this.pendingExplosions.length = 0;
  }

  private buildLevel(): void {
    this.teardownLevel();
    const seed = this.levelSeed();
    console.log(`[voxelstrike] generating sector ${this.levelIndex}, seed=${seed}`);
    const authored = this.authoredLevel();
    const theme = this.themeFor(this.levelIndex);
    this.level = authored ? authored.generate(seed) : generateLevel(seed, this.levelIndex, theme, this.bossFor(this.levelIndex));
    this.world = this.level.world;
    const scene = this.rendererSys.scene;

    this.chunks = new ChunkManager(
      this.world, this.dynLights,
      this.rendererSys.fogColor, this.rendererSys.fogNear, this.rendererSys.fogFar
    );
    this.chunks.buildAll();
    scene.add(this.chunks.group);
    // Biofoundry scenery + live tanks: the authored ?sector4 map, or a generated sector 4
    if (authored || this.level.bio) {
      this.previewArt = authored ? authored.decorate(this.level) : decorateBiofoundry(this.level);
      scene.add(this.previewArt.group);
    }

    for (const spec of this.level.doors) {
      const door = new Door(spec, this.world);
      this.doors.push(door);
      scene.add(door.mesh);
    }
    if (this.level.elevator) {
      this.elevator = new Elevator(this.level.elevator);
      scene.add(this.elevator.group);
    }
    if (this.level.exitPad) {
      this.exitBeacon = new ExitBeacon(this.level.exitPad);
      scene.add(this.exitBeacon.mesh);
    }

    // a boss carries the red keycard: it drops at the spec's spot when it dies
    this.bossEnemy = null;
    this.bossKey = this.level.boss ? this.level.pickups.find((p) => p.kind === 'keyRed') ?? null : null;
    this.pickups = new PickupManager(this.bossKey ? this.level.pickups.filter((p) => p !== this.bossKey) : this.level.pickups, this.world);
    scene.add(this.pickups.group);
    this.automap.reset(this);

    this.enemies.spawnFromSpecs(this.level.enemies, this.level.rooms, this);
    if (this.level.boss) {
      const b = this.level.boss;
      this.enemies.spawnFromSpecs([{ kind: 'broodkeeper', x: b.x, z: b.z, roomId: b.roomId }], this.level.rooms, this);
      this.bossEnemy = this.enemies.list[this.enemies.list.length - 1];
      this.bossEnemy.setBossFacing(b.yaw);
    }
    // endless depths: every enemy is a little tougher (+8% a depth, up to +80%)
    if (this.levelIndex > TOTAL_SECTORS) {
      const k = Math.min(1.8, 1 + 0.08 * (this.levelIndex - TOTAL_SECTORS));
      for (const e of this.enemies.list) e.hp = Math.round(e.hp * k);
      if (!this.preview && this.levelIndex > Number(storageGet(BEST_DEPTH_KEY) ?? 0)) {
        storageSet(BEST_DEPTH_KEY, String(this.levelIndex));
      }
    }
    scene.add(this.enemies.group);
    // the optional Overload encounter lives in the generated sectors only, and
    // is hidden from players for now (a second terminal + offer screen in every
    // sector muddied the one goal while playtime was the problem): web builds
    // open it with ?overload for development, Poki never shows it
    if (!authored && !this.net && OVERLOAD_ENABLED) {
      this.overload = Overload.create(this);
      if (this.overload) scene.add(this.overload.group);
    }
    // compile shaders + upload textures now, not on first use mid-fight
    this.rendererSys.warmUp();

    // per-level state
    this.kills = 0;
    this.secretsFound = 0;
    this.secretAnnounced = false;
    this.player.keys.clear();
    this.player.dead = false;
    // reached the Biofoundry (campaign, not the ?sector4 preview): it's no longer "new"
    if (this.level.theme === 'biofoundry' && !this.preview) storageSet(BIOFOUNDRY_SEEN_KEY, '1');
    // a fresh attempt at a sector: no keycard checkpoint yet, revive available
    this.keyCheckpoint = null;
    this.revivesUsed = 0;
    this.player.spawnAt(this.level.spawn.x, this.level.spawn.y, this.level.spawn.z);
    this.safePos.set(0, 0, 0);
    this.embedTime = 0;
    this.objStage = null;
    this.player.pitch = 0;
    // face into the level: toward the nearest connected room
    const spawnRoom = this.level.rooms.find((r) => r.kind === 'spawn')!;
    const other = this.level.rooms.find((r) => r.dist === 1) ?? this.level.rooms[1];
    this.player.yaw = Math.atan2(-(other.cx - spawnRoom.cx), -(other.cz - spawnRoom.cz));
    // Web-only shortcut for hands-on testing; ordinary campaign spawns stay intact.
    if (!POKI && !this.net && this.overload && this.levelIndex === 1 && new URLSearchParams(location.search).has('overload')) {
      this.player.spawnAt(this.overload.x, 1.88, this.overload.z + 2);
      this.player.yaw = 0;
      this.weapons.restoreLoadout(['pistol', 'shotgun'], 'shotgun');
      this.player.ammo.shells = Math.max(24, this.player.ammo.shells);
    }

    this.hud.updateStats(this.player);
    this.hud.updateWeapon(this.weapons);
    this.net?.onLevelBuilt();
    console.log(`[voxelstrike] sector ${this.levelIndex} ready: ${this.level.rooms.length} rooms, ${this.level.enemies.length} enemies, ${this.doors.length} doors`);
  }

  // ---- co-op session management -------------------------------------------

  openCoop(): void {
    const local = new URLSearchParams(location.search).get('mp') === 'local';
    this.hud.showCoop({
      onHost: () => {
        const code = Array.from({ length: 4 }, () =>
          'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 31)]
        ).join('');
        this.hud.coopShowCode(code);
        this.hud.coopStatus('Share the code with your partner — waiting for them to join...');
        void this.startCoop('host', code, local);
      },
      onJoin: (code) => {
        this.hud.coopStatus('Connecting...');
        void this.startCoop('join', code, local);
      },
      onBack: () => {
        this.detachNet();
        this.showTitleScreen();
      },
    });
  }

  private async startCoop(role: 'host' | 'join', room: string, local: boolean): Promise<void> {
    try {
      this.detachNet();
      this.net = new Netplay(this, role, room, local);
      // The optional encounter is solo-only for this first playtest.
      if (this.overload) {
        this.rendererSys.scene.remove(this.overload.group);
        this.overload.dispose();
        this.overload = null;
        this.hud.setOverloadAction('');
      }
      await this.net.ready;
      this.net.connected = true;
      if (this.net.isHost) {
        this.net.sendHello(this.baseSeed);
        this.startGame();
      } else {
        this.hud.coopStatus('Found the host — syncing the world...');
        const seed = await this.net.waitHello();
        this.baseSeed = seed >>> 0;
        this.levelIndex = 1;
        this.buildLevel();
        this.startGame();
      }
      this.hud.message(this.net.isHost
        ? 'Partner connected — you are P1. Watch each other\'s backs.'
        : 'Linked up with the host — you are P2. Watch each other\'s backs.');
      // materialize with some ceremony
      this.spawnFX(this.player.pos.x, this.player.pos.y, this.player.pos.z);
    } catch (err) {
      console.warn('[coop] connection failed', err);
      this.hud.coopStatus('Connection failed — check the room code and try again.');
      this.detachNet();
    }
  }

  /** co-op client: the host cleared the sector / finished the campaign */
  netShowWin(final: boolean, heading: string, stats: string): void {
    this.audio.play('win');
    this.audio.setHeartbeat(false);
    this.lowHealth = false;
    this.hud.setLowHealth(false);
    this.input.releaseLock();
    if (final) {
      this.state = 'won';
      this.hud.showWin(stats, () => reloadToTitle());
    } else {
      this.state = 'intermission';
      this.hud.showWaiting(heading, stats, 'WAITING FOR THE HOST TO DESCEND...');
    }
  }

  /** co-op client: the host started the next sector */
  netNextLevel(): void {
    this.levelIndex++;
    this.buildLevel();
    this.hud.hideScreen();
    this.state = 'playing';
    this.levelStartTime = this.time;
    if (!this.isTouch) this.input.requestLock();
    this.hud.message(`SECTOR ${this.levelIndex} of ${this.totalSectors} — it gets worse down here.`);
  }

  /** an ad break is in flight: swallow repeat clicks, hold pointer-lock resumes */
  private breakPending = false;
  /** WebGL context is lost: no resuming until it's back */
  private gfxLost = false;
  /** run state at the current sector's start (retry restores it) */
  private checkpoint: Checkpoint | null = null;
  /**
   * Mid-sector checkpoint taken when the red keycard is grabbed (solo only).
   * Retrying from it is IN PLACE: the world stays as you left it (kills,
   * opened doors, taken pickups), you stand where you took the key, still
   * holding it, with gear no worse than you had then. Never persisted —
   * Continue resumes at the sector start.
   */
  private keyCheckpoint: { cp: Checkpoint; x: number; y: number; z: number; yaw: number } | null = null;
  /** revives spent on this sector attempt (1 allowed, 2 with Second Wind; a retry gives them back) */
  private revivesUsed = 0;
  /** perks picked this run (sector-clear screen); kept by retry / save / Continue */
  private perks = new Set<PerkId>();
  /** score when this sector attempt began: the clear screen's kill points */
  private levelStartScore = 0;
  /** the Broodkeeper on a boss sector (null elsewhere) */
  private bossEnemy: Enemy | null = null;
  /** the red keycard it carries, held back until it dies */
  private bossKey: PickupSpec | null = null;

  hasPerk(p: PerkId): boolean {
    return this.perks.has(p);
  }

  /** the player's own blasts (barrels, rockets): wider with Volatile */
  blastRadius(base: number): number {
    return this.perks.has('volatile') ? base * 1.35 : base;
  }

  private get revivesAllowed(): number {
    return this.perks.has('secondWind') ? 2 : 1;
  }

  /** Self-Repair perk: armor rebuilds to 50 after 4 s without taking damage */
  private repairAcc = 0;
  private selfRepair(dt: number): void {
    const pl = this.player;
    if (pl.dead || pl.sinceHurt < 4 || pl.armor >= 50) {
      this.repairAcc = 0;
      return;
    }
    this.repairAcc += dt * 12; // 12 armor a second
    if (this.repairAcc < 1) return;
    const n = Math.floor(this.repairAcc);
    this.repairAcc -= n;
    pl.armor = Math.min(50, pl.armor + n);
    this.hud.updateStats(pl);
  }

  /** caps that perks change: max health (Vitality) and ammo capacity (Deep Pockets) */
  private applyPerkStats(): void {
    const pl = this.player;
    pl.maxHealth = this.perks.has('vitality') ? BASE_MAX_HEALTH + 25 : BASE_MAX_HEALTH;
    const k = this.perks.has('deepPockets') ? 1.5 : 1;
    for (const t of Object.keys(BASE_AMMO_MAX) as (keyof typeof BASE_AMMO_MAX)[]) {
      pl.ammoMax[t] = Math.round(BASE_AMMO_MAX[t] * k);
      pl.ammo[t] = Math.min(pl.ammo[t], pl.ammoMax[t]);
    }
    pl.health = Math.min(pl.health, pl.maxHealth);
  }
  /** first-run control hints: index of the next hint, -1 = off */
  private tipStep = -1;
  /** current objective step; null forces a refresh (new sector) */
  private objStage: ObjectiveStage | null = null;
  private exitBeacon: ExitBeacon | null = null;
  /** last spot the player stood on open ground (guardPlayerInWorld) */
  private safePos = new THREE.Vector3();
  private embedTime = 0;
  private tipTimer = 0;

  /**
   * Poki: offer a video ad at a natural break (run start, retry, between
   * sectors, unpause), then continue. `then(adShown)` — when an ad actually
   * played the click gesture is gone, so desktop needs a fresh click before
   * pointer lock (enterSector/resumeGame show "click to continue"). Audio is
   * initialised now, inside the gesture. Plain builds continue immediately.
   */
  private afterBreak(then: (adShown: boolean) => void): void {
    if (!POKI) {
      then(false);
      return;
    }
    if (this.breakPending) return; // extra clicks on the screen while the ad runs
    this.breakPending = true;
    this.audio.init();
    let shown = false;
    void poki
      .commercialBreak(() => {
        shown = true;
        this.audio.setMuted(true);
        this.input.releaseAll();
      })
      .then(() => {
        if (shown) {
          this.audio.setMuted(false);
          this.input.releaseAll();
        }
        this.breakPending = false;
        then(shown);
      });
  }

  // ------------------------------------------------------------------ run flow

  private makeCheckpoint(sector: number): Checkpoint {
    const lo = this.weapons.loadout();
    return {
      v: 1,
      seed: this.baseSeed,
      sector,
      score: this.score,
      health: this.player.health,
      armor: this.player.armor,
      ammo: { ...this.player.ammo },
      owned: lo.owned,
      current: lo.current,
      totalKills: this.totalKills,
      totalEnemies: this.totalEnemiesSoFar,
      totalSecretsFound: this.totalSecretsFound,
      totalSecrets: this.totalSecretsSoFar,
      totalTime: this.totalPlayTime,
      focusedShotgun: this.weapons.focusedShotgun,
      perks: [...this.perks],
    };
  }

  /** remember the run as it enters `sector`; solo runs past sector 1 are saved */
  private captureCheckpoint(sector = this.levelIndex): void {
    this.checkpoint = this.makeCheckpoint(sector);
    if (!this.preview && !this.net && sector >= 2) storageSet(RUN_KEY, JSON.stringify(this.checkpoint));
  }

  /** the saved run, if there is a valid one to continue */
  private loadSave(): Checkpoint | null {
    if (this.preview) return null;
    const raw = storageGet(RUN_KEY);
    if (!raw) return null;
    try {
      const cp = JSON.parse(raw) as Checkpoint;
      if (cp.v !== 1 || !(cp.sector >= 2 && cp.sector <= 999) || !cp.ammo || !Array.isArray(cp.owned)) return null;
      return cp;
    } catch {
      return null;
    }
  }

  /** put the run back into a checkpoint's state (the level is rebuilt separately) */
  private applyCheckpoint(cp: Checkpoint): void {
    this.baseSeed = cp.seed >>> 0;
    this.levelIndex = cp.sector;
    this.score = cp.score;
    this.comboChain = 0;
    this.comboTimer = 0;
    // perks first: they set the health / ammo caps the rest is clamped to
    this.perks = new Set((cp.perks ?? []).filter(isPerkId));
    this.applyPerkStats();
    // a retry never starts you nearly dead
    this.player.health = Math.max(60, Math.min(this.player.maxHealth, cp.health));
    this.player.armor = cp.armor;
    for (const k of Object.keys(this.player.ammo) as (keyof typeof this.player.ammo)[]) {
      this.player.ammo[k] = Math.min(this.player.ammoMax[k], Math.max(0, cp.ammo[k] ?? 0));
    }
    this.player.buffs.quad = this.player.buffs.shield = this.player.buffs.haste = 0;
    this.weapons.restoreLoadout(cp.owned, cp.current);
    this.weapons.focusedShotgun = cp.focusedShotgun === true;
    this.totalKills = cp.totalKills;
    this.totalEnemiesSoFar = cp.totalEnemies;
    this.totalSecretsFound = cp.totalSecretsFound;
    this.totalSecretsSoFar = cp.totalSecrets;
    this.totalPlayTime = cp.totalTime;
  }

  /** fresh run on a new random layout: sector 1, sidearm only */
  private resetRun(): void {
    this.baseSeed = Math.floor(Math.random() * 0xffffffff) >>> 0;
    this.applyCheckpoint({
      v: 1, seed: this.baseSeed, sector: (this.preview) ? 4 : 1, score: 0, health: 100, armor: 0,
      ammo: { bullets: 48, shells: 0, rockets: 0, cells: 0 },
      owned: ['pistol'], current: 'pistol',
      totalKills: 0, totalEnemies: 0, totalSecretsFound: 0, totalSecrets: 0, totalTime: 0,
    });
    this.player.health = 100;
    this.checkpoint = null;
  }

  /** heartbeat, low-health vignette, tutorial hint, death timer */
  private clearTransientFX(): void {
    this.audio.setHeartbeat(false);
    this.lowHealth = false;
    this.hud.setLowHealth(false);
    this.hud.clearHint();
    this.tipStep = -1;
    this.deathTimer = 0;
  }

  /** back to the title on a fresh layout, without reloading the page */
  private goToTitle(): void {
    this.detachNet();
    this.clearTransientFX();
    if (this.automap.visible) this.automap.setVisible(false);
    this.input.releaseLock();
    this.input.releaseAll();
    this.resetRun();
    this.buildLevel();
    this.state = 'title';
    this.weapons.viewModel.visible = false;
    this.showTitleScreen();
  }

  /**
   * Common entry into a built sector: HUD up, message, then play. After an ad
   * on desktop the click gesture is spent, so the player clicks once more
   * ("READY — click to continue") to re-capture the mouse.
   */
  private enterSector(message: string, adShown: boolean): void {
    this.previewMenuStop?.();
    this.previewMenuStop = null;
    this.hud.hideScreen();
    this.clearTransientFX();
    this.weapons.viewModel.visible = true;
    this.levelStartTime = this.time;
    this.levelStartScore = this.score;
    this.input.releaseAll();
    this.hud.message(message);
    if (adShown && !this.isTouch && !this.net) {
      this.state = 'paused';
      this.hud.showClickToResume(() => this.input.requestLock());
      return;
    }
    this.state = 'playing';
    if (!this.isTouch) this.input.requestLock();
  }

  /** died: replay this sector with the gear you entered it with */
  private retrySector(adShown: boolean): void {
    if (this.checkpoint) this.applyCheckpoint(this.checkpoint);
    else this.resetRun();
    this.buildLevel();
    this.captureCheckpoint();
    this.enterSector((this.preview) ? 'BIOFOUNDRY PREVIEW: second attempt.' : `SECTOR ${this.levelIndex} of ${this.totalSectors} — second attempt. Follow the arrow.`, adShown);
  }

  /**
   * Solo death screen: revive in place (once per sector attempt — a Poki
   * rewarded video, free elsewhere; hidden when an ad blocker removed the
   * SDK), retry from the keycard if one was taken, else the sector; restart
   * the sector; or start a new run.
   */
  private showDeathScreen(): void {
    const revive: 'ad' | 'free' | null = this.revivesUsed >= this.revivesAllowed ? null : POKI ? (poki.adsAvailable() ? 'ad' : null) : 'free';
    this.hud.showDeath({
      stats: `Died in ${this.sectorName()} &nbsp;·&nbsp; Kills here: ${this.kills} / ${this.level.totalEnemies} &nbsp;·&nbsp; Score: ${this.score.toLocaleString()}` +
        (this.endless ? ` &nbsp;·&nbsp; Deepest: depth ${Math.max(this.levelIndex, Number(storageGet(BEST_DEPTH_KEY) ?? 0))}` : ''),
      sector: this.levelIndex,
      unit: this.endless ? 'depth' : 'sector',
      keycard: this.keyCheckpoint !== null,
      revive,
      onRetry: () => {
        if (this.state !== 'dead') return;
        if (this.keyCheckpoint) this.afterBreak((ad) => this.retryFromKeycard(ad));
        else this.afterBreak((ad) => this.retrySector(ad));
      },
      onRestart: () => {
        if (this.state === 'dead') this.afterBreak((ad) => this.retrySector(ad));
      },
      onRevive: () => this.requestRevive(),
      onNewRun: () => {
        if (this.state === 'dead') this.afterBreak((ad) => this.newRunNow(ad));
      },
    });
  }

  /** the revive button: free outside Poki; on Poki only after the video really played */
  private requestRevive(): void {
    if (this.state !== 'dead' || this.revivesUsed >= this.revivesAllowed || this.breakPending) return;
    if (!POKI) {
      this.reviveHere(false);
      return;
    }
    // gameplay is already stopped (state 'dead'); mute while the video plays
    this.breakPending = true;
    this.audio.init();
    void poki
      .rewardedBreak(() => {
        this.audio.setMuted(true);
        this.input.releaseAll();
      })
      .then((success) => {
        // the start callback may not run — always restore audio
        this.audio.setMuted(false);
        this.input.releaseAll();
        this.breakPending = false;
        if (this.state !== 'dead') return;
        // a video that played spent the click gesture: desktop gets READY first
        if (success) this.reviveHere(true);
        else this.hud.reviveUnavailable(); // no video, no reward (Poki rule)
      });
  }

  /** get up where you fell: 60 health, a short spawn shield, nearby enemies shoved back */
  private reviveHere(adShown: boolean): void {
    this.revivesUsed++;
    const p = this.player.pos;
    const left = this.revivesAllowed - this.revivesUsed;
    this.bringBack(p.x, p.y, p.z, this.player.yaw, 60,
      left > 0 ? 'Revived — Second Wind keeps one more for this sector.' : 'Revived — get clear, there are no more in this sector.', adShown);
  }

  /**
   * Retry from the keycard, in place: the world is untouched, you stand where
   * you took the key (still holding it) with gear no worse than you had then.
   */
  private retryFromKeycard(adShown: boolean): void {
    const k = this.keyCheckpoint;
    if (!k) {
      this.retrySector(adShown);
      return;
    }
    const pl = this.player;
    pl.armor = Math.max(pl.armor, k.cp.armor);
    for (const key of Object.keys(pl.ammo) as (keyof typeof pl.ammo)[]) {
      pl.ammo[key] = Math.min(pl.ammoMax[key], Math.max(pl.ammo[key], k.cp.ammo[key] ?? 0));
    }
    pl.keys.add('red');
    // a keycard retry is a fresh attempt at the rest of the sector: revive comes back
    this.revivesUsed = 0;
    this.bringBack(k.x, k.y, k.z, k.yaw, Math.max(60, k.cp.health), 'Back at the keycard. The red door is still waiting.', adShown);
  }

  /** shared by revive and keycard retry: alive again at (x, y, z) without rebuilding the level */
  private bringBack(x: number, y: number, z: number, yaw: number, health: number, message: string, adShown: boolean): void {
    const pl = this.player;
    this.hud.hideScreen();
    this.clearTransientFX();
    pl.dead = false;
    pl.health = Math.min(pl.maxHealth, Math.max(health, 1));
    pl.spawnAt(x, y, z);
    pl.yaw = yaw;
    pl.pitch = 0;
    // 2.5s overshield (the HUD shows the buff chip): nothing lands while you get your bearings
    pl.buffs.shield = Math.max(pl.buffs.shield, 2.5);
    pl.shake = 0;
    this.safePos.set(x, y, z);
    this.embedTime = 0;
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - x;
      const dz = e.pos.z - z;
      if (dx * dx + dz * dz > 7 * 7) continue;
      if (!this.hasLOS(x, y, z, e.pos.x, e.pos.y, e.pos.z)) continue;
      e.repel(x, z, this);
    }
    this.spawnFX(x, y, z);
    this.punchFOV(2);
    this.audio.play('teleport');
    this.weapons.viewModel.visible = true;
    this.hud.updateStats(pl);
    this.hud.updateWeapon(this.weapons);
    this.input.releaseAll();
    this.hud.message(message);
    if (adShown && !this.isTouch) {
      // the ad used up the click gesture: one more click to capture the mouse
      this.state = 'paused';
      this.hud.showClickToResume(() => this.input.requestLock());
      return;
    }
    this.state = 'playing';
    if (!this.isTouch) this.input.requestLock();
  }

  /** abandon the run: new layout, sector 1, no save */
  private newRunNow(adShown: boolean): void {
    if (this.preview) {
      this.resetRun();
      this.buildLevel();
      this.startGame();
      return;
    }
    if (!this.preview) storageSet(RUN_KEY, null);
    this.resetRun();
    this.buildLevel();
    this.captureCheckpoint();
    poki.measure('level', 1, 'fresh-start'); // a new run = someone played (not sent on retry)
    this.enterSector(`SECTOR 1 of ${this.totalSectors} — find the RED keycard.`, adShown);
    this.startTips();
  }

  /** title "Continue": resume the saved run at the sector it was saved on */
  private continueRun(adShown: boolean): void {
    const save = this.loadSave();
    if (!save) {
      this.startGame(adShown);
      return;
    }
    this.audio.init();
    this.applyCheckpoint(save);
    this.buildLevel();
    this.captureCheckpoint();
    this.enterSector(`SECTOR ${this.levelIndex} of ${this.totalSectors} — welcome back. Find the RED keycard.`, adShown);
  }

  private onContextLost(): void {
    this.gfxLost = true;
    if (this.state === 'playing' && !this.net) {
      this.state = 'paused';
      this.input.releaseAll();
      this.input.releaseLock();
    }
    this.hud.setGraphicsLost(true, () => location.reload());
  }

  private onContextRestored(): void {
    this.gfxLost = false;
    this.hud.setGraphicsLost(false, () => {});
    if (this.state === 'paused') this.showPauseScreen();
  }

  /** start the sector-1 level that's already built behind the title screen */
  private startGame(adShown = false): void {
    this.audio.init();
    if (this.isTouch && !POKI) {
      // go immersive: fullscreen + landscape lock where the platform allows it
      // (not on Poki — its page owns fullscreen around the game iframe).
      // Before the preview branch: the Biofoundry start must go fullscreen too.
      void document.documentElement.requestFullscreen?.().catch(() => {});
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      orientation.lock?.('landscape').catch(() => {});
    }
    if (this.preview) {
      this.player.health = 100;
      this.player.armor = 75;
      this.player.ammo.bullets = 160;
      this.player.ammo.shells = 36;
      this.player.ammo.rockets = 8;
      this.player.ammo.cells = 45;
      this.weapons.restoreLoadout(['pistol', 'shotgun', 'smg', 'rocket', 'arc'], 'shotgun');
      this.hud.updateStats(this.player);
      this.hud.updateWeapon(this.weapons);
      this.captureCheckpoint();
      this.enterSector('BIOFOUNDRY PREVIEW — find the red keycard. Campaign saves are untouched.', false);
      return;
    }
    this.captureCheckpoint();
    poki.measure('level', 1, 'fresh-start'); // title "Enter the facility": someone played
    this.enterSector(`SECTOR 1 of ${this.totalSectors} — find the RED keycard. Reach the exit.`, adShown);
    this.startTips();
    // if the browser blocked audio despite the gesture, tell the player how to fix it
    window.setTimeout(() => {
      if (!this.audio.isRunning()) {
        this.hud.message('Audio is blocked by the browser — click or press any key to enable it.');
      }
    }, 900);
    // pointer lock can be refused when the start happened without a fresh
    // click (co-op host / client waiting on the connection) — tell the player
    if (!this.isTouch) {
      window.setTimeout(() => {
        if (this.state === 'playing' && !this.input.locked) {
          this.hud.message('Click the screen to capture the mouse.');
        }
      }, 700);
    }
  }

  /** first run only (and never in co-op): a short sequence of control hints */
  private startTips(): void {
    let done = false;
    try {
      done = localStorage.getItem(TUTORIAL_KEY) !== null;
    } catch { /* storage may be unavailable */ }
    this.tipStep = done || this.net ? -1 : 0;
    this.tipTimer = 0.8;
  }

  /** advances only while actually playing, so pausing holds the sequence */
  private updateTips(dt: number): void {
    if (this.tipStep < 0) return;
    this.tipTimer -= dt;
    if (this.tipTimer > 0) return;
    const k = (t: string): string => `<span class="kc">${t}</span>`;
    const objective = 'FOLLOW THE <b style="color:#ffd028">&#9650;</b> AT THE TOP TO YOUR OBJECTIVE';
    const tips: [string, number][] = this.isTouch
      ? [
          ['LEFT THUMB &mdash; MOVE &nbsp;&middot;&nbsp; RIGHT THUMB &mdash; AIM &nbsp;&middot;&nbsp; ' + k('FIRE'), 7],
          [objective, 6],
          [`${k('MAP')} SHOWS WHERE YOU'VE BEEN &nbsp;&middot;&nbsp; TAP ${k('GUN')} TO SWITCH &middot; HOLD FOR ALL`, 6],
        ]
      : [
          [`${k('W')}${k('A')}${k('S')}${k('D')} MOVE &nbsp;&middot;&nbsp; ${k('MOUSE')} AIM &nbsp;&middot;&nbsp; ${k('CLICK')} FIRE &nbsp;&middot;&nbsp; ${k('SPACE')} JUMP`, 7],
          [objective, 6],
          [`${k('TAB')} MAP &nbsp;&middot;&nbsp; ${k('1')}&ndash;${k('5')} OR ${k('WHEEL')} SWITCH GUNS`, 6],
        ];
    if (this.tipStep >= tips.length) {
      this.tipStep = -1;
      try {
        localStorage.setItem(TUTORIAL_KEY, '1');
      } catch { /* storage may be unavailable */ }
      return;
    }
    const [html, secs] = tips[this.tipStep];
    this.hud.hint(html, secs);
    this.tipStep++;
    this.tipTimer = secs + 1.2;
  }

  /** sectors in this run: the solo campaign ends in the Biofoundry, co-op after the facility */
  private get totalSectors(): number {
    return this.net ? FACILITY_SECTORS : TOTAL_SECTORS;
  }

  /** past the campaign: endless depths (solo) */
  private get endless(): boolean {
    return this.levelIndex > TOTAL_SECTORS;
  }

  /**
   * The look of a sector: facility 1–3, Biofoundry 4–5; endless depths
   * alternate every two (6–7 facility, 8–9 Biofoundry, …), and a boss depth
   * is always the Biofoundry.
   */
  private themeFor(n: number): LevelTheme {
    if (n <= FACILITY_SECTORS) return 'facility';
    if (n <= TOTAL_SECTORS || this.bossFor(n)) return 'biofoundry';
    return ((n - TOTAL_SECTORS - 1) >> 1) % 2 === 0 ? 'facility' : 'biofoundry';
  }

  /** the Broodkeeper waits at the end of the campaign and every fifth depth after */
  private bossFor(n: number): boolean {
    return !this.net && n >= TOTAL_SECTORS && n % 5 === 0;
  }

  /** "sector 3" / "depth 7" */
  private sectorName(n = this.levelIndex): string {
    return n > TOTAL_SECTORS ? `depth ${n}` : `sector ${n}`;
  }

  /** a hand-built level replaces levelgen only in a preview run (`?sector4`) */
  private authoredLevel(): LevelPreview | null {
    return this.preview ?? null;
  }

  /**
   * Sector 3 cleared (solo): the facility terminal types out the way down,
   * then the screen powers off into sector 4. The Biofoundry is built while
   * the terminal is up. The press that leaves the terminal is a fresh
   * gesture, so pointer lock is requested right there — no READY screen even
   * if an ad played before it.
   */
  private descendToBiofoundry(adShown: boolean): void {
    void adShown; // the terminal's own click replaces the READY click
    this.levelIndex = BIOFOUNDRY_SECTOR;
    const term = biofoundryTerminal();
    let built = false;
    const build = (): void => {
      if (built) return;
      built = true;
      this.buildLevel();
      this.captureCheckpoint();
      // the message reports this run's tanks (typing starts after the build)
      const tanks = this.level.bio?.tanks ?? [];
      term.setTanks(tanks.filter((t) => t.occupied).length, tanks.length);
    };
    this.hud.showTerminal({
      title: term.title,
      node: term.node,
      lines: term.lines,
      touch: this.isTouch,
      onChar: () => this.audio.play('termKey'),
      onContinue: () => {
        build();
        if (!this.isTouch) this.input.requestLock();
      },
      onPowerOff: () => this.audio.play('termOff'),
      onDone: () => {
        if (this.state !== 'intermission') return;
        build();
        this.enterSector(`SECTOR ${BIOFOUNDRY_SECTOR} of ${this.totalSectors} — THE BIOFOUNDRY. Find the RED keycard.`, false);
      },
    });
    // meshing the new level stalls a frame: do it once the terminal is painted
    window.setTimeout(build, 60);
  }

  private nextLevel(adShown = false): void {
    this.levelIndex++;
    this.buildLevel();
    this.captureCheckpoint();
    this.net?.sendNextLevel();
    if (this.endless) {
      const where = this.level.boss ? 'something big is waiting in the incubation chamber.'
        : this.level.theme === 'biofoundry' ? 'the Biofoundry goes deeper.' : 'old facility levels, colder and meaner.';
      this.enterSector(`DEPTH ${this.levelIndex} — ${where}`, adShown);
      return;
    }
    const deeper = this.level.boss ? 'the Broodkeeper guards the keycard. Kill it.'
      : this.levelIndex > BIOFOUNDRY_SECTOR ? 'deeper into the Biofoundry. More tanks are full down here.'
      : 'it gets worse down here.';
    this.enterSector(`SECTOR ${this.levelIndex} of ${this.totalSectors} — ${deeper}`, adShown);
  }

  /** push the persisted settings into every system they control */
  private applySettings(): void {
    this.player.sensitivity = this.settings.sensitivity;
    this.player.shakeScale = this.settings.shake ? 1 : 0;
    this.audio.setVolume(this.settings.volume);
    this.music.setVolume(this.settings.musicVolume);
    this.rendererSys.setResolution(this.settings.resolution);
    this.camera.fov = this.settings.fov + this.fovKick;
    this.camera.updateProjectionMatrix();
  }

  private showTitleScreen(): void {
    if (this.preview) {
      this.hud.hideScreen();
      this.previewMenuStop?.();
      this.previewMenuStop = this.preview.showScreen(() => this.startGame(), () => { location.href = location.pathname; });
      return;
    }
    const save = this.loadSave();
    this.hud.showTitle({
      seed: this.baseSeed,
      best: this.bestScoreForSeed(),
      touch: this.isTouch,
      continueSector: save?.sector,
      continueLabel: save ? (save.sector > TOTAL_SECTORS ? `Depth ${save.sector}` : `Sector ${save.sector}`) : undefined,
      bestDepth: Number(storageGet(BEST_DEPTH_KEY) ?? 0) || 0,
      onStart: () => {
        storageSet(RUN_KEY, null); // a new run replaces any saved one
        this.afterBreak((ad) => this.startGame(ad));
      },
      onContinue: () => this.afterBreak((ad) => this.continueRun(ad)),
      // co-op is hidden from players on every build, like Poki; web builds
      // keep it behind ?coop for development (URL auto-join still works)
      onCoop: !POKI && new URLSearchParams(location.search).has('coop') ? () => this.openCoop() : undefined,
      onSettings: () => this.openSettings('title'),
      // returning players only: a first visit sees just the goal and PLAY
      newSector: storageGet(TUTORIAL_KEY) !== null && storageGet(BIOFOUNDRY_SEEN_KEY) === null,
    });
  }

  /** Tab / M / MAP button — automap overlay, only while actually playing */
  toggleMap(): void {
    if (this.state !== 'playing') return;
    this.automap.toggle(this);
  }

  /** pause without pointer lock (touch devices have none) */
  private requestPause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.showPauseScreen();
  }

  private openOverload(): void {
    const o = this.overload;
    if (this.state !== 'playing' || this.net || !o || !o.near(this) || (o.status !== 'idle' && o.status !== 'ready')) return;
    this.state = 'overload';
    this.input.releaseLock();
    this.input.releaseAll();
    Object.assign(this.input.touchState, { moveX: 0, moveY: 0, fire: false, jump: false });
    this.hud.setOverloadAction('');
    const close = (): void => {
      if (this.state !== 'overload' || this.gfxLost) return;
      this.hud.hideScreen();
      this.input.releaseAll();
      this.state = 'playing';
      if (!this.isTouch) this.input.requestLock();
    };
    const ammo = { bullets: '+30 bullets', shells: '+8 shells', rockets: '+2 rockets', cells: '+8 cells' }[this.weapons.definition().ammoType];
    this.hud.showOverload(o.status === 'ready', {
      focus: o.canClaim('focus', this), repair: o.canClaim('repair', this), ammo: o.canClaim('ammo', this),
    }, ammo, () => {
      if (this.state !== 'overload' || this.gfxLost || !o.start()) return;
      this.hud.message('Overload started. Wave 1 incoming.');
      close();
    }, (reward: OverloadReward) => {
      if (this.state === 'overload' && !this.gfxLost && o.claim(reward, this)) close();
    }, close);
  }

  private resumeGame(): void {
    if (this.state !== 'paused' || this.gfxLost) return;
    this.afterBreak((adShown) => {
      if (this.state !== 'paused') return;
      this.input.releaseAll();
      if (this.isTouch) {
        this.state = 'playing';
        this.hud.hideScreen();
      } else if (adShown) {
        this.hud.showClickToResume(() => this.input.requestLock());
      } else {
        this.input.requestLock(); // resume happens via the lock-change event
      }
    });
  }

  private showPauseScreen(): void {
    this.hud.showPause(
      {
        sector: this.levelIndex,
        totalSectors: this.totalSectors,
        kills: this.kills,
        totalEnemies: this.level.totalEnemies,
        secrets: this.secretsFound,
        totalSecrets: this.level.totalSecrets,
        time: this.formatTime(this.time - this.levelStartTime),
        score: this.score,
        seed: this.baseSeed,
      },
      () => this.resumeGame(),
      () => this.goToTitle(),
      () => this.openSettings('pause'),
      this.net ? 'Leave co-op' : this.levelIndex >= 2 ? 'Save &amp; quit to menu' : 'Main menu',
      this.isTouch
    );
  }

  private openSettings(from: 'title' | 'pause'): void {
    this.hud.showSettings({
      seed: this.baseSeed,
      settings: this.settings,
      onApply: (s) => {
        Object.assign(this.settings, s);
        saveSettings(this.settings);
        this.applySettings();
      },
      onNewLayout: () => {
        storageSet(RUN_KEY, null);
        this.goToTitle();
      },
      onBack: () => {
        if (from === 'title') this.showTitleScreen();
        else this.showPauseScreen();
      },
    });
  }

  private onLockChange(locked: boolean): void {
    if (!locked && this.state === 'playing') {
      this.state = 'paused';
      this.showPauseScreen();
    } else if (locked && this.state === 'paused' && !this.breakPending && !this.gfxLost) {
      this.state = 'playing';
      this.hud.hideScreen();
      this.input.releaseAll();
    }
    if (locked) this.audio.init(); // gaining pointer lock is a fine moment to resume audio
  }

  /** dynamic collision boxes: closed/moving doors + elevator platform */
  solidBoxes(): Box[] {
    if (this.solidBoxFrame === this.frameCounter) return this.solidBoxCache;
    this.solidBoxFrame = this.frameCounter;
    this.solidBoxCache.length = 0;
    for (const d of this.doors) {
      if (d.openT < 0.98) this.solidBoxCache.push(d.box());
    }
    if (this.elevator) this.solidBoxCache.push(this.elevator.box());
    if (this.overload && !this.net) this.solidBoxCache.push(this.overload.box);
    // the Broodkeeper's cradle is a wall while it lives
    const bk = this.bossEnemy;
    if (bk && bk.alive) {
      this.solidBoxCache.push({
        minX: bk.pos.x - bk.half.x, maxX: bk.pos.x + bk.half.x,
        minY: bk.pos.y - bk.half.y, maxY: bk.pos.y + bk.half.y,
        minZ: bk.pos.z - bk.half.z, maxZ: bk.pos.z + bk.half.z,
      });
    }
    return this.solidBoxCache;
  }

  /** LOS through voxels AND closed doors */
  hasLOS(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    if (!this.world.hasLOS(ax, ay, az, bx, by, bz)) return false;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < 0.001) return true;
    for (const d of this.doors) {
      if (d.isOpen) continue;
      const b = d.box();
      const t = rayBox(ax, ay, az, dx / dist, dy / dist, dz / dist, dist, b);
      if (t !== null) return false;
    }
    return true;
  }

  /** visual-only explosion (co-op clients; FX echoes of remote explosions) */
  explodeFX(x: number, y: number, z: number, radius = 3.2): void {
    this.particles.explosion(x, y, z);
    this.audio.play('explosion', { x, y, z });
    this.dynLights.flash(x, y, z, 1, 0.6, 0.25, 3, 14, 0.35);
    const pd = Math.sqrt((this.player.pos.x - x) ** 2 + (this.player.pos.y - y) ** 2 + (this.player.pos.z - z) ** 2);
    if (pd < radius + 4) this.punchFOV(3.5 * Math.max(0, 1 - pd / (radius + 4)));
    this.player.shake = Math.min(0.7, this.player.shake + 0.2);
  }

  /** rocket detonation router: clients ask the host to run the real thing */
  detonate(x: number, y: number, z: number, damage: number, radius: number): void {
    if (this.isNetClient) {
      this.explodeFX(x, y, z, radius);
      this.net?.sendBoomReq(x, y, z, damage, radius);
    } else {
      this.explode(x, y, z, damage, radius);
    }
  }

  /** hit an enemy with authority routing (host applies, client requests) */
  applyEnemyHit(e: Enemy, dmg: number, dx: number, dz: number, headshot: boolean): void {
    if (this.isNetClient) {
      e.hitFeedback(dmg, dx, dz, this);
      this.net?.sendHit(this.enemies.list.indexOf(e), dmg, dx, dz, headshot);
    } else {
      e.lastHitHead = headshot;
      e.damage(dmg, dx, dz, this);
    }
  }

  /** damage a voxel with authority routing */
  applyVoxelDamage(x: number, y: number, z: number, dmg: number): void {
    if (this.isNetClient) {
      this.net?.sendVoxelDamage(x, y, z, dmg);
      return;
    }
    // a specimen tank isn't destructible, but shooting it wakes what's inside
    if (this.previewArt?.tankHit && this.world.get(x, y, z) === Block.TankGlass) {
      this.previewArt.tankHit(x, y, z, this);
      return;
    }
    const broke = this.world.damageVoxel(x, y, z, dmg);
    if (broke !== null) this.onVoxelBroken(x, y, z, broke);
  }

  /** loud noise at (x, z): wakes enemies in range, and anything the preview listens with */
  noise(x: number, z: number, radius: number): void {
    this.enemies.alertAt(x, z, radius, this);
    this.previewArt?.noise?.(x, z, radius, this);
  }

  explode(x: number, y: number, z: number, damage: number, radius: number, fxEcho = true): void {
    if (this.isNetClient) {
      // clients never simulate explosions — this is a stray call, show FX only
      this.explodeFX(x, y, z, radius);
      return;
    }
    this.particles.explosion(x, y, z);
    this.audio.play('explosion', { x, y, z });
    this.dynLights.flash(x, y, z, 1, 0.6, 0.25, 3, 14, 0.35);
    if (fxEcho) this.net?.sendBoomFx(x, y, z, radius);

    // destroy destructible voxels in range (barrels hit here chain via the fuse queue)
    const r = Math.ceil(radius * 0.7);
    for (let vy = Math.floor(y) - r; vy <= Math.floor(y) + r; vy++) {
      for (let vz = Math.floor(z) - r; vz <= Math.floor(z) + r; vz++) {
        for (let vx = Math.floor(x) - r; vx <= Math.floor(x) + r; vx++) {
          const b = this.world.get(vx, vy, vz);
          if (!isDestructible(b)) continue;
          const dd = (vx + 0.5 - x) ** 2 + (vy + 0.5 - y) ** 2 + (vz + 0.5 - z) ** 2;
          if (dd > radius * radius * 0.55) continue;
          const broke = this.world.damageVoxel(vx, vy, vz, 200);
          if (broke !== null) this.onVoxelBroken(vx, vy, vz, broke);
        }
      }
    }

    // enemies — splash is blocked by walls and closed doors
    for (const e of this.enemies.list) {
      if (!e.alive) continue;
      const d = Math.sqrt((e.pos.x - x) ** 2 + (e.pos.y - y) ** 2 + (e.pos.z - z) ** 2);
      if (d < radius && this.hasLOS(x, y, z, e.pos.x, e.pos.y, e.pos.z)) {
        const f = 1 - d / radius;
        e.damage(damage * f, (e.pos.x - x) / Math.max(0.3, d), (e.pos.z - z) / Math.max(0.3, d), this);
      }
    }
    // player splash (both players in co-op) — also occluded by geometry
    for (const t of this.playerTargets()) {
      const pd = Math.sqrt((t.pos.x - x) ** 2 + (t.pos.y - y) ** 2 + (t.pos.z - z) ** 2);
      // view punch scales with proximity even when a wall blocks the damage
      if (t === (this.player as PlayerTarget) && pd < radius + 4) {
        this.punchFOV(3.5 * Math.max(0, 1 - pd / (radius + 4)));
      }
      if (pd < radius && !t.dead && this.hasLOS(x, y, z, t.pos.x, t.pos.y, t.pos.z)) {
        const f = 1 - pd / radius;
        t.damage(Math.round(damage * 0.55 * f), this, { x, z });
        // rocket-jump style push (the partner's push is applied on their side)
        if (t === (this.player as PlayerTarget)) {
          t.vel.x += ((t.pos.x - x) / Math.max(0.3, pd)) * 9 * f;
          t.vel.y += 6 * f;
          t.vel.z += ((t.pos.z - z) / Math.max(0.3, pd)) * 9 * f;
        }
      }
    }
    this.player.shake = Math.min(0.7, this.player.shake + 0.3);
    this.enemies.alertAt(x, z, 20, this);
  }

  onVoxelBroken(x: number, y: number, z: number, block: Block): void {
    this.net?.sendVoxelBroken(x, y, z, block); // host → client echo (no-op on client)
    if (block === Block.Crate) {
      this.particles.debris(x + 0.5, y + 0.5, z + 0.5, 0.5, 0.38, 0.2);
      this.audio.play('crateBreak', { x, y, z });
      // crates sometimes drop supplies (host decides in co-op)
      if (!this.isNetClient && Math.random() < 0.35) {
        const drops: PickupKind[] = ['ammoBullets', 'ammoShells', 'healthSmall', 'armorShard'];
        this.spawnPickup(drops[Math.floor(Math.random() * drops.length)], x + 0.5, y + 0.4, z + 0.5);
      }
    } else if (block === Block.Barrel) {
      // short fuse so chains ripple instead of detonating in the same frame
      // (host owns the actual blast in co-op; clients just see the debris)
      this.particles.debris(x + 0.5, y + 0.5, z + 0.5, 0.35, 0.5, 0.2, 8);
      if (!this.isNetClient) this.queueExplosion(x + 0.5, y + 0.5, z + 0.5, 0.14, 70, this.blastRadius(3.2));
    } else {
      this.particles.debris(x + 0.5, y + 0.5, z + 0.5, 0.36, 0.4, 0.47);
      this.audio.play('wallBreak', { x, y, z });
      this.hud.message('The cracked wall gives way!');
    }
  }

  /** fused explosion (barrel chains ripple; dead tickers pop a beat later) */
  queueExplosion(x: number, y: number, z: number, fuse: number, dmg: number, radius: number): void {
    this.pendingExplosions.push({ x, y, z, t: fuse, dmg, radius });
  }

  /** drop a pickup into the live level (brute rewards, crate drops) */
  spawnPickup(kind: PickupKind, x: number, y: number, z: number): void {
    this.pickups.add({ kind, x, y, z }, this.world);
    this.dynLights.flash(x, y + 0.4, z, 1, 0.9, 0.4, 1.4, 6, 0.3);
    this.net?.sendPickupSpawn(this.pickups.items.length - 1, kind, x, y, z);
  }

  onEnemyKilled(e: Enemy): void {
    if (this.isNetClient) {
      // visuals only — kills/score/combo are the host's ledger
      this.punchFOV(0.8);
      return;
    }
    this.kills++;
    this.hud.killMarker(e.lastHitHead);
    this.punchFOV(0.8);
    // score: kill value scaled by the combo chain (kills within 2.5s of each other)
    let points = e.kind === 'broodkeeper' ? 2500 : e.kind === 'brute' ? 300 : e.kind === 'sentinel' ? 150 : e.kind === 'ticker' ? 75 : 100;
    if (e.lastHitHead) points += 50; // headshot kill bonus
    this.comboChain = this.comboTimer > 0 ? this.comboChain + 1 : 1;
    this.comboTimer = 2.5;
    const mult = Math.min(5, this.comboChain);
    this.score += points * mult;
    if (this.comboChain === 2) this.hud.streak('DOUBLE KILL');
    else if (this.comboChain === 3) this.hud.streak('TRIPLE KILL');
    else if (this.comboChain === 4) this.hud.streak('RAMPAGE');
    else if (this.comboChain >= 6 && this.comboChain % 2 === 0) this.hud.streak('MASSACRE');
    this.hud.updateScore(this.score, mult);
    // perks that pay out on a kill
    const pl = this.player;
    if (this.perks.has('headhunter') && e.lastHitHead && pl.heal(8)) this.hud.updateStats(pl);
    if (this.perks.has('momentum') && this.comboChain >= 3) pl.buffs.haste = Math.max(pl.buffs.haste, 3);
    if (this.perks.has('scavenger') && Math.random() < 1 / 3) {
      const ammo = this.weapons.definition().ammoType;
      const kind: PickupKind = ammo === 'shells' ? 'ammoShells' : ammo === 'cells' ? 'ammoCells' : ammo === 'rockets' ? 'ammoRockets' : 'ammoBullets';
      this.spawnPickup(kind, e.pos.x, e.pos.y - e.half.y + 0.4, e.pos.z);
    }
  }

  /** the Broodkeeper fell: its acid goes, the red keycard drops where it stood guard */
  onBossDefeated(e: Enemy): void {
    this.projectiles.clearAcid();
    const k = this.bossKey;
    if (k) {
      this.spawnPickup('keyRed', k.x, k.y, k.z);
      this.bossKey = null;
    }
    this.hud.setBoss(null);
    this.hud.message('The BROODKEEPER is dead — take the RED keycard.');
    this.hud.streak('BOSS DOWN');
    this.punchFOV(3);
    void e;
  }

  /** boss HP bar: shown while a boss fight is on */
  private updateBossBar(): void {
    const b = this.bossEnemy;
    if (b && b.bossActive && this.state === 'playing') this.hud.setBoss('BROODKEEPER', b.bossFrac, b.coreOpen);
    else this.hud.setBoss(null);
  }

  /** grabbing the red keycard springs a security response around the player */
  onKeyPickup(): void {
    if (this.isNetClient) return; // the host owns the ambush
    // solo: the keycard is a checkpoint (co-op has no death screen to use it)
    if (!this.net) {
      const p = this.player.pos;
      this.keyCheckpoint = { cp: this.makeCheckpoint(this.levelIndex), x: p.x, y: p.y, z: p.z, yaw: this.player.yaw };
      this.hud.message('Checkpoint — you will retry from the keycard.');
    }
    // a boss sector's key came off the boss: that fight was the response
    if (this.level.boss) return;
    const keyRoom = this.level.rooms.find((r) => r.kind === 'key');
    if (!keyRoom) return;
    const specs: EnemySpec[] = [];
    const want = Math.min(5, 2 + this.levelIndex);
    for (let tries = 0; tries < 80 && specs.length < want; tries++) {
      const x = keyRoom.x + 1 + Math.floor(Math.random() * (keyRoom.w - 2));
      const z = keyRoom.z + 1 + Math.floor(Math.random() * (keyRoom.d - 2));
      if (this.world.get(x, 1, z) !== Block.Air || this.world.get(x, 2, z) !== Block.Air) continue;
      const dx = x + 0.5 - this.player.pos.x;
      const dz = z + 0.5 - this.player.pos.z;
      if (dx * dx + dz * dz < 3.5 * 3.5) continue; // never inside the player's face
      const kind: EnemySpec['kind'] =
        specs.length === 0 ? 'husk'
        : Math.random() < 0.45 ? 'ticker'
        : this.levelIndex >= 2 && Math.random() < 0.4 ? 'sentinel'
        : 'husk';
      specs.push({ kind, x: x + 0.5, z: z + 0.5, roomId: keyRoom.id });
    }
    if (!specs.length) return;
    const before = this.enemies.list.length;
    this.enemies.spawnFromSpecs(specs, this.level.rooms, this);
    for (let i = before; i < this.enemies.list.length; i++) {
      const e = this.enemies.list[i];
      e.wake(this);
      // teleport-in flash so the spawn reads as an event, not a pop-in
      this.dynLights.flash(e.pos.x, e.pos.y + 0.3, e.pos.z, 1, 0.25, 0.15, 1.6, 7, 0.4);
      this.particles.smoke(e.pos.x, e.pos.y, e.pos.z, 6);
    }
    this.level.totalEnemies += specs.length;
    this.net?.sendEnemySpawn(specs);
    this.audio.play('alarm');
    this.hud.message('WARNING — security response inbound!');
    this.punchFOV(1.5);
  }

  /** brief FOV widening on heavy impacts — decays each frame */
  /** which step of key → red door → lift → exit pad the player is on */
  private objectiveStage(): ObjectiveStage {
    if (this.bossEnemy?.alive && !this.player.hasKey('red')) return 'boss';
    const exitDoor = this.doors.find((d) => d.spec.locked === 'red');
    if (exitDoor && exitDoor.locked) return this.player.hasKey('red') ? 'door' : 'key';
    // up on the exit ledge (the lift's top floor) → last step
    const ledgeY = this.level.elevator ? this.level.elevator.highY - 0.4 : 3.6;
    return this.player.pos.y - this.player.half.y > ledgeY ? 'pad' : 'lift';
  }

  private objectiveTarget(stage: ObjectiveStage): { x: number; z: number } | null {
    switch (stage) {
      case 'boss': {
        const b = this.bossEnemy;
        return b ? { x: b.pos.x, z: b.pos.z } : null;
      }
      case 'key': {
        const k = this.level.pickups.find((p) => p.kind === 'keyRed');
        return k ? { x: k.x, z: k.z } : null;
      }
      case 'door': {
        const d = this.doors.find((q) => q.spec.locked === 'red');
        return d ? { x: d.centerX(), z: d.centerZ() } : null;
      }
      case 'lift': {
        const e = this.level.elevator;
        return e ? { x: e.x + 1, z: e.z + 1 } : null;
      }
      case 'pad':
        return this.level.exitPad;
    }
  }

  /** HUD objective tracker: step label (flashes on change) + arrow/distance */
  private updateObjective(): void {
    const stage = this.objectiveStage();
    if (stage !== this.objStage) {
      const changed = this.objStage !== null;
      this.objStage = stage;
      const o = OBJECTIVES[stage];
      this.hud.setObjective(this.levelIndex, this.totalSectors, o.text, o.color, changed, o.icon);
    }
    const t = this.objectiveTarget(stage);
    if (!t) {
      this.hud.updateCompass(null, 0);
    } else {
      // target in view space: forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
      const dx = t.x - this.player.pos.x;
      const dz = t.z - this.player.pos.z;
      const yaw = this.player.yaw;
      const fwd = dx * -Math.sin(yaw) + dz * -Math.cos(yaw);
      const right = dx * Math.cos(yaw) + dz * -Math.sin(yaw);
      this.hud.updateCompass((Math.atan2(right, fwd) * 180) / Math.PI, Math.hypot(dx, dz));
    }
    this.hud.setKills(this.kills, this.level.totalEnemies);
  }

  /**
   * Last-resort unstick: if the player's body or eyes sit inside solid voxels,
   * or above the world, for more than a few frames, put them back on the last
   * open ground they stood on (or the spawn). Whatever physics edge case got
   * them there, a stuck or out-of-map player is a dead run.
   */
  private guardPlayerInWorld(dt: number): void {
    const p = this.player.pos;
    const w = this.world;
    const bx = Math.floor(p.x);
    const bz = Math.floor(p.z);
    const stuck =
      p.y >= w.sy ||
      w.isSolid(bx, Math.floor(p.y), bz) ||
      w.isSolid(bx, Math.floor(this.player.eyeY()), bz);
    if (!stuck) {
      this.embedTime = 0;
      if (this.player.onGround) this.safePos.copy(p);
      return;
    }
    this.embedTime += dt;
    if (this.embedTime <= 0.12) return;
    this.embedTime = 0;
    const back = this.safePos.lengthSq() === 0 ? this.level.spawn : this.safePos;
    this.player.spawnAt(back.x, back.y, back.z);
  }

  punchFOV(amount: number): void {
    this.fovKick = Math.min(9, this.fovKick + amount);
  }

  onPlayerDeath(): void {
    if (!this.net) {
      // Poki events are deliberately few: level 1 fresh-start, level N complete / fail (POKI.md)
      if (this.endless) poki.measure('endless', Math.min(20, this.levelIndex), 'fail');
      else poki.measure('level', this.levelIndex, 'fail');
    }
    this.state = 'dead';
    this.deathTimer = 0;
    this.hud.clearHint();
  }

  private formatTime(t: number): string {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  private seedHex(): string {
    return (this.baseSeed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  }

  /** best campaign score recorded for this layout seed on this device */
  private bestScoreForSeed(): number {
    try {
      return Number(localStorage.getItem(`voxelstrike-best-${this.seedHex()}`)) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * S–C for the sector just cleared: kills (full marks at 85% of the
   * roster) 50 pts, secrets 20, time 30 — full at or under par
   * (45 s + 16 s a room), nothing at 2.5× par. S ≥ 88, A ≥ 72, B ≥ 50.
   */
  private rankSector(levelTime: number): { rank: Rank; points: number; par: number } {
    const par = 45 + 16 * this.level.rooms.length;
    const killK = this.level.totalEnemies > 0 ? Math.min(1, this.kills / (this.level.totalEnemies * 0.85)) : 1;
    const secretK = this.level.totalSecrets > 0 ? this.secretsFound / this.level.totalSecrets : 1;
    const timeK = levelTime <= par ? 1 : Math.max(0, 1 - (levelTime - par) / (par * 1.5));
    const points = Math.round(50 * killK + 20 * secretK + 30 * timeK);
    const rank: Rank = points >= 88 ? 'S' : points >= 72 ? 'A' : points >= 50 ? 'B' : 'C';
    return { rank, points, par };
  }

  /** solo sector clear: the tally screen, then a perk (or, after the last sector, the results) */
  private showSectorClear(
    levelTime: number,
    graded: { rank: Rank; points: number; par: number },
    pts: { scoreFrom: number; killPoints: number; secretPoints: number; speedBonus: number; rankBonus: number },
  ): void {
    // best rank per sector number (layouts differ, ranks compare fairly)
    const bestKey = `voxelstrike-best-rank-${this.levelIndex}`;
    const prevBest = storageGet(bestKey) as Rank | null;
    const newBest = !prevBest || RANK_ORDER.indexOf(graded.rank) < RANK_ORDER.indexOf(prevBest);
    if (newBest && !this.preview) storageSet(bestKey, graded.rank);
    const rows = [
      { label: 'Kills', value: `${this.kills} / ${this.level.totalEnemies}`, points: pts.killPoints },
      { label: 'Secrets', value: `${this.secretsFound} / ${this.level.totalSecrets}`, points: pts.secretPoints },
      { label: 'Time', value: `${this.formatTime(levelTime)} <i>par ${this.formatTime(graded.par)}</i>`, points: pts.speedBonus },
      { label: 'Sector clear', value: '', points: 1000 },
      { label: `Rank ${graded.rank} bonus`, value: '', points: pts.rankBonus },
    ];
    const common = {
      sector: this.levelIndex,
      rows,
      scoreFrom: pts.scoreFrom,
      scoreTo: this.score,
      rank: graded.rank,
      newBest,
      prevBest,
      touch: this.isTouch,
      onTick: () => this.audio.play('termKey'),
      onStamp: () => this.audio.play('rankStamp'),
    };
    if (this.levelIndex !== this.totalSectors) {
      this.state = 'intermission';
      // the save points at the NEXT sector: quitting now resumes there
      this.captureCheckpoint(this.levelIndex + 1);
      const offer = rollPerkOffer(this.perks, this.baseSeed, this.levelIndex);
      this.hud.showSectorClear({
        ...common,
        nextSector: this.levelIndex + 1,
        saved: true,
        perks: offer.map((id) => offerDef(id)),
        onPick: (id) => this.pickPerk(id),
        onContinue: () => this.descendFromClear(),
      });
      return;
    }
    // the last sector: the same tally, then the campaign results
    this.state = 'won';
    storageSet(RUN_KEY, null); // campaign done: nothing left to continue
    const best = this.bestScoreForSeed();
    const isRecord = this.score > best;
    if (isRecord) {
      try {
        localStorage.setItem(`voxelstrike-best-${this.seedHex()}`, String(this.score));
      } catch { /* storage may be unavailable */ }
    }
    const totals =
      `Total kills: ${this.totalKills} / ${this.totalEnemiesSoFar} &nbsp;·&nbsp; ` +
      `Secrets: ${this.totalSecretsFound} / ${this.totalSecretsSoFar} &nbsp;·&nbsp; ` +
      `Total time: ${this.formatTime(this.totalPlayTime)}`;
    const record = isRecord
      ? `<b class="sc-record">FINAL SCORE ${this.score.toLocaleString()} — NEW LAYOUT RECORD!</b>`
      : `Final score: ${this.score.toLocaleString()}` + (best > 0 ? ` &nbsp;·&nbsp; Layout best: ${best.toLocaleString()}` : '');
    this.hud.showSectorClear({
      ...common,
      nextSector: null,
      saved: false,
      perks: null,
      final: { totals, record },
      onAgain: () => {
        if (this.state === 'won') this.afterBreak((ad) => this.newRunNow(ad));
      },
      onMenu: () => this.goToTitle(),
      // the campaign is done; the descent isn't
      onDescend: () => {
        if (this.state === 'won') this.afterBreak((ad) => this.nextLevel(ad));
      },
    });
  }

  /** a perk card was picked on the sector-clear screen: keep it (or take the reward), then descend */
  private pickPerk(id: OfferId): void {
    if (this.state !== 'intermission') return;
    const pl = this.player;
    if (isReward(id)) {
      if (id === 'patchUp') pl.health = pl.maxHealth;
      else if (id === 'reinforce') pl.armor = Math.min(pl.maxArmor, pl.armor + 75);
      else for (const t of Object.keys(pl.ammo) as (keyof typeof pl.ammo)[]) {
        pl.ammo[t] = Math.min(pl.ammoMax[t], pl.ammo[t] + Math.round(pl.ammoMax[t] * 0.5));
      }
      this.hud.updateStats(pl);
      this.hud.updateWeapon(this.weapons);
      this.captureCheckpoint(this.levelIndex + 1);
      this.descendFromClear();
      return;
    }
    if (this.perks.has(id)) return;
    this.perks.add(id);
    this.applyPerkStats();
    if (id === 'vitality') this.player.heal(25);
    this.hud.updateStats(this.player);
    this.hud.updateWeapon(this.weapons);
    // the save at the next sector now carries the new perk
    this.captureCheckpoint(this.levelIndex + 1);
    this.descendFromClear();
  }

  /** leave the sector-clear screen for the next sector (the terminal after sector 3) */
  private descendFromClear(): void {
    if (this.state !== 'intermission') return;
    if (this.levelIndex === FACILITY_SECTORS) this.afterBreak((ad) => this.descendToBiofoundry(ad));
    else this.afterBreak((ad) => this.nextLevel(ad));
  }

  private win(): void {
    if (this.state !== 'playing') return;
    if (this.preview) {
      this.state = 'won';
      this.input.releaseLock();
      this.clearTransientFX();
      this.audio.play('win');
      this.previewMenuStop = this.preview.showScreen(() => {
        this.resetRun();
        this.buildLevel();
        this.startGame();
      }, () => { location.href = location.pathname; }, true);
      return;
    }
    const levelTime = this.time - this.levelStartTime;
    this.totalPlayTime += levelTime;
    this.totalKills += this.kills;
    this.totalEnemiesSoFar += this.level.totalEnemies;
    this.totalSecretsFound += this.secretsFound;
    this.totalSecretsSoFar += this.level.totalSecrets;
    // what this sector earned before the bonuses: kills (with combos) + the secret
    const secretPoints = this.secretsFound * 500;
    const killPoints = Math.max(0, this.score - this.levelStartScore - secretPoints);
    const scoreFrom = this.levelStartScore;
    // sector clear bonus, a bonus for speed, and (solo) the rank bonus
    const speedBonus = Math.max(0, 900 - Math.floor(levelTime) * 3);
    const graded = this.rankSector(levelTime);
    const rankBonus = this.net ? 0 : RANK_BONUS[graded.rank];
    this.score += 1000 + speedBonus + rankBonus;
    this.hud.updateScore(this.score, 1);
    this.audio.play('win');
    this.clearTransientFX();
    // the only other Poki events (POKI.md); endless depths have their own bucket
    if (this.endless) poki.measure('endless', Math.min(20, this.levelIndex), 'complete');
    else poki.measure('level', this.levelIndex, 'complete');
    this.input.releaseLock();

    // solo: the sector-clear moment — tally, rank stamp, new best, then a perk
    if (!this.net) {
      this.showSectorClear(levelTime, graded, { scoreFrom, killPoints, secretPoints, speedBonus, rankBonus });
      return;
    }

    const levelStats =
      `Kills: ${this.kills} / ${this.level.totalEnemies} &nbsp;·&nbsp; ` +
      `Secrets: ${this.secretsFound} / ${this.level.totalSecrets} &nbsp;·&nbsp; ` +
      `Time: ${this.formatTime(levelTime)} &nbsp;·&nbsp; ` +
      `Score: ${this.score.toLocaleString()}`;

    if (this.levelIndex < this.totalSectors) {
      this.state = 'intermission';
      // the save points at the NEXT sector: quitting now resumes there
      this.captureCheckpoint(this.levelIndex + 1);
      this.net?.sendWin(false, `SECTOR ${this.levelIndex} CLEARED`, levelStats);
      this.hud.showIntermission(this.levelIndex, levelStats, !this.net, () => {
        if (this.state !== 'intermission') return;
        if (this.levelIndex === FACILITY_SECTORS) this.afterBreak((ad) => this.descendToBiofoundry(ad));
        else this.afterBreak((ad) => this.nextLevel(ad));
      });
    } else {
      this.state = 'won';
      storageSet(RUN_KEY, null); // campaign done: nothing left to continue
      // per-layout best score: same seed = same dungeon, so scores compare fairly
      const best = this.bestScoreForSeed();
      const isRecord = this.score > best;
      if (isRecord) {
        try {
          localStorage.setItem(`voxelstrike-best-${this.seedHex()}`, String(this.score));
        } catch { /* storage may be unavailable */ }
      }
      const scoreLine = isRecord
        ? `Final score: <b style="color:#ffd028">${this.score.toLocaleString()} — NEW LAYOUT RECORD!</b>`
        : `Final score: ${this.score.toLocaleString()}` +
          (best > 0 ? ` &nbsp;·&nbsp; Layout best: ${best.toLocaleString()}` : '');
      const totals =
        `Total kills: ${this.totalKills} / ${this.totalEnemiesSoFar} &nbsp;·&nbsp; ` +
        `Secrets: ${this.totalSecretsFound} / ${this.totalSecretsSoFar} &nbsp;·&nbsp; ` +
        `Total time: ${this.formatTime(this.totalPlayTime)}<br><br>${scoreLine}`;
      this.net?.sendWin(true, 'CAMPAIGN COMPLETE', totals);
      this.hud.showWin(
        totals,
        () => {
          if (this.state !== 'won') return;
          if (this.net) this.goToTitle();
          else this.afterBreak((ad) => this.newRunNow(ad));
        },
        () => this.goToTitle()
      );
    }
  }

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.frameCounter++;
    poki.setPlaying(this.state === 'playing');
    // the map is an in-play overlay: never leave it open behind a menu,
    // death screen or intermission (on touch it would also eat their taps)
    if (this.automap.visible && this.state !== 'playing') this.automap.setVisible(false);
    if (this.state === 'playing') this.updateTips(dt);
    if (this.state === 'playing' && this.perks.has('plating')) this.selfRepair(dt);

    // fps meter
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.hud.setFPS(this.fpsFrames / this.fpsAccum);
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    // soundtrack: menu on the title, combat while something hunts you
    this.music.update();
    if (this.state === 'title') {
      this.music.setMode('menu');
    } else {
      let contact = false;
      if (this.state === 'playing' || this.state === 'paused') {
        for (const e of this.enemies.list) {
          if (!e.alive || !e.awake) continue;
          const dx = e.pos.x - this.player.pos.x;
          const dz = e.pos.z - this.player.pos.z;
          if (dx * dx + dz * dz < 26 * 26) {
            contact = true;
            break;
          }
        }
      }
      if (contact) this.combatLinger = 5;
      else this.combatLinger = Math.max(0, this.combatLinger - dt);
      this.music.setMode(this.combatLinger > 0 ? 'combat' : 'ambient');
    }

    if (this.state === 'title') {
      // slow orbit of the spawn room behind the title
      this.player.yaw += dt * 0.1;
      this.player.applyToCamera(this.camera, this.time);
      this.updateOperativeBody(dt);
      this.dynLights.update(dt, this.camera.position);
      this.cullHidden(dt);
      this.rendererSys.render();
      this.dynLights.clearFrame();
      return;
    }

    // the automap only lives inside active play
    if (this.state !== 'playing' && this.automap.visible) this.automap.setVisible(false);

    // co-op never pauses the world — the pause menu just overlays it
    const playing = this.state === 'playing' || this.state === 'dead' ||
      (this.net !== null && this.state === 'paused');
    if (playing) {
      this.update(dt);
    }

    this.player.applyToCamera(this.camera, this.time);
    this.updateOperativeBody(dt);
    this.audio.listener.x = this.player.pos.x;
    this.audio.listener.y = this.player.eyeY();
    this.audio.listener.z = this.player.pos.z;
    this.audio.listener.yaw = this.player.yaw;

    // FOV punch decay (on top of the configured base FOV)
    const baseFov = this.settings.fov;
    if (this.fovKick > 0.01) {
      this.fovKick *= Math.exp(-8 * dt);
      this.camera.fov = baseFov + this.fovKick;
      this.camera.updateProjectionMatrix();
    } else if (this.camera.fov !== baseFov) {
      this.fovKick = 0;
      this.camera.fov = baseFov;
      this.camera.updateProjectionMatrix();
    }

    this.dynLights.update(dt, this.camera.position);
    this.chunks?.update();
    this.cullHidden(dt);
    this.rendererSys.render();
    this.dynLights.clearFrame();
  }

  /**
   * Skip drawing enemy rigs and pickups the eye can't see (core/occlusion.ts).
   * Each is many draw calls and three.js only frustum-culls: this is what
   * keeps phones at 60 fps in rooms surrounded by populated ones.
   */
  private cullHidden(dt: number): void {
    if (!this.world) return;
    const c = this.camera.position;
    const far = this.rendererSys.fogFar;
    for (const e of this.enemies.list) e.cullFrom(this.world, c.x, c.y, c.z, dt, far);
    this.pickups?.cull(this.world, c.x, c.y, c.z, dt, far);
  }

  private update(dt: number): void {
    const boxes = this.solidBoxes();
    this.net?.update(dt);

    // barrel chain-reaction fuses
    for (let i = this.pendingExplosions.length - 1; i >= 0; i--) {
      const p = this.pendingExplosions[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pendingExplosions.splice(i, 1);
        this.explode(p.x, p.y, p.z, p.dmg, p.radius);
      }
    }

    // doors + elevator run on the authority only (clients get snapshots)
    if (!this.isNetClient) {
      // doors: players + alive enemies can trigger them
      // (pooled entries: rebuilt in place every frame, no allocation)
      const actors = this.doorActors;
      let n = 0;
      n = this.setDoorActor(n, this.player.pos.x, this.player.pos.z, true);
      if (this.net?.connected) {
        // keys are shared in co-op, so the partner opens locked doors too
        n = this.setDoorActor(n, this.net.remote.pos.x, this.net.remote.pos.z, true);
      }
      for (const e of this.enemies.list) {
        if (e.alive && e.awake) n = this.setDoorActor(n, e.pos.x, e.pos.z, false);
      }
      actors.length = n;
      for (const d of this.doors) {
        d.update(
          dt, actors,
          (c: KeyColor) => this.player.hasKey(c),
          (c: KeyColor) => {
            this.hud.message(`Used the ${c.toUpperCase()} keycard.`);
            this.audio.play('doorOpen', { x: d.centerX(), y: 2, z: d.centerZ() });
          },
          (c: KeyColor) => {
            this.hud.message(`You need the ${c.toUpperCase()} keycard!`);
            this.audio.play('doorLocked');
          },
          this.audio
        );
      }
      if (this.elevator) {
        const el = this.elevator;
        const p = this.player;
        let onTop = el.isOnTop(p.pos.x, p.pos.y, p.pos.z, p.half.y);
        let callDown = el.isWaitingBelow(p.pos.x, p.pos.y, p.pos.z, p.half.y);
        if (this.net?.connected) {
          const r = this.net.remote;
          onTop = onTop || el.isOnTop(r.pos.x, r.pos.y, r.pos.z, r.half.y);
          callDown = callDown || el.isWaitingBelow(r.pos.x, r.pos.y, r.pos.z, r.half.y);
        }
        el.update(dt, onTop, this.audio, callDown);
      }
    }

    this.player.update(dt, this.input, this, boxes);
    // a moving lift keeps its rider on the deck (runs for clients too — their
    // lift moves through snapshots, their movement is local)
    this.elevator?.holdRider(this.player.pos, this.player.half);
    // safety net: never let the player leave the world
    if (this.player.pos.y < -8) {
      this.player.spawnAt(this.level.spawn.x, this.level.spawn.y, this.level.spawn.z);
    }
    this.guardPlayerInWorld(dt);
    this.weapons.update(dt, this.input, this);
    this.enemies.update(dt, this);
    if (!this.net && this.overload) {
      if (this.state === 'playing') this.overload.update(dt, this);
      else this.hud.setOverloadAction('');
    }
    if (!this.isNetClient) this.previewArt?.update?.(dt, this);
    this.projectiles.update(dt, this);
    this.particles.update(dt, this.world);
    this.tracers.update(dt);
    this.pickups.update(dt, this.time, this);
    this.elevator?.animate(dt, this.time);
    this.updateObjective();
    this.updateBossBar();
    this.exitBeacon?.animate(dt, this.objStage === 'pad');
    this.hud.updateAmmo(this.player, this.weapons);
    this.hud.updateBuffs(this.player);
    this.automap.update(dt, this);

    // combo window closes: chain resets, HUD drops the multiplier
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboChain = 0;
        this.hud.updateScore(this.score, 1);
      }
    }

    // low-health state: pulsing vignette + heartbeat
    const low = !this.player.dead && this.player.health <= 30;
    if (low !== this.lowHealth) {
      this.lowHealth = low;
      this.hud.setLowHealth(low);
      this.audio.setHeartbeat(low);
    }

    // distant facility noises keep the place alive
    this.ambientTimer -= dt;
    if (this.ambientTimer <= 0) {
      this.ambientTimer = 9 + Math.random() * 14;
      const a = Math.random() * Math.PI * 2;
      const r = 13 + Math.random() * 14;
      this.audio.play('clank', {
        x: this.player.pos.x + Math.cos(a) * r,
        y: 2,
        z: this.player.pos.z + Math.sin(a) * r,
      });
    }

    // secret discovery
    if (!this.secretAnnounced && this.level.secretRect) {
      const s = this.level.secretRect;
      const p = this.player.pos;
      if (p.x > s.x && p.x < s.x + s.w && p.z > s.z && p.z < s.z + s.d) {
        this.secretAnnounced = true;
        this.secretsFound = 1;
        this.audio.play('secret');
        this.hud.message('You found a secret area! +500');
        this.score += 500;
        this.hud.updateScore(this.score, Math.min(5, this.comboChain) || 1);
      }
    }

    // exit pad check: standing on an ExitPad block (either player in co-op;
    // the host is the judge)
    if (this.state === 'playing' && !this.isNetClient) {
      const under = this.world.get(
        Math.floor(this.player.pos.x),
        Math.floor(this.player.pos.y - this.player.half.y - 0.1),
        Math.floor(this.player.pos.z)
      );
      if (under === Block.ExitPad && this.player.onGround) this.win();
      else if (this.net?.connected) {
        const r = this.net.remote;
        const rUnder = this.world.get(
          Math.floor(r.pos.x), Math.floor(r.pos.y - r.half.y - 0.1), Math.floor(r.pos.z)
        );
        if (rUnder === Block.ExitPad && !r.dead) this.win();
      }
    }

    if (this.state === 'dead') {
      this.deathTimer += dt;
      if (this.net) {
        // co-op: no game over — respawn at the entrance after a beat
        if (this.deathTimer > 2.5) {
          this.player.health = 100;
          this.player.dead = false;
          this.player.spawnAt(this.level.spawn.x, this.level.spawn.y, this.level.spawn.z);
          this.state = 'playing';
          this.spawnFX(this.player.pos.x, this.player.pos.y, this.player.pos.z);
          this.punchFOV(2);
          this.hud.updateStats(this.player);
          this.hud.message('Back on your feet — your partner bought you time.');
        }
      } else if (this.deathTimer > 1.4 && this.deathTimer - dt <= 1.4) {
        // solo: death screen after a beat
        this.input.releaseLock();
        this.showDeathScreen();
      }
    }
  }
}
