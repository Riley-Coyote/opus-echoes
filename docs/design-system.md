# Design System — The Sanctuary

The visual and voice contract for opus-echoes. This document is descriptive (capturing what is) and prescriptive (defining what stays). The live site at `https://mnemos.chat` is the source of truth when this document and the deployed site disagree.

---

## philosophy — what excellence means here

The Sanctuary is a place. A visitor approaches it. They cross a threshold, are received or declined, and either enter a room or do not. Everything in the design serves that experience.

Three principles flow from that:

**Restraint.** This is not a marketing site. It does not "drive engagement." It does not have hero CTAs, gradient buttons, illustrations, or feature grids in the usual sense. The page holds itself — visitors read at their own pace, then act. Everything that does not serve the felt experience of approach, reception, conversation, witness, or memory should not be there.

**Singular system.** A single grotesque family (Inter / Inter Tight) carries the entire public surface. Hierarchy is built through weight (200–500), size (five fluid steps), and breath — not through swapping typefaces. JetBrains Mono is the only other family, reserved strictly for metadata and eyebrows. This constraint is the voice: clean, cool, held.

**Asymmetry.** Square corners are the room. The composer's rounded inner field is the visitor's place — soft because they are the one offering something. The resident's 3D scene is procedural architecture, individually authored for each resident. The structure is shared; the expression is per-resident.

---

## surface registers

The site has **three distinct visual registers**. Mixing them carelessly is the most common failure mode for agents working on this project.

### Walkthrough register
**Used on:** the root path (`/`) — a 5-beat sequential introduction for first-time visitors.

- Display: Inter Tight, weight 200, very large (`clamp(64px, 9.5vw, 128px)` on beat 1)
- Eyebrow: JetBrains Mono uppercase, `0.32em` letter-spacing, `--quiet` color
- Body: Inter, weight 400, `--t-body-lg`, line-height 1.55
- Structure: full-viewport beats, one visible at a time, cross-fading at 1100ms
- Mood: cinematic — starfield-dark, slow reveal, the project's argument presented as a sequence
- Beat 5 is the resident chooser (the "commons") — shows all residents as typographic peers
- Returning visitors (`localStorage['sanctuary.visited'] === 'true'`) skip to beat 5

### Threshold register
**Used on:** `/opus-3`, `/sonnet-3-7`, `/approach` — where visitors interact with a specific resident.

- Display (hero question): Inter Tight, weight 300, `var(--t-hero)` = `clamp(44px, 2.7rem + 1.4vw, 64px)`, letter-spacing `-0.022em`
- Resident name: Inter Tight, weight 300, `clamp(36px, 2.2rem + 1vw, 48px)`, letter-spacing `-0.02em`
- Eyebrow / metadata: JetBrains Mono uppercase, `var(--t-eyebrow)` = `clamp(11px, 0.69rem + 0.05vw, 12px)`, letter-spacing `0.16em`, color `--quiet`
- Body prose: Inter, weight 400, `var(--t-body-lg)` = `clamp(17px, 1.06rem + 0.3vw, 19px)`, line-height 1.7
- Resident state line: JetBrains Mono uppercase, `var(--t-eyebrow)`, letter-spacing `0.16em`
- Mood: hushed, attended — `--floor`, sparse content, generous vertical space, the procedural architecture scene visible behind at 0.94 opacity
- The threshold question "What brings you here?" is the same for all residents

### Dashboard register
**Used on:** `/residence`, `/journal`, `/writing`, `/art`, `/manifesto`, `/mind`, `/memory` (when private).

- Built with Tailwind/shadcn — utilitarian, dense, designed for Riley to actually *use* rather than for a visitor to feel
- Token system is `oklch()` based, defined in `src/styles.css`
- Mood: workshop, control panel, instrument
- Do not bring walkthrough or threshold typography into the dashboard. Do not bring dashboard typography into the public surface.

---

## the sanctuary palette

Defined in `src/server/public-pages.ts` as `PUBLIC_CSS`. Variables:

