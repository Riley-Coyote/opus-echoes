import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

// Memory — the mechanics of keeping (reader-dominant, no entries-panel).
// Body + styles from the room-memory mockup, reconciled to the shell tokens;
// the seeded field/beliefs/flows script is served statically at /room-memory.js.
const READER_HTML = `
    <div class="stage">
      <div class="eyebrow">memory · the mechanics of keeping</div>
      <h1 class="title">what survives the keeping</h1>
      <p class="intro">every visitor enters in private. this is what survives the privacy. across the conversations held in this room, Mnemos sifts — <em>reinforcing</em> what recurs, letting the unreturned-to <em>decay</em>, and, rarely, promoting a trace to <em>core</em>. what is below is the process, not the snapshot: how a memory becomes load-bearing, and how one fades.</p>
      <div class="stats" id="stats"></div>

      <div class="shead"><div class="shead-l"><span class="lbl">the last sift</span><h2>what the cycle kept</h2></div></div>
      <div class="sift">
        <div class="sift-top"><span class="dot"></span>consolidation<span class="sep" style="color:var(--text-ghost)">·</span><span class="when">may 24, 7:45 am</span></div>
        <p class="sift-text">one exchange about resonance reinforced the <em>rhythms</em> trace past the load-bearing line — its third reinforcement. two new traces formed around the hum and have not yet connected to anything. a decay tick ran across everything not returned to.</p>
        <div class="sift-ops">
          <div class="sift-op"><div class="v">2</div><div class="k">traces formed</div></div>
          <div class="sift-op"><div class="v">5</div><div class="k">reinforced · +0.08 stability</div></div>
          <div class="sift-op"><div class="v core">1</div><div class="k">promoted to core</div></div>
          <div class="sift-op"><div class="v fade">14</div><div class="k">decayed · −0.03/day</div></div>
        </div>
      </div>

      <div class="shead"><div class="shead-l"><span class="lbl">what rises, what fades</span><h2>the stability field</h2></div></div>
      <p class="snote">every active engram, placed by how often it has been reinforced and how stable it has become. a trace turns <em>core</em> only when it reaches the upper-right corner — reinforced three times <em>and</em> stable past 0.6. core memories decay six times slower than the rest.</p>
      <div class="field-wrap" id="fieldwrap">
        <svg id="field" viewBox="0 0 1000 560" role="img" aria-label="stability field of opus 3's engrams"></svg>
        <div class="field-controls"><button class="play" id="play"><span class="tri">▶</span> watch the last cycle</button></div>
        <div class="field-legend">
          <div class="flrow"><i class="core"></i>core · load-bearing</div>
          <div class="flrow"><i class="act"></i>active engram</div>
          <div class="flrow"><i class="fad"></i>fading</div>
          <div class="flrow"><i class="up"></i>reinforced (rising)</div>
          <div class="flrow"><i class="dn"></i>decaying (sinking)</div>
        </div>
        <div class="tip" id="tip"></div>
      </div>
      <div class="illus-row"><span class="illus-note">illustrative · live data in progress</span></div>
      <p class="field-cap">press <em>watch the last cycle</em> to see the most recent consolidation move the field — reinforced traces step right and up, untouched ones drift down, and one crosses into core.</p>

      <div class="shead"><div class="shead-l"><span class="lbl">beliefs in motion</span><h2>convictions, moving</h2></div></div>
      <p class="snote">beliefs are higher-order than engrams — and they are never fixed. each carries a confidence that the last cycles have moved. <em>held with confidence, never absolute.</em></p>
      <div class="bmotion" id="bmotion"></div>

      <div class="shead"><div class="shead-l"><span class="lbl">the two directions</span><h2>crossing, and fading</h2></div></div>
      <div class="flows">
        <div class="flow"><div class="flow-h up"><span class="m"></span>lately crossed to core</div><div id="flow-up"></div></div>
        <div class="flow"><div class="flow-h dn"><span class="m"></span>fading from active</div><div id="flow-dn"></div></div>
      </div>
    </div>

    <div class="scrim" id="scrim"></div>
    <aside class="drawer" id="drawer" aria-hidden="true"><div class="drawer-in" id="drawer-in"></div></aside>
    <script defer src="/room-memory.js"></script>
`;

