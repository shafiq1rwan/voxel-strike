import { AudioMan } from './audio';

/**
 * Streaming-free music system: three looping slots (menu / ambient / combat)
 * with crossfades. Tracks are optional — the game ships with none and stays
 * silent. Drop files into public/music/ and list them in
 * public/music/manifest.json to enable the soundtrack.
 */
export type MusicMode = 'menu' | 'ambient' | 'combat' | 'none';

const SLOTS = ['menu', 'ambient', 'combat'] as const;

interface Manifest {
  menu?: string;
  ambient?: string;
  combat?: string;
}

export class Music {
  private buffers = new Map<string, AudioBuffer>();
  private playing: { mode: MusicMode; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private desired: MusicMode = 'none';
  private volume = 0.55;
  private loadState: 'idle' | 'loading' | 'done' = 'idle';

  constructor(private audio: AudioMan) {}

  setVolume(v: number): void {
    this.volume = v;
    const ctx = this.audio.context;
    if (this.playing && ctx) {
      this.playing.gain.gain.setTargetAtTime(Math.max(0.0001, v), ctx.currentTime, 0.1);
    }
  }

  setMode(mode: MusicMode): void {
    if (this.desired === mode) return;
    this.desired = mode;
    this.apply();
  }

  /** call regularly; starts loading once the audio context exists */
  update(): void {
    if (this.loadState === 'idle' && this.audio.context) {
      this.loadState = 'loading';
      void this.loadAll();
    }
  }

  private async loadAll(): Promise<void> {
    const ctx = this.audio.context!;
    let manifest: Manifest = {};
    try {
      const res = await fetch('music/manifest.json');
      if (res.ok) manifest = (await res.json()) as Manifest;
    } catch {
      // no manifest — no soundtrack, which is fine
    }
    await Promise.all(
      SLOTS.map(async (slot) => {
        const file = manifest[slot];
        if (!file) return;
        try {
          const res = await fetch(`music/${file}`);
          if (!res.ok) return;
          const raw = await res.arrayBuffer();
          this.buffers.set(slot, await ctx.decodeAudioData(raw));
        } catch {
          console.warn(`[music] could not load music/${file} for the "${slot}" slot`);
        }
      })
    );
    this.loadState = 'done';
    if (this.buffers.size > 0) {
      console.log(`[music] loaded: ${[...this.buffers.keys()].join(', ')}`);
    }
    this.apply();
  }

  private apply(): void {
    const ctx = this.audio.context;
    const master = this.audio.masterBus;
    if (!ctx || !master) return;
    // fall back through slots so one track can carry the whole game
    let want: MusicMode = this.desired;
    if (want !== 'none' && !this.buffers.has(want)) {
      want = this.buffers.has('ambient') ? 'ambient' : this.buffers.has('menu') ? 'menu' : 'none';
    }
    if (this.playing?.mode === want) return;

    if (this.playing) {
      const old = this.playing;
      old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.55);
      old.src.stop(ctx.currentTime + 2.5);
      this.playing = null;
    }
    if (want === 'none') return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffers.get(want)!;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.setTargetAtTime(Math.max(0.0001, this.volume), ctx.currentTime, 0.8);
    src.connect(gain);
    gain.connect(master);
    src.start();
    this.playing = { mode: want, src, gain };
  }
}
