// Render budgets and real geometry/weapon regression checks for the Facility rigs.
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
const browser = await puppeteer.launch({
  executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'], defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser);
let failed = 0;
const check = (ok, message) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${message}`); if (!ok) failed++; };
try {
  const page = await browser.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(process.argv[2] ?? 'http://localhost:5173/?seed=12345', { waitUntil: 'networkidle0' });
  const data = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Enemy, EnemyManager } = await import('/src/entities/enemies.ts');
    const g = window.__voxelstrike; g.state = 'paused';
    const renderer = new THREE.WebGLRenderer({ antialias: false }); renderer.setSize(128, 128);
    const draws = {}, boxes = {}, feet = {};
    for (const kind of ['sentryBud', 'clampGuard', 'wireLeech']) {
      const e = new Enemy({ kind, x: 0, z: 0, roomId: 0 }, null, 0, false);
      const scene = new THREE.Scene(); scene.add(e.mesh);
      const camera = new THREE.OrthographicCamera(-3, 3, 3, -3, .01, 30); camera.position.set(4, 3, -7); camera.lookAt(0, .7, 0);
      draws[kind] = [];
      for (const phase of ['idle', 'prep', 'strike', 'recover']) {
        e.state = phase === 'idle' ? 'idle' : 'attack'; e.phase = phase === 'idle' ? 'prep' : phase;
        e.phaseT = phase === 'prep' ? .85 : phase === 'strike' ? .19 : .25; e.facility.pose(0);
        renderer.render(scene, camera); draws[kind].push(renderer.info.render.calls);
      }
      boxes[kind] = e.body.userData.boxCount;
      e.state = 'idle'; e.facility.pose(0); e.mesh.updateWorldMatrix(true, true);
      feet[kind] = new THREE.Box3().setFromObject(e.mesh).min.y;
      e.disposeArt(); e.mesh.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    }
    renderer.dispose();

    // Compare gameplay hits with the actual baked triangles from front/side/above.
    // Includes rotated, scaled, moving-pivot and occlusion-detached rigs.
    const e = new Enemy({ kind: 'wireLeech', x: 4, z: 5, roomId: 0 }, null, 0, false);
    const manager = new EnemyManager(); manager.list.push(e);
    e.mesh.scale.setScalar(1.07);
    const ray = new THREE.Raycaster(); let samples = 0, mismatches = 0, coreHits = 0, holeMisses = 0;
    const examples = [];
    for (const yaw of [0, .8, 2.1]) for (const phase of ['idle', 'prep', 'recover']) {
      e.mesh.rotation.y = yaw; e.state = phase === 'idle' ? 'idle' : 'attack';
      e.phase = phase === 'idle' ? 'prep' : phase; e.phaseT = phase === 'prep' ? 1 : .25;
      e.facility.pose(0); e.mesh.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(e.mesh), center = bounds.getCenter(new THREE.Vector3());
      const coil = e.body.getObjectByName('coil-hinge');
      for (const axis of ['x', 'y', 'z']) for (let a = 0; a < 9; a++) for (let b = 0; b < 9; b++) {
        const other = ['x', 'y', 'z'].filter(k => k !== axis);
        const origin = center.clone(); origin[axis] = bounds.min[axis] - 3;
        origin[other[0]] = THREE.MathUtils.lerp(bounds.min[other[0]] - .1, bounds.max[other[0]] + .1, a / 8);
        origin[other[1]] = THREE.MathUtils.lerp(bounds.min[other[1]] - .1, bounds.max[other[1]] + .1, b / 8);
        const dir = new THREE.Vector3(); dir[axis] = 1;
        ray.set(origin, dir); const visible = ray.intersectObject(e.mesh, true)[0];
        const expectedCore = visible?.object.parent === coil;
        if (expectedCore) coreHits++;
        for (const detached of [false, true]) {
          e.attachBody(!detached);
          const hit = manager.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 20);
          samples++;
          const ok = !!visible === !!hit && (!visible || (Math.abs(visible.distance - hit.t) < .0001 && expectedCore === hit.core));
          if (!ok) { mismatches++; if (examples.length < 3) examples.push({ yaw, phase, axis, a, b, detached, expected: visible?.distance, actual: hit }); }
          if (hit && manager.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, hit.t - .01)) mismatches++;
        }
        e.attachBody(true); e.mesh.updateWorldMatrix(true, true);
      }
      const hole = coil.localToWorld(new THREE.Vector3(.1, .36, 0));
      const dir = new THREE.Vector3(0, 0, 1).transformDirection(coil.matrixWorld);
      const origin = hole.clone().addScaledVector(dir, -3);
      if (!manager.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 6)?.core) holeMisses++;
    }
    e.disposeArt(); e.mesh.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    return { draws, boxes, feet, samples, mismatches, coreHits, holeMisses, examples };
  });
  for (const [kind, counts] of Object.entries(data.draws)) check(counts.every(n => n <= 12), `${kind}: ${counts.join('/')} draws across idle/warning/strike/recovery (ceiling 12)`);
  check(Object.values(data.boxes).every(n => n <= 32), `source boxes preserved within budget: ${JSON.stringify(data.boxes)}`);
  check(Object.values(data.feet).every(y => y >= -.005 && y < .12), `idle soles sit on supported floor: ${JSON.stringify(data.feet)}`);
  check(data.mismatches === 0 && data.coreHits > 20, `${data.samples} attached/detached gameplay rays agree with rendered geometry (${data.mismatches} mismatches, ${data.coreHits} copper hits)`);
  if (data.examples.length) console.log(JSON.stringify(data.examples));
  check(data.holeMisses === 9, `open coil holes never count as copper in all 9 poses/orientations (${data.holeMisses}/9)`);

  const sceneCost = await page.evaluate(async () => {
    const { Enemy } = await import('/src/entities/enemies.ts');
    const g = window.__voxelstrike, a = g.level.rooms.find(r => r.kind === 'arena');
    for (const e of g.enemies.list) e.mesh.visible = false;
    const added = [];
    for (let row = 0; row < 2; row++) for (const [i, kind] of ['sentryBud', 'clampGuard', 'wireLeech'].entries()) {
      const e = new Enemy({ kind, x: a.cx + .5 + (i - 1) * 2.2, z: a.cz + row * 2, roomId: a.id }, a, 1, false);
      e.awake = true; e.mesh.rotation.y = Math.PI; e.facility.face = Math.PI; e.facility.pose(0);
      g.enemies.group.add(e.mesh); added.push(e);
    }
    g.player.pos.set(a.cx + .5, 1.9, a.cz + 6.5); g.player.yaw = 0; g.player.pitch = -.04; g.player.applyToCamera(g.camera, 0);
    const renderer = g.rendererSys.renderer;
    g.rendererSys.warmUp();
    const programs = renderer.info.programs.length;
    let visible = 0; const draw = renderer.renderBufferDirect.bind(renderer);
    renderer.renderBufferDirect = (...args) => { visible++; return draw(...args); };
    const costs = [];
    for (const phase of ['idle', 'prep', 'strike', 'recover']) {
      for (const e of added) { e.state = phase === 'idle' ? 'idle' : 'attack'; e.phase = phase === 'idle' ? 'prep' : phase; e.phaseT = phase === 'prep' ? .9 : .2; e.facility.pose(0); }
      visible = 0; renderer.render(g.rendererSys.scene, g.camera); costs.push(visible);
    }
    renderer.renderBufferDirect = draw;
    const stable = programs === renderer.info.programs.length;
    for (const e of added) { g.enemies.group.remove(e.mesh); e.disposeArt(); e.mesh.traverse(o => { if (o.isMesh) o.geometry.dispose(); }); }
    return { costs, stable };
  });
  check(sceneCost.costs.every(n => n < 250), `whole Facility scene with six visible awake new rigs: ${sceneCost.costs.join('/')} draws (ceiling 250)`);
  check(sceneCost.stable, 'no new shader programs while all six rigs change poses');

  // Real weapon damage path, with live links, geometry misses and cover.
  const shots = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Enemy } = await import('/src/entities/enemies.ts');
    const g = window.__voxelstrike; g.state = 'paused';
    const room = g.level.rooms.find(r => r.kind === 'arena');
    const e = new Enemy({ kind: 'wireLeech', x: room.cx + .5, z: room.cz + .5, roomId: room.id }, room, 1, false);
    const saved = [...g.enemies.list]; g.enemies.list.length = 0; g.enemies.list.push(e);
    e.awake = true; e.state = 'attack'; e.phase = 'recover'; e.phaseT = .25; e.facility.pose(0); e.mesh.updateWorldMatrix(true, true);
    const coil = e.body.getObjectByName('coil-hinge');
    const dir = new THREE.Vector3(0, 0, 1).transformDirection(coil.matrixWorld);
    const point = coil.localToWorld(new THREE.Vector3(0, .66, 0));
    const origin = point.clone().addScaledVector(dir, -1.2);
    e.facility.onTetherHit(g.player, g);
    const started = e.facility.linked, initial = e.hp;
    // A closed door between the muzzle and bar must block the real shot.
    const doors = g.doors;
    g.doors = [{ isOpen: false, box: () => ({ minX: origin.x - .5, maxX: origin.x + .5, minY: origin.y - .3, maxY: origin.y + .3, minZ: origin.z - .5, maxZ: origin.z + .5 }) }];
    g.weapons.hitscan(origin, dir, 10, g, origin);
    const blocked = e.hp === initial && e.facility.linked;
    g.doors = doors;
    const hole = coil.localToWorld(new THREE.Vector3(.1, .36, 0));
    const missOrigin = hole.clone().addScaledVector(dir, -1.2);
    g.weapons.hitscan(missOrigin, dir, 1, g, missOrigin);
    const missLinked = e.facility.linked;
    g.weapons.hitscan(origin, dir, 10, g, origin);
    const firstLinked = e.facility.linked;
    g.weapons.hitscan(origin, dir, 10, g, origin);
    const broken = !e.facility.linked && e.alive;
    const hpAfter = e.hp;
    e.disposeArt(); e.mesh.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
    g.enemies.list.length = 0; g.enemies.list.push(...saved);
    return { started, blocked, missLinked, firstLinked, broken, hpAfter };
  });
  check(shots.started && shots.blocked, 'a closed door blocks an actual shot at a live tether coil');
  check(shots.missLinked && shots.firstLinked && shots.broken, `a hole miss leaves the link; two real 10-damage copper hits break it while the Leech lives (${shots.hpAfter} HP)`);
  check(errors.length === 0, `no browser errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally { await browser.close(); }
if (failed) process.exit(1);
console.log('FACILITY RIGS TEST PASSED');
