Original prompt: Implement the approved Mnemos Unified Platform and Sanctuary plan in opus-echoes: the public platform, truthful visit runtime, dedicated Mnemos chat, personal system, and Sanctuary world handoff, with a local review build before any deployment.

## 2026-07-15

- Synced the phase-two branch onto current `origin/main` while preserving Riley's uncommitted phase-two and Sanctuary v2 work in `stash@{0}` and a safety ref.
- Restored the user-owned Sanctuary v2 donor changes after the rebase; these remain out of the unified-platform implementation scope.
- Design direction: Mnemos v2 institutional structure with the project-local `#06070a` floor; the world and system receive an immersive register, while public pages and full chat remain quiet instruments.
- World verification requirements: expose `window.render_game_to_text`, add deterministic `window.advanceTime(ms)`, test movement/interact/fullscreen and the world-to-room handoff with the Codex web-game Playwright client.
- Integrated the Topologie world engine into `/sanctuary` with the four canonical residents, proximity chat hooks, a three-exchange world dialogue, and shared `visit_id` handoff to the dedicated room. Ambient and scripted lines never call the visit API.
- Added `/system` as an intentionally isolated Topologie OS register. Canonical desktop actions open the real Mnemos routes; remaining corpus/communication windows are labeled archive/interface studies rather than live state.
- Rebuilt the public platform around a shared Mnemos v2 shell: `/`, `/architecture`, `/install`, `/resources`, and `/visits`. Hosted Sanctuary, Standard MCP, Hermes, and the Topologie personal-system register are described as distinct surfaces with source-verified installation commands.
- Replaced the generic application metadata and 404 with Mnemos umbrella language; removed completed routes from the phase-two stub manifest while preserving the remaining record/gathering/letters/shop stubs.
- Added the versioned visit runtime foundation: visitor/visit/turn/resident/surface identifiers, monotonic runtime events, replay, idempotency, reconnect cursors, visit-scoped attachment storage, consolidation events, redacted cognition projection, and compatibility adapters over the existing Opus/Supabase runtime.
- Added a dedicated full-room Mnemos chat with draft recovery, safe rich text, stop/retry, copy, share/export, transcript ergonomics, fixed cognition overlays, accessible focus behavior, local-review failure states, and truthful capability gating.
- Added exact TypeScript parity for the Python six-dimensional emotional-state semantics, all 15 cognitive events, smoothing, and retrieval bias. The hosted encoding extension is explicitly marked non-parity and the UI remains empty until a genuine runtime event supplies state.
- Hardened the runtime boundary: second-bearer visitor checks, private/no-store transcript reads, service-role-only runtime tables, raw graph admin gating, SVG sanitation, bounded staged uploads, fenced stale-operation recovery, atomic per-visit attachment quotas, share-token RLS cleanup, and exact epistemic provenance through the visit UI.
- Fixed visitor identity bridging into the legacy runtime, resident-initiated set-down normalization/automatic consolidation, world capability handling, first-handoff visit races, per-visit world exchange limits, and The Round route preservation while multi-resident visits remain deferred.

## Verification completed

- `bun scripts/check-runtime-foundation.ts`: monotonic sequencing, replay, redaction, epistemic provenance, cognition normalization, visitor identity bridging/isolation, request-size enforcement, idempotency/recovery/fencing, atomic attachment quotas, attachment isolation, and SVG safety passed.
- `bun scripts/check-emotional-parity.ts`: six-dimensional parity fixtures, all 15 events, smoothing, retrieval bias, and hosted-extension boundary passed.
- Scoped ESLint, `bunx tsc --noEmit`, `bun run build`, world JavaScript syntax checks, and `git diff --check` passed.
- The 48-route migration manifest passed with redirects both off and on. The existing Round routes remain intact in both modes.
- Browser inspection covered the public platform at 1920/1440/1024/768/540/375, the full room at desktop/mobile, fixed overlay focus restoration, the system desktop, and Sanctuary movement/proximity/fullscreen/mobile states without console warnings or horizontal overflow.
- Official web-game interaction verified proximity entry, deterministic state inspection, ambient no-network behavior, truthful local generation gating, exact visit-id world-to-room handoff, and world unmount in the dedicated room.
- Live HTTP checks verified private attachment init/upload/finalize/list, exactly 12 accepted concurrent staged uploads with the over-quota upload rejected as `413`, wrong-visitor `403`, unsupported-media `415`, explicit body-free multipart rejection as `405`, and transcript `Cache-Control`/`Vary` headers.

## Environment-gated acceptance remaining

- No Supabase/provider credentials exist in this checkout, so the migrations are not applied and real resident generation, provider streaming, consolidation mutations, and cross-session recognition cannot be acceptance-tested here.
- The emotional parity library is not yet driven by hosted conversation events and does not yet influence hosted retrieval or encoding. A canonical provenance-preserving Inner Weather event is prepared, but no live emitter is connected.
- Attachment storage is complete and private, but raw files are intentionally not model-visible. The chat hides the file affordance until provider-side extraction/vision is genuinely connected.
- Staging/public deployment, redirect activation, and public cutover remain blocked on Riley's explicit local signoff.
