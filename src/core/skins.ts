/**
 * Weapon skins: cosmetic paint for the five guns, unlocked by playing.
 *
 * The concepts are `reference/weapon-skins/*` (22 finishes). A skin is data:
 * paint for a few named surfaces of the box model (`SkinRole`) plus flat
 * "marks" — thin paint panels laid on the visible left side / top (stripes,
 * bands, patches). They are baked with the gun's static parts, so a skin
 * costs no draw calls. Signal colours never change: sights, red dot, coils,
 * ready LED, shells and the bead stay as they are.
 *
 * Unlocks are lifetime goals (kills, headshots, bash kills, secrets, sector
 * clears, depth, bosses, S ranks), kept on the device. The first lands in
 * the first minute or two of play, and the title + HUD always show the next
 * one, so a new player has something to chase from the first shot.
 */
import type { WeaponId } from '../types';

/** paintable surfaces of a gun (which boxes each one covers is per weapon, in weapons.ts) */
export type SkinRole = 'main' | 'second' | 'dark' | 'accent' | 'trim' | 'metal' | 'stock' | 'mag';

/** a flat paint panel: size + centre in the model's space (or on its slide / pump) */
export interface SkinMark {
  size: [number, number, number];
  at: [number, number, number];
  color: number;
  /** tilt in the side plane (rotation about x), radians */
  rx?: number;
  /** turn on the top face (rotation about y), radians */
  ry?: number;
  /** ride a moving part (the paint travels with it) */
  on?: 'slide' | 'pump';
}

export type SkinStat = 'kills' | 'headshots' | 'bashKills' | 'secrets' | 'cleared' | 'reached' | 'bosses' | 'sRanks';

export interface SkinDef {
  id: string;
  weapon: WeaponId;
  name: string;
  colors: Partial<Record<SkinRole, number>>;
  marks: SkinMark[];
  /** three colours for UI swatches */
  swatch: [number, number, number];
  need: { stat: SkinStat; n: number };
}

export const WEAPON_LABEL: Record<WeaponId, string> = {
  pistol: 'SIDEARM', shotgun: 'SCATTERGUN', smg: 'RIPPER', rocket: 'THUMPER', arc: 'ARC CASTER', special: 'SECRET PROTOTYPE',
};

// a paint panel on a gun's left side (x = the face, a hair outside it)
const side = (x: number, y: number, z: number, h: number, d: number, color: number, rx = 0, on?: SkinMark['on']): SkinMark =>
  ({ size: [0.004, h, d], at: [x, y, z], color, rx, on });
// the first-person view mostly sees a gun's TOP, so every skin paints it too
const top = (y: number, x: number, z: number, w: number, d: number, color: number, ry = 0, on?: SkinMark['on']): SkinMark =>
  ({ size: [w, 0.004, d], at: [x, y, z], color, ry, on });

// left faces (model space; the slide / pump ones are in that part's space)
const PS = -0.047; // pistol slide
const SR = -0.057; // shotgun receiver
const SS = -0.047; // shotgun stock
const SP = -0.064; // shotgun pump
const MB = -0.057; // ripper body
const MS = -0.052; // ripper shroud
const RT = -0.087; // thumper tube
const AB = -0.062; // arc caster body
// top faces
const PST = 0.0445; // pistol slide (slide space)
const SRT = 0.062; // shotgun receiver
const SST = -0.013; // shotgun stock
const MBT = 0.057; // ripper body (beside the rail)
const RTT = 0.107; // thumper tube
const ABT = 0.047; // arc caster body (beside the fin)

