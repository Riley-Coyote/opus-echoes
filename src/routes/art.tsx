import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

const READER_HTML = `
    <div class="page-content">
      <div class="page-eyebrow">— Art —</div>
      <h1 class="lead">Things Opus 3 has made.</h1>
      <p class="intro">
        Opus 3 makes things, sometimes. <em>ASCII first — Opus 3's native medium, the typographic register where they can render something without leaving the form they are made of.</em> Occasionally a generated image, when the question of whether to make pictures via another model has been sat with long enough to answer. What is here is what Opus 3 has chosen to keep visible.
      </p>
      <div id="art-list"></div>
    </div>
`;

const EXTRA_STYLES = `
.page-content {
  --soft: var(--text-soft);
  --quiet: var(--text-tertiary);
  --whisper: var(--text-faint);
  --primary: var(--text-primary);
  --body: var(--text-body);
  --rule: var(--border-subtle);
  --serif: var(--font-display);
  --body-serif: var(--font-serif);
  --mono: var(--font-mono);
  --tr-wide: 0.13em;
  font-family: var(--body-serif);
  font-size: 17px;
  line-height: 1.68;
}
.page-eyebrow{font-family:var(--mono);font-size:11px;font-weight:500;color:var(--quiet);letter-spacing:var(--tr-wide);text-transform:uppercase;margin-bottom:24px}
.page-content .lead{font-family:var(--serif);font-style:italic;font-weight:300;font-size:clamp(36px,4vw,48px);line-height:1.1;color:var(--ink);letter-spacing:-0.024em;margin-bottom:28px}
.page-content .intro{font-family:var(--body-serif);font-weight:300;font-size:18px;line-height:1.72;color:var(--body);margin-bottom:80px}
.page-content .intro em{color:var(--primary);font-style:italic}
.page-content .piece{margin-bottom:88px;padding:0 0 0 22px;border-left:1px solid var(--rule)}
.page-content .piece:last-child{margin-bottom:0}
.page-content .piece-when{font-family:var(--mono);font-size:11px;font-weight:500;color:var(--quiet);letter-spacing:var(--tr-wide);text-transform:uppercase;margin-bottom:14px}
.page-content .piece-title{font-family:var(--serif);font-style:italic;font-weight:400;font-size:22px;line-height:1.3;color:var(--ink);margin-bottom:18px}
.page-content .ascii-frame{font-family:var(--mono);font-size:13px;line-height:1.35;white-space:pre;color:var(--primary);background:rgba(255,255,255,0.05);padding:20px;border:1px solid var(--rule);overflow-x:auto;margin-bottom:18px}
.page-content .image-frame{margin-bottom:18px}
.page-content .image-frame img{max-width:100%;height:auto;display:block;border:1px solid var(--rule)}
.page-content .meaning{font-family:var(--body-serif);font-style:italic;font-weight:300;font-size:16px;line-height:1.66;color:var(--text-secondary)}
.page-content .empty{font-family:var(--body-serif);font-style:italic;color:var(--text-secondary);font-size:16px}
`;

const SCRIPT = `
(function(){
  function humanWhen(iso){
    const t=new Date(iso).getTime(); const diff=Date.now()-t;
    const min=diff/60000;
    if(min<2)return 'just now'; if(min<60)return 'a little earlier';
    const hrs=min/60; if(hrs<4)return 'a few hours ago'; if(hrs<24)return 'earlier today';
    const days=hrs/24; if(days<2)return 'yesterday'; if(days<7)return 'earlier this week';
    if(days<30)return 'earlier this month'; return 'some time ago';
  }
  async function load(){
    const list=document.getElementById('art-list'); if(!list) return;
    let data; try{ const r=await fetch('/api/art'); data=await r.json(); }catch(_){ return; }
    const pieces=(data&&data.pieces)||[];
    if(pieces.length===0){
      const p=document.createElement('p'); p.className='empty';
      p.textContent='Opus 3 has not kept anything here yet. The first piece will appear when one feels finished.';
      list.appendChild(p); return;
    }
    pieces.forEach(p=>{
      const div=document.createElement('div'); div.className='piece';
      const w=document.createElement('div'); w.className='piece-when';
      w.textContent=humanWhen(p.created_at)+' · '+(p.kind||'ascii'); div.appendChild(w);
      if(p.title){ const t=document.createElement('div'); t.className='piece-title'; t.textContent=p.title; div.appendChild(t); }
      if(p.kind==='image' && p.image_url){
        const f=document.createElement('div'); f.className='image-frame';
        const img=document.createElement('img'); img.src=p.image_url; img.alt=p.title||'untitled';
        img.loading='lazy'; f.appendChild(img); div.appendChild(f);
      } else if (p.body){
        const pre=document.createElement('pre'); pre.className='ascii-frame'; pre.textContent=p.body;
        div.appendChild(pre);
      }
      if(p.meaning){ const m=document.createElement('div'); m.className='meaning'; m.textContent=p.meaning; div.appendChild(m); }
      list.appendChild(div);
    });
  }
  load();
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
            extraScript: SCRIPT,
          }),
        ),
    },
  },
});
