import { Player } from '../entities/player';
import { WeaponSystem, WEAPONS } from '../weapons/weapons';
import { WeaponId } from '../types';
import { GameSettings, RESOLUTIONS } from '../core/settings';
import { ICONS, AmmoIcon, perkColor, perkIcon } from './icons';
import type { OverloadReward } from '../entities/overload';
import { typeLines, type TerminalLine, type TerminalRun } from './terminal';
import type { OfferId } from '../core/perks';
import { SKINS, WEAPON_LABEL, needText, swatchHtml, STANDARD_SWATCH, type SkinDef } from '../core/skins';
import { startArmoryPreview } from './armory-preview';

const ORDER: WeaponId[] = ['pistol', 'shotgun', 'smg', 'rocket', 'arc'];
/** a slot's tiny label: which gun ended up there */
const SLOT_TAG: Record<WeaponId, string> = { pistol: 'PST', shotgun: 'SG', smg: 'SMG', rocket: 'RKT', arc: 'ARC' };

const CSS = `
#overload-action { position:absolute; left:50%; bottom:22%; transform:translateX(-50%); max-width:65vw; padding:10px 16px; border:1px solid #34d0ff; color:#8ee8ff; background:rgba(5,10,18,.9); font-weight:bold; font-size:13px; pointer-events:auto; touch-action:manipulation; z-index:7; }
#overload-action[hidden] { display:none; }
#overload-action:disabled { pointer-events:none; opacity:.9; }
.screen.overload-screen { box-sizing:border-box; padding:16px; overflow:hidden; }
.overload-screen .panel { box-sizing:border-box; display:flex; flex-direction:column; width:min(700px,100%); max-width:100%; max-height:100%; min-height:0; padding:28px; overflow:hidden; }
.overload-screen.offer-mode .panel { width:min(520px,100%); }
.overload-screen .panel::before { top:0; left:0; }
.overload-screen .panel::after { bottom:0; right:0; }
.overload-content { min-height:0; overflow-x:hidden; overflow-y:auto; scrollbar-gutter:stable both-edges; overscroll-behavior:contain; touch-action:pan-y; }
.screen.overload-screen .offer-label { color:#8a94a8; font-size:11px; letter-spacing:.15em; margin:0 0 8px; }
.screen.overload-screen h1 { font-size:30px; letter-spacing:3px; color:#65e5ff; }
.overload-screen .screen-btns { flex-direction:row; flex-wrap:wrap; justify-content:center; align-items:stretch; gap:10px; margin-top:16px; }
.overload-screen .reward { flex:1 1 150px; max-width:190px; min-width:0; padding:18px 12px; letter-spacing:.03em; white-space:normal; }
.overload-screen .reward-icon { display:flex; align-items:center; justify-content:center; gap:8px; height:32px; margin-bottom:12px; }
.overload-screen small { display:block; margin-top:8px; font-size:12px; line-height:1.5; font-weight:normal; color:#cfd6e4; }
.overload-screen .tradeoff { color:#ffd028; }
.screen.overload-screen .offer-summary { font-size:16px; line-height:1.6; color:#cfd6e4; margin:16px 0 24px; }
.overload-screen button:disabled { opacity:.4; cursor:default; }
@media(max-height:450px) { .overload-screen .panel { padding:14px; } .screen.overload-screen h1 { font-size:22px; } .overload-screen p { font-size:12px; } .overload-screen .reward { width:170px; padding:8px; font-size:12px; } .overload-screen small { margin-top:4px; } }
/* safe area: index.html asks for viewport-fit=cover (edge to edge, under the
   notch / rounded corners / home bar), so everything pinned to an edge adds
   these. They are 0 on desktops, notch-less phones and inside Poki's iframe.
   The crosshair, automap and centred panels never move. */
body {
  --sat: env(safe-area-inset-top, 0px); --sar: env(safe-area-inset-right, 0px);
  --sab: env(safe-area-inset-bottom, 0px); --sal: env(safe-area-inset-left, 0px);
}
/* a portrait phone rotated into landscape (body.force-landscape, 90° clockwise):
   the game's top is the device's right, its right the bottom, its bottom the
   left, its left the top (the notch) */
body.force-landscape {
  --sat: env(safe-area-inset-right, 0px); --sar: env(safe-area-inset-bottom, 0px);
  --sab: env(safe-area-inset-left, 0px); --sal: env(safe-area-inset-top, 0px);
}
#hud, #hud * { box-sizing: border-box; font-family: 'Courier New', Courier, monospace; }
#hud {
  position: fixed; inset: 0; pointer-events: none; color: #cfd6e4;
  text-shadow: 1px 1px 0 #000, 2px 2px 0 rgba(0,0,0,.6);
}
#crosshair {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 24px; height: 24px; color: #f0f2f6; text-shadow: none;
}
#hud #crosshair svg { display: block; overflow: visible; }
#crosshair path { fill: none; stroke: currentColor; stroke-width: 2; }
#crosshair path.crosshair-edge { stroke: #05060a; stroke-width: 4; stroke-opacity: .85; }
#crosshair .crosshair-marker {
  position: absolute; left: -4px; top: -4px; width: 32px; height: 32px;
  opacity: 0; color: #f0f2f6;
}
#crosshair.hit .crosshair-marker { opacity: 1; }
#crosshair.kill .crosshair-marker { opacity: 1; color: #ff5040; transform: scale(1.15); }
#crosshair.hs .crosshair-marker { color: #ffd028; }
#lowvignette {
  position: absolute; inset: 0; opacity: 0; pointer-events: none; transition: opacity .5s;
  background: radial-gradient(ellipse at center, rgba(120,0,0,0) 52%, rgba(150,12,6,.55) 100%);
}
#lowvignette.on { opacity: 1; animation: lowpulse 1s infinite alternate; }
@keyframes lowpulse { from { opacity: .5; } to { opacity: 1; } }
/* ---------------- in-game HUD: corner panels ---------------- */
.hpanel { background: rgba(8,10,16,.74); border: 1px solid #262c38; box-shadow: 0 2px 0 rgba(0,0,0,.35); }
.ico { display: block; filter: drop-shadow(1px 1px 0 rgba(0,0,0,.75)); }
@keyframes pulse { from { opacity: 1; } to { opacity: .45; } }
/* ---------------- facility terminal (sector 3 -> 4 descent) ---------------- */
.term-screen {
  position: fixed; inset: 0; z-index: 12; background: #05060a; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: calc(16px + var(--sat)) calc(16px + var(--sar)) calc(16px + var(--sab)) calc(16px + var(--sal));
  font-family: 'Courier New', Courier, monospace;
}
.term {
  position: relative; width: min(860px, 100%); max-height: 100%;
  display: flex; flex-direction: column; overflow: hidden;
  border: 1px solid #262c38; background: #070a10;
  box-shadow: inset 0 0 60px rgba(52,208,255,.07);
}
.term::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(0,0,0,.28) 0 1px, transparent 1px 3px);
  animation: termflicker 3.2s infinite steps(1);
}
.term-head {
  display: flex; justify-content: space-between; gap: 16px; padding: 7px 14px;
  font-size: 11px; font-weight: bold; letter-spacing: .2em; color: #05060a; background: #566076;
}
.term-body {
  padding: 16px 18px 6px; min-height: 0; overflow: hidden; text-align: left;
  font-size: 15px; line-height: 1.5; letter-spacing: .04em; white-space: pre-wrap;
  text-shadow: 0 0 6px rgba(124,224,255,.3);
  /* the whole message's height up front: the box never grows (and re-centres) while it types */
  min-height: calc(var(--term-lines, 12) * 1.5em + 22px);
}
.term-line { min-height: 1.5em; }
.term-line.cmd { color: #8ee8ff; }
.term-line.out { color: #a9b3c6; }
.term-line.warn { color: #ffd028; text-shadow: 0 0 6px rgba(255,208,40,.35); }
.term-line.final { color: #f0f2f6; font-weight: bold; }
.term-caret {
  display: inline-block; width: .6em; height: 1.05em; margin-left: 2px; vertical-align: -.15em;
  background: #8ee8ff; animation: termcaret .8s steps(1) infinite;
}
.term-foot { display: flex; justify-content: flex-end; padding: 6px 14px 10px; font-size: 11px; letter-spacing: .22em; color: #566076; }
.term-hint.ready { color: #ffd028; animation: pulse .7s infinite alternate; }
.term-screen.glitch .term { animation: termglitch .22s steps(2) 1; }
.term-screen.off { background: #000; }
.term-screen.off .term { animation: crtoff .48s cubic-bezier(.6,0,.9,.4) forwards; }
.transit-fade {
  position: fixed; inset: 0; z-index: 12; pointer-events: none; background: #000;
  animation: transitfade .9s ease-out forwards;
}
@keyframes termcaret { 0% { opacity: 1; } 50% { opacity: 0; } }
/* ---------------- sector clear: tally, rank stamp, perk choice ---------------- */
.sc-screen { overflow-y: auto; justify-content: flex-start; cursor: default; padding: 12px 0; }
.sc-screen > .sc-panel { margin: auto 0; flex-shrink: 0; width: min(780px, 94vw); padding: 24px 32px 20px; box-sizing: border-box; }
/* the title is centred on the panel on its own; the rank stamp is pinned to
   the right edge, centred on the title's line (centring the pair pushed the
   title off-centre) */
.sc-head { position: relative; display: flex; align-items: center; justify-content: center; min-height: 88px; padding: 0 100px; }
.sc-screen .sc-head h1 { margin: 0; font-size: 34px; line-height: 1; letter-spacing: 4px; text-indent: 4px; white-space: nowrap; text-align: center; }
.sc-rank {
  position: absolute; right: 0; top: calc(50% - 44px);
  width: 88px; height: 88px; border: 3px solid currentColor; box-sizing: border-box;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  opacity: 0; transform: scale(2.4) rotate(-12deg);
}
.sc-rank.stamp { animation: scstamp .32s cubic-bezier(.2,1.6,.4,1) forwards; }
.sc-rank-label { font-size: 10px; letter-spacing: .3em; text-indent: .3em; }
.sc-rank-letter { font-size: 54px; line-height: 1; font-weight: bold; }
.r-S { color: #ffd028; text-shadow: 0 0 18px rgba(255,208,40,.6); box-shadow: 0 0 26px rgba(255,208,40,.35), inset 0 0 18px rgba(255,208,40,.2); }
.r-A { color: #8ee8ff; text-shadow: 0 0 14px rgba(142,232,255,.5); box-shadow: 0 0 18px rgba(142,232,255,.25); }
.r-B { color: #cfd6e4; }
.r-C { color: #8a94a8; }
@keyframes scstamp {
  0% { opacity: 0; transform: scale(2.4) rotate(-12deg); }
  60% { opacity: 1; transform: scale(.92) rotate(-6deg); }
  100% { opacity: 1; transform: scale(1) rotate(-6deg); }
}
.sc-body { margin-top: 14px; }
.sc-tally { width: min(540px, 100%); margin: 0 auto; text-align: left; }
.sc-row {
  display: grid; grid-template-columns: 1fr auto 96px; gap: 14px; padding: 5px 2px;
  border-bottom: 1px dashed #262c38; font-size: 14px; letter-spacing: .08em; color: #cfd6e4;
  opacity: 0; transform: translateX(-10px); transition: opacity .18s, transform .18s;
}
.sc-row.on { opacity: 1; transform: none; }
.sc-l { text-transform: uppercase; color: #8a94a8; }
.sc-v i { font-style: normal; color: #566076; margin-left: 8px; font-size: 12px; }
.sc-p { text-align: right; color: #ffd028; }
.sc-p.zero { color: #39404f; }
.sc-total { margin-top: 12px; display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; letter-spacing: .2em; color: #8a94a8; }
.sc-total b { font-size: 30px; color: #f0f2f6; letter-spacing: .06em; }
.sc-best { min-height: 18px; margin-top: 4px; text-align: right; font-size: 12px; letter-spacing: .26em; color: #566076; opacity: 0; }
.sc-best.show { opacity: 1; }
.sc-best.new.show { color: #ffd028; text-shadow: 0 0 10px rgba(255,208,40,.6); animation: scbest .45s steps(2) 4; }
@keyframes scbest { 50% { opacity: .15; } }
.sc-after { margin-top: 14px; opacity: 0; pointer-events: none; transition: opacity .25s; }
.sc-after.show { opacity: 1; pointer-events: auto; }
.sc-pick-title { font-size: 12px; letter-spacing: .3em; color: #cfd6e4; margin-bottom: 10px; }
.sc-pick-title i { font-style: normal; color: #566076; margin-left: 12px; letter-spacing: .12em; }
.sc-perks { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; }
/* a perk card is a big button: icon tile, name, a few words, and a PICK bar */
.sc-perk {
  --pc: #ffd028;
  position: relative; flex: 0 1 196px; min-width: 150px;
  display: flex; flex-direction: column; align-items: center; gap: 8px; text-align: center;
  padding: 16px 12px 0; overflow: hidden; cursor: pointer;
  font-family: 'Courier New', Courier, monospace; color: #cfd6e4;
  background: linear-gradient(180deg, rgba(30,36,50,.95), rgba(12,15,22,.95));
  border: 2px solid #4b5568; border-radius: 3px;
  box-shadow: 0 4px 0 #05060a, 0 0 0 1px rgba(0,0,0,.4);
  transition: border-color .12s, transform .12s, box-shadow .12s, opacity .2s;
}
.sc-perk-ico {
  width: 58px; height: 58px; display: flex; align-items: center; justify-content: center;
  border: 2px solid var(--pc); border-radius: 50%; background: rgba(5,6,10,.6);
  box-shadow: 0 0 16px color-mix(in srgb, var(--pc) 45%, transparent), inset 0 0 12px color-mix(in srgb, var(--pc) 25%, transparent);
}
.sc-perk-ico .ico { filter: drop-shadow(0 0 4px color-mix(in srgb, var(--pc) 70%, transparent)); }
.sc-perk-text { display: flex; flex-direction: column; gap: 3px; }
.sc-perk b { color: #f0f2f6; font-size: 14px; letter-spacing: .14em; text-transform: uppercase; }
.sc-perk-short { color: var(--pc); font-size: 13px; letter-spacing: .04em; }
.sc-perk-pick {
  align-self: stretch; margin: 4px -12px 0; padding: 7px 0; font-size: 11px; font-weight: bold; letter-spacing: .24em;
  color: #ffd028; background: rgba(255,208,40,.08); border-top: 1px solid rgba(255,208,40,.35);
  transition: background .12s, color .12s;
}
.sc-perk-pick kbd {
  display: inline-block; min-width: 14px; margin-left: 6px; padding: 0 4px; font: inherit; letter-spacing: 0;
  color: #0a0c12; background: #ffd028; border-radius: 2px;
}
.sc-perk:not([disabled]):hover, .sc-perk:not([disabled]):focus-visible {
  border-color: #ffd028; transform: translateY(-3px);
  box-shadow: 0 7px 0 #05060a, 0 0 22px rgba(255,208,40,.28);
}
.sc-perk:not([disabled]):hover .sc-perk-pick, .sc-perk:not([disabled]):focus-visible .sc-perk-pick { background: #ffd028; color: #0a0c12; }
.sc-perk:not([disabled]):hover .sc-perk-pick kbd { background: #0a0c12; color: #ffd028; }
.sc-perk:not([disabled]):active { transform: translateY(1px); box-shadow: 0 2px 0 #05060a; }
.sc-perk[disabled] { cursor: default; opacity: .55; }
.sc-perks.armed .sc-perk:not(.chosen) { animation: scarm .5s ease-out 1; }
@keyframes scarm { 0% { box-shadow: 0 4px 0 #05060a, 0 0 0 rgba(255,208,40,0); } 45% { box-shadow: 0 4px 0 #05060a, 0 0 26px rgba(255,208,40,.55); } 100% { box-shadow: 0 4px 0 #05060a, 0 0 0 rgba(255,208,40,0); } }
.sc-perk.chosen { border-color: #ffd028; opacity: 1; box-shadow: 0 0 26px rgba(255,208,40,.45); }
.sc-perk.chosen .sc-perk-pick { background: #ffd028; color: #0a0c12; }
.sc-perks.picked .sc-perk:not(.chosen) { opacity: .25; }
.sc-note { margin-top: 10px; font-size: 11px; letter-spacing: .1em; color: #566076; }
.sc-skip { margin-top: 12px; font-size: 11px; letter-spacing: .24em; color: #566076; }
.sc-totals { margin: 4px 0; font-size: 13px; color: #8a94a8; }
.sc-record { color: #ffd028; }
@media (max-height: 560px) {
  .sc-screen { padding: 4px 0; }
  .sc-screen > .sc-panel { padding: 10px 16px 8px; }
  .sc-head { min-height: 58px; padding: 0 66px; }
  .sc-screen .sc-head h1 { font-size: 24px; letter-spacing: 3px; text-indent: 3px; }
  .sc-rank { width: 58px; height: 58px; top: calc(50% - 29px); border-width: 2px; }
  .sc-rank-letter { font-size: 34px; }
  .sc-rank-label { font-size: 8px; }
  .sc-body { margin-top: 6px; }
  .sc-row { font-size: 11px; padding: 2px; gap: 8px; grid-template-columns: 1fr auto 70px; }
  .sc-v i { font-size: 10px; }
  .sc-total { margin-top: 5px; font-size: 11px; }
  .sc-total b { font-size: 20px; }
  .sc-best { font-size: 10px; min-height: 14px; }
  .sc-after { margin-top: 6px; }
  .sc-pick-title { font-size: 10px; margin-bottom: 6px; }
  .sc-perk { padding: 8px 8px 0; min-width: 120px; gap: 5px; }
  .sc-perk-ico { width: 40px; height: 40px; }
  .sc-perk b { font-size: 11px; }
  .sc-perk-short { font-size: 10.5px; }
  .sc-perk-pick { margin: 3px -8px 0; padding: 4px 0; font-size: 9.5px; }
  .sc-note, .sc-skip { font-size: 9.5px; margin-top: 6px; }
}
/* landscape phone: tally on the left, the perks on the right */
@media (max-height: 460px) and (min-width: 600px) {
  .sc-body { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
  .sc-tally { width: 100%; }
  .sc-after { margin-top: 0; }
  .sc-perks { flex-direction: column; gap: 6px; }
  .sc-perk {
    flex: none; min-width: 0; flex-direction: row; align-items: center; gap: 10px;
    padding: 5px 0 5px 8px; text-align: left;
  }
  .sc-perk-ico { width: 34px; height: 34px; flex: none; }
  .sc-perk-ico .ico { width: 18px; height: 18px; }
  .sc-perk-text { flex: 1; }
  .sc-perk-pick {
    align-self: stretch; margin: -5px 0 -5px auto; padding: 0 10px; display: flex; align-items: center;
    border-top: none; border-left: 1px solid rgba(255,208,40,.35); letter-spacing: .14em;
  }
}
@media (prefers-reduced-motion: reduce) {
  .sc-rank.stamp { animation: none; opacity: 1; transform: rotate(-6deg); }
  .sc-best.new.show { animation: none; }
  .sc-perks.armed .sc-perk { animation: none; }
}
@keyframes termflicker { 0% { opacity: .9; } 50% { opacity: 1; } 97% { opacity: .7; } }
@keyframes termglitch {
  0% { transform: translate(-6px, 2px) skewX(-4deg); filter: hue-rotate(60deg) saturate(2); }
  50% { transform: translate(5px, -1px) skewX(3deg); filter: hue-rotate(-40deg); }
  100% { transform: none; filter: none; }
}
@keyframes crtoff {
  0% { transform: scale(1, 1); filter: brightness(1); }
  55% { transform: scale(1, .006); filter: brightness(3); }
  100% { transform: scale(0, .006); filter: brightness(6); }
}
@keyframes transitfade {
  0% { opacity: 1; background: #000; }
  15% { opacity: 1; background: rgba(120,70,190,.55); }
  100% { opacity: 0; background: rgba(40,20,70,0); }
}
@media (max-height: 460px) {
  .term-screen { padding: 8px; }
  .term-head { font-size: 9px; padding: 4px 10px; letter-spacing: .14em; }
  .term-body { font-size: 11.5px; line-height: 1.32; padding: 8px 12px 2px; min-height: calc(var(--term-lines, 12) * 1.32em + 10px); }
  .term-foot { font-size: 9px; padding: 3px 10px 6px; }
}
/* top-left: vitals */
#vitals { position: absolute; top: calc(12px + var(--sat)); left: calc(14px + var(--sal)); display: flex; gap: 8px; }
.pill { display: flex; align-items: center; gap: 8px; padding: 5px 12px 5px 10px; }
.pill .value { font-size: 22px; font-weight: bold; line-height: 1; color: #f0f2f6; }
.pill .unit { font-size: 13px; font-weight: bold; letter-spacing: 1px; color: #cfd6e4; }
#hp.low { border-color: rgba(255,64,48,.7); }
#hp.low .value { color: #ff4030; animation: pulse .5s infinite alternate; }
/* top-right: sector, map + pause, score */
#topright {
  position: absolute; top: calc(12px + var(--sat)); right: calc(14px + var(--sar)); display: flex; flex-direction: column;
  align-items: flex-end; gap: 8px;
}
#obj-head { font-size: 15px; font-weight: bold; letter-spacing: 3px; color: #cfd6e4; }
#obj-head b { color: #ffd028; }
#sysbtns { display: flex; gap: 8px; height: 34px; }
.sysbtn {
  pointer-events: auto; height: 34px; padding: 0; cursor: pointer;
  font: bold 13px 'Courier New', Courier, monospace; letter-spacing: 2px; text-indent: 2px;
  color: #f0f2f6; background: rgba(8,10,16,.74); border: 1px solid #6a7488;
  text-shadow: 1px 1px 0 #000;
}
.sysbtn:hover { color: #ffd028; border-color: #ffd028; }
#hud-map { width: 58px; }
#hud-pause { width: 36px; letter-spacing: 0; text-indent: 0; }
/* top-center: objective tracker */
#bossbar { width: min(380px, 44vw); margin-top: 4px; }
#bossbar[hidden] { display: none; }
#boss-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: bold; letter-spacing: .26em; color: #f0f2f6; text-shadow: 0 1px 0 #000; }
#boss-core { font-size: 10px; letter-spacing: .2em; color: #ff8a2a; opacity: 0; }
#bossbar.core #boss-core { opacity: 1; animation: pulse .35s infinite alternate; }
#boss-track {
  position: relative; height: 10px; margin-top: 3px; background: rgba(8,10,16,.82);
  border: 1px solid #39404f; box-shadow: 0 0 0 1px rgba(0,0,0,.5);
}
#boss-chip, #boss-fill { position: absolute; left: 0; top: 0; bottom: 0; }
#boss-chip { background: #f0d8b0; opacity: .75; }
#boss-fill { background: linear-gradient(180deg, #ff5a48, #b8231a); transition: width .08s linear; }
#bossbar.core #boss-track { border-color: #ff8a2a; box-shadow: 0 0 10px rgba(255,138,42,.6); }
#bossbar.core #boss-fill { background: linear-gradient(180deg, #ffb060, #e8602a); }
body.touch-mode #bossbar { width: min(300px, 40vw); }
body.touch-mode #boss-head { font-size: 10px; }
#objective {
  position: absolute; top: calc(12px + var(--sat)); left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  max-width: 46vw; text-align: center;
}
/* the step: an accent bar + icon in the stage colour, the words in caps, and
   three pips for keycard → door → lift (the title screen's numbered tiles) */
#obj-main {
  --obj-c: #ff3428;
  display: flex; align-items: center; gap: 10px; padding: 7px 12px 7px 10px;
  border-left: 4px solid var(--obj-c);
  font-size: 15px; font-weight: bold; letter-spacing: .12em; text-transform: uppercase;
  color: #f0f2f6; white-space: nowrap; text-shadow: 1px 1px 0 #000;
}
#obj-icon { display: flex; color: var(--obj-c); filter: drop-shadow(0 0 6px var(--obj-c)); }
#obj-steps { display: flex; gap: 4px; margin-left: 4px; }
#obj-steps i { width: 7px; height: 7px; border: 1px solid #4a5262; }
#obj-steps i.done { background: #8a94a8; border-color: #8a94a8; }
#obj-steps i.now { background: var(--obj-c); border-color: var(--obj-c); box-shadow: 0 0 6px var(--obj-c); }
#obj-main.flash { animation: objflash .9s ease-out; }
@keyframes objflash {
  0% { border-color: #ffd028; background: rgba(255,208,40,.35); transform: scale(1.12); }
  100% { border-color: #262c38; background: rgba(8,10,16,.74); transform: scale(1); }
}
/* navigator: a notched arrow in a dial (an isosceles triangle read the same
   from every side once it rotated), the distance beside it */
#obj-nav {
  display: flex; align-items: center; gap: 8px; font-size: 15px; font-weight: bold;
  color: #ffd028; text-shadow: 1px 1px 0 #000; letter-spacing: .06em;
}
#obj-dial {
  width: 34px; height: 34px; border-radius: 50%; box-sizing: border-box;
  display: flex; align-items: center; justify-content: center;
  background: rgba(8,10,16,.74); border: 1px solid #39404f;
}
#obj-arrow {
  width: 24px; height: 24px; fill: #ffd028;
  filter: drop-shadow(1px 1px 0 #000) drop-shadow(0 0 4px rgba(255,208,40,.55));
}
#obj-nav.here #obj-dial { border-color: #ffd028; box-shadow: 0 0 10px rgba(255,208,40,.5); }
/* bottom-center: weapon slots + keycards */
#weaponbar {
  position: absolute; left: 50%; bottom: calc(18px + var(--sab)); transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px;
}
#slots { display: flex; gap: 10px; }
.slot {
  position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
  font-size: 14px; font-weight: bold; color: #4a5262; border: 1px solid #39404f; background: rgba(8,10,16,.74);
}
.slot.owned { color: #e8ecf4; border-color: #6a7488; }
/* which gun sits in a slot (slots fill in pickup order) */
.slot { flex-direction: column; line-height: 1; }
.slot small { font-size: 7px; letter-spacing: .02em; color: #8a94a8; margin-top: 1px; }
.slot.active small { color: #ffd028; }
/* scrap: the one currency, always in view (solo) — a brass cog + the bank, "+N" floats off it */
#scrap { position: relative; display: flex; align-items: center; gap: 7px; font-size: 20px; font-weight: bold; letter-spacing: 1px; color: #ffe08a; margin-top: -2px; }
#scrap[hidden] { display: none; }
#scrap-num { display: inline-block; }
#scrap.pop #scrap-num { animation: scrappop .35s ease-out; }
@keyframes scrappop { 0% { transform: scale(1.5); color: #fff; } 100% { transform: scale(1); } }
#scrap-gain { position: absolute; right: 0; top: 100%; font-size: 13px; color: #e0b040; opacity: 0; pointer-events: none; }
#scrap-gain.show { animation: scrapgain 1s ease-out; }
@keyframes scrapgain { 0% { opacity: 0; transform: translateY(-4px); } 15% { opacity: 1; } 100% { opacity: 0; transform: translateY(12px); } }
body.touch-mode #scrap { font-size: 15px; }
/* the shop between waves: one card per gun (a picture, a name, one line, the price) + CONTINUE */
#shop-screen .panel { width: min(760px, 94vw); box-sizing: border-box; padding: 22px 26px 20px; }
#shop-screen h1 { font-size: 34px; letter-spacing: 6px; margin: 0 0 4px; color: #ffd028; text-shadow: 3px 3px 0 #000, 0 0 24px rgba(255,208,40,.4); }
.shop-bank { display: flex; align-items: center; justify-content: center; gap: 8px; margin: 0 0 14px; font-size: 13px; letter-spacing: .24em; color: #e0b040; }
.shop-bank b { font-size: 22px; letter-spacing: .04em; color: #ffe08a; }
.shop-cards { display: flex; gap: 10px; justify-content: center; }
.shop-card {
  flex: 0 1 150px; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 5px;
  padding: 8px 6px 0; overflow: hidden; cursor: pointer; text-align: center;
  font-family: 'Courier New', Courier, monospace; color: #cfd6e4;
  background: linear-gradient(180deg, rgba(30,36,50,.95), rgba(12,15,22,.95));
  border: 2px solid #4b5568; border-radius: 3px; box-shadow: 0 4px 0 #05060a;
  transition: border-color .12s, transform .12s, opacity .2s;
}
.shop-pic { align-self: stretch; height: 72px; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(112,216,255,.14), transparent 70%); }
.shop-pic img { width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; }
.shop-name { font-size: 12px; letter-spacing: .12em; color: #f0f2f6; white-space: nowrap; }
.shop-role { flex: 1; font-size: 11px; line-height: 1.15; color: #8a94a8; min-height: 2.3em; } /* pushes the price bar to the bottom: cards line up */
.shop-price {
  align-self: stretch; margin: 2px -6px 0; padding: 7px 0; display: flex; align-items: center; justify-content: center; gap: 5px;
  font-size: 15px; font-weight: bold; color: #ffd028; background: rgba(255,208,40,.08); border-top: 1px solid rgba(255,208,40,.35);
}
.shop-card:not([disabled]):hover { border-color: #ffd028; transform: translateY(-3px); }
.shop-card:not([disabled]):hover .shop-price { background: #ffd028; color: #0a0c12; }
.shop-card[disabled] { cursor: default; }
.shop-card.short { opacity: .5; }
.shop-card.short .shop-price { color: #8a94a8; }
.shop-card.bought { border-color: #4cc26a; }
.shop-card.bought .shop-price { color: #4cc26a; background: rgba(76,194,106,.12); border-top-color: rgba(76,194,106,.4); }
#shop-go { margin-top: 18px; }
#shop-go:disabled { opacity: .35; }
.shop-keys { margin-top: 8px; font-size: 11px; letter-spacing: .14em; color: #566076; }
@media (max-height: 560px) {
  #shop-screen .panel { padding: 12px 16px 12px; }
  #shop-screen h1 { font-size: 22px; letter-spacing: 4px; }
  .shop-bank { margin-bottom: 8px; }
  .shop-bank b { font-size: 18px; }
  .shop-pic { height: 44px; }
  .shop-card { gap: 3px; }
  #shop-go { margin-top: 10px; padding: 10px 40px; font-size: 15px; }
}
@media (max-width: 520px) { .shop-cards { flex-wrap: wrap; } .shop-card { flex-basis: 30%; } }
.slot.active { color: #ffd028; border-color: #ffd028; }
.slot.active::after {
  content: ''; position: absolute; left: -1px; right: -1px; bottom: -7px; height: 3px;
  background: #ffd028; box-shadow: 1px 1px 0 #000;
}
#keys { display: flex; gap: 6px; }
.key {
  width: 38px; height: 32px; display: none; align-items: center; justify-content: center;
  border: 1px solid #39404f; background: rgba(8,10,16,.74);
}
.key.red { display: flex; color: #ff3428; opacity: .45; }
.key.blue { color: #3878ff; } .key.yellow { color: #ffd028; }
.key.have { display: flex; opacity: 1; border-color: currentColor; box-shadow: 0 0 8px rgba(0,0,0,.4), inset 0 0 6px rgba(255,255,255,.08); }
/* bottom-right: weapon + ammo */
#ammo-block { position: absolute; right: calc(18px + var(--sar)); bottom: calc(14px + var(--sab)); display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
#weaponname { font-size: 14px; font-weight: bold; letter-spacing: 3px; color: #cfd6e4; }
#ammo { display: flex; align-items: center; gap: 12px; }
#ammo .value { font-size: 34px; font-weight: bold; line-height: 1; color: #f0f2f6; min-width: 2ch; text-align: right; }
#ammo-block .label { font-size: 11px; font-weight: bold; letter-spacing: 3px; color: #cfd6e4; }
/* desktop minimap sits under the vitals (automap.ts draws it) */
#hud #minimap {
  position: absolute; top: calc(58px + var(--sat)); left: calc(14px + var(--sal)); width: 124px; height: 124px;
  image-rendering: pixelated; background: rgba(5,6,10,.78); border: 1px solid #6a7488;
  box-shadow: 0 2px 0 rgba(0,0,0,.35);
}
#messages {
  position: absolute; top: calc(196px + var(--sat)); left: calc(14px + var(--sal)); font-size: 14px; color: #e8ecf4;
  display: flex; flex-direction: column; gap: 3px; max-width: 40vw;
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
#shieldflash {
  position: absolute; inset: 0; opacity: 0; transition: opacity .3s;
  background: radial-gradient(ellipse at center, rgba(60,200,255,0) 45%, rgba(60,200,255,.4) 100%);
}
#score { font-size: 15px; font-weight: bold; letter-spacing: 2px; color: #cfd6e4; }
#score .label, #kills .label { font-size: 10px; letter-spacing: 2px; color: #8a94a8; margin-right: 8px; }
#score-mult { color: #ffd028; margin-left: 7px; }
#score-mult:empty { display: none; }
#kills { font-size: 12px; font-weight: bold; letter-spacing: 2px; color: #cfd6e4; margin-top: -4px; }
#kills.all { color: #4cc26a; }
#buffs { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
/* weapon skins: a three-band paint chip */
.sw { display: inline-flex; width: 20px; height: 11px; border: 1px solid #000; box-shadow: 0 0 0 1px rgba(255,255,255,.12); flex: none; }
.sw i { flex: 1; }
/* next-skin progress: pops in bottom-left when it moves, fades after a few seconds
   (owner's call: under the score it sat beneath the touch weapon button) */
#unlock {
  position: absolute; left: calc(14px + var(--sal)); bottom: calc(34px + var(--sab));
  display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 5px 8px;
  background: rgba(8,10,16,.7); border: 1px solid #262c38; border-left: 3px solid #55e0ff;
  opacity: 0; transition: opacity .6s; pointer-events: none;
}
#unlock.show { opacity: 1; transition: opacity .15s; }
#unlock .u-row { display: flex; align-items: center; gap: 6px; font-size: 10px; letter-spacing: .14em; color: #8a94a8; }
#unlock .u-row b { color: #f0f2f6; }
#unlock .u-label { color: #55e0ff; font-weight: bold; }
#unlock .u-bar { width: 170px; height: 4px; background: rgba(0,0,0,.6); border: 1px solid #39404f; }
#u-fill { height: 100%; width: 0; background: #55e0ff; box-shadow: 0 0 6px rgba(85,224,255,.6); transition: width .25s; }
body.touch-mode #unlock { left: calc(10px + var(--sal)); bottom: calc(10px + var(--sab)); padding: 3px 6px; }
body.touch-mode #unlock .u-row { font-size: 9px; }
body.touch-mode #unlock .u-bar { width: 130px; }
/* SKIN UNLOCKED: a cyan stamp, the new paint's name + chip */
.skin-unlocked {
  /* below the crosshair: kill streaks pop above it, and the 10th kill is usually mid-combo */
  position: absolute; left: 50%; top: 63%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 7px;
  pointer-events: none; animation: secretin 2.8s forwards; white-space: nowrap;
}
.skin-unlocked b {
  font-size: 30px; letter-spacing: 7px; text-indent: 7px; color: #55e0ff;
  padding: 6px 20px; border: 2px solid #55e0ff; background: rgba(4,26,36,.6);
  text-shadow: 2px 2px 0 #000, 0 0 20px rgba(85,224,255,.7);
  box-shadow: 0 0 24px rgba(85,224,255,.3), inset 0 0 12px rgba(85,224,255,.18);
}
.skin-unlocked span { display: flex; align-items: center; gap: 9px; font-size: 16px; font-weight: bold; letter-spacing: 3px; color: #f0f2f6; text-shadow: 2px 2px 0 #000; }
.skin-unlocked .sw { width: 30px; height: 15px; }
.skin-unlocked em { font-style: normal; font-size: 11px; letter-spacing: 4px; color: #55e0ff; }
body.touch-mode .skin-unlocked b { font-size: 21px; letter-spacing: 4px; }
body.touch-mode .skin-unlocked span { font-size: 12px; }
/* title: the next skin to earn, so the first run has a goal from the first shot */
.next-unlock {
  margin-top: 16px; display: flex; align-items: center; gap: 10px; padding: 8px 14px;
  font: bold 12px 'Courier New', Courier, monospace; letter-spacing: .14em; text-transform: uppercase;
  color: #8a94a8; background: rgba(8,10,16,.72); border: 1px solid #2c3240; border-left: 3px solid #55e0ff;
}
.next-unlock .nu-label { color: #55e0ff; }
.next-unlock b { color: #f0f2f6; font-size: 13px; }
.next-unlock .nu-bar { width: 90px; height: 5px; background: rgba(0,0,0,.6); border: 1px solid #39404f; display: block; }
.next-unlock .nu-bar i { display: block; height: 100%; background: #55e0ff; }
/* upgrades: permanent buys with scrap (docs/RETENTION_PLAN.md) — Armory's look, a list of rows */
#upgrades-screen { justify-content: flex-start; background: rgba(5,6,10,.93); }
.upg-wrap { margin: auto; width: min(760px, 96vw); box-sizing: border-box; padding: 0 8px; display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
.upg-scrap { font-size: 13px; font-weight: bold; letter-spacing: .16em; color: #ffd028; }
.upg-sub { font-size: 11px; letter-spacing: .12em; color: #8a94a8; }
.upg-list { display: flex; flex-direction: column; gap: 5px; }
.upg-row {
  display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 12px;
  padding: 8px 10px; background: rgba(8,10,16,.8); border: 1px solid #2c3240;
}
.upg-txt { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.upg-name { font-size: 14px; font-weight: bold; letter-spacing: .1em; color: #f0f2f6; }
.upg-now { font-size: 11px; letter-spacing: .06em; color: #aab3c4; }
.upg-now b { color: #ffd028; font-weight: bold; }
.upg-pips { display: flex; gap: 3px; }
.upg-pips i { width: 10px; height: 10px; border: 1px solid #6a7488; background: rgba(0,0,0,.5); }
.upg-pips i.on { background: #ffd028; border-color: #ffd028; }
.upg-buy {
  min-width: 96px; padding: 7px 12px; cursor: pointer; white-space: nowrap;
  font: bold 12px 'Courier New', Courier, monospace; letter-spacing: .12em;
  color: #ffd028; background: rgba(10,13,20,.85); border: 1px solid #ffd028;
}
.upg-buy:hover:not(:disabled) { background: #ffd028; color: #0a0c12; }
.upg-buy:disabled { cursor: default; color: #6f7a90; border-color: #39404f; }
.upg-buy.max { color: #4cc26a; border-color: #4cc26a; }
.upg-row.flash { border-color: #ffd028; box-shadow: inset 0 0 0 1px #ffd028; }
#armory-screen .arm-upg { font-size: 12px; padding: 8px 14px; color: #ffd028; border-color: #ffd028; }
#armory-screen .arm-upg:hover { background: #ffd028; color: #0a0c12; }
#hud #obj-main.wave-mode #obj-steps { display: none; }
/* Survival has nothing to point at: no compass under the wave counter */
#hud #objective.wave-mode #obj-nav { display: none; }
/* desktop: the three picks in one row (phones keep the stacked rows) */
@media (min-height: 561px) { #wave-clear .panel { max-width: min(760px, 94vw); } #wave-clear .sc-perks { flex-wrap: nowrap; } }
#wave-clear h1 { font-size: 34px; letter-spacing: 6px; margin: 0 0 4px; }
#wave-clear .wc-next { font-size: 14px; letter-spacing: .24em; color: #55e0ff; margin: 0 0 10px; }
@media (max-height: 560px) {
  #wave-clear h1 { font-size: 24px; letter-spacing: 4px; }
  #wave-clear .wc-next { font-size: 11px; margin-bottom: 6px; }
}
.death-scrap { margin: -4px 0 4px; font-size: 13px; letter-spacing: .14em; color: #ffd028; }
.sc-scrap { margin-top: 8px; font-size: 12px; letter-spacing: .14em; color: #ffd028; text-align: center; }
@media (max-height: 560px) {
  .upg-wrap { gap: 5px; }
  .upg-row { padding: 5px 8px; gap: 8px; }
  .upg-name { font-size: 12px; }
  .upg-now { font-size: 10px; }
  .upg-buy { min-width: 80px; padding: 5px 8px; font-size: 11px; }
  .death-scrap { font-size: 11px; margin: -2px 0 2px; }
}
/* armory: a tab per gun, the gun itself on a turntable, its paints beside it */
#armory-screen { justify-content: flex-start; background: rgba(5,6,10,.93); }
.arm-wrap {
  margin: auto; width: min(980px, 96vw); box-sizing: border-box; padding: 0 8px;
  display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;
}
.arm-head { display: flex; align-items: center; gap: 14px; }
.arm-back { font-size: 13px; padding: 9px 16px; }
/* out-ranks .tbtn-quiet (defined later): Back must be easy to find */
#armory-screen .arm-back, #upgrades-screen .arm-back { color: #f0f2f6; border-color: #cfd6e4; background: rgba(20,24,34,.95); }
#armory-screen .arm-back:hover, #upgrades-screen .arm-back:hover { color: #0a0c12; background: #55e0ff; border-color: #55e0ff; }
.arm-title { flex: 1; font-size: 18px; font-weight: bold; letter-spacing: .4em; color: #f0f2f6; text-shadow: 2px 2px 0 #000; }
.arm-count { font-size: 11px; letter-spacing: .16em; color: #55e0ff; }
.arm-tabs { display: flex; gap: 4px; border-bottom: 1px solid #2c3240; }
.arm-tab {
  flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 9px 4px 8px;
  font: bold 14px 'Courier New', Courier, monospace; letter-spacing: .12em; color: #e0e6f0;
  background: rgba(16,20,30,.95); border: 1px solid #39404f; border-bottom: none; cursor: pointer;
  text-shadow: 1px 1px 0 #000;
}
.arm-tab small { font-size: 11px; letter-spacing: .08em; color: #aab3c4; }
.arm-tab:hover { color: #fff; border-color: #6a7488; }
.arm-tab.on { color: #0a0c12; background: #55e0ff; border-color: #55e0ff; text-shadow: none; }
.arm-tab.on small { color: #0a3a48; }
.arm-body { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: 12px; }
.arm-stage {
  /* above the menus' scanline overlay (.tscreen::after): the gun reads clean */
  position: relative; z-index: 1;
  display: flex; flex-direction: column; gap: 8px; padding: 10px;
  background: radial-gradient(ellipse at 50% 55%, rgba(85,224,255,.08), rgba(8,10,16,.85) 70%);
  border: 1px solid #2c3240;
}
#arm-canvas { width: 100%; aspect-ratio: 16 / 8; display: block; image-rendering: pixelated; cursor: grab; touch-action: none; }
#arm-canvas:active { cursor: grabbing; }
.arm-info { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; }
#arm-name { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: bold; letter-spacing: .14em; color: #f0f2f6; text-shadow: 1px 1px 0 #000; }
#arm-name .sw { width: 28px; height: 14px; }
#arm-name small { font-size: 12px; color: #aab3c4; letter-spacing: .12em; }
#arm-status { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; font-size: 11px; letter-spacing: .12em; color: #8a94a8; }
#arm-status .arm-goal { display: flex; align-items: center; gap: 8px; }
/* compact action buttons: Equip (cyan) and the rewarded unlock (steel, never the primary look) */
.arm-btn {
  display: inline-flex; align-items: center; gap: 7px; padding: 6px 14px; cursor: pointer;
  font: bold 11px 'Courier New', Courier, monospace; letter-spacing: .16em; text-transform: uppercase;
  background: rgba(10,13,20,.8); border: 1px solid; white-space: nowrap;
}
.arm-equip { color: #55e0ff; border-color: #55e0ff; }
.arm-equip:hover { background: #55e0ff; color: #0a0c12; }
.arm-ad { color: #cfd6e4; border-color: #6a7488; }
.arm-ad:hover:not(:disabled) { border-color: #cfd6e4; }
.arm-ad:disabled { cursor: default; color: #6f7a90; border-color: #39404f; }
#arm-status .arm-eq { color: #55e0ff; font-weight: bold; }
#arm-status .arm-lock { color: #ff8a3c; font-weight: bold; }
#arm-status .nu-bar { width: 80px; height: 5px; background: rgba(0,0,0,.6); border: 1px solid #39404f; display: block; }
#arm-status .nu-bar i { display: block; height: 100%; background: #55e0ff; }
.arm-list { display: flex; flex-direction: column; gap: 5px; max-height: 340px; overflow-y: auto; padding-right: 2px; }
.arm-skin {
  display: flex; align-items: center; gap: 10px; padding: 8px 10px; text-align: left;
  font: bold 14px 'Courier New', Courier, monospace; letter-spacing: .08em;
  color: #cfd6e4; background: rgba(8,10,16,.74); border: 1px solid #2c3240; cursor: pointer;
}
.arm-skin .arm-txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.arm-skin small { font-size: 11px; color: #8a94a8; letter-spacing: .06em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.arm-skin .sw { width: 24px; height: 13px; }
.arm-skin:hover { border-color: #6a7488; }
.arm-skin.sel { border-color: #55e0ff; box-shadow: inset 0 0 0 1px #55e0ff; }
.arm-skin.on small { color: #55e0ff; }
/* locked: dimmed but in its real colours, so the goal is something you can see */
.arm-skin.locked { color: #9aa3b4; }
.arm-skin.locked .sw { opacity: .6; }
@media (max-height: 560px) {
  .arm-wrap { gap: 6px; }
  .arm-title { font-size: 14px; }
  .arm-back { padding: 6px 12px; font-size: 12px; }
  .arm-tab { padding: 6px 2px 5px; font-size: 11px; letter-spacing: .04em; }
  .arm-tab small { font-size: 10px; }
  .arm-stage { padding: 6px; gap: 4px; }
  #arm-canvas { aspect-ratio: 16 / 7; }
  #arm-name { font-size: 13px; }
  #arm-name small { font-size: 10px; }
  .arm-info { min-height: 30px; }
  .arm-btn { font-size: 9.5px; padding: 4px 9px; gap: 5px; letter-spacing: .1em; }
  #arm-status { gap: 4px; font-size: 9px; }
  #arm-status .nu-bar { width: 50px; }
  .arm-list { max-height: 216px; gap: 4px; }
  .arm-skin { padding: 5px 8px; font-size: 11.5px; gap: 8px; }
  .arm-skin small { font-size: 9.5px; }
  .next-unlock { margin-top: 8px; padding: 5px 9px; font-size: 9.5px; gap: 7px; letter-spacing: .08em; }
  /* short screens: the strip gets its own centred row over score | version */
  .title-foot.has-mid { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); row-gap: 4px; }
  .title-foot.has-mid .next-unlock { grid-column: 1 / -1; grid-row: 1; justify-self: center; }
  .next-unlock b { font-size: 10.5px; }
  .next-unlock .nu-bar { width: 44px; }
}
.buff {
  font-size: 12px; font-weight: bold; letter-spacing: 2px; padding: 3px 9px;
  border: 1px solid; background: rgba(8,10,16,.65);
}
.buff.quad { color: #ffd028; border-color: #ffd028; }
.buff.shield { color: #55e0ff; border-color: #55e0ff; }
.buff.haste { color: #ff8030; border-color: #ff8030; }
#hint {
  position: absolute; left: 50%; bottom: calc(74px + var(--sab)); transform: translateX(-50%);
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: center;
  padding: 8px 16px; font-size: 13px; letter-spacing: 2px; color: #e8ecf4;
  background: rgba(8,10,16,.78); border: 1px solid #ffd028; max-width: 90vw;
  width: max-content; /* left:50% would otherwise cap it at half the screen */
  opacity: 0; transition: opacity .35s; text-align: center; pointer-events: none;
}
#hint.on { opacity: 1; }
.kc {
  display: inline-block; min-width: 22px; padding: 2px 6px; margin: 0 2px;
  border: 1px solid #cfd6e4; border-bottom-width: 3px; border-radius: 3px;
  font-size: 12px; font-weight: bold; color: #ffd028; background: #14171f; text-shadow: none;
}
.streak {
  position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%);
  font-size: 27px; font-weight: bold; letter-spacing: 6px; color: #ffd028;
  text-shadow: 2px 2px 0 #000, 0 0 18px rgba(255,208,40,.6);
  pointer-events: none; animation: streakup 1.1s forwards; white-space: nowrap;
}
/* SECRET FOUND: a gold stamp in the middle of the screen, bigger and longer than a streak */
.secret-found {
  position: absolute; left: 50%; top: 32%; transform: translate(-50%, -50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  pointer-events: none; animation: secretin 2.6s forwards; white-space: nowrap;
}
.secret-found b {
  font-size: 34px; letter-spacing: 8px; text-indent: 8px; color: #ffd028;
  padding: 6px 22px; border: 2px solid #ffd028; background: rgba(40,30,4,.55);
  text-shadow: 2px 2px 0 #000, 0 0 22px rgba(255,208,40,.75);
  box-shadow: 0 0 26px rgba(255,208,40,.35), inset 0 0 14px rgba(255,208,40,.2);
}
.secret-found span { font-size: 16px; font-weight: bold; letter-spacing: 3px; color: #f0f2f6; text-shadow: 2px 2px 0 #000; }
@keyframes secretin {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(1.8); }
  10% { opacity: 1; transform: translate(-50%, -50%) scale(.94); }
  18% { transform: translate(-50%, -50%) scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -62%); }
}
body.touch-mode .secret-found b { font-size: 24px; letter-spacing: 5px; }
body.touch-mode .secret-found span { font-size: 12px; }
#secret-glow {
  position: absolute; inset: 0; pointer-events: none; opacity: 0;
  box-shadow: inset 0 0 120px rgba(255,208,40,.55); transition: opacity .6s;
}
@keyframes streakup {
  0% { opacity: 0; transform: translate(-50%, -30%) scale(.6); }
  15% { opacity: 1; transform: translate(-50%, -50%) scale(1.15); }
  30% { transform: translate(-50%, -50%) scale(1); }
  75% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -85%); }
}
.screen {
  position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center;
  justify-content: center; background: rgba(4,6,10,.86); color: #cfd6e4;
  pointer-events: auto; cursor: pointer; z-index: 10; text-align: center;
  padding: var(--sat) var(--sar) var(--sab) var(--sal); box-sizing: border-box;
}
.screen h1 { font-size: 52px; letter-spacing: 8px; margin: 0 0 8px; color: #e8524a;
  text-shadow: 3px 3px 0 #000, 0 0 24px rgba(232,82,74,.5); }
.screen h1.win { color: #4cc26a; text-shadow: 3px 3px 0 #000, 0 0 24px rgba(76,194,106,.5); }
.screen p { font-size: 15px; color: #8a94a8; margin: 4px 0; }
.screen .prompt { margin-top: 26px; font-size: 17px; color: #ffd028; animation: pulse .7s infinite alternate; }
.screen-btns { margin-top: 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.tbtn-row { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.screen .keyhint { margin-top: 12px; font-size: 11px; letter-spacing: .14em; color: #566076; }
/* death screen: revive + retry share one row at the same size (Poki: a
   rewarded button needs an equal-size normal button beside it, and is never
   the green one — it wears plain steel with a white label) */
.death-main.pair { align-items: stretch; }
.death-main.pair .tbtn { flex: 1 1 0; min-width: 230px; font-size: 14px; padding: 14px 20px; }
.tbtn-revive {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  color: #f0f2f6; border-color: #8a94a8;
}
.tbtn-revive:hover { border-color: #f0f2f6; background: rgba(240,242,246,.08); }
.tbtn-revive .ico { flex: none; }
.death-main .tbtn { white-space: nowrap; }
.tbtn-revive.spent { color: #566076; border-color: #262c38; cursor: default; }
.tbtn-revive.spent:hover { background: rgba(10,13,20,.72); }
.screen.arming { cursor: default; }
.screen.arming .tbtn, .screen.arming .prompt { opacity: .35; }
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
#fps { position: absolute; left: calc(14px + var(--sal)); bottom: calc(10px + var(--sab)); font-size: 12px; color: #566076; }

/* ---------------- touch controls ---------------- */
#touchui { position: absolute; inset: 0; pointer-events: none; }
#tjoy-zone {
  position: absolute; left: 0; bottom: 0; width: 45%; height: 70%;
  pointer-events: auto; touch-action: none;
}
#tlook-zone {
  position: absolute; right: 0; bottom: 0; width: 55%; height: 82%;
  pointer-events: auto; touch-action: none;
}
#tjoy-base {
  position: absolute; width: 96px; height: 96px; border-radius: 50%;
  border: 2px solid rgba(255,208,40,.45); background: rgba(10,13,20,.35);
  display: none; pointer-events: none;
}
#tjoy-knob {
  position: absolute; left: 28px; top: 28px; width: 40px; height: 40px;
  border-radius: 50%; background: rgba(255,208,40,.55); border: 1px solid #000;
}
.tbtn-touch {
  position: absolute; pointer-events: auto; touch-action: none;
  width: 66px; height: 66px; border-radius: 50%;
  border: 2px solid rgba(207,214,228,.5); background: rgba(10,13,20,.4);
  color: #f0f2f6; font: bold 13px 'Courier New', Courier, monospace;
  letter-spacing: .1em; display: flex; align-items: center; justify-content: center;
  user-select: none; -webkit-user-select: none; text-shadow: 1px 1px 0 #000;
}
/* FIRE, JUMP and the weapon button stack against the right edge: anything
   further in sits where the thumb drags to aim and gets hit by look swipes */
#tfire { right: calc(18px + var(--sar)); bottom: calc(18px + var(--sab)); width: 104px; height: 104px; font-size: 16px; }
#tjump { right: calc(37px + var(--sar)); bottom: calc(134px + var(--sab)); }
/* quick melee: up and in from FIRE, so the firing thumb rolls onto it (never the aim side) */
#tmelee { right: calc(122px + var(--sar)); bottom: calc(112px + var(--sab)); width: 56px; height: 56px; font-size: 11px; }
/* weapon button above JUMP: tap = next, swipe = prev/next, hold = wheel */
#tweapon { right: calc(37px + var(--sar)); bottom: calc(210px + var(--sab)); flex-direction: column; gap: 2px; line-height: 1; }
#tweapon .ico { opacity: .75; }
#tweapon-num { font-size: 18px; color: #ffd028; }
#tweapon-name { font-size: 7.5px; letter-spacing: .5px; max-width: 60px; overflow: hidden; white-space: nowrap; }
#twheel { position: absolute; inset: 0; pointer-events: none; display: none; }
#twheel.open { display: block; }
.twheel-item {
  position: absolute; width: 54px; height: 54px; border-radius: 50%;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  background: rgba(8,10,16,.84); border: 2px solid rgba(207,214,228,.45); color: #f0f2f6;
  font: bold 17px 'Courier New', Courier, monospace; line-height: 1; text-shadow: 1px 1px 0 #000;
  transition: transform .08s, border-color .08s, color .08s;
}
.twheel-item small { font-size: 7px; letter-spacing: .3px; }
.twheel-item.cur { border-color: rgba(255,208,40,.55); }
.twheel-item.pick { color: #ffd028; border-color: #ffd028; background: rgba(40,32,8,.92); transform: scale(1.18); }
/* map + pause sit exactly where the desktop buttons are (#sysbtns) */
#tmap, #tpause {
  top: calc(34px + var(--sat)); height: 34px; border-radius: 0; border-width: 1px; border-color: #6a7488;
  background: rgba(8,10,16,.74); font-size: 13px; letter-spacing: 2px;
}
#tpause { right: calc(10px + var(--sar)); width: 36px; letter-spacing: 0; }
#tmap { right: calc(54px + var(--sar)); width: 58px; }
#tammo {
  position: absolute; right: calc(134px + var(--sar)); bottom: calc(30px + var(--sab)); display: flex; align-items: center; gap: 8px;
  font: bold 22px 'Courier New', Courier, monospace; color: #f0f2f6;
  text-shadow: 2px 2px 0 #000; pointer-events: none; letter-spacing: 1px;
}
#slots .slot { pointer-events: auto; }
/* forced landscape: when a touch device is held in portrait, the whole body
   is rotated 90° so the game always presents as landscape. Fixed-position
   overlays stay contained because the transform creates a containing block. */
body.force-landscape {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vh;
  height: 100vw;
  transform: rotate(90deg) translate(0, -100%);
  transform-origin: top left;
  overflow: hidden;
}

/* ---------------- mobile HUD layout (touch devices) ---------------- */
/* thumbs own the bottom corners: weapons move to the top, ammo sits over FIRE,
   no minimap (the MAP button opens the full automap) */
body.touch-mode #vitals { top: calc(8px + var(--sat)); left: calc(10px + var(--sal)); gap: 6px; }
body.touch-mode .pill { padding: 4px 9px 4px 8px; gap: 6px; }
body.touch-mode .pill .value { font-size: 18px; }
body.touch-mode .pill .unit { font-size: 11px; }
body.touch-mode #hud #minimap { display: none; }
body.touch-mode #topright { top: calc(8px + var(--sat)); right: calc(10px + var(--sar)); gap: 8px; }
body.touch-mode #obj-head { font-size: 13px; }
body.touch-mode #sysbtns .sysbtn { visibility: hidden; } /* the touch #tmap/#tpause sit here */
body.touch-mode #weaponbar { top: calc(8px + var(--sat)); bottom: auto; gap: 6px; }
body.touch-mode #slots { gap: 6px; }
/* touch: only weapons you own, bigger targets (the weapon button does most switching) */
body.touch-mode .slot { width: 36px; height: 30px; font-size: 14px; }
body.touch-mode .slot:not(.owned) { display: none; }
body.touch-mode .slot.active::after { bottom: -6px; height: 2px; }
body.touch-mode .key { width: 34px; height: 28px; }
body.touch-mode #objective { top: calc(50px + var(--sat)); max-width: 40vw; }
body.touch-mode #obj-main { font-size: 12px; padding: 4px 9px 4px 8px; gap: 7px; letter-spacing: .06em; }
body.touch-mode #obj-nav { font-size: 12px; }
body.touch-mode #obj-dial { width: 28px; height: 28px; }
body.touch-mode #obj-arrow { width: 20px; height: 20px; }
body.touch-mode #ammo-block { display: none; }
body.touch-mode #messages { top: calc(52px + var(--sat)); left: calc(10px + var(--sal)); font-size: 11px; max-width: 30vw; gap: 2px; }
body.touch-mode #fps { display: none; }
body.touch-mode #score { font-size: 12px; }
body.touch-mode #kills { font-size: 11px; }
body.touch-mode .buff { font-size: 10px; padding: 2px 6px; }
body.touch-mode .streak { font-size: 19px; letter-spacing: 4px; }
/* the hint sits low, between the thumbs */
body.touch-mode #hint { bottom: calc(12px + var(--sab)); max-width: 46vw; font-size: 11px; padding: 6px 10px; gap: 6px; }

/* ---------------- small screens ---------------- */
@media (max-width: 760px) {
  .death-main.pair .tbtn { min-width: 0; font-size: 12px; padding: 11px 12px; letter-spacing: .12em; }
  #weaponname { font-size: 11px; letter-spacing: 2px; }
  #ammo .value { font-size: 26px; }
  #objective { max-width: 40vw; }
  #obj-main { font-size: 12px; letter-spacing: .04em; padding: 4px 9px 4px 8px; }
  .screen h1 { font-size: 32px; letter-spacing: 4px; }
  .panel { padding: 20px 22px 18px; max-width: 92vw; }
  .title-menu-row { flex-wrap: wrap; justify-content: center; }
  .setlist { width: 94vw; }
  .setrow { font-size: 10px; gap: 10px; }
  input[type=range].tslider { width: 110px; }
  .title-foot { font-size: 9px; }
}

/* ---------------- full-screen menus (title, pause) ---------------- */
/* menus scroll when they don't fit (phones in landscape are ~360-400px tall):
   the inner block is centred by auto margins, so it sits in the middle when
   it fits and starts at the top — never clipped — when it doesn't */
.tscreen {
  position: fixed; inset: 0; z-index: 10; color: #cfd6e4;
  display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
  padding: calc(12px + var(--sat)) var(--sar) calc(13px + var(--sab)) var(--sal); box-sizing: border-box;
  overflow-y: auto; overscroll-behavior: contain; -webkit-overflow-scrolling: touch; touch-action: pan-y;
  background:
    radial-gradient(ellipse at 50% 115%, rgba(5,6,10,0), rgba(5,6,10,.9) 72%),
    linear-gradient(rgba(5,6,10,.62), rgba(5,6,10,.38) 42%, rgba(5,6,10,.8));
}
.tscreen > .title-center { margin: auto 0; flex-shrink: 0; }
.tscreen::after {
  content: ''; position: fixed; inset: 0; pointer-events: none;
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
/* "NEW SECTOR" banner: a hazard tag on a violet strip — the Biofoundry's light */
.new-sector {
  margin-top: 16px; display: inline-flex; align-items: stretch; max-width: 100%;
  border: 1px solid #8a4fc4; background: linear-gradient(90deg, rgba(120,60,180,.38), rgba(40,20,70,.55));
  box-shadow: 0 0 22px rgba(205,90,255,.22), inset 0 0 12px rgba(205,90,255,.12);
}
.ns-tag {
  flex: none; display: flex; align-items: center; padding: 6px 12px;
  background: #ffd028; color: #0a0c12; font-weight: bold; font-size: 12px; letter-spacing: .22em;
  animation: nsglow 1.4s ease-in-out infinite alternate;
}
.ns-text {
  display: flex; align-items: center; flex-wrap: wrap; gap: 0 9px; padding: 6px 14px;
  font-size: 12px; letter-spacing: .16em; color: #e6d6ff; text-shadow: 0 0 8px rgba(205,90,255,.45);
}
.ns-text b { color: #f0f2f6; }
.ns-text i { font-style: normal; color: #b68ae6; }
@keyframes nsglow { from { box-shadow: 0 0 0 rgba(255,208,40,0); } to { box-shadow: 0 0 14px rgba(255,208,40,.55); } }
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
.coop-input {
  font-family: 'Courier New', Courier, monospace; font-weight: bold; font-size: 15px;
  letter-spacing: .4em; text-transform: uppercase; text-align: center; width: 110px;
  background: #1a1f2b; color: #ffd028; border: 1px solid #39404f; padding: 7px 4px;
}
.coop-input:focus-visible { outline: 2px solid #ffd028; outline-offset: 2px; }
.coop-status {
  margin-top: 22px; font-size: 13px; letter-spacing: .14em; color: #cfd6e4;
  min-height: 18px; text-align: center;
}
.coop-code-display {
  /* same footprint as the HOST button beside it — just gold and glowing */
  font-family: 'Courier New', Courier, monospace; font-weight: bold; font-size: 12px;
  letter-spacing: .3em; text-indent: .3em; color: #ffd028;
  background: #1a1f2b; border: 1px solid #ffd028; padding: 9px 14px; min-width: 92px;
  text-align: center; box-sizing: border-box;
  text-shadow: 0 0 10px rgba(255,208,40,.55);
}
.coop-code-display[hidden] { display: none; }
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
/* a saved run: Continue and New run side by side (one row instead of two) */
.title-menu.title-menu-pair { flex-direction: row; flex-wrap: wrap; justify-content: center; }
.title-menu-pair .tbtn-play { padding-left: 46px; padding-right: 46px; }
.title-menu-pair .tbtn-newrun { align-self: stretch; padding-left: 20px; padding-right: 20px; }
.tbtn-quiet { font-size: 12px; padding: 9px 18px; color: #8a94a8; }
.tbtn-quiet:hover { color: #cfd6e4; border-color: #6a7488; }
.tbtn-play { font-size: 22px; padding: 18px 76px; letter-spacing: .3em; text-indent: .3em; }
/* title: the goal in three steps (same icons + colours as the in-game objective) */
.title-goal {
  margin-top: 14px; font-size: 15px; font-weight: bold; letter-spacing: .34em; text-indent: .34em;
  color: #cfd6e4; text-transform: uppercase;
}
.tsteps { margin-top: 14px; display: flex; align-items: center; justify-content: center; gap: 10px; }
.tstep {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 8px;
  width: 150px; padding: 14px 8px 12px; box-sizing: border-box;
  border: 1px solid #2c3240; border-top: 2px solid var(--c); background: rgba(8,10,16,.74);
  color: var(--c);
}
.tstep-n {
  position: absolute; top: 5px; left: 7px; font-size: 11px; font-weight: bold; color: #566076;
}
.tstep-icon { display: flex; filter: drop-shadow(0 0 8px var(--c)); }
.tstep-text {
  font-size: 12px; line-height: 1.35; letter-spacing: .14em; text-transform: uppercase;
  text-align: center; color: #cfd6e4;
}
.tstep-sep { color: #566076; font-size: 14px; }
.title-controls {
  margin-top: 18px; font-size: 11px; letter-spacing: .14em; color: #6f7a90; text-transform: uppercase;
}
.title-controls b { color: #aab3c4; }
.title-controls i { font-style: normal; margin: 0 10px; color: #3a4150; }
.title-gear {
  position: fixed; top: calc(14px + var(--sat)); right: calc(16px + var(--sar)); z-index: 11; width: 42px; height: 42px;
  display: flex; align-items: center; justify-content: center; cursor: pointer;
  background: rgba(10,13,20,.72); color: #8a94a8; border: 1px solid #39404f;
}
.title-gear:hover { color: #ffd028; border-color: #ffd028; }
/* top-left, mirroring the gear: the Armory (weapon skins), with the owned count */
.title-armory {
  position: fixed; top: calc(14px + var(--sat)); left: calc(16px + var(--sal)); z-index: 11; height: 42px; padding: 0 14px 0 12px;
  display: flex; align-items: center; gap: 9px; cursor: pointer;
  font: bold 12px 'Courier New', Courier, monospace; letter-spacing: .2em; text-transform: uppercase;
  background: rgba(10,13,20,.72); color: #cfd6e4; border: 1px solid #39404f; border-left: 3px solid #55e0ff;
}
.title-armory .ico { color: #55e0ff; }
.title-armory small { font-size: 10px; letter-spacing: .08em; color: #55e0ff; }
.title-armory:hover { border-color: #55e0ff; }
.title-armory:focus-visible { outline: 2px solid #55e0ff; outline-offset: 3px; }
.title-gear:focus-visible { outline: 2px solid #ffd028; outline-offset: 3px; }
/* in the flow (last flex item), so a tall menu scrolls past it instead of under it */
.title-foot {
  align-self: stretch; flex-shrink: 0; margin: 10px 18px 0;
  display: flex; justify-content: space-between; gap: 12px;
  font-size: 11px; letter-spacing: .12em; color: #566076;
}
/* title: best score | NEXT SKIN (bottom centre) | version */
.title-foot.has-mid { display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: end; }
.title-foot.has-mid > span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.title-foot.has-mid > span:last-child { text-align: right; }
.title-foot .next-unlock { margin-top: 0; }
@media (max-height: 560px) {
  .new-sector { margin-top: 9px; }
  .ns-tag { font-size: 10px; padding: 4px 9px; letter-spacing: .16em; }
  .ns-text { font-size: 10px; padding: 4px 10px; letter-spacing: .1em; }
  #title-logo { width: min(62vw, 440px); }
  .title-goal { margin-top: 6px; font-size: 12px; }
  .tsteps { margin-top: 8px; gap: 6px; }
  .tstep { width: 126px; padding: 9px 6px 8px; gap: 5px; }
  .tstep-text { font-size: 10px; letter-spacing: .1em; }
  .tbtn-play { font-size: 18px; padding: 12px 60px; }
  .title-controls { margin-top: 10px; font-size: 10px; }
  .title-gear { top: calc(8px + var(--sat)); right: calc(10px + var(--sar)); width: 36px; height: 36px; }
  .title-armory { top: calc(8px + var(--sat)); left: calc(10px + var(--sal)); height: 36px; padding: 0 10px 0 9px; font-size: 10px; gap: 7px; }
  /* phones: icon + count only, so it stays clear of the wordmark */
  .title-armory span { display: none; }
  .title-menu { margin-top: 18px; }
  .tscreen { padding: calc(4px + var(--sat)) var(--sar) calc(7px + var(--sab)) var(--sal); }
  .title-foot { margin-top: 4px; }
  /* settings: smaller logo + tighter rows so Back fits on a landscape phone */
  #settings-logo { width: min(40vw, 230px); }
  #settings-screen .title-tag { margin-top: 4px; }
  #settings-screen .setlist { margin-top: 8px; }
  #settings-screen .setrow { padding: 5px 4px; }
  #settings-screen .title-menu { margin-top: 10px; }
  #settings-screen .tbtn-primary { padding: 10px 40px; font-size: 15px; }
}
/* short AND wide (landscape phone): settings rows in two columns */
@media (max-height: 560px) and (min-width: 600px) {
  #settings-screen .title-center { max-width: 1000px; }
  #settings-screen .setlist {
    display: grid; grid-template-columns: 1fr 1fr; column-gap: 26px; width: min(96vw, 960px);
  }
  #settings-screen .setrow { font-size: 10px; letter-spacing: .1em; gap: 8px; }
  #settings-screen .setctl { gap: 8px; }
  #settings-screen input[type=range].tslider { width: 92px; }
  #settings-screen .setval { min-width: 40px; }
  #settings-screen .sethint { font-size: 9px; letter-spacing: .04em; }
}
@media (prefers-reduced-motion: reduce) {
  .screen .prompt, #hp.low .value, #obj-main.flash, .ns-tag { animation: none; }
}
`;

