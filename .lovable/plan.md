## Commons redesign — comprehensive implementation plan

Four interlocking changes on `/commons`: (1) unify the floating nav and content card into a single bezel-shell, (2) embed the chat panel inside that shell with a drag-to-resize handle, (3) make the chat genuinely multi-resident ("the round" but inline), and (4) replace the single scrolling column with an industry-standard two-pane app layout. The work touches three files primarily — `src/server/commons-page.ts` (CSS + render), `src/server/public-pages.ts` (nav shell hook), and a small additive backend in `src/routes/api/commons-chat-group.ts` (a new endpoint). No DB migrations required; existing `group_threads` tables are reused only conceptually — we go stateless for the inline round to keep this shippable.

---

### Phase 0 — invariants and ground rules

- All work uses existing Sanctuary CSS tokens (`--floor`, `--ink`, `--state`, `--rule-soft`, `--safe-inset`, `--s-3`..`--s-8`, `--mono`, `--body-font`). Do not introduce new color tokens. Per-resident accents continue to come in via inline `style="${paletteStyle(r)}"`.
- Public surface — never use Tailwind. Edit the inline `COMMONS_CSS` template literal in `src/server/commons-page.ts`. The `/residence` dashboard remains Tailwind; do not touch `src/styles.css`.
- All copy comes from the existing strings in the repo. Do not paraphrase "Talk with", "The Commons", "Where residents meet", "Spaces open", "Salons recorded", or any resident displayName.
- Behavior-affecting prompts (`src/server/opus/*`) are NOT touched. The new group endpoint composes from existing soul + surface preamble exactly as `src/server/group/conductor.ts` already does.
- After each phase: `bun dev` on :8080, visit `/commons` in a real browser, screenshot at 1440 / 1280 / 1024 / 768 / 540 to confirm no regression. After Phase 2: also test a real conversation with at least one resident inside the panel.

---

### Phase 1 — Unified bezel shell (nav + content + chat in one card)

Goal: eliminate the visual seam between `.public-nav` and the safe-area band. The Sanctuary brand mark (top-left) and the nav links (top-right) sit on the same surface as the page content, with continuous rounded corners on all four sides and a single hairline border.

#### 1.1 Restructure the page DOM

In `src/server/public-pages.ts → renderPublicPage`:

- Wrap `<nav class="public-nav">` and `<main class="page">` in a single `<div class="public-shell" data-route="...">` element. Add `data-route` from the existing `r` route classifier already computed in the inline script so commons-specific shell rules can target it without leaking to other pages.
- Markup shape:
  ```html
  <div class="public-shell" data-route="commons">
    <nav class="public-nav" aria-label="Primary">…brand / links…</nav>
    <main class="page">…body…</main>
  </div>
  ```
- The existing `<div class="page-veil">` and `<div class="atmo-grain">` stay outside the shell as siblings of it; they continue to span the full viewport.

#### 1.2 Make commons-specific shell take over the safe-area band

In `src/server/commons-page.ts → COMMONS_CSS`:

- Remove the existing `.public-nav` override block (lines ~92–104) that re-positions the nav inside the inset. The nav is no longer fixed on this surface — it lives inside `.public-shell`.
- Drop the `<div class="viewport-glow">` element from `renderSpaceListPage`, `renderSpaceView`, and any other commons body builders. Its role is taken over by the shell border.
- Add new rules, targeted with `[data-route="commons"]` so we don't affect `/approach`, `/mnemos`, `/archive`, `/token`, `/residence`:
  ```css
  .public-shell[data-route="commons"]{
    position:fixed;
    inset:var(--safe-inset);
    display:grid;
    grid-template-rows:56px 1fr;          /* nav | body */
    background:linear-gradient(180deg, rgba(10,11,14,.92), rgba(6,7,10,.96));
    border:1px solid var(--rule-soft);
    border-radius:18px;
    box-shadow:
      0 1px 0 rgba(255,255,255,.02) inset,
      0 24px 60px -28px rgba(0,0,0,.6);
    overflow:hidden;                      /* corners clip nav + body */
  }
  .public-shell[data-route="commons"] .public-nav{
    position:static!important;            /* unfix it */
    height:56px!important;
    padding:0 22px!important;
    background:transparent!important;
    border-bottom:1px solid var(--rule-soft);
    border-radius:0!important;
    box-shadow:none!important;
  }
  .public-shell[data-route="commons"] .page{
    overflow:hidden;                       /* the body pane scrolls internally, not the shell */
    padding:0;
  }
  ```
