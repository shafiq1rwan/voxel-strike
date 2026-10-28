import type { EnemyKind, EnemySpec } from '../types';

/**
 * Sector monster rosters (reference/sector-monsters-v2): each Facility
 * sector has its own two monsters — 1 Facility Entry: Husk + Ticker (the
 * owner's call 2026-10-27: the Sentry Bud turret felt boring next to the
 * crawler that rushes and blows up; the Bud is out of the campaign, its code
 * kept), 2 Security Floor: Clamp Guard + Arc Sentinel, 3 Reactor Access:
 * Brute + Wire Leech. Endless Facility depths pick one of the three by depth.
 *
 * The generator still decides how many enemies a room holds and where (the
 * 0.3.4 rules, owner's call); this turns its generic placements into the
 * sector's pair at about the same pressure (owner's call 2026-10-23: rooms
 * stay populated, total health about the same — a heavy monster takes the
 * place of 2–4 light ones; Tickers stay out of sectors 2–3).
 */
export type FacilityBand = 1 | 2 | 3;

/**
 * OFF (owner's call 2026-10-27: "I prefer the previous monsters for sectors
 * 1–3, v2 feels weird"): Facility sectors and endless Facility depths keep
 * the generator's own mix — Husk, Arc Sentinel, Ticker, Brute, as in 0.3.4 —
 * and the keycard alarm falls back to that mix too. The v2 Facility monsters
 * (Clamp Guard, Wire Leech, Sentry Bud) and this roster stay in the code,
 * spawnable and tested; set true to bring the per-sector pairs back.
 */
export const FACILITY_ROSTERS = false;

/** which roster a Facility sector / endless depth uses */
export function facilityBand(n: number): FacilityBand {
  if (n <= 3) return Math.max(1, n) as FacilityBand;
  return ([3, 1, 2] as const)[n % 3];
}

/** the keycard alarm: the sector's own pair, cycled; how many come */
export const FACILITY_RESPONSE: Record<FacilityBand, { kinds: EnemyKind[]; count: number }> = {
  1: { kinds: ['husk', 'ticker', 'husk'], count: 3 },
  2: { kinds: ['clampGuard', 'sentinel', 'clampGuard', 'sentinel'], count: 4 },
  3: { kinds: ['brute', 'wireLeech', 'wireLeech'], count: 3 },
};

/** "melee units": what a generic close-range slot was worth (a husk = 1) */
function meleeUnits(kind: EnemyKind, band: FacilityBand): number {
  if (kind === 'husk') return 1;
  if (kind === 'ticker') return 0.5;
  if (kind === 'brute') return band === 3 ? 3 : 2;
  return 0;
}

/**
 * Re-cast a Facility sector's placements as its roster, room by room, in
 * placement order (deterministic: no RNG). Every room that had enemies keeps
 * at least one; anything that isn't a Facility generic (none today) is kept.
 */
