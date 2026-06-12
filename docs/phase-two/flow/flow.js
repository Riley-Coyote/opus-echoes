/* flow.js — the trace adjacency · flow prototype
   three small jobs, no frameworks:
   1. the sheet — bone / graphite, resolved early (no flash), persisted
   2. the flow ribbon — fol. N of 11, prev/next along the canonical path
   3. first approach — the pen draws, the ink settles (reduced motion: complete) */
(function () {
  var DOC = document.documentElement;
  var KEY = "flow.sheet";
  var MODES = ["bone", "graphite"];

  /* ---- 1 · resolve the sheet before paint ------------------- */
  function resolveSheet() {
    try {
      var q = new URLSearchParams(location.search).get("sheet");
      if (MODES.indexOf(q) !== -1) return q; /* query selects, never persists */
      var s = localStorage.getItem(KEY);
      if (MODES.indexOf(s) !== -1) return s;
    } catch (e) {}
    return (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches)
      ? "graphite" : "bone";
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

  /* ---- the canonical path ------------------------------------ */
  var FOLIOS = [
    ["index.html", "the front door"],
    ["map.html", "the key plan"],
    ["sanctuary.html", "the sanctuary"],
    ["record.html", "the record"],
    ["reader-journal.html", "reader — journal"],
    ["reader-ascii.html", "reader — ascii"],
    ["gathering.html", "the gathering"],
    ["visits.html", "visits — the chooser"],
    ["visit-room.html", "the visit room"],
    ["shop.html", "the shop"],
    ["architecture.html", "the architecture"]
  ];
  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  document.addEventListener("DOMContentLoaded", function () {
    applySheet(DOC.getAttribute("data-sheet")); /* sync toggle now DOM exists */

    /* ---- the toggle ----------------------------------------- */
    var toggles = document.querySelectorAll(".sheet-toggle");
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].addEventListener("click", function () {
        var next = DOC.getAttribute("data-sheet") === "bone" ? "graphite" : "bone";
        try { localStorage.setItem(KEY, next); } catch (e) {}
        applySheet(next);
      });
    }

    /* ---- 2 · the flow ribbon -------------------------------- */
    var fol = document.body.getAttribute("data-fol");
    var idx = -1;
    for (var f = 0; f < FOLIOS.length; f++) if (FOLIOS[f][0] === fol) { idx = f; break; }
    if (idx !== -1) {
      var rb = document.createElement("nav");
      rb.className = "ribbon";
      rb.setAttribute("aria-label", "flow mockup path");
      var prev = idx > 0 ? FOLIOS[idx - 1] : null;
      var next = idx < FOLIOS.length - 1 ? FOLIOS[idx + 1] : null;
      var h = "";
      h += '<span class="rb-slot prev">' + (prev
        ? '<a href="' + prev[0] + '">&larr;<span class="rb-name">&nbsp; ' + prev[1] + "</span></a>"
        : "") + "</span>";
      h += '<span class="rb-mid">flow mockup &middot; fol. ' + pad(idx + 1) + " of " +
        pad(FOLIOS.length) + " &mdash; " + FOLIOS[idx][1] + "</span>";
      h += '<span class="rb-slot next">' + (next
        ? '<a href="' + next[0] + '"><span class="rb-name">' + next[1] + " &nbsp;</span>&rarr;</a>"
        : "") + "</span>";
      rb.innerHTML = h;
      document.body.appendChild(rb);
    }

    /* ---- 3 · the pen draws, once ----------------------------- */
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
  });
})();
