const { test, mock, describe } = require('node:test');
const assert = require('node:assert/strict');

const Draft = require('../models/Draft');
const draftController = require('../controllers/draftController');

test.afterEach(() => {
  mock.restoreAll();
  delete require.cache[require.resolve('../controllers/draftController')];
});

// A minimal stand-in for a Mongoose document. `findOne`/`findOneAndUpdate`
// return plain objects with a `toObject`, because `serialize` calls it.
function fakeDraft(plain) {
  return { ...plain, toObject: () => ({ ...plain }) };
}

function fakeRes() {
  const res = {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
  return res;
}

function fakeReq(overrides = {}) {
  return { user: { _id: 'user-1' }, body: {}, ...overrides };
}

// The five drafts that were sitting in the production database at the time all
// looked like this: a step name, nothing else. `resumable` is the verdict that
// stops them being offered to the user as drafts.
const EMPTY_DRAFT = { step: 'build', sourcePath: 'build', cvText: '', originalCV: null, jobDescription: '' };

describe('isResumable', () => {
  test('a draft holding only a step name is not resumable', () => {
    assert.equal(draftController.isResumable(EMPTY_DRAFT), false);
  });

  test('the upload step alone is not resumable', () => {
    assert.equal(
      draftController.isResumable({ ...EMPTY_DRAFT, step: 'upload', sourcePath: 'upload' }),
      false
    );
  });

  test('a draft with CV text is resumable', () => {
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, cvText: 'Jane Doe\nEngineer' }), true);
  });

  test('whitespace-only CV text is not content', () => {
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, cvText: '   \n\t ' }), false);
  });

  test('a draft with a job description is resumable', () => {
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, jobDescription: 'Product Manager' }), true);
  });

  test('a draft referencing a saved CV or document is resumable', () => {
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, savedCvId: 'cv1' }), true);
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, savedDocId: 'doc1' }), true);
  });

  test('an originalCV object is content, an empty one is not', () => {
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, originalCV: { name: 'Jane' } }), true);
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, originalCV: {} }), false);
  });

  test('no draft at all is not resumable', () => {
    assert.equal(draftController.isResumable(null), false);
    assert.equal(draftController.isResumable(undefined), false);
  });
});

describe('buildStateHasContent', () => {
  test('a missing or non-object build state has no content', () => {
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, buildState: null }), false);
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, buildState: 'nope' }), false);
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, buildState: [] }), false);
  });

  test('a questionnaire the user has only opened has no content', () => {
    const state = {
      subStep: 0,
      personalInfo: { name: '', email: '', phone: '', location: '', targetRole: '', summary: '', linkedin: '', website: '' },
      education: [],
      experience: [],
      nonTraditional: [],
      certifications: [],
      selectedSkills: [],
      noEducation: false,
      noExperience: false
    };
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, buildState: state }), false);
  });

  test('a typed name makes the questionnaire resumable', () => {
    assert.equal(
      draftController.isResumable({
        ...EMPTY_DRAFT,
        buildState: { subStep: 0, personalInfo: { name: 'Jane Doe', email: '' } }
      }),
      true
    );
  });

  test('a whitespace-only name is not content', () => {
    assert.equal(
      draftController.isResumable({ ...EMPTY_DRAFT, buildState: { subStep: 0, personalInfo: { name: '  ' } } }),
      false
    );
  });

  test('advancing a sub-step alone counts as progress', () => {
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, buildState: { subStep: 2 } }), true);
  });

  test('declaring "no formal education" counts as an answer', () => {
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, buildState: { subStep: 1, noEducation: true } }), true);
    assert.equal(draftController.isResumable({ ...EMPTY_DRAFT, buildState: { subStep: 1, noExperience: true } }), true);
  });

  test('an added list row makes the questionnaire resumable', () => {
    for (const field of ['education', 'experience', 'nonTraditional', 'certifications', 'selectedSkills']) {
      assert.equal(
        draftController.isResumable({ ...EMPTY_DRAFT, buildState: { subStep: 0, [field]: [{}] } }),
        true,
        `${field} should count as content`
      );
    }
  });
});

