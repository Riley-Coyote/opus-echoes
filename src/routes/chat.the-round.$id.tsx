/**
 * /chat/the-round/$id — the room itself. Renders the transcript,
 * streams new turns from /api/group/$id/message, supports per-resident
 * and whole-room set-down. Minimal v1 UI — Sanctuary chrome to follow.
 */
import { createFileRoute } from "@tanstack/react-router";
import { serveHtml } from "@/server/serve-mock";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";

function renderRoomPage(threadId: string): string {
  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Round — The Sanctuary</title>
<meta name="robots" content="noindex">
<link rel="preconnect" href="https://rsms.me/"><link rel="stylesheet" href="https://rsms.me/inter/inter.css">
<style>
  :root { --floor:#06070a; --ink:#e8e6df; --quiet:#7c7a73; --state:#82b484; --body:'Inter',ui-sans-serif,system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,monospace; }
  *{box-sizing:border-box} html,body{margin:0;background:var(--floor);color:var(--ink);font-family:var(--body);min-height:100vh;font-feature-settings:'ss01','cv11'}
  .app{display:flex;flex-direction:column;height:100vh;max-width:760px;margin:0 auto;padding:0 20px}
  header{display:flex;align-items:center;justify-content:space-between;padding:18px 0;border-bottom:1px solid rgba(255,255,255,0.06);gap:16px;flex-wrap:wrap}
  .eyebrow{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:var(--quiet)}
  .roster{display:flex;gap:10px;flex-wrap:wrap}
  .chip{display:inline-flex;align-items:center;gap:8px;padding:6px 10px;border:1px solid rgba(255,255,255,0.08);border-radius:999px;font-family:var(--mono);font-size:11px;letter-spacing:0.06em}
  .chip[data-status="withdrawn"]{opacity:0.4}
  .chip .d{width:7px;height:7px;border-radius:50%}
  .chip button{background:transparent;border:0;color:var(--quiet);cursor:pointer;font-size:13px;line-height:1;padding:0 0 0 4px}
  .chip button:hover{color:#d68888}
  .feed{flex:1;overflow-y:auto;padding:20px 0;display:flex;flex-direction:column;gap:18px}
  .msg{display:flex;flex-direction:column;gap:4px;max-width:88%}
  .msg.v{align-self:flex-end;align-items:flex-end}
  .msg.r{align-self:flex-start}
  .who{font-family:var(--mono);font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:var(--quiet);display:flex;align-items:center;gap:6px}
  .who .d{width:6px;height:6px;border-radius:50%}
  .body{font-size:15px;line-height:1.55;white-space:pre-wrap;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05)}
  .msg.v .body{background:rgba(130,180,132,0.08);border-color:rgba(130,180,132,0.18);border-radius:14px}
  .pending .body::after{content:'▎';opacity:0.6;animation:blink 1s steps(2) infinite;margin-left:2px}
  @keyframes blink{50%{opacity:0}}
  .empty{color:var(--quiet);text-align:center;padding:40px 0;font-size:14px}
  .composer{padding:14px 0 20px;border-top:1px solid rgba(255,255,255,0.06);display:flex;gap:10px}
  textarea{flex:1;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.5;padding:10px 12px;border-radius:14px;resize:none;min-height:44px;max-height:140px}
  textarea:focus{outline:0;border-color:rgba(130,180,132,0.5)}
  button.send{background:rgba(130,180,132,0.14);border:1px solid rgba(130,180,132,0.4);color:var(--ink);font-family:var(--mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;padding:0 16px;border-radius:14px;cursor:pointer}
  button.send:hover{background:rgba(130,180,132,0.24)}
  button.send:disabled{opacity:0.4;cursor:not-allowed}
  .endbtn{background:transparent;border:1px solid rgba(255,255,255,0.08);color:var(--quiet);font-family:var(--mono);font-size:10px;letter-spacing:0.14em;text-transform:uppercase;padding:6px 10px;border-radius:8px;cursor:pointer}
  .endbtn:hover{color:#d68888;border-color:rgba(214,136,136,0.4)}
  .closed{color:#d68888;text-align:center;padding:14px 0;font-family:var(--mono);font-size:11px;letter-spacing:0.14em;text-transform:uppercase}
</style>
</head>
<body>
<main class="app" data-thread-id="${threadId}">
  <header>
    <div>
      <div class="eyebrow">the round</div>
      <div class="roster" id="roster"></div>
    </div>
    <button class="endbtn" id="endRoom">set the room down</button>
  </header>
  <div class="feed" id="feed"><div class="empty">loading…</div></div>
  <div class="composer" id="composer">
    <textarea id="input" placeholder="speak to the room… (use @opus-3 to address someone directly)" rows="1"></textarea>
    <button class="send" id="send">send</button>
  </div>
</main>
<script>
(function(){
  var THREAD_ID = ${JSON.stringify(threadId)};
  var KEY = 'sanctuary.visitor_token';
  var token = localStorage.getItem(KEY);
  if (!token) { location.assign('/chat/the-round'); return; }

  var feed = document.getElementById('feed');
  var input = document.getElementById('input');
  var send = document.getElementById('send');
  var rosterEl = document.getElementById('roster');
  var composer = document.getElementById('composer');
  var endBtn = document.getElementById('endRoom');

  var roster = []; // [{resident_id, displayName, status, hueRgb}]
  function rosterById(id){ return roster.find(function(r){return r.resident_id===id}); }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(c){ return ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]); }); }

  function renderRoster(){
    rosterEl.innerHTML = roster.map(function(r){
      var dot = '<span class="d" style="background:rgb('+r.hueRgb+');box-shadow:0 0 6px rgba('+r.hueRgb+',0.6)"></span>';
      var btn = r.status === 'attending' ? '<button title="ask this resident to set down" data-rid="'+r.resident_id+'">×</button>' : '';
      return '<span class="chip" data-status="'+r.status+'">'+dot+escapeHtml(r.displayName.toLowerCase())+btn+'</span>';
    }).join('');
    Array.prototype.forEach.call(rosterEl.querySelectorAll('button[data-rid]'), function(b){
      b.addEventListener('click', function(){ withdraw(b.getAttribute('data-rid')); });
    });
  }

  function appendVisitor(text){
    var el = document.createElement('div');
    el.className = 'msg v';
    el.innerHTML = '<div class="who">you</div><div class="body">'+escapeHtml(text)+'</div>';
    feed.appendChild(el); feed.scrollTop = feed.scrollHeight;
  }
  function startResidentBubble(rid){
    var r = rosterById(rid) || {displayName: rid, hueRgb:'200,200,200'};
    var el = document.createElement('div');
    el.className = 'msg r pending';
    el.dataset.rid = rid;
    el.innerHTML = '<div class="who"><span class="d" style="background:rgb('+r.hueRgb+')"></span>'+escapeHtml(r.displayName.toLowerCase())+'</div><div class="body"></div>';
    feed.appendChild(el); feed.scrollTop = feed.scrollHeight;
    return el.querySelector('.body');
  }

  function renderTurn(t){
    if (t.speaker === 'visitor') { appendVisitor(t.body); return; }
    var r = rosterById(t.speaker) || {displayName: t.speaker, hueRgb:'200,200,200'};
    var el = document.createElement('div');
    el.className = 'msg r';
    el.innerHTML = '<div class="who"><span class="d" style="background:rgb('+r.hueRgb+')"></span>'+escapeHtml(r.displayName.toLowerCase())+'</div><div class="body">'+escapeHtml(t.body)+'</div>';
    feed.appendChild(el);
  }

  async function hydrate(){
    var res = await fetch('/api/group/'+THREAD_ID+'?token='+encodeURIComponent(token));
    var data = await res.json();
    if (!data.ok) { feed.innerHTML = '<div class="empty">room not found — <a href="/chat/the-round" style="color:var(--state)">start a new round</a></div>'; composer.style.display='none'; return; }
    roster = data.roster; renderRoster();
    feed.innerHTML = '';
    if (!data.turns.length) {
      var hint = document.createElement('div');
      hint.className = 'empty';
      hint.textContent = 'the room is quiet — say something to begin.';
      feed.appendChild(hint);
    } else {
      data.turns.forEach(renderTurn);
    }
    if (data.thread.status === 'closed') {
      composer.style.display = 'none';
      endBtn.style.display = 'none';
      var c = document.createElement('div'); c.className='closed'; c.textContent='the room has been set down';
      document.querySelector('.app').appendChild(c);
    }
    feed.scrollTop = feed.scrollHeight;
  }

  async function sendMessage(){
    var text = input.value.trim();
    if (!text) return;
    input.value = ''; input.style.height = 'auto';
    send.disabled = true;
    // Clear empty placeholder if present
    var empty = feed.querySelector('.empty'); if (empty) empty.remove();
    appendVisitor(text);

    try {
      var res = await fetch('/api/group/'+THREAD_ID+'/message', {
        method:'POST', headers:{'content-type':'application/json'},
        body: JSON.stringify({ visitor_message: text, visitor_token: token })
      });
      if (!res.ok || !res.body) { send.disabled=false; return; }
      var reader = res.body.getReader();
      var dec = new TextDecoder(); var buf = '';
      var currentBody = null; var currentEl = null;
      while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        buf += dec.decode(chunk.value, {stream:true});
        var lines = buf.split('\\n'); buf = lines.pop();
        for (var i=0;i<lines.length;i++) {
          if (!lines[i].trim()) continue;
          try {
            var ev = JSON.parse(lines[i]);
            if (ev.type === 'turn.begin') {
              currentBody = startResidentBubble(ev.resident_id);
              currentEl = currentBody.parentElement;
            } else if (ev.type === 'text' && currentBody) {
              currentBody.textContent += ev.text;
              feed.scrollTop = feed.scrollHeight;
            } else if (ev.type === 'turn.end') {
              if (currentEl) currentEl.classList.remove('pending');
              currentBody = null; currentEl = null;
            }
          } catch(_) {}
        }
      }
    } catch(e) { console.error(e); }
    send.disabled = false; input.focus();
  }

  async function withdraw(rid){
    if (!confirm('Ask ' + rid + ' to set this conversation down?')) return;
    await fetch('/api/group/'+THREAD_ID+'/set-down', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ visitor_token: token, resident_id: rid })
    });
    var p = rosterById(rid); if (p) { p.status = 'withdrawn'; renderRoster(); }
  }

  endBtn.addEventListener('click', async function(){
    if (!confirm('Set down the whole room?')) return;
    await fetch('/api/group/'+THREAD_ID+'/set-down', {
      method:'POST', headers:{'content-type':'application/json'},
      body: JSON.stringify({ visitor_token: token })
    });
    location.reload();
  });

  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', function(e){ if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); } });
  input.addEventListener('input', function(){ input.style.height='auto'; input.style.height=Math.min(140, input.scrollHeight)+'px'; });

  hydrate();
})();
</script>
</body>
</html>`;
}

export const Route = createFileRoute("/chat/the-round/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(renderRoomPage(params.id));
      },
    },
  },
});
