const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// The digest has one job that is easy to get subtly wrong: it must arrive once a
// day, not once a scrape. Scraping runs every six hours, so a throttle held in
// memory would send four emails a day, and one held nowhere would send four a day
// again. Everything below exists to pin that, plus the property that a user whose
// send failed is retried rather than silently skipped forever.

const SERVICE = require.resolve('../services/digestService');
const LOGGER = require.resolve('../utils/logger');
const REDIS = require.resolve('../config/redis');
const USER = require.resolve('../models/User');
const NOTIFICATION = require.resolve('../models/Notification');
const JOB = require.resolve('../models/Job');
const EMAIL = require.resolve('../services/emailService');

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const state = {
  users: [],
  notifications: [],
  jobs: [],
  sent: [],
  digestWrites: [],
  logs: [],
  emailResult: { success: true },
  redisReady: true,
  lockReply: 'OK'
};

function oid(label) {
  // Ordering matters: the service pages users by _id.
  return { __label: label, toString: () => label };
}

const logs = state.logs;

// Mongoose query builders are chainable thenables, so a stub that is `async` loses
// every method chained onto it and fails with a misleading ".sort is not a
// function". Same trap as the alert matcher tests.
function chain(rows) {
  let cur = rows.slice();
  const q = {
    sort() { return q; },
    limit(n) { cur = cur.slice(0, n); return q; },
    select() { return q; },
    lean: async () => cur
  };
  return q;
}

const loggerStub = {
  info: (m) => logs.push(m),
  warn: (m) => logs.push(m),
  error: (m) => logs.push(m),
  debug: () => {}
};

const redisStub = {
  isReady: () => state.redisReady,
  getClient: () => ({
    set: async () => state.lockReply,
    eval: async () => 1
  }),
  noteError: (err) => logs.push(`[redis-error] ${err.message}`)
};

const UserStub = {
  find(filter) {
    let rows = state.users.slice();
    if (filter._id && filter._id.$gt) {
      rows = rows.filter((u) => u._id.__label > filter._id.$gt.__label);
    }
    rows.sort((a, b) => (a._id.__label < b._id.__label ? -1 : 1));
    return chain(rows);
  },
  async countDocuments(filter) {
    return state.users.filter(
      (u) => u.dailyDigest === filter.dailyDigest && u.emailVerified === filter.emailVerified
    ).length;
  },
  async updateOne(filter, update) {
    state.digestWrites.push({ id: filter._id.__label, at: update.$set.lastDigestAt });
    return { acknowledged: true };
  }
};

const NotificationStub = {
  find(filter) {
    const rows = state.notifications.filter(
      (n) => n.userId.__label === filter.userId.__label
        && n.type === filter.type
        && n.createdAt >= filter.createdAt.$gte
    );
    // The service asks for newest first.
    rows.sort((a, b) => b.createdAt - a.createdAt);
    return chain(rows);
  }
};

const JobStub = {
  find(filter) {
    const wanted = filter._id.$in.map(String);
    return chain(state.jobs.filter((j) => wanted.includes(String(j._id))));
  }
};

const emailStub = {
  async sendDailyDigestEmail(args) {
    state.sent.push(args);
    if (state.emailResult.throwOnCall) throw new Error('transport exploded');
    return state.emailResult;
  }
};

let runDailyDigest;
let sendDigestForUser;
let isDue;
let windowStartFor;

before(() => {
  for (const [p, stub] of [
    [LOGGER, loggerStub],
    [REDIS, redisStub],
    [USER, UserStub],
    [NOTIFICATION, NotificationStub],
    [JOB, JobStub],
    [EMAIL, emailStub]
  ]) {
    require.cache[p] = { id: p, filename: p, loaded: true, exports: stub };
  }
  delete require.cache[SERVICE];
  const mod = require(SERVICE);
  ({ runDailyDigest, sendDigestForUser, isDue, windowStartFor } = mod);
});

after(() => {
  for (const p of [LOGGER, REDIS, USER, NOTIFICATION, JOB, EMAIL]) delete require.cache[p];
  delete require.cache[SERVICE];
});

beforeEach(() => {
  state.users = [];
  state.notifications = [];
  state.jobs = [];
  state.sent = [];
  state.digestWrites = [];
  state.logs.length = 0;
  state.emailResult = { success: true };
  state.redisReady = true;
  state.lockReply = 'OK';
});

