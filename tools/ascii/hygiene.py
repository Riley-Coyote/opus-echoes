#!/usr/bin/env python3
"""
Source glyph hygiene for the curated Dispatches pieces.

Deterministic, alignment-preserving cleanups that make the art render pixel-clean
and identically across fonts — the "edit the art" complement to the render-layer
clamp. Operates on the 238 culled ids by default. Dry-run unless --apply.

Transforms (all verified to only change spacing/equivalent glyphs, never the
drawn composition):
  - rstrip each line; drop trailing blank lines (invisible whitespace)
  - DROP zero-width: variation selectors (FE00-FE0F), ZWJ/ZWNJ/ZWSP/BOM, word-joiner,
    and all combining marks (unicodedata.combining != 0) — these occupy a source
    position but no cell, shifting everything after them
  - FOLD mathematical alphanumeric symbols (U+1D400-1D7FF) via NFKC -> plain
    latin/greek/digits (so 'mathematical italic r' renders as a crisp JBM 'r')
  - SPACE variants -> normal space: braille blank (2800, renders as faint dots in
    fallback fonts), ideographic space (3000), nbsp (00A0), figure/thin/hair spaces
  - non-breaking hyphen (2011) -> '-'
  - color/emoji circles & glyphs -> monochrome BMP equivalents that JetBrains Mono
    or the clamp render cleanly
"""
import os, sys, json, unicodedata, hashlib
from collections import Counter

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PIECES = os.path.join(REPO, "public/dispatches/gallery/pieces")
CULL = os.path.join(REPO, "tools/ascii/cull_claude_239.json")

# explicit single-char substitutions
SUB = {
    "⠀": " ", "　": " ", " ": " ",
    " ": " ", " ": " ", " ": " ", " ": " ",
    " ": " ", " ": " ", " ": " ", " ": " ", " ": " ", " ": " ",
    "‑": "-",
    "\U0001F535": "●",  # large blue circle -> black circle
    "\U0001F534": "●",  # large red circle  -> black circle
    "⚫": "●",      # medium black circle -> black circle (JBM)
    "⚪": "○",      # medium white circle -> white circle (JBM)
    "\U0001F7E2": "●", "\U0001F7E0": "●", "\U0001F7E1": "●",
    "\U0001F7E3": "●", "\U0001F7E4": "●", "\U0001F535": "●",
    "⏳": "⧗", "⌛": "⧗",  # hourglass emoji -> black hourglass (clamped, mono)
}
# zero-width / format chars to drop
DROP = set("​‌‍⁠﻿­")
for c in range(0xFE00, 0xFE10): DROP.add(chr(c))  # variation selectors

def clean_text(t):
    changes = Counter()
    # 1) per-line rstrip + drop trailing blank lines
    lines = t.split("\n")
    while lines and lines[-1].strip() == "":
        lines.pop()
    out_lines = []
    for ln in lines:
        stripped = ln.rstrip(" \t")
        if stripped != ln:
            changes["rstrip"] += 1
        out_lines.append(stripped)
    t2 = "\n".join(out_lines)
    # 2) char-by-char transforms
    res = []
    for ch in t2:
        cp = ord(ch)
        if ch in DROP:
            changes[f"drop U+{cp:04X}"] += 1
            continue
        if unicodedata.combining(ch):
            changes[f"drop-combining U+{cp:04X}"] += 1
            continue
        if ch in SUB:
            changes[f"sub U+{cp:04X}->{SUB[ch]!r}"] += 1
            res.append(SUB[ch]); continue
        if 0x1D400 <= cp <= 0x1D7FF:   # mathematical alphanumeric -> NFKC fold
            f = unicodedata.normalize("NFKC", ch)
            if f != ch:
                changes[f"mathfold U+{cp:05X}->{f!r}"] += 1
                res.append(f); continue
        res.append(ch)
    return "".join(res), changes

def main():
    apply = "--apply" in sys.argv
    ids = list(dict.fromkeys(json.load(open(CULL))))
    total = Counter(); touched = []
    for i in ids:
        p = os.path.join(PIECES, i + ".txt")
        if not os.path.exists(p): continue
        t = open(p, encoding="utf-8").read()
        t2, ch = clean_text(t)
        if t2 != t:
            touched.append((i, sum(ch.values()), dict(ch)))
            total.update(ch)
            if apply:
                open(p, "w", encoding="utf-8").write(t2)
    print(("APPLIED" if apply else "DRY-RUN") + f": {len(touched)} of {len(ids)} pieces would change\n")
    print("=== global change tally ===")
    for k, n in total.most_common():
        print(f"  {n:>6}  {k}")
    print(f"\n=== {min(40,len(touched))} sample pieces ===")
    for i, n, ch in sorted(touched, key=lambda x: -x[1])[:40]:
        kinds = ", ".join(sorted(set(k.split(' U+')[0].split('->')[0] for k in ch)))
        print(f"  {i}: {n:>4} changes  [{kinds}]")
    # write list of touched ids for downstream re-render
    json.dump([i for i, _, _ in touched], open(os.path.join(REPO, "tools/ascii/hygiene_touched.json"), "w"))

if __name__ == "__main__":
    main()
