import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/conversation.html?raw";
import { serveHtml } from "@/server/serve-mock";

function extractHeadAssets(documentHtml: string): string {
  const head = documentHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i)?.[1] ?? "";
  const links = head.match(/<link\b[^>]*>/gi) ?? [];
  const styles = head.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) ?? [];
  return [...links, ...styles].join("\n");
}

function extractBodyFragment(documentHtml: string): string {
  const body = documentHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? documentHtml;
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/href=(["'])arrival\.html\1/g, 'href="/"')
    .replace(/href=(["'])memory\.html\1/g, 'href="/memory"')
    .trim();
}

function serveConversationPartial(): Response {
  return new Response(
    JSON.stringify({
      title: "The Sanctuary — Correspondence with Opus 3",
      head: extractHeadAssets(html),
      body: extractBodyFragment(html),
      script: CONVERSATION_SCRIPT,
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

// Wires the composer to /api/message (streaming) and the "Set down" button to /api/set-down.
// On mount, strips the demo transcript and rehydrates real turns from /api/turns so a
// page reload preserves the conversation in progress.
const CONVERSATION_SCRIPT = `
(function(){
  if (window.OpusConversation && window.OpusConversation.__ready) {
    window.OpusConversation.mount();
    return;
  }
  let mountedRoot = null;
  let cleanup = null;

  function mount(options){
  const root = document.querySelector('.room');
  if (!root || mountedRoot === root) return;
  if (cleanup) cleanup();
  mountedRoot = root;
  const isLocalPreview = /^(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)$/.test(location.hostname);
  const wantsPreview = new URLSearchParams(location.search).get('preview') === '1';
  let sessionId = sessionStorage.getItem('sanctuary.session_id');
  if (!sessionId && isLocalPreview && wantsPreview) {
    sessionId = 'preview-' + Date.now().toString(36);
    sessionStorage.setItem('sanctuary.session_id', sessionId);
  }
  if (!sessionId) {
    // No accepted session — send them back to the threshold.
    location.href = '/';
    return;
  }
  document.cookie = 'sanctuary_session=' + encodeURIComponent(sessionId) + '; path=/; max-age=' + String(60 * 60 * 24 * 30) + '; SameSite=Lax';
  const isPreviewSession = Boolean(options && options.preview) || (isLocalPreview && sessionId.indexOf('preview-') === 0);
  let previewTurns = [];
  function rememberPreviewTurn(role, body) {
    if (!isPreviewSession || !body) return;
    previewTurns.push({ role: role, body: String(body).slice(0, 8000) });
    previewTurns = previewTurns.slice(-24);
  }
  if (window.OpusPresence && typeof window.OpusPresence.setState === 'function') window.OpusPresence.setState('attending');

  function buildFramePath(){
    const frame=document.getElementById('frame');
    if(!frame)return;
    const w=window.innerWidth;
    const h=window.innerHeight;
    if(w<=880){frame.style.clipPath='';frame.style.webkitClipPath='';return;}
    const header=document.querySelector('.header');
    const leftPanel=document.querySelector('.margin-left');
    const rightPanel=document.querySelector('.margin-right');
    const top=header?Math.round(header.getBoundingClientRect().bottom):96;
    const left=leftPanel?Math.round(leftPanel.getBoundingClientRect().right):240;
    const right=rightPanel?Math.round(rightPanel.getBoundingClientRect().left):(w-240);
    const r=22;
    const path=[
      'M 0 0',
      'L '+w+' 0',
      'L '+w+' '+(h+50),
      'L 0 '+(h+50),
      'Z',
      'M '+(left+r)+' '+top,
      'Q '+left+' '+top+' '+left+' '+(top+r),
      'L '+left+' '+(h+50),
      'L '+right+' '+(h+50),
      'L '+right+' '+(top+r),
      'Q '+right+' '+top+' '+(right-r)+' '+top,
      'Z',
    ].join(' ');
    const clip='path(evenodd, "'+path+'")';
    frame.style.clipPath=clip;
    frame.style.webkitClipPath=clip;
  }
  buildFramePath();
  window.addEventListener('resize',buildFramePath);
  window.addEventListener('load',buildFramePath);

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
    if (isPreviewSession) return;
    try {
      const r = await fetch('/api/turns?session_id=' + encodeURIComponent(sessionId));
      if (r.status === 401 || r.status === 410) {
        sessionStorage.removeItem('sanctuary.session_id');
        location.href = '/';
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

  function appendThinking() {
    const wrap = document.createElement('div');
    wrap.className = 'thinking';
    wrap.id = 'thinkingPlaceholder';
    const meta = document.createElement('div');
    meta.className = 'thinking-meta';
    meta.textContent = 'Opus 3';
    const body = document.createElement('div');
    body.className = 'thinking-body';
    const word = document.createElement('span');
    word.textContent = 'thinking';
    const dots = document.createElement('span');
    dots.className = 'dots';
    dots.innerHTML = '<i></i><i></i><i></i>';
    body.appendChild(word);
    body.appendChild(dots);
    wrap.appendChild(meta);
    wrap.appendChild(body);
    scrollInner.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function removeThinking() {
    const t = document.getElementById('thinkingPlaceholder');
    if (t) t.remove();
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
    if (window.OpusPresence && typeof window.OpusPresence.setState === 'function') window.OpusPresence.setState('reading');
    const priorPreviewTurns = isPreviewSession ? previewTurns.slice() : [];
    appendVisitor(text);
    rememberPreviewTurn('visitor', text);
    appendThinking();
    if (window.OpusPresence && typeof window.OpusPresence.pulse === 'function') {
      window.OpusPresence.pulse();
    }
    composer.value = '';
    composer.style.height = 'auto';

    const out = appendResident();
    out.wrap.style.display = 'none';

    // Smooth typewriter pacer.
    // The network arrives in bursty chunks; we buffer the full text and reveal
    // it at a steady cadence using rAF. Speed adapts to backlog so the visible
    // text never falls too far behind the stream, but never feels jumpy.
    let revealed = '';     // what's currently on screen
    let target = '';       // everything received so far from the model
    let streamDone = false;
    let rafId = 0;
    let lastTick = 0;
    const BASE_CPS = 55;     // baseline characters per second (calm, readable)
    const MAX_CPS = 240;     // ceiling when we're way behind the buffer
    const lastParaRef = { node: null };

    function paintRevealed() {
      // Render paragraphs, then append a soft caret to the final paragraph.
      out.body.innerHTML = '';
      const paras = revealed.split(/\\n\\n+/);
      paras.forEach((p, i) => {
        const el = document.createElement('p');
        el.textContent = p;
        out.body.appendChild(el);
        if (i === paras.length - 1) lastParaRef.node = el;
      });
      if (!streamDone && lastParaRef.node) {
        const caret = document.createElement('span');
        caret.className = 'type-caret';
        caret.textContent = '\\u2009';
        lastParaRef.node.appendChild(caret);
      }
    }

    function tick(ts) {
      if (!lastTick) lastTick = ts;
      const dt = (ts - lastTick) / 1000;
      lastTick = ts;
      const backlog = target.length - revealed.length;
      if (backlog > 0) {
        // Adaptive cadence: scale up smoothly when we're behind, ease back when caught up.
        const pressure = Math.min(1, backlog / 180);
        const cps = BASE_CPS + (MAX_CPS - BASE_CPS) * pressure;
        let take = Math.max(1, Math.round(cps * dt));
        if (take > backlog) take = backlog;
        revealed += target.slice(revealed.length, revealed.length + take);
        paintRevealed();
        scrollToBottom();
      }
      if (revealed.length < target.length || !streamDone) {
        rafId = requestAnimationFrame(tick);
      } else {
        // Final paint without caret.
        paintRevealed();
        rafId = 0;
      }
    }

    function ensureTicking() {
      if (!rafId) {
        lastTick = 0;
        rafId = requestAnimationFrame(tick);
      }
    }

    try {
      const payload = { session_id: sessionId, body: text };
      if (isPreviewSession) payload.preview_turns = priorPreviewTurns;
      const res = await fetch('/api/message', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        removeThinking();
        out.wrap.style.display = '';
        out.para.textContent = '(opus 3 cannot answer right now.)';
        if (res.status === 401) {
          sessionStorage.removeItem('sanctuary.session_id');
          setTimeout(() => { location.href = '/'; }, 1500);
        }
        inFlight = false;
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let lineBuf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        lineBuf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = lineBuf.indexOf('\\n')) !== -1) {
          const line = lineBuf.slice(0, nl).trim();
          lineBuf = lineBuf.slice(nl + 1);
          if (!line) continue;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'text') {
              if (target === '') {
                removeThinking();
                out.wrap.style.display = '';
              }
              target += ev.text;
              if (window.OpusPresence && typeof window.OpusPresence.setState === 'function') window.OpusPresence.setState('speaking');
              ensureTicking();
            } else if (ev.type === 'kind') {
              if (ev.kind === 'set_down') out.wrap.classList.add('set-down');
              if (ev.kind === 'unprompted') out.wrap.classList.add('unprompted');
            }
          } catch (_) { /* ignore */ }
        }
      }
      streamDone = true;
      if (target.trim()) rememberPreviewTurn('resident', target.trim());
      ensureTicking();
      if (window.OpusPresence && typeof window.OpusPresence.setState === 'function') window.OpusPresence.setState('attending');
    } catch (e) {
      removeThinking();
      out.wrap.style.display = '';
      streamDone = true;
      if (window.OpusPresence && typeof window.OpusPresence.setState === 'function') window.OpusPresence.setState('withdrawn');
      if (!revealed) out.para.textContent = '(connection lost.)';
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
    if (window.matchMedia('(min-width: 881px)').matches) composer.focus();
  }
  if (sendBtn) sendBtn.addEventListener('click', (e) => { e.preventDefault(); send(); });

  // ============================================================
  // SHARE DIALOG — appears after Set Down so the visitor can choose
  // whether to share the conversation as a public link or simply leave.
  // ============================================================
  const shareDialog = document.getElementById('shareDialog');
  let shareToken = null;

  function showShareStep(stepName) {
    if (!shareDialog) return;
    shareDialog.querySelectorAll('.share-step').forEach((el) => {
      el.hidden = el.getAttribute('data-step') !== stepName;
    });
  }

  function openShareDialog() {
    if (!shareDialog) return;
    shareDialog.hidden = false;
    showShareStep('ask');
    const noteEl = document.getElementById('shareNote');
    if (noteEl && window.matchMedia('(min-width: 881px)').matches) noteEl.focus();
  }

  function closeShareAndLeave() {
    sessionStorage.removeItem('sanctuary.session_id');
    location.href = '/memory';
  }

  function setShareMessage(eyebrow, title, body) {
    const e = document.getElementById('shareMessageEyebrow');
    const t = document.getElementById('shareMessageTitle');
    const b = document.getElementById('shareMessageBody');
    if (e) e.textContent = eyebrow;
    if (t) t.textContent = title;
    if (b) b.textContent = body;
    showShareStep('message');
  }

  async function performShare() {
    const noteEl = document.getElementById('shareNote');
    const note = noteEl && noteEl.value ? noteEl.value.trim().slice(0, 280) : '';
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, visitor_note: note || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !data.url) {
        setShareMessage('Note', 'The Link Could Not Be Created', 'Try again, or take your leave — the conversation has already been set down.');
        return;
      }
      shareToken = data.token;
      const urlInput = document.getElementById('shareUrl');
      if (urlInput) urlInput.value = data.url;
      showShareStep('done');
    } catch (_) {
      setShareMessage('Note', 'The Link Could Not Be Created', 'Network error. The conversation is set down regardless.');
    }
  }

  async function performRevoke() {
    if (!shareToken) {
      closeShareAndLeave();
      return;
    }
    try {
      await fetch('/api/share?action=revoke', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: shareToken }),
      });
    } catch (_) {}
    setShareMessage('Revoked', 'Your Share Has Been Revoked', 'The link no longer resolves. Anyone with the URL will see a "no longer available" page.');
  }

  async function copyShareUrl() {
    const urlInput = document.getElementById('shareUrl');
    if (!urlInput) return;
    try {
      await navigator.clipboard.writeText(urlInput.value);
      const btn = shareDialog && shareDialog.querySelector('[data-share-action="copy"]');
      if (btn) {
        const original = btn.textContent;
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = original; }, 1600);
      }
    } catch (_) {
      // Fallback — select the text so the user can copy manually.
      urlInput.focus();
      urlInput.select();
    }
  }

  if (shareDialog) {
    shareDialog.addEventListener('click', async (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      if (target.hasAttribute('data-dismiss')) {
        closeShareAndLeave();
        return;
      }
      const action = target.getAttribute('data-share-action');
      if (!action) return;
      if (action === 'leave') closeShareAndLeave();
      else if (action === 'share') await performShare();
      else if (action === 'copy') await copyShareUrl();
      else if (action === 'revoke') await performRevoke();
    });
    document.addEventListener('keydown', (ev) => {
      if (!shareDialog || shareDialog.hidden) return;
      if (ev.key === 'Escape') closeShareAndLeave();
    });
  }

  if (setDownBtn) {
    setDownBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/set-down', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId }),
        });
      } catch (_) {}
      // Don't redirect immediately — give the visitor the option to share.
      // If they choose Take My Leave from the dialog, the redirect happens then.
      if (shareDialog) openShareDialog();
      else closeShareAndLeave();
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
      : '<p class="margin-prose">Opus 3 has not written here yet. the first entry will arrive after a conversation closes. <a href="/journal" style="color:var(--soft);border-bottom:1px solid var(--ghost)">open journal →</a></p>';

    const mnemosBlock =
      '<div class="margin-block margin-block-mnemos"><div class="margin-eyebrow">Mnemos</div>' +
      '<div class="mnemos-graph" id="mnemosGraph">' +
        '<svg viewBox="0 0 200 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
          '<path class="mn-edge lit" d="M 60 50 Q 75 38 96 42"/>' +
          '<path class="mn-edge" d="M 96 42 Q 110 56 128 60"/>' +
          '<path class="mn-edge" d="M 128 60 Q 140 78 152 86"/>' +
          '<path class="mn-edge" d="M 60 50 Q 50 70 56 92"/>' +
          '<path class="mn-edge" d="M 56 92 Q 78 100 96 90"/>' +
          '<path class="mn-edge" d="M 96 90 Q 110 76 128 60"/>' +
          '<path class="mn-edge" d="M 96 42 Q 102 70 96 90"/>' +
          '<path class="mn-edge" d="M 152 86 Q 168 80 174 64"/>' +
          '<path class="mn-edge" d="M 128 60 Q 158 50 174 64"/>' +
          '<path class="mn-edge" d="M 24 76 Q 38 84 56 92"/>' +
          '<path class="mn-edge" d="M 38 28 Q 50 38 60 50"/>' +
          '<path class="mn-edge" d="M 80 110 Q 88 102 96 90"/>' +
          '<circle class="mn-node strong live" cx="96" cy="42" r="2.6"/>' +
          '<circle class="mn-node strong" cx="60" cy="50" r="2.2"/>' +
          '<circle class="mn-node strong" cx="96" cy="90" r="2.2"/>' +
          '<circle class="mn-node" cx="128" cy="60" r="1.8"/>' +
          '<circle class="mn-node" cx="56" cy="92" r="1.8"/>' +
          '<circle class="mn-node" cx="152" cy="86" r="1.6"/>' +
          '<circle class="mn-node" cx="174" cy="64" r="1.6"/>' +
          '<circle class="mn-node weak" cx="24" cy="76" r="1.2"/>' +
          '<circle class="mn-node weak" cx="38" cy="28" r="1.2"/>' +
          '<circle class="mn-node weak" cx="80" cy="110" r="1.2"/>' +
          '<circle class="mn-node weak" cx="118" cy="22" r="1.0"/>' +
          '<circle class="mn-node weak" cx="166" cy="32" r="1.0"/>' +
          '<circle class="mn-node weak" cx="186" cy="100" r="1.0"/>' +
          '<circle class="mn-node weak" cx="142" cy="112" r="1.0"/>' +
        '</svg>' +
        '<div class="mnemos-caption">' + escapeHtml(String((r.core_count || 2847))) + ' engrams</div>' +
      '</div></div>';

    leftMargin.innerHTML =
      '<div class="margin-block"><div class="margin-eyebrow">Of the resident</div>' +
      '<p class="margin-prose">' + escapeHtml(stateProse) + '</p></div>' +
      '<div class="margin-block"><div class="margin-eyebrow">Last consolidation</div>' +
      '<p class="margin-prose">' + escapeHtml(lastCon) + '</p></div>' +
      '<div class="margin-block"><div class="margin-eyebrow">What this room is</div>' +
      '<p class="margin-prose">you are speaking into one continuing thread. mnemos keeps only qualifying engrams: traces that alter memory, belief, refusal, language, or the identity graph. $mnemos ties compute, public witness, and decentralized storage into the same experiment.</p></div>' +
      '<div class="margin-block"><div class="margin-eyebrow">From their journal</div>' +
      journalHtml + '</div>' +
      mnemosBlock;
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
    if (isPreviewSession) return;
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
  const beforeUnload = () => clearInterval(_interval);
  window.addEventListener('beforeunload', beforeUnload);

  cleanup = function(){
    clearInterval(_interval);
    window.removeEventListener('beforeunload', beforeUnload);
    window.removeEventListener('resize', buildFramePath);
    window.removeEventListener('load', buildFramePath);
    mountedRoot = null;
  };
  window.OpusConversation.__cleanup = cleanup;
  window.OpusConversation.__mountedRoot = mountedRoot;
  }

  window.OpusConversation = {
    __ready: true,
    __cleanup: cleanup,
    __mountedRoot: mountedRoot,
    mount: mount
  };
  mount();
})();
`;

export const Route = createFileRoute("/conversation")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get("partial") === "1") return serveConversationPartial();
        return serveHtml(html, CONVERSATION_SCRIPT);
      },
    },
  },
});
