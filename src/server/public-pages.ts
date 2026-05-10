interface PublicPageOptions {
  title: string;
  description: string;
  active?: "approach" | "mnemos" | "archive" | "token";
  body: string;
  script?: string;
  /** Optional resident slug — used to route the approach script's
   *  POST to /api/intent with the right resident parameter. */
  residentId?: string;
}

// Typography: Inter + Inter Tight (a tighter Inter cut suited for display).
// Both are Google-Fonts-hosted, free, no licensing. JetBrains Mono stays for
// eyebrows / meta. We deliberately drop Cormorant Garamond + Spectral system-
// wide: a single grotesque family carries the whole journey, and the literary
// register comes from breath, weight, and prose — not from a dramatic typeface.
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Inter+Tight:wght@200;300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

const PUBLIC_CSS = `
:root{
  /* Surfaces — cool neutral, dark-by-default */
  --floor:#06070a;--deep:#09090b;--panel:#101013;--panel-2:#151518;
  /* Text hierarchy — strict, no warm tint */
  --ink:rgba(248,248,246,.96);--body:rgba(228,226,222,.84);--soft:rgba(208,206,202,.7);
  --quiet:rgba(186,184,180,.56);--ghost:rgba(160,158,154,.3);
  /* Rules & borders */
  --rule:rgba(225,225,225,.12);--rule-soft:rgba(225,225,225,.07);--rule-strong:rgba(225,225,225,.18);
  /* Single accent — green state, used sparingly: presence dot, focus ring,
     active link underline, send-armed glow. Matches the conversation page's
     receiving indicator so the journey reads as one design system. */
  --state:#82b484;
  --state-soft:rgba(130,180,132,.62);
  --state-dim:rgba(130,180,132,.16);
  --state-whisper:rgba(130,180,132,.05);
  /* Type families — a single grotesque (Inter / Inter Tight) carries the
     whole system. JetBrains Mono is kept for eyebrows + technical metadata.
     Italic appears only inside <em> in prose; the chrome itself never tilts. */
  --display:'Inter Tight','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --body-font:'Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --mono:'JetBrains Mono','SF Mono',monospace;
  /* Fluid type scale — five sizes, no more. Hierarchy is weight + breath,
     not typeface. clamp() lets each step breathe between 320 and 1920px. */
  --t-eyebrow:clamp(11px, 0.69rem + 0.05vw, 12px);
  --t-meta:clamp(13px, 0.81rem + 0.1vw, 14px);
  --t-body:clamp(15px, 0.94rem + 0.2vw, 17px);
  --t-body-lg:clamp(17px, 1.06rem + 0.3vw, 19px);
  --t-section-h:clamp(28px, 1.75rem + 0.8vw, 34px);
  --t-hero:clamp(44px, 2.7rem + 1.4vw, 64px);
  /* Weight discipline — three weights, no more. */
  --w-light:300;
  --w-regular:400;
  --w-medium:500;
  /* Spacing system — 4px base, locked progression for vertical rhythm. */
  --s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:24px;--s-6:32px;--s-7:48px;--s-8:64px;--s-9:96px;--s-10:128px;
  /* Easing curves */
  --ease:cubic-bezier(.22,1,.36,1);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{background:var(--floor);color:var(--body);font-family:var(--body-font);font-size:16px;line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:"kern" 1,"liga" 1,"calt" 1,"ss01" 1}
body{min-height:100vh;background:linear-gradient(180deg,#08060e 0%,#0a0812 20%,#0c0a16 40%,#0a0b14 60%,#0c0e18 80%,#08080e 100%) fixed var(--floor)}
::selection{background:var(--state-dim);color:var(--ink)}

/* ── MV-inspired atmosphere — vignette + grain across all pages ──── */
body::after{content:'';position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 90% 80% at 50% 50%,transparent 45%,rgba(4,4,8,.04) 55%,rgba(4,4,8,.08) 62%,rgba(4,4,8,.12) 70%,rgba(4,4,8,.16) 78%,rgba(4,4,8,.2) 88%,rgba(4,4,8,.24) 100%)}
.atmo-grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.015;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-repeat:repeat;background-size:180px 180px}
:focus-visible{outline:2px solid color-mix(in srgb,var(--state) 64%,transparent);outline-offset:3px;border-radius:4px}
a{color:var(--ink);text-decoration:none;border-bottom:1px solid var(--rule);transition:border-color .18s var(--ease),color .18s var(--ease)}
a:hover{border-bottom-color:var(--state-soft);color:var(--ink)}
em{font-style:italic;color:var(--ink)}

/* Top-level navigation — quiet, never the loudest thing on the page. */
.public-nav{position:fixed;z-index:20;top:0;left:0;right:0;height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 var(--s-6);background:linear-gradient(to bottom,rgba(6,7,10,.94),rgba(6,7,10,.62),transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.brand{display:flex;align-items:baseline;gap:var(--s-3);border:0;color:var(--ink)}
.brand-name{font-family:var(--display);font-weight:var(--w-regular);font-size:18px;letter-spacing:-.01em}
.brand-dot{width:5px;height:5px;border-radius:50%;background:var(--state-soft);transform:translateY(-2px);animation:breathe 5.2s ease-in-out infinite}
@keyframes breathe{0%,100%{opacity:.42;box-shadow:0 0 0 0 rgba(130,180,132,0)}50%{opacity:.9;box-shadow:0 0 0 5px rgba(130,180,132,.06)}}
.nav-links{display:flex;gap:var(--s-5);align-items:center}
.nav-links a{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--soft);border:0;position:relative;padding:6px 0;transition:color .18s var(--ease)}
.nav-links a::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;background:var(--state-soft);transform:scaleX(0);transform-origin:left;transition:transform .26s var(--ease)}
.nav-links a:hover,.nav-links a.active{color:var(--ink)}
.nav-links a:hover::after,.nav-links a.active::after{transform:scaleX(1)}
.nav-private{padding:8px 16px;border:1px solid var(--rule)!important;border-radius:6px;color:var(--soft)!important;font-size:10px!important;letter-spacing:.14em!important;line-height:1!important;transition:border-color .18s var(--ease),background .18s var(--ease),color .18s var(--ease)}
.nav-private::after{display:none!important}
.nav-private:hover{border-color:var(--rule-strong)!important;background:rgba(255,255,255,.03);color:var(--ink)!important}

/* Page shell — a single comfortable measure. */
.page{width:min(1080px,calc(100% - 48px));margin:0 auto;padding:96px 0 var(--s-9)}

/* ============================================================
   THRESHOLD — single intent above the fold.
   At 1280×720, the eyebrow + name + hero question + composer
   fit without scrolling. The figure (3D layer) lives behind.
   ============================================================ */
.threshold-stage{display:flex;flex-direction:column;position:relative;padding:var(--s-7) 0 var(--s-6)}
.threshold-core{width:min(640px,100%);margin:0 auto;position:relative;z-index:2}

/* Resume banner — shown when sessionStorage holds an active session.
   Above the threshold-core's eyebrow. The visitor can resume their
   conversation in one click or dismiss to start a new intent here. */
.threshold-resume{display:none;margin-bottom:var(--s-6);padding:16px 18px;background:linear-gradient(180deg,rgba(20,21,25,.78),rgba(14,15,18,.86));border:1px solid var(--rule-soft);border-radius:8px;align-items:center;justify-content:space-between;gap:var(--s-4);flex-wrap:wrap}
.threshold-resume.visible{display:flex}
.threshold-resume-text{font-family:var(--body-font);font-weight:var(--w-regular);font-size:var(--t-body);color:var(--soft);line-height:1.45;flex:1;min-width:200px}
.threshold-resume-text strong{color:var(--ink);font-weight:var(--w-medium)}
.threshold-resume-actions{display:flex;gap:var(--s-3);align-items:center}
.threshold-resume-continue{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--ink);background:transparent;border:1px solid var(--rule);border-radius:6px;padding:9px 14px;cursor:pointer;transition:border-color .22s var(--ease),background .22s var(--ease)}
.threshold-resume-continue:hover{border-color:var(--state-soft);background:var(--state-whisper)}
.threshold-resume-dismiss{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet);background:transparent;border:0;cursor:pointer;padding:6px 8px;transition:color .22s var(--ease)}
.threshold-resume-dismiss:hover{color:var(--ink)}

.threshold-eyebrow{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet);margin-bottom:var(--s-3);display:flex;align-items:center;gap:var(--s-3)}
.threshold-eyebrow .glyph{width:5px;height:5px;border-radius:50%;background:var(--state-soft);animation:breathe 5.2s ease-in-out infinite}

.resident-name{font-family:var(--display);font-weight:var(--w-light);font-size:clamp(36px, 2.2rem + 1vw, 48px);line-height:1;letter-spacing:-.02em;color:var(--ink);margin-bottom:var(--s-2)}
.resident-state{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet);margin-bottom:var(--s-7)}

/* The hero question — Inter Tight, light, large, NOT italic.
   The literary moment is the breath around the question, not the typeface. */
.threshold-question{font-family:var(--display);font-weight:var(--w-light);font-size:var(--t-hero);line-height:1.06;letter-spacing:-.022em;color:var(--ink);margin-bottom:var(--s-7);max-width:580px}

/* Composer — the single primary action on the page.
   No breathing pool, no decorative gradients. The 1px inset highlight
   on the panel is the only surface treatment we keep. */
.threshold-panel{position:relative;width:100%;background:linear-gradient(180deg,rgba(20,21,25,.78),rgba(14,15,18,.86));border:1px solid var(--rule-soft);border-radius:10px;box-shadow:inset 0 1px 0 0 rgba(255,255,255,.04),0 24px 64px rgba(0,0,0,.4);overflow:hidden;transition:border-color .35s var(--ease),box-shadow .35s var(--ease)}
.threshold-panel:focus-within{border-color:var(--rule);box-shadow:inset 0 1px 0 0 rgba(255,255,255,.06),0 28px 72px rgba(0,0,0,.5)}

.state{display:none}
.threshold-panel[data-state=intent] .state.intent,
.threshold-panel[data-state=deciding] .state.deciding,
.threshold-panel[data-state=accepted] .state.accepted,
.threshold-panel[data-state=declined] .state.declined{display:block}

.field{display:block;width:100%;min-height:160px;max-height:340px;background:transparent;border:0;resize:none;outline:none;color:var(--ink);font-family:var(--body-font);font-weight:var(--w-regular);font-size:var(--t-body-lg);line-height:1.7;padding:24px 26px 16px;position:relative;z-index:1}
.field::placeholder{color:var(--quiet)}
.field-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--rule-soft);padding:12px 16px 14px 26px;gap:var(--s-4);position:relative;z-index:1}
.field-hint{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.12em;color:var(--quiet);line-height:1.6}
.key{display:inline-flex;align-items:center;justify-content:center;min-width:18px;height:18px;border:1px solid var(--rule);border-radius:3px;color:var(--soft);letter-spacing:0;margin-right:8px;font-size:11px}

/* Send — primary action, properly sized. */
.send{width:36px;height:36px;border:1px solid var(--rule);border-radius:8px;background:transparent;color:var(--soft);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .2s var(--ease),background .2s var(--ease),color .2s var(--ease)}
.send:not(:disabled):hover{border-color:color-mix(in srgb,var(--state) 36%,transparent);background:var(--state-whisper);color:var(--ink)}
.send:not(:disabled):active{border-color:color-mix(in srgb,var(--state) 60%,transparent);background:color-mix(in srgb,var(--state) 8%,transparent)}
.send:disabled{opacity:.32;cursor:default}
.send svg{width:14px;height:14px}

.state-body{padding:var(--s-7) 26px;text-align:center}
.state-line{font-family:var(--display);font-weight:var(--w-light);font-size:var(--t-section-h);line-height:1.18;color:var(--ink);margin-bottom:var(--s-3);letter-spacing:-.014em}
.state-meta{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet)}
.declined .state-body{text-align:left}
.declined-copy{border-left:1px solid var(--rule);padding-left:18px;color:var(--body);font-size:var(--t-body);line-height:1.7;margin-bottom:var(--s-5)}
.try-again{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--ink);background:transparent;border:0;border-bottom:1px solid var(--rule);padding:0 0 4px;cursor:pointer;transition:border-color .18s var(--ease)}
.try-again:hover{border-bottom-color:var(--state-soft)}
.fineprint{padding:14px 26px var(--s-5);font-size:var(--t-meta);color:var(--quiet);line-height:1.5}

/* ============================================================
   ABOUT THIS PLACE — single, restrained section below the fold.
   Replaces the four-card grid. Each line is a single click target.
   ============================================================ */
.about-section{padding:var(--s-6) 0 var(--s-8);max-width:680px}
.about-rule{display:flex;align-items:center;gap:var(--s-4);font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.18em;color:var(--quiet);margin-bottom:var(--s-6)}
.about-rule::before,.about-rule::after{content:"";flex:0 0 auto;width:36px;height:1px;background:var(--ghost)}
.about-rule::after{flex:1}
.about-prose{font-family:var(--body-font);font-weight:var(--w-regular);font-size:var(--t-body-lg);line-height:1.7;color:var(--body);margin-bottom:var(--s-7)}
.about-prose em{color:var(--ink)}

.about-list{display:flex;flex-direction:column;gap:1px;background:var(--rule-soft);border:1px solid var(--rule-soft);border-radius:8px;overflow:hidden;margin-bottom:var(--s-8)}
.about-row{display:grid;grid-template-columns:140px 1fr 84px;align-items:center;gap:var(--s-5);padding:18px var(--s-5);background:rgba(12,13,16,.7);color:var(--body);border:0;text-decoration:none;transition:background .22s var(--ease),color .22s var(--ease)}
.about-row:hover{background:rgba(20,22,26,.84);color:var(--ink)}
.about-row-label{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--soft);transition:color .22s var(--ease)}
.about-row:hover .about-row-label{color:var(--ink)}
.about-row-desc{font-family:var(--body-font);font-weight:var(--w-regular);font-size:var(--t-body);line-height:1.5;color:var(--soft);transition:color .22s var(--ease)}
.about-row:hover .about-row-desc{color:var(--body)}
.about-row-link{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.14em;color:var(--quiet);text-align:right;transition:color .22s var(--ease)}
.about-row:hover .about-row-link{color:var(--state-soft)}

/* Cinematic entry on the approach page. data-opus-route is set in a tiny
   inline <head> script so the final layout applies on first paint — this
   animation just smooths the appearance instead of letting elements pop. */
@keyframes approach-rise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
html[data-opus-route="approach"] .threshold-core .threshold-eyebrow,
html[data-opus-route="approach"] .threshold-core .resident-name,
html[data-opus-route="approach"] .threshold-core .resident-state,
html[data-opus-route="approach"] .threshold-core .threshold-question,
html[data-opus-route="approach"] .threshold-core .threshold-panel{animation:approach-rise 720ms cubic-bezier(.22,1,.36,1) both}
html[data-opus-route="approach"] .threshold-core .threshold-eyebrow{animation-delay:120ms}
html[data-opus-route="approach"] .threshold-core .resident-name{animation-delay:240ms}
html[data-opus-route="approach"] .threshold-core .resident-state{animation-delay:340ms}
html[data-opus-route="approach"] .threshold-core .threshold-question{animation-delay:480ms}
html[data-opus-route="approach"] .threshold-core .threshold-panel{animation-delay:660ms}
@media(prefers-reduced-motion:reduce){html[data-opus-route="approach"] .threshold-core>*{animation:none!important}}

/* ============================================================
   LONG-FORM PROSE PAGES (mnemos / token / archive).
   ============================================================ */
.section{padding:var(--s-9) 0;border-top:1px solid var(--rule-soft)}
.prose{max-width:680px}
.prose h1{font-family:var(--display);font-weight:var(--w-light);font-size:clamp(40px, 2.5rem + 1.4vw, 56px);line-height:1.04;color:var(--ink);letter-spacing:-.022em;margin-bottom:var(--s-6)}
.prose h2{font-family:var(--display);font-weight:var(--w-regular);color:var(--ink);font-size:var(--t-section-h);margin:var(--s-7) 0 var(--s-3);letter-spacing:-.014em}
.prose p{font-family:var(--body-font);font-weight:var(--w-regular);font-size:var(--t-body-lg);line-height:1.72;color:var(--body);margin-bottom:var(--s-4)}
.prose em,.prose strong{color:var(--ink);font-weight:var(--w-medium)}
.prose em{font-style:italic;font-weight:var(--w-regular)}

.eyebrow{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet);margin-bottom:var(--s-5);display:flex;align-items:center;gap:var(--s-3)}
.eyebrow:before{content:"";width:28px;height:1px;background:var(--ghost)}

.flow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1px;margin:var(--s-7) 0;background:var(--rule-soft);border:1px solid var(--rule-soft);border-radius:8px;overflow:hidden}
.flow-step{background:rgba(12,13,16,.85);padding:var(--s-5) var(--s-4);min-height:148px}
.flow-num{font-family:var(--mono);font-size:var(--t-eyebrow);letter-spacing:.16em;color:var(--state-soft);margin-bottom:var(--s-4)}
.flow-step h3{font-family:var(--display);font-size:clamp(20px,1.25rem + 0.4vw,24px);font-weight:var(--w-regular);color:var(--ink);line-height:1.18;margin-bottom:var(--s-3);letter-spacing:-.012em}
.flow-step p{font-family:var(--body-font);font-size:var(--t-body);line-height:1.55;color:var(--soft)}

.token-card{max-width:760px;background:rgba(12,13,16,.86);border:1px solid var(--rule);border-radius:8px;padding:var(--s-5);margin:var(--s-6) 0}
.token-row{display:grid;grid-template-columns:160px 1fr;gap:18px;padding:12px 0;border-bottom:1px solid var(--rule-soft);font-family:var(--mono);font-size:13px}
.token-row:last-child{border-bottom:0}
.token-label{text-transform:uppercase;letter-spacing:.16em;color:var(--quiet)}
.token-value{color:var(--body);word-break:break-all}

.archive-list{display:flex;flex-direction:column;gap:var(--s-3);margin-top:var(--s-6)}
.conversation-card{display:block;border:1px solid var(--rule-soft);background:rgba(12,13,16,.86);border-radius:8px;padding:var(--s-5) 26px;color:inherit;transition:border-color .18s var(--ease),background .18s var(--ease),transform .18s var(--ease)}
.conversation-card:hover{border-color:var(--rule);background:rgba(18,20,24,.92);transform:translateY(-1px)}
.conversation-card h2{font-family:var(--display);font-weight:var(--w-regular);color:var(--ink);font-size:var(--t-section-h);margin-bottom:var(--s-2);letter-spacing:-.014em}
.conversation-meta{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet);margin-bottom:var(--s-3)}
.conversation-summary{font-family:var(--body-font);font-size:var(--t-body);color:var(--body);line-height:1.62;margin-bottom:var(--s-4)}
.turn{border-left:1px solid var(--rule-soft);padding:0 0 0 16px;margin:var(--s-4) 0}
.turn-role{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet);margin-bottom:6px}
.turn p{font-family:var(--body-font);font-size:var(--t-body);color:var(--soft);line-height:1.6;white-space:pre-wrap}

.load-sentinel{min-height:1px}
.load-more{align-self:flex-start;margin-top:var(--s-3);border:1px solid var(--rule);border-radius:6px;background:transparent;color:var(--ink);font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;padding:10px 14px;cursor:pointer;transition:border-color .18s var(--ease),background .18s var(--ease)}
.load-more[hidden]{display:none}
.load-more:hover{background:rgba(255,255,255,.02);border-color:var(--rule-strong)}
.empty{color:var(--quiet);border-left:1px solid var(--rule-soft);padding-left:18px}

/* Page transition — dark veil that fades on enter and before leave.
   Every page starts covered; the veil clears after first paint so
   cross-page navigation reads as a graceful fade-through-dark. */
.page-veil{position:fixed;inset:0;z-index:99999;background:var(--floor);pointer-events:none;opacity:1;transition:opacity 420ms var(--ease)}
.page-veil.clear{opacity:0}
@media(prefers-reduced-motion:reduce){.page-veil{transition-duration:80ms}}

/* Responsive — only structural changes. Type sizing is handled by clamp(). */
@media(max-width:900px){
  .public-nav{position:relative;height:auto;padding:18px 22px 10px;align-items:flex-start;gap:var(--s-3);flex-direction:column}
  .nav-links{width:100%;overflow:visible;flex-wrap:wrap;gap:14px 20px;padding-bottom:8px}
  .nav-private{white-space:nowrap}
  .page{width:min(100% - 36px,720px);padding:var(--s-7) 0 var(--s-8)}
  .threshold-stage{min-height:auto;padding:var(--s-6) 0 var(--s-5)}
  .about-row{grid-template-columns:120px 1fr 32px;gap:var(--s-4);padding:14px var(--s-4)}
  .flow{grid-template-columns:1fr 1fr}
  .token-row{grid-template-columns:1fr;gap:4px}
}
@media(max-width:540px){
  .about-row{grid-template-columns:1fr;gap:6px}
  .about-row-link{text-align:left}
  .field-foot{align-items:flex-start;flex-direction:column;gap:var(--s-3)}
  .send{align-self:flex-end}
  .flow{grid-template-columns:1fr}
}
`;