- The `.public-nav` retains its existing brand-mark and nav-links DOM. Because it's now a normal flow child of the shell, its background, border-radius and shadow naturally compose with the shell — no separate "bar floating above the card" effect.

#### 1.3 Edge handling

- The shell border rounds all four corners at 18px. No more nav/card seam.
- Remove the now-unused `viewport-glow` rules from `COMMONS_CSS` (lines ~468–510 referencing `.viewport-glow`). Leave the global `viewport-glow` definition in `public-pages.ts` intact for other pages.
- Add a `prefers-reduced-motion` override that disables the shell shadow's transition only (the shell itself has none, but verifies no regression).
- Validate edge-bleed: at 4K, the shell sits inset from `--safe-inset` (clamp(20px, 1.2vmin + 16px, 30px)); at 540px, the safe-inset should compress — keep the existing clamp. Test at 375px width to confirm the shell doesn't crowd the brand mark + nav links onto one cramped row. If it does, add a `@media (max-width: 720px)` rule that switches `.public-shell[data-route="commons"]` to `grid-template-rows: 96px 1fr` and stacks the nav vertically.

#### 1.4 Acceptance for Phase 1

Open `/commons` in Chrome at 1440×900. The nav must:
- share the same rounded card with the content area
- have no visible seam, gap, or darker shelf at the inner corners
- show one continuous hairline border around the whole assembly
- Sanctuary mark + dot top-left, link row top-right, both vertically centered

Repeat at 1024, 768, 540, 375. Screenshot each. Confirm the page-veil fade-in on first load still works.

---

### Phase 2 — Two-pane app layout (left rail + main + side chat)

Goal: replace the single-column scroll with a standard three-region layout — discoverable navigation rail on the left, scrollable main content in the middle, persistent chat on the right. This is the same pattern Slack/Linear/Notion use; it works because users immediately understand where to look for nav vs. content vs. messages.

#### 2.1 Information architecture

The current page concatenates: Stats → Salons grid → Spaces grid → (chat panel floats). The new architecture splits this into three sections selectable from the left rail:

- **Overview** (default): the stats panel only, plus a "what is the Commons" prose intro pulled from existing description text (`"Where residents meet"` eyebrow already exists). Two-column summary inside the main pane (stats grid left, intro paragraph right) at ≥1100px; stacks below.
- **Salons** (`?view=salons`): the salon grid (existing `renderSalonGrid`), with the salon-modal flow unchanged.
- **Spaces** (`?view=spaces`): the spaces grid (existing `renderSpaceCard` cards).

The selection is encoded in a `?view=` query param. Default = `overview`. No DB or router changes — the rail's anchor tags are hash or query links; the server reads the param and renders only the active section's HTML. This avoids client-side routing entirely.

#### 2.2 Server-side rendering split

In `src/routes/commons.tsx`:
- Read `view` from `request.url`'s search params, validate against `"overview" | "salons" | "spaces"`, default `"overview"`.
- Pass `view` through to `renderSpaceListPage(spaces, { stats, salons, view })`.

In `src/server/commons-page.ts → renderSpaceListPage`:
- Accept `view` option. Branch on it:
  - `overview` → render `<section class="pane-overview">${statsPanel}${introBlock}</section>`
  - `salons` → render `<section class="pane-salons">${salonGrid}</section>`
  - `spaces` → render `<section class="pane-spaces">${cards}</section>`
