import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../contexts/ToastContext';
import { useCache, invalidateCacheKey } from '../hooks/useCache';
import api from '../services/api';
import { relativeTime } from '../utils/relativeTime';

export default function NotificationsPage() {
  const { t } = useTranslation('jobs');
  const { t: tc } = useTranslation('common');
  const { toast } = useToast();

  const { data, isLoading, mutate: setNotifications } = useCache('/jobs/notifications', { params: { limit: 50 }, staleTime: 15_000 });
  const notifications = data?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = async () => {
    try {
      await api.post('/jobs/notifications/read', {});
      setNotifications((prev) => ({ ...prev, notifications: (prev?.notifications || []).map((n) => ({ ...n, read: true })) }));
      invalidateCacheKey('/jobs/notifications');
    } catch {
      toast.error(tc('error'), tc('server_error'));
    }
  };

  const markRead = async (id) => {
    try {
      await api.post('/jobs/notifications/read', { id });
      setNotifications((prev) => ({
        ...prev,
        notifications: (prev?.notifications || []).map((n) => (n._id === id ? { ...n, read: true } : n))
      }));
    } catch {
      // ignore
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <p className="kicker mb-2">{t('notifications')}</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-surface-900 dark:text-white">{t('notifications')}</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400 mt-2">
            {unreadCount > 0 ? `${unreadCount} unread` : tc('no_results')}
          </p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-sm flex-shrink-0 cursor-pointer">
            {t('mark_all_read')}
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="card divide-y divide-surface-100 dark:divide-surface-700 overflow-hidden">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-5"><div className="animate-shimmer h-4 w-48 rounded mb-2" /><div className="animate-shimmer h-3 w-32 rounded" /></div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-100 dark:bg-surface-700 flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-surface-400">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <h3 className="text-lg font-bold text-surface-900 dark:text-white mb-2">{t('no_notifications')}</h3>
          <p className="text-sm text-surface-500 dark:text-surface-400 mb-6">{t('no_alerts_desc')}</p>
          <Link to="/jobs" className="btn-primary no-underline text-sm inline-flex">{t('browse')}</Link>
        </div>
      ) : (
        <div className="card divide-y divide-surface-100 dark:divide-surface-700 overflow-hidden">
          {notifications.map((n) => (
            <div
              key={n._id}
              className={`px-5 py-4 flex items-start gap-3 transition-colors ${n.read ? '' : 'bg-brand-50/40 dark:bg-brand-900/10'}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 ${
                n.type === 'job_alert'
                  ? 'bg-brand-50 dark:bg-brand-900/40 text-brand-500'
                  : n.type === 'application'
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-500'
                    : 'bg-surface-100 dark:bg-surface-700 text-surface-400'
              }`}>
                {n.type === 'job_alert' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/>
                  </svg>
                ) : n.type === 'application' ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/>
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {n.link || n.jobId ? (
                  <Link
                    to={n.link || `/jobs/${n.jobId}`}
                    onClick={() => !n.read && markRead(n._id)}
                    className={`text-sm text-surface-900 dark:text-white leading-snug no-underline hover:text-brand-600 dark:hover:text-brand-400 transition-colors ${n.read ? 'font-normal' : 'font-semibold'}`}
                  >
                    {n.title}
                  </Link>
                ) : (
                  <p className={`text-sm text-surface-900 dark:text-white leading-snug ${n.read ? 'font-normal' : 'font-semibold'}`}>{n.title}</p>
                )}
                {n.body && n.body !== n.title && (
                  <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{n.body}</p>
                )}
                <p className="text-xs text-surface-400 mt-1">{relativeTime(n.createdAt, t)}</p>
              </div>
              {!n.read && (
                <button
                  onClick={() => markRead(n._id)}
                  className="flex-shrink-0 p-1.5 rounded-lg hover:bg-surface-100 dark:hover:bg-surface-800 text-surface-400 hover:text-brand-600 transition-colors cursor-pointer"
                  aria-label={t('mark_read')}
                  title={t('mark_read')}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22,7 13.5,15.5 8.5,10.5"/><polyline points="16,7 22,7 22,13"/>
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
