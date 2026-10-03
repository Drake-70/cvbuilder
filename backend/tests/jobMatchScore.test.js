const test = require('node:test');
const assert = require('node:assert');
const {
  computeJobMatchScore,
  computeATSScore,
  MIN_JOB_KEYWORDS,
  MAX_LISTED_KEYWORDS
} = require('../services/scoreService');

// The job-board badge. Every case below is a case where the obvious reuse of
// computeATSScore would put a number on screen that the data does not support.

const RICH_JD = `We are hiring a backend engineer to join our platform team.
You will work on our payments service in Python and PostgreSQL, and help us
migrate the reporting jobs off a legacy system. The stack is Python, Django,
Celery and Redis, deployed on AWS. We use Docker and Kubernetes for deployment.
You will mentor two junior developers and review their pull requests.
Strong problem solving skills and clear written communication are essential.
Experience with PostgreSQL query optimisation is a plus.
We want someone who can own a service end to end, from design to on-call.
Salary is negotiable depending on experience.`;

const RICH_CV = `Backend engineer with six years of Python and Django.
Built a payments service in Python on AWS, with PostgreSQL and Celery.
Ran the migration of reporting jobs off a legacy system, cutting batch time 60%.
Deployed with Docker and Kubernetes, and joined the on-call rotation.
Mentored two junior developers and reviewed their pull requests.
Known for clear written communication and pragmatic problem solving.
Optimised PostgreSQL queries, cutting p99 latency by 40%.`;

test('an aligned CV scores high and an unrelated one scores low', () => {
  const strong = computeJobMatchScore(RICH_CV, RICH_JD);
  const weak = computeJobMatchScore('Waitress. Served customers and cleaned tables.', RICH_JD);

  assert.strictEqual(strong.insufficient, false);
  assert.ok(strong.score >= 70, `expected a strong match, got ${strong.score}`);
  assert.ok(weak.score <= 30, `expected a weak match, got ${weak.score}`);
  assert.ok(strong.score > weak.score);
});

test('a thin posting gets no score at all', () => {
  // One match out of five keywords is 20% and the figure is mostly a property of
  // how the ad was written. A badge is rendered instead of nothing, so anything
  // weak enough to be noise has to be refused.
  const thin = computeJobMatchScore(RICH_CV, 'Hiring a Python developer. Send CV.');
  assert.strictEqual(thin.score, null);
  assert.strictEqual(thin.insufficient, true);
  assert.strictEqual(thin.breakdown.keywords, null);
  assert.strictEqual(thin.breakdown.skills, null);
  assert.deepStrictEqual(thin.keywords.matched, []);
  // The counts still come back, so the UI can explain the refusal rather than
  // just going blank.
  assert.ok(thin.counts.jdKeywords > 0);
  assert.ok(thin.counts.jdKeywords < MIN_JOB_KEYWORDS);
});

test('a posting just under the threshold is refused, just over is scored', () => {
  const build = (n) => Array.from({ length: n }, (_, i) => `quuxword${i}`).join(' ');
  const under = computeJobMatchScore(RICH_CV, build(MIN_JOB_KEYWORDS - 1));
  const over = computeJobMatchScore(RICH_CV, build(MIN_JOB_KEYWORDS));
  assert.strictEqual(under.score, null);
  assert.notStrictEqual(over.score, null);
  assert.strictEqual(over.score, 0, 'a CV matching none of them scores zero');
});

test('the ATS scorer would have been wrong for this input', () => {
  // This is the reason for a separate function. Structure reads a tailored CV and
  // gaps reads a gap analysis; on the board neither exists, so both collapse to a
  // constant and drag every user's badge in the same direction.
  const ats = computeATSScore(RICH_CV, RICH_JD, null, []);
  assert.strictEqual(ats.breakdown.structure, 0, 'structure is 0 with no tailored CV');
  assert.strictEqual(ats.breakdown.gaps, 100, 'gaps is a free 100 with no gap analysis');

  const match = computeJobMatchScore(RICH_CV, RICH_JD);
  assert.ok(match.score > ats.score,
    'the ATS scorer penalises a good CV purely for not having been tailored yet');
});

test('skills are dropped from the score when the posting names none', () => {
  // A placeholder number in the breakdown would be read as a measurement. The
  // posting is built from words deliberately absent from the known-skill list, so
  // "names no skills" is a property of the fixture rather than of chance.
  const nonSkill = ['office', 'department', 'reports', 'colleagues', 'visitor',
    'counter', 'shelves', 'till', 'roster', 'weekends', 'stock', 'orders',
    'deliveries', 'returns', 'shifts', 'supervisor'];
  const result = computeJobMatchScore(RICH_CV, nonSkill.join(' and '));
  assert.strictEqual(result.counts.jdSkills, 0, 'fixture must name no known skill');
  assert.strictEqual(result.counts.jdKeywords, nonSkill.length, 'none may be stopwords');
  assert.strictEqual(result.breakdown.skills, null);
  assert.notStrictEqual(result.score, null, 'keywords alone still carry a score');
  assert.strictEqual(result.score, result.breakdown.keywords);
});

