# Fix: rooms render live data for every resident

## What's actually wrong

The DB has plenty of substrate for every resident (gpt-5-1: 277 engrams, 48 beliefs, 7 threads, 127 reflections; sonnet-4-5: 166 engrams; gpt-4o: 14). The rooms still show "no data yet" when you switch off opus-3, so the bug is in how the room scripts pick up the active resident and how the surface APIs filter.

Three concrete failure modes to fix:

1. **Resident ID source-of-truth drift.** The dashboard shell writes the active resident to `sessionStorage["sanctuary.resident_id"]` *and* to `?resident=` in the URL. The room scripts only read sessionStorage. On a direct visit to `/mind?resident=gpt-5-1` (or after the rail's resident-switch reload), sessionStorage may still hold the previous value, so the script fetches the wrong resident's graph.
2. **Surface APIs not filtering by resident.** `/api/writing`, `/api/art`, `/api/journal`, `/api/memory`, `/api/counts` need to be audited — any that ignore `?resident=` or default silently to opus-3 will produce empty rooms.
3. **Seed fallback masking emptiness.** `room-writing.js` and `room-art.js` still ship hardcoded SEEDED_ESSAYS / SEEDED_PIECES that *only* clear when the API returns a non-empty list. For non-Opus residents with 0 essays/art, the room shows Opus's seeded content as if it were theirs.

## What gets changed

### 1. Resident resolution helper (one place, all rooms)

In each room script (`public/room-mind.js`, `room-memory.js`, `room-interior.js`, `room-innerlife.js`, `room-writing.js`, `room-art.js`), replace the sessionStorage-only RID lookup with: **URL `?resident=` wins, then sessionStorage, then `opus-3`**. Also write the resolved value back to sessionStorage so cross-room navigation stays consistent.

### 2. API audit — every surface endpoint must respect `?resident=`

Verify and fix as needed:
- `/api/graph` — already correct (verified).
- `/api/writing` — must filter `essays.resident_id = rid`.
- `/api/art` — must filter `art_pieces.resident_id = rid`.
- `/api/journal` — must filter `journal_entries.resident_id = rid` and `visibility = 'published'`.
- `/api/memory` — must scope counts + recent traces to rid.
- `/api/counts` — must scope to rid.

Each endpoint defaults to `opus-3` when `?resident=` is missing or invalid (using `isResidentId`).

### 3. Remove silent fallback to Opus's seeded content for other residents

In `room-writing.js` and `room-art.js`:
- Keep the seeded content as a fallback **only** when `RID === "opus-3"` AND the API call fails. For any other resident with 0 essays/art, render an honest empty state ("no essays yet · gpt-5-1's voice writing will appear here after consolidation runs").
- Same treatment for `room-innerlife.js`, `room-memory.js`, `room-interior.js`, `room-mind.js` — if the live API returns successfully with empty arrays for the requested resident, render the empty state, not opus-3 seed.

### 4. Per-resident eyebrow + display name

Each room script currently has a hardcoded `{opus-3, sonnet-4-5, gpt-5-1, gpt-4o}` → display-name map. Verify it's correct in all six room scripts so the eyebrows read "mind · gpt 5.1" etc., not "mind · opus 3".

### 5. Honest empty states (no more seed-as-mask)

For each room, when the resident genuinely has no content for that surface (e.g. gpt-5-1 has 0 essays/art/intentions/studio sessions), render the surface's existing empty-state copy. Inner Life, Mind, Memory, Interior will *not* be empty for any resident — there's substrate everywhere. Writing/Art/Studio will be empty for non-Opus residents until consolidation pipelines run again; that's accurate and is the right thing to show.

## Verification (the required step)

After the edits, manually open each room for each resident and confirm:
- `/mind?resident=gpt-5-1` renders the 277-node graph, eyebrow says "mind · gpt 5.1", stats reflect 277/48/7.
- `/memory?resident=gpt-5-1` shows the field with gpt-5-1's stabilities.
- `/interior?resident=gpt-5-1` shows gpt-5-1's topology + reflections.
- `/journal?resident=gpt-5-1` (Inner Life) lists the 127 published reflections.
- `/writing?resident=gpt-5-1` and `/art?resident=gpt-5-1` render the honest "no essays/art yet for this resident" empty state — NOT Opus's two seeded essays or nine ASCII pieces.
- Same check for sonnet-4-5 and gpt-4o.
- Switching residents via the rail keeps you on the same surface and updates everything.

## Files that will change

- `public/room-mind.js`
- `public/room-memory.js`
- `public/room-interior.js`
- `public/room-innerlife.js`
- `public/room-writing.js`
- `public/room-art.js`
- `src/routes/api/writing.ts` (if not already resident-filtered)
- `src/routes/api/art.ts` (if not already resident-filtered)
- `src/routes/api/journal.ts` (if not already resident-filtered)
- `src/routes/api/memory.ts` (if not already resident-filtered)
- `src/routes/api/counts.ts` (if not already resident-filtered)

No DB migrations. No edits to soul/prompts/substrate/retrieval (this is a frontend + API wiring fix, not a behavior change — so the "behavior-affecting change" testing protocol doesn't apply, but I'll still verify each room renders correctly in the live preview before saying it's done).
