const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const { computeResumeScore, CATEGORIES } = require('../services/resumeScoreService');

// The frontend owns every word in a finding: the scorer emits codes because it
// has no idea whether the user is on the English or French UI. That contract is
// only worth anything if the translations actually exist, so these tests assert
// it against the real locale files rather than trusting a human to remember.
//
// Same approach as draftController.test.js: there is no frontend test runner, so
// the wire-format contract is asserted from here.

const ROOT = path.join(__dirname, '..', '..');
const locale = (lang) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'locales', lang, 'tailor.json'), 'utf8')
);
const SERVICE_SRC = fs.readFileSync(
  path.join(ROOT, 'backend', 'services', 'resumeScoreService.js'), 'utf8');

const EN = locale('en');
const FR = locale('fr');

const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// Harvested from the source rather than hand-listed, so a new finding code fails
// these tests instead of silently shipping untranslated.
function allCodes() {
  const codes = new Set([...SERVICE_SRC.matchAll(/code: '([a-z_.]+)'/g)].map(m => m[1]));
  // The contact findings are built from a template over a field list.
  if (/code: `contact\.missing_\$\{field\}`/.test(SERVICE_SRC)) {
    ['email', 'phone', 'location', 'linkedin'].forEach(f => codes.add(`contact.missing_${f}`));
  }
  return [...codes].sort();
}

