/**
 * Run perks: after each cleared sector (solo) the player picks one of three.
 * Each is owned at most once and lasts the whole run — retry / save /
 * Continue keep them (Checkpoint.perks), a new run clears them. The effects
 * live where they act (search for `hasPerk('…')`).
 */
export type PerkId =
  | 'volatile' | 'overcharge' | 'headhunter' | 'momentum' | 'secondWind'
  | 'deepPockets' | 'plating' | 'scavenger' | 'vitality';

export interface PerkDef {
  id: PerkId;
  name: string;
  /** one short line: what it does, in numbers */
  desc: string;
}

export const PERKS: Record<PerkId, PerkDef> = {
  volatile: { id: 'volatile', name: 'Volatile', desc: 'Barrels and your rockets blast 35% wider' },
  overcharge: { id: 'overcharge', name: 'Overcharge', desc: 'Arc caster chains to 2 more enemies and hits harder down the chain' },
  headhunter: { id: 'headhunter', name: 'Headhunter', desc: 'Headshot kills heal 8 health' },
  momentum: { id: 'momentum', name: 'Momentum', desc: 'A triple kill gives 3 s of haste' },
  secondWind: { id: 'secondWind', name: 'Second Wind', desc: 'One extra revive in every sector' },
  deepPockets: { id: 'deepPockets', name: 'Deep Pockets', desc: 'Carry 50% more of every ammo type' },
  plating: { id: 'plating', name: 'Self-Repair', desc: 'Armor rebuilds to 50 when you avoid damage for 4 s' },
  scavenger: { id: 'scavenger', name: 'Scavenger', desc: '1 in 3 kills drops ammo for the gun in your hand' },
  vitality: { id: 'vitality', name: 'Vitality', desc: '+25 max health, and heal 25 now' },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];

export function isPerkId(v: unknown): v is PerkId {
  return typeof v === 'string' && v in PERKS;
}

/**
 * Three perks the player doesn't own yet, picked deterministically from the
 * run seed and the sector — a retried sector offers the same three.
 */
export function rollPerkOffer(owned: Iterable<PerkId>, seed: number, sector: number): PerkId[] {
  const have = new Set(owned);
  const pool = PERK_IDS.filter((p) => !have.has(p));
  let h = (seed ^ Math.imul(sector + 1, 0x9e3779b1)) >>> 0;
  const next = (): number => {
    h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) >>> 0;
    h = Math.imul(h ^ (h >>> 12), 0x297a2d39) >>> 0;
    return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
  };
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}
