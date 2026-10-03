const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const User = require('../models/User');
const Payment = require('../models/Payment');
const Contact = require('../models/Contact');
const TailoredDocument = require('../models/TailoredDocument');
const CV = require('../models/CV');
const Job = require('../models/Job');

const adminController = require('../controllers/adminController');

/**
 * Minimal Express response double.
 *
 * `json()` records 200 as its status, matching Express: a handler that answers
 * via `json()` without calling `status()` is a 200, and a double that left the
 * status null would report a successful path as "never responded".
 */
function fakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { if (this.statusCode === null) this.statusCode = 200; this.body = payload; return this; }
  };
}

/** Throw anything handed to `next`, so an unexpected error fails the test. */
function failNext(err) {
  throw err || new Error('next() was called');
}

/**
 * A chainable Mongoose Query double.
 *
 * `find()` in these handlers is followed by sort/skip/limit/select/populate/lean
 * and then awaited, so the double has to be chainable *and* thenable. Returning
 * the same object from every builder is what makes a missing `await` show up as a
 * real value rather than a silent pass.
 */
function queryDouble(rows = []) {
  const chain = {
    sort() { return chain; },
    skip() { return chain; },
    limit(n) { chain.appliedLimit = n; return chain; },
    select(fields) { chain.appliedSelect = fields; return chain; },
    populate() { return chain; },
    lean() { return chain; },
    then(resolve, reject) { return Promise.resolve(rows).then(resolve, reject); }
  };
  return chain;
}

/**
 * Record what was asked of the User model.
 *
 * Installed as mocks rather than by swapping `require.cache` entries, so the real
 * Mongoose models stay in place: `documentController.test.js` does the same, and
 * replacing the module object would leave `TailoredDocument` and `Job` unmocked,
 * which is what produced real `countDocuments` calls in an earlier draft of this
 * file and 10-second buffering timeouts.
 */
function stubUser(overrides = {}) {
  const calls = { findArgs: [], skip: [], limit: [], select: [], countQueries: [], updates: [] };

  mock.method(User, 'find', (query) => {
    calls.findArgs.push(query);
    return queryDouble([]);
  });
  mock.method(User, 'countDocuments', async (query) => {
    calls.countQueries.push(query);
    return 0;
  });
  mock.method(User, 'findById', () => ({
    select: () => ({ _id: 'target-1', role: 'user', email: 'target@example.com' })
  }));
  mock.method(User, 'findByIdAndUpdate', (id, update) => {
    calls.updates.push({ id, update });
    return {
      select(fields) {
        calls.select.push(fields);
        return Promise.resolve({ _id: id, email: 'target@example.com', ...update });
      }
    };
  });
  mock.method(User, 'findOne', () => ({
    select: () => ({ lean: () => Promise.resolve(overrides.otherAdmin ?? null) })
  }));

  return calls;
}

/** Silence the counts the dashboard makes on models these tests do not assert. */
function stubDashboardCounts() {
  mock.method(TailoredDocument, 'countDocuments', async () => 0);
  mock.method(CV, 'countDocuments', async () => 0);
  mock.method(Job, 'countDocuments', async () => 0);
}

test.afterEach(() => {
  mock.restoreAll();
});

// ---------------------------------------------------------------------------
// The credential leak
// ---------------------------------------------------------------------------

test('the shared deny-list excludes the password hash', () => {
  // The defect this replaces: `listUsers` and `updateUserRole` used
  // `.select('-resetPasswordToken -resetPasswordExpires')`, which excludes two
  // fields and leaves `passwordHash` in. Every other user-facing query in the
  // codebase excludes it; the admin routes were the exception.
  //
  // Checked as exclusion *tokens*, not substrings: the value is the string
  // '-passwordHash', so a substring test would read the field as present when it
  // is in fact excluded, and the test would pass for the wrong reason.
  const excluded = adminController.USER_PRIVATE_FIELDS.split(/\s+/);
  assert.ok(excluded.includes('-passwordHash'));
});

