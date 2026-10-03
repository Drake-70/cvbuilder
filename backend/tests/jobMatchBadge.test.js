const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// The per-job match badge.
//
// A badge on a job board is a claim about the user, made without them asking and
// with no AI in the loop. So the three ways it can mislead -- scoring an absent
// CV, scoring a posting too thin to judge, and scoring one CV while implying
// another -- are asserted here against the real source.

const ROOT = path.join(__dirname, '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const badge = src('frontend/src/components/MatchBadge.jsx');
const card = src('frontend/src/components/JobCard.jsx');
const board = src('frontend/src/pages/JobsPage.jsx');
const detail = src('frontend/src/pages/JobDetailPage.jsx');
const controller = src('backend/controllers/jobController.js');
const routes = src('backend/routes/jobs.js');

const locale = (lang) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'locales', lang, 'jobs.json'), 'utf8')
);
const EN = locale('en');
const FR = locale('fr');
const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

test('no score means no badge, in every one of the three no-score cases', () => {
  // Signed out, no saved CV, and a posting too thin to judge are three different
  // situations, and none of them is a low match. A badge that sometimes means
  // "poor fit" and sometimes means "we could not tell" is worse than silence.
  assert.ok(/if \(!match \|\| match\.insufficient \|\| typeof match\.score !== 'number'\) return null;/.test(badge));
  // The null score is the server's, not a client-side guess at a threshold.
  assert.ok(/MIN_JOB_KEYWORDS/.test(src('backend/services/scoreService.js')));
  assert.ok(/insufficient: true/.test(src('backend/services/scoreService.js')));
});

