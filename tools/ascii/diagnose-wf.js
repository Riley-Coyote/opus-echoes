export const meta = {
  name: 'dispatches-pixel-align',
  description: 'Render + visually inspect the 238 culled Dispatches pieces: classify each into a visual family, flag alignment defects, and propose whitespace-only realignments (no glyph changes). A human validates + applies.',
  phases: [
    { title: 'Diagnose', detail: 'one agent per batch of 6 — render PNG, read it, classify family, flag defects, propose whitespace-only fixes' },
  ],
}

const WT = '/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary/opus-echoes-dispatches';
const N_BATCH = 40;

const PIECE = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'family', 'severity', 'defects', 'needs_glyph_fix'],
  properties: {
    id: { type: 'string' },
    family: { type: 'string', enum: ['framed-terminal','structural-diagram','concrete-poetry','dense-shading','glyph-mandala','figurative-scene','letterform-banner','other'] },
    defects: { type: 'array', items: { type: 'string', enum: ['none','ragged-right-border','drifted-row','off-center','broken-corner','inconsistent-frame','stray-trailing','baseline-jitter','other'] } },
    severity: { type: 'string', enum: ['clean','minor','major'] },
    whitespace_fix: { type: ['string','null'], description: 'full corrected piece text if fixable by spacing ONLY (<=120 lines), else null' },
    needs_glyph_fix: { type: 'boolean' },
    note: { type: 'string', description: 'one line: what is wrong / what the fix does, or why clean' },
  },
};
const BATCH_SCHEMA = { type: 'object', additionalProperties: false, required: ['pieces'], properties: { pieces: { type: 'array', items: PIECE } } };

function prompt(i) {
  return `You are a meticulous ASCII-art alignment auditor preparing a fine-art gallery. You will VISUALLY INSPECT pieces and judge their monospace-grid alignment. Precision matters; never invent or alter the art.

SETUP (run exactly):
  cd "${WT}"
  /opt/homebrew/bin/python3 -c "import json;print(' '.join(json.load(open('tools/ascii/wf_batches.json'))[${i}]))"
That prints YOUR batch of piece ids (space-separated). Then render them all:
  /opt/homebrew/bin/python3 tools/ascii/render_png.py /tmp/wfa${i} <those ids>
For EACH id in your batch:
  1. Read the rendered image /tmp/wfa${i}/<id>.png  (this is exactly how the gallery renders it — every glyph forced into one monospace cell). LOOK at it.
  2. Read the source text "${WT}/public/dispatches/gallery/pieces/<id>.txt".
  3. CLASSIFY into exactly one family:
     - framed-terminal: bordered box / terminal-window / card with a frame around content
     - structural-diagram: nodes, arrows, flow/graph/circuit/architecture diagrams, labelled connectors
     - concrete-poetry: words/letters arranged spatially as the art (cascades, shapes-from-text, scattered words)
     - dense-shading: gradients / shaded fills / block-element (▒▓█) tonal images
     - glyph-mandala: radial/symmetric sigils, ornaments, symbol mandalas, decorative symmetry
     - figurative-scene: depicts a thing/scene/figure (landscape, face, object, creature)
     - letterform-banner: big ASCII lettering / headline / wordmark as the primary content
     - other: none fit
  4. JUDGE ALIGNMENT against a clean monospace grid. Defects: ragged-right-border (a frame's right edge not flush), drifted-row (a row shifted left/right vs its neighbors), off-center (a block that should be centered isn't), broken-corner (box corner doesn't join), inconsistent-frame, stray-trailing, baseline-jitter, or none. severity: clean (grid is perfect) / minor (small spacing nits) / major (clearly misaligned).
  5. WHITESPACE-ONLY FIX: if the defects are fixable purely by ADDING or REMOVING SPACE characters (drift, centering, flush a border that already has its border glyphs, trailing) AND the piece is <=120 lines, output the FULL corrected piece text in whitespace_fix. HARD RULE: you may ONLY change spaces. For every line, the sequence of NON-SPACE characters must be byte-identical to the original — you are re-positioning existing glyphs, never changing/adding/removing a drawn glyph. Self-check this before returning. If the fix needs any glyph change (e.g. closing a corner, swapping a character), DO NOT write whitespace_fix — instead set needs_glyph_fix=true and describe it in note. If the piece is already clean, whitespace_fix=null.

Return one PIECE object per id via the StructuredOutput tool (the pieces array). Do not include any art text in a normal chat reply. Be honest: most concrete-poetry is intentionally ragged and should be 'clean' — do not "fix" intentional asymmetry. Only flag true grid errors the model plainly did not intend.`;
}

phase('Diagnose');
const results = await parallel(Array.from({ length: N_BATCH }, (_, i) => () =>
  agent(prompt(i), { label: `diag#${i}`, phase: 'Diagnose', schema: BATCH_SCHEMA, agentType: 'general-purpose' })));

const pieces = [];
for (const r of results) { if (r && r.pieces) for (const p of r.pieces) pieces.push(p); }
const byFam = {};
for (const p of pieces) byFam[p.family] = (byFam[p.family] || 0) + 1;
const fixable = pieces.filter(p => p.whitespace_fix);
const glyph = pieces.filter(p => p.needs_glyph_fix);
log(`diagnosed ${pieces.length}/238 · families ${JSON.stringify(byFam)} · whitespace-fixes ${fixable.length} · needs-glyph ${glyph.length}`);
return { count: pieces.length, families: byFam, whitespaceFixes: fixable.length, needsGlyph: glyph.length, pieces };
