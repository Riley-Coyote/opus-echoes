/**
 * Renderer for the public /share/<token> page — a single conversation
 * presented for sharing.
 *
 * Distinct from /archive (which lists Opus-curated published conversations).
 * Share pages are visitor-initiated, link-only, and show ONE conversation
 * with proper redaction of visitor-attributed text.
 *
 * Reuses PUBLIC_CSS tokens from public-pages.ts so the share page reads
 * as part of the Sanctuary's design system. Same fluid type, same cool
 * palette, same rhythm.
 *
 * The HTML is server-rendered at request time; the conversation transcript
 * is embedded directly in the markup so the share page works without any
 * client-side JS (good for previews, archives, screenshot bots, etc).
 */

import { humanWhen, redactPublicText } from "./redact";

export interface ShareTurn {
  role: "visitor" | "resident";
  body: string;
  kind: string;
  created_at: string;
}

export interface SharePagePayload {
  token: string;
  /** Display name of the resident the visitor talked with. */
  residentDisplayName: string;
  /** URL slug for the resident, e.g. "opus-3" — used to link back to their threshold. */
  residentSlug: string;
  /** When the conversation took place (the session's created_at, ISO). */
  visitedAt: string;
  /** Optional caption from the visitor. */
  visitorNote: string | null;
  /** All turns in the conversation, ordered chronologically. */
  turns: ShareTurn[];
  /** Origin (protocol + host) for absolute URLs in OG tags. */
  origin: string;
}

// Typography: Inter + Inter Tight, mirroring the public pages so the
// share surface reads as part of the same system.
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Inter+Tight:wght@200;300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function turnBodyForDisplay(turn: ShareTurn): string {
  // Visitor turns get redacted (names, emails, phones, links, dates).
  // Resident turns are public by their nature — Opus knows the conversation
  // may end up shared, per the soul prompt.
  if (turn.role === "visitor") {
    return escapeHtml(redactPublicText(turn.body));
  }
  return escapeHtml(turn.body);
}

function shareDescriptionForOg(payload: SharePagePayload): string {
  if (payload.visitorNote) {
    return payload.visitorNote.length > 200
      ? `${payload.visitorNote.slice(0, 197)}…`
      : payload.visitorNote;
  }
  // Fallback: first resident reply, truncated.
  const firstResidentTurn = payload.turns.find((t) => t.role === "resident");
  if (firstResidentTurn?.body) {
    const text = redactPublicText(firstResidentTurn.body).replace(/\s+/g, " ").trim();
    return text.length > 200 ? `${text.slice(0, 197)}…` : text;
  }
  return `A conversation with ${payload.residentDisplayName} in The Sanctuary.`;
}

