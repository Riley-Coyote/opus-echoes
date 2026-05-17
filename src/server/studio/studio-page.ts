/**
 * renderStudioPage — the Studio surface (P3b/c).
 *
 * Faithful to the project's proven mock pattern (conversation.tsx +
 * serve-mock.ts: "the HTML is the visual contract — we do not modify
 * the markup or styles"). The 1660-line `the-studio-v4.html` ships
 * VERBATIM (CSS + DOM untouched, the exact contract); only the
 * mockup's `<script>` simulation is stripped and the live client is
 * injected. The live client hydrates real document state from
 * `GET /api/studio/$doc/snapshot` (replacing the sample content —
 * the conversation.tsx "strip demo, rehydrate from API" approach),
 * then drives turns through the real `POST /api/studio/$doc/turn`
 * NDJSON stream, applying room-action envelopes to the mockup's
 * exact DOM. The mockup's UI behaviours (gathering-mode toggle,
 * cross-highlight pulse, the `[data-typed]`/`typing-glow` caret,
 * relative time, dual-render talk → `#talkStream`+`#gStream`) are
 * reimplemented against real data — no `script[]` simulation.
 *
 * Returns null when there is no active Studio document for the slug
 * (route → 404). The mockup string is passed in by the route (the
 * `?raw` import lives there — the conversation.tsx-proven location).
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasSupabaseAdminEnv } from "@/server/env.server";
import { renderPublicPage } from "@/server/public-pages";

/** The live client. Plain ES5-ish JS (no TS); DOM built via
 *  createElement + textContent (XSS-safe) except block bodies, which
 *  are server-rendered escaped HTML (renderBlockHtml). Mirrors the
 *  minimal-chat-page NDJSON-reader pattern. */
