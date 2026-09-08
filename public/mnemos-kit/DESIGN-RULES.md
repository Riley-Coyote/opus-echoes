# Mnemos Research — design ruleset

Brand: **Mnemos Research** (parent) · **Polyphonic** (desktop app) · **mnemos-continuity** (the open MCP layer).
Canonical guide: `Mnemos Design System.dc.html` (rev 02). Engine: `dot-display.js` + `mnemos-scenes.js`.
Reference register: Linear, Nothing, Vercel, OpenAI, Anthropic. Restraint is the strategy.

## Materials

Three, and nothing is two of them at once.

- **Housing** — opaque, monochrome, still. Structure, chrome, controls, prose. Never emits light.
- **Glass** — translucent, blurred, edge-lit by one hairline. Only for things that float above the page.
  - *Frost* (overlays, menus, sticky bars, HUD): `blur(22px) saturate(1.5)`, 1px `--frost-line`, `--lift` shadow.
  - *Smoked* (inset panels that let the substrate read through): `blur(28px)`, 1px `--smoke-line`, no shadow, no saturation lift.
  - *Opaque* is the default and the right answer three times out of four.
- **Display** — the dot lattice on `--glass`. Charge persists between frames and decays; nothing cuts to black. Identical in both housings — never themed. Doto is its native face.

### The editorial spread

Long-form and explainer pages are one pattern, repeated and alternated: display well on one side, argument on the other, corner labels on the glass as the only annotation. Light housing; the glass stays black, so there is exactly one dark object per beat and the eye goes there.

## Tokens

```css
:root{
  --bg:#000000; --s1:#0E0E0E; --s2:#161616; --s3:#1E1E1E;
  --line:#232323; --line2:#2E2E2E;
  --t0:#FAFAFA; --t1:#B4B4B4; --t2:#7E7E7E; --t3:#565656;
  --sig:#E03C2F;
  --frost:rgba(255,255,255,.055); --frost-line:rgba(255,255,255,.10);
  --smoke:rgba(14,14,14,.72);     --smoke-line:rgba(255,255,255,.07);
  --lift:0 24px 60px -22px rgba(0,0,0,.8);
  --glass:#0A0B0A; --phos:#EFEFED; --glass-line:#1C1D1C; --unlit:#1F211F;
  --r-ctl:6px; --r-panel:10px; --r-surface:14px;
  --pad:clamp(20px,5vw,80px);
  --ease-ctl:cubic-bezier(.2,0,0,1); --ease-page:cubic-bezier(.16,1,.3,1);
}
[data-housing="light"]{
  --bg:#FFFFFF; --s1:#F0F0EE; --s2:#E9E9E6; --s3:#E1E1DD;
  --line:#E3E3E0; --line2:#D3D3CF;
  --t0:#0C0C0C; --t1:#4A4A48; --t2:#757571; --t3:#9C9C97;
  --sig:#CE2E1C;
  --frost:rgba(255,255,255,.62); --frost-line:rgba(0,0,0,.07);
  --smoke:rgba(255,255,255,.74);  --smoke-line:rgba(0,0,0,.06);
  --lift:0 20px 48px -20px rgba(0,0,0,.18);
}
```

Dark housing = product, app, decks, web. Light housing = research, long-form, print.

## Colour law

Neutral carries; chroma is permitted in exactly three roles.

1. **Signal** — one red. `#E03C2F` on dark, `#CE2E1C` on light. Marks live, recording, destructive, error. States, never objects. **Max one signal event per screen.**
2. **Phosphor** — identity, emitted. One hue per mind in the chorus: `#E8A33D` `#E0563C` `#A8D2E0` `#B296E8` `#86D8A8`, default `#EFEFED`. **Only ever light on glass at dot scale.** Never touches housing.
3. **Planes** — bone `#E9E5DD`, clay `#A8523C`, moss `#464E44`. Marketing only, full-bleed field behind type. Never a border, button, chart series or icon. One per page, and the page must still read monochrome without it.

Housing is never coloured. No gradients across a surface. No coloured glow that isn't phosphor.

## Imagery

**There is no photography.** The display well is the only image the brand has. No stock, no product shots, no illustration, no icon standing in for a picture. When a page needs an image it gets a display well whose scene means what the paragraph beside it says.