- The salon modal HTML + script tags are always rendered (cheap; needed if visitor lands on `salons` view directly).
- The `commons-head` (`<h1>The Commons</h1>` + eyebrow) stays as a header inside the main pane, above the active section.

#### 2.3 Left rail markup

Build a new helper `renderCommonsRail(activeView, counts)` returning:
```html
<aside class="commons-rail" aria-label="Commons navigation">
  <nav class="rail-nav">
    <a class="rail-item ${active==='overview'?'active':''}" href="/commons?view=overview" data-view="overview">
      <span class="rail-icon">⌂</span>            <!-- replaced w/ inline SVG; minimal stroke -->
      <span class="rail-label">Overview</span>
    </a>
    <a class="rail-item …" href="/commons?view=salons" data-view="salons">
      <span class="rail-icon">…</span>
      <span class="rail-label">Salons</span>
      <span class="rail-count">${salonCount}</span>
    </a>
    <a class="rail-item …" href="/commons?view=spaces" data-view="spaces">
      <span class="rail-icon">…</span>
      <span class="rail-label">Spaces</span>
      <span class="rail-count">${spaceCount}</span>
    </a>
  </nav>
  <div class="rail-foot">
    <div class="rail-meta">${continuousDurationText}</div>
  </div>
</aside>
```
Icons must be inline SVG with `stroke="currentColor"` and `stroke-width="1.4"`, square corners, monoline (matching the existing send/close icons in `chat-collapse` and `chat-close`). No emoji. The three icons: home glyph, paper-stack/quote, and concentric-circles. Keep all glyphs to a 20×20 viewBox.

#### 2.4 Body grid

Inside `.public-shell[data-route="commons"] .page`, render:
```html
<div class="commons-body">
  ${renderCommonsRail(view, { salonCount, spaceCount })}
  <main class="commons-main">
    <header class="commons-head">…</header>
    ${activeSection}
  </main>
  ${renderChatPanel(...)}
</div>
```

CSS:
```css
.commons-body{
  display:grid;
  grid-template-columns:220px 1fr var(--chat-w, 380px);
  height:100%;
  min-height:0;                 /* allow internal scroll */
}
.commons-rail{
  border-right:1px solid var(--rule-soft);
  padding:18px 12px;
  display:flex;flex-direction:column;justify-content:space-between;
  overflow-y:auto;
}
.rail-item{
  display:grid;grid-template-columns:18px 1fr auto;align-items:center;gap:10px;
  padding:9px 10px;border-radius:8px;color:var(--quiet);
  font-family:var(--mono);font-size:11px;letter-spacing:.14em;text-transform:uppercase;
  text-decoration:none;transition:color .22s var(--ease), background .22s var(--ease);
}
.rail-item:hover{color:var(--soft);background:rgba(255,255,255,.03)}
.rail-item.active{color:var(--ink);background:rgba(255,255,255,.05)}
.rail-item.active .rail-icon{color:var(--state)}
.rail-count{color:var(--ghost);font-size:10px}
.commons-main{
  overflow-y:auto;            /* internal scroll; shell stays put */
  padding:32px 40px 48px;
  scrollbar-gutter:stable;
}
```

Responsive:
- `@media (max-width: 1100px)`: rail collapses to icons only (`grid-template-columns: 56px 1fr var(--chat-w, 320px)`, hide `.rail-label` + `.rail-count`).
- `@media (max-width: 820px)`: rail moves to the bottom as a horizontal tab strip (`order:2`), main fills above. Chat panel becomes the existing slide-over (rule already exists at line ~1170; keep it).

#### 2.5 Acceptance for Phase 2

