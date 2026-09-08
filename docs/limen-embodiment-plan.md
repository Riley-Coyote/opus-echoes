# Limen: embodiment and museum finish

Date: 2026-09-08

Status: the first playable body-and-cloth milestone is implemented and ready for
creative review. Phases 1–3 have an engineering proof; phase 4 has an initial
material study. The museum bay and final integrated finish remain ahead.
This plan continues the working entrance documented in
[Limen's continuous entrance](limen-entrance.md).

## Direction and first milestone

Limen is a patient presence that belongs to this place. It notices the visitor,
makes room for them, and helps them discover the museum at their own pace.

Preserve the porcelain mask, recognizable proportions, robe, folded mantle, and
floating lower body that Riley likes. Develop weight, attention, cloth deformation,
and the relationship to light and architecture. Maintain the continuous journey
from the station through the hall and into the existing museum.

The first milestone is a playable encounter on that real route: acknowledge,
invite, turn, travel, wait, resume, reveal the museum, and make space. The complete
route remains available; a short repeatable section concentrates reviews on the
turn, pause, and threshold. One nearby museum bay establishes the later standard
for materials and construction detail.

## Working arrangement with Riley

No files, references, technical decisions, or additional creative brief are needed
to begin. The current conversation supplies the direction above.

Codex handles source inspection, references, technical choices, implementation,
visual comparisons, measurement, and maintenance of this plan. Compare small
alternatives internally and bring Riley the strongest coherent result, with a
comparison only when it helps resolve a real choice.

Riley's two main review moments are the embodied encounter and the finished
museum bay. Ask for reactions to the actual experience: the character's bearing,
the comfort of following it, and the balance of detail in the room. Routine
implementation does not require another permission round. Ask a direct, focused
question only when a material creative choice remains unresolved after inspection.

Use current tools and existing or appropriately licensed free resources for the
first milestone. If an outside artist or paid asset would materially improve the
finish, first prepare a specific option, its purpose, cost, and usable deliverable;
then ask Riley about that option before spending or engaging anyone.

## Phases and completion criteria

| Phase | Work and dependencies | Evidence required to complete it | Riley's involvement |
| --- | --- | --- | --- |
| 1. Establish the reference and baseline | Record the current route and representative pauses. Annotate a small set of physical and social movement references. Map the motion and renderer handoff. | A reproducible route, current performance sample, concise movement score, and a documented simulation-state contract. | None needed. |
| 2. Give the body intention and inertia | Build on phase 1: controlled acceleration and banking, separate head/shoulder response, purposeful acknowledgement, comfortable waiting, and arrival beside the visitor. Keep the present visual body while tuning performance. | The same encounter reads clearly at normal speed; stopping and resuming feel composed; both scenes apply the same motion state. | Only if the intended character cannot be resolved from the approved direction. |
| 3. Make the robe respond physically | Add a coarse cloth simulation to the accepted body movement. Tune shoulder attachment, bending, stretch resistance, damping, and collision. Drive the visible fabric from the smaller simulation. | Cloth trails turns and settles after stopping; ordinary movement produces no visible body/wall penetration, unstable stretching, or handoff reset. The measured cost fits the budget. | Review the playable embodied encounter; one focused request for feedback. |
| 4. Refine the character asset | Refine shoulder construction, mask, hands, seams, cloth thickness, and material response around the accepted motion. Evaluate a sculpted/rigged GLB when it improves the result and survives both renderers. | Recognizable silhouette, convincing deformation and materials at actual viewing distances, correct picking and shadows, bounded loading and rendering cost. | Request a decision only if a proposed asset changes the approved identity or requires outside resources. |
| 5. Finish one museum bay | Improve the existing entrance-side wall/floor/display area: bevels, joints, frame or plinth construction, suitable surface maps, indirect light, reflections, and contact with the floor. | One complete area works under the real approach camera and with moving Limen; artwork remains readable; performance and source provenance are retained. | Review the material and lighting balance in the running world. |
| 6. Integrate, verify, and carry the standard forward | Verify the full journey with phases 2–5 together. Retain proven assets and settings, document remaining limitations, and identify the next bounded museum area. | Relevant tests and builds pass; visual, continuity, interruption, and real-time performance evidence is attached to the implementation. | Report the result and ask only about a remaining material choice. |

Phases are ordered by dependency. Recheck performance during every implementation
phase. A visual pass is complete when its concrete criteria are met. Complete the
project's visual review iterations on meaningful implementation changes, using
each pass to resolve an observed issue. Revisit an earlier phase when new evidence
invalidates an assumption.

## Movement score

| Situation | Intended performance | What to inspect |
| --- | --- | --- |
| Acknowledge | One readable orientation toward the visitor; shoulders follow the gaze. | The character notices without repeatedly tracking small pointer movements. |
| Start and turn | Body anticipates the route, accelerates gently, and banks subtly; arms and fabric respond with different delays. | Smooth curvature, comfortable camera movement, and a legible sense of mass. |
| Wait | Traversal stops; a small amount of settling completes; the posture becomes quiet. | Comfortable personal space, stable gaze, and fabric that can come to rest. |
| Resume | Continue from the held state with a deliberate restart. | No pose jump, catch-up burst, or restarted animation phase. |
| Cross the threshold | Preserve the body, velocity, cloth, lighting relationships, and camera continuity. | Observe before, during, and after renderer ownership changes. |
| Arrive | Orient toward the museum, then take a suitable place beside the visitor. | A clear view into the room, collision clearance, and freedom to explore. |

## Technical approach to prove in phases 1–3

- Keep Three.js and the existing connected entrance as the initial rendering
  foundation. Treat WebGPU as a later measured experiment if a specific feature
  warrants migration of custom shaders and post-processing.
- Use an explicit movement/attention controller, authored pose targets, and
  damped secondary motion. Drive response from velocity, acceleration, turns,
  distance, and encounter events. Avoid a repeating idle loop dominating the pose.
- Start with a small fixed-step cloth solver, using XPBD or a simpler constrained
  proxy if the latter meets the visual criteria. Use a bounded number of steps
  and render interpolation; prevent accumulated background time from causing a
  simulation catch-up burst. Keep rest-shape controls to preserve the silhouette.
- Use simple body, floor, and nearby architecture collision shapes. Profile
  before adding expensive cloth self-collision or a broader physics dependency.
- Define one owner of each simulation step. During doorway preview, both
  renderers consume the same state; at handoff, ownership changes without a
  second integration step or a fresh idle state.
- Version the state contract. Include simulation time and interpolation state,
  root transform and velocity, angular velocity, attention state, secondary
  motion state, cloth positions/velocities, and any deterministic seed. Keep
  cloth in body-local coordinates and explicitly transform world-space values
  through the station/museum half-turn. Test serialization before increasing rig
  complexity.
- Distinguish a traversal pause from suspending an inactive browser document.
  A traversal pause holds the camera and permits controlled settling; suspension
  retains simulation state and resumes without integrating the time spent away.
- Preserve the current reduced-motion and initial phone-entry policies. Review
  resized 3D visits at the existing responsive checkpoints. Additional device
  coverage is recorded as unverified until the device is actually tested.

## Asset and museum approach

Develop the current versionable body first. A later authored asset must retain its
recognition and movement vocabulary, export reproducibly, and load correctly in
both station and museum. Check skeleton, deformation, material, texture, picking,
and shadow compatibility before adopting a new format in the entrance.

For the representative bay, prioritize visible construction and scale: edge
profiles, joints, plausible thickness, surface direction, and material response
under the existing light. Use detailed surface maps where close inspection merits
them; match their physical scale. Compare baked indirect light and local reflection
approximations with the current scene before adding recurring render passes.
Preload or prepare resources before the visitor reaches them. Compress textures
and simplify distant objects where the visible result is preserved.

The exhibition's placement, creators' original artworks, and attribution remain
the reference. Keep independent curation work intact. This work concerns visual
embodiment and the room's physical finish; it does not change resident prompts,
conversation content, or memory behavior. Any later work that does affect resident
conversation must follow the repository's live-conversation verification rule.

## Evidence and acceptance

The previous recorded result at application commit `92a5b18` was doorway mean/p95
11.65/17.2 ms and museum mean/p95 10.72/17.0 ms on Chrome, Apple M4 Max, 1440 × 900.
These are historical samples, not measurements from this planning pass. Phase 1
must refresh the baseline against the current build and record browser, device,
viewport, render scale, route, sample length, and active workload.

The initial desktop target is a steady experience around 60 fps or better, with
no new loading stalls after travel begins. Set the incremental simulation budget
from the refreshed baseline; start by testing whether combined body/cloth CPU
work can stay below 1 ms at p95 on that desktop. This is a provisional engineering
target, not a claimed result or a guarantee for other devices. Investigate any
new movement-time long task or matched journey p95 regression above 10% before
accepting a candidate. Repeat a comparison when workload noise makes it ambiguous.

For each accepted implementation:

- Watch the running experience and matching captures at normal speed. Use slow
  playback or frame inspection to diagnose a specific discontinuity.
- Exercise starts, turns, waiting, resuming, doorway crossing, looking back,
  cancellation, repeat visits, existing return actions, resize, and tab restoration.
- Check reduced motion, keyboard/focus behavior, visible controls and art picking.
  Review at 1920, 1440, 1024, 768, 540, and 375 widths as appropriate to the existing
  entry policy; keep visual resizing tests distinct from physical-device testing.
- Extend focused motion/serialization tests for meaningful invariants, including
  finite bounded state and frame-rate-independent progression. Extend the existing
  browser continuity test for any new state carried across the entrance.
- Use actual wall-clock frames for performance evidence. Deterministic
  `advanceTime` checks demonstrate state/route behavior, not smooth frame pacing.
- Run relevant station and museum tests and the paired builds. Separate known
  baseline errors, including the local presence configuration 503, from new errors.

## Source ownership and delivery

Application checkout:
`/Users/rileycoyote/Documents/CLAUDE/Projects/The Sanctuary/opus-echoes-live`

Museum source checkout:
`/Users/rileycoyote/Documents/Repositories/sanctuary-spatial-study`

The application's `public/sanctuary-world/lab/limen-body.js` is the shared body
source. `tools/build-aperture.mjs` copies it into the museum source and builds the
embedded museum; rebuild the station bundle as well. The source map and build
commands are in [the entrance notes](limen-entrance.md).

The museum checkout contains independent, uncommitted curation work. Snapshot
the relevant working files before implementation and commit only the scoped
changes. Validate both the working build and any selectively staged source.
Follow the application's sync, branch, rebase, and staging-push protocol. Retain
the prior working implementation and the evidence needed to compare or revise
each change. The local preview stays available; live publishing is separate.

## Decision record

| Decision | Basis | Status |
| --- | --- | --- |
| Preserve the current character and floating form | Riley explicitly likes the character and requested a floating lower body. | Established |
| Develop quiet attention, inertia, and responsive cloth | Riley endorsed this direction and the creative workflow in the conversation. | Working direction |
| Prove one encounter and one museum bay first | Makes character, rendering, and environmental relationships reviewable together. | Planned sequence |
| Use current WebGL rendering for the initial milestone | Protect the working entrance while measuring the new simulation. | Engineering default; revisit with evidence |
| No further inputs are needed to begin | Identity, scope, local assets, and the first review are already defined. | Current |

Add accepted changes here with their reason and evidence. Keep candidates and
unresolved questions labeled as such. Record artistic reactions in Riley's words
when practical. This is the project decision record, not a change to resident or
personal memory systems.

## First playable milestone — 2026-09-08

Implemented the encounter on the actual entrance route. Limen acknowledges the
visitor before departing, uses separate damped responses for body, head and arms,
and turns toward a waiting visitor while the camera stays still. The robe and
split mantle deform from a 351-point, fixed-60-Hz XPBD proxy. Their attachment,
stretch, bend, damping and tailored rest shape preserve the floating silhouette.
The body has smoother robe profiles, restrained fabric normal/roughness detail,
cloth sheen and a visible clasp. There are no guide footstep sounds.

Movement/reference annotations used for this study:

- Attention: the existing hall pause is the repeatable encounter. The head
  responds before the chest; a slower body turn completes the acknowledgement.
  The held camera and stable visitor target make the timing easy to compare.
- Cloth: the XPBD reference informs compliant distance constraints and fixed
  integration. Disney's simulation process informs the use of authored shape
  and attachment controls. The shoulder stays composed while the lower fabric
  trails acceleration and settles; physical accuracy alone is not the criterion.
- Material scale: the first generated weave read too coarsely at normal viewing
  distance. Smaller repeated detail, mipmaps and lower normal strength made the
  fabric quieter. No external character asset or motion capture was adopted.

The version-3 state contract and matched performance evidence are recorded in
[the entrance notes](limen-entrance.md). Six-width continuity checks compare body
pose, cloth positions and Verlet history between renderers. Starts, turns,
waiting, keyboard resume, crossing, repeat visits, cancellation, returns and
reduced motion pass. The visibility lifecycle is tested explicitly because
the headless browser does not hide a page when another tab is selected; actual
native tab switching remains a separate device check.

The matched 50-second comparison preserves frame pacing on the current M4 Max:
doorway mean/p95 12.79/17.6 → 12.54/17.4 ms; museum 10.55/16.8 → 10.48/16.9 ms.
Both runs have zero movement frames over 33.5 ms. Complete body/cloth CPU samples
are about 0.6 ms p95 in the station and 1.0–1.2 ms in the museum under this
desktop workload. The latter sometimes exceeds the provisional sub-1-ms target;
retain that optimization target while protecting the measured journey budget.

Current limits: collision uses analytic body shapes, floor clearance and the
existing safe navigation routes. Arbitrary architecture cloth collision and
cloth self-collision are not implemented. The current geometry is an improved
procedural study; bespoke sculpting, garment construction and the representative
museum bay are still future work. Visual resizing does not certify phone GPUs.

## Immediate next work

1. Review the playable pause/acknowledgement/threshold encounter with Riley.
   The useful input is whether Limen's bearing feels calm and attentive in motion.
2. Refine the shoulder, mantle construction and small-scale character details
   around that response. Keep the shared rig and performance evidence intact.
3. Develop the planned entrance-side museum bay and bring that finished area to
   the second creative review. Then complete the combined integration phase.

## Technical references

- [Three.js skeletal animation](https://threejs.org/docs/pages/SkinnedMesh.html)
- [Three.js physical materials](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
- [XPBD research](https://mmacklin.com/xpbd.pdf)
- [Three.js WebGPU migration requirements](https://threejs.org/manual/en/webgpurenderer.html)
- [Character simulation as an authored craft](https://disneyanimation.com/process/simulation/)
