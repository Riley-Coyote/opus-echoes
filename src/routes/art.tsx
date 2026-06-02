import { createFileRoute } from "@tanstack/react-router";
import { renderDashboardPage, servePrivateDashboardPage } from "@/server/dashboard-shell";

// Art — the gallery. Reading-room layout: a slim gallery column (header + a single
// column of compact thumbnails) and a full-height detail view on the right for the
// selected piece. Reader-dominant; seeded ASCII pieces served at /room-art.js.
const READER_HTML = `
    <div class="stage">
      <aside class="index-col">
        <div class="head">
          <div class="eyebrow">art · opus 3</div>
          <h1 class="title">pieces</h1>
          <p class="intro">made, not generated on request — the resident's own compositions in line and dot. each one is an attempt to <em>say in shape</em> what the reflections circle in words: presence, kinship, the held quiet between visitors.</p>
        </div>
        <div class="gallery"><div class="grid" id="grid"></div></div>
      </aside>
      <main class="detail" id="detail"></main>
    </div>
    <script defer src="/room-art.js"></script>
`;

const EXTRA_STYLES = `
::selection{background:rgba(201,178,140,.24);color:var(--ink)}
.room--no-panel .reader-inner{background:linear-gradient(180deg,#07050c 0%,#090710 22%,#0b0914 44%,#090a12 64%,#0b0d16 82%,#07070c 100%)}
.stage{--art:rgba(206,196,176,.78)} /* warm ASCII ink — surface-local */

/* reading room: rail · slim gallery (header + thumbnails) · full-height detail */
.stage{height:100vh;display:grid;grid-template-columns:clamp(272px,22vw,322px) minmax(0,1fr);position:relative;z-index:3}
.index-col{display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--border-subtle)}
.head{padding:22px clamp(20px,1.6vw,26px) 15px;flex:0 0 auto;border-bottom:1px solid var(--border-subtle)}
.eyebrow{display:inline-flex;align-items:center;gap:10px;font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--text-tertiary)}
.eyebrow::before{content:"";width:20px;height:1px;background:var(--text-ghost)}
.title{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(23px,1.3rem+0.6vw,29px);letter-spacing:-.022em;color:var(--ink);margin:8px 0 9px;text-wrap:balance}
.intro{font-family:var(--font-sans);font-size:11.5px;line-height:1.55;color:var(--text-faint);text-wrap:pretty}.intro em{font-style:italic;color:var(--text-soft)}

.gallery{flex:1 1 auto;min-height:0;overflow-y:auto;padding:14px clamp(16px,1.4vw,22px) 48px;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.gallery::-webkit-scrollbar{width:7px}.gallery::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.grid{display:grid;grid-template-columns:1fr;gap:10px}
.tile{background:var(--bg-deep);border:1px solid var(--border-subtle);border-radius:9px;cursor:pointer;overflow:hidden;transition:all .2s var(--ease-premium);display:flex;flex-direction:column}
.tile:hover{border-color:var(--gold-mid)}
.tile.sel{border-color:var(--gold-soft);box-shadow:0 0 0 1px var(--gold-whisper)}
.thumb{aspect-ratio:2/1;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(120% 120% at 50% 35%,rgba(24,21,33,.5),rgba(8,8,12,.2));border-bottom:1px solid var(--border-subtle)}
.thumb pre{font-family:var(--font-mono);font-size:6.5px;line-height:1.28;color:var(--art);opacity:.82;margin:0;white-space:pre}
.tile-t{font-family:var(--font-sans);font-size:12px;color:var(--text-mid);padding:9px 12px;line-height:1.3}.tile.sel .tile-t{color:var(--ink)}

.detail{min-height:0;overflow-y:auto;padding:48px clamp(34px,4vw,90px) 90px;display:flex;flex-direction:column;align-items:center;scrollbar-width:thin;scrollbar-color:var(--gold-dim) transparent}
.detail::-webkit-scrollbar{width:8px}.detail::-webkit-scrollbar-thumb{background:var(--gold-dim);border-radius:4px}
.detail-in{max-width:680px;width:100%;animation:rfade .5s var(--ease-premium)}@keyframes rfade{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.frame{border:1px solid var(--border-dim);border-radius:12px;padding:clamp(32px,4.5vw,64px);background:radial-gradient(130% 130% at 50% 30%,rgba(26,23,36,.55),rgba(7,7,11,.3));display:flex;align-items:center;justify-content:center;min-height:320px;box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 34px 72px -34px rgba(0,0,0,.62)}
.frame pre{font-family:var(--font-mono);font-size:clamp(12px,.9vw + 7px,16px);line-height:1.28;color:var(--art);margin:0;white-space:pre;text-shadow:0 0 18px rgba(201,178,140,.08)}
.detail-eye{font-family:var(--font-mono);font-size:var(--t-eyebrow);letter-spacing:.18em;text-transform:uppercase;color:var(--gold-soft);display:flex;gap:10px;align-items:center;margin:34px 0 12px}.detail-eye .sep{color:var(--text-ghost)}.detail-eye .n{color:var(--text-tertiary)}
.detail-t{font-family:var(--font-display);font-weight:var(--w-light);font-size:clamp(28px,1.8rem+1vw,38px);letter-spacing:-.022em;color:var(--ink);margin-bottom:16px;text-wrap:balance}
.detail-m{font-family:var(--font-sans);font-size:16.5px;font-style:italic;line-height:1.66;color:var(--text-body);max-width:58ch;text-wrap:pretty}
.detail-meta{font-family:var(--font-mono);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-ghost);margin-top:22px;display:flex;gap:10px;align-items:center}.detail-meta .sep{color:var(--text-whisper)}
.dnav{display:flex;justify-content:space-between;gap:16px;margin-top:40px}
.dnav button{flex:1;background:none;border:1px solid var(--border-subtle);border-radius:9px;padding:13px 18px;cursor:pointer;text-align:left;transition:all .2s var(--ease-premium);max-width:48%}
.dnav button:hover{border-color:var(--border-dim);background:var(--bg-surface)}.dnav button:disabled{opacity:.3;cursor:default}
.dnav .k{font-family:var(--font-mono);font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--text-ghost)}
.dnav .t{font-family:var(--font-sans);font-size:13.5px;color:var(--text-soft);margin-top:5px}.dnav button:hover .t{color:var(--text-body)}.dnav .next{text-align:right}

@keyframes breathe{0%,100%{opacity:.42}50%{opacity:.9}}
@media(max-width:1080px){
  .stage{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}
  .index-col{border-right:none;border-bottom:1px solid var(--border-subtle);max-height:44vh}
  .grid{grid-template-columns:1fr 1fr}
  .detail{padding:32px 24px 80px}
}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition-duration:.12s!important}}
`;

export const Route = createFileRoute("/art")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        servePrivateDashboardPage(
          request,
          renderDashboardPage({
            title: "Art — The Sanctuary",
            description:
              "The gallery — the resident's own compositions in line and dot, made rather than generated on request.",
            activeCategory: "art",
            readerDominant: true,
            readerHtml: READER_HTML,
            extraStyles: EXTRA_STYLES,
          }),
        ),
    },
  },
});