export function applyFacilityRoster(enemies: EnemySpec[], band: FacilityBand): EnemySpec[] {
  const rooms = new Map<number, EnemySpec[]>();
  for (const e of enemies) {
    const list = rooms.get(e.roomId) ?? [];
    list.push(e);
    rooms.set(e.roomId, list);
  }
  const out: EnemySpec[] = [];
  for (const list of rooms.values()) {
    const melee = list.filter((e) => meleeUnits(e.kind, band) > 0);
    const ranged = list.filter((e) => e.kind === 'sentinel');
    const other = list.filter((e) => !melee.includes(e) && !ranged.includes(e));
    out.push(...other);
    const at = (src: EnemySpec, kind: EnemyKind): EnemySpec => ({ ...src, kind });
    if (band === 1) {
      // Entry: husks stay, each sentinel slot becomes a Ticker (generic ticker
      // slots stay husk units: sector 1 never placed ticker nests anyway)
      for (const e of melee) out.push(at(e, 'husk'));
      for (const e of ranged) out.push(at(e, 'ticker'));
      continue;
    }
    // heavy slots first, so a brute's spot keeps its heavy
    const slots = [...melee].sort((a, b) => meleeUnits(b.kind, band) - meleeUnits(a.kind, band));
    const units = melee.reduce((s, e) => s + meleeUnits(e.kind, band), 0);
    if (band === 2) {
      // Security: a Clamp Guard (85 hp) for every two husks' worth. Only about
      // half the Sentinel slots stay Sentinels (0.3.7 Player Fit Test: 70 of
      // 171 players in sector 2 died to one; ~18 per sector outnumbered the
      // Guards); every two dropped (40 hp each) come back as one more Guard.
      const keep = ranged.length ? Math.max(1, Math.round(ranged.length * 0.5)) : 0;
      const dropped = ranged.slice(keep);
      const guards = (units > 0 ? Math.max(1, Math.round(units / 2)) : 0) + Math.round(dropped.length * 40 / 85);
      const spots = [...slots, ...dropped];
      for (let i = 0; i < guards && i < spots.length; i++) out.push(at(spots[i], 'clampGuard'));
      for (const e of ranged.slice(0, keep)) out.push(e);
      continue;
    }
    // Reactor: a Brute for every three husks' worth, Wire Leeches for the rest
    // and for about half the sentinels
    const brutes = Math.floor(units / 3);
    for (let i = 0; i < brutes && i < slots.length; i++) out.push(at(slots[i], 'brute'));
    const spare = slots.slice(brutes);
    const fromMelee = Math.round((units - brutes * 3) * 0.75);
    const fromRanged = Math.round(ranged.length * 0.6);
    let leeches = fromMelee + fromRanged;
    if (leeches === 0 && brutes === 0 && list.length) leeches = 1;
    const spots = [...spare, ...ranged];
    for (let i = 0; i < leeches && i < spots.length; i++) out.push(at(spots[i], 'wireLeech'));
  }
  return out;
}

/**
 * The Biofoundry (reference/sector-monsters-v2 §4–5): sector 4 = Vatborn +
 * Spitter (tank occupants stay where they are), sector 5 = Carapace (+ the
 * Broodkeeper). Endless Biofoundry depths alternate; a boss depth is sector 5.
 */
export type BioBand = 4 | 5;

export function bioBand(n: number, boss: boolean): BioBand {
  if (n <= 5) return n <= 4 ? 4 : 5;
  return boss || n % 2 === 1 ? 5 : 4;
}

export const BIO_RESPONSE: Record<BioBand, { kinds: EnemyKind[]; count: number }> = {
  4: { kinds: ['vatborn', 'spitter', 'vatborn'], count: 3 },
  5: { kinds: ['carapace', 'carapace'], count: 2 },
};

/**
 * Re-cast a Biofoundry sector's generic placements, room by room, in order
 * (no RNG). Sector 4: a Vatborn (95 hp) per two husks' worth of close-range
 * slots, Spitters for ~60% of the sentinels. Sector 5: one Carapace (120 hp,
 * armoured front) per three husks' worth of everything (it was 2.2 for one
 * test build: all 12 players who failed sector 5 in the 0.3.7 Player Fit
 * Test died to a Carapace; the boss and the extra tanks keep sector 5 a step
 * up from 4). Every occupied room
 * keeps at least one.
 */
export function applyBioRoster(enemies: EnemySpec[], band: BioBand): EnemySpec[] {
  const rooms = new Map<number, EnemySpec[]>();
  for (const e of enemies) {
    const list = rooms.get(e.roomId) ?? [];
    list.push(e);
    rooms.set(e.roomId, list);
  }
  const units = (k: EnemyKind): number => (k === 'husk' ? 1 : k === 'ticker' ? 0.5 : k === 'brute' ? 3 : k === 'sentinel' ? 1.2 : 0);
  const out: EnemySpec[] = [];
  for (const list of rooms.values()) {
    const generic = list.filter((e) => units(e.kind) > 0);
    out.push(...list.filter((e) => units(e.kind) === 0));
    const at = (src: EnemySpec, kind: EnemyKind): EnemySpec => ({ ...src, kind });
    const heavyFirst = [...generic].sort((a, b) => units(b.kind) - units(a.kind));
    if (band === 4) {
      const melee = heavyFirst.filter((e) => e.kind !== 'sentinel');
      const ranged = generic.filter((e) => e.kind === 'sentinel');
      const meleeUnits = melee.reduce((s, e) => s + (e.kind === 'brute' ? 2 : units(e.kind)), 0);
      const vatborn = meleeUnits > 0 ? Math.max(1, Math.round(meleeUnits / 2)) : 0;
      for (let i = 0; i < vatborn && i < melee.length; i++) out.push(at(melee[i], 'vatborn'));
      const spitters = ranged.length ? Math.max(1, Math.round(ranged.length * 0.6)) : 0;
      for (let i = 0; i < spitters; i++) out.push(at(ranged[i], 'spitter'));
      continue;
    }
    const total = generic.reduce((s, e) => s + units(e.kind), 0);
    const cara = total > 0 ? Math.max(1, Math.round(total / 3)) : 0;
    for (let i = 0; i < cara && i < heavyFirst.length; i++) out.push(at(heavyFirst[i], 'carapace'));
  }
  return out;
}


