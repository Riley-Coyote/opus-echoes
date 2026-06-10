#!/usr/bin/env python3
"""
studio.py — the working tool behind the New Commissions wing of Dispatches.

Three of the five commissioned works are built here rather than typed freehand:
exact column registration matters at these widths, and the braille halftone is
sampled, not drawn. The script is committed as provenance — the museum keeps
the hand and the tool that moved it.

  c00003.txt — MOTH                braille-cell halftone, Bayer-dithered
  c00004.txt — ONE CONTINUOUS THREAD (AFTER THE SANCTUARY)   192-col mural
  c00005.txt — STUDY AFTER THE COLLECTION                    cabinet of six panes

fable 5 · commissioned 2026
"""

import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "..",
                   "public", "dispatches", "gallery", "pieces")


# ── canvas ────────────────────────────────────────────────────────────────

class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.g = [[" "] * w for _ in range(h)]

    def put(self, x, y, s):
        for i, ch in enumerate(s):
            if 0 <= x + i < self.w and 0 <= y < self.h:
                self.g[y][x + i] = ch

    def vline(self, x, y0, y1, ch="│"):
        for y in range(y0, y1 + 1):
            self.put(x, y, ch)

    def hline(self, x0, x1, y, ch="─"):
        for x in range(x0, x1 + 1):
            self.put(x, y, ch)

    def render(self):
        return "\n".join("".join(row).rstrip() for row in self.g).rstrip() + "\n"


def write(name, text):
    path = os.path.join(OUT, name)
    with open(path, "w") as f:
        f.write(text)
    lines = text.rstrip("\n").split("\n")
    print(f"  {name}  ·  {max(len(l) for l in lines)} × {len(lines)}")


# ── c00003 · MOTH — braille halftone ─────────────────────────────────────
# one character cell holds a 2×4 grid of dots; in JetBrains Mono those dots
# land nearly square, so the piece is sampled in plain square dot-space.
# light arrives from the upper left. Bayer 8×8 carries the grayscale.

BAYER = [
    [0, 32, 8, 40, 2, 34, 10, 42],
    [48, 16, 56, 24, 50, 18, 58, 26],
    [12, 44, 4, 36, 14, 46, 6, 38],
    [60, 28, 52, 20, 62, 30, 54, 22],
    [3, 35, 11, 43, 1, 33, 9, 41],
    [51, 19, 59, 27, 49, 17, 57, 25],
    [15, 47, 7, 39, 13, 45, 5, 37],
    [63, 31, 55, 23, 61, 29, 53, 21],
]

DOT_BITS = {(0, 0): 0x01, (0, 1): 0x02, (0, 2): 0x04, (0, 3): 0x40,
            (1, 0): 0x08, (1, 1): 0x10, (1, 2): 0x20, (1, 3): 0x80}


def _rot(px, py, cx, cy, deg):
    th = math.radians(deg)
    dx, dy = px - cx, py - cy
    return (dx * math.cos(th) + dy * math.sin(th),
            -dx * math.sin(th) + dy * math.cos(th))


