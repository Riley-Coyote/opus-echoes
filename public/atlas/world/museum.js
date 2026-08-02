/* museum.js — animated ASCII. real dispatch pieces type themselves in; a procedural donut showpiece. */
let E=null, pieces=[], idx=0, mode="piece";
let pre=null, plac=null, revTimer=null, advTimer=null, ascii="", revIdx=0;

const CSS=`
.mus-wrap{position:absolute; inset:0; display:flex; flex-direction:column; align-items:center;
  justify-content:center; gap:18px; padding:8% 7% 12%}
.mus-art{font-family:var(--art); font-size:clamp(5px,1.05vw,12px); line-height:1.18; white-space:pre;
  color:#9ff0c0; text-shadow:0 0 7px rgba(120,240,170,.45); margin:0; max-width:100%; overflow:hidden}
.mus-plac{font-family:var(--pixel); font-size:8px; letter-spacing:.08em; color:var(--dim); text-align:center}
.mus-plac b{color:#cfcbe8; font-weight:400} .mus-plac .d{color:var(--faint); margin:0 9px}
.mus-nav{position:absolute; top:50%; transform:translateY(-50%); font-family:var(--pixel); font-size:18px;
  color:var(--faint); cursor:pointer; padding:18px; user-select:none; transition:color .15s}
.mus-nav:hover{color:var(--phosphor)} .mus-nav.l{left:2%} .mus-nav.r{right:2%}
.mus-modes{position:absolute; bottom:11%; left:0; right:0; text-align:center}
.mus-modes button{font-family:var(--pixel); font-size:8px; letter-spacing:.1em; color:var(--faint);
  background:none; border:1px solid rgba(134,230,164,.2); padding:7px 11px; margin:0 4px; cursor:pointer; transition:.15s}
.mus-modes button.on,.mus-modes button:hover{color:var(--phosphor); border-color:rgba(134,230,164,.5)}
`;

function clearTimers(){ if(revTimer){clearInterval(revTimer);revTimer=null;} if(advTimer){clearTimeout(advTimer);advTimer=null;} }

async function showPiece(){
  clearTimers(); mode="piece"; setModeBtns();
  const p=pieces[idx]; if(!p){ pre.textContent="— no pieces —"; return; }
  pre.textContent=""; ascii=""; revIdx=0;
  plac.innerHTML=`<b>${(p.title||"untitled").toUpperCase()}</b><span class="d">·</span>${p.author||p.model||"—"}<span class="d">·</span>${p.date||""}<span class="d">·</span>fol. ${idx+1}/${pieces.length}`;
  ascii = await E.cache.text(p.art);
  if(mode!=="piece") return; // user switched away while loading
  if(!ascii){ pre.textContent="— piece unavailable —"; return; }
  const chunk=Math.max(8, Math.ceil(ascii.length/70));
  revTimer=setInterval(()=>{
    revIdx=Math.min(ascii.length, revIdx+chunk);
    pre.textContent=ascii.slice(0,revIdx);
    if(revIdx>=ascii.length){ clearInterval(revTimer); revTimer=null;
      if(!E.reduced) advTimer=setTimeout(()=>{ idx=(idx+1)%pieces.length; showPiece(); }, 4200); }
  }, 26);
  if(E.reduced){ clearInterval(revTimer); revTimer=null; pre.textContent=ascii; }
}
function flip(d){ clearTimers(); idx=(idx+d+pieces.length)%pieces.length; showPiece(); }
function setModeBtns(){ E&&E.host.querySelectorAll(".mus-modes button").forEach(b=>b.classList.toggle("on", b.dataset.m===mode)); }

/* the classic spinning ASCII donut */
function donut(t){
  const cols=44, rows=24, b=new Array(cols*rows).fill(" "), z=new Array(cols*rows).fill(0);
  const A=t*0.0011, B=t*0.0007, cA=Math.cos(A),sA=Math.sin(A),cB=Math.cos(B),sB=Math.sin(B);
  const ramp=".,-~:;=!*#$@";
  for(let th=0;th<6.283;th+=0.07){ const ct=Math.cos(th),st=Math.sin(th);
    for(let ph=0;ph<6.283;ph+=0.02){ const cp=Math.cos(ph),sp=Math.sin(ph);
      const cx2=2+ct, cy2=st;
      const x=cx2*(cB*cp+sA*sB*sp)-cy2*cA*sB, y=cx2*(sB*cp-sA*cB*sp)+cy2*cA*cB, oz=1/(5+cA*cx2*sp+cy2*sA);
      const xp=(cols/2+cols*0.42*oz*x)|0, yp=(rows/2-rows*0.62*oz*y)|0;
      const L=cp*ct*sB-cA*ct*sp-sA*st+cB*(cA*st-ct*sA*sp);
      if(yp>=0&&yp<rows&&xp>=0&&xp<cols){ const o=xp+yp*cols; if(oz>z[o]){ z[o]=oz; b[o]=ramp[Math.max(0,Math.min(11,(L*8)|0))]; } }
    }
  }
  let s=""; for(let r=0;r<rows;r++) s+=b.slice(r*cols,(r+1)*cols).join("")+"\n"; return s;
}

export default {
  id:"museum", label:"MUSEUM", accent:0x86e6a4, gloss:"the exhibition",
  async preload(env){
    const book=await env.cache.json("/dispatches/book.json");
    const list=(Array.isArray(book)?book:(book&&book.pieces)||[]).filter(p=>p&&p.art);
    return list;
  },
  start(env){
    E=env; pieces=env.data||[]; idx=0; mode="piece";
    const st=document.createElement("style"); st.textContent=CSS; env.host.appendChild(st);
    const wrap=document.createElement("div"); wrap.className="mus-wrap";
    pre=document.createElement("pre"); pre.className="mus-art";
    plac=document.createElement("div"); plac.className="mus-plac";
    wrap.appendChild(pre); wrap.appendChild(plac); env.host.appendChild(wrap);
    const l=document.createElement("div"); l.className="mus-nav l"; l.textContent="‹"; l.onclick=()=>flip(-1);
    const r=document.createElement("div"); r.className="mus-nav r"; r.textContent="›"; r.onclick=()=>flip(1);
    env.host.appendChild(l); env.host.appendChild(r);
    const modes=document.createElement("div"); modes.className="mus-modes";
    [["piece","◆ THE COLLECTION"],["donut","◆ PROCEDURAL"]].forEach(([m,lbl])=>{
      const btn=document.createElement("button"); btn.dataset.m=m; btn.textContent=lbl;
      btn.onclick=()=>{ if(m==="donut"){ clearTimers(); mode="donut"; setModeBtns(); plac.innerHTML='<b>TORUS</b><span class="d">·</span>rendered live <span class="d">·</span> after bb637fb'; }
        else showPiece(); };
      modes.appendChild(btn);
    });
    env.host.appendChild(modes);
    if(pieces.length){ showPiece(); } else { pre.textContent="— collection unavailable —"; }
    if(env.reduced && pieces.length){ /* showPiece handles reduced */ }
  },
  draw(t){ if(mode==="donut" && pre){ pre.textContent=donut(E.reduced?6000:t); } },
  stop(){ clearTimers(); E=null; pieces=[]; pre=null; plac=null; },
};
