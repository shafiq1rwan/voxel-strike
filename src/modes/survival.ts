import * as THREE from 'three';
import type { Game } from '../game';
import type { Enemy } from '../entities/enemies';
import type { EnemyKind, PickupKind, WeaponId } from '../types';
import type { LevelData, LevelTheme } from '../world/levelgen';
import type { VoxelWorld } from '../world/world';
import { Block } from '../world/blocks';
import { RISE_S } from '../entities/enemies';

/**
 * SURVIVAL — the main mode since 2026-10-23 (docs/RETENTION_PLAN.md §4).
 * One sealed arena per map (a big generated room dressed with cover and
 * destructible props), waves of enemies that rise out of a warning glow where
 * the player can see them, a flow field so they path around the cover, kills
 * that drop supplies and pay CREDITS, a wave-clear screen with a pick of
 * three and a weapon shop, and a new map every WAVES_PER_MAP waves. Death
 * ends the run.
 */

export const WAVES_PER_MAP = 5;
/** Six environments, five waves on each map. */
export const SURVIVAL_THEMES: LevelTheme[] = ['facility', 'biofoundry', 'geothermal', 'freight', 'excavation', 'medical'];
export const SURVIVAL_BEST_KEY = 'voxelstrike-survival-best';
/** how long the warning glow burns before the enemy rises out of it */
export const TELEGRAPH_S = 1.1;

export const THEME_NAME: Record<LevelTheme, string> = {
  freight: 'FREIGHT DEPOT', excavation: 'DEEP EXCAVATION', medical: 'MEDICAL WING',
  facility: 'THE FACILITY', biofoundry: 'THE BIOFOUNDRY', geothermal: 'THE GEOTHERMAL CORE',
};

/**
 * SCRAP is the one currency (owner's feedback): kills drop it as a pickup,
 * cleared waves pay it, the shop between waves and the permanent upgrades
 * both spend it. Survival kills drop this many times the campaign's
 * `SCRAP_FOR_KILL` (husk 2, sentinel 4, brute 10).
 */
export const SURVIVAL_KILL_SCRAP = 2;
/** scrap for clearing wave w (paid straight in), + `SCRAP_MAP_BONUS` on a map's last wave */
export function scrapForWave(w: number): number {
  return 8 + 2 * w;
}
export const SCRAP_MAP_BONUS = 15;

/**
 * The shop after the wave's pick: guns in any order, and an ammo refill.
 * Priced so the Scattergun is affordable after wave 1, the Ripper after
 * ~wave 2–3, the Thumper ~4, the Arc caster around the first map change.
 */
export type ShopId = WeaponId | 'ammo';
export const SHOP: Array<{ id: ShopId; price: number }> = [
  { id: 'shotgun', price: 20 },
  { id: 'smg', price: 45 },
  { id: 'rocket', price: 75 },
  { id: 'arc', price: 110 },
  { id: 'ammo', price: 15 },
];
/** one short line per gun on its shop card */
export const GUN_ROLE: Record<WeaponId, string> = {
  pistol: 'Never runs dry',
  shotgun: 'Wide blast up close',
  smg: 'Fast, steady fire',
  rocket: 'Blows up crowds',
  arc: 'Chains between enemies',
  special: 'Secret prototype',
};
type AmmoKey = 'bullets' | 'shells' | 'rockets' | 'cells' | 'special';
export const GUN_AMMO: Record<WeaponId, [AmmoKey, number]> = {
  pistol: ['bullets', 30], shotgun: ['shells', 12], smg: ['bullets', 60], rocket: ['rockets', 5], arc: ['cells', 24], special: ['special', 8],
};

/** enemies in wave w (6, 8, 10 … capped) */
export function waveSize(w: number): number {
  return Math.min(32, 4 + 2 * w);
}

/** how many may be alive (or rising) at once — phones stay at 60 fps, fights stay readable */
export function waveCap(w: number): number {
  return Math.min(12, 4 + Math.ceil(w / 2));
}

/** the map (0-based) a wave is fought on */
export function mapOf(wave: number): number {
  return Math.floor((Math.max(1, wave) - 1) / WAVES_PER_MAP);
}

