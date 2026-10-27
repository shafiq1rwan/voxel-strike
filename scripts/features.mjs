/**
 * Feature regression: the four "fun layer" mechanics —
 *  1. Ticker suicide crawler: arms near the player and self-destructs;
 *     a ticker shot at range still explodes where it died (corpse chain).
 *  2. Key-pickup ambush: grabbing the red keycard spawns awake reinforcements.
 *  3. Timed powerups: quad damage multiplies hitscan, overshield absorbs
 *     damage entirely, buff timers tick down.
 *  4. Score + combo: kills score points, a 2-kill chain shows a streak popup
 *     and a combo multiplier.
 * Usage: node scripts/features.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
mkdirSync('scripts/shots', { recursive: true });

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
fakePointerLock(browser); // keep the real OS cursor free

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
  // sector 1 is a short opener with no brute and no ticker nests: run the
  // gameplay sections in sector 2, which has the full roster
  const opener = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const rooms = g.level.rooms.length;
    const kinds = new Set(g.enemies.list.map((e) => e.kind));
    const shotgunAtSpawn = g.level.pickups.some((p) => p.kind === 'weaponShotgun' &&
      g.level.rooms.find((r) => r.kind === 'spawn' && p.x >= r.x && p.x < r.x + r.w && p.z >= r.z && p.z < r.z + r.d));
    g.levelIndex = 2;
    g.buildLevel();
    g.state = 'playing';
    g.input.locked = true;
    // sector 2 plays as in 0.3.4 (a gentler one was tried and reverted)
    const tickers = g.level.enemies.filter((e) => e.kind === 'ticker');
    const perRoom = {};
    for (const t of tickers) perRoom[t.roomId] = (perRoom[t.roomId] ?? 0) + 1;
    const occupied = new Set(g.level.enemies.map((e) => e.roomId));
    const quiet = g.level.rooms.filter((r) => r.kind === 'normal' && !occupied.has(r.id)).length;
    const s2 = { rooms: g.level.rooms.length, quiet, enemies: g.level.enemies.length, tickers: tickers.length, maxPack: Math.max(0, ...Object.values(perRoom)) };
    // the exit pad is the threshold of an exit door in the back wall
    const sign = g.level.exitSign, pad = g.level.exitPad;
    s2.gate = !!sign && !!pad && sign.y === pad.y &&
      (sign.face === 'zmin' || sign.face === 'zmax' ? sign.x === pad.x && Math.abs(sign.z - pad.z) === 1 : sign.z === pad.z && Math.abs(sign.x - pad.x) === 1);
    s2.gateFace = sign?.face;
    s2.kinds = [...new Set(g.level.enemies.map((e) => e.kind))].sort().join();
    // sector 2's own pair is Clamp Guard + Arc Sentinel (reference/sector-monsters-v2;
    // facility-monsters.mjs tests them). The sections below test generic mechanics
    // — the ticker chain, quad, combos, the brute's charge — so add those monsters
    // here, spread over the normal rooms, with a brute in the arena
    const normals = g.level.rooms.filter((r) => r.kind === 'normal');
    const arena = g.level.rooms.find((r) => r.kind === 'arena');
    const extra = [];
    normals.slice(0, 7).forEach((r, i) => extra.push({ kind: 'husk', x: r.cx + 0.5, z: r.cz + 0.5, roomId: r.id }, ...(i < 2 ? [{ kind: 'ticker', x: r.cx + 1.5, z: r.cz + 0.5, roomId: r.id }] : [])));
    if (arena) extra.push({ kind: 'brute', x: arena.cx + 0.5, z: arena.cz + 2.5, roomId: arena.id });
    g.enemies.spawnFromSpecs(extra, g.level.rooms, g);
    g.level.totalEnemies += extra.length;
    return { rooms, brute: kinds.has('brute'), ticker: kinds.has('ticker'), shotgunAtSpawn, s2 };
  });
  check(opener.rooms <= 7 && !opener.brute && !opener.ticker && opener.shotgunAtSpawn,
    `sector 1 is a short opener: ${opener.rooms} rooms, no brute, no tickers, shotgun in the spawn room`);
  check(opener.s2.gate, `the exit pad sits against the back wall under the EXIT sign (${opener.s2.gateFace} wall)`);
  check(opener.s2.rooms >= 11 && opener.s2.rooms <= 13 && opener.s2.quiet === 0 && opener.s2.enemies >= 20 && opener.s2.kinds === 'clampGuard,sentinel',
    `sector 2 plays as in 0.3.4 with its own pair: ${opener.s2.rooms} rooms (11–13), every room past spawn holds enemies (${opener.s2.quiet} empty), ${opener.s2.enemies} enemies (${opener.s2.kinds})`);
  await new Promise((r) => setTimeout(r, 300));

  // --- 1a. ticker charges the player and self-destructs -----------------------
  const suicide = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const t = g.enemies.list.find((q) => q.alive && q.kind === 'ticker');
    if (!t) return { found: false };
    // park everything else far away so only the ticker acts
    for (const o of g.enemies.list) {
      if (o !== t && o.alive) { o.pos.set(4, o.pos.y, 4); o.awake = false; o.state = 'idle'; }
    }
    g.player.health = 200;
    g.player.dead = false;
    // drop the ticker 3 units from the player on open ground
    t.pos.set(g.player.pos.x + 3, g.player.pos.y, g.player.pos.z);
    t.vel.set(0, 0, 0);
    t.wake(g);
    await new Promise((r) => setTimeout(r, 2600));
    return { found: true, dead: !t.alive, hp: g.player.health };
  });
  check(suicide.found, 'a ticker exists in the level');
  if (suicide.found) {
    check(suicide.dead, 'ticker armed and self-destructed');
    check(suicide.hp < 200, `ticker explosion hurt the player (hp=${suicide.hp})`);
  }

  // --- 1b. a sniped ticker explodes where it died (corpse chain) --------------
  const chain = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    // sector 2 meets lone tickers (often just one, spent in 1a): bring in another
    if (!g.enemies.list.some((q) => q.alive && q.kind === 'ticker')) {
      const r = g.level.rooms.find((q) => q.kind === 'spawn');
      g.enemies.spawnFromSpecs([{ kind: 'ticker', x: r.cx + 0.5, z: r.cz + 0.5, roomId: r.id }], g.level.rooms, g);
    }
    const t = g.enemies.list.find((q) => q.alive && q.kind === 'ticker');
    const h = g.enemies.list.find((q) => q.alive && q.kind === 'husk');
    if (!t || !h) return { found: false };
    g.player.health = 200;
    g.player.dead = false;
    // find two adjacent OPEN cells near the player (a blind teleport can land
    // inside rock, where the explosion has no line of sight to the husk)
    const open = (x, z) => g.world.get(Math.floor(x), 1, Math.floor(z)) === 0 &&
      g.world.get(Math.floor(x), 2, Math.floor(z)) === 0;
    let tx = null, tz = null, hx2 = null, hz2 = null;
    for (const [dx, dz] of [[3, 0], [-3, 0], [0, 3], [0, -3], [2, 2], [-2, -2]]) {
      const ax = g.player.pos.x + dx, az = g.player.pos.z + dz;
      const bx = ax + Math.sign(dx || 1), bz = az + Math.sign(dz);
      if (open(ax, az) && open(bx, bz)) { tx = ax; tz = az; hx2 = bx; hz2 = bz; break; }
    }
    if (tx === null) return { found: false };
    t.pos.set(tx, t.pos.y, tz);
    h.pos.set(hx2, h.pos.y, hz2);
    h.state = 'idle'; h.vel.set(0, 0, 0);
    const hpBefore = h.hp;
    t.damage(999, 0, 0, g);
    await new Promise((r) => setTimeout(r, 400));
    return { found: true, tickerDead: !t.alive, husk: h.hp, hpBefore };
  });
  check(chain.found, 'ticker + husk available for the chain test');
  if (chain.found) {
    check(chain.tickerDead, 'sniped ticker died');
    check(chain.husk < chain.hpBefore, `ticker corpse explosion splashed the husk (hp ${chain.hpBefore} -> ${chain.husk})`);
  }

  // --- 3+4. quad damage one-shots a husk; kills score with a combo ------------
  const scoring = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.player.health = 200;
    g.player.dead = false;
    // park every survivor of the earlier phases so nothing strays into the lane
    for (const o of g.enemies.list) {
      if (o.alive) { o.pos.set(4, o.pos.y, 4); o.awake = false; o.state = 'idle'; o.vel.set(0, 0, 0); }
    }
    const before = g.score;
    // collect a quad pickup through the real pickup path
    g.pickups.add(
      { kind: 'powerQuad', x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
      g.world
    );
    await new Promise((r) => setTimeout(r, 400));
    const quadUp = g.player.buffs.quad > 0;
    // stand a fresh husk 5 units down a verified-clear lane and shoot it once
    // with the pistol (14*4=56 > 45 hp)
    const h = g.enemies.list.find((q) => q.alive && q.kind === 'husk' && q.hp === 45);
    if (!h) return { quadUp, found: false };
    const openCell = (x, z) => g.world.get(Math.floor(x), 1, Math.floor(z)) === 0 &&
      g.world.get(Math.floor(x), 2, Math.floor(z)) === 0;
    // [dx, dz, yaw facing that way]
    const lanes = [[1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, Math.PI], [0, -1, 0]];
    let lane = null;
    for (const [dx, dz, yaw] of lanes) {
      let clear = true;
      for (let i = 1; i <= 5 && clear; i++) {
        if (!openCell(g.player.pos.x + dx * i, g.player.pos.z + dz * i)) clear = false;
      }
      if (clear) { lane = { dx, dz, yaw }; break; }
    }
    if (!lane) return { quadUp, found: false };
    h.wake = () => {};
    h.state = 'idle'; h.awake = false; h.vel.set(0, 0, 0);
    h.pos.set(g.player.pos.x + lane.dx * 5, g.player.pos.y, g.player.pos.z + lane.dz * 5);
    h.mesh.position.copy(h.pos);
    g.player.yaw = lane.yaw;
    g.player.pitch = 0;
    await new Promise((r) => setTimeout(r, 100));
    g.weapons.switchTo('pistol');
    g.input.pressFire();
    await new Promise((r) => setTimeout(r, 300));
    const oneShot = !h.alive;
    // second kill inside the combo window → streak popup + multiplier
    const h2 = g.enemies.list.find((q) => q.alive && q.kind === 'husk');
    if (h2) h2.damage(999, 0, 0, g);
    await new Promise((r) => setTimeout(r, 150));
    return {
      quadUp,
      found: true,
      oneShot,
      scoreGain: g.score - before,
      streak: document.querySelector('.streak') !== null,
      multShown: document.querySelector('#score-mult').textContent,
      buffChip: document.querySelector('#buffs .buff.quad') !== null,
    };
  });
  check(scoring.quadUp, 'quad powerup collected through the pickup path');
  check(scoring.buffChip, 'quad buff chip visible on the HUD');
  check(scoring.found && scoring.oneShot, 'quad pistol shot one-shots a husk (14 → 56 dmg)');
  check(scoring.scoreGain >= 300, `kills scored with combo (gained ${scoring.scoreGain})`);
  check(scoring.streak, 'kill streak popup appeared');
  check(scoring.multShown.includes('×'), `combo multiplier shown (${scoring.multShown})`);
  await page.screenshot({ path: 'scripts/shots/features-1-quad.png' });

  // --- 3b. overshield absorbs an explosion at point blank ---------------------
  const shield = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.player.health = 150;
    g.player.dead = false;
    g.player.buffs.shield = 10;
    g.explode(g.player.pos.x + 1, g.player.pos.y, g.player.pos.z, 70, 3.2);
    await new Promise((r) => setTimeout(r, 200));
    const hpShielded = g.player.health;
    g.player.buffs.shield = 0;
    g.explode(g.player.pos.x + 1, g.player.pos.y, g.player.pos.z, 70, 3.2);
    await new Promise((r) => setTimeout(r, 200));
    return { hpShielded, hpAfter: g.player.health };
  });
  check(shield.hpShielded === 150, `overshield absorbed the blast (hp=${shield.hpShielded})`);
  check(shield.hpAfter < 150, `same blast hurts without the shield (hp=${shield.hpAfter})`);

  // --- 3c. buff timers tick down ----------------------------------------------
  const tick = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.player.buffs.haste = 5;
    await new Promise((r) => setTimeout(r, 1000));
    return g.player.buffs.haste;
  });
  check(tick > 0 && tick < 4.7, `buff timer ticks down (haste 5 -> ${tick.toFixed(2)})`);

  // --- 2. key-pickup ambush ----------------------------------------------------
  const ambush = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.player.health = 200;
    g.player.dead = false;
    const countBefore = g.enemies.list.length;
    const totalBefore = g.level.totalEnemies;
    const key = g.level.pickups.find((p) => p.kind === 'keyRed');
    g.player.pos.set(key.x, key.y + 0.4, key.z);
    g.player.vel.set(0, 0, 0);
    await new Promise((r) => setTimeout(r, 700));
    const spawned = g.enemies.list.slice(countBefore);
    return {
      gotKey: g.player.keys.has('red'),
      spawnCount: spawned.length,
      allAwake: spawned.every((e) => e.awake),
      totalGrew: g.level.totalEnemies === totalBefore + spawned.length,
    };
  });
  check(ambush.gotKey, 'red keycard collected');
  check(ambush.spawnCount >= 3, `ambush spawned reinforcements (${ambush.spawnCount})`);
  check(ambush.allAwake, 'ambush spawns come in already hunting');
  check(ambush.totalGrew, 'kill-stat total includes ambush spawns');
  await page.screenshot({ path: 'scripts/shots/features-2-ambush.png' });

  // --- 6. arena hall: big room, arc caster prize, brute guard ---------------
  const arena = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const a = g.level.rooms.find((r) => r.kind === 'arena');
    if (!a) return { found: false };
    // clear a straight test lane through the arena center (stray crates or
    // barrels in the lane would eat shots meant for the chain targets)
    for (let x = a.cx - 7; x <= a.cx + 5; x++) {
      for (let y = 1; y <= 2; y++) {
        for (let dz = -1; dz <= 1; dz++) {
          if (g.world.get(x, y, a.cz + dz) !== 0) g.world.set(x, y, a.cz + dz, 0);
        }
      }
    }
    return {
      found: true, w: a.w, d: a.d,
      hasArc: g.level.pickups.some((p) => p.kind === 'weaponArc'),
      hasBrute: g.enemies.list.some((q) => q.kind === 'brute'),
    };
  });
  check(arena.found && arena.w >= 15, `arena hall generated (${arena.w}x${arena.d})`);
  check(arena.hasArc, 'arc caster placed in the arena');
  check(arena.hasBrute, 'a brute guards the arena');

  // --- 7. brute: telegraphed charge, trample, and guaranteed powerup drop ----
  const brute = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.input.locked = true;
    const b = g.enemies.list.find((q) => q.alive && q.kind === 'brute');
    if (!b) return { found: false };
    for (const o of g.enemies.list) {
      if (o !== b && o.alive) { o.pos.set(4, o.pos.y, 4); o.awake = false; o.state = 'idle'; o.vel.set(0, 0, 0); }
    }
    const a = g.level.rooms.find((r) => r.kind === 'arena');
    g.player.health = 400;
    g.player.dead = false;
    g.player.pos.set(a.cx + 0.5 - 6, 2.0, a.cz + 0.5);
    g.player.vel.set(0, 0, 0);
    // within its 6-unit charge (BEHAVIOURS.md): it runs out of steam past that
    b.pos.set(a.cx + 0.5 - 1.5, b.pos.y, a.cz + 0.5);
    b.mesh.position.copy(b.pos);
    b.vel.set(0, 0, 0);
    b.wake(g);
    // wait for the charge to trigger, then for it to land or slam out
    let charged = false;
    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (b.state === 'charge') { charged = true; break; }
    }
    let hurt = false, slammed = false;
    for (let i = 0; i < 30 && !(hurt || slammed); i++) {
      await new Promise((r) => setTimeout(r, 100));
      hurt = g.player.health < 400;
      slammed = b.state === 'pain';
    }
    // killing the pit boss must drop a powerup
    const powerCount = () => g.pickups.items.filter(
      (p) => !p.taken && p.spec.kind.startsWith('power')
    ).length;
    const dropsBefore = powerCount();
    b.damage(9999, 0, 0, g);
    await new Promise((r) => setTimeout(r, 200));
    return { found: true, charged, hurt, slammed, dead: !b.alive, dropped: powerCount() > dropsBefore };
  });
  check(brute.found, 'a live brute available for the charge test');
  if (brute.found) {
    check(brute.charged, 'brute launched a charge at the player');
    check(brute.hurt || brute.slammed, `charge resolved (trampled=${brute.hurt}, wall-slam stun=${brute.slammed})`);
    check(brute.dead && brute.dropped, 'dead brute dropped a powerup');
  }

  // --- 8. arc caster chains across a cluster --------------------------------
  const arc = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.input.locked = true;
    g.player.health = 200;
    g.player.dead = false;
    for (const o of g.enemies.list) {
      if (o.alive) { o.pos.set(4, o.pos.y, 4); o.awake = false; o.state = 'idle'; o.vel.set(0, 0, 0); o.wake = () => {}; }
    }
    const husks = g.enemies.list.filter((q) => q.alive && q.kind === 'husk').slice(0, 3);
    if (husks.length < 3) return { found: false };
    const a = g.level.rooms.find((r) => r.kind === 'arena');
    g.player.pos.set(a.cx + 0.5 - 6, 2.0, a.cz + 0.5);
    g.player.vel.set(0, 0, 0);
    g.player.pitch = 0;
    g.player.yaw = -Math.PI / 2; // face +x, down the cleared lane
    const spots = [[0, 0], [1.5, 1], [3, -1]];
    husks.forEach((h, i) => {
      h.pos.set(a.cx + 0.5 + spots[i][0], h.pos.y, a.cz + 0.5 + spots[i][1]);
      h.mesh.position.copy(h.pos);
    });
    g.weapons.give('arc');
    g.player.ammo.cells = 20;
    await new Promise((r) => setTimeout(r, 500)); // weapon raise animation
    const before = husks.map((h) => h.hp);
    g.input.pressFire();
    await new Promise((r) => setTimeout(r, 300));
    const hit = husks.filter((h, i) => h.hp < before[i]).length;
    return { found: true, hit, cells: g.player.ammo.cells };
  });
  check(arc.found, 'three husks available for the chain test');
  if (arc.found) {
    check(arc.cells < 20, `arc caster fired (cells ${arc.cells})`);
    check(arc.hit >= 2, `lightning chained across the cluster (${arc.hit}/3 hit)`);
  }
  await page.screenshot({ path: 'scripts/shots/features-3-arc.png' });

  // --- 9. headshots: top-slice hits deal double damage ------------------------
  const hs = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.input.locked = true;
    g.player.health = 200;
    g.player.dead = false;
    g.player.buffs.quad = 0; // measure base damage, not leftover quad
    for (const o of g.enemies.list) {
      if (o.alive) { o.pos.set(4, o.pos.y, 4); o.awake = false; o.state = 'idle'; o.vel.set(0, 0, 0); o.wake = () => {}; }
    }
    const h = g.enemies.list.find((q) => q.alive && q.kind === 'husk');
    if (!h) return { found: false };
    const a = g.level.rooms.find((r) => r.kind === 'arena');
    g.player.pos.set(a.cx + 0.5 - 5, 2.0, a.cz + 0.5);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = -Math.PI / 2; // face +x down the cleared lane
    g.player.pitch = 0;          // eye-level ray passes through the head zone
    h.pos.set(a.cx + 0.5, h.pos.y, a.cz + 0.5);
    h.mesh.position.copy(h.pos);
    h.hp = 100; // headroom to measure two hits
    g.weapons.switchTo('pistol');
    g.player.ammo.bullets = 50;
    await new Promise((r) => setTimeout(r, 300));
    const hp0 = h.hp;
    g.input.pressFire();
    await new Promise((r) => setTimeout(r, 350));
    const headDmg = hp0 - h.hp;
    // now aim at center mass, below the head zone (let the camera take the
    // new pitch for a few frames — the gun fires along the CAMERA direction)
    g.player.pitch = Math.atan2(h.pos.y - (g.player.pos.y + 0.62), 5);
    await new Promise((r) => setTimeout(r, 120));
    const hp1 = h.hp;
    g.input.pressFire();
    await new Promise((r) => setTimeout(r, 350));
    const bodyDmg = hp1 - h.hp;
    return { found: true, headDmg, bodyDmg };
  });
  check(hs.found, 'husk available for the headshot test');
  if (hs.found) {
    check(hs.headDmg === 28, `head-zone pistol shot dealt double damage (${hs.headDmg})`);
    check(hs.bodyDmg === 14, `body pistol shot dealt normal damage (${hs.bodyDmg})`);
  }

  // --- 10. automap: toggles, and reveal tracks what the player has seen -------
  const map = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const wrap = document.querySelector('#automap-wrap');
    const before = wrap.classList.contains('open');
    g.toggleMap();
    const after = wrap.classList.contains('open');
    let explored = 0;
    for (const v of g.automap.explored) if (v) explored++;
    g.toggleMap();
    const closed = !wrap.classList.contains('open');
    return { before, after, explored, closed };
  });
  check(!map.before && map.after && map.closed, 'automap toggles open and closed');
  check(map.explored > 50, `automap revealed seen cells (${map.explored})`);
  await page.evaluate(() => window.__voxelstrike.toggleMap());
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: 'scripts/shots/features-4-automap.png' });
  await page.evaluate(() => window.__voxelstrike.toggleMap());

  // --- 5. elevator carries a player who WALKS on (not a zero-velocity teleport)
  // Regression: the dynamic-box resolver used to eject a rider sideways when
  // the rising platform overlapped their feet while they carried any leftover
  // horizontal velocity — the lift went up alone and the campaign soft-locked.
  const approach = await page.evaluate(() => {
    const g = window.__voxelstrike;
    g.input.locked = true;
    for (const e of g.enemies.list) if (e.alive) e.damage(9999, 0, 0, g);
    g.player.health = 200;
    g.player.dead = false;
    const el = g.elevator;
    const ex = el.spec.x + 1, ez = el.spec.z + 1;
    // find an axis-aligned OPEN walking lane onto the platform. Prefer a lane
    // whose far side is the ledge wall: the walker can then hold W the whole
    // ride, pinned against the wall with live forward velocity — the exact
    // situation that used to eject riders sideways.
    const open = (x, z) => g.world.get(Math.floor(x), 1, Math.floor(z)) === 0 &&
      g.world.get(Math.floor(x), 2, Math.floor(z)) === 0;
    let dir = null;
    let walled = false;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!(open(ex + dx * 1.6, ez + dz * 1.6) && open(ex + dx * 2.6, ez + dz * 2.6) && open(ex + dx * 3.4, ez + dz * 3.4))) continue;
      const farBlocked = !open(ex - dx * 1.6, ez - dz * 1.6);
      if (!dir || (farBlocked && !walled)) {
        dir = [dx, dz];
        walled = farBlocked;
      }
    }
    if (!dir) return { ok: false };
    g.player.pos.set(ex + dir[0] * 3, 2.0, ez + dir[1] * 3);
    g.player.vel.set(0, 0, 0);
    g.player.pitch = 0;
    g.player.yaw = Math.atan2(-(ex - g.player.pos.x), -(ez - g.player.pos.z));
    return { ok: true, walled };
  });
  check(approach.ok, `walk-on: found an open lane to the platform (walled=${approach.walled})`);
  // walk forward until actually standing on the platform (not just near it)
  await page.keyboard.down('KeyW');
  for (let i = 0; i < 15; i++) {
    await new Promise((r) => setTimeout(r, 80));
    const aboard = await page.evaluate(() => {
      const g = window.__voxelstrike;
      const el = g.elevator;
      return g.player.pos.x > el.spec.x + 0.25 && g.player.pos.x < el.spec.x + 1.75 &&
        g.player.pos.z > el.spec.z + 0.25 && g.player.pos.z < el.spec.z + 1.75;
    });
    if (aboard) break;
  }
  if (approach.walled) {
    // keep pushing into the ledge wall for the entire ride — hardest case
  } else {
    // open floor beyond the platform: stop on it like a player would
    await page.keyboard.up('KeyW');
    await page.evaluate(() => {
      const g = window.__voxelstrike;
      const el = g.elevator;
      g.player.pos.set(el.spec.x + 1, g.player.pos.y, el.spec.z + 1);
    });
  }
  await new Promise((r) => setTimeout(r, 2600)); // 0.4s trigger + ~1.4s ride + margin
  await page.keyboard.up('KeyW');
  const ride = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return { topY: g.elevator.topY, playerY: g.player.pos.y };
  });
  check(ride.topY >= 3.9, `walk-on: elevator rose (topY=${ride.topY.toFixed(2)})`);
  check(ride.playerY > 4.3, `walk-on: rider carried to the top (y=${ride.playerY.toFixed(2)})`);

  // --- 15. lift: a player waiting below calls it straight back, a strafing
  // rider stays aboard, and the ledge rail guards the drop. Before: the open
  // deck lost riders to a sideways nudge, then they waited ~6s for it to
  // finish the climb empty and dwell at the top.
  const callDown = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const el = g.elevator;
    // test 5's rider keeps walking at the top, straight onto the exit pad:
    // the sector is won and the world is frozen behind the intermission
    // screen. Pull the run back into play (as checkpoint.mjs does) so the
    // lift updates again.
    if (g.state !== 'playing') {
      g.state = 'playing';
      g.hud.hideScreen();
      g.input.locked = true;
    }
    for (const e of g.enemies.list) if (e.alive) e.damage(9999, 0, 0, g);
    // a floor cell beside the lift (walking space at y=1,2 over solid floor)
    const open = (x, z) => g.world.get(x, 1, z) === 0 && g.world.get(x, 2, z) === 0 && g.world.isSolid(x, 0, z);
    let cell = null;
    for (let d = 1; d <= 3 && !cell; d++) {
      for (const [dx, dz] of [[d, 0], [-d, 0], [0, d], [0, -d]]) {
        const x = el.spec.x + 1 + dx * 2, z = el.spec.z + 1 + dz * 2;
        if (open(Math.floor(x), Math.floor(z))) { cell = { x: Math.floor(x) + 0.5, z: Math.floor(z) + 0.5 }; break; }
      }
    }
    if (!cell) return { ok: false };
    // the lift is still at the top from the walk-on ride: step down beside it
    g.player.pos.set(cell.x, 1.9, cell.z);
    g.player.vel.set(0, 0, 0);
    const t0 = performance.now();
    while (performance.now() - t0 < 2500 && el.topY > el.spec.lowY + 0.01) await new Promise((r) => setTimeout(r, 50));
    return { ok: true, ms: Math.round(performance.now() - t0), topY: el.topY, lowY: el.spec.lowY };
  });
  check(callDown.ok && callDown.topY <= callDown.lowY + 0.01 && callDown.ms < 2500,
    `lift: a player waiting below calls it back in ${callDown.ms}ms (topY=${callDown.topY?.toFixed(2)})`);
  const strafe = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const el = g.elevator;
    g.player.pos.set(el.spec.x + 1, el.topY + 0.95, el.spec.z + 1);
    g.player.vel.set(0, 0, 0);
    g.player.pitch = 0;
    // face along the boarding axis so A strafes toward an open side
    g.player.yaw = el.spec.walkAxis === 'z' ? Math.PI : -Math.PI / 2;
    const t0 = performance.now();
    while (performance.now() - t0 < 1500 && el.topY < el.spec.lowY + 0.02) await new Promise((r) => setTimeout(r, 30));
    return { moving: el.topY > el.spec.lowY, walkAxis: el.spec.walkAxis };
  });
  check(strafe.moving, `lift: leaves the bottom with a rider aboard (walkAxis=${strafe.walkAxis})`);
  // strafe for the whole ride and a beat after arrival (the side hold lasts
  // 0.4s at the top so a drifting thumb doesn't walk straight off the edge)
  await page.keyboard.down('KeyA');
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const up = await page.evaluate(() => window.__voxelstrike.elevator.topY >= window.__voxelstrike.elevator.spec.highY - 0.01);
    if (up) break;
  }
  await new Promise((r) => setTimeout(r, 250));
  await page.keyboard.up('KeyA');
  const held = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const el = g.elevator;
    const rail = (() => {
      const room = g.level.rooms.find((r) => r.kind === 'exit');
      let n = 0;
      for (let x = room.x; x < room.x + room.w; x++) {
        for (let z = room.z; z < room.z + room.d; z++) if (g.world.get(x, 4, z) === 31) n++; // PowerBarrier under the railing
      }
      return n;
    })();
    return {
      topY: el.topY, y: g.player.pos.y,
      dx: Math.abs(g.player.pos.x - (el.spec.x + 1)), dz: Math.abs(g.player.pos.z - (el.spec.z + 1)),
      rail,
    };
  });
  check(held.topY >= 3.9 && held.y > 4.3 && held.dx < 1 && held.dz < 1,
    `lift: strafing rider held on the deck to the top (y=${held.y.toFixed(2)}, off-center ${held.dx.toFixed(2)}/${held.dz.toFixed(2)})`);
  check(held.rail >= 2, `lift: the railing guards the ledge edge (${held.rail} barrier blocks at y=4)`);

  // --- 11. walking into a half-open door never launches the player ------------
  // Regression: with the door's bottom edge just below head height, Y was the
  // least-penetrated axis and the old resolver picked the push side from the
  // (gravity, negative) Y velocity — teleporting the player onto the door's top,
  // inside the wall above the doorway, then up out of the map as it rose.
  // It needs SPEED: the frame's horizontal step into the door must exceed the
  // tiny vertical overlap, so each probe takes a run-up from 1.6u back.
  // Freeze each door at bottom-edge heights sweeping just under head height.
  const doorProbe = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    g.input.locked = true;
    g.state = 'playing';
    g.hud.hideScreen();
    let worst = { maxY: 0, door: -1, openT: 0, solid: false };
    let probes = 0;
    for (let i = 0; i < g.doors.length; i++) {
      const door = g.doors[i];
      const origUpdate = door.update;
      door.update = () => {}; // hold the door still at the probed height
      door.locked = null;
      for (const side of [-1, 1]) {
        for (let k = 0; k <= 10; k++) {
          // bottom edge sweeps 2.68 → 2.79, straddling head height (2.77)
          const openT = 0.6 + k * 0.004;
          door.openT = openT;
          door.mesh.position.y = 2.5 + openT * 2.8;
          const alongX = door.spec.dir === 'x';
          const nx = alongX ? side : 0;
          const nz = alongX ? 0 : side;
          const back = 1.6;
          g.player.health = 999;
          g.player.spawnAt(door.centerX() + nx * back, 1.89, door.centerZ() + nz * back);
          g.player.yaw = Math.atan2(nx, nz);
          g.player.pitch = 0;
          window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', key: 'w' }));
          let maxY = 0;
          for (let f = 0; f < 30; f++) {
            await new Promise((r) => requestAnimationFrame(r));
            maxY = Math.max(maxY, g.player.pos.y);
          }
          window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', key: 'w' }));
          const p = g.player.pos;
          const solid = g.world.isSolid(Math.floor(p.x), Math.floor(g.player.eyeY()), Math.floor(p.z));
          probes++;
          if (maxY > worst.maxY || solid) worst = { maxY, door: i, openT, solid: solid || worst.solid };
        }
      }
      door.update = origUpdate;
    }
    return { probes, worst };
  });
  check(
    doorProbe.worst.maxY < 2.6 && !doorProbe.worst.solid,
    `door: ${doorProbe.probes} half-open-door pushes never lift/embed the player (worst y=${doorProbe.worst.maxY.toFixed(2)} at door ${doorProbe.worst.door}, openT ${doorProbe.worst.openT})`
  );

  // --- 12. touch: the map closes with a tap anywhere (and the tap doesn't look)
  // Regression: the overlay let taps fall through to the look zone and the
  // only close target was the small MAP button dimmed underneath it.
  {
    const mob = await browser.newPage();
    mob.on('pageerror', (err) => errors.push(`[mobile pageerror] ${err.message}`));
    await mob.setViewport({ width: 850, height: 400, hasTouch: true, isMobile: true });
    await mob.evaluateOnNewDocument(() => localStorage.setItem('voxelstrike-tutorial-done', '1'));
    await mob.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await mob.waitForSelector('#title-screen');
    await mob.tap('#start-btn');
    await new Promise((r) => setTimeout(r, 600));
    const isOpen = () => mob.evaluate(() => window.__voxelstrike.automap.visible);
    const yaw = () => mob.evaluate(() => window.__voxelstrike.player.yaw);

    await mob.tap('#tmap');
    await new Promise((r) => setTimeout(r, 200));
    const touchUi = await mob.evaluate(() => ({
      close: getComputedStyle(document.querySelector('#automap-close')).display !== 'none',
      hint: document.querySelector('#automap-hint .touch').offsetParent !== null,
    }));
    check((await isOpen()) && touchUi.close && touchUi.hint, 'touch map: MAP opens it, with a CLOSE button + "tap anywhere" hint');
    await mob.screenshot({ path: 'scripts/shots/features-touch-map.png' });
    const yaw0 = await yaw();
    await mob.touchscreen.tap(780, 330); // over the look zone, off the map canvas
    await new Promise((r) => setTimeout(r, 200));
    check(!(await isOpen()), 'touch map: a tap anywhere on the overlay closes it');
    check(Math.abs((await yaw()) - yaw0) < 1e-6, 'touch map: the closing tap does not turn the camera');

    await mob.tap('#tmap');
    await new Promise((r) => setTimeout(r, 150));
    await mob.tap('#automap-close');
    await new Promise((r) => setTimeout(r, 150));
    check(!(await isOpen()), 'touch map: the CLOSE MAP button closes it');

    await mob.tap('#tmap');
    await new Promise((r) => setTimeout(r, 150));
    await mob.evaluate(() => window.__voxelstrike.requestPause());
    await new Promise((r) => setTimeout(r, 150));
    check(!(await isOpen()), 'map closes itself when the game pauses');

    // --- 13. touch weapon button: tap / swipe / hold-wheel, owned-only slots,
    // auto-switch on empty. (Switching via tiny top-of-screen slots was hard.)
    await mob.evaluate(() => {
      const g = window.__voxelstrike;
      g.resumeGame();
      for (const o of g.enemies.list) { o.pos.x = 2; o.pos.z = 2; o.awake = false; }
      g.weapons.give('shotgun');
      g.weapons.give('smg');
      Object.assign(g.player.ammo, { bullets: 100, shells: 20 });
    });
    await new Promise((r) => setTimeout(r, 900));
    const cur = () => mob.evaluate(() => window.__voxelstrike.weapons.current);
    const settle = () => new Promise((r) => setTimeout(r, 500));
    const btn = await mob.evaluate(() => {
      const r = document.querySelector('#tweapon').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    check((await cur()) === 'smg', `weapon button: setup holds the SMG (${await cur()})`);

    await mob.touchscreen.tap(btn.x, btn.y);
    await settle();
    const label = await mob.evaluate(() => document.querySelector('#tweapon-num').textContent);
    check((await cur()) === 'pistol' && label === '1', `weapon button: tap cycles to the next owned weapon, wrapping (${await cur()}, label ${label})`);

    await mob.touchscreen.touchStart(btn.x, btn.y);
    await mob.touchscreen.touchMove(btn.x - 45, btn.y);
    await mob.touchscreen.touchEnd();
    await settle();
    check((await cur()) === 'smg', `weapon button: swipe left goes to the previous weapon (${await cur()})`);

    await mob.touchscreen.touchStart(btn.x, btn.y);
    await new Promise((r) => setTimeout(r, 450));
    const wheel = await mob.evaluate(() => ({
      open: document.querySelector('#twheel').classList.contains('open'),
      items: [...document.querySelectorAll('.twheel-item')].map((el) => {
        const r = el.getBoundingClientRect();
        return { label: el.firstChild.textContent, x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }),
    }));
    check(wheel.open && wheel.items.length === 3, `weapon wheel: hold opens it with the 3 owned weapons (${wheel.items.length})`);
    const target = wheel.items.find((it) => it.label === '2');
    await mob.touchscreen.touchMove(target.x, target.y);
    await mob.screenshot({ path: 'scripts/shots/features-touch-wheel.png' });
    await mob.touchscreen.touchEnd();
    await settle();
    const closed = await mob.evaluate(() => !document.querySelector('#twheel').classList.contains('open'));
    check((await cur()) === 'shotgun' && closed, `weapon wheel: slide onto slot 2 + release picks the shotgun (${await cur()})`);

    await mob.touchscreen.touchStart(btn.x, btn.y);
    await new Promise((r) => setTimeout(r, 450));
    await mob.touchscreen.touchEnd();
    await settle();
    check((await cur()) === 'shotgun', 'weapon wheel: releasing on the button cancels');

    const slots = await mob.evaluate(() =>
      [...document.querySelectorAll('#slots .slot')].filter((s) => getComputedStyle(s).display !== 'none').length);
    check(slots === 3, `touch slot bar shows only owned weapons (${slots})`);

    await mob.evaluate(() => {
      const g = window.__voxelstrike;
      g.player.ammo.shells = 0;
      g.input.touchState.fire = true;
      g.input.pressFire();
    });
    await new Promise((r) => setTimeout(r, 250));
    await mob.evaluate(() => { window.__voxelstrike.input.touchState.fire = false; });
    await settle();
    check((await cur()) === 'smg', `touch: firing an empty shotgun auto-switches to a loaded weapon (${await cur()})`);
    await mob.close();
  }

  // --- 14. phone landscape: settings fit and Back works
  // Regression: on a ~375px-tall phone the settings list overflowed with no
  // scroll, pushing the Back button off-screen — players were stuck in it.
  {
    const ph = await browser.newPage();
    ph.on('pageerror', (err) => errors.push(`[phone pageerror] ${err.message}`));
    await ph.setViewport({ width: 667, height: 375, hasTouch: true, isMobile: true });
    await ph.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    // a returning player who hasn't reached the Biofoundry: the busiest title there is
    await ph.evaluate(() => { localStorage.setItem('voxelstrike-tutorial-done', '1'); localStorage.removeItem('voxelstrike-geothermal-seen'); });
    await ph.reload({ waitUntil: 'networkidle0' });
    await ph.waitForSelector('#title-settings-btn');
    const phoneTitle = await ph.evaluate(() => {
      const b = document.querySelector('#new-sector')?.getBoundingClientRect();
      const start = document.querySelector('#start-btn')?.getBoundingClientRect();
      const scr = document.querySelector('#title-screen');
      return {
        banner: !!b, inside: !!b && b.left >= 0 && b.right <= innerWidth,
        noHScroll: document.documentElement.scrollWidth <= innerWidth,
        startOnScreen: !!start && start.top >= 0 && start.bottom <= innerHeight,
        // a returning player already knows the goal: no step tiles or controls
        // line, and the whole screen fits without scrolling
        steps: !!document.querySelector('#title-steps'),
        controls: !!document.querySelector('.title-controls'),
        overflow: scr.scrollHeight - scr.clientHeight,
      };
    });
    check(!phoneTitle.steps && !phoneTitle.controls && phoneTitle.overflow <= 0,
      `phone title, returning player: no step tiles or controls line, nothing to scroll (overflow ${phoneTitle.overflow}px)`);
    await ph.screenshot({ path: 'scripts/shots/features-phone-title-banner.png' });
    check(phoneTitle.banner && phoneTitle.inside && phoneTitle.noHScroll,
      'phone title: the NEW SECTOR banner fits the width, no sideways scroll');
    check(phoneTitle.startOnScreen, 'phone title: the start button is still on screen with the banner');
    await ph.tap('#title-settings-btn');
    await ph.waitForSelector('#settings-back');
    await new Promise((r) => setTimeout(r, 300));
    const fit = await ph.evaluate(() => {
      const scr = document.querySelector('#settings-screen');
      const r = document.querySelector('#settings-back').getBoundingClientRect();
      return { overflow: scr.scrollHeight - scr.clientHeight, top: r.top, bottom: r.bottom, vh: innerHeight };
    });
    await ph.screenshot({ path: 'scripts/shots/features-phone-settings.png' });
    check(fit.overflow <= 0 && fit.top >= 0 && fit.bottom <= fit.vh,
      `phone settings: everything fits, Back on screen (overflow ${fit.overflow}px, Back bottom ${Math.round(fit.bottom)}/${fit.vh})`);
    await ph.tap('#settings-back');
    await new Promise((r) => setTimeout(r, 300));
    check(await ph.evaluate(() => !!document.querySelector('#title-screen') && !document.querySelector('#settings-screen')),
      'phone settings: tapping Back returns to the title');
    check(await ph.evaluate(() => window.__voxelstrike.settings.resolution === 320), 'touch devices default to 320-line pixelation');
    await ph.close();
  }

  // --- 17. run perks do what their cards say ---------------------------------
  {
    const pk = await browser.newPage();
    pk.on('pageerror', (err) => errors.push(`[perk pageerror] ${err.message}`));
    await pk.setViewport({ width: 1280, height: 720 });
    await pk.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await pk.waitForSelector('#start-btn');
    await pk.evaluate(() => document.querySelector('#start-btn').click());
    await new Promise((r) => setTimeout(r, 700));
    const perk = await pk.evaluate(async () => {
      const g = window.__voxelstrike;
      g.input.locked = true;
      for (const e of g.enemies.list) if (e.alive) { e.pos.set(4, e.pos.y, 4); e.awake = false; e.state = 'idle'; e.wake = () => {}; }
      const give = (id) => { g.perks.add(id); g.applyPerkStats(); };
      const out = {};
      out.blastBase = g.blastRadius(3.5);
      give('volatile');
      out.blastPerk = g.blastRadius(3.5);
      give('deepPockets');
      out.bulletsMax = g.player.ammoMax.bullets;
      give('vitality');
      out.maxHealth = g.player.maxHealth;
      give('secondWind');
      out.revives = g.revivesAllowed;
      // Momentum: a triple kill hastes
      give('momentum');
      g.player.buffs.haste = 0;
      const ensure = (kind, n) => { const r = g.level.rooms.find((q) => q.kind === 'normal') ?? g.level.rooms[0]; for (let i = g.enemies.list.filter((e) => e.alive && e.kind === kind).length; i < n; i++) g.enemies.spawnFromSpecs([{ kind, x: r.cx + 0.5 + (i % 2), z: r.cz + 0.5 + (i >> 1), roomId: r.id }], g.level.rooms, g); }; // sector 2's own pair is Clamp Guard + Arc Sentinel
      ensure('husk', 4);
      const husks = g.enemies.list.filter((e) => e.alive && e.kind === 'husk').slice(0, 3);
      for (const h of husks) h.damage(9999, 0, 0, g);
      out.haste = g.player.buffs.haste;
      // Headhunter: a headshot kill heals
      give('headhunter');
      g.player.health = 50;
      const h4 = g.enemies.list.find((e) => e.alive && e.kind === 'husk');
      if (h4) { h4.lastHitHead = true; g.onEnemyKilled(h4); }
      out.healed = g.player.health;
      // Self-Repair: armor rebuilds after 4 s without damage
      give('plating');
      g.player.armor = 0;
      g.player.sinceHurt = 5;
      await new Promise((r) => setTimeout(r, 1500));
      out.armor = g.player.armor;
      return out;
    });
    check(perk.blastPerk > perk.blastBase * 1.3, `Volatile widens blasts (${perk.blastBase} → ${perk.blastPerk.toFixed(2)})`);
    check(perk.bulletsMax === 360, `Deep Pockets raises ammo caps (bullets max ${perk.bulletsMax})`);
    check(perk.maxHealth === 125, `Vitality raises max health (${perk.maxHealth})`);
    check(perk.revives === 2, `Second Wind allows two revives per sector (${perk.revives})`);
    check(perk.haste > 2, `Momentum: a triple kill gives haste (${perk.haste.toFixed(2)} s)`);
    check(perk.healed === 58, `Headhunter: a headshot kill heals 8 (50 → ${perk.healed})`);
    check(perk.armor > 5 && perk.armor <= 50, `Self-Repair rebuilds armor when unhurt (0 → ${perk.armor})`);
    await pk.close();
  }

  // --- 18. the Broodkeeper: activation, cycle, armor/core, HP bar, defeat ------
  {
    const bp = await browser.newPage();
    bp.on('pageerror', (err) => errors.push(`[boss pageerror] ${err.message}`));
    await bp.setViewport({ width: 1280, height: 720 });
    await bp.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await bp.waitForSelector('#start-btn');
    await bp.evaluate(() => document.querySelector('#start-btn').click());
    await new Promise((r) => setTimeout(r, 700));
    const boss = await bp.evaluate(async () => {
      const g = window.__voxelstrike;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      g.levelIndex = 5; g.buildLevel(); g.state = 'playing'; g.input.locked = true; g.hud.hideScreen();
      g.player.health = 5000;
      const b = g.bossEnemy;
      if (!b) return { found: false };
      for (const e of g.enemies.list) if (e !== b && e.alive) { e.pos.set(2, e.pos.y, 2); e.awake = false; e.state = 'idle'; e.wake = () => {}; }
      const spec = g.level.boss;
      const out = { found: true };
      out.dormantOutside = !b.bossActive && document.querySelector('#bossbar').hidden;
      // walk into the chamber: 7 u in front of the cradle
      g.player.spawnAt(spec.x - Math.sin(spec.yaw) * 7, 1.95, spec.z - Math.cos(spec.yaw) * 7);
      await sleep(300);
      out.active = b.bossActive;
      out.bar = !document.querySelector('#bossbar').hidden;
      out.objective = document.querySelector('#obj-text')?.textContent;
      // one full cycle: a volley, an opening, a release, a second opening
      const seen = new Set();
      let acid = 0;
      let barCore = false;
      const t0 = performance.now();
      while (performance.now() - t0 < 9000) {
        seen.add(b.boss.phase);
        acid = Math.max(acid, g.projectiles.liveList().filter((q) => q[0] === 2).length);
        if (b.coreOpen && document.querySelector('#bossbar').classList.contains('core')) barCore = true;
        await sleep(50);
      }
      out.phases = [...seen].sort().join(',');
      out.acid = acid;
      out.summons = b.boss.summons.length;
      out.barCore = barCore;
      // armor and the core
      b.coreOpen = false; let h = b.hp; b.damage(40, 0, 0, g); out.closed = h - b.hp;
      b.coreOpen = true; h = b.hp; b.lastHitCore = true; b.damage(40, 0, 0, g); out.core = h - b.hp;
      b.coreOpen = true; h = b.hp; b.lastHitCore = false; b.damage(40, 0, 0, g); out.body = h - b.hp;
      // quad damage counts double on the boss, not 4x
      g.player.buffs.quad = 10; b.coreOpen = true; h = b.hp; b.lastHitCore = true; b.damage(40, 0, 0, g); out.quadCore = h - b.hp;
      g.player.buffs.quad = 0;
      // below half health: it enrages, five fanned globs a volley
      b.hp = b.tuning.hp * 0.3;
      b.boss.phase = 'open2'; b.boss.t = 10;
      await sleep(150);
      out.shotsLow = b.boss.shots;
      out.enraged = !!b.boss.enraged;
      // defeat
      g.projectiles.spawn('acid', b.pos.x, 3, b.pos.z, 0, 0, -1, 2, false);
      b.coreOpen = true; b.lastHitCore = true; b.damage(99999, 0, 0, g);
      await sleep(300);
      out.dead = !b.alive;
      out.acidAfter = g.projectiles.liveList().filter((q) => q[0] === 2).length;
      out.barAfter = !document.querySelector('#bossbar').hidden;
      out.key = g.pickups.items.some((p) => !p.taken && p.spec.kind === 'keyRed');
      // the perk pool runs dry deep in endless: one-off rewards fill the offer
      for (const id of ['volatile', 'overcharge', 'headhunter', 'momentum', 'secondWind', 'deepPockets', 'plating', 'scavenger']) g.perks.add(id);
      return out;
    });
    check(boss.found, 'sector 5 spawns the Broodkeeper');
    if (boss.found) {
      check(boss.dormantOutside, 'it waits (no bar) until a player enters the chamber');
      check(boss.active && boss.bar && boss.objective === 'Kill the Broodkeeper', `entering wakes it: HP bar up, objective "${boss.objective}"`);
      check(boss.phases === 'open1,open2,release,volley', `it runs volley → open → release → open (${boss.phases})`);
      check(boss.acid >= 1 && boss.summons >= 1, `it fires acid (${boss.acid}) and releases Husks (${boss.summons})`);
      check(boss.barCore, 'the HP bar shows CORE EXPOSED while the core is open');
      check(boss.closed === 10 && boss.core === 80 && boss.body === 24,
        `closed armor takes 25% (${boss.closed} of 40), the open body 60% (${boss.body}), the open core 2× (${boss.core})`);
      check(boss.quadCore === 40, `quad damage counts double on the boss, not 4× (open core hit ${boss.quadCore} of 40, would be 320)`);
      check(boss.shotsLow === 5 && boss.enraged, `below half health it enrages: a volley is five globs (${boss.shotsLow})`);
      check(boss.dead && boss.acidAfter === 0 && !boss.barAfter && boss.key, 'defeat clears its acid, hides the bar and drops the red keycard');
    }
    const offer = await bp.evaluate(() => {
      const g = window.__voxelstrike;
      g.state = 'playing'; g.hud.hideScreen(); g.levelIndex = 6; g.win();
      const ids = [...document.querySelectorAll('.sc-perk')].map((c) => c.dataset.id);
      return { ids };
    });
    check(offer.ids.length === 3 && offer.ids.filter((i) => ['patchUp', 'resupply', 'reinforce'].includes(i)).length === 2,
      `with one perk left, the offer is that perk plus one-off rewards (${offer.ids.join(', ')})`);
    // building sector 5 marked the Biofoundry seen (and the clear may save a run): the title checks below need a fresh device
    await bp.evaluate(() => ['voxelstrike-geothermal-seen', 'voxelstrike-run', 'voxelstrike-best-depth'].forEach((k) => localStorage.removeItem(k)));
    await bp.close();
  }

  // --- 18b. the Broodkeeper dies to real gunfire (no direct damage() calls) ----
  {
    const kp = await browser.newPage();
    kp.on('pageerror', (err) => errors.push(`[boss-kill pageerror] ${err.message}`));
    await kp.setViewport({ width: 1280, height: 720 });
    await kp.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await kp.waitForSelector('#start-btn');
    await kp.click('#start-btn');
    await new Promise((r) => setTimeout(r, 900));
    await kp.evaluate(() => {
      const g = window.__voxelstrike;
      g.levelIndex = 5; g.buildLevel(); g.state = 'playing'; g.input.locked = true; g.hud.hideScreen();
      for (const e of g.enemies.list) if (e !== g.bossEnemy && e.alive) { e.update = () => {}; e.mesh.visible = false; e.pos.y = -50; }
      const s = g.level.boss;
      let placed = false;
      // stand 6 u in front of the cradle, aimed at the core; keep the player alive
      window.__hold = () => {
        const p = g.player;
        const fx = -Math.sin(s.yaw), fz = -Math.cos(s.yaw);
        if (!placed) { p.spawnAt(s.x + fx * 6, 1.95, s.z + fz * 6); placed = true; }
        p.pos.x = s.x + fx * 6; p.pos.z = s.z + fz * 6; p.vel.set(0, 0, 0);
        p.yaw = Math.atan2(p.pos.x - s.x, p.pos.z - s.z);
        const eye = p.eyeY ? p.eyeY() : p.pos.y + 0.6;
        p.pitch = Math.atan2(g.bossEnemy.pos.y + 0.1 - eye, 5.2);
        p.health = 1000;
      };
      window.__hold();
      g.weapons.restoreLoadout(['pistol', 'shotgun', 'smg', 'rocket', 'arc'], 'pistol');
    });
    const fire = async (ms, top) => {
      await kp.mouse.down();
      const t0 = Date.now();
      while (Date.now() - t0 < ms) {
        const alive = await kp.evaluate((top) => {
          const g = window.__voxelstrike;
          window.__hold();
          if (top) Object.assign(g.player.ammo, { bullets: 200, shells: 50, rockets: 20, cells: 100 });
          return g.bossEnemy.alive;
        }, top);
        if (!alive) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      await kp.mouse.up();
    };
    const hurt = [];
    for (const w of ['pistol', 'shotgun', 'smg', 'rocket', 'arc']) {
      await kp.evaluate((w) => window.__voxelstrike.weapons.switchTo(w), w);
      await new Promise((r) => setTimeout(r, 700));
      const before = await kp.evaluate(() => window.__voxelstrike.bossEnemy.hp);
      await fire(1200, true);
      await new Promise((r) => setTimeout(r, 500));
      const after = await kp.evaluate(() => window.__voxelstrike.bossEnemy.hp);
      if (after < before) hurt.push(w);
    }
    check(hurt.length === 5, `every weapon hurts the Broodkeeper (${hurt.join(', ')})`);
    // from full health, held Ripper fire through its real cycle (armor + openings)
    await kp.evaluate(() => { const g = window.__voxelstrike; g.bossEnemy.hp = g.bossEnemy.tuning.hp; g.weapons.switchTo('smg'); });
    await new Promise((r) => setTimeout(r, 600));
    // measured in GAME time: a slow headless frame rate clamps dt, so wall
    // time would overstate the fight
    const g0 = await kp.evaluate(() => window.__voxelstrike.time);
    await fire(120000, true);
    const secs = (await kp.evaluate(() => window.__voxelstrike.time)) - g0;
    const end = await kp.evaluate(() => {
      const g = window.__voxelstrike;
      return {
        alive: g.bossEnemy.alive,
        key: g.pickups.items.some((p) => !p.taken && p.spec.kind === 'keyRed'),
        bar: !document.querySelector('#bossbar').hidden,
        stage: document.querySelector('#obj-text')?.textContent,
      };
    });
    check(!end.alive, `real gunfire kills it from full health (${secs.toFixed(1)}s of held Ripper fire)`);
    // the fight is meant to last ~25–35 s of perfect held SMG fire at the core
    // (it was ~8 s: the 600 HP boss died inside its first opening)
    check(secs >= 20 && secs <= 50, `a perfect held-Ripper fight lasts a few cycles, not one opening (${secs.toFixed(1)}s, want 20–50)`);
    check(end.key && !end.bar && /keycard/i.test(end.stage ?? ''), `then the keycard drops, the bar hides, the objective moves on ("${end.stage}")`);
    await kp.evaluate(() => ['voxelstrike-geothermal-seen', 'voxelstrike-run', 'voxelstrike-best-depth'].forEach((k) => localStorage.removeItem(k)));
    await kp.close();
  }

  // --- 19. quick melee + the secret wall that tells you it's there --------------
  {
    const mp = await browser.newPage();
    mp.on('pageerror', (err) => errors.push(`[melee pageerror] ${err.message}`));
    await mp.setViewport({ width: 1280, height: 720 });
    await mp.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await mp.waitForSelector('#start-btn');
    await mp.click('#start-btn');
    await new Promise((r) => setTimeout(r, 900));
    // sector 2 has tickers; freeze every enemy so positions are ours to set
    await mp.evaluate(() => {
      const g = window.__voxelstrike;
      g.levelIndex = 2; g.buildLevel(); g.state = 'playing'; g.input.locked = true; g.hud.hideScreen();
      g.player.health = 1000;
      for (const e of g.enemies.list) { e.update = () => {}; e.pos.y = -50; }
      const r = g.level.rooms.find((q) => q.kind === 'spawn');
      window.__stand = () => { const p = g.player; p.pos.set(r.cx + 0.5, p.pos.y, r.cz + 0.5); p.vel.set(0, 0, 0); p.yaw = 0; p.pitch = 0; };
      g.player.spawnAt(r.cx + 0.5, 2.05, r.cz + 0.5);
      window.__stand();
      // put one enemy of `kind` d units straight ahead (yaw 0 = facing -z), same floor
      window.__place = (kind, d) => {
        let e = g.enemies.list.find((q) => q.kind === kind && q.alive && !q.__used);
        if (!e) {
          // sector 2's own pair is Clamp Guard + Arc Sentinel: bring in the generic
          // kind, homed in a far room (the out-of-world net returns a parked enemy there)
          const home = g.level.rooms.find((q) => q.kind === 'arena') ?? g.level.rooms.find((q) => q.kind === 'normal');
          g.enemies.spawnFromSpecs([{ kind, x: home.cx + 0.5, z: home.cz + 0.5, roomId: home.id }], g.level.rooms, g);
          e = g.enemies.list[g.enemies.list.length - 1];
          e.update = () => {};
        }
        e.__used = true;
        const p = g.player;
        e.pos.set(p.pos.x, p.pos.y - p.half.y + e.half.y + 0.01, p.pos.z - d);
        e.vel.set(0, 0, 0);
        e.state = 'idle';
        e.mesh.position.copy(e.pos);
        return g.enemies.list.indexOf(e);
      };
    });
    const bash = async () => {
      await mp.evaluate(() => window.__stand());
      await mp.keyboard.press('KeyV');
      await new Promise((r) => setTimeout(r, 300));
      return mp.evaluate(() => window.__voxelstrike.weapons.lastMelee);
    };
    const hp = (i) => mp.evaluate((i) => window.__voxelstrike.enemies.list[i].hp, i);
    const park = (i) => mp.evaluate((i) => { window.__voxelstrike.enemies.list[i].pos.y = -50; }, i);
    await new Promise((r) => setTimeout(r, 900)); // let the cooldown from the click settle

    const h1 = await mp.evaluate(() => window.__place('husk', 1.3));
    const before = await hp(h1);
    const res1 = await bash();
    const after = await hp(h1);
    const pushed = await mp.evaluate((i) => { const e = window.__voxelstrike.enemies.list[i]; return Math.hypot(e.vel.x, e.vel.z); }, h1);
    check(res1 === 'enemy' && Math.round(before - after) === 35 && pushed > 3,
      `V bashes a husk in front: 35 damage and a shove (${res1}, ${Math.round(before - after)}, push ${pushed.toFixed(1)})`);
    // the cooldown is real: an immediate second press does nothing
    await mp.evaluate(() => window.__voxelstrike.enemies.list.forEach((e) => { e.vel.set(0, 0, 0); }));
    await mp.evaluate((i) => { const g = window.__voxelstrike, e = g.enemies.list[i], p = g.player; e.pos.set(p.pos.x, e.pos.y, p.pos.z - 1.3); }, h1);
    const hpA = await hp(h1);
    await mp.keyboard.press('KeyV');
    await new Promise((r) => setTimeout(r, 200));
    check(await hp(h1) === hpA, 'a second press inside the 0.6 s cooldown lands nothing');
    await new Promise((r) => setTimeout(r, 500));
    // reading the telegraph pays: a staggered husk takes double
    await mp.evaluate((i) => { const e = window.__voxelstrike.enemies.list[i]; e.state = 'pain'; e.hp = 200; }, h1);
    const res2 = await bash();
    check(res2 === 'crit' && Math.round(200 - await hp(h1)) === 70, `a staggered enemy takes double (${res2}, ${Math.round(200 - await hp(h1))})`);
    // out of reach: a whiff
    await new Promise((r) => setTimeout(r, 450));
    await mp.evaluate((i) => { const g = window.__voxelstrike, e = g.enemies.list[i], p = g.player; e.state = 'idle'; e.pos.set(p.pos.x, e.pos.y, p.pos.z - 3); }, h1);
    const hpFar = await hp(h1);
    const res3 = await bash();
    check(res3 !== 'enemy' && res3 !== 'crit' && await hp(h1) === hpFar, `3 u away is out of reach (${res3})`);
    await park(h1);
    // bashing a ticker kills it, and its corpse still blows
    await new Promise((r) => setTimeout(r, 450));
    const tk = await mp.evaluate(() => window.__place('ticker', 1.2));
    const tres = await bash();
    const tick = await mp.evaluate((i) => { const g = window.__voxelstrike; return { dead: !g.enemies.list[i].alive, boom: g.pendingExplosions.length > 0 || g.player.health < 1000 }; }, tk);
    check(tick.dead && tick.boom, `bashing a ticker kills it and it detonates (${tres}: dead ${tick.dead}, blast ${tick.boom})`);
    await mp.evaluate(() => { window.__voxelstrike.player.health = 1000; });

    // the secret wall: stand 4 u in front of it, looking at it
    const wall = await mp.evaluate(() => {
      const g = window.__voxelstrike;
      const cells = g.level.secretWall ?? [];
      const s = g.level.secretRect;
      if (!cells.length || !s) return null;
      let cx = 0, cz = 0;
      for (const [x, , z] of cells) { cx += x + 0.5; cz += z + 0.5; }
      cx /= cells.length; cz /= cells.length;
      const scx = s.x + s.w / 2, scz = s.z + s.d / 2;
      const ax = Math.abs(cx - scx) > Math.abs(cz - scz);
      const nx = ax ? Math.sign(cx - scx) : 0, nz = ax ? 0 : Math.sign(cz - scz);
      return { cells: cells.length, cx, cz, nx, nz };
    });
    check(!!wall && wall.cells >= 2, `the level knows its cracked secret wall (${wall?.cells} cells)`);
    if (wall) {
      await mp.evaluate((w) => {
        const g = window.__voxelstrike, p = g.player;
        window.__stand = () => {
          p.pos.set(w.cx + w.nx * 4, p.pos.y, w.cz + w.nz * 4); p.vel.set(0, 0, 0);
          p.yaw = Math.atan2(w.nx, w.nz); p.pitch = -0.15;
        };
        p.spawnAt(w.cx + w.nx * 4, 2.05, w.cz + w.nz * 4);
        window.__stand();
      }, wall);
      await new Promise((r) => setTimeout(r, 2600));
      const hint = await mp.evaluate(() => (document.querySelector('#messages')?.textContent ?? ''));
      check(/cracked wall looks weak/i.test(hint), 'near the cracked wall, a line says to shoot or bash it');
      await mp.screenshot({ path: 'scripts/shots/features-secret-glint.png' });
      // walk up and bash it open
      await mp.evaluate((w) => {
        const p = window.__voxelstrike.player;
        window.__stand = () => { p.pos.set(w.cx + w.nx * 1.0, p.pos.y, w.cz + w.nz * 1.0); p.vel.set(0, 0, 0); p.yaw = Math.atan2(w.nx, w.nz); p.pitch = -0.35; };
      }, wall);
      let opened = false;
      for (let i = 0; i < 6 && !opened; i++) {
        await bash();
        await new Promise((r) => setTimeout(r, 400));
        opened = await mp.evaluate(() => { const g = window.__voxelstrike; return (g.level.secretWall ?? []).some(([x, y, z]) => g.world.get(x, y, z) === 0); });
      }
      check(opened, 'a bash breaks the cracked wall open');
      // step inside: the SECRET FOUND moment
      await mp.evaluate(() => {
        const g = window.__voxelstrike, s = g.level.secretRect;
        window.__stand = () => {};
        g.player.spawnAt(s.x + s.w / 2, 2.05, s.z + s.d / 2);
      });
      await new Promise((r) => setTimeout(r, 400));
      const found = await mp.evaluate(() => ({
        text: document.querySelector('.secret-found')?.textContent ?? '',
        secrets: window.__voxelstrike.secretsFound,
      }));
      check(/SECRET FOUND/.test(found.text) && /\+500/.test(found.text) && found.secrets === 1, `stepping in shows SECRET FOUND (+500) ("${found.text}")`);
      await mp.screenshot({ path: 'scripts/shots/features-secret-found.png' });
    }
    await mp.close();
  }

  // --- 19b. touch: no BASH button; a second FIRE above the move stick -------
  // (outside playtesters, 2026-10-27: BASH was clutter; the left thumb wants
  // to shoot while the right one aims). Either FIRE holds the trigger.
  {
    const tp = await browser.newPage();
    tp.on('pageerror', (err) => errors.push(`[fire2-touch pageerror] ${err.message}`));
    await tp.setViewport({ width: 667, height: 375, hasTouch: true, isMobile: true });
    await tp.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await tp.waitForSelector('#start-btn');
    await tp.tap('#start-btn');
    await new Promise((r) => setTimeout(r, 1200));
    const lay = await tp.evaluate(() => {
      const r = (q) => document.querySelector(q)?.getBoundingClientRect();
      const f2 = r('#tfire2'), f = r('#tfire'), j = r('#tjump'), a = r('#tammo'), v = r('#vitals'), w = r('#tweapon');
      const overlap = (p, q) => p && q && p.left < q.right && q.left < p.right && p.top < q.bottom && q.top < p.bottom;
      return { bash: !!document.querySelector('#tmelee'), ok: !!f2, left: f2 ? f2.left : 0, mid: f2 ? (f2.top + f2.bottom) / 2 / innerHeight : 0,
        onScreen: f2 && f2.top >= 0 && f2.bottom <= innerHeight, hits: [f, j, a, v, w].filter((x) => overlap(f2, x)).length };
    });
    check(!lay.bash, 'the touch BASH button is gone');
    check(lay.ok && lay.onScreen && lay.hits === 0 && lay.left < 120 && lay.mid > 0.25 && lay.mid < 0.6,
      `a second FIRE sits on the left above the move stick, overlapping nothing (${lay.left.toFixed(0)}px in, ${(lay.mid * 100).toFixed(0)}% down)`);
    const hold = await tp.evaluate(async () => {
      const g = window.__voxelstrike; g.state = 'playing';
      const el1 = document.querySelector('#tfire'), el2 = document.querySelector('#tfire2');
      const send = (el, type, id) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true,
        changedTouches: [new Touch({ identifier: id, target: el, clientX: 1, clientY: 1 })] }));
      const ammo0 = g.player.ammo.bullets;
      send(el2, 'touchstart', 7); const a = g.input.touchState.fire;
      await new Promise((r) => setTimeout(r, 400));
      const fired = g.player.ammo.bullets < ammo0;
      send(el1, 'touchstart', 8); send(el2, 'touchend', 7); const b = g.input.touchState.fire;
      send(el1, 'touchend', 8); const c = g.input.touchState.fire;
      return { a, b, c, fired };
    });
    check(hold.a && hold.fired, 'holding the left FIRE shoots');
    check(hold.b && !hold.c, 'with both held, letting one go keeps firing; letting both go stops');
    await tp.screenshot({ path: 'scripts/shots/features-touch-fire2.png' });
    await tp.close();
  }

  // --- 20. weapon skins: a goal on the title, earned by playing, the Armory ------
  {
    const sk = await browser.newPage();
    sk.on('pageerror', (err) => errors.push(`[skins pageerror] ${err.message}`));
    await sk.setViewport({ width: 1280, height: 720 });
    await sk.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await sk.evaluate(() => localStorage.removeItem('voxelstrike-skins'));
    await sk.reload({ waitUntil: 'networkidle0' });
    await sk.waitForSelector('#start-btn');
    const strip = await sk.evaluate(() => {
      const el = document.querySelector('#next-unlock');
      return { text: el?.textContent.replace(/\s+/g, ' ').trim() ?? '', tag: el?.tagName ?? '' };
    });
    check(/CERAMIC MINT SIDEARM/.test(strip.text) && /10 KILLS/.test(strip.text) && /0\/10/.test(strip.text) && strip.tag === 'DIV',
      `the title names the first skin to earn ("${strip.text}")`);
    await sk.screenshot({ path: 'scripts/shots/features-skins-title.png' });
    await sk.click('#start-btn');
    await new Promise((r) => setTimeout(r, 900));
    // ten real kills (the game's own kill path)
    const earned = await sk.evaluate(async () => {
      const g = window.__voxelstrike;
      g.input.locked = true;
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const victims = g.enemies.list.filter((e) => e.alive && e.kind !== 'ticker').slice(0, 10);
      for (const e of victims) { e.damage(9999, 0, 0, g); await sleep(30); }
      await sleep(700);
      return {
        kills: g.skins.stats.kills,
        skin: g.weapons.skinOf('pistol'),
        stamp: document.querySelector('.skin-unlocked')?.textContent ?? '',
        saved: JSON.parse(localStorage.getItem('voxelstrike-skins') || '{}').unlocked ?? [],
        toast: document.querySelector('#unlock')?.textContent.replace(/\s+/g, ' ').trim() ?? '',
      };
    });
    check(earned.kills >= 10 && earned.skin === 'pistol.ceramicMint' && /SKIN UNLOCKED/.test(earned.stamp) && /CERAMIC MINT/.test(earned.stamp),
      `10 kills earn CERAMIC MINT: stamped and painted onto the sidearm in hand (${earned.skin})`);
    check(earned.saved.includes('pistol.ceramicMint'), 'the unlock is saved on the device');
    check(/HAZARD/.test(earned.toast) && /CLEAR SECTOR 1/.test(earned.toast), `the HUD moves on to the next goal ("${earned.toast}")`);
    await sk.screenshot({ path: 'scripts/shots/features-skins-unlocked.png' });
    // pause → Armory: opens on the gun in hand, one tab per gun, a live preview
    await sk.evaluate(() => { const g = window.__voxelstrike; g.state = 'playing'; g.requestPause(); });
    await new Promise((r) => setTimeout(r, 300));
    await sk.evaluate(() => document.querySelector('#pause-armory-btn').click());
    await sk.waitForSelector('#armory-screen');
    await new Promise((r) => setTimeout(r, 400));
    const arm = await sk.evaluate(() => ({
      tabs: [...document.querySelectorAll('.arm-tab')].map((t) => t.textContent.replace(/\s+/g, ' ').trim()),
      on: document.querySelector('.arm-tab.on')?.dataset.w,
      chips: document.querySelectorAll('.arm-skin').length,
      model: document.querySelector('#arm-canvas')?.dataset.model,
      status: document.querySelector('#arm-status')?.textContent ?? '',
    }));
    check(arm.tabs.length === 5 && arm.on === 'pistol' && arm.chips === 5 && /SIDEARM1\/4/.test(arm.tabs[0].replace(/ /g, '')),
      `the Armory has a tab per gun and opens on the one in hand (${arm.tabs.join(' | ')}; ${arm.chips} paints)`);
    check(arm.model === 'pistol.ceramicMint' && /EQUIPPED/.test(arm.status), `the turntable shows the equipped paint (${arm.model}, "${arm.status}")`);
    await sk.screenshot({ path: 'scripts/shots/features-skins-armory.png' });
    // another tab: a locked skin still previews, with its goal
    await sk.evaluate(() => document.querySelector('.arm-tab[data-w="shotgun"]').click());
    await sk.evaluate(() => document.querySelector('.arm-skin[data-id="shotgun.hazard"]').click());
    await new Promise((r) => setTimeout(r, 300));
    const locked = await sk.evaluate(() => ({
      chips: document.querySelectorAll('.arm-skin').length,
      model: document.querySelector('#arm-canvas').dataset.model,
      status: document.querySelector('#arm-status').textContent,
      equipBtn: !!document.querySelector('#armory-equip'),
    }));
    check(locked.chips === 7 && locked.model === 'shotgun.hazard' && /LOCKED/.test(locked.status) && /CLEAR SECTOR 1/.test(locked.status) && !locked.equipBtn,
      `a locked skin previews on the turntable with its goal, no Equip ("${locked.status}")`);
    await sk.screenshot({ path: 'scripts/shots/features-skins-armory-locked.png' });
    // pick STANDARD on the sidearm tab, Equip; then Ceramic Mint again
    await sk.evaluate(() => document.querySelector('.arm-tab[data-w="pistol"]').click());
    await sk.evaluate(() => document.querySelector('.arm-skin[data-id=""]').click());
    await sk.evaluate(() => document.querySelector('#armory-equip').click());
    const toStd = await sk.evaluate(() => window.__voxelstrike.weapons.skinOf('pistol'));
    await sk.evaluate(() => document.querySelector('.arm-skin[data-id="pistol.ceramicMint"]').click());
    await sk.evaluate(() => document.querySelector('#armory-equip').click());
    const back = await sk.evaluate(() => ({ skin: window.__voxelstrike.weapons.skinOf('pistol'), status: document.querySelector('#arm-status').textContent }));
    check(toStd === '' && back.skin === 'pistol.ceramicMint' && /EQUIPPED/.test(back.status), 'Equip repaints the gun (standard, then Ceramic Mint)');
    // back on the title: the top-left Armory button shows the count and opens it
    await sk.evaluate(() => document.querySelector('#armory-back').click());
    await sk.evaluate(() => document.querySelector('#pause-newrun-btn').click());
    await sk.waitForSelector('#title-armory-btn');
    const t2 = await sk.evaluate(() => {
      const b = document.querySelector('#title-armory-btn');
      const r = b.getBoundingClientRect();
      return { text: b.textContent.replace(/\s+/g, ' ').trim(), left: r.left, top: r.top, next: document.querySelector('#next-unlock').tagName };
    });
    check(/ARMORY/i.test(t2.text) && /1\/22/.test(t2.text) && t2.left < 40 && t2.top < 40 && t2.next === 'DIV',
      `the title's top-left ARMORY button shows the count ("${t2.text}" at ${Math.round(t2.left)},${Math.round(t2.top)})`);
    await sk.screenshot({ path: 'scripts/shots/features-skins-title-armory.png' });
    await sk.evaluate(() => document.querySelector('#title-armory-btn').click());
    await sk.waitForSelector('#armory-screen');
    await sk.evaluate(() => document.querySelector('#armory-back').click());
    check(await sk.evaluate(() => !!document.querySelector('#title-screen')), 'it opens the Armory, and Back returns to the title');
    await sk.close();
    // phone: the Armory fits the width and scrolls, Back is reachable
    const sp = await browser.newPage();
    await sp.setViewport({ width: 667, height: 375, hasTouch: true, isMobile: true });
    await sp.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await sp.waitForSelector('#title-armory-btn');
    const corner = await sp.evaluate(() => {
      const a = document.querySelector('#title-armory-btn').getBoundingClientRect();
      const logo = document.querySelector('#title-logo').getBoundingClientRect();
      return { onScreen: a.left >= 0 && a.top >= 0, clearOfLogo: a.bottom <= logo.top || a.right <= logo.left };
    });
    check(corner.onScreen && corner.clearOfLogo, 'phone: the Armory corner button sits clear of the logo');
    await sp.screenshot({ path: 'scripts/shots/features-skins-title-phone.png' });
    await sp.evaluate(() => document.querySelector('#title-armory-btn').click());
    await sp.waitForSelector('#armory-screen');
    const fit = await sp.evaluate(() => {
      const scr = document.querySelector('#armory-screen');
      const backBtn = document.querySelector('#armory-back');
      backBtn.scrollIntoView();
      const r = backBtn.getBoundingClientRect();
      return { noH: document.documentElement.scrollWidth <= innerWidth && scr.scrollWidth <= scr.clientWidth + 1, back: r.bottom <= innerHeight && r.top >= 0 };
    });
    await sp.screenshot({ path: 'scripts/shots/features-skins-armory-phone.png' });
    check(fit.noH && fit.back, 'phone: the Armory fits the width and Back is reachable');
    await sp.evaluate(() => localStorage.removeItem('voxelstrike-skins'));
    await sp.close();
  }

  // --- 21. the Geothermal Core's Power Link: an optional cage puzzle ---------
  // Every generated core sector has a sealed supply cage in a normal room and
  // a node in that room's wall, joined by an amber cable. The grille keeps
  // you (and the magnet) out until the node is SHOT; then the gate sinks, the
  // grille clears and the supplies are yours.
  {
    const gp = await browser.newPage();
    gp.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
    gp.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`); });
    await gp.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await gp.waitForSelector('#start-btn');
    const sweep = await gp.evaluate(async () => {
      const { generateLevel } = await import('/src/world/levelgen.ts');
      const bad = [];
      let n = 0;
      // the core (6–7) and the facility from sector 2 (2, 3, and an endless depth)
      const cases = [[6, 'geothermal'], [7, 'geothermal'], [2, 'facility'], [3, 'facility'], [8, 'facility']];
      for (let seed = 1; seed <= 12; seed++) for (const [depth, theme] of cases) {
        n++;
        const L = generateLevel(seed * 7919, depth, theme);
        const pl = L.powerLink;
        if (!pl) { bad.push(`${seed}/${depth}: none`); continue; }
        const c = pl.cage;
        const room = L.rooms.find((r) => r.x === pl.room.x0 && r.z === pl.room.z0);
        if (!room || room.kind !== 'normal') bad.push(`${seed}/${depth}: in a ${room?.kind} room`);
        if (L.world.get(pl.node.x, pl.node.y, pl.node.z) !== 7) bad.push(`${seed}/${depth}: node is not a lamp`);
        const sealed = L.pickups.filter((p) => p.sealed);
        const inCage = sealed.every((p) => {
          const a = (p.x - c.ox) * c.ux + (p.z - c.oz) * c.uz, t = (p.x - c.ox) * c.nx + (p.z - c.oz) * c.nz;
          return a > 1 && a < 4 && t > 0 && t < 1;
        });
        if (sealed.length !== 3 || !inCage) bad.push(`${seed}/${depth}: ${sealed.length} sealed, in cage ${inCage}`);
        const enemyInside = L.enemies.some((e) => {
          const a = (e.x - c.ox) * c.ux + (e.z - c.oz) * c.uz, t = (e.x - c.ox) * c.nx + (e.z - c.oz) * c.nz;
          return a > 0 && a < 5 && t > 0 && t < 2;
        });
        if (enemyInside) bad.push(`${seed}/${depth}: an enemy spawns in the cage`);
        // never built over the secret room's cracked wall (Block.Cracked = 12)
        for (let a = -1; a <= 5; a++) {
          const x = Math.floor(c.ox + c.ux * (a + 0.5) - c.nx * 0.5), z = Math.floor(c.oz + c.uz * (a + 0.5) - c.nz * 0.5);
          for (let y = 1; y <= 3; y++) if (L.world.get(x, y, z) === 12) { bad.push(`${seed}/${depth}: the cage hides the cracked wall`); a = 6; break; }
        }
      }
      // the sector 1 opener and the Biofoundry (it has its tanks) never get one;
      // only the core has the steam + signs
      const other = [generateLevel(7919, 1, 'facility'), generateLevel(7919, 4, 'biofoundry')].some((L) => L.powerLink);
      const geoOnly = !generateLevel(7919, 2, 'facility').geo && !!generateLevel(7919, 6, 'geothermal').geo;
      return { n, bad, other, geoOnly };
    });
    check(sweep.bad.length === 0, `Power Link in all ${sweep.n} core + facility (sector 2+) layouts: normal room, lamp node, 3 sealed supplies in the cage, no enemy inside${sweep.bad.length ? ' — ' + sweep.bad.join('; ') : ''}`);
    check(!sweep.other && sweep.geoOnly, 'no Power Link in the sector 1 opener or the Biofoundry; steam + signs only in the core');

    await new Promise((r) => setTimeout(r, 900));
    await gp.click('#start-btn');
    await new Promise((r) => setTimeout(r, 1000));
    await gp.evaluate(() => {
      const g = window.__voxelstrike;
      g.hud.clearHint();
      g.levelIndex = 6;
      g.buildLevel();
      g.state = 'playing';
      g.player.health = 99999;
      g.input.locked = true;
      for (const e of g.enemies.list) e.puppet = true; // hold still
    });
    await new Promise((r) => setTimeout(r, 400));
    // a point on the cage: a along the wall, t out into the room
    await gp.evaluate(() => {
      window.__cageAt = (a, t) => { const c = window.__voxelstrike.level.powerLink.cage; return [c.ox + c.ux * a + c.nx * t, c.oz + c.uz * a + c.nz * t]; };
    });
    // walk straight at the grille: it holds, and nothing inside is collected
    const walk = await gp.evaluate(async () => {
      const at = window.__cageAt;
      const g = window.__voxelstrike;
      const [x, z] = at(2.5, 3.2);
      const [tx, tz] = at(2.5, 0);
      g.player.pos.set(x, 1.9, z);
      g.player.vel.set(0, 0, 0);
      g.player.yaw = Math.atan2(-(tx - x), -(tz - z));
      g.player.pitch = 0;
      g.input.keys.add('KeyW');
      for (let i = 0; i < 45; i++) await new Promise((r) => requestAnimationFrame(r));
      g.input.keys.delete('KeyW');
      const c = g.level.powerLink.cage;
      const depth = (g.player.pos.x - c.ox) * c.nx + (g.player.pos.z - c.oz) * c.nz;
      return { depth, taken: g.pickups.items.filter((p) => p.taken && 'sealed' in p.spec).length, art: !!g.previewArt?.group.userData.powerLink };
    });
    check(walk.art, 'the core sector gets the Power Link scenery');
    check(walk.depth > 2.2 && walk.taken === 0, `the grille holds (stopped ${walk.depth.toFixed(2)} from the wall) and the supplies stay sealed`);
    // a shot at plain wall does nothing; a shot at the node solves it
    const shoot = (target) => gp.evaluate(async (target) => {
      const g = window.__voxelstrike;
      const n = g.level.powerLink.node;
      const x = n.x + 0.5 + n.nx * 4, z = n.z + 0.5 + n.nz * 4;
      g.player.pos.set(x, 1.9, z);
      g.player.vel.set(0, 0, 0);
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      const ty = target === 'node' ? 2.5 : 4.5; // the wall above the cable drop's top
      const dx = n.x + 0.5 - g.player.pos.x, dz = n.z + 0.5 - g.player.pos.z;
      g.player.yaw = Math.atan2(-dx, -dz);
      g.player.pitch = Math.atan2(ty - g.player.eyeY(), Math.hypot(dx, dz));
      for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
      g.weapons.give('pistol');
      g.input.pressFire();
      for (let i = 0; i < 8; i++) await new Promise((r) => requestAnimationFrame(r));
      return g.previewArt.group.userData.powerLink.solved;
    }, target);
    check(!(await shoot('wall')), 'a shot into the wall above the node does not solve it');
    await new Promise((r) => setTimeout(r, 700));
    check(await shoot('node'), 'a real pistol shot at the node restores the Power Link');
    await new Promise((r) => setTimeout(r, 1600));
    const open = await gp.evaluate(() => {
      const g = window.__voxelstrike;
      const st = g.previewArt.group.userData.powerLink;
      return { opened: st.opened, clear: st.grille.every(([x, y, z]) => g.world.get(x, y, z) === 0), sealed: g.level.pickups.filter((p) => p.sealed).length };
    });
    check(open.opened && open.clear && open.sealed === 0, `the gate sinks, the grille clears and the supplies unseal (${JSON.stringify(open)})`);
    const got = await gp.evaluate(async () => {
      const at = window.__cageAt;
      const g = window.__voxelstrike;
      g.player.health = 40;
      g.player.armor = 0;
      const [x0, z0] = at(2.5, 3);
      g.player.pos.set(x0, 1.9, z0);
      const before = g.pickups.items.filter((p) => p.taken).length;
      for (const a of [1.5, 2.5, 3.5]) {
        const [x, z] = at(a, 0.6);
        g.player.pos.set(x, 1.9, z);
        g.player.vel.set(0, 0, 0);
        for (let i = 0; i < 12; i++) await new Promise((r) => requestAnimationFrame(r));
      }
      return { taken: g.pickups.items.filter((p) => p.taken).length - before, armor: g.player.armor };
    });
    check(got.taken === 3 && got.armor > 0, `walking in collects all three supplies (${got.taken}, armor ${got.armor})`);
    await gp.evaluate(() => {
      const at = window.__cageAt;
      const g = window.__voxelstrike;
      const [x, z] = at(2.5, 5.5);
      const [tx, tz] = at(2.5, 0);
      g.player.pos.set(x, 1.9, z);
      g.player.yaw = Math.atan2(-(tx - x), -(tz - z));
      g.player.pitch = 0.05;
    });
    await new Promise((r) => setTimeout(r, 500));
    await gp.screenshot({ path: 'scripts/shots/features-powerlink-open.png' });
    await gp.close();
  }

  // --- 22. an empty gun gets thrown and the next loaded one comes up ----------
  // Trigger on a dry gun with another one loaded: it flies end over end, hits
  // like a melee blow, lands as a pickup that gives the gun back (no ammo, no
  // switch). The sidearm is never thrown; with nothing loaded it's a dry click.
  {
    const tp = await browser.newPage();
    tp.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
    tp.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`); });
    await tp.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await tp.waitForSelector('#start-btn');
    await new Promise((r) => setTimeout(r, 900));
    await tp.click('#start-btn');
    await new Promise((r) => setTimeout(r, 900));
    // page-side helpers: wait ms; a husk 5u down a clear arena lane, held still (sector 2)
    await tp.evaluate(() => {
      const g = window.__voxelstrike;
      g.hud.clearHint();
      g.levelIndex = 2;
      g.buildLevel();
      g.state = 'playing';
      window.__wait = (ms) => new Promise((r) => setTimeout(r, ms));
      window.__lane = () => {
        g.input.locked = true;
        g.player.health = 999; g.player.dead = false; g.player.buffs.quad = 0;
        for (const o of g.enemies.list) {
          if (o.alive) { o.pos.set(4, o.pos.y, 4); o.awake = false; o.state = 'idle'; o.vel.set(0, 0, 0); o.wake = () => {}; }
        }
        const ensure = (kind, n) => { const r = g.level.rooms.find((q) => q.kind === 'normal') ?? g.level.rooms[0]; for (let i = g.enemies.list.filter((e) => e.alive && e.kind === kind).length; i < n; i++) g.enemies.spawnFromSpecs([{ kind, x: r.cx + 0.5 + (i % 2), z: r.cz + 0.5 + (i >> 1), roomId: r.id }], g.level.rooms, g); }; // sector 2's own pair is Clamp Guard + Arc Sentinel
        ensure('husk', 1);
        const h = g.enemies.list.find((q) => q.alive && q.kind === 'husk');
        h.wake = () => {}; h.awake = false; h.state = 'idle'; h.vel.set(0, 0, 0);
        const a = g.level.rooms.find((r) => r.kind === 'arena');
        g.player.pos.set(a.cx + 0.5 - 5, 2.0, a.cz + 0.5);
        g.player.vel.set(0, 0, 0);
        g.player.yaw = -Math.PI / 2;
        h.pos.set(a.cx + 0.5, h.pos.y, a.cz + 0.5);
        h.mesh.position.copy(h.pos);
        h.hp = 500;
        g.player.pitch = Math.atan2(h.pos.y - g.player.eyeY(), 5);
        // the arena's own arc caster + cells lie in the lane: out of the way
        for (const p of g.pickups.items) if (!p.spec.thrown) p.spec.y = -50;
        return h;
      };
    });
    const thrown = await tp.evaluate(async () => {
      const g = window.__voxelstrike;
      const h = window.__lane();
      g.weapons.give('shotgun');
      g.player.ammo.shells = 0;
      g.player.ammo.bullets = 30;
      await window.__wait(600);
      const hp0 = h.hp;
      g.input.pressFire();
      await window.__wait(150);
      const thrownId = g.weapons.lastThrown, ownedAfter = g.weapons.has('shotgun');
      await window.__wait(800);
      const drop = g.pickups.items.find((p) => p.spec.thrown && !p.taken);
      return { thrownId, ownedAfter, dmg: hp0 - h.hp, result: g.thrown.lastResult, current: g.weapons.current,
        drop: drop ? { kind: drop.spec.kind, x: drop.spec.x, y: drop.spec.y, z: drop.spec.z, dist: Math.hypot(drop.spec.x - h.pos.x, drop.spec.z - h.pos.z) } : null };
    });
    check(thrown.thrownId === 'shotgun' && !thrown.ownedAfter, `a dry trigger with the sidearm loaded throws the empty Scattergun (${thrown.thrownId})`);
    check(thrown.result === 'enemy' && thrown.dmg === 45, `it hits the husk down the lane for a melee-weight 45 (${thrown.result}, ${thrown.dmg})`);
    check(thrown.current === 'pistol', `the loaded sidearm comes up (${thrown.current})`);
    check(!!thrown.drop && thrown.drop.kind === 'weaponShotgun' && thrown.drop.dist < 1.6 && Math.abs(thrown.drop.y - 1.4) < 0.01,
      `it lands on the floor by the husk as a Scattergun pickup (${JSON.stringify(thrown.drop)})`);
    const back = await tp.evaluate(async () => {
      const g = window.__voxelstrike;
      const d = g.pickups.items.find((p) => p.spec.thrown && !p.taken);
      g.player.pos.set(d.spec.x, 2.0, d.spec.z);
      g.player.vel.set(0, 0, 0);
      await window.__wait(400);
      return { owned: g.weapons.has('shotgun'), taken: d.taken, current: g.weapons.current, shells: g.player.ammo.shells };
    });
    check(back.owned && back.taken && back.current === 'pistol' && back.shells === 0,
      `walking over it gives the Scattergun back, empty, without switching to it (${JSON.stringify(back)})`);
    const side = await tp.evaluate(async () => {
      const g = window.__voxelstrike;
      const h = window.__lane();
      // the sidearm runs dry with shells loaded: no throw, it hops to the shotgun
      g.weapons.lastThrown = null;
      g.weapons.switchTo('pistol');
      await window.__wait(500);
      g.player.ammo.bullets = 0;
      g.player.ammo.shells = 8;
      g.input.pressFire();
      await window.__wait(700);
      const pistol = { thrown: g.weapons.lastThrown, has: g.weapons.has('pistol'), current: g.weapons.current };
      // nothing loaded at all: a dry click, the gun stays in hand
      g.player.ammo.shells = 0;
      g.input.pressFire();
      await window.__wait(700);
      return { pistol, dry: { thrown: g.weapons.lastThrown, current: g.weapons.current, has: g.weapons.has('shotgun') } };
    });
    check(side.pistol.thrown === null && side.pistol.has && side.pistol.current === 'shotgun',
      `the sidearm is never thrown: dry, it hops to the loaded Scattergun (${JSON.stringify(side.pistol)})`);
    check(side.dry.thrown === null && side.dry.current === 'shotgun' && side.dry.has,
      `with nothing loaded anywhere it's a dry click and the gun stays (${JSON.stringify(side.dry)})`);
    // a throw into a wall still lands as a pickup on the floor
    const wall = await tp.evaluate(async () => {
      const g = window.__voxelstrike;
      for (const o of g.enemies.list) if (o.alive) o.pos.set(4, o.pos.y, 4);
      g.player.ammo.bullets = 30;
      g.player.pitch = 0;
      g.player.yaw = Math.PI / 2; // back down the lane: the arena's west wall
      await window.__wait(400);
      g.input.pressFire();
      await window.__wait(1200);
      const d = g.pickups.items.filter((p) => p.spec.thrown && !p.taken).pop();
      return { result: g.thrown.lastResult, thrown: g.weapons.lastThrown, floorY: d ? d.spec.y : null,
        inAir: d ? g.world.get(Math.floor(d.spec.x), Math.floor(d.spec.y), Math.floor(d.spec.z)) === 0 : false };
    });
    check(wall.thrown === 'shotgun' && wall.result === 'wall' && wall.inAir && Math.abs(wall.floorY - 1.4) < 0.01,
      `a throw into a wall drops it on the open floor (${JSON.stringify(wall)})`);
    await tp.close();
  }

  // --- 23. safe area: nothing pinned to an edge sits under a notch / home bar --
  // index.html uses viewport-fit=cover, so the HUD, touch buttons and title
  // corners add env(safe-area-inset-*). Real insets via CDP: an iPhone held
  // landscape (47 | 47, home bar 21), then held upright, which the game
  // rotates into landscape (notch 47 on top, home bar 34 → the game's left
  // and right). The crosshair stays dead centre; no insets = the old spots.
  {
    const EDGE_IDS = ['#tfire', '#tjump', '#tweapon', '#tfire2', '#tmap', '#tpause', '#vitals', '#topright', '#weaponbar', '#objective', '#unlock'];
    const run = async (w, h, insets) => {
      const sp = await browser.newPage();
      sp.on('pageerror', (err) => errors.push(`[safe-area pageerror] ${err.message}`));
      await sp.setViewport({ width: w, height: h, hasTouch: true, isMobile: true });
      const cdp = await sp.createCDPSession();
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
      await sp.evaluateOnNewDocument(() => localStorage.setItem('voxelstrike-tutorial-done', '1'));
      await sp.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
      await sp.waitForSelector('#title-screen');
      await new Promise((r) => setTimeout(r, 800));
      const inside = (ids) => sp.evaluate((ids, ins) => {
        const W = innerWidth, H = innerHeight, out = [];
        for (const id of ids) {
          const el = document.querySelector(id);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < ins.left - 0.5 || r.top < ins.top - 0.5 || r.right > W - ins.right + 0.5 || r.bottom > H - ins.bottom + 0.5) {
            out.push(`${id} [${r.left.toFixed(0)},${r.top.toFixed(0)},${r.right.toFixed(0)},${r.bottom.toFixed(0)}]`);
          }
        }
        return out;
      }, ids, insets);
      const title = await inside(['#title-settings-btn', '#title-armory-btn', '#start-btn']);
      await sp.tap('#start-btn');
      await new Promise((r) => setTimeout(r, 900));
      const hud = await inside(EDGE_IDS);
      const info = await sp.evaluate(() => {
        const c = document.querySelector('#crosshair').getBoundingClientRect();
        const f = document.querySelector('#tfire').getBoundingClientRect();
        return { cx: c.left + c.width / 2, cy: c.top + c.height / 2, W: innerWidth, H: innerHeight,
          rotated: document.body.classList.contains('force-landscape'), fireRight: innerWidth - f.right, fireBottom: innerHeight - f.bottom };
      });
      await sp.screenshot({ path: `scripts/shots/features-safearea-${w}x${h}.png` });
      await sp.close();
      return { title, hud, info };
    };
    const flat = await run(667, 375, { top: 0, left: 0, right: 0, bottom: 0 });
    check(flat.info.fireRight === 18 && flat.info.fireBottom === 18, `no insets: FIRE keeps its 18px from the edges (${flat.info.fireRight}, ${flat.info.fireBottom})`);
    const land = await run(667, 375, { top: 0, left: 47, right: 47, bottom: 21 });
    check(land.title.length === 0, `notched landscape: title corner buttons + PLAY clear the notch${land.title.length ? ' — ' + land.title.join(' ') : ''}`);
    check(land.hud.length === 0, `notched landscape: touch buttons, MAP/pause and the HUD clear the notch and home bar${land.hud.length ? ' — ' + land.hud.join(' ') : ''}`);
    check(land.info.fireRight === 18 + 47 && land.info.fireBottom === 18 + 21, `FIRE moves in by exactly the insets (${land.info.fireRight}, ${land.info.fireBottom})`);
    check(Math.abs(land.info.cx - land.info.W / 2) < 1 && Math.abs(land.info.cy - land.info.H / 2) < 1, 'the crosshair stays at the screen centre');
    // a notched phone's real landscape size (iPhone 14 class)
    const big = await run(844, 390, { top: 0, left: 47, right: 47, bottom: 21 });
    check(big.title.length === 0 && big.hud.length === 0, `844×390 notched: title + HUD clear the notch and home bar${big.title.length + big.hud.length ? ' — ' + [...big.title, ...big.hud].join(' ') : ''}`);
    const up = await run(375, 667, { top: 47, left: 0, right: 0, bottom: 34 });
    check(up.info.rotated, 'held upright, the game is rotated into landscape');
    check(up.hud.length === 0, `held upright: the rotated HUD clears the notch and home bar${up.hud.length ? ' — ' + up.hud.join(' ') : ''}`);
  }

  // --- 24. scrap + permanent upgrades (docs/RETENTION_PLAN.md, phase 1) -------
  // Kills, clears, secrets and the Power Link earn scrap that is never lost;
  // the death screen shows it with an Upgrades button; upgrades are bought,
  // saved, and do what their rows say.
  {
    const up = await browser.newPage();
    up.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
    up.on('console', (msg) => { if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`); });
    await up.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    // earlier sections earned scrap in this same browser: start from an empty save
    await up.evaluate(() => localStorage.removeItem('voxelstrike-upgrades'));
    await up.reload({ waitUntil: 'networkidle0', timeout: 30000 });
    await up.waitForSelector('#start-btn');
    await new Promise((r) => setTimeout(r, 900));
    await up.click('#start-btn');
    await new Promise((r) => setTimeout(r, 900));
    const kills = await up.evaluate(async () => {
      const g = window.__voxelstrike;
      g.hud.clearHint();
      g.levelIndex = 2;
      g.buildLevel();
      g.state = 'playing';
      g.input.locked = true;
      const s0 = g.upgrades.scrap;
      const scrapAt = () => g.pickups.items.filter((p) => p.spec.kind === 'scrap' && !p.taken);
      const ensure = (kind, n) => { const r = g.level.rooms.find((q) => q.kind === 'normal') ?? g.level.rooms[0]; for (let i = g.enemies.list.filter((e) => e.alive && e.kind === kind).length; i < n; i++) g.enemies.spawnFromSpecs([{ kind, x: r.cx + 0.5 + (i % 2), z: r.cz + 0.5 + (i >> 1), roomId: r.id }], g.level.rooms, g); }; // sector 2's own pair is Clamp Guard + Arc Sentinel
      ensure('husk', 1);
      // the brute in another room: its scrap must not join the husk's pile
      const ar = g.level.rooms.find((q) => q.kind === 'arena');
      if (!g.enemies.list.some((e) => e.alive && e.kind === 'brute')) g.enemies.spawnFromSpecs([{ kind: 'brute', x: ar.cx + 0.5, z: ar.cz + 0.5, roomId: ar.id }], g.level.rooms, g);
      const husk = g.enemies.list.find((e) => e.alive && e.kind === 'husk');
      g.applyEnemyHit(husk, 9999, 1, 0, false);
      const huskDrop = scrapAt().map((p) => p.spec.amount);
      const brute = g.enemies.list.find((e) => e.alive && e.kind === 'brute');
      g.applyEnemyHit(brute, 99999, 1, 0, false);
      const drops = scrapAt().map((p) => p.spec.amount);
      const banked = g.upgrades.scrap - s0; // nothing until it's picked up
      // walk onto each one: it banks
      for (const p of scrapAt()) {
        g.player.pos.x = p.spec.x; g.player.pos.z = p.spec.z; g.player.pos.y = Math.floor(p.spec.y);
        g.player.vel.set(0, 0, 0);
        await new Promise((r) => setTimeout(r, 300));
      }
      return { huskDrop, drops, banked, gained: g.upgrades.scrap - s0, hud: document.querySelector('#scrap-num')?.textContent, bank: g.upgrades.scrap,
        saved: JSON.parse(localStorage.getItem('voxelstrike-upgrades') || '{}').scrap };
    });
    check(kills.huskDrop.join() === '1' && kills.drops.slice().sort().join() === '1,5' && kills.banked === 0,
      `kills DROP scrap as pickups (husk ${kills.huskDrop.join()}, then ${kills.drops.join(' + ')}), nothing banked until picked up`);
    check(kills.gained === 6 && kills.saved === 6 && kills.hud === String(kills.bank), `picking them up banks +${kills.gained}, saved (${kills.saved}), the HUD shows ${kills.hud}`);
    // die: the death screen shows this attempt's scrap and an Upgrades button
    await up.evaluate(() => {
      const g = window.__voxelstrike;
      g.earnScrap(400);
      g.player.buffs.shield = 0;
      g.player.damage(9999, g, { x: g.player.pos.x + 1, z: g.player.pos.z, by: 'husk' });
    });
    await new Promise((r) => setTimeout(r, 2400));
    const death = await up.evaluate(() => ({ line: document.querySelector('.death-scrap')?.textContent ?? '', btn: !!document.querySelector('#upgrades-btn') }));
    check(/\+406 SCRAP/.test(death.line) && /406 to spend/.test(death.line) && death.btn, `the death screen shows the attempt's scrap and an Upgrades button ("${death.line}")`);
    await up.evaluate(() => document.querySelector('#upgrades-btn').click());
    await new Promise((r) => setTimeout(r, 300));
    const buy = await up.evaluate(async () => {
      const g = window.__voxelstrike;
      const rows = document.querySelectorAll('#upgrades-screen .upg-row').length;
      const before = g.upgrades.scrap;
      for (const id of ['suit', 'plates', 'medic', 'hands', 'headstart']) document.querySelector(`.upg-buy[data-id="${id}"]`).click();
      await new Promise((r) => setTimeout(r, 100));
      const pips = document.querySelector('[data-row="suit"] .upg-pips i.on') !== null;
      return { rows, spent: before - g.upgrades.scrap, maxHealth: g.player.maxHealth, hands: g.weapons.quickHands, pips,
        saved: JSON.parse(localStorage.getItem('voxelstrike-upgrades')).levels };
    });
    check(buy.rows === 7 && buy.spent === 250 && buy.pips, `the Upgrades screen lists 7 upgrades; five buys cost 250 scrap (${buy.spent}) and fill their pips`);
    check(buy.maxHealth === 110 && buy.hands === 1 && buy.saved.suit === 1 && buy.saved.headstart === 1,
      `Reinforced Suit raises max health to 110 (${buy.maxHealth}), Quick Hands reaches the weapons, the levels are saved`);
    await up.screenshot({ path: 'scripts/shots/features-upgrades.png' });
    const tooPoor = await up.evaluate(() => {
      const g = window.__voxelstrike;
      while (g.upgrades.scrap >= 50) { if (!g.upgrades.buy('belt') && !g.upgrades.buy('scanner')) break; }
      const left = g.upgrades.scrap;
      const ok = g.upgrades.buy('scanner');
      return { refused: !ok && g.upgrades.scrap === left };
    });
    check(tooPoor.refused, 'a buy without enough scrap is refused and costs nothing');
    // back to the death screen, retry: Starter Plates arms you, the suit's cap holds
    await up.evaluate(() => document.querySelector('#upgrades-back').click());
    await new Promise((r) => setTimeout(r, 900));
    const retry = await up.evaluate(async () => {
      const g = window.__voxelstrike;
      const onDeath = !!document.querySelector('#retry-btn');
      document.querySelector('#retry-btn').click();
      await new Promise((r) => setTimeout(r, 1200));
      return { onDeath, state: g.state, armor: g.player.armor, maxHealth: g.player.maxHealth };
    });
    check(retry.onDeath && retry.state === 'playing' && retry.armor >= 10 && retry.maxHealth === 110,
      `Back returns to the death screen; the retry starts with Starter Plates armor (${retry.armor})`);
    const medic = await up.evaluate(async () => {
      const g = window.__voxelstrike;
      g.player.health = 50;
      const p = g.player.pos;
      g.spawnPickup('healthSmall', p.x, p.y - 0.4, p.z);
      await new Promise((r) => setTimeout(r, 300));
      return g.player.health;
    });
    check(medic === 62, `Field Medic: a medkit heals 12 instead of 10 (50 → ${medic})`);
    const run = await up.evaluate(async () => {
      const g = window.__voxelstrike;
      g.newRunNow(false);
      await new Promise((r) => setTimeout(r, 400));
      return { smg: g.weapons.has('smg'), health: g.player.health, maxHealth: g.player.maxHealth, scrap: g.upgrades.scrap };
    });
    check(run.smg && run.health === 110, `Head Start: a new run carries the Ripper SMG and starts at full health (${run.health} / ${run.maxHealth}); scrap is kept`);
    // a sector clear pays out and says so under the tally
    const clear = await up.evaluate(async () => {
      const g = window.__voxelstrike;
      const s0 = g.upgrades.scrap;
      g.win();
      await new Promise((r) => setTimeout(r, 400));
      return { gained: g.upgrades.scrap - s0, line: document.querySelector('.sc-scrap')?.textContent ?? '' };
    });
    check(clear.gained >= 20 && /SCRAP/.test(clear.line), `a sector clear earns scrap (+${clear.gained}) and the tally shows it ("${clear.line}")`);
    // it all survives a reload
    await up.reload({ waitUntil: 'networkidle0' });
    await up.waitForSelector('#start-btn');
    const kept = await up.evaluate(() => {
      const g = window.__voxelstrike;
      return { suit: g.upgrades.level('suit'), plates: g.upgrades.level('plates'), scrap: g.upgrades.scrap, maxHealth: g.player.maxHealth };
    });
    check(kept.suit === 1 && kept.plates === 1 && kept.maxHealth === 110, `upgrades survive a reload (suit ${kept.suit}, max health ${kept.maxHealth}, scrap ${kept.scrap})`);
    // the Armory on the title opens them too
    await up.evaluate(() => document.querySelector('#title-armory-btn').click());
    await new Promise((r) => setTimeout(r, 400));
    const fromArmory = await up.evaluate(async () => {
      const b = document.querySelector('#armory-upgrades');
      const label = b?.textContent ?? '';
      b?.click();
      await new Promise((r) => setTimeout(r, 300));
      const open = !!document.querySelector('#upgrades-screen');
      document.querySelector('#upgrades-back')?.click();
      await new Promise((r) => setTimeout(r, 300));
      return { label, open, back: !!document.querySelector('#armory-screen') };
    });
    check(fromArmory.open && fromArmory.back && /scrap/i.test(fromArmory.label), `the Armory's "${fromArmory.label}" button opens Upgrades, and Back returns to the Armory`);
    // a phone: the screen fits and Back is reachable
    // (switching to a touch viewport reloads the page: back to the title)
    await up.setViewport({ width: 667, height: 375, hasTouch: true, isMobile: true });
    await up.waitForSelector('#title-armory-btn');
    await up.evaluate(() => document.querySelector('#title-armory-btn').click());
    await up.waitForSelector('#armory-upgrades');
    await up.evaluate(() => document.querySelector('#armory-upgrades').click());
    await up.waitForSelector('#upgrades-back');
    const phone = await up.evaluate(() => {
      const scr = document.querySelector('#upgrades-screen');
      const back = document.querySelector('#upgrades-back').getBoundingClientRect();
      return { noH: document.documentElement.scrollWidth <= innerWidth && scr.scrollWidth <= scr.clientWidth + 1, back: back.top >= 0 && back.bottom <= innerHeight };
    });
    await up.screenshot({ path: 'scripts/shots/features-upgrades-phone.png' });
    check(phone.noH && phone.back, 'phone: the Upgrades screen fits the width and Back is reachable');
    await up.close();
  }

  // --- 16. main screen + pixelation defaults ---------------------------------
  // Co-op is hidden on the title (like Poki; ?coop shows it for development).
  // Desktop defaults to 480 lines, touch to 320 (above), still cycled in
  // Settings; a 240 saved by the old one-size default moves to the device
  // default once, while a 240 picked under the new settings stays.
  {
    const pc = await browser.newPage();
    pc.on('pageerror', (err) => errors.push(`[pc pageerror] ${err.message}`));
    await pc.setViewport({ width: 1280, height: 720 });
    await pc.evaluateOnNewDocument(() => {
      if (sessionStorage.getItem('seeded')) return;
      sessionStorage.setItem('seeded', '1');
      for (const k of ['voxelstrike-settings', 'voxelstrike-tutorial-done', 'voxelstrike-geothermal-seen', 'voxelstrike-run', 'voxelstrike-skins']) localStorage.removeItem(k);
    });
    await pc.goto(URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await pc.waitForSelector('#start-btn');
    const fresh = await pc.evaluate(() => ({
      coop: !!document.querySelector('#coop-btn'),
      res: window.__voxelstrike.settings.resolution,
      lines: window.__voxelstrike.rendererSys.renderer.domElement.height,
    }));
    check(!fresh.coop, 'the main screen has no co-op button (same as Poki)');
    check(await pc.evaluate(() => window.__voxelstrike.overload === null), 'the Overload terminal is hidden in normal play (only ?overload builds it)');
    const first = await pc.evaluate(() => {
      const play = document.querySelector('#start-btn');
      const steps = [...document.querySelectorAll('#title-steps .tstep-text')].map((t) => t.textContent.replace(/\s+/g, ' ').trim());
      const buttons = [...document.querySelectorAll('#title-screen button')].map((b) => b.id);
      const r = play.getBoundingClientRect();
      return {
        play: play.textContent.trim(), steps, buttons, banner: !!document.querySelector('#new-sector'),
        goal: document.querySelector('.title-goal')?.textContent, playOnScreen: r.bottom <= innerHeight,
      };
    });
    check(first.play === 'Play' && first.playOnScreen && first.goal === 'Escape the facility' && first.steps.length === 3 && /keycard/i.test(first.steps[0]),
      `first visit: the campaign goal, three steps and one PLAY button ("${first.goal}": ${first.steps.join(' > ')})`);
    check(first.buttons.join() === 'title-settings-btn,title-armory-btn,start-btn' && !first.banner,
      `first visit: PLAY (the campaign) and the two corner buttons — no NEW SECTOR banner (${first.buttons.join(', ')})`);
    await pc.screenshot({ path: 'scripts/shots/features-title-first.png' });
    // a returning player who hasn't reached the Biofoundry yet gets the banner
    await pc.evaluate(() => localStorage.setItem('voxelstrike-tutorial-done', '1'));
    await pc.reload({ waitUntil: 'networkidle0' });
    await pc.waitForSelector('#start-btn');
    const banner = await pc.evaluate(() => {
      const b = document.querySelector('#new-sector');
      const menu = document.querySelector('.title-menu');
      if (!b || !menu) return { shown: false };
      const r = b.getBoundingClientRect();
      return { shown: true, text: b.textContent.replace(/\s+/g, ' ').trim(), aboveMenu: r.bottom <= menu.getBoundingClientRect().top + 1, inside: r.left >= 0 && r.right <= innerWidth };
    });
    check(banner.shown && /NEW SECTOR/.test(banner.text) && /GEOTHERMAL/.test(banner.text),
      `a returning player sees the NEW SECTOR banner ("${banner.text ?? ''}")`);
    check(banner.shown && banner.aboveMenu && banner.inside, 'the banner sits above the menu, inside the screen');
    await pc.screenshot({ path: 'scripts/shots/features-title-banner.png' });
    check(fresh.res === 480, `desktop defaults to 480-line pixelation (${fresh.res})`);
    check(fresh.lines >= 470 && fresh.lines <= 490, `the renderer really draws ~480 lines (${fresh.lines})`);
    // still adjustable: one press on Pixelation cycles to the next step and saves it
    await pc.click('#title-settings-btn');
    await pc.waitForSelector('#settings-back');
    const cycled = await pc.evaluate(() => {
      document.querySelector('#set-res')?.click();
      return {
        res: window.__voxelstrike.settings.resolution,
        saved: JSON.parse(localStorage.getItem('voxelstrike-settings') || 'null'),
      };
    });
    check(cycled.res !== 480 && cycled.saved?.resolution === cycled.res, `pixelation is still adjustable and saved (480 → ${cycled.res})`);
    // a 240 left by the old default migrates once; a deliberate 240 stays
    await pc.evaluate(() => localStorage.setItem('voxelstrike-settings', JSON.stringify({ resolution: 240, fov: 80 })));
    await pc.reload({ waitUntil: 'networkidle0' });
    const migrated = await pc.evaluate(() => ({ res: window.__voxelstrike.settings.resolution, fov: window.__voxelstrike.settings.fov }));
    check(migrated.res === 480 && migrated.fov === 80, `old-default 240 moves to 480, other settings kept (res ${migrated.res}, fov ${migrated.fov})`);
    await pc.evaluate(() => localStorage.setItem('voxelstrike-settings', JSON.stringify({ resolution: 240, v: 2 })));
    await pc.reload({ waitUntil: 'networkidle0' });
    check(await pc.evaluate(() => window.__voxelstrike.settings.resolution === 240), 'a 240 chosen under the new settings stays 240');
    await pc.goto(URL + '&coop', { waitUntil: 'networkidle0', timeout: 30000 });
    check(await pc.evaluate(() => !!document.querySelector('#coop-btn')), '?coop still shows the co-op button for development');
    // once the Geothermal Core has been reached, the banner has done its job
    await pc.evaluate(() => {
      const g = window.__voxelstrike;
      g.levelIndex = 6;
      g.buildLevel();
    });
    check(await pc.evaluate(() => localStorage.getItem('voxelstrike-geothermal-seen') === '1'), 'entering the Geothermal Core marks it as seen');
    await pc.reload({ waitUntil: 'networkidle0' });
    await pc.waitForSelector('#start-btn');
    check(await pc.evaluate(() => !document.querySelector('#new-sector')), 'after that, the title shows no NEW SECTOR banner');
    await pc.close();
  }
  // New environments retain their optional cache and cracked-wall secret.
  for (const [depth, theme] of [[8, 'freight'], [11, 'excavation'], [12, 'medical']]) {
    await page.evaluate((n) => {
      const g = window.__voxelstrike;
      g.hud.hideScreen(); g.levelIndex = n; g.buildLevel();
      g.state = 'playing'; g.player.dead = false; g.player.health = 99999; g.input.locked = true;
      for (const e of g.enemies.list) e.puppet = true;
      const node = g.level.powerLink?.node;
      if (node) g.applyVoxelDamage(node.x, node.y, node.z, 20);
      for (const [x, y, z] of g.level.secretWall ?? []) g.applyVoxelDamage(x, y, z, 100);
    }, depth);
    await new Promise((r) => setTimeout(r, 1300));
    const map = await page.evaluate(() => {
      const g = window.__voxelstrike;
      return { theme: g.level.theme, link: !!g.level.powerLink, supplies: g.pickups.items.filter((p) => p.spec.sealed).length,
        secret: !!g.level.secretRect && g.level.secretWall.every(([x,y,z]) => g.world.get(x,y,z) !== 12) };
    });
    check(map.theme === theme && map.link && map.supplies === 0 && map.secret, `${theme}: Power Link opens and secret wall breaks`);
  }
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nFEATURES TEST PASSED');
