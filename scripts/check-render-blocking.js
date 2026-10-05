// Guards against parser-blocking scripts in index.html.
//
// A plain <script src> in the document head is parser-blocking: the browser
// stops parsing HTML and holds up first paint until the file has downloaded
// and executed. That is an acceptable trade for the application's own entry
// module, which the page genuinely cannot render without, and an
// unacceptable one for a third party.
//
// This is not hypothetical. index.html carried the CMO.ai telemetry script
// this way, pointing at a host that is frequently asleep on Render's free
// tier. The console showed ERR_ABORTED 503 from it on every page load, so
// the browser was blocking first paint on a request that could not succeed.
// The script is now injected after the load event by src/utils/telemetry.js.
//
// Only the head is checked. A parser-blocking script in the body is still bad
// practice, but the head is where this regressed and where it costs the most.
const fs = require('fs');
const path = require('path');

// Overridable so the policy can be checked against a fixture, which is how
// this guard was proven to fail on the shape it is meant to catch.
const htmlPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'frontend', 'index.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const headEnd = html.indexOf('</head>');
if (headEnd === -1) {
  console.error('no </head> found in index.html; cannot check the head');
  process.exit(1);
}
const head = html.slice(0, headEnd);

const failures = [];

// Any <script ...> carrying a src, minus the ones explicitly marked as
// non-blocking. `type="module"` is also non-blocking by definition.
const tagRe = /<script\b[^>]*>/gi;
let match;
while ((match = tagRe.exec(head)) !== null) {
  const tag = match[0];
  if (!/\bsrc\s*=/i.test(tag)) continue;
  if (/\btype\s*=\s*["']module["']/i.test(tag)) continue;
  if (/\basync\b/i.test(tag)) continue;
  if (/\bdefer\b/i.test(tag)) continue;

  const src = (tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i) || [])[1] || '(unknown)';
  failures.push(
    `parser-blocking <script src="${src}"> in <head>. Mark it async or defer, ` +
      'or inject it after the load event like src/utils/telemetry.js does.'
  );
}

if (failures.length) {
  console.error('index.html render blocking: FAIL');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('index.html render blocking: OK (no parser-blocking scripts in <head>)');