function makeUser(over = {}) {
  return {
    _id: oid(over._id || 'u1'),
    email: over.email || 'a@example.com',
    name: 'Ada',
    preferredLanguage: over.preferredLanguage || 'en',
    dailyDigest: over.dailyDigest !== undefined ? over.dailyDigest : true,
    emailVerified: over.emailVerified !== undefined ? over.emailVerified : true,
    lastDigestAt: over.lastDigestAt || null
  };
}

function makeNotification(userId, jobId, ageMs) {
  return {
    userId: oid(userId),
    jobId: oid(jobId),
    type: 'job_alert',
    createdAt: Date.now() - ageMs
  };
}

function makeJob(id, over = {}) {
  return {
    _id: oid(id),
    title: over.title || 'DevOps Engineer',
    company: over.company || 'Acme',
    location: over.location || 'Douala',
    active: over.active !== undefined ? over.active : true
  };
}

const digestLog = () => state.logs.filter((l) => l.includes('[digest]')).pop();

describe('daily digest: the once-a-day throttle', () => {
  test('a user digested 22 hours ago is not mailed again', () => {
    const user = makeUser({ lastDigestAt: new Date(Date.now() - 22 * HOUR) });
    assert.equal(isDue(user, Date.now()), false);
  });

  test('a user digested 23 hours ago is due again', () => {
    // Six-hour scrape cadence means the boundary is reached at 24h in the worst
    // case; 23 is what keeps that from drifting to 30.
    const user = makeUser({ lastDigestAt: new Date(Date.now() - 23 * HOUR) });
    assert.equal(isDue(user, Date.now()), true);
  });

  test('a user who has never been digested is due', () => {
    assert.equal(isDue(makeUser(), Date.now()), true);
  });

  test('sixteen scrape cycles produce one email', async () => {
    // The property stated as the scenario that would actually regress. A throttle
    // that lives in memory, or not at all, mails sixteen times here.
    //
    // Time cannot be simulated -- isDue reads the real clock -- so this asserts the
    // honest version: with a match available on every cycle, repeated cycles must
    // not re-send. The 23-hour boundary is covered separately below.
    let sent = 0;
    let lastSentAt = null;
    for (let cycle = 0; cycle < 16; cycle += 1) {
      state.users = [makeUser({ lastDigestAt: lastSentAt })];
      state.notifications = [makeNotification('u1', 'j1', 0)];
      state.jobs = [makeJob('j1')];
      state.sent = [];
      await runDailyDigest();
      if (state.sent.length) {
        sent += 1;
        lastSentAt = new Date();
      }
    }
    assert.equal(sent, 1);
  });

  test('the throttle lives on the user, so a fresh process still respects it', async () => {
    state.users = [makeUser({ lastDigestAt: new Date(Date.now() - 2 * HOUR) })];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];

    const out = await runDailyDigest();

    assert.equal(out.sent, 0);
    assert.equal(out.notDue, 1);
    assert.equal(state.sent.length, 0);
  });
});

describe('daily digest: who is mailed', () => {
  test('sends nothing and says so when nobody has opted in', async () => {
    state.users = [makeUser({ dailyDigest: false })];

    const out = await runDailyDigest();

    assert.equal(out.sent, 0);
    // Silence here is indistinguishable from a broken digest.
    assert.match(digestLog(), /no user has the daily digest turned on/i);
  });

  test('an unverified address is not mailed', async () => {
    state.users = [makeUser({ emailVerified: false })];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];

    const out = await runDailyDigest();

    assert.equal(out.sent, 0);
    assert.equal(out.users, 0, 'excluded before it counts as a candidate');
  });

  test('every opted-in user gets their own email', async () => {
    state.users = [makeUser({ _id: 'u1' }), makeUser({ _id: 'u2', email: 'b@example.com' })];
    state.notifications = [makeNotification('u1', 'j1', 0), makeNotification('u2', 'j2', 0)];
    state.jobs = [makeJob('j1'), makeJob('j2')];

    const out = await runDailyDigest();

    assert.equal(out.sent, 2);
    assert.deepEqual(state.sent.map((s) => s.email).sort(), ['a@example.com', 'b@example.com']);
  });

  test('one address does not get another user matches', async () => {
    state.users = [makeUser({ _id: 'u1' })];
    state.notifications = [makeNotification('u2', 'j2', 0), makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1'), makeJob('j2')];

    await runDailyDigest();

    assert.equal(state.sent.length, 1);
    assert.deepEqual(state.sent[0].jobs.map((j) => String(j._id)), ['j1']);
  });
});

