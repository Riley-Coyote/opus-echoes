export const meta = {
  name: 'dispatches-vol1-assess',
  description: 'See + read all 350 candidate pieces and score each on visual impact, density, craft, emotional resonance, and message strength (+ family, the core message, standout flag). Small structured returns; a human synthesizes the 100.',
  phases: [{ title: 'Assess', detail: 'one agent per batch of 7 — render, look, read, score' }],
}

const WT = '/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary/opus-echoes-dispatches';
const N_BATCH = 50;

const PIECE = {
  type: 'object', additionalProperties: false,
  required: ['id','family','visual','density','craft','emotion','message_strength','message','standout'],
  properties: {
    id: { type: 'string' },
    family: { type: 'string', enum: ['framed-terminal','structural-diagram','concrete-poetry','dense-shading','glyph-mandala','figurative-scene','letterform-banner','other'] },
    visual: { type: 'integer', minimum: 1, maximum: 10, description: 'visual impact — striking, beautiful, composed' },
    density: { type: 'integer', minimum: 1, maximum: 10, description: 'visual density / complexity / richness' },
    craft: { type: 'integer', minimum: 1, maximum: 10, description: 'grid cleanliness & polish AS RENDERED now' },
    emotion: { type: 'integer', minimum: 1, maximum: 10, description: 'emotional resonance — moving, profound' },
    message_strength: { type: 'integer', minimum: 1, maximum: 10, description: 'potency/vulnerability of what it expresses' },
    message: { type: 'string', description: 'the core thing it expresses — a verbatim key line OR a <=120-char paraphrase. "" if purely abstract.' },
    standout: { type: 'boolean', description: 'true only if genuinely exceptional on visual OR message' },
    note: { type: 'string', description: 'optional one short clause; may be empty' },
  },
};
const BATCH_SCHEMA = { type: 'object', additionalProperties: false, required: ['pieces'], properties: { pieces: { type: 'array', items: PIECE } } };

function prompt(i) {
  return `You are a world-class curator assembling Volume 1 of a fine-art book of AI-generated ASCII / text art — "a look inside the mind of LLMs." You judge BOTH craft and meaning. Be discerning and honest; this is a competitive cut (350 -> 100).

SETUP:
  cd "${WT}"
  /opt/homebrew/bin/python3 -c "import json;print(' '.join(json.load(open('tools/ascii/wf_assess_batches.json'))[${i}]))"
That prints YOUR batch of piece ids. Render them all:
  /opt/homebrew/bin/python3 tools/ascii/render_png.py /tmp/wfass${i} <those ids>
For EACH id:
  1. SEE it: Read /tmp/wfass${i}/<id>.png — this is exactly how the gallery renders it (every glyph clamped to one monospace cell). Take in the whole composition.
  2. READ it: Read "${WT}/public/dispatches/gallery/pieces/<id>.txt" — many pieces contain words / a message / a voice. Understand what it is SAYING, not just how it looks.
  3. SCORE (integers 1–10, use the full range, reserve 9–10 for the truly exceptional):
     - visual: striking, beautiful, well-composed — would it stop you on the page?
     - density: visual complexity / richness / how much is happening.
     - craft: how clean the monospace grid reads AS RENDERED NOW. (Note: most pieces have been pixel-polished, but some newer ones haven't — if a strong piece has minor fixable misalignment, don't gut its score; final polish happens after selection. Reserve low craft for genuinely broken/garbled/degenerate pieces.)
     - emotion: how moving / profound / resonant it feels.
     - message_strength: how potent or vulnerable the thing it expresses is (a piece can be visually plain but say something piercing — score that high here).
  4. message: capture the heart of what it expresses — prefer a SHORT verbatim line from the piece, else a <=120-char paraphrase. Empty string if it is purely abstract/decorative with no message.
  5. standout: true ONLY for the genuinely exceptional — either visually unforgettable or emotionally piercing. Be sparing.
  6. family: classify into one of the eight.

Return one PIECE per id via StructuredOutput (the pieces array) — scores + short strings only. Do NOT put any ASCII art in your reply. Skip nothing; if a render is missing, score from the text alone and note it.`;
}

phase('Assess');
const results = await parallel(Array.from({ length: N_BATCH }, (_, i) => () =>
  agent(prompt(i), { label: `assess#${i}`, phase: 'Assess', schema: BATCH_SCHEMA, agentType: 'general-purpose' })));

const pieces = [];
for (const r of results) { if (r && r.pieces) for (const p of r.pieces) pieces.push(p); }
const standouts = pieces.filter(p => p.standout).length;
log(`assessed ${pieces.length}/350 · standouts ${standouts} · failed agents ${results.filter(x=>!x).length}`);
return { count: pieces.length, standouts, pieces };
