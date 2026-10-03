// What makes a tailor draft worth reopening.
//
// This mirrors `isResumable` in `backend/controllers/draftController.js`. The
// duplication is deliberate but the server is authoritative: it recomputes the
// verdict on every read, so a client that disagrees with this file shows a card
// for a draft the server then declines to call resumable. Keeping the client
// rule honest is what stops an empty draft being presented as a draft.

export const DRAFT_STEPS = ['choose', 'upload', 'build', 'job'];

const text = (v) => (typeof v === 'string' ? v.trim() : '');

export const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function buildStateHasContent(buildState) {
  if (!isPlainObject(buildState)) return false;
  if (Number(buildState.subStep) > 0) return true;
  if (buildState.noEducation || buildState.noExperience) return true;
  if (isPlainObject(buildState.personalInfo)) {
    return Object.values(buildState.personalInfo).some((v) => text(v));
  }
  return ['education', 'experience', 'nonTraditional', 'certifications', 'selectedSkills'].some(
    (field) => Array.isArray(buildState[field]) && buildState[field].length > 0
  );
}

export function draftIsResumable(draft) {
  if (!draft) return false;
  if (text(draft.cvText)) return true;
  if (text(draft.jobDescription)) return true;
  if (draft.savedCvId || draft.savedDocId) return true;
  if (isPlainObject(draft.originalCV) && Object.keys(draft.originalCV).length > 0) return true;
  return buildStateHasContent(draft.buildState);
}

// The step a draft may be restored into. Anything outside this set — a value
// written by an older build, or hand-edited in the database — would leave every
// step panel hidden and render a blank page under the progress bar, so an
// unrecognised step falls back to the start of the wizard rather than to a
// broken one.
export function normalizeDraftStep(step) {
  return DRAFT_STEPS.includes(step) ? step : 'choose';
}

// A one-line description of what the draft holds, for the resume card. Falls
// back to the step name when nothing more specific is true, which for
// `upload` means the CV had been parsed and the job description was typed.
export function describeDraft(draft, lang) {
  const fr = lang === 'fr';
  const state = draft.buildState;

  if (buildStateHasContent(state)) {
    const step = Number(state.subStep) || 0;
    if (step >= 4 && state.selectedSkills?.length) return fr ? 'Compétences sélectionnées' : 'Skills selected';
    if (step >= 3 && state.nonTraditional?.some((n) => text(n))) return fr ? 'Activités renseignées' : 'Activities added';
    if (step >= 2 && state.experience?.length) return fr ? 'Expérience renseignée' : 'Experience added';
    if (step >= 1 && state.education?.length) return fr ? 'Formation renseignée' : 'Education added';
    if (state.personalInfo?.name) return fr ? 'Coordonnées renseignées' : 'Your details';
  }

  if (text(draft.jobDescription)) return fr ? 'Description du poste enregistrée' : 'Job description saved';
  if (text(draft.cvText)) return fr ? 'CV enregistré' : 'CV saved';
  return fr ? 'Brouillon enregistré' : 'Draft saved';
}