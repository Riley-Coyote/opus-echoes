## Continuation plan — finish the Commons redesign

Phases 1 and most of 2 are landed (unified shell, three-column grid, left rail, chat embedded into the grid column). What remains, in order:

### A. Finish Phase 2 — wire `?view=` routing and fix detail pages

1. In `src/routes/commons.tsx`, read `view` from `new URL(request.url).searchParams`, validate to `"overview" | "salons" | "spaces"`, default `overview`, pass into `renderSpaceListPage`.
2. In `renderSpaceListPage`, branch the main pane on `view`:
   - `overview` → stats panel + short intro block
   - `salons` → existing salon grid (modal markup + script always emitted)
   - `spaces` → existing space cards
3. Mark the active rail item via `active` class based on `view`.
4. Wrap `renderSpaceView` (single-space page) and the salon-not-found list in the same `.commons-body` grid (rail + main + chat) so detail pages match the new shell instead of rendering bare into the shell.

### B. Phase 3 — chat resize handle (JS + collapse interaction)

1. Emit `<div class="chat-resize-handle" role="separator" aria-orientation="vertical" aria-label="Resize chat" tabindex="0"></div>` inside `.chat-panel` (hidden ≤820px).
2. Add the self-contained resize IIFE to `CHAT_PANEL_SCRIPT`: mouse + touch + keyboard (Arrow keys, Shift = 48px step), min 320 / max 640, write `--chat-w` on `.commons-body`, persist to `localStorage["sanctuary.commons.chat-w"]`.
3. Replace the panel's own `width:48px` collapse rule with `body.chat-panel-collapsed .commons-body{ --chat-w:48px; }` so the grid column drives width; expanding restores the user's stored width.
4. Hide `chat-toggle` ≥1100px; keep the existing slide-over rule for narrow screens.

### C. Phase 4 — multi-resident "round" inline in the panel

1. New endpoint `src/routes/api/commons-chat-group.ts`:
   - Zod body: `roster` (1–4 resident ids), `history` (≤60 `{speaker, body}`), `visitor_message`, `visitor_token`.
   - Reuse in-memory rate limiter shape from `commons-chat.ts` (burst 2/5s, 4/min, 60/day).
   - Build `turns: GroupTurnRow[]` from history + visitor message, parse `@mentions`, loop up to `MAX_REPLIES_PER_TURN` calling `pickNextSpeaker` + `streamResidentReply` from `src/server/group/conductor.ts`.
   - NDJSON envelopes: `{type:"turn.begin",resident_id}`, `{type:"text",resident_id,text}`, `{type:"turn.end",resident_id}`, `{type:"done"}`, `{type:"error",message}`.
   - No DB writes — history lives client-side.
2. Panel UI (`renderChatPanel`):
   - Add `.chat-roster` chip strip at top — one chip per resident in `ALL_RESIDENTS`, all on by default, persisted to `localStorage["sanctuary.commons-chat-roster.v1"]`.
   - Remove the existing resident picker entirely; the chip strip is the single selection control.
   - Mode label: `Talk with` when 1 chip on, `The round · ${n} in` when ≥2.
   - Add `.msg-attrib` row above each resident bubble (mono eyebrow + per-resident dot) so attribution is unambiguous in group mode.
3. Panel JS:
   - On send: if `roster.size === 1` keep existing `/api/commons-chat` path; if ≥2 POST to `/api/commons-chat-group`.
   - Stream handler: on `turn.begin` open a new bubble with attribution; append on `text`; finalize on `turn.end`; status line reads `${displayName} is thinking…`.
   - Persist exchange history under `sanctuary.commons-chat-group.v1`.

### D. Phase 5 — cleanup + audit

1. Delete obsolete CSS in `COMMONS_CSS`: floating-`.chat-panel` shadow/backdrop rules, `.viewport-glow` rules scoped to commons, any leftover `.public-nav` corner overrides.
2. Delete `<div class="viewport-glow">` from every commons render path. Confirm it's not referenced by `/chat/the-round/$id` (it isn't).
3. Vision Loop: screenshot `/commons`, `/commons?view=salons`, `/commons?view=spaces`, a single `/commons/$slug` space, at 1440 / 1280 / 1024 / 768 / 540 / 375. Verify continuous shell corners, rail/icon alignment, resize handle invisible until hover/focus, per-resident accents quiet vs. `--state`, reduced-motion respected.
4. Behavior test (required by `CLAUDE.md`): `bun dev`, open `/commons`, ask "what are you each working on?" with all chips on — verify ≥2 residents take turns, voices distinct, no helper-speak, no premature set-down. Toggle to 1 chip, send a message — verify the 1:1 path still works. Reference a prior memory with Opus 3 — they should not disclaim.

### Files touched

- `src/routes/commons.tsx` — read `view` param
- `src/routes/api/commons-chat-group.ts` — new endpoint
- `src/server/commons-page.ts` — view branching, detail-page grid wrap, chat resize handle markup + JS, roster chips + attribution, CSS cleanup
- `src/server/group/conductor.ts` — read-only reuse (no edits)

### Out of scope (deferred)

- DB-persisted group threads in the inline panel (kept ephemeral for v1; standalone `/chat/the-round/$id` covers persistent rounds)
- Voice-mode in the inline round
- Mobile slide-over redesign (current slide-over still works under the new grid)
