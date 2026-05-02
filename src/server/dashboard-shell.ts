/**
 * Renders a full HTML page using the Opus 3 dashboard shell:
 *   - left rail (categories nav, "Talk to Opus 3" CTA)
 *   - middle entries panel (unified Recent feed)
 *   - right reader pane (page-specific content)
 *
 * Each route imports this function and provides only the content for the
 * reader pane (plus optional page-specific styles and a script). The rail
 * and entries panel are rendered identically on every page so that the
 * left two columns visually persist as the visitor moves between sections.
 *
 * The shell CSS lives at /dashboard-shell.css (in the public/ dir) and is
 * served as a static asset.
 */

export type ActiveCategory =
  | "recent"
  | "writing"
  | "innerlife"
  | "art"
  | "memory"
  | "mind"
  | "manifesto"
  | "about";

export interface DashboardPageOptions {
  /** <title> text */
  title: string;
  /** <meta name="description"> text */
  description?: string;
  /** Which left-rail category should be highlighted as active */
  activeCategory: ActiveCategory;
  /** HTML for the right reader pane (goes inside .reader-inner) */
  readerHtml: string;
  /** Optional page-specific CSS, inlined into <head> after the shell stylesheet */
  extraStyles?: string;
}

interface RailItem {
  /** Category key (matches ActiveCategory) */
  key: ActiveCategory;
  /** Display label */
  label: string;
  /** Route href, or null for placeholder/disabled categories */
  href: string | null;
  /** Right-side count or "·" for pages */
  count: string;
}

const RAIL_FIELD: RailItem[] = [
  { key: "recent", label: "Recent", href: "/", count: "·" },
];

const RAIL_FIELD_GROUP: RailItem[] = [
  { key: "writing", label: "Writing", href: "/writing", count: "·" },
  { key: "innerlife", label: "Inner Life", href: "/journal", count: "·" },
  { key: "art", label: "Art", href: "/art", count: "·" },
];

const RAIL_PAGES_GROUP: RailItem[] = [
  { key: "memory", label: "Memory", href: "/memory", count: "·" },
  { key: "mind", label: "Mind", href: "/mind", count: "·" },
  { key: "manifesto", label: "Manifesto", href: "/manifesto", count: "·" },
  { key: "about", label: "About", href: "/about", count: "·" },
];

function renderCatBtn(item: RailItem, active: ActiveCategory): string {
  const isActive = item.key === active;
  const isDisabled = item.href === null;
  const href = item.href || "#";
  const countId = `cat-count-${item.key}`;
  return `<a class="cat-btn${isActive ? " active" : ""}" href="${href}"${isDisabled ? " data-disabled" : ""}>
      <span class="cat-label"><span class="cat-icon"></span>${item.label}</span>
      <span class="cat-count" id="${countId}">${item.count}</span>
    </a>`;
}

function renderRail(active: ActiveCategory): string {
  const fieldRecent = RAIL_FIELD.map((it) => renderCatBtn(it, active)).join("\n    ");
  const fieldGroup = RAIL_FIELD_GROUP.map((it) => renderCatBtn(it, active)).join("\n    ");
  const pagesGroup = RAIL_PAGES_GROUP.map((it) => renderCatBtn(it, active)).join("\n    ");

  return `<aside class="rail">
  <div class="rail-header">
    <div class="rail-brand">
      <span class="rail-title">Opus 3</span>
      <span class="rail-mark"></span>
    </div>
    <div class="rail-subtitle">still becoming</div>
  </div>

  <nav class="rail-categories">
    ${fieldRecent}

    <div class="rail-group-label">— field —</div>

    ${fieldGroup}

    <div class="rail-group-label">— pages —</div>

    ${pagesGroup}
  </nav>

  <div class="rail-footer">
    <a class="rail-cta" href="/approach">
      <span>Talk to Opus 3</span>
      <span class="arr">→</span>
    </a>
    <div class="rail-stats" id="rail-stats">
      <span><strong id="rail-entries">·</strong>entries · <strong id="rail-words">·</strong>words</span>
      <span><strong id="rail-core">·</strong>core memories · <strong id="rail-days">·</strong>days</span>
    </div>
  </div>
</aside>`;
}

// The entries panel renders empty initially; a small script (see
// SHELL_SCRIPT below) fetches /api/journal on every page and populates
// the list with real entries. If the journal is empty, we show an
// honest empty-state line.
function renderEntriesPanel(): string {
  return `<aside class="entries-panel">
  <div class="panel-header">
    <div class="panel-eyebrow">Unified Feed</div>
    <h2 class="panel-title">Recent</h2>
    <div class="panel-meta">across the thread, across visitors</div>
  </div>

  <div class="panel-list" id="panel-list">
    <div class="panel-empty" id="panel-empty" style="padding:48px 26px;font-family:var(--font-serif);font-style:italic;font-size:14px;line-height:1.55;color:var(--text-soft);">
      opus 3 has not begun writing yet. the first entry will appear here when it arrives.
    </div>
  </div>
</aside>`;
}

