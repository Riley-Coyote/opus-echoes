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
still exists on direct museum visits.

Limen is a veiled humanoid with a porcelain mask, soft robe and folded mantle.
`lab/limen-body.js` is the shared body factory and gait. It serializes portable
BufferGeometry after updating transforms. The museum does not batch away
moving limbs or replace this body with a fallback robot. Limen's conversation
content and resident behavior are unchanged.

## Editable source and builds

The museum's editable source remains in the separate `sanctuary-spatial-study`
checkout (continuity source commit `fd31eba`). The receiver changes are in `src/main.ts`, `src/scene/world.ts`, and
`src/scene/guide.ts`; the shared body is copied by the integration build below.
Existing local curation work is preserved. The embedded build includes that
source checkout's current approved exhibition and its required public assets.

```sh
bun tools/build-aperture.mjs /absolute/path/to/sanctuary-spatial-study
bun build public/sanctuary-world/lab/station.js --outfile public/sanctuary-world/station.connected.js --format=iife --target=browser --minify
bun run build
```

## Verification

- 13 focused station, route, picking and body serialization tests pass.
- 35 museum tests pass, including routes, collection provenance and asset policy.
- `scripts/limen-continuity.browser.js` checks the live doorway, camera/lens/speed
  at crossing, 1440/1024/768/540/375 widths, pause, cancellation, repeated visits,
  reduced motion and preservation of both computer documents.
- Measured crossing: camera [0, 1.65, 21.70], guide [0, 0, 18.90], speed 1.4 m/s,
  body version `veiled-keeper-1`; no camera or lens reset on ownership transfer.
- No JavaScript exceptions in the browser pass. The local presence endpoint
  still returns its pre-existing configuration error (503).

The guided entry is continuous. The explicit “Return now” action intentionally
restores the saved station view immediately; walking back follows the existing
return route. Initial phone visits retain the site's existing 2D landing policy.
Resizing an already started visit preserves the 3D station and museum.
