import puppeteer from 'puppeteer-core';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
const browser = await puppeteer.launch({ executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless:true,
  args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'], defaultViewport:{width:1672,height:941} });
fakePointerLock(browser);
try {
  const page=await browser.newPage();
  page.on('console',m=>{if(m.type()==='error')console.error(m.text());});
  await page.goto(`${process.argv[2]??'http://127.0.0.1:5176/'}?sector6&seed=12345`,{waitUntil:'networkidle0'});
  await new Promise(r=>setTimeout(r,800)); await page.click('#preview-start');
  const sign = await page.evaluate(()=>{
    const g=window.__voxelstrike;
    g.enemies.list.forEach(e=>{e.puppet=true;e.mesh.visible=false;});
    g.player.pos.set(30.2,1.9,46);g.player.vel.set(0,0,0);g.player.yaw=0;g.player.pitch=0;
    g.weapons.restoreLoadout(['pistol','shotgun','smg','rocket','arc'],'pistol');
    g.hud.root.style.display='none';g.rendererSys.setResolution(720);
    return g.rendererSys.scene.getObjectByName('geothermal-preview-art').children.find(o=>o.material?.map?.image?.height===160).material.map.image.toDataURL();
  });
  mkdirSync('scripts/shots',{recursive:true});
  writeFileSync('scripts/shots/sector6-sign.png',Buffer.from(sign.split(',')[1],'base64'));
  await new Promise(r=>setTimeout(r,650));
  await page.screenshot({path:'reference/geothermal-in-game-v2.png'});
  console.log('Saved reference/geothermal-in-game-v2.png');
} finally {await browser.close();}
