/**
 * Coarse user-activity tracking.
 *
 * The reason this exists in its own module rather than as a line in `requireAuth`:
 * stamping `lastActiveAt` on every authenticated request turns every read in the app
 * into a write. On a busy account that is a steady stream of single-field updates to
 * the same document, and the write cost of measuring engagement very quickly exceeds
 * what anyone wants to know from it.
 *
 * So the write is throttled per user, in memory, and the cost is bounded to one
 * update per user per interval regardless of how many requests they make. The
 * trade-off is stated plainly rather than hidden: this is a liveness signal, not a
 * session count. `lastActiveAt` means "this user was seen recently", never "this user
 * has N sessions".
 *
 * The throttle map is per-process and is deliberately not persisted. A deploy resets
 * it, which costs at most one extra write per active user; the alternative -- reading
 * the current value on every request to decide whether to write -- is exactly the
 * read-amplification this exists to avoid.
 */

// Five minutes. Short enough that a daily-active user still registers as active on
// any reasonable definition, long enough that a page with a dozen calls collapses
// into roughly one write per user per visit.
const THROTTLE_MS = 5 * 60 * 1000;

// Bounded so a burst of distinct users cannot grow this map without limit. At the
// cap the map is dropped wholesale rather than evicted one key at a time: this is
// only a write throttle, so losing it costs a burst of extra writes, never
// correctness.
const MAX_TRACKED = 50000;

/** userId -> timestamp of the last write we issued for them. */
const lastWrite = new Map();

/**
 * Whether enough time has passed to justify another write for this user.
 *
 * `false` is returned for unknown users as well as recently-seen ones, so callers
 * should treat it as "you may write" and handle the database rejecting the update.
 */
function shouldWrite(userId) {
  if (!userId) return false;

  const key = String(userId);
  const previous = lastWrite.get(key);
  const now = Date.now();

  if (previous && now - previous < THROTTLE_MS) return false;

  if (lastWrite.size >= MAX_TRACKED) lastWrite.clear();
  lastWrite.set(key, now);
  return true;
}

/**
 * Record that a user was active, if the throttle allows a write.
 *
 * Fire-and-forget by design: this runs after the response is on its way and must
 * never delay it or fail it. A rejection is swallowed deliberately, and the throttle
 * entry stays set, so a database that is briefly unavailable costs one missed
 * timestamp rather than a retry storm.
 *
 * @param {string|import('mongoose').Types.ObjectId} userId
 * @param {import('mongoose').Model} User the User model, injected so this stays
 *   testable without a module cache reset
 */
async function touch(userId, User) {
  if (!shouldWrite(userId)) return false;

  try {
    // `lastActiveAt: new Date()` rather than `$currentDate`, so the value is
    // unambiguous and readable straight from the returned document in tests.
    await User.updateOne({ _id: userId }, { $set: { lastActiveAt: new Date() } });
    return true;
  } catch {
    // Swallowed on purpose: see the doc comment. The throttle entry is intentionally
    // left in place, so a failed write backs off rather than retrying per request.
    return false;
  }
}

/** Test seam: drops the throttle so a test can observe two writes in a row. */
function resetThrottle() {
  lastWrite.clear();
}

module.exports = { touch, shouldWrite, resetThrottle, THROTTLE_MS };