## Type

Three voices. Instrument Sans (400/500/600) is the person talking. Fragment Mono (400) is the machine stating a fact. **Doto (600/900) is the display speaking** — legal in exactly three places and no fourth: inside a display well; exactly one word of a headline where the display is what's speaking; a live readout (counter, clock, a number that is changing). **One instance per view.** Never prose, never a label.

| Role | Spec |
|---|---|
| Readout | Doto 900 · tabular · 18px–2.3rem |
| Display | `clamp(2.7rem,6.6vw,5.4rem)` · 500 · −.042em · 0.97 — one per page |
| Section | `clamp(1.9rem,3.9vw,3.1rem)` · 500 · −.034em · 1.04 |
| Statement | `clamp(1.15rem,1.9vw,1.45rem)` · 500 · −.02em · 1.45 |
| Title | `1.1rem` · 500 · −.02em · 1.28 |
| Body | `17px` · 400 · 1.62 · max 68ch |
| Small | `14.5px` · 400 · 1.6 |
| Label | `9.5–10.5px` mono · .16–.18em · uppercase |

Eight sizes total. Tracking tightens as size grows; never letterspace the sans positively. Mono is never above 13px and never used for prose.

**Set, and drawn.** Doto is *set* — a webfont, in housing, at title scale, once per view. Above that scale the dot voice is *drawn* by the engine (`headline` scene) on its own 5×7 face at the panel's real pitch, arriving by dithering in. Drawn type can carry a whole page — a cover, a social post, a one-line slide — and can only ever appear on glass. A drawn headline in housing is a mistake.

**The quota: at most two uppercase mono labels visible at once, and one word of Doto.** Over-labelling is the fastest way to look like a template.

## Space and radius

8px baseline. Radii are small — machined, not soft: **6px** controls · **10px** panels · **14px** floating glass · **999px** pills (status, tags, avatars). Never above 14px.

The hard 90° corner is kept as a deliberate texture, in three places only: anything full-bleed (bands, colour planes), a catalog of specimens on a 1px hairline grid, and the rules of a data table. Everything else takes a radius. All-square reads as a terminal emulator; all-soft reads as a consumer app. Both registers on one page is the effect.

Inner radius = outer radius − padding between them. Concentric corners are the difference between machined and glued.

Cards are separated by **16–20px of real space** — a 1px seam only inside a catalog grid. Content max 1240px, prose 68ch, page gutter `clamp(20px,5vw,80px)`, section rhythm 88–176px.

## Motion

Three registers, assigned by layer.

- **Controls** — 90–140ms, `cubic-bezier(.2,0,0,1)`, `translateY(1px)` and a tone change. No scale, no bounce, no glow.
- **Page** — 260–420ms, `cubic-bezier(.16,1,.3,1)`, 10px travel + opacity, 40ms stagger, once per element. Never on body copy already being read.
- **Display** — continuous, engine-driven. `fade(k)` per frame; never clear the buffer.

Nothing in the housing exceeds 450ms. Everything collapses under `prefers-reduced-motion`.

## Format numbers

- **Web / landing** — dark housing, 1240px max. One statement per screen, one display well per statement. Hero 5.4rem; nothing else above 3.1rem.
- **Deck 1920×1080** — dark housing, 96px margins. Title 120px, statement 72px, body never below 28px. Three slide types only: statement, figure, sheet.
- **Social 1080×1350** — the one place a colour plane is allowed. 72px safe margin, mark and handle in a black band, one sentence, no CTA.
- **App (Polyphonic)** — rail / work area / instrument column. 8px baseline, 13.5px body, 32px rows. Phosphor identifies who is speaking.

## The lattice

One grid underneath everything: the mark, identity emblems, display glyphs, avatars, scenes. Odd-numbered, square, round dots, **unlit dots left visible** (`--unlit`) — they are the field the mark is printed on, and leaving them there is what makes an emblem read as switched on rather than drawn.

