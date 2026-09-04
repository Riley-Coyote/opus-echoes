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
