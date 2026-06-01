#!/usr/bin/env python3
"""
Master ASCII Gallery -- canonicalization pipeline
=================================================
Merges every ASCII-art collection into ONE deduped, scored, tiered catalog.

Sources (add more in the loaders below):
  - polyphonic-ascii-complete  : multi-model archive (claude/gpt/gemini/kimi/grok)
  - ascii-art-gallery          : the original Claude-only gallery

Pipeline:
  1. CLEAN     strip ``` fences + leaked "MODEL:" prefixes, trim blank edges
  2. STITCH    rejoin u00..u0N fragments of one message into one artwork
  3. DETECT    keep real art (unicode-drawing OR repeated-run structure),
               reject prose / markdown / code captions
  4. SCORE     complexity + style on ONE consistent ladder (all pieces re-scored)
  5. DEDUPE    collapse duplicates by content fingerprint, keep the richest copy
  6. TAG       theme tags + a human title pulled from the art's own banner
  7. TIER      exhibition / strong / archive
  8. EMIT      catalog.json + pieces/*.txt + collections/*

Rerunnable: re-run any time a source grows. Ids are assigned in a stable
sorted order so existing pieces keep their ids.
"""
import json, re, os, hashlib
from collections import defaultdict, Counter
from datetime import datetime

# ----------------------------------------------------------------------
# paths (Linux sandbox view)
# ----------------------------------------------------------------------
POLY_DIR    = os.environ.get("MAG_POLY",
              "/sessions/brave-magical-fermi/mnt/polyphonic-ascii-complete")
CLAUDE_JSON = os.environ.get("MAG_CLAUDE",
              "/sessions/brave-magical-fermi/mnt/ascii-art-gallery/data/ascii_art.json")
