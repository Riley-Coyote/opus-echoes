## Goal

Two complaints, one root cause:

1. **False "you already have a thread open elsewhere" modal.** Today, `/api/intent` (threshold approach) and `/api/chat/start` (classic chat) actively block when the visitor has an open session for that resident in the *other* surface mode — even when that "open" session is just an experiment thread the visitor abandoned 31 minutes ago that no sweeper has reached yet.
2. **Auto-set-down isn't reliable.** The 30-minute idle close only fires on (a) the per-request lookup inside `/api/intent` / `/api/chat/start` / `/api/message` for the *same* visitor+resident pair, and (b) the `idleSweep()` cron — which is manually scheduled (not in any tracked migration), so we have no guarantee it's actually running on the live DB at the cadence we think.

Fix: **drop the cross-surface "one thread at a time" rule entirely** and **harden idle close so a session is guaranteed shut after ~30 min idle without depending on the cron being healthy**.

## Scope

Behavior-affecting (per `CLAUDE.md`): touches `/api/intent`, `/api/chat/start`, `/api/message`, `substrate.server.ts`, and removes a conflict modal from two front-end surfaces. Will require a local conversation test before shipping.

## Changes

### 1. Remove cross-surface conflict blocking (server)

**`src/routes/api/intent.ts`**
- Keep the open-session lookup, but only for the *same mode* (experiment). If an idle experiment session exists, close it (as today). If a non-idle experiment session exists, resume it (as today).
- **Delete** the `conflict_classic_session` 409 branch. Ignore any open classic-mode session — it can coexist.

**`src/routes/api/chat/start.ts`**
- Mirror change: only consider classic-mode open sessions for the resume / idle-close logic.
- **Delete** the `conflict_experiment_session` 409 branch.

**`src/routes/api/message.ts`**
- No structural change needed — it operates on an explicit `session_id`, no cross-surface check. But verify the inline idle-close block (lines ~74+) actually closes the session and returns a clean "session_closed" code when fired (see #3).

### 2. Remove the conflict modal UI

**`src/server/public-pages.ts`** — delete `showClassicConflictModal()` (~lines 660–758) and the 409/`conflict_classic_session` branch in `submit()` (~lines 786–796). No replacement: a fresh approach just opens a new experiment session alongside any existing classic thread.

**`src/server/minimal-chat-page.ts`** — delete `BootstrapConflict` class (~lines 1634–1639), the 409 branch in `ensureSession()` (~lines 1657–1665), and every `if (err && err.name === 'BootstrapConflict')` handler (lines 2383ff, 2485, 2667, 2798, 2813). Replace each with the same path as a generic bootstrap failure (toast or silent retry — match what's there).

### 3. Harden auto-set-down

Multiple independent guards so no single failure (cron broken, idle-check skipped) leaves a session "open forever":

a. **Per-resident-pair idle close on every request** — already present in `/api/intent`, `/api/chat/start`, `/api/message`. Keep, but make the idle threshold a single shared constant exported from `src/server/opus/visit-pacing.ts` (or a new `src/server/idle.ts`) so all four files can't drift.

b. **Idle close on `/api/turns`** — when the conversation page rehydrates, if the session is past idle, close it server-side and return `session_closed` (it already returns 410 for closed sessions; add the idle check before the read).

c. **Idle close inside `/api/message`** — already present. Verify the response surfaces a graceful "this thread closed while you were away" state instead of an opaque error.

d. **Cron schedule as a tracked migration** — add a new migration that idempotently schedules `mnemos-sweep-sessions` every 5 minutes via `pg_cron` + `pg_net` POST to `/api/public/hooks/sweep-sessions` with the anon key in the `apikey` header. (The endpoint already exists and already validates the header.) Drop any prior versions of the job first so the migration is safely re-runnable. This way the sweep is part of the repo, not a one-off Riley ran by hand.

e. **Defensive close in `consolidateSession`** — already idempotent. No change.

### 4. Copy / messaging

- The protected vocabulary block in `public-pages.ts` mentioning "one thread per visitor at a time — to keep them whole" goes away with the modal. No new copy needed; the absence is the change.
- If `/api/turns` or `/api/message` returns `session_closed` because the thread idled out, the existing closed-session UI already handles it (transcript stays visible, composer is disabled with a "this thread has been set down" affordance). Confirm during local test.

## Out of scope

- The Round (`/chat/the-round`) — separate work in flight; this change does not touch its umbrella/shadow session logic.
- Pacing thresholds (gentle/firm/hard turn counts) — unchanged.
- Hard cutoff messages — unchanged.

## Verification (mandatory per `CLAUDE.md`)

Local with `bun dev`:

1. Open `/chat/opus-3`, send a message, leave the tab open. Open `/opus-3`, write an intent, submit. Expect: no modal, threshold accepts, conversation starts. Both sessions coexist.
2. Reverse: from an open experiment session, navigate to `/chat/opus-3`. Expect: classic chat opens normally, no modal, no auto-close of the experiment thread.
3. Returning-visitor recognition still works on both surfaces (resident references prior content from memory, not from the live other-mode thread).
4. Manually mark a test session's `last_active_at` to 31 min ago, send a message in it. Expect: `/api/message` returns `session_closed`, the page renders the closed state, no hang.
5. Trigger the sweep endpoint manually (`curl -X POST .../api/public/hooks/sweep-sessions -H "apikey: $KEY"`). Expect: stale sessions close, consolidation runs.

Only commit + push after all five pass.