describe('daily digest: what goes in it', () => {
  test('summarises only what matched since the last digest', async () => {
    // 24h ago, not 6h: a user digested six hours ago is correctly not due yet, which
    // is the throttle test's job. Here the point is the window boundary, so the
    // last digest sits just outside the 23-hour threshold.
    state.users = [makeUser({ lastDigestAt: new Date(Date.now() - 24 * HOUR) })];
    state.notifications = [makeNotification('u1', 'recent', 1 * HOUR), makeNotification('u1', 'old', 25 * HOUR)];
    state.jobs = [makeJob('recent'), makeJob('old')];

    await runDailyDigest();

    assert.equal(state.sent.length, 1);
    assert.deepEqual(state.sent[0].jobs.map((j) => String(j._id)), ['recent']);
  });

  test('a first digest looks back one day, not forever', () => {
    const now = Date.now();
    const start = windowStartFor(makeUser(), now).getTime();
    assert.ok(Math.abs(now - 24 * HOUR - start) < 1000);
  });

  test('the window never reaches back more than seven days', () => {
    // A server outage must not produce one email containing a month of everything.
    const now = Date.now();
    const start = windowStartFor(makeUser({ lastDigestAt: new Date(now - 30 * DAY) }), now).getTime();
    assert.ok(Math.abs(now - 7 * DAY - start) < 1000);
  });

  test('sends no email when nothing matched', async () => {
    state.users = [makeUser()];

    const out = await runDailyDigest();

    assert.equal(out.sent, 0);
    assert.equal(out.noMatches, 1);
    assert.equal(state.sent.length, 0, 'an email saying "0 jobs" is not a digest');
  });

  test('an expired listing is still listed, not dropped', async () => {
    // The board keeps serving expired listings marked as such, so dropping them
    // would under-report what actually matched.
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1', { active: false })];

    await runDailyDigest();

    assert.equal(state.sent[0].jobs.length, 1);
    assert.equal(state.sent[0].jobs[0].active, false);
  });

  test('a match whose listing was deleted is reported, not silently counted', async () => {
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'gone', 0)];

    const out = await runDailyDigest();

    assert.equal(out.sent, 0);
    assert.equal(out.missingJobs, 1);
    // Worth a line: the board is being emptied underneath the alerts.
    assert.match(state.logs.join('\n'), /no listing could be resolved/i);
  });

  test('a duplicate match for one job is listed once', async () => {
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0), makeNotification('u1', 'j1', 60 * 1000)];
    state.jobs = [makeJob('j1')];

    await runDailyDigest();

    assert.equal(state.sent[0].jobs.length, 1);
  });

  test('a long list is truncated but the true total is still reported', async () => {
    state.users = [makeUser()];
    for (let i = 0; i < 22; i += 1) {
      state.notifications.push(makeNotification('u1', `j${i}`, i * 1000));
      state.jobs.push(makeJob(`j${i}`));
    }

    await runDailyDigest();

    assert.equal(state.sent[0].jobs.length, 15, 'the email itemises a readable number');
    assert.equal(state.sent[0].totalMatched, 22, 'and admits there were more');
  });

  test('the language preference is passed through, and only as fr or en', async () => {
    // 'de' is not a supported value and must fall back to 'en' rather than reaching
    // the templates as an undefined locale.
    state.users = [
      makeUser({ _id: 'u1', email: 'fr@example.com', preferredLanguage: 'fr' }),
      makeUser({ _id: 'u2', email: 'de@example.com', preferredLanguage: 'de' })
    ];
    state.notifications = [makeNotification('u1', 'j1', 0), makeNotification('u2', 'j2', 0)];
    state.jobs = [makeJob('j1'), makeJob('j2')];

    await runDailyDigest();

    const byEmail = Object.fromEntries(state.sent.map((s) => [s.email, s.language]));
    assert.equal(byEmail['fr@example.com'], 'fr');
    assert.equal(byEmail['de@example.com'], 'en');
  });
});

