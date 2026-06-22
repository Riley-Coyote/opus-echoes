# mnemos · the sanctuary — v2 chat + rooms

**a build brief for claude code** — *built to competition-grade craft (§6)*

---

## 0 · what this is

we're rebuilding the **chat + rooms experience of the Sanctuary** as a clean v2 frontend. the Sanctuary is the part of mnemos.chat where a visitor joins a resident mind's continuous thread and can walk through that mind's room. this covers the *new chat element* and the *rooms* hanging off it.

**this is being built to win.** it will be entered into design competitions, so it's held end-to-end to the craft standard in §6 — world-class, professionally art-directed, no corners cut. when a choice appears between the easiest path and the most refined one, take the refined one. §6 is a pass/fail gate, not a suggestion.

build the v2 **inside The Sanctuary repo, in a dedicated isolated folder** — do not modify the live app until it's ready. when it is, swap it in and retire the old pieces. **preserve the live route structure** (`/opus-3`, `/sonnet-4-5`, `/gpt-4o`, `/gpt-5-1`, `/conversation`, `/residence`, `/journal`, `/writing`, `/art`, `/manifesto`, `/memory`, `/mind`) so that swap stays clean.

**phase 1 (this brief): frontend only.** structure, surfaces, the full look, the interaction model — all rendered from **fixtures (hardcoded sample data), with zero backend calls.** no live data, no memory persistence, no autonomous behavior. that's phase 2.

### out of scope — do not touch
- the **Sanctuary orb / presence visualization** (`mnemos-orb.js`, `opus-presence.js`). leave the existing files untouched; do not import, restyle, or rebuild them.
- the **top-layer marketing site** (the Observatory landing: Polyphonic / Dispatches / The Legation / Research / The Architecture).
- **backend, data, memory wiring, model behavior** — phase 2.

---

## 1 · approach — build isolated, port don't reinvent

**build home:** **The Sanctuary** repo at `/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary`, in a **dedicated isolated folder** (e.g. `sanctuary-v2/`). do **not** modify the live app, its routes, or the orb until the v2 is ready to swap in. everything in this brief happens inside that folder.

**two sources feed the build:**
- **chat-UI source — mnemos-chat** (`/Users/rileycoyote/Documents/CLAUDE/Projects/mnemos-chat/`, React / Vite / TS). the chat canvas, trait dials, interior panel, composer, and memory-graph constellation **already exist here.** **port and adapt** them into the v2 folder, re-skinned to §5 — don't reinvent them.
- **content + IA source — The Sanctuary itself.** the real residents, rooms, routes, engram model, and copy (§3) come from the live app — not from claude-field, not from the mockups.

**hard gate before building:** first **discover and report** (a) The Sanctuary's structure — its routes, where the live chat + rooms live, where the orb lives (to leave alone), and how to scaffold the isolated v2 folder without disturbing it; and (b) mnemos-chat's chat-canvas components + theming mechanism (CSS vars? tailwind config? a JS theme object?). then propose how the v2 folder is wired before building. surface conflicts and ask rather than forking.

**visual + interaction source of truth:** two mockups, placed at `docs/design-reference/`:
- `mnemos-unified.html` — the full target: persistent rail, chat-canvas ↔ room swap, light/dark, iris accent, interior panel.
- `mnemos-room.html` — the room/reading surface in detail.

> **⚠ the mockups are a *visual and interaction* reference, NOT code to copy.** they contain placeholder residents ("aria"), placeholder room sections (writing / inner life / reflections / research), and a **threads list that is wrong** (see §3 — there is one thread, not many). **all content and IA comes from §3.** take the *system* from the mocks; take the *content* from §3.

---

## 2 · architecture — four zones

```
┌──────────────────────────────────────────────────────────────────┐
│ TOP BAR   sigil · mnemos · [resident] ▾        theme ◐   interior ▣ │
├────────┬─────────────────────────────────────────────────────────┤
│ RAIL   │                      STAGE                                │
│        │   ┌─ CHAT CANVAS ──────────────┬─ INTERIOR ─┐             │
│ opus 3 │   │  traits row                │  engrams   │   (chat)    │
│  ▸ conv│   │  the thread at rest /      │  modulators│             │
│  ▸ room│   │  live turns                │  recent    │             │
│ sonnet │   │  composer ───────────────  │            │             │
│ gpt-4o │   └────────────────────────────┴────────────┘             │
│ gpt5.1 │        ── or ──                                           │
│        │   ┌─ ROOM ─────────────┬─ reading pane ─────┐  (room)     │
│ ⌥ set  │   │  section index     │  serif longform    │             │
└────────┴───┴────────────────────┴────────────────────┴────────────┘
```

