const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const BACKEND = path.join(__dirname, '..');
const KEY_SERVICE_PATH = require.resolve('../services/apiKeyService');
const USER_MODEL_PATH = require.resolve('../models/User');

// The two leaves that need a database, and nothing else.
//
// Stubbing these two rather than mounting a fake auth middleware is deliberate: it
// leaves the real apiKeyAuth -- the prefix rejection, the identical 401 for every
// failure, the verification gate -- in the path of every test below, which is where
// the behaviour that matters actually lives.
const VERIFIED_USER = {
  _id: 'user-1',
  email: 'amelie@example.com',
  emailVerified: true,
  role: 'user',
  subscriptionStatus: 'active'
};

const keyStore = new Map(); // keyHash -> record
let presentedKey = null; // what verifyKey should resolve

const apiKeyServiceStub = {
  KEY_PREFIX: 'cvb_',
  MAX_LIVE_KEYS: 10,
  async verifyKey(plaintext) {
    // Mirrors the real prefix rejection, which is the one check that must happen
    // before any database work.
    const raw = String(plaintext || '').replace(/^Bearer\s+/i, '').trim();
    if (!raw.startsWith('cvb_')) return null;
    return presentedKey;
  },
  async createKey() { throw new Error('not used in this suite'); },
  async listKeys() { return []; },
  async revokeKey() { return false; },
  async activeKeyCount() { return 0; }
};

// Swappable so the verification test can make the same user unverified without
// re-stubbing the module.
let currentUser = VERIFIED_USER;

// Deliberately NOT async. Mongoose's findById returns a query you chain .select()
// onto before awaiting it, so the stub has to return a chainable thenable. An async
// function would wrap it in a promise and .select would be undefined -- which fails
// as a 401 here, because apiKeyAuth reports every thrown error the same way.
const UserStub = {
  findById(id) {
    return {
      select() { return this; },
      then(resolve, reject) {
        const match = String(id) === currentUser._id ? { ...currentUser } : null;
        return Promise.resolve(match).then(resolve, reject);
      }
    };
  }
};

const realApiKeyService = require(KEY_SERVICE_PATH);

/**
 * Mongoose query chains, as data rather than as stubs of individual methods.
 *
 * These exist so the tools that touch the database can be run for real: a filter that
 * lost `userId`, a `.select()` that came off in the wrong place, or a write that
 * happened before the argument check would all show up here, and each of them is the
 * kind of bug that only means anything when the whole tool runs.
 *
 * Every builder is thenable and chainable, because a real query is -- and because an
 * `async` builder quietly stops being chainable, which reads as a confusing
 * ".select is not a function" rather than as a broken test.
 */
function chain(result) {
  const c = {
    sort() { c._sorted = true; return c; },
    limit() { c._limited = true; return c; },
    select() { c._selected = true; return c; },
    then: (res, rej) => Promise.resolve(result).then(res, rej)
  };
  return c;
}

const JobStub = {
  rows: [],
  async findOne(filter) { return JobStub.rows.find(r => r._id === filter._id) || null; }
};
JobStub.find = (filter) => chain(JobStub.rows.filter(r => r.active !== false));

const TailoredDocumentStub = {
  rows: [],
  findOneAndUpdateCalls: [],
  find() { return chain(TailoredDocumentStub.rows); },
  async findOne(filter) {
    return TailoredDocumentStub.rows.find(r =>
      r._id === filter._id && (!filter.userId || r.userId === filter.userId)) || null;
  },
  findOneAndUpdate(filter, update) {
    TailoredDocumentStub.findOneAndUpdateCalls.push({ filter, update });
    const row = TailoredDocumentStub.rows.find(r =>
      r._id === filter._id && (!filter.userId || r.userId === filter.userId));
    if (row) Object.assign(row, update.$set);
    return chain(row || null);
  }
};

const JOB_MODEL_PATH = require.resolve('../models/Job');
const DOC_MODEL_PATH = require.resolve('../models/TailoredDocument');