describe('sanitizeBuildState', () => {
  test('non-objects become null rather than being stored as-is', () => {
    assert.equal(draftController.sanitizeBuildState(null), null);
    assert.equal(draftController.sanitizeBuildState('nope'), null);
    assert.equal(draftController.sanitizeBuildState([]), null);
    assert.equal(draftController.sanitizeBuildState(undefined), null);
  });

  test('every known field is present in the output', () => {
    const out = draftController.sanitizeBuildState({});
    for (const field of draftController.BUILD_LIST_FIELDS) {
      assert.deepEqual(out[field], [], `${field} should default to an empty array`);
    }
    assert.equal(out.subStep, 0);
    assert.equal(out.noEducation, false);
    assert.equal(out.noExperience, false);
    assert.equal(out.personalInfo, null);
  });

  test('missing personalInfo keys become empty strings, never undefined', () => {
    const out = draftController.sanitizeBuildState({ personalInfo: { name: 'Jane' } });
    assert.equal(out.personalInfo.name, 'Jane');
    assert.equal(out.personalInfo.email, '');
    assert.equal(out.personalInfo.summary, '');
  });

  test('a nonsense sub-step falls back to the first sub-step', () => {
    // The upper bound is clamped by `BuildStep` on restore, not here, so that a
    // draft written by a build with more sub-steps than this one still restores.
    assert.equal(draftController.sanitizeBuildState({ subStep: 99 }).subStep, 99);
    assert.equal(draftController.sanitizeBuildState({ subStep: -3 }).subStep, 0);
    assert.equal(draftController.sanitizeBuildState({ subStep: 1.5 }).subStep, 0);
  });

  test('oversized lists are truncated', () => {
    const education = Array.from({ length: 500 }, () => ({ institution: 'X' }));
    assert.equal(draftController.sanitizeBuildState({ education }).education.length, 60);
  });

  test('an oversized summary is truncated rather than rejected', () => {
    const out = draftController.sanitizeBuildState({ personalInfo: { summary: 'x'.repeat(10_000) } });
    assert.equal(out.personalInfo.summary.length, 4000);
  });

  test('non-string entries in skill lists are dropped', () => {
    const out = draftController.sanitizeBuildState({
      selectedSkills: ['Excel', { name: 'Word' }, 42, null],
      nonTraditional: ['Volunteering', { text: 'x' }]
    });
    assert.deepEqual(out.selectedSkills, ['Excel']);
    assert.deepEqual(out.nonTraditional, ['Volunteering']);
  });

  test('coerces the yes/no toggles to real booleans', () => {
    const out = draftController.sanitizeBuildState({ noEducation: 'yes', noExperience: 1 });
    assert.equal(out.noEducation, true);
    assert.equal(out.noExperience, true);
  });
});

describe('getDraft', () => {
  test('reports a missing draft as existing-but-empty and not resumable', async () => {
    mock.method(Draft, 'findOne', async () => null);
    const res = fakeRes();
    await draftController.getDraft(fakeReq(), res, assert.fail);
    assert.deepEqual(res.body, { exists: false, resumable: false });
  });

  test('an empty draft is returned but flagged not resumable', async () => {
    mock.method(Draft, 'findOne', async () => fakeDraft(EMPTY_DRAFT));
    const res = fakeRes();
    await draftController.getDraft(fakeReq(), res, assert.fail);
    assert.equal(res.body.exists, true);
    assert.equal(res.body.resumable, false);
    assert.equal(res.body.step, 'build');
  });

  test('a populated draft is flagged resumable', async () => {
    mock.method(Draft, 'findOne', async () => fakeDraft({ ...EMPTY_DRAFT, jobDescription: 'Engineer' }));
    const res = fakeRes();
    await draftController.getDraft(fakeReq(), res, assert.fail);
    assert.equal(res.body.resumable, true);
  });

  test('only the requesting user\'s draft is read', async () => {
    let filter = null;
    mock.method(Draft, 'findOne', async (f) => {
      filter = f;
      return null;
    });
    await draftController.getDraft(fakeReq(), fakeRes(), assert.fail);
    assert.deepEqual(filter, { userId: 'user-1' });
  });
});

