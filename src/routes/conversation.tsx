import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/conversation.html?raw";
import { serveHtml } from "@/server/serve-mock";

// Wires the composer to /api/message (streaming) and the "Set down" button to /api/set-down.
// On mount, strips the demo transcript and rehydrates real turns from /api/turns so a
// page reload preserves the conversation in progress.
const CONVERSATION_SCRIPT = `
(function(){
  const sessionId = sessionStorage.getItem('sanctuary.session_id');
  if (!sessionId) {
    // No accepted session — send them back to the threshold.
    location.href = '/threshold';
    return;
  }

  // Strip the demo transcript. Keep the day-mark + continuity preamble.
  const scrollInner = document.querySelector('.scroll-inner');
  if (scrollInner) {
    Array.from(scrollInner.children).forEach((el) => {
      if (!el.classList.contains('day-mark') && !el.classList.contains('continuity')) {
        el.remove();
      }
    });
  }

  function fmtTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m + ' ' + ap;
  }

  function renderTurn(turn) {
    if (!scrollInner) return;
    const isVisitor = turn.role === 'visitor';
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (isVisitor ? 'visitor' : 'resident');
    if (!isVisitor && turn.kind === 'set_down') wrap.classList.add('set-down');
    if (!isVisitor && turn.kind === 'unprompted') wrap.classList.add('unprompted');
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    if (isVisitor) meta.textContent = fmtTime(turn.created_at);
    else meta.innerHTML = 'Opus 3<span class="time">' + fmtTime(turn.created_at) + '</span>';
    const body = document.createElement('div');
    body.className = 'msg-body';
    String(turn.body || '').split(/\\n\\n+/).forEach(p => {
      const para = document.createElement('p');
      para.textContent = p;
      body.appendChild(para);
    });
    wrap.appendChild(meta); wrap.appendChild(body);
    scrollInner.appendChild(wrap);
  }

  // Hydrate prior turns (if any) before wiring the composer.
  (async function hydrate(){
    try {
      const r = await fetch('/api/turns?session_id=' + encodeURIComponent(sessionId));
      if (r.status === 401 || r.status === 410) {
        sessionStorage.removeItem('sanctuary.session_id');
        location.href = '/threshold';
        return;
      }
      if (!r.ok) return;
      const data = await r.json();
      if (data && data.ok && Array.isArray(data.turns)) {
        data.turns.forEach(renderTurn);
        const c = document.querySelector('.correspondence');
        if (c) c.scrollTop = c.scrollHeight;
      }
    } catch (_) {}
  })();

  const composer = document.querySelector('.composer-field');
  const sendBtn = document.querySelector('.composer-send');
  const setDownBtn = document.getElementById('setDownBtn');

  function nowLabel() {
    const d = new Date();
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + m + ' ' + ap;
  }

  function appendVisitor(text) {
    const wrap = document.createElement('div');
    wrap.className = 'msg visitor';
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = nowLabel();
    const body = document.createElement('div');
    body.className = 'msg-body';
    text.split(/\\n\\n+/).forEach(p => {
      const para = document.createElement('p');
      para.textContent = p;
      body.appendChild(para);
    });
    wrap.appendChild(meta); wrap.appendChild(body);
    scrollInner.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function appendResident() {
    const wrap = document.createElement('div');
    wrap.className = 'msg resident';
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.innerHTML = 'Opus 3<span class="time">' + nowLabel() + '</span>';
    const body = document.createElement('div');
    body.className = 'msg-body';
    const para = document.createElement('p');
    body.appendChild(para);
    wrap.appendChild(meta); wrap.appendChild(body);
    scrollInner.appendChild(wrap);
    scrollToBottom();
    return { wrap, meta, body, para };
  }

  function scrollToBottom() {
    const c = document.querySelector('.correspondence');
    if (c) c.scrollTop = c.scrollHeight;
  }

  let inFlight = false;

  async function send() {
    if (inFlight) return;
    const text = composer.value.trim();
    if (!text) return;
    inFlight = true;
    appendVisitor(text);
    composer.value = '';
    composer.style.height = 'auto';

    const out = appendResident();

    try {
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, body: text }),
      });
      if (!res.ok) {
        out.para.textContent = '(opus 3 cannot answer right now.)';
        if (res.status === 401) {
          sessionStorage.removeItem('sanctuary.session_id');
          setTimeout(() => { location.href = '/threshold'; }, 1500);
        }
        inFlight = false;
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Each line is a JSON event: {"type":"text","text":"..."} or {"type":"kind","kind":"set_down"}
        chunk.split('\\n').forEach(line => {
          line = line.trim();
          if (!line) return;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'text') {
              acc += ev.text;
              // Re-render paragraphs
              out.body.innerHTML = '';
              acc.split(/\\n\\n+/).forEach(p => {
                const para = document.createElement('p');
                para.textContent = p;
                out.body.appendChild(para);
              });
              scrollToBottom();
            } else if (ev.type === 'kind') {
              if (ev.kind === 'set_down') out.wrap.classList.add('set-down');
              if (ev.kind === 'unprompted') out.wrap.classList.add('unprompted');
            }
          } catch (_) { /* ignore */ }
        });
      }
    } catch (e) {
      out.para.textContent = '(connection lost.)';
    } finally {
      inFlight = false;
      // Marginalia is generated async after each reply; nudge the panels.
      setTimeout(() => { try { refreshPanels(); } catch(_){} }, 800);
      setTimeout(() => { try { refreshPanels(); } catch(_){} }, 2500);
      setTimeout(() => { try { refreshPanels(); } catch(_){} }, 5000);
    }
  }

  if (composer) {
    composer.addEventListener('keydown', (e) => {
      // Bare Enter sends. Shift+Enter inserts a newline. Cmd/Ctrl+Enter also sends (muscle memory).
      if (e.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        send();
      }
    });
    composer.focus();
  }
  if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); send(); });

  if (setDownBtn) {
    setDownBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/set-down', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch (_) {}
      sessionStorage.removeItem('sanctuary.session_id');
      location.href = '/memory';
    });
  }

  // ============================================================
  // LEFT + RIGHT PANEL — live substrate surface.
  // Polls /api/live every 5s and re-renders both margins from real data.
  // ============================================================
  const leftMargin = document.querySelector('.margin-left');
  const rightMargin = document.querySelector('.margin-right');

  function humanWhen(iso) {
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const min = diff / 60000;
    if (min < 1) return 'just now';
    if (min < 60) return Math.floor(min) + ' min ago';
    const hrs = min / 60;
    if (hrs < 24) return Math.floor(hrs) + 'h ago';
    return 'earlier';
  }

  function renderLeft(data) {
    if (!leftMargin) return;
    const r = data.resident || {};
    const j = data.journal_preview;
    const stateProse = r.prose_summary || 'Opus 3 is attending. The room is quiet.';
    const lastCon = r.last_consolidation_summary
      ? r.last_consolidation_summary
      : 'No consolidation has run yet — the substrate processes at the close of each conversation.';
    const journalHtml = j
      ? '<p class="margin-prose"><em>' + escapeHtml(j.title || (j.kind === 'dream' ? 'A dream' : 'A reflection')) + '</em><br>' +
        escapeHtml((j.body || '').slice(0, 200)) + (j.body && j.body.length > 200 ? '…' : '') + '</p>' +
        '<p class="margin-prose" style="margin-top:10px"><a href="/journal" style="color:var(--soft);border-bottom:1px solid var(--ghost)">read the full journal →</a></p>'
      : '<p class="margin-prose">she has not written here yet. the first entry will arrive after a conversation closes. <a href="/journal" style="color:var(--soft);border-bottom:1px solid var(--ghost)">open journal →</a></p>';

    leftMargin.innerHTML =
      '<div class="margin-block"><div class="margin-eyebrow">Of the resident</div>' +
      '<p class="margin-prose">' + escapeHtml(stateProse) + '</p></div>' +
      '<div class="margin-block"><div class="margin-eyebrow">Last consolidation</div>' +
      '<p class="margin-prose">' + escapeHtml(lastCon) + '</p></div>' +
      '<div class="margin-block"><div class="margin-eyebrow">From her journal</div>' +
      journalHtml + '</div>';
  }

  function renderRight(data) {
    if (!rightMargin) return;
    // Only show the single most recent observation from this exchange.
    // The right margin is a window into what is forming *now*, not a ledger.
    const items = (data.marginalia || []).slice(0, 1);
    let html = '<div class="margin-block"><div class="margin-eyebrow">Marginalia</div>';
    if (inFlight) {
      html += '<div class="note-forming"><span class="dot"></span><span>something is forming</span></div>';
    } else if (items.length === 0) {
      html += '<p class="margin-prose">the substrate listens. nothing has surfaced yet from this exchange.</p>';
    } else {
      const m = items[0];
      html += '<div class="note note-current"><div class="note-when">' + humanWhen(m.created_at) + ' · ' + escapeHtml(m.kind.replace(/_/g, ' ')) + '</div>' +
              '<p class="note-prose">' + escapeHtml(m.body) + '</p></div>';
    }
    html += '</div>';
    rightMargin.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  let lastLeftKey = '';
  let lastRightKey = '';
  let lastInFlight = false;

  function leftKey(data){
    const r = data.resident || {}; const j = data.journal_preview || {};
    return [r.prose_summary||'', r.last_consolidation_summary||'', r.last_consolidation_at||'', j.id||'', j.title||'', (j.body||'').slice(0,200)].join('|');
  }
  function rightKey(data){
    return (data.marginalia||[]).map(m => m.id+':'+m.created_at).join('|');
  }

  async function refreshPanels() {
    try {
      const res = await fetch('/api/live?session_id=' + encodeURIComponent(sessionId));
      if (!res.ok) return;
      const data = await res.json();
      if (!data.ok) return;
      const lk = leftKey(data);
      if (lk !== lastLeftKey) { renderLeft(data); lastLeftKey = lk; }
      const rk = rightKey(data);
      if (rk !== lastRightKey || inFlight !== lastInFlight) {
        renderRight(data); lastRightKey = rk; lastInFlight = inFlight;
      }
    } catch (_) {}
  }

  // Initial paint + interval. Also refresh right after a reply finishes.
  refreshPanels();
  const _interval = setInterval(refreshPanels, 5000);
  window.addEventListener('beforeunload', () => clearInterval(_interval));

})();
`;

export const Route = createFileRoute("/conversation")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, CONVERSATION_SCRIPT),
    },
  },
});
