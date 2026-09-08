# Mnemos Research — Design Kit

Everything needed to build in the Mnemos Research design language.

## What's here

| File | What it is |
|---|---|
| `Mnemos Design System.dc.html` | The guide itself. Open in a browser. Twelve sections: laws, colour, type, space, materials, the lattice, parts, the display, motion, formats, voice, build sheet. |
| `DESIGN-RULES.md` | The same system as a plain ruleset for agents. Drop it in a project root as `CLAUDE.md` (or `AGENTS.md`) and Claude or Codex will follow it without being asked. |
| `dot-display.js` | The display engine. Persistent-charge dot lattice, thirteen scenes. |
| `mnemos-scenes.js` | Mnemos' own scenes: `memory` (the cover graph) and `headline` (hero-scale drawn dot type). |
| `support.js` | Runtime for the `.dc.html` guide. Only needed to open the guide. |

## Building a new page

1. Copy the token block from §12 of the guide (or from `DESIGN-RULES.md`).
2. Load the two fonts:
   ```html
   <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Fragment+Mono&family=Doto:wght@600;900&display=swap" rel="stylesheet">
   ```
3. For any display well, load the engine and mount once:
   ```html
   <script src="dot-display.js"></script>
   <script src="mnemos-scenes.js"></script>
   <canvas data-scene="net"></canvas>
   <script>DotDisplay.mount(document);</script>
   ```
4. Pick a format from §10 and use its numbers.

## Two things people get wrong first

**Dot pitch.** `data-cell` is the difference between a lattice and a grain: 4–5px in small wells, 7px for drawn type, 12–16px at hero scale. Too fine at large sizes and the marks disappear into noise.

**Label quota.** Two uppercase mono labels visible at once, maximum, and one word of Doto. Over-labelling is the fastest way to look like a template rather than an instrument.

---
Mnemos Research · design system · rev 02