before(() => {
  require.cache[KEY_SERVICE_PATH] = { id: KEY_SERVICE_PATH, filename: KEY_SERVICE_PATH, loaded: true, exports: apiKeyServiceStub };
  require.cache[USER_MODEL_PATH] = { id: USER_MODEL_PATH, filename: USER_MODEL_PATH, loaded: true, exports: UserStub };
  require.cache[JOB_MODEL_PATH] = { id: JOB_MODEL_PATH, filename: JOB_MODEL_PATH, loaded: true, exports: JobStub };
  require.cache[DOC_MODEL_PATH] = { id: DOC_MODEL_PATH, filename: DOC_MODEL_PATH, loaded: true, exports: TailoredDocumentStub };
  delete require.cache[require.resolve('../middleware/apiKeyAuth')];
  delete require.cache[require.resolve('../routes/mcp')];
});

after(() => {
  require.cache[KEY_SERVICE_PATH] = { id: KEY_SERVICE_PATH, filename: KEY_SERVICE_PATH, loaded: true, exports: realApiKeyService };
  for (const p of [USER_MODEL_PATH, JOB_MODEL_PATH, DOC_MODEL_PATH]) delete require.cache[p];
  delete require.cache[require.resolve('../middleware/apiKeyAuth')];
  delete require.cache[require.resolve('../routes/mcp')];
});

const csrfProtection = require('../middleware/csrf');
const sanitize = require('../middleware/sanitize');

/**
 * The real route behind the real middleware chain, on an ephemeral port.
 *
 * The middleware is the point: an MCP endpoint is the kind of thing that passes a
 * unit test and then 403s in production because a CSRF check and a body sanitiser
 * were written for browsers. So the chain here is the same one server.js mounts,
 * in the same order, and the requests go over a real socket.
 *
 * The route is required lazily rather than at the top of the file. A describe body
 * runs while the module is still loading, which is before the before() hook has
 * installed the stubs -- so a top-level require would capture the real service and
 * every test would then fail on a database call it was never supposed to make.
 */
