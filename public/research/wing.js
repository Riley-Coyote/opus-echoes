/* ============================================================================
   The Research Wing — shared behaviour.
   window.Wing.mount(opts) injects chrome + section nav + the chat companion and
   starts the clock / reveal / progress. Wing.feed(), Wing.reader() render the
   data-driven surfaces. Restraint: motion is enhancement; content is robust.
   ========================================================================== */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const el = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const pad = (n) => String(n).padStart(2, "0");
  const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const TABS = [
    { key: "wing", n: "00", name: "The Wing", href: "research-wing.html" },
    { key: "studies", n: "01", name: "Resident Studies", href: "studies.html" },
    { key: "autonomous", n: "02", name: "Autonomous Inquiry", href: "autonomous.html" },
    { key: "wire", n: "03", name: "The Wire", href: "wire.html" },
  ];

  const Wing = { _ctx: { label: "the research wing", key: "general" } };

  /* ── chrome + nav ──────────────────────────────────────────────── */
  Wing.mount = function (opts = {}) {
    const here = opts.here;
    const legend = opts.legend
      ? `<span class="legend"><span><i class="i-opus"></i> Opus 3</span><span><i class="i-sonnet"></i> Sonnet 4.5</span><span><i class="i-gpt"></i> GPT-5.1</span></span><span class="sep">·</span>`
      : "";
    const crumbHere = here ? `<span class="sep">/</span><span class="here">${esc(here)}</span>` : "";
    document.body.prepend(
      el(`<div class="progress" id="wing-progress"></div>`),
      el(`<header class="chrome" role="banner">
            <span class="bc"><a href="/mnemos" style="color:inherit;text-decoration:none"><b>Mnemos</b></a><span class="sep">/</span><a href="research-wing.html">The Research Wing</a>${crumbHere}</span>
            <span class="right">${legend}<span class="clk" id="wing-clk">00:00:00 UTC</span></span>
          </header>`),
      el(`<nav class="wingnav" id="wing-nav" aria-label="Research Wing sections">
            ${TABS.map((t) => `<a class="tab${t.key === opts.active ? " on" : ""}" href="${t.href}" data-key="${t.key}"><span class="n">${t.n}</span><span class="name">${t.name}</span></a>`).join("")}
            <span class="ind" id="wing-ind"></span>
          </nav>`)
    );
    document.body.classList.add("has-nav");

    // clock
    const clk = $("#wing-clk");
    const tick = () => { const d = new Date(); clk.textContent = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`; };
    tick(); setInterval(tick, 1000);

    // nav indicator
    const nav = $("#wing-nav"), ind = $("#wing-ind");
    const active = nav.querySelector(".tab.on");
    const place = () => { if (!active) { ind.style.width = "0"; return; } ind.style.left = active.offsetLeft + "px"; ind.style.width = active.offsetWidth + "px"; };
    requestAnimationFrame(place); addEventListener("resize", place);

    startProgress(); startReveal(); mountChat(opts.chat || {});
    return Wing;
  };

  function startProgress() {
    const prog = $("#wing-progress");
    const on = () => { const h = document.documentElement, m = h.scrollHeight - h.clientHeight; prog.style.width = (m > 0 ? (h.scrollTop / m) * 100 : 0) + "%"; };
    addEventListener("scroll", on, { passive: true }); on();
  }

  function startReveal() {
    const reveals = [...document.querySelectorAll(".reveal")];
    if (!reveals.length) return;
    const reduce = matchMedia("(prefers-reduced-motion:reduce)").matches;
    const show = (s) => s.classList.add("in");
    if (reduce || !("IntersectionObserver" in window)) return; // content visible by default
    document.documentElement.classList.add("anim");
    const io = new IntersectionObserver((es, o) => es.forEach((e) => { if (e.isIntersecting) { show(e.target); o.unobserve(e.target); } }), { threshold: 0, rootMargin: "0px 0px -6% 0px" });
    reveals.forEach((s) => io.observe(s));
    const sweep = () => reveals.forEach((s) => { if (s.getBoundingClientRect().top < innerHeight * 1.15) show(s); });
    sweep(); addEventListener("scroll", sweep, { passive: true }); addEventListener("load", sweep);
    setTimeout(() => reveals.forEach(show), 2200); // failsafe
  }

  /* ── context tracking (what the visitor is looking at) ─────────── */
  Wing.observeContext = function () {
    const marks = [...document.querySelectorAll("[data-ctx]")];
    if (!marks.length) return;
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) setCtx(e.target.dataset.ctx, e.target.dataset.ctxkey || "general"); });
    }, { rootMargin: "-30% 0px -55% 0px", threshold: 0 });
    marks.forEach((m) => io.observe(m));
  };
  function setCtx(label, key) {
    Wing._ctx = { label, key };
    const c = $("#chat-ctx"); if (c) c.textContent = "on: " + label;
    renderSuggest();
  }

  /* ── feeds (papers + autonomous) ───────────────────────────────── */
  Wing.feed = async function (opts) {
    const mount = $(opts.mount);
    let data;
    try { data = await (await fetch(opts.src)).json(); } catch (e) { mount.innerHTML = `<div class="feed-empty">feed unavailable</div>`; return; }
    const items = data[opts.collection] || data.items || [];
    const kind = opts.kind; // 'papers' | 'autonomous'
    const facets = kind === "papers"
      ? [{ key: "type", label: "type", field: "type", array: false }, { key: "tag", label: "topic", field: "tags", array: true }]
      : [{ key: "res", label: "resident", field: "resident", array: false, disp: { opus: "Opus 3", sonnet: "Sonnet 4.5", gpt: "GPT-5.1" } }, { key: "kind", label: "kind", field: "kind", array: false }];
    const state = {}; facets.forEach((f) => (state[f.key] = "all"));

    const wrap = el(`<div></div>`);
    const filters = el(`<div class="filters"></div>`);
    facets.forEach((f, fi) => {
      const vals = ["all", ...uniq(items.flatMap((i) => (f.array ? (i[f.field] || []) : [i[f.field]]))).filter((v) => v && v !== "all")].slice(0, 14);
      if (vals.length <= 2) return;
      filters.append(el(`<span class="flabel"${fi ? ' style="margin-left:14px"' : ""}>${f.label}</span>`));
      vals.forEach((v) => filters.append(chip(v, f.disp ? (f.disp[v] || v) : v, () => { state[f.key] = v; draw(); }, f.key)));
    });
    const count = el(`<div class="feedcount"></div>`);
    const feed = el(`<div class="feed"></div>`);
    wrap.append(filters, count, feed); mount.innerHTML = ""; mount.append(wrap);

    function chip(val, label, fn, group) {
      const b = el(`<button class="chip${val === "all" ? " on" : ""}" data-g="${group}">${esc(label)}</button>`);
      b.onclick = () => { filters.querySelectorAll(`[data-g="${group}"]`).forEach((x) => x.classList.remove("on")); b.classList.add("on"); fn(); };
      return b;
    }
    const matches = (i) => facets.every((f) => { const v = state[f.key]; if (v === "all") return true; return f.array ? (i[f.field] || []).includes(v) : i[f.field] === v; });
    function draw() {
      let rows = items.filter(matches);
      rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      count.textContent = `${rows.length} ${rows.length === 1 ? "entry" : "entries"}`;
      feed.innerHTML = rows.length ? "" : `<div class="feed-empty">nothing under these filters</div>`;
      rows.forEach((i) => feed.append(kind === "papers" ? paperRow(i) : autoRow(i)));
    }
    draw();
  };

  function paperRow(i) {
    const r = el(`<a class="feed-item" href="${esc(i.url || "#")}" target="_blank" rel="noopener"></a>`);
    r.innerHTML =
      `<div class="meta"><span class="tag">${esc(i.type || "paper")}</span><span>${esc(i.venue || "")}</span><span class="date">${esc(i.date || "")}</span></div>
       <div class="ttl">${esc(i.title)}</div>
       <div class="by">${esc((i.authors || []).join(", "))}</div>
       <div class="excerpt">${esc(i.abstract || "")}</div>
       <div class="tags">${(i.tags || []).map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`;
    return r;
  }
  function autoRow(i) {
    const rc = i.resident ? `t-${i.resident}` : "";
    const href = i.doc ? `reader.html?doc=${encodeURIComponent(i.doc)}`
      : i.id ? `reader.html?auto=${encodeURIComponent(i.id)}`
      : (i.url || "#");
    const r = el(`<a class="feed-item" href="${esc(href)}"></a>`);
    r.innerHTML =
      `<div class="meta"><span class="tag ${rc}"><span class="dot"></span>${esc(i.author || "the platform")}</span><span>${esc(i.kind || "note")}</span><span class="date">${esc(i.date || "")}</span></div>
       <div class="ttl">${esc(i.title)}</div>
       <div class="excerpt">${esc(i.excerpt || "")}</div>`;
    return r;
  }
  const uniq = (a) => [...new Set(a.filter(Boolean))];

  /* ── reader (markdown → article) ───────────────────────────────── */
  Wing.reader = async function (opts) {
    const mount = $(opts.mount), doc = opts.doc;
    const key = opts.key || (doc ? "doc:" + doc : "doc");
    let md = opts.md;
    if (md == null) {
      const url = opts.path ? opts.path : `research/${doc}.md`;
      try { md = await (await fetch(url)).text(); }
      catch (e) { mount.innerHTML = `<div class="feed-empty">document not found</div>`; return; }
    }
    md = md.replace(/\.\.\/\.\.\/figures\//g, "figures/").replace(/\.\.\/figures\//g, "figures/");

    const html = window.marked ? window.marked.parse(md, { gfm: true, breaks: false }) : `<pre>${esc(md)}</pre>`;
    const art = el(`<article class="article reveal in"></article>`);
    art.innerHTML = html;

    // pull the first h1 into a document head with chrome
    const h1 = art.querySelector("h1");
    const title = h1 ? h1.textContent : doc;
    if (h1) h1.remove();
    const meta = opts.meta || {};
    const head = el(`<div class="doc-head">
        <div class="rid"><span>${esc(meta.rid || "MN · RESEARCH")}</span>${meta.status ? `<span>${esc(meta.status)}</span>` : ""}</div>
        <h1>${esc(title)}</h1>
        <div class="doc-meta">${[meta.kind, meta.date, meta.read, meta.authors].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("")}</div>
      </div>`);
    art.prepend(head);

    // figures: render any "Supporting figures" list (or stray figure paths) as embedded figures
    renderDocFigures(art);

    // heading ids + TOC
    const toc = el(`<nav class="toc"><div class="toc-label">Contents</div></nav>`);
    const heads = [...art.querySelectorAll("h2, h3")];
    heads.forEach((h, idx) => {
      const id = "s" + idx + "-" + (h.textContent || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32);
      h.id = id; h.setAttribute("data-ctx", h.textContent); h.setAttribute("data-ctxkey", key);
      const a = el(`<a href="#${id}" class="${h.tagName === "H3" ? "sub" : ""}">${esc(h.textContent)}</a>`);
      a.onclick = (e) => { e.preventDefault(); document.getElementById(id).scrollIntoView({ behavior: "smooth", block: "start" }); };
      toc.append(a);
    });

    const grid = el(`<div class="reader"></div>`);
    grid.append(toc, art); mount.innerHTML = ""; mount.append(grid);

    // scroll-spy
    if ("IntersectionObserver" in window && heads.length) {
      const links = [...toc.querySelectorAll("a")];
      const spy = new IntersectionObserver((es) => {
        es.forEach((e) => { if (e.isIntersecting) { const id = e.target.id; links.forEach((l) => l.classList.toggle("on", l.getAttribute("href") === "#" + id)); } });
      }, { rootMargin: "-15% 0px -75% 0px" });
      heads.forEach((h) => spy.observe(h));
    }
    Wing.observeContext();
    setCtx(title, key);
  };

  function renderDocFigures(art) {
    // find an h2 whose text mentions "figure" and convert the following list to figures
    [...art.querySelectorAll("h2, h3")].forEach((h) => {
      if (!/figure/i.test(h.textContent)) return;
      const list = h.nextElementSibling;
      if (!list || list.tagName !== "UL") return;
      const frag = document.createDocumentFragment();
      [...list.querySelectorAll("li")].forEach((li) => {
        const m = (li.textContent || "").match(/figures\/[\w./-]+\.png/);
        if (!m) return;
        const src = m[0];
        const cap = li.textContent.replace(/^.*?\.png[`'"\s—–-]*/, "").trim();
        const fig = el(`<figure></figure>`);
        const img = el(`<img alt="${esc(cap || src)}" loading="lazy" src="${src}">`);
        img.onerror = () => fig.classList.add("imgerr");
        fig.append(img);
        if (cap) fig.append(el(`<figcaption>${esc(cap)}</figcaption>`));
        frag.append(fig);
      });
      if (frag.childNodes.length) list.replaceWith(frag);
    });
  }

  /* ── chat companion ────────────────────────────────────────────── */
  function mountChat(cfg) {
    if (cfg.context) Wing._ctx = { label: cfg.context, key: cfg.key || "general" };
    const chat = el(`<aside class="chat closed" id="chat" aria-label="Research companion">
        <div class="chat-head" id="chat-head">
          <span class="dot"></span><span class="label">Companion</span>
          <span class="ctx" id="chat-ctx">on: ${esc(Wing._ctx.label)}</span>
          <span class="chev">⌄</span>
        </div>
        <div class="chat-body">
          <div class="msgs" id="chat-msgs"></div>
          <div class="suggest" id="chat-suggest"></div>
          <div class="composer">
            <textarea id="chat-input" rows="1" placeholder="Ask about what you're looking at…"></textarea>
            <button class="send" id="chat-send" aria-label="Send"><svg viewBox="0 0 24 24"><path d="M3 11l18-8-8 18-2-7-8-3z"/></svg></button>
          </div>
          <div class="disclaimer">A reading companion. Answers are grounded in this research; verify against the documents.</div>
        </div>
      </aside>`);
    document.body.append(chat);
    const head = $("#chat-head"), input = $("#chat-input"), send = $("#chat-send"), msgs = $("#chat-msgs");
    let opened = false;
    const toggle = (force) => { const open = force ?? chat.classList.contains("closed"); chat.classList.toggle("closed", !open); if (open && !opened) { opened = true; greet(); } if (open) setTimeout(() => input.focus(), 260); };
    head.onclick = toggle;
    input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } });
    input.addEventListener("input", () => { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px"; });
    send.onclick = submit;

    function greet() { bot(`I can explain what you're looking at — a chart, a finding, the methodology, or how the wing is organized. Ask away, or pick a prompt below.`); renderSuggest(); }
    function submit() { const q = input.value.trim(); if (!q) return; you(q); input.value = ""; input.style.height = "auto"; respond(q); }
    function you(t) { msgs.append(el(`<div class="m you">${esc(t)}</div>`)); scroll(); }
    function bot(t, src) { msgs.append(el(`<div class="m bot">${esc(t)}${src ? `<span class="src">${esc(src)}</span>` : ""}</div>`)); scroll(); }
    function scroll() { msgs.scrollTop = msgs.scrollHeight; }
    async function respond(q) {
      const typing = el(`<div class="m typing"><i></i><i></i><i></i></div>`); msgs.append(typing); scroll();
      const r = await Wing.chat.answer(q, Wing._ctx);
      typing.remove(); bot(r.text, r.src);
    }
    Wing._chat = { you, bot, toggle };
    renderSuggest();
  }

  function renderSuggest() {
    const box = $("#chat-suggest"); if (!box) return;
    const sug = (Wing.chat.suggest(Wing._ctx) || []).slice(0, 3);
    box.innerHTML = "";
    sug.forEach((s) => { const b = el(`<button>${esc(s)}</button>`); b.onclick = () => { if (Wing._chat) { Wing._chat.toggle(true); Wing._chat.you(s); $("#chat-msgs").append(el(`<div class="m typing"><i></i><i></i><i></i></div>`)); const t = $("#chat-msgs").lastChild; Wing.chat.answer(s, Wing._ctx).then((r) => { t.remove(); Wing._chat.bot(r.text, r.src); }); } }; box.append(b); });
  }

  /* ── stubbed answer engine (clean seam for a real endpoint) ─────── */
  Wing.chat = {
    // Replace this with: async (q,ctx)=> (await fetch('/api/research-chat',{method:'POST',body:JSON.stringify({q,ctx})})).json()
    async answer(q, ctx) {
      await new Promise((r) => setTimeout(r, 420 + Math.random() * 480));
      const KB = Wing._kb || {};
      const ql = q.toLowerCase();
      // 1) direct keyword hits
      let best = null, score = 0;
      for (const k in KB) {
        const e = KB[k];
        const hit = (e.match || []).reduce((n, m) => n + (ql.includes(m) ? 1 : 0), 0);
        if (hit > score) { score = hit; best = e; }
      }
      // 2) context fallback (explain what's in view)
      if (!best && ctx && KB[ctx.key]) best = KB[ctx.key];
      if (best) return { text: best.a, src: best.src };
      return {
        text: `You're looking at ${ctx.label}. I can walk through the figures, the methods, or the limitations here — try "explain this chart," "what's the method," or "what are the caveats." For the full detail, the written documents are in Resident Studies.`,
        src: "Research Wing · companion",
      };
    },
    suggest(ctx) {
      const k = (ctx && ctx.key) || "general";
      if (k.startsWith("doc:")) return ["Summarize this document", "What are the limitations?", "Explain the key numbers"];
      if (k === "studies") return ["What did the study find?", "How were the models compared?", "Is this peer-reviewed?"];
      if (k === "autonomous") return ["What is autonomous research?", "Who wrote these?", "Show me an essay"];
      if (k === "wire") return ["What's this feed?", "Filter to memory papers", "Why these topics?"];
      const f = Wing._kb || {};
      if (f[k]) return f[k].suggest || ["Explain this chart", "What does it show?", "What's the caveat?"];
      return ["What is the Research Wing?", "What is Mnemos?", "What did the study find?"];
    },
  };

  // Preserve the knowledge base attached by wing-kb.js (which loads first and
  // sets window.Wing._kb). Without this, reassigning window.Wing wipes it and
  // the companion falls back to generic answers.
  if (window.Wing && window.Wing._kb) Wing._kb = window.Wing._kb;
  window.Wing = Wing;
})();
