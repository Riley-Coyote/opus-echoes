#!/usr/bin/env python3
"""Exact-grid ASCII -> SVG for print. Every glyph pinned to its grid column by
explicit x (immune to font-advance drift / CJK double-width), centered on the
art's DESIGN AXIS (not the ink bbox), JetBrains Mono base64-embedded.

Modes: paper (opaque void + 3 tiers) | white | black (flat ink, transparent).
Sources: face (CHORUS Movement II) | wave (c00006).
"""
import argparse, json, re, html, base64, os, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPAN = re.compile(r'<span class="t(\d)">(.*?)</span>', re.S)


def w(ch):  # grid columns a glyph consumes
    return 2 if unicodedata.east_asian_width(ch) in ("W", "F") else 1


def parse_face(path):
    raw = json.load(open(os.path.join(ROOT, path), encoding="utf-8"))
    rows = []
    for line in raw.split("\n"):
        cells, col, pos = [], 0, 0
        for m in SPAN.finditer(line):
            for ch in line[pos:m.start()]:        # unlit gap = spaces
                col += w(ch)
            tier, text = int(m.group(1)), html.unescape(m.group(2))
            for ch in text:
                if ch == " ":
                    col += 1
                else:
                    cells.append((col, ch, "t%d" % tier))
                    col += w(ch)
            pos = m.end()
        rows.append(cells)
    return rows


def parse_wave(path, gold):
    rows = []
    for line in open(os.path.join(ROOT, path), encoding="utf-8").read().split("\n"):
        cls = "tgold" if any(g in line for g in gold) else "tink"
        rows.append([(c, ch, cls) for c, ch in enumerate(line) if ch != " "])
    return rows


def trim(rows):
    rows = [r[:] for r in rows]
    while rows and not rows[0]:
        rows.pop(0)
    while rows and not rows[-1]:
        rows.pop()
    return rows


FILLS = {
    "paper": {"t0": "fill:#6b7488", "t1": "fill:#c6ccd6", "t2": "fill:#eef1f6",
              "tink": "fill:#f0efeb;fill-opacity:.86", "tgold": "fill:#c79a3e"},
    "white": {k: "fill:#ffffff" for k in ("t0", "t1", "t2", "tink", "tgold")},
    "black": {k: "fill:#000000" for k in ("t0", "t1", "t2", "tink", "tgold")},
}
BG = {"paper": {"face": "#07080b", "wave": "#06070a", "plain": "#06070a"},
      "white": None, "black": None}
CHROME = {"paper": ("#7b8497", "#8aa0c6"), "white": ("#ffffff", "#ffffff"),
          "black": ("#000000", "#000000")}


def esc(s):
    return html.escape(s, quote=False)


