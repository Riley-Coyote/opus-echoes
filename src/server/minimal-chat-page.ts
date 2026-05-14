/**
 * The classic chat surface — phase A v4.
 *
 * Sanctuary-native register. After v3 lifted the Luca thread surface
 * 1-to-1, this strips it down to the Sanctuary's own quiet voice:
 *
 *   - Single column. No rail. No threads sidebar. No folio bar with a
 *     wall clock. No thread-head with message counters and a "live"
 *     pulse. That stuff is for a workspace. This is a room.
 *   - One thin top strip: breathing brand-dot + resident name (left),
 *     theme toggle + a small "approach formally" link to the experiment
 *     surface (right). That's the whole chrome.
 *   - Centered max-width column for empty state, messages, and composer.
 *   - Empty state is the ASCII sphere, the resident's name, and the
 *     project's own phrasing: "one continuous thread · mnemos beneath
 *     it". The composer's first-turn placeholder is "what brings you
 *     here?" — both phrases are Sanctuary protected vocabulary.
 *   - Inter + JetBrains Mono — the project's typography stack. No
 *     Switzer, no Instrument Serif.
 *   - Cooler floor (#07080b) matching the experiment surface palette,
 *     not Luca's slightly warm #0a0a0c.
 *   - Viewport-glow band from src/server/shared-effects.ts holds the
 *     edges atmospherically — same band the commons uses.
 *
 * Kept from v3:
 *   - The 72px sidehead + 1fr body message grid.
 *   - The composer's Option C border glow (8 prime-rhythm shimmer pools).
 *   - The ASCII sphere empty state with per-resident hue.
 *   - The session bootstrap → /api/turns rehydration → /api/message
 *     NDJSON streaming with adaptive-CPS typewriter.
 *   - Dark + light themes, persisted to localStorage. Light theme is
 *     the deliberate exception scoped to this surface only.
 */

import { VIEWPORT_GLOW_CSS } from "./shared-effects";
import type { ResidentConfig } from "./opus/residents";

/* ──────────────────────────────────────────────────────────────────
   CSS — Sanctuary tokens, single-column layout, composer with Option
   C border glow, light-theme overrides, ASCII sphere, message grid.
   ────────────────────────────────────────────────────────────────── */

