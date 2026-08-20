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
}

export const BLOCK_COUNT = 16;

/** Which lamp blocks emit light, and their color (0-255 per channel). */
export const LAMP_COLORS: Partial<Record<Block, [number, number, number]>> = {
  [Block.LampWarm]: [255, 214, 150],
  [Block.LampRed]: [255, 64, 40],
  [Block.LampTeal]: [70, 205, 255],
  [Block.LampGreen]: [90, 255, 120],
  [Block.ExitPad]: [60, 200, 90],
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
}

export const TILE_COUNT = 18;

/** Face dirs: 0:+x 1:-x 2:+y(top) 3:-y(bottom) 4:+z 5:-z */
export function tileFor(block: Block, dir: number): Tile {
  const top = dir === 2;
  const bottom = dir === 3;
  switch (block) {
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
    case Tile.LampWarm:
    case Tile.LampRed:
    case Tile.LampTeal:
    case Tile.LampGreen: {
      const cols: Record<number, [number, number, number]> = {
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