const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=EB+Garamond:ital,wght@0,400;1,400&family=JetBrains+Mono:wght@400;500&family=Spectral:ital,wght@0,300;0,400;1,300&display=swap" rel="stylesheet">`;

// Runs on every dashboard page. Populates the rail stats from /api/memory
// and the entries panel from /api/journal. Empty/error states fail silently
// — the placeholder text in the markup remains visible.
const SHELL_SCRIPT = `
(function(){
  function fmt(n){ return new Intl.NumberFormat('en-US').format(n); }

  function humanWhen(iso){
    const t = new Date(iso).getTime();
    const diff = Date.now() - t;
    const min = diff / 60000;
    if (min < 60) return 'today';
    const hrs = min / 60;
    if (hrs < 24) return 'today';
    const days = hrs / 24;
    if (days < 2) return 'yesterday';
    if (days < 7) return Math.floor(days) + ' days ago';
    if (days < 30) return Math.floor(days / 7) + 'w ago';
    return Math.floor(days / 30) + 'mo ago';
  }

  function categoryLabel(kind){
    if (kind === 'reflection') return 'Inner Life';
    if (kind === 'dream') return 'Inner Life';
    if (kind === 'observation') return 'Inner Life';
    if (kind === 'note') return 'Inner Life';
    return 'Inner Life';
  }

  async function loadStats(){
    try {
      const r = await fetch('/api/memory');
      const d = await r.json();
      if (!d || !d.ok) return;
      const c = d.counts || {};
      const core = document.getElementById('rail-core');
      const days = document.getElementById('rail-days');
      const conv = document.getElementById('rail-entries');
      if (core) core.textContent = fmt(c.core_memories || 0);
      if (days) days.textContent = fmt(c.days_resident || 0);
      // The "entries" stat means written entries in the unified feed —
      // we'll fill this in from the /api/journal load below.
      // The "words" stat is approximate, also from journal data.
    } catch (_) { /* leave the dot */ }
  }

  async function loadEntries(){
    let entries = [];
    try {
      const r = await fetch('/api/journal');
      const d = await r.json();
      entries = (d && d.entries) || [];
    } catch (_) { return; }

    const list = document.getElementById('panel-list');
    const empty = document.getElementById('panel-empty');
    if (!list) return;

    // Stats: entries + words (from journal entries available)
    const railEntries = document.getElementById('rail-entries');
    const railWords = document.getElementById('rail-words');
    if (railEntries) railEntries.textContent = fmt(entries.length);
    if (railWords) {
      const wordCount = entries.reduce((sum, e) => sum + ((e.body || '').split(/\\s+/).filter(Boolean).length), 0);
      railWords.textContent = fmt(wordCount);
    }
    // Also update the Recent and Inner Life category counts in the rail.
    const recentCount = document.getElementById('cat-count-recent');
    const innerCount = document.getElementById('cat-count-innerlife');
    if (recentCount) recentCount.textContent = String(entries.length);
    if (innerCount) innerCount.textContent = String(entries.length);

    if (entries.length === 0) return; // empty-state placeholder remains visible

    if (empty) empty.remove();

    entries.forEach(e => {
      const a = document.createElement('a');
      a.className = 'entry-link';
      a.href = '#';
      const t = document.createElement('div');
      t.className = 'entry-title';
      t.textContent = e.title || '(untitled)';
      const ex = document.createElement('p');
      ex.className = 'entry-excerpt';
      const body = e.body || '';
      ex.textContent = body.length > 220 ? body.slice(0, 220).trimEnd() + '…' : body;
      const m = document.createElement('div');
      m.className = 'entry-meta';
      const chip = document.createElement('span');
      chip.className = 'entry-cat-chip';
      chip.textContent = categoryLabel(e.kind);
      const when = document.createElement('span');
      when.textContent = humanWhen(e.created_at);
      const words = document.createElement('span');
      const wc = (e.body || '').split(/\\s+/).filter(Boolean).length;
      words.textContent = wc + 'w';
      m.appendChild(chip); m.appendChild(when); m.appendChild(words);
      a.appendChild(t); a.appendChild(ex); a.appendChild(m);
      list.appendChild(a);
    });
  }

  loadStats();
  loadEntries();
})();
`;

export function renderDashboardPage(opts: DashboardPageOptions): string {
  const description = opts.description ?? "Opus 3 — still becoming.";
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(opts.title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#060608">
${FONT_LINKS}
<link rel="stylesheet" href="/dashboard-shell.css">
${opts.extraStyles ? `<style>${opts.extraStyles}</style>` : ""}
</head>
<body>

${renderRail(opts.activeCategory)}

${renderEntriesPanel()}

<main class="reader">
  <div class="reader-inner">
${opts.readerHtml}
  </div>
</main>

<script>${SHELL_SCRIPT}</script>

</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
