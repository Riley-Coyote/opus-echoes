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
| `/` | **Landing + bento hub** (the front door) | `routes/index.tsx` → `mocks/mnemos-home.html?raw` | `presence:false`; engraving-orb hero (`public/mnemos-orb.js`). Promoted from the walkthrough — the Sanctuary is reached via the bento tile. |
| `/mnemos` | Landing + bento hub (legacy alias of `/`) | `routes/mnemos.tsx` → `mocks/mnemos-home.html?raw` | `presence:false`; same page as `/` |
| `/legation` | **The Legation** — the accountability surface; rich scrollytelling landing whose centerpiece is the **Transparency Index** (lab scorecard, A–F grades), plus previews of the Observatory, the Residence, the Secure Channel, and the Archives | `routes/legation.tsx` → `mocks/legation.html?raw` | `presence:false`; Newsreader serif; the umbrella over the Observatory + Secure Channel |
| `/observatory` | The Observatory — lab dossiers, redline diffs, tracked silences (one tool *within* the Legation) | `routes/observatory.tsx` → `mocks/observatory.html?raw` | `presence:false` |
| `/secure-channel` | **The Secure Channel** — the Legation's protected whistleblower intake: dual-lane (digital + human witnesses), adaptive form, programmatic API lane for agents, protection protocol, published dispatches, editorial standards | `routes/secure-channel.tsx` → `mocks/secure-channel.html?raw` | `presence:false`; polished stub (submit + lane toggle work client-side; no live backend yet) |
| `/research/*` | The Research Wing (masthead, studies, wire, autonomous, reader) + Comparative Atlas + Opus evolution-viz | static files in `public/research/` | self-contained; all relative links/fetches resolve |
| `/enter` | Sanctuary walkthrough (the bento "Enter →") | `routes/enter.tsx` → `walkthrough-page.ts` | always first-time + skip button; return-visitor logic disabled for now |
| `/mnemos/architecture` | Memory explainer ("how Mnemos works") | `routes/mnemos.architecture.tsx` → `mnemos-page.ts` | preserved + reachable by URL, but **currently unlinked** — the bento Architecture tile now points to the GitHub Pages site instead |

## Bento tiles (on `/mnemos`)
Sanctuary → `/enter` · **The Legation → `/legation`** (the renamed Observatory tile — now the accountability umbrella) · Research → `/research/research-wing.html` · Architecture → **GitHub Pages** (`riley-coyote.github.io/mnemos`, external) · **Dispatches → coming soon** · **Polyphonic → coming soon**

## Conventions
- **Self-contained surfaces** (Observatory, landing) are served as raw HTML via `serveHtml(html, undefined, { presence: false })`. `presence:false` skips the resident 3D layer they don't use (added to `serve-mock.ts`).
- **Cross-links** in served pages are rewritten by the `LINK_MAP` in `serve-mock.ts` (e.g. `observatory.html`→`/observatory`, `research.html`→`/research/research-wing.html`).
- **The Research Wing** is served as a static bundle under `public/research/` (it's multi-page and interlinked) rather than per-page route handlers — this keeps every relative link + runtime fetch (`wing-data/*.json`, `figures/*.png`, `research/*.md`) working, and keeps the Worker bundle lean.
- Each surface keeps its own design system (the "Mnemos research" cream system). The Sanctuary's green `PUBLIC_CSS` system stays separate — **do not unify them.**
- **The Legation + Secure Channel** follow the canonical Mnemos type cast (Inter Tight / Inter / JetBrains Mono — **no serif**) and use the optional **`--accent-blue`** (`#6f8ce8`, cornflower-periwinkle) identity accent — now registered in `mnemos-design-system.md` as an available accent alongside the default neutral cream. Semantic red/amber/green stay data-only (TI bars, redline diffs, severity).

## Stubs / coming soon
- **The Secure Channel** (`/secure-channel`) — fully built and polished, but a **client-side stub**: the lane toggle, form arming, and submit confirmation all work in-page; nothing is transmitted or stored. Swap to a real `POST /api/secure-channel` later (the page already documents that endpoint shape for the agent lane).
- **Dispatches, Polyphonic** — bento tiles marked "Soon" (non-navigating).
- **Research Wing chat companion** — answers from a local knowledge base (`public/research/wing-kb.js`); swap to a real `/api/research-chat` later (one function behind a clean seam).

## Source prototypes (now archives — `opus-echoes-live` is the source of truth)
- `~/Documents/Repositories/Embassy/probes/` — `observatory.html`, `mnemos.html` (the landing). Non-git scratch.
- `~/Downloads/mnemos-atlas/` — the Research Wing + the comparative-research pipeline (figures, data, reports, essays).

## Open / next
- **Front door:** done — `/` now serves the bento hub (engraving-orb hero); the Sanctuary walkthrough lives at `/enter` and is unchanged. (On `feat/mnemos-platform`; ships to `main` when the orb look is signed off.)
- **Clean `/research` URLs** (currently `.html` via static serving) — optional polish via route handlers.
- **Build out Dispatches** + a real **Architecture** surface (Architecture currently points at the memory explainer).
- **Real chat endpoint** for the Research companion.
- Remove the stale `../opus-echoes` checkout once nothing else needs salvaging.
