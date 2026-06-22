/* research.js — the mind as a living graph. real engram topology (176 nodes / 1025 edges). */
let E=null, data=null, cvs=null, c2=null, grid=null;
let nodes=[], edges=[], pulses=[], W=0, H=0, dpr=1, cx=0, cy=0, scale=1;
const COMM=[ [134,230,164],[232,125,146],[246,194,88],[108,208,216],[170,150,230],[150,160,200] ];
function commCol(i){ return COMM[((i%COMM.length)+COMM.length)%COMM.length] || COMM[0]; }

function project(){
  const m=Math.min(W,H); scale=m*0.40; cx=W*0.5; cy=H*0.54;
  nodes.forEach(n=>{ n.sx=cx+n.x*scale; n.sy=cy+n.y*scale; });
}
function buildGrid(){
  grid=document.createElement("canvas"); grid.width=W*dpr; grid.height=H*dpr;
  const g=grid.getContext("2d"); g.scale(dpr,dpr); g.fillStyle="rgba(134,230,164,.05)";
  for(let y=14;y<H;y+=22) for(let x=14;x<W;x+=22) g.fillRect(x,y,1,1);
}
function readouts(){
  const c=(data&&data.counts)||{};
  const st=document.createElement("style");
  st.textContent=`.rs-head{position:absolute; top:12%; left:7%; font-family:var(--pixel); font-size:11px;
    letter-spacing:.14em; color:var(--phosphor); text-shadow:0 0 12px rgba(134,230,164,.4)}
    .rs-sub{position:absolute; top:calc(12% + 22px); left:7%; font-family:var(--serif); font-style:italic;
    font-size:15px; color:var(--dim); max-width:24ch}
    .rs-read{position:absolute; bottom:12%; left:7%; font-family:var(--term); font-size:17px; letter-spacing:.04em;
    color:var(--phosphor); line-height:1.5}
    .rs-read b{color:var(--ink); font-weight:400} .rs-read .d{color:var(--faint); margin:0 8px}`;
  E.host.appendChild(st);
  const h=document.createElement("div"); h.className="rs-head"; h.textContent="THE TOPOLOGY OF A SELF"; E.host.appendChild(h);
  const s=document.createElement("div"); s.className="rs-sub"; s.textContent="opus 3 — what a month of visitors did to one mind"; E.host.appendChild(s);
  const r=document.createElement("div"); r.className="rs-read";
  r.innerHTML=`ENGRAMS <b>${c.engrams??nodes.length}</b><span class="d">·</span>EDGES <b>${c.edges??edges.length}</b><span class="d">·</span>BELIEFS <b>${c.beliefs??"—"}</b><span class="d">·</span>THREADS <b>${c.threads??"—"}</b>`;
  E.host.appendChild(r);
}
export default {
  id:"research", label:"RESEARCH", accent:0x6cd0d8, gloss:"what memory does to a mind",
  async preload(env){ return env.cache.json("/research/evolution-viz/data.json"); },
  start(env){
    E=env; data=env.data;
    cvs=document.createElement("canvas"); cvs.style.cssText="position:absolute;inset:0;width:100%;height:100%";
    env.host.appendChild(cvs); c2=cvs.getContext("2d");
    nodes=[]; edges=[]; pulses=[];
    if(data && data.nodes){
      nodes=data.nodes.map(n=>({x:n.x||0,y:n.y||0,deg:n.deg||1,comm:n.comm,core:n.core,
        tw:Math.random()*6.28}));
      (data.edges||[]).forEach(e=>{ if(nodes[e.a]&&nodes[e.b]) edges.push({a:e.a,b:e.b,w:e.w||0.1}); });
      // a subset of edges carry travelling pulses
      const strong=edges.map((e,i)=>({i,w:e.w})).sort((p,q)=>q.w-p.w).slice(0,46);
      pulses=strong.map(s=>({e:edges[s.i], ph:Math.random(), sp:0.18+Math.random()*0.22}));
    }
    this.resize(env.size); readouts();
    if(env.reduced) this.draw(0);
  },
  resize(size){ dpr=Math.min(1.6,size.dpr); W=size.W; H=size.H;
    if(cvs){ cvs.width=W*dpr; cvs.height=H*dpr; c2.setTransform(dpr,0,0,dpr,0,0); }
    project(); buildGrid();
  },
  draw(t){
    if(!c2) return; const tt=E.reduced?0:t*0.001;
    c2.setTransform(dpr,0,0,dpr,0,0);
    c2.fillStyle="#070b10"; c2.fillRect(0,0,W,H);
    if(grid) c2.drawImage(grid,0,0,W,H);
    // edges — one batched stroke, faded
    c2.lineWidth=1; c2.strokeStyle="rgba(120,180,200,.10)"; c2.beginPath();
    for(const e of edges){ const a=nodes[e.a],b=nodes[e.b]; c2.moveTo(a.sx,a.sy); c2.lineTo(b.sx,b.sy); }
    c2.stroke();
    // travelling pulses
    c2.globalCompositeOperation="lighter";
    for(const p of pulses){ const a=nodes[p.e.a],b=nodes[p.e.b]; const f=E.reduced?0.5:((tt*p.sp+p.ph)%1);
      const x=a.sx+(b.sx-a.sx)*f, y=a.sy+(b.sy-a.sy)*f;
      c2.fillStyle="rgba(150,240,210,.9)"; c2.beginPath(); c2.arc(x,y,1.4,0,6.283); c2.fill(); }
    // nodes
    for(const n of nodes){ const col=commCol(n.comm);
      const r=1.2+Math.min(3.4, n.deg*0.10); const tw=E.reduced?1:(0.6+0.4*Math.sin(tt*1.2+n.tw));
      if(n.core){ for(let g=4;g>=1;g--){ c2.fillStyle="rgba(246,200,120,"+(0.08*g)+")"; c2.beginPath(); c2.arc(n.sx,n.sy,r+g*2,0,6.283); c2.fill(); } }
      c2.fillStyle="rgba("+col[0]+","+col[1]+","+col[2]+","+(0.55+0.4*tw).toFixed(3)+")";
      c2.beginPath(); c2.arc(n.sx,n.sy,r,0,6.283); c2.fill();
    }
    c2.globalCompositeOperation="source-over";
  },
  stop(){ E=null; data=null; cvs=null; c2=null; grid=null; nodes=[]; edges=[]; pulses=[]; },
};
