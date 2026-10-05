// Exercises scripts/e2e-explain.js against synthetic run logs.
//
// The point of these cases is the failures the JSON reporter cannot see at all: a
// webServer that never came up, a port already bound, a browser that is not installed.
// Each of those has to reach a check-run annotation, because the run log is not
// readable without permissions on the repository.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const script = path.join(__dirname, '..', 'scripts', 'e2e-explain.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-explain-'));

function run(log, name) {
  const file = path.join(tmp, `${name}.log`);
  fs.writeFileSync(file, log);
  const out = execFileSync(process.execPath, [script, file], { encoding: 'utf8' });
  return out.trim();
}

function annotations(out) {
  return out.split('\n').filter((l) => l.startsWith('::error'));
}

const cases = [
  {
    name: 'a webServer timeout is reported, not just counted',
    log: [
      'Running 28 tests using 1 worker',
      'Error: Timed out waiting 180000ms from config.webServer',
      '',
      '  at /home/runner/work/_npx/1m0l0f/playwright/lib/plugins/webServer.js:120:18',
    ].join('\n'),
    expect: (o) =>
      annotations(o).length === 1 &&
      o.includes('Timed out waiting 180000ms from config.webServer') &&
      o.includes('webServer timeout'),
  },
  {
    name: 'a bound port is named as such',
    log: [
      '[WebServer] Error: listen EADDRINUSE: address already in use 0.0.0.0:5173',
    ].join('\n'),
    expect: (o) => o.includes('EADDRINUSE') && o.includes('port in use'),
  },
  {
    name: 'a webServer process that exited is distinguished from one that never answered',
    log: 'Error: Process from config.webServer was not able to start. Exit code: 1',
    expect: (o) => o.includes('webServer exit') && o.includes('Exit code: 1'),
  },
  {
    name: 'the Expected/Received detail after the error line is kept',
    log: [
      '  1) [chromium] > e2e/auth.spec.js:31:1 > auth > rejects a bad password',
      '',
      'Error: expect(received).toHaveURL(expected)',
      '',
      'Expected pattern: /dashboard/',
      'Received string:  "http://localhost:5173/login"',
    ].join('\n'),
    expect: (o) =>
      o.includes('Expected pattern: /dashboard/') &&
      o.includes('http://localhost:5173/login'),
  },
  {
    name: 'three identical retry errors produce one annotation',
    log: [
      'Error: listen EADDRINUSE: address already in use 0.0.0.0:5173',
      'Error: listen EADDRINUSE: address already in use 0.0.0.0:5173',
      'Error: listen EADDRINUSE: address already in use 0.0.0.0:5173',
    ].join('\n'),
    expect: (o) => annotations(o).length === 1,
  },
  {
    name: 'the WebServer prefix is stripped so the message reads on its own',
    log: '[WebServer]     Error: No tests found in e2e',
    expect: (o) => !o.includes('[WebServer]') && o.includes('No tests found'),
  },
  {
    name: 'an unrecognised log still reports its tail rather than staying silent',
    log: Array.from({ length: 60 }, (_, i) => `line ${i}`).join('\n'),
    expect: (o) =>
      o.includes('unrecognised') && o.includes('line 59') && !o.includes('line 19%0Aline 20'),
  },
  {
    name: 'a missing log says so, instead of the step failing for a second reason',
    // A nonexistent path is used by passing a report-shaped name that is never written.
    log: null,
    expect: (o) => o.includes('No run log was captured'),
  },
];

let failed = 0;
for (const c of cases) {
  let out;
  try {
    out = c.log === null
      ? execFileSync(process.execPath, [script, path.join(tmp, 'absent.log')], { encoding: 'utf8' }).trim()
      : run(c.log, c.name.replace(/\W+/g, '_'));
  } catch (err) {
    console.log(`FAIL  ${c.name}\n      threw: ${String(err.message).split('\n')[0]}`);
    failed++;
    continue;
  }
  if (c.expect(out)) {
    console.log(`ok    ${c.name}`);
  } else {
    console.log(`FAIL  ${c.name}\n      output: ${out.split('\n').join('\n              ')}`);
    failed++;
  }
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(failed === 0 ? '\nall cases passed' : `\n${failed} case(s) failed`);
process.exit(failed === 0 ? 0 : 1);