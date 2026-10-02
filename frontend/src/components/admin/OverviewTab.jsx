import AdminStat from './AdminStat';

/**
 * Revenue figures.
 *
 * Only successful payments are counted, which is the server's rule rather than a
 * display choice — see `adminController.getDashboard`. `averageOrderValue` arrives
 * as `null` when nothing has sold yet, and is rendered as an em dash so the panel
 * does not claim an average order value of zero.
 */
function formatMoney(amount, currency = 'XAF') {
  if (typeof amount !== 'number') return '\u2014';
  return `${amount.toLocaleString()} ${currency}`;
}

export default function OverviewTab({ dashboard }) {
  const { stats, revenue, system } = dashboard;
  const redis = system?.redis || {};

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AdminStat label="Total users" value={(stats.totalUsers ?? 0).toLocaleString()} tone="brand" />
        <AdminStat label="Active subscriptions" value={(stats.activeSubscriptions ?? 0).toLocaleString()} tone="emerald" />
        <AdminStat label="Tailored documents" value={(stats.totalDocuments ?? 0).toLocaleString()} />
        <AdminStat label="Saved CVs" value={(stats.totalCVs ?? 0).toLocaleString()} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Unverified accounts are a support queue: verification is enforced before
            the dashboard, so anyone stuck here cannot do anything. */}
        <AdminStat label="Unverified email" value={(stats.unverifiedUsers ?? 0).toLocaleString()} tone="amber" />
        <AdminStat label="Live jobs" value={(stats.activeJobs ?? 0).toLocaleString()} tone="emerald" />
        {/* Makes the expiry sweep observable. A runaway JOB_EXPIRY_DAYS shows up
            here rather than silently emptying the job board. */}
        <AdminStat label="Expired jobs" value={(stats.expiredJobs ?? 0).toLocaleString()} />
        <AdminStat label="Open messages" value={(stats.openContacts ?? 0).toLocaleString()} tone={stats.openContacts > 0 ? 'amber' : 'slate'} />
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-bold text-surface-900 dark:text-white">Revenue</h3>
          <p className="text-xs text-surface-400">Successful payments only</p>
        </div>

        <div className="grid sm:grid-cols-3 gap-4">
          <div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatMoney(revenue?.allTime)}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              All time &middot; {revenue?.allTimeCount ?? 0} payments
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-brand-600 dark:text-brand-400 tabular-nums">
              {formatMoney(revenue?.thisMonth)}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              This month &middot; {revenue?.thisMonthCount ?? 0} payments
            </p>
          </div>
          <div>
            <p className="text-2xl font-bold text-surface-700 dark:text-surface-200 tabular-nums">
              {formatMoney(revenue?.averageOrderValue)}
            </p>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Average order value</p>
          </div>
        </div>

        {(revenue?.failedPayments > 0 || revenue?.successfulPayments > 0) && (
          <p className="text-xs text-surface-400 mt-4 pt-3 border-t border-surface-100 dark:border-surface-700">
            {revenue.successfulPayments} successful, {revenue.failedPayments} failed
          </p>
        )}
      </div>

      {/* The app's own view of its dependencies. The alternative to this card was
          curling /api/health, which is exactly the kind of thing an admin
          dashboard should save an operator from doing. */}
      <div className="card p-5">
        <h3 className="text-sm font-bold text-surface-900 dark:text-white mb-3">System</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`badge ${system?.cache === 'redis' ? 'badge-emerald' : 'badge-amber'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${system?.cache === 'redis' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            Cache: {system?.cache === 'redis' ? 'Redis' : 'In-memory'}
          </span>

          <span className={`badge ${redis.ok ? 'badge-emerald' : 'bg-surface-100 text-surface-500 dark:bg-surface-800 dark:text-surface-400'}`}>
            Redis: {redis.state || 'unknown'}
          </span>

          {redis.error && (
            <span className="text-xs text-surface-400 truncate" title={redis.error}>
              {redis.error}
            </span>
          )}
        </div>

        {system?.cache !== 'redis' && (
          <p className="text-xs text-surface-400 mt-3">
            Caching, rate limits and the scrape lock are all running in-process. Rate limits
            do not apply across instances, and a restart clears them.
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-900 dark:text-white mb-3">Recent users</h3>
          <div className="space-y-2">
            {dashboard.recentUsers?.map((u) => (
              <div key={u._id} className="flex items-center gap-3 py-1.5">
                <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-semibold flex-shrink-0">
                  {u.name?.charAt(0)?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-white truncate">{u.name}</p>
                  <p className="text-xs text-surface-400 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {!u.emailVerified && <span className="badge badge-amber">Unverified</span>}
                  <span className={`badge ${u.subscriptionStatus === 'active' ? 'badge-emerald' : 'badge-brand'}`}>
                    {u.subscriptionStatus === 'active' ? 'Pro' : 'Free'}
                  </span>
                </div>
                <span className="text-xs text-surface-400 flex-shrink-0">
                  {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
            {!dashboard.recentUsers?.length && (
              <p className="text-center text-surface-400 py-4 text-sm">No users yet.</p>
            )}
          </div>
        </div>

        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-900 dark:text-white mb-3">Recent payments</h3>
          <div className="space-y-2">
            {dashboard.recentPayments?.map((p) => (
              <div key={p._id} className="flex items-center gap-3 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-surface-900 dark:text-white truncate tabular-nums">
                    {p.amount?.toLocaleString()} {p.currency}
                  </p>
                  {/* `provider` is the real field; the old page read `method`,
                      which is not on the schema and always rendered N/A. */}
                  <p className="text-xs text-surface-400 truncate">
                    {[p.provider, p.paymentMethod].filter(Boolean).join(' · ') || 'No provider recorded'}
                  </p>
                </div>
                <span className={`badge ${p.status === 'success' ? 'badge-emerald' : p.status === 'failed' ? 'badge-rose' : 'badge-amber'}`}>
                  {p.status}
                </span>
                <span className="text-xs text-surface-400 flex-shrink-0">
                  {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            ))}
            {!dashboard.recentPayments?.length && (
              <p className="text-center text-surface-400 py-4 text-sm">No payments yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}