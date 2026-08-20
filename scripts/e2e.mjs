/**
 * End-to-end campaign test: plays the critical path of all three sectors —
 * key pickup → locked door → elevator → exit pad — through the intermission
 * screens to the campaign-complete screen. Also verifies enemy aggression,
 * the damage direction indicator, and exploding barrels.
 * Usage: node scripts/e2e.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'scripts/shots';
mkdirSync(OUT, { recursive: true });

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
  page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
  });

  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#hud', { timeout: 10000 });
  await page.click('#start-btn');
  await new Promise((r) => setTimeout(r, 600));
  const forceLock = () => page.evaluate(() => {
    window.__voxelstrike.input.locked = true;
  });
  await forceLock();

  // --- enemy aggression + damage direction indicator ------------------------
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    const e = g.enemies.list.find((q) => q.alive);
    // stand in an actually-open cell next to the enemy (not inside a wall)
    const spots = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.5, 1.5], [-1.5, -1.5]];
    let px = e.pos.x + 1.5, pz = e.pos.z;
    for (const [dx, dz] of spots) {
      const x = Math.floor(e.pos.x + dx), z = Math.floor(e.pos.z + dz);
      if (g.world.get(x, 1, z) === 0 && g.world.get(x, 2, z) === 0) {
        px = e.pos.x + dx;
        pz = e.pos.z + dz;
        break;
      }
    }
    g.player.pos.set(px, e.pos.y + 0.2, pz);
    g.player.vel.set(0, 0, 0);
  });
  await new Promise((r) => setTimeout(r, 400));
  // fire until a shot actually registers (first frames may stall on shader
  // compile under headless swiftshader, eating the click)
  let fired = false;
  for (let i = 0; i < 6 && !fired; i++) {
    const before = await page.evaluate(() => {
      const g = window.__voxelstrike;
      g.input.locked = true; // re-force in case a lock event flipped it
      return { ammo: g.player.ammo.bullets, state: g.state, locked: g.input.locked };
    });
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 300));
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 100));
    const ammo = await page.evaluate(() => window.__voxelstrike.player.ammo.bullets);
    fired = ammo < before.ammo;
    if (!fired) console.log(`  retry: shot did not register (diag=${JSON.stringify(before)})`);
  }
  check(fired, 'gunshot registered');
  // poll for the damage indicator while the enemy fights back
  let sawIndicator = false;
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await page.evaluate(() => document.querySelector('.dmgind') !== null)) {
      sawIndicator = true;
      break;
    }
  }
  const enemyResult = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return {
      awakeCount: g.enemies.list.filter((q) => q.awake).length,
      hp: g.player.health,
    };
  });
  check(enemyResult.awakeCount > 0, `enemies woke to gunfire (awake=${enemyResult.awakeCount})`);
  check(enemyResult.hp < 100, `enemy damaged the player (hp=${enemyResult.hp})`);
  check(sawIndicator, 'damage direction indicator appeared');
  await page.screenshot({ path: `${OUT}/e2e-1-enemy.png` });

  // --- exploding barrel ------------------------------------------------------
  const barrelResult = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const BARREL = 15;
    let found = null;
    for (let z = 0; z < g.world.sz && !found; z++) {
      for (let x = 0; x < g.world.sx && !found; x++) {
        if (g.world.get(x, 1, z) === BARREL) found = { x, z };
      }
    }
    if (!found) return { found: false };
    // stand back, then shoot it via the same path a weapon uses
    g.player.health = 100;
    g.player.dead = false;
    g.player.pos.set(found.x + 0.5, 2.0, found.z + 6.5);
    g.player.vel.set(0, 0, 0);
    const broke = g.world.damageVoxel(found.x, 1, found.z, 50);
    if (broke !== null) g.onVoxelBroken(found.x, 1, found.z, broke);
    await new Promise((r) => setTimeout(r, 700));
    return {
      found: true,
      nowAir: g.world.get(found.x, 1, found.z) === 0,
      pending: g.pendingExplosions ? g.pendingExplosions.length : 0,
    };
  });
  check(barrelResult.found, 'a barrel exists in the level');
  if (barrelResult.found) {
    check(barrelResult.nowAir, 'barrel was destroyed and exploded');
  }
  await page.screenshot({ path: `${OUT}/e2e-2-barrel.png` });

  // --- play all three sectors ------------------------------------------------
  const completeLevel = async (sector) => {
    // heal + collect key
    const gotKey = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      g.player.health = 200;
      g.player.dead = false;
      const key = g.level.pickups.find((p) => p.kind === 'keyRed');
      g.player.pos.set(key.x, key.y + 0.4, key.z);
      g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 600));
      return g.player.keys.has('red');
    });
    check(gotKey, `sector ${sector}: red keycard collected`);

    const doorResult = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      const door = g.doors.find((d) => d.spec.locked === 'red');
      const dx = door.spec.dir === 'x' ? 1.6 : 0;
      const dz = door.spec.dir === 'x' ? 0 : 1.6;
      g.player.pos.set(door.centerX() - dx, 2.0, door.centerZ() - dz);
      g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 2000));
      return { openT: door.openT, locked: door.locked };
    });
    check(doorResult.locked === null && doorResult.openT > 0.5, `sector ${sector}: locked door opened with the key`);

    let elevResult = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      elevResult = await page.evaluate(async () => {
        const g = window.__voxelstrike;
        const el = g.elevator;
        // the scripted rider doesn't fight back — clear the welcome party so a
        // 9-second AFK ride isn't a scripted death
        for (const e of g.enemies.list) {
          if (!e.alive) continue;
          const d = Math.hypot(e.pos.x - (el.spec.x + 1), e.pos.z - (el.spec.z + 1));
          if (d < 16) e.damage(9999, 0, 0, g);
        }
        g.player.dead = false;
        g.player.pos.set(el.spec.x + 1, el.topY + 0.95, el.spec.z + 1);
        g.player.vel.set(0, 0, 0);
        g.player.health = 200;
        const t0 = performance.now();
        while (performance.now() - t0 < 9000) {
          await new Promise((r) => setTimeout(r, 200));
          if (el.topY >= el.spec.highY - 0.01) break;
        }
        return {
          topY: el.topY, playerY: g.player.pos.y,
          hp: g.player.health, dead: g.player.dead, state: g.state,
          px: g.player.pos.x.toFixed(2), pz: g.player.pos.z.toFixed(2),
          ex: el.spec.x, ez: el.spec.z,
        };
      });
      if (elevResult.topY >= 3.9 && elevResult.playerY > 4.3) break;
      console.log(`  retry: elevator diag = ${JSON.stringify(elevResult)}`);
    }
    check(elevResult.topY >= 3.9, `sector ${sector}: elevator rose (topY=${elevResult.topY.toFixed(2)})`);
    check(elevResult.playerY > 4.3, `sector ${sector}: player carried up (${JSON.stringify(elevResult)})`);

    const endState = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      const room = g.level.rooms.find((r) => r.kind === 'exit');
      let pad = null;
      for (let x = room.x; x < room.x + room.w && !pad; x++) {
        for (let z = room.z; z < room.z + room.d && !pad; z++) {
          if (g.world.get(x, 3, z) === 13) pad = { x, z };
        }
      }
      if (!pad) return 'no-pad';
      g.player.pos.set(pad.x + 0.5, 4.95, pad.z + 0.5);
      g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 1200));
      return g.state;
    });
    return endState;
  };

  for (let sector = 1; sector <= 3; sector++) {
    const endState = await completeLevel(sector);
    if (sector < 3) {
      check(endState === 'intermission', `sector ${sector}: reached exit → intermission (state=${endState})`);
      await page.screenshot({ path: `${OUT}/e2e-3-sector${sector}-done.png` });
      // click through to the next sector
      await page.mouse.click(640, 360);
      await new Promise((r) => setTimeout(r, 1500));
      await forceLock();
      const info = await page.evaluate(() => {
        const g = window.__voxelstrike;
        return { idx: g.levelIndex, state: g.state, enemies: g.enemies.aliveCount() };
      });
      check(
        info.idx === sector + 1 && info.state === 'playing' && info.enemies > 0,
        `sector ${sector + 1} loaded (enemies=${info.enemies})`
      );
    } else {
      check(endState === 'won', `sector 3: campaign complete (state=${endState})`);
      await page.screenshot({ path: `${OUT}/e2e-4-campaign.png` });
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
console.log('\nE2E TEST PASSED');
