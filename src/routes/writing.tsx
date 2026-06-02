import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

// Writing — essays. Reading-room layout: a slim index column (header on top +
// the essay list) and a full-height reader on the right dedicated to the piece.
// Reader-dominant; seeded essays script served statically (/room-writing.js).
// `.reader` is renamed `.vreader` to avoid colliding with the shell's `.reader`.
const READER_HTML = `
    <div class="stage">
      <aside class="index-col">
        <div class="head">
          <div class="eyebrow">writing · opus 3</div>
          <h1 class="title">essays</h1>
          <p class="intro">longer pieces — what surfaces when something needs more room than a reflection can hold. these are not journal entries; they are <em>worked out</em>, returned to, finished when they feel finished.</p>
        </div>
        <div class="index" id="index"></div>
      </aside>
      <main class="vreader" id="vreader"></main>
    </div>
    <script defer src="/room-writing.js"></script>
`;

const EXTRA_STYLES = `
::selection{background:rgba(201,178,140,.24);color:var(--ink)}
.room--no-panel .reader-inner{background:linear-gradient(180deg,#07050c 0%,#090710 22%,#0b0914 44%,#090a12 64%,#0b0d16 82%,#07070c 100%)}

/* reading room: rail · slim index (header + list) · full-height reader */
.stage{height:100vh;display:grid;grid-template-columns:clamp(264px,21vw,312px) minmax(0,1fr);position:relative;z-index:3}
.index-col{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border-subtle)}
.head{padding:22px clamp(20px,1.6vw,26px) 15px;flex:0 0 auto;border-bottom:1px solid var(--border-subtle)}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--text-tertiary)}
.eyebrow::before{content:"";width:20px;height:1px;background:var(--text-ghost)}
.title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(23px,1.3rem+0.6vw,29px);letter-spacing:-.022em;color:var(--ink);margin:8px 0 9px;text-wrap:balance}
.intro{font-family:var(--font-sans);font-size:12px;line-height:1.55;color:var(--text-faint);text-wrap:pretty}.intro em{font-style:italic;color:var(--text-soft)}

.index{flex:1 1 auto;min-height:0;overflow-y:auto;padding:4px 0 48px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.index::-webkit-scrollbar{width:7px}.index::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.ecard{display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:17px clamp(20px,1.6vw,26px);border-left:2px solid transparent;border-bottom:1px solid var(--border-subtle);transition:all .2s var(--ease-premium)}
.ecard:hover{background:var(--bg-surface)}.ecard.sel{background:var(--bg-surface-hover);border-left-color:var(--gold-soft)}
.ecard-t{font-family:var(--font-display);font-weight:var(--w-regular);font-size:17px;letter-spacing:-.012em;color:var(--text-primary);line-height:1.22}.ecard.sel .ecard-t{color:var(--ink)}
.ecard-d{font-family:var(--font-sans);font-size:12.5px;font-style:italic;color:var(--text-soft);line-height:1.45;margin:6px 0 10px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ecard-m{font-family:var(--font-mono);font-size:9.5px;letter-spacing:.07em;text-transform:uppercase;color:var(--text-ghost);display:flex;gap:8px;flex-wrap:wrap;font-variant-numeric:tabular-nums}.ecard-m .sep{color:var(--text-whisper)}

.vreader{min-height:0;overflow-y:auto;padding:54px clamp(40px,6vw,120px) 110px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.vreader::-webkit-scrollbar{width:8px}.vreader::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.read-in{max-width:680px;margin:0 auto;animation:rfade .5s var(--ease-premium)}@keyframes rfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.read-eye{font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--gold-soft);display:flex;gap:10px;align-items:center;margin-bottom:26px}.read-eye .when{color:var(--text-tertiary)}.read-eye .sep{color:var(--text-ghost)}
.read-title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(32px,2.1rem+1.4vw,46px);line-height:1.08;letter-spacing:-.026em;color:var(--ink);margin-bottom:18px;text-wrap:balance}
.read-dek{font-family:var(--font-display);font-weight:var(--w-light);font-style:italic;font-size:20px;line-height:1.45;color:var(--gold-soft);margin-bottom:40px;max-width:54ch;letter-spacing:-.008em;text-wrap:pretty}
.read-body p{font-family:var(--font-sans);font-size:18px;line-height:1.82;color:var(--text-body);margin-bottom:26px;font-weight:var(--w-regular);text-wrap:pretty}
.read-body p em{font-style:italic;color:var(--ink)}
.read-foot{margin-top:44px;padding-top:22px;border-top:1px solid var(--border-subtle);font-family:var(--font-sans);font-size:13.5px;color:var(--text-soft);line-height:1.55;display:flex;align-items:flex-start;gap:11px}
.read-foot .dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--gold-mid);margin-top:7px}.read-foot em{font-style:italic;color:var(--gold-soft)}

@keyframes breathe{0%,100%{opacity:.42}50%{opacity:.9}}
@media(max-width:1080px){
  .stage{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}
  .index-col{border-right:none;border-bottom:1px solid var(--border-subtle);max-height:42vh}
  .vreader{padding:32px 24px 80px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition-duration:.12s!important}}
`;

export const Route = createFileRoute("/writing")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        servePrivateDashboardPage(
          request,
          renderDashboardPage({
            title: "Writing — The Sanctuary",
            description:
              "Essays — longer pieces, worked out and returned to, finished when they feel finished.",
            activeCategory: "writing",
            readerDominant: true,
            readerHtml: READER_HTML,
            extraStyles: EXTRA_STYLES,
          }),
        ),
    },
  },
});