export function themeOfMap(map: number): LevelTheme {
  return SURVIVAL_THEMES[map % SURVIVAL_THEMES.length];
}

/** enemy HP grows with the wave: ×1.0 at wave 1, ×2.2 by wave 21 */
export function waveHpMult(w: number): number {
  return Math.min(2.2, 1 + 0.06 * (w - 1));
}

/** the wave's roster: a weighted mix that widens with the wave, plus its heavies */
export function waveRoster(w: number, theme: LevelTheme, rnd: () => number = Math.random): EnemyKind[] {
  const geo = theme === 'geothermal';
  const pool: Array<[EnemyKind, number]> = [['husk', geo ? 2 : 5]];
  if (w >= 2) pool.push(['sentinel', geo ? 1 : 2 + w * 0.15]);
  if (w >= 3) pool.push(['ticker', 1.5 + w * 0.1]);
  if (theme === 'biofoundry' && w >= 2) pool.push(['vatborn', 2]);
  if (geo) pool.push(['ventStalker', 3], ['kilnDrone', w >= 2 ? 1.5 + w * 0.1 : 0]);
  const total = pool.reduce((s, [, n]) => s + n, 0);
  // the map's last wave brings the heavy hitters; later even waves bring one too
  const heavies = w % WAVES_PER_MAP === 0 ? 1 + Math.floor(w / 10) : (w >= 7 && w % 2 === 0 ? 1 : 0);
  const out: EnemyKind[] = [];
  for (let i = 0; i < waveSize(w) - heavies; i++) {
    let r = rnd() * total;
    let pick: EnemyKind = 'husk';
    for (const [k, n] of pool) {
      r -= n;
      if (r <= 0) { pick = k; break; }
    }
    out.push(pick);
  }
  for (let i = 0; i < heavies; i++) out.push(geo && i === 0 ? 'cinderHulk' : 'brute');
  return out;
}

/**
 * Turn a generated Survival sector into the stage: wall off the arena room
 * (its doorway gaps and any cracked secret wall in its ring), clear the
 * level's own enemies and pickups, and stand the player in its middle.
 */
export function prepareSurvivalLevel(level: LevelData): void {
  const r = level.rooms.find((q) => q.kind === 'arena');
  if (!r) return;
  const w = level.world;
  const ring: Array<[number, number]> = [];
  for (let x = r.x - 1; x <= r.x + r.w; x++) ring.push([x, r.z - 1], [x, r.z + r.d]);
  for (let z = r.z; z < r.z + r.d; z++) ring.push([r.x - 1, z], [r.x + r.w, z]);
  // seal with the ring's own most common wall block, so the patch reads as wall
  const counts = new Map<number, number>();
  for (const [x, z] of ring) {
    const b = w.get(x, 2, z);
    if (b !== Block.Air && b !== Block.Cracked) counts.set(b, (counts.get(b) ?? 0) + 1);
  }
  let seal: number = Block.Wall;
  let most = 0;
  for (const [b, n] of counts) if (n > most) { most = n; seal = b; }
  for (const [x, z] of ring) {
    for (let y = 1; y <= r.h; y++) {
      const b = w.get(x, y, z);
      if (b === Block.Air || b === Block.Cracked || b === Block.PowerBarrier) w.set(x, y, z, seal);
    }
  }
  level.enemies = [];
  level.pickups = [];
  level.totalEnemies = 0;
  level.secretWall = [];
  level.totalSecrets = 0;
  level.powerLink = null;
  level.boss = null;
  level.spawn = { x: r.cx + 0.5, y: 2.05, z: r.cz + 0.5 };
}

/**
 * Shortest walking routes to the player across the arena (BFS over floor
 * cells, 8 directions, no corner cutting), so enemies go AROUND cover instead
 * of pressing into it. Rebuilt when the player changes cell, and twice a
 * second anyway (crates get blown up).
 */
export class FlowField {
  private dist = new Int16Array(0);
  private x0 = 0;
  private z0 = 0;
  private w = 0;
  private d = 0;
  private pcx = -1;
  private pcz = -1;
  private age = 0;

