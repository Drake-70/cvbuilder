/**
 * Turns a Playwright JSON report into GitHub Actions annotations.
 *
 * Why this exists: a Playwright failure is otherwise only visible by opening the
 * run log and scrolling, which is exactly why a suite can stay red for weeks
 * without anyone reading it. Annotations surface on the check-run itself, in the
 * PR/commit view, so a broken test is legible without clicking into logs.
 *
 * Reads the JSON report from argv[2] (or PLAYWRIGHT_JSON_OUTPUT_NAME). Always
 * exits 0: the point is to report what failed, not to fail this step and mask the
 * real exit code from the test run.
 */

const fs = require('fs');

const reportPath = process.argv[2] || process.env.PLAYWRIGHT_JSON_OUTPUT_NAME || 'e2e-results.json';

// GitHub renders at most a handful of annotations per step, so the first failure
// gets one and the rest are folded into a single trailing annotation. Truncating
// is fine; the full text still goes to the step summary for anyone reading it.
const MAX_ANNOTATIONS = 8;

/**
 * GitHub parses a workflow command as `::name key=value,key=value::body`, so a literal
 * % or newline in either half is read as an escape rather than as text -- and a title
 * containing a comma would be parsed as the start of another key.
 */
function escapeCommand(value, { isProperty }) {
  const escaped = String(value)
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');
  return isProperty ? escaped.replace(/,/g, '%2C') : escaped;
}

function readReport() {
  try {
    const raw = fs.readFileSync(reportPath, 'utf8');
    // The JSON reporter writes its document on the last line; anything before it
    // is incidental output that would break a plain JSON.parse.
    const start = raw.indexOf('{');
    return JSON.parse(start === -1 ? raw : raw.slice(start));
  } catch (err) {
    console.log(`::error title=e2e::Could not read the Playwright report at ${reportPath} (${err.message})`);
    return null;
  }
}

/**
 * Playwright puts "Error: expect(received)..." on the first line of a failure and
 * the actionable Expected/Received detail on the lines after it, so the first line
 * alone is rarely worth reading. The first few lines are kept, and a title with no
 * error object at all falls back to the result status so a timeout says "timedOut"
 * rather than the test's own status.
 */
function summarise(message, fallback) {
  const lines = String(message || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return fallback;

  const text = lines
    .slice(0, 3)
    .map((line) => line.replace(/^Error:\s*/, ''))
    .join(' | ');
  return text.length > 300 ? `${text.slice(0, 297)}...` : text;
}

/** Collects the failing specs, since suites nest arbitrarily deep. */
function collectFailures(suites, out = []) {
  for (const suite of suites || []) {
    collectFailures(suite.suites, out);

    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        // Playwright retries, so the verdict is the last result. A test that failed
        // and then passed is reported as flaky, not as a failure -- what matters here
        // is what is still broken.
        const results = test.results || [];
        const last = results[results.length - 1] || {};
        const failed = results.length ? last.status !== 'passed' : test.status !== 'expected';
        if (!failed) continue;

        // Two forms of the same path, for two different readers: the bare filename is
        // what a person scanning the annotation list wants, while GitHub needs the
        // repo-relative path to anchor the note to a location in the diff. Collapsing to
        // the basename is what the earlier version did, so the annotation could not be
        // clicked through to anything.
        const path = (spec.file || suite.file || '').replace(/\\/g, '/');
        out.push({
          title: spec.title,
          file: path.split('/').pop(),
          path,
          line: spec.line,
          message: summarise(last.error && last.error.message, last.status || test.status || 'failed'),
        });
      }
    }
  }
  return out;
}

function main() {
  const report = readReport();
  if (!report) return;

  const failures = collectFailures(report.suites);
  const counts = report.stats || {};

  if (failures.length === 0) {
    console.log(`No per-test failures recorded (${counts.expected || 0} expected, ${counts.unexpected || 0} unexpected, ${counts.flaky || 0} flaky).`);
    return;
  }

  // A plain log line, deliberately not an annotation: GitHub only renders a handful
  // of annotations per step, and the tally would spend one of those slots on
  // something each individual annotation already says.
  console.log(`${failures.length} failing test(s): ${counts.unexpected || failures.length} unexpected, ${counts.flaky || 0} flaky`);

  for (const failure of failures.slice(0, MAX_ANNOTATIONS)) {
    // file/line are carried on the annotation, not just in the title, so a failure is
    // anchored to the spec that produced it in the diff view. Without them GitHub still
    // renders the note, but only as free-floating text with nothing to click.
    const title = `e2e: ${failure.title} (${failure.file}:${failure.line})`;
    console.log(
      `::error file=${escapeCommand(failure.path, { isProperty: true })},` +
        `line=${escapeCommand(failure.line, { isProperty: true })},` +
        `title=${escapeCommand(title, { isProperty: true })}::` +
        escapeCommand(failure.message, { isProperty: false })
    );
  }

  if (failures.length > MAX_ANNOTATIONS) {
    const rest = failures.slice(MAX_ANNOTATIONS).map((f) => `${f.file}:${f.line} ${f.title}`).join(' | ');
    console.log(`::error title=e2e (+${failures.length - MAX_ANNOTATIONS} more)::${escapeCommand(rest, { isProperty: false })}`);
  }

  // Full detail for whoever opens the run.
  const summary = [
    `### e2e: ${failures.length} failing`,
    '',
    ...failures.map((f) => `- \`${f.file}:${f.line}\` **${f.title}** — ${f.message}`),
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
}

main();
