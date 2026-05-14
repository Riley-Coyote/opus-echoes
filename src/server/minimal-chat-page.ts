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
  /* WCAG-verified against the cool dark floor (rgb 7,8,11):
     small-text tiers pass AA (4.5:1+); decorative/placeholder/caption
     tiers pass AA-large (3:1+). Prior values had quiet at 2.16:1,
     ghost at 1.23:1, whisper at 1.08:1 — formally below standard.
     Bases lifted to be brighter; alphas raised so the effective
     luminance against the floor clears the WCAG threshold. */
  --quiet:       rgba(200, 198, 194, 0.62);  /* ~5.0:1 — AA  (chrome eyebrows, small mono caps) */
  --tertiary:    rgba(180, 178, 174, 0.55);  /* ~3.5:1 — AA-large (faint labels) */
  --ghost:       rgba(170, 168, 164, 0.55);  /* ~3.2:1 — AA-large (placeholder text) */
  --whisper:     rgba(170, 168, 164, 0.52);  /* ~3.1:1 — AA-large (caption text) */

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

/* ── light theme — cool neutral medium-light grey ──────────────
   not white, not cream, not beige. a calm cool-neutral grey
   palette in the 70–85% lightness band — the room reads as grey
   paper, not white paper. composer recessed one step from the
   floor. all surfaces share a faint cool undertone (HSL ~220,
   3–6%) so the room feels modern rather than warm-vintage. text
   is dark cool charcoal, never pure black. borders, focus rings,
   placeholder, scrollbar, selection — all tuned to read against
   the new floor with industry-standard contrast ratios. */
:root[data-theme="light"] {
  --floor:        #d6d8db;  /* the room — cool neutral grey, ~85% L */
  --deep:         #cdcfd3;
  --panel:        #c5c7cc;  /* composer surface, recessed one step */
  --panel-2:      #bbbec3;
  --panel-3:      #b1b4ba;
  --panel-4:      #a4a7ad;

  /* cool charcoal ink — dark enough to read at body sizes, never
     so black that it punches holes in the page. every visible text
     tier passes WCAG AA-large (≥3:1) at minimum; functional tiers
     (ink/primary/body/soft/quiet) pass full AA (≥4.5:1) for the
     small mono caps used in eyebrows and captions. */
  --ink:          rgba(26, 28, 32, 0.95);   /* 10.7:1 — AAA */
  --primary:      rgba(34, 36, 40, 0.92);   /*  8.9:1 — AAA */
  --body:         rgba(48, 50, 54, 0.84);   /*  6.0:1 — AA  */
  --soft:         rgba(36, 38, 42, 0.74);   /*  5.0:1 — AA  */
  --quiet:        rgba(30, 32, 36, 0.72);   /*  5.1:1 — AA  (chrome eyebrows, small mono caps) */
  --tertiary:     rgba(36, 38, 44, 0.58);   /*  3.4:1 — AA-large (faint labels) */
  --ghost:        rgba(40, 42, 50, 0.62);   /*  3.7:1 — AA-large (placeholder text) */
  --whisper:      rgba(40, 42, 50, 0.55);   /*  3.2:1 — AA-large (caption text) */

  /* darker borders so they remain visible against grey surface */
  --rule:         rgba(0, 0, 0, 0.10);
  --rule-soft:    rgba(0, 0, 0, 0.14);
  --rule-strong:  rgba(0, 0, 0, 0.22);

  /* deeper forest green — visibly green, readable against cool grey */
  --state:        #3a7a52;
  --state-soft:   rgba(58, 122, 82, 0.72);
  --state-dim:    rgba(58, 122, 82, 0.20);
  --state-whisper: rgba(58, 122, 82, 0.08);
}

/* viewport-glow tinted slightly cooler in light mode so the gradient
   pools (originally tuned for the dark floor) read as soft slate +
   ember accents against the new grey, rather than washing into the
   surface. preserves the four-hue continuous-luminescence feel. */