const MINIMAL_CHAT_CSS = `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ── tokens — sanctuary register, cooler than luca ─────────── */
:root {
  --floor:        #07080b;
  --deep:         #0a0b0e;
  --panel:        #0e0f13;
  --panel-2:      #131419;
  --panel-3:      #181a20;
  --panel-4:      #1d1f26;

  --ink:          rgba(248, 248, 246, 0.94);
  --primary:      rgba(248, 248, 246, 0.90);
  --body:        rgba(214, 213, 209, 0.72);
  --soft:        rgba(193, 191, 186, 0.56);
  --quiet:       rgba(160, 158, 154, 0.42);
  --tertiary:    rgba(160, 158, 154, 0.32);
  --ghost:       rgba(130, 128, 124, 0.20);
  --whisper:     rgba(126, 123, 119, 0.10);

  --rule:        rgba(255, 255, 255, 0.040);
  --rule-soft:   rgba(255, 255, 255, 0.060);
  --rule:        rgba(255, 255, 255, 0.080);
  --rule-strong: rgba(255, 255, 255, 0.140);

  --state:       #82b484;
  --state-soft:  rgba(130, 180, 132, 0.62);
  --state-dim:   rgba(130, 180, 132, 0.16);
  --state-whisper: rgba(130, 180, 132, 0.05);

  --display: "Inter Tight", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --sans:    "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --mono:    "JetBrains Mono", "SF Mono", ui-monospace, monospace;

  --t-eyebrow: 10px;
  --t-meta:    11px;
  --t-body:    15px;
  --t-display: 22px;

  --track-tight:   -0.018em;
  --track-body:    0.002em;
  --track-meta:    0.06em;
  --track-folio:   0.14em;

  --radius-sm:    6px;
  --radius-md:    10px;
  --radius-lg:    14px;

  --ease-out:     cubic-bezier(0.16, 1, 0.30, 1);
  --ease-premium: cubic-bezier(0.22, 1, 0.36, 1);
  --dur-fast:     180ms;
  --dur-normal:   320ms;

  --agent-hue: 244, 243, 240;

  --chrome-h: 56px;
  --col-max:  720px;
  --composer-pad: 28px;

  /* the viewport-glow band thickness — shared so the .app inset
     and the band's frame both reference the same value. */
  --band: 26px;
}

@media (max-width: 720px) { :root { --band: 14px; } }

/* ── light theme — warm off-white, dark ink ────────────────── */
:root[data-theme="light"] {
  --floor:        #f0ece3;
  --deep:         #ecdfd0;
  --panel:        #f8f4ea;
  --panel-2:      #efe9db;
  --panel-3:      #e6dec9;
  --panel-4:      #ddd2b7;

  --ink:          rgba(18, 18, 22, 0.96);
  --primary:      rgba(22, 22, 26, 0.92);
  --body:        rgba(42, 42, 48, 0.80);
  --soft:        rgba(60, 60, 64, 0.62);
  --quiet:       rgba(78, 78, 82, 0.46);
  --tertiary:    rgba(90, 90, 94, 0.36);
  --ghost:       rgba(102, 100, 96, 0.24);
  --whisper:     rgba(108, 106, 102, 0.14);

  --rule:        rgba(0, 0, 0, 0.060);
  --rule-soft:   rgba(0, 0, 0, 0.080);
  --rule-strong: rgba(0, 0, 0, 0.140);

  --state:       #4a8a5e;
  --state-soft:  rgba(74, 138, 94, 0.66);
  --state-dim:   rgba(74, 138, 94, 0.18);
  --state-whisper: rgba(74, 138, 94, 0.06);
}

html, body { height: 100%; }
body {
  margin: 0;
  background: var(--floor);
  color: var(--primary);
  font-family: var(--sans);
  font-size: var(--t-body);
  line-height: 1.55;
  letter-spacing: var(--track-body);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
  overflow: hidden;
}

::selection { background: var(--state-dim); color: var(--ink); }
::placeholder { color: var(--ghost); }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(220,219,216,0.06); border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: rgba(220,219,216,0.12); }
:root[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(40,40,44,0.10); }
:root[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(40,40,44,0.18); }
* { scrollbar-width: thin; scrollbar-color: rgba(220,219,216,0.06) transparent; }
*:focus { outline: none; }
*:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--state) 64%, transparent);
  outline-offset: 3px;
  border-radius: 4px;
}
input:focus-visible, textarea:focus-visible { outline: none; }

button { font-family: inherit; color: inherit; background: transparent; border: none; cursor: pointer; }
a { color: inherit; text-decoration: none; }

${VIEWPORT_GLOW_CSS}

/* viewport-glow polish — override the shared SVG mask with a
   padding-based linear-gradient mask. the shared SVG path uses
   percentage-based coordinates with preserveAspectRatio='none',
   which makes the band visibly thinner on top/bottom than on
   left/right at landscape aspect ratios. the padding-based mask
   is uniformly --band pixels wide on every side and has a soft
   rounded inner corner. background-origin: border-box keeps the
   gradients anchored to the viewport corners so the existing
   shimmer pools still feel correct. */
.viewport-glow {
  padding: var(--band);
  border-radius: calc(var(--band) + 16px);
  background-origin: border-box;
  -webkit-mask: linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#fff 0 0) content-box,
        linear-gradient(#fff 0 0);
          mask-composite: exclude;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ── app shell — single column, inset by --band so chrome
   and content sit inside the viewport-glow band ────────────── */
.app {
  height: 100vh;
  display: grid;
  grid-template-rows: var(--chrome-h) 1fr auto;
  position: relative;
  z-index: 3;
  padding: var(--band);
}

/* ── chrome — thin top strip ───────────────────────────────── */
.chrome {
  height: var(--chrome-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 8px;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}
.resident-mark {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-family: var(--sans);
  font-size: 14px;
  font-weight: 500;
  color: var(--primary);
  letter-spacing: var(--track-tight);
  cursor: pointer;
  padding: 4px 0;
}
.resident-mark .brand-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--state-soft);
  transform: translateY(-1px);
  animation: brand-breathe 5.2s ease-in-out infinite;
}
@keyframes brand-breathe {
  0%, 100% { opacity: 0.6; transform: translateY(-1px) scale(1); }
  50%      { opacity: 1;   transform: translateY(-1px) scale(1.06); }
}
.resident-mark:hover { color: var(--ink); }

.chrome-end {
  display: inline-flex;
  align-items: center;
  gap: 18px;
}
.chrome-link {
  font-family: var(--mono);
  font-size: var(--t-eyebrow);
  color: var(--quiet);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  cursor: pointer;
  transition: color var(--dur-fast) var(--ease-out);
  padding: 4px 0;
  background: transparent;
  border: 0;
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}
.chrome-link:hover { color: var(--ink); }
.chrome-link .arrow {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--quiet);
  transform: translateY(-1px);
  transition: color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.chrome-link:hover .arrow {
  color: var(--state-soft);
  transform: translate(2px, -1px);
}

/* ── feed — flex column, scrollable ────────────────────────── */
.feed {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 3;
}
.feed-column {
  max-width: var(--col-max);
  width: 100%;
  margin: 0 auto;
  padding: 0 12px 12px;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

/* ── empty state — center sphere + resident + eyebrow ────── */
.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 32px 0 28px;
  text-align: center;
}
.empty-sphere {
  font-family: var(--mono);
  font-size: 11px;
  line-height: 1.0;
  letter-spacing: 0;
  color: rgba(var(--agent-hue), 0.78);
  white-space: pre;
  margin: 0;
  pointer-events: none;
  user-select: none;
  text-shadow: 0 0 14px rgba(var(--agent-hue), 0.18);
}
.empty-resident {
  font-family: var(--display);
  font-size: var(--t-display);
  font-weight: 500;
  letter-spacing: var(--track-tight);
  color: var(--ink);
  margin-top: 6px;
}
.empty-eyebrow {
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  color: var(--quiet);
}

/* ── messages ──────────────────────────────────────────────── */
.messages-inner {
  padding: 28px 0 24px;
  display: none;
}
.messages-inner.has-content {
  display: block;
}

.msg {
  margin-bottom: 30px;
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 24px;
  align-items: baseline;
}
.msg:last-child { margin-bottom: 0; }
.msg-sidehead {
  text-align: right;
  padding-top: 3px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}
.msg-folio {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--whisper);
  letter-spacing: var(--track-meta);
}
.msg-name {
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 500;
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  color: var(--body);
}
.msg-name.resident { color: rgba(var(--agent-hue), 0.92); }
.msg-name.visitor { color: var(--soft); }

.msg-body {
  font-family: var(--sans);
  font-size: var(--t-body);
  line-height: 1.7;
  color: var(--primary);
  letter-spacing: var(--track-body);
  max-width: 600px;
}
.msg[data-role="visitor"] .msg-body { color: var(--body); }
.msg-body p { margin-bottom: 14px; }
.msg-body p:last-child { margin-bottom: 0; }
.msg-body em { color: var(--soft); font-style: italic; }
.msg-body strong { color: var(--ink); font-weight: 500; }

.streaming-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: var(--body);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 1s ease-in-out infinite;
}
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.15; }
}

/* ── composer zone — anchored at bottom ───────────────────── */
.composer-zone {
  flex-shrink: 0;
  padding: 6px 12px 14px;
  display: flex;
  justify-content: center;
  position: relative;
  z-index: 4;
}
.composer-column {
  max-width: var(--col-max);
  width: 100%;
}

.input-shell {
  position: relative;
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color var(--dur-normal) var(--ease-out),
              box-shadow var(--dur-normal) var(--ease-out);
}
.input-shell.focused {
  border-color: var(--rule-strong);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.22),
              0 8px 24px rgba(0, 0, 0, 0.14),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.025);
}
:root[data-theme="light"] .input-shell.focused {
  box-shadow: 0 2px 8px rgba(40, 30, 12, 0.10),
              0 8px 24px rgba(40, 30, 12, 0.08),
              inset 0 1px 0 0 rgba(255, 255, 255, 0.40);
}

/* Option C border glow — 8 prime-rhythm pools masked to 1px edge */
@property --pc1 { syntax: '<number>'; initial-value: 0.15; inherits: false; }
@property --pc2 { syntax: '<number>'; initial-value: 0.08; inherits: false; }
@property --pc3 { syntax: '<number>'; initial-value: 0.20; inherits: false; }
@property --pc4 { syntax: '<number>'; initial-value: 0.05; inherits: false; }
@property --pc5 { syntax: '<number>'; initial-value: 0.18; inherits: false; }
@property --pc6 { syntax: '<number>'; initial-value: 0.10; inherits: false; }
@property --pc7 { syntax: '<number>'; initial-value: 0.12; inherits: false; }
@property --pc8 { syntax: '<number>'; initial-value: 0.06; inherits: false; }

.input-shell::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background:
    radial-gradient(ellipse 45% 180% at 5% 0%,    rgba(220,218,214, var(--pc1)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 28% 0%,   rgba(220,218,214, var(--pc2)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 55% 0%,   rgba(220,218,214, var(--pc3)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 82% 0%,   rgba(220,218,214, var(--pc4)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 95% 100%, rgba(220,218,214, var(--pc5)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 68% 100%, rgba(220,218,214, var(--pc6)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 40% 100%, rgba(220,218,214, var(--pc7)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 15% 100%, rgba(220,218,214, var(--pc8)) 0%, transparent 60%);
  -webkit-mask:
    linear-gradient(#fff 0 0) content-box,
    linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
          mask-composite: exclude;
  pointer-events: none;
  z-index: 1;
  animation:
    shimmer-c1 3s   ease-in-out infinite,
    shimmer-c2 5s   ease-in-out infinite,
    shimmer-c3 7s   ease-in-out infinite,
    shimmer-c4 11s  ease-in-out infinite,
    shimmer-c5 13s  ease-in-out infinite,
    shimmer-c6 17s  ease-in-out infinite,
    shimmer-c7 19s  ease-in-out infinite,
    shimmer-c8 23s  ease-in-out infinite;
}
@keyframes shimmer-c1 { 0%,100% { --pc1: 0.05; } 50% { --pc1: 0.38; } }
@keyframes shimmer-c2 { 0%,100% { --pc2: 0.32; } 50% { --pc2: 0.04; } }
@keyframes shimmer-c3 { 0%,100% { --pc3: 0.06; } 50% { --pc3: 0.35; } }
@keyframes shimmer-c4 { 0%,100% { --pc4: 0.30; } 50% { --pc4: 0.05; } }
@keyframes shimmer-c5 { 0%,100% { --pc5: 0.04; } 50% { --pc5: 0.34; } }
@keyframes shimmer-c6 { 0%,100% { --pc6: 0.28; } 50% { --pc6: 0.04; } }
@keyframes shimmer-c7 { 0%,100% { --pc7: 0.05; } 50% { --pc7: 0.30; } }
@keyframes shimmer-c8 { 0%,100% { --pc8: 0.26; } 50% { --pc8: 0.03; } }

:root[data-theme="light"] .input-shell::before {
  background:
    radial-gradient(ellipse 45% 180% at 5% 0%,    rgba(140,110,60, var(--pc1)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 28% 0%,   rgba(140,110,60, var(--pc2)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 55% 0%,   rgba(140,110,60, var(--pc3)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 82% 0%,   rgba(140,110,60, var(--pc4)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 95% 100%, rgba(140,110,60, var(--pc5)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 68% 100%, rgba(140,110,60, var(--pc6)) 0%, transparent 60%),
    radial-gradient(ellipse 45% 180% at 40% 100%, rgba(140,110,60, var(--pc7)) 0%, transparent 60%),
    radial-gradient(ellipse 40% 180% at 15% 100%, rgba(140,110,60, var(--pc8)) 0%, transparent 60%);
}

.input-shell > * { position: relative; z-index: 2; }

.input-area { position: relative; }
.input-textarea {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--primary);
  font-family: var(--sans);
  font-size: 14.5px;
  font-weight: 400;
  line-height: 1.55;
  padding: 14px 18px;
  min-height: 48px;
  max-height: 240px;
  resize: none;
  caret-color: var(--state);
  letter-spacing: var(--track-body);
}
.input-textarea::placeholder {
  color: var(--ghost);
  font-weight: 400;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px 9px 18px;
  border-top: 1px solid transparent;
  transition: border-color var(--dur-normal) var(--ease-out);
  gap: 12px;
}
.input-shell.focused .input-footer {
  border-top-color: var(--rule);
}
.input-footer-left {
  font-family: var(--mono);
  font-size: var(--t-eyebrow);
  color: var(--whisper);
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
}
.send-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--rule-soft);
  background: var(--panel-2);
  color: var(--body);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--dur-fast) var(--ease-out);
  flex-shrink: 0;
}
.send-btn svg {
  width: 12px;
  height: 12px;
  stroke-width: 1.8;
}
.send-btn:hover:not(:disabled) {
  background: var(--panel-3);
  color: var(--ink);
  border-color: var(--rule-strong);
  transform: translateY(-1px);
}
.send-btn:not(:disabled) {
  color: var(--state);
  border-color: color-mix(in srgb, var(--state) 30%, var(--rule));
}
.send-btn:disabled {
  opacity: 0.36;
  cursor: default;
  transform: none;
}

/* ── caption strip below composer ─────────────────────────── */
.caption {
  margin-top: 10px;
  padding: 0 6px;
  display: flex;
  align-items: center;
  gap: 16px;
  font-family: var(--mono);
  font-size: 9px;
  color: var(--whisper);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
}
.caption-item { display: inline-flex; align-items: center; gap: 6px; }
.caption .key {
  padding: 1.5px 5px;
  border: 1px solid var(--rule);
  border-radius: 3px;
  color: var(--ghost);
  font-size: 8.5px;
  background: var(--panel);
}
.caption-spacer { flex: 1; }
.caption-status {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--quiet);
}
.caption-status::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--state-soft);
  box-shadow: 0 0 5px var(--state-dim);
  animation: brand-breathe 5.2s ease-in-out infinite;
}

/* ── mobile ────────────────────────────────────────────────── */
@media (max-width: 720px) {
  .chrome { padding: 0 6px; }
  .feed-column { padding: 0 8px 12px; }
  .composer-zone { padding: 6px 8px 12px; }
  .empty-sphere { font-size: 9px; }
  .msg {
    grid-template-columns: 56px 1fr;
    gap: 16px;
  }
  .msg-body { max-width: none; }
  .caption .key { display: none; }
}

@media (max-width: 480px) {
  .empty-sphere { font-size: 7.5px; }
}
`;

