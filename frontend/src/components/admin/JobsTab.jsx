import { useCallback, useEffect, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Skeleton } from '../Skeleton';

/**
 * Job board health and the manual scrape trigger.
 *
 * `SOURCES` mirrors `backend/services/jobScraper.js`. This list previously named
 * two sources that had been removed after they started returning 403, so the panel
 * reported 0 for them forever and Louma was never counted. The comment is kept
 * because the next person who adds a source will not read the scraper first.
 */
const SOURCES = ['goafrica', 'louma'];

export default function JobsTab({ expiredJobs }) {
  const { toast } = useToast();
  const [jobStats, setJobStats] = useState(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [jobScrape, setJobScrape] = useState(null);
  const [scraping, setScraping] = useState(false);

  const loadJobStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const entries = await Promise.all(
        SOURCES.map(async (source) => {
          try {
            const res = await api.get('/jobs', { params: { source, limit: 1 } });
            return { source, count: res.data.total };
          } catch {
            return { source, count: 0 };
          }
        })
      );
      const all = await api.get('/jobs', { params: { limit: 1 } });
      setJobStats({ total: all.data.total, bySource: entries });
    } catch {
      // Silent: an unreachable jobs endpoint here is already visible in the panel,
      // and a toast on every tab visit would be noise.
    } finally {
      setLoadingStats(false);
    }
  }, []);

  useEffect(() => { loadJobStats(); }, [loadJobStats]);

  const runScrape = async () => {
    if (scraping) return;
    setScraping(true);
    setJobScrape(null);
    try {
      const res = await api.post('/jobs/scrape');
      setJobScrape(res.data);
      toast.success('Scrape complete', 'Job listings have been refreshed.');
      loadJobStats();
    } catch (err) {
      toast.error('Scrape failed', err.response?.data?.error || 'Could not run the scrape.');
    } finally {
      setScraping(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <div>
            <h3 className="text-sm font-bold text-surface-900 dark:text-white">Job listings</h3>
            <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
              {loadingStats
                ? 'Loading job stats\u2026'
                : `${jobStats?.total ?? 0} active listings on the board.${expiredJobs ? ` ${expiredJobs} aged out and hidden.` : ''}`}
            </p>
          </div>
          <button
            onClick={runScrape}
            disabled={scraping}
            className="btn-primary text-sm justify-center cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex-shrink-0"
          >
            {scraping ? (
              <span className="inline-flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Scraping&hellip;
              </span>
            ) : (
              'Run scrape now'
            )}
          </button>
        </div>
        <p className="text-xs text-surface-400">
          Scheduler runs automatically every 6 hours. This button triggers a manual refresh of all sources.
        </p>
      </div>

      {loadingStats && !jobStats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : (
        jobStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-brand-600 dark:text-brand-400 tabular-nums">{jobStats.total}</p>
              <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">Total jobs</p>
            </div>
            {jobStats.bySource.map((s) => (
              <div key={s.source} className="card p-4 text-center">
                <p className="text-2xl font-bold text-surface-600 dark:text-surface-300 tabular-nums">{s.count}</p>
                <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5 capitalize">{s.source}</p>
              </div>
            ))}
          </div>
        )
      )}

      {jobScrape && (
        <div className="card p-5">
          <h3 className="text-sm font-bold text-surface-900 dark:text-white mb-3">Last scrape result</h3>
          <div className="space-y-2">
            {(jobScrape.results || []).map((r) => (
              <div key={r.source} className="flex items-center gap-3 text-sm">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${r.status === 'ok' ? 'bg-emerald-500' : 'bg-rose-500'}`} aria-hidden="true" />
                <span className="capitalize w-24 text-surface-600 dark:text-surface-300">{r.source}</span>
                <span className="text-xs text-surface-400">
                  {r.status === 'ok'
                    ? `${r.added} new \u00b7 ${r.updated} updated`
                    : `failed: ${r.error}`}
                </span>
              </div>
            ))}
            {jobScrape.matched && (
              <p className="text-xs text-surface-400 pt-2 border-t border-surface-100 dark:border-surface-700">
                Alerts matched: {jobScrape.matched.notifications} notification(s) &middot; {jobScrape.matched.emails} email(s)
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}