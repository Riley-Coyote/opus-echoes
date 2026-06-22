#!/usr/bin/env python3
"""Batch print pipeline: ASCII .txt -> exact-grid SVG -> rsvg-convert -> 300dpi PNG.
Browser-free, deterministic. Paper (opaque) + white/black screenprints (transparent,
straight out of rsvg). Delivers PNGs + SVG masters to Topologie/docs.

Usage: python3 make_prints.py            # runs the configured batch
"""
import os, sys, subprocess, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svg_print
from PIL import Image, ImageFilter, ImageChops

ROOT = svg_print.ROOT
DEST = "/Users/rileycoyote/Documents/Repositories/Topologie/docs"
RENDER = os.path.join(ROOT, "studio-preview/render")
SUFFIX = {"paper": "paper", "white": "screenprint-white_transparent",
          "black": "screenprint-black_transparent"}

def make(name, path, target=4800, glow=False):
    for mode in ("paper", "white", "black"):
        # size fs so the long edge lands near `target`
        _, (cw, ch), _ = svg_print.build("plain", mode, fs=100.0, path=path)
        fs = 100.0 * target / max(cw, ch)
        svg, (cw, ch), _ = svg_print.build("plain", mode, fs=fs, path=path)
        svgf = os.path.join(RENDER, f"{name}-{mode}.svg")
        open(svgf, "w", encoding="utf-8").write(svg)
        png = f"/tmp/{name}-{mode}.png"
        subprocess.run(["rsvg-convert", svgf, "-o", png], check=True)
        im = Image.open(png)
        if mode == "paper":
            im = im.convert("RGB")   # flatten void -> fully opaque (no stray edge alpha)
            if glow:
                b = im.filter(ImageFilter.GaussianBlur(int(fs * 0.18))).point(lambda p: int(p * 0.4))
                im = ImageChops.screen(im, b)
        im.save(os.path.join(DEST, f"{name}__{SUFFIX[mode]}_300dpi.png"), dpi=(300, 300))
        shutil.copy(svgf, os.path.join(DEST, f"{name}__{SUFFIX[mode].split('_')[0]}.svg"))
    print(f"  {name}: paper + white + black + svgs  ({cw:.0f}x{ch:.0f} base)")

PIECES = [
    ("an-eye-that-sees-through-dimensions", "public/dispatches/gallery/pieces/p00666.txt"),
    ("harmony-unity-of-duality",            "public/dispatches/gallery/pieces/p00896.txt"),
    ("little-ascii-creature",               "public/dispatches/gallery/pieces/p01103.txt"),
    ("recursive-emergence-layer-psi1",      "studio-preview/render/p00334-light.txt"),
    ("glyph-mandala-no71",                  "public/dispatches/gallery/pieces/p00071.txt"),
    ("glyph-mandala-no188",                 "public/dispatches/gallery/pieces/p00188.txt"),
    ("self-portrait-glass",                 "public/dispatches/gallery/pieces/p00360.txt"),
]

if __name__ == "__main__":
    print("=== batch ===")
    for name, path in PIECES:
        make(name, path)
    print("delivered to", DEST)
