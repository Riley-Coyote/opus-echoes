/**
 * Review dashboard shell — server-rendered HTML for /review/*
 *
 * Internal admin UI gated by ?key=REVIEW_SECRET (cookie-persisted).
 * Returns 404 (not 401) on bad key so the route's existence isn't revealed.
 */

const COOKIE = "review_key";

function readCookie(request: Request, name: string): string | null {
  const c = request.headers.get("cookie");
  if (!c) return null;
  for (const part of c.split(";").map((p) => p.trim())) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1));
  }
  return null;
}

/**
 * Returns either a Response (404 or redirect-with-cookie) to short-circuit the
 * route, or null if the request is authorized and should proceed.
 */
export function checkReviewAccess(request: Request): Response | null {
  const secret = process.env.REVIEW_SECRET;
  if (!secret) {
    return new Response(notFoundHtml(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("key");
  const cookieKey = readCookie(request, COOKIE);

  if (queryKey === secret) {
    // Set cookie and redirect to clean URL
    url.searchParams.delete("key");
    return new Response(null, {
      status: 302,
      headers: {
        location: url.pathname + (url.search || ""),
        "set-cookie": `${COOKIE}=${encodeURIComponent(secret)}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax`,
      },
    });
  }
  if (cookieKey === secret) return null;

  return new Response(notFoundHtml(), { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
}

function notFoundHtml(): string {
  return `<!doctype html><html><head><title>404</title><meta name="robots" content="noindex"><style>body{background:#060608;color:#dcdbd8;font-family:-apple-system,system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}main{text-align:center}h1{font-weight:300;font-size:48px;margin:0 0 8px;letter-spacing:-0.02em}p{opacity:0.6;margin:0}</style></head><body><main><h1>404</h1><p>Not found.</p></main></html>`;
}

const REVIEW_CSS = `
:root {
  --bg-void: #060608;
  --bg-deep: #0a0a0c;
  --bg-panel: #0d0d10;
  --ink: rgba(220, 219, 216, 0.96);
  --text-body: rgba(220, 219, 216, 0.82);
  --text-soft: rgba(220, 219, 216, 0.6);
  --text-tertiary: rgba(220, 219, 216, 0.52);
  --text-faint: rgba(220, 219, 216, 0.38);
  --border-subtle: rgba(220, 219, 216, 0.09);
  --border-medium: rgba(220, 219, 216, 0.16);
  --state: #82b484;
  --visitor-tint: rgba(220, 219, 216, 0.03);
  --font-display: 'Inter Tight', -apple-system, system-ui, sans-serif;
  --font-sans: 'Inter', -apple-system, system-ui, sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg-void);
  color: var(--text-body);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
  font-weight: 400;
  min-height: 100vh;
  background-image: radial-gradient(ellipse at top, rgba(130, 180, 132, 0.04), transparent 60%);
}

.review-wrap { max-width: 900px; margin: 0 auto; padding: 48px 32px 96px; }
.review-wrap.wide { max-width: 1280px; }

.review-header { border-bottom: 1px solid var(--border-subtle); padding-bottom: 24px; margin-bottom: 32px; }
.review-title { font-family: var(--font-display); font-weight: 300; font-size: 32px; letter-spacing: -0.02em; color: var(--ink); margin: 0 0 16px; }
.review-tabs { display: flex; gap: 28px; margin-top: 8px; }
.review-tabs a { font-family: var(--font-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.13em; text-transform: uppercase; color: var(--text-tertiary); text-decoration: none; padding-bottom: 6px; border-bottom: 1px solid transparent; transition: color 160ms ease, border-color 160ms ease; }
.review-tabs a:hover { color: var(--text-body); }
.review-tabs a.active { color: var(--state); border-bottom-color: var(--state); }

.stats-bar { display: flex; gap: 32px; margin-top: 20px; font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-tertiary); }
.stats-bar strong { color: var(--ink); font-weight: 500; }

.section { margin-top: 40px; }
.section-label { font-family: var(--font-mono); font-size: 11px; font-weight: 500; letter-spacing: 0.13em; text-transform: uppercase; color: var(--text-soft); margin: 0 0 16px; }
.section h2 { font-family: var(--font-display); font-weight: 300; font-size: 22px; letter-spacing: -0.01em; color: var(--ink); margin: 0 0 16px; }

.session-row { display: block; padding: 18px 20px; background: var(--bg-deep); border: 1px solid var(--border-subtle); border-left: 2px solid transparent; margin-bottom: 8px; text-decoration: none; color: inherit; transition: border-color 160ms ease, background 160ms ease; }
.session-row:hover { border-left-color: var(--state); background: var(--bg-panel); }
.session-row .row-meta { display: flex; gap: 14px; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-tertiary); margin-bottom: 6px; flex-wrap: wrap; }
.session-row .row-meta .resident { color: var(--state); }
.session-row .row-intent { color: var(--text-body); font-size: 14px; }
.session-row .row-stats { display: flex; gap: 16px; margin-top: 8px; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-soft); }
.badge { display: inline-block; padding: 2px 8px; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; border: 1px solid var(--border-medium); border-radius: 2px; color: var(--text-soft); }
.badge.state { color: var(--state); border-color: rgba(130, 180, 132, 0.4); }

.load-more { display: block; width: 100%; padding: 14px; margin-top: 16px; background: transparent; border: 1px solid var(--border-medium); color: var(--text-body); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.13em; text-transform: uppercase; cursor: pointer; transition: background 160ms ease; }
.load-more:hover { background: var(--bg-deep); }

.loading, .empty { padding: 24px; text-align: center; color: var(--text-tertiary); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }

.transcript-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 32px; }
@media (max-width: 980px) { .transcript-grid { grid-template-columns: 1fr; } }

.back-link { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--text-soft); text-decoration: none; }
.back-link:hover { color: var(--state); }

.session-meta-block { padding: 20px; background: var(--bg-deep); border: 1px solid var(--border-subtle); margin-bottom: 24px; }
.session-meta-block .intent-quote { font-style: italic; color: var(--text-body); margin: 12px 0 0; padding-left: 12px; border-left: 2px solid var(--state); }

.turn { padding: 16px 20px; margin-bottom: 6px; border: 1px solid var(--border-subtle); }
.turn.visitor { background: var(--visitor-tint); }
.turn-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--text-tertiary); }
.turn-head .role { color: var(--state); font-weight: 500; }
.turn-body { white-space: pre-wrap; color: var(--text-body); font-size: 14.5px; }
.marginalia { margin-top: 10px; font-family: var(--font-mono); font-size: 10.5px; color: var(--text-soft); letter-spacing: 0.05em; }

.consol-card { padding: 16px 18px; background: var(--bg-deep); border: 1px solid var(--border-subtle); border-left: 2px solid var(--state); margin-bottom: 10px; }
.consol-card .quote { color: var(--ink); font-size: 14px; margin: 0 0 8px; }
.consol-card .meta { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); }

.kv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; padding: 20px; background: var(--bg-deep); border: 1px solid var(--border-subtle); }
.kv { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); }
.kv:last-child { border-bottom: none; }
.kv .k { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-soft); }
.kv .v { color: var(--ink); font-family: var(--font-mono); font-size: 12px; }

.bar-row { display: grid; grid-template-columns: 80px 1fr 50px; align-items: center; gap: 12px; padding: 6px 0; font-family: var(--font-mono); font-size: 11px; }
.bar-row .label { color: var(--text-soft); letter-spacing: 0.08em; text-transform: uppercase; }
.bar-row .bar { height: 8px; background: var(--bg-deep); border: 1px solid var(--border-subtle); position: relative; }
.bar-row .bar > span { display: block; height: 100%; background: var(--state); }
.bar-row .count { color: var(--ink); text-align: right; }

.spark { display: flex; align-items: flex-end; gap: 2px; height: 60px; padding: 8px 0; }
.spark .day { flex: 1; min-height: 1px; background: var(--state); opacity: 0.8; }

table.coh-table { width: 100%; border-collapse: collapse; font-size: 13px; }
table.coh-table th, table.coh-table td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border-subtle); }
table.coh-table th { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--text-soft); font-weight: 500; }
table.coh-table td { color: var(--text-body); }
table.coh-table .delta-up { color: var(--state); }
table.coh-table .delta-down { color: #c47d6c; }
table.coh-table .delta-flat { color: var(--text-faint); }
`;

export interface ReviewPageOptions {
  title: string;
  activeTab: "sessions" | "state" | "coherence";
  bodyHtml: string;
  wide?: boolean;
  extraScript?: string;
}

export function renderReviewPage(opts: ReviewPageOptions): string {
  const tab = (key: string, label: string, href: string) =>
    `<a href="${href}" class="${opts.activeTab === key ? "active" : ""}">${label}</a>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${opts.title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500&family=Inter+Tight:wght@300;400&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>${REVIEW_CSS}</style>
</head>
<body>
<div class="review-wrap${opts.wide ? " wide" : ""}">
  <header class="review-header">
    <h1 class="review-title">Session Review</h1>
    <nav class="review-tabs">
      ${tab("sessions", "Sessions", "/review")}
      ${tab("state", "Resident State", "/review/state")}
      ${tab("coherence", "Coherence", "/review/coherence")}
    </nav>
    <div class="stats-bar" id="stats-bar">
      <span><strong id="stat-sessions">—</strong> sessions</span>
      <span><strong id="stat-engrams">—</strong> engrams</span>
      <span><strong id="stat-days">—</strong> days resident</span>
    </div>
  </header>
  <main>${opts.bodyHtml}</main>
</div>
<script>
(async () => {
  try {
    const r = await fetch('/api/memory');
    if (!r.ok) return;
    const d = await r.json();
    if (d && d.counts) {
      document.getElementById('stat-sessions').textContent = d.counts.conversations_held ?? '—';
      document.getElementById('stat-engrams').textContent = d.counts.core_memories ?? '—';
      document.getElementById('stat-days').textContent = d.counts.days_resident ?? '—';
    }
  } catch (e) {}
})();
</script>
${opts.extraScript ? `<script>${opts.extraScript}</script>` : ""}
</body>
</html>`;
}
