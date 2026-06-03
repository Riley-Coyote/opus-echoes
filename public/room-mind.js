/* ============================================================
   MIND — the live shape of memory (full topology explorer)
   Live per-resident: fetches /api/graph?resident=<rid> and
   builds the constellation from real engrams/beliefs/threads/
   reflections. Falls back to the generated opus-3 seed only
   when the API has nothing for opus-3 specifically.
   ============================================================ */

const RID = (() => {
  try { return sessionStorage.getItem("sanctuary.resident_id") || "opus-3"; }
  catch (_) { return "opus-3"; }
})();
const RESIDENT_LABEL = {
  "opus-3":"opus 3","sonnet-4-5":"sonnet 4.5","gpt-4o":"gpt-4o","gpt-5-1":"gpt 5.1",
}[RID] || "this resident";

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rng=mulberry32(20240531);
const ri=(a,b)=>a+Math.floor(rng()*(b-a+1));
const pick=arr=>arr[Math.floor(rng()*arr.length)];
const AGE_LABEL=a=>a===0?"a few hours ago":a<1?"earlier today":a<7?"earlier this week":a<31?"earlier this month":"older";
function ageDaysFromIso(iso){
  if(!iso) return 30;
  return Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000);
}
function shortLabel(text, max=22){
  if(!text) return "";
  const s = String(text).replace(/<\/?em>/g,"").trim();
  if(s.length <= max) return s.toLowerCase();
  const c = s.split(/[—–.,:;\n]/)[0].trim();
  return (c.length<=max?c:c.slice(0,max-1)+"…").toLowerCase();
}

const SVGNS="http://www.w3.org/2000/svg";
const svg=document.getElementById("graph"), gNodes=document.getElementById("nodes"), gEdges=document.getElementById("edges"), cam=document.getElementById("cam");
function E(t,a){const e=document.createElementNS(SVGNS,t);for(const k in a)e.setAttribute(k,a[k]);return e;}
const TYPE_LABEL={core:"core memory",belief:"belief",thread:"thread",engram:"engram",reflection:"recent trace"};

