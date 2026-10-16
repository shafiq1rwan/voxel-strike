/**
 * Sector 4 preview: the Vatborn tank breach. Shoots an occupied specimen tank
 * and checks the sequence from reference/sector4-monsters.md — sealed during
 * the 1.2s agitation, a real collision gap at the breach, one Vatborn after
 * the step-out, no damage during the warning, and a tank releases only once.
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
  const state = () => page.evaluate(() => {
    const g = window.__voxelstrike;
    return {
      vat: g.enemies.list.filter((e) => e.kind === 'vatborn').length,
      total: g.level.totalEnemies,
      front: g.world.get(26, 3, 41),
      hp: g.player.health,
    };
  });
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    for (const e of g.enemies.list) { e.pos.x = 2; e.pos.z = 2; e.awake = false; e.state = 'idle'; }
    g.player.pos.set(32, 1.9, 41); g.player.vel.set(0, 0, 0);
    g.player.yaw = Math.PI / 2; g.player.pitch = -0.05; // face -x, at the tank
    g.input.locked = true;
    g.hud.clearHint();
  });
  await sleep(300);
  const s0 = await state();
  check(s0.vat === 0 && s0.front === 29, `dormant: no Vatborn yet, front glass intact (block ${s0.front})`);

  await page.evaluate(() => window.__voxelstrike.input.pressFire());
  await sleep(500);
  const s1 = await state();
  check(s1.vat === 0 && s1.front === 29, 'shot the tank: still sealed during the 1.2s agitation');

  await sleep(1000);
  const s2 = await state();
  check(s2.front === 0, `breach: the front glass voxels are air — a real collision gap (block ${s2.front})`);
  await page.screenshot({ path: 'scripts/shots/breach-open.png' });

  await sleep(1200);
  const s3 = await state();
  check(s3.vat === 1, `step-out: exactly one Vatborn released (${s3.vat})`);
  check(s3.hp === 100, `no damage during the warning or the glass break (hp ${s3.hp})`);
  await page.screenshot({ path: 'scripts/shots/breach-released.png' });

  await page.evaluate(() => window.__voxelstrike.input.pressFire());
  await sleep(2500);
  const s4 = await state();
  check(s4.vat === 1, `the same tank never releases a second one (${s4.vat})`);
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
