/**
 * Armory turntable: the real gun model (`buildWeaponModel`) in a chosen
 * skin, on its own small WebGL canvas. Rendered at half resolution with
 * nearest-neighbour scaling so it keeps the game's chunky look; spins slowly
 * on its own and can be dragged round. One context per Armory visit: `stop()`
 * frees it (renderer, model geometry + materials) when the screen closes.
 */
import * as THREE from 'three';
import { buildWeaponModel } from '../weapons/weapons';
import type { SkinDef } from '../core/skins';
import type { WeaponId } from '../types';

export interface ArmoryPreview {
  show(weapon: WeaponId, skin: SkinDef | null): void;
  stop(): void;
}

export function startArmoryPreview(canvas: HTMLCanvasElement): ArmoryPreview {
  let renderer: THREE.WebGLRenderer | null = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  } catch {
    // no second context available: the list still works, just no turntable
    return { show: () => {}, stop: () => {} };
  }
  // the view model's colours are raw palette values, like the game's own pass
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 16 / 9, 0.05, 20);
  const pivot = new THREE.Group();
  scene.add(pivot);
  let model: THREE.Group | null = null;
  let raf = 0;
  let spin = 0;
  let dragYaw = 0;
  let dragging = false;
  let lastX = 0;
  let w = 0, h = 0;
  // the gun's side profile: length (model z) and height (model y)
  let len = 1, ht = 0.3;

  // frame the gun so every one looks about the same SIZE: its side
  // profile's area (length × height) maps to the same share of the stage,
  // capped at 70% of the width and 55% of the height. (Fitting the longest
  // side blew the stubby Sidearm up to twice the size of the rest; fitting
  // the height shrank it and the Ripper next to the fat Thumper.)
  const place = (): void => {
    const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(
      Math.sqrt(len * ht) / (2 * 0.63 * tv),
      len / (2 * 0.7 * tv * camera.aspect),
      ht / (2 * 0.55 * tv),
    );
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
  };

  const dispose = (g: THREE.Object3D): void => {
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  };

  const fit = (): void => {
    const cw = Math.max(1, canvas.clientWidth), ch = Math.max(1, canvas.clientHeight);
    if (cw === w && ch === h) return;
    w = cw;
    h = ch;
    renderer!.setPixelRatio(Math.min(1, window.devicePixelRatio || 1) * 0.5);
    renderer!.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    place();
  };

  const frame = (t: number): void => {
    raf = requestAnimationFrame(frame);
    fit();
    if (!dragging) {
      spin = Math.sin(t * 0.0006) * 0.55;
    }
    // side-on, muzzle to the left, tipped a little so the top shows
    pivot.rotation.set(0.32, Math.PI / 2 + spin + dragYaw, 0, 'YXZ');
    renderer!.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  const onDown = (e: PointerEvent): void => {
    dragging = true;
    lastX = e.clientX;
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent): void => {
    if (!dragging) return;
    dragYaw += (e.clientX - lastX) * 0.012;
    lastX = e.clientX;
  };
  const onUp = (): void => { dragging = false; };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);

  return {
    show(weapon, skin) {
      if (model) {
        pivot.remove(model);
        dispose(model);
      }
      const m = buildWeaponModel(weapon, skin);
      model = m.group;
      // centre the gun on the pivot and back the camera off to frame it
      model.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const c = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      model.position.sub(c);
      pivot.add(model);
      len = size.z;
      ht = size.y;
      place();
      dragYaw = 0;
      canvas.dataset.model = `${weapon}.${skin?.id.split('.')[1] ?? 'standard'}`;
    },
    stop() {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      if (model) dispose(model);
      model = null;
      renderer!.dispose();
      renderer!.forceContextLoss();
      renderer = null;
    },
  };
}
