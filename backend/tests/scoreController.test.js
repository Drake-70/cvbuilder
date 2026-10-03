const test = require('node:test');
const assert = require('node:assert');

// Loaded normally: this controller destructures its collaborators at require time,
// so the mocks below are installed *after* the module is loaded. Both services are
// pure functions, so there is nothing here to mock at all -- which is the point of
// keeping the scorer free of I/O.
const scoreController = require('../controllers/scoreController');

function invoke(handler, body) {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; }
  };
  let nextError = null;
  handler({ body }, res, err => { nextError = err; });
  return { res, nextError };
}

test('POST /api/score/resume answers without a job description', async () => {
  const { res, nextError } = invoke(scoreController.getResumeScore, {
    cvText: 'EXPERIENCE\n- Reduced latency 40% across 3 services.'
  });
  assert.strictEqual(nextError, null);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(typeof res.body.score, 'number');
  assert.ok(Array.isArray(res.body.categories));
});

test('the resume score and the ATS score are different contracts', () => {
  // The two are separate endpoints precisely because they answer different
  // questions and return different shapes. Merging them would break one caller.
  const resume = invoke(scoreController.getResumeScore, { cvText: 'Jane Doe' }).res.body;
  assert.ok('categories' in resume);
  assert.ok(!('breakdown' in resume));

  const ats = invoke(scoreController.getScore, {
    cvText: 'Jane Doe', jobDescription: 'A job'
  }).res.body;
  assert.ok('breakdown' in ats);
  assert.ok(!('categories' in ats));
});

test('the ATS score still refuses to run without a job description', () => {
  const { res } = invoke(scoreController.getScore, { cvText: 'Jane Doe' });
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /job description/i);
});

test('an empty resume score request is a 400, not a zero', () => {
  // Returning 0 here would tell a user their CV is the worst possible one when
  // the truth is that there was nothing to read.
  [{}, { cvText: '' }, { cvText: '   ' }, { cvText: null }, { tailoredCV: null }].forEach(body => {
    const { res } = invoke(scoreController.getResumeScore, body);
    assert.strictEqual(res.statusCode, 400, `for ${JSON.stringify(body)}`);
    assert.match(res.body.error, /required/i);
  });
});

test('a structured CV alone is enough to score', () => {
  const { res } = invoke(scoreController.getResumeScore, {
    tailoredCV: {
      summary: 'An engineer.',
      experience: [{ title: 'E', company: 'A', bullets: [
        'Cut latency 40% for 3 services.',
        'Led a migration of 1.2M records.'
      ] }],
      skills: ['Go', 'Python', 'SQL'],
      email: 'a@b.co'
    }
  });
  assert.strictEqual(res.statusCode, 200);
  assert.ok(res.body.score > 0);
});

test('a malformed body is answered, not thrown on', () => {
  // The scorer is total over its input by design, so a nonsense body produces a
  // score (or a 400) rather than reaching the error middleware and surfacing as
  // a 500 to the user.
  [{ tailoredCV: 'not an object' }, { tailoredCV: [] }, { cvText: 42 }, { cvText: {} }]
    .forEach(body => {
      const { res, nextError } = invoke(scoreController.getResumeScore, body);
      assert.strictEqual(nextError, null, `for ${JSON.stringify(body)}`);
      assert.ok(res.statusCode === 200 || res.statusCode === 400);
    });
});

test('the response never contains raw CV text back to the client', () => {
  // The scorer reports codes and numbers. It must not echo the document it read,
  // which would put the user's CV into logs and any response interceptor.
  const marker = 'ZZUNIQUECVMARKERZZ';
  const { res } = invoke(scoreController.getResumeScore, {
    cvText: `EXPERIENCE\nEngineer - Acme\n- ${marker} reduced latency 40%.`
  });
  assert.strictEqual(res.statusCode, 200);
  const serialised = JSON.stringify(res.body);
  assert.ok(!serialised.includes(marker), 'CV text leaked into the response');
});