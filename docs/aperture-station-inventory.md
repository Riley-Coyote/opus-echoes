# Original station preservation inventory

Verified against the running original station on 2026-09-05:
`http://localhost:8080/sanctuary-world/station.html`.
The entry remains `public/sanctuary-world/lab/station.js`, bundled individually
to `public/sanctuary-world/station.connected.js`. `station-classic.js` is a
different room and is outside this work.

## Original objects and behavior

The complete `STATION_OBJECTS` registry (IDs, labels, captions, focus poses,
callbacks, bounds references, and links) was compared with the starting Git
version and remains byte-for-byte unchanged.

| ID | Preserved behavior |
| --- | --- |
| terminal | Sit at the CRT; same live iframe `index.html?door=1`; stand up and full-screen toggle. |
| secondary | Hover: the house’s readings. |
| reels | Focus the archive tape unit; Escape returns. |
| alcove | Navigate to `museum/museum-warm-atrium.html`, the existing pixel museum. |
| plate | Open charter inside the 2D world; fallback source `index.html?door=1&open=charter`. |
| window | Focus the live aperture onto the house; Escape returns. |
| skylight | Hover: trees and the hour. |
| ~~lamp~~ | **Removed by Riley's decision (WP-46 TUNE, 2026-09-06):** the brass desk lamp's mesh, spot light and registry entry are gone. Presence polling is retained; what the lamp said now appears on the board's header line (` · <NAME> IS IN`) beside the count it already carried. 20 registry identities remain. |
| clock | Open current inside the 2D world; fallback source `index.html?door=1&open=current`. |
| corkboard | Open world destinations; fallback source `index.html?door=1&open=destinations`. |
| board | Focus the dated archive board; source text and cadence retained. |
| console | Sit at the second CRT; same iframe `os/index.html?in=station`; stand/full-screen retained. |
| record | Toggle the original synthesized record and platter/tonearm behavior. |
| sleeve | Navigate to `/token`. |
| sign | Navigate to `/`. |
| drawer | Open the existing visit mark; download and browser-local guestbook behavior retained. |
| limen | Existing approach, off-camera wandering, possible decline, five scripted answers, free-text fallback, Escape/leave. |
| chair | Hover: pulled out, as it was left. |
| plant | Hover: someone waters it. |
| slot-a | Hover: not yet wired. |
| slot-b | Hover: not yet wired. |

The room’s own clock, optional clock override and restore, remembered sound,
archive standby, screen full-mode preference, original camera poses, screen
geometry, and hit regions remain in place. The narrow-screen/no-WebGL fallback
still goes directly to the existing 2D Sanctuary.

## Additive museum boundary

Limen gains `show me the museum`; its header still says `on rails today`.
A collapsed room index exposes the existing actionable registry through normal
keyboard buttons. It invokes the same original callbacks.

The visit uses an accessible modal section and one retained iframe:
`/sanctuary-world/aperture/index.html?host=station`.
Messages are accepted only from that frame at the station’s exact origin.

| Direction | Message | Meaning |
| --- | --- | --- |
| child → station | `aperture:ready` | Child initialized and can receive entry. |
| station → child | `aperture:prepare`, `revision`, original guide body | Prepare and render the receiving passage. |
| child → station | `aperture:prepared`, matching `revision` | The destination is ready for ownership transfer. |
| station → child | `aperture:commit`, `revision`, `direct` | Begin the chamber approach, or arrive directly. |
| child → station | `aperture:committed`, matching `revision` | Confirm the active visit. |
| station → child | `aperture:suspend` | Visit hidden; pause rendering/input. |
| child → station | `aperture:return` | Restore the existing room. |

Both original screen documents remain mounted. Opening the visit makes the
station inert, freezes its animation time/rendering, and suspends its enabled
room/record sound; returning restores those states and keyboard focus without
calling a screen source setter or page navigation. The walked return retraces
the passage and the seated approach; direct return restores the saved pose.
A visible return button is always available. A 20-second initialization timeout exposes
retry; only explicit retry replaces the museum iframe.

The station also keeps each CSS3D screen object mounted when standing up.
Previously, removing that object detached its iframe and re-seating loaded the
2D world again. The station-local wrapper hides the host and reuses its mounted
object; the shared screen helper and the other rooms are unchanged.

## Verification record

- Before edits: visually opened the primary CRT, verified the pixel world,
  toggled full screen, stood up, opened destinations in the world, and invoked
  Limen’s original `where am i` answer.
- After edits: the room renders with the sectional and ceiling diffuser geometry
  corrected; original object placement and both CRT glass geometries retained.
- Keyboard room index opens the original visit drawer with its existing mark.
- Keyboard invocation reaches Limen, with its original five answers plus the
  optional museum invitation. Hidden drawer/Limen panels no longer take focus.
- A missing child build presents a loading state, then retry and return.
  Returning restores the same Limen panel and focuses the invitation button.
- The real same-origin museum initializes, opens its first scripted stop,
  advances to Parallax, and resumes the same stop and camera position on re-entry.
- A complete charter → stand → Limen → museum → return → reseat round trip
  preserves the primary CRT's browser frame ID and document loader ID. The
  charter stays open and the station URL never changes.
