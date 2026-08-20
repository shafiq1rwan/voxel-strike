/** Shared plain-data types kept free of Three.js so game state stays portable. */

export type KeyColor = 'red' | 'blue' | 'yellow';

export type PickupKind =
  | 'healthSmall' | 'healthBig'
  | 'armorShard' | 'armorVest'
  | 'ammoBullets' | 'ammoShells' | 'ammoRockets'
  | 'keyRed' | 'keyBlue' | 'keyYellow'
  | 'weaponShotgun' | 'weaponSMG' | 'weaponRocket';

export type EnemyKind = 'husk' | 'sentinel';

export type WeaponId = 'pistol' | 'shotgun' | 'smg' | 'rocket';

export type AmmoType = 'bullets' | 'shells' | 'rockets';

export interface RoomDef {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  cx: number;
  cz: number;
  kind: 'spawn' | 'exit' | 'key' | 'normal';
  /** graph distance from spawn room */
  dist: number;
}

export interface DoorSpec {
  /** min corner of the 2-cell doorway footprint */
  x: number;
  z: number;
  /** corridor travel direction the door blocks */
  dir: 'x' | 'z';
  locked: KeyColor | null;
}

export interface PickupSpec {
  kind: PickupKind;
  x: number;
  y: number;
  z: number;
}

export interface EnemySpec {
  kind: EnemyKind;
  x: number;
  z: number;
  /** room id the enemy patrols */
  roomId: number;
}

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}

export interface ElevatorSpec {
  /** min corner of the 2x2 platform */
  x: number;
  z: number;
  lowY: number;
  highY: number;
}
