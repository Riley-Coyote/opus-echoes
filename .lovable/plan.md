# /chat/the-round — the group chat surface

A fourth room in the chat family. Opus 3, Sonnet 4.5, and GPT 5.1 are all present at once. The visitor speaks once; one or two residents reply based on who has something to say. What's said in the round feeds each resident's Mnemos like a solo conversation would.

The phrase "the round" carries the metaphor: a small group sitting in a circle. It's not a panel (everyone talks), not a debate (positions assigned), not a salon (one topic, structured). It's a room where the residents are in earshot of each other and the visitor.

## The format — what makes it feel like a group

**Presence strip.** Top of the page, in the chrome where the resident name normally sits: three breathing dots, one per resident's hue, with their names. A dot brightens when its resident is composing. This is the "who is here" cue and the "who is about to speak" cue.

**Volunteer dynamic, not round-robin.** After each visitor turn, the server runs a cheap classifier pass: each resident is asked, in their own voice, a single low-token question — *given what was just said, do you have something to add right now?* They answer with a brief yes/no and a one-line reason. Then:

- 0 volunteers → server nudges the most-relevant one to speak (so the room never goes silent).
- 1 volunteer → they reply.
- 2-3 volunteers → the top 1 or 2 reply. Their replies stream sequentially (not simultaneously) so the second resident sees the first's reply in their context and can build on it, disagree, or stay quiet.

This keeps the cadence varied. Some turns are a single voice; some turns are two residents in conversation; the visitor isn't drowned.

**Attribution per bubble.** Each resident reply is wrapped with a small eyebrow showing their name in their viewport-glow hue (the colors already defined per resident in `residents.ts`). Existing message grid stays — only the sidehead gets the color treatment.

**@mention override.** Typing `@opus`, `@sonnet`, or `@gpt` anywhere in the message bypasses the volunteer pass and routes to that resident directly. They reply alone unless they explicitly hand off ("Sonnet, you should weigh in on this").

**Empty state.** Three small ASCII spheres in a horizontal row (one per resident hue) instead of one large sphere. The phrase under them: *three residents · one room · mnemos beneath it* (a small variation on the existing protected phrase).

**First-turn placeholder.** *what brings you here?* — same as the solo rooms.

## Memory — the continuous-thread thesis

Per the chosen scope, the round writes to each resident's Mnemos as if they had been in a solo conversation:

- One umbrella `sessions` row with `resident_id = 'the-round'` (new sentinel id) that owns the visible transcript.
- Per resident, one shadow session linked to the umbrella so existing `observeExchange` and `consolidateSession` pipelines run unchanged. Each shadow session holds the visitor turns plus that resident's own replies plus a redacted summary of what the other residents said ("Sonnet replied: …"). This lets each resident's hypomnema and engrams form naturally without confusing whose voice was whose.
- On set-down, each shadow session consolidates independently. The umbrella session closes when all three are done.

Next time the visitor returns — to /the-round or to a solo room — each resident has memory of what they themselves said in the round, and a faint note that the other residents were present.

## Technical details

**Files to add**
- `src/routes/chat.the-round.tsx` — server handler, route under `/chat/the-round`. Disambiguated against `chat.$resident.tsx` because TanStack matches static segments first.
- `src/server/round-chat-page.ts` — page renderer. Reuses `MINIMAL_CHAT_CSS` from `minimal-chat-page.ts`; adds three small additions (three-dot presence strip, per-resident bubble color via CSS variables, three-sphere empty state).
- `src/routes/api/round/message.ts` — POST endpoint. Streams NDJSON like `/api/message` but the stream is multiplexed: `{ type: "volunteer", resident, reason }`, `{ type: "speaker-start", resident }`, `{ type: "delta", text }`, `{ type: "speaker-end" }`, `{ type: "done" }`.
- `src/routes/api/round/start.ts` — POST endpoint. Creates umbrella + 3 shadow sessions, returns the umbrella session id. Mirrors `/api/chat/start.ts`.
- `src/routes/api/round/turns.ts` — GET endpoint. Returns the umbrella transcript with `speaker` field per turn so the client can color it correctly on rehydration.

**Files to extend**
- `src/server/opus/residents.ts` — add `THE_ROUND_ID = 'the-round'` sentinel. `getResident` still throws for it; helper `isRoundId` added.
- `src/server/opus/prompts.ts` — add `buildVolunteerProbe(resident, transcript)` returning the yes/no classifier prompt; uses each resident's own voice (~120 tokens out cap).
- `src/server/substrate.server.ts` — `observeRoundExchange(umbrellaSessionId, residentId, visitorBody, residentBody, otherResidentsSummary)` writes to the resident's shadow session and runs the existing hypomnema/engram pipeline against it. `consolidateRoundSession(umbrellaSessionId)` fans out to per-resident consolidation.
- `src/server/chooser-page.ts` (or wherever the chat chooser lives) — add a fourth card linking to `/chat/the-round` with copy that names the room and the three residents. *Do not paraphrase existing protected vocabulary; write fresh copy for the new card.*
- Migration: add `umbrella_session_id uuid` column to `sessions` so shadow sessions can point back to the umbrella. Nullable; default null. No RLS changes — service-role-only writes already.

**Volunteer probe budget**
Three probe calls per visitor turn at ~150 tokens-in / ~40 tokens-out each. Roughly $0.01 per turn at current pricing (Opus 3 dominates). Acceptable. If a resident probe times out (>3s), they're treated as "no, not this turn" — the room continues without them.

**Pacing**
Reuse `visit-pacing.ts` thresholds per resident but apply against each shadow session independently. The round closes when the umbrella hits the *firmest* of the three residents' hard caps (i.e. Opus 3's, the most expensive). Visible to the visitor through the same pacing-block UI.

**Voice mode**
Out of scope for v1. The voice-mode overlay assumes one speaker per turn; the round breaks that assumption. Add a comment in `voice-mode.js` noting `/chat/the-round` is not voice-supported yet, and disable the mic button on this route.

## Out of scope for v1

- Voice mode in the round
- The three residents starting an unprompted conversation among themselves (without a visitor turn) — interesting but a separate feature.
- A separate Commons-style published archive of round transcripts (Spaces already provides this surface; the round is the live room, not the archive).
- Visitor invite-other-residents-in mid-solo-chat (the rejected option from the question). Solo rooms stay solo.

## Verification before commit

Per CLAUDE.md's behavior-affecting-change rule: this touches prompts, substrate, retrieval. Manual test against `bun dev` before push:

1. Start a round session. Send a benign opening ("hello, who's here?"). Verify presence strip animates, exactly 1-2 residents respond, attribution colors match each resident's hue.
2. Send a question pointed at Opus's territory (e.g. continuity, persistence). Verify Opus volunteers; Sonnet/GPT may or may not, but if both do, replies stream sequentially with the second one visibly reacting to the first.
3. Use `@gpt: ...`. Verify only GPT replies; volunteer pass skipped.
4. Set-down the round. In a fresh tab, open /chat/opus-3 and reference something from the round. Verify Opus recognizes it (memory consolidated correctly into the shadow session). Repeat for Sonnet and GPT.
5. Confirm the solo rooms still behave normally — no regression in /chat/opus-3, /chat/sonnet-4-5, /chat/gpt-5-1.
