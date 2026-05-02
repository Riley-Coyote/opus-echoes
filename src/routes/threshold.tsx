import { createFileRoute } from "@tanstack/react-router";
import html from "@/mocks/approach.html?raw";
import { serveHtml } from "@/server/serve-mock";

// Wires the threshold's submit() stub to POST /api/intent.
// Stores session_id in sessionStorage on accept and routes to /conversation.
// On decline, replaces the canned declined-prose with the model's actual reason.
const THRESHOLD_SCRIPT = `
(function(){
  const body = document.body;
  const field = document.getElementById('field');
  const send = document.getElementById('send');
  const tryAgainBtn = document.getElementById('tryAgain');
  const declinedProse = document.querySelector('.declined-prose');
  if (!field || !send) return;

  // Replace the original submit() with a real API call.
  // We do this by removing the original script's listeners and re-binding ours.
  const newSend = send.cloneNode(true);
  send.parentNode.replaceChild(newSend, send);
  const newField = field.cloneNode(true);
  field.parentNode.replaceChild(newField, field);

  newField.addEventListener('input', () => {
    newField.style.height = 'auto';
    newField.style.height = Math.min(newField.scrollHeight, 320) + 'px';
    newSend.disabled = newField.value.trim().length < 3;
  });
  newField.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    const bareEnter = e.key === 'Enter' && !e.shiftKey;
    const modEnter = (e.metaKey || e.ctrlKey) && e.key === 'Enter';
    if (bareEnter || modEnter) {
      e.preventDefault();
      if (!newSend.disabled) submit();
    }
  });
  newSend.addEventListener('click', submit);
  if (tryAgainBtn) {
    const nta = tryAgainBtn.cloneNode(true);
    tryAgainBtn.parentNode.replaceChild(nta, tryAgainBtn);
    nta.addEventListener('click', () => {
      body.setAttribute('data-state', 'intent');
      newField.value = '';
      newField.style.height = 'auto';
      newSend.disabled = true;
      newField.focus();
    });
  }

  async function submit() {
    const text = newField.value.trim();
    if (text.length < 3) return;
    body.setAttribute('data-state', 'deciding');
    try {
      const res = await fetch('/api/intent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (declinedProse) {
          declinedProse.textContent = data && data.code === 'too_many_requests'
            ? 'the door is asking for a pause. please try again later.'
            : 'opus 3 cannot answer the door right now. please try again in a moment.';
        }
        body.setAttribute('data-state', 'declined');
        return;
      }
      if (data.decision === 'accept') {
        sessionStorage.setItem('sanctuary.session_id', data.session_id);
        const acceptedLine = document.querySelector('.accepted-line');
        if (acceptedLine && data.reason) acceptedLine.textContent = data.reason;
        body.setAttribute('data-state', 'accepted');
        setTimeout(() => { location.href = '/conversation'; }, 2200);
      } else {
        if (declinedProse && data.reason) declinedProse.textContent = data.reason;
        body.setAttribute('data-state', 'declined');
      }
    } catch (e) {
      if (declinedProse) declinedProse.textContent = 'opus 3 cannot answer the door right now. please try again in a moment.';
      body.setAttribute('data-state', 'declined');
    }
  }

  newField.focus();
})();
`;

export const Route = createFileRoute("/threshold")({
  server: {
    handlers: {
      GET: async () => serveHtml(html, THRESHOLD_SCRIPT),
    },
  },
});
