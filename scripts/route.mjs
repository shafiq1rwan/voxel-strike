/**
 * The objective arrow's walking route (src/core/route.ts): in sectors 1–7 on
 * three seeds, a body that only ever steps toward the arrow's aim point
 * reaches the keycard (the boss on a boss sector), then the red door, then
 * the lift — never standing in a wall — and the distance shown is the walk,
 * not the straight line. Also reports how often the OLD arrow (the straight
 * line to the keycard) pointed into a wall from the spawn.
 *
 *   node scripts/route.mjs [url]     (dev server)
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const BASE = (process.argv[2] ?? 'http://localhost:5173/').replace(/\?.*$/, '');
const EDGE = process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const SEEDS = [12345, 777, 4242];
const errors = [];
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!ok) failed++;
};

const browser = await puppeteer.launch({
  executablePath: EDGE, headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser);

try {
  let walls = 0;
  let layouts = 0;
  for (const seed of SEEDS) {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${BASE}?seed=${seed}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('#start-btn');
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__voxelstrike?.state === 'playing');

    const res = await page.evaluate(() => {
      const g = window.__voxelstrike;
      const CRATE = 11, BARREL = 15;
      const open = (x, y, z) => { const b = g.world.get(x, y, z); return b === 0 || b === CRATE || b === BARREL; };
      const stands = (x, z) => {
        const cx = Math.floor(x), cz = Math.floor(z);
        for (let y = 1; y <= 6; y++) if (open(cx, y, cz) && open(cx, y + 1, cz) && !open(cx, y - 1, cz)) return true;
        return false;
      };
      /** step toward the arrow until within `near` of the target; null = fine, else what went wrong */
      const walk = (target, near) => {
        const p = g.player.pos;
        let routedAll = true;
        for (let i = 0; i < 1500; i++) {
          g.updateObjective();
          const a = g.routeDebug;
          if (!a.routed) routedAll = false;
          if (Math.hypot(target.x - p.x, target.z - p.z) <= near) return { ok: true, steps: i, routedAll };
          const dx = a.x - p.x, dz = a.z - p.z;
          const len = Math.hypot(dx, dz);
          if (len < 1e-3) return { ok: false, why: `aim on the body at step ${i}` };
          const s = Math.min(0.4, len);
          p.x += (dx / len) * s;
          p.z += (dz / len) * s;
          if (!stands(p.x, p.z)) return { ok: false, why: `stepped into a wall at ${p.x.toFixed(1)}, ${p.z.toFixed(1)} (step ${i})` };
        }
        return { ok: false, why: 'never arrived' };
      };
      const straightBlocked = (a, b) => {
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.25);
        for (let i = 1; i < n; i++) {
          const t = i / n;
          if (!stands(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return true;
        }
        return false;
      };

      const out = [];
      for (let n = 1; n <= 7; n++) {
        g.levelIndex = n;
        g.buildLevel();
        g.state = 'playing';
        g.player.spawnAt(g.level.spawn.x, g.level.spawn.y, g.level.spawn.z);
        const row = { n, theme: g.level.theme };
        const spawn = { x: g.player.pos.x, z: g.player.pos.z };
        g.updateObjective();
        const stage = g.objStage;
        row.stage = stage;
        const first = g.objectiveTarget(stage);
        row.straight = Math.hypot(first.x - spawn.x, first.z - spawn.z);
        row.shown = g.routeDebug.dist;
        row.routedAtSpawn = g.routeDebug.routed;
        row.oldArrowIntoWall = straightBlocked(spawn, first);
        row.first = walk(first, stage === 'boss' ? 4.5 : 1.2);
        if (stage !== 'boss' && row.first.ok) {
          // holding the keycard: the red door, then (unlocked) the lift
          g.player.keys.add('red');
          g.updateObjective();
          row.stage2 = g.objStage;
          row.door = walk(g.objectiveTarget('door'), 1.6);
          const door = g.doors.find((d) => d.spec.locked === 'red');
          door.locked = null;
          g.updateObjective();
          row.stage3 = g.objStage;
          row.lift = walk(g.objectiveTarget('lift'), 1.6);
        }
        g.player.keys.delete('red');
        out.push(row);
      }
      return out;
    });

    for (const r of res) {
      layouts++;
      if (r.oldArrowIntoWall) walls++;
      const tag = `seed ${seed} sector ${r.n} (${r.theme})`;
      check(r.routedAtSpawn, `${tag}: the arrow has a route from the spawn (${r.stage})`);
      check(r.shown >= r.straight - 0.6, `${tag}: the distance shown is the walk (${r.shown.toFixed(0)}m, straight ${r.straight.toFixed(0)}m)`);
      check(r.first.ok, `${tag}: following the arrow reaches the ${r.stage === 'boss' ? 'boss' : 'keycard'}${r.first.ok ? ` in ${r.first.steps} steps` : ` — ${r.first.why}`}`);
      if (r.stage === 'boss' || !r.first.ok) continue;
      check(r.stage2 === 'door' && r.door.ok, `${tag}: with the keycard, the arrow leads back to the red door${r.door.ok ? '' : ` — ${r.door.why}`}`);
      check(r.stage3 === 'lift' && r.lift.ok, `${tag}: through the door, the arrow leads to the lift${r.lift.ok ? '' : ` — ${r.lift.why}`}`);
    }
    await page.close();
  }
  console.log(`INFO: the old straight arrow pointed into a wall from the spawn in ${walls} of ${layouts} layouts`);
  check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
} finally {
  await browser.close();
}

console.log(failed ? `\nROUTE TEST FAILED (${failed})` : '\nROUTE TEST PASSED');
process.exit(failed ? 1 : 0);
