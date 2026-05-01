import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/conversation.html?raw";
import { serveHtml } from "@/server/serve-mock";

// Wires the composer to /api/message (streaming) and the "Set down" button to /api/set-down.
// On mount, removes the demo transcript so first-time visitors see only the continuity preamble.
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
    text.split(/\n\n+/).forEach(p => {
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
        chunk.split('\n').forEach(line => {
          line = line.trim();
          if (!line) return;
          try {
            const ev = JSON.parse(line);
            if (ev.type === 'text') {
              acc += ev.text;
              // Re-render paragraphs
              out.body.innerHTML = '';
              acc.split(/\n\n+/).forEach(p => {
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
    }
  }

  if (composer) {
    composer.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); send(); }
    });
    composer.focus();
  }
  if (sendBtn) sendBtn.addEventListener('click', send);

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
})();
`;

export const Route = createFileRoute("/conversation")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, CONVERSATION_SCRIPT),
    },
  },
});