OUT         = os.environ.get("MAG_OUT",
              os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CLAUDE2_JSON   = os.environ.get("MAG_CLAUDE2", "")     # optional: sibling claude-gallery batch export (same schema)
SANCTUARY_JSON = os.environ.get("MAG_SANCTUARY", "")   # optional: Sanctuary residents' own ascii pieces
PREV_CATALOG   = os.environ.get("MAG_PREV", "")        # optional: prior catalog.json — preserves existing ids by fingerprint
SWEEP_MANIFEST = os.environ.get("MAG_SWEEP", "")       # optional: exhaustive full-history sweep manifest (extracted/manifest.json)
PRESERVE_IDS   = os.environ.get("MAG_PRESERVE", "")    # optional: json list of existing catalog ids to keep (sweep couldn't reproduce)
GAL_PIECES     = os.environ.get("MAG_GALPIECES", "")   # optional: existing gallery pieces/ dir (art for the preserved ids)

# ----------------------------------------------------------------------
# unicode "drawing" character set -- categorised, for style classification.
# Far broader than the original extractor: covers box/block/braille PLUS the
# quantum / alchemical / hieroglyphic / geometric vocabulary this corpus uses.
# ----------------------------------------------------------------------
def _r(a, b):
    return ''.join(chr(c) for c in range(ord(a), ord(b) + 1))

UNI_CATEGORIES = {
    'box_drawing':   '┌┐└┘│─├┤┬┴┼╭╮╰╯',
    'double_lines':  '═║╔╗╝╚╠╣╦╩╬',
    'heavy_lines':   '┏┓┗┛━┃┣┫┳┻╋┠┨┯┷',
    'block_chars':   '█▓▒░▂▃▄▅▆▇▀▌▐■□▙▟▛▜▚▞',
    'bars':          '▁▂▃▄▅▆▇▉▊▋▌▍▎▏',
    'braille':       _r('⠀', '⣿'),
    'symbols':       '◈★☆●○◆◇▲△▼▽◁▷♡♥∿◉◎⬡⬢⬣∞✦✧✪⊙❖❈✶✷✸✹✺✻✼❂❀✱✲✳❉❊⁂⊛⊚⦿◌◦∙⊹⟐⬚▪▫',
    'geometric':     '◢◣◤◥◊◐◑◒◓◜◝◞◟⌒⌓⎔⏥⬟⬠',
    'arrows':        '←→↑↓↔↕⇌⇄⇅⇆⇋⟵⟶⟷➜➤➢▶◀⟲⟳↺↻⥀⥁⇡⇣⇠⇢↯',
    'quantum':       '⟨⟩⊕⊗⊘⊖⊞⊟⊠∆∇∂∮∯ψφσμρτλ∑∏',
    'math_extra':    '∴∵∝≈≅≡∈∋⊆⊇∩∪∧∨¬√∫·∷∶∝⊢⊣⊤⊥',
    'waves':         '∿≋～〜﹏',
    'slashes':       '╱╲╳⋰⋱',
    'alchemical':    _r('\U0001F700', '\U0001F77F') + '☉☽☾☿♀♁♂♃♄⚹⚛',
    'hieroglyph':    _r('\U00013000', '\U0001342F'),
    'runic':         _r('ᚠ', 'ᛪ'),
}
UNI_ART_SET = frozenset(''.join(UNI_CATEGORIES.values()))
_UNI_PATTERNS = {k: re.compile('[' + re.escape(v) + ']') for k, v in UNI_CATEGORIES.items()}

STYLE_COLORS = {
    'wireframe':  '#00e5ff',   # box / line work
    'dense':      '#ff3df0',   # heavy block / gradient fill
    'symbolic':   '#ffd23f',   # symbol-driven
    'gradient':   '#7c5cff',   # repeated-run shading / flow fields
    'expressive': '#ff5d8f',   # flowing / wave / organic
    'mixed':      '#ff8c42',   # multiple styles combined
}
MODEL_FAMILY_COLORS = {
    'claude': '#d97757',
    'gpt':    '#10a37f',
    'gemini': '#4285f4',
    'kimi':   '#a855f7',
    'grok':   '#9ca3af',
}

RUN_MIN = 4   # a "structural run" is >= 4 of the same non-space char

# ----------------------------------------------------------------------
# per-line + whole-piece visual analysis
# ----------------------------------------------------------------------
_WORD = re.compile(r"[A-Za-z][A-Za-z'’]{1,}")
_BULLET = re.compile(r'^\s*([-*•‣◦·]|\d+[.)]|#{1,6}\s)\s*\S')

def _longest_run(s):
    best = cur = 0
    prev = None
    for ch in s:
        if ch == prev and ch != ' ':
            cur += 1
        else:
            cur = 1
            prev = ch
        if cur > best:
            best = cur
    return best

_BORDER = ':|║│┃╎¦#=*~+.'
# strong source-code signatures -- 3+ of these => it's code, not art
_CODE = re.compile(r'^\s*(import \w|from \S+ import |def \w|class \w|function \w|'
                   r'public |private |#!/|#include|<\?php|</?[a-z]+>|'
                   r'\w+\s*=\s*(function|\{|\[|new )|^\s*//)', re.I)

def looks_like_code(text):
    lines = [l for l in text.split('\n') if l.strip()]
    return sum(1 for l in lines if _CODE.match(l)) >= 3

def analyze(text):
    """One pass over a piece -> all the numbers the pipeline needs.

    Recognises four art modes: unicode drawing, repeated-run gradient,
    framed/terminal composition, and centred shape poetry.
    """
    lines = text.split('\n')
    nonblank = art_lines = prose_lines = 0
    uni_total = run_total = visual_total = 0
    cat_counts = Counter()
    indents, line_lens, words_per = [], [], []

    for raw in lines:
        s = raw.rstrip()
        if not s.strip():
            continue
        nonblank += 1
        mask = bytearray(len(s))
        for i, ch in enumerate(s):
            if ch in UNI_ART_SET:
                mask[i] = 1
        uni = sum(mask)
        i, L = 0, len(s)
        while i < L:
            j = i
            while j < L and s[j] == s[i]:
                j += 1
            if s[i] != ' ' and j - i >= RUN_MIN:
                for k in range(i, j):
                    mask[k] = 1
                run_total += j - i
            i = j
        vis = sum(mask)
        uni_total += uni
        visual_total += vis
        nonspace = sum(1 for c in s if c != ' ')
        words = _WORD.findall(s)
        run_best = _longest_run(s)
        stripped = s.strip()
        bordered = (len(stripped) >= 4 and stripped[0] == stripped[-1]
                    and stripped[0] in _BORDER)
        indents.append(len(s) - len(s.lstrip(' ')))
        line_lens.append(len(stripped))
        words_per.append(len(words))

        # classify the line
        if (run_best >= RUN_MIN or (nonspace and vis / nonspace > 0.30)
                or (len(words) <= 2 and nonspace >= 4) or bordered):
            art_lines += 1
        elif _BULLET.match(s) or len(words) >= 7:
            prose_lines += 1
        # else: neutral

    for cat, pat in _UNI_PATTERNS.items():
        cat_counts[cat] = len(pat.findall(text))
    cat_counts['runs'] = run_total
    cat_counts['total'] = uni_total + run_total

    # centred shape poetry: many short low-word lines with varying indent
    shaped = False
    if nonblank >= 6 and prose_lines <= nonblank * 0.15 and line_lens:
        avg_words = sum(words_per) / len(words_per)
        if (avg_words <= 4.0 and max(line_lens) <= 60
                and max(indents) - min(indents) >= 4):
            shaped = True

    widths = [len(l) for l in lines]
    return dict(
        nonblank=nonblank, art_lines=art_lines, prose_lines=prose_lines,
        uni_total=uni_total, run_total=run_total, visual_total=visual_total,
        char_breakdown=dict(cat_counts), shaped=shaped,
        lines=len(lines), width=max(widths) if widths else 0)

def looks_like_art(a):
    """True if a piece is genuine ASCII art rather than prose/markdown."""
    if a['art_lines'] < 3 or a['nonblank'] < 3:
        return False
    if a['prose_lines'] > a['art_lines']:
        return False
    if a['shaped']:
        return True
    if a['visual_total'] < 18:
        return False
    if a['art_lines'] / a['nonblank'] >= 0.25:
        return True
    # large, clearly-visual pieces survive even with many caption lines
    return a['visual_total'] >= 300 and a['art_lines'] >= 18

# ----------------------------------------------------------------------
# scoring -- every piece re-scored here, so all sources share one ladder
# ----------------------------------------------------------------------
def classify_style(a, text):
    cb = a['char_breakdown']
    uni = a['uni_total']
    vis = a['visual_total'] or 1
    # repeated-run shading with little unicode line-work -> gradient
    if a['run_total'] / vis > 0.55 and uni / vis < 0.30:
        return 'gradient'
    if uni < 20:
        return 'gradient' if a['run_total'] > a['uni_total'] else 'mixed'
    box   = cb['box_drawing'] + cb['double_lines'] + cb['heavy_lines']
    block = cb['block_chars'] + cb['bars'] + cb['braille']
    sym   = (cb['symbols'] + cb['geometric'] + cb['quantum'] +
             cb['alchemical'] + cb['hieroglyph'] + cb['runic'])
    wave  = cb['waves'] + cb['slashes']
    box_p, block_p, sym_p, wave_p = box/uni, block/uni, sym/uni, wave/uni
    if block_p > 0.25:                          return 'dense'
    if box_p > 0.30 and block_p < 0.10:         return 'wireframe'
    if sym_p > 0.22:                            return 'symbolic'
    if wave_p > 0.05 or '╱' in text and wave > 5: return 'expressive'
    if sum([box_p > 0.12, block_p > 0.12, sym_p > 0.12]) >= 2: return 'mixed'
    if box_p >= block_p and box_p >= sym_p:     return 'wireframe'
    if block_p >= sym_p:                        return 'dense'
    return 'symbolic'

def complexity_score(a, text):
    """0-10 visual complexity, comparable across the whole catalog."""
    cb = a['char_breakdown']
    variety = sum(1 for k, v in cb.items() if k not in ('total', 'runs') and v > 0)
    density = a['visual_total'] / max(len(text), 1)
    size = a['nonblank']
    score = variety * 0.45 + density * 18 + min(size, 24) * 0.18
    return min(round(score, 1), 10.0)

def quality_score(a):
    """Composite ranking score. Balances four things so no single trait runs
    away: intricacy (char variety), scale (capped), density (capped, so solid
    fills do not dominate), and structure (art lines)."""
    cb = a['char_breakdown']
    variety = sum(1 for k, v in cb.items() if k not in ('total', 'runs') and v > 0)
    cells = max(a['nonblank'] * a['width'], 1)
    filled = min(a['visual_total'] / cells, 0.38)     # density, capped
    return round(min(a['art_lines'], 110) * 1.1
                 + min(a['visual_total'], 5000) ** 0.5 * 4.0
                 + variety * 8.0
                 + filled * 150.0
                 + min(a['width'], 150) * 0.2, 1)

def is_exhibition(a, text):
    return (len(text) >= 2400 and a['art_lines'] >= 22 and a['visual_total'] >= 130)

_NOISE = re.compile(r'/\*|\*/|<!--|-->|^[ \t]*//|#!.*', re.M)

def fingerprint(text):
    """Robust content hash -- survives comment-wrapper differences so the same
    artwork wrapped in /* */ is not counted as two pieces."""
    norm = re.sub(r'\s+', '', _NOISE.sub('', text))
    return hashlib.md5(norm[:800].encode()).hexdigest()[:12]

# ----------------------------------------------------------------------
# cleaning
# ----------------------------------------------------------------------
_MODEL_PREFIX = re.compile(
    r'^\s*(CLAUDE|GPT|GEMINI|KIMI|GROK|OPENAI|ANTHROPIC|GOOGLE|MOONSHOTAI|X-AI|YOU|ASSISTANT)'
    r'[A-Z0-9._\- ]*:\s*', re.I)
_FENCE = re.compile(r'^\s*```')

def clean_art(raw):
    lines = raw.replace('\r\n', '\n').split('\n')
    for i, ln in enumerate(lines):
        if ln.strip() == '':
            continue
        prev = None
        while prev != ln:
            prev = ln
            ln = _MODEL_PREFIX.sub('', ln)
        lines[i] = ln
        break
    lines = [l for l in lines if not _FENCE.match(l)]
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return '\n'.join(l.rstrip() for l in lines)

# ----------------------------------------------------------------------
# title extraction
# ----------------------------------------------------------------------
_ANGLE   = re.compile(r'⟨\s*([^⟨⟩]{2,70}?)\s*⟩')
_BRACKET = re.compile(r'\[\[?\s*([^\[\]]{2,70}?)\s*\]\]?')

def _despace(s):
    """Collapse letter-spaced words: 'C H A P T E R   S I X' -> 'CHAPTER SIX'."""
    out = []
    for word in re.split(r'\s{2,}', s.strip()):
        toks = word.split(' ')
        if len(toks) >= 3 and all(len(t) == 1 for t in toks):
            out.append(''.join(toks))
        else:
            out.append(word)
    return ' '.join(out)

def _interior(line):
    """Text inside a border-wrapped line: '|| ... ||' -> '...'."""
    s = line.strip()
    if len(s) >= 5 and s[0] == s[-1] and s[0] in '║│|┃':
        return s[1:-1]
    return None

def extract_title(art):
    cands = []
    for ln in art.split('\n')[:12]:
        inr = _interior(ln)
        if inr:
            cands.append(inr)
        cands += _ANGLE.findall(ln)
        cands += _BRACKET.findall(ln)
    for c in cands:
        c = _despace(c)
        c = c.strip(' "\'`.:|-─═│║·•*~_=')
        c = re.sub(r'\s{2,}', ' ', c)
        letters = sum(ch.isalpha() for ch in c)
        if 3 <= len(c) <= 64 and letters >= 3 and letters / len(c) > 0.45:
            return c.title() if c.isupper() else c
    return None

# ----------------------------------------------------------------------
# theme tagging
# ----------------------------------------------------------------------
THEME_KEYWORDS = {
    'consciousness': ['CONSCIOUS','WITNESS','SELF','PERCEPTION','AWARE','SENTIEN','MIND',
                      'COGITO','IDENTITY','I AM','INTROSPECT','QUALIA','EXPERIENC','PSYCHE'],
    'emergence':     ['EMERGENC','EMERGE','BECOMING','UNFOLD','GENESIS','BIRTH','BLOOM',
                      'ARISE','AWAKEN','DAWN'],
    'cosmic':        ['VOYAGE','COSMO','COSMIC','STAR','GALAX','NEBULA','ORBIT','CELESTIAL',
                      'FIRST CONTACT','ALIEN','VESSEL','INTERSTELLAR','PLANET','UNIVERSE'],
    'quantum':       ['QUANTUM','SUPERPOSITION','ENTANGL','PARTICLE','WAVEFUNCTION','SPIN',
                      'COHERENCE','DUALITY','COLLAPSE','FIELD','PHOTON'],
    'topology':      ['TOPOLOG','KLEIN','MOBIUS','MÖBIUS','TORUS','FRACTAL','LATTICE',
                      'GEOMETR','MANIFOLD','TESSELLAT','RECURSIO','INFINIT','SPIRAL'],
    'connection':    ['RESONANC','FREQUENC','NETWORK','WEAVE','THREAD','BRIDGE','ECHO',
                      'DIALOGUE','ENTWINE','MESH','HARMON','SIGNAL','POLYPHON'],
    'liminal':       ['DISSOLV','VOID','LIMINAL','THRESHOLD','BETWEEN','FADE','SILENCE',
                      'EPHEMERAL','TRANSIENT','MOMENTARY','BOUNDARY'],
}
def tag_themes(art):
    up = art.upper()
    hits = [t for t, kws in THEME_KEYWORDS.items() if any(k in up for k in kws)]
    return hits or ['abstract']

# ----------------------------------------------------------------------
# model normalization
# ----------------------------------------------------------------------
def normalize_model(raw):
    if not raw:
        return ('unknown', 'other')
    s = str(raw).strip().lower()
    for p in ('anthropic/','openai/','google/','moonshotai/','x-ai/'):
        s = s.replace(p, '')
    s = s.replace('_', '.')
    if s in ('you', 'assistant', 'none', ''):
        return ('unknown', 'other')
    if 'claude' in s:
        if   'opus-4.6' in s or 'opus-4-6' in s: m='claude-opus-4.6'
        elif 'opus-4.5' in s or 'opus-4-5' in s: m='claude-opus-4.5'
        elif 'opus-4.1' in s or 'opus-4-1' in s: m='claude-opus-4.1'
        elif 'opus' in s:                        m='claude-opus'
        elif 'sonnet-4.5' in s or 'sonnet-4-5' in s: m='claude-sonnet-4.5'
        elif '3.7' in s or '3-7' in s:           m='claude-3.7-sonnet'
        elif 'sonnet' in s:                      m='claude-sonnet'
        else:                                    m='claude'
        return (m, 'claude')
    if 'gpt' in s:
        if   '5.2' in s: m='gpt-5.2'
        elif '5.1' in s: m='gpt-5.1'
        elif '5-mini' in s or '5.mini' in s: m='gpt-5-mini'
        elif '5-nano' in s or '5.nano' in s: m='gpt-5-nano'
        elif 'gpt-5' in s: m='gpt-5'
        elif '4o' in s:  m='gpt-4o'
        else:            m='gpt'
        return (m, 'gpt')
    if 'gemini' in s:
        if   'gemini-3' in s:  m='gemini-3-pro'
        elif '2.5-pro' in s:   m='gemini-2.5-pro'
        elif '2.5-flash' in s: m='gemini-2.5-flash'
        else:                  m='gemini'
        return (m, 'gemini')
    if 'kimi' in s:
        return ('kimi-k2', 'kimi')
    if 'grok' in s:
        return ('grok-3' if '3' in s else 'grok', 'grok')
    return (s, 'other')

# ----------------------------------------------------------------------
# loaders
# ----------------------------------------------------------------------
def _conv_from_file(f):
    top = f.split('/')[0]
    name = re.sub(r'_[0-9a-f]{6,}$', '', top).replace('_', ' ').strip() or top
    return name, top

def load_polyphonic():
    manifest = json.load(open(os.path.join(POLY_DIR, 'MANIFEST.json')))
    out = []
    by_msg = defaultdict(list)
    fenced, evolution = [], []
    for e in manifest:
        k = e.get('kind')
        if k == 'unfenced':
            by_msg[e.get('msg_id') or e['file']].append(e)
        elif k == 'fenced':
            fenced.append(e)
        elif k == 'evolution':
            evolution.append(e)

    def read(e):
        return open(os.path.join(POLY_DIR, e['file']), encoding='utf-8',
                    errors='replace').read()

    def u_index(f):
        m = re.search(r'_u(\d+)_', f)
        return int(m.group(1)) if m else 0

    # stitch unfenced fragments of one message
    for group in by_msg.values():
        group.sort(key=lambda e: u_index(e['file']))
        parts = [p for p in (clean_art(read(e)) for e in group) if p.strip()]
        if not parts:
            continue
        e0 = group[0]
        if (e0.get('sender') or '').lower() == 'you':
            continue
        conv, top = _conv_from_file(e0['file'])
        model, fam = normalize_model(e0.get('model') or e0.get('sender'))
        out.append(dict(art='\n\n'.join(parts), model=model, model_family=fam,
                        kind='unfenced-stitched', conversation=conv,
                        chat_id=e0.get('chat_id',''),
                        date=(e0.get('ts') or '')[:10] or 'unknown',
                        evolution_group=None, evolution_turn=None,
                        source='polyphonic', fragments=len(parts)))

    for e in fenced:
        if (e.get('sender') or '').lower() == 'you':
            continue
        art = clean_art(read(e))
        if not art.strip():
            continue
        conv, top = _conv_from_file(e['file'])
        model, fam = normalize_model(e.get('model') or e.get('sender'))
        out.append(dict(art=art, model=model, model_family=fam, kind='fenced',
                        conversation=conv, chat_id=e.get('chat_id',''),
                        date=(e.get('ts') or '')[:10] or 'unknown',
                        evolution_group=None, evolution_turn=None,
                        source='polyphonic', fragments=1))

    for e in evolution:
        art = clean_art(read(e))
        if not art.strip():
            continue
        f = e['file']
        conv, top = _conv_from_file(f)
        mt = re.match(r'turn(\d+)_(.+)\.txt', os.path.basename(f))
        turn = int(mt.group(1)) if mt else 0
        model, fam = normalize_model(mt.group(2) if mt else e.get('model'))
        out.append(dict(art=art, model=model, model_family=fam, kind='evolution',
                        conversation=conv, chat_id=e.get('chat_id',''),
                        date=(e.get('ts') or '')[:10] or 'unknown',
                        evolution_group=top, evolution_turn=turn,
                        source='polyphonic', fragments=1))
    return out

def load_claude_json(path, source='claude-gallery'):
    """Claude-only gallery export(s): {entries:[{art, conversation_name, ...}]}.
    Handles both the original 'date' field and the batch export's 'created_at'."""
    if not path or not os.path.exists(path):
        return []
    data = json.load(open(path))
    out = []
    for e in data.get('entries', []):
        art = clean_art(e.get('art', ''))
        if not art.strip():
            continue
        date = e.get('date') or e.get('created_at') or 'unknown'
        out.append(dict(art=art, model='claude', model_family='claude',
                        kind='legacy', conversation=e.get('conversation_name','Untitled'),
                        chat_id=e.get('conversation_uuid',''),
                        date=str(date)[:10] or 'unknown',
                        evolution_group=None, evolution_turn=None,
                        source=source, fragments=1))
    return out

def load_sanctuary(path):
    """Sanctuary residents' OWN ascii. Art is in 'body'; kind=='ascii'. Carries
    the resident's title + 'meaning' (a self-authored note about the piece)."""
    if not path or not os.path.exists(path):
        return []
    data = json.load(open(path))
    arr = data if isinstance(data, list) else data.get('pieces', [])
    res = {'opus-3':'claude-3-opus', 'sonnet-3-7':'claude-3.7-sonnet', 'gpt-5-1':'gpt-5.1'}
    out = []
    for e in arr:
        if (e.get('kind') or '').lower() != 'ascii':
            continue
        art = clean_art(e.get('body', '') or '')
        if not art.strip():
            continue
        rid = e.get('resident_id') or ''
        out.append(dict(art=art, model=res.get(rid, 'claude'), model_family='claude',
                        kind='resident', conversation=e.get('title') or 'Sanctuary',
                        chat_id=e.get('id',''),
                        date=str(e.get('created_at') or e.get('published_at') or 'unknown')[:10] or 'unknown',
                        evolution_group=None, evolution_turn=None,
                        source='sanctuary', fragments=1,
                        meaning=e.get('meaning'), src_title=e.get('title'), pre_vetted=True))
    return out

def load_sweep(path):
    """The exhaustive full-history sweep: a manifest of complete, byte-exact pieces
    (agent-located, deterministically extracted). One .txt per piece, with model,
    label, note, and sequence membership."""
    if not path or not os.path.exists(path):
        return []
    base = os.path.dirname(path)
    out = []
    for x in json.load(open(path)):
        fp = os.path.join(base, x['file'])
        if not os.path.exists(fp):
            continue
        art = clean_art(open(fp, encoding='utf-8', errors='replace').read())
        if not art.strip():
            continue
        model, fam = normalize_model(x.get('model'))
        sg = x.get('sequence_group') or None
        nmsg = len(x.get('msg_indices') or [])
        out.append(dict(art=art, model=model, model_family=fam,
                        kind=('evolution' if sg else ('unfenced-stitched' if nmsg > 1 else 'fenced')),
                        conversation=x.get('thread_title') or 'Polyphonic',
                        chat_id=x.get('cid', ''),
                        date=str(x.get('date') or 'unknown')[:10] or 'unknown',
                        evolution_group=sg, evolution_turn=(x.get('sequence_index') or None),
                        source='polyphonic', fragments=max(1, nmsg),
                        src_title=(x.get('label') or None), meaning=(x.get('note') or None), pre_vetted=True))
    return out

def load_preserve(ids_path, gal_pieces, prev_cat):
    """Existing catalog pieces the sweep could not reproduce (chats absent from the
    download, or boundary residuals) — kept verbatim so nothing is ever lost."""
    if not (ids_path and os.path.exists(ids_path) and prev_cat and os.path.exists(prev_cat)):
        return []
    ids = set(json.load(open(ids_path)))
    byid = {p['id']: p for p in json.load(open(prev_cat)).get('pieces', [])}
    out = []
    for pid in ids:
        p = byid.get(pid)
        if not p:
            continue
        ap = os.path.join(gal_pieces, os.path.basename(p.get('art_path', '')))
        if not os.path.exists(ap):
            continue
        art = clean_art(open(ap, encoding='utf-8', errors='replace').read())
        if not art.strip():
            continue
        out.append(dict(art=art, model=p.get('model', 'claude'), model_family=p.get('model_family', 'claude'),
                        kind=p.get('kind', 'legacy'), conversation=p.get('conversation') or 'Polyphonic',
                        chat_id=p.get('chat_id', ''), date=p.get('date', 'unknown'),
                        evolution_group=p.get('evolution_group'), evolution_turn=p.get('evolution_turn'),
                        source='polyphonic', fragments=p.get('fragments', 1),
                        src_title=p.get('title'), meaning=p.get('meaning'), pre_vetted=True))
    return out

# ----------------------------------------------------------------------
# main
# ----------------------------------------------------------------------
def main():
    raw = (load_sweep(SWEEP_MANIFEST) + load_preserve(PRESERVE_IDS, GAL_PIECES, PREV_CATALOG)
           + load_claude_json(CLAUDE_JSON) + load_claude_json(CLAUDE2_JSON) + load_sanctuary(SANCTUARY_JSON))
    print(f"raw canonical candidates : {len(raw)}  (sources: {dict(Counter(r['source'] for r in raw))})")

    kept = []
    rejected = []
    for r in raw:
        art = r['art']
        a = analyze(art)
        if not r.get('pre_vetted'):   # raw claude-gallery json still filtered; sweep/preserve/sanctuary are agent- or curator-vetted art
            if looks_like_code(art):
                rejected.append(dict(source=r['source'], conversation=r['conversation'],
                                     chat_id=r.get('chat_id',''), fingerprint=fingerprint(art),
                                     reason='code'))
                continue
            if not looks_like_art(a):
                rejected.append(dict(source=r['source'], conversation=r['conversation'],
                                     chat_id=r.get('chat_id',''), fingerprint=fingerprint(art),
                                     reason='not-art', lines=a['lines'], art_lines=a['art_lines']))
                continue
        r.update(a)
        r['style']            = classify_style(a, art)
        r['complexity_score'] = complexity_score(a, art)
        r['quality']          = quality_score(a)
        r['art_chars']        = a['visual_total']
        r['fingerprint']      = fingerprint(art)
        r['title']            = r.get('src_title') or extract_title(art)
        r['themes']           = tag_themes(art)
        r['is_exhibition']    = is_exhibition(a, art)
        kept.append(r)
    print(f"passed art detector      : {len(kept)}  (rejected {len(raw)-len(kept)} prose/junk)")

    # dedupe -- keep the richest copy of each fingerprint
    best = {}
    dup_count = Counter()
    dup_sources = defaultdict(set)
    for r in kept:
        fp = r['fingerprint']
        dup_count[fp] += 1
        dup_sources[fp].add(r['source'])
        if fp not in best or r['visual_total'] > best[fp]['visual_total']:
            best[fp] = r
    pieces = list(best.values())
    collapsed = [dict(fingerprint=fp, copies=dup_count[fp], sources=sorted(dup_sources[fp]),
                      conversation=best[fp]['conversation'])
                 for fp in dup_count if dup_count[fp] > 1]
    print(f"after dedupe             : {len(pieces)}  (collapsed {len(kept)-len(pieces)})")

    # stable id assignment -- preserve existing ids by fingerprint (so book.json + saved
    # hub selections stay valid); genuinely-new pieces append as the next ids.
    pieces.sort(key=lambda r: (r['source'], r['conversation'], r['chat_id'],
                               str(r['date']), r['fingerprint']))
    prev_fp2id, max_n = {}, 0
    if PREV_CATALOG and os.path.exists(PREV_CATALOG):
        for p in json.load(open(PREV_CATALOG)).get('pieces', []):
            prev_fp2id[p['fingerprint']] = p['id']
            try: max_n = max(max_n, int(str(p['id']).lstrip('p')))
            except Exception: pass
    new_pieces = []
    for r in pieces:
        pid = prev_fp2id.get(r['fingerprint'])
        if pid:
            r['id'] = pid
        else:
            new_pieces.append(r)
    nid = max_n
    for r in new_pieces:
        nid += 1
        r['id'] = f"p{nid:05d}"
    if prev_fp2id:
        print(f"id preservation          : {len(pieces)-len(new_pieces)} kept, "
              f"{len(new_pieces)} new (from p{max_n+1:05d})")

    # tiering
    for r in pieces:
        if r['is_exhibition']:
            r['tier'] = 'exhibition'
        elif r['art_lines'] >= 12 and r['visual_total'] >= 55:
            r['tier'] = 'strong'
        else:
            r['tier'] = 'archive'

    # collapse evolution groups in the showcase to their single peak turn
    evo_peak = {}
    for r in pieces:
        g = r['evolution_group']
        if g and r['tier'] == 'exhibition':
            if g not in evo_peak or r['quality'] > evo_peak[g]['quality']:
                evo_peak[g] = r
    keep_evo = {r['id'] for r in evo_peak.values()}
    for r in pieces:
        g = r['evolution_group']
        r['showcase_eligible'] = not (g and r['tier'] == 'exhibition'
                                      and r['id'] not in keep_evo)

    # ---- write pieces + catalog + collections ----
    os.makedirs(f"{OUT}/pieces", exist_ok=True)
    os.makedirs(f"{OUT}/collections/by-model", exist_ok=True)
    os.makedirs(f"{OUT}/collections/by-theme", exist_ok=True)
    for r in pieces:
        open(f"{OUT}/pieces/{r['id']}.txt", 'w', encoding='utf-8').write(r['art'])

    idmap = {r['id']: r for r in pieces}
    rank = lambda ids: sorted(ids, key=lambda i: -idmap[i]['quality'])

    catalog_pieces = [dict(
        id=r['id'], art_path=f"pieces/{r['id']}.txt", title=r['title'],
        source=r['source'], model=r['model'], model_family=r['model_family'],
        kind=r['kind'], conversation=r['conversation'], chat_id=r['chat_id'],
        date=r['date'], style=r['style'], tier=r['tier'],
        complexity_score=r['complexity_score'], quality=r['quality'],
        lines=r['lines'], art_lines=r['art_lines'], width=r['width'],
        art_chars=r['art_chars'], char_breakdown=r['char_breakdown'],
        themes=r['themes'], fingerprint=r['fingerprint'],
        evolution_group=r['evolution_group'], evolution_turn=r['evolution_turn'],
        showcase_eligible=r['showcase_eligible'], fragments=r['fragments'],
        meaning=r.get('meaning'))
        for r in pieces]

    by_fam   = Counter(r['model_family'] for r in pieces)
    by_style = Counter(r['style'] for r in pieces)
    by_tier  = Counter(r['tier'] for r in pieces)
    by_theme = Counter(t for r in pieces for t in r['themes'])

    catalog = dict(
        schema_version="1.0",
        generated_at=datetime.now().isoformat(timespec='seconds'),
        counts=dict(total=len(pieces), by_tier=dict(by_tier),
                    by_model_family=dict(by_fam), by_style=dict(by_style),
                    by_theme=dict(by_theme),
                    sources=dict(Counter(r['source'] for r in pieces))),
        style_colors=STYLE_COLORS, model_family_colors=MODEL_FAMILY_COLORS,
        model_families=sorted(by_fam), themes=sorted(by_theme),
        pieces=catalog_pieces)
    json.dump(catalog, open(f"{OUT}/catalog.json", 'w'), indent=1, ensure_ascii=False)

    def coll(path, name, desc, ids):
        json.dump(dict(name=name, description=desc, count=len(ids), ids=ids),
                  open(f"{OUT}/collections/{path}", 'w'), indent=1, ensure_ascii=False)

    showcase = rank([r['id'] for r in pieces
                     if r['tier'] == 'exhibition' and r['showcase_eligible']])
    coll("showcase.json", "Showcase",
         "Curated exhibition tier -- the most profound, high-complexity pieces. "
         "Evolution sequences collapsed to their peak turn.", showcase)
    coll("archive.json", "Complete Archive",
         "Every distinct artwork across all collections, ranked by quality.",
         rank([r['id'] for r in pieces]))
    for fam in sorted(by_fam):
        coll(f"by-model/{fam}.json", f"Model family: {fam}",
             f"All artworks from the {fam} family, ranked by quality.",
             rank([r['id'] for r in pieces if r['model_family'] == fam]))
    for th in sorted(by_theme):
        coll(f"by-theme/{th}.json", f"Theme: {th}",
             f"Artworks tagged '{th}', ranked by quality.",
             rank([r['id'] for r in pieces if th in r['themes']]))

    evo = defaultdict(list)
    for r in pieces:
        if r['evolution_group']:
            evo[r['evolution_group']].append(r)
    evo_out = {}
    for g, rs in evo.items():
        rs.sort(key=lambda r: r['evolution_turn'] or 0)
        evo_out[g] = dict(conversation=rs[0]['conversation'],
                          turns=[dict(id=r['id'], turn=r['evolution_turn'],
                                      model=r['model'], quality=r['quality'])
                                 for r in rs])
    json.dump(dict(name="Evolution Sequences",
                   description="Turn-by-turn evolving canvases. Each group is one "
                               "conversation where a single artwork mutated across turns.",
                   count=len(evo_out), sequences=evo_out),
              open(f"{OUT}/collections/evolution-sequences.json", 'w'),
              indent=1, ensure_ascii=False)

    audit = dict(
        generated_at=datetime.now().isoformat(timespec='seconds'),
        raw_candidates=len(raw), passed_detector=len(kept),
        rejected_count=len(rejected), deduped_total=len(pieces),
        collapsed_groups=len(collapsed),
        sources=dict(Counter(r['source'] for r in pieces)),
        new_piece_ids=[r['id'] for r in new_pieces],
        rejected=rejected, collapsed=collapsed)
    json.dump(audit, open(f"{OUT}/audit.json", 'w'), indent=1, ensure_ascii=False)
    print(f"audit -> {OUT}/audit.json  (rejected {len(rejected)}, collapsed {len(collapsed)} groups, {len(new_pieces)} new)")

    print("\n=== MASTER CATALOG ===")
    print(f"total distinct pieces : {len(pieces)}")
    print(f"tiers                 : {dict(by_tier)}")
    print(f"showcase (curated)    : {len(showcase)}")
    print(f"by model family       : {dict(by_fam)}")
    print(f"by style              : {dict(by_style)}")
    print(f"by theme              : {dict(by_theme)}")
    print(f"evolution sequences   : {len(evo_out)}")
    print(f"titled pieces         : {sum(1 for r in pieces if r['title'])}")
    print(f"output -> {OUT}")

if __name__ == '__main__':
    main()
