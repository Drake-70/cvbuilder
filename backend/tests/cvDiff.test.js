const test = require('node:test');
const assert = require('node:assert');

// The diff engine is frontend code but pure, so it is asserted from here. Same
// approach as draftController.test.js and resumeScoreContract.test.js: there is
// no frontend test runner, and "review before save" is a trust feature, so the
// thing deciding what a user is shown about the AI's changes needs real tests.
const {
  diffBullets,
  diffExperience,
  summarizeDiff,
  tokenSimilarity,
  normalizeText,
  tokenize,
  classifyProposal,
  applyProposals,
  KEPT,
  REWORDED,
  ADDED,
  REMOVED,
  EXPANDED,
  SKIPPED
} = require('../../frontend/src/utils/cvDiff.js');

const rows = (result) => result.map(r => r.status);

test('an untouched bullet is kept, not reported as rewritten', () => {
  const b = ['Reduced latency 40% by rewriting the service in Go.'];
  assert.deepStrictEqual(rows(diffBullets(b, b)), [KEPT]);
  assert.strictEqual(diffBullets(b, b)[0].before, b[0]);
});

test('a rewording is paired, and reports both sides', () => {
  const before = ['Managed a team of 5 engineers across the platform.'];
  const after = ['Led a team of 5 engineers across the payment platform.'];
  const [row] = diffBullets(before, after);
  assert.strictEqual(row.status, REWORDED);
  assert.strictEqual(row.before, before[0]);
  assert.strictEqual(row.after, after[0]);
});

test('an unrelated bullet is removed plus added, never paired', () => {
  // Reporting this as a rewrite would claim the AI edited a line it invented.
  const before = ['Reduced latency 40% by rewriting the service in Go.'];
  const after = ['Presented quarterly revenue figures to the board.'];
  const result = diffBullets(before, after);
  assert.strictEqual(result.filter(r => r.status === REMOVED).length, 1);
  assert.strictEqual(result.filter(r => r.status === ADDED).length, 1);
});

test('an invented bullet is added and the original is kept', () => {
  const result = diffBullets(
    ['Reduced latency 40% by rewriting the service in Go.'],
    [
      'Reduced latency 40% by rewriting the service in Go.',
      'Cut infrastructure spend by 18,000 EUR a year.'
    ]
  );
  assert.deepStrictEqual(rows(result), [KEPT, ADDED]);
  assert.strictEqual(result[1].before, '');
});

test('a dropped bullet is reported as removed, not silently lost', () => {
  const result = diffBullets(
    ['Reduced latency 40%.', 'Cut spend by 18,000 EUR.'],
    ['Reduced latency 40%.']
  );
  assert.strictEqual(result.filter(r => r.status === REMOVED).length, 1);
});

test('exact matching runs before similarity, so kept lines stay kept', () => {
  // Two originals near each other and two afters that cross-match: pairing by
  // similarity first would report both as reworded.
  const before = ['Cut spend by 18,000 EUR a year.', 'Reduced latency 40% overall.'];
  const after = ['Reduced latency 40% overall.', 'Cut spend by 18,000 EUR a year.'];
  assert.deepStrictEqual(rows(diffBullets(before, after)), [KEPT, KEPT]);
});

test('punctuation and typography do not make an identical bullet look changed', () => {
  const result = diffBullets(
    ['Led the team\u2019s migration of 1.2M records \u2014 with zero downtime.'],
    ['Led the team\'s migration of 1.2M records - with zero downtime.']
  );
  assert.deepStrictEqual(rows(result), [KEPT]);
});

test('empty and missing inputs produce no rows rather than throwing', () => {
  [[], null, undefined, '', [null, '', '   ']].forEach(input => {
    assert.deepStrictEqual(diffBullets(input, []), []);
    assert.deepStrictEqual(diffBullets([], input), []);
  });
});

test('non-string bullets are coerced, not rendered as [object Object]', () => {
  const result = diffBullets([null, 42, { a: 1 }], [42]);
  assert.deepStrictEqual(rows(result), [KEPT]);
});

test('similarity is 1 for equal text and 0 for empty or disjoint', () => {
  assert.strictEqual(tokenSimilarity('Reduced latency 40%.', 'Reduced latency 40%.'), 1);
  assert.strictEqual(tokenSimilarity('', 'anything'), 0);
  assert.strictEqual(tokenSimilarity('anything', ''), 0);
  assert.strictEqual(tokenSimilarity('zzz qqq', 'xxx www'), 0);
});

