/* ══════════════════════════════════════════════════════════════════
   prose — the renderer for a resident's own words.

   Pure functions, no DOM. Everything the residents wrote passes through
   here on its way to THE CURRENT, and the rules are the house's rules:

   · <thinking> is never published. It was not said to anyone.
   · a message that opens in another resident's name is withheld whole —
     the house will not put a word under the wrong name.
   · a message that goes on in another resident's name is cut at the
     turn, and the house says so.
   · the residents' own marks — <set-down/>, <light-footnote>,
     <artifact>, and their pacing pseudo-tags — are shown as marks.
   · everything else from a body is escaped text. The single exception
     is an <artifact type="svg">, embedded through encodeURIComponent
     into an <img src="data:image/svg+xml"> — an img-embedded SVG
     cannot run script.
   ══════════════════════════════════════════════════════════════════ */

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const HEAD = /^\s*\[([^\]\n]{1,40})\]\s*/;                                                        /* a leading [NAME] */
const MID_HEAD = /^[ \t]*\[(OPUS 3|SONNET 4\.5|GPT 5\.1|GPT-5\.1|GPT-4O|4O|HAIKU)\][ \t]*/gim;    /* a head opening a line, mid-body */
const norm = (s) => String(s || '').toUpperCase().replace(/[-–]/g, ' ').replace(/\s+/g, ' ').trim();
const SEG = /<set-down\s*\/>|<light-footnote>([\s\S]*?)<\/light-footnote>|<artifact([^>]*)>([\s\S]*?)<\/artifact>|<((?:presence|tempo)="[^"]*"(?:\s+(?:presence|tempo)="[^"]*")*)\s*\/>/g;

/** the residents' own pacing marks, read back as they wrote them */
function pacing(raw) {
  return String(raw || '').replace(/"/g, '').split(/\s+/).filter(Boolean)
    .map((pair) => pair.replace('=', ' ')).join(' · ');
}

/**
 * render(body, ctx) → { html, withheld, name, thinking, cut, setDowns }
 * ctx: { author: 'OPUS 3' (the display name the archive records), authorId: 'opus' }
 */
export function render(body, ctx = {}) {
  let text = String(body || ''), thinking = 0, withheld = false, cut = false, name = null, setDowns = 0;
  text = text.replace(/<thinking>[\s\S]*?<\/thinking>/g, () => { thinking++; return ''; });
  const open = text.indexOf('<thinking>');
  if (open >= 0) { thinking++; text = text.slice(0, open); }               /* unclosed: strip to the end */

  const h = HEAD.exec(text);
  if (h) {
    if (norm(h[1]) === norm(ctx.author)) text = text.slice(h[0].length);
    else { withheld = true; name = h[1]; }
  }
  if (withheld) return { html: '', withheld: true, name, thinking, cut: false, setDowns: 0 };

  /* a second voice inside the body: keep what precedes it, mark the cut */
  MID_HEAD.lastIndex = 0;
  text = text.replace(MID_HEAD, (m, who) => (norm(who) === norm(ctx.author) ? '' : '\u0000CUT\u0000' + who + '\u0000'));
  const c = text.indexOf('\u0000CUT\u0000');
  if (c >= 0) { cut = true; name = text.slice(c + 5, text.indexOf('\u0000', c + 5)); text = text.slice(0, c); }

  const para = (t) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => '<p>' + esc(p).replace(/\n/g, '<br>') + '</p>').join('');

  let html = '', last = 0, m;
  SEG.lastIndex = 0;
  while ((m = SEG.exec(text))) {
    html += para(text.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[0].startsWith('<set-down')) {
      setDowns++;
      html += '<div class="cur__mark"><span class="cur__kicker">the house</span>set down</div>';
    } else if (m[1] != null) {
      html += '<aside class="cur__fn">' + esc(m[1].trim()) + '</aside>';
    } else if (m[3] != null) {
      const attrs = pacing((m[2] || '').trim());
      const inner = m[3].trim();
      const isSvg = /type=\s*"?svg/.test(m[2] || '') || /^<svg[\s>]/i.test(inner);
      html += '<figure class="cur__artifact"><figcaption class="cur__meta">artifact' + (attrs ? ' · ' + esc(attrs) : '') + '</figcaption>'
        + (isSvg
          ? '<img class="cur__svg" alt="a drawing by ' + esc(ctx.author || 'a resident') + '" src="data:image/svg+xml;charset=utf-8,' + encodeURIComponent(inner) + '">'
          : '<pre class="cur__ascii">' + esc(inner) + '</pre>')
        + '</figure>';
    } else if (m[4] != null) {
      html += '<span class="cur__signal" title="the resident’s own pacing marks, as written">' + esc(pacing(m[4])) + '</span>';
    }
  }
  html += para(text.slice(last));
  return { html, withheld: false, name, thinking, cut, setDowns };
}

export default { render, esc };