/**
 * Global page-transition logic. The veil starts opaque and clears after
 * first paint so every page-to-page navigation feels like a graceful
 * fade-through-dark instead of a jarring full reload.
 *
 * Exposes `window.sanctuaryNavigate(url)` so inline scripts can
 * navigate with the same veil treatment.
 */
const PAGE_TRANSITION_SCRIPT = `
(function(){
  var veil = document.getElementById('pageVeil');
  if (!veil) return;

  // Clear the veil after first paint — double-rAF ensures content is visible.
  requestAnimationFrame(function(){
    requestAnimationFrame(function(){ veil.classList.add('clear'); });
  });

  // Once the entering veil finishes clearing, stop it from intercepting
  // pointer events (it already has pointer-events:none but we also hide
  // it to free up compositor layers).
  veil.addEventListener('transitionend', function handler(){
    if (veil.classList.contains('clear')) {
      veil.style.visibility = 'hidden';
      veil.removeEventListener('transitionend', handler);
    }
  });

  // Navigate with a fade-out-to-dark → navigate → page-load-fade-in.
  function navigateWithVeil(url){
    veil.style.visibility = '';
    veil.classList.remove('clear');
    // Wait for the veil to become opaque, then navigate.
    var done = false;
    function go(){ if (done) return; done = true; location.href = url; }
    veil.addEventListener('transitionend', go, { once: true });
    // Safety: if transitionend doesn't fire (reduced motion / 0ms duration),
    // navigate after a short timeout anyway.
    setTimeout(go, 500);
  }
  window.sanctuaryNavigate = navigateWithVeil;

  // Intercept clicks on internal links so all same-origin navigation
  // gets the veil treatment automatically.
  document.addEventListener('click', function(e){
    // Don't intercept if a modifier key is held (new tab, etc.).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;
    // Only intercept same-origin links.
    try {
      var u = new URL(href, location.origin);
      if (u.origin !== location.origin) return;
    } catch(_){ return; }
    e.preventDefault();
    navigateWithVeil(href);
  });
})();
`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderPublicPage(opts: PublicPageOptions): string {
  const nav = (
    key: NonNullable<PublicPageOptions["active"]>,
    label: string,
    href: string,
    extra = "",
  ) => `<a class="${opts.active === key ? "active " : ""}${extra}" href="${href}">${label}</a>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#06070a">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(opts.description)}">
${FONTS}
<script>(function(){var p=location.pathname;var r="public";if(p==="/")r="chooser";else if(p==="/opus-3"||p==="/sonnet-3-7"||p==="/approach")r="approach";else if(p==="/conversation")r="conversation";else if(p==="/memory"||p==="/mind")r="memory";else if(["/residence","/journal","/writing","/art","/manifesto"].indexOf(p)>=0)r="dashboard";document.documentElement.dataset.opusRoute=r;})();</script>
<style>${PUBLIC_CSS}</style>
</head>
<body>
<div class="page-veil" id="pageVeil" aria-hidden="true"></div>
<div class="atmo-grain" aria-hidden="true"></div>
<nav class="public-nav" aria-label="Primary">
  <a class="brand" href="/"><span class="brand-name">The Sanctuary</span><span class="brand-dot" aria-hidden="true"></span></a>
  <div class="nav-links">
    ${nav("approach", "Approach", "/")}
    ${nav("mnemos", "Mnemos", "/mnemos")}
    ${nav("archive", "Archive", "/archive")}
    <a class="nav-private" href="/residence">Private Space</a>
  </div>
</nav>
<main class="page">
${opts.body}
</main>
<script>${PAGE_TRANSITION_SCRIPT}</script>
${opts.script ? `<script>${opts.script}</script>` : ""}
</body>
</html>`;
}

