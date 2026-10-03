const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// The wire contract for bullet-level approval.
//
// The pairing is decided on the server and consumed on the client, so the two
// halves have to agree exactly on three things: the shape of a proposal, which
// coordinate identifies one, and which key the panel writes through. A mismatch
// does not throw -- it rewrites the wrong line of someone's CV -- so it is
// asserted here rather than discovered in use.
//
// There is no frontend test runner, so this reads the real source files.

const ROOT = path.join(__dirname, '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const buildStep = src('frontend/src/components/BuildStep.jsx');
const panel = src('frontend/src/components/BulletApproval.jsx');
const controller = src('backend/controllers/cvController.js');

const locale = (lang) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'locales', lang, 'tailor.json'), 'utf8')
);
const EN = locale('en');
const FR = locale('fr');
const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

test('the response is a paired proposal list, not a replacement document', () => {
  // The old response was a whole CV object with `nonTraditionalExperience`, which
  // the client dropped straight into the form.
  const handler = controller.slice(
    controller.indexOf('exports.expandBullets'),
    controller.indexOf('exports.save')
  );
  assert.ok(/res\.json\(\{/.test(handler));
  assert.ok(/proposals: proposals\.map/.test(handler));
  assert.ok(!/nonTraditionalExperience/.test(handler),
    'the response must be proposals, not a rewritten CV to overwrite the form with');
});

test('each proposal carries both sides of the change', () => {
  const handler = controller.slice(
    controller.indexOf('exports.expandBullets'),
    controller.indexOf('exports.save')
  );
  ['before:', 'after:', 'index:'].forEach(field => {
    assert.ok(handler.includes(field), `proposal must expose ${field}`);
  });
  // The service emits `original`/`expanded`; the wire contract renames them to
  // `before`/`after` so the client speaks the same vocabulary as the tailoring
  // diff. Asserted in both directions so the rename cannot drift apart.
  assert.ok(/before: p\.original/.test(handler));
  assert.ok(/after: p\.expanded/.test(handler));
});

test('the client reads proposals, never a CV it can overwrite the form with', () => {
  const handler = buildStep.slice(
    buildStep.indexOf('const handleExpandBullets'),
    buildStep.indexOf('const handleApplyBullets')
  );
  assert.ok(/\/cv\/expand-bullets/.test(handler));
  assert.ok(/res\.data\?\.proposals/.test(handler));
  assert.ok(!/nonTraditionalExperience/.test(handler),
    'the client must not assign model output straight into the form');
  // The write is gated on Apply, not on the response arriving.
  assert.ok(!/setNonTraditional/.test(handler),
    'the response must not touch the form');
});

test('the panel is keyed by position, which is the coordinate applyProposals uses', () => {
  // applyProposals walks the rows consuming an index per filled row, so position
  // is the coordinate of the write. Keying acceptance off the server's own
  // `index` would be a second pairing that can disagree with the first.
  assert.ok(/position: i/.test(panel));
  assert.ok(/accepted\.has\(row\.position\)/.test(panel));
  assert.ok(/onToggle\(row\.position\)/.test(panel));
  assert.ok(!/accepted\.has\(row\.index\)/.test(panel));
});

test('a proposal the model declined is shown as kept, not hidden', () => {
  // Hiding it would read as "this line is gone".
  assert.ok(/classifyProposal/.test(panel));
  assert.ok(/SKIPPED/.test(panel));
  assert.ok(/left_as_written/.test(panel));
  assert.ok(/row\.before/.test(panel), 'the original is still shown');
});

test('a failed expansion is no longer silent', () => {
  // The old handler caught and returned nothing, so a failure looked exactly like
  // a button that does nothing.
  const handler = buildStep.slice(
    buildStep.indexOf('const handleExpandBullets'),
    buildStep.indexOf('const handleApplyBullets')
  );
  assert.ok(/catch \(err\)/.test(handler));
  assert.ok(/setExpandError/.test(handler));
  assert.ok(!/catch\s*\{\s*\}/.test(buildStep), 'no empty catch left in the step');
  // And the error reaches the user even when there is nothing to review, which is
  // the case where the panel would otherwise be absent entirely.
  assert.ok(/!rows\.length/.test(panel));
  assert.ok(/error/.test(panel));
});

test('applying is explicit and discardable', () => {
  assert.ok(/const handleApplyBullets = \(\) =>/.test(buildStep));
  assert.ok(/const handleDiscardBullets = \(\) =>/.test(buildStep));
  assert.ok(/applyProposals\(nonTraditional, bulletProposals, acceptedBullets\)/.test(buildStep));
  // Discarding must leave the form exactly as it was.
  const discard = buildStep.slice(
    buildStep.indexOf('const handleDiscardBullets'),
    buildStep.indexOf('const toggleBullet')
  );
  assert.ok(!/setNonTraditional/.test(discard));
});

test('every bulletReview key the panel uses exists in both languages', () => {
  const used = [...panel.matchAll(/bulletReview\.([a-z_]+)/g)].map(m => m[1]);
  assert.ok(used.length >= 8, `expected a full key set, found ${used.length}`);

  // A key may be a plain string or an i18next plural pair, which is why
  // `skipped_note` resolves to `_one`/`_other` rather than to itself.
  const translated = (lang, key) => {
    if (typeof dig(lang, `bulletReview.${key}`) === 'string') return true;
    return ['_one', '_other'].every(suffix =>
      typeof dig(lang, `bulletReview.${key}${suffix}`) === 'string');
  };

  [...new Set(used)].forEach(key => {
    assert.ok(translated(EN, key), `en bulletReview.${key}`);
    assert.ok(translated(FR, key), `fr bulletReview.${key}`);
  });
});

test('the plural note exists as a pair in both languages', () => {
  const varsOf = (s) => [...new Set([...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort();
  ['skipped_note_one', 'skipped_note_other'].forEach(key => {
    assert.strictEqual(typeof dig(EN, `bulletReview.${key}`), 'string', `en bulletReview.${key}`);
    assert.strictEqual(typeof dig(FR, `bulletReview.${key}`), 'string', `fr bulletReview.${key}`);
  });
  assert.deepStrictEqual(
    varsOf(dig(FR, 'bulletReview.skipped_note_other')),
    varsOf(dig(EN, 'bulletReview.skipped_note_other'))
  );
  assert.deepStrictEqual(varsOf(dig(FR, 'bulletReview.skipped_note_one')), [],
    'a count of 1 needs no placeholder');
});

test('the failure message exists in both languages', () => {
  assert.strictEqual(typeof EN.expand_failed, 'string');
  assert.strictEqual(typeof FR.expand_failed, 'string');
  assert.ok(buildStep.includes("t('expand_failed')"));
});