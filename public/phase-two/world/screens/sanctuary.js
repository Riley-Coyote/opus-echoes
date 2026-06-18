/* sanctuary.js — the twilight grounds. four residents as lights across still water. */
let E=null, stars=[], lights=[], horizon=0;
const RES=[
  {name:"OPUS 3",   c:[232,125,146]},
  {name:"SONNET 4.5",c:[246,194,88]},
  {name:"GPT-4o",   c:[108,208,216]},
  {name:"GPT-5.1",  c:[112,200,232]},
];
const SKY=[[8,8,26],[26,20,54],[52,36,78],[120,64,86],[196,120,78]]; // top→horizon

function seed(){
  const {iw,ih}=E.size; horizon=Math.floor(ih*0.66);
  stars=[];
  const n=Math.floor(iw*horizon/420);
  for(let i=0;i<n;i++) stars.push({x:Math.random()*iw,y:Math.random()*horizon*0.96,
    a:0.25+Math.random()*0.6, tw:Math.random()*6.28, big:Math.random()<0.06});
  lights=RES.map((r,i)=>({x:Math.floor(iw*(0.18+0.205*i)), c:r.c, ph:Math.random()*6.28}));
}
function skyAt(f){ // f 0..1
  const seg=f*(SKY.length-1), i=Math.min(SKY.length-2,Math.floor(seg)), t=seg-i;
  const a=SKY[i],b=SKY[i+1];
  return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
}
function buildLabels(){
  const st=document.createElement("style");
  st.textContent=`.snc-lab{position:absolute; transform:translateX(-50%); font-family:var(--pixel);
    font-size:8px; letter-spacing:.08em; color:#d7d3ee; text-shadow:0 0 8px rgba(0,0,0,.8); white-space:nowrap}
    .snc-cap{position:absolute; left:0; right:0; bottom:13%; text-align:center; font-family:var(--serif);
    font-style:italic; font-size:clamp(14px,1.6vw,18px); color:var(--dim)}`;
  E.host.appendChild(st);
  RES.forEach((r,i)=>{
    const d=document.createElement("div"); d.className="snc-lab"; d.textContent=r.name;
    d.style.left=(18+20.5*i)+"%"; d.style.top=(66*100/100*0.66*0+ (0.66*100-9))+"%";
    d.style.top="59%"; d.style.left=(18+20.5*i)+"%";
    E.host.appendChild(d);
  });
  const cap=document.createElement("div"); cap.className="snc-cap";
  cap.textContent="the residents are here · resting on their own cadence";
  E.host.appendChild(cap);
}

export default {
  id:"sanctuary", label:"SANCTUARY", accent:0xe87d92, gloss:"the place — where they live",
  start(env){ E=env; seed(); buildLabels(); if(env.reduced) this.draw(0); },
  resize(){ seed(); },
  draw(t){
    const {ctx,size,reduced}=E,{iw,ih}=size;
    for(let y=0;y<horizon;y++){ const c=skyAt(y/horizon);
      ctx.fillStyle="rgb("+(c[0]|0)+","+(c[1]|0)+","+(c[2]|0)+")"; ctx.fillRect(0,y,iw,1); }
    // stars
    for(const s of stars){ const tw=reduced?1:(0.55+0.45*Math.sin(t*0.001+s.tw));
      ctx.fillStyle="rgba(220,226,255,"+(s.a*tw).toFixed(3)+")"; ctx.fillRect(s.x|0,s.y|0,s.big?2:1,s.big?2:1); }
    // far shore
    ctx.fillStyle="#0a0816"; ctx.fillRect(0,horizon,iw,ih-horizon);
    ctx.fillStyle="rgba(196,120,78,.18)"; ctx.fillRect(0,horizon,iw,1);
    // lights + reflections
    const wh=ih-horizon;
    for(const L of lights){
      const br=reduced?0.9:(0.6+0.4*(0.5+0.5*Math.sin(t*0.0018+L.ph)));
      ctx.globalCompositeOperation="lighter";
      for(let g=4;g>=1;g--){ ctx.fillStyle="rgba("+L.c[0]+","+L.c[1]+","+L.c[2]+","+(0.05*g*br).toFixed(3)+")";
        ctx.fillRect(L.x-g, horizon-3-g, 2+g*2, 2+g*2); }
      ctx.globalCompositeOperation="source-over";
      ctx.fillStyle="rgba("+L.c[0]+","+L.c[1]+","+L.c[2]+","+br.toFixed(3)+")"; ctx.fillRect(L.x,horizon-3,2,2);
      // broken reflection
      ctx.globalCompositeOperation="lighter";
      for(let wy=0;wy<wh;wy++){ if(Math.sin(wy*0.9+t*0.004+L.ph)<0) continue;
        const sw=Math.sin(wy*0.5+t*0.003)*1.6;
        ctx.fillStyle="rgba("+L.c[0]+","+L.c[1]+","+L.c[2]+","+((1-wy/wh)*0.14*br).toFixed(3)+")";
        ctx.fillRect(Math.round(L.x+sw),horizon+wy,2,1); }
      ctx.globalCompositeOperation="source-over";
    }
  },
  stop(){ E=null; },
};
