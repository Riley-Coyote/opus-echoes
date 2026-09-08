# Limen's continuous entrance

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
`lab/limen-body.js` is the shared body factory and motion rig. It serializes portable
BufferGeometry after updating transforms. The museum does not batch away
moving fabric or replace this body with a fallback robot. Limen's conversation
content and resident behavior are unchanged.

## Editable source and builds

The museum's editable source remains in the separate `sanctuary-spatial-study`
checkout (continuity source commits `fd31eba` and `135ca5e`; floating/performance source `0f72f07`). The receiver changes are in `src/main.ts`, `src/scene/world.ts`, and
`src/scene/guide.ts`; the shared body is copied by the integration build below.
Existing local curation work is preserved. The embedded build includes that
source checkout's current approved exhibition and its required public assets.

```sh
bun tools/build-aperture.mjs /absolute/path/to/sanctuary-spatial-study
bun build public/sanctuary-world/lab/station.js --outfile public/sanctuary-world/station.connected.js --format=iife --target=browser --minify
bun run build
```

## Verification

- 16 focused station, route, picking and body serialization tests pass.
- 37 museum tests pass, including routes, collection provenance and asset policy.
- `scripts/limen-continuity.browser.js` checks the live doorway, camera/lens/speed
  at crossing, 1440/1024/768/540/375 widths, pause, cancellation, repeated visits,
  reduced motion and preservation of both computer documents.
- Measured crossing: camera [0, 1.65, 21.70], guide [0, 0, 18.90], speed 1.4 m/s,
  body version `floating-keeper-2`; no camera or lens reset on ownership transfer.
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
