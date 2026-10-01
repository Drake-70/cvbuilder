const { test } = require('node:test');
const assert = require('node:assert/strict');

const MODULE_PATH = require.resolve('../config/redis');

/** Load config/redis with a specific REDIS_URL, bypassing the require cache. */
function loadWith(url) {
  const previous = process.env.REDIS_URL;
  if (url === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = url;

  delete require.cache[MODULE_PATH];
  const mod = require('../config/redis');

  if (previous === undefined) delete process.env.REDIS_URL;
  else process.env.REDIS_URL = previous;

  return mod;
}

test('with REDIS_URL unset nothing connects and nothing throws', () => {
  const redis = loadWith(undefined);
  assert.equal(redis.isConfigured(), false);
  assert.equal(redis.isReady(), false);
  assert.equal(redis.getClient(), null);
});

test('noteError is safe to call when Redis is not configured', () => {
  // Every caller invokes this from a catch block; if it could throw, a Redis
  // blip would surface as an unhandled exception instead of a fallback.
  const redis = loadWith(undefined);
  assert.doesNotThrow(() => redis.noteError(new Error('boom')));
});

test('a configured but unreachable Redis is not reported as ready', () => {
  // Serves a deliberately invalid port, so the socket never becomes ready.
  const redis = loadWith('redis://127.0.0.1:1');
  try {
    assert.equal(redis.isConfigured(), true);
    assert.equal(
      redis.isReady(),
      false,
      'isReady must reflect the live socket, not just the presence of a URL'
    );
    assert.ok(redis.getClient(), 'a client should exist so the store can use it');
  } finally {
    // Leaves no reconnect loop behind to hold the test process open.
    redis.getClient().disconnect();
    delete require.cache[MODULE_PATH];
  }
});

test('an empty REDIS_URL is treated as unconfigured', () => {
  // An env var present but blank (a common host-dashboard mistake) must not
  // produce a client that fails every command.
  const redis = loadWith('');
  assert.equal(redis.isConfigured(), false);
  assert.equal(redis.getClient(), null);
});

test('an unparseable REDIS_URL degrades instead of killing the process', () => {
  // ioredis parses the URL eagerly and throws on a value it cannot parse — a
  // stray space, or a pasted REST URL fragment. That throw happened while this
  // module was being required, before any log line, so a typo in an optional
  // dependency took down the whole deploy. "Redis is optional" has to survive
  // the URL being wrong, not just the socket being down.
  let redis = null;
  assert.doesNotThrow(() => {
    redis = loadWith('not a url');
  }, 'requiring config/redis must never throw');

  try {
    assert.equal(redis.isConfigured(), false);
    assert.equal(redis.getClient(), null);
    assert.equal(redis.isReady(), false);
  } finally {
    delete require.cache[MODULE_PATH];
  }
});
