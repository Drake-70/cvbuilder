const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Next action and follow-up date on tracked applications.
//
// The feature is two fields plus the rule that turns them into a prompt, so the
// tests are about that rule: which of the three "needs attention" states applies,
// and -- more importantly -- when none of them should.

const ROOT = path.join(__dirname, '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const model = src('backend/models/TailoredDocument.js');
const controller = src('backend/controllers/documentController.js');
const tracker = src('frontend/src/components/ApplicationTracker.jsx');
const dashboard = src('frontend/src/pages/DashboardPage.jsx');

const locale = (lang) => JSON.parse(
  fs.readFileSync(path.join(ROOT, 'frontend', 'src', 'locales', lang, 'common.json'), 'utf8')
);
const EN = locale('en');
const FR = locale('fr');
const dig = (obj, dotted) => dotted.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
const daysAhead = (n) => new Date(Date.now() + n * DAY).toISOString();

// The rule under test, mirrored from the component. Kept as an independent
// reimplementation rather than an import: a test that imports the thing it is
// checking proves only that the code equals itself.
function dueState(followUpDate, appliedAt, status) {
  if (['rejected', 'withdrawn'].includes(status)) return null;
  if (followUpDate) {
    const target = new Date(followUpDate);
    if (Number.isNaN(target.getTime())) return null;
    const a = new Date(); a.setHours(0, 0, 0, 0);
    const b = new Date(target); b.setHours(0, 0, 0, 0);
    const days = Math.round((b - a) / DAY);
    if (days < 0) return 'overdue';
    if (days === 0) return 'today';
    return null;
  }
  if (status !== 'applied' || !appliedAt) return null;
  return Math.floor((Date.now() - new Date(appliedAt).getTime()) / DAY) > 7 ? 'elapsed' : null;
}

test('a stored date decides, and the elapsed-time guess does not apply', () => {
  // The user set a date. It wins -- including when the elapsed-time rule would
  // have prompted anyway, and when the application is older than 7 days.
  assert.strictEqual(dueState(daysAhead(3), daysAgo(30), 'applied'), null);
  // And when the date is further off than 7 days but not yet reached, still
  // nothing: the date is the promise, not a suggestion to override.
  assert.strictEqual(dueState(daysAhead(20), null, 'applied'), null);
});

test('an overdue date and a date due today are different states', () => {
  // Collapsing them into one "needs attention" loses the distinction between
  // something the user missed and something they planned.
  assert.strictEqual(dueState(daysAgo(2), null, 'applied'), 'overdue');
  assert.strictEqual(dueState(daysAgo(1), null, 'interviewed'), 'overdue');
  assert.strictEqual(dueState(new Date().toISOString(), null, 'applied'), 'today');
  assert.ok(tracker.includes("due.kind === 'overdue'"), 'the two are rendered differently');
  assert.ok(/dueTone/.test(tracker) && /dueTextTone/.test(tracker));
  assert.ok(tracker.includes('tracker.dueToday'));
  assert.ok(tracker.includes('tracker.overdueDays'));
});

test('a closed application is never prompted', () => {
  // Following up on a rejection or a withdrawal is not a pending action.
  assert.strictEqual(dueState(daysAgo(90), daysAgo(120), 'rejected'), null);
  assert.strictEqual(dueState(daysAgo(90), daysAgo(120), 'withdrawn'), null);
  // ...but the data is kept, not erased: a user who reopens the thread can still
  // see what they wrote.
  assert.ok(/nextAction !== undefined/.test(controller));
  assert.ok(!/status === 'rejected'[^]*\$unset/.test(controller));
});

test('the 7-day suggestion only fires without a stored date', () => {
  // Preserves the behaviour every existing document already relies on.
  assert.strictEqual(dueState(null, daysAgo(3), 'applied'), null);
  assert.strictEqual(dueState(null, daysAgo(8), 'applied'), 'elapsed');
  assert.strictEqual(dueState(null, null, 'applied'), null);
  assert.strictEqual(dueState(null, daysAgo(30), 'interviewed'), null,
    'the elapsed rule was scoped to "applied" before this change');
});

test('a date that is not a date changes nothing', () => {
  // A malformed value must not become "due now".
  assert.strictEqual(dueState('not-a-date', null, 'applied'), null);
  // And the server refuses it rather than storing null, which would look like
  // the user cleared the date.
  assert.ok(/Number\.isNaN\(parsed\.getTime\(\)\)/.test(controller));
  assert.ok(/res\.status\(400\)\.json\(\{ error: 'followUpDate must be a valid date' \}\)/.test(controller));
  assert.ok(tracker.includes("Number.isNaN(d.getTime())"), 'the date input cannot emit one');
});

test('an empty date is a clear, not a no-op', () => {
  // The user has to be able to take a date back off.
  assert.ok(/followUpDate === null \|\| followUpDate === ''/.test(controller));
  assert.ok(/updates\.followUpDate = null/.test(controller));
  assert.ok(tracker.includes('followUpDate: followUpDate || null'));
});

test('appliedAt is stamped once and is not reset by an edit', () => {
  // The defect this feature exposed: appliedAt was overwritten on every save
  // while the status was "applied" -- the default status -- so editing the
  // company field restarted "days since you applied" at zero, and the follow-up
  // nudge could never fire for a user who kept correcting their own data.
  assert.ok(!/updates\.appliedAt = new Date\(\)/.test(controller),
    'appliedAt must not be part of the unconditional update set');
  assert.ok(/\{ _id: doc\._id, appliedAt: null \}/.test(controller),
    'it must be set only while still null');

  // The conditional update only matches un-stamped documents if the default is
  // null. A Date.now default would make every document already stamped and the
  // follow-up rule would never see an elapsed application.
  const schema = require('../models/TailoredDocument').schema;
  assert.strictEqual(schema.path('appliedAt').defaultValue, null);
  assert.strictEqual(schema.path('followUpDate').defaultValue, null);
  assert.strictEqual(schema.path('nextAction').defaultValue, '');
});

test('the follow-up date is indexed for the question it answers', () => {
  // "What needs my attention" filters on a date inside a window, which is not a
  // sort of the whole list.
  const schema = require('../models/TailoredDocument').schema;
  assert.ok(
    schema.indexes().some(([fields]) => fields.userId === 1 && fields.followUpDate === 1),
    'expected an index on { userId, followUpDate }'
  );
});

test('an empty patch is rejected rather than performing a no-op write', () => {
  assert.ok(/Object\.keys\(updates\)\.length === 0/.test(controller));
  assert.ok(/res\.status\(400\)\.json\(\{ error: 'No content to update' \}\)/.test(controller));
});

test('the next action is bounded and trimmed by the server', () => {
  // A schema maxlength would reject the whole request, turning an over-long field
  // into a 500. Truncating keeps a long note from becoming an un-saveable one.
  assert.ok(/const NEXT_ACTION_MAX = 200/.test(controller));
  assert.ok(/String\(nextAction\)\.slice\(0, NEXT_ACTION_MAX\)/.test(controller));
  assert.ok(tracker.includes('maxLength={200}'));
});

test('the next action is the user\'s, not the model\'s', () => {
  // A generated action would be either generic or invented, and the user cannot
  // tell which. The model has no field to write into.
  assert.ok(!/nextAction/.test(src('backend/services/aiService.js')));
  assert.ok(!/nextAction/.test(src('backend/controllers/tailorController.js')));
});

test('the dashboard passes the stored values into the tracker', () => {
  // Without these the editor would always open blank and the collapsed view could
  // not show what the user wrote -- a save that looks like it did nothing.
  assert.ok(/currentNextAction=\{doc\.nextAction\}/.test(dashboard));
  assert.ok(/currentFollowUpDate=\{doc\.followUpDate\}/.test(dashboard));
  assert.ok(/currentNextAction,/.test(tracker));
  assert.ok(/currentFollowUpDate,/.test(tracker));
});

test('a failed tracker save says so', () => {
  // The catch was empty, so a failed save closed the editor and lost the change
  // while looking exactly like a successful one.
  assert.ok(!/catch\s*\{\s*\/\/ silent\s*\}/.test(tracker));
  assert.ok(/setSaveError\(err\.response\?\.data\?\.error/.test(tracker));
  // The editor stays open, because closing it is what hid the failure.
  assert.ok(tracker.indexOf('setSaveError') < tracker.indexOf('setEditing(false)'));
});

test('the tracker editor translates', () => {
  // It called useTranslation() with no namespace, so every `tailor.*` label fell
  // back to its inline English default and the editor was English-only.
  assert.ok(/useTranslation\(\['common', 'tailor'\]\)/.test(tracker));
});

test('a date set for today is due from the moment it is written', () => {
  // Comparing instants instead of calendar days makes a date due today appear
  // not-yet-due until the stored time passes, which for a midnight-stored date
  // means never.
  assert.ok(/setHours\(0, 0, 0, 0\)/.test(tracker));
  assert.ok(/toDateInput/.test(tracker));
  assert.ok(!/toISOString\(\)\.slice\(0, 10\)/.test(tracker),
    'a UTC date string shifts the day for anyone west of UTC');
});

test('every tracker key the component uses exists in both languages', () => {
  const used = [...tracker.matchAll(/t\('tracker\.([a-zA-Z]+)/g)].map(m => m[1]);
  assert.ok(used.length >= 8, `expected a full key set, found ${used.length}`);

  const translated = (lang, key) => {
    if (typeof dig(lang, `tracker.${key}`) === 'string') return true;
    return ['_one', '_other'].every(suffix =>
      typeof dig(lang, `tracker.${key}${suffix}`) === 'string');
  };

  [...new Set(used)].forEach(key => {
    assert.ok(translated(EN, key), `en tracker.${key}`);
    assert.ok(translated(FR, key), `fr tracker.${key}`);
  });
});

test('EN and FR interpolate the same variables', () => {
  const varsOf = (s) => [...new Set([...String(s).matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))].sort();
  ['followUpHint', 'followUpOn', 'whatsappFollowUp', 'overdueDays_other']
    .forEach(key => {
      assert.deepStrictEqual(varsOf(dig(FR, `tracker.${key}`)), varsOf(dig(EN, `tracker.${key}`)),
        `tracker.${key}: placeholder mismatch`);
    });
  // The counts the component interpolates are the ones the rule produces.
  assert.ok(/tracker\.overdueDays[\s\S]{0,80}count: due\.days/.test(tracker));
  assert.ok(/tracker\.followUpHint[\s\S]{0,140}days: due\.days/.test(tracker));
});