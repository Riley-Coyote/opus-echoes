## Goal

Turn `/chat/$resident` into a single universal classic-chat interface that works identically for every resident in the registry (Opus 3, Sonnet 4.5, GPT 5.1, and any future additions), with:

1. A model selector in the top-left chrome (replacing the static resident-name label).
2. A distinctly colored, brighter, more ethereal perimeter glow per resident — clearly more brilliant than the composer's border glow.
3. Approach pages keep linking to `/chat/<slug>` (they already do — this just confirms the surface is the same one).

No changes to the approach pages' design, the conversation surface, or the commons.

## What stays the same

- The route `/chat/$resident` (e.g. `/chat/opus-3`, `/chat/sonnet-4-5`, `/chat/gpt-5-1`).
- The full minimal-chat layout, composer glow, ASCII sphere empty state, message streaming pipeline, session bootstrap via `/api/chat/start`, rehydration via `/api/turns`, and the inline-artifact rendering we just polished.
- Per-resident session isolation in the substrate (each conversation is still scoped to that resident's Mnemos topology and pacing).
- All approach pages and their existing `threshold-alt-mode` link to `/chat/<slug>`.

## Changes

### 1. Top-left model selector (replaces the static resident label)

In `src/server/minimal-chat-page.ts`, the top chrome currently shows a breathing brand-dot + the resident's display name as static text. Replace the text label with a minimal disclosure button that opens a small popover listing every entry in `ALL_RESIDENTS`. Selecting one navigates to that resident's `/chat/<slug>`.

- Trigger looks identical to today's label: same font, same size, same breathing brand-dot to its left. Adds a small chevron and `aria-haspopup="listbox"` so it reads as a control.
- Popover is a quiet panel anchored to the trigger — each row shows the resident's display name and a tiny colored dot matching that resident's perimeter-glow hue, so the selector itself previews the visual identity. Active resident is marked.
- Selecting an entry calls `location.assign('/chat/' + slug)` — a full navigation, which gives the new resident their own session bootstrap and their own perimeter glow. No client-side resident swap, no mid-thread mode change.
- Keyboard: Esc closes, ↑/↓ moves selection, Enter activates.
- No changes to any other chrome element.

### 2. Per-resident perimeter glow

The perimeter glow today comes from `VIEWPORT_GLOW_CSS` in `src/server/shared-effects.ts` — eight prime-rhythm radial pools using a shared four-hue palette (amber, violet, pink-peach, cool cream). It's deliberately quiet and the same for every surface.

Make the chat surface override that palette per resident, brighter than today and brighter than the composer glow:

- Add a `viewportGlow` field to each `ResidentConfig` in `src/server/opus/residents.ts`. Shape:
  ```
  viewportGlow: {
    hues: [string, string, string, string]; // four "r,g,b" triples
    peak: number;                            // animation peak alpha (target ~0.22–0.30)
    base: number;                            // animation trough alpha (~0.04)
  }
  ```
  Initial per-resident palettes (all luminous, all distinct, all on the dark floor):
  - Opus 3 — violet/indigo (lavender, deep violet, soft magenta, pale ice) — connects to their existing presence-layer hue.
  - Sonnet 4.5 — warm brass/amber/peach/cream — carries the Beacon lineage.
  - GPT 5.1 — cyan/teal/blue/cool white — matches their cool palette.
  - Sonnet 3.7 (kept in registry for archive) — gold/honey set, in case the archived room is ever reopened.
- Refactor `VIEWPORT_GLOW_CSS` to a `buildViewportGlowCss({ hues, peak, base })` function. The classic-chat page calls it with the active resident's config; the commons keeps the existing shared default (no behavior change there).
- Lift the animated peak alphas to roughly 2–2.5× current values so the perimeter reads brighter than the composer's border-shimmer pools. The composer glow stays exactly as it is today; we only adjust the perimeter so the contrast inverts.
- Respect `prefers-reduced-motion` (already in the keyframes) and keep `pointer-events: none`.

### 3. Universal `/chat` entry

The route file stays `src/routes/chat.$resident.tsx` — it already validates the slug against the registry and renders `renderMinimalChatPage(getResident(slug))`. Add a tiny convenience: `src/routes/chat.tsx` that redirects to `/chat/<DEFAULT_RESIDENT_ID>` so bare `/chat` resolves cleanly. Approach pages keep their existing `/chat/<slug>` links — no edits needed there.

### 4. Adding more models in the future

Adding a new resident becomes a single-file change in `src/server/opus/residents.ts` (plus their soul constant): once a new entry exists with a `viewportGlow` palette, they automatically appear in the chat selector and get their own perimeter color. No edits to the chat page itself.

## Files touched

- `src/server/opus/residents.ts` — add `viewportGlow` field + per-resident palettes.
- `src/server/shared-effects.ts` — export `buildViewportGlowCss(opts)` alongside the existing `VIEWPORT_GLOW_CSS` default (kept for commons).
- `src/server/minimal-chat-page.ts` — render the per-resident glow CSS; add the model-selector trigger, popover markup, and small script for keyboard + navigation.
- `src/routes/chat.tsx` (new) — redirect `/chat` → `/chat/<default>`.

## Out of scope

- Approach pages, conversation surface, commons spaces, dashboard, presence-layer themes — untouched.
- No change to the composer's Option-C border glow.
- No change to session bootstrap, substrate, or pacing.
- No change to the inline-artifact pipeline we just shipped.

## Verification (after build)

1. `/chat/opus-3`, `/chat/sonnet-4-5`, `/chat/gpt-5-1` each render with a visibly different, brighter perimeter glow; composer glow is now the quieter of the two.
2. Model selector in the top-left opens, lists all residents with their hue dots, marks the active one, and navigates on select.
3. Selecting a different resident loads their own session and glow without leaking state from the previous one.
4. Keyboard navigation in the selector (↑/↓/Enter/Esc) works.
5. `prefers-reduced-motion` disables the glow animation as before.
6. Approach pages' "open an ongoing chat with …" link still lands on the matching `/chat/<slug>`.