test('similarity is symmetric', () => {
  const pairs = [
    ['Led a team of 5 engineers.', 'Directed a group of 5 engineers.'],
    ['Reduced latency 40%.', 'Cut latency by forty percent.']
  ];
  pairs.forEach(([a, b]) => {
    assert.strictEqual(tokenSimilarity(a, b), tokenSimilarity(b, a));
  });
});

test('normalizeText and tokenize handle accents and empty input', () => {
  assert.strictEqual(normalizeText('  RÉDUIT   la latence  '), 'réduit la latence');
  assert.strictEqual(normalizeText(null), '');
  assert.deepStrictEqual(tokenize('a, b; c'), ['a', 'b', 'c']);
  assert.deepStrictEqual(tokenize('   '), []);
});

// --- experience ---

const role = (title, company, bullets) => ({ title, company, bullets });

test('roles are paired by title and company', () => {
  const originalCV = { experience: [role('Engineer', 'Acme', ['Did a thing.'])] };
  const tailoredCV = { experience: [role('Engineer', 'Acme', ['Did a bigger thing.'])] };
  const [row] = diffExperience(originalCV, tailoredCV);
  assert.strictEqual(row.status, KEPT);
  assert.strictEqual(row.isNew, false);
});

test('a company change reads as a new role, not an edit', () => {
  const originalCV = { experience: [role('Engineer', 'Acme', ['Did a thing.'])] };
  const tailoredCV = { experience: [role('Engineer', 'Globex', ['Did a thing.'])] };
  const [row] = diffExperience(originalCV, tailoredCV);
  assert.strictEqual(row.isNew, true);
  assert.strictEqual(row.status, ADDED);
});

test('a dropped role is reported', () => {
  const originalCV = { experience: [role('Intern', 'Acme', ['Did a thing.'])] };
  const tailoredCV = { experience: [] };
  const rowsOut = diffExperience(originalCV, tailoredCV);
  assert.strictEqual(rowsOut.length, 1);
  assert.strictEqual(rowsOut[0].status, REMOVED);
});

test('two roles with the same title at one company pair in order', () => {
  const originalCV = {
    experience: [role('Intern', 'Acme', ['First internship.']), role('Intern', 'Acme', ['Second internship.'])]
  };
  const tailoredCV = {
    experience: [role('Intern', 'Acme', ['First internship, rewritten.']), role('Intern', 'Acme', ['Second internship.'])]
  };
  const rowsOut = diffExperience(originalCV, tailoredCV);
  assert.strictEqual(rowsOut.length, 2, 'no role may be double-paired or duplicated');
  assert.strictEqual(rowsOut[0].bullets[0].status, REWORDED);
  assert.strictEqual(rowsOut[1].bullets[0].status, KEPT);
});

test('diffExperience tolerates a missing experience array on either side', () => {
  [{}, { experience: null }, { experience: 'x' }, null, undefined].forEach(cv => {
    assert.doesNotThrow(() => diffExperience(cv, { experience: [] }));
    assert.doesNotThrow(() => diffExperience({ experience: [] }, cv));
  });
});

// --- summary ---

test('a tailoring that changed something reports changed', () => {
  const summary = summarizeDiff(
    { experience: [role('Engineer', 'Acme', ['Did a thing.'])], skills: ['Go'] },
    { experience: [role('Engineer', 'Acme', ['Did a much bigger thing.'])], skills: ['Go', 'Kubernetes'] }
  );
  assert.strictEqual(summary.changed, true);
  assert.ok(summary.reworded + summary.added > 0);
  assert.deepStrictEqual(summary.skillsAdded, ['kubernetes']);
});

test('an identical CV reports no change', () => {
  const cv = {
    summary: 'An engineer.',
    experience: [role('Engineer', 'Acme', ['Did a thing.'])],
    skills: ['Go', 'Python']
  };
  const summary = summarizeDiff(cv, JSON.parse(JSON.stringify(cv)));
  assert.strictEqual(summary.changed, false);
  assert.strictEqual(summary.reworded, 0);
  assert.strictEqual(summary.added, 0);
  assert.strictEqual(summary.removed, 0);
  assert.strictEqual(summary.summaryChanged, false);
});

test('a rewritten summary alone counts as a change', () => {
  const summary = summarizeDiff(
    { summary: 'An engineer.', experience: [] },
    { summary: 'A senior engineer with payments experience.', experience: [] }
  );
  assert.strictEqual(summary.summaryChanged, true);
  assert.strictEqual(summary.changed, true);
});

