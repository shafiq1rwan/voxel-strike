import * as THREE from 'three';

export class Renderer {
  /** internal render height — output is CSS-upscaled with pixelated rendering */
  private resH = 240;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /**
   * First-person weapon pass: drawn after the world over a cleared depth
   * buffer, so the gun never clips into walls yet its parts still occlude
   * each other properly. Its camera sits at the origin with a fixed FOV —
   * the FOV setting and FOV punches don't stretch the gun.
   */
  readonly overlay = new THREE.Scene();
  private readonly overlayCamera = new THREE.PerspectiveCamera(75, 1, 0.01, 10);
  readonly fogColor = new THREE.Color(0x070a10);
  readonly fogNear = 13;
  readonly fogFar = 52;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    parent.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = this.fogColor;
    this.scene.fog = new THREE.Fog(this.fogColor, this.fogNear, this.fogFar);

    // far plane just past total fog: anything beyond is background-coloured
    // anyway, so frustum culling drops it instead of drawing it invisibly
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, this.fogFar + 2);
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize(): void {
    // body dimensions, not window: in forced-landscape mode (touch devices
    // held in portrait) the body is rotated 90° and its box is the game view
    const w0 = document.body.clientWidth || window.innerWidth;
    const h0 = document.body.clientHeight || window.innerHeight;
    const aspect = w0 / Math.max(1, h0);
    const w = Math.round(this.resH * aspect);
    this.renderer.setSize(w, this.resH, false);
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.overlayCamera.aspect = aspect;
    this.overlayCamera.updateProjectionMatrix();
  }

  setResolution(h: number): void {
    if (h === this.resH) return;
    this.resH = h;
    this.resize();
  }

  /**
   * Compile every material's shader and upload every texture up front.
   * three.js otherwise does both on first draw, so the first rocket (pooled
   * projectile, launcher model, its flash) froze a phone for ~100ms. compile()
   * alone isn't enough: the driver links in the background and three.js
   * blocks on the result at the program's first USE (getProgramInfoLog), so
   * every program is also finalised here, during the load. Hidden
   * objects — pooled projectiles, the guns not in hand — are shown just for
   * the compile. Call after a level's scene objects are in place.
   */
  warmUp(): void {
    const hidden: THREE.Object3D[] = [];
    const textures = new Set<THREE.Texture>();
    const visit = (o: THREE.Object3D): void => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
      const mat = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        const map = (m as THREE.MeshBasicMaterial).map;
        if (map) textures.add(map);
      }
    };
    this.scene.traverse(visit);
    this.overlay.traverse(visit);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.overlay, this.overlayCamera);
    for (const t of textures) this.renderer.initTexture(t);
    // finalise each linked program now (three.js' lazy first-use step)
    for (const p of this.renderer.info.programs ?? []) {
      (p as unknown as { getUniforms(): unknown }).getUniforms();
    }
    for (const o of hidden) o.visible = false;
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
    if (!this.overlay.children.some((o) => o.visible)) return;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.overlay, this.overlayCamera);
    this.renderer.autoClear = true;
  }
}