describe('daily digest: retry behaviour', () => {
  test('a failed send does not move the timestamp, so it is retried', async () => {
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];
    state.emailResult = { success: false, error: 'Brevo 429: rate limit' };

    const out = await runDailyDigest();

    assert.equal(out.failed, 1);
    assert.equal(out.sent, 0);
    // The load-bearing assertion. Moving it here would drop those matches for good.
    assert.equal(state.digestWrites.length, 0);
    assert.match(state.logs.join('\n'), /will retry next cycle/i);
  });

  test('the same matches are picked up on the next cycle after a failure', async () => {
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];
    state.emailResult = { success: false, error: 'Brevo 429' };
    await runDailyDigest();

    state.emailResult = { success: true };
    state.sent = [];
    await runDailyDigest();

    assert.equal(state.sent.length, 1, 'the failed window was not consumed');
    assert.equal(state.digestWrites.length, 1);
  });

  test('a send that throws is contained to that user', async () => {
    // One bad address must not stop the digest reaching everyone behind it.
    state.users = [makeUser({ _id: 'u1' }), makeUser({ _id: 'u2', email: 'b@example.com' })];
    state.notifications = [makeNotification('u1', 'j1', 0), makeNotification('u2', 'j2', 0)];
    state.jobs = [makeJob('j1'), makeJob('j2')];
    state.emailResult = { throwOnCall: true };

    const out = await runDailyDigest();

    assert.equal(out.failed, 2);
    assert.equal(out.sent, 0);
    assert.equal(state.digestWrites.length, 0);
  });

  test('a successful send records when it went out', async () => {
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];

    const before = Date.now();
    await runDailyDigest();

    assert.equal(state.digestWrites.length, 1);
    assert.equal(state.digestWrites[0].id, 'u1');
    assert.ok(state.digestWrites[0].at.getTime() >= before);
  });

  test('a no-match user is not stamped, so their window keeps accumulating', async () => {
    // Stamping here would mean a user whose alerts match nothing for a week gets a
    // one-line digest instead of the week of matches they actually accumulated.
    state.users = [makeUser()];
    const out = await runDailyDigest();

    assert.equal(out.noMatches, 1);
    assert.equal(state.digestWrites.length, 0);
  });
});

describe('daily digest: concurrency', () => {
  test('skips when another instance holds the lock', async () => {
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];
    state.lockReply = null;

    const out = await runDailyDigest();

    assert.equal(out.skipped, true);
    assert.equal(out.locked, true);
    assert.equal(state.sent.length, 0);
  });

  test('still runs when Redis is unavailable', async () => {
    // Redis is strictly optional across this app. A Redis outage must not mean no
    // digest; the per-user timestamp is what actually prevents duplicates.
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];
    state.redisReady = false;

    const out = await runDailyDigest();

    assert.equal(out.sent, 1);
  });

  test('a Redis error fails open rather than silently dropping the digest', async () => {
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];
    redisStub.getClient = () => ({
      set: async () => { throw new Error('ECONNRESET'); },
      eval: async () => 1
    });
    redisStub.isReady = () => true;

    const out = await runDailyDigest();

    assert.equal(out.sent, 1);
    assert.match(state.logs.join('\n'), /\[redis-error\] ECONNRESET/);
  });
});

describe('daily digest: the summary a human reads', () => {
  test('reports every outcome that explains a quiet cycle', async () => {
    state.users = [
      makeUser({ _id: 'u1' }),
      makeUser({ _id: 'u2', lastDigestAt: new Date(Date.now() - 2 * HOUR) }),
      makeUser({ _id: 'u3' })
    ];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];

    await runDailyDigest();

    const log = digestLog();
    // Without these the same "1 sent" line is indistinguishable from a matcher
    // that quietly ignored two users.
    assert.match(log, /1 sent to 3 opted-in user/);
    assert.match(log, /1 not due yet/);
    assert.match(log, /1 had no new matches/);
  });

  test('says when email was only logged because no transport is configured', async () => {
    // sendMail reports consoleOnly rather than a failure, so a staging deploy that
    // "sends" digests looks identical to a working one unless this is surfaced.
    state.users = [makeUser()];
    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];
    state.emailResult = { success: true, consoleOnly: true };

    const out = await runDailyDigest();

    assert.equal(out.sent, 1);
    assert.equal(out.consoleOnly, 1);
    assert.match(digestLog(), /no email transport configured/i);
  });

  test('sendDigestForUser names the reason it skipped', async () => {
    // The reason travels with the result so the caller reports it rather than
    // re-deriving it and getting it subtly different.
    state.users = [makeUser()];
    assert.equal(await sendDigestForUser(state.users[0], Date.now()), 'no-matches');

    state.notifications = [makeNotification('u1', 'gone', 0)];
    assert.equal(await sendDigestForUser(state.users[0], Date.now()), 'missing-jobs');

    state.notifications = [makeNotification('u1', 'j1', 0)];
    state.jobs = [makeJob('j1')];
    assert.equal(await sendDigestForUser(state.users[0], Date.now()), 'sent');
  });
});