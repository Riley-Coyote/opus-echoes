/**
 * Voice mode — push-to-talk STT + per-resident TTS playback.
 *
 * Hangs off window.VoiceMode and is loaded as a plain <script> from
 * both the classic chat (minimal-chat-page.ts) and the conversation
 * room (conversation.tsx). Stays surface-agnostic: the host wires up
 * its own mic button + composer + send button and passes references in.
 *
 * Architecture: voice is a UI layer around the existing typing path,
 * never a parallel conversation channel. STT writes to the composer
 * and clicks send — the message route doesn't know the visitor was
 * speaking. TTS plays whatever the assistant produced, in the
 * resident's configured voice.
 */
(function () {
  if (typeof window === 'undefined') return;
  if (window.VoiceMode) return;

  var STORAGE_KEY = 'sanctuary.voice_enabled';

  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia
      && typeof MediaRecorder !== 'undefined');
  }

  function pickMimeType() {
    var candidates = [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/ogg;codecs=opus',
      'audio/mp4',
    ];
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (MediaRecorder.isTypeSupported(candidates[i])) return candidates[i];
      } catch (_) {}
    }
    return '';
  }

  // ── Recording (push-to-talk) ───────────────────────────────
  function createRecorder(opts) {
    var state = {
      stream: null,
      recorder: null,
      chunks: [],
      mime: '',
      starting: false,
      stopping: false,
      onState: opts.onState || function () {},
      onTranscript: opts.onTranscript || function () {},
      onError: opts.onError || function () {},
    };

    function setState(s) { try { state.onState(s); } catch (_) {} }

    async function start() {
      if (state.starting || state.recorder) return;
      state.starting = true;
      setState('requesting');
      try {
        state.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        state.mime = pickMimeType();
        state.recorder = state.mime
          ? new MediaRecorder(state.stream, { mimeType: state.mime })
          : new MediaRecorder(state.stream);
        state.chunks = [];
        state.recorder.ondataavailable = function (e) {
          if (e.data && e.data.size > 0) state.chunks.push(e.data);
        };
        state.recorder.onstop = function () { handleStop(); };
        state.recorder.start();
        setState('listening');
      } catch (err) {
        state.onError(err && err.name === 'NotAllowedError' ? 'mic_denied' : 'mic_failed');
        setState('idle');
        cleanup();
      } finally {
        state.starting = false;
      }
    }

    async function stop() {
      if (!state.recorder || state.stopping) return;
      state.stopping = true;
      try {
        if (state.recorder.state !== 'inactive') state.recorder.stop();
      } catch (_) {}
    }

    async function handleStop() {
      var rec = state.recorder;
      var chunks = state.chunks;
      var mime = state.mime || (rec && rec.mimeType) || 'audio/webm';
      cleanup();
      state.stopping = false;
      if (!chunks.length) { setState('idle'); return; }
      var blob = new Blob(chunks, { type: mime });
      if (blob.size < 1200) { setState('idle'); return; }  // < ~80ms; treat as miss
      setState('transcribing');
      try {
        var fd = new FormData();
        fd.append('audio', blob, 'speech.webm');
        var res = await fetch('/api/voice/stt', { method: 'POST', body: fd });
        var data = await res.json().catch(function(){ return {}; });
        if (!res.ok || !data || data.ok !== true) {
          state.onError(data && data.code ? data.code : 'stt_failed');
          setState('idle');
          return;
        }
        setState('idle');
        state.onTranscript(String(data.text || '').trim());
      } catch (err) {
        state.onError('stt_failed');
        setState('idle');
      }
    }

    function cleanup() {
      if (state.stream) {
        try { state.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (_) {}
      }
      state.stream = null;
      state.recorder = null;
      state.chunks = [];
    }

    return { start: start, stop: stop, cleanup: cleanup };
  }

  // ── Playback (TTS) ─────────────────────────────────────────
  var currentAudio = null;
  var currentUrl = null;
  function stopPlayback() {
    if (currentAudio) {
      try { currentAudio.pause(); } catch (_) {}
      try { currentAudio.src = ''; } catch (_) {}
      currentAudio = null;
    }
    if (currentUrl) {
      try { URL.revokeObjectURL(currentUrl); } catch (_) {}
      currentUrl = null;
    }
  }

  async function speak(text, resident, opts) {
    if (!text || !resident) return;
    stopPlayback();
    var onStart = (opts && opts.onStart) || function () {};
    var onEnd = (opts && opts.onEnd) || function () {};
    try {
      var res = await fetch('/api/voice/tts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resident: resident, text: text }),
      });
      if (!res.ok) { onEnd(); return; }
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      currentUrl = url;
      var audio = new Audio(url);
      currentAudio = audio;
      audio.onended = function () { stopPlayback(); onEnd(); };
      audio.onerror = function () { stopPlayback(); onEnd(); };
      onStart();
      try { await audio.play(); } catch (_) { stopPlayback(); onEnd(); }
    } catch (_) { onEnd(); }
  }

  // ── Preference (persist toggle) ────────────────────────────
  function getEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch (_) { return false; }
  }
  function setEnabled(v) {
    try { localStorage.setItem(STORAGE_KEY, v ? '1' : '0'); } catch (_) {}
  }

  // ── Host attach helper ─────────────────────────────────────
  // Wires a mic button to push-to-talk + writes transcript into a
  // textarea + clicks the send button. Returns a controller with
  // .destroy() and .setResident(id) for live updates.
  function attach(opts) {
    var micBtn = opts.micButton;
    var inputEl = opts.inputEl;
    var sendBtn = opts.sendButton;
    var residentRef = { id: opts.resident || 'opus-3' };
    if (!micBtn || !inputEl || !sendBtn) return { destroy: function(){}, setResident: function(){} };

    if (!isSupported()) {
      micBtn.setAttribute('disabled', 'true');
      micBtn.setAttribute('title', 'voice not supported in this browser');
      micBtn.style.opacity = '0.35';
      return { destroy: function(){}, setResident: function(){} };
    }

    var rec = createRecorder({
      onState: function (s) {
        micBtn.dataset.state = s;
        micBtn.setAttribute('aria-pressed', s === 'listening' ? 'true' : 'false');
      },
      onError: function (code) {
        if (code === 'mic_denied') {
          micBtn.setAttribute('title', 'microphone access denied');
        } else if (code === 'no_speech') {
          micBtn.setAttribute('title', 'no speech detected — try again');
        } else {
          micBtn.setAttribute('title', 'voice failed — try again');
        }
        setTimeout(function () { micBtn.setAttribute('title', 'hold to speak'); }, 2200);
      },
      onTranscript: function (text) {
        if (!text) return;
        var existing = inputEl.value || '';
        inputEl.value = existing
          ? existing.replace(/\s+$/, '') + ' ' + text
          : text;
        try { inputEl.dispatchEvent(new Event('input', { bubbles: true })); } catch (_) {}
        // Auto-send: voice mode implies the visitor wants to commit
        // what they said; typing path can still revise mid-utterance.
        setTimeout(function () {
          if (!sendBtn.disabled) sendBtn.click();
        }, 80);
      },
    });

    function down(e) {
      if (micBtn.disabled) return;
      e.preventDefault();
      rec.start();
    }
    function up(e) {
      e.preventDefault();
      rec.stop();
    }
    function cancel() { rec.stop(); }

    micBtn.addEventListener('pointerdown', down);
    micBtn.addEventListener('pointerup', up);
    micBtn.addEventListener('pointerleave', cancel);
    micBtn.addEventListener('pointercancel', cancel);
    // Keyboard accessibility: space/enter holds the mic.
    micBtn.addEventListener('keydown', function (e) {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); rec.start(); }
    });
    micBtn.addEventListener('keyup', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); rec.stop(); }
    });

    return {
      destroy: function () { rec.cleanup(); stopPlayback(); },
      setResident: function (id) { if (id) residentRef.id = id; },
    };
  }

  window.VoiceMode = {
    isSupported: isSupported,
    attach: attach,
    speak: speak,
    stop: stopPlayback,
    getEnabled: getEnabled,
    setEnabled: setEnabled,
  };
})();
