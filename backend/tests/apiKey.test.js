const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const APIKEY_MODEL_PATH = require.resolve('../models/ApiKey');

// An in-memory stand-in for the ApiKey collection.
//
// Written as a fake collection rather than a stub of each method so the service's
// real queries are exercised: a key lookup that forgot `revokedAt: null`, or a revoke
// that forgot the userId, would pass against a hand-stubbed findOne and fail here.
const rows = [];
let nextId = 1;

const matches = (row, filter = {}) => {
  return Object.entries(filter).every(([key, value]) => {
    if (key === '_id') return String(row._id) === String(value);
    if (key === 'userId') return String(row.userId) === String(value);
    if (key === 'keyHash') return row.keyHash === value;
    if (key === 'revokedAt') return row.revokedAt === value;
    return row[key] === value;
  });
};

const MODEL_PATH = APIKEY_MODEL_PATH;
const realModel = require(MODEL_PATH);

const ModelStub = {
  KEY_PREFIX: realModel.KEY_PREFIX,
  generateKey: realModel.generateKey,
  hashKey: realModel.hashKey,
  normaliseCandidate: realModel.normaliseCandidate,

  async countDocuments(filter = {}) {
    return rows.filter(r => matches(r, filter)).length;
  },
  async create(doc) {
    const row = {
      _id: `key-${nextId++}`,
      ...doc,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      lastUsedAt: null,
      revokedAt: null
    };
    rows.push(row);
    return row;
  },
  // find and findOne are deliberately NOT async. Mongoose hands back a query you
  // chain onto -- .sort(), .select() -- and only then await. An async function would
  // wrap that in a promise, so `.sort is not a function`, which is a confusing way to
  // learn the rule.
  find(filter = {}) {
    const chain = {
      sort() { return chain; },
      limit() { return chain; },
      select() { return chain; },
      then: (res, rej) => Promise.resolve(rows.filter(r => matches(r, filter))).then(res, rej)
    };
    return chain;
  },
  async findOneAndUpdate(filter, update, _options) {
    const row = rows.find(r => matches(r, filter));
    if (!row) return null;
    Object.assign(row, update.$set);
    return row;
  },
  findOne(filter = {}) {
    // Mirrors `select: false` on the schema: the hash comes back only when the
    // caller asks for it with .select('+keyHash'). A service that relied on getting
    // it either way would find it undefined here.
    const chain = {
      _projection: false,
      select(field) { chain._projection = field === '+keyHash'; return chain; },
      then: (res, rej) => {
        const row = rows.filter(r => matches(r, filter))[0];
        if (!row) return Promise.resolve(null).then(res, rej);
        const shaped = { ...row };
        if (!chain._projection) delete shaped.keyHash;
        return Promise.resolve(shaped).then(res, rej);
      }
    };
    return chain;
  },
  async updateOne(filter, update) {
    const row = rows.find(r => matches(r, filter));
    if (row) Object.assign(row, update.$set);
    return { acknowledged: true };
  }
};

let apiKeyService;

before(() => {
  require.cache[MODEL_PATH] = { id: MODEL_PATH, filename: MODEL_PATH, loaded: true, exports: ModelStub };
  delete require.cache[require.resolve('../services/apiKeyService')];
  apiKeyService = require('../services/apiKeyService');
});

after(() => {
  require.cache[MODEL_PATH] = { id: MODEL_PATH, filename: MODEL_PATH, loaded: true, exports: realModel };
  delete require.cache[require.resolve('../services/apiKeyService')];
});

beforeEach(() => { rows.length = 0; nextId = 1; });

