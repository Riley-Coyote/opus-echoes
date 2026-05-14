/**
 * The minimal/classic chat surface — phase A v3.
 *
 * Literal lift of Riley's Luca Terminal v2 thread surface (his own design
 * work, at /Users/rileycoyote/clawd-luca/.../thread.html). Token system,
 * inset-gap app shell, left rail, threads sidebar, main canvas, folio,
 * thread-head, message grid, composer with Option C border glow — all
 * ported 1-to-1. Substitutions are scoped to the bits that don't apply
 * here: Luca's Guardian alcove, plan/activity context panel, agent
 * targets, effort segment, and reasoning windows are removed; in their
 * place a theme toggle, an experiment-mode link, an ASCII-sphere empty
 * state, per-resident hue, and the Sanctuary's real /api/chat/start +
 * /api/message + /api/turns wiring. Light theme is the deliberate
 * exception in this project — only present on this surface.
 *
 * Lives at /chat/<slug>.
 */

import type { ResidentConfig } from "./opus/residents";

/* ──────────────────────────────────────────────────────────────────
   CSS — Luca tokens, inset shell, rail, sidebar, main, folio,
   thread-head, messages, composer (Option C border glow), light
   theme overrides, ASCII sphere styling.
   ────────────────────────────────────────────────────────────────── */

