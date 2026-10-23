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

  // 5. the Biofoundry at its heaviest (sector 5: most enemies, most full
  // tanks): tanks, signs, growth and the tank Vatborn stay inside the same
  // budget, and its scenery compiles at level build
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.levelIndex = 5;
    g.buildLevel();
    g.state = 'playing';
    g.player.health = 99999;
    g.input.locked = true;
  });
  await sleep(600); // first frame spawns the tank occupants
  await page.evaluate(() => {
    window.__programs4 = window.__voxelstrike.rendererSys.renderer.info.programs.length;
    const g = window.__voxelstrike;
    for (const e of g.enemies.list) e.wake(g);
  });
  await sleep(1500);
  const bio = await drawsOver(30);
  const bioInfo = await page.evaluate(() => ({
    theme: window.__voxelstrike.level.theme,
    before: window.__programs4,
    after: window.__voxelstrike.rendererSys.renderer.info.programs.length,
  }));
  check(bioInfo.theme === 'biofoundry', 'sector 5 is built as the Biofoundry');
  check(bio.scene < SCENE_MAX_DRAWS, `Biofoundry, all awake: ${bio.scene.toFixed(0)} world draws per frame (< ${SCENE_MAX_DRAWS})`);
  check(bioInfo.after === bioInfo.before, `Biofoundry: shader programs stable after level start (${bioInfo.before} -> ${bioInfo.after})`);

  // 6. the Geothermal Core at its heaviest (sector 7): its monsters are
  // bigger rigs than the old roster — same budget, no late shader compiles
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.levelIndex = 7;
    g.buildLevel();
    g.state = 'playing';
    g.player.health = 99999;
    g.input.locked = true;
  });
  await sleep(600);
  await page.evaluate(() => {
    window.__programs7 = window.__voxelstrike.rendererSys.renderer.info.programs.length;
    const g = window.__voxelstrike;
    for (const e of g.enemies.list) e.wake(g);
  });
  await sleep(1500);
  const geo = await drawsOver(30);
  const geoInfo = await page.evaluate(() => ({
    theme: window.__voxelstrike.level.theme,
    before: window.__programs7,
    after: window.__voxelstrike.rendererSys.renderer.info.programs.length,
  }));
  check(geoInfo.theme === 'geothermal', 'sector 7 is built as the Geothermal Core');
  check(geo.scene < SCENE_MAX_DRAWS, `Geothermal Core, all awake: ${geo.scene.toFixed(0)} world draws per frame (< ${SCENE_MAX_DRAWS})`);
  check(geoInfo.after === geoInfo.before, `Geothermal Core: shader programs stable after level start (${geoInfo.before} -> ${geoInfo.after})`);

  // 7. Survival at full pressure: the big dressed arena, the wave cap of
  // enemies alive at once, warnings and drops — same budget, no late compiles
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.startSurvival(false);
    g.player.health = 99999;
    g.input.locked = true;
    g.survival.wave = 15; // the next wave runs at the full alive cap
  });
  await sleep(600);
  await page.evaluate(() => {
    const r = window.__voxelstrike.rendererSys.renderer;
    window.__programsS = r.info.programs.length;
    window.__programNamesS = r.info.programs.map((p) => p.name + ' ' + p.cacheKey.slice(0, 60));
  });
  await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const t0 = performance.now();
    while (performance.now() - t0 < 15000 && g.enemies.list.filter((e) => e.alive).length < 12) {
      g.player.health = 99999;
      await new Promise((r) => setTimeout(r, 200));
    }
  });
  await sleep(1000);
  const surv = await drawsOver(30);
  const survInfo = await page.evaluate(() => ({
    alive: window.__voxelstrike.enemies.list.filter((e) => e.alive).length,
    before: window.__programsS,
    after: window.__voxelstrike.rendererSys.renderer.info.programs.length,
    added: window.__voxelstrike.rendererSys.renderer.info.programs.map((p) => p.name + ' ' + p.cacheKey.slice(0, 60)).filter((n) => !window.__programNamesS.includes(n)),
  }));
  check(survInfo.alive >= 10, `Survival reached its alive cap (${survInfo.alive} enemies)`);
  check(surv.scene < SCENE_MAX_DRAWS, `Survival arena, ${survInfo.alive} awake: ${surv.scene.toFixed(0)} world draws per frame (< ${SCENE_MAX_DRAWS})`);
  check(survInfo.after === survInfo.before, `Survival: shader programs stable during the waves (${survInfo.before} -> ${survInfo.after}${survInfo.added.length ? ': ' + survInfo.added.join(' | ') : ''})`);

  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
}

if (failed) {
  console.log(`PERF TEST FAILED (${failed})`);
  process.exit(1);
}
console.log('PERF TEST PASSED');
