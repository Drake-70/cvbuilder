import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Skeleton } from '../Skeleton';
import AdminPagination from './AdminPagination';
import UserDetailPanel from './UserDetailPanel';

/**
 * User administration.
 *
 * Two things here exist because the backend now guarantees them, and both are
 * worth being explicit about:
 *
 * - `passwordHash` is never returned, so nothing in this file can display it.
 * - The last admin cannot be demoted, and self-demotion is refused outright. The
 *   role control disables itself on your own row rather than letting the server
 *   say no after the click, so the reason is visible before the attempt.
 */
const ROLES = [
  { value: '', label: 'All roles' },
  { value: 'user', label: 'Users' },
  { value: 'admin', label: 'Admins' }
];

const VERIFICATION = [
  { value: '', label: 'Any verification' },
  { value: 'true', label: 'Verified' },
  { value: 'false', label: 'Unverified' }
];

const SUBSCRIPTION = [
  { value: '', label: 'Any plan' },
  { value: 'active', label: 'Pro' },
  { value: 'none', label: 'Free' },
  { value: 'expired', label: 'Expired' }
];

const SUSPENSION = [
  { value: '', label: 'Any status' },
  { value: 'false', label: 'Active' },
  { value: 'true', label: 'Suspended' }
];

const PAGE_SIZE = 20;

