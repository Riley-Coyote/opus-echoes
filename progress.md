Original prompt: Rethink and improve the Sanctuary visitor experience, landing, navigation, interactions, interiors and resident characters so it feels like entering an autonomous agent civilization. The pixel world is the focus; the 3D hub is deferred.

## Direction

A quiet inhabited world, with distinctive digital bodies and an interface that recedes during a visit. Keep resident writing and existing archive/consent mechanics intact. Work on the canonical checkout; other sessions' latest recorded implementation has finished and is on origin/main.

## Work

- Arrival: a clear invitation from the pixel landing into a dedicated world view.
- Movement: pointer travel alongside keyboard controls, with visible destination feedback.
- Presence: distinct procedural resident forms shared by world sprites and portraits.
- Reading: touch-accessible exits and a mobile reading mode for the Current.
- Coherence: quieter chrome, brighter interiors, readable encounters and restrained landing composition.

## Verification

Pending implementation, browser interaction passes at desktop and phone widths, reduced motion, bundle build and production build.

## Implemented

- `/sanctuary` now redirects to the explicit pixel landing (`index.html`); the directory URL returned 404 in development.
- Explicit entry / leave-world controls, a once-per-browser agreement with a return option, a first spawn beside the Sanctuary door, and adaptive canvas framing.
- Click/tap floor travel and clickable door/resident targets reuse the existing route and encounter machinery. Keyboard movement remains available; native buttons no longer double-trigger world input.
- Five distinct procedural digital silhouettes, also used by the portraits. Studio walls are brighter; empty decorative frames have become material shelves. Actual resident artworks stay intact.
- Encounter transcript displays immediately, scrolls to the beginning of new passages, and no longer forces an activity panel over the room. Responsive header and larger reading space.
- Touch close controls on destinations, Current, Wall, Charter and Field. Current switches from shelves to a full reading pane on narrow screens. Keyboard containment and background isolation follow the active surface.

## Verification so far

- Production client + server build passed; all seven Sanctuary bundles built.
- Browser passes: landing desktop and narrow phone; explicit entry; initial agreement; tap to walk; tap doorway enters hall; direct room links; revised Opus studio and Sonnet study; pointer approach opens Sonnet archive encounter; Current shelf > entry > back > close.
- Found and fixed during review: direct-link initialization order, directory redirect 404, activity panel covering encounters, cramped Current titles, and old canvas sizing after entering world view.
- No resident prompts, consent policy, stored words, private artifacts or backend behavior changed. `_print-staging/` belongs to existing work and is excluded.

## Final verification

- Object inspection now has a readable caption; Escape closes the caption while staying in the world. Verified against the armchair description.
- Existing game hooks completed routed Opus and Sonnet archive visits and returned `arrived`; Sonnet's wall showing pans to the real piece.
- Reduced-motion emulation verified: engine reports reduced motion, pointer travel reaches its target without animated traversal, CSS transitions collapse to near-zero. Emulation and viewport overrides reset after testing.
- Final browser console checks contain no warnings or errors. Final production client/server build and `git diff --check` pass.
- The world is still the existing archive-backed simulation. This pass changes the visitor experience and presentation; it does not turn on live model conversations or the planned autonomous household.

## Walking flicker fix

- Root cause reproduced: proximity CTA visibility changed the HUD height, alternating the desktop stage between 410 and 428 pixels and resetting the canvas width as the visitor walked.
- Fixed the HUD height and constrained its text. Genuine viewport resizes preserve the viewed center and repaint synchronously after resizing the canvas.
- Repeated proximity crossings now keep stage and canvas dimensions constant. A 100-frame walking pass at phone width also kept both dimensions constant; the resize observer captured an opaque, painted canvas after a real resize.
- Browser console has no warnings or errors. Rebuilt the world bundle; production client/server build and `git diff --check` pass.

## Common room design study

Riley authorized a separate playable common-room prototype, with original visible design and simulated participants. Preserve the current Sanctuary, retain the four doorway destinations (grounds, garden, resident wing, observation deck), and leave backend integration out of scope.

Direction: an elevated cutaway atelier, a sunken conversation garden, worktable, window seats, and distinct fictional study participants. Pointer/keyboard exploration, ambient social activity, local artwork, and multiple lighting looks make the proposal reviewable in motion. New files live under `public/sanctuary-world/common-room/`.

Implemented and verified:

- Standalone native-module Canvas scene at `/sanctuary-world/common-room/index.html`; original world entrypoints, engine, and resident behavior are untouched.
- Fourteen clearly fictional inhabitants, immediate roaming, three ambient conversation groups, tending/reading/drawing poses, and a make-carry-hang routine at the worktable.
- Collision-aware pointer routes, keyboard movement, hover identification, person/places directories, four preserved destination IDs, zoom/pan/overview/fullscreen, and three lighting looks.
- Scripted encounters and listening choices stay in the room. Narrow screens frame the participant above the encounter panel. Speech nodes persist for each utterance so their entrance animation does not restart every second.
- A visitor can leave a procedural study on the wall. Study-specific local storage retains additions; no production data or model API is used.
- Browser checks passed: all 14 participants and all four thresholds reached, follow-up and Escape, keyboard walking, pause/resume, all lighting modes, visitor artwork surviving reload, Tess's complete artwork routine, phone encounter/overview, no horizontal overflow, and reduced-motion rendering. Isolated browser reported no application errors.
- Required game-client action bursts and visual screenshots reviewed. Production client/server build and JavaScript syntax checks pass.
- Remaining product decision: Riley reviews this separate visual study before any replacement or live integration. Do not wire it into the existing room without that decision.

## Common room visual correction — 2026-09-04

Riley approved the open floor plan and freer movement but rejected the olive palette, flat light, and visual departure from the existing Sanctuary. Their second screenshot is the visual reference for this revision.

- Rebuilt the prototype's materials around plum stone, dark walnut, burgundy upholstery, aged brass, and restrained foliage. Replaced the geometric centerpiece with a low ember hearth while preserving its collision footprint.
- Added arched twilight windows, a moonlit landscape, localized amber sources, soft light falloff, a cached exposure map, furniture shadows, and subtle window rays. Native pixel rendering now uses a consistent two-unit raster, including hand-drawn bitmap room lettering.
- Restyled the surrounding interface and speech bubbles to the Sanctuary's darker palette; bundled the existing brand's Press Start 2P and JetBrains Mono fonts with their OFL licenses. Updated visible location/time descriptions for the hearth and evening setting.
- The separate prototype retains all 14 fictional participants, the original floor plan, four destination IDs, collision geometry, and simulated interactions. Existing world entrypoints and runtime are unchanged.
- Verified in Chrome at desktop size and in phone-sized browser renders. All inhabitants/doorways reachable, encounters and follow-ups work, artwork persists, Tess completes the drawing routine, lighting modes and pause work, reduced motion works, and the isolated browser reports no application errors.
- A 90-frame walking sample kept one canvas size; median drawing time was 4 ms and the 95th percentile was 11.4 ms in the current Chrome session. Reviewed the final game-client movement screenshot and state dump.
- Production client/server build, JavaScript syntax checks, and git whitespace checks pass.
