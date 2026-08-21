import { Input } from './input';

export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
}

const JOY_RADIUS = 48;
const LOOK_SENS = 2.6;

/**
 * Mobile controls: left-thumb virtual joystick for movement, right-side drag
 * to look, FIRE / JUMP buttons, and a pause button (there is no pointer lock
 * on touch devices). Feeds the existing Input abstraction — the rest of the
 * game doesn't know touch exists.
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

  constructor(container: HTMLElement, private input: Input, onPause: () => void) {
    const ui = document.createElement('div');
    ui.id = 'touchui';
    ui.innerHTML = `
      <div id="tjoy-zone"></div>
      <div id="tlook-zone"></div>
      <div id="tjoy-base"><div id="tjoy-knob"></div></div>
      <button id="tjump" class="tbtn-touch">JUMP</button>
      <button id="tfire" class="tbtn-touch">FIRE</button>
      <button id="tpause" class="tbtn-touch">&#10073;&#10073;</button>
    `;
    container.appendChild(ui);
    this.base = ui.querySelector('#tjoy-base') as HTMLElement;
    this.knob = ui.querySelector('#tjoy-knob') as HTMLElement;

    const joyZone = ui.querySelector('#tjoy-zone') as HTMLElement;
    const lookZone = ui.querySelector('#tlook-zone') as HTMLElement;
    const fire = ui.querySelector('#tfire') as HTMLElement;
    const jump = ui.querySelector('#tjump') as HTMLElement;
    const pause = ui.querySelector('#tpause') as HTMLElement;

    joyZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.joyId !== null) return;
      const t = e.changedTouches[0];
      this.joyId = t.identifier;
      this.joyBaseX = t.clientX;
      this.joyBaseY = t.clientY;
      this.base.style.display = 'block';
      this.base.style.left = `${t.clientX - JOY_RADIUS}px`;
      this.base.style.top = `${t.clientY - JOY_RADIUS}px`;
      this.setKnob(0, 0);
    }, { passive: false });

    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (this.lookId !== null) return;
      const t = e.changedTouches[0];
      this.lookId = t.identifier;
      this.lookLastX = t.clientX;
      this.lookLastY = t.clientY;
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      let handled = false;
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.joyId) {
          handled = true;
          let dx = t.clientX - this.joyBaseX;
          let dy = t.clientY - this.joyBaseY;
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
          this.input.mouseDX += (t.clientX - this.lookLastX) * LOOK_SENS;
          this.input.mouseDY += (t.clientY - this.lookLastY) * LOOK_SENS;
          this.lookLastX = t.clientX;
          this.lookLastY = t.clientY;
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
    bindButton(fire, () => {
      this.input.touchState.fire = true;
      this.input.pressFire();
    }, () => {
      this.input.touchState.fire = false;
    });
    bindButton(jump, () => {
      this.input.touchState.jump = true;
    }, () => {
      this.input.touchState.jump = false;
    });
    bindButton(pause, () => onPause());

    // weapon slots in the HUD become tappable
    container.querySelectorAll('#slots .slot').forEach((slot, i) => {
      slot.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.switchRequest = i;
      }, { passive: false });
    });
  }

  private setKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
  }
}
