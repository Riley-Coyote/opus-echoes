#!/usr/bin/env python3
"""
Faithful monospace-grid renderer for the Dispatches gallery.

Mirrors how gallery.html renders ASCII art so that a PNG read back by the agent
shows what Riley actually sees:
  - JetBrains Mono on the dark hub paper (#101113) in ink (#e9e7e1)
  - white-space:pre fixed grid, line-height 1.18
  - >1-cell glyphs (.wc set: cp>=0x1F000, CJK 0x2E80..0xD7A3, fullwidth 0xFF00..0xFFEF)
    forced into a single 1-ch cell, scaled ~0.62, centered  (the a956ed1 fix)
  - glyphs JetBrains Mono lacks fall back to SF Mono (still 1 cell), then to
    Arial Unicode / Apple Symbols / emoji, fit-centered into one cell.

The grid is the ground truth: any source-level misalignment (ragged border,
drifted row, off-center block) shows as misalignment in the PNG.

Usage:
  render_png.py OUTDIR --all                 # render every id in cull_claude_239.json
  render_png.py OUTDIR p00765 p00187 ...     # render specific ids
  render_png.py OUTDIR --txt /path/a.txt     # render an arbitrary file
  options: --fs 24  --pad 18  --maxpx 5200   --bg 0x101113 --fg 0xe9e7e1
"""
import os, sys, argparse, json
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont, TTCollection

REPO = "/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary/opus-echoes-dispatches"
PIECES = os.path.join(REPO, "public/dispatches/gallery/pieces")
CULL = os.path.join(REPO, "tools/ascii/cull_claude_239.json")

JBM_PATH   = "/Users/rileycoyote/Library/Fonts/JetBrainsMono-Regular.ttf"
SFM_PATH   = "/System/Library/Fonts/SFNSMono.ttf"
ARIAL_PATH = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"
SYM_PATH   = "/System/Library/Fonts/Apple Symbols.ttf"
EMOJI_PATH = "/System/Library/Fonts/Apple Color Emoji.ttc"

def is_wc(cp):
    return cp >= 0x1F000 or (0x2E80 <= cp <= 0xD7A3) or (0xFF00 <= cp <= 0xFFEF)

def cmap_set(path):
    try:
        if path.lower().endswith(".ttc"):
            f = TTCollection(path).fonts[0]
        else:
            f = TTFont(path, lazy=True)
        s = set(f.getBestCmap().keys())
        f.close()
        return s
    except Exception as e:
        sys.stderr.write(f"cmap fail {path}: {e}\n")
        return set()

# Codepoint coverage of each font (for routing).
COV = {
    "jbm":   cmap_set(JBM_PATH),
    "sfm":   cmap_set(SFM_PATH),
    "arial": cmap_set(ARIAL_PATH),
    "sym":   cmap_set(SYM_PATH),
}

class FontCache:
    def __init__(self):
        self._c = {}
    def get(self, path, size):
        k = (path, size)
        if k not in self._c:
            self._c[k] = ImageFont.truetype(path, size)
        return self._c[k]

FC = FontCache()

def route(cp):
    """Return (path, mode) for a codepoint. mode: 'mono' full-cell or 'fit' shrink-to-cell."""
    if not is_wc(cp):
        if cp in COV["jbm"]:   return (JBM_PATH, "mono")
        if cp in COV["sfm"]:   return (SFM_PATH, "mono")     # browser: SF Mono fallback, still 1 cell
        if cp in COV["arial"]: return (ARIAL_PATH, "fit")
        if cp in COV["sym"]:   return (SYM_PATH, "fit")
        return (None, "tofu")
    # wide-glyph set -> always shrink into one cell
    if cp in COV["arial"]: return (ARIAL_PATH, "wc")
    if cp in COV["sym"]:   return (SYM_PATH, "wc")
    if cp in COV["jbm"]:   return (JBM_PATH, "wc")
    return (EMOJI_PATH, "emoji")

