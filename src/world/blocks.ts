import * as THREE from 'three';

/** Block type ids stored in the voxel grid. */
export const enum Block {
  Air = 0,
  Rock = 1,
  Wall = 2,
  Floor = 3,
  Ceil = 4,
  Metal = 5,
  Trim = 6,
  LampWarm = 7,
  LampRed = 8,
  LampTeal = 9,
  LampGreen = 10,
  Crate = 11,
  Cracked = 12,
  ExitPad = 13,
  Pillar = 14,
  Barrel = 15,
  // cosmetic wall/ceiling variants — same physics as Wall/Ceil. Append-only:
  // tests and saves rely on the ids above staying stable.
  WallRust = 16,
  WallVent = 17,
  WallPipes = 18,
  WallWorn = 19,
  CeilPipes = 20, // pipes running along world X
  CeilVent = 21,
  Chain = 22,
  CeilPipesZ = 23, // pipes running along world Z (rotated tile)
  // Biofoundry (sector 4 preview) set — append-only like everything above.
  LabFloor = 24, // one big tile per block, wide grout
  LabCeil = 25, // near-black panelled ceiling
  LabWall = 26, // one concrete panel per block, four rivets
  LabWallRust = 27, // same, with rust runs from the top rivets
  LampViolet = 28, // magenta emergency panel (emits)
  TankGlass = 29, // specimen tank volume: solid + emits green, never meshed (shell is decoration)
  LabCeilGrate = 30, // square extraction grate in the ceiling
  PowerBarrier = 31, // invisible collision behind the preview's animated supply cage
  GeothermalHeat = 32,
  Basalt = 33,
  ServiceWall = 34,
  ServiceWallRust = 35,
  ServiceFloor = 36,
  ServiceCeil = 37,
  ServiceLampWarm = 38,
  ServiceLampGreen = 39,
  // Additional environments; persisted ids remain append-only.
  FreightWall = 40,
  FreightFloor = 41,
  FreightCargo = 42,
  FreightLamp = 43,
  ExcavationWall = 44,
  ExcavationFloor = 45,
  ExcavationSupport = 46,
  ExcavationLamp = 47,
  MedicalWall = 48,
  MedicalFloor = 49,
  MedicalCabinet = 50,
  MedicalCeil = 51,
  MedicalLamp = 52,
  MedicalWallLower = 53,
  // Freight Depot, after reference/new-sector-mockups/freight-depot.png
  FreightCargoRed = 54, // rust-red corrugated container side
  FreightGrate = 55, // dark floor grating (the loading track)
  FreightHazardFloor = 56, // hazard-striped floor edge (Trim on every face)
  // Build 2: Facility Entry's cool office light (drawn with the white troffer tile)
  LampCool = 57,
  // Build 2: Security Floor's blue-white and Reactor Access's orange ceiling light
  LampIce = 58,
  LampOrange = 59,
}

export const BLOCK_COUNT = 60;

/** Which lamp blocks emit light, and their color (0-255 per channel). */
export const LAMP_COLORS: Partial<Record<Block, [number, number, number]>> = {
  [Block.FreightLamp]: [255, 202, 128],
  [Block.ExcavationLamp]: [255, 184, 108],
  [Block.MedicalLamp]: [255, 248, 228],
  [Block.GeothermalHeat]: [255, 108, 28],
  [Block.LampWarm]: [255, 214, 150],
  [Block.ServiceLampWarm]: [255, 225, 185],
  [Block.ServiceLampGreen]: [90, 220, 120],
  [Block.LampRed]: [255, 64, 40],
  [Block.LampTeal]: [70, 205, 255],
  [Block.LampGreen]: [90, 255, 120],
  [Block.ExitPad]: [60, 200, 90],
  [Block.LampViolet]: [205, 90, 255],
  [Block.LampCool]: [190, 218, 255],
  [Block.LampIce]: [150, 196, 255],
  // a muted orange: the props' heat slots carry the saturated colour, the
  // room keeps enough grey wall to stay Facility (PROPS.md)
  [Block.LampOrange]: [236, 168, 120],
  // the glass faces are lit by their own flood, so this sets the liquid's
  // brightness as much as the room's green tint — keep it mild
  [Block.TankGlass]: [125, 190, 85],
};

export function isDestructible(b: Block): boolean {
  return b === Block.Crate || b === Block.Cracked || b === Block.Barrel;
}

export function blockHP(b: Block): number {
  if (b === Block.Crate) return 18;
  if (b === Block.Cracked) return 45;
  if (b === Block.Barrel) return 12;
  return Infinity;
}

// ---------------------------------------------------------------------------
// Procedural texture atlas: 8x8 grid of 16x16 tiles generated on a canvas.
// ---------------------------------------------------------------------------

export const ATLAS_TILES = 8; // tiles per row/col
export const TILE_PX = 16;

// Tile indices in the atlas
export const enum Tile {
  Rock = 0,
  Wall = 1,
  Floor = 2,
  Ceil = 3,
  LampWarm = 4,
  LampRed = 5,
  LampTeal = 6,
  LampGreen = 7,
  Crate = 8,
  CrateTop = 9,
  Cracked = 10,
  Trim = 11,
  Metal = 12,
  ExitPad = 13,
  Pillar = 14,
  RockTop = 15,
  Barrel = 16,
  BarrelTop = 17,
  WallRust = 18,
  WallVent = 19,
  WallPipes = 20,
  WallWorn = 21,
  CeilPipes = 22,
  CeilVent = 23,
  Chain = 24,
  CeilPipesZ = 25,
  LabFloor = 26,
  LabCeil = 27,
  LabWall = 28,
  LabWallRust = 29,
  LampViolet = 30,
  TankGlass = 31,
  LabCeilGrate = 32,
  GeothermalHeat = 33,
  Basalt = 34,
  ServiceWall = 35,
  ServiceWallRust = 36,
  ServiceFloor = 37,
  ServiceCeil = 38,
  ServiceLampWarm = 39,
  ServiceLampGreen = 40,
  FreightWall = 41,
  FreightFloor = 42,
  FreightCargo = 43,
  FreightLamp = 44,
  ExcavationWall = 45,
  ExcavationFloor = 46,
  ExcavationSupport = 47,
  ExcavationLamp = 48,
  MedicalWall = 49,
  MedicalFloor = 50,
  MedicalCabinet = 51,
  MedicalCeil = 52,
  MedicalLamp = 53,
  MedicalWallLower = 54,
  FreightCargoRed = 55,
  FreightCeil = 56,
  FreightGrate = 57,
  FreightHazard = 58,
}