  private open(world: VoxelWorld, x: number, z: number): boolean {
    return world.isSolid(x, 0, z) && !world.isSolid(x, 1, z) && !world.isSolid(x, 2, z);
  }

  update(dt: number, game: Game): void {
    const r = game.level.rooms.find((q) => q.kind === 'arena');
    if (!r) return;
    const px = Math.floor(game.player.pos.x), pz = Math.floor(game.player.pos.z);
    this.age -= dt;
    if (px === this.pcx && pz === this.pcz && this.age > 0) return;
    this.pcx = px;
    this.pcz = pz;
    this.age = 0.5;
    this.x0 = r.x;
    this.z0 = r.z;
    this.w = r.w;
    this.d = r.d;
    if (this.dist.length !== r.w * r.d) this.dist = new Int16Array(r.w * r.d);
    this.dist.fill(-1);
    const sx = px - r.x, sz = pz - r.z;
    if (sx < 0 || sz < 0 || sx >= r.w || sz >= r.d) return;
    const world = game.world;
    const q: number[] = [sx + sz * r.w];
    this.dist[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const c = q[i], cx = c % r.w, cz = (c / r.w) | 0;
      for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (nx < 0 || nz < 0 || nx >= r.w || nz >= r.d) continue;
        const n = nx + nz * r.w;
        if (this.dist[n] >= 0 || !this.open(world, r.x + nx, r.z + nz)) continue;
        // diagonals only where both orthogonal cells are open (no corner cutting)
        if (dx && dz && (!this.open(world, r.x + cx + dx, r.z + cz) || !this.open(world, r.x + cx, r.z + cz + dz))) continue;
        this.dist[n] = this.dist[c] + 1;
        q.push(n);
      }
    }
  }

  /** steps from (x, z) to the player along the field, or -1 when unreachable */
  stepsAt(x: number, z: number): number {
    const cx = Math.floor(x) - this.x0, cz = Math.floor(z) - this.z0;
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.d) return -1;
    return this.dist[cx + cz * this.w] ?? -1;
  }

  /** unit direction toward the next cell on the way to the player, or null */
  dirAt(x: number, z: number): [number, number] | null {
    const cx = Math.floor(x) - this.x0, cz = Math.floor(z) - this.z0;
    if (cx < 0 || cz < 0 || cx >= this.w || cz >= this.d) return null;
    const here = this.dist[cx + cz * this.w];
    let best = here < 0 ? 0x7fff : here;
    let bx = 0, bz = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= this.w || nz >= this.d) continue;
      const v = this.dist[nx + nz * this.w];
      if (v < 0) continue;
      if (dx && dz && (this.dist[cx + dx + cz * this.w] < 0 || this.dist[cx + (cz + dz) * this.w] < 0)) continue;
      if (v < best) { best = v; bx = dx; bz = dz; }
    }
    if (!bx && !bz) return null;
    // aim at the centre of that cell, so bodies don't graze the corners
    const tx = this.x0 + cx + bx + 0.5 - x, tz = this.z0 + cz + bz + 0.5 - z;
    const l = Math.hypot(tx, tz) || 1;
    return [tx / l, tz / l];
  }
}

/** one warning glow on the floor: a ring that tightens and a beam that rises */
interface Telegraph { x: number; z: number; kind: EnemyKind; t: number; marker: THREE.Group }

type Phase = 'intro' | 'fight' | 'break' | 'offer' | 'over';

