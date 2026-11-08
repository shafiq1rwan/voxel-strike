/**
 * The death screen's KILLED BY card: what landed the killing hit (the same id
 * as `Player.lastHitBy` and the Poki `death` event) with one counter tip.
 *
 * Why: in the 2026-11-08 Web Fit Test export most players who died in sector 2
 * (11,586 of 12,654, mostly to the Arc Sentinel) never came back. The fights
 * stay as they are — builds that thinned them played shorter — so the death
 * screen teaches the counter instead and keeps Retry the obvious next tap.
 * Tips name what to watch for, never a key (touch players have no bash).
 */
export interface KillerInfo {
  name: string;
  tip: string;
}

export const KILLERS: Record<string, KillerInfo> = {
  husk: { name: 'Husk', tip: 'Back off when it crouches. A missed claw leaves it bent over and open.' },
  sentinel: { name: 'Arc Sentinel', tip: 'Its shutters glow while it aims and the bolt flies where it locked. Strafe then, or break line of sight.' },
  ticker: { name: 'Ticker', tip: 'Shoot it before it reaches you. It blows up when it dies, so pop it near its friends, not near you.' },
  brute: { name: 'Brute', tip: 'When it rears back to charge, sidestep. Hitting a wall stuns it.' },
  vatborn: { name: 'Vatborn', tip: 'Its club swing is slow. Step back when it rises, then hit it while it recovers.' },
  broodkeeper: { name: 'Broodkeeper', tip: 'Dodge the acid volley, then shoot the orange core when its chest plates open.' },
  carapace: { name: 'Carapace', tip: 'Its front plates shrug off shots. After it fires, the plates open: hit the orange core then.' },
  spitter: { name: 'Spitter', tip: 'A square mark shows where the glob lands. Step off it, and out of the acid it leaves.' },
  clampGuard: { name: 'Clamp Guard', tip: 'It turns slowly: circle to its side. After a pinch its jaws stay shut, that is your opening.' },
  wireLeech: { name: 'Wire Leech', tip: 'Shoot the glowing coil to snap its tether, or break line of sight.' },
  sentryBud: { name: 'Sentry Bud', tip: 'Its lids open while it aims. Move when they do, hit it while they are dim.' },
  kilnDrone: { name: 'Kiln Drone', tip: 'Its slug is slow: sidestep it, then shoot the core while it recovers.' },
  ventStalker: { name: 'Vent Stalker', tip: 'It crouches, then leaps at where you stood. Move as soon as it crouches.' },
  cinderHulk: { name: 'Cinder Hulk', tip: 'Jump the ring after its slam, or stay outside its warning mark.' },
  ashWeaver: { name: 'Ash Weaver', tip: 'Its floor marks show where the heat will burn. Step off the line.' },
  barrel: { name: 'A barrel', tip: 'Barrels blast everything near them. Shoot them when enemies are close, not you.' },
  rocket: { name: 'Your own rocket', tip: 'Rockets hurt you up close. Fire them at enemies a few steps away.' },
  explosion: { name: 'An explosion', tip: 'Blasts hurt everything nearby. Keep your distance from Tickers and barrels.' },
};

/** the card's content for a killer id, or null (unknown / nothing to teach) */
export function killerInfo(by: string | undefined): KillerInfo | null {
  return (by && KILLERS[by]) || null;
}