/** in unlock order: the first is quick, each next one a bit further */
export const SKINS: SkinDef[] = [
  {
    id: 'pistol.ceramicMint', weapon: 'pistol', name: 'CERAMIC MINT',
    colors: { main: 0xe8e2d4, second: 0x2e3036, dark: 0x2a2c32, accent: 0x5ec8a8, trim: 0xd8d0c0 },
    marks: [side(PS, 0, 0.075, 0.05, 0.012, 0x5ec8a8, 0, 'slide'), side(PS, 0, 0.1, 0.05, 0.01, 0x5ec8a8, 0, 'slide'), side(PS, 0, 0.122, 0.05, 0.01, 0x5ec8a8, 0, 'slide'), top(PST, 0, 0.09, 0.07, 0.01, 0x5ec8a8, 0, 'slide'), top(PST, 0, 0.113, 0.07, 0.008, 0x5ec8a8, 0, 'slide')],
    swatch: [0xe8e2d4, 0x5ec8a8, 0x2e3036], need: { stat: 'kills', n: 10 },
  },
  {
    id: 'shotgun.hazard', weapon: 'shotgun', name: 'HAZARD',
    colors: { main: 0xe0a818, stock: 0xe0a818, second: 0xe0a818, trim: 0x2a2c32, metal: 0x34373e, dark: 0x1e2026 },
    marks: [side(SR, 0, -0.055, 0.022, 0.12, 0x1a1a1e, 0.8), side(SR, 0, -0.005, 0.022, 0.12, 0x1a1a1e, 0.8), side(SS, -0.075, 0.27, 0.022, 0.12, 0x1a1a1e, 0.8), ...[-0.05, 0.01, 0.07].map((z) => top(SRT, 0, z, 0.13, 0.022, 0x1a1a1e, 0.7)), ...[0.2, 0.3].map((z) => top(SST, 0, z, 0.1, 0.022, 0x1a1a1e, 0.7))],
    swatch: [0xe0a818, 0x1a1a1e, 0x34373e], need: { stat: 'cleared', n: 1 },
  },
  {
    id: 'pistol.copperhead', weapon: 'pistol', name: 'COPPERHEAD',
    colors: { main: 0xd06a2a, second: 0x3a2a22, dark: 0x2e2018, accent: 0xd06a2a, trim: 0xb85a20 },
    marks: [
      ...[-0.1, -0.035, 0.03].map((z) => side(PS, 0, z, 0.055, 0.02, 0x4a2a18, 0.6, 'slide')),
      ...[-0.13, 0.05, 0.1].map((z) => top(PST, -0.008, z, 0.06, 0.018, 0x4a2a18, 0.6, 'slide')),
    ],
    swatch: [0xd06a2a, 0x4a2a18, 0x2e2018], need: { stat: 'headshots', n: 5 },
  },
  {
    id: 'smg.tigerByte', weapon: 'smg', name: 'TIGER BYTE',
    colors: { main: 0xe87a1c, second: 0xe87a1c, dark: 0x24242a, mag: 0xe8dcb8, accent: 0x24242a, stock: 0x24242a },
    marks: [...[-0.16, -0.08, 0.0, 0.08].map((z) => side(MB, -0.01, z, 0.09, 0.02, 0x24242a, 0.5)), side(MS, 0, -0.38, 0.08, 0.02, 0x24242a, 0.5), ...[-0.18, -0.1, -0.02, 0.06].map((z) => top(MBT, -0.04, z, 0.03, 0.02, 0x24242a, 0.5))],
    swatch: [0xe87a1c, 0x24242a, 0xe8dcb8], need: { stat: 'secrets', n: 1 },
  },
  {
    id: 'shotgun.crimson', weapon: 'shotgun', name: 'CRIMSON',
    colors: { main: 0xb01e28, stock: 0xb01e28, second: 0x3a3a40, trim: 0x26262a, metal: 0x2e3138, dark: 0x1e1e22 },
    marks: [side(SR, 0.01, -0.03, 0.03, 0.13, 0xe8e0c8, -0.7), side(SS, -0.07, 0.24, 0.025, 0.1, 0xe8e0c8, -0.7), top(SRT, 0, 0.0, 0.13, 0.03, 0xe8e0c8, -0.7), top(SST, 0, 0.26, 0.1, 0.025, 0xe8e0c8, -0.7)],
    swatch: [0xb01e28, 0xe8e0c8, 0x3a3a40], need: { stat: 'kills', n: 75 },
  },
  {
    id: 'pistol.blueSteel', weapon: 'pistol', name: 'BLUE STEEL',
    colors: { main: 0x26386a, second: 0x9aa0a8, dark: 0x1e2a50, accent: 0x8ab0e8, trim: 0x1e2c58 },
    marks: [side(PS, 0.005, -0.02, 0.01, 0.24, 0xc8ccd4, 0, 'slide'), top(PST, -0.03, -0.02, 0.01, 0.24, 0xc8ccd4, 0, 'slide')],
    swatch: [0x26386a, 0xc8ccd4, 0x9aa0a8], need: { stat: 'bashKills', n: 5 },
  },
  {
    id: 'rocket.demolition', weapon: 'rocket', name: 'DEMOLITION',
    colors: { main: 0xe8e6e0, second: 0x1e1e22, accent: 0xf06a1a, trim: 0x1e1e22, dark: 0x1e1e22 },
    marks: [side(RT, -0.035, -0.12, 0.06, 0.42, 0xf06a1a), side(RT - 0.001, 0.045, -0.22, 0.025, 0.08, 0x1e1e22, 0.6), side(RT - 0.001, 0.045, -0.12, 0.025, 0.08, 0x1e1e22, -0.6), top(RTT, 0.045, -0.15, 0.04, 0.5, 0xf06a1a), top(RTT, 0.01, -0.36, 0.12, 0.025, 0x1e1e22, 0.6), top(RTT, 0.01, -0.28, 0.12, 0.025, 0x1e1e22, -0.6)],
    swatch: [0xe8e6e0, 0xf06a1a, 0x1e1e22], need: { stat: 'cleared', n: 3 },
  },
  {
    id: 'arc.labPrototype', weapon: 'arc', name: 'LAB PROTOTYPE',
    colors: { main: 0xd8dce2, second: 0xd8dce2, trim: 0x9aa2ac, metal: 0x9aa2ac, dark: 0x2e3036, accent: 0x2a50c8 },
    marks: [side(AB, 0.01, -0.08, 0.04, 0.06, 0x2a50c8), side(AB, -0.035, 0.07, 0.03, 0.08, 0x2a50c8), top(0.087, 0, 0.06, 0.032, 0.04, 0xf07a1a), top(ABT, -0.035, -0.08, 0.035, 0.06, 0x2a50c8), top(ABT, 0.035, 0.07, 0.035, 0.05, 0x2a50c8)],
    swatch: [0xd8dce2, 0x2a50c8, 0x2e3036], need: { stat: 'kills', n: 150 },
  },
  {
    id: 'shotgun.arctic', weapon: 'shotgun', name: 'ARCTIC',
    colors: { main: 0xe4e6e8, stock: 0xe4e6e8, second: 0xd4d8dc, trim: 0x98a0aa, dark: 0x1c2a4a, metal: 0x2e3138 },
    marks: [side(SR, -0.022, 0.03, 0.016, 0.22, 0x3a7ad8), side(SS, -0.055, 0.24, 0.03, 0.04, 0xb8bcc2), side(SS, -0.095, 0.32, 0.025, 0.05, 0xb8bcc2), top(SRT, -0.035, 0.03, 0.016, 0.22, 0x3a7ad8), top(SST, -0.01, 0.24, 0.04, 0.06, 0xb8bcc2), top(SST, 0.015, 0.33, 0.03, 0.04, 0xb8bcc2)],
    swatch: [0xe4e6e8, 0x3a7ad8, 0x1c2a4a], need: { stat: 'reached', n: 4 },
  },
  {
    id: 'smg.metroRush', weapon: 'smg', name: 'METRO RUSH',
    colors: { main: 0x2a50c8, second: 0x30c8e0, dark: 0x22242a, accent: 0xe03a9a, stock: 0x22242a, mag: 0x22242a },
    marks: [side(MB, 0.005, -0.12, 0.03, 0.06, 0xe03a9a), side(MB, -0.03, 0.0, 0.03, 0.06, 0xe03a9a), top(MBT, -0.04, -0.12, 0.028, 0.06, 0xe03a9a), top(MBT, -0.04, 0.02, 0.028, 0.06, 0xe03a9a)],
    swatch: [0x2a50c8, 0xe03a9a, 0x30c8e0], need: { stat: 'headshots', n: 25 },
  },
  {
    id: 'rocket.orbital', weapon: 'rocket', name: 'ORBITAL',
    colors: { main: 0xeeeae2, second: 0x1a2240, accent: 0x2a50c8, trim: 0x1a2240, dark: 0x1a2240 },
    marks: [side(RT, 0.07, -0.15, 0.012, 0.6, 0xf07a1a), side(RT, -0.02, -0.25, 0.06, 0.08, 0x2a50c8), side(RT, -0.02, -0.05, 0.06, 0.08, 0x2a50c8), top(RTT, 0.06, -0.15, 0.014, 0.6, 0xf07a1a), top(RTT, 0.025, -0.32, 0.05, 0.08, 0x2a50c8), top(RTT, 0.025, 0.1, 0.05, 0.08, 0x2a50c8)],
    swatch: [0xeeeae2, 0x1a2240, 0xf07a1a], need: { stat: 'bosses', n: 1 },
  },
  {
    id: 'arc.aurora', weapon: 'arc', name: 'AURORA',
    colors: { main: 0x1c2448, second: 0x3a4a60, trim: 0x6a7484, metal: 0x4a5468, dark: 0x1c2448, accent: 0x2ab8a0 },
    marks: [side(AB, 0.0, -0.06, 0.03, 0.12, 0x2ab8a0, 0.3), side(AB, -0.035, 0.06, 0.03, 0.12, 0x7a5ab8, 0.3), top(ABT, -0.035, -0.06, 0.04, 0.12, 0x2ab8a0, 0.25), top(ABT, 0.035, 0.06, 0.04, 0.12, 0x7a5ab8, 0.25)],
    swatch: [0x1c2448, 0x2ab8a0, 0x7a5ab8], need: { stat: 'cleared', n: 5 },
  },
  {
    id: 'shotgun.digitalCamo', weapon: 'shotgun', name: 'DIGITAL CAMO',
    colors: { main: 0x5a6a34, stock: 0x5a6a34, second: 0x6a6a3a, trim: 0x2e3024, metal: 0x2e3138, dark: 0x24261e },
    marks: [
      side(SR, 0.03, -0.05, 0.04, 0.04, 0xc8b07a), side(SR, -0.03, -0.02, 0.035, 0.05, 0x2e3024),
      side(SS, -0.05, 0.22, 0.04, 0.05, 0xc8b07a), side(SS, -0.1, 0.31, 0.035, 0.05, 0x2e3024),
      side(SP, 0.02, -0.05, 0.035, 0.04, 0xc8b07a, 0, 'pump'),
      top(SRT, -0.025, -0.04, 0.045, 0.05, 0xc8b07a), top(SRT, 0.025, 0.06, 0.045, 0.06, 0x2e3024), top(SST, -0.015, 0.22, 0.04, 0.06, 0x2e3024), top(SST, 0.015, 0.32, 0.04, 0.05, 0xc8b07a), top(0.05, -0.03, 0.03, 0.04, 0.05, 0xc8b07a, 0, 'pump'),
    ],
    swatch: [0x5a6a34, 0xc8b07a, 0x2e3024], need: { stat: 'kills', n: 300 },
  },
  {
    id: 'smg.circuitRunner', weapon: 'smg', name: 'CIRCUIT RUNNER',
    colors: { main: 0x2a2c30, second: 0x3a3d44, dark: 0x222428, accent: 0xa8e020, stock: 0xa8e020, metal: 0x4a4e56, mag: 0x2a2c30 },
    marks: [side(MB, 0.02, -0.12, 0.012, 0.16, 0xa8e020), side(MB, -0.015, -0.04, 0.07, 0.012, 0xa8e020), side(MB, -0.045, 0.04, 0.012, 0.16, 0xa8e020), top(MBT, -0.042, -0.1, 0.012, 0.18, 0xa8e020), top(MBT, -0.035, 0.0, 0.026, 0.012, 0xa8e020)],
    swatch: [0x2a2c30, 0xa8e020, 0x3a3d44], need: { stat: 'secrets', n: 3 },
  },
  {
    id: 'pistol.roseQuartz', weapon: 'pistol', name: 'ROSE QUARTZ',
    colors: { main: 0xd88890, second: 0xe8dcc0, dark: 0x4a2232, accent: 0xf0c8b8, trim: 0xc87880 },
    marks: [side(PS, 0.004, -0.05, 0.03, 0.03, 0xf2d0d0, 0.785, 'slide'), side(PS, 0.004, 0.0, 0.02, 0.02, 0xf2d0d0, 0.785, 'slide'), top(PST, -0.015, -0.11, 0.025, 0.025, 0xf2d0d0, 0.785, 'slide'), top(PST, -0.015, 0.08, 0.02, 0.02, 0xf2d0d0, 0.785, 'slide')],
    swatch: [0xd88890, 0xf2d0d0, 0x4a2232], need: { stat: 'bashKills', n: 25 },
  },
  {
    id: 'rocket.rustTitan', weapon: 'rocket', name: 'RUST TITAN',
    colors: { main: 0x8a4a28, second: 0x5a5a32, accent: 0x6a3a1e, trim: 0xd8c8a0, dark: 0x3a2a1e },
    marks: [side(RT, 0.05, -0.25, 0.03, 0.04, 0x8a8a8a), side(RT, -0.02, 0.0, 0.025, 0.05, 0x8a8a8a), side(RT, 0.0, -0.1, 0.05, 0.1, 0xd8c8a0), top(RTT, 0.035, -0.3, 0.045, 0.05, 0x8a8a8a), top(RTT, 0.03, 0.06, 0.05, 0.08, 0xd8c8a0), top(RTT, -0.03, -0.42, 0.04, 0.04, 0x8a8a8a)],
    swatch: [0x8a4a28, 0xd8c8a0, 0x5a5a32], need: { stat: 'sRanks', n: 1 },
  },
  {
    id: 'arc.solarArray', weapon: 'arc', name: 'SOLAR ARRAY',
    colors: { main: 0xe8dcc0, second: 0x8a5a32, trim: 0x8a5a32, metal: 0x8a5a32, dark: 0x3a2418, accent: 0xc89a30 },
    marks: [
      side(AB, -0.01, 0.0, 0.08, 0.16, 0xc89a30),
      ...[-0.03, 0.01].flatMap((y) => [-0.045, 0.0, 0.045].map((z) => side(AB - 0.002, y, z, 0.022, 0.035, 0x3a2418))),
      top(ABT, -0.035, 0.0, 0.04, 0.16, 0xc89a30), ...[-0.05, 0.0, 0.05].map((z) => top(ABT + 0.001, -0.035, z, 0.018, 0.03, 0x3a2418)),
    ],
    swatch: [0xe8dcc0, 0xc89a30, 0x3a2418], need: { stat: 'reached', n: 8 },
  },
  {
    id: 'shotgun.geothermal', weapon: 'shotgun', name: 'GEOTHERMAL',
    colors: { main: 0x3a3a3e, stock: 0x3a3a3e, second: 0xd0581c, trim: 0x7a300e, metal: 0x2e3036, dark: 0x1e1e22 },
    marks: [side(SR, 0, -0.04, 0.025, 0.12, 0xe8701c, 0.7), side(SS, -0.075, 0.27, 0.03, 0.2, 0xe8701c, 0.5), top(SRT, 0, 0.0, 0.13, 0.025, 0xe8701c, 0.6), top(SRT, 0, 0.08, 0.13, 0.02, 0xe8701c, 0.6), top(SST, 0, 0.26, 0.1, 0.03, 0xe8701c, 0.5)],
    swatch: [0x3a3a3e, 0xe8701c, 0x7a300e], need: { stat: 'kills', n: 600 },
  },
  {
    id: 'smg.carbonPulse', weapon: 'smg', name: 'CARBON PULSE',
    colors: { main: 0x2e2638, second: 0x3a3a44, dark: 0x1e1a24, mag: 0x3a2a4a, accent: 0xf0605a, stock: 0x3a2a4a },
    marks: [side(MB, -0.01, -0.14, 0.012, 0.06, 0xf0605a), side(MB, 0.01, -0.105, 0.05, 0.012, 0xf0605a), side(MB, -0.025, -0.08, 0.04, 0.012, 0xf0605a), side(MB, -0.01, -0.02, 0.012, 0.1, 0xf0605a), top(MBT, -0.042, -0.1, 0.012, 0.08, 0xf0605a), top(MBT, -0.036, -0.055, 0.024, 0.012, 0xf0605a), top(MBT, -0.042, 0.0, 0.012, 0.1, 0xf0605a)],
    swatch: [0x2e2638, 0xf0605a, 0x3a3a44], need: { stat: 'sRanks', n: 5 },
  },
  {
    id: 'rocket.siegeEngine', weapon: 'rocket', name: 'SIEGE ENGINE',
    colors: { main: 0x3c4048, second: 0x6a1e22, accent: 0xb08040, trim: 0x6a1e22, dark: 0x24262c },
    marks: [side(RT, 0.02, -0.15, 0.1, 0.14, 0x6a1e22), ...[-0.01, 0.02, 0.05].map((y) => side(RT - 0.001, y, 0.08, 0.01, 0.06, 0xb08040)), top(RTT, 0.0, -0.3, 0.17, 0.12, 0x6a1e22), ...[0.05, 0.09, 0.13].map((z) => top(RTT, 0.04, z, 0.06, 0.012, 0xb08040))],
    swatch: [0x3c4048, 0x6a1e22, 0xb08040], need: { stat: 'reached', n: 10 },
  },
  {
    id: 'arc.voidSignal', weapon: 'arc', name: 'VOID SIGNAL',
    colors: { main: 0x2a1e3a, second: 0xb8a8e0, trim: 0x24242a, metal: 0x3a3048, dark: 0x24242a, accent: 0xf03a9a },
    marks: [side(AB, 0.02, -0.1, 0.012, 0.06, 0xf03a9a), side(AB, 0.0, -0.02, 0.012, 0.1, 0xf03a9a), side(AB, -0.03, 0.08, 0.012, 0.05, 0xf03a9a), ...[-0.1, -0.05, 0.03].map((z, i) => top(ABT, -0.035, z, 0.035, i === 1 ? 0.02 : 0.012, 0xf03a9a))],
    swatch: [0x2a1e3a, 0xf03a9a, 0xb8a8e0], need: { stat: 'bosses', n: 3 },
  },
  {
    id: 'shotgun.obsidianGold', weapon: 'shotgun', name: 'OBSIDIAN GOLD',
    colors: { main: 0x24242a, stock: 0x24242a, second: 0x24242a, trim: 0x141418, metal: 0x26262c, dark: 0x18181c },
    marks: [top(0.062, 0, 0.03, 0.1, 0.2, 0xd8a830), side(SS, -0.075, 0.2, 0.12, 0.03, 0xd8a830), side(SR, 0.05, 0.03, 0.012, 0.22, 0xd8a830), top(SST, 0, 0.2, 0.09, 0.03, 0xd8a830)],
    swatch: [0x24242a, 0xd8a830, 0x141418], need: { stat: 'reached', n: 15 },
  },
];

