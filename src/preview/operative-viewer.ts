import * as THREE from 'three';
import { buildOperative, OPERATIVE_GRIPS } from '../entities/operative';
import { buildWeaponModel, ORDER } from '../weapons/weapons';
import type { WeaponId } from '../types';
import refUrl from '../../reference/main-character-facility-operative.png?url';

/**
 * Character viewer for the Facility Operative (`?operative` on web builds,
 * lazy-loaded, never in the Poki build). Two modes:
 *  - SHEET: front / side / back orthographic + a 3/4 perspective, laid out
 *    like the concept sheet so the two can be compared view for view;
 *  - ORBIT: drag to turn, wheel / pinch to zoom, snap to any view, walk cycle.
 * COMPARE splits the screen with the reference image; 240P renders at the
 * game's internal resolution to judge how it reads in play.
 */

const BG = 0x27282b; // the reference sheet's backdrop
const TARGET_Y = 0.9;

type Mode = 'sheet' | 'orbit';

const CSS = `
#opv { position: fixed; inset: 0; display: flex; flex-direction: column; background: #27282b;
  font-family: 'Courier New', Courier, monospace; color: #c9ced8; }
#opv * { box-sizing: border-box; }
#opv-ref { flex: 1 1 50%; min-height: 0; background: #27282b; display: none; border-bottom: 1px solid #3a3d44; }
#opv-ref img { width: 100%; height: 100%; object-fit: contain; display: block; }
#opv.compare #opv-ref { display: block; }
#opv-stage { position: relative; flex: 1 1 50%; min-height: 0; }
#opv-stage canvas { position: absolute; inset: 0; width: 100% !important; height: 100% !important;
  display: block; touch-action: none; image-rendering: pixelated; }
#opv-bar { position: absolute; top: 0; left: 0; right: 0; display: flex; flex-wrap: wrap; align-items: center;
  gap: 6px; padding: 10px 12px; pointer-events: none; z-index: 2; }
#opv-title { font-weight: bold; font-size: 18px; letter-spacing: 3px; color: #d8dce4; margin-right: auto; }
.opv-btn { pointer-events: auto; font: bold 12px 'Courier New', Courier, monospace; letter-spacing: 2px;
  color: #c9ced8; background: #1d1f24; border: 1px solid #4a4f5a; padding: 7px 10px; cursor: pointer; }
.opv-btn:hover { border-color: #ffd028; color: #ffd028; }
.opv-btn.on { background: #ffd028; border-color: #ffd028; color: #15161a; }
.opv-gap { width: 8px; }
.opv-label { position: absolute; transform: translateX(-50%); font-weight: bold; font-size: 15px;
  letter-spacing: 3px; color: #c9ced8; pointer-events: none; z-index: 1; }
#opv-foot { position: absolute; left: 0; right: 0; bottom: 10px; text-align: center; font-weight: bold;
  font-size: 13px; letter-spacing: 3px; color: #9aa1ad; pointer-events: none; }
#opv-hint { position: absolute; left: 12px; bottom: 10px; font-size: 12px; color: #7d8390; pointer-events: none; }
`;

