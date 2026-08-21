/** Player-tunable options, persisted to localStorage. */
export interface GameSettings {
  /** mouse sensitivity multiplier */
  sensitivity: number;
  /** master volume 0..1 */
  volume: number;
  /** music volume 0..1 (scaled by master) */
  musicVolume: number;
  /** base field of view in degrees */
  fov: number;
  /** internal render height in lines (chunkier = lower) */
  resolution: number;
  /** camera shake on/off */
  shake: boolean;
  /** aim assist (magnetism + sticky aim) — only ever active on touch devices */
  aimAssist: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  sensitivity: 1,
  volume: 0.7,
  musicVolume: 0.55,
  fov: 75,
  resolution: 240,
  shake: true,
  aimAssist: true,
};

export const RESOLUTIONS = [180, 240, 320, 480];

const KEY = 'voxelstrike-settings';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const p = JSON.parse(raw) as Partial<GameSettings>;
    return {
      sensitivity: clamp(Number(p.sensitivity) || DEFAULT_SETTINGS.sensitivity, 0.3, 2.5),
      volume: clamp(Number.isFinite(Number(p.volume)) ? Number(p.volume) : DEFAULT_SETTINGS.volume, 0, 1),
      musicVolume: clamp(
        Number.isFinite(Number(p.musicVolume)) ? Number(p.musicVolume) : DEFAULT_SETTINGS.musicVolume,
        0, 1
      ),
      fov: clamp(Number(p.fov) || DEFAULT_SETTINGS.fov, 60, 100),
      resolution: RESOLUTIONS.includes(Number(p.resolution)) ? Number(p.resolution) : DEFAULT_SETTINGS.resolution,
      shake: typeof p.shake === 'boolean' ? p.shake : DEFAULT_SETTINGS.shake,
      aimAssist: typeof p.aimAssist === 'boolean' ? p.aimAssist : DEFAULT_SETTINGS.aimAssist,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // storage unavailable (private mode etc.) — settings just won't persist
  }
}
