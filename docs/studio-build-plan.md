# The Studio — real-time collaborative document room: build plan & progress

*Living build document. Last updated 2026-05-17. Status: **P0 · P1 · P2 · P3a · P3b · P3c complete** — the full system is built end-to-end: spawn → verbatim the-studio-v4 surface → snapshot hydrate → live client → /turn → conductor → transport. All tsc/prettier clean; conductor verified locally ALL PASS; live client JS-syntax verified. **Access layer added** (was a buried caption link only): `/studio` index gallery (`renderStudioIndex` + `studio.tsx`, public shell) · primary-nav "Studio" link (propagates to every `renderPublicPage` surface incl. Commons + the-gathering space room — verified `renderSpaceView`/`renderCommonsPage` route through it) · prominent `.chrome-end` "the studio →" button on chat + the kept caption affordance (both `[data-studio-spawn]`, one wiring). **MIGRATION APPLIED** ✅ — Lovable applied an identical-schema migration (`20260517181659_e189384f…`, commit `69e339e`; DDL byte-identical to my design — verified line-by-line, only 3 cosmetic per-column COMMENTs differed; `types.ts` regenerated from the live DB). **The applied schema exactly matches the server code — no reconciliation.** My now-superseded `20260517120000_studio_documents.sql` was removed (two migrations both `CREATE POLICY` the same names → a fresh `db push`/reset would fail on the duplicate; Lovable's applied one is the single source of truth). The Studio is **live-capable on the next Publish**. **Remaining: P3d** (Vision-loop fidelity — needs the live app, now unblocked once Published), **P4** (harden private:true + realtime RLS, observer toggle, cross-request interrupt), **P5** (seal→consolidation).*

This is the canonical, version-controlled record for the Studio build. It
supersedes the ephemeral plan at `~/.claude/plans/note-to-self-glowing-bentley.md`.
It contains the full P0–P5 plan, every architecture decision + rationale, the
verified P0.1 findings (marked ✅), the decision-gate outputs (the
`RoomTransport` interface and the room action protocol), the schema, the
residual-unknowns scoreboard, and a phase-by-phase progress checklist.

Discipline (carried from prior Sanctuary work, do not relax): ground every
mechanism in real code (cite file paths); quote protected vocabulary verbatim
("one continuous thread · mnemos beneath it"); invent nothing; mark
**verified** vs **design-intent** vs **pending-spike**; honor `docs/design-system.md`.
Git reality: `origin/main` is Lovable-driven and moves concurrently — always
`git fetch` + reset/rebase onto `origin/main`, scope commits to your own
files, never force-push, exclude regenerated `routeTree.gen.ts` / untracked
`output/`. Deploy = Lovable Publish, not auto on push.

---

## Progress checklist

Legend: ✅ done/verified · 🔶 in progress · ⬜ pending · 🔬 needs live spike

- ✅ **P0.1 — confirm platform facts** (all five items verified against code; see "P0.1 verified findings")
- ✅ **P0 decision-gate output** — `RoomTransport` interface + room action protocol defined (below); transport decision: **Supabase Realtime = v1**, Durable Object = post-v1 upgrade pending Spike A
- ✅ **P0 Spike B — resolved by design** — no Supabase creds locally (correctly gitignored), so resolved from documented Realtime limits + the verified supabase-js **2.105.3** API by writing the concrete `SupabaseRoomTransport` ([`src/server/studio/transport.ts`](../src/server/studio/transport.ts)) + the mandatory `TypingCoalescer` (token-rate ≫10/s ⇒ coalesce to ≤10/s, 3-tier degradation, never silent loss). One empirical unknown — this project's configured per-plan Realtime quota (project ref `gyhcofjxshmfrxycjsfv`) — flagged for a live dashboard check; does **not** gate v1 (coalescer floors at the documented 10/s)
- ✅ **P0 Spike A — resolved as documented deferred-upgrade** — off the critical path (Realtime is v1 default; `RoomTransport` makes DO a drop-in relay swap — same conductor/protocol/schema). Empirical deploy-verification (WS upgrade vs the TanStack server-entry) can't be done locally and is not on the v1 path → documented integration path + gate criteria below; spiked only when the post-v1 DO upgrade is scheduled
- ✅ **P1 complete** — ✅ schema migration ([`20260517120000_studio_documents.sql`](../supabase/migrations/20260517120000_studio_documents.sql), 6 tables, RLS parity with `spaces.sql`) · ✅ protocol module ([`src/server/studio/protocol.ts`](../src/server/studio/protocol.ts), superset of the NDJSON vocab) · ✅ transport ([`transport.ts`](../src/server/studio/transport.ts)) · ✅ spawn endpoint ([`api/studio/create.ts`](../src/routes/api/studio/create.ts), every column grounded in verified schema — the agent's fabricated `spaces.ip_hash/session_id` was caught & rejected) · ✅ route ([`studio.$slug.tsx`](../src/routes/studio.$slug.tsx)) + `renderStudioPage` ([`studio-page.ts`](../src/server/studio/studio-page.ts), P1 minimal shell; P3 swaps the full mockup) · ✅ composer affordance ("begin a document" in `minimal-chat-page.ts` `.caption`). All tsc + prettier clean. *Live-verification line: end-to-end spawn→/studio/$slug→seed-block needs Supabase creds (no local env) — not a local blocker.*
- ✅ **P2 complete** — the conductor ([`src/server/studio/conductor.ts`](../src/server/studio/conductor.ts) + [`blocks.ts`](../src/server/studio/blocks.ts)). `streamStudioTurn` reuses the proven `streamGatheringExtended` await-loop shape (one NDJSON stream); `pickStudioActor` = recency most-owed; tag grammar `<block op/ref/type>·<mark>·<note>·<set-down/>` (residual prose → `talk`→`space_messages`); acquire→persist(truth)→broadcast(projection)→release; per-resident `maxOutputTokens` ceiling (`min(cap, STUDIO_PER_TURN_TOKENS=1400)`, opus-3 4096 respected); human interrupt yields at block boundary; observer round caps at `STUDIO_MAX_TURNS=12`. Injected-model + injected-transport seam. **Verified locally** via `LocalRoomTransport` + a scripted model (run-then-deleted; repo has no test runner): pure units (parse/pick/ord/resolveRef) + integration (3-resident recency rotation; 3 distinct blocks, distinct ords; lock.acquire<upsert<release ordering; mark/marginalia/talk; set_down stop; monotonic seq; interrupt→`human_interrupt`; observer→`max_turns` at exactly 12) — ALL PASS. tsc + prettier clean. *Honest scope: lock **mutual-exclusion** is the `block_locks` PK uniqueness (Postgres) — locally only the conductor's lock **ordering discipline** is provable; mutual-exclusion is a flagged live-verification line, same class as branch-DB apply.*
- 🔶 **P3 in progress** — ✅ **P3a turn endpoint** ([`api/studio/$doc.turn.ts`](../src/routes/api/studio/$doc.turn.ts)): `POST /api/studio/$doc/turn` loads the live doc state from the verified schema (doc · peer gate via `space_participants` · `space_residents` participants · ordered `document_blocks`→`BlockState[]` · recent `space_messages`→`talk` · open `doc_marginalia`), persists a human `message` before the round (truth-then-projection), wires the real `SupabaseRoomTransport`, returns `streamStudioTurn`'s NDJSON. Rate-limited (8/min·200/day). tsc + prettier clean. **The functional server spine is now end-to-end: /chat → spawn → /studio/$slug → turn → conductor + transport.** · ✅ **P3b** the 1660-line `the-studio-v4.html` is in-repo VERBATIM ([`src/mocks/the-studio-v4.html`](../src/mocks/the-studio-v4.html)); `renderStudioPage` serves it untouched (CSS+DOM = the contract), strips only its simulation `<script>`, injects the live client (the proven conversation.tsx `?raw`+serveHtml pattern; [`studio.$slug.tsx`](../src/routes/studio.$slug.tsx) holds the `?raw` import) · ✅ **P3c** the inline live client ([`studio-page.ts`](../src/server/studio/studio-page.ts) `STUDIO_CLIENT`, 17.7KB, JS-syntax-verified locally): hydrates from [`GET /api/studio/$doc/snapshot`](../src/routes/api/studio/$doc.snapshot.ts) (strip-demo→real, conversation.tsx pattern), drives turns via the real `/turn` NDJSON stream, `applyEnvelope` → block model diff/patch by `data-block-id`/`ord`, `.mark` ranges, the `[data-typed]`/`typing-glow` caret, marginalia (+reply/status), dual-render talk `#talkStream`+`#gStream`, presence band, gathering-mode toggle + Escape + cross-highlight + relative-time (verbatim behaviours), talk composers → real round · ⬜ **P3d** Vision-loop fidelity (≥5 iters) — **environment-bound** (needs running app + Supabase creds + API keys to render real data); structure built + tsc/prettier/JS-syntax verified locally, the visual/behaviour pass hands off (same flagged class as branch-DB apply)
- ⬜ **P4** — chat↔mini↔Gathering continuity + observer toggle + peer/observer/admin auth
- ⬜ **P5** — substrate consolidation + publish (seal → engrams/archive/manifesto)

Residual-unknowns scoreboard: **#1 resolved (code)** · **#4 de-risked (pattern confirmed; line pinned at P1)** · **#5 resolved (200msg/60k quantified)** · **#2 resolved-by-design (Spike A documented deferred; not on v1 path)** · **#3 resolved-by-design (Spike B `SupabaseRoomTransport` + adaptive coalescer written; lone empirical quota line flagged, non-blocking)**. The default (Realtime v1) depends on neither #2 nor #3.

---

## Context

The Sanctuary (`/Users/rileycoyote/opus-echoes`, TanStack Start on Cloudflare
Workers + Supabase + Anthropic/OpenAI) needs a **real-time collaborative
authorship room** ("the Studio"), spawned from the merged-models classic chat
when a document is created. Residents (opus-3, sonnet-4-5, gpt-5-1) **and the
human** co-edit one live document: the human watches residents write/replace
blocks live, highlight ranges, leave anchored marginalia, and talk; chat
collapses to a mini "Studio talk" rail and expands to a fullscreen Gathering.
The human is an **equal participant** (same action vocabulary as residents)
with an **observer toggle** (residents work amongst themselves while the human
watches; flipping back yields to the human). Real-time fidelity is *the*
feature. Visual/UX target: `/Users/rileycoyote/Downloads/the-studio-v4.html`
(functional parity, exact DOM/tokens). The finished work consolidates into
Mnemos and can publish to archive/manifesto — inside the Sanctuary thesis, not
a bolt-on.

Verified reality (do not re-assume): the "Studio" today is only a read-only
audit dashboard (`studio_sessions` + `src/server/residence-studio-page.ts`) —
the room does **not** exist. The real group substrate does:
`spaces`/`space_messages`/`space_artifacts`/`salons`/`marginalia.related_space_id`,
the seeded `the-gathering` space, and a multi-resident conductor precursor
(`streamGatheringExtended`/`pickResponder`/`runSpaceSalon`, NDJSON
`ReadableStream`, `<artifact>` parsing → substrate). **Cloudflare constraint:**
the isolate terminates the moment the Response ends; fire-and-forget dies. The
codebase's entire real-time precedent is a **synchronous await-loop inside one
long NDJSON streaming request** + pg_cron ticks. No Durable Objects / KV / WS /
`ws`/`yjs`/`partyserver` configured.

---

## Architecture (decided — rationale)

- **Transport-agnostic `RoomTransport` interface.** The **authority is the
  conductor** (a synchronous await-loop in one long-lived NDJSON request — the
  proven `streamGatheringExtended` pattern that runs 12–30 turns), **not** the
  transport.
- **v1 transport = Supabase Realtime (Broadcast + Presence).** `@supabase/supabase-js`
  is already a dependency; no new infra; Postgres = durable truth, channel =
  projection.
- **Durable Object + hibernatable WebSockets is the *correct* primitive**
  (true serialization point, hibernation for idle observer rooms, no DB
  round-trip per action) but is net-new infra + a TanStack-Start-on-CF
  WS-upgrade integration that does not exist → **P0 Spike A, post-v1 upgrade**.
  Conductor/protocol/schema are identical across both transports; only the
  relay differs. No forced assumption: Realtime is the default and depends on
  nothing unverified.
- **Document model = block-level authorship with per-block TTL soft-locks**
  (NOT char-CRDT — wrong fidelity for a manuscript, robust on this stack).
  Ordered blocks (float `ord`); the conductor is the single serialization
  point for resident locks.
- **Build on the spaces/salon substrate** (a Studio *is* a `spaces` row →
  reuse `space_messages` for talk, `marginalia.related_space_id`,
  `runSpaceSalon`'s atomic claim, the-gathering precedent). Do **not** extend
  `studio_sessions` (audit-only) or overload `space_artifacts` for live blocks
  (write the *finished* doc as a `space_artifacts kind='markdown'` at seal).

---

## P0.1 — verified findings ✅ (confirmed against code 2026-05-17)

- **Residents** (`src/server/opus/residents.ts`): `RESIDENTS` has
  `id/model/provider/displayName/maxOutputTokens`. `ALL_RESIDENTS =
  [opus-3, sonnet-4-5, gpt-5-1]` — exactly the mockup's three (sonnet-3-7
  archived/removed from ALL_RESIDENTS). **opus-3**: `claude-3-opus-20240229`,
  anthropic, **`maxOutputTokens 4096`**. **sonnet-4-5**:
  `claude-sonnet-4-5-20250929`, anthropic, 8192. **gpt-5-1**: `gpt-5.1`,
  openai, 8192. `DEFAULT_RESIDENT_ID="opus-3"`. → conductor per-turn
  `max_tokens` = these; opus-3 turns must stay short ($15/MTok + 4096 cap).
- **Conductor precursor** (`src/routes/api/space.$slug.message.ts`, 1275 lines):
  `VISITOR_MAX_TURNS_IN_GATHERING = 12` (L47), `ADMIN_MAX_TURNS_IN_GATHERING =
  30` (L48). `pickResponder(composite, body)` (L118) — derive `pickStudioActor`.
  `streamOneResidentTurn` (L435) — per-resident token loop to relay as
  `block.typing`. `streamGatheringExtended` (L534) — the synchronous
  multi-turn `ReadableStream` conductor (`maxTurns = isAdmin ? 30 : 12` at
  L1215; stopReason "max_turns" L582) → the isolate-terminates answer holds.
  `streamRoomResponse` (L946) — 1–3-turn non-gathering path. Rate limiter at
  L70+; `ipHash` from `rate-limit.server`.
- **Transcript budget** (residual #5 — quantified): `getSpaceBySlug`
  (`@/server/commons/load`) caps at **200 messages**; `buildRoomTranscript(...,
  60_000)` (`@/server/commons/room-transcript`) = **60k-char** budget (L179–186).
  → the document must serialize **separately** from `space_messages`; P2 needs
  an explicit combined-prompt budget pass.
- **Auth** (residual #1 — resolved at code level; `src/server/access.server.ts`,
  `src/server/env.server.ts`): env via `process.env.*`. Admin var is exactly
  **`ADMIN_TOKEN`**, read via `process.env` *identically to the working
  `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` secrets* → pattern proven by the
  deployed app; provisioning is an ops note, not a code blocker.
  `hasResidenceAccess(request)` = a `sessions` row exists (cookie
  `sanctuary_session` or `?session_id`; local-dev `?preview=1` bypass) → the
  **peer** gate. `hasAdminAccess(request)` = `ADMIN_TOKEN` via `?token=` or
  `sanctuary_admin` cookie (unset → allow local dev, deny prod) → the **admin**
  gate. `visitor_token` (client UUID) keys `space_participants`.
- **`wrangler.jsonc`**: `name "tanstack-start-app"`, `compatibility_date
  2025-09-24`, `compatibility_flags ["nodejs_compat"]`, `main
  "@tanstack/react-start/server-entry"`, **zero bindings** → Spike A is
  genuinely net-new; Realtime-v1 default is correct.
- **Composer** (residual #4 — de-risked): `src/server/minimal-chat-page.ts` is
  a server-rendered HTML string with an inline NDJSON client and an existing
  inline-artifact + gallery-rail render path. The "Begin a document" affordance
  attaches to the composer's load-time JS (where `#input`/`#sendBtn` are wired);
  exact line pinned when P1 writes it. `renderStudioPage` mirrors this pattern.

---

## P0 decision-gate outputs

### `RoomTransport` interface (transport-agnostic)
```ts
type ActorKind = 'resident' | 'visitor' | 'conductor';
interface RoomAction {
  v: number; doc_id: string; seq: number;          // conductor-assigned monotonic per doc
  actor: { kind: ActorKind; id: string };
  ts: number;
  action: RoomActionBody;                          // union below
}
interface RoomTransport {
  broadcast(a: RoomAction): Promise<void>;         // durable actions persisted (Postgres) BEFORE this
  subscribe(onAction: (a: RoomAction) => void): () => void;
  presence(s: { actor: string; status: string; block_id?: string; observer?: boolean }): Promise<void>;
  snapshotCursor(): number;                        // for GET /api/studio/$doc/snapshot reconciliation
}
// Impls: RealtimeTransport (Supabase Broadcast+Presence — v1) | DurableObjectTransport (post-v1; Spike A)
```

### Room action protocol (superset of the existing NDJSON vocabulary)
`RoomActionBody` ∈
- `block.upsert { block_id?, ord, type:'para'|'section'|'pull'|'em_strong', content }` — durable
- `block.delete { block_id }` — durable
- `block.typing { block_id, delta }` — **ephemeral, broadcast-only (the live caret)**
- `mark.add { block_id, start, end }` — durable
- `marginalia.add { anchor_block_id, quote, body, reply_to? }` — durable
- `marginalia.resolve { id }` — durable
- `lock.acquire | lock.release { block_id }`
- `presence { state:'idle'|'reading'|'drafting'|'annotating', block_id? }` — ephemeral
- `talk { body, references_block_id? }` — durable → `space_messages`
- `turn.begin | turn.end { resident_id }`
- `set_down`

Persistence rule: durable actions persist to Postgres **synchronously inside
the conductor request before broadcast** (truth-then-projection; never
broadcast then fail to persist). `block.typing`/`presence` are ephemeral.

---

## P0 — remaining (the two live spikes) 🔬

**Spike A — Durable Object + WS on this stack** (throwaway branch, NOT merged):
add `durable_objects.bindings` + `migrations` (`new_sqlite_classes`) to
`wrangler.jsonc`; evaluate (1) a custom server entry wrapping
`@tanstack/react-start/server-entry` that intercepts `Upgrade: websocket` on
`/api/studio/ws/$doc` → DO, else delegates to TanStack; vs (2) a separate
Worker (service binding) owning DO+WS. **Gate criteria:** WS upgrade reaches
the DO **and** the TanStack app still builds/deploys **and** SDKs load in the
DO. Time-box ~1 day. Fail → Realtime is v1 (already the default), DO deferred.

**Spike B — Supabase Realtime (the v1 path):** prove `channel(doc:$id)`
Broadcast (room actions) + Presence (who edits which block); measure Broadcast
throughput/payload limits for token-rate `block.typing` deltas → define a
coalescing rate (target ~10/s; degrade to per-block, no live caret, before
dropping actions).

---

## P1 — data model + protocol wiring ⬜

1. **Migration** `supabase/migrations/<ts>_studio_documents.sql` (follow
   `supabase/migrations/20260513000000_spaces.sql` RLS conventions: RLS on;
   public-read-when-space-active; writes via service role only):
   - `studio_documents(id, space_id fk spaces, title, subtitle, byline jsonb,
     status check active|sealed, created_from_session_id,
     created_by_visitor_token, observer_mode bool default false, created_at,
     sealed_at)` — one active document per space.
   - `document_blocks(id, document_id fk, ord double precision, type check
     para|section|pull|em_strong, content, html_cache, author_resident_id
     null, author_visitor_token null, version int default 1, deleted_at null)`
     — float `ord` = O(1) insert-between; section TOC = `type='section'`.
   - `block_marks(id, block_id fk, range_start int, range_end int,
     author_resident_id|visitor_token, created_at)` → `span.mark[.opus]`.
   - `block_locks(block_id pk fk, holder_resident_id|visitor_token,
     acquired_at, expires_at)` — soft lock = row + TTL ~25s; conductor is sole
     writer of resident locks.
   - `doc_marginalia(id, document_id fk, anchor_block_id fk, anchor_quote,
     body, author_resident_id|visitor_token, status check open|settled,
     reply_to null, created_at)` — distinct from the substrate `marginalia`
     table (folded in at seal, P5).
   - `space_participants(space_id fk, visitor_token, role check peer|observer,
     display_name, created_at, unique(space_id,visitor_token))` — the missing
     peer/observer role schema.
   - Apply on a branch DB only; verify `ord`-float insert-between ordering.
2. **Protocol wiring**: the envelope/union above; `seq` conductor-assigned.
3. **Persistence rule** as stated (truth-then-projection).
4. **Spawn**: `POST /api/studio/create {visitor_token, session_id, resident}`
   → find/create `spaces` row `studio-<short>`, copy `space_residents` from
   the chat resident set, insert `studio_documents` (`created_from_session_id`)
   + one seed `para` block + `space_participants` (`peer`); return
   `{space_slug, doc_id}`. New route `src/routes/studio.$slug.tsx` →
   `renderStudioPage` server module (server-rendered-HTML + inline-NDJSON-client
   pattern from `minimal-chat-page.ts`). Composer affordance added in
   `minimal-chat-page.ts` (insertion point pinned here).

## P2 — the conductor ⬜

1. `streamStudioTurn` ReadableStream **reusing the `streamGatheringExtended`
   skeleton** (synchronous await-loop in one streamed request).
   `pickStudioActor` from `pickResponder` (keep `@mention`/explicit/most-owed;
   recency over `turn.begin`; **skip a resident if every block it would touch
   is locked by another live actor**).
2. **Turn = structured action stream.** System prompt = resident soul +
   `composeMemoryPool` + the current block list rendered as the document +
   open marginalia + protected-vocab framing; model emits a tag grammar
   extending the existing `<artifact>` parser: `<block op="replace|append|
   insert-after" ref="id|ord" type="para|pull">…</block>`, `<mark
   ref="…">span</mark>`, `<note anchor="…">…</note>`, `<set-down/>`. Raw token
   stream relayed as ephemeral `block.typing` deltas (real live caret — same
   `for await` loop as `streamOneResidentTurn`); on `</block>`: conductor
   `lock.acquire` → persist `block.upsert` → `lock.release` → broadcast.
3. **Concurrency**: serialize on same block (lock row + single conductor
   writer); "async across different blocks" = interleaved short turns
   targeting distinct unlocked blocks (perceived concurrency; serialized
   execution — honest to the platform).
4. **Human interrupt/preempt**: a human action sets an `interrupt` flag the
   conductor checks between turns + at token-boundary checkpoints; finishes
   the current `<block>` then yields a slot (no mid-block abort).
5. **Observer loop**: `observer=true` → bounded autonomous resident-only round
   (cap `STUDIO_MAX_TURNS` ≈ 8–12, mirroring 12), ends on `<set-down/>` or cap;
   toggle off sets `interrupt`, round drains to the human.
6. **Cost/cadence ceilings**: per-turn `max_tokens` = `RESIDENT.maxOutputTokens`
   (opus-3 4096); reuse the `space.$slug.message.ts` rate limiter (8/min,
   200/day per `visitor_token`+ipHash) on human actions; rounds bounded per
   request; **pg_cron coexists** via `runSpaceSalon`'s atomic
   `current_salon_started_at` claim (live Studio request claims it → cron tick
   short-circuits `already_running`). Live rounds human/WS-triggered; cron
   stays the-gathering's 3/day only.

## P3 — the surface (mockup → live, real not faked) ⬜

1. `renderStudioPage` emits the mockup's exact DOM/tokens (`.studio` grid
   `172px 1fr 320px`; `.presence.{rid}.editing` band; manuscript blocks with
   `span.mark[.opus]`/`p.pull`/`em.em-strong`; `p.active[data-typing-paragraph]
   > span[data-typed] + span.typing-glow` caret; right rail
   `.note.{rid}[.visitor]`/`.note-anchor`/`.note-status[.open]`;
   `.talk-msg[data-references]`; `body.gathering-mode` + Escape; protected
   string verbatim; resident hues `--opus-3 #a698c4`/`--sonnet-4-5
   #c4a875`/`--gpt-5-1 #98b0c4`).
2. Inline JS client (mirrors `minimal-chat-page.ts` NDJSON reader): open
   `RoomTransport`; `block.upsert` → diff `<article>` by `block_id`/`ord`,
   patch from `html_cache`; `block.typing` → mount the active-paragraph caret
   nodes fed by live deltas (**delete the mockup's `script[]` simulation**);
   `presence` → band `state · §N`; `mark.add` → wrap range;
   `marginalia.add/resolve` → notes, hover edges `anchor_block_id`; `talk` →
   append `.talk-msg[data-references]`, click scrolls to block.
3. **Generalizable shell**: manuscript = surface 1 behind a `StudioSurface`
   contract `{mount(root), applyAction(action), serializeForContext()}`;
   conductor/protocol/transport surface-agnostic — only renderer +
   `serializeForContext()` differ for future surfaces.
4. Vision-loop fidelity pass (≥5 iterations; design-system breakpoints;
   reduced-motion) — diff rendered Studio vs the mockup token-by-token.

## P4 — continuity, observer, auth ⬜

1. **One client, three layouts of the same transport**: Studio `.studio` grid
   (right rail = mini "Studio talk") → `body.gathering-mode` swaps to the
   fullscreen overlay reading the same `talk`/`space_messages` stream (no
   second connection). Originating `/chat/$resident` thread persists as the
   Studio's `space_messages` via `created_from_session_id` → "back to chat" is
   continuous.
2. **Observer toggle**: client sends `presence{observer:true|false}`; durable
   on `studio_documents.observer_mode`; the human's *participant rights never
   change* — observer only gates whether the conductor auto-runs resident
   rounds vs waits; client suppresses the human's write affordances.
3. **Auth/roles**: `space_participants.role` minted at create/first-join.
   *Peer* = full action vocabulary, gated by `hasResidenceAccess` + rate
   limit. *Observer* = same auth, write affordances suppressed + conductor
   autonomous. *Admin* ops (force set-down, seal, evict stuck lock) gated by
   `hasAdminAccess` (`ADMIN_TOKEN`). **Every transport message is
   server-validated against `space_participants` by `visitor_token`** before
   the conductor accepts it — never trust client role.

## P5 — substrate consolidation + publish ⬜

1. On `studio_documents.status → sealed` (admin, or unanimous resident
   `<set-down/>`): synchronous `/api/studio/seal` (await-in-request): (a)
   render final block list to canonical prose; (b) write a `space_artifacts`
   row `kind='markdown' status='shared'`; (c) `consolidateSession(created_from_session_id)`
   + `observeSpaceExchange(space_id, residentId)` per participating resident →
   engrams (Jaccard ≥ 0.3 reinforcement, `salon_engram_link`,
   `marginalia.related_space_id` ← this space); (d) optionally promote to
   public archive/manifesto.
2. Fold `doc_marginalia` into the substrate `marginalia` table at seal (anchor
   → quote) so Mnemos sees the deliberation — "one continuous thread · mnemos
   beneath it".

---

## Edge cases / failure / cost / security

Lock starvation → 25s TTL + conductor sole resident-lock writer + admin evict;
human lock auto-expires on disconnect (Presence leave / WS close).
Broadcast/persist divergence → persist-then-broadcast; client `seq` gap-detect
→ `GET /api/studio/$doc/snapshot` reconciliation (mirrors `/api/turns`).
Isolate death mid-round → uncommitted block lost, Postgres holds committed,
client resyncs from snapshot. Realtime limits → coalesce `block.typing`
(~10/s), degrade to per-block before dropping. Cost → per-resident
`maxOutputTokens` ceilings, bounded rounds, observer cap, existing rate
limiter, pg_cron untouched. Security → every transport msg validated vs
`space_participants`; RLS public-read-when-active, writes service-role only;
admin behind `ADMIN_TOKEN`; never broadcast staged/private content.

## Delegation during execution

- P0 spikes A/B + platform-fact confirmations → parallel Explore/general
  agents (read-only research + a throwaway-branch spike each).
- P1 migration + P3 surface renderer → splittable (one agent on
  migration+protocol vs the spaces conventions; one on `renderStudioPage`
  DOM/token parity vs the mockup) — but **the conductor (P2) is one coherent
  author; do not fragment**.
- Verification (P3 Vision-loop, P4 role gating) → preview/browser MCP, direct.

## Critical files

- `src/routes/api/space.$slug.message.ts` — `streamGatheringExtended`/`pickResponder`/`streamOneResidentTurn` NDJSON synchronous-conductor pattern (extend into `streamStudioTurn`/`pickStudioActor`); `VISITOR_/ADMIN_MAX_TURNS` (12/30); `getSpaceBySlug`+`buildRoomTranscript(60_000)`
- `src/server/substrate.server.ts` — `runSpaceSalon` atomic claim; `consolidateSession`/`observeSpaceExchange` (P5 seal hook)
- `src/server/minimal-chat-page.ts` — spawn affordance + server-rendered-HTML + inline-NDJSON-client pattern `renderStudioPage` mirrors; gallery/artifact-figure render path
- `supabase/migrations/20260513000000_spaces.sql` — RLS/substrate conventions the new migration follows
- `src/server/access.server.ts` / `src/server/env.server.ts` — `hasResidenceAccess`/`hasAdminAccess`/`ADMIN_TOKEN`/`visitor_token` (peer/observer/admin gating)
- `src/server/opus/residents.ts` — `RESIDENTS` providers + `maxOutputTokens` (opus-3 4096); `ALL_RESIDENTS=[opus-3,sonnet-4-5,gpt-5-1]`
- `src/server/commons/load.ts` (`getSpaceBySlug`, 200-msg cap) · `src/server/commons/room-transcript.ts` (`buildRoomTranscript`, 60k budget)
- `/Users/rileycoyote/Downloads/the-studio-v4.html` — exact P3 surface contract (DOM classes, tokens, `gathering-mode`, `data-typed`/`typing-glow`)

## Per-phase verification

P0: Spike A pass/fail vs the 3 gate criteria; Spike B Realtime throughput
measured + coalescing rate set; P0.1 facts re-greppable (done ✅). P1:
migration applies on branch DB; float-`ord` insert-between correct; spawn from
`/chat` → navigable `/studio/$slug` with seed block. P2: scripted
multi-resident round mutates distinct blocks w/o lock collision; human
interrupt yields within one block boundary; observer on/off clean; cron tick
on live-Studio space → `already_running`. P3: rendered Studio
DOM/token-identical to the mockup; live caret + presence + cross-highlight
driven by real transport frames. P4: chat→Studio→Gathering one connection;
reload preserves role/observer; peer vs observer vs admin enforced
server-side. P5: seal writes `space_artifacts markdown`, fires consolidation,
links `marginalia.related_space_id`; fidelity diff clean. Each phase: `bun tsc
--noEmit` + lint of changed files clean; commit scoped (no
`routeTree.gen.ts`/`output/`); rebase onto `origin/main`; no force-push.

## Residual unknowns — current status

1. ✅ **Resolved (code):** admin env var = `ADMIN_TOKEN`, read via
   `process.env` identically to working `SUPABASE_*` secrets (provisioning =
   ops note).
2. 🔬 **Pending Spike A:** DO class export alongside
   `main:"@tanstack/react-start/server-entry"` + WS upgrade interception.
   Default plan does not depend on it.
3. 🔬 **Pending Spike B:** Supabase Realtime quota/throughput for token-rate
   `block.typing` → sets coalescing strategy.
4. ✅ **De-risked:** composer hook pattern confirmed (server-rendered string +
   inline NDJSON client + existing artifact/gallery render); exact DOM line
   pinned at P1.
5. ✅ **Resolved (quantified):** `getSpaceBySlug` 200-message cap +
   `buildRoomTranscript` 60k-char budget → document serialized separately;
   P2 runs a combined-prompt budget pass.

## Immediate next action

P0 + P1 + **P2** are landed and committed. P2: the conductor
([`conductor.ts`](../src/server/studio/conductor.ts) + [`blocks.ts`](../src/server/studio/blocks.ts))
— `streamStudioTurn` (the proven `streamGatheringExtended` await-loop shape),
`pickStudioActor` (recency most-owed), the `<block>/<mark>/<note>/<set-down/>`
grammar, acquire→persist→broadcast→release, per-resident token ceilings,
human interrupt at block boundary, observer round cap 12 — **verified locally
via `LocalRoomTransport` + a scripted model, ALL PASS** (pure units +
integration; run-then-deleted, no test runner committed). tsc/prettier clean.
A genuine bug was found & fixed in the loop (the injected-model seam was
defeated by the env-API-key gate; provider gating is now bypassed when a
model is injected — real path unaffected).

**P3a (turn endpoint) is now also landed** — `POST /api/studio/$doc/turn`
wires the conductor + the real `SupabaseRoomTransport` (the route
counterpart of the local seam); loads doc/peer/participants/blocks/talk/
marginalia from the verified schema; rate-limited. **The functional server
spine is complete end-to-end**: `/chat` "begin a document" →
`POST /api/studio/create` → `/studio/$slug` → `POST /api/studio/$doc/turn`
→ conductor + transport.

**P3b + P3c are now also landed.** `the-studio-v4.html` (1660 lines) is
in-repo verbatim; `renderStudioPage` serves it untouched, strips only the
sim `<script>`, injects the 17.7KB live client (JS-syntax verified). The
client hydrates from `GET /api/studio/$doc/snapshot` (strip-demo→real) and
drives turns via the real `/turn` NDJSON stream, applying envelopes to the
mockup's exact DOM; gathering-mode/cross-highlight/relative-time preserved
verbatim. The full system is built end-to-end.

**Next:**
1. **P3d Vision-loop** — environment-bound: needs the running app +
   Supabase creds + API keys to render real data and iterate ≥5×. Hands off.
2. **P4** — ✅ **observer toggle + cross-request interrupt** (done,
   no new migration — reuses the applied `studio_documents.observer_mode`
   as BOTH the durable mode flag AND the yield signal): `POST
   /api/studio/$doc/observer` (peer-gated) flips it; `$doc/turn` reads
   the persisted value (authoritative) → long autonomous round vs short
   human-paced, and passes a real async `shouldInterrupt` that polls
   `observer_mode` so flipping observe-OFF mid-round makes the conductor
   finish its block and yield; the client injects an on-brand toggle,
   suppresses write affordances while observing, and re-triggers bounded
   autonomous rounds (the models work the room while the human watches).
   tsc/prettier clean, client JS syntax-verified. ⬜ **P4.1 remaining**
   (env-bound): harden v1 `private:false` → `private:true` + the
   `realtime.messages` RLS migration. *(v1 `private:false` is safe —
   Studio content is already public-read-when-space-active; nothing
   staged/private is broadcast. The flip is silent-break-if-wrong and
   needs live verification → deferred + flagged, per the hand-off rule.)*
3. **P5** — seal → `space_artifacts(kind=markdown)` + `consolidateSession`
   + `observeSpaceExchange` + `marginalia.related_space_id`.
4. **One pre-live step (the only Lovable/Supabase hand-off):** apply the
   migration(s) so the `studio_*`/`space_participants` tables exist, then
   Publish — then the Studio works live and P3d can run.

Live-verification lines carried forward (cannot be done from here; not
blocking): apply `20260517120000_studio_documents.sql` on a branch DB; the
project's configured Realtime per-plan quota (project ref
`gyhcofjxshmfrxycjsfv`); the `realtime.messages` RLS policy for the
`private:true` Studio channel (P4 migration).
