const { test } = require('node:test');
const assert = require('node:assert/strict');

const MODULE_PATH = require.resolve('../config/redis');

// Required once for the pure helpers. `sanitizeError` has no module state, and
// the redaction tests must hold regardless of what REDIS_URL happens to be.
const redisModule = require('../config/redis');

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

test('status explains why a configured Redis is not usable', () => {
  // Production showed `redis=configured` with `cache: memory`, which says the URL
  // parsed and nothing else — a socket that never opens, a rejected password and
  // a mid-life outage are indistinguishable from outside. `status()` is what
  // /api/health reports, so the distinction has to be recoverable without
  // tailing logs.
  const redis = loadWith('redis://127.0.0.1:1');
  try {
    assert.equal(redis.isConfigured(), true);
    assert.equal(redis.isReady(), false);

    const s = redis.status();
    assert.equal(s.ok, false, 'not ready must not be reported as ok');
    // ioredis states, not our own vocabulary: 'connecting', 'reconnecting',
    // 'end', 'close'. Asserting a literal would break on an ioredis change
    // without telling us anything useful.
    assert.equal(typeof s.state, 'string');
    assert.ok(s.state.length > 0, 'a state must always be reported');
  } finally {
    redis.getClient().disconnect();
    delete require.cache[MODULE_PATH];
  }
});

test('status reports not-configured when REDIS_URL is unset', () => {
  const redis = loadWith(undefined);
  assert.deepEqual(redis.status(), { ok: false, state: 'not-configured' });
});

test('status reports invalid-url when the URL cannot be parsed', () => {
  // Distinct from not-configured, because the fix is different: one means "set
  // the variable", the other means "fix the value you set".
  const redis = loadWith('not a url');
  try {
    const s = redis.status();
    assert.equal(s.ok, false);
    assert.equal(s.state, 'invalid-url');
    // The reason travels with the state, so /api/health explains a typo without
    // the log being consulted.
    assert.match(s.error, /expected a rediss/, 'a rejected URL must say why');
    assert.equal(redis.isConfigured(), false, 'isConfigured stays false — nothing is attempted');
  } finally {
    delete require.cache[MODULE_PATH];
  }
});

test('a rejected URL is not reported as merely unset', () => {
  // The distinction that makes this worth reporting: "no REDIS_URL" and "REDIS_URL
  // is wrong" need different fixes, and production hit both in a row while the
  // health body could only say one of them.
  const rejected = loadWith('not a url').status();
  const unset = loadWith(undefined).status();

  assert.notEqual(rejected.state, unset.state);
  assert.equal(unset.state, 'not-configured');
  delete require.cache[MODULE_PATH];
});

test('the reason Redis is down is recorded even when the log stays quiet', () => {
  // noteError throttles to one line a minute, which is right for the log and
  // wrong as the only record. Production can be mid-interval when you look, and
  // then the one line that explains the outage is the one not written.
  // A second, distinct error, so "last one wins" is actually asserted rather than
  // assumed: both calls hit the same module instance, so the recorded reason must
  // have been overwritten.
  const redis = loadWith('redis://127.0.0.1:1');
  try {
    redis.noteError(new Error('WRONGPASS invalid username-password pair'));
    assert.match(redis.status().error, /WRONGPASS/, 'the first failure is recorded');

    redis.noteError(new Error('getaddrinfo ENOTFOUND some-host'));
    assert.match(redis.status().error, /ENOTFOUND/, 'the most recent reason wins');
  } finally {
    redis.getClient().disconnect();
    delete require.cache[MODULE_PATH];
  }
});

test('noteError does not throw and still records when handed odd values', () => {
  // Called from ioredis error handlers, so it cannot be allowed to throw, and it
  // has to survive whatever shape an error arrives in.
  const redis = loadWith('redis://127.0.0.1:1');
  try {
    assert.doesNotThrow(() => redis.noteError(undefined));
    assert.doesNotThrow(() => redis.noteError('a bare string'));
    assert.doesNotThrow(() => redis.noteError({ message: 'no message property' }));

    const s = redis.status();
    assert.equal(s.ok, false);
    assert.ok(s.error, 'an unrecognised error shape must still be recorded');
  } finally {
    redis.getClient().disconnect();
    delete require.cache[MODULE_PATH];
  }
});