test('skills do count when the posting names some', () => {
  const result = computeJobMatchScore(RICH_CV, RICH_JD);
  assert.ok(result.counts.jdSkills > 0);
  assert.notStrictEqual(result.breakdown.skills, null);
  assert.ok(result.matchedSkills.includes('python'));
  assert.ok(result.matchedSkills.includes('docker'));
  assert.ok(result.matchedSkills.includes('kubernetes'));
});

test('the weights are keywords 60 / skills 40', () => {
  // Asserted as arithmetic rather than a magic number, so a weight change has to
  // be deliberate. Both sub-scores must be strictly between 0 and 100 or the
  // weighting is untested.
  const result = computeJobMatchScore(RICH_CV, RICH_JD);
  assert.ok(result.breakdown.keywords > 0 && result.breakdown.keywords < 100);
  assert.ok(result.breakdown.skills > 0 && result.breakdown.skills < 100);
  assert.strictEqual(
    result.score,
    Math.round(result.breakdown.keywords * 0.6 + result.breakdown.skills * 0.4)
  );
});

test('job-ad boilerplate does not count against an untouched CV', () => {
  // The defect this caught: every posting says "hiring", "join", "team",
  // "salary" and "negotiable", and no CV contains those. Counting them made a
  // genuinely strong match read as 49%, which is a measurement of the
  // advertisement rather than of the candidate.
  const result = computeJobMatchScore(RICH_CV, RICH_JD);
  ['hiring', 'join', 'salary', 'negotiable', 'team', 'experience', 'skills']
    .forEach(word => {
      assert.ok(!result.keywords.missing.includes(word),
        `"${word}" is ad boilerplate and must not appear as a gap`);
    });
  // Vocabulary that does discriminate is still measured: present in the CV it
  // matches, absent from it the gap is reported.
  assert.ok(result.keywords.matched.includes('kubernetes'));
  assert.ok(result.keywords.matched.includes('docker'));
  assert.ok(result.keywords.missing.includes('redis'));

  // Known limitation, asserted so it stays visible: matching is whole-word, so a
  // CV that says "Optimised queries" does not satisfy "query optimisation".
  // Closing this needs stemming, which trades false positives ("manage" /
  // "manager") for these near-misses and is not a change to make silently.
  assert.ok(result.keywords.missing.includes('optimisation'));
  assert.ok(result.keywords.missing.includes('migrate'));
});

test('the score stays inside 0-100', () => {
  const identical = computeJobMatchScore(RICH_CV, RICH_CV);
  assert.strictEqual(identical.score, 100);
  const nothing = computeJobMatchScore('nothing relevant whatsoever here at all friend', RICH_JD);
  assert.ok(nothing.score >= 0);
  assert.ok(nothing.score <= 100);
});

test('an empty side is not scored as a perfect or catastrophic match', () => {
  const empty = computeJobMatchScore('', RICH_JD);
  assert.strictEqual(empty.score, 0);
  assert.strictEqual(empty.counts.cvKeywords, 0);
  assert.strictEqual(empty.counts.matchedKeywords, 0);
});

test('missing keywords are reported, and the lists are bounded honestly', () => {
  const longJd = Array.from({ length: 400 }, (_, i) => `keyword${i}`).join(' ');
  const result = computeJobMatchScore(RICH_CV, `${longJd} ${RICH_JD}`);
  assert.ok(result.counts.jdKeywords > MAX_LISTED_KEYWORDS);
  assert.strictEqual(result.keywords.missing.length, MAX_LISTED_KEYWORDS);
  assert.strictEqual(result.keywords.truncated, true,
    'a clipped list must say so rather than look complete');
});

test('an unclipped reply is not marked truncated', () => {
  assert.strictEqual(computeJobMatchScore(RICH_CV, RICH_JD).keywords.truncated, false);
});

test('the score is case-insensitive and punctuation-independent', () => {
  const shouted = computeJobMatchScore(RICH_CV.toUpperCase(), RICH_JD.toUpperCase());
  const normal = computeJobMatchScore(RICH_CV, RICH_JD);
  assert.strictEqual(shouted.score, normal.score);
  assert.deepStrictEqual(shouted.keywords.matched, normal.keywords.matched);
});

test('no AI call and no network: the function is pure', () => {
  // Asserted structurally -- anything requiring a client or a key would need a
  // mock, and a badge that can fail for reasons unrelated to the CV is not a
  // badge.
  const source = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'services', 'scoreService.js'), 'utf8'
  );
  assert.ok(!/require\(/.test(source), 'scoreService must not require anything');
  assert.ok(!/await |fetch|axios|groq/i.test(source), 'no async work in the scorer');
});