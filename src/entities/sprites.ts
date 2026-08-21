import * as THREE from 'three';

/**
 * Optional billboard-sprite skins for enemies (classic Doom-style monsters).
 * Sheets live in public/sprites/ and are declared in manifest.json; with no
 * manifest entries, enemies use their procedural voxel rigs. Sheet layout:
 * fixed row order idle / walk / attack / pain / death, one animation frame
 * per column, frame counts per row from the manifest.
 */

export const SPRITE_ROWS = ['idle', 'walk', 'attack', 'pain', 'death'] as const;
export type SpriteRowName = (typeof SPRITE_ROWS)[number];

export interface SpriteDef {
  texture: THREE.Texture;
  frameW: number;
  frameH: number;
  sheetW: number;
  sheetH: number;
  /** world-space height of the billboard */
  worldH: number;
  fps: number;
  counts: Record<SpriteRowName, number>;
}

interface ManifestEntry {
  file: string;
  frameW: number;
  frameH: number;
  worldH: number;
  fps: number;
  counts: Partial<Record<SpriteRowName, number>>;
}

export class SpriteLibrary {
  private defs = new Map<string, SpriteDef>();
  private state: 'idle' | 'loading' | 'done' = 'idle';

  load(): void {
    if (this.state !== 'idle') return;
    this.state = 'loading';
    void this.loadAll();
  }

  get(kind: string): SpriteDef | null {
    return this.defs.get(kind) ?? null;
  }

  private async loadAll(): Promise<void> {
    let manifest: Record<string, ManifestEntry> = {};
    try {
      const res = await fetch('sprites/manifest.json');
      if (res.ok) manifest = (await res.json()) as Record<string, ManifestEntry>;
    } catch {
      // no sprite manifest — voxel rigs everywhere, which is the default look
    }
    const loader = new THREE.TextureLoader();
    for (const [kind, entry] of Object.entries(manifest)) {
      if (!entry || !entry.file) continue;
      loader.load(
        `sprites/${entry.file}`,
        (texture) => {
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          texture.colorSpace = THREE.NoColorSpace;
          const img = texture.image as { width: number; height: number };
          this.defs.set(kind, {
            texture,
            frameW: entry.frameW,
            frameH: entry.frameH,
            sheetW: img.width,
            sheetH: img.height,
            worldH: entry.worldH,
            fps: entry.fps || 8,
            counts: {
              idle: entry.counts.idle ?? 1,
              walk: entry.counts.walk ?? 1,
              attack: entry.counts.attack ?? 1,
              pain: entry.counts.pain ?? 1,
              death: entry.counts.death ?? 1,
            },
          });
          console.log(`[sprites] loaded "${kind}" skin from sprites/${entry.file}`);
        },
        undefined,
        () => console.warn(`[sprites] could not load sprites/${entry.file} for "${kind}"`)
      );
    }
    this.state = 'done';
  }
}
