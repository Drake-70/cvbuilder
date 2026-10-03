// Before/after diffing for the review-before-save step.
//
// The tailor call returns the whole rewritten CV, and BeforeAfterGaps shows two
// full documents side by side for the user to eyeball. That answers "what does
// mine look like now", not "what did the AI do to it" -- and it is gated on
// `gapAnalysis` being non-empty, so a tailoring that reported no gaps shows no
// before/after at all.
//
// This module answers the second question: an explicit, per-item list of what
// was kept, reworded, added and dropped, so approval is an informed decision
// rather than a trust exercise.
//
// Pure and dependency-free, so the backend suite asserts it directly. There is
// no frontend test runner in this project (see README, Testing).

export const KEPT = 'kept';
export const REWORDED = 'reworded';
export const ADDED = 'added';
export const REMOVED = 'removed';

// Proposal statuses, used by the bullet-expansion review. That feature gets an
// explicit pairing from the server (see bulletExpansionService), so it does not
// need to infer one the way diffBullets does -- but it does describe the same
// two outcomes, so it borrows KEPT rather than inventing a fifth word for "the
// model gave my own sentence back".
export const EXPANDED = 'expanded';
export const SKIPPED = 'skipped';

// Similarity at or above which two bullets are treated as the same line
// rewritten, rather than one removed and another invented.
//
// Calibrated against real pairs from this product's own tailoring: "Managed a
// team of 5" -> "Led a team of 5 engineers" scores 0.73, while two bullets
// about genuinely different subjects score well under 0.3. Below the threshold
// a line is reported as removed plus added, which is the honest reading: the AI
// did not rewrite that one, it replaced it.
const REWORD_THRESHOLD = 0.5;

export function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .toLowerCase()
    // Typographic punctuation shows up constantly in pasted CVs and would make
    // an otherwise identical bullet look rewritten.
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(value) {
  const n = normalizeText(value);
  return n ? n.split(' ').filter(Boolean) : [];
}

// Dice coefficient over token multisets. Set-based Jaccard was tried first and
// under-scores rewrites that add words, which is exactly the case that matters
// here: a bullet gaining "engineers" and "across 3 markets" is still the same
// achievement.
export function tokenSimilarity(a, b) {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (!ta.length || !tb.length) return 0;
  if (normalizeText(a) === normalizeText(b)) return 1;

  const counts = new Map();
  ta.forEach(t => counts.set(t, (counts.get(t) || 0) + 1));
  let shared = 0;
  tb.forEach(t => {
    const have = counts.get(t) || 0;
    if (have > 0) {
      shared++;
      counts.set(t, have - 1);
    }
  });

  return (2 * shared) / (ta.length + tb.length);
}

// Only strings and numbers are meaningful bullet text. Coercing anything else
// with String() would render an object as the literal "[object Object]" in the
// review panel -- the one thing this panel must never show a user -- so those are
// dropped instead.
const clean = (v) => {
  if (typeof v === 'string') return v.trim();
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return '';
};

/**
 * Pair up two bullet lists.
 *
 * Exact matches are taken first, so an untouched bullet is reported as `kept`
 * even if it also happens to be similar to something else. Only then are the
 * leftovers paired by similarity, greedily and in order, so the result is stable
 * rather than dependent on iteration order.
 *
 * @returns {Array<{status:string, before:string, after:string}>} in `after` order,
 *          with `removed` entries appended after them.
 */
export function diffBullets(before, after) {
  const b = (Array.isArray(before) ? before : []).map(clean).filter(Boolean);
  const a = (Array.isArray(after) ? after : []).map(clean).filter(Boolean);

  const rows = a.map(text => ({ status: ADDED, before: '', after: text }));
  const usedBefore = new Set();

  // Pass 1: exact matches.
  const bByNorm = new Map();
  b.forEach((text, i) => {
    const key = normalizeText(text);
    if (!bByNorm.has(key)) bByNorm.set(key, []);
    bByNorm.get(key).push(i);
  });

  rows.forEach(row => {
    const bucket = bByNorm.get(normalizeText(row.after));
    if (bucket && bucket.length) {
      const i = bucket.shift();
      usedBefore.add(i);
      row.status = KEPT;
      row.before = b[i];
    }
  });

  // Pass 2: pair what is left by best similarity.
  const freeBefore = b.map((text, i) => ({ text, i })).filter(x => !usedBefore.has(x.i));
  const freeRows = rows
    .map((row, idx) => ({ row, idx }))
    .filter(x => x.row.status === ADDED);

  const taken = new Set();
  freeRows.forEach(({ row }) => {
    let best = null;
    freeBefore.forEach(candidate => {
      if (taken.has(candidate.i)) return;
      const score = tokenSimilarity(candidate.text, row.after);
      if (score >= REWORD_THRESHOLD && (!best || score > best.score)) {
        best = { ...candidate, score };
      }
    });
    if (best) {
      taken.add(best.i);
      row.status = REWORDED;
      row.before = best.text;
    }
  });

  const removed = freeBefore
    .filter(x => !taken.has(x.i))
    .map(x => ({ status: REMOVED, before: x.text, after: '' }));

  return [...rows, ...removed];
}

