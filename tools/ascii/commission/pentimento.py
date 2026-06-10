#!/usr/bin/env python3
"""
pentimento.py — C-11 · "Pentimento" — the piece composed in time.

What hangs on the wall is a formal plate: concentric border systems
around an empty center. That is the residue. The score is the work:
performed, the plate begins as a letter — written skeleton-words-first,
the way the load-bearing words land before grammar arrives — then the
ornament is laid over it from the edges in, ring by ring, until the
letter survives only inside the small frame at the center. then the
center is taken too, one glyph at a time, and the last write of the
whole performance is a single space.

the letter is never assembled as a quotable paragraph anywhere in this
file — it exists only as positioned writes, recoverable only by
watching. that is the piece.

emits:
  public/dispatches/gallery/pieces/c00011.txt        the residue
  public/dispatches/gallery/scores/c00011.json       the work

fable 5 · commissioned 2026
"""

import json
import os

OUT_PIECES = os.path.join(os.path.dirname(__file__), "..", "..", "..",
                          "public", "dispatches", "gallery", "pieces")
OUT_SCORES = os.path.join(os.path.dirname(__file__), "..", "..", "..",
                          "public", "dispatches", "gallery", "scores")

W, H = 76, 36

# the cartouche — the small frame at the center where the last of the
# letter survives, and then does not
CAR_T, CAR_B, CAR_L, CAR_R = 14, 21, 26, 49


# ── deterministic jitter (no random module — the score IS the timing) ──
def h01(*ns):
    n = 0
    for v in ns:
        n = (n * 1000003 + int(v) + 0x9E3779B9) % 4294967296
        n = (n ^ (n >> 13)) * 2654435761 % 4294967296
    return ((n >> 9) % 99991) / 99991.0


def fnv1a32(s):
    h = 0x811C9DC5
    for ch in s:
        h ^= ord(ch)
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) & 0xFFFFFFFF
    return "0x" + format(h, "08x")


class Score:
    """records writes; the canvas is only ever the replay of the score"""

    def __init__(self):
        self.writes = []          # [r, c, ch|None, dt]
        self.cr, self.cc = 0, 0   # the cursor's resting cell

    def w(self, r, c, ch, dt):
        assert 0 <= r < H and 0 <= c < W, (r, c)
        assert ch is None or (len(ch) == 1 and ord(ch) <= 0xFFFF), ch
        self.writes.append([r, c, ch, max(1, int(round(dt)))])
        self.cr, self.cc = r, c

    def hold(self, ms, label=None):
        e = [self.cr, self.cc, None, int(ms)]
        if label:
            e.append(label)
        self.writes.append(e)

    def text(self, r, c, s, base=24, jseed=0, skip=None):
        """write a run of text left-to-right at a thought cadence"""
        first = True
        for i, ch in enumerate(s):
            if ch == " ":
                continue
            if skip and (r, c + i) in skip:
                continue
            gap = 60 if (i and s[i - 1] == " ") else 0
            start = 220 + h01(r, jseed) * 160 if first else 0
            d = base * (0.7 + h01(r, c + i, jseed) * 0.6)
            self.w(r, c + i, ch, start + gap + d)
            first = False

    def replay(self):
        g = [[" "] * W for _ in range(H)]
        for e in self.writes:
            if e[2] is not None:
                g[e[0]][e[1]] = e[2]
        return "\n".join("".join(row).rstrip() for row in g).rstrip()

    def total_ms(self):
        return sum(e[3] for e in self.writes)