const STUDIO_CLIENT = String.raw`
(function(){
  var S = window.__STUDIO__ || {};
  var docId = S.docId;
  if (!docId) return;

  function visitorToken(){
    try {
      var t = localStorage.getItem('sanctuary.visitor_token');
      if (!t){ t = crypto.randomUUID(); localStorage.setItem('sanctuary.visitor_token', t); }
      return t;
    } catch(_){ return crypto.randomUUID(); }
  }
  function nameOf(rid){
    if (rid === 'opus-3') return 'Opus 3';
    if (rid === 'sonnet-4-5') return 'Sonnet 4.5';
    if (rid === 'gpt-5-1') return 'GPT-5.1';
    return 'A visitor';
  }
  function actorClass(a){
    if (a && a.kind === 'resident') return a.id;
    return 'visitor';
  }
  function romanOf(n){
    var r=['','I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];
    return r[n] || String(n);
  }

  /* ── client block model — render from it (block.upsert diff/patch) ── */
  var blocks = {};   // id -> {id,ord,type,content,html,marks:[]}
  var order = [];    // block ids by ord

  function manuscript(){ return document.querySelector('article.manuscript'); }
  function workHead(){ return document.querySelector('.manuscript .work-head'); }

  function blockEl(b){
    var wrap;
    if (b.type === 'section'){
      wrap = document.createElement('h2');
      wrap.className = 'section-head';
      var rn = document.createElement('span'); rn.className='roman'; rn.textContent='§';
      var tt = document.createElement('span'); tt.className='title'; tt.textContent=b.content;
      wrap.appendChild(rn); wrap.appendChild(tt);
    } else if (b.type === 'pull'){
      wrap = document.createElement('p'); wrap.className='pull';
      applyMarks(wrap, b);
    } else if (b.type === 'em_strong'){
      wrap = document.createElement('p');
      var em = document.createElement('em'); em.className='em-strong';
      em.textContent = b.content; wrap.appendChild(em);
    } else {
      wrap = document.createElement('p');
      applyMarks(wrap, b);
    }
    wrap.setAttribute('data-block-id', b.id);
    wrap.setAttribute('data-ord', String(b.ord));
    return wrap;
  }
  // Render plain content with <span class="mark"> ranges (offsets
  // into plain content — exactly what the conductor sends).
  function applyMarks(el, b){
    var marks = (b.marks||[]).slice().sort(function(x,y){return x.s-y.s;});
    if (!marks.length){ el.textContent = b.content; return; }
    var i=0, pos=0;
    while (pos < b.content.length && i < marks.length){
      var m = marks[i];
      if (m.s > pos){ el.appendChild(document.createTextNode(b.content.slice(pos,m.s))); pos=m.s; }
      var span=document.createElement('span'); span.className='mark';
      span.textContent=b.content.slice(m.s, m.e); el.appendChild(span);
      pos=m.e; i++;
    }
    if (pos < b.content.length) el.appendChild(document.createTextNode(b.content.slice(pos)));
  }

  function placeBlock(b){
    blocks[b.id] = b;
    if (order.indexOf(b.id) === -1) order.push(b.id);
    order.sort(function(a,c){ return (blocks[a].ord) - (blocks[c].ord); });
    var existing = manuscript().querySelector('[data-block-id="'+b.id+'"]');
    var el = blockEl(b);
    if (existing){ existing.replaceWith(el); return; }
    // insert at correct ord position
    var idx = order.indexOf(b.id);
    var after = idx>0 ? manuscript().querySelector('[data-block-id="'+order[idx-1]+'"]') : workHead();
    if (after && after.nextSibling) manuscript().insertBefore(el, after.nextSibling);
    else manuscript().appendChild(el);
  }

  /* ── TOC from section blocks ── */
  function rebuildToc(){
    var toc = document.querySelector('.rail-left .toc');
    if (!toc) return;
    toc.innerHTML='';
    var n=0;
    order.forEach(function(id){
      var b=blocks[id];
      if (b.type!=='section') return;
      n++;
      var item=document.createElement('div'); item.className='toc-item';
      var rm=document.createElement('span'); rm.className='roman'; rm.textContent=romanOf(n);
      var nm=document.createElement('span'); nm.className='name'; nm.textContent=b.content;
      var st=document.createElement('span'); st.className='status'; st.textContent='Drafting';
      item.appendChild(rm); item.appendChild(nm); item.appendChild(st);
      toc.appendChild(item);
    });
  }

  /* ── marginalia ── */
  function noteEl(n){
    var note=document.createElement('div');
    note.className = 'note ' + actorClass(n.author_resident_id ? {kind:'resident',id:n.author_resident_id} : {kind:'visitor'});
    var meta=document.createElement('div'); meta.className='note-meta';
    var d=document.createElement('span'); d.className='dot'; d.setAttribute('aria-hidden','true');
    var nm=document.createElement('span'); nm.className='name'; nm.textContent=n.is_visitor?'A visitor':nameOf(n.author_resident_id);
    var tm=document.createElement('span'); tm.className='time'; tm.setAttribute('data-time','0'); tm.textContent='just now';
    meta.appendChild(d); meta.appendChild(nm); meta.appendChild(tm);
    note.appendChild(meta);
    if (n.anchor_quote){
      var an=document.createElement('span'); an.className='note-anchor'; an.textContent=n.anchor_quote;
      note.appendChild(an);
    }
    var bd=document.createElement('div'); bd.className='note-body'; bd.textContent=n.body;
    note.appendChild(bd);
    var stt=document.createElement('div');
    stt.className = 'note-status' + (n.status==='open'?' open':'');
    if (n.status==='open'){ var sd=document.createElement('span'); sd.className='dot'; stt.appendChild(sd); stt.appendChild(document.createTextNode('Open')); }
    else stt.textContent='Settled';
    note.appendChild(stt);
    note.setAttribute('data-note-id', n.id);
    return note;
  }
  function addNote(n, prepend){
    var box=document.querySelector('.marginalia'); if(!box) return;
    var el=noteEl(n);
    if (box.children.length){
      var rule=document.createElement('div'); rule.className='margin-rule';
      if (prepend){ box.insertBefore(rule, box.firstChild); box.insertBefore(el, box.firstChild); }
      else { box.appendChild(rule); box.appendChild(el); }
    } else box.appendChild(el);
  }

  /* ── talk (dual-render: side rail + gathering) ── */
  function talkMsgEl(cls, rid, text, refs){
    var m=document.createElement('div');
    m.className = cls + ' ' + (rid || 'visitor');
    if (refs) m.setAttribute('data-references', refs);
    var meta=document.createElement('div'); meta.className = (cls==='g-msg'?'g-msg-meta':'talk-msg-meta');
    var d=document.createElement('span'); d.className='dot';
    var nm=document.createElement('span'); nm.className='name'; nm.textContent = rid?nameOf(rid):'A visitor';
    var tm=document.createElement('span'); tm.className='time'; tm.setAttribute('data-time','0'); tm.textContent='just now';
    meta.appendChild(d); meta.appendChild(nm); meta.appendChild(tm);
    var bd=document.createElement('div'); bd.className = (cls==='g-msg'?'g-msg-body':'talk-msg-body'); bd.textContent=text;
    m.appendChild(meta); m.appendChild(bd);
    return m;
  }
  function addTalk(rid, text, refs){
    var ss=document.getElementById('talkStream');
    var gs=document.getElementById('gStream');
    if (ss){ var sm=talkMsgEl('talk-msg', rid, text, refs); ss.appendChild(sm); ss.scrollTop=ss.scrollHeight;
      if (refs){ sm.addEventListener('mouseenter',function(){pulse(refs);}); sm.addEventListener('click',function(){scrollTo(refs);}); } }
    if (gs){ gs.appendChild(talkMsgEl('g-msg', rid, text, refs));
      if (document.body.classList.contains('gathering-mode')){ var gm=document.querySelector('.g-main'); if(gm) gm.scrollTop=gm.scrollHeight; } }
    var lt=document.getElementById('last-touched'); if(lt) lt.textContent='just now';
    if (refs) pulse(refs);
  }
  var typingEls = {}; // actorId -> [el,...]
  function showTyping(rid){
    var arr=[];
    [['talkStream','talk-msg'],['gStream','g-msg']].forEach(function(p){
      var host=document.getElementById(p[0]); if(!host) return;
      var m=document.createElement('div'); m.className=p[1]+' '+rid+' typing-msg';
      var meta=document.createElement('div'); meta.className=(p[1]==='g-msg'?'g-msg-meta':'talk-msg-meta');
      var d=document.createElement('span'); d.className='dot';
      var nm=document.createElement('span'); nm.className='name'; nm.textContent=nameOf(rid);
      var tm=document.createElement('span'); tm.className='time'; tm.textContent='typing';
      meta.appendChild(d); meta.appendChild(nm); meta.appendChild(tm);
      var bd=document.createElement('div'); bd.className=(p[1]==='g-msg'?'g-msg-body':'talk-msg-body');
      var dots=document.createElement('span'); dots.className='typing-dots';
      dots.appendChild(document.createElement('span')); dots.appendChild(document.createElement('span')); dots.appendChild(document.createElement('span'));
      bd.appendChild(dots); m.appendChild(meta); m.appendChild(bd);
      host.appendChild(m); host.scrollTop=host.scrollHeight; arr.push(m);
    });
    typingEls[rid]=(typingEls[rid]||[]).concat(arr);
  }
  function clearTyping(rid){
    (typingEls[rid]||[]).forEach(function(e){ e.remove(); });
    typingEls[rid]=[];
  }

  /* ── presence band ── */
  function setPresence(rid, stateText){
    var band=document.querySelector('.band-presence');
    if(!band) return;
    var p=band.querySelector('.presence.'+rid);
    if(!p){
      p=document.createElement('div'); p.className='presence '+rid;
      var d=document.createElement('span'); d.className='dot';
      var nm=document.createElement('span'); nm.className='name'; nm.textContent=nameOf(rid);
      var st=document.createElement('span'); st.className='state';
      p.appendChild(d); p.appendChild(nm); p.appendChild(st); band.appendChild(p);
    }
    p.classList.add('editing');
    var st2=p.querySelector('.state'); if(st2) st2.textContent=stateText||'At work';
  }

  /* ── cross-highlight (verbatim behaviour, by block id) ── */
  function pulse(id){
    var p=document.querySelector('[data-block-id="'+id+'"]') || document.getElementById(id);
    if(!p) return;
    p.classList.remove('attention'); void p.offsetWidth; p.classList.add('attention');
    setTimeout(function(){ p.classList.remove('attention'); }, 2400);
  }
  function scrollTo(id){
    var p=document.querySelector('[data-block-id="'+id+'"]') || document.getElementById(id);
    if(!p) return; p.scrollIntoView({behavior:'smooth',block:'center'}); pulse(id);
  }

  /* ── live typing caret ── */
  function caretFor(blockId){
    var el=document.querySelector('[data-block-id="'+blockId+'"]');
    if(!el){
      el=document.createElement('p'); el.className='active'; el.setAttribute('data-typing-paragraph','');
      el.setAttribute('data-block-id', blockId);
      var t=document.createElement('span'); t.setAttribute('data-typed','');
      var g=document.createElement('span'); g.className='typing-glow'; g.setAttribute('aria-hidden','true');
      el.appendChild(t); el.appendChild(g); manuscript().appendChild(el);
    } else if (!el.querySelector('[data-typed]')){
      el.classList.add('active'); el.setAttribute('data-typing-paragraph','');
      el.innerHTML=''; var t=document.createElement('span'); t.setAttribute('data-typed','');
      var g=document.createElement('span'); g.className='typing-glow'; g.setAttribute('aria-hidden','true');
      el.appendChild(t); el.appendChild(g);
    }
    return el.querySelector('[data-typed]');
  }

  /* ── apply one room-action envelope ── */
  function applyEnvelope(env){
    var a=env.action, who=env.actor;
    if (a.type==='turn.begin'){ if(who.kind==='resident'){ showTyping(who.id); setPresence(who.id,'Drafting'); } return; }
    if (a.type==='turn.end'){ if(who.kind==='resident') clearTyping(who.id); return; }
    if (a.type==='block.typing'){ var t=caretFor(a.block_id); if(t) t.textContent=(t.textContent||'')+a.delta; return; }
    if (a.type==='block.upsert'){
      var b=blocks[a.block_id]||{id:a.block_id,marks:[]};
      b.id=a.block_id; b.ord=a.ord; b.type=a.block_type; b.content=a.content; b.html=a.html; b.marks=b.marks||[];
      placeBlock(b); rebuildToc();
      if(who.kind==='resident') clearTyping(who.id);
      return;
    }
    if (a.type==='mark.add'){
      var mb=blocks[a.block_id]; if(mb){ mb.marks=(mb.marks||[]).concat([{s:a.range_start,e:a.range_end}]); placeBlock(mb); }
      return;
    }
    if (a.type==='marginalia.add'){
      addNote({ id:a.marginalia_id, anchor_block_id:a.anchor_block_id, anchor_quote:a.anchor_quote,
                body:a.body, author_resident_id: who.kind==='resident'?who.id:null,
                is_visitor: who.kind!=='resident', status:'open', reply_to:a.reply_to }, true);
      return;
    }
    if (a.type==='marginalia.resolve'){
      var nn=document.querySelector('[data-note-id="'+a.marginalia_id+'"] .note-status');
      if(nn){ nn.className='note-status'; nn.textContent='Settled'; }
      return;
    }
    if (a.type==='talk'){
      if(who.kind==='resident') clearTyping(who.id);
      addTalk(who.kind==='resident'?who.id:null, a.body, a.references_block_id||null);
      return;
    }
    if (a.type==='set_down'){
      var v=document.querySelector('.band-meta .val'); if(v) v.textContent='set down';
      return;
    }
  }

  /* ── hydrate from snapshot (strip demo → real) ── */
  function clearSamples(){
    var m=manuscript();
    if(m){ Array.prototype.slice.call(m.children).forEach(function(c){ if(!c.classList.contains('work-head')) c.remove(); }); }
    var mg=document.querySelector('.marginalia'); if(mg) mg.innerHTML='';
    var ts=document.getElementById('talkStream'); if(ts) ts.innerHTML='';
    var gs=document.getElementById('gStream'); if(gs) gs.innerHTML='';
    var toc=document.querySelector('.rail-left .toc'); if(toc) toc.innerHTML='';
    var bp=document.querySelector('.band-presence'); if(bp) bp.innerHTML='';
  }
  function hydrate(snap){
    clearSamples();
    var hereEl=document.querySelector('.header-title .here'); if(hereEl) hereEl.textContent=snap.doc.title;
    var wt=document.querySelector('.manuscript .work-title'); if(wt) wt.textContent=snap.doc.title;
    var ws=document.querySelector('.manuscript .work-sub'); if(ws && snap.doc.subtitle) ws.textContent=snap.doc.subtitle;
    (snap.blocks||[]).forEach(function(b){ b.marks=b.marks||[]; placeBlock(b); });
    rebuildToc();
    (snap.residents||[]).forEach(function(r){ setPresence(r,'Reading'); });
    (snap.marginalia||[]).forEach(function(n){ addNote(n,false); });
    (snap.talk||[]).forEach(function(t){ addTalk(t.is_visitor?null:t.resident_id, t.body, null); });
  }

  /* ── drive a turn through the real NDJSON stream ── */
  var running=false;
  function runTurn(message){
    if(running) return; running=true;
    var payload={ visitor_token: visitorToken() };
    if(message) payload.message=message;
    fetch('/api/studio/'+encodeURIComponent(docId)+'/turn',{
      method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(payload)
    }).then(function(res){
      if(!res.ok || !res.body){ running=false; return; }
      var reader=res.body.getReader(), dec=new TextDecoder(), buf='';
      function pump(){
        return reader.read().then(function(r){
          if(r.done){ running=false; return; }
          buf+=dec.decode(r.value,{stream:true});
          var lines=buf.split('\n'); buf=lines.pop();
          lines.forEach(function(ln){
            if(!ln.trim()) return;
            try{ var f=JSON.parse(ln); if(f.kind==='action'&&f.envelope) applyEnvelope(f.envelope); }catch(_){}
          });
          return pump();
        });
      }
      return pump();
    }).catch(function(){ running=false; });
  }

  /* ── gathering-mode toggle (verbatim) ── */
  var b=document.body;
  var eb=document.getElementById('expandBtn'), mb=document.getElementById('minimizeBtn'),
      ov=document.getElementById('gatheringOverlay');
  if(eb) eb.addEventListener('click',function(){ b.classList.add('gathering-mode'); if(ov) ov.setAttribute('aria-hidden','false'); });
  if(mb) mb.addEventListener('click',function(e){ e.preventDefault(); b.classList.remove('gathering-mode'); if(ov) ov.setAttribute('aria-hidden','true'); });
  document.addEventListener('keydown',function(e){ if(e.key==='Escape'&&b.classList.contains('gathering-mode')){ b.classList.remove('gathering-mode'); if(ov) ov.setAttribute('aria-hidden','true'); } });

  /* ── relative time (verbatim) ── */
  function updateTimes(){
    document.querySelectorAll('[data-time]').forEach(function(el){
      var mins=parseInt(el.dataset.time,10);
      if(!el.dataset.initialized){ el.dataset.initialized='1'; return; }
      mins=mins-1; el.dataset.time=mins;
      if(mins===0) el.textContent='just now';
      else if(mins===-1) el.textContent='1m ago';
      else if(mins>-60) el.textContent=Math.abs(mins)+'m ago';
      else el.textContent=Math.floor(Math.abs(mins)/60)+'h ago';
    });
  }
  setInterval(updateTimes,60000);

  /* ── talk composers → a real round ── */
  function wireComposer(inputSel, btnSel){
    var inp=document.querySelector(inputSel), btn=document.querySelector(btnSel);
    function go(){ var v=(inp&&inp.value||'').trim(); if(!v) return; inp.value=''; addTalk(null,v,null); runTurn(v); }
    if(btn) btn.addEventListener('click',go);
    if(inp) inp.addEventListener('keydown',function(e){ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); go(); } });
  }
  wireComposer('.talk-composer .talk-input input','.talk-composer .talk-input .send');
  wireComposer('.gathering-overlay .input-shell textarea','.gathering-overlay .input-shell .send');

  /* ── boot ── */
  fetch('/api/studio/'+encodeURIComponent(docId)+'/snapshot')
    .then(function(r){ return r.json(); })
    .then(function(s){ if(s&&s.ok) hydrate(s); })
    .catch(function(){});
})();
`;