test('a Redis failure message never carries the password to /api/health', () => {
  // status() is served over HTTP. An ioredis URL-parse error quotes the value it
  // was handed, and that value is the connection string, password included — so
  // this endpoint would leak credentials into a response that is public and
  // cached by intermediaries. Redis errors are user-supplied-shaped, so they
  // have to be scrubbed rather than trusted.
  const withSecret = 'rediss://default:hunter2SUPERSECRET@my-db.upstash.io:6379';

  for (const message of [
    `Invalid URL: ${withSecret}`,
    `connect ECONNREFUSED rediss://default:hunter2SUPERSECRET@my-db.upstash.io:6379`,
    `WRONGPASS for user default (${withSecret})`
  ]) {
    const clean = redisModule.sanitizeError(new Error(message));
    assert.ok(
      !clean.includes('hunter2SUPERSECRET'),
      `password leaked through: ${clean}`
    );
    assert.ok(clean.includes('***@'), `credentials should be masked, got: ${clean}`);
  }
});

test('a Redis failure message cannot flood the health response', () => {
  // The reason is a diagnostic, not an internal detail dump. ioredis errors are
  // short, but nothing stops an unusual one from being enormous.
  const huge = new Error(`NOAUTH ${'x'.repeat(5000)}`);
  assert.ok(redisModule.sanitizeError(huge).length <= 200);
});

test('sanitizeError survives values that are not Errors at all', () => {
  // ioredis emits real Errors, but this value ends up in a public HTTP response
  // and a `String(undefined)` throwing here would turn a Redis blip into a 500
  // on the health endpoint -- the opposite of a graceful fallback.
  assert.equal(redisModule.sanitizeError(undefined), 'unknown error');
  assert.equal(redisModule.sanitizeError(null), 'unknown error');
  assert.equal(redisModule.sanitizeError('WRONGPASS'), 'WRONGPASS');
});

test('a pasted redis-cli command yields the URL it contains', () => {
  // The Upstash console's primary connect snippet is a whole command, so
  // pasting what is on screen is the most likely mistake of all. Production
  // reported `got something starting "redis-cli--"`.
  const { normalizeRedisUrl } = loadWith(undefined);
  const expected = 'rediss://default:PW@my-db.upstash.io:6379';

  for (const raw of [
    `redis-cli -u ${expected}`,
    `redis-cli -u ${expected} `,
    `redis-cli --url ${expected}`,
    `redis-cli -u "${expected}"`,
    `redis-cli -u '${expected}'`,
    `redis-cli --tls -u ${expected}`,
    `  redis-cli -u ${expected}  `
  ]) {
    const { url, changed } = normalizeRedisUrl(raw);
    assert.equal(url, expected, `should extract the URL from ${JSON.stringify(raw)}`);
    assert.equal(changed, true, `${JSON.stringify(raw)} needed fixing`);
    assert.doesNotThrow(() => new URL(url));
  }
});

test('an extracted redis-cli URL still has to be a valid Redis URL', () => {
  // Extraction must not become a way to smuggle a bad value past the checks:
  // the rest of the pipeline has to see exactly what it would have seen had the
  // URL been pasted on its own.
  const { normalizeRedisUrl, assertRedisScheme, assertEncodedPassword } = loadWith(undefined);

  // No redis:// token to extract, so the command survives and is reported as
  // the command it is.
  const { url } = normalizeRedisUrl('redis-cli -u https://my-db.upstash.io');
  assert.throws(() => assertRedisScheme(url), /redis-cli command, not a URL/);

  const slashy = normalizeRedisUrl('redis-cli -u rediss://default:p@ss/word@my-db.upstash.io:6379');
  assert.throws(() => assertEncodedPassword(slashy.url), /percent-encoded/);
});

test('a redis-cli value with no URL in it is reported clearly', () => {
  // The error has to name the mistake, and must not echo anything that could be
  // a password.
  const { normalizeRedisUrl, assertRedisScheme } = loadWith(undefined);

  const { url } = normalizeRedisUrl('redis-cli --version');
  assert.throws(() => assertRedisScheme(url), /redis-cli command, not a URL/);
});

test('a REDIS_URL with a leading space is trimmed instead of discarded', () => {
  // A leading space is the one whitespace character that makes the WHATWG URL
  // parser throw outright, which is what produced the production
  // "could not be parsed (Invalid URL)" log line for an otherwise valid URL.
  // A trailing space is harmless to the parser, so only the leading one is a
  // real failure mode.
  const { normalizeRedisUrl } = loadWith(undefined);

  const padded = ' rediss://default:PW@my-db.upstash.io:6379';
  const { url, changed } = normalizeRedisUrl(padded);

  assert.equal(changed, true, 'a trimmed value must be reported as changed');
  assert.equal(url, 'rediss://default:PW@my-db.upstash.io:6379');
  assert.doesNotThrow(() => new URL(url), 'the trimmed value must be a valid URL');
});