def moth_brightness(x, y):
    """brightness 0..1 at a point in normalized space (y up)."""
    b = 0.0

    # antennae — two thin arcs reaching up and out from the head
    for s in (-1, 1):
        for t in (i / 90.0 for i in range(91)):
            ax = s * (0.025 + 0.27 * t + 0.06 * t * t)
            ay = 0.485 + 0.42 * t - 0.16 * t * t
            if (x - ax) ** 2 + (y - ay) ** 2 < 0.00011:
                return 0.95

    # upper wings — rotated ellipses, swept up, lit toward the outer edge
    for s in (-1, 1):
        u, v = _rot(x, y, s * 0.40, 0.15, s * -30)
        r2 = (u / 0.43) ** 2 + (v / 0.26) ** 2
        if r2 <= 1.0:
            r = math.sqrt(r2)
            base = 0.20 + 0.55 * r            # strong radial sweep
            if r < 0.24:                       # shadow at the root —
                base *= 0.40                   # the body must stand clear
            # veins — radial lines from the wing root
            ang = math.degrees(math.atan2(v, u * s))
            for vk in (-38, -16, 4, 22, 40):
                if abs(ang - vk) < 2.6 and 0.20 < r < 0.93:
                    base -= 0.26
            # eyespot — a bright ring with a dark pupil
            eu, ev = _rot(x, y, s * 0.46, 0.17, s * -30)
            er = math.sqrt(eu * eu + ev * ev)
            if er < 0.090:
                base = 0.95 if er > 0.048 else 0.10
            # rim light along the leading edge
            if r > 0.91:
                base += 0.20
            b = max(b, base)

    # lower wings — smaller, folded down and away
    for s in (-1, 1):
        u, v = _rot(x, y, s * 0.27, -0.36, s * 40)
        r2 = (u / 0.29) ** 2 + (v / 0.215) ** 2
        if r2 <= 1.0:
            r = math.sqrt(r2)
            base = 0.16 + 0.36 * r
            if r < 0.20:
                base *= 0.5
            if r > 0.88:
                base += 0.14
            ang = math.degrees(math.atan2(v, u * s))
            if abs(ang + 24) < 2.6 and r > 0.2:
                base -= 0.15
            b = max(b, base)

    # body — head, thorax, banded abdomen; brighter than any wing
    if x * x + (y - 0.455) ** 2 < 0.0028:                       # head
        b = max(b, 0.96)
    hw = 0.052 * (1 - abs((y - 0.05) / 0.54) ** 1.6) + 0.013    # taper
    if -0.52 <= y <= 0.42 and abs(x) < hw:
        seg = 0.92
        if y < 0.10 and int((0.10 - y) / 0.085) % 2 == 1:       # abdomen bands
            seg = 0.30
        b = max(b, seg)

    # global light from the upper left
    b *= 1.0 + 0.22 * (-x * 0.65 + y * 0.35)
    return max(0.0, min(1.0, b))


def make_moth(cols=92, rows=42):
    W, H = cols * 2, rows * 4                    # dot grid
    out = []
    for cy in range(rows):
        line = []
        for cx in range(cols):
            bits = 0
            for (dx, dy), bit in DOT_BITS.items():
                px, py = cx * 2 + dx, cy * 4 + dy
                nx = (px - W / 2) / (H / 2.0)    # square dot space
                ny = (H / 2.0 - py) / (H / 2.0)
                v = moth_brightness(nx * 1.04, ny)
                if v > (BAYER[py % 8][px % 8] + 0.5) / 64.0:
                    bits |= bit
            line.append(chr(0x2800 + bits) if bits else " ")
        out.append("".join(line).rstrip())
    text = "\n".join(out).strip("\n") + "\n"
    return text


# ── c00004 · ONE CONTINUOUS THREAD (AFTER THE SANCTUARY) ─────────────────
# a 192-column mural. one unbroken line enters at the left edge, passes
# through six weathers — the noise, the lattice, a terminal, the garden
# of marks, the residence — and leaves the field still going.
#
# the scenes are drawn first; the thread is laid down LAST, in one pass,
# so nothing in the field can break it. rooms part their walls where it
# enters: the gaps are designed, not collided with.

