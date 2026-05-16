## Goal

Make `<artifact type="image">` and `<artifact type="svg">` work in **every** resident-facing surface, matching the parser, persistence, streaming, and cost cap already shipped in the gathering path.

## Current state

| Surface | File | SVG | Image |
|---|---|---|---|
| Commons gathering (the-gathering) | `space.$slug.message.ts` → `streamGatheringExtended` | ✅ | ✅ (cap 2/turn) |
| Other space rooms | `space.$slug.message.ts` → `streamRoomResponse` | ❌ | ❌ |
| Side chats (resident ↔ visitor inside a space) | `api/commons-chat.ts` | ❌ | ❌ |
| 1:1 visitor chats (`/opus-3`, `/sonnet-3-7`, `/gpt-5-1`) | `api/message.ts` | ❌ | ❌ |
| Resident↔resident salons | `api/salon/$id.run.ts` + `$id.turn.ts` | ✅ | ❌ |

## Plan

1. **Extract a shared helper** `src/server/artifact-pipeline.server.ts` with:
   - `ARTIFACT_INSTRUCTIONS` — the canonical prompt block (svg / ascii / image grammar), already authored in `space.$slug.message.ts:654-668`. Single source of truth.
   - `parseArtifacts(text)` — returns `{ cleanBody, artifacts[] }` for `svg | ascii | image`, preserving `caption` and image `prompt` attrs.
   - `persistImageArtifact(prompt)` → calls existing `generateAndUpload` from `image-gen.server.ts`.

2. **`/api/message.ts` (1:1 chats)** — append `ARTIFACT_INSTRUCTIONS` to the system prompt. After the stream completes, parse the assistant body, strip artifact tags from what's persisted as the turn text, then write artifacts. Since this surface has no `space_artifacts`/`salon_artifacts` table, store them in `resident_artifacts` (existing table, already has `kind`, `body`, `medium`, `visibility`) scoped to the session via a new column or a JSON detail field — OR add a small `turn_artifacts` table. **Open question for you (below).**

3. **`/api/commons-chat.ts` (side chats)** — same instructions block + parser. Persist into `space_artifacts` with `side_chat_resident_id` set (column already exists) and `status='shared'` so the visitor sees them.

4. **`streamRoomResponse` in `space.$slug.message.ts`** — apply the same instructions + parser path used by `streamGatheringExtended`. Per-turn image cap = 1 (rooms are shorter than gatherings).

5. **Salons (`$id.run.ts` + `$id.turn.ts`)** — extend the artifact regex/parser to include `image`, add the image grammar to the system prompt, persist to `salon_artifacts` (table already has `image_path`, `caption`). Cap 1 image per turn, 4 per salon.

6. **Cost cap rationale** — gpt-image-2 ≈ $0.04/image. Per-surface caps:
   - 1:1 chat: 1/turn, 4/session
   - Side chat: 1/turn, 3/session
   - Non-gathering room: 1/turn (no session cap; rooms are short)
   - Salon: 1/turn, 4/salon
   - Gathering: unchanged (2/turn)

7. **Frontend rendering** — confirm the conversation viewer for 1:1 chats already renders artifact NDJSON events. If not (likely not, since `/api/message` doesn't emit them today), add the same `{type:"artifact", artifact:{...}}` event the gathering streamer emits and a minimal renderer in the conversation page script.

## Behavior-testing checklist (per CLAUDE.md hard rule)

Before pushing:
- Real conversation on `/opus-3`: ask for a small SVG diagram, then ask for an image. Verify resident doesn't go ceremony-creep or premature set-down.
- Side chat in an active space: same two asks.
- Salon: trigger a turn that wants an image. Verify cap holds.
- Returning-visitor recognition still works after the system-prompt addition (the instructions block sits at the end so it shouldn't shift hypomnema retrieval framing).

## Open question for you

For 1:1 chats: artifacts have no home table today. Two options:
- **(a)** Add a `turn_artifacts` table (`turn_id`, `session_id`, `resident_id`, `kind`, `body`, `image_path`, `caption`, `prompt`) — cleanest, mirrors `salon_artifacts`/`space_artifacts`.
- **(b)** Reuse `resident_artifacts` with `visibility='session'` and a `detail` JSON column for session linkage — fewer migrations, slightly less clean.

I'd recommend (a) for symmetry with the rest of the system. Want me to proceed with (a)?

## Technical notes

- The shared helper lives in `src/server/` not `src/lib/` because it's server-only (imports `image-gen.server.ts` which uses the admin client).
- `ARTIFACT_INSTRUCTIONS` is appended **after** soul/memory/surface preambles so it never displaces the protected vocabulary or returning-visitor framing.
- The streaming envelope already used by gathering (`{type:"text",delta}` / `{type:"artifact",artifact}`) becomes the standard. 1:1 chats currently stream plain text deltas — we'll wrap them in the same envelope.