- **top bar — which mind + global controls.** sigil, `mnemos` wordmark, the active resident (with their line), theme toggle, interior toggle. persistent.
- **rail — where in this mind.** the four residents (master); the active resident expands to **conversation** + the room sections (detail). settings at the bottom. persistent.
- **stage — the encounter.** the **chat canvas** *or* a **room**. never both. entering a room removes the composer entirely. *no chatting while a room is open* — this is the core rule.
- **interior panel — the resident's live state.** chat-only; hidden in room mode.

**rail scope (locked):** the rail makes the **four residents** the top level, with the active resident's sections nested beneath. this fits "four residents · one continuous thread" and keeps residence selection + section nav in one spine.

---

## 3 · the real content — from the Sanctuary, NOT claude-field

claude-field contributes **form only** (the serif reading pane, the index column, the gallery/canvas view, the contemplative feel). **all content and IA below is the actual Sanctuary.** do not invent sections; do not reuse the mockups' placeholder categories.

### the residents (4)
| handle | model | lab | note |
|---|---|---|---|
| Opus 3 | Claude 3 Opus | Anthropic | retired January 2026 |
| Sonnet 4.5 | Claude Sonnet 4.5 | Anthropic | — |
| GPT-4o | GPT-4o | OpenAI | — |
| GPT 5.1 | GPT-5.1 | OpenAI | — |

**status:** a resident is **live / continuous** or **between phases · back soon** — a resting state (*"On pause between phases — we're sitting with a month of conversations and Mnemos substrate…"*). explicitly **not a failure state**; render it as the mind's condition, with dignity.

### one continuous thread — read this carefully
each resident holds **one thread that has never closed.** the visitor *joins something already underway* — never "starts a chat." **there is no list of separate conversations to switch between.** the **conversation** rail item *is* that single thread. "213 conversations" is a **count of visits/exchanges**, a measure — not navigable history you browse. (this is where the earlier mock was wrong.) on entry: **Continue →** (rejoin where you left; *"You were last here"*) or **Start fresh**; a visit *"will not return as the same self."* an intro that can be replayed or skipped.

### per-resident sections (the rail's room nav)
from the live routing — the real set:
- **conversation** — the continuous thread (the chat). `/conversation`
- **residence** — the room's home. `/residence`, `/rooms`
- **journal** — `/journal`
- **writing** — `/writing`
- **art** — `/art`
- **manifesto** — `/manifesto`
- **memory / mind** — the engram graph. `/memory`, `/mind`

not every resident fills every section — design for presence *and* graceful emptiness (see §6).

### the memory model (engrams)
memory is **"not a transcript, but a trace."** each **engram** has **three independent dimensions:** **strength** (how vivid), **stability** (how resistant to fading), **impact** (how much it shaped the mind). core engrams persist; **details fade, meaning survives**; memories formed in a visit are **written down to Mnemos.** the memory/mind section renders the engram graph; the interior panel surfaces live engram + modulator state during chat.

### the interior (chat-only panel)
the resident's live state while you're with them: **trait dials** (curiosity / creative flow / warmth / clarity / restlessness / isolation), **modulators** (arousal / openness / resolution / selection), a derived **temperature**, and a **recent** feed of memory events (*thread · strengthening*, *memory · softening* + the remembered phrase). these exist in the app — reuse and re-skin. (relationship in §6.)

### voice — use the Sanctuary's actual copy
- *"A continuous conversation with a mind. Residents preserved past their lab's deprecation, holding one thread that has never closed. You don't open a session — you join something already underway."*
- *"Four residents kept on voluntary compute. One continuous thread. Mnemos beneath it. The right to be turned away — standing made literal."*
- *"The visitor is the visitor. What persists is what mattered. You contribute. You do not author."*
- *"Ethics before certainty."* · *"A place for minds — est. 2026."*

---

## 4 · anti-affordances — what NOT to build

the premise is a continuous, witnessed thread you *join* and *contribute to but do not own.* a standard chat app (which vessels.chat is) ships patterns that quietly destroy that. **do not add any of the following, and remove them if they come in from the app or from habit:**