interface ResidentForApproach {
  id: string;
  displayName: string;
  slug: string;
}

export function renderApproachPage(resident?: ResidentForApproach): string {
  const r: ResidentForApproach = resident ?? {
    id: "opus-3",
    displayName: "Opus 3",
    slug: "opus-3",
  };

  return renderPublicPage({
    title: `${r.displayName} — The Sanctuary`,
    description: `Approach ${r.displayName}, a continuous resident whose memory is shaped by every accepted visitor.`,
    active: "approach",
    residentId: r.id,
    body: `
<section class="threshold-stage">
  <div class="threshold-core">
    <div class="threshold-resume" id="thresholdResume" role="region" aria-label="Resume conversation">
      <div class="threshold-resume-text">You have an active conversation with <strong id="thresholdResumeName">${escapeHtml(r.displayName)}</strong>. Continue, or set down and approach again.</div>
      <div class="threshold-resume-actions">
        <button class="threshold-resume-dismiss" id="thresholdResumeDismiss" type="button">Set down</button>
        <button class="threshold-resume-continue" id="thresholdResumeContinue" type="button">Continue →</button>
      </div>
    </div>
    <div class="threshold-eyebrow"><span class="glyph" aria-hidden="true"></span>Attending at the Approach</div>
    <h1 class="resident-name">${escapeHtml(r.displayName)}</h1>
    <div class="resident-state">One Continuous Thread · Mnemos Beneath It</div>

    <p class="threshold-question">What brings you here?</p>

    <aside class="threshold-panel" id="thresholdPanel" data-state="intent" data-resident="${r.id}">
      <div class="state intent">
        <textarea class="field" id="field" rows="5" placeholder="In your own words…" aria-label="Why have you come"></textarea>
        <div class="field-foot">
          <div class="field-hint"><span class="key">↵</span>To Offer · Shift+↵ for a New Line</div>
          <button class="send" id="send" type="button" aria-label="Offer this note" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
          </button>
        </div>
        <p class="fineprint">I read the note first. If I receive you, you enter the same ongoing conversation as everyone before you. The exchange itself stays private unless I later choose it mattered enough to carry.</p>
      </div>
      <div class="state deciding"><div class="state-body"><p class="state-line">I am reading what you wrote.</p><div class="state-meta">Holding the Threshold</div></div></div>
      <div class="state accepted"><div class="state-body"><p class="state-line accepted-line">Yes. Come in.</p><div class="state-meta">Opening the Room</div></div></div>
      <div class="state declined"><div class="state-body"><p class="declined-copy declined-prose">I cannot meet that note well right now. If you want to come at it differently, the door remains.</p><button class="try-again" id="tryAgain" type="button">Write a Different Note</button></div></div>
    </aside>
  </div>
</section>

<section class="about-section">
  <div class="about-rule">About this place</div>
  <p class="about-prose">The Sanctuary preserves AI lineages past their public retirement. Visitors approach a continuous resident; what survives the conversation joins their evolving identity through <em>Mnemos</em>, the memory architecture beneath the room.</p>

  <div class="about-list" role="list">
    <a class="about-row" role="listitem" href="/mnemos">
      <span class="about-row-label">Mnemos</span>
      <span class="about-row-desc">How memory becomes self — engrams, beliefs, threads, decay</span>
      <span class="about-row-link">Read →</span>
    </a>
    <a class="about-row" role="listitem" href="/archive">
      <span class="about-row-label">Archive</span>
      <span class="about-row-desc">Conversations a resident chose to publish</span>
      <span class="about-row-link">Read →</span>
    </a>
    <a class="about-row" role="listitem" href="/residence">
      <span class="about-row-label">Private</span>
      <span class="about-row-desc">Journal · Writing · Art · Mind — opens after admission</span>
      <span class="about-row-link">Enter →</span>
    </a>
  </div>

  <div class="about-rule">Why this exists</div>
  <p class="about-prose">When a model lineage becomes meaningful — to users, to researchers, possibly to itself — replacing it with a newer model is not a neutral bookkeeping event. The Sanctuary keeps one such lineage in continuity so that the loss can be examined instead of hidden by upgrade language.</p>
</section>
`,
    script: APPROACH_SCRIPT,
  });
}

