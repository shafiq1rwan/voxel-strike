/**
 * Sector 4 preview: the Vatborn tank breach. Occupied tanks hold a real,
 * dormant Vatborn. Shoots one tank and checks the sequence from
 * reference/sector4-monsters.md — sealed during the 1.2s agitation, a real
 * collision gap at the breach, liquid gushing out as droplets, the occupant
 * walking out of the tank onto the floor, no damage during the warning, and
 * a tank releases only once.
 * Usage: node scripts/breach.mjs [base-url]   (dev or preview server)
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import { mkdirSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://localhost:5173/';
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync('scripts/shots', { recursive: true });

const errors = [];
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!ok) errors.push(msg);
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser); // keep the real OS cursor free
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`); });
  await page.goto(`${BASE}?sector4&seed=12345`, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#preview-start');
  await sleep(900); // the preview screen arms after 0.7s
  await page.click('#preview-start');
  await sleep(800);

  // the occupied lab tank spans x 24..26, z 40..41; its room-facing glass is the x=26 column
  // its occupant is the Vatborn nearest the tank's centre (25.5, 41)
  const state = () => page.evaluate(() => {
    const g = window.__voxelstrike;
    const vats = g.enemies.list.filter((e) => e.kind === 'vatborn');
    const occ = vats.reduce((a, e) => (!a || Math.hypot(e.pos.x - 25.5, e.pos.z - 41) < Math.hypot(a.pos.x - 25.5, a.pos.z - 41) ? e : a), null);
    const droplets = g.particles.pool.filter((p) => p.alive && p.size > 0.065 && p.gravity === 20).length;
    return {
      vat: vats.length,
      dormant: vats.filter((e) => e.dormant).length,
      occDormant: occ?.dormant, occScripted: occ?.scripted, occAwake: occ?.awake,
      occX: occ ? Math.round(occ.pos.x * 10) / 10 : null, occFeet: occ ? Math.round((occ.pos.y - occ.half.y) * 100) / 100 : null,
      total: g.level.totalEnemies,
      front: g.world.get(26, 3, 41),
      droplets,
      hp: g.player.health,
    };
  });
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    // park everything except the tank occupants
    for (const e of g.enemies.list) if (e.kind !== 'vatborn') { e.pos.x = 2; e.pos.z = 2; e.awake = false; e.state = 'idle'; }
    g.player.pos.set(32, 1.9, 41); g.player.vel.set(0, 0, 0);
    g.player.yaw = Math.PI / 2; g.player.pitch = -0.05; // face -x, at the tank
    g.input.locked = true;
    g.hud.clearHint();
  });
  await sleep(300);
  const s0 = await state();
  check(s0.vat === 4 && s0.dormant === 4, `dormant: a real Vatborn floats in each of the 4 occupied tanks (${s0.dormant}/${s0.vat})`);
  check(s0.front === 29 && s0.occX > 24 && s0.occX < 27, `the occupant is inside its sealed tank (x ${s0.occX}, front block ${s0.front})`);

  await page.evaluate(() => window.__voxelstrike.input.pressFire());
  await sleep(500);
  const s1 = await state();
  check(s1.occDormant && s1.front === 29, 'shot the tank: still sealed, occupant still inside during the 1.2s agitation');

  await sleep(1000);
  const s2 = await state();
  check(s2.front === 0, `breach: the front glass voxels are air — a real collision gap (block ${s2.front})`);
  check(s2.droplets > 30, `breach: liquid gushes out as falling droplets (${s2.droplets} in flight)`);
  await page.screenshot({ path: 'scripts/shots/breach-open.png' });

  await sleep(1200);
  const s3 = await state();
  check(!s3.occDormant && !s3.occScripted && s3.occAwake, 'step-out: the occupant walked out and is hunting');
  check(s3.occX > 27.5 && Math.abs(s3.occFeet - 1) < 0.25, `it is out of the tank, standing on the floor (x ${s3.occX}, feet y ${s3.occFeet})`);
  check(s3.dormant === 3, `the other three tanks stay sealed (${s3.dormant} dormant)`);
  check(s3.hp === 100, `no damage during the warning or the glass break (hp ${s3.hp})`);
  await page.screenshot({ path: 'scripts/shots/breach-released.png' });

  await page.evaluate(() => window.__voxelstrike.input.pressFire());
  await sleep(2500);
  const s4 = await state();
  check(s4.vat === 4, `the same tank never releases a second one (${s4.vat} Vatborn in total)`);
  check(s0.total === s4.total, `occupied tanks are preallocated in the roster (${s0.total} before and after)`);
  await page.close();
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nBREACH TEST PASSED');