test('a missing original is incomparable, never reported as unchanged', () => {
  // The paste-a-block-of-text path has no structured original. Claiming "nothing
  // changed" there would be the one reading that is definitely a lie.
  [null, undefined, {}, { experience: null }].forEach(missing => {
    const summary = summarizeDiff(missing, { summary: 'Something.', experience: [] });
    assert.strictEqual(summary.incomparable, true, `for ${JSON.stringify(missing)}`);
  });
});

test('the summary never claims a change it cannot evidence', () => {
  const summary = summarizeDiff(
    { experience: [role('Engineer', 'Acme', ['Did a thing.'])], skills: ['Go'] },
    { experience: [role('Engineer', 'Acme', ['Did a thing.'])], skills: ['Go'] }
  );
  assert.strictEqual(summary.changed, false);
  assert.deepStrictEqual(summary.roles.map(r => r.status), [KEPT]);
});

test('every status the UI renders is one the module emits', () => {
  const emitted = new Set();
  const samples = [
    [[], []],
    [['a b c'], ['a b d']],
    [['one thing here'], ['completely different line']],
    [['x'], ['x', 'y', 'z']]
  ];
  samples.forEach(([b, a]) => diffBullets(b, a).forEach(r => emitted.add(r.status)));
  emitted.forEach(s => {
    assert.ok([KEPT, REWORDED, ADDED, REMOVED].includes(s), `unknown status ${s}`);
    assert.strictEqual(s, s.toLowerCase());
  });
});

// --- proposal approval (bullet-level expansion) --------------------------
//
// The pairing itself is server-side and asserted in bulletExpansion.test.js.
// What is asserted here is what the client does with the result: deciding what to
// call a proposal, and writing only the approved ones back into the form.

test('a proposal the model declined is skipped, not reported as a removal', () => {
  // "This line is gone" is a different and wrong claim from "your wording is
  // still your wording".
  assert.strictEqual(classifyProposal('helped at a cafe', null), SKIPPED);
  assert.strictEqual(classifyProposal('helped at a cafe', ''), SKIPPED);
  assert.notStrictEqual(classifyProposal('helped at a cafe', null), REMOVED);
});

test('an expansion identical to the input is not counted as an improvement', () => {
  // Case and trailing punctuation must not make the model's echo look like work.
  assert.strictEqual(classifyProposal('Helped at a cafe.', 'helped at a cafe'), KEPT);
  assert.strictEqual(classifyProposal('helped at a cafe', 'Managed daily cafe operations'), EXPANDED);
});

test('only accepted proposals are written back', () => {
  const rows = ['one', 'two', 'three'];
  const proposals = [
    { index: 0, before: 'one', after: 'ONE' },
    { index: 1, before: 'two', after: 'TWO' },
    { index: 2, before: 'three', after: 'THREE' }
  ];
  assert.deepStrictEqual(applyProposals(rows, proposals, new Set([1])), ['one', 'TWO', 'three']);
  assert.deepStrictEqual(applyProposals(rows, proposals, new Set()), rows, 'accepting nothing changes nothing');
  assert.deepStrictEqual(applyProposals(rows, proposals, [0, 2]), ['ONE', 'two', 'THREE'], 'an array works too');
});

test('an unexpanded proposal cannot be accepted into the form', () => {
  // Even if the UI state says so, a null `after` has no text to write.
  const rows = ['one', 'two'];
  const proposals = [
    { index: 0, before: 'one', after: null },
    { index: 1, before: 'two', after: 'TWO' }
  ];
  assert.deepStrictEqual(applyProposals(rows, proposals, new Set([0, 1])), ['one', 'TWO']);
});

test('blank placeholder rows do not shift the proposals', () => {
  // The form keeps empty rows to type into; the request filters them out, so the
  // proposals are indexed against filled rows only. Getting this wrong silently
  // rewrites the wrong line and the user only notices after submitting.
  const rows = ['', 'first', '   ', 'second'];
  const proposals = [
    { index: 0, before: 'first', after: 'FIRST' },
    { index: 1, before: 'second', after: 'SECOND' }
  ];
  assert.deepStrictEqual(applyProposals(rows, proposals, new Set([0, 1])), ['', 'FIRST', '   ', 'SECOND']);
});

test('applying is total: no input can make it lose a row', () => {
  const rows = ['a', '', 'b'];
  [null, undefined, [], 'x', 42, [{}], [{ after: '' }]].forEach(proposals => {
    const out = applyProposals(rows, proposals, new Set([0, 1, 2, 3, 4]));
    assert.strictEqual(out.length, rows.length, `row count for ${JSON.stringify(proposals)}`);
    out.forEach((v, i) => assert.strictEqual(typeof v, 'string', `row ${i} must stay a string`));
  });
  assert.deepStrictEqual(applyProposals(null, [], new Set()), []);
});