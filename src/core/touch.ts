import { Input } from './input';
import { WEAPONS } from '../weapons/weapons';
import { WeaponId } from '../types';
import { ICONS } from '../ui/icons';

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

const JOY_RADIUS = 48;
// outside playtesters (2026-10-27): 2.6 turned too fast on phones; ~30% slower
const LOOK_SENS = 1.8;

// weapon button gestures
const HOLD_MS = 280; // hold this long (without swiping) to open the wheel
const SWIPE_PX = 26; // horizontal travel that counts as a swipe
const WHEEL_R = 110; // wheel radius around the button center
const WHEEL_DEAD = 34; // release this close to the center = cancel
const WHEEL_ITEM = 54; // item diameter (CSS .twheel-item)

/**
 * Mobile controls: left-thumb virtual joystick for movement, right-side drag
 * to look, FIRE / JUMP buttons, and a pause button (there is no pointer lock
 * on touch devices). Feeds the existing Input abstraction — the rest of the
 * game doesn't know touch exists.
 *
 * The weapon button (above JUMP, in reach of the right thumb): tap = next
 * owned weapon, swipe left/right = previous/next, hold = a wheel of owned
 * weapons — slide onto one and release to pick it.
 */
export class TouchControls {
  private joyId: number | null = null;
  private joyBaseX = 0;
  private joyBaseY = 0;
  private lookId: number | null = null;
  private lookLastX = 0;
  private lookLastY = 0;
  private base: HTMLElement;
  private knob: HTMLElement;
  /** true while the body is CSS-rotated 90° (device held in portrait) */
  private forced = false;
  // weapon button state
  private weaponBtn: HTMLElement;
  private wheel: HTMLElement;
  private wId: number | null = null;
  private wX0 = 0;
  private wSwiped = false;
  private wHold: number | null = null;
  private wheelItems: Array<{ id: WeaponId; x: number; y: number; el: HTMLElement }> = [];
  private wheelCx = 0;
  private wheelCy = 0;
  private wheelPick: WeaponId | null = null;

