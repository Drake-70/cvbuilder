const { test } = require('node:test');
const assert = require('node:assert/strict');

const { parsePaging, listResponse } = require('../utils/paging');

test('a missing page and limit fall back to the defaults', () => {
  const r = parsePaging({});
  assert.equal(r.page, 1);
  assert.equal(r.limit, 20);
  assert.equal(r.skip, 0);
});

test('limit is clamped to the maximum', () => {
  // The reason this helper exists. `?limit=1000000` used to reach the driver
  // untouched, and the `.select()` on a user list would then serialise a million
  // users into one JSON response.
  const r = parsePaging({ limit: '1000000' });
  assert.equal(r.limit, 100);
});

test('a negative or zero limit falls back to the default', () => {
  // `-1` reached `.limit()` as a negative limit, and `0` made
  // `Math.ceil(total / limit)` divide by zero, putting `Infinity` in `pages` and
  // `NaN` in the UI.
  for (const limit of ['-1', '0']) {
    const r = parsePaging({ limit });
    assert.equal(r.limit, 20, `limit=${limit} should fall back`);
  }
});

test('a non-numeric limit falls back instead of reaching the driver', () => {
  // `parseInt('abc')` is NaN, and NaN reaching `.limit()` throws inside Mongoose:
  // a 500 for what is a bad request.
  for (const limit of ['abc', '', 'NaN', {}, []]) {
    const r = parsePaging({ limit });
    assert.equal(r.limit, 20, `limit=${JSON.stringify(limit)} should fall back`);
  }
});

test('a trailing-garbage limit is rejected, not silently truncated', () => {
  // `parseInt('12abc')` is 12, which quietly serves the wrong page size for a URL
  // that does not mean what it looks like. `Number('12abc')` is NaN.
  assert.equal(parsePaging({ limit: '12abc' }).limit, 20);
  assert.equal(parsePaging({ limit: '12' }).limit, 12);
});

test('page below 1 is corrected rather than producing a negative skip', () => {
  for (const page of ['0', '-3', 'abc']) {
    const r = parsePaging({ page });
    assert.equal(r.page, 1, `page=${page} should clamp to 1`);
    assert.ok(r.skip >= 0, 'skip must never be negative');
  }
});

test('skip advances with the page', () => {
  assert.equal(parsePaging({ page: '3', limit: '25' }).skip, 50);
});

test('fractional values are floored to whole documents', () => {
  // A fractional limit reaching the driver is rejected by MongoDB.
  const r = parsePaging({ page: '2.7', limit: '10.9' });
  assert.equal(r.page, 2);
  assert.equal(r.limit, 10);
  assert.equal(r.skip, 10);
});

test('a custom default and ceiling are honoured', () => {
  const r = parsePaging({}, { defaultLimit: 5, maxLimit: 10 });
  assert.equal(r.limit, 5);

  assert.equal(parsePaging({ limit: '7' }, { defaultLimit: 5, maxLimit: 10 }).limit, 7);
  assert.equal(parsePaging({ limit: '999' }, { defaultLimit: 5, maxLimit: 10 }).limit, 10);
});

test('the response envelope names the row array as asked', () => {
  const body = listResponse({ items: [1, 2], total: 12, page: 2, limit: 5, key: 'users' });
  assert.deepEqual(body.users, [1, 2]);
  assert.equal(body.total, 12);
  assert.equal(body.page, 2);
  assert.equal(body.limit, 5);
  assert.equal(body.pages, 3, '12 items at 5 per page is 3 pages');
  assert.equal(body.hasMore, true);
});

test('hasMore is false on the final page', () => {
  const body = listResponse({ items: [], total: 12, page: 3, limit: 5 });
  assert.equal(body.hasMore, false);
});

test('an empty result set reports zero pages, not NaN', () => {
  const body = listResponse({ items: [], total: 0, page: 1, limit: 20 });
  assert.equal(body.pages, 0);
  assert.equal(body.hasMore, false);
  assert.ok(Number.isFinite(body.pages), 'pages must never be Infinity or NaN');
});

test('the envelope defaults to "items"', () => {
  const body = listResponse({ items: ['x'], total: 1, page: 1, limit: 20 });
  assert.deepEqual(body.items, ['x']);
});