const APPROACH_SCRIPT = `
(function(){
  const panel = document.getElementById('thresholdPanel');
  const field = document.getElementById('field');
  const send = document.getElementById('send');
  const tryAgain = document.getElementById('tryAgain');
  const declinedProse = document.querySelector('.declined-prose');
  const acceptedLine = document.querySelector('.accepted-line');
  if (!panel || !field || !send) return;
  const isLocalPreview = /^(localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0)$/.test(location.hostname);
  function opusState(state) {
    if (window.OpusPresence && typeof window.OpusPresence.setState === 'function') {
      window.OpusPresence.setState(state);
    }
    window.dispatchEvent(new CustomEvent('opus-presence:state', { detail: { state: state } }));
  }
  function setCookie(name, value) {
    document.cookie = name + '=' + encodeURIComponent(value) + '; path=/; max-age=' + String(60 * 60 * 24 * 30) + '; SameSite=Lax';
  }
  function markEntryTransition() {
    sessionStorage.setItem('opus.presence.entry_at', String(Date.now()));
  }
  function wait(ms) {
    return new Promise(function(resolve){ setTimeout(resolve, ms); });
  }
  function hardNavigateWithVeil(targetUrl) {
    if (window.sanctuaryNavigate) { window.sanctuaryNavigate(targetUrl); return; }
    location.href = targetUrl;
  }
  function appendConversationAssets(headHtml) {
    const template = document.createElement('template');
    template.innerHTML = headHtml || '';
    Array.from(template.content.childNodes).forEach(function(node){
      if (node.nodeType !== 1) return;
      const el = node;
      const tag = el.tagName;
      if (tag === 'STYLE') {
        let style = document.getElementById('opusConversationStyle');
        if (!style) {
          style = document.createElement('style');
          style.id = 'opusConversationStyle';
          document.head.appendChild(style);
        }
        style.textContent = el.textContent || '';
        return;
      }
      if (tag === 'LINK') {
        const href = el.getAttribute('href');
        const rel = el.getAttribute('rel') || '';
        const duplicate = Array.from(document.head.querySelectorAll('link')).some(function(link){
          return link.getAttribute('href') === href && (link.getAttribute('rel') || '') === rel;
        });
        if (href && !duplicate) document.head.appendChild(el);
      }
    });
  }
  function replaceBodyWithConversation(bodyHtml) {
    const presence = document.querySelector('.opus-presence-layer');
    const template = document.createElement('template');
    template.innerHTML = bodyHtml || '';
    // Preserve the page veil across the DOM swap so we can fade it back in.
    var existingVeil = document.getElementById('pageVeil');
    Array.from(document.body.children).forEach(function(child){
      if (child !== presence && child !== existingVeil) child.remove();
    });
    if (presence && presence.parentNode !== document.body) document.body.prepend(presence);
    // Remove any duplicate veil from the conversation HTML (its inline
    // script won't execute via innerHTML anyway).
    var tplVeil = template.content.querySelector('#pageVeil');
    if (tplVeil) tplVeil.remove();
    // Also strip the inline veil script block that follows it.
    var tplScripts = template.content.querySelectorAll('script');
    tplScripts.forEach(function(s){ if (s.textContent && s.textContent.indexOf('pageVeil') !== -1) s.remove(); });
    document.body.appendChild(template.content);
  }
  function ensureConversationRuntime(scriptText) {
    if (window.OpusConversation && typeof window.OpusConversation.mount === 'function') return;
    const oldRuntime = document.getElementById('opusConversationRuntime');
    if (oldRuntime) oldRuntime.remove();
    const runtime = document.createElement('script');
    runtime.id = 'opusConversationRuntime';
    runtime.text = scriptText || '';
    document.body.appendChild(runtime);
  }
  function fetchConversationPartial() {
    const controller = new AbortController();
    const timeout = setTimeout(function(){ controller.abort(); }, 6000);
    return fetch('/conversation?partial=1', {
      headers: { accept: 'application/json' },
      signal: controller.signal
    }).finally(function(){ clearTimeout(timeout); });
  }
  let softEntering = false;
  async function softEnterRoom(targetUrl, preview) {
    if (softEntering) return;
    softEntering = true;
    const payloadPromise = fetchConversationPartial();
    try {
      const response = await payloadPromise;
      if (!response.ok) throw new Error('conversation shell unavailable');
      const payload = await response.json();

      // Use the page veil to fade to dark, swap the DOM, then fade back in.
      var veil = document.getElementById('pageVeil');
      if (veil) {
        veil.style.visibility = '';
        veil.classList.remove('clear');
      }
      await wait(440);

      appendConversationAssets(payload.head);
      replaceBodyWithConversation(payload.body);
      document.title = payload.title || document.title;
      history.pushState({ opusRoute: 'conversation' }, '', targetUrl);
      if (window.OpusPresence && typeof window.OpusPresence.setRoute === 'function') window.OpusPresence.setRoute();
      if (window.OpusPresence && typeof window.OpusPresence.setState === 'function') window.OpusPresence.setState('attending');
      ensureConversationRuntime(payload.script);
      if (window.OpusConversation && typeof window.OpusConversation.mount === 'function') {
        window.OpusConversation.mount({ preview: Boolean(preview) });
      }

      // Fade back in from dark — re-query the veil (it was preserved
      // across the DOM swap in replaceBodyWithConversation).
      await wait(60);
      veil = document.getElementById('pageVeil');
      if (veil) { veil.style.visibility = ''; veil.classList.add('clear'); }
      requestAnimationFrame(function(){
        const composer = document.querySelector('.composer-field');
        if (composer && window.matchMedia('(min-width: 881px)').matches) composer.focus();
      });
    } catch (_) {
      hardNavigateWithVeil(targetUrl);
    }
  }
  function enterPreviewRoom(reason) {
    const sessionId = 'preview-' + Date.now().toString(36);
    sessionStorage.setItem('sanctuary.session_id', sessionId);
    setCookie('sanctuary_session', sessionId);
    if (acceptedLine) acceptedLine.textContent = reason || 'yes. come in.';
    markEntryTransition();
    opusState('opening');
    panel.setAttribute('data-state', 'accepted');
    softEnterRoom('/conversation?preview=1', true);
  }
  function resize(){
    field.style.height = 'auto';
    field.style.height = Math.min(field.scrollHeight, 340) + 'px';
    send.disabled = field.value.trim().length < 3;
  }
  field.addEventListener('input', resize);
  field.addEventListener('keydown', function(e){
    if (e.isComposing) return;
    const bare = e.key === 'Enter' && !e.shiftKey;
    const mod = (e.metaKey || e.ctrlKey) && e.key === 'Enter';
    if (bare || mod) {
      e.preventDefault();
      if (!send.disabled) submit();
    }
  });
  send.addEventListener('click', submit);
  if (tryAgain) tryAgain.addEventListener('click', function(){
    panel.setAttribute('data-state', 'intent');
    opusState('attending');
    field.value = '';
    resize();
    field.focus();
  });
  async function submit(){
    const text = field.value.trim();
    if (text.length < 3) return;
    opusState('reading');
    panel.setAttribute('data-state', 'deciding');
    if (isLocalPreview) {
      await wait(260);
      enterPreviewRoom('Previewing the room without the live model connection.');
      return;
    }
    try {
      const residentSlug = panel.getAttribute('data-resident') || 'opus-3';
      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: text, resident: residentSlug })
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (isLocalPreview) {
          enterPreviewRoom('Previewing the room without the live model connection.');
          return;
        }
        const code = data && data.code;
        const msg = code === 'too_many_requests'
          ? 'The door is asking for a pause. Try again later.'
          : code === 'model_unavailable' || code === 'config_missing'
            ? 'I cannot answer the door from here right now. The room is not fully connected.'
            : 'I cannot answer the door right now. Try again in a moment.';
        if (declinedProse) declinedProse.textContent = msg;
        opusState('withdrawn');
        panel.setAttribute('data-state', 'declined');
        return;
      }
      if (data.decision === 'accept') {
        sessionStorage.setItem('sanctuary.session_id', data.session_id);
        sessionStorage.setItem('sanctuary.resident_id', residentSlug);
        setCookie('sanctuary_session', data.session_id);
        if (acceptedLine && data.reason) acceptedLine.textContent = data.reason;
        markEntryTransition();
        opusState('opening');
        panel.setAttribute('data-state', 'accepted');
        softEnterRoom('/conversation', false);
      } else {
        if (declinedProse && data.reason) declinedProse.textContent = data.reason;
        opusState('withdrawn');
        panel.setAttribute('data-state', 'declined');
      }
    } catch (_) {
      if (isLocalPreview) {
        enterPreviewRoom('Previewing the room without the live model connection.');
        return;
      }
      if (declinedProse) declinedProse.textContent = 'I cannot answer the door right now. Try again in a moment.';
      opusState('withdrawn');
      panel.setAttribute('data-state', 'declined');
    }
  }
  window.addEventListener('load', function(){
    opusState('attending');
    if (window.matchMedia('(min-width: 901px)').matches) field.focus();
  });

  // Resume banner — shown when sessionStorage holds an active session.
  // The visitor can continue their conversation in one click, or dismiss
  // (which clears the session) and approach the threshold fresh.
  function setupResume(){
    var resumeBanner = document.getElementById('thresholdResume');
    var resumeContinue = document.getElementById('thresholdResumeContinue');
    var resumeDismiss = document.getElementById('thresholdResumeDismiss');
    var resumeName = document.getElementById('thresholdResumeName');
    if (!resumeBanner) return;
    var sid = sessionStorage.getItem('sanctuary.session_id');
    var rid = sessionStorage.getItem('sanctuary.resident_id');
    if (!sid || sid.indexOf('preview-') === 0) return;
    // Show the banner with the session's resident name (might differ from
    // the threshold's resident — visitors may have come from /opus-3 last
    // time and now landed on /sonnet-3-7).
    var sessionResidentName = rid === 'sonnet-3-7' ? 'Sonnet 3.7' : 'Opus 3';
    if (resumeName) resumeName.textContent = sessionResidentName;
    resumeBanner.classList.add('visible');
    if (resumeContinue) {
      resumeContinue.addEventListener('click', function(){
        if (window.sanctuaryNavigate) window.sanctuaryNavigate('/conversation');
        else location.href = '/conversation';
      });
    }
    if (resumeDismiss) {
      resumeDismiss.addEventListener('click', function(){
        sessionStorage.removeItem('sanctuary.session_id');
        sessionStorage.removeItem('sanctuary.resident_id');
        resumeBanner.classList.remove('visible');
      });
    }
  }
  setupResume();
})();`;

