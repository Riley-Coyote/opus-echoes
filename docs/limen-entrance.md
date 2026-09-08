# Anima's continuous entrance

## Current keeper — 2026-09-08

The Station keeper is now **Anima**: a ceramic mask in a sewn cowl, warm linen,
an umber mantle and aged bronze fittings. The body remains suspended, with the
same attention, cloth and momentum simulation. `anima-keeper-4` identifies this
body; existing `limen-*` internal rig names remain the continuity interface.
Visitor-facing Station and museum labels use Anima. This is the existing scripted
keeper role; no resident identity, live conversation or authored work was changed.

For a keeper-only update while museum curation is in progress, run:

```sh
bun tools/refresh-aperture-keeper.mjs
bun build public/sanctuary-world/lab/station.js --outfile public/sanctuary-world/station.connected.js --format=iife --target=browser --minify
```

The guarded adapter makes the existing museum export use the shared body factory
and updates keeper-name literals. It preserves the exhibition and its assets,
rehashes the entry module, and fails if it cannot recognize the factory. The
full `build-aperture` flow also runs it. Do not rebuild another agent's unfinished
curation merely to change this keeper.

Browser verification: the new body, pose, cloth and momentum match across the
doorway at six widths (375–1920), with keyboard pause/resume, reduced motion,
cancellation, repeated visits and both original computer documents retained.
The notes below retain the earlier implementation and measurement history.

## Entrance implementation

The next embodiment and material work is sequenced in the
[Limen embodiment plan](limen-embodiment-plan.md). These entrance notes describe
the current implementation and its recorded verification.

The station enters the museum through a live perspective window, not a dark
end wall. Both renderers retain their documents. While approaching the opening,
the museum renders synchronously from the station camera through a projected
doorway mask. At the crossing, the same rendered view becomes interactive.

The mapping is a half-turn: museum x = 6.7 − station x; museum z = 32.85 −
station z; height is unchanged. The opening is at station z = 10.84; control
passes at z = 11.15 (museum z = 21.70). Camera quaternion, vertical field of
view, walking speed and the guide pose are preserved. The receiver clips its
standalone keeper fixture out of the connected opening. That standalone room
still exists on direct museum visits. A portable snapshot of the real station
passage remains behind the threshold, so looking back does not reveal a void.

Limen is a floating keeper with a porcelain mask, tapered robe and folded mantle.
`lab/limen-body.js` is the shared body factory and render rig; `lab/limen-motion.js`
owns the renderer-independent pose and cloth simulation. The body serializes portable
BufferGeometry after updating transforms. The museum does not batch away
moving fabric or replace this body with a fallback robot. Limen's conversation
content and resident behavior are unchanged.

## Editable source and builds

The museum's editable source remains in the separate `sanctuary-spatial-study`
checkout (continuity source commits `fd31eba` and `135ca5e`; floating/performance
source `0f72f07`; living embodiment source `64eb5b0`). The receiver changes are in `src/main.ts`, `src/scene/world.ts`, and
`src/scene/guide.ts`; the shared body is copied by the integration build below.
Existing local curation work is preserved. The embedded build includes that
source checkout's current approved exhibition and its required public assets.

```sh
bun tools/build-aperture.mjs /absolute/path/to/sanctuary-spatial-study
bun build public/sanctuary-world/lab/station.js --outfile public/sanctuary-world/station.connected.js --format=iife --target=browser --minify
bun run build
```

## Verification

- 20 focused station, route, picking, body serialization and motion tests pass.
- 37 museum tests pass, including routes, collection provenance and asset policy.
- `scripts/limen-continuity.browser.js` checks the live doorway, camera/lens/speed
  at crossing, 1920/1440/1024/768/540/375 widths, matching cloth and momentum,
  pause, keyboard resume, cancellation, repeated visits, reduced motion,
  explicit visibility lifecycle and preservation of both computer documents.
- Measured crossing: camera [0, 1.65, 21.70], guide [0, 0, 18.90], speed 1.4 m/s,
  body version `living-keeper-3`; no camera or lens reset on ownership transfer.
- No JavaScript exceptions in the browser pass. The local presence endpoint
  still returns its pre-existing configuration error (503).

The guided entry is continuous. The explicit “Return now” action intentionally
restores the saved station view immediately; walking back follows the existing
return route. Initial phone visits retain the site's existing 2D landing policy.
Resizing an already started visit preserves the 3D station and museum.

## Floating motion and rendering budget — 2026-09-08

The body has no legs or feet. Its closed robe and tapered shoulder veils remain
above the floor, with a soft ground shadow and slow lift. Motion phase and glide
blend travel with the body, including when the source is paused. Camera staging
uses smoother acceleration; the museum guide eases toward its final place and
turns toward the visitor without switching to a different arrival pose.

The receiver starts suspended. Texture uploads, video material preparation,
shader linking and an asynchronous first-frame GPU fence finish before camera
movement. During the approach, scene shading is bounded to the projected doorway;
the station skips its render once that view fills the screen. Off-screen room
animation/uploads and station shadow refreshes are held while the room is occluded.
The retained computer documents are neither navigated nor recreated.

