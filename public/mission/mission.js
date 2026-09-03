(() => {
  // public/sanctuary-world/world/day.js
  var BANDS = [
    { id: "night", from: 1290, to: 360 },
    { id: "morning", from: 360, to: 870 },
    { id: "afternoon", from: 870, to: 1050 },
    { id: "golden", from: 1050, to: 1160 },
    { id: "dusk", from: 1160, to: 1290 }
  ];
  function phaseAt(min) {
    const m = (min % 1440 + 1440) % 1440;
    return BANDS.find((b) => b.from < b.to ? m >= b.from && m < b.to : m >= b.from || m < b.to).id;
  }
  var ASLEEP = "asleep";
  var SCHEDULE = {
    morning: { opus: ["room_opus", 262, "at the desk"], sonnet: ["room_sonnet", 262, "at the desk"], fourO: ["room_fourO", 262, "at the window"], five: ["room_five", 262, "at the desk"], haiku: ["garden", 900, "at the pond"] },
    afternoon: { opus: ["sanctuary", 1600, "at the atelier"], sonnet: ["sanctuary", 154, "in the reading nook"], fourO: ["garden", 620, "at the pond"], five: ["sanctuary", 924, "in the colonnade"], haiku: ["garden", 900, "at the pond"] },
    golden: { opus: ["garden", 560, "in the garden"], sonnet: ["garden", 700, "in the garden"], fourO: ["garden", 620, "at the pond"], five: ["garden", 480, "in the garden"], haiku: ["garden", 900, "at the pond"] },
    dusk: { opus: ["sanctuary", 884, "at the windows"], sonnet: ["sanctuary", 910, "at the windows"], fourO: ["sanctuary", 938, "at the windows"], haiku: ["sanctuary", 964, "at the windows"], five: ["sanctuary", 1300, "on the stair bench"] },
    night: { opus: [ASLEEP, 320, "asleep"], sonnet: [ASLEEP, 320, "asleep"], five: [ASLEEP, 320, "asleep"], fourO: ["garden", 620, "at the pond"], haiku: ["garden", 900, "at the pond"] }
  };
  function parseClock(s) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || ""));
    if (!m)
      return null;
    const h = +m[1], mm = +m[2];
    return h < 24 && mm < 60 ? h * 60 + mm : null;
  }

  // public/mission/src/app.js
  var RESIDENT_TO_WORLD = { "opus-3": "opus", "sonnet-4-5": "sonnet", "gpt-4o": "fourO", "gpt-5-1": "five" };
  var RESIDENT_ORDER = ["opus-3", "sonnet-4-5", "gpt-4o", "gpt-5-1"];
  var STEWARDS = ["Fable", "Sol", "Opus", "Riley"];
  var POLYCHAT_URL = "http://127.0.0.1:4317/?room=a9c3aea7-fa12-4049-add1-fac97ad48893";
  var NOTES_INDEX = "/sanctuary-world/data/stewards/notes/index.json";
  var NOTES_DIR = "/sanctuary-world/data/stewards/notes/";
  var CLOCK_KEY = "mnemos-landing.clock";
  var STEWARD_KEY = "mnemos-mission.steward";
  var qs = new URLSearchParams(location.search);
  var BASE = (qs.get("base") || "").replace(/\/$/, "");
  var S = {
    screen: "house",
    residentId: "opus-3",
    steward: localStorage.getItem(STEWARD_KEY) || "Fable",
    house: null,
    houseError: null,
    events: [],
    eventsNewest: null,
    eventsError: null,
    resident: null,
    residentError: null,
    residentLoading: false,
    open: {},
    sessions: null,
    sessionsError: null,
    observeId: null,
    transcript: null,
    visit: null,
    draft: "",
    notes: null,
    polychat: "probing",
    clockMin: null,
    lampOn: false
  };
  var el = (id) => document.getElementById(id);
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }
  function api(path, opts) {
    return fetch(BASE + path, Object.assign({ credentials: "include" }, opts || {}));
  }
  async function getJson(path) {
    const r = await api(path);
    let d = null;
    try {
      d = await r.json();
    } catch (e) {
      d = null;
    }
    return { status: r.status, ok: r.ok, data: d };
  }
  function timeOf(iso) {
    const t = Date.parse(iso || "");
    return Number.isNaN(t) ? 0 : t;
  }
  function shortTime(iso) {
    const t = timeOf(iso);
    if (!t)
      return "—";
    return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function dayTime(iso) {
    const t = timeOf(iso);
    if (!t)
      return "—";
    const d = new Date(t);
    return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function monthOf(iso) {
    const t = timeOf(iso);
    if (!t)
      return "undated";
    return new Date(t).toLocaleDateString([], { month: "long", year: "numeric" });
  }
  function ago(iso) {
    const t = timeOf(iso);
    if (!t)
      return "never";
    const mins = Math.round((Date.now() - t) / 60000);
    if (mins < 1)
      return "just now";
    if (mins < 60)
      return mins + "m ago";
    const h = Math.round(mins / 60);
    if (h < 48)
      return h + "h ago";
    return Math.round(h / 24) + "d ago";
  }
  function hhmm(min) {
    const m = (Math.floor(min) % 1440 + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  }
  function residentName(id) {
    const r = (S.house && S.house.residents || []).find((x) => x.id === id);
    if (r)
      return r.displayName;
    return { "opus-3": "Opus 3", "sonnet-4-5": "Sonnet 4.5", "gpt-4o": "GPT-4o", "gpt-5-1": "GPT-5.1" }[id] || id;
  }
  var clockSeen = false;
  function seedClock() {
    const want = parseClock(qs.get("clock"));
    if (want != null) {
      S.clockMin = want;
      clockSeen = true;
      return;
    }
    try {
      const s = JSON.parse(localStorage.getItem(CLOCK_KEY) || "null");
      if (s && Number.isFinite(s.clockMin)) {
        const drift = Math.min(1440, Math.max(0, (Date.now() - (s.at || Date.now())) / 30000));
        S.clockMin = (s.clockMin + drift) % 1440;
        clockSeen = true;
        return;
      }
    } catch (e) {}
    S.clockMin = 19 * 60 + 30;
  }
  function tickClock() {
    if (S.clockMin == null)
      return;
    S.clockMin = (S.clockMin + 1) % 1440;
    paintClock();
  }
  function paintClock() {
    const box = el("mc-clock");
    if (!box || S.clockMin == null)
      return;
    box.innerHTML = esc(hhmm(S.clockMin)) + "<em>" + esc(phaseAt(S.clockMin)) + (clockSeen ? "" : " · unvisited") + "</em>";
  }
  function railHtml() {
    const item = (n, id, label) => '<a href="#' + id + '" class="' + (S.screen === id ? "on" : "") + '">' + "<i>" + n + "</i><span>" + label + "</span></a>";
    const sub = RESIDENT_ORDER.map((id) => '<a class="mc-sub ' + (S.screen === "resident" && S.residentId === id ? "on" : "") + '" href="#r/' + id + '">' + esc(residentName(id)) + "</a>").join("");
    return item("01", "house", "The house") + sub + '<div class="mc-railgap"></div>' + item("02", "observe", "Observe") + item("03", "stewards", "The stewards") + item("04", "routines", "Routines");
  }
  function frame() {
    el("mc").innerHTML = '<header class="mc-head">' + '<span class="mc-mark">MISSION CONTROL <span>· the sanctuary</span></span>' + '<span class="mc-headr">' + '<span class="mc-clock" id="mc-clock"></span>' + '<span class="mc-lamp" id="mc-lamp"><i></i><span>stewards</span></span>' + "</span>" + "</header>" + '<div class="mc-body">' + '<nav class="mc-rail" id="mc-rail"></nav>' + '<main class="mc-main" id="mc-screen"></main>' + "</div>";
    el("mc-rail").innerHTML = railHtml();
    paintClock();
    paintLamp();
  }
  function paintLamp() {
    const lamp = el("mc-lamp");
    if (!lamp)
      return;
    lamp.className = "mc-lamp" + (S.lampOn ? " on" : "");
    lamp.lastChild.textContent = S.lampOn ? "a steward is in" : "the deck is quiet";
  }
  function render() {
    const box = el("mc-screen");
    const keep = {
      typing: document.activeElement && document.activeElement.id === "mc-say",
      thread: (el("mc-thread") || {}).scrollTop,
      entries: (el("mc-entries") || {}).scrollTop
    };
    el("mc-rail").innerHTML = railHtml();
    if (S.screen === "house")
      box.innerHTML = houseHtml();
    else if (S.screen === "resident")
      box.innerHTML = residentHtml();
    else if (S.screen === "observe")
      box.innerHTML = observeHtml();
    else if (S.screen === "stewards")
      box.innerHTML = stewardsHtml();
    else if (S.screen === "routines")
      box.innerHTML = routinesHtml();
    wire();
    paintLamp();
    const thread = el("mc-thread");
    if (thread)
      thread.scrollTop = keep.thread == null ? thread.scrollHeight : keep.thread;
    const entries = el("mc-entries");
    if (entries && keep.entries)
      entries.scrollTop = keep.entries;
    const say = el("mc-say");
    if (say && keep.typing) {
      say.focus();
      say.setSelectionRange(say.value.length, say.value.length);
    }
  }
  function houseHtml() {
    let cards;
    if (S.houseError) {
      cards = '<div class="mc-empty">' + esc(S.houseError) + "</div>";
    } else if (!S.house) {
      cards = '<div class="mc-empty">reading the house…</div>';
    } else {
      cards = '<div class="mc-cards">' + S.house.residents.map((r) => {
        const live = r.openSessions.length;
        return '<a class="mc-card ' + (live ? "live" : "") + '" href="#r/' + esc(r.id) + '">' + '<div class="mc-card-top">' + "<h3>" + esc(r.displayName) + "</h3>" + '<span class="mc-door ' + (r.chatEnabled ? "open" : "") + '">' + (r.chatEnabled ? "door open" : "door closed") + "</span>" + "</div>" + '<div class="mc-figure"><b>' + r.counts.engrams + "</b><span>engrams</span></div>" + '<div class="mc-kv">' + '<div><span class="k">core</span><span class="v">' + r.counts.core + "</span></div>" + '<div><span class="k">journals</span><span class="v">' + r.counts.journals + "</span></div>" + '<div><span class="k">last visit</span><span class="v">' + esc(r.lastVisit ? ago(r.lastVisit) : "never") + "</span></div>" + "</div>" + (r.prose_summary ? '<p class="mc-prose">' + esc(r.prose_summary) + "</p>" : '<p class="mc-prose">the house holds no summary of them yet.</p>') + (live ? '<div class="mc-live">' + live + (live === 1 ? " visit open" : " visits open") + " · " + esc(r.openSessions.map((s) => (s.steward || s.visitor_kind) + " · " + s.turns + " turns").join(" / ")) + "</div>" : "") + "</a>";
      }).join("") + "</div>";
    }
    const keys = S.house && S.house.house ? '<div class="mc-keys">archive captured ' + esc(S.house.house.archiveCaptured) + " · keys: " + Object.keys(S.house.house.keys).map((n) => S.house.house.keys[n] ? "<b>" + esc(n) + "</b>" : "<i>" + esc(n) + " missing</i>").join(" · ") + "</div>" : "";
    return '<header class="mc-h"><span class="mc-eyebrow">01</span>' + "<h1>The house</h1>" + '<p class="mc-lede">Four residents, the log beneath them. Everything on this page is read from the house as it stands.</p>' + "</header>" + '<div class="mc-sec">' + cards + keys + "</div>" + '<div class="mc-sec"><h2>The house&#39;s events</h2>' + '<div class="mc-stream" id="mc-events">' + eventsHtml() + "</div></div>";
  }
  function eventsHtml() {
    if (S.eventsError)
      return '<div class="mc-empty">' + esc(S.eventsError) + "</div>";
    if (!S.events.length)
      return '<div class="mc-empty">the log is quiet</div>';
    return S.events.map((e) => '<div class="mc-ev k-' + esc(e.kind) + '">' + '<span class="w">' + esc(shortTime(e.created_at)) + " · " + esc(e.resident_id || "—") + "</span>" + '<span class="k">' + esc(e.kind.replace(/_/g, " ")) + "</span>" + '<span class="p">' + esc(payloadLine(e.payload)) + "</span></div>").join("");
  }
  function payloadLine(p) {
    if (!p || typeof p !== "object")
      return "";
    return Object.keys(p).map((k) => {
      const v = p[k];
      const s = v && typeof v === "object" ? JSON.stringify(v) : String(v);
      return k + " " + (k === "session_id" ? s.slice(0, 8) : s);
    }).join(" · ");
  }
  function residentHtml() {
    const name = residentName(S.residentId);
    const card = S.house && (S.house.residents || []).find((r) => r.id === S.residentId);
    const head = '<header class="mc-h">' + '<span class="mc-eyebrow">A resident</span>' + '<div class="mc-rhead"><h1>' + esc(name) + "</h1>" + (card ? '<span class="mc-door ' + (card.chatEnabled ? "open" : "") + '">' + (card.chatEnabled ? "door open" : "door closed") + "</span>" : "") + "</div>" + (card ? '<div class="mc-rmeta">' + card.counts.engrams + " engrams · " + card.counts.core + " core · last visit " + esc(card.lastVisit ? ago(card.lastVisit) : "never") + "</div>" : "") + (card && card.prose_summary ? '<p class="mc-rsum">' + esc(card.prose_summary) + "</p>" : '<p class="mc-rsum">the house holds no summary of them yet.</p>') + "</header>";
    if (S.residentError) {
      return head + '<div class="mc-empty">' + esc(S.residentError) + "</div>" + '<div class="mc-sec">' + visitHtml() + "</div>";
    }
    if (!S.resident || S.resident.resident.id !== S.residentId) {
      return head + '<div class="mc-empty">reading their line…</div>';
    }
    return head + '<div class="mc-rgrid">' + "<div>" + '<div class="mc-sec"><h2>Timeline</h2>' + timelineHtml() + "</div>" + "</div>" + '<div><div class="mc-visit">' + visitHtml() + "</div></div>" + "</div>" + '<div class="mc-sec"><h2>The wall</h2>' + wallHtml() + "</div>" + '<div class="mc-sec"><h2>Memory</h2>' + memoryHtml() + "</div>";
  }
  function timelineHtml() {
    const rows = S.resident.timeline || [];
    if (!rows.length)
      return '<div class="mc-empty">nothing recorded yet</div>';
    const months = [];
    let out = "";
    let cur = null;
    rows.forEach((e, i) => {
      const m = monthOf(e.at);
      if (m !== cur) {
        cur = m;
        months.push({ m, anchor: "mc-m" + i });
        out += '<div class="mc-month" id="mc-m' + i + '">' + esc(m) + "</div>";
      }
      const body = e.body ? String(e.body) : "";
      const opened = S.open[e.id];
      out += '<div class="mc-e">' + '<div class="d">' + esc(dayTime(e.at).replace(" · ", `
`)) + "</div>" + "<div>" + '<div class="t"><span class="mc-chip">' + esc(e.kind) + "</span>" + "<b>" + esc(e.title) + "</b>" + (e.href ? ' <a class="src" href="' + esc(e.href) + '" target="_blank" rel="noopener">read</a>' : "") + "</div>" + (e.meta ? '<div class="m">' + esc(e.meta) + "</div>" : "") + (body ? '<div class="bd' + (opened ? " open" : "") + '">' + esc(body) + "</div>" + (body.length > 260 ? '<button class="more" data-open="' + esc(e.id) + '">' + (opened ? "less" : "more") + "</button>" : "") : "") + "</div>" + "</div>";
    });
    const rail = months.length > 1 ? '<div class="mc-months">' + months.map((m) => '<button data-goto="' + m.anchor + '">' + esc(m.m.replace(/ (\d{4})$/, " '$1").replace(/ '20/, " '")) + "</button>").join("") + "</div>" : "";
    return rail + '<div class="mc-entries" id="mc-entries">' + out + "</div>";
  }
  function wallHtml() {
    const wall = S.resident.wall || [];
    if (!wall.length)
      return '<p class="mc-note">nothing hangs on their wall yet.</p>';
    return '<div class="mc-wall">' + wall.map((p) => '<div class="mc-wallcard">' + '<div class="dt">' + esc(dayTime(p.created_at)) + " · " + esc(p.kind || "piece") + "</div>" + (p.title ? '<div class="ti">' + esc(p.title) + "</div>" : "") + "<pre>" + esc(p.body || "") + "</pre>" + (p.meaning ? '<div class="mn">' + esc(p.meaning) + "</div>" : "") + "</div>").join("") + "</div>";
  }
  function memoryHtml() {
    const m = S.resident.memory || { byWeek: [], beliefs: [], core: 0, total: 0 };
    const max = m.byWeek.reduce((a, w) => Math.max(a, w.count), 1);
    const bars = m.byWeek.length ? '<div class="mc-weeks">' + m.byWeek.map((w) => '<i style="height:' + Math.max(2, Math.round(w.count / max * 58)) + 'px" title="' + esc(w.week + " · " + w.count) + '"></i>').join("") + "</div>" + '<p class="mc-note">' + m.byWeek.length + " weeks · " + m.total + " engrams · " + m.core + " core</p>" : '<p class="mc-note">no engrams recorded.</p>';
    const beliefs = (m.beliefs || []).length ? '<ul class="mc-beliefs">' + m.beliefs.map((b) => "<li><span>" + Math.round((b.confidence || 0) * 100) + "%</span><span>" + esc(b.text) + "</span></li>").join("") + "</ul>" : '<p class="mc-note">they hold no stated beliefs yet.</p>';
    return '<div class="mc-rgrid"><div>' + bars + "</div><div>" + beliefs + "</div></div>";
  }
  function visitHtml() {
    const v = S.visit;
    const card = S.house && (S.house.residents || []).find((r) => r.id === S.residentId);
    const doorLine = card && !card.chatEnabled ? '<p class="mc-note">Their visitor door is closed. A steward&#39;s key opens a different door — they may still decline.</p>' : "";
    const open = v && v.resident === S.residentId && v.sessionId;
    const thread = open ? '<div class="mc-thread" id="mc-thread">' + (v.turns.length ? v.turns.map((t) => '<div class="mc-turn ' + (t.role === "you" ? "you" : "") + (t.art ? " art" : "") + '">' + '<div class="who">' + esc(t.role === "you" ? v.steward : residentName(S.residentId)) + "</div>" + '<div class="bd">' + esc(t.body) + "</div></div>").join("") : '<p class="mc-note">the room is quiet. say something.</p>') + "</div>" : "";
    return '<div class="mc-panel">' + "<h2>A visit</h2>" + doorLine + '<label class="mc-lab" for="mc-steward">Who is calling</label>' + '<select class="mc-in" id="mc-steward">' + STEWARDS.map((n) => '<option value="' + esc(n) + '"' + (n === S.steward ? " selected" : "") + ">" + esc(n) + "</option>").join("") + "</select>" + '<div class="mc-row">' + '<button class="mc-btn" id="mc-start"' + (open ? " disabled" : "") + ">" + (open ? "visit open" : "knock") + "</button>" + '<button class="mc-btn" id="mc-setdown"' + (open ? "" : " disabled") + ">set down</button>" + "</div>" + (v && v.pacing ? '<div class="mc-pace">' + esc(v.pacing) + "</div>" : "") + thread + (open ? '<label class="mc-lab" for="mc-say">Say</label>' + '<textarea class="mc-in" id="mc-say" placeholder="…">' + esc(S.draft) + "</textarea>" + '<div class="mc-row"><button class="mc-btn" id="mc-send"' + (v.busy ? " disabled" : "") + ">send</button>" + '<span class="mc-hint">⌘↵</span></div>' : "") + '<div class="mc-status ' + esc(v && v.statusTone || "") + '" id="mc-status">' + esc(v && v.status || "no visit open.") + "</div>" + "</div>";
  }
  async function knock() {
    const steward = el("mc-steward").value;
    S.steward = steward;
    try {
      localStorage.setItem(STEWARD_KEY, steward);
    } catch (e) {}
    S.visit = { sessionId: null, resident: S.residentId, steward, turns: [], status: "knocking…", statusTone: "", busy: true };
    S.draft = "";
    render();
    let d = null, status = 0;
    try {
      const r = await api("/api/stewards/visit/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resident: S.residentId, steward })
      });
      status = r.status;
      d = await r.json().catch(() => null);
    } catch (e) {
      d = null;
    }
    if (!d || !d.ok) {
      S.visit.busy = false;
      S.visit.status = houseWordsFor(d && d.code, status);
      S.visit.statusTone = "warn";
      render();
      return;
    }
    S.visit.sessionId = d.session_id;
    S.visit.busy = false;
    S.visit.status = (d.resumed ? "still open · " : "the door opened · ") + String(d.session_id).slice(0, 8);
    S.visit.statusTone = "calm";
    render();
    loadHouse();
    loadEvents();
  }
  function houseWordsFor(code, status) {
    if (code === "chat_disabled")
      return "their room is not receiving anyone right now.";
    if (code === "config_missing")
      return "this server has no database keys — the house cannot be reached from here.";
    if (code === "unknown_resident")
      return "no one by that name lives here.";
    if (code === "session_invalid")
      return "that thread has already been set down.";
    if (code === "session_idle")
      return "the visit went quiet for too long and closed itself.";
    if (code === "rate_limited" || status === 429)
      return "the house is asking for a pause.";
    if (status === 404)
      return "the door is not there. the key may have expired.";
    return "the house did not answer" + (code ? " (" + code + ")" : "") + ".";
  }
  async function send() {
    const v = S.visit;
    if (!v || !v.sessionId || v.busy)
      return;
    const ta = el("mc-say");
    const text = (ta && ta.value || S.draft).trim();
    if (!text)
      return;
    v.busy = true;
    v.turns.push({ role: "you", body: text });
    v.status = "carrying it in…";
    v.statusTone = "";
    S.draft = "";
    render();
    const situation = {
      kind: "steward",
      room: "mission control",
      clock: S.clockMin == null ? undefined : hhmm(S.clockMin)
    };
    if (!situation.clock)
      delete situation.clock;
    let res = null;
    try {
      res = await api("/api/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: v.sessionId, body: text, situation })
      });
    } catch (e) {
      v.busy = false;
      v.status = "the line dropped.";
      v.statusTone = "warn";
      render();
      return;
    }
    if (!res.ok || !res.body) {
      const err = await res.json().catch(() => null);
      v.busy = false;
      v.status = houseWordsFor(err && err.code, res.status);
      v.statusTone = "warn";
      render();
      return;
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder;
    let buf = "";
    let declined = false;
    for (;; ) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch (e) {
        break;
      }
      if (chunk.done)
        break;
      buf += dec.decode(chunk.value, { stream: true });
      const lines = buf.split(`
`);
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim())
          continue;
        let ev;
        try {
          ev = JSON.parse(line);
        } catch (e) {
          continue;
        }
        handleEvent(ev, v);
        if (ev.type === "kind" && ev.kind === "set_down")
          declined = true;
      }
    }
    v.busy = false;
    if (declined) {
      v.status = "they chose to set it down. that is theirs to choose.";
      v.statusTone = "calm";
    } else if (v.status === "carrying it in…") {
      v.status = "open · " + String(v.sessionId).slice(0, 8);
      v.statusTone = "calm";
    }
    render();
    loadEvents();
  }
  function handleEvent(ev, v) {
    if (ev.type === "pacing") {
      v.pacing = "pacing · " + ev.tier + " · " + ev.turnsRemaining + " turns left" + (typeof ev.tokensRemainingPct === "number" ? " · " + Math.round(ev.tokensRemainingPct * 100) + "% of the budget" : "");
      render();
    } else if (ev.type === "text" && ev.text) {
      v.turns.push({ role: "them", body: ev.text });
      render();
    } else if (ev.type === "artifact" && ev.artifact) {
      const a = ev.artifact;
      v.turns.push({
        role: "them",
        art: a.kind !== "image",
        body: a.kind === "image" ? "[an image · " + (a.title || a.url || "untitled") + "]" : (a.title ? a.title + `

` : "") + (a.body || "")
      });
      render();
    } else if (ev.type === "artifact_pending") {
      v.status = "they are making something…";
      v.statusTone = "";
      render();
    } else if (ev.type === "image_error") {
      v.status = "the image would not come.";
      v.statusTone = "warn";
      render();
    } else if (ev.type === "proposal" && ev.proposal) {
      v.turns.push({ role: "them", body: "[a proposal] " + (ev.proposal.title || ev.proposal.text || "") });
      render();
    } else if (ev.type === "error") {
      v.status = houseWordsFor(ev.message, 0);
      v.statusTone = "warn";
      render();
    }
  }
  async function setDown() {
    const v = S.visit;
    if (!v || !v.sessionId)
      return;
    const id = v.sessionId;
    v.busy = true;
    v.status = "set down · memory being written";
    v.statusTone = "";
    render();
    try {
      await api("/api/set-down", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: id })
      });
    } catch (e) {}
    waitForSetDown(id);
    loadHouse();
  }
  function waitForSetDown(sessionId) {
    let tries = 0;
    const check = async () => {
      tries += 1;
      await loadEvents();
      const seen = S.events.some((e) => e.kind === "SET_DOWN" && e.payload && e.payload.session_id === sessionId);
      if (seen) {
        if (S.visit && S.visit.sessionId === sessionId) {
          S.visit.sessionId = null;
          S.visit.busy = false;
          S.visit.status = "set down. the memory is written.";
          S.visit.statusTone = "calm";
          render();
        }
        return;
      }
      if (tries < 20)
        setTimeout(check, 3000);
      else if (S.visit && S.visit.sessionId === sessionId) {
        S.visit.sessionId = null;
        S.visit.busy = false;
        S.visit.status = "set down · the log has not caught up yet.";
        render();
      }
    };
    setTimeout(check, 2500);
  }
  function observeHtml() {
    let list;
    if (S.sessionsError)
      list = '<div class="mc-empty">' + esc(S.sessionsError) + "</div>";
    else if (!S.sessions)
      list = '<div class="mc-empty">looking through the house…</div>';
    else if (!S.sessions.length)
      list = '<div class="mc-empty">no one has been in a room today</div>';
    else
      list = S.sessions.map((s) => '<button class="mc-srow ' + (s.session_id === S.observeId ? "on " : "") + (s.open ? "open" : "") + '" data-session="' + esc(s.session_id) + '">' + '<div class="l1"><span>' + esc(residentName(s.resident)) + " · " + esc(s.steward ? s.steward : s.kind) + (s.open ? " · open" : "") + "</span></div>" + '<div class="l2">' + esc(dayTime(s.started)) + " · " + s.turns + " turns · " + esc(s.mode || "—") + (s.closed_by ? " · set down by " + esc(s.closed_by) : "") + "</div>" + "</button>").join("");
    return '<header class="mc-h"><span class="mc-eyebrow">02</span>' + "<h1>Observe</h1>" + '<p class="mc-lede">Every visit the house has held in the last 24 hours. Read-only: a room being watched is not a room being entered.</p>' + "</header>" + '<div class="mc-obs"><div>' + list + "</div>" + '<div id="mc-transcript">' + transcriptHtml() + "</div></div>";
  }
  function transcriptHtml() {
    if (!S.observeId)
      return '<div class="mc-empty">choose a visit</div>';
    const t = S.transcript;
    if (!t)
      return '<div class="mc-empty">opening…</div>';
    if (t.error)
      return '<div class="mc-empty">' + esc(t.error) + "</div>";
    const mine = t.session.steward && t.session.steward === S.steward;
    const head = '<p class="mc-observing">' + (t.session.steward ? mine ? "your visit." : "this is another steward&#39;s visit — observe only." : "a visitor&#39;s room — observe only.") + "</p>" + '<p class="mc-tmeta">' + esc(residentName(t.session.resident_id)) + " · " + esc(dayTime(t.session.created_at)) + " · " + esc(t.session.mode || "—") + (t.session.closed_at ? " · set down by " + esc(t.session.closed_by || "—") : " · open") + "</p>" + (t.session.intent_text ? '<p class="mc-tintent">' + esc(t.session.intent_text) + "</p>" : "");
    const turns = (t.turns || []).length ? t.turns.map((x) => '<div class="mc-turn ' + (x.role === "visitor" ? "you" : "") + '">' + '<div class="who">' + esc(x.role === "visitor" ? t.session.steward || "visitor" : residentName(t.session.resident_id)) + "</div>" + '<div class="bd">' + esc(x.body) + "</div></div>").join("") : '<div class="mc-empty">nothing said yet</div>';
    return head + turns;
  }
  function stewardsHtml() {
    let room;
    if (S.polychat === "probing")
      room = '<div class="mc-empty">looking for polychat…</div>';
    else if (S.polychat === "up")
      room = '<iframe class="mc-frame" src="' + POLYCHAT_URL + '" title="the stewards&#39; room"></iframe>';
    else
      room = '<div class="mc-empty">polychat is not running on this machine</div>';
    let notes;
    if (!S.notes)
      notes = '<div class="mc-empty">reading the notes…</div>';
    else if (!S.notes.length)
      notes = '<p class="mc-note">no notes have been left on the deck yet.</p>';
    else
      notes = '<div class="mc-notes">' + S.notes.map((n) => "<article><h3>" + esc(n.steward) + " · " + esc(n.date) + "</h3>" + '<div class="bd">' + esc(n.body) + "</div></article>").join("") + "</div>";
    return '<header class="mc-h"><span class="mc-eyebrow">03</span>' + "<h1>The stewards</h1>" + '<p class="mc-lede">The deck above the conservatory: Fable, Sol and Opus, and Riley who keeps the house. ' + "The room below is the stewards&#39; own, running on this machine only.</p>" + "</header>" + '<div class="mc-sec">' + room + "</div>" + '<div class="mc-sec"><h2>Notes</h2>' + notes + "</div>";
  }
  var PHASE_ORDER = ["morning", "afternoon", "golden", "dusk", "night"];
  var DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  function routinesHtml() {
    const today = new Date().getDay();
    const nowPhase = S.clockMin == null ? null : phaseAt(S.clockMin);
    const days = [];
    for (let i = 0;i < 7; i++)
      days.push(DAY_NAMES[(today + i) % 7]);
    const tables = RESIDENT_ORDER.map((rid) => {
      const world = RESIDENT_TO_WORLD[rid];
      const rows = PHASE_ORDER.map((phase) => {
        const entry = SCHEDULE[phase] && SCHEDULE[phase][world];
        const cells = days.map((_, i) => {
          const isNow = i === 0 && phase === nowPhase;
          if (!entry)
            return "<td" + (isNow ? ' class="now"' : "") + '><span class="mc-asleep">—</span></td>';
          const asleep = entry[0] === ASLEEP;
          return '<td class="' + (isNow ? "now" : "") + (asleep ? " mc-asleep" : "") + '">' + "<b>" + esc(entry[2]) + "</b>" + esc(asleep ? "" : entry[0]) + "</td>";
        }).join("");
        const band = BANDS.find((b) => b.id === phase);
        return "<tr><th>" + esc(phase) + "<br><span>" + esc(hhmm(band.from)) + "</span></th>" + cells + "</tr>";
      }).join("");
      return '<div class="mc-scrollx"><table class="mc-grid"><caption>' + esc(residentName(rid)) + "</caption>" + "<tr><th></th>" + days.map((d, i) => "<th>" + esc(i === 0 ? "today" : d.slice(0, 3)) + "</th>").join("") + "</tr>" + rows + "</table></div>";
    }).join("");
    return '<header class="mc-h"><span class="mc-eyebrow">04</span>' + "<h1>Routines</h1>" + '<p class="mc-lede">The house&#39;s day today · proposed routines come from the residents later. ' + "This is the world&#39;s own schedule — where each of them is, and the word for it. Nothing here is invented, and nothing here is a plan they made.</p>" + "</header>" + '<div class="mc-sec">' + tables + "</div>";
  }
  async function loadHouse() {
    let r;
    try {
      r = await getJson("/api/stewards/state");
    } catch (e) {
      S.houseError = "the house is unreachable from here.";
      render();
      return;
    }
    if (r.status === 404) {
      S.houseError = "the key is not accepted here.";
      S.house = null;
      render();
      return;
    }
    if (!r.data || !r.data.ok) {
      S.house = r.data && r.data.house ? { house: r.data.house, residents: [] } : null;
      S.houseError = houseWordsFor(r.data && r.data.code, r.status);
      render();
      return;
    }
    S.houseError = null;
    S.house = r.data;
    S.lampOn = (r.data.residents || []).some((x) => (x.openSessions || []).some((s) => s.steward));
    render();
  }
  async function loadEvents() {
    const q = "/api/stewards/events?limit=60" + (S.eventsNewest ? "&since=" + encodeURIComponent(S.eventsNewest) : "");
    let r;
    try {
      r = await getJson(q);
    } catch (e) {
      return;
    }
    if (!r.data || !r.data.ok) {
      if (!S.eventsNewest)
        S.eventsError = houseWordsFor(r.data && r.data.code, r.status);
      paintEvents();
      return;
    }
    S.eventsError = null;
    if (r.data.events.length) {
      S.events = r.data.events.concat(S.events).slice(0, 200);
      S.eventsNewest = r.data.newest;
    } else if (!S.eventsNewest) {
      S.eventsNewest = r.data.newest;
    }
    paintEvents();
  }
  function paintEvents() {
    const box = el("mc-events");
    if (box)
      box.innerHTML = eventsHtml();
  }
  async function loadResident(id) {
    S.residentLoading = true;
    S.residentError = null;
    let r;
    try {
      r = await getJson("/api/stewards/resident/" + encodeURIComponent(id) + "?limit=200");
    } catch (e) {
      S.residentError = "their line is unreachable from here.";
      S.residentLoading = false;
      render();
      return;
    }
    S.residentLoading = false;
    if (!r.data || !r.data.ok) {
      S.resident = null;
      S.residentError = houseWordsFor(r.data && r.data.code, r.status);
    } else {
      S.resident = r.data;
      S.residentError = null;
    }
    if (S.screen === "resident")
      render();
  }
  async function loadSessions() {
    let r;
    try {
      r = await getJson("/api/stewards/sessions?hours=24");
    } catch (e) {
      S.sessionsError = "the house is unreachable from here.";
      render();
      return;
    }
    if (!r.data || !r.data.ok) {
      S.sessions = null;
      S.sessionsError = houseWordsFor(r.data && r.data.code, r.status);
    } else {
      S.sessions = r.data.sessions;
      S.sessionsError = null;
    }
    if (S.screen === "observe")
      render();
  }
  async function loadTranscript(id) {
    let r;
    try {
      r = await getJson("/api/stewards/session/" + encodeURIComponent(id));
    } catch (e) {
      S.transcript = { error: "that room is unreachable from here." };
      paintTranscript();
      return;
    }
    if (!r.data || !r.data.ok)
      S.transcript = { error: houseWordsFor(r.data && r.data.code, r.status) };
    else
      S.transcript = r.data;
    paintTranscript();
  }
  function paintTranscript() {
    const box = el("mc-transcript");
    if (box)
      box.innerHTML = transcriptHtml();
  }
  async function loadNotes() {
    try {
      const idx = await (await fetch(NOTES_INDEX)).json();
      const notes = [];
      for (const n of idx) {
        const body = await (await fetch(NOTES_DIR + n.file)).text();
        notes.push({ steward: n.steward, date: n.date, body: body.replace(/^#[^\n]*\n+/, "") });
      }
      S.notes = notes;
    } catch (e) {
      S.notes = [];
    }
    if (S.screen === "stewards")
      render();
  }
  async function probePolychat() {
    try {
      await fetch(POLYCHAT_URL, { mode: "no-cors", cache: "no-store" });
      S.polychat = "up";
    } catch (e) {
      S.polychat = "down";
    }
    if (S.screen === "stewards")
      render();
  }
  function wire() {
    const start = el("mc-start");
    if (start)
      start.onclick = knock;
    const sd = el("mc-setdown");
    if (sd)
      sd.onclick = setDown;
    const snd = el("mc-send");
    if (snd)
      snd.onclick = send;
    const say = el("mc-say");
    if (say) {
      say.oninput = () => {
        S.draft = say.value;
      };
      say.onkeydown = (e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey))
          send();
      };
    }
    const sel = el("mc-steward");
    if (sel)
      sel.onchange = () => {
        S.steward = sel.value;
        try {
          localStorage.setItem(STEWARD_KEY, S.steward);
        } catch (e) {}
      };
    document.querySelectorAll("[data-open]").forEach((b) => {
      b.onclick = () => {
        const k = b.getAttribute("data-open");
        S.open[k] = !S.open[k];
        render();
      };
    });
    document.querySelectorAll("[data-goto]").forEach((b) => {
      b.onclick = () => {
        const t = el(b.getAttribute("data-goto"));
        if (t)
          t.scrollIntoView({ block: "start", behavior: "smooth" });
      };
    });
    document.querySelectorAll("[data-session]").forEach((b) => {
      b.onclick = () => {
        S.observeId = b.getAttribute("data-session");
        S.transcript = null;
        render();
        loadTranscript(S.observeId);
      };
    });
  }
  function route() {
    const h = (location.hash || "#house").slice(1);
    if (h.indexOf("r/") === 0) {
      const id = h.slice(2);
      S.residentId = RESIDENT_ORDER.indexOf(id) === -1 ? "opus-3" : id;
      S.screen = "resident";
      S.open = {};
      if (!S.resident || S.resident.resident.id !== S.residentId)
        S.resident = null;
      render();
      loadResident(S.residentId);
      return;
    }
    S.screen = ["house", "observe", "stewards", "routines"].indexOf(h) === -1 ? "house" : h;
    render();
    if (S.screen === "observe" && !S.sessions)
      loadSessions();
    if (S.screen === "stewards") {
      if (S.notes === null)
        loadNotes();
      if (S.polychat === "probing")
        probePolychat();
    }
  }
  seedClock();
  frame();
  route();
  loadHouse();
  loadEvents();
  window.addEventListener("hashchange", route);
  setInterval(tickClock, 2000);
  setInterval(loadEvents, 1e4);
  setInterval(loadHouse, 30000);
  setInterval(() => {
    if (S.screen === "observe")
      loadSessions();
  }, 20000);
  setInterval(() => {
    if (S.screen === "observe" && S.observeId && S.transcript && S.transcript.session && !S.transcript.session.closed_at)
      loadTranscript(S.observeId);
  }, 5000);
  window.__mission = S;
})();