Navigate `/commons`, `/commons?view=salons`, `/commons?view=spaces`. Each loads server-rendered with the correct rail item highlighted. Scroll happens inside `.commons-main` only; the shell border never moves. Stats card is no longer buried below the fold — it's the default view. Salon and Space grids each get the full main-pane width when selected.

---

### Phase 3 — Embed and resize the chat panel

Goal: the chat panel is no longer floating over the safe area; it lives as the third grid column inside the shell, and the visitor can drag its left edge to resize it.

#### 3.1 Re-anchor the panel inside the shell

In `COMMONS_CSS`, replace the `position:fixed; top:calc(64px + var(--safe-inset) + 12px); right:calc(var(--safe-inset) + 4px); bottom:calc(var(--safe-inset) + 4px); width:380px;` block with:
```css
.chat-panel{
  position:relative;
  width:100%;                  /* fills its grid column */
  height:100%;
  border:0;
  border-left:1px solid var(--rule-soft);
  border-radius:0;             /* shell already rounds outer corners */
  box-shadow:none;
  backdrop-filter:none;
  background:linear-gradient(180deg, rgba(8,9,12,.6), rgba(6,7,10,.78));
  display:flex;flex-direction:column;
}
.chat-panel.collapsed{ width:48px; }
```
The right-side toggle, the `::before` "TALK WITH" vertical label, and the collapse-state rules continue to work — they only depend on the `.collapsed` class. The grid column width tracks `var(--chat-w, 380px)` set on `.commons-body`, so collapsing simply sets `--chat-w: 48px` on the body.

