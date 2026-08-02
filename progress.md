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
