import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const browser = await puppeteer.launch({
  executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser);
try {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /THREE|shader|WebGL/.test(message.text())) errors.push(message.text()); });
  const url = new URL(process.argv[2] ?? 'http://127.0.0.1:5176/'); url.searchParams.set('seed', '12345');
  await page.goto(url.href, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.__voxelstrike);
  const samples = await page.evaluate(() => {
    const g = window.__voxelstrike, rows = [];
    g.state = 'paused';
    for (let seed = 1; seed <= 24; seed++) {
      g.baseSeed = seed; g.levelIndex = seed > 12 ? 4 : 1; g.buildLevel();
      const e = g.level.elevator, p = g.level.exitPad, props = g.exitProps;
      const names = props.group.children.map(o => o.name);
      const direction = e.walkAxis === 'x' ? p.x > e.x + 1 ? 'x+' : 'x-' : p.z > e.z + 1 ? 'z+' : 'z-';
      const boxes = props.boxes;
      const overlaps = boxes.some(b => b.minX < e.x + 2.15 && b.maxX > e.x - .15 && b.minZ < e.z + 2.15 && b.maxZ > e.z - .15);
      const entry = props.group.getObjectByName('exit-emergency-light');
      const room = g.level.rooms.find(r => r.kind === 'exit');
      let route = false;
      if (entry) {
        const nx = Math.sin(entry.rotation.y), nz = Math.cos(entry.rotation.y);
        const start = [Math.floor(entry.position.x + nx * .6), Math.floor(entry.position.z + nz * .6)];
        const q = [start], seen = new Set([start.join(',')]);
        for (let i = 0; i < q.length; i++) {
          const [x, z] = q[i];
          if (x >= e.x && x < e.x + 2 && z >= e.z && z < e.z + 2) { route = true; break; }
          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const xx = x + dx, zz = z + dz, key = `${xx},${zz}`;
            if (seen.has(key) || xx < room.x || zz < room.z || xx >= room.x + room.w || zz >= room.z + room.d) continue;
            if (g.world.isSolid(xx, 1, zz) || g.world.isSolid(xx, 2, zz)) continue;
            if (boxes.some(b => xx + .84 > b.minX && xx + .16 < b.maxX && zz + .84 > b.minZ && zz + .16 < b.maxZ && b.maxY > 1.05)) continue;
            seen.add(key); q.push([xx, zz]);
          }
        }
      }
      rows.push({ seed, direction, names, overlaps, route, count: g.rendererSys.scene.children.filter(o => o.name === 'exit-room-props').length });
    }
    return rows;
  });
  const required = ['lift-motor-cabinet', 'lift-floor-conduit', 'lift-status-panel', 'maintenance-toolbox', 'exit-intercom', 'exit-emergency-light', 'exit-vent'];
  for (const row of samples) {
    assert.equal(row.overlaps, false, `lift clearance: seed ${row.seed}`);
    assert.equal(row.route, true, `boarding route: seed ${row.seed}`);
    assert.equal(row.count, 1, 'rebuild must replace scenery');
    for (const name of required) assert.ok(row.names.includes(name), `missing ${name}: seed ${row.seed} (${row.direction})`);
  }
  assert.equal(new Set(samples.map(row => row.direction)).size, 4);
  console.log('PASS: all seven props, clear boarding route, four orientations, facility/Biofoundry and repeated rebuilds across 24 seeds');
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.levelIndex = 1; g.baseSeed = 12345; g.buildLevel(); g.hud.hideScreen(); g.hud.root.style.display = 'none';
    g.enemies.list.forEach(e => { e.puppet = true; e.mesh.visible = false; });
    const e = g.level.elevator, p = g.level.exitPad, r = g.level.rooms.find(r => r.kind === 'exit');
    const fx = e.walkAxis === 'x' ? Math.sign(p.x - e.x - 1) : 0, fz = e.walkAxis === 'z' ? Math.sign(p.z - e.z - 1) : 0;
    const x = Math.min(r.x + r.w - 1.1, Math.max(r.x + 1.1, e.x + 1 - fx * 4.5));
    const z = Math.min(r.z + r.d - 1.1, Math.max(r.z + 1.1, e.z + 1 - fz * 4.5));
    g.player.pos.set(x, 1.88, z); g.player.yaw = Math.atan2(-(e.x + 1 - x), -(e.z + 1 - z));
    g.player.pitch = Math.atan2(3.35 - g.player.eyeY(), Math.hypot(e.x + 1 - x, e.z + 1 - z));
    g.player.applyToCamera(g.camera, 0); g.rendererSys.setResolution(480);
    g.weapons.viewModel.visible = true;
    window.__exitView = { x, z, yaw: g.player.yaw, pitch: g.player.pitch };
  });
  mkdirSync('scripts/shots', { recursive: true });
  await new Promise(r => setTimeout(r, 150));
  await page.screenshot({ path: 'scripts/shots/exit-room-props-bottom.png' });
  await page.evaluate(() => {
    const g = window.__voxelstrike, e = g.elevator;
    g.state = 'playing'; g.input.locked = true;
    g.player.pos.set(e.spec.x + 1, e.topY + .89, e.spec.z + 1); g.player.vel.set(0,0,0);
  });
  await page.waitForFunction(() => window.__voxelstrike.exitProps.group.userData.status === 'IN TRANSIT');
  await page.waitForFunction(() => window.__voxelstrike.exitProps.group.userData.status === 'EXIT ACCESS');
  assert.ok(await page.evaluate(() => window.__voxelstrike.player.pos.y > 4.7));
  await page.evaluate(() => {
    const g = window.__voxelstrike, view = window.__exitView;
    g.state = 'paused'; g.player.pos.set(view.x, 1.88, view.z); g.player.yaw = view.yaw; g.player.pitch = view.pitch;
    g.player.applyToCamera(g.camera, 0);
  });
  await new Promise(r => setTimeout(r, 100));
  await page.screenshot({ path: 'scripts/shots/exit-room-props-top.png' });
  await page.evaluate(() => {
    const g = window.__voxelstrike, p = g.level.exitPad;
    g.state = 'playing';
    g.player.pos.set(p.x, p.y + .89, p.z); g.player.vel.set(0,0,0);
  });
  await page.waitForFunction(() => window.__voxelstrike.state !== 'playing');
  console.log('PASS: live status changes, real lift ride and exit-pad progression');
  url.searchParams.set('exitroom', '');
  await page.goto(url.href, { waitUntil: 'networkidle0' });
  assert.ok(await page.evaluate(() => {
    const g = window.__voxelstrike, r = g.level.rooms.find(r => r.kind === 'exit');
    return g.player.pos.x > r.x && g.player.pos.x < r.x + r.w && g.player.pos.z > r.z && g.player.pos.z < r.z + r.d;
  }), 'exitroom shortcut starts in the room');
  console.log('PASS: ?exitroom opens directly inside the updated room');
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
