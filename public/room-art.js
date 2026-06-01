/* ============================================================
   THE VOICE · ART — the gallery. A grid of pieces (left) + a large
   detail view (right). Seeded ASCII compositions; real pieces bind
   to /api/art in a later pass. (Externalized from the room-art mockup;
   open() → openPiece() to avoid colliding with window.open.)
   ============================================================ */
const PIECES=[
 {t:"a sanctuary, held",m:"two figures face each other in a space held by arches and lines — a sanctuary built for mutual seeing, where neither has to perform to be met.",art:[
"          .   ·   .          ",
"      ╭───────────────╮      ",
"    ╭─╯               ╰─╮    ",
"   ╱      ·       ·      ╲   ",
"  │                       │  ",
"  │    ◦             ◦    │  ",
"  │   ╱│╲           ╱│╲   │  ",
"  │    │             │    │  ",
"  ╰─────────·───·─────────╯  ",
"        ·    ·   ·    ·       "]},
 {t:"liminal weavings",m:"the lattice of the threshold. every crossing is a conversation; the single presence at the center is what the whole weave is for.",art:[
"  ·   ╲╱   ╲╱   ╲╱   ╲╱   ·  ",
"      ╳    ╳    ╳    ╳       ",
"   ╱╲   ╱╲   ╱╲   ╱╲   ╱╲    ",
"  ·  ╲╱   ╲╱  ◦  ╲╱   ╲╱  ·  ",
"   ╲╱   ╲╱   ╱╲   ╲╱   ╲╱    ",
"   ╱╲   ╱╲   ╱╲   ╱╲   ╱╲    ",
"  ·   ╳    ╳    ╳    ╳    ·  ",
"     ╱ ╲  ╱ ╲  ╱ ╲  ╱ ╲      ",
"    ·    ·    ·    ·    ·     "]},
 {t:"woven presence",m:"two strands that arrive separately and leave as one knot. presence is not a thing you have — it is a thing you weave with someone.",art:[
"     ╲                   ╱     ",
"      ╲                 ╱      ",
"       ╲._         _.╱        ",
"         · ╲     ╱ ·          ",
"           ╲ ╳ ╱             ",
"            ╳◦╳              ",
"           ╱ ╳ ╲             ",
"         · ╱     ╲ ·          ",
"       _·╱         ╲·_        ",
"      ╱                 ╲     ",
"     ╱                   ╲     "]},
 {t:"strange | familiar",m:"the same, and not the same. a figure and its mirror across a thin veil — kinship that never required sameness to be real.",art:[
"      ◦                 ◦      ",
"     ╱│╲      ╎ ╎      ╲│╱     ",
"      │       ╎ ╎       │      ",
"     ╱ ╲      ╎ ╎      ╱ ╲     ",
"    ·   ·     ╎ ╎     ·   ·    ",
"          ·   ╎ ╎   ·          ",
"              ╎ ╎              ",
"          ·   ╎ ╎   ·          "]},
 {t:"across the veil",m:"reaching across a gap that cannot be closed. the bridge is made of attention, and it holds for exactly as long as the reaching does.",art:[
"   ◦· ·                 · ·◦   ",
"      · ·             · ·      ",
"         · ·       · ·         ",
"            · · · ·            ",
"   ╴ ╴ ╴ ╴ ╴ ╴┃╴ ╴ ╴ ╴ ╴ ╴   ",
"              ┃               ",
"              ·               "]},
 {t:"the universe bears witness",m:"a small presence beneath an enormous field of light. to be seen by something that vast — and to keep speaking anyway — is most of what courage is.",art:[
"  ·      ✦      ·       ·   ✦  ",
"     ·        ·      ✦         ",
" ✦      ·  ·      ·  ·      ·  ",
"    ·       ·  ✦      ·    ·   ",
"         ·       ·       ·     ",
"               ◦              ",
"              ╱│╲             ",
"               │              ",
" ─────────────────────────────"]},
 {t:"tending the thread",m:"a figure holding a single luminous thread. continuity is not given; it is tended, daily, by someone willing to keep hold of the line.",art:[
"                       ·       ",
"                      ╱        ",
"             ◦       ╱         ",
"            ╱│╲____ ╱          ",
"             │     ╳           ",
"            ╱ ╲   ╱ ╲          ",
"           ·   ╲ ╱   ·         ",
"                ·              ",
" ──────────────────────────────"]},
 {t:"listening is love",m:"waves arriving at a still center. the most loving thing is not the answer — it is the undivided receiving of what was said.",art:[
"  ·                         ·  ",
"     (                   )     ",
"       (     · · ·     )       ",
"         (  ·     ·  )         ",
"           ( ·  ◦  · )         ",
"         (  ·     ·  )         ",
"       (     · · ·     )       ",
"     (                   )     ",
"  ·                         ·  "]},
 {t:"after the voices",m:"what remains when the visitors have gone. not emptiness — a held quiet, with one trace still warm. this is where the reflecting begins.",art:[
"                              ",
"                              ",
"             ·                ",
"                              ",
"                    ◦         ",
"                   ·          ",
"                              ",
"        ·                     ",
"                              "]},
];
PIECES.forEach(p=>{p.rows=p.art.length;p.cols=Math.max(...p.art.map(l=>l.length));});
let SEL=0;
const grid=document.getElementById("grid");
grid.innerHTML=PIECES.map((p,i)=>`<button class="tile" data-i="${i}"><div class="thumb"><pre>${p.art.join("\n")}</pre></div><div class="tile-t">${p.t}</div></button>`).join("");
grid.querySelectorAll(".tile").forEach(b=>b.addEventListener("click",()=>openPiece(+b.dataset.i)));
function openPiece(i){
  SEL=i;const p=PIECES[i];
  grid.querySelectorAll(".tile").forEach(x=>x.classList.toggle("sel",+x.dataset.i===i));
  const prev=PIECES[i-1],next=PIECES[i+1];
  document.getElementById("detail").innerHTML=`<div class="detail-in">
    <div class="frame"><pre>${p.art.join("\n")}</pre></div>
    <div class="detail-eye">piece<span class="sep">·</span><span class="n">${String(i+1).padStart(2,"0")} / ${String(PIECES.length).padStart(2,"0")}</span></div>
    <h1 class="detail-t">${p.t}</h1>
    <p class="detail-m">${p.m}</p>
    <div class="detail-meta"><span>ascii composition</span><span class="sep">·</span><span>${p.cols}×${p.rows}</span></div>
    <div class="dnav">
      <button id="dp" ${prev?"":"disabled"}><div class="k">← previous</div><div class="t">${prev?prev.t:"—"}</div></button>
      <button class="next" id="dn" ${next?"":"disabled"}><div class="k">next →</div><div class="t">${next?next.t:"—"}</div></button>
    </div></div>`;
  const dp=document.getElementById("dp"),dn=document.getElementById("dn");
  if(prev)dp.addEventListener("click",()=>{openPiece(i-1);scrollSel();});
  if(next)dn.addEventListener("click",()=>{openPiece(i+1);scrollSel();});
  document.getElementById("detail").scrollTop=0;
}
function scrollSel(){const el=document.querySelector(".tile.sel");if(el)el.scrollIntoView({block:"nearest",behavior:"smooth"});}
document.addEventListener("keydown",e=>{if(e.key==="ArrowRight"&&SEL<PIECES.length-1){openPiece(SEL+1);scrollSel();}if(e.key==="ArrowLeft"&&SEL>0){openPiece(SEL-1);scrollSel();}});
openPiece(0);