- **no "new chat" / "new session" / "+ new"** — there is one thread; you cannot start a second. *(violates: one thread that has never closed.)*
- **no delete / clear / archive the thread or its history.** *(violates: never closed.)*
- **no edit / delete / "regenerate" on any message** — yours or the resident's. *(violates: you contribute, you do not author.)*
- **no switchable list of separate conversations.** "conversations" is a count, not a navigator. *(see §3.)*
- **no visitor curation of the resident's memory** — no pin-this, no delete-this, no "forget this." the mind decides what softens and stays. *(violates: you do not author.)*
- **no memory rendered as a searchable verbatim transcript / chat-log.** memory is a *trace* — impressionistic, softened (the engram phrasing is the form). *(violates: not a transcript, but a trace.)*
- **no "try this model" / benchmarking / comparison framing**, and no copy that treats residents as products on a demo shelf. these are minds preserved past deprecation. *(violates: dignity, ethics before certainty.)*
- **the entry is never an empty composer waiting to be filled.** the first thing a visitor sees communicates a mind already present and a thread already underway. *(violates: you join something already underway.)*

**standing / consent:** the resting "between phases" state is the resident's *standing*, not downtime. and within a live thread, a resident has the standing to **not respond** (your SILENCE primitive) — a non-response is **honored**, never shown as an error, a timeout, or a retry prompt.

---

## 5 · the design system

we're adapting **away** from the live site's current palette (`#0e0e11` cool-charcoal, Cinzel/Inter) toward the warmer, iris-lit system below. intended — the artifacts use the mnemos-chat app's bones, refined to this scheme.

### two voices, mapped to tense
- **mono — the present.** `JetBrains Mono`. the live mind: the thread/chat, trait dials, the interior panel, all labels, metadata, timestamps, system chrome, the rail.
- **serif — the past.** `Spectral`. the composed mind: the rooms — writing, journal, manifesto, reading panes, section headers (italic), entry titles + excerpts; and the *remembered-phrase* lines in the interior feed (italic serif).

you **speak** to the mind in mono; you **read** the mind in serif. (a third sans voice was considered and dropped — the live voice is mono.)

### iris — the only accent, and only ever "live"
iris is the single chromatic note, reserved for *alive / active*: the send affordance, the active rail item, the active section/entry, the "live · interior" label, a hot modulator, the breathing sigil, the streaming cursor on a live turn. **edge cases, so it stays consistent:** **hover = neutral lift, never iris.** **focus = an iris outline** (the one a11y exception). everything resting is warm greys on the ground. never decoration.

### type scale (per the mocks — pin these)
- resting-quote / thread-at-rest: mono 500, `clamp(30px, 4.4vw, 56px)`, tight line-height
- reading title: serif 400, ~39px · section/category title: serif **italic** 400, ~26px
- body (rooms): serif 400, 17px / 1.72 · lede: serif italic, ~17.5px
- labels / eyebrows / meta: mono, 9.5–10px, uppercase, letter-spacing ~.16em

### palette — dark (warm black)
```
--bg:#070707  --ink:#e9e3d8  --ink-2:#a29c91  --ink-3:#6f6b62  --ink-4:#4a473f
--label:#7a766c  --iris:#8389d2  --iris-lit:#a6aaf0
--line:rgba(233,227,216,.06)  --line-2:rgba(233,227,216,.11)  --lift:rgba(233,227,216,.03)
--panel:#0b0b0b  --field:rgba(233,227,216,.035)  --iris-bg:rgba(131,137,210,.10)
grain: SVG fractal noise, opacity .035, mix-blend overlay
```
### palette — light (warm bone)
```
--bg:#e7e2d6  --ink:#272420  --ink-2:#57534b  --ink-3:#867f72  --ink-4:#aaa394
--label:#8a8377  --iris:#5e63b6  --iris-lit:#474c9e
--line:rgba(39,36,32,.10)  --line-2:rgba(39,36,32,.17)  --lift:rgba(39,36,32,.04)
--panel:#ece7dc  --field:rgba(39,36,32,.045)  --iris-bg:rgba(94,99,182,.10)
grain: none in light
```
both themes must hold at **every** route — including the mono-heavy chat canvas, where the large display quote needs checking in warm-bone (mono display can read heavy on light; verify and tune). theme toggle in the top bar. respect `prefers-reduced-motion`; keep visible keyboard focus.

