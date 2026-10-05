// Exercises scripts/e2e-failures.js against synthetic Playwright JSON reports.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const script = path.join(__dirname, '..', 'scripts', 'e2e-failures.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-annot-'));

function run(report, name) {
  const file = path.join(tmp, `${name}.json`);
  fs.writeFileSync(file, typeof report === 'string' ? report : JSON.stringify(report));
  const out = execFileSync(process.execPath, [script, file], { encoding: 'utf8' });
  return out.trim();
}

function spec(title, file, line, results, status = 'expected') {
  return { title, file, line, tests: [{ status, results }] };
}

const cases = [
  {
    name: 'nested failure surfaces with file and first error line',
    report: {
      stats: { expected: 3, unexpected: 1, flaky: 0 },
      suites: [
        {
          title: 'root',
          file: 'e2e/root.spec.js',
          suites: [
            {
              title: 'inner',
              specs: [
                spec('logs in and lands on dashboard', 'e2e/auth.spec.js', 22, [
                  { status: 'failed', error: { message: 'Error: expect(received).toHaveURL(expected)\n\nExpected: /dashboard/\nReceived: /verify-email/' } }
                ]),
              ],
            },
          ],
        },
      ],
    },
    expect: (o) =>
      o.includes('::error') &&
      o.includes('auth.spec.js:22') &&
      // The actionable Expected/Received lines, not just the generic first line.
      o.includes('Expected: /dashboard/') &&
      o.includes('/verify-email/') &&
      o.includes('1 failing test'),
  },
  {
    name: 'the last result wins, so a passed retry is not reported',
    report: {
      stats: { expected: 1, unexpected: 0, flaky: 1 },
      suites: [{ title: 'r', specs: [spec('flaky one', 'e2e/f.spec.js', 9, [
        { status: 'failed', error: { message: 'first attempt failed' } },
        { status: 'passed' },
      ], 'flaky')] }],
    },
    expect: (o) => o.startsWith('No failing tests and no load errors') && o.includes('1 flaky'),
  },
  {
    // A run where nothing executed: no failing tests, a non-zero exit, and the whole
    // cause sitting in suite.errors. Reading test results alone calls this clean.
    name: 'a spec that failed to load is reported even with no failing tests',
    report: {
      stats: { expected: 0, unexpected: 0, flaky: 0 },
      suites: [{
        title: 'credits.spec.js',
        file: 'e2e/credits.spec.js',
        errors: [{
          message: "Cannot find module 'jszip'\nRequire stack:\n- e2e/helpers/docx.js",
          location: { file: 'e2e/credits.spec.js', line: 4, column: 31 },
        }],
        specs: [],
      }],
    },
    expect: (o) =>
      o.includes('could not be loaded') &&
      o.includes('Cannot find module') &&
      o.includes('file=e2e/credits.spec.js') &&
      o.includes('line=4'),
  },
  {
    name: 'timedOut counts as a failure even with no error object',
    report: {
      stats: { expected: 0, unexpected: 1, flaky: 0 },
      suites: [{ title: 'r', specs: [spec('times out', 'e2e/t.spec.js', 4, [{ status: 'timedOut' }])] }],
    },
    expect: (o) => o.includes('times out') && o.includes('timedOut') && !o.includes('::expected'),
  },
  {
    name: 'output before the JSON document still parses',
    report: 'some incidental line\n{"stats":{"expected":0,"unexpected":1},"suites":[{"title":"r","specs":[' +
      JSON.stringify(spec('after noise', 'e2e/n.spec.js', 1, [{ status: 'failed', error: { message: 'boom' } }])) + ']}]}',
    expect: (o) => o.includes('after noise'),
  },
  {
    name: 'an unreadable report reports itself instead of throwing',
    report: 'not json at all',
    expect: (o) => o.includes('Could not read the Playwright report'),
  },
  {
    name: 'overflow beyond the annotation cap is folded into one annotation',
    report: (() => {
      const specs = [];
      for (let i = 0; i < 12; i++) {
        specs.push(spec(`failure ${i}`, 'e2e/x.spec.js', i + 1, [{ status: 'failed', error: { message: `err ${i}` } }]));
      }
      return { stats: { unexpected: 12 }, suites: [{ title: 'r', specs }] };
    })(),
    expect: (o) => {
      // 8 per-failure annotations plus 1 folded overflow. The tally is a plain log
      // line so it does not consume an annotation slot.
      const annotations = o.split('\n').filter((l) => l.startsWith('::error'));
      const tally = o.split('\n').filter((l) => l.includes('failing test(s)'));
      return annotations.length === 9 && annotations.some((l) => l.includes('+4 more')) &&
        tally.length === 1 && !tally[0].startsWith('::error');
    },
  },
];

let failed = 0;
for (const c of cases) {
  let out;
  try {
    out = run(c.report, c.name.replace(/\W+/g, '_'));
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
