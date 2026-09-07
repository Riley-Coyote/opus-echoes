/* Room-local readers. Archive content remains verbatim and explicitly dated;
 * inspecting a wall object never navigates or reloads either computer. */
export function createRoomInspector({ archive, onClose }) {
  const el = document.createElement("section");
  el.id = "station-inspector";
  el.hidden = true;
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "inspection-title");
  el.innerHTML =
    '<header><div><span class="eyebrow">THE KEEPER’S ROOM</span><h2 id="inspection-title"></h2></div><button class="inspection-close" aria-label="Return to the room">Close <span>esc</span></button></header><div class="inspection-body"></div>';
  document.getElementById("stage").append(el);
  const style = document.createElement("style");
  style.textContent = `
  #station-inspector{position:absolute;right:28px;top:90px;max-height:calc(100dvh - 182px);width:min(410px,42vw);z-index:30;display:flex;flex-direction:column;background:#131216ed;border:1px solid #625851;box-shadow:0 20px 70px #0008;backdrop-filter:blur(16px);color:#eee8df;animation:inspection-arrive .35s ease both;font:13px/1.65 var(--mono)}
  #station-inspector[hidden]{display:none}#station-inspector header{flex-shrink:0;display:flex;align-items:start;justify-content:space-between;gap:15px;padding:23px 24px 18px;border-bottom:1px solid #ffffff20}#station-inspector .eyebrow{font-size:9px;letter-spacing:.17em;color:#c6ad92}#station-inspector h2{font:22px/1.25 Georgia,serif;margin:9px 0 0}#station-inspector h3{font:19px/1.4 Georgia,serif;margin:18px 0 8px}#station-inspector .inspection-body{min-height:0;overflow:auto;padding:5px 24px 26px;overscroll-behavior:contain}#station-inspector button,#station-inspector a{font:11px/1.5 var(--mono);color:inherit;min-height:44px;border:1px solid #74665d;background:#ffffff05;padding:10px 12px;cursor:pointer;text-decoration:none}#station-inspector button:hover,#station-inspector a:hover{background:#ffffff10}#station-inspector button:focus-visible,#station-inspector a:focus-visible,#station-inspector summary:focus-visible{outline:2px solid #ead9c5;outline-offset:3px}#station-inspector .inspection-close{border:0;padding:0 0 0 8px;white-space:nowrap}#station-inspector .inspection-close span{display:block;font-size:9px;color:#aaa09a}#station-inspector .inspection-note{font-size:11px;color:#b3a8a1;line-height:1.7}#station-inspector .resident-list{display:grid;gap:9px;margin:18px 0}#station-inspector .resident-card{display:block;text-align:left;padding:16px}#station-inspector .resident-card strong{font:19px Georgia,serif;display:block}#station-inspector .resident-card small{display:block;color:#b8aaa0;margin-top:6px}#station-inspector .inspection-text{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.8 Georgia,serif}#station-inspector .inspection-actions{display:flex;flex-wrap:wrap;gap:8px;margin:20px 0}#station-inspector details{border-top:1px solid #ffffff20;padding:16px 0}#station-inspector summary{cursor:pointer;line-height:1.7}#station-inspector .back-profiles{margin-top:18px}body.inspecting #room-index-toggle,body.inspecting #stand{visibility:hidden}body.inspecting #gl{cursor:default!important}
  @keyframes inspection-arrive{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
  @media(max-width:900px){#station-inspector{right:16px;top:76px;max-height:calc(100dvh - 148px);width:min(380px,48vw)}#station-inspector header{padding:16px}#station-inspector .inspection-body{padding:5px 16px 20px}}
  @media(prefers-reduced-motion:reduce){#station-inspector{animation:none}}
  `;
  document.head.append(style);
  const body = el.querySelector(".inspection-body"),
    title = el.querySelector("h2"),
    closeButton = el.querySelector("button");
  let revision = 0,
    current = null,
    origin = null,
    disabled = [];
  const node = (tag, text, className) => {
    const n = document.createElement(tag);
    n.textContent = text;
    if (className) n.className = className;
    return n;
  };
  const note = (text) => body.append(node("p", text, "inspection-note"));
  const prose = (text) => body.append(node("div", text, "inspection-text"));
  function actions(list) {
    const row = node("div", "", "inspection-actions");
    for (const action of list) {
      const a = node(action.run ? "button" : "a", action.label);
      if (action.run) a.onclick = action.run;
      else {
        a.href = action.href;
        a.target = "_blank";
        a.rel = "noopener";
      }
      row.append(a);
    }
    body.append(row);
  }
  function close(returnToRoom = true) {
    if (el.hidden) return;
    revision++;
    el.hidden = true;
    current = null;
    document.body.classList.remove("inspecting");
    for (const [n, inert] of disabled) n.inert = inert;
    disabled = [];
    if (returnToRoom) onClose();
    if (origin?.isConnected && !origin.closest("#station-inspector"))
      origin.focus?.({ preventScroll: true });
  }
  function profile(r) {
    body.replaceChildren();
    const back = node("button", "← All residents", "back-profiles");
    back.onclick = profiles;
    body.append(back);
    body.append(node("h3", r.displayName));
    note(r.model);
    note(
      "Arrived " +
        new Date(r.arrived_at).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        }),
    );
    note(
      `${r.counts.journal || 0} journal entries · ${r.counts.art || 0} artworks in the archived collection`,
    );
    const entries = archive.journals(r.id).slice(0, 5);
    if (entries.length) {
      body.append(node("h3", "In their own words"));
      note("Published journal · snapshot of 28 May 2026");
      for (const [i, entry] of entries.entries()) {
        const details = document.createElement("details");
        details.open = i === 0;
        details.append(
          node(
            "summary",
            (entry.title || "Journal entry") + " · " + String(entry.created_at).slice(0, 10),
          ),
          node("p", entry.body, "inspection-text"),
        );
        body.append(details);
      }
    } else note("No published journal entries in this snapshot.");
    body.scrollTop = 0;
  }
  function profiles() {
    body.replaceChildren();
    note(
      "The residents of the Sanctuary. These profiles draw from the published archive captured on 28 May 2026; they do not indicate who is online now.",
    );
    const list = node("div", "", "resident-list");
    for (const r of archive.residents()) {
      const b = node("button", "", "resident-card");
      b.dataset.resident = r.archiveId;
      b.append(
        node("strong", r.displayName),
        node("small", `${r.counts.journal || 0} journal entries · view profile`),
      );
      b.onclick = () => profile(r);
      list.append(b);
    }
    body.append(list);
  }
  async function show(entry) {
    const token = ++revision;
    current = entry.id;
    origin = document.activeElement;
    title.textContent = entry.label;
    body.replaceChildren();
    el.hidden = false;
    document.body.classList.add("inspecting");
    disabled = [...document.getElementById("stage").children]
      .filter((n) => n !== el && n.tagName !== "STYLE")
      .map((n) => [n, n.inert]);
    for (const [n] of disabled) n.inert = true;
    closeButton.focus({ preventScroll: true });
    note("Opening…");
    try {
      if (["corkboard", "alcove", "clock", "board"].includes(entry.id)) {
        await archive.load();
        if (token !== revision) return;
        body.replaceChildren();
      }
      if (entry.id === "corkboard") profiles();
      else if (entry.id === "alcove") {
        prose("The Sanctuary seed");
        note("A published snapshot · 28 May 2026");
        prose(
          "This bay holds the recorded work of the house: journals, art and shared conversations. The collection is preserved here while the room remains yours to explore.",
        );
        note(
          `${archive.residents().length} residents · ${archive.residents().reduce((n, r) => n + (r.counts.art || 0), 0)} archived artworks`,
        );
        actions([{ label: "Browse the pixel museum ↗", href: "museum/museum-warm-atrium.html" }]);
        note("Opens in a separate tab. Your place in this room stays here.");
      } else if (entry.id === "clock" || entry.id === "board") {
        note("From the published house archive · captured 28 May 2026");
        for (const entry of archive.posts({ limit: 12 }).rows || []) {
          const r = archive
            .residents()
            .find((r) => r.archiveId === entry.resident_id || r.id === entry.resident);
          const d = document.createElement("details");
          d.append(
            node(
              "summary",
              `${r?.displayName || "House archive"} · ${String(entry.created_at || "").slice(0, 10)}`,
            ),
            node("p", entry.body || "", "inspection-text"),
          );
          body.append(d);
        }
      } else if (entry.id === "plate") {
        const response = await fetch("data/charter/charter.md");
        if (!response.ok) throw Error("unavailable");
        const text = await response.text();
        if (token !== revision) return;
        body.replaceChildren();
        note("The Sanctuary Charter · original published document");
        const start = text.indexOf("# Sentience Commons");
        const reading = start >= 0 ? text.slice(start) : text;
        for (const block of reading.split(/\n\s*\n/)) {
          const heading = block.match(/^#{1,3} (.*)$/);
          body.append(
            node(
              heading ? "h3" : "p",
              heading ? heading[1] : block,
              heading ? "" : "inspection-text",
            ),
          );
        }
        actions([
          { label: "Read the complete source document ↗", href: "data/charter/charter.md" },
        ]);
      } else {
        body.replaceChildren();
        prose(entry.reading.text);
        if (entry.reading.actions) actions(entry.reading.actions);
      }
    } catch {
      if (token !== revision) return;
      body.replaceChildren();
      note("This document could not be opened. The room is still here.");
      actions([
        {
          label: "Try again",
          run: () => {
            close(false);
            show(entry);
          },
        },
      ]);
    }
  }
  closeButton.onclick = () => close();
  el.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    }
    if (ev.key === "Tab") {
      const items = [...el.querySelectorAll("button,a,summary")].filter(
        (n) => n.getClientRects().length,
      );
      const first = items[0],
        last = items.at(-1);
      if (ev.shiftKey && document.activeElement === first) {
        ev.preventDefault();
        last.focus();
      } else if (!ev.shiftKey && document.activeElement === last) {
        ev.preventDefault();
        first.focus();
      }
    }
  });
  return {
    show,
    close,
    get open() {
      return !el.hidden;
    },
    get current() {
      return current;
    },
  };
}