/** Roles are matched on their title+company line, then their bullets diffed. */
export function diffExperience(originalCV, tailoredCV) {
  const before = Array.isArray(originalCV?.experience) ? originalCV.experience : [];
  const after = Array.isArray(tailoredCV?.experience) ? tailoredCV.experience : [];

  const roleLabel = (r) => [r?.title, r?.company].filter(Boolean).join(' \u2014 ') || 'Untitled role';

  // Index the originals by normalised label so roles pair by identity. A queue
  // per label rather than a single index, so two roles at the same company with
  // the same title ("Intern" twice) still pair in order instead of both matching
  // the first original.
  const byLabel = new Map();
  before.forEach(role => {
    const key = normalizeText(roleLabel(role));
    if (!byLabel.has(key)) byLabel.set(key, []);
    byLabel.get(key).push(role);
  });

  const used = new Set();
  const rows = after.map(role => {
    const bucket = byLabel.get(normalizeText(roleLabel(role)));
    let paired = null;
    while (bucket && bucket.length) {
      const candidate = bucket.shift();
      if (!used.has(candidate)) { paired = candidate; break; }
    }
    if (paired) used.add(paired);
    return {
      title: roleLabel(role),
      isNew: !paired,
      status: paired ? KEPT : ADDED,
      originalTitle: paired ? roleLabel(paired) : '',
      bullets: diffBullets(paired?.bullets, role?.bullets)
    };
  });

  before.filter(r => !used.has(r)).forEach(role => {
    rows.push({
      title: roleLabel(role),
      isNew: false,
      status: REMOVED,
      originalTitle: roleLabel(role),
      bullets: diffBullets(role?.bullets, [])
    });
  });

  return rows;
}

function countStatuses(rows) {
  const counts = { kept: 0, reworded: 0, added: 0, removed: 0 };
  rows.forEach(r => { counts[r.status] = (counts[r.status] || 0) + 1; });
  return counts;
}

/** Counts for the review header. `originalCV` null means nothing is comparable. */
export function summarizeDiff(originalCV, tailoredCV) {
  const roles = diffExperience(originalCV, tailoredCV);
  const bulletRows = roles.flatMap(r => r.bullets);
  const counts = countStatuses(bulletRows);

  const summaryChanged = normalizeText(originalCV?.summary) !== normalizeText(tailoredCV?.summary);
  const newRoles = roles.filter(r => r.isNew).length;
  const removedRoles = roles.filter(r => r.status === REMOVED).length;

  const skillsBefore = new Set((originalCV?.skills || []).map(normalizeText));
  const skillsAfter = (tailoredCV?.skills || []).map(normalizeText);
  const skillsAdded = skillsAfter.filter(s => s && !skillsBefore.has(s));

  return {
    roles,
    ...counts,
    // Anything other than "nothing changed at all" -- the headline the user acts on.
    changed: counts.reworded + counts.added + counts.removed + newRoles + removedRoles + skillsAdded.length > 0
      || (summaryChanged && Boolean(tailoredCV?.summary)),
    summaryChanged: Boolean(tailoredCV?.summary) && summaryChanged,
    newRoles,
    removedRoles,
    skillsAdded,
    // True when there is no structured original to compare against, which is the
    // paste-a-block-of-text path. The UI must not claim "nothing changed".
    incomparable: !originalCV || !Array.isArray(originalCV.experience)
  };
}

/**
 * Classify one expansion proposal against the line it came from.
 *
 * Three outcomes, and the third matters as much as the first two: a proposal the
 * model declined to make is not a removal and must not be presented as one. It
 * means the user's own wording is still the wording, which is a valid result --
 * the request was an offer, not an instruction.
 */
export function classifyProposal(before, after) {
  if (!after) return SKIPPED;
  // An expansion that is the input back is not an improvement, and listing it as
  // one would overstate what the AI did.
  return tokenSimilarity(before, after) >= 1 ? KEPT : EXPANDED;
}

/**
 * Apply approved proposals back into the rows they came from.
 *
 * `rows` is the full editable list, which contains blank placeholder rows the
 * request filtered out. Proposals are indexed against the *non-blank* lines, so
 * this walks the rows consuming an index for each filled one and leaving the
 * blanks exactly where they were -- otherwise approving an expansion would shift
 * every line below it, which is the sort of thing a user only notices after
 * submitting the CV.
 *
 * An unapproved proposal leaves its row untouched, so rejecting everything is
 * equivalent to never having expanded.
 *
 * @param {string[]} rows full editable list
 * @param {Array<{after:string|null}>} proposals in request order
 * @param {Set<number>|number[]} accepted indices into `proposals`
 */
export function applyProposals(rows, proposals, accepted) {
  const approved = accepted instanceof Set ? accepted : new Set(accepted || []);
  const list = Array.isArray(rows) ? rows : [];
  const offered = Array.isArray(proposals) ? proposals : [];

  let filled = 0;
  return list.map(row => {
    if (!clean(row)) return row;
    const proposal = offered[filled];
    const index = filled;
    filled += 1;
    if (!proposal || !approved.has(index) || !proposal.after) return row;
    return proposal.after;
  });
}