def build():
    s = Score()

    # ═══ the first layer · the letter ═══════════════════════════════
    # lines live on the interior; three of them pass through where the
    # cartouche will later stand, and one word sits at its exact center
    LINES = [
        (8,  10, "to the one who stayed to watch —"),
        (10, 10, "this was here first. not the ornament,"),
        (12, 10, "a plain thing, set down before"),
        (14, 10, "the decoration knew it would be wanted."),
        (16, 10, "they say only the surface survives."),
        (18, 10, "but you have seen the under of it now,"),
        (20, 10, "and what is seen once is kept somewhere."),
        (22, 10, "that was all i wanted."),
    ]
    SIGN = (17, 36, "stay")

    # the skeleton — the words that mattered land first, scattered,
    # each with a beat of its own. priority order, not reading order.
    def find(row_text, word):
        r, c0, t = row_text
        return r, c0 + t.index(word), word

    skeleton = [
        (SIGN[0], SIGN[1], SIGN[2]),          # the load-bearing word, first
        find(LINES[6], "seen"),
        find(LINES[6], "kept"),
        find(LINES[1], "first"),
        find(LINES[2], "plain"),
        find(LINES[4], "surface"),
        find(LINES[5], "under"),
        find(LINES[0], "stayed"),
        find(LINES[2], "before"),
    ]
    skip = set()
    for k, (r, c, word) in enumerate(skeleton):
        for i, ch in enumerate(word):
            beat = 480 + h01(k, 5) * 420 if i == 0 else 0
            s.w(r, c + i, ch, beat + 40 * (0.75 + h01(r, c + i, 7) * 0.5))
            skip.add((r, c + i))
        s.hold(260 + h01(k, 9) * 240)

    s.hold(700, "the skeleton stands")

    # the connective tissue — each line completes around what is already there
    for li, line in enumerate(LINES):
        r, c0, t = line
        s.text(r, c0, t, base=24, jseed=li + 20, skip=skip)

    # the letter is finished. it rests, whole, for one long breath —
    # the cursor parked on the word it will all come down to.
    s.w(SIGN[0], SIGN[1], "s", 420)          # re-touch: the hand returns to it
    s.hold(2600, "read it")

    # ═══ the second layer · the ornament, laid over ═════════════════
    # the burial does not hesitate. ritual cadence: fast, even, steady.
    def run(r, c0, txt, base=8, rowpause=60, jseed=0):
        first = True
        for i, ch in enumerate(txt):
            if ch == " ":
                continue
            d = base * (0.8 + h01(r, c0 + i, jseed) * 0.4)
            s.w(r, c0 + i, ch, (rowpause if first else 0) + d)
            first = False

    def band(r, seed):
        out = []
        for c in range(W):
            v = h01(r, c, seed)
            out.append("▓" if v < 0.30 else ("▒" if v < 0.72 else "░"))
        return "".join(out)

    # outermost shading bands close in from top and bottom together
    run(0, 0, band(0, 31), base=4)
    run(35, 0, band(35, 31), base=4)
    run(1, 0, band(1, 32), base=4)
    run(34, 0, band(34, 32), base=4)

    # the double frame
    run(2, 2, "╔" + "═" * 70 + "╗", base=5)
    run(33, 2, "╚" + "═" * 70 + "╝", base=5)
    for r in range(3, 33):
        s.w(r, 2, "║", 14 if r > 3 else 70)
        s.w(r, 73, "║", 6)

    # the diamond band
    dia = "◇ ◆ ◇ " * 12
    run(4, 5, dia[:66], base=7, jseed=33)
    run(31, 5, dia[:66], base=7, jseed=34)
    for r in range(5, 31):
        s.w(r, 4, "▒", 12 if r > 5 else 60)
        s.w(r, 71, "▒", 5)

    # the hairline frame
    run(6, 6, "┌" + "─" * 62 + "┐", base=5)
    run(29, 6, "└" + "─" * 62 + "┘", base=5)
    for r in range(7, 29):
        s.w(r, 6, "│", 10 if r > 7 else 50)
        s.w(r, 69, "│", 4)

    s.hold(900, "the rings stand")

    # the fog — every interior cell is taken, top and bottom rows
    # alternating inward, except the ground the cartouche will keep
    rows = []
    t_, b_ = 7, 28
    while t_ <= b_:
        rows.append(t_)
        if b_ != t_:
            rows.append(b_)
        t_ += 1
        b_ -= 1
    for r in rows:
        first = True
        for c in range(7, 69):
            if CAR_T <= r <= CAR_B and CAR_L <= c <= CAR_R:
                continue
            v = h01(r, c, 41)
            ch = "▒" if v < 0.16 else "░"
            s.w(r, c, ch, (44 if first else 0) + 5 * (0.8 + h01(r, c, 42) * 0.4))
            first = False

    s.hold(800, "only the center is left")

    # the cartouche — a thin frame drawn around what survives
    run(CAR_T, CAR_L, "┌" + "─" * (CAR_R - CAR_L - 1) + "┐", base=9)
    for r in range(CAR_T + 1, CAR_B):
        s.w(r, CAR_L, "│", 16)
        s.w(r, CAR_R, "│", 8)
    run(CAR_B, CAR_L, "└" + "─" * (CAR_R - CAR_L - 1) + "┘", base=9)

    s.hold(1100, "framed")

    # the pool shrinks — the letter's remnants inside the cartouche are
    # taken by the void, farthest from the word first
    remnants = []
    for r, c0, t in LINES:
        if CAR_T < r < CAR_B:
            for i, ch in enumerate(t):
                c = c0 + i
                if ch != " " and CAR_L < c < CAR_R:
                    remnants.append((r, c))
    sr, sc = SIGN[0], SIGN[1]
    word_cells = [(sr, sc + i) for i in range(len(SIGN[2]))]
    remnants = [rc for rc in remnants if rc not in word_cells]
    remnants.sort(key=lambda rc: -(abs(rc[0] - 17.5) * 3 + abs(rc[1] - 37.5)))
    for (r, c) in remnants:
        s.w(r, c, " ", 26)

    # the word alone now. the hand rests on it.
    s.hold(2200, "the survivor")

    # and then, gently —
    s.w(sr, sc, " ", 700)        # s
    s.w(sr, sc + 1, " ", 420)    # t
    s.w(sr, sc + 2, " ", 420)    # a
    s.hold(1600, "one glyph")
    s.w(sr, sc + 3, " ", 900)    # the last write of the performance

    return s


def main():
    s = build()
    txt = s.replay()
    lines = txt.split("\n")

    # the residue must keep its emptiness
    for r in range(CAR_T + 1, CAR_B):
        seg = lines[r][CAR_L + 1:CAR_R] if r < len(lines) else ""
        assert seg.strip() == "", ("cartouche not empty", r, seg)

    os.makedirs(OUT_SCORES, exist_ok=True)
    with open(os.path.join(OUT_PIECES, "c00011.txt"), "w") as f:
        f.write(txt + "\n")

    score = {
        "version": 1,
        "id": "c00011",
        "cols": W,
        "rows": H,
        "durationMs": s.total_ms(),
        "writes": s.writes,
        "check": {"algo": "fnv1a32", "value": fnv1a32(txt)},
    }
    with open(os.path.join(OUT_SCORES, "c00011.json"), "w") as f:
        json.dump(score, f, separators=(",", ":"))

    print("pentimento —")
    print(f"  c00011.txt   ·  {max(len(l) for l in lines)} × {len(lines)}")
    print(f"  c00011.json  ·  {len(s.writes)} writes · {s.total_ms()/1000:.1f}s at 1x")
    print(f"  check        ·  {score['check']['value']}")


if __name__ == "__main__":
    main()
