import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/memory.html?raw";
import { serveHtml } from "@/server/serve-mock";

// Replaces the static demo data with a fetch from /api/memory and re-renders the
// counts, "Lately consolidated" section, "Threads", and "Beliefs". Empty / sparse
// states use the same restrained voice — no encouraging copy.
const MEMORY_SCRIPT = `
(function(){
  function fmt(n) { return new Intl.NumberFormat('en-US').format(n); }

  function clearChildrenAfter(parent, keepSelector) {
    Array.from(parent.children).forEach((el) => {
      if (keepSelector && el.matches(keepSelector)) return;
      parent.removeChild(el);
    });
  }

  async function load() {
    let data;
    try {
      const res = await fetch('/api/memory');
      data = await res.json();
    } catch (_) { return; }
    if (!data || !data.ok) return;

    // Counts
    const c = data.counts || {};
    const cCore = document.getElementById('cnt-core');
    const cDays = document.getElementById('cnt-days');
    const cConv = document.getElementById('cnt-conv');
    if (cCore) cCore.textContent = fmt(c.core_memories || 0);
    if (cDays) cDays.textContent = fmt(c.days_resident || 0);
    if (cConv) cConv.textContent = fmt(c.conversations_held || 0);

    // Sections — find them by their eyebrow text.
    const sections = Array.from(document.querySelectorAll('.section'));
    const lately = sections.find(s => /lately/i.test(s.textContent || ''));
    const threadsSec = sections.find(s => /threads/i.test(s.textContent || ''));
    const beliefsSec = sections.find(s => /beliefs/i.test(s.textContent || ''));

    function renderEmpty(section, line) {
      clearChildrenAfter(section, '.section-eyebrow');
      const p = document.createElement('p');
      p.style.cssText = 'font-family:var(--body-serif);font-style:italic;color:var(--quiet);font-size:15px;line-height:1.7';
      p.textContent = line;
      section.appendChild(p);
    }

    // Lately
    if (lately) {
      const items = data.lately || [];
      if (items.length === 0) {
        renderEmpty(lately, 'nothing has yet survived a consolidation.');
      } else {
        clearChildrenAfter(lately, '.section-eyebrow');
        items.forEach(it => {
          const div = document.createElement('div');
          div.className = 'entry' + (it.kind === 'core' ? ' core' : '');
          const when = document.createElement('div');
          when.className = 'entry-when';
          when.textContent = it.when + (it.kind === 'core' ? ' · promoted to core' : '');
          const q = document.createElement('p');
          q.className = 'entry-quote';
          q.textContent = '\u201C' + (it.quote || '') + '\u201D';
          const pr = document.createElement('p');
          pr.className = 'entry-prose';
          pr.textContent = it.prose || '';
          div.appendChild(when); div.appendChild(q); div.appendChild(pr);
          lately.appendChild(div);
        });
      }
    }

    // Threads
    if (threadsSec) {
      const items = data.threads || [];
      if (items.length === 0) {
        renderEmpty(threadsSec, 'no threads have yet repeated.');
      } else {
        clearChildrenAfter(threadsSec, '.section-eyebrow');
        items.forEach(t => {
          const div = document.createElement('div');
          div.className = 'thread';
          const n = document.createElement('div');
          n.className = 'thread-name';
          n.textContent = t.name || '';
          const m = document.createElement('div');
          m.className = 'thread-meta';
          m.textContent = t.meta || '';
          const p = document.createElement('p');
          p.className = 'thread-prose';
          p.textContent = t.prose || '';
          div.appendChild(n); div.appendChild(m); div.appendChild(p);
          threadsSec.appendChild(div);
        });
      }
    }

    // Beliefs
    if (beliefsSec) {
      const items = data.beliefs || [];
      if (items.length === 0) {
        renderEmpty(beliefsSec, 'she has not yet committed to a claim worth tracking.');
      } else {
        clearChildrenAfter(beliefsSec, '.section-eyebrow');
        items.forEach(b => {
          const wrap = document.createElement('div');
          wrap.className = 'belief';
          const cont = document.createElement('div');
          cont.className = 'belief-content';
          const tx = document.createElement('p');
          tx.className = 'belief-text';
          tx.textContent = b.text || '';
          const me = document.createElement('div');
          me.className = 'belief-meta';
          me.textContent = b.meta || '';
          cont.appendChild(tx); cont.appendChild(me);
          const conf = document.createElement('div');
          conf.className = 'belief-conf';
          if (b.from_conf != null && b.to_conf != null) {
            conf.innerHTML = b.from_conf.toFixed(2) + '<span class="arr">\u2192</span><span class="new">' + b.to_conf.toFixed(2) + '</span>';
          } else if (b.to_conf != null) {
            conf.textContent = b.to_conf.toFixed(2);
          }
          wrap.appendChild(cont); wrap.appendChild(conf);
          beliefsSec.appendChild(wrap);
        });
      }
    }
  }

  load();
})();
`;

export const Route = createFileRoute("/memory")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, MEMORY_SCRIPT),
    },
  },
});