describe('saveDraft', () => {
  test('rejects a step outside the allow-list without writing anything', async () => {
    let called = false;
    mock.method(Draft, 'findOneAndUpdate', async () => {
      called = true;
      return fakeDraft(EMPTY_DRAFT);
    });
    let captured = null;
    await draftController.saveDraft(fakeReq({ body: { step: 'hacked' } }), fakeRes(), (err) => {
      captured = err;
    });
    assert.equal(captured.statusCode, 400);
    assert.equal(called, false, 'must not write an unknown step');
  });

  test('the rejection for an unknown step names the step and carries 400', async () => {
    let captured = null;
    await draftController.saveDraft(fakeReq({ body: { step: 'hacked' } }), fakeRes(), (err) => {
      captured = err;
    });
    assert.equal(captured.statusCode, 400);
    assert.match(captured.message, /hacked/);
  });

  test('rejects a build step with no buildState, which is the empty draft bug', async () => {
    let captured = null;
    let called = false;
    mock.method(Draft, 'findOneAndUpdate', async () => {
      called = true;
      return fakeDraft(EMPTY_DRAFT);
    });
    await draftController.saveDraft(fakeReq({ body: { step: 'build', sourcePath: 'build' } }), fakeRes(), (err) => {
      captured = err;
    });
    assert.equal(captured.statusCode, 400);
    assert.equal(called, false);
  });

  test('accepts a build step that carries its buildState', async () => {
    let filter = null;
    let update = null;
    mock.method(Draft, 'findOneAndUpdate', async (f, u) => {
      filter = f;
      update = u;
      return fakeDraft({ ...EMPTY_DRAFT, buildState: u.$set.buildState });
    });
    const res = fakeRes();
    await draftController.saveDraft(
      fakeReq({ body: { step: 'build', sourcePath: 'build', buildState: { subStep: 1, education: [{ degree: 'BSc' }] } } }),
      res,
      assert.fail
    );
    assert.equal(res.body.resumable, true);
    assert.deepEqual(filter, { userId: 'user-1' });
    assert.deepEqual(update.$set.buildState.education, [{ degree: 'BSc' }]);
  });

  test('rejects an unknown source path, language and step in one pass', async () => {
    const cases = [
      { step: 'job', sourcePath: 'telepathy' },
      { step: 'job', language: 'de' },
      { step: 'result' }
    ];
    for (const body of cases) {
      let captured = null;
      await draftController.saveDraft(fakeReq({ body }), fakeRes(), (err) => {
        captured = err;
      });
      assert.equal(captured.statusCode, 400, `expected 400 for ${JSON.stringify(body)}`);
    }
  });

  test('absent fields are left untouched rather than nulled', async () => {
    let update = null;
    mock.method(Draft, 'findOneAndUpdate', async (f, u) => {
      update = u;
      return fakeDraft({ ...EMPTY_DRAFT, jobDescription: 'kept' });
    });
    await draftController.saveDraft(fakeReq({ body: { step: 'job' } }), fakeRes(), assert.fail);
    assert.deepEqual(Object.keys(update.$set), ['step']);
  });

  test('an empty savedCvId clears the reference instead of writing a bad id', async () => {
    let update = null;
    mock.method(Draft, 'findOneAndUpdate', async (f, u) => {
      update = u;
      return fakeDraft({ ...EMPTY_DRAFT, cvText: 'x', savedCvId: null });
    });
    await draftController.saveDraft(fakeReq({ body: { savedCvId: '' } }), fakeRes(), assert.fail);
    assert.equal(update.$set.savedCvId, null);
  });

  test('upserts scoped to the requesting user', async () => {
    let options = null;
    mock.method(Draft, 'findOneAndUpdate', async (f, u, o) => {
      options = o;
      return fakeDraft({ ...EMPTY_DRAFT, cvText: 'x' });
    });
    await draftController.saveDraft(fakeReq({ body: { cvText: 'x' } }), fakeRes(), assert.fail);
    assert.deepEqual(options, { upsert: true, new: true });
  });

  test('the saved response reports resumability, so the client never has to guess', async () => {
    mock.method(Draft, 'findOneAndUpdate', async () => fakeDraft(EMPTY_DRAFT));
    const res = fakeRes();
    await draftController.saveDraft(fakeReq({ body: { step: 'upload' } }), res, assert.fail);
    assert.equal(res.body.exists, true);
    assert.equal(res.body.resumable, false);
  });
});

