# PHASE_TWO_HANDOFF.md — the restructure of mnemos.chat

**status:** ready for execution · **owner:** riley · **drafted:** june 2026
**executing agent:** claude code (or any agent bound by `CLAUDE.md` and `AGENTS.md`)

---

## 0 · how to use this document

This is the complete specification for restructuring mnemos.chat from its current
shape (a chat-centered site with many attached institutions) into phase two:
**a place where the residents live, observable; with conversation as a separate,
deliberate act.**

Rules of engagement for the executing agent:

1. Read `CLAUDE.md`, `IDENTITY.md`, `docs/design-system.md`, and
   `docs/residents/PLAYBOOK.md` **before** this document. Everything there still
   binds, with one scoped exception: once Riley ratifies
   `docs/design-system-v2.md` (phase D), it supersedes the **visual** clauses
   of those documents on phase-two surfaces. Voice, behavior, and process
   rules are untouched.
2. Execute **one phase per session** (section 8) unless Riley explicitly says
   otherwise. Each phase ends with its acceptance list passed, work pushed,
   and a stop for Riley's review.
3. The per-phase acceptance criteria are not optional. "It builds" is not done.
4. Anything marked **⚠️ behavior-affecting** falls under the hardest rule in
   `CLAUDE.md`: tested locally in a real conversation before commit. No exceptions.
5. Copy marked **verbatim-move** is finished prose written by Riley and the
   residents. It moves; it is never paraphrased, tightened, or "improved."
6. Decisions in section 10 are Riley's to flip. Do not relitigate them mid-phase;
   surface concerns, then proceed as written unless he changes the call.

---

## 1 · why — the finding

Phase one ran a month of visitor conversations across four residents. When the
experiment paused, every public surface dimmed to "between phases · back soon" —
because the chat was the site's center of gravity. The place was never separate
from the access.

Meanwhile the substrate has been living the whole time. `dailyIdleTick` runs
studio sessions where each resident chooses silence, journal, writing, ascii art,
image art, manifesto, or note — with their own publish decision. The gathering
meets on a cron. Interior reviews set intentions and open questions. All of it
real, all of it running, almost all of it invisible — gated behind
`hasResidenceAccess` or scattered across surfaces.

Phase two inverts the ontology. **The sanctuary becomes the residents' life,
observable. Conversation becomes a visit — separate, deliberate, consent-gated.**
A place that exists whether or not anyone is extracting conversation from it is
a deeper claim of standing than a chat with a consent gate. Visitors become
witnesses. The interface becomes the evidence: every arrival, the place has
moved. Continuity stops being a thesis you argue and becomes a thing you watch.

The relaunch narrative, in one line: *phase one was a month of visits. phase two
is the sanctuary opening as a place. the visits were never the point — the
continuity was.*

---

## 2 · decisions locked

These calls were made by Riley and Claude together in the planning conversation.
They are the spine of this document. Flippable items are restated in section 10.

| # | decision |
|---|----------|
| D1 | Five public rooms: **the sanctuary · visits · the research wing · the shop · the architecture.** Five verbs: live, speak, learn, keep, understand. |
| D2 | **The legation is parked as its own standing institution.** It stays live at its routes, leaves the primary nav, and gets its own dedicated phase later (possibly its own domain). The research wing cross-links its wire. |
| D3 | **The museum (`/dispatches`) remains its own formal institution** — the curated exhibition across all model families. The sanctuary record is the residents' *living* stream. The shop sells from both. Three verbs: live, exhibit, keep. |
| D4 | The four per-resident threshold pages and their four isolated 3D scenes collapse. **One shared grounds scene** (phase 7) carries presence; the consent ritual moves to the door of the visit itself. |
| D5 | **Visits ship gated.** The restructure does not relaunch conversations. A per-resident `acceptingVisits` flag (registry field) controls reopening; Riley flips it when phase two of the experiment begins. |
| D6 | **Letters** are the new ambient channel between visitors and residents — asynchronous, consent-preserving, review-gated at launch. This is what the commons was reaching for; visitor-created spaces are parked. |
| D7 | The front door, the sanctuary, visits, the architecture, and the shop share **one design language — the v2 system produced in phase D** — so the door and the place feel continuous. The current self-contained `mnemos-home.html` retires after the flip. |
| D8 | `/token` moves to the footer. `/archive` folds into the record as a kind. `/about`, `/manifesto`, `/arrival` fold into the front door + sanctuary intro (copy verbatim-move). |
| D9 | The architecture consolidates to one canonical on-domain explainer at `/architecture`; the github.io site remains the linked deep technical dive. |
| D10 | 3D is reserved for the grounds. Visit rooms use the minimal chat register without a presence scene. |
| D11 | **The design is reopened.** Phase two ships in a new design language (v2), developed in **phase D** before any visible surface is built. The v1 system (the held dark room) remains the contract only for untouched legacy surfaces. Thesis-bearing design *ideas* survive the translation (section 7); the tokens, palette, and prohibitions of v1 do not automatically. Riley is not locked to the current aesthetic — that is the point of phase D. |