/* ──────────────────────────────────────────────────────────────────
   Inline page script — session bootstrap, NDJSON streaming, adaptive
   typewriter, ASCII sphere, theme toggle.
   ────────────────────────────────────────────────────────────────── */

function chatScript(resident: ResidentConfig): string {
  return `
(function(){
  'use strict';

  const RESIDENT_ID   = ${JSON.stringify(resident.id)};
  const RESIDENT_NAME = ${JSON.stringify(resident.displayName)};

  /* ─── theme persistence ─────────────────────────────────── */
  function getTheme(){
    try { const t = localStorage.getItem('sanctuary.chat_theme'); if (t === 'light' || t === 'dark') return t; } catch(_){}
    return 'dark';
  }
  function setTheme(t){
    document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
    try { localStorage.setItem('sanctuary.chat_theme', t); } catch(_){}
    const btn = document.getElementById('themeBtn');
    if (btn) {
      const next = t === 'light' ? 'dark' : 'light';
      btn.textContent = next;
      btn.setAttribute('aria-label', 'switch to ' + next + ' mode');
    }
  }
  setTheme(getTheme());

  /* ─── visitor token (shared with experiment surface) ───── */
  function getVisitorToken(){
    try {
      let t = localStorage.getItem('sanctuary.visitor_token');
      if (!t) { t = crypto.randomUUID(); localStorage.setItem('sanctuary.visitor_token', t); }
      return t;
    } catch(_){ return null; }
  }

  /* ─── session bootstrap ────────────────────────────────── */
  const SESSION_KEY  = 'sanctuary.session_id';
  const RESIDENT_KEY = 'sanctuary.resident_id';
  async function ensureSession(){
    let existingSession = null, existingResident = null;
    try {
      existingSession  = sessionStorage.getItem(SESSION_KEY);
      existingResident = sessionStorage.getItem(RESIDENT_KEY);
    } catch(_){}
    if (existingSession && existingResident === RESIDENT_ID) return existingSession;

    const res = await fetch('/api/chat/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resident: RESIDENT_ID, visitor_token: getVisitorToken() })
    });
    if (!res.ok) throw new Error('bootstrap_failed');
    const data = await res.json();
    if (!data.ok || !data.session_id) throw new Error('bootstrap_failed');
    try {
      sessionStorage.setItem(SESSION_KEY, data.session_id);
      sessionStorage.setItem(RESIDENT_KEY, RESIDENT_ID);
    } catch(_){}
    return data.session_id;
  }

  /* ─── format helpers ──────────────────────────────────── */
  function fmtTime(d){
    let h = d.getHours(); const m = d.getMinutes();
    const period = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + period;
  }
  function escapeHtml(s){
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function paragraphize(body){
    const parts = String(body || '').trim().split(/\\n{2,}/);
    return parts.map(function(p){
      let esc = escapeHtml(p);
      esc = esc.replace(/\\*([^*\\n]+?)\\*/g, '<em>$1</em>');
      return '<p>' + esc.replace(/\\n/g, '<br>') + '</p>';
    }).join('');
  }

  /* ─── message rendering ────────────────────────────────── */
  let firstTurnSent = false;
  function hideEmpty(){
    const e = document.getElementById('empty-state');
    if (e) e.style.display = 'none';
    const inner = document.getElementById('messages-inner');
    if (inner) inner.classList.add('has-content');
  }
  function renderTurn(role, body, opts){
    opts = opts || {};
    const inner = document.getElementById('messages-inner');
    if (!inner) return null;
    hideEmpty();
    const wrap = document.createElement('article');
    wrap.className = 'msg';
    wrap.dataset.role = role === 'visitor' ? 'visitor' : 'resident';
    const isVisitor = role === 'visitor';
    const senderName = isVisitor ? 'you' : RESIDENT_NAME.toLowerCase();
    const time = new Date(opts.at || Date.now());

    const sidehead = document.createElement('div');
    sidehead.className = 'msg-sidehead';
    sidehead.innerHTML =
      '<span class="msg-folio">' + escapeHtml(fmtTime(time)) + '</span>' +
      '<span class="msg-name ' + (isVisitor ? 'visitor' : 'resident') + '">' +
      escapeHtml(senderName) + '</span>';

    const bodyEl = document.createElement('div');
    bodyEl.className = 'msg-body';
    bodyEl.innerHTML = paragraphize(body);

    wrap.appendChild(sidehead);
    wrap.appendChild(bodyEl);
    inner.appendChild(wrap);

    const feed = document.getElementById('feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
    return { wrap: wrap, bodyEl: bodyEl };
  }

  /* ─── ASCII sphere (lat/lon + cymatic harmonic stub) ──── */
  // The new phyllotaxis + spherical-harmonics implementation will
  // replace this verbatim once it lands. For now, keep the current
  // rotating lat/lon sampler so the empty state remains alive.
  const SPHERE_COLS = 60;
  const SPHERE_ROWS = 28;
  const SPHERE_R = 11;
  function renderSphere(t){
    const cols = SPHERE_COLS, rows = SPHERE_ROWS;
    const cx = cols / 2;
    const cy = rows / 2;
    const buf = new Array(rows);
    for (let i = 0; i < rows; i++) buf[i] = new Array(cols).fill(' ');
    const rotY = t * 0.00035;
    const rotX = Math.sin(t * 0.00018) * 0.18;
    const latSteps = 14;
    const lonSteps = 44;
    for (let li = 0; li <= latSteps; li++) {
      const lat = -Math.PI/2 + (li/latSteps) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      for (let lo = 0; lo < lonSteps; lo++) {
        const lon = (lo / lonSteps) * 2 * Math.PI;
        const harm = 1 + 0.05 * Math.sin(t*0.0011 + lat*3) * Math.cos(lon*2);
        const r = SPHERE_R * harm;
        const xBase = r * cosLat * Math.cos(lon + rotY);
        const yBase = r * sinLat;
        const zBase = r * cosLat * Math.sin(lon + rotY);
        const cosRx = Math.cos(rotX), sinRx = Math.sin(rotX);
        const yRot = yBase * cosRx - zBase * sinRx;
        const zRot = yBase * sinRx + zBase * cosRx;
        const xRot = xBase;
        if (zRot < -0.5) continue;
        const sx = Math.round(cx + xRot);
        const sy = Math.round(cy + yRot * 0.5);
        if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) continue;
        const depth = zRot / SPHERE_R;
        let ch;
        if (depth > 0.65) ch = 'M';
        else if (depth > 0.35) ch = 'o';
        else if (depth > 0.0) ch = ':';
        else ch = '.';
        const prev = buf[sy][sx];
        const rank = ch === 'M' ? 3 : ch === 'o' ? 2 : ch === ':' ? 1 : 0;
        const prevRank = prev === 'M' ? 3 : prev === 'o' ? 2 : prev === ':' ? 1 : prev === '.' ? 0 : -1;
        if (rank > prevRank) buf[sy][sx] = ch;
      }
    }
    const lines = new Array(rows);
    for (let i = 0; i < rows; i++) lines[i] = buf[i].join('');
    return lines.join('\\n');
  }
  let sphereRAF = 0;
  let sphereStart = 0;
  function startSphere(){
    const el = document.getElementById('sphere');
    if (!el) return;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { el.textContent = renderSphere(0); return; }
    sphereStart = performance.now();
    let last = 0;
    const FRAME_MS = 85;
    function loop(now){
      sphereRAF = requestAnimationFrame(loop);
      if (now - last < FRAME_MS) return;
      last = now;
      el.textContent = renderSphere(now - sphereStart);
    }
    sphereRAF = requestAnimationFrame(loop);
  }
  function stopSphere(){ if (sphereRAF) { cancelAnimationFrame(sphereRAF); sphereRAF = 0; } }

  /* ─── typewriter ───────────────────────────────────────── */
  function makeTypewriter(bodyEl, onScroll){
    let buffer = '';
    let revealed = 0;
    let raf = 0;
    let last = 0;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cursorHTML = '<span class="streaming-cursor"></span>';
    function done(){ return revealed >= buffer.length; }
    function render(){
      bodyEl.innerHTML = paragraphize(buffer.slice(0, revealed)) + (!done() ? cursorHTML : '');
      if (onScroll) onScroll();
    }
    function tick(now){
      raf = 0;
      if (revealed >= buffer.length) { return; }
      const dt = last ? (now - last) : 16;
      last = now;
      let cps = 65;
      const ahead = buffer.length - revealed;
      if (ahead > 40) cps = 65 + Math.min(120, ahead * 1.5);
      if (ahead > 200) cps = 240;
      const chars = Math.max(1, Math.round((dt / 1000) * cps));
      revealed = Math.min(buffer.length, revealed + chars);
      render();
      if (revealed < buffer.length) raf = requestAnimationFrame(tick);
    }
    return {
      push: function(text){
        buffer += text;
        if (reduced) { revealed = buffer.length; render(); return; }
        if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
      },
      flush: function(){
        revealed = buffer.length;
        bodyEl.innerHTML = paragraphize(buffer);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      }
    };
  }

  /* ─── rehydrate prior turns ────────────────────────────── */
  async function rehydrate(sessionId){
    try {
      const res = await fetch('/api/turns?session_id=' + encodeURIComponent(sessionId));
      if (!res.ok && res.status !== 410) return;
      const data = await res.json();
      const turns = (data && data.turns) || [];
      if (turns.length === 0) return;
      hideEmpty();
      stopSphere();
      firstTurnSent = true;
      updatePlaceholder();
      for (let i = 0; i < turns.length; i++) {
        const t = turns[i];
        renderTurn(t.role, t.body, { at: t.created_at ? Date.parse(t.created_at) : Date.now() });
      }
    } catch(_){}
  }

  /* ─── composer placeholder — sanctuary register ───────── */
  function updatePlaceholder(){
    const input = document.getElementById('input');
    if (!input) return;
    input.placeholder = firstTurnSent ? '…' : 'what brings you here?';
  }

  /* ─── send ─────────────────────────────────────────────── */
  let streaming = false;
  async function send(text){
    if (streaming) return;
    const trimmed = (text || '').trim();
    if (trimmed.length === 0) return;
    streaming = true;

    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    if (input) { input.value = ''; input.style.height = 'auto'; }
    if (sendBtn) sendBtn.disabled = true;

    hideEmpty();
    stopSphere();
    firstTurnSent = true;
    updatePlaceholder();
    renderTurn('visitor', trimmed, { at: Date.now() });

    let sessionId;
    try {
      sessionId = await ensureSession();
    } catch(_) {
      streaming = false;
      if (sendBtn) sendBtn.disabled = false;
      renderTurn('resident', '*could not open a session right now. try again in a moment.*');
      return;
    }

    const residentRef = renderTurn('resident', '');
    const feed = document.getElementById('feed');
    const typewriter = residentRef ? makeTypewriter(residentRef.bodyEl, function(){
      if (feed) feed.scrollTop = feed.scrollHeight;
    }) : null;

    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, body: trimmed })
      });
      if (!res.ok || !res.body) throw new Error('stream_failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lineBuf = '';
      let setDownFlag = false;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        lineBuf += decoder.decode(chunk.value, { stream: true });
        let nl;
        while ((nl = lineBuf.indexOf('\\n')) !== -1) {
          const line = lineBuf.slice(0, nl).trim();
          lineBuf = lineBuf.slice(nl + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'kind') {
              if (ev.kind === 'set_down') setDownFlag = true;
            } else if (ev.type === 'text') {
              if (typewriter) typewriter.push(ev.text);
            } else if (ev.type === 'error') {
              if (typewriter) typewriter.push('*' + (ev.message || 'something went wrong') + '*');
            }
          } catch(_) {}
        }
      }
      if (typewriter) typewriter.flush();
      if (setDownFlag) document.body.classList.add('set-down');
    } catch(_) {
      if (typewriter) {
        typewriter.push('*could not reach the room right now. try again in a moment.*');
        typewriter.flush();
      }
    } finally {
      streaming = false;
      if (sendBtn) sendBtn.disabled = (document.getElementById('input')||{value:''}).value.trim().length === 0;
      if (input) input.focus();
    }
  }

  function autosize(el){
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 240) + 'px';
  }

  /* ─── wire up on load ──────────────────────────────────── */
  window.addEventListener('load', function(){
    /* theme */
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) {
      themeBtn.textContent = getTheme() === 'light' ? 'dark' : 'light';
      themeBtn.addEventListener('click', function(){
        setTheme(getTheme() === 'light' ? 'dark' : 'light');
      });
    }

    /* composer */
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const inputShell = document.getElementById('input-shell');
    if (input) {
      input.addEventListener('focus', function(){
        if (inputShell) inputShell.classList.add('focused');
      });
      input.addEventListener('blur', function(){
        if (inputShell) inputShell.classList.remove('focused');
      });
      input.addEventListener('input', function(){
        autosize(input);
        if (sendBtn) sendBtn.disabled = input.value.trim().length === 0 || streaming;
      });
      input.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send(input.value);
        }
      });
      input.focus();
    }
    if (sendBtn) sendBtn.addEventListener('click', function(){ if (input) send(input.value); });

    /* sphere + bootstrap */
    startSphere();
    ensureSession().then(function(sid){
      if (sid) rehydrate(sid);
    }).catch(function(){});
  });
})();
`;
}

