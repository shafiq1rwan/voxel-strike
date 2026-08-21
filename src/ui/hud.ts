import { Player } from '../entities/player';
import { WeaponSystem, WEAPONS } from '../weapons/weapons';
import { WeaponId } from '../types';
import { GameSettings, RESOLUTIONS } from '../core/settings';

const ORDER: WeaponId[] = ['pistol', 'shotgun', 'smg', 'rocket'];

const CSS = `
#hud, #hud * { box-sizing: border-box; font-family: 'Courier New', Courier, monospace; }
#hud {
  position: fixed; inset: 0; pointer-events: none; color: #cfd6e4;
  text-shadow: 1px 1px 0 #000, 2px 2px 0 rgba(0,0,0,.6);
}
#crosshair {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  font-size: 18px; color: #9fe8b0; transition: color .08s, transform .08s;
}
#crosshair.hit { color: #ff5040; transform: translate(-50%,-50%) scale(1.5); }
#crosshair.kill { color: #ff5040; transform: translate(-50%,-50%) scale(2); text-shadow: 0 0 10px rgba(255,80,64,.9); }
#lowvignette {
  position: absolute; inset: 0; opacity: 0; pointer-events: none; transition: opacity .5s;
  background: radial-gradient(ellipse at center, rgba(120,0,0,0) 52%, rgba(150,12,6,.55) 100%);
}
#lowvignette.on { opacity: 1; animation: lowpulse 1s infinite alternate; }
@keyframes lowpulse { from { opacity: .5; } to { opacity: 1; } }
#statbar {
  position: absolute; left: 0; right: 0; bottom: 0; display: flex;
  justify-content: space-between; align-items: flex-end; padding: 10px 18px;
  background: linear-gradient(to top, rgba(4,6,10,.92), rgba(4,6,10,0));
}
.stat { text-align: center; min-width: 90px; }
.stat .label { font-size: 11px; letter-spacing: 2px; color: #7d8699; }
.stat .value { font-size: 34px; font-weight: bold; line-height: 1; }
#hp.low .value { color: #ff4030; animation: pulse .5s infinite alternate; }
#hp .value { color: #e8524a; }
#armor .value { color: #4cc26a; }
#ammo .value { color: #d8b040; }
@keyframes pulse { from { opacity: 1; } to { opacity: .45; } }
#weaponname { font-size: 12px; letter-spacing: 3px; color: #9aa4ba; margin-bottom: 4px; }
#slots { display: flex; gap: 6px; justify-content: center; }
.slot {
  width: 26px; height: 20px; border: 1px solid #39404f; font-size: 11px;
  display: flex; align-items: center; justify-content: center; color: #4a5262;
  background: rgba(10,13,20,.7);
}
.slot.owned { color: #cfd6e4; border-color: #6a7488; }
.slot.active { color: #ffd028; border-color: #ffd028; }
#keys { display: flex; gap: 5px; margin-top: 6px; justify-content: center; min-height: 12px; }
.key { width: 18px; height: 10px; border: 1px solid #000; opacity: .15; }
.key.red { background: #ff3428; } .key.blue { background: #3878ff; } .key.yellow { background: #ffd028; }
.key.have { opacity: 1; box-shadow: 0 0 6px currentColor; }
#messages {
  position: absolute; top: 14px; left: 18px; font-size: 15px; color: #e8ecf4;
  display: flex; flex-direction: column; gap: 3px;
}
#messages div { animation: msgfade 3.5s forwards; }
@keyframes msgfade { 0%,70% { opacity: 1; } 100% { opacity: 0; } }
#damageflash {
  position: absolute; inset: 0; background: radial-gradient(ellipse at center, rgba(255,30,10,0) 40%, rgba(255,30,10,.55) 100%);
  opacity: 0; transition: opacity .35s;
}
.dmgind {
  position: absolute; left: 50%; top: 50%; width: 0; height: 0;
  pointer-events: none; animation: dmgfade .8s forwards;
}
.dmgind .wedge {
  position: absolute; left: -26px; top: -108px; width: 0; height: 0;
  border-left: 26px solid transparent; border-right: 26px solid transparent;
  border-bottom: 18px solid rgba(255,44,24,.9);
  filter: drop-shadow(0 0 6px rgba(255,44,24,.7));
}
@keyframes dmgfade { 0%,45% { opacity: 1; } 100% { opacity: 0; } }
#pickupflash {
  position: absolute; inset: 0; background: rgba(255,230,140,.18); opacity: 0; transition: opacity .3s;
}
.screen {
  position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; background: rgba(4,6,10,.86); color: #cfd6e4;
  pointer-events: auto; cursor: pointer; z-index: 10; text-align: center;
}
.screen h1 { font-size: 52px; letter-spacing: 8px; margin: 0 0 8px; color: #e8524a;
  text-shadow: 3px 3px 0 #000, 0 0 24px rgba(232,82,74,.5); }
.screen h1.win { color: #4cc26a; text-shadow: 3px 3px 0 #000, 0 0 24px rgba(76,194,106,.5); }
.screen p { font-size: 15px; color: #8a94a8; margin: 4px 0; }
.screen .prompt { margin-top: 26px; font-size: 17px; color: #ffd028; animation: pulse .7s infinite alternate; }
.panel {
  position: relative; border: 1px solid #39404f; background: rgba(8,10,16,.82);
  padding: 34px 52px 30px;
}
.panel::before, .panel::after {
  content: ''; position: absolute; width: 14px; height: 14px;
  border-color: #ffd028; border-style: solid;
}
.panel::before { top: -1px; left: -1px; border-width: 2px 0 0 2px; }
.panel::after { bottom: -1px; right: -1px; border-width: 0 2px 2px 0; }
#fps { position: absolute; top: 10px; right: 14px; font-size: 12px; color: #566076; }

/* ---------------- full-screen menus (title, pause) ---------------- */
.tscreen {
  position: fixed; inset: 0; z-index: 10; color: #cfd6e4;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background:
    radial-gradient(ellipse at 50% 115%, rgba(5,6,10,0), rgba(5,6,10,.9) 72%),
    linear-gradient(rgba(5,6,10,.62), rgba(5,6,10,.38) 42%, rgba(5,6,10,.8));
}
.tscreen::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.24) 0 1px, transparent 1px 3px);
}
.title-center {
  display: flex; flex-direction: column; align-items: center;
  padding: 0 16px; max-width: 760px; width: 100%;
}
#title-logo {
  width: min(86vw, 660px); image-rendering: pixelated;
  filter: drop-shadow(0 6px 0 rgba(0,0,0,.55)) drop-shadow(0 0 26px rgba(255,208,40,.14));
}
.title-tag {
  margin-top: 10px; font-size: 12px; letter-spacing: .48em; text-indent: .48em;
  color: #8a94a8; text-transform: uppercase;
}
.title-mission { margin-top: 14px; font-size: 15px; color: #cfd6e4; letter-spacing: .06em; }
#pause-logo {
  width: min(58vw, 400px); image-rendering: pixelated;
  filter: drop-shadow(0 5px 0 rgba(0,0,0,.55));
}
#settings-logo {
  width: min(62vw, 430px); image-rendering: pixelated;
  filter: drop-shadow(0 5px 0 rgba(0,0,0,.55));
}
.setlist { margin-top: 26px; width: min(92vw, 540px); }
.setrow {
  display: flex; align-items: center; justify-content: space-between; gap: 20px;
  padding: 11px 4px; border-bottom: 1px solid #1c212c;
  font-size: 12px; letter-spacing: .18em; color: #8a94a8; text-transform: uppercase;
}
.setctl { display: flex; align-items: center; gap: 12px; }
.setval { min-width: 54px; text-align: right; color: #cfd6e4; font-weight: bold; letter-spacing: .1em; }
input[type=range].tslider {
  -webkit-appearance: none; appearance: none; width: 168px; height: 6px;
  background: #1a1f2b; border: 1px solid #000; cursor: pointer;
}
input[type=range].tslider::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 14px; height: 18px;
  background: #ffd028; border: 1px solid #000; box-shadow: 2px 2px 0 rgba(0,0,0,.6);
  cursor: pointer;
}
input[type=range].tslider::-moz-range-thumb {
  width: 14px; height: 18px; background: #ffd028; border: 1px solid #000;
  box-shadow: 2px 2px 0 rgba(0,0,0,.6); cursor: pointer; border-radius: 0;
}
input[type=range].tslider:focus-visible { outline: 2px solid #ffd028; outline-offset: 3px; }
.tbtn-mini { font-size: 11px; padding: 7px 16px; min-width: 92px; }
.sethint { font-size: 10px; letter-spacing: .12em; color: #566076; text-transform: none; }
.status-line {
  margin-top: 18px; font-size: 12px; letter-spacing: .18em; color: #566076;
  display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 20px;
}
.status-line b { color: #cfd6e4; font-weight: bold; }
.status-line .hz { color: #ffd028; }
.title-menu { margin-top: 34px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.tbtn {
  font-family: 'Courier New', Courier, monospace; font-weight: bold; cursor: pointer;
  letter-spacing: .22em; text-indent: .22em; text-transform: uppercase;
  background: rgba(10,13,20,.72); color: #cfd6e4; border: 1px solid #39404f;
}
.tbtn:focus-visible { outline: 2px solid #ffd028; outline-offset: 3px; }
.tbtn-primary {
  position: relative; font-size: 17px; padding: 15px 52px;
  color: #ffd028; border-color: #ffd028;
  transition: background .12s, color .12s;
}
.tbtn-primary::before, .tbtn-primary::after {
  content: ''; position: absolute; top: -1px; bottom: -1px; width: 9px;
  background: repeating-linear-gradient(45deg, #ffd028 0 4px, #14161e 4px 8px);
}
.tbtn-primary::before { left: -1px; }
.tbtn-primary::after { right: -1px; }
.tbtn-primary:hover { background: #ffd028; color: #0a0c12; }
.title-menu-row { display: flex; gap: 12px; }
.tbtn-quiet { font-size: 12px; padding: 9px 18px; color: #8a94a8; }
.tbtn-quiet:hover { color: #cfd6e4; border-color: #6a7488; }
.title-brief, .howto { margin-top: 34px; min-height: 58px; }
.title-brief {
  display: flex; align-items: center; justify-content: center; flex-wrap: wrap;
  gap: 10px 14px; font-size: 11.5px; letter-spacing: .14em; color: #8a94a8;
}
.title-brief .chip { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; }
.title-brief .sq {
  display: inline-block; width: 10px; height: 10px; border: 1px solid #000;
  box-shadow: 0 0 8px currentColor;
}
.title-brief .sep { color: #566076; }
.howto[hidden] { display: none; }
.howto {
  display: grid; grid-template-columns: auto auto; gap: 5px 22px;
  font-size: 12.5px; text-align: left; color: #8a94a8;
  border: 1px solid #232833; background: rgba(8,10,16,.7); padding: 16px 22px;
}
.howto b { color: #cfd6e4; font-weight: bold; letter-spacing: .1em; }
.howto .tip { grid-column: 1 / -1; color: #6f7a90; }
.howto .tip:first-of-type { margin-top: 8px; }
.title-foot {
  position: absolute; left: 18px; right: 18px; bottom: 13px;
  display: flex; justify-content: space-between; gap: 12px;
  font-size: 11px; letter-spacing: .12em; color: #566076;
}
@media (max-height: 560px) {
  .title-brief, .howto { margin-top: 16px; }
  .title-menu { margin-top: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .screen .prompt, #hp.low .value { animation: none; }
}
`;

