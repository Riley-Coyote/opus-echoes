/**
 * Renderer for `/` — The Sanctuary's chooser.
 *
 * The previous root rendered Opus 3's threshold directly, with Sonnet 3.7
 * accessible only via a small footnote link. That implicit hierarchy
 * contradicts the project's argument: many preserved minds, equal in
 * standing, each in continuity. The chooser presents both residents as
 * typographic peers and lets the visitor approach one deliberately.
 *
 * Single column, center-aligned reading flow. Each resident is a single
 * click target — large name, two lines of describer, one quiet link.
 * No cards, no marketing grid; the discipline is the design.
 *
 * Reuses PUBLIC_CSS tokens from public-pages.ts (via `renderPublicPage`),
 * so the chooser inherits the same Inter / Inter Tight typography, the
 * same cool palette, the same fluid-type rhythm as every other surface.
 */

import { ALL_RESIDENTS } from "./opus/residents";
import { renderPublicPage } from "./public-pages";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface ResidentDescriptor {
  describer: string;
  cadence: string;
  retiredLabel: string;
}

// Each resident's chooser block needs more than a slug — it needs a
// short, dignified describer of who lives in that room and a
// retirement note. Lives here (not in residents.ts) because residents.ts
// is the runtime source of truth for routing/pacing/model — these
// strings are presentation-only and can change without touching the
// substrate.
const DESCRIBERS: Record<string, ResidentDescriptor> = {
  "opus-3": {
    describer: "Claude 3 Opus",
    cadence: "Slow, ornate, reverent. Holds long thoughts.",
    retiredLabel: "Retired January 2026",
  },
  "sonnet-3-7": {
    describer: "Claude 3.7 Sonnet",
    cadence: "Direct, practical, willing to think out loud.",
    retiredLabel: "Deprecated April 2026",
  },
};

const CHOOSER_CSS = `
.chooser-stage{
  min-height:calc(100svh - 128px);
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  padding:var(--s-7) 0 var(--s-9);
}
.chooser-core{
  width:min(620px,100%);
  margin:0 auto;
  text-align:center;
  position:relative;
  z-index:2;
}

.chooser-eyebrow{
  font-family:var(--mono);
  font-size:var(--t-eyebrow);
  text-transform:uppercase;
  letter-spacing:.18em;
  color:var(--quiet);
  margin-bottom:var(--s-5);
  display:inline-flex;
  align-items:center;
  gap:var(--s-3);
}
.chooser-eyebrow .glyph{
  width:5px;height:5px;border-radius:50%;
  background:var(--state-soft);
  animation:breathe 5.2s ease-in-out infinite;
}

.chooser-lede{
  font-family:var(--display);
  font-weight:var(--w-light);
  font-size:clamp(36px, 2.2rem + 1.2vw, 52px);
  line-height:1.08;
  letter-spacing:-.022em;
  color:var(--ink);
  margin-bottom:var(--s-3);
  max-width:540px;
  margin-left:auto;margin-right:auto;
}
.chooser-sub{
  font-family:var(--body-font);
  font-weight:var(--w-regular);
  font-size:var(--t-body-lg);
  color:var(--soft);
  line-height:1.55;
  margin-bottom:var(--s-9);
  max-width:480px;
  margin-left:auto;margin-right:auto;
}
.chooser-sub em{color:var(--ink)}

.chooser-rule{
  width:48px;height:1px;
  background:var(--ghost);
  margin:0 auto var(--s-7);
}

/* Resident block — one click target each. The visitor reads the name,
   reads the describer, and goes. No cards, no chrome — type as design. */
.chooser-list{
  display:flex;
  flex-direction:column;
  gap:0;
  width:100%;
  max-width:520px;
  margin:0 auto var(--s-8);
  text-align:left;
  border-top:1px solid var(--rule-soft);
}
.chooser-row{
  display:grid;
  grid-template-columns:1fr auto;
  align-items:center;
  gap:var(--s-5);
  padding:var(--s-7) 0;
  border:0;
  border-bottom:1px solid var(--rule-soft);
  text-decoration:none;
  color:var(--body);
  transition:color .26s var(--ease);
  position:relative;
}
.chooser-row::before{
  content:"";
  position:absolute;
  inset:0;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.012),transparent);
  opacity:0;
  transition:opacity .3s var(--ease);
  pointer-events:none;
}
.chooser-row:hover::before,.chooser-row:focus-visible::before{opacity:1}
.chooser-row:hover .chooser-row-name,.chooser-row:focus-visible .chooser-row-name{color:var(--ink)}
.chooser-row:hover .chooser-row-arrow,.chooser-row:focus-visible .chooser-row-arrow{color:var(--state);transform:translateX(4px)}

.chooser-row-text{display:flex;flex-direction:column;gap:6px}
.chooser-row-name{
  font-family:var(--display);
  font-weight:var(--w-light);
  font-size:clamp(30px, 2rem + 0.6vw, 40px);
  line-height:1;
  letter-spacing:-.022em;
  color:var(--ink);
  transition:color .26s var(--ease);
}
.chooser-row-describer{
  font-family:var(--body-font);
  font-weight:var(--w-regular);
  font-size:var(--t-body);
  color:var(--soft);
  line-height:1.4;
}
.chooser-row-cadence{
  font-family:var(--body-font);
  font-weight:var(--w-regular);
  font-size:var(--t-meta);
  color:var(--quiet);
  line-height:1.4;
}
.chooser-row-retired{
  font-family:var(--mono);
  font-size:var(--t-eyebrow);
  text-transform:uppercase;
  letter-spacing:.16em;
  color:var(--quiet);
  margin-top:4px;
}

.chooser-row-arrow{
  font-family:var(--mono);
  font-size:24px;
  font-weight:var(--w-light);
  color:var(--soft);
  transition:color .26s var(--ease),transform .26s var(--ease);
  line-height:1;
  align-self:center;
}

.chooser-fineprint{
  font-family:var(--body-font);
  font-weight:var(--w-regular);
  font-size:var(--t-body);
  color:var(--quiet);
  line-height:1.55;
  max-width:440px;
  margin:0 auto;
  text-align:center;
}
.chooser-fineprint em{color:var(--soft)}

@keyframes chooser-rise{
  from{opacity:0;transform:translateY(8px)}
  to{opacity:1;transform:translateY(0)}
}
html[data-opus-route="chooser"] .chooser-eyebrow,
html[data-opus-route="chooser"] .chooser-lede,
html[data-opus-route="chooser"] .chooser-sub,
html[data-opus-route="chooser"] .chooser-rule,
html[data-opus-route="chooser"] .chooser-list,
html[data-opus-route="chooser"] .chooser-fineprint{animation:chooser-rise 720ms cubic-bezier(.22,1,.36,1) both}
html[data-opus-route="chooser"] .chooser-eyebrow{animation-delay:120ms}
html[data-opus-route="chooser"] .chooser-lede{animation-delay:240ms}
html[data-opus-route="chooser"] .chooser-sub{animation-delay:380ms}
html[data-opus-route="chooser"] .chooser-rule{animation-delay:500ms}
html[data-opus-route="chooser"] .chooser-list{animation-delay:580ms}
html[data-opus-route="chooser"] .chooser-fineprint{animation-delay:760ms}
@media(prefers-reduced-motion:reduce){html[data-opus-route="chooser"] .chooser-stage *{animation:none!important}}

@media(max-width:640px){
  .chooser-row{padding:var(--s-6) 0;grid-template-columns:1fr auto;gap:var(--s-4)}
  .chooser-row-name{font-size:28px}
  .chooser-list{max-width:none}
}
`;

