import * as THREE from 'three';

export const MAX_DYN_LIGHTS = 6;

interface Flash {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  intensity: number;
  range: number;
  ttl: number;
  duration: number;
}

interface Submission {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  intensity: number;
  range: number;
  /** ranking key, computed once per frame in update() */
  score: number;
}

/**
 * Small pool of dynamic point lights fed to the chunk shader each frame.
 * Sources (muzzle flashes, rockets, explosions) submit lights per frame;
 * the brightest few near the camera win the uniform slots.
 */
export class DynLights {
  readonly uniforms = {
    uLightPos: { value: [] as THREE.Vector3[] },
    uLightColor: { value: [] as THREE.Color[] },
    uLightRange: { value: [] as number[] },
  };

  /**
   * This frame's lights. Entries are pooled: `count` is the live length, the
   * array only grows — no per-frame allocation (a hitch source on phones).
   */
  private submissions: Submission[] = [];
  private count = 0;
  private flashes: Flash[] = [];

  private push(x: number, y: number, z: number, r: number, g: number, b: number, intensity: number, range: number): void {
    let s = this.submissions[this.count];
    if (!s) {
      s = { x: 0, y: 0, z: 0, r: 0, g: 0, b: 0, intensity: 0, range: 0, score: 0 };
      this.submissions.push(s);
    }
    s.x = x; s.y = y; s.z = z;
    s.r = r; s.g = g; s.b = b;
    s.intensity = intensity;
    s.range = range;
    this.count++;
  }

  constructor() {
    for (let i = 0; i < MAX_DYN_LIGHTS; i++) {
      this.uniforms.uLightPos.value.push(new THREE.Vector3(0, -999, 0));
      this.uniforms.uLightColor.value.push(new THREE.Color(0, 0, 0));
      this.uniforms.uLightRange.value.push(0.0001);
    }
  }

  /** Submit a light for this frame only. */
  submit(x: number, y: number, z: number, r: number, g: number, b: number, intensity: number, range: number): void {
    this.push(x, y, z, r, g, b, intensity, range);
  }

  /** Submit a light that decays over `duration` seconds. */
  flash(x: number, y: number, z: number, r: number, g: number, b: number, intensity: number, range: number, duration: number): void {
    this.flashes.push({ x, y, z, r, g, b, intensity, range, ttl: duration, duration });
  }

  /** Total dynamic light at a point (for CPU-lit entities). Returns 0..~1 rgb. */
  sampleAt(x: number, y: number, z: number, out: [number, number, number] = [0, 0, 0]): [number, number, number] {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < this.count; i++) {
      const s = this.submissions[i];
      const dx = s.x - x, dy = s.y - y, dz = s.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const att = Math.max(0, 1 - d / s.range);
      const f = att * att * s.intensity;
      r += s.r * f; g += s.g * f; b += s.b * f;
    }
    out[0] = r; out[1] = g; out[2] = b;
    return out;
  }

  update(dt: number, camPos: THREE.Vector3): void {
    // decay flashes into this frame's submissions
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.ttl -= dt;
      if (f.ttl <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      const k = f.ttl / f.duration;
      this.push(f.x, f.y, f.z, f.r, f.g, f.b, f.intensity * k, f.range);
    }
    // rank by intensity weighted by proximity to camera: only the top few
    // matter, so a partial selection over precomputed scores (no sort, no
    // allocation)
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const s = this.submissions[i];
      const dx = s.x - camPos.x, dy = s.y - camPos.y, dz = s.z - camPos.z;
      s.score = (s.intensity * s.range) / (Math.sqrt(dx * dx + dy * dy + dz * dz) + 1);
    }
    for (let i = 0; i < Math.min(MAX_DYN_LIGHTS, n); i++) {
      let best = i;
      for (let j = i + 1; j < n; j++) if (this.submissions[j].score > this.submissions[best].score) best = j;
      if (best !== i) {
        const t = this.submissions[i];
        this.submissions[i] = this.submissions[best];
        this.submissions[best] = t;
      }
    }
    for (let i = 0; i < MAX_DYN_LIGHTS; i++) {
      const s = i < n ? this.submissions[i] : null;
      if (s) {
        this.uniforms.uLightPos.value[i].set(s.x, s.y, s.z);
        this.uniforms.uLightColor.value[i].setRGB(s.r * s.intensity, s.g * s.intensity, s.b * s.intensity);
        this.uniforms.uLightRange.value[i] = s.range;
      } else {
        this.uniforms.uLightPos.value[i].set(0, -999, 0);
        this.uniforms.uLightColor.value[i].setRGB(0, 0, 0);
        this.uniforms.uLightRange.value[i] = 0.0001;
      }
    }
  }

  /** Call at end of frame after all consumers have sampled. */
  clearFrame(): void {
    this.count = 0;
  }
}
