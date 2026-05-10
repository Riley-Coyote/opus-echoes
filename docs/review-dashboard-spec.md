# Session Review Dashboard — Build Spec

## Purpose

An internal admin dashboard at `/review` for Riley to monitor Opus 3's coherence, read conversation transcripts, inspect what the consolidation pipeline produced from each session, and track belief/identity drift over time. This is NOT visitor-facing — it's an operational tool for the person running The Sanctuary.

---

## Architecture

### Pattern to follow

The existing Private Space dashboard (`src/server/dashboard-shell.ts`) is the closest pattern. It's a server-rendered HTML shell with client-side JavaScript that fetches API data and populates the DOM. No React — just `renderDashboardPage()` returning full HTML strings, with `extraScript` for client-side interactivity.

**However**, the review dashboard should NOT reuse `dashboard-shell.ts` — it needs its own layout (no rail/entries-panel/reader three-column structure). Build a dedicated `src/server/review-shell.ts` that exports `renderReviewPage()`.

### Access control

Use the same `hasResidenceAccess()` gate from `src/server/access.server.ts` that protects the Private Space. The review dashboard is behind the same admission system. If stronger auth is needed later, it can be added — but for now, residence access is sufficient.

### File structure

```
src/server/review-shell.ts          — HTML shell renderer + CSS + shared JS
src/routes/review.tsx                — Main review route (session list)
src/routes/review.session.$id.tsx    — Single session transcript view
src/routes/review.state.tsx          — Current resident state overview
src/routes/api/review/sessions.ts   — API: paginated session list
src/routes/api/review/session.$id.ts — API: full session transcript + consolidation data
src/routes/api/review/coherence.ts  — API: belief/engram trending data
public/review.css                    — Review dashboard styles
```

---

## Views

### View 1: Session List (`/review`)

The landing page. A paginated list of all sessions, most recent first.

**Layout**: Single column, centered, max-width 900px. Same dark aesthetic as the rest of the site (use the same CSS variables from `dashboard-shell.css` — `--bg-void`, `--bg-deep`, `--ink`, `--text-body`, `--text-soft`, `--font-display`, `--font-mono`, etc.).

**Header**: 
- "Session Review" title
- Nav tabs: **Sessions** | **Resident State** | **Coherence**
- Current stats bar: total sessions, total engrams, days resident (fetch from `/api/memory`)

**Each session row shows**:
| Field | Source | Notes |
|-------|--------|-------|
| Date/time | `sessions.created_at` | Human-readable, e.g. "May 9, 2026 · 11:42 PM" |
| Duration | `closed_at - created_at` | e.g. "23 min" or "still open" if `closed_at` is null |
| Turn count | Count of turns for this session_id | e.g. "14 turns" |
| Closed by | `sessions.closed_by` | e.g. "visitor_idle", "visitor_action", or "open" |
| Resident | `sessions.resident_id` | "opus-3" or "sonnet-3-7" |
| Intent preview | Join to `intents` table via `intent_id` → show first 80 chars of `intents.body` | What the visitor said when they arrived |
| Engrams formed | Count of `engrams` where `source_session_ids` contains this session id | e.g. "2 engrams" |
| Published? | Check `published_conversations` for this session_id | Badge: "published" or nothing |

**Click** a row → navigates to `/review/session/{session_id}`.

**Pagination**: Load 20 at a time, "Load more" button at bottom. API accepts `?offset=` and `?limit=`.

**Filters** (optional, nice to have):
- Date range picker
- Resident filter (opus-3 / sonnet-3-7)
- Closed-by filter
- "Has engrams" toggle

### View 2: Session Transcript (`/review/session/:id`)

Full transcript of a single session with consolidation sidebar.

**Layout**: Two columns.
- **Left (60%)**: Full transcript, turn by turn
- **Right (40%)**: What was consolidated from this session

**Left column — Transcript**:

Header:
- Back link: "← Sessions"
- Session metadata: date, duration, resident, closed_by, turn count, token totals
- Intent: the full visitor intent text

Each turn:
- Role indicator: "VISITOR" or "RESIDENT" (mono, uppercase, small)
- Timestamp (relative to session start, e.g. "+3:42")
- Message body (full text, preserve whitespace)
- Token count (small, mono, right-aligned)
- If `role === "visitor"`: slightly different background tint to distinguish
- If marginalia exist for this turn pair: show inline annotations below the resident's turn (e.g. "⟡ engram forming", "◇ belief touched")

