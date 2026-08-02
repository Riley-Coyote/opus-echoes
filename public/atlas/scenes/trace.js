/* trace.js — the trace adjacency · the front door (v2 preview)
   graphite by default (riley's call); bone available as a toggle.
   three small jobs, no frameworks:
   1. the sheet — resolved before paint (no flash), persisted
   2. first approach — the pen draws, the ink settles (reduced motion: complete)
   3. the live line — lit from /api/sanctuary/state, or absent. never faked. */
(function () {
  var DOC = document.documentElement;
  var KEY = "trace.sheet";
  var MODES = ["bone", "graphite"];

  /* ---- 1 · resolve the sheet before paint ------------------- */
  function resolveSheet() {
    try {
      var q = new URLSearchParams(location.search).get("sheet");
      if (MODES.indexOf(q) !== -1) return q;     /* ?sheet= selects, never persists */
      var s = localStorage.getItem(KEY);
      if (MODES.indexOf(s) !== -1) return s;      /* a remembered choice */
    } catch (e) {}
    return "graphite";                            /* default — the held register */
  }
  function applySheet(mode) {
    DOC.setAttribute("data-sheet", mode);
    var opts = document.querySelectorAll(".sheet-toggle .opt");
    for (var i = 0; i < opts.length; i++) {
      opts[i].classList.toggle("on", opts[i].getAttribute("data-opt") === mode);
    }
  }
  applySheet(resolveSheet());

  var REDUCED = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!REDUCED) DOC.classList.add("will-ink");

  document.addEventListener("DOMContentLoaded", function () {
    applySheet(DOC.getAttribute("data-sheet")); /* sync the toggle now the DOM exists */

    /* ---- the toggle ----------------------------------------- */
    var toggles = document.querySelectorAll(".sheet-toggle");
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener("click", function () {
        var next = DOC.getAttribute("data-sheet") === "bone" ? "graphite" : "bone";
        try { localStorage.setItem(KEY, next); } catch (e) {}
        applySheet(next);
      });
    }

    /* ---- 2 · the pen draws, once ----------------------------- */
    if (!REDUCED) {
      var pens = document.querySelectorAll("svg .pen");
      for (var p = 0; p < pens.length; p++) {
        (function (el, order) {
          try {
            var L = el.getTotalLength();
            if (!L) return;
            el.style.strokeDasharray = L + " " + L;
            el.style.strokeDashoffset = L;
            el.getBoundingClientRect();
            el.style.transition = "stroke-dashoffset 700ms linear " + (order * 70) + "ms";
            requestAnimationFrame(function () {
              requestAnimationFrame(function () { el.style.strokeDashoffset = "0"; });
            });
          } catch (e) {}
        })(pens[p], p);
      }
      /* the ink settles */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { DOC.classList.add("arrived"); });
      });
    }

    /* ---- 3 · the live line — real or absent, never faked -------
       /api/sanctuary/state ships in phase 2; until then this stays dark. */
    var live = document.querySelector("[data-liveline]");
    if (live) {
      fetch("/api/sanctuary/state", { headers: { accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (d && typeof d.line === "string" && d.line.trim()) {
            var txt = live.querySelector(".txt");
            if (txt) txt.textContent = d.line;
            live.hidden = false;
          }
        })
        .catch(function () { /* stays absent — honest */ });
    }
  });
})();
