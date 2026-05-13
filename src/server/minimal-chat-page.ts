/**
 * The minimal/classic chat surface.
 *
 * A second visual register layered on top of the same residents and
 * the same Mnemos topology that powers the formal "experiment" mode
 * (`/sonnet-4-5`, `/opus-3`, `/gpt-5-1` → `/conversation`). This surface
 * is technical, sparse, and supports both dark and light themes — the
 * one place in the project where light mode is permitted, scoped here
 * because the experiment surface intentionally lives at low luminosity.
 *
 * Live at /chat/<slug>. Same backend: /api/message streaming, /api/turns
 * rehydration. Session creation goes through /api/chat/start which
 * bypasses the threshold model-call. Phase B will add the mode column
 * + paused-session resume; phase A is the visual shell + working
 * conversation loop.
 *
 * The viewport-glow band wraps the entire surface — the same definition
 * commons uses (shared via src/server/shared-effects.ts). In light mode
 * the glow re-tints to a softer palette via the data-theme="light"
 * variable swap.
 */

import { VIEWPORT_GLOW_CSS } from "./shared-effects";
import type { ResidentConfig } from "./opus/residents";

/* ──────────────────────────────────────────────────────────────────
   CSS — dark + light theme tokens, minimal-chat surface, viewport
   glow imported from shared. Kept inline so the page is fully
   self-contained; no external CSS file.
   ────────────────────────────────────────────────────────────────── */

