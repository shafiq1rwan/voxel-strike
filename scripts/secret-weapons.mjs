import puppeteer from 'puppeteer-core';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
import { mkdir } from 'node:fs/promises';
const browser = await puppeteer.launch({ executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'], defaultViewport: { width: 1280, height: 720 } });
fakePointerLock(browser);
const errors = [];
try {
 const page = await browser.newPage();
 page.on('pageerror', e => errors.push(e.message));
 await page.goto(process.argv[2] ?? 'http://127.0.0.1:5175/?seed=12345', { waitUntil: 'networkidle0' });
 await page.click('#start-btn');
 await page.waitForFunction(() => window.__voxelstrike.state === 'playing');
 const result = await page.evaluate(async () => {
  const g = window.__voxelstrike;
  g.state = 'paused';
  const { generateLevel } = await import('/src/world/levelgen.ts');
  const results = [];
  const check = (ok, name) => { results.push(`${ok ? 'PASS' : 'FAIL'}: ${name}`); };
  for (let n = 1; n <= 5; n++) for (const seed of [12345, 42, 9876]) {
   const l = generateLevel(seed, n, n < 4 ? 'facility' : 'biofoundry', n === 5);
   const p = l.pickups.filter(p => p.kind === 'weaponSecret');
   check(!!l.secretRect && (p.length === 1 && p[0].secretSector === n && p[0].x >= l.secretRect.x && p[0].z >= l.secretRect.z), `sector ${n}, seed ${seed}: secret placement`);
  }
  const room = g.level.rooms.find(r => r.kind === 'arena');
  const x = room.cx + 0.5, z = room.cz + 0.5;
  for (let xx = Math.floor(x)-4; xx <= Math.floor(x)+4; xx++) for (let zz = Math.floor(z)-7; zz <= Math.floor(z)+2; zz++) for (let y=1;y<5;y++) g.world.set(xx,y,zz,0);
  g.player.spawnAt(x, 1.88, z); g.player.yaw = 0; g.player.pitch = 0;
  g.camera.rotation.set(0,0,0); g.camera.position.set(x,g.player.eyeY(),z); g.camera.updateMatrixWorld(true);
  g.input.releaseAll();
  for (let n=1;n<=5;n++) {
   g.enemies.reset();
   g.enemies.spawnFromSpecs([{kind:'brute',x,y:1.9,z:z-3,roomId:room.id},{kind:'brute',x,y:1.9,z:z-5,roomId:room.id}],g.level.rooms,g);
   for (const e of g.enemies.list) { e.pos.y = 2.2; e.hp=1000; e.awake=true; }
   g.levelIndex=n;
   g.pickups.tryCollect('weaponSecret',g,n);
   g.weapons.restoreLoadout(g.weapons.loadout().owned,'special');
   let draws = 0; g.weapons.models.get('special').traverse(o => { if (o.isMesh) draws++; });
   check(draws <= 12, `sector ${n}: model uses ${draws} draws (budget 12)`);
   const def = g.weapons.definition(); const ammo = g.player.ammo.special;
   g.weapons.fire(def,g);
   const immediate = g.enemies.list.map(e=>e.hp);
   if(n===4) { check(immediate[0]===1000,'spore damage is delayed'); g.weapons.update(0.9,g.input,g); }
   check(g.player.ammo.special===ammo-1,`${def.name}: consumes one special round`);
   check(g.enemies.list[0].hp<1000,`${def.name}: damages target`);
   if(n===1) check(g.enemies.list[0].vel.z < -5,'rivet knockback');
   if(n===3 || n===5) check(g.enemies.list[1].hp<1000,`${def.name}: hits second target`);
   const cp=g.makeCheckpoint(n); g.weapons.restoreSecret(0); g.player.ammo.special=0; g.applyCheckpoint(cp);
   check(g.weapons.secret===n-1 && g.player.ammo.special===ammo-1 && g.weapons.has('special'),`${def.name}: checkpoint restores weapon and ammo`);
   g.hud.updateWeapon(g.weapons);
   check(document.querySelectorAll('#slots .slot').length===6 || document.querySelectorAll('.slot').length===6,'six HUD slots');
  }
  // Lance and spore pods must stop at a solid wall.
  for(const n of [3,4]) {
   g.weapons.equipSecret(n); g.weapons.restoreLoadout(g.weapons.loadout().owned,'special');
   const e=g.enemies.list[0]; e.hp=1000;
   for(let xx=Math.floor(x)-1;xx<=Math.floor(x)+1;xx++) for(let y=1;y<5;y++) g.world.set(xx,y,Math.floor(z)-2,1);
   g.weapons.fire(g.weapons.definition(),g); if(n===4) g.weapons.update(0.9,g.input,g);
   check(e.hp===1000,`sector ${n} weapon blocked by walls`);
  }
  g.weapons.restoreLoadout(['pistol','special'],'pistol'); g.weapons.equipSecret(3);
  g.weapons.restoreLoadout(['pistol','special'],'pistol'); g.input.switchRequest=5; g.weapons.update(0.2,g.input,g);
  check(g.weapons.current==='special','key 6 selects prototype with only two owned weapons');
  g.player.ammo.special=0; g.input.fire=true; g.weapons.cooldown=0; g.weapons.update(0.02,g.input,g); g.input.fire=false;
  check(g.weapons.has('special') && g.weapons.lastThrown!=='special','empty prototype is retained for refills');
  g.weapons.clearSecretEffects(); check(g.weapons.pods.length===0,'transient effects clear for revive/retry');
  // A real pickup cannot be magnetized through a wall; opening it permits collection.
  g.pickups.add({kind:'weaponSecret',secretSector:2,x:x+2,y:1.4,z},g.world);
  const item=g.pickups.items.at(-1);
  for(let y=1;y<5;y++) g.world.set(Math.floor(x)+1,y,Math.floor(z),1);
  g.player.spawnAt(x,1.88,z); g.pickups.update(0.2,g.time,g);
  check(!item.taken && item.obj.position.x===x+2,'sealed wall prevents prototype magnetism');
  for(let y=1;y<5;y++) g.world.set(Math.floor(x)+1,y,Math.floor(z),0);
  g.player.spawnAt(x+2,1.88,z); g.pickups.update(0.02,g.time,g);
  check(item.taken && g.weapons.secret===1,'walking over prototype collects the sector-specific weapon');

  return results;
 });
 console.log(result.join('\n'));
 errors.push(...result.filter(r=>r.startsWith('FAIL')));
 await mkdir('scripts/shots',{recursive:true});
 for(let n=1;n<=5;n++) {
  await page.evaluate(n=>{const g=window.__voxelstrike; g.weapons.equipSecret(n); g.weapons.restoreLoadout(['pistol','special'],'special'); g.hud.updateWeapon(g.weapons); g.state='playing'; g.enemies.list.forEach(e=>e.alive=false); g.input.locked=true;},n);
  await new Promise(r=>setTimeout(r,150));
  await page.screenshot({path:`scripts/shots/secret-weapon-${n}.png`});
  await page.evaluate(()=>window.__voxelstrike.state='paused');
 }
 const mobile = await browser.newPage();
 await mobile.setViewport({width:844,height:390,isMobile:true,hasTouch:true});
 mobile.on('pageerror',e=>errors.push(e.message));
 await mobile.goto(process.argv[2] ?? 'http://127.0.0.1:5175/?seed=12345',{waitUntil:'networkidle0'});
 await mobile.click('#start-btn');
 await mobile.waitForFunction(()=>window.__voxelstrike.state==='playing');
 await mobile.evaluate(()=>{const g=window.__voxelstrike;g.state='paused';g.weapons.equipSecret(4);g.weapons.restoreLoadout(['pistol','special'],'special');g.hud.updateWeapon(g.weapons);g.hud.updateAmmo(g.player,g.weapons);});
 const touch=await mobile.evaluate(()=>({name:document.querySelector('#tweapon-name')?.textContent,slot:document.querySelector('#tweapon-num')?.textContent,overflow:document.documentElement.scrollWidth>window.innerWidth}));
 const ok=touch.name==='SPORE POPPER' && touch.slot==='6' && !touch.overflow;
 console.log(`${ok?'PASS':'FAIL'}: mobile prototype name, slot 6 and viewport fit`);if(!ok)errors.push(JSON.stringify(touch));
 await mobile.screenshot({path:'scripts/shots/secret-weapon-mobile.png'});
} finally { await browser.close(); }
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}