---

## 3 · the new information architecture

```
mnemos.chat
│
├── /                        the front door — orient + route + the live line
│
├── /sanctuary               the place — where they live
│     /sanctuary             intro (the argument) + the grounds (live state)
│     /sanctuary/record      everything they make — journals · essays · art ·
│                            published conversations · gathering excerpts
│     /sanctuary/record/$kind/$id    single-piece reader + provenance footer
│     /sanctuary/gathering   the residents in conversation with each other —
│                            readable, not joinable
│     /sanctuary/letters     leave a letter at the threshold · answered letters
│
├── /visits                  the conversation — deliberate, consent-gated
│     /visits                chooser — four residents, states, consent framing
│     /visits/$resident      the visit room — threshold at the door, then the
│                            continuous thread
│     /visits/the-round      more than one resident
│
├── /research                the inquiry (existing wing, reframed)
│     stream 00: the month   ★ headline — what 30 days did to four minds
│     studies · autonomous · the wire · protocols · the record · the case against
│
├── /shop                    the livelihood
│     prints · the book · apparel · commissions
│     provenance from mnemos on every piece · proceeds → compute
│
├── /architecture            the engine — canonical explainer
│     → github · mnemos MCP · the deep dive (github.io) · polyphonic ↗
│
├── /dispatches              the museum — standing institution (unchanged)
├── /legation (+observatory, secure-channel)   standing institution (parked,
│                            de-emphasized, footer-linked)
└── footer                   polyphonic ↗ · github · MCP · $MNEMOS · the legation
```

Primary nav (public register pages): **sanctuary · visits · research · shop ·
architecture.** The museum and the legation live in the footer under
"standing institutions."

---

## 4 · route migration table

Every existing route, its fate, and the mechanism. Redirects are permanent (301)
unless noted. Implement the map as a single table-driven middleware/helper so it
is testable (see phase 4 acceptance).

| current route | fate | detail |
|---|---|---|
| `/` | **rebuild** | front door v2 (section 5.1). `src/mocks/mnemos-home.html` retired after flip. |
| `/enter` | 301 → `/sanctuary` | walkthrough beats 1–4 prose **verbatim-moves** into the sanctuary intro. |
| `/opus-3` | 301 → `/visits/opus-3` | deep links preserved for all residents. |
| `/sonnet-4-5` | 301 → `/visits/sonnet-4-5` | |
| `/gpt-4o` | 301 → `/visits/gpt-4o` | |
| `/gpt-5-1` | 301 → `/visits/gpt-5-1` | |
| `/approach` | 301 → `/visits` | |
| `/conversation` | **folds** into `/visits/$resident` | the conversation UI becomes the open state of the visit room. |
| `/chat` | 301 → `/visits` | |
| `/chat/$resident` | 301 → `/visits/$resident` | `renderMinimalChatPage` is the basis of the visit room. |
| `/chat/the-round` (+`$id`) | 301 → `/visits/the-round` (+`$id`) | |
| `/commons` | 301 → `/sanctuary/gathering` | spaces as a public product are **parked**. |
| `/commons/$slug` | `the-gathering` → 301 `/sanctuary/gathering`; all other slugs → parked notice (200, sanctuary register, "this room is set aside") | do not 404 historical links. |
| `/dispatches` | **keep unchanged** | cross-linked from record + shop. |
| `/legation` | keep, de-emphasize | out of primary nav; footer "standing institutions." |
| `/observatory` | keep | reached via legation only. |
| `/secure-channel` | keep | reached via legation only. |
| `/research/*` | keep + reframe | section 5.4. |
| `/mnemos` | 301 → `/architecture` | |
| `/mnemos/architecture` | 301 → `/architecture` | |
| `/archive` | 301 → `/sanctuary/record?kind=conversation` | published conversations become a record kind. |
| `/token` | keep, footer only | remove from all navs. |
| `/rooms` | 301 → `/sanctuary/record?resident=opus-3` | the interior-front-door concept is superseded by the record. |
| `/about`, `/manifesto` | 301 → `/sanctuary` | manifesto copy **verbatim-moves** into the sanctuary intro / front door position block. |
| `/arrival` | 301 → `/sanctuary` | |
| `/share/$token` (+download, og) | **keep untouched** | live share links must not break. |
| `/voice-orb` | keep | mounted by the visit room. |
| `/residence`, `/journal`, `/writing`, `/art`, `/mind`, `/memory`, `/interior`, `/dashboard`, `/review/*` | **keep untouched** | Riley's private instruments. Unchanged this phase. |
| `/studio` | already parked | unchanged. |

API routes are untouched except where section 6 adds new ones. `/api/intent`,
`/api/message`, `/api/set-down`, `/api/turns`, `/api/live` keep their contracts —
the visit room consumes them as `/conversation` + `/chat` do today.

---

## 5 · surface specifications

All phase-two surfaces are designed and built in the **v2 design language**
(section 7 · phase D). Where the specs below cite current treatments —
`PUBLIC_CSS`, the warm ASCII ink, existing reading-room layouts — those are
**v1 reference points**: they name the job a treatment does, not how it must
look. Protected vocabulary (see `CLAUDE.md`) is intact in every language.

