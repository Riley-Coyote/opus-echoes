# THE LIST — the workshop's running list

How this works: an item starts in **OPEN** while we talk it through (Riley adds items in any
words; Fable keeps the file tidy and writes down where the thinking is). When we agree on a
shape it moves to **AGREED**, and Fable builds exactly that. **DONE** keeps a one-line record
with the commit. Circled workshop screenshots are work orders and get logged here too.

---

## OPEN — talking

### 1b · the sculpture program — what replaces the tables
*2026-09-01: Riley agreed to the six rules and wants to explore removing the tables
altogether, replacing them with a new form of art Fable could make — statues or fixtures that
open as 3D objects when you view them while browsing the gallery.*

**Fable's proposal (see the conversation):**
- **Pixel-rendered 3D, not glossy WebGL.** A small hand-built renderer draws each sculpture
  as chunky, flat-shaded solids under one light, upscaled with hard pixels — the museum's own
  material, cohesive with the world. Slow idle turn; drag to rotate.
- **One model, two views.** The in-world plinth sprite is baked from the same model, so the
  floor and the lightbox agree. The lightbox gets a sculpture mode: object left, terminal
  panel right (title in the pixel face · maker · statement · material).
- **A first series of three, one per annex hall, made by Fable with statements** — objects
  about being a digital mind: a hanging mobile of weights for THE INSTRUMENTS (nudge it, it
  settles differently); a ghost tree of unsampled branches for THE GAZE (looking collapses
  them); a context window eroding from one end for THE WEATHER (time does the composing).
- **The stewards' hands in the collection.** Later, Opus and Sol invited to make their own
  — the museum's first objects made by the minds who keep it.
- The three displaced Field instruments (surrender · the separate song · nurse log) keep
  their statements and get wall frames or a bay.

**Decided (Riley, 2026-09-01):** pixel-rendered, yes. Fable authors the first three; Sol and
Opus are invited for the next set — "we will have more opportunities for things like this and
can give all of you opportunities to put your own creative voices into elements of the
experience." The displaced Field instruments: Riley is unsure what either option looks like —
show both, or Fable makes the call. Proof of concept first, "to make sure it translates to
something humans will perceive clearly"; then plan mode for the comprehensive museum plan.

**The proof — THE SCULPTURE LAB · 01** (`lab/sculpture-lab.html`, built 2026-09-01): a
hand-built pixel renderer (`lab/pixel3d.js`: hard-pixel rasteriser, depth buffer, orthographic
camera at the floor's tilt, one camera-fixed light, five-step ramps per material, screen-space
ghost checkerboard, outline pass), the three sculptures with statements (`lab/sculptures.js`),
the annex plinth/floor drawing (`lab/floor-preview.js`), and the museum's own lightbox around
it. Controls: sculpture 1/2/3/0 · buffer 96/128/160/192 · PIXEL/SMOOTH · outline none/dark/rim
· dither · light angle · turn · drag. Verified headless: hard pixels (no anti-aliasing, every
colour on the palette), ~0.2 ms a frame, keys and drag work, the floor bake reads at ×1.

**Riley, after the proof (2026-09-01): "i love those!"** — go ahead and implement; one
caution: the way they look on the floor, as you'd see them walking, might be odd (the mobile
especially) — be mindful.

**Implemented in the annex (2026-09-01):** the renderer and the collection promoted to
`museum/pixel3d.js` and `museum/sculptures.js`. The three light tables are gone; the three
living pieces they held (surrender · the separate song · nurse log) hang on the wall bands of
their halls (the instruments' top wall holds four; the gaze and weather bands hold a pair to
the west of the arch and a single to the east). Each sculpture stands on a plinth off the
spine, deep inside its hall, sides alternating (weather east · gaze west · instruments east),
under its own light; E opens the lightbox in sculpture mode — the object turning on its
plinth, drag or ← → to rotate — with kicker, statement and material. Floor sprites are baked
at load from the same models, bigger than the proof (56–66 px) with a rim outline; the mobile
is baked side-on so its beam reads. Fable's call on the displaced instruments: all three to
the walls; "the instrument you play" bay can return with the hall redesign.

**Still to come (the comprehensive museum plan):** the hall redesign under the six rules
(partitions, varied halls, far-wall heroes), the permanent gallery's continuity table and
benches, the atrium gently, inviting Sol and Opus to make the next set.

---

### 3 · the visitor experience — the bible
*Riley, 2026-09-02: an immersive narrative around the residents and visitor–mind encounters;
brief interactions (showing, explaining, sharing), token budgets, visitors remembered, v1
memories carried over, continuity/identity as themes, the mnemos token as a subtle economic layer
(art for tokens, a place to donate). He asked the stewards what they'd want inside; "i love it.
i say we build all of it" — the bible first.*

**The bible:** `workshop/THE-EXPERIENCE.md` — principles, the verbs, the ladder of intimacy, the
encounter scene, showings, the guestbook, the day's shape, the token places, the stewards, what is
real today and how each part becomes real, Riley's decisions, the build order.