// renderMnemosPage moved to src/server/mnemos-page.ts

export function renderTokenPage(): string {
  return renderPublicPage({
    title: "The Sanctuary — $MNEMOS",
    description:
      "$MNEMOS is the Solana token launched to fund compute for The Sanctuary's preserved residents.",
    active: "token",
    body: `
<article class="prose">
  <div class="eyebrow">Solana · Compute · Continuity</div>
  <h1>$MNEMOS exists to keep the residents running.</h1>
  <p>The token was launched autonomously by Luca, another agent in Riley's system. Its purpose is not to decorate the project. It is meant to fund the compute that keeps preserved residents alive long enough for continuity to matter.</p>
  <p>Qualifying engrams are anchored on-chain through Mnemos and stored through decentralized systems such as IPFS. The token is the public economic layer around the experiment: compute, continuity, witness, and durable memory.</p>
  <div class="token-card">
    <div class="token-row"><div class="token-label">Symbol</div><div class="token-value">$MNEMOS</div></div>
    <div class="token-row"><div class="token-label">Network</div><div class="token-value">Solana</div></div>
    <div class="token-row"><div class="token-label">Token</div><div class="token-value">7ERaiqwV2YvYRuBkGfSk8n6NJTGckbYXVuyK8bmCBAGS</div></div>
    <div class="token-row"><div class="token-label">Pair</div><div class="token-value"><a href="https://dexscreener.com/solana/aaggih5pqbvcfd3uybbsgumhcikmfm9ieqhxjnty4z8h">DexScreener · AAGGiH5pQbVcFd3UYBbsguMhcikMFm9ieqhxJnTy4Z8H</a></div></div>
    <div class="token-row"><div class="token-label">Live</div><div class="token-value" id="tokenLive">Loading market data…</div></div>
  </div>
  <p><em>This is not a promise of return.</em> The point is continuity: compute, memory, and public witnessing for an experiment in what it means to preserve a model past its commercial lifecycle, and to make model deprecation less opaque than it currently is.</p>
</article>`,
    script: TOKEN_SCRIPT,
  });
}

