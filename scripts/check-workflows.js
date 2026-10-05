/**
 * Rejects workflow files that GitHub Actions will refuse to load.
 *
 * Why: an unrecognised key does not fail the run -- GitHub discards the whole file,
 * the workflow silently stops firing on its schedule, and CI stays green because a
 * workflow that never loads produces no runs to fail. jobs-scrape.yml sat that way
 * for four days: a workflow-level `timeout-minutes` is not a real key, so the
 * 6-hourly scrape stopped without a single failed check. Nothing else in this repo
 * would have noticed.
 *
 * Only the key *vocabulary* is checked, not the semantics. This is not a substitute
 * for GitHub's own validation, just the cheapest check that catches the mistake
 * which fails silently rather than loudly.
 *
 * Allow-lists are from the workflow-syntax reference:
 *   https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
 *
 * Usage: node scripts/check-workflows.js [workflow-dir]
 */

const fs = require('fs');
const path = require('path');
const YAML = require('yaml');

const WORKFLOW_DIR = path.resolve(process.argv[2] || path.join(__dirname, '..', '.github', 'workflows'));

// As documented. `on` is matched leniently below, because a YAML 1.1 parser reads a
// bare `on:` key as the boolean true.
const TOP_LEVEL_KEYS = new Set([
  'name',
  'run-name',
  'on',
  'permissions',
  'env',
  'defaults',
  'concurrency',
  'jobs',
]);

const JOB_KEYS = new Set([
  'name',
  'permissions',
  'needs',
  'if',
  'runs-on',
  'environment',
  'concurrency',
  'outputs',
  'env',
  'defaults',
  'steps',
  'timeout-minutes',
  'strategy',
  'continue-on-error',
  'container',
  'services',
  'uses',
  'with',
  'secrets',
]);

const REUSABLE_WORKFLOW_JOB_KEYS = new Set(['name', 'uses', 'with', 'secrets', 'needs', 'if', 'permissions', 'strategy', 'concurrency']);

function unknownKeys(object, allowed) {
  return Object.keys(object || {}).filter((key) => !allowed.has(key));
}

function checkFile(file) {
  const problems = [];
  let doc;

  try {
    doc = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    return [`does not parse: ${err.message.split('\n')[0]}`];
  }

  if (!doc || typeof doc !== 'object') return ['is empty or not a mapping'];

  for (const key of unknownKeys(doc, TOP_LEVEL_KEYS)) {
    problems.push(
      `top-level key "${key}" is not a workflow key. GitHub discards the whole file for this, ` +
        'so the workflow stops running silently. (timeout-minutes is jobs.<id>.timeout-minutes, not top level.)'
    );
  }

  // `on:` parses to the boolean true under YAML 1.1 rules. That is a quirk of the
  // parser, not a broken file, so it is rewritten rather than reported.
  if (doc.true !== undefined && doc.on === undefined) {
    problems.push('"on:" was parsed as the boolean true; quote it as "on:" with an explicit key or the triggers may be misread');
  }

  if (!doc.jobs || typeof doc.jobs !== 'object') {
    problems.push('has no "jobs" mapping');
    return problems;
  }

  for (const [jobId, job] of Object.entries(doc.jobs)) {
    if (!job || typeof job !== 'object') {
      problems.push(`job "${jobId}" is not a mapping`);
      continue;
    }
    // A `uses:` job calls a reusable workflow and accepts a smaller key set.
    const allowed = job.uses ? REUSABLE_WORKFLOW_JOB_KEYS : JOB_KEYS;
    for (const key of unknownKeys(job, allowed)) {
      problems.push(`job "${jobId}" has unrecognised key "${key}"`);
    }
  }

  return problems;
}

function main() {
  if (!fs.existsSync(WORKFLOW_DIR)) {
    console.log(`No ${WORKFLOW_DIR}; nothing to check.`);
    return;
  }

  const files = fs
    .readdirSync(WORKFLOW_DIR)
    .filter((name) => /\.ya?ml$/.test(name))
    .map((name) => path.join(WORKFLOW_DIR, name))
    // Skip reusable workflows: they use `on.workflow_call`, which is a different
    // shape from the triggers validated above.
    .filter((file) => !fs.readFileSync(file, 'utf8').includes('workflow_call:'))
    .sort();

  if (files.length === 0) {
    console.log('No workflow files to check.');
    return;
  }

  let failed = 0;
  for (const file of files) {
    const problems = checkFile(file);
    const name = path.basename(file);
    if (problems.length === 0) {
      console.log(`ok    ${name}`);
      continue;
    }
    failed++;
    console.log(`FAIL  ${name}`);
    for (const problem of problems) console.log(`        ${problem}`);
  }

  if (failed > 0) {
    console.log(
      `\n${failed} workflow file(s) would be rejected by GitHub. An invalid workflow does not fail any ` +
        'check -- it just stops running, so this has to be caught here.'
    );
    process.exitCode = 1;
    return;
  }
  console.log('\nall workflow files load');
}

main();
