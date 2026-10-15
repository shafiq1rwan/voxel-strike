/**
 * Aim assist regression: on touch profiles, a slightly off-target hitscan
 * snaps onto the enemy (bullet magnetism), look sensitivity drops while
 * tracking (sticky aim), and holding fire eases the view onto a nearby target
 * (rotation assist) without ever drifting on its own; on desktop the
 * identical shots must miss and the view must never move.
 * Usage: node scripts/aimassist.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const errors = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) errors.push(msg);
};

// Places player + husk 10 units apart on a verified-clear line inside a large
// room, aiming `offset` radians off the enemy's center. Returns starting hp.
const setupShot = (pg, offsetRad) => pg.evaluate(async (offset) => {
  const g = window.__voxelstrike;
  g.input.locked = true;
  const e = g.enemies.list.find((q) => q.alive && q.kind === 'husk');
  // freeze the target's AI: this test measures aim cones against a static
  // hitbox — a woken husk weaves sideways and can wander into the ray
  e.wake = () => {};
  for (const o of g.enemies.list) {
    if (o !== e && o.alive) { o.pos.x = 4; o.pos.z = 4; o.awake = false; o.state = 'idle'; }
  }
  const p2 = g.player;

  // find a room with a clear 12-unit lane along x or z
  let lane = null;
  for (const r of g.level.rooms) {
    const tryLane = (alongX) => {
      const len = alongX ? r.w : r.d;
      if (len < 14) return null;
      for (let off = 0; off <= 4 && !lane; off++) {
        for (const s of [0, -off, off]) {
          const cz = (alongX ? r.cz : r.cx) + s;
          let clear = true;
          for (let i = 1; i < len - 1 && clear; i++) {
            const x = alongX ? r.x + i : cz;
            const z = alongX ? cz : r.z + i;
            if (g.world.get(x, 1, z) !== 0 || g.world.get(x, 2, z) !== 0) clear = false;
          }
          if (clear) return { r, alongX, cross: cz };
        }
      }
      return null;
    };
    lane = tryLane(true) ?? tryLane(false);
    if (lane) break;
  }
  if (!lane) return { hp: -1, error: 'no clear lane found' };

  const { r, alongX, cross } = lane;
  if (alongX) {
    p2.pos.set(r.x + 1.5, 2.0, cross + 0.5);
    e.pos.set(r.x + 11.5, e.pos.y, cross + 0.5);
    p2.yaw = -Math.PI / 2; // face +x
  } else {
    p2.pos.set(cross + 0.5, 2.0, r.z + 1.5);
    e.pos.set(cross + 0.5, e.pos.y, r.z + 11.5);
    p2.yaw = Math.PI; // face +z
  }
  p2.vel.set(0, 0, 0);
  p2.pitch = 0;
  p2.yaw += offset;
  e.mesh.position.copy(e.pos);
  e.awake = false; e.state = 'idle'; e.vel.set(0, 0, 0);
  await new Promise((res) => setTimeout(res, 100));
  e.awake = false; e.state = 'idle'; e.vel.set(0, 0, 0);
  return { hp: e.hp };
}, offsetRad);

const hpNow = (pg) => pg.evaluate(() => window.__voxelstrike.enemies.list.find((q) => q.kind === 'husk').hp);

const fireTouch = async (pg) => {
  await pg.evaluate(() => {
    const g = window.__voxelstrike;
    g.input.touchState.fire = true;
    g.input.pressFire();
  });
  await new Promise((r) => setTimeout(r, 120));
  await pg.evaluate(() => { window.__voxelstrike.input.touchState.fire = false; });
  await new Promise((r) => setTimeout(r, 120));
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
});
fakePointerLock(browser); // keep the real OS cursor free

try {
  // ---- mobile profile ------------------------------------------------------
  let pg = await browser.newPage();
  await pg.setViewport({ width: 850, height: 400, hasTouch: true, isMobile: true });
  await pg.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await pg.waitForSelector('#title-screen');
  await pg.tap('#start-btn');
  await new Promise((r) => setTimeout(r, 800));

  // 3.2 degrees off at 10u: outside the hitbox (2.2 deg), inside the 4-deg cone
  let s = await setupShot(pg, 0.055);
  await fireTouch(pg);
  let hp = await hpNow(pg);
  check(hp < s.hp, `mobile: 3-deg off shot snapped and hit (hp ${s.hp} -> ${hp})`);

  // 9 degrees off: outside the cone — must stay a miss
  s = await setupShot(pg, 0.16);
  await fireTouch(pg);
  hp = await hpNow(pg);
  check(hp === s.hp, 'mobile: 9-deg off shot missed (cone bounded)');

  // sticky aim: identical look input turns less with a target under the cross
  await setupShot(pg, 0);
  const sticky = await pg.evaluate(async () => {
    const g = window.__voxelstrike;
    const e = g.enemies.list.find((q) => q.kind === 'husk');
    const p2 = g.player;
    const y0 = p2.yaw;
    g.input.mouseDX += 100;
    await new Promise((r) => setTimeout(r, 150));
    const near = Math.abs(p2.yaw - y0);
    e.pos.set(4, e.pos.y, 4);
    const y1 = p2.yaw;
    g.input.mouseDX += 100;
    await new Promise((r) => setTimeout(r, 150));
    const free = Math.abs(p2.yaw - y1);
    return near / free;
  });
  check(sticky > 0.4 && sticky < 0.75, `mobile: sticky aim friction near target (ratio ${sticky.toFixed(2)})`);

  // rotation assist: no input → the view must not drift onto a nearby target
  await setupShot(pg, 0.12);
  const drift = await pg.evaluate(async () => {
    const p2 = window.__voxelstrike.player;
    const y0 = p2.yaw;
    await new Promise((r) => setTimeout(r, 400));
    return Math.abs(p2.yaw - y0);
  });
  check(drift < 1e-6, `mobile: no view drift without input (${drift.toFixed(4)} rad)`);

  // rotation assist: holding fire 7 deg off (outside magnetism) pulls onto the husk
  s = await setupShot(pg, 0.12);
  const pull = await pg.evaluate(async () => {
    const g = window.__voxelstrike;
    const err0 = g.player.yaw;
    g.input.touchState.fire = true;
    g.input.pressFire();
    await new Promise((r) => setTimeout(r, 650));
    g.input.touchState.fire = false;
    return { moved: err0 - g.player.yaw };
  });
  hp = await hpNow(pg);
  check(pull.moved > 0.07, `mobile: held fire pulls the view toward the target (${pull.moved.toFixed(3)} of 0.12 rad)`);
  check(hp < s.hp, `mobile: rotation assist turned a 7-deg miss into hits (hp ${s.hp} -> ${hp})`);
  await pg.close();

  // ---- desktop profile: identical shot must miss ---------------------------
  pg = await browser.newPage();
  await pg.setViewport({ width: 1280, height: 720 });
  await pg.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await pg.waitForSelector('#title-screen');
  await pg.click('#start-btn');
  await new Promise((r) => setTimeout(r, 800));
  s = await setupShot(pg, 0.055);
  await pg.evaluate(() => { window.__voxelstrike.input.locked = true; });
  await pg.mouse.down();
  await new Promise((r) => setTimeout(r, 120));
  await pg.mouse.up();
  await new Promise((r) => setTimeout(r, 150));
  hp = await hpNow(pg);
  check(hp === s.hp, 'desktop: identical off-target shot missed (no assist)');

  // desktop: holding fire near a target never rotates the view
  await setupShot(pg, 0.12);
  const y0 = await pg.evaluate(() => window.__voxelstrike.player.yaw);
  await pg.mouse.down();
  await new Promise((r) => setTimeout(r, 400));
  await pg.mouse.up();
  const y1 = await pg.evaluate(() => window.__voxelstrike.player.yaw);
  check(Math.abs(y1 - y0) < 1e-6, 'desktop: no rotation assist while firing');
  await pg.close();
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nAIM ASSIST TEST PASSED');