export class HUD {
  onOverloadAction: (() => void) | null = null;
  private overloadAction!: HTMLButtonElement;
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
  private shieldEl!: HTMLElement;
  private scoreNumEl!: HTMLElement;
  private scoreMultEl!: HTMLElement;
  private buffsEl!: HTMLElement;
  private buffsCache = '';
  private hintEl!: HTMLElement;
  private hintTimer: number | null = null;
  private objMainEl!: HTMLElement;
  private objIconEl!: HTMLElement;
  private objIconCache = '';
  private ammoIcoEl!: HTMLElement;
  private ammoIconCache: AmmoIcon = 'bullets';
  /** desktop HUD buttons (wired by Game) */
  onMapClick: (() => void) | null = null;
  onPauseClick: (() => void) | null = null;
  private objTextEl!: HTMLElement;
  private objArrowEl!: HTMLElement;
  private objDistEl!: HTMLElement;
  private objDistCache = '';
  private objStepEls: HTMLElement[] = [];
  private objNavEl!: HTMLElement;
  private killsEl!: HTMLElement;
  private killsNumEl!: HTMLElement;
  private killsCache = '';
  private screenEl: HTMLElement | null = null;
  private hitTimer: number | null = null;
  private logoStop: (() => void) | null = null;
  private titleKey: ((ev: KeyboardEvent) => void) | null = null;
  /** timers owned by the current screen (cleared by hideScreen) */
  private readonly screenTimers: number[] = [];
  /** the facility terminal's typing run, if one is on screen */
  private termRun: TerminalRun | null = null;

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
      <div id="shieldflash"></div>
      <div id="crosshair" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <path class="crosshair-edge" d="M12 2v6 M12 16v6 M2 12h6 M16 12h6"/>
          <path d="M12 2v6 M12 16v6 M2 12h6 M16 12h6"/>
        </svg>
        <svg class="crosshair-marker" width="32" height="32" viewBox="0 0 32 32">
          <path class="crosshair-edge" d="M4 4l6 6 M22 22l6 6 M4 28l6-6 M22 10l6-6"/>
          <path d="M4 4l6 6 M22 22l6 6 M4 28l6-6 M22 10l6-6"/>
        </svg>
      </div>
      <div id="messages"></div>
      <div id="fps"></div>
      <div id="unlock"><div class="u-row"><span class="u-label">NEXT SKIN</span><span id="u-sw"></span><b id="u-name"></b></div><div class="u-bar"><div id="u-fill"></div></div><div class="u-row"><span id="u-need"></span><b id="u-n"></b></div></div>
      <div id="vitals">
        <div class="pill hpanel" id="hp">${ICONS.health()}<span class="value">100</span><span class="unit">HP</span></div>
        <div class="pill hpanel" id="armor">${ICONS.armor()}<span class="value">0</span><span class="unit">ARMOR</span></div>
      </div>
      <div id="topright">
        <div id="obj-head"><span id="obj-label">SECTOR</span> <b id="obj-sector">1</b><span id="obj-of"> / <span id="obj-total">3</span></span></div>
        <div id="sysbtns">
          <button id="hud-map" class="sysbtn" title="Map (Tab / M)">MAP</button>
          <button id="hud-pause" class="sysbtn" title="Pause (Esc)">&#10073;&#10073;</button>
        </div>
        <div id="score"><span class="label">SCORE</span><span id="score-num">000000</span><span id="score-mult"></span></div>
        <div id="kills"><span class="label">KILLS</span><span id="kills-num">0 / 0</span></div>
        <div id="scrap" hidden title="Scrap: spend it in the shop and on upgrades">${ICONS.scrap(19)}<span id="scrap-num">0</span><span id="scrap-gain"></span></div>
        <div id="buffs"></div>
      </div>
      <div id="objective">
        <div id="obj-main" class="hpanel"><i id="obj-icon"></i><span id="obj-text"></span><span id="obj-steps"><i></i><i></i><i></i></span></div>
        <div id="obj-nav">
          <div id="obj-dial"><svg id="obj-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5 L21 21.5 L12 16 L3 21.5 Z"/></svg></div>
          <span id="obj-dist"></span>
        </div>
        <div id="bossbar" hidden>
          <div id="boss-head"><span id="boss-name"></span><span id="boss-core">CORE EXPOSED</span></div>
          <div id="boss-track"><div id="boss-chip"></div><div id="boss-fill"></div></div>
        </div>
      </div>
      <div id="hint"></div>
      <div id="weaponbar">
        <div id="slots"></div>
        <div id="keys">
          <div class="key red">${ICONS.keycard()}</div>
          <div class="key blue">${ICONS.keycard()}</div>
          <div class="key yellow">${ICONS.keycard()}</div>
        </div>
      </div>
      <div id="ammo-block">
        <div id="weaponname">SIDEARM</div>
        <div id="ammo"><i id="ammo-ico">${ICONS.bullets()}</i><span class="value">48</span></div>
        <div class="label">AMMO</div>
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
    this.shieldEl = this.root.querySelector('#shieldflash')!;
    this.scoreNumEl = this.root.querySelector('#score-num')!;
    this.scoreMultEl = this.root.querySelector('#score-mult')!;
    this.buffsEl = this.root.querySelector('#buffs')!;
    this.hintEl = this.root.querySelector('#hint')!;
    this.objMainEl = this.root.querySelector('#obj-main')!;
    this.objIconEl = this.root.querySelector('#obj-icon')!;
    this.ammoIcoEl = this.root.querySelector('#ammo-ico')!;
    // desktop MAP / pause buttons (usable whenever the mouse isn't captured);
    // mousedown must not reach Input, which would treat it as a recapture click
    for (const [sel, cb] of [['#hud-map', () => this.onMapClick?.()], ['#hud-pause', () => this.onPauseClick?.()]] as const) {
      const btn = this.root.querySelector(sel) as HTMLElement;
      btn.addEventListener('mousedown', (e) => e.stopPropagation());
      btn.addEventListener('click', (e) => { e.stopPropagation(); cb(); });
    }
    this.objTextEl = this.root.querySelector('#obj-text')!;
    this.objArrowEl = this.root.querySelector('#obj-arrow')!;
    this.objDistEl = this.root.querySelector('#obj-dist')!;
    this.objStepEls = [...this.root.querySelectorAll<HTMLElement>('#obj-steps i')];
    this.objNavEl = this.root.querySelector('#obj-nav')!;
    this.killsEl = this.root.querySelector('#kills')!;
    this.killsNumEl = this.root.querySelector('#kills-num')!;
    for (let i = 0; i < ORDER.length; i++) {
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

  private tammoNumEl: HTMLElement | null = null;
  private tammoIcoEl: HTMLElement | null = null;

  updateAmmo(p: Player, w: WeaponSystem): void {
    const type = WEAPONS[w.current].ammoType;
    const text = String(p.ammo[type]);
    if (this.ammoEl.textContent !== text) this.ammoEl.textContent = text;
    // mirror next to the touch FIRE button when mobile controls are mounted
    this.tammoNumEl ??= this.root.querySelector('#tammo-num');
    this.tammoIcoEl ??= this.root.querySelector('#tammo-ico');
    if (this.tammoNumEl && this.tammoNumEl.textContent !== text) this.tammoNumEl.textContent = text;
    if (type !== this.ammoIconCache || (this.tammoIcoEl && !this.tammoIcoEl.firstChild)) {
      this.ammoIconCache = type;
      this.ammoIcoEl.innerHTML = ICONS[type]();
      if (this.tammoIcoEl) this.tammoIcoEl.innerHTML = ICONS[type](18);
    }
  }

  updateWeapon(w: WeaponSystem): void {
    this.weaponNameEl.textContent = w.definition().name;
    // touch weapon button (mounted by TouchControls in touch mode)
    const tNum = this.root.querySelector('#tweapon-num');
    const tName = this.root.querySelector('#tweapon-name');
    if (tNum) tNum.textContent = String(ORDER.indexOf(w.current) + 1);
    if (tName) tName.textContent = w.focusedShotgun && w.current === 'shotgun' ? 'FOCUSED' : WEAPONS[w.current].name;
    // slots fill in the order the guns were picked up
    const order = w.slots();
    if (tNum) tNum.textContent = String(order.indexOf(w.current) + 1);
    const slots = this.slotsEl.querySelectorAll<HTMLElement>('.slot');
    slots.forEach((el, i) => {
      const id = order[i];
      el.classList.toggle('owned', !!id);
      el.classList.toggle('active', !!id && w.current === id);
      el.innerHTML = id ? `${i + 1}<small>${SLOT_TAG[id]}</small>` : String(i + 1);
      el.title = id ? WEAPONS[id].name : '';
    });
  }

  message(text: string): void {
    const div = document.createElement('div');
    div.textContent = text;
    this.messagesEl.appendChild(div);
    while (this.messagesEl.children.length > 4) this.messagesEl.firstChild?.remove();
    setTimeout(() => div.remove(), 3600);
  }

  setOverloadAction(text: string, enabled = false): void {
    if (!this.overloadAction) {
      this.overloadAction = document.createElement('button');
      this.overloadAction.id = 'overload-action';
      this.overloadAction.addEventListener('mousedown', (e) => e.stopPropagation());
      this.overloadAction.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      this.overloadAction.addEventListener('click', (e) => { e.stopPropagation(); this.onOverloadAction?.(); });
      this.root.appendChild(this.overloadAction);
    }
    this.overloadAction.hidden = !text;
    this.overloadAction.disabled = !enabled;
    if (this.overloadAction.textContent !== text) this.overloadAction.textContent = text;
  }

  showOverload(ready: boolean, availability: Record<OverloadReward, boolean>, ammo: string,
    onStart: () => void, onReward: (reward: OverloadReward) => void, onBack: () => void): void {
    const rewards = `
      <button id="overload-focus" class="tbtn reward" ${availability.focus ? '' : 'disabled'} title="Shotgun modification for this run. Requires the shotgun; cannot stack."><span class="reward-icon">${ICONS.shells(28)}</span>FOCUSED SHOTGUN<small>${availability.focus ? 'Tighter spread<br><span class="tradeoff">Slower firing</span>' : 'Unavailable'}</small></button>
      <button id="overload-repair" class="tbtn reward" ${availability.repair ? '' : 'disabled'} title="One-time refill, capped at 100 health and armor."><span class="reward-icon">${ICONS.health(26)}${ICONS.armor(26)}</span>FIELD REPAIR<small>${availability.repair ? '+25 HP · +15 armor' : 'Full'}</small></button>
      <button id="overload-ammo" class="tbtn reward" ${availability.ammo ? '' : 'disabled'} title="One-time refill for your equipped weapon, up to its ammo cap."><span class="reward-icon">${ammo.includes('shells') ? ICONS.shells(28) : ammo.includes('rockets') ? ICONS.rockets(28) : ammo.includes('cells') ? ICONS.cells(28) : ICONS.bullets(28)}</span>AMMO CACHE<small>${availability.ammo ? ammo : 'Full'}</small></button>`;
    const handlers: Record<string, () => void> = { '#overload-back': onBack };
    if (ready) {
      handlers['#overload-focus'] = () => onReward('focus');
      handlers['#overload-repair'] = () => onReward('repair');
      handlers['#overload-ammo'] = () => onReward('ammo');
    } else handlers['#overload-start'] = onStart;
    this.showButtonScreen(`
      <div class="overload-content">
        ${ready ? '' : '<p class="offer-label">OPTIONAL FIGHT</p>'}
        <h1>${ready ? 'CHOOSE ONE' : 'OVERLOAD'}</h1>
        ${ready ? `<div class="screen-btns">${rewards}</div>` : '<p class="offer-summary">Defeat <b>2 waves of enemies.</b><br>Pick one reward: shotgun upgrade, repair or ammo.</p>'}
        <div class="screen-btns">${ready ? '' : '<button id="overload-start" class="tbtn tbtn-primary">Start fight</button>'}<button id="overload-back" class="tbtn">${ready ? 'Later' : 'Not now'}</button></div>
      </div>
    `, handlers, onBack, 250, `overload-screen ${ready ? 'reward-mode' : 'offer-mode'}`);
    const keys = this.titleKey;
    if (keys) window.removeEventListener('keydown', keys);
    this.titleKey = (e) => { if (e.code === 'Escape') onBack(); else keys?.(e); };
    window.addEventListener('keydown', this.titleKey);
  }

  /** objective tracker: step icon + text in its color; `flash` pops it on a change */
  /** run `fn` after `ms` unless the screen changes first (hideScreen clears it) */
  screenTimer(fn: () => void, ms: number): void {
    this.screenTimers.push(window.setTimeout(fn, ms));
  }

  private scrapGain = 0;
  private scrapGainTimer = 0;

  /**
   * The scrap bank in the top-right (null hides it: co-op, previews). `gain`
   * pops the number and floats "+N" off it (gains close together add up).
   */
  setScrap(n: number | null, gain = 0): void {
    const el = this.root.querySelector('#scrap') as HTMLElement | null;
    if (!el) return;
    el.hidden = n === null;
    if (n === null) return;
    (el.querySelector('#scrap-num') as HTMLElement).textContent = String(n);
    if (gain <= 0) return;
    this.scrapGain += gain;
    window.clearTimeout(this.scrapGainTimer);
    this.scrapGainTimer = window.setTimeout(() => { this.scrapGain = 0; }, 900);
    const g = el.querySelector('#scrap-gain') as HTMLElement;
    g.textContent = `+${this.scrapGain}`;
    el.classList.remove('pop');
    g.classList.remove('show');
    void el.offsetWidth; // restart the animations
    el.classList.add('pop');
    g.classList.add('show');
  }

  /** Survival: WAVE n and what's left, in the objective box (no step pips) */
  setWave(wave: number, text: string, flash: boolean): void {
    (this.root.querySelector('#obj-label') as HTMLElement).textContent = 'WAVE';
    (this.root.querySelector('#obj-sector') as HTMLElement).textContent = String(wave);
    (this.root.querySelector('#obj-of') as HTMLElement).style.display = 'none';
    this.objTextEl.textContent = text;
    if (this.objIconCache !== 'boss') {
      this.objIconCache = 'boss';
      this.objIconEl.innerHTML = ICONS.boss(20);
    }
    this.objMainEl.style.setProperty('--obj-c', '#ff3428');
    this.objMainEl.classList.add('wave-mode');
    this.root.querySelector('#objective')?.classList.add('wave-mode');
    if (flash) {
      this.objMainEl.classList.remove('flash');
      void this.objMainEl.offsetWidth;
      this.objMainEl.classList.add('flash');
    }
  }

  /**
   * Survival: a wave is down. "WAVE N CLEARED", the next map when it changes,
   * and a pick of three (the sector-clear perk cards) — nothing else (owner:
   * one decision per screen; the shop comes after, on its own). The cards
   * arm after 0.5 s so a held trigger can't pick one. Keys 1–3 pick.
   */
  showWaveClear(o: {
    wave: number;
    next: string | null;
    perks: Array<{ id: OfferId; name: string; short: string; desc: string }>;
    touch: boolean;
    onPick: (id: OfferId) => void;
  }): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.id = 'wave-clear';
    el.className = 'screen sc-screen';
    el.style.cursor = 'default';
    el.innerHTML = `<div class="panel">
      <h1 class="win">WAVE ${o.wave} CLEARED</h1>
      ${o.next ? `<div class="wc-next">EVAC &#9656; ${o.next}</div>` : ''}
      <div class="sc-pick-title">CHOOSE ONE</div>
      <div class="sc-perks">${o.perks.map((p, i) => `
        <button class="sc-perk" data-id="${p.id}" style="--pc:${perkColor(p.id)}" title="${p.desc}" disabled>
          <span class="sc-perk-ico">${perkIcon(p.id, 30)}</span>
          <span class="sc-perk-text"><b>${p.name}</b><span class="sc-perk-short">${p.short}</span></span>
          <span class="sc-perk-pick">${o.touch ? 'PICK' : `PICK <kbd>${i + 1}</kbd>`}</span>
        </button>`).join('')}
      </div>
    </div>`;
    document.body.appendChild(el);
    this.screenEl = el;
    const cards = [...el.querySelectorAll<HTMLButtonElement>('.sc-perk')];
    let armed = false;
    let picked = false;
    const pick = (i: number): void => {
      if (!armed || picked || !cards[i]) return;
      picked = true;
      cards[i].classList.add('chosen');
      el.querySelector('.sc-perks')?.classList.add('picked');
      cards.forEach((c) => (c.disabled = true));
      o.onPick(cards[i].dataset.id as OfferId);
    };
    this.screenTimers.push(window.setTimeout(() => {
      armed = true;
      cards.forEach((c) => { c.disabled = false; c.classList.add('armed'); });
    }, 500));
    cards.forEach((c, i) => c.addEventListener('click', (ev) => { ev.stopPropagation(); pick(i); }));
    this.titleKey = (ev: KeyboardEvent) => {
      const n = ['Digit1', 'Digit2', 'Digit3'].indexOf(ev.code);
      const m = ['Numpad1', 'Numpad2', 'Numpad3'].indexOf(ev.code);
      if (n >= 0 || m >= 0) pick(Math.max(n, m));
    };
    window.addEventListener('keydown', this.titleKey);
  }

  /**
   * Survival's shop, after the wave's pick: the scrap bank, one card per gun
   * not owned yet (its picture, name, one line, price) + an ammo refill, and
   * a big CONTINUE. A card buys on click (keys 1–5); a gun bought here stays
   * on screen as OWNED. Continue arms after 0.5 s (Enter / Space too).
   */
  showShop(o: {
    scrap: () => number;
    items: () => Array<{ id: string; name: string; role: string; price: number; owned: boolean; full?: boolean; img: string }>;
    touch: boolean;
    onBuy: (id: string) => boolean;
    onDone: () => void;
  }): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.id = 'shop-screen';
    el.className = 'screen sc-screen';
    el.style.cursor = 'default';
    el.innerHTML = `<div class="panel">
      <h1>SHOP</h1>
      <div class="shop-bank">${ICONS.scrap(20)}<b id="shop-scrap"></b>SCRAP</div>
      <div class="shop-cards" id="shop-cards"></div>
      <button id="shop-go" class="tbtn tbtn-primary" disabled>Continue</button>
      ${o.touch ? '' : '<div class="shop-keys">CLICK A CARD TO BUY &middot; ENTER TO CONTINUE</div>'}
    </div>`;
    document.body.appendChild(el);
    this.screenEl = el;
    // the guns on offer are fixed when it opens: one bought here stays, as OWNED
    const shown = o.items().filter((it) => !it.owned).map((it) => it.id);
    const cardsEl = el.querySelector('#shop-cards') as HTMLElement;
    const go = el.querySelector('#shop-go') as HTMLButtonElement;
    let armed = false;
    let done = false;
    const render = (): void => {
      const bank = o.scrap();
      (el.querySelector('#shop-scrap') as HTMLElement).textContent = String(bank);
      const items = o.items().filter((it) => shown.includes(it.id));
      cardsEl.innerHTML = items.map((it) => {
        const short = !it.owned && !it.full && bank < it.price;
        const price = it.owned ? 'OWNED &#10003;' : it.full ? 'FULL' : `${ICONS.scrap(14)}${it.price}`;
        const pic = it.img ? `<img src="${it.img}" alt="">` : it.id === 'ammo' ? `${ICONS.bullets(26)}${ICONS.shells(26)}` : '';
        return `<button class="shop-card${it.owned ? ' bought' : ''}${short ? ' short' : ''}" data-id="${it.id}"${it.owned || it.full || short ? ' disabled' : ''}>
          <span class="shop-pic">${pic}</span>
          <b class="shop-name">${it.name}</b>
          <span class="shop-role">${it.role}</span>
          <span class="shop-price">${price}</span>
        </button>`;
      }).join('');
      cardsEl.querySelectorAll<HTMLButtonElement>('.shop-card').forEach((b) => b.addEventListener('click', (ev) => {
        ev.stopPropagation();
        buy(b.dataset.id!);
      }));
    };
    const buy = (id: string): void => {
      if (!armed || done) return;
      if (o.onBuy(id)) render();
    };
    const finish = (): void => {
      if (!armed || done) return;
      done = true;
      go.disabled = true;
      o.onDone();
    };
    render();
    this.screenTimers.push(window.setTimeout(() => { armed = true; go.disabled = false; }, 500));
    go.addEventListener('click', (ev) => { ev.stopPropagation(); finish(); });
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') { ev.preventDefault(); finish(); return; }
      const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(ev.code);
      if (n >= 0) {
        const b = cardsEl.querySelectorAll<HTMLButtonElement>('.shop-card')[n];
        if (b && !b.disabled) buy(b.dataset.id!);
      }
    };
    window.addEventListener('keydown', this.titleKey);
  }

  setObjective(
    sector: number, total: number, text: string, color: string, flash: boolean,
    icon: 'keycard' | 'door' | 'lift' | 'pad' | 'boss' = 'keycard',
    preview = false,
  ): void {
    this.objMainEl.classList.remove('wave-mode');
    this.root.querySelector('#objective')?.classList.remove('wave-mode');
    // past the campaign it's endless: DEPTH n, no "of N"
    const endless = !preview && sector > total;
    (this.root.querySelector('#obj-label') as HTMLElement).textContent = endless ? 'DEPTH' : 'SECTOR';
    (this.root.querySelector('#obj-sector') as HTMLElement).textContent = String(sector);
    (this.root.querySelector('#obj-total') as HTMLElement).textContent = String(total);
    (this.root.querySelector('#obj-of') as HTMLElement).style.display = endless || preview ? 'none' : '';
    this.objTextEl.textContent = text;
    if (icon !== this.objIconCache) {
      this.objIconCache = icon;
      this.objIconEl.innerHTML = ICONS[icon](20);
    }
    this.objMainEl.style.setProperty('--obj-c', color);
    // keycard (a boss guards it) → door → lift / pad
    const step = icon === 'door' ? 1 : icon === 'lift' || icon === 'pad' ? 2 : 0;
    this.objStepEls.forEach((el, i) => {
      el.classList.toggle('done', i < step);
      el.classList.toggle('now', i === step);
    });
    if (flash) {
      this.objMainEl.classList.remove('flash');
      void this.objMainEl.offsetWidth; // restart the animation
      this.objMainEl.classList.add('flash');
    }
  }

  private bossShown = false;
  private bossChip = 1;
  /**
   * Boss health bar under the objective: the name, a red fill, and a pale
   * chip that trails behind it so each hit reads. Orange with CORE EXPOSED
   * while the core is open. `name` null hides it.
   */
  setBoss(name: string | null, frac = 1, coreOpen = false): void {
    const bar = this.root.querySelector('#bossbar') as HTMLElement;
    if (!name) {
      if (this.bossShown) {
        bar.hidden = true;
        this.bossShown = false;
      }
      return;
    }
    if (!this.bossShown) {
      bar.hidden = false;
      this.bossShown = true;
      this.bossChip = frac;
      (bar.querySelector('#boss-name') as HTMLElement).textContent = name;
    }
    const f = Math.max(0, Math.min(1, frac));
    this.bossChip = Math.max(f, this.bossChip - 0.006); // the chip drains after the hit
    (bar.querySelector('#boss-fill') as HTMLElement).style.width = `${(f * 100).toFixed(1)}%`;
    (bar.querySelector('#boss-chip') as HTMLElement).style.width = `${(this.bossChip * 100).toFixed(1)}%`;
    bar.classList.toggle('core', coreOpen);
  }

  /** arrow relative to view (0° = straight ahead) + distance; null hides it */
  updateCompass(angleDeg: number | null, dist: number): void {
    if (angleDeg === null) {
      this.objArrowEl.style.opacity = '0';
      if (this.objDistCache !== '') this.objDistEl.textContent = this.objDistCache = '';
      return;
    }
    this.objArrowEl.style.opacity = '1';
    this.objArrowEl.style.transform = `rotate(${angleDeg.toFixed(0)}deg)`;
    const d = dist < 2.5 ? 'HERE' : `${Math.round(dist)}m`;
    if (d !== this.objDistCache) {
      this.objDistEl.textContent = this.objDistCache = d;
      this.objNavEl.classList.toggle('here', d === 'HERE');
    }
  }

  setKills(kills: number, total: number): void {
    const t = `${kills} / ${total}`;
    if (t === this.killsCache) return;
    this.killsCache = t;
    this.killsNumEl.textContent = t;
    this.killsEl.classList.toggle('all', total > 0 && kills >= total);
  }

  /** tutorial strip above the stat bar; `html` may use <span class="kc"> keycaps */
  hint(html: string, seconds: number): void {
    this.hintEl.innerHTML = html;
    this.hintEl.classList.add('on');
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => this.clearHint(), seconds * 1000);
  }

  clearHint(): void {
    this.hintEl.classList.remove('on');
    if (this.hintTimer !== null) clearTimeout(this.hintTimer);
    this.hintTimer = null;
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

  /** cyan pulse when the overshield eats a hit */
  shieldFlash(): void {
    this.shieldEl.style.opacity = '1';
    setTimeout(() => (this.shieldEl.style.opacity = '0'), 110);
  }

  updateScore(score: number, mult: number): void {
    this.scoreNumEl.textContent = String(score).padStart(6, '0');
    this.scoreMultEl.textContent = mult > 1 ? `×${mult}` : '';
  }

  /** the secret room: a gold SECRET FOUND stamp, the points under it, a warm edge glow */
  secretFound(points: number, extra = ''): void {
    this.root.querySelectorAll('.secret-found').forEach((el) => el.remove());
    const el = document.createElement('div');
    el.className = 'secret-found';
    el.innerHTML = `<b>SECRET FOUND</b><span>+${points}${extra ? ` &middot; ${extra}` : ''}</span>`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2650);
    let glow = this.root.querySelector('#secret-glow') as HTMLElement | null;
    if (!glow) {
      glow = document.createElement('div');
      glow.id = 'secret-glow';
      this.root.appendChild(glow);
    }
    glow.style.transition = 'none';
    glow.style.opacity = '1';
    void glow.offsetWidth;
    glow.style.transition = 'opacity 1.4s';
    glow.style.opacity = '0';
  }

  private unlockKey = '';
  private unlockHide = 0;
  /**
   * Next-skin progress, bottom-left: shown when the count moves (or
   * `force`, at a sector start), faded out a few seconds later.
   */
  unlockProgress(next: SkinDef | null, have: number, force = false): void {
    const el = this.root.querySelector('#unlock') as HTMLElement;
    if (!next) {
      el.classList.remove('show');
      return;
    }
    const key = `${next.id}:${have}`;
    if (key === this.unlockKey && !force) return;
    this.unlockKey = key;
    (el.querySelector('#u-sw') as HTMLElement).innerHTML = swatchHtml(next.swatch);
    (el.querySelector('#u-name') as HTMLElement).textContent = `${next.name} ${WEAPON_LABEL[next.weapon]}`;
    (el.querySelector('#u-need') as HTMLElement).textContent = needText(next);
    (el.querySelector('#u-n') as HTMLElement).textContent = `${Math.min(have, next.need.n)} / ${next.need.n}`;
    (el.querySelector('#u-fill') as HTMLElement).style.width = `${Math.min(100, (have / next.need.n) * 100)}%`;
    el.classList.add('show');
    clearTimeout(this.unlockHide);
    this.unlockHide = window.setTimeout(() => el.classList.remove('show'), force ? 5000 : 3200);
  }

  /** a skin was earned: a cyan SKIN UNLOCKED stamp, its name + chip, EQUIPPED */
  skinUnlocked(s: SkinDef): void {
    this.root.querySelectorAll('.skin-unlocked').forEach((el) => el.remove());
    const el = document.createElement('div');
    el.className = 'skin-unlocked';
    el.innerHTML = `<b>SKIN UNLOCKED</b><span>${swatchHtml(s.swatch)}${s.name} &middot; ${WEAPON_LABEL[s.weapon]}</span><em>EQUIPPED</em>`;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2850);
  }

  /**
   * Armory: a tab per gun; the gun turns on a turntable in the picked paint
   * (locked ones preview too: you see what you're playing for), its paints
   * listed beside it. EQUIP for an owned one, the goal + progress for a
   * locked one. ←/→ (or Q/E) switch tabs, ↑/↓ pick, Enter equips, Esc back.
   */
  showArmory(opts: {
    equipped: Partial<Record<WeaponId, string>>;
    unlocked: Set<string>;
    progress: (s: SkinDef) => number;
    onEquip: (weapon: WeaponId, id: string) => void;
    onBack: () => void;
    /** the tab to open on */
    start?: WeaponId;
    /** Poki with ads: unlock a locked skin now with a rewarded video (true = watched and granted) */
    onAdUnlock?: (id: string) => Promise<boolean>;
    /** the scrap upgrades screen (shown with the player's scrap) */
    onUpgrades?: () => void;
    scrap?: number;
  }): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.id = 'armory-screen';
    el.className = 'tscreen';
    const weapons: WeaponId[] = ['pistol', 'shotgun', 'smg', 'rocket', 'arc'];
    const skinsOf = (w: WeaponId): SkinDef[] => SKINS.filter((s) => s.weapon === w);
    el.innerHTML = `
      <div class="arm-wrap">
        <div class="arm-head">
          <button id="armory-back" class="tbtn tbtn-quiet arm-back">&#9664; Back</button>
          <div class="arm-title">ARMORY</div>
          <div class="arm-count" id="arm-count">SKINS ${opts.unlocked.size} / ${SKINS.length}</div>
          ${opts.onUpgrades ? `<button id="armory-upgrades" class="tbtn tbtn-quiet arm-upg">Upgrades &middot; ${opts.scrap ?? 0} scrap</button>` : ''}
        </div>
        <div class="arm-tabs">${weapons.map((w) => `<button class="arm-tab" data-w="${w}">${WEAPON_LABEL[w]}<small></small></button>`).join('')}</div>
        <div class="arm-body">
          <div class="arm-stage">
            <canvas id="arm-canvas" title="Drag to turn"></canvas>
            <div class="arm-info"><div id="arm-name"></div><div id="arm-status"></div></div>
          </div>
          <div class="arm-list" id="arm-list"></div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    this.screenEl = el;
    this.root.style.visibility = 'hidden';
    const preview = startArmoryPreview(el.querySelector('#arm-canvas') as HTMLCanvasElement);
    this.logoStop = () => preview.stop();

    let tab: WeaponId = opts.start && weapons.includes(opts.start) ? opts.start : 'pistol';
    let sel = opts.equipped[tab] ?? '';
    const listEl = el.querySelector('#arm-list') as HTMLElement;
    const nameEl = el.querySelector('#arm-name') as HTMLElement;
    const statusEl = el.querySelector('#arm-status') as HTMLElement;

    const render = (): void => {
      (el.querySelector('#arm-count') as HTMLElement).textContent = `SKINS ${opts.unlocked.size} / ${SKINS.length}`;
      el.querySelectorAll<HTMLElement>('.arm-tab').forEach((t) => {
        const w = t.dataset.w as WeaponId;
        t.classList.toggle('on', w === tab);
        const all = skinsOf(w);
        (t.querySelector('small') as HTMLElement).textContent = `${all.filter((s) => opts.unlocked.has(s.id)).length}/${all.length}`;
      });
      const cur = opts.equipped[tab] ?? '';
      const items = [{ id: '', name: 'STANDARD', swatch: STANDARD_SWATCH[tab], skin: null as SkinDef | null },
        ...skinsOf(tab).map((s) => ({ id: s.id, name: s.name, swatch: s.swatch, skin: s }))];
      listEl.innerHTML = items.map((it) => {
        const open = !it.skin || opts.unlocked.has(it.id);
        const sub = !open ? `${needText(it.skin!)} &middot; ${opts.progress(it.skin!)}/${it.skin!.need.n}`
          : cur === it.id ? 'EQUIPPED' : it.skin ? 'UNLOCKED' : 'FACTORY PAINT';
        return `<button class="arm-skin${it.id === sel ? ' sel' : ''}${cur === it.id ? ' on' : ''}${open ? '' : ' locked'}" data-id="${it.id}">${swatchHtml(it.swatch)}<span class="arm-txt">${it.name}<small>${sub}</small></span></button>`;
      }).join('');
      listEl.querySelectorAll<HTMLButtonElement>('.arm-skin').forEach((b) => {
        b.addEventListener('click', () => {
          sel = b.dataset.id ?? '';
          render();
        });
      });
      const skin = sel ? SKINS.find((s) => s.id === sel) ?? null : null;
      preview.show(tab, skin);
      nameEl.innerHTML = `${swatchHtml(skin ? skin.swatch : STANDARD_SWATCH[tab])}<span>${skin ? skin.name : 'STANDARD'}<br><small>${WEAPON_LABEL[tab]}</small></span>`;
      const open = !skin || opts.unlocked.has(skin.id);
      if (!open) {
        const have = opts.progress(skin!);
        statusEl.innerHTML = `<div class="arm-goal"><span class="arm-lock">LOCKED</span><span>${needText(skin!)}</span><span class="nu-bar"><i style="width:${Math.min(100, (have / skin!.need.n) * 100)}%"></i></span><span>${have}/${skin!.need.n}</span></div>` +
          (opts.onAdUnlock ? `<button id="armory-ad" class="arm-btn arm-ad">${ICONS.ad(13)}Unlock now &middot; Watch ad</button>` : '');
        const ad = statusEl.querySelector('#armory-ad') as HTMLButtonElement | null;
        ad?.addEventListener('click', () => {
          const id = skin!.id;
          ad.disabled = true;
          ad.lastChild!.textContent = 'Loading video…';
          void opts.onAdUnlock!(id).then((ok) => {
            if (ok) {
              if (tab === skin!.weapon) sel = id;
              render();
            } else if (ad.isConnected) {
              ad.lastChild!.textContent = 'No video available';
            }
          });
        });
      } else if (cur === sel) {
        statusEl.innerHTML = '<span class="arm-eq">&#10003; EQUIPPED</span>';
      } else {
        statusEl.innerHTML = '<button id="armory-equip" class="arm-btn arm-equip">Equip</button>';
        statusEl.querySelector('#armory-equip')!.addEventListener('click', () => equip());
      }
    };
    const equip = (): void => {
      if (sel && !opts.unlocked.has(sel)) return;
      opts.onEquip(tab, sel);
      render();
    };
    const setTab = (w: WeaponId): void => {
      tab = w;
      sel = opts.equipped[w] ?? '';
      render();
    };
    el.querySelectorAll<HTMLElement>('.arm-tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.w as WeaponId)));
    el.querySelector('#armory-back')!.addEventListener('click', () => opts.onBack());
    el.querySelector('#armory-upgrades')?.addEventListener('click', () => opts.onUpgrades?.());
    render();
    this.titleKey = (ev: KeyboardEvent) => {
      const i = weapons.indexOf(tab);
      if (ev.code === 'Escape') opts.onBack();
      else if (ev.code === 'ArrowRight' || ev.code === 'KeyE') setTab(weapons[(i + 1) % weapons.length]);
      else if (ev.code === 'ArrowLeft' || ev.code === 'KeyQ') setTab(weapons[(i + weapons.length - 1) % weapons.length]);
      else if (ev.code === 'ArrowDown' || ev.code === 'ArrowUp') {
        const ids = ['', ...skinsOf(tab).map((s) => s.id)];
        const j = ids.indexOf(sel);
        sel = ids[(j + (ev.code === 'ArrowDown' ? 1 : ids.length - 1)) % ids.length];
        render();
      } else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') equip();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  /**
   * Permanent upgrades bought with scrap. A row per upgrade: its name, the
   * tier owned (pips), what that tier does and what the next one adds, and a
   * Buy button with the price (greyed when short, MAX at the top tier).
   * Esc / Back returns.
   */
  showUpgrades(o: {
    scrap: () => number;
    items: () => Array<{ id: string; name: string; level: number; max: number; now: string; next: string | null; cost: number | null }>;
    onBuy: (id: string) => boolean;
    onBack: () => void;
  }): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.id = 'upgrades-screen';
    el.className = 'tscreen';
    el.innerHTML = `
      <div class="upg-wrap">
        <div class="arm-head">
          <button id="upgrades-back" class="tbtn tbtn-quiet arm-back">&#9664; Back</button>
          <div class="arm-title">UPGRADES</div>
          <div class="upg-scrap" id="upg-scrap"></div>
        </div>
        <div class="upg-sub">Scrap comes from every kill, clear and secret, and is never lost. Upgrades last for every run.</div>
        <div class="upg-list" id="upg-list"></div>
      </div>`;
    document.body.appendChild(el);
    this.screenEl = el;
    this.root.style.visibility = 'hidden';
    const listEl = el.querySelector('#upg-list') as HTMLElement;
    const render = (flash?: string): void => {
      (el.querySelector('#upg-scrap') as HTMLElement).textContent = `SCRAP ${o.scrap()}`;
      const scrap = o.scrap();
      listEl.innerHTML = o.items().map((it) => {
        const pips = Array.from({ length: it.max }, (_, i) => `<i class="${i < it.level ? 'on' : ''}"></i>`).join('');
        const now = it.level > 0 ? `<b>${it.now}</b>${it.next ? ` &middot; next: ${it.next}` : ''}` : `${it.next}`;
        const btn = it.cost === null
          ? '<button class="upg-buy max" disabled>MAX</button>'
          : `<button class="upg-buy" data-id="${it.id}"${scrap < it.cost ? ' disabled' : ''}>Buy &middot; ${it.cost}</button>`;
        return `<div class="upg-row${flash === it.id ? ' flash' : ''}" data-row="${it.id}"><div class="upg-txt"><span class="upg-name">${it.name}</span><span class="upg-now">${now}</span></div><div class="upg-pips">${pips}</div>${btn}</div>`;
      }).join('');
      listEl.querySelectorAll<HTMLButtonElement>('.upg-buy[data-id]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.id!;
        if (o.onBuy(id)) render(id);
      }));
    };
    el.querySelector('#upgrades-back')!.addEventListener('click', () => o.onBack());
    render();
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Escape') o.onBack();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  /** big center popup for kill streaks (DOUBLE KILL etc.) */
  streak(text: string): void {
    // a fast chain escalates: the newest streak replaces the previous popup
    this.root.querySelectorAll('.streak').forEach((el) => el.remove());
    const el = document.createElement('div');
    el.className = 'streak';
    el.textContent = text;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }

  /** active powerup chips with their remaining seconds */
  updateBuffs(p: Player): void {
    const parts: string[] = [];
    if (p.buffs.quad > 0) parts.push(`<div class="buff quad">QUAD ${Math.ceil(p.buffs.quad)}</div>`);
    if (p.buffs.shield > 0) parts.push(`<div class="buff shield">SHIELD ${Math.ceil(p.buffs.shield)}</div>`);
    if (p.buffs.haste > 0) parts.push(`<div class="buff haste">HASTE ${Math.ceil(p.buffs.haste)}</div>`);
    const s = parts.join('');
    if (s !== this.buffsCache) {
      this.buffsCache = s;
      this.buffsEl.innerHTML = s;
    }
  }

  hitMarker(): void {
    this.showHitMarker(false, false, 90);
  }

  /** gold flash for a critical hit to the head */
  headshotMarker(): void {
    this.showHitMarker(true, false, 110);
  }

  /** bigger, distinct confirmation when something dies (gold for headshots) */
  killMarker(headshot = false): void {
    this.showHitMarker(headshot, true, 170);
  }

  private showHitMarker(headshot: boolean, kill: boolean, duration: number): void {
    this.crosshairEl.classList.toggle('hs', headshot);
    this.crosshairEl.classList.toggle('kill', kill);
    this.crosshairEl.classList.add('hit');
    if (this.hitTimer !== null) clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => {
      this.crosshairEl.classList.remove('kill', 'hit', 'hs');
      this.hitTimer = null;
    }, duration);
  }

