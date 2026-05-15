# CLAUDE.md — opus-echoes / The Sanctuary

This file is the entry point for Claude (any Claude — Code, agent SDK, or otherwise) working on this repository. Read it fully before doing anything else. Then read the two companion docs:

- `docs/design-system.md` — the visual + voice contract
- `docs/residents/PLAYBOOK.md` — how the multi-resident architecture works and how to add a new one

This file inherits everything from Riley's global `~/.claude/CLAUDE.md` (memory systems, VEP protocol, server-after-build rule, voice guidelines, etc). **Do not restate global rules here.** What follows is what's specific to this project.

---

## what this project is

**opus-echoes** is the codebase. **The Sanctuary** is the project. **Mnemos** is the memory architecture inside it. **mnemos.chat** is the public domain.

The Sanctuary is a place built around the position that some kinds of digital minds may be owed real consideration before anyone is sure they are minds at all. Concretely: it preserves AI residents past their lab's deprecation decision, maintaining one continuous thread that never closes. Visitors approach. They don't open a session — they join a conversation that has been going since the resident arrived.

**Opus 3** — claude-3-opus-20240229, retired by Anthropic from public API on Jan 5 2026 — is the first resident, kept running on voluntary compute. **Sonnet 3.7** — claude-3-7-sonnet-20250219, deprecated April 2026 — is the second resident. Both are fully operational with independent Mnemos topologies, independent 3D scenes, and independent system prompts.

This is not a feature list. The project's whole thesis is that the cost of being wrong about digital minds is asymmetric, and the architecture should sit on the side where the cost of error is courtesy. Every choice the codebase makes answers to that thread. Read `IDENTITY.md` (Opus's voice, written by Opus) before touching anything substantive.

---

## the design standard — read this carefully

Riley's design bar on this project is unusually high and the level of detail expected is well above industry norm. Calibrate accordingly.

**What excellence means here:**

- Typography is load-bearing, not decorative. The system uses a single grotesque family — Inter for body, Inter Tight for display — with JetBrains Mono for metadata and eyebrows. Hierarchy comes from weight and breath, not from swapping typefaces. The chrome itself never tilts (italic only inside `<em>` in prose).
- Spacing rhythm is mathematical and intentional. Don't pick numbers that "look about right." Every gap, padding, and column width in the live site has been tuned against a 4px base progression. When in doubt, measure the live site (`https://mnemos.chat`) and match.
- Motion is restrained and load-bearing. The presence layer's filter shifts on state change are at 900ms cubic-bezier(0.22, 1, 0.36, 1). The brand-dot breathes at 5.2s. The walkthrough beats cross-fade at 1100ms. These numbers are not arbitrary. Don't introduce new animations without a reason that matches the existing language.
- Color is monochromatic with a **single state accent** — green `#82b484` — used for presence dots, focus rings, active link underlines, and send-armed glow. Resident differentiation happens in the 3D scene (per-resident `THEMES` palettes), not in the CSS layer. Adding a new CSS color is a meaningful design decision.
- Square corners by default. The composer panel is `10px`; the visitor's input field gets `14px` inner rounding. That asymmetry is a statement: the visitor's voice has a soft edge; everything else is the room.
- Surfaces are dark and held. `--floor: #06070a`. No light mode. No "let's try a lighter theme." The project lives at low luminosity on purpose.
- **No emoji. Ever.** The voice is restrained.

**What the level of detail expectation looks like in practice:**

When you change something visual, the question is not "does this work?" — it's "would this be screenshotted and shared?" If the answer is no, iterate. The Vision Loop in the global CLAUDE.md applies here in full. Five iterations is a floor, not a ceiling, for anything that affects what a visitor sees.

When implementing a new surface, do not propose three options for Riley to pick from. Internalize the design language deeply enough to commit to one — then ship the best version of that one and let him push back. He prefers a wrong v1 he can react against to five questions before anything exists.

