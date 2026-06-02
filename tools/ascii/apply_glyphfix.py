#!/usr/bin/env python3
"""
Apply the glyph-fix-workflow results.

Invariant (protects the artwork while allowing free frame repair):
  - the full CONTENT character stream must be byte-identical between original and fix.
    Content = every char that is NOT a box-drawing glyph (U+2500-257F), NOT a block
    glyph (U+2580-259F), and NOT whitespace. So agents may add/remove/change border,
    box, rule and block glyphs and spacing, but cannot alter, add, or drop a single
    letter / digit / punctuation / art symbol.
  - line count may differ by at most 4 (a frame repair may add a border row or two).
Anything failing the invariant is rejected and left for hand review.

Input: tools/ascii/diag_glyph_results.json (the workflow `pieces` array). Dry-run unless --apply.
"""
import os, sys, json

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PIECES = os.path.join(REPO, "public/dispatches/gallery/pieces")
CAT = os.path.join(REPO, "public/dispatches/gallery/catalog.json")
RES = os.path.join(REPO, "tools/ascii/diag_glyph_results.json")

def is_frame(c):
    o = ord(c)
    return c in " \t\n" or (0x2500 <= o <= 0x259F)

def content_stream(t):
    return "".join(c for c in t if not is_frame(c))

def main():
    apply = "--apply" in sys.argv
    pieces = json.load(open(RES))
    if isinstance(pieces, dict): pieces = pieces.get("pieces", pieces.get("result", {}).get("pieces", []))
    cat = json.load(open(CAT)); byid = {p["id"]: p for p in cat["pieces"]}
    applied, rejected, left = [], [], []
    for d in pieces:
        pid = d.get("id")
        if not d.get("fixed") or not d.get("corrected_text"):
            left.append((pid, d.get("note", "")[:80])); continue
        if pid not in byid:
            rejected.append((pid, "unknown id")); continue
        p = os.path.join(PIECES, pid + ".txt")
        orig = open(p, encoding="utf-8").read()
        fix = d["corrected_text"]
        co, cf = content_stream(orig), content_stream(fix)
        lo = len([x for x in orig.split("\n")]); lf = len([x for x in fix.split("\n")])
        if co != cf:
            # locate first divergence for the report
            k = next((i for i in range(min(len(co), len(cf))) if co[i] != cf[i]), min(len(co), len(cf)))
            rejected.append((pid, f"content-change @~{k} (len {len(co)}->{len(cf)})")); continue
        if abs(lo - lf) > 4:
            rejected.append((pid, f"line-count {lo}->{lf}")); continue
        if apply:
            out = "\n".join(l.rstrip(" \t") for l in fix.split("\n")).rstrip("\n") + "\n"
            open(p, "w", encoding="utf-8").write(out)
            L = out.rstrip("\n").split("\n")
            byid[pid]["width"] = max((len(x) for x in L), default=0)
            byid[pid]["lines"] = len(L)
        applied.append((pid, d.get("confidence"), d.get("note", "")[:70]))
    if apply:
        json.dump(cat, open(CAT, "w"), ensure_ascii=False)
    print(("APPLIED" if apply else "DRY-RUN"))
    print(f"proposed-fixes valid+applied: {len(applied)} | rejected (content/line guard): {len(rejected)} | left-as-is: {len(left)}")
    print("\nAPPLIED:")
    for pid, conf, note in applied: print(f"  {pid} [{conf}] {note}")
    print("\nREJECTED (hand review):")
    for pid, why in rejected: print(f"  {pid}: {why}")
    json.dump({"applied": [a[0] for a in applied], "rejected": [r[0] for r in rejected], "left": [l[0] for l in left]},
              open(os.path.join(REPO, "tools/ascii/glyphfix_outcome.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