  setLowHealth(on: boolean): void {
    this.root.querySelector('#lowvignette')!.classList.toggle('on', on);
  }

  setFPS(fps: number): void {
    this.fpsEl.textContent = `${fps.toFixed(0)} FPS`;
  }

  /** the in-game overlay root — touch controls mount here so they share its visibility */
  get container(): HTMLElement {
    return this.root;
  }

  showTitle(opts: {
    seed: number;
    best?: number;
    /** touch device: the controls line names the thumbs instead of WASD / mouse */
    touch?: boolean;
    /** saved run: shows "Continue · Sector N" as the primary button */
    continueSector?: number;
    /** "Sector 3" / "Depth 7" for the Continue button */
    continueLabel?: string;
    /** deepest endless depth reached on this device (0 = never) */
    bestDepth?: number;
    onStart: () => void;
    onContinue?: () => void;
    /** omitted on platforms without co-op (Poki build) */
    onCoop?: () => void;
    /** the next weapon skin to earn (null = all owned) and how far along it is */
    next?: { skin: SkinDef; have: number } | null;
    /** skins owned so far; with any, the strip opens the Armory */
    skinsOwned?: number;
    onArmory?: () => void;
    /** "NEW SECTOR" banner for the Biofoundry: returning players only, until they reach it */
    newSector?: boolean;
    /**
     * Has played before (the first-run tips are done): they know the goal,
     * so the goal line, the three step tiles and the controls line are left
     * out — on a phone the full stack overflowed the screen.
     */
    returning?: boolean;
    onSettings: () => void;
    /** Survival is PLAY (the main mode since 2026-10-23); the campaign moves to a quiet row */
    onSurvival?: () => void;
    /** best Survival wave reached on this device (0 = never) */
    survivalBest?: number;
  }): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.id = 'title-screen';
    el.className = 'tscreen';
    const cont = opts.continueSector && opts.onContinue ? opts.continueSector : 0;
    // one line of controls, first visit on desktop only: the first run's hint
    // strip teaches the rest, and on touch it teaches the thumbs in play
    const controls = '<b>WASD</b> move<i>&middot;</i><b>MOUSE</b> aim<i>&middot;</i><b>CLICK</b> shoot';
    const showGoal = !opts.returning;
    const showControls = !opts.returning && !opts.touch;
    // the goal, as the three steps the in-game objective tracker walks through
    const step = (n: number, icon: string, color: string, text: string): string =>
      `<div class="tstep" style="--c:${color}"><span class="tstep-n">${n}</span><span class="tstep-icon">${icon}</span><span class="tstep-text">${text}</span></div>`;
    const survival = !!opts.onSurvival;
    const foot = [
      survival && opts.survivalBest ? `BEST WAVE ${opts.survivalBest}` : '',
      opts.best ? `BEST SCORE ${opts.best.toLocaleString()}` : '',
      opts.bestDepth ? `DEEPEST: DEPTH ${opts.bestDepth}` : '',
    ].filter(Boolean).join(' &middot; ');
    // the next skin to earn: a goal for the very first run; the Armory
    // itself is the top-left corner button
    const nx = opts.next;
    const owned = opts.skinsOwned ?? 0;
    const nextUnlock = nx
      ? `<div id="next-unlock" class="next-unlock"><span class="nu-label">Next skin</span>${swatchHtml(nx.skin.swatch)}<b>${nx.skin.name} ${WEAPON_LABEL[nx.skin.weapon]}</b><span>${needText(nx.skin)}</span><span class="nu-bar"><i style="width:${Math.min(100, (nx.have / nx.skin.need.n) * 100)}%"></i></span><span>${Math.min(nx.have, nx.skin.need.n)}/${nx.skin.need.n}</span></div>`
      : `<div id="next-unlock" class="next-unlock"><span class="nu-label">All ${SKINS.length} skins unlocked</span></div>`;
    const armoryBtn = opts.onArmory
      ? `<button id="title-armory-btn" class="title-armory" aria-label="Armory" title="Armory: weapon skins">${ICONS.armory(18)}<span>Armory</span><small>${owned}/${SKINS.length}</small></button>`
      : '';
    el.innerHTML = `
      <button id="title-settings-btn" class="title-gear" aria-label="Settings" title="Settings">${ICONS.gear(20)}</button>
      ${armoryBtn}
      <div class="title-center">
        <canvas id="title-logo"></canvas>
        ${showGoal && survival ? `<div class="title-goal">Survive the waves</div>
        <div id="title-steps" class="tsteps">
          ${step(1, ICONS.boss(28), '#ff3428', 'Clear each<br>wave')}
          <span class="tstep-sep">&#9656;</span>
          ${step(2, ICONS.armory(28), '#ffd028', 'Pick an<br>upgrade')}
          <span class="tstep-sep">&#9656;</span>
          ${step(3, ICONS.pad(28), '#4cc26a', 'Beat your<br>best')}
        </div>` : ''}
        ${showGoal && !survival ? `<div class="title-goal">Escape the facility</div>
        <div id="title-steps" class="tsteps">
          ${step(1, ICONS.keycard(28), '#ff3428', 'Find the<br>red keycard')}
          <span class="tstep-sep">&#9656;</span>
          ${step(2, ICONS.door(28), '#ff3428', 'Open the<br>red door')}
          <span class="tstep-sep">&#9656;</span>
          ${step(3, ICONS.lift(28), '#4cc26a', 'Ride the<br>lift out')}
        </div>` : ''}
        ${opts.newSector ? `<div id="new-sector" class="new-sector" role="note">
          <span class="ns-tag">NEW SECTOR</span>
          <span class="ns-text"><b>THE GEOTHERMAL CORE</b><i>&middot;</i>SECTORS 6&ndash;7<i>&middot;</i>MIND THE HEAT</span>
        </div>` : ''}
        ${survival ? `<div class="title-menu">
          <button id="play-btn" class="tbtn tbtn-primary tbtn-play">Play</button>
          <div class="title-menu-row">
            ${cont ? `<button id="continue-btn" class="tbtn tbtn-quiet">Campaign &middot; ${opts.continueLabel ?? `Sector ${cont}`}</button>
            <button id="start-btn" class="tbtn tbtn-quiet">New campaign</button>` : '<button id="start-btn" class="tbtn tbtn-quiet">Campaign</button>'}
          </div>
          ${opts.onCoop ? '<div class="title-menu-row"><button id="coop-btn" class="tbtn tbtn-quiet">Co-op</button></div>' : ''}
        </div>` : `<div class="title-menu${cont ? ' title-menu-pair' : ''}">
          ${cont
            ? `<button id="continue-btn" class="tbtn tbtn-primary tbtn-play">Continue &middot; ${opts.continueLabel ?? `Sector ${cont}`}</button>
              <button id="start-btn" class="tbtn tbtn-quiet tbtn-newrun">New run</button>`
            : '<button id="start-btn" class="tbtn tbtn-primary tbtn-play">Play</button>'}
          ${opts.onCoop ? '<div class="title-menu-row"><button id="coop-btn" class="tbtn tbtn-quiet">Co-op</button></div>' : ''}
        </div>`}
        ${showControls ? `<div class="title-controls">${controls}</div>` : ''}
      </div>
      <div class="title-foot has-mid">
        <span>${foot}</span>
        ${nextUnlock}
        <span>VOXELSTRIKE ${__APP_VERSION__}</span>
      </div>
    `;
    document.body.appendChild(el);
    this.screenEl = el;
    // the gameplay HUD has no business on the menu
    this.root.style.visibility = 'hidden';

