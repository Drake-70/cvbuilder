const { test } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');

// A Redis outage must not turn into an application outage. Every limiter in
// server.js sets passOnStoreError, and this pins that behaviour: the store
// rejects every command, and the route still answers.

/** Start the app on an ephemeral port and return a fetcher bound to it. */
async function withServer(build) {
  const app = express();
  app.set('trust proxy', 1);
  build(app);

  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const { port } = server.address();
  return {
    get: (path) => fetch(`http://127.0.0.1:${port}${path}`),
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

test('a rejecting Redis store fails open when passOnStoreError is set', async () => {
  const store = new RedisStore({
    prefix: 'test:rl:failopen:',
    sendCommand: () => Promise.reject(new Error('redis unreachable'))
  });

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 3,
    store,
    passOnStoreError: true,
    standardHeaders: true,
    legacyHeaders: false
  });

  const server = await withServer((app) => {
    app.get('/probe', limiter, (_req, res) => res.json({ ok: true }));
  });

  try {
    // More requests than `max`: with a working store the first three would pass
    // and the rest would be 429. Failing open means all of them pass.
    for (let i = 0; i < 5; i += 1) {
      const response = await server.get('/probe');
      assert.equal(
        response.status,
        200,
        `request ${i + 1} should have been allowed through during a Redis outage`
      );
    }
  } finally {
    await server.close();
  }
});

test('a working store still enforces the limit', async () => {
  // Contradicts nothing above: it proves the limiter is genuinely consulting the
  // store, so the fail-open test is not passing because the store is ignored.
  const counters = new Map();

  const store = {
    init: () => {},
    increment: async (key) => {
      const total = (counters.get(key) || 0) + 1;
      counters.set(key, total);
      return { totalHits: total, resetTime: new Date(Date.now() + 60_000) };
    },
    decrement: async (key) => {
      counters.set(key, (counters.get(key) || 1) - 1);
    },
    resetKey: async (key) => {
      counters.delete(key);
    }
  };

  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 2,
    store,
    standardHeaders: true,
    legacyHeaders: false
  });

  const server = await withServer((app) => {
    app.get('/probe', limiter, (_req, res) => res.json({ ok: true }));
  });

  try {
    assert.equal((await server.get('/probe')).status, 200);
    assert.equal((await server.get('/probe')).status, 200);
    const blocked = await server.get('/probe');
    assert.equal(blocked.status, 429);
  } finally {
    await server.close();
  }
});
