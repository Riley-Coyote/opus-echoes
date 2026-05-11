import { createFileRoute } from "@tanstack/react-router";
import { serveHtml } from "@/server/serve-mock";
import { renderReviewPage, checkReviewAccess } from "@/server/review-shell";

const SCRIPT = `
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function fmtDuration(start, end) {
  if (!end) return 'still open';
  const min = Math.round((new Date(end) - new Date(start)) / 60000);
  if (min < 1) return '<1 min';
  if (min < 60) return min + ' min';
  return Math.floor(min/60) + 'h ' + (min%60) + 'm';
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

let offset = 0;
const LIMIT = 20;
let total = 0;

async function load() {
  const list = document.getElementById('list');
  const more = document.getElementById('more');
  more.disabled = true;
  more.textContent = 'Loading…';
  const r = await fetch('/api/review/sessions?offset=' + offset + '&limit=' + LIMIT);
  if (!r.ok) { more.textContent = 'Error'; return; }
  const d = await r.json();
  total = d.total ?? 0;
  for (const s of d.sessions ?? []) {
    const closedBy = s.closed_by || 'open';
    const intent = escapeHtml(s.intent_preview || '(no intent recorded)');
    list.insertAdjacentHTML('beforeend',
      '<a class="session-row" href="/review/session/' + s.id + '">' +
      '<div class="row-meta">' +
        '<span>' + fmtDate(s.created_at) + '</span>' +
        '<span>· ' + fmtDuration(s.created_at, s.closed_at) + '</span>' +
        '<span>· ' + s.turn_count + ' turns</span>' +
        '<span>· closed: ' + closedBy + '</span>' +
        '<span class="resident">· ' + s.resident_id + '</span>' +
      '</div>' +
      '<div class="row-intent">' + intent + (s.intent_preview && s.intent_preview.length >= 120 ? '…' : '') + '</div>' +
      '<div class="row-stats">' +
        (s.engram_count > 0 ? '<span class="badge state">' + s.engram_count + ' engrams</span>' : '<span class="badge">no engrams</span>') +
      '</div>' +
      '</a>'
    );
  }
  offset += (d.sessions ?? []).length;
  if (offset >= total) { more.style.display = 'none'; }
  else { more.disabled = false; more.textContent = 'Load more (' + (total - offset) + ' remaining)'; }
}

document.getElementById('more').addEventListener('click', load);
load();
`;

const BODY = `
<div class="section">
  <div id="list"></div>
  <button class="load-more" id="more">Load more</button>
</div>
`;

export const Route = createFileRoute("/review")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkReviewAccess(request);
        if (gate) return gate;
        return serveHtml(
          renderReviewPage({
            title: "Session Review",
            activeTab: "sessions",
            bodyHtml: BODY,
            extraScript: SCRIPT,
          }),
        );
      },
    },
  },
});
