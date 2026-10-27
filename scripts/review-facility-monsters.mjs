// Reproducible visual audit of Claude's Facility rigs against sector-monsters-v2.
import puppeteer from 'puppeteer-core';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const out = 'scripts/shots/sector-monsters-v2-review';
mkdirSync(out, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1500, height: 1100 },
});
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2] ?? 'http://localhost:5173/?seed=12345', { waitUntil: 'networkidle0' });
  const result = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Enemy, EnemyManager } = await import('/src/entities/enemies.ts');
    const g = window.__voxelstrike;
    g.state = 'paused';
    const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setSize(500, 320);
    const sheet = document.createElement('canvas'); sheet.width = 1500; sheet.height = 1440;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#111e2b'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e2d0af'; ctx.font = 'bold 28px monospace';
    ctx.fillText('CLAUDE IMPLEMENTATION / ACTUAL RIGS', 750, 38);
    const stats = {};
    for (const [col, kind] of ['sentryBud', 'clampGuard', 'wireLeech'].entries()) {
      const e = new Enemy({ kind, x: 0, z: 0, roomId: 0 }, null, 0, false);
      e.attachBody(true); e.vel.set(0, 0, 0); e.awake = true;
      const scene = new THREE.Scene(); scene.background = new THREE.Color().setRGB(.067, .105, .15);
      scene.add(e.body);
      const floor = new THREE.Mesh(new THREE.BoxGeometry(8, .02, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(.1, .15, .2) }));
      scene.add(floor);
      const bounds = new THREE.Box3().setFromObject(e.body);
      floor.position.y = bounds.min.y - .02;
      const center = bounds.getCenter(new THREE.Vector3());
      const span = 2.9;
      const camera = new THREE.OrthographicCamera(-span * .78, span * .78, span * .5, -span * .5, .01, 100);
      camera.position.copy(center).add(new THREE.Vector3(4, 2.4, -7)); camera.lookAt(center);
      stats[kind] = {};
      for (const [row, phase] of ['idle', 'prep', 'release', 'recover'].entries()) {
        e.state = phase === 'idle' ? 'idle' : 'attack';
        e.phase = phase === 'idle' ? 'prep' : phase === 'release' ? (kind === 'clampGuard' ? 'strike' : 'recover') : phase;
        e.phaseT = phase === 'prep' ? ({ sentryBud: .9, clampGuard: .8, wireLeech: 1.0 })[kind] : phase === 'release' ? (kind === 'clampGuard' ? .18 : 0) : .25;
        e.facility.pose(0);
        renderer.render(scene, camera);
        stats[kind][phase] = { draws: renderer.info.render.calls - 1 };
        ctx.drawImage(renderer.domElement, col * 500, 60 + row * 340);
        ctx.fillStyle = '#e2d0af'; ctx.font = 'bold 22px monospace';
        ctx.fillText(`${kind} / ${phase}`, col * 500 + 250, 380 + row * 340);
      }
      let boxes = 0; e.body.traverse(o => { if (o.isMesh) boxes++; });
      stats[kind].boxes = boxes;
      e.mesh.add(e.body);
      if (kind === 'wireLeech') {
        const manager = new EnemyManager(); manager.list.push(e);
        e.state = 'attack'; e.phase = 'prep'; e.phaseT = 1; e.facility.pose(0);
        e.mesh.updateMatrixWorld(true);
        const top = e.body.getObjectByName('coil-top');
        const point = top.getWorldPosition(new THREE.Vector3());
        stats[kind].coilTop = {
          heightAboveBodyCenter: point.y - e.pos.y,
          bodyHitboxHalfHeight: e.half.y,
          gameRayHits: !!manager.raycast(point.x, point.y, point.z - 4, 0, 0, 1, 8),
          visibleCopperRayHits: new THREE.Raycaster(point.clone().add(new THREE.Vector3(0, 0, -4)), new THREE.Vector3(0, 0, 1)).intersectObject(top).length > 0,
        };
        e.phase = 'recover'; e.phaseT = .25; e.facility.pose(0); e.mesh.updateMatrixWorld(true);
        const coil = e.body.getObjectByName('coil-hinge');
        const hole = coil.localToWorld(new THREE.Vector3(.1, .36, 0));
        const direction = new THREE.Vector3(0, 0, 1).transformDirection(coil.matrixWorld);
        const origin = hole.clone().addScaledVector(direction, -4);
        const hit = manager.raycast(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, 8);
        stats[kind].coilHoleDuringRecovery = {
          visibleCopperRayHits: new THREE.Raycaster(origin, direction).intersectObject(coil, true).length > 0,
          gameCountsAsCoil: !!hit && origin.y + direction.y * hit.t > e.pos.y + .08,
        };
      }
      e.facility.dispose();
    }
    renderer.dispose();
    return { png: sheet.toDataURL(), stats };
  });
  writeFileSync(`${out}/actual-rigs.png`, Buffer.from(result.png.split(',')[1], 'base64'));
  writeFileSync(`${out}/rig-stats.json`, JSON.stringify(result.stats, null, 2));
  const comparison = await page.evaluate(async ({ refs, actual }) => {
    const load = src => new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.src = src; });
    const [one, two, runtime] = await Promise.all([...refs, actual].map(load));
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 1160;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#111e2b'; ctx.fillRect(0, 0, 1200, 1160);
    ctx.textAlign = 'center'; ctx.fillStyle = '#e2d0af'; ctx.font = 'bold 26px monospace';
    ctx.fillText('SECTOR-MONSTERS-V2 REFERENCE', 300, 35); ctx.fillText('CLAUDE / ACTUAL RIG', 900, 35);
    const crops = [[one, 1150, 65, 370, 270], [one, 345, 520, 410, 270], [two, 925, 65, 600, 280]];
    for (let i = 0; i < 3; i++) {
      const [img, x, y, w, h] = crops[i], scale = Math.min(570 / w, 315 / h), top = 55 + i * 365;
      ctx.drawImage(img, x, y, w, h, 300 - w * scale / 2, top, w * scale, h * scale);
      ctx.drawImage(runtime, i * 500, 60, 500, 320, 600, top, 600, 320);
      ctx.fillStyle = '#e2d0af'; ctx.font = 'bold 23px monospace';
      ctx.fillText(['SENTRY BUD', 'CLAMP GUARD', 'WIRE LEECH'][i], 600, top + 345);
    }
    return canvas.toDataURL();
  }, {
    refs: ['01-facility-entry-security.png', '02-reactor-biofoundry.png'].map(name => `data:image/png;base64,${readFileSync(`reference/sector-monsters-v2/${name}`).toString('base64')}`),
    actual: result.png,
  });
  writeFileSync(`${out}/reference-vs-runtime.png`, Buffer.from(comparison.split(',')[1], 'base64'));
  console.log(JSON.stringify(result.stats, null, 2));
} finally { await browser.close(); }
