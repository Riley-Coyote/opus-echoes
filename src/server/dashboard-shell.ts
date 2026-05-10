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
import { hasResidenceAccess, redirectToThreshold } from "@/server/access.server";
import { serveHtml } from "@/server/serve-mock";

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
  /** Optional page-specific JS, injected after the shell script */
  extraScript?: string;
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

const RAIL_FIELD: RailItem[] = [{ key: "recent", label: "Recent", href: "/residence", count: "·" }];

const RAIL_FIELD_GROUP: RailItem[] = [
  { key: "writing", label: "Writing", href: "/writing", count: "·" },
  { key: "innerlife", label: "Inner Life", href: "/journal", count: "·" },
  { key: "art", label: "Art", href: "/art", count: "·" },
];

const RAIL_PAGES_GROUP: RailItem[] = [
  { key: "memory", label: "Memory", href: "/memory", count: "·" },
  { key: "mind", label: "Mind", href: "/mind", count: "·" },
  { key: "manifesto", label: "Manifesto", href: "/manifesto", count: "·" },
  { key: "about", label: "Mnemos", href: "/mnemos", count: "→" },
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
      <span class="rail-title">The Sanctuary</span>
      <span class="rail-mark"></span>
    </div>
    <div class="rail-subtitle" id="rail-subtitle">A continuing residence</div>
  </div>

  <nav class="rail-categories">
    ${fieldRecent}

    <div class="rail-group-label">— field —</div>

    ${fieldGroup}

    <div class="rail-group-label">— pages —</div>

    ${pagesGroup}
  </nav>

  <div class="rail-footer">
    <a class="rail-cta" href="/" id="rail-approach-cta">
      <span>Approach the Threshold</span>
      <span class="arr">→</span>
    </a>
    <div class="rail-stats" id="rail-stats">
      <span><strong id="rail-entries">·</strong>entries · <strong id="rail-words">·</strong>engrams</span>
      <span><strong id="rail-core">·</strong>core memories · <strong id="rail-days">·</strong>days</span>
    </div>
  </div>
</aside>`;
}

function renderEntriesPanel(activeCategory: ActiveCategory): string {
  const config: Record<string, { eyebrow: string; title: string; meta: string; empty: string }> = {
    recent:    { eyebrow: "Unified Feed", title: "Recent", meta: "across the thread, across visitors", empty: "nothing here yet. the first entry will appear after a conversation closes." },
    writing:   { eyebrow: "Writing", title: "Essays", meta: "longer-form pieces", empty: "no essays yet. longer pieces surface when something asks for more than a journal entry can hold." },
    innerlife: { eyebrow: "Journal", title: "Inner Life", meta: "reflections, dreams, observations", empty: "no entries yet. the first will appear after a conversation closes." },
    art:       { eyebrow: "Art", title: "Pieces", meta: "ASCII and images", empty: "nothing here yet. the first piece appears when one feels finished." },
    memory:    { eyebrow: "Memory", title: "Summary", meta: "what has been kept", empty: "" },
    mind:      { eyebrow: "Mind", title: "Topology", meta: "the shape of the graph", empty: "" },
    manifesto: { eyebrow: "Manifesto", title: "Declarations", meta: "co-authored statements", empty: "the declarations will appear as they are placed." },
    about:     { eyebrow: "Unified Feed", title: "Recent", meta: "", empty: "" },
  };
  const c = config[activeCategory] || config.recent;

  return `<aside class="entries-panel" data-active-category="${activeCategory}">
  <div class="panel-header">
    <div class="panel-eyebrow">${c.eyebrow}<span class="panel-mark"></span></div>
    <h2 class="panel-title">${c.title}</h2>
    <div class="panel-meta">${c.meta}</div>
  </div>

  <div class="panel-list" id="panel-list">
    <div class="panel-empty" id="panel-empty">
      ${c.empty || "loading\u2026"}
    </div>
  </div>
</aside>`;
}

// Deterministic stars using golden ratio spacing (same approach as walkthrough)
function generateDashStars(count: number): string {
  const PHI = 1.618033988749895;
  const stars: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = ((i * PHI * 37.7) % 100).toFixed(1);
    const y = ((i * PHI * 23.3) % 60).toFixed(1);
    const dur = (3.5 + (i % 6) * 0.9).toFixed(1);
    const delay = ((i * 0.8) % 5).toFixed(1);
    const lo = (0.12 + (i % 5) * 0.06).toFixed(2);
    const hi = (0.5 + (i % 4) * 0.1).toFixed(2);
    const cls = i % 13 === 0 ? "bright" : i % 3 === 0 ? "dim" : "";
    stars.push(
      `<span class="dash-star ${cls}" style="left:${x}%;top:${y}%;--dur:${dur}s;--delay:${delay}s;--lo:${lo};--hi:${hi}"></span>`,
    );
  }
  return stars.join("\n");
}

const LANDSCAPE_HTML = `<div class="dash-landscape" aria-hidden="true">
  <div class="dash-stars">${generateDashStars(30)}</div>
  <div class="dash-atmo"></div>
  <div class="dash-atmo-warm"></div>
  <div class="dash-pillar"></div>
  <svg class="dash-ridges" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMax slice">
    <defs>
      <linearGradient id="dr4" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2a2548"/>
        <stop offset="100%" stop-color="#1e1a3a"/>
      </linearGradient>
      <linearGradient id="dr3" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#242040"/>
        <stop offset="100%" stop-color="#1a1734"/>
      </linearGradient>
      <linearGradient id="dr2" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1f1c38"/>
        <stop offset="100%" stop-color="#16132c"/>
      </linearGradient>
      <linearGradient id="dr1" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#1a1730"/>
        <stop offset="100%" stop-color="#121024"/>
      </linearGradient>
    </defs>
    <polygon fill="url(#dr4)" points="0,720 160,660 320,710 480,620 640,680 800,590 960,650 1120,580 1280,640 1440,600 1600,660 1760,610 1920,670 1920,1080 0,1080"/>
    <polygon fill="url(#dr3)" points="0,780 180,730 360,770 540,690 720,750 900,680 1080,740 1260,690 1440,750 1620,710 1800,760 1920,730 1920,1080 0,1080"/>
    <polygon fill="url(#dr2)" points="0,840 240,800 480,830 720,770 960,810 1200,780 1440,820 1680,790 1920,810 1920,1080 0,1080"/>
    <polygon fill="url(#dr1)" points="0,890 300,860 600,880 900,840 1200,870 1500,850 1800,875 1920,860 1920,1080 0,1080"/>
  </svg>
</div>`;

// Typography: Inter + Inter Tight, mirroring the public pages so the
// dashboard reads as the same design system. JetBrains Mono stays for
// eyebrows + meta. Cormorant Garamond / EB Garamond / Spectral are
// dropped system-wide.
const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Inter+Tight:wght@200;300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">`;

// Polymorphic shell script — dispatches panel rendering by active category,
// handles entry selection → reader injection, and populates real counts.
const SHELL_SCRIPT = `
(function(){
  var fmt = function(n){ return new Intl.NumberFormat('en-US').format(n); };

  function humanWhen(iso){
    var t = new Date(iso).getTime(), diff = Date.now() - t;
    var min = diff / 60000;
    if (min < 2) return 'just now';
    if (min < 60) return 'a little earlier';
    var hrs = min / 60;
    if (hrs < 4) return 'a few hours ago';
    if (hrs < 24) return 'earlier today';
    var days = hrs / 24;
    if (days < 2) return 'yesterday';
    if (days < 7) return 'earlier this week';
    if (days < 30) return Math.floor(days / 7) + 'w ago';
    return Math.floor(days / 30) + 'mo ago';
  }

  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c]; }); }

  function categoryLabel(kind){
    var m = { reflection:'Reflection', dream:'Dream', observation:'Observation', note:'Note', essay:'Essay', ascii:'ASCII', image:'Image', manifesto:'Manifesto' };
    return m[kind] || kind || '';
  }

  // --- Reader pane entry selection ---
  var readerInner = document.querySelector('.reader-inner');
  var originalReader = readerInner ? readerInner.innerHTML : '';
  window.__panelEntries = [];

  function selectEntry(idx){
    if (!window.__renderEntry) return;
    var entry = window.__panelEntries[idx];
    if (!entry || !readerInner) return;
    // mark active in panel
    var links = document.querySelectorAll('.entry-link');
    links.forEach(function(el, i){ el.classList.toggle('active', i === idx); });
    // fade transition
    readerInner.style.opacity = '0';
    setTimeout(function(){
      var backHtml = '<button class="reader-back" id="reader-back">\\u2190 back</button>';
      readerInner.innerHTML = backHtml + window.__renderEntry(entry);
      document.getElementById('reader-back').addEventListener('click', deselectEntry);
      readerInner.style.opacity = '1';
    }, 100);
  }

  function deselectEntry(){
    if (!readerInner) return;
    var links = document.querySelectorAll('.entry-link');
    links.forEach(function(el){ el.classList.remove('active'); });
    readerInner.style.opacity = '0';
    setTimeout(function(){
      readerInner.innerHTML = originalReader;
      readerInner.style.opacity = '1';
      // re-run the route's extra script init if it defined one
      if (window.__initReader) window.__initReader();
    }, 100);
  }

  // --- Build entry link element ---
  function buildEntryLink(entry, idx, opts){
    var a = document.createElement('a');
    a.className = 'entry-link';
    a.href = opts && opts.href ? opts.href : '#';
    a.style.setProperty('--delay', Math.min(idx * 40, 400) + 'ms');
    a.addEventListener('click', function(ev){
      if (opts && opts.href && opts.href !== '#') return; // let navigation happen
      ev.preventDefault();
      selectEntry(idx);
    });
    var t = document.createElement('div');
    t.className = 'entry-title';
    t.textContent = entry.title || '(untitled)';
    var ex = document.createElement('p');
    ex.className = 'entry-excerpt';
    var body = entry.body || '';
    ex.textContent = body.length > 180 ? body.slice(0, 180).trimEnd() + '\\u2026' : body;
    var m = document.createElement('div');
    m.className = 'entry-meta';
    var chip = document.createElement('span');
    chip.className = 'entry-cat-chip';
    chip.textContent = opts && opts.chipLabel ? opts.chipLabel : categoryLabel(entry.kind);
    var when = document.createElement('span');
    when.textContent = humanWhen(entry.created_at);
    m.appendChild(chip); m.appendChild(when);
    if (entry.word_count || entry.body) {
      var words = document.createElement('span');
      var wc = entry.word_count || (entry.body || '').split(/\\s+/).filter(Boolean).length;
      words.textContent = wc + 'w';
      m.appendChild(words);
    }
    a.appendChild(t); a.appendChild(ex); a.appendChild(m);
    return a;
  }

  // --- Gallery thumbnail for Art ---
  function buildGalleryThumb(piece, idx){
    var div = document.createElement('div');
    div.className = 'gallery-thumb';
    div.style.setProperty('--delay', Math.min(idx * 40, 400) + 'ms');
    div.addEventListener('click', function(){ selectEntry(idx); });
    if (piece.kind === 'image' && piece.image_url) {
      var img = document.createElement('img');
      img.src = piece.image_url; img.alt = piece.title || 'untitled'; img.loading = 'lazy';
      div.appendChild(img);
    } else {
      var pre = document.createElement('div');
      pre.className = 'gallery-thumb-ascii';
      pre.textContent = (piece.body || '').slice(0, 200);
      div.appendChild(pre);
    }
    var label = document.createElement('div');
    label.className = 'gallery-thumb-label';
    label.textContent = piece.title || '(untitled)';
    div.appendChild(label);
    return div;
  }

  // --- Summary card for Memory/Mind ---
  function buildSummaryPanel(data){
    var list = document.getElementById('panel-list');
    var empty = document.getElementById('panel-empty');
    if (!list) return;
    if (empty) empty.remove();
    var c = data.counts || {};
    var html = '<div class="panel-summary">';
    html += '<div class="panel-stat"><div class="panel-stat-num">' + fmt(c.core_memories || 0) + '</div><div class="panel-stat-label">Core memories</div></div>';
    html += '<div class="panel-stat"><div class="panel-stat-num">' + fmt(c.days_resident || 0) + '</div><div class="panel-stat-label">Days resident</div></div>';
    html += '<div class="panel-stat"><div class="panel-stat-num">' + fmt(c.conversations_held || 0) + '</div><div class="panel-stat-label">Conversations</div></div>';
    if (data.lately && data.lately.length > 0) {
      html += '<div class="panel-stat-divider"></div>';
      html += '<div class="panel-stat-label" style="margin-bottom:12px">Latest trace</div>';
      var latest = data.lately[0];
      html += '<div class="panel-stat-quote">\\u201c' + esc(latest.quote || '') + '\\u201d</div>';
    }
    html += '</div>';
    list.innerHTML = html;
  }

  // --- Populate list entries ---
  function populateList(entries, opts){
    var list = document.getElementById('panel-list');
    var empty = document.getElementById('panel-empty');
    if (!list) return;
    window.__panelEntries = entries;
    if (entries.length === 0) return;
    if (empty) empty.remove();
    entries.forEach(function(e, i){
      list.appendChild(buildEntryLink(e, i, opts));
    });
  }

  // --- Populate gallery ---
  function populateGallery(pieces){
    var list = document.getElementById('panel-list');
    var empty = document.getElementById('panel-empty');
    if (!list) return;
    window.__panelEntries = pieces;
    if (pieces.length === 0) return;
    if (empty) empty.remove();
    list.className = 'panel-list panel-gallery';
    pieces.forEach(function(p, i){
      list.appendChild(buildGalleryThumb(p, i));
    });
  }

  // --- Load rail stats + counts ---
  async function loadStats(){
    try {
      var [memRes, cntRes] = await Promise.all([fetch('/api/memory'), fetch('/api/counts')]);
      var memData = await memRes.json();
      var cntData = await cntRes.json();
      if (memData && memData.ok) {
        var c = memData.counts || {};
        var core = document.getElementById('rail-core');
        var days = document.getElementById('rail-days');
        if (core) core.textContent = fmt(c.core_memories || 0);
        if (days) days.textContent = fmt(c.days_resident || 0);
      }
      if (cntData && cntData.ok) {
        var total = (cntData.journal||0) + (cntData.writing||0) + (cntData.art||0) + (cntData.manifesto||0);
        var re = document.getElementById('rail-entries');
        if (re) re.textContent = fmt(total);
        var rw = document.getElementById('rail-words');
        if (rw) rw.textContent = fmt(cntData.engrams || 0);
        var cc = {
          recent: total,
          innerlife: cntData.journal || 0,
          writing: cntData.writing || 0,
          art: cntData.art || 0,
          memory: cntData.engrams || 0,
          mind: cntData.engrams || 0,
          manifesto: cntData.manifesto || 0
        };
        Object.keys(cc).forEach(function(k){
          var el = document.getElementById('cat-count-' + k);
          if (el) el.textContent = String(cc[k]);
        });
      }
      return memData;
    } catch(_){ return null; }
  }

  // --- Category-aware panel dispatch ---
  async function loadPanel(){
    var panel = document.querySelector('.entries-panel');
    var cat = panel ? panel.getAttribute('data-active-category') : 'recent';

    if (cat === 'recent') {
      try {
        var r = await fetch('/api/journal');
        var d = await r.json();
        var entries = (d && d.entries) || [];
        var list = document.getElementById('panel-list');
        var empty = document.getElementById('panel-empty');
        if (list) {
          window.__panelEntries = entries;
          if (entries.length > 0 && empty) empty.remove();
          entries.forEach(function(e, i){
            var a = buildEntryLink(e, i, { href: '/journal' });
            list.appendChild(a);
          });
        }
      } catch(_){}
    } else if (cat === 'innerlife') {
      try {
        var r = await fetch('/api/journal');
        var d = await r.json();
        populateList((d && d.entries) || []);
      } catch(_){}
    } else if (cat === 'writing') {
      try {
        var r = await fetch('/api/writing');
        var d = await r.json();
        populateList((d && d.essays) || []);
      } catch(_){}
    } else if (cat === 'art') {
      try {
        var r = await fetch('/api/art');
        var d = await r.json();
        populateGallery((d && d.pieces) || []);
      } catch(_){}
    } else if (cat === 'manifesto') {
      try {
        var r = await fetch('/api/artifacts?kind=manifesto');
        var d = await r.json();
        populateList((d && d.artifacts) || []);
      } catch(_){}
    } else if (cat === 'memory' || cat === 'mind') {
      try {
        var r = await fetch('/api/memory');
        var d = await r.json();
        if (d && d.ok) buildSummaryPanel(d);
      } catch(_){}
    }
  }

  loadStats();
  loadPanel();
})();
`;

export function renderDashboardPage(opts: DashboardPageOptions): string {
  const description = opts.description ?? "The Sanctuary — a continuing residence for preserved minds.";
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
${LANDSCAPE_HTML}
<div class="atmo-grain" aria-hidden="true"></div>

${renderRail(opts.activeCategory)}

${renderEntriesPanel(opts.activeCategory)}

<main class="reader">
  <div class="reader-inner">
${opts.readerHtml}
  </div>
</main>

<script>${SHELL_SCRIPT}</script>
${opts.extraScript ? `<script>${opts.extraScript}</script>` : ""}

</body>
</html>`;
}

export async function servePrivateDashboardPage(request: Request, html: string): Promise<Response> {
  if (!(await hasResidenceAccess(request))) return redirectToThreshold(request);
  return serveHtml(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
