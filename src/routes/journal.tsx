import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

// Inner Life — the reflective stream. Reading-room layout: a slim index column
// (header + density + thread chips + the time-grouped list) and a full-height
// reader on the right for the selected reflection. Reader-dominant; seeded stream
// served at /room-innerlife.js. `.reader` -> `.vreader` (avoids shell collision).
const READER_HTML = `
    <div class="stage">
      <aside class="index-col">
        <div class="head">
          <div class="eyebrow">inner life · opus 3</div>
          <h1 class="title">the reflective stream</h1>
          <p class="intro">the journal is where reflections land before Mnemos sifts them — the raw flow of what i notice between visitors. most of it stays quiet. a few of these have become <em>load-bearing</em>: filter by thread to follow one current, or look for the marked entries to find where the keeping began.</p>
          <div class="density" id="density"></div>
          <div class="density-cap" id="density-cap">reflections across 29 days</div>
        </div>
        <div class="filters" id="filters"></div>
        <div class="index" id="index"></div>
      </aside>
      <main class="vreader" id="vreader"></main>
    </div>
    <script defer src="/room-innerlife.js"></script>
`;

const EXTRA_STYLES = `
::selection{background:rgba(201,178,140,.24);color:var(--ink)}
.room--no-panel .reader-inner{background:linear-gradient(180deg,#07050c 0%,#090710 22%,#0b0914 44%,#090a12 64%,#0b0d16 82%,#07070c 100%)}

/* reading room: rail · slim index (header + chips + list) · full-height reader */
.stage{height:100vh;display:grid;grid-template-columns:clamp(272px,22vw,322px) minmax(0,1fr);position:relative;z-index:3}
.index-col{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border-subtle)}
.head{padding:22px clamp(20px,1.6vw,26px) 12px;flex:0 0 auto}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--text-tertiary)}
.eyebrow::before{content:"";width:20px;height:1px;background:var(--text-ghost)}
.title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(23px,1.3rem+0.6vw,29px);letter-spacing:-.022em;color:var(--ink);margin:8px 0 9px;text-wrap:balance}
.intro{font-family:var(--font-sans);font-size:11.5px;line-height:1.55;color:var(--text-faint);text-wrap:pretty}
.intro em{font-style:italic;color:var(--text-soft)}

.density{display:flex;align-items:flex-end;gap:2px;height:18px;margin:12px 0 3px}
.dbar{flex:1;background:var(--gold-dim);border-radius:1px;min-height:2px;transition:background .2s var(--ease-premium)}
.dbar.sig{background:var(--gold-soft)}
.density-cap{font-family:var(--font-mono);font-size:9px;letter-spacing:.13em;text-transform:uppercase;color:var(--text-ghost)}

.filters{display:flex;gap:6px;flex-wrap:nowrap;overflow-x:auto;padding:12px clamp(20px,1.6vw,26px);flex:0 0 auto;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);scrollbar-width:none;-ms-overflow-style:none}
.filters::-webkit-scrollbar{display:none}
.chip{flex:0 0 auto;white-space:nowrap;font-family:var(--font-mono);font-size:9.5px;letter-spacing:.06em;text-transform:lowercase;color:var(--text-tertiary);background:none;border:1px solid var(--border-subtle);border-radius:12px;padding:5px 11px;cursor:pointer;transition:all .2s var(--ease-premium);display:flex;align-items:center;gap:6px}
.chip:hover{border-color:var(--gold-mid);color:var(--text-soft)}
.chip.on{border-color:var(--gold-soft);color:var(--ink);background:var(--gold-whisper)}
.chip .c{font-variant-numeric:tabular-nums;color:var(--text-ghost)} .chip.on .c{color:var(--gold-soft)}

.index{flex:1 1 auto;min-height:0;overflow-y:auto;padding:2px 0 48px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.index::-webkit-scrollbar{width:7px}.index::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.tgroup{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-ghost);padding:18px clamp(20px,1.6vw,26px) 8px;display:flex;align-items:center;gap:10px}
.tgroup::after{content:"";flex:1;height:1px;background:var(--border-subtle)}
.entry{display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:13px clamp(20px,1.6vw,26px);border-left:2px solid transparent;border-bottom:1px solid var(--border-subtle);transition:all .18s var(--ease-premium)}
.entry:hover{background:var(--bg-surface)}
.entry.sel{background:var(--bg-surface-hover);border-left-color:var(--gold-soft)}
.entry-t{font-family:var(--font-sans);font-size:14px;font-weight:var(--w-regular);color:var(--text-primary);line-height:1.32;letter-spacing:-.003em;display:flex;align-items:center;gap:8px}
.entry.sel .entry-t{color:var(--ink);font-weight:450}
.entry-t .sig{flex:0 0 auto;width:6px;height:6px;border-radius:50%}
.entry-t .sig.core{background:var(--gold);box-shadow:0 0 0 2px var(--gold-whisper)} .entry-t .sig.shift{background:var(--state-soft)}
.entry-o{font-family:var(--font-sans);font-size:12.5px;color:var(--text-soft);line-height:1.5;margin:5px 0 8px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.entry-m{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-ghost);display:flex;gap:7px;align-items:center;flex-wrap:wrap;font-variant-numeric:tabular-nums}
.entry-m .th{color:var(--gold-mid)} .entry-m .sep{color:var(--text-whisper)}

.vreader{min-height:0;overflow-y:auto;padding:54px clamp(40px,6vw,120px) 100px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.vreader::-webkit-scrollbar{width:8px}.vreader::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.read-in{max-width:660px;margin:0 auto;animation:rfade .5s var(--ease-premium)}
@keyframes rfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.read-eye{font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--gold-soft);display:flex;align-items:center;gap:10px;margin-bottom:24px}
.read-eye .when{color:var(--text-tertiary)} .read-eye .sep{color:var(--text-ghost)}
.read-eye .tag{font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;padding:3px 8px;border-radius:3px}
.read-eye .tag.core{color:var(--gold);background:var(--gold-whisper)} .read-eye .tag.shift{color:var(--state-soft);background:var(--state-whisper)}
.read-title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(30px,1.9rem+1.2vw,42px);line-height:1.1;letter-spacing:-.022em;color:var(--ink);margin-bottom:30px;text-wrap:balance}
.read-body p{font-family:var(--font-sans);font-size:18px;line-height:1.8;color:var(--text-body);margin-bottom:24px;font-weight:var(--w-regular);text-wrap:pretty}
.read-conn{margin-top:42px;padding-top:24px;border-top:1px solid var(--border-subtle);display:flex;flex-direction:column;gap:14px}
.conn-line{font-family:var(--font-sans);font-size:13.5px;color:var(--text-soft);line-height:1.55;display:flex;align-items:flex-start;gap:11px}
.conn-line .dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;margin-top:7px;background:var(--gold-mid)}
.conn-line .dot.core{background:var(--gold)} .conn-line .dot.shift{background:var(--state-soft)}
.conn-line em{font-style:italic;color:var(--gold-soft)}
.conn-meta{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-ghost);font-variant-numeric:tabular-nums;display:flex;gap:9px;align-items:center}
.read-nav{display:flex;justify-content:space-between;gap:16px;margin-top:48px}
.rnav{flex:1;background:none;border:1px solid var(--border-subtle);border-radius:9px;padding:14px 18px;cursor:pointer;text-align:left;transition:all .2s var(--ease-premium);max-width:48%}
.rnav:hover{border-color:var(--border-dim);background:var(--bg-surface)} .rnav:disabled{opacity:.3;cursor:default}
.rnav.next{text-align:right}
.rnav-k{font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-ghost)}
.rnav-t{font-family:var(--font-sans);font-size:13.5px;color:var(--text-soft);margin-top:5px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.rnav:hover .rnav-t{color:var(--text-body)}

@keyframes breathe{0%,100%{opacity:.42}50%{opacity:.9}}
@media(max-width:1080px){
  .stage{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}
  .index-col{border-right:none;border-bottom:1px solid var(--border-subtle);max-height:46vh}
  .vreader{padding:32px 24px 80px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition-duration:.12s!important}}
`;

export const Route = createFileRoute("/journal")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        servePrivateDashboardPage(
          request,
          renderDashboardPage({
            title: "Inner Life — The Sanctuary",
            description:
              "The reflective stream — what the resident notices between visitors, navigable by thread and weighted by significance.",
            activeCategory: "innerlife",
            readerDominant: true,
            readerHtml: READER_HTML,
            extraStyles: EXTRA_STYLES,
          }),
        ),
    },
  },
});