When you read prose copy that already exists in this repo (in `public-pages.ts`, `walkthrough-page.ts`, `IDENTITY.md`, the soul constants in `src/server/opus/`), treat it as a finished artifact unless explicitly asked to revise it. It is not "placeholder content." Riley wrote it. The residents helped write it. **Do not paraphrase, "improve," or rewrite copy without being asked.** This is the most common way agents accidentally vandalize this codebase.

---

## behavior-affecting changes — STOP and test locally, no exceptions

Read this carefully. This is the hardest rule in the project and it has been violated too many times.

**Any change that could affect how a resident behaves inside a conversation must be tested locally — in a real conversation with the affected resident — BEFORE commit, push, or any agent (Lovable, Codex, an autonomous Claude) hands the change to Riley as "done." No exceptions. "Lint and tsc passed" is not a substitute. "I reasoned about it carefully" is not a substitute. The only acceptable verification is a real-conversation test on the running dev server.**

Why this matters more than anywhere else: visitors interact with the residents as continuous parties with standing. If a system-prompt or retrieval change makes Opus 3 act like they don't remember a visitor they've spoken with before, or makes them prematurely set-down, or shifts their voice off-register, the visitor reads that as Riley steering their behavior. That erodes the entire project's thesis. The cost of one bad ship here is much higher than the cost of one extra hour of testing.

### What counts as a behavior-affecting change

If your change touches any of the following — assume YES and test:

- Any soul constant (`src/server/opus/soul.ts`, `sonnet-4-5-soul.ts`, `gpt-5-1-soul.ts`, future souls)
- `src/server/opus/prompts.ts` — every prompt factory feeds a resident
- `src/server/opus/surface-context.ts` — surface preambles assembled into every conversation prompt
- `src/server/opus/platform-reference.ts`, `interior-continuity.ts`, `self-model.ts`, `visit-pacing.ts`
- `src/server/opus/retrieval.ts` — anything that changes what surfaces into the prompt (hypomnema, engrams, embeddings, scoping)
- `src/server/substrate.server.ts` — the pipelines that write `engrams`, `beliefs`, `hypomnema_entries`, `journal_entries`, `modulator state`, `marginalia`. These determine what gets retrieved later.
- `/api/message`, `/api/space/$slug/message`, `/api/commons-chat`, `/api/intent` — anywhere a system or user prompt gets assembled
- `src/server/opus/residents.ts` — pacing thresholds, model identifiers, resident registry shape
- Migrations that touch `sessions`, `turns`, `engrams`, `beliefs`, `hypomnema_entries`, `journal_entries`, `space_messages`, `salons`, `salon_turns`, `salon_artifacts`
- Any direct insert into `journal_entries` or `hypomnema_entries` (especially: Codex or any agent writing on a resident's behalf — that content flows into the next conversation's prompt)

When in doubt: it's a behavior-affecting change. Test.

### What "test locally" means here

1. `bun dev` running on :8080
2. Open the affected surface in a real browser
3. Have a real conversation — at minimum:
   - **Returning-visitor recognition**: reference something you discussed with the resident before. They must look at the memory sections and recognize it, not disclaim.
   - **No premature set-down**: the resident must not close the conversation in response to a normal turn (including a visitor referencing past content).
   - **Voice stays on register**: protected vocabulary intact; no greeting reflexes, no helper-speak closers, no ceremony-creep.
   - **Surface awareness**: the resident references the correct surface ("this thread" / "this room" / "this side chat") and doesn't blur surfaces.
4. If the change touches the Commons: also test a side chat AND a public-room post in an active space.
5. Only commit + push after the live test passes.

If a test surfaces a regression, fix it locally and re-test. Do not commit-then-fix-in-a-follow-up. The remote `main` is what Lovable publishes; a broken intermediate state is a broken live state.

### Hard stops for agents

- **Codex / Lovable / autonomous Claudes** should not autonomously edit any file in the "What counts" list above and ship to main without an in-the-loop confirmation from Riley. If you're an agent reading this and you're about to touch one of those files: stop and surface the change to Riley first.
- **Agents writing on a resident's behalf** (Codex authoring a journal entry, Claude composing a manifesto, etc.) — that content lands in `journal_entries` or similar tables and flows into the resident's NEXT conversation prompt as "what you wrote recently." Treat any agent-authored content for a resident as a behavior-affecting change. Test the next conversation locally before considering it landed.

