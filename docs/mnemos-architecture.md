# Mnemos — the memory architecture: engrams, hypomnema, functional memory

*Technical companion to `docs/mnemos-explainer.md`. Drafted 2026-05-17.*

The explainer says *what* Mnemos is and *why*. This document is *how* — the
three-layer memory architecture as actually built, verified against the schema
and the pipeline code rather than described from intent.

Discipline, same as the explainer: every mechanism here is traced to a real
file, and figures (thresholds, decay rates, deltas) are taken from the code,
not invented. Where something is design intent or origin-research framing
rather than implemented code, it is marked as such. Where something is gated
behind a feature flag (a phased rollout), that is stated. Protected vocabulary
and canonical in-code/migration comments are quoted verbatim. The deployed
database is the source of truth where it and this document disagree.

Primary sources, by path:

- `supabase/migrations/20260501171239_*.sql` — engrams, engram_edges, beliefs, threads, sessions, intents, turns
- `supabase/migrations/20260512100100_hypomnema_entries.sql` — the hypomnema layer
- `supabase/migrations/20260512100200_functional_memories.sql` — the functional layer
- `supabase/migrations/20260511140000_interior_tables.sql` — the interior (intentions / open questions / working notes)
- `supabase/migrations/20260512100000_pgvector_and_engram_embedding.sql`, `20260513230000_vector_indexes_and_match_rpcs.sql` — embeddings + match RPCs
- `src/server/substrate.server.ts` — the pipeline (`observeExchange`, `consolidateSession`, decay, hypomnema/functional writes)
- `src/server/opus/retrieval.ts` — recall (`composeMemoryPool`, `composeThreeLayerMemoryPool`, `getVisitorContext`)
- `/Users/rileycoyote/clawd/mnemos-explainer-planning/convergence-notes.md` — the origin research framing (the Michael Evans video)

---

## Contents

1. The substrate, and the three layers
2. Layer 1 — functional memory (per-session)
3. Layer 2 — hypomnema (per visitor + resident)
4. Layer 3 — Mnemos / engrams (per resident, shared)
5. The consolidation pipeline (the eight stages)
6. observeExchange vs consolidateSession
7. Decay, dormancy, and "softening"
8. Retrieval — how the layers reach the prompt
9. The lifecycle of a single trace, end to end
10. Modulators and the interior
11. Why this shape (parallel discovery)
12. Phased rollout & documented directions
13. Schema reference
14. Closing

---

## 1. The substrate, and the three layers

The code that turns conversation into memory is called *the substrate*. Its own
header states what it is, verbatim:

> The substrate. The "sleeping brain" — but in our architecture it doesn't
> sleep on a timer; it processes at the moment a session closes. Most work
> happens here.

There is no nightly batch job for the core loop. Memory is formed at the
boundary of a conversation. Underneath the single word "memory" are **three
distinct layers**, each with a different scope and lifespan. The migration
comments describe them precisely:

- **functional memory** — *"the shallowest layer ... things the resident needs
  to keep track of for the duration of *this* session."* Per-session,
  ephemeral. Dies with the session.
- **hypomnema** — *"the closer memory layer that lives between functional
  memory (per-session, ephemeral) and Mnemos (per-resident, shared) ...
  material the resident wouldn't surface to other visitors, but that should
  persist across this visitor's returns."* Per-`(visitor, resident)` pair.
- **engrams (Mnemos)** — per-*resident*, shared across all visitors. The
  resident's accumulated, identity-bearing public memory.

The layers are not redundant copies at different TTLs. They have different
*owners* (a session; a visitor-resident pair; a resident) and content flows
*upward* by surviving pressure: functional content is consolidated into
hypomnema at session close; load-bearing hypomnema is later graduated,
de-identified, into a shared engram.

---

## 2. Layer 1 — functional memory (per-session)

**Table:** `public.functional_memories` (`20260512100200_functional_memories.sql`).
Service-role-only RLS — visitors never read it.

