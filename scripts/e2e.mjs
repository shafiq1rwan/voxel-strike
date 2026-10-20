/**
 * End-to-end campaign test: plays the critical path of all five sectors —
 * key pickup → locked door → elevator → exit pad — through the intermission
 * screens (and the facility terminal between sector 3 and the authored
 * Biofoundry, sector 4) to the campaign-complete screen. Also verifies enemy aggression,
 * the damage direction indicator, and exploding barrels.
 * Usage: node scripts/e2e.mjs [url]
 */
import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import { mkdirSync } from 'node:fs';

const URL = process.argv[2] ?? 'http://localhost:5173/?seed=12345';
const EDGE = process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const OUT = 'scripts/shots';
mkdirSync(OUT, { recursive: true });

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
  const forceLock = () => page.evaluate(() => {
    window.__voxelstrike.input.locked = true;
  });
  await forceLock();

  // --- enemy aggression + damage direction indicator ------------------------
  await page.evaluate(() => {
    const g = window.__voxelstrike;
    const e = g.enemies.list.find((q) => q.alive);
    // stand in an actually-open cell next to the enemy (not inside a wall)
    const spots = [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5], [1.5, 1.5], [-1.5, -1.5]];
    let px = e.pos.x + 1.5, pz = e.pos.z;
    for (const [dx, dz] of spots) {
      const x = Math.floor(e.pos.x + dx), z = Math.floor(e.pos.z + dz);
      if (g.world.get(x, 1, z) === 0 && g.world.get(x, 2, z) === 0) {
        px = e.pos.x + dx;
        pz = e.pos.z + dz;
        break;
      }
    }
    g.player.pos.set(px, e.pos.y + 0.2, pz);
    g.player.vel.set(0, 0, 0);
  });
  await new Promise((r) => setTimeout(r, 400));
  // fire until a shot actually registers (first frames may stall on shader
  // compile under headless swiftshader, eating the click)
  let fired = false;
  for (let i = 0; i < 6 && !fired; i++) {
    const before = await page.evaluate(() => {
      const g = window.__voxelstrike;
      g.input.locked = true; // re-force in case a lock event flipped it
      // all ammo types: the opener's spawn room holds a shotgun, which may be picked up and equipped first
      const ammo = Object.values(g.player.ammo).reduce((s, v) => s + v, 0);
      return { ammo, weapon: g.weapons?.current, state: g.state, locked: g.input.locked };
    });
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 300));
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 100));
    const ammo = await page.evaluate(() => Object.values(window.__voxelstrike.player.ammo).reduce((s, v) => s + v, 0));
    fired = ammo < before.ammo;
    if (!fired) console.log(`  retry: shot did not register (diag=${JSON.stringify(before)})`);
  }
  check(fired, 'gunshot registered');
  // poll for the damage indicator while the enemy fights back
  let sawIndicator = false;
  for (let i = 0; i < 14; i++) {
    await new Promise((r) => setTimeout(r, 200));
    if (await page.evaluate(() => document.querySelector('.dmgind') !== null)) {
      sawIndicator = true;
      break;
    }
  }
  const enemyResult = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return {
      awakeCount: g.enemies.list.filter((q) => q.awake).length,
      hp: g.player.health,
    };
  });
  check(enemyResult.awakeCount > 0, `enemies woke to gunfire (awake=${enemyResult.awakeCount})`);
  check(enemyResult.hp < 100, `enemy damaged the player (hp=${enemyResult.hp})`);
  check(sawIndicator, 'damage direction indicator appeared');
  await page.screenshot({ path: `${OUT}/e2e-1-enemy.png` });

  // --- exploding barrel ------------------------------------------------------
  const barrelResult = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const BARREL = 15;
    let found = null;
    for (let z = 0; z < g.world.sz && !found; z++) {
      for (let x = 0; x < g.world.sx && !found; x++) {
        if (g.world.get(x, 1, z) === BARREL) found = { x, z };
      }
    }
    if (!found) return { found: false };
    // stand back, then shoot it via the same path a weapon uses
    g.player.health = 100;
    g.player.dead = false;
    g.player.pos.set(found.x + 0.5, 2.0, found.z + 6.5);
    g.player.vel.set(0, 0, 0);
    const broke = g.world.damageVoxel(found.x, 1, found.z, 50);
    if (broke !== null) g.onVoxelBroken(found.x, 1, found.z, broke);
    await new Promise((r) => setTimeout(r, 700));
    return {
      found: true,
      nowAir: g.world.get(found.x, 1, found.z) === 0,
      pending: g.pendingExplosions ? g.pendingExplosions.length : 0,
    };
  });
  check(barrelResult.found, 'a barrel exists in the level');
  if (barrelResult.found) {
    check(barrelResult.nowAir, 'barrel was destroyed and exploded');
  }
  await page.screenshot({ path: `${OUT}/e2e-2-barrel.png` });

  // --- play all seven sectors ------------------------------------------------
  const completeLevel = async (sector) => {
    // a boss sector: the Broodkeeper carries the keycard — kill it first
    const boss = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      const b = g.bossEnemy;
      if (!b) return null;
      const keyShown = () => g.pickups.items.some((p) => !p.taken && p.spec.kind === 'keyRed');
      const before = { obj: document.querySelector('#obj-text')?.textContent ?? '', key: keyShown() };
      b.coreOpen = true;
      b.lastHitCore = true;
      b.damage(99999, 0, 0, g);
      await new Promise((r) => setTimeout(r, 300));
      return { ...before, dead: !b.alive, keyAfter: keyShown(), obj2: document.querySelector('#obj-text')?.textContent ?? '' };
    });
    if (sector === 5) {
      check(!!boss, 'sector 5 has the Broodkeeper');
      check(boss && boss.obj === 'Kill the Broodkeeper' && !boss.key, `the objective is the boss and the keycard is held back ("${boss?.obj}")`);
      check(boss && boss.dead && boss.keyAfter && boss.obj2 === 'Find the red keycard', 'killing it drops the keycard and moves the objective on');
    }
    // heal + collect key
    const gotKey = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      g.player.health = 200;
      g.player.dead = false;
      const key = g.level.pickups.find((p) => p.kind === 'keyRed');
      g.player.pos.set(key.x, key.y + 0.4, key.z);
      g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 600));
      return g.player.keys.has('red');
    });
    check(gotKey, `sector ${sector}: red keycard collected`);

    const doorResult = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      const door = g.doors.find((d) => d.spec.locked === 'red');
      const dx = door.spec.dir === 'x' ? 1.6 : 0;
      const dz = door.spec.dir === 'x' ? 0 : 1.6;
      g.player.pos.set(door.centerX() - dx, 2.0, door.centerZ() - dz);
      g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 2000));
      return { openT: door.openT, locked: door.locked };
    });
    check(doorResult.locked === null && doorResult.openT > 0.5, `sector ${sector}: locked door opened with the key`);

    let elevResult = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      elevResult = await page.evaluate(async () => {
        const g = window.__voxelstrike;
        const el = g.elevator;
        // the scripted rider doesn't fight back — clear the welcome party so a
        // 9-second AFK ride isn't a scripted death
        for (const e of g.enemies.list) {
          if (!e.alive) continue;
          const d = Math.hypot(e.pos.x - (el.spec.x + 1), e.pos.z - (el.spec.z + 1));
          if (d < 16) e.damage(9999, 0, 0, g);
        }
        g.player.dead = false;
        g.player.pos.set(el.spec.x + 1, el.topY + 0.95, el.spec.z + 1);
        g.player.vel.set(0, 0, 0);
        g.player.health = 200;
        const t0 = performance.now();
        while (performance.now() - t0 < 9000) {
          await new Promise((r) => setTimeout(r, 200));
          if (el.topY >= el.spec.highY - 0.01) break;
        }
        return {
          topY: el.topY, playerY: g.player.pos.y,
          hp: g.player.health, dead: g.player.dead, state: g.state,
          px: g.player.pos.x.toFixed(2), pz: g.player.pos.z.toFixed(2),
          ex: el.spec.x, ez: el.spec.z,
        };
      });
      if (elevResult.topY >= 3.9 && elevResult.playerY > 4.3) break;
      console.log(`  retry: elevator diag = ${JSON.stringify(elevResult)}`);
    }
    check(elevResult.topY >= 3.9, `sector ${sector}: elevator rose (topY=${elevResult.topY.toFixed(2)})`);
    check(elevResult.playerY > 4.3, `sector ${sector}: player carried up (${JSON.stringify(elevResult)})`);

    const endState = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      const room = g.level.rooms.find((r) => r.kind === 'exit');
      let pad = null;
      for (let x = room.x; x < room.x + room.w && !pad; x++) {
        for (let z = room.z; z < room.z + room.d && !pad; z++) {
          if (g.world.get(x, 3, z) === 13) pad = { x, z };
        }
      }
      if (!pad) return 'no-pad';
      g.player.pos.set(pad.x + 0.5, 4.95, pad.z + 0.5);
      g.player.vel.set(0, 0, 0);
      await new Promise((r) => setTimeout(r, 1200));
      return g.state;
    });
    return endState;
  };

  let sector4Occupied = 0;
  for (let sector = 1; sector <= 7; sector++) {
    const endState = await completeLevel(sector);
    if (sector < 7) {
      check(endState === 'intermission', `sector ${sector}: reached exit → intermission (state=${endState})`);
      // the sector-clear moment: a click skips the tally, then a perk card descends
      const clear = await page.evaluate(() => ({
        rank: document.querySelector('.sc-rank-letter')?.textContent ?? '',
        cards: document.querySelectorAll('.sc-perk').length,
      }));
      check(/^[SABC]$/.test(clear.rank) && clear.cards === 3, `sector ${sector}: clear screen ranks it ${clear.rank} and offers ${clear.cards} perks`);
      await page.mouse.click(640, 120); // skip the tally (anywhere but a card)
      let armedCard = false;
      for (let i = 0; i < 30 && !armedCard; i++) {
        await new Promise((r) => setTimeout(r, 100));
        armedCard = await page.evaluate(() => { const c = document.querySelector('.sc-perk'); return !!c && !c.disabled; });
      }
      await page.screenshot({ path: `${OUT}/e2e-3-sector${sector}-done.png` });
      const perkBefore = await page.evaluate(() => window.__voxelstrike.perks.size);
      await page.click('.sc-perk');
      check(armedCard && await page.evaluate((n) => window.__voxelstrike.perks.size === n + 1, perkBefore),
        `sector ${sector}: a perk was picked (${perkBefore + 1} owned)`);
      if (sector === 3) {
        // sector 3 → 4 goes through the facility terminal: it types, a click
        // prints the rest, the next click powers the screen off into sector 4
        await new Promise((r) => setTimeout(r, 1800));
        const typing = await page.evaluate(() => ({
          shown: !!document.querySelector('.term-screen'),
          text: document.querySelector('.term-body')?.textContent ?? '',
          state: window.__voxelstrike.state,
          built: window.__voxelstrike.levelIndex,
        }));
        check(typing.shown && typing.state === 'intermission', `sector 3 cleared → facility terminal (state=${typing.state})`);
        check(typing.text.length > 0 && !typing.text.includes('DESCENDING'), 'the terminal is still typing');
        check(typing.built === 4, 'sector 4 is set up behind the terminal');
        await page.screenshot({ path: `${OUT}/e2e-3b-terminal.png` });
        await page.mouse.click(640, 360); // print the rest
        await new Promise((r) => setTimeout(r, 200));
        const full = await page.evaluate(() => ({
          text: document.querySelector('.term-body')?.textContent ?? '',
          hint: document.querySelector('.term-hint')?.textContent ?? '',
          still: !!document.querySelector('.term-screen'),
        }));
        check(full.still && full.text.includes('BIOFOUNDRY') && full.text.includes('DESCENDING'), 'a click prints the whole message (and does not leave)');
        check(/to descend/i.test(full.hint), `then it asks to descend ("${full.hint}")`);
        const tankLine = full.text.match(/TANKS OCCUPIED \.+ (\d+) OF (\d+)/);
        check(!!tankLine && !full.text.includes('SCANNING'), `the message reports this run's tanks ("${tankLine?.[0] ?? 'missing'}")`);
        const counted = await page.evaluate(() => {
          const t = window.__voxelstrike.level.bio?.tanks ?? [];
          return [t.filter((q) => q.occupied).length, t.length];
        });
        check(!!tankLine && Number(tankLine[1]) === counted[0] && Number(tankLine[2]) === counted[1], `…and they match the generated sector (${counted[0]} of ${counted[1]})`);
        await new Promise((r) => setTimeout(r, 500)); // re-arm after the skip
        await page.mouse.click(640, 360); // descend
        await new Promise((r) => setTimeout(r, 300));
        check(await page.evaluate(() => document.querySelector('.term-screen')?.classList.contains('off') ?? false), 'descending powers the screen off');
        await new Promise((r) => setTimeout(r, 1300));
      } else {
        await new Promise((r) => setTimeout(r, 1500));
      }
      await forceLock();
      const info = await page.evaluate(() => {
        const g = window.__voxelstrike;
        return {
          idx: g.levelIndex, state: g.state, enemies: g.enemies.aliveCount(),
          terminal: !!document.querySelector('.term-screen'),
          save: JSON.parse(localStorage.getItem('voxelstrike-run') || 'null'),
          theme: g.level.theme, tanks: g.level.bio?.tanks.length ?? 0,
          occupied: g.level.bio?.tanks.filter((t) => t.occupied).length ?? 0,
          dormant: g.enemies.list.filter((e) => e.kind === 'vatborn' && e.dormant).length,
          labFloor: g.world.get(Math.floor(g.level.spawn.x), 0, Math.floor(g.level.spawn.z)) === 24,
          kinds: [...new Set(g.enemies.list.map((e) => e.kind))],
          heat: (() => { let n = 0; for (let z = 0; z < g.world.sz; z++) for (let x = 0; x < g.world.sx; x++) if (g.world.get(x, 0, z) === 32) n++; return n; })(),
          banner: localStorage.getItem('voxelstrike-geothermal-seen'),
          termTanks: [...document.querySelectorAll('.term-line')].map((l) => l.textContent).find((t) => t.includes('TANKS')) ?? '',
        };
      });
      check(
        info.idx === sector + 1 && info.state === 'playing' && info.enemies > 0 && !info.terminal,
        `sector ${sector + 1} loaded (enemies=${info.enemies})`
      );
      if (sector === 3) {
        check(info.theme === 'biofoundry' && info.labFloor, `sector 4 is a generated Biofoundry (theme=${info.theme}, lab floor at spawn=${info.labFloor})`);
        check(info.tanks >= 4 && info.occupied >= 1 && info.dormant === info.occupied,
          `specimen tanks placed, a dormant Vatborn in each occupied one (${info.occupied}/${info.tanks}, dormant ${info.dormant})`);
        check(info.save?.sector === 4, `progress saved at sector 4 (${info.save?.sector})`);
        sector4Occupied = info.occupied;
        await page.screenshot({ path: `${OUT}/e2e-3c-sector4.png` });
      }
      if (sector === 4) {
        // sector 4 → 5 is an ordinary intermission: still the Biofoundry, a little harder
        check(info.theme === 'biofoundry', `sector 5 is still the Biofoundry (theme=${info.theme})`);
        check(info.occupied > sector4Occupied && info.dormant === info.occupied,
          `sector 5 fills more tanks (${info.occupied} vs ${sector4Occupied} in sector 4, dormant ${info.dormant})`);
        check(info.save?.sector === 5, `progress saved at sector 5 (${info.save?.sector})`);
        await page.screenshot({ path: `${OUT}/e2e-3d-sector5.png` });
      }
      if (sector === 5 || sector === 6) {
        // sectors 6-7: the Geothermal Core, generated like the rest, with its own monsters
        const n = sector + 1;
        check(info.theme === 'geothermal' && info.heat > 0, `sector ${n} is a generated Geothermal Core (theme=${info.theme}, ${info.heat} heat seam cells)`);
        check(['ventStalker', 'kilnDrone', 'cinderHulk'].every((k) => info.kinds.includes(k)),
          `sector ${n} fields the core's monsters (${info.kinds.join(', ')})`);
        check(info.save?.sector === n, `progress saved at sector ${n} (${info.save?.sector})`);
        if (n === 6) check(info.banner === '1', 'entering the core ends the NEW SECTOR banner');
        await page.screenshot({ path: `${OUT}/e2e-3e-sector${n}.png` });
      }
    } else {
      check(endState === 'won', `sector 7: campaign complete (state=${endState})`);
      const fin = await page.evaluate(() => ({
        head: document.querySelector('#sector-clear h1')?.textContent ?? '',
        rank: document.querySelector('.sc-rank-letter')?.textContent ?? '',
        perks: document.querySelectorAll('.sc-perk').length,
        owned: window.__voxelstrike.perks.size,
      }));
      check(fin.head.includes('CAMPAIGN COMPLETE') && /^[SABC]$/.test(fin.rank) && fin.perks === 0,
        `the last clear is CAMPAIGN COMPLETE, ranked ${fin.rank}, no perk offer`);
      check(fin.owned === 6, `six perks were collected over the run (${fin.owned})`);
      await page.screenshot({ path: `${OUT}/e2e-4-campaign.png` });
    }
  }

  // --- endless: Keep descending → depth 8, then a depth clear offers perks ----
  let descendReady = false;
  for (let i = 0; i < 60 && !descendReady; i++) {
    await new Promise((r) => setTimeout(r, 100));
    descendReady = await page.evaluate(() => { const b = document.querySelector('#descend-btn'); return !!b && !b.disabled; });
  }
  check(descendReady, 'the campaign-complete screen offers Keep descending');
  await page.click('#descend-btn');
  await new Promise((r) => setTimeout(r, 1500));
  await forceLock();
  const depth6 = await page.evaluate(() => {
    const g = window.__voxelstrike;
    return {
      idx: g.levelIndex, state: g.state, theme: g.level.theme,
      label: document.querySelector('#obj-label')?.textContent, num: document.querySelector('#obj-sector')?.textContent,
      save: JSON.parse(localStorage.getItem('voxelstrike-run') || 'null'),
      best: Number(localStorage.getItem('voxelstrike-best-depth') || 0),
    };
  });
  check(depth6.idx === 8 && depth6.state === 'playing' && depth6.theme === 'facility',
    `Keep descending → depth 8 (${depth6.theme}, state ${depth6.state})`);
  check(depth6.label === 'DEPTH' && depth6.num === '8', `the HUD reads DEPTH 8 (${depth6.label} ${depth6.num})`);
  check(depth6.save?.sector === 8 && depth6.best >= 8, `depth 8 is saved and recorded as the deepest (${depth6.save?.sector}, best ${depth6.best})`);
  await page.screenshot({ path: `${OUT}/e2e-5-depth8.png` });
  const endState6 = await completeLevel(8);
  const clear6 = await page.evaluate(() => ({
    rank: document.querySelector('.sc-rank-letter')?.textContent ?? '',
    cards: document.querySelectorAll('.sc-perk').length,
  }));
  check(endState6 === 'intermission' && clear6.cards === 3, `a depth clear ranks it (${clear6.rank}) and offers perks again (${clear6.cards})`);

  // --- the Biofoundry is generated fresh every run --------------------------
  const variety = await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const out = [];
    for (const seed of [12345, 777, 4242]) {
      g.baseSeed = seed;
      g.levelIndex = 4;
      g.buildLevel();
      g.state = 'playing';
      await new Promise((r) => setTimeout(r, 300)); // first frame spawns the tank occupants
      const b = g.level.bio;
      out.push({
        sig: g.level.rooms.map((r) => `${r.x},${r.z},${r.w},${r.d}`).join('|'),
        theme: g.level.theme,
        tanks: b?.tanks.length ?? 0,
        occupied: b?.tanks.filter((t) => t.occupied).length ?? 0,
        dormant: g.enemies.list.filter((e) => e.kind === 'vatborn' && e.dormant).length,
        door: g.doors.some((d) => d.spec.locked === 'red'),
        key: g.level.pickups.some((p) => p.kind === 'keyRed'),
        lift: !!g.level.elevator && !!g.level.exitPad,
      });
    }
    return out;
  });
  check(new Set(variety.map((v) => v.sig)).size === variety.length, 'three runs → three different Biofoundry layouts');
  check(variety.every((v) => v.theme === 'biofoundry' && v.key && v.door && v.lift),
    'every Biofoundry layout has the keycard → red door → lift → pad phases');
  check(variety.every((v) => v.tanks >= 4 && v.occupied >= 1 && v.dormant === v.occupied),
    `every layout has tanks with dormant occupants (${variety.map((v) => `${v.occupied}/${v.tanks}`).join(', ')})`);

  // --- sector 5 is the same Biofoundry, slightly harder ---------------------
  const harder = await page.evaluate(() => {
    const g = window.__voxelstrike;
    const sum = { 4: { enemies: 0, occupied: 0 }, 5: { enemies: 0, occupied: 0 } };
    let theme5 = true;
    for (const seed of [12345, 777, 4242, 90210]) {
      for (const sector of [4, 5]) {
        g.baseSeed = seed;
        g.levelIndex = sector;
        g.buildLevel();
        sum[sector].enemies += g.level.totalEnemies;
        sum[sector].occupied += g.level.bio?.tanks.filter((t) => t.occupied).length ?? 0;
        if (sector === 5 && g.level.theme !== 'biofoundry') theme5 = false;
      }
    }
    return { sum, theme5 };
  });
  check(harder.theme5, 'sector 5 is always the Biofoundry theme');
  check(harder.sum[5].occupied > harder.sum[4].occupied,
    `sector 5 fills more tanks (${harder.sum[5].occupied} vs ${harder.sum[4].occupied} over 4 seeds)`);
  check(harder.sum[5].enemies > harder.sum[4].enemies,
    `sector 5 fields more enemies (${harder.sum[5].enemies} vs ${harder.sum[4].enemies} over 4 seeds)`);
} finally {
  await browser.close();
}

if (errors.length) {
  console.log('\n=== FAILURES ===');
  for (const e of errors) console.log(e);
  process.exit(1);
}
console.log('\nE2E TEST PASSED');