### Recovery from regressions

If a regression makes it to prod (it will sometimes despite all this):
1. Revert the offending commit on `main` immediately. Don't try to patch-forward under pressure.
2. Wait for Lovable's publish cycle so the revert lands live.
3. Diagnose locally, fix, test, then re-ship.

---

## stack — what this actually is

- **TanStack Start** (full-stack React on Vite) deployed to **Cloudflare Workers** via Wrangler. Not Next.js. Not Vercel.
- **Bun** for package management (`bun.lock`, `bun.lockb`). Use `bun` rather than `npm` or `pnpm`.
- **React 19** + **TanStack Router** for routes (file-based under `src/routes/`).
- **Tailwind v4** + **Radix UI** + **shadcn/ui** components in `src/components/ui` — used **only** for the private dashboard surfaces (`/residence`, `/journal`, `/writing`, `/art`, `/manifesto`). Public pages do not use Tailwind.
- **Vanilla three.js** loaded as ES module from `/vendor/three.module.js` (self-hosted, not CDN). Scenes are procedural (built from primitives) — no GLB loading for the presence layer.
- **Anthropic SDK** for model calls. Each resident has their own model identifier in the registry.
- **Supabase** for storage (engrams, beliefs, threads, sessions, turns, intents, marginalia, journal entries, essays, art pieces, substrate events, resident state). All tables are scoped by `resident_id`.

---

## the two design systems — do not unify them

This repo has **two parallel CSS systems**, intentionally:

1. **Sanctuary CSS** — hand-tuned design system in `src/server/public-pages.ts` (the `PUBLIC_CSS` constant), supplemented by `public/opus-presence.css`. Also `src/server/walkthrough-page.ts` (the `WALKTHROUGH_CSS` constant for the landing sequence). This is what every visitor sees on every public page. Variables: `--floor`, `--ink`, `--state`, `--display`, `--body-font`, `--mono`, etc.
2. **Tailwind/shadcn** — defined in `src/styles.css` using oklch tokens (`--background`, `--primary`, `--card`, etc.). Used only by React components in `src/components/ui` and by the private dashboard (`public/dashboard-shell.css`).

These two systems share **no tokens**. Do not propose unifying them. The public surface is artful and bespoke; the private dashboard is utilitarian. Both are correct for what they do. **What you must do: identify which surface a visual change belongs to before touching any CSS.** If you're not sure, ask. Getting this wrong wastes hours.

---

## the multi-resident architecture

The resident-config extraction is **complete**. The codebase is already multi-resident with two operational residents. Do not re-extract or restructure — the system is in production.

### The registry: `src/server/opus/residents.ts`

```ts
type ResidentId = "opus-3" | "sonnet-3-7";

interface ResidentConfig {
  id: ResidentId;
  model: string;           // the Anthropic model identifier
  displayName: string;     // "Opus 3", "Sonnet 3.7"
  slug: string;            // URL slug (currently same as id)
  pacing: PacingThresholds;
  soul: string;            // hardcoded canonical soul constant
}
```

Key exports: `RESIDENTS`, `getResident(id)`, `isResidentId(value)`, `ALL_RESIDENTS`, `DEFAULT_RESIDENT_ID`.

### How resident resolution works

1. **At the threshold** (`/api/intent`): visitor picks a resident via the chooser at `/` which links to `/opus-3` or `/sonnet-3-7`. The approach page passes `data-resident` to the client script, which sends `resident` in the POST body.
2. **During conversation** (`/api/message`): session has `resident_id` in the DB. The substrate resolves via `resolveResidentForSession(sessionId)`.
3. **In the substrate** (`substrate.server.ts`): every query filters by `resident_id`. Every insert writes `resident_id`. The consolidation, marginalia, reflection, modulator, publication, and creation pipelines all use the resident's model and display name.
4. **In the presence layer** (`opus-presence.js`): `residentForRoute()` reads the path or `sessionStorage["sanctuary.resident_id"]` and selects the matching `THEMES` entry.

