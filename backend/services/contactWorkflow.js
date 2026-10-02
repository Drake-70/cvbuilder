/**
 * The contact-inbox state machine.
 *
 * Extracted from the controller so the transitions are one list, testable without
 * a database, and impossible to change from two places at once. The controller
 * checks `canTransition` and then applies the change; nothing else decides.
 *
 *   new ──> read ──> replied
 *    │        │         │
 *    └────────┴─────────┴──> archived   (from any state, and back)
 *
 * Why `replied` can go back to `new`: a member who replies and then sends a
 * follow-up question has genuinely unread mail, and silently dropping it into
 * `read` is how a real question gets missed.
 *
 * Why `archived` is reachable from anywhere: spam and duplicate submissions need
 * to leave the working set without pretending they were handled.
 *
 * Reopening `replied` deliberately does *not* clear `repliedAt` or `reply`. The
 * reply is history; changing a status should not erase the record that someone
 * answered. `repliedAt` is only cleared when the reply text is cleared, and that
 * only happens on an explicit `clearReply`.
 */

const STATUSES = ['new', 'read', 'replied', 'archived'];

/** Allowed transitions, as a map of from-state to the states it may move to. */
const TRANSITIONS = {
  new: ['read', 'replied', 'archived'],
  read: ['new', 'replied', 'archived'],
  replied: ['new', 'read', 'archived'],
  archived: ['new', 'read', 'replied']
};

/**
 * Statuses the workflow considers "still needing a human".
 *
 * Used for the unread badge. `replied` is excluded because the work is done;
 * `archived` because it was never in the queue.
 */
const OPEN_STATUSES = ['new', 'read'];

/**
 * Is `to` reachable from `from`?
 *
 * A no-op (from === to) counts as allowed. Two functions in one module must not
 * disagree about whether something is valid: `transitionError` treats
 * same-status as fine, and if this returned false the controller would have had
 * to special-case it in a second place.
 *
 * Unknown states return false rather than throwing: the caller is a request
 * handler, and a corrupt value in the database should surface as "not allowed"
 * instead of a 500.
 *
 * @param {string} from
 * @param {string} to
 * @returns {boolean}
 */
function canTransition(from, to) {
  if (!STATUSES.includes(from) || !STATUSES.includes(to)) return false;
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

/**
 * Validate a requested transition, or return null when it is allowed.
 *
 * Returning the reason rather than throwing keeps the controller's error shape
 * consistent with everything else in this codebase: a 400 with a message the UI
 * can show.
 *
 * @param {string} from
 * @param {string} to
 * @returns {string|null} Human-readable reason, or null when allowed.
 */
function transitionError(from, to) {
  if (!to) return 'A status is required';
  if (!STATUSES.includes(to)) {
    return `Unknown status "${to}". Expected one of: ${STATUSES.join(', ')}`;
  }
  if (from === to) return null; // No-op, not an error.
  if (!STATUSES.includes(from)) {
    return `This message has an unknown current status ("${from}"), so it cannot be moved`;
  }
  if (!canTransition(from, to)) {
    return `Cannot move from "${from}" to "${to}". Allowed: ${TRANSITIONS[from].join(', ')}`;
  }
  return null;
}

/** @returns {string[]} States reachable from `from`, including `from` itself. */
function allowedFrom(from) {
  return STATUSES.includes(from) ? [from, ...TRANSITIONS[from]] : [];
}

/**
 * The update document for a status change.
 *
 * `repliedAt` and `reply` are only touched when the reply text actually changes,
 * so reopening a replied message does not lose the record of the answer. Moving
 * to `replied` without a reply body is allowed — the admin may have replied by
 * phone or in another tool, and forcing a body would be noise.
 *
 * @param {object} params
 * @param {string} params.from Current status.
 * @param {string} params.to Requested status.
 * @param {string} [params.reply] Reply text, if supplied.
 * @param {object} [params.actor] Admin performing the change ({ _id }).
 * @param {boolean} [params.clearReply] Explicitly clear a stored reply.
 * @returns {object} A Mongo update document.
 */
function buildStatusUpdate({ from, to, reply, actor, clearReply = false }) {
  const now = new Date();
  const update = {
    status: to,
    statusChangedAt: now,
    statusChangedBy: actor && actor._id ? actor._id : null
  };

  if (clearReply) {
    update.reply = '';
    update.repliedAt = null;
  } else if (typeof reply === 'string' && reply.trim() !== '') {
    update.reply = reply.trim();
    // Stamped only on the first reply. Re-saving an edited reply keeps the
    // original time, so "replied at" stays a fact about when it was answered
    // rather than when someone corrected a typo in the record.
    if (from !== 'replied') update.repliedAt = now;
  }

  return update;
}

module.exports = {
  STATUSES,
  TRANSITIONS,
  OPEN_STATUSES,
  canTransition,
  transitionError,
  allowedFrom,
  buildStatusUpdate
};
