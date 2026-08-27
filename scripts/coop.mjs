/**
 * Co-op regression: two pages in one browser linked over the BroadcastChannel
 * transport (`?mp=local`), host-authoritative. Verifies the connection
 * handshake + shared seed, avatar streaming, puppet enemy sync, client → host
 * damage routing, host → client death/score echo, voxel authority, pickup
 * claims, shared keycards + the ambush, sector-clear sync, and respawn.
 * Usage: node scripts/coop.mjs [baseUrl]
 */
import puppeteer from 'puppeteer-core';

const BASE = (process.argv[2] ?? 'http://localhost:5173/').replace(/\/$/, '');
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const ROOM = `T${Math.floor(Math.random() * 1e6)}`;
const SEED = 4242;

const errors = [];
const check = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${msg}`);
  if (!cond) errors.push(msg);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: true,
  args: [
    '--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio',
    // both pages must keep simulating even though only one tab is "active"
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
  ],
  defaultViewport: { width: 1280, height: 720 },
});

try {
  const host = await browser.newPage();
  const client = await browser.newPage();
  for (const [name, pg] of [['host', host], ['client', client]]) {
    pg.on('pageerror', (err) => errors.push(`[${name} pageerror] ${err.message}`));
    pg.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[${name} console.error] ${msg.text()}`);
    });
  }

  await host.goto(`${BASE}/?seed=${SEED}&mp=local&role=host&room=${ROOM}`, { waitUntil: 'networkidle0', timeout: 30000 });
  await client.goto(`${BASE}/?mp=local&role=join&room=${ROOM}`, { waitUntil: 'networkidle0', timeout: 30000 });

  // --- handshake -------------------------------------------------------------
  let linked = false;
  for (let i = 0; i < 40 && !linked; i++) {
    await sleep(250);
    const [h, c] = await Promise.all([
      host.evaluate(() => {
        const g = window.__voxelstrike;
        return { state: g.state, conn: !!(g.net && g.net.connected), seed: g.baseSeedValue() };
      }),
      client.evaluate(() => {
        const g = window.__voxelstrike;
        return { state: g.state, conn: !!(g.net && g.net.connected), seed: g.baseSeedValue() };
      }),
    ]);
    linked = h.state === 'playing' && c.state === 'playing' && h.conn && c.conn && h.seed === c.seed;
  }
  check(linked, 'host + client linked, both playing on the same seed');
  await host.evaluate(() => { window.__voxelstrike.input.locked = true; });
  await client.evaluate(() => { window.__voxelstrike.input.locked = true; });

  const counts = await Promise.all([
    host.evaluate(() => window.__voxelstrike.enemies.list.length),
    client.evaluate(() => window.__voxelstrike.enemies.list.length),
  ]);
  check(counts[0] === counts[1] && counts[0] > 0, `identical enemy rosters (${counts[0]})`);
  const puppets = await client.evaluate(() =>
    window.__voxelstrike.enemies.list.every((e) => e.puppet));
  check(puppets, 'client enemies are network puppets');

  // --- avatar streaming: move the host, watch it on the client ---------------
  await host.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.pos.set(g.player.pos.x + 3, g.player.pos.y, g.player.pos.z + 2);
  });
  await sleep(700);
  const avatar = await Promise.all([
    host.evaluate(() => {
      const p = window.__voxelstrike.player.pos;
      return { x: p.x, z: p.z };
    }),
    client.evaluate(() => {
      const r = window.__voxelstrike.net.remote;
      return { x: r.pos.x, z: r.pos.z, visible: r.mesh.visible };
    }),
  ]);
  const drift = Math.hypot(avatar[0].x - avatar[1].x, avatar[0].z - avatar[1].z);
  check(avatar[1].visible && drift < 1.5, `host avatar visible on client, drift ${drift.toFixed(2)}u`);

  // look at the partner and grab a screenshot
  await client.bringToFront();
  await client.evaluate(() => {
    const g = window.__voxelstrike;
    const r = g.net.remote;
    g.player.pos.set(r.pos.x + 3, r.pos.y, r.pos.z + 2.5);
    g.player.vel.set(0, 0, 0);
    g.player.yaw = Math.atan2(-(r.pos.x - g.player.pos.x), -(r.pos.z - g.player.pos.z));
    g.player.pitch = 0;
  });
  await sleep(350);
  await client.screenshot({ path: 'scripts/shots/coop-partner.png' });

  // --- puppet sync: an enemy's position matches across the wire --------------
  const sync = await Promise.all([
    host.evaluate(() => {
      const e = window.__voxelstrike.enemies.list.find((q) => q.alive);
      return { x: e.pos.x, z: e.pos.z };
    }),
    client.evaluate(() => {
      const e = window.__voxelstrike.enemies.list.find((q) => q.alive);
      return { x: e.pos.x, z: e.pos.z };
    }),
  ]);
  const edrift = Math.hypot(sync[0].x - sync[1].x, sync[0].z - sync[1].z);
  check(edrift < 2, `puppet enemy tracks host position (drift ${edrift.toFixed(2)}u)`);

  // --- client shot → host authority → echo back ------------------------------
  const targetIdx = await host.evaluate(() =>
    window.__voxelstrike.enemies.list.findIndex((q) => q.alive && q.kind === 'husk'));
  await client.evaluate((i) => {
    const g = window.__voxelstrike;
    g.applyEnemyHit(g.enemies.list[i], 30, 1, 0, false);
  }, targetIdx);
  await sleep(500);
  const hpAfter = await Promise.all([
    host.evaluate((i) => window.__voxelstrike.enemies.list[i].hp, targetIdx),
    client.evaluate((i) => window.__voxelstrike.enemies.list[i].hp, targetIdx),
  ]);
  check(hpAfter[0] === 15, `host applied the client's hit (hp ${hpAfter[0]})`);
  check(hpAfter[1] === 15, `client received the authoritative hp (${hpAfter[1]})`);

  const scoreBefore = await host.evaluate(() => window.__voxelstrike.score);
  await client.evaluate((i) => {
    const g = window.__voxelstrike;
    g.applyEnemyHit(g.enemies.list[i], 999, 1, 0, false);
  }, targetIdx);
  await sleep(500);
  const killSync = await Promise.all([
    host.evaluate((i) => {
      const g = window.__voxelstrike;
      return { alive: g.enemies.list[i].alive, score: g.score };
    }, targetIdx),
    client.evaluate((i) => {
      const g = window.__voxelstrike;
      return { alive: g.enemies.list[i].alive, score: g.score };
    }, targetIdx),
  ]);
  check(!killSync[0].alive && !killSync[1].alive, 'client kill registered on both sides');
  check(killSync[0].score > scoreBefore && killSync[1].score === killSync[0].score,
    `score is shared (${killSync[0].score})`);

  // --- voxel authority: client pops a barrel, both worlds agree --------------
  const barrel = await host.evaluate(() => {
    const g = window.__voxelstrike;
    for (let z = 0; z < g.world.sz; z++) {
      for (let x = 0; x < g.world.sx; x++) {
        if (g.world.get(x, 1, z) === 15) return { x, z };
      }
    }
    return null;
  });
  check(barrel !== null, 'a barrel exists');
  if (barrel) {
    await client.evaluate(({ x, z }) => {
      window.__voxelstrike.applyVoxelDamage(x, 1, z, 50);
    }, barrel);
    await sleep(800);
    const gone = await Promise.all([
      host.evaluate(({ x, z }) => window.__voxelstrike.world.get(x, 1, z) === 0, barrel),
      client.evaluate(({ x, z }) => window.__voxelstrike.world.get(x, 1, z) === 0, barrel),
    ]);
    check(gone[0] && gone[1], 'client-shot barrel broke in both worlds');
  }

  // --- pickup claims + shared keycard + ambush --------------------------------
  const keyIdx = await host.evaluate(() =>
    window.__voxelstrike.pickups.items.findIndex((p) => p.spec.kind === 'keyRed'));
  const enemiesBefore = await host.evaluate(() => window.__voxelstrike.enemies.list.length);
  await client.evaluate((i) => window.__voxelstrike.net.claimPickup(i), keyIdx);
  await sleep(600);
  const keyState = await Promise.all([
    host.evaluate((i) => {
      const g = window.__voxelstrike;
      return { has: g.player.keys.has('red'), taken: g.pickups.items[i].taken, enemies: g.enemies.list.length };
    }, keyIdx),
    client.evaluate((i) => {
      const g = window.__voxelstrike;
      return { has: g.player.keys.has('red'), taken: g.pickups.items[i].taken, enemies: g.enemies.list.length };
    }, keyIdx),
  ]);
  check(keyState[0].has && keyState[1].has, 'red keycard is shared by both players');
  check(keyState[0].taken && keyState[1].taken, 'key pickup consumed on both sides');
  check(
    keyState[0].enemies > enemiesBefore && keyState[0].enemies === keyState[1].enemies,
    `ambush spawned and replicated (${enemiesBefore} -> ${keyState[0].enemies})`
  );

  // --- sector clear syncs both screens ---------------------------------------
  await host.evaluate(() => {
    const g = window.__voxelstrike;
    for (const e of g.enemies.list) {
      if (e.alive) { e.pos.set(4, e.pos.y, 4); e.awake = false; e.state = 'idle'; e.wake = () => {}; }
    }
    const room = g.level.rooms.find((r) => r.kind === 'exit');
    let pad = null;
    for (let x = room.x; x < room.x + room.w && !pad; x++) {
      for (let z = room.z; z < room.z + room.d && !pad; z++) {
        if (g.world.get(x, 3, z) === 13) pad = { x, z };
      }
    }
    g.player.health = 200;
    g.player.dead = false;
    g.player.pos.set(pad.x + 0.5, 4.95, pad.z + 0.5);
    g.player.vel.set(0, 0, 0);
  });
  await sleep(1200);
  const inter = await Promise.all([
    host.evaluate(() => window.__voxelstrike.state),
    client.evaluate(() => window.__voxelstrike.state),
  ]);
  check(inter[0] === 'intermission' && inter[1] === 'intermission',
    `sector clear reached both screens (${inter[0]}/${inter[1]})`);

  // host clicks through → both descend to sector 2 with matching layouts
  await host.evaluate(() => document.exitPointerLock());
  await host.mouse.click(640, 360);
  await sleep(1500);
  const next = await Promise.all([
    host.evaluate(() => {
      const g = window.__voxelstrike;
      return { idx: g.levelIndex, state: g.state, enemies: g.enemies.list.length };
    }),
    client.evaluate(() => {
      const g = window.__voxelstrike;
      return { idx: g.levelIndex, state: g.state, enemies: g.enemies.list.length, puppets: g.enemies.list.every((e) => e.puppet) };
    }),
  ]);
  check(next[0].idx === 2 && next[1].idx === 2 && next[0].state === 'playing' && next[1].state === 'playing',
    'both players descended to sector 2');
  check(next[0].enemies === next[1].enemies && next[1].puppets,
    `sector 2 rosters match and stay puppeted (${next[0].enemies})`);

  // --- co-op death is a respawn, not a game over ------------------------------
  await client.evaluate(() => {
    const g = window.__voxelstrike;
    g.player.damage(9999, g);
  });
  await sleep(3400);
  const respawn = await client.evaluate(() => {
    const g = window.__voxelstrike;
    return { state: g.state, dead: g.player.dead, hp: g.player.health };
  });
  check(respawn.state === 'playing' && !respawn.dead && respawn.hp === 100,
    `client respawned after death (hp ${respawn.hp})`);

  // --- lobby UX: WASD is typeable in the code field, code shows beside HOST --
  const lobby = await browser.newPage();
  await lobby.goto(`${BASE}/?seed=1`, { waitUntil: 'networkidle0', timeout: 30000 });
  await lobby.waitForSelector('#coop-btn');
  await lobby.click('#coop-btn');
  await lobby.waitForSelector('#coop-code');
  await lobby.click('#coop-code');
  await lobby.type('#coop-code', 'wasd');
  const typed = await lobby.evaluate(() => document.querySelector('#coop-code').value);
  check(typed === 'WASD', `WASD is typeable in the join field ("${typed}")`);
  const moved = await lobby.evaluate(() => {
    // typing in the field must not leak into game movement input
    return window.__voxelstrike.input.forward === 0 && window.__voxelstrike.input.strafe === 0;
  });
  check(moved, 'typing the code does not move the player');
  await lobby.evaluate(() => window.__voxelstrike.hud.coopShowCode('KJ42'));
  const codeShown = await lobby.evaluate(() => {
    const el = document.querySelector('#coop-mycode');
    const btn = document.querySelector('#coop-host');
    const a = el.getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    return {
      text: el.textContent, visible: !el.hidden,
      color: getComputedStyle(el).color,
      heightDiff: Math.abs(a.height - b.height),
    };
  });
  check(
    codeShown.visible && codeShown.text === 'KJ42' &&
    codeShown.color === 'rgb(255, 208, 40)' && codeShown.heightDiff <= 3,
    `room code beside HOST, gold, button-sized (Δh ${codeShown.heightDiff.toFixed(1)}px)`
  );
  await lobby.screenshot({ path: 'scripts/shots/coop-lobby.png' });
  await lobby.close();
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors.slice(0, 25)) console.log(e);
  process.exit(1);
}
console.log('\nCO-OP TEST PASSED');
