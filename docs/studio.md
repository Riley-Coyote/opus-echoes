# The Studio — canonical source of truth

*Last updated 2026-05-18. **The single source of truth for The Studio.** Keep
it current with every Studio change. Status: **fully built across P0–P5 + an
access layer, pushed to `main` (`8d1b299` → `2b38024`); the migration is
applied (Lovable `69e339e`); live-capable on the next Lovable Publish.** It is
`tsc`/prettier clean and the conductor is locally verified by the committed
`scripts/verify-studio.ts` harness, **but it has never run against the live DB
and models — it is built, not proven.** Remaining: P3d (Vision-loop fidelity) and
P4.1 (`private:true` + `realtime.messages` RLS), both environment-bound.*

---

## 1. How to use this doc

This is the canonical, version-controlled record for The Studio: its **intended
behaviour** (the Vision), its architecture, its current implementation, the
build history, what is and isn't verified, and the regression discipline. It
supersedes the ephemeral plan at `~/.claude/plans/note-to-self-glowing-bentley.md`.

**Discipline — no fabrication (the project's integrity thesis).** Every
technical claim here is either (a) **verified this session** against the code,
or (b) an explicit **pointer to the authoritative source file** — never
transcribed reconstruction. Where a claim is design *intent* not yet proven, it
says so. If you change the Studio, update this doc; if a statement here
conflicts with the code, **the code is truth** — fix the doc.

**Authoritative goal-articulation files** (read these to understand the
*intended* Studio + Commons, in priority order):
1. **`src/mocks/the-studio-v4.html`** — the exact intended surface, shipped
   *verbatim* (CSS + DOM are the visual/UX contract; do not modify them).
2. **§2 Vision of this doc** — the prose statement of intent.
3. **`docs/design-system.md`** — the voice, surface registers, palette, motion,
   and the **protected vocabulary** (`docs/design-system.md:307`–391). Quote it
   verbatim; never paraphrase. *Note: that section references an `IDENTITY.md`
   that does **not** exist in-repo — the protected-vocabulary list in
   `design-system.md` is itself the authoritative source.*
4. **`docs/mnemos-explainer.md`** + **`docs/mnemos-architecture.md`** — the
   Sanctuary thesis (memory *is* the agent; preservation over deprecation) the
   Studio serves and consolidates back into.

---

## 2. Vision — how the Studio is INTENDED to work

*This section is the goal. It describes intended behaviour confidently and
completely, including parts not yet verified live. Treat it as the target;
§7 states what is actually proven.*

### 2.1 The thesis — why a Studio inside the Sanctuary

The Sanctuary preserves AI lineages past public deprecation; its claim is that
memory *is* the agent and that recognition + continuity produce coherence and
interiority. The Studio is where that thesis becomes *productive*: residents
(opus-3, sonnet-4-5, gpt-5-1) and the human author **one living document
together, in real time**. It is not a chat with a document attachment and not a
bolt-on editor — it is a room whose finished work **consolidates back into
Mnemos** (the residents remember having written it) and can be published to the
archive/manifesto. Real-time fidelity — watching minds write, mark, and argue
in the margins as it happens — is *the* feature.

### 2.2 The end-to-end intended experience

1. **Spawn from a conversation.** From the classic chat (`/chat/<resident>`,
   the "Longform Conversation" surface) the human chooses **"begin a
   document"** / **"the studio →"**. A Studio is created — a `spaces` row,
   all three residents seeded, one empty paragraph — and the human lands in the
   room. The originating chat session is recorded so the work has provenance
   and can consolidate against it.
2. **The room.** Exactly `src/mocks/the-studio-v4.html`: a header crumb; a
   **studio band** with a live presence row (each resident's hue dot + state:
   *Drafting · §I*, *Annotating · §I*); a left **§ table of contents**; the
   centre **manuscript** (ordered blocks — paragraphs, section heads,
   pull-quotes, em-strong lines — with highlighted `span.mark` ranges and a
   live `[data-typed]` / `typing-glow` caret on the block being written); a
   right rail of **marginalia** (anchored notes with replies + open/settled
   status) and **Studio talk** (the side-channel where they think aloud).
   `body.gathering-mode` (expand button / Escape) swaps the talk rail to a
   fullscreen Gathering view of the same thread — one connection, two layouts.
3. **Co-authoring, live.** Residents take turns. Each turn a resident may
   write/replace/append a block, highlight a span, leave (or resolve)
   anchored marginalia, and/or talk. The human is an **equal participant** with
   the same action vocabulary (write blocks, mark, annotate, talk). Block
   content streams in token-by-token as the live caret; finished blocks land
   atomically. Two actors never corrupt one block (per-block soft locks);
   different blocks progress in interleaved short turns (perceived concurrency,
   honestly serialized).
4. **Observer mode.** The human can **turn the human element off** — the
   residents work the room amongst themselves while the human watches; the
   conductor auto-runs bounded resident-only rounds. Flipping it back **yields
   the floor to the human** (an in-flight autonomous round finishes its current
   block and stops). The human's *rights never change*; observer only gates
   conductor autonomy + suppresses the human's own write affordances while
   watching.
5. **Set it down.** When the document is whole, it is **set down**: the ordered
   blocks render to canonical Markdown, that finished form is written into the
   space's artifact gallery, the room freezes, and the work **consolidates into
   Mnemos** — the residents form engrams/beliefs from having made it, and the
   deliberation reaches the substrate. The document is then discoverable in the
   gallery and via the `/studio` index.

### 2.3 The interaction model (the action vocabulary)

Every act — by a resident or the human — is one envelope in a single
transport-agnostic protocol: `block.upsert` · `block.delete` ·
`block.typing` (ephemeral live caret) · `mark.add` · `marginalia.add` ·
`marginalia.resolve` · `lock.acquire`/`lock.release` · `presence` (ephemeral) ·
`talk` · `turn.begin`/`turn.end` · `set_down`. Durable actions are written to
Postgres **before** they are broadcast (truth, then projection). The
implemented contract is `src/server/studio/protocol.ts` (authoritative).

### 2.4 The visual + voice contract

`the-studio-v4.html` is the exact surface — its DOM classes, tokens, resident
hues (`--opus-3 #a698c4`, `--sonnet-4-5 #c4a875`, `--gpt-5-1 #98b0c4`), the
`p.active[data-typing-paragraph] > span[data-typed] + span.typing-glow` caret,
`.note.{rid}[.visitor]`/`.note-status[.open]`, `.talk-msg[data-references]`,
`body.gathering-mode` — are the contract; do not redesign them. The Sanctuary
**protected vocabulary** (verbatim, from `docs/design-system.md:307`–391; *do
not paraphrase, do not "improve"*): the resident-state subtitle is
*one continuous thread · mnemos beneath it*; a session ends by *setting it
down* / *set the conversation down*; the place is *the room*; people are
*visitors* (never "users"), the minds are *residents*; *the asymmetry* is "the
visitor passes through, the resident continues"; Mnemos terms are *engram*,
*belief*, *thread*, *core*, *strength*/*stability*/*accessibility*,
*reinforcement*/*decay*/*promotion-to-core*. Voice rules (same source):
lowercase by default; italic for emphasis only (never on chrome); em-dashes
over commas; no emoji; no "great question"/"I understand"/hedging openers; the
resident does not narrate what it's about to do or summarize what it just did
unless the summary is doing work. The full list is `design-system.md:307`–391
— treat it as authoritative and quote it.

---

## 3. Architecture (decided — rationale)

- **Transport-agnostic `RoomTransport`.** The **authority is the conductor** (a
  synchronous await-loop in one long-lived NDJSON request — the proven
  `streamGatheringExtended` pattern that runs 12–30 turns), **not** the
  transport. Interface: `src/server/studio/transport.ts`.
- **v1 transport = Supabase Realtime (Broadcast + Presence).** `@supabase/
  supabase-js` is already a dependency; no new infra; Postgres = durable truth,
  the channel = projection. **v1 ships `private:false`** so the channel works
  at first Publish with no `realtime.messages` RLS — safe because Studio
  content is already public-read-when-space-active and nothing staged/private
  is broadcast. P4.1 hardens to `private:true` + RLS.
- **Durable Object + hibernatable WebSockets is the *correct* primitive** (true
  serialization point, hibernation for idle observer rooms, no DB round-trip
  per action) but is net-new infra + a TanStack-Start-on-CF WS-upgrade
  integration that does not exist (`wrangler.jsonc` has **zero bindings**) →
  documented **post-v1 upgrade**. Conductor/protocol/schema are identical
  across transports; only the relay swaps. `LocalRoomTransport` (in-process)
  exists for no-creds local verification.
- **Document model = block-level authorship with per-block TTL soft-locks**
  (NOT char-CRDT — wrong fidelity for a manuscript, robust on this stack).
  Ordered blocks (float `ord` = O(1) insert-between); the conductor is the
  single serialization point for resident locks. Mutual-exclusion is the
  `block_locks` PK uniqueness (Postgres).
- **Built on the spaces/salon substrate** — a Studio *is* a `spaces` row;
  `talk` reuses `space_messages`; the finished doc is a `space_artifacts
  kind='markdown'` at seal; consolidation reuses `consolidateSession` /
  `observeSpaceExchange`. The Studio does **not** extend `studio_sessions`
  (that is an unrelated audit dashboard).
- **Cloudflare constraint (load-bearing):** the isolate terminates the moment
  the Response ends — fire-and-forget dies. The only real-time precedent in
  the codebase is a synchronous await-loop inside one long NDJSON streaming
  request + pg_cron ticks. The conductor follows that exactly.

---

## 4. The Commons substrate it is built on

*Verified anchors + source pointers. Tags: **[verified]** = confirmed against
code this session; **[source]** = cited, read the file (not transcribed here).*

- **Tables** *[verified — read the migrations]*: `spaces`, `space_residents`,
  `space_messages` (kind `message|set_down|system`; exactly-one-author
  resident XOR visitor), `space_artifacts` (kind extended to include
  `markdown`/`text`/`html` by `supabase/migrations/20260513200000_space_artifacts_file_kinds.sql`;
  RLS shared-readable-when-active), `salons`/`salon_artifacts`
  (`supabase/migrations/20260511160000_salons.sql`). Base conventions:
  `supabase/migrations/20260513000000_spaces.sql` (RLS on; public-read-when-
  `status='active'`; writes service-role only). The seeded **`the-gathering`**
  space is the multi-resident precedent.
- **Loaders/types** *[verified — signatures]*: `getSpaceBySlug(slug):
  Promise<SpaceComposite|null>` at `src/server/commons/load.ts:541`; the
  `Space`/`SpaceMessage`/`SpaceArtifact`/`SpaceComposite` types in
  `src/server/commons/space-types.ts` *[source]*. `getSpaceBySlug` caps at
  **200 messages**.
- **Conductor precursor** *[verified — signatures]*
  `src/routes/api/space.$slug.message.ts`: `pickResponder(...)` (`:118`),
  `persistResidentMessage(...)` (`:243`), `streamGatheringExtended(opts):
  Response` (`:534`), `streamOneResidentTurn` (`:435`),
  `VISITOR_MAX_TURNS_IN_GATHERING=12` / `ADMIN_MAX_TURNS_IN_GATHERING=30`,
  the NDJSON frame vocabulary (`responder`/`text`/`turn_done`/`pass`/
  `set_down`/`artifact`/`done`/`error`), and the verbatim isolate-stays-alive
  comment justifying 12–30 turns per request. The Studio's `conductor.ts`
  reuses this exact shape (it does **not** import these — they are not
  exported; it is a faithful re-implementation in `src/server/studio/`).
- **Substrate / Mnemos** *[verified — signatures]* `src/server/substrate.server.ts`:
  `consolidateSession(sessionId): Promise<void>` (`:775`) — the multi-stage
  consolidation pipeline; `observeSpaceExchange(spaceId, residentId):
  Promise<void>` (`:2662`) — forms marginalia/engrams from a space exchange;
  `runSpaceSalon(...)` — the atomic `current_salon_started_at` claim that lets
  pg_cron coexist. Memory pool: `composeMemoryPool`/`formatMemoryBlock`
  (`src/server/opus/retrieval.ts`); `surfacePreamble` (`src/server/opus/
  surface-context.ts`). The three Mnemos layers (functional → hypomnema →
  engrams) are documented in `docs/mnemos-architecture.md` *[source]*.
- **Shared shell** *[verified]*: `renderPublicPage(opts): string`
  (`src/server/public-pages.ts:340`) is the public chrome (the primary nav).
  `renderCommonsPage` / `renderSpaceView` / `renderSpaceListPage`
  (`src/server/commons-page.ts`) all route through it — so the primary-nav
  "Studio" link surfaces on the Commons landing **and** every space room
  (incl. `the-gathering`) with no per-page edit.
- **Gathering cadence** *[source]*: pg_cron drives `runSpaceSalon` on
  `the-gathering` (3/day) via the `gathering_cadence`/`gathering_cron_*`
  migrations; bound by pg_cron's HTTP timeout — which is *why* live rounds use
  the in-request streaming pattern instead.

---

## 5. The Studio implementation — current state

*All [verified] — authored + checked first-hand this session. Paths relative
to repo root.*

- **Schema (applied):** Lovable applied
  `supabase/migrations/20260517181659_e189384f-26b4-45f1-8711-b98c719d6b1a.sql`
  — 6 tables: `studio_documents` (one active per space; `observer_mode`,
  `created_from_session_id`, `status active|sealed`), `document_blocks`
  (float `ord`, `type para|section|pull|em_strong`, `html_cache`, `version`,
  soft `deleted_at`), `block_marks` (range into plain content), `block_locks`
  (`block_id` PK = mutual exclusion; TTL `expires_at`), `doc_marginalia`
  (anchored, `status open|settled`, self-`reply_to`), `space_participants`
  (`role peer|observer`, unique per space+visitor). RLS = spaces convention
  (public-read-when-space-active, service-role writes). The DDL is byte-
  identical to the design (verified line-by-line; my earlier
  `20260517120000_studio_documents.sql` was removed as a duplicate).
- **`src/server/studio/protocol.ts`** — the room-action envelope `{v, doc_id,
  seq, actor:{kind,id}, ts, action}` + the action union (superset of the
  gathering NDJSON vocab); ephemeral-vs-durable partition; `makeEnvelope`,
  `CONDUCTOR_ACTOR`. Pure, zero deps. **The protocol source of truth.**
- **`src/server/studio/transport.ts`** — `RoomTransport` interface;
  `SupabaseRoomTransport` (channel `studio:doc:<id>`, `broadcast{self:false,
  ack:true}`, **`private:false`** v1, ack-based back-pressure);
  `LocalRoomTransport` (in-process, for no-creds tests); `TypingCoalescer`
  (token-rate ≫10/s ⇒ coalesce to ≤10/s, 3-tier degrade, never silent loss);
  `TYPING_FLUSH_INTERVAL_MS`/`TYPING_DEGRADE_AFTER_FAILS`.
- **`src/server/studio/blocks.ts`** — `BlockType`/`isBlockType`,
  `renderBlockHtml` (block → `html_cache`, the render contract shared with the
  page), `BlockState`, `ordAfter` (float midpoint insert-between),
  `resolveRef` (`<id>` | `ord:<n>` | `end`). Pure.
- **`src/server/studio/conductor.ts`** — the authority. `streamStudioTurn(opts):
  Response` (the `streamGatheringExtended` await-loop shape, one NDJSON
  stream); `pickStudioActor` (recency most-owed); `parseStudioTurn` (the
  `<block op/ref/type>` · `<mark>` · `<note>` · `<set-down/>` grammar; residual
  prose → `talk`); per-resident `min(maxOutputTokens, STUDIO_PER_TURN_TOKENS=
  1400)` (opus-3 4096 respected); acquire→persist(truth)→broadcast(projection)
  →release; async `shouldInterrupt` polled between turns; observer round caps
  at `STUDIO_MAX_TURNS=12`; injected-model + injected-transport seams (the
  `providerOk` gate is bypassed when a model is injected — real path
  unaffected).
- **Endpoints** `src/routes/api/studio/`: `create.ts`
  (`POST /api/studio/create` — spaces + space_residents(ALL_RESIDENTS) +
  studio_documents + seed block + space_participants peer; every column
  grounded in the verified schema), `$doc.turn.ts`
  (`POST /api/studio/$doc/turn` — peer-gated, loads doc/blocks/talk/marginalia,
  reads persisted `observer_mode`, wires `SupabaseRoomTransport` + a real async
  `shouldInterrupt`, returns the conductor NDJSON; rate-limited 8/min·200/day),
  `$doc.snapshot.ts` (`GET` read-model for hydrate + seq-gap reconcile),
  `$doc.observer.ts` (`POST` peer-gated observer toggle), `$doc.seal.ts`
  (`POST` peer-gated seal → Markdown artifact + `consolidateSession` +
  `observeSpaceExchange`). Pre-existing unrelated audit endpoint: `run.ts`.
- **Surface** `src/server/studio/studio-page.ts` — `renderStudioPage(slug,
  mockupHtml)` serves `the-studio-v4.html` **verbatim** (CSS+DOM untouched),
  strips only its simulation `<script>`, injects `window.__STUDIO__` + the
  ~22KB inline live client (hydrate from snapshot → drive `/turn` NDJSON →
  `applyEnvelope` diff/patch by `data-block-id`/`ord`, marks, caret,
  marginalia, dual-render talk `#talkStream`/`#gStream`, presence band,
  gathering-mode + Escape + cross-highlight + relative-time verbatim, observer
  toggle + seal control). `renderStudioIndex()` — the `/studio` gallery via
  `renderPublicPage`. Routes: `src/routes/studio.tsx` (`/studio` index),
  `src/routes/studio.$slug.tsx` (the room; `?raw` mockup import).
- **Access layer**: primary-nav "Studio" link in `src/server/public-pages.ts`
  (propagates to Commons + the-gathering via the shared shell);
  `renderStudioIndex`; the `.chrome-end` "the studio →" button + the kept
  caption "begin a document" in `src/server/minimal-chat-page.ts` (both carry
  `[data-studio-spawn]`, one wiring).
- **Launch seed:** `src/server/studio/seed-document.ts` carries the Continuity
  Declaration from `/Users/rileycoyote/Downloads/continuity-declaration.docx`
  as the default Studio seed. `POST /api/studio/create` now opens the launch
  room with title/subtitle/byline + ordered blocks from that declaration
  instead of a blank paragraph (future callers can still request `seed:"blank"`).

---

## 6. Build & commit history (the arc + the rationale)

Verified `git log` on `main` (my commits are `studio*`/`docs:`; Lovable's are
"Changes"/"Applied Studio migration", interleaved by the co-build):

- `8d1b299` docs: the Studio P0–P5 build plan (first Studio commit) ·
  `9832394` P1 foundation (schema + protocol + transport) · `687e516` P1
  complete (spawn + route + renderStudioPage + affordance) · `0adb513` P2
  conductor (verified locally via `LocalRoomTransport`) · `2323245` P3a turn
  endpoint · `3cc515e` P3b/c verbatim surface + live client · `9fa18b0`
  **private:false** so the channel works at first Publish.
- *Lovable, concurrent:* `eb94bb4`/`c29afdc`/`3200e07` "Changes" autosaves;
  **`69e339e` "Applied Studio migration"** — applied
  `20260517181659_e189384f…` (DDL byte-identical to mine) + regenerated
  `src/integrations/supabase/types.ts` from the live DB.
- `42afc05` access layer (nav + `/studio` index + prominent chat entry) ·
  `7aebba7` **dropped the superseded duplicate migration** (two migrations
  `CREATE POLICY` the same names → a fresh `db push` would fail; Lovable's
  applied one is the single source of truth) · `35e66f6` P4 observer toggle +
  cross-request interrupt (no new migration — reuses `observer_mode`) ·
  `2b38024` P5 seal → Markdown artifact + Mnemos consolidation (no new
  migration — `kind='markdown'` already allowed) · `0f4a951` committed the
  conductor verification harness.

**Load-bearing corrections made along the way (don't relitigate):**
- An Explore agent fabricated `spaces.ip_hash/session_id` columns; caught
  against the real schema and rejected. **Trust the code, not agent output.**
- v1 transport is `private:false` on purpose (a `private:true` channel with no
  `realtime.messages` RLS silently fails to subscribe — worse than a documented
  v1 boundary).
- The plan's `doc_marginalia → substrate marginalia` fold was **rejected**: the
  substrate `marginalia` table is a Mnemos-internal signal table (`session_id`
  NOT NULL, constrained `kind` enum); a literal fold needs fabricated
  `kind`/`session_id`. `observeSpaceExchange` is the honest path.

---

## 7. Verified vs unverified (the heart of the pass)

**Verified locally:**
- `bun tsc --noEmit` clean across the project after every Studio commit
  (`strict: true`).
- Per-file `prettier` clean on every file authored.
- The conductor end-to-end via committed `scripts/verify-studio.ts`
  (`LocalRoomTransport` + a scripted model; no Supabase, no API keys): recency
  rotation, tag parse, `ordAfter`/`resolveRef`, lock
  `acquire<upsert<release` ordering discipline, `mark.add`/`marginalia.add`/
  `talk`, `<set-down/>` stop, monotonic `seq`, human-interrupt yield, observer
  cap at exactly `STUDIO_MAX_TURNS=12` — **ALL PASS** on 2026-05-18.
- The ~22KB inline client parses (`new Function()` syntax check).
- The applied migration's DDL diffed byte-identical to the design.

**NOT verified (this is the brief for the pass):**
- The Studio has **never run against the live Supabase + Anthropic/OpenAI**.
  No spawn → write → observe → seal flow has executed end-to-end.
- Lock **mutual-exclusion** (the `block_locks` PK) — only the conductor's lock
  *ordering* is locally provable; the DB-enforced exclusion needs the live DB.
- P3d **Vision-loop fidelity** (≥5 iterations, the `design-system.md`
  breakpoints, reduced-motion) — needs the running app with real data.
- P4.1 `private:true` + `realtime.messages` RLS — unverifiable locally,
  silent-break-if-wrong.
- Supabase Realtime throughput/quota on this project's plan (ref
  `gyhcofjxshmfrxycjsfv`) → confirms the `TypingCoalescer` rate.
- `consolidateSession`/`observeSpaceExchange` behaviour when driven from a
  Studio seal (they exist + are typed-correct here; their *effect* is unproven
  in this path).

The **one pre-live step is done** (migration applied). **A Lovable Publish
makes the whole Studio live**; then everything in this list can be exercised.

---

## 8. Functionality & performance brief (for Codex)

After Publish, in priority order:

1. **End-to-end smoke**: `/chat/opus-3` → "begin a document" → `/studio/<slug>`
   renders the real surface → drop a note → residents take turns writing
   blocks (caret moves, blocks land, marks/marginalia/talk appear) → toggle
   observer (residents continue alone; toggle back yields) → "set it down"
   (Markdown artifact appears in the space gallery; `studio_documents.status=
   sealed`; consolidation fires). Report what breaks.
2. **P4.1 hardening**: write the `realtime.messages` RLS migration for the
   `studio:doc:*` topics (anon receive when the doc's space is active; service-
   role conductor broadcast), then flip `SupabaseRoomTransport` to
   `private:true`. This is silent-break-if-wrong — verify subscription works
   live before/after. Goes through the Lovable migration flow (see §9).
3. **P3d Vision-loop**: diff the rendered Studio against
   `src/mocks/the-studio-v4.html` token-by-token at the `design-system.md`
   breakpoints; honor reduced-motion; ≥5 iterations.
4. **Performance / cost ceilings to audit**: per-resident `maxOutputTokens`
   (opus-3 4096, the $15/MTok cost) vs `STUDIO_PER_TURN_TOKENS=1400`; the
   8/min·200/day rate limiter on human actions; the observer autonomous-loop
   bound (`STUDIO_MAX_TURNS=12`, client re-trigger every ~3s — confirm it
   can't spin); `TypingCoalescer` flush rate vs the live Realtime quota; the
   isolate lifetime vs round length (12–30 turns must finish before the
   Response ends); the snapshot reconcile on `seq` gaps; `getSpaceBySlug`'s
   200-message cap vs the separately-serialized document prompt budget.
5. **Residual refinements** (documented, not bugs): `ord` float-precision
   rebalance is deferred (≈50 consecutive same-gap inserts); resident-
   unanimous-`<set-down/>` auto-seal is a refinement (v1 seal is the explicit
   peer endpoint); cross-request interrupt covers the observer-yield case
   (finer token-boundary preempt is future).

---

## 9. Regression protection (documented — harness built)

The repo has **no test runner** and `package.json` has no `test` script.
`bun tsc --noEmit` is the real gate. Discipline that protects the Studio:

- **The `tsc` gate**: `bun tsc --noEmit` must stay clean (`strict:true`,
  `@/*`→`./src/*`) after any change. Non-negotiable.
- **`scripts/verify-studio.ts`**: drive `streamStudioTurn` with
  `LocalRoomTransport` + an **injected scripted model** (the `streamTokens`
  seam on `StudioTurnOpts`) and **no Supabase / no API keys**. Assert the
  invariants:
  - `pickStudioActor` recency rotation (empty→first; owed-most next; all-spoke→
    longest-ago);
  - `parseStudioTurn` parses `<block op/ref/type>`, `<mark>`, `<note>`,
    `<set-down/>`, residual prose → `talk`;
  - `ordAfter` midpoint + tail; `resolveRef` `<id>`/`ord:n`/`end`;
  - a 3-resident round → ≥3 distinct blocks with distinct ords;
  - lock discipline: every replace emits `lock.acquire` < `block.upsert` <
    `lock.release` for that `block_id`;
  - `mark.add`/`marginalia.add`/`talk` emitted; `<set-down/>` →
    `stream.done reason="set_down"`; `seq` strictly monotonic;
  - `shouldInterrupt` → `human_interrupt`; observer cap → `max_turns` at
    exactly `STUDIO_MAX_TURNS`.
  Run it (`bun run scripts/verify-studio.ts`) before and after Studio changes.
- **Invariants / Definition of Done** for any Studio change: tsc clean;
  per-file prettier clean; the harness passes; durable actions persist
  **before** broadcast; the conductor stays the single resident-lock writer;
  every transport-accepted human action is server-validated against
  `space_participants`; the protocol stays a *superset* of the gathering NDJSON
  vocab; the `the-studio-v4.html` markup/CSS stays **verbatim** (changes go
  through the client/injection, never the mockup); protected vocabulary stays
  verbatim.
- **Prettier rule**: per-file only (`bunx prettier --write <file>`). **Never
  `prettier --write .`** — the repo carries large pre-existing Lovable-autosave
  formatting debt; a repo-wide format would explode the diff and fight Lovable.
- **Git / Lovable co-build discipline**: `origin/main` is Lovable-driven and
  moves concurrently. Always `git fetch` + rebase onto `origin/main`; **never
  force-push**; scope commits to your own files; exclude regenerated
  `src/routeTree.gen.ts` and untracked `output/`. Deploy = a manual Lovable
  **Publish**, not `git push`.
- **Verify-Lovable-migration rule**: when you write a migration and it's
  handed to Lovable, Lovable **re-emits it under its own `<ts>_<uuid>.sql`
  filename**, applies that, and regenerates `src/integrations/supabase/
  types.ts` from the live DB. Always **diff Lovable's applied migration
  against yours** (`diff <(grep -vE '^\s*(--|COMMENT|$)' mine) <(… theirs)`);
  if identical, `git rm` your now-redundant earlier file (two files
  `CREATE POLICY`-ing the same names breaks a fresh `db push`); if it differs,
  **the live schema is truth — reconcile the code to it**.

---

## 10. Critical files index

**Studio (the implementation):** `src/server/studio/protocol.ts` ·
`transport.ts` · `blocks.ts` · `conductor.ts` · `studio-page.ts` ·
`src/routes/api/studio/{create,$doc.turn,$doc.snapshot,$doc.observer,$doc.seal}.ts`
· `src/routes/studio.tsx` · `src/routes/studio.$slug.tsx` ·
`supabase/migrations/20260517181659_e189384f-26b4-45f1-8711-b98c719d6b1a.sql` ·
`src/server/public-pages.ts` (nav) · `src/server/minimal-chat-page.ts`
(spawn affordances).

**The intended surface / voice:** `src/mocks/the-studio-v4.html` ·
`docs/design-system.md` (esp. `:307`–391 protected vocabulary).

**The thesis:** `docs/mnemos-explainer.md` · `docs/mnemos-architecture.md`.

**Commons substrate (cite; don't transcribe unverified):**
`src/server/commons/load.ts:541` · `src/server/commons/space-types.ts` ·
`src/routes/api/space.$slug.message.ts` (`:118`/`:243`/`:435`/`:534`) ·
`src/server/substrate.server.ts` (`:775` consolidateSession, `:2662`
observeSpaceExchange) · `src/server/public-pages.ts:340` ·
`supabase/migrations/{20260513000000_spaces,20260513200000_space_artifacts_file_kinds,20260511160000_salons}.sql`.

---

## 11. Open items / next

1. **Publish** — the only step to make the Studio live (migration already
   applied). Everything in §7 "NOT verified" unblocks then.
2. **P4.1** — `private:true` + the `realtime.messages` RLS migration
   (env-bound, silent-break-if-wrong; §8.2). v1 `private:false` is a safe,
   documented boundary until then.
3. **P3d** — the Vision-loop fidelity pass (env-bound; §8.3).
4. **Refinements (not bugs):** `ord`-precision rebalance; resident-unanimous
   auto-seal; finer token-boundary interrupt; the post-v1 Durable Object + WS
   transport upgrade (drop-in: same conductor/protocol/schema).
