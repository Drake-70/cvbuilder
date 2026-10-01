// Response cache with two backends: Redis when REDIS_URL is configured, and a
// native Map otherwise.
//
// The in-memory Map is not a fallback of last resort — it is the primary
// backend for local development and for any deploy without Redis. Redis is used
// only while its socket is actually ready, so a reconnect window silently
// reverts to process-local caching instead of failing requests.

const redis = require('../config/redis');

// Namespace keeps these keys distinguishable from the rate-limit counters and
// the scrape lock sharing the same database.
const NAMESPACE = 'cvboost:cache:';

const store = new Map();

/** The backend for this operation: Redis when live, otherwise the Map. */
function redisActive() {
  return redis.isReady();
}

/** Redis key for a cache key. */
function redisKey(key) {
  return `${NAMESPACE}${key}`;
}

/**
 * Escape glob metacharacters so a cache key containing `*` or `?` cannot widen
 * an invalidation into deleting unrelated entries.
 */
function escapeGlob(value) {
  return value.replace(/[\\*?[\]^]/g, (char) => `\\${char}`);
}

function readMemory(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry;
}

function writeMemory(key, entry, ttlSeconds) {
  store.set(key, { ...entry, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function readCache(key) {
  if (redisActive()) {
    try {
      const raw = await redis.getClient().get(redisKey(key));
      // Only Redis is consulted while it is ready. Falling through to the Map on
      // a miss would serve an entry written before Redis came up, which is more
      // surprising than a plain cache miss.
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      redis.noteError(err);
    }
  }
  return readMemory(key);
}

// Writes are fire-and-forget: caching must never add latency to the response,
// and a failed SET costs one cache miss, not a failed request.
function writeCache(key, entry, ttlSeconds) {
  if (redisActive()) {
    redis
      .getClient()
      .set(redisKey(key), JSON.stringify(entry), 'EX', ttlSeconds)
      .catch((err) => redis.noteError(err));
    return;
  }
  writeMemory(key, entry, ttlSeconds);
}

/**
 * Express middleware factory that caches GET responses.
 *
 * @param {number} ttlSeconds - Time-to-live in seconds (default 60)
 * @param {Function} [keyFn] - Optional (req) => string to generate custom cache keys
 * @param {object} [options]
 * @param {boolean} [options.memoryOnly] - Never touch Redis. Used by /api/health,
 *   which Render polls every few seconds: routing those through Redis would burn
 *   a command per probe and, on a metered plan, spend the quota on health checks.
 */
function cacheMiddleware(ttlSeconds = 60, keyFn, options = {}) {
  const memoryOnly = options.memoryOnly === true;

  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = keyFn ? keyFn(req) : `${req.originalUrl}:${req.user?._id || 'anon'}`;

    let cached = null;
    try {
      cached = memoryOnly ? readMemory(key) : await readCache(key);
    } catch (err) {
      // A cache read must never be able to fail a request.
      redis.noteError(err);
      cached = null;
    }

    if (cached) {
      res.set('X-Cache', 'HIT');
      return res.status(cached.status).json(cached.body);
    }

    // Intercept res.json to capture the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const entry = { body, status: res.statusCode };
        try {
          if (memoryOnly) writeMemory(key, entry, ttlSeconds);
          else writeCache(key, entry, ttlSeconds);
        } catch (err) {
          redis.noteError(err);
        }
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/**
 * Drop every cache entry whose key starts with `prefix`.
 *
 * Fire-and-forget by design: all call sites are `res.on('finish', ...)`, so the
 * response is already sent. Rejections are swallowed into the same throttled
 * log as other Redis problems — a failed invalidation costs a stale entry until
 * its TTL expires, not a failed request.
 */
async function invalidateCache(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }

  if (!redis.isReady()) return;

  try {
    const client = redis.getClient();
    const stream = client.scanStream({
      match: `${NAMESPACE}${escapeGlob(prefix)}*`,
      count: 100
    });

    const found = [];
    for await (const keys of stream) {
      if (keys.length) found.push(...keys);
    }

    // Delete in batches: a single DEL with thousands of arguments is slower and
    // harder on the server than a few chunks.
    for (let i = 0; i < found.length; i += 100) {
      await client.del(...found.slice(i, i + 100));
    }
  } catch (err) {
    redis.noteError(err);
  }
}

// Periodic cleanup for the in-memory backend. Redis entries expire via their own
// TTL, so this only ever touches the Map. unref() keeps the interval from
// holding the process open in tests and one-off scripts.
const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 5 * 60 * 1000);
if (cleanup.unref) cleanup.unref();

module.exports = { cacheMiddleware, invalidateCache };