export const TILE_COUNT = 59;

/** Face dirs: 0:+x 1:-x 2:+y(top) 3:-y(bottom) 4:+z 5:-z */
export function tileFor(block: Block, dir: number): Tile {
  const top = dir === 2;
  const bottom = dir === 3;
  switch (block) {
    case Block.FreightWall: return bottom ? Tile.FreightCeil : Tile.FreightWall;
    case Block.FreightCargoRed: return Tile.FreightCargoRed;
    case Block.FreightGrate: return Tile.FreightGrate;
    case Block.FreightHazardFloor: return top ? Tile.FreightHazard : Tile.Trim;
    case Block.FreightFloor: return Tile.FreightFloor;
    case Block.FreightCargo: return Tile.FreightCargo;
    case Block.FreightLamp: return Tile.FreightLamp;
    case Block.ExcavationWall: return Tile.ExcavationWall;
    case Block.ExcavationFloor: return Tile.ExcavationFloor;
    case Block.ExcavationSupport: return Tile.ExcavationSupport;
    case Block.ExcavationLamp: return Tile.ExcavationLamp;
    case Block.MedicalWall: return Tile.MedicalWall;
    case Block.MedicalFloor: return Tile.MedicalFloor;
    case Block.MedicalCabinet: return Tile.MedicalCabinet;
    case Block.MedicalCeil: return Tile.MedicalCeil;
    case Block.MedicalLamp: return Tile.MedicalLamp;
    case Block.LampCool: return Tile.MedicalLamp;
    case Block.LampIce: return Tile.MedicalLamp;
    case Block.LampOrange: return Tile.LampWarm;
    case Block.MedicalWallLower: return Tile.MedicalWallLower;

    case Block.ServiceLampWarm: return Tile.ServiceLampWarm;
    case Block.ServiceLampGreen: return Tile.ServiceLampGreen;
    case Block.ServiceWall:
      return top ? Tile.ServiceFloor : bottom ? Tile.ServiceCeil : Tile.ServiceWall;
    case Block.ServiceWallRust:
      return top ? Tile.ServiceFloor : bottom ? Tile.ServiceCeil : Tile.ServiceWallRust;
    case Block.ServiceFloor:
      return top ? Tile.ServiceFloor : Tile.ServiceWall;
    case Block.ServiceCeil:
      return bottom ? Tile.ServiceCeil : Tile.ServiceWall;
    case Block.GeothermalHeat: return Tile.GeothermalHeat;
    case Block.Basalt: return Tile.Basalt;
    case Block.Rock:
      return top ? Tile.RockTop : bottom ? Tile.Ceil : Tile.Rock;
    case Block.Wall:
      return top ? Tile.RockTop : bottom ? Tile.Ceil : Tile.Wall;
    case Block.Floor:
      return top ? Tile.Floor : Tile.Rock;
    case Block.Ceil:
      return bottom ? Tile.Ceil : Tile.Rock;
    case Block.Metal:
      return Tile.Metal;
    case Block.Trim:
      return top || bottom ? Tile.Metal : Tile.Trim;
    case Block.LampWarm:
      return Tile.LampWarm;
    case Block.LampRed:
      return Tile.LampRed;
    case Block.LampTeal:
      return Tile.LampTeal;
    case Block.LampGreen:
      return Tile.LampGreen;
    case Block.Crate:
      return top || bottom ? Tile.CrateTop : Tile.Crate;
    case Block.Cracked:
      return top || bottom ? Tile.Ceil : Tile.Cracked;
    case Block.ExitPad:
      return top ? Tile.ExitPad : Tile.Metal;
    case Block.Pillar:
      return top || bottom ? Tile.Metal : Tile.Pillar;
    case Block.Barrel:
      return top || bottom ? Tile.BarrelTop : Tile.Barrel;
    case Block.WallRust:
      return top ? Tile.RockTop : bottom ? Tile.Ceil : Tile.WallRust;
    case Block.WallVent:
      return top ? Tile.RockTop : bottom ? Tile.Ceil : Tile.WallVent;
    case Block.WallPipes:
      return top ? Tile.RockTop : bottom ? Tile.Ceil : Tile.WallPipes;
    case Block.WallWorn:
      return top ? Tile.RockTop : bottom ? Tile.Ceil : Tile.WallWorn;
    case Block.CeilPipes:
      return bottom ? Tile.CeilPipes : Tile.Rock;
    case Block.CeilPipesZ:
      return bottom ? Tile.CeilPipesZ : Tile.Rock;
    case Block.CeilVent:
      return bottom ? Tile.CeilVent : Tile.Rock;
    case Block.Chain:
      return top || bottom ? Tile.Metal : Tile.Chain;
    case Block.LabFloor:
      return top ? Tile.LabFloor : Tile.Rock;
    case Block.LabCeil:
      return bottom ? Tile.LabCeil : Tile.Rock;
    case Block.LabCeilGrate:
      return bottom ? Tile.LabCeilGrate : Tile.Rock;
    case Block.LabWall:
      return top ? Tile.RockTop : bottom ? Tile.LabCeil : Tile.LabWall;
    case Block.LabWallRust:
      return top ? Tile.RockTop : bottom ? Tile.LabCeil : Tile.LabWallRust;
    case Block.LampViolet:
      return Tile.LampViolet;
    case Block.TankGlass:
      return Tile.TankGlass;
    default:
      return Tile.Rock;
  }
}

type Ctx2D = CanvasRenderingContext2D;

function px(ctx: Ctx2D, ox: number, oy: number, x: number, y: number, c: string): void {
  ctx.fillStyle = c;
  ctx.fillRect(ox + x, oy + y, 1, 1);
}

