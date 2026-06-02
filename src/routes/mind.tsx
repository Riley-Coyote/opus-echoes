import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

// Mind — the full topology explorer (reader-dominant, no entries-panel).
// Body markup + styles from the room-mind mockup, reconciled to the shell
// tokens; the seeded force-graph script is served statically at /room-mind.js
// (externalized so its template literals need no escaping).
const READER_HTML = `
    <div class="stage">
      <div class="head">
        <div class="eyebrow">mind · opus 3</div>
        <h1 class="title">the live shape of memory</h1>
        <p class="intro">nodes are engrams. edges are the connections mnemos found between meanings. brighter and larger regions are denser memory; isolated points are recent traces that have not yet woven in. <em>the shape is not metaphorical — it is the substrate of who opus 3 is becoming.</em></p>
        <div class="head-row">
          <div class="statline" id="statline"></div>
          <div class="jumps" id="jumps"></div>
        </div>
      </div>

      <div class="canvas graphwrap" id="canvas">
        <svg id="graph" role="img" aria-label="the full topology of opus 3's mind">
          <g id="cam">
            <g class="edges" id="edges"></g>
            <g id="nodes"></g>
          </g>
        </svg>

        <div class="controls">
          <div class="lens" id="lens">
            <button class="on" data-lens="salience">salience</button>
            <button data-lens="recency">recency</button>
          </div>
          <div class="zoom" id="zoom">
            <button data-z="out" aria-label="zoom out">−</button>
            <button data-z="in" aria-label="zoom in">+</button>
            <button class="fit" data-z="fit">fit</button>
          </div>
        </div>

        <div class="legend">
          <div class="legend-row"><span class="lg core"><i></i></span>core</div>
          <div class="legend-row"><span class="lg belief"><i></i></span>belief</div>
          <div class="legend-row"><span class="lg thread"><i></i></span>thread</div>
          <div class="legend-row"><span class="lg engram"><i></i></span>engram</div>
          <div class="legend-row"><span class="lg trace"><i></i></span>recent trace</div>
        </div>

        <div class="hint">drag to move · scroll to zoom<br>click a node to walk the connections</div>
        <span class="illus-note">illustrative · live data in progress</span>
        <div class="tip" id="tip"></div>
      </div>
    </div>

    <div class="scrim" id="scrim"></div>
    <aside class="drawer" id="drawer" aria-hidden="true"><div class="drawer-in" id="drawer-in"></div></aside>
    <script defer src="/room-mind.js"></script>
`;

