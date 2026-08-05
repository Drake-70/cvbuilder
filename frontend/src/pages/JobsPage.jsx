import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCache, invalidateCacheKey } from '../hooks/useCache';
import api from '../services/api';
import JobCard from '../components/JobCard';
import { relativeTime } from '../utils/relativeTime';

const TABS = ['browse', 'applications', 'alerts'];

export default function JobsPage() {
  const { t } = useTranslation('jobs');
  const { t: tc } = useTranslation('common');
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState('browse');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(q);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [q]);

  const params = { page, limit: 12, sort };
  if (search) params.q = search;
  if (location) params.location = location;
  if (category) params.category = category;

  const { data: jobsData, isLoading: jobsLoading, error } = useCache('/jobs', { params });
  const jobs = jobsData?.jobs || [];
  const categories = jobsData?.categories || [];
  const total = jobsData?.total || 0;
  const pages = Math.max(jobsData?.pages || 1, 1);

  const { data: appsData } = useCache('/jobs/applications', { enabled: !!user });
  const applications = appsData?.applications || [];
  const appliedJobIds = new Set(applications.filter((a) => a.jobId).map((a) => a.jobId._id || a.jobId));

  const { data: alertsData, mutate: setAlerts, isLoading: alertsLoading } = useCache('/jobs/alerts', { enabled: !!user });
  const alerts = alertsData?.alerts || [];

  // alert form state
  const [alertForm, setAlertForm] = useState({ name: '', keywords: '', locations: '', categories: [], emailEnabled: true });
  const [savingAlert, setSavingAlert] = useState(false);

  const resetFilters = () => {
    setQ('');
    setSearch('');
    setLocation('');
    setCategory('');
    setPage(1);
  };

  const changePage = (next) => {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleCreateAlert = async () => {
    const keywords = alertForm.keywords.split(',').map((k) => k.trim()).filter(Boolean);
    if (!keywords.length) {
      toast.error(tc('error'), t('keywords_placeholder'));
      return;
    }
    setSavingAlert(true);
    try {
      const res = await api.post('/jobs/alerts', {
        name: alertForm.name.trim() || undefined,
        keywords,
        locations: alertForm.locations.split(',').map((l) => l.trim()).filter(Boolean),
        categories: alertForm.categories,
        emailEnabled: alertForm.emailEnabled
      });
      setAlerts((prev) => [res.data.alert, ...(prev || [])]);
      setAlertForm({ name: '', keywords: '', locations: '', categories: [], emailEnabled: true });
      toast.success(t('alert_created'));
    } catch (err) {
      toast.error(tc('error'), err.response?.data?.error || tc('server_error'));
    } finally {
      setSavingAlert(false);
    }
  };

  const toggleAlert = async (alert) => {
    try {
      const res = await api.put(`/jobs/alerts/${alert._id}`, { active: !alert.active });
      setAlerts((prev) => prev.map((a) => (a._id === alert._id ? res.data.alert : a)));
      toast.info(t('alert_updated'));
    } catch (err) {
      toast.error(tc('error'), err.response?.data?.error || tc('server_error'));
    }
  };

  const deleteAlert = async (id) => {
    if (!window.confirm(t('confirm_delete_alert'))) return;
    try {
      await api.delete(`/jobs/alerts/${id}`);
      setAlerts((prev) => prev.filter((a) => a._id !== id));
      invalidateCacheKey('/jobs/alerts');
      toast.success(t('alert_deleted'));
    } catch (err) {
      toast.error(tc('error'), err.response?.data?.error || tc('server_error'));
    }
  };

  const toggleAlertCategory = (c) => {
    setAlertForm((prev) => ({
      ...prev,
      categories: prev.categories.includes(c)
        ? prev.categories.filter((x) => x !== c)
        : [...prev.categories, c]
    }));
  };

  const methodLabels = {
    tailor: t('application_method_tailor'),
    email: t('application_method_email'),
    link: t('application_method_link')
  };

  const inputCls = "rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 px-3.5 py-2.5 text-sm text-surface-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500/40";

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      <div className="mb-8">
        <p className="kicker mb-2">{t('title')}</p>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-white">{t('title')}</h1>
        <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">{t('subtitle')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-surface-200 dark:border-surface-700" role="tablist">
        {TABS.map((key) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === key
                ? 'border-brand-500 text-brand-600 dark:text-brand-400'
                : 'border-transparent text-surface-500 dark:text-surface-400 hover:text-surface-800 dark:hover:text-surface-200'
            }`}
          >
            {t(key)}
          </button>
        ))}
      </div>

      {tab === 'browse' && (
        <div>
          {!user && (
            <div className="mb-6 flex items-start gap-3 text-sm text-surface-600 dark:text-surface-300 bg-brand-50/70 dark:bg-brand-900/20 border border-brand-100 dark:border-brand-800 rounded-xl px-4 py-3">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500 flex-shrink-0 mt-0.5">
                <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <p>
                {t('browse_public_hint')}{' '}
                <Link to="/login" className="font-medium text-brand-600 dark:text-brand-400 no-underline">{t('login_to_apply')}</Link>
              </p>
            </div>
          )}

          {/* Filters */}
          <div className="card p-4 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative lg:col-span-2">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-surface-400">
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <input
                  type="search"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder={t('search_placeholder')}
                  className={`${inputCls} w-full pl-10`}
                  aria-label={t('search_placeholder')}
                />
              </div>
              <input
                type="text"
                value={location}
                onChange={(e) => { setLocation(e.target.value); setPage(1); }}
                placeholder={t('location_placeholder')}
                className={inputCls}
                aria-label={t('location_placeholder')}
              />
              <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} className={inputCls} aria-label={t('all_categories')}>
                <option value="">{t('all_categories')}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }} className={inputCls} aria-label={t('sort_newest')}>
                <option value="newest">{t('sort_newest')}</option>
                <option value="oldest">{t('sort_oldest')}</option>
              </select>
            </div>
            {(q || location || category) && (
              <button onClick={resetFilters} className="mt-3 text-xs text-brand-600 dark:text-brand-400 hover:underline cursor-pointer">
                {tc('cancel')}
              </button>
            )}
          </div>

          {jobsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card p-5">
                  <div className="animate-shimmer h-4 w-3/4 rounded mb-3" />
                  <div className="animate-shimmer h-3 w-1/2 rounded mb-4" />
                  <div className="animate-shimmer h-3 w-full rounded mb-2" />
                  <div className="animate-shimmer h-3 w-2/3 rounded" />
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="card p-12 text-center">
              <p className="text-sm text-surface-500">{tc('server_error')}</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="card p-12 text-center animate-fade-in">
              <div className="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                  <path d="M21 21l-4.35-4.35"/><circle cx="11" cy="11" r="8"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-surface-900 dark:text-white mb-2">{t('no_jobs')}</h3>
              <p className="text-sm text-surface-500 dark:text-surface-400">{t('no_jobs_desc')}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-surface-400 mb-4">{t('found_jobs', { count: total })}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {jobs.map((job, i) => (
                  <JobCard key={job._id} job={job} applied={appliedJobIds.has(job._id)} index={i} />
                ))}
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => changePage(page - 1)}
                    disabled={page <= 1}
                    className="btn-secondary text-sm px-3 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {tc('back')}
                  </button>
                  <span className="text-sm text-surface-500 dark:text-surface-400 px-3">
                    {page} / {pages}
                  </span>
                  <button
                    onClick={() => changePage(page + 1)}
                    disabled={page >= pages}
                    className="btn-secondary text-sm px-3 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {tc('next')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'applications' && (
        <div>
          {!user ? (
            <div className="card p-12 text-center">
              <p className="text-sm text-surface-500 mb-4">{t('login_to_apply_desc')}</p>
              <div className="flex justify-center gap-3">
                <Link to="/login" className="btn-primary no-underline text-sm">{t('login_to_apply')}</Link>
              </div>
            </div>
          ) : applications.length === 0 ? (
            <div className="card p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
                </svg>
              </div>
              <h3 className="text-lg font-bold text-surface-900 dark:text-white mb-2">{t('no_applications')}</h3>
              <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">{t('no_applications_desc')}</p>
              <Link to="/jobs" className="btn-primary no-underline text-sm">{t('browse')}</Link>
            </div>
          ) : (
            <div className="card divide-y divide-surface-100 dark:divide-surface-700 overflow-hidden">
              {applications.map((app) => {
                const job = app.jobId || {};
                return (
                  <div key={app._id} className="px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-700/40 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-700/50 flex items-center justify-center flex-shrink-0">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                          <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        {job._id ? (
                          <Link to={`/jobs/${job._id}`} className="text-sm font-semibold text-surface-900 dark:text-white no-underline hover:text-brand-600 dark:hover:text-brand-400 transition-colors">
                            {job.title || '—'}
                          </Link>
                        ) : (
                          <p className="text-sm font-semibold text-surface-900 dark:text-white">{job.title || '—'}</p>
                        )}
                        <p className="text-xs text-surface-400 mt-0.5">
                          {job.company && <span className="text-surface-500 dark:text-surface-400">{job.company} · </span>}
                          {t('applied_on')} {relativeTime(app.appliedAt || app.createdAt, t)} · {methodLabels[app.method] || app.method}
                        </p>
                      </div>
                      <span className="flex-shrink-0 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400 rounded-full px-2 py-0.5">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
                        </svg>
                        {t('applied')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'alerts' && (
        <div>
          {!user ? (
            <div className="card p-12 text-center">
              <p className="text-sm text-surface-500 mb-4">{t('login_to_apply_desc')}</p>
              <div className="flex justify-center gap-3">
                <Link to="/login" className="btn-primary no-underline text-sm">{t('login_to_apply')}</Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Create form */}
              <div className="card p-5">
                <h3 className="text-base font-bold text-surface-900 dark:text-white mb-4">{t('create_alert')}</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('alert_name')}</label>
                    <input
                      type="text"
                      value={alertForm.name}
                      onChange={(e) => setAlertForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder={t('alert_name_placeholder')}
                      className={inputCls + ' w-full'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('keywords')}</label>
                    <input
                      type="text"
                      value={alertForm.keywords}
                      onChange={(e) => setAlertForm((p) => ({ ...p, keywords: e.target.value }))}
                      placeholder={t('keywords_placeholder')}
                      className={inputCls + ' w-full'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('locations')}</label>
                    <input
                      type="text"
                      value={alertForm.locations}
                      onChange={(e) => setAlertForm((p) => ({ ...p, locations: e.target.value }))}
                      placeholder={t('locations_placeholder')}
                      className={inputCls + ' w-full'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">{t('categories')}</label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((c) => (
                        <button
                          key={c}
                          onClick={() => toggleAlertCategory(c)}
                          className={`text-xs rounded-full px-2.5 py-1 border transition-colors cursor-pointer ${
                            alertForm.categories.includes(c)
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-300 hover:border-brand-300'
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2.5 text-sm text-surface-600 dark:text-surface-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={alertForm.emailEnabled}
                      onChange={(e) => setAlertForm((p) => ({ ...p, emailEnabled: e.target.checked }))}
                      className="w-4 h-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500"
                    />
                    {t('email_digest')}
                  </label>
                  <button
                    onClick={handleCreateAlert}
                    disabled={savingAlert}
                    className="btn-primary w-full text-sm justify-center cursor-pointer disabled:opacity-60"
                  >
                    {savingAlert ? tc('loading') : t('create_alert')}
                  </button>
                </div>
              </div>

              {/* List */}
              <div>
                {alertsLoading ? (
                  <div className="card p-5 space-y-3">
                    {[1, 2].map((i) => <div key={i} className="animate-shimmer h-4 w-full rounded" />)}
                  </div>
                ) : alerts.length === 0 ? (
                  <div className="card p-12 text-center">
                    <div className="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center mx-auto mb-4">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
                        <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/>
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-surface-900 dark:text-white mb-2">{t('no_alerts')}</h3>
                    <p className="text-sm text-surface-500 dark:text-surface-400">{t('no_alerts_desc')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {alerts.map((alert) => (
                      <div key={alert._id} className="card p-4 flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">{alert.name}</p>
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {alert.keywords.map((k) => (
                              <span key={k} className="text-[11px] bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 rounded-full px-2 py-0.5">{k}</span>
                            ))}
                          </div>
                          {(alert.locations?.length > 0 || alert.categories?.length > 0) && (
                            <p className="text-xs text-surface-400 mt-1.5 truncate">
                              {alert.locations.join(', ')}{alert.locations?.length > 0 && alert.categories?.length > 0 ? ' · ' : ''}{alert.categories.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2 flex-shrink-0">
                          <button
                            onClick={() => toggleAlert(alert)}
                            className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${alert.active ? 'bg-brand-600' : 'bg-surface-300 dark:bg-surface-600'}`}
                            aria-label={alert.active ? t('status') : t('status')}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${alert.active ? 'translate-x-4' : ''}`} />
                          </button>
                          <button
                            onClick={() => deleteAlert(alert._id)}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/20 text-surface-400 hover:text-rose-500 transition-colors cursor-pointer"
                            aria-label={t('alert_deleted')}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
