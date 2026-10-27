/** Deterministic Husk locomotion/attack checks and real-render pose captures.
 * node scripts/husk.mjs [url] [--capture-only] [--label=before]
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fakePointerLock } from './lib/fake-pointer-lock.mjs';

const url = process.argv.find((v) => /^https?:/.test(v)) ?? 'http://localhost:5173/?seed=12345';
const label = process.argv.find((v) => v.startsWith('--label='))?.slice(8) ?? 'after';
if (!/^[a-z0-9-]+$/i.test(label)) throw Error('Use a simple label');
const captureOnly = process.argv.includes('--capture-only');
mkdirSync('scripts/shots', { recursive: true });
const browser = await puppeteer.launch({
  executablePath: process.env.VOXEL_BROWSER ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'],
  defaultViewport: { width: 960, height: 720 },
});
fakePointerLock(browser);
const errors = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${msg}`); if (!ok) errors.push(msg); };
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.__voxelstrike);
  await page.evaluate(async () => {
    const g = window.__voxelstrike;
    const { Enemy } = await import('/src/entities/enemies.ts');
    g.state = 'paused';
    g.hud.hideScreen();
    g.hud.root.style.visibility = 'hidden';
    g.enemies.reset();
    g.doors = [];
    g.elevator = null;
    // Controlled, supported floor; retain the actual game renderer and physics.
    for (let x = 18; x <= 46; x++) for (let z = 18; z <= 46; z++) {
      g.world.setAndDirty(x, 0, z, 1);
      for (let y = 1; y <= 6; y++) g.world.setAndDirty(x, y, z, 0);
    }
    g.world.bakeLighting([80, 80, 80]);
    g.chunks.update();
    g.player.pos.set(32, 1.88, 24);
    g.player.vel.set(0, 0, 0);
    g.player.health = 10000;
    g.player.armor = 0;
    g.player.dead = false;
    window.__newHusk = () => {
      const e = new Enemy({ kind: 'husk', x: 32, z: 32, roomId: -1 }, null, 1, false);
      e.pos.y = 1.821;
      e.mesh.position.copy(e.pos);
      e.gait = 0;
      e.animPhase = 0;
      e.lungeCooldown = 999;
      e.mesh.rotation.y = 0;
      return e;
    };
  });

  if (!captureOnly) {
    const results = await page.evaluate(() => {
      const g = window.__voxelstrike;
      const run = (hz, seconds, setup) => {
        const e = window.__newHusk();
        setup(e);
        for (let i = 0; i < hz * seconds; i++) e.update(1 / hz, g);
        return e;
      };
      const idle = window.__newHusk();
      // No player in perception range, no movement, no walking in place.
      g.player.pos.z = 19;
      let minLeg = Infinity, maxLeg = -Infinity;
      for (let i = 0; i < 120; i++) {
        idle.update(1 / 60, g);
        if (i > 30) { minLeg = Math.min(minLeg, idle.legLG.rotation.x); maxLeg = Math.max(maxLeg, idle.legLG.rotation.x); }
      }
      const distances = [30, 60, 120].map((hz) => {
        g.player.pos.set(32, 1.88, 19);
        const e = run(hz, 1.5, (h) => { h.awake = true; h.state = 'chase'; });
        return Math.hypot(e.pos.x - 32, e.pos.z - 32);
      });
      const stopped = window.__newHusk();
      stopped.state = 'chase';
      stopped.awake = true;
      stopped.vel.set(0, 0, -3.2);
      // A desired velocity against an obstruction is not actual foot travel.
      for (let i = 0; i < 60; i++) stopped.animate(1 / 60, g);
      const runner = window.__newHusk();
      runner.awake = true;
      runner.state = 'chase';
      g.player.pos.set(32, 1.88, 19);
      let worstSole = 0;
      for (let i = 0; i < 90; i++) {
        runner.update(1 / 60, g);
        runner.mesh.updateMatrixWorld(true);
        const soles = [runner.huskKneeLG, runner.huskKneeRG].filter(Boolean).map((knee) => {
          const foot = knee.children[1];
          foot.geometry.computeBoundingBox();
          return foot.geometry.boundingBox.clone().applyMatrix4(foot.matrixWorld).min.y;
        });
        if (soles.length) worstSole = Math.max(worstSole, Math.abs(Math.min(...soles) - 1));
      }
      // Walk into a solid wall. Feet must stop cycling after collision stops travel.
      for (let x = 29; x <= 35; x++) for (let y = 1; y <= 3; y++) g.world.set(x, y, 30, 1);
      g.player.pos.set(32, 1.88, 26);
      const blocked = window.__newHusk();
      blocked.awake = true;
      blocked.state = 'chase';
      blocked.pos.z = 31.4;
      // Use a planted strike to distinguish actual displacement from a desired velocity.
      blocked.beginAttack('attack', g.player, g);
      let plantedMotion = 0;
      for (let i = 0; i < 20; i++) {
        blocked.update(1 / 60, g);
        if (i > 10) plantedMotion = Math.max(plantedMotion, Math.abs(blocked.legLG.rotation.x));
      }
      for (let x = 29; x <= 35; x++) for (let y = 1; y <= 3; y++) g.world.set(x, y, 30, 0);
      // A stationary target receives one claw hit, never one per frame.
      const attack = window.__newHusk();
      g.player.pos.set(32, 1.88, 30.4);
      const hp = g.player.health;
      attack.awake = true;
      attack.beginAttack('attack', g.player, g);
      for (let i = 0; i < 58; i++) attack.update(1 / 60, g);
      const damage = hp - g.player.health;
      const wind = window.__newHusk();
      wind.awake = true;
      wind.beginAttack('charge', g.player, g);
      for (let i = 0; i < 12; i++) wind.update(1 / 60, g);
      // Dodge after facing locks: a full swing must miss.
      const dodge = window.__newHusk();
      g.player.pos.set(32, 1.88, 30.4);
      dodge.awake = true;
      dodge.beginAttack('attack', g.player, g);
      // the facing locks 0.45 s into the 0.65 s pull-back (BEHAVIOURS.md): step away just after
      for (let i = 0; i < 30; i++) dodge.update(1 / 60, g);
      g.player.pos.set(33.6, 1.88, 32);
      const beforeDodge = g.player.health;
      for (let i = 0; i < 40; i++) dodge.update(1 / 60, g);
      return { idleSwing: maxLeg - minLeg, stoppedLeg: stopped.legLG.rotation.x, worstSole, distances, plantedMotion, damage, dodged: beforeDodge === g.player.health, windLean: wind.torsoG.rotation.x };
    });
    check(results.idleSwing < 0.01, `stationary Husk keeps its feet still (${results.idleSwing.toFixed(4)} rad)`);
    check(Math.abs(results.stoppedLeg) < 0.01, 'a blocked desired velocity does not drive the gait');
    check(results.worstSole < 0.02, `support foot stays at floor height (${results.worstSole.toFixed(4)}u error)`);
    check(Math.max(...results.distances) / Math.min(...results.distances) < 1.06, `chase distance consistent at 30/60/120 Hz (${results.distances.map((d) => d.toFixed(2)).join(', ')})`);
    check(results.plantedMotion < 0.04, `planted windup does not march (${results.plantedMotion.toFixed(3)} rad)`);
    check(results.damage === 10, `one claw deals damage exactly once (${results.damage})`);
    check(results.dodged, 'sidestepping the locked claw avoids damage');
    check(results.windLean < 0, 'lunge preparation leans forward toward local -Z');
  }

  // Actual model/render captures: a full sequence, not AI-generated art.
  for (const pose of ['idle', 'run', 'claw', 'lunge', 'recover']) {
    const data = await page.evaluate((pose) => {
      const g = window.__voxelstrike;
      const e = window.__newHusk();
      g.enemies.group.add(e.mesh);
      g.player.pos.set(32, 1.88, 22);
      e.awake = pose !== 'idle';
      e.state = pose === 'idle' ? 'idle' : 'chase';
      if (pose === 'claw' || pose === 'lunge' || pose === 'recover') {
        e.beginAttack(pose === 'claw' ? 'attack' : 'charge', g.player, g);
      }
      const frames = pose === 'claw' ? 22 : pose === 'lunge' ? 35 : pose === 'recover' ? 54 : 45;
      for (let i = 0; i < frames; i++) e.update(1 / 60, g);
      e.attachBody(true);
      e.mesh.updateMatrixWorld(true);
      g.camera.position.set(e.pos.x + 2.8, 2.7, e.pos.z - 4.2);
      g.camera.fov = 45;
      g.camera.updateProjectionMatrix();
      g.camera.lookAt(e.pos.x, 1.75, e.pos.z);
      g.rendererSys.renderer.render(g.rendererSys.scene, g.camera);
      const data = g.rendererSys.renderer.domElement.toDataURL('image/png');
      g.enemies.group.remove(e.mesh);
      return data;
    }, pose);
    writeFileSync(`scripts/shots/husk-${label}-${pose}.png`, Buffer.from(data.split(',')[1], 'base64'));
  }
  console.log(`Saved five ${label} pose captures in scripts/shots/`);
  if (!captureOnly) {
    const clip = await page.evaluate(async () => {
      const g = window.__voxelstrike;
      const canvas = g.rendererSys.renderer.domElement;
      const mimeType = 'video/webm;codecs=vp9';
      if (!MediaRecorder.isTypeSupported(mimeType)) return null;
      // Stop the normal paused frame from replacing the review camera.
      g.rendererSys.render = () => {};
      g.player.applyToCamera = () => {};
      const e = window.__newHusk();
      e.lungeCooldown = 0;
      g.enemies.group.add(e.mesh);
      const stream = canvas.captureStream(0);
      const track = stream.getVideoTracks()[0];
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 1800000 });
      const chunks = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const done = new Promise((resolve) => { recorder.onstop = resolve; });
      g.camera.position.set(35, 2.7, 26.5);
      g.camera.lookAt(32, 1.8, 30.5);
      g.player.pos.set(32, 1.88, 19);
      recorder.start();
      for (let frame = 0; frame < 210; frame++) {
        if (frame === 30) { g.player.pos.set(32, 1.88, 28.1); e.wake(g); }
        for (let step = 0; step < 2; step++) e.update(1 / 60, g);
        e.attachBody(true);
        g.rendererSys.renderer.render(g.rendererSys.scene, g.camera);
        track.requestFrame();
        await new Promise((resolve) => setTimeout(resolve, 1000 / 30));
      }
      recorder.stop();
      await done;
      stream.getTracks().forEach((t) => t.stop());
      const reader = new FileReader();
      return await new Promise((resolve) => {
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' }));
      });
    });
    if (clip) {
      writeFileSync(`scripts/shots/husk-${label}-motion.webm`, Buffer.from(clip.split(',')[1], 'base64'));
      console.log(`Saved actual motion recording: scripts/shots/husk-${label}-motion.webm`);
    }
  }
} finally {
  await browser.close();
}
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
