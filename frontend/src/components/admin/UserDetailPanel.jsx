import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '../../contexts/ToastContext';
import api from '../../services/api';
import { Skeleton } from '../Skeleton';
import ConfirmDialog from '../ConfirmDialog';

/**
 * Per-user 360: everything the app knows about one account, plus the actions that
 * change it.
 *
 * This panel is deliberately the only place the destructive actions live. Putting
 * "erase account" next to a row in a list makes it one mis-click from the table
 * everyone scans daily; giving it a panel means reaching it is a deliberate act.
 *
 * Two categories of guardrail, applied here as well as server-side:
 *
 * - Your own row cannot be suspended or erased from this panel. The server refuses it
 *   too, but disabling the control explains the reason before the attempt instead of
 *   letting the request fail.
 * - Everything irreversible is confirmed, and the reason is required for suspension
 *   because the server refuses a suspension with no reason: it is shown to the user.
 *
 * `lastActiveAt` is a throttled approximation by construction, so it is labelled as
 * one wherever it appears rather than sitting beside `lastLoginAt` where it would
 * read as an equally exact timestamp.
 */
export default function UserDetailPanel({ user, currentUserId, onClose, onChanged }) {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [creditDelta, setCreditDelta] = useState('');
  const [resetLink, setResetLink] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const isSelf = user?._id === currentUserId;

  const load = useCallback(async () => {
    if (!user?._id) return;
    setLoading(true);
    try {
      const res = await api.get(`/admin/users/${user._id}`);
      setData(res.data);
    } catch (err) {
      toastRef.current.error('Could not load this account', err.response?.data?.error || 'Please try again.');
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useEffect(() => { load(); }, [load]);

  // Escape closes the panel, and never while a request is in flight: closing would
  // drop a half-complete suspension and the admin would have no idea it failed.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy && !confirm) onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, confirm, onClose]);

  const run = useCallback(async (key, request, successTitle, successMessage) => {
    setBusy(true);
    setAction(key);
    try {
      const res = await request();
      // `toastRef`, not `toast`: the context hands out a new object on every render,
      // so putting it in the dependency array would rebuild this callback after every
      // toast — including the ones this callback raises.
      toastRef.current.success(successTitle, successMessage);
      await load();
      onChanged?.();
      return res;
    } catch (err) {
      // The server's own reason: "this is the only admin" and "you cannot do this to
      // yourself" are different problems with different fixes, and a generic message
      // hides which one happened.
      toastRef.current.error('Action failed', err.response?.data?.error || 'Please try again.');
      return null;
    } finally {
      setBusy(false);
      setAction(null);
      setReason('');
      setCreditDelta('');
    }
  }, [load, onChanged]);

  const toggleSuspend = () => {
    const next = !data?.user?.suspended;
    if (next && !reason.trim()) {
      toast.error('A reason is required', 'It is shown to the user, so it cannot be empty.');
      return;
    }
    run(
      'suspend',
      () => api.patch(`/admin/users/${user._id}/suspended`, { suspended: next, reason: reason.trim() }),
      next ? 'Account suspended' : 'Account reinstated',
      next
        ? `${user.email} is signed out on their next request.`
        : `${user.email} can sign in again.`
    );
  };

  const forceLogout = () => run(
    'logout',
    () => api.post(`/admin/users/${user._id}/force-logout`),
    'Sessions ended',
    `${user.email} must log in again on their next request.`
  );

  const issueReset = async () => {
    const result = await run(
      'reset',
      () => api.post(`/admin/users/${user._id}/password-reset`),
      'Reset link issued',
      'Valid for one hour. It is not emailed.'
    );
    if (result?.data?.resetUrl) setResetLink(result.data.resetUrl);
  };

  const adjustCredits = async () => {
    const amount = Number.parseInt(creditDelta, 10);
    if (!Number.isInteger(amount)) {
      toast.error('Enter a whole number', 'A credit change is a delta, not an absolute total.');
      return;
    }
    const applied = await run(
      'credits',
      () => api.patch(`/admin/users/${user._id}/credits`, { delta: amount, reason: reason.trim() }),
      'Credits updated',
      `${user.email}'s balance was adjusted by ${amount > 0 ? '+' : ''}${amount}.`
    );
    return applied;
  };

  const setSubscription = (next) => run(
    'subscription',
    () => api.patch(`/admin/users/${user._id}/subscription`, { subscriptionStatus: next, reason: reason.trim() }),
    'Subscription updated',
    `${user.email} is now ${next === 'active' ? 'Pro' : next === 'expired' ? 'expired' : 'free'}.`
  );

  const erase = () => run(
    'erase',
    () => api.delete(`/admin/users/${user._id}`),
    'Account erased',
    'Personal data removed. Payment records were kept for the ledger.'
  );

  const copyResetLink = async () => {
    try {
      await navigator.clipboard.writeText(resetLink);
      toast.success('Link copied', 'It is a credential — treat it like one.');
    } catch {
      // Clipboard access is denied in some contexts; the link is still on screen and
      // selectable, so this is a convenience failure rather than a blocker.
      toast.error('Could not copy', 'Select the link and copy it manually.');
    }
  };

  const field = data?.user;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-surface-900/40 backdrop-blur-sm animate-fade-in"
        onClick={() => !busy && onClose?.()}
        aria-hidden="true"
      />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Account details for ${user?.email || 'user'}`}
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-surface-0 dark:bg-surface-800 shadow-2xl overflow-y-auto animate-fade-in"
      >
        <header className="sticky top-0 z-10 bg-surface-0 dark:bg-surface-800 border-b border-surface-100 dark:border-surface-700 px-5 py-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-brand-100 dark:bg-brand-900/30 flex items-center justify-center text-brand-600 dark:text-brand-400 font-semibold flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || '?'}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">
              {user?.name}
              {isSelf && <span className="text-xs text-surface-400 font-normal"> &middot; you</span>}
            </p>
            <p className="text-xs text-surface-400 truncate">{user?.email}</p>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {field?.suspended && <span className="badge badge-rose">Suspended</span>}
              {field && !field.emailVerified && <span className="badge badge-amber">Unverified</span>}
              <span className={`badge ${field?.role === 'admin' ? 'badge-brand' : 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-300'}`}>
                {field?.role === 'admin' ? 'Admin' : 'User'}
              </span>
              <span className={`badge ${field?.subscriptionStatus === 'active' ? 'badge-emerald' : 'bg-surface-100 text-surface-500 dark:bg-surface-700 dark:text-surface-300'}`}>
                {field?.subscriptionStatus === 'active' ? 'Pro' : field?.subscriptionStatus === 'expired' ? 'Expired' : 'Free'}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
            className="text-surface-400 hover:text-surface-600 dark:hover:text-surface-200 cursor-pointer p-1 disabled:opacity-50"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </header>

        {loading && !field ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : field && (
          <div className="p-5 space-y-6">
            {field.suspended && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-900/50 bg-rose-50 dark:bg-rose-900/20 p-4">
                <p className="text-sm font-semibold text-rose-600 dark:text-rose-400">This account is suspended</p>
                <p className="text-xs text-rose-600/80 dark:text-rose-400/80 mt-1">
                  {field.suspendedReason || 'No reason recorded.'}
                </p>
                <p className="text-[11px] text-surface-500 dark:text-surface-400 mt-2">
                  Since {field.suspendedAt ? new Date(field.suspendedAt).toLocaleString() : 'an unknown time'}.
                  The suspension reason is shown to the user.
                </p>
              </div>
            )}

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-2">Activity</h4>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-surface-500 dark:text-surface-400">Last login</dt>
                  <dd className="text-surface-900 dark:text-white tabular-nums">
                    {data?.activity?.lastLoginAt ? new Date(data.activity.lastLoginAt).toLocaleString() : '\u2014'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-surface-500 dark:text-surface-400">Last active</dt>
                  <dd className="text-surface-900 dark:text-white tabular-nums">
                    {data?.activity?.lastActiveAt ? new Date(data.activity.lastActiveAt).toLocaleString() : '\u2014'}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-surface-500 dark:text-surface-400">Joined</dt>
                  <dd className="text-surface-900 dark:text-white tabular-nums">
                    {new Date(field.createdAt).toLocaleDateString()}
                  </dd>
                </div>
              </dl>
              <p className="text-[11px] text-surface-400 mt-2">
                Last login is exact. Last active is stamped at most once every five
                minutes, so it means &ldquo;seen recently&rdquo;, not a session count.
              </p>
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-2">Usage</h4>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Documents" value={data?.counts?.documents} />
                <Stat label="Saved CVs" value={data?.counts?.cvs} />
                <Stat label="Tracked applications" value={data?.counts?.applications} />
                <Stat label="Users referred" value={data?.counts?.referredUsers} />
              </div>

              <dl className="mt-3 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <dt className="text-surface-500 dark:text-surface-400">Free credits</dt>
                  <dd className="text-surface-900 dark:text-white tabular-nums">{field.freeDocumentCredits ?? 0}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-surface-500 dark:text-surface-400">Successful payments</dt>
                  <dd className="text-surface-900 dark:text-white tabular-nums">
                    {data?.payments?.successful?.count ?? 0} &middot;{' '}
                    {(data?.payments?.successful?.total ?? 0).toLocaleString()} XAF
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-surface-500 dark:text-surface-400">Referral code</dt>
                  <dd className="text-surface-900 dark:text-white font-mono">{data?.counts?.referralCode || '\u2014'}</dd>
                </div>
              </dl>

              {/* The counter and the stored documents are read from different places,
                  so they can disagree. Saying so is more useful than quietly showing
                  one and letting a support question go unanswered. */}
              {data?.counts && !data.counts.counterMatchesStoredDocuments && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                  The stored counter reads {data.counts.documentsGeneratedCount} but{' '}
                  {data.counts.documents} document(s) exist. These have drifted.
                </p>
              )}
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-2">
                Recent documents
              </h4>
              {!data?.recent?.documents?.length ? (
                <p className="text-xs text-surface-400">No documents yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.recent.documents.map((doc) => (
                    <li key={doc._id} className="flex items-baseline justify-between gap-3 text-xs py-1">
                      <span className="text-surface-700 dark:text-surface-200 truncate">
                        {doc.jobTitle || 'Untitled document'}
                      </span>
                      <span className="text-surface-400 tabular-nums flex-shrink-0">
                        {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-2">
                Admin history
              </h4>
              {!data?.audit?.length ? (
                <p className="text-xs text-surface-400">No admin actions recorded for this account.</p>
              ) : (
                <ul className="space-y-2">
                  {data.audit.map((entry) => (
                    <li key={entry._id} className="text-xs py-1.5 border-b border-surface-100 dark:border-surface-700 last:border-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-surface-700 dark:text-surface-200 font-medium">
                          {entry.action.replace('user.', '')}
                        </span>
                        <span className="text-surface-400 tabular-nums">
                          {new Date(entry.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-surface-400 mt-0.5">
                        by {entry.adminEmail}
                        {entry.reason ? ` \u2014 ${entry.reason}` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="border-t border-surface-100 dark:border-surface-700 pt-5">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-surface-400 mb-3">Actions</h4>

              {resetLink && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 p-3 mb-3">
                  <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                    Reset link — valid one hour
                  </p>
                  <p className="text-[11px] text-surface-500 dark:text-surface-400 mt-1">
                    This link is a credential. It is not emailed; send it yourself over a
                    channel you trust.
                  </p>
                  <code className="block text-[11px] text-surface-600 dark:text-surface-300 break-all mt-2 select-all">
                    {resetLink}
                  </code>
                  <div className="flex gap-2 mt-2">
                    <button onClick={copyResetLink} className="btn-secondary text-xs cursor-pointer">
                      Copy link
                    </button>
                    <button onClick={() => setResetLink(null)} className="btn-ghost text-xs cursor-pointer">
                      Dismiss
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <ActionButton
                  disabled={busy || isSelf}
                  title={isSelf ? 'You cannot suspend your own account' : undefined}
                  onClick={() => (data.user.suspended ? toggleSuspend() : setAction('suspend-reason'))}
                  busy={busy && action === 'suspend'}
                  tone={data.user.suspended ? 'quiet' : 'danger'}
                >
                  {data.user.suspended ? 'Reinstate' : 'Suspend'}
                </ActionButton>

                <ActionButton
                  disabled={busy}
                  onClick={forceLogout}
                  busy={busy && action === 'logout'}
                  tone="quiet"
                >
                  End sessions
                </ActionButton>

                <ActionButton
                  disabled={busy}
                  onClick={issueReset}
                  busy={busy && action === 'reset'}
                  tone="quiet"
                >
                  Reset password
                </ActionButton>

                <ActionButton
                  disabled={busy || isSelf}
                  title={isSelf ? 'You cannot erase your own account' : undefined}
                  onClick={() => setConfirm({
                    title: 'Erase this account?',
                    message: `This removes personal data for ${user.email}, including their documents and CVs. Payment records are kept for the ledger. This cannot be undone.`,
                    confirmLabel: 'Erase account',
                    onConfirm: () => { setConfirm(null); erase(); }
                  })}
                  tone="danger"
                >
                  Erase account
                </ActionButton>
              </div>

              {/* Suspension needs a reason, and asking for it in the moment is better
                  than a single confirm box an admin clicks through and later cannot
                  explain. */}
              {action === 'suspend-reason' && (
                <div className="mt-3 rounded-xl border border-surface-200 dark:border-surface-700 p-3 space-y-2">
                  <label className="text-xs font-medium text-surface-700 dark:text-surface-200" htmlFor="suspend-reason">
                    Reason (shown to the user)
                  </label>
                  <textarea
                    id="suspend-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="e.g. Reported payment abuse — tickets #4471"
                    className="input-field text-xs w-full resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setAction(null); setReason(''); }}
                      className="btn-ghost text-xs cursor-pointer"
                      disabled={busy}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={toggleSuspend}
                      disabled={busy || !reason.trim()}
                      className="text-xs px-4 py-2 rounded-xl font-medium text-white bg-rose-600 hover:bg-rose-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Suspend account
                    </button>
                  </div>
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step={1}
                    value={creditDelta}
                    onChange={(e) => setCreditDelta(e.target.value)}
                    placeholder="Credit delta, e.g. 3"
                    className="input-field text-xs py-2 flex-1"
                    aria-label="Credit delta"
                    disabled={busy}
                  />
                  <button
                    onClick={adjustCredits}
                    disabled={busy || creditDelta === ''}
                    className="btn-secondary text-xs cursor-pointer disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-surface-400 flex-shrink-0">Plan</span>
                  <div className="flex gap-1.5 flex-1">
                    {['none', 'active', 'expired'].map((status) => (
                      <button
                        key={status}
                        onClick={() => setSubscription(status)}
                        disabled={busy || data.user.subscriptionStatus === status}
                        className={`text-xs px-2.5 py-1.5 rounded-lg font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                          data.user.subscriptionStatus === status
                            ? 'bg-brand-600 text-white'
                            : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600'
                        }`}
                      >
                        {status === 'none' ? 'Free' : status === 'active' ? 'Pro' : 'Expired'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-surface-400 mt-4 leading-relaxed">
                Every action here is recorded against your account in the admin history
                above, together with what you asked for and what the database held.
              </p>
            </section>
          </div>
        )}
      </aside>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        loading={busy}
        onConfirm={confirm?.onConfirm}
        onCancel={() => setConfirm(null)}
      />
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-surface-50 dark:bg-surface-700/50 px-3 py-2">
      <p className="text-lg font-bold tabular-nums text-surface-900 dark:text-white">
        {typeof value === 'number' ? value.toLocaleString() : '\u2014'}
      </p>
      <p className="text-[11px] text-surface-400">{label}</p>
    </div>
  );
}

function ActionButton({ children, onClick, disabled, title, busy, tone = 'quiet' }) {
  const tones = {
    quiet: 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-700 dark:text-surface-200 dark:hover:bg-surface-600',
    danger: 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/30'
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      className={`text-xs px-3 py-2 rounded-lg font-medium cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${tones[tone]}`}
    >
      {busy ? 'Working\u2026' : children}
    </button>
  );
}