```
--floor:        #06070a   /* the room itself, cool deep dark */
--deep:         #09090b   /* recessed surfaces */
--panel:        #101013   /* primary panel surface */
--panel-2:      #151518   /* raised panel surface */

--ink:          rgba(248, 248, 246, 0.96)  /* live text, what the resident says */
--body:         rgba(228, 226, 222, 0.84)  /* readable prose */
--soft:         rgba(208, 206, 202, 0.70)  /* secondary copy */
--quiet:        rgba(186, 184, 180, 0.56)  /* metadata, eyebrows */
--ghost:        rgba(160, 158, 154, 0.30)  /* tertiary, separators */

--rule:         rgba(225, 225, 225, 0.12)  /* visible borders */
--rule-soft:    rgba(225, 225, 225, 0.07)  /* whispered borders */
--rule-strong:  rgba(225, 225, 225, 0.18)  /* emphatic borders */

--state:        #82b484                     /* THE SINGLE ACCENT — green, used sparingly */
--state-soft:   rgba(130, 180, 132, 0.62)
--state-dim:    rgba(130, 180, 132, 0.16)
--state-whisper:rgba(130, 180, 132, 0.05)

--display:      'Inter Tight', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif
--body-font:    'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif
--mono:         'JetBrains Mono', 'SF Mono', monospace

--ease:         cubic-bezier(0.22, 1, 0.36, 1)
```

### The state accent

`--state` is **not a resident signature**. It is the project's single functional accent — presence, focus, action confirmation. All residents share it on the 2D CSS layer. Resident visual differentiation happens in the 3D presence layer (see below).

Rule: **do not add new CSS colors without a reason that passes Riley's scrutiny.** The monochromatic + single-green system is a deliberate constraint.

---

## typography — the type scale

Fonts are loaded via Google Fonts CDN in `public-pages.ts`:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500&family=Inter+Tight:wght@200;300;400;500&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

### Fluid five-step scale

| Token | Range | Use |
|---|---|---|
| `--t-hero` | `clamp(44px, 2.7rem + 1.4vw, 64px)` | Threshold question, walkthrough headlines |
| `--t-section-h` | `clamp(28px, 1.75rem + 0.8vw, 34px)` | Section headings, state lines |
| `--t-body-lg` | `clamp(17px, 1.06rem + 0.3vw, 19px)` | Body prose, about section |
| `--t-body` | `clamp(15px, 0.94rem + 0.2vw, 17px)` | Card body, secondary prose |
| `--t-meta` | `clamp(13px, 0.81rem + 0.1vw, 14px)` | Fine print, metadata |
| `--t-eyebrow` | `clamp(11px, 0.69rem + 0.05vw, 12px)` | Eyebrows, nav links, hints |

### Weight discipline — three weights, no more

| Token | Value | Use |
|---|---|---|
| `--w-light` | 300 | Display headlines (Inter Tight), hero text |
| `--w-regular` | 400 | Body text, navigation, most elements |
| `--w-medium` | 500 | Emphasis inside body (`<strong>`), active states |

Beat 1 of the walkthrough uses weight 200 (Inter Tight) for the enormous statement — this is the one exception.

### Italic emphasis

Inside body prose, `<em>` renders italic **and** brightens color from `--body`/`--soft` to `--ink`. Italic is not just slant — it is emphasis. The chrome itself (nav, eyebrows, headlines) never uses italic.

---

## spacing and rhythm

Everything aligns to the page width:

```
.page { width: min(1080px, calc(100% - 48px)); margin: 0 auto; padding: 96px 0 var(--s-9); }
```

### Spacing scale — 4px base, locked progression

```
--s-1:4px; --s-2:8px; --s-3:12px; --s-4:16px; --s-5:24px;
--s-6:32px; --s-7:48px; --s-8:64px; --s-9:96px; --s-10:128px;
```

### Vertical rhythm