Museum frame hardware is batched by room/material while retaining precise artwork
hit targets. Six reusable practical-light slots fade between nearby fixtures;
key lighting and shadow sources remain separate. This keeps the point-light shader
budget constant across rooms. Bloom uses smaller intermediate buffers. Repeated
same-size resizes are ignored, and adaptive resolution changes wait until travel
has stopped. These follow the frame-budget and static-geometry principles in
[Rendering performance](https://web.dev/articles/rendering-performance) and
[Three.js geometry optimization](https://threejs.org/manual/en/optimize-lots-of-objects.html).

A matched 50-second wall-clock walk in Chrome on Apple M4 Max, 1440 × 900:

| Segment | Before mean / p95 | After mean / p95 |
| --- | --- | --- |
| Doorway approach | 23.29 / 33.7 ms | 11.65 / 17.2 ms |
| Inside museum | 22.61 / 33.0 ms | 10.72 / 17.0 ms |

The old walk included 533 ms and 223 ms loading tasks during staging. In the new
walk, all observed long tasks occur during preparation, before either the camera
or guide moves. Museum travel has no frames above 33.5 ms in this sample; doorway
travel has one. The final museum render scale is 1.00 versus 0.92 before.

The comparison uses the prior committed bundles and the new build in the same
browser tab; the previous QA tab was frozen for both runs. Other desktop apps
remain open. These measurements are specific to this device and workload, not
a guarantee for all hardware. `scripts/limen-performance.browser.js` repeats the
wall-clock probe without using `advanceTime`. Raw local samples are in
`/tmp/limen-performance/{before,after}.json`.

## Living embodiment — 2026-09-08

The current rig responds to measured root velocity, acceleration and turns.
Damped head/chest targets establish attention before the whole-body turn; arms
lag the body. Waiting holds the camera while the figure acknowledges the visitor
and its cloth settles. Simulation continues during a traversal pause and stops
during document suspension. Reduced motion holds a quiet, undeformed pose.

The robe and two veils use 351 simulation points, five XPBD constraint iterations
at 60 Hz, and interpolated deformation of the authored mesh. Structural, shear
and bend constraints retain the garment's shape. Pinned shoulders, analytic
body colliders, a floor limit and bounded displacement keep ordinary route
movement controlled. Cloth self-collision and arbitrary architecture collision
are future work. Fine fabric maps and sheen supplement the geometric folds.

### Motion-state contract

`living-keeper-3` carries a version-3 `limenMotion` object with time, accumulator,
step count, world root `[x,y,z,yaw]`, world velocity, turn rate, glide, attention,
current/previous body pose, pose velocity and each cloth proxy's current/previous
positions. The previous cloth positions are its Verlet velocity history.

During preview, the station alone advances this state. The portal maps root and
velocity through the half-turn; local pose and cloth remain unchanged. The museum
copies into private reusable arrays and renders the same interpolation fraction.
On crossing it continues that state once per step. It never shares writable
physics arrays with the source. Quaternion-derived yaw avoids ambiguous Euler
decomposition at a half-turn. Suspensions and relocations discard catch-up time
and spurious root impulses. Portable body serialization also clones the state.

### Matched frame-pacing check

Two consecutive 50-second, real-time walks in the same Chrome tab on Apple M4
Max at 1440 × 900, render scale 1.00, with other desktop applications open:

| Segment | Prior floating body mean / p95 | Living body mean / p95 |
| --- | --- | --- |
| Hall | 8.36 / 9.3 ms | 8.36 / 9.2 ms |
| Doorway | 12.79 / 17.6 ms | 12.54 / 17.4 ms |
| Museum | 10.55 / 16.8 ms | 10.48 / 16.9 ms |

Neither run records movement frames above 33.5 ms or application exceptions.
All observed long tasks occur during preparation. An earlier quiet-desktop
baseline ran at 120 Hz; repeating the old build established that the later
slowdown also affects the baseline. These matched results support preserving
frame pacing, not claiming a universal speedup or a device-independent guarantee.
Full body/cloth CPU p95 is about 0.6 ms in the station and 1.0–1.2 ms in the
museum; the museum sometimes exceeds the provisional sub-1-ms stretch target.
Raw comparison: `/tmp/limen-presence/matched-{before,after}.json`.

The 20 station and 37 museum tests, paired build, complete production build and
selectively staged museum-source typecheck pass. Focused motion tests cover
30/60/120-Hz progression, settling, bounds, suspension, reduced motion and
independent state ownership. Browser checks pass at all six widths, including
keyboard pause/resume and an explicit visibility lifecycle fixture. Headless tab
selection does not generate native hiding here, so native tab switching remains
unverified. The supplied game client and successive doorway/wait captures were
reviewed; its only console error is the known local presence 503.

This is the first playable embodiment milestone. Detailed character construction,
a representative museum bay and their final combined finish remain in the plan.