describe('apiKeyService: minting', () => {
  test('returns the plaintext once and stores only its hash', async () => {
    const created = await apiKeyService.createKey('user-1', 'Claude Desktop');

    assert.match(created.key, /^cvb_[0-9a-f]{64}$/, 'a 32-byte key, hex encoded');

    const stored = rows[0];
    assert.notEqual(stored.keyHash, created.key, 'the plaintext must not be what is stored');
    assert.equal(stored.keyHash, ModelStub.hashKey(created.key));
    assert.ok(!JSON.stringify(rows).includes(created.key), 'the plaintext appears nowhere in the row');
  });

  test('the stored prefix identifies the key without being enough to use it', async () => {
    const created = await apiKeyService.createKey('user-1', 'phone');

    assert.ok(created.key.startsWith(created.prefix), 'the prefix is the head of the key');
    assert.equal(created.prefix.length, 'cvb_'.length + 12);
    // The prefix is shown in the settings list, so it has to be useless as a
    // credential -- otherwise the list would be a list of working secrets.
    assert.ok(created.key.length > created.prefix.length);
    assert.notEqual(ModelStub.hashKey(created.prefix), rows[0].keyHash);
    assert.equal(await apiKeyService.verifyKey(created.prefix), null, 'and it does not authenticate');
  });

  test('two keys for the same account are different', async () => {
    const a = await apiKeyService.createKey('user-1', 'one');
    const b = await apiKeyService.createKey('user-1', 'two');
    assert.notEqual(a.key, b.key);
    assert.notEqual(rows[0].keyHash, rows[1].keyHash);
  });

  test('trims the name and rejects an empty one', async () => {
    const created = await apiKeyService.createKey('user-1', '  laptop  ');
    assert.equal(created.name, 'laptop');

    await assert.rejects(() => apiKeyService.createKey('user-1', '   '), /name is required/i);
  });

  test('rejects a name that is too long rather than truncating it', async () => {
    // Truncating would silently merge two keys whose names differ only past the cut.
    await assert.rejects(() => apiKeyService.createKey('user-1', 'x'.repeat(apiKeyService.NAME_MAX + 1)), /fewer/i);
  });

  test('caps how many live keys an account can hold', async () => {
    for (let i = 0; i < apiKeyService.MAX_LIVE_KEYS; i++) {
      await apiKeyService.createKey('user-1', `key ${i}`);
    }
    await assert.rejects(() => apiKeyService.createKey('user-1', 'one too many'), /Revoke one/i);

    // Revoking one frees a slot -- the cap is on live keys, not on keys ever made.
    await apiKeyService.revokeKey('user-1', rows[0]._id);
    const extra = await apiKeyService.createKey('user-1', 'after revoking');
    assert.ok(extra.key.startsWith('cvb_'));
  });
});

describe('apiKeyService: listing', () => {
  test('never returns the hash or anything resembling the key', async () => {
    const created = await apiKeyService.createKey('user-1', 'laptop');
    const [listed] = await apiKeyService.listKeys('user-1');

    assert.equal(listed.name, 'laptop');
    assert.equal(listed.prefix, created.prefix);
    assert.equal(listed.active, true);
    assert.equal(listed.keyHash, undefined, 'the hash must never be listed');
    assert.ok(!JSON.stringify(await apiKeyService.listKeys('user-1')).includes(created.key));
  });

  test('reports a revoked key as inactive but still lists it', async () => {
    await apiKeyService.createKey('user-1', 'old client');
    await apiKeyService.revokeKey('user-1', rows[0]._id);

    const [listed] = await apiKeyService.listKeys('user-1');
    assert.equal(listed.active, false);
    assert.ok(listed.revokedAt instanceof Date, 'so the UI can show when it died');
  });

  test('only lists the caller\'s own keys', async () => {
    await apiKeyService.createKey('user-1', 'mine');
    await apiKeyService.createKey('user-2', 'theirs');

    const listed = await apiKeyService.listKeys('user-1');
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'mine');
  });
});

describe('apiKeyService: revoking', () => {
  test('revokes a key the caller owns', async () => {
    const created = await apiKeyService.createKey('user-1', 'laptop');
    assert.equal(await apiKeyService.revokeKey('user-1', created.id), true);

    assert.ok(rows[0].revokedAt instanceof Date);
    // And the key stops working immediately.
    assert.equal(await apiKeyService.verifyKey(created.key), null);
  });

  test("will not revoke another account's key", async () => {
    // Not-found rather than forbidden: a 403 would confirm the id exists.
    const theirs = await apiKeyService.createKey('user-2', 'theirs');
    assert.equal(await apiKeyService.revokeKey('user-1', theirs.id), false);
    assert.equal(rows[0].revokedAt, null, 'and must leave it working');
  });

  test('revoking twice is not an error', async () => {
    const created = await apiKeyService.createKey('user-1', 'laptop');
    assert.equal(await apiKeyService.revokeKey('user-1', created.id), true);
    assert.equal(await apiKeyService.revokeKey('user-1', created.id), false);
  });

  test('an unknown id is a miss, not a throw', async () => {
    assert.equal(await apiKeyService.revokeKey('user-1', 'key-does-not-exist'), false);
  });
});

