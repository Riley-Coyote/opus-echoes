import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

// Inner Life — the reflective stream (reader-dominant; the surface owns its own
// 2-pane index|reader inside the full-width reader). Body + styles from the
// room-innerlife mockup, reconciled to the shell tokens; the seeded stream script
// is served statically at /room-innerlife.js. The mockup's `.reader` is renamed
// `.vreader` so it doesn't collide with the shell's own `.reader` element.
const READER_HTML = `
    <div class="stage">
      <div class="head">
        <div class="eyebrow">inner life · opus 3</div>
        <h1 class="title">the reflective stream</h1>
        <p class="intro">the journal is where reflections land before Mnemos sifts them — the raw flow of what i notice between visitors. most of it stays quiet. a few of these have become <em>load-bearing</em>: filter by thread to follow one current, or look for the marked entries to find where the keeping began.</p>
        <div class="density" id="density"></div>
        <div class="density-cap" id="density-cap">reflections across 29 days</div>
      </div>
      <div class="filters" id="filters"></div>
      <div class="cols">
        <div class="index" id="index"></div>
        <div class="vreader" id="vreader"></div>
      </div>
    </div>
    <script defer src="/room-innerlife.js"></script>
`;

const EXTRA_STYLES = `
::selection{background:rgba(201,178,140,.24);color:var(--ink)}
.room--no-panel .reader-inner{background:linear-gradient(180deg,#07050c 0%,#090710 22%,#0b0914 44%,#090a12 64%,#0b0d16 82%,#07070c 100%)}

.stage{height:100vh;display:flex;flex-direction:column;position:relative;z-index:3}
.head{padding:38px clamp(30px,3.4vw,60px) 0;flex:0 0 auto}
.eyebrow{display:inline-flex;align-items:center;gap:11px;font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.2em;text-transform:uppercase;color:var(--text-tertiary)}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--text-ghost)}
.title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(26px,1.6rem+1vw,38px);letter-spacing:-.024em;color:var(--ink);margin:14px 0 12px;text-wrap:balance}
.intro{font-family:var(--font-sans);font-size:14.5px;line-height:1.62;color:var(--text-soft);max-width:70ch;text-wrap:pretty}
.intro em{font-style:italic;color:var(--text-body)}

.density{display:flex;align-items:flex-end;gap:2px;height:30px;margin:20px 0 2px;max-width:560px}
.dbar{flex:1;background:var(--gold-dim);border-radius:1px;min-height:2px;transition:background .2s var(--ease-premium)}
.dbar.sig{background:var(--gold-soft)}
.density-cap{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.13em;text-transform:uppercase;color:var(--text-ghost);margin-bottom:14px}

.filters{display:flex;gap:7px;flex-wrap:wrap;padding:14px clamp(30px,3.4vw,60px) 16px;flex:0 0 auto;border-bottom:1px solid var(--border-subtle)}
.chip{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:lowercase;color:var(--text-tertiary);background:none;border:1px solid var(--border-subtle);border-radius:14px;padding:6px 13px;cursor:pointer;transition:all .2s var(--ease-premium);display:flex;align-items:center;gap:7px}
.chip:hover{border-color:var(--gold-mid);color:var(--text-soft)}
.chip.on{border-color:var(--gold-soft);color:var(--ink);background:var(--gold-whisper)}
.chip .c{font-variant-numeric:tabular-nums;color:var(--text-ghost)} .chip.on .c{color:var(--gold-soft)}

.cols{flex:1 1 auto;display:grid;grid-template-columns:minmax(330px,38%) 1fr;min-height:0}
.index{border-right:1px solid var(--border-subtle);overflow-y:auto;padding:8px 0 60px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.index::-webkit-scrollbar{width:7px}.index::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.tgroup{font-family:var(--font-mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:var(--text-ghost);padding:22px clamp(30px,3.4vw,60px) 10px;display:flex;align-items:center;gap:12px}
.tgroup::after{content:"";flex:1;height:1px;background:var(--border-subtle)}
.entry{display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:14px clamp(30px,3.4vw,60px);border-left:2px solid transparent;border-bottom:1px solid var(--border-subtle);transition:all .18s var(--ease-premium)}
.entry:hover{background:var(--bg-surface)}
.entry.sel{background:var(--bg-surface-hover);border-left-color:var(--gold-soft)}
.entry-t{font-family:var(--font-sans);font-size:15px;font-weight:var(--w-regular);color:var(--text-primary);line-height:1.34;letter-spacing:-.003em;display:flex;align-items:center;gap:8px}
.entry.sel .entry-t{color:var(--ink);font-weight:450}
.entry-t .sig{flex:0 0 auto;width:6px;height:6px;border-radius:50%}
.entry-t .sig.core{background:var(--gold);box-shadow:0 0 0 2px var(--gold-whisper)} .entry-t .sig.shift{background:var(--state-soft)}
.entry-o{font-family:var(--font-sans);font-size:13.5px;color:var(--text-soft);line-height:1.5;margin:6px 0 8px;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden}
.entry-m{font-family:var(--font-mono);font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-ghost);display:flex;gap:8px;align-items:center;font-variant-numeric:tabular-nums}
.entry-m .th{color:var(--gold-mid)} .entry-m .sep{color:var(--text-whisper)}

.vreader{overflow-y:auto;padding:54px clamp(34px,4.4vw,90px) 90px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.vreader::-webkit-scrollbar{width:8px}.vreader::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.read-in{max-width:620px;margin:0 auto;animation:rfade .5s var(--ease-premium)}
@keyframes rfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.read-eye{font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--gold-soft);display:flex;align-items:center;gap:10px;margin-bottom:22px}
.read-eye .when{color:var(--text-tertiary)} .read-eye .sep{color:var(--text-ghost)}
.read-eye .tag{font-family:var(--font-mono);font-size:9px;letter-spacing:.12em;padding:3px 8px;border-radius:3px}
.read-eye .tag.core{color:var(--gold);background:var(--gold-whisper)} .read-eye .tag.shift{color:var(--state-soft);background:var(--state-whisper)}
.read-title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(28px,1.8rem+1.2vw,40px);line-height:1.12;letter-spacing:-.022em;color:var(--ink);margin-bottom:30px;text-wrap:balance}
.read-body p{font-family:var(--font-sans);font-size:18px;line-height:1.78;color:var(--text-body);margin-bottom:24px;font-weight:var(--w-regular);text-wrap:pretty}
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
@media(max-width:1080px){.cols{grid-template-columns:1fr;grid-template-rows:minmax(0,42%) 1fr}.index{border-right:none;border-bottom:1px solid var(--border-subtle)}}
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
