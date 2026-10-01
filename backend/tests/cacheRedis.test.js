const { test } = require('node:test');
const assert = require('node:assert/strict');

// Exercises the Redis branch of the cache, which the in-process tests never
// reach. A fake client stands in for ioredis so this stays hermetic — no Redis
// server, no network.

const REDIS_PATH = require.resolve('../config/redis');
const CACHE_PATH = require.resolve('../middleware/cache');

/** Minimal ioredis stand-in covering only the commands the cache issues. */
function makeFakeClient() {
  const data = new Map();
  const calls = { set: [], del: [], get: [] };

  return {
    data,
    calls,
    client: {
      status: 'ready',
      async get(key) {
        calls.get.push(key);
        return data.has(key) ? data.get(key) : null;
      },
      async set(key, value) {
        calls.set.push({ key, value });
        data.set(key, value);
        return 'OK';
      },
      async del(...keys) {
        calls.del.push(keys);
        let removed = 0;
        for (const key of keys) {
          if (data.delete(key)) removed += 1;
        }
        return removed;
      },
      scanStream({ match }) {
        const prefix = match.replace(/\*$/, '');
        const found = [...data.keys()].filter((key) => key.startsWith(prefix));
        let yielded = false;
        return {
          async *[Symbol.asyncIterator]() {
            if (yielded) return;
            yielded = true;
            yield found;
          }
        };
      }
    }
  };
}

/**
 * Load cache.js against a stubbed config/redis. Returns the cache module plus
 * helpers to control the fake connection.
 */
function loadCacheWithFakeRedis({ ready = true } = {}) {
  const fake = makeFakeClient();
  const errors = [];
  let isReady = ready;

  const stub = {
    isConfigured: () => true,
    isReady: () => isReady,
    getClient: () => fake.client,
    noteError: (err) => errors.push(err)
  };

  require.cache[REDIS_PATH] = { id: REDIS_PATH, filename: REDIS_PATH, loaded: true, exports: stub };
  delete require.cache[CACHE_PATH];
  const cache = require('../middleware/cache');

  return {
    cache,
    fake,
    errors,
    setReady: (value) => {
      isReady = value;
    },
    cleanup: () => {
      delete require.cache[CACHE_PATH];
      delete require.cache[REDIS_PATH];
    }
  };
}

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

test('a miss is written to Redis and the next request is served from it', async () => {
  const { cache, fake, cleanup } = loadCacheWithFakeRedis();
  try {
    const middleware = cache.cacheMiddleware(60);
    const req = { method: 'GET', originalUrl: '/api/redis-cache-miss', user: undefined };

    let calls = 0;
    const first = makeRes();
    await middleware(req, first, () => {
      calls += 1;
      first.json({ from: 'handler' });
    });

    // The write is fire-and-forget inside res.json, so let the microtask queue
    // drain before inspecting the fake.
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(calls, 1);
    assert.equal(first.headers['X-Cache'], 'MISS');
    assert.equal(fake.calls.set.length, 1, 'a successful response must be cached in Redis');
    assert.equal(fake.calls.set[0].key, 'cvboost:cache:/api/redis-cache-miss:anon');

    const second = makeRes();
    await middleware(req, second, () => {
      calls += 1;
      second.json({ from: 'handler again' });
    });

    assert.equal(calls, 1, 'the handler must not run on a Redis hit');
    assert.equal(second.headers['X-Cache'], 'HIT');
    assert.deepEqual(second.body, { from: 'handler' });
  } finally {
    cleanup();
  }
});

test('invalidateCache deletes matching keys from Redis and only those', async () => {
  const { cache, fake, cleanup } = loadCacheWithFakeRedis();
  try {
    const middleware = cache.cacheMiddleware(60);
    const target = '/api/cv/list:user-42';

    for (const url of [target, '/api/cv/list:user-99', '/api/other']) {
      const res = makeRes();
      await middleware({ method: 'GET', originalUrl: url, user: undefined }, res, () => res.json({ url }));
    }
    await new Promise((resolve) => setImmediate(resolve));

    await cache.invalidateCache(target);

    assert.equal(fake.data.has(`cvboost:cache:${target}:anon`), false, 'the target key must be gone');
    assert.equal(fake.data.has('cvboost:cache:/api/cv/list:user-99:anon'), true);
    assert.equal(fake.data.has('cvboost:cache:/api/other:anon'), true);
  } finally {
    cleanup();
  }
});

test('a Redis read failure falls back to the in-process store', async () => {
  // Redis reports ready, then the GET throws. The request must still complete;
  // the cache degrades, the app does not.
  const { cache, fake, errors, cleanup } = loadCacheWithFakeRedis();
  try {
    fake.client.get = async () => {
      throw new Error('connection reset');
    };

    const middleware = cache.cacheMiddleware(60);
    const req = { method: 'GET', originalUrl: '/api/redis-failure', user: undefined };

    const res = makeRes();
    await middleware(req, res, () => res.json({ ok: true }));

    assert.deepEqual(res.body, { ok: true });
    assert.equal(res.headers['X-Cache'], 'MISS');
    assert.equal(errors.length >= 1, true, 'the failure should be reported through noteError');
  } finally {
    cleanup();
  }
});

test('with Redis not ready nothing is written to Redis', async () => {
  const { cache, fake, cleanup } = loadCacheWithFakeRedis({ ready: false });
  try {
    const middleware = cache.cacheMiddleware(60);
    const res = makeRes();
    await middleware(
      { method: 'GET', originalUrl: '/api/redis-not-ready', user: undefined },
      res,
      () => res.json({ ok: true })
    );
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(fake.calls.set.length, 0, 'a reconnecting Redis must not be used');
    assert.equal(fake.calls.get.length, 0);
  } finally {
    cleanup();
  }
});