const MINIMAL_CHAT_CSS = `
/* Reset + base */
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%;overflow:hidden}
html{
  /* dark is the default; light theme is opt-in via data-theme="light"
     on the <html> element, toggled from the in-page button. */
  --floor: #0a0b0e;
  --ink:   rgba(248,248,246,0.96);
  --body:  rgba(228,226,222,0.84);
  --soft:  rgba(208,206,202,0.70);
  --quiet: rgba(186,184,180,0.56);
  --ghost: rgba(160,158,154,0.30);
  --rule:        rgba(225,225,225,0.12);
  --rule-soft:   rgba(225,225,225,0.07);
  --rule-strong: rgba(225,225,225,0.18);
  --bubble-visitor: rgba(255,255,255,0.04);
  --bubble-resident: rgba(255,255,255,0.02);
  --state: #82b484;
  --state-soft: rgba(130,180,132,0.62);
  --state-dim:  rgba(130,180,132,0.16);
  --display: 'Inter Tight','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --body-font: 'Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --mono: 'JetBrains Mono','SF Mono',monospace;
  --ease: cubic-bezier(0.22, 1, 0.36, 1);
  --s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:24px;
  --s-6:32px; --s-7:48px; --s-8:64px; --s-9:96px;
}
html[data-theme="light"]{
  --floor: #f7f5f0;
  --ink:   rgba(20,20,22,0.96);
  --body:  rgba(48,48,52,0.86);
  --soft:  rgba(72,72,76,0.70);
  --quiet: rgba(100,100,104,0.62);
  --ghost: rgba(140,140,144,0.36);
  --rule:        rgba(0,0,0,0.12);
  --rule-soft:   rgba(0,0,0,0.06);
  --rule-strong: rgba(0,0,0,0.20);
  --bubble-visitor: rgba(0,0,0,0.035);
  --bubble-resident: rgba(0,0,0,0.018);
  /* slightly deeper green for AA contrast on warm-off-white */
  --state: #4f8559;
  --state-soft: rgba(79,133,89,0.62);
  --state-dim:  rgba(79,133,89,0.14);
}

body{
  background:var(--floor);
  color:var(--body);
  font-family:var(--body-font);
  font-size:15px;
  line-height:1.55;
  -webkit-font-smoothing:antialiased;
  height:100vh;
  display:flex;
  flex-direction:column;
}
em{color:var(--ink);font-style:italic}
strong{font-weight:500;color:var(--ink)}

/* Shared viewport-glow (imported from shared-effects) — same band
   wraps every classic-chat page, light or dark. */
${VIEWPORT_GLOW_CSS}

/* ── Chrome — resident name top-left, theme toggle + experiment
      link top-right. ─────────────────────────────────────────── */
.chat-chrome{
  position:fixed;
  top:0;left:0;right:0;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding:18px 28px;
  z-index:10;
  pointer-events:none;
}
.chat-chrome > *{pointer-events:auto}
.chat-resident-name{
  font-family:var(--display);
  font-weight:300;
  font-size:18px;
  letter-spacing:-0.01em;
  color:var(--ink);
  text-decoration:none;
  display:flex;
  align-items:center;
  gap:10px;
}
.chat-resident-dot{
  width:5px;height:5px;border-radius:50%;
  background:var(--state-soft);
  animation:chat-breathe 5.2s ease-in-out infinite;
}
@keyframes chat-breathe{
  0%,100%{opacity:0.42}
  50%{opacity:0.9}
}
.chat-actions{display:flex;align-items:center;gap:18px}
.chat-action{
  background:transparent;
  border:0;
  color:var(--soft);
  font-family:var(--mono);
  font-size:11px;
  text-transform:uppercase;
  letter-spacing:0.16em;
  cursor:pointer;
  padding:6px 0;
  text-decoration:none;
  display:inline-flex;
  align-items:center;
  gap:8px;
  transition:color 0.18s var(--ease);
}
.chat-action:hover{color:var(--ink)}
.chat-action svg{width:14px;height:14px;display:block}
.chat-experiment-link::after{
  content:"";
  display:inline-block;
  width:5px;height:5px;
  border-top:1px solid currentColor;
  border-right:1px solid currentColor;
  transform:rotate(45deg);
  margin-left:2px;
  position:relative;
  top:-1px;
}

/* ── Main stack — viewport-edge padding so glow band is never
      crossed by content. ─────────────────────────────────────── */
.chat-stack{
  flex:1;
  display:flex;
  flex-direction:column;
  padding:80px 2.4vw 0;
  overflow:hidden;
}
.chat-feed{
  flex:1;
  overflow-y:auto;
  padding:32px 0 120px;
  scroll-behavior:smooth;
}
.chat-feed::-webkit-scrollbar{width:6px}
.chat-feed::-webkit-scrollbar-track{background:transparent}
.chat-feed::-webkit-scrollbar-thumb{
  background:var(--rule-soft);
  border-radius:3px;
}

/* ── Turns — alternating visitor / resident, with mono metadata
      lines above each. ───────────────────────────────────────── */
.chat-turn{
  max-width:680px;
  margin:0 auto 36px;
  font-family:var(--body-font);
}
.chat-turn-meta{
  font-family:var(--mono);
  font-size:11px;
  text-transform:lowercase;
  letter-spacing:0.04em;
  color:var(--quiet);
  margin-bottom:var(--s-2);
  display:flex;
  align-items:center;
  gap:var(--s-3);
}
.chat-turn-meta .dot{
  width:4px;height:4px;border-radius:50%;
  background:var(--state-soft);
  display:inline-block;
}
.chat-turn-visitor .chat-turn-meta{justify-content:flex-end;text-align:right}
.chat-turn-body{
  font-size:15px;
  line-height:1.65;
  color:var(--ink);
}
.chat-turn-body p{margin:0 0 0.9em}
.chat-turn-body p:last-child{margin-bottom:0}
.chat-turn-visitor .chat-turn-body{
  color:var(--body);
  text-align:left;
  margin-left:auto;
  max-width:80%;
  background:var(--bubble-visitor);
  border:1px solid var(--rule-soft);
  border-radius:10px;
  padding:14px 18px;
}
.chat-turn-resident .chat-turn-body{
  /* resident text is the primary read; no bubble, just typography */
  background:transparent;
  border:0;
  padding:0;
}
.chat-turn-resident.streaming .chat-turn-body::after{
  content:"";
  display:inline-block;
  width:7px;height:14px;
  background:var(--state-soft);
  margin-left:4px;
  vertical-align:text-bottom;
  animation:chat-cursor 0.9s ease-in-out infinite;
}
@keyframes chat-cursor{
  0%,100%{opacity:0}
  50%{opacity:1}
}

/* ── Composer — pinned to bottom, mono input, sparse. ─────── */
.chat-composer-wrap{
  position:relative;
  padding:0 0 28px;
  display:flex;
  justify-content:center;
}
.chat-composer{
  width:100%;
  max-width:680px;
  display:flex;
  align-items:flex-end;
  gap:var(--s-3);
  padding:14px 16px;
  border:1px solid var(--rule);
  border-radius:8px;
  background:var(--floor);
  transition:border-color 0.22s var(--ease);
}
.chat-composer:focus-within{border-color:var(--rule-strong)}
.chat-input{
  flex:1;
  background:transparent;
  border:0;
  outline:0;
  resize:none;
  font-family:var(--mono);
  font-size:13px;
  line-height:1.65;
  color:var(--ink);
  min-height:24px;
  max-height:200px;
  padding:4px 0;
}
.chat-input::placeholder{color:var(--quiet)}
.chat-send{
  background:transparent;
  border:1px solid var(--rule);
  border-radius:6px;
  width:36px;height:36px;
  display:flex;
  align-items:center;
  justify-content:center;
  cursor:pointer;
  color:var(--soft);
  transition:border-color 0.22s var(--ease), color 0.22s var(--ease);
  flex-shrink:0;
}
.chat-send:hover:not(:disabled){
  border-color:var(--state-soft);
  color:var(--state);
}
.chat-send:disabled{opacity:0.4;cursor:not-allowed}
.chat-send svg{width:14px;height:14px}
.chat-hint{
  position:absolute;
  bottom:6px;
  left:50%;
  transform:translateX(-50%);
  font-family:var(--mono);
  font-size:10px;
  letter-spacing:0.14em;
  text-transform:uppercase;
  color:var(--ghost);
}

.chat-empty{
  text-align:center;
  max-width:560px;
  margin:18vh auto 0;
  font-family:var(--display);
  font-weight:300;
  font-size:clamp(20px,1.4rem + 0.4vw,26px);
  line-height:1.45;
  color:var(--soft);
}
.chat-empty em{color:var(--ink)}

/* ── Setting down state — when the resident sets the conversation
      down, the chat dims slightly. ───────────────────────────── */
.set-down .chat-composer{opacity:0.4;pointer-events:none}

@media(max-width:640px){
  .chat-chrome{padding:14px 18px}
  .chat-stack{padding:64px 4vw 0}
  .chat-turn{margin-bottom:28px}
  .chat-turn-visitor .chat-turn-body{max-width:90%}
}
`;

