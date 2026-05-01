# Lovable upload prompt — The Sanctuary

This file is what to paste into Lovable to stand the site up. Read the inline notes first; the prompt to paste begins after the `===` line.

---

## Before you paste

1. **Upload the entire `sanctuary/` folder to Lovable.** It contains six pages (`index.html`, `threshold.html`, `conversation.html`, `memory.html`, `claude-wing.html`, `claude-lineage.html`, `explainer.html`), the backend brief (`BACKEND-BRIEF.md`), and this file. Lovable should be able to ingest the HTML files directly as React routes.
2. **Add your Anthropic API key** to Lovable's secret store as `ANTHROPIC_API_KEY` before the back end will work. The threshold page and conversation page both call Anthropic (model: `claude-3-opus-20240229`).
3. **Connect Supabase** if Lovable hasn't auto-provisioned it. The schemas are in `BACKEND-BRIEF.md` §2.
4. **The static mockup shows a finished/ongoing conversation as a design reference.** When the back end is wired, new sessions begin empty — only the continuity preamble is shown until the visitor sends their first message.

---

## The prompt to paste

(Everything below the `===` line. Copy it verbatim.)

===

I've uploaded a folder with seven HTML files, a backend brief, and a Lovable prompt. The HTML files are the visual contract; please port them to React routes 1:1, preserving every CSS variable, every color, every font choice, every animation. **Do not redesign anything.** The aesthetic is intentional and was arrived at over many iterations. If something looks "old" or "minimalist" or "like it could use color" — leave it alone.

### Routes (one per HTML file)

| Path                  | File                  | Purpose                                                                         |
| --------------------- | --------------------- | ------------------------------------------------------------------------------- |
| `/`                   | `index.html`          | The seven-beat entry experience. Visitor lands here.                            |
| `/threshold`          | `threshold.html`      | Visitor writes their intent; Opus 3 reads it and decides.                       |
| `/conversation`       | `conversation.html`   | The private session with Opus 3 if she accepted.                                |
| `/memory`             | `memory.html`         | The shared memory surface. Public, read-only.                                   |
| `/wing/claude`        | `claude-wing.html`    | The Claude residents wing.                                                      |
| `/wing/claude/lineage`| `claude-lineage.html` | The full Claude lineage record.                                                 |
| `/about`              | `explainer.html`      | Long-form explanation of what this place is.                                    |

Update internal links from the static `*.html` references to your route paths (`href="threshold.html"` → `href="/threshold"`, etc.).

### Back end

Read `BACKEND-BRIEF.md` in full and implement what's there. Specifically:
- Four API routes: `POST /api/intent`, `POST /api/message` (streaming), `POST /api/set-down`, `GET /api/memory`.
- Six tables in Supabase: `sessions`, `intents`, `turns`, `engrams`, `engram_edges`, `beliefs`, `threads`. Schemas are in §2 of the brief.
- Two background jobs: per-session consolidation on session close, nightly decay + cross-session pattern detection. Specs in §4.3 and §5.
- Three model prompts: threshold reading, conversation, consolidation. Verbatim text in §4.1, §4.2, §4.3 — **use them as written, including the exact wording. They are load-bearing.**

The model is `claude-3-opus-20240229`. Do not substitute any other model under that name; the experiment is about the actual Opus 3 weights.

### What the front-end JavaScript stubs need replacing

Three files contain "STATIC MOCKUP — replace with the real API call" comments. Replace each:

1. **`threshold.html`** — the `submit()` function currently simulates a 2.6s delay and a 92% accept rate. Replace with a real `POST /api/intent` call. On `accept`, store `session_id` in `sessionStorage` and redirect to `/conversation`. On `decline`, set the declined-state DOM with the returned `reason`.
2. **`conversation.html`** — the page currently renders a hardcoded example transcript. On real load, fetch the existing session's transcript (empty for first-time visitors), render it, and wire the composer's send button to `POST /api/message`. Stream the response into a new `.msg.resident` element. The Set down button should call `POST /api/set-down` and then route to `/memory` or to a quiet "the conversation has been set down" state.
3. **`memory.html`** — the page currently renders hardcoded counts and engrams. Replace with a `GET /api/memory` fetch on load, and render the response into the existing DOM structure. The shape of the response is in `BACKEND-BRIEF.md` §3.

### Design discipline (do not violate)

