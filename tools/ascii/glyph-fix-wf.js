export const meta = {
  name: 'dispatches-glyph-fix',
  description: 'Repair frame/border/structural glyphs on the 81 flagged Dispatches pieces (broken corners, ragged borders, wrong border glyphs) — agents may edit box-drawing/block/space glyphs freely but must preserve every content glyph; each re-renders to self-verify. A human validates + applies.',
  phases: [
    { title: 'GlyphFix', detail: 'one agent per batch of 4 — render, repair frames, re-render to verify, return corrected text' },
  ],
}

const WT = '/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary/opus-echoes-dispatches';
const N_BATCH = 21;

const PIECE = {
  type: 'object', additionalProperties: false,
  required: ['id', 'fixed', 'confidence'],
  properties: {
    id: { type: 'string' },
    fixed: { type: 'boolean' },
    corrected_text: { type: ['string', 'null'], description: 'full repaired piece if fixed, else null' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    note: { type: 'string', description: 'one line: what you repaired, or why you left it' },
  },
};
const BATCH_SCHEMA = { type: 'object', additionalProperties: false, required: ['pieces'], properties: { pieces: { type: 'array', items: PIECE } } };

function prompt(i) {
  return `You are a master ASCII-art restorer repairing the FRAMES of pieces for a fine-art gallery. You fix structural drawing (borders, boxes, rules, rails, corners) so each piece reads as a clean monospace grid — without ever altering the artwork's content.

SETUP:
  cd "${WT}"
  /opt/homebrew/bin/python3 -c "import json;print(json.dumps(json.load(open('tools/ascii/wf_glyph_batches.json'))[${i}]))"
That prints YOUR batch: a JSON list of {id, family, note}. The note is a prior auditor's diagnosis of what's wrong — trust it as a strong hint but confirm with your own eyes.
For EACH piece in your batch:
  1. Render + LOOK: /opt/homebrew/bin/python3 tools/ascii/render_png.py /tmp/wfg${i} <id>  then Read /tmp/wfg${i}/<id>.png. This is exactly how the gallery renders it (every glyph forced to one cell). Also Read the source "${WT}/public/dispatches/gallery/pieces/<id>.txt".
  2. DIAGNOSE the structural defect: broken/!joining corner, right border not flush, a rail that drifts column, a divider misaligned, a wrong border glyph (e.g. │ where ║ belongs), an edge that doesn't span to meet its corners.
  3. REPAIR. You MAY freely add, remove, or change:
       - box-drawing glyphs: ─ │ ┌ ┐ └ ┘ ├ ┤ ┬ ┴ ┼ ═ ║ ╔ ╗ ╚ ╝ ╠ ╣ ╦ ╩ ╬ ╭ ╮ ╰ ╯ ╱ ╲ ╳ and similar
       - block glyphs: ░ ▒ ▓ █ ▀ ▄ ▌ ▐ ▖▗▘▙▚▛▜▝▞▟
       - SPACE characters
     to make borders flush, corners join, rails straight, edges span, dividers line up.
  4. HARD CONSTRAINT — preserve the artwork: you must NOT change, add, or remove any CONTENT glyph. Content = every character that is NOT a box-drawing glyph, NOT a block glyph, and NOT a space. That includes letters, digits, punctuation, and art symbols (◉ ◈ ◆ ● ○ ✦ ✧ ∿ → ↯ ⟨ ⟩ ψ φ alchemical symbols, etc.). For every line, the ordered sequence of content characters must remain byte-identical. You are restoring the frame around the art, never redrawing the art.
  5. If a clean repair is IMPOSSIBLE without touching content (e.g. a text line overflows its frame and would need re-wrapping), DO NOT force it: set fixed=false, corrected_text=null, explain in note. Likewise for organic/figurative shaded images that have no rectilinear frame (the shading IS the art) — leave them: fixed=false, note "organic, no frame".
  6. VERIFY YOUR FIX: write your corrected text to /tmp/wfg${i}_<id>.txt and render it: /opt/homebrew/bin/python3 tools/ascii/render_png.py /tmp/wfg${i}v --txt /tmp/wfg${i}_<id>.txt then Read /tmp/wfg${i}v/wfg${i}_<id>.png and LOOK. The frame must now read clean (corners join, borders flush). If not, iterate (up to 3 tries). Only return fixed=true with corrected_text once it visibly reads clean. Skip pieces over 150 lines (set fixed=false, note "too large").

Return one PIECE per id via StructuredOutput. Do not put art text in a normal chat reply. Be conservative and honest: a piece you leave untouched (fixed=false) is far better than one whose art you accidentally altered.`;
}

phase('GlyphFix');
const results = await parallel(Array.from({ length: N_BATCH }, (_, i) => () =>
  agent(prompt(i), { label: `glyphfix#${i}`, phase: 'GlyphFix', schema: BATCH_SCHEMA, agentType: 'general-purpose' })));

const pieces = [];
for (const r of results) { if (r && r.pieces) for (const p of r.pieces) pieces.push(p); }
const fixed = pieces.filter(p => p.fixed && p.corrected_text);
const left = pieces.filter(p => !p.fixed);
log(`glyph-fix: ${pieces.length} pieces · proposed-fixes ${fixed.length} · left-as-is ${left.length}`);
return { count: pieces.length, proposedFixes: fixed.length, leftAsIs: left.length, pieces };