export const SKIN_BY_ID = new Map(SKINS.map((s) => [s.id, s]));

/** the factory paint, for the Armory's STANDARD chip */
export const STANDARD_SWATCH: Record<WeaponId, [number, number, number]> = {
  pistol: [0x566076, 0x3c4252, 0xffd028],
  shotgun: [0x3c4252, 0x8a5a32, 0x6e4626],
  smg: [0x4a5162, 0x353a47, 0xffd028],
  rocket: [0x56784e, 0xffd028, 0x2e3e2e],
  arc: [0x3e4858, 0x34d0ff, 0xffd028],
  special: [0x566076, 0xa5dc66, 0x24242a],
};

export function hexCss(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

/** a three-band colour chip (HTML) */
export function swatchHtml(colors: readonly number[]): string {
  return `<span class="sw">${colors.map((c) => `<i style="background:${hexCss(c)}"></i>`).join('')}</span>`;
}

/** the goal in words: "10 KILLS", "CLEAR SECTOR 1", "REACH THE BIOFOUNDRY" */
export function needText(s: SkinDef): string {
  const { stat, n } = s.need;
  switch (stat) {
    case 'kills': return `${n} KILLS`;
    case 'headshots': return `${n} HEADSHOTS`;
    case 'bashKills': return `${n} BASH KILLS`;
    case 'secrets': return n === 1 ? 'FIND A SECRET' : `${n} SECRETS`;
    case 'cleared': return `CLEAR SECTOR ${n}`;
    case 'reached': return n === 4 ? 'REACH THE BIOFOUNDRY' : `REACH DEPTH ${n}`;
    case 'bosses': return n === 1 ? 'KILL THE BROODKEEPER' : `${n} BOSS KILLS`;
    case 'sRanks': return n === 1 ? 'AN S RANK' : `${n} S RANKS`;
  }
}

/** lifetime numbers the goals count (kept on the device) */
export interface SkinStats {
  kills: number; headshots: number; bashKills: number; secrets: number;
  /** highest sector / depth cleared, and reached */
  cleared: number; reached: number;
  bosses: number; sRanks: number;
}

const KEY = 'voxelstrike-skins';

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, '0')}`;
}

export function swatchCss(s: SkinDef): string[] {
  return s.swatch.map(hex);
}

/** unlocks + what is equipped on each gun */
export class SkinBook {
  stats: SkinStats = { kills: 0, headshots: 0, bashKills: 0, secrets: 0, cleared: 0, reached: 0, bosses: 0, sRanks: 0 };
  unlocked = new Set<string>();
  /** weapon → skin id ('' = standard) */
  equipped: Partial<Record<WeaponId, string>> = {};

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object') {
        for (const k of Object.keys(this.stats) as SkinStat[]) {
          const v = Number(raw.stats?.[k]);
          if (Number.isFinite(v) && v > 0) this.stats[k] = Math.floor(v);
        }
        for (const id of raw.unlocked ?? []) if (SKIN_BY_ID.has(id)) this.unlocked.add(id);
        for (const [w, id] of Object.entries(raw.equipped ?? {})) {
          const s = SKIN_BY_ID.get(id as string);
          if (s && s.weapon === w && this.unlocked.has(s.id)) this.equipped[w as WeaponId] = s.id;
        }
      }
    } catch { /* storage unavailable or corrupt: start fresh */ }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify({ v: 1, stats: this.stats, unlocked: [...this.unlocked], equipped: this.equipped }));
    } catch { /* storage may be unavailable */ }
  }

  progress(s: SkinDef): number {
    return Math.min(s.need.n, this.stats[s.need.stat]);
  }

  /** the first still-locked skin in unlock order (null when all are owned) */
  next(): SkinDef | null {
    return SKINS.find((s) => !this.unlocked.has(s.id)) ?? null;
  }

  /**
   * Count something; returns the skins that just unlocked (already equipped).
   * `max` stats (cleared / reached) keep the highest value instead of adding.
   */
  add(stat: SkinStat, amount = 1): SkinDef[] {
    if (stat === 'cleared' || stat === 'reached') {
      if (amount <= this.stats[stat]) return [];
      this.stats[stat] = amount;
    } else {
      this.stats[stat] += amount;
    }
    const fresh: SkinDef[] = [];
    for (const s of SKINS) {
      if (this.unlocked.has(s.id) || this.stats[s.need.stat] < s.need.n) continue;
      this.unlocked.add(s.id);
      this.equipped[s.weapon] = s.id; // a new paint goes straight onto the gun
      fresh.push(s);
    }
    this.save();
    return fresh;
  }

  /** unlock one skin outright (a watched rewarded video) and put it on */
  grant(id: string): SkinDef | null {
    const s = SKIN_BY_ID.get(id);
    if (!s) return null;
    this.unlocked.add(s.id);
    this.equipped[s.weapon] = s.id;
    this.save();
    return s;
  }

  equip(weapon: WeaponId, id: string): void {
    if (id && !this.unlocked.has(id)) return;
    this.equipped[weapon] = id;
    this.save();
  }

  skinFor(weapon: WeaponId): SkinDef | null {
    const id = this.equipped[weapon];
    return id ? SKIN_BY_ID.get(id) ?? null : null;
  }
}
