const test = require('node:test');
const assert = require('node:assert');
const {
  pairExpansions,
  cleanBulletText,
  MAX_BULLET_CHARS,
  MAX_BULLETS_PER_REQUEST
} = require('../services/bulletExpansionService');

const SAMPLE = [
  'helped at my mums cafe',
  'organised a school charity drive',
  'did some python in class'
];

const expanded = (index, text) => ({ index, expanded: text });
const rows = result => result.map(r => r.expanded);

test('a 1-based reply pairs to the line it was given', () => {
  // The convention the prompt asks for.
  const result = pairExpansions(SAMPLE, {
    expansions: [expanded(1, 'Managed daily operations of a family cafe'), expanded(2, 'Coordinated a school charity drive'), expanded(3, 'Completed a Python programming module')]
  });
  assert.deepStrictEqual(rows(result), [
    'Managed daily operations of a family cafe',
    'Coordinated a school charity drive',
    'Completed a Python programming module'
  ]);
  assert.deepStrictEqual(result.map(r => r.index), [0, 1, 2]);
});

test('a 0-based reply is not shifted by one line', () => {
  // Models return 0-based indices often enough that assuming 1-based would
  // silently attribute every rewrite to the wrong line -- the CV still looks
  // plausible, which is what makes it dangerous.
  const result = pairExpansions(SAMPLE, {
    expansions: [expanded(0, 'first'), expanded(1, 'second'), expanded(2, 'third')]
  });
  assert.deepStrictEqual(rows(result), ['first', 'second', 'third']);
});

test('an out-of-order reply is paired by index, not by position', () => {
  const result = pairExpansions(SAMPLE, {
    expansions: [expanded(3, 'third'), expanded(1, 'first'), expanded(2, 'second')]
  });
  assert.deepStrictEqual(rows(result), ['first', 'second', 'third']);
});

test('a dropped line comes back unexpanded rather than shifted', () => {
  // The model skipped line 2. Zipping by position would have rewritten line 3
  // with line 2's proposal and left line 3's proposal unused.
  const result = pairExpansions(SAMPLE, {
    expansions: [expanded(1, 'first'), expanded(3, 'third')]
  });
  assert.deepStrictEqual(rows(result), ['first', null, 'third']);
  assert.strictEqual(result[1].original, SAMPLE[1], 'the skipped line is still reported');
});

test('a reply with no indices pairs positionally only when the counts match', () => {
  const matched = pairExpansions(SAMPLE, [
    { expanded: 'a' }, { expanded: 'b' }, { expanded: 'c' }
  ]);
  assert.deepStrictEqual(rows(matched), ['a', 'b', 'c']);

  // Two candidates for three lines: there is no evidence about which line either
  // belongs to, so nothing is claimed.
  const mismatched = pairExpansions(SAMPLE, [
    { expanded: 'a' }, { expanded: 'b' }
  ]);
  assert.deepStrictEqual(rows(mismatched), [null, null, null]);
});

test('the result is always aligned to the request', () => {
  // The caller never reconciles two lists, so length and order are the contract.
  [undefined, null, {}, { expansions: [] }, [], 'garbage', 42].forEach(parsed => {
    const result = pairExpansions(SAMPLE, parsed);
    assert.strictEqual(result.length, SAMPLE.length, `length for ${JSON.stringify(parsed)}`);
    assert.deepStrictEqual(result.map(r => r.original), SAMPLE);
    assert.ok(result.every(r => r.expanded === null), 'nothing paired without a usable reply');
  });
});

test('blank lines are dropped from the request and from the reply alike', () => {
  // The form keeps empty placeholder rows; the request filters them out. The
  // index the client uses counts filled rows only.
  const result = pairExpansions(['real one', '', '   ', 'real two'], {
    expansions: [expanded(1, 'one'), expanded(2, 'two')]
  });
  assert.strictEqual(result.length, 2);
  assert.deepStrictEqual(result.map(r => r.original), ['real one', 'real two']);
  assert.deepStrictEqual(rows(result), ['one', 'two']);
});

test('a repeated index keeps the first reply', () => {
  // Picking the later one would make the output depend on array order, so the
  // same request could produce two different CVs.
  const result = pairExpansions(['one', 'two'], {
    expansions: [expanded(1, 'first take'), expanded(1, 'second take')]
  });
  assert.deepStrictEqual(rows(result), ['first take', null]);
});

test('an expansion the model echoed back is not offered as an improvement', () => {
  // `original` is not an accepted field: presenting the user's own words back to
  // them as a rewrite would misrepresent what the AI did.
  const result = pairExpansions(['helped at a cafe'], {
    expansions: [{ index: 1, original: 'helped at a cafe' }]
  });
  assert.deepStrictEqual(rows(result), [null]);
});

test('an empty expansion is treated as no expansion', () => {
  const result = pairExpansions(['one', 'two'], {
    expansions: [expanded(1, '   '), expanded(2, 'kept')]
  });
  assert.deepStrictEqual(rows(result), [null, 'kept']);
});

test('a proposal longer than a bullet is discarded', () => {
  // The model was asked for one sentence. A paragraph is drift, and writing it
  // into a CV the user is about to submit is worse than leaving their line alone.
  const paragraph = 'word '.repeat(MAX_BULLET_CHARS);
  const result = pairExpansions(['one', 'two'], {
    expansions: [expanded(1, paragraph), expanded(2, 'fine')]
  });
  assert.deepStrictEqual(rows(result), [null, 'fine']);
});

test('a list glyph the model re-added is stripped', () => {
  // Otherwise it renders as "- Managed ops" inside an already-bulleted list.
  ['- Managed daily ops', '\u2022 Managed daily ops', '\u2014 Managed daily ops', '* Managed daily ops']
    .forEach(raw => {
      assert.strictEqual(cleanBulletText(raw), 'Managed daily ops');
    });
  // A hyphen that is part of the sentence survives.
  assert.strictEqual(cleanBulletText('Grew revenue -40% to 20%'), 'Grew revenue -40% to 20%');
});

test('non-string candidates never reach the pairing', () => {
  const result = pairExpansions(['one', 'two'], {
    expansions: [null, 42, { index: 2 }, { index: 1, expanded: 'fine' }]
  });
  assert.deepStrictEqual(rows(result), ['fine', null]);
});

test('the request is bounded', () => {
  // Bounds the prompt and the cost of one request.
  assert.ok(MAX_BULLETS_PER_REQUEST > 0);
  assert.ok(MAX_BULLETS_PER_REQUEST <= 100, 'a hand-written form should never exceed this');
  assert.ok(MAX_BULLET_CHARS > 100, 'a real bullet must fit');
});

test('an empty request produces nothing to review', () => {
  assert.deepStrictEqual(pairExpansions([], { expansions: [expanded(1, 'x')] }), []);
  assert.deepStrictEqual(pairExpansions(['  ', ''], { expansions: [] }), []);
});