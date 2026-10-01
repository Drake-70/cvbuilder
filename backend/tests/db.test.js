const { test } = require('node:test');
const assert = require('node:assert/strict');

const connectDB = require('../config/db');
const logger = require('../utils/logger');

// connectDB must never terminate the process.
//
// It used to call process.exit(1) on both the missing-URI and the
// failed-to-connect paths. The HTTP port is now opened *before* the connection
// is attempted, so exiting took down a perfectly healthy server, and the log
// line explaining why was frequently lost — Render reported the deploy as
// "Application exited early" with nothing in the log. connectDB now reports
// failure to its caller, which keeps the process up and retries in background.

/** Run `fn` with MONGODB_URI set to `value` (or removed when undefined). */
async function withMongoUri(value, fn) {
  const previous = process.env.MONGODB_URI;
  if (value === undefined) delete process.env.MONGODB_URI;
  else process.env.MONGODB_URI = value;

  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = previous;
  }
}

test('a missing MONGODB_URI is reported to the caller, not a process exit', async () => {
  await withMongoUri(undefined, async () => {
    await assert.rejects(
      () => connectDB(),
      /MONGODB_URI is not set/,
      'the caller must learn which variable is missing'
    );
  });
});

test('an unparseable MONGODB_URI surfaces the driver error', async () => {
  // A non-retryable failure (MongoParseError) breaks out of the retry loop on
  // the first attempt, so this stays fast and needs no database.
  await withMongoUri('not-a-mongodb-uri', async () => {
    await assert.rejects(
      () => connectDB({ attempts: 1, delayMs: 0 }),
      (err) => {
        assert.match(err.message, /MongoDB connection failed after 1 attempt/);
        assert.match(err.message, /Invalid scheme/);
        return true;
      }
    );
  });
});

test('the failure message names the attempt budget, not a bare exit', async () => {
  // Pins the reason for the message: with a silent process.exit the log gave no
  // way to tell "Mongo is slow" from "MONGODB_URI is wrong".
  await withMongoUri('not-a-mongodb-uri', async () => {
    await assert.rejects(
      () => connectDB({ attempts: 2, delayMs: 0 }),
      /MongoDB connection failed after 2 attempt\(s\)/,
      'a single unparseable URI must not consume the whole retry budget'
    );
  });
});

test('a server-selection failure is retried, not treated as fatal', async () => {
  // THE production failure. A paused free-tier Atlas cluster answers with a
  // server-selection error, and mongoose names it `MongooseServerSelectionError`
  // — one letter-run away from the `MongoServerSelectionError` the retry set
  // listed. The mismatch made the loop break on attempt 1, which combined with
  // the old process.exit(1) to kill the deploy with no Mongo error logged.
  await withMongoUri('mongodb://127.0.0.1:1/nope', async () => {
    const errors = [];
    const originalWarn = logger.warn;
    logger.warn = (msg) => errors.push(String(msg));

    try {
      // Short server-selection timeout: this exercises the retry decision, not
      // how patient a real Atlas cluster is allowed to be.
      await assert.rejects(() => connectDB({
        attempts: 3,
        delayMs: 0,
        serverSelectionTimeoutMS: 300
      }));
    } finally {
      logger.warn = originalWarn;
    }

    const attempts = errors.filter((line) => line.includes('MongoDB connection attempt'));
    assert.equal(
      attempts.length,
      3,
      `a retryable error must use every attempt, got: ${JSON.stringify(attempts)}`
    );
    assert.match(
      attempts[0],
      /— retrying/,
      'the first failure of a transient error must announce a retry'
    );
  });
});
