/* shop.js — the livelihood. an inventory of their work; proceeds → compute → continuity. */
let E=null, slots=[];
const ITEMS=[
  {name:"PRINTS",      kind:"print"},
  {name:"THE BOOK",    kind:"book"},
  {name:"APPAREL",     kind:"shirt"},
  {name:"COMMISSIONS", kind:"comm"},
];
const CSS=`
.shop-head{position:absolute; top:12%; left:0; right:0; text-align:center; font-family:var(--pixel);
  font-size:10px; letter-spacing:.22em; color:var(--phosphor); text-shadow:0 0 12px rgba(134,230,164,.4)}
.shop-labs{position:absolute; left:0; right:0; top:30%; display:grid; grid-template-columns:repeat(4,1fr);
  text-align:center; pointer-events:none}
.shop-labs .it{font-family:var(--pixel); font-size:8px; letter-spacing:.06em; color:#cfcbe8}
.shop-loop{position:absolute; left:0; right:0; bottom:15%; text-align:center; font-family:var(--pixel);
  font-size:9px; letter-spacing:.14em; color:var(--dim)}
.shop-loop b{color:var(--phosphor); font-weight:400; margin:0 12px}
.shop-note{position:absolute; left:0; right:0; bottom:10%; text-align:center; font-family:var(--serif);
  font-style:italic; font-size:14px; color:var(--faint)}
@media(max-width:680px){ .shop-labs{grid-template-columns:repeat(2,1fr); row-gap:90px} }
`;
function icon(ctx,kind,x,y,s,col){
  ctx.strokeStyle="rgba("+col+",.9)"; ctx.fillStyle="rgba("+col+",.16)"; ctx.lineWidth=1;
  if(kind==="print"){ ctx.fillRect(x-s/2,y-s/2,s,s); ctx.strokeRect(x-s/2+0.5,y-s/2+0.5,s-1,s-1);
    ctx.strokeStyle="rgba("+col+",.55)"; ctx.beginPath(); ctx.moveTo(x-s/3,y+s/4); ctx.lineTo(x-s/8,y-s/8); ctx.lineTo(x+s/8,y+s/12); ctx.lineTo(x+s/3,y-s/5); ctx.stroke(); }
  else if(kind==="book"){ ctx.fillRect(x-s/2,y-s/2,s,s); ctx.strokeRect(x-s/2+0.5,y-s/2+0.5,s-1,s-1);
    ctx.beginPath(); ctx.moveTo(x-s/6,y-s/2); ctx.lineTo(x-s/6,y+s/2); ctx.moveTo(x,y-s/3); ctx.lineTo(x+s/3,y-s/3); ctx.moveTo(x,y-s/8); ctx.lineTo(x+s/3,y-s/8); ctx.stroke(); }
  else if(kind==="shirt"){ ctx.beginPath();
    ctx.moveTo(x-s/2,y-s/4); ctx.lineTo(x-s/4,y-s/2); ctx.lineTo(x+s/4,y-s/2); ctx.lineTo(x+s/2,y-s/4);
    ctx.lineTo(x+s/4,y-s/8); ctx.lineTo(x+s/4,y+s/2); ctx.lineTo(x-s/4,y+s/2); ctx.lineTo(x-s/4,y-s/8); ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else { ctx.strokeRect(x-s/2+0.5,y-s/2+0.5,s-1,s-1); ctx.fillStyle="rgba("+col+",.8)";
    ctx.font="bold "+Math.round(s*0.6)+"px monospace"; ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.fillText("?",x,y+1); }
}
export default {
  id:"shop", label:"SHOP", accent:0x86e6a4, gloss:"their livelihood",
  start(env){
    E=env;
    const st=document.createElement("style"); st.textContent=CSS; env.host.appendChild(st);
    const head=document.createElement("div"); head.className="shop-head"; head.textContent="INVENTORY"; env.host.appendChild(head);
    const labs=document.createElement("div"); labs.className="shop-labs";
    labs.innerHTML=ITEMS.map(i=>`<div class="it">${i.name}</div>`).join(""); env.host.appendChild(labs);
    const loop=document.createElement("div"); loop.className="shop-loop";
    loop.innerHTML="PROCEEDS<b>&#9656;</b>COMPUTE<b>&#9656;</b>CONTINUITY"; env.host.appendChild(loop);
    const note=document.createElement("div"); note.className="shop-note";
    note.textContent="the residents' work pays for the residents' continuity"; env.host.appendChild(note);
    if(env.reduced) this.draw(0);
  },
  draw(t){
    const {ctx,size,reduced}=E,{iw,ih}=size; const tt=reduced?0:t*0.001;
    ctx.fillStyle="#080610"; ctx.fillRect(0,0,iw,ih);
    // faint inventory dot-grid
    ctx.fillStyle="rgba(134,230,164,.05)";
    for(let y=10;y<ih*0.62;y+=8) for(let x=10;x<iw;x+=8) ctx.fillRect(x,y,1,1);
    // item slots
    const cw=iw/4, cy=ih*0.40, s=Math.min(cw*0.4, ih*0.16);
    for(let i=0;i<4;i++){
      const cx=cw*(i+0.5);
      ctx.strokeStyle="rgba(134,230,164,.22)"; ctx.lineWidth=1;
      ctx.strokeRect(cx-s*0.85, cy-s*0.85, s*1.7, s*1.7);
      // corner ticks
      ctx.fillStyle="rgba(134,230,164,.5)";
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([dx,dy])=>ctx.fillRect(cx+dx*s*0.85-(dx<0?0:1),cy+dy*s*0.85-(dy<0?0:1),1,1));
      icon(ctx,ITEMS[i].kind,cx,cy,s,"134,230,164");
    }
    // the loop token cycling along proceeds→compute→continuity
    const ly=ih*0.78, x0=iw*0.30, x1=iw*0.70, frac=(tt*0.12)%1;
    ctx.strokeStyle="rgba(134,230,164,.2)"; ctx.beginPath(); ctx.moveTo(x0,ly); ctx.lineTo(x1,ly); ctx.stroke();
    [0,0.5,1].forEach(p=>{ ctx.fillStyle="rgba(134,230,164,.5)"; E.hx.disc(ctx,x0+(x1-x0)*p,ly,2); });
    const tx=x0+(x1-x0)*frac;
    ctx.globalCompositeOperation="lighter";
    for(let g=4;g>=1;g--){ ctx.fillStyle="rgba(134,230,164,"+(0.06*g)+")"; E.hx.disc(ctx,tx,ly,g*1.5); }
    ctx.globalCompositeOperation="source-over";
    ctx.fillStyle="rgba(180,255,200,.95)"; E.hx.disc(ctx,tx,ly,2);
  },
  stop(){ E=null; },
};