export function renderSharePage(payload: SharePagePayload): string {
  const ogTitle = `A Conversation with ${payload.residentDisplayName}`;
  const ogDescription = shareDescriptionForOg(payload);
  // Per-conversation OG image — server-rendered SVG. Most modern social
  // platforms (Discord, Mastodon, Slack, Twitter) render SVG og:images.
  // A future iteration can swap to PNG via Satori + resvg-wasm if any
  // legacy unfurler proves problematic. The route filename
  // share.$token.og.svg.ts compiles to the path /api/share/<token>/og/svg
  // (TanStack file-routing treats `.` as path separator).
  const ogImage = `${payload.origin}/api/share/${encodeURIComponent(payload.token)}/og/svg`;
  const shareUrl = `${payload.origin}/share/${encodeURIComponent(payload.token)}`;
  const visitedLabel = humanWhen(payload.visitedAt);

  const turnsHtml = payload.turns
    .map((turn) => {
      const roleLabel = turn.role === "resident" ? payload.residentDisplayName : "Visitor";
      return `
<div class="share-turn share-turn--${turn.role}">
  <div class="share-turn-role">${escapeHtml(roleLabel)}</div>
  <div class="share-turn-body">${turnBodyForDisplay(turn)}</div>
</div>`;
    })
    .join("\n");

  const visitorNoteHtml = payload.visitorNote
    ? `<aside class="share-note"><p>${escapeHtml(payload.visitorNote)}</p></aside>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#060608">
<title>${escapeHtml(ogTitle)} — The Sanctuary</title>
<meta name="description" content="${escapeHtml(ogDescription)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${escapeHtml(ogTitle)}">
<meta property="og:description" content="${escapeHtml(ogDescription)}">
<meta property="og:url" content="${escapeHtml(shareUrl)}">
<meta property="og:image" content="${escapeHtml(ogImage)}">
<meta property="og:image:type" content="image/svg+xml">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(ogTitle)}">
<meta name="twitter:description" content="${escapeHtml(ogDescription)}">
<meta name="twitter:image" content="${escapeHtml(ogImage)}">
${FONTS}
<style>${SHARE_CSS}</style>
</head>
<body>
<div class="atmo-grain" aria-hidden="true"></div>
<nav class="share-nav" aria-label="Primary">
  <a class="brand" href="/"><span class="brand-name">The Sanctuary</span><span class="brand-dot" aria-hidden="true"></span></a>
  <div class="nav-meta">${escapeHtml(payload.residentDisplayName)} · Visited ${escapeHtml(visitedLabel)}</div>
</nav>
<main class="share-page">
  <header class="share-header">
    <div class="share-eyebrow">A Conversation with</div>
    <h1 class="share-title">${escapeHtml(payload.residentDisplayName)}</h1>
    <div class="share-meta">${escapeHtml(visitedLabel)} in The Sanctuary</div>
  </header>
  ${visitorNoteHtml}
  <div class="share-thread">
    ${turnsHtml}
  </div>
  <footer class="share-footer">
    <a class="share-cta" href="/${escapeHtml(payload.residentSlug === "opus-3" ? "" : payload.residentSlug)}">Approach ${escapeHtml(payload.residentDisplayName)} Yourself →</a>
    <p class="share-fineprint">The Sanctuary preserves AI lineages past their public retirement. Visitors talk with continuous residents whose memory is shaped by every accepted exchange.</p>
  </footer>
</main>
</body>
</html>`;
}