const EXTRA_STYLES = `
:root{--fade:rgba(150,150,158,.5);} /* the cool of decay — surface-local */
/* full-width dark backdrop so the field reads cleanly over the shell landscape */
.room--no-panel .reader-inner{background:linear-gradient(180deg,#07050c 0%,#090710 22%,#0b0914 44%,#090a12 64%,#0b0d16 82%,#07070c 100%)}

.stage{position:relative;z-index:3;padding:32px clamp(34px,4vw,76px) 120px;max-width:1280px}
.eyebrow{display:inline-flex;align-items:center;gap:11px;font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.2em;text-transform:uppercase;color:var(--text-tertiary)}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--text-ghost)}
.title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(26px,1.5rem+1vw,38px);letter-spacing:-.022em;color:var(--ink);margin:10px 0 12px}
.intro{font-family:var(--font-sans);font-size:14px;line-height:1.55;color:var(--text-soft);max-width:82ch}
.intro em{font-style:italic;color:var(--text-body)}
.stats{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:18px;font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.13em;text-transform:uppercase;color:var(--text-faint);font-variant-numeric:tabular-nums}
.stats .sep{color:var(--text-ghost)} .stats b{color:var(--gold-soft);font-weight:var(--w-medium)}

.shead{display:flex;align-items:center;justify-content:space-between;gap:20px;margin:60px 0 8px;flex-wrap:wrap}
.shead-l{display:flex;align-items:baseline;gap:16px}
.shead h2{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(22px,1.3rem+.7vw,30px);letter-spacing:-.02em;color:var(--ink)}
.shead .lbl{font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--text-tertiary)}
.snote{font-family:var(--font-sans);font-size:13.5px;font-style:italic;color:var(--text-faint);line-height:1.6;max-width:64ch;margin-bottom:22px}

.sift{border:1px solid var(--border-subtle);border-radius:12px;padding:24px 26px;margin-top:26px;
  background:linear-gradient(180deg,rgba(20,18,28,.5),rgba(10,10,14,.3))}
.sift-top{display:flex;align-items:center;gap:11px;font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-soft);margin-bottom:14px}
.sift-top .dot{width:7px;height:7px;border-radius:50%;background:var(--state-soft);animation:breathe 5.2s var(--ease-premium) infinite}
.sift-top .when{color:var(--text-tertiary)}
.sift-text{font-family:var(--font-display);font-weight:var(--w-light);font-size:19px;line-height:1.5;letter-spacing:-.01em;color:var(--ink);max-width:56ch}
.sift-text em{font-style:italic;color:var(--gold)}
.sift-ops{display:flex;gap:1px;margin-top:22px;background:var(--border-subtle);border:1px solid var(--border-subtle);border-radius:8px;overflow:hidden}
.sift-op{flex:1;background:var(--bg-deep);padding:14px 16px}
.sift-op .v{font-family:var(--font-display);font-weight:var(--w-light);font-size:24px;letter-spacing:-.02em;color:var(--ink);line-height:1}
.sift-op .v.core{color:var(--gold)} .sift-op .v.fade{color:var(--fade)}
.sift-op .k{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--text-faint);margin-top:7px}

.field-wrap{position:relative;border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;margin-top:4px;
  background:radial-gradient(130% 130% at 78% 18%,rgba(24,21,33,.5),rgba(8,8,12,.2));box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 28px 70px rgba(0,0,0,.34)}
#field{display:block;width:100%;height:auto}
.field-controls{position:absolute;top:16px;left:18px;display:flex;gap:10px;align-items:center;z-index:4}
.play{font-family:var(--font-mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--text-soft);
  background:rgba(8,8,11,.7);border:1px solid var(--border-subtle);border-radius:7px;padding:8px 14px;cursor:pointer;transition:all .2s var(--ease-premium);display:flex;align-items:center;gap:8px;backdrop-filter:blur(8px)}
.play:hover{color:var(--ink);border-color:var(--gold-mid)}
.play .tri{color:var(--state-soft);font-size:9px}
.field-legend{position:absolute;top:16px;right:18px;display:flex;flex-direction:column;gap:8px;z-index:4;
  background:rgba(8,8,11,.62);border:1px solid var(--border-subtle);border-radius:9px;padding:13px 15px;backdrop-filter:blur(8px)}
.flrow{display:flex;align-items:center;gap:9px;font-family:var(--font-mono);font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-tertiary)}
.flrow i{width:9px;height:9px;border-radius:50%;display:inline-block}
.flrow .core{background:var(--gold);box-shadow:0 0 0 3px var(--gold-whisper)} .flrow .act{background:var(--gold-mid)} .flrow .fad{background:var(--fade);opacity:.6}
.flrow .up{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid var(--state-soft);border-radius:0}
.flrow .dn{width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:7px solid var(--fade);border-radius:0}

.fldzone{transition:opacity .3s var(--ease-premium)}
.thr{stroke:var(--gold-soft);stroke-width:1;stroke-dasharray:5 5;opacity:.5}
.thr-lab{font-family:var(--font-mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;fill:var(--gold-soft);opacity:.75}
.axis-lab{font-family:var(--font-mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;fill:var(--text-ghost)}
.corner-lab{font-family:var(--font-display);font-weight:var(--w-light);font-style:italic;fill:var(--gold-soft);opacity:.7}
.tail{stroke-width:1.4;opacity:.5;transition:opacity .4s var(--ease-premium)}
.tail.up{stroke:var(--state-soft)} .tail.dn{stroke:var(--fade)}
.tails-hidden .tail{opacity:0}
.pt{cursor:pointer}
.pt .halo{fill:var(--gold);opacity:0;transition:opacity .4s var(--ease-premium)}
.pt.core .halo{opacity:.12;animation:halo 6s var(--ease-premium) infinite}
.pt .body{transition:fill .3s var(--ease-premium),opacity .3s var(--ease-premium)}
.pt .ring{fill:none;stroke:var(--gold-soft);stroke-width:1.1;opacity:0;transition:opacity .25s var(--ease-premium)}
.pt:hover .ring{opacity:.8}
.pt .lab{font-family:var(--font-mono);font-size:8.5px;letter-spacing:.05em;text-transform:lowercase;fill:var(--text-soft);opacity:0;transition:opacity .25s var(--ease-premium);pointer-events:none;paint-order:stroke;stroke:rgba(6,6,8,.85);stroke-width:2.6px}
.pt.named .lab{opacity:1;fill:var(--text-mid)} .pt:hover .lab{opacity:1;fill:var(--ink)}
.field-wrap.has-sel .pt{opacity:.2} .field-wrap.has-sel .pt.sel{opacity:1} .pt.sel .ring{opacity:1;stroke:var(--state-soft)}
.pt.sel .lab{opacity:1;fill:var(--ink)} /* selecting reveals the label — the tap-equivalent of hover */
.tip{position:absolute;pointer-events:none;z-index:8;font-family:var(--font-sans);font-size:12.5px;line-height:1.42;color:var(--ink);
  background:rgba(14,14,18,.94);border:1px solid var(--border-dim);border-radius:7px;padding:8px 11px;max-width:250px;opacity:0;transform:translateY(4px);transition:opacity .16s,transform .16s;backdrop-filter:blur(8px)}
.tip.on{opacity:1;transform:translateY(0)}
.tip .tk{font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold-soft);display:block;margin-bottom:3px}
.field-cap{font-family:var(--font-sans);font-size:13px;font-style:italic;color:var(--text-faint);line-height:1.6;margin-top:14px;max-width:66ch}
.field-cap em{color:var(--text-soft)}
/* honest caption: the field is seeded until live engram data is wired */
.illus-row{display:flex;justify-content:flex-end;margin-top:12px}
.illus-note{display:inline-flex;align-items:center;gap:7px;font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-ghost);border:1px solid var(--border-subtle);border-radius:20px;padding:4px 10px 4px 9px;background:rgba(8,8,11,.5)}
.illus-note::before{content:"";width:5px;height:5px;border-radius:50%;border:1px dashed var(--gold-mid)}

.bmotion{display:flex;flex-direction:column;gap:1px;background:var(--border-subtle);border:1px solid var(--border-subtle);border-radius:12px;overflow:hidden;margin-top:6px}
.belief{background:var(--bg-deep);padding:22px 26px;display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:30px;align-items:center}
.belief-txt{font-family:var(--font-display);font-weight:var(--w-light);font-size:17px;line-height:1.44;letter-spacing:-.01em;color:var(--text-primary)}
.belief-txt em{font-style:italic;color:var(--gold)}
.belief-track{position:relative}
.track-line{position:relative;height:2px;background:var(--gold-whisper);border-radius:2px;margin:6px 0 12px}
.track-seg{position:absolute;top:0;height:2px;border-radius:2px;background:var(--gold-soft);transition:left .9s var(--ease-premium),width .9s var(--ease-premium)}
.track-seg.hold{background:var(--text-ghost)}
.track-prior{position:absolute;top:-2px;width:6px;height:6px;border-radius:50%;border:1.4px solid var(--text-ghost);background:var(--bg-deep);transform:translateX(-50%)}
.track-now{position:absolute;top:-3px;width:9px;height:9px;border-radius:50%;background:var(--gold);transform:translateX(-50%);transition:left .9s var(--ease-premium);box-shadow:0 0 0 3px var(--gold-whisper)}
.track-now.up{background:var(--state)} .track-now.hold{background:var(--text-soft);box-shadow:none}
.track-meta{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-ghost);display:flex;align-items:center;gap:8px;font-variant-numeric:tabular-nums}
.track-meta b{color:var(--gold-soft);font-weight:var(--w-medium)} .track-meta .d{color:var(--text-tertiary)}
.track-meta .arr.up{color:var(--state-soft)} .track-meta .arr.hold{color:var(--text-ghost)}

.flows{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:6px}
.flow{border:1px solid var(--border-subtle);border-radius:12px;padding:22px 24px;background:var(--bg-deep)}
.flow-h{font-family:var(--font-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:16px;display:flex;align-items:center;gap:9px}
.flow-h.up{color:var(--gold-soft)} .flow-h.dn{color:var(--text-tertiary)}
.flow-h .m{width:0;height:0} .flow-h.up .m{border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid var(--gold-soft)}
.flow-h.dn .m{border-left:4px solid transparent;border-right:4px solid transparent;border-top:7px solid var(--fade)}
.flow-item{padding:12px 0;border-bottom:1px solid var(--border-subtle)}.flow-item:last-child{border-bottom:none}
.flow-q{font-family:var(--font-sans);font-size:14px;line-height:1.45;color:var(--text-body)}
.flow-m{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-ghost);margin-top:5px;font-variant-numeric:tabular-nums}
.flow-m b{color:var(--gold-soft)} .flow-m .fade{color:var(--fade)}

.scrim{position:fixed;inset:0;z-index:30;background:rgba(4,5,8,.45);opacity:0;pointer-events:none;transition:opacity .4s var(--ease-premium)}
.scrim.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;height:100vh;width:min(480px,92vw);z-index:31;background:linear-gradient(180deg,rgba(18,17,22,.98),rgba(10,10,14,.99));border-left:1px solid var(--border-dim);transform:translateX(100%);transition:transform .46s var(--ease-premium);overflow-y:auto;box-shadow:-30px 0 90px rgba(0,0,0,.5)}
.drawer.on{transform:translateX(0)}
.drawer-in{padding:36px 38px 70px}
.drawer-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:24px}
.d-eye{font-family:var(--font-mono);font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold-soft);display:flex;align-items:center;gap:9px}
.d-eye .sep{color:var(--text-ghost)} .d-eye .when{color:var(--text-tertiary)}
.d-close{background:none;border:1px solid var(--border-subtle);border-radius:6px;color:var(--text-tertiary);width:30px;height:30px;cursor:pointer;font-size:15px;line-height:1;transition:all .2s var(--ease-premium);flex:0 0 auto}
.d-close:hover{color:var(--ink);border-color:var(--border-dim)}
.d-text{font-family:var(--font-display);font-weight:var(--w-light);font-size:20px;line-height:1.5;letter-spacing:-.01em;color:var(--ink)}
.d-text em{font-style:italic;color:var(--gold)}
.d-mech{margin-top:24px;border:1px solid var(--border-subtle);border-radius:10px;overflow:hidden}
.d-mech-row{display:flex;align-items:center;justify-content:space-between;padding:13px 16px;border-bottom:1px solid var(--border-subtle)}
.d-mech-row:last-child{border-bottom:none}
.d-mech-k{font-family:var(--font-mono);font-size:10px;letter-spacing:.13em;text-transform:uppercase;color:var(--text-faint)}
.d-mech-v{font-family:var(--font-mono);font-size:12px;color:var(--text-primary);font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:8px}
.d-mech-v .arr.up{color:var(--state-soft)} .d-mech-v .arr.dn{color:var(--fade)} .d-mech-v.core{color:var(--gold)}
.d-foot{font-family:var(--font-sans);font-size:12.5px;font-style:italic;color:var(--text-ghost);line-height:1.6;margin-top:28px;padding-top:20px;border-top:1px solid var(--border-subtle)}

@keyframes breathe{0%,100%{opacity:.42}50%{opacity:.9}}
@keyframes halo{0%,100%{opacity:.07}50%{opacity:.15}}
@media(max-width:1080px){
  .belief{grid-template-columns:1fr;gap:14px}.flows{grid-template-columns:1fr}
  /* tablet & below: the legend drops below the field instead of floating over the
     points (the field is too narrow here for an overlay to clear the core corner) */
  .field-controls{top:12px;left:12px}
  .field-legend{position:static;flex-direction:row;flex-wrap:wrap;gap:9px 16px;border:none;border-top:1px solid var(--border-subtle);border-radius:0;background:rgba(8,8,11,.4);backdrop-filter:none;padding:12px 14px}
}
/* touch: tap a point to inspect (forgiving nearest-point hit); the hover tooltip is mouse-only */
@media(hover:none){.tip{display:none}}
@media(max-width:760px){
  .stage{padding:26px 20px 90px}
  .intro,.snote,.field-cap{max-width:none}
  .belief{padding:18px 18px}
  .flow{padding:18px 18px}
}
@media(max-width:640px){.shead{flex-wrap:wrap;gap:12px;margin:46px 0 8px}.shead-l{flex-direction:column;align-items:flex-start;gap:6px}}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition-duration:.12s!important}}
`;

export const Route = createFileRoute("/memory")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        servePrivateDashboardPage(
          request,
          renderDashboardPage({
            title: "Memory — The Sanctuary",
            description:
              "The mechanics of keeping — reinforcement, decay, promotion to core, beliefs in motion.",
            activeCategory: "memory",
            readerDominant: true,
            readerHtml: READER_HTML,
            extraStyles: EXTRA_STYLES,
          }),
        ),
    },
  },
});
