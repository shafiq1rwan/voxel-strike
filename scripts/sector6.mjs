import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5174/';
const poki = process.argv.includes('--poki');
const browser = await puppeteer.launch({
  executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' && /shader|WebGL|THREE/.test(message.text())) errors.push(message.text()); });
  await page.evaluateOnNewDocument(() => localStorage.setItem('voxelstrike-run', 'campaign-save-sentinel'));
  if (poki) {
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().includes('poki-sdk.js')) void request.respond({ status: 200, contentType: 'application/javascript', body: 'window.PokiSDK={init:()=>Promise.resolve(),gameLoadingFinished(){},gameplayStart(){},gameplayStop(){},measure(){},commercialBreak:()=>Promise.resolve()};' });
      else void request.continue();
    });
  }
  await page.goto(`${base}?sector6&seed=12345`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.__voxelstrike);
  if (poki) {
    assert.equal(await page.evaluate(() => window.__voxelstrike.levelIndex), 1);
    assert.equal(await page.$('#preview-start'), null);
    console.log('PASS: Poki ignores ?sector6');
  } else {
    await page.waitForSelector('#preview-start');
    await new Promise(r => setTimeout(r, 800));
    await page.click('#preview-start');
    await page.waitForFunction(() => window.__voxelstrike.state === 'playing');
    assert.equal(await page.evaluate(() => window.__voxelstrike.levelIndex), 6);
    // Verify connected floor routes, including the complete red door footprint.
    const paths = await page.evaluate(() => {
      const g = window.__voxelstrike, w = g.world, d = g.level.doors[0];
      const reach = (tx, tz, locked) => {
        const q = [[30, 46]], seen = new Set(['30,46']);
        for (let i = 0; i < q.length; i++) {
          const [x, z] = q[i]; if (x === tx && z === tz) return true;
          for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx = x + dx, nz = z + dz, id = `${nx},${nz}`;
            if (seen.has(id) || !w.inBounds(nx, 1, nz) || w.isSolid(nx, 1, nz) || w.isSolid(nx, 2, nz)) continue;
            if (locked && (d.dir === 'x' ? nx === d.x && (nz === d.z || nz === d.z + 1) : nz === d.z && (nx === d.x || nx === d.x + 1))) continue;
            seen.add(id); q.push([nx, nz]);
          }
        }
        return false;
      };
      return { key: reach(6, 34, true), locked: reach(18, 10, true), lift: reach(18, 10, false), cache: reach(23, 23, false) };
    });
    assert.deepEqual(paths, { key: true, locked: false, lift: true, cache: false });
    await page.evaluate(() => {
      const g = window.__voxelstrike;
      g.enemies.list.forEach(e => { e.puppet = true; });
      g.player.pos.set(30.2, 1.9, 46); g.player.vel.set(0,0,0); g.player.yaw = 0; g.player.pitch = 0;
    });
    mkdirSync('scripts/shots', { recursive: true });
    await new Promise(r => setTimeout(r, 300));
    await page.screenshot({ path: 'scripts/shots/sector6-core.png' });
    // Sealed pickups must resist magnetism and collection even beside their side wall.
    const sealed = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      g.player.pos.set(27.4, 1.9, 23.5); g.player.vel.set(0,0,0); g.player.armor = 0;
      await new Promise(r => setTimeout(r, 700));
      return g.pickups.items.filter(p => p.spec.sealed).map(p => ({ taken: p.taken, x: p.spec.x }));
    });
    assert.deepEqual(sealed, [{ taken: false, x: 23.5 }, { taken: false, x: 21.7 }, { taken: false, x: 25.2 }]);
    await page.evaluate(() => {
      const g = window.__voxelstrike;
      g.player.pos.set(20.5, 1.9, 32); g.player.vel.set(0,0,0); g.player.yaw = 0; g.player.pitch = 0;
    });
    await new Promise(r => setTimeout(r, 250));
    await page.screenshot({ path: 'scripts/shots/sector6-power-link-before.png' });
    // Aim and fire a real hitscan shot; this tests the voxel-hit integration.
    await page.evaluate(() => {
      const g = window.__voxelstrike;
      g.player.pos.set(17.5, 1.9, 28.5); g.player.vel.set(0,0,0);
      g.player.yaw = 0; g.player.pitch = Math.atan2(2.5 - g.player.eyeY(), 6);
      g.weapons.restoreLoadout(['pistol','shotgun','smg','rocket','arc'], 'pistol');
    });
    await new Promise(r => setTimeout(r, 400));
    await page.mouse.down(); await new Promise(r => setTimeout(r, 350)); await page.mouse.up();
    await page.waitForFunction(() => window.__voxelstrike.rendererSys.scene.getObjectByName('geothermal-preview-art').userData.powerLink.opened);
    assert.equal(await page.evaluate(() => window.__voxelstrike.world.isSolid(23, 2, 26)), false);
    await page.evaluate(() => {
      const g = window.__voxelstrike;
      g.player.pos.set(20.5, 1.9, 32); g.player.vel.set(0,0,0); g.player.yaw = 0; g.player.pitch = 0;
    });
    await new Promise(r => setTimeout(r, 250));
    await page.screenshot({ path: 'scripts/shots/sector6-power-link-after.png' });
    await page.evaluate(() => { const g = window.__voxelstrike; g.player.pos.set(23.5, 1.9, 24); g.player.vel.set(0,0,0); });
    await page.waitForFunction(() => window.__voxelstrike.player.armor > 0);
    // Retry resets the puzzle and recreates exactly one scenery instance.
    await page.evaluate(() => window.__voxelstrike.retrySector(false));
    assert.deepEqual(await page.evaluate(() => {
      const g = window.__voxelstrike;
      return { sector: g.levelIndex, solved: g.rendererSys.scene.getObjectByName('geothermal-preview-art').userData.powerLink.solved,
        count: g.rendererSys.scene.children.filter(o => o.name === 'geothermal-preview-art').length, sealed: g.level.pickups.filter(p => p.sealed).length };
    }), { sector: 6, solved: false, count: 1, sealed: 3 });
    // Normal progression can finish without solving the optional puzzle.
    await page.evaluate(() => {
      const g = window.__voxelstrike; g.enemies.list.forEach(e => { e.puppet = true; });
      g.player.pos.set(6.5, 1.9, 34.5); g.player.vel.set(0,0,0);
    });
    await page.waitForFunction(() => window.__voxelstrike.player.keys.has('red'));
    await page.evaluate(() => { const g = window.__voxelstrike; g.player.pos.set(34,1.9,23.5); g.player.vel.set(0,0,0); });
    await page.waitForFunction(() => window.__voxelstrike.doors[0].isOpen);
    await page.evaluate(() => { const g = window.__voxelstrike, e = g.elevator; g.player.pos.set(e.spec.x+1,e.topY+0.95,e.spec.z+1); g.player.vel.set(0,0,0); });
    await page.waitForFunction(() => window.__voxelstrike.elevator.topY >= 3.99);
    await page.evaluate(() => { const g = window.__voxelstrike; g.player.pos.set(19,4.95,9); g.player.vel.set(0,0,0); });
    await page.waitForFunction(() => document.body.textContent.includes('GEOTHERMAL CLEARED'));
    assert.equal(await page.evaluate(() => localStorage.getItem('voxelstrike-run')), 'campaign-save-sentinel');
    await new Promise(r => setTimeout(r, 800)); await page.click('#preview-start');
    await page.waitForFunction(() => window.__voxelstrike.state === 'playing');
    assert.equal(await page.evaluate(() => window.__voxelstrike.levelIndex), 6);
    await page.setViewport({ width: 844, height: 390, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 800)); await page.click('#preview-start');
    await page.waitForFunction(() => window.__voxelstrike.state === 'playing');
    await page.screenshot({ path: 'scripts/shots/sector6-mobile.png' });
    assert.equal(await page.evaluate(() => window.__voxelstrike.isTouch), true);
    console.log('PASS: Power Link shot, sealed rewards, opening, collection, retry, key/door/lift/exit, replay, save isolation and touch layout');
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