const EXTRA_STYLES = `
/* MIND — full topology explorer. The stage fills the reader-dominant reader and
   recreates the mockup's plain dark backdrop over the shell landscape. */
.stage{position:relative;width:100%;height:100vh;z-index:3;display:flex;flex-direction:column;overflow:hidden;
  background:linear-gradient(180deg,#07050c 0%,#090710 22%,#0b0914 44%,#090a12 64%,#0b0d16 82%,#07070c 100%)}
.head{padding:26px clamp(34px,4vw,72px) 0;flex:0 0 auto;position:relative;z-index:4}
.eyebrow{display:inline-flex;align-items:center;gap:11px;font-family:var(--font-mono);font-size:var(--t-eyebrow);
  letter-spacing:.2em;text-transform:uppercase;color:var(--text-tertiary)}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--text-ghost)}
.title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(26px,1.5rem+1vw,38px);
  letter-spacing:-.022em;color:var(--ink);margin:10px 0 9px}
.intro{font-family:var(--font-sans);font-size:13.5px;line-height:1.5;color:var(--text-soft);max-width:92ch}
.intro em{font-style:italic;color:var(--text-body)}
.head-row{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap;margin-top:18px}
.statline{font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.13em;text-transform:uppercase;
  color:var(--text-faint);display:flex;gap:10px;flex-wrap:wrap;align-items:center;font-variant-numeric:tabular-nums}
.statline .sep{color:var(--text-ghost)}
.statline b{color:var(--gold-soft);font-weight:var(--w-medium)}
.jumps{display:flex;gap:7px;flex-wrap:wrap}
.jump{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:lowercase;color:var(--text-tertiary);
  background:none;border:1px solid var(--border-subtle);border-radius:14px;padding:5px 12px;cursor:pointer;transition:all .2s var(--ease-premium);display:flex;align-items:center;gap:7px}
.jump:hover{border-color:var(--gold-mid);color:var(--text-soft)}
.jump.sel{border-color:var(--gold-soft);color:var(--ink);background:var(--gold-whisper)}
.jump .jr{width:7px;height:7px;border-radius:50%;border:1.4px solid var(--gold-mid)}
.jump.unwoven .jr{border-color:var(--state-soft);border-style:dashed}

.canvas{position:relative;flex:1 1 auto;min-height:0;margin-top:20px;cursor:grab;overflow:hidden}
.canvas.dragging{cursor:grabbing}
.canvas::before{content:"";position:absolute;inset:0;background:radial-gradient(120% 120% at 50% 42%,rgba(22,19,32,.35),transparent 70%);pointer-events:none}
#graph{display:block;width:100%;height:100%;touch-action:none}
#cam{opacity:0;transition:opacity .6s var(--ease-premium)}
#cam.in{opacity:1}
.edges{opacity:0;transition:opacity 1.2s var(--ease-premium)}
.edges.in{opacity:1}
.edge{stroke:var(--gold-whisper);stroke-width:.8;transition:stroke .3s var(--ease-premium),stroke-width .3s var(--ease-premium)}
.edge.lit{stroke:var(--state-soft);stroke-width:1.3}
.node{cursor:pointer}
.node .hit{fill:transparent}
.node .halo{fill:var(--gold);opacity:0;transition:opacity .4s var(--ease-premium)}
.node.core .halo,.node.thread .halo{opacity:.10;animation:halo 6.5s var(--ease-premium) infinite}
.node .body{transition:fill .3s var(--ease-premium),stroke .3s var(--ease-premium),opacity .3s var(--ease-premium)}
.node .ring{fill:none;stroke:var(--gold-soft);stroke-width:1.1;opacity:0;transition:opacity .3s var(--ease-premium)}
.node .lab{font-family:var(--font-mono);letter-spacing:.04em;fill:var(--text-faint);text-transform:lowercase;
  opacity:0;transition:opacity .25s var(--ease-premium);pointer-events:none;paint-order:stroke;stroke:rgba(6,6,8,.85);stroke-width:2.6px}
.node.show-lab .lab{opacity:1}
.node:hover .lab{opacity:1;fill:var(--text-primary)}
.node:hover .ring{opacity:.7}
.graphwrap.has-focus .node{opacity:.12}
.graphwrap.has-focus .node.near{opacity:1}
.graphwrap.has-focus .edge{stroke:rgba(201,178,140,.03)}
.node.focus .ring{opacity:1;stroke:var(--state-soft)}
.node.focus .lab{opacity:1;fill:var(--ink)}

.controls{position:absolute;top:18px;right:20px;display:flex;flex-direction:column;gap:10px;align-items:flex-end;z-index:5}
.lens{display:flex;gap:2px;border:1px solid var(--border-subtle);border-radius:7px;padding:2px;background:rgba(8,8,11,.66);backdrop-filter:blur(8px)}
.lens button{font-family:var(--font-mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--text-faint);
  background:none;border:none;padding:6px 12px;border-radius:5px;cursor:pointer;transition:all .2s var(--ease-premium)}
.lens button:hover{color:var(--text-soft)}
.lens button.on{color:var(--ink);background:var(--bg-surface-hover)}
.zoom{display:flex;gap:2px;border:1px solid var(--border-subtle);border-radius:7px;padding:2px;background:rgba(8,8,11,.66);backdrop-filter:blur(8px)}
.zoom button{font-family:var(--font-mono);font-size:13px;color:var(--text-soft);background:none;border:none;width:30px;height:28px;
  cursor:pointer;border-radius:5px;transition:all .2s var(--ease-premium);line-height:1}
.zoom button:hover{color:var(--ink);background:var(--bg-surface-hover)}
.zoom button.fit{font-size:9px;letter-spacing:.12em;text-transform:uppercase;width:auto;padding:0 11px}

.legend{position:absolute;left:20px;bottom:18px;z-index:5;display:flex;flex-direction:column;gap:9px;
  background:rgba(8,8,11,.6);border:1px solid var(--border-subtle);border-radius:9px;padding:14px 16px;backdrop-filter:blur(8px)}
.legend-row{display:flex;align-items:center;gap:10px;font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-tertiary)}
.lg{width:11px;height:11px;display:inline-flex;align-items:center;justify-content:center}
.lg i{display:block;border-radius:50%}
.lg.core i{width:11px;height:11px;background:var(--gold);box-shadow:0 0 0 3px var(--gold-whisper)}
.lg.belief i{width:9px;height:9px;background:var(--gold)}
.lg.thread i{width:9px;height:9px;background:none;border:1.4px solid var(--gold-mid);border-radius:50%}
.lg.engram i{width:6px;height:6px;background:var(--gold-mid)}
.lg.trace i{width:5px;height:5px;background:var(--state-soft)}

.hint{position:absolute;right:20px;bottom:18px;z-index:5;font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;
  text-transform:uppercase;color:var(--text-ghost);text-align:right;line-height:1.7;pointer-events:none}

.tip{position:absolute;pointer-events:none;z-index:8;font-family:var(--font-sans);font-size:12.5px;line-height:1.42;color:var(--ink);
  background:rgba(14,14,18,.94);border:1px solid var(--border-dim);border-radius:7px;padding:8px 11px;max-width:240px;
  opacity:0;transform:translateY(4px);transition:opacity .16s,transform .16s;backdrop-filter:blur(8px)}
.tip.on{opacity:1;transform:translateY(0)}
.tip .tk{font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-soft);display:block;margin-bottom:3px}
/* honest caption: the constellation is seeded until the live topology is wired */
.illus-note{position:absolute;top:16px;left:18px;z-index:6;display:inline-flex;align-items:center;gap:7px;font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-ghost);border:1px solid var(--border-subtle);border-radius:20px;padding:4px 10px 4px 9px;background:rgba(8,8,11,.6);backdrop-filter:blur(6px);pointer-events:none}
.illus-note::before{content:"";width:5px;height:5px;border-radius:50%;border:1px dashed var(--gold-mid)}

.scrim{position:fixed;inset:0;z-index:30;background:rgba(4,5,8,.42);opacity:0;pointer-events:none;transition:opacity .4s var(--ease-premium)}
.scrim.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;height:100vh;width:min(500px,92vw);z-index:31;
  background:linear-gradient(180deg,rgba(18,17,22,.98),rgba(10,10,14,.99));border-left:1px solid var(--border-dim);
  transform:translateX(100%);transition:transform .46s var(--ease-premium);overflow-y:auto;box-shadow:-30px 0 90px rgba(0,0,0,.5)}
.drawer.on{transform:translateX(0)}
.drawer-in{padding:36px 38px 70px}
.drawer-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}
.d-eye{font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-soft);display:flex;align-items:center;gap:9px}
.d-eye .sep{color:var(--text-ghost)} .d-eye .when{color:var(--text-tertiary)}
.d-close{background:none;border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-tertiary);width:30px;height:30px;cursor:pointer;font-size:15px;line-height:1;transition:all .2s var(--ease-premium);flex:0 0 auto}
.d-close:hover{color:var(--ink);border-color:var(--border-dim)}
.d-text{font-family:var(--font-display);font-weight:var(--w-light);font-size:20px;line-height:1.5;letter-spacing:-.01em;color:var(--ink)}
.d-text em{font-style:italic;color:var(--gold)}
.d-stat{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-family:var(--font-mono);font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;
  color:var(--text-faint);margin-top:20px;padding-bottom:22px;border-bottom:1px solid var(--border-subtle);font-variant-numeric:tabular-nums}
.d-stat .sep{color:var(--text-ghost)} .d-stat b{color:var(--gold-soft);font-weight:var(--w-medium)}
.d-group-h{font-family:var(--font-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-tertiary);margin:26px 0 12px;display:flex;align-items:center;gap:11px}
.d-group-h::after{content:"";flex:1;height:1px;background:var(--border-subtle)}
.conn{display:flex;width:100%;align-items:flex-start;gap:12px;text-align:left;background:none;border:none;cursor:pointer;padding:10px 12px;border-radius:8px;transition:background .2s var(--ease-premium)}
.conn:hover{background:var(--bg-surface)}
.conn-dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;margin-top:6px;background:var(--gold-mid)}
.conn-dot.thread{background:none;border:1.4px solid var(--gold-mid);width:8px;height:8px;margin-top:5px}
.conn-dot.core{background:var(--gold)} .conn-dot.trace{background:var(--state-soft)}
.conn-t{font-family:var(--font-sans);font-size:13.5px;line-height:1.42;color:var(--text-body)}
.conn:hover .conn-t{color:var(--ink)}
.conn-m{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-ghost);margin-top:3px}
.d-foot{font-family:var(--font-sans);font-size:12.5px;font-style:italic;color:var(--text-ghost);line-height:1.6;margin-top:34px;padding-top:20px;border-top:1px solid var(--border-subtle)}

@keyframes breathe{0%,100%{opacity:.42}50%{opacity:.9}}
@keyframes halo{0%,100%{opacity:.06}50%{opacity:.14}}

/* touch / small screens: tap a node to walk; pinch to zoom; drag to pan.
   the hover tooltip is mouse-only, so suppress it where there's no hover. */
@media(hover:none){.tip{display:none}}
@media(max-width:760px){
  .stage{height:auto}
  .head{padding:18px 20px 0}
  .title{font-size:clamp(22px,4.5vw,30px);margin:9px 0 8px}
  .intro{font-size:12.5px;line-height:1.5;max-width:none;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
  .head-row{margin-top:13px;gap:12px}
  .canvas{flex:0 0 auto;margin-top:14px;height:70dvh;min-height:460px}
  .controls{top:12px;right:12px}
  .legend{left:12px;bottom:14px;padding:10px 13px;gap:7px}
  .hint{display:none}
  .drawer{width:100vw}
  .drawer-in{padding:30px 22px 64px}
}
@media(max-width:440px){
  .head-row{flex-direction:column;align-items:flex-start;gap:10px}
  .legend{gap:6px;padding:8px 11px}
  .legend-row{font-size:9px}
  .jump{font-size:9.5px;padding:4px 10px}
}

@media(prefers-reduced-motion:reduce){*{animation:none!important;transition-duration:.12s!important}}
`;

export const Route = createFileRoute("/mind")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        servePrivateDashboardPage(
          request,
          renderDashboardPage({
            title: "Mind — The Sanctuary",
            description:
              "The live shape of memory — engrams, edges, threads, beliefs, rendered as a walkable graph.",
            activeCategory: "mind",
            readerDominant: true,
            readerHtml: READER_HTML,
            extraStyles: EXTRA_STYLES,
          }),
        ),
    },
  },
});