def render(text, fs=24, pad=18, maxpx=5200, line_height=1.18,
           bg=(0x10,0x11,0x13), fg=(0xe9,0xe7,0xe1)):
    lines = text.replace("\t", "        ").split("\n")
    # strip a single trailing empty line artifact but keep internal blanks
    while lines and lines[-1] == "":
        lines.pop()
    if not lines:
        lines = [""]
    cols = max((len(l) for l in lines), default=1)
    rows = len(lines)

    # adaptive size so the longest dimension stays within maxpx
    jbm0 = FC.get(JBM_PATH, fs)
    cw = jbm0.getlength("0")
    while fs > 6 and (cols * cw + 2*pad > maxpx or rows * fs * line_height + 2*pad > maxpx*1.8):
        fs -= 1
        jbm0 = FC.get(JBM_PATH, fs)
        cw = jbm0.getlength("0")
    cell_w = cw
    cell_h = round(fs * line_height)
    W = int(round(cols * cell_w)) + 2*pad
    H = rows * cell_h + 2*pad

    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)
    jbm = FC.get(JBM_PATH, fs)

    flags = {"fallback": 0, "wc": 0, "tofu": 0}

    def draw_special(ch, col, row, path, mode):
        x0 = pad + col*cell_w; y0 = pad + row*cell_h
        cx = x0 + cell_w/2.0;   cy = y0 + cell_h/2.0
        if mode == "wc":
            gsize = max(6, int(round(fs*0.62)))
        elif mode == "emoji":
            gsize = max(6, int(round(fs*0.62)))
        else:  # fit
            gsize = fs
        try:
            if mode == "emoji":
                ef = FC.get(EMOJI_PATH, 137)  # apple emoji strike
                tmp = Image.new("RGBA", (160,160), (0,0,0,0))
                ImageDraw.Draw(tmp).text((80,80), ch, font=ef, anchor="mm", embedded_color=True)
                bb = tmp.getbbox()
                if bb:
                    g = tmp.crop(bb)
                    sc = min(cell_w*0.92/g.width, cell_h*0.92/g.height)
                    g = g.resize((max(1,int(g.width*sc)), max(1,int(g.height*sc))), Image.LANCZOS)
                    img.paste(g, (int(cx-g.width/2), int(cy-g.height/2)), g)
                flags["wc"] += 1
                return
            f = FC.get(path, gsize)
            # measure, and if fit-mode glyph is wider than a cell, shrink
            l,t,r,b = d.textbbox((0,0), ch, font=f)
            gw, gh = r-l, b-t
            if mode == "fit" and gw > cell_w*0.98:
                gsize = max(6, int(gsize * (cell_w*0.96)/gw))
                f = FC.get(path, gsize)
            d.text((cx, cy), ch, font=f, fill=fg, anchor="mm")
            flags["wc" if mode in ("wc","emoji") else "fallback"] += 1
        except Exception:
            # tofu placeholder: faint hollow box so the cell is visibly occupied
            m = cell_w*0.22
            d.rectangle([x0+m, y0+cell_h*0.2, x0+cell_w-m, y0+cell_h*0.85],
                        outline=(120,120,120))
            flags["tofu"] += 1

    for row, line in enumerate(lines):
        col = 0
        run = []        # batched JBM-mono chars
        run_start = 0
        def flush():
            nonlocal run, run_start
            if run:
                d.text((pad + run_start*cell_w, pad + row*cell_h),
                       "".join(run), font=jbm, fill=fg, anchor="la")
                run = []
        for ch in line:
            cp = ord(ch)
            if ch == " ":
                # spaces are JBM-advance; keep them in a run only if a run is open,
                # else just advance.
                if run:
                    run.append(ch)
                col += 1
                continue
            path, mode = route(cp)
            if mode == "mono" and path == JBM_PATH:
                if not run: run_start = col
                run.append(ch)
            elif mode == "mono" and path == SFM_PATH:
                flush()
                f = FC.get(SFM_PATH, fs)
                d.text((pad + col*cell_w, pad + row*cell_h), ch, font=f, fill=fg, anchor="la")
                flags["fallback"] += 1
            else:
                flush()
                draw_special(ch, col, row, path, mode)
            col += 1
        flush()

    return img, {"cols": cols, "rows": rows, "fs": fs, "px": (W, H), **flags}

def load_text(args, ident):
    if ident.startswith("/") or ident.endswith(".txt"):
        return open(ident, encoding="utf-8").read(), os.path.splitext(os.path.basename(ident))[0]
    return open(os.path.join(PIECES, ident + ".txt"), encoding="utf-8").read(), ident

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("ids", nargs="*")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--txt")
    ap.add_argument("--fs", type=int, default=24)
    ap.add_argument("--pad", type=int, default=18)
    ap.add_argument("--maxpx", type=int, default=5200)
    args = ap.parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    targets = []
    if args.txt:
        targets = [args.txt]
    elif args.all:
        targets = json.load(open(CULL))
    else:
        targets = args.ids
    report = {}
    for ident in targets:
        try:
            text, name = load_text(args, ident)
        except FileNotFoundError:
            sys.stderr.write(f"missing {ident}\n"); continue
        img, meta = render(text, fs=args.fs, pad=args.pad, maxpx=args.maxpx)
        out = os.path.join(args.outdir, name + ".png")
        img.save(out)
        report[name] = meta
    print(json.dumps(report, indent=0)[:4000])
    print(f"\nrendered {len(report)} -> {args.outdir}")

if __name__ == "__main__":
    main()