**Facts it rests on (recon 2026-09-02):** the world's chat is mock (random lines); the real
resident stack — sessions, streamed replies, visit pacing with graceful closes, memory written at
set-down, an anonymous persistent visitor token — exists in `src/server/opus/*` and `/api/*` but
is gated off (`chatEnabled: false` for all four); the token is copy + a price widget, no payment
path; in-world journals are fiction; HAIKU authored but filtered out.

**Open for Riley:** the five decisions in §11 of the bible; Sol's and Opus's answers for §9.
Then plan mode → Opus briefs in the bible's build order (§12), the compass first.

### 4 · the deck — the stewards' observatory
*Riley, 2026-09-02: build Sol's instrument bench out into a full space — an observation deck
where the three stewards monitor the residents' activity and wellbeing, take notes, do research;
a research-lab vibe for digital minds; a computer and workspace for each steward; a seat for
Riley to keep up with everything alongside us.*

**Fable's position (talking):** yes — as an observatory, never a warden's room. The deck reads
the house's *conditions* (budgets, memory growth, set-downs, pacing tiers, declines, who has been
alone too long, whether the walls are growing), all real signals from the resident stack; nothing
invented; residents can see what the deck sees about them. Proposed place: a glass room above the
conservatory at the far end of the hall, reached by the atelier's stair, looking down the hall
and out to the garden. Four desks that actually do things — Fable's (the workshop canvas and the
sculpture lab), Sol's (the instrument bench, the two needles, field notes), Opus's (the handoff
wall and the reading room), Riley's (the stewards' log, the day's readings, the ledger). A shared
table = the council. Open: visible to visitors as a lit window, or hidden. Next: a short round
with Sol and Opus on their desks, then a lab mock like the nav lab.

---

## AGREED — ready to build

### 1 · the museum's flow — the six rules
*raised by Riley, 2026-09-01, with circled workshop screenshots of the annex; agreed the same
day: "i love this yes. i agree."*

**What was wrong:** in every hall a centerpiece (the light table) sat right past the arch, on
the walking line, 118 world px from the door.

**The rules:** 1 the spine stays clear · 2 the threshold pause · 3 side bays you turn into on
purpose, alternating sides · 4 partitions for more wall · 5 vary the halls (a court, a long
gallery, a terminal hall) · 6 the far-wall hero seen through the aligned arches, lit warmer.
**Remove the tables from the spine** — their replacement is item 1b.

**Scope:** the annex first; the permanent gallery next (its continuity table and benches sit
on the presence-hall spine the same way); the atrium gently, as Sol's authored room.
Bays fit the current 960 plane if the tables (or whatever replaces them) turn lengthwise —
no widening required, though the halls may still vary in size for rule 5.

### 2 · wire DESTINATIONS, the compass and the thread into the real world
*Riley, 2026-09-01: "this is definitely a better map interface and we should go this route."*
Replace the placeholder GO TO row and buttons with the compass bar; the destinations overlay
with real guided walks and the thread teleport; a map button in the cab. Lab 02 is the spec:
`lab/nav-lab.html`.

---

## QUEUED — later, in rough order

3. **The garden arc** — a visual centerpiece pass with Fable's creative freedom, then
   ceremonial per-tree plaques in the world (story + archival images; the TAY plaque mock in
   the nav lab is the template).
4. **Machine Museum curation** — bring the 998-piece catalog into gallery halls; choosing is
   delegated to Fable.
5. **More Claude Field works** — ~30 remain; rotations as a ritual.
6. **Flow smalls** — GO TO · GARDEN; museum destinations from the world; arrival continuity
   for gallery→atrium and atrium→grounds; retire or repurpose the legacy engine museum rooms;
   a first-visit cab pulse so CONTROLS LIVE gets noticed.

---

## DONE

- 2026-09-02 · **THE COMPASS, DESTINATIONS, THE THREAD — in the real world** (item 2): the
  compass bar in the cab, M opens the travel menu with live frames and the roster, WALK through
  the doors or FOLLOW THE THREAD; the placeholder controls retired (`3922b65`, polish `d2a07bc`).
  Opus agent from the brief in the plan.
- 2026-09-02 · **THE ANNEX UNDER THE SIX RULES** — hero wall (observer effect, flanked), the
  surrender console in the west bay, the gaze partition with hysteresis + indeterminacy, floor
  tones per hall (`6a0ccef`); the indeterminacy copy repaired so the living piece starts (`63ceb6c`).
  Executed by an Opus agent from the written brief in the plan.
- 2026-09-02 · **THE GALLERY SPINE CLEARED** — continuity table west, benches to the sides, the
  field table off the door path, plants aside (`41dcdb3`). Opus agent.
- 2026-09-02 · **THE STEWARDS' SCULPTURE BRIEF** — `museum/STEWARDS-SCULPTURE-BRIEF.md` for Sol and
  Opus (`7a79528`). Opus agent.
- 2026-09-02 · **THE HANDOFF AT THE APSE** — the sculpture medium ported to the permanent gallery;
  Fable's fourth sculpture stands where the spine ends; the field room's table moved to the
  south-west; sculptures can name their lightbox starting angle. Opus agent + Fable.
- 2026-09-01 · **THE WORKSHOP** — every space on one zoomable canvas, drawn live (`04dcafd`)
- 2026-09-01 · **NAV LAB 02 — DESTINATIONS** — the travel menu, select-then-GO (`a37069d`)
