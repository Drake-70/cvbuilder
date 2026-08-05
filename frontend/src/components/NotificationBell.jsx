import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import { relativeTime } from '../utils/relativeTime';

export default function NotificationBell() {
  const { t } = useTranslation('jobs');
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const ref = useRef(null);

  const load = useCallback(async () => {
    try {
      const [countRes, listRes] = await Promise.all([
        api.get('/jobs/notifications/unread-count'),
        api.get('/jobs/notifications', { params: { limit: 8 } })
      ]);
      setUnread(countRes.data.count || 0);
      setItems(listRes.data.notifications || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 45_000);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleEscape);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const markAllRead = async () => {
    try {
      await api.post('/jobs/notifications/read', {});
      setUnread(0);
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    }
  };

  const openItem = (n) => {
    setOpen(false);
    navigate(n.link || (n.jobId ? `/jobs/${n.jobId}` : '/notifications'));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 rounded-full hover:bg-surface-100 dark:hover:bg-surface-800 transition-colors cursor-pointer text-surface-500 dark:text-surface-300"
        aria-label={t('notifications')}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div role="menu" aria-label={t('notifications')} className="absolute right-0 top-full mt-2 w-80 bg-surface-0 dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 shadow-xl animate-scale-in z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-700">
            <p className="text-sm font-semibold text-surface-900 dark:text-white">{t('notifications')}</p>
            <div className="flex items-center gap-2">
              {unread > 0 && (
                <button onClick={markAllRead} className="text-xs text-brand-600 dark:text-brand-400 hover:underline cursor-pointer">
                  {t('mark_all_read')}
                </button>
              )}
              <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 no-underline">
                {t('view_all')}
              </Link>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-shimmer h-3.5 w-full rounded" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="p-6 text-center">
                <p className="text-sm text-surface-400">{t('no_notifications')}</p>
              </div>
            ) : (
              items.map((n) => (
                <button
                  key={n._id}
                  onClick={() => openItem(n)}
                  className={`w-full text-left px-4 py-3 hover:bg-surface-50 dark:hover:bg-surface-700/40 transition-colors cursor-pointer border-b border-surface-100 dark:border-surface-700 last:border-b-0 ${n.read ? '' : 'bg-brand-50/40 dark:bg-brand-900/10'}`}
                >
                  <p className={`text-sm text-surface-900 dark:text-white leading-snug ${n.read ? 'font-normal' : 'font-semibold'}`}>
                    {n.type === 'job_alert' && (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline text-brand-500 mr-1 -mt-0.5">
                        <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"/>
                      </svg>
                    )}
                    {n.title || n.body}
                  </p>
                  <p className="text-xs text-surface-400 mt-0.5">{relativeTime(n.createdAt, t)}</p>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
