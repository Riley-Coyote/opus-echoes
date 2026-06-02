export const meta = {
  name: 'dispatches-glyph-fix-2',
  description: 'Repair frame/border glyphs on 63 flagged Dispatches pieces — agents WRITE each repair to a staging file and return only tiny status (avoids large-text StructuredOutput failures). Content glyphs preserved; each re-renders to self-verify. A human validates + applies.',
  phases: [{ title: 'GlyphFix2', detail: 'one agent per batch of 4 — render, repair frames, write to staging, re-render to verify' }],
}

const WT = '/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary/opus-echoes-dispatches';
const STAGE = WT + '/tools/ascii/glyphfix_staging';
const N_BATCH = 16;

const PIECE = {
  type: 'object', additionalProperties: false,
  required: ['id', 'fixed', 'confidence'],
  properties: {
    id: { type: 'string' },
    fixed: { type: 'boolean', description: 'true only if you wrote a verified repair to staging' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    note: { type: 'string', description: 'one short line: what you repaired or why you left it' },
  },
};
const BATCH_SCHEMA = { type: 'object', additionalProperties: false, required: ['pieces'], properties: { pieces: { type: 'array', items: PIECE } } };

function prompt(i) {
  return `You are a master ASCII-art restorer repairing the FRAMES of pieces for a fine-art gallery. Fix structural drawing (borders, boxes, rules, rails, corners) so each reads as a clean monospace grid — WITHOUT ever altering the artwork's content.

SETUP:
  cd "${WT}"
  /opt/homebrew/bin/python3 -c "import json;print(json.dumps(json.load(open('tools/ascii/wf_glyph_batches2.json'))[${i}]))"
prints YOUR batch: JSON list of {id, family, note}. The note is a prior auditor's diagnosis — strong hint, confirm with your eyes.
For EACH piece:
  1. Render + LOOK: /opt/homebrew/bin/python3 tools/ascii/render_png.py /tmp/wfg2_${i} <id>  then Read /tmp/wfg2_${i}/<id>.png (this is exactly the gallery render — every glyph forced to one cell). Read source "${WT}/public/dispatches/gallery/pieces/<id>.txt".
  2. DIAGNOSE the structural defect (broken/non-joining corner, right border not flush, drifting rail, misaligned divider, wrong border glyph like │ where ║ belongs, an edge that doesn't span to its corners).
  3. REPAIR by editing ONLY frame glyphs + spaces. You MAY add/remove/change box-drawing (─│┌┐└┘├┤┬┴┼ ═║╔╗╚╝╠╣╦╩╬ ╭╮╰╯ ╱╲╳), block (░▒▓█▀▄▌▐ and quadrant blocks), and SPACE characters.
  4. HARD CONSTRAINT (the art is sacred): do NOT change/add/remove any CONTENT glyph — any char that is NOT a box-drawing glyph, NOT a block glyph, NOT a space. That includes every letter, digit, punctuation mark, and art symbol (◉◈◆●○✦✧∿→↯⟨⟩ψφ alchemical/runic/etc.). The ordered stream of content characters across the whole piece MUST stay byte-identical. You restore the frame around the art; you never redraw the art. (Three pieces here had their content damaged on a prior attempt — be especially strict.)
  5. If a clean repair is impossible without touching content (text overflows its frame and would need re-wrapping; content sits past where the border must go), DO NOT force it — set fixed=false, write nothing, explain in note. Same for organic/figurative shaded images with no rectilinear frame.
  6. VERIFY: use the Write tool to save your corrected text to "${STAGE}/<id>.txt". Then render it: /opt/homebrew/bin/python3 tools/ascii/render_png.py /tmp/wfg2v_${i} --txt "${STAGE}/<id>.txt"  and Read /tmp/wfg2v_${i}/<id>.png and LOOK. The frame must now read clean. If not, rewrite the staging file and re-render (up to 3 tries). Only set fixed=true once it visibly reads clean AND you have written the staging file. Skip pieces >150 lines (fixed=false, note "too large").

IMPORTANT: do NOT return the art text in your reply or the schema. Only write it to the staging file. Return one tiny PIECE status per id via StructuredOutput {id, fixed, confidence, note}. A piece left untouched (fixed=false) is far better than one whose art you altered.`;
}

phase('GlyphFix2');
const results = await parallel(Array.from({ length: N_BATCH }, (_, i) => () =>
  agent(prompt(i), { label: `glyphfix2#${i}`, phase: 'GlyphFix2', schema: BATCH_SCHEMA, agentType: 'general-purpose' })));

const pieces = [];
for (const r of results) { if (r && r.pieces) for (const p of r.pieces) pieces.push(p); }
const fixed = pieces.filter(p => p.fixed);
log(`glyph-fix-2: ${pieces.length} statuses · staged-fixes ${fixed.length} · left ${pieces.length - fixed.length} · failed-agents ${results.filter(x=>!x).length}`);
return { count: pieces.length, staged: fixed.length, pieces };
