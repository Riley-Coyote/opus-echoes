/* hub.js — the area-select "map". a DOM menu over a pulsing dot-grid backdrop. */
let E=null, sel=0, items=[], gridCanvas=null;

const CSS = `
.hub-wrap{position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center;
  padding:clamp(40px,8vw,120px); gap:6px}
.hub-eyebrow{font-family:var(--pixel); font-size:10px; letter-spacing:.24em; color:var(--phosphor);
  text-shadow:0 0 12px rgba(134,230,164,.4); margin-bottom:26px}
.hub-eyebrow::before{content:"\\25B8"; margin-right:12px; color:var(--phosphor)}
.hub-item{display:flex; align-items:baseline; gap:16px; padding:7px 0; cursor:pointer; text-decoration:none}
.hub-item .car{font-family:var(--pixel); font-size:13px; color:var(--phosphor); opacity:0;
  transform:translateX(-6px); transition:opacity .12s, transform .12s; filter:drop-shadow(0 0 6px rgba(134,230,164,.7))}
.hub-item .lbl{font-family:var(--pixel); font-size:clamp(14px,2vw,20px); letter-spacing:.04em; color:#cfcbe8;
  transition:color .14s, text-shadow .14s}
.hub-item .gl{font-family:var(--serif); font-style:italic; font-size:clamp(13px,1.4vw,17px); color:var(--faint);
  transition:color .14s}
.hub-item.sel .car{opacity:1; transform:translateX(0)}
.hub-item.sel .lbl{color:var(--phosphor); text-shadow:0 0 14px rgba(134,230,164,.55)}
.hub-item.sel .gl{color:var(--dim)}
@media (max-width:640px){ .hub-item .gl{display:none} }
`;

function paint(){
  for(let i=0;i<items.length;i++) items[i].classList.toggle("sel", i===sel);
}

export default {
  id:"hub", label:"THE SANCTUARY", accent:0x86e6a4,

  start(env){
    E=env; sel=0;
    const st=document.createElement("style"); st.textContent=CSS; env.host.appendChild(st);
    const wrap=document.createElement("div"); wrap.className="hub-wrap";
    wrap.innerHTML='<div class="hub-eyebrow">SELECT AN AREA</div>';
    items=[];
    env.rooms.forEach((r,i)=>{
      const a=document.createElement("a"); a.className="hub-item"; a.href="#";
      a.innerHTML=`<span class="car">▶</span><span class="lbl">${r.label}</span><span class="gl">${r.gloss||""}</span>`;
      a.addEventListener("mouseenter",()=>{ sel=i; paint(); });
      a.addEventListener("click",(e)=>{ e.preventDefault(); env.go(r.id); });
      wrap.appendChild(a); items.push(a);
    });
    env.host.appendChild(wrap);
    paint();
    gridCanvas=null;
  },

  onKey(e){
    if(e.key==="ArrowDown"){ e.preventDefault(); sel=(sel+1)%items.length; paint(); }
    else if(e.key==="ArrowUp"){ e.preventDefault(); sel=(sel-1+items.length)%items.length; paint(); }
    else if(e.key==="Enter"){ e.preventDefault(); E.go(E.rooms[sel].id); }
  },

  draw(t){
    const {ctx,size}=E, {iw,ih}=size;
    ctx.fillStyle="#07070f"; ctx.fillRect(0,0,iw,ih);
    // a quiet pulsing dot-grid
    const step=7;
    for(let y=step; y<ih; y+=step){
      for(let x=step; x<iw; x+=step){
        const ph=Math.sin(x*0.05+y*0.045 + (E.reduced?0:t*0.0009));
        const a=0.05+0.06*(0.5+0.5*ph);
        ctx.fillStyle="rgba(134,230,164,"+a.toFixed(3)+")";
        ctx.fillRect(x,y,1,1);
      }
    }
  },

  stop(){ E=null; items=[]; },
};
