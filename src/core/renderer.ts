import * as THREE from 'three';

export class Renderer {
  /** internal render height — output is CSS-upscaled with pixelated rendering */
  private resH = 240;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
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

    this.camera = new THREE.PerspectiveCamera(75, 1, 0.08, 120);
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
  }

  setResolution(h: number): void {
    if (h === this.resH) return;
    this.resH = h;
    this.resize();
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }
}