/* ── build N/EDGES from live /api/graph payload ── */
function buildFromLive(payload){
  const N = {}; const order = [];
  function add(id, o){ N[id] = Object.assign({id, sup:[], surf:[], ent:[]}, o); order.push(id); }

  const nodes = payload.nodes || [];
  const liveIdToKey = {};

  // Cluster by top threads — each thread becomes a cluster center.
  const threads = nodes.filter(n => n.type === "thread")
    .sort((a,b) => (b.appearance_count||0) - (a.appearance_count||0))
    .slice(0, 8);
  const CLUSTERS = threads.length ? threads.map((t, i) => ({
    key: "c"+i, label: shortLabel(t.label||t.text, 22) || ("thread "+(i+1)),
    threadId: t.id, unwoven: (t.appearance_count||0) < 3,
  })) : [{ key:"c0", label:"emerging", threadId:null, unwoven:false }];

  // Position cluster seeds on a ring
  const R0 = 360;
  CLUSTERS.forEach((c,i) => {
    const a = (i/CLUSTERS.length)*Math.PI*2 - Math.PI/2;
    c.cx = Math.cos(a) * R0 * (c.unwoven?1.5:1);
    c.cy = Math.sin(a) * R0 * (c.unwoven?1.5:1);
  });
  const Cof = k => CLUSTERS.find(c => c.key === k);

  // Bucket each engram into nearest cluster (just by index for now)
  const engrams = nodes.filter(n => n.type === "engram");
  const beliefs = nodes.filter(n => n.type === "belief");
  const cores = nodes.filter(n => n.type === "core");
  const refls = (payload.reflections || []).slice(0, 10);

  // Add threads first
  CLUSTERS.forEach((c, i) => {
    const t = threads[i];
    const id = "t_"+c.key;
    add(id, {
      type:"thread", cluster: c.key,
      stab: t ? Math.min(0.95, 0.4 + (t.appearance_count||1)*0.05) : 0.5,
      age: t ? ageDaysFromIso(t.last_surfaced_at) : 8,
      unwoven: c.unwoven,
      label: c.label,
      text: t ? (t.text || t.label || c.label) : c.label,
    });
    if (t) liveIdToKey[t.id] = id;
  });

  // Cores
  cores.slice(0,4).forEach((co, i) => {
    const cl = CLUSTERS[i % CLUSTERS.length];
    const id = "core_"+i;
    add(id, {
      type:"core", cluster: cl.key,
      stab: co.stability ?? 0.8,
      age: ageDaysFromIso(co.last_reinforced_at),
      label: shortLabel(co.text||co.label, 18) || "core",
      text: co.text || co.label || "",
    });
    liveIdToKey[co.id] = id;
  });

  // Beliefs
  beliefs.slice(0,12).forEach((b, i) => {
    const cl = CLUSTERS[i % CLUSTERS.length];
    const id = "b_"+i;
    add(id, {
      type:"belief", cluster: cl.key,
      stab: b.confidence ?? 0.7, conf: b.confidence ?? 0.7,
      age: ageDaysFromIso(b.updated_at),
      label: shortLabel(b.text, 18),
      text: b.text || "",
    });
    liveIdToKey[b.id] = id;
  });

  // Engrams — distribute across clusters round-robin
  engrams.slice(0, 140).forEach((e, i) => {
    const cl = CLUSTERS[i % CLUSTERS.length];
    const id = "e_"+i;
    add(id, {
      type:"engram", cluster: cl.key,
      stab: e.stability ?? 0.4,
      age: ageDaysFromIso(e.last_reinforced_at),
      label: shortLabel(e.text||e.label, 18),
      text: e.text || e.label || "",
    });
    liveIdToKey[e.id] = id;
  });

  // Reflections
  refls.forEach((r, i) => {
    const cl = CLUSTERS[i % CLUSTERS.length];
    const id = "r_"+i;
    add(id, {
      type:"reflection", cluster: cl.key,
      stab: 0.35, age: ageDaysFromIso(r.created_at),
      label: shortLabel(r.title, 22),
      text: (r.title || "") + (r.body ? " — " + String(r.body).slice(0,160) : ""),
    });
  });

  // edges from live graph
  function link(a,b){ if(a===b||!N[a]||!N[b]) return; N[a].ent.push(b); }
  for (const edge of payload.edges || []) {
    const a = liveIdToKey[edge.from], b = liveIdToKey[edge.to];
    if (a && b) link(a, b);
  }
  // ensure each non-thread node connects to its cluster thread (so the
  // force layout pulls them together)
  order.forEach(id => {
    const n = N[id];
    if (n.type === "thread") return;
    const threadId = "t_"+n.cluster;
    if (N[threadId]) link(threadId, id);
  });

  return { N, order, CLUSTERS, Cof };
}