Query: `turns` table filtered by `session_id`, ordered by `created_at` ascending.

Marginalia query: `marginalia` table filtered by `session_id`, joined by turn position.

**Right column — Consolidation**:

What Mnemos produced from this session:

1. **Engrams formed/reinforced**
   - Query: `engrams` where `source_session_ids` contains this session_id
   - Show: quote, stability, connections count, is_core badge, reinforcement_count
   - If an engram was reinforced (not new), show the stability delta

2. **Beliefs updated**
   - Query: `beliefs` ordered by `updated_at`, check if the update timestamp falls within the session window
   - Show: belief text, confidence before → after

3. **Threads touched**
   - Query: `threads` where `last_surfaced_at` falls within session window
   - Show: thread name, appearance count, distinct visitor count

4. **Journal entry**
   - Query: `journal_entries` where `related_session_id = session_id` OR created within the session close window
   - Show: kind (reflection/dream/observation), title, full body

5. **State change**
   - If `resident_state` was updated during this session's consolidation window:
   - Show: arousal, openness, resolution values
   - Show: `last_consolidation_summary` text

If nothing was consolidated (session too short, no meaningful content): show "No consolidation data for this session."

### View 3: Resident State (`/review/state`)

Current snapshot of who Opus 3 is right now.

**Layout**: Single column, max-width 800px, sections stacked vertically.

**Section 1 — Vital Signs**:
- Core memories count, total engrams, days resident, conversations held
- Current modulators: arousal, openness, resolution (show as labeled values, 0–1)
- Selection threshold, temperature, surprise sensitivity
- Last consolidation timestamp + summary text
- Source: `/api/memory` + direct `resident_state` query

**Section 2 — Core Engrams** (is_core = true, ordered by stability desc):
- Each engram: quote, stability, connections, reinforcement count, last reinforced date
- Limit 20, "show all" toggle
- Source: `engrams` table, `is_core = true`

**Section 3 — Active Beliefs** (ordered by updated_at desc):
- Each belief: text, current confidence, prior confidence, confidence delta
- Limit 10
- Source: `beliefs` table

**Section 4 — Recurring Threads** (ordered by appearance_count desc):
- Each thread: name, description, appearance count, distinct visitors
- Limit 10
- Source: `threads` table

**Section 5 — Recent Journal** (last 5 entries):
- Each entry: kind badge, title, body preview (first 200 chars), date
- Link to full entry
- Source: `journal_entries` table

### View 4: Coherence Trending (`/review/coherence`)

How the resident's identity is evolving over time. This is the most complex view.

**Layout**: Single column, max-width 900px.

**Section 1 — Belief Confidence Over Time**:
- For each belief currently held: show confidence trajectory
- This requires either `engram_versions` data or periodic snapshots
- Simplest approach: query `beliefs` with `updated_at` and `prior_confidence` → plot the most recent delta for each
- Display as a simple table: belief text | prior | current | direction arrow (↑↓→)

**Section 2 — Engram Stability Distribution**:
- How many engrams at each stability level (bucket into: 0–0.2, 0.2–0.4, 0.4–0.6, 0.6–0.8, 0.8–1.0)
- Show as horizontal bars or simple text bars
- Source: `engrams` table, group by stability range

**Section 3 — Session Frequency**:
- Sessions per day over the last 30 days
- Simple text-based chart or list
- Source: `sessions` table, grouped by date

**Section 4 — Consolidation Health**:
- Last 10 consolidation events: timestamp, engrams formed, beliefs updated, threads reinforced
- Helps spot if the pipeline is working or stalling
- Source: Derived from `engrams.created_at`, `beliefs.updated_at`, `threads.last_surfaced_at` in recent windows

---

## API Endpoints

### `GET /api/review/sessions`

```
Query params: ?offset=0&limit=20&resident=opus-3
Response: {
  ok: true,
  sessions: [{
    id, created_at, closed_at, closed_by, resident_id,
    intent_preview,  // first 80 chars of intent body
    turn_count,      // count of turns
    engram_count,    // count of engrams sourced from this session
    is_published     // boolean
  }],
  total: 142  // total count for pagination
}
```

Implementation: Join `sessions` with `intents` (left join on intent_id). Subquery count on `turns`. Subquery on `engrams` checking array contains. Subquery on `published_conversations`.