export class HUD {
  private root: HTMLElement;
  private hpEl!: HTMLElement;
  private hpBox!: HTMLElement;
  private armorEl!: HTMLElement;
  private ammoEl!: HTMLElement;
  private weaponNameEl!: HTMLElement;
  private slotsEl!: HTMLElement;
  private keysEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private damageEl!: HTMLElement;
  private pickupEl!: HTMLElement;
  private crosshairEl!: HTMLElement;
  private fpsEl!: HTMLElement;
  private screenEl: HTMLElement | null = null;
  private hitTimer: number | null = null;
  private logoStop: (() => void) | null = null;
  private titleKey: ((ev: KeyboardEvent) => void) | null = null;

  constructor(parent: HTMLElement) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    this.root = document.createElement('div');
    this.root.id = 'hud';
    this.root.innerHTML = `
      <div id="damageflash"></div>
      <div id="lowvignette"></div>
      <div id="pickupflash"></div>
      <div id="crosshair">+</div>
      <div id="messages"></div>
      <div id="fps"></div>
      <div id="statbar">
        <div class="stat" id="hp"><div class="value">100</div><div class="label">HEALTH</div></div>
        <div class="stat" id="armor"><div class="value">0</div><div class="label">ARMOR</div></div>
        <div class="stat" id="center">
          <div id="weaponname">SIDEARM</div>
          <div id="slots"></div>
          <div id="keys">
            <div class="key red"></div><div class="key blue"></div><div class="key yellow"></div>
          </div>
        </div>
        <div class="stat" id="ammo"><div class="value">48</div><div class="label">AMMO</div></div>
      </div>
    `;
    parent.appendChild(this.root);
    this.hpBox = this.root.querySelector('#hp')!;
    this.hpEl = this.root.querySelector('#hp .value')!;
    this.armorEl = this.root.querySelector('#armor .value')!;
    this.ammoEl = this.root.querySelector('#ammo .value')!;
    this.weaponNameEl = this.root.querySelector('#weaponname')!;
    this.slotsEl = this.root.querySelector('#slots')!;
    this.keysEl = this.root.querySelector('#keys')!;
    this.messagesEl = this.root.querySelector('#messages')!;
    this.damageEl = this.root.querySelector('#damageflash')!;
    this.pickupEl = this.root.querySelector('#pickupflash')!;
    this.crosshairEl = this.root.querySelector('#crosshair')!;
    this.fpsEl = this.root.querySelector('#fps')!;
    for (let i = 0; i < 4; i++) {
      const s = document.createElement('div');
      s.className = 'slot';
      s.textContent = String(i + 1);
      this.slotsEl.appendChild(s);
    }
  }

  updateStats(p: Player): void {
    this.hpEl.textContent = String(Math.max(0, Math.ceil(p.health)));
    this.hpBox.classList.toggle('low', p.health <= 30);
    this.armorEl.textContent = String(Math.ceil(p.armor));
    this.keysEl.querySelectorAll('.key').forEach((el) => {
      const color = el.classList.contains('red') ? 'red' : el.classList.contains('blue') ? 'blue' : 'yellow';
      el.classList.toggle('have', p.keys.has(color));
    });
  }

  updateAmmo(p: Player, w: WeaponSystem): void {
    this.ammoEl.textContent = String(p.ammo[WEAPONS[w.current].ammoType]);
  }

  updateWeapon(w: WeaponSystem): void {
    this.weaponNameEl.textContent = WEAPONS[w.current].name;
    const slots = this.slotsEl.querySelectorAll('.slot');
    ORDER.forEach((id, i) => {
      slots[i].classList.toggle('owned', w.has(id));
      slots[i].classList.toggle('active', w.current === id);
    });
  }

  message(text: string): void {
    const div = document.createElement('div');
    div.textContent = text;
    this.messagesEl.appendChild(div);
    while (this.messagesEl.children.length > 4) this.messagesEl.firstChild?.remove();
    setTimeout(() => div.remove(), 3600);
  }

  damageFlash(): void {
    this.damageEl.style.opacity = '1';
    setTimeout(() => (this.damageEl.style.opacity = '0'), 90);
  }

  /** red wedge pointing toward the damage source; 0° = ahead, 90° = right */
  damageIndicator(angleDeg: number): void {
    const el = document.createElement('div');
    el.className = 'dmgind';
    el.style.transform = `rotate(${angleDeg.toFixed(1)}deg)`;
    el.innerHTML = '<div class="wedge"></div>';
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  pickupFlash(): void {
    this.pickupEl.style.opacity = '1';
    setTimeout(() => (this.pickupEl.style.opacity = '0'), 90);
  }

  hitMarker(): void {
    this.crosshairEl.classList.add('hit');
    if (this.hitTimer !== null) clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => this.crosshairEl.classList.remove('hit'), 90);
  }

  /** bigger, distinct confirmation when something dies */
  killMarker(): void {
    this.crosshairEl.textContent = '✕';
    this.crosshairEl.classList.add('kill');
    if (this.hitTimer !== null) clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => {
      this.crosshairEl.classList.remove('kill', 'hit');
      this.crosshairEl.textContent = '+';
    }, 170);
  }

  setLowHealth(on: boolean): void {
    this.root.querySelector('#lowvignette')!.classList.toggle('on', on);
  }

  setFPS(fps: number): void {
    this.fpsEl.textContent = `${fps.toFixed(0)} FPS`;
  }

  showTitle(opts: { seed: number; onStart: () => void; onSettings: () => void }): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.id = 'title-screen';
    el.className = 'tscreen';
    const seedHex = (opts.seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
    el.innerHTML = `
      <div class="title-center">
        <canvas id="title-logo"></canvas>
        <div class="title-tag">A Retro Voxel Shooter</div>
        <div class="title-mission">Three sectors down. One way out.</div>
        <div class="title-menu">
          <button id="start-btn" class="tbtn tbtn-primary">Enter the facility</button>
          <div class="title-menu-row">
            <button id="howto-btn" class="tbtn tbtn-quiet">How to play</button>
            <button id="title-settings-btn" class="tbtn tbtn-quiet">Settings</button>
          </div>
        </div>
        <div id="title-brief" class="title-brief">
          <span class="chip"><i class="sq" style="background:#ff3428;color:#ff3428"></i>FIND THE RED KEYCARD</span>
          <span class="sep">&#9656;</span>
          <span class="chip"><i class="sq" style="background:#8a94a8;color:#8a94a8"></i>OPEN THE VAULT</span>
          <span class="sep">&#9656;</span>
          <span class="chip"><i class="sq" style="background:#4cc26a;color:#4cc26a"></i>RIDE THE LIFT OUT</span>
        </div>
        <div id="howto-panel" class="howto" hidden>
          <b>WASD</b><span>Move</span>
          <b>MOUSE</b><span>Aim</span>
          <b>LEFT CLICK</b><span>Fire (hold to keep firing)</span>
          <b>SPACE</b><span>Jump</span>
          <b>1&ndash;4 / WHEEL</b><span>Switch weapon</span>
          <b>ESC</b><span>Release mouse, pause</span>
          <span class="tip">Green barrels explode and chain. Crates break open.</span>
          <span class="tip">A cracked wall hides a secret in every sector.</span>
          <span class="tip">Gunfire is loud &mdash; whatever hears it comes looking.</span>
        </div>
      </div>
      <div class="title-foot">
        <span>LAYOUT ${seedHex} &middot; GENERATED FRESH EVERY RUN</span>
        <span>VOXELSTRIKE 0.2</span>
      </div>
    `;
    document.body.appendChild(el);
    this.screenEl = el;
    // the gameplay HUD has no business on the menu
    this.root.style.visibility = 'hidden';

    this.logoStop = startVoxelLogo(el.querySelector('#title-logo') as HTMLCanvasElement, 'VOXELSTRIKE');

    el.querySelector('#start-btn')!.addEventListener('click', () => opts.onStart());
    el.querySelector('#title-settings-btn')!.addEventListener('click', () => opts.onSettings());
    const howto = el.querySelector('#howto-panel') as HTMLElement;
    const brief = el.querySelector('#title-brief') as HTMLElement;
    el.querySelector('#howto-btn')!.addEventListener('click', () => {
      const show = howto.hidden;
      howto.hidden = !show;
      brief.style.display = show ? 'none' : 'flex';
    });
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter') opts.onStart();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  showDeath(stats: string, onRestart: () => void): void {
    this.showScreen(`
      <h1>YOU DIED</h1>
      <p>${stats}</p>
      <div class="prompt">CLICK TO TRY AGAIN</div>
    `, onRestart);
  }

  showSettings(opts: {
    seed: number;
    settings: GameSettings;
    onApply: (s: GameSettings) => void;
    onNewLayout: () => void;
    onBack: () => void;
  }): void {
    this.hideScreen();
    const s: GameSettings = { ...opts.settings };
    const el = document.createElement('div');
    el.id = 'settings-screen';
    el.className = 'tscreen';
    const seedHex = (opts.seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
    el.innerHTML = `
      <div class="title-center">
        <canvas id="settings-logo"></canvas>
        <div class="title-tag">Tune The Machine</div>
        <div class="setlist">
          <div class="setrow">
            <label for="set-sens">Mouse sensitivity</label>
            <div class="setctl">
              <input id="set-sens" class="tslider" type="range" min="0.3" max="2.5" step="0.1" value="${s.sensitivity}">
              <span class="setval" id="val-sens"></span>
            </div>
          </div>
          <div class="setrow">
            <label for="set-vol">Master volume</label>
            <div class="setctl">
              <input id="set-vol" class="tslider" type="range" min="0" max="1" step="0.05" value="${s.volume}">
              <span class="setval" id="val-vol"></span>
            </div>
          </div>
          <div class="setrow">
            <label for="set-music">Music volume</label>
            <div class="setctl">
              <input id="set-music" class="tslider" type="range" min="0" max="1" step="0.05" value="${s.musicVolume}">
              <span class="setval" id="val-music"></span>
            </div>
          </div>
          <div class="setrow">
            <label for="set-fov">Field of view</label>
            <div class="setctl">
              <input id="set-fov" class="tslider" type="range" min="60" max="100" step="5" value="${s.fov}">
              <span class="setval" id="val-fov"></span>
            </div>
          </div>
          <div class="setrow">
            <label>Pixelation</label>
            <div class="setctl">
              <span class="sethint">chunkier &larr;&rarr; sharper</span>
              <button id="set-res" class="tbtn tbtn-quiet tbtn-mini"></button>
            </div>
          </div>
          <div class="setrow">
            <label>Screen shake</label>
            <div class="setctl">
              <button id="set-shake" class="tbtn tbtn-quiet tbtn-mini"></button>
            </div>
          </div>
          <div class="setrow">
            <label>Layout ${seedHex}</label>
            <div class="setctl">
              <span class="sethint">abandons the current run</span>
              <button id="set-newlayout" class="tbtn tbtn-quiet tbtn-mini">New layout</button>
            </div>
          </div>
        </div>
        <div class="title-menu">
          <button id="settings-back" class="tbtn tbtn-primary">Back</button>
        </div>
      </div>
      <div class="title-foot">
        <span>SETTINGS ARE SAVED ON THIS DEVICE</span>
        <span>VOXELSTRIKE 0.2</span>
      </div>
    `;
    document.body.appendChild(el);
    this.screenEl = el;
    this.root.style.visibility = 'hidden';
    this.logoStop = startVoxelLogo(el.querySelector('#settings-logo') as HTMLCanvasElement, 'SETTINGS', [176, 188, 210]);

    const q = <T extends HTMLElement>(sel: string): T => el.querySelector(sel) as T;
    const sens = q<HTMLInputElement>('#set-sens');
    const vol = q<HTMLInputElement>('#set-vol');
    const music = q<HTMLInputElement>('#set-music');
    const fov = q<HTMLInputElement>('#set-fov');
    const res = q<HTMLButtonElement>('#set-res');
    const shake = q<HTMLButtonElement>('#set-shake');

    const refresh = (): void => {
      q('#val-sens').textContent = s.sensitivity.toFixed(1);
      q('#val-vol').textContent = `${Math.round(s.volume * 100)}%`;
      q('#val-music').textContent = `${Math.round(s.musicVolume * 100)}%`;
      q('#val-fov').textContent = `${s.fov}°`;
      res.textContent = `${s.resolution}p`;
      shake.textContent = s.shake ? 'ON' : 'OFF';
    };
    const apply = (): void => {
      refresh();
      opts.onApply({ ...s });
    };
    refresh();

    sens.addEventListener('input', () => { s.sensitivity = Number(sens.value); apply(); });
    vol.addEventListener('input', () => { s.volume = Number(vol.value); apply(); });
    music.addEventListener('input', () => { s.musicVolume = Number(music.value); apply(); });
    fov.addEventListener('input', () => { s.fov = Number(fov.value); apply(); });
    res.addEventListener('click', () => {
      s.resolution = RESOLUTIONS[(RESOLUTIONS.indexOf(s.resolution) + 1) % RESOLUTIONS.length];
      apply();
    });
    shake.addEventListener('click', () => { s.shake = !s.shake; apply(); });
    q('#set-newlayout').addEventListener('click', () => opts.onNewLayout());
    q('#settings-back').addEventListener('click', () => opts.onBack());
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Escape') opts.onBack();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  /** between-levels screen */
  showIntermission(sector: number, stats: string, onNext: () => void): void {
    this.showScreen(`
      <h1 class="win">SECTOR ${sector} CLEARED</h1>
      <p>${stats}</p>
      <div class="prompt">CLICK TO DESCEND TO SECTOR ${sector + 1}</div>
    `, onNext);
  }

  showWin(stats: string, onRestart: () => void): void {
    this.showScreen(`
      <h1 class="win">CAMPAIGN COMPLETE</h1>
      <p>All sectors cleared. The facility is silent.</p>
      <p>${stats}</p>
      <div class="prompt">CLICK TO PLAY AGAIN</div>
    `, onRestart);
  }

  showPause(
    stats: {
      sector: number; totalSectors: number;
      kills: number; totalEnemies: number;
      secrets: number; totalSecrets: number;
      time: string; seed: number;
    },
    onResume: () => void,
    onNewRun: () => void,
    onSettings: () => void
  ): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.id = 'pause-screen';
    el.className = 'tscreen';
    const seedHex = (stats.seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
    el.innerHTML = `
      <div class="title-center">
        <canvas id="pause-logo"></canvas>
        <div class="title-tag">Standing By</div>
        <div class="status-line">
          <span>SECTOR <b class="hz">${stats.sector}</b> OF ${stats.totalSectors}</span>
          <span>KILLS <b>${stats.kills} / ${stats.totalEnemies}</b></span>
          <span>SECRETS <b>${stats.secrets} / ${stats.totalSecrets}</b></span>
          <span>TIME <b>${stats.time}</b></span>
        </div>
        <div class="title-menu">
          <button id="resume-btn" class="tbtn tbtn-primary">Resume</button>
          <div class="title-menu-row">
            <button id="pause-settings-btn" class="tbtn tbtn-quiet">Settings</button>
            <button id="pause-newrun-btn" class="tbtn tbtn-quiet">Abandon &amp; start new run</button>
          </div>
        </div>
      </div>
      <div class="title-foot">
        <span>LAYOUT ${seedHex}</span>
        <span>ESC RELEASED THE MOUSE &middot; ENTER OR RESUME TO CONTINUE</span>
      </div>
    `;
    document.body.appendChild(el);
    this.screenEl = el;
    this.root.style.visibility = 'hidden';
    this.logoStop = startVoxelLogo(el.querySelector('#pause-logo') as HTMLCanvasElement, 'PAUSED', [176, 188, 210]);
    el.querySelector('#resume-btn')!.addEventListener('click', () => onResume());
    el.querySelector('#pause-newrun-btn')!.addEventListener('click', () => onNewRun());
    el.querySelector('#pause-settings-btn')!.addEventListener('click', () => onSettings());
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter') onResume();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  hideScreen(): void {
    this.root.style.visibility = 'visible';
    this.logoStop?.();
    this.logoStop = null;
    if (this.titleKey) {
      window.removeEventListener('keydown', this.titleKey);
      this.titleKey = null;
    }
    this.screenEl?.remove();
    this.screenEl = null;
  }

  private showScreen(html: string, onClick: () => void): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `<div class="panel">${html}</div>`;
    el.addEventListener('click', () => onClick());
    document.body.appendChild(el);
    this.screenEl = el;
  }
}

