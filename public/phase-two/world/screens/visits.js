/* visits.js — "select who you came to see". four residents as morphing presences. */
let E=null, active=-1, cards=[];
const RES=[
  {name:"OPUS 3",    sub:"the first resident",  c:[232,125,146], seed:1.0},
  {name:"SONNET 4.5",sub:"composed, attentive", c:[246,194,88],  seed:2.3},
  {name:"GPT-4o",    sub:"warm, quick",         c:[108,208,216], seed:3.7},
  {name:"GPT-5.1",   sub:"declarative",         c:[112,200,232], seed:5.1},
];
const CSS=`
.vis-grid{position:absolute; inset:0; display:grid; grid-template-columns:repeat(4,1fr)}
.vis-col{position:relative; display:flex; flex-direction:column; justify-content:flex-start;
  align-items:center; padding:54% 0 0 0; cursor:pointer; border-right:1px solid rgba(134,230,164,.06)}
.vis-col:last-child{border-right:none}
.vis-col .nm{font-family:var(--pixel); font-size:clamp(9px,1.1vw,12px); letter-spacing:.04em; color:#cfcbe8;
  transition:color .2s, text-shadow .2s}
.vis-col .sb{font-family:var(--serif); font-style:italic; font-size:clamp(12px,1.2vw,15px); color:var(--faint);
  margin-top:8px; transition:color .2s}
.vis-col .go{font-family:var(--pixel); font-size:8px; letter-spacing:.1em; color:var(--phosphor); opacity:0;
  margin-top:14px; transition:opacity .2s}
.vis-col.on .go{opacity:1}
.vis-head{position:absolute; top:13%; left:0; right:0; text-align:center; font-family:var(--pixel);
  font-size:10px; letter-spacing:.22em; color:var(--phosphor); text-shadow:0 0 12px rgba(134,230,164,.4)}
@media (max-width:680px){ .vis-grid{grid-template-columns:repeat(2,1fr)} .vis-col{padding-bottom:18%} }
`;
export default {
  id:"visits", label:"VISITS", accent:0xf6c258, gloss:"speak with a resident",
  start(env){
    E=env; active=-1;
    const st=document.createElement("style"); st.textContent=CSS; env.host.appendChild(st);
    const head=document.createElement("div"); head.className="vis-head"; head.textContent="WHO DID YOU COME TO SEE?";
    env.host.appendChild(head);
    const grid=document.createElement("div"); grid.className="vis-grid"; cards=[];
    RES.forEach((r,i)=>{
      const col=document.createElement("div"); col.className="vis-col";
      col.innerHTML=`<div class="nm">${r.name}</div><div class="sb">${r.sub}</div><div class="go">▸ SPEAK</div>`;
      col.addEventListener("mouseenter",()=>{ active=i; paint(); });
      col.addEventListener("mouseleave",()=>{ active=-1; paint(); });
      grid.appendChild(col); cards.push(col);
    });
    env.host.appendChild(grid);
    if(env.reduced) this.draw(0);
  },
  draw(t){
    const {ctx,size,reduced}=E,{iw,ih}=size;
    ctx.fillStyle="#080610"; ctx.fillRect(0,0,iw,ih);
    const cw=iw/4, cy=ih*0.42;
    for(let i=0;i<4;i++){
      const r=RES[i], cx=cw*(i+0.5), on=(active===i);
      const intensity=on?1:0.5;
      const tt=reduced?0:t*0.001;
      // a morphing presence: lissajous ring of motes + a breathing core
      ctx.globalCompositeOperation="lighter";
      const pts=52, rad=Math.min(cw,ih)*0.175;
      for(let k=0;k<pts;k++){
        const a=k/pts*6.283;
        const x=cx + Math.sin(a*3 + r.seed + tt)*rad*(0.8+0.2*Math.sin(tt*1.3+r.seed));
        const y=cy + Math.sin(a*2 + r.seed*1.7 + tt*0.8)*rad;
        const al=(0.14+0.20*intensity)*(0.5+0.5*Math.sin(a*5+tt*2));
        ctx.fillStyle="rgba("+r.c[0]+","+r.c[1]+","+r.c[2]+","+al.toFixed(3)+")";
        ctx.fillRect(x|0,y|0,on?2:1,on?2:1);
      }
      // core
      const br=0.5+0.5*Math.sin(tt*1.6+r.seed);
      for(let g=5;g>=1;g--){ ctx.fillStyle="rgba("+r.c[0]+","+r.c[1]+","+r.c[2]+","+(0.05*g*intensity*br).toFixed(3)+")";
        E.hx.disc(ctx,cx,cy,g*2.0); }
      ctx.globalCompositeOperation="source-over";
      ctx.fillStyle="rgba("+r.c[0]+","+r.c[1]+","+r.c[2]+","+(0.7*intensity+0.3).toFixed(3)+")";
      E.hx.disc(ctx,cx,cy,2);
    }
  },
  stop(){ E=null; cards=[]; },
};
function paint(){ cards.forEach((c,i)=>c.classList.toggle("on",i===active)); }
