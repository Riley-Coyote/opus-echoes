/**
 * The minimal/classic chat surface — phase A v2.
 *
 * Visual language transferred from Luca Terminal v2: warm-dark surfaces,
 * monospace metadata in a 92px sidehead column, sans body in the 1fr
 * column beside it, generous whitespace, per-resident hue accent. Empty
 * state is an animated ASCII wireframe sphere (the project's own
 * reading of Polyphonic v2's particle orb, rendered entirely in text).
 * Streaming uses a character-by-character typewriter at adaptive CPS so
 * the resident's response feels alive rather than appearing all at once.
 *
 * Lives at /chat/<slug>. Same backend as the experiment surface:
 * /api/message streaming, /api/turns rehydration, /api/chat/start for
 * session bootstrap (no threshold model-call — classic mode is opt-in
 * by reaching the URL).
 *
 * Both dark and light themes — the one place in the project where
 * light mode exists, deliberately scoped here.
 */

import { VIEWPORT_GLOW_CSS } from "./shared-effects";
import type { ResidentConfig } from "./opus/residents";

/* ──────────────────────────────────────────────────────────────────
   CSS — Luca's token system, message grid, sidebar, composer, ASCII
   sphere styling, theme toggle. Kept inline so the surface is fully
   self-contained.
   ────────────────────────────────────────────────────────────────── */