export class SurvivalRun {
  wave = 0;
  phase: Phase = 'intro';
  /** run totals (the level's own counters reset on every map change) */
  kills = 0;
  readonly nav = new FlowField();
  /** spawn warnings: pooled meshes in the scene for the whole run */
  readonly fx = new THREE.Group();
  private timer = 2.5;
  private queue: EnemyKind[] = [];
  private spawned: Enemy[] = [];
  private pending: Telegraph[] = [];
  private spawnCd = 0;
  private pool: THREE.Group[] = [];
  private ringGeo = new THREE.RingGeometry(0.5, 0.9, 24);
  private beamGeo = new THREE.BoxGeometry(0.3, 1, 0.3);
  private mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHex(0xff3428, THREE.LinearSRGBColorSpace),
    transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });

  constructor() {
    this.fx.name = 'survival-fx';
    for (let i = 0; i < 14; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(this.ringGeo, this.mat);
      ring.rotation.x = -Math.PI / 2;
      const beam = new THREE.Mesh(this.beamGeo, this.mat);
      beam.position.y = 0.5;
      g.add(ring, beam);
      g.visible = false;
      this.fx.add(g);
      this.pool.push(g);
    }
  }

  dispose(): void {
    this.fx.removeFromParent();
    this.ringGeo.dispose();
    this.beamGeo.dispose();
    this.mat.dispose();
  }

  /** enemies still to beat this wave (alive + rising + yet to spawn) */
  remaining(): number {
    return this.queue.length + this.pending.length + this.spawned.filter((e) => e.alive).length;
  }

  /** a fresh map / a pick made: the next wave starts after a short breath */
  arm(seconds: number): void {
    this.phase = 'break';
    this.timer = seconds;
    this.spawned = [];
    for (const p of this.pending) p.marker.visible = false;
    this.pending = [];
  }

  update(dt: number, game: Game): void {
    this.nav.update(dt, game);
    this.animateTelegraphs(dt, game);
    if (this.phase === 'over' || this.phase === 'offer') return;
    if (this.phase === 'intro' || this.phase === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.beginWave(game);
      return;
    }
    // fight: warnings feed the arena up to the cap, one every so often
    this.spawnCd -= dt;
    const alive = this.spawned.filter((e) => e.alive).length;
    if (this.queue.length && alive + this.pending.length < waveCap(this.wave) && this.spawnCd <= 0) {
      if (this.warnOne(game)) this.spawnCd = Math.max(0.3, 0.9 - this.wave * 0.04);
      else this.spawnCd = 0.25; // no clear, visible spot right now: try again shortly
    }
    if (!this.queue.length && !this.pending.length && alive === 0) {
      this.phase = 'offer';
      game.survivalWaveCleared(this.wave);
    }
  }

  private beginWave(game: Game): void {
    this.wave++;
    this.phase = 'fight';
    this.queue = waveRoster(this.wave, themeOfMap(mapOf(this.wave)));
    this.spawned = [];
    this.spawnCd = 0;
    game.survivalWaveStarted(this.wave);
  }

  /**
   * Pick a spot for the next enemy and light its warning: open floor near the
   * arena's edge, reachable, at least 8 u away, and in the player's line of
   * sight (never behind cover or a pillar), so every arrival can be seen.
   */
  private warnOne(game: Game): boolean {
    const r = game.level.rooms.find((q) => q.kind === 'arena');
    const marker = this.pool.find((m) => !m.visible);
    if (!r || !marker) return false;
    const w = game.world;
    const pl = game.player;
    const kind = this.queue[this.queue.length - 1];
    const flyer = kind === 'sentinel' || kind === 'kilnDrone';
    const boxes = game.solidBoxes();
    for (let tries = 0; tries < 60; tries++) {
      // the outer band first (2–4 cells in from the walls), anywhere if that fails
      let x: number, z: number;
      if (tries < 45) {
        const side = Math.floor(Math.random() * 4);
        const t = Math.random();
        const inset = 2 + Math.floor(Math.random() * 3);
        x = side < 2 ? r.x + 2 + Math.floor(t * (r.w - 4)) : side === 2 ? r.x + inset : r.x + r.w - 1 - inset;
        z = side >= 2 ? r.z + 2 + Math.floor(t * (r.d - 4)) : side === 0 ? r.z + inset : r.z + r.d - 1 - inset;
      } else {
        x = r.x + 1 + Math.floor(Math.random() * (r.w - 2));
        z = r.z + 1 + Math.floor(Math.random() * (r.d - 2));
      }
      if (!w.isSolid(x, 0, z) || w.isSolid(x, 1, z) || w.isSolid(x, 2, z)) continue;
      if (flyer && (w.isSolid(x, 3, z) || w.isSolid(x, 4, z))) continue;
      const px = x + 0.5, pz = z + 0.5;
      const d2 = (px - pl.pos.x) ** 2 + (pz - pl.pos.z) ** 2;
      if (d2 < (tries < 50 ? 64 : 25)) continue;
      if (this.nav.stepsAt(px, pz) < 0) continue; // walled-in pocket: it could never reach you
      if (tries < 55 && !game.hasLOS(pl.pos.x, pl.eyeY(), pl.pos.z, px, 1.6, pz)) continue;
      if (this.pending.some((p) => (p.x - px) ** 2 + (p.z - pz) ** 2 < 4)) continue;
      if (this.spawned.some((e) => e.alive && (e.pos.x - px) ** 2 + (e.pos.z - pz) ** 2 < 2.25)) continue;
      if (boxes.some((b) => px > b.minX - 0.5 && px < b.maxX + 0.5 && pz > b.minZ - 0.5 && pz < b.maxZ + 0.5)) continue;
      marker.position.set(px, 1.02, pz);
      marker.visible = true;
      this.pending.push({ x: px, z: pz, kind, t: TELEGRAPH_S, marker });
      this.queue.pop();
      game.audio.play('clank', { x: px, y: 1.5, z: pz });
      game.dynLights.flash(px, 1.4, pz, 1, 0.25, 0.15, 1.4, 6, TELEGRAPH_S);
      return true;
    }
    return false;
  }

  /** warnings tighten and brighten; when one burns out its enemy rises out of it */
  private animateTelegraphs(dt: number, game: Game): void {
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const p = this.pending[i];
      p.t -= dt;
      const k = 1 - Math.max(0, p.t) / TELEGRAPH_S; // 0 → 1
      const pulse = 0.85 + 0.15 * Math.sin(k * 30);
      const [ring, beam] = p.marker.children;
      ring.scale.setScalar((1.6 - 0.8 * k) * pulse);
      beam.scale.set(1, 0.3 + k * 3.2, 1);
      beam.position.y = (0.3 + k * 3.2) / 2;
      if (p.t > 0 || this.phase !== 'fight') continue;
      p.marker.visible = false;
      this.pending.splice(i, 1);
      this.spawnAt(game, p.x, p.z, p.kind);
    }
  }

  private spawnAt(game: Game, px: number, pz: number, kind: EnemyKind): void {
    const r = game.level.rooms.find((q) => q.kind === 'arena');
    if (!r) return;
    const index = game.enemies.list.length;
    game.enemies.spawnFromSpecs([{ kind, x: px, z: pz, roomId: r.id }], game.level.rooms, game);
    const e = game.enemies.list[index];
    if (!e) return;
    const k = waveHpMult(this.wave);
    e.maxHp = e.hp = Math.round(e.hp * k);
    e.rise = RISE_S; // climbs up out of the glow before it moves
    e.wake(game);
    this.spawned.push(e);
    game.level.totalEnemies++;
    game.spawnFX(px, 1.2, pz);
  }

  /**
   * What a kill drops: ammo most often (more when the gun in hand runs low),
   * health, armor, rarely a powerup. Brutes still always drop a powerup.
   */
  dropFor(game: Game): PickupKind | null {
    const pl = game.player;
    const gun = game.weapons.current;
    const [ammoKey] = GUN_AMMO[gun];
    const low = pl.ammo[ammoKey] < pl.ammoMax[ammoKey] * 0.3;
    const r = Math.random();
    if (r < 0.03) {
      const p: PickupKind[] = ['powerQuad', 'powerShield', 'powerHaste'];
      return p[Math.floor(Math.random() * p.length)];
    }
    if (r < 0.11) return 'healthSmall';
    if (r < 0.17) return 'armorShard';
    if (r < (low ? 0.9 : 0.6)) {
      const owned = (['shotgun', 'smg', 'rocket', 'arc', 'pistol'] as WeaponId[]).filter((id) => game.weapons.has(id));
      const id = low || Math.random() < 0.6 ? gun : owned[Math.floor(Math.random() * owned.length)];
      const ammo = GUN_AMMO[id][0];
      return ammo === 'shells' ? 'ammoShells' : ammo === 'rockets' ? 'ammoRockets' : ammo === 'cells' ? 'ammoCells' : 'ammoBullets';
    }
    return null;
  }
}