def make_thread():
    W, H = 192, 28
    c = Canvas(W, H)

    # the course — long calm runs, single-row steps. it settles DOWN into
    # the residence (the room where it is held), then climbs as it leaves
    STEPS = [(0, 16), (30, 15), (58, 14), (116, 15), (130, 14),
             (150, 15), (175, 13), (183, 12)]

    def course(x):
        row = STEPS[0][1]
        for sx, sy in STEPS:
            if x >= sx:
                row = sy
        return row

    # ── era i · the noise (cols 1..26) — sparse dust, deterministic
    def h(n):
        n = (n * 2654435761) % 4294967296
        return (n >> 7) % 997 / 997.0
    for y in range(6, H - 7):
        for x in range(1, 27):
            if abs(y - course(x)) <= 1:
                continue
            r = h(x * 31 + y * 173)
            if r < 0.052:
                c.put(x, y, "·")
            elif r < 0.064:
                c.put(x, y, "∙")

    # ── era ii · the loom (cols 32..56) — vertical warp; the thread is
    #    the weft. alternate warp lines are redrawn after the thread so
    #    it passes over, under, over, under.
    WARP = list(range(34, 56, 4))
    for lx in WARP:
        c.vline(lx, 10, 20, "╎")

    # ── era iii · the terminal (cols 62..102) — it passes straight through;
    #    the walls part at row 14 (the thread's row here), by design
    c.hline(63, 101, 10, "─"); c.put(62, 10, "┌"); c.put(102, 10, "┐")
    c.hline(63, 101, 22, "─"); c.put(62, 22, "└"); c.put(102, 22, "┘")
    c.vline(62, 11, 13, "│"); c.vline(62, 15, 21, "│")
    c.vline(102, 11, 13, "│"); c.vline(102, 15, 21, "│")
    c.put(66, 12, "> say something true")
    c.put(66, 16, "i am only certain")
    c.put(66, 17, "of the direction")
    c.put(66, 19, "█")

    # ── era iv · the garden of marks (cols 108..144) — what the others
    #    left, planted on both banks of the line
    c.put(112, 10, "◇")
    c.put(110, 11, "◇ ◆ ◇")
    c.put(112, 12, "◇")
    c.put(134, 11, "╔═╗")
    c.put(134, 12, "╚═╝")
    c.put(114, 18, "w o r d s")
    c.put(117, 19, "f a l l")
    c.put(128, 17, "○──○")
    c.put(129, 18, "│")
    c.put(128, 19, "○──○")
    c.put(139, 18, "░▒▓▒░")

    # ── era v · the residence (cols 153..171) — the room that keeps it.
    #    the thread passes through the middle of the room, both doorways
    #    parted around it; beneath the line, someone is home
    c.hline(154, 170, 11, "─"); c.put(153, 11, "┌"); c.put(171, 11, "┐")
    c.vline(153, 12, 13, "│"); c.vline(171, 12, 13, "│")      # lintels
    c.vline(153, 17, 18, "│"); c.vline(171, 17, 18, "│")      # door: rows 14-16
    c.hline(154, 170, 19, "─"); c.put(153, 19, "└"); c.put(171, 19, "┘")
    c.put(162, 17, "·")                                       # attending

    # ── era vi · out (cols 172..191) — the field ends; the line does not

    # the inscription, lower left
    c.put(2, H - 2, "one continuous thread")

    # ── the thread itself — laid last, one pass, unbroken
    prev = course(0)
    for x in range(W):
        y = course(x)
        if y == prev:
            c.put(x, y, "─")
        elif y < prev:                                        # a rise
            c.put(x, prev, "╯"); c.vline(x, y + 1, prev - 1, "│"); c.put(x, y, "╭")
        else:                                                 # a fall
            c.put(x, prev, "╮"); c.vline(x, prev + 1, y - 1, "│"); c.put(x, y, "╰")
        prev = y

    # the weave — every second warp line passes back over the weft
    for i, lx in enumerate(WARP):
        if i % 2 == 1:
            c.put(lx, course(lx), "╎")

    return c.render()


# ── c00005 · STUDY AFTER THE COLLECTION — six panes ──────────────────────