/* ──────────────────────────────────────────────────────────────────
   Fonts + renderer entry point.
   ────────────────────────────────────────────────────────────────── */

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Inter+Tight:wght@400;500&family=JetBrains+Mono:wght@300;400;500&display=swap" rel="stylesheet">`;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderMinimalChatPage(resident: ResidentConfig): string {
  const title = `${resident.displayName} — Classic Chat — The Sanctuary`;
  const desc = `An ongoing chat with ${resident.displayName}. One continuous thread. Mnemos beneath it.`;
  const inlineHueStyle = `--agent-hue: ${resident.commonsPalette.rgb};`;
  const slug = resident.slug;
  const slugLower = resident.displayName.toLowerCase();

  return `<!doctype html>
<html lang="en" data-opus-route="chat" data-theme="dark" style="${inlineHueStyle}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#07080b">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
${FONTS}
<style>${MINIMAL_CHAT_CSS}</style>
</head>
<body>

<div class="viewport-glow" aria-hidden="true"></div>

<div class="app">

  <!-- thin chrome strip -->
  <header class="chrome">
    <a class="resident-mark" href="/${escapeHtml(slug)}" title="approach ${escapeHtml(slugLower)} formally">
      <span class="brand-dot" aria-hidden="true"></span>
      <span>${escapeHtml(slugLower)}</span>
    </a>
    <div class="chrome-end">
      <button id="themeBtn" class="chrome-link" type="button" aria-label="toggle theme">light</button>
      <a class="chrome-link" href="/${escapeHtml(slug)}">
        <span>approach formally</span>
        <span class="arrow" aria-hidden="true">→</span>
      </a>
    </div>
  </header>

  <!-- feed — empty state + messages -->
  <div class="feed" id="feed">
    <div class="feed-column">

      <div class="empty-state" id="empty-state">
        <pre class="empty-sphere" id="sphere" aria-hidden="true"></pre>
        <div class="empty-resident">${escapeHtml(slugLower)}</div>
        <div class="empty-eyebrow">one continuous thread · mnemos beneath it</div>
      </div>

      <div class="messages-inner" id="messages-inner"></div>

    </div>
  </div>

  <!-- composer -->
  <div class="composer-zone">
    <div class="composer-column">
      <div class="input-shell" id="input-shell">
        <div class="input-area">
          <textarea
            class="input-textarea"
            id="input"
            placeholder="what brings you here?"
            rows="1"
            aria-label="say anything to ${escapeHtml(resident.displayName)}"></textarea>
        </div>
        <div class="input-footer">
          <span class="input-footer-left">shift + enter for newline</span>
          <button class="send-btn" id="sendBtn" type="button" disabled aria-label="send">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
      </div>
      <div class="caption">
        <span class="caption-item"><span class="key">↵</span>send</span>
        <span class="caption-item"><span class="key">⇧↵</span>newline</span>
        <span class="caption-spacer"></span>
        <span class="caption-status">${escapeHtml(slugLower)} · attending</span>
      </div>
    </div>
  </div>

</div>

<script>${chatScript(resident)}</script>
</body>
</html>`;
}
