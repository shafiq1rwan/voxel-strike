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
  /** true while the body is CSS-rotated 90° (device held in portrait) */
  private forced = false;

  /** map raw screen touch coords into the (possibly rotated) game space */
  private mapXY(clientX: number, clientY: number): { x: number; y: number } {
    if (!this.forced) return { x: clientX, y: clientY };
    return { x: clientY, y: window.innerWidth - clientX };
  }

  constructor(container: HTMLElement, private input: Input, onPause: () => void) {
    // flips the HUD into its mobile layout (top status bar, thumb-corner UI)
    document.body.classList.add('touch-mode');

    const ui = document.createElement('div');
    ui.id = 'touchui';
    ui.innerHTML = `
      <div id="tjoy-zone"></div>
      <div id="tlook-zone"></div>
      <div id="tjoy-base"><div id="tjoy-knob"></div></div>
      <div id="tammo">–</div>
      <button id="tjump" class="tbtn-touch">JUMP</button>
      <button id="tfire" class="tbtn-touch">FIRE</button>
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

    const joyZone = ui.querySelector('#tjoy-zone') as HTMLElement;
    const lookZone = ui.querySelector('#tlook-zone') as HTMLElement;
    const fire = ui.querySelector('#tfire') as HTMLElement;
    const jump = ui.querySelector('#tjump') as HTMLElement;
    const pause = ui.querySelector('#tpause') as HTMLElement;

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