test('the deny-list covers every secret on the User schema', () => {
  // Written so adding a secret to the schema without adding it here is a
  // deliberate act. An exclusion list that reads as "careful" while shipping one
  // field is exactly what made the leak easy to miss.
  const excluded = adminController.USER_PRIVATE_FIELDS.split(/\s+/);

  for (const secret of [
    'passwordHash',
    'resetPasswordToken',
    'resetPasswordExpires',
    'emailVerificationToken',
    'emailVerificationExpires',
    // The six-digit code and its bookkeeping. The hash matters most — a million
    // values is small enough that shipping one hash is materially closer to
    // shipping the code than shipping a 256-bit link token is.
    'emailVerificationCodeHash',
    'emailVerificationCodeExpires',
    'emailVerificationCodeAttempts',
    'emailVerificationCodeSentAt'
  ]) {
    assert.ok(excluded.includes(`-${secret}`), `${secret} must be excluded`);
  }
});

test('no user query returns the password hash', async () => {
  // Asserted against the selects actually issued, not just the constant: a future
  // endpoint could hand-roll its own projection and reintroduce the leak while the
  // constant still looked right.
  const selects = [];
  mock.method(User, 'find', () => {
    const chain = queryDouble([]);
    const original = chain.select;
    chain.select = (fields) => {
      selects.push(fields);
      return original(fields);
    };
    return chain;
  });
  mock.method(User, 'countDocuments', async () => 0);
  mock.method(User, 'findById', () => ({
    select: () => ({ _id: 'target-1', role: 'user', email: 'target@example.com' })
  }));
  mock.method(User, 'findByIdAndUpdate', (id, update) => ({
    select(fields) {
      selects.push(fields);
      return Promise.resolve({ _id: id, ...update });
    }
  }));

  await adminController.listUsers({ query: {} }, fakeRes(), failNext);
  await adminController.updateUserRole(
    { params: { id: 'u1' }, body: { role: 'admin' }, user: { _id: 'me', email: 'a@b.c' } },
    fakeRes(),
    failNext
  );

  assert.equal(selects.length, 2, 'both endpoints should issue a select');
  for (const sel of selects) {
    assert.ok(
      sel.split(/\s+/).includes('-passwordHash'),
      `every user query must exclude passwordHash: ${sel}`
    );
  }
});

// ---------------------------------------------------------------------------
// Last-admin protection
// ---------------------------------------------------------------------------

