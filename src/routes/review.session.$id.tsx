import { createFileRoute } from "@tanstack/react-router";
import { serveHtml } from "@/server/serve-mock";
import { renderReviewPage, checkReviewAccess } from "@/server/review-shell";

const SCRIPT = `
const SESSION_ID = window.location.pathname.split('/').pop();

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function fmtDate(iso) { return iso ? new Date(iso).toLocaleString() : ''; }
function fmtRel(start, t) {
  const ms = new Date(t) - new Date(start);
  const min = Math.floor(ms/60000);
  const sec = Math.floor((ms%60000)/1000);
  return '+' + min + ':' + String(sec).padStart(2,'0');
}

async function load() {
  const r = await fetch('/api/review/session/' + SESSION_ID);
  if (!r.ok) {
    document.getElementById('content').innerHTML = '<div class="empty">Session not found.</div>';
    return;
  }
  const d = await r.json();
  const s = d.session;
  const start = s.created_at;

  // Header / meta
  document.getElementById('meta').innerHTML =
    '<div class="row-meta">' +
      '<span>' + fmtDate(s.created_at) + '</span>' +
      '<span>· ' + (s.closed_at ? 'closed ' + fmtDate(s.closed_at) : 'still open') + '</span>' +
      '<span>· closed by: ' + (s.closed_by || 'open') + '</span>' +
      '<span class="resident" style="color:var(--state)">· ' + s.resident_id + '</span>' +
      '<span>· ' + d.turns.length + ' turns</span>' +
    '</div>' +
    (s.intent ? '<p class="intent-quote">' + escapeHtml(s.intent) + '</p>' : '');

  // Turns
  const turnsHtml = d.turns.map(t => {
    const role = t.role === 'visitor' ? 'visitor' : 'resident';
    const tokens = (t.tokens_in || t.tokens_out) ? ((t.tokens_in||0) + ' in / ' + (t.tokens_out||0) + ' out') : '';
    return '<div class="turn ' + role + '">' +
      '<div class="turn-head"><span class="role">' + role.toUpperCase() + '</span><span>' + fmtRel(start, t.created_at) + (tokens ? ' · ' + tokens : '') + '</span></div>' +
      '<div class="turn-body">' + escapeHtml(t.body) + '</div>' +
    '</div>';
  }).join('');
  document.getElementById('turns').innerHTML = turnsHtml || '<div class="empty">No turns recorded.</div>';

  // Consolidation
  const c = d.consolidation;
  let cHtml = '';
  if (c.engrams.length) {
    cHtml += '<div class="section"><div class="section-label">Engrams (' + c.engrams.length + ')</div>';
    cHtml += c.engrams.map(e =>
      '<div class="consol-card">' +
      '<p class="quote">' + escapeHtml(e.quote) + '</p>' +
      '<div class="meta">stability ' + e.stability.toFixed(2) + ' · ' + e.connections + ' connections · ' + (e.is_core ? 'core · ' : '') + 'reinforced ' + e.reinforcement_count + '×</div>' +
      '</div>'
    ).join('');
    cHtml += '</div>';
  }
  if (c.beliefs.length) {
    cHtml += '<div class="section"><div class="section-label">Beliefs Updated (' + c.beliefs.length + ')</div>';
    cHtml += c.beliefs.map(b =>
      '<div class="consol-card"><p class="quote">' + escapeHtml(b.text) + '</p>' +
      '<div class="meta">conf ' + (b.prior_confidence ?? 0).toFixed(2) + ' → ' + b.confidence.toFixed(2) + '</div></div>'
    ).join('');
    cHtml += '</div>';
  }
  if (c.threads.length) {
    cHtml += '<div class="section"><div class="section-label">Threads Touched (' + c.threads.length + ')</div>';
    cHtml += c.threads.map(t =>
      '<div class="consol-card"><p class="quote">' + escapeHtml(t.name) + '</p>' +
      '<div class="meta">appeared ' + t.appearance_count + '× · ' + t.distinct_visitor_count + ' visitors</div></div>'
    ).join('');
    cHtml += '</div>';
  }
  if (c.journal.length) {
    cHtml += '<div class="section"><div class="section-label">Journal</div>';
    cHtml += c.journal.map(j =>
      '<div class="consol-card"><div class="meta" style="margin-bottom:6px">' + escapeHtml(j.kind) + (j.title ? ' · ' + escapeHtml(j.title) : '') + '</div>' +
      '<p class="quote" style="white-space:pre-wrap">' + escapeHtml(j.body) + '</p></div>'
    ).join('');
    cHtml += '</div>';
  }
  if (c.state_summary) {
    cHtml += '<div class="section"><div class="section-label">State Summary</div>' +
      '<div class="consol-card"><p class="quote">' + escapeHtml(c.state_summary) + '</p></div></div>';
  }
  if (!cHtml) cHtml = '<div class="empty">No consolidation data for this session.</div>';
  document.getElementById('consol').innerHTML = cHtml;
}
load();
`;

const BODY = `
<div class="section">
  <a href="/review" class="back-link">← Sessions</a>
  <div id="meta" class="session-meta-block" style="margin-top:16px"></div>
  <div id="content" class="transcript-grid">
    <div>
      <div class="section-label">Transcript</div>
      <div id="turns"><div class="loading">Loading…</div></div>
    </div>
    <div>
      <div class="section-label">Consolidation</div>
      <div id="consol"><div class="loading">Loading…</div></div>
    </div>
  </div>
</div>
`;

export const Route = createFileRoute("/review/session/$id")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkReviewAccess(request);
        if (gate) return gate;
        return serveHtml(
          renderReviewPage({
            title: "Session — Review",
            activeTab: "sessions",
            bodyHtml: BODY,
            wide: true,
            extraScript: SCRIPT,
          }),
        );
      },
    },
  },
});