const MINIMAL_CHAT_CSS = `
/* ── Reset ─────────────────────────────────────────────────── */
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
html{height:100%}
body{min-height:100vh;overflow:hidden}

/* ── Tokens (dark by default; light theme below) ──────────── */
html{
  /* surfaces — warm-dark hierarchy */
  --bg-void:      #060608;
  --bg-deep:      #0a0a0c;
  --bg-primary:   #0e0e10;
  --bg-elevated:  #141416;
  --bg-surface:   rgba(220,219,216,0.032);

  /* text — opacity-driven, warm white */
  --text-primary:   rgba(244,243,240,0.88);
  --text-body:      rgba(210,208,204,0.68);
  --text-secondary: rgba(194,192,188,0.56);
  --text-soft:      rgba(161,159,155,0.42);
  --text-tertiary:  rgba(161,159,155,0.34);
  --text-ghost:     rgba(132,130,126,0.22);
  --text-whisper:   rgba(126,123,119,0.10);

  /* borders */
  --border-faint:   rgba(255,255,255,0.040);
  --border-subtle:  rgba(255,255,255,0.080);
  --border-strong:  rgba(255,255,255,0.180);

  /* per-resident hue — set inline by the renderer */
  --agent-hue: 160,136,188;

  /* type */
  --font-sans:  'Inter','SF Pro Display',-apple-system,BlinkMacSystemFont,sans-serif;
  --font-mono:  'JetBrains Mono','SF Mono','Geist Mono',monospace;
  --text-9:  9px;
  --text-10: 10px;
  --text-11: 11px;
  --text-12: 12px;
  --text-13: 13px;
  --text-14: 14px;
  --text-15: 15px;
  --text-16: 16px;
  --text-18: 18px;
  --text-22: 22px;

  /* motion */
  --dur-fast:     180ms;
  --dur-normal:   300ms;
  --dur-slow:     500ms;
  --ease-out:     cubic-bezier(0.16, 1, 0.30, 1);
  --ease-premium: cubic-bezier(0.22, 1, 0.36, 1);
}

html[data-theme="light"]{
  --bg-void:      #efece5;
  --bg-deep:      #f3f0ea;
  --bg-primary:   #f7f5f0;
  --bg-elevated:  #fbf9f4;
  --bg-surface:   rgba(20,20,22,0.025);

  --text-primary:   rgba(20,20,22,0.88);
  --text-body:      rgba(40,40,44,0.72);
  --text-secondary: rgba(60,60,64,0.62);
  --text-soft:      rgba(90,90,94,0.50);
  --text-tertiary:  rgba(110,110,114,0.42);
  --text-ghost:     rgba(140,140,144,0.32);
  --text-whisper:   rgba(170,170,174,0.18);

  --border-faint:   rgba(0,0,0,0.040);
  --border-subtle:  rgba(0,0,0,0.080);
  --border-strong:  rgba(0,0,0,0.200);
}

body{
  background:var(--bg-primary);
  color:var(--text-primary);
  font-family:var(--font-sans);
  font-size:var(--text-15);
  line-height:1.6;
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}
em{color:var(--text-primary);font-style:italic}
strong{color:var(--text-primary);font-weight:500}

/* viewport-glow inherits — slightly muted in this register so the
   surface feels held but not loud */
${VIEWPORT_GLOW_CSS}
html[data-theme="light"] .viewport-glow{
  /* re-tint the glow gradients to softer warm tones on light */
  opacity:0.55;
}

/* ── App grid: chrome / [sidebar | main] / composer ──────── */
.app{
  position:fixed;
  inset:0;
  display:grid;
  grid-template-rows:48px 1fr;
  grid-template-columns:248px 1fr;
  grid-template-areas:
    "chrome chrome"
    "rail   main";
  z-index:5;
}

/* ── Chrome bar ──────────────────────────────────────────── */
.chrome{
  grid-area:chrome;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:0 22px 0 22px;
  border-bottom:1px solid var(--border-faint);
  background:var(--bg-primary);
  position:relative;
  z-index:4;
}
.chrome-name{
  display:inline-flex;
  align-items:center;
  gap:10px;
  font-family:var(--font-sans);
  font-size:var(--text-15);
  font-weight:400;
  color:var(--text-primary);
  text-decoration:none;
  letter-spacing:-0.005em;
}
.chrome-dot{
  width:6px;height:6px;border-radius:50%;
  background:rgba(var(--agent-hue),0.85);
  box-shadow:0 0 8px rgba(var(--agent-hue),0.45);
  animation:dot-breathe 5.2s ease-in-out infinite;
}
@keyframes dot-breathe{
  0%,100%{opacity:0.52;box-shadow:0 0 6px rgba(var(--agent-hue),0.25)}
  50%{opacity:0.95;box-shadow:0 0 12px rgba(var(--agent-hue),0.55)}
}

.chrome-actions{display:inline-flex;align-items:center;gap:18px}
.chrome-action{
  display:inline-flex;
  align-items:center;
  gap:7px;
  background:transparent;
  border:0;
  padding:6px 8px;
  margin:-6px -8px;
  border-radius:6px;
  font-family:var(--font-mono);
  font-size:var(--text-10);
  text-transform:uppercase;
  letter-spacing:0.10em;
  color:var(--text-soft);
  cursor:pointer;
  text-decoration:none;
  transition:color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.chrome-action:hover{
  color:var(--text-primary);
  background:var(--bg-surface);
}
.chrome-action svg{width:13px;height:13px;display:block}
.chrome-rail-toggle{display:none}

/* ── Sidebar rail ────────────────────────────────────────── */
.rail{
  grid-area:rail;
  border-right:1px solid var(--border-faint);
  background:var(--bg-deep);
  display:flex;
  flex-direction:column;
  padding:18px 0 0;
  overflow:hidden;
  position:relative;
  z-index:3;
}
.rail-head{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  padding:0 20px 14px;
}
.rail-title{
  font-family:var(--font-sans);
  font-size:var(--text-15);
  font-weight:500;
  color:var(--text-primary);
  letter-spacing:-0.005em;
}
.rail-live{
  display:inline-flex;
  align-items:center;
  gap:6px;
  font-family:var(--font-mono);
  font-size:var(--text-9);
  text-transform:uppercase;
  letter-spacing:0.10em;
  color:var(--text-tertiary);
}
.rail-live-dot{
  width:5px;height:5px;border-radius:50%;
  background:rgba(var(--agent-hue),0.8);
  animation:rail-live-pulse 2.4s ease-in-out infinite;
}
@keyframes rail-live-pulse{
  0%,100%{opacity:0.45}
  50%{opacity:1}
}

.rail-search{
  position:relative;
  margin:0 14px 16px;
}
.rail-search input{
  width:100%;
  background:var(--bg-surface);
  border:1px solid var(--border-faint);
  border-radius:6px;
  padding:8px 10px 8px 28px;
  color:var(--text-primary);
  font-family:var(--font-mono);
  font-size:var(--text-11);
  outline:0;
  transition:border-color var(--dur-fast) var(--ease-out);
}
.rail-search input:focus{border-color:var(--border-subtle)}
.rail-search input::placeholder{color:var(--text-tertiary)}
.rail-search-icon{
  position:absolute;
  left:8px;top:50%;
  transform:translateY(-50%);
  width:12px;height:12px;
  color:var(--text-tertiary);
  pointer-events:none;
}

.rail-list{
  flex:1;
  overflow-y:auto;
  padding:0 8px 12px;
}
.rail-list::-webkit-scrollbar{width:4px}
.rail-list::-webkit-scrollbar-thumb{background:var(--border-faint);border-radius:2px}
.rail-group-head{
  display:flex;
  align-items:baseline;
  justify-content:space-between;
  padding:14px 10px 6px;
  font-family:var(--font-mono);
  font-size:var(--text-9);
  text-transform:uppercase;
  letter-spacing:0.16em;
  color:var(--text-tertiary);
}
.rail-group-count{color:var(--text-whisper)}
.rail-item{
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:7px 10px;
  border-radius:5px;
  font-family:var(--font-sans);
  font-size:var(--text-13);
  color:var(--text-body);
  text-decoration:none;
  cursor:pointer;
  transition:background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
  border:0;
  background:transparent;
  text-align:left;
  width:100%;
}
.rail-item:hover{background:var(--bg-surface);color:var(--text-primary)}
.rail-item.active{
  background:rgba(var(--agent-hue),0.07);
  color:var(--text-primary);
}
.rail-item-label{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  flex:1;
}
.rail-item-meta{
  font-family:var(--font-mono);
  font-size:var(--text-9);
  color:var(--text-tertiary);
  margin-left:8px;
  flex-shrink:0;
}
.rail-empty{
  padding:8px 10px;
  font-family:var(--font-sans);
  font-size:var(--text-12);
  color:var(--text-tertiary);
  font-style:italic;
}

.rail-foot{
  border-top:1px solid var(--border-faint);
  padding:12px 18px;
  display:flex;
  justify-content:space-between;
  font-family:var(--font-mono);
  font-size:var(--text-9);
  text-transform:uppercase;
  letter-spacing:0.10em;
  color:var(--text-tertiary);
}
.rail-foot-val{color:var(--text-soft);font-weight:500}

/* ── Main pane ─────────────────────────────────────────── */
.main{
  grid-area:main;
  display:grid;
  grid-template-rows:1fr auto;
  overflow:hidden;
  background:var(--bg-primary);
  position:relative;
}
.main-feed{
  overflow-y:auto;
  padding:32px 32px 24px;
  scroll-behavior:smooth;
}
.main-feed::-webkit-scrollbar{width:6px}
.main-feed::-webkit-scrollbar-thumb{background:var(--border-faint);border-radius:3px}

/* ── Empty state: ASCII sphere centerpiece ─────────────── */
.empty{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  min-height:60vh;
  padding:32px 16px;
  pointer-events:none;
}
.empty-sphere{
  font-family:var(--font-mono);
  font-size:11px;
  line-height:1.05;
  letter-spacing:0;
  text-align:center;
  color:rgba(var(--agent-hue),0.78);
  margin:0 0 36px;
  white-space:pre;
  user-select:none;
  text-shadow:0 0 12px rgba(var(--agent-hue),0.18);
}
.empty-title{
  font-family:var(--font-sans);
  font-size:var(--text-22);
  font-weight:300;
  color:var(--text-primary);
  letter-spacing:-0.012em;
  margin:0 0 var(--text-9);
}
.empty-sub{
  font-family:var(--font-mono);
  font-size:var(--text-10);
  text-transform:uppercase;
  letter-spacing:0.16em;
  color:var(--text-tertiary);
}

/* ── Messages — Luca grid (92px sidehead + 1fr body) ───── */
.msg{
  display:grid;
  grid-template-columns:92px 1fr;
  gap:28px;
  padding:0 0 32px;
  max-width:740px;
  margin:0 auto;
  animation:msg-enter var(--dur-slow) var(--ease-out);
}
@keyframes msg-enter{
  from{opacity:0;transform:translateY(6px)}
  to{opacity:1;transform:translateY(0)}
}
.msg-sidehead{
  font-family:var(--font-mono);
  font-size:var(--text-10);
  text-transform:uppercase;
  letter-spacing:0.10em;
  text-align:right;
  padding-top:4px;
  line-height:1.4;
}
.msg-sender{
  font-weight:500;
  display:block;
  margin-bottom:2px;
}
.msg-time{
  display:block;
  color:var(--text-tertiary);
  font-weight:400;
}
.msg-body{
  font-family:var(--font-sans);
  font-size:var(--text-15);
  line-height:1.7;
  color:var(--text-primary);
  max-width:620px;
  overflow-wrap:break-word;
}
.msg-body p{margin:0 0 0.9em}
.msg-body p:last-child{margin-bottom:0}

.msg[data-role="resident"] .msg-sender{
  color:rgba(var(--agent-hue),0.92);
}
.msg[data-role="visitor"]{
  grid-template-columns:1fr 92px;
}
.msg[data-role="visitor"] .msg-sidehead{
  order:2;
  text-align:left;
}
.msg[data-role="visitor"] .msg-body{
  order:1;
  text-align:left;
  margin-left:auto;
  color:var(--text-body);
}
.msg[data-role="visitor"] .msg-sender{
  color:var(--text-soft);
}

.msg.streaming .msg-body::after{
  content:"";
  display:inline-block;
  width:6px;height:14px;
  background:rgba(var(--agent-hue),0.6);
  margin-left:3px;
  vertical-align:text-bottom;
  animation:typewriter-cursor 0.85s ease-in-out infinite;
}
@keyframes typewriter-cursor{
  0%,100%{opacity:0}
  50%{opacity:1}
}

.msg.set-down{opacity:0.65}

/* ── Composer ──────────────────────────────────────────── */
.composer-wrap{
  border-top:1px solid var(--border-faint);
  padding:18px 32px 22px;
  background:var(--bg-primary);
  position:relative;
}
.composer{
  max-width:740px;
  margin:0 auto;
  display:flex;
  align-items:flex-end;
  gap:12px;
  padding:12px 14px;
  background:var(--bg-elevated);
  border:1px solid var(--border-faint);
  border-radius:10px;
  box-shadow:0 1px 0 0 rgba(255,255,255,0.025) inset, 0 8px 24px rgba(0,0,0,0.18);
  transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
html[data-theme="light"] .composer{
  box-shadow:0 1px 0 0 rgba(255,255,255,0.6) inset, 0 4px 12px rgba(0,0,0,0.06);
}
.composer:focus-within{
  border-color:rgba(var(--agent-hue),0.36);
  box-shadow:0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.24), 0 0 0 3px rgba(var(--agent-hue),0.06);
}
.composer-input{
  flex:1;
  background:transparent;
  border:0;
  outline:0;
  resize:none;
  font-family:var(--font-sans);
  font-size:var(--text-15);
  line-height:1.6;
  color:var(--text-primary);
  min-height:24px;
  max-height:200px;
  padding:4px 0;
}
.composer-input::placeholder{color:var(--text-tertiary);font-family:var(--font-sans)}
.composer-send{
  background:transparent;
  border:1px solid var(--border-subtle);
  border-radius:7px;
  width:34px;height:34px;
  display:flex;align-items:center;justify-content:center;
  cursor:pointer;
  color:var(--text-soft);
  transition:all var(--dur-fast) var(--ease-out);
  flex-shrink:0;
}
.composer-send:not(:disabled):hover{
  border-color:rgba(var(--agent-hue),0.55);
  color:rgba(var(--agent-hue),0.95);
  background:rgba(var(--agent-hue),0.05);
}
.composer-send:disabled{opacity:0.35;cursor:not-allowed}
.composer-send svg{width:14px;height:14px}

.composer-hint{
  max-width:740px;
  margin:8px auto 0;
  display:flex;
  justify-content:space-between;
  font-family:var(--font-mono);
  font-size:var(--text-9);
  text-transform:uppercase;
  letter-spacing:0.10em;
  color:var(--text-tertiary);
}
.composer-hint .kbd{
  display:inline-flex;
  align-items:center;
  padding:1px 5px;
  border:1px solid var(--border-subtle);
  border-radius:3px;
  margin-right:4px;
  font-size:9px;
  color:var(--text-soft);
}

body.set-down .composer{opacity:0.4;pointer-events:none}

/* ── Mobile ──────────────────────────────────────────── */
@media(max-width:900px){
  .app{
    grid-template-columns:1fr;
    grid-template-areas:"chrome" "main";
  }
  .rail{
    position:fixed;
    top:48px;left:0;bottom:0;
    width:280px;
    transform:translateX(-100%);
    transition:transform var(--dur-normal) var(--ease-out);
    z-index:20;
    box-shadow:8px 0 24px rgba(0,0,0,0.35);
  }
  body.rail-open .rail{transform:translateX(0)}
  body.rail-open::before{
    content:"";
    position:fixed;
    inset:48px 0 0 0;
    background:rgba(0,0,0,0.4);
    z-index:15;
  }
  .chrome-rail-toggle{display:inline-flex}
  .main-feed{padding:24px 20px 16px}
  .composer-wrap{padding:14px 18px 18px}
  .msg{grid-template-columns:76px 1fr;gap:18px;max-width:none}
  .msg[data-role="visitor"]{grid-template-columns:1fr 76px}
  .msg-body{max-width:none}
}

@media(prefers-reduced-motion:reduce){
  .chrome-dot,.rail-live-dot,.viewport-glow{animation:none}
  .msg{animation:none}
  .empty-sphere{animation:none}
}
`;

