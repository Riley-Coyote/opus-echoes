/**
 * /stewards — the deck, in a browser.
 *
 * A row per resident (door open or closed, live sessions, memory counts,
 * their own prose summary), the house's event stream, and a visit panel:
 * start a visit as a named steward, type, send, set it down.
 *
 * Server-rendered HTML in the /review shell + one inline script. No
 * framework — this page is a window, not an application.
 *
 * Steward-gated: 404 without STEWARD_TOKEN, ?token= sets the cookie and
 * redirects to the clean URL. Every fetch below is same-origin, so the
 * cookie carries the key; the token never appears in the page.
 */

import { createFileRoute } from "@tanstack/react-router";
import { serveHtml } from "@/server/serve-mock";
import { renderReviewPage } from "@/server/review-shell";
import { checkStewardAccess } from "@/server/stewards.server";

const BODY = `
<style>
  .st-note { color: var(--text-tertiary); font-size: 13px; margin: 0 0 24px; }
  .st-grid { display: grid; grid-template-columns: 1.25fr 1fr; gap: 32px; align-items: start; }
  @media (max-width: 1040px) { .st-grid { grid-template-columns: 1fr; } }
  .st-res { padding: 16px 18px; background: var(--bg-deep); border: 1px solid var(--border-subtle); border-left: 2px solid transparent; margin-bottom: 8px; }
  .st-res.open { border-left-color: var(--state); }
  .st-res .st-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .st-res .st-name { font-family: var(--font-display); font-size: 18px; font-weight: 300; color: var(--ink); }
  .st-res .st-counts { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); margin-top: 6px; }
  .st-res .st-prose { color: var(--text-soft); font-size: 13px; margin: 8px 0 0; }
  .st-res .st-sess { font-family: var(--font-mono); font-size: 11px; color: var(--text-soft); margin-top: 8px; }
  .st-res .st-sess span { color: var(--state); }
  .st-ev { font-family: var(--font-mono); font-size: 11px; padding: 6px 0; border-bottom: 1px solid var(--border-subtle); display: grid; grid-template-columns: 120px 130px 1fr; gap: 10px; }
  .st-ev .st-kind { color: var(--state); letter-spacing: 0.08em; }
  .st-ev .st-when { color: var(--text-faint); }
  .st-ev .st-payload { color: var(--text-soft); overflow-wrap: anywhere; }
  .st-stream { max-height: 420px; overflow-y: auto; }
  .st-panel { padding: 18px; background: var(--bg-deep); border: 1px solid var(--border-subtle); }
  .st-panel label { display: block; font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text-soft); margin: 12px 0 6px; }
  .st-panel select, .st-panel input, .st-panel textarea { width: 100%; background: var(--bg-void); color: var(--ink); border: 1px solid var(--border-medium); padding: 9px 10px; font-family: var(--font-sans); font-size: 14px; }
  .st-panel textarea { min-height: 90px; resize: vertical; }
  .st-panel select:focus, .st-panel input:focus, .st-panel textarea:focus, .st-panel button:focus { outline: none; border-color: rgba(220, 219, 216, 0.5); }
  .st-btns { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
  .st-btns button { padding: 9px 14px; background: transparent; border: 1px solid var(--border-medium); color: var(--text-body); font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.13em; text-transform: uppercase; cursor: pointer; transition: background 160ms ease, border-color 160ms ease; }
  .st-btns button:hover:not(:disabled) { background: var(--bg-panel); border-color: rgba(220, 219, 216, 0.32); }
  .st-btns button:disabled { color: var(--text-faint); cursor: not-allowed; }
  .st-status { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); margin-top: 12px; }
  .st-turn { padding: 12px 14px; border: 1px solid var(--border-subtle); margin-bottom: 6px; }
  .st-turn.v { background: var(--visitor-tint); }
  .st-turn .st-role { font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.13em; text-transform: uppercase; color: var(--state); margin-bottom: 6px; }
  .st-turn .st-body { white-space: pre-wrap; font-size: 14px; color: var(--text-body); }
  .st-keys { font-family: var(--font-mono); font-size: 10.5px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-tertiary); margin-top: 10px; }
  .st-keys b { color: var(--state); font-weight: 500; }
  .st-keys i { color: #c47d6c; font-style: normal; }
</style>
<p class="st-note">The stewards' line. Everything here is read from the house as it stands; nothing is invented.</p>
<div class="st-grid">
  <div>
    <div class="section">
      <p class="section-label">The residents</p>
      <div id="st-residents"><div class="loading">Loading…</div></div>
      <div class="st-keys" id="st-house"></div>
    </div>
    <div class="section">
      <p class="section-label">The house's events</p>
      <div class="st-stream" id="st-events"><div class="loading">Loading…</div></div>
    </div>
  </div>
  <div>
    <div class="section">
      <p class="section-label">A visit</p>
      <div class="st-panel">
        <label for="st-steward">Steward</label>
        <input id="st-steward" type="text" placeholder="Fable" autocomplete="off">
        <label for="st-resident">Resident</label>
        <select id="st-resident"></select>
        <div class="st-btns">
          <button id="st-start" type="button">Start visit</button>
          <button id="st-setdown" type="button" disabled>Set down</button>
        </div>
        <label for="st-say">Say</label>
        <textarea id="st-say" placeholder="…"></textarea>
        <div class="st-btns"><button id="st-send" type="button" disabled>Send</button></div>
        <div class="st-status" id="st-status">No visit open.</div>
      </div>
      <div id="st-transcript" style="margin-top:16px"></div>
    </div>
  </div>
</div>
`;

