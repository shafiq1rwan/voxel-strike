/**
 * Firing responsiveness regression test:
 *  - spam-clicking must fire at (roughly) the weapon's full rate, no eaten clicks
 *  - holding the trigger must auto-repeat for every weapon
 * Usage: node scripts/firing.mjs [url]
 */
import puppeteer from 'puppeteer-core';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const errors = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) errors.push(msg);
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});

try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#hud');
  await page.click('#start-btn');
  await new Promise((r) => setTimeout(r, 600));
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.input.locked = true;
    // face a wall corner so shots always land harmlessly
    g.player.pitch = -0.4;
  });

  const ammoOf = (type) => page.evaluate((t) => window.__voxelstrike.player.ammo[t], type);
  const refill = () => page.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.ammo.bullets = 200;
    g.player.ammo.shells = 60;
  });

  // --- pistol: spam clicks for ~1.2s → expect close to rate-limited max ----
  await refill();
  let start = await ammoOf('bullets');
  for (let i = 0; i < 15; i++) {
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 35));
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 45));
  }
  await new Promise((r) => setTimeout(r, 300));
  let shots = start - (await ammoOf('bullets'));
  // 1.2s at 3.4/s ≈ 4 shots; old edge-triggered code managed ~1-2
  check(shots >= 3, `pistol spam-click fired ${shots} shots (expect >= 3)`);

  // --- pistol: hold for ~1.2s → must auto-repeat ----------------------------
  await refill();
  start = await ammoOf('bullets');
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 1200));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 200));
  shots = start - (await ammoOf('bullets'));
  check(shots >= 3, `pistol hold fired ${shots} shots (expect >= 3)`);

  // --- single click during cooldown is buffered, not eaten -------------------
  await refill();
  start = await ammoOf('bullets');
  await page.mouse.down();               // shot 1 fires, cooldown starts
  await new Promise((r) => setTimeout(r, 60));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 60));
  await page.mouse.down();               // lands mid-cooldown → buffered
  await new Promise((r) => setTimeout(r, 40));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 400)); // buffer flushes when ready
  shots = start - (await ammoOf('bullets'));
  check(shots === 2, `buffered click fired (${shots} shots, expect exactly 2)`);

  // --- shotgun hold repeats at its own slower rate ---------------------------
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.weapons.give('shotgun');
  });
  await new Promise((r) => setTimeout(r, 500));
  await refill();
  start = await ammoOf('shells');
  await page.mouse.down();
  await new Promise((r) => setTimeout(r, 2100));
  await page.mouse.up();
  await new Promise((r) => setTimeout(r, 200));
  shots = start - (await ammoOf('shells'));
  // 2.1s at 1.05/s ≈ 2-3 shells
  check(shots >= 2 && shots <= 4, `shotgun hold fired ${shots} shells (expect 2-4)`);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nFIRING TEST PASSED');