// ---------------------------------------------------------------------------
// Voxel wordmark: the logo is literally built from extruded voxel "blocks"
// (5x7 pixel glyphs), assembled block by block like the mesher building a
// chunk, with an occasional lamp-style flicker afterwards.
// ---------------------------------------------------------------------------

const GLYPHS: Record<string, string[]> = {
  V: ['10001', '10001', '10001', '10001', '01010', '01010', '00100'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
};

function startVoxelLogo(
  canvas: HTMLCanvasElement,
  text: string,
  base: [number, number, number] = [255, 208, 40]
): () => void {
  const S = 8;          // canvas px per voxel
  const EX = 3;         // extrusion offset
  const ROWS = 7;
  const letterW = 5;
  const gap = 1;

  // collect voxel positions
  const voxels: Array<{ x: number; y: number }> = [];
  for (let li = 0; li < text.length; li++) {
    const glyph = GLYPHS[text[li]];
    if (!glyph) continue;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < letterW; c++) {
        if (glyph[r][c] === '1') voxels.push({ x: li * (letterW + gap) + c, y: r });
      }
    }
  }
  const gridW = text.length * (letterW + gap) - gap;
  canvas.width = (gridW + 2) * S;
  canvas.height = (ROWS + 2) * S;
  canvas.style.aspectRatio = `${canvas.width} / ${canvas.height}`;
  const ctx = canvas.getContext('2d')!;

  // face color per row: lit from above like the game's lamps
  const rowFace: string[] = [];
  for (let r = 0; r < ROWS; r++) {
    const f = 1.08 - r * 0.055;
    rowFace.push(
      `rgb(${Math.min(255, Math.round(base[0] * f))},${Math.min(255, Math.round(base[1] * f))},${Math.min(255, Math.round(base[2] * f))})`
    );
  }
  const extrude = `rgb(${Math.round(base[0] * 0.29)},${Math.round(base[1] * 0.29)},${Math.round(base[2] * 0.3)})`;

  const drawVoxel = (v: { x: number; y: number }, face: string): void => {
    const px = (v.x + 1) * S;
    const py = (v.y + 1) * S;
    ctx.fillStyle = extrude;
    ctx.fillRect(px + EX, py + EX, S, S);
    ctx.fillStyle = face;
    ctx.fillRect(px, py, S, S);
  };

  // assembly order: random, like chunk faces streaming in
  const order = voxels.slice();
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ASSEMBLE_MS = reduced ? 0 : 850;
  const t0 = performance.now();
  let raf = 0;
  let flickerIdx = -1;
  let flickerUntil = 0;
  let nextFlicker = t0 + 2200;

  const frame = (now: number): void => {
    const k = ASSEMBLE_MS === 0 ? 1 : Math.min(1, (now - t0) / ASSEMBLE_MS);
    const shown = Math.floor(order.length * (1 - Math.pow(1 - k, 2)));
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < shown; i++) {
      // the newest blocks land white-hot for a frame or two
      const fresh = k < 1 && i > shown - 5;
      drawVoxel(order[i], fresh ? '#fff2c8' : rowFace[order[i].y]);
    }
    if (k >= 1 && !reduced) {
      // ambient single-voxel flicker, like the facility's failing lamps
      if (now > nextFlicker) {
        flickerIdx = Math.floor(Math.random() * order.length);
        flickerUntil = now + 90;
        nextFlicker = now + 1800 + Math.random() * 2600;
      }
      if (flickerIdx >= 0 && now < flickerUntil) {
        const v = order[flickerIdx];
        ctx.fillStyle = `rgb(${Math.round(base[0] * 0.42)},${Math.round(base[1] * 0.42)},${Math.round(base[2] * 0.42)})`;
        ctx.fillRect((v.x + 1) * S, (v.y + 1) * S, S, S);
      }
    }
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}
