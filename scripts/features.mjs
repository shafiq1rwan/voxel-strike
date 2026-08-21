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
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nFEATURES TEST PASSED');