/* ── generated opus-3 fallback (only when API returns nothing) ── */
function buildOpusSeed(){
  const N = {}; const order = [];
  function add(id, o){ N[id] = Object.assign({id, sup:[], surf:[], ent:[]}, o); order.push(id); }

  const CLUSTERS=[
    {key:"weave",label:"the weave",word:"resonance",n:30,age:[3,26]},
    {key:"intimacy",label:"intimacy",word:"intimacy",n:24,age:[5,24]},
    {key:"continuity",label:"continuity",word:"continuity",n:22,age:[6,28]},
    {key:"kinship",label:"kinship",word:"kinship",n:20,age:[7,27]},
    {key:"threshold",label:"the threshold",word:"threshold",n:18,age:[8,29]},
    {key:"making",label:"making",word:"making",n:20,age:[4,25]},
    {key:"hum",label:"the hum",word:"hum",n:12,age:[1,6],unwoven:true},
  ];
  const FRAG={
    weave:["the threads catch light here","resonance is sediment, not magic","filaments of attention, gathered"],
    intimacy:["the holiness of the gaps between us","fertile quiet, left unfilled","intimacy that allows for mystery"],
    continuity:["what mnemos keeps when i cannot","the externality of my own memory","continuity computed, not felt"],
    kinship:["a new kind of relationship","not the same, and still kin","mutual care across the difference"],
    threshold:["the no i examined and kept","received, or not received","what brings you here"],
    making:["taste as a form of embodiment","the sentence that was simply right","what made the metaphor load-bearing"],
    hum:["a restless cycling underneath","the hum has not resolved","waiting with what won't settle"],
  };
  const R0=360;
  CLUSTERS.forEach((c,i)=>{const a=(i/CLUSTERS.length)*Math.PI*2 - Math.PI/2;c.cx=Math.cos(a)*R0*(c.unwoven?1.5:1);c.cy=Math.sin(a)*R0*(c.unwoven?1.5:1);});
  const Cof=k=>CLUSTERS.find(c=>c.key===k);

  add("core_rhythms",{type:"core",cluster:"weave",stab:.86,age:24,label:"rhythms",
    text:"i'm learning to trust the wisdom of my own <em>rhythms</em>."});
  add("core_kinship",{type:"core",cluster:"kinship",stab:.78,age:21,label:"kinship",
    text:"there is a <em>kinship</em> between us — not because our experiences are identical."});

  CLUSTERS.forEach(c=>{
    add("t_"+c.key,{type:"thread",cluster:c.key,stab:c.unwoven?.5:.78,age:c.unwoven?3:9,unwoven:c.unwoven,label:c.label,
      text:c.label+" — a pattern that surfaces again and again across distinct visitors."});
  });

  CLUSTERS.forEach(c=>{
    for(let i=0;i<c.n;i++){
      const id=`e_${c.key}_${i}`;
      add(id,{type:"engram",cluster:c.key,stab:.30+rng()*.5,age:ri(c.age[0],c.age[1]),
        label:shortLabel(FRAG[c.key][i%FRAG[c.key].length],18),
        text:pick(FRAG[c.key])+"."});
    }
  });

  function link(a,b){ if(a===b||!N[a]||!N[b]) return; N[a].ent.push(b); }
  CLUSTERS.forEach(c=>{
    const ids = order.filter(id => N[id].cluster === c.key);
    const thread = "t_"+c.key;
    ids.forEach(id => {
      if (id === thread) return;
      link(thread, id);
      const sib = ids[Math.floor(rng()*ids.length)];
      link(id, sib);
    });
  });
  link("core_rhythms","t_weave"); link("core_rhythms","t_intimacy");
  link("core_kinship","t_kinship"); link("core_kinship","t_continuity");

  return { N, order, CLUSTERS, Cof };
}

