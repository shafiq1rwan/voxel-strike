// Poki platform layer. Everything here is a no-op unless the game was built
// with `--mode poki` (npm run build:poki / dev:poki): POKI is a compile-time
// constant, so the regular build tree-shakes the SDK calls away entirely.
// The SDK script itself is injected into index.html by vite.config.ts.
//
// The SDK can also be missing in a Poki build (ad blockers drop the CDN
// script) — every call is guarded so the game still runs without it.

export const POKI = import.meta.env.MODE === 'poki';

interface PokiSDKApi {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  measure(category: string, what: string, action: string): void;
}

function sdk(): PokiSDKApi | undefined {
  if (!POKI) return undefined;
  return (window as unknown as { PokiSDK?: PokiSDKApi }).PokiSDK;
}

/** call the SDK, never letting an SDK failure take the game down */
function call(fn: (s: PokiSDKApi) => void): void {
  const s = sdk();
  if (!s) return;
  try {
    fn(s);
  } catch (err) {
    console.warn('[poki]', err);
  }
}

let active = false;

export const poki = {
  /** resolves either way — Poki wants the game to continue on init failure */
  async init(): Promise<void> {
    const s = sdk();
    if (!s) return;
    try {
      await s.init();
    } catch {
      // ad blocker / offline: keep going without ads
    }
  },

  /** level geometry is built and the title screen is up */
  loadingFinished(): void {
    call((s) => s.gameLoadingFinished());
  },

  /**
   * Gameplay start/stop, deduplicated: the game calls this every frame with
   * "is the player actively playing right now", and only the transitions
   * reach the SDK. That covers every route in and out of play (pause menu,
   * pointer-lock loss, death, intermission, context loss) in one place.
   */
  setPlaying(playing: boolean): void {
    if (playing === active) return;
    active = playing;
    call((s) => (playing ? s.gameplayStart() : s.gameplayStop()));
  },

  /**
   * Video ad at a natural break. `onStart` fires only if an ad actually
   * plays (mute audio there). Always resolves, ad or not.
   */
  async commercialBreak(onStart: () => void): Promise<void> {
    const s = sdk();
    if (!s) return;
    try {
      await s.commercialBreak(onStart);
    } catch {
      // treat a failed ad like no ad
    }
  },

  /** game event for Poki's funnels — never use '/' or '^' in any part */
  measure(category: string, what: string | number, action: string): void {
    call((s) => s.measure(category, String(what), action));
  },
};

/**
 * Poki requirement: arrow keys / space / wheel must never scroll the host
 * page around the game iframe.
 */
export function blockPageScroll(): void {
  const keys = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);
  window.addEventListener('keydown', (e) => {
    if (keys.has(e.code)) e.preventDefault();
  });
  window.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
}
