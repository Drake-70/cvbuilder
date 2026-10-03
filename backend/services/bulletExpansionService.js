// Pairing for bullet-level expansion review.
//
// The model is asked to rewrite each informal line the user typed into one
// professional bullet. If we zipped the request and the response together by
// array position, a model that reordered, merged or dropped an item would
// rewrite the wrong line of someone's CV -- and that failure is invisible: the
// CV still looks plausible. So the model is asked to echo back an explicit
// index, and this module reconciles it against the lines that were sent.
//
// Everything here is pure. The AI call lives in aiService; keeping the pairing
// separate means the reconciliation rules are asserted directly by the test
// suite rather than through a mocked Groq response.

const MAX_BULLETS_PER_REQUEST = 40;

// A "bullet point" longer than this is not a bullet. The model was asked for one
// sentence; anything longer is prose it drifted into, and writing that into a CV
// the user is about to submit is worse than leaving their own line alone. Such an
// expansion is discarded and the line stays as written.
const MAX_BULLET_CHARS = 600;

function cleanBulletText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\s+/g, ' ')
    // Models frequently re-add the list glyph we asked them to omit, which would
    // then render as "- Managed daily ops" inside an already-bulleted list.
    .replace(/^(?:[\s\u2022\u00b7]+|[-*\u2013\u2014]\s+)/, '')
    .trim();
}

// The expanded text of a model entry. Deliberately does not accept an `original`
// field: if the model echoed the input back under that key, treating it as an
// expansion would present the user's own words as if the AI had improved them.
function textOf(entry) {
  if (typeof entry === 'string') return cleanBulletText(entry);
  if (!entry || typeof entry !== 'object') return '';
  return cleanBulletText(entry.expanded ?? entry.bullet ?? entry.text);
}

function entriesOf(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.expansions)) return parsed.expansions;
  if (Array.isArray(parsed?.bullets)) return parsed.bullets;
  return [];
}

/**
 * Reconcile proposed expansions against the lines they came from.
 *
 * The index base is inferred rather than assumed. The prompt asks for 1-based
 * indices, but models return 0-based ones often enough that hard-coding either
 * convention silently shifts every expansion by one line -- which reads as
 * "the AI rewrote my entries but they don't correspond to anything". When the
 * two conventions agree on an index the tie goes to the prompted one.
 *
 * An input the model skipped comes back with `expanded: null` rather than being
 * dropped from the result, so the response is always the same length and in the
 * same order as the request. The caller never has to reconcile two lists.
 *
 * @param {string[]} items lines as sent, including any blank placeholders
 * @param {object|Array} parsed raw model output
 * @returns {Array<{index:number, original:string, expanded:string|null}>} aligned
 *          to the non-blank entries of `items`, in order
 */
function pairExpansions(items, parsed) {
  const originals = (Array.isArray(items) ? items : [])
    .map(v => (typeof v === 'string' ? v.trim() : ''))
    .filter(Boolean);

  const n = originals.length;
  const entries = entriesOf(parsed);

  const explicit = entries
    .map(entry => (entry && typeof entry === 'object' ? Number(entry.index) : NaN))
    .filter(v => Number.isInteger(v));

  // 0-based and 1-based candidates for the same declared base.
  let zeroBased = 0;
  let oneBased = 0;
  explicit.forEach(v => {
    if (v >= 0 && v < n) zeroBased++;
    if (v >= 1 && v <= n) oneBased++;
  });

  let offset;
  let usePositions;

  if (!explicit.length) {
    // No indices at all. Positional pairing is the only reading available, and
    // is only safe when the model returned exactly one candidate per line --
    // otherwise there is no evidence about which line any of them belongs to.
    offset = 0;
    usePositions = entries.length === n;
  } else if (zeroBased > oneBased) {
    offset = 0;
    usePositions = false;
  } else {
    // Includes the tie, which goes to the prompted convention. A tie needs
    // duplicate or out-of-range indices to arise, so this is a reply that has
    // already lost track of the numbering; the convention we asked for is the
    // better guess, and the alternative is not more trustworthy.
    offset = -1;
    usePositions = false;
  }

  const expandedByPosition = new Map();

  entries.forEach((entry, order) => {
    const text = textOf(entry);
    if (!text || text.length > MAX_BULLET_CHARS) return;

    let position;
    if (usePositions) {
      position = order;
    } else {
      const declared = entry && typeof entry === 'object' ? Number(entry.index) : NaN;
      if (!Number.isInteger(declared)) return;
      position = declared + offset;
    }
    if (position < 0 || position >= n) return;
    // First wins: a repeated index means the model contradicted itself, and
    // picking the later one would make the output depend on array order.
    if (expandedByPosition.has(position)) return;

    expandedByPosition.set(position, text);
  });

  return originals.map((original, index) => ({
    index,
    original,
    expanded: expandedByPosition.has(index) ? expandedByPosition.get(index) : null
  }));
}

module.exports = {
  MAX_BULLETS_PER_REQUEST,
  MAX_BULLET_CHARS,
  cleanBulletText,
  pairExpansions
};