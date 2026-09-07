import { describe, expect, test } from 'bun:test';

// Import the real public factories. Only the browser boundary is stubbed; no
// function source is extracted, and Three's actual texture versions are used.
const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
Object.defineProperty(globalThis, 'window', {
  configurable: true, writable: true,
  value: { matchMedia: () => ({ matches: false }) },
});
const { makeTerminal, makePresence } = await import('../public/sanctuary-world/lab/door-common.js');
if (oldWindow) Object.defineProperty(globalThis, 'window', oldWindow);
else delete globalThis.window;

function environment() {
  let now = 1000, timerId = 0;
  const timers = new Map(), listeners = new Map(), replies = [], requests = [];
  const storage = new Map();
  const drawingContext = () => ({
    fillRect() {}, fillText() {},
    measureText: (text) => ({ width: String(text).length * 8 }),
    createRadialGradient: () => ({ addColorStop() {} }),
  });
  const document = {
    hidden: false,
    createElement(tag) {
      if (tag !== 'canvas') throw new Error(`Unexpected DOM element: ${tag}`);
      const context = drawingContext();
      return { width: 0, height: 0, getContext: () => context };
    },
    addEventListener(name, fn) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(fn);
    },
    removeEventListener(name, fn) {
      listeners.get(name)?.delete(fn);
      if (!listeners.get(name)?.size) listeners.delete(name);
    },
  };
  const overrides = {
    document,
    localStorage: { getItem: (key) => storage.get(key) ?? null },
    setTimeout: (fn, delay) => {
      const id = ++timerId;
      timers.set(id, { fn, at: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: async (url, options) => {
      requests.push({ url, signal: options.signal });
      if (!replies.length) throw new Error('Unexpected presence request');
      const reply = replies.shift();
      if (reply instanceof Error) throw reply;
      return typeof reply === 'function' ? reply(options) : reply;
    },
  };
  const descriptors = new Map(Object.keys(overrides).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(overrides))
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  const realNow = Date.now;
  Date.now = () => now;
  return {
    requests, replies, storage, timers, listeners,
    response(status, data) {
      replies.push({ ok: status >= 200 && status < 300, status, json: async () => data });
    },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      now = end;
    },
    hidden(value) {
      document.hidden = value;
      for (const fn of listeners.get('visibilitychange') ?? []) fn();
    },
    nextDelay: () => Math.min(...[...timers.values()].map((t) => t.at - now)),
    restore() {
      timers.clear();
      Date.now = realNow;
      for (const [key, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

describe('station terminal paint preservation', () => {
  test('opt-in steady screens avoid redundant uploads; default and explicit redraw remain available', () => {
    const env = environment();
    const terminals = [];
    try {
      const original = makeTerminal({}), optimized = makeTerminal({ paintOnChange: true });
      terminals.push(original, optimized);
      const initial = terminals.map((terminal) => terminal.texture.version);
      for (let frame = 1; frame <= 180; frame++) {
        original.tick(1 / 60, frame / 60);
        optimized.tick(1 / 60, frame / 60);
      }
      expect(original.texture.version - initial[0]).toBe(180);
      expect(optimized.texture.version - initial[1]).toBeLessThanOrEqual(6);
      expect(optimized.texture.version - initial[1]).toBeGreaterThan(0);
      expect(optimized.boot.blink).toBe(original.boot.blink);
      const before = optimized.texture.version;
      optimized.draw();
      expect(optimized.texture.version).toBe(before + 1);
    } finally {
      terminals.forEach((terminal) => terminal.texture.dispose());
      env.restore();
    }
  });

  test('paint-on-change preserves the complete archive and boot lifecycle', () => {
    const env = environment();
    const terminals = [];
    try {
      const options = { body: 'A brief door card for this test.', tail: '> come in' };
      const original = makeTerminal(options), optimized = makeTerminal({ ...options, paintOnChange: true });
      terminals.push(original, optimized);
      const line = { name: 'Test fixture', date: '2026-09-05', text: 'An archive line held on the glass.' };
      expect(original.haunt(line)).toBe(true);
      expect(optimized.haunt(line)).toBe(true);
      for (let frame = 1; frame <= 1200; frame++) {
        if (frame === 1000) terminals.forEach((terminal) => terminal.begin(false));
        env.advance(1000 / 60);
        terminals.forEach((terminal) => terminal.tick(1 / 60, frame / 60));
        expect(optimized.haunted()).toEqual(original.haunted());
        expect(optimized.text()).toBe(original.text());
        expect(optimized.boot).toEqual(original.boot);
      }
      expect(optimized.haunted()).toBe(null);
      expect(optimized.boot.done).toBe(true);
      expect(optimized.text()).toBe(`${options.body} ${options.tail}`);
      expect(optimized.haunt(line)).toBe(false);
    } finally {
      terminals.forEach((terminal) => terminal.texture.dispose());
      env.restore();
    }
  });
});

describe('station presence stays truthful and economical', () => {
  test('structured failure clears previously known presence and stale timestamps', async () => {
    const env = environment();
    let presence;
    try {
      env.response(200, { ok: true, stewardPresent: true, stewardsIn: ['Test fixture'], visitorsNow: 3, lastEventAt: '2026-09-05T00:00:00Z', houseClock: 12 });
      presence = makePresence({ every: 30000 });
      await presence.poll();
      expect(env.requests).toHaveLength(1); // Automatic and manual polls coalesce.
      expect(presence.state().ok).toBe(true);
      expect(presence.state().visitorsNow).toBe(3);
      env.response(503, { ok: false, code: 'config_missing' });
      await presence.poll();
      expect(presence.state()).toMatchObject({ ok: false, code: 'config_missing', status: 503, stewardPresent: false, stewardsIn: [], visitorsNow: 0, lastEventAt: null, houseClock: null, lit: false });
      expect(env.nextDelay()).toBe(300000);
      env.storage.set('mnemos.steward.present', '1');
      expect(presence.state()).toMatchObject({ ok: false, override: true, lit: true, stewardPresent: false });
    } finally {
      presence?.stop();
      env.restore();
    }
  });

  test('hidden pages skip requests and preserve retry timing on return', async () => {
    const env = environment();
    let presence;
    try {
      env.response(503, { ok: false, code: 'config_missing' });
      presence = makePresence({ every: 30000 });
      await presence.poll();
      env.hidden(true);
      expect(env.timers.size).toBe(0);
      await presence.poll();
      expect(env.requests).toHaveLength(1);
      env.advance(1000);
      env.hidden(false);
      expect(env.requests).toHaveLength(1);
      expect(env.nextDelay()).toBe(299000);
      presence.stop();
      expect(env.listeners.size).toBe(0);
      expect(env.timers.size).toBe(0);
      await presence.poll();
      expect(env.requests).toHaveLength(1);
    } finally {
      presence?.stop();
      env.restore();
    }
  });

  test('HTTP success does not invent presence, and recovery resets retry backoff', async () => {
    const env = environment();
    let presence;
    try {
      env.response(200, { ok: false, code: 'temporarily_unavailable' });
      presence = makePresence({ every: 30000 });
      await presence.poll();
      expect(presence.state()).toMatchObject({ ok: false, code: 'temporarily_unavailable' });
      expect(env.nextDelay()).toBe(60000);
      env.response(500, { ok: false, code: 'internal_error' });
      await presence.poll();
      expect(env.nextDelay()).toBe(120000);
      env.response(200, { ok: true, visitorsNow: 0 });
      await presence.poll();
      expect(presence.state()).toMatchObject({ ok: true, code: null, error: null, visitorsNow: 0 });
      expect(env.nextDelay()).toBe(30000);
    } finally {
      presence?.stop();
      env.restore();
    }
  });
});
