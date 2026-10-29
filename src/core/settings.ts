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

export const RESOLUTIONS = [180, 240, 320, 480];

/**
 * Default pixelation by device: 480 lines on desktop, 320 on touch devices
 * (phones keep a lighter render). Still cycled in Settings, and a saved
 * choice is kept. 0.3.10 defaulted to 180 everywhere: sector 1 cleared 36%
 * against 0.3.9's 48% with the same monsters, and Husk deaths there went
 * 27 → 42 — a Husk at 180 lines is a blur until it's close.
 */
export function defaultResolution(touch: boolean): number {
  return touch ? 320 : 480;
}

export function defaultSettings(touch: boolean): GameSettings {
  return {
    sensitivity: 1,
    volume: 0.7,
    musicVolume: 0.55,
    fov: 75,
    resolution: defaultResolution(touch),
    shake: true,
    aimAssist: true,
  };
}

const KEY = 'voxelstrike-settings';
/**
 * Stored with the settings. Version 1 (no field) had a 240-line default for
 * everyone; a saved 240 from then is moved to the new device default once.
 */
const VERSION = 2;
const OLD_DEFAULT_RESOLUTION = 240;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export function loadSettings(touch: boolean): GameSettings {
  const d = defaultSettings(touch);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const p = JSON.parse(raw) as Partial<GameSettings> & { v?: number };
    let resolution = RESOLUTIONS.includes(Number(p.resolution)) ? Number(p.resolution) : d.resolution;
    if ((p.v ?? 1) < VERSION && resolution === OLD_DEFAULT_RESOLUTION) resolution = d.resolution;
    return {
      sensitivity: clamp(Number(p.sensitivity) || d.sensitivity, 0.3, 2.5),
      volume: clamp(Number.isFinite(Number(p.volume)) ? Number(p.volume) : d.volume, 0, 1),
      musicVolume: clamp(
        Number.isFinite(Number(p.musicVolume)) ? Number(p.musicVolume) : d.musicVolume,
        0, 1
      ),
      fov: clamp(Number(p.fov) || d.fov, 60, 100),
      resolution,
      shake: typeof p.shake === 'boolean' ? p.shake : d.shake,
      aimAssist: typeof p.aimAssist === 'boolean' ? p.aimAssist : d.aimAssist,
    };
  } catch {
    return d;
  }
}

export function saveSettings(s: GameSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, v: VERSION }));
  } catch {
    // storage unavailable (private mode etc.) — settings just won't persist
  }
}