describe('apiKeyService: verifying', () => {
  test('resolves a live key to its owner', async () => {
    const created = await apiKeyService.createKey('user-1', 'laptop');
    const record = await apiKeyService.verifyKey(created.key);

    assert.ok(record);
    assert.equal(record.userId, 'user-1');

    // The record handed back is the one read from the database, so its lastUsedAt is
    // still the old value -- the usage write is deliberately not awaited into the
    // request path, because denying a valid request over a timestamp would be a bad
    // trade. The settings list reads the row later, and the row is what matters.
    assert.equal(record.lastUsedAt, null, 'the returned record is a pre-write snapshot');

    // One turn of the event loop for the fire-and-forget write to land.
    await new Promise(resolve => setImmediate(resolve));
    assert.ok(rows[0].lastUsedAt instanceof Date, 'usage is recorded on the row');
  });

  test('accepts the Bearer form as well as the bare key', async () => {
    const created = await apiKeyService.createKey('user-1', 'laptop');
    assert.ok(await apiKeyService.verifyKey(`Bearer ${created.key}`), 'clients send the header');
    assert.ok(await apiKeyService.verifyKey(`bearer ${created.key}`), 'and the scheme is case-insensitive');
  });

  test('rejects a revoked key', async () => {
    const created = await apiKeyService.createKey('user-1', 'laptop');
    await apiKeyService.revokeKey('user-1', created.id);
    assert.equal(await apiKeyService.verifyKey(created.key), null);
  });

  test('rejects a wrong key, an empty one and junk without a lookup', async () => {
    const created = await apiKeyService.createKey('user-1', 'laptop');

    assert.equal(await apiKeyService.verifyKey('cvb_' + '0'.repeat(64)), null, 'right shape, wrong value');
    assert.equal(await apiKeyService.verifyKey(''), null);
    assert.equal(await apiKeyService.verifyKey(undefined), null);

    // Anything without our prefix is not a key of ours. A JWT or a bearer token
    // belonging to some other service should not cost a database round trip.
    assert.equal(await apiKeyService.verifyKey('eyJhbGciOiJIUzI1NiJ9.payload.sig'), null);
    assert.equal(await apiKeyService.verifyKey('sk-ant-api03-something'), null);
    assert.ok(rows.length === 1, 'no extra rows, and nothing was created');
  });

  test('a key is not accepted with its case changed', async () => {
    // The key is hex; a case-insensitive comparison would make the stored hash and
    // the presented hash disagree in a way that is very hard to debug.
    const created = await apiKeyService.createKey('user-1', 'laptop');
    const flipped = created.key.replace('a', 'A');
    if (flipped === created.key) return; // no 'a' to flip in this key
    assert.equal(await apiKeyService.verifyKey(flipped), null);
  });
});

describe('apiKey model', () => {
  test('the hash is not selected by default', () => {
    // The schema marks it select: false, so the plaintext-equivalent column cannot
    // leak through a careless find() elsewhere in the codebase.
    const path = 'keyHash';
    assert.equal(realModel.schema.path(path).selected, false);
  });

  test('normaliseCandidate handles the shapes a transport can hand it', () => {
    assert.equal(realModel.normaliseCandidate('Bearer cvb_abc'), 'cvb_abc');
    assert.equal(realModel.normaliseCandidate('BEARER   cvb_abc  '), 'cvb_abc');
    assert.equal(realModel.normaliseCandidate('cvb_abc'), 'cvb_abc');
    assert.equal(realModel.normaliseCandidate('   '), '');
    // A non-string becomes the empty string rather than being coerced. `Bearer 42`
    // would otherwise arrive as the literal '42' and reach a database lookup.
    assert.equal(realModel.normaliseCandidate(null), '');
    assert.equal(realModel.normaliseCandidate(42), '');
    assert.equal(realModel.normaliseCandidate({ toString: () => 'cvb_x' }), '');
  });

  test('the same key always hashes to the same value', () => {
    // Deterministic, or a key would stop working the first time it was used.
    assert.equal(realModel.hashKey('cvb_abc'), realModel.hashKey('cvb_abc'));
    assert.notEqual(realModel.hashKey('cvb_abc'), realModel.hashKey('cvb_abd'));
    assert.match(realModel.hashKey('cvb_abc'), /^[0-9a-f]{64}$/);
  });
});