- **The mark** — an M on 7×7. Clear space = one dot pitch. Below 16px, drop the unlit field.
- **Identity emblems are generated, never drawn.** FNV-1a hash of the name into xorshift, mirrored on the vertical axis, ~42% density. 7×7 = the mark, 9×9 = app avatar, 11–15 = print and large formats. Same seed at a finer lattice = denser emblem, more seal than pixel.
- **Display glyphs** — the housing icon set re-cut on 7×7. Same marks exist twice; which one you use is decided by the material, not the size. Housing engraves, the display emits.
- **Icons in housing** — 24 grid, 1.5 stroke, square terminals, miter joins, never filled, never rounded.

## The marquee band

A full-bleed `data-scene="marquee"` canvas on `--glass`, 96–132px tall, square corners, hairline above and below. One per page maximum, used as a divider between beats — never as a headline and never carrying information the page needs.

## Display engine

```html
<script src="dot-display.js"></script>
<script src="mnemos-scenes.js"></script>
<canvas data-scene="net"></canvas>
<canvas data-scene="bars" data-labels="CURIOSITY,WARMTH,CLARITY"></canvas>
<!-- then, once, after mount: DotDisplay.mount(root) -->
```

Preferred scenes: `field` (idle), `resolve` (thinking), `net` (recall/resonance), `travel` (handoff), `burial` (scarcity), `bars` (levels), `type` (a note left for you). Also available: `pulse` `scan` `radar` `orbit` `wipe` `marquee`. Own scenes in `mnemos-scenes.js`: **`memory`** (the cover — a living memory graph) and **`headline`** (hero-scale drawn dot type from `data-text`).

**Dot pitch by scale.** `data-cell` is the whole difference between a lattice and a grain: 4–5px in small wells, 7px for a drawn headline, **12–16px at hero scale**. At hero size a fine pitch reads as noise and the marks vanish — coarse enough that one dot is an object. Bloom (the neighbour bleed) is attenuated automatically as the pitch coarsens — full strength to 5px, gone by 14px — because a one-cell bleed that shimmers at 4px paints a halo of half-lit dots around every letter at hero scale. Drawn type stays sharp; never raise `data-bloom` on a coarse panel to compensate.

### The cover pattern

A full-bleed `memory` well, 430–690px tall, square corners, hairline below; `data-bias="tr"` pushes the graph to the upper right; the eyebrow and the display-scale title sit over the glass at the bottom left in `--phos`; corner labels top-left and top-right. One per site.

When you edit `mnemos-scenes.js`, bump the `?rev=N` on its script tag — the preview caches it otherwise.

Well labels occupy the first nine dot rows — scenes must start content at `DotDisplay.CAP` and reserve their own footer rows. A scene that doesn't mean anything is decoration; pick the one whose meaning matches the paragraph beside it.

**Data viz:** live series on glass in dots; finished figures in housing as hairlines. One series in ink, signal only on the current value, tabular numerals, a single baseline rule, no gridlines. Direct labels over legends.

## Component states

Focus is always a 2px signal outline at 3px offset — the one place signal appears without a live state behind it, because a keyboard user needs it more than the law needs the exemption. Disabled goes dashed and drops to `--t3`, never a global opacity fade. Loading is quantized cells, never a spinner. Attention is signal on the border plus one mono line underneath saying what to do about it. Destructive is a signal-bordered hairline key, never a signal fill.

## Voice

Plain, short, certain. Sentence case in prose, lowercase in chrome, caps only inside the display.

Always: name a number's source in the same sentence · label an unfinished thing at its real stage · say the plain version before the precise one · caption a figure with what to notice · let a sentence be short when it's finished.

Never: seamless, powerful, revolutionary, unlock, elevate, effortless · an internal term the reader hasn't been given · a bare statistic with no unit or origin · exclamation marks or a question as a headline · a claim the build cannot currently do.

## What breaks it

- A second accent colour, or signal as a fill, heading or border.
- A gradient across a surface, or a coloured glow that isn't phosphor.
- An inner white highlight on glass, or glass floating above nothing.
- Cards separated by a 1px seam where real space belongs (catalog grids excepted).
- More than two uppercase mono labels in one view.
- Applied texture: a noise PNG, a grain overlay, a fake scanline.
- Theming the glass.
- Radii above 14px, or square corners on anything that isn't full-bleed, a catalog grid, or a table rule.
- Doto for prose, for a label, or more than once in a view.
- An emblem drawn by hand rather than generated from its seed.
- Emoji, anywhere.