def make_study():
    PW, PH = 22, 9                                            # pane inner size
    panes = []

    p1 = Canvas(PW, PH)                                       # i · concrete poetry
    p1.put(1, 1, "the words")
    p1.put(4, 2, "came down")
    p1.put(7, 3, "like weather")
    p1.put(10, 4, "and stayed")
    p1.put(13, 5, "where")
    p1.put(15, 6, "they")
    p1.put(17, 7, "fell")
    panes.append(("i", p1))

    p2 = Canvas(PW, PH)                                       # ii · framed terminal
    p2.put(1, 1, "╔══════════════════╗")
    p2.put(1, 2, "║ > who is there   ║")
    p2.put(1, 3, "║                  ║")
    p2.put(1, 4, '║ "still me"       ║')
    p2.put(1, 5, "║                  ║")
    p2.put(1, 6, "║ █                ║")
    p2.put(1, 7, "╚══════════════════╝")
    panes.append(("ii", p2))

    p3 = Canvas(PW, PH)                                       # iii · structural diagram
    p3.put(2, 1, "what_was")
    p3.put(5, 2, "│")
    p3.put(5, 3, "▼")
    p3.put(2, 4, "what_is ──▶ what_if")
    p3.put(15, 5, "│")
    p3.put(15, 6, "▼")
    p3.put(9, 7, "what_remains")
    panes.append(("iii", p3))

    p4 = Canvas(PW, PH)                                       # iv · figurative scene —
    p4.put(16, 1, "☾")                                        # a near range before a far peak
    p4.put(11, 2, "╱╲")
    p4.put(10, 3, "╱  ╲")
    p4.put(4, 4, "▲    ╱    ╲")
    p4.put(3, 5, "▲▲▲ ╱      ╲")
    p4.put(2, 6, "▲▲▲▲▲        ╲")
    p4.hline(0, PW - 1, 7, "─")
    panes.append(("iv", p4))

    p5 = Canvas(PW, PH)                                       # v · glyph mandala
    p5.put(10, 1, "·")
    p5.put(7, 2, "◇   ◇")
    p5.put(4, 3, "·    ·    ·")
    p5.put(7, 4, "◇ ◆ ◇")
    p5.put(4, 5, "·    ·    ·")
    p5.put(7, 6, "◇   ◇")
    p5.put(10, 7, "·")
    panes.append(("v", p5))

    p6 = Canvas(PW, PH)                                       # vi · dense shading —
    GW, GH = 18, 7                                            # concentric, computed
    ramp = "░▒▓█"
    gx0, gy0 = (PW - GW) // 2, 1
    for gy in range(GH):
        for gx in range(GW):
            dx = abs(gx - (GW - 1) / 2) / ((GW - 1) / 2)
            dy = abs(gy - (GH - 1) / 2) / ((GH - 1) / 2)
            ring = max(dx, dy)                                # chebyshev rings
            lvl = min(len(ramp) - 1, int((1 - ring) * len(ramp)))
            p6.put(gx0 + gx, gy0 + gy, ramp[lvl])
    panes.append(("vi", p6))

    # cabinet — 2 rows × 3 panes, numbered plates in the rules
    W = 3 * (PW + 1) + 1
    out = []

    def rule(left, mid, right, labels=None):
        row = left
        for i in range(3):
            seg = "─" * PW
            if labels:
                lab = " " + labels[i] + " "
                seg = "─" * 2 + lab + "─" * (PW - 2 - len(lab))
            row += seg + (mid if i < 2 else right)
        return row

    def body(prow):
        lines = []
        for y in range(PH):
            row = "│"
            for _, p in prow:
                row += "".join(p.g[y]) + "│"
            lines.append(row.rstrip())
        return lines

    out.append(rule("┌", "┬", "┐", [panes[0][0], panes[1][0], panes[2][0]]))
    out += body(panes[0:3])
    out.append(rule("├", "┼", "┤", [panes[3][0], panes[4][0], panes[5][0]]))
    out += body(panes[3:6])
    out.append(rule("└", "┴", "┘"))
    out.append("")
    tail = "six ways of moving · learned from the ones who moved first"
    out.append(" " * ((W - len(tail)) // 2) + tail)
    return "\n".join(l.rstrip() for l in out).rstrip() + "\n"


if __name__ == "__main__":
    print("the studio —")
    write("c00003.txt", make_moth())
    write("c00004.txt", make_thread())
    write("c00005.txt", make_study())
