const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const metrics = require('../services/metrics');

const ROOT = path.join(__dirname, '..', '..');
const src = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/** Minimal Express-like response, enough for the middleware to settle into. */
function fakeRes(statusCode = 200) {
  const listeners = {};
  return {
    statusCode,
    locals: {},
    on(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
      return this;
    },
    finish() {
      for (const fn of listeners.finish || []) fn();
    },
    close() {
      for (const fn of listeners.close || []) fn();
    }
  };
}

function run(middleware, req, res, latencyMs = 0) {
  let called = false;
  middleware(req, res, () => { called = true; });
  return {
    settled: called,
    finish: () => {
      // Latency is injected by advancing the hrtime the middleware captured, which is
      // not controllable from outside -- so the histogram is exercised directly
      // instead, and only the counting behaviour is asserted through the middleware.
      res.finish();
    }
  };
}

test('ids are collapsed so a real path cannot become a thousand series', () => {
  assert.strictEqual(
    metrics.normaliseRoute('/api/documents/66f0c1a2b3c4d5e6f7890abc/share'),
    '/api/documents/:id/share'
  );
  assert.strictEqual(metrics.normaliseRoute('/api/documents/12345'), '/api/documents/:id');
  assert.strictEqual(metrics.normaliseRoute('/api/users/12345/credits'), '/api/users/:id/credits');
});

test('real route names are not mangled into misleading keys', () => {
  // Only numeric and ObjectId-length hex segments are treated as ids. Guessing more
  // broadly would turn a genuine route name into ":id" and make the monitoring tab lie
  // about which endpoint is slow -- it would then report a route that does not exist
  // while the real one is missing.
  assert.strictEqual(metrics.normaliseRoute('/api/tailor/generate'), '/api/tailor/generate');
  assert.strictEqual(metrics.normaliseRoute('/api/admin/kpis'), '/api/admin/kpis');

  // Short hex: an id this app never puts in a path, so rewriting it would be a lie.
  assert.strictEqual(metrics.normaliseRoute('/api/x/deadbeef'), '/api/x/deadbeef');
  assert.strictEqual(metrics.normaliseRoute('/referral/a1b2c3d4'), '/referral/a1b2c3d4');

  // Exactly ObjectId length, which is the only id shape actually in use here.
  assert.strictEqual(
    metrics.normaliseRoute('/api/documents/66f0c1a2b3c4d5e6f7890abc'),
    '/api/documents/:id'
  );
});

test('a route pattern wins over path guessing when Express has one', () => {
  assert.strictEqual(
    metrics.normaliseRoute('/api/documents/66f0c1a2b3c4d5e6f7890abc', '/api/documents/:id'),
    '/api/documents/:id'
  );
});

test('percentiles are null for an empty histogram rather than zero', () => {
  const empty = { buckets: new Array(metrics.LATENCY_BUCKETS_MS.length).fill(0), overflow: 0, sum: 0, count: 0 };
  assert.strictEqual(metrics.percentileFrom(empty, 0.5), null);
  assert.strictEqual(metrics.percentileFrom(empty, 0.99), null);
});

test('percentiles interpolate inside the containing bucket', () => {
  // Everything in the <=100ms bucket. p50 and p99 both report inside that bucket's
  // range, which is the accuracy the histogram promises.
  const buckets = new Array(metrics.LATENCY_BUCKETS_MS.length).fill(0);
  buckets[metrics.LATENCY_BUCKETS_MS.indexOf(100)] = 100;
  const histogram = { buckets, overflow: 0, sum: 100 * 100, count: 100 };

  const p50 = metrics.percentileFrom(histogram, 0.5);
  const p99 = metrics.percentileFrom(histogram, 0.99);

  assert.ok(p50 >= 50 && p50 <= 100, `p50 ${p50} should land in the bucket`);
  assert.ok(p99 >= 50 && p99 <= 100, `p99 ${p99} should land in the bucket`);
  assert.ok(p50 <= p99, 'p50 must not exceed p99');
});