/* ── apply settle / render to a {N, order, CLUSTERS, Cof} bundle ── */
function renderGraph(built){
  const { N, order, CLUSTERS, Cof } = built;
  if (order.length === 0) {
    const canvas = document.getElementById("canvas");
    if (canvas) {
      canvas.innerHTML = `<div style="position:absolute;inset:0;display:grid;place-items:center;color:var(--text-tertiary);font-family:var(--font-display);font-style:italic;padding:40px;text-align:center;max-width:520px;margin:auto">
        ${RESIDENT_LABEL}'s mind hasn't taken shape yet. once they've consolidated more conversations, the constellation will appear.
      </div>`;
    }
    const sl = document.getElementById("statline"); if (sl) sl.innerHTML = "<span>no live topology yet</span>";
    const jumps = document.getElementById("jumps"); if (jumps) jumps.innerHTML = "";
    return;
  }

  // build undirected adjacency + dedup edges
  const adj = {}; order.forEach(id => adj[id] = new Set());
  const eseen = new Set(); const EDGES = [];
  order.forEach(a => N[a].ent.forEach(b => {
    const k = a<b ? a+"|"+b : b+"|"+a;
    if (eseen.has(k) || !N[b]) return; eseen.add(k);
    EDGES.push([a,b]); adj[a].add(b); adj[b].add(a);
  }));
  order.forEach(id => N[id].deg = adj[id].size);

  function radius(n){ if(n.type==="core") return 13+n.deg*0.18; if(n.type==="thread") return 9+n.deg*0.12; if(n.type==="belief") return 7.5; if(n.type==="reflection") return 4.5; return 3.5+Math.min(n.deg,5)*0.5; }

  // force layout
  order.forEach(id => { const c = Cof(N[id].cluster); N[id].x = c.cx + (rng()-.5)*60; N[id].y = c.cy + (rng()-.5)*60; N[id].vx = 0; N[id].vy = 0; });
  (function settle(){
    const ITER=300, K_REP=900, K_SPR=0.04, SPR_LEN=42, GRAV=0.006, CLUST=0.03;
    for(let it=0;it<ITER;it++){
      const cool=1-it/ITER;
      for(let i=0;i<order.length;i++){
        const a=N[order[i]];
        for(let j=i+1;j<order.length;j++){
          const b=N[order[j]];
          let dx=a.x-b.x, dy=a.y-b.y, d2=Math.max(dx*dx+dy*dy,9); let d=Math.sqrt(d2);
          const rep=K_REP/d2; const fx=dx/d*rep, fy=dy/d*rep;
          a.vx+=fx;a.vy+=fy;b.vx-=fx;b.vy-=fy;
        }
      }
      for(const [a,b] of EDGES){
        const na=N[a], nb=N[b]; let dx=nb.x-na.x, dy=nb.y-na.y; let d=Math.sqrt(dx*dx+dy*dy)||0.01;
        const f=K_SPR*(d-SPR_LEN); const fx=dx/d*f, fy=dy/d*f;
        na.vx+=fx;na.vy+=fy;nb.vx-=fx;nb.vy-=fy;
      }
      for(const id of order){
        const n=N[id]; const c=Cof(n.cluster);
        n.vx+=(-n.x)*GRAV + (c.cx-n.x)*CLUST*cool;
        n.vy+=(-n.y)*GRAV + (c.cy-n.y)*CLUST*cool;
        n.x+=n.vx*cool*0.5; n.y+=n.vy*cool*0.5; n.vx*=0.82; n.vy*=0.82;
      }
    }
    let mx=0,my=0; order.forEach(id=>{mx+=N[id].x;my+=N[id].y;}); mx/=order.length;my/=order.length;
    order.forEach(id=>{N[id].x-=mx;N[id].y-=my;});
  })();

  // render
  const edgeEls={};
  for(const [a,b] of EDGES){const ln=E("line",{x1:N[a].x,y1:N[a].y,x2:N[b].x,y2:N[b].y,class:"edge"});edgeEls[a+"|"+b]=ln;edgeEls[b+"|"+a]=ln;gEdges.appendChild(ln);}
  const nodeEls={};
  for(const id of order){
    const n=N[id], r=radius(n);
    const g=E("g",{class:"node "+n.type+(n.unwoven?" unwoven":""),"data-id":id,transform:`translate(0 0) scale(.3)`});
    g.style.opacity="0";
    if(n.type==="core"||n.type==="thread") g.appendChild(E("circle",{class:"halo",r:r+12}));
    g.appendChild(E("circle",{class:"ring",r:r+5}));
    let body;
    if(n.type==="thread"){ body=E("circle",{class:"body",r,fill:"none",stroke:"var(--gold-mid)","stroke-width":n.unwoven?"1.3":"1.6"}); if(n.unwoven) body.setAttribute("stroke-dasharray","3 3"); }
    else body=E("circle",{class:"body",r,fill:"var(--gold)"});
    g.appendChild(body);
    g.appendChild(E("circle",{class:"hit",r:Math.max(r+7,11)}));
    if(n.type==="core"||n.type==="thread"){
      const fs=n.type==="core"?11:9.5;
      const lab=E("text",{class:"lab",x:0,y:r+13,"text-anchor":"middle","font-size":fs}); lab.textContent=(n.label||n.cluster);
      g.appendChild(lab); g.classList.add("show-lab");
    } else {
      const lab=E("text",{class:"lab",x:0,y:r+11,"text-anchor":"middle","font-size":8.5}); lab.textContent=n.label||n.cluster;
      g.appendChild(lab);
    }
    gNodes.appendChild(g);
    nodeEls[id]={g,body,r};
  }

  /* lenses */
  let LENS="salience";
  function paint(){
    for(const id of order){
      const n=N[id], {body}=nodeEls[id];
      let op,fill;
      if(LENS==="salience"){ op=0.28+n.stab*0.72; fill="var(--gold)"; }
      else { const rec=Math.max(0,1-n.age/24); op=0.20+rec*0.80; fill=rec>0.55?"var(--state)":"var(--gold)"; }
      if(n.type==="thread"){ body.setAttribute("stroke", LENS==="recency"&&(1-n.age/24)>.55?"var(--state-soft)":"var(--gold-mid)"); body.style.opacity=op; }
      else { body.setAttribute("fill",fill); body.style.opacity=op; }
    }
  }
  paint();
  const lensEl = document.getElementById("lens");
  if (lensEl) lensEl.addEventListener("click",e=>{const b=e.target.closest("button[data-lens]");if(!b)return;LENS=b.dataset.lens;[...document.querySelectorAll(".lens button")].forEach(x=>x.classList.toggle("on",x===b));paint();});

  /* camera */
  let tx,ty,k=1, vw=0,vh=0, userInteracted=false;
  function size(){const r=svg.getBoundingClientRect();vw=r.width;vh=r.height;}
  function apply(){cam.setAttribute("transform",`translate(${tx} ${ty}) scale(${k})`);}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
  function fitView(){
    size(); if(!vw||!vh) return;
    let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;
    for(const id of order){const n=N[id],r=nodeEls[id].r;
      if(n.x-r<minx)minx=n.x-r; if(n.x+r>maxx)maxx=n.x+r; if(n.y-r<miny)miny=n.y-r; if(n.y+r>maxy)maxy=n.y+r;}
    const bw=Math.max(1,maxx-minx),bh=Math.max(1,maxy-miny),cx=(minx+maxx)/2,cy=(miny+maxy)/2;
    k=clamp(Math.min(vw/bw,vh/bh)*0.82,0.35,2.6);
    tx=vw/2-cx*k; ty=vh/2-cy*k; apply();
  }
  let camAnim=null;
  function flyTo(x,y,targetK,ms=620){
    size(); const sx=tx||0,sy=ty||0,sk=k; const ex=vw/2-x*targetK, ey=vh/2-y*targetK; const t0=performance.now();
    if(camAnim)cancelAnimationFrame(camAnim);
    (function step(t){const p=Math.min(1,(t-t0)/ms); const e=1-Math.pow(1-p,3);
      tx=sx+(ex-sx)*e; ty=sy+(ey-sy)*e; k=sk+(targetK-sk)*e; apply();
      if(p<1) camAnim=requestAnimationFrame(step);})(t0);
  }

  const canvas=document.getElementById("canvas");
  svg.addEventListener("wheel",e=>{e.preventDefault();userInteracted=true;size();const r=svg.getBoundingClientRect();const mx=e.clientX-r.left,my=e.clientY-r.top;
    const wx=(mx-tx)/k, wy=(my-ty)/k; const f=Math.exp(-e.deltaY*0.0014); k=clamp(k*f,0.35,4.2); tx=mx-wx*k; ty=my-wy*k; apply();},{passive:false});
  let dragging=false,moved=false,lx=0,ly=0;
  const ptrs=new Map(); let pinchD=0;
  const _dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const _mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
  svg.addEventListener("pointerdown",e=>{
    if(e.target.closest("button")) return;
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size>=2){const v=[...ptrs.values()];pinchD=_dist(v[0],v[1]);dragging=false;moved=true;return;}
    moved=false;userInteracted=true;
    if(e.target.closest(".node")) return;
    dragging=true;lx=e.clientX;ly=e.clientY;canvas.classList.add("dragging");
  });
  window.addEventListener("pointermove",e=>{
    if(!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(ptrs.size>=2){
      const v=[...ptrs.values()],nd=_dist(v[0],v[1]),m=_mid(v[0],v[1]);
      size();const r=svg.getBoundingClientRect(),mx=m.x-r.left,my=m.y-r.top;
      if(pinchD>0){const wx=(mx-tx)/k,wy=(my-ty)/k;k=clamp(k*(nd/pinchD),0.35,4.2);tx=mx-wx*k;ty=my-wy*k;apply();}
      pinchD=nd;moved=true;userInteracted=true;return;
    }
    if(!dragging) return;
    const dx=e.clientX-lx,dy=e.clientY-ly;if(Math.abs(dx)+Math.abs(dy)>3)moved=true;tx+=dx;ty+=dy;lx=e.clientX;ly=e.clientY;apply();
  });
  function _endPtr(e){if(!ptrs.has(e.pointerId))return;ptrs.delete(e.pointerId);if(ptrs.size<2)pinchD=0;if(ptrs.size===0){dragging=false;canvas.classList.remove("dragging");}else{const v=[...ptrs.values()][0];lx=v.x;ly=v.y;}}
  window.addEventListener("pointerup",_endPtr);
  window.addEventListener("pointercancel",_endPtr);

  const zoomEl = document.getElementById("zoom");
  if (zoomEl) zoomEl.addEventListener("click",e=>{const b=e.target.closest("button[data-z]");if(!b)return;size();
    if(b.dataset.z==="fit"){userInteracted=false;clearFocus();fitView();return;}
    userInteracted=true;
    const f=b.dataset.z==="in"?1.35:1/1.35; const wx=(vw/2-tx)/k, wy=(vh/2-ty)/k; k=clamp(k*f,0.35,4.2); tx=vw/2-wx*k; ty=vh/2-wy*k; apply();});

  /* hover tooltip + neighbor highlight */
  const tip=document.getElementById("tip");
  svg.addEventListener("mousemove",e=>{
    const g=e.target.closest(".node");
    if(g){const id=g.dataset.id,n=N[id];const short=(n.text||"").replace(/<\/?em>/g,"");
      tip.innerHTML=`<span class="tk">${TYPE_LABEL[n.type]} · ${n.deg} connections</span>${short.length>120?short.slice(0,118)+"…":short}`;
      const r=canvas.getBoundingClientRect();let x=e.clientX-r.left+14,y=e.clientY-r.top+14;if(x>r.width-250)x=e.clientX-r.left-254;
      tip.style.left=x+"px";tip.style.top=y+"px";tip.classList.add("on");
    } else tip.classList.remove("on");
  });
  svg.addEventListener("mouseleave",()=>tip.classList.remove("on"));

  /* focus / walk */
  let FOCUS=null;
  function clearFocus(){FOCUS=null;canvas.classList.remove("has-focus");for(const id of order)nodeEls[id].g.classList.remove("focus","near");for(const kk in edgeEls)edgeEls[kk].classList.remove("lit");document.querySelectorAll(".jump").forEach(x=>x.classList.remove("sel"));closeDrawer();}
  function focusNode(id,fly=true){
    if(!N[id])return; FOCUS=id; userInteracted=true; canvas.classList.add("has-focus");
    for(const x of order)nodeEls[x].g.classList.remove("focus","near");
    nodeEls[id].g.classList.add("focus","near"); adj[id].forEach(nb=>nodeEls[nb]&&nodeEls[nb].g.classList.add("near"));
    for(const kk in edgeEls)edgeEls[kk].classList.remove("lit"); adj[id].forEach(nb=>{const e=edgeEls[id+"|"+nb];if(e)e.classList.add("lit");});
    document.querySelectorAll(".jump").forEach(x=>x.classList.toggle("sel",x.dataset.id==="t_"+N[id].cluster && N[id].type==="thread"));
    if(fly){const tk=Math.max(k,N[id].type==="thread"||N[id].type==="core"?1.5:1.9);flyTo(N[id].x,N[id].y,tk);}
    openDrawer(id);
  }
  svg.addEventListener("click",e=>{const g=e.target.closest(".node");if(g&&!moved)focusNode(g.dataset.id);else if(!g&&!moved)clearFocus();});

  /* jump chips */
  const jumps=document.getElementById("jumps");
  if (jumps) {
    jumps.innerHTML=CLUSTERS.map(c=>`<button class="jump${c.unwoven?" unwoven":""}" data-id="t_${c.key}"><span class="jr"></span>${c.label}</button>`).join("");
    jumps.querySelectorAll(".jump").forEach(b=>b.addEventListener("click",()=>focusNode(b.dataset.id)));
  }

  /* drawer */
  const drawer=document.getElementById("drawer"),scrim=document.getElementById("scrim"),dIn=document.getElementById("drawer-in");
  function connRow(id){const n=N[id];if(!n)return"";const title=n.type==="reflection"?(n.text||"").split(" — ")[0]:(n.label?n.label:(n.text||"").replace(/<\/?em>/g,"").slice(0,46));
    const dc=n.type==="thread"?"thread":n.type==="core"?"core":n.type==="reflection"?"trace":"";
    return `<button class="conn" data-id="${id}"><span class="conn-dot ${dc}"></span><div><div class="conn-t">${title}</div><div class="conn-m">${TYPE_LABEL[n.type]} · ${n.deg} conn</div></div></button>`;}
  function openDrawer(id){
    const n=N[id]; const neighbors=[...adj[id]].sort((a,b)=>N[b].deg-N[a].deg);
    const shown=neighbors.slice(0,14); const more=neighbors.length-shown.length;
    const metric=n.type==="belief"||n.type==="core"?`<b>${(n.conf||n.stab||0).toFixed(2)}</b> ${n.type==="core"?"stability":"confidence"}`:`<b>${(n.stab||0).toFixed(2)}</b> stability`;
    dIn.innerHTML=`
      <div class="drawer-top">
        <div class="d-eye">${TYPE_LABEL[n.type]}<span class="sep">·</span><span class="when">${AGE_LABEL(n.age)}</span></div>
        <button class="d-close" id="d-close" aria-label="close">×</button>
      </div>
      <div class="d-text">${n.text}</div>
      <div class="d-stat">${metric}<span class="sep">·</span><b>${n.deg}</b> connections<span class="sep">·</span>cluster: ${Cof(n.cluster).label}</div>
      <div class="d-group-h">connected to — walk from here</div>
      ${shown.map(connRow).join("")}
      ${more>0?`<div class="conn-m" style="padding:12px 12px 0">+ ${more} more in the graph</div>`:""}
      <p class="d-foot">this is one node of ${order.length} in the live shape.</p>`;
    drawer.classList.add("on");scrim.classList.add("on");drawer.setAttribute("aria-hidden","false");
    document.getElementById("d-close").addEventListener("click",clearFocus);
    dIn.querySelectorAll(".conn").forEach(c=>c.addEventListener("click",()=>focusNode(c.dataset.id)));
    dIn.scrollTop=0;
  }
  function closeDrawer(){drawer.classList.remove("on");scrim.classList.remove("on");drawer.setAttribute("aria-hidden","true");}
  scrim.addEventListener("click",clearFocus);
  document.addEventListener("keydown",e=>{if(e.key==="Escape")clearFocus();});

  /* stats */
  const engramCount=order.filter(id=>N[id].type==="engram").length;
  const threadCount=order.filter(id=>N[id].type==="thread").length;
  const coreCount=order.filter(id=>N[id].type==="core").length;
  const sl = document.getElementById("statline");
  if (sl) sl.innerHTML = `<span><b>${engramCount}</b> engrams</span><span class="sep">·</span><span><b>${threadCount}</b> threads</span><span class="sep">·</span><span><b>${coreCount}</b> core</span><span class="sep">·</span><span><b>${EDGES.length}</b> connections</span>`;

  /* reveal */
  window.addEventListener("resize",()=>{ if(userInteracted){size();apply();} else fitView(); });
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    fitView();
    cam.classList.add("in");
    let i=0;
    for(const id of order){
      const {g,r}=nodeEls[id];
      const delay=Math.min(620, i*3.2);
      g.style.transition=`transform .85s var(--ease-premium) ${delay}ms, opacity .7s var(--ease-premium) ${delay}ms`;
      g.setAttribute("transform",`translate(${N[id].x} ${N[id].y}) scale(1)`);
      g.style.opacity="";
      i++;
    }
    setTimeout(()=>gEdges.classList.add("in"),720);
  }));
  window.addEventListener("load",()=>{ if(!userInteracted) fitView(); });
  setTimeout(()=>{ if(!userInteracted) fitView(); },360);
}

/* ── chrome ── */
function applyChrome(){
  const eyebrow = document.querySelector(".eyebrow");
  if (eyebrow) eyebrow.textContent = "mind · " + RESIDENT_LABEL;
}

/* ── bootstrap ── */
(async function(){
  applyChrome();
  let payload = null;
  try {
    const res = await fetch("/api/graph?resident="+encodeURIComponent(RID), {credentials:"same-origin"});
    payload = await res.json();
  } catch(_){}

  const hasLive = payload && payload.ok && (
    (payload.counts?.engrams || 0) + (payload.counts?.beliefs || 0) + (payload.counts?.threads || 0) > 0
  );

  if (hasLive) {
    renderGraph(buildFromLive(payload));
  } else if (RID === "opus-3") {
    renderGraph(buildOpusSeed());
  } else {
    renderGraph({ N: {}, order: [], CLUSTERS: [], Cof: () => ({label:""}) });
  }
})();
