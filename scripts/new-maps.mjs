import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
const base=process.argv[2]??'http://127.0.0.1:5176/';
const browser=await puppeteer.launch({executablePath:process.env.VOXEL_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'],defaultViewport:{width:1280,height:720}});
fakePointerLock(browser);
const poki=process.argv.includes('--poki');
const errors=[];
const check=(ok,msg)=>{console.log(`${ok?'PASS':'FAIL'}: ${msg}`);if(!ok)errors.push(msg);};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
mkdirSync('scripts/shots',{recursive:true});
try {
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
 if(poki) {
  await page.setRequestInterception(true);
  page.on('request',request=>request.url().includes('poki-sdk.js')?request.respond({status:200,contentType:'application/javascript',body:'window.PokiSDK={init:()=>Promise.resolve(),gameLoadingFinished(){},gameplayStart(){},gameplayStop(){},measure(){}};'}):request.continue());
  for(const theme of ['freight','excavation','medical']) {
   await page.goto(`${base}?map=${theme}`,{waitUntil:'networkidle0'});
   await page.waitForSelector('#start-btn');
   check(await page.evaluate(()=>window.__voxelstrike.level.theme==='facility'&&!window.__voxelstrike.preview),`Poki ignores map=${theme} shortcut`);
  }
 } else {
 await page.goto(base,{waitUntil:'networkidle0'});
 const generation=await page.evaluate(async()=>{
  const {generateLevel,validateLevel}=await import('/src/world/levelgen.ts');
  const results=[];
  for(const theme of ['freight','excavation','medical']) {
   let valid=true,stable=true,link=true,secrets=true,deterministic=true;
   for(const difficulty of [3,8]) for(const seed of [12345,42,777,90210]) {
    const l=generateLevel(seed,difficulty,theme), before=generateLevel(seed,difficulty,'facility');
    valid&&=validateLevel(l);link&&=!!l.powerLink;secrets&&=!!l.secretRect && l.secretWall.length>0;
    stable&&=l.architecture?.version===2 && l.rooms.find(r=>r.kind==='arena').h==={freight:12,excavation:16,medical:6}[theme];
    stable&&=JSON.stringify(l.rooms)!==JSON.stringify(before.rooms);
    const again=generateLevel(seed,difficulty,theme);
    deterministic&&=l.world.blocks.every((b,i)=>b===again.world.blocks[i]);
   }
   results.push({theme,valid,stable,link,secrets,deterministic});
  }
  return results;
 });
 for(const r of generation)for(const key of ['valid','stable','link','secrets','deterministic'])check(r[key],`${r.theme}: ${key} across 8 layouts`);
 for(const theme of ['freight','excavation','medical']) {
  await page.goto(`${base}?map=${theme}&seed=12345`,{waitUntil:'networkidle0'});
  await page.waitForSelector('#preview-start');
  await page.evaluate(()=>localStorage.setItem('voxelstrike-run','map-save-sentinel'));
  await page.click('#preview-start');await page.waitForFunction(()=>window.__voxelstrike.state==='playing');
  const data=await page.evaluate(()=>{const g=window.__voxelstrike;g.enemies.list.forEach(e=>e.puppet=true);g.input.locked=true;g.player.health=99999;return {theme:g.level.theme,link:!!g.level.powerLink,secret:!!g.level.secretRect,art:g.previewArt.group.name,beds:g.previewArt.group.userData.beds};});
  check(data.theme===theme && data.art===`${theme}-art` && (theme!=='medical'||data.beds>0),`${theme}: playable map and landmarks (beds ${data.beds})`);
  // Show the arena's complete landmark from its south side.
  await page.evaluate(()=>{const g=window.__voxelstrike,r=g.level.rooms.find(r=>r.kind==='arena');g.player.pos.set(r.cx+.5,1.9,r.z+r.d-2);g.player.vel.set(0,0,0);g.player.yaw=0;g.player.pitch=.12;g.hud.clearHint();});
  await sleep(180);await page.screenshot({path:`scripts/shots/map-${theme}.png`});
  if(theme==='medical' && !await page.evaluate(()=>!!window.__voxelstrike.level.architecture)) {
   await page.evaluate(()=>{const g=window.__voxelstrike;for(const r of g.level.rooms){for(const x of [r.x+2,r.x+r.w-4]){const z=r.z-1;if(g.world.get(x,1,z)===31&&g.world.get(x+1,1,z)===31&&g.world.get(x,2,z)===0){for(let dz=2;dz<=6;dz++) for(let dx=-2;dx<=3;dx++){const px=x+dx+.5,pz=z+dz+.5;if(g.world.isSolid(Math.floor(px),1,Math.floor(pz))||g.world.isSolid(Math.floor(px),2,Math.floor(pz))||!g.world.isSolid(Math.floor(px),0,Math.floor(pz)))continue;if(!g.hasLOS(px,2.52,pz,x+1,2.35,z+.5))continue;g.player.pos.set(px,1.9,pz);g.player.vel.set(0,0,0);g.player.yaw=Math.atan2(px-x-1,pz-z-.5);g.player.pitch=Math.atan2(2.35-g.player.eyeY(),Math.hypot(x+1-px,z+.5-pz));return;}}}}});
   await sleep(200);await page.screenshot({path:'scripts/shots/map-medical-ward.png'});
  }
  if(theme==='excavation'||theme==='freight') {
   const stairs=await page.evaluate((theme)=>{const g=window.__voxelstrike;g.state='paused';const runs=theme==='excavation'?[[20.5,49.5,1.88,60,4],[19.5,40.5,4.88,85,8]]:[[16.5,53,1.88,110,6]];const result=[];
    for(const[x,z,y,frames,top]of runs){g.player.pos.set(x,y,z);g.player.vel.set(0,0,0);g.player.onGround=true;g.player.yaw=0;g.input.releaseAll();g.input.touchState.moveY=1;for(let i=0;i<frames;i++)g.player.update(1/60,g.input,g,g.solidBoxes());result.push({top,y:g.player.pos.y,z:g.player.pos.z});}
    g.input.releaseAll();g.state='playing';return result;},theme);
   check(stairs.every(s=>s.y>=s.top+.7),`${theme}: stairs are walkable without jumping (${JSON.stringify(stairs)})`);
  }
  const puzzle=await page.evaluate(async()=>{const g=window.__voxelstrike,l=g.level.powerLink;
   const sealed=g.pickups.items.filter(p=>p.spec.sealed);
   const before=sealed.length===3 && sealed.every(p=>!p.taken);
   g.applyVoxelDamage(l.node.x,l.node.y,l.node.z,20);
   await new Promise(r=>setTimeout(r,1400));
   const after=sealed.every(p=>!p.spec.sealed);
   const hasBarrier=g.world.get(Math.floor(l.cage.ox+l.cage.ux*2+l.cage.nx),2,Math.floor(l.cage.oz+l.cage.uz*2+l.cage.nz))===31;
   return before&&after&&!hasBarrier;
  });check(puzzle,`${theme}: Power Link opens and unseals supplies`);
  const broken=await page.evaluate(()=>{const g=window.__voxelstrike,cells=[...g.level.secretWall];for(const [x,y,z]of cells)g.applyVoxelDamage(x,y,z,100);return cells.every(([x,y,z])=>g.world.get(x,y,z)!==12);});check(broken,`${theme}: cracked secret wall breaks`);
  // Actual key pickup, locked door, lift ride and exit.
  await page.evaluate(()=>{const g=window.__voxelstrike,k=g.pickups.items.find(p=>p.spec.kind==='keyRed');g.player.pos.copy(k.obj.position);g.player.vel.set(0,0,0);});
  await page.waitForFunction(()=>window.__voxelstrike.player.keys.has('red'));
  await page.evaluate(()=>{const g=window.__voxelstrike,d=g.doors.find(d=>d.spec.locked);g.player.pos.set(d.spec.x+.5,1.9,d.spec.z+.5);g.player.vel.set(0,0,0);});
  await page.waitForFunction(()=>window.__voxelstrike.doors.find(d=>d.spec.locked).isOpen);
  await page.evaluate(()=>{const g=window.__voxelstrike,e=g.elevator;g.player.pos.set(e.spec.x+1,e.topY+.95,e.spec.z+1);g.player.vel.set(0,0,0);});
  await page.waitForFunction(()=>window.__voxelstrike.elevator.topY>=3.99);
  await page.evaluate(()=>{const g=window.__voxelstrike,p=g.level.exitPad;g.player.pos.set(p.x,p.y+.95,p.z);g.player.vel.set(0,0,0);});
  await page.waitForSelector('#preview-start');check(true,`${theme}: key, locked door, lift and exit complete`);
  check(await page.evaluate(()=>localStorage.getItem('voxelstrike-run'))==='map-save-sentinel',`${theme}: campaign save untouched`);
  await page.click('#preview-start');await page.waitForFunction(()=>window.__voxelstrike.state==='playing');
  await page.evaluate(()=>window.__voxelstrike.retrySector(false));
  await page.waitForFunction(()=>window.__voxelstrike.state==='playing');
  check(await page.evaluate(()=>window.__voxelstrike.pickups.items.filter(p=>p.spec.sealed).length)===3,`${theme}: retry resets puzzle`);
 }
 // Confirm the endless rotation reaches each new environment.
 await page.goto(base,{waitUntil:'networkidle0'});await page.click('#start-btn');
 const rotation=await page.evaluate(async()=>{
  const g=window.__voxelstrike;g.state='paused';
  const depths=[8,9,11,12,13,15].map(n=>[n,g.themeFor(n)]);
  return {depths};
 });
 check(rotation.depths.some(([n,t])=>n===8&&t==='freight')&&rotation.depths.some(([n,t])=>n===11&&t==='excavation')&&rotation.depths.some(([n,t])=>n===12&&t==='medical')&&rotation.depths.some(([n,t])=>n===15&&t==='biofoundry'),'endless rotation includes new themes and keeps boss depths Biofoundry');
 await page.setViewport({width:844,height:390,isMobile:true,hasTouch:true});
 for(const theme of ['freight','excavation','medical']){
  await page.goto(`${base}?map=${theme}&seed=12345`,{waitUntil:'networkidle0'});await page.click('#preview-start');await page.waitForFunction(()=>window.__voxelstrike.state==='playing');
  check(await page.evaluate(()=>window.__voxelstrike.isTouch&&document.documentElement.scrollWidth<=innerWidth),`${theme}: mobile controls and viewport fit`);
  await page.screenshot({path:`scripts/shots/map-${theme}-mobile.png`});
 }
 }
}finally{await browser.close();}
assert.deepEqual(errors,[]);console.log('NEW MAPS TEST PASSED');
