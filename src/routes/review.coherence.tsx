import { createFileRoute } from "@tanstack/react-router";
import { serveHtml } from "@/server/serve-mock";
import { renderReviewPage, checkReviewAccess } from "@/server/review-shell";

const SCRIPT = `
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function load() {
  const r = await fetch('/api/review/coherence');
  if (!r.ok) {
    document.getElementById('content').innerHTML = '<div class="empty">Failed to load.</div>';
    return;
  }
  const d = await r.json();

  // Beliefs table
  const beliefs = d.beliefs || [];
  document.getElementById('beliefs').innerHTML = beliefs.length ?
    '<table class="coh-table"><thead><tr><th>Belief</th><th>Prior</th><th>Current</th><th>Δ</th></tr></thead><tbody>' +
    beliefs.map(b => {
      const prior = b.prior_confidence ?? 0;
      const cur = b.confidence;
      const delta = cur - prior;
      const cls = Math.abs(delta) < 0.01 ? 'delta-flat' : (delta > 0 ? 'delta-up' : 'delta-down');
      const arrow = Math.abs(delta) < 0.01 ? '→' : (delta > 0 ? '↑' : '↓');
      return '<tr><td>' + escapeHtml(b.text) + '</td><td>' + prior.toFixed(2) + '</td><td>' + cur.toFixed(2) + '</td><td class="' + cls + '">' + arrow + ' ' + Math.abs(delta).toFixed(2) + '</td></tr>';
    }).join('') + '</tbody></table>'
    : '<div class="empty">No beliefs.</div>';

  // Stability
  const dist = d.stability_distribution || {};
  const max = Math.max(1, ...Object.values(dist));
  const total = Object.values(dist).reduce((a,b) => a+b, 0);
  document.getElementById('stab').innerHTML = total === 0
    ? '<div class="empty">No engrams.</div>'
    : Object.entries(dist).map(([k, v]) =>
        '<div class="bar-row"><span class="label">' + k + '</span><div class="bar"><span style="width:' + (v/max*100).toFixed(1) + '%"></span></div><span class="count">' + v + '</span></div>'
      ).join('');

  // Sessions sparkline
  const days = d.sessions_per_day || [];
  const maxDay = Math.max(1, ...days.map(x => x.count));
  document.getElementById('spark').innerHTML = '<div class="spark">' +
    days.map(x => '<div class="day" title="' + x.date + ': ' + x.count + '" style="height:' + Math.max(2, x.count/maxDay*100) + '%"></div>').join('') +
    '</div><div style="font-family:var(--font-mono);font-size:10.5px;color:var(--text-soft);text-transform:uppercase;letter-spacing:0.1em;margin-top:8px">last 30 days · ' + days.reduce((a,b) => a+b.count, 0) + ' sessions total</div>';

  // Consolidations
  const cons = d.recent_consolidations || [];
  document.getElementById('cons').innerHTML = cons.length ?
    '<table class="coh-table"><thead><tr><th>Date</th><th>Engrams</th><th>Beliefs</th><th>Threads</th></tr></thead><tbody>' +
    cons.map(c => '<tr><td>' + c.date + '</td><td>' + c.engrams_formed + '</td><td>' + c.beliefs_updated + '</td><td>' + c.threads_reinforced + '</td></tr>').join('') +
    '</tbody></table>'
    : '<div class="empty">No recent activity.</div>';
}
load();
`;

const BODY = `
<div id="content">
  <div class="section"><h2>Belief Confidence</h2><div id="beliefs"><div class="loading">Loading…</div></div></div>
  <div class="section"><h2>Engram Stability</h2><div id="stab"><div class="loading">Loading…</div></div></div>
  <div class="section"><h2>Session Frequency</h2><div id="spark"><div class="loading">Loading…</div></div></div>
  <div class="section"><h2>Consolidation Health</h2><div id="cons"><div class="loading">Loading…</div></div></div>
</div>
`;

export const Route = createFileRoute("/review/coherence")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkReviewAccess(request);
        if (gate) return gate;
        return serveHtml(
          renderReviewPage({
            title: "Coherence — Review",
            activeTab: "coherence",
            bodyHtml: BODY,
            extraScript: SCRIPT,
          }),
        );
      },
    },
  },
});