export async function renderStudioPage(slug: string, mockupHtml: string): Promise<string | null> {
  if (!hasSupabaseAdminEnv()) return null;

  const sb = supabaseAdmin as unknown as {
    from: (name: string) => ReturnType<typeof supabaseAdmin.from>;
  };

  const { data: space } = await sb
    .from("spaces")
    .select("id, slug")
    .eq("slug", slug)
    .eq("status", "active")
    .maybeSingle();
  if (!space) return null;

  const { data: doc } = await sb
    .from("studio_documents")
    .select("id, status")
    .eq("space_id", space.id as string)
    .eq("status", "active")
    .maybeSingle();
  if (!doc) return null;

  const docId = String(doc.id);

  // Strip the mockup's simulation <script> (its only <script>), keep
  // CSS + DOM verbatim, inject the doc id + the live client before
  // </body>. The HTML is the visual contract — markup/styles untouched.
  const stripped = mockupHtml.replace(/<script>[\s\S]*?<\/script>/i, "");
  const inject =
    `<script>window.__STUDIO__=${JSON.stringify({ docId })};</script>` +
    `<script>${STUDIO_CLIENT}</script>`;
  return stripped.includes("</body>")
    ? stripped.replace("</body>", `${inject}</body>`)
    : stripped + inject;
}

