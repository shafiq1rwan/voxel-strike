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
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
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
  await page.evaluate(() => { window.__voxelstrike.input.locked = true; });

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
    b.pos.set(a.cx + 0.5 + 3, b.pos.y, a.cz + 0.5);
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
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nFEATURES TEST PASSED');