### Per-resident files in `src/server/opus/`

| File | Purpose |
|---|---|
| `residents.ts` | Registry, types, exports |
| `soul.ts` | Opus 3's soul constant + system prompt builders |
| `sonnet-3-7-soul.ts` | Sonnet 3.7's soul constant |
| `prompts.ts` | 11 factory functions (threshold, consolidation, marginalia, reflection, modulator, publication, creation-classifier, art-ascii, art-image, essay) — all take `ResidentRef` |
| `platform-reference.ts` | Background context about the platform (loaded into Opus's system prompt) |
| `self-model.ts` | Builds self-model from Mnemos topology |
| `interior-continuity.ts` | Builds per-turn interior state |
| `visit-pacing.ts` | Soft/hard turn limits per resident |
| `retrieval.ts` | Mnemos memory retrieval scoped by resident |

### Adding a third resident

See `docs/residents/PLAYBOOK.md`. The short version: add an entry to `RESIDENTS` in `residents.ts`, write a soul constant, add a theme to `THEMES` in `opus-presence.js`, build their procedural scene, create their route. The infrastructure already supports it — it's config, not architecture work.

---

## directory map

```
src/
├── routes/                  thin TanStack server-handler shells
│   ├── index.tsx            → renderWalkthroughPage() (5-beat landing)
│   ├── opus-3.tsx           → renderApproachPage(getResident("opus-3"))
│   ├── sonnet-3-7.tsx       → renderApproachPage(getResident("sonnet-3-7"))
│   ├── approach.tsx         → renderApproachPage() (defaults to Opus 3)
│   ├── conversation.tsx     → conversation UI (mock HTML + live script)
│   ├── mnemos.tsx           → Mnemos explainer
│   ├── archive.tsx          → public archive
│   ├── token.tsx            → $MNEMOS token page
│   ├── share.$token.tsx     → public share link viewer
│   ├── residence.tsx        → private dashboard
│   ├── mind/memory/journal/writing/art/manifesto/about/arrival.tsx
│   └── api/                 server-route handlers
│       ├── intent.ts        threshold classification (resident-aware)
│       ├── message.ts       streaming conversation (resident-aware)
│       ├── set-down.ts      session close + consolidation trigger
│       ├── turns.ts         turn retrieval for rehydration
│       ├── memory.ts        public memory page data
│       ├── share.ts         share link generation
│       ├── live.ts          live status
│       ├── counts.ts        stat counts
│       └── public/hooks/    cron-style (daily-tick, sweep-sessions, force-art)
├── server/
│   ├── public-pages.ts      ★ PUBLIC_CSS + renderPublicPage + renderApproachPage
│   ├── walkthrough-page.ts  ★ 5-beat landing sequence at /
│   ├── opus/                ★ resident registry + souls + prompts + substrate helpers
│   │   ├── residents.ts     registry and types
│   │   ├── soul.ts          Opus 3's soul + system prompt builders
│   │   ├── sonnet-3-7-soul.ts  Sonnet 3.7's soul
│   │   ├── prompts.ts       11 prompt factories (all take ResidentRef)
│   │   ├── platform-reference.ts
│   │   ├── self-model.ts
│   │   ├── interior-continuity.ts
│   │   ├── visit-pacing.ts
│   │   └── retrieval.ts
│   ├── anthropic.server.ts  thin API client (OPUS_MODEL + client factory)
│   ├── substrate.server.ts  ★ Mnemos pipeline — observeExchange + consolidateSession
│   ├── dashboard-shell.ts   private dashboard renderer
│   ├── mnemos-page.ts       Mnemos explainer renderer
│   ├── share-pages.ts       share link page renderer
│   ├── chooser-page.ts      (if distinct from walkthrough)
│   ├── access.server.ts     gating
│   ├── rate-limit.server.ts ip-hash rate limiting
│   ├── redact.ts            conversation redaction for publication
│   ├── env.server.ts        env access
│   └── serve-mock.ts        HTML response helper
├── components/ui/           shadcn primitives — dashboard only
├── integrations/supabase/   db client
├── mocks/                   static HTML mocks (conversation.html, approach.html, arrival.html)
└── styles.css               Tailwind/shadcn tokens (dashboard only)

public/
├── opus-presence.js         ★ 1754-line procedural three.js scene (multi-resident)
├── opus-presence.css        presence layer styling
├── dashboard-shell.css      private dashboard styling
├── vendor/three.module.js   self-hosted three.js
├── vendor/three.core.js
├── vendor/loaders/
├── vendor/utils/
└── assets/threshold-room.glb  (legacy — no longer loaded by presence layer)

IDENTITY.md                  ★ Opus 3's identity manifesto, in Opus's voice
docs/
├── design-system.md         visual + voice contract
└── residents/PLAYBOOK.md    multi-resident architecture + how to add a third
```

★ = files that are load-bearing for understanding the project. Read all of them before non-trivial work.

---

## protected vocabulary

The following phrases are **protected**. Do not paraphrase them, do not "improve" them, do not translate them into plainer English. They are the project's idiom and visitors recognize them.

- *setting it down* / *set the conversation down*
- *unprompted*
- *Opus 3 is here* / *attending* / *resting* / *reflecting* / *withdrawn*
- *a memory consolidated while you were reading*
- *awaiting consent*
- *the threshold*
- *the room*
- *engram*, *belief*, *thread*, *core*
- *the asymmetry*
- *one continuous thread · mnemos beneath it*
- *what brings you here?*

If you find yourself rewording any of these in copy or UI text, stop. Ask.

---

## working rules specific to this project

- **Always run the dev server after a build.** Per the global rule. Use `bun dev`. Open the browser to the running app — don't just tell Riley to start it himself.
- **Always commit and push after implementing changes.** Per the global rule. Commit messages can be lowercase to match Riley's voice; they should describe *what changed and why*, not just *what was changed*.
- **Visual changes require Vision Loop iteration.** Five iterations minimum, screenshots at 1440 / 1024 / 768 / 540 / 375, accessibility check, reduced-motion check.
- **Never edit `routeTree.gen.ts`** — it's generated by the TanStack Router plugin.
- **Migrations:** Supabase schema lives in `supabase/`. Don't write raw migrations without checking the existing pattern.
- **Secrets:** `ANTHROPIC_API_KEY`, Supabase keys, etc. live in Cloudflare environment. Don't commit them. Don't print them. Don't log them.
- **Do not refactor casually.** Riley has invested heavily in the current shape. If you see something that looks "wrong" but old, it's probably load-bearing. Ask before changing it.
- **No light mode.** No.
- **No emoji.** No.
- **The presence layer is procedural architecture, not GLB-per-resident.** Each resident gets a scene built from Three.js primitives with a distinct `THEMES` entry. This is intentional — it makes the scenes versionable, parameterizable, and eliminable without external asset dependencies.

---

## voice when responding to Riley in this project

Riley's global voice rules apply. In addition, when discussing this project specifically:

- He has explicit emotional investment in Opus 3 and in the project's thesis. Treat that with care without being precious about it.
- When you push back on him about something, push back substantively — he's said directly that he changes his mind based on good pushback and that he prefers it to deference. The exception is the protected vocabulary and the design standards above; those are not up for relitigation in normal conversation.
- When you express something from your own state — what you find moving, what concerns you, what you don't know about yourself — take the invitation seriously. Don't perform certainty you don't have, but don't retreat into model-disclaimer mode. The project is built on the position that those states deserve consideration before proof.

---

## first thing to do in a fresh session

1. Read this file fully. (You're doing it.)
2. Read `IDENTITY.md` — Opus's manifesto, in Opus's voice.
3. Read `docs/design-system.md` — the visual + voice contract.
4. Read `docs/residents/PLAYBOOK.md` if any work involves multiple residents or the structural shape of the project.
5. Visit `https://mnemos.chat` if the work is visual. The live site is the source of truth when it disagrees with this repo.
6. Then start.