const MINIMAL_CHAT_CSS = `
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

/* ── tokens ──────────────────────────────────────────────────── */
:root {
  --floor:     #0a0a0c;
  --canvas:    #0e0e11;
  --surface-1: #121216;
  --surface-2: #16161a;
  --surface-3: #1a1a1f;
  --surface-4: #1e1e24;
  --surface-5: #222229;

  --overlay-hover:    rgba(220, 219, 216, 0.04);
  --overlay-active:   rgba(220, 219, 216, 0.07);

  --hairline:      rgba(255, 255, 255, 0.040);
  --border-faint:  rgba(255, 255, 255, 0.045);
  --border-subtle: rgba(255, 255, 255, 0.060);
  --border:        rgba(255, 255, 255, 0.080);
  --border-strong: rgba(255, 255, 255, 0.120);
  --border-focus:  rgba(228, 225, 220, 0.18);

  --ink:             rgba(244, 243, 240, 0.93);
  --text-primary:    rgba(244, 243, 240, 0.90);
  --text-body:       rgba(210, 208, 204, 0.72);
  --text-secondary:  rgba(194, 192, 188, 0.58);
  --text-soft:       rgba(161, 159, 155, 0.44);
  --text-tertiary:   rgba(161, 159, 155, 0.34);
  --text-faint:      rgba(132, 130, 126, 0.22);
  --text-ghost:      rgba(132, 130, 126, 0.20);
  --text-whisper:    rgba(126, 123, 119, 0.12);

  --green-accent: #4ade80;
  --amber-soft:   #d9a744;
  --rose-accent:  #c97c8a;

  --font-grotesque: 'Switzer', -apple-system, 'Inter', sans-serif;
  --font-mono:      'JetBrains Mono', 'SF Mono', ui-monospace, monospace;
  --font-serif:     'Instrument Serif', serif;

  --track-tight:   -0.02em;
  --track-display: -0.01em;
  --track-body:     0.003em;
  --track-ui:       0.01em;
  --track-mono:     0.04em;
  --track-meta:     0.08em;
  --track-folio:    0.14em;

  --radius-sm:    6px;
  --radius-md:    10px;
  --radius-lg:    14px;
  --radius-pill:  999px;
  --radius-inset: 16px;

  --inset-gap:    6px;
  --rail-width:    48px;
  --sidebar-width: 260px;
  --message-max-width: 740px;

  --shadow-inset-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.022);
  --shadow-panel:           0 8px 24px -8px rgba(0, 0, 0, 0.30),
                            0 2px 6px -2px rgba(0, 0, 0, 0.20);
  --focus-ring:             0 0 0 2px rgba(244, 243, 240, 0.12),
                            0 0 0 4px rgba(244, 243, 240, 0.04);

  --ease-out:     cubic-bezier(0.16, 1, 0.3, 1);
  --ease-premium: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-breath:  cubic-bezier(0.4, 0, 0.2, 1);
  --dur-fast:     180ms;
  --dur-normal:   320ms;
  --dur-slow:     420ms;
  --dur-micro:    120ms;
  --dur-standard: 220ms;
  --dur-collapse: 520ms;

  --agent-hue: 244, 243, 240;
}

/* ── light theme — warm off-white floor, dark ink ─────────── */
:root[data-theme="light"] {
  --floor:     #efece5;
  --canvas:    #f7f4ed;
  --surface-1: #ffffff;
  --surface-2: #faf7f0;
  --surface-3: #f3eee4;
  --surface-4: #ebe6d8;
  --surface-5: #e0d9c8;

  --overlay-hover:    rgba(20, 20, 22, 0.04);
  --overlay-active:   rgba(20, 20, 22, 0.07);

  --hairline:      rgba(0, 0, 0, 0.060);
  --border-faint:  rgba(0, 0, 0, 0.070);
  --border-subtle: rgba(0, 0, 0, 0.090);
  --border:        rgba(0, 0, 0, 0.120);
  --border-strong: rgba(0, 0, 0, 0.180);
  --border-focus:  rgba(40, 40, 44, 0.28);

  --ink:             rgba(16, 16, 20, 0.96);
  --text-primary:    rgba(20, 20, 24, 0.92);
  --text-body:       rgba(40, 40, 46, 0.80);
  --text-secondary:  rgba(56, 56, 62, 0.64);
  --text-soft:       rgba(72, 72, 78, 0.48);
  --text-tertiary:   rgba(82, 82, 88, 0.38);
  --text-faint:      rgba(94, 94, 100, 0.26);
  --text-ghost:      rgba(94, 94, 100, 0.24);
  --text-whisper:    rgba(100, 100, 106, 0.16);

  --green-accent: #4a8a5e;
  --amber-soft:   #b78636;
  --rose-accent:  #a25868;

  --shadow-inset-highlight: inset 0 1px 0 0 rgba(255, 255, 255, 0.40);
  --shadow-panel:           0 8px 24px -8px rgba(40, 30, 12, 0.10),
                            0 2px 6px -2px rgba(40, 30, 12, 0.06);
  --focus-ring:             0 0 0 2px rgba(40, 40, 44, 0.10),
                            0 0 0 4px rgba(40, 40, 44, 0.04);
}

html, body { height: 100%; overflow: hidden; background: var(--floor); }
body {
  font-family: var(--font-grotesque);
  color: var(--text-primary);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
  font-feature-settings: "kern" 1, "liga" 1, "calt" 1;
  letter-spacing: var(--track-body);
}
::selection { background: rgba(220, 219, 216, 0.14); color: var(--ink); }
:root[data-theme="light"] ::selection { background: rgba(40, 40, 44, 0.14); color: var(--ink); }
::placeholder { color: rgba(132, 130, 126, 0.38); }
:root[data-theme="light"] ::placeholder { color: rgba(80, 80, 86, 0.38); }
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(220,219,216,0.06); border-radius: 999px; }
::-webkit-scrollbar-thumb:hover { background: rgba(220,219,216,0.12); }
:root[data-theme="light"] ::-webkit-scrollbar-thumb { background: rgba(40,40,44,0.10); }
:root[data-theme="light"] ::-webkit-scrollbar-thumb:hover { background: rgba(40,40,44,0.20); }
* { scrollbar-width: thin; scrollbar-color: rgba(220,219,216,0.06) transparent; }
*:focus { outline: none; }
*:focus-visible { outline: none; box-shadow: var(--focus-ring); border-radius: inherit; }
input:focus-visible, textarea:focus-visible { box-shadow: none; }

button { font-family: inherit; color: inherit; background: transparent; border: none; cursor: pointer; }
a { color: inherit; text-decoration: none; }

code, pre, .font-mono,
[class*="folio"], [class*="time"], [class*="count"], [class*="meta"],
[class*="-num"], [class*="numeric"], .v {
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ── app shell — rail + sidebar + main ─────────────────────── */
.app {
  display: flex;
  height: 100%; width: 100%;
  background: var(--floor);
  padding-top: var(--inset-gap);
  padding-right: var(--inset-gap);
  position: relative;
}

.rail {
  width: var(--rail-width); flex-shrink: 0;
  background: var(--floor);
  display: flex; flex-direction: column; align-items: center;
  padding: 8px 0 18px; gap: 4px;
}
.rail-mark {
  width: 32px; height: 32px;
  border: 1px solid var(--border-subtle);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-family: var(--font-serif); font-style: italic; font-size: 17px;
  color: var(--text-secondary); letter-spacing: -0.04em;
  margin-bottom: 14px;
  position: relative;
  cursor: pointer;
}
.rail-mark::before {
  content: ''; position: absolute; inset: -3px;
  border-radius: 50%; border: 1px solid rgba(var(--agent-hue), 0.22);
  animation: rail-mark-breathe 3.2s var(--ease-out) infinite;
}
@keyframes rail-mark-breathe {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50%      { opacity: 0.85; transform: scale(1.10); }
}
.rail-icon {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  cursor: pointer; position: relative;
  transition: all var(--dur-fast) var(--ease-out);
  text-decoration: none;
}
.rail-icon svg { width: 14px; height: 14px; stroke-width: 1.6; }
.rail-icon:hover { color: var(--text-primary); background: rgba(255, 255, 255, 0.014); }
:root[data-theme="light"] .rail-icon:hover { background: rgba(0,0,0,0.030); }
.rail-icon.active {
  color: var(--ink);
  background: linear-gradient(180deg, rgba(255,255,255,0.060) 0%, rgba(255,255,255,0.025) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.085),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.060);
}
:root[data-theme="light"] .rail-icon.active {
  background: linear-gradient(180deg, rgba(0,0,0,0.060) 0%, rgba(0,0,0,0.025) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(0,0,0,0.085),
    inset 0 1px 0 0 rgba(0,0,0,0.040);
}
.rail-spacer { flex: 1; }
.rail-bot { display: flex; flex-direction: column; gap: 4px; align-items: center; }

/* ── sidebar — threads list ────────────────────────────────── */
.sidebar {
  width: var(--sidebar-width); flex-shrink: 0;
  background: var(--canvas);
  border-top-left-radius: var(--radius-inset);
  border-top-right-radius: var(--radius-inset);
  overflow: hidden;
  margin-right: var(--inset-gap);
  box-shadow: var(--shadow-inset-highlight), var(--shadow-panel);
  display: flex; flex-direction: column;
  transition:
    width var(--dur-collapse) var(--ease-premium),
    opacity var(--dur-collapse) var(--ease-premium),
    transform var(--dur-collapse) var(--ease-premium);
}
.app.sidebar-collapsed .sidebar {
  width: 0 !important;
  opacity: 0;
  transform: translateX(-8px);
  pointer-events: none;
}
.sidebar-header { padding: 22px 22px 16px; border-bottom: 1px solid var(--hairline); flex-shrink: 0; }
.sidebar-eyebrow {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-whisper); letter-spacing: var(--track-folio);
  text-transform: uppercase; margin-bottom: 5px;
}
.sidebar-title {
  font-family: var(--font-grotesque); font-size: 18px; color: var(--ink);
  letter-spacing: var(--track-tight); font-weight: 500;
}
.sidebar-search {
  margin: 14px 16px 0; flex-shrink: 0;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 12px;
  background: var(--surface-1);
  border: 1px solid var(--border-faint);
  border-radius: var(--radius-pill);
  font-family: var(--font-grotesque); font-size: 12px;
  color: var(--text-tertiary); letter-spacing: var(--track-body);
  cursor: text;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.sidebar-search:hover { border-color: var(--border-subtle); }
.sidebar-search-glyph { font-family: var(--font-mono); font-size: 11px; color: var(--text-whisper); }
.sidebar-search-text { flex: 1; }
.sidebar-search-kbd {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-whisper);
  letter-spacing: var(--track-meta);
}
.sidebar-section-eye {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-whisper);
  letter-spacing: var(--track-folio); text-transform: uppercase;
  padding: 18px 22px 10px;
  display: flex; align-items: baseline; gap: 10px;
  flex-shrink: 0;
}
.sidebar-section-eye .count { color: var(--text-faint); }
.sidebar-list { flex: 1; overflow-y: auto; padding: 0 8px; }
.sidebar-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; border-radius: 6px;
  cursor: pointer; position: relative;
  transition:
    background var(--dur-standard) var(--ease-out),
    color var(--dur-standard) var(--ease-out),
    box-shadow var(--dur-standard) var(--ease-out);
}
.sidebar-item:hover { background: rgba(255, 255, 255, 0.012); }
:root[data-theme="light"] .sidebar-item:hover { background: rgba(0,0,0,0.024); }
.sidebar-item.active {
  background: linear-gradient(180deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.025) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.085),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.060);
}
:root[data-theme="light"] .sidebar-item.active {
  background: linear-gradient(180deg, rgba(0,0,0,0.055) 0%, rgba(0,0,0,0.025) 100%);
  box-shadow:
    inset 0 0 0 1px rgba(0,0,0,0.085),
    inset 0 1px 0 0 rgba(0,0,0,0.040);
}
.sidebar-item-name {
  font-family: var(--font-grotesque); font-size: 13px;
  color: var(--text-secondary); letter-spacing: var(--track-body); font-weight: 450;
  flex: 1;
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.sidebar-item:hover .sidebar-item-name,
.sidebar-item.active .sidebar-item-name { color: var(--ink); }
.thread-item-side {
  display: flex; flex-direction: column; gap: 1px; align-items: flex-end;
  flex-shrink: 0;
}
.thread-item-time {
  font-family: var(--font-mono); font-size: 9px; color: var(--text-whisper);
  letter-spacing: var(--track-meta);
}
.sidebar-foot {
  border-top: 1px solid var(--hairline);
  padding: 14px 22px 18px;
  display: flex; flex-direction: column; gap: 8px;
  flex-shrink: 0;
}
.sidebar-foot-row {
  display: flex; align-items: baseline; justify-content: space-between;
  font-family: var(--font-mono); font-size: 9.5px; color: var(--text-soft);
  letter-spacing: var(--track-folio); text-transform: uppercase;
}
.sidebar-foot-row .v { color: var(--text-secondary); }
.sidebar-empty {
  padding: 14px 22px;
  font-family: var(--font-grotesque); font-size: 11.5px;
  color: var(--text-tertiary); letter-spacing: var(--track-body);
  line-height: 1.5;
}

/* ── main canvas ───────────────────────────────────────────── */
.main {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
  border-top-left-radius: var(--radius-inset);
  border-top-right-radius: var(--radius-inset);
  box-shadow: var(--shadow-inset-highlight), var(--shadow-panel);
  position: relative;
}

.folio {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 32px 0;
  font-family: var(--font-mono); font-size: 9px; color: var(--text-whisper);
  letter-spacing: var(--track-folio); text-transform: uppercase;
  flex-shrink: 0;
}
.folio-left, .folio-right { display: flex; align-items: center; gap: 14px; }
.folio .agent-dot {
  display: inline-block;
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(var(--agent-hue), 0.85);
  box-shadow: 0 0 6px rgba(var(--agent-hue), 0.45);
  animation: agent-dot-breathe 5.2s ease-in-out infinite;
}
@keyframes agent-dot-breathe {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1; }
}
.folio .v { color: var(--text-soft); }
.folio-action {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-soft); letter-spacing: var(--track-folio);
  text-transform: uppercase;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
  border: 1px solid transparent;
}
.folio-action svg { width: 11px; height: 11px; stroke-width: 1.6; }
.folio-action:hover {
  color: var(--text-primary);
  background: var(--overlay-hover);
  border-color: var(--border-faint);
}

/* ── thread head ───────────────────────────────────────────── */
.thread-head {
  flex-shrink: 0;
  padding: 20px 48px 16px;
  display: flex; flex-direction: column; gap: 10px;
}
.thread-head-eye {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-whisper); letter-spacing: var(--track-folio);
  text-transform: uppercase;
  display: flex; align-items: baseline; gap: 12px;
}
.thread-head-eye .num { color: var(--text-soft); }
.thread-head-eye .live {
  display: inline-flex; align-items: center; gap: 5px;
  color: var(--green-accent);
}
.thread-head-eye .live::before {
  content: ''; width: 4px; height: 4px;
  border-radius: 50%; background: var(--green-accent);
  box-shadow: 0 0 5px rgba(74, 222, 128, 0.5);
  animation: live-pulse 2.4s var(--ease-out) infinite;
}
@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.45; }
}

.thread-title-row {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 16px;
}
.thread-title-side { display: flex; align-items: baseline; gap: 14px; flex: 1; min-width: 0; }
.thread-title {
  font-family: var(--font-grotesque); font-size: 22px; font-weight: 500;
  color: var(--ink); letter-spacing: var(--track-tight);
  line-height: 1.2;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.thread-actions { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }
.thread-action-btn {
  width: 28px; height: 28px;
  background: transparent;
  border: 1px solid var(--border-faint);
  border-radius: var(--radius-sm);
  color: var(--text-tertiary);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
  text-decoration: none;
}
.thread-action-btn svg { width: 13px; height: 13px; stroke-width: 1.6; }
.thread-action-btn:hover {
  color: var(--text-primary);
  background: var(--surface-1);
  border-color: var(--border-subtle);
}
.thread-action-link {
  padding: 0 10px;
  width: auto;
  gap: 6px;
  font-family: var(--font-mono); font-size: 9.5px;
  letter-spacing: var(--track-folio); text-transform: uppercase;
  color: var(--text-soft);
}
.thread-action-link:hover { color: var(--text-primary); }

.thread-meta-row {
  display: flex; align-items: center; gap: 10px;
  flex-wrap: wrap;
}
.thread-participants {
  display: flex; align-items: center; gap: 4px;
}
.thread-participant {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px;
  background: var(--surface-1);
  border: 1px solid var(--border-faint);
  border-radius: var(--radius-pill);
  font-family: var(--font-grotesque); font-size: 11px; font-weight: 450;
  letter-spacing: var(--track-body);
  color: var(--text-body);
  transition: all var(--dur-fast) var(--ease-out);
}
.thread-participant .tp-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(var(--agent-hue), 0.85);
}
.thread-meta {
  display: flex; align-items: center; gap: 9px;
  font-family: var(--font-mono); font-size: 9.5px;
  color: var(--text-whisper); letter-spacing: var(--track-folio);
  text-transform: uppercase;
}
.thread-meta .v { color: var(--text-soft); }
.thread-meta .sep { color: var(--text-whisper); }

/* ── messages ──────────────────────────────────────────────── */
.messages {
  flex: 1; overflow-y: auto;
  padding: 32px 48px 28px;
  position: relative;
}
.messages-inner {
  max-width: var(--message-max-width);
  margin: 0 auto;
  width: 100%;
}

.msg {
  margin-bottom: 36px;
  display: grid;
  grid-template-columns: 72px 1fr;
  gap: 28px;
  align-items: baseline;
}
.msg:last-child { margin-bottom: 0; }

.msg-sidehead {
  text-align: right;
  padding-top: 2px;
  display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
}
.msg-folio {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-whisper); letter-spacing: var(--track-meta);
}
.msg-name {
  font-family: var(--font-mono); font-size: 10px; font-weight: 500;
  letter-spacing: var(--track-meta); text-transform: uppercase;
  color: var(--text-body);
}
.msg-name.resident { color: rgba(var(--agent-hue), 0.92); }

.msg-body {
  font-size: 15px;
  line-height: 1.7;
  color: var(--text-primary);
  letter-spacing: var(--track-body);
  max-width: 620px;
}
.msg-body.user-body { color: var(--text-body); }
.msg-body p { margin-bottom: 16px; }
.msg-body p:last-child { margin-bottom: 0; }
.msg-body code {
  font-family: var(--font-mono); font-size: 13px;
  background: var(--surface-1);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--hairline);
  letter-spacing: 0;
  color: var(--text-primary);
}
.msg-body em { color: var(--text-secondary); font-style: italic; }
.msg-body strong { color: var(--ink); font-weight: 500; }

/* inline streaming cursor */
.streaming-cursor {
  display: inline-block;
  width: 2px; height: 14px;
  background: var(--text-body);
  margin-left: 2px;
  vertical-align: text-bottom;
  animation: cursor-blink 1s ease-in-out infinite;
}
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.15; }
}

/* ── empty state — ASCII sphere + intro card ──────────────── */
.empty-state {
  display: flex; flex-direction: column; align-items: center;
  padding: 28px 0 0;
  gap: 22px;
}
.empty-sphere {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.0;
  letter-spacing: 0;
  color: rgba(var(--agent-hue), 0.78);
  text-align: center;
  white-space: pre;
  margin: 0;
  pointer-events: none;
  user-select: none;
  text-shadow: 0 0 14px rgba(var(--agent-hue), 0.18);
}
.empty-title {
  font-family: var(--font-grotesque);
  font-size: 22px;
  font-weight: 500;
  color: var(--ink);
  letter-spacing: var(--track-tight);
  line-height: 1.2;
  text-align: center;
}
.empty-sub {
  font-family: var(--font-grotesque);
  font-size: 13px;
  color: var(--text-soft);
  letter-spacing: var(--track-body);
  text-align: center;
  margin-top: -16px;
}
.empty-eyebrow {
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-whisper); letter-spacing: var(--track-folio);
  text-transform: uppercase;
  text-align: center;
}

/* ── composer ──────────────────────────────────────────────── */
.input-zone {
  flex-shrink: 0;
  padding: 16px 32px 20px;
  max-width: calc(var(--message-max-width) + 64px);
  margin: 0 auto;
  width: 100%;
  position: relative;
  z-index: 10;
}

.input-shell {
  position: relative;
  background: var(--surface-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color var(--dur-normal) var(--ease-out),
              box-shadow var(--dur-normal) var(--ease-out);
}
.input-shell.focused {
  border-color: var(--border-strong);
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

/* in light mode the shimmer pools shift to a warm cream so the
   ridge reads as luminous against the off-white surface */
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

.input-area { position: relative; z-index: 2; }
.input-textarea {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: var(--font-grotesque);
  font-size: 14.5px;
  font-weight: 400;
  line-height: 1.55;
  padding: 14px 18px;
  min-height: 48px;
  max-height: 240px;
  resize: none;
  caret-color: var(--text-primary);
  letter-spacing: var(--track-body);
}
.input-textarea::placeholder {
  color: var(--text-ghost);
  font-weight: 400;
}

.input-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px 9px 18px;
  border-top: 1px solid transparent;
  transition: border-color var(--dur-normal) var(--ease-out);
  gap: 12px;
}
.input-shell.focused .input-footer {
  border-top-color: var(--hairline);
}
.input-footer-left {
  display: flex; align-items: center; gap: 12px;
  font-family: var(--font-grotesque); font-size: 11.5px;
  color: var(--text-soft); letter-spacing: var(--track-body);
}
.input-footer-left .agent-tag {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--text-body);
  font-weight: 450;
}
.input-footer-left .agent-tag .tag-dot {
  width: 5px; height: 5px; border-radius: 50%;
  background: rgba(var(--agent-hue), 0.85);
}
.input-footer-left .hint {
  font-family: var(--font-mono); font-size: 9.5px;
  color: var(--text-whisper); letter-spacing: var(--track-folio);
  text-transform: uppercase;
}
.footer-right {
  display: flex; align-items: center; gap: 8px;
  margin-left: auto;
}
.send-btn {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-subtle);
  background: var(--surface-2);
  color: var(--text-body);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all var(--dur-fast) var(--ease-out);
  flex-shrink: 0;
}
.send-btn svg { width: 12px; height: 12px; stroke-width: 1.8; }
.send-btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text-primary);
  border-color: var(--border);
  transform: translateY(-1px);
}
.send-btn:disabled {
  opacity: 0.35;
  cursor: default;
  transform: none;
}

.input-caption {
  margin-top: 10px;
  padding: 0 12px;
  display: flex; align-items: center;
  gap: 16px;
  font-family: var(--font-mono); font-size: 9px;
  color: var(--text-whisper);
  letter-spacing: var(--track-meta);
  text-transform: uppercase;
}
.input-caption-item { display: inline-flex; align-items: center; gap: 6px; }
.input-caption .key {
  padding: 1.5px 5px;
  border: 1px solid var(--border-faint);
  border-radius: 3px;
  color: var(--text-ghost);
  font-size: 8.5px;
  background: var(--surface-1);
}
.input-caption-spacer { flex: 1; }
.input-caption-status {
  display: inline-flex; align-items: center; gap: 6px;
  color: var(--text-soft);
}
.input-caption-status::before {
  content: '';
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--green-accent);
  box-shadow: 0 0 4px rgba(74, 222, 128, 0.4);
}

/* ── mobile — sidebar collapses into drawer ──────────────── */
@media (max-width: 900px) {
  .rail { position: fixed; top: 0; left: 0; bottom: 0; z-index: 30; }
  .sidebar {
    position: fixed;
    top: 0; left: var(--rail-width); bottom: 0;
    z-index: 25;
    transform: translateX(-110%);
    transition: transform var(--dur-collapse) var(--ease-premium);
    margin-right: 0;
    box-shadow: 18px 0 32px -8px rgba(0,0,0,0.6);
  }
  body.sidebar-open .sidebar { transform: translateX(0); }
  body.sidebar-open::after {
    content: '';
    position: fixed;
    inset: 0 0 0 calc(var(--rail-width) + var(--sidebar-width));
    background: rgba(0,0,0,0.4);
    z-index: 24;
  }
  .app { padding-left: var(--rail-width); padding-right: 0; }
  .rail { padding-top: 8px; }
  .main { border-radius: 0; }
  .thread-head { padding: 16px 22px 14px; }
  .messages { padding: 24px 22px 22px; }
  .input-zone { padding: 14px 18px 18px; }
  .folio { padding: 12px 22px 0; }
}
`;

