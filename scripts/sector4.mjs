import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const base = process.argv[2] ?? 'http://127.0.0.1:5174/';
// --poki: against a Poki-mode server, assert that ?sector4 is ignored
const normalOnly = process.argv.includes('--poki');
const browser = await puppeteer.launch({
  executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 1280, height: 720 },
});
fakePointerLock(browser);
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (normalOnly) {
    // Verify build routing without depending on Poki's network/advertising services.
    await page.setRequestInterception(true);
    page.on('request', request => {
      if (request.url().includes('poki-sdk.js')) {
        void request.respond({ status:200, contentType:'application/javascript', body:
          'window.PokiSDK={init:()=>Promise.resolve(),gameLoadingFinished(){},gameplayStart(){},gameplayStop(){},measure(){},commercialBreak:()=>Promise.resolve()};' });
      } else void request.continue();
    });
  }
  // A preview must neither clear a real save nor write into the campaign leaderboard.
  await page.evaluateOnNewDocument(() => {
    if (window !== window.top) return;
    localStorage.setItem('voxelstrike-run', 'existing-campaign-save');
    localStorage.setItem('voxelstrike-best-00003039', '99999');
  });
  await page.goto(`${base}?sector4&seed=12345`, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.__voxelstrike);
  if (normalOnly) {
    assert.equal(await page.evaluate(() => window.__voxelstrike.levelIndex), 1);
    assert.equal(await page.$('#preview-start'), null);
    assert.equal(await page.evaluate(() => !!window.__voxelstrike.rendererSys.scene.getObjectByName('biofoundry-preview-art')), false);
    console.log('PASS: Poki build ignores ?sector4');
  } else {
    await page.waitForSelector('#preview-start');
    await new Promise(r => setTimeout(r, 800));
    await page.click('#preview-start');
    assert.equal(await page.evaluate(() => window.__voxelstrike.levelIndex), 4);
    assert.equal(await page.evaluate(() => localStorage.getItem('voxelstrike-run')), 'existing-campaign-save');
    // Navigation includes actual world obstacles and the complete locked doorway footprint.
    const paths = await page.evaluate(() => {
      const g = window.__voxelstrike, w = g.world;
      const d = g.level.doors.find(d => d.locked === 'red');
      const key = g.level.pickups.find(p => p.kind === 'keyRed');
      const canReach = (tx, tz, lock) => {
        const seen = new Set(), queue = [[Math.floor(g.level.spawn.x), Math.floor(g.level.spawn.z)]];
        for (let i = 0; i < queue.length; i++) {
          const [x,z] = queue[i];
          if(x === tx && z === tz) return true;
          for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx=x+dx,nz=z+dz,id=nx+nz*w.sx;
            if(seen.has(id) || !w.inBounds(nx,1,nz) || w.isSolid(nx,1,nz) || w.isSolid(nx,2,nz)) continue;
            if(lock && nx===d.x && (nz===d.z || nz===d.z+1)) continue;
            seen.add(id); queue.push([nx,nz]);
          }
        }
        return false;
      };
      return { key:canReach(Math.floor(key.x),Math.floor(key.z),true),
        locked:canReach(g.level.elevator.x,g.level.elevator.z,true),
        lift:canReach(g.level.elevator.x,g.level.elevator.z,false), rooms:g.level.rooms.length };
    });
    assert.deepEqual(paths, { key:true, locked:false, lift:true, rooms:7 });
    await page.evaluate(() => {
      const g=window.__voxelstrike;
      g.enemies.list.forEach(e => {e.puppet=true;});
      g.player.pos.set(38,1.9,50);
      g.player.yaw=0; g.player.pitch=0;
    });
    await new Promise(r=>setTimeout(r,350));
    mkdirSync('scripts/shots',{recursive:true});
    await page.screenshot({path:'scripts/shots/sector4-laboratory.png'});
    // Collect the key and open the actual door entity.
    await page.evaluate(() => {
      const g=window.__voxelstrike, k=g.level.pickups.find(p=>p.kind==='keyRed');
      g.player.pos.set(k.x,1.9,k.z); g.player.vel.set(0,0,0);
    });
    await page.waitForFunction(()=>window.__voxelstrike.player.keys.has('red'));
    await page.evaluate(() => {
      const g=window.__voxelstrike,d=g.doors.find(d=>d.spec.locked==='red');
      g.player.pos.set(d.centerX()+1.6,1.9,d.centerZ());g.player.vel.set(0,0,0);
    });
    await page.waitForFunction(()=>window.__voxelstrike.doors.find(d=>d.spec.locked==='red').openT>0.9);
    // Ride the same lift and reach the same exit-pad trigger used by the campaign.
    await page.evaluate(() => {
      const g=window.__voxelstrike,e=g.elevator;
      g.player.pos.set(e.spec.x+1,e.topY+0.95,e.spec.z+1);g.player.vel.set(0,0,0);
    });
    await page.waitForFunction(()=>window.__voxelstrike.elevator.topY>=3.99);
    await page.evaluate(() => {
      const g=window.__voxelstrike,p=g.level.exitPad;
      g.player.pos.set(p.x,4.95,p.z);g.player.vel.set(0,0,0);
    });
    await page.waitForFunction(()=>document.body.textContent.includes('BIOFOUNDRY CLEARED'));
    assert.equal(await page.evaluate(()=>localStorage.getItem('voxelstrike-run')),'existing-campaign-save');
    assert.equal(await page.evaluate(()=>localStorage.getItem('voxelstrike-best-00003039')),'99999');
    await new Promise(r=>setTimeout(r,800));
    await page.click('#preview-start');
    await page.waitForFunction(()=>window.__voxelstrike.state==='playing');
    assert.equal(await page.evaluate(()=>window.__voxelstrike.rendererSys.scene.children.filter(o=>o.name==='biofoundry-preview-art').length),1);
    await page.evaluate(()=>window.__voxelstrike.retrySector(false));
    assert.equal(await page.evaluate(()=>window.__voxelstrike.levelIndex),4);
    assert.equal(await page.evaluate(()=>localStorage.getItem('voxelstrike-run')),'existing-campaign-save');
    await page.setViewport({width:844,height:475,isMobile:true,hasTouch:true});
    await page.reload({waitUntil:'networkidle0'});
    await page.waitForSelector('#preview-start');
    await new Promise(r=>setTimeout(r,800));
    await page.click('#preview-start');
    await page.evaluate(()=>{const g=window.__voxelstrike;g.player.pos.set(38,1.9,50);g.player.yaw=0;g.enemies.list.forEach(e=>e.puppet=true);});
    await new Promise(r=>setTimeout(r,300));
    await page.screenshot({path:'scripts/shots/sector4-mobile.png'});
    await page.goto(`${base}?seed=12345`,{waitUntil:'networkidle0'});
    await page.waitForFunction(()=>!!window.__voxelstrike);
    assert.equal(await page.evaluate(()=>window.__voxelstrike.levelIndex),1);
    console.log('PASS: preview route, key gate, door, lift, completion, replay, retry, save isolation, mobile and normal campaign');
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close(); }
