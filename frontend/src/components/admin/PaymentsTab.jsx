import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Skeleton } from '../Skeleton';
import AdminPagination from './AdminPagination';

/**
 * Payment ledger.
 *
 * Two fixes worth naming. The old table read `p.method`, which is not a field on
 * the Payment schema — the real ones are `provider` (mtn | orange | card) and
 * `paymentMethod` (campay | paystack | stripe) — so the method column rendered
 * "N/A" for every payment ever taken. And the totals shown here are the server's,
 * aggregated over the current filter, so the headline figure always matches the
 * rows underneath it.
 *
 * Only `success` counts as revenue. A pending payment is money that has not
 * arrived, and the dashboard's all-time figure is built the same way.
 */

const STATUSES = [
  { value: '', label: 'All' },
  { value: 'success', label: 'Successful' },
  { value: 'pending', label: 'Pending' },
  { value: 'failed', label: 'Failed' },
  { value: 'expired', label: 'Expired' }
];

const STATUS_STYLE = {
  success: 'badge-emerald',
  pending: 'badge-amber',
  failed: 'badge-rose',
  expired: 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400'
};

const PAGE_SIZE = 20;

function formatMoney(amount, currency) {
  if (typeof amount !== 'number') return '-';
  return `${amount.toLocaleString()} ${currency || ''}`.trim();
}

export default function PaymentsTab() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => { setPage(1); }, [status]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.get('/admin/payments', {
      params: { page, limit: PAGE_SIZE, status: status || undefined }
    })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          toastRef.current.error('Could not load payments', err.response?.data?.error || 'Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [page, status]);

  const totals = data?.totals;

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatMoney(totals?.successful?.total, 'XAF')}
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            {totals?.successful?.count ?? 0} successful
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {formatMoney(totals?.byStatus?.pending?.total, 'XAF')}
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            {totals?.byStatus?.pending?.count ?? 0} pending
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {formatMoney(totals?.failed?.total, 'XAF')}
          </p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
            {totals?.failed?.count ?? 0} failed
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => {
          const active = status === s.value;
          const count = s.value ? totals?.byStatus?.[s.value]?.count : data?.total;
          return (
            <button
              key={s.value || 'all'}
              onClick={() => setStatus(s.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                active
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
              }`}
            >
              {s.label}
              {typeof count === 'number' && (
                <span className={`tabular-nums ${active ? 'text-brand-100' : 'text-surface-400'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 flex items-center gap-4">
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={`space-y-2 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {data?.payments?.map((p) => (
              <div key={p._id} className="card p-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
                    <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-white truncate">
                    {p.userId?.name || p.email || p.userId?.email || 'Unknown payer'}
                  </p>
                  <p className="text-xs text-surface-400 truncate">
                    {/* `provider` and `paymentMethod` are the real field names. The
                        old column read `p.method`, which does not exist on the
                        schema, so it always showed N/A. */}
                    {[p.provider, p.paymentMethod].filter(Boolean).join(' · ') || 'No provider recorded'}
                    {p.phoneNumber && <span> · {p.phoneNumber}</span>}
                  </p>
                </div>

                <span className={`badge ${STATUS_STYLE[p.status] || 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400'}`}>
                  {p.status}
                </span>

                <span className="text-sm font-semibold text-surface-900 dark:text-white tabular-nums">
                  {formatMoney(p.amount, p.currency)}
                </span>

                <span className="text-xs text-surface-400 whitespace-nowrap">
                  {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}

            {!loading && data?.payments?.length === 0 && (
              <p className="text-center text-surface-400 py-8 text-sm">
                {status ? 'No payments with that status.' : 'No payments yet.'}
              </p>
            )}
          </div>

          {data && (
            <AdminPagination
              page={data.page}
              pages={data.pages}
              limit={data.limit || PAGE_SIZE}
              total={data.total}
              onChange={setPage}
              busy={loading}
            />
          )}
        </>
      )}
    </div>
  );
}