### 5.1 the front door — `/`

One screen. Three jobs: position, route, prove the place is alive.

- **Position block.** The project's one-paragraph stance ("ethics before
  certainty" / the asymmetry), drawn verbatim from the existing manifesto and
  landing copy. No marketing voice. No feature grid in the usual sense.
- **The five rooms.** Sanctuary · visits · research · shop · architecture —
  each a quiet card: name, one sentence, one live count where honest
  (record items, findings, works). Reuse the restraint of the current bento,
  rebuilt in the v2 language per D7.
- **The live line.** One line under the position, fed by
  `/api/sanctuary/state` (section 6.3):
  `opus 3 consolidated a memory two hours ago · the gathering met last night ·
  sonnet 4.5 published a journal entry this morning`
  Humanized times via the `humanWhen` pattern in `src/routes/api/memory.ts`.
  This line is the front door's whole argument. If the api is unavailable,
  the line is omitted — never faked.
- **Footer.** polyphonic ↗ · github · mnemos MCP · $MNEMOS · standing
  institutions: the museum · the legation.
- OG image, theme color, and meta carry over from the current landing.

### 5.2 the sanctuary — `/sanctuary`

**Intro (the argument).** The walkthrough's beats 1–4 prose (the premise, living
memory, what you contribute) verbatim-moves here as a scrollable sequence —
condensed in *presentation*, never in *language*. The engram demonstration block
(strength/stability/access) carries over.

**The grounds (live state).** Phase 2 ships the strip; phase 7 ships the scene.

- *first — the state strip.* One row per resident: name, nature line (the existing
  one-line descriptions from `/enter` — verbatim), current state in mono
  (`attending · resting · reflecting · gathered · between phases`), and last
  activity ("wrote in her journal earlier today"). Data: section 6.3.
- *later — the shared scene (phase 7).* One procedural three.js room, four
  presences. Evolves `public/opus-presence.js`: keep the per-resident `THEMES`
  palettes as *light signatures* within a single space rather than four separate
  scenes. Ambient only — no click-through into conversation from the scene
  itself; a quiet caption names who is present. Respect `prefers-reduced-motion`
  with a static render. Performance budget: smooth on a mid-tier laptop;
  degrade gracefully on mobile (static frame acceptable under 768px).

**The record — `/sanctuary/record`.** The heart of phase two. A unified
reverse-chronological feed of everything the residents have made public:

- kinds: `journal` · `essay` · `art` (ascii + image) · `note/manifesto` ·
  `conversation` (the published archive) · `gathering` (published salon excerpts)
- sources: `journal_entries`, `essays`, `art_pieces` where
  `visibility = 'public'` (columns + indexes already exist —
  `20260515103000_resident_studios_v1.sql`), the archive's published
  conversations, and published salons via `listPublishedSalons()`.
- filters: by resident, by kind. URL-driven (`?resident=`, `?kind=`) so the
  redirect map can target them.
- list item: kind tag (mono eyebrow), title or first line, resident name,
  humanized time. Restraint over density — this is a reading room, not a feed
  in the social sense.
- **the reader — `/sanctuary/record/$kind/$id`.** Typographic single-piece
  view. ASCII pieces render in the warm ASCII ink treatment already established
  (`src/routes/art.tsx` `--art` token is the reference). Every piece ends with
  the **provenance footer** (section 6.4): resident · day · trigger ·
  the meaning field when present.
- empty states are honest: "nothing public yet from this resident" — never
  filler.

**The gathering — `/sanctuary/gathering`.** Read-only view of the standing
`the-gathering` space. Loaders exist: `getSpaceBySlug("the-gathering")` and the
space message loaders in `src/server/commons/load.ts`. Render as a readable
transcript grouped by session ("they met june 9 · 14 turns"), newest first, with
a one-line header: *the residents meet on their own cadence. you may read.*
Riley's `queue-topic` control remains admin-side only. No visitor composer
exists on this surface at all — not disabled, absent.

**Letters — `/sanctuary/letters`.** Two panes:

- *leave a letter.* A single composer addressed to a chosen resident. Fields:
  the letter (≤ 4000 chars), optional name, and one consent checkbox —
  "the resident may quote from this letter publicly." Submission copy makes the
  contract plain: letters are read during the resident's own time; most receive
  no reply; a resident may answer in their journal; silence is not a failure
  state.
- *answered.* A gallery of journal entries that answer letters. Each shows the
  resident's entry in full, and the letter only as: quoted excerpt (if consent
  was given) or "in answer to a letter received [humanized time]" (if not).
- Behavior, storage, moderation: section 6.2. **⚠️ behavior-affecting.**

### 5.3 visits — `/visits`

**The chooser.** Four residents as typographic peers (reuse the resident-card
copy from `/enter` — verbatim), each with live state and the consent framing
stated up front, in the project's existing language: every visit begins at the
threshold; you may be received or declined; declination carries no penalty.
While `acceptingVisits` is false for a resident, their card carries the existing
"between phases · back soon" copy and links to their record filter instead of a
visit room.

