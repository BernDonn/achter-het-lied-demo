/* First-party aggregate music playback, no storage, cookies or visitor IDs. */
(function (root) {
  'use strict';
  function tracker(audio, edition, send, now = () => performance.now()) {
    let track = null, active = false, started = false, pendingStart = 0, seconds = 0;
    let position = 0, clock = now();
    const baseline = () => { position = audio.currentTime || 0; clock = now(); };
    function sample() {
      const t = now(), p = audio.currentTime || 0;
      const wall = (t - clock) / 1000, delta = p - position;
      // Reject seek jumps; cap long gaps conservatively rather than invent playback.
      if (active && !audio.seeking && track !== null && wall > 0 && wall <= 5 && delta > 0 && delta <= wall * audio.playbackRate + 0.75) {
        seconds += Math.min(wall, delta / audio.playbackRate);
        if (!started) { started = true; pendingStart = 1; }
      }
      position = p; clock = t;
    }
    function flush() {
      sample();
      if (track !== null && (seconds >= 0.001 || pendingStart)) {
        send({edition, track, starts: pendingStart, milliseconds: Math.min(60000, Math.round(seconds * 1000))});
        seconds = 0; pendingStart = 0;
      }
    }
    function stop() { flush(); active = false; baseline(); }
    audio.addEventListener('playing', () => { active = true; baseline(); });
    for (const event of ['pause', 'waiting', 'stalled', 'ended', 'error', 'emptied']) audio.addEventListener(event, stop);
    audio.addEventListener('seeking', () => { active = false; baseline(); });
    audio.addEventListener('seeked', () => { active = !audio.paused && !audio.ended && audio.readyState >= 3; baseline(); });
    audio.addEventListener('ratechange', baseline);
    audio.addEventListener('timeupdate', sample);
    return {sample, flush, select(segment) { stop(); track = segment.kind === 'music' ? segment.track + 1 : null; started = false; }};
  }
  function attach(audio, edition) {
    const checkbox = document.getElementById('listen-metrics');
    const blocked = navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true;
    checkbox.checked = !blocked; checkbox.disabled = blocked;
    let enabled = !blocked;
    checkbox.addEventListener('change', () => { meter.flush(); enabled = checkbox.checked && !blocked; });
    const endpoint = 'https://macmini-felix.tail58fa21.ts.net/listen';
    const meter = tracker(audio, edition, event => {
      if (!enabled) return;
      const payload = {...event, id: crypto.randomUUID()}; // per-message retry key, not a visitor/session ID
      if (typeof window.__AHL_ANALYTICS_TEST__ === 'string') payload.test = window.__AHL_ANALYTICS_TEST__;
      const body = JSON.stringify(payload);
      // credentials:omit prevents even unrelated lyrics cookies reaching this route.
      // text/plain is CORS-safelisted and supports keepalive without a preflight.
      fetch(endpoint, {method: 'POST', mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', keepalive: true, headers: {'Content-Type': 'text/plain'}, body}).catch(() => {});
    });
    setInterval(() => { meter.sample(); }, 1000);
    setInterval(() => { meter.flush(); }, 15000);
    document.addEventListener('visibilitychange', () => meter.flush());
    window.addEventListener('pagehide', () => meter.flush());
    return meter;
  }
  root.ListenAnalytics = {tracker, attach};
  if (typeof module !== 'undefined') module.exports = root.ListenAnalytics;
})(typeof window === 'undefined' ? globalThis : window);