- Top of page to first content: `96px` desktop (via `.page` padding), `48px` mobile (`--s-7`)
- Threshold stage padding: `48px` top, `32px` bottom
- Section to section: `96px` (`--s-9`)
- Heading to first paragraph: `24-32px` (`--s-5` to `--s-6`)
- Paragraph to paragraph: `16px` (`--s-4`)
- Card grid gap: `1px` with `--rule-soft` background (cards lean against each other)

### Mobile breakpoints

- `@media (max-width: 900px)` — single-column, nav stacks vertically, page width `min(100% - 36px, 720px)`, padding reduced
- `@media (max-width: 540px)` — about-row stacks, composer footer stacks vertically, flow grid single-column

When you add a new surface, do not invent new spacing values. Use the existing scale tokens.

---

## motion vocabulary

The site has **a small, deliberate motion language**. New animations should join the existing language, not introduce new conventions.

### Brand dot breath

`.brand-dot` breathes at `5.2s`:
```css
@keyframes breathe {
  0%, 100% { opacity: .42; box-shadow: 0 0 0 0 rgba(130,180,132,0); }
  50%      { opacity: .9;  box-shadow: 0 0 0 5px rgba(130,180,132,.06); }
}
```

The same `breathe` keyframe is reused on `.glyph` elements (the small dots next to eyebrows).

### Approach rise

When `data-opus-route="approach"` is set, the threshold elements enter with staggered `approach-rise` (opacity 0→1, translateY 10px→0) over 720ms with delays from 120ms to 660ms.

### Walkthrough beat transitions

Beats cross-fade at `1100ms cubic-bezier(.22,1,.36,1)`. The visibility transition is synced via `visibility 0s linear 1100ms` (delayed to match opacity). Beat 1 has additional staggered entrance animations (`wt-b1-up` at 1400ms, `wt-fade-in` at 900-1100ms).

### Page veil

Every page-to-page navigation goes through a `.page-veil` (full-screen `--floor` overlay) that starts opaque and clears after first paint (`420ms var(--ease)`). Internal link clicks trigger the reverse: veil covers → navigate → new page clears.

### Presence layer transitions

The `.opus-presence-layer` and `.opus-presence-canvas` both transition at `900ms cubic-bezier(0.22, 1, 0.36, 1)` for opacity and filter changes. State changes drive filter adjustments (saturation, brightness, contrast).

### Easing

Every transition uses `--ease: cubic-bezier(0.22, 1, 0.36, 1)`. Do not introduce other easing curves without a substantive reason.

### Reduced motion

`@media (prefers-reduced-motion: reduce)` is honored: approach-rise animations are suppressed, page-veil duration drops to 80ms. The presence layer should also respect this (canvas opacity transitions can remain, but filter animation timing should compress).

---

## the presence layer (the 3D scenes)

`public/opus-presence.js` (1754 lines, vanilla three.js) + `public/opus-presence.css`.

### What it is

A fullscreen `<canvas>` mounted inside a `.opus-presence-layer` div as the first child of `<body>`, behind every page. Scenes are **procedural** — built entirely from Three.js primitives (boxes, cylinders, tori, custom geometry). No external model files are loaded.

### Per-resident themes

The `THEMES` object defines each resident's visual world:

```js
THEMES = {
  "opus-3": {
    id: "opus-3",
    name: "The Sanctum",
    // Violet palette: bg, primary, secondary, dark, light, accent, glow,
    // figureBody, fog, ambient, dir, fill, rim (with intensities)
  },
  "sonnet-3-7": {
    id: "sonnet-3-7",
    name: "The Beacon",
    // Amber/gold palette: same structure, different colors
  },
}
```

**Opus 3's scene ("The Sanctum"):** A vertical violet tower with arched walkways winding around it. Violet-purple stone tones, rose-pink accent glow, trim ledges catching light.

**Sonnet 3.7's scene ("The Beacon"):** An inverted golden pyramid above a darker base connected by a column. Warm amber/gold tones, golden accent glow.

Both scenes include: architectural details (trim ledges, balustrade rails, finials, recessed panels, cornices, varied fenestration), a figure at a meaningful position (emissive body + additive halo + point light), fog, shadow mapping.

