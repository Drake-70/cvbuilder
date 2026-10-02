import { useEffect, useRef, useState } from 'react';
import api from '../../services/api';
import { useToast } from '../../contexts/ToastContext';
import { Skeleton } from '../Skeleton';
import AdminPagination from './AdminPagination';

/**
 * The contact inbox.
 *
 * `new -> read -> replied` with `archived` off to the side. The backend owns the
 * rules (`services/contactWorkflow`) and validates every transition, returning a
 * 409 with the allowed set when one is refused; this file mirrors the enum so the
 * UI can offer the four states and mark the current one, rather than trying to
 * re-derive which transitions are legal and drifting from the server.
 *
 * Reopening is allowed from every state, including `replied`. That is not an
 * oversight in the UI: someone who replies and then gets a follow-up has
 * genuinely unread mail, and the server enforces the same rule.
 */

const STATUSES = [
  { value: 'new', label: 'New', badge: 'badge-brand', dot: 'bg-brand-500' },
  { value: 'read', label: 'Read', badge: 'bg-surface-100 text-surface-600 dark:bg-surface-700 dark:text-surface-300', dot: 'bg-surface-400' },
  { value: 'replied', label: 'Replied', badge: 'badge-emerald', dot: 'bg-emerald-500' },
  { value: 'archived', label: 'Archived', badge: 'bg-surface-100 text-surface-400 dark:bg-surface-800 dark:text-surface-500', dot: 'bg-surface-300 dark:bg-surface-600' }
];

const STATUS_BY_VALUE = STATUSES.reduce((acc, s) => ({ ...acc, [s.value]: s }), {});
const PAGE_SIZE = 20;