async function withServer() {
  const mcpRoutes = require('../routes/mcp');

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(csrfProtection);
  app.use(sanitize);
  app.use('/api/mcp', mcpRoutes);

  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}/api/mcp`;
  return {
    base,
    // A raw POST, so the Accept and Content-Type requirements can be violated on
    // purpose. The MCP client always gets them right; a hand-written curl should get
    // a clear error rather than a stack trace. Both headers are valid by default
    // because the transport checks Accept before Content-Type -- overriding only the
    // content type would otherwise be answered with the 406 for the Accept header.
    post: (body, headers = {}) => fetch(base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer cvb_test',
        ...headers
      },
      body: JSON.stringify(body)
    }),
    close: () => new Promise(resolve => server.close(resolve))
  };
}

/** A connected, authenticated official MCP client. */
async function connectClient(base, apiKey = 'cvb_test_key') {
  const client = new Client({ name: 'cvboost-test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(base, {
    requestInit: { headers: { authorization: `Bearer ${apiKey}` } }
  });
  await client.connect(transport);
  return { client, close: () => client.close() };
}

describe('mcp: a real client interoperates', () => {
  let server;
  let client;

  before(async () => {
    presentedKey = { _id: 'key-1', userId: VERIFIED_USER._id, name: 'test' };
    server = await withServer();
    const conn = await connectClient(server.base);
    client = conn.client;
  });

  after(async () => {
    if (client) await client.close();
    if (server) await server.close();
  });

  test('completes the initialize handshake', () => {
    // If this passes, the transport, the JSON response mode and the protocol
    // version all line up. Everything below depends on it.
    assert.equal(client.getServerVersion().name, 'cvboost');
    assert.ok(client.getServerCapabilities().tools, 'the server should advertise tools');
  });

  test('lists every tool with a description and an input schema', async () => {
    const { tools } = await client.listTools();

    const names = tools.map(t => t.name).sort();
    assert.deepEqual(names, [
      'get_job',
      'list_documents',
      'list_jobs',
      'match_job',
      'score_resume',
      'set_application_status',
      'tailor_cv'
    ]);

    for (const tool of tools) {
      // A tool with no description is one the model cannot choose between, so the
      // distinction between score_resume and match_job would be lost.
      assert.ok(tool.description && tool.description.length > 40, `${tool.name} needs a real description`);
      assert.equal(tool.inputSchema.type, 'object', `${tool.name} needs an object schema`);
    }
  });

  test('calls a tool and reads structured JSON back', async () => {
    const result = await client.callTool({
      name: 'score_resume',
      arguments: {
        cvText: 'Amelie Ndo\nDevOps engineer.\nKubernetes, Terraform, Go.\nLed migration of 400 services.'
      }
    });

    assert.notEqual(result.isError, true, 'score_resume should not error');
    assert.equal(result.content[0].type, 'text');

    const payload = JSON.parse(result.content[0].text);
    // Whatever the score, the shape has to be right: a number, a maximum, and six
    // categories that add up to that maximum. This asserts the wiring, not the
    // scoring algorithm, which has its own tests.
    assert.equal(typeof payload.score, 'number');
    assert.equal(typeof payload.max, 'number');
    assert.equal(payload.categories.length, 6);
    assert.equal(payload.categories.reduce((sum, c) => sum + c.max, 0), payload.max);
    assert.ok(payload.percent >= 0 && payload.percent <= 100);
  });

  test('returns a tool error to the model instead of failing the transport', async () => {
    // An exception escaping a tool becomes a JSON-RPC protocol error, which most
    // clients render as "the MCP server is unreachable" -- losing both the message
    // and the conversation. An isError result keeps it.
    const result = await client.callTool({
      name: 'score_resume',
      arguments: {}
    });

    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /cvText|documentId/i);

    // And the connection still works afterwards, which is the point.
    const { tools } = await client.listTools();
    assert.equal(tools.length, 7);
  });

  test('accepts CV text with angle brackets without mangling it', async () => {
    // sanitize() strips <[^>]*> from every string in the body. Applied here it would
    // quietly rewrite the CV and return a score for something the user never sent.
    // The end-to-end assertion is that it still works; the middleware suite below
    // pins that the text itself is untouched, which this cannot observe without an
    // echo field that only exists for the test.
    const result = await client.callTool({
      name: 'score_resume',
      arguments: { cvText: 'Worked with array<int> and 3 < 5 years of Go.' }
    });

    assert.notEqual(result.isError, true, 'angle brackets should not cause a failure');
    assert.equal(typeof JSON.parse(result.content[0].text).score, 'number');
  });

  test('does not accept a request that is not JSON-RPC over POST', async () => {
    // Guards the two preconditions the transport enforces, so the failure is a clear
    // message rather than a parse error.
    const missingAccept = await fetch(server.base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: 'Bearer cvb_test' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(missingAccept.status, 406);

    const wrongContentType = await server.post(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      { 'content-type': 'text/plain' }
    );
    assert.equal(wrongContentType.status, 415);
  });

  test('keeps working across requests without a session id', async () => {
    // Render can route consecutive requests to different instances, so the endpoint
    // has to hold no per-connection state. Reusing one transport across several
    // calls is exactly the case that would break under a load balancer.
    const first = await client.callTool({ name: 'score_resume', arguments: { cvText: 'One.' } });
    const second = await client.callTool({ name: 'score_resume', arguments: { cvText: 'Two.' } });
    assert.equal(typeof JSON.parse(first.content[0].text).score, 'number');
    assert.equal(typeof JSON.parse(second.content[0].text).score, 'number');
  });
});

describe('mcp: authentication', () => {
  let server;
  before(async () => { presentedKey = { _id: 'key-1', userId: VERIFIED_USER._id, name: 'test' }; server = await withServer(); });
  after(async () => { if (server) await server.close(); });

  const rpc = { jsonrpc: '2.0', id: 1, method: 'tools/list' };

  test('refuses a request with no credential at all', async () => {
    const res = await fetch(server.base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify(rpc)
    });

    // No CSRF header and no bearer token: CSRF answers first, which is correct --
    // there is no ambient credential here to forge, but there is also no credential.
    assert.equal(res.status, 403);
  });

  test('refuses a bearer token that does not resolve to a key', async () => {
    presentedKey = null;
    const res = await fetch(server.base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer cvb_nope'
      },
      body: JSON.stringify(rpc)
    });

    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.code, 'INVALID_API_KEY');
  });

  test('gives the same 401 whether the key is wrong or revoked', async () => {
    // Two different situations, one indistinguishable answer, so this cannot be used
    // to find out which keys exist.
    const answers = [];
    for (const value of [null, undefined]) {
      presentedKey = value;
      const res = await fetch(server.base, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: 'Bearer cvb_whatever'
        },
        body: JSON.stringify(rpc)
      });
      answers.push({ status: res.status, body: await res.json() });
    }
    assert.deepEqual(answers[0], answers[1]);
    assert.equal(answers[0].status, 401);
  });

  test('tells an unverified account to verify, as every other route does', async () => {
    // Otherwise verification is a speed bump a caller routes around by using a key.
    presentedKey = { _id: 'key-1', userId: VERIFIED_USER._id, name: 'test' };
    const saved = currentUser;
    currentUser = { ...VERIFIED_USER, emailVerified: false };

    try {
      const res = await fetch(server.base, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: 'Bearer cvb_test'
        },
        body: JSON.stringify(rpc)
      });
      assert.equal(res.status, 403);
      assert.match((await res.json()).error, /verify/i);
    } finally {
      currentUser = saved;
    }
  });

  test('rejects a value that is not shaped like a key without a lookup', async () => {
    // The prefix check exists so a stray JWT or a bearer token from another service
    // costs no database query. A real client would never send these; a scanner would.
    // The module exports the model itself, so it is destructured as a whole.
    const ApiKey = require('../models/ApiKey');
    assert.equal(ApiKey.normaliseCandidate('Bearer cvb_abc'), 'cvb_abc');
    assert.equal(ApiKey.normaliseCandidate('  cvb_abc  '), 'cvb_abc');
    assert.equal(ApiKey.normaliseCandidate(undefined), '');
  });
});

describe('mcp: middleware that was written for browsers', () => {
  let server;
  before(async () => { presentedKey = { _id: 'key-1', userId: VERIFIED_USER._id, name: 'test' }; server = await withServer(); });
  after(async () => { if (server) await server.close(); });

  test('a bearer-authenticated POST is not blocked by CSRF', async () => {
    // CSRF defends the ambient session cookie. A request carrying its own
    // Authorization header has nothing to forge, and a client cannot send a CSRF
    // token because it has no session to have been issued one.
    const res = await fetch(server.base, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        authorization: 'Bearer cvb_test'
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(res.status, 200);
  });

  test('sanitize leaves the MCP body alone', () => {
    const req = { path: '/api/mcp', body: { params: { arguments: { cvText: 'array<int> and 3 < 5 years' } } } };
    sanitize(req, {}, () => {});
    assert.equal(req.body.params.arguments.cvText, 'array<int> and 3 < 5 years');
  });

  test('but sanitize still applies everywhere else', () => {
    // The exemption is scoped. Loosening it app-wide would be a different, worse bug.
    // stripHtml removes tags and keeps what was between them, which is the behaviour
    // sanitize.test.js pins; what matters here is that the path check does not
    // disable the middleware entirely.
    const req = { path: '/api/cv', body: { name: '<script>alert("xss")</script>John' } };
    sanitize(req, {}, () => {});
    assert.equal(req.body.name, 'alert("xss")John');
  });

  test('CSRF still applies to /api/mcp without a credential header', async () => {
    // Header-gated rather than path-gated, so a cookie-authenticated caller reaching
    // this path is not quietly exempted.
    const res = await fetch(server.base, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    assert.equal(res.status, 403);
    assert.match((await res.json()).error, /CSRF/i);
  });
});

describe('mcp: tools', () => {
  // Required here rather than at the top of the file, for the same reason the route
  // is: the Job and TailoredDocument stubs above are not installed until before().
  const { TOOLS, resolveCvSource, cvTextFromDocument, CV_TEXT_MAX } = require('../mcp/tools');

  const tool = name => TOOLS.find(t => t.name === name);
  const call = async (name, user, args) => JSON.parse((await tool(name).run(user, args)).content[0].text);

  beforeEach(() => {
    JobStub.rows = [];
    TailoredDocumentStub.rows = [];
    TailoredDocumentStub.findOneAndUpdateCalls = [];
  });

  test('cvTextFromDocument flattens a structured CV and drops empty sections', () => {
    const text = cvTextFromDocument({
      tailoredContent: {
        summary: 'DevOps engineer.',
        experience: [{ title: 'SRE', company: 'Acme', dates: '2022-2025', bullets: ['Cut costs by 40%', null] }],
        // A certifications array with a hole in it must not throw.
        certifications: [null, { title: 'CKA', issuer: 'CNCF', year: '2023' }]
      }
    });

    assert.match(text, /DevOps engineer\./);
    assert.match(text, /SRE - Acme/);
    assert.match(text, /Cut costs by 40%/);
    assert.match(text, /CKA - CNCF - 2023/);

    // No skills and no education were stored, so no empty headings. A blank heading
    // changes what the keyword scanner sees, which would change the score. Blank
    // lines between sections are intentional and expected.
    assert.ok(!/^Skills$/m.test(text), 'no empty Skills heading');
    assert.ok(!/^Education$/m.test(text), 'no empty Education heading');
    assert.ok(/^CKA - CNCF - 2023$/m.test(text), 'a certifications entry is not a heading');
  });

  test('resolveCvSource refuses to guess which of two inputs to use', async () => {
    await assert.rejects(
      () => resolveCvSource({}, { cvText: 'a CV', documentId: 'a'.repeat(24) }),
      /either cvText or documentId/
    );
  });

  test('resolveCvSource refuses an empty request with both options named', async () => {
    // Whitespace is not a CV. Without the trim, an empty string would sail past the
    // hasText check and be scored as a blank CV.
    await assert.rejects(() => resolveCvSource({}, {}), /cvText.*documentId|Provide cvText/i);
    await assert.rejects(() => resolveCvSource({}, { cvText: '   ' }), /Provide cvText/i);
  });

  test('resolveCvSource enforces a size limit instead of truncating', async () => {
    // Silently cutting a CV at the limit would score a document the user never sent.
    await assert.rejects(
      () => resolveCvSource({}, { cvText: 'x'.repeat(CV_TEXT_MAX + 1) }),
      new RegExp(`limit is ${CV_TEXT_MAX}`)
    );
    const ok = await resolveCvSource({}, { cvText: 'x'.repeat(CV_TEXT_MAX) });
    assert.equal(ok.text.length, CV_TEXT_MAX, 'exactly at the limit is fine');
  });

  test('resolveCvSource accepts pasted text without touching the database', async () => {
    // No userId, no document -- if this needed the database it would throw.
    const { text, document } = await resolveCvSource({}, { cvText: '  a CV  ' });
    assert.equal(text, 'a CV');
    assert.equal(document, null);
  });

  test('set_application_status writes nothing when given nothing', async () => {
    await assert.rejects(
      () => tool('set_application_status').run({ _id: 'u' }, { documentId: 'a'.repeat(24) }),
      /Nothing to update/
    );
  });

  test('set_application_status will not store a date that does not exist', async () => {
    // The schema only pins the shape. 2026-02-30 matches ^\d{4}-\d{2}-\d{2}$ and
    // Date rolls it over to 1 March, so a follow-up would quietly land early.
    const id = 'a'.repeat(24);
    for (const bad of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-01-32']) {
      await assert.rejects(
        () => tool('set_application_status').run({ _id: 'u' }, { documentId: id, followUpDate: bad }),
        /not a real date/i,
        `${bad} should be rejected`
      );
    }
  });

  test('set_application_status accepts a real leap day and a real end-of-month', async () => {
    // Guards the round-trip check against being over-eager: 2024 is a leap year, and
    // the 28th and the 31st both exist. A check that rejected these would be worse
    // than the rollover bug it replaced.
    TailoredDocumentStub.rows = [{ _id: 'd'.repeat(24), userId: 'user-1', status: 'saved' }];

    for (const good of ['2024-02-29', '2026-02-28', '2026-12-31']) {
      await tool('set_application_status').run({ _id: 'user-1' }, { documentId: 'd'.repeat(24), followUpDate: good });
      // Checked after each write, not once at the end: the row only holds the most
      // recent value, so a single trailing assertion would not notice that two of the
      // three had landed wrong.
      assert.equal(
        TailoredDocumentStub.rows[0].followUpDate.toISOString(),
        `${good}T00:00:00.000Z`,
        `${good} should be stored as itself, at UTC midnight`
      );
    }

    assert.equal(TailoredDocumentStub.findOneAndUpdateCalls.length, 3, 'all three reached the write');
  });

  test('every tool declares a readOnly hint that matches whether it writes', () => {
    // Only set_application_status writes. A tool marked read-only that writes is the
    // dangerous direction: a client is entitled to auto-approve it.
    const writers = TOOLS.filter(t => t.config.annotations.readOnlyHint === false).map(t => t.name);
    assert.deepEqual(writers, ['set_application_status']);
  });

  test('the input schemas bound every string a caller can push through them', async () => {
    // Checked by parsing rather than by reading the schema's internals: what matters
    // is that a 500-character value is refused, not which field of which internal
    // object records the limit.
    const schema = tool('set_application_status').config.inputSchema;
    assert.equal(schema.nextAction.safeParse('x'.repeat(200)).success, true, '200 is allowed');
    assert.equal(schema.nextAction.safeParse('x'.repeat(201)).success, false, '201 is not');
    assert.equal(schema.company.safeParse('x'.repeat(120)).success, true);
    assert.equal(schema.company.safeParse('x'.repeat(121)).success, false);

    // cvText and jobText are bounded by the service rather than the schema, so the
    // schema accepts a long string and the tool then refuses it. Both bounds are
    // asserted above and in the size-limit test; this is the schema half.
    assert.equal(tool('score_resume').config.inputSchema.cvText.safeParse('x'.repeat(CV_TEXT_MAX)).success, true);
  });

  test('a document belonging to someone else is a miss, not an edit', async () => {
    // The filter carries userId, so another account's document is not found and
    // nothing is written. Scoped in the query rather than checked afterwards, so
    // there is no window where the write has already happened.
    TailoredDocumentStub.rows = [{ _id: 'b'.repeat(24), userId: 'someone-else', status: 'saved' }];
    await assert.rejects(
      () => tool('set_application_status').run({ _id: 'user-1' }, { documentId: 'b'.repeat(24), status: 'applied' }),
      /No such document/
    );
    assert.equal(TailoredDocumentStub.rows[0].status, 'saved', 'and it was not touched');
  });

  test('it does write the caller\'s own document', async () => {
    TailoredDocumentStub.rows = [{ _id: 'c'.repeat(24), userId: 'user-1', status: 'saved' }];
    const out = await call('set_application_status', { _id: 'user-1' }, {
      documentId: 'c'.repeat(24),
      status: 'interview',
      nextAction: 'Send the take-home exercise'
    });

    assert.equal(out.updated, true);
    assert.equal(out.status, 'interview');
    assert.equal(TailoredDocumentStub.rows[0].status, 'interview');
  });
});

describe('mcp: the endpoint is wired into the app', () => {
  test('server.js mounts it', () => {
    const source = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');
    assert.match(source, /app\.use\('\/api\/mcp',\s*mcpRoutes\)/);
    assert.match(source, /app\.use\('\/api\/keys',\s*apiKeyRoutes\)/);
  });

  test('it is mounted before the JSON 404 catch-all', () => {
    const source = fs.readFileSync(path.join(BACKEND, 'server.js'), 'utf8');
    const mcp = source.indexOf("app.use('/api/mcp'");
    const notFound = source.indexOf("app.use('/api', (_req, res)");
    assert.ok(mcp > 0 && notFound > 0, 'both should be present');
    assert.ok(mcp < notFound, 'otherwise an unknown path under /api/mcp returns index.html');
  });
});
