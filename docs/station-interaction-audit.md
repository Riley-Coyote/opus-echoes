# Station interaction repair — 6 September 2026

Canonical room: `http://localhost:8080/sanctuary-world/station.html` in this checkout. This is a local repair to the original landing room, not a replacement station. Existing accumulated Aperture changes were retained. Before-edit copies are in `/tmp/station-interactions-before-20260906-144650`.

## What changed

Limen now plans a route across the upper floor using actual furniture bounds, the pit outline and a 30 cm body clearance. Calling, returning and idle relocation use the same planner; the museum's initial guide rendezvous also uses it. Routes are computed on destination changes, not every frame. An inaccessible route stops rather than reverting to a straight line. The visitor's gaze gently follows an approaching Limen and returns to the room afterward. Escape cancels an approach.

Wall objects have their own focus poses and room-local readers. Readers appear after arrival, trap keyboard focus, preserve the computers, and have a consistent Close/Escape return. Sources are dated public archive material; profiles do not imply live availability or invent resident biography. The brass charter label was separated from its backing to remove coplanar flicker.

Both computers open on their physical screens. Fullscreen is explicit on each visit. Camera movement has eased starts and stops and a level horizon. Loading starts during approach behind the boot display; reveal fades in on the glass, and stale arrival callbacks cannot reopen a cancelled view. The console iframe aspect ratio now matches its actual screen geometry. Choosing a wall object from the seated room index withdraws from the computer before approaching the object.

An additional click test inside the CRT found a pre-existing input bug in `landing.js`: the page's `html.door` layout class matched a broad modal selector and selected a hidden descendant dialog. That made the visible computer toolbar inert. The selector now requires a dialog directly inside its open overlay. Destinations opens and closes through real pointer/keyboard input on the CRT.

## Complete object audit

| Object IDs | Result |
| --- | --- |
| `limen` | Floor-aware approach/return/idle routes; visible conversation framing; scripted museum invitation retained. |
| `terminal` | Sanctuary remains on the CRT; its toolbar works; fullscreen only by choice. |
| `console` | Retained Topologie OS; corrected screen fit; explicit fullscreen. |
| `corkboard` | Focuses the physical board; four resident cards, profiles and verbatim published journal entries. |
| `alcove` | Focuses the archive bay; dated collection context; deliberate pixel-museum link opens separately. |
| `plate` | Focuses the charter plaque and opens a readable published charter. |
| `clock`, `board` | Focus their own locations and open dated house writing. |
| `sleeve`, `sign` | Focus their objects, then offer labelled links to the token page or hub; no immediate ejection. |
| `reels`, `window` | Existing close inspection and return preserved and tested. |
| `record` | Play/stop and platter behavior preserved and tested. |
| `drawer` | Existing drawer, keepsake and local visitor-mark behavior preserved; open/close tested. |
| `secondary`, `skylight`, `chair`, `plant`, `slot-a`, `slot-b` | Six descriptive props, with no misleading pointer/action. (`lamp` was the seventh; it was removed by Riley's decision in WP-46 TUNE and its presence signal moved to the board's header line.) Unconnected berths remain labelled honestly. Furniture now occludes picking through it. |

## Verification

- Targeted station and landing bundles rebuilt. `git diff --check` passed.
- **19 tests passed** across navigation, picking, journey, batching, terminal lifecycle and presence. Route tests sweep all pairs of the five standing locations, conversation stop and passage rendezvous. Separate tests cover inaccessible goals, thin/diagonal blockers and picks behind furniture.
- Browser pointer audit exercised every actionable object. All four resident profiles, room-index travel from a seated computer, document preservation, explicit fullscreen, actual CRT toolbar input, record toggling and drawer dismissal passed. Replay: `scripts/station-interactions.browser.js` (Playwright `browser_run_code_unsafe`, disposable page).
- Final normal-motion Limen approach: **860 recorded observations, zero overlaps with the expanded furniture/pit boundaries**, ending at `[-1.9, 2.75]`. The final conversation visibly faces the guide. This is a conservative floor-footprint check, not a full animated-mesh collision solver.
- **Five museum round trips** retained both computer documents and their performance time origins, active OS Terminal window, explicit fullscreen state, and the unsent draft “Retain this unsent draft.” Collection open/search/close also passed. Replay: `scripts/station-retention.browser.js`.
- A separate real Limen invitation tested walking to the passage, pause, direct arrival and return. The original room and conversation were restored.
- Desktop captures inspected at 1440×1080 and 1440×900. The 800×900 reader layout, keyboard focus containment, reduced motion, simulated document failure/retry and original 390 px phone fallback were checked.
- Cancelled computer approach returned to rest with both hosts hidden; delayed callbacks did not reveal the computer afterward.
- Hub, token, pixel museum and charter source links returned HTTP 200 locally.

## Limits

The existing `/api/presence` endpoint still returns 503 in this local environment. The room displays unavailable presence instead of inventing a live state. No new browser warnings were observed. This pass verifies interaction behavior and route clearance; it does not certify a new overall frame-rate target or production deployment. The existing phone-sized first visit still enters the 2D Sanctuary.

## Visual evidence

![Limen conversation on the foreground walkway](review/station-interactions/limen-conversation.png)
![Resident directory in the smaller room viewport](review/station-interactions/small-directory.png)
![Working Destinations window inside the original CRT](review/station-interactions/computer-destinations.png)