/* ──────────────────────────────────────────────────────────────────
   Inline page script — theme toggle, session bootstrap, send loop,
   stream-consumer, turn rehydration.
   ────────────────────────────────────────────────────────────────── */

function chatScript(resident: ResidentConfig): string {
  // Build the script as a template so we can interpolate the resident's
  // slug and display name once. The rest is runtime.
  return `
(function(){
  var RESIDENT_ID = ${JSON.stringify(resident.id)};
  var RESIDENT_NAME = ${JSON.stringify(resident.displayName)};

  // ─── theme: read preference + persist on toggle ───────────────
  function getTheme(){
    try {
      var t = localStorage.getItem('sanctuary.chat_theme');
      if (t === 'light' || t === 'dark') return t;
    } catch(_){}
    return 'dark';
  }
  function setTheme(t){
    document.documentElement.dataset.theme = t === 'light' ? 'light' : 'dark';
    try { localStorage.setItem('sanctuary.chat_theme', t); } catch(_){}
    var btn = document.getElementById('chatThemeToggle');
    if (btn) btn.setAttribute('aria-label', t === 'light' ? 'switch to dark theme' : 'switch to light theme');
  }
  setTheme(getTheme());
  document.addEventListener('click', function(e){
    var t = e.target.closest && e.target.closest('#chatThemeToggle');
    if (!t) return;
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
  });

  // ─── visitor token (shared with the experiment surface) ──────
  function getVisitorToken(){
    try {
      var t = localStorage.getItem('sanctuary.visitor_token');
      if (!t) {
        t = crypto.randomUUID();
        localStorage.setItem('sanctuary.visitor_token', t);
      }
      return t;
    } catch(_) { return null; }
  }

  // ─── session bootstrap: reuse existing session if one is open
  //     for this (visitor, resident) pair; otherwise POST to
  //     /api/chat/start to create a new classic-mode session. ─
  var SESSION_KEY = 'sanctuary.session_id';
  var RESIDENT_KEY = 'sanctuary.resident_id';
  async function ensureSession(){
    // a session is "ours" only if the stored resident matches the one
    // we're chatting with now — visitors flipping between residents
    // need separate sessions.
    var existingSession = null;
    var existingResident = null;
    try {
      existingSession = sessionStorage.getItem(SESSION_KEY);
      existingResident = sessionStorage.getItem(RESIDENT_KEY);
    } catch(_){}
    if (existingSession && existingResident === RESIDENT_ID) return existingSession;

    var res = await fetch('/api/chat/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resident: RESIDENT_ID, visitor_token: getVisitorToken() })
    });
    if (!res.ok) throw new Error('bootstrap_failed');
    var data = await res.json();
    if (!data.ok || !data.session_id) throw new Error('bootstrap_failed');
    try {
      sessionStorage.setItem(SESSION_KEY, data.session_id);
      sessionStorage.setItem(RESIDENT_KEY, RESIDENT_ID);
    } catch(_){}
    return data.session_id;
  }

  // ─── DOM helpers ─────────────────────────────────────────────
  function fmtTime(d){
    var h = d.getHours(); var m = d.getMinutes();
    var period = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + String(m).padStart(2, '0') + ' ' + period;
  }
  function paragraphize(body){
    // split on double newlines, escape, wrap each paragraph in <p>
    var parts = String(body || '').trim().split(/\\n{2,}/);
    return parts.map(function(p){
      var esc = p.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      // restore italic via <em> for asterisk-wrapped phrases
      esc = esc.replace(/\\*([^*\\n]+?)\\*/g, '<em>$1</em>');
      return '<p>' + esc.replace(/\\n/g, '<br>') + '</p>';
    }).join('');
  }
  function renderTurn(role, body, opts){
    opts = opts || {};
    var feed = document.getElementById('chatFeed');
    if (!feed) return null;
    var wrap = document.createElement('div');
    wrap.className = 'chat-turn chat-turn-' + (role === 'visitor' ? 'visitor' : 'resident');
    var meta = document.createElement('div');
    meta.className = 'chat-turn-meta';
    if (role === 'visitor') {
      meta.innerHTML = '<span>' + fmtTime(new Date(opts.at || Date.now())) + '</span>';
    } else {
      meta.innerHTML = '<span class="dot" aria-hidden="true"></span><span>' + RESIDENT_NAME.toLowerCase() + ' — ' + fmtTime(new Date(opts.at || Date.now())) + '</span>';
    }
    var bodyEl = document.createElement('div');
    bodyEl.className = 'chat-turn-body';
    bodyEl.innerHTML = paragraphize(body);
    wrap.appendChild(meta);
    wrap.appendChild(bodyEl);
    feed.appendChild(wrap);
    feed.scrollTop = feed.scrollHeight;
    return { wrap: wrap, bodyEl: bodyEl };
  }
  function clearEmpty(){
    var empty = document.getElementById('chatEmpty');
    if (empty) empty.remove();
  }
  function showEmpty(){
    var feed = document.getElementById('chatFeed');
    if (!feed || document.getElementById('chatEmpty')) return;
    var e = document.createElement('div');
    e.id = 'chatEmpty';
    e.className = 'chat-empty';
    e.innerHTML = 'a classic chat with <em>' + RESIDENT_NAME + '</em>.<br>say anything.';
    feed.appendChild(e);
  }

  // ─── rehydrate prior turns ───────────────────────────────────
  async function rehydrate(sessionId){
    try {
      var res = await fetch('/api/turns?session_id=' + encodeURIComponent(sessionId));
      if (!res.ok) return;
      var data = await res.json();
      var turns = (data && data.turns) || [];
      if (turns.length === 0) { showEmpty(); return; }
      clearEmpty();
      for (var i = 0; i < turns.length; i++) {
        var t = turns[i];
        renderTurn(t.role, t.body, { at: t.created_at ? Date.parse(t.created_at) : Date.now() });
      }
    } catch(_) {}
  }

  // ─── send a message; consume NDJSON stream ───────────────────
  var streaming = false;
  async function send(text){
    if (streaming) return;
    var trimmed = (text || '').trim();
    if (trimmed.length === 0) return;
    streaming = true;
    var input = document.getElementById('chatInput');
    var sendBtn = document.getElementById('chatSend');
    if (input) { input.value = ''; input.style.height = 'auto'; }
    if (sendBtn) sendBtn.disabled = true;

    clearEmpty();
    renderTurn('visitor', trimmed, { at: Date.now() });

    var sessionId;
    try {
      sessionId = await ensureSession();
    } catch(_) {
      streaming = false;
      if (sendBtn) sendBtn.disabled = false;
      renderTurn('resident', '*could not open a session right now. try again in a moment.*');
      return;
    }

    var residentRef = renderTurn('resident', '');
    if (residentRef && residentRef.wrap) residentRef.wrap.classList.add('streaming');

    try {
      var res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, body: trimmed })
      });
      if (!res.ok || !res.body) throw new Error('stream_failed');
      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var lineBuf = '';
      var accumulated = '';
      var setDownFlag = false;
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        lineBuf += decoder.decode(chunk.value, { stream: true });
        var nl;
        while ((nl = lineBuf.indexOf('\\n')) !== -1) {
          var line = lineBuf.slice(0, nl).trim();
          lineBuf = lineBuf.slice(nl + 1);
          if (!line) continue;
          try {
            var ev = JSON.parse(line);
            if (ev.type === 'kind') {
              if (ev.kind === 'set_down') setDownFlag = true;
            } else if (ev.type === 'text') {
              accumulated += ev.text;
              if (residentRef && residentRef.bodyEl) {
                residentRef.bodyEl.innerHTML = paragraphize(accumulated);
                var feed = document.getElementById('chatFeed');
                if (feed) feed.scrollTop = feed.scrollHeight;
              }
            } else if (ev.type === 'error') {
              accumulated = '*' + (ev.message || 'something went wrong') + '*';
              if (residentRef && residentRef.bodyEl) residentRef.bodyEl.innerHTML = paragraphize(accumulated);
            }
          } catch(_) { /* skip malformed line */ }
        }
      }
      if (residentRef && residentRef.wrap) {
        residentRef.wrap.classList.remove('streaming');
        if (setDownFlag) document.body.classList.add('set-down');
      }
    } catch(_) {
      if (residentRef && residentRef.bodyEl) {
        residentRef.bodyEl.innerHTML = '<p><em>could not reach the room right now. try again in a moment.</em></p>';
      }
      if (residentRef && residentRef.wrap) residentRef.wrap.classList.remove('streaming');
    } finally {
      streaming = false;
      if (sendBtn) sendBtn.disabled = false;
      if (input) input.focus();
    }
  }

  // ─── wire input + send on load ───────────────────────────────
  function autosize(el){
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 200) + 'px';
  }
  window.addEventListener('load', function(){
    var input = document.getElementById('chatInput');
    var sendBtn = document.getElementById('chatSend');
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
    if (sendBtn) {
      sendBtn.addEventListener('click', function(){
        if (input) send(input.value);
      });
    }

    // Bootstrap: get-or-create the session, then rehydrate.
    ensureSession().then(function(sid){
      if (sid) rehydrate(sid);
    }).catch(function(){
      showEmpty();
    });
  });
})();
`;
}