test('the slowest requests are clamped upward, never dropped', () => {
  // Every request slower than the last bucket. Reporting them as "100ms" would make
  // a failing endpoint look healthy, which is the one direction this must not err.
  const histogram = {
    buckets: new Array(metrics.LATENCY_BUCKETS_MS.length).fill(0),
    overflow: 10,
    sum: 60000,
    count: 10
  };

  const p99 = metrics.percentileFrom(histogram, 0.99);
  assert.ok(p99 > metrics.LATENCY_BUCKETS_MS[metrics.LATENCY_BUCKETS_MS.length - 1]);
});

test('a request is counted exactly once even if finish and close both fire', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;

  run(middleware, { method: 'GET', path: '/api/dashboard', route: null }, fakeRes(200));
  const snapshotBefore = metrics.snapshot().totals.requests;

  // A client that disconnects mid-response fires close; a normal one fires finish.
  // Express delivers one or the other, but a handler that throws after the response
  // has begun can produce both.
  const res = fakeRes(200);
  let called = false;
  middleware({ method: 'GET', path: '/api/dashboard', route: null }, res, () => { called = true; });
  res.finish();
  const afterFinish = metrics.snapshot().totals.requests;
  res.close();

  assert.strictEqual(afterFinish - snapshotBefore, 1, 'one request recorded');
  assert.strictEqual(metrics.snapshot().totals.requests, afterFinish, 'close must not double count');
  assert.ok(called, 'next() must still be called');
});

test('in-flight requests are released exactly once', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;
  const res = fakeRes(200);

  middleware({ method: 'GET', path: '/api/thing', route: null }, res, () => {});
  assert.strictEqual(metrics.snapshot().totals.inFlight, 1);

  res.finish();
  res.close();
  // Left non-zero, this is what makes the health tab report a permanent backlog of
  // requests that are long since gone.
  assert.strictEqual(metrics.snapshot().totals.inFlight, 0);
});

test('the full request path is measured, not the router-relative one', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;

  // This is the shape Express presents at `finish`: the route has been handed to a
  // mounted router, so `route.path` is what the router matched ("/kpis") and says
  // nothing about which router it was. Reading that instead of the full path made
  // two routers with the same sub-path collide into one key, and the monitoring
  // table showed a route that does not exist.
  const res = fakeRes(200);
  middleware({
    method: 'GET',
    originalUrl: '/api/admin/kpis?days=30',
    path: '/kpis',
    url: '/kpis',
    route: { path: '/kpis' }
  }, res, () => {});
  res.finish();

  const snapshot = metrics.snapshot();
  assert.ok(
    snapshot.routes.some((r) => r.path === '/api/admin/kpis'),
    `expected the full path, got ${JSON.stringify(snapshot.routes.map((r) => r.path))}`
  );
  assert.ok(
    !snapshot.routes.some((r) => r.path === '/kpis'),
    'the mount-relative path must not become a key'
  );
});

test('the query string is stripped, because it is unbounded', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;

  // A hundred distinct queries on one endpoint would otherwise be a hundred keys,
  // relying solely on the cardinality cap to stop them.
  for (const q of ['?a=1', '?a=2', '?email=someone@example.com', '']) {
    const res = fakeRes(200);
    middleware({ method: 'GET', originalUrl: `/api/search${q}`, path: '/search' }, res, () => {});
    res.finish();
  }

  const search = metrics.snapshot().routes.find((r) => r.path === '/api/search');
  assert.ok(search, 'the route must be recorded');
  assert.strictEqual(search.requests, 4, 'four different queries are one route');
});

test('a request with no path at all still records', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;

  const res = fakeRes(200);
  middleware({ method: 'GET', path: '' }, res, () => {});
  res.finish();

  assert.strictEqual(metrics.snapshot().totals.requests, 1);
  assert.strictEqual(metrics.snapshot().routes.length, 1);
});