const varsOf = (s) => [...new Set([...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort();

test('every finding code the scorer can emit is translated in both languages', () => {
  const codes = allCodes();
  assert.ok(codes.length >= 20, `expected the full code set, found ${codes.length}`);

  codes.forEach(code => {
    const key = `resumeScore.findings.${code}`;
    assert.strictEqual(typeof dig(EN, key), 'string', `en is missing ${key}`);
    assert.strictEqual(typeof dig(FR, key), 'string', `fr is missing ${key}`);
  });
});

test('EN and FR use the same interpolation variables for the same finding', () => {
  allCodes().forEach(code => {
    const key = `resumeScore.findings.${code}`;
    assert.deepStrictEqual(
      varsOf(dig(FR, key)), varsOf(dig(EN, key)),
      `${code}: fr and en placeholders differ, so French will leak "{{count}}"`
    );
  });
});

test('the params the scorer sends are the ones the translations interpolate', () => {
  // Catches the reverse drift: a translation waiting on {{words}} when the
  // finding never carries it, which renders as a literal "{{words}}".
  //
  // Param keys are read by brace matching rather than a fixed-width window, and
  // a key is the part before the colon, so `params: { words, target: t.max }`
  // yields ['words', 'target'] rather than matching on the {{}} syntax that only
  // appears in the translated strings.
  const paramsFor = (code) => {
    const at = SERVICE_SRC.indexOf(`code: '${code}'`);
    if (at === -1) return null;
    const from = SERVICE_SRC.indexOf('params:', at);
    if (from === -1 || from - at > 240) return null;
    const open = SERVICE_SRC.indexOf('{', from);
    let depth = 0;
    for (let i = open; i < SERVICE_SRC.length; i++) {
      if (SERVICE_SRC[i] === '{') depth++;
      else if (SERVICE_SRC[i] === '}') {
        depth--;
        if (depth === 0) {
          return SERVICE_SRC.slice(open + 1, i)
            .split(',')
            .map(part => part.split(':')[0].trim())
            .filter(k => /^\w+$/.test(k))
            .sort();
        }
      }
    }
    return null;
  };

  allCodes().forEach(code => {
    const sent = paramsFor(code);
    if (sent === null) return; // finding carries no params of its own
    varsOf(dig(EN, `resumeScore.findings.${code}`)).forEach(v => {
      assert.ok(sent.includes(v), `${code}: translation expects {{${v}}} but the finding sends [${sent}]`);
    });
  });
});

test('every category has a translated label', () => {
  CATEGORIES.forEach(({ key }) => {
    assert.strictEqual(typeof dig(EN, `resumeScore.categories.${key}`), 'string', `en label for ${key}`);
    assert.strictEqual(typeof dig(FR, `resumeScore.categories.${key}`), 'string', `fr label for ${key}`);
  });
});

test('the keys the component falls back to exist', () => {
  // ResumeScoreCard.jsx renders these with inline English defaults, so a missing
  // key would show English inside the French UI with no build-time warning.
  ['title', 'subtitle', 'calculating', 'rescore', 'failed', 'generic_finding',
   'noFindings', 'findingsTitle', 'points', 'outOf']
    .forEach(k => {
      assert.strictEqual(typeof dig(EN, `resumeScore.${k}`), 'string', `en resumeScore.${k}`);
      assert.strictEqual(typeof dig(FR, `resumeScore.${k}`), 'string', `fr resumeScore.${k}`);
    });
  ['categories', 'findings'].forEach(k => {
    assert.strictEqual(typeof dig(EN, `resumeScore.${k}`), 'object', `en resumeScore.${k}`);
    assert.strictEqual(typeof dig(FR, `resumeScore.${k}`), 'object', `fr resumeScore.${k}`);
  });
});

test('the endpoint the card posts to is the one that needs no job description', () => {
  const card = fs.readFileSync(
    path.join(ROOT, 'frontend', 'src', 'components', 'ResumeScoreCard.jsx'), 'utf8');
  assert.ok(card.includes("api.post('/score/resume'"), 'card must post to /score/resume');
  // The old endpoint 400s without a job description, which is the entire bug.
  assert.ok(!card.includes("api.post('/score'"), 'card must not post to /score');
  assert.ok(!/jobDescription/.test(card), 'the card must not depend on a job description');
});

test('both cards are rendered in the gaps tab, and the quality one is not gated', () => {
  const resultStep = fs.readFileSync(
    path.join(ROOT, 'frontend', 'src', 'components', 'ResultStep.jsx'), 'utf8');
  assert.ok(resultStep.includes('<ResumeScoreCard'), 'ResumeScoreCard must be rendered');
  assert.ok(resultStep.includes('<ATSScoreCard'), 'ATSScoreCard must still be rendered');
  // ResumeScoreCard takes no jobDescription prop, which is what keeps it
  // available on the skip-the-job-description path.
  const usage = resultStep.slice(resultStep.indexOf('<ResumeScoreCard'));
  const props = usage.slice(0, usage.indexOf('/>'));
  assert.ok(!props.includes('jobDescription'), 'ResumeScoreCard must not be gated on a job description');
});

test('the route exists alongside the original, not in place of it', () => {
  const routes = fs.readFileSync(path.join(ROOT, 'backend', 'routes', 'score.js'), 'utf8');
  assert.ok(routes.includes("router.post('/'"), '/api/score must remain for job-match scoring');
  assert.ok(routes.includes("router.post('/resume'"), '/api/score/resume must be mounted');
  // Mounted behind the same auth as its sibling. Counting occurrences of the
  // identifier would be wrong -- it appears twice on its own import line.
  const registered = routes.split('\n').filter(l => /router\.post\(/.test(l));
  assert.strictEqual(registered.length, 2, `expected two score routes, saw:\n${registered.join('\n')}`);
  registered.forEach(line => {
    assert.ok(/requireAuth/.test(line), `unauthenticated score route: ${line.trim()}`);
  });
});

test('a report actually produced for a bad CV can be localised end to end', () => {
  // Drives the real service, collects every code it emitted, and looks each one
  // up in both locales -- so the guarantee holds for codes reached at runtime,
  // not only for the ones the source scan finds.
  const samples = [
    '',
    'Jane Doe',
    'EXPERIENCE\n- Responsible for things and worked on other things here.',
    Array.from({ length: 60 }, (_, i) => `- bullet ${i}`).join('\n'),
    'SUMMARY\n' + 'a very long sentence that goes on and on and never quite ends '.repeat(12),
    'RÉSUMÉ\nIngénieur.\n\nEXPÉRIENCE\n- Réduit la latence de 40% sur 3 services.'
  ];
  const emitted = new Set();
  samples.forEach(s => {
    computeResumeScore(s).categories.forEach(c => c.findings.forEach(f => emitted.add(f.code)));
  });

  assert.ok(emitted.size >= 8, `expected a broad spread of codes, got ${emitted.size}`);
  emitted.forEach(code => {
    const key = `resumeScore.findings.${code}`;
    assert.strictEqual(typeof dig(EN, key), 'string', `en missing ${key}`);
    assert.strictEqual(typeof dig(FR, key), 'string', `fr missing ${key}`);
  });
});