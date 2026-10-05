// CMO.ai telemetry: user activity, Core Web Vitals, query performance.
//
// This used to be a parser-blocking <script> in index.html, which is the worst
// possible place for a third party. The browser stopped parsing HTML and held
// up first paint while fetching it, from a host that is frequently asleep on
// Render's free tier — the console regularly showed ERR_ABORTED 503 from it.
// Nothing here is needed to render or to interact with the app, so it is
// injected only once the window load event has already fired. By then the
// document is parsed, the app is interactive, and the request competes with
// nothing that matters.
const SRC = 'https://cmo-a0km.onrender.com/telemetry.js';
const ENDPOINT = 'https://cmo-a0km.onrender.com';
const KEY = 'tk_cb677041a7a3c43fa050aac91f50f96aca0fbfbf0a47bd91';

function inject() {
  const el = document.createElement('script');
  el.src = SRC;
  el.async = true;
  el.dataset.product = 'cvboost';
  el.dataset.endpoint = ENDPOINT;
  el.dataset.key = KEY;
  document.body.appendChild(el);
}

export function loadTelemetry() {
  if (typeof window === 'undefined') return;
  if (document.readyState === 'complete') inject();
  else window.addEventListener('load', inject, { once: true });
}
