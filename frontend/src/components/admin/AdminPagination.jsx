/**
 * Page controls for the admin list tables.
 *
 * The endpoints return `{ total, page, pages, hasMore }`, which the previous
 * version of this page discarded while hardcoding `limit=50` — so on a real user
 * base you saw the newest 50 accounts and no indication that thousands existed.
 *
 * Showing "1–25 of 1,204" matters more than the buttons: it is the number that
 * tells an admin whether they are looking at everything or a slice.
 */
export default function AdminPagination({
  page = 1,
  pages = 0,
  limit = 20,
  total = 0,
  onChange,
  busy = false
}) {
  if (total === 0) return null;

  const first = (page - 1) * limit + 1;
  const last = Math.min(page * limit, total);

  // A window around the current page rather than every page number, so a
  // thousand-page result set does not render a thousand buttons. Always shows the
  // first and last page with ellipses, because "jump to the end" is a real need
  // when hunting for the oldest records.
  const windowSize = 2;
  const numbers = [];
  for (let i = 1; i <= pages; i += 1) {
    const nearCurrent = i >= page - windowSize && i <= page + windowSize;
    const isEdge = i === 1 || i === pages;
    if (nearCurrent || isEdge) numbers.push(i);
    else if (numbers[numbers.length - 1] !== '…') numbers.push('…');
  }

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
      <p className="text-xs text-surface-500 dark:text-surface-400" aria-live="polite">
        Showing <span className="font-semibold">{first.toLocaleString()}–{last.toLocaleString()}</span> of{' '}
        <span className="font-semibold">{total.toLocaleString()}</span>
      </p>

      {pages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange(page - 1)}
            disabled={busy || page <= 1}
            className="btn-ghost text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {numbers.map((n, i) => (
            n === '…' ? (
              <span key={`gap-${i}`} className="px-1.5 text-xs text-surface-400">…</span>
            ) : (
              <button
                key={n}
                onClick={() => onChange(n)}
                disabled={busy || n === page}
                aria-current={n === page ? 'page' : undefined}
                className={`min-w-8 px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:cursor-default ${
                  n === page
                    ? 'bg-brand-600 text-white'
                    : 'text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'
                }`}
              >
                {n}
              </button>
            )
          ))}

          <button
            onClick={() => onChange(page + 1)}
            disabled={busy || page >= pages}
            className="btn-ghost text-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
