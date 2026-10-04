const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// Alert matching has to be *readable* from a log line.
//
// It shipped logging only "alerts matched 0 new notification(s)", which is true in
// three quite different situations: nothing matched, everything matched but was
// already notified, and there are no alerts at all. An operator reading that cannot
// tell a working dedupe from a broken matcher, and the last of the three prints
// nothing at all. So the counts that separate them are the behaviour under test.
const SERVICE_PATH = require.resolve('../services/jobService');
const ALERT_PATH = require.resolve('../models/JobAlert');
const NOTIFICATION_PATH = require.resolve('../models/Notification');
const USER_PATH = require.resolve('../models/User');
const LOGGER_PATH = require.resolve('../utils/logger');

const logs = [];

const loggerStub = {
  info: (msg) => logs.push(msg),
  warn: (msg) => logs.push(msg),
  error: (msg) => logs.push(msg)
};

// alerts: the JobAlert documents this run will return.
// notified: a Set of "userId:jobId" the Notification.exists check will report as seen.
const state = { alerts: [], notified: new Set() };

function idFor(label) {
  return { toString: () => label, equals: (other) => String(other) === label };
}

const JobAlertStub = {
  // Deliberately not async: the service chains .lean() onto it before awaiting, so
  // an async stub would return a promise and fail with a confusing ".lean is not a
  // function" instead of a clear one.
  find() {
    return {
      lean: async () => state.alerts.map((a, i) => ({
        _id: idFor(`alert-${i}`),
        userId: a.userId,
        keywords: a.keywords || [],
        locations: a.locations || [],
        categories: a.categories || [],
        emailEnabled: !!a.emailEnabled,
        ...a
      }))
    };
  },
  async updateOne() { return { acknowledged: true }; }
};

const NotificationStub = {
  async exists({ userId, jobId }) {
    return state.notified.has(`${userId}:${jobId}`) ? { _id: idFor('n') } : null;
  },
  async create() { return { _id: idFor('created') }; }
};

const UserStub = {
  findById(id) {
    return {
      select() { return this; },
      lean: async () => ({ _id: id, email: 'a@example.com', preferredLanguage: 'en' })
    };
  }
};

const pushStub = { async sendToUser() { return { sent: 0 }; } };

let matchAlertsForJobs;

before(() => {
  for (const [p, stub] of [
    [SERVICE_PATH, null],
    [ALERT_PATH, JobAlertStub],
    [NOTIFICATION_PATH, NotificationStub],
    [USER_PATH, UserStub],
    [LOGGER_PATH, loggerStub],
    [require.resolve('../services/pushService'), pushStub],
    [require.resolve('../services/emailService'), { async sendJobAlertEmail() { return { consoleOnly: true }; } }]
  ]) {
    if (stub) require.cache[p] = { id: p, filename: p, loaded: true, exports: stub };
  }
  delete require.cache[SERVICE_PATH];
  matchAlertsForJobs = require(SERVICE_PATH).matchAlertsForJobs;
});

after(() => {
  for (const p of [ALERT_PATH, NOTIFICATION_PATH, USER_PATH, LOGGER_PATH]) delete require.cache[p];
  delete require.cache[require.resolve('../services/pushService')];
  delete require.cache[require.resolve('../services/emailService')];
  delete require.cache[SERVICE_PATH];
});

beforeEach(() => { logs.length = 0; state.alerts = []; state.notified = new Set(); });

const job = (id, overrides = {}) => ({
  _id: idFor(id),
  title: 'DevOps Engineer',
  company: 'Acme',
  location: 'Douala',
  description: 'Kubernetes and Terraform',
  category: 'IT & Software',
  ...overrides
});

const lastAlertLog = () => logs.filter(l => l.includes('[jobs]')).pop();

describe('job alerts: the log distinguishes the three quiet outcomes', () => {
  test('says so when there are no alerts, rather than staying silent', async () => {
    state.alerts = [];
    const out = await matchAlertsForJobs([job('j1')]);

    assert.equal(out.notifications, 0);
    assert.equal(out.alerts, 0);
    // Silence is the failure mode: an empty table reads like a broken matcher.
    assert.match(lastAlertLog(), /no active job alerts/i);
    assert.match(lastAlertLog(), /nothing was matched/i);
  });

  test('separates "matched nothing" from "matched, already notified"', async () => {
    state.alerts = [{ userId: 'u1', keywords: ['devops'] }];
    state.notified.add('u1:j1');

    const out = await matchAlertsForJobs([job('j1')]);

    // The pair matched the alert but the notification already existed.
    assert.equal(out.matched, 1, 'the alert did match');
    assert.equal(out.alreadyNotified, 1);
    assert.equal(out.notifications, 0, 'but nothing new was created');

    // Both numbers in one line, so a healthy dedupe cannot be misread as a failure.
    const log = lastAlertLog();
    assert.match(log, /1 active against 1 listing/);
    assert.match(log, /1 matched/);
    assert.match(log, /1 already notified/);
    assert.match(log, /0 new notification/);
  });

  test('reports a genuine first-time match as new', async () => {
    state.alerts = [{ userId: 'u1', keywords: ['devops'] }];

    const out = await matchAlertsForJobs([job('j1')]);

    assert.equal(out.matched, 1);
    assert.equal(out.alreadyNotified, 0);
    assert.equal(out.notifications, 1);
    assert.match(lastAlertLog(), /1 matched, 0 already notified, 1 new notification/);
  });

  test('reports zero matches as zero matches, not as silence', async () => {
    // The alert exists and the listing is a perfect match for it -- except the
    // keyword is not in the posting. This is the case the old log was ambiguous about.
    state.alerts = [{ userId: 'u1', keywords: ['accounting'] }];

    const out = await matchAlertsForJobs([job('j1')]);

    assert.equal(out.matched, 0);
    assert.equal(out.alreadyNotified, 0);
    assert.equal(out.notifications, 0);
    assert.match(lastAlertLog(), /1 active against 1 listing.*0 matched, 0 already notified/);
  });

  test('every early return carries the same keys', async () => {
    // The two early returns used to omit `pushes`, so anything reading
    // result.pushes got undefined on the quiet paths and a number on the busy ones.
    const shape = (r) => Object.keys(r).sort().join(',');
    // The zero-match return plus one optional flag; the skipping case adds `skipped`.
    const expected = 'alerts,alreadyNotified,emails,matched,notifications,pushes';

    state.alerts = [];
    assert.equal(shape(await matchAlertsForJobs([job('j1')])), expected);

    state.alerts = [{ userId: 'u1', keywords: ['devops'] }];
    assert.equal(shape(await matchAlertsForJobs([job('j1')])), expected);

    // With listings but no alerts, versus no listings at all. The second is allowed
    // the extra key; what it must not do is drop one of the shared five.
    const noJobs = await matchAlertsForJobs([]);
    for (const key of expected.split(',')) {
      assert.ok(key in noJobs, `the no-listings path is missing "${key}"`);
    }
  });

  test('says it was skipped when there are no listings at all', async () => {
    const out = await matchAlertsForJobs([]);
    assert.equal(out.skipped, true);
    assert.match(lastAlertLog(), /skipped/i);
  });
});