import puppeteer from 'puppeteer-core';
import { writeFileSync } from 'node:fs';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
const browser=await puppeteer.launch({executablePath:process.env.VOXEL_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
  args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'],defaultViewport:{width:1536,height:1024}});
fakePointerLock(browser);
try {
  const page=await browser.newPage();
  page.on('pageerror',e=>{throw e;});
  await page.goto(`${process.argv[2]??'http://127.0.0.1:5176/'}?sector6&seed=12345`,{waitUntil:'networkidle0'});
  const data=await page.evaluate(async()=>{
    const THREE=await import('/node_modules/three/build/three.module.js');
    const g=window.__voxelstrike;
    const renderer=new THREE.WebGLRenderer({antialias:false,preserveDrawingBuffer:true});
    renderer.outputColorSpace=THREE.LinearSRGBColorSpace;renderer.setSize(512,480);
    const sheet=document.createElement('canvas');sheet.width=1536;sheet.height=1024;
    const ctx=sheet.getContext('2d');ctx.fillStyle='#15212e';ctx.fillRect(0,0,1536,1024);
    ctx.textAlign='center';ctx.fillStyle='#c7bda7';ctx.font='bold 32px monospace';ctx.fillText('GEOTHERMAL CORE — ACTUAL GAME MODELS',768,49);
    const kinds=['cinderHulk','ventStalker','kilnDrone'];
    for(let i=0;i<3;i++) {
      const e=g.enemies.list.find(e=>e.kind===kinds[i]);e.attachBody(true);e.vel.set(0,0,0);
      for(let state=0;state<2;state++) {
        e.state=state?(i===1?'charge':'attack'):'idle';e.phase='prep';e.phaseT=state?[.96,.61,.9][i]:0;e.geothermal.pose(0);
        const model=e.body.clone(true);
        model.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.fog=false;}});
        const scene=new THREE.Scene();scene.background=new THREE.Color().setRGB(.064,.092,.13);
        scene.add(model);
        const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
        const span=Math.max(size.y*1.15,size.x*1.18,size.z*1.5,2.2);
        const camera=new THREE.OrthographicCamera(-span*.56,span*.56,span*.525,-span*.525,.01,100);
        camera.position.copy(center).add(new THREE.Vector3(4,2,-7));camera.lookAt(center);
        const floor=new THREE.Mesh(new THREE.BoxGeometry(5,.025,4),new THREE.MeshBasicMaterial({color:new THREE.Color().setRGB(.1,.15,.21)}));
        floor.position.set(0,bounds.min.y-.04,0);scene.add(floor);
        renderer.render(scene,camera);
        ctx.drawImage(renderer.domElement,i*512+(state?96:12),state?600:85,state?320:488,state?300:480);
        scene.traverse(o=>{if(o.isMesh)o.material.dispose();});floor.geometry.dispose();
      }
      ctx.strokeStyle='#44505d';ctx.strokeRect(i*512+8,72,496,936);
      ctx.fillStyle='#d3c5aa';ctx.font='bold 35px monospace';ctx.fillText(e.mesh.userData.monsterName,i*512+256,944);
      ctx.fillStyle='#8c9eae';ctx.font='20px monospace';ctx.fillText(['GROUND SLAM / CORE WINDOW','FOUR LEGS / TELEGRAPHED LEAP','TWO SHUTTERS / MOLTEN SHOT'][i],i*512+256,979);
    }
    renderer.dispose();return sheet.toDataURL();
  });
  writeFileSync('reference/geothermal-monsters-in-game-v1.png',Buffer.from(data.split(',')[1],'base64'));
  console.log('Saved reference/geothermal-monsters-in-game-v1.png');
  await page.setViewport({width:1280,height:720});
  for(const [kind,px,pz]of [['cinderHulk',31.5,32.5],['ventStalker',46,34.5],['kilnDrone',32,40]]) {
    await page.evaluate(({kind,px,pz})=>{
      const g=window.__voxelstrike;g.state='paused';g.previewMenuStop?.();g.hud.root.style.display='none';g.rendererSys.setResolution(720);
      const e=g.enemies.list.find(e=>e.kind===kind);
      g.enemies.list.forEach(other=>{other.mesh.visible=other===e;});
      e.attachBody(true);e.state='idle';e.phaseT=0;e.vel.set(0,0,0);e.geothermal.pose(0);e.updateLighting(g,1);
      e.mesh.rotation.y=Math.atan2(-(px-e.pos.x),-(pz-e.pos.z))+.35;e.mesh.position.copy(e.pos);
      g.player.pos.set(px,1.88,pz);g.player.yaw=Math.atan2(-(e.pos.x-px),-(e.pos.z-pz));
      g.player.pitch=Math.atan2(e.pos.y-g.player.eyeY(),Math.hypot(e.pos.x-px,e.pos.z-pz));g.player.shake=0;g.player.applyToCamera(g.camera,0);
      g.weapons.restoreLoadout(['pistol','shotgun','smg','rocket','arc'],'pistol');g.weapons.viewModel.visible=true;
      for(let i=0;i<30;i++)g.weapons.update(1/60,g.input,g);
    },{kind,px,pz});
    await new Promise(r=>setTimeout(r,150));await page.screenshot({path:`reference/geothermal-${kind}-in-game-v1.png`});
  }
}finally{await browser.close();}
