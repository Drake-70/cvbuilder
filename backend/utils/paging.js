/**
 * Shared pagination parsing for the admin list endpoints.
 *
 * The admin routes read `page` and `limit` straight from the query string:
 *
 *     const { page = 1, limit = 20 } = req.query;
 *     .limit(parseInt(limit))
 *
 * which has three problems, all of them reachable from a URL an admin can edit.
 *
 *   - No clamp. `?limit=1000000` asks the driver for a million documents; the
 *     `.select()` on a user list then serialises a million users into one JSON
 *     response. At best that is a slow page, at worst it exhausts memory on a
 *     free-tier instance.
 *   - No floor. `?limit=-1` reaches the driver as a negative limit, and `?limit=0`
 *     returns nothing while `Math.ceil(total / limit)` divides by zero, so
 *     `pages` is `Infinity` and `total / pages` is `NaN` in the UI.
 *   - NaN leaks through. `?limit=abc` makes `parseInt` return `NaN`, and `NaN`
 *     reaching `.limit()` throws inside Mongoose, which surfaces as a 500 rather
 *     than the 400 the caller actually made a mistake in.
 *
 * Clamping rather than rejecting is deliberate: a hand-edited URL should degrade
 * to a sensible page, not error, and an admin dashboard has no reason to be
 * strict about page sizes.
 */

/** Upper bound on how many documents one page may return. */
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * Parse `page` and `limit` into safe values.
 *
 * @param {object} query Express `req.query`.
 * @param {object} [opts]
 * @param {number} [opts.defaultLimit] Page size when none is supplied.
 * @param {number} [opts.maxLimit] Hard ceiling on the page size.
 * @returns {{page: number, limit: number, skip: number, pages: number}}
 */
function parsePaging(query, opts = {}) {
  const defaultLimit = opts.defaultLimit ?? DEFAULT_LIMIT;
  const maxLimit = opts.maxLimit ?? MAX_LIMIT;

  // `Number(...)` rather than `parseInt(...)` so "12abc" is NaN and falls back
  // to the default instead of silently reading as 12.
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const requested = Number.isFinite(rawLimit) && rawLimit >= 1
    ? Math.floor(rawLimit)
    : defaultLimit;
  const limit = Math.min(requested, maxLimit);

  return { page, limit, skip: (page - 1) * limit, pages: 0 };
}

/**
 * Build the standard list response envelope.
 *
 * `pages` is computed from `total` here rather than in each controller, because
 * dividing by the *requested* limit is how `Infinity` and `NaN` got into the
 * response in the first place.
 *
 * @param {object} params
 * @param {Array} params.items Rows for this page.
 * @param {number} params.total Total matching the filter, across all pages.
 * @param {number} params.page Echoed back so the UI can tell where it is.
 * @param {number} params.limit Applied page size, echoed back.
 * @param {string} [params.key='items'] Name of the row array in the response.
 */
function listResponse({ items, total, page, limit, key = 'items' }) {
  return {
    [key]: items,
    total,
    page,
    limit,
    pages: limit > 0 ? Math.ceil(total / limit) : 0,
    hasMore: page * limit < total
  };
}

module.exports = { parsePaging, listResponse, MAX_LIMIT, DEFAULT_LIMIT };
