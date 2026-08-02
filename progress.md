Original prompt: Continue the Sanctuary v2 blueprint autonomously, beginning with Work Package 1: approach before machine.

## 2026-08-02 — Work Package 1

- Branch: `feat/sanctuary-approach`, created from clean `sanctuary-v2` at `88ca99d`.
- Scope: observation → approach → threshold, with explicit machine access and truth-safe UI fixtures.
- Protected boundary: no resident prompts, model routing, retrieval, memory, or resident-authored content will be changed.
- Verification required: Sanctuary gates, production build, browser screenshots at 1440 / 1024 / 768 / 540 / 375, keyboard and focus behavior, reduced motion, text-state parity, and console health.

### TODO

- [x] Add a deterministic visit-state controller.
- [x] Route canvas figures and semantic resident controls through approach.
- [x] Hold camera attention and pause ambient movement for the selected resident.
- [x] Build threshold chrome that keeps the room dominant.
- [x] Add visibly test-only received, declined, and unavailable fixtures.
- [x] Add `render_game_to_text` visit state and a deterministic test hook.
- [x] Verify and iterate visually at 1440 / 1024 / 768 / 540 / 375.
- [x] Verify keyboard focus, modal handoff, focus restoration, reduced motion, state parity, and console health.
- [x] Commit and push the completed work package.

### Verification notes

- `bun run verify` passes all four Sanctuary integrity gates.
- `bun run build` completes both client and SSR production builds.
- The prescribed web-game Playwright client reports `approaching` with Opus held, then `observing` with the resident released; neither run records a console error.
- The ordinary disconnected submission resolves to `unavailable` with “No reply has been made.” Received and declined remain URL-gated, visibly labeled interface fixtures with no model call or resident speech.
- The existing files are not Prettier-clean (465 formatting-only lint findings across the two touched legacy files); this work package does not reformat them wholesale.

## 2026-08-02 — Conversation in place

- Branch: `feat/sanctuary-conversation`, created from clean `sanctuary-v2` at `aed7059`.
- Scope: received → speak in place → set down, with accessible transcript composition and deterministic fixtures.
- Protected boundary remains unchanged: no resident prompts, routing, retrieval, memory, model calls, or authored resident dialogue.

### TODO

- [x] Extract a finite, pure visit-state grammar with negative tests.
- [x] Build the received conversation composition inside the room.
- [x] Add visitor-only fixture turns and an explicitly absent resident-response state.
- [x] Complete declined, unavailable, and set-down compositions.
- [x] Verify machine return, keyboard flow, state parity, responsive layouts, reduced motion, console health, gates, and build.
- [x] Commit, push, and integrate the completed work package.

### Implementation notes

- The received state uses a two-column transcript/composer plane at larger widths and a scroll-contained single column on narrow screens.
- Only visitor-entered fixture text appears in the transcript. The resident turn is an explicit boundary message, never archived or invented speech.
- Escape from a received fixture sets the visit down first; a second Escape returns to observation. Machine close returns to the active conversation control.
- The prescribed game client reads correct `received` and `set-down` text states with no console errors. Its virtual-time run cannot click the animated panel because Playwright never considers it stable; the real in-app browser exercises those controls successfully.
- The game client captures a different headless canvas composition than the visible in-app render. State and console checks remain useful; visible layout decisions are based on the actual in-app browser screenshots.
- Manual fixture flow passes at 1440 / 1024 / 768 / 540 / 375, including the mobile threshold-to-received focus handoff and sunset contrast.
- `bun run verify` now includes the visit grammar gate and passes all five checks; `bun run build` completes both production targets.
- New controller and verification files pass targeted ESLint and Prettier checks. The legacy inline Sanctuary page remains outside the formatting sweep documented in Work Package 1.