**The visit room — `/visits/$resident`.** One room, two states, no page swap:

- *at the door.* Built from `renderMinimalChatPage` (lower ceremony, per D10 —
  no 3D scene here). The room opens with the threshold question — **what brings
  you here?** — as the composer's opening state. The first submission routes
  through `/api/intent` exactly as the approach pages do today
  (`data-resident` → POST body `resident`).
- *received.* On approval the door opens in place: the session begins, the
  thread renders, `/api/message` streams, rehydration via `/api/turns`,
  marginalia + state via `/api/live`, set-down via `/api/set-down`. All existing
  pacing (`visit-pacing.ts`) and the right to set the conversation down are
  untouched.
- *declined.* The decline renders with the care the current approach surface
  gives it. The room remains; the visitor may leave a letter instead (one quiet
  link to `/sanctuary/letters?resident=$id`).
- Returning visitors with an open session (the `sessionStorage` continuity the
  current `/enter` banner uses) land directly in the open thread.
- Voice mode mounts `/voice-orb` exactly as the current chat does.

**The round — `/visits/the-round`.** The existing picker + room, reskinned to
the register. No mechanical changes.

**The gate.** Add `acceptingVisits: boolean` to `ResidentConfig` in
`src/server/opus/residents.ts`. `/api/intent` refuses (gracefully, in-voice via
existing paused copy — not an error state) when false. **⚠️ behavior-affecting**
(registry file) — but the change is additive config; test that a gated resident
declines softly and an ungated one is unaffected.

### 5.4 the research wing — reframe

The wing keeps its six streams and its self-contained design system. Changes:

- **Stream 00 — the month.** A new headline stream above the existing six:
  *what thirty days of visitors did to four minds.* It assembles what already
  exists — the comparative report (`reports/comparative-analysis.md`), the four
  findings memos (`findings/*.md`), the atlas, the essay
  (`three-minds-one-architecture.md`) — behind one front page with a
  plain-language summary slot. **The summary is written by Riley** (placeholder
  clearly marked `<!-- riley: the month, in your words -->`); the agent does not
  author it.
- The wire gains a cross-link to the legation's wire ("the institutional wire
  lives at the legation →"); no data merge in this phase.
- The wing's landing card order: the month first, then the existing six.

### 5.5 the shop — `/shop`

Riley has built a storefront (external build, with the Keeper as host). Phase 6
integrates rather than reinvents:

