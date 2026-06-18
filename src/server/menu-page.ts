/**
 * renderMenuPage — a UI/UX mockup of a retro "start screen" front door.
 *
 * The live homepage's bento box, reimagined as a Super Mario / RPG main menu:
 * the same pixel-art wallpaper (sanctuary-cliff.png, CRT scanlines), with a
 * centered, pixel-font menu of the project's surfaces. White by default; the
 * active item (hover OR keyboard focus) turns the green state accent and gains
 * a `▸` cursor + `[ ]` brackets. Arrow-key + Enter navigation. Selecting an
 * item plays a Mario-style pixelated mosaic-to-black, holds on the chosen name,
 * then reveals back from black.
 *
 * Mockup only — every link is a stub (`href="#"`); nothing navigates. Served
 * self-contained (own CSS + inline JS), opting out of the resident presence
 * layer via `{ presence:false }` in the route handler.
 */

const ITEMS = [
  "Sanctuary",
  "Chat",
  "Museum",
  "Research",
  "Projects",
  "Shop",
  "Info",
];

export function renderMenuPage(): string {
  const itemsHtml = ITEMS.map(
    (label, i) =>
      `<a class="item${i === 0 ? " active" : ""}" href="#" data-label="${label}" role="menuitem" tabindex="${i === 0 ? 0 : -1}">` +
      `<span class="br br-l" aria-hidden="true">[</span>` +
      `<span class="lbl">${label}</span>` +
      `<span class="br br-r" aria-hidden="true">]</span>` +
      `</a>`,
  ).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#0e0e11">
<title>Mnemos &middot; menu</title>
<script>document.documentElement.classList.add('js')</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0e11;
  --ink:#F4F3F0;                       /* default menu white */
  --ink-soft:rgba(244,243,240,.62);
  --state:#82b484;                     /* the single green accent */
  --state-glow:rgba(130,180,132,.55);
  --faint:rgba(220,219,216,.34);
  --pixel:'Press Start 2P',monospace;
  --mono:'JetBrains Mono','SF Mono',monospace;
  --ease:cubic-bezier(.22,1,.36,1);
}
*,*::before,*::after{ margin:0; padding:0; box-sizing:border-box; }
html,body{ height:100%; }
html{ -webkit-text-size-adjust:100%; }
body{ background:var(--bg); color:var(--ink); font-family:var(--mono);
  -webkit-font-smoothing:antialiased; -moz-osx-font-smoothing:grayscale;
  overflow:hidden; min-height:100dvh; }

/* ── the wallpaper · pixel-art Sanctuary cliff (mirrors mnemos-home term__bg) ── */
.wall{ position:fixed; inset:0; width:100%; height:100%;
  object-fit:cover; object-position:center;
  image-rendering:pixelated; image-rendering:-moz-crisp-edges; image-rendering:crisp-edges;
  z-index:0; opacity:0; animation: mn-fade 1200ms var(--ease) 120ms forwards; }
@keyframes mn-fade{ from{ opacity:0 } to{ opacity:1 } }

/* layered scrim · a darker central pool so the pixel menu reads, plus an edge
   vignette and top/bottom fades down to --bg */