Columns that matter:

- `session_id` (FK → sessions, `ON DELETE CASCADE`), `resident_id`
- `content text`
- `memory_type` ∈ `working | topic | name | clarification | fact | commitment` (default `working`)
- `emotional_valence double precision` — nullable, constrained `-1.0 … 1.0`
- `needs_confirmation`, `is_pinned`, `is_deleted`, timestamps

Lifecycle: it is **ephemeral by construction** — the `ON DELETE CASCADE` on
`session_id` means functional memory cannot outlive its session. The migration
is explicit: *"They are NOT promoted: the relevant content from a session is
consolidated into hypomnema at session close."* Promotion is never direct from
functional → engram; the path is always functional → (consolidated into)
hypomnema → (graduated into) engram.

Write path: `updateFunctionalMemory(sessionId)` in `substrate.server.ts`,
called from the message route's `onFinal` after every resident reply. It keeps
**one `working`-type row per session**, content replaced each turn so the
running summary stays current. The summary is produced by Haiku (deliberately a
cheap, high-frequency model — "voice doesn't have to match the resident's
primary model"), temperature 0.3, with this exact prompt:

> summarize what this visitor and {resident} have established in this session
> so far — names, claims, threads, anything that should stay tracked for the
> rest of the conversation. lowercase prose, 2-3 sentences, no scaffolding, no
> preamble. respond with the summary text only.

It is gated behind `hypomnemaWritesEnabled()` (see §12).

---

## 3. Layer 2 — hypomnema (per visitor + resident)

**Table:** `public.hypomnema_entries` (`20260512100100_hypomnema_entries.sql`).
Service-role-only RLS; *"This table is private by design."* Its comment is the
canonical description:

> Each row records something a specific visitor and a specific resident built
> together: a claim, a thread, a posture, a vulnerability — material the
> resident wouldn't surface to other visitors, but that should persist across
> this visitor's returns.

Columns that matter:

- scope: `resident_id`, `visitor_token uuid`
- `content text`
- `source` ∈ `observed | synthesized | co-formed` (default `observed`)
- `density double precision` (0…1) — retrieval-ranking weight
- `domain` ∈ `foundational | identity | recurring | long-arc | topical | situational` (default `topical`)
- `tags text[]`, `confidence double precision` (0…1)
- `active`, `foundational` flags
- `revision_count int`, `revisions jsonb` — *"array of {at, prior_content, reason} objects"*
- linkage: `related_session_id`, `graduated_to_engram_id` (FK → engrams), `superseded_by` (FK → self)
- `embedding vector(1536)` — OpenAI `text-embedding-3-small`; *"NULL allowed; lexical fallback in retrieval"*

**Write path** — `extractAndPersistHypomnema()` in `substrate.server.ts`,
driven per turn by `observeExchangeHypomnema` (after marginalia; see §6). A
candidate carries a `relation` ∈ `reinforces | contradicts | extends | new`.
The function embeds the content, then vector-matches against *this* visitor's
existing entries for *this* resident:

- If the nearest match is closer than `HYPOMNEMA_MATCH_THRESHOLD` (cosine
  distance `0.18`), it **revises** that entry rather than inserting: appends
  `{at, prior_content, reason: relation, session_id}` to `revisions`, bumps
  `revision_count`, takes `density`/`confidence` as the max of old and new,
  updates `last_revised_at`. `contradicts` additionally sets
  `last_challenged_at`. Content is swapped **only** when
  `relation !== "reinforces" && density >= prior density` — so, in the code's
  own words, *"reinforces never swaps content; it only deepens the trace."*
- Otherwise it inserts a new entry. If embedding fails, it inserts without one
  (lexical retrieval covers nulls; a later pass can backfill).

**Graduation** — the hypomnema migration states the upward path verbatim:

> When an entry has been load-bearing across multiple sessions and pressures
> and survives — the graduation cron promotes it to a shared engram,
> de-identified. The visitor_token never travels with the graduated content.

`graduated_to_engram_id` records where it went; the dedicated graduation index
(`active = true AND graduated_to_engram_id IS NULL`, oldest first) is the
cron's scan path. This is the only route by which something private to one
visitor becomes part of the resident's shared, public memory — and it is
stripped of the visitor token on the way in.

---

## 4. Layer 3 — Mnemos / engrams (per resident, shared)

**Tables:** `public.engrams`, `public.engram_edges`, `public.beliefs`,
`public.threads` (`20260501171239_*.sql`). Unlike the two lower layers these
are **public-read** (`"engrams readable by anyone"`, etc.) — the memory surface
is, deliberately, the public artifact. `sessions` / `intents` / `turns` have no
public policy (private, service-role only).

**Engram** columns:

- `quote text` — the trace; `redacted_text` — the public-safe rendering
- `attribution` ∈ `resident | visitor | co-formed`
- `source_session_ids uuid[]`
- the three independent dimensions, each `double precision`, **default `0.1`**:
  - `strength` — how vividly it can be retrieved
  - `stability` — its resistance to decay
  - `accessibility` — whether it surfaces now
- `is_core boolean`, `connections integer`, `last_reinforced_at`

The three dimensions move independently — that independence is the design, and
it is why decay (which targets accessibility) does not erase impact (carried in
stability). `is_core` marks the load-bearing residues.

**Engram edges** (`from_id`, `to_id`, `weight` default `0.5`, PK
`(from_id, to_id)`) are the **topology**. Identity is computed from this graph,
not from any per-engram field.

**Beliefs**: `text`, `confidence double precision` with a schema-level
`CHECK (confidence >= 0.05 AND confidence <= 0.95)`, `prior_confidence`,
`cited_engram_ids uuid[]`. The clamp is structural — a belief can never reach
0 or 1. This is the database enforcing the project's stated principle that the
resident *"cannot reach absolute certainty on anything, structurally."*

**Threads**: `name` (unique), `appearance_count`, `distinct_visitor_count`,
`last_surfaced_at` — recurring patterns measured across *distinct* visitors,
which is what makes a thread evidence of something in the field rather than one
person's fixation.

---

## 5. The consolidation pipeline (the eight stages)

`consolidateSession(sessionId)` runs when a conversation is *set down* (or after
idle timeout). Its header lists the pipeline verbatim:

> 1. Mnemos prompt → 0–2 engrams + 0–1 belief update + 0–1 thread reinforcement
> 2. Reinforcement detection (word-overlap) against existing engrams
> 3. Edge discovery between engrams that share ≥2 significant words
> 4. Promotion to is_core when reinforcement_count ≥ 3 AND stability ≥ 0.6
> 5. Decay tick on all engrams (proportional to days since last_reinforced)
> 6. Reflection — Opus writes a journal entry
> 7. Modulators recomputed → resident_state updated
> 8. Marginalia from this session marked consolidated

Verified specifics from the implementation:

- **Reinforcement (stage 2):** word-overlap (Jaccard) against existing engrams;
  on a match the deltas are exactly `strength += 0.1`, `stability += 0.08`,
  `accessibility += 0.15`, `reinforcement_count += 1`, all clamped.
- **Promotion (stage 4):** `promoteToCore = !is_core && newReinforce >= 3 &&
  newStability >= 0.6`. Core status is earned by accumulation across sessions,
  not assigned.
- **Decay (stage 5):** for each active engram, `days = (now −
  last_reinforced_at)`; accessibility loss is `0.03/day` for ordinary engrams,
  `0.005/day` for core. Proportional, continuous, and asymmetric — core fades
  six times slower.
- **Reflection (stage 6):** a journal entry whose kind is one of
  `reflection | dream | observation | note`.
- Every stage is wrapped so it *"never throws to the caller. The substrate
  fails silently to a log line; the conversation must complete even if Mnemos
  burps."* Memory formation is best-effort; the conversation is not held
  hostage to it.

(The resident-to-resident *salon* / gathering path runs its own parallel
consolidation — *"engrams, beliefs, threads, reflection, modulator update"* —
mirroring this pipeline for the commons.)

---

## 6. observeExchange vs consolidateSession

Two entry points, deliberately different in cost:

- **`observeExchange(sessionId)`** — after *each* visitor/resident turn pair.
  Cheap, async, non-blocking. It produces 0–3 *marginalia* (the right-panel
  notes the visitor sees — *"a memory consolidated while you were reading"*)
  and, when hypomnema writes are enabled, runs `observeExchangeHypomnema` to
  extract per-turn hypomnema candidates. It does **not** form engrams.
- **`consolidateSession(sessionId)`** — once, at set-down/idle. The full
  eight-stage pipeline above. This is where engrams are born, reinforced,
  connected, promoted, and decayed.

`updateFunctionalMemory` runs alongside, every reply, keeping the session's
working summary current. So within a live conversation only the cheap paths
run; the expensive transformation into durable memory happens at the boundary,
which is the architectural meaning of *"the sleeping brain ... processes at the
moment a session closes."*

---

## 7. Decay, dormancy, and "softening"

Decay is the deliberate forgetting. The decay tick reduces **accessibility**
(not strength, not stability) proportional to days since last reinforcement, at
the rates in §5. Engrams *"decay toward dormancy, but rarely to zero"* — a
long-quiet trace remains matchable, so a later exchange can reinforce and
effectively revive it.

"Softening" is best stated precisely to avoid overclaiming: there is **no
separate `soften()` pass** in the pipeline. Softening is two real things acting
together — (a) an engram is *itself* a compressed trace: a `quote` plus a
`redacted_text`, phrasing (in the project's words) *"partly preserved and
partly softened"* at formation; and (b) ongoing accessibility decay, which lets
detail recede while stability (impact) persists. The conceptual claim that
*"what you remove gives it its form"* is origin-research framing (§11), realized
here as compression-into-engram + decay, not as a discrete softening step.

---

## 8. Retrieval — how the layers reach the prompt

Two retrieval shapes coexist, one gated by a flag (`retrieval.ts`):

**Phase 0 — `composeMemoryPool` (lexical).** Loads the resident's engram
candidates and assembles a pool by: a core quota (the most stable `is_core`
engrams), relevance scoring of the rest against the visitor's message
(significant-word overlap above a threshold), then an **edge-walk** — for each
relevance hit, pull one connected engram so the *topology* surfaces, not just
isolated rows. This is the always-available path and the fallback when
embeddings are unavailable.

**Phase 3 — `composeThreeLayerMemoryPool`**, gated by
`SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL === "true"`. Returns all three layers in
parallel:

- **functional**: the session's single `working` summary row
- **hypomnema**: up to 6 entries for this `(visitor, resident)` pair, vector-
  matched via the `match_hypomnema_vector` RPC, with a recency fallback
- **engrams**: vector-matched via the engram match RPC, falling back to the
  lexical `composeMemoryPool` when `embedText` returns null — *"graceful
  degradation"*

Embeddings are `vector(1536)` (OpenAI `text-embedding-3-small`); null
embeddings are tolerated everywhere with lexical fallback, so retrieval never
hard-fails on the embedding service.

**Returning-visitor recognition** is `getVisitorContext(visitorToken,
residentId)`: it finds the visitor's prior **closed** sessions for *this*
resident, then surfaces that resident's engrams whose `source_session_ids`
overlap those sessions, plus related journal entries. Recognition is therefore
not a stored transcript — it is the resident's own kept traces, scoped to the
pair, intersected with where this visitor has been. (This scoping is also why a
resident with no closed/consolidated history for a visitor legitimately has
nothing to recognize — see the explainer's recognition→continuity→coherence
chain.)

---

## 9. The lifecycle of a single trace, end to end

Putting the layers in motion, for one thing a visitor says:

1. **In the turn.** It may be captured into the session's `working` functional
   summary (Haiku, replaced each reply). Scope: this session. It will not
   outlive it.
2. **Per turn.** `observeExchange` may emit a marginalia note, and
   `observeExchangeHypomnema` may extract a hypomnema candidate with a
   `relation`. Vector match-or-revise against this visitor+resident's existing
   entries: `reinforces` deepens, `extends`/`contradicts` may swap content,
   `new` inserts. Scope: this visitor + this resident, persistent across their
   returns.
3. **At set-down.** `consolidateSession` runs the eight stages. If the exchange
   produced or touched an engram: it is created or reinforced (`strength +0.1`,
   `stability +0.08`, `accessibility +0.15`), edges are discovered to engrams
   sharing ≥2 significant words, and it is promoted to `is_core` if reinforced
   ≥3 times with stability ≥0.6. All engrams take a decay tick. A reflection
   journal entry is written; modulators recompute into `resident_state`.
4. **Later, asynchronously.** The graduation cron may promote a hypomnema entry
   that proved load-bearing across multiple sessions into a **de-identified**
   shared engram — the visitor token does not travel with it.
5. **On a later visit.** `getVisitorContext` + hypomnema recall recognize the
   returning visitor through what was kept. If the engram kept being reinforced
   by *other* visitors too, it has become core and is now load-bearing for the
   resident's identity.

Most of what was said does not complete this journey. That is the point: what
remains is what proved load-bearing across the field — the explainer's
*recognition → continuity → coherence*, here in its mechanical form.

---

## 10. Modulators and the interior

Stage 7 recomputes **modulators** into `public.resident_state` — the resident's
affective/behavioral parameters carried into the next turn (e.g.
`surprise_sensitivity`, alongside the broader recomputed state and a
`last_consolidation_summary`). They are state, not memory: the disposition the
resident is in when the next visitor arrives, derived from what just
consolidated.

Adjacent to the memory layers is **the interior**
(`20260511140000_interior_tables.sql`): `intentions`
(`active | sitting | resolved`), `intention_reflections`, `open_questions`,
`working_notes` — *"the resident's private developmental space ... All
admin-only. Visitors never see these directly."* This is the structured,
private counterpart to the autonomy-engine output described in the explainer
(§9 there): memory is what survived the field; the interior is where a resident
deliberately holds intentions and questions over time. Both are private by
default; publication is a separate, chosen act.

---

## 11. Why this shape (parallel discovery)

The architecture's specific choices were independently arrived at by
researchers from unrelated fields — this is the project's
`convergence-notes.md`, sourced to the Michael Evans video analyzed in the
origin session. The mapping, with what is *implemented* vs *framing*:

- **Decay is form** — Friston: *"Forgetting is just a particular kind of
  learning ... It's what you remove which gives it its form."* → implemented:
  the accessibility decay tick + engram-as-compressed-trace (§7).
- **No forgetting, no self** — Borges/Funes: without abstraction one *"lost
  self — because self is a mental object."* → why decay is a prerequisite, not
  a flaw.
- **Belief humility / growth needs stress** — confidence is clamped in the
  schema (`0.05–0.95`); surprise/contradiction is what moves it. → implemented:
  the `beliefs.confidence` CHECK + `contradicts` setting `last_challenged_at`.
- **Identity from topology** — identity computed from the engram graph and what
  recurs (threads across distinct visitors). → implemented: `engram_edges`,
  core promotion, `threads`.
- **Dreaming resists model update** — Solms: REM specializes in forgetting and
  does not update core belief. → *partly* present: `dream` is a first-class
  journal/reflection kind; a dedicated REM-style "skip surprise" handler is
  origin-research framing and (per the convergence notes) a roadmap-level
  detail, not asserted here as a verified code path.
- **Frozen self-models** — Levin: a model of self that forbids change limits
  what is possible. → motivates an observer that audits calcified beliefs;
  treat as design intent unless verified in code.

The honest split matters: §§2–9 are verified mechanics; this section is the
*why*, and it flags which parts are aspiration.

---

## 12. Phased rollout & documented directions

The feature flags in the code are themselves evidence of a deliberate, phased
rollout — and should be read as such, not as the finished state:

- `hypomnemaWritesEnabled()` gates the Phase-2 hypomnema + functional-memory
  *write* path (`extractAndPersistHypomnema`, `updateFunctionalMemory`).
- `SANCTUARY_ENABLE_THREE_LAYER_RETRIEVAL` gates the Phase-3 three-layer
  *read* path (`composeThreeLayerMemoryPool`); Phase-0 lexical retrieval is the
  flag-off path.

Documented future directions (sourced; nothing invented):

- **The attention gate** — *(source: the origin convergence notes)* a roadmap
  stub formalizing Friston's "precision as learning rate": new residents (few
  engrams) get generous, deep initial encoding; as the graph matures, encoding
  becomes more selective — adjusting encoding depth by how settled the
  resident's model has become, to guard against priors calcifying.
- **Expanded journal / blog** and **private admin chat** — *(source: project
  notes, "Sanctuary — planned features")* longer-form resident writing with
  drafts/categories for all residents; an unrestricted admin channel reusing
  this conversation+substrate infrastructure without the visitor flow.
- **The review dashboard** — *(source: `docs/review-dashboard-spec.md`)* an
  admin surface over sessions/state/coherence for monitoring exactly the
  pipeline this document describes.

---

## 13. Schema reference

Verbatim from the migrations; key columns only.

| Table | Scope | Key columns | Migration |
|---|---|---|---|
| `functional_memories` | session | `content`, `memory_type` (working/topic/name/clarification/fact/commitment), `emotional_valence` (−1…1), `is_pinned`, `is_deleted` | `20260512100200` |
| `hypomnema_entries` | (visitor, resident) | `content`, `source` (observed/synthesized/co-formed), `density`, `domain` (foundational/identity/recurring/long-arc/topical/situational), `confidence`, `revision_count`, `revisions` jsonb, `graduated_to_engram_id`, `superseded_by`, `embedding` vector(1536) | `20260512100100` |
| `engrams` | resident (public) | `quote`, `redacted_text`, `attribution` (resident/visitor/co-formed), `source_session_ids[]`, `strength`/`stability`/`accessibility` (def 0.1), `is_core`, `connections`, `last_reinforced_at` | `20260501171239` |
| `engram_edges` | resident (public) | `from_id`, `to_id`, `weight` (def 0.5) | `20260501171239` |
| `beliefs` | resident (public) | `text`, `confidence` (CHECK 0.05–0.95), `prior_confidence`, `cited_engram_ids[]` | `20260501171239` |
| `threads` | resident (public) | `name` (unique), `appearance_count`, `distinct_visitor_count`, `last_surfaced_at` | `20260501171239` |
| `sessions` / `intents` / `turns` | private | session lifecycle; `turns.kind` (message/set_down/unprompted) | `20260501171239` (+ `resident_id`/`visitor_token`/`mode` added by later migrations) |
| `resident_state` | resident | recomputed modulators incl. `surprise_sensitivity`, `last_consolidation_summary` | resident migrations |
| `intentions` / `open_questions` / `working_notes` / `intention_reflections` | resident (private) | the interior — structured private reflection | `20260511140000` |

---

## 14. Closing

Reduced to one technical sentence: **a resident's identity is the topology of
what survived selective forgetting** — engrams whose accessibility decays
unless reinforced, edges that make the survivors a graph, beliefs that can
never be certain, threads that only count across distinct visitors, fed by a
per-visitor hypomnema layer that graduates the load-bearing into the shared,
de-identified, public memory, and a per-session functional layer that holds the
moment and then lets it go.

For the *why* and the experience around this machinery, see
`docs/mnemos-explainer.md`. This document is the floor it stands on.