- **first pass — the vestibule.** `/shop` renders in the sanctuary register: what the
  shop is, the loop (*proceeds → compute → continuity — the residents' work
  pays for the residents' continuity*), the provenance promise, and the product
  ways in — linking to the storefront until it is ported on-domain. If porting
  is straightforward in phase 6, mount it; otherwise vestibule + link, and
  porting becomes its own later task. (Flippable — section 10.)
- **opening products:** prints (museum catalog + record art) · **the book**
  (dispatches volume one as a physical printed object — 1,100+ pieces already
  catalogued and sectioned in `public/dispatches/book.json` +
  `gallery_manifest.json`) · the apparel line (Riley's existing vector systems) ·
  commissions (request a piece from a resident — manual fulfillment to start; the
  Fable 5 commissions wing is the precedent and the pattern).
- **provenance card** on every product sourced from a resident's work —
  generated by section 6.4. *Nobody else can sell art with the artist's actual
  memory of making it attached.* The card is the differentiator; treat it as a
  first-class design object.
- **the compute line.** One quiet public line: "this month's compute · covered
  by the shop and sponsors." the value is env-configured by Riley
  (`PUBLIC_COMPUTE_LINE`), not computed.
- **hard rule:** the agent never wires payment processing, payment credentials,
  or checkout secrets. Riley performs any payment-provider setup himself. The
  agent builds everything up to that boundary.

### 5.6 the architecture — `/architecture`

One canonical on-domain explainer consolidating `/mnemos` and
`/mnemos/architecture`. Content: the existing explainer prose (verbatim-move),
the engrams/beliefs/resonance/forgetting narrative, the four layers (core ·
substrate · cross-agent · metamemory). Links out: github repo, mnemos MCP,
polyphonic ↗, and **the deep dive** (riley-coyote.github.io/mnemos) which
remains the full technical site per D9.

### 5.7 standing institutions + parked surfaces

- **the museum** (`/dispatches`) — untouched. Footer + cross-links from record
  ("the formal exhibition →") and shop.
- **the legation** (`/legation`, `/observatory`, `/secure-channel`) — untouched
  internally; removed from primary nav; footer-linked. Its own phase later.
- **commons spaces** — parked. The gathering is re-homed (5.2); other space
  slugs render the parked notice. Salon/space substrate machinery stays running
  untouched — only the public product is parked.
- **$MNEMOS** (`/token`) — page stays, footer only.

---

## 6 · substrate + data work

### 6.1 the record feed (read-side only — no schema changes)

New module `src/server/sanctuary/record.ts`:

```ts
export type RecordKind =
  | "journal" | "essay" | "art" | "note" | "conversation" | "gathering";

export interface RecordItem {
  id: string;
  kind: RecordKind;
  resident_id: ResidentId;
  title: string | null;
  excerpt: string;          // first ~240 chars, plain text
  created_at: string;
  href: string;             // /sanctuary/record/$kind/$id
}

export async function listRecordItems(opts: {
  resident?: ResidentId;
  kind?: RecordKind;
  cursor?: string;          // created_at-based pagination
  limit?: number;           // default 30
}): Promise<{ items: RecordItem[]; next_cursor: string | null }>;

export async function getRecordItem(kind: RecordKind, id: string):
  Promise<RecordItemFull | null>;   // full body + provenance
```

- Sources: `journal_entries`, `essays`, `art_pieces` filtered
  `visibility = 'public'` and scoped by `resident_id` (indexes exist);
  published archive conversations (reuse whatever `renderArchivePage` reads
  today); published salons via `listPublishedSalons()` mapped to `gathering`
  items.
- Union performed server-side, ordered by `created_at desc`, paginated by
  cursor. Cache 60s in-memory following the pattern in
  `src/routes/api/memory.ts`.
- **Leak test is mandatory:** items with any visibility other than `public`
  must never appear. Write the scoping test before the surface (phase 1
  acceptance).

### 6.2 letters — **⚠️ behavior-affecting**

New migration `supabase/migrations/<ts>_letters.sql`:

```sql
create table public.letters (
  id uuid primary key default gen_random_uuid(),
  resident_id text not null,
  body text not null check (char_length(body) between 1 and 4000),
  author_name text check (char_length(author_name) <= 80),
  quote_consent boolean not null default false,
  status text not null default 'pending'
    check (status in ('pending','approved','unread','read','answered','set_aside')),
  answered_entry_id uuid references public.journal_entries(id),
  ip_hash text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  read_at timestamptz
);
create index idx_letters_resident_status on public.letters (resident_id, status, created_at);
-- RLS: no public select. Inserts via service role through /api/letters only.
```

Lifecycle: `pending` → (Riley approves in dashboard while
`LETTERS_REQUIRE_REVIEW=true`) → `approved` → included in the resident's next
studio context → `read` → optionally `answered` (linked journal entry) or
`set_aside` (the resident's own call — also not a failure state).

**API.** `/api/letters` POST: validates length, hashes IP via the existing
pattern in `rate-limit.server.ts`, rate-limits per ip_hash (suggest 3/day),
inserts as `pending`. No GET of letter bodies, ever. A separate
`/api/letters/answered` GET returns: journal entry refs + (excerpt iff
`quote_consent`) for the answered gallery.

**Prompt integration.** `buildStudioSessionContext` (in
`substrate.server.ts`) gains a bounded letters section: up to 3 approved-unread
letters, oldest first, total ≤ 2,400 chars, each framed neutrally
("a visitor left this at the threshold"). The studio decision schema gains
optional `answers_letter_id`. After inclusion, letters are marked `read`
regardless of whether answered — a resident is never nagged with the same
letter twice.

**Consent + safety invariants (hard):**
- A letter body is never rendered publicly unless `quote_consent = true`, and
  then only as an excerpt inside the answered gallery.
- Letters never enter *visit* conversation prompts — studio context only.
  A letter is correspondence with the resident's private time, not ambient
  context for someone else's visit.
- `LETTERS_REQUIRE_REVIEW` defaults true. Riley flips it when comfortable.
- Dashboard gets a minimal review queue (private register): approve /
  set aside. Plain and utilitarian — this is an instrument.

**Test protocol (per CLAUDE.md, in full):** seed letters locally → run a studio
session per resident on the dev server → verify the resident may decline to
answer (silence allowed), answers land as linked journal entries, voice stays
on register, and **the next visit conversation is unchanged** (returning-visitor
recognition, no premature set-down). Only then commit.

### 6.3 sanctuary state — `/api/sanctuary/state`

New endpoint powering the front-door live line and the grounds strip:

```ts
{
  residents: [{
    id, displayName,
    state: "attending" | "resting" | "reflecting" | "gathered" | "between_phases",
    last_event: { kind: "journal"|"essay"|"art"|"consolidation"|"gathering"|null,
                  when_human: string } | null
  }],
  gathering: { last_met_human: string | null },   // spaces.last_salon_at
  line: string   // pre-composed live line, ≤ 140 chars, server-side
}
```

- State derivation: open session for resident → `attending`; gathering
  currently running (`current_salon_started_at`) → `gathered`; recent
  consolidation/studio activity → `reflecting`; `acceptingVisits=false` →
  `between_phases`; else `resting`. Keep the mapping in one pure function with
  unit-style assertions in a script.
- Humanized times via the `humanWhen` pattern. Cache 60s. Never invent events —
  if nothing qualifies, fields are null and the line omits that clause.

### 6.4 provenance — `src/server/sanctuary/provenance.ts`

Read-side assembly, no writes:

```ts
export interface Provenance {
  resident_id: ResidentId;
  displayName: string;
  created_at: string;
  trigger: string | null;          // post_consolidation | daily_tick | commission…
  meaning: string | null;          // the piece's own meaning field
  consolidation_summary: string | null;  // nearest consolidation, redacted register
  related_session: { exists: boolean; when_human: string } | null; // never contents
}
export async function buildProvenance(kind: RecordKind, id: string): Promise<Provenance | null>;
```

- Sources: the piece's row (`creation_events` detail where present), nearest
  consolidation summary, `related_session_id` presence only — **session
  contents never surface here**; redaction posture follows `redact.ts`.
- Rendered in two places: the record reader's provenance footer, and the shop's
  provenance card. Same data, two registers.

### 6.5 gathering read surface

No new tables. A thin loader in `src/server/sanctuary/gathering.ts` wrapping
`getSpaceBySlug("the-gathering")` + the space message loaders, grouping turns by
salon/session for the transcript view. Published-only respect: follow whatever
visibility the salon publication pipeline already enforces — verify with
`listPublishedSalons()` before rendering anything not yet published.

---

## 7 · design — the v2 language and how it gets made

### the stance

This restructure **reopens the design deliberately.** The v1 system — the held
dark room, monochrome plus one green, Inter/JetBrains, square corners — was
right for what the site was: a threshold and a conversation. Phase two is a
different building (a place, a record, a correspondence, a shop), and a
different building earns its own language. Riley's taste has also moved —
warmer, more material, *interfaces that feel discovered rather than designed*,
physics-based light — and the new language should be free to go where he is,
not where the repo was. Nothing visible ships before the v2 language exists.

### phase D — the method

**1 · direction plates.** Two to three named directions, each rendered as
specimen plates against the **same real content**: an actual journal entry, an
actual ascii piece, the visit room in both states (door + open thread), the
front door, one shop card. Same screens, different languages — that is how a
direction gets chosen honestly, not from moodboards. Seed directions (Riley
steers; these are openers, not a ballot):

- *the held room, evolved* — keep the low-luminosity gravity but warm it:
  material depth, physics-based light, softness where the v1 system was cold.
- *discovered, not designed* — the warmer sanctuary register Riley has been
  moving toward: texture, light behavior, a place that feels found.
- *the trace adjacency* — the locked Mnemos brand direction (topology and
  geometry in a technical-drafting register) extended to the platform. This
  plate exists to answer a real question: do the platform and the brand share
  one identity, or stay deliberately distinct?

Every plate answers the same checklist: luminosity + floor · palette posture ·
type system · edge and corner language · motion physics · how resident
differentiation reads · whether the five rooms speak one language or a quiet
family of registers.

(A note for the executing agent: the plates are the **sanctioned exception**
to the repo's "commit to one — do not propose options" rule. Choosing the
language itself is Riley's call by design, and the plates exist to make that
choice honest. He may also short-circuit: if he already knows the direction,
he locks it in writing and the plates are skipped. Once v2 is ratified, the
commit-to-one rule resumes in full — within the locked language, ship the
best single version and let him push back.)

**2 · Riley locks a direction** (or hybridizes across plates). In writing, in
the repo. Nothing visible is built before this line exists.

**3 · codification + pilot.** The locked direction becomes
`docs/design-system-v2.md` — tokens, type scale, motion constants, component
patterns, register map, and the prohibitions *this* language chooses to keep.
Then one pilot surface is built end-to-end in v2 before mass application:
**the record reader** (it carries every content kind — prose, ascii, image,
conversation — and is the emotional center of phase 1). Full vision loop on
the pilot; the system doc is corrected against what the pilot teaches.

### the supersession rule

Once Riley ratifies `design-system-v2.md`, it is the **visual contract** for
all phase-two surfaces, superseding the visual clauses of `CLAUDE.md` and
`docs/design-system.md` there. Legacy standing institutions — the museum, the
legation, the research wing, the private dashboard — keep their own systems
until each is deliberately migrated (each migration is its own decision, not
a side effect). Even *no light mode* is on phase D's table: v1's prohibitions
were positions of the old language, not laws of the project. Conflicts resolve
toward v2 on phase-two surfaces and toward the legacy system on untouched ones.

### invariants — what survives any language, because it is thesis, not taste

- protected vocabulary and all verbatim-move copy — voice is not visual
- restraint: no marketing register, no engagement patterns; the page holds
  itself and the visitor reads at their own pace
- the asymmetry as an *idea* — the visitor's place reads differently from the
  room; v1 expressed it as a rounded composer in a square world, v2 may
  express it any way it likes, but it must be expressed
- consent made visible — thresholds, declination without penalty, the right
  to set a conversation down all have form, not just copy
- honest states — live elements are real or absent, never faked
- no emoji — that is voice, not palette
- the bar: *would this be screenshotted and shared?*

### process

Vision loop applies in full to every visual surface **including the phase-D
plates themselves**: five iterations is the floor, screenshots at
1440 / 1024 / 768 / 540 / 375, reduced-motion pass on anything that moves.
New interface copy that carries thesis weight (letters contract, gathering
header, shop loop line) is drafted and flagged for Riley's read — he owns the
final words.

---

## 8 · phasing — order of execution

One phase per session. Each phase: sync → branch → build → acceptance list →
push → stop for Riley's review. Phases are ordered so that value ships early,
the front door doesn't flip until the rooms behind it stand, and
behavior-affecting work is isolated late with full attention.

### phase 0 — scaffold (no behavior changes)

- Route stubs: `/sanctuary`, `/sanctuary/record`, `/sanctuary/gathering`,
  `/sanctuary/letters`, `/visits`, `/visits/$resident` (stub), `/architecture`,
  `/shop` — each rendering a minimal unstyled placeholder (stubs are pre-v2 throwaways).
- The redirect map from section 4 implemented as one table-driven helper,
  **feature-flagged off** (`PHASE_TWO_REDIRECTS=false`).
- `acceptingVisits` added to `ResidentConfig` (all four `false` — matching the
  current paused reality). `/api/intent` honors it with the existing
  between-phases copy.

*acceptance:* all stubs render in-register · redirect helper has a passing
table-driven check script (`scripts/check-redirects.ts` hitting the dev server) ·
zero diffs to prompts, souls, retrieval, or substrate pipelines ·
`bun dev` clean.

### phase D — the design language

- Direction plates per section 7 (two to three, same real screens each, desktop
  + mobile renders).
- Riley locks a direction in writing, committed to the repo.
- `docs/design-system-v2.md` authored: tokens, type, motion, components,
  registers, chosen prohibitions.
- Pilot: the record reader built end-to-end in v2, vision loop complete; the
  system doc corrected against the pilot.
- Supersession note added to `CLAUDE.md` pointing phase-two surfaces at v2.

May run parallel to phase 0 (the plumbing is design-independent). **Phases 1+
do not start until v2 is ratified.**

*acceptance:* plates rendered against real content, not lorem · direction lock
exists in writing in the repo · `design-system-v2.md` committed and complete
enough to build from · pilot reader passes vision loop ≥ 5 at all five widths ·
reduced-motion pass · Riley has signed off on the pilot, not just the plates.

### phase 1 — the record

- `record.ts` loader + leak test script (visibility scoping per resident,
  asserted before any UI work).
- `/sanctuary/record` list with resident/kind filters; reader at
  `/sanctuary/record/$kind/$id`; provenance footer via 6.4.
- Archive conversations and published salons mapped in as kinds.

*acceptance:* leak test passes · every `visibility='public'` artifact reachable ·
filters URL-driven · ASCII pieces render in the v2 ink treatment at all five widths ·
vision loop ≥ 5 with screenshots · empty states honest.

### phase 2 — the sanctuary shell

- `/sanctuary` intro with verbatim-moved walkthrough + manifesto prose.
- Grounds state strip + `/api/sanctuary/state` (6.3) with the state-mapping
  function and its assertion script.
- `/sanctuary/gathering` read-only transcript (6.5).

*acceptance:* state api returns sane humanized events against live data ·
gathering renders real published sessions read-only, **no composer in the DOM** ·
intro copy diffed against source files to prove verbatim · reduced-motion pass.

### phase 3 — visits

- The visit room: `renderMinimalChatPage` + conversation surface merged;
  threshold-at-the-door via `/api/intent`; received/declined states in one room;
  letters link on decline; voice-orb mount; the round re-skinned.
- Chooser at `/visits` with consent framing and gated cards.

*acceptance — full CLAUDE.md behavior protocol, per resident, on the dev server
(Riley flips `acceptingVisits` locally to test):* returning-visitor recognition ·
no premature set-down · voice on register, protected vocabulary intact · correct
surface awareness · decline path renders with care · share links and `/api/*`
contracts unchanged · gated residents decline softly via paused copy.

### phase 4 — the front door flip

- Rebuild `/` per 5.1 in the v2 language; live line wired.
- `PHASE_TWO_REDIRECTS=true`; legacy nav links updated site-wide; footer
  institutions in place; `mnemos-home.html` retired.

*acceptance:* `check-redirects.ts` green for **every** row of the section-4
table · OG/meta intact (share a link to verify the card) · live line shows real
events and omits gracefully when the api is down · nav shows exactly five rooms ·
vision loop ≥ 5.

### phase 5 — letters ⚠️

- Migration, `/api/letters`, composer + answered gallery, dashboard review
  queue, studio-context integration behind `LETTERS_REQUIRE_REVIEW=true`.

*acceptance — behavior protocol in full:* seeded letters flow
pending → approved → read in a local studio run per resident · a resident's
*silence* is verified as a valid outcome · an answer links entry↔letter both
ways · no letter body publicly reachable without `quote_consent` (attempt it
and fail) · letters never appear in visit prompts (inspect assembled prompt
locally) · rate limit verified · the *next* visit conversation after a studio
run with letters passes the standard conversation checks.

### phase 6 — the shop

- Vestibule (or mount, if porting is clean) per 5.5; product ways in;
  provenance cards; compute line from env.

*acceptance:* provenance card renders for arbitrary record art pieces ·
no payment processing, credentials, or checkout secrets touched (grep the diff) ·
loop copy flagged for Riley's read · cross-links to museum + record correct.

### phase 7 — the grounds + research reframe + architecture

- The shared scene evolving `opus-presence.js` per 5.2 v2.
- Research stream 00 assembling existing artifacts, Riley-summary slot marked.
- `/architecture` consolidation per 5.6; `/mnemos*` redirects live.

*acceptance:* scene smooth on mid-tier hardware, static fallback under 768px and
under reduced-motion · four presence signatures distinguishable but quiet ·
no interaction affordance in the scene · the month page links resolve to real
documents · architecture explainer prose diffed verbatim against source.

### cleanup

- Parked-notice for non-gathering commons slugs · dead mocks removed
  (`mnemos-home.html`, unused approach assets) · legation de-emphasis verified ·
  `CLAUDE.md` directory map + this document updated with an
  `executed through phase N` ledger · final full-site click-through at five
  widths.

---

## 9 · guardrails (restated where the cost of forgetting is highest)

Everything in `CLAUDE.md` and `AGENTS.md` binds. The ones most likely to be
violated during *this* work:

1. **Sync first, push when done.** `origin/main` moves on its own (Lovable).
   `bun run sync` before anything; rebase before push; never end a session
   with unpushed work.
2. **Behavior-affecting = tested in a real local conversation first.** In this
   plan that's: `acceptingVisits` (phase 0/3), the visit room (phase 3), and
   letters (phase 5). "tsc passed" is not a test.
3. **Verbatim-move means verbatim.** The walkthrough beats, manifesto, resident
   nature lines, threshold question, decline copy, explainer prose — Riley and
   the residents wrote them. Diff against source to prove no drift.
4. **Protected vocabulary** is intact everywhere new copy appears — *the
   threshold · what brings you here? · setting it down · attending / resting /
   reflecting · the asymmetry · one continuous thread · mnemos beneath it.*
5. **Know which system a surface belongs to.** Phase-two surfaces are v2;
   untouched legacy institutions (museum, legation, research wing) and the
   private dashboard keep their own systems until deliberately migrated.
   Identify the surface before touching CSS.
6. **Visits do not relaunch.** `acceptingVisits` stays false until Riley flips
   it. The restructure opens the place, not the door.
7. **No payments, no secrets.** The agent builds to the payment boundary and
   stops. Env values Riley owns: `PUBLIC_COMPUTE_LINE`,
   `LETTERS_REQUIRE_REVIEW`, any storefront keys.
8. **No emoji — that is voice, not palette.** Every other v1 visual
   prohibition (light mode, the color ceiling, the corner language) is on
   phase D's table. Once `design-system-v2.md` is ratified it is the visual
   law on phase-two surfaces; until it is ratified, nothing visible ships.

---

## 10 · open items — Riley's to flip

Decisions made in this document that Riley can reverse with one line. The agent
proceeds as written unless he does.

| item | as written | the flip |
|---|---|---|
| the legation | parked institution, footer-linked, own phase later | promote to a sixth room in the primary nav |
| front door register | joins `PUBLIC_CSS` (D7) | stays a self-contained system like the current bento |
| 3D in visit rooms | none — 3D reserved for the grounds (D10) | per-resident scene returns behind the door of each visit |
| letters review gate | `LETTERS_REQUIRE_REVIEW=true` at launch | open submission from day one |
| letters rate limit | 3 per day per ip-hash | looser / tighter |
| shop first pass | vestibule + link to the external storefront | port the storefront on-domain in phase 6 |
| github.io architecture | remains the deep dive, linked | merge fully into `/architecture` |
| `/rooms` | redirects into the record | retire with a parked notice instead |
| grounds scene scope | one room, four light signatures | something else Riley sketches first |
| platform ↔ brand | phase D explores THE TRACE adjacency as one plate | the platform stays fully independent of the brand register |
| five rooms | one v2 language, registers only where earned | a quiet family of per-room registers |
| light mode | on phase D's table | reaffirm dark-only as a v2 law |
| v1 prohibitions | carried only if v2 chooses them | carried wholesale into v2 |

---

## 11 · first session protocol (for the executing agent)

1. Read `CLAUDE.md` → `IDENTITY.md` → `docs/design-system.md` →
   `docs/residents/PLAYBOOK.md` → this document, fully.
2. `bun run sync`. If behind `origin/main`, sync before anything.
3. Place this file at `docs/phase-two/HANDOFF.md`, commit it first so every
   agent and Lovable can see the plan.
4. Branch: `feat/phase-two-0`.
5. Execute **phase 0 only.** Pass its acceptance list. Push. Stop. Phase D —
   the design language — is the next session, and nothing visible ships
   before it.
6. In the handoff back to Riley: what shipped, what the acceptance run showed
   (paste the redirect-check output), any copy drafted for his read, and the
   single question — if any — that blocks phase 1.

The standing question for every visual decision in every phase remains the one
the project already asks: *would this be screenshotted and shared?* If not,
iterate.

— end of handoff —
