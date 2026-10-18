/**
 * Facility terminal text: a typed-out message shown between sectors (the
 * descent from sector 3 into the Biofoundry). Pure DOM + timers, no game
 * state; `HUD.showTerminal()` owns the screen around it.
 */

export interface TerminalLine {
  text: string;
  /** cmd = a typed command, out = system output, warn = hazard notice, final = the last word */
  kind?: 'cmd' | 'out' | 'warn' | 'final';
  /** extra hold after this line, ms */
  pause?: number;
}

export interface TerminalRun {
  /** typing has reached the end (naturally or via finish()) */
  readonly done: boolean;
  /** print everything that is left at once (a click while it types) */
  finish(): void;
  /** stop all timers (the screen went away) */
  stop(): void;
}

function lineEl(body: HTMLElement, l: TerminalLine): HTMLElement {
  const div = document.createElement('div');
  div.className = `term-line ${l.kind ?? 'out'}`;
  body.appendChild(div);
  return div;
}

/**
 * Type `lines` into `body` one character at a time. Dot leaders ("....")
 * type at triple speed so the long status lines don't drag. `onChar` fires
 * every couple of characters (the key-tick sound).
 */
export function typeLines(
  body: HTMLElement,
  lines: TerminalLine[],
  opts: { msPerChar: number; startDelay: number; onChar?: () => void; onDone: () => void },
): TerminalRun {
  let li = 0;
  let ci = 0;
  let cur: HTMLElement | null = null;
  let timer = 0;
  let done = false;
  let ticks = 0;
  const caret = document.createElement('span');
  caret.className = 'term-caret';

  const complete = (): void => {
    if (done) return;
    done = true;
    window.clearTimeout(timer);
    // the caret settles at the end of the last line and keeps blinking
    (cur ?? body).appendChild(caret);
    opts.onDone();
  };

  const step = (): void => {
    if (done) return;
    if (li >= lines.length) {
      complete();
      return;
    }
    const l = lines[li];
    if (!cur) cur = lineEl(body, l);
    if (ci < l.text.length) {
      const ch = l.text[ci++];
      cur.textContent = l.text.slice(0, ci);
      cur.appendChild(caret);
      if (ch !== ' ' && ch !== '.' && ++ticks % 2 === 0) opts.onChar?.();
      timer = window.setTimeout(step, ch === '.' ? opts.msPerChar / 3 : opts.msPerChar);
      return;
    }
    // end of line: hold, then the next one
    li++;
    ci = 0;
    cur = null;
    timer = window.setTimeout(step, 110 + (l.pause ?? 0));
  };

  timer = window.setTimeout(step, opts.startDelay);

  return {
    get done() {
      return done;
    },
    finish(): void {
      if (done) return;
      window.clearTimeout(timer);
      // complete the line in progress, then print the rest
      if (cur) cur.textContent = lines[li].text;
      for (let i = cur ? li + 1 : li; i < lines.length; i++) {
        cur = lineEl(body, lines[i]);
        cur.textContent = lines[i].text;
      }
      li = lines.length;
      complete();
    },
    stop(): void {
      done = true;
      window.clearTimeout(timer);
    },
  };
}