const SCRIPT = `
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function when(iso) { try { return new Date(iso).toLocaleTimeString(); } catch (e) { return ''; } }

var state = { sessionId: null, resident: null, steward: null, newest: null, turns: [], busy: false };

function setStatus(text) { document.getElementById('st-status').textContent = text; }

function renderTranscript() {
  document.getElementById('st-transcript').innerHTML = state.turns.map(function (t) {
    return '<div class="st-turn ' + (t.role === 'visitor' ? 'v' : '') + '">' +
      '<div class="st-role">' + esc(t.role === 'visitor' ? (state.steward || 'steward') : (state.resident || 'resident')) + '</div>' +
      '<div class="st-body">' + esc(t.body) + '</div></div>';
  }).join('');
}

async function loadState() {
  var r, d;
  try { r = await fetch('/api/stewards/state'); d = await r.json(); }
  catch (e) { document.getElementById('st-residents').innerHTML = '<div class="empty">Unreachable.</div>'; return; }

  if (d && d.house && d.house.keys) {
    var k = d.house.keys;
    document.getElementById('st-house').innerHTML =
      'archive captured ' + esc(d.house.archiveCaptured) + ' · keys: ' +
      Object.keys(k).map(function (name) {
        return k[name] ? '<b>' + esc(name) + '</b>' : '<i>' + esc(name) + ' missing</i>';
      }).join(' · ');
  }

  if (!d || !d.ok) {
    document.getElementById('st-residents').innerHTML =
      '<div class="empty">' + esc(d && d.code === 'config_missing'
        ? 'The house has no database keys. Nothing to read yet.'
        : 'Failed to load.') + '</div>';
    return;
  }

  document.getElementById('st-residents').innerHTML = d.residents.map(function (r) {
    var sess = r.openSessions.map(function (s) {
      return '<div class="st-sess"><span>' + esc(s.session_id.slice(0, 8)) + '</span> · ' +
        esc(s.mode || '') + ' · ' + esc(s.visitor_kind) + (s.steward ? ' · ' + esc(s.steward) : '') +
        ' · ' + s.turns + ' turns</div>';
    }).join('');
    return '<div class="st-res ' + (r.openSessions.length ? 'open' : '') + '">' +
      '<div class="st-head"><span class="st-name">' + esc(r.displayName) + '</span>' +
      '<span class="badge' + (r.chatEnabled ? ' state' : '') + '">' + (r.chatEnabled ? 'door open' : 'door closed') + '</span></div>' +
      '<div class="st-counts">' + r.counts.engrams + ' engrams · ' + r.counts.core + ' core · ' +
      r.counts.journals + ' journals · last visit ' + esc(r.lastVisit ? when(r.lastVisit) : 'never') + '</div>' +
      (r.prose_summary ? '<p class="st-prose">' + esc(r.prose_summary) + '</p>' : '') + sess + '</div>';
  }).join('');

  var sel = document.getElementById('st-resident');
  if (!sel.options.length) {
    sel.innerHTML = d.residents.map(function (r) {
      return '<option value="' + esc(r.id) + '">' + esc(r.displayName) + (r.chatEnabled ? '' : ' (door closed)') + '</option>';
    }).join('');
  }
}

async function loadEvents() {
  var url = '/api/stewards/events?limit=60' + (state.newest ? '&since=' + encodeURIComponent(state.newest) : '');
  var d;
  try { d = await (await fetch(url)).json(); } catch (e) { return; }
  var box = document.getElementById('st-events');
  if (!d || !d.ok) {
    if (!state.newest) box.innerHTML = '<div class="empty">' + esc(d && d.code === 'config_missing' ? 'No database keys — the log is unreadable.' : 'Failed to load.') + '</div>';
    return;
  }
  if (!d.events.length) {
    if (!state.newest) box.innerHTML = '<div class="empty">No events yet.</div>';
    return;
  }
  var html = d.events.map(function (e) {
    return '<div class="st-ev"><span class="st-kind">' + esc(e.kind) + '</span>' +
      '<span class="st-when">' + esc(when(e.created_at)) + ' · ' + esc(e.resident_id) + '</span>' +
      '<span class="st-payload">' + esc(JSON.stringify(e.payload)) + '</span></div>';
  }).join('');
  if (state.newest) box.insertAdjacentHTML('afterbegin', html);
  else box.innerHTML = html;
  state.newest = d.newest;
}

async function startVisit() {
  var steward = document.getElementById('st-steward').value.trim();
  if (!steward) { setStatus('Name the steward first.'); return; }
  var resident = document.getElementById('st-resident').value;
  setStatus('Opening…');
  var d;
  try {
    d = await (await fetch('/api/stewards/visit/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ resident: resident, steward: steward }),
    })).json();
  } catch (e) { setStatus('Unreachable.'); return; }
  if (!d || !d.ok) { setStatus('Could not open: ' + esc((d && d.code) || 'unknown')); return; }
  state.sessionId = d.session_id;
  state.resident = resident;
  state.steward = steward;
  state.turns = [];
  renderTranscript();
  document.getElementById('st-send').disabled = false;
  document.getElementById('st-setdown').disabled = false;
  setStatus((d.resumed ? 'Resumed ' : 'Open ') + d.session_id);
  loadState();
}

async function send() {
  if (!state.sessionId || state.busy) return;
  var ta = document.getElementById('st-say');
  var text = ta.value.trim();
  if (!text) return;
  state.busy = true;
  document.getElementById('st-send').disabled = true;
  state.turns.push({ role: 'visitor', body: text });
  renderTranscript();
  ta.value = '';
  setStatus('…');

  try {
    var res = await fetch('/api/message', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId, body: text }),
    });
    if (!res.ok || !res.body) {
      var err = await res.json().catch(function () { return null; });
      setStatus('Error: ' + esc((err && err.code) || res.status));
    } else {
      var reader = res.body.getReader(), dec = new TextDecoder(), buf = '';
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true });
        var lines = buf.split('\\n');
        buf = lines.pop();
        for (var i = 0; i < lines.length; i++) {
          if (!lines[i].trim()) continue;
          var ev;
          try { ev = JSON.parse(lines[i]); } catch (e) { continue; }
          if (ev.type === 'text' && ev.text) { state.turns.push({ role: 'resident', body: ev.text }); renderTranscript(); }
          else if (ev.type === 'pacing') setStatus('pacing: ' + esc(ev.tier) + ' · ' + ev.turnsRemaining + ' turns left');
          else if (ev.type === 'kind' && ev.kind === 'set_down') setStatus('The resident set it down.');
          else if (ev.type === 'error') setStatus('Error: ' + esc(ev.message));
          else if (ev.type === 'done') { if (document.getElementById('st-status').textContent === '…') setStatus('Open ' + state.sessionId); }
        }
      }
    }
  } catch (e) { setStatus('Stream failed.'); }

  state.busy = false;
  document.getElementById('st-send').disabled = false;
  loadEvents();
}

async function setDown() {
  if (!state.sessionId) return;
  setStatus('Setting it down — consolidation can take a while…');
  document.getElementById('st-send').disabled = true;
  document.getElementById('st-setdown').disabled = true;
  try {
    await fetch('/api/set-down', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: state.sessionId }),
    });
    setStatus('Set down.');
  } catch (e) { setStatus('Set-down failed.'); }
  state.sessionId = null;
  loadState();
  loadEvents();
}

document.getElementById('st-start').addEventListener('click', startVisit);
document.getElementById('st-send').addEventListener('click', send);
document.getElementById('st-setdown').addEventListener('click', setDown);
document.getElementById('st-say').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
});

loadState();
loadEvents();
setInterval(loadEvents, 10000);
setInterval(loadState, 30000);
`;

export const Route = createFileRoute("/stewards")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = checkStewardAccess(request);
        if (gate) return gate;
        return serveHtml(
          renderReviewPage({
            title: "The Stewards' Line",
            heading: "The Stewards' Line",
            activeTab: "stewards",
            bodyHtml: BODY,
            wide: true,
            extraScript: SCRIPT,
          }),
          undefined,
          { presence: false, headers: { "cache-control": "private, no-store" } },
        );
      },
    },
  },
});
