const Redis = require('ioredis');
const logger = require('../utils/logger');

/**
 * Optional Redis (Upstash in production).
 *
 * Redis backs three things that otherwise live in per-process memory: the
 * response cache, the express-rate-limit counters, and the job-scrape lock.
 * In-memory versions are not wrong on a single instance, but every deploy,
 * crash or Render restart silently empties them — which resets a rate-limit
 * budget and lets two instances scrape the same boards at the same time.
 *
 * Redis is strictly optional. With REDIS_URL unset the app boots exactly as
 * before, and every consumer falls back to its in-process implementation. That
 * keeps the local dev loop dependency-free and means a Redis outage degrades
 * cache hit rate instead of taking the site down.
 *
 * Connections are deliberately impatient: maxRetriesPerRequest 1 with the
 * offline queue disabled makes a command fail immediately while disconnected,
 * so callers fall back instead of stacking requests behind a dead socket.
 * ioredis is left to reconnect in the background with a capped backoff.
 */

/**
 * Clean up a pasted REDIS_URL.
 *
 * Three things go wrong when a URL is copied out of a dashboard rather than
 * generated, all verified against ioredis 6.
 *
 * 1. The Upstash console's main "connect" snippet is a whole command:
 *    `redis-cli -u rediss://default:PASSWORD@host.upstash.io:6379`. Pasting that
 *    verbatim puts a shell invocation where a URL is expected. The URL is
 *    extracted from it below.
 *
 * 2. Surrounding whitespace makes the WHATWG URL parser throw
 *    `TypeError: Invalid URL`, and a *leading* space is the only whitespace that
 *    does.
 *
 * 3. A leading tab, newline or non-breaking space does not throw at all: the
 *    parser treats `rediss` as the host, so the client silently points at a host
 *    named "rediss" and every command fails with no explanation of why.
 *
 * Returns the cleaned URL plus whether anything was changed, so a value that
 * needed fixing is visible in the log rather than being quietly corrected.
 */
