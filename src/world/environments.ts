import { Block } from './blocks';
import type { VoxelWorld } from './world';
import type { RoomDef } from '../types';

export type NewTheme = 'freight' | 'excavation' | 'medical';
export const NEW_THEMES: NewTheme[] = ['freight', 'excavation', 'medical'];
export const ENVIRONMENTS = {
  freight: { name: 'FREIGHT DEPOT', ambient: [66, 67, 70], wall: Block.FreightWall, floor: Block.FreightFloor, pillar: Block.FreightCargo, lamp: Block.FreightLamp },
  excavation: { name: 'DEEP EXCAVATION', ambient: [32, 36, 44], wall: Block.ExcavationWall, floor: Block.ExcavationFloor, pillar: Block.ExcavationSupport, lamp: Block.ExcavationLamp },
  medical: { name: 'MEDICAL WING', ambient: [40, 47, 46], wall: Block.MedicalWall, floor: Block.MedicalFloor, pillar: Block.MedicalCabinet, lamp: Block.MedicalLamp },
} satisfies Record<NewTheme, { name: string; ambient: [number, number, number]; wall: Block; floor: Block; pillar: Block; lamp: Block }>;

export function isNewTheme(theme: string): theme is NewTheme {
  return NEW_THEMES.includes(theme as NewTheme);
}

/** Preserve existing walkways, with additive recessed bed bays; never consume the generator's layout RNG. */
export function dressEnvironment(world: VoxelWorld, rooms: RoomDef[], theme: NewTheme): void {
  const palette = ENVIRONMENTS[theme];
  const key = rooms.find((r) => r.kind === 'key');
  const exit = rooms.find((r) => r.kind === 'exit');
  for (let y = 0; y < world.sy; y++) for (let z = 0; z < world.sz; z++) for (let x = 0; x < world.sx; x++) {
    // Preserve the established service-lift room and all objective/puzzle blocks.
    if (exit && x >= exit.x - 1 && x <= exit.x + exit.w && z >= exit.z - 1 && z <= exit.z + exit.d) continue;
    const b = world.get(x, y, z);
    if ([Block.Wall, Block.WallRust, Block.WallWorn].includes(b)) world.set(x, y, z, theme === 'medical' && y <= 2 ? Block.MedicalWallLower : theme === 'freight' && y <= 3 && (x + z) % 7 < 5 ? Block.FreightCargo : palette.wall);
    else if (b === Block.Floor) world.set(x, y, z, palette.floor);
    else if (b === Block.Pillar) world.set(x, y, z, palette.pillar);
    else if (b === Block.LampWarm || b === Block.LampTeal || (b === Block.LampRed && !(key && x >= key.x - 1 && x <= key.x + key.w && z >= key.z - 1 && z <= key.z + key.d))) world.set(x, y, z, palette.lamp);
    else if (theme === 'excavation' && b === Block.Ceil) world.set(x, y, z, Block.ExcavationWall);
    else if (theme === 'medical' && b === Block.Ceil) world.set(x, y, z, Block.MedicalCeil);
  }
  if (theme === 'medical') {
    for (const r of rooms) {
      if (r.kind === 'exit' || r.kind === 'key') continue;
      for (const x of [r.x + 2, r.x + r.w - 4]) {
        const z = r.z - 1;
        let clear = true;
        for (let dx = 0; dx < 2; dx++) {
          if (world.get(x + dx, 1, z) !== Block.MedicalWallLower || world.get(x + dx, 1, z + 1) !== Block.Air) clear = false;
          for (let y = 1; y <= 4; y++) if (world.get(x + dx, y, z - 1) !== Block.Rock) clear = false;
          for (let y = 2; y <= 3; y++) if (![Block.MedicalWall, Block.MedicalWallLower].includes(world.get(x + dx, y, z))) clear = false;
        }
        if (!clear) continue;
        for (let dx = 0; dx < 2; dx++) {
          world.set(x + dx, 1, z, Block.PowerBarrier);
          for (let y = 2; y <= 3; y++) {
            world.set(x + dx, y, z, Block.Air);
            world.set(x + dx, y, z - 1, y === 2 ? Block.MedicalWallLower : Block.MedicalWall);
          }
        }
      }
    }
  }
}
