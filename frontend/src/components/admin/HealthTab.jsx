import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import { Skeleton } from '../Skeleton';
import AdminStat from './AdminStat';

/**
 * Infrastructure monitoring: is the app healthy, and which endpoint is hurting.
 *
 * The single most important thing on this screen is the scope note at the top. Every
 * figure here comes from the process that served the request -- a per-instance
 * counter that resets on deploy. On a horizontally scaled deployment each instance
 * sees only its own share. Rendering that as "our error rate" without saying so is
 * how a per-process memory number gets quoted as the health of a fleet, so the scope
 * is stated on the payload, repeated here, and attached to the badge.
 *
 * The overall verdict deliberately covers only the data layer and the live error
 * rate. A slow p99 is not an outage; folding latency into one badge would page
 * someone for a latency blip that resolves itself.
 */

function formatUptime(seconds) {
  if (typeof seconds !== 'number') return '\u2014';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatBytes(bytes) {
  if (typeof bytes !== 'number') return '\u2014';
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(1)} MB`;
}

function formatMs(value) {
  if (value == null) return '\u2014';
  if (value >= 1000) return `${(value / 1000).toFixed(2)} s`;
  return `${Math.round(value)} ms`;
}

function formatPercent(value) {
  if (typeof value !== 'number') return '\u2014';
  if (value === 0) return '0%';
  // Below a tenth of a percent, more precision is noise on a screen read at a glance.
  return value < 0.001 ? '<0.1%' : `${(value * 100).toFixed(1)}%`;
}

function DependencyRow({ name, dependency }) {
  const ok = dependency?.ok;
  const detail = dependency?.state
    || { 1: 'connected', 2: 'connecting', 3: 'disconnecting', 0: 'disconnected' }[dependency?.readyState];

  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-surface-900 dark:text-white">{name}</p>
        <p className="text-xs text-surface-400 mt-0.5">
          {ok ? (detail || 'ok') : (dependency?.error || 'unreachable')}
        </p>
        {/* What the app does without it. An operational difference, not a cosmetic
            one: an unconfigured Redis means rate limits reset on every deploy. */}
        {dependency?.impact && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">{dependency.impact}</p>
        )}
      </div>
      <span className={`badge flex-shrink-0 mt-0.5 ${ok ? 'badge-emerald' : 'badge-rose'}`}>
        {ok ? 'healthy' : 'failing'}
      </span>
    </div>
  );
}

export default function HealthTab() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/health');
      setData(res.data);
    } catch (err) {
      toastRef.current.error('Could not load health', err.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="space-y-4 animate-fade-in">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!data) return null;

  const { status, dependencies, requests } = data;
  const healthy = status === 'ok';
  const routes = (requests?.routes || []).filter((r) => r.requests > 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
              healthy ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500' : 'bg-amber-50 dark:bg-amber-900/30 text-amber-500'
            }`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {healthy
                  ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></>
                  : <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>}
              </svg>
            </div>

            <div>
              <p className="text-base font-bold text-surface-900 dark:text-white">
                {healthy ? 'All systems operational' : 'Degraded'}
              </p>
              <p className="text-xs text-surface-400 mt-1 max-w-lg leading-relaxed">
                Checked {new Date(data.checkedAt).toLocaleTimeString()}. This verdict covers the
                database, Redis, and the live error rate only. Latency is reported separately below,
                because a slow endpoint is not an outage.
              </p>
            </div>
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="btn-secondary text-xs cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Refreshing\u2026' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <AdminStat
          label={`Requests (${Math.round((requests?.windowSeconds || 0) / 60)} min)`}
          value={(requests?.totals?.requests ?? 0).toLocaleString()}
          tone="brand"
        />
        <AdminStat
          label="Server errors"
          value={(requests?.totals?.errors ?? 0).toLocaleString()}
          hint={`${formatPercent(requests?.totals?.errorRate)} of requests`}
          tone={(requests?.totals?.errors ?? 0) > 0 ? 'rose' : 'slate'}
        />
        <AdminStat
          label="Average latency"
          value={formatMs(requests?.totals?.averageMs)}
          hint={`p99 across routes`}
        />
        <AdminStat
          label="Uptime"
          value={formatUptime(requests?.uptimeSeconds)}
          hint={`${(requests?.totals?.inFlight ?? 0)} request${(requests?.totals?.inFlight ?? 0) === 1 ? '' : 's'} in flight`}
          tone="emerald"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-surface-900 dark:text-white mb-1">Dependencies</h3>
          <div className="divide-y divide-surface-100 dark:divide-surface-700">
            <DependencyRow name="MongoDB" dependency={dependencies?.mongo} />
            <DependencyRow name="Redis" dependency={dependencies?.redis} />
          </div>

          <p className="text-[11px] text-surface-400 mt-3 leading-relaxed">
            Memory in use: {formatBytes(requests?.memory?.heapUsed)} heap of{' '}
            {formatBytes(requests?.memory?.rss)} resident.
          </p>
        </div>

        <div className="card p-5 lg:col-span-2 overflow-hidden">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Endpoint latency</h3>
            <p className="text-xs text-surface-400">Slowest first</p>
          </div>

          {routes.length === 0 ? (
            <p className="text-sm text-surface-400 py-8 text-center">
              No requests recorded in this window yet.
            </p>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-surface-400 text-left">
                    <th className="font-medium pb-2">Route</th>
                    <th className="font-medium pb-2 text-right">Reqs</th>
                    <th className="font-medium pb-2 text-right">p50</th>
                    <th className="font-medium pb-2 text-right">p95</th>
                    <th className="font-medium pb-2 text-right">p99</th>
                    <th className="font-medium pb-2 text-right">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
                  {routes.slice(0, 12).map((route) => (
                    <tr key={route.path}>
                      <td className="py-2 pr-3 font-mono text-[11px] text-surface-600 dark:text-surface-300 truncate max-w-[220px]" title={route.path}>
                        {route.path}
                      </td>
                      <td className="py-2 text-right tabular-nums text-surface-500 dark:text-surface-400">{route.requests}</td>
                      <td className="py-2 text-right tabular-nums text-surface-500 dark:text-surface-400">{formatMs(route.p50)}</td>
                      <td className="py-2 text-right tabular-nums text-surface-500 dark:text-surface-400">{formatMs(route.p95)}</td>
                      <td className="py-2 text-right tabular-nums text-surface-600 dark:text-surface-200">{formatMs(route.p99)}</td>
                      <td className="py-2 text-right tabular-nums">
                        {route.errors > 0 ? (
                          <span className="text-rose-600 dark:text-rose-400">
                            {route.errors} ({formatPercent(route.errorRate)})
                          </span>
                        ) : (
                          <span className="text-surface-300 dark:text-surface-600">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h3 className="text-sm font-semibold text-surface-900 dark:text-white">Recent server errors</h3>
        <p className="text-xs text-surface-400 mt-0.5 mb-3">
          Newest first, up to 50. Message only &mdash; never the request body or headers.
        </p>

        {!requests?.recentErrors?.length ? (
          <p className="text-sm text-surface-400 py-6 text-center">No server errors recorded.</p>
        ) : (
          <ul className="space-y-2">
            {requests.recentErrors.slice(0, 10).map((error, index) => (
              <li
                key={`${error.at}-${index}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs py-1.5 border-b border-surface-100 dark:border-surface-700 last:border-0"
              >
                <span className="text-surface-400 tabular-nums">
                  {new Date(error.at).toLocaleTimeString()}
                </span>
                <span className="font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                  {error.status}
                </span>
                <span className="font-mono text-[11px] text-surface-600 dark:text-surface-300">
                  {error.method} {error.path}
                </span>
                <span className="text-surface-400 ml-auto tabular-nums">{formatMs(error.durationMs)}</span>
                <span className="w-full text-surface-500 dark:text-surface-400 pl-0 sm:pl-[104px] truncate" title={error.message}>
                  {error.message}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-surface-400 leading-relaxed">
        Scope: {requests?.scope}. These counters live in the memory of one process and start
        again on every deploy, so with more than one instance each shows only its own
        share of traffic. They are for &ldquo;is it healthy now, and which endpoint is
        slow&rdquo; &mdash; not for a rate that has to survive a restart or be summed across
        instances. Latency is bucketed, so percentiles are accurate to within a bucket
        width and slow requests are clamped rather than dropped.
      </p>
    </div>
  );
}