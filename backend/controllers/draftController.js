const Draft = require('../models/Draft');

// The wizard's steps, in order. `result` is deliberately absent: it is a derived
// view over a finished document, not something a draft can be reopened into.
// Restoring a draft to `result` would render an empty page because `result`
// state lives only in the browser and never in the draft.
const DRAFT_STEPS = ['choose', 'upload', 'build', 'job'];

// `buildState` is the build questionnaire's answers. Each list is user-controlled
// repetition — a client can post five hundred education rows — so the lengths
// are capped rather than trusted. The caps are generous enough that no real CV
// questionnaire hits them and small enough that a draft stays a draft.
const BUILD_LIST_LIMIT = 60;
const BUILD_STRING_LIMIT = 4000;
const BUILD_SHORT_STRING_LIMIT = 200;

const BUILD_LIST_FIELDS = ['education', 'experience', 'nonTraditional', 'certifications', 'selectedSkills'];

function badRequest(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function clampString(value, limit) {
  if (typeof value !== 'string') return '';
  return value.length > limit ? value.slice(0, limit) : value;
}

// Coerces a client-supplied build state into the shape `BuildStep` reads back.
// Anything unusable is dropped rather than rejected: a draft is a convenience,
// and refusing to autosave because one optional sub-field came back in an odd
// shape would lose the whole questionnaire over a stray value.
function sanitizeBuildState(input) {
  if (!isPlainObject(input)) return null;

  const out = {};

  out.subStep = Number.isInteger(input.subStep) && input.subStep >= 0 ? input.subStep : 0;
  out.noEducation = Boolean(input.noEducation);
  out.noExperience = Boolean(input.noExperience);

  if (isPlainObject(input.personalInfo)) {
    const src = input.personalInfo;
    out.personalInfo = {
      name: clampString(src.name, BUILD_SHORT_STRING_LIMIT),
      email: clampString(src.email, BUILD_SHORT_STRING_LIMIT),
      phone: clampString(src.phone, BUILD_SHORT_STRING_LIMIT),
      location: clampString(src.location, BUILD_SHORT_STRING_LIMIT),
      targetRole: clampString(src.targetRole, BUILD_SHORT_STRING_LIMIT),
      summary: clampString(src.summary, BUILD_STRING_LIMIT),
      linkedin: clampString(src.linkedin, BUILD_SHORT_STRING_LIMIT),
      website: clampString(src.website, BUILD_SHORT_STRING_LIMIT)
    };
  } else {
    out.personalInfo = null;
  }

  for (const field of BUILD_LIST_FIELDS) {
    const value = input[field];
    out[field] = Array.isArray(value) ? value.slice(0, BUILD_LIST_LIMIT) : [];
  }

  // `selectedSkills` and `nonTraditional` are arrays of plain strings; anything
  // else in them would render as `[object Object]` in a checkbox label.
  out.selectedSkills = out.selectedSkills.filter((s) => typeof s === 'string');
  out.nonTraditional = out.nonTraditional.filter((s) => typeof s === 'string');

  return out;
}

function buildStateHasContent(buildState) {
  if (!isPlainObject(buildState)) return false;
  if (buildState.subStep > 0) return true;
  if (buildState.noEducation || buildState.noExperience) return true;
  if (isPlainObject(buildState.personalInfo)) {
    return Object.values(buildState.personalInfo).some((v) => typeof v === 'string' && v.trim());
  }
  return BUILD_LIST_FIELDS.some((field) => Array.isArray(buildState[field]) && buildState[field].length > 0);
}

// Whether this draft holds anything worth reopening.
//
// This is the server's call, not the client's, and it is deliberately
// conservative: a draft that fails this is not offered to the user as a draft.
// The alternative — trusting the client to decide what is interesting — is how
// "you have a draft" came to mean "you clicked start building once and closed
// the tab", with every draft in the production database empty but for its step.
function isResumable(draft) {
  if (!draft) return false;

  const text = (v) => (typeof v === 'string' ? v.trim() : '');
  if (text(draft.cvText)) return true;
  if (text(draft.jobDescription)) return true;
  if (draft.savedCvId || draft.savedDocId) return true;
  if (isPlainObject(draft.originalCV) && Object.keys(draft.originalCV).length > 0) return true;

  return buildStateHasContent(draft.buildState);
}

function serialize(draft) {
  const plain = typeof draft.toObject === 'function' ? draft.toObject() : { ...draft };
  return { exists: true, ...plain, resumable: isResumable(plain) };
}

// Exported for tests. The client keeps a mirrored copy of the step allow-list
// in `frontend/src/utils/draftResume.js` and the two are asserted equal, so a
// step added on one side and forgotten on the other fails the suite rather than
// producing a draft the other half cannot open.
exports.DRAFT_STEPS = DRAFT_STEPS;
exports.BUILD_LIST_FIELDS = BUILD_LIST_FIELDS;
exports.sanitizeBuildState = sanitizeBuildState;
exports.isResumable = isResumable;
exports.buildStateHasContent = buildStateHasContent;

exports.getDraft = async (req, res, next) => {
  try {
    const draft = await Draft.findOne({ userId: req.user._id });
    if (!draft) return res.json({ exists: false, resumable: false });
    res.json(serialize(draft));
  } catch (err) {
    next(err);
  }
};

exports.saveDraft = async (req, res, next) => {
  try {
    const {
      step,
      sourcePath,
      cvText,
      originalCV,
      buildState,
      savedCvId,
      savedDocId,
      jobDescription,
      language
    } = req.body || {};

    if (step !== undefined && !DRAFT_STEPS.includes(step)) {
      throw badRequest(`Unknown draft step: ${String(step).slice(0, 40)}`);
    }

    // A step the client sends is only ever trusted when it agrees with the path
    // that produced it. `buildState` is what makes `build` resumable, so a build
    // step without one is exactly the empty draft that made this unusable.
    if (step === 'build' && buildState === undefined) {
      throw badRequest('A build draft must carry its buildState');
    }

    if (sourcePath !== undefined && !['upload', 'build'].includes(sourcePath)) {
      throw badRequest(`Unknown source path: ${String(sourcePath).slice(0, 40)}`);
    }

    if (language !== undefined && !['en', 'fr'].includes(language)) {
      throw badRequest(`Unknown language: ${String(language).slice(0, 20)}`);
    }

    const draft = await Draft.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          ...(step !== undefined ? { step } : {}),
          ...(sourcePath !== undefined ? { sourcePath } : {}),
          ...(cvText !== undefined ? { cvText } : {}),
          ...(originalCV !== undefined ? { originalCV } : {}),
          ...(buildState !== undefined ? { buildState: sanitizeBuildState(buildState) } : {}),
          ...(savedCvId !== undefined ? { savedCvId: savedCvId || null } : {}),
          ...(savedDocId !== undefined ? { savedDocId: savedDocId || null } : {}),
          ...(jobDescription !== undefined ? { jobDescription } : {}),
          ...(language !== undefined ? { language } : {})
        }
      },
      { upsert: true, new: true }
    );

    res.json(serialize(draft));
  } catch (err) {
    next(err);
  }
};

exports.clearDraft = async (req, res, next) => {
  try {
    await Draft.deleteOne({ userId: req.user._id });
    res.json({ message: 'Draft cleared', exists: false, resumable: false });
  } catch (err) {
    next(err);
  }
};