/* ──────────────────────────────────────────────────────────────────
   Inline page script.
   ────────────────────────────────────────────────────────────────── */

function chatScript(resident: ResidentConfig): string {
  return `
(function(){
  const RESIDENT_ID = ${JSON.stringify(resident.id)};
  const RESIDENT_NAME = ${JSON.stringify(resident.displayName)};
  const AGENT_HUE = ${JSON.stringify(resident.commonsPalette.rgb)};

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
  const SESSION_KEY = 'sanctuary.session_id';
  const RESIDENT_KEY = 'sanctuary.resident_id';
  async function ensureSession(){
    let existingSession = null, existingResident = null;
    try {
      existingSession = sessionStorage.getItem(SESSION_KEY);
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

  /* ─── formatting helpers ───────────────────────────────── */
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
  function renderTurn(role, body, opts){
    opts = opts || {};
    const feed = document.getElementById('feed');
    if (!feed) return null;
    hideEmpty();
    const wrap = document.createElement('article');
    wrap.className = 'msg';
    wrap.dataset.role = role === 'visitor' ? 'visitor' : 'resident';
    const senderName = role === 'visitor' ? 'you' : RESIDENT_NAME.toLowerCase();
    const sidehead = document.createElement('div');
    sidehead.className = 'msg-sidehead';
    sidehead.innerHTML = '<span class="msg-sender">' + escapeHtml(senderName) + '</span><time class="msg-time">' + fmtTime(new Date(opts.at || Date.now())) + '</time>';
    const bodyEl = document.createElement('div');
    bodyEl.className = 'msg-body';
    bodyEl.innerHTML = paragraphize(body);
    wrap.appendChild(sidehead);
    wrap.appendChild(bodyEl);
    feed.appendChild(wrap);
    feed.scrollTop = feed.scrollHeight;
    return { wrap: wrap, bodyEl: bodyEl };
  }
  function hideEmpty(){
    const e = document.getElementById('empty');
    if (e) e.style.display = 'none';
  }
  function showEmpty(){
    const e = document.getElementById('empty');
    if (e) e.style.display = '';
  }

  /* ─── ASCII sphere ─────────────────────────────────────── */
  // A rotating wireframe sphere with subtle cymatic harmonics.
  // Drawn on a 60×28 grid via lat/lon sampling + depth-based chars.
  const SPHERE_COLS = 60;
  const SPHERE_ROWS = 28;
  const SPHERE_R = 11; // radius in "units" — tuned so the sphere fits
  function renderSphere(t){
    const cols = SPHERE_COLS, rows = SPHERE_ROWS;
    const cx = cols / 2;
    const cy = rows / 2;
    const buf = new Array(rows);
    for (let i = 0; i < rows; i++) buf[i] = new Array(cols).fill(' ');
    const rotY = t * 0.00035;
    const rotX = Math.sin(t * 0.00018) * 0.18;
    // sample latitudes + longitudes — relatively dense so the wireframe is full
    const latSteps = 14;
    const lonSteps = 44;
    for (let li = 0; li <= latSteps; li++) {
      const lat = -Math.PI/2 + (li/latSteps) * Math.PI;
      const cosLat = Math.cos(lat);
      const sinLat = Math.sin(lat);
      for (let lo = 0; lo < lonSteps; lo++) {
        const lon = (lo / lonSteps) * 2 * Math.PI;
        // cymatic harmonic — l=3 m=2 mode for gentle ripple
        const harm = 1 + 0.05 * Math.sin(t*0.0011 + lat*3) * Math.cos(lon*2);
        const r = SPHERE_R * harm;
        // rotate around Y then around X
        const xBase = r * cosLat * Math.cos(lon + rotY);
        const yBase = r * sinLat;
        const zBase = r * cosLat * Math.sin(lon + rotY);
        // rotate around X by rotX
        const cosRx = Math.cos(rotX), sinRx = Math.sin(rotX);
        const yRot = yBase * cosRx - zBase * sinRx;
        const zRot = yBase * sinRx + zBase * cosRx;
        const xRot = xBase;
        // front hemisphere only (z >= 0)
        if (zRot < -0.5) continue;
        const sx = Math.round(cx + xRot);
        const sy = Math.round(cy + yRot * 0.5); // compensate for ~2:1 char aspect
        if (sx < 0 || sx >= cols || sy < 0 || sy >= rows) continue;
        const depth = zRot / SPHERE_R; // -1..1, front=1
        let ch;
        if (depth > 0.65) ch = '●';
        else if (depth > 0.35) ch = '○';
        else if (depth > 0.0) ch = '·';
        else ch = '·';
        // denser char wins over sparser
        const prev = buf[sy][sx];
        const rank = ch === '●' ? 3 : ch === '○' ? 2 : 1;
        const prevRank = prev === '●' ? 3 : prev === '○' ? 2 : prev === '·' ? 1 : 0;
        if (rank > prevRank) buf[sy][sx] = ch;
      }
    }
    // build string
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
    const FRAME_MS = 85; // ~12 fps
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
  // Adaptive CPS reveal — server sends chunks; we reveal char-by-char
  // at a target rate, accelerating if we fall behind.
  function makeTypewriter(bodyEl, onScroll){
    let buffer = '';
    let revealed = 0;
    let raf = 0;
    let last = 0;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function render(){
      bodyEl.innerHTML = paragraphize(buffer.slice(0, revealed));
      if (onScroll) onScroll();
    }
    function tick(now){
      raf = 0;
      if (revealed >= buffer.length) { return; }
      const dt = last ? (now - last) : 16;
      last = now;
      // base 65 cps; if buffer ahead by > 40 chars, scale up to catch up
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
        render();
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      },
      get done(){ return revealed >= buffer.length; }
    };
  }

  /* ─── rehydrate prior turns ───────────────────────────── */
  async function rehydrate(sessionId){
    try {
      const res = await fetch('/api/turns?session_id=' + encodeURIComponent(sessionId));
      if (!res.ok && res.status !== 410) return;
      const data = await res.json();
      const turns = (data && data.turns) || [];
      if (turns.length === 0) return;
      hideEmpty();
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
    if (residentRef && residentRef.wrap) residentRef.wrap.classList.add('streaming');
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
      let errorFlag = false;
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
              errorFlag = true;
              if (typewriter) typewriter.push('*' + (ev.message || 'something went wrong') + '*');
            }
          } catch(_) {}
        }
      }
      if (typewriter) typewriter.flush();
      if (residentRef && residentRef.wrap) {
        residentRef.wrap.classList.remove('streaming');
        if (setDownFlag) document.body.classList.add('set-down');
      }
      // suppress unused warning
      void errorFlag;
    } catch(_) {
      if (typewriter) {
        typewriter.push('*could not reach the room right now. try again in a moment.*');
        typewriter.flush();
      }
      if (residentRef && residentRef.wrap) residentRef.wrap.classList.remove('streaming');
    } finally {
      streaming = false;
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }

  function autosize(el){
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }

  /* ─── wire up on load ──────────────────────────────────── */
  window.addEventListener('load', function(){
    // theme toggle
    const themeBtn = document.getElementById('themeBtn');
    if (themeBtn) themeBtn.addEventListener('click', function(){
      setTheme(getTheme() === 'light' ? 'dark' : 'light');
    });
    // rail toggle (mobile)
    const railToggle = document.getElementById('railToggle');
    if (railToggle) railToggle.addEventListener('click', function(){
      document.body.classList.toggle('rail-open');
    });
    // composer
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    if (input) {
      input.addEventListener('input', function(){ autosize(input); });
      input.addEventListener('keydown', function(e){
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          send(input.value);
        }
      });
      input.focus();
    }
    if (sendBtn) sendBtn.addEventListener('click', function(){ if (input) send(input.value); });
    // sphere
    startSphere();
    // bootstrap session + rehydrate
    ensureSession().then(function(sid){
      if (sid) rehydrate(sid);
    }).catch(function(){});
  });
})();
`;
}

