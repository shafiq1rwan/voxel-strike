/** Keyboard + pointer-lock mouse input. */
export class Input {
  private keys = new Set<string>();
  /** accumulated mouse delta since last frame */
  mouseDX = 0;
  mouseDY = 0;
  /** mouse buttons currently held (0 = left) */
  private buttons = new Set<number>();
  /** set on every left-button press so a fast tap between frames isn't lost */
  private firePressed = false;
  /** written by TouchControls on touch devices, merged into the getters below */
  readonly touchState = { moveX: 0, moveY: 0, fire: false, jump: false };
  /** number key / wheel weapon-switch request, consumed by weapons */
  switchRequest: number | null = null;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;
  onFirstInteract: (() => void) | null = null;
  private interacted = false;

  constructor(private lockTarget: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.fireInteract(); // keyboard counts as the first gesture too (audio init)
      this.keys.add(e.code);
      const num = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
      if (num >= 0) this.switchRequest = num;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('mousedown', (e) => {
      this.fireInteract();
      if (this.locked) {
        this.buttons.add(e.button);
        if (e.button === 0) this.firePressed = true;
      }
    });
    document.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    document.addEventListener('wheel', (e) => {
      if (!this.locked) return;
      this.switchRequest = e.deltaY > 0 ? -2 : -1; // -1 = prev, -2 = next
    });
    document.addEventListener('touchstart', () => this.fireInteract(), { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.lockTarget;
      if (!this.locked) this.buttons.clear();
      this.onLockChange?.(this.locked);
    });
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private fireInteract(): void {
    if (!this.interacted) {
      this.interacted = true;
      this.onFirstInteract?.();
    }
  }

  requestLock(): void {
    this.fireInteract();
    try {
      // returns a promise in Chromium; swallow rejections (e.g. headless or
      // re-locking too soon after ESC)
      const p = this.lockTarget.requestPointerLock() as unknown as Promise<void> | undefined;
      p?.catch?.(() => {});
    } catch {
      // pointer lock unavailable — game still runs, aim just won't capture
    }
  }

  down(code: string): boolean {
    return this.keys.has(code);
  }

  get forward(): number {
    const kb = (this.down('KeyW') ? 1 : 0) - (this.down('KeyS') ? 1 : 0);
    return Math.max(-1, Math.min(1, kb + this.touchState.moveY));
  }

  get strafe(): number {
    const kb = (this.down('KeyD') ? 1 : 0) - (this.down('KeyA') ? 1 : 0);
    return Math.max(-1, Math.min(1, kb + this.touchState.moveX));
  }

  get jump(): boolean {
    return this.down('Space') || this.touchState.jump;
  }

  get fire(): boolean {
    return this.buttons.has(0) || this.touchState.fire;
  }

  /** true once per left-button press since the last call (edge, not level) */
  consumeFirePress(): boolean {
    const p = this.firePressed;
    this.firePressed = false;
    return p;
  }

  /** used by touch fire button to register a press edge */
  pressFire(): void {
    this.firePressed = true;
  }

  /** consume mouse deltas for this frame */
  consumeMouse(): [number, number] {
    const d: [number, number] = [this.mouseDX, this.mouseDY];
    this.mouseDX = 0;
    this.mouseDY = 0;
    return d;
  }

  consumeSwitch(): number | null {
    const s = this.switchRequest;
    this.switchRequest = null;
    return s;
  }
}
