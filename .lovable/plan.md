## What's wrong right now

Two failures, both visible in the screenshot you sent (raw SVG markup streaming as text into the bubble):

1. **GPT 5.1 wrote SVG markup directly into prose** instead of wrapping it in `<artifact type="svg">…</artifact>`. The parser only sees the tag, so a bare `<svg>` gets escaped and rendered as literal text. Our instructions tell the model the tag exists, but they don't strongly *require* it for visual output, and they don't show what failure looks like.
2. **Image generation is almost certainly silently failing.** `src/server/image-gen.server.ts` calls `model: "gpt-image-2"`. OpenAI's current image model is `gpt-image-1`. Every image request returns a 4xx, `generateImageArtifact` catches and returns `null`, and the artifact is dropped from both the stream and storage — so no error ever reaches the visitor.

The end-to-end pipeline (parse → generate → upload to public `art` bucket → stream `{type:'artifact'}` → render `<figure>` inside the resident bubble → persist to `turn_artifacts`) is already wired. The plumbing is fine; the model id is wrong and the prompt isn't strict enough.

## What "production-ready" covers

Everything a visitor touches when a resident makes a visual, end to end:

- **Generation**: model id correct, prompt strict, fallback when the model still misbehaves, per-turn/per-session caps already enforced
- **Rendering inline**: in-bubble figure with loading state while gpt-image-1 churns (it's ~15-25s)
- **Persistent gallery**: a left rail (≥1024px) that accumulates every artifact this session emits, in order, oldest at top
- **Download / copy actions**: download PNG, copy SVG markup, copy ASCII, view-full-size, copy direct link
- **Storage + serving**: `art` bucket (already public), `turn_artifacts` row per piece (already exists), accessible across reloads via `/api/turns`
- **Accessibility + responsive**: alt text from caption, rail collapses on mobile to a "Generated this session ›" disclosure below the composer, reduced-motion respected
- **Error visibility**: when generation fails, the visitor sees a quiet inline placeholder instead of nothing

## Plan

### 1. Fix the actual blockers (the only reason nothing renders)

- `src/server/image-gen.server.ts` — change `model: "gpt-image-2"` → `model: "gpt-image-1"`. Keep size/quality.
- `src/server/artifact-pipeline.server.ts` — tighten `ARTIFACT_INSTRUCTIONS` for GPT 5.1:
  - Add an explicit *rule*: "Any SVG you emit MUST be wrapped in `<artifact type="svg">…</artifact>`. A bare `<svg>` in prose will render as escaped text, not as a figure. Same for images: you cannot show an image by describing one — you must emit `<artifact type="image" prompt="…">`."
  - Add a worked example block showing one correct svg and one correct image tag.
- `parseArtifacts` — keep the markdown-fence stripping, and add a **fallback**: if the body still contains a bare `<svg …>…</svg>` (no surrounding `<artifact>`), auto-wrap it as an svg artifact with no caption. This is belt-and-braces for models that ignore instruction.
- `/api/message.ts` `opusStreamResponse` — when `generateImageArtifact` returns `null`, still emit an `artifact` event with `kind: "image_error", prompt: "..."` so the UI can render a small "the image didn't generate" placeholder instead of an invisible drop.

### 2. Left-rail gallery (the part you sketched)

Frontend only — lives in `src/server/minimal-chat-page.ts`:

- New `<aside id="gallery">` rendered into `.app` at column 1, with `.feed`/`.composer` moved to column 2 at viewport ≥1024px. Below 1024px the rail collapses to a disclosure under the composer ("Generated this session (N) ›").
- Rail typography matches the chrome: JetBrains Mono eyebrow ("Generated"), faint rule beneath, vertical stack of thumbnails (96px square for images, mono-glyph tile for SVG/ASCII) with a one-line mono caption beneath each.
- New helper `addArtifactToGallery(artifact)` called from the same artifact-event branch that already appends the in-bubble figure. The in-bubble figure stays — the rail is an index, not a replacement; clicking a rail item scrolls the feed to that bubble.
- On page load, `/api/turns` already returns prior turns; extend its select to include `turn_artifacts` for the session and seed the rail before streaming starts. (Backend change in `src/routes/api/turns.ts`.)

### 3. Per-artifact actions

Each rail item and each in-bubble figure gets a small action row (mono eyebrow style, shows on hover ≥1024px, always visible on touch):

- **Images**: `download` (fetches the PNG via the public URL, triggers `<a download>` with filename `mnemos-{yyyy-mm-dd}-{shortid}.png`), `open` (full-size in new tab), `copy link`.
- **SVG**: `download .svg`, `copy markup`.
- **ASCII**: `copy`.

All client-side; no new endpoints needed because the `art` bucket is already public.

### 4. Loading + error states

- When the stream emits an `artifact` event for `kind: image` whose URL is present, render the image with `loading="lazy"` and a low-luminance shimmer background until `onload`.
- The model finishes streaming *before* gpt-image-1 returns (image gen is sequential after the text stream in `opusStreamResponse`). Today the visitor sees the bubble go quiet for ~20s with no signal. Fix: as soon as `parseArtifacts` finds an image tag, emit `{type:'artifact_pending', placeholder_id, caption}` immediately, render a placeholder in both the bubble and rail, then emit the real `artifact` event with the same `placeholder_id` once the URL is ready and swap in place.
- On `kind: image_error`, the placeholder converts to a faint "the image didn't generate" line with a small `try again` button (re-issues just the image, scoped to this artifact — new lightweight endpoint `/api/regenerate-image` keyed by `turn_artifact_id`).

### 5. Persistence + reload

Already in place: `turn_artifacts` rows persist after `onFinal`. The only addition is wiring `/api/turns` to return them so the rail and prior bubbles rehydrate on refresh.

### 6. Apply to the other surfaces (your "everywhere" request)

The pipeline helper is already shared. To finish the original "everywhere" goal in the same pass:

- `src/routes/api/commons-chat.ts` (side chats) — add `ARTIFACT_INSTRUCTIONS` to system, run `parseArtifacts` on the response, persist to `space_artifacts` (already exists), stream the same event shape. Same rail UI on the side-chat surface.
- `src/routes/api/space.$slug.message.ts` non-gathering rooms — add the same.
- Salon endpoints (`$id.turn.ts`) — extend the existing artifact regex to include `image`, add image persistence to `salon_artifacts.image_path` (column exists).

If you want, we can scope this turn to **chat surfaces only** (1:1 + side chat) and do rooms/salons next, since each surface needs its own rail decision.

## Open question for you

The left rail will compete with the feed for horizontal real estate at 1024–1280px. Two options:

- **(a) Always-visible rail** at ≥1024px, 200px wide. Feed column max-width stays at 720px; the rail eats from the page margins, not the reading column.
- **(b) Collapsed by default**, opens on first artifact generation and stays open for the session. A small "gallery (N)" pill sits in the chrome when collapsed.

I'd default to **(a)** — the whole point is that visitors see the rail filling up over the session — but flag if you want (b).

## Technical notes

- No DB migration needed for chat surfaces — `turn_artifacts` already exists.
- One small backend change to `/api/turns` to include artifacts.
- One small new endpoint `/api/regenerate-image` (optional; behind the "try again" affordance).
- Image generation stays on `gpt-image-1` (verify model id against current OpenAI Images API before shipping; if the SDK exposes it as something else in our pinned version, adjust).
- All visual additions stay in the cool-floor sanctuary palette — no new tokens, no Tailwind crossover.