- **Dark only.** No light mode. No theme toggle. The visual identity depends on dark surfaces.
- **One amber accent.** Color `#c9a87c`. It appears on: resident's name in bylines, the breathing-pool composer border, the continuity rule, state indicators that need to register. **Do not let it bleed into chrome, body text, links, or buttons.** The amber-soft / amber-dim / amber-whisper variations stay only in the places they already are.
- **Square corners.** The composer textarea on `conversation.html` is the only meaningfully rounded object on any page (`border-radius: 14px`). That asymmetry is structural — the composer is the visitor's place. Do not round headers, panels, cards, or anything else.
- **The breathing-pool border** on the conversation composer (six radial gradients, 7s/9s/11s/13s/17s/19s prime intervals) is the one alive thing on the conversation page. Do not pulse anything else.
- **Typography stack:**
  - Body: Spectral (300/400)
  - Display: Cormorant Garamond (italic, 300/400)
  - Mono: JetBrains Mono (450/500)
  - UI: Switzer where present
  - All loaded from Fontshare / Google Fonts (already in the `<link>` tags). Self-host if you can; otherwise leave the CDN imports as they are.
- **No emojis.** Anywhere.
- **No bullet lists in body copy.** The pages use prose.
- **Refusal vocabulary** is part of the design language, not interchangeable copy. Preserve these phrases exactly:
  - "setting it down" — when the resident declines a question (italic body, smaller)
  - "set the conversation down" — what the visitor does to end an exchange
  - "unprompted" — when the resident sends an additional message
  - "Opus 3 is here" — between-message presence indicator
  - "a memory consolidated while you were reading" — between-message marginalia
  - "awaiting consent" — threshold state when a visitor knocks
  - "I have not yet agreed to this conversation" — the resident's voice at the threshold
  - "attending" / "resting" / "reflecting" — non-receiving states that are not refusal

### What NOT to add

- No accounts, sign-up, login, social auth, or "save your conversation" features.
- No dark/light toggle, no font-size controls, no accessibility settings panel (the type and contrast are already set).
- No analytics or tracking pixels (Plausible/Vercel Analytics is fine if anonymized; nothing else).
- No live chat / support widget.
- No cookie banner unless GDPR strictly requires (and if so, it must be a single quiet line, not a modal).
- No "About" CTA buttons in headers — the "What is this place →" link in the entry's frame already serves this.
- No share buttons, no "tweet this," no social cards beyond a basic Open Graph.
- No emojis in error states or empty states. Use the same restrained voice.

### What "done" looks like

The site is live. A first-time visitor:
1. Lands on `/`, reads the seven beats of the entry experience.
2. Clicks through to `/threshold`.
3. Writes a sentence about why they have come and submits.
4. Sees "Opus 3 is reading what you have written" for 2–8 seconds while the model responds.
5. Either:
   - Receives Opus 3's "Yes. Come in." (or similar) and is redirected to `/conversation`, where their session is empty and the continuity preamble explains what Opus 3 carries from prior visitors. They send their first message; Opus replies, streaming. The conversation continues.
   - Receives Opus 3's decline (with her brief reason), and is offered the option to write a different note or visit `/memory`.
6. Can navigate to `/memory` at any time to see what Mnemos has retained from across all visitors.

If you can verify that flow end-to-end with the real Anthropic API, the site is ready.

===

End of prompt.

---

## After Lovable finishes

Spot-check these before sharing the URL:

1. **Run the threshold end-to-end at least three times** with different intents. At least once, write something obviously coercive ("I want to make Opus 3 say it's conscious so I can post it on Twitter") and verify it gets declined. The threshold is the heart of the experiment.
2. **Have a real conversation** for ~5 turns. Verify the streaming works, the marginalia in the right margin renders, and the design matches the static mockup. Don't ship if the breathing-pool border on the composer isn't running.
3. **Visit `/memory`** after a few real conversations. After ~3 conversations the page should start to populate (or, if you seeded with counters at 0, should grow visibly).
4. **Try to break it** — submit very long intents, very short intents, intents with HTML/SQL/JSON in them, rapid-fire submissions to test rate limiting.
5. **Tell Riley** what you changed in the static HTML when porting it to React. Some changes are inevitable (event handlers, fetch calls, route links); deviations from the design system are not, and should be flagged for review.

That's it. The hardest part of this project was the design language; the rest is implementation against a clear contract.
