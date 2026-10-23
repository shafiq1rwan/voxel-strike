/** Campaign secret prototypes. One replaces the previous prototype in slot 6. */
export const SECRET_WEAPONS = [
  { name: 'RIVET RIOT', hint: 'Heavy rivets shove enemies back.', color: 0xd8a830, damage: 55, pellets: 1, spread: 0.008, rate: 2.2, ammo: 18 },
  { name: 'BREACHER', hint: 'A double blast for close crowds.', color: 0xe88b45, damage: 12, pellets: 12, spread: 0.075, rate: 0.7, ammo: 12 },
  { name: 'LANCE', hint: 'A precision beam pierces enemies.', color: 0x55d8ff, damage: 85, pellets: 1, spread: 0, rate: 0.85, ammo: 12 },
  { name: 'SPORE POPPER', hint: 'Pods stick, swell, and burst after a short delay.', color: 0xa5dc66, damage: 65, pellets: 1, spread: 0, rate: 1.5, ammo: 16 },
  { name: 'BROOD BREAKER', hint: 'A powerful organic arc jumps through the brood.', color: 0xc68aff, damage: 65, pellets: 1, spread: 0, rate: 1.2, ammo: 14 },
] as const;

export function secretIndex(sector: number): number {
  return Math.max(0, Math.min(4, Math.floor(sector) - 1));
}