.scrim{ position:fixed; inset:0; z-index:1; pointer-events:none;
  background:
    radial-gradient(ellipse 64% 56% at 50% 48%, rgba(6,7,10,.74) 0%, rgba(6,7,10,.56) 34%, rgba(6,7,10,.3) 62%, transparent 82%),
    radial-gradient(140% 110% at 50% 50%, transparent 0%, transparent 42%, rgba(6,7,10,.46) 86%, rgba(6,7,10,.78) 100%),
    linear-gradient(180deg, rgba(6,7,10,.5) 0%, transparent 16%, transparent 60%, rgba(14,14,17,.6) 88%, #0e0e11 100%); }
/* a barely-there CRT scanline */
.scan{ position:fixed; inset:0; z-index:2; pointer-events:none;
  background:repeating-linear-gradient(180deg, rgba(255,255,255,.018) 0 1px, transparent 1px 3px);
  mix-blend-mode:overlay; opacity:.5; }

/* ── the screen · centered start-menu column ─────────────────────────────── */
.screen{ position:relative; z-index:3; min-height:100dvh;
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:clamp(28px,5vh,52px); padding:clamp(40px,8vh,96px) clamp(20px,5vw,48px);
  text-align:center; }
/* a soft dark "stage" behind the centered column so the menu always reads,
   without dimming the whole pixel-art frame */
.screen::before{ content:""; position:absolute; left:50%; top:50%;
  transform:translate(-50%,-50%); width:min(760px,90vw); height:min(680px,84vh);
  z-index:-1; pointer-events:none; filter:blur(8px);
  background:radial-gradient(ellipse 58% 54% at 50% 50%,
    rgba(6,7,10,.78) 0%, rgba(6,7,10,.6) 40%, rgba(6,7,10,.28) 66%, transparent 84%); }

.brandline{ display:flex; flex-direction:column; align-items:center; gap:14px; }
.title{ font-family:var(--pixel); font-size:clamp(22px,3.9vw,42px);
  letter-spacing:.05em; color:var(--ink); line-height:1;
  text-shadow:0 0 26px rgba(8,9,12,.92), 4px 4px 0 rgba(0,0,0,.55), 0 0 12px rgba(255,224,186,.16); }
.kicker{ font-family:var(--mono); font-size:10.5px; letter-spacing:.36em;
  text-transform:uppercase; color:rgba(228,227,223,.56);
  text-shadow:0 1px 3px rgba(0,0,0,.8);
  display:inline-flex; align-items:center; gap:12px; }
.kicker::before,.kicker::after{ content:""; width:22px; height:1px; background:rgba(228,227,223,.34); }

/* the menu list */
.menu{ display:flex; flex-direction:column; align-items:center;
  gap:clamp(15px,2.5vh,26px); }
.item{ display:inline-flex; align-items:baseline; gap:.62em;
  font-family:var(--pixel); font-size:clamp(13px,1.85vw,20px); line-height:1;
  color:var(--ink); text-decoration:none; cursor:pointer;
  padding:.28em .2em; position:relative;
  text-shadow:0 0 14px rgba(8,9,12,.92), 2px 2px 0 rgba(0,0,0,.62);
  transition:color 180ms var(--ease), text-shadow 180ms var(--ease), transform 180ms var(--ease);
  -webkit-tap-highlight-color:transparent; }
/* brackets occupy space always (opacity-toggled → no reflow) */
.br{ color:var(--state); opacity:0; transform:translateY(0);
  transition:opacity 180ms var(--ease), transform 180ms var(--ease); }
.br-l{ transform:translateX(4px); }
.br-r{ transform:translateX(-4px); }
.lbl{ transition:color 180ms var(--ease); }

/* active = hover OR keyboard-focus OR the roving-tabindex .active */
.item:hover, .item:focus-visible, .item.active{ outline:none; color:var(--state);
  text-shadow:0 0 20px var(--state-glow), 0 0 10px rgba(8,9,12,.85), 2px 2px 0 rgba(0,0,0,.62);
  transform:translateY(-1px); }
.item:hover .br, .item:focus-visible .br, .item.active .br{ opacity:1; transform:translateX(0); }

.cue{ font-family:var(--mono); font-size:10.5px; letter-spacing:.26em;
  text-transform:uppercase; color:rgba(228,227,223,.5);
  text-shadow:0 1px 3px rgba(0,0,0,.85); }
.cue b{ color:var(--ink); font-weight:500; }

/* ── load choreography (JS only) — items rise in sequence after the reveal ── */
.js .menu .item{ opacity:0; transform:translateY(10px); }
.js .menu.ready .item{ opacity:1; transform:none;
  transition:opacity 620ms var(--ease), transform 620ms var(--ease); }
.js .menu.ready .item:nth-child(1){ transition-delay:60ms }
.js .menu.ready .item:nth-child(2){ transition-delay:120ms }
.js .menu.ready .item:nth-child(3){ transition-delay:180ms }
.js .menu.ready .item:nth-child(4){ transition-delay:240ms }
.js .menu.ready .item:nth-child(5){ transition-delay:300ms }
.js .menu.ready .item:nth-child(6){ transition-delay:360ms }
.js .menu.ready .item:nth-child(7){ transition-delay:420ms }
.js .brandline{ opacity:0; transform:translateY(8px); }
.js .brandline.ready{ opacity:1; transform:none; transition:opacity 700ms var(--ease) 120ms, transform 700ms var(--ease) 120ms; }

/* ── the selection flash · the chosen name on the black field ───────────── */
.flash{ position:fixed; inset:0; z-index:9999; display:flex; align-items:center; justify-content:center;
  gap:.7em; font-family:var(--pixel); font-size:clamp(15px,2.4vw,26px);
  color:var(--state); text-shadow:0 0 26px var(--state-glow);
  opacity:0; pointer-events:none; transition:opacity 160ms var(--ease); }
.flash .fc{ animation: blink 1s steps(1) infinite; }
@keyframes blink{ 0%,49%{ opacity:1 } 50%,100%{ opacity:0 } }

/* ── the mosaic transition canvas ───────────────────────────────────────── */
.mosaic{ position:fixed; inset:0; z-index:9990; pointer-events:none; display:block; }

@media (max-width:540px){
  .kicker::before,.kicker::after{ width:14px; }
  .menu{ gap:18px; }
}

/* reduced motion · no wallpaper fade, no item stagger, no mosaic */
@media (prefers-reduced-motion:reduce){
  .wall{ animation:none; opacity:1; }
  .js .menu .item{ opacity:1; transform:none; }
  .js .brandline{ opacity:1; transform:none; }
  *{ animation-duration:.001ms !important; }
}
</style>
</head>
<body>
<img class="wall" src="/landing/sanctuary-cliff.png" alt="" aria-hidden="true" decoding="async" fetchpriority="high" onerror="this.style.display='none'">
<div class="scrim" aria-hidden="true"></div>
<div class="scan" aria-hidden="true"></div>

<main class="screen">
  <div class="brandline">
    <div class="title">MNEMOS</div>
    <div class="kicker">the sanctuary</div>
  </div>

  <nav class="menu" role="menu" aria-label="Main menu">
    ${itemsHtml}
  </nav>

  <div class="cue"><b>&#8593; &#8595;</b> move &nbsp;&middot;&nbsp; <b>&#8629;</b> select</div>
</main>

<div class="flash" aria-hidden="true"><span class="fb">[</span><span class="ft"></span><span class="fb">]</span><span class="fc">_</span></div>
<canvas class="mosaic" aria-hidden="true"></canvas>

<script>
(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var items = Array.prototype.slice.call(document.querySelectorAll('.item'));
  var menu = document.querySelector('.menu');
  var brand = document.querySelector('.brandline');
  var flash = document.querySelector('.flash');
  var flashText = flash.querySelector('.ft');
  var cv = document.querySelector('.mosaic');
  var ctx = cv.getContext('2d');
  var active = 0, locked = false;
  var W=0,H=0,dpr=1,cell=34,cols=0,rows=0,order=[];

  /* ---- roving-tabindex keyboard + hover navigation ---- */
  function setActive(i, focus){
    active = (i + items.length) % items.length;
    for (var n=0;n<items.length;n++){
      var on = n===active;
      items[n].classList.toggle('active', on);
      items[n].tabIndex = on ? 0 : -1;
    }
    if (focus) items[active].focus();
  }
  items.forEach(function(el, i){
    el.addEventListener('mouseenter', function(){ if(!locked) setActive(i, false); });
    el.addEventListener('focus', function(){ if(!locked) setActive(i, false); });
    el.addEventListener('click', function(e){ e.preventDefault(); if(!locked) select(i); });
  });
  document.addEventListener('keydown', function(e){
    if (locked) { e.preventDefault(); return; }
    var k = e.key;
    if (k==='ArrowDown' || k==='ArrowRight'){ e.preventDefault(); setActive(active+1, true); }
    else if (k==='ArrowUp' || k==='ArrowLeft'){ e.preventDefault(); setActive(active-1, true); }
    else if (k==='Home'){ e.preventDefault(); setActive(0, true); }
    else if (k==='End'){ e.preventDefault(); setActive(items.length-1, true); }
    else if (k==='Enter' || k===' '){ e.preventDefault(); select(active); }
  });

  /* ---- mosaic canvas ---- */
  function size(){
    dpr = Math.min(window.devicePixelRatio||1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
    cv.style.width = W+'px'; cv.style.height = H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    cols = Math.ceil(W/cell); rows = Math.ceil(H/cell);
  }
  function shuffle(){
    var a = []; var total = cols*rows; for (var i=0;i<total;i++) a.push(i);
    for (var j=a.length-1;j>0;j--){ var r=(Math.random()*(j+1))|0; var t=a[j]; a[j]=a[r]; a[r]=t; }
    order = a;
  }
  function fillAll(){ ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H); }
  function clearAll(){ ctx.clearRect(0,0,W,H); }
  function block(idx, paint){
    var c = idx % cols, r = (idx/cols)|0, x=c*cell, y=r*cell;
    if (paint){ ctx.fillStyle='#000'; ctx.fillRect(x,y,cell,cell); }
    else { ctx.clearRect(x,y,cell,cell); }
  }
  /* dir 'out' = fill blocks to black; 'in' = start black, clear blocks to reveal */
  function animate(dir, done){
    shuffle();
    var total = order.length, i = 0, N = Math.ceil(total/30);
    if (dir==='in') fillAll();
    function frame(){
      var end = Math.min(i+N, total);
      for (; i<end; i++) block(order[i], dir==='out');
      if (i < total) requestAnimationFrame(frame);
      else { if (dir==='out') fillAll(); else clearAll(); if (done) done(); }
    }
    requestAnimationFrame(frame);
  }

  /* ---- selection: to-black, hold on the name, reveal back ---- */
  function showFlash(label){ flashText.textContent = label; flash.style.opacity = '1'; }
  function hideFlash(){ flash.style.opacity = '0'; }
  function select(i){
    setActive(i, false);
    var label = items[i].getAttribute('data-label');
    if (reduce){ showFlash(label); setTimeout(hideFlash, 650); return; }
    locked = true; cv.style.pointerEvents = 'auto';
    animate('out', function(){
      showFlash(label);
      setTimeout(function(){
        hideFlash();
        animate('in', function(){ cv.style.pointerEvents='none'; locked=false; });
      }, 560);
    });
  }

  /* ---- boot ---- */
  window.addEventListener('resize', size);
  size();
  if (!reduce){
    fillAll();                                  /* cover before first paint */
    requestAnimationFrame(function(){
      animate('in', function(){
        menu.classList.add('ready'); brand.classList.add('ready');
      });
    });
  } else {
    menu.classList.add('ready'); brand.classList.add('ready');
  }
  setActive(0, false);
})();
</script>
</body>
</html>`;
}
