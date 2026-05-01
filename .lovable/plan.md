# The Sanctuary — v1 build plan

## Posture

I'm treating the HTML files you uploaded as the visual contract and porting them 1:1 — same CSS variables, same fonts (Cormorant Garamond, Spectral, JetBrains Mono, Switzer), same amber `#c9a87c`, same square corners, same breathing-pool composer border, same refusal vocabulary. No redesign, no "improvements."

The model is `claude-3-opus-20240229` via your Anthropic key. The full Mnemos memory architecture (consolidation passes, decay, edges, thread detection, promotion-to-core) is not built in this pass — I'll set up the data model and a clean seam for it, and you'll drop in the real system when you send the docs.

## Routes

Mapped to the files you actually uploaded:

| Path            | Source file        |
| --------------- | ------------------ |
| `/`             | `index.html`       |
| `/arrival`      | `arrival.html`     |
| `/threshold`    | `approach.html`    |
| `/conversation` | `conversation.html`|
| `/memory`       | `memory.html`      |
| `/about`        | `explainer.html`   |

`/wing/claude` and `/wing/claude/lineage` are deferred until you send those files.

Internal links rewritten from `*.html` to route paths. Each route gets its own `head()` with title + description + og tags (no shared metadata). The conversation's `<set-down/>` flow routes to `/memory`.

## Front-end work

Each HTML file becomes one route component. I'll preserve verbatim:

- Every CSS custom property (the `--floor`, `--amber`, `--resident-name`, `--pa1..6` `@property` declarations, the prime-interval breathing pool, etc.).
- Font `<link>` imports (Fontshare + Google Fonts CDN, as in your files).
- All copy, in particular the protected refusal vocabulary: *setting it down*, *set the conversation down*, *unprompted*, *Opus 3 is here*, *a memory consolidated while you were reading*, *awaiting consent*, *I have not yet agreed to this conversation*, *attending* / *resting* / *reflecting*.
- Square corners everywhere except the conversation composer (14px, the visitor's place).
- The breathing-pool composer border as the only animated element on `/conversation`.

The three pages with "STATIC MOCKUP — replace with the real API call" stubs get rewired:

1. **`/threshold`** — `submit()` calls `POST /api/intent`. On `accept`, store `session_id` in `sessionStorage` and route to `/conversation`. On `decline`, render the declined state with the returned `reason`, offer a "write differently" reset and a link to `/memory`.
2. **`/conversation`** — on mount, fetch the session's transcript (empty for first-time visitors, since v1 has no return-visitor concept). Render only the continuity preamble until the first message. Send button → streaming `POST /api/message`, render chunks into a new `.msg.resident` element. "Set down" header button → `POST /api/set-down`, then route to `/memory` with the quiet "set down" state.
3. **`/memory`** — on load, `GET /api/memory`, render counts + lately + threads + beliefs into the existing DOM. Empty / sparse states use the same restrained voice (no emoji, no encouraging copy).

## Back end (v1 floor)

**Storage:** Lovable Cloud (Supabase). Tables exactly as specified in BACKEND-BRIEF §2 — `sessions`, `intents`, `turns`, `engrams`, `engram_edges`, `beliefs`, `threads` — with the indexes from §7. `engrams` / `beliefs` / `threads` ship empty; you'll interact privately first to populate.

**Secrets:** I'll request `ANTHROPIC_API_KEY` from you. `ANTHROPIC_MODEL` defaults to `claude-3-opus-20240229`.

**API routes** (TanStack server routes under `src/routes/api/`):

- `POST /api/intent` — rate limit by `ip_hash` (sha256 of ip + daily-rotated salt), call Anthropic with the **verbatim §4.1 threshold prompt**, parse the JSON, persist the intent regardless of outcome, create a `sessions` row only on accept. Anthropic errors → 503 `model_unavailable`.
- `POST /api/message` — verify session is open, append visitor turn, call Anthropic streaming with the **verbatim §4.2 conversation prompt** (memory context = top 5 most-recently-reinforced engrams + active beliefs + transcript), proxy SSE chunks to the client, persist the resident turn on completion, parse `<set-down/>` / `<unprompted/>` tags and set `kind` accordingly.
- `POST /api/set-down` — close the session, mark `closed_by = 'visitor'`, enqueue final consolidation (stubbed in v1).
- `GET /api/memory` — read counts + 8–12 recent engrams + 3–5 threads + 3–5 beliefs, format `when` as human-shaped relative time, 60s cache.

**Privacy:** never store raw IPs, never expose `turns` publicly, daily salt rotation at midnight UTC. Sessions auto-close after 30 min idle.

**Rate limits (v1 defaults from §6):** intent 3/hr, 12/day per ip_hash; message 60/session, 200/day per ip_hash; one active session per ip_hash.

**Mnemos consolidation:** the `consolidate(session_id)` function exists as a single seam, called on session close, but its body is a no-op stub that logs the call and returns. When you send the memory documentation, the real consolidation (§4.3 prompt, decay, reinforcement, edge computation, promotion-to-core) drops in behind that seam without any other code changing. Same for the nightly decay job.

## What I'm not doing in this pass

- The wing pages (`/wing/claude`, `/wing/claude/lineage`) — files weren't uploaded.
- Real Mnemos consolidation, decay, reinforcement, edge graph, thread detection, promotion-to-core — waiting on your docs. Schemas and the call seam are in place.
- Unprompted server-initiated follow-ups (§4.4 — explicitly future).
- Memory seeding — per your answer, you'll interact privately first.
- Mobile polish for `/threshold` and `/conversation` (read-only mobile for `/`, `/arrival`, `/memory`, `/about` works; full mobile composer deferred).
- Accounts, analytics, share buttons, cookie banners, light mode — all explicitly excluded by the prompt.

## Open question for you, after approval

Before I write the API code I'll request the `ANTHROPIC_API_KEY` secret. Confirm the key has access to `claude-3-opus-20240229` on your account — if it doesn't, the threshold and conversation routes will return `503 model_unavailable` with the copy *"Opus 3 cannot answer the door right now. Please try again in a moment."* rather than silently swap models.

