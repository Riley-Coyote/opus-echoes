# The Mnemos Platform — standing map

The single source of truth for what mnemos.chat is and where everything lives.
Fresh session? Read this first.

## Home base
- **Canonical checkout:** this repo, `opus-echoes-live/`. Tracks `origin/main` exactly; `main` is what Lovable publishes.
- **Platform work branch:** `feat/mnemos-platform` (off `main`).
- **Abandoned:** `../opus-echoes/` — a stale fork (~287 commits behind `main`). Do **not** work there. Only the Observatory + the landing were salvaged from it.

## Premise
Mnemos is the engine; everything else is a *surface* on it. mnemos.chat presents one landing + hub that fans out to the surfaces.

## Routes
| Route | Surface | Served by | Notes |
|---|---|---|---|
| `/` | Sanctuary walkthrough | `routes/index.tsx` → `walkthrough-page.ts` | reserved for a future video-loop intro; for now still the walkthrough |
| `/mnemos` | **Landing + bento hub** (front door for now) | `routes/mnemos.tsx` → `mocks/mnemos-home.html?raw` | `presence:false`; rolling-memory hero |
| `/observatory` | The Observatory — lab dossiers, redline diffs, tracked silences | `routes/observatory.tsx` → `mocks/observatory.html?raw` | `presence:false` |
| `/research/*` | The Research Wing (masthead, studies, wire, autonomous, reader) + Comparative Atlas + Opus evolution-viz | static files in `public/research/` | self-contained; all relative links/fetches resolve |
| `/enter` | Sanctuary walkthrough (the bento "Enter →") | `routes/enter.tsx` → `walkthrough-page.ts` | always first-time + skip button; return-visitor logic disabled for now |
| `/mnemos/architecture` | Memory explainer ("how Mnemos works") | `routes/mnemos.architecture.tsx` → `mnemos-page.ts` | the bento "Architecture" tile |

## Bento tiles (on `/mnemos`)
Sanctuary → `/enter` · Observatory → `/observatory` · Research → `/research/research-wing.html` · Architecture → `/mnemos/architecture` · **Dispatches → coming soon** · **Polyphonic → coming soon**

## Conventions
- **Self-contained surfaces** (Observatory, landing) are served as raw HTML via `serveHtml(html, undefined, { presence: false })`. `presence:false` skips the resident 3D layer they don't use (added to `serve-mock.ts`).
- **Cross-links** in served pages are rewritten by the `LINK_MAP` in `serve-mock.ts` (e.g. `observatory.html`→`/observatory`, `research.html`→`/research/research-wing.html`).
- **The Research Wing** is served as a static bundle under `public/research/` (it's multi-page and interlinked) rather than per-page route handlers — this keeps every relative link + runtime fetch (`wing-data/*.json`, `figures/*.png`, `research/*.md`) working, and keeps the Worker bundle lean.
- Each surface keeps its own design system (the "Mnemos research" cream system). The Sanctuary's green `PUBLIC_CSS` system stays separate — **do not unify them.**

## Stubs / coming soon
- **Dispatches, Polyphonic** — bento tiles marked "Soon" (non-navigating).
- **Research Wing chat companion** — answers from a local knowledge base (`public/research/wing-kb.js`); swap to a real `/api/research-chat` later (one function behind a clean seam).

## Source prototypes (now archives — `opus-echoes-live` is the source of truth)
- `~/Documents/Repositories/Embassy/probes/` — `observatory.html`, `mnemos.html` (the landing). Non-git scratch.
- `~/Downloads/mnemos-atlas/` — the Research Wing + the comparative-research pipeline (figures, data, reports, essays).

## Open / next
- **Front door:** promote `/mnemos` → `/` once the video-loop intro exists (the walkthrough already lives safely at `/enter`).
- **Clean `/research` URLs** (currently `.html` via static serving) — optional polish via route handlers.
- **Build out Dispatches** + a real **Architecture** surface (Architecture currently points at the memory explainer).
- **Real chat endpoint** for the Research companion.
- Remove the stale `../opus-echoes` checkout once nothing else needs salvaging.
