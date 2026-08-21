/**
 * Procedural WebAudio sound effects — no audio assets, everything synthesized.
 * Positional sounds get simple stereo pan + distance attenuation relative to
 * the listener (set each frame by the game).
 */
export type SoundName =
  | 'pistol' | 'shotgun' | 'smg' | 'rocketLaunch' | 'explosion' | 'dryfire'
  | 'boltFire' | 'boltHit' | 'impact' | 'crateBreak' | 'wallBreak'
  | 'enemyPainA' | 'enemyPainB' | 'enemyDieA' | 'enemyDieB'
  | 'huskAlert' | 'huskBite' | 'huskStep' | 'huskGrowl' | 'sentinelAlert'
  | 'playerPain' | 'playerDie'
  | 'pickup' | 'pickupKey' | 'pickupWeapon' | 'secret'
  | 'doorOpen' | 'doorClose' | 'doorLocked' | 'elevator'
  | 'step' | 'clank'
  | 'win';

interface ListenerState {
  x: number; y: number; z: number;
  /** facing angle (yaw) for panning */
  yaw: number;
}

export class AudioMan {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  listener: ListenerState = { x: 0, y: 0, z: 0, yaw: 0 };

  /** Must be called from a user gesture. Safe to call repeatedly. */
  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
    // self-heal: if the browser's autoplay policy leaves (or later puts) the
    // context suspended, the next gesture of any kind resumes it
    const resume = (): void => {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
    };
    document.addEventListener('mousedown', resume);
    document.addEventListener('keydown', resume);
    // 1 second of white noise, reused by all noise-based sounds
    const len = this.ctx.sampleRate;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.startAmbience();
  }

  isRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  /** exposed for the music system (null until init) */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get masterBus(): GainNode | null {
    return this.master;
  }

  private volume = 0.7;

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private hbTimer: number | null = null;

  /** low-health heartbeat loop (lub-dub every second) */
  setHeartbeat(on: boolean): void {
    if (on && this.hbTimer === null && this.ctx && this.master) {
      const beat = (): void => {
        if (!this.master) return;
        this.tone(this.master, 'sine', 0.5, 0.012, 0.1, 58, 40);
        this.tone(this.master, 'sine', 0.38, 0.012, 0.09, 52, 38, 0.17);
      };
      beat();
      this.hbTimer = window.setInterval(beat, 1000);
    } else if (!on && this.hbTimer !== null) {
      clearInterval(this.hbTimer);
      this.hbTimer = null;
    }
  }

  /** Low ominous drone underneath everything. */
  private startAmbience(): void {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    g.gain.value = 0.09;
    g.connect(this.master!);
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    o1.frequency.value = 36;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 90;
    o1.connect(f);
    f.connect(g);
    o1.start();
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 14;
    o2.connect(lfoGain);
    lfoGain.connect(o1.frequency);
    o2.start();
  }

  /** Play a named sound, optionally positioned in the world. */
  play(name: SoundName, pos?: { x: number; y: number; z: number }): void {
    if (!this.ctx || !this.master) return;
    let out: AudioNode = this.master;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dz = pos.z - this.listener.z;
      const dy = pos.y - this.listener.y;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist > 42) return;
      const gain = this.ctx.createGain();
      gain.gain.value = 1 / (1 + dist * 0.11);
      // pan by direction relative to facing (right vector = local +x rotated by yaw)
      const sinY = Math.sin(this.listener.yaw);
      const cosY = Math.cos(this.listener.yaw);
      const rightX = cosY;
      const rightZ = -sinY;
      const pan = dist > 0.5 ? Math.max(-1, Math.min(1, (dx * rightX + dz * rightZ) / dist)) : 0;
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      gain.connect(panner);
      panner.connect(this.master);
      out = gain;
    }
    this.synth(name, out);
  }

  // -------------------------------------------------------------------------
  // synth building blocks
  // -------------------------------------------------------------------------

  private env(g: GainNode, t0: number, peak: number, attack: number, decay: number): void {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }

  private noise(out: AudioNode, peak: number, attack: number, decay: number, filterType: BiquadFilterType, f0: number, f1?: number): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const filt = ctx.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.setValueAtTime(f0, t0);
    if (f1 !== undefined) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + attack + decay);
    const g = ctx.createGain();
    this.env(g, t0, peak, attack, decay);
    src.connect(filt);
    filt.connect(g);
    g.connect(out);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + attack + decay + 0.05);
  }

  private tone(
    out: AudioNode, type: OscillatorType, peak: number, attack: number, decay: number,
    freq0: number, freq1?: number, delay = 0
  ): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq0, t0);
    if (freq1 !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq1), t0 + attack + decay);
    const g = ctx.createGain();
    this.env(g, t0, peak, attack, decay);
    osc.connect(g);
    g.connect(out);
    osc.start(t0);
    osc.stop(t0 + attack + decay + 0.05);
  }

  private synth(name: SoundName, out: AudioNode): void {
    switch (name) {
      case 'pistol':
        this.noise(out, 0.7, 0.004, 0.09, 'highpass', 900);
        this.tone(out, 'square', 0.5, 0.002, 0.07, 240, 70);
        break;
      case 'smg':
        this.noise(out, 0.55, 0.003, 0.06, 'highpass', 1200);
        this.tone(out, 'square', 0.4, 0.002, 0.05, 320, 90);
        break;
      case 'shotgun':
        this.noise(out, 1.0, 0.005, 0.32, 'lowpass', 2600, 300);
        this.tone(out, 'sine', 0.7, 0.004, 0.18, 110, 40);
        this.noise(out, 0.4, 0.002, 0.05, 'highpass', 2000);
        break;
      case 'rocketLaunch':
        this.noise(out, 0.8, 0.02, 0.4, 'lowpass', 500, 2400);
        this.tone(out, 'sawtooth', 0.3, 0.01, 0.3, 90, 50);
        break;
      case 'explosion':
        this.noise(out, 1.1, 0.008, 0.7, 'lowpass', 1600, 90);
        this.tone(out, 'sine', 0.9, 0.005, 0.5, 90, 30);
        break;
      case 'dryfire':
        this.tone(out, 'square', 0.25, 0.002, 0.03, 900, 500);
        break;
      case 'boltFire':
        this.tone(out, 'sawtooth', 0.5, 0.01, 0.18, 700, 180);
        this.tone(out, 'square', 0.2, 0.01, 0.12, 1400, 500);
        break;
      case 'boltHit':
        this.noise(out, 0.5, 0.003, 0.12, 'bandpass', 1800, 400);
        this.tone(out, 'sawtooth', 0.3, 0.002, 0.08, 500, 120);
        break;
      case 'impact':
        this.noise(out, 0.32, 0.002, 0.06, 'bandpass', 2500, 900);
        break;
      case 'crateBreak':
        this.noise(out, 0.7, 0.004, 0.22, 'lowpass', 1400, 220);
        this.tone(out, 'triangle', 0.3, 0.002, 0.1, 180, 70);
        break;
      case 'wallBreak':
        this.noise(out, 0.9, 0.005, 0.5, 'lowpass', 1000, 120);
        break;
      case 'enemyPainA':
        this.tone(out, 'sawtooth', 0.5, 0.01, 0.16, 160, 90);
        break;
      case 'enemyPainB':
        this.tone(out, 'square', 0.4, 0.01, 0.14, 520, 300);
        break;
      case 'enemyDieA':
        this.tone(out, 'sawtooth', 0.6, 0.02, 0.5, 200, 40);
        this.noise(out, 0.4, 0.01, 0.4, 'lowpass', 900, 150);
        break;
      case 'enemyDieB':
        this.tone(out, 'square', 0.5, 0.01, 0.4, 800, 100);
        this.noise(out, 0.4, 0.005, 0.3, 'bandpass', 1500, 300);
        break;
      case 'huskAlert':
        this.tone(out, 'sawtooth', 0.45, 0.03, 0.3, 110, 190);
        this.tone(out, 'sawtooth', 0.35, 0.02, 0.25, 55, 95, 0.08);
        break;
      case 'huskBite':
        this.noise(out, 0.5, 0.002, 0.08, 'highpass', 1500);
        this.tone(out, 'square', 0.35, 0.002, 0.06, 200, 90);
        break;
      case 'huskStep':
        // dry chitinous tick
        this.noise(out, 0.16, 0.002, 0.03, 'highpass', 2400);
        this.tone(out, 'triangle', 0.1, 0.002, 0.03, 150, 70);
        break;
      case 'huskGrowl':
        this.tone(out, 'sawtooth', 0.3, 0.06, 0.4, 72, 52);
        this.tone(out, 'sawtooth', 0.18, 0.05, 0.3, 145, 95, 0.05);
        break;
      case 'sentinelAlert':
        this.tone(out, 'square', 0.3, 0.02, 0.2, 880, 1200);
        this.tone(out, 'square', 0.3, 0.02, 0.2, 660, 880, 0.1);
        break;
      case 'playerPain':
        this.tone(out, 'square', 0.5, 0.005, 0.12, 220, 140);
        this.tone(out, 'square', 0.4, 0.005, 0.1, 180, 110, 0.09);
        break;
      case 'playerDie':
        this.tone(out, 'sawtooth', 0.7, 0.02, 0.9, 300, 40);
        this.noise(out, 0.5, 0.02, 0.8, 'lowpass', 800, 100);
        break;
      case 'pickup':
        this.tone(out, 'square', 0.3, 0.005, 0.07, 660);
        this.tone(out, 'square', 0.3, 0.005, 0.09, 880, undefined, 0.07);
        break;
      case 'pickupKey':
        this.tone(out, 'triangle', 0.4, 0.005, 0.1, 523);
        this.tone(out, 'triangle', 0.4, 0.005, 0.1, 659, undefined, 0.09);
        this.tone(out, 'triangle', 0.4, 0.005, 0.16, 784, undefined, 0.18);
        break;
      case 'pickupWeapon':
        this.tone(out, 'sawtooth', 0.35, 0.01, 0.12, 220);
        this.tone(out, 'sawtooth', 0.35, 0.01, 0.12, 330, undefined, 0.08);
        this.tone(out, 'sawtooth', 0.4, 0.01, 0.2, 440, undefined, 0.16);
        break;
      case 'secret':
        this.tone(out, 'triangle', 0.4, 0.005, 0.12, 784);
        this.tone(out, 'triangle', 0.4, 0.005, 0.12, 988, undefined, 0.1);
        this.tone(out, 'triangle', 0.45, 0.005, 0.25, 1319, undefined, 0.2);
        break;
      case 'doorOpen':
        this.noise(out, 0.4, 0.05, 0.5, 'bandpass', 300, 900);
        this.tone(out, 'sine', 0.2, 0.05, 0.4, 120, 260);
        break;
      case 'doorClose':
        this.noise(out, 0.4, 0.05, 0.4, 'bandpass', 800, 250);
        this.tone(out, 'sine', 0.25, 0.02, 0.3, 240, 100);
        break;
      case 'doorLocked':
        this.tone(out, 'square', 0.35, 0.005, 0.12, 110);
        this.tone(out, 'square', 0.35, 0.005, 0.12, 104, undefined, 0.15);
        break;
      case 'elevator':
        this.noise(out, 0.3, 0.1, 0.9, 'lowpass', 300);
        this.tone(out, 'sawtooth', 0.18, 0.1, 0.9, 55, 65);
        break;
      case 'step':
        // soft boot thud
        this.noise(out, 0.13, 0.005, 0.05, 'lowpass', 380, 160);
        break;
      case 'clank': {
        // distant facility noise, randomized pitch so it never sounds canned
        const pitch = 150 + Math.random() * 280;
        this.tone(out, 'triangle', 0.2, 0.005, 0.45 + Math.random() * 0.4, pitch, pitch * 0.55);
        this.noise(out, 0.1, 0.004, 0.2, 'bandpass', pitch * 5, pitch * 2);
        break;
      }
      case 'win':
        this.tone(out, 'square', 0.35, 0.01, 0.15, 523);
        this.tone(out, 'square', 0.35, 0.01, 0.15, 659, undefined, 0.13);
        this.tone(out, 'square', 0.35, 0.01, 0.15, 784, undefined, 0.26);
        this.tone(out, 'square', 0.4, 0.01, 0.5, 1047, undefined, 0.39);
        break;
    }
  }
}
