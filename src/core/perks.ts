/**
 * Run perks: after each cleared sector (solo) the player picks one of three.
 * Each is owned at most once and lasts the whole run — retry / save /
 * Continue keep them (Checkpoint.perks), a new run clears them. The effects
 * live where they act (search for `hasPerk('…')`).
 */
export type PerkId =
  | 'volatile' | 'overcharge' | 'headhunter' | 'momentum' | 'secondWind'
  | 'deepPockets' | 'plating' | 'scavenger' | 'vitality';

/**
 * One-off rewards: they fill the offer once fewer than three perks are left
 * (endless depths). Applied on the spot, never stored in the run.
 */
export type RewardId = 'patchUp' | 'resupply' | 'reinforce';
/** anything a sector-clear card can offer */
export type OfferId = PerkId | RewardId;

export interface PerkDef {
  id: OfferId;
  name: string;
  /** the card's line: a few words */
  short: string;
  /** the full rule, in numbers (tooltip / docs) */
  desc: string;
}

export const PERKS: Record<PerkId, PerkDef> = {
  volatile: { id: 'volatile', name: 'Volatile', short: 'Bigger blasts', desc: 'Barrels and your rockets blast 35% wider' },
  overcharge: { id: 'overcharge', name: 'Overcharge', short: '+2 arc chains', desc: 'Arc caster chains to 2 more enemies and hits harder down the chain' },
  headhunter: { id: 'headhunter', name: 'Headhunter', short: 'Headshot kills heal', desc: 'Headshot kills heal 8 health' },
  momentum: { id: 'momentum', name: 'Momentum', short: 'Triple kill = haste', desc: 'A triple kill gives 3 s of haste' },
  secondWind: { id: 'secondWind', name: 'Second Wind', short: '+1 revive / sector', desc: 'One extra revive in every sector' },
  deepPockets: { id: 'deepPockets', name: 'Deep Pockets', short: '+50% ammo', desc: 'Carry 50% more of every ammo type' },
  plating: { id: 'plating', name: 'Self-Repair', short: 'Armor regenerates', desc: 'Armor rebuilds to 50 when you avoid damage for 4 s' },
  scavenger: { id: 'scavenger', name: 'Scavenger', short: 'Kills drop ammo', desc: '1 in 3 kills drops ammo for the gun in your hand' },
  vitality: { id: 'vitality', name: 'Vitality', short: '+25 max health', desc: '+25 max health, and heal 25 now' },
};

export const REWARDS: Record<RewardId, PerkDef> = {
  patchUp: { id: 'patchUp', name: 'Patch Up', short: 'Full health now', desc: 'Heal to full health' },
  resupply: { id: 'resupply', name: 'Resupply', short: '+50% ammo now', desc: 'Every ammo type refills by half its capacity' },
  reinforce: { id: 'reinforce', name: 'Reinforce', short: '+75 armor now', desc: 'Gain 75 armor (up to the cap)' },
};

export const PERK_IDS = Object.keys(PERKS) as PerkId[];
const REWARD_IDS = Object.keys(REWARDS) as RewardId[];

export function isReward(id: OfferId): id is RewardId {
  return id in REWARDS;
}

/** the card data for any offer */
export function offerDef(id: OfferId): PerkDef {
  return isReward(id) ? REWARDS[id] : PERKS[id];
}

export function isPerkId(v: unknown): v is PerkId {
  return typeof v === 'string' && v in PERKS && !(v in REWARDS);
}

/**
 * Three perks the player doesn't own yet, picked deterministically from the
 * run seed and the sector — a retried sector offers the same three. When
 * fewer than three are left, one-off rewards fill the remaining cards.
 */
export function rollPerkOffer(owned: Iterable<PerkId>, seed: number, sector: number): OfferId[] {
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
  const offer: OfferId[] = pool.slice(0, 3);
  const fill = [...REWARD_IDS];
  while (offer.length < 3 && fill.length) offer.push(fill.splice(Math.floor(next() * fill.length), 1)[0]);
  return offer;
}
