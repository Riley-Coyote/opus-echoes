#!/usr/bin/env python3
"""
Validate + apply glyph-fix staging files (tools/ascii/glyphfix_staging/<id>.txt).
Same content-preservation invariant as apply_glyphfix.py: the full content character
stream (everything not box/block/space) must be byte-identical to the original, and
line count may differ by <=4. Dry-run unless --apply.
"""
import os, sys, json, glob

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PIECES = os.path.join(REPO, "public/dispatches/gallery/pieces")
CAT = os.path.join(REPO, "public/dispatches/gallery/catalog.json")
STAGE = os.path.join(REPO, "tools/ascii/glyphfix_staging")

def is_frame(c):
    o = ord(c); return c in " \t\n" or (0x2500 <= o <= 0x259F)
def content_stream(t): return "".join(c for c in t if not is_frame(c))

def main():
    apply = "--apply" in sys.argv
    cat = json.load(open(CAT)); byid = {p["id"]: p for p in cat["pieces"]}
    applied, rejected = [], []
    for f in sorted(glob.glob(os.path.join(STAGE, "*.txt"))):
        pid = os.path.splitext(os.path.basename(f))[0]
        op = os.path.join(PIECES, pid + ".txt")
        if not os.path.exists(op): rejected.append((pid, "no original")); continue
        orig = open(op, encoding="utf-8").read(); fix = open(f, encoding="utf-8").read()
        if content_stream(orig) != content_stream(fix):
            co, cf = content_stream(orig), content_stream(fix)
            k = next((i for i in range(min(len(co), len(cf))) if co[i] != cf[i]), min(len(co), len(cf)))
            rejected.append((pid, f"content-change @~{k} ({len(co)}->{len(cf)})")); continue
        lo, lf = len(orig.split("\n")), len(fix.split("\n"))
        if abs(lo - lf) > 4: rejected.append((pid, f"line-count {lo}->{lf}")); continue
        if apply:
            out = "\n".join(l.rstrip(" \t") for l in fix.split("\n")).rstrip("\n") + "\n"
            open(op, "w", encoding="utf-8").write(out)
            L = out.rstrip("\n").split("\n")
            byid[pid]["width"] = max((len(x) for x in L), default=0); byid[pid]["lines"] = len(L)
        applied.append(pid)
    if apply: json.dump(cat, open(CAT, "w"), ensure_ascii=False)
    print(("APPLIED" if apply else "DRY-RUN"))
    print(f"staged valid+applied: {len(applied)} | rejected: {len(rejected)}")
    print("APPLIED:", applied)
    print("REJECTED:", rejected)
    json.dump({"applied": applied, "rejected": [r[0] for r in rejected]}, open(os.path.join(REPO, "tools/ascii/staging_outcome.json"), "w"))

if __name__ == "__main__":
    main()