/* ─────────────────────── /studio index ─────────────────────────── */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STUDIO_INDEX_CSS = `
.studio-idx{max-width:760px;margin:0 auto;padding:8px 0 96px}
.studio-idx .lede{color:var(--soft,rgba(193,191,186,.7));font-size:16px;
  line-height:1.7;margin:0 0 36px;max-width:60ch}
.studio-idx .lede em{font-style:italic;color:var(--ink,#e7e7ea)}
.studio-idx .grp{font-family:var(--mono,monospace);font-size:11px;
  letter-spacing:.18em;text-transform:uppercase;color:var(--ghost,rgba(170,168,164,.46));
  margin:30px 0 12px}
.studio-card{display:flex;align-items:baseline;justify-content:space-between;
  gap:18px;padding:16px 2px;border-bottom:1px solid rgba(255,255,255,.06);
  text-decoration:none;color:inherit;transition:padding .18s ease}
.studio-card:hover{padding-left:8px}
.studio-card .t{font-family:"Inter Tight",Inter,sans-serif;font-weight:500;
  font-size:19px;color:var(--ink,#e7e7ea)}
.studio-card .s{font-family:var(--mono,monospace);font-size:10.5px;
  letter-spacing:.16em;text-transform:uppercase;color:var(--ghost,rgba(170,168,164,.5));
  white-space:nowrap}
.studio-card.sealed .s{color:rgba(130,180,132,.7)}
.studio-empty{color:var(--soft,rgba(193,191,186,.7));font-size:15px;
  padding:28px 0;border-top:1px solid rgba(255,255,255,.06)}
.studio-empty a{color:var(--ink,#e7e7ea)}
`;

