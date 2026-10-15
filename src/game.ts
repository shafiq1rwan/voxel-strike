import * as THREE from 'three';
import { Renderer } from './core/renderer';
import { Input } from './core/input';
import { AudioMan } from './core/audio';
import { Music } from './core/music';
import { TouchControls, isTouchDevice } from './core/touch';
import { Box, rayBox } from './core/physics';
import { VoxelWorld } from './world/world';
import { ChunkManager } from './world/mesher';
import { generateLevel, LevelData } from './world/levelgen';
import { Block, isDestructible } from './world/blocks';
import { Player } from './entities/player';
import { Door, Elevator, ExitBeacon } from './entities/door';
import { Enemy, EnemyManager } from './entities/enemies';
import { PickupManager } from './entities/pickups';
import { ProjectilePool } from './entities/projectiles';
import { Particles } from './fx/particles';
import { Tracers } from './fx/tracers';
import { DynLights } from './fx/dynlights';
import { WeaponSystem } from './weapons/weapons';
import { HUD } from './ui/hud';
import { Automap } from './ui/automap';
import { Netplay } from './net/netplay';
import { GameSettings, loadSettings, saveSettings } from './core/settings';
import { EnemySpec, KeyColor, PickupKind } from './types';
import { POKI, poki } from './platform/poki';

type GameState = 'title' | 'playing' | 'paused' | 'dead' | 'intermission' | 'won';

/** Injected by main.ts for `?sector4` (web builds only; lazy-loaded, never on Poki). */
export interface LevelPreview {
  generate(seed: number): LevelData;
  decorate(level: LevelData): { group: THREE.Group; dispose(): void };
  showScreen(onStart: () => void, onLeave: () => void, cleared?: boolean): () => void;
}

const TOTAL_SECTORS = 3;

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
type ObjectiveStage = 'key' | 'door' | 'lift' | 'pad';
const OBJECTIVES: Record<ObjectiveStage, { text: string; color: string; icon: 'keycard' | 'door' | 'lift' | 'pad' }> = {
  key: { text: 'Find red keycard', color: '#ff3428', icon: 'keycard' },
  door: { text: 'Open the red door', color: '#ff3428', icon: 'door' },
  lift: { text: 'Ride the lift up', color: '#ffd028', icon: 'lift' },
  pad: { text: 'Step on the exit pad', color: '#4cc26a', icon: 'pad' },
};

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
}