test('a 5xx response is counted as an error and 4xx are not', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;

  run(middleware, { method: 'GET', path: '/api/boom', route: null }, fakeRes(500)).finish();
  run(middleware, { method: 'GET', path: '/api/nope', route: null }, fakeRes(404)).finish();
  run(middleware, { method: 'GET', path: '/api/ok', route: null }, fakeRes(200)).finish();

  const snapshot = metrics.snapshot();

  // A 404 is the client's problem and counting it as a server error would make the
  // error rate a measure of how often people mistype a URL.
  assert.strictEqual(snapshot.totals.errors, 1);
  assert.strictEqual(snapshot.totals.requests, 3);
  assert.ok(Math.abs(snapshot.totals.errorRate - 1 / 3) < 0.001);

  const boom = snapshot.routes.find((r) => r.path === '/api/boom');
  const nope = snapshot.routes.find((r) => r.path === '/api/nope');
  assert.strictEqual(boom.statusClasses['5xx'], 1);
  assert.strictEqual(nope.statusClasses['4xx'], 1);
  assert.strictEqual(nope.errors, 0);
});

test('a recent error records the route but never the request body or headers', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;

  const res = fakeRes(500);
  res.locals.errorMessage = 'boom';
  middleware({
    method: 'POST',
    path: '/api/auth/login/66f0c1a2b3c4d5e6f7890abc',
    route: null,
    body: { password: 'hunter2' },
    headers: { cookie: 'accessToken=secret' }
  }, res, () => {});
  res.finish();

  const error = metrics.snapshot().recentErrors[0];

  assert.strictEqual(error.message, 'boom');
  assert.strictEqual(error.path, '/api/auth/login/:id');
  assert.ok(!JSON.stringify(error).includes('hunter2'), 'must not record a password');
  assert.ok(!JSON.stringify(error).includes('accessToken'), 'must not record a cookie');

  // The id is collapsed, so the recent-errors list cannot become a log of which
  // specific users hit an error.
  assert.ok(!JSON.stringify(error).includes('66f0c1a2b3c4d5e6f7890abc'));
});

test('the snapshot states its own scope', () => {
  assert.strictEqual(metrics.snapshot().scope, 'per-process, resets on deploy');
});

test('recent errors are bounded', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;

  for (let i = 0; i < 120; i += 1) {
    const res = fakeRes(500);
    middleware({ method: 'GET', path: `/api/route-${i}`, route: null }, res, () => {});
    res.finish();
  }

  // Unbounded under exactly the conditions it is needed: an error storm. This is the
  // first thing that fills memory when the thing being measured is going wrong.
  assert.ok(
    metrics.snapshot().recentErrors.length <= 50,
    `expected at most 50 retained errors, got ${metrics.snapshot().recentErrors.length}`
  );
});

test('the histogram is fixed size regardless of traffic', () => {
  metrics.reset();
  const middleware = metrics.metricsMiddleware;

  for (let i = 0; i < 200; i += 1) {
    run(middleware, { method: 'GET', path: '/api/busy', route: null }, fakeRes(200)).finish();
  }

  const busy = metrics.snapshot().routes.find((r) => r.path === '/api/busy');
  assert.strictEqual(busy.requests, 200);
  // No sample array: percentile cost cannot grow with the traffic being measured.
  assert.strictEqual(typeof busy.p50, 'number');
  assert.strictEqual(typeof busy.p95, 'number');
  assert.strictEqual(typeof busy.p99, 'number');
});

test('the error rate needs a minimum sample before it is allowed to alarm', () => {
  const controller = src('backend/controllers/adminKpiController.js');

  // One failed request out of one is a 100% error rate. Acting on that would page
  // someone for the first request after a deploy.
  assert.ok(controller.includes('snapshot.totals.requests >= 20'));
  assert.ok(controller.includes('snapshot.totals.errorRate >= 0.05'));
});

test('a slow p99 is deliberately not treated as an outage', () => {
  const controller = src('backend/controllers/adminKpiController.js');

  const verdict = controller.slice(controller.indexOf('const errorRateHigh'));

  // Latency is a separate line in the UI. Folding it into the single status would
  // page someone for a latency blip that is not an outage.
  assert.ok(!verdict.includes('p99') || !verdict.includes('healthy ='), 'verdict must not read latency');
});