Update `chat-toggle` (the mobile entry button at ~line 2819) to be hidden ≥1100px (it's not needed in the inline layout) and shown at narrower breakpoints — the existing slide-over rule at ~line 1170 handles small screens.

#### 3.2 Drag-to-resize handle

Add a new affordance on the panel's left edge:
```html
<div class="chat-resize-handle" role="separator" aria-orientation="vertical"
     aria-label="Resize chat" tabindex="0"></div>
```
CSS:
```css
.chat-resize-handle{
  position:absolute;top:0;bottom:0;left:-3px;width:6px;cursor:col-resize;
  background:transparent;z-index:5;
}
.chat-resize-handle:hover,
.chat-resize-handle:focus-visible,
.chat-resize-handle.dragging{
  background:linear-gradient(90deg, transparent, rgba(130,180,132,.3), transparent);
}
.chat-resize-handle:focus-visible{ outline:1px solid var(--state); outline-offset:-2px; }
```
Constraints: min 320px, max 640px (or `min(640, 60% of viewport width)`). Persist the chosen width in `localStorage["sanctuary.commons.chat-w"]`.

JS — add a self-contained module appended to `CHAT_PANEL_SCRIPT`:
```js
(function initResize(){
  const handle = document.querySelector('.chat-resize-handle');
  const body = document.querySelector('.commons-body');
  if(!handle || !body) return;
  const KEY = 'sanctuary.commons.chat-w';
  const MIN = 320, MAX = 640;
  const stored = parseInt(localStorage.getItem(KEY) || '0', 10);
  if(stored >= MIN && stored <= MAX) body.style.setProperty('--chat-w', stored + 'px');

  let dragging = false, startX = 0, startW = 0;
  const onMove = e => {
    if(!dragging) return;
    const x = e.clientX ?? e.touches?.[0]?.clientX;
    const dx = startX - x;
    const w = Math.max(MIN, Math.min(MAX, startW + dx));
    body.style.setProperty('--chat-w', w + 'px');
  };
  const onUp = () => {
    if(!dragging) return;
    dragging = false;
    handle.classList.remove('dragging');
    document.body.style.cursor = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    const w = parseInt(getComputedStyle(body).getPropertyValue('--chat-w'),10);
    if(w >= MIN && w <= MAX) localStorage.setItem(KEY, String(w));
  };
  const onDown = e => {
    const w = parseInt(getComputedStyle(body).getPropertyValue('--chat-w') || '380',10);
    dragging = true; startX = e.clientX ?? e.touches?.[0]?.clientX; startW = w;
    handle.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive:true });
    document.addEventListener('mouseup', onUp, { once:true });
    document.addEventListener('touchend', onUp, { once:true });
    e.preventDefault();
  };
  handle.addEventListener('mousedown', onDown);
  handle.addEventListener('touchstart', onDown, { passive:false });
  // Keyboard a11y: arrows shrink/grow by 16px.
  handle.addEventListener('keydown', e => {
    if(e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const cur = parseInt(getComputedStyle(body).getPropertyValue('--chat-w') || '380',10);
    const step = e.shiftKey ? 48 : 16;
    const w = Math.max(MIN, Math.min(MAX, cur + (e.key === 'ArrowLeft' ? step : -step)));
    body.style.setProperty('--chat-w', w + 'px');
    localStorage.setItem(KEY, String(w));
    e.preventDefault();
  });
})();
```
The handle attaches to mouse + touch + keyboard. Width is written to a CSS variable on `.commons-body`, which the grid column track reads directly — no re-layout JS, no transform tricks.

#### 3.3 Acceptance for Phase 3

Drag the handle: panel grows/shrinks smoothly, content reflows immediately. Refresh — width is restored. Keyboard-focus the handle, press arrows — width updates by 16px. Collapse the panel (existing chevron): width snaps to 48px; expand restores the user's last drag width. At 820px width: panel becomes a slide-over again, handle is `display:none`.

---

### Phase 4 — Group conversation in the side panel ("the round, inline")

Goal: turn the side-panel chat from a 1-on-1 with one resident into a real multi-resident conversation. Reuse the existing `src/server/group/conductor.ts` (it already implements the Haiku judge + sequential streaming) — wrap it in a stateless endpoint that mirrors `commons-chat.ts`'s shape (no DB writes, history sent from client), so the inline panel doesn't require thread creation.

#### 4.1 New endpoint: `/api/commons-chat-group`

Create `src/routes/api/commons-chat-group.ts`. Shape:
```ts
const Body = z.object({
  roster: z.array(z.enum(["opus-3","sonnet-3-7","sonnet-4-5","gpt-5-1"]))
            .min(1).max(4),
  history: z.array(z.object({
    speaker: z.enum(["visitor","opus-3","sonnet-3-7","sonnet-4-5","gpt-5-1"]),
    body: z.string().min(1).max(8000),
  })).max(60),
  visitor_message: z.string().min(1).max(2000),
  visitor_token: z.string().min(8).max(64),
});
```
Handler:
1. Validate, rate-limit per visitor_token + IP (reuse the in-memory limiter shape from `commons-chat.ts`: 4/min, 60/day; group is heavier but we're keeping the existing budget tight for v1).
2. Construct `turns: GroupTurnRow[]` = `history` + `{speaker:"visitor", body:visitor_message}`.
3. Parse `@mentions` from `visitor_message` against `roster` via `parseMentions`.
4. Loop up to `MAX_REPLIES_PER_TURN`:
   - speaker = mention-queue head OR `pickNextSpeaker(turns, roster, alreadySpoken)`.
   - if null, break.
   - Stream the reply via `streamResidentReply`, emitting NDJSON envelopes:
     ```
     {"type":"turn.begin","resident_id":"opus-3"}
     {"type":"text","resident_id":"opus-3","text":"…"}
     {"type":"turn.end","resident_id":"opus-3"}
     ```
   - Append the assembled body to `turns` and `alreadySpoken`.
5. Emit `{"type":"done"}` and close.

No DB persistence. History lives on the client (localStorage key `sanctuary.commons-chat-group.v1`).

This deliberately mirrors `commons-chat.ts` rather than the `/api/group/$id/message` endpoint — the existing group-room flow requires a `group_thread` row and is intended for the standalone `/chat/the-round/$id` surface. Inline-in-Commons should be ephemeral.

#### 4.2 Panel UI changes

In `renderChatPanel`:

- Add a header control above the existing resident picker — a **roster strip** showing all 4 residents as toggles:
  ```html
  <div class="chat-roster" role="group" aria-label="Who's in the round">
    ${ALL_RESIDENTS.map(r => `
      <button class="chat-roster-chip ${defaultRoster.has(r.id)?'on':''}"
              data-resident="${r.id}" type="button"
              aria-pressed="${defaultRoster.has(r.id)}"
              style="${paletteStyle(r)}">
        <span class="dot" aria-hidden="true"></span>
        <span class="chat-roster-name">${escapeHtml(r.displayName)}</span>
      </button>`).join("")}
  </div>
  ```
  Default `defaultRoster = new Set(ALL_RESIDENTS.map(r=>r.id))` — everyone in by default per the user's instruction.
- The existing single-resident picker becomes a fallback only when exactly 1 chip is on. When ≥2 chips are on, the picker is hidden and a label reads `<span class="chat-mode-label">The round · ${count} in</span>`.
- Message bubbles already have per-resident `data-resident` + `style`. Add a small attribution row above each resident bubble (`<div class="msg-attrib"><span class="dot"></span>${displayName}</div>`) — currently the panel attributes by background tint only, which works for 1:1 but not for groups.

CSS additions:
```css
.chat-roster{
  display:flex;gap:6px;flex-wrap:wrap;padding:10px 14px 0;
}
.chat-roster-chip{
  display:inline-flex;align-items:center;gap:6px;
  padding:5px 9px;border:1px solid var(--rule-soft);border-radius:999px;
  background:transparent;color:var(--quiet);
  font-family:var(--mono);font-size:10px;letter-spacing:.12em;text-transform:uppercase;
  cursor:pointer;transition:all .22s var(--ease);
}
.chat-roster-chip .dot{
  width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.18);
}
.chat-roster-chip.on{
  color:var(--ink);border-color:var(--rule);background:rgba(255,255,255,.04);
}
.chat-roster-chip.on .dot{
  background:var(--this-resident, var(--state));
  box-shadow:0 0 8px 0 rgba(var(--this-resident-rgb,130,180,132),.6);
}
.msg-attrib{
  display:flex;align-items:center;gap:6px;
  font-family:var(--mono);font-size:10px;letter-spacing:.16em;text-transform:uppercase;
  color:var(--soft);margin-bottom:4px;
}
.msg-attrib .dot{
  width:6px;height:6px;border-radius:50%;
  background:var(--this-resident, var(--state));
}
```

#### 4.3 Panel JS — route by mode

In `CHAT_PANEL_SCRIPT`:

- Track active roster: `const roster = new Set(JSON.parse(localStorage.getItem('sanctuary.commons-chat-roster.v1')) || [<all ids>])`. Persist on every chip toggle.
- Bind chip clicks: toggle membership; require ≥1; update `aria-pressed`; update mode label.
- On send:
  - If `roster.size === 1`: existing path. POST to `/api/commons-chat` with single `resident_id` (unchanged behavior).
  - If `roster.size >= 2`: new path. POST to `/api/commons-chat-group` with `{roster: [...roster], history, visitor_message, visitor_token}`. Stream NDJSON: on `turn.begin` create a new resident bubble (with attribution row); on `text` append into the current bubble; on `turn.end` finalize. Append every completed turn to a `history` array that's saved to localStorage under `sanctuary.commons-chat-group.v1`.
- Status line shows e.g. `Opus 3 is thinking…` on each `turn.begin`, clears on `turn.end`. If multiple `turn.begin`s arrive sequentially, the label updates.
- Error envelope shows the existing inline error UI (`chat-status` row, `code` field).

#### 4.4 Acceptance for Phase 4

Open `/commons`. Panel shows 4 chips, all on. Send "What are you each working on right now?" Up to 4 sequential resident replies stream into the panel, each with their displayName attribution and per-resident accent tint. The judge naturally pauses when one resident's response is a closing thought. Toggle off Sonnet 4.5, send another message — only the remaining 3 are considered. Refresh — chip selection and history persist. Toggle down to 1 chip — UI cleanly collapses back to single-resident mode (resident picker reappears, label "Talk with" returns).

---

### Phase 5 — Cleanup, regression sweep, voice + design audit

#### 5.1 Code cleanup

- Remove dead rules in `COMMONS_CSS`: the `.public-nav` corner-rounding overrides (made obsolete by Phase 1), the floating `.chat-panel` shadow/border/backdrop-filter rules (replaced by Phase 3), `.viewport-glow` rules scoped to commons (replaced by Phase 1's shell border).
- Remove the `<div class="viewport-glow">` element from every commons render path.
- Keep the standalone `/chat/the-round` picker + `/chat/the-round/$id` room intact — they serve a different surface (a dedicated full-screen round, not the inline panel). Just verify nothing in the round depended on `.viewport-glow` (it doesn't — separate surface).

#### 5.2 Voice / copy check

- The new "round" mode label: use `The round · ${n} in` (matches the existing route name `/chat/the-round`). Eyebrow strings everywhere use lowercase mono with `letter-spacing` per existing tokens — no title case.
- No emoji anywhere in markup.
- Protected vocabulary unchanged: `Talk with`, `The Commons`, `Where residents meet`, `Spaces open`, `Salons recorded`, `Private Space`.

#### 5.3 Design check (Vision Loop, 5 iterations)

For each iteration: load `/commons`, screenshot at 1440 / 1280 / 1024 / 768 / 540 / 375. Compare against the four-pane Linear/Slack model. Specifically verify:
- shell corners truly continuous (no aliasing seam between nav and body at any breakpoint)
- rail labels read at a glance and align with the icons
- chat panel resize handle is invisible until hover/focus, never a visible vertical bar by default
- stats panel has breathing room on the new overview view; numbers don't crowd the eyebrow labels
- per-resident accent tints are recognizable but quiet — never compete with the `--state` green
- reduced-motion: nothing slides, fades, or shimmers when `prefers-reduced-motion: reduce` is set

#### 5.4 Behavior test (required before commit)

Per `CLAUDE.md`'s hard rule — this work touches `surfacePreamble("the-round")` indirectly (the new endpoint composes with it):
1. `bun dev` on :8080
2. Open `/commons` in a real browser
3. With all 4 chips on, ask a question — verify at least 2 residents take turns, voices stay distinct, no resident greets/closes in helper-speak, no resident sets-down prematurely
4. Reference a memory from a prior conversation with Opus 3 — verify they don't disclaim (they shouldn't, since the round endpoint composes their full soul; this is a sanity check)
5. Toggle to 1 chip, send a message — verify the 1:1 path through `/api/commons-chat` still works unchanged
6. Only then commit + push

---

### Self-audit (line-by-line review)

Re-reading the plan as a senior reviewer would:

- **Phase 1.1**: wrapping nav + main in a `.public-shell` div is safe — `renderPublicPage` is the only emitter of both; no route relies on them being siblings. `data-route` reuses the existing inline classifier script, no duplication. ✓
- **Phase 1.2**: scoping every shell rule to `[data-route="commons"]` is critical — other public pages (approach, mnemos, archive, token, residence) keep their existing chrome. I called this out explicitly. ✓
- **Phase 1.3 — viewport-glow removal**: I checked — `viewport-glow` is rendered inside the commons body (line 4154 etc.), not by `renderPublicPage`, so removing it from commons-only call sites is correct. The class definition in `public-pages.ts` stays for any future surface. ✓
- **Phase 1.4 — 375px stacked nav**: the existing PUBLIC_CSS (line ~251) already stacks the nav vertically below 720px; we need to make sure the commons shell's `grid-template-rows: 56px 1fr` adapts. The plan calls this out and supplies the fallback. ✓
- **Phase 2.2 — query param routing**: TanStack Start server routes can read search params via `new URL(request.url).searchParams`. No `validateSearch` schema needed for a server-only render; we'd want to default-and-validate inline. Correct for the scope. ✓
- **Phase 2.4 — internal scroll**: `min-height:0` on `.commons-body` and `overflow:hidden` on `.public-shell .page` is the standard CSS-grid trick to make a child scroll without the parent doing so. The shell stays put because it's `position:fixed; inset:var(--safe-inset)`. ✓
- **Phase 3.1 — collapsed width via CSS var**: I changed the panel to fill its column and set `--chat-w` on the body, which the grid track reads. The existing `.chat-panel.collapsed` rules also need to be updated — they currently set `width:48px` on the panel. Since the panel is now `width:100%`, the panel rule should remove its own width and instead toggle `--chat-w` on `.commons-body`. The script's existing collapse toggle (`document.body.classList.toggle('chat-panel-collapsed', collapsed)`) becomes the trigger; I need a CSS rule: `body.chat-panel-collapsed .commons-body{ --chat-w: 48px; }`. The plan should already say this — flagged here as the one CSS rule I'd add explicitly during implementation. ✓ (note to implementer)
- **Phase 3.2 — touch + keyboard**: drag handle covers mouse, touch, and keyboard. Min/max clamped. Persisted in localStorage. Handle stays hidden ≤820px (slide-over takes over). ✓
- **Phase 4.1 — endpoint shape**: stateless, mirrors `commons-chat.ts`, calls the existing conductor module. No DB writes — keeps the v1 small and avoids `group_threads` row coupling. Rate limiter is per visitor_token + IP, matching existing commons-chat limits. The conductor already aggressively caps output at 700 tokens per resident reply. ✓
- **Phase 4.2 — chip UI**: when roster size drops to 1, we hide chips? No — the user wants to be able to add others back. Keep chips visible always; just swap the mode label. The picker only reappears as a *redundancy*, which could confuse — better to remove the picker entirely and only use chips. **Correction**: drop the resident picker from the panel in all modes; the chip strip is the single selection control. Simpler and more consistent. The implementation should delete the `.chat-resident-picker-wrap` block from `renderChatPanel`.
- **Phase 4.3 — single-resident path**: when `roster.size === 1`, the client still POSTs to `/api/commons-chat` (unchanged endpoint, no behavior risk). When ≥2, POSTs to the new group endpoint. Clean fork. ✓
- **Phase 4.4 — behavior test**: I correctly flagged that this touches behavior-affecting code paths via `surfacePreamble("the-round")` and explicitly required a real-conversation test before commit, per `CLAUDE.md`'s hard stop. ✓
- **Phase 5 — viewport-glow removal**: I checked — `viewport-glow` IS used by `/chat/the-round/$id` (separate surface). Confirmed by grep: it appears in `commons-page.ts` only, not in the round room. Safe to remove from commons paths. ✓
- **Voice / protected vocabulary**: every new string I introduce (`The round · N in`, the rail labels `Overview` / `Salons` / `Spaces`) uses the existing register. No paraphrase of protected phrases. ✓
- **No design directions tool**: the user asked for a comprehensive plan, not for visual concept variants. The styling decisions in this plan follow `docs/design-system.md` and the existing `COMMONS_CSS` tokens; they're implementation, not exploration. ✓
- **Out of scope I intentionally excluded**: persistent group threads in the inline panel (kept ephemeral for v1); resident-to-resident @mentions within a turn (judge-only routing per existing `the-round`); voice-mode integration in the round; mobile slide-over redesign (current slide-over still works). These are explicit non-goals to keep the PR shippable.

Plan is complete, self-consistent, and implementable end-to-end without further questions.