function normalizeRedisUrl(value) {
  const raw = String(value);
  // Strip all leading/trailing whitespace, including the Unicode kinds a
  // browser dashboard or spreadsheet can introduce (\u00a0, \u3000, \ufeff).
  const trimmed = raw.replace(/^[\s\u00a0\u3000\ufeff]+|[\s\u00a0\u3000\ufeff]+$/g, '');

  // Quotes are sometimes carried along from copying out of a table cell.
  let cleaned = /^(['"])(.*)\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;

  // A pasted redis-cli invocation, with or without flags. The URL always appears
  // as the -u/--url argument (Upstash and Upstash-compatible providers both show
  // exactly that), but fall back to the first redis:// token in the string so an
  // unusual flag order still works. Both the single- and double-quote forms are
  // handled, since the copy usually includes the surrounding quotes.
  if (/^redis-cli\b/i.test(cleaned)) {
    const withFlag = /(?:-u|--url)\s+["']?(rediss?:\/\/\S+?)["']?(?:\s|$)/i.exec(cleaned);
    const anyToken = /(rediss?:\/\/\S+)/i.exec(cleaned);
    const extracted = (withFlag && withFlag[1]) || (anyToken && anyToken[1]);
    if (extracted) cleaned = extracted;
  }

  return { url: cleaned, changed: cleaned !== raw };
}

/**
 * Reject a value that is not a Redis connection string before handing it to
 * ioredis. The Upstash console also shows an HTTP REST endpoint
 * (`https://....upstash.io`), and ioredis parses that without complaint —
 * treating the literal string "https" as the hostname — so a wrong paste
 * produces a client that can never connect and never explains itself.
 */
function assertRedisScheme(url) {
  if (!/^rediss?:\/\//i.test(url)) {
    // Preview the value for the log. Letters, digits and URL punctuation only, so
    // a pasted command line or a stray password fragment cannot leak into the
    // logs — a filtered preview of "redis-cli -u rediss://..." used to render as
    // the unreadable "redis-cli--", which told the reader nothing.
    const shown = url.replace(/[^a-z0-9:/.@_-]/gi, '').slice(0, 24);

    if (/^redis-cli/i.test(url)) {
      throw new Error(
        'the value is a redis-cli command, not a URL. Use only the connection '
        + 'string, e.g. rediss://default:<password>@<host>:6379'
      );
    }

    throw new Error(
      `expected a rediss:// or redis:// connection string, got something starting "${shown}"`
    );
  }
}

/**
 * Reject a URL whose password contains a character that ends the authority
 * early. `rediss://default:p@ss/word@host:6379` parses without error, but
 * everything after the `/` is read as a path, so ioredis ends up with the
 * hostname `ss` and a client that can never connect. The failure surfaces only
 * as `getaddrinfo ENOTFOUND ss`, which gives no hint that the URL is the
 * problem. A generated Upstash password is URL-safe, so finding one of these
 * characters means it was pasted without percent-encoding.
 */
function assertEncodedPassword(url) {
  // A password may legally contain `@` and `:` (both are sub-delims inside
  // userinfo), so those are allowed. It may NOT contain `/ ? # [ ]` or a bare
  // percent sign: each of those ends the authority or starts a fragment, and
  // Node's parser then silently resolves the hostname to whatever followed.
  //   rediss://default:p@ss/word@host:6379  ->  hostname "ss"
  //   rediss://default:ab#cd@host:6379      ->  hostname "ab"
  //
  // Everything before the LAST `@` is the userinfo; the host follows.
  const at = url.lastIndexOf('@');
  if (at === -1) return;
  const userInfo = url.slice(url.indexOf('//') + 2, at);

  if (/[/ ?#[\]%]/.test(userInfo)) {
    throw new Error(
      'the username or password contains a character that must be percent-encoded '
      + '(one of / ? # [ ] or %) — as written, it ends the host part of the URL'
    );
  }
}

let client = null;
let configured = false;

const ERROR_LOG_INTERVAL_MS = 60 * 1000;
let lastErrorLogAt = 0;

/**
 * Log at most one Redis failure a minute. A Redis outage produces one error per
 * attempted command; without this the log would be unusable and would itself
 * become the incident.
 */
function noteError(err) {
  const now = Date.now();
  if (now - lastErrorLogAt < ERROR_LOG_INTERVAL_MS) return;
  lastErrorLogAt = now;
  logger.warn(`[redis] unavailable, using in-process state: ${err.message}`);
}

/**
 * Build a client for testing a URL in isolation, without the module-load side
 * effects of the real block below. Never called at runtime.
 */
function createClient(url) {
  const client = new Redis(url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    retryStrategy: (attempt) => Math.min(attempt * 500, 30000),
    keepAlive: 10000
  });
  client.on('error', noteError);
  return client;
}

const RAW_REDIS_URL = process.env.REDIS_URL || '';

if (RAW_REDIS_URL) {
  // Construction is wrapped because ioredis parses the URL eagerly and throws on
  // a value it cannot parse (a stray paste, or the Upstash REST URL pasted
  // instead of the rediss:// one). That throw happened at require time, before
  // any log line, and took the whole process down — the exact opposite of the
  // "Redis is strictly optional" contract above.
  try {
    const { url, changed } = normalizeRedisUrl(RAW_REDIS_URL);
    if (changed) {
      // Never echo the value: it embeds the password.
      // Name which repairs applied, so "whitespace" is never reported for what
      // was actually a pasted redis-cli command. Detection runs on the RAW value
      // because `url` is already the repaired result.
      const repairs = [];
      if (/^redis-cli\b/i.test(trimmedRedisUrl(RAW_REDIS_URL))) {
        repairs.push('a pasted redis-cli command');
      }
      if (/^['"]/.test(trimmedRedisUrl(RAW_REDIS_URL))) repairs.push('surrounding quotes');
      if (trimmedRedisUrl(trimmedRedisUrl(RAW_REDIS_URL)) !== RAW_REDIS_URL) {
        repairs.push('surrounding whitespace');
      }

      logger.warn(
        `[redis] REDIS_URL needed repair (${repairs.join(' + ') || 'unrecognised formatting'}); `
        + `using the corrected value (${RAW_REDIS_URL.length} -> ${url.length} chars)`
      );
    }
    assertRedisScheme(url);
    assertEncodedPassword(url);

    client = createClient(url);

    client.on('ready', () => {
      logger.info('[redis] connected');
    });
    configured = true;
  } catch (err) {
    client = null;
    configured = false;
    logger.error(
      `[redis] REDIS_URL could not be parsed (${err.message}) — `
      + 'cache, rate-limit counters and scrape lock stay in-process'
    );
  }
} else {
  logger.info('[redis] REDIS_URL not set — cache, rate-limit counters and scrape lock stay in-process');
}

/** True when REDIS_URL is set, regardless of whether the socket is up yet. */
function isConfigured() {
  return configured;
}

/**
 * True when Redis is configured *and* the connection is usable right now.
 *
 * Callers use this to choose a backend per operation, so it must reflect the
 * live socket rather than the configuration: reporting "yes" during a reconnect
 * would route every request through a failing command.
 */
function isReady() {
  return configured && Boolean(client) && client.status === 'ready';
}

function getClient() {
  return client;
}

/** Whitespace-stripped view of a raw value, used only for the repair log line. */
function trimmedRedisUrl(value) {
  return String(value).replace(/^[\s\u00a0\u3000\ufeff]+|[\s\u00a0\u3000\ufeff]+$/g, '');
}

module.exports = {
  isConfigured,
  isReady,
  getClient,
  noteError,
  // Exported for tests: these are the parsing rules that decide whether a pasted
  // URL is usable, and they must be verifiable without a live Redis.
  normalizeRedisUrl,
  assertRedisScheme,
  assertEncodedPassword
};