export function startOperativeViewer(app: HTMLElement): void {
  document.title = 'VOXELSTRIKE — Facility Operative';
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'opv';
  root.innerHTML = `
    <div id="opv-ref"><img alt="Facility Operative concept sheet" src="${refUrl}"></div>
    <div id="opv-stage">
      <div id="opv-bar">
        <span id="opv-title">FACILITY OPERATIVE</span>
        <button class="opv-btn" data-mode="sheet">SHEET</button>
        <button class="opv-btn" data-mode="orbit">ORBIT</button>
        <span class="opv-gap"></span>
        <button class="opv-btn orbit-only" data-view="front">FRONT</button>
        <button class="opv-btn orbit-only" data-view="side">SIDE</button>
        <button class="opv-btn orbit-only" data-view="back">BACK</button>
        <button class="opv-btn orbit-only" data-view="tq">3/4</button>
        <button class="opv-btn orbit-only" id="opv-walk">WALK</button>
        <button class="opv-btn orbit-only" id="opv-jump">JUMP</button>
        <button class="opv-btn" id="opv-gun">GUN: NONE</button>
        <button class="opv-btn on" id="opv-helmet">HELMET: ON</button>
        <button class="opv-btn" id="opv-hands">FINGERS: RELAXED</button>
        <button class="opv-btn orbit-only" id="opv-spin">SPIN</button>
        <span class="opv-gap"></span>
        <button class="opv-btn" id="opv-low">240P</button>
        <button class="opv-btn" id="opv-compare">COMPARE</button>
        <button class="opv-btn" id="opv-play">PLAY FPS</button>
        <button class="opv-btn" id="opv-exit">GAME</button>
      </div>
      <div id="opv-foot"></div>
      <div id="opv-hint"></div>
    </div>`;
  app.appendChild(root);
  const stage = root.querySelector('#opv-stage') as HTMLElement;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace; // the game's raw-colour convention
  renderer.setClearColor(new THREE.Color().setHex(BG, THREE.LinearSRGBColorSpace));
  stage.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const rig = buildOperative({ shading: 'lit' });
  scene.add(rig.root);
  // studio rig like the sheet's: soft ambient, a key from above-front, a cool
  // fill from behind. Intensities are in albedo units ×π (three's physical
  // lights): front ≈ 0.87, top ≈ 1.05, back ≈ 0.9 (the sheet lights its back view like the front), sides ≈ 0.69–0.7.
  scene.add(new THREE.AmbientLight(0xffffff, 0.5 * Math.PI));
  const key = new THREE.DirectionalLight(0xffffff, 0.62 * Math.PI);
  key.position.set(-0.3, 0.75, -0.6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdce6ff, 0.49 * Math.PI);
  fill.position.set(0.4, 0.3, 0.8);
  scene.add(fill);
  // orbit-mode floor: a slightly lighter square so the feet read as planted
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 2.4),
    new THREE.MeshBasicMaterial({ color: new THREE.Color().setHex(0x303238, THREE.LinearSRGBColorSpace) }), // unlit backdrop
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.001;
  scene.add(floor);

  // ---- sheet cameras: orthographic front / side / back + perspective 3/4
  const ortho = (x: number, z: number): THREE.OrthographicCamera => {
    const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20);
    c.position.set(x, TARGET_Y, z);
    c.lookAt(0, TARGET_Y, 0);
    return c;
  };
  const front = ortho(0, -6); // front is -Z
  // the wearer's left side, front to the left of the panel — turned ~14° towards
  // the front like the sheet's, so the visor and respirator read
  const side = ortho(-6 * Math.cos(0.25), -6 * Math.sin(0.25));
  const back = ortho(0, 6);
  const tq = new THREE.PerspectiveCamera(24, 1, 0.1, 30);
  // the sheet's 3/4: turned ~33° towards the wearer's left, a little above
  const TQ_YAW = 0.58;
  const tqDir = new THREE.Vector3(-Math.sin(TQ_YAW), 0.17, -Math.cos(TQ_YAW)).normalize();
  tq.position.copy(tqDir).multiplyScalar(5.3).add(new THREE.Vector3(0, TARGET_Y, 0));
  tq.lookAt(0, TARGET_Y - 0.02, 0);
  const panels: Array<{ cam: THREE.Camera; label: string; el: HTMLElement }> = [
    { cam: front, label: 'FRONT', el: document.createElement('div') },
    { cam: side, label: 'SIDE', el: document.createElement('div') },
    { cam: back, label: 'BACK', el: document.createElement('div') },
    { cam: tq, label: '3/4', el: document.createElement('div') },
  ];
  for (const p of panels) {
    p.el.className = 'opv-label';
    p.el.textContent = p.label;
    stage.appendChild(p.el);
  }

  const clock = new THREE.Clock();

  // ---- guns: the same box models as the first-person view and the floor
  // pickups (buildWeaponModel), carried two-handed at the chest
  const GUN_SCALE = 0.85;
  const guns = new Map<WeaponId, THREE.Object3D>();
  let gun: WeaponId | null = null;
  const setGun = (id: WeaponId | null): void => {
    gun = id;
    if (!id) {
      rig.hold(null);
      return;
    }
    let o = guns.get(id);
    if (!o) {
      const g = buildWeaponModel(id).group;
      g.scale.setScalar(GUN_SCALE); // drop the view model's own scale / offset
      g.position.set(0, 0, 0);
      o = g;
      guns.set(id, o);
    }
    rig.hold({ object: o, ...OPERATIVE_GRIPS[id] });
  };

  // ---- orbit camera
  const orbitCam = new THREE.PerspectiveCamera(32, 1, 0.05, 40);
  const VIEWS: Record<string, number> = { front: 0, side: -Math.PI / 2, back: Math.PI, tq: -0.58 };
  let yaw = VIEWS.tq;
  let pitch = 0.18;
  let dist = 4.4;
  let yawTo: number | null = null;
  let spin = true;
  let walk = false;
  let walkBlend = 0;
  let lastInput = -10;
  let camLift = 0;

  let mode: Mode = 'sheet';
  let low = false;
  let compare = false;

  const foot = root.querySelector('#opv-foot') as HTMLElement;
  const hint = root.querySelector('#opv-hint') as HTMLElement;


  const size = new THREE.Vector2();
  const resize = (): void => {
    const w = Math.max(1, stage.clientWidth);
    const h = Math.max(1, stage.clientHeight);
    if (low) {
      renderer.setPixelRatio(1);
      renderer.setSize(Math.round((240 * w) / h), 240, false);
    } else {
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setSize(w, h, false);
    }
    layoutLabels();
  };

  /** sheet panel rects in CSS pixels of the stage (4 across, or 2×2 when tall) */
  const panelRects = (): Array<{ x: number; y: number; w: number; h: number }> => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    const top = (root.querySelector('#opv-bar') as HTMLElement).offsetHeight + 4;
    const bottom = 36;
    const tall = w / Math.max(1, h - top - bottom) < 1.3;
    const rects = [];
    if (!tall) {
      // the 3/4 panel is a touch wider, as on the sheet
      const weights = [1, 0.8, 1, 1.15];
      const sum = weights.reduce((a, b) => a + b, 0);
      let x = 0;
      for (const wt of weights) {
        const pw = (w * wt) / sum;
        rects.push({ x, y: top, w: pw, h: h - top - bottom });
        x += pw;
      }
    } else {
      const ph = (h - top - bottom) / 2;
      for (let i = 0; i < 4; i++) rects.push({ x: (i % 2) * (w / 2), y: top + Math.floor(i / 2) * ph, w: w / 2, h: ph });
    }
    return rects;
  };

  const layoutLabels = (): void => {
    const rects = panelRects();
    panels.forEach((p, i) => {
      const r = rects[i];
      p.el.style.display = mode === 'sheet' ? 'block' : 'none';
      p.el.style.left = `${r.x + r.w / 2}px`;
      p.el.style.top = `${r.y + r.h - 24}px`;
    });
    foot.style.display = mode === 'sheet' ? 'block' : 'none';
    hint.textContent = mode === 'orbit' ? 'drag to turn · wheel / pinch to zoom' : '';
    for (const el of root.querySelectorAll<HTMLElement>('.orbit-only')) el.style.display = mode === 'orbit' ? '' : 'none';
    for (const el of root.querySelectorAll<HTMLElement>('[data-mode]')) el.classList.toggle('on', el.dataset.mode === mode);
    (root.querySelector('#opv-walk') as HTMLElement).classList.toggle('on', walk);
    const gunBtn = root.querySelector('#opv-gun') as HTMLElement;
    gunBtn.textContent = `GUN: ${gun ? gun.toUpperCase() : 'NONE'}`;
    gunBtn.classList.toggle('on', gun !== null);
    const helmetBtn = root.querySelector('#opv-helmet') as HTMLElement;
    helmetBtn.textContent = `HELMET: ${rig.helmet ? 'ON' : 'OFF'}`;
    helmetBtn.classList.toggle('on', rig.helmet);
    foot.textContent = `${rig.boxes} BOXES / RIGID JOINTS`;
    (root.querySelector('#opv-hands') as HTMLElement).textContent = `FINGERS: ${rig.handPose.toUpperCase()}`;
    (root.querySelector('#opv-spin') as HTMLElement).classList.toggle('on', spin);
    (root.querySelector('#opv-low') as HTMLElement).classList.toggle('on', low);
    (root.querySelector('#opv-compare') as HTMLElement).classList.toggle('on', compare);
  };

  // ---- UI
  root.addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button');
    if (!b) return;
    if (b.dataset.mode) mode = b.dataset.mode as Mode;
    else if (b.dataset.view) {
      yawTo = VIEWS[b.dataset.view];
      pitch = b.dataset.view === 'tq' ? 0.18 : 0.02;
      spin = false;
      lastInput = clock.elapsedTime;
    } else if (b.id === 'opv-walk') walk = !walk;
    else if (b.id === 'opv-jump') rig.jump(clock.elapsedTime);
    else if (b.id === 'opv-helmet') rig.setHelmet(!rig.helmet);
    else if (b.id === 'opv-hands') {
      // relaxed → fist → open: the fingers fold and unfold joint by joint
      rig.handPose = rig.handPose === 'relaxed' ? 'fist' : rig.handPose === 'fist' ? 'open' : 'relaxed';
    }
    else if (b.id === 'opv-gun') {
      // none → each gun in slot order → none
      const i = gun === null ? 0 : ORDER.indexOf(gun) + 1;
      setGun(i < ORDER.length ? ORDER[i] : null);
    }
    else if (b.id === 'opv-spin') spin = !spin;
    else if (b.id === 'opv-low') low = !low;
    else if (b.id === 'opv-compare') {
      compare = !compare;
      root.classList.toggle('compare', compare);
    } else if (b.id === 'opv-play') {
      // the campaign in first person as the operative, helmet as set here
      location.href = `${location.pathname}?play=operative${rig.helmet ? '' : '&helmet=0'}`;
      return;
    } else if (b.id === 'opv-exit') {
      location.href = location.pathname;
      return;
    }
    resize();
  });

  // drag to turn, wheel / pinch to zoom (orbit mode)
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch0 = 0;
  const canvas = renderer.domElement;
  canvas.addEventListener('pointerdown', (e) => {
    if (mode !== 'orbit') return;
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
    }
    yawTo = null;
    lastInput = clock.elapsedTime;
  });
  canvas.addEventListener('pointermove', (e) => {
    const prev = pointers.get(e.pointerId);
    if (!prev || mode !== 'orbit') return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.set(e.pointerId, cur);
    if (pointers.size === 1) {
      yaw -= (cur.x - prev.x) * 0.01;
      pitch = Math.max(-0.35, Math.min(1.2, pitch + (cur.y - prev.y) * 0.008));
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) dist = Math.max(1.4, Math.min(9, dist * (pinch0 / d)));
      pinch0 = d;
    }
    lastInput = clock.elapsedTime;
  });
  const up = (e: PointerEvent): void => {
    pointers.delete(e.pointerId);
    pinch0 = 0;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (mode !== 'orbit') return;
    e.preventDefault();
    dist = Math.max(1.4, Math.min(9, dist * Math.exp(e.deltaY * 0.001)));
    lastInput = clock.elapsedTime;
  }, { passive: false });

  // Space jumps (orbit mode), G cycles the gun
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && mode === 'orbit') {
      e.preventDefault();
      rig.jump(clock.elapsedTime);
    } else if (e.code === 'KeyG') {
      (root.querySelector('#opv-gun') as HTMLElement).click();
    } else if (e.code === 'KeyF') {
      (root.querySelector('#opv-hands') as HTMLElement).click();
    } else if (e.code === 'KeyH') {
      (root.querySelector('#opv-helmet') as HTMLElement).click();
    }
  });
  window.addEventListener('resize', resize);
  new ResizeObserver(resize).observe(stage);
  resize();

  // ---- frame
  const frame = (): void => {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;
    renderer.getSize(size);
    const cssW = stage.clientWidth;
    const k = size.x / Math.max(1, cssW); // renderer units per CSS px

    if (mode === 'sheet') {
      // the sheet is the neutral stance, exactly as drawn
      rig.animate(0, 0);
      floor.visible = false;
      renderer.setScissorTest(true);
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.setScissor(0, 0, size.x, size.y);
      renderer.clear();
      const rects = panelRects();
      const stageH = stage.clientHeight;
      panels.forEach((p, i) => {
        const r = rects[i];
        // leave room for the label under each figure
        const vx = r.x * k;
        const vy = (stageH - r.y - r.h + 30) * k;
        const vw = r.w * k;
        const vh = (r.h - 30) * k;
        renderer.setViewport(vx, vy, vw, vh);
        renderer.setScissor(vx, vy, vw, vh);
        const aspect = vw / Math.max(1, vh);
        if (p.cam instanceof THREE.OrthographicCamera) {
          const halfH = 1.0;
          p.cam.top = halfH;
          p.cam.bottom = -halfH;
          p.cam.left = -halfH * aspect;
          p.cam.right = halfH * aspect;
          p.cam.updateProjectionMatrix();
        } else if (p.cam instanceof THREE.PerspectiveCamera) {
          p.cam.aspect = aspect;
          p.cam.updateProjectionMatrix();
        }
        renderer.render(scene, p.cam);
      });
      renderer.setScissorTest(false);
    } else {
      walkBlend += ((walk ? 1 : 0) - walkBlend) * Math.min(1, dt * 5);
      rig.animate(t, walkBlend);
      floor.visible = true;
      if (yawTo !== null) {
        // ease the shortest way round to the chosen view
        let d = yawTo - yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        yaw += d * Math.min(1, dt * 8);
        if (Math.abs(d) < 0.002) yawTo = null;
      } else if (spin && t - lastInput > 2.5) {
        yaw += dt * 0.45;
      }
      const cp = Math.cos(pitch);
      // follow most of a jump so the operative stays in frame at the top
      const body = rig.root.children[0].position.y;
      camLift += (Math.max(0, body) * 0.75 - camLift) * Math.min(1, dt * 10);
      // zooming in drifts the aim up to the head (from ~3u in, fully by 1.4u)
      const ty = TARGET_Y + camLift + Math.max(0, Math.min(1, (3 - dist) / 1.6)) * 0.68;
      orbitCam.position.set(Math.sin(yaw) * cp * dist, ty + Math.sin(pitch) * dist, -Math.cos(yaw) * cp * dist);
      orbitCam.lookAt(0, ty, 0);
      orbitCam.aspect = size.x / Math.max(1, size.y);
      orbitCam.updateProjectionMatrix();
      renderer.setViewport(0, 0, size.x, size.y);
      renderer.render(scene, orbitCam);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  // debug handle for screenshots / tests
  (window as unknown as { __operative: unknown }).__operative = {
    rig,
    setMode: (m: Mode) => { mode = m; resize(); },
    setGun: (id: WeaponId | null) => { setGun(id); layoutLabels(); },
    setHelmet: (on: boolean) => { rig.setHelmet(on); layoutLabels(); },
    setHands: (p: 'relaxed' | 'fist' | 'open') => { rig.handPose = p; layoutLabels(); },
    jump: () => rig.jump(clock.elapsedTime),
    setWalk: (on: boolean) => { walk = on; layoutLabels(); },
    setOrbit: (y: number, p: number, d: number) => { yaw = y; pitch = p; dist = d; yawTo = null; spin = false; },
    setView: (v: string) => { yaw = VIEWS[v]; yawTo = null; spin = false; pitch = v === 'tq' ? 0.18 : 0.02; },
  };
}
