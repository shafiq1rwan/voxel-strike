/**
 * Movement direction regression test: at several facing angles, verify that
 * W moves along the camera's forward vector and D along its right vector.
 * Usage: node scripts/movement.mjs [url]
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
    window.__voxelstrike.input.locked = true;
  });

  const runCase = async (yawDeg, key) => {
    // reset to spawn with the requested facing
    await page.evaluate((yaw) => {
      const g = window.__voxelstrike;
      const s = g.level.spawn;
      g.player.pos.set(s.x, s.y, s.z);
      g.player.vel.set(0, 0, 0);
      g.player.yaw = yaw;
      g.player.pitch = 0;
    }, (yawDeg * Math.PI) / 180);
    await new Promise((r) => setTimeout(r, 120)); // let the camera update

    const basis = await page.evaluate(() => {
      const g = window.__voxelstrike;
      const f = g.camera.getWorldDirection(g.player.vel.clone());
      // right = forward x up
      return { fx: f.x, fz: f.z, rx: -f.z, rz: f.x, px: g.player.pos.x, pz: g.player.pos.z };
    });

    await page.keyboard.down(key);
    await new Promise((r) => setTimeout(r, 400));
    await page.keyboard.up(key);
    await new Promise((r) => setTimeout(r, 60));

    const after = await page.evaluate(() => {
      const g = window.__voxelstrike;
      g.player.vel.set(0, 0, 0);
      return { x: g.player.pos.x, z: g.player.pos.z };
    });

    let dx = after.x - basis.px;
    let dz = after.z - basis.pz;
    const len = Math.hypot(dx, dz);
    if (len < 0.3) {
      check(false, `yaw=${yawDeg} ${key}: barely moved (${len.toFixed(2)})`);
      return;
    }
    dx /= len;
    dz /= len;
    const exp = key === 'KeyW' ? [basis.fx, basis.fz]
      : key === 'KeyS' ? [-basis.fx, -basis.fz]
      : key === 'KeyD' ? [basis.rx, basis.rz]
      : [-basis.rx, -basis.rz];
    const el = Math.hypot(exp[0], exp[1]);
    const dot = (dx * exp[0] + dz * exp[1]) / el;
    check(dot > 0.85, `yaw=${yawDeg}° ${key}: moved along expected axis (dot=${dot.toFixed(3)})`);
  };

  for (const yaw of [0, 90, 180, 270, 45]) {
    for (const key of ['KeyW', 'KeyS', 'KeyA', 'KeyD']) {
      await runCase(yaw, key);
    }
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nMOVEMENT TEST PASSED');
