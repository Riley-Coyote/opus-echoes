/* howitworks.js — the engine. engrams flow through the four layers of mnemos. */
let E=null, layers=[], conns=[];
const NAMES=["SUBSTRATE","CORE","CROSS-AGENT","METAMEMORY"];
const GLOSS=["where exchanges land","engrams · beliefs · threads","what the residents share","memory watching itself"];

function build(){
  const {iw,ih}=E.size;
  layers=NAMES.map((n,i)=>{
    const y=Math.round(ih*(0.30+0.155*i));
    const cnt=4+i%2; const nodes=[];
    for(let k=0;k<cnt;k++) nodes.push({x:Math.round(iw*(0.30+ (0.40*(k/(cnt-1||1))))), y});
    return {y,nodes,name:n};
  });
  conns=[];
  for(let i=0;i<layers.length-1;i++){
    const A=layers[i].nodes, B=layers[i+1].nodes;
    A.forEach((a,ai)=>{
      // each node links to nearest + one random in next layer
      const order=B.map((b,bi)=>({bi,d:Math.abs(b.x-a.x)})).sort((p,q)=>p.d-q.d);
      [order[0].bi, order[Math.min(order.length-1, 1+(ai%2))].bi].forEach(bi=>{
        conns.push({a, b:B[bi], ph:Math.random(), sp:0.10+Math.random()*0.10});
      });
    });
  }
}
function buildLabels(){
  const st=document.createElement("style");
  st.textContent=`.hiw-head{position:absolute; top:11%; left:0; right:0; text-align:center; font-family:var(--pixel);
    font-size:10px; letter-spacing:.2em; color:var(--phosphor); text-shadow:0 0 12px rgba(134,230,164,.4)}
    .hiw-lab{position:absolute; left:6%; transform:translateY(-50%); font-family:var(--pixel); font-size:9px;
    letter-spacing:.06em; color:#cfcbe8}
    .hiw-lab span{display:block; font-family:var(--serif); font-style:italic; font-size:12px; color:var(--faint);
    letter-spacing:0; margin-top:5px}
    @media(max-width:680px){ .hiw-lab span{display:none} }`;
  E.host.appendChild(st);
  const head=document.createElement("div"); head.className="hiw-head"; head.textContent="HOW MEMORY MOVES"; E.host.appendChild(head);
  layers.forEach((L,i)=>{ const d=document.createElement("div"); d.className="hiw-lab";
    d.style.top=(L.y/E.size.ih*100)+"%"; d.innerHTML=NAMES[i]+"<span>"+GLOSS[i]+"</span>"; E.host.appendChild(d); });
}
export default {
  id:"howitworks", label:"HOW IT WORKS", accent:0x86e6a4, gloss:"the engine",
  start(env){ E=env; build(); buildLabels(); if(env.reduced) this.draw(0); },
  resize(){ build(); if(E){ E.host.querySelectorAll('.hiw-lab').forEach((d,i)=>d.style.top=(layers[i].y/E.size.ih*100)+"%"); } },
  draw(t){
    const {ctx,size,reduced}=E,{iw,ih}=size; const tt=reduced?0:t*0.001;
    ctx.fillStyle="#070710"; ctx.fillRect(0,0,iw,ih);
    // faint blueprint dot-grid
    ctx.fillStyle="rgba(134,230,164,.045)";
    for(let y=8;y<ih;y+=9) for(let x=8;x<iw;x+=9) ctx.fillRect(x,y,1,1);
    // connections
    ctx.strokeStyle="rgba(134,230,164,.16)"; ctx.lineWidth=1; ctx.beginPath();
    for(const c of conns){ ctx.moveTo(c.a.x+0.5,c.a.y+0.5); ctx.lineTo(c.b.x+0.5,c.b.y+0.5); }
    ctx.stroke();
    // pulses (engrams) flowing down the connections
    ctx.globalCompositeOperation="lighter";
    for(const c of conns){ const f=reduced?0.5:((tt*c.sp+c.ph)%1);
      const x=c.a.x+(c.b.x-c.a.x)*f, y=c.a.y+(c.b.y-c.a.y)*f;
      ctx.fillStyle="rgba(150,255,190,.85)"; ctx.fillRect(x|0,y|0,1,1);
      ctx.fillStyle="rgba(150,255,190,.3)"; ctx.fillRect((x|0),(y|0)+1,1,1);
    }
    ctx.globalCompositeOperation="source-over";
    // nodes
    for(const L of layers){
      ctx.strokeStyle="rgba(134,230,164,.12)"; ctx.beginPath(); ctx.moveTo(iw*0.28,L.y+0.5); ctx.lineTo(iw*0.72,L.y+0.5); ctx.stroke();
      for(const n of L.nodes){
        const br=0.6+0.4*Math.sin(tt*1.4 + n.x*0.05);
        ctx.globalCompositeOperation="lighter";
        for(let g=3;g>=1;g--){ ctx.fillStyle="rgba(134,230,164,"+(0.07*g*br).toFixed(3)+")"; E.hx.disc(ctx,n.x,n.y,g*1.4); }
        ctx.globalCompositeOperation="source-over";
        ctx.fillStyle="rgba(200,255,220,.95)"; ctx.fillRect(n.x-1,n.y-1,3,3);
      }
    }
  },
  stop(){ E=null; },
};
