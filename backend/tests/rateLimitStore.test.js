const { test, mock } = require('node:test');
const assert = require('node:assert/strict');

const redis = require('../config/redis');
const rateLimitRedis = require('rate-limit-redis');

const MODULE_PATH = require.resolve('../middleware/rateLimitStore');

/**
 * Stand-in for `RedisStore`, able to reproduce the production failure: `init()`
 * rejecting because the SCRIPT LOAD was issued before the socket opened.
 *
 * `instances` counts constructions and `initCalls` counts attempts, which is how
 * the tests tell "never built" from "built, failed, and retried" apart.
 *
 * A factory returning an object literal rather than a class on purpose:
 * `mock.method` installs a MockFunction whose prototype is not the class's, so a
 * `new`-ed instance of a mocked class silently loses its methods and the test
 * would fail for a reason that has nothing to do with the code under test.
 */
function makeFakeRedisStore() {
  const state = { instances: 0, initCalls: 0, failInit: false, totalHits: 7 };

  function FakeRedisStore(options) {
    state.instances++;

    // Mirrors the real class: init() assigns the SCRIPT LOAD promise to
    // `incrementScriptSha`, and increment() awaits it. A rejected value is
    // precisely what made the original store permanently broken.
    const store = {
      prefix: options.prefix,
      windowMs: 0,
      incrementScriptSha: null,

      async init(opts) {
        state.initCalls++;
        store.windowMs = opts.windowMs;
        if (state.failInit) {
          store.incrementScriptSha = Promise.reject(
            new Error("Stream isn't writeable and enableOfflineQueue options is false")
          );
          // Attach a handler so this rejection is not reported as unhandled
          // before init() throws; init() still throws to the caller.
          store.incrementScriptSha.catch(() => {});
          throw store.incrementScriptSha;
        }
        store.incrementScriptSha = Promise.resolve('sha');
      },

      async increment() {
        await store.incrementScriptSha;
        return { totalHits: state.totalHits, resetTime: Date.now() + 1000 };
      },

      async decrement() {},
      async resetKey() {},
      async get() { return { totalHits: state.totalHits, resetTime: Date.now() + 1000 }; },
      async shutdown() {}
    };

    return store;
  }

  return { FakeStore: FakeRedisStore, state };
}

/**
 * Load the real factory with `RedisStore` and the readiness gate stubbed.
 *
 * The stub on `rate-limit-redis` must be installed before this module is
 * required, because it destructures `RedisStore` at require time.
 */
function loadFactory({ ready, fake }) {
  delete require.cache[MODULE_PATH];
  mock.method(rateLimitRedis, 'RedisStore', fake);
  const { limiterStore } = require('../middleware/rateLimitStore');
  return limiterStore;
}

const OPTIONS = { windowMs: 60 * 1000, limit: 10, prefix: 'ignored' };

test.afterEach(() => {
  mock.restoreAll();
  delete require.cache[MODULE_PATH];
});

test('no store is built at require time, so nothing touches a closed socket', () => {
  // The production failure, stated as its precondition: `RedisStore.init()`
  // issues a SCRIPT LOAD the instant the store exists, and `config/redis` runs
  // with `enableOfflineQueue: false`, so a store built during boot has its
  // script load rejected and every later increment awaits that rejection. With
  // `passOnStoreError` the limiter then allows everything, so rate limiting
  // disables itself silently.
  const { FakeStore, state } = makeFakeRedisStore();
  mock.method(redis, 'isConfigured', () => true);
  mock.method(redis, 'isReady', () => false);

  const limiterStore = loadFactory({ ready: false, fake: FakeStore });
  const store = limiterStore('cvboost:rl:general:');

  assert.ok(store, 'a store object is still returned, so express-rate-limit configures it');
  assert.equal(state.instances, 0, 'constructing the store is what triggers the SCRIPT LOAD');
  assert.equal(state.initCalls, 0, 'init must not run before Redis is ready');
});

