// Lightweight in-memory cache middleware with TTL support
// No external dependencies — uses native Map

const store = new Map();

/**
 * Express middleware factory that caches GET responses.
 * @param {number} ttlSeconds - Time-to-live in seconds (default 60)
 * @param {Function} [keyFn] - Optional (req) => string to generate custom cache keys
 */
function cacheMiddleware(ttlSeconds = 60, keyFn) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = keyFn ? keyFn(req) : `${req.originalUrl}:${req.user?._id || 'anon'}`;
    const cached = store.get(key);

    if (cached && Date.now() < cached.expiresAt) {
      res.set('X-Cache', 'HIT');
      return res.status(cached.status).json(cached.body);
    }

    // Intercept res.json to capture the response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        store.set(key, {
          body,
          status: res.statusCode,
          expiresAt: Date.now() + ttlSeconds * 1000
        });
      }
      res.set('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

/**
 * Invalidate cache entries matching a prefix.
 * Use after mutations (POST/PATCH/DELETE) to keep cache fresh.
 */
function invalidateCache(prefix) {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) {
      store.delete(key);
    }
  }
}

// Periodic cleanup every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) store.delete(key);
  }
}, 5 * 60 * 1000);

module.exports = { cacheMiddleware, invalidateCache };