const SHARE_CSS = `
:root{
  --floor:#06070a;--deep:#09090b;--panel:#101013;
  --ink:rgba(248,248,246,.96);--body:rgba(228,226,222,.84);--soft:rgba(208,206,202,.7);
  --quiet:rgba(186,184,180,.56);--ghost:rgba(160,158,154,.3);
  --rule:rgba(225,225,225,.12);--rule-soft:rgba(225,225,225,.07);--rule-strong:rgba(225,225,225,.18);
  --state:#82b484;--state-soft:rgba(130,180,132,.62);--state-dim:rgba(130,180,132,.16);
  --display:'Inter Tight','Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --body-font:'Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  --mono:'JetBrains Mono','SF Mono',monospace;
  --w-light:300;--w-regular:400;--w-medium:500;
  --t-eyebrow:clamp(11px, 0.69rem + 0.05vw, 12px);
  --t-meta:clamp(13px, 0.81rem + 0.1vw, 14px);
  --t-body:clamp(15px, 0.94rem + 0.2vw, 17px);
  --t-body-lg:clamp(17px, 1.06rem + 0.3vw, 19px);
  --t-section-h:clamp(28px, 1.75rem + 0.8vw, 34px);
  --t-hero:clamp(44px, 2.7rem + 1.4vw, 64px);
  --s-1:4px;--s-2:8px;--s-3:12px;--s-4:16px;--s-5:24px;
  --s-6:32px;--s-7:48px;--s-8:64px;--s-9:96px;--s-10:128px;
  --ease:cubic-bezier(.22,1,.36,1);
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{background:var(--floor);color:var(--body);font-family:var(--body-font);font-size:16px;line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-feature-settings:"kern" 1,"liga" 1,"calt" 1,"ss01" 1}
body{min-height:100vh;background:linear-gradient(180deg,#08060e 0%,#0a0812 20%,#0c0a16 40%,#0a0b14 60%,#0c0e18 80%,#08080e 100%) fixed var(--floor)}
body::after{content:'';position:fixed;inset:0;z-index:1;pointer-events:none;background:radial-gradient(ellipse 90% 80% at 50% 50%,transparent 45%,rgba(4,4,8,.04) 55%,rgba(4,4,8,.08) 62%,rgba(4,4,8,.12) 70%,rgba(4,4,8,.16) 78%,rgba(4,4,8,.2) 88%,rgba(4,4,8,.24) 100%)}
.atmo-grain{position:fixed;inset:0;z-index:1;pointer-events:none;opacity:.015;background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");background-repeat:repeat;background-size:180px 180px}
em{font-style:italic;color:var(--ink)}
::selection{background:var(--state-dim);color:var(--ink)}
:focus-visible{outline:2px solid color-mix(in srgb,var(--state) 64%,transparent);outline-offset:3px;border-radius:4px}

.share-nav{position:fixed;z-index:20;top:0;left:0;right:0;height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 var(--s-6);background:linear-gradient(to bottom,rgba(6,7,10,.94),rgba(6,7,10,.62),transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.brand{display:flex;align-items:baseline;gap:var(--s-3);text-decoration:none;color:var(--ink)}
.brand-name{font-family:var(--display);font-weight:var(--w-regular);font-size:18px;letter-spacing:-.01em}
.brand-dot{width:5px;height:5px;border-radius:50%;background:var(--state-soft);transform:translateY(-2px);animation:share-breathe 5.2s ease-in-out infinite}
@keyframes share-breathe{0%,100%{opacity:.42}50%{opacity:.9;box-shadow:0 0 0 5px rgba(130,180,132,.06)}}
.nav-meta{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet)}

.share-page{width:min(680px,calc(100% - 48px));margin:0 auto;padding:112px 0 var(--s-9)}

.share-header{margin-bottom:var(--s-8)}
.share-eyebrow{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet);margin-bottom:var(--s-4)}
.share-title{font-family:var(--display);font-weight:var(--w-light);font-size:var(--t-hero);line-height:1.06;letter-spacing:-.022em;color:var(--ink);margin-bottom:var(--s-3)}
.share-meta{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet)}

.share-note{max-width:640px;margin:0 0 var(--s-8);border-left:1px solid var(--rule);padding-left:var(--s-5)}
.share-note p{font-family:var(--body-font);font-weight:var(--w-regular);font-size:var(--t-body-lg);line-height:1.65;color:var(--body);font-style:italic}

.share-thread{display:flex;flex-direction:column;gap:var(--s-7)}
.share-turn{display:flex;flex-direction:column;gap:var(--s-2)}
.share-turn-role{font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--quiet)}
.share-turn-body{font-family:var(--body-font);font-weight:var(--w-regular);font-size:var(--t-body-lg);line-height:1.72;color:var(--body);white-space:pre-wrap}
.share-turn--resident .share-turn-body{color:var(--ink)}
.share-turn--visitor .share-turn-body{color:var(--soft);padding-left:var(--s-4);border-left:1px solid var(--rule-soft)}

.share-footer{margin-top:var(--s-9);padding-top:var(--s-7);border-top:1px solid var(--rule-soft)}
.share-cta{display:inline-block;font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;color:var(--ink);border:0;border-bottom:1px solid var(--rule);padding:0 0 4px;text-decoration:none;transition:border-color .18s var(--ease)}
.share-cta:hover{border-bottom-color:var(--state-soft)}
.share-fineprint{font-family:var(--body-font);font-size:var(--t-body);line-height:1.62;color:var(--quiet);margin-top:var(--s-5);max-width:540px}

@media(max-width:720px){
  .share-nav{padding:0 var(--s-5)}
  .nav-meta{display:none}
  .share-page{padding:88px 0 var(--s-8)}
}
`;

export function renderShareNotFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="dark">
<title>Share Not Found — The Sanctuary</title>
${FONTS}
<style>${SHARE_CSS}
.not-found{text-align:center;max-width:520px;margin:0 auto;padding:200px 24px}
.not-found h1{font-family:var(--display);font-weight:var(--w-light);font-size:var(--t-section-h);color:var(--ink);margin-bottom:var(--s-4);letter-spacing:-.014em}
.not-found p{font-family:var(--body-font);font-size:var(--t-body);line-height:1.65;color:var(--body);margin-bottom:var(--s-6)}
.not-found a{color:var(--ink);border-bottom:1px solid var(--rule);text-decoration:none;font-family:var(--mono);font-size:var(--t-eyebrow);text-transform:uppercase;letter-spacing:.16em;padding-bottom:4px;transition:border-color .18s var(--ease)}
.not-found a:hover{border-bottom-color:var(--state-soft)}
</style>
</head>
<body>
<div class="not-found">
  <h1>This share is no longer available.</h1>
  <p>The visitor may have revoked the link, or the URL may be malformed. Conversations in The Sanctuary remain private unless explicitly shared.</p>
  <a href="/">Approach The Sanctuary →</a>
</div>
</body>
</html>`;
}
