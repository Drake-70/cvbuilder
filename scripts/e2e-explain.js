/**
 * Explains a failed Playwright *step* from the run log, as check-run annotations.
 *
 * Why this is separate from scripts/e2e-failures.js: that script reads the JSON report,
 * which only exists once Playwright has collected and run tests. A failure before that --
 * a config error, a port already bound, a webServer process that exited -- produces no
 * report at all, so the reporter has nothing to say and the job goes red with no
 * explanation anywhere except the run log. Run logs are not readable without
 * permissions on the repository, so for anyone else a red e2e job is just a red e2e job.
 *
 * Annotations are readable from the commit/PR view by anyone who can see the repo, so
 * this is where an infrastructure failure has to be reported from.
 *
 * Reads the captured log from argv[2] or e2e-run.log. Always exits 0: reporting a
 * failure must not itself fail a step and mask the real exit code.
 */

const fs = require('fs');

const LOG_PATH = process.argv[2] || 'e2e-run.log';

// GitHub renders only a handful of annotations per step, so this is a small budget
// spent on distinct causes rather than on one line per occurrence.
const MAX_ANNOTATIONS = 5;
const MAX_MESSAGE = 800;
const TAIL_LINES = 40;

/**
 * Lines worth reporting, and why.
 *
 * The list-reporter output is deliberately not the signal: a passing run prints no
 * "✘" lines, and a run that aborted early may print none either, so their absence
 * proves nothing. These are the shapes Playwright uses for the failures that happen
 * before or outside a test assertion.
 */
const SIGNALS = [
  { re: /Timed out waiting \d+ms from config\.webServer/, what: 'webServer timeout' },
  { re: /Process from config\.webServer was not able to start/i, what: 'webServer exit' },
  { re: /EADDRINUSE/, what: 'port in use' },
  { re: /ECONNREFUSED/, what: 'connection refused' },
  { re: /No tests found/i, what: 'no tests collected' },
  { re: /browserType\.launch/, what: 'browser launch' },
  { re: /Executable doesn'?t exist|Please run the following command/i, what: 'browser not installed' },
  { re: /Cannot find module|is not installed|ERR_MODULE_NOT_FOUND/, what: 'missing dependency' },
  { re: /✘|✗/, what: 'failed test' },
];

function readLog() {
  try {
    return fs.readFileSync(LOG_PATH, 'utf8');
  } catch (err) {
    return null;
  }
}

/** Strips the [WebServer] prefix Playwright puts on forwarded server output. */
function normalise(line) {
  return line.replace(/^\[WebServer\]\s*/, '').trimEnd();
}

/** Longest-first, so a specific line is not reported merely for also matching a generic one. */
function classify(line) {
  const hit = SIGNALS.find((s) => s.re.test(line));
  return hit ? hit.what : null;
}

function clip(text) {
  const flat = String(text).replace(/\r/g, '');
  return flat.length > MAX_MESSAGE ? `${flat.slice(0, MAX_MESSAGE - 3)}...` : flat;
}

/**
 * Picks the reportable lines.
 *
 * Last occurrence wins for each cause, because a retry prints the same error three
 * times and the final one is the verdict. Ordering is by first appearance so the
 * earliest cause -- usually the real one -- stays at the top.
 */
function pickSignals(lines) {
  const byCause = new Map();
  for (const line of lines) {
    const what = classify(line);
    if (what) byCause.set(what, line);
  }
  return [...byCause.entries()];
}

function main() {
  const raw = readLog();

  if (raw === null) {
    console.log(
      `::error title=e2e step failed::No run log was captured at ${LOG_PATH}, so the ` +
        'reason the step failed is not in this check run. The step that runs Playwright ' +
        'must tee its output to that path.'
    );
    return;
  }

  const lines = raw.split(/\r?\n/);

  // 3 lines of context per signal: the message, then whatever Expected/Received detail
  // follows it, which is where the actionable part of a Playwright error lives.
  const signals = [];
  for (const [what, line] of pickSignals(lines)) {
    const at = lines.indexOf(line);
    const context = lines.slice(at, at + 3).map(normalise).filter(Boolean);
    signals.push({ what, text: clip(context.join('\n')) });
    if (signals.length >= MAX_ANNOTATIONS) break;
  }

  if (signals.length === 0) {
    signals.push({
      what: 'unrecognised',
      text: clip(
        `The run log at ${LOG_PATH} matched none of the known failure shapes, so this ` +
          'is its tail:\n' +
          lines.slice(-TAIL_LINES).map(normalise).join('\n')
      ),
    });
  }

  for (const signal of signals) {
    console.log(`::error title=e2e step failed (${signal.what})::${signal.text.replace(/\n/g, '%0A')}`);
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const tail = lines
      .slice(-TAIL_LINES)
      .map(normalise)
      .join('\n');
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### e2e step: tail of ${LOG_PATH}\n\n\`\`\`\n${tail}\n\`\`\`\n`
    );
  }
}

main();