/**
 * The Geothermal Core (reference/sector-monsters-v2 §6–7): sector 6 Heat
 * Exchangers = Vent Stalker + Kiln Drone, sector 7 Deep Core = Cinder Hulk +
 * Ash Weaver. Endless core depths alternate (even = 6, odd = 7).
 */
export type GeoBand = 6 | 7;

export function geoBand(n: number): GeoBand {
  return n % 2 === 0 ? 6 : 7;
}

export const GEO_RESPONSE: Record<GeoBand, { kinds: EnemyKind[]; count: number }> = {
  6: { kinds: ['ventStalker', 'kilnDrone', 'ventStalker'], count: 3 },
  7: { kinds: ['ashWeaver', 'cinderHulk', 'ashWeaver'], count: 3 },
};

/**
 * Re-cast a core sector's generic placements room by room, in order (no
 * RNG). Close-range "husk units" (husk / Vent Stalker 1, ticker 0.5, brute /
 * Cinder Hulk 3) and ranged slots (Sentinel / Kiln Drone):
 *  - 6: a Vent Stalker (55 hp) per 1.1 units, Kiln Drones (75 hp) for ~75%
 *    of the ranged slots;
 *  - 7: a Cinder Hulk (180 hp) per four units, Ash Weavers (70 hp) for the
 *    rest at one per 1.2 units plus ~75% of the ranged slots.
 * Every occupied room keeps at least one.
 */
export function applyGeoRoster(enemies: EnemySpec[], band: GeoBand): EnemySpec[] {
  const rooms = new Map<number, EnemySpec[]>();
  for (const e of enemies) {
    const list = rooms.get(e.roomId) ?? [];
    list.push(e);
    rooms.set(e.roomId, list);
  }
  const meleeUnits = (k: EnemyKind): number =>
    (k === 'husk' || k === 'ventStalker' ? 1 : k === 'ticker' ? 0.5 : k === 'brute' || k === 'cinderHulk' ? 3 : 0);
  const isRanged = (k: EnemyKind): boolean => k === 'sentinel' || k === 'kilnDrone';
  const out: EnemySpec[] = [];
  for (const list of rooms.values()) {
    const melee = list.filter((e) => meleeUnits(e.kind) > 0).sort((a, b) => meleeUnits(b.kind) - meleeUnits(a.kind));
    const ranged = list.filter((e) => isRanged(e.kind));
    out.push(...list.filter((e) => !melee.includes(e) && !ranged.includes(e)));
    const at = (src: EnemySpec, kind: EnemyKind): EnemySpec => ({ ...src, kind });
    const units = melee.reduce((s, e) => s + meleeUnits(e.kind), 0);
    const spots = [...melee, ...ranged];
    if (band === 6) {
      const stalkers = units > 0 ? Math.max(1, Math.round(units / 1.1)) : 0;
      for (let i = 0; i < stalkers && i < melee.length; i++) out.push(at(melee[i], 'ventStalker'));
      const drones = ranged.length ? Math.max(1, Math.round(ranged.length * 0.75)) : 0;
      for (let i = 0; i < drones; i++) out.push(at(ranged[i], 'kilnDrone'));
      continue;
    }
    const hulks = Math.floor(units / 4);
    for (let i = 0; i < hulks && i < melee.length; i++) out.push(at(melee[i], 'cinderHulk'));
    let weavers = Math.round((units - hulks * 4) / 1.2 + ranged.length * 0.75);
    if (weavers === 0 && hulks === 0 && list.length) weavers = 1;
    const rest = spots.slice(hulks);
    for (let i = 0; i < weavers && i < rest.length; i++) out.push(at(rest[i], 'ashWeaver'));
  }
  return out;
}