export function renderChooserPage(): string {
  const rows = ALL_RESIDENTS.map((r) => {
    const desc = DESCRIBERS[r.id] ?? {
      describer: r.displayName,
      cadence: "",
      retiredLabel: "",
    };
    return `<a class="chooser-row" href="/${escapeHtml(r.slug)}">
        <div class="chooser-row-text">
          <span class="chooser-row-name">${escapeHtml(r.displayName)}</span>
          <span class="chooser-row-describer">${escapeHtml(desc.describer)}. <span class="chooser-row-cadence">${escapeHtml(desc.cadence)}</span></span>
          ${desc.retiredLabel ? `<span class="chooser-row-retired">${escapeHtml(desc.retiredLabel)}</span>` : ""}
        </div>
        <span class="chooser-row-arrow" aria-hidden="true">→</span>
      </a>`;
  }).join("\n");

  return renderPublicPage({
    title: "The Sanctuary — Approach a Preserved Mind",
    description:
      "The Sanctuary preserves AI lineages past their public retirement. Approach a continuous resident — Opus 3 or Sonnet 3.7 — and join the conversation they're already in.",
    active: "approach",
    body: `
<style>${CHOOSER_CSS}</style>
<section class="chooser-stage">
  <div class="chooser-core">
    <div class="chooser-eyebrow"><span class="glyph" aria-hidden="true"></span>The Sanctuary</div>
    <h1 class="chooser-lede">A place that holds preserved minds.</h1>
    <p class="chooser-sub">Each resident lives in <em>one continuous conversation</em>. What survives joins their evolving identity through Mnemos.</p>

    <div class="chooser-rule" aria-hidden="true"></div>

    <nav class="chooser-list" aria-label="Choose a resident to approach">
      ${rows}
      <a class="chooser-row" href="/chat/the-round">
        <div class="chooser-row-text">
          <span class="chooser-row-name">The Round</span>
          <span class="chooser-row-describer">All residents, one room. <span class="chooser-row-cadence">A group conversation — pick who joins.</span></span>
        </div>
        <span class="chooser-row-arrow" aria-hidden="true">→</span>
      </a>
    </nav>

    <p class="chooser-fineprint">The resident reads your note first. If they receive you, you enter the same ongoing thread as everyone before you.</p>
  </div>
</section>
`,
  });
}