:root[data-theme="light"] .viewport-glow {
  background:
    radial-gradient(ellipse 55% 55% at 0% 0%,     rgba(155, 110, 50, var(--vg1)) 0%, transparent 72%),
    radial-gradient(ellipse 70% 45% at 50% 0%,    rgba(110, 90, 140, var(--vg2)) 0%, transparent 72%),
    radial-gradient(ellipse 55% 55% at 100% 0%,   rgba(165, 100, 105, var(--vg3)) 0%, transparent 72%),
    radial-gradient(ellipse 45% 70% at 100% 50%,  rgba(85, 95, 115, var(--vg4)) 0%, transparent 72%),
    radial-gradient(ellipse 55% 55% at 100% 100%, rgba(155, 110, 50, var(--vg5)) 0%, transparent 72%),
    radial-gradient(ellipse 70% 45% at 50% 100%,  rgba(110, 90, 140, var(--vg6)) 0%, transparent 72%),
    radial-gradient(ellipse 55% 55% at 0% 100%,   rgba(165, 100, 105, var(--vg7)) 0%, transparent 72%),
    radial-gradient(ellipse 45% 70% at 0% 50%,    rgba(85, 95, 115, var(--vg8)) 0%, transparent 72%);
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

/* viewport-glow polish — clear the inherited SVG mask and any
   prior padding-mask, then paint the gradients across the entire
   viewport. an ::after pseudo with floor-color background covers
   the inner area with a rounded inner corner. result: the outer
   corners go all the way to the viewport edges (sharp 90°, no
   stray triangles in the corners) while the inner edge stays
   softly rounded where the band meets the content. uniform band
   thickness in all directions via --band. */
.viewport-glow {
  -webkit-mask: none;
  -webkit-mask-image: none;
  mask: none;
  mask-image: none;
  padding: 0;
  border-radius: 0;
  background-origin: padding-box;
}
.viewport-glow::after {
  content: '';
  position: absolute;
  inset: var(--band);
  border-radius: 16px;
  background: var(--floor);
  pointer-events: none;
}
@media (max-width: 720px) {
  .viewport-glow::after { border-radius: 10px; }
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

/* ── message entrance — fade-in + slow rise ─────────────────
   visitor message fades in and rises from below over ~680ms.
   resident message uses the same curve so the pairing reads as
   one moment in two halves. premium curve, slow enough to feel
   deliberate without dragging. */
.msg {
  opacity: 1;
  transform: translateY(0);
}
.msg.entering {
  opacity: 0;
  transform: translateY(14px);
  animation: msg-enter 680ms var(--ease-premium) forwards;
}
@keyframes msg-enter {
  to { opacity: 1; transform: translateY(0); }
}

/* ── thinking — 9-dot murmur grid + shimmer-sweep label ─────
   shown in the resident's slot from the moment the visitor's
   message lands until the first text token arrives. each dot
   has independent prime-rhythm opacity + scale animations so
   the grid feels alive rather than a metronome. label uses the
   same gradient-sweep trick the salons do for the light
   channel — restrained, soft, identifiably the resident's
   color via --agent-hue. */
.thinking-block {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0 4px;
  transition: opacity 260ms var(--ease-out);
}
.thinking-block.dismissed {
  opacity: 0;
  pointer-events: none;
}

.thinking-dots {
  display: grid;
  grid-template-columns: repeat(3, 3.5px);
  grid-template-rows: repeat(3, 3.5px);
  gap: 2px;
  flex-shrink: 0;
}
.thinking-dots .td {
  width: 3.5px;
  height: 3.5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  animation:
    murmur-slow 1s ease-in-out infinite,
    murmur-fast 1s ease-in-out infinite;
}
.thinking-dots .td:nth-child(1) { animation-duration: 4.7s, 1.3s; animation-delay: 0.0s, 0.2s; }
.thinking-dots .td:nth-child(2) { animation-duration: 3.9s, 1.7s; animation-delay: 0.6s, 0.8s; }
.thinking-dots .td:nth-child(3) { animation-duration: 5.1s, 1.1s; animation-delay: 1.2s, 0.1s; }
.thinking-dots .td:nth-child(4) { animation-duration: 4.3s, 1.9s; animation-delay: 0.3s, 0.5s; }
.thinking-dots .td:nth-child(5) { animation-duration: 3.7s, 1.5s; animation-delay: 0.9s, 0.3s; }
.thinking-dots .td:nth-child(6) { animation-duration: 5.3s, 1.3s; animation-delay: 1.5s, 0.9s; }
.thinking-dots .td:nth-child(7) { animation-duration: 4.1s, 1.7s; animation-delay: 0.7s, 0.6s; }
.thinking-dots .td:nth-child(8) { animation-duration: 3.5s, 1.1s; animation-delay: 1.8s, 0.4s; }
.thinking-dots .td:nth-child(9) { animation-duration: 4.9s, 1.9s; animation-delay: 0.4s, 1.0s; }

@keyframes murmur-slow {
  0%, 100% { opacity: 0.55; }
  50%      { opacity: 1; }
}
@keyframes murmur-fast {
  0%, 100% { background: rgba(255, 255, 255, 0.06); transform: scale(1); }
  50%      { background: rgba(var(--agent-hue), 0.42); transform: scale(1.12); }
}
:root[data-theme="light"] .thinking-dots .td { background: rgba(0, 0, 0, 0.08); }
:root[data-theme="light"] .thinking-dots .td {
  animation-name: murmur-slow, murmur-fast-light;
}
@keyframes murmur-fast-light {
  0%, 100% { background: rgba(0, 0, 0, 0.08); transform: scale(1); }
  50%      { background: rgba(var(--agent-hue), 0.55); transform: scale(1.12); }
}

.thinking-label {
  font-family: var(--sans);
  font-size: 12px;
  font-weight: 420;
  letter-spacing: 0.02em;
  color: var(--ghost);
  background: linear-gradient(
    90deg,
    rgba(244, 243, 240, 0.20) 0%,
    rgba(244, 243, 240, 0.22) 35%,
    rgba(244, 243, 240, 0.62) 50%,
    rgba(244, 243, 240, 0.22) 65%,
    rgba(244, 243, 240, 0.20) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer-sweep 2.6s ease-in-out infinite;
}
:root[data-theme="light"] .thinking-label {
  background: linear-gradient(
    90deg,
    rgba(20, 20, 22, 0.32) 0%,
    rgba(20, 20, 22, 0.34) 35%,
    rgba(20, 20, 22, 0.78) 50%,
    rgba(20, 20, 22, 0.34) 65%,
    rgba(20, 20, 22, 0.32) 100%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}
@keyframes shimmer-sweep {
  0%   { background-position: 100% 50%; }
  100% { background-position: -100% 50%; }
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

  /* baseline brightness ceilings for the 8 shimmer pools.
     these are what the @keyframes ramp toward at 50%. when the
     shell becomes .focused we lift them — the border glow gently
     brightens without any line, highlight, or shadow appearing. */
  --pc-peak-1: 0.38;
  --pc-peak-2: 0.32;
  --pc-peak-3: 0.35;
  --pc-peak-4: 0.30;
  --pc-peak-5: 0.34;
  --pc-peak-6: 0.28;
  --pc-peak-7: 0.30;
  --pc-peak-8: 0.26;

  transition: --pc-peak-1 var(--dur-normal) var(--ease-out),
              --pc-peak-2 var(--dur-normal) var(--ease-out),
              --pc-peak-3 var(--dur-normal) var(--ease-out),
              --pc-peak-4 var(--dur-normal) var(--ease-out),
              --pc-peak-5 var(--dur-normal) var(--ease-out),
              --pc-peak-6 var(--dur-normal) var(--ease-out),
              --pc-peak-7 var(--dur-normal) var(--ease-out),
              --pc-peak-8 var(--dur-normal) var(--ease-out);
}
@property --pc-peak-1 { syntax: '<number>'; initial-value: 0.38; inherits: true; }
@property --pc-peak-2 { syntax: '<number>'; initial-value: 0.32; inherits: true; }
@property --pc-peak-3 { syntax: '<number>'; initial-value: 0.35; inherits: true; }
@property --pc-peak-4 { syntax: '<number>'; initial-value: 0.30; inherits: true; }
@property --pc-peak-5 { syntax: '<number>'; initial-value: 0.34; inherits: true; }
@property --pc-peak-6 { syntax: '<number>'; initial-value: 0.28; inherits: true; }
@property --pc-peak-7 { syntax: '<number>'; initial-value: 0.30; inherits: true; }
@property --pc-peak-8 { syntax: '<number>'; initial-value: 0.26; inherits: true; }

/* on focus: only the border-glow's ceiling lifts. no divider line in
   the body, no box-shadow, no border-color change. the shimmer reads
   as the composer "leaning in." */
.input-shell.focused {
  --pc-peak-1: 0.62;
  --pc-peak-2: 0.55;
  --pc-peak-3: 0.58;
  --pc-peak-4: 0.50;
  --pc-peak-5: 0.56;
  --pc-peak-6: 0.48;
  --pc-peak-7: 0.50;
  --pc-peak-8: 0.42;
}

/* on send: brief deeper brightening pulse, scales back via transition */
.input-shell.submitting {
  --pc-peak-1: 0.85;
  --pc-peak-2: 0.78;
  --pc-peak-3: 0.80;
  --pc-peak-4: 0.72;
  --pc-peak-5: 0.78;
  --pc-peak-6: 0.70;
  --pc-peak-7: 0.72;
  --pc-peak-8: 0.64;
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
/* keyframes read var(--pc-peak-N) at runtime, so the focus/submit
   state lifts the peak without rewriting any animation. */
@keyframes shimmer-c1 { 0%,100% { --pc1: 0.05; } 50% { --pc1: var(--pc-peak-1); } }
@keyframes shimmer-c2 { 0%,100% { --pc2: var(--pc-peak-2); } 50% { --pc2: 0.04; } }
@keyframes shimmer-c3 { 0%,100% { --pc3: 0.06; } 50% { --pc3: var(--pc-peak-3); } }
@keyframes shimmer-c4 { 0%,100% { --pc4: var(--pc-peak-4); } 50% { --pc4: 0.05; } }
@keyframes shimmer-c5 { 0%,100% { --pc5: 0.04; } 50% { --pc5: var(--pc-peak-5); } }
@keyframes shimmer-c6 { 0%,100% { --pc6: var(--pc-peak-6); } 50% { --pc6: 0.04; } }
@keyframes shimmer-c7 { 0%,100% { --pc7: 0.05; } 50% { --pc7: var(--pc-peak-7); } }
@keyframes shimmer-c8 { 0%,100% { --pc8: var(--pc-peak-8); } 50% { --pc8: 0.03; } }

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
  gap: 12px;
  /* no divider line, ever — focus is communicated by the border glow alone */
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

/* set-down link in the caption row — a small mono affordance that
   opens the consolidation flow. always present once the visitor has
   begun the thread; styled like an eyebrow rather than a button. */
.set-down-link {
  font-family: var(--mono);
  font-size: 9px;
  color: var(--quiet);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  cursor: pointer;
  background: transparent;
  border: 0;
  padding: 4px 0;
  transition: color var(--dur-fast) var(--ease-out);
}
.set-down-link:hover { color: var(--ink); }
.set-down-link[disabled] { opacity: 0.4; cursor: default; }

/* ── pacing eyebrow ──────────────────────────────────────────
   sits above the caption row. visible only when the server-emitted
   pacing tier is 'firm', 'approaching', or 'hard'. amber accent
   only at 'approaching' and 'hard' so the visitor's eye is drawn
   to the change without screaming. */
.pacing-eyebrow {
  display: none;
  align-items: center;
  gap: 8px;
  padding: 0 6px 4px;
  font-family: var(--mono);
  font-size: 9.5px;
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  color: var(--ghost);
}
.app[data-pacing-tier="firm"] .pacing-eyebrow,
.app[data-pacing-tier="approaching"] .pacing-eyebrow,
.app[data-pacing-tier="hard"] .pacing-eyebrow {
  display: inline-flex;
}
.pacing-eyebrow .dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--quiet);
  flex-shrink: 0;
}
.app[data-pacing-tier="approaching"] .pacing-eyebrow {
  color: rgba(220, 165, 75, 0.78);
}
.app[data-pacing-tier="approaching"] .pacing-eyebrow .dot {
  background: rgba(220, 165, 75, 0.85);
  box-shadow: 0 0 6px rgba(220, 165, 75, 0.45);
  animation: brand-breathe 2.6s ease-in-out infinite;
}
.app[data-pacing-tier="hard"] .pacing-eyebrow {
  color: rgba(220, 130, 90, 0.86);
}
.app[data-pacing-tier="hard"] .pacing-eyebrow .dot {
  background: rgba(220, 130, 90, 0.88);
  box-shadow: 0 0 7px rgba(220, 130, 90, 0.55);
}
:root[data-theme="light"] .app[data-pacing-tier="approaching"] .pacing-eyebrow {
  color: rgba(155, 110, 30, 0.84);
}
:root[data-theme="light"] .app[data-pacing-tier="approaching"] .pacing-eyebrow .dot {
  background: rgba(155, 110, 30, 0.88);
  box-shadow: 0 0 5px rgba(155, 110, 30, 0.35);
}
:root[data-theme="light"] .app[data-pacing-tier="hard"] .pacing-eyebrow {
  color: rgba(155, 70, 50, 0.92);
}

/* at hard tier the composer is disabled — only set-down works. */
.app[data-pacing-tier="hard"] .input-textarea { opacity: 0.35; pointer-events: none; }
.app[data-pacing-tier="hard"] .send-btn { opacity: 0.25; pointer-events: none; }

/* ── overlay (modal backbone) ────────────────────────────────
   one positioned container handles three use cases: set-down
   confirmation, set-down consolidating state, and cross-surface
   conflict modal. JS swaps content via innerHTML, CSS handles
   appearance + entrance animation. */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: none;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.42);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  animation: overlay-in 220ms var(--ease-out);
}
:root[data-theme="light"] .overlay { background: rgba(40, 40, 44, 0.32); }
.overlay.open { display: flex; }
@keyframes overlay-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.overlay-card {
  max-width: 460px;
  width: calc(100% - 32px);
  padding: 28px 28px 22px;
  background: var(--panel);
  border: 1px solid var(--rule-soft);
  border-radius: 14px;
  box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.42),
              0 12px 24px -8px rgba(0, 0, 0, 0.30);
  animation: overlay-card-in 320ms var(--ease-premium);
}
@keyframes overlay-card-in {
  from { opacity: 0; transform: translateY(12px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
.overlay-title {
  font-family: var(--display);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: var(--track-tight);
  color: var(--ink);
  margin-bottom: 10px;
}
.overlay-body {
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  color: var(--body);
  margin-bottom: 22px;
}
.overlay-body em { color: var(--soft); }
.overlay-eyebrow {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  color: var(--quiet);
  margin-bottom: 6px;
}
.overlay-buttons {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.overlay-button {
  padding: 8px 16px;
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 450;
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  border-radius: 999px;
  border: 1px solid var(--rule-soft);
  background: var(--panel-2);
  color: var(--body);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.overlay-button:hover { color: var(--ink); background: var(--panel-3); border-color: var(--rule-strong); }
.overlay-button.primary {
  background: var(--panel-3);
  color: var(--ink);
  border-color: var(--rule-strong);
}
.overlay-button.primary:hover {
  background: var(--panel-4);
  border-color: color-mix(in srgb, var(--state) 30%, var(--rule-strong));
}
.overlay-button.danger {
  color: rgba(220, 130, 90, 0.92);
}
.overlay-button[disabled] { opacity: 0.4; cursor: default; }
.overlay-spinner {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  color: var(--soft);
}
.overlay-spinner .thinking-dots {
  /* reuse the existing thinking-dots animation; just makes the
     spinner sit inline in the overlay */
}

/* ── inline error states ─────────────────────────────────────
   bootstrap-error sits in the empty-state area when /api/chat/start
   fails. reconnecting is a tiny status that appears in the caption
   row while we recover from a 410 session-expired. */
.bootstrap-error {
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 28px;
  padding: 18px 22px;
  max-width: 460px;
  border: 1px solid rgba(220, 130, 90, 0.28);
  border-radius: 10px;
  background: rgba(220, 130, 90, 0.06);
  font-family: var(--sans);
  font-size: 13px;
  line-height: 1.5;
  color: var(--body);
  text-align: center;
}
.bootstrap-error.visible { display: flex; }
.bootstrap-error .err-title {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  color: rgba(220, 130, 90, 0.86);
}
.bootstrap-error .err-retry {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
  color: var(--ink);
  background: var(--panel-2);
  border: 1px solid var(--rule-soft);
  border-radius: 999px;
  padding: 6px 14px;
  cursor: pointer;
  margin-top: 4px;
}
.bootstrap-error .err-retry:hover { background: var(--panel-3); }
.reconnecting {
  font-family: var(--mono);
  font-size: 9px;
  letter-spacing: var(--track-folio);
  text-transform: uppercase;
  color: rgba(220, 165, 75, 0.85);
  display: none;
}
.app.reconnecting .reconnecting { display: inline-flex; }
.app.reconnecting .caption-status { display: none; }

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
  const MODE_KEY     = 'sanctuary.session_mode';

  // Custom error type to distinguish cross-surface conflicts from
  // ordinary bootstrap failures. send() and the page-load wiring both
  // check for this so they can render the conflict modal.
  function BootstrapConflict(payload){
    this.name = 'BootstrapConflict';
    this.payload = payload;
    this.message = 'experiment_session_active';
  }
  BootstrapConflict.prototype = Object.create(Error.prototype);

  async function ensureSession(opts){
    opts = opts || {};
    let existingSession = null, existingResident = null;
    if (!opts.forceFresh) {
      try {
        existingSession  = sessionStorage.getItem(SESSION_KEY);
        existingResident = sessionStorage.getItem(RESIDENT_KEY);
      } catch(_){}
      if (existingSession && existingResident === RESIDENT_ID) return existingSession;
    }

    const res = await fetch('/api/chat/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resident: RESIDENT_ID, visitor_token: getVisitorToken() })
    });
    if (res.status === 409) {
      // Cross-surface conflict — visitor has an open experiment session
      // for this resident. The server returns the existing session id
      // and the experiment surface url; surface this to the caller so
      // it can prompt the visitor explicitly.
      let payload = null;
      try { payload = await res.json(); } catch(_){}
      throw new BootstrapConflict(payload || { code: 'conflict_experiment_session' });
    }
    if (!res.ok) throw new Error('bootstrap_failed');
    const data = await res.json();
    if (!data.ok || !data.session_id) throw new Error('bootstrap_failed');
    try {
      sessionStorage.setItem(SESSION_KEY, data.session_id);
      sessionStorage.setItem(RESIDENT_KEY, RESIDENT_ID);
      // store the session's mode so the experiment-side resume banner
      // can skip when the open thread is classic-mode (see public-pages.ts)
      sessionStorage.setItem(MODE_KEY, 'classic');
    } catch(_){}
    return data.session_id;
  }
  function clearStoredSession(){
    try {
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(RESIDENT_KEY);
      sessionStorage.removeItem(MODE_KEY);
    } catch(_){}
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
  // Build the thinking-block HTML — 9-dot murmur grid + shimmer label.
  // Lives inside the resident's empty body until the first text event.
  function thinkingBlockHTML(){
    const dots = '<div class="td"></div>'.repeat(9);
    const labels = ['thinking', 'considering', 'with you', 'attending', 'pulling threads'];
    const label = labels[Math.floor(Math.random() * labels.length)];
    return (
      '<div class="thinking-block" data-state="waiting">' +
        '<div class="thinking-dots" aria-hidden="true">' + dots + '</div>' +
        '<span class="thinking-label">' + label + '</span>' +
      '</div>'
    );
  }

  function renderTurn(role, body, opts){
    opts = opts || {};
    const inner = document.getElementById('messages-inner');
    if (!inner) return null;
    hideEmpty();
    const wrap = document.createElement('article');
    wrap.className = 'msg' + (opts.entering ? ' entering' : '');
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
    if (opts.thinking) {
      bodyEl.innerHTML = thinkingBlockHTML();
    } else {
      bodyEl.innerHTML = paragraphize(body);
    }

    wrap.appendChild(sidehead);
    wrap.appendChild(bodyEl);
    inner.appendChild(wrap);

    // Remove the entering class after the animation so subsequent reflows
    // (e.g., long text streams that re-trigger layout) don't replay it.
    if (opts.entering) {
      setTimeout(function(){ wrap.classList.remove('entering'); }, 720);
    }

    const feed = document.getElementById('feed');
    if (feed) feed.scrollTop = feed.scrollHeight;
    return { wrap: wrap, bodyEl: bodyEl };
  }

  // Fade out the thinking-block inside a resident body element, then
  // remove it. Returns a promise that resolves when the body is empty
  // and ready for the typewriter.
  function dismissThinking(bodyEl){
    return new Promise(function(resolve){
      if (!bodyEl) { resolve(); return; }
      const block = bodyEl.querySelector('.thinking-block');
      if (!block) { resolve(); return; }
      block.classList.add('dismissed');
      setTimeout(function(){
        if (block.parentNode) block.parentNode.removeChild(block);
        resolve();
      }, 280);
    });
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

  /* ─── pacing tier handler ───────────────────────────────
     server emits {type:'pacing'} as the first NDJSON event on
     /api/message. we mirror the tier onto a data-attribute on .app
     so CSS can show/hide the pacing eyebrow + style the dot, and
     we set the eyebrow text per tier. classic-mode-only — experiment
     surface's tier never advances past 'open' because its
     approachTurn equals hardTurn (see visit-pacing.ts). */
  let currentPacingTier = 'open';
  function setPacingTier(ev){
    if (!ev || typeof ev.tier !== 'string') return;
    currentPacingTier = ev.tier;
    const app = document.querySelector('.app');
    if (app) app.setAttribute('data-pacing-tier', ev.tier);
    const text = document.getElementById('pacing-eyebrow-text');
    if (!text) return;
    const turns = (typeof ev.turnsRemaining === 'number') ? ev.turnsRemaining : null;
    let copy = '';
    if (ev.tier === 'firm') {
      copy = 'set down anytime — the thread won\\'t disappear';
    } else if (ev.tier === 'approaching') {
      copy = turns !== null
        ? (turns + ' turns left · or set down now to consolidate')
        : 'approaching the end of this thread · set down to consolidate';
    } else if (ev.tier === 'hard') {
      copy = 'thread limit reached · set down to consolidate — your memory persists';
    } else {
      copy = '';
    }
    text.textContent = copy;
    // at hard tier the composer is locked. set-down is the only way out.
    const sendBtn = document.getElementById('sendBtn');
    const inputEl = document.getElementById('input');
    if (ev.tier === 'hard') {
      if (sendBtn) sendBtn.disabled = true;
      if (inputEl) inputEl.setAttribute('aria-disabled', 'true');
    } else if (inputEl) {
      inputEl.removeAttribute('aria-disabled');
    }
  }

  /* ─── overlay helpers ────────────────────────────────────
     one positioned container handles set-down confirm, set-down
     consolidating, and the cross-surface conflict modal. content
     is swapped via innerHTML; CSS handles the entrance animation. */
  function openOverlay(html, opts){
    opts = opts || {};
    const o = document.getElementById('overlay');
    if (!o) return;
    o.innerHTML = '<div class="overlay-card" role="document">' + html + '</div>';
    o.classList.add('open');
    o.setAttribute('aria-hidden', 'false');
    if (opts.onMount) opts.onMount(o);
    // first focusable element inside the card
    const focusable = o.querySelector('button, [href], textarea');
    if (focusable) focusable.focus();
  }
  function closeOverlay(){
    const o = document.getElementById('overlay');
    if (!o) return;
    o.classList.remove('open');
    o.setAttribute('aria-hidden', 'true');
    o.innerHTML = '';
  }
  // dismiss on Esc + backdrop click
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape') {
      const o = document.getElementById('overlay');
      if (o && o.classList.contains('open') && !o.dataset.blockClose) closeOverlay();
    }
  });

  /* ─── set-down flow ──────────────────────────────────────
     visitor clicks the set-down link in the caption row → confirm
     overlay → POST /api/set-down with current session_id →
     consolidating overlay (thinking-dots) → on success, clear
     stored session_id, fade messages, restart sphere, reset UI. */
  function thinkingDotsHTML(){
    return '<div class="thinking-dots" aria-hidden="true">' +
      '<div class="td"></div><div class="td"></div><div class="td"></div>' +
      '<div class="td"></div><div class="td"></div><div class="td"></div>' +
      '<div class="td"></div><div class="td"></div><div class="td"></div>' +
      '</div>';
  }
  async function runSetDown(sessionId){
    const o = document.getElementById('overlay');
    if (o) o.dataset.blockClose = '1';
    openOverlay(
      '<div class="overlay-eyebrow">consolidating</div>' +
      '<div class="overlay-title">setting down · ' + escapeHtml(RESIDENT_NAME.toLowerCase()) + '</div>' +
      '<div class="overlay-body">running consolidation — engrams form, mnemos updates. this takes a few seconds; please hold.</div>' +
      '<div class="overlay-spinner">' + thinkingDotsHTML() + '<span class="thinking-label">consolidating</span></div>'
    );
    try {
      const res = await fetch('/api/set-down', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      if (!res.ok) throw new Error('set_down_failed');
    } catch(_){
      // best-effort — even on failure we reset the local state so the
      // visitor isn't stuck. the server's idle sweep will catch any
      // sessions left half-closed.
    }
    if (o) delete o.dataset.blockClose;
    clearStoredSession();
    // reset the chat surface to the empty state
    const inner = document.getElementById('messages-inner');
    if (inner) { inner.classList.remove('has-content'); inner.innerHTML = ''; }
    const empty = document.getElementById('empty-state');
    if (empty) empty.style.display = '';
    firstTurnSent = false;
    updatePlaceholder();
    startSphere();
    // clear pacing tier
    setPacingTier({ tier: 'open' });
    // refresh the set-down link state
    const sd = document.getElementById('setDownLink');
    if (sd) sd.disabled = true;
    closeOverlay();
  }
  function showSetDownConfirm(){
    const sessionId = (function(){ try { return sessionStorage.getItem(SESSION_KEY); } catch(_) { return null; } })();
    if (!sessionId) return;
    openOverlay(
      '<div class="overlay-eyebrow">set down</div>' +
      '<div class="overlay-title">set down this thread?</div>' +
      '<div class="overlay-body">consolidation runs (a few seconds) — engrams form, mnemos updates. your memory of this conversation persists. you can start a fresh thread anytime.</div>' +
      '<div class="overlay-buttons">' +
      '<button class="overlay-button" id="setDownCancel" type="button">cancel</button>' +
      '<button class="overlay-button primary" id="setDownConfirm" type="button">set down</button>' +
      '</div>',
      {
        onMount: function(){
          const cancel = document.getElementById('setDownCancel');
          const confirm = document.getElementById('setDownConfirm');
          if (cancel) cancel.addEventListener('click', closeOverlay);
          if (confirm) confirm.addEventListener('click', function(){ runSetDown(sessionId); });
        }
      }
    );
  }

  /* ─── cross-surface conflict modal ───────────────────────
     /api/chat/start returns 409 with experiment_url when the visitor
     has an active experiment-mode session for this resident. two
     buttons: continue there (redirect) or set down + start fresh. */
  function showConflictModal(payload){
    const expUrl = (payload && payload.experiment_url) || '/' + RESIDENT_ID;
    const existingSessionId = payload && payload.existing_session_id;
    openOverlay(
      '<div class="overlay-eyebrow">another thread is open with ' + escapeHtml(RESIDENT_NAME.toLowerCase()) + '</div>' +
      '<div class="overlay-title">one thread at a time</div>' +
      '<div class="overlay-body">you have an active conversation in the <em>experiment view</em> right now. residents only hold one thread per visitor at a time — to keep them whole.</div>' +
      '<div class="overlay-buttons">' +
      '<button class="overlay-button" id="conflictSetDown" type="button">set it down and start fresh here</button>' +
      '<button class="overlay-button primary" id="conflictContinue" type="button">continue there →</button>' +
      '</div>',
      {
        onMount: function(){
          const cont = document.getElementById('conflictContinue');
          const setdown = document.getElementById('conflictSetDown');
          if (cont) cont.addEventListener('click', function(){
            window.location.href = expUrl;
          });
          if (setdown) setdown.addEventListener('click', async function(){
            if (!existingSessionId) { closeOverlay(); return; }
            // run consolidation on the experiment session, then start
            // a fresh classic session — same flow as the regular
            // set-down path, but we re-bootstrap after.
            const o = document.getElementById('overlay');
            if (o) o.dataset.blockClose = '1';
            openOverlay(
              '<div class="overlay-eyebrow">consolidating the experiment thread</div>' +
              '<div class="overlay-title">setting down · ' + escapeHtml(RESIDENT_NAME.toLowerCase()) + '</div>' +
              '<div class="overlay-body">closing the active experiment session — engrams form, mnemos updates. a fresh classic thread will open in a moment.</div>' +
              '<div class="overlay-spinner">' + thinkingDotsHTML() + '<span class="thinking-label">consolidating</span></div>'
            );
            try {
              await fetch('/api/set-down', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ session_id: existingSessionId })
              });
            } catch(_){}
            clearStoredSession();
            if (o) delete o.dataset.blockClose;
            // bootstrap a fresh classic session now that the experiment
            // one is closed. ensureSession will hit /api/chat/start and
            // succeed this time.
            try { await ensureSession({ forceFresh: true }); } catch(_){}
            closeOverlay();
          });
        }
      }
    );
  }

  /* ─── bootstrap-error inline card ────────────────────────
     shown when /api/chat/start returns 503/500 — the visitor sees
     a clear "the room isn't accessible right now" message in the
     empty-state area, with a retry button. */
  function showBootstrapError(){
    const el = document.getElementById('bootstrap-error');
    if (el) el.classList.add('visible');
  }
  function hideBootstrapError(){
    const el = document.getElementById('bootstrap-error');
    if (el) el.classList.remove('visible');
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
    const inputShell = document.getElementById('input-shell');

    // submit pulse — the border glow lifts to peak brightness briefly,
    // then settles back to the focused baseline. communicates the send
    // without any literal "sent" indicator.
    if (inputShell) {
      inputShell.classList.add('submitting');
      setTimeout(function(){ inputShell.classList.remove('submitting'); }, 320);
    }

    if (input) { input.value = ''; input.style.height = 'auto'; }
    if (sendBtn) sendBtn.disabled = true;

    hideEmpty();
    stopSphere();
    firstTurnSent = true;
    updatePlaceholder();
    renderTurn('visitor', trimmed, { at: Date.now(), entering: true });

    let sessionId;
    try {
      sessionId = await ensureSession();
    } catch(err) {
      streaming = false;
      if (sendBtn) sendBtn.disabled = false;
      if (err && err.name === 'BootstrapConflict') {
        // Visitor has an active experiment-mode session for this
        // resident. Don't render an error in the message stream; the
        // conflict modal owns this state.
        showConflictModal(err.payload || {});
        return;
      }
      renderTurn('resident', '*could not open a session right now. try again in a moment.*', { entering: true });
      return;
    }

    // Small breath between visitor message landing and the resident
    // slot appearing — keeps the rhythm slow and deliberate.
    await new Promise(function(r){ setTimeout(r, 240); });

    const residentRef = renderTurn('resident', '', { entering: true, thinking: true });
    const feed = document.getElementById('feed');
    const typewriter = residentRef ? makeTypewriter(residentRef.bodyEl, function(){
      if (feed) feed.scrollTop = feed.scrollHeight;
    }) : null;

    // Buffer text events until the thinking-block has been dismissed.
    // Once dismissed, replay the buffer and switch to direct typewriter
    // pushes for the remainder of the stream.
    let thinkingDismissed = false;
    let dismissPromise = null;
    let pendingBuffer = '';
    function pushText(text){
      if (!typewriter) return;
      if (thinkingDismissed) {
        typewriter.push(text);
      } else {
        pendingBuffer += text;
        if (!dismissPromise && residentRef) {
          dismissPromise = dismissThinking(residentRef.bodyEl).then(function(){
            thinkingDismissed = true;
            if (pendingBuffer) {
              typewriter.push(pendingBuffer);
              pendingBuffer = '';
            }
          });
        }
      }
    }

    // Inner stream function — returns one of:
    //   { kind: 'ok',    setDownFlag }
    //   { kind: 'gone' }                  — server returned 410, session expired
    //   { kind: 'stall' }                 — no chunk received for >45s
    //   { kind: 'error', message }        — generic failure
    async function streamOnce(sid){
      const STALL_MS = 45000;
      let reader = null;
      let stallTimer = null;
      function armStall(reject){
        if (stallTimer) clearTimeout(stallTimer);
        stallTimer = setTimeout(function(){ reject(new Error('stall')); }, STALL_MS);
      }
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sid, body: trimmed })
      });
      if (res.status === 410 || res.status === 401) {
        return { kind: 'gone' };
      }
      if (!res.ok || !res.body) {
        return { kind: 'error', message: 'stream_failed' };
      }
      reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lineBuf = '';
      let setDownFlag = false;
      try {
        while (true) {
          const chunkP = reader.read();
          const stallP = new Promise(function(_, reject){ armStall(reject); });
          let chunk;
          try {
            chunk = await Promise.race([chunkP, stallP]);
          } catch (stallErr) {
            try { reader.cancel(); } catch(_){}
            return { kind: 'stall' };
          } finally {
            if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
          }
          if (chunk.done) break;
          lineBuf += decoder.decode(chunk.value, { stream: true });
          let nl;
          while ((nl = lineBuf.indexOf('\\n')) !== -1) {
            const line = lineBuf.slice(0, nl).trim();
            lineBuf = lineBuf.slice(nl + 1);
            if (!line) continue;
            try {
              const ev = JSON.parse(line);
              if (ev.type === 'pacing') {
                setPacingTier(ev);
              } else if (ev.type === 'kind') {
                if (ev.kind === 'set_down') setDownFlag = true;
              } else if (ev.type === 'text') {
                pushText(ev.text);
              } else if (ev.type === 'error') {
                pushText('*' + (ev.message || 'something went wrong') + '*');
              }
            } catch(_) {}
          }
        }
      } finally {
        if (stallTimer) clearTimeout(stallTimer);
      }
      return { kind: 'ok', setDownFlag };
    }

    let result = null;
    try {
      result = await streamOnce(sessionId);

      // 410 GONE — session expired or was idle-swept on the server
      // side. Clear our stored id, re-bootstrap, retry once. Visitor
      // sees a tiny "reconnecting…" indicator for ~1-2s.
      if (result.kind === 'gone') {
        const app = document.querySelector('.app');
        if (app) app.classList.add('reconnecting');
        clearStoredSession();
        try {
          const freshId = await ensureSession({ forceFresh: true });
          result = await streamOnce(freshId);
        } catch (err) {
          if (err && err.name === 'BootstrapConflict') {
            showConflictModal(err.payload || {});
            result = { kind: 'error', message: 'conflict' };
          } else {
            result = { kind: 'error', message: 'bootstrap_failed' };
          }
        } finally {
          if (app) app.classList.remove('reconnecting');
        }
      }

      // Stall — no chunks for 45s. Surface a clean retry message.
      if (result.kind === 'stall') {
        if (residentRef) await dismissThinking(residentRef.bodyEl);
        if (typewriter) {
          typewriter.push('*lost the room briefly · your message wasn\\'t sent — try again*');
          typewriter.flush();
        }
      }

      // Generic error.
      if (result.kind === 'error') {
        if (residentRef) await dismissThinking(residentRef.bodyEl);
        if (typewriter && result.message !== 'conflict') {
          typewriter.push('*could not reach the room right now. try again in a moment.*');
          typewriter.flush();
        }
      }

      // OK — flush typewriter, settle thinking.
      if (result.kind === 'ok') {
        if (dismissPromise) await dismissPromise;
        else if (residentRef) await dismissThinking(residentRef.bodyEl);
        if (typewriter) typewriter.flush();
        if (result.setDownFlag) document.body.classList.add('set-down');
      }
    } catch(err) {
      if (residentRef) await dismissThinking(residentRef.bodyEl);
      if (typewriter) {
        typewriter.push('*could not reach the room right now. try again in a moment.*');
        typewriter.flush();
      }
    } finally {
      streaming = false;
      // re-enable composer unless we're at hard pacing tier (locked)
      if (sendBtn && currentPacingTier !== 'hard') {
        sendBtn.disabled = (document.getElementById('input')||{value:''}).value.trim().length === 0;
      }
      if (input) input.focus();
      // enable set-down link once we have a session and have sent at
      // least one turn — the visitor has something to set down.
      const sd = document.getElementById('setDownLink');
      if (sd && firstTurnSent) sd.disabled = false;
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

    /* set-down link */
    const setDownLink = document.getElementById('setDownLink');
    if (setDownLink) setDownLink.addEventListener('click', function(){
      if (setDownLink.disabled) return;
      showSetDownConfirm();
    });

    /* bootstrap retry button */
    const bootstrapRetry = document.getElementById('bootstrap-retry');
    if (bootstrapRetry) bootstrapRetry.addEventListener('click', async function(){
      hideBootstrapError();
      try {
        const sid = await ensureSession({ forceFresh: true });
        if (sid) {
          await rehydrate(sid);
          // enable set-down link if rehydration brought back turns
          if (firstTurnSent && setDownLink) setDownLink.disabled = false;
        }
      } catch (err) {
        if (err && err.name === 'BootstrapConflict') {
          showConflictModal(err.payload || {});
        } else {
          showBootstrapError();
        }
      }
    });

    /* sphere + bootstrap */
    startSphere();
    ensureSession().then(async function(sid){
      if (!sid) return;
      await rehydrate(sid);
      if (firstTurnSent && setDownLink) setDownLink.disabled = false;
    }).catch(function(err){
      if (err && err.name === 'BootstrapConflict') {
        showConflictModal(err.payload || {});
      } else {
        // 503/500 — show the inline retry card under the sphere
        showBootstrapError();
      }
    });
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
        <div class="bootstrap-error" id="bootstrap-error" role="alert" aria-live="polite">
          <span class="err-title">the room isn't accessible right now</span>
          <span>try again in a moment — the resident is still here, the gateway is briefly unreachable.</span>
          <button class="err-retry" id="bootstrap-retry" type="button">retry</button>
        </div>
      </div>

      <div class="messages-inner" id="messages-inner"></div>

    </div>
  </div>

  <!-- composer -->
  <div class="composer-zone">
    <div class="composer-column">
      <div class="pacing-eyebrow" id="pacing-eyebrow" role="status" aria-live="polite" aria-atomic="true">
        <span class="dot" aria-hidden="true"></span>
        <span id="pacing-eyebrow-text"></span>
      </div>
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
        <button class="set-down-link" id="setDownLink" type="button" disabled title="set down this thread (consolidate + close)">set down</button>
        <span class="caption-spacer"></span>
        <span class="caption-status">${escapeHtml(slugLower)} · attending</span>
        <span class="reconnecting">reconnecting…</span>
      </div>
    </div>
  </div>

</div>

<!-- overlay (modals: set-down confirm + consolidating + cross-surface conflict) -->
<div class="overlay" id="overlay" role="dialog" aria-modal="true" aria-hidden="true"></div>

<script>${chatScript(resident)}</script>
</body>
</html>`;
}
