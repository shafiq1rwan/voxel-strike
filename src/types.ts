/** Shared plain-data types kept free of Three.js so game state stays portable. */

export type KeyColor = 'red' | 'blue' | 'yellow';

export type PickupKind =
  | 'healthSmall' | 'healthBig'
  | 'armorShard' | 'armorVest'
  | 'ammoBullets' | 'ammoShells' | 'ammoRockets'
  | 'keyRed' | 'keyBlue' | 'keyYellow'
  | 'weaponShotgun' | 'weaponSMG' | 'weaponRocket' | 'weaponArc'
  | 'weaponSecret' | 'ammoSpecial'
  | 'ammoCells'
  | 'powerQuad' | 'powerShield' | 'powerHaste'
  /** scrap a kill dropped: walk over it (it flies to you) to bank `amount` */
  | 'scrap';

/** 'vatborn' is sector 4 preview only — levelgen never places it */
export type EnemyKind = 'husk' | 'sentinel' | 'ticker' | 'brute' | 'vatborn' | 'broodkeeper'
  | 'cinderHulk' | 'ventStalker' | 'kilnDrone';

export type WeaponId = 'pistol' | 'shotgun' | 'smg' | 'rocket' | 'arc' | 'special';

export type AmmoType = 'bullets' | 'shells' | 'rockets' | 'cells' | 'special';

export interface RoomDef {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  cx: number;
  cz: number;
  kind: 'spawn' | 'exit' | 'key' | 'normal' | 'arena';
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
  /** Visible supplies in a puzzle cache cannot drift or be collected until opened. */
  sealed?: boolean;
  secretSector?: number;
  /** a gun the player threw when it ran dry: picking it up gives the gun back, no ammo */
  thrown?: boolean;
  /** 'scrap' pickups: how much it is worth */
  amount?: number;
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

/**
 * The green EXIT sign on the exit ledge's back wall, over the pad. (x, z) is
 * the middle of the wall face behind the pad, y the ledge top; `face` names
 * the wall.
 */
export interface ExitSignSpec {
  x: number;
  y: number;
  z: number;
  face: 'xmin' | 'xmax' | 'zmin' | 'zmax';
}

/**
 * The exit ledge's railing: the cells of its invisible rail barrier (at
 * height y), the axis the rail runs along, and which way the ledge's walkable
 * side lies across it (+1 / -1) — the yellow tubes are drawn on that face.
 */
export interface LedgeRailSpec {
  cells: Array<[number, number]>;
  y: number;
  axis: 'x' | 'z';
  inward: 1 | -1;
}

export interface ElevatorSpec {
  /** min corner of the 2x2 platform */
  x: number;
  z: number;
  lowY: number;
  highY: number;
  /**
   * axis the rider boards and leaves along (toward the ledge); the deck draws
   * guard rails on the two other sides. Omitted = plain open deck.
   */
  walkAxis?: 'x' | 'z';
}