describe('clearDraft', () => {
  test('deletes by user and confirms nothing remains', async () => {
    let filter = null;
    mock.method(Draft, 'deleteOne', async (f) => {
      filter = f;
      return { deletedCount: 1 };
    });
    const res = fakeRes();
    await draftController.clearDraft(fakeReq(), res, assert.fail);
    assert.deepEqual(filter, { userId: 'user-1' });
    assert.deepEqual(res.body, { message: 'Draft cleared', exists: false, resumable: false });
  });
});

describe('draft step allow-list', () => {
  test('excludes `result`, which cannot be restored into', () => {
    assert.ok(!draftController.DRAFT_STEPS.includes('result'));
  });

  test('includes every step the wizard can be at', () => {
    for (const step of ['choose', 'upload', 'build', 'job']) {
      assert.ok(draftController.DRAFT_STEPS.includes(step), `${step} should be a valid draft step`);
    }
  });

  test('matches the client allow-list (drift guard)', () => {
    const client = require('../../frontend/src/utils/draftResume.js');
    assert.deepEqual(client.DRAFT_STEPS, draftController.DRAFT_STEPS);
  });
});

describe('client resumability (drift guard)', () => {
  test('the client agrees with the server about every shape it can be shown', () => {
    const client = require('../../frontend/src/utils/draftResume.js');

    // The exact shape of all five production drafts: the client must not offer
    // these, or the resume card leads straight back to a blank wizard step.
    const productionDrafts = [
      { step: 'build', sourcePath: 'build', cvText: '', jobDescription: '' },
      { step: 'upload', sourcePath: 'upload', cvText: '', jobDescription: '' }
    ];
    for (const draft of productionDrafts) {
      assert.equal(client.draftIsResumable(draft), false);
      assert.equal(draftController.isResumable(draft), false);
    }

    const populated = [
      { step: 'job', cvText: 'Jane Doe' },
      { step: 'job', jobDescription: 'Engineer' },
      { step: 'job', savedCvId: 'cv1' },
      { step: 'build', buildState: { subStep: 0, personalInfo: { name: 'Jane' } } },
      { step: 'build', buildState: { subStep: 3 } },
      { step: 'build', buildState: { subStep: 0, selectedSkills: ['Excel'] } }
    ];
    for (const draft of populated) {
      assert.equal(client.draftIsResumable(draft), true, JSON.stringify(draft));
      assert.equal(draftController.isResumable(draft), true, JSON.stringify(draft));
    }
  });

  test('the client refuses to restore a step this build does not recognise', () => {
    const client = require('../../frontend/src/utils/draftResume.js');
    for (const bogus of ['result', 'wizard', '', null, undefined, 42]) {
      assert.equal(client.normalizeDraftStep(bogus), 'choose', `${String(bogus)} should fall back to the start`);
    }
    assert.equal(client.normalizeDraftStep('build'), 'build');
    assert.equal(client.normalizeDraftStep('job'), 'job');
  });

  test('both locales carry every draft string the page asks for', () => {
    const en = require('../../frontend/src/locales/en/tailor.json');
    const fr = require('../../frontend/src/locales/fr/tailor.json');
    const enCommon = require('../../frontend/src/locales/en/common.json');
    const frCommon = require('../../frontend/src/locales/fr/common.json');
    for (const key of ['draft_found_title', 'draft_saved_at', 'draft_resume', 'draft_discard', 'draft_unavailable']) {
      assert.ok(en[key], `en/tailor.json is missing ${key}`);
      assert.ok(fr[key], `fr/tailor.json is missing ${key}`);
    }
    for (const key of ['dismiss', 'loading', 'error']) {
      assert.ok(enCommon[key], `en/common.json is missing ${key}`);
      assert.ok(frCommon[key], `fr/common.json is missing ${key}`);
    }
  });
});

test('the model declares buildState as Mixed, so the questionnaire is not cast away', () => {
  const path = Draft.schema.path('buildState');
  assert.ok(path, 'Draft is missing buildState');
  assert.equal(path.instance, 'Mixed');
});