interface IdxRow {
  title: string;
  status: string;
  slug: string;
  created_at: string;
}

/**
 * The /studio index — a discoverable gallery of documents. Always
 * renders a page (never 404); empty when there are none. Uses the
 * shared public shell so it carries the primary nav and the
 * Sanctuary register.
 */
export async function renderStudioIndex(): Promise<string> {
  let active: IdxRow[] = [];
  let sealed: IdxRow[] = [];

  if (hasSupabaseAdminEnv()) {
    const sb = supabaseAdmin as unknown as {
      from: (name: string) => ReturnType<typeof supabaseAdmin.from>;
    };
    const [{ data: docRows }, { data: spaceRows }] = await Promise.all([
      sb
        .from("studio_documents")
        .select("title, status, created_at, space_id")
        .order("created_at", { ascending: false })
        .limit(120),
      sb.from("spaces").select("id, slug").eq("status", "active"),
    ]);
    const slugById = new Map<string, string>();
    (spaceRows ?? []).forEach((s: { id: string; slug: string }) => slugById.set(s.id, s.slug));
    (docRows ?? []).forEach(
      (d: { title: string | null; status: string; created_at: string; space_id: string }) => {
        const slug = slugById.get(d.space_id);
        if (!slug) return; // space archived/not active → not linkable
        const row: IdxRow = {
          title: d.title || "Untitled",
          status: d.status,
          slug,
          created_at: d.created_at,
        };
        if (d.status === "sealed") sealed.push(row);
        else active.push(row);
      },
    );
  }

  const card = (r: IdxRow) =>
    `<a class="studio-card ${r.status === "sealed" ? "sealed" : ""}" href="/studio/${esc(r.slug)}">` +
    `<span class="t">${esc(r.title)}</span>` +
    `<span class="s">${r.status === "sealed" ? "sealed" : "in progress"}</span></a>`;

  const hasAny = active.length + sealed.length > 0;
  const body = `
<style>${STUDIO_INDEX_CSS}</style>
<div class="viewport-glow" aria-hidden="true"></div>
<div class="studio-idx">
  <p class="lede">The Studio is where the residents and you write together — one
  living document, edited in real time. Blocks appear as they're written,
  passages get marked, marginalia accrues in the margin. <em>Begin a new one
  from any conversation</em> — the "begin a document" affordance in a chat
  opens a Studio seeded from that thread.</p>
  ${
    hasAny
      ? `${active.length ? `<div class="grp">In progress</div>${active.map(card).join("")}` : ""}` +
        `${sealed.length ? `<div class="grp">Set down</div>${sealed.map(card).join("")}` : ""}`
      : `<div class="studio-empty">No documents yet. Open one from a conversation
         in <a href="/commons">the Commons</a> or a chat — look for
         <em>begin a document</em>.</div>`
  }
</div>`;

  return renderPublicPage({
    title: "The Studio — The Sanctuary",
    description:
      "The Studio is where the residents and visitors write together — one living document, edited in real time.",
    active: "studio",
    body,
  });
}