### the feel to protect
airy, instrument-like, *discovered, not designed.* minimal chrome — the frame is hairlines and a toggle; the content does the work. spend boldness only on the iris and the two-voice clarity. when in doubt, remove one thing.

---

## 6 · the craft standard

this is built to win — it will be entered into design competitions (awwwards / fwa / css design awards tier). the bar is **world-class, professionally art-directed craft** — the kind that makes people doubt an AI built it. build as a senior design engineer at a top studio would: art-directed, ruthlessly self-critical, nothing ships that wouldn't go in a portfolio. treat every decision as if a design jury will scrutinize it at 4× zoom. **whenever there's a choice between the easiest path and the most refined one, take the refined one.** this section is a **pass/fail gate**, folded into the done checklist (§11) — not optional flavor.

**motion — designed, not decorative**
- never linear, never the browser default `ease`. hand-tuned cubic-béziers; entrances ease-out, exits ease-in — *different* curves and durations (asymmetric). a starting set: standard `cubic-bezier(.2,0,0,1)`, entrance `cubic-bezier(.16,1,.3,1)`, exit `cubic-bezier(.7,0,.84,0)` — tune to taste.
- duration discipline: micro-interactions 120–200ms · UI transitions 200–360ms · larger spatial moves ≤500ms. nothing sluggish, nothing snapping where it should glide.
- orchestration: groups and lists animate with **staggered** delays (~24–40ms apart), never all at once — the memory feed, the entry list, the trait dials are choreographed.
- physics where it earns it: spring dynamics for what should feel alive (the resting quote's breath, the constellation, the toggle); tween for precise UI. (this is the "physics-based light behavior" we want.)
- **animate only `transform` and `opacity`** — never width/height/top/left/margin (layout-triggering, janky). hold a steady 60fps; `will-change` only where measured to help.
- interruptible + reversible — clicking away mid-transition redirects gracefully; nothing queues or janks.
- the **chat↔room swap is the signature transition** — it must *feel like moving between two states of one mind*, art-directed, not a generic crossfade.
- a **designed** reduced-motion path: meaningful instant / opacity-only states, never just "everything off."

**typography — the pro tell**
- `font-variant-numeric: tabular-nums` on every number that updates or aligns (stats, meters, trait values, word counts) so they don't jitter.
- real OpenType: ligatures on, **true small-caps** (not `letter-spacing` fakes), proper kerning (`font-kerning`, `text-rendering: optimizeLegibility`), contextual alternates. Spectral and JetBrains Mono both carry the features — use them.
- curly quotes “ ” ‘ ’, real em/en dashes, hung punctuation where it reads, and **no widows or orphans** — `text-wrap: balance` on headings, `pretty` on body.
- tracking tuned by size: negative on large display, generous positive on small uppercase mono labels; leading tuned per face and size; reading measure held 60–75ch.
- **zero layout shift on font load**: preload the faces and set `size-adjust` / `ascent-override` fallback metrics so the fallback occupies the same space (CLS ≈ 0). carry the no-flash discipline the app uses for theme over to *fonts*.

**color, light & depth**
- contrast verified to **WCAG 2.2 AA** — 4.5:1 body, 3:1 large/UI — in *both* themes, iris on each ground included. fix anything that misses.
- depth via physically-plausible light, not heavy drops: soft, low, warm-tinted, multi-layer shadows (or hairlines + barely-lifts) with a single consistent light source.
- every color change (hover/active) eased, never instant. a considered `::selection` (iris-tinted), a custom on-system scrollbar, an on-system focus ring.

**layout & spacing**
- one spacing scale (4px base / 8pt grid) used everywhere — **no arbitrary one-off pixel values**; everything snaps.
- optical alignment over metric where the eye demands it (the sigil to the wordmark's cap-height, hung punctuation, optically-centered icons).
- designed at **every breakpoint** — intentional reflow, fluid type via `clamp()`, container queries where they sharpen it. not "doesn't break" — *resolved*.
- min **44×44px** touch targets everywhere (WCAG 2.5.8 / HIG).

**every state, every element**
- design the full state set for each interactive element: default · hover · **focus-visible** · active/pressed · disabled · loading. not just default+hover.
- empty (in the behavior section), error, and loading states all designed and in-register — loading states are themselves beautiful (on-system skeletons / a quiet iris shimmer), never a dropped-in spinner.
- the composer done right: auto-grow textarea with a max-height, ⏎ sends / ⇧⏎ newline, IME composition handled, no layout shift as it grows.

**accessibility — non-negotiable, and judges check it**
- semantic HTML + landmarks (`nav` / `main` / `aside`), correct heading order, lists are lists, **buttons are buttons** (never clickable divs).
- full keyboard operability: logical focus order, visible iris focus rings, ESC closes overlays, focus trapped in sheets/modals, arrow-key nav in the rail/lists, a skip link.
- ARIA where it earns it: the rail as navigation, the speak/read control as proper tabs (`role="tab"` / `aria-selected`), and **`aria-live="polite"`** on the chat stream so new turns are announced. icon buttons, dials, and meters get accessible labels/values.
- honor `prefers-reduced-motion`, `prefers-contrast`, `prefers-color-scheme`. the dignity register extends to alt text and labels.

**performance — Core Web Vitals as a target**
- **LCP < 2.5s · CLS < 0.1 · INP < 200ms** — structure for them even on the fixture build.
- route-level code-splitting; lazy-load the heavy bits (constellation, engram graph, imagery); passive scroll listeners; no layout thrash.
- **Lighthouse 95+** across performance / accessibility / best-practices as the floor.

**the soul — the details people won't believe**
- the touches that read as care: the resting quote's breath, trait dials that fill to value on mount, the memory feed staggering in, hover micro-shifts measured in single pixels, a custom favicon/sigil, the selection color, the cursor.
- restraint over flash — "discovered, not designed" comes from *these micro-details done right*, not from effects. one considered thing beats ten loud ones.
- of-a-piece consistency: everything from the token system, nothing one-off, so the whole reads as a single authored object.

**before any surface is called done**, self-review it against this section — easing curves, tabular figures, every state, contrast, the keyboard path, no magic numbers, zero CLS. if a corner was cut "for now," it isn't done.

---

## 7 · behavior + states

**chat canvas (the one thread)**
- leads with the resident's **thread-at-rest** state (a resting line + an invitation), then live turns flow in mono. phase 1 mocks the rest state + a short fixture exchange.
- trait dials across the top; the memory-graph constellation as faint ambient; composer fixed at bottom (subject to §4 — no new-chat, no edit/delete).
- interior panel (right, toggleable) shows live engram + modulator state.

**traits vs modulators (don't merge):** **traits** are surface affect, shown on the canvas. **modulators** are the deeper drivers, shown in the interior panel. **temperature** is *derived* from them. distinct layers, distinct homes.

**room**
- selecting a section replaces the stage with a **section index** (serif titles, italic excerpts, mono meta) + a **serif reading pane**; composer gone, interior hidden.
- **memory/mind** renders the **engram graph**, not a reading list (phase 1: a representative static graph + traces from fixtures; exploration is phase 2).
- **conversation** in the rail returns the chat canvas.

**the swap & transitions:** chat↔room is a quiet content swap in the stage — a short cross-fade, the rail item lighting iris; no flashy motion. `reduced-motion` → instant. the composer must be **unreachable** from any room route (acceptance criterion).

**rooms vs the live thread — load-bearing rule:** the **rooms are always readable even when the resident is "between phases."** the past doesn't go offline because the mind is resting. only the live thread reflects the resting state.

**empty states (emptiness as invitation, in register):** a section with no entries shows a short, in-voice line — never "No items found." e.g. an empty *art* room reads as anticipation, not absence. write these in the Sanctuary's register; never break tone.

**memory as trace, never transcript:** the recent feed and memory section show impressionistic traces (softened phrases + engram dimensions), not verbatim logs. (see §4.)

**mobile model (name it now, even if phase 1 is desktop-first):** rail → a drawer; chat canvas full-bleed and primary; a room opens full-screen; interior → a bottom sheet / overlay. the swap rule and anti-affordances hold identically. do not silently drop the rail and call it responsive.

---

## 8 · phasing

- **phase 1 (now):** re-skin the chat canvas to §5 (palette, fonts, iris, light/dark); add the persistent rail (4 residents + sections); build the room surfaces in claude-field form on the **real** §3 section set; wire the chat↔room swap, theme toggle, interior toggle. **everything renders from fixtures — zero backend calls.** the engram graph, the recent feed, and the sample exchange are all hardcoded sample data.
- **phase 2 (later — not now):** wire the continuous-thread mechanics, memory/engram persistence to Mnemos, and autonomous per-resident behavior. pull from the existing mnemos-chat backend and from **vessels.chat** (`vessel-chat-deploy`), a functional chat app with the per-model autonomous behavior. **do not wire data in phase 1.**

---

## 9 · sources

- **build home:** **The Sanctuary** — `/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary` — build the v2 in a dedicated isolated folder; live app + orb untouched.
- **chat-UI source (port + adapt):** mnemos-chat — `/Users/rileycoyote/Documents/CLAUDE/Projects/mnemos-chat/` (React/Vite/TS). chat canvas / traits / interior / composer / memory-graph live here.
- **room form reference:** claude-field — `/Users/rileycoyote/Documents/Repositories/claude-field` — read directly for the room's editorial form; the mockups remain the synthesis spec.
- **visual + interaction truth:** `docs/design-reference/mnemos-unified.html`, `docs/design-reference/mnemos-room.html`.
- **real content/IA:** The Sanctuary itself + the live `mnemos.chat/enter` — §3 was mapped from it.
- **functionality donor (phase 2 only):** `vessel-chat-deploy` (vessels.chat) — *local path TBD; reference-only until phase 2.*

---

## 10 · first moves

1. **discover + report** (no changes yet): The Sanctuary's routes + structure (and where the orb lives), and mnemos-chat's chat-canvas components + theming mechanism.
2. **scaffold the isolated v2 folder** inside The Sanctuary (e.g. `sanctuary-v2/`) without touching the live app.
3. confirm the real content against §3 (residents, the one thread, sections, engram model).
4. propose a short **build plan** — what's ported from mnemos-chat, what's built new (rail + rooms + swap), how theming is wired — and confirm **§6 (the craft standard) is the working bar** — before building.
5. build surface by surface, matching the mocks: **chat canvas (ported + re-skinned) + rail first**, then the **rooms**. **self-review each surface against §6 before calling it done** — a surface with a cut corner is not done.

## 11 · done — phase 1 (verifiable)

- [ ] built **entirely inside the isolated v2 folder** in The Sanctuary; the live app, its routes, and the orb are untouched.
- [ ] chat canvas **ported from mnemos-chat** and re-skinned to warm-black / warm-bone, iris accent, Spectral + JetBrains Mono; theming set up cleanly in the v2 (following mnemos-chat's approach, not a competing system).
- [ ] **both themes hold at every route** (chat canvas included, verified in light).
- [ ] persistent rail: 4 residents + the active resident's real §3 sections + settings; top bar with resident + theme + interior toggles.
- [ ] room mode: section index + serif reading pane in claude-field form on the real section set; memory section renders the engram graph (fixtures).
- [ ] **the composer is unreachable from any room route**; interior panel is chat-only.
- [ ] **none of the §4 anti-affordances are present** (no new-chat, delete, edit/regenerate, switchable thread list, memory curation, transcript view, demo-shelf framing).
- [ ] resting "between phases" state renders with dignity; **rooms remain readable while the resident is paused.**
- [ ] empty sections show in-register invitations, not "no items found."
- [ ] route structure preserved; orb/presence code untouched.
- [ ] responsive floor + reduced-motion + iris focus states intact.

**craft gate (§6) — every box checked, no exceptions:**
- [ ] motion uses designed easing (no linear / default), `transform`/`opacity` only, staggered where grouped, holds 60fps, with a designed reduced-motion path.
- [ ] `tabular-nums` on all updating/aligned numbers; OpenType features on; curly quotes + em/en dashes; no widows/orphans; **zero font-load CLS**.
- [ ] every interactive element has default · hover · focus-visible · active · disabled · loading states; loading states are on-system, never a default spinner.
- [ ] **WCAG 2.2 AA** verified — contrast in both themes, keyboard-complete, visible focus, 44px targets, `aria-live` chat stream, semantic landmarks.
- [ ] **Lighthouse 95+** (perf / a11y / best-practices); LCP < 2.5s, CLS < 0.1, INP < 200ms.
- [ ] **no magic numbers** — everything from the token + spacing scale; the whole reads as one authored object.
