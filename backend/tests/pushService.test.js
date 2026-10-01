const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// The push service talks to a push service and to Mongo, so both are stubbed.
// What is under test is the delivery contract: dead subscriptions get pruned,
// transient failures get retried, and nothing ever throws at the caller.

function loadWith({ subscriptions, sendNotification, vapidConfigured = true }) {
  const backend = path.join(__dirname, '..');
  const modelPath = require.resolve('../models/PushSubscription');
  const configPath = require.resolve('../config/push');
  const servicePath = require.resolve('../services/pushService');

  const sent = [];
  const deleted = [];

  const ModelStub = {
    find: () => ({ lean: async () => subscriptions }),
    deleteMany: async (q) => {
      deleted.push(q);
      return { deletedCount: subscriptions.length };
    }
  };
  require.cache[modelPath] = {
    id: modelPath, filename: modelPath, loaded: true, exports: ModelStub
  };

  const configStub = {
    isConfigured: () => vapidConfigured,
    setDetails: () => vapidConfigured,
    publicKey: () => (vapidConfigured ? 'public-key' : null),
    SUBJECT: 'mailto:test@example.com',
    webpush: {
      sendNotification: async (sub, body) => {
        sent.push({ sub, body });
        const outcome = sendNotification ? sendNotification(sub, body) : null;
        if (outcome) throw outcome;
        return { statusCode: 201 };
      }
    }
  };
  require.cache[configPath] = {
    id: configPath, filename: configPath, loaded: true, exports: configStub
  };

  delete require.cache[servicePath];
  return { service: require(servicePath), sent, deleted };
}

const sub = (id, endpoint) => ({
  _id: id,
  endpoint,
  keys: { p256dh: 'p', auth: 'a' }
});

test('push is a no-op when VAPID is not configured', async () => {
  const { service, sent } = loadWith({
    subscriptions: [sub('1', 'https://push.example/1')],
    vapidConfigured: false
  });
  const result = await service.sendToUser('user-1', { title: 'hi' });
  assert.deepEqual(result, { sent: 0, pruned: 0 });
  assert.equal(sent.length, 0);
});

test('push is a no-op when the user has no subscriptions', async () => {
  const { service, sent } = loadWith({ subscriptions: [] });
  const result = await service.sendToUser('user-1', { title: 'hi' });
  assert.deepEqual(result, { sent: 0, pruned: 0 });
  assert.equal(sent.length, 0);
});

test('push reaches every subscribed device', async () => {
  const { service, sent } = loadWith({
    subscriptions: [sub('1', 'https://push.example/1'), sub('2', 'https://push.example/2')]
  });
  const result = await service.sendToUser('user-1', { title: 'New job', body: 'Dev' });
  assert.equal(result.sent, 2);
  assert.equal(result.pruned, 0);
  assert.equal(sent.length, 2);
});

test('the payload is serialised as JSON', async () => {
  const { service, sent } = loadWith({ subscriptions: [sub('1', 'https://push.example/1')] });
  await service.sendToUser('user-1', { title: 'New job', link: '/jobs/1' });
  assert.deepEqual(JSON.parse(sent[0].body), { title: 'New job', link: '/jobs/1' });
});

test('the subscription keys are forwarded to the push service', async () => {
  const { service, sent } = loadWith({ subscriptions: [sub('1', 'https://push.example/1')] });
  await service.sendToUser('user-1', { title: 'hi' });
  assert.deepEqual(sent[0].sub.keys, { p256dh: 'p', auth: 'a' });
});

for (const status of [404, 410]) {
  test(`a ${status} prunes the dead subscription instead of retrying forever`, async () => {
    const { service, sent, deleted } = loadWith({
      subscriptions: [sub('1', 'https://push.example/dead'), sub('2', 'https://push.example/live')],
      sendNotification: (s) => (s.endpoint.includes('dead') ? Object.assign(new Error('Gone'), { statusCode: status }) : null)
    });
    const result = await service.sendToUser('user-1', { title: 'hi' });
    assert.equal(result.sent, 1, 'the live subscription still receives it');
    assert.equal(result.pruned, 1);
    assert.equal(deleted.length, 1);
    assert.deepEqual(deleted[0]._id.$in, ['1']);
    assert.equal(sent.length, 2, 'both were attempted');
  });
}

test('a transient failure keeps the subscription for a later retry', async () => {
  // A push-service outage or an expired VAPID key is not the browser's fault;
  // deleting the row would silently stop this user receiving anything at all.
  const { service, deleted } = loadWith({
    subscriptions: [sub('1', 'https://push.example/1')],
    sendNotification: () => Object.assign(new Error('Service unavailable'), { statusCode: 503 })
  });
  const result = await service.sendToUser('user-1', { title: 'hi' });
  assert.equal(result.sent, 0);
  assert.equal(result.pruned, 0);
  assert.equal(deleted.length, 0);
});

test('a network error without a status code keeps the subscription', async () => {
  const { service, deleted } = loadWith({
    subscriptions: [sub('1', 'https://push.example/1')],
    sendNotification: () => new Error('socket hang up')
  });
  const result = await service.sendToUser('user-1', { title: 'hi' });
  assert.equal(result.pruned, 0);
  assert.equal(deleted.length, 0);
});

test('one dead device does not stop the others being notified', async () => {
  const { service } = loadWith({
    subscriptions: [sub('1', 'https://push.example/dead'), sub('2', 'https://push.example/live')],
    sendNotification: (s) => (s.endpoint.includes('dead') ? Object.assign(new Error('Gone'), { statusCode: 410 }) : null)
  });
  const result = await service.sendToUser('user-1', { title: 'hi' });
  assert.equal(result.sent, 1);
});

test('notifyUser never rejects, so it is safe on a write path', async () => {
  // Callers use this after a database write; a rejection here would surface as
  // a failed request even though the write itself succeeded.
  const { service } = loadWith({
    subscriptions: [sub('1', 'https://push.example/1')],
    sendNotification: () => Object.assign(new Error('boom'), { statusCode: 500 })
  });
  await assert.doesNotReject(async () => service.notifyUser('user-1', { title: 'hi' }));
});

test('notifyUser survives an entirely unavailable push path', async () => {
  const { service } = loadWith({ subscriptions: [], vapidConfigured: false });
  await assert.doesNotReject(async () => service.notifyUser('user-1', { title: 'hi' }));
});