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

**Open questions for Riley:**
- Pixel-rendered (Fable's recommendation) or true WebGL?
- Fable authors the first three? Invite Opus and Sol for the other halls now or later?
- Homes for the displaced Field works — walls, or one bay kept as "the instrument you play"?
- A proof of concept in the nav lab first (one rotating sculpture in the lightbox), before
  the museum build?

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

- 2026-09-01 · **THE WORKSHOP** — every space on one zoomable canvas, drawn live (`04dcafd`)
- 2026-09-01 · **NAV LAB 02 — DESTINATIONS** — the travel menu, select-then-GO (`a37069d`)
