/* ════════════════════════════════════════════════════════════════════════
   Mnemos ASCII Eye — the presence, from letters
   ────────────────────────────────────────────────────────────────────────
   A shaded sphere rendered entirely in monospace glyphs (letters as pixels),
   ink-cascade colored (deep grey shadow → warm cream at the gaze). On mount it
   CONSOLIDATES: a haze of memory-dust characters resolves, center-out, into a
   watching presence. Then it tracks the cursor like a gaze, with an idle sway
   when the pointer is still. Transparent canvas — anything behind it shows
   through the dark side and the gaps between glyphs.

   Declarative (auto-mounts on load):
       <canvas data-mnemos-eye data-eye-scale="0.40"></canvas>

   data- attributes (optional):
       data-eye-scale   sphere radius as a fraction of min(w,h)   [0.40]
       data-eye-font    glyph size in px (cell size derives)       [auto]
       data-eye-idle    "off" to disable the idle sway             [on]
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";

  /* ink cascade — deep cool grey → warm cream (Mnemos design-system shades) */
  var STOPS = [
    [132, 130, 126],
    [161, 159, 155],
    [194, 192, 188],
    [210, 208, 204],
    [244, 243, 240],
  ];
  var BANDS = 12;
  function lerp(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  var BAND_RGB = (function () {
    var o = [];
    for (var b = 0; b < BANDS; b++) {
      var L = (b / (BANDS - 1)) * (STOPS.length - 1);
      var i = Math.min(STOPS.length - 2, Math.floor(L));
      var c = lerp(STOPS[i], STOPS[i + 1], L - i);
      o.push([c[0] | 0, c[1] | 0, c[2] | 0]);
    }
    return o;
  })();

  /* the density ramp: letters as pixels, dark → bright */
  var INK = "·.,:;-~=+ixcoaem%#@".split("");
  var NOISE = "·.,:;-~=+ixcoaem%#@/\\|()<>{}".split("");
  function nrand() {
    return NOISE[(Math.random() * NOISE.length) | 0];
  }

  var AMBIENT = 0.17;
  function shade(u, v, light) {
    var r2 = u * u + v * v;
    if (r2 > 1) return -1;
    var z = Math.sqrt(1 - r2);
    var d = u * light[0] + v * light[1] + z * light[2];
    if (d < 0) d = 0;
    var body = d * 0.36 + d * d * 0.54;
    var spec = Math.pow(d, 13) * 0.64;
    var e = 1 - z,
      rim = e * e * e * 0.13;
    var s = AMBIENT + body + spec + rim;
    return s < 0 ? 0 : s;
  }

  /* manifest timing */
  var REVEAL_SPAN = 1400; // center → rim spread
  var JITTER = 520;
  var FLICKER = 420; // per-cell decode duration

  function Eye(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext("2d");
    if (!ctx) return { start: function () {}, stop: function () {} };

    var reduce =
      global.matchMedia && global.matchMedia("(prefers-reduced-motion:reduce)").matches;
    var scale = parseFloat(canvas.getAttribute("data-eye-scale")) || opts.scale || 0.4;
    var fontAttr = parseFloat(canvas.getAttribute("data-eye-font")) || opts.font || 0;
    var idleOn = canvas.getAttribute("data-eye-idle") !== "off" && opts.idle !== false;

    var W = 0,
      H = 0,
      DPR = 1,
      cx = 0,
      cy = 0,
      R = 0,
      FONT = 14,
      cellW = 9,
      cellH = 15;
    var cells = [];
    var lx = -0.42,
      ly = -0.4,
      tx = -0.42,
      ty = -0.4,
      lastMove = -1e9;
    var t0 = now();
    var raf = 0,
      running = false,
      visible = true;

    function now() {
      return (global.performance && performance.now()) || Date.now();
    }

    function fit() {
      var r = canvas.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      DPR = Math.min(global.devicePixelRatio || 1, 2);
      W = r.width;
      H = r.height;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      cx = W / 2;
      cy = H / 2;
      R = Math.min(W, H) * scale;
      FONT = fontAttr || Math.max(11, Math.min(18, Math.round(Math.min(W, H) / 30)));
      ctx.font = FONT + "px 'JetBrains Mono','SF Mono',ui-monospace,monospace";
      cellW = ctx.measureText("M").width || FONT * 0.6;
      cellH = Math.round(FONT * 1.06);
      buildCells();
      return true;
    }

    function buildCells() {
      cells = [];
      var lim = Math.ceil((R * 1.04) / Math.min(cellW, cellH)) + 2;
      var maxr = R || 1;
      for (var row = -lim; row <= lim; row++) {
        for (var col = -lim; col <= lim; col++) {
          var px = cx + col * cellW,
            py = cy + row * cellH;
          var u = (px - cx) / R,
            v = (py - cy) / R;
          if (u * u + v * v > 1.02) continue;
          var rad = Math.hypot(px - cx, py - cy);
          cells.push({ px: px, py: py, u: u, v: v, rad: rad, delay: 0 });
        }
      }
      for (var i = 0; i < cells.length; i++) {
        cells[i].delay = (cells[i].rad / maxr) * REVEAL_SPAN + Math.random() * JITTER;
      }
      t0 = now();
    }

    function onMouse(e) {
      var r = canvas.getBoundingClientRect();
      var ox = r.left + r.width / 2,
        oy = r.top + r.height / 2;
      var nx = (e.clientX - ox) / (r.width * 0.5),
        ny = (e.clientY - oy) / (r.height * 0.5);
      var m = Math.hypot(nx, ny);
      if (m > 1.7) {
        nx = (nx / m) * 1.7;
        ny = (ny / m) * 1.7;
      }
      tx = nx;
      ty = ny;
      lastMove = now();
    }
    function onTouch(e) {
      if (e.touches && e.touches.length)
        onMouse({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY });
    }

    function render(formed) {
      var n = now();
      var ax = tx,
        ay = ty;
      if (idleOn && n - lastMove > 2400) {
        var e = n / 1000;
        ax = Math.sin(e * 0.34) * 0.6 + Math.sin(e * 0.13) * 0.18;
        ay = Math.cos(e * 0.27) * 0.42 - 0.15;
      }
      lx += (ax - lx) * 0.06;
      ly += (ay - ly) * 0.06;
      var lz = 0.6,
        mag = Math.hypot(lx, ly, lz) || 1,
        light = [lx / mag, ly / mag, lz / mag];
      var inv = 1 / (1 - AMBIENT);

      ctx.clearRect(0, 0, W, H);
      ctx.font = FONT + "px 'JetBrains Mono','SF Mono',ui-monospace,monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      for (var i = 0; i < cells.length; i++) {
        var c = cells[i];
        var s = shade(c.u, c.v, light);
        if (s < 0) continue;
        var tn = (s - AMBIENT) * inv;
        if (tn < 0) tn = 0;
        else if (tn > 1) tn = 1;
        var bi = Math.min(BANDS - 1, (tn * (BANDS - 1) + 0.5) | 0);
        var gi = Math.min(INK.length - 1, (tn * (INK.length - 1) + 0.5) | 0);
        var col = BAND_RGB[bi];
        var glyph, alpha;
        if (formed) {
          glyph = INK[gi];
          alpha = 1;
        } else {
          var p = (n - t0 - c.delay) / FLICKER;
          if (p <= 0) {
            if (Math.random() < 0.5) continue;
            glyph = nrand();
            alpha = 0.05 + Math.random() * 0.05;
          } else if (p < 1) {
            glyph = Math.random() < 0.6 ? nrand() : INK[gi];
            alpha = 0.1 + p * 0.9;
          } else {
            glyph = INK[gi];
            alpha = 1;
          }
        }
        ctx.fillStyle = "rgba(" + col[0] + "," + col[1] + "," + col[2] + "," + alpha.toFixed(3) + ")";
        ctx.fillText(glyph, c.px, c.py);
      }
    }

    var manifestDone = false;

    function loop() {
      if (!running) return;
      render(false);
      if (now() - t0 > REVEAL_SPAN + JITTER + FLICKER + 80) {
        manifestDone = true;
        raf = requestAnimationFrame(steadyLoop);
        return;
      }
      raf = requestAnimationFrame(loop);
    }
    function steadyLoop() {
      if (!running) return;
      render(true);
      raf = requestAnimationFrame(steadyLoop);
    }
    function begin() {
      raf = requestAnimationFrame(manifestDone ? steadyLoop : loop);
    }
    function start() {
      if (running || !visible) return;
      if (!fit()) {
        requestAnimationFrame(start);
        return;
      }
      running = true;
      if (reduce) {
        lx = tx = -0.42;
        ly = ty = -0.4;
        render(true);
        running = false;
        return;
      }
      begin();
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }
    function remanifest() {
      if (reduce) return;
      stop();
      manifestDone = false;
      buildCells();
      start();
    }

    if (!reduce) {
      global.addEventListener("mousemove", onMouse, { passive: true });
      global.addEventListener("touchmove", onTouch, { passive: true });
    }
    var rt;
    global.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(function () {
        var was = running;
        stop();
        if (!fit()) return; // fit() rebuilds the grid
        manifestDone = true; // don't replay the manifest on resize
        if (reduce) {
          render(true);
          return;
        }
        if (was || visible) {
          running = true;
          begin();
        }
      }, 180);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else start();
    });
    if ("IntersectionObserver" in global) {
      var io = new IntersectionObserver(
        function (es) {
          for (var k = 0; k < es.length; k++) {
            visible = es[k].isIntersecting;
            if (visible) start();
            else stop();
          }
        },
        { threshold: 0.01 },
      );
      io.observe(canvas);
    }

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
    start();

    return { start: start, stop: stop, remanifest: remanifest, canvas: canvas };
  }

  var MnemosEye = {
    mount: function (canvas, opts) {
      return new Eye(canvas, opts);
    },
    auto: function () {
      var els = document.querySelectorAll("[data-mnemos-eye]");
      for (var i = 0; i < els.length; i++) {
        if (!els[i].__mnemosEye) els[i].__mnemosEye = new Eye(els[i]);
      }
    },
  };
  global.MnemosEye = MnemosEye;
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", MnemosEye.auto);
  else MnemosEye.auto();
})(window);
