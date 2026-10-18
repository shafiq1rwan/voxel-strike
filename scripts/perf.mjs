/**
 * Render-cost regression test. Poki requires 60 fps gameplay, and on phones
 * the limit is draw-call submission, so this guards the counts that keep it
 * there (timings are too noisy to assert on a dev box; counts are not):
 *   - each gun in hand is a handful of draws (static parts are baked)
 *   - with every enemy awake, the scene stays far below the ~730 draws it
 *     cost before occlusion culling (hidden rigs/pickups are detached)
 *   - an enemy in plain sight is still drawn (the cull never hides it)
 *   - no shader program compiles after the level starts (warm-up covers
 *     every gun, projectile, flash and explosion)
 * Usage: node scripts/perf.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the arc caster's four coils pulse out of phase, so each stays its own mesh
const GUN_MAX_DRAWS = 12;
const SCENE_MAX_DRAWS = 250;

const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!ok) failed++;
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser);

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await page.waitForSelector('#start-btn');
  await sleep(900);
  await page.click('#start-btn');
  await sleep(1200);

  // per-frame draw tally, split into the world pass and the gun overlay pass
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.hud.clearHint();
    g.player.health = 99999;
    g.input.locked = true;
    const r = g.rendererSys.renderer;
    const rbd = r.renderBufferDirect.bind(r);
    window.__draws = { scene: 0, gun: 0 };
    r.renderBufferDirect = (cam, ...rest) => {
      if (cam === g.camera) window.__draws.scene++;
      else window.__draws.gun++;
      return rbd(cam, ...rest);
    };
    window.__programs0 = r.info.programs.length;
  });
  const drawsOver = (frames) => page.evaluate((frames) => new Promise((res) => {
    const d = window.__draws;
    d.scene = 0;
    d.gun = 0;
    let n = 0;
    const tick = () => {
      if (++n <= frames) return requestAnimationFrame(tick);
      res({ scene: d.scene / frames, gun: d.gun / frames });
    };
    requestAnimationFrame(tick);
  }), frames);

  // 1. every gun is a handful of draws, and none compiles a shader
  for (const w of ['pistol', 'shotgun', 'smg', 'rocket', 'arc']) {
    await page.evaluate((w) => {
      const g = window.__voxelstrike;
      g.weapons.give(w);
      g.player.ammo.shells = g.player.ammo.bullets = g.player.ammo.rockets = g.player.ammo.cells = 50;
    }, w);
    await sleep(700);
    await page.evaluate(() => window.__voxelstrike.input.pressFire());
    await sleep(500);
    const d = await drawsOver(20);
    check(d.gun <= GUN_MAX_DRAWS, `${w} in hand: ${d.gun.toFixed(1)} draws (<= ${GUN_MAX_DRAWS})`);
  }

  // 2. every enemy awake and hunting: hidden rigs must not be drawn
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    for (const e of g.enemies.list) e.wake(g);
    // a blast next to the player: explosion particles, debris, light flash
    g.explode(g.player.pos.x + 3, g.player.pos.y, g.player.pos.z, 0, 3);
  });
  await sleep(1500);
  const busy = await drawsOver(30);
  const rigs = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const alive = g.enemies.list.filter((e) => e.alive);
    return { alive: alive.length, drawn: alive.filter((e) => e.mesh.children.length > 0).length };
  });
  check(busy.scene < SCENE_MAX_DRAWS, `all awake: ${busy.scene.toFixed(0)} world draws per frame (< ${SCENE_MAX_DRAWS})`);
  check(rigs.drawn < rigs.alive, `occlusion cull: ${rigs.drawn} of ${rigs.alive} enemy rigs attached`);

  // 3. an enemy in plain sight is drawn
  const seen = await page.evaluate(() => new Promise((res) => {
    const g = window.__voxelstrike;
    const e = g.enemies.list.find((x) => x.alive);
    const p = g.player.pos;
    // 4u straight ahead of the eye, at the player's height (yaw 0 faces -z)
    const fx = -Math.sin(g.player.yaw), fz = -Math.cos(g.player.yaw);
    let d = 4;
    while (d > 1.5 && g.world.isSolid(Math.floor(p.x + fx * d), Math.floor(p.y), Math.floor(p.z + fz * d))) d -= 0.5;
    e.puppet = true; // hold still
    e.pos.set(p.x + fx * d, p.y, p.z + fz * d);
    e.mesh.position.copy(e.pos);
    requestAnimationFrame(() => requestAnimationFrame(() => res({ attached: e.mesh.children.length > 0, d })));
  }));
  check(seen.attached, `enemy ${seen.d}u in front of the player is drawn`);

  // 4. no shader compiled after the level started
  const programs = await page.evaluate(() => ({
    before: window.__programs0,
    after: window.__voxelstrike.rendererSys.renderer.info.programs.length,
  }));
  check(programs.after === programs.before, `shader programs stable after level start (${programs.before} -> ${programs.after})`);

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
}

if (failed) {
  console.log(`PERF TEST FAILED (${failed})`);
  process.exit(1);
}
console.log('PERF TEST PASSED');