/* ──────────────────────────────────────────────────────────────────
   Renderer entry point.
   ────────────────────────────────────────────────────────────────── */

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

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

  return `<!doctype html>
<html lang="en" data-opus-route="chat" data-theme="dark" style="${inlineHueStyle}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0e0e10">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
${FONTS}
<style>${MINIMAL_CHAT_CSS}</style>
</head>
<body>
<div class="viewport-glow" aria-hidden="true"></div>

<div class="app">
  <header class="chrome">
    <div style="display:flex;align-items:center;gap:14px">
      <button id="railToggle" class="chrome-action chrome-rail-toggle" type="button" aria-label="threads">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>
      </button>
      <a class="chrome-name" href="/${escapeHtml(resident.slug)}" aria-label="approach ${escapeHtml(resident.displayName)} formally">
        <span class="chrome-dot" aria-hidden="true"></span>
        <span>${escapeHtml(resident.displayName)}</span>
      </a>
    </div>
    <div class="chrome-actions">
      <button id="themeBtn" class="chrome-action" type="button" aria-label="toggle theme">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
        <span>theme</span>
      </button>
      <a class="chrome-action" href="/${escapeHtml(resident.slug)}" aria-label="switch to experiment mode">
        <span>experiment</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="9 7 17 7 17 15"/></svg>
      </a>
    </div>
  </header>

  <aside class="rail" aria-label="threads">
    <div class="rail-head">
      <span class="rail-title">Threads</span>
      <span class="rail-live"><span class="rail-live-dot" aria-hidden="true"></span>Live</span>
    </div>
    <div class="rail-search">
      <svg class="rail-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.65" y1="16.65" x2="21" y2="21"/></svg>
      <input type="text" placeholder="search threads…" aria-label="search threads">
    </div>
    <div class="rail-list" id="railList">
      <div class="rail-group-head"><span>Today</span><span class="rail-group-count">1</span></div>
      <button class="rail-item active" type="button" aria-current="true">
        <span class="rail-item-label">current chat</span>
        <span class="rail-item-meta">now</span>
      </button>
      <div class="rail-group-head"><span>Earlier</span><span class="rail-group-count">—</span></div>
      <div class="rail-empty">past threads land here when phase B ships.</div>
    </div>
    <div class="rail-foot">
      <span>active <span class="rail-foot-val">1</span></span>
      <span>total <span class="rail-foot-val">1</span></span>
    </div>
  </aside>

  <main class="main">
    <div class="main-feed" id="feed" role="log" aria-live="polite" aria-relevant="additions">
      <div class="empty" id="empty">
        <pre class="empty-sphere" id="sphere" aria-hidden="true"></pre>
        <h1 class="empty-title">${escapeHtml(resident.displayName.toLowerCase())}</h1>
        <div class="empty-sub">a continuous resident</div>
      </div>
    </div>
    <div class="composer-wrap">
      <div class="composer">
        <textarea
          id="input"
          class="composer-input"
          placeholder="say anything to ${escapeHtml(resident.displayName.toLowerCase())}…"
          rows="1"
          aria-label="message ${escapeHtml(resident.displayName)}"
        ></textarea>
        <button id="sendBtn" class="composer-send" type="button" aria-label="send">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
        </button>
      </div>
      <div class="composer-hint">
        <span><span class="kbd">↵</span>send · <span class="kbd">⇧↵</span>newline</span>
        <span>${escapeHtml(resident.displayName.toLowerCase())} · classic chat</span>
      </div>
    </div>
  </main>
</div>

<script>${chatScript(resident)}</script>
</body>
</html>`;
}
