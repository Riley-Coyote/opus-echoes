#!/usr/bin/env python3
"""
Apply the diagnosis-workflow results:
  - write each piece's visual `family` into catalog.json
  - validate + apply whitespace-only realignments (reject anything that changes a
    drawn glyph: per line, the non-whitespace character sequence must be identical)
  - update catalog width/lines for changed pieces
  - emit a family manifest + a list of pieces still needing glyph-level fixes

Input: tools/ascii/diag_results.json  (the workflow's `pieces` array)
Dry-run unless --apply.
"""
import os, sys, json

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PIECES = os.path.join(REPO, "public/dispatches/gallery/pieces")
CAT = os.path.join(REPO, "public/dispatches/gallery/catalog.json")
RES = os.path.join(REPO, "tools/ascii/diag_results.json")

def nows(s): return s.replace(" ", "").replace("\t", "")

def validate(orig, fix):
    o = orig.split("\n"); f = fix.split("\n")
    while o and o[-1].strip() == "": o.pop()
    while f and f[-1].strip() == "": f.pop()
    if len(o) != len(f): return False, f"line-count {len(o)}!={len(f)}"
    for a, b in zip(o, f):
        if nows(a) != nows(b): return False, "glyph-change"
    return True, "ok"

def main():
    apply = "--apply" in sys.argv
    pieces = json.load(open(RES))
    if isinstance(pieces, dict) and "pieces" in pieces: pieces = pieces["pieces"]
    hand = set(json.load(open(os.path.join(REPO, "tools/ascii/hand_fixed.json")))) if os.path.exists(os.path.join(REPO, "tools/ascii/hand_fixed.json")) else set()
    cat = json.load(open(CAT))
    byid = {p["id"]: p for p in cat["pieces"]}
    fam_count = {}
    applied, rejected, glyphq, clean = [], [], [], []
    for d in pieces:
        pid = d.get("id");
        if pid not in byid: continue
        fam = d.get("family", "other")
        byid[pid]["family"] = fam
        fam_count[fam] = fam_count.get(fam, 0) + 1
        if d.get("needs_glyph_fix"): glyphq.append((pid, d.get("note", "")))
        wf = d.get("whitespace_fix")
        if wf and pid not in hand:
            p = os.path.join(PIECES, pid + ".txt")
            orig = open(p, encoding="utf-8").read()
            ok, why = validate(orig, wf)
            norm = lambda s: "\n".join(l.rstrip(" \t") for l in s.split("\n")).rstrip("\n")
            if not ok:
                rejected.append((pid, why))           # per-line non-space sequence changed -> glyph edit, block
            elif norm(wf) == norm(orig):
                pass                                   # no-op (only trailing-ws/newline diff)
            else:
                if apply:
                    out = norm(wf)
                    open(p, "w", encoding="utf-8").write(out + "\n")
                    L = out.split("\n")
                    byid[pid]["width"] = max((len(x) for x in L), default=0)
                    byid[pid]["lines"] = len(L)
                applied.append(pid)
        else:
            if d.get("severity") == "clean" and not d.get("needs_glyph_fix"):
                clean.append(pid)
    if apply:
        json.dump(cat, open(CAT, "w"), ensure_ascii=False)
    print(("APPLIED" if apply else "DRY-RUN"))
    print("families:", json.dumps(fam_count, indent=0))
    print(f"whitespace-fixes valid+applied: {len(applied)} | rejected (glyph change): {len(rejected)} | clean: {len(clean)} | needs-glyph: {len(glyphq)}")
    if rejected: print("REJECTED:", rejected[:30])
    print("\nNEEDS GLYPH FIX (for hand pass):")
    for pid, note in glyphq[:80]: print(f"  {pid}: {note[:90]}")
    # manifest
    manifest = {"families": {}, "needs_glyph_fix": [g[0] for g in glyphq], "whitespace_fixed": applied}
    for d in pieces:
        manifest["families"].setdefault(d.get("family", "other"), []).append(d.get("id"))
    json.dump(manifest, open(os.path.join(REPO, "tools/ascii/family_manifest.json"), "w"), indent=1)
    print("\nwrote tools/ascii/family_manifest.json")

if __name__ == "__main__":
    main()