/** localStorage key of the saved run (same key as the earlier Poki build) */
const RUN_KEY = 'voxelstrike-run';

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
  readonly settings: GameSettings = loadSettings();
  readonly isTouch = isTouchDevice();
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

  private previewArt: ReturnType<LevelPreview['decorate']> | null = null;
  private previewMenuStop: (() => void) | null = null;

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

    this.automap = new Automap(this.hud.container);
    this.input.onToggleMap = () => this.toggleMap();
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
  playerTargets(): PlayerTarget[] {
    return this.net && this.net.connected
      ? [this.player, this.net.remote]
      : [this.player];
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
    this.level = (this.preview) ? this.preview.generate(seed) : generateLevel(seed, this.levelIndex);
    this.world = this.level.world;
    const scene = this.rendererSys.scene;

    this.chunks = new ChunkManager(
      this.world, this.dynLights,
      this.rendererSys.fogColor, this.rendererSys.fogNear, this.rendererSys.fogFar
    );
    this.chunks.buildAll();
    scene.add(this.chunks.group);
    if (this.preview) {
      this.previewArt = this.preview.decorate(this.level);
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

    this.pickups = new PickupManager(this.level.pickups, this.world);
    scene.add(this.pickups.group);
    this.automap.reset(this);

    this.enemies.spawnFromSpecs(this.level.enemies, this.level.rooms, this);
    scene.add(this.enemies.group);

    // per-level state
    this.kills = 0;
    this.secretsFound = 0;
    this.secretAnnounced = false;
    this.player.keys.clear();
    this.player.dead = false;
    this.player.spawnAt(this.level.spawn.x, this.level.spawn.y, this.level.spawn.z);
    this.safePos.set(0, 0, 0);
    this.embedTime = 0;
    this.objStage = null;
    this.player.pitch = 0;
    // face into the level: toward the nearest connected room
    const spawnRoom = this.level.rooms.find((r) => r.kind === 'spawn')!;
    const other = this.level.rooms.find((r) => r.dist === 1) ?? this.level.rooms[1];
    this.player.yaw = Math.atan2(-(other.cx - spawnRoom.cx), -(other.cz - spawnRoom.cz));

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
    this.hud.message(`SECTOR ${this.levelIndex} of ${TOTAL_SECTORS} — it gets worse down here.`);
  }

  /** an ad break is in flight: swallow repeat clicks, hold pointer-lock resumes */
  private breakPending = false;
  /** WebGL context is lost: no resuming until it's back */
  private gfxLost = false;
  /** run state at the current sector's start (retry restores it) */
  private checkpoint: Checkpoint | null = null;
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
      if (cp.v !== 1 || !(cp.sector >= 2 && cp.sector <= TOTAL_SECTORS) || !cp.ammo || !Array.isArray(cp.owned)) return null;
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
    // a retry never starts you nearly dead
    this.player.health = Math.max(60, Math.min(this.player.maxHealth, cp.health));
    this.player.armor = cp.armor;
    for (const k of Object.keys(this.player.ammo) as (keyof typeof this.player.ammo)[]) {
      this.player.ammo[k] = Math.min(this.player.ammoMax[k], Math.max(0, cp.ammo[k] ?? 0));
    }
    this.player.buffs.quad = this.player.buffs.shield = this.player.buffs.haste = 0;
    this.weapons.restoreLoadout(cp.owned, cp.current);
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
    this.enterSector((this.preview) ? 'BIOFOUNDRY PREVIEW: second attempt.' : `SECTOR ${this.levelIndex} of ${TOTAL_SECTORS} — second attempt. Follow the arrow.`, adShown);
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
    poki.measure('level', 1, 'start'); // a new run = someone played (not sent on retry)
    this.enterSector(`SECTOR 1 of ${TOTAL_SECTORS} — find the RED keycard.`, adShown);
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
    this.enterSector(`SECTOR ${this.levelIndex} of ${TOTAL_SECTORS} — welcome back. Find the RED keycard.`, adShown);
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
    if (this.isTouch && !POKI) {
      // go immersive: fullscreen + landscape lock where the platform allows it
      // (not on Poki — its page owns fullscreen around the game iframe)
      void document.documentElement.requestFullscreen?.().catch(() => {});
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      orientation.lock?.('landscape').catch(() => {});
    }
    this.captureCheckpoint();
    poki.measure('level', 1, 'start'); // title "Enter the facility": someone played
    this.enterSector(`SECTOR 1 of ${TOTAL_SECTORS} — find the RED keycard. Reach the exit.`, adShown);
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

  private nextLevel(adShown = false): void {
    this.levelIndex++;
    this.buildLevel();
    this.captureCheckpoint();
    this.net?.sendNextLevel();
    this.enterSector(`SECTOR ${this.levelIndex} of ${TOTAL_SECTORS} — it gets worse down here.`, adShown);
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
      onStart: () => {
        storageSet(RUN_KEY, null); // a new run replaces any saved one
        this.afterBreak((ad) => this.startGame(ad));
      },
      onContinue: () => this.afterBreak((ad) => this.continueRun(ad)),
      onCoop: POKI ? undefined : () => this.openCoop(),
      onSettings: () => this.openSettings('title'),
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
        totalSectors: (this.preview) ? 4 : TOTAL_SECTORS,
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
    this.solidBoxCache = [];
    for (const d of this.doors) {
      if (d.openT < 0.98) this.solidBoxCache.push(d.box());
    }
    if (this.elevator) this.solidBoxCache.push(this.elevator.box());
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
    const broke = this.world.damageVoxel(x, y, z, dmg);
    if (broke !== null) this.onVoxelBroken(x, y, z, broke);
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
      if (!this.isNetClient) this.queueExplosion(x + 0.5, y + 0.5, z + 0.5, 0.14, 70, 3.2);
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
    let points = e.kind === 'brute' ? 300 : e.kind === 'sentinel' ? 150 : e.kind === 'ticker' ? 75 : 100;
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
  }

  /** grabbing the red keycard springs a security response around the player */
  onKeyPickup(): void {
    if (this.isNetClient) return; // the host owns the ambush
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
    const exitDoor = this.doors.find((d) => d.spec.locked === 'red');
    if (exitDoor && exitDoor.locked) return this.player.hasKey('red') ? 'door' : 'key';
    // up on the exit ledge (the lift's top floor) → last step
    const ledgeY = this.level.elevator ? this.level.elevator.highY - 0.4 : 3.6;
    return this.player.pos.y - this.player.half.y > ledgeY ? 'pad' : 'lift';
  }

  private objectiveTarget(stage: ObjectiveStage): { x: number; z: number } | null {
    switch (stage) {
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
      this.hud.setObjective(this.levelIndex, (this.preview) ? 4 : TOTAL_SECTORS, o.text, o.color, changed, o.icon);
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
      // Poki events are deliberately few: level 1 start, level N complete / fail (POKI.md)
      poki.measure('level', this.levelIndex, 'fail');
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
    // sector clear bonus, plus a bonus for speed
    this.score += 1000 + Math.max(0, 900 - Math.floor(levelTime) * 3);
    this.hud.updateScore(this.score, 1);
    this.audio.play('win');
    this.clearTransientFX();
    poki.measure('level', this.levelIndex, 'complete'); // the only other Poki event (POKI.md)
    this.input.releaseLock();

    const levelStats =
      `Kills: ${this.kills} / ${this.level.totalEnemies} &nbsp;·&nbsp; ` +
      `Secrets: ${this.secretsFound} / ${this.level.totalSecrets} &nbsp;·&nbsp; ` +
      `Time: ${this.formatTime(levelTime)} &nbsp;·&nbsp; ` +
      `Score: ${this.score.toLocaleString()}`;

    if (this.levelIndex < TOTAL_SECTORS) {
      this.state = 'intermission';
      // the save points at the NEXT sector: quitting now resumes there
      this.captureCheckpoint(this.levelIndex + 1);
      this.net?.sendWin(false, `SECTOR ${this.levelIndex} CLEARED`, levelStats);
      this.hud.showIntermission(this.levelIndex, levelStats, !this.net, () => {
        if (this.state === 'intermission') this.afterBreak((ad) => this.nextLevel(ad));
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
      this.dynLights.update(dt, this.camera.position);
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
    this.rendererSys.render();
    this.dynLights.clearFrame();
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
      const actors: Array<{ x: number; z: number; isPlayer: boolean }> = [
        { x: this.player.pos.x, z: this.player.pos.z, isPlayer: true },
      ];
      if (this.net?.connected) {
        // keys are shared in co-op, so the partner opens locked doors too
        actors.push({ x: this.net.remote.pos.x, z: this.net.remote.pos.z, isPlayer: true });
      }
      for (const e of this.enemies.list) {
        if (e.alive && e.awake) actors.push({ x: e.pos.x, z: e.pos.z, isPlayer: false });
      }
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
        let onTop = this.elevator.isOnTop(this.player.pos.x, this.player.pos.y, this.player.pos.z, this.player.half.y);
        if (this.net?.connected) {
          const r = this.net.remote;
          onTop = onTop || this.elevator.isOnTop(r.pos.x, r.pos.y, r.pos.z, r.half.y);
        }
        this.elevator.update(dt, onTop, this.audio);
      }
    }

    this.player.update(dt, this.input, this, boxes);
    // safety net: never let the player leave the world
    if (this.player.pos.y < -8) {
      this.player.spawnAt(this.level.spawn.x, this.level.spawn.y, this.level.spawn.z);
    }
    this.guardPlayerInWorld(dt);
    this.weapons.update(dt, this.input, this);
    this.enemies.update(dt, this);
    this.projectiles.update(dt, this);
    this.particles.update(dt, this.world);
    this.tracers.update(dt);
    this.pickups.update(dt, this.time, this);
    this.elevator?.animate(dt, this.time);
    this.updateObjective();
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
        this.hud.showDeath(
          `Died in sector ${this.levelIndex} &nbsp;·&nbsp; Kills this sector: ${this.kills} / ${this.level.totalEnemies} &nbsp;·&nbsp; Score: ${this.score.toLocaleString()}`,
          this.levelIndex,
          () => {
            if (this.state === 'dead') this.afterBreak((ad) => this.retrySector(ad));
          },
          () => {
            if (this.state === 'dead') this.afterBreak((ad) => this.newRunNow(ad));
          }
        );
      }
    }
  }
}
