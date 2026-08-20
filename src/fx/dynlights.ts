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

  private submissions: Submission[] = [];
  private flashes: Flash[] = [];

  constructor() {
    for (let i = 0; i < MAX_DYN_LIGHTS; i++) {
      this.uniforms.uLightPos.value.push(new THREE.Vector3(0, -999, 0));
      this.uniforms.uLightColor.value.push(new THREE.Color(0, 0, 0));
      this.uniforms.uLightRange.value.push(0.0001);
    }
  }

  /** Submit a light for this frame only. */
  submit(x: number, y: number, z: number, r: number, g: number, b: number, intensity: number, range: number): void {
    this.submissions.push({ x, y, z, r, g, b, intensity, range });
  }

  /** Submit a light that decays over `duration` seconds. */
  flash(x: number, y: number, z: number, r: number, g: number, b: number, intensity: number, range: number, duration: number): void {
    this.flashes.push({ x, y, z, r, g, b, intensity, range, ttl: duration, duration });
  }

  /** Total dynamic light at a point (for CPU-lit entities). Returns 0..~1 rgb. */
  sampleAt(x: number, y: number, z: number): [number, number, number] {
    let r = 0, g = 0, b = 0;
    for (const s of this.submissions) {
      const dx = s.x - x, dy = s.y - y, dz = s.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const att = Math.max(0, 1 - d / s.range);
      const f = att * att * s.intensity;
      r += s.r * f; g += s.g * f; b += s.b * f;
    }
    return [r, g, b];
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
      this.submissions.push({ x: f.x, y: f.y, z: f.z, r: f.r, g: f.g, b: f.b, intensity: f.intensity * k, range: f.range });
    }
    // rank by intensity weighted by proximity to camera
    this.submissions.sort((a, b2) => {
      const da = camPos.distanceTo(new THREE.Vector3(a.x, a.y, a.z)) + 1;
      const db = camPos.distanceTo(new THREE.Vector3(b2.x, b2.y, b2.z)) + 1;
      return (b2.intensity * b2.range) / db - (a.intensity * a.range) / da;
    });
    for (let i = 0; i < MAX_DYN_LIGHTS; i++) {
      const s = this.submissions[i];
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
    this.submissions.length = 0;
  }
}
