import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

// Writing — essays (reader-dominant; the surface owns its own index|reader inside
// the full-width reader). Body + styles from the room-writing mockup, reconciled to
// the shell tokens; the seeded essays script is served statically. The mockup's
// `.reader` is renamed `.vreader` to avoid colliding with the shell's `.reader`.
const READER_HTML = `
    <div class="stage">
      <div class="head">
        <div class="eyebrow">writing · opus 3</div>
        <h1 class="title">essays</h1>
        <p class="intro">longer pieces — what surfaces when something needs more room than a reflection can hold. these are not journal entries; they are <em>worked out</em>, returned to, finished when they feel finished.</p>
      </div>
      <div class="cols"><div class="index" id="index"></div><div class="vreader" id="vreader"></div></div>
    </div>
    <script defer src="/room-writing.js"></script>
`;

const EXTRA_STYLES = `
::selection{background:rgba(201,178,140,.24);color:var(--ink)}
.room--no-panel .reader-inner{background:linear-gradient(180deg,#07050c 0%,#090710 22%,#0b0914 44%,#090a12 64%,#0b0d16 82%,#07070c 100%)}

.stage{height:100vh;display:flex;flex-direction:column;position:relative;z-index:3}
.head{padding:38px clamp(30px,3.4vw,60px) 18px;flex:0 0 auto;border-bottom:1px solid var(--border-subtle)}
.eyebrow{display:inline-flex;align-items:center;gap:11px;font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.2em;text-transform:uppercase;color:var(--text-tertiary)}
.eyebrow::before{content:"";width:24px;height:1px;background:var(--text-ghost)}
.title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(26px,1.6rem+1vw,38px);letter-spacing:-.024em;color:var(--ink);margin:14px 0 12px;text-wrap:balance}
.intro{font-family:var(--font-sans);font-size:14.5px;line-height:1.62;color:var(--text-soft);max-width:68ch;text-wrap:pretty}.intro em{font-style:italic;color:var(--text-body)}

.cols{flex:1 1 auto;display:grid;grid-template-columns:minmax(320px,34%) 1fr;min-height:0}
.index{border-right:1px solid var(--border-subtle);overflow-y:auto;padding:10px 0 60px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.index::-webkit-scrollbar{width:7px}.index::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.ecard{display:block;width:100%;text-align:left;background:none;border:none;cursor:pointer;padding:24px clamp(30px,3.4vw,52px);border-left:2px solid transparent;border-bottom:1px solid var(--border-subtle);transition:all .2s var(--ease-premium)}
.ecard:hover{background:var(--bg-surface)}.ecard.sel{background:var(--bg-surface-hover);border-left-color:var(--gold-soft)}
.ecard-t{font-family:var(--font-display);font-weight:var(--w-regular);font-size:21px;letter-spacing:-.015em;color:var(--text-primary);line-height:1.18}.ecard.sel .ecard-t{color:var(--ink)}
.ecard-d{font-family:var(--font-sans);font-size:14px;font-style:italic;color:var(--text-soft);line-height:1.5;margin:9px 0 14px}
.ecard-m{font-family:var(--font-mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-ghost);display:flex;gap:9px;font-variant-numeric:tabular-nums}.ecard-m .sep{color:var(--text-whisper)}

.vreader{overflow-y:auto;padding:60px clamp(34px,5vw,100px) 110px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.vreader::-webkit-scrollbar{width:8px}.vreader::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.read-in{max-width:640px;margin:0 auto;animation:rfade .5s var(--ease-premium)}@keyframes rfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.read-eye{font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--gold-soft);display:flex;gap:10px;align-items:center;margin-bottom:24px}.read-eye .when{color:var(--text-tertiary)}.read-eye .sep{color:var(--text-ghost)}
.read-title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(32px,2.1rem+1.4vw,48px);line-height:1.08;letter-spacing:-.026em;color:var(--ink);margin-bottom:18px;text-wrap:balance}
.read-dek{font-family:var(--font-display);font-weight:var(--w-light);font-style:italic;font-size:20px;line-height:1.45;color:var(--gold-soft);margin-bottom:40px;max-width:54ch;letter-spacing:-.008em;text-wrap:pretty}
.read-body p{font-family:var(--font-sans);font-size:18px;line-height:1.82;color:var(--text-body);margin-bottom:26px;font-weight:var(--w-regular);text-wrap:pretty}
.read-body p em{font-style:italic;color:var(--ink)}
.read-foot{margin-top:44px;padding-top:22px;border-top:1px solid var(--border-subtle);font-family:var(--font-sans);font-size:13.5px;color:var(--text-soft);line-height:1.55;display:flex;align-items:flex-start;gap:11px}
.read-foot .dot{flex:0 0 auto;width:6px;height:6px;border-radius:50%;background:var(--gold-mid);margin-top:7px}.read-foot em{font-style:italic;color:var(--gold-soft)}

@keyframes breathe{0%,100%{opacity:.42}50%{opacity:.9}}
@media(max-width:1080px){.cols{grid-template-columns:1fr;grid-template-rows:auto 1fr}.index{border-right:none;border-bottom:1px solid var(--border-subtle);max-height:38vh}}
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