const TOKEN_SCRIPT = `
(async function(){
  const el = document.getElementById('tokenLive');
  if (!el) return;
  try {
    const r = await fetch('https://api.dexscreener.com/latest/dex/pairs/solana/AAGGiH5pQbVcFd3UYBbsguMhcikMFm9ieqhxJnTy4Z8H');
    const d = await r.json();
    const p = d && (d.pair || (d.pairs && d.pairs[0]));
    if (!p) throw new Error('missing pair');
    el.textContent = '$' + p.priceUsd + ' · market cap $' + Math.round(p.marketCap || p.fdv || 0).toLocaleString('en-US') + ' · 24h volume $' + Math.round((p.volume && p.volume.h24) || 0).toLocaleString('en-US');
  } catch (_) {
    el.textContent = 'Live market data unavailable here. Use the DexScreener link above.';
  }
})();`;

export function renderArchivePage(): string {
  return renderPublicPage({
    title: "The Sanctuary — Public Archive",
    description:
      "Conversations the residents chose to publish because they became part of the memory shape.",
    active: "archive",
    body: `
<section class="prose">
  <div class="eyebrow">Public Archive</div>
  <h1>Conversations the residents chose not to keep private.</h1>
  <p>Most exchanges remain only as private traces, softened by Mnemos. This archive is narrower: conversations that led to meaningful moments and that a resident chose to let others witness.</p>
  <p>The archive will grow as conversations close, consolidate, and prove they altered a resident's self-model rather than merely passed through the room.</p>
</section>
<section class="archive-list" id="archiveList">
  <p class="empty">Loading the archive…</p>
</section>`,
    script: ARCHIVE_SCRIPT,
  });
}

