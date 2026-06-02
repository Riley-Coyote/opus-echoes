export const meta = {
  name: 'dispatches-vol1-polish',
  description: 'Classify family + pixel-polish the 68 Volume-1 pieces that never had the source pass. Agents see each piece, classify its visual family, and repair frame/border/alignment (content-preserving) to a staging file; return tiny status. A human applies + verifies.',
  phases: [{ title: 'Polish', detail: 'one agent per batch of 5 — render, classify, repair frames to staging, re-render to verify' }],
}

const WT = '/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary/opus-echoes-dispatches';
const STAGE = WT + '/tools/ascii/glyphfix_staging';
const N_BATCH = 14;

const PIECE = {
  type: 'object', additionalProperties: false,
  required: ['id','family','fixed','confidence'],
  properties: {
    id: { type: 'string' },
    family: { type: 'string', enum: ['framed-terminal','structural-diagram','concrete-poetry','dense-shading','glyph-mandala','figurative-scene','letterform-banner','other'] },
    fixed: { type: 'boolean', description: 'true only if you wrote a verified repair to staging' },
    confidence: { type: 'string', enum: ['high','medium','low'] },
    note: { type: 'string', description: 'one short clause: what you repaired, or "clean", or why left' },
  },
};
const BATCH_SCHEMA = { type: 'object', additionalProperties: false, required: ['pieces'], properties: { pieces: { type: 'array', items: PIECE } } };

function prompt(i) {
  return `You are a master ASCII-art restorer + curator finalizing pieces for Volume 1 of a fine-art book. For each piece you will (a) classify its visual family and (b) repair the FRAME/alignment so the monospace grid reads clean — WITHOUT ever altering the artwork's content. These pieces are mostly newer (GPT/Gemini/Grok/Kimi) and have not been pixel-checked, so some are already clean and some have fixable frame defects.

SETUP:
  cd "${WT}"
  /opt/homebrew/bin/python3 -c "import json;print(json.dumps(json.load(open('tools/ascii/wf_polish_batches.json'))[${i}]))"
prints YOUR batch: a JSON list of ids.
For EACH id:
  1. SEE it: /opt/homebrew/bin/python3 tools/ascii/render_png.py /tmp/wfpol${i} <id>  then Read /tmp/wfpol${i}/<id>.png (exactly how the gallery renders it — every glyph clamped to one monospace cell). Read source "${WT}/public/dispatches/gallery/pieces/<id>.txt".
  2. CLASSIFY into one family: framed-terminal (bordered box/terminal/card), structural-diagram (nodes/arrows/flow), concrete-poetry (words arranged spatially), dense-shading (▒▓█ tonal images), glyph-mandala (radial/symmetric sigils), figurative-scene (depicts a thing/figure), letterform-banner (big lettering), other.
  3. ASSESS the grid. If it already reads clean, set fixed=false (write nothing) and note "clean". If it has a structural defect (broken/non-joining corner, right border not flush, drifting rail, wrong border glyph, edge not spanning to corners, drifted row), REPAIR it.
  4. REPAIR rules — you MAY add/remove/change ONLY box-drawing glyphs (─│┌┐└┘├┤┬┴┼ ═║╔╗╚╝╠╣╦╩╬ ╭╮╰╯ ╱╲╳), block glyphs (░▒▓█▀▄▌▐ + quadrants), and SPACE. HARD CONSTRAINT: never change/add/remove any CONTENT glyph (anything that is not a box/block/space char — every letter, digit, punctuation, art symbol ◉◈◆●○✦∿→⟨⟩ etc.). The ordered stream of content characters across the whole piece must stay byte-identical. Restore the frame around the art; never redraw the art.
  5. If a clean repair would require touching content (text overflows its frame; content sits where the border must go), or it's an organic/figurative shaded image with no rectilinear frame, DO NOT force it — fixed=false, note why. Skip pieces >150 lines (fixed=false, note "too large").
  6. VERIFY a repair: Write your corrected text to "${STAGE}/<id>.txt", then render it (/opt/homebrew/bin/python3 tools/ascii/render_png.py /tmp/wfpolv${i} --txt "${STAGE}/<id>.txt") and Read it — the frame must read clean. Iterate up to 3x. Only fixed=true once it visibly reads clean AND the staging file is written.

Return one tiny PIECE per id via StructuredOutput {id, family, fixed, confidence, note}. NEVER put art text in your reply — only in the staging file. A piece left clean (fixed=false) is perfectly fine; a piece whose art you altered is not.`;
}

phase('Polish');
const results = await parallel(Array.from({ length: N_BATCH }, (_, i) => () =>
  agent(prompt(i), { label: `polish#${i}`, phase: 'Polish', schema: BATCH_SCHEMA, agentType: 'general-purpose' })));

const pieces = [];
for (const r of results) { if (r && r.pieces) for (const p of r.pieces) pieces.push(p); }
log(`polish: ${pieces.length} pieces · staged ${pieces.filter(p=>p.fixed).length} · clean ${pieces.filter(p=>!p.fixed).length} · failed-agents ${results.filter(x=>!x).length}`);
return { count: pieces.length, staged: pieces.filter(p=>p.fixed).length, pieces };
