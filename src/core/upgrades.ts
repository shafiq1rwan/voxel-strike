import type { EnemyKind } from '../types';

/**
 * Scrap + permanent upgrades (docs/RETENTION_PLAN.md, phase 1). Every kill,
 * clear and find earns scrap that is never lost; scrap buys upgrades that
 * last across runs, so a death in sector 2 still moves the player forward and
 * the next attempt really is a little easier. Players who don't die never
 * notice: the enemy rules don't change.
 */

export type UpgradeId = 'suit' | 'plates' | 'medic' | 'belt' | 'hands' | 'headstart' | 'scanner';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  /** one line per tier: what owning that tier does */
  tiers: [string, string, string];
}

/** cost of tier 1 / 2 / 3 */
export const UPGRADE_COSTS = [50, 120, 250] as const;
export const UPGRADE_MAX = 3;

// names stay distinct from the run perks (Vitality, Deep Pockets, Second Wind…)
export const UPGRADES: UpgradeDef[] = [
  { id: 'suit', name: 'Reinforced Suit', tiers: ['+10 max health', '+20 max health', '+30 max health'] },
  { id: 'plates', name: 'Starter Plates', tiers: ['Start every sector with 10 armor', '…with 20 armor', '…with 30 armor'] },
  { id: 'medic', name: 'Field Medic', tiers: ['Health pickups heal 15% more', '…30% more', '…50% more'] },
  { id: 'belt', name: 'Ammo Belt', tiers: ['Carry 10% more ammo', '…20% more', '…30% more'] },
  { id: 'hands', name: 'Quick Hands', tiers: ['Switch guns and bash 15% faster', '…30% faster', '…45% faster'] },
  { id: 'headstart', name: 'Head Start', tiers: ['New runs start with the Ripper SMG', '…and 20 shells', '…and a random perk'] },
  { id: 'scanner', name: 'Scanner', tiers: ['The keycard shows on the map', 'The secret wall shows on the map', 'The Power Link node shows on the map'] },
];

/** scrap per kill (anything not listed: 1) */
export const SCRAP_FOR_KILL: Partial<Record<EnemyKind, number>> = {
  husk: 1, ticker: 1, ventStalker: 1, sentryBud: 1,
  clampGuard: 2, wireLeech: 2, spitter: 2, carapace: 3,
  sentinel: 2, kilnDrone: 2,
  brute: 5, vatborn: 5, cinderHulk: 5,
  broodkeeper: 40,
};
export const SCRAP_SECRET = 10;
export const SCRAP_POWER_LINK = 5;
/** a sector clear: 15 + 5 per sector (counted to 10), plus the rank bonus */
export function scrapForClear(sector: number, rank: 'S' | 'A' | 'B' | 'C'): number {
  const rankBonus = rank === 'S' ? 15 : rank === 'A' ? 10 : rank === 'B' ? 5 : 0;
  return 15 + 5 * Math.min(10, Math.max(1, sector)) + rankBonus;
}

const KEY = 'voxelstrike-upgrades';

/** the player's scrap and upgrade levels, saved in localStorage across runs */
export class UpgradeBook {
  scrap = 0;
  /** lifetime scrap earned (never goes down) */
  earned = 0;
  private levels = new Map<UpgradeId, number>();

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        this.scrap = Math.max(0, Math.floor(Number(raw.scrap) || 0));
        this.earned = Math.max(this.scrap, Math.floor(Number(raw.earned) || 0));
        for (const u of UPGRADES) {
          const n = Math.floor(Number(raw.levels?.[u.id]) || 0);
          if (n > 0) this.levels.set(u.id, Math.min(UPGRADE_MAX, n));
        }
      }
    } catch { /* private mode / blocked storage: start fresh, nothing breaks */ }
  }

  level(id: UpgradeId): number {
    return this.levels.get(id) ?? 0;
  }

  /** scrap price of the next tier, or null at max */
  cost(id: UpgradeId): number | null {
    const n = this.level(id);
    return n >= UPGRADE_MAX ? null : UPGRADE_COSTS[n];
  }

  earn(n: number): void {
    if (n <= 0) return;
    this.scrap += n;
    this.earned += n;
    this.save();
  }

  /** spend scrap on something other than an upgrade: false when short */
  spend(n: number): boolean {
    if (n <= 0 || this.scrap < n) return false;
    this.scrap -= n;
    this.save();
    return true;
  }

  /** buy the next tier: false when maxed or short of scrap */
  buy(id: UpgradeId): boolean {
    const c = this.cost(id);
    if (c === null || this.scrap < c) return false;
    this.scrap -= c;
    this.levels.set(id, this.level(id) + 1);
    this.save();
    return true;
  }

  private save(): void {
    try {
      const levels: Record<string, number> = {};
      for (const [k, v] of this.levels) levels[k] = v;
      localStorage.setItem(KEY, JSON.stringify({ v: 1, scrap: this.scrap, earned: this.earned, levels }));
    } catch { /* storage unavailable: progress lasts for this page only */ }
  }
}