test('the board asks for every visible job in one request', () => {
  // 12-50 listings per page. One request each would mean up to 50 round trips plus
  // 50 CV lookups to draw a screen of badges.
  assert.ok(board.includes("api.post('/jobs/match', { jobIds: jobKey.split(',') })"));
  assert.ok(!/jobs\/match\/\$\{/.test(board), 'no per-job request path');
  assert.ok(routes.includes("router.post('/match', requireAuth, jobController.matchJobs)"));
});

test('the match endpoint requires a session', () => {
  // It reads the user's saved CV. Without auth it would score an arbitrary one,
  // or someone's else's.
  assert.ok(/router\.post\('\/match', requireAuth/.test(routes));
  assert.ok(/if \(!cv\)/.test(controller));
  assert.ok(/code: 'no_cv'/.test(controller), 'the no-CV case must be distinguishable by the client');
});

test('the batch is bounded', () => {
  assert.ok(/MAX_MATCH_JOBS = 50/.test(controller));
  assert.ok(/ids\.length > MAX_MATCH_JOBS/.test(controller));
  // And the ids are validated before they reach Mongo: an unvalidated _id is a
  // CastError, which would surface as a 500 on a malformed query.
  assert.ok(/isValid\(id\)/.test(controller));
});

test('the CV being scored is returned, never chosen silently', () => {
  // Which CV is scored changes the number. Taking the newest without saying so
  // would let the badge shift under the user with no explanation.
  assert.ok(/cv: \{ id: String\(cv\._id\), label:/.test(controller));
  assert.ok(/matchCv\?\.label/.test(board));
  assert.ok(/cvLabel=\{matchCv\?\.label\}/.test(detail));
  // An explicit choice is honoured.
  assert.ok(/cvId\s*\n?\s*\? await CV\.findOne\(\{ _id: cvId, userId: req\.user\._id \}\)/.test(controller));
});

test('the board and the detail page share one scorer', () => {
  // Both call /jobs/match. A second calculation path would let the two disagree
  // about the same CV and the same posting.
  assert.ok(board.includes("api.post('/jobs/match'"));
  assert.ok(detail.includes("api.post('/jobs/match'"));
  assert.strictEqual(
    (src('backend/controllers/jobController.js').match(/computeJobMatchScore\(cv\.originalText, job\.description\)/g) || []).length,
    1,
    'exactly one place turns a CV and a posting into a score'
  );
});

test('the badge never renders a placeholder sub-score as a measurement', () => {
  // When the posting names no known skills the server sends skills: null. Showing
  // that as 0% or as a bar would be a number the data does not contain.
  assert.ok(/match\.breakdown\.skills !== null/.test(badge));
  assert.ok(/breakdown\.skills = null|skillsScore = null|skills: null/.test(src('backend/services/scoreService.js')));
});

test('the badge says what the number is not', () => {
  // It is vocabulary overlap. A user who reads 80 as "I am right for this job" has
  // been misled, so the caveat travels with the number rather than in a tooltip
  // nobody opens.
  assert.ok(/match\.what_it_means/.test(badge));
  assert.ok(/match\.against/.test(badge));
});

test('a clipped keyword list is disclosed', () => {
  assert.ok(/keywords\.truncated/.test(badge));
  assert.ok(/list_truncated/.test(badge));
});

test('the badge bands match the tailor path, so one reading serves both', () => {
  // JobDescriptionStep already shows a live keyword check at 70 / 40. Two sets of
  // bands for the same idea would make "strong match" mean two things.
  const step = src('frontend/src/components/JobDescriptionStep.jsx');
  const boardBands = badge.match(/const (STRONG|DECENT) = (\d+);/g).join(' ');
  assert.ok(boardBands.includes('STRONG = 70'));
  assert.ok(boardBands.includes('DECENT = 40'));
  assert.ok(/match\.pct >= 70/.test(step) && /match\.pct >= 40/.test(step));
});

test('a match failure leaves the board intact', () => {
  // The badge is an extra. Failing it must not blank the job list.
  assert.ok(/\.catch\(\(\) => \{/.test(board));
  assert.ok(/setMatches\(null\)/.test(board));
  assert.ok(!/setError/.test(board), 'a badge failure is not a page error');
});

test('every match key the badge uses exists in both languages', () => {
  const used = [...badge.matchAll(/t?\('match\.([a-z_]+)/g)].map(m => m[1]);
  assert.ok(used.length >= 8, `expected a full key set, found ${used.length}`);

  // A key may be a plain string or an i18next plural pair, which is why
  // `and_more` resolves to `_one`/`_other` rather than to itself.
  const translated = (lang, key) => {
    if (typeof dig(lang, `match.${key}`) === 'string') return true;
    return ['_one', '_other'].every(suffix =>
      typeof dig(lang, `match.${key}${suffix}`) === 'string');
  };

  [...new Set(used)].forEach(key => {
    assert.ok(translated(EN, key), `en match.${key}`);
    assert.ok(translated(FR, key), `fr match.${key}`);
  });
});

test('EN and FR interpolate the same variables', () => {
  const varsOf = (s) => [...new Set([...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort();
  ['keywords_covered', 'skills_covered', 'against', 'and_more_other']
    .forEach(key => {
      assert.deepStrictEqual(varsOf(dig(FR, `match.${key}`)), varsOf(dig(EN, `match.${key}`)),
        `match.${key}: placeholder mismatch`);
    });
  // The counts the badge interpolates are the ones the server actually sends.
  assert.ok(/keywords_covered[\s\S]{0,120}covered: matchedKeywords[\s\S]{0,80}total: jdKeywords/.test(badge));
  assert.ok(/skills_covered[\s\S]{0,160}covered: match\.counts\.matchedSkills[\s\S]{0,80}total: match\.counts\.jdSkills/.test(badge));
  assert.ok(/against', \{ cv: cvLabel/.test(badge));
});

test('the card accepts a match without requiring one', () => {
  // Signed out, every card renders without it -- so it cannot be a required prop.
  assert.ok(/match, cvLabel \} = \{\}/.test(card) || /match,/.test(card));
  assert.ok(!/match\.score/.test(card), 'the card delegates all rendering to the badge');
  assert.ok(card.includes('<MatchBadge match={match}'));
});

test('an applied badge and a match badge do not collide', () => {
  // Two absolutely-positioned pills in the same corner is the failure this
  // grouping avoids.
  assert.ok(/\(applied \|\| match\) && \(/.test(card));
  assert.ok(/flex-shrink-0 flex flex-col items-end gap-1/.test(card));
});