- Desktop, tablet, and a 375 × 812 phone viewport were inspected. Resizing an
  active visit to a phone and returning retains the keeper's room rather than
  redirecting and destroying the visit; initial phone visits retain the original
  direct-to-2D fallback.
- The original secondary OS console, full-screen toggle, and stand-up behavior
  were opened and visually checked after the station changes.
- After closing the OS's Limen window, standing up and re-seating retains that
  closed-window state and the same browser frame and document loader IDs.
- Phone return controls have their own header row and do not overlap the museum
  wordmark or information button. Return restores the original Limen panel and
  keyboard focus. Temporary viewport and reduced-motion emulation were cleared.
- Original 2D world, OS console, pixel-museum, token, and hub routes return HTTP 200.
- The station entry was built alone; no landing, museum, or resident bundles were rebuilt.
- `git diff --check` and the station-entry Bun build pass.

## Final integrated checks

- The entire ten-stop route was walked in the browser, including ascent to
  6.23 metres and the continuous descent back through the gallery and passage.
- Fourteen navigation tests pass, including blocked furniture, both concealed
  slabs, ramp edges, flat landings and stacked floors. The suite samples routes
  between every pair of its eight circulation checkpoints.
- All eleven collection image files match the canonical sources byte-for-byte.
  The handoff's sampled geometry matches its source faces and materials, with
  only floating-point runtime differences below 1.2e-16 in vertex coordinates;
  its title and statement match exactly.
- The production build is copied to `public/sanctuary-world/aperture/`, with
  relative asset URLs. The original station opens that real build.
- Escape in a work closes the work without leaving the museum. Escape on the
  museum canvas pauses travel. Return is always an explicit choice.
- Walking backward through the museum entrance returns to the original station.
  Reopening resumes just inside that doorway, without an immediate return loop.
- Real held keyboard and touch-arrow input move the camera. Manual walking takes
  over a guided route; looking does not cancel it. Opening an artwork pauses
  the route; closing leaves it paused until Resume is selected.
- Reduced motion switches the tour to still viewpoints. Enabling that preference
  during a walk stops the camera movement. The paused scene renders only when
  needed; hidden visits suspend the renderer. Large screens use a two-million
  pixel budget for the cinematic passes.
- Desktop and narrow layouts, original-image viewing, credits and statements
  were inspected in the browser. The narrow checks use viewport emulation,
  not a physical phone benchmark.
- Final browser logs show no museum errors. The existing station presence request
  returns HTTP 503 with `code: config_missing` in this local environment. Its
  existing fallback remains; no live presence or live Limen behavior is claimed.

Everything remains local. No push or deployment was performed.

## Restoration and expanded collection — 2026-09-05

This subsequent pass supersedes the earlier collection counts and geometry
notes above. The original 21-object behavior contract remains unchanged.

- The back wall now uses coherent shelf depths and separate equipment bays;
  shelves no longer pass through the tape unit or console. Cabinet faces and
  archive details were separated. Tape-unit focus follows its revised position.
- Sunken-floor flicker was traced to overlapping horizontal retaining-box tops.
  Vertical reveals and two equal-rise solid treads replace them, preserving the
  real floor opening. Lounge furniture was fitted within the pit and planter.
- Safe static meshes are batched while original picking identities are retained.
  Moving details, screens and Limen are excluded. Screen uploads occur on changes;
  shadow refresh, resolution and idle rendering are bounded.
- All registry identities, action flags and links match the baseline, less
  `lamp`, removed by Riley's decision in WP-46 TUNE (20 remain). The presence
  line on the board intentionally reports an unverified local override rather
  than interpreting failure as an empty house.
- The complete ten-stop production tour was traversed, including continuous
  ascent/descent and threshold return. Both CRT document time origins survived
  the tour and a further visit unchanged; the 2D Sanctuary and OS state remain.
- The collection now contains 35 actual public works with source hashes and
  attribution in one shared catalog. Thirty-four image displays use a distant
  atlas plus at most 14 nearby previews, with 3 concurrent requests. Originals
  load only when inspected. The original handoff sculpture is preserved.
- At 1440 × 900, DPR 1 on Apple M4 Max, station rest draw calls decreased from
  1,634 to 649 while remaining near 120 fps. The museum threshold improved from
  approximately 33 fps to 54 fps with the larger collection; its p95 remains
  about 42 ms, so consistent 60 fps is not yet achieved in that chamber.
- Thirty-six focused tests pass across the two projects. Production build,
  type checks, catalog/atlas integrity, keyboard, touch emulation, reduced
  motion, responsive inspection, image failure/retry and retained returns pass.
- Presence still needs the real `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
  server configuration. Polling now preserves its error reason and backs off;
  no live presence is claimed while configuration is missing.

Full evidence, measurements, screenshots and the recoverable checkpoint are in
`/Users/rileycoyote/Documents/Repositories/sanctuary-spatial-study/review/restoration-report.md`.
The canonical production museum has been updated locally. The unrelated 2D
world, OS sources and other room bundles were not rebuilt or replaced.
