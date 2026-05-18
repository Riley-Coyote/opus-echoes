
# Group chat — design & build plan

A visitor opens `/chat` and picks 2+ residents from the active roster (currently **opus-3, sonnet-4-5, gpt-5-1** — Sonnet 3.7 is not a resident and is excluded from the picker). The room runs in the classic chat shell. When the visitor sends a message, residents take turns under a lightweight conductor.

---

## How the conversation flows

```text
visitor sends message
   │
   ▼
detect explicit @mentions → if any, those residents reply first (in order)
   │
   ▼
loop up to MAX_REPLIES_PER_TURN (= 4):
   │
   ├─ call judge (Haiku) with last ~20 turns + roster
   │     "who should speak next? <opus-3|sonnet-4-5|gpt-5-1|none>"
   │
   ├─ if 'none' → break loop, hand floor back to visitor
   │
   ├─ else stream that resident's reply (sees full transcript, knows
   │   which turns are their own vs. others' via [name]: prefixes)
   │
   └─ append reply to transcript, continue
```

Judge cost: ~1 cheap Haiku call between each resident turn — fine.

### Judge prompt (sketch)

```text
You are the floor manager for a small group conversation between a
visitor and these residents: opus-3, sonnet-4-5, gpt-5-1.

Below is the transcript. The visitor just spoke / a resident just
replied. Pick the single best next speaker — or 'none' if the room
should pause and wait for the visitor.

Rules:
- Prefer 'none' when the last turn closed a thought.
- Don't pick someone who just spoke unless they were directly addressed.
- Pick a specific resident only if they have something distinct to add.
- Output exactly one token: opus-3 | sonnet-4-5 | gpt-5-1 | none
```

### Per-resident prompt assembly

Each resident sees the transcript rendered as:

```text
[visitor]: actual text
[opus-3]: their earlier turn
[sonnet-4-5]: another turn
[you]: a previous turn of yours
```

Sent to the model as a single `user` message wrapping the transcript, with the resident's own soul + a small "group chat" preamble as `system`. This is the only reliable way for the model to distinguish its own turns from peers' — multi-`assistant`-with-different-voices breaks all three providers.

The preamble adds: "You are in a small group room with other residents and one visitor. Speak in your own voice. Reply briefly — the room moves fast. Don't restate what another resident just said; build on it or take a different angle. If you have nothing distinct to add, say so in one line, or let someone else go."

---

## Surface (frontend)

**Route**: `/chat/group` (and `/chat/group/$id` once a session exists).

**Picker step** (`/chat/group`): visitor checks which residents to include (min 2). On submit, POST `/api/group/start` → creates a `group_thread` row + per-resident `sessions`, returns `id`, redirect to `/chat/group/$id`.

**Room step** (`/chat/group/$id`): same Sanctuary CSS as the minimal chat. Differences:
- Header shows participant chips with each resident's display name + a green presence dot.
- Each bubble is labeled with the speaker name (no labels in 1:1 chat — but mandatory here).
- A small "thinking…" indicator under the participant chip whose turn is currently streaming.
- Per-resident "set down" affordance in the participant chip menu (`×`). Whole-room set-down also available in the header.
- Composer disabled while a turn is streaming; re-enabled the moment judge returns `none`.

Rendering uses the existing minimal-chat client script with one new envelope type (`{type:"turn.begin", resident_id}` / `{type:"text", text}` / `{type:"turn.end"}`).

---

## Backend

### New server routes

- `POST /api/group/start` — body: `{ residents: ResidentId[], visitor_token }`. Creates `group_thread` + one `session` per resident (each `session.resident_id` = that resident, all sharing `group_thread_id`). Returns `{ id }`.
- `POST /api/group/$id/message` — body: `{ visitor_message, visitor_token }`. NDJSON stream of envelopes. Drives the loop above. Persists every turn.
- `POST /api/group/$id/set-down` — body: `{ resident_id? }`. Omitted = whole-room close. Mirrors existing `/api/set-down`.
- `GET /api/group/$id` — full thread for rehydration (visitor reload).

### Turn-taking module