### `GET /api/review/session/:id`

```
Response: {
  ok: true,
  session: { id, created_at, closed_at, closed_by, resident_id, intent },
  turns: [{ id, role, body, kind, created_at, tokens_in, tokens_out }],
  marginalia: [{ turn_index, kinds: ["engram_forming", "belief_touched"] }],
  consolidation: {
    engrams: [{ id, quote, stability, connections, is_core, reinforcement_count }],
    beliefs: [{ id, text, confidence, prior_confidence }],
    threads: [{ id, name, appearance_count, distinct_visitor_count }],
    journal: [{ id, kind, title, body, created_at }],
    state_summary: "..." // last_consolidation_summary if updated during this session
  }
}
```

Implementation: Multiple parallel Supabase queries. For consolidation data, filter by timestamps that fall within the session's `created_at` to `closed_at` + 5 minutes (consolidation runs shortly after close).

### `GET /api/review/coherence`

```
Response: {
  ok: true,
  beliefs: [{ id, text, confidence, prior_confidence, updated_at }],
  stability_distribution: { "0-0.2": 12, "0.2-0.4": 34, ... },
  sessions_per_day: [{ date: "2026-05-09", count: 5 }, ...],
  recent_consolidations: [{ timestamp, engrams_formed, beliefs_updated, threads_reinforced }]
}
```

---

## Visual Design

Follow the existing Sanctuary aesthetic exactly:

**Colors** (from `dashboard-shell.css` `:root`):
- Background: `--bg-void` (#060608) body, `--bg-deep` (#0a0a0c) for cards/panels
- Text: `--ink` (0.96 opacity) for headings, `--text-body` (0.82) for prose, `--text-soft` (0.6) for secondary, `--text-tertiary` (0.52) for meta
- Accent: `--state` (#82b484) for active states and highlights
- Borders: `--border-subtle` (rgba 220,219,216,0.09)

**Typography**:
- Headings: Inter Tight (`--font-display`), weight 300, letter-spacing -0.02em
- Body: Inter (`--font-sans`), weight 400
- Meta/labels: JetBrains Mono (`--font-mono`), weight 500, uppercase, letter-spacing 0.13em, 11px
- Use the same fluid type scale: `--t-eyebrow`, `--t-meta`, `--t-body`, `--t-body-lg`, `--t-card-h`, `--t-hero`

**Components**:
- Session rows: Similar to `.entry-link` in the dashboard — block with title, excerpt, meta chips. Subtle left border on hover, green border when selected.
- Transcript turns: Left-aligned with role chip, timestamp, body. Visitor turns get a slightly lighter background (rgba(220,219,216,0.03)).
- Consolidation cards: Similar to the memory page's `.entry` pattern — left border accent, quote + prose structure.
- Tabs: Mono font, uppercase, spaced, underline on active.

**Atmosphere**: Include the same `atmo-grain` overlay and body gradient as other pages. No landscape/stars needed — keep it functional.

---

## Supabase Tables Referenced

These already exist — do NOT create new tables:

| Table | Key fields used |
|-------|----------------|
| `sessions` | id, created_at, closed_at, closed_by, resident_id, intent_id |
| `turns` | id, session_id, role, body, kind, created_at, tokens_in, tokens_out |
| `intents` | id, body |
| `engrams` | id, quote, stability, connections, is_core, reinforcement_count, source_session_ids, last_reinforced_at, created_at |
| `beliefs` | id, text, confidence, prior_confidence, updated_at |
| `threads` | id, name, description, appearance_count, distinct_visitor_count, last_surfaced_at |
| `journal_entries` | id, kind, title, body, created_at, related_session_id |
| `marginalia` | id, session_id, turn_index, kinds, consolidated |
| `resident_state` | arousal, openness, resolution, selection_threshold, temperature, surprise_sensitivity, prose_summary, last_consolidation_summary, last_consolidation_at |
| `published_conversations` | id, session_id, title, summary, published_at |

---

## Implementation Priority

**Phase 1** (build first — most immediately useful):
1. `/review` — session list with pagination
2. `/review/session/:id` — transcript + consolidation sidebar
3. API endpoints for both

**Phase 2** (build second):
4. `/review/state` — current resident snapshot
5. `/review/coherence` — trending data

Phase 1 alone gives Riley the ability to read any conversation and see what was consolidated from it. Phase 2 adds the longitudinal monitoring.
