const { RedisStore } = require('rate-limit-redis');
const { MemoryStore } = require('express-rate-limit');
const redis = require('../config/redis');
const logger = require('../utils/logger');

/**
 * Store factory shared by every rate limiter.
 *
 * Returns undefined when Redis is not configured, which makes express-rate-limit
 * fall back to its own in-memory store. Without Redis the counters live per
 * process: they reset on every restart, which hands an attacker a fresh budget
 * on each deploy.
 *
 * When Redis *is* configured the store cannot be built up front, because
 * `RedisStore.init()` issues a SCRIPT LOAD the moment the store exists — and
 * `config/redis` runs with `enableOfflineQueue: false`, so that command is
 * rejected outright while the socket is still opening. The rejection is not
 * cosmetic: `init()` stores the SCRIPT LOAD promise as `incrementScriptSha`,
 * which every later `increment()` awaits. A store built during boot therefore
 * stays broken for the life of the process, and with `passOnStoreError` each
 * limiter then silently allows everything — rate limiting disabling itself
 * without a word, which is the opposite of what adding Redis was for. Production
 * logged exactly that: `error from store, allowing request without
 * rate-limiting. Error: Stream isn't writeable and enableOfflineQueue options is
 * false`.
 *
 * So the store binds on first use instead, once `isReady()` is true, and serves
 * from memory until then. A bind that fails is discarded rather than cached, so
 * a Redis blip costs one request rather than the process.
 *
 * `passOnStoreError` is still set on the limiters so a Redis outage that begins
 * *after* a successful bind fails open. The alternative — every limiter
 * returning 500 while Redis reconnects — turns a caching problem into a total
 * outage.
 */
function limiterStore(prefix) {
  if (!redis.isConfigured()) return undefined;

  const memory = new MemoryStore();

  let options = null;   // captured from express-rate-limit's own init() call
  let bound = null;     // the RedisStore, once its scripts are loaded
  let binding = null;   // in-flight bind, so concurrent first requests share it

  function bind() {
    if (bound) return bound;
    // Not ready yet, or express-rate-limit has not configured us yet.
    if (!options || !redis.isReady()) return null;

    if (!binding) {
      const store = new RedisStore({
        prefix,
        sendCommand: (...args) => redis.getClient().call(...args)
      });

      binding = store
        .init(options)
        .then(() => {
          bound = store;
          return store;
        })
        .catch((err) => {
          // Drop the half-built store. Keeping it would inherit the rejected
          // script-load promise and disable this limiter for good.
          binding = null;
          logger.warn(
            `[redis] rate-limit store "${prefix}" could not bind (${err.message}); `
            + 'counting in memory until the next attempt'
          );
          return null;
        });
    }

    return binding;
  }

  /** Run `method` against Redis when bound, and against memory when not. */
  const use = async (key, method) => {
    const store = await bind();
    return store ? store[method](key) : memory[method](key);
  };

  return {
    async init(opts) {
      options = opts;
      await memory.init(opts);
    },
    increment: (key) => use(key, 'increment'),
    decrement: (key) => use(key, 'decrement'),
    resetKey: (key) => use(key, 'resetKey'),
    get: (key) => use(key, 'get'),
    async shutdown() {
      await Promise.allSettled([
        bound && bound.shutdown ? bound.shutdown() : null,
        memory.shutdown ? memory.shutdown() : null
      ]);
    }
  };
}

module.exports = { limiterStore };