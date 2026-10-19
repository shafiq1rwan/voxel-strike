import puppeteer from 'puppeteer-core';
import assert from 'node:assert/strict';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';
const browser=await puppeteer.launch({executablePath:process.env.VOXEL_BROWSER??'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true,
  args:['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'],defaultViewport:{width:1280,height:720}});
fakePointerLock(browser);
try {
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&/shader|THREE|WebGL/.test(m.text()))errors.push(m.text());});
  await page.goto(`${process.argv[2]??'http://127.0.0.1:5176/'}?sector6&seed=12345`,{waitUntil:'networkidle0'});
  const result=await page.evaluate(()=>{
    const g=window.__voxelstrike,checks={};g.state='paused';
    const setup=(kind,z=32,pz=29.4)=>{
      g.buildLevel();g.state='paused';g.player.health=100;g.player.armor=0;g.player.dead=false;g.player.buffs.shield=0;g.player.buffs.quad=0;
      g.player.pos.set(34,1.88,pz);g.player.vel.set(0,0,0);g.projectiles.reset();
      const e=g.enemies.list.find(e=>e.kind===kind);
      g.enemies.list.forEach(other=>{other.puppet=other!==e;});
      e.pos.set(34,1+e.half.y+(kind==='kilnDrone'?1:0),z);e.vel.set(0,0,0);e.awake=true;e.state='chase';e.attachBody(true);
      return e;
    };
    const tick=(e,n=1,projectiles=false)=>{for(let i=0;i<n;i++){g.time+=1/60;e.update(1/60,g);if(projectiles)g.projectiles.update(1/60,g);}};
    const until=(e,fn,max=300)=>{for(let i=0;i<max;i++){tick(e);if(fn())return true;}return false;};
    let e=setup('cinderHulk');
    checks.hulkWarning=until(e,()=>e.state==='attack'&&e.phase==='prep'&&e.phaseT>.72)&&e.mesh.getObjectByName('slam-warning-ring').visible&&e.geothermal.arms.every(a=>a.rotation.x>1.5)&&e.coreOpen;
    checks.hulkSlam=until(e,()=>e.phase==='recover')&&g.player.health===76;
    tick(e,30);checks.slamOnce=g.player.health===76;
    // the slam has a visible downswing: the wind-up ends in a strike phase
    // with the fists still high and the player untouched; damage lands at impact
    e=setup('cinderHulk');
    checks.hulkDownswing=until(e,()=>e.phase==='strike')&&g.player.health===100&&e.geothermal.arms.every(a=>a.rotation.x>1.5)&&
      (tick(e,6),e.phase==='strike'&&e.geothermal.arms.every(a=>a.rotation.x<2.4))&&until(e,()=>e.phase==='recover')&&g.player.health===76;
    e=setup('cinderHulk');until(e,()=>e.state==='attack'&&e.phaseT>.72);
    g.player.pos.x=37;until(e,()=>e.phase==='recover');checks.hulkDodge=g.player.health===100;
    e=setup('cinderHulk');until(e,()=>e.state==='attack'&&e.phaseT>.72);
    g.player.pos.y=3;until(e,()=>e.phase==='recover');checks.hulkJump=g.player.health===100;
    e=setup('ventStalker',32,27.5);
    checks.stalkerCrouch=until(e,()=>e.state==='charge'&&e.phase==='prep'&&e.phaseT>.42)&&e.body.position.y<-.07;
    checks.stalkerLeap=until(e,()=>e.phase==='move')&&e.vel.y>0;
    checks.stalkerHit=until(e,()=>e.phase==='recover')&&g.player.health===86;
    tick(e,25);checks.leapOnce=g.player.health===86;
    e=setup('ventStalker',32,27.5);until(e,()=>e.state==='charge'&&e.phase==='prep'&&e.phaseT>.45);
    g.player.pos.x=37.5;until(e,()=>e.phase==='recover');checks.stalkerDodge=g.player.health===100;
    e=setup('kilnDrone',32,25);
    checks.droneShot=until(e,()=>g.projectiles.liveList().some(p=>p[0]===3))&&e.coreOpen&&e.geothermal.plates.every(p=>Math.abs(p.rotation.y)>.7);
    for(let i=0;i<120;i++)g.projectiles.update(1/60,g);
    checks.slagDamage=g.player.health===86;
    e=setup('kilnDrone',23.5,19.5);tick(e,180,true);
    checks.doorBlocksAim=g.projectiles.liveList().every(p=>p[0]!==3)&&g.player.health===100;
    g.projectiles.spawn('slag',34,2,23,0,0,-1,9.5,false);
    for(let i=0;i<60;i++)g.projectiles.update(1/60,g);
    checks.doorBlocksSlag=g.player.health===100&&g.projectiles.liveList().every(p=>p[0]!==3);
    e=setup('cinderHulk');e.state='attack';e.phase='recover';e.phaseT=0;e.geothermal.pose(0);
    const before=e.hp,origin=e.pos.clone();origin.z+=4;origin.y+=.3;
    const dir=e.pos.clone().set(0,0,-1);
    g.weapons.hitscan(origin,dir,10,g,origin);checks.coreShot=before-e.hp===20;
    e.coreOpen=false;const armored=e.hp;e.damage(10,0,1,g);checks.closedArmor=armored-e.hp===7.5;
    const killed=g.kills;e.damage(99999,0,1,g);e.damage(99999,0,1,g);
    checks.death=e.state==='dead'&&!e.mesh.visible&&g.kills===killed+1;
    g.projectiles.spawn('slag',34,2,30,0,0,1,9,false);
    g.buildLevel();checks.reset=g.projectiles.liveList().length===0&&g.enemies.list.length===4&&g.enemies.list.every(e=>e.alive);
    checks.roster=g.level.enemies.map(e=>e.kind).sort().join(',')==='cinderHulk,kilnDrone,ventStalker,ventStalker';
    checks.legs=g.enemies.list.find(e=>e.kind==='ventStalker').body.children.filter(o=>o.name==='crawler-leg').length===4;
    checks.shutters=g.enemies.list.find(e=>e.kind==='kilnDrone').body.children.filter(o=>o.name==='hinged-teal-shutter').length===2;
    checks.exhausts=g.enemies.list.find(e=>e.kind==='kilnDrone').body.children.filter(o=>o.name==='square-exhaust-stack').length===3;
    return checks;
  });
  for(const [name,passed]of Object.entries(result))console.log(`${passed?'PASS':'FAIL'}: ${name}`);
  assert.deepEqual(errors,[]);assert.ok(Object.values(result).every(Boolean),'A geothermal monster behavior check failed');
}finally{await browser.close();}
