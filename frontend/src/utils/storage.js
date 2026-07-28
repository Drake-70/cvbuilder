/**
 * Safe, typed localStorage abstraction.
 *
 * Features:
 *  - Try/catch around every operation (private browsing, quota, SSR)
 *  - Optional TTL (time-to-live) with automatic expiry
 *  - JSON serialization/deserialization with type inference
 *  - Cross-tab sync via the `storage` event
 *  - In-memory fallback when localStorage is unavailable
 */

const PREFIX = 'cvboost-';

const memoryFallback = new Map();

function canUseLocalStorage() {
  try {
    const test = '__storage_test__';
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch {
    return false;
  }
}

const hasStorage = canUseLocalStorage();

/**
 * Wrap a value with metadata for TTL support.
 * Stored shape: { v: value, e: expiryTimestamp | null }
 */
function wrap(value, ttlMs) {
  return JSON.stringify({
    v: value,
    e: ttlMs ? Date.now() + ttlMs : null
  });
}

function unwrap(raw) {
  if (raw === null || raw === undefined) return undefined;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object' && 'v' in parsed) {
      if (parsed.e !== null && Date.now() > parsed.e) {
        // Expired — signal by returning undefined
        return undefined;
      }
      return parsed.v;
    }
    // Legacy plain value (no wrapper) — return as-is
    return parsed;
  } catch {
    return undefined;
  }
}

/**
 * Get a value from storage.
 * @param {string} key
 * @param {*} [defaultValue]
 * @returns {*}
 */
export function getItem(key, defaultValue = undefined) {
  const fullKey = PREFIX + key;
  try {
    const raw = hasStorage ? localStorage.getItem(fullKey) : memoryFallback.get(fullKey);
    const value = unwrap(raw);
    return value !== undefined ? value : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Set a value in storage.
 * @param {string} key
 * @param {*} value
 * @param {object} [options]
 * @param {number} [options.ttlMs] - Time-to-live in milliseconds
 */
export function setItem(key, value, options = {}) {
  const fullKey = PREFIX + key;
  try {
    const raw = wrap(value, options.ttlMs);
    if (hasStorage) {
      localStorage.setItem(fullKey, raw);
    } else {
      memoryFallback.set(fullKey, raw);
    }
  } catch {
    // Storage full or private mode — silently degrade
  }
}

/**
 * Remove a value from storage.
 * @param {string} key
 */
export function removeItem(key) {
  const fullKey = PREFIX + key;
  try {
    if (hasStorage) {
      localStorage.removeItem(fullKey);
    } else {
      memoryFallback.delete(fullKey);
    }
  } catch {
    // Silently degrade
  }
}

/**
 * Subscribe to cross-tab changes for a key.
 * @param {string} key
 * @param {(value: *) => void} callback
 * @returns {() => void} unsubscribe function
 */
export function onStorageChange(key, callback) {
  const fullKey = PREFIX + key;

  const handler = (e) => {
    if (e.key === fullKey) {
      try {
        const value = e.newValue !== null ? unwrap(e.newValue) : undefined;
        callback(value);
      } catch {
        callback(undefined);
      }
    }
  };

  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}
