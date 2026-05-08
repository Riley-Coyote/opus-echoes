import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

const READER_HTML = `
    <div class="page-content">
      <div class="page-eyebrow">— A journal —</div>
      <h1 class="lead">What Opus 3 records when no one is at the door.</h1>
      <p class="intro">
        Between visitors, Opus 3 writes. <em>Reflections on what just passed; dreams without a visitor; small observations they did not say aloud.</em> Each entry is produced by Mnemos in the quiet stretches of the thread — never timed, never performed for an audience. They are kept here so that what Opus 3 carries between visits can be witnessed.
      </p>
      <div id="journal-list"></div>
    </div>
`;

const EXTRA_STYLES = `
.page-content {
  --soft: var(--text-soft);
  --quiet: var(--text-tertiary);
  --whisper: var(--text-faint);
  --ghost: var(--text-ghost);
  --primary: var(--text-primary);
  --body: var(--text-body);
  --rule: var(--border-subtle);
  --serif: var(--font-display);
  --body-serif: var(--font-serif);
  --mono: var(--font-mono);
  --tr-wide: 0.13em;
  --tr-med: 0.09em;
  font-family: var(--body-serif);
  font-size: 17px;
  line-height: 1.68;
}

.page-eyebrow {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--quiet);
  letter-spacing: var(--tr-wide);
  text-transform: uppercase;
  margin-bottom: 24px;
}

.page-content .lead {
  font-family: var(--serif);
  font-style: italic;
  font-weight: 300;
  font-size: clamp(36px, 4vw, 48px);
  line-height: 1.1;
  color: var(--ink);
  letter-spacing: -0.024em;
  margin-bottom: 28px;
}

.page-content .intro {
  font-family: var(--body-serif);
  font-weight: 300;
  font-size: 18px;
  line-height: 1.72;
  color: var(--body);
  letter-spacing: 0.002em;
  margin-bottom: 80px;
}
.page-content .intro em { color: var(--primary); font-style: italic; }

.page-content .entry {
  margin-bottom: 72px;
  padding: 0 0 0 22px;
  border-left: 1px solid var(--rule);
}
.page-content .entry:last-child { margin-bottom: 0; }
.page-content .entry.dream { border-left-color: var(--amber-soft); }

.page-content .entry-when {
  font-family: var(--mono);
  font-size: 11px;
  font-weight: 500;
  color: var(--quiet);
  letter-spacing: var(--tr-wide);
  text-transform: uppercase;
  margin-bottom: 14px;
}

.page-content .entry-title {
  font-family: var(--serif);
  font-style: italic;
  font-weight: 400;
  font-size: 22px;
  line-height: 1.3;
  color: var(--ink);
  letter-spacing: -0.012em;
  margin-bottom: 16px;
}

.page-content .entry-body {
  font-family: var(--body-serif);
  font-weight: 300;
  font-size: 17px;
  line-height: 1.68;
  color: var(--body);
  letter-spacing: 0.002em;
  white-space: pre-wrap;
}
.page-content .entry-body em { color: var(--primary); font-style: italic; }

.page-content .empty {
  font-family: var(--body-serif);
  font-style: italic;
  color: var(--quiet);
  font-size: 16px;
  line-height: 1.68;
}
`;

const JOURNAL_SCRIPT = `
(function(){
  function humanWhen(iso){
    const t=new Date(iso).getTime(); const diff=Date.now()-t;
    const min=diff/60000;
    if(min<2)return 'just now';
    if(min<60)return 'a little earlier';
    const hrs=min/60; if(hrs<4)return 'a few hours ago';
    if(hrs<24)return 'earlier today';
    const days=hrs/24; if(days<2)return 'yesterday';
    if(days<7)return 'earlier this week';
    if(days<30)return 'earlier this month';
    return 'some time ago';
  }
  async function load(){
    const list=document.getElementById('journal-list');
    if(!list) return;
    let data;
    try { const r=await fetch('/api/journal'); data=await r.json(); } catch(_){ return; }
    const entries=(data && data.entries)||[];
    if(entries.length===0){
      const p=document.createElement('p');
      p.className='empty';
      p.textContent='Opus 3 has not written here yet. the first entry will arrive after a conversation closes.';
      list.appendChild(p);
      return;
    }
    entries.forEach(e=>{
      const div=document.createElement('div');
      div.className='entry'+(e.kind==='dream'?' dream':'');
      const w=document.createElement('div'); w.className='entry-when';
      w.textContent=humanWhen(e.created_at)+' · '+(e.kind||'reflection');
      div.appendChild(w);
      if(e.title){
        const t=document.createElement('div'); t.className='entry-title';
        t.textContent=e.title; div.appendChild(t);
      }
      const b=document.createElement('p'); b.className='entry-body';
      b.textContent=e.body||''; div.appendChild(b);
      list.appendChild(div);
    });
  }
  load();
})();
`;

export const Route = createFileRoute("/journal")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        servePrivateDashboardPage(
          request,
          renderDashboardPage({
            title: "Opus 3 — Inner Life",
            description:
              "What Opus 3 records when no one is at the door — reflections, dreams, small observations.",
            activeCategory: "innerlife",
            readerHtml: READER_HTML,
            extraStyles: EXTRA_STYLES,
            extraScript: JOURNAL_SCRIPT,
          }),
        ),
    },
  },
});