test('a quoted or padded REDIS_URL is cleaned up', () => {
  // Copying out of a dashboard table cell carries quotes and stray newlines.
  const { normalizeRedisUrl } = loadWith(undefined);

  for (const raw of [
    '  rediss://default:PW@my-db.upstash.io:6379  ',
    '"rediss://default:PW@my-db.upstash.io:6379"',
    'rediss://default:PW@my-db.upstash.io:6379\n',
    '\u00a0rediss://default:PW@my-db.upstash.io:6379'
  ]) {
    const { url, changed } = normalizeRedisUrl(raw);
    assert.equal(
      url,
      'rediss://default:PW@my-db.upstash.io:6379',
      `should clean up ${JSON.stringify(raw)}`
    );
    assert.equal(changed, true);
  }
});

test('a well-formed REDIS_URL is left byte-for-byte alone', () => {
  // The normal case must not report a change, or every deploy would log a
  // misleading "had surrounding whitespace" warning.
  const { normalizeRedisUrl } = loadWith(undefined);
  const good = 'rediss://default:PW@my-db.upstash.io:6379';

  assert.deepEqual(normalizeRedisUrl(good), { url: good, changed: false });
});

test('the Upstash REST URL is rejected with an explanation', () => {
  // The console also shows an https:// REST endpoint. ioredis parses that
  // without complaint and treats the literal string "https" as the hostname,
  // producing a client that can never connect and never says why. A well-formed
  // rediss:// string must be accepted by the same check.
  //
  // The message must name the REST endpoint specifically, not merely complain
  // about the scheme: the wrong paste happens because the REST endpoint sits
  // directly above the connection string on the same page, and a reader told
  // only "expected rediss://" still has to work out which of the two rows to
  // copy. Both assertions are the behaviour, not the wording.
  const { assertRedisScheme } = loadWith(undefined);

  assert.throws(
    () => assertRedisScheme('https://my-db.upstash.io'),
    /REST endpoint/,
    'the message must name the REST endpoint, not just the wrong scheme'
  );
  assert.throws(
    () => assertRedisScheme('https://my-db.upstash.io'),
    /rediss:\/\/default/,
    'the message must show the shape of the value to use instead'
  );
  assert.doesNotThrow(() => assertRedisScheme('rediss://default:PW@my-db.upstash.io:6379'));
  assert.doesNotThrow(() => assertRedisScheme('redis://localhost:6379'));
});

test('a password containing / or # is rejected instead of silently mis-parsed', () => {
  // `rediss://default:p@ss/word@host:6379` parses without throwing, but the
  // `/` ends the authority, so ioredis resolves the hostname to `ss`. That
  // surfaces only as `getaddrinfo ENOTFOUND ss`, which never points at the URL
  // being wrong. A generated Upstash password is URL-safe, so this means it was
  // pasted unencoded.
  const { assertEncodedPassword } = loadWith(undefined);

  for (const raw of [
    'rediss://default:p@ss/word@my-db.upstash.io:6379',
    'rediss://default:ab#cd@my-db.upstash.io:6379',
    'rediss://default:ab?cd@my-db.upstash.io:6379'
  ]) {
    assert.throws(
      () => assertEncodedPassword(raw),
      /percent-encoded/,
      `should reject ${raw}`
    );
  }
});

test('a normal password is not mistaken for a URL problem', () => {
  // The checks above must not fire on a normal URL, or Redis would be reported
  // as broken on every deploy. A generated password is alphanumeric with the
  // occasional - and _ .
  const { assertEncodedPassword, assertRedisScheme } = loadWith(undefined);

  for (const raw of [
    'rediss://default:AbCd-1234_XyZ@my-db.upstash.io:6379',
    'redis://user:pass@localhost:6379',
    'rediss://default:PW@my-db.upstash.io:6379/',
    'rediss://default:PW@my-db.upstash.io' // no explicit port
  ]) {
    assert.doesNotThrow(() => assertEncodedPassword(raw), `should accept ${raw}`);
    assert.doesNotThrow(() => assertRedisScheme(raw), `should accept scheme of ${raw}`);
  }
});

test('a non-Redis REDIS_URL leaves the app on in-process state', () => {
  // The REST-URL case end to end: the module must load, report unconfigured,
  // and hand back no client rather than building one aimed at host "https".
  const redis = loadWith('https://my-db.upstash.io');
  try {
    assert.equal(redis.isConfigured(), false);
    assert.equal(redis.getClient(), null);
  } finally {
    delete require.cache[MODULE_PATH];
  }
});
