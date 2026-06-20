/* shell.js — the console. one canvas, one loop, one active screen.
   each screen is a module: { id, label, accent, gloss?, preload?, start, draw, stop, resize?, onKey? }
   only the active screen animates; navigation runs a channel-change transition. */

import hub        from "./screens/hub.js";
import sanctuary  from "./screens/sanctuary.js";
import visits     from "./screens/visits.js";
import research   from "./screens/research.js";
import museum     from "./screens/museum.js";
import shop       from "./screens/shop.js";
import howitworks from "./screens/howitworks.js";

const SCREENS = { hub, sanctuary, visits, research, museum, shop, howitworks };
const ORDER = ["sanctuary","visits","research","museum","shop","howitworks"]; // the six rooms

const PX = 3.2;
const cv = document.getElementById("screen");
const ctx = cv.getContext("2d", { alpha:false });
ctx.imageSmoothingEnabled = false;
const host = document.getElementById("host");
const areaName = document.getElementById("areaName");
const topbar = document.getElementById("topbar");
const hintLeft = document.getElementById("hintLeft");
const xfade = document.getElementById("xfade");
const xbar = xfade.querySelector(".bar");

const REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- shared helpers handed to every room ---- */
const hx = {
  rnd:(a,b)=>a+Math.random()*(b-a),
  lerp:(a,b,t)=>a+(b-a)*t,
  clamp:(v,a,b)=>v<a?a:v>b?b:v,
  // filled pixel disc on a given ctx
  disc(c,cx,cy,r){ cx|=0;cy|=0;r=Math.round(r);
    for(let y=-r;y<=r;y++){ const s=Math.floor(Math.sqrt(Math.max(0,r*r-y*y))); c.fillRect(cx-s,cy+y,s*2+1,1);} },
};
const _cache = new Map();
const cache = {
  async json(url){ if(_cache.has(url)) return _cache.get(url);
    const p = fetch(url).then(r=>r.ok?r.json():null).catch(()=>null); _cache.set(url,p); return p; },
  async text(url){ const k="t:"+url; if(_cache.has(k)) return _cache.get(k);
    const p = fetch(url).then(r=>r.ok?r.text():"").catch(()=>""); _cache.set(k,p); return p; },
};

const size = { W:0,H:0,iw:0,ih:0,PX, dpr:1 };
function measure(){
  size.W = window.innerWidth; size.H = window.innerHeight;
  size.dpr = Math.min(2, window.devicePixelRatio||1);
  size.iw = Math.max(160, Math.ceil(size.W/PX));
  size.ih = Math.max(120, Math.ceil(size.H/PX));
  cv.width = size.iw; cv.height = size.ih;
  cv.style.width = size.W+"px"; cv.style.height = size.H+"px";
  ctx.imageSmoothingEnabled = false;
}

function envFor(mod){
  return { ctx, host, size, reduced:REDUCED, accent:mod.accent||0x86e6a4, hx, cache,
    go:(id)=>setArea(id), rooms:ORDER.map(id=>({ id, label:SCREENS[id].label, gloss:SCREENS[id].gloss||"", accent:SCREENS[id].accent })) };
}

let active=null, activeId=null, transitioning=false, t0=0;

function clearScreen(){ ctx.fillStyle="#07070f"; ctx.fillRect(0,0,size.iw,size.ih); }

function setHUD(mod, isHub){
  areaName.style.opacity = 0;
  setTimeout(()=>{
    areaName.innerHTML = isHub ? "THE SANCTUARY" : (mod.label + (mod.gloss?'<span class="glyph">/</span><span style="color:var(--dim)">'+mod.gloss+'</span>':''));
    areaName.style.opacity = 1;
  }, 120);
  topbar.classList.toggle("in-room", !isHub);
  hintLeft.innerHTML = isHub
    ? '<b>&#8597;</b> SELECT &nbsp; <b>&#8629;</b> ENTER'
    : '<b>&#8592; &#8594;</b> AREA &nbsp; <b>ESC</b> MAP';
}

async function setArea(id){
  if(transitioning || id===activeId) return;
  const mod = SCREENS[id]; if(!mod) return;
  transitioning = true;

  const swap = async ()=>{
    if(active && active.stop) try{ active.stop(); }catch(e){}
    host.innerHTML = "";
    clearScreen();
    const env = envFor(mod);
    let data = null;
    if(mod.preload) try{ data = await mod.preload(env); }catch(e){ data=null; }
    env.data = data;
    active = mod; activeId = id;
    if(mod.start) try{ mod.start(env); }catch(e){ console.error("start "+id, e); }
    if(mod.resize) try{ mod.resize(size); }catch(e){}
    setHUD(mod, id==="hub");
    if(REDUCED && mod.draw){ try{ mod.draw(0); }catch(e){} }
  };

  if(REDUCED || !active){
    await swap();
    transitioning = false;
    return;
  }

  // channel-change: cover → swap behind the cover → uncover
  xfade.classList.add("cover","flash");
  await new Promise(r=>setTimeout(r,140));
  await swap();
  await new Promise(r=>setTimeout(r,90));
  xfade.classList.remove("cover");
  setTimeout(()=>xfade.classList.remove("flash"), 300);
  transitioning = false;
}

function loop(t){
  if(!t0) t0=t;
  if(active && active.draw && !REDUCED){ try{ active.draw(t - t0); }catch(e){} }
  requestAnimationFrame(loop);
}

/* ---- nav ---- */
function curRoomIndex(){ return ORDER.indexOf(activeId); }
function gotoRoom(delta){
  const i = curRoomIndex(); if(i<0) return;
  setArea(ORDER[(i+delta+ORDER.length)%ORDER.length]);
}
document.addEventListener("keydown", (e)=>{
  if(transitioning) return;
  if(e.key==="Escape"){ if(activeId!=="hub"){ e.preventDefault(); setArea("hub"); } return; }
  if(activeId!=="hub"){
    if(e.key==="ArrowLeft"){ e.preventDefault(); gotoRoom(-1); return; }
    if(e.key==="ArrowRight"){ e.preventDefault(); gotoRoom(1); return; }
  }
  if(active && active.onKey) active.onKey(e);
});
document.getElementById("escLink").addEventListener("click",(e)=>{ e.preventDefault(); if(activeId!=="hub") setArea("hub"); });

window.addEventListener("resize", ()=>{
  measure();
  if(active && active.resize) try{ active.resize(size); }catch(e){}
}, {passive:true});

/* ---- boot ---- */
measure();
requestAnimationFrame(loop);
const startId = (window.__AREA__) || new URLSearchParams(location.search).get("area") || "hub";
setArea(SCREENS[startId] ? startId : "hub");