    this.logoStop = startVoxelLogo(el.querySelector('#title-logo') as HTMLCanvasElement, 'VOXELSTRIKE');

    el.querySelector('#start-btn')!.addEventListener('click', () => opts.onStart());
    el.querySelector('#play-btn')?.addEventListener('click', () => opts.onSurvival?.());
    el.querySelector('#continue-btn')?.addEventListener('click', () => opts.onContinue?.());
    el.querySelector('#title-settings-btn')!.addEventListener('click', () => opts.onSettings());
    el.querySelector('#coop-btn')?.addEventListener('click', () => opts.onCoop?.());
    el.querySelector('#title-armory-btn')?.addEventListener('click', () => opts.onArmory?.());
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') {
        if (survival) opts.onSurvival?.();
        else if (cont) opts.onContinue?.();
        else opts.onStart();
      }
    };
    window.addEventListener('keydown', this.titleKey);
  }

  /** co-op lobby: host with a room code, or join a partner's code */
  showCoop(opts: { onHost: () => void; onJoin: (code: string) => void; onBack: () => void }): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.id = 'coop-screen';
    el.className = 'tscreen';
    el.innerHTML = `
      <div class="title-center">
        <canvas id="coop-logo"></canvas>
        <div class="title-tag">Two Guns Are Better</div>
        <div class="setlist">
          <div class="setrow">
            <label>Host a run</label>
            <div class="setctl">
              <span id="coop-mycode" class="coop-code-display" hidden></span>
              <button id="coop-host" class="tbtn tbtn-quiet tbtn-mini">HOST</button>
            </div>
          </div>
          <div class="setrow">
            <label for="coop-code">Join a partner</label>
            <div class="setctl">
              <input id="coop-code" class="coop-input" maxlength="4" placeholder="CODE" autocomplete="off">
              <button id="coop-join" class="tbtn tbtn-quiet tbtn-mini">JOIN</button>
            </div>
          </div>
        </div>
        <div id="coop-status" class="coop-status">Play the same dungeon together — enemies hunt you both.</div>
        <div class="title-menu">
          <button id="coop-back" class="tbtn tbtn-primary">Back</button>
        </div>
      </div>
      <div class="title-foot">
        <span>CO-OP CAMPAIGN &middot; KEYS ARE SHARED &middot; NO FRIENDLY FIRE</span>
        <span>VOXELSTRIKE ${__APP_VERSION__}</span>
      </div>
    `;
    document.body.appendChild(el);
    this.screenEl = el;
    this.root.style.visibility = 'hidden';
    this.logoStop = startVoxelLogo(el.querySelector('#coop-logo') as HTMLCanvasElement, 'COOP', [110, 220, 255]);
    const codeInput = el.querySelector('#coop-code') as HTMLInputElement;
    codeInput.addEventListener('input', () => {
      codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    el.querySelector('#coop-host')!.addEventListener('click', () => opts.onHost());
    el.querySelector('#coop-join')!.addEventListener('click', () => {
      if (codeInput.value.length >= 4) opts.onJoin(codeInput.value);
      else this.coopStatus('Enter the 4-character room code first.');
    });
    el.querySelector('#coop-back')!.addEventListener('click', () => opts.onBack());
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Escape') opts.onBack();
      if ((ev.code === 'Enter' || ev.code === 'NumpadEnter') && codeInput.value.length >= 4) opts.onJoin(codeInput.value);
    };
    window.addEventListener('keydown', this.titleKey);
  }

  coopStatus(text: string): void {
    const el = document.querySelector('#coop-status');
    if (el) el.textContent = text;
  }

  /** show the generated room code big and bright, right beside HOST */
  coopShowCode(code: string): void {
    const el = document.querySelector('#coop-mycode') as HTMLElement | null;
    if (el) {
      el.textContent = code;
      el.hidden = false;
    }
    const btn = document.querySelector('#coop-host') as HTMLButtonElement | null;
    if (btn) {
      btn.textContent = 'WAITING';
      btn.disabled = true;
    }
  }

  /** co-op client between-levels screen — no button, the host drives */
  showWaiting(heading: string, stats: string, prompt: string): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.className = 'screen';
    el.innerHTML = `<div class="panel">
      <h1 class="win">${heading}</h1>
      <p>${stats}</p>
      <div class="prompt">${prompt}</div>
    </div>`;
    document.body.appendChild(el);
    this.screenEl = el;
  }

  /**
   * Solo death. The main retry is from the keycard when one was taken this
   * sector (in place, the world as you left it), else from the sector start.
   * `revive` offers getting up where you fell, once per sector attempt:
   * 'ad' = a Poki rewarded video (clapperboard icon, says so up front),
   * 'free' = other builds. Poki's rule for rewarded buttons: never the green
   * one, and an equal-size normal button beside it — that is the retry.
   * Enter/Space always means retry, never the ad.
   */
  showDeath(o: {
    stats: string;
    sector: number;
    /** 'depth' past the campaign */
    unit?: 'sector' | 'depth';
    keycard: boolean;
    revive: 'ad' | 'free' | null;
    /** scrap from this attempt and the total to spend */
    scrap?: { gained: number; total: number };
    /** Survival: "Try again" / "Main menu" instead of the sector retry / New run */
    retryText?: string;
    newRunText?: string;
    onUpgrades?: () => void;
    onRetry: () => void;
    onRestart: () => void;
    onRevive: () => void;
    onNewRun: () => void;
  }): void {
    const unit = o.unit ?? 'sector';
    const retryLabel = o.retryText ?? (o.keycard ? 'Retry from keycard' : `Retry ${unit} ${o.sector}`);
    const revive = o.revive
      ? `<button id="revive-btn" class="tbtn tbtn-revive">${o.revive === 'ad' ? `${ICONS.ad(15)}<span>Revive &middot; Watch ad</span>` : '<span>Revive here</span>'}</button>`
      : '';
    const hints: string[] = [];
    if (o.revive) hints.push(o.revive === 'ad' ? 'Revive: watch a video, get up where you fell (once per sector)' : 'Revive: get up where you fell (once per sector)');
    hints.push(o.keycard ? 'Retry: back at the keycard with the gear you had' : 'Retry: the sector restarts with the gear you brought in');
    hints.push('ENTER / SPACE to retry');
    this.showButtonScreen(`
      <h1>YOU DIED</h1>
      <p>${o.stats}</p>
      ${o.scrap ? `<div class="death-scrap">+${o.scrap.gained} SCRAP &middot; ${o.scrap.total} to spend</div>` : ''}
      <div class="screen-btns">
        <div class="tbtn-row death-main${o.revive ? ' pair' : ''}">
          ${revive}
          <button id="retry-btn" class="tbtn tbtn-primary">${retryLabel}</button>
        </div>
        <div class="tbtn-row">
          ${o.keycard ? `<button id="restart-btn" class="tbtn tbtn-quiet">Restart ${unit} ${o.sector}</button>` : ''}
          ${o.onUpgrades ? '<button id="upgrades-btn" class="tbtn tbtn-quiet">Upgrades</button>' : ''}
          <button id="newrun-btn" class="tbtn tbtn-quiet">${o.newRunText ?? 'New run'}</button>
        </div>
      </div>
      <div class="keyhint">${hints.join(' &middot; ')}</div>
    `, {
      '#retry-btn': o.onRetry,
      '#restart-btn': o.onRestart,
      '#revive-btn': o.onRevive,
      '#newrun-btn': o.onNewRun,
      '#upgrades-btn': () => o.onUpgrades?.(),
    }, o.onRetry);
  }

  /** the rewarded video didn't play: say so and take the offer off the screen */
  reviveUnavailable(): void {
    const btn = this.screenEl?.querySelector('#revive-btn') as HTMLButtonElement | null;
    if (!btn) return;
    btn.disabled = true;
    btn.innerHTML = '<span>No video available</span>';
    btn.classList.add('spent');
  }

  /** after an ad the desktop needs a fresh click to re-capture the mouse */
  showClickToResume(onClick: () => void): void {
    this.showScreen(`
      <h1 class="win">READY</h1>
      <div class="prompt">CLICK TO CONTINUE</div>
    `, onClick, 0);
  }

  private gfxLostEl: HTMLElement | null = null;

  /**
   * WebGL context lost: an overlay above everything. A reload button appears
   * after 4s in case the browser never gives the context back (iOS Safari
   * blocks pages that lose it repeatedly).
   */
  setGraphicsLost(on: boolean, onReload: () => void): void {
    if (!on) {
      this.gfxLostEl?.remove();
      this.gfxLostEl = null;
      return;
    }
    if (this.gfxLostEl) return;
    const el = document.createElement('div');
    el.className = 'screen';
    el.style.zIndex = '30';
    el.style.cursor = 'default';
    el.innerHTML = `<div class="panel">
      <h1 style="font-size:34px">GRAPHICS LOST</h1>
      <p>Your device paused the game's graphics. Recovering&hellip;</p>
      <div class="screen-btns"><button class="tbtn tbtn-primary" hidden>Reload game</button></div>
      <div class="keyhint">Progress from cleared sectors is saved.</div>
    </div>`;
    const btn = el.querySelector('button') as HTMLButtonElement;
    btn.addEventListener('click', () => onReload());
    window.setTimeout(() => (btn.hidden = false), 4000);
    document.body.appendChild(el);
    this.gfxLostEl = el;
  }

  /** co-op client: the host's connection is gone — the run is over */
  showDisconnected(onLeave: () => void): void {
    this.showScreen(`
      <h1>LINK LOST</h1>
      <p>The host's connection dropped. The facility can't run without them.</p>
      <div class="prompt">RETURNING TO THE MENU...</div>
    `, onLeave);
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
            <label>Aim assist</label>
            <div class="setctl">
              <span class="sethint">touch devices only</span>
              <button id="set-assist" class="tbtn tbtn-quiet tbtn-mini"></button>
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
        <span>VOXELSTRIKE ${__APP_VERSION__}</span>
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
    const assist = q<HTMLButtonElement>('#set-assist');

    const refresh = (): void => {
      q('#val-sens').textContent = s.sensitivity.toFixed(1);
      q('#val-vol').textContent = `${Math.round(s.volume * 100)}%`;
      q('#val-music').textContent = `${Math.round(s.musicVolume * 100)}%`;
      q('#val-fov').textContent = `${s.fov}°`;
      res.textContent = `${s.resolution}p`;
      shake.textContent = s.shake ? 'ON' : 'OFF';
      assist.textContent = s.aimAssist ? 'ON' : 'OFF';
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
    assist.addEventListener('click', () => { s.aimAssist = !s.aimAssist; apply(); });
    q('#set-newlayout').addEventListener('click', () => opts.onNewLayout());
    q('#settings-back').addEventListener('click', () => opts.onBack());
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Escape') opts.onBack();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  /** between-levels screen */
  showIntermission(sector: number, stats: string, saved: boolean, onNext: () => void): void {
    this.showScreen(`
      <h1 class="win">SECTOR ${sector} CLEARED</h1>
      <p>${stats}</p>
      ${saved ? `<p>Progress saved &mdash; you can continue from sector ${sector + 1} later.</p>` : ''}
      <div class="prompt">CLICK TO DESCEND TO SECTOR ${sector + 1}</div>
    `, onNext);
  }

  /** `onMenu` adds a "Main menu" button (solo); co-op has just the one action */
  showWin(stats: string, onAgain: () => void, onMenu?: () => void): void {
    this.showButtonScreen(`
      <h1 class="win">CAMPAIGN COMPLETE</h1>
      <p>All sectors cleared. The facility is silent.</p>
      <p>${stats}</p>
      <div class="screen-btns">
        <button id="again-btn" class="tbtn tbtn-primary">Play a new layout</button>
        ${onMenu ? '<div class="tbtn-row"><button id="menu-btn" class="tbtn tbtn-quiet">Main menu</button></div>' : ''}
      </div>
    `, { '#again-btn': onAgain, '#menu-btn': onMenu ?? onAgain }, onAgain, 1200);
  }

  showPause(
    stats: {
      sector: number; totalSectors: number;
      kills: number; totalEnemies: number;
      secrets: number; totalSecrets: number;
      time: string; score: number; seed: number;
    },
    onResume: () => void,
    onQuit: () => void,
    onSettings: () => void,
    quitLabel = 'Main menu',
    touch = false,
    onArmory?: () => void,
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
          <span>${stats.sector > stats.totalSectors ? `DEPTH <b class="hz">${stats.sector}</b>` : `SECTOR <b class="hz">${stats.sector}</b> OF ${stats.totalSectors}`}</span>
          <span>KILLS <b>${stats.kills} / ${stats.totalEnemies}</b></span>
          <span>SECRETS <b>${stats.secrets} / ${stats.totalSecrets}</b></span>
          <span>TIME <b>${stats.time}</b></span>
          <span>SCORE <b>${stats.score.toLocaleString()}</b></span>
        </div>
        <div class="title-menu">
          <button id="resume-btn" class="tbtn tbtn-primary">Resume</button>
          <div class="title-menu-row">
            <button id="pause-settings-btn" class="tbtn tbtn-quiet">Settings</button>
            ${onArmory ? '<button id="pause-armory-btn" class="tbtn tbtn-quiet">Armory</button>' : ''}
            <button id="pause-newrun-btn" class="tbtn tbtn-quiet">${quitLabel}</button>
          </div>
        </div>
      </div>
      <div class="title-foot">
        <span>LAYOUT ${seedHex}</span>
        <span>${touch ? 'TAP RESUME TO CONTINUE' : 'ENTER / SPACE OR RESUME TO CONTINUE'}</span>
      </div>
    `;
    document.body.appendChild(el);
    this.screenEl = el;
    this.root.style.visibility = 'hidden';
    this.logoStop = startVoxelLogo(el.querySelector('#pause-logo') as HTMLCanvasElement, 'PAUSED', [176, 188, 210]);
    el.querySelector('#resume-btn')!.addEventListener('click', () => onResume());
    el.querySelector('#pause-newrun-btn')!.addEventListener('click', () => onQuit());
    el.querySelector('#pause-settings-btn')!.addEventListener('click', () => onSettings());
    el.querySelector('#pause-armory-btn')?.addEventListener('click', () => onArmory?.());
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') onResume();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  /**
   * Facility terminal between sectors: the lines type out (any click / Enter /
   * Space prints the rest at once), then one more press descends — a short
   * glitch, the screen collapses like a CRT switching off, and a violet-tinted
   * fade reveals the new sector, which `onDone` starts underneath it.
   * `onContinue` runs inside that click, a fresh gesture, so the game can
   * grab pointer lock there even right after an ad.
   */
  showTerminal(o: {
    title: string;
    node: string;
    lines: TerminalLine[];
    touch: boolean;
    onChar: () => void;
    onContinue: () => void;
    onPowerOff: () => void;
    onDone: () => void;
  }): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.className = 'term-screen';
    el.innerHTML = `
      <div class="term">
        <div class="term-head"><span>${o.title}</span><span>${o.node}</span></div>
        <div class="term-body" style="--term-lines:${o.lines.length}"></div>
        <div class="term-foot"><span class="term-hint">${o.touch ? 'TAP' : 'CLICK'} TO SKIP</span></div>
      </div>`;
    document.body.appendChild(el);
    this.screenEl = el;
    this.root.style.visibility = 'hidden';
    const hint = el.querySelector('.term-hint') as HTMLElement;
    let armed = false;
    let leaving = false;
    // the click that opened this screen can't also skip it
    window.setTimeout(() => (armed = true), 400);
    const run = typeLines(el.querySelector('.term-body') as HTMLElement, o.lines, {
      msPerChar: 14,
      startDelay: 450,
      onChar: o.onChar,
      onDone: () => {
        hint.textContent = `${o.touch ? 'TAP' : 'CLICK'} TO DESCEND`;
        hint.classList.add('ready');
        // a skip click must not also descend
        armed = false;
        window.setTimeout(() => (armed = true), 350);
      },
    });
    this.termRun = run;
    const press = (): void => {
      if (!armed || leaving) return;
      if (!run.done) {
        run.finish();
        return;
      }
      leaving = true;
      o.onContinue();
      el.classList.add('glitch');
      window.setTimeout(() => {
        el.classList.add('off');
        o.onPowerOff();
      }, 220);
      window.setTimeout(() => {
        if (this.screenEl !== el) return; // something else took the screen over
        this.hideScreen();
        const fade = document.createElement('div');
        fade.className = 'transit-fade';
        document.body.appendChild(fade);
        fade.addEventListener('animationend', () => fade.remove());
        window.setTimeout(() => fade.remove(), 1500);
        o.onDone();
      }, 220 + 480);
    };
    el.addEventListener('click', press);
    this.titleKey = (ev: KeyboardEvent) => {
      if (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space') press();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  /**
   * The sector-clear moment (solo). The tally rows land one by one, the score
   * counts up to the new total, the rank stamps in (S–C) with a NEW BEST RANK
   * flash when it beats this sector's best, then three perk cards — or, after
   * the last sector, the campaign results and buttons. A click / tap / Enter
   * during the animation skips to the end; the cards and buttons only arm
   * 0.5 s after they appear so a held trigger can't pick one. Keys 1–3 pick.
   */
  showSectorClear(o: {
    sector: number;
    nextSector: number | null;
    rows: Array<{ label: string; value: string; points: number }>;
    scoreFrom: number;
    scoreTo: number;
    rank: 'S' | 'A' | 'B' | 'C';
    newBest: boolean;
    prevBest: string | null;
    saved: boolean;
    touch: boolean;
    perks: Array<{ id: OfferId; name: string; short: string; desc: string }> | null;
    /** "+64 SCRAP · 312 to spend" under the tally */
    scrap?: string;
    final?: { totals: string; record: string };
    /** final screen: "Keep descending" into endless depths */
    onDescend?: () => void;
    onTick: () => void;
    onStamp: () => void;
    onPick?: (id: OfferId) => void;
    onContinue?: () => void;
    onAgain?: () => void;
    onMenu?: () => void;
  }): void {
    this.hideScreen();
    const tap = o.touch ? 'TAP' : 'CLICK';
    const fmt = (n: number): string => n.toLocaleString();
    const el = document.createElement('div');
    el.id = 'sector-clear';
    el.className = 'screen sc-screen';
    const rowsHtml = o.rows.map((r) => `
      <div class="sc-row"><span class="sc-l">${r.label}</span><span class="sc-v">${r.value}</span>
      <span class="sc-p${r.points > 0 ? '' : ' zero'}">${r.points > 0 ? `+${fmt(r.points)}` : '&mdash;'}</span></div>`).join('');
    const perks = o.perks ?? [];
    let after: string;
    if (o.final) {
      after = `
        <p class="sc-totals">${o.final.totals}</p>
        <p class="sc-totals">${o.final.record}</p>
        <div class="screen-btns">
          ${o.onDescend
            ? `<button id="descend-btn" class="tbtn tbtn-primary" disabled>Keep descending &middot; Depth ${o.sector + 1}</button>
          <div class="tbtn-row"><button id="again-btn" class="tbtn tbtn-quiet" disabled>Play a new layout</button><button id="menu-btn" class="tbtn tbtn-quiet" disabled>Main menu</button></div>`
            : `<button id="again-btn" class="tbtn tbtn-primary" disabled>Play a new layout</button>
          <div class="tbtn-row"><button id="menu-btn" class="tbtn tbtn-quiet" disabled>Main menu</button></div>`}
        </div>`;
    } else if (perks.length) {
      after = `
        <div class="sc-pick-title">CHOOSE A PERK</div>
        <div class="sc-perks">${perks.map((p, i) => `
          <button class="sc-perk" data-id="${p.id}" style="--pc:${perkColor(p.id)}" title="${p.desc}" disabled>
            <span class="sc-perk-ico">${perkIcon(p.id, 30)}</span>
            <span class="sc-perk-text"><b>${p.name}</b><span class="sc-perk-short">${p.short}</span></span>
            <span class="sc-perk-pick">${o.touch ? 'PICK' : `PICK <kbd>${i + 1}</kbd>`}</span>
          </button>`).join('')}
        </div>
        ${o.saved ? `<div class="sc-note">Progress saved &mdash; you can continue from sector ${o.nextSector} later. The perk carries over.</div>` : ''}`;
    } else {
      after = `<div class="prompt sc-descend">${tap} TO DESCEND TO SECTOR ${o.nextSector}</div>`;
    }
    el.innerHTML = `
      <div class="panel sc-panel">
        <div class="sc-head">
          <h1 class="win">${o.final ? 'CAMPAIGN COMPLETE' : `SECTOR ${o.sector} CLEARED`}</h1>
          <div class="sc-rank r-${o.rank}"><span class="sc-rank-label">RANK</span><span class="sc-rank-letter">${o.rank}</span></div>
        </div>
        <div class="sc-body">
          <div class="sc-tally">
            <div class="sc-rows">${rowsHtml}</div>
            ${o.scrap ? `<div class="sc-scrap">${o.scrap}</div>` : ''}
            <div class="sc-total"><span>SCORE</span><b id="sc-score">${fmt(o.scoreFrom)}</b></div>
            <div class="sc-best${o.newBest ? ' new' : ''}">${o.newBest ? 'NEW BEST RANK!' : o.prevBest ? `SECTOR ${o.sector} BEST: ${o.prevBest}` : ''}</div>
          </div>
          <div class="sc-after">${after}</div>
        </div>
        <div class="sc-skip">${tap} TO SKIP</div>
      </div>`;
    document.body.appendChild(el);
    this.screenEl = el;
    this.root.style.visibility = 'hidden';

    const rowEls = [...el.querySelectorAll<HTMLElement>('.sc-row')];
    const scoreEl = el.querySelector('#sc-score') as HTMLElement;
    const rankEl = el.querySelector('.sc-rank') as HTMLElement;
    const bestEl = el.querySelector('.sc-best') as HTMLElement;
    const afterEl = el.querySelector('.sc-after') as HTMLElement;
    const skipEl = el.querySelector('.sc-skip') as HTMLElement;
    const cards = [...el.querySelectorAll<HTMLButtonElement>('.sc-perk')];
    const timer = (fn: () => void, ms: number): void => {
      this.screenTimers.push(window.setTimeout(fn, ms));
    };
    let done = false;
    let armed = false;
    let picked = false;

    const arm = (): void => {
      armed = true;
      for (const c of cards) c.disabled = false;
      el.querySelector('.sc-perks')?.classList.add('armed');
      for (const b of el.querySelectorAll<HTMLButtonElement>('#again-btn, #menu-btn, #descend-btn')) b.disabled = false;
    };
    const finish = (): void => {
      if (done) return;
      done = true;
      for (const t of this.screenTimers) window.clearTimeout(t);
      this.screenTimers.length = 0;
      for (const r of rowEls) r.classList.add('on');
      scoreEl.textContent = fmt(o.scoreTo);
      rankEl.classList.add('stamp');
      o.onStamp();
      bestEl.classList.add('show');
      skipEl.style.visibility = 'hidden';
      timer(() => {
        afterEl.classList.add('show');
        timer(arm, 500);
      }, 380);
    };

    // the tally: rows land, then the score counts up, then the stamp
    const ROW_MS = 160;
    o.rows.forEach((_, i) => timer(() => {
      rowEls[i].classList.add('on');
      o.onTick();
    }, 250 + i * ROW_MS));
    const countAt = 250 + o.rows.length * ROW_MS + 120;
    const COUNT_MS = 900;
    const STEPS = 22;
    for (let s = 1; s <= STEPS; s++) {
      timer(() => {
        const k = s / STEPS;
        const ease = 1 - (1 - k) * (1 - k);
        scoreEl.textContent = fmt(Math.round(o.scoreFrom + (o.scoreTo - o.scoreFrom) * ease));
        if (s % 2 === 0) o.onTick();
      }, countAt + (COUNT_MS * s) / STEPS);
    }
    timer(finish, countAt + COUNT_MS + 120);

    const pick = (i: number): void => {
      if (!armed || picked || !cards[i]) return;
      picked = true;
      cards[i].classList.add('chosen');
      el.querySelector('.sc-perks')?.classList.add('picked');
      for (const c of cards) c.disabled = true;
      o.onPick?.(cards[i].dataset.id as OfferId);
    };
    cards.forEach((c, i) => c.addEventListener('click', (ev) => {
      ev.stopPropagation();
      pick(i);
    }));
    el.querySelector('#descend-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (armed) o.onDescend?.();
    });
    el.querySelector('#again-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (armed) o.onAgain?.();
    });
    el.querySelector('#menu-btn')?.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (armed) o.onMenu?.();
    });
    // anywhere else: skip the animation, or (no perks left to offer) descend
    el.addEventListener('click', () => {
      if (!done) finish();
      else if (armed && !o.final && !cards.length) o.onContinue?.();
    });
    this.titleKey = (ev: KeyboardEvent) => {
      const n = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(ev.code);
      if (n >= 0) {
        pick(n % 3);
        return;
      }
      if (ev.code !== 'Enter' && ev.code !== 'NumpadEnter' && ev.code !== 'Space') return;
      if (!done) finish();
      else if (armed && o.final) (o.onDescend ?? o.onAgain)?.();
      else if (armed && !cards.length) o.onContinue?.();
    };
    window.addEventListener('keydown', this.titleKey);
  }

  hideScreen(): void {
    this.root.style.visibility = 'visible';
    this.termRun?.stop();
    this.termRun = null;
    for (const t of this.screenTimers) window.clearTimeout(t);
    this.screenTimers.length = 0;
    this.logoStop?.();
    this.logoStop = null;
    if (this.titleKey) {
      window.removeEventListener('keydown', this.titleKey);
      this.titleKey = null;
    }
    this.screenEl?.remove();
    this.screenEl = null;
  }

  /**
   * Click-anywhere screen. It "arms" after `armMs`: until then clicks are
   * ignored (dimmed prompt), so a trigger finger still held from the firefight
   * that just ended can't skip the death/clear screen by accident.
   */
  private showScreen(html: string, onClick: () => void, armMs = 700): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.className = armMs > 0 ? 'screen arming' : 'screen';
    el.innerHTML = `<div class="panel">${html}</div>`;
    let armed = armMs <= 0;
    if (!armed) {
      window.setTimeout(() => {
        armed = true;
        el.classList.remove('arming');
      }, armMs);
    }
    el.addEventListener('click', () => {
      if (armed) onClick();
    });
    document.body.appendChild(el);
    this.screenEl = el;
  }

  /** screen with real buttons (selector → handler), Enter/Space = `onEnter`, same arming */
  private showButtonScreen(
    html: string,
    handlers: Record<string, () => void>,
    onEnter: () => void,
    armMs = 700,
    screenClass = ''
  ): void {
    this.hideScreen();
    const el = document.createElement('div');
    el.className = `screen arming ${screenClass}`.trim();
    el.style.cursor = 'default';
    el.innerHTML = `<div class="panel">${html}</div>`;
    document.body.appendChild(el);
    this.screenEl = el;
    let armed = false;
    window.setTimeout(() => {
      armed = true;
      el.classList.remove('arming');
    }, armMs);
    for (const [sel, fn] of Object.entries(handlers)) {
      el.querySelector(sel)?.addEventListener('click', () => {
        if (armed) fn();
      });
    }
    this.titleKey = (ev: KeyboardEvent) => {
      if (armed && (ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Space')) onEnter();
    };
    window.addEventListener('keydown', this.titleKey);
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
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
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
