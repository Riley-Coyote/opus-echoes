/* ════════════════════════════════════════════════════════════════════════
   Mnemos Orb — the presence
   ────────────────────────────────────────────────────────────────────────
   A cross-hatch engraving sphere whose light reads like a gaze: it follows
   the cursor anywhere on the page, so the orb feels like it is looking back
   at you. Rendered in the Mnemos ink cascade (deep grey → warm cream — the
   design-system shades, made into a tonal gradient).

   One engine, many homes. A large hero on the landing today; a small glyph
   in a corner elsewhere later. It is built to travel with the visitor.

   Declarative usage (auto-mounts on load):
       <canvas data-mnemos-orb data-orb-scale="0.40"></canvas>

   Programmatic:
       const orb = MnemosOrb.mount(canvasEl, { scale: 0.40 });
       orb.stop();  orb.start();

   data- attributes (all optional):
       data-orb-scale     sphere radius as a fraction of min(w,h)   [0.40]
       data-orb-spacing   engraving grid pitch in px                [6]
       data-orb-idle      "off" to disable the idle sway            [on]
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
  var BANDS = 10;
  var AMBIENT = 0.22; // shading floor — keeps the WHOLE sphere legible (deep grey, not black)

  function lerp(a, b, t) {
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  }
  // band → rgb across the cascade, precomputed once
  var BAND_RGB = (function () {
    var out = [];
    for (var b = 0; b < BANDS; b++) {
      var L = (b / (BANDS - 1)) * (STOPS.length - 1);
      var i = Math.min(STOPS.length - 2, Math.floor(L));
      var c = lerp(STOPS[i], STOPS[i + 1], L - i);
      out.push("rgb(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + ")");
    }
    return out;
  })();

  /* sphere shading with an ambient floor. diff = lambert term; spec = a tight
     glint. The moving light only brightens — the shape never disappears. */
  function shadeAt(u, v, light) {
    var r2 = u * u + v * v;
    if (r2 > 1) return -1; // outside the disc
    var z = Math.sqrt(1 - r2);
    var diff = u * light[0] + v * light[1] + z * light[2];
    if (diff < 0) diff = 0;
    // rounder falloff (mix of lambert + lambert²) reads as real volume;
    // a broad bright glint becomes the tracking "gaze".
    var body = diff * 0.34 + diff * diff * 0.46;
    var spec = Math.pow(diff, 16) * 0.5;
    // a faint Fresnel rim traces the silhouette so the WHOLE shape always
    // reads, even on the shadow side — light wrapping the limb.
    var edge = 1 - z;
    var rim = edge * edge * edge * 0.13;
    var s = AMBIENT + body + spec + rim;
    return s < 0 ? 0 : s; // may exceed 1 at the glint; clamped at band time
  }

  /* engraving layers — successive cross-hatch passes that switch on in the
     brighter regions, the way an engraver builds tone with more lines. */
  var LAYERS = [
    { angle: 30, thresh: 0.04, width: 0.9, len: 5 }, // covers the whole sphere
    { angle: -30, thresh: 0.46, width: 0.9, len: 5 },
    { angle: 80, thresh: 0.64, width: 0.8, len: 4 },
    { angle: -5, thresh: 0.82, width: 0.7, len: 3 },
  ].map(function (l) {
    l.cs = Math.cos((l.angle * Math.PI) / 180);
    l.sn = Math.sin((l.angle * Math.PI) / 180);
    return l;
  });

  function Orb(canvas, opts) {
    opts = opts || {};
    var ctx = canvas.getContext("2d");
    if (!ctx) return { start: function () {}, stop: function () {} };

    var reduce =
      global.matchMedia && global.matchMedia("(prefers-reduced-motion:reduce)").matches;

    var scale = parseFloat(canvas.getAttribute("data-orb-scale")) || opts.scale || 0.4;
    var spacing = parseFloat(canvas.getAttribute("data-orb-spacing")) || opts.spacing || 6;
    var idleOn = canvas.getAttribute("data-orb-idle") !== "off" && opts.idle !== false;

    var W = 0,
      H = 0,
      cx = 0,
      cy = 0,
      R = 0,
      DPR = 1;

    // light: normalized offset from sphere centre, eased toward a target
    var lx = -0.42,
      ly = -0.4, // current
      tx = -0.42,
      ty = -0.4; // target
    var lastInteract = -1e9;
    var t0 = (global.performance && performance.now()) || Date.now();

    var raf = 0,
      running = false,
      visible = true;

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
      return true;
    }

    function pointTo(clientX, clientY) {
      var r = canvas.getBoundingClientRect();
      var ox = r.left + r.width / 2,
        oy = r.top + r.height / 2;
      var nx = (clientX - ox) / (r.width * 0.5);
      var ny = (clientY - oy) / (r.height * 0.5);
      var m = Math.hypot(nx, ny);
      if (m > 1.7) {
        nx = (nx / m) * 1.7;
        ny = (ny / m) * 1.7;
      }
      tx = nx;
      ty = ny;
      lastInteract = (global.performance && performance.now()) || Date.now();
    }

    function onMouse(e) {
      pointTo(e.clientX, e.clientY);
    }
    function onTouch(e) {
      if (e.touches && e.touches.length) pointTo(e.touches[0].clientX, e.touches[0].clientY);
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      var lz = 0.6;
      var mag = Math.hypot(lx, ly, lz) || 1;
      var light = [lx / mag, ly / mag, lz / mag];

      ctx.lineCap = "round";
      var lim = Math.ceil((R * 1.18) / spacing); // scan only the disc region
      var inv = 1 / (1 - AMBIENT);

      for (var li = 0; li < LAYERS.length; li++) {
        var layer = LAYERS[li],
          cs = layer.cs,
          sn = layer.sn,
          half = layer.len;
        var buckets = [];
        for (var b = 0; b < BANDS; b++) buckets.push(new Path2D());

        for (var j = -lim; j <= lim; j++) {
          for (var i = -lim; i <= lim; i++) {
            var gx = i * spacing,
              gy = j * spacing;
            var px = cx + gx * cs - gy * sn,
              py = cy + gx * sn + gy * cs;
            var u = (px - cx) / R,
              v = (py - cy) / R;
            var s = shadeAt(u, v, light);
            if (s < 0 || s < layer.thresh) continue;
            // full-cascade band: terminator → deepest grey, glint → cream
            var tn = (s - AMBIENT) * inv;
            if (tn < 0) tn = 0;
            else if (tn > 1) tn = 1;
            var bi = (tn * (BANDS - 1) + 0.5) | 0;
            // stroke length grows with local brightness (engraver's swell)
            var intensity = (s - layer.thresh) / (1 - layer.thresh);
            var len = half * (0.4 + intensity * 0.9);
            var hx = (cs * len) / 2,
              hy = (sn * len) / 2;
            var p = buckets[bi];
            p.moveTo(px - hx, py - hy);
            p.lineTo(px + hx, py + hy);
          }
        }
        ctx.lineWidth = layer.width;
        for (var bb = 0; bb < BANDS; bb++) {
          ctx.strokeStyle = BAND_RGB[bb];
          ctx.stroke(buckets[bb]);
        }
      }
    }

    function loop() {
      if (!running) return;
      var now = (global.performance && performance.now()) || Date.now();
      // idle: if the pointer has been still a while, the gaze drifts slowly
      var ax = tx,
        ay = ty;
      if (idleOn && now - lastInteract > 2400) {
        var e = (now - t0) / 1000;
        var idx = Math.sin(e * 0.34) * 0.6 + Math.sin(e * 0.13) * 0.18;
        var idy = Math.cos(e * 0.27) * 0.42 - 0.15;
        // ease from wherever the pointer left it toward the idle path
        var k = Math.min(1, (now - lastInteract - 2400) / 2600);
        ax = tx + (idx - tx) * k;
        ay = ty + (idy - ty) * k;
      }
      lx += (ax - lx) * 0.06;
      ly += (ay - ly) * 0.06;
      draw();
      raf = requestAnimationFrame(loop);
    }

    function start() {
      if (running || !visible) return;
      if (!fit()) {
        requestAnimationFrame(start);
        return;
      }
      if (reduce) {
        lx = tx = -0.42;
        ly = ty = -0.4;
        draw();
        return;
      }
      running = true;
      raf = requestAnimationFrame(loop);
    }
    function stop() {
      running = false;
      cancelAnimationFrame(raf);
    }

    /* wiring */
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
        fit();
        if (reduce) draw();
        else if (was || visible) start();
      }, 160);
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

    // honour fonts/layout settling
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(start);
    start();

    return { start: start, stop: stop, canvas: canvas };
  }

  var MnemosOrb = {
    mount: function (canvas, opts) {
      return new Orb(canvas, opts);
    },
    auto: function () {
      var els = document.querySelectorAll("[data-mnemos-orb]");
      for (var i = 0; i < els.length; i++) {
        if (!els[i].__mnemosOrb) els[i].__mnemosOrb = new Orb(els[i]);
      }
    },
  };
  global.MnemosOrb = MnemosOrb;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", MnemosOrb.auto);
  else MnemosOrb.auto();
})(window);
