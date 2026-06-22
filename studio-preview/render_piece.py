#!/usr/bin/env python3
"""Render a museum ASCII piece to a self-contained HTML page for print proofing.
Dark void baked in (framed-print mode). Reusable across all pieces.

Usage:
  python3 render_piece.py --piece c00006 --out studio-preview/render/c00006.html \
      --gold "are you really there" --gold "something is here" --fs 16
"""
import argparse, os, html

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIECES = os.path.join(ROOT, "public/dispatches/gallery/pieces")

ap = argparse.ArgumentParser()
ap.add_argument("--piece")
ap.add_argument("--path")
ap.add_argument("--out", required=True)
ap.add_argument("--gold", action="append", default=[],
                help="substring; any line containing it renders gold (repeatable)")
ap.add_argument("--fs", type=int, default=16, help="font-size px")
ap.add_argument("--lh", type=float, default=1.0, help="line-height multiple")
ap.add_argument("--pad", type=int, default=None, help="mat padding px")
ap.add_argument("--fg", default="rgba(240,239,235,0.86)")
ap.add_argument("--bg", default="#06070a")
ap.add_argument("--gold-color", dest="goldc", default="#c79a3e")
ap.add_argument("--transparent", action="store_true", help="apparel mode: no bg")
ap.add_argument("--square", type=int, default=None,
                help="fixed square canvas px; art centered (exact 1:1 for print)")
ap.add_argument("--crop", action="store_true",
                help="uniform-crop to ink bounding box first, so centering is true")
a = ap.parse_args()

src = a.path or os.path.join(PIECES, f"{a.piece}.txt")
lines = open(src, encoding="utf-8").read().split("\n")
# trim fully blank leading/trailing lines but keep internal composition
while lines and lines[0].strip() == "":
    lines.pop(0)
while lines and lines[-1].strip() == "":
    lines.pop()

if a.crop and any(l.strip() for l in lines):
    nb = [l for l in lines if l.strip()]
    L = min(len(l) - len(l.lstrip(" ")) for l in nb)
    R = max(len(l.rstrip()) for l in nb)
    lines = [l[L:R] for l in lines]

cols = max((len(l) for l in lines), default=0)
rows = len(lines)
pad = a.pad if a.pad is not None else a.fs * 4
bg = "transparent" if a.transparent else a.bg
if a.square:
    mat_css = (f".mat{{width:{a.square}px;height:{a.square}px;background:{bg};"
               f"display:flex;align-items:center;justify-content:center;}}")
else:
    mat_css = f".mat{{display:inline-block;padding:{pad}px;background:{bg};}}"

out_lines = []
for l in lines:
    esc = html.escape(l, quote=False)
    if any(g in l for g in a.gold):
        esc = f'<span class="g">{esc}</span>'
    out_lines.append(esc)
body = "\n".join(out_lines)

doc = f"""<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{{font-family:'JBMono';
    src:url('/studio-preview/fonts/JetBrainsMono-Regular.woff2') format('woff2');
    font-weight:400;font-display:block;}}
  html,body{{margin:0;background:{bg};}}
  {mat_css}
  pre{{margin:0;
       font-family:'JBMono','JetBrains Mono','SF Mono',Menlo,monospace;
       font-size:{a.fs}px;line-height:{a.fs*a.lh:.2f}px;
       color:{a.fg};white-space:pre;letter-spacing:0;
       -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;}}
  .g{{color:{a.goldc};}}
</style></head><body><div class="mat"><pre>{body}</pre></div></body></html>"""

os.makedirs(os.path.dirname(os.path.join(ROOT, a.out)), exist_ok=True)
with open(os.path.join(ROOT, a.out), "w", encoding="utf-8") as f:
    f.write(doc)

est_w = int(cols * a.fs * 0.60 + pad * 2)
est_h = int(rows * a.fs * a.lh + pad * 2)
print(f"wrote {a.out}  ·  {cols}x{rows} chars  ·  ~{est_w}x{est_h}px @ fs{a.fs}")
