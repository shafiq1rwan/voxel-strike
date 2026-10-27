/**
 * The Facility's sector monsters (reference/sector-monsters-v2, BEHAVIOURS.md
 * §1–3): sector rosters (1 Husk + Ticker — the Sentry Bud left the campaign,
 * owner's call —, 2 Clamp Guard + Arc Sentinel, 3 Brute + Wire Leech, no
 * Tickers past sector 1, every room still populated, the keycard
 * alarm from the sector's pair, endless Facility depths pick a band), and
 * each new mechanic in isolation with real game time:
 *  - Sentry Bud: bolted down, ~1 s aim with its lids open, one 6-damage bolt,
 *    ≥ 3.5 s between shots; a dodge after the lock makes it miss
 *  - Clamp Guard: one 16-damage pinch in front; stepping to its side after the
 *    lock beats it; it turns ≤ 65°/s; the recovery is open to a bash
 *  - Wire Leech: the tether links, slows, stings twice for 4, lets go by 0.8 s;
 *    20 damage to the coil snaps it early; walking out of range breaks it; a
 *    level rebuild leaves no link behind
 * Usage: node scripts/facility-monsters.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.waitForSelector('#start-btn');

  // 1. rosters, straight from the generator
  const rosters = await page.evaluate(async () => {
    const { generateLevel } = await import('/src/world/levelgen.ts');
    // the per-sector pairs are OFF (FACILITY_ROSTERS, owner's call 2026-10-27):
    // sectors 1–3 and endless Facility depths get the generic 0.3.4 mix
    const generic = ['husk', 'sentinel', 'ticker', 'brute'];
    const allowed = { 1: ['husk', 'sentinel'], 2: generic, 3: generic };
    const out = {};
    for (const n of [1, 2, 3, 8]) {
      const band = n === 8 ? 2 : n; // depth 8: any generic kind
      let ok = true, empty = 0, seen = new Set(), resp = '';
      for (const seed of [12345, 42, 777, 90210, 31337, 2024]) {
        const l = generateLevel(seed, n, 'facility');
        for (const e of l.enemies) { seen.add(e.kind); if (!allowed[band].includes(e.kind)) ok = false; }
        const occupied = new Set(l.enemies.map((e) => e.roomId));
        empty += l.rooms.filter((r) => r.kind !== 'spawn' && !occupied.has(r.id)).length;
        resp = (l.responseKinds ?? []).join(',');
      }
      out[n] = { ok, empty, kinds: [...seen].sort().join(','), resp };
    }
    return out;
  });
  check(rosters[1].ok && /husk/.test(rosters[1].kinds), `sector 1 is the old opener: Husks + Arc Sentinels, no Tickers or Brute (${rosters[1].kinds})`);
  check(rosters[2].ok && rosters[2].kinds.includes('husk') && rosters[2].kinds.includes('sentinel'), `sector 2 is the generic 0.3.4 mix (${rosters[2].kinds})`);
  check(rosters[3].ok && rosters[3].kinds.includes('brute'), `sector 3 is the generic 0.3.4 mix (${rosters[3].kinds})`);
  check(rosters[8].ok, `endless Facility depth 8 is the generic mix too (${rosters[8].kinds})`);
  check([1, 2, 3].every((n) => rosters[n].empty === 0), 'every room past spawn still holds enemies in sectors 1–3');
  check([1, 2, 3].every((n) => rosters[n].resp === ''), 'the keycard alarm uses the generic mix (no per-sector list)');

  // a quiet arena with one test monster in it
  await page.click('#start-btn');
  await sleep(800);
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.levelIndex = 2; g.buildLevel(); g.state = 'playing'; g.input.locked = true;
    g.hud.clearHint?.();
    window.__solo = (kind, dx, dz, pdx, pdz) => {
      for (const e of g.enemies.list) if (!e.__test) { e.update = () => {}; e.mesh.visible = false; e.pos.set(2, 30, 2); }
      const a = g.level.rooms.find((r) => r.kind === 'arena');
      const cx = a.cx + 0.5, cz = a.cz + 0.5;
      g.player.pos.set(cx + pdx, 1.9, cz + pdz); g.player.vel.set(0, 0, 0);
      g.player.health = 100; g.player.armor = 0; g.player.dead = false;
      g.player.buffs.shield = 0; g.player.slow = 0;
      const before = g.enemies.list.length;
      g.enemies.spawnFromSpecs([{ kind, x: cx + dx, z: cz + dz, roomId: a.id }], g.level.rooms, g);
      const e = g.enemies.list[before];
      e.__test = true;
      window.__e = e;
      return e;
    };
    window.__clear = () => { for (const e of g.enemies.list) if (e.__test && e.alive) { e.hp = 0; e.update = () => {}; e.mesh.visible = false; e.pos.set(2, 30, 2); } };
  });

  // 2. Sentry Bud
  const bud = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const e = window.__solo('sentryBud', 0, 0, 0, 6);
    const x0 = e.pos.x, z0 = e.pos.z;
    let lidsOpen = 0, prepStart = -1, firstHit = -1, shots = [];
    const t0 = performance.now();
    let hp = g.player.health;
    while (performance.now() - t0 < 9000) {
      g.player.health = Math.max(g.player.health, 40); // keep it alive, read the drops
      const t = (performance.now() - t0) / 1000;
      if (e.state === 'attack' && e.phase === 'prep') {
        if (prepStart < 0) prepStart = t;
        const lid = e.mesh.getObjectByName('lid');
        if (lid) lidsOpen = Math.max(lidsOpen, Math.abs(lid.rotation.y));
      }
      if (g.player.health < hp) { shots.push({ t, dmg: hp - g.player.health }); if (firstHit < 0) firstHit = t; }
      hp = g.player.health;
      await new Promise((r) => setTimeout(r, 16));
    }
    const moved = Math.hypot(e.pos.x - x0, e.pos.z - z0);
    return { moved, lidsOpen, prepStart, firstHit, shots };
  });
  check(bud.moved < 0.05, `the Sentry Bud stays bolted to the floor (moved ${bud.moved.toFixed(3)} u)`);
  check(bud.lidsOpen > 0.4, `its lids swing open while it aims (${bud.lidsOpen.toFixed(2)} rad)`);
  check(bud.shots.length >= 2 && bud.shots.every((s) => s.dmg === 6), `its bolt hits for 6 (${bud.shots.map((s) => s.dmg).join(', ')})`);
  const gaps = bud.shots.slice(1).map((s, i) => s.t - bud.shots[i].t);
  check(gaps.length >= 1 && gaps.every((g) => g >= 3.3), `at least ~3.5 s between shots (${gaps.map((g) => g.toFixed(2)).join(', ')} s)`);
  const dodge = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    const e = window.__solo('sentryBud', 0, 0, 0, 6);
    // wait for the aim to lock, then step two units sideways
    const t0 = performance.now();
    while (performance.now() - t0 < 6000 && !(e.state === 'attack' && e.phase === 'prep' && e.phaseT > 0.8)) await new Promise((r) => setTimeout(r, 10));
    const locked = e.phase === 'prep' && e.phaseT > 0.8;
    g.player.pos.x += 2.2;
    const hp = g.player.health;
    await new Promise((r) => setTimeout(r, 1600));
    return { locked, dmg: hp - g.player.health };
  });
  check(dodge.locked && dodge.dmg === 0, `a sidestep after the aim locks makes it miss (took ${dodge.dmg})`);

  // 3. Clamp Guard
  const guard = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    const e = window.__solo('clampGuard', 0, 0, 0, 1.6);
    e.facility.face = 0; // facing -z... the player is at +z: turn it toward them first
    e.facility.face = Math.PI; e.mesh.rotation.y = Math.PI;
    e.wake(g);
    const t0 = performance.now();
    let hits = [], hp = 100, prepAt = -1, recoverVulnerable = false;
    while (performance.now() - t0 < 4000) {
      if (e.state === 'attack' && e.phase === 'prep' && prepAt < 0) prepAt = (performance.now() - t0) / 1000;
      if (e.state === 'attack' && e.phase === 'recover' && e.vulnerable) recoverVulnerable = true;
      if (g.player.health < hp) hits.push(hp - g.player.health);
      hp = g.player.health;
      // keep the player in front, at arm's length
      g.player.pos.z = e.pos.z + 1.6; g.player.pos.x = e.pos.x;
      g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 16));
    }
    return { hits, prepAt, recoverVulnerable };
  });
  check(guard.hits.length >= 1 && guard.hits[0] === 16, `the Clamp Guard pinches once for 16 (${guard.hits.join(', ')})`);
  check(guard.recoverVulnerable, 'the jaws stay shut afterwards and it is open to a bash (vulnerable in recovery)');
  const side = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    const e = window.__solo('clampGuard', 0, 0, 0, 1.6);
    e.facility.face = Math.PI; e.mesh.rotation.y = Math.PI; e.wake(g);
    const t0 = performance.now();
    while (performance.now() - t0 < 4000 && !(e.state === 'attack' && e.phase === 'prep' && e.phaseT > 0.65)) {
      g.player.pos.z = e.pos.z + 1.6; g.player.pos.x = e.pos.x; g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 10));
    }
    const locked = e.phase === 'prep' && e.phaseT > 0.65;
    // step round to its side (90°), still inside its reach
    g.player.pos.set(e.pos.x + 1.6, g.player.pos.y, e.pos.z); g.player.vel.set(0, 0, 0);
    const hp = g.player.health;
    const t1 = performance.now();
    while (performance.now() - t1 < 900) { g.player.vel.set(0, 0, 0); await new Promise((r) => setTimeout(r, 10)); }
    return { locked, dmg: hp - g.player.health };
  });
  check(side.locked && side.dmg === 0, `stepping to its side after the lock beats the pinch (took ${side.dmg})`);
  const turn = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    // the player directly behind it, out of reach: it has to turn round
    const e = window.__solo('clampGuard', 0, 0, 0, 5);
    e.facility.face = 0; e.mesh.rotation.y = 0; e.wake(g);
    await new Promise((r) => setTimeout(r, 50));
    const f0 = e.facility.face;
    await new Promise((r) => setTimeout(r, 1000));
    return { rate: Math.abs(e.facility.face - f0) / 1.05 };
  });
  check(turn.rate > 0.5 && turn.rate <= 65 * Math.PI / 180 + 0.05, `it turns slowly, ≤ 65°/s (${(turn.rate * 180 / Math.PI).toFixed(0)}°/s)`);

  // 4. Wire Leech
  const leech = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    const e = window.__solo('wireLeech', 0, 0, 0, 5);
    e.wake(g);
    const t0 = performance.now();
    let linkedAt = -1, endedAt = -1, slowed = false, hits = [], hp = 100;
    while (performance.now() - t0 < 7000) {
      const t = (performance.now() - t0) / 1000;
      g.player.pos.set(e.pos.x, g.player.pos.y, e.pos.z + 5); g.player.vel.set(0, 0, 0);
      if (e.facility.linked && linkedAt < 0) linkedAt = t;
      if (linkedAt >= 0 && endedAt < 0 && !e.facility.linked) endedAt = t;
      if (e.facility.linked && g.player.slow > 0) slowed = true;
      if (g.player.health < hp) hits.push(hp - g.player.health);
      hp = g.player.health;
      if (endedAt >= 0) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    return { linkedAt, held: endedAt - linkedAt, slowed, hits };
  });
  check(leech.linkedAt > 0.9, `the Wire Leech anchors and casts a tether that links (after ${leech.linkedAt.toFixed(2)} s)`);
  check(leech.slowed, 'the link slows the player');
  check(leech.hits.join() === '4,4' && leech.held > 0.6 && leech.held < 1.0, `two 4-damage stings, then it lets go (${leech.hits.join(', ')}; held ${leech.held.toFixed(2)} s)`);
  const coil = await page.evaluate(async () => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const g = window.__voxelstrike;
    window.__clear();
    await new Promise((r) => setTimeout(r, 1300)); // the relink grace from the last link
    const e = window.__solo('wireLeech', 0, 0, 0, 5);
    e.wake(g);
    const t0 = performance.now();
    while (performance.now() - t0 < 6000 && !e.facility.linked) {
      g.player.pos.set(e.pos.x, g.player.pos.y, e.pos.z + 5); g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 5));
    }
    const was = e.facility.linked;
    // Real hitscan through the folded copper bar; do not inject a core-hit flag.
    const bar = e.facility.hitParts.find(p => p.name === 'coil-top');
    e.mesh.updateWorldMatrix(true, true);
    const point = new THREE.Vector3().setFromMatrixPosition(bar.matrix).applyMatrix4(bar.parent.matrixWorld);
    const dir = new THREE.Vector3(0, 0, 1).transformDirection(bar.parent.matrixWorld);
    const origin = point.clone().addScaledVector(dir, -1.5);
    for (let i = 0; i < 2; i++) g.weapons.hitscan(origin, dir, 10, g, origin);
    return { was, now: e.facility.linked, alive: e.alive };
  });
  check(coil.was && !coil.now && coil.alive, '20 damage to its coil snaps the link early (the leech still standing)');
  const range = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    await new Promise((r) => setTimeout(r, 1300));
    const e = window.__solo('wireLeech', 0, 0, 0, 5);
    e.wake(g);
    const t0 = performance.now();
    while (performance.now() - t0 < 6000 && !e.facility.linked) {
      g.player.pos.set(e.pos.x, g.player.pos.y, e.pos.z + 5); g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 5));
    }
    const was = e.facility.linked;
    g.player.pos.set(e.pos.x, g.player.pos.y, e.pos.z + 9.5);
    await new Promise((r) => setTimeout(r, 80));
    return { was, now: e.facility.linked };
  });
  check(range.was && !range.now, 'leaving its range breaks the link');
  const rebuild = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    await new Promise((r) => setTimeout(r, 1300));
    let e = window.__solo('wireLeech', 0, 0, 0, 5);
    e.wake(g);
    let t0 = performance.now();
    while (performance.now() - t0 < 6000 && !e.facility.linked) {
      g.player.pos.set(e.pos.x, g.player.pos.y, e.pos.z + 5); g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 5));
    }
    const was = e.facility.linked;
    // the level is rebuilt mid-link (retry / next sector): nothing may survive it
    g.buildLevel(); g.state = 'playing'; g.input.locked = true;
    await new Promise((r) => setTimeout(r, 1400));
    e = window.__solo('wireLeech', 0, 0, 0, 5);
    e.wake(g);
    t0 = performance.now();
    while (performance.now() - t0 < 6000 && !e.facility.linked) {
      g.player.pos.set(e.pos.x, g.player.pos.y, e.pos.z + 5); g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 5));
    }
    return { was, relinked: e.facility.linked };
  });
  check(rebuild.was && rebuild.relinked, 'after a rebuild mid-link no stale link blocks a new one');

  // 5. the rig budget: ordinary enemies stay within 32 boxes
  const boxes = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const out = {};
    for (const kind of ['sentryBud', 'clampGuard', 'wireLeech', 'sentinel']) {
      const e = window.__solo(kind, 0, 0, 0, 6);
      let n = 0; e.mesh.traverse((o) => { if (o.isMesh) n += o.userData.boxCount ?? 1; });
      out[kind] = n;
      window.__clear();
    }
    return out;
  });
  check(Object.values(boxes).every((n) => n >= 12 && n <= 32), `rig box counts within budget (${Object.entries(boxes).map(([k, n]) => `${k} ${n}`).join(', ')})`);
  await page.close();
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
}
if (failed) { console.log(`${failed} FAILED`); process.exit(1); }
console.log('FACILITY MONSTERS TEST PASSED');