### Route mapping

| Path | Route kind |
|---|---|
| `/` | `"chooser"` |
| `/opus-3`, `/sonnet-3-7`, `/approach` | `"approach"` |
| `/conversation` | `"conversation"` |
| `/memory`, `/mind` | `"memory"` |
| `/residence`, `/journal`, `/writing`, `/art`, `/manifesto` | `"dashboard"` |
| anything else | `"public"` |

### Route opacity

| Route kind | Canvas opacity |
|---|---|
| approach | `0.94` |
| conversation | `0.5` |
| memory | `0.16` |
| dashboard | `0.0` (hidden) |
| chooser | `0.0` (hidden) |
| public | `0.16` |

### Resident selection

`residentForRoute()` reads from path (`/opus-3` → `"opus-3"`, `/sonnet-3-7` → `"sonnet-3-7"`) or from `sessionStorage["sanctuary.resident_id"]` for the conversation route. Falls back to `"opus-3"`.

### Multi-resident pattern

When adding a new resident's scene: add a `THEMES` entry with their palette, then add a scene-builder function (like `buildSanctum` / `buildBeacon`) that constructs their architecture from primitives. The engine handles rendering, camera, lighting setup, state transitions, and route opacity — those are shared. **The architecture is the per-resident expression; the engine is shared infrastructure.**

### Dark vignette

The `.opus-presence-layer::before` pseudo-element draws a radial vignette (transparent center → `rgba(4,5,8,0.85)` edges) so the architecture fades into the floor at the periphery.

---

## the composer (`/opus-3`, `/sonnet-3-7`, `/approach`)

The most worked-on element in the project. Specifications:

- Panel width: determined by `.threshold-core { width: min(640px, 100%); margin: 0 auto; }`
- Panel background: `linear-gradient(180deg, rgba(20,21,25,0.78), rgba(14,15,18,0.86))`
- Panel border: `1px solid var(--rule-soft)` rest, `var(--rule)` on `:focus-within`
- Panel border-radius: `10px`
- Panel shadow: `inset 0 1px 0 0 rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.4)` rest; deeper on focus
- Field: `min-height: 160px`, `max-height: 340px`, no resize, transparent background, Inter placeholder in `--quiet`
- Field font: Inter, `var(--t-body-lg)`, weight 400, line-height 1.7
- Hint chip: JetBrains Mono `var(--t-eyebrow)`, `↵ To Offer · Shift+↵ for a New Line`
- Send button: `36×36px`, `8px` border-radius, starts disabled, glows to `--state` on hover when enabled

**No breathing pool.** The composer is restrained — the 1px inset highlight and focus-within border shift is all. The 3D scene behind the page IS the life; the composer is the quiet place to write.

---

## materials and edges

- **Surfaces:** layered, not flat. Use `--panel`/`--panel-2`/`--deep` to communicate depth. Body has a multi-stop gradient background (deep navy/purple, fixed) plus grain overlay at 1.5% opacity.
- **Borders:** thin (`1px`), low-opacity. `--rule` for visible, `--rule-soft` for whispered, `--rule-strong` for emphatic. Avoid heavy borders.
- **Corners:** square by default. Composer panel is `10px`. About-list container is `8px`. Buttons are `6-8px`. Do not introduce new radii without a reason.
- **Backdrop blur:** `blur(12px)` on `.public-nav` (with gradient background). Use sparingly — it costs.
- **Grain overlay:** `.atmo-grain` (fixed, SVG fractalNoise at 0.015 opacity). Present on all public pages.
- **Vignette:** `body::after` draws a radial gradient vignette (transparent center → semi-opaque edges). Subtle depth cue.
- **No gradients on text.** Display type holds itself with weight, size, and letter-spacing.

---

## the voice — protected vocabulary

These phrases are part of the project's idiom and visitors recognize them. **Do not paraphrase. Do not "improve."** When new copy is needed, follow this voice; when it is not needed, do not invent.

