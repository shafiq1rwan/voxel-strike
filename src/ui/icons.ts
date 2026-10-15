/**
 * HUD icons as inline SVG. Font Awesome Free solid icons are imported from
 * the npm package and inlined at build time — no icon font, no CDN request —
 * so they work offline, in the PWA and on Poki (which wants a self-contained
 * build). Ammo rounds have no Font Awesome equivalent, so bullets/shells are
 * drawn here in the same flat, solid style.
 *
 * Font Awesome Free by @fontawesome — https://fontawesome.com
 * Icons licensed CC BY 4.0 (https://fontawesome.com/license/free).
 */
import type { IconDefinition } from '@fortawesome/fontawesome-common-types';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import { faShieldHalved } from '@fortawesome/free-solid-svg-icons/faShieldHalved';
import { faIdCard } from '@fortawesome/free-solid-svg-icons/faIdCard';
import { faDoorClosed } from '@fortawesome/free-solid-svg-icons/faDoorClosed';
import { faElevator } from '@fortawesome/free-solid-svg-icons/faElevator';
import { faFlagCheckered } from '@fortawesome/free-solid-svg-icons/faFlagCheckered';
import { faRocket } from '@fortawesome/free-solid-svg-icons/faRocket';
import { faBatteryFull } from '@fortawesome/free-solid-svg-icons/faBatteryFull';
import { faRightLeft } from '@fortawesome/free-solid-svg-icons/faRightLeft';

const C = 'currentColor';

function svg(viewW: number, viewH: number, size: number, body: string): string {
  const w = ((size * viewW) / viewH).toFixed(1);
  return `<svg class="ico" viewBox="0 0 ${viewW} ${viewH}" width="${w}" height="${size}" aria-hidden="true">${body}</svg>`;
}

/** a Font Awesome icon, `size` px tall */
function fa(def: IconDefinition, color: string, size: number): string {
  const [w, h, , , path] = def.icon;
  const d = Array.isArray(path) ? path.join(' ') : path;
  return svg(w, h, size, `<path fill="${color}" d="${d}"/>`);
}

/** three rifle rounds: pointed bodies over separate case heads */
function bullets(size: number): string {
  let body = '';
  for (const x of [0, 7.5, 15]) {
    body += `<path fill="#ffd028" d="M${x} 8 C${x} 3 ${x + 1.5} 0 ${x + 2.5} 0 C${x + 3.5} 0 ${x + 5} 3 ${x + 5} 8 V16 H${x} Z"/>`;
    body += `<rect fill="#c8a030" x="${x - 0.25}" y="17" width="5.5" height="3" rx="0.5"/>`;
  }
  return svg(20, 20, size, body);
}

/** two shotgun shells: red hulls on brass heads */
function shells(size: number): string {
  let body = '';
  for (const x of [0, 8.5]) {
    body += `<path fill="#ff3428" d="M${x} 2 Q${x} 0 ${x + 2} 0 H${x + 4.5} Q${x + 6.5} 0 ${x + 6.5} 2 V13.5 H${x} Z"/>`;
    body += `<rect fill="#c8a030" x="${x - 0.25}" y="14.5" width="7" height="5.5" rx="0.6"/>`;
  }
  return svg(15, 20, size, body);
}

export const ICONS = {
  health: (size = 20) => fa(faPlus, '#e8524a', size),
  armor: (size = 20) => fa(faShieldHalved, '#3a9cff', size),
  bullets: (size = 22) => bullets(size),
  shells: (size = 22) => shells(size),
  rockets: (size = 22) => fa(faRocket, '#ffd028', size),
  cells: (size = 22) => fa(faBatteryFull, '#55e0ff', size),
  /** objective / keycard icons take the current CSS color (lock / stage color) */
  keycard: (size = 18) => fa(faIdCard, C, size),
  door: (size = 18) => fa(faDoorClosed, C, size),
  lift: (size = 18) => fa(faElevator, C, size),
  pad: (size = 18) => fa(faFlagCheckered, C, size),
  /** touch weapon button: tap to cycle */
  swap: (size = 10) => fa(faRightLeft, C, size),
};

export type AmmoIcon = 'bullets' | 'shells' | 'rockets' | 'cells';
