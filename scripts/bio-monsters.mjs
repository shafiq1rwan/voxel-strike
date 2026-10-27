/**
 * The Biofoundry's sector monsters (reference/sector-monsters-v2, BEHAVIOURS.md
 * §4–5): sector rosters (4 Vatborn + Spitter, 5 Carapace — tank occupants and
 * the Broodkeeper as before), and each new mechanic alone in real time:
 *  - Spitter: marks the landing spot while it aims, lobs one arcing glob that
 *    hits for 10, leaves an acid patch that stings 3 every 0.5 s and expires;
 *    stepping off the mark after the lock beats the glob; ≥ 4.5 s between lobs;
 *    at most 3 patches in the level
 *  - Carapace: front ×0.25, back ×1, bared core ×2; three spikes in a fan,
 *    8 each; no flinch mid-attack
 *  - Vatborn tuned (95 hp); the Broodkeeper's adds are Carapaces, ≤ 2 alive
 * Usage: node scripts/bio-monsters.mjs [url]
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

  // 1. rosters straight from the generator
  const rosters = await page.evaluate(async () => {
    const { generateLevel } = await import('/src/world/levelgen.ts');
    const allowed = { 4: ['vatborn', 'spitter'], 5: ['carapace'] };
    const out = {};
    for (const n of [4, 5]) {
      let ok = true, empty = 0, seen = new Set(), resp = '';
      for (const seed of [12345, 42, 777, 90210, 31337, 2024]) {
        const l = generateLevel(seed, n, 'biofoundry', n === 5);
        for (const e of l.enemies) { seen.add(e.kind); if (!allowed[n].includes(e.kind)) ok = false; }
        const occupied = new Set(l.enemies.map((e) => e.roomId));
        empty += l.rooms.filter((r) => r.kind !== 'spawn' && r.id !== l.boss?.roomId && !occupied.has(r.id)).length;
        resp = (l.responseKinds ?? []).join(',');
      }
      out[n] = { ok, empty, kinds: [...seen].sort().join(','), resp };
    }
    return out;
  });
  check(rosters[4].ok && rosters[4].kinds === 'spitter,vatborn', `sector 4 is Vatborn + Spitter only (${rosters[4].kinds})`);
  check(rosters[5].ok && rosters[5].kinds === 'carapace', `sector 5 is Carapace only, besides the boss and tanks (${rosters[5].kinds})`);
  check(rosters[4].empty === 0 && rosters[5].empty === 0, 'every room past spawn still holds enemies');
  check(rosters[4].resp.includes('spitter') && rosters[5].resp.includes('carapace'), `the keycard alarm uses the sector's monsters (${rosters[4].resp} | ${rosters[5].resp})`);

  // a quiet Biofoundry arena with one test monster in it
  await page.click('#start-btn');
  await sleep(800);
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.levelIndex = 4; g.buildLevel(); g.state = 'playing'; g.input.locked = true;
    g.hud.clearHint?.();
    window.__solo = (kind, dx, dz, pdx, pdz) => {
      for (const e of g.enemies.list) if (!e.__test) { e.update = () => {}; e.mesh.visible = false; e.pos.set(2, 30, 2); e.dormant = true; }
      const a = g.level.rooms.find((r) => r.kind === 'arena');
      const cx = a.cx + 0.5, cz = a.cz + 0.5;
      // the arena's middle: its axes are kept clear (charge lanes)
      g.player.pos.set(cx + pdx, 1.9, cz + pdz); g.player.vel.set(0, 0, 0);
      g.player.health = 100; g.player.armor = 0; g.player.dead = false; g.player.buffs.shield = 0;
      const before = g.enemies.list.length;
      g.enemies.spawnFromSpecs([{ kind, x: cx + dx, z: cz + dz, roomId: a.id }], g.level.rooms, g);
      const e = g.enemies.list[before];
      e.__test = true;
      return e;
    };
    window.__clear = () => { for (const e of g.enemies.list) if (e.__test && e.alive) { e.hp = 0; e.update = () => {}; e.mesh.visible = false; e.pos.set(2, 30, 2); } };
    window.__hold = (e, ox, oz) => { g.player.pos.set(e.pos.x + ox, g.player.pos.y, e.pos.z + oz); g.player.vel.set(0, 0, 0); };
  });

  // 2. Spitter: mark, lob, patch
  const spit = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const e = window.__solo('spitter', 0, 0, 0, 7);
    e.wake(g);
    let markSeen = false, glob = -1, patchAt = -1, patchEnd = -1, hits = [], hp = 100;
    const t0 = performance.now();
    while (performance.now() - t0 < 6500) {
      const t = (performance.now() - t0) / 1000;
      window.__hold(e, 0, 7);
      const mark = e.worldFx.getObjectByName('landing-mark');
      if (e.state === 'attack' && e.phase === 'prep' && mark.visible) markSeen = true;
      if (g.player.health < hp) hits.push({ t: +t.toFixed(2), d: hp - g.player.health });
      hp = g.player.health;
      if (e.bio.patchLive && patchAt < 0) patchAt = t;
      if (patchAt >= 0 && !e.bio.patchLive && patchEnd < 0) patchEnd = t;
      await new Promise((r) => setTimeout(r, 16));
    }
    return { markSeen, hits, patchAt, life: patchEnd - patchAt };
  });
  check(spit.markSeen, 'the Spitter marks its landing spot on the floor while it aims');
  check(spit.hits.length >= 1 && spit.hits[0].d === 10, `its glob lands for 10 (${spit.hits.map((h) => h.d).join(', ')})`);
  check(spit.patchAt > 0, 'an acid patch is left where it landed');
  const stings = spit.hits.slice(1).filter((h) => h.t > spit.patchAt && h.t < spit.patchAt + 3.1);
  check(stings.length >= 3 && stings.every((h) => h.d === 3), `the patch stings for 3 every half second while you stand in it (${stings.map((h) => h.d).join(', ')})`);
  check(spit.life > 2.6 && spit.life < 3.5, `then it dries up (${spit.life.toFixed(2)} s)`);
  const dodge = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    await new Promise((r) => setTimeout(r, 3500)); // the last patch is gone
    const e = window.__solo('spitter', 0, 0, 0, 7);
    e.wake(g);
    const t0 = performance.now();
    while (performance.now() - t0 < 6000 && !(e.state === 'attack' && e.phase === 'prep' && e.phaseT > 0.75)) {
      window.__hold(e, 0, 7); await new Promise((r) => setTimeout(r, 10));
    }
    const locked = e.phase === 'prep' && e.phaseT > 0.75;
    window.__hold(e, 2.2, 7);
    const hp = g.player.health;
    await new Promise((r) => setTimeout(r, 1400));
    return { locked, dmg: hp - g.player.health };
  });
  check(dodge.locked && dodge.dmg === 0, `stepping off the mark after the lock beats the glob (took ${dodge.dmg})`);
  const cap = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    const a = g.level.rooms.find((r) => r.kind === 'arena');
    // four Spitters dropping patches near the player: never more than three on the floor
    const es = [];
    for (let i = 0; i < 4; i++) {
      const e = window.__solo('spitter', -3 + i * 2, -1, 0, 6);
      e.wake(g); es.push(e);
    }
    let most = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 7000) {
      g.player.health = 100; g.player.pos.set(a.cx + 0.5 + Math.sin((performance.now() - t0) / 400) * 2, g.player.pos.y, a.cz + 6.5);
      most = Math.max(most, es.filter((e) => e.bio.patchLive).length);
      await new Promise((r) => setTimeout(r, 30));
    }
    return { most };
  });
  check(cap.most >= 1 && cap.most <= 3, `at most three acid patches at once (${cap.most})`);

  // 3. Carapace: positional armour, the spike fan, the bared core
  const cara = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    window.__clear();
    await new Promise((r) => setTimeout(r, 3200));
    const e = window.__solo('carapace', 0, 0, 0, 6);
    e.bio.face = Math.PI; e.mesh.rotation.y = Math.PI; // facing +z, toward the player
    e.hp = 1000;
    // shots travel along the direction given: -z = into its front, +z = into its back
    const h0 = e.hp; e.damage(40, 0, -1, g); const front = h0 - e.hp;
    const h1 = e.hp; e.damage(40, 0, 1, g); const back = h1 - e.hp;
    e.vel.set(0, 0, 0); e.state = 'chase';
    e.wake(g);
    let spikes = 0, hits = [], hp = 100, painMid = false, coreDmg = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      window.__hold(e, 0, 6);
      spikes = Math.max(spikes, g.projectiles.liveList().filter((p) => p[0] === 5).length);
      if (g.player.health < hp) hits.push(hp - g.player.health);
      hp = g.player.health;
      if (e.state === 'attack' && e.phase === 'prep' && !painMid) painMid = e.bio.painAllowed();
      if (e.coreOpen && coreDmg === 0) {
        const h2 = e.hp; e.lastHitCore = true; e.damage(40, 0, -1, g); coreDmg = h2 - e.hp;
      }
      await new Promise((r) => setTimeout(r, 16));
    }
    return { front, back, spikes, hits, painMid, coreDmg, armor: g.player.armor, shield: g.player.buffs.shield, hpEnd: g.player.health, d: +Math.hypot(g.player.pos.x - e.pos.x, g.player.pos.z - e.pos.z).toFixed(2) };
  });
  check(cara.front === 10 && cara.back === 40, `the Carapace's plates take a quarter from the front, its back full (${cara.front} | ${cara.back} of 40)`);
  check(cara.spikes === 3, `it throws three spikes in a fan (${cara.spikes} in the air)`);
  check(cara.hits.length >= 1 && cara.hits.every((d) => d === 8), `each spike hits for 8 (${cara.hits.join(', ')}; armor ${cara.armor}, shield ${cara.shield}, hp ${cara.hpEnd}, dist ${cara.d})`);
  check(cara.coreDmg === 80, `the bared core takes double (${cara.coreDmg} of 40)`);
  check(!cara.painMid, 'no flinch while it loads the fan');

  // 4. Vatborn + the boss's adds
  const vat = await page.evaluate(() => {
    const g = window.__voxelstrike;
    window.__clear();
    const e = window.__solo('vatborn', 0, 0, 0, 8);
    const hp = e.hp; window.__clear();
    return { hp };
  });
  check(vat.hp === 95, `the Vatborn is the spec's 95 hp (${vat.hp})`);
  const boss = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.levelIndex = 5; g.buildLevel(); g.state = 'playing'; g.input.locked = true;
    const b = g.bossEnemy;
    if (!b) return { boss: false };
    b.hp = 99999; b.maxHp = 99999;
    g.player.health = 99999;
    // stand in its chamber, out of the acid's way
    const a = g.level.rooms.find((r) => r.id === g.level.boss.roomId);
    g.player.pos.set(a.cx + 0.5, 1.9, a.cz + 0.5);
    const kinds = new Set();
    let mostAlive = 0, total = 0;
    const t0 = performance.now();
    while (performance.now() - t0 < 26000) {
      g.player.health = 99999;
      const adds = b.boss?.summons ?? [];
      for (const s of adds) kinds.add(s.kind);
      mostAlive = Math.max(mostAlive, adds.filter((s) => s.alive).length);
      total = b.boss?.releasedTotal ?? 0;
      await new Promise((r) => setTimeout(r, 100));
    }
    return { boss: true, kinds: [...kinds].join(','), mostAlive, total };
  });
  check(boss.boss && boss.kinds === 'carapace', `the Broodkeeper's adds are Carapaces (${boss.kinds})`);
  check(boss.mostAlive >= 1 && boss.mostAlive <= 2 && boss.total <= 4, `at most two alive and four per attempt (${boss.mostAlive} alive, ${boss.total} released)`);

  // 5. rig budgets
  const boxes = await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.levelIndex = 4; g.buildLevel(); g.state = 'playing';
    const out = {};
    for (const kind of ['spitter', 'carapace']) {
      const e = window.__solo(kind, 0, 0, 0, 6);
      let n = 0; e.mesh.traverse((o) => { if (o.isMesh) n++; });
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
console.log('BIO MONSTERS TEST PASSED');