  /** map raw screen touch coords into the (possibly rotated) game space */
  private mapXY(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.forced) return { x: clientX, y: clientY };
    return { x: clientY, y: window.innerWidth - clientX };
  }

  constructor(
    container: HTMLElement, private input: Input, onPause: () => void, onMap: () => void,
    private getWeapons: () => { owned: WeaponId[]; current: WeaponId },
  ) {
    // flips the HUD into its mobile layout (top status bar, thumb-corner UI)
    document.body.classList.add('touch-mode');

    const ui = document.createElement('div');
    ui.id = 'touchui';
    ui.innerHTML = `
      <div id="tjoy-zone"></div>
      <div id="tlook-zone"></div>
      <div id="tjoy-base"><div id="tjoy-knob"></div></div>
      <div id="tammo"><i id="tammo-ico"></i><span id="tammo-num">–</span></div>
      <button id="tjump" class="tbtn-touch">JUMP</button>
      <button id="tfire" class="tbtn-touch">FIRE</button>
      <button id="tfire2" class="tbtn-touch">FIRE</button>
      <button id="tweapon" class="tbtn-touch">${ICONS.swap()}<span id="tweapon-num">1</span><span id="tweapon-name">SIDEARM</span></button>
      <div id="twheel"></div>
      <button id="tmap" class="tbtn-touch">MAP</button>
      <button id="tpause" class="tbtn-touch">&#10073;&#10073;</button>
    `;
    container.appendChild(ui);

    // forced landscape: when the device is held in portrait, the whole body
    // is CSS-rotated 90° so the game is always landscape — no reliance on the
    // OS auto-rotate setting (and it covers iOS, which can't lock orientation)
    const portrait = window.matchMedia('(orientation: portrait)');
    const applyOrientation = (isPortrait: boolean): void => {
      this.forced = isPortrait;
      document.body.classList.toggle('force-landscape', isPortrait);
      // the body box changed shape — let the renderer re-derive its aspect
      window.dispatchEvent(new Event('resize'));
    };
    applyOrientation(portrait.matches);
    portrait.addEventListener('change', (e) => applyOrientation(e.matches));
    this.base = ui.querySelector('#tjoy-base') as HTMLElement;
    this.knob = ui.querySelector('#tjoy-knob') as HTMLElement;
    this.weaponBtn = ui.querySelector('#tweapon') as HTMLElement;
    this.wheel = ui.querySelector('#twheel') as HTMLElement;

    this.weaponBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.wId !== null) return;
      const t = e.changedTouches[0];
      this.wId = t.identifier;
      this.wX0 = this.mapXY(t.clientX, t.clientY).x;
      this.wSwiped = false;
      this.wHold = window.setTimeout(() => this.openWheel(), HOLD_MS);
    }, { passive: false });

    const joyZone = ui.querySelector('#tjoy-zone') as HTMLElement;
    const lookZone = ui.querySelector('#tlook-zone') as HTMLElement;
    const fire = ui.querySelector('#tfire') as HTMLElement;
    const jump = ui.querySelector('#tjump') as HTMLElement;
    // a second FIRE above the move stick (outside playtesters, 2026-10-27): the
    // left thumb can shoot while the right keeps aiming. The touch BASH button
    // is gone (they found it clutter); desktop keeps V / right mouse.
    const fire2 = ui.querySelector('#tfire2') as HTMLElement;
    const pause = ui.querySelector('#tpause') as HTMLElement;
    const map = ui.querySelector('#tmap') as HTMLElement;

    joyZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      const t = e.changedTouches[0];
      const p = this.mapXY(t.clientX, t.clientY);
      this.joyId = t.identifier;
      this.joyBaseX = p.x;
      this.joyBaseY = p.y;
      this.base.style.display = 'block';
      this.base.style.left = `${p.x - JOY_RADIUS}px`;
      this.base.style.top = `${p.y - JOY_RADIUS}px`;
      this.setKnob(0, 0);
    }, { passive: false });

    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.lookId !== null) return;
      const t = e.changedTouches[0];
      const p = this.mapXY(t.clientX, t.clientY);
      this.lookId = t.identifier;
      this.lookLastX = p.x;
      this.lookLastY = p.y;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      let handled = false;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          handled = true;
          const p = this.mapXY(t.clientX, t.clientY);
          let dx = p.x - this.joyBaseX;
          let dy = p.y - this.joyBaseY;
          const len = Math.hypot(dx, dy);
          if (len > JOY_RADIUS) {
            dx = (dx / len) * JOY_RADIUS;
            dy = (dy / len) * JOY_RADIUS;
          }
          this.setKnob(dx, dy);
          this.input.touchState.moveX = dx / JOY_RADIUS;
          this.input.touchState.moveY = -dy / JOY_RADIUS;
        } else if (t.identifier === this.lookId) {
          handled = true;
          const p = this.mapXY(t.clientX, t.clientY);
          this.input.mouseDX += (p.x - this.lookLastX) * LOOK_SENS;
          this.input.mouseDY += (p.y - this.lookLastY) * LOOK_SENS;
          this.lookLastX = p.x;
          this.lookLastY = p.y;
        } else if (t.identifier === this.wId) {
          handled = true;
          this.weaponMove(this.mapXY(t.clientX, t.clientY));
        }
      }
      if (handled && e.cancelable) e.preventDefault();
    }, { passive: false });

    const release = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          this.joyId = null;
          this.input.touchState.moveX = 0;
          this.input.touchState.moveY = 0;
          this.base.style.display = 'none';
        } else if (t.identifier === this.lookId) {
          this.lookId = null;
        } else if (t.identifier === this.wId) {
          this.weaponRelease();
        }
      }
    };
    window.addEventListener('touchend', release);
    window.addEventListener('touchcancel', release);

    const bindButton = (el: HTMLElement, down: () => void, up?: () => void): void => {
      el.addEventListener('touchstart', (e) => {
        e.preventDefault();
        down();
      }, { passive: false });
      el.addEventListener('touchend', (e) => {
        e.preventDefault();
        up?.();
      }, { passive: false });
      el.addEventListener('touchcancel', () => up?.());
    };
    // either FIRE holds the trigger; it lets go when neither is held
    let firing = 0;
    for (const el of [fire, fire2]) {
      let held = false;
      bindButton(el, () => {
        if (!held) { held = true; firing++; }
        this.input.touchState.fire = true;
        this.input.pressFire();
      }, () => {
        if (held) { held = false; firing = Math.max(0, firing - 1); }
        this.input.touchState.fire = firing > 0;
      });
    }
    bindButton(jump, () => {
      this.input.touchState.jump = true;
    }, () => {
      this.input.touchState.jump = false;
    });
    bindButton(pause, () => onPause());
    bindButton(map, () => onMap());

    // weapon slots in the HUD become tappable
    container.querySelectorAll('#slots .slot').forEach((slot, i) => {
      slot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.switchRequest = i;
      }, { passive: false });
    });
  }

  /** thumb moved while on the weapon button: swipe, or steer the wheel */
  private weaponMove(p: { x: number; y: number }): void {
    if (this.wheelItems.length) {
      const dx = p.x - this.wheelCx;
      const dy = p.y - this.wheelCy;
      let pick: WeaponId | null = null;
      if (Math.hypot(dx, dy) > WHEEL_DEAD) {
        let best = Infinity;
        for (const it of this.wheelItems) {
          const d = Math.hypot(p.x - it.x, p.y - it.y);
          if (d < best) { best = d; pick = it.id; }
        }
      }
      if (pick !== this.wheelPick) {
        this.wheelPick = pick;
        for (const it of this.wheelItems) it.el.classList.toggle('pick', it.id === pick);
      }
      return;
    }
    const dx = p.x - this.wX0;
    if (!this.wSwiped && Math.abs(dx) > SWIPE_PX) {
      this.wSwiped = true;
      this.clearHold();
      this.input.switchRequest = dx > 0 ? -2 : -1; // -2 next, -1 previous
    }
  }

  private weaponRelease(): void {
    this.clearHold();
    if (this.wheelItems.length) {
      if (this.wheelPick) this.input.switchRequest = this.wheelPick === 'special' ? 5 : this.getWeapons().owned.filter((id) => id !== 'special').indexOf(this.wheelPick);
      this.closeWheel();
    } else if (!this.wSwiped) {
      this.input.switchRequest = -2; // tap: next owned weapon
    }
    this.wId = null;
  }

  private clearHold(): void {
    if (this.wHold !== null) window.clearTimeout(this.wHold);
    this.wHold = null;
  }

  /** fan the owned weapons out in an arc above the button (up-left, away from the edge) */
  private openWheel(): void {
    this.wHold = null;
    const { owned, current } = this.getWeapons();
    if (owned.length < 2 || this.wId === null) return;
    // layout coords (offsets ignore the force-landscape rotation, like mapXY)
    this.wheelCx = this.weaponBtn.offsetLeft + this.weaponBtn.offsetWidth / 2;
    this.wheelCy = this.weaponBtn.offsetTop + this.weaponBtn.offsetHeight / 2;
    const n = owned.length;
    const step = Math.min(35, 140 / (n - 1));
    this.wheel.textContent = '';
    this.wheelItems = owned.map((id, i) => {
      const a = ((120 + ((n - 1) / 2 - i) * step) * Math.PI) / 180;
      const x = this.wheelCx + Math.cos(a) * WHEEL_R;
      const y = this.wheelCy - Math.sin(a) * WHEEL_R;
      const el = document.createElement('div');
      el.className = 'twheel-item' + (id === current ? ' cur' : '');
      el.style.left = `${x - WHEEL_ITEM / 2}px`;
      el.style.top = `${y - WHEEL_ITEM / 2}px`;
      el.innerHTML = `${id === 'special' ? 6 : i + 1}<small>${WEAPONS[id].name}</small>`;
      this.wheel.appendChild(el);
      return { id, x, y, el };
    });
    this.wheelPick = null;
    this.wheel.classList.add('open');
  }

  private closeWheel(): void {
    this.wheelItems = [];
    this.wheelPick = null;
    this.wheel.classList.remove('open');
    this.wheel.textContent = '';
  }

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
