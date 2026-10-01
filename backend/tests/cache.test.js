const { test } = require('node:test');
const assert = require('node:assert/strict');

// These tests exercise the in-process backend, which is what runs whenever
// REDIS_URL is unset — the common case locally and the fallback whenever Redis
// is unreachable. cache.js reads the env at require time, so this must be
// deleted before it is loaded.
delete process.env.REDIS_URL;

const { cacheMiddleware, invalidateCache } = require('../middleware/cache');

/** Minimal Express response stand-in that records what was written. */
function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    set(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

test('a cache miss runs the handler and a repeat request is served from cache', async () => {
  const middleware = cacheMiddleware(60);
  const req = { method: 'GET', originalUrl: '/api/cache-test-miss', user: undefined };

  let handlerCalls = 0;
  const first = makeRes();
  await middleware(req, first, () => {
    handlerCalls += 1;
    first.json({ value: 42 });
  });

  assert.equal(handlerCalls, 1);
  assert.equal(first.headers['X-Cache'], 'MISS');
  assert.deepEqual(first.body, { value: 42 });

  const second = makeRes();
  await middleware(req, second, () => {
    handlerCalls += 1;
    second.json({ value: 'should not be reached' });
  });

  assert.equal(handlerCalls, 1, 'the handler must not run again on a hit');
  assert.equal(second.headers['X-Cache'], 'HIT');
  assert.deepEqual(second.body, { value: 42 });
});

test('invalidateCache drops matching entries but leaves others alone', async () => {
  const middleware = cacheMiddleware(60);
  const userId = 'user-invalidate';

  const warm = makeRes();
  await middleware(
    { method: 'GET', originalUrl: `/api/cv/list:${userId}`, user: undefined },
    warm,
    () => warm.json({ cv: 1 })
  );

  const otherWarm = makeRes();
  await middleware(
    { method: 'GET', originalUrl: '/api/other-list', user: undefined },
    otherWarm,
    () => otherWarm.json({ other: 1 })
  );

  await invalidateCache(`/api/cv/list:${userId}`);

  let ran = false;
  const afterInvalidate = makeRes();
  await middleware(
    { method: 'GET', originalUrl: `/api/cv/list:${userId}`, user: undefined },
    afterInvalidate,
    () => {
      ran = true;
      afterInvalidate.json({ cv: 2 });
    }
  );
  assert.equal(ran, true, 'the invalidated key must be recomputed');
  assert.deepEqual(afterInvalidate.body, { cv: 2 });

  const stillCached = makeRes();
  await middleware(
    { method: 'GET', originalUrl: '/api/other-list', user: undefined },
    stillCached,
    () => stillCached.json({ other: 'recomputed' })
  );
  assert.deepEqual(stillCached.body, { other: 1 }, 'an unrelated key must survive');
});

test('only successful GET responses are cached', async () => {
  const middleware = cacheMiddleware(60);
  const req = { method: 'GET', originalUrl: '/api/cache-test-error', user: undefined };

  const failed = makeRes();
  await middleware(req, failed, () => {
    failed.status(500).json({ error: 'nope' });
  });

  let ran = false;
  const retry = makeRes();
  await middleware(req, retry, () => {
    ran = true;
    retry.json({ ok: true });
  });
  assert.equal(ran, true, 'a 500 must not be cached');
});

test('a non-GET request bypasses the cache entirely', async () => {
  const middleware = cacheMiddleware(60);
  const req = { method: 'POST', originalUrl: '/api/cache-test-post', user: undefined };

  for (let i = 0; i < 2; i += 1) {
    let ran = false;
    const res = makeRes();
    await middleware(req, res, () => {
      ran = true;
      res.json({ i });
    });
    assert.equal(ran, true, 'POST must always reach the handler');
    assert.equal(res.headers['X-Cache'], undefined);
  }
});

test('memoryOnly skips Redis and still caches in process', async () => {
  // /api/health uses this so Render's frequent probes do not spend a metered
  // Redis command each.
  const middleware = cacheMiddleware(30, undefined, { memoryOnly: true });
  const req = { method: 'GET', originalUrl: '/api/health-test', user: undefined };

  let calls = 0;
  const first = makeRes();
  await middleware(req, first, () => {
    calls += 1;
    first.json({ status: 'ok' });
  });
  const second = makeRes();
  await middleware(req, second, () => {
    calls += 1;
    second.json({ status: 'ok' });
  });

  assert.equal(calls, 1, 'the second request must be served from memory');
  assert.equal(second.headers['X-Cache'], 'HIT');
});

test('a custom key function separates cached responses per caller', async () => {
  const middleware = cacheMiddleware(60, (req) => `/api/per-user:${req.user?._id}`);

  const warm = makeRes();
  await middleware(
    { method: 'GET', originalUrl: '/api/per-user', user: { _id: 'alice' } },
    warm,
    () => warm.json({ owner: 'alice' })
  );

  let ran = false;
  const bob = makeRes();
  await middleware(
    { method: 'GET', originalUrl: '/api/per-user', user: { _id: 'bob' } },
    bob,
    () => {
      ran = true;
      bob.json({ owner: 'bob' });
    }
  );

  assert.equal(ran, true, 'a different user must not receive another user\'s cache entry');
  assert.deepEqual(bob.body, { owner: 'bob' });
});
