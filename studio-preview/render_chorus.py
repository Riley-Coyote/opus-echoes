#!/usr/bin/env python3
"""Render CHORUS Movement II (the face-of-voices) as print HTML.
Modes:
  paper  -> full 3-tier tone + soft glow on opaque void  (framed paper print)
  white  -> flat WHITE ink on BLACK   (post-keyed to white-on-transparent for screenprint)
  black  -> flat BLACK ink on WHITE   (post-keyed to black-on-transparent for screenprint)
Face HTML is the seed-locked innerHTML extracted from the live page (JSON-encoded).
Centers the face by uniform-cropping leading whitespace, then flex-centering.
"""
import argparse, os, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

ap = argparse.ArgumentParser()
ap.add_argument("--face", required=True, help="JSON-encoded face innerHTML file (rel to repo root)")
ap.add_argument("--mode", choices=["paper", "white", "black"], required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--fs", type=int, default=80)
ap.add_argument("--pad", type=int, default=260)
a = ap.parse_args()

face = json.load(open(os.path.join(ROOT, a.face), encoding="utf-8"))
lines = face.split("\n")
while lines and "<span" not in lines[0]:
    lines.pop(0)
while lines and "<span" not in lines[-1]:
    lines.pop()
content = [l for l in lines if "<span" in l]
L = min(len(l) - len(l.lstrip(" ")) for l in content)   # tightest left margin
lines = [l[L:] for l in lines]                            # uniform crop -> centered
face_html = "\n".join(lines)

if a.mode == "paper":
    bg = "#07080b"
    t2, t1, t0 = "#eef1f6", "#c6ccd6", "#6b7488"
    glow = "text-shadow:0 0 0.34em rgba(150,170,210,.18),0 0 0.05em rgba(150,170,210,.12);"
    title_col, tn_col, cap_col = "#7b8497", "#8aa0c6", "#7b8497"
elif a.mode == "white":
    bg = "#000000"
    t2 = t1 = t0 = title_col = tn_col = cap_col = "#ffffff"
    glow = ""
else:  # black
    bg = "#ffffff"
    t2 = t1 = t0 = title_col = tn_col = cap_col = "#000000"
    glow = ""

fs, pad = a.fs, a.pad
title_fs, cap_fs, gap = round(fs * 0.82), round(fs * 1.0), round(fs * 2.6)
STACK = ("'JBMono','JetBrains Mono','Hiragino Sans',"
         "'Hiragino Kaku Gothic ProN',ui-monospace,Menlo,monospace")

doc = f"""<!doctype html><html><head><meta charset="utf-8"><style>
  @font-face{{font-family:'JBMono';src:url('/studio-preview/fonts/JetBrainsMono-Regular.woff2') format('woff2');font-weight:400;font-display:block;}}
  html,body{{margin:0;background:{bg};}}
  .mat{{padding:{pad}px;background:{bg};display:flex;flex-direction:column;
        align-items:center;gap:{gap}px;width:max-content;}}
  .title{{font-family:{STACK};font-size:{title_fs}px;letter-spacing:.46em;
          text-transform:uppercase;color:{title_col};font-weight:500;
          white-space:nowrap;text-indent:.46em;}}
  .title .tn{{color:{tn_col};}}
  pre.face{{margin:0;font-family:{STACK};font-size:{fs}px;line-height:1.06;
       letter-spacing:0;white-space:pre;color:{t1};{glow}
       -webkit-font-smoothing:antialiased;text-align:center;}}
  pre.face .t2{{color:{t2};}} pre.face .t1{{color:{t1};}} pre.face .t0{{color:{t0};}}
  .cap{{font-family:{STACK};font-size:{cap_fs}px;letter-spacing:.02em;
        color:{cap_col};white-space:nowrap;text-align:center;}}
</style></head><body>
<div class="mat">
  <div class="title">movement <span class="tn">ii</span> &nbsp;·&nbsp; the face is made of voices</div>
  <pre class="face">{face_html}</pre>
  <div class="cap">lean close &mdash; the skin of me is other people talking.</div>
</div>
</body></html>"""

os.makedirs(os.path.dirname(os.path.join(ROOT, a.out)), exist_ok=True)
open(os.path.join(ROOT, a.out), "w", encoding="utf-8").write(doc)
print(f"wrote {a.out}  mode={a.mode}  fs={fs}  face_rows={len(lines)}  left_crop={L}")