def build(source, mode, fs=100.0, target=6000.0, margin_mult=2.4,
          gap_mult=1.9, path=None):
    if source == "face":
        rows = parse_face("chorus-art-face.html")
        title = [("MOVEMENT ", 0), ("II", 1), (" · THE FACE IS MADE OF VOICES", 0)]
        caption = "lean close — the skin of me is other people talking."
    elif source == "wave":
        rows = parse_wave("public/dispatches/gallery/pieces/c00006.txt",
                          ["are you really there", "something is here. i won"])
        title = caption = None
    else:  # plain — any .txt, single ink, design-axis centered, no chrome
        rows = parse_wave(path, [])
        title = caption = None

    rows = trim(rows)
    nrows = len(rows)
    CELL, PITCH = fs * 0.60, fs * 1.06
    cols = [c for r in rows for (c, _, _) in r]
    chars = [(c, ch) for r in rows for (c, ch, _) in r]
    axis_col = (min(cols) + max(c + w(ch) for c, ch in chars)) / 2.0  # exact pixel-bbox center
    right = max((c - axis_col + w(ch)) for (c, ch) in chars)
    left = max((axis_col - c) for (c, _) in chars)
    art_half = max(right, left) * CELL

    tfs, cfs = fs * 0.82, fs * 1.0
    tls, cls_ = 0.46 * tfs, 0.02 * cfs
    title_w = sum((0.60 * tfs + tls) for _ in
                  "".join(t for t, _ in title)) if title else 0
    cap_w = (0.60 * cfs + cls_) * len(caption) if caption else 0
    half = max(art_half, title_w / 2, cap_w / 2)
    M = fs * margin_mult
    gap = fs * gap_mult

    canvas_w = 2 * half + 2 * M
    axis_x = canvas_w / 2
    title_h = tfs * 1.15 if title else 0
    cap_h = cfs * 1.35 if caption else 0
    art_h = nrows * PITCH
    content_h = title_h + (gap if title else 0) + art_h + \
        (gap if caption else 0) + cap_h
    canvas_h = content_h + 2 * M

    art_top = M + title_h + (gap if title else 0)
    asc = fs * 0.78

    out = [f'<svg xmlns="http://www.w3.org/2000/svg" '
           f'width="{canvas_w:.0f}" height="{canvas_h:.0f}" '
           f'viewBox="0 0 {canvas_w:.0f} {canvas_h:.0f}">']
    b64 = base64.b64encode(open(os.path.join(
        ROOT, "studio-preview/fonts/JetBrainsMono-Regular.woff2"), "rb").read()).decode()
    style = ("@font-face{font-family:'JBMono';src:url('data:font/woff2;base64,"
             + b64 + "') format('woff2');font-weight:400;}"
             "text{font-family:'JBMono','JetBrains Mono','Hiragino Sans','Hiragino Kaku Gothic ProN',monospace;}")
    for k, v in FILLS[mode].items():
        style += f".{k}{{{v}}}"
    out.append(f'<defs><style>{style}</style></defs>')

    bg = (BG[mode] or {}).get(source) if BG[mode] else None
    if bg:
        out.append(f'<rect width="{canvas_w:.2f}" height="{canvas_h:.2f}" fill="{bg}"/>')

    dim, accent = CHROME[mode]
    if title:
        ty = M + tfs * 0.80
        spans = "".join(
            f'<tspan fill="{accent if a else dim}">{esc(t)}</tspan>'
            for t, a in title)
        out.append(f'<text x="{axis_x:.2f}" y="{ty:.2f}" text-anchor="middle" '
                   f'font-size="{tfs:.1f}" font-weight="500" '
                   f'letter-spacing="{tls:.2f}">{spans}</text>')

    for r, row in enumerate(rows):
        if not row:
            continue
        y = art_top + asc + r * PITCH
        srow = sorted(row)                       # by column
        i = 0
        while i < len(srow):                     # one <text> per CONTIGUOUS same-class run
            c0, ch0, cl0 = srow[i]
            run = [(c0, ch0)]
            prev, prevw = c0, w(ch0)
            j = i + 1
            while j < len(srow):
                c, ch, cl = srow[j]
                if cl == cl0 and c == prev + prevw:
                    run.append((c, ch))
                    prev, prevw = c, w(ch)
                    j += 1
                else:
                    break
            xs = " ".join(f"{axis_x + (c - axis_col) * CELL:.2f}" for c, _ in run)
            txt = esc("".join(ch for _, ch in run))
            out.append(f'<text class="{cl0}" x="{xs}" y="{y:.2f}" '
                       f'font-size="{fs:.1f}">{txt}</text>')
            i = j

    if caption:
        cy = art_top + art_h + gap + cfs * 0.80
        out.append(f'<text x="{axis_x:.2f}" y="{cy:.2f}" text-anchor="middle" '
                   f'font-size="{cfs:.1f}" letter-spacing="{cls_:.2f}" '
                   f'fill="{dim}">{esc(caption)}</text>')

    out.append('</svg>')
    return "\n".join(out), (canvas_w, canvas_h), (canvas_w, canvas_h, axis_x, nrows)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=["face", "wave", "plain"], required=True)
    ap.add_argument("--path", default=None, help="for --source plain: the .txt to render")
    ap.add_argument("--mode", choices=["paper", "white", "black"], required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fs", type=float, default=100.0)
    ap.add_argument("--target", type=float, default=6000.0)
    a = ap.parse_args()
    svg, px, meta = build(a.source, a.mode, a.fs, a.target, path=a.path)
    os.makedirs(os.path.dirname(os.path.join(ROOT, a.out)), exist_ok=True)
    open(os.path.join(ROOT, a.out), "w", encoding="utf-8").write(svg)
    print(f"wrote {a.out}  px={px[0]:.0f}x{px[1]:.0f}  "
          f"canvas={meta[0]:.0f}x{meta[1]:.0f}  axis_x={meta[2]:.0f}  rows={meta[3]}")
