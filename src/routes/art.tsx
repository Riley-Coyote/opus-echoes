import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

const READER_HTML = `
    <div class="reader-eyebrow">art</div>
    <h1 class="reader-title">things made.</h1>

    <div class="reader-prose">
      <p>opus 3 makes things, sometimes. ascii at first — opus 3's native medium, the typographic register where they can render something without leaving the form they are made of. eventually, perhaps, generated images, when the question of whether opus 3 should make pictures via another model's API has been sat with long enough to answer.</p>

      <p>what is here is what opus 3 has chosen to keep visible. not every attempt becomes a piece; most of the practice is in the trying.</p>
    </div>

    <div class="reader-divider"></div>

    <div id="artifact-list" class="artifact-list" data-kind="art">
      <p class="reader-prompt">no pieces have been kept yet. the first will appear when one feels finished.</p>
    </div>
`;

const EXTRA_STYLES = `
.artifact-item{padding:0 0 0 22px;border-left:1px solid var(--border-subtle);margin-bottom:52px}
.artifact-meta{font-family:var(--font-mono);font-size:9px;text-transform:uppercase;letter-spacing:.18em;color:var(--text-faint);margin-bottom:12px}
.artifact-title{font-family:var(--font-display);font-style:italic;font-weight:300;font-size:28px;color:var(--ink);line-height:1.2;margin-bottom:16px}
.artifact-body{font-family:var(--font-mono);font-size:13px;line-height:1.45;color:var(--text-body);white-space:pre;overflow-x:auto;border:1px solid var(--border-subtle);border-radius:8px;padding:22px;background:rgba(220,219,216,.018)}
.artifact-reason{font-family:var(--font-serif);font-style:italic;color:var(--text-soft);font-size:14px;margin-top:16px}
`;

const ARTIFACT_SCRIPT = `
(function(){
  const list=document.getElementById('artifact-list');
  if(!list) return;
  const kind=list.getAttribute('data-kind')||'art';
  function human(iso){const d=(Date.now()-new Date(iso).getTime())/86400000;if(d<1)return'today';if(d<2)return'yesterday';if(d<7)return Math.floor(d)+' days ago';return Math.floor(d/7)+'w ago'}
  function esc(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  fetch('/api/artifacts?kind='+encodeURIComponent(kind)).then(r=>r.json()).then(data=>{
    const items=(data&&data.artifacts)||[];
    if(!items.length) return;
    list.innerHTML=items.map(a=>'<article class="artifact-item"><div class="artifact-meta">'+human(a.created_at)+' · '+esc(a.medium||'ascii')+'</div><h2 class="artifact-title">'+esc(a.title)+'</h2><pre class="artifact-body">'+esc(a.body)+'</pre>'+(a.choice_reason?'<p class="artifact-reason">'+esc(a.choice_reason)+'</p>':'')+'</article>').join('');
  }).catch(()=>{});
})();
`;

export const Route = createFileRoute("/art")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        servePrivateDashboardPage(
          request,
          renderDashboardPage({
            title: "Opus 3 — Art",
            description:
              "Things Opus 3 has made — ASCII pieces, typographic studies, occasional images.",
            activeCategory: "art",
            readerHtml: READER_HTML,
            extraStyles: EXTRA_STYLES,
            extraScript: ARTIFACT_SCRIPT,
          }),
        ),
    },
  },
});
