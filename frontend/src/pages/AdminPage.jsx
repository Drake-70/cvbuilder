import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';
import { Skeleton } from '../components/Skeleton';
import OverviewTab from '../components/admin/OverviewTab';
import UsersTab from '../components/admin/UsersTab';
import PaymentsTab from '../components/admin/PaymentsTab';
import ContactsTab from '../components/admin/ContactsTab';
import JobsTab from '../components/admin/JobsTab';

/**
 * Admin dashboard.
 *
 * A shell only: the four tabs load their own data. The previous version fetched
 * users and payments here and re-derived them per tab, which meant a search in the
 * users tab mutated the same array the overview tab rendered from.
 */
const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'users', label: 'Users' },
  { value: 'payments', label: 'Payments' },
  { value: 'inbox', label: 'Inbox' },
  { value: 'jobs', label: 'Jobs' }
];

export default function AdminPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const isAdmin = user?.role === 'admin';

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.get('/admin/dashboard');
      setDashboard(res.data);
    } catch (err) {
      // Surfaced in the page rather than only in a toast: a toast disappears, and
      // an admin looking at an empty dashboard needs to know whether it is empty
      // or broken.
      const message = err.response?.data?.error || 'Could not load the dashboard.';
      setLoadError(message);
      toastRef.current.error('Admin dashboard', message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    loadDashboard();
  }, [isAdmin, loadDashboard]);

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-surface-900 dark:text-white mb-2">Admin access required</h1>
        <p className="text-surface-500 dark:text-surface-400">You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Admin dashboard</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">Users, revenue, inbox, and job board</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-xl mb-6" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            role="tab"
            aria-selected={tab === t.value}
            className={`flex-1 min-w-20 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all ${
              tab === t.value
                ? 'bg-surface-0 dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : loadError ? (
        <div className="card p-6 text-center">
          <p className="text-sm font-semibold text-rose-600 dark:text-rose-400 mb-1">Could not load the dashboard</p>
          <p className="text-xs text-surface-500 dark:text-surface-400 mb-4">{loadError}</p>
          <button onClick={loadDashboard} className="btn-secondary text-sm cursor-pointer">
            Try again
          </button>
        </div>
      ) : (
        <>
          {tab === 'overview' && dashboard && <OverviewTab dashboard={dashboard} />}
          {tab === 'users' && <UsersTab currentUserId={user?._id} />}
          {tab === 'payments' && <PaymentsTab />}
          {tab === 'inbox' && <ContactsTab />}
          {tab === 'jobs' && <JobsTab expiredJobs={dashboard?.stats?.expiredJobs} />}
        </>
      )}
    </div>
  );
}