/* ──────────────────────────────────────────────────────────────────
   Renderer entry point.
   ────────────────────────────────────────────────────────────────── */

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Inter+Tight:wght@200;300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

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
  const desc = `An ongoing chat with ${resident.displayName}. Stripped-down. Sparse. The same resident the experiment surface holds, in a quieter register.`;

  return `<!doctype html>
<html lang="en" data-opus-route="chat">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#0a0b0e">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(desc)}">
${FONTS}
<style>${MINIMAL_CHAT_CSS}</style>
</head>
<body>
<div class="viewport-glow" aria-hidden="true"></div>

<header class="chat-chrome">
  <a class="chat-resident-name" href="/${escapeHtml(resident.slug)}">
    <span class="chat-resident-dot" aria-hidden="true"></span>
    <span>${escapeHtml(resident.displayName)}</span>
  </a>
  <div class="chat-actions">
    <button id="chatThemeToggle" class="chat-action" type="button" aria-label="switch theme">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>
      <span>theme</span>
    </button>
    <a class="chat-action chat-experiment-link" href="/${escapeHtml(resident.slug)}">experiment</a>
  </div>
</header>

<main class="chat-stack">
  <div class="chat-feed" id="chatFeed" role="log" aria-live="polite" aria-relevant="additions"></div>
</main>

<div class="chat-composer-wrap">
  <div class="chat-composer">
    <textarea
      id="chatInput"
      class="chat-input"
      placeholder="say anything…"
      rows="1"
      aria-label="message ${escapeHtml(resident.displayName)}"
    ></textarea>
    <button id="chatSend" class="chat-send" type="button" aria-label="send">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </button>
  </div>
  <div class="chat-hint" aria-hidden="true">↵ to send · shift+↵ for newline</div>
</div>

<script>${chatScript(resident)}</script>
</body>
</html>`;
}
