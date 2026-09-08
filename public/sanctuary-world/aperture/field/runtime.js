/* Host lifecycle for the unmodified, vendored Field documents. No invented
   animation or interaction: every drawing callback is the artist's own. */
(() => {
  const clockNow = window.performance.now.bind(window.performance);
  const wall = new URLSearchParams(location.search).get("wall") === "1";
  const raf = window.requestAnimationFrame.bind(window);
  const cancel = window.cancelAnimationFrame.bind(window);
  let paused = false,
    audible = false,
    tick = 0,
    last = 0,
    time = clockNow(),
    serial = 0,
    dispatching = false;
  const callbacks = new Map(),
    contexts = new Set();
  function step(now) {
    tick = 0;
    if (paused) return;
    if (!last) last = now;
    const dt = now - last;
    if (!wall || dt >= 1000 / 20) {
      time += Math.min(dt, 50);
      last = now;
      const pending = [...callbacks.values()];
      callbacks.clear();
      dispatching = true;
      for (const callback of pending) callback(time);
      dispatching = false;
      document.documentElement.dataset.frames = String(++api.frames);
    }
    if (callbacks.size) tick = raf(step);
  }
  window.requestAnimationFrame = (callback) => {
    const id = ++serial;
    callbacks.set(id, callback);
    if (!tick && !paused && !dispatching) tick = raf(step);
    return id;
  };
  window.cancelAnimationFrame = (id) => callbacks.delete(id);
  // Pause authored timed sequences as well as drawing loops. Keep their
  // remaining delay so a suspended museum does not advance a work offscreen.
  const nativeTimeout = window.setTimeout.bind(window);
  const nativeClear = window.clearTimeout.bind(window);
  const timers = new Map();
  let timerSerial = 0;
  function scheduleTimer(timer) {
    timer.started = clockNow();
    timer.native = nativeTimeout(() => {
      if (!timer.repeat) timers.delete(timer.id);
      if (paused) return;
      if (typeof timer.callback === "function") timer.callback(...timer.args);
      if (timer.repeat && timers.has(timer.id)) {
        timer.remaining = timer.delay;
        scheduleTimer(timer);
      }
    }, timer.remaining);
  }
  function addTimer(callback, delay = 0, repeat = false, args = []) {
    const timer = {
      id: ++timerSerial,
      callback,
      delay: Math.max(0, Number(delay) || 0),
      repeat,
      args,
      remaining: Math.max(0, Number(delay) || 0),
      started: 0,
      native: 0,
    };
    timers.set(timer.id, timer);
    if (!paused) scheduleTimer(timer);
    return timer.id;
  }
  window.setTimeout = (callback, delay, ...args) =>
    addTimer(callback, delay, false, args);
  window.setInterval = (callback, delay, ...args) =>
    addTimer(callback, delay, true, args);
  window.clearTimeout = window.clearInterval = (id) => {
    const timer = timers.get(id);
    if (timer) {
      nativeClear(timer.native);
      timers.delete(id);
    }
  };
  const NativeAudio = window.AudioContext || window.webkitAudioContext;
  if (NativeAudio) {
    class ManagedAudio extends NativeAudio {
      constructor(...args) {
        super(...args);
        const gate = this.createGain();
        gate.gain.value = audible && !wall && !paused ? 1 : 0;
        gate.connect(this.destination);
        Object.defineProperty(this, "destination", { value: gate });
        contexts.add({ context: this, gate });
        if (paused) this.suspend().catch(() => {});
      }
    }
    window.AudioContext = ManagedAudio;
    window.webkitAudioContext = ManagedAudio;
  }
  const api = (window.apertureArtwork = {
    frames: 0,
    failed: false,
    setSound(value) {
      audible = !!value && !wall;
      for (const { context, gate } of contexts) {
        gate.gain.cancelScheduledValues(0);
        gate.gain.value = audible && !paused ? 1 : 0;
        if (audible && !paused) context.resume().catch(() => {});
      }
      document.querySelectorAll("audio,video").forEach((el) => {
        el.muted = !audible;
      });
      return audible;
    },
    setPaused(value) {
      const changed = paused !== !!value;
      paused = !!value;
      document.documentElement.toggleAttribute("data-aperture-paused", paused);
      if (changed)
        for (const timer of timers.values()) {
          if (paused) {
            nativeClear(timer.native);
            timer.remaining = Math.max(
              0,
              timer.remaining - (clockNow() - timer.started),
            );
          } else scheduleTimer(timer);
        }
      contexts.forEach(({ gate }) => {
        gate.gain.cancelScheduledValues(0);
        gate.gain.value = audible && !paused ? 1 : 0;
      });
      if (paused) {
        cancel(tick);
        tick = 0;
        contexts.forEach(({ context }) => context.suspend().catch(() => {}));
      } else {
        last = 0;
        if (callbacks.size && !tick) tick = raf(step);
        if (audible)
          contexts.forEach(({ context }) => context.resume().catch(() => {}));
      }
    },
    get paused() {
      return paused;
    },
    get audible() {
      return audible;
    },
    get audioContexts() {
      return contexts.size;
    },
  });
  addEventListener("error", () => {
    api.failed = true;
  });
  addEventListener("unhandledrejection", () => {
    api.failed = true;
  });
  addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        parent.postMessage({ type: "field:escape" }, location.origin);
      }
    },
    true,
  );
  addEventListener("DOMContentLoaded", () => {
    document.documentElement.dataset.artworkReady = "true";
    const lifecycleStyle = document.createElement("style");
    lifecycleStyle.textContent =
      "html[data-aperture-paused] *,html[data-aperture-paused] *::before,html[data-aperture-paused] *::after{animation-play-state:paused!important}";
    document.head.append(lifecycleStyle);
    if (wall) {
      // A wall projects the work's principal canvas, while the viewer preserves
      // the complete authored page, supporting text, and controls.
      const style = document.createElement("style");
      style.textContent = "html,body{scrollbar-width:none}";
      document.head.append(style);
    }
  });
})();