/** Small deterministic hash noise for texture generation. */
function hnoise(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function shade(base: [number, number, number], f: number): string {
  const r = Math.max(0, Math.min(255, Math.round(base[0] * f)));
  const g = Math.max(0, Math.min(255, Math.round(base[1] * f)));
  const b = Math.max(0, Math.min(255, Math.round(base[2] * f)));
  return `rgb(${r},${g},${b})`;
}

function fillNoise(
  ctx: Ctx2D,
  ox: number,
  oy: number,
  base: [number, number, number],
  amp: number,
  seed: number
): void {
  for (let y = 0; y < TILE_PX; y++) {
    for (let x = 0; x < TILE_PX; x++) {
      const n = 1 - amp / 2 + hnoise(x, y, seed) * amp;
      px(ctx, ox, oy, x, y, shade(base, n));
    }
  }
}

function drawTile(ctx: Ctx2D, tile: Tile): void {
  const ox = (tile % ATLAS_TILES) * TILE_PX;
  const oy = Math.floor(tile / ATLAS_TILES) * TILE_PX;
  switch (tile) {
    case Tile.FreightWall: {
      // grey riveted plate, one panel per block: lit top/left edge, dark
      // bottom/right seam, corner rivets and a few rust specks (the mockup)
      fillNoise(ctx, ox, oy, [124, 129, 136], 0.14, 801);
      for (let i = 0; i < 16; i++) {
        px(ctx, ox, oy, i, 0, '#8f959c');
        px(ctx, ox, oy, i, 15, '#686e76'); px(ctx, ox, oy, 15, i, '#71777f');
      }
      for (const x of [2, 13]) for (const y of [2, 13]) { px(ctx, ox, oy, x, y, '#45494d'); px(ctx, ox, oy, x - 1, y - 1, '#c4c7ca'); }
      for (let i = 0; i < 5; i++) {
        const x = 1 + Math.floor(hnoise(i, 3, 804) * 14), y = 1 + Math.floor(hnoise(i, 4, 804) * 14);
        px(ctx, ox, oy, x, y, i % 3 ? '#9a5a32' : '#b8703c');
        if (i % 2) px(ctx, ox, oy, x, Math.min(14, y + 1), '#7e4a2c');
      }
      break;
    }
    case Tile.FreightCeil: {
      // ceiling panels: darker grey, a heavy grid seam
      fillNoise(ctx, ox, oy, [96, 100, 106], 0.14, 805);
      for (let i = 0; i < 16; i++) for (const t of [0, 1]) { px(ctx, ox, oy, i, t, '#3b3f45'); px(ctx, ox, oy, t, i, '#3b3f45'); }
      for (const x of [3, 12]) for (const y of [3, 12]) px(ctx, ox, oy, x, y, '#5a5f66');
      break;
    }
    case Tile.FreightCargo:
    case Tile.FreightCargoRed: {
      // corrugated container side: a rib every 4 px (light crest, dark trough), grime
      const red = tile === Tile.FreightCargoRed;
      const base: [number, number, number] = red ? [146, 70, 44] : [66, 94, 128];
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const rib = [1.18, 1.0, 0.82, 0.62][x % 4];
        const n = 0.92 + hnoise(x, y, red ? 806 : 807) * 0.16 - (y > 12 ? 0.08 : 0);
        px(ctx, ox, oy, x, y, shade(base, rib * n));
      }
      for (let i = 0; i < 5; i++) {
        const x = Math.floor(hnoise(i, 7, 808) * 16), y = Math.floor(hnoise(i, 8, 808) * 16);
        px(ctx, ox, oy, x, y, red ? '#6e3a24' : '#8a6a48');
      }
      break;
    }
    case Tile.FreightFloor: {
      // concrete floor tile: grey, speckled, dark seams on two edges
      fillNoise(ctx, ox, oy, [128, 128, 126], 0.18, 802);
      for (let i = 0; i < 16; i++) { px(ctx, ox, oy, i, 0, '#646462'); px(ctx, ox, oy, 0, i, '#646462'); }
      for (let i = 0; i < 12; i++) {
        const x = 1 + Math.floor(hnoise(i, 5, 809) * 15), y = 1 + Math.floor(hnoise(i, 6, 809) * 15);
        px(ctx, ox, oy, x, y, i % 4 ? '#8c877d' : '#9a6a44');
      }
      break;
    }
    case Tile.FreightHazard: {
      // concrete with a narrow hazard band down the middle: the edge line of the loading track
      fillNoise(ctx, ox, oy, [128, 128, 126], 0.18, 811);
      for (let y = 0; y < 16; y++) for (let x = 5; x < 11; x++) {
        const s = Math.floor((x + y) / 3) % 2 === 0;
        px(ctx, ox, oy, x, y, s ? shade([214, 170, 34], 0.9 + hnoise(x, y, 812) * 0.2) : shade([34, 34, 38], 1));
      }
      for (let i = 0; i < 16; i++) px(ctx, ox, oy, i, 0, '#646462');
      break;
    }
    case Tile.FreightGrate: {
      // floor grating: dark slots between steel bars, a rim
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const bar = y % 3 === 0 || x === 0 || x === 15;
        px(ctx, ox, oy, x, y, bar ? shade([92, 96, 102], 0.9 + hnoise(x, y, 810) * 0.2) : shade([22, 24, 28], 1));
      }
      break;
    }
    case Tile.ExcavationWall: {
      // dark basalt cut into big blocky chunks (4 px cells, each its own
      // shade, lit top edge), a couple of amber ore flecks — the mockup's rock
      for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
        const cx = x >> 2, cy = y >> 2;
        const cell = 0.72 + hnoise(cx, cy, 814) * 0.5;
        const edge = (y & 3) === 0 ? 1.18 : (x & 3) === 3 ? 0.82 : 1;
        px(ctx, ox, oy, x, y, shade([64, 68, 76], cell * edge * (0.94 + hnoise(x, y, 811) * 0.12)));
      }
      // one small ore fleck (every block repeats it, so keep it rare and dull)
      px(ctx, ox, oy, 11, 6, '#b48a48'); px(ctx, ox, oy, 12, 6, '#6e5634');
      break;
    }
    case Tile.ExcavationFloor: {
      // dark steel floor plate: one panel per block, a lit edge, dark seams, scuffs
      fillNoise(ctx, ox, oy, [88, 90, 95], 0.14, 816);
      for (let i = 0; i < 16; i++) {
        px(ctx, ox, oy, i, 0, '#34373c'); px(ctx, ox, oy, 0, i, '#34373c');
        px(ctx, ox, oy, i, 1, '#70737a'); px(ctx, ox, oy, 1, i, '#70737a');
      }
      for (let i = 0; i < 6; i++) {
        const x = 2 + Math.floor(hnoise(i, 3, 817) * 13), y = 2 + Math.floor(hnoise(i, 4, 817) * 13);
        px(ctx, ox, oy, x, y, '#6a6d73');
      }
      break;
    }
    case Tile.ExcavationSupport: {
      // black steel lattice: a frame and an X brace
      fillNoise(ctx, ox, oy, [30, 32, 36], 0.2, 813);
      for (let i = 0; i < 16; i++) {
        for (const t of [0, 15]) { px(ctx, ox, oy, i, t, '#5a5f66'); px(ctx, ox, oy, t, i, '#5a5f66'); }
        px(ctx, ox, oy, i, i, '#6a7078'); px(ctx, ox, oy, 15 - i, i, '#6a7078');
      }
      break;
    }
    case Tile.MedicalWall:
    case Tile.MedicalWallLower: {
      // glazed tiles, four per block with grout; cream above, teal below (the
      // mockup's ward walls), a few rust spots
      const lower = tile === Tile.MedicalWallLower;
      fillNoise(ctx, ox, oy, lower ? [96, 152, 142] : [204, 198, 182], 0.1, lower ? 825 : 821);
      // cream: one big tile per block; teal: four small ones
      for (let i = 0; i < 16; i++) for (const t of lower ? [0, 8] : [0]) {
        px(ctx, ox, oy, i, t, lower ? '#5a8a82' : '#a8a292'); px(ctx, ox, oy, t, i, lower ? '#5a8a82' : '#a8a292');
      }
      for (const [x, y] of lower ? [[2, 2], [10, 2], [2, 10], [10, 10]] : [[2, 2]]) px(ctx, ox, oy, x, y, lower ? '#b6e0d8' : '#eae6d8');
      for (let i = 0; i < 2; i++) {
        const x = 1 + Math.floor(hnoise(i, 1, 823) * 14), y = 1 + Math.floor(hnoise(i, 2, 824) * 14);
        px(ctx, ox, oy, x, y, '#a0603a'); if (i % 2) px(ctx, ox, oy, x, Math.min(15, y + 1), '#b8784a');
      }
      break;
    }
    case Tile.MedicalFloor: {
      // big beige floor tile, dark grout on two edges, worn rust flecks
      fillNoise(ctx, ox, oy, [188, 180, 162], 0.12, 826);
      for (let i = 0; i < 16; i++) { px(ctx, ox, oy, i, 0, '#5e5a52'); px(ctx, ox, oy, 0, i, '#5e5a52'); }
      for (let i = 0; i < 5; i++) {
        const x = 2 + Math.floor(hnoise(i, 3, 827) * 13), y = 2 + Math.floor(hnoise(i, 4, 827) * 13);
        px(ctx, ox, oy, x, y, i % 2 ? '#a06a42' : '#9a907c');
      }
      break;
    }
    case Tile.MedicalCeil: {
      // ceiling panel: pale, a dark T-bar grid
      fillNoise(ctx, ox, oy, [184, 180, 168], 0.1, 828);
      for (let i = 0; i < 16; i++) { px(ctx, ox, oy, i, 0, '#4a4c4e'); px(ctx, ox, oy, 0, i, '#4a4c4e'); px(ctx, ox, oy, i, 1, '#8a8780'); }
      break;
    }
    case Tile.MedicalCabinet: {
      // white steel cabinet front: a door split, a handle, a kick plate
      fillNoise(ctx, ox, oy, [206, 208, 204], 0.08, 829);
      for (let i = 0; i < 16; i++) { px(ctx, ox, oy, 0, i, '#8a8e8c'); px(ctx, ox, oy, 15, i, '#8a8e8c'); px(ctx, ox, oy, 8, i, '#9a9e9c'); }
      for (let x = 0; x < 16; x++) for (const y of [14, 15]) px(ctx, ox, oy, x, y, '#5a5e5e');
      for (const y of [6, 7, 8]) { px(ctx, ox, oy, 6, y, '#5a5e5e'); px(ctx, ox, oy, 10, y, '#5a5e5e'); }
      break;
    }
    case Tile.FreightLamp: {
      // the mockup's square ceiling lamp: a dark steel frame round a bright warm panel
      fillNoise(ctx, ox, oy, [52, 54, 58], 0.2, 832);
      ctx.fillStyle = '#ffd890'; ctx.fillRect(ox + 2, oy + 2, 12, 12);
      ctx.fillStyle = '#fff2c8'; ctx.fillRect(ox + 4, oy + 4, 8, 8);
      break;
    }
    case Tile.ExcavationLamp: {
      // small square work lamp, orange glass in a dark cage
      fillNoise(ctx, ox, oy, [40, 42, 46], 0.2, 831);
      ctx.fillStyle = '#ffb060'; ctx.fillRect(ox + 3, oy + 3, 10, 10);
      ctx.fillStyle = '#ffe2a8'; ctx.fillRect(ox + 5, oy + 5, 6, 6);
      ctx.fillStyle = '#40444a'; ctx.fillRect(ox + 3, oy + 7, 10, 1); ctx.fillRect(ox + 7, oy + 3, 1, 10);
      break;
    }
    case Tile.MedicalLamp: {
      // fluorescent troffer: a white diffuser in a grey frame
      fillNoise(ctx, ox, oy, [96, 98, 98], 0.1, 833);
      ctx.fillStyle = '#f4f2e6'; ctx.fillRect(ox + 1, oy + 3, 14, 10);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(ox + 2, oy + 5, 12, 2); ctx.fillRect(ox + 2, oy + 9, 12, 2);
      break;
    }

    case Tile.ServiceLampWarm:
    case Tile.ServiceLampGreen: {
      fillNoise(ctx, ox, oy, [39, 43, 47], .25, 731);
      ctx.fillStyle = '#1c211f'; ctx.fillRect(ox + 3, oy + 5, 10, 6);
      ctx.fillStyle = '#817a62'; ctx.fillRect(ox + 4, oy + 5, 8, 5);
      ctx.fillStyle = tile === Tile.ServiceLampWarm ? '#ffbc46' : '#2cb34c';
      ctx.fillRect(ox + 5, oy + 6, 6, 3);
      ctx.fillStyle = tile === Tile.ServiceLampWarm ? '#fff0ad' : '#72ff96';
      ctx.fillRect(ox + 5, oy + 6, 6, 2);
      break;
    }
    case Tile.ServiceWall:
    case Tile.ServiceWallRust: {
      // One large, riveted steel panel per metre, matching the exit-lift reference.
      fillNoise(ctx, ox, oy, [84, 92, 102], .25, 701);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, '#282a27'); px(ctx, ox, oy, 0, i, '#282a27');
        px(ctx, ox, oy, i, 15, '#737a81'); px(ctx, ox, oy, 15, i, '#737a81');
      }
      for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) {
        px(ctx, ox, oy, x, y, '#aaa898'); px(ctx, ox, oy, x + 1, y + 1, '#393a33');
      }
      for (const [x, y] of [[6, 8], [10, 6], [8, 13]]) px(ctx, ox, oy, x, y, '#55564b');
      if (tile === Tile.ServiceWallRust) for (let y = 4; y < 14; y++) {
        px(ctx, ox, oy, 12, y, shade([133, 72, 32], .8 + hnoise(12, y, 702) * .4));
        if (y < 10) px(ctx, ox, oy, 11, y, '#6f492e');
      }
      break;
    }
    case Tile.ServiceFloor:
    case Tile.ServiceCeil: {
      const floor = tile === Tile.ServiceFloor;
      fillNoise(ctx, ox, oy, floor ? [58, 64, 70] : [36, 40, 44], .3, floor ? 711 : 721);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, 0, i, '#20221f'); px(ctx, ox, oy, i, 0, '#20221f');
        px(ctx, ox, oy, 15, i, '#68675d'); px(ctx, ox, oy, i, 15, '#68675d');
      }
      for (const [x, y] of [[2, 2], [13, 13]]) {
        px(ctx, ox, oy, x, y, '#8b8979'); px(ctx, ox, oy, x + 1, y + 1, '#262924');
      }
      if (floor) for (let y = 7; y < 12; y++) px(ctx, ox, oy, 10, y, '#745038');
      break;
    }
    case Tile.Rock: {
      fillNoise(ctx, ox, oy, [82, 78, 88], 0.5, 11);
      // horizontal strata cracks
      for (let y = 3; y < TILE_PX; y += 5) {
        for (let x = 0; x < TILE_PX; x++) {
          if (hnoise(x, y, 21) > 0.35) px(ctx, ox, oy, x, y + (hnoise(x, y, 5) > 0.5 ? 1 : 0), shade([50, 46, 56], 1));
        }
      }
      break;
    }
    case Tile.RockTop: {
      fillNoise(ctx, ox, oy, [66, 62, 72], 0.45, 31);
      break;
    }
    case Tile.Wall: {
      fillNoise(ctx, ox, oy, [88, 96, 112], 0.22, 41);
      // panel seams
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([54, 60, 74], 1));
        px(ctx, ox, oy, i, 8, shade([54, 60, 74], 1));
        px(ctx, ox, oy, 0, i, shade([54, 60, 74], 1));
      }
      // rivets
      for (const [rx, ry] of [[3, 3], [12, 3], [3, 11], [12, 11]] as const) {
        px(ctx, ox, oy, rx, ry, shade([140, 150, 170], 1));
        px(ctx, ox, oy, rx + 1, ry + 1, shade([40, 44, 56], 1));
      }
      break;
    }
    case Tile.Floor: {
      fillNoise(ctx, ox, oy, [58, 60, 68], 0.25, 51);
      // grating pattern
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 7, shade([38, 40, 48], 1));
        px(ctx, ox, oy, i, 15, shade([38, 40, 48], 1));
        px(ctx, ox, oy, 7, i, shade([38, 40, 48], 1));
        px(ctx, ox, oy, 15, i, shade([38, 40, 48], 1));
      }
      px(ctx, ox, oy, 2, 2, shade([90, 94, 104], 1));
      px(ctx, ox, oy, 10, 10, shade([90, 94, 104], 1));
      break;
    }
    case Tile.Ceil: {
      fillNoise(ctx, ox, oy, [46, 46, 56], 0.3, 61);
      for (let i = 0; i < TILE_PX; i += 4) {
        for (let j = 0; j < TILE_PX; j++) px(ctx, ox, oy, j, i, shade([34, 34, 44], 1));
      }
      break;
    }
    case Tile.Basalt: {
      fillNoise(ctx, ox, oy, [34, 37, 43], 0.3, 601);
      for (let y = 0; y < TILE_PX; y++) px(ctx, ox, oy, (y < 8 ? 5 : 6), y, shade([17, 20, 25], 1));
      break;
    }
    case Tile.GeothermalHeat:
    case Tile.LampWarm:
    case Tile.LampRed:
    case Tile.LampTeal:
    case Tile.LampGreen: {
      const cols: Record<number, [number, number, number]> = {
        [Tile.GeothermalHeat]: [255, 108, 24],
        [Tile.LampWarm]: [255, 224, 170],
        [Tile.LampRed]: [255, 80, 56],
        [Tile.LampTeal]: [110, 220, 255],
        [Tile.LampGreen]: [120, 255, 150],
      };
      const c = cols[tile];
      fillNoise(ctx, ox, oy, [60, 62, 70], 0.2, 71);
      // bright center panel
      for (let y = 2; y < 14; y++) {
        for (let x = 2; x < 14; x++) {
          const edge = x === 2 || x === 13 || y === 2 || y === 13;
          px(ctx, ox, oy, x, y, edge ? shade(c, 0.55) : shade(c, 1));
        }
      }
      break;
    }
    case Tile.Crate: {
      fillNoise(ctx, ox, oy, [116, 92, 52], 0.25, 81);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([70, 54, 30], 1));
        px(ctx, ox, oy, i, 15, shade([70, 54, 30], 1));
        px(ctx, ox, oy, 0, i, shade([70, 54, 30], 1));
        px(ctx, ox, oy, 15, i, shade([70, 54, 30], 1));
        // diagonal brace
        px(ctx, ox, oy, i, i, shade([88, 68, 38], 1));
        px(ctx, ox, oy, i, 15 - i, shade([88, 68, 38], 1));
      }
      break;
    }
    case Tile.CrateTop: {
      fillNoise(ctx, ox, oy, [104, 82, 46], 0.25, 91);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([70, 54, 30], 1));
        px(ctx, ox, oy, i, 15, shade([70, 54, 30], 1));
        px(ctx, ox, oy, 0, i, shade([70, 54, 30], 1));
        px(ctx, ox, oy, 15, i, shade([70, 54, 30], 1));
        px(ctx, ox, oy, 7, i, shade([84, 66, 36], 1));
        px(ctx, ox, oy, 8, i, shade([84, 66, 36], 1));
      }
      break;
    }
    case Tile.Cracked: {
      // like Wall but visibly cracked — marks destructible secret walls
      fillNoise(ctx, ox, oy, [88, 96, 112], 0.22, 41);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([54, 60, 74], 1));
        px(ctx, ox, oy, 0, i, shade([54, 60, 74], 1));
      }
      // jagged crack down the middle
      let cx = 7;
      for (let y = 1; y < TILE_PX; y++) {
        cx += hnoise(1, y, 99) > 0.5 ? 1 : -1;
        cx = Math.max(2, Math.min(13, cx));
        px(ctx, ox, oy, cx, y, shade([28, 30, 40], 1));
        px(ctx, ox, oy, cx + 1, y, shade([40, 44, 56], 1));
        if (y === 5 || y === 10) {
          px(ctx, ox, oy, cx - 1, y, shade([28, 30, 40], 1));
          px(ctx, ox, oy, cx - 2, y, shade([40, 44, 56], 1));
        }
        // faint amber gleam seeping through — keeps the SECRET wall clearly
        // distinct from the cosmetic worn/rusty wall variants
        if (y === 4 || y === 9 || y === 13) px(ctx, ox, oy, cx, y, shade([210, 170, 60], 0.9));
      }
      break;
    }
    case Tile.Trim: {
      // hazard stripes
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const s = Math.floor((x + y) / 4) % 2 === 0;
          const n = 0.85 + hnoise(x, y, 111) * 0.3;
          px(ctx, ox, oy, x, y, s ? shade([210, 168, 30], n) : shade([34, 34, 40], n));
        }
      }
      break;
    }
    case Tile.Metal: {
      fillNoise(ctx, ox, oy, [96, 102, 118], 0.15, 121);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([130, 138, 156], 1));
        px(ctx, ox, oy, i, 15, shade([50, 54, 66], 1));
      }
      break;
    }
    case Tile.ExitPad: {
      fillNoise(ctx, ox, oy, [30, 60, 40], 0.2, 131);
      // glowing green chevrons
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const v = (x + y * 2) % 8;
          if (v < 2) px(ctx, ox, oy, x, y, shade([90, 255, 130], 0.9 + hnoise(x, y, 7) * 0.2));
        }
      }
      break;
    }
    case Tile.Barrel: {
      // toxic drum: olive body, vertical ribs, bright hazard bands
      fillNoise(ctx, ox, oy, [70, 94, 56], 0.2, 151);
      for (let x = 0; x < TILE_PX; x += 4) {
        for (let y = 0; y < TILE_PX; y++) px(ctx, ox, oy, x, y, shade([46, 64, 38], 1));
      }
      for (const by of [2, 12]) {
        for (let y = by; y < by + 2; y++) {
          for (let x = 0; x < TILE_PX; x++) {
            const n = 0.85 + hnoise(x, y, 161) * 0.3;
            px(ctx, ox, oy, x, y, shade([150, 230, 70], n));
          }
        }
      }
      // warning diamond in the middle
      for (let y = 5; y <= 9; y++) {
        const half = 2 - Math.abs(y - 7);
        for (let x = 7 - half; x <= 8 + half; x++) {
          px(ctx, ox, oy, x, y, shade([20, 26, 18], 1));
        }
      }
      break;
    }
    case Tile.BarrelTop: {
      fillNoise(ctx, ox, oy, [52, 70, 42], 0.2, 171);
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const dx = x - 7.5, dy = y - 7.5;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d > 5.5 && d < 7) px(ctx, ox, oy, x, y, shade([100, 130, 70], 1));
          if (d < 2) px(ctx, ox, oy, x, y, shade([150, 230, 70], 0.8));
        }
      }
      break;
    }
    case Tile.Pillar: {
      fillNoise(ctx, ox, oy, [78, 84, 100], 0.18, 141);
      for (let x = 0; x < TILE_PX; x += 4) {
        for (let y = 0; y < TILE_PX; y++) {
          px(ctx, ox, oy, x, y, shade([48, 52, 64], 1));
          px(ctx, ox, oy, x + 1, y, shade([120, 128, 146], 1));
        }
      }
      break;
    }
    case Tile.WallRust: {
      // standard wall panel stained by rust runs bleeding down from the seams
      fillNoise(ctx, ox, oy, [88, 96, 112], 0.22, 41);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([54, 60, 74], 1));
        px(ctx, ox, oy, i, 8, shade([54, 60, 74], 1));
        px(ctx, ox, oy, 0, i, shade([54, 60, 74], 1));
      }
      for (const [sx, sy, len] of [[3, 1, 6], [11, 1, 10], [7, 9, 5], [13, 9, 4]] as const) {
        px(ctx, ox, oy, sx, sy, shade([168, 104, 48], 1));
        for (let y = sy + 1; y < Math.min(TILE_PX, sy + len); y++) {
          const f = 0.6 + hnoise(sx, y, 201) * 0.5;
          px(ctx, ox, oy, sx, y, shade([140, 84, 40], f));
          if (hnoise(sx + 3, y, 202) > 0.6) px(ctx, ox, oy, sx + 1, y, shade([110, 66, 34], f));
        }
      }
      break;
    }
    case Tile.WallVent: {
      // recessed extraction vent with horizontal slats
      fillNoise(ctx, ox, oy, [88, 96, 112], 0.22, 41);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([54, 60, 74], 1));
        px(ctx, ox, oy, 0, i, shade([54, 60, 74], 1));
      }
      for (let y = 3; y <= 12; y++) {
        for (let x = 2; x <= 13; x++) {
          const frame = y === 3 || y === 12 || x === 2 || x === 13;
          if (frame) px(ctx, ox, oy, x, y, shade([116, 124, 142], 1));
          else px(ctx, ox, oy, x, y, y % 2 === 0 ? shade([24, 28, 36], 1) : shade([58, 64, 78], 0.9));
        }
      }
      px(ctx, ox, oy, 2, 3, shade([150, 158, 176], 1));
      px(ctx, ox, oy, 13, 12, shade([150, 158, 176], 1));
      break;
    }
    case Tile.WallPipes: {
      // two vertical conduits with clamps (placed as full wall columns)
      fillNoise(ctx, ox, oy, [80, 88, 104], 0.2, 43);
      for (const p of [3, 10] as const) {
        for (let y = 0; y < TILE_PX; y++) {
          px(ctx, ox, oy, p, y, shade([60, 66, 80], 1));
          px(ctx, ox, oy, p + 1, y, shade([134, 142, 160], 1));
          px(ctx, ox, oy, p + 2, y, shade([96, 102, 118], 1));
        }
      }
      for (const cy of [2, 9] as const) {
        for (let x = 2; x <= 6; x++) px(ctx, ox, oy, x, cy, shade([46, 50, 62], 1));
        for (let x = 9; x <= 13; x++) px(ctx, ox, oy, x, cy + 3, shade([46, 50, 62], 1));
      }
      break;
    }
    case Tile.WallWorn: {
      // scuffed plating with hairline wear — deliberately SOFTER than the
      // secret Cracked tile (seam-dark lines only, no deep black fracture)
      fillNoise(ctx, ox, oy, [84, 92, 108], 0.26, 45);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([54, 60, 74], 1));
        px(ctx, ox, oy, 0, i, shade([54, 60, 74], 1));
      }
      let wx = 4;
      for (let y = 3; y < 11; y++) {
        wx += hnoise(2, y, 210) > 0.5 ? 1 : 0;
        px(ctx, ox, oy, wx, y, shade([58, 64, 78], 1));
      }
      let wy = 12;
      for (let x = 8; x < 15; x++) {
        wy += hnoise(x, 3, 211) > 0.6 ? -1 : 0;
        px(ctx, ox, oy, x, wy, shade([58, 64, 78], 1));
      }
      for (const [cxp, cyp] of [[12, 4], [5, 13], [2, 7]] as const) {
        px(ctx, ox, oy, cxp, cyp, shade([106, 114, 130], 1));
        px(ctx, ox, oy, cxp + 1, cyp, shade([64, 70, 84], 1));
      }
      break;
    }
    case Tile.CeilPipes: {
      // conduit runs strapped under the ceiling
      fillNoise(ctx, ox, oy, [46, 46, 56], 0.3, 61);
      for (const p of [2, 9] as const) {
        for (let x = 0; x < TILE_PX; x++) {
          px(ctx, ox, oy, x, p, shade([88, 92, 106], 1));
          px(ctx, ox, oy, x, p + 1, shade([120, 126, 142], 1));
          px(ctx, ox, oy, x, p + 2, shade([64, 68, 82], 1));
        }
      }
      for (const cx2 of [4, 12] as const) {
        for (let y = 1; y <= 12; y++) px(ctx, ox, oy, cx2, y, shade([38, 40, 50], 1));
      }
      break;
    }
    case Tile.CeilPipesZ: {
      // same conduits rotated 90° — ceiling UVs map tile-x to world X, so a
      // run laid along Z needs this twin or the pipes read as chopped ribs
      fillNoise(ctx, ox, oy, [46, 46, 56], 0.3, 61);
      for (const p of [2, 9] as const) {
        for (let y = 0; y < TILE_PX; y++) {
          px(ctx, ox, oy, p, y, shade([88, 92, 106], 1));
          px(ctx, ox, oy, p + 1, y, shade([120, 126, 142], 1));
          px(ctx, ox, oy, p + 2, y, shade([64, 68, 82], 1));
        }
      }
      for (const cy of [4, 12] as const) {
        for (let x = 1; x <= 12; x++) px(ctx, ox, oy, x, cy, shade([38, 40, 50], 1));
      }
      break;
    }
    case Tile.CeilVent: {
      // circular extraction fan set into the ceiling
      fillNoise(ctx, ox, oy, [46, 46, 56], 0.3, 61);
      for (let y = 0; y < TILE_PX; y++) {
        for (let x = 0; x < TILE_PX; x++) {
          const dx = x - 7.5, dy = y - 7.5;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 6.5) {
            const blade = Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2;
            px(ctx, ox, oy, x, y, blade ? shade([76, 80, 94], 1) : shade([20, 22, 30], 1));
          } else if (d < 7.4) {
            px(ctx, ox, oy, x, y, shade([96, 102, 118], 1));
          }
        }
      }
      px(ctx, ox, oy, 7, 7, shade([120, 126, 142], 1));
      px(ctx, ox, oy, 8, 8, shade([120, 126, 142], 1));
      break;
    }
    case Tile.Chain: {
      // hanging-light stem: dark shaft with bright chain links
      fillNoise(ctx, ox, oy, [30, 32, 42], 0.35, 220);
      for (let y = 0; y < TILE_PX; y++) {
        const link = Math.floor(y / 2) % 2 === 0;
        px(ctx, ox, oy, 7, y, shade(link ? [150, 158, 176] : [92, 98, 114], 1));
        px(ctx, ox, oy, 8, y, shade(link ? [104, 110, 128] : [64, 70, 84], 1));
      }
      break;
    }
    // ---- Biofoundry set ------------------------------------------------
    case Tile.LabFloor: {
      // one large tile per block: wide dark grout on two edges, a lit
      // bevel on the others, lighter centre so lamp light reads as sheen
      fillNoise(ctx, ox, oy, [96, 94, 112], 0.16, 301);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([38, 36, 48], 1));
        px(ctx, ox, oy, i, 1, shade([52, 50, 64], 1));
        px(ctx, ox, oy, 0, i, shade([38, 36, 48], 1));
        px(ctx, ox, oy, 1, i, shade([52, 50, 64], 1));
        px(ctx, ox, oy, i, 15, shade([66, 64, 80], 1));
        px(ctx, ox, oy, 15, i, shade([66, 64, 80], 1));
      }
      for (const [sx, sy] of [[4, 4], [5, 4], [4, 5], [10, 11], [11, 11]] as const) {
        px(ctx, ox, oy, sx, sy, shade([122, 120, 140], 1));
      }
      break;
    }
    case Tile.LabCeil: {
      fillNoise(ctx, ox, oy, [30, 30, 40], 0.28, 311);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([16, 16, 24], 1));
        px(ctx, ox, oy, 0, i, shade([16, 16, 24], 1));
      }
      break;
    }
    case Tile.LabCeilGrate: {
      // square extraction grate set into the panelled ceiling
      fillNoise(ctx, ox, oy, [30, 30, 40], 0.28, 311);
      for (let y = 2; y <= 13; y++) {
        for (let x = 2; x <= 13; x++) {
          const frame = y === 2 || y === 13 || x === 2 || x === 13;
          if (frame) px(ctx, ox, oy, x, y, shade([78, 82, 98], 1));
          else px(ctx, ox, oy, x, y, y % 2 === 0 ? shade([10, 10, 16], 1) : shade([52, 56, 70], 0.9));
        }
      }
      break;
    }
    case Tile.LabWall:
    case Tile.LabWallRust: {
      // one concrete panel per block: dark seam top/left, lit bevel
      // bottom/right, a rivet in each corner
      fillNoise(ctx, ox, oy, [106, 110, 126], 0.14, 321);
      for (let i = 0; i < TILE_PX; i++) {
        px(ctx, ox, oy, i, 0, shade([58, 62, 78], 1));
        px(ctx, ox, oy, 0, i, shade([58, 62, 78], 1));
        px(ctx, ox, oy, i, 15, shade([134, 138, 156], 1));
        px(ctx, ox, oy, 15, i, shade([134, 138, 156], 1));
      }
      for (const [rx, ry] of [[3, 3], [12, 3], [3, 12], [12, 12]] as const) {
        px(ctx, ox, oy, rx, ry, shade([166, 172, 190], 1));
        px(ctx, ox, oy, rx + 1, ry + 1, shade([46, 50, 64], 1));
      }
      for (const [sx, sy] of [[7, 6], [9, 9], [6, 11]] as const) px(ctx, ox, oy, sx, sy, shade([90, 94, 110], 1));
      if (tile === Tile.LabWallRust) {
        for (const [sx, len] of [[3, 9], [12, 6]] as const) {
          for (let y = 4; y < 4 + len; y++) {
            const f = 0.6 + hnoise(sx, y, 331) * 0.5;
            px(ctx, ox, oy, sx, y, shade([150, 90, 42], f));
            if (hnoise(sx + 1, y, 332) > 0.55) px(ctx, ox, oy, sx + 1, y, shade([112, 66, 32], f));
          }
        }
      }
      break;
    }
    case Tile.LampViolet: {
      // magenta emergency panel: thin dark bezel, bright inset glass
      fillNoise(ctx, ox, oy, [24, 22, 34], 0.2, 341);
      for (let y = 1; y < 15; y++) {
        for (let x = 1; x < 15; x++) {
          const edge = x === 1 || x === 14 || y === 1 || y === 14;
          px(ctx, ox, oy, x, y, edge ? shade([150, 60, 200], 1) : shade([225, 110, 255], 1));
        }
      }
      break;
    }
    case Tile.TankGlass: {
      // specimen tank: luminous green liquid, bright surface band at the
      // top, a glass highlight stripe, a dark edge and a few bubbles
      // (pale: the face colour is this × the tank's own lamp light)
      fillNoise(ctx, ox, oy, [196, 250, 156], 0.12, 351);
      for (let x = 0; x < TILE_PX; x++) {
        px(ctx, ox, oy, x, 0, shade([244, 255, 205], 1));
        px(ctx, ox, oy, x, 1, shade([232, 255, 192], 1));
      }
      for (let y = 0; y < TILE_PX; y++) {
        px(ctx, ox, oy, 2, y, shade([236, 255, 196], 1));
        px(ctx, ox, oy, 15, y, shade([128, 176, 96], 1));
      }
      for (const [bx, by] of [[6, 5], [11, 9], [8, 13], [12, 3]] as const) px(ctx, ox, oy, bx, by, shade([252, 255, 225], 1));
      break;
    }
  }
}

let atlasTexture: THREE.CanvasTexture | null = null;

/** Build (once) the procedural texture atlas used by all chunk meshes. */
export function getAtlasTexture(): THREE.CanvasTexture {
  if (atlasTexture) return atlasTexture;
  const size = ATLAS_TILES * TILE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f0f';
  ctx.fillRect(0, 0, size, size);
  for (let t = 0; t < TILE_COUNT; t++) drawTile(ctx, t as Tile);
  atlasTexture = new THREE.CanvasTexture(canvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.colorSpace = THREE.NoColorSpace;
  return atlasTexture;
}