function formatWhen(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ContactsTab() {
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null);
  const [reply, setReply] = useState('');
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => { setPage(1); }, [filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    api.get('/admin/contacts', {
      params: {
        page,
        limit: PAGE_SIZE,
        status: filter === 'all' ? undefined : filter,
        search: debouncedSearch || undefined
      }
    })
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (!cancelled) {
          toastRef.current.error('Could not load messages', err.response?.data?.error || 'Please try again.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [page, filter, debouncedSearch]);

  // Patching in place rather than refetching: the row is already on screen, and a
  // full reload would collapse the reply box the admin just typed into. The counts
  // are adjusted from the transition that actually happened, so the tab badges and
  // the unread badge stay consistent with the list without a second round trip.
  const move = async (message, nextStatus, replyText) => {
    setBusyId(message._id);
    try {
      const body = { status: nextStatus };
      if (typeof replyText === 'string' && replyText.trim() !== '') body.reply = replyText;

      const res = await api.patch(`/admin/contacts/${message._id}/status`, body);

      const OPEN = ['new', 'read'];
      const wasOpen = OPEN.includes(message.status);
      const isOpen = OPEN.includes(nextStatus);

      setData((prev) => {
        const counts = { ...(prev.counts || {}) };
        counts[message.status] = Math.max(0, (counts[message.status] || 0) - 1);
        counts[nextStatus] = (counts[nextStatus] || 0) + 1;

        return {
          ...prev,
          messages: prev.messages.map((m) => (m._id === message._id ? res.data : m)),
          counts,
          open: wasOpen === isOpen ? prev.open : prev.open + (isOpen ? 1 : -1)
        };
      });

      setReply('');
      toast.success('Message updated', `Moved to ${STATUS_BY_VALUE[nextStatus]?.label.toLowerCase() || nextStatus}.`);
    } catch (err) {
      // A 409 carries the server's reason and the allowed set; showing it beats a
      // generic failure, because the usual cause is two admins moving the same
      // message at once.
      toast.error('Could not update message', err.response?.data?.error || 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const filters = [
    { value: 'all', label: 'All', count: data ? Object.values(data.counts || {}).reduce((a, b) => a + b, 0) : 0 },
    { value: 'new', label: 'New', count: data?.counts?.new },
    { value: 'read', label: 'Read', count: data?.counts?.read },
    { value: 'replied', label: 'Replied', count: data?.counts?.replied },
    { value: 'archived', label: 'Archived', count: data?.counts?.archived }
  ];

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, subject, or message…"
          className="input-field text-sm py-2 flex-1"
          aria-label="Search messages"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => {
          const active = filter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              aria-pressed={active}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                active
                  ? 'bg-brand-600 text-white'
                  : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
              }`}
            >
              {f.label}
              {typeof f.count === 'number' && (
                <span className={`tabular-nums ${active ? 'text-brand-100' : 'text-surface-400'}`}>{f.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className={`space-y-2 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
            {data?.messages?.map((m) => {
              const status = STATUS_BY_VALUE[m.status] || STATUSES[0];
              const isOpen = expanded === m._id;
              const busy = busyId === m._id;

              return (
                <div key={m._id} className={`card overflow-hidden ${m.status === 'new' ? 'border-brand-200 dark:border-brand-800' : ''}`}>
                  <button
                    onClick={() => {
                      setExpanded(isOpen ? null : m._id);
                      setReply('');
                      // Opening an unread message marks it read. Doing this on the
                      // server (not just in local state) is the point: the inbox
                      // count is shared, so a local-only change would under-report
                      // for every other admin.
                      if (!isOpen && m.status === 'new') move(m, 'read');
                    }}
                    className="w-full text-left p-4 cursor-pointer hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-colors"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${status.dot}`} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-surface-900 dark:text-white truncate">{m.subject}</p>
                        <p className="text-xs text-surface-400 truncate">
                          {m.name} &lt;{m.email}&gt;
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`badge ${status.badge}`}>{status.label}</span>
                        <span className="text-xs text-surface-400 whitespace-nowrap">{formatWhen(m.createdAt)}</span>
                      </div>
                    </div>

                    {!isOpen && (
                      <p className="text-xs text-surface-500 dark:text-surface-400 truncate mt-2 pl-5">{m.message}</p>
                    )}
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pl-9 space-y-4 animate-fade-in">
                      <p className="text-sm text-surface-700 dark:text-surface-200 whitespace-pre-wrap leading-relaxed">{m.message}</p>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-surface-400">
                        {m.userId && (
                          <span>From a signed-in account ({m.userId.email || m.userId.name})</span>
                        )}
                        {m.statusChangedBy?.email && (
                          <span>Last moved by {m.statusChangedBy.email}</span>
                        )}
                        {m.repliedAt && (
                          <span>Replied {formatWhen(m.repliedAt)}</span>
                        )}
                      </div>

                      {m.reply && (
                        <div className="rounded-xl bg-surface-50 dark:bg-surface-800 p-3">
                          <p className="text-[11px] uppercase tracking-wide text-surface-400 font-semibold mb-1">Recorded reply</p>
                          <p className="text-sm text-surface-700 dark:text-surface-200 whitespace-pre-wrap">{m.reply}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {STATUSES.map((s) => (
                          <button
                            key={s.value}
                            onClick={() => move(m, s.value)}
                            disabled={busy || s.value === m.status}
                            title={s.value === m.status ? 'Current status' : `Mark as ${s.label.toLowerCase()}`}
                            className={`text-xs px-2.5 py-1 rounded-lg font-medium cursor-pointer transition-colors disabled:cursor-not-allowed ${
                              s.value === m.status
                                ? 'bg-surface-200 text-surface-500 dark:bg-surface-700 dark:text-surface-400 cursor-default'
                                : 'bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700'
                            } disabled:opacity-60`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>

                      <div className="pt-1 border-t border-surface-100 dark:border-surface-700">
                        <label className="block text-[11px] uppercase tracking-wide text-surface-400 font-semibold mb-1.5">
                          Record a reply
                        </label>
                        <textarea
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          rows={3}
                          maxLength={5000}
                          placeholder="Paste the reply you sent, then mark the message replied. Nothing is emailed from here."
                          className="input-field text-sm py-2 resize-y"
                        />
                        <div className="flex items-center justify-between gap-3 mt-2">
                          <p className="text-[11px] text-surface-400">
                            {reply.length > 4500 ? `${5000 - reply.length} characters left` : 'Stored with the message for the record.'}
                          </p>
                          <button
                            onClick={() => move(m, 'replied', reply)}
                            disabled={busy || m.status === 'replied'}
                            className="btn-primary text-xs px-4 py-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Mark replied
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {!loading && data?.messages?.length === 0 && (
              <p className="text-center text-surface-400 py-8 text-sm">
                {debouncedSearch || filter !== 'all'
                  ? 'No messages match this filter.'
                  : 'No contact messages yet.'}
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
    </div>
  );
}