test('counts come from memory until Redis is ready, then from Redis', async () => {
  // Warm-up must not be an unlimited window. While Redis is still connecting
  // the limiter still counts — in memory — so the fail-open gap is short rather
  // than the whole process lifetime.
  const { FakeStore, state } = makeFakeRedisStore();
  let ready = false;
  mock.method(redis, 'isConfigured', () => true);
  mock.method(redis, 'isReady', () => ready);

  const store = loadFactory({ ready, fake: FakeStore })('cvboost:rl:general:');
  await store.init(OPTIONS);

  const beforeReady = await store.increment('ip:1');
  assert.equal(beforeReady.totalHits, 1, 'memory counts during warm-up');
  assert.equal(state.instances, 0, 'still no Redis store while not ready');

  ready = true;
  const afterReady = await store.increment('ip:2');
  assert.equal(state.instances, 1, 'the Redis store is built on first use once ready');
  assert.equal(state.initCalls, 1, 'init runs exactly once');
  assert.equal(afterReady.totalHits, state.totalHits, 'counts come from Redis once bound');
});

test('a bind that fails is retried instead of cached broken', async () => {
  // The regression in its own shape. `init()` caches its SCRIPT LOAD promise as
  // `incrementScriptSha`; a rejected one poisons every later increment. The
  // adapter must therefore *discard* a failed store, so a later request can
  // bind successfully.
  const { FakeStore, state } = makeFakeRedisStore();
  state.failInit = true;

  mock.method(redis, 'isConfigured', () => true);
  mock.method(redis, 'isReady', () => true);

  const store = loadFactory({ ready: true, fake: FakeStore })('cvboost:rl:general:');
  await store.init(OPTIONS);

  const failed = await store.increment('ip:1');
  assert.equal(failed.totalHits, 1, 'a failed bind falls back to memory, and still counts');
  assert.equal(state.initCalls, 1);

  // Redis recovers.
  state.failInit = false;
  const recovered = await store.increment('ip:2');
  assert.equal(state.instances, 2, 'a fresh store is built rather than reusing the broken one');
  assert.equal(recovered.totalHits, state.totalHits, 'the retried bind is used');
});

test('concurrent first requests share one bind', async () => {
  // Five simultaneous requests on a cold start must not each construct a store
  // and each fire a SCRIPT LOAD; `passOnStoreError` exists to survive outages,
  // not to hide a stampede of redundant connections.
  const { FakeStore, state } = makeFakeRedisStore();
  mock.method(redis, 'isConfigured', () => true);
  mock.method(redis, 'isReady', () => true);

  const store = loadFactory({ ready: true, fake: FakeStore })('cvboost:rl:general:');
  await store.init(OPTIONS);

  await Promise.all([store.increment('ip:1'), store.increment('ip:2'), store.increment('ip:3')]);

  assert.equal(state.instances, 1, 'one store for concurrent callers');
  assert.equal(state.initCalls, 1, 'one script load for concurrent callers');
});

test('a store is never constructed when Redis is not configured', () => {
  // Unchanged behaviour: no Redis means no store object, so express-rate-limit
  // uses its own in-process MemoryStore. Constructing one here would be a
  // guaranteed crash, since there is no client to send commands through.
  const { FakeStore, state } = makeFakeRedisStore();
  mock.method(redis, 'isConfigured', () => false);
  mock.method(redis, 'isReady', () => false);

  const limiterStore = loadFactory({ ready: false, fake: FakeStore });
  assert.equal(limiterStore('cvboost:rl:general:'), undefined);
  assert.equal(state.instances, 0);
});

test('the adapter exposes the whole store surface express-rate-limit uses', async () => {
  // A missing method is not a crash here but a silent behaviour change: without
  // `decrement`, express-rate-limit cannot undo a count on a failed response.
  const { FakeStore } = makeFakeRedisStore();
  mock.method(redis, 'isConfigured', () => true);
  mock.method(redis, 'isReady', () => false);

  const store = loadFactory({ ready: false, fake: FakeStore })('cvboost:rl:general:');
  for (const method of ['init', 'increment', 'decrement', 'resetKey', 'get', 'shutdown']) {
    assert.equal(typeof store[method], 'function', `store.${method} must exist`);
  }

  await store.init(OPTIONS);
  await store.decrement('ip:1');
  await store.resetKey('ip:1');
  await store.get('ip:1');
  await store.shutdown();
});