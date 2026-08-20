/**
 * Headless smoke test: loads the game, starts it, moves and shoots,
 * triggers an explosion, and reports any console/page errors.
 * Usage: node scripts/smoke.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'scripts/shots';
mkdirSync(OUT, { recursive: true });

const errors = [];
const logs = [];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--window-size=1280,720',
    '--mute-audio',
  ],
  defaultViewport: { width: 1280, height: 720 },
});

try {
  const page = await browser.newPage();
  page.on('console', (msg) => {
    const line = `[console.${msg.type()}] ${msg.text()}`;
    logs.push(line);
    if (msg.type() === 'error') errors.push(line);
  });
  page.on('pageerror', (err) => {
    errors.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`);
  });

  console.log('loading', URL);
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#hud', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: `${OUT}/1-title.png` });

  // start the game (click the title screen)
  await page.click('#start-btn');
  await new Promise((r) => setTimeout(r, 800));
  // pointer lock doesn't work headless — force input.locked so events register
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.input.locked = true;
  });
  await page.screenshot({ path: `${OUT}/2-started.png` });

  const before = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return {
      x: g.player.pos.x, z: g.player.pos.z, hp: g.player.health,
      enemies: g.enemies.aliveCount(),
      doors: g.doors.length,
      lockedDoors: g.doors.filter((d) => d.locked).length,
      secret: !!g.level.secretRect,
    };
  });
  if (before.doors < 3) errors.push(`[smoke] too few doors: ${before.doors}`);
  if (before.lockedDoors !== 1) errors.push(`[smoke] expected exactly 1 locked door, got ${before.lockedDoors}`);

  // enemies must stay inside the world at sane heights (regression guard for
  // the spawn-in-ceiling bug that ejected enemies into the sky)
  const badEnemies = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return g.enemies.list
      .filter((e) => e.pos.y < 0 || e.pos.y > 10 ||
        e.pos.x < 0 || e.pos.x > g.world.sx || e.pos.z < 0 || e.pos.z > g.world.sz)
      .map((e) => `${e.kind}@(${e.pos.x.toFixed(1)},${e.pos.y.toFixed(1)},${e.pos.z.toFixed(1)})`);
  });
  if (badEnemies.length) errors.push(`[smoke] enemies out of world: ${badEnemies.join(' ')}`);

  // look up at the ceiling to verify lamps render
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.pitch = 1.2;
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: `${OUT}/2b-ceiling.png` });
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.pitch = 0;
  });

  // walk forward for 1.5s
  await page.keyboard.down('KeyW');
  await new Promise((r) => setTimeout(r, 1500));
  await page.keyboard.up('KeyW');
  await page.screenshot({ path: `${OUT}/3-moved.png` });

  // look around + fire pistol a few times
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.input.mouseDX += 200;
  });
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 400));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 100));
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 400));
  await page.mouse.up();
  await page.screenshot({ path: `${OUT}/4-shot.png` });

  // explosion near the player exercises particles, voxel damage, splash
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    const p = g.player.pos;
    g.explode(p.x + 3, p.y + 0.5, p.z + 3, 50, 3);
  });
  await new Promise((r) => setTimeout(r, 600));
  await page.screenshot({ path: `${OUT}/5-explosion.png` });

  // switch weapons through all slots (give them first) and fire the rocket
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.weapons.give('shotgun');
    g.player.addAmmo('shells', 10);
  });
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 300));
  await page.mouse.up();
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.weapons.give('rocket');
    g.player.addAmmo('rockets', 5);
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 200));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `${OUT}/6-rocket.png` });

  const after = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return {
      x: g.player.pos.x, z: g.player.pos.z, hp: g.player.health,
      enemies: g.enemies.aliveCount(),
      ammo: { ...g.player.ammo },
      weapon: g.weapons.current,
    };
  });

  console.log('BEFORE:', JSON.stringify(before));
  console.log('AFTER :', JSON.stringify(after));
  const moved = Math.hypot(after.x - before.x, after.z - before.z);
  console.log(`player moved ${moved.toFixed(2)} units`);
  if (moved < 0.5) errors.push('[smoke] player did not move — movement/collision broken?');
} finally {
  await browser.close();
}

console.log('\n--- console log tail ---');
for (const l of logs.slice(-25)) console.log(l);

if (errors.length) {
  console.log('\n=== ERRORS ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nSMOKE TEST PASSED');