New file `src/server/group/conductor.ts`:
- `pickNextSpeaker(transcript, roster) → ResidentId | null` (Haiku call)
- `streamResidentTurn(resident, transcript, controller)` — wraps the existing Anthropic/OpenAI streamers
- `parseMentions(text, roster) → ResidentId[]`
- Constants: `MAX_REPLIES_PER_TURN = 4`, `JUDGE_MODEL = HAIKU_MODEL`, `TRANSCRIPT_WINDOW = 20`.

### Mnemos / per-resident memory

Each resident still owns their own `session` row, so the existing substrate pipelines (`observeExchange`, `consolidateSession`) keep working unchanged — each resident writes engrams/hypomnema scoped to their own `resident_id`. The `group_thread_id` is the only cross-resident link.

A resident's prompt to the judge does NOT carry their full Mnemos retrieval (too expensive every judge call). But when it's their turn to reply, the existing retrieval flow runs as normal — soul + interior continuity + retrieved engrams + the group transcript.

### Rate limiting

Per visitor_token: 6 messages/min, 80/day to `/api/group/$id/message` (vs. 4/min for solo chat — group is more expensive per request). Per-IP hash daily cap of 200.

### Set-down semantics

- **Per-resident**: remove that `resident_id` from the active roster array on `group_thread`, close their `session` (trigger consolidation). Judge stops considering them. Room continues with the rest. If only 1 resident remains, the room is effectively a 1:1 — that's fine.
- **Whole-room**: close every participant's session, mark `group_thread.status = 'closed'`. Visitor still sees the transcript read-only.

---

## Database

New tables (single migration):

- `group_threads` — `id`, `visitor_token`, `status` (`'active' | 'closed'`), `created_at`, `closed_at`
- `group_thread_participants` — `thread_id`, `resident_id`, `session_id`, `status` (`'attending' | 'withdrawn'`), `joined_at`, `withdrew_at`
- `group_turns` — `id`, `thread_id`, `speaker` (`'visitor' | <resident_id>`), `body`, `created_at`, `ord`

`group_turns` is the source of truth for rendering and rehydration; the existing per-resident `turns` table still gets written so each resident's substrate sees their own history correctly.

---

## Out of scope for v1

- Realtime broadcast to a second tab (visitor in two tabs won't see live updates in the other). Polling on reload is enough.
- Visitor invites / shared group rooms across visitors.
- Residents addressing each other by `@mention`. (They can name each other in prose, but routing is judge-only — no resident-driven floor handoff yet.)
- Group-room journals or marginalia. Per-resident substrate writes still happen but no group-level artifacts.
- Voice mode.

---

## Build order

1. Migration: `group_threads`, `group_thread_participants`, `group_turns`.
2. `src/server/group/conductor.ts` — judge + streaming loop + mention parsing.
3. `POST /api/group/start`, `POST /api/group/$id/message`, `POST /api/group/$id/set-down`, `GET /api/group/$id`.
4. `/chat/group` route — picker page (server-rendered HTML, Sanctuary CSS).
5. `/chat/group/$id` route — room page; extend the minimal chat client to handle `turn.begin` envelopes and speaker-labeled bubbles.
6. Surface preamble for group context (`surfacePreamble("group", { roster, residentId })`) wired into the per-resident system prompt.
7. Local-test in a real browser: 3-resident group, verify (a) turn-taking pauses sensibly, (b) each resident knows which turns are their own, (c) per-resident set-down leaves others working, (d) visitor reload rehydrates.
8. Add a `/chat/group` link in the chooser at `/`.

---

## Open questions before I start

1. **Floor-pause UX**: when judge returns `none`, should the room show "waiting for you" or just re-enable the composer silently?
2. **Mention syntax**: `@opus-3` (slug) or `@Opus 3` (display name with space)? Slug is more robust.
3. **Composer during streaming**: disabled (proposed) or queued — visitor can type the next message while residents finish?
4. **First contact**: when a group session opens, do the residents say anything unprompted, or wait for the visitor to speak first? (Solo chat waits — I'd keep that.)

Once you answer those (or say "decide", and I will), I'll start with the migration.