test('self-demotion is refused even when other admins exist', async () => {
  // A single-click action in the UI with no confirmation. Refused unconditionally:
  // the realistic outcome is an admin locking themselves out of the page they are
  // looking at.
  const calls = stubUser({ otherAdmin: { _id: 'other' } });
  mock.method(User, 'findById', () => ({
    select: () => ({ _id: 'me', role: 'admin', email: 'me@example.com' })
  }));
  mock.method(User, 'countDocuments', async () => 5);

  const res = fakeRes();
  await adminController.updateUserRole(
    { params: { id: 'me' }, body: { role: 'user' }, user: { _id: 'me', email: 'me@example.com' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /own account/);
  assert.equal(calls.updates.length, 0, 'nothing should be written');
});

test('demoting the only admin is refused', async () => {
  // Unrecoverable through the product: requireAdmin gates every admin route, so
  // with no admins there is no UI path back and the only fix is a database edit.
  stubUser({ otherAdmin: null });
  mock.method(User, 'findById', () => ({
    select: () => ({ _id: 'target-1', role: 'admin', email: 'last@example.com' })
  }));
  mock.method(User, 'countDocuments', async () => 1);

  const res = fakeRes();
  await adminController.updateUserRole(
    { params: { id: 'target-1' }, body: { role: 'user' }, user: { _id: 'me', email: 'me@example.com' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 409);
  assert.match(res.body.error, /only admin/);
});

test('demoting one of several admins is allowed', async () => {
  stubUser({ otherAdmin: { _id: 'other' } });
  mock.method(User, 'findById', () => ({
    select: () => ({ _id: 'target-1', role: 'admin', email: 'other@example.com' })
  }));
  mock.method(User, 'countDocuments', async () => 3);

  const res = fakeRes();
  await adminController.updateUserRole(
    { params: { id: 'target-1' }, body: { role: 'user' }, user: { _id: 'me', email: 'me@example.com' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, 'user');
});

test('promotion is never blocked by the last-admin rule', async () => {
  // The rule must not fire on promotion, or a single-admin instance could never
  // grow.
  stubUser({ otherAdmin: null });
  mock.method(User, 'findById', () => ({
    select: () => ({ _id: 'target-1', role: 'user', email: 'new@example.com' })
  }));
  mock.method(User, 'countDocuments', async () => 1);

  const res = fakeRes();
  await adminController.updateUserRole(
    { params: { id: 'target-1' }, body: { role: 'admin' }, user: { _id: 'me', email: 'me@example.com' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.role, 'admin');
});

test('an invalid role is rejected before any query runs', async () => {
  const calls = stubUser();

  const res = fakeRes();
  await adminController.updateUserRole(
    { params: { id: 'u1' }, body: { role: 'superuser' }, user: { _id: 'me', email: 'a@b.c' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 400);
  assert.equal(calls.findArgs.length, 0, 'nothing should be looked up');
  assert.equal(calls.updates.length, 0, 'nothing should be written');
});

test('a missing user is a 404, not a null body', async () => {
  stubUser();
  mock.method(User, 'findById', () => ({ select: () => null }));

  const res = fakeRes();
  await adminController.updateUserRole(
    { params: { id: 'gone' }, body: { role: 'admin' }, user: { _id: 'me', email: 'a@b.c' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 404);
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

test('user filters are validated against the schema enums', async () => {
  // An unknown value used to reach the query, so `{ role: 'admin ' }` returned an
  // empty page that reads as "no such user" rather than "your filter was invalid".
  const calls = stubUser();

  await adminController.listUsers({ query: { role: 'admin; drop' } }, fakeRes(), failNext);
  assert.deepEqual(calls.countQueries, [{}], 'a bogus role must not reach the query');

  await adminController.listUsers({ query: { role: 'admin' } }, fakeRes(), failNext);
  assert.deepEqual(calls.countQueries[1], { role: 'admin' });
});

test('the verification filter accepts both boolean spellings', async () => {
  const calls = stubUser();

  for (const [value, expected] of [['true', true], ['1', true], ['false', false], ['0', false]]) {
    calls.countQueries = [];
    await adminController.listUsers({ query: { verified: value } }, fakeRes(), failNext);
    assert.deepEqual(calls.countQueries, [{ emailVerified: expected }], `verified=${value}`);
  }
});

test('an unrecognised verification filter is ignored, not applied', async () => {
  const calls = stubUser();

  for (const value of ['maybe', '', 'TRUE']) {
    calls.countQueries = [];
    await adminController.listUsers({ query: { verified: value } }, fakeRes(), failNext);
    assert.deepEqual(calls.countQueries, [{}], `verified=${value} should not filter`);
  }
});

test('the list limit is clamped before it reaches the driver', async () => {
  // The bug: `?limit=1000000` reached the driver untouched, and the `.select()` on
  // a user list then serialised a million users into one JSON response.
  const chain = queryDouble([]);
  mock.method(User, 'find', () => chain);
  mock.method(User, 'countDocuments', async () => 0);

  const res = fakeRes();
  await adminController.listUsers({ query: { limit: '100000' } }, res, failNext);

  assert.ok(chain.appliedLimit <= 100, `limit ${chain.appliedLimit} should be clamped`);
  assert.ok(res.body.limit <= 100);
});

test('a regex metacharacter in search is escaped', async () => {
  // Without escaping, a search for `a.*` matches every user and the admin concludes
  // the filter is broken rather than that they typed a wildcard.
  const calls = stubUser();

  await adminController.listUsers({ query: { search: 'a.*' } }, fakeRes(), failNext);

  const query = calls.findArgs[0];
  assert.ok(query.$or, 'search should build a query');
  assert.equal(query.$or[0].email.source, 'a\\.\\*');
});

test('payment totals only ever count successful payments', async () => {
  // A pending payment is money that has not arrived. Treating it as income is the
  // kind of number that looks fine right up until it is audited.
  mock.method(Payment, 'find', () => queryDouble([]));
  mock.method(Payment, 'countDocuments', async () => 0);
  mock.method(Payment, 'aggregate', async () => [
    { _id: 'success', count: 3, total: 45000 },
    { _id: 'failed', count: 1, total: 15000 }
  ]);

  const res = fakeRes();
  await adminController.listPayments({ query: {} }, res, failNext);

  assert.deepEqual(res.body.totals.successful, { count: 3, total: 45000 });
  assert.deepEqual(res.body.totals.failed, { count: 1, total: 15000 });
  assert.equal(res.body.totals.byStatus.pending, undefined);
});

test('an unknown payment status is ignored rather than matched', async () => {
  const queries = [];
  mock.method(Payment, 'find', (q) => {
    queries.push(q);
    return queryDouble([]);
  });
  mock.method(Payment, 'countDocuments', async () => 0);
  mock.method(Payment, 'aggregate', async () => []);

  await adminController.listPayments({ query: { status: 'refunded' } }, fakeRes(), failNext);

  assert.deepEqual(queries, [{}]);
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

test('revenue is aggregated in the database, not by summing rows', async () => {
  // Reading every payment to total it would load an unbounded number of documents
  // to produce three numbers.
  stubUser();
  stubDashboardCounts();
  mock.method(Contact, 'countDocuments', async () => 0);

  let aggregateCalls = 0;
  mock.method(Payment, 'aggregate', async () => {
    aggregateCalls += 1;
    return [];
  });
  mock.method(Payment, 'countDocuments', async () => 0);
  mock.method(Payment, 'find', () => queryDouble([]));

  const res = fakeRes();
  await adminController.getDashboard({ user: {} }, res, failNext);

  assert.equal(aggregateCalls, 2, 'all-time and this-month are separate aggregations');
  assert.equal(res.body.revenue.averageOrderValue, null, 'null when nothing has sold');
});

test('the average order value is computed from successful payments', async () => {
  stubUser();
  stubDashboardCounts();
  mock.method(Contact, 'countDocuments', async () => 0);
  mock.method(Payment, 'countDocuments', async () => 0);
  mock.method(Payment, 'find', () => queryDouble([]));

  // Two pipelines: all-time (no date bound) and this month (a `$gte` bound).
  mock.method(Payment, 'aggregate', async (pipeline) => (
    pipeline[0].$match.createdAt
      ? [{ _id: null, total: 15000, count: 1 }]
      : [{ _id: null, total: 45000, count: 3 }]
  ));

  const res = fakeRes();
  await adminController.getDashboard({ user: {} }, res, failNext);

  assert.equal(res.body.revenue.averageOrderValue, 15000);
  assert.equal(res.body.revenue.allTime, 45000);
  assert.equal(res.body.revenue.thisMonth, 15000);
});

test('unverified users and open contacts are on the dashboard', async () => {
  // Verification is enforced, so a stuck account is a support case. Counting them
  // turns "someone says they cannot log in" into a number.
  stubUser();
  stubDashboardCounts();
  mock.method(Contact, 'countDocuments', async (q) => {
    // Only the two working states count as "open". Asserted here rather than in
    // the workflow test because the point is what the *dashboard* counts: an
    // inbox badge that includes already-replied messages is wrong even though
    // every transition involved is legal.
    const states = (q && q.status && q.status.$in) || [];
    assert.ok(states.includes('new') && states.includes('read'), 'new and read are the open states');
    assert.ok(!states.includes('replied'), 'a replied message is no longer open work');
    assert.ok(!states.includes('archived'), 'archived was never in the queue');
    return 4;
  });
  mock.method(Payment, 'aggregate', async () => []);
  mock.method(Payment, 'countDocuments', async () => 0);
  mock.method(Payment, 'find', () => queryDouble([]));

  const res = fakeRes();
  await adminController.getDashboard({ user: {} }, res, failNext);

  assert.equal('unverifiedUsers' in res.body.stats, true);
  assert.equal(res.body.stats.openContacts, 4);
});

test('the dashboard reports the live cache backend', async () => {
  stubUser();
  stubDashboardCounts();
  mock.method(Contact, 'countDocuments', async () => 0);
  mock.method(Payment, 'aggregate', async () => []);
  mock.method(Payment, 'countDocuments', async () => 0);
  mock.method(Payment, 'find', () => queryDouble([]));

  const res = fakeRes();
  await adminController.getDashboard({ user: {} }, res, failNext);

  assert.ok(['redis', 'memory'].includes(res.body.system.cache));
});

// ---------------------------------------------------------------------------
// Contact workflow wiring
// ---------------------------------------------------------------------------

test('an invalid transition is a 409 that names the current state', async () => {
  // 409 not 400: the request is well-formed, it conflicts with current state.
  mock.method(Contact, 'findById', async () => ({ _id: 'm1', status: 'archived' }));

  const res = fakeRes();
  await adminController.updateContactStatus(
    { params: { id: 'm1' }, body: { status: 'deleted' }, user: { _id: 'a' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 409);
  assert.ok(Array.isArray(res.body.allowed));
  assert.equal(res.body.currentStatus, 'archived');
});

test('moving to the same status does not restamp the audit fields', async () => {
  // Writing a new statusChangedAt for a change that did not happen makes the audit
  // fields lie about when the message was last touched.
  let wrote = false;
  mock.method(Contact, 'findById', async () => ({ _id: 'm1', status: 'read' }));
  mock.method(Contact, 'findByIdAndUpdate', async () => {
    wrote = true;
    return { populate: () => ({ populate: () => Promise.resolve({}) }) };
  });

  const res = fakeRes();
  await adminController.updateContactStatus(
    { params: { id: 'm1' }, body: { status: 'read' }, user: { _id: 'a' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 200);
  assert.equal(wrote, false, 'no write should happen');
});

test('a missing message is a 404', async () => {
  mock.method(Contact, 'findById', async () => null);

  const res = fakeRes();
  await adminController.updateContactStatus(
    { params: { id: 'gone' }, body: { status: 'read' }, user: { _id: 'a' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 404);
});

test('an over-long or non-text reply is refused before the write', async () => {
  // `findByIdAndUpdate` does not run validators by default, so the schema's
  // maxlength would not stop a 50k-character reply being stored.
  mock.method(Contact, 'findById', async () => ({ _id: 'm1', status: 'read' }));
  let wrote = false;
  mock.method(Contact, 'findByIdAndUpdate', async () => {
    wrote = true;
    return { populate: () => ({ populate: () => Promise.resolve({}) }) };
  });

  const long = fakeRes();
  await adminController.updateContactStatus(
    { params: { id: 'm1' }, body: { status: 'replied', reply: 'x'.repeat(5001) }, user: { _id: 'a' } },
    long,
    failNext
  );
  assert.equal(long.statusCode, 400);

  const object = fakeRes();
  await adminController.updateContactStatus(
    { params: { id: 'm1' }, body: { status: 'replied', reply: { $ne: null } }, user: { _id: 'a' } },
    object,
    failNext
  );
  assert.equal(object.statusCode, 400, 'a query object must not be cast into a String field');

  assert.equal(wrote, false, 'neither should reach the database');
});

test('marking verified clears the outstanding verification token', async () => {
  // Otherwise a link that was explicitly revoked here can still be used later.
  const calls = stubUser();

  const res = fakeRes();
  await adminController.setUserVerified(
    { params: { id: 'u1' }, body: { emailVerified: true }, user: { _id: 'a', email: 'a@b.c' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 200);
  const update = calls.updates[calls.updates.length - 1].update;
  assert.equal(update.emailVerified, true);
  assert.equal(update.emailVerificationToken, null);
});

test('un-verifying does not clear the token', async () => {
  // The account can still complete verification from the email already in flight.
  const calls = stubUser();

  await adminController.setUserVerified(
    { params: { id: 'u1' }, body: { emailVerified: false }, user: { _id: 'a', email: 'a@b.c' } },
    fakeRes(),
    failNext
  );

  const update = calls.updates[calls.updates.length - 1].update;
  assert.equal(update.emailVerified, false);
  assert.ok(!('emailVerificationToken' in update));
});

test('emailVerified must be a real boolean', async () => {
  // `req.body.emailVerified` is the string "false" from a form post, which is
  // truthy — so an untyped value would mark an account verified when the admin
  // asked for the opposite.
  const calls = stubUser();

  const res = fakeRes();
  await adminController.setUserVerified(
    { params: { id: 'u1' }, body: { emailVerified: 'false' }, user: { _id: 'a' } },
    res,
    failNext
  );

  assert.equal(res.statusCode, 400);
  assert.equal(calls.updates.length, 0);
});

test('the contact list reports counts for every status', async () => {
  // A badge reading 0 for a status that has messages is a bug the admin cannot
  // see, so absent statuses are reported as 0 rather than omitted.
  mock.method(Contact, 'find', () => queryDouble([]));
  mock.method(Contact, 'countDocuments', async () => 0);
  mock.method(Contact, 'aggregate', async () => [{ _id: 'new', count: 5 }]);

  const res = fakeRes();
  await adminController.listContacts({ query: {} }, res, failNext);

  assert.equal(res.body.counts.new, 5);
  assert.equal(res.body.counts.read, 0);
  assert.equal(res.body.counts.replied, 0);
  assert.equal(res.body.counts.archived, 0);
  assert.equal(res.body.open, 5, 'open sums the two working states');
});