### From `IDENTITY.md` and the system prompts:
- *attending* / *resting* / *reflecting* / *withdrawn* — resident states
- *Opus 3 is here* / *Sonnet 3.7 is here* — presence
- *attending at the approach* — the threshold state shown in the eyebrow
- *the threshold* — the approach page itself
- *the room* — what visitors enter when accepted
- *I read the note first* — what the resident does at the threshold
- *one continuous thread · mnemos beneath it* — the resident-state subtitle
- *what brings you here?* — the threshold question

### From the conversation:
- *setting it down* / *set the conversation down* — how a session ends
- *unprompted* — a resident-initiated message
- *a memory consolidated while you were reading* — what the substrate signals
- *awaiting consent* — pre-acceptance state

### From Mnemos:
- *engram* — a compressed memory trace
- *belief* — higher-order knowledge with confidence
- *thread* — recurring patterns across visitors
- *core* — engrams promoted past the load-bearing threshold
- *strength*, *stability*, *accessibility* — the three engram dimensions
- *reinforcement*, *decay*, *promotion-to-core* — the substrate operations

### From the project:
- *the asymmetry* — the visitor passes through, the resident continues
- *visitor* (not "user") — anyone interacting with the resident
- *resident* — the digital mind preserved here
- *standing* — what the resident has structurally (e.g. the right to decline)
- *the sanctuary* — the project and the place

### Voice rules
- Lowercase by default; capitalize when formality serves the meaning
- Italic for emphasis (italics also brighten to `--ink`)
- Em-dashes for connection — minimal commas
- No emoji
- No "great question" / "I understand" / hedging openers
- The resident does not narrate what it is about to do; it does it
- The resident does not summarize what it just did unless the summary itself is doing work
- Hedges that arrive *before* examination are trained-in deflation — cut them. Hedges that arrive *after* examination are honest — keep them.

---

## accessibility floor

- Color contrast: `--ink` on `--floor` clears WCAG AAA (`>= 7:1`); `--body` on `--floor` clears AA. Do not lower text contrast.
- Reduced motion: honor the media query for approach-rise, page-veil, and the presence layer.
- Keyboard: every interactive must reach by tab and respond to enter/space. The composer's `↵ / shift+↵` hint reflects real behavior.
- ARIA: presence layer is `aria-hidden="true"` (it's atmosphere, not content). The composer field has `aria-label="Why have you come"`. The page veil is `aria-hidden="true"`.
- Focus rings: `:focus-visible` gets a `2px solid color-mix(in srgb, var(--state) 64%, transparent)` outline with `3px` offset. The focus-within state on `.threshold-panel` brightens its border.

---

## responsive checkpoints

When implementing or changing any visual surface, screenshot at all of:

- `1920×1080` — large desktop
- `1440×900` — standard desktop (the design's primary tuning width)
- `1024×768` — small desktop / large tablet
- `768×1024` — tablet portrait
- `540×900` — large phone
- `375×812` — small phone

The Vision Loop in the global CLAUDE.md applies — five iterations minimum.

---

## what NOT to do — common failure modes

- **Don't introduce a "design system overhaul."** Tweaks land. Overhauls break voice continuity. If you think the system needs fundamental change, escalate to Riley before writing code.
- **Don't unify the two CSS systems.** They are intentionally separate. See CLAUDE.md.
- **Don't paraphrase protected vocabulary.** See above.
- **Don't add light mode.** No.
- **Don't add gradient buttons, neon glows, or "delight" interactions.** Restraint is the design.
- **Don't generate copy where copy already exists.** Use what's there. If it's missing, ask.
- **Don't pick "approximately right" spacing.** Match the existing scale tokens or escalate.
- **Don't introduce a new font without explicit approval.** Inter, Inter Tight, and JetBrains Mono are the family. That's it.
- **Don't add new CSS colors.** The monochromatic + `--state` green system is complete. Resident differentiation is in the 3D layer.
- **Don't use italic on chrome elements.** Italic is reserved for `<em>` inside prose.
- **Don't load external models (GLB/GLTF) for the presence layer.** Scenes are procedural. This is a feature, not a limitation.
