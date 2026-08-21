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
import { Door, Elevator } from './entities/door';
import { EnemyManager } from './entities/enemies';
import { SpriteLibrary } from './entities/sprites';
import { PickupManager } from './entities/pickups';
import { ProjectilePool } from './entities/projectiles';
import { Particles } from './fx/particles';
import { Tracers } from './fx/tracers';
import { DynLights } from './fx/dynlights';
import { WeaponSystem } from './weapons/weapons';
import { HUD } from './ui/hud';
import { GameSettings, loadSettings, saveSettings } from './core/settings';
import { KeyColor, PickupKind } from './types';

type GameState = 'title' | 'playing' | 'paused' | 'dead' | 'intermission' | 'won';

const TOTAL_SECTORS = 3;

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
  readonly sprites = new SpriteLibrary();
  readonly player = new Player();
  readonly weapons = new WeaponSystem();
  readonly settings: GameSettings = loadSettings();
  readonly isTouch = isTouchDevice();

  world!: VoxelWorld;
  level!: LevelData;
  doors: Door[] = [];
  elevator: Elevator | null = null;
  private chunks: ChunkManager | null = null;
  private pickups!: PickupManager;

  private state: GameState = 'title';
  private clock = new THREE.Clock();
  private time = 0;
  private baseSeed: number;
  levelIndex = 1;
  private kills = 0;
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
  /** delayed explosions (barrel chain reactions): x, y, z, fuse seconds */
  private pendingExplosions: Array<{ x: number; y: number; z: number; t: number }> = [];
  private fovKick = 0;
  private lowHealth = false;
  private ambientTimer = 8;
  /** stays in combat music for a few seconds after the last contact */
  private combatLinger = 0;

  constructor(parent: HTMLElement) {
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
    this.camera.add(this.weapons.viewModel);
    scene.add(this.camera);
    // menu shows the bare facility; the gun raises when the run starts
    this.weapons.viewModel.visible = false;

    if (this.isTouch) {
      new TouchControls(this.hud.container, this.input, () => this.requestPause());
    }

    this.sprites.load();
    this.buildLevel();
    this.applySettings();

    this.showTitleScreen();
    this.input.onLockChange = (locked) => this.onLockChange(locked);
    this.input.onFirstInteract = () => this.audio.init();

    // debug hook for automated smoke tests
    (window as unknown as Record<string, unknown>).__voxelstrike = this;

    this.clock.start();
    const loop = (): void => {
      requestAnimationFrame(loop);
      this.frame();
    };
    requestAnimationFrame(loop);
  }

  /** seed for the current sector, derived from the base seed */
  private levelSeed(): number {
    return (this.baseSeed + (this.levelIndex - 1) * 104729) >>> 0;
  }

  private teardownLevel(): void {
    const scene = this.rendererSys.scene;
    if (this.chunks) {
      scene.remove(this.chunks.group);
      this.chunks.dispose();
      this.chunks = null;
    }
    for (const d of this.doors) {
      scene.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
    }
    this.doors = [];
    if (this.elevator) {
      scene.remove(this.elevator.mesh);
      this.elevator.mesh.geometry.dispose();
      (this.elevator.mesh.material as THREE.Material).dispose();
      this.elevator = null;
    }
    if (this.pickups) scene.remove(this.pickups.group);
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
    this.level = generateLevel(seed, this.levelIndex);
    this.world = this.level.world;
    const scene = this.rendererSys.scene;

    this.chunks = new ChunkManager(
      this.world, this.dynLights,
      this.rendererSys.fogColor, this.rendererSys.fogNear, this.rendererSys.fogFar
    );
    this.chunks.buildAll();
    scene.add(this.chunks.group);

    for (const spec of this.level.doors) {
      const door = new Door(spec, this.world);
      this.doors.push(door);
      scene.add(door.mesh);
    }
    if (this.level.elevator) {
      this.elevator = new Elevator(this.level.elevator, this.world);
      scene.add(this.elevator.mesh);
    }

    this.pickups = new PickupManager(this.level.pickups, this.world);
    scene.add(this.pickups.group);

    this.enemies.spawnFromSpecs(this.level.enemies, this.level.rooms, this);
    scene.add(this.enemies.group);

    // per-level state
    this.kills = 0;
    this.secretsFound = 0;
    this.secretAnnounced = false;
    this.player.keys.clear();
    this.player.dead = false;
    this.player.spawnAt(this.level.spawn.x, this.level.spawn.y, this.level.spawn.z);
    this.player.pitch = 0;
    // face into the level: toward the nearest connected room
    const spawnRoom = this.level.rooms.find((r) => r.kind === 'spawn')!;
    const other = this.level.rooms.find((r) => r.dist === 1) ?? this.level.rooms[1];
    this.player.yaw = Math.atan2(-(other.cx - spawnRoom.cx), -(other.cz - spawnRoom.cz));

    this.hud.updateStats(this.player);
    this.hud.updateWeapon(this.weapons);
    console.log(`[voxelstrike] sector ${this.levelIndex} ready: ${this.level.rooms.length} rooms, ${this.level.enemies.length} enemies, ${this.doors.length} doors`);
  }

  private startGame(): void {
    this.audio.init();
    this.hud.hideScreen();
    this.weapons.viewModel.visible = true;
    this.state = 'playing';
    this.levelStartTime = this.time;
    if (this.isTouch) {
      // go immersive: fullscreen + landscape lock where the platform allows it
      void document.documentElement.requestFullscreen?.().catch(() => {});
      const orientation = screen.orientation as ScreenOrientation & {
        lock?: (o: string) => Promise<void>;
      };
      orientation.lock?.('landscape').catch(() => {});
    } else {
      this.input.requestLock();
    }
    this.hud.message(`SECTOR 1 of ${TOTAL_SECTORS} — find the RED keycard. Reach the exit.`);
    // if the browser blocked audio despite the gesture, tell the player how to fix it
    window.setTimeout(() => {
      if (!this.audio.isRunning()) {
        this.hud.message('Audio is blocked by the browser — click or press any key to enable it.');
      }
    }, 900);
  }

  private nextLevel(): void {
    this.levelIndex++;
    this.buildLevel();
    this.hud.hideScreen();
    this.state = 'playing';
    this.levelStartTime = this.time;
    if (!this.isTouch) this.input.requestLock();
    this.hud.message(`SECTOR ${this.levelIndex} of ${TOTAL_SECTORS} — it gets worse down here.`);
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
    this.hud.showTitle({
      seed: this.baseSeed,
      onStart: () => this.startGame(),
      onSettings: () => this.openSettings('title'),
    });
  }

  /** pause without pointer lock (touch devices have none) */
  private requestPause(): void {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.showPauseScreen();
  }

  private resumeGame(): void {
    if (this.isTouch) {
      if (this.state === 'paused') {
        this.state = 'playing';
        this.hud.hideScreen();
      }
    } else {
      this.input.requestLock(); // resume happens via the lock-change event
    }
  }

  private showPauseScreen(): void {
    this.hud.showPause(
      {
        sector: this.levelIndex,
        totalSectors: TOTAL_SECTORS,
        kills: this.kills,
        totalEnemies: this.level.totalEnemies,
        secrets: this.secretsFound,
        totalSecrets: this.level.totalSecrets,
        time: this.formatTime(this.time - this.levelStartTime),
        seed: this.baseSeed,
      },
      () => this.resumeGame(),
      () => {
        location.href = location.pathname;
      },
      () => this.openSettings('pause')
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
        location.href = location.pathname;
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
    } else if (locked && this.state === 'paused') {
      this.state = 'playing';
      this.hud.hideScreen();
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

  explode(x: number, y: number, z: number, damage: number, radius: number): void {
    this.particles.explosion(x, y, z);
    this.audio.play('explosion', { x, y, z });
    this.dynLights.flash(x, y, z, 1, 0.6, 0.25, 3, 14, 0.35);

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
    // player splash — also occluded by geometry
    const pd = Math.sqrt((this.player.pos.x - x) ** 2 + (this.player.pos.y - y) ** 2 + (this.player.pos.z - z) ** 2);
    // view punch scales with proximity even when a wall blocks the damage
    if (pd < radius + 4) this.punchFOV(3.5 * Math.max(0, 1 - pd / (radius + 4)));
    if (pd < radius && !this.player.dead && this.hasLOS(x, y, z, this.player.pos.x, this.player.pos.y, this.player.pos.z)) {
      const f = 1 - pd / radius;
      this.player.damage(Math.round(damage * 0.55 * f), this, { x, z });
      // rocket-jump style push
      this.player.vel.x += ((this.player.pos.x - x) / Math.max(0.3, pd)) * 9 * f;
      this.player.vel.y += 6 * f;
      this.player.vel.z += ((this.player.pos.z - z) / Math.max(0.3, pd)) * 9 * f;
    }
    this.player.shake = Math.min(0.7, this.player.shake + 0.3);
    this.enemies.alertAt(x, z, 20, this);
  }

  onVoxelBroken(x: number, y: number, z: number, block: Block): void {
    if (block === Block.Crate) {
      this.particles.debris(x + 0.5, y + 0.5, z + 0.5, 0.5, 0.38, 0.2);
      this.audio.play('crateBreak', { x, y, z });
      // crates sometimes drop supplies
      if (Math.random() < 0.35) {
        const drops: PickupKind[] = ['ammoBullets', 'ammoShells', 'healthSmall', 'armorShard'];
        this.pickups.add(
          { kind: drops[Math.floor(Math.random() * drops.length)], x: x + 0.5, y: y + 0.4, z: z + 0.5 },
          this.world
        );
      }
    } else if (block === Block.Barrel) {
      // short fuse so chains ripple instead of detonating in the same frame
      this.particles.debris(x + 0.5, y + 0.5, z + 0.5, 0.35, 0.5, 0.2, 8);
      this.pendingExplosions.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, t: 0.14 });
    } else {
      this.particles.debris(x + 0.5, y + 0.5, z + 0.5, 0.36, 0.4, 0.47);
      this.audio.play('wallBreak', { x, y, z });
      this.hud.message('The cracked wall gives way!');
    }
  }

  onEnemyKilled(): void {
    this.kills++;
    this.hud.killMarker();
    this.punchFOV(0.8);
  }

  /** brief FOV widening on heavy impacts — decays each frame */
  punchFOV(amount: number): void {
    this.fovKick = Math.min(9, this.fovKick + amount);
  }

  onPlayerDeath(): void {
    this.state = 'dead';
    this.deathTimer = 0;
  }

  private formatTime(t: number): string {
    const mins = Math.floor(t / 60);
    const secs = Math.floor(t % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  }

  private win(): void {
    if (this.state !== 'playing') return;
    const levelTime = this.time - this.levelStartTime;
    this.totalPlayTime += levelTime;
    this.totalKills += this.kills;
    this.totalEnemiesSoFar += this.level.totalEnemies;
    this.totalSecretsFound += this.secretsFound;
    this.totalSecretsSoFar += this.level.totalSecrets;
    this.audio.play('win');
    this.audio.setHeartbeat(false);
    this.lowHealth = false;
    this.hud.setLowHealth(false);
    document.exitPointerLock();

    const levelStats =
      `Kills: ${this.kills} / ${this.level.totalEnemies} &nbsp;·&nbsp; ` +
      `Secrets: ${this.secretsFound} / ${this.level.totalSecrets} &nbsp;·&nbsp; ` +
      `Time: ${this.formatTime(levelTime)}`;

    if (this.levelIndex < TOTAL_SECTORS) {
      this.state = 'intermission';
      this.hud.showIntermission(this.levelIndex, levelStats, () => this.nextLevel());
    } else {
      this.state = 'won';
      const totals =
        `Total kills: ${this.totalKills} / ${this.totalEnemiesSoFar} &nbsp;·&nbsp; ` +
        `Secrets: ${this.totalSecretsFound} / ${this.totalSecretsSoFar} &nbsp;·&nbsp; ` +
        `Total time: ${this.formatTime(this.totalPlayTime)}`;
      this.hud.showWin(totals, () => {
        location.href = location.pathname;
      });
    }
  }

  private frame(): void {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    this.frameCounter++;

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

    const playing = this.state === 'playing' || this.state === 'dead';
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

    // barrel chain-reaction fuses
    for (let i = this.pendingExplosions.length - 1; i >= 0; i--) {
      const p = this.pendingExplosions[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.pendingExplosions.splice(i, 1);
        this.explode(p.x, p.y, p.z, 70, 3.2);
      }
    }

    // doors: player + alive enemies can trigger them
    const actors: Array<{ x: number; z: number; isPlayer: boolean }> = [
      { x: this.player.pos.x, z: this.player.pos.z, isPlayer: true },
    ];
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
      const onTop = this.elevator.isOnTop(this.player.pos.x, this.player.pos.y, this.player.pos.z, this.player.half.y);
      this.elevator.update(dt, onTop, this.audio);
    }

    this.player.update(dt, this.input, this, boxes);
    // safety net: never let the player leave the world
    if (this.player.pos.y < -8) {
      this.player.spawnAt(this.level.spawn.x, this.level.spawn.y, this.level.spawn.z);
    }
    this.weapons.update(dt, this.input, this);
    this.enemies.update(dt, this);
    this.projectiles.update(dt, this);
    this.particles.update(dt, this.world);
    this.tracers.update(dt);
    this.pickups.update(dt, this.time, this);
    this.hud.updateAmmo(this.player, this.weapons);

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
        this.hud.message('You found a secret area!');
      }
    }

    // exit pad check: standing on an ExitPad block
    if (this.state === 'playing') {
      const under = this.world.get(
        Math.floor(this.player.pos.x),
        Math.floor(this.player.pos.y - this.player.half.y - 0.1),
        Math.floor(this.player.pos.z)
      );
      if (under === Block.ExitPad && this.player.onGround) this.win();
    }

    // death screen after a beat
    if (this.state === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer > 1.4 && this.deathTimer - dt <= 1.4) {
        document.exitPointerLock();
        this.hud.showDeath(
          `Died in sector ${this.levelIndex} &nbsp;·&nbsp; Kills this sector: ${this.kills} / ${this.level.totalEnemies} &nbsp;·&nbsp; Total kills: ${this.totalKills + this.kills}`,
          () => {
            location.href = location.pathname;
          }
        );
      }
    }
  }
}