export default function UsersTab({ currentUserId }) {
  const { toast } = useToast();

  // Held in a ref so the load effect's dependencies stay stable. `toast` is a new
  // object on every provider render, so depending on it directly would refetch the
  // list after every action that raised a toast — including the toast the list
  // itself raised.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [role, setRole] = useState('');
  const [verified, setVerified] = useState('');
  const [subscription, setSubscription] = useState('');
  const [suspended, setSuspended] = useState('');
  const [page, setPage] = useState(1);
  // Which account is open in the detail panel. Held here rather than in the panel so
  // a row's action can refresh the list underneath it while it stays open.
  const [selected, setSelected] = useState(null);

  // Debounce the query, not the page reset. Requesting page 1 on every keystroke
  // and then typing the next character would fetch a page nobody looks at.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Any other filter change also returns to page 1: page 7 of a filtered set that
  // has three pages shows an empty table, which reads as "no results" rather than
  // "you are past the end".
  useEffect(() => { setPage(1); }, [role, verified, subscription, suspended]);

  // Guarded by a ref rather than a per-effect `cancelled` flag, because the same
  // loader is also called directly by panel actions. The effect owns the lifecycle;
  // `refresh` re-reads the current page without starting a second, competing
  // lifecycle that a filter change would have to know about.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(() => {
    setLoading(true);

    api.get('/admin/users', {
      params: {
        page,
        limit: PAGE_SIZE,
        search: debouncedSearch || undefined,
        role: role || undefined,
        verified: verified || undefined,
        subscription: subscription || undefined,
        suspended: suspended || undefined
      }
    })
      .then((res) => {
        if (mountedRef.current) setData(res.data);
      })
      .catch((err) => {
        if (mountedRef.current) {
          toastRef.current.error('Could not load users', err.response?.data?.error || 'Please try again.');
        }
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
  }, [page, debouncedSearch, role, verified, subscription, suspended]);

  useEffect(() => { load(); }, [load]);

  // Re-reads the list after an action taken from the detail panel. The panel reloads
  // its own copy; this only stops the table underneath it from going stale.
  const refresh = useCallback(() => { load(); }, [load]);

  const changeRole = async (u, nextRole) => {
    setBusyId(u._id);
    try {
      await api.patch(`/admin/users/${u._id}/role`, { role: nextRole });
      setData((prev) => ({
        ...prev,
        users: prev.users.map((row) => (row._id === u._id ? { ...row, role: nextRole } : row))
      }));
      toast.success('Role updated', `${u.email} is now ${nextRole === 'admin' ? 'an admin' : 'a user'}.`);
    } catch (err) {
      // The server's reason, not a generic message: "this is the only admin" and
      // "you cannot demote yourself" are different problems with different fixes.
      toast.error('Could not change role', err.response?.data?.error || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleVerified = async (u) => {
    setBusyId(u._id);
    const next = !u.emailVerified;
    try {
      await api.patch(`/admin/users/${u._id}/verified`, { emailVerified: next });
      setData((prev) => ({
        ...prev,
        users: prev.users.map((row) => (row._id === u._id ? { ...row, emailVerified: next } : row))
      }));
      toast.success(
        next ? 'Marked verified' : 'Marked unverified',
        next
          ? `${u.email} can now reach gated routes.`
          : `${u.email} will be redirected to verify their email.`
      );
    } catch (err) {
      toast.error('Could not update verification', err.response?.data?.error || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const selectClass = 'input-field text-sm py-2 cursor-pointer';

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name or email…"
          className="input-field text-sm py-2"
          aria-label="Search users"
        />
        <select value={role} onChange={(e) => setRole(e.target.value)} className={selectClass} aria-label="Filter by role">
          {ROLES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={verified} onChange={(e) => setVerified(e.target.value)} className={selectClass} aria-label="Filter by verification">
          {VERIFICATION.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={subscription} onChange={(e) => setSubscription(e.target.value)} className={selectClass} aria-label="Filter by plan">
          {SUBSCRIPTION.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select value={suspended} onChange={(e) => setSuspended(e.target.value)} className={selectClass} aria-label="Filter by suspension">
          {SUSPENSION.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card p-4 flex items-center gap-4">
              <Skeleton className="w-8 h-8 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-40" />
                <Skeleton className="h-3 w-56" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={`space-y-2 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {data?.users?.map((u) => {
              const isSelf = u._id === currentUserId;
              const busy = busyId === u._id;
              const selfAdmin = isSelf && u.role === 'admin';

              return (
                <div key={u._id} className="card p-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                  {/* The identity block opens the detail panel, not the whole row: the
                      row contains action buttons, and a clickable ancestor would nest
                      interactive elements. Clicking a name to open that record is the
                      affordance people already reach for. */}
                  <button
                    type="button"
                    onClick={() => setSelected(u)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer group rounded-lg -m-1 p-1 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors"
                    title={`Open account details for ${u.email}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 text-xs font-semibold flex-shrink-0">
                      {u.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-surface-900 dark:text-white truncate group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                        {u.name}
                        {isSelf && <span className="text-xs text-surface-400 font-normal"> · you</span>}
                      </p>
                      <p className="text-xs text-surface-400 truncate">{u.email}</p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {u.suspended && (
                      <span className="badge badge-rose" title="Cannot sign in until reinstated">
                        Suspended
                      </span>
                    )}
                    {!u.emailVerified && (
                      <span className="badge badge-amber" title="Cannot reach gated routes until verified">
                        Unverified
                      </span>
                    )}
                    <span className={`badge ${u.subscriptionStatus === 'active' ? 'badge-emerald' : 'badge-brand'}`}>
                      {u.subscriptionStatus === 'active' ? 'Pro' : 'Free'}
                    </span>
                  </div>

                  <span className="text-xs text-surface-400 tabular-nums">
                    {new Date(u.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setSelected(u)}
                      className="text-xs px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600"
                      title="Open account details"
                    >
                      Details
                    </button>

                    <button
                      onClick={() => toggleVerified(u)}
                      disabled={busy}
                      title={u.emailVerified
                        ? 'Mark unverified — locks gated routes'
                        : 'Mark verified without sending mail'}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                        u.emailVerified
                          ? 'text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
                          : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600'
                      }`}
                    >
                      {u.emailVerified ? 'Verified' : 'Verify'}
                    </button>

                    <button
                      onClick={() => changeRole(u, u.role === 'admin' ? 'user' : 'admin')}
                      disabled={busy || selfAdmin}
                      title={selfAdmin
                        ? 'You cannot demote your own account'
                        : (u.role === 'admin' ? 'Demote to user' : 'Promote to admin')}
                      className={`text-xs px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                        u.role === 'admin'
                          ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/30'
                          : 'bg-surface-100 text-surface-500 hover:bg-surface-200 dark:bg-surface-800 dark:hover:bg-surface-700'
                      }`}
                    >
                      {u.role || 'user'}
                    </button>
                  </div>
                </div>
              );
            })}

            {!loading && data?.users?.length === 0 && (
              <p className="text-center text-surface-400 py-8 text-sm">
                No users match these filters.
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

      {selected && (
        <UserDetailPanel
          user={selected}
          currentUserId={currentUserId}
          onClose={() => setSelected(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}