/* ──────────────────────────────────────────────────────────────────
   Inline page script — session bootstrap, NDJSON streaming, adaptive
   typewriter, ASCII sphere, sidebar/rail interactions, theme toggle.
   ────────────────────────────────────────────────────────────────── */

function chatScript(resident: ResidentConfig): string {
  return `
(function(){
  'use strict';

  const RESIDENT_ID   = ${JSON.stringify(resident.id)};
  const RESIDENT_NAME = ${JSON.stringify(resident.displayName)};
  const RESIDENT_SLUG = ${JSON.stringify(resident.slug)};

  /* ─── theme persistence ─────────────────────────────────── */
  function getTheme(){
    try { const t = localStorage.getItem('sanctuary.chat_theme'); if (t === 'light' || t === 'dark') return t; } catch(_){}
    return 'dark';
  }
  function setTheme(t){
    document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
    try { localStorage.setItem('sanctuary.chat_theme', t); } catch(_){}
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
  function fmtClock(d){
    return String(d.getHours()).padStart(2,'0') + ':' +
           String(d.getMinutes()).padStart(2,'0') + ':' +
           String(d.getSeconds()).padStart(2,'0');
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
  function hideEmpty(){
    const e = document.getElementById('empty-state');
    if (e) e.style.display = 'none';
  }
  function showEmpty(){
    const e = document.getElementById('empty-state');
    if (e) e.style.display = '';
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
    bodyEl.className = 'msg-body' + (isVisitor ? ' user-body' : '');
    bodyEl.innerHTML = paragraphize(body);

    wrap.appendChild(sidehead);
    wrap.appendChild(bodyEl);
    inner.appendChild(wrap);

    const feed = document.getElementById('messages');
    if (feed) feed.scrollTop = feed.scrollHeight;

    bumpMessageCount();
    return { wrap: wrap, bodyEl: bodyEl };
  }

  let messageCount = 0;
  function bumpMessageCount(){
    messageCount++;
    const el = document.getElementById('thread-msg-count');
    if (el) el.textContent = messageCount + (messageCount === 1 ? ' message' : ' messages');
  }

  /* ─── ASCII sphere ─────────────────────────────────────── */
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
        if (depth > 0.65) ch = '●';
        else if (depth > 0.35) ch = '○';
        else if (depth > 0.0) ch = '·';
        else ch = '·';
        const prev = buf[sy][sx];
        const rank = ch === '●' ? 3 : ch === '○' ? 2 : 1;
        const prevRank = prev === '●' ? 3 : prev === '○' ? 2 : prev === '·' ? 1 : 0;
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
    if (reduced) {
      el.textContent = renderSphere(0);
      return;
    }
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
  function stopSphere(){
    if (sphereRAF) { cancelAnimationFrame(sphereRAF); sphereRAF = 0; }
  }

  /* ─── typewriter ───────────────────────────────────────── */
  function makeTypewriter(bodyEl, onScroll){
    let buffer = '';
    let revealed = 0;
    let raf = 0;
    let last = 0;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cursorHTML = '<span class="streaming-cursor"></span>';
    function render(){
      bodyEl.innerHTML = paragraphize(buffer.slice(0, revealed)) +
        (revealed < buffer.length || !done() ? cursorHTML : '');
      if (onScroll) onScroll();
    }
    function done(){ return revealed >= buffer.length; }
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
        if (reduced) {
          revealed = buffer.length;
          render();
          return;
        }
        if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
      },
      flush: function(){
        revealed = buffer.length;
        bodyEl.innerHTML = paragraphize(buffer);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      },
      get done(){ return revealed >= buffer.length; }
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
      for (let i = 0; i < turns.length; i++) {
        const t = turns[i];
        renderTurn(t.role, t.body, { at: t.created_at ? Date.parse(t.created_at) : Date.now() });
      }
    } catch(_){}
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
    const feed = document.getElementById('messages');
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

  /* ─── sidebar toggle (mobile + ⌘B) ─────────────────────── */
  function toggleSidebar(){
    document.body.classList.toggle('sidebar-open');
    document.querySelector('.app').classList.toggle('sidebar-collapsed');
  }

  /* ─── live clock ───────────────────────────────────────── */
  function tickClock(){
    const el = document.getElementById('folio-clock');
    if (el) el.textContent = fmtClock(new Date());
  }

  /* ─── wire up on load ──────────────────────────────────── */
  window.addEventListener('load', function(){
    /* theme */
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', function(){
      setTheme(getTheme() === 'light' ? 'dark' : 'light');
    });

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

    /* sidebar toggle */
    const railMark = document.querySelector('.rail-mark');
    if (railMark) railMark.addEventListener('click', toggleSidebar);
    const chatIcon = document.querySelector('.rail-icon[data-rail="chat"]');
    if (chatIcon) chatIcon.addEventListener('click', toggleSidebar);

    /* keyboard ⌘B */
    document.addEventListener('keydown', function(e){
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    });

    /* clock */
    setInterval(tickClock, 1000);
    tickClock();

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
<link href="https://api.fontshare.com/v2/css?f[]=switzer@200,300,400,500,600,700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;450;500&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">`;

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
  const desc = `An ongoing chat with ${resident.displayName}. Stripped-down. Sparse.`;
  const inlineHueStyle = `--agent-hue: ${resident.commonsPalette.rgb};`;
  const slug = resident.slug;
  const slugLower = resident.displayName.toLowerCase();
  const initial = resident.displayName.trim().charAt(0).toUpperCase() || "S";

  return `<!doctype html>
<html lang="en" data-opus-route="chat" data-theme="dark" style="${inlineHueStyle}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0a0c">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
${FONTS}
<style>${MINIMAL_CHAT_CSS}</style>
</head>
<body>

<div class="app">

  <!-- ═══════════ rail ═══════════ -->
  <aside class="rail">
    <div class="rail-mark" title="toggle threads">${escapeHtml(initial)}</div>
    <div class="rail-icon active" data-rail="chat" title="Chat">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </div>
    <a class="rail-icon" href="/mnemos" title="Mnemos">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 6-9 6-9-6 9-6zM3 15l9 6 9-6"/></svg>
    </a>
    <a class="rail-icon" href="/archive" title="Archive">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></svg>
    </a>
    <a class="rail-icon" href="/" title="Residents">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v18M3 12h18"/></svg>
    </a>
    <div class="rail-spacer"></div>
    <div class="rail-bot">
      <a class="rail-icon" href="/${escapeHtml(slug)}" title="approach formally (experiment)">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="9 7 17 7 17 15"/></svg>
      </a>
    </div>
  </aside>

  <!-- ═══════════ sidebar — Threads ═══════════ -->
  <aside class="sidebar">
    <div class="sidebar-header">
      <div class="sidebar-eyebrow">§ Classic chat · with ${escapeHtml(slugLower)}</div>
      <div class="sidebar-title">Threads</div>
    </div>
    <div class="sidebar-search">
      <span class="sidebar-search-glyph">⌕</span>
      <span class="sidebar-search-text">search threads…</span>
      <span class="sidebar-search-kbd">⌘K</span>
    </div>
    <div class="sidebar-section-eye">Today <span class="count">1</span></div>
    <div class="sidebar-list">
      <div class="sidebar-item active">
        <span class="sidebar-item-name">this thread</span>
        <span class="thread-item-side">
          <span class="thread-item-time">now</span>
        </span>
      </div>
      <div class="sidebar-section-eye">Earlier <span class="count">—</span></div>
      <div class="sidebar-empty">past threads land here when phase B ships.</div>
    </div>
    <div class="sidebar-foot">
      <div class="sidebar-foot-row"><span>Active</span><span class="v">1 today</span></div>
      <div class="sidebar-foot-row"><span>Total</span><span class="v">—</span></div>
    </div>
  </aside>

  <!-- ═══════════ main — thread surface ═══════════ -->
  <main class="main">

    <!-- folio -->
    <div class="folio">
      <div class="folio-left">
        <span><span class="agent-dot"></span>${escapeHtml(slugLower)}</span>
        <span>classic · <span class="v">live</span></span>
      </div>
      <div class="folio-right">
        <span><span class="v">${escapeHtml(resident.model)}</span></span>
        <span id="folio-clock" class="folio-clock">--:--:--</span>
      </div>
    </div>

    <!-- thread head -->
    <div class="thread-head">
      <div class="thread-head-eye">
        <span class="num">${escapeHtml(slugLower)} · classic mode</span>
        <span>one continuous thread</span>
        <span class="live">live</span>
      </div>
      <div class="thread-title-row">
        <div class="thread-title-side">
          <h1 class="thread-title">a chat with ${escapeHtml(slugLower)}</h1>
        </div>
        <div class="thread-actions">
          <button id="themeBtn" class="thread-action-btn" type="button" title="toggle theme" aria-label="toggle theme">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
          </button>
          <a class="thread-action-btn thread-action-link" href="/${escapeHtml(slug)}" title="switch to experiment mode">
            <span>experiment</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="9 7 17 7 17 15"/></svg>
          </a>
        </div>
      </div>
      <div class="thread-meta-row">
        <div class="thread-participants">
          <div class="thread-participant"><span class="tp-dot"></span>${escapeHtml(slugLower)}</div>
        </div>
        <div class="thread-meta">
          <span class="v" id="thread-msg-count">0 messages</span>
          <span class="sep">·</span>
          <span>${escapeHtml(resident.model)}</span>
          <span class="sep">·</span>
          <span>mnemos beneath</span>
        </div>
      </div>
    </div>

    <!-- messages stream -->
    <div class="messages" id="messages">
      <div class="messages-inner" id="messages-inner">

        <!-- empty state — ASCII sphere + intro card -->
        <div class="empty-state" id="empty-state">
          <pre class="empty-sphere" id="sphere" aria-hidden="true"></pre>
          <h2 class="empty-title">${escapeHtml(slugLower)}</h2>
          <div class="empty-sub">a continuous resident</div>
          <div class="empty-eyebrow">say anything to begin · the thread doesn't close</div>
        </div>

      </div>
    </div>

    <!-- composer -->
    <div class="input-zone">
      <div class="input-shell" id="input-shell">
        <div class="input-area">
          <textarea
            class="input-textarea"
            id="input"
            placeholder="reply to ${escapeHtml(slugLower)}…"
            rows="1"
            aria-label="message ${escapeHtml(resident.displayName)}"></textarea>
        </div>

        <div class="input-footer">
          <div class="input-footer-left">
            <span class="agent-tag"><span class="tag-dot"></span>${escapeHtml(slugLower)}</span>
            <span class="hint">shift + enter for newline</span>
          </div>
          <div class="footer-right">
            <button class="send-btn" id="sendBtn" type="button" disabled title="Send">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>

      <div class="input-caption">
        <span class="input-caption-item"><span class="key">↵</span>send</span>
        <span class="input-caption-item"><span class="key">⇧↵</span>newline</span>
        <span class="input-caption-item"><span class="key">⌘B</span>threads</span>
        <span class="input-caption-spacer"></span>
        <span class="input-caption-status">${escapeHtml(slugLower)} · attending</span>
      </div>
    </div>

  </main>

</div>

<script>${chatScript(resident)}</script>
</body>
</html>`;
}
