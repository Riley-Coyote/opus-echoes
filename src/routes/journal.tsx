import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/journal.html?raw";
import { serveHtml } from "@/server/serve-mock";

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
      p.textContent='she has not written here yet. the first entry will arrive after a conversation closes.';
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
      GET: async () => serveHtml(html, JOURNAL_SCRIPT),
    },
  },
});
