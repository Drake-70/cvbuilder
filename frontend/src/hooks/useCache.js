import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../services/api';

// In-memory cache store with TTL
const cache = new Map();
const inflight = new Map(); // Dedup concurrent identical requests

const STALE_TIME = 30_000;   // 30s — serve from cache without refetching
const CACHE_TIME = 5 * 60_000; // 5min — hard expiry

function getCacheKey(url, params) {
  return params ? `${url}:${JSON.stringify(params)}` : url;
}

function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

function getCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TIME) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function invalidateCacheKey(key) {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

/**
 * SWR-like hook: fetches data with caching, dedup, and stale-while-revalidate.
 *
 * @param {string} url - API endpoint (relative to /api)
 * @param {object} [options] - { params, staleTime, enabled }
 * @returns {{ data, error, isLoading, isValidating, mutate }}
 */
export function useCache(url, options = {}) {
  const { params, staleTime = STALE_TIME, enabled = true } = options;
  const cacheKey = enabled ? getCacheKey(url, params) : null;

  const [data, setData] = useState(() => {
    if (!cacheKey) return null;
    const cached = getCache(cacheKey);
    return cached?.data ?? null;
  });
  const [error, setError] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async (force = false) => {
    if (!cacheKey) return;

    const cached = getCache(cacheKey);
    const isStale = !cached || (Date.now() - cached.timestamp > staleTime);

    if (!isStale && !force) {
      setData(cached.data);
      return;
    }

    // Dedup in-flight requests
    if (inflight.has(cacheKey)) {
      try {
        const result = await inflight.get(cacheKey);
        if (mountedRef.current) setData(result);
      } catch {}
      return;
    }

    setIsValidating(true);
    setError(null);

    const promise = api.get(url, { params })
      .then(res => {
        setCache(cacheKey, res.data);
        if (mountedRef.current) setData(res.data);
        return res.data;
      })
      .catch(err => {
        if (mountedRef.current) setError(err);
        throw err;
      })
      .finally(() => {
        inflight.delete(cacheKey);
        if (mountedRef.current) setIsValidating(false);
      });

    inflight.set(cacheKey, promise);
    await promise.catch(() => {});
  }, [cacheKey, url, params, staleTime]);

  useEffect(() => {
    mountedRef.current = true;
    if (enabled) fetchData();
    return () => { mountedRef.current = false; };
  }, [fetchData, enabled]);

  const mutate = useCallback((newData) => {
    if (typeof newData === 'function') {
      setData(prev => {
        const val = newData(prev);
        if (cacheKey) setCache(cacheKey, val);
        return val;
      });
    } else {
      if (cacheKey) setCache(cacheKey, newData);
      setData(newData);
    }
  }, [cacheKey]);

  return { data, error, isLoading: data === null && isValidating, isValidating, mutate, refetch: () => fetchData(true) };
}
