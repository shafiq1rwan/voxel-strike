/**
 * Monkey stress test: ~60s of randomized play — random movement, aiming,
 * weapon switching, firing (rockets included), and teleports across rooms to
 * force combat everywhere. Checks invariants every step and fails on any
 * console/page error, NaN position, or out-of-range health.
 * Usage: node scripts/monkey.mjs [url]
 */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] ?? `http://localhost:5173/?seed=${Math.floor(Math.random() * 1e9)}`;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const errors = [];

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });

  console.log('loading', URL);
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#hud');
  await page.click('#start-btn');
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.input.locked = true;
    // full arsenal + deep ammo so every weapon gets exercised
    g.weapons.give('shotgun');
    g.weapons.give('smg');
    g.weapons.give('rocket');
    g.player.ammo.bullets = 240;
    g.player.ammo.shells = 60;
    g.player.ammo.rockets = 30;
  });

  const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const rand = (n) => Math.floor(Math.random() * n);

  for (let step = 0; step < 45; step++) {
    // every few steps: hop to a random room so the whole level sees combat
    if (step % 4 === 0) {
      await page.evaluate(() => {
        const g = window.__voxelstrike;
        const rooms = g.level.rooms;
        const r = rooms[Math.floor(Math.random() * rooms.length)];
        g.player.pos.set(r.cx + 0.5, 2.2, r.cz + 0.5);
        g.player.vel.set(0, 0, 0);
        g.player.health = Math.max(g.player.health, 150); // stay alive-ish
        g.player.dead = false;
      });
    }

    // random look
    await page.evaluate(() => {
      const g = window.__voxelstrike;
      g.input.mouseDX += (Math.random() - 0.5) * 600;
      g.input.mouseDY += (Math.random() - 0.5) * 200;
    });

    // random weapon
    if (Math.random() < 0.4) await page.keyboard.press(`Digit${1 + rand(4)}`);

    // random movement burst + maybe jump + maybe fire
    const key = KEYS[rand(KEYS.length)];
    await page.keyboard.down(key);
    if (Math.random() < 0.3) await page.keyboard.down('Space');
    const firing = Math.random() < 0.6;
    if (firing) await page.mouse.down();
    await new Promise((r) => setTimeout(r, 250 + rand(400)));
    if (firing) await page.mouse.up();
    await page.keyboard.up(key);
    await page.keyboard.up('Space');

    // invariants
    const inv = await page.evaluate(() => {
      const g = window.__voxelstrike;
      const p = g.player;
      const bad = [];
      if (!Number.isFinite(p.pos.x + p.pos.y + p.pos.z)) bad.push(`pos NaN: ${p.pos.toArray()}`);
      if (!Number.isFinite(p.vel.x + p.vel.y + p.vel.z)) bad.push(`vel NaN`);
      if (p.health > 200 || (!p.dead && p.health <= 0)) bad.push(`hp out of range: ${p.health} dead=${p.dead}`);
      if (p.pos.y < -5 || p.pos.y > 20) bad.push(`fell out of world: y=${p.pos.y.toFixed(2)}`);
      if (!Number.isFinite(g.camera.rotation.x + g.camera.rotation.y)) bad.push('camera NaN');
      for (const e of g.enemies.list) {
        if (!Number.isFinite(e.pos.x + e.pos.y + e.pos.z)) {
          bad.push(`enemy pos NaN (${e.kind}, state=${e.state})`);
          break;
        }
        if (e.pos.y < -8 || e.pos.y > 20 || e.pos.x < -4 || e.pos.x > g.world.sx + 4 || e.pos.z < -4 || e.pos.z > g.world.sz + 4) {
          bad.push(`enemy escaped world: ${e.kind}@(${e.pos.x.toFixed(1)},${e.pos.y.toFixed(1)},${e.pos.z.toFixed(1)}) state=${e.state}`);
          break;
        }
      }
      return { bad, hp: p.health, dead: p.dead, enemies: g.enemies.aliveCount(), state: g.state };
    });
    for (const b of inv.bad) errors.push(`[invariant step ${step}] ${b}`);
    if (step % 9 === 0) {
      console.log(`step ${step}: hp=${inv.hp} dead=${inv.dead} enemies=${inv.enemies} state=${inv.state} errors=${errors.length}`);
    }
    if (errors.length > 5) break;
  }

  const fps = await page.evaluate(() => document.querySelector('#fps')?.textContent ?? '?');
  console.log(`final fps reading: ${fps}`);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== ERRORS ===');
  for (const e of errors.slice(0, 20)) console.log(e);
  process.exit(1);
}
console.log('\nMONKEY TEST PASSED');
