const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Review-before-save is a trust feature: the whole claim is "you can see what
// changed before it is written". These assertions hold that claim against the
// real source files, because there is no frontend test runner to do it here.

const ROOT = path.join(__dirname, '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const tailorPage = src('frontend/src/pages/TailorPage.jsx');
const resultStep = src('frontend/src/components/ResultStep.jsx');
const changeReview = src('frontend/src/components/ChangeReview.jsx');

const locale = (lang) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'locales', lang, 'tailor.json'), 'utf8')
);
const EN = locale('en');
const FR = locale('fr');
const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

test('tailoring no longer writes a document', () => {
  // The core change. generate-and-save-in-one-step is what made review cosmetic.
  const handler = tailorPage.slice(
    tailorPage.indexOf('const handleTailor'),
    tailorPage.indexOf('const handleSaveDocument')
  );
  assert.ok(handler.length > 0, 'handleTailor must be present');
  assert.ok(!/document\/save/.test(handler),
    'handleTailor must not persist; the save belongs behind the review gate');
});

test('a save failure is no longer swallowed', () => {
  // The old code caught the tailored-document save error and continued with the
  // comment "Non-critical", so a user could believe their CV was filed when it
  // was not.
  //
  // Scoped to that write on purpose: `/cv/save` persists the *original* CV and is
  // still best-effort, because `baseCvId` is optional and losing it degrades the
  // linkage rather than the document. A blanket "no best-effort saves" rule would
  // have forced that one to surface an error that means nothing to the user.
  assert.ok(!/catch\s*\{\s*\}[\s\S]{0,80}document\/save/.test(tailorPage));
  const handler = tailorPage.slice(
    tailorPage.indexOf('const handleSaveDocument'),
    tailorPage.indexOf('const handleDownload')
  );
  assert.ok(!/catch\s*\{\s*\}/.test(handler),
    'handleSaveDocument must not have an empty catch');
  // ...and the tailor path must contain no swallow at all: a catch block there
  // exists only to ignore a write that should not be happening yet.
  const tailorHandler = tailorPage.slice(
    tailorPage.indexOf('const handleTailor'),
    tailorPage.indexOf('const handleSaveDocument')
  );
  assert.ok(!/catch\s*\{/.test(tailorHandler),
    'handleTailor must not catch anything; the only failure it has to handle is its own');
});

test('the save handler rejects so the failure can be shown', () => {
  const handler = tailorPage.slice(
    tailorPage.indexOf('const handleSaveDocument'),
    tailorPage.indexOf('const handleDownload')
  );
  assert.ok(/await api\.post\('\/document\/save'/.test(handler));
  // No try/catch that swallows: the promise has to reach ChangeReview.
  assert.ok(!/try\s*\{/.test(handler), 'handleSaveDocument must not catch its own errors');
});

test('review is the default tab when a save handler is wired', () => {
  assert.ok(/useState\(onSave \? 'review' : 'cv'\)/.test(resultStep),
    'the default tab must fall back to cv when review is unavailable');
  assert.ok(/onSave \? \[\{ id: 'review'/.test(resultStep),
    'the review tab only appears when there is something that can save it');
});

test('the review panel receives the original and the tailored CV', () => {
  const usage = resultStep.slice(resultStep.indexOf('<ChangeReview'));
  const props = usage.slice(0, usage.indexOf('/>'));
  assert.ok(/originalCV=\{result\.originalCV/.test(props), 'needs the original to diff against');
  assert.ok(/tailoredCV=\{cv\}/.test(props), 'needs the tailored CV');
  assert.ok(/onSave=\{onSave\}/.test(props));
});

test('the review panel cannot render as though nothing changed', () => {
  // summarizeDiff reports `incomparable` when there is no structured original
  // (the paste-plain-text path). The panel must have a distinct branch for it
  // rather than falling through to a claim that nothing changed.
  assert.ok(changeReview.includes('diff.incomparable'));
  assert.ok(changeReview.includes('reviewChanges.incomparable'));
  assert.ok(changeReview.includes('!diff.changed'));
  // ...and each branch still offers the save gate.
  assert.ok((changeReview.match(/saveButton/g) || []).length >= 3,
    'every branch of the panel must reach the save gate');
});

test('a rejected save surfaces an error and can be retried', () => {
  assert.ok(/await onSave\(\)/.test(changeReview), 'must await the save');
  assert.ok(/catch/.test(changeReview), 'must handle rejection');
  assert.ok(/save_failed/.test(changeReview), 'must show the reason');
  assert.ok(/save_retry/.test(changeReview), 'must offer a retry');
  assert.ok(changeReview.includes("setSaveState('saved')"));
  assert.ok(changeReview.includes("setSaveState('error')"));
  assert.ok(/saveState === 'saving' \|\| saveState === 'saved'/.test(changeReview),
    'double submits must be blocked');
});

test('downloads do not depend on the document having been saved', () => {
  // The review gate must not cost the user their download. generateDocument
  // resolves access against `documentId || null`, so an unsaved document still
  // renders and watermarks correctly.
  const ctrl = src('backend/controllers/documentController.js');
  assert.ok(/resolveAccess\(req\.user\._id, documentId \|\| null\)/.test(ctrl),
    'generateDocument must tolerate a null documentId');
  assert.ok(/if \(!tailoredCV\)/.test(ctrl),
    'generateDocument must work from the request body alone');
});

test('every reviewChanges key used by the panel exists in both languages', () => {
  const used = [...changeReview.matchAll(/reviewChanges\.([a-z_]+)/g)].map(m => m[1]);
  assert.ok(used.length >= 12, `expected the panel to use a full key set, found ${used.length}`);

  // A key may be present either as a plain string or as an i18next plural pair,
  // which is why `roles_added` resolves to `_one`/`_other` rather than itself.
  const translated = (lang, key) => {
    const direct = dig(lang, `reviewChanges.${key}`);
    if (typeof direct === 'string') return true;
    return ['_one', '_other'].every(suffix =>
      typeof dig(lang, `reviewChanges.${key}${suffix}`) === 'string');
  };

  [...new Set(used)].forEach(key => {
    assert.ok(translated(EN, key), `en reviewChanges.${key}`);
    assert.ok(translated(FR, key), `fr reviewChanges.${key}`);
  });
});

test('plural keys used by the panel exist in both languages', () => {
  ['roles_added_one', 'roles_added_other', 'show_kept', 'hide_kept', 'skills_added']
    .forEach(key => {
      assert.strictEqual(typeof dig(EN, `reviewChanges.${key}`), 'string', `en reviewChanges.${key}`);
      assert.strictEqual(typeof dig(FR, `reviewChanges.${key}`), 'string', `fr reviewChanges.${key}`);
    });
});

test('EN and FR use the same interpolation variables in the review panel', () => {
  const varsOf = (s) => [...new Set([...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort();
  ['show_kept', 'hide_kept', 'skills_added', 'save_failed', 'roles_added_other'].forEach(key => {
    assert.deepStrictEqual(varsOf(dig(FR, `reviewChanges.${key}`)), varsOf(dig(EN, `reviewChanges.${key}`)),
      `reviewChanges.${key}: placeholder mismatch`);
  });
});

test('the existing result tabs are all still reachable', () => {
  // Adding a default tab must not have displaced anything.
  ['cv', 'cover', 'gaps'].forEach(id => {
    assert.ok(resultStep.includes(`{ id: '${id}'`), `tab ${id} must remain registered`);
  });
  assert.ok(resultStep.includes("tab === 'cover' &&"), 'cover letter body must remain');
  assert.ok(resultStep.includes("tab === 'gaps' &&"), 'gaps body must remain');
});
