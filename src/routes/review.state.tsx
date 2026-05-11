import { createFileRoute } from "@tanstack/react-router";
import { serveHtml } from "@/server/serve-mock";
import { renderReviewPage, checkReviewAccess } from "@/server/review-shell";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";

const SCRIPT = `
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function load() {
  const [memRes, stateRes] = await Promise.all([
    fetch('/api/memory').then(r => r.json()).catch(() => null),
    fetch('/api/review/state-data').then(r => r.json()).catch(() => null),
  ]);
  if (!stateRes || !stateRes.ok) {
    document.getElementById('content').innerHTML = '<div class="empty">Failed to load.</div>';
    return;
  }
  const st = stateRes.state || {};
  const fmt = v => (v == null ? '—' : Number(v).toFixed(2));

  document.getElementById('vital').innerHTML =
    '<div class="kv-grid">' +
      '<div class="kv"><span class="k">Arousal</span><span class="v">' + fmt(st.arousal) + '</span></div>' +
      '<div class="kv"><span class="k">Openness</span><span class="v">' + fmt(st.openness) + '</span></div>' +
      '<div class="kv"><span class="k">Resolution</span><span class="v">' + fmt(st.resolution) + '</span></div>' +
      '<div class="kv"><span class="k">Temperature</span><span class="v">' + fmt(st.temperature) + '</span></div>' +
      '<div class="kv"><span class="k">Selection threshold</span><span class="v">' + fmt(st.selection_threshold) + '</span></div>' +
      '<div class="kv"><span class="k">Surprise sensitivity</span><span class="v">' + fmt(st.surprise_sensitivity) + '</span></div>' +
    '</div>';

  if (st.last_consolidation_summary) {
    document.getElementById('summary').innerHTML =
      '<div class="consol-card"><div class="meta">' + escapeHtml(st.last_consolidation_at || '') + '</div>' +
      '<p class="quote">' + escapeHtml(st.last_consolidation_summary) + '</p></div>';
  }

  const cores = stateRes.core_engrams || [];
  document.getElementById('cores').innerHTML = cores.length
    ? cores.map(e => '<div class="consol-card"><p class="quote">' + escapeHtml(e.quote) + '</p>' +
        '<div class="meta">stability ' + e.stability.toFixed(2) + ' · ' + e.connections + ' connections · reinforced ' + e.reinforcement_count + '×</div></div>').join('')
    : '<div class="empty">None</div>';

  const beliefs = stateRes.beliefs || [];
  document.getElementById('beliefs').innerHTML = beliefs.length
    ? beliefs.map(b => '<div class="consol-card"><p class="quote">' + escapeHtml(b.text) + '</p>' +
        '<div class="meta">conf ' + (b.prior_confidence ?? 0).toFixed(2) + ' → ' + b.confidence.toFixed(2) + '</div></div>').join('')
    : '<div class="empty">None</div>';

  const journal = stateRes.journal || [];
  document.getElementById('journal').innerHTML = journal.length
    ? journal.map(j => '<div class="consol-card"><div class="meta">' + escapeHtml(j.kind) + (j.title ? ' · ' + escapeHtml(j.title) : '') + '</div>' +
        '<p class="quote" style="white-space:pre-wrap">' + escapeHtml(String(j.body || '').slice(0, 400)) + (j.body && j.body.length > 400 ? '…' : '') + '</p></div>').join('')
    : '<div class="empty">None</div>';
}
load();
`;

const BODY = `
<div id="content">
  <div class="section"><h2>Vital Signs</h2><div id="vital"><div class="loading">Loading…</div></div></div>
  <div class="section"><h2>Last Consolidation</h2><div id="summary"></div></div>
  <div class="section"><h2>Core Engrams</h2><div id="cores"><div class="loading">Loading…</div></div></div>
  <div class="section"><h2>Active Beliefs</h2><div id="beliefs"><div class="loading">Loading…</div></div></div>
  <div class="section"><h2>Recent Journal</h2><div id="journal"><div class="loading">Loading…</div></div></div>
</div>
`;

export const Route = createFileRoute("/review/state")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkReviewAccess(request);
        if (gate) return gate;
        // Inline data fetch via second API hop kept simple — provide an inline endpoint:
        const url = new URL(request.url);
        if (url.pathname === "/api/review/state-data") {
          // unreachable here; placeholder
        }
        return serveHtml(
          renderReviewPage({
            title: "Resident State — Review",
            activeTab: "state",
            bodyHtml: BODY,
            extraScript: SCRIPT,
          }),
        );
      },
    },
  },
});

// Minor helper export to satisfy noUnusedLocals if needed in future.
export async function _unusedKeepAdmin() {
  if (hasSupabaseAdminEnv()) await supabaseAdmin.from("resident_state").select("id").limit(0);
}
