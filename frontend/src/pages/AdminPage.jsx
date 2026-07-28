import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import api from '../services/api';

export default function AdminPage() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState('overview');
  const [dashboard, setDashboard] = useState(null);
  const [users, setUsers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    loadDashboard();
  }, [isAdmin]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.get('/admin/dashboard');
      setDashboard(res.data);
      setUsers(res.data.recentUsers || []);
    } catch {
      toast.error('Access Denied', 'Admin access required.');
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async (q = '') => {
    try {
      const res = await api.get(`/admin/users?search=${q}&limit=50`);
      setUsers(res.data.users || []);
    } catch { /* silent */ }
  };

  const loadPayments = async () => {
    try {
      const res = await api.get('/admin/payments?limit=50');
      setPayments(res.data.payments || []);
    } catch { /* silent */ }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.patch(`/admin/users/${userId}/role`, { role: newRole });
      setUsers(prev => prev.map(u => u._id === userId ? { ...u, role: newRole } : u));
      toast.success('Role Updated', `User is now ${newRole}`);
    } catch {
      toast.error('Failed', 'Could not update role');
    }
  };

  const handleSearch = (val) => {
    setSearch(val);
    if (tab === 'users') loadUsers(val);
  };

  const handleTabChange = (newTab) => {
    setTab(newTab);
    if (newTab === 'payments' && payments.length === 0) loadPayments();
    if (newTab === 'users' && users.length <= 10) loadUsers(search);
  };

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center animate-slide-up">
        <div className="w-16 h-16 rounded-2xl bg-rose-50 dark:bg-rose-900/20 flex items-center justify-center mx-auto mb-4">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-rose-500">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </div>
        <h1 className="text-xl font-bold text-surface-900 dark:text-white mb-2">Admin Access Required</h1>
        <p className="text-surface-500 dark:text-surface-400">You don't have permission to view this page.</p>
      </div>
    );
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '-';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12 animate-slide-up" role="main">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center text-white shadow-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
        </div>
        <div>
          <h1 className="text-2xl font-bold text-surface-900 dark:text-white">Admin Dashboard</h1>
          <p className="text-sm text-surface-500 dark:text-surface-400">Monitor users, payments, and activity</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-surface-100 dark:bg-surface-800 rounded-xl mb-6">
        {['overview', 'users', 'payments'].map(t => (
          <button key={t} onClick={() => handleTabChange(t)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-all ${tab === t ? 'bg-surface-0 dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'}`}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="card p-4"><div className="animate-shimmer h-4 w-48 rounded mb-2" /><div className="animate-shimmer h-3 w-32 rounded" /></div>)}
        </div>
      ) : (
        <>
          {/* Overview */}
          {tab === 'overview' && dashboard && (
            <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total Users', value: dashboard.stats.totalUsers, color: 'brand' },
                  { label: 'Active Subs', value: dashboard.stats.activeSubscriptions, color: 'emerald' },
                  { label: 'Documents', value: dashboard.stats.totalDocuments, color: 'blue' },
                  { label: 'Saved CVs', value: dashboard.stats.totalCVs, color: 'amber' }
                ].map(s => (
                  <div key={s.label} className="card p-4 text-center">
                    <p className={`text-2xl font-bold text-${s.color}-600 dark:text-${s.color}-400`}>{s.value}</p>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{s.label}</p>
                  </div>
                ))}
              </div>

              <div className="card p-5">
                <h3 className="text-sm font-bold text-surface-900 dark:text-white mb-3">Recent Users</h3>
                <div className="space-y-2">
                  {dashboard.recentUsers?.map(u => (
                    <div key={u._id} className="flex items-center gap-3 py-2">
                      <div className="w-7 h-7 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-semibold">
                        {u.name?.charAt(0)?.toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-surface-900 dark:text-white truncate">{u.name}</p>
                        <p className="text-xs text-surface-400">{u.email}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${u.subscriptionStatus === 'active' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-surface-100 text-surface-500 dark:bg-surface-800'}`}>
                        {u.subscriptionStatus === 'active' ? 'Pro' : 'Free'}
                      </span>
                      <span className="text-xs text-surface-400">{formatDate(u.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Users */}
          {tab === 'users' && (
            <div className="animate-fade-in">
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by name or email..."
                className="input-field mb-4"
              />
              <div className="space-y-2">
                {users.map(u => (
                  <div key={u._id} className="card p-4 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-semibold flex-shrink-0">
                      {u.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-white truncate">{u.name}</p>
                      <p className="text-xs text-surface-400">{u.email}</p>
                    </div>
                    <button
                      onClick={() => handleRoleChange(u._id, u.role === 'admin' ? 'user' : 'admin')}
                      className={`text-xs px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                        u.role === 'admin'
                          ? 'bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/30'
                          : 'bg-surface-100 text-surface-500 dark:bg-surface-800 hover:bg-surface-200 dark:hover:bg-surface-700'
                      }`}
                      title={u.role === 'admin' ? 'Click to demote to user' : 'Click to promote to admin'}
                    >
                      {u.role || 'user'}
                    </button>
                    <span className="text-xs text-surface-400">{formatDate(u.createdAt)}</span>
                  </div>
                ))}
                {users.length === 0 && <p className="text-center text-surface-400 py-8">No users found.</p>}
              </div>
            </div>
          )}

          {/* Payments */}
          {tab === 'payments' && (
            <div className="animate-fade-in">
              <div className="space-y-2">
                {payments.map(p => (
                  <div key={p._id} className="card p-4 flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-600 dark:text-emerald-400">
                        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-white">{p.userId?.name || 'Unknown'} — {p.amount} XAF</p>
                      <p className="text-xs text-surface-400">{p.method || 'N/A'} &middot; {p.status}</p>
                    </div>
                    <span className="text-xs text-surface-400">{formatDate(p.createdAt)}</span>
                  </div>
                ))}
                {payments.length === 0 && <p className="text-center text-surface-400 py-8">No payments yet.</p>}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
