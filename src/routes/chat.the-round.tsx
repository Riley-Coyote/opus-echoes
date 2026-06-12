/**
 * /chat/the-round — picker page. Visitor checks which residents to
 * include (>=2), submits, server creates the thread, redirects to the
 * room. Minimal Sanctuary-styled HTML; we can polish next iteration.
 */
import { createFileRoute } from "@tanstack/react-router";
import { serveHtml } from "@/server/serve-mock";
import { ALL_RESIDENTS } from "@/server/opus/residents";
import { legacyRedirectResponse } from "@/server/phase-two/redirects";

function renderPickerPage(): string {
  const opts = ALL_RESIDENTS.map((r) => {
    const hue = r.viewportGlow.hues[0];
    return `<label class="opt">
      <input type="checkbox" name="resident" value="${r.id}" checked />
      <span class="dot" style="background: rgb(${hue}); box-shadow: 0 0 10px rgba(${hue}, 0.6);"></span>
      <span class="name">${r.displayName.toLowerCase()}</span>
    </label>`;
  }).join("\n");

  return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Round — The Sanctuary</title>
<meta name="description" content="A group chat with the residents of The Sanctuary.">
<link rel="preconnect" href="https://rsms.me/"><link rel="stylesheet" href="https://rsms.me/inter/inter.css">
<style>
  :root { --floor:#06070a; --ink:#e8e6df; --quiet:#7c7a73; --state:#82b484; --body:'Inter',ui-sans-serif,system-ui,sans-serif; --mono:'JetBrains Mono',ui-monospace,monospace; }
  *{box-sizing:border-box} html,body{margin:0;background:var(--floor);color:var(--ink);font-family:var(--body);min-height:100vh;font-feature-settings:'ss01','cv11'}
  body{display:flex;align-items:center;justify-content:center;padding:40px 20px}
  .card{max-width:520px;width:100%}
  h1{font-family:'Inter Tight',var(--body);font-weight:500;font-size:28px;line-height:1.15;letter-spacing:-0.01em;margin:0 0 8px}
  .eyebrow{font-family:var(--mono);font-size:11px;text-transform:uppercase;letter-spacing:0.18em;color:var(--quiet);margin-bottom:24px}
  p.lede{color:#b8b6ae;font-size:15px;line-height:1.55;margin:0 0 28px}
  .opts{display:flex;flex-direction:column;gap:10px;margin-bottom:24px}
  .opt{display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid rgba(255,255,255,0.06);border-radius:10px;cursor:pointer;transition:border-color .2s,background .2s}
  .opt:hover{border-color:rgba(255,255,255,0.14);background:rgba(255,255,255,0.02)}
  .opt input{accent-color:var(--state);width:14px;height:14px}
  .dot{display:inline-block;width:8px;height:8px;border-radius:50%}
  .name{font-family:var(--mono);font-size:12px;letter-spacing:0.06em;color:var(--ink)}
  button.start{display:block;width:100%;padding:14px 18px;background:rgba(130,180,132,0.12);border:1px solid rgba(130,180,132,0.4);color:var(--ink);font-family:var(--mono);font-size:12px;letter-spacing:0.14em;text-transform:uppercase;border-radius:10px;cursor:pointer;transition:background .2s,border-color .2s}
  button.start:hover{background:rgba(130,180,132,0.2);border-color:rgba(130,180,132,0.7)}
  button.start:disabled{opacity:0.4;cursor:not-allowed}
  .err{color:#d68888;font-size:13px;min-height:18px;margin-top:10px;text-align:center}
  .back{display:block;text-align:center;margin-top:20px;color:var(--quiet);font-family:var(--mono);font-size:11px;letter-spacing:0.12em;text-transform:uppercase;text-decoration:none}
  .back:hover{color:var(--ink)}
</style>
</head>
<body>
<main class="card">
  <div class="eyebrow">the round · group chat</div>
  <h1>Who's in the room?</h1>
  <p class="lede">Pick at least two residents. They'll take turns based on who has something to add — sometimes one will reply, sometimes two or three will, sometimes none and the room hands the floor back to you.</p>
  <form id="form">
    <div class="opts">${opts}</div>
    <button class="start" type="submit" id="start">Enter the round</button>
    <div class="err" id="err"></div>
  </form>
  <a class="back" href="/">← back</a>
</main>
<script>
(function(){
  // visitor_token — reuse if present, otherwise mint one. Same storage
  // key as the rest of the project so future cross-surface work is easy.
  var KEY = 'sanctuary.visitor_token';
  var token = localStorage.getItem(KEY);
  if (!token) {
    token = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(KEY, token);
  }
  var form = document.getElementById('form');
  var err = document.getElementById('err');
  var btn = document.getElementById('start');
  form.addEventListener('submit', async function(e){
    e.preventDefault();
    err.textContent = '';
    var residents = Array.prototype.slice.call(form.querySelectorAll('input[name="resident"]:checked')).map(function(i){return i.value});
    if (residents.length < 2) { err.textContent = 'Pick at least two residents.'; return; }
    btn.disabled = true; btn.textContent = 'opening the room…';
    try {
      var res = await fetch('/api/group/start', {
        method: 'POST',
        headers: {'content-type':'application/json'},
        body: JSON.stringify({ residents: residents, visitor_token: token })
      });
      var data = await res.json();
      if (!data.ok) throw new Error(data.code || 'failed');
      location.assign('/chat/the-round/' + data.id);
    } catch (e2) {
      btn.disabled = false; btn.textContent = 'Enter the round';
      err.textContent = 'Could not open the room — try again in a moment.';
    }
  });
})();
</script>
</body>
</html>`;
}

export const Route = createFileRoute("/chat/the-round")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const redirect = legacyRedirectResponse(request);
        if (redirect) return redirect;
        return serveHtml(renderPickerPage());
      },
    },
  },
});