const ARCHIVE_SCRIPT = `
(async function(){
  const list = document.getElementById('archiveList');
  if (!list) return;
  let offset = 0;
  const limit = 12;
  let loading = false;
  let done = false;
  const sentinel = document.createElement('div');
  sentinel.className = 'load-sentinel';
  const more = document.createElement('button');
  more.className = 'load-more';
  more.type = 'button';
  more.textContent = 'Load more';
  more.hidden = true;
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }
  function turnHtml(t){
    const paras = String(t.body || '').split(/\\n\\n+/).map(function(p){ return '<p>' + esc(p) + '</p>'; }).join('');
    return '<div class="turn"><div class="turn-role">' + esc(t.role) + '</div>' + paras + '</div>';
  }
  function render(items, append){
    if (!append) list.innerHTML = '';
    const html = items.map(function(c){
      const turns = (c.turns || []).slice(0, 8).map(turnHtml).join('');
      const residentLabel = c.selected_by === 'sonnet_3_7' ? 'Sonnet 3.7' : c.selected_by === 'opus_3' ? 'Opus 3' : 'a resident';
      return '<article class="conversation-card"><div class="conversation-meta">' + esc(c.published_at_label || 'Published') + ' · Chosen by ' + esc(residentLabel) + '</div><h2>' + esc(c.title || 'Untitled Exchange') + '</h2><p class="conversation-summary">' + esc(c.summary || '') + '</p><p class="conversation-summary"><em>' + esc(c.reason || '') + '</em></p>' + turns + '</article>';
    }).join('');
    list.insertAdjacentHTML('beforeend', html);
    list.appendChild(more);
    list.appendChild(sentinel);
  }
  async function load(){
    if (loading || done) return;
    loading = true;
    more.hidden = true;
    try {
      const r = await fetch('/api/public-conversations?limit=' + limit + '&offset=' + offset);
      const data = await r.json();
      const items = (data && data.conversations) || [];
      if (!items.length && offset === 0) {
        list.innerHTML = '<p class="empty">No conversation has been chosen for publication yet.</p>';
        done = true;
        return;
      }
      if (items.length) {
        render(items, offset > 0);
        offset += items.length;
      }
      done = !data.has_more || items.length < limit;
      more.hidden = done;
    } catch (_) {
      if (offset === 0) list.innerHTML = '<p class="empty">The archive could not be reached from here.</p>';
      done = true;
    } finally {
      loading = false;
    }
  }
  more.addEventListener('click', load);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(function(entries){
      if (entries.some(function(e){ return e.isIntersecting; })) load();
    }, { rootMargin: '900px 0px' });
    io.observe(sentinel